// TypeLab Material — starter materials. Each one is a small recipe written with a builder, turned into a
// normal editable node graph by M.fromPreset(id) (auto-laid-out). Add your own with M.preset(name, cat, desc, fn).
//
// Builder (g):
//   g.n(type, params, inputs)  → node handle; inputs = { inputKey: handle | handle.o('outputKey') }
//   h.o('key')                 → a specific output of a node (default = first output)
//   g.noise(sx, sy, params)    g.flow(scale, params)   g.ramp(src, [hex, pos], ...)  (2–5 stops)
//   g.lv(src, inLow, inHigh, gamma, outLow, outHigh)    g.math(op, a, b, params)    g.blend(a, b, mode, opacity, mask)
//   g.mix(a, b, mask, contrast)   g.col(hex)   g.gray(v)   g.ao(height, radius, strength)
//   g.out({ albedo, roughness, metallic, height, normal, ao, emission, opacity }, materialParams)
(function (TL) {
  const M = TL.mat;
  M.presets = [];
  M.PRESET_CATS = ['Bricks & tiles', 'Stone & concrete', 'Wood', 'Metal', 'Fabric & leather', 'Ground & nature', 'Organic', 'Sci-fi & tech', 'Plastic, paper & misc', 'Typography'];
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  M.preset = (name, cat, desc, fn) => M.presets.push({ id: slug(name), name, cat, desc, fn });
  const P = M.preset;

  const MATH = ['Add', 'Subtract', 'Multiply', 'Divide', 'Min', 'Max', 'Power', 'Difference', 'Average', 'Screen', 'Height blend (max)', 'A − B·inverse'];
  const BLEND = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Soft light', 'Hard light', 'Add', 'Subtract', 'Difference', 'Darken', 'Lighten', 'Color dodge', 'Color burn'];

  const builder = (mat, name) => {
    let k = 0;
    const base = parseInt(M.hash(name).slice(0, 6), 36);
    const handle = (node) => ({ id: node.id, node, out: 0, o: (key) => { const d = M.get(node.type); const i = d.outputs.findIndex((x) => x.k === key); if (i < 0) throw new Error(node.type + ' has no output ' + key); return { id: node.id, node, out: i }; } });
    const connect = (src, node, key) => {
      if (src == null) return;
      const d = M.get(node.type);
      const i = d.inputs.findIndex((x) => x.k === key);
      if (i < 0) throw new Error(node.type + ' has no input ' + key);
      M.link(mat, src.id, src.out || 0, node.id, i);
    };
    const g = {
      mat,
      n(type, p = {}, ins = {}) {
        if (!M.get(type)) throw new Error('Unknown node ' + type);
        const node = M.addNode(mat, type, 0, 0, p);
        node.seed = 1 + ((base + (k++) * 7919) % 997);
        for (const key in ins) connect(ins[key], node, key);
        return handle(node);
      },
      noise: (sx, sy, p = {}) => g.n('noise', Object.assign({ scaleX: sx, scaleY: sy == null ? sx : sy }, p)),
      flow: (scale, p = {}) => g.n('flow', Object.assign({ scale }, p)),
      ramp: (src, ...stops) => {
        const p = { stops: stops.length };
        stops.forEach(([c, s], i) => { p['c' + (i + 1)] = c; p['s' + (i + 1)] = s; });
        return g.n('colorize', p, { in: src });
      },
      lv: (src, inLow = 0, inHigh = 1, gamma = 1, outLow = 0, outHigh = 1) => g.n('levels', { inLow, inHigh, gamma, outLow, outHigh }, { in: src }),
      math: (op, a, b, p = {}) => g.n('math', Object.assign({ op: MATH.indexOf(op) }, p), { a, b }),
      blend: (a, b, mode = 'Normal', opacity = 1, mask) => g.n('blend', { mode: BLEND.indexOf(mode), opacity }, { a, b, mask }),
      mix: (a, b, mask, contrast = 1) => g.n('mix', { contrast }, { a, b, mask }),
      col: (hex) => g.n('color', { color: hex }),
      gray: (v) => g.n('uniform', { value: v }),
      ao: (h, radius = 24, strength = 1.2) => g.n('occlusion', { radius, strength }, { in: h }),
      out(ch, p = {}) {
        const o = M.output(mat);
        Object.assign(o.p, p);
        for (const key in ch) connect(ch[key], o, key);
        return handle(o);
      },
    };
    return g;
  };

  M.fromPreset = (id) => {
    const pr = M.presets.find((x) => x.id === id);
    if (!pr) return null;
    const mat = { id: TL.util.uid('M'), name: pr.name, size: 1024, nodes: [], links: [] };
    M.addNode(mat, 'material', 0, 0);
    pr.fn(builder(mat, pr.name));
    M.layout(mat);
    return mat;
  };

  // ==================================================================================== Bricks & tiles
  P('Red bricks', 'Bricks & tiles', 'Classic running-bond clay bricks with sandy mortar', (g) => {
    const b = g.n('bricks', { rows: 12, cols: 4, mortar: 0.07, bevel: 0.14, round: 0.06 });
    const n = g.noise(16, 16, { octaves: 6 }), n2 = g.noise(48, 48, { type: 2, octaves: 3 });
    const h = g.math('Multiply', b.o('bricks'), g.lv(n, 0, 1, 1, 0.82, 1));
    const brick = g.blend(g.ramp(b.o('rand'), ['#5e2318', 0], ['#8e3b25', 0.55], ['#b4603e', 1]), g.ramp(n2, ['#6a6a6a', 0], ['#ffffff', 1]), 'Multiply', 0.5);
    const mortar = g.ramp(n, ['#8f877b', 0], ['#c2b9a8', 1]);
    g.out({ albedo: g.mix(mortar, brick, b.o('bricks'), 6), roughness: g.lv(n2, 0, 1, 1, 0.75, 0.95), height: h, ao: g.ao(h, 20, 1.4) }, { normalStrength: 1.6 });
  });
  P('Old weathered bricks', 'Bricks & tiles', 'Chipped, uneven bricks with dirt in the joints', (g) => {
    const b = g.n('bricks', { rows: 10, cols: 4, mortar: 0.09, bevel: 0.3, round: 0.12, jitter: 0.25 });
    const n = g.noise(12, 12, { octaves: 7, persist: 0.6 }), chips = g.n('tonesstep', { value: 0.62, width: 0.08 }, { in: g.noise(10, 10, { type: 2, octaves: 4 }) });
    const h0 = g.math('Multiply', b.o('bricks'), g.lv(n, 0, 1, 1, 0.65, 1));
    const h = g.math('A − B·inverse', h0, chips, { clamp: true });
    const brick = g.ramp(g.math('Average', b.o('rand'), n), ['#4a2015', 0], ['#7d3a24', 0.4], ['#a3684a', 0.75], ['#c49a7a', 1]);
    const dirt = g.ramp(g.ao(h, 40, 2), ['#2b241d', 0], ['#ffffff', 0.6]);
    g.out({ albedo: g.blend(g.mix(g.col('#6d655a'), brick, h, 8), dirt, 'Multiply', 0.9), roughness: g.gray(0.9), height: h, ao: g.ao(h, 24, 1.6) }, { normalStrength: 2 });
  });
  P('White painted bricks', 'Bricks & tiles', 'Brick wall under a coat of chalky white paint, worn on the edges', (g) => {
    const b = g.n('bricks', { rows: 12, cols: 4, mortar: 0.06, bevel: 0.16, round: 0.08 });
    const n = g.noise(20, 20, { octaves: 6 });
    const h = g.math('Multiply', b.o('bricks'), g.lv(n, 0, 1, 1, 0.85, 1));
    const wear = g.n('tonesstep', { value: 0.7, width: 0.06 }, { in: g.math('Add', g.n('curvature', { radius: 3, strength: 10 }, { in: h }), g.lv(n, 0, 1, 1, -0.2, 0.2), { clamp: false }) });
    const paint = g.ramp(n, ['#d9d6cf', 0], ['#f4f2ec', 1]);
    g.out({ albedo: g.mix(paint, g.col('#8a4530'), wear, 4), roughness: g.mix(g.gray(0.8), g.gray(0.92), wear), height: h, ao: g.ao(h) }, { normalStrength: 1.4 });
  });
  P('Stone block wall', 'Bricks & tiles', 'Large rough-cut stone blocks', (g) => {
    const b = g.n('bricks', { rows: 5, cols: 3, mortar: 0.04, bevel: 0.12, round: 0.06, jitter: 0.4 });
    const n = g.noise(8, 8, { octaves: 8, persist: 0.6 }), r = g.noise(12, 12, { type: 1, mode: 1, octaves: 6, persist: 0.55 });
    const h = g.math('Multiply', b.o('bricks'), g.lv(g.math('Average', n, r), 0, 1, 1, 0.7, 1));
    const stone = g.blend(g.ramp(b.o('rand'), ['#6f6a62', 0], ['#8f887d', 0.5], ['#a59c8d', 1]), g.ramp(r, ['#5a5550', 0], ['#ffffff', 1]), 'Multiply', 0.7);
    g.out({ albedo: g.mix(g.col('#4a463f'), stone, b.o('bricks'), 6), roughness: g.gray(0.9), height: h, ao: g.ao(h, 32, 1.6) }, { normalStrength: 2.2 });
  });
  P('Ceramic floor tiles', 'Bricks & tiles', 'Glossy square tiles with grey grout', (g) => {
    const b = g.n('bricks', { rows: 6, cols: 6, offset: 0, mortar: 0.03, bevel: 0.04, round: 0.04 });
    const n = g.noise(6, 6, { octaves: 4 });
    const tile = g.ramp(g.math('Average', b.o('rand'), n), ['#d8d2c4', 0], ['#ece6d8', 1]);
    g.out({ albedo: g.mix(g.col('#7c7a75'), tile, b.o('bricks'), 6), roughness: g.mix(g.gray(0.85), g.gray(0.12), b.o('bricks'), 6), height: b.o('bricks'), ao: g.ao(b.o('bricks'), 10, 1) }, { normalStrength: 1 });
  });
  P('Subway tiles', 'Bricks & tiles', 'White glossy metro tiles, offset rows, dark grout', (g) => {
    const b = g.n('bricks', { rows: 16, cols: 4, mortar: 0.035, bevel: 0.12, round: 0.12 });
    const tile = g.ramp(b.o('rand'), ['#e9eef0', 0], ['#ffffff', 1]);
    const h = g.n('curve', { y1: 0.5, y2: 0.8, y3: 0.95 }, { in: b.o('bricks') });
    g.out({ albedo: g.mix(g.col('#3c3d3f'), tile, b.o('bricks'), 6), roughness: g.mix(g.gray(0.9), g.gray(0.05), b.o('bricks'), 6), height: h, ao: g.ao(h, 8, 1) }, { normalStrength: 1.2 });
  });
  P('Hexagon tiles', 'Bricks & tiles', 'Matte hex floor tiles in two tones', (g) => {
    const t = g.n('hextiles', { count: 8, gap: 0.05, bevel: 0.1 });
    const tone = g.n('tonesstep', { value: 0.7, width: 0.02 }, { in: t.o('rand') });
    const n = g.noise(12, 12, { octaves: 5 });
    const tile = g.blend(g.mix(g.col('#e8e4dc'), g.col('#2f3438'), tone), g.ramp(n, ['#cfcfcf', 0], ['#ffffff', 1]), 'Multiply', 1);
    g.out({ albedo: g.mix(g.col('#9a958c'), tile, t.o('tiles'), 6), roughness: g.gray(0.55), height: t.o('tiles'), ao: g.ao(t.o('tiles'), 10, 1) });
  });
  P('Terracotta tiles', 'Bricks & tiles', 'Handmade terracotta squares with colour variation', (g) => {
    const b = g.n('bricks', { rows: 4, cols: 4, offset: 0, mortar: 0.04, bevel: 0.2, round: 0.15, jitter: 0.06 });
    const n = g.noise(10, 10, { octaves: 6 }), sp = g.n('spots', { cells: 24, size: 0.4, chance: 0.4 });
    const tile = g.blend(g.ramp(g.math('Average', b.o('rand'), n), ['#9a4a2c', 0], ['#bf6a43', 0.5], ['#d58f63', 1]), sp, 'Multiply', 0.15);
    const h = g.math('Multiply', b.o('bricks'), g.lv(n, 0, 1, 1, 0.85, 1));
    g.out({ albedo: g.mix(g.col('#b9ad9b'), tile, b.o('bricks'), 6), roughness: g.gray(0.8), height: h, ao: g.ao(h) }, { normalStrength: 1.5 });
  });
  P('Cobblestone', 'Bricks & tiles', 'Rounded cobbles in dark soil', (g) => {
    const v = g.n('voronoi', { scaleX: 9, scaleY: 9, rnd: 0.9, width: 0.12, stagger: 0.5 });
    const n = g.noise(24, 24, { octaves: 6 });
    const dome = g.n('curve', { y1: 0.55, y2: 0.82, y3: 0.95 }, { in: v.o('borders') });
    const h = g.math('Multiply', dome, g.lv(n, 0, 1, 1, 0.75, 1));
    const stone = g.blend(g.ramp(v.o('rand'), ['#545049', 0], ['#7b766c', 0.5], ['#9b948a', 1]), g.ramp(n, ['#777', 0], ['#fff', 1]), 'Multiply', 0.8);
    g.out({ albedo: g.mix(g.col('#2e2720'), stone, v.o('borders'), 6), roughness: g.mix(g.gray(1), g.gray(0.7), v.o('borders')), height: h, ao: g.ao(h, 30, 1.8) }, { normalStrength: 2.2 });
  });
  P('Paving slabs', 'Bricks & tiles', 'Big concrete slabs, slightly uneven', (g) => {
    const b = g.n('bricks', { rows: 3, cols: 3, offset: 0.5, mortar: 0.025, bevel: 0.03, round: 0.02 });
    const n = g.noise(16, 16, { octaves: 7, persist: 0.55 }), sp = g.n('spots', { cells: 30, size: 0.25, chance: 0.3, soft: 0.9 });
    const slab = g.blend(g.ramp(g.math('Average', b.o('rand'), n), ['#8d8b86', 0], ['#b3b0a8', 1]), sp, 'Multiply', 0.2);
    const h = g.math('Multiply', b.o('bricks'), g.lv(n, 0, 1, 1, 0.9, 1));
    g.out({ albedo: g.mix(g.col('#4b4842'), slab, b.o('bricks'), 6), roughness: g.gray(0.92), height: h, ao: g.ao(h, 12) });
  });
  P('Mosaic tiles', 'Bricks & tiles', 'Small glass mosaic in mixed blues', (g) => {
    const b = g.n('bricks', { rows: 24, cols: 24, offset: 0, jitter: 0.15, mortar: 0.08, bevel: 0.15, round: 0.15 });
    const tile = g.ramp(b.o('rand'), ['#0d3b66', 0], ['#1f6f9f', 0.35], ['#3fa7c9', 0.7], ['#c7eef5', 1]);
    g.out({ albedo: g.mix(g.col('#d9d4c7'), tile, b.o('bricks'), 6), roughness: g.mix(g.gray(0.85), g.gray(0.08), b.o('bricks'), 6), height: b.o('bricks'), ao: g.ao(b.o('bricks'), 6) });
  });
  P('Roof shingles', 'Bricks & tiles', 'Overlapping slate shingles', (g) => {
    const b = g.n('bricks', { rows: 10, cols: 6, mortar: 0.015, bevel: 0.01, round: 0.02, jitter: 0.1 });
    const lap = g.n('gradient', { type: 1, repeat: 10 });
    const n = g.noise(6, 24, { octaves: 5 });
    const h = g.math('Multiply', b.o('bricks'), g.math('Average', g.n('curve', { y0: 0.2, y1: 0.45, y2: 0.65, y3: 0.85, y4: 1 }, { in: lap }), n));
    g.out({ albedo: g.blend(g.ramp(b.o('rand'), ['#2d3136', 0], ['#454b52', 1]), g.ramp(n, ['#888', 0], ['#fff', 1]), 'Multiply', 0.6), roughness: g.gray(0.75), height: h, ao: g.ao(h, 14, 1.5) }, { normalStrength: 2 });
  });

  // ==================================================================================== Stone & concrete
  P('Granite', 'Stone & concrete', 'Polished speckled granite', (g) => {
    const a = g.noise(64, 64, { type: 2, octaves: 3 }), b = g.noise(32, 32, { type: 0, octaves: 4 }), sp = g.n('spots', { cells: 48, size: 0.5, svar: 0.8, soft: 0.1, chance: 0.5 });
    const col = g.blend(g.ramp(g.math('Average', a, b), ['#2a2826', 0], ['#77706a', 0.45], ['#c9bfb6', 0.7], ['#e8e0d8', 1]), g.ramp(sp, ['#ffffff', 0], ['#3a2a28', 1]), 'Multiply', 0.8);
    g.out({ albedo: col, roughness: g.gray(0.15), height: g.lv(b, 0, 1, 1, 0.48, 0.52) }, { normalStrength: 0.3 });
  });
  P('White marble', 'Stone & concrete', 'Carrara-like marble with soft grey veins', (g) => {
    // veins = thin bands where two warped noise fields cross 0.5
    const f = g.flow(2, { warp: 4, octaves: 7 }), f2 = g.flow(4, { warp: 3, octaves: 6 });
    const vein = g.n('tonesstep', { value: 0.025, width: 0.03, invert: true }, { in: g.math('Difference', f, g.gray(0.5)) });
    const fine = g.n('tonesstep', { value: 0.01, width: 0.015, invert: true }, { in: g.math('Difference', f2, g.gray(0.5)) });
    const v = g.math('Max', vein, g.lv(fine, 0, 1, 1, 0, 0.45));
    const base = g.ramp(g.noise(3, 3, { octaves: 6 }), ['#e6e4df', 0], ['#f8f7f4', 1]);
    g.out({ albedo: g.blend(base, g.ramp(v, ['#ffffff', 0], ['#7d7b77', 1]), 'Multiply', 0.85), roughness: g.gray(0.08), height: g.gray(0.5) });
  });
  P('Black marble', 'Stone & concrete', 'Nero marquina: black with white veins', (g) => {
    const f = g.flow(2, { warp: 4, octaves: 7 });
    const veins = g.n('tonesstep', { value: 0.02, width: 0.03, invert: true }, { in: g.math('Difference', f, g.gray(0.5)) });
    const thin = g.n('tonesstep', { value: 0.008, width: 0.012, invert: true }, { in: g.math('Difference', g.flow(5, { warp: 3, octaves: 6 }), g.gray(0.5)) });
    g.out({ albedo: g.ramp(g.math('Max', veins, g.lv(thin, 0, 1, 1, 0, 0.6)), ['#0d0d0f', 0], ['#2a2a2e', 0.3], ['#e8e6e0', 1]), roughness: g.gray(0.06) });
  });
  P('Slate', 'Stone & concrete', 'Layered dark slate with flaky ridges', (g) => {
    const n = g.noise(4, 24, { octaves: 8, persist: 0.6 }), r = g.noise(2, 16, { mode: 1, octaves: 6 });
    const h = g.n('posterize', { steps: 6 }, { in: g.math('Average', n, r) });
    const hb = g.n('blur', { radius: 2 }, { in: h });
    g.out({ albedo: g.ramp(g.math('Average', n, hb), ['#24272b', 0], ['#3d4248', 0.5], ['#5b6168', 1]), roughness: g.lv(n, 0, 1, 1, 0.55, 0.85), height: hb, ao: g.ao(hb, 18) }, { normalStrength: 1.5 });
  });
  P('Sandstone', 'Stone & concrete', 'Warm layered sandstone', (g) => {
    const layers = g.n('stripes', { count: 14, dir: 1, wave: 0, warp: 0.7, warpScale: 2 });
    const n = g.noise(32, 32, { type: 2, octaves: 4 }), big = g.noise(4, 4, { octaves: 6 });
    const h = g.math('Average', g.math('Average', layers, n), big);
    g.out({ albedo: g.ramp(h, ['#a9714a', 0], ['#cf9b6b', 0.45], ['#e6c193', 0.75], ['#f1dbb6', 1]), roughness: g.gray(0.95), height: h, ao: g.ao(h, 16) }, { normalStrength: 1.4 });
  });
  P('Concrete', 'Stone & concrete', 'Smooth cast concrete with pores and stains', (g) => {
    const n = g.noise(8, 8, { octaves: 8, persist: 0.55 }), pores = g.n('spots', { cells: 64, size: 0.25, svar: 0.9, soft: 0.2, chance: 0.35 });
    const stain = g.flow(2, { warp: 1.5 });
    const col = g.blend(g.blend(g.ramp(n, ['#8a8883', 0], ['#a9a7a1', 1]), g.ramp(stain, ['#7a776f', 0], ['#ffffff', 0.6]), 'Multiply', 0.6), g.ramp(pores, ['#ffffff', 0], ['#3c3b38', 1]), 'Multiply', 0.7);
    const h = g.math('Subtract', g.lv(n, 0, 1, 1, 0.45, 0.55), g.lv(pores, 0, 1, 1, 0, 0.2));
    g.out({ albedo: col, roughness: g.lv(n, 0, 1, 1, 0.8, 0.95), height: h, ao: g.ao(h, 6) }, { normalStrength: 1 });
  });
  P('Asphalt', 'Stone & concrete', 'Road tarmac: dark binder, light grit', (g) => {
    const grit = g.noise(96, 96, { type: 2, octaves: 2 }), n = g.noise(8, 8, { octaves: 6 }), stones = g.n('scatter', { cells: 40, scale: 0.35, svar: 0.6, vvar: 0.6 });
    const col = g.blend(g.ramp(g.math('Average', grit, n), ['#1a1a1b', 0], ['#2c2c2e', 0.6], ['#57575a', 1]), g.ramp(stones, ['#000000', 0], ['#6e6c68', 1]), 'Lighten', 0.8);
    g.out({ albedo: col, roughness: g.gray(0.9), height: g.math('Average', grit, stones), ao: g.ao(stones, 8) }, { normalStrength: 1.2 });
  });
  P('Gravel', 'Stone & concrete', 'Loose angular gravel', (g) => {
    const v = g.n('voronoi', { scaleX: 20, scaleY: 20, rnd: 1, width: 0.08 });
    const n = g.noise(64, 64, { octaves: 3 });
    const h = g.math('Multiply', g.n('curve', { y1: 0.6, y2: 0.85, y3: 0.95 }, { in: v.o('borders') }), g.lv(v.o('rand'), 0, 1, 1, 0.5, 1));
    g.out({ albedo: g.blend(g.ramp(v.o('rand'), ['#5a554e', 0], ['#8e877c', 0.5], ['#b9b0a2', 0.8], ['#6f6355', 1]), g.ramp(n, ['#777', 0], ['#fff', 1]), 'Multiply', 0.7), roughness: g.gray(0.9), height: h, ao: g.ao(h, 14, 2) }, { normalStrength: 2 });
  });
  P('River pebbles', 'Stone & concrete', 'Smooth rounded pebbles', (g) => {
    const s = g.n('scatter', { cells: 6, per: 4, scale: 1.25, svar: 0.4, rvar: 1, jitter: 1, vvar: 0, mode: 2 }, { shape: g.n('transform', { rx: 1, ry: 1 }, { in: g.n('shape', { type: 0, radius: 0.92, edge: 0.45 }) }) });
    const n = g.noise(32, 32, { octaves: 4 });
    const col = g.blend(g.ramp(s.o('id'), ['#6b6660', 0], ['#a29a8e', 0.4], ['#c9c1b5', 0.7], ['#5c5a58', 1]), g.ramp(n, ['#999', 0], ['#fff', 1]), 'Multiply', 0.6);
    const dome = g.n('curve', { y1: 0.55, y2: 0.8, y3: 0.93 }, { in: g.n('blur', { radius: 4 }, { in: s }) });
    g.out({ albedo: g.mix(g.col('#3d342b'), col, g.n('tonesstep', { value: 0.05, width: 0.05 }, { in: s }), 4), roughness: g.gray(0.45), height: dome, ao: g.ao(dome, 24, 2) }, { normalStrength: 1.6, depth: 0.03 });
  });
  P('Rock cliff', 'Stone & concrete', 'Rough cracked rock face', (g) => {
    const r = g.noise(4, 6, { mode: 1, octaves: 9, persist: 0.55 }), c = g.n('cracks', { scale: 5, width: 0.03, warp: 1 });
    const h = g.math('A − B·inverse', r, g.lv(c, 0, 1, 1, 0, 0.6));
    const col = g.blend(g.ramp(h, ['#3b3632', 0], ['#6c645b', 0.5], ['#9c9286', 1]), g.ramp(g.n('curvature', { radius: 2, strength: 8 }, { in: h }), ['#666', 0], ['#fff', 0.6]), 'Multiply', 0.8);
    g.out({ albedo: col, roughness: g.gray(0.92), height: h, ao: g.ao(h, 30, 1.6) }, { normalStrength: 2.4 });
  });
  P('Terrazzo', 'Stone & concrete', 'Cement with coloured stone chips', (g) => {
    const chips = g.n('scatter', { cells: 18, per: 2, scale: 0.6, svar: 0.7, vvar: 0, mode: 2 }, { shape: g.n('shape', { type: 2, sides: 5, radius: 0.7, edge: 0.03 }) });
    const col = g.mix(g.col('#e7e2d8'), g.ramp(chips.o('id'), ['#c0583f', 0], ['#e7b04a', 0.3], ['#3f6e6a', 0.6], ['#2d2d2d', 0.8], ['#d9d0c0', 1]), g.n('tonesstep', { value: 0.4, width: 0.05 }, { in: chips }), 4);
    g.out({ albedo: col, roughness: g.gray(0.25), height: g.gray(0.5) });
  });

  // ==================================================================================== Wood
  P('Oak planks', 'Wood', 'Light oak floor boards', (g) => {
    const planks = g.n('transform', { rotate: 90 }, { in: g.n('bricks', { rows: 6, cols: 2, offset: 0.37, jitter: 0.5, mortar: 0.012, bevel: 0.02, round: 0.01 }) });
    const w = g.n('wood', { rings: 18, warp: 0.8, sharp: 2, grainX: 160, grain: 0.4 });
    const wv = g.n('warp', { mode: 1, amount: 0.15, angle: 90 }, { in: w, by: g.noise(1, 6, { octaves: 2 }) });
    const col = g.ramp(wv, ['#8a5a32', 0], ['#b98552', 0.5], ['#d7aa76', 1]);
    g.out({ albedo: g.blend(col, g.ramp(g.n('channel', { ch: 4 }, { in: planks }), ['#3a2414', 0], ['#ffffff', 0.5]), 'Multiply', 1), roughness: g.lv(w, 0, 1, 1, 0.5, 0.7), height: g.math('Multiply', planks, g.lv(wv, 0, 1, 1, 0.9, 1)), ao: g.ao(planks, 6) }, { normalStrength: 1 });
  });
  P('Herringbone parquet', 'Wood', 'Herringbone oak parquet', (g) => {
    const hb = g.n('herringbone', { count: 12, ratio: 4, gap: 0.04, bevel: 0.06 });
    const grainA = g.n('wood', { rings: 40, warp: 0.4, grainX: 200 });
    const grainB = g.n('transform', { rotate: 90 }, { in: grainA });
    const grain = g.mix(grainB, grainA, hb.o('dir'), 1);
    const col = g.blend(g.ramp(grain, ['#7a4a26', 0], ['#a8703f', 0.5], ['#c9925c', 1]), g.ramp(hb.o('rand'), ['#a0a0a0', 0], ['#ffffff', 1]), 'Multiply', 1);
    g.out({ albedo: g.mix(g.col('#2a1a10'), col, hb.o('planks'), 6), roughness: g.gray(0.4), height: hb.o('planks'), ao: g.ao(hb.o('planks'), 6) }, { normalStrength: 1 });
  });
  P('Dark walnut', 'Wood', 'Rich dark walnut, satin finish', (g) => {
    const w = g.n('wood', { rings: 8, warp: 1.2, sharp: 1.2, grainX: 220, grain: 0.5 });
    g.out({ albedo: g.ramp(w, ['#2a170c', 0], ['#4a2c18', 0.5], ['#6e4527', 1]), roughness: g.gray(0.35), height: g.lv(w, 0, 1, 1, 0.48, 0.52) }, { normalStrength: 0.6 });
  });
  P('Pine wood', 'Wood', 'Pale pine with strong rings and knots', (g) => {
    const w = g.n('wood', { rings: 6, warp: 1.6, sharp: 3, grainX: 120, grain: 0.3 });
    const knots = g.n('spots', { cells: 3, size: 0.3, svar: 0.4, soft: 0.8, chance: 0.5 });
    const ww = g.n('warp', { mode: 0, amount: 0.6 }, { in: w, by: knots });
    g.out({ albedo: g.blend(g.ramp(ww, ['#c99b62', 0], ['#e5c28f', 0.6], ['#f0d9ad', 1]), g.ramp(knots, ['#fff', 0], ['#6b4022', 1]), 'Multiply', 0.9), roughness: g.gray(0.6), height: g.lv(ww, 0, 1, 1, 0.45, 0.55) });
  });
  P('Weathered painted wood', 'Wood', 'Blue painted boards, paint peeling to grey wood', (g) => {
    const planks = g.n('transform', { rotate: 90 }, { in: g.n('bricks', { rows: 5, cols: 1, offset: 0, mortar: 0.012, bevel: 0.02, round: 0 }) });
    const w = g.n('transform', { rotate: 90 }, { in: g.n('wood', { rings: 10, warp: 0.8, grainX: 160 }) });
    const peel = g.n('tonesstep', { value: 0.55, width: 0.03 }, { in: g.math('Average', g.noise(6, 12, { octaves: 7 }), w) });
    const wood = g.ramp(w, ['#5f5a52', 0], ['#8f887c', 1]);
    const paint = g.ramp(g.noise(30, 30), ['#2f6f8f', 0], ['#4c90ad', 1]);
    const h = g.math('Multiply', planks, g.math('Add', g.lv(w, 0, 1, 1, 0, 0.3), g.lv(peel, 0, 1, 1, 0, 0.3)));
    g.out({ albedo: g.blend(g.mix(wood, paint, peel), g.ramp(planks, ['#222', 0], ['#fff', 0.5]), 'Multiply', 1), roughness: g.mix(g.gray(0.9), g.gray(0.6), peel), height: h, ao: g.ao(h, 8) }, { normalStrength: 1.6 });
  });
  P('Plywood', 'Wood', 'Birch plywood sheet', (g) => {
    const w = g.n('wood', { rings: 4, warp: 2, sharp: 0.8, grainX: 90, grain: 0.5 });
    g.out({ albedo: g.ramp(g.n('transform', { rotate: 90 }, { in: w }), ['#c8a77a', 0], ['#e3c9a0', 1]), roughness: g.gray(0.75), height: g.gray(0.5) });
  });
  P('Tree bark', 'Wood', 'Deep furrowed bark', (g) => {
    const v = g.n('voronoi', { scaleX: 6, scaleY: 2, rnd: 1, width: 0.25 });
    const f = g.noise(4, 1, { mode: 1, octaves: 7 });
    const h0 = g.math('Average', v.o('borders'), f);
    const h = g.n('warp', { mode: 1, amount: 0.05, angle: 0 }, { in: h0, by: g.noise(8, 2, { octaves: 4 }) });
    g.out({ albedo: g.ramp(h, ['#1c140e', 0], ['#3e2e22', 0.4], ['#6a5949', 0.8], ['#8d8070', 1]), roughness: g.gray(0.95), height: h, ao: g.ao(h, 30, 2) }, { normalStrength: 2.6 });
  });
  P('Bamboo', 'Wood', 'Bamboo stalks side by side', (g) => {
    const st = g.n('stripes', { count: 6, dir: 0, wave: 1 });
    const nodesM = g.n('bricks', { rows: 2, cols: 6, offset: 0.5, jitter: 1, mortar: 0.015, bevel: 0.04 });
    const h = g.math('Multiply', g.n('curve', { y1: 0.6, y2: 0.85, y3: 0.97 }, { in: st }), nodesM);
    const fib = g.noise(96, 2, { octaves: 3 });
    g.out({ albedo: g.blend(g.ramp(st, ['#7e7a3a', 0], ['#c8bd6a', 0.6], ['#e3d79a', 1]), g.ramp(fib, ['#bbb', 0], ['#fff', 1]), 'Multiply', 0.8), roughness: g.gray(0.35), height: h, ao: g.ao(h, 8) }, { normalStrength: 1.5 });
  });

  // ==================================================================================== Metal
  P('Brushed steel', 'Metal', 'Satin brushed stainless steel', (g) => {
    const f = g.n('fibers', { count: 256, length: 2, contrast: 1.2 });
    g.out({ albedo: g.ramp(f, ['#8e9195', 0], ['#c4c7cb', 1]), metallic: g.gray(1), roughness: g.lv(f, 0, 1, 1, 0.25, 0.4), height: g.lv(f, 0, 1, 1, 0.49, 0.51) }, { normalStrength: 0.4 });
  });
  P('Polished chrome', 'Metal', 'Mirror chrome', (g) => {
    g.out({ albedo: g.col('#e6e8ea'), metallic: g.gray(1), roughness: g.lv(g.noise(8, 8), 0, 1, 1, 0.02, 0.06) });
  });
  P('Gold', 'Metal', 'Polished gold with faint smudges', (g) => {
    const sm = g.flow(3, { warp: 2 });
    g.out({ albedo: g.ramp(sm, ['#d9a53e', 0], ['#f3c560', 1]), metallic: g.gray(1), roughness: g.lv(sm, 0, 1, 1, 0.1, 0.3) });
  });
  P('Copper patina', 'Metal', 'Copper with green verdigris in the low areas', (g) => {
    const n = g.noise(6, 6, { octaves: 8, persist: 0.6 }), sp = g.n('spots', { cells: 20, size: 0.6, svar: 0.8, soft: 0.8, chance: 0.6 });
    const pat = g.n('tonesstep', { value: 0.5, width: 0.15 }, { in: g.math('Average', g.n('invert', {}, { in: n }), sp) });
    const copper = g.ramp(n, ['#8a4a2a', 0], ['#c87850', 0.6], ['#e3a07a', 1]);
    const green = g.ramp(g.noise(32, 32, { type: 2 }), ['#3e8f7b', 0], ['#7fc6ad', 1]);
    g.out({ albedo: g.mix(copper, green, pat, 2), metallic: g.n('invert', {}, { in: pat }), roughness: g.mix(g.gray(0.3), g.gray(0.9), pat, 2), height: g.math('Add', g.lv(n, 0, 1, 1, 0.4, 0.5), g.lv(pat, 0, 1, 1, 0, 0.1)) }, { normalStrength: 0.8 });
  });
  P('Rusty iron', 'Metal', 'Corroded iron plate, flaking rust', (g) => {
    const n = g.noise(8, 8, { octaves: 9, persist: 0.62 }), sp = g.n('spots', { cells: 16, size: 0.9, svar: 0.7, soft: 0.6, chance: 0.7 });
    const rust = g.n('tonesstep', { value: 0.45, width: 0.12 }, { in: g.math('Average', n, sp) });
    const steel = g.ramp(g.noise(48, 48), ['#55585c', 0], ['#7b7f84', 1]);
    const rc = g.ramp(g.noise(24, 24, { type: 2, octaves: 5 }), ['#3f1a0b', 0], ['#7a3412', 0.4], ['#b45c22', 0.75], ['#d9893a', 1]);
    const h = g.math('Add', g.lv(rust, 0, 1, 1, 0.4, 0.55), g.lv(g.noise(64, 64, { type: 2 }), 0, 1, 1, 0, 0.1));
    g.out({ albedo: g.mix(steel, rc, rust, 2), metallic: g.n('invert', {}, { in: rust }), roughness: g.mix(g.gray(0.35), g.gray(0.95), rust, 2), height: h, ao: g.ao(h, 10) }, { normalStrength: 1.2 });
  });
  P('Corrugated metal', 'Metal', 'Galvanised corrugated sheet', (g) => {
    const w = g.n('stripes', { count: 16, dir: 0, wave: 0 });
    const n = g.noise(10, 10, { octaves: 6 }), spots = g.n('spots', { cells: 12, size: 0.5, chance: 0.4, soft: 0.9 });
    g.out({ albedo: g.blend(g.ramp(n, ['#8c9196', 0], ['#b8bdc2', 1]), g.ramp(spots, ['#fff', 0], ['#b9b2a2', 1]), 'Multiply', 1), metallic: g.gray(0.9), roughness: g.lv(n, 0, 1, 1, 0.35, 0.55), height: w }, { normalStrength: 3 });
  });
  P('Diamond tread plate', 'Metal', 'Aluminium checker plate', (g) => {
    const a = g.n('shape', { type: 1, repeat: 10, radius: 0.5, edge: 0.3, rotate: 45, stagger: 1 });
    const n = g.noise(32, 32);
    g.out({ albedo: g.ramp(n, ['#9da3a9', 0], ['#c5cad0', 1]), metallic: g.gray(1), roughness: g.lv(n, 0, 1, 1, 0.3, 0.5), height: g.n('transform', { rx: 1, ry: 2 }, { in: a }), ao: g.ao(a, 6) }, { normalStrength: 2 });
  });
  P('Perforated metal', 'Metal', 'Steel sheet with round holes', (g) => {
    const holes = g.n('shape', { type: 0, repeat: 16, radius: 0.55, edge: 0.04, stagger: 1 });
    const solid = g.n('invert', {}, { in: holes });
    g.out({ albedo: g.col('#9aa0a6'), metallic: g.gray(1), roughness: g.gray(0.35), height: solid, opacity: solid, ao: g.ao(solid, 4) }, { normalStrength: 1.5 });
  });
  P('Hammered copper', 'Metal', 'Hand-hammered copper dimples', (g) => {
    const v = g.n('voronoi', { scaleX: 14, scaleY: 14, rnd: 0.9, width: 0.3 });
    const h = g.n('curve', { y0: 0.2, y1: 0.55, y2: 0.8, y3: 0.95, y4: 1 }, { in: v.o('dist') });
    g.out({ albedo: g.ramp(g.noise(6, 6), ['#b0603a', 0], ['#d98a5c', 1]), metallic: g.gray(1), roughness: g.gray(0.25), height: g.n('invert', {}, { in: h }) }, { normalStrength: 1.5 });
  });
  P('Scratched aluminium', 'Metal', 'Matte aluminium with scratches', (g) => {
    const s = g.n('scratches', { cells: 12, layers: 3, length: 1, width: 0.012, spread: 1 });
    const n = g.noise(16, 16);
    g.out({ albedo: g.ramp(g.math('Max', n, g.lv(s, 0, 1, 1, 0, 0.6)), ['#a6abb0', 0], ['#d4d8dc', 1]), metallic: g.gray(1), roughness: g.mix(g.gray(0.5), g.gray(0.2), s), height: g.math('Subtract', g.gray(0.5), g.lv(s, 0, 1, 1, 0, 0.1)) }, { normalStrength: 1 });
  });
  P('Riveted steel panels', 'Metal', 'Painted steel panels with rivets', (g) => {
    const p = g.n('bricks', { rows: 2, cols: 2, offset: 0, mortar: 0.008, bevel: 0.01 });
    const rivets = g.n('shape', { type: 0, repeat: 16, radius: 0.18, edge: 0.6 });
    const border = g.n('tonesstep', { value: 0.5, width: 0.01, invert: true }, { in: g.n('bricks', { rows: 2, cols: 2, offset: 0, mortar: 0.08, bevel: 0.001 }) });
    const rv = g.math('Multiply', rivets, border);
    const n = g.noise(12, 12, { octaves: 7 });
    const h = g.math('Add', g.math('Multiply', p, g.gray(0.6)), g.lv(rv, 0, 1, 1, 0, 0.4));
    g.out({ albedo: g.ramp(n, ['#4d5a4a', 0], ['#66765f', 1]), metallic: g.gray(0.4), roughness: g.gray(0.55), height: h, ao: g.ao(h, 6) }, { normalStrength: 2 });
  });
  P('Galvanized steel', 'Metal', 'Spangled zinc coating', (g) => {
    const v = g.n('voronoi', { scaleX: 10, scaleY: 10, width: 0.01 });
    g.out({ albedo: g.ramp(g.math('Average', v.o('rand'), g.noise(32, 32)), ['#8b9096', 0], ['#c9ced3', 1]), metallic: g.gray(1), roughness: g.lv(v.o('rand'), 0, 1, 1, 0.2, 0.5) });
  });
  P('Carbon fibre', 'Metal', 'Woven carbon fibre under clear coat', (g) => {
    const w = g.n('weave', { count: 24, width: 0.95, bulge: 0.8 });
    const fib = g.n('fibers', { count: 512, length: 1 });
    const sheen = g.mix(g.ramp(fib, ['#0d0d0f', 0], ['#2c2d31', 1]), g.ramp(g.n('transform', { rotate: 90 }, { in: fib }), ['#0d0d0f', 0], ['#2c2d31', 1]), w.o('weft'));
    g.out({ albedo: g.blend(sheen, g.ramp(w, ['#000', 0], ['#fff', 1]), 'Multiply', 0.8), metallic: g.gray(0.2), roughness: g.gray(0.12), height: w }, { normalStrength: 0.5 });
  });

  // ==================================================================================== Fabric & leather
  P('Denim', 'Fabric & leather', 'Indigo twill denim', (g) => {
    const tw = g.n('stripes', { count: 96, dir: 2, wave: 0 });
    const n = g.noise(4, 64, { octaves: 5 }), slub = g.noise(2, 128, { octaves: 2 });
    const col = g.blend(g.ramp(g.math('Average', tw, n), ['#14243f', 0], ['#2b4a7a', 0.6], ['#6f8db5', 1]), g.ramp(slub, ['#bbb', 0], ['#fff', 1]), 'Multiply', 1);
    g.out({ albedo: col, roughness: g.gray(0.95), height: tw }, { normalStrength: 0.8 });
  });
  P('Linen', 'Fabric & leather', 'Natural linen weave with slubs', (g) => {
    const w = g.n('weave', { count: 64, width: 0.85, bulge: 0.5 });
    const slub = g.math('Average', g.noise(2, 96, { octaves: 2 }), g.noise(96, 2, { octaves: 2 }));
    g.out({ albedo: g.blend(g.ramp(slub, ['#c4b69c', 0], ['#e2d7c2', 1]), g.ramp(w, ['#888', 0], ['#fff', 1]), 'Multiply', 0.6), roughness: g.gray(0.95), height: w, ao: g.ao(w, 2) }, { normalStrength: 0.8 });
  });
  P('Burlap', 'Fabric & leather', 'Coarse jute sacking', (g) => {
    const w = g.n('weave', { count: 24, width: 0.7, bulge: 0.7 });
    const fib = g.noise(4, 128, { octaves: 3 });
    g.out({ albedo: g.blend(g.ramp(fib, ['#8a6c45', 0], ['#bb9a6c', 1]), g.ramp(w.o('threads'), ['#2a2016', 0], ['#ffffff', 1]), 'Multiply', 1), roughness: g.gray(1), height: w, ao: g.ao(w, 4, 1.5), opacity: g.lv(w.o('threads'), 0, 1, 1, 0.3, 1) }, { normalStrength: 1.4 });
  });
  P('Canvas', 'Fabric & leather', 'Tight cotton canvas', (g) => {
    const w = g.n('weave', { count: 96, width: 0.9, bulge: 0.4 });
    g.out({ albedo: g.ramp(g.math('Average', w, g.noise(8, 8)), ['#d8d0bd', 0], ['#efe9db', 1]), roughness: g.gray(0.95), height: w }, { normalStrength: 0.6 });
  });
  P('Tartan wool', 'Fabric & leather', 'Wool plaid (uses the TypeLab tartan generator)', (g) => {
    const p = g.n('pattern', { gen: 'tx-tartan', repeat: 2 });
    const w = g.n('weave', { count: 128, width: 0.95, bulge: 0.4 });
    const fuzz = g.noise(128, 128, { octaves: 2 });
    g.out({ albedo: g.blend(p, g.ramp(g.math('Average', w, fuzz), ['#888', 0], ['#fff', 1]), 'Multiply', 0.5), roughness: g.gray(1), height: w }, { normalStrength: 0.5 });
  });
  P('Leather', 'Fabric & leather', 'Brown pebbled leather', (g) => {
    const v = g.n('voronoi', { scaleX: 40, scaleY: 40, rnd: 1, width: 0.2 });
    const n = g.noise(6, 6, { octaves: 6 });
    const h = g.math('Multiply', g.n('curve', { y1: 0.6, y2: 0.85, y3: 0.95 }, { in: v.o('borders') }), g.lv(n, 0, 1, 1, 0.8, 1));
    g.out({ albedo: g.blend(g.ramp(n, ['#4a2a17', 0], ['#7a4a2a', 1]), g.ramp(v.o('borders'), ['#555', 0], ['#fff', 1]), 'Multiply', 0.5), roughness: g.lv(v.o('borders'), 0, 1, 1, 0.75, 0.5), height: h, ao: g.ao(h, 4) }, { normalStrength: 1 });
  });
  P('Black leather', 'Fabric & leather', 'Smooth black leather with creases', (g) => {
    const v = g.n('voronoi', { scaleX: 60, scaleY: 60, rnd: 1, width: 0.12 });
    const crease = g.n('tonesstep', { value: 0.5, width: 0.04 }, { in: g.n('cracks', { scale: 3, width: 0.01, warp: 1.5 }) });
    const h = g.math('Subtract', g.lv(v.o('borders'), 0, 1, 1, 0.45, 0.5), g.lv(crease, 0, 1, 1, 0, 0.15));
    g.out({ albedo: g.ramp(g.noise(8, 8), ['#0e0e10', 0], ['#1d1d20', 1]), roughness: g.gray(0.4), height: h }, { normalStrength: 1 });
  });
  P('Velvet', 'Fabric & leather', 'Crushed velvet with soft sheen', (g) => {
    const f = g.flow(4, { warp: 3 });
    g.out({ albedo: g.ramp(f, ['#3d0a1e', 0], ['#7a1838', 0.6], ['#a8345a', 1]), roughness: g.lv(f, 0, 1, 1, 0.6, 0.9), height: g.lv(f, 0, 1, 1, 0.45, 0.55) });
  });
  P('Knit wool', 'Fabric & leather', 'Chunky stockinette knit (TypeLab knit generator)', (g) => {
    const p = g.n('pattern', { gen: 'tx-cable-knit', repeat: 1 });
    g.out({ albedo: p.o('color'), roughness: g.gray(1), height: p.o('gray'), ao: g.ao(p.o('gray'), 8, 1.4) }, { normalStrength: 1.5 });
  });
  P('Carpet', 'Fabric & leather', 'Dense loop-pile carpet', (g) => {
    const n = g.noise(256, 256, { type: 2, octaves: 2 }), big = g.noise(8, 8, { octaves: 4 });
    g.out({ albedo: g.ramp(g.math('Average', n, big), ['#3d4450', 0], ['#5f6878', 1]), roughness: g.gray(1), height: n, ao: g.ao(n, 3, 2) }, { normalStrength: 1.2 });
  });

  // ==================================================================================== Ground & nature
  P('Dry cracked mud', 'Ground & nature', 'Sun-baked mud plates', (g) => {
    const c = g.n('cracks', { scale: 5, width: 0.05, warp: 0.8 });
    const n = g.noise(12, 12, { octaves: 6 });
    const h = g.math('Multiply', g.n('curve', { y1: 0.5, y2: 0.75, y3: 0.9 }, { in: c.o('cells') }), g.lv(n, 0, 1, 1, 0.75, 1));
    g.out({ albedo: g.blend(g.ramp(n, ['#8a6a4a', 0], ['#b8956c', 1]), g.ramp(c.o('cells'), ['#3a2a1c', 0], ['#ffffff', 0.5]), 'Multiply', 1), roughness: g.gray(1), height: h, ao: g.ao(h, 12, 1.6) }, { normalStrength: 2 });
  });
  P('Sand dunes', 'Ground & nature', 'Wind-rippled sand', (g) => {
    const rip = g.n('stripes', { count: 20, dir: 1, wave: 3, warp: 0.8, warpScale: 4 });
    const grain = g.noise(256, 256, { type: 0, octaves: 1 });
    const h = g.math('Average', g.n('blur', { radius: 3 }, { in: rip }), g.lv(grain, 0, 1, 1, 0.4, 0.6));
    g.out({ albedo: g.ramp(g.math('Average', h, grain), ['#c99d64', 0], ['#e8c78f', 1]), roughness: g.gray(0.95), height: h }, { normalStrength: 1.2 });
  });
  P('Forest floor', 'Ground & nature', 'Leaves, twigs and soil', (g) => {
    const leaf = g.n('shape', { type: 3, sides: 2, radius: 0.9, inner: 0.25, edge: 0.05 });
    const leaves = g.n('scatter', { cells: 10, per: 4, scale: 0.9, svar: 0.4, vvar: 0, mode: 2 }, { shape: leaf });
    const twigs = g.n('scratches', { cells: 6, layers: 2, width: 0.03, spread: 1, length: 1.2 });
    const soil = g.ramp(g.noise(16, 16, { octaves: 6 }), ['#2a1d13', 0], ['#4a3726', 1]);
    const lc = g.ramp(leaves.o('id'), ['#6b3d16', 0], ['#a2591d', 0.3], ['#c58a2e', 0.6], ['#7a6a2a', 0.85], ['#4b3a1c', 1]);
    const mask = g.n('tonesstep', { value: 0.2, width: 0.05 }, { in: leaves });
    const h = g.math('Max', leaves, g.lv(twigs, 0, 1, 1, 0, 0.8));
    g.out({ albedo: g.mix(g.mix(soil, g.col('#3b2b1d'), twigs), lc, mask, 4), roughness: g.gray(0.85), height: h, ao: g.ao(h, 20, 2) }, { normalStrength: 1.6 });
  });
  P('Grass', 'Ground & nature', 'Short grass blades seen from above', (g) => {
    const blade = g.n('shape', { type: 3, sides: 2, radius: 1, inner: 0.08, edge: 0.1 });
    const blades = g.n('scatter', { cells: 30, per: 4, scale: 0.9, svar: 0.5, vvar: 0.4, mode: 0 }, { shape: blade });
    g.out({ albedo: g.ramp(g.math('Average', blades, g.noise(6, 6)), ['#1f3a12', 0], ['#3f7a24', 0.5], ['#8fbf4a', 1]), roughness: g.gray(0.7), height: blades, ao: g.ao(blades, 10, 2) }, { normalStrength: 1.5 });
  });
  P('Moss', 'Ground & nature', 'Soft clumpy moss', (g) => {
    const n = g.noise(24, 24, { type: 2, mode: 2, octaves: 5 }), big = g.noise(4, 4, { octaves: 5 });
    const h = g.math('Multiply', n, big);
    g.out({ albedo: g.ramp(h, ['#1d2e0c', 0], ['#3f5f17', 0.4], ['#7a9a2f', 1]), roughness: g.gray(0.95), height: h, ao: g.ao(h, 10, 1.6) }, { normalStrength: 2 });
  });
  P('Snow', 'Ground & nature', 'Fresh snow with sparkle', (g) => {
    const n = g.noise(4, 4, { octaves: 7 }), sp = g.n('spots', { cells: 128, size: 0.12, soft: 0, chance: 0.15 });
    g.out({ albedo: g.ramp(n, ['#dfe8f2', 0], ['#ffffff', 1]), roughness: g.mix(g.gray(0.7), g.gray(0.05), sp), height: n, emission: g.ramp(sp, ['#000000', 0], ['#3a3a3a', 1]) }, { normalStrength: 0.8 });
  });
  P('Ice', 'Ground & nature', 'Cracked blue ice', (g) => {
    const c = g.n('cracks', { scale: 4, width: 0.01, warp: 0.4 });
    const f = g.flow(3, { warp: 2 });
    g.out({ albedo: g.blend(g.ramp(f, ['#7fb5d6', 0], ['#cfe8f5', 1]), g.ramp(c, ['#000', 0], ['#ffffff', 1]), 'Screen', 0.8), roughness: g.gray(0.05), height: g.math('Subtract', g.gray(0.5), g.lv(c, 0, 1, 1, 0, 0.2)) }, { normalStrength: 1 });
  });
  P('Lava', 'Ground & nature', 'Cooling lava crust with glowing cracks', (g) => {
    const c = g.n('cracks', { scale: 4, width: 0.12, warp: 1.2 });
    const f = g.flow(4, { warp: 3 });
    const glow = g.math('Multiply', c, g.lv(f, 0.2, 1, 1, 0.3, 1));
    g.out({ albedo: g.ramp(g.noise(16, 16, { type: 2 }), ['#141110', 0], ['#2c2522', 1]), roughness: g.gray(0.9), height: g.n('invert', {}, { in: c }), emission: g.ramp(glow, ['#000000', 0], ['#ff3d00', 0.5], ['#ffd27a', 1]) }, { normalStrength: 2, emissive: 2 });
  });
  P('Water ripples', 'Ground & nature', 'Calm water surface', (g) => {
    const f = g.flow(3, { warp: 2, octaves: 4 });
    g.out({ albedo: g.col('#123a52'), roughness: g.gray(0.02), height: g.lv(f, 0, 1, 1, 0.45, 0.55), metallic: g.gray(0) }, { normalStrength: 2 });
  });

  // ==================================================================================== Organic
  P('Reptile scales', 'Organic', 'Green lizard scales', (g) => {
    const v = g.n('voronoi', { scaleX: 16, scaleY: 16, rnd: 0.4, width: 0.12, stagger: 1 });
    const dome = g.n('curve', { y1: 0.5, y2: 0.8, y3: 0.95 }, { in: v.o('borders') });
    g.out({ albedo: g.blend(g.ramp(g.math('Average', v.o('rand'), g.noise(4, 4)), ['#20351a', 0], ['#4e7a2c', 0.6], ['#a8b85a', 1]), g.ramp(dome, ['#111', 0], ['#fff', 0.7]), 'Multiply', 1), roughness: g.gray(0.4), height: dome, ao: g.ao(dome, 6) }, { normalStrength: 1.5 });
  });
  P('Fish scales', 'Organic', 'Overlapping silvery scales', (g) => {
    const s = g.n('shape', { type: 0, repeat: 12, radius: 1, edge: 0.6, stagger: 1 });
    g.out({ albedo: g.ramp(s, ['#3a4a5a', 0], ['#a9c1d0', 0.7], ['#e9f2f5', 1]), metallic: g.gray(0.8), roughness: g.gray(0.2), height: s }, { normalStrength: 1.2 });
  });
  P('Honeycomb', 'Organic', 'Wax honeycomb cells', (g) => {
    const t = g.n('hextiles', { count: 10, gap: 0.1, bevel: 0.3 });
    const h = g.n('invert', {}, { in: t.o('tiles') });
    g.out({ albedo: g.ramp(t.o('tiles'), ['#f4c430', 0], ['#c27c0e', 1]), roughness: g.gray(0.25), height: h, ao: g.ao(h, 16, 1.6) }, { normalStrength: 2 });
  });
  P('Skin pores', 'Organic', 'Close-up skin with pores', (g) => {
    const pores = g.n('spots', { cells: 64, size: 0.25, svar: 0.6, soft: 0.6, chance: 0.6 });
    const n = g.noise(8, 8, { octaves: 6 });
    g.out({ albedo: g.ramp(n, ['#c98d72', 0], ['#e0aa8f', 1]), roughness: g.gray(0.55), height: g.math('Subtract', g.gray(0.5), g.lv(pores, 0, 1, 1, 0, 0.2)) }, { normalStrength: 0.8 });
  });
  P('Coral', 'Organic', 'Brain coral ridges', (g) => {
    const r = g.n('flow', { scale: 6, warp: 4, octaves: 3 });
    const h = g.n('curve', { y0: 0, y1: 0.9, y2: 0.1, y3: 0.9, y4: 0 }, { in: r });
    g.out({ albedo: g.ramp(h, ['#b0503a', 0], ['#f2a07a', 1]), roughness: g.gray(0.7), height: h, ao: g.ao(h, 10, 1.6) }, { normalStrength: 1.6 });
  });
  P('Leopard fur', 'Organic', 'Leopard print (TypeLab leopard generator) with fur fibres', (g) => {
    const p = g.n('pattern', { gen: 'leopard', repeat: 1 });
    const fur = g.n('fibers', { count: 256, length: 3, angle: 1 });
    g.out({ albedo: g.blend(p, g.ramp(fur, ['#999', 0], ['#fff', 1]), 'Multiply', 0.5), roughness: g.gray(0.9), height: fur }, { normalStrength: 0.6 });
  });

  // ==================================================================================== Sci-fi & tech
  P('Sci-fi panels', 'Sci-fi & tech', 'Greebled hull panels with seams', (g) => {
    const big = g.n('bricks', { rows: 3, cols: 2, offset: 0.5, mortar: 0.01, bevel: 0.03, round: 0.05 });
    const small = g.n('bricks', { rows: 8, cols: 6, offset: 0, mortar: 0.02, bevel: 0.05, jitter: 1 });
    const h = g.math('Average', big, g.math('Multiply', small, g.lv(small.o('rand'), 0, 1, 1, 0.3, 1)));
    g.out({ albedo: g.ramp(g.math('Average', big.o('rand'), small.o('rand')), ['#5c636b', 0], ['#8a939c', 1]), metallic: g.gray(0.8), roughness: g.lv(small.o('rand'), 0, 1, 1, 0.3, 0.6), height: h, ao: g.ao(h, 8, 1.4) }, { normalStrength: 2 });
  });
  P('Circuit board', 'Sci-fi & tech', 'Green PCB with copper traces', (g) => {
    const tr = g.n('herringbone', { count: 24, ratio: 3, gap: 0.42, bevel: 0.02 });
    const pads = g.n('shape', { type: 0, repeat: 24, radius: 0.35, edge: 0.05 });
    const padsSome = g.math('Multiply', pads, g.n('tonesstep', { value: 0.75, width: 0.01 }, { in: g.n('bricks', { rows: 24, cols: 24, offset: 0, mortar: 0 }).o('rand') }));
    const copper = g.math('Max', tr, padsSome);
    g.out({ albedo: g.mix(g.col('#0f4a2a'), g.col('#c89a4a'), copper, 4), metallic: copper, roughness: g.mix(g.gray(0.5), g.gray(0.25), copper), height: g.lv(copper, 0, 1, 1, 0.45, 0.55) }, { normalStrength: 1 });
  });
  P('Neon grid', 'Sci-fi & tech', 'Glowing synthwave grid on black', (g) => {
    const gr = g.n('grid', { countX: 8, countY: 8, width: 0.03, soft: 0.04 });
    g.out({ albedo: g.col('#0a0610'), roughness: g.gray(0.3), emission: g.ramp(gr, ['#000000', 0], ['#ff2bd6', 0.5], ['#ffd6f6', 1]), height: gr }, { emissive: 3, normalStrength: 0.4 });
  });
  P('Hex shield', 'Sci-fi & tech', 'Energy shield hexagons', (g) => {
    const t = g.n('hextiles', { count: 12, gap: 0.06, bevel: 0.25 });
    const edge = g.n('invert', {}, { in: t.o('tiles') });
    g.out({ albedo: g.col('#05121a'), emission: g.ramp(g.math('Max', edge, g.lv(t.o('rand'), 0.8, 1, 1, 0, 0.5)), ['#000000', 0], ['#19c3ff', 0.6], ['#e5fbff', 1]), roughness: g.gray(0.2), height: t.o('tiles') }, { emissive: 2.5 });
  });
  P('Rubber tread', 'Sci-fi & tech', 'Anti-slip rubber mat', (g) => {
    const s = g.n('shape', { type: 1, repeat: 12, radius: 0.35, edge: 0.2 });
    const n = g.noise(64, 64, { type: 2, octaves: 2 });
    g.out({ albedo: g.ramp(n, ['#141414', 0], ['#262626', 1]), roughness: g.gray(0.85), height: s, ao: g.ao(s, 6) }, { normalStrength: 2 });
  });
  P('Foam', 'Sci-fi & tech', 'Acoustic foam / sponge', (g) => {
    const v = g.n('voronoi', { scaleX: 32, scaleY: 32, rnd: 1, width: 0.3 });
    const h = g.n('invert', {}, { in: v.o('cells') });
    g.out({ albedo: g.ramp(v.o('cells'), ['#3a3a3e', 0], ['#5a5a60', 1]), roughness: g.gray(1), height: h, ao: g.ao(h, 6, 2) }, { normalStrength: 1.5 });
  });

  // ==================================================================================== Plastic, paper & misc
  P('Glossy plastic', 'Plastic, paper & misc', 'Red ABS plastic', (g) => {
    g.out({ albedo: g.col('#c4202a'), roughness: g.lv(g.noise(16, 16), 0, 1, 1, 0.15, 0.25), height: g.gray(0.5) });
  });
  P('Textured plastic', 'Plastic, paper & misc', 'Grey leather-grain injection-moulded plastic', (g) => {
    const n = g.noise(96, 96, { type: 2, octaves: 3 });
    g.out({ albedo: g.ramp(n, ['#2d2f33', 0], ['#3a3d42', 1]), roughness: g.lv(n, 0, 1, 1, 0.5, 0.7), height: n }, { normalStrength: 0.6 });
  });
  P('Paper', 'Plastic, paper & misc', 'Cold-press watercolour paper', (g) => {
    const n = g.noise(32, 32, { octaves: 6 }), fib = g.n('fibers', { count: 128, length: 4 });
    const h = g.math('Average', n, g.lv(fib, 0, 1, 1, 0.3, 0.7));
    g.out({ albedo: g.ramp(h, ['#ece6d8', 0], ['#faf7f0', 1]), roughness: g.gray(0.95), height: h }, { normalStrength: 0.6 });
  });
  P('Cardboard', 'Plastic, paper & misc', 'Corrugated cardboard', (g) => {
    const st = g.n('stripes', { count: 24, dir: 0, wave: 0 });
    const n = g.noise(8, 64, { octaves: 4 });
    g.out({ albedo: g.ramp(g.math('Average', n, g.lv(st, 0, 1, 1, 0.3, 0.7)), ['#9a7448', 0], ['#c39c6c', 1]), roughness: g.gray(0.95), height: g.lv(st, 0, 1, 1, 0.4, 0.6) }, { normalStrength: 1 });
  });
  P('Chalkboard', 'Plastic, paper & misc', 'Smudged slate chalkboard', (g) => {
    const sm = g.flow(3, { warp: 2 }), sc = g.n('scratches', { cells: 8, width: 0.01, spread: 1, length: 1.4 });
    g.out({ albedo: g.blend(g.ramp(sm, ['#1d2422', 0], ['#2e3936', 1]), g.ramp(sc, ['#000', 0], ['#7a807d', 1]), 'Screen', 0.6), roughness: g.gray(0.85) });
  });
  P('Glitter', 'Plastic, paper & misc', 'Sparkly glitter flakes', (g) => {
    const v = g.n('voronoi', { scaleX: 96, scaleY: 96, width: 0.05 });
    g.out({ albedo: g.ramp(v.o('rand'), ['#6a2a8a', 0], ['#c050e0', 0.5], ['#ffd0ff', 1]), metallic: g.gray(1), roughness: g.lv(v.o('rand'), 0, 1, 1, 0.05, 0.5), height: g.lv(v.o('rand'), 0, 1, 1, 0.48, 0.52) }, { normalStrength: 0.6, depth: 0.004 });
  });
  P('Camo fabric', 'Plastic, paper & misc', 'Woodland camo print on canvas (TypeLab woodland generator)', (g) => {
    const p = g.n('pattern', { gen: 'woodland', repeat: 1 });
    const w = g.n('weave', { count: 96, width: 0.9, bulge: 0.5 });
    g.out({ albedo: g.blend(p, g.ramp(w, ['#999', 0], ['#fff', 1]), 'Multiply', 0.5), roughness: g.gray(0.95), height: w }, { normalStrength: 0.5 });
  });

  // ==================================================================================== Typography (TypeLab's own)
  P('Embossed metal type', 'Typography', 'Your word raised out of brushed steel', (g) => {
    const t = g.n('text', { text: 'TYPELAB', size: 0.86 });
    const h = g.n('bevel', { width: 14, profile: 2 }, { in: t });
    const f = g.n('fibers', { count: 256, length: 2 });
    g.out({ albedo: g.ramp(f, ['#8e9195', 0], ['#c4c7cb', 1]), metallic: g.gray(1), roughness: g.mix(g.lv(f, 0, 1, 1, 0.3, 0.45), g.gray(0.18), t), height: g.math('Add', g.lv(h, 0, 1, 1, 0, 0.9), g.lv(f, 0, 1, 1, 0, 0.02)), ao: g.ao(h, 16) }, { normalStrength: 2 });
  });
  P('Carved stone type', 'Typography', 'Letters chiselled into a stone slab', (g) => {
    const t = g.n('text', { text: 'TYPELAB', font: 'Georgia', weight: 2, size: 0.8 });
    const cut = g.n('bevel', { width: 10, profile: 0 }, { in: t });
    const stone = g.noise(16, 16, { octaves: 7 });
    const h = g.math('Subtract', g.lv(stone, 0, 1, 1, 0.75, 0.85), g.lv(cut, 0, 1, 1, 0, 0.5));
    g.out({ albedo: g.blend(g.ramp(stone, ['#8b867c', 0], ['#bdb6a8', 1]), g.ramp(t, ['#ffffff', 0], ['#6a655c', 1]), 'Multiply', 0.6), roughness: g.gray(0.9), height: h, ao: g.ao(h, 14, 2) }, { normalStrength: 2.2 });
  });
  P('Gold leaf lettering', 'Typography', 'Gilded letters on dark wood', (g) => {
    const t = g.n('text', { text: 'TYPELAB', font: 'Georgia', weight: 3, italic: true, size: 0.86 });
    const w = g.n('wood', { rings: 8, warp: 1.2, grainX: 200, grain: 0.5 });
    const sm = g.flow(4);
    g.out({ albedo: g.mix(g.ramp(w, ['#22140b', 0], ['#4a2c18', 1]), g.ramp(sm, ['#c9922e', 0], ['#f5cf6a', 1]), t, 4), metallic: t, roughness: g.mix(g.gray(0.4), g.lv(sm, 0, 1, 1, 0.1, 0.3), t), height: g.n('bevel', { width: 4, profile: 1 }, { in: t }) }, { normalStrength: 0.8 });
  });
  P('Neon sign type', 'Typography', 'Your word as a glowing neon tube on a brick wall', (g) => {
    const t = g.n('text', { text: 'TYPELAB', font: 'Arial', weight: 2, size: 0.8 });
    const tube = g.n('edge', { width: 3, gain: 4 }, { in: t });
    const glow = g.n('blur', { radius: 24 }, { in: tube });
    const b = g.n('bricks', { rows: 12, cols: 4, mortar: 0.06, bevel: 0.1 });
    g.out({ albedo: g.mix(g.col('#2a2a2c'), g.ramp(b.o('rand'), ['#3a1a14', 0], ['#4a2018', 1]), b.o('bricks'), 6), roughness: g.gray(0.85), height: g.math('Max', b.o('bricks'), tube),
      emission: g.ramp(g.math('Max', tube, g.lv(glow, 0, 0.5, 1, 0, 0.7)), ['#000000', 0], ['#ff1f8f', 0.5], ['#ffe0f0', 1]) }, { emissive: 2.5, normalStrength: 1 });
  });
  P('Monogram fabric', 'Typography', 'Repeating monogram woven into a jacquard', (g) => {
    const t = g.n('text', { text: 'TL', font: 'Georgia', weight: 3, size: 0.55, layout: 1, rows: 6, gap: 0.8, stagger: 0.5 });
    const w = g.n('weave', { count: 128, width: 0.9, bulge: 0.5 });
    g.out({ albedo: g.blend(g.mix(g.col('#4a3420'), g.col('#c9a66b'), t, 4), g.ramp(w, ['#888', 0], ['#fff', 1]), 'Multiply', 0.6), roughness: g.gray(0.9), height: g.math('Average', w, g.lv(t, 0, 1, 1, 0.3, 0.7)) }, { normalStrength: 0.7 });
  });
  P('Type on concrete', 'Typography', 'Stencil-painted letters on concrete, worn', (g) => {
    const t = g.n('text', { text: 'TYPELAB', font: 'Impact', size: 0.86 });
    const n = g.noise(8, 8, { octaves: 8, persist: 0.55 });
    const wear = g.n('tonesstep', { value: 0.35, width: 0.1 }, { in: g.noise(24, 24, { octaves: 5 }) });
    const paint = g.math('Multiply', t, wear);
    g.out({ albedo: g.mix(g.ramp(n, ['#8a8883', 0], ['#aaa7a0', 1]), g.col('#f2c300'), paint, 2), roughness: g.mix(g.gray(0.9), g.gray(0.6), paint), height: g.math('Add', g.lv(n, 0, 1, 1, 0.45, 0.55), g.lv(paint, 0, 1, 1, 0, 0.03)) }, { normalStrength: 1 });
  });
  P('Letterpress', 'Typography', 'Type pressed deep into thick cotton paper', (g) => {
    const t = g.n('text', { text: 'TYPELAB', font: 'Georgia', weight: 1, size: 0.82 });
    const deb = g.n('blur', { radius: 3 }, { in: t });
    const paper = g.noise(48, 48, { octaves: 5 });
    g.out({ albedo: g.mix(g.ramp(paper, ['#efe9dc', 0], ['#fbf8f1', 1]), g.col('#1d2a44'), t, 4), roughness: g.gray(0.95), height: g.math('Subtract', g.lv(paper, 0, 1, 1, 0.48, 0.52), g.lv(deb, 0, 1, 1, 0, 0.12)), ao: g.ao(deb, 6, 0.8) }, { normalStrength: 1.4 });
  });
  P('Layer as relief', 'Typography', 'Pick any layer of your document — it becomes a bevelled relief in metal', (g) => {
    const l = g.n('layer', { fit: 0, pad: 0.08 });
    const h = g.n('bevel', { width: 12, profile: 2 }, { in: l });
    g.out({ albedo: g.mix(g.col('#30343a'), g.col('#c9ccd1'), l, 4), metallic: g.gray(1), roughness: g.gray(0.3), height: h, ao: g.ao(h, 12) }, { normalStrength: 2 });
  });
})(window.TL);
