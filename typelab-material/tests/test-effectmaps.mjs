// Effect maps + the material links (materials as patterns, Material effect, TypeLab effects inside materials).
//  1. every effect-map node type runs (fed with a text layer) — all ~312 TypeLab effects/filters, dither, blends, masks, sources
//  2. a straight chain Input → A → B → Output gives the same pixels as the plain effect list [A, B]
//  3. every starter effect map builds and runs; writes effectmaps-sheet.png
//  4. an Effect map on a layer renders on the canvas, and editing the map changes the layer (cache key)
//  5. materials as patterns: pattern layer "mat-<id>" draws, Material effect changes a layer
//  6. TypeLab effects as material nodes (3×3 seamless wrap) run (sample; ALL_TLFX=1 for all)
import fs from 'fs';
import { open, check, done } from './_launch.mjs';
const { browser, page, errors } = await open();
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { TL.newDoc(800, 450, '#202024'); const L = TL.make.text({ text: 'MAP', x: 140, y: 90, size: 220, fill: '#f2c300' }); TL.addLayer(L); TL.commit('t'); });

// 1
const r1 = await ev(async () => {
  const M = TL.mat, L = TL.doc.layers[0], s = 0.5, bad = [], empty = [];
  const input = TL.render.layer(Object.assign({}, L, { effects: [] }), s, false);
  const mat = M.newMaterial('m'); TL.doc.materials.push(mat);
  for (const d of M.list('effect')) {
    if (d.isOutput) continue;
    const map = M.newEffectMap('t'); map.links = [];
    const n = M.addNode(map, d.id, 0, 0);
    if (n.p.layer !== undefined) n.p.layer = L.id;
    if (n.p.mat !== undefined) n.p.mat = mat.id;
    const fin = map.nodes.find((x) => x.type === 'fxin');
    d.inputs.forEach((inp, i) => { if (i === 0 || inp.type === 'color') M.link(map, fin.id, 0, n.id, i); });
    const ctx = M.fx.newCtx({ input, scale: s, sig: null });
    for (let o = 0; o < Math.max(1, d.outputs.length); o++) {
      const out = M.fx.evalNode(map, n.id, o, ctx);
      if (M.fx.errors.has(n.id)) bad.push(d.id + ': ' + M.fx.errors.get(n.id).slice(0, 160));
      else if (!out) empty.push(d.id);
    }
    await new Promise((res) => setTimeout(res, 0));
  }
  return { n: M.list('effect').length, bad, empty };
});
check(r1.n > 300, 'effect-map node types', String(r1.n));
check(r1.bad.length === 0, 'every effect-map node runs', r1.bad.slice(0, 10).join('\n'));
check(r1.empty.length === 0, 'every effect-map node returns an image', r1.empty.join(' '));

// 2
const r2 = await ev(() => {
  const M = TL.mat, L = TL.doc.layers[0], s = 0.5, out = [];
  const input = TL.render.layer(Object.assign({}, L, { effects: [] }), s, false);
  const pairs = [['glow', 'rgbsplit'], ['shadow', 'halftone'], ['blur', 'posterize'], ['outline', 'grain']];
  for (const [a, b] of pairs) {
    const ea = TL.make.effect(a), eb = TL.make.effect(b);
    const listOut = TL.fx.apply(input, [ea, eb], { scale: s, bounds: TL.render.bounds(L, TL.doc) });
    const map = M.newEffectMap('c'); map.links = [];
    const fin = map.nodes.find((x) => x.type === 'fxin'), fout = M.output(map);
    const na = M.addNode(map, 'fx:' + a, 0, 0), nb = M.addNode(map, 'fx:' + b, 0, 0);
    M.link(map, fin.id, 0, na.id, 0); M.link(map, na.id, 0, nb.id, 0); M.link(map, nb.id, 0, fout.id, 0);
    const mapOut = M.fx.run(map, M.fx.newCtx({ input, scale: s, bounds: TL.render.bounds(L, TL.doc), sig: null }));
    const A = listOut.getContext('2d').getImageData(0, 0, listOut.width, listOut.height).data, B = mapOut.getContext('2d').getImageData(0, 0, mapOut.width, mapOut.height).data;
    let diff = 0; for (let i = 0; i < A.length; i++) diff = Math.max(diff, Math.abs(A[i] - B[i]));
    out.push(a + '→' + b + ' max diff ' + diff);
  }
  return out;
});
check(r2.every((x) => /max diff [0-2]$/.test(x)), 'map chain == effect list', r2.join(' · '));

