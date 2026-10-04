// TypeLab Material — joins materials with the rest of TypeLab.
//
//  A. Materials everywhere a pattern goes: every material is also a Pattern generator "mat-<id>" (category
//     "Materials"), so pattern layers, the Type panel's "Fill with texture" and the texture brush can use it. Plus a
//     "Material" effect (FX & Filters → Material) that puts a material on any layer: Fill, Overlay, Multiply,
//     Relief (lights the layer with the material's real normal map), Lit material, Displace.
//  C. TypeLab effects inside materials: every TypeLab effect / filter (313) is also a material node
//     "TypeLab FX · …"; it runs on the tile laid 3×3 and keeps the centre, so the material stays seamless.
//  +  Cache keys: TypeLab caches layer renders by the layer's JSON; a layer that uses a material or an effect map
//     only stores its id, so R.key is wrapped to add the material's / map's current version.
(function (TL) {
  const U = TL.util, h = U.h;
  const M = TL.mat;
  const FX = TL.fx, PT = TL.patterns, R = TL.render;

  // ================================================================= versions (hash of a material, memoised per change)
  let tick = 0;
  const vcache = new Map();
  ['touch', 'history', 'doc', 'matready', 'fontsloaded'].forEach((ev) => TL.on(ev, () => { tick++; }));
  M.version = (id, depth = 0) => {
    const hit = vcache.get(id);
    if (hit && hit.t === tick) return hit.v;
    const m = M.find(id);
    let s = m ? JSON.stringify(m) : 'none:' + id;
    // effect maps also depend on what their source nodes read (layers, the document, other materials)
    if (m && M.extraVersion && depth < 3) { try { s += M.extraVersion(m, depth); } catch (e) { s += '|x'; } }
    const v = M.hash(s);
    vcache.set(id, { t: tick, v });
    return v;
  };
  const REF = /"(?:map|mat)":"([^"]+)"|"gen":"mat-([^"]+)"/g;
  M.refsIn = (json) => { const out = new Set(); let m; REF.lastIndex = 0; while ((m = REF.exec(json))) out.add(m[1] || m[2]); return out; };
  if (R && R.key && !R.key.__mat) {
    const key0 = R.key;
    R.key = (layer, s) => {
      let k = key0(layer, s);
      const refs = M.refsIn(JSON.stringify(layer));
      refs.forEach((id) => { k += '|m' + id + ':' + M.version(id); });
      return k;
    };
    R.key.__mat = true;
  }

  // ================================================================= material tiles (cached canvases)
  const tiles = new Map(); // key → canvas (LRU, ~40)
  const remember = (k, c) => { tiles.set(k, c); while (tiles.size > 40) tiles.delete(tiles.keys().next().value); return c; };
  const pow2 = (px, lo = 32, hi = 1024) => Math.max(lo, Math.min(hi, 1 << Math.ceil(Math.log2(Math.max(1, px)))));
  M.CHANNEL_NAMES = ['Lit', 'Albedo', 'Height', 'Normal', 'Roughness', 'Metallic', 'AO', 'Emission'];
  // one tile of a material as a canvas: channel 'Lit' | 'Albedo' | …, at ~px (rounded up to a power of two)
  M.tile = (m, channel = 'Lit', px = 512, light = 135) => {
    if (!m || M.kindOf(m) !== 'material') return null;
    const n = pow2(px);
    const key = m.id + '|' + M.version(m.id) + '|' + channel + '|' + n + '|' + light;
    if (tiles.has(key)) { const c = tiles.get(key); tiles.delete(key); tiles.set(key, c); return c; }
    const maps = M.maps(m, n);
    if (!maps) return null;
    const ch = String(channel).toLowerCase();
    const c = ch === 'lit' ? M.toCanvas(maps.albedo, { mode: 'lit', maps, light: light * Math.PI / 180 })
      : M.toCanvas(maps[ch] || maps.albedo, { mode: ['albedo', 'normal', 'emission'].includes(ch) ? 'color' : 'gray' });
    return remember(key, c);
  };
  // fill a W×H canvas with a tile repeated every `step` canvas pixels
  M.tileFill = (tile, W, H, step, rot = 0, ox = 0, oy = 0) => {
    const c = U.canvas(W, H), x = c.getContext('2d');
    if (!tile) return c;
    const pat = x.createPattern(tile, 'repeat');
    pat.setTransform(new DOMMatrix().translate(ox, oy).rotate(rot).scale(step / tile.width));
    x.fillStyle = pat; x.fillRect(0, 0, W, H);
    return c;
  };

  // ================================================================= A1. materials as Pattern generators
  const isMat = (id) => typeof id === 'string' && id.startsWith('mat-');
  if (PT) {
    M.syncPatterns = () => {
      const want = M.mats('material');
      for (let i = PT.list.length - 1; i >= 0; i--) if (isMat(PT.list[i].id) && !want.some((m) => 'mat-' + m.id === PT.list[i].id)) PT.list.splice(i, 1);
      want.forEach((m) => {
        let g = PT.list.find((x) => x.id === 'mat-' + m.id);
        if (!g) {
          g = { id: 'mat-' + m.id, cat: 'Materials (node)', raster: true, material: true, defTile: 512, defScale: 1, colors: [], build() {},
            params: [{ k: 'channel', label: 'Show', type: 'select', options: M.CHANNEL_NAMES.slice(0, 7), def: 'Lit' }, { k: 'light', label: 'Light angle', min: -180, max: 180, def: 135, step: 1 }] };
          PT.list.push(g);
        }
        g.name = m.name;
      });
    };
    const tileOf = (L, px) => {
      const m = M.find(L.gen.slice(4));
      const t = m && M.tile(m, (L.p && L.p.channel) || 'Lit', px, L.p && L.p.light != null ? L.p.light : 135);
      if (!t) return U.canvas(Math.max(8, px | 0), Math.max(8, px | 0));
      if (t.width === px) return t;
      const c = U.canvas(Math.max(8, Math.round(px)), Math.max(8, Math.round(px)));
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(t, 0, 0, c.width, c.height);
      return c;
    };
    const tile0 = PT.tileCanvas, async0 = PT.tileCanvasAsync, svg0 = PT.svgBody, items0 = PT.items;
    PT.tileCanvas = (L, px) => (L && isMat(L.gen) ? tileOf(L, px) : tile0(L, px));
    if (async0) PT.tileCanvasAsync = (L, px) => (L && isMat(L.gen) ? Promise.resolve(tileOf(L, px)) : async0(L, px));
    PT.items = (L) => (L && isMat(L.gen) ? { T: PT.tileSize(L), H: PT.tileSize(L), items: [] } : items0(L));
    if (svg0) PT.svgBody = (L, o) => {
      if (!L || !isMat(L.gen)) return svg0(L, o);
      const T0 = PT.tileSize(L), c = tileOf(L, Math.max(256, Math.min(2048, Math.round(T0 * 2))));
      return { T: T0, H: T0, body: `<image href="${c.toDataURL('image/png')}" x="0" y="0" width="${T0}" height="${T0}" preserveAspectRatio="none"/>` };
    };
    ['doc', 'history'].forEach((ev) => TL.on(ev, () => M.syncPatterns()));
    M.syncPatterns();
  }
  // helpers used by the Material tab ("Use it")
  M.asPatternLayer = (m, clipTo) => {
    if (!PT) return null;
    M.syncPatterns();
    const L = TL.make.pattern('mat-' + m.id);
    L.name = m.name;
    if (clipTo) { L.clipTo = clipTo; TL.addLayer(L, clipTo); } else { const cur = TL.cur(); if (cur) TL.addLayerBelow(L, cur.id); else TL.addLayer(L); }
    TL.commit(clipTo ? 'Fill text with material' : 'Material pattern layer');
    TL.emit('layers');
    return L;
  };

  // ================================================================= A2. the "Material" effect (FX & Filters → Material)
  if (FX && FX.def) {
    const { R: RP, PX, SEL } = FX.H;
    const MODES = ['Fill', 'Overlay', 'Multiply', 'Relief (light the layer)', 'Lit material', 'Displace'];
    const SRC = `uniform float u_tile; uniform float u_light;
vec4 tileS(sampler2D t, vec2 P){ return texture(t, fract(P/u_tile)); }
void main(){
  vec2 P = gl_FragCoord.xy; vec4 s = T(P); float a = s.a; vec3 sc = unp(s);
  vec3 alb = tileS(u_tex2, P).rgb; vec3 nt = tileS(u_tex3, P).xyz*2.0 - 1.0; float rg = tileS(u_mask, P).r;
  vec3 n = normalize(vec3(nt.x*p_relief, -nt.y*p_relief, max(nt.z, 0.05)));       // canvas frame: x right, y down
  vec3 L = normalize(vec3(cos(u_light), -sin(u_light), 0.75));
  float sh = dot(n, L), base = L.z;
  float sp = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), mix(90.0, 4.0, rg))*mix(0.7, 0.03, rg);
  int m = int(p_mode + 0.5); vec3 col = sc;
  if (m == 0) col = alb;
  else if (m == 1) col = mix(2.0*sc*alb, 1.0 - 2.0*(1.0 - sc)*(1.0 - alb), step(0.5, sc));
  else if (m == 2) col = sc*alb;
  else if (m == 3) col = clamp(sc*clamp(1.0 + (sh - base)*1.6, 0.0, 2.0) + vec3(sp), 0.0, 1.0);
  else if (m == 4) col = clamp(alb*(0.3 + 0.8*max(sh, 0.0)) + vec3(sp), 0.0, 1.0);
  else { vec2 off = vec2(nt.x, -nt.y)*p_relief*u_tile*0.06; o = mix(s, T(P + off), p_amount); return; }
  o = mix(s, vec4(col*a, a), p_amount);
}`;
    FX.def({ id: 'matfx', name: 'Material', cat: 'Material', help: 'Puts a node material (Material tab, key 7) on this layer: fill, overlay, relief from its normal map, lit material or displace',
      params: [{ k: 'mat', label: 'Material', type: 'matref', def: '', noUniform: true }, SEL('mode', 'Apply as', MODES, 3), PX('size', 'Tile size', 16, 2048, 256, 1),
        RP('amount', 'Amount', 0, 1, 1, 0.01), RP('relief', 'Relief', 0, 4, 1, 0.01), RP('light', 'Light angle', -180, 180, 135, 1)],
      run: (c, p, e) => {
        const m = M.find(e.p.mat);
        if (!m || M.kindOf(m) !== 'material') return c.src;
        const G = TL.gl, px = Math.max(4, p.size);
        const n = pow2(px, 32, 1024);
        const alb = M.tile(m, 'Albedo', n), nrm = M.tile(m, 'Normal', n), rgh = M.tile(m, 'Roughness', n);
        if (!alb || !nrm || !rgh) return c.src;
        const ta = G.upload(alb), tn = G.upload(nrm), tr = G.upload(rgh);
        try { return c.pass(SRC, { u_tex: c.src, u_tex2: ta, u_tex3: tn, u_mask: tr }, { u_tile: px, u_light: p.light * Math.PI / 180 }); }
        finally { G.release(ta); G.release(tn); G.release(tr); }
      } });
  }

  // ================================================================= C. TypeLab effects as material nodes (seamless 3×3)
  const SKIP = new Set(['effectmap', 'matfx']);
  M.tlfxNodes = () => {
    if (!FX) return;
    FX.list.filter((f) => !f.hidden && !SKIP.has(f.id) && !M.get('tlfx:' + f.id)).forEach((f) => {
      const params = f.params.map((q) => Object.assign({}, q, { noUniform: true }));
      M.def({ id: 'tlfx:' + f.id, name: f.name, cat: 'TypeLab FX · ' + (f.family || 'Effects'), help: (f.help ? f.help + ' — ' : '') + 'TypeLab’s own ' + (f.family ? 'filter' : 'effect') + ', run on the tile laid 3×3 so the material stays seamless',
        inputs: [{ k: 'in', label: 'In', type: 'color', def: [0.5, 0.5, 0.5, 1] }],
        outputs: [{ k: 'out', label: 'Out', type: 'color', expr: 'vec4(src(uv).rgb, 1.0)' }],
        params, inline: params.filter((q) => q.min != null && !q.adv).slice(0, 2).map((q) => q.k),
        cpu: (node, size, ins) => {
          const S = size, big = U.canvas(S * 3, S * 3), x = big.getContext('2d');
          const src = ins[0];
          if (src) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) x.drawImage(src, i * S, j * S, S, S);
          else { x.fillStyle = '#808080'; x.fillRect(0, 0, S * 3, S * 3); }
          const e = TL.make.effect(f.id);
          Object.assign(e.p, node.p);
          const k = S / 1024, prev = FX.provisional;
          FX.provisional = false;
          let out;
          try { out = FX.apply(big, [e], { scale: k, bounds: { x: 0, y: 0, w: S * 3 / k, h: S * 3 / k } }); }
          finally { const prov = FX.provisional; FX.provisional = prev || prov; if (prov) M.engine.retryLater && M.engine.retryLater(node.id); }
          const c = U.canvas(S, S);
          c.getContext('2d').drawImage(out, -S, -S);
          return c;
        } });
    });
  };
  M.tlfxNodes();

})(window.TL);
