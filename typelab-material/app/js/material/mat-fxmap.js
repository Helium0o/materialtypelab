// TypeLab Material — Effect maps: TypeLab's effects, filters, dither, blends, masks, layers, patterns and materials
// wired together as a node map (edited in the Material tab, used as one "Effect map" entry in any effect stack).
//
//   doc.materials entry with kind: 'effect'  →  { id, name, kind: 'effect', nodes, links }
//   a layer / Whole image effect             →  { type: 'effectmap', p: { map: '<id>' } }
//
// Values are document-size canvases at the current render scale (not tiles). Ports: 'color' = image (premultiplied
// canvas), 'gray' = mask (opaque gray canvas; an image plugged into a mask input becomes luminance × alpha).
// Every TL.fx effect / filter becomes a node automatically (one generic wrapper around TL.fx.apply), each with an
// optional Mask input that limits it. Results are cached by a hash of everything upstream; the Input node's hash
// comes from the caller (Material tab preview) — inside a normal render it is unknown, so only branches that do not
// depend on the input are reused there (TypeLab's own layer cache already skips unchanged layers).
(function (TL) {
  const U = TL.util;
  const M = TL.mat;
  const FX = TL.fx, R = TL.render, PT = TL.patterns;
  const FE = (M.fx = { depth: 0, budget: 320 * 1024 * 1024, bytes: 0 });

  // ================================================================= canvas helpers
  const blank = (W, H) => U.canvas(W, H);
  const clone = (c) => U.cloneCanvas(c);
  const grayCache = new WeakMap(), alphaCache = new WeakMap();
  // image → opaque gray mask (luminance × alpha); masks pass through
  FE.gray = (c) => {
    if (!c || c.__gray) return c;
    if (grayCache.has(c)) return grayCache.get(c);
    const W = c.width, H = c.height, src = c.getContext('2d').getImageData(0, 0, W, H).data;
    const o = U.canvas(W, H), x = o.getContext('2d'), id = x.createImageData(W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) * src[i + 3] / 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    x.putImageData(id, 0, 0);
    o.__gray = true;
    grayCache.set(c, o);
    return o;
  };
  // mask → white with alpha = mask (for destination-in / -out compositing)
  FE.alpha = (m) => {
    if (alphaCache.has(m)) return alphaCache.get(m);
    const W = m.width, H = m.height, src = m.getContext('2d').getImageData(0, 0, W, H).data;
    const o = U.canvas(W, H), x = o.getContext('2d'), id = x.createImageData(W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = src[i]; }
    x.putImageData(id, 0, 0);
    alphaCache.set(m, o);
    return o;
  };
  const grayFrom = (W, H, fn) => {
    const o = U.canvas(W, H), x = o.getContext('2d'), id = x.createImageData(W, H), d = id.data;
    fn(d); x.putImageData(id, 0, 0); o.__gray = true; return o;
  };
  // A where the mask is 0, B where it is 1 (exact lerp in premultiplied space)
  FE.lerp = (A, B, mask) => {
    const W = (A || B).width, H = (A || B).height;
    const o = blank(W, H), x = o.getContext('2d');
    const al = FE.alpha(mask);
    if (A) { x.drawImage(A, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(al, 0, 0); }
    if (B) { const t = clone(B), tx = t.getContext('2d'); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(al, 0, 0); x.globalCompositeOperation = 'lighter'; x.drawImage(t, 0, 0); }
    x.globalCompositeOperation = 'source-over';
    return o;
  };
  const NATIVE = (() => { const x = U.canvas(1, 1).getContext('2d'); return (mode) => { x.globalCompositeOperation = 'source-over'; x.globalCompositeOperation = mode; return x.globalCompositeOperation === mode; }; })();

  // ================================================================= engine
  const cache = new Map(); // nodeId:out:WxH → {sig, c}
  const bytes = (c) => (c ? c.width * c.height * 4 : 0);
  const store = (k, sig, c) => {
    const old = cache.get(k); if (old) { FE.bytes -= bytes(old.c); cache.delete(k); }
    cache.set(k, { sig, c }); FE.bytes += bytes(c);
    while (FE.bytes > FE.budget && cache.size > 1) { const [k0, v] = cache.entries().next().value; cache.delete(k0); FE.bytes -= bytes(v.c); }
  };
  FE.clear = () => { cache.clear(); FE.bytes = 0; };
  const ctxKey = (ctx) => ctx.W + 'x' + ctx.H + '@' + ctx.scale + '|' + [ctx.bounds.x, ctx.bounds.y, ctx.bounds.w, ctx.bounds.h].map((v) => Math.round(v)).join(',');
  // signature of a node output: null = depends on an input whose content is unknown (don't reuse across runs)
  const sigOf = (map, n, out, ctx) => {
    const mk = n.id + ':' + out;
    if (ctx.sigs.has(mk)) return ctx.sigs.get(mk);
    const d = M.get(n.type);
    let s = null;
    if (d) {
      s = n.type + '|' + out + '|' + JSON.stringify(n.p) + '|' + n.seed + '|' + ctxKey(ctx);
      if (d.isInput) s = ctx.sig == null ? null : s + '|in:' + ctx.sig;
      if (s != null && d.sourceSig) { try { s += '|src:' + d.sourceSig(n, ctx); } catch (e) { s = null; } }
      if (s != null) for (let i = 0; i < d.inputs.length; i++) {
        const l = M.inLink(map, n.id, i), up = l && M.node(map, l.from);
        const us = up ? sigOf(map, up, l.out, ctx) : '-';
        if (us == null) { s = null; break; }
        s += '|' + us;
      }
    }
    const h = s == null ? null : M.hash(s);
    ctx.sigs.set(mk, h);
    return h;
  };
  FE.eval = (map, n, out, ctx) => {
    const mk = n.id + ':' + out;
    if (ctx.memo.has(mk)) return ctx.memo.get(mk);
    const d = M.get(n.type);
    if (!d || d.kind !== 'effect') { ctx.memo.set(mk, null); return null; }
    const sig = sigOf(map, n, out, ctx);
    const ck = mk + ':' + ctx.W + 'x' + ctx.H;
    const hit = cache.get(ck);
    if (sig && hit && hit.sig === sig) { ctx.memo.set(mk, hit.c); return hit.c; }
    const ins = d.inputs.map((inp, i) => {
      const l = M.inLink(map, n.id, i), up = l && M.node(map, l.from);
      let c = up ? FE.eval(map, up, l.out, ctx) : null;
      if (c && inp.type === 'gray') c = FE.gray(c);
      return c;
    });
    let r = null;
    try { r = d.run(ctx, n, ins, out); FE.errors.delete(n.id); }
    catch (e) { console.error('Effect map node failed:', n.type, e); FE.errors.set(n.id, String(e.message || e)); r = ins[0] || null; }
    if (r && d.outputs[out] && d.outputs[out].type === 'gray') r = FE.gray(r);
    ctx.memo.set(mk, r);
    if (sig && r) store(ck, sig, r);
    return r;
  };
  FE.errors = new Map();
  // ctx: { input, scale, bounds:{x,y,w,h} (document units), sig (string | null) }
  FE.newCtx = (o) => {
    const W = o.input ? o.input.width : Math.round(TL.doc.width * o.scale), H = o.input ? o.input.height : Math.round(TL.doc.height * o.scale);
    return Object.assign({ W, H, bounds: { x: 0, y: 0, w: TL.doc.width, h: TL.doc.height }, sig: null }, o, { W, H, memo: new Map(), sigs: new Map() });
  };
  FE.run = (map, ctx) => {
    const outN = M.output(map);
    if (!outN) return ctx.input;
    const l = M.inLink(map, outN.id, 0), up = l && M.node(map, l.from);
    FE.depth++;
    try { return (up && FE.eval(map, up, l.out, ctx)) || ctx.input; } finally { FE.depth--; }
  };
  FE.evalNode = (map, nodeId, out, ctx) => {
    const n = M.node(map, nodeId);
    if (!n) return null;
    FE.depth++;
    try { return FE.eval(map, n, out, ctx); } finally { FE.depth--; }
  };

  // ================================================================= node definitions
  const def = (d) => M.def(Object.assign({ kind: 'effect' }, d));
  const img = (k, label) => ({ k, label, type: 'color', def: [0, 0, 0, 0] });
  const msk = (k, label, dv = 1) => ({ k, label, type: 'gray', def: dv });
  const oImg = (k = 'out', label = 'Image') => ({ k, label, type: 'color', expr: '' });
  const oMsk = (k = 'out', label = 'Mask') => ({ k, label, type: 'gray', expr: '' });
  const F = (k, label, min, max, dv, step) => ({ k, label, min, max, def: dv, step: step != null ? step : (max - min > 20 ? 1 : 0.01) });
  const SEL = (k, label, options, dv = 0, labels) => (labels ? { k, label, type: 'select', options, optionLabels: labels, def: dv } : { k, label, type: 'select', options, def: dv });
  const B = (k, label, dv) => ({ k, label, type: 'bool', def: !!dv });
  const C = (k, label, dv) => ({ k, label, type: 'color', def: dv });
  ['In / out', 'Combine', 'Masks', 'Sources', 'Generators (tiled)', 'Transform'].forEach((c) => { if (!M.CATS.includes(c)) M.CATS.push(c); });

  // ---------------------------------------------------------------- in / out
  def({ id: 'fxin', name: 'Input', cat: 'In / out', isInput: true, help: 'The image arriving at this effect: the layer (with the effects above this one), or the whole image',
    outputs: [oImg('out', 'Image')], run: (ctx) => ctx.input });
  def({ id: 'fxout', name: 'Output', cat: 'In / out', isOutput: true, help: 'Whatever arrives here is the result of the effect map',
    inputs: [img('in', 'Image')], outputs: [] });

  // ---------------------------------------------------------------- every TypeLab effect / filter
  const SKIP = new Set(['effectmap']);
  const fxCat = (f) => (f.family ? f.family : 'Effects · ' + f.cat);
  FE.fxNodes = () => {
    FX.list.filter((f) => !f.hidden && !SKIP.has(f.id) && !M.get('fx:' + f.id)).forEach((f) => def({
      id: 'fx:' + f.id, name: f.name, cat: fxCat(f), help: (f.help || f.name) + ' · optional Mask input limits it to an area',
      inputs: [img('in', 'Image'), msk('mask', 'Mask (optional)', 1)],
      outputs: [oImg('out', 'Image')],
      params: f.params.map((q) => Object.assign({}, q)).concat([F('__mix', 'Mix', 0, 1, 1)]),
      inline: f.params.filter((q) => q.min != null && !q.adv && !q.when).slice(0, 2).map((q) => q.k),
      run: (ctx, n, [src, mask]) => {
        if (!src) return null;
        const e = TL.make.effect(f.id);
        Object.assign(e.p, n.p); delete e.p.__mix;
        e.mix = n.p.__mix != null ? n.p.__mix : 1;
        const out = FX.apply(src, [e], { scale: ctx.scale, bounds: ctx.bounds });
        return mask ? FE.lerp(src, out, mask) : out;
      },
    }));
  };
  FE.fxNodes();

  // ---------------------------------------------------------------- dither
  const D = TL.dither;
  if (D) def({ id: 'fxdither', name: 'Dither', cat: 'Effects · Stylize', help: 'Any of TypeLab’s dither styles with a palette (the Dither workspace has every detail)',
    inputs: [img('in', 'Image'), msk('mask', 'Mask (optional)', 1)], outputs: [oImg('out', 'Image')],
    params: [SEL('style', 'Style', D.styles.filter((s) => s.id !== 'ascii').map((s) => s.id), 'atkinson', D.styles.filter((s) => s.id !== 'ascii').map((s) => s.name)),
      F('pixel', 'Pixel size', 1, 32, 2, 1), { k: 'palette', label: 'Palette', type: 'palette', def: 'gray1', noUniform: true }, F('strength', 'Strength', 0, 1.5, 1), F('cell', 'Cell (patterns)', 2, 40, 6, 1), B('aware', 'Content-aware', false)],
    inline: ['pixel'],
    run: (ctx, n, [src, mask]) => {
      if (!src) return null;
      const S = Object.assign(D.defaults(), { style: n.p.style, pixel: n.p.pixel, strength: n.p.strength, cell: n.p.cell, aware: !!n.p.aware, paletteId: n.p.palette });
      const pal = TL.pal && TL.pal.get(n.p.palette);
      if (pal && pal.colors && pal.colors.length) S.colors = pal.colors.slice();
      const out = D.apply(clone(src), S, ctx.scale);
      return mask ? FE.lerp(src, out, mask) : out;
    } });

  // ---------------------------------------------------------------- combine
  const BL = R ? R.BLENDS : [['source-over', 'Normal']];
  def({ id: 'fxblend', name: 'Blend', cat: 'Combine', help: 'B over A with any of the 27 blend modes, opacity and an optional mask',
    inputs: [img('a', 'A (bottom)'), img('b', 'B (top)'), msk('mask', 'Mask (optional)', 1)], outputs: [oImg()],
    params: [SEL('mode', 'Mode', BL.map((b) => b[0]), 'source-over', BL.map((b) => b[1])), F('opacity', 'Opacity', 0, 1, 1)],
    inline: ['mode', 'opacity'],
    run: (ctx, n, [A, Bc, mask]) => {
      const o = A ? clone(A) : blank(ctx.W, ctx.H);
      if (!Bc) return o;
      let top = Bc;
      if (mask) { top = clone(Bc); const tx = top.getContext('2d'); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(FE.alpha(mask), 0, 0); }
      const mode = n.p.mode || 'source-over', x = o.getContext('2d');
      if (NATIVE(mode)) { x.globalAlpha = n.p.opacity; x.globalCompositeOperation = mode; x.drawImage(top, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
      else R.glBlend(o, top, mode, n.p.opacity, ctx.scale);
      return o;
    } });
  def({ id: 'fxmix', name: 'Mix by mask', cat: 'Combine', help: 'A where the mask is black, B where it is white',
    inputs: [img('a', 'A'), img('b', 'B'), msk('mask', 'Mask', 0.5)], outputs: [oImg()],
    run: (ctx, n, [A, Bc, mask]) => FE.lerp(A, Bc, mask || grayFrom(ctx.W, ctx.H, (d) => { for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 128; d[i + 3] = 255; } })) });
  def({ id: 'fxcutout', name: 'Cut out by mask', cat: 'Combine', help: 'Keeps the image only where the mask is white (multiplies its alpha)',
    inputs: [img('in', 'Image'), msk('mask', 'Mask', 1)], outputs: [oImg()],
    run: (ctx, n, [src, mask]) => { if (!src) return null; if (!mask) return src; const o = clone(src), x = o.getContext('2d'); x.globalCompositeOperation = 'destination-in'; x.drawImage(FE.alpha(mask), 0, 0); return o; } });

  // ---------------------------------------------------------------- masks
  def({ id: 'fxmask', name: 'Mask from image', cat: 'Masks', help: 'Turns an image into a mask: its alpha (shape), brightness, or one channel',
    inputs: [img('in', 'Image')], outputs: [oMsk()],
    params: [SEL('mode', 'From', ['Alpha (shape)', 'Luminance', 'Luminance × alpha', 'Red', 'Green', 'Blue'], 0), F('low', 'Black point', 0, 1, 0), F('high', 'White point', 0, 1, 1), B('invert', 'Invert', false)],
    inline: ['mode'],
    run: (ctx, n, [src]) => {
      if (!src) return null;
      const s = src.getContext('2d').getImageData(0, 0, src.width, src.height).data, m = n.p.mode | 0, lo = n.p.low, hi = Math.max(n.p.high, lo + 1e-3), inv = !!n.p.invert;
      return grayFrom(src.width, src.height, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const a = s[i + 3] / 255, un = a > 0 ? 1 / a : 0;
          const lum = (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) / 255;
          let v = m === 0 ? a : m === 1 ? lum * un * (a > 0 ? 1 : 0) : m === 2 ? lum : (s[i + m - 3] / 255) * un;
          v = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
          if (inv) v = 1 - v;
          d[i] = d[i + 1] = d[i + 2] = v * 255; d[i + 3] = 255;
        }
      });
    } });
  def({ id: 'fxmaskadj', name: 'Mask adjust', cat: 'Masks', help: 'Levels / invert / threshold for a mask (blur, grow and shrink it with Blur, Maximum, Minimum)',
    inputs: [msk('in', 'Mask', 0)], outputs: [oMsk()],
    params: [F('low', 'Black point', 0, 1, 0), F('high', 'White point', 0, 1, 1), F('gamma', 'Gamma', 0.1, 5, 1), B('invert', 'Invert', false)],
    run: (ctx, n, [m]) => {
      if (!m) return null;
      const s = m.getContext('2d').getImageData(0, 0, m.width, m.height).data, lo = n.p.low, hi = Math.max(n.p.high, lo + 1e-3), g = 1 / n.p.gamma, inv = !!n.p.invert;
      return grayFrom(m.width, m.height, (d) => { for (let i = 0; i < d.length; i += 4) { let v = Math.pow(Math.min(1, Math.max(0, (s[i] / 255 - lo) / (hi - lo))), g); if (inv) v = 1 - v; d[i] = d[i + 1] = d[i + 2] = v * 255; d[i + 3] = 255; } });
    } });

  // ---------------------------------------------------------------- sources (document size, aligned with the page)
  def({ id: 'fxcolor', name: 'Solid colour', cat: 'Sources', outputs: [oImg()], params: [C('color', 'Colour', '#ff2a6d'), F('alpha', 'Opacity', 0, 1, 1)],
    run: (ctx, n) => { const o = blank(ctx.W, ctx.H), x = o.getContext('2d'); x.globalAlpha = n.p.alpha; x.fillStyle = n.p.color; x.fillRect(0, 0, ctx.W, ctx.H); return o; } });
  def({ id: 'fxlayer', name: 'Layer', cat: 'Sources', help: 'Another layer of the document, where it sits on the page',
    params: [{ k: 'layer', label: 'Layer', type: 'layer', def: '' }, B('effects', 'With its effects', true)], outputs: [oImg()],
    sourceSig: (n, ctx) => { const L = TL.layer(n.p.layer); return L ? R.key(n.p.effects ? L : Object.assign({}, L, { effects: [] }), ctx.scale) : 'none'; },
    run: (ctx, n) => { const L = TL.layer(n.p.layer); if (!L) return null; return R.layer(n.p.effects ? L : Object.assign({}, L, { effects: [] }), ctx.scale, false); } });
  def({ id: 'fxdoc', name: 'Document', cat: 'Sources', help: 'The whole document (effect maps inside it pass through, so nothing loops)',
    params: [B('finish', 'With whole-image effects', false)], outputs: [oImg()],
    sourceSig: (n, ctx) => M.hash(JSON.stringify([TL.doc.layers, n.p.finish ? TL.doc.finish : 0, TL.doc.bg, TL.doc.transparent, ctx.scale])),
    run: (ctx, n) => R.composite(ctx.scale, { useCache: true, noFinish: !n.p.finish }) });
  def({ id: 'fxpattern', name: 'Pattern', cat: 'Sources', help: 'Any Pattern-workspace generator, repeated over the page',
    params: [{ k: 'gen', label: 'Generator', type: 'gen', def: 'woodland' }, F('tile', 'Tile size', 16, 2000, 300, 1), F('rot', 'Rotation', -180, 180, 0, 1), { k: 'pat', label: 'Settings', type: 'pat', def: null, noUniform: true }],
    inline: ['tile'], outputs: [oImg()],
    run: (ctx, n) => {
      if (!PT) return null;
      const gen = PT.has(n.p.gen) ? n.p.gen : PT.list[0].id;
      const L = Object.assign({ motifId: null }, PT.defaults(gen), n.p.pat && n.p.pat.gen === gen ? JSON.parse(JSON.stringify(n.p.pat)) : {});
      const step = Math.max(4, n.p.tile * ctx.scale);
      return M.tileFill(PT.tileCanvas(L, Math.min(2048, Math.round(step))), ctx.W, ctx.H, step, n.p.rot);
    } });
  def({ id: 'fxmaterial', name: 'Material', cat: 'Sources', help: 'A material from this document, repeated over the page (lit, or one of its maps)',
    params: [{ k: 'mat', label: 'Material', type: 'matref', def: '', noUniform: true }, SEL('channel', 'Show', M.CHANNEL_NAMES.slice(0, 7), 'Lit'), F('tile', 'Tile size', 16, 2000, 300, 1), F('light', 'Light angle', -180, 180, 135, 1), F('rot', 'Rotation', -180, 180, 0, 1)],
    inline: ['channel', 'tile'], outputs: [oImg()],
    sourceSig: (n) => (n.p.mat ? M.version(n.p.mat) : 'none'),
    run: (ctx, n) => {
      const m = M.find(n.p.mat);
      if (!m) return null;
      const step = Math.max(4, n.p.tile * ctx.scale);
      return M.tileFill(M.tile(m, n.p.channel, step, n.p.light), ctx.W, ctx.H, step, n.p.rot);
    } });

  // ---------------------------------------------------------------- the material generators, tiled over the page
  FE.genNodes = () => {
    M.list('material').filter((g) => g.cat === 'Generators').forEach((g) => {
      if (M.get('gen:' + g.id)) return;
      const outs = g.outputs.filter((o) => !o.hidden);
      def({ id: 'gen:' + g.id, name: g.name, cat: 'Generators (tiled)', help: (g.help || g.name) + ' — repeated over the page',
        params: g.params.map((q) => Object.assign({}, q)).concat([F('tile', 'Tile size', 16, 2000, 400, 1)]),
        inline: (g.inline || []).slice(0, 2).concat(['tile']),
        inputs: [], outputs: outs.map((o) => ({ k: o.k, label: o.label, type: o.type, expr: '' })),
        run: (ctx, n, ins, out) => {
          const step = Math.max(4, n.p.tile * ctx.scale);
          const size = Math.max(32, Math.min(1024, 1 << Math.ceil(Math.log2(step))));
          const node = { id: 'G' + n.id, type: g.id, p: n.p, seed: n.seed, x: 0, y: 0 };
          const tmp = { id: 'fxgen', name: '', size, nodes: [node], links: [] };
          const oi = g.outputs.indexOf(outs[out]);
          const t = M.engine.eval(tmp, node, oi, size);
          const tile = M.toCanvas(t, { mode: outs[out].type === 'gray' ? 'gray' : 'color' });
          const c = M.tileFill(tile, ctx.W, ctx.H, step);
          if (outs[out].type === 'gray') c.__gray = true;
          return c;
        } });
    });
  };
  FE.genNodes();

  // ---------------------------------------------------------------- transform
  def({ id: 'fxtransform', name: 'Transform', cat: 'Transform', help: 'Move, scale and turn the image (around the layer centre)',
    inputs: [img('in', 'Image')], outputs: [oImg()],
    params: [F('dx', 'Move X', -2000, 2000, 0, 1), F('dy', 'Move Y', -2000, 2000, 0, 1), F('scale', 'Scale', 0.05, 8, 1), F('rotate', 'Rotate', -180, 180, 0, 1), B('flipX', 'Flip horizontally', false), B('flipY', 'Flip vertically', false)],
    run: (ctx, n, [src]) => {
      if (!src) return null;
      const o = blank(ctx.W, ctx.H), x = o.getContext('2d'), s = ctx.scale, b = ctx.bounds;
      const cx = (b.x + b.w / 2) * s, cy = (b.y + b.h / 2) * s;
      x.translate(cx + n.p.dx * s, cy + n.p.dy * s); x.rotate(n.p.rotate * Math.PI / 180); x.scale(n.p.scale * (n.p.flipX ? -1 : 1), n.p.scale * (n.p.flipY ? -1 : 1)); x.translate(-cx, -cy);
      x.drawImage(src, 0, 0);
      return o;
    } });

  // ================================================================= the "Effect map" effect (FX & Filters → Node maps)
  // FX.apply is wrapped only to remember the env (bounds) of the stack being run, for the map's nodes
  if (FX && !FX.apply.__mat) {
    const apply0 = FX.apply;
    FX.apply = (canvas, effects, env) => { const prev = FX.curEnv; FX.curEnv = env; try { return apply0(canvas, effects, env); } finally { FX.curEnv = prev; } };
    FX.apply.__mat = true;
    // exports: effects inside maps that need slow data (texture tiles) prepare it too
    const prep0 = FX.prepare;
    if (prep0) FX.prepare = async (scale) => {
      await prep0(scale);
      const jobs = [];
      M.mats('effect').forEach((m) => m.nodes.forEach((n) => {
        if (!n.type.startsWith('fx:')) return;
        const d = FX.get(n.type.slice(3));
        if (!d || !d.prepare) return;
        const e = TL.make.effect(d.id); Object.assign(e.p, n.p); delete e.p.__mix;
        jobs.push(Promise.resolve(d.prepare(e, scale)).catch((err) => console.warn('prepare', d.id, err)));
      }));
      await Promise.all(jobs);
    };
  }
  if (FX && FX.def) FX.def({ id: 'effectmap', name: 'Effect map', cat: 'Node maps', help: 'Runs a node map from the Material tab (7): effects, filters, dither, blends, masks, layers, patterns and materials wired together',
    params: [{ k: 'map', label: 'Map', type: 'mapref', def: '', noUniform: true }],
    run: (c, p, e) => {
      const map = M.find(e.p.map);
      if (!map || M.kindOf(map) !== 'effect' || FE.depth > 0) return c.src; // inside another map / a Document node: pass through
      const G = TL.gl;
      const input = G.toCanvas(c.src);
      const env = FX.curEnv || {};
      const b = env.bounds || { x: 0, y: 0, w: c.w / c.scale, h: c.h / c.scale };
      const out = FE.run(map, FE.newCtx({ input, scale: c.scale, bounds: b, sig: null }));
      if (!out || out === input) return c.src;
      return G.upload(out);
    } });

  // what an effect map reads besides its own nodes (layers, document, materials) → part of its version (R.key)
  M.extraVersion = (m, depth) => {
    if (M.kindOf(m) !== 'effect') return '';
    let s = '';
    m.nodes.forEach((n) => {
      if (n.type === 'fxlayer') { const L = TL.layer(n.p.layer); s += '|L' + (L ? M.hash(JSON.stringify(L)) : '-'); }
      else if (n.type === 'fxdoc') s += '|D' + M.hash(JSON.stringify([TL.doc.layers.map((l) => [l.id, l.visible, l.opacity, l.blend, l.type === 'text' ? l.text : '']), TL.doc.bg]));
      else if (n.type === 'fxmaterial' && n.p.mat) s += '|M' + M.version(n.p.mat, depth + 1);
    });
    return s;
  };

  // ================================================================= graph model + hosts
  M.newEffectMap = (name = 'Effect map') => {
    const map = { id: U.uid('M'), name, kind: 'effect', nodes: [], links: [] };
    const a = M.addNode(map, 'fxin', 0, 120), b = M.addNode(map, 'fxout', 520, 120);
    M.link(map, a.id, 0, b.id, 0);
    return map;
  };
  // where a map is used: [{ layer, index } | { finish: true, index }]
  M.hostsOf = (id) => {
    const out = [];
    TL.doc.layers.forEach((L) => L.effects.forEach((e, i) => { if (e.type === 'effectmap' && e.p.map === id) out.push({ layer: L, index: i, effect: e }); }));
    TL.doc.finish.effects.forEach((e, i) => { if (e.type === 'effectmap' && e.p.map === id) out.push({ finish: true, index: i, effect: e }); });
    return out;
  };
  M.attachMap = (id, where) => {
    const e = TL.make.effect('effectmap');
    e.p.map = id;
    if (where === 'finish') TL.doc.finish.effects.push(e);
    else { const L = TL.cur(); if (!L) { U.toast('Select a layer first'); return null; } L.effects.push(e); }
    TL.commit('Add effect map');
    TL.emit('effects');
    return e;
  };
  // the image that reaches the map in its first host (for the Material tab preview), at preview scale s
  let lastHost = { key: null, val: null };
  FE.hostInput = (map, s) => {
    const host = M.hostsOf(map.id)[0];
    const doc = TL.doc;
    if (host && host.layer) {
      const L = host.layer;
      const c = Object.assign({}, L, { effects: L.effects.slice(0, host.index), maskId: null });
      const key = R.key(c, s);
      if (lastHost.key === key) return lastHost.val;
      const val = { input: R.layer(c, s, false), scale: s, bounds: R.bounds(L, doc), sig: M.hash(key), host };
      lastHost = { key, val };
      return val;
    }
    const before = host ? doc.finish.effects.slice(0, host.index) : [];
    const key = JSON.stringify([doc.layers, before, doc.bg, doc.transparent, doc.width, doc.height, s, TL.render.fontGen]) + doc.layers.map((l) => (l.canvasId ? TL.asset.ver(l.canvasId) : '') + (l.imageId ? TL.asset.ver(l.imageId) : '')).join();
    if (lastHost.key === key) return lastHost.val;
    const base = R.composite(s, { useCache: true, noFinish: true });
    const input = before.length ? FX.apply(base, before, { scale: s, bounds: { x: 0, y: 0, w: doc.width, h: doc.height } }) : base;
    const val = { input, scale: s, bounds: { x: 0, y: 0, w: doc.width, h: doc.height }, sig: M.hash(key), host: host || null };
    lastHost = { key, val };
    return val;
  };

  // ================================================================= starter effect maps
  // builder: g.input = the Input node; g.n(type, params, inputs); g.material(presetId) → adds that material once
  M.fxPresets = [];
  M.fxPreset = (name, desc, fn) => M.fxPresets.push({ id: 'map-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, desc, fn });
  M.fromFxPreset = (id, addMaterial) => {
    const pr = M.fxPresets.find((x) => x.id === id);
    if (!pr) return null;
    const map = M.newEffectMap(pr.name);
    map.links = [];
    const handle = (node) => ({ id: node.id, node, out: 0, o: (k) => ({ id: node.id, node, out: Math.max(0, M.get(node.type).outputs.findIndex((x) => x.k === k)) }) });
    const link = (src, node, key) => { if (!src) return; const i = M.get(node.type).inputs.findIndex((x) => x.k === key); if (i >= 0) M.link(map, src.id, src.out || 0, node.id, i); };
    const g = {
      input: handle(map.nodes.find((n) => n.type === 'fxin')),
      n(type, p = {}, ins = {}) { if (!M.get(type)) throw new Error('Unknown node ' + type); const node = M.addNode(map, type, 0, 0, p); for (const k in ins) link(ins[k], node, k); return handle(node); },
      material(presetId) { const m = addMaterial ? addMaterial(presetId) : null; return m ? m.id : ''; },
      out(src) { link(src, M.output(map), 'in'); },
    };
    pr.fn(g);
    M.layout(map);
    return map;
  };
  const P = M.fxPreset;
  P('Glow through noise', 'A glow that only shows where a noise mask is bright', (g) => {
    const noise = g.n('gen:noise', { scaleX: 3, scaleY: 3, octaves: 4, tile: 500 });
    g.out(g.n('fx:glow', { radius: 34, strength: 2.2, color: '#ff2a6d' }, { in: g.input, mask: g.n('fxmaskadj', { low: 0.45, high: 0.65 }, { in: noise }) }));
  });
  P('Dithered shadow', 'A long soft shadow, dithered, with the clean original on top', (g) => {
    const sh = g.n('fx:shadow', { dx: 26, dy: 30, blur: 18 }, { in: g.input });
    const dit = g.n('fxdither', { style: 'atkinson', pixel: 3, palette: 'gray1' }, { in: sh });
    g.out(g.n('fxblend', { mode: 'source-over' }, { a: dit, b: g.input }));
  });
  P('Glitch on the edges', 'RGB split and scanlines only around the edges of the shape', (g) => {
    const edge = g.n('fx:blur', { radius: 10 }, { in: g.n('fx:edges', {}, { in: g.input }) });
    const m = g.n('fxmaskadj', { low: 0.02, high: 0.25 }, { in: edge });
    g.out(g.n('fx:scanlines', {}, { in: g.n('fx:rgbsplit', {}, { in: g.input, mask: m }), mask: m }));
  });
  P('Neon double glow', 'Tight cyan glow + wide pink glow, screened together', (g) => {
    const a = g.n('fx:glow', { radius: 10, strength: 2.4, color: '#29e6ff' }, { in: g.input });
    const b = g.n('fx:glow', { radius: 60, strength: 1.6, color: '#ff2bd6' }, { in: g.input });
    g.out(g.n('fxblend', { mode: 'screen' }, { a: b, b: a }));
  });
  P('Brick letters', 'Fills the shape with the Red bricks material (made for you), with a drop shadow', (g) => {
    const mat = g.n('fxmaterial', { mat: g.material('red-bricks'), channel: 'Lit', tile: 260 });
    const cut = g.n('fxcutout', {}, { in: mat, mask: g.n('fxmask', { mode: 0 }, { in: g.input }) });
    g.out(g.n('fx:shadow', { dx: 10, dy: 14, blur: 12 }, { in: cut }));
  });
  P('Rusty metal type', 'Rusty iron material inside the shape, lit by its own relief, outlined', (g) => {
    const mat = g.n('fxmaterial', { mat: g.material('rusty-iron'), channel: 'Lit', tile: 320 });
    const cut = g.n('fxcutout', {}, { in: mat, mask: g.n('fxmask', { mode: 0 }, { in: g.input }) });
    g.out(g.n('fx:outline', {}, { in: cut }));
  });
  P('Watercolour + ink', 'Watercolour filter with ink outlines multiplied on top', (g) => {
    const wc = g.n('fx:fg_watercolor', {}, { in: g.input });
    const ink = g.n('fx:fg_inkoutlines', {}, { in: g.input });
    g.out(g.n('fxblend', { mode: 'multiply', opacity: 0.8 }, { a: wc, b: ink }));
  });
  P('Halftone in camo', 'Halftone of the shape, coloured by a woodland camo pattern', (g) => {
    const ht = g.n('fx:halftone', {}, { in: g.input });
    const camo = g.n('fxpattern', { gen: 'woodland', tile: 420 });
    g.out(g.n('fxcutout', {}, { in: g.n('fxblend', { mode: 'multiply' }, { a: camo, b: ht }), mask: g.n('fxmask', { mode: 0 }, { in: g.input }) }));
  });
})(window.TL);