// 3
const r3 = await ev(async () => {
  const M = TL.mat, L = TL.doc.layers[0], s = 0.5, bad = [], N = 240;
  const sheet = document.createElement('canvas'); sheet.width = 4 * N; sheet.height = Math.ceil(M.fxPresets.length / 4) * (N * 0.56 + 14);
  const sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height); sx.font = '11px sans-serif';
  const input = TL.render.layer(Object.assign({}, L, { effects: [] }), s, false);
  for (let k = 0; k < M.fxPresets.length; k++) {
    const pr = M.fxPresets[k];
    let map;
    try { map = M.fromFxPreset(pr.id, (id) => { const m = M.fromPreset(id); TL.doc.materials.push(m); return m; }); } catch (e) { bad.push(pr.id + ' build ' + e.message); continue; }
    TL.doc.materials.push(map);
    const out = M.fx.run(map, M.fx.newCtx({ input, scale: s, bounds: TL.render.bounds(L, TL.doc), sig: null }));
    map.nodes.forEach((n) => { if (M.fx.errors.has(n.id)) bad.push(pr.id + ' ' + n.type + ': ' + M.fx.errors.get(n.id)); });
    const x = (k % 4) * N, y = Math.floor(k / 4) * (N * 0.56 + 14);
    sx.fillStyle = '#202024'; sx.fillRect(x, y, N, N * 0.56); if (out) sx.drawImage(out, x, y, N, N * 0.5625);
    sx.fillStyle = '#ddd'; sx.fillText(pr.name, x + 3, y + N * 0.56 + 11);
    await new Promise((res) => setTimeout(res, 0));
  }
  return { bad, png: sheet.toDataURL() };
});
fs.writeFileSync('effectmaps-sheet.png', Buffer.from(r3.png.split(',')[1], 'base64'));
check(r3.bad.length === 0, 'starter effect maps build and run', r3.bad.join('\n'));

// 4
const r4 = await ev(async () => {
  const M = TL.mat, L = TL.doc.layers[0];
  const map = M.newEffectMap('Live'); map.links = []; TL.doc.materials.push(map);
  const fin = map.nodes.find((x) => x.type === 'fxin'), fout = M.output(map);
  const g = M.addNode(map, 'fx:glow', 0, 0); M.link(map, fin.id, 0, g.id, 0); M.link(map, g.id, 0, fout.id, 0);
  TL.select(L.id); M.attachMap(map.id, 'layer');
  const sum = () => { const c = TL.render.layer(L, 0.5, true); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let t = 0; for (let i = 0; i < d.length; i += 16) t += d[i] + d[i + 1] + d[i + 2]; return t; };
  const plain = (() => { const c = TL.render.layer(Object.assign({}, L, { effects: [] }), 0.5, false); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let t = 0; for (let i = 0; i < d.length; i += 16) t += d[i] + d[i + 1] + d[i + 2]; return t; })();
  const a = sum();
  g.p.strength = 5; g.p.radius = 80; TL.commit('edit map');
  const b = sum();
  return { plain, a, b, hosts: M.hostsOf(map.id).length };
});
check(r4.hosts === 1 && r4.a !== r4.plain, 'Effect map on a layer changes it', JSON.stringify(r4));
check(r4.b !== r4.a, 'editing the map re-renders the layer (cache key follows the map)');

// 5
const r5 = await ev(async () => {
  const M = TL.mat, PT = TL.patterns;
  const m = M.fromPreset('red-bricks'); TL.doc.materials.push(m); TL.commit('mat'); M.syncPatterns();
  const inList = PT.has('mat-' + m.id);
  const P = M.asPatternLayer(m);
  const c = TL.render.layer(P, 0.5, false); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let t = 0; for (let i = 0; i < d.length; i += 64) t += d[i];
  const L = TL.doc.layers.find((l) => l.type === 'text');
  const before = TL.render.layer(Object.assign({}, L, { effects: [] }), 0.5, false);
  const e = TL.make.effect('matfx'); e.p.mat = m.id;
  const after = TL.fx.apply(before, [e], { scale: 0.5, bounds: TL.render.bounds(L, TL.doc) });
  const A = before.getContext('2d').getImageData(0, 0, before.width, before.height).data, B = after.getContext('2d').getImageData(0, 0, after.width, after.height).data;
  let diff = 0; for (let i = 0; i < A.length; i += 4) diff += Math.abs(A[i] - B[i]);
  return { inList, patternSum: t, matfxDiff: diff };
});
check(r5.inList, 'materials appear as pattern generators');
check(r5.patternSum > 0, 'a material pattern layer draws');
check(r5.matfxDiff > 0, 'the Material effect changes a layer');

// 6
const r6 = await ev(async (all) => {
  const M = TL.mat, bad = [];
  const ids = M.list('material').filter((d) => d.id.startsWith('tlfx:')).map((d) => d.id);
  const pick = all ? ids : ids.filter((_, i) => i % 15 === 0);
  for (const id of pick) {
    const mat = { id: 'T' + id, name: 't', size: 128, nodes: [], links: [] };
    const src = M.addNode(mat, 'bricks', 0, 0), n = M.addNode(mat, id, 0, 0);
    M.link(mat, src.id, 0, n.id, 0);
    const t = M.engine.eval(mat, n, 0, 128);
    if (!t || M.engine.errors.has(n.id)) bad.push(id + ' ' + (M.engine.errors.get(n.id) || 'null'));
    M.engine.forget(mat);
    await new Promise((res) => setTimeout(res, 0));
  }
  return { n: pick.length, of: ids.length, bad };
}, !!process.env.ALL_TLFX);
check(r6.bad.length === 0, 'TypeLab effects as material nodes run (' + r6.n + ' of ' + r6.of + ')', r6.bad.join('\n'));
await done(browser, errors);
