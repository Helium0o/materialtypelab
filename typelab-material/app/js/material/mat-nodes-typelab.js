// TypeLab Material — nodes that bring TypeLab content into a material: Text, Layer, Document, Pattern, Image.
// They render on the CPU (canvas) and are uploaded once; they re-render only when their source changes
// (sourceSig). Pattern tiles from texturelib render on TypeLab's workers (async), the rest is synchronous.
(function (TL) {
  const U = TL.util;
  const M = TL.mat;
  const F = (k, label, min, max, def, step) => ({ k, label, min, max, def, step: step != null ? step : (max - min > 20 ? 1 : 0.01) });
  const I = (k, label, min, max, def) => ({ k, label, min, max, def, step: 1 });
  const SEL = (k, label, options, def = 0) => ({ k, label, type: 'select', options, def });
  const B = (k, label, def) => ({ k, label, type: 'bool', def: !!def });
  const fontGen = () => (TL.render ? TL.render.fontGen : 0);
  const ver = (id) => (id && TL.asset ? id + '@' + TL.asset.ver(id) : '');

  // draw `img` (w×h) into a size×size canvas: 0 stretch, 1 contain (centred), 2 cover
  const fitInto = (img, size, mode, pad = 0, bg = null) => {
    const c = U.canvas(size, size), x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, size, size); }
    x.imageSmoothingQuality = 'high';
    const w = img.width, h = img.height, inner = size * (1 - 2 * pad);
    if (mode === 0) x.drawImage(img, size * pad, size * pad, inner, inner);
    else {
      const k = mode === 1 ? Math.min(inner / w, inner / h) : Math.max(inner / w, inner / h);
      x.drawImage(img, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
    }
    return c;
  };

  // ---------------------------------------------------------------- Text
  // Writes text straight into the material (single word, or rows of repeated text for monogram fabrics).
  // Copies wrap around the tile edges, so even big text stays seamless.
  M.def({ id: 'text', name: 'Text', cat: 'TypeLab', help: 'Type a word in any TypeLab font — embossed letters, carved signs, monogram patterns',
    params: [{ k: 'text', label: 'Text', type: 'text', def: 'TYPE' }, { k: 'font', label: 'Font', type: 'font', def: 'Impact' },
      SEL('weight', 'Weight', ['300', '400', '700', '900'], 1), B('italic', 'Italic', false), F('size', 'Size', 0.05, 1.2, 0.8),
      SEL('layout', 'Layout', ['Single', 'Rows (repeat)']), I('rows', 'Rows', 1, 24, 4), F('gap', 'Gap', 0, 2, 0.4), F('stagger', 'Stagger', 0, 1, 0.5), F('rotate', 'Rotate', -180, 180, 0, 1)],
    inline: ['size', 'layout'],
    outputs: [{ k: 'mask', label: 'Mask', type: 'gray', expr: 'src(uv).a' }, { k: 'color', label: 'Colour', type: 'color', expr: 'src(uv)' }],
    sourceSig: (n) => JSON.stringify(n.p) + '|' + fontGen() + '|' + (document.fonts ? document.fonts.status : ''),
    source: (n, size) => {
      const p = n.p, weight = ['300', '400', '700', '900'][p.weight | 0] || '400';
      if (TL.fonts && TL.fonts.ensure) TL.fonts.ensure(p.font, +weight, !!p.italic).catch(() => {});
      const c = U.canvas(size, size), x = c.getContext('2d');
      const str = String(p.text == null ? '' : p.text).replace(/\n/g, ' ') || ' ';
      const font = (px) => `${p.italic ? 'italic ' : ''}${weight} ${px}px "${p.font}", sans-serif`;
      x.font = font(100);
      const m = x.measureText(str);
      const w100 = Math.max(1, m.width), h100 = Math.max(1, (m.actualBoundingBoxAscent || 72) + (m.actualBoundingBoxDescent || 0));
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      const draw = (cx, cy, px) => {
        x.font = font(px);
        const asc = (m.actualBoundingBoxAscent || 72) * px / 100, desc = (m.actualBoundingBoxDescent || 0) * px / 100;
        x.save(); x.translate(cx, cy); x.rotate((p.rotate || 0) * Math.PI / 180); x.fillText(str, 0, (asc - desc) / 2); x.restore();
      };
      if ((p.layout | 0) === 0) {
        const px = Math.min(size * p.size * 100 / w100, size * 0.95 * 100 / h100);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) draw(size / 2 + dx * size, size / 2 + dy * size, px);
      } else {
        const rows = Math.max(1, p.rows | 0), rh = size / rows;
        const px = rh * p.size * 100 / h100;
        const cell = w100 * px / 100 * (1 + p.gap);
        const k = Math.max(1, Math.round(size / Math.max(1, cell))), sp = size / k; // whole number per row → seamless
        for (let r = -1; r <= rows; r++) for (let i = -1; i <= k; i++) draw((i + 0.5 + (((r % 2) + 2) % 2) * p.stagger) * sp, (r + 0.5) * rh, px);
      }
      return c;
    } });

  // ---------------------------------------------------------------- Layer
  M.def({ id: 'layer', name: 'Layer', cat: 'TypeLab', help: 'Any layer of the document (text, shape, paint, image…) with its effects',
    params: [{ k: 'layer', label: 'Layer', type: 'layer', def: '' }, SEL('fit', 'Frame', ['Layer bounds', 'Whole page']), F('pad', 'Padding', 0, 0.45, 0.08), B('repeat', 'Wrap copies at the edges', false)],
    inline: ['fit', 'pad'],
    outputs: [{ k: 'mask', label: 'Mask', type: 'gray', expr: 'src(uv).a' }, { k: 'color', label: 'Colour', type: 'color', expr: 'src(uv)' }],
    sourceSig: (n) => {
      const L = TL.layer(n.p.layer);
      return L ? M.hash(JSON.stringify(L) + JSON.stringify(n.p) + fontGen() + ver(L.canvasId) + ver(L.maskId) + ver(L.imageId) + ver(L.motifId) + TL.doc.width + 'x' + TL.doc.height) : 'none:' + n.p.layer;
    },
    source: (n, size) => {
      const L = TL.layer(n.p.layer);
      if (!L || !TL.render) return null;
      const doc = TL.doc, R = TL.render;
      const b = (n.p.fit | 0) === 0 ? R.bounds(L, doc) : { x: 0, y: 0, w: doc.width, h: doc.height };
      if (!b || b.w < 1 || b.h < 1) return null;
      const s = Math.min(2, size / Math.max(b.w, b.h));
      const full = R.layer(L, s, false);
      const crop = U.canvas(Math.max(1, Math.round(b.w * s)), Math.max(1, Math.round(b.h * s)));
      crop.getContext('2d').drawImage(full, -b.x * s, -b.y * s);
      const c = fitInto(crop, size, 1, n.p.pad);
      if (!n.p.repeat) return c;
      const o = U.canvas(size, size), x = o.getContext('2d');
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) x.drawImage(c, dx * size, dy * size);
      return o;
    } });

  // ---------------------------------------------------------------- Document
  M.def({ id: 'document', name: 'Document', cat: 'TypeLab', help: 'The whole finished document (all visible layers + whole-image effects)',
    params: [SEL('fit', 'Fit', ['Stretch', 'Contain', 'Cover'], 2)],
    outputs: [{ k: 'color', label: 'Colour', type: 'color', expr: 'src(uv)' }, { k: 'gray', label: 'Gray', type: 'gray', expr: 'luma(src(uv).rgb)' }],
    sourceSig: (n) => M.hash(JSON.stringify([TL.doc.layers, TL.doc.finish, TL.doc.bg, TL.doc.transparent, TL.doc.width, TL.doc.height, n.p, fontGen()]) + TL.doc.layers.map((l) => ver(l.canvasId) + ver(l.maskId) + ver(l.imageId)).join()),
    source: (n, size) => {
      if (!TL.render) return null;
      const s = Math.min(2, size / Math.min(TL.doc.width, TL.doc.height));
      return fitInto(TL.render.composite(s, { useCache: false }), size, n.p.fit | 0);
    } });

  // ---------------------------------------------------------------- Pattern (TypeLab's 25 + texturelib's 87 generators)
  const patLayer = (n) => {
    const PT = TL.patterns;
    if (!PT) return null;
    const gen = PT.has(n.p.gen) ? n.p.gen : (PT.has('tx-tartan') ? 'tx-tartan' : PT.list[0].id);
    const base = Object.assign({ motifId: null }, PT.defaults(gen));
    const own = n.p.pat && n.p.pat.gen === gen ? n.p.pat : null;
    return own ? Object.assign(base, JSON.parse(JSON.stringify(own))) : base;
  };
  M.def({ id: 'pattern', name: 'Pattern', cat: 'TypeLab', help: 'Any Pattern-workspace generator (camo, tartan, knit, damask…) — or a copy of a pattern layer',
    params: [{ k: 'gen', label: 'Generator', type: 'gen', def: 'tx-tartan' }, I('repeat', 'Repeat', 1, 8, 1), { k: 'pat', label: 'Settings', type: 'pat', def: null, noUniform: true }],
    inline: ['repeat'],
    outputs: [{ k: 'color', label: 'Colour', type: 'color', expr: 'src(uv)' }, { k: 'gray', label: 'Gray', type: 'gray', expr: 'luma(src(uv).rgb)' }, { k: 'mask', label: 'Alpha', type: 'gray', expr: 'src(uv).a' }],
    sourceSig: (n) => M.hash(JSON.stringify(patLayer(n)) + '|' + n.p.repeat + '|' + fontGen()),
    source: (n, size) => {
      const PT = TL.patterns, L = patLayer(n);
      if (!L) return null;
      const rep = Math.max(1, n.p.repeat | 0), px = Math.max(16, Math.round(size / rep));
      const fill = (t) => {
        const c = U.canvas(size, size), x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        for (let j = 0; j < rep; j++) for (let i = 0; i < rep; i++) x.drawImage(t, i * size / rep, j * size / rep, size / rep, size / rep);
        return c;
      };
      if (PT.get(L.gen).raster && PT.tileCanvasAsync) return PT.tileCanvasAsync(L, px).then(fill);
      return fill(PT.tileCanvas(L, px));
    } });

  // ---------------------------------------------------------------- Image
  M.def({ id: 'image', name: 'Image', cat: 'TypeLab', help: 'An imported picture (photo, scan, logo). Add "Make tileable" after it if it is not seamless.',
    params: [{ k: 'img', label: 'Image', type: 'image', def: null, noUniform: true }, SEL('fit', 'Fit', ['Stretch', 'Contain', 'Cover'], 2), I('repeat', 'Repeat', 1, 16, 1)],
    inline: ['fit', 'repeat'],
    outputs: [{ k: 'color', label: 'Colour', type: 'color', expr: 'src(fract(uv*p_repeat))' }, { k: 'gray', label: 'Gray', type: 'gray', expr: 'luma(src(fract(uv*p_repeat)).rgb)' }, { k: 'mask', label: 'Alpha', type: 'gray', expr: 'src(fract(uv*p_repeat)).a' }],
    sourceSig: (n) => ver(n.imageId) + '|' + n.p.fit,
    source: (n, size) => {
      const im = n.imageId && TL.asset.get(n.imageId);
      return im ? fitInto(im, size, n.p.fit | 0) : null;
    } });
})(window.TL);
