// Every output of every node compiles and renders (fed with Bricks where it has inputs). Writes nodes-sheet.png.
import fs from 'fs';
import { open, check, done } from './_launch.mjs';
const { browser, page, errors } = await open();
const r = await page.evaluate(() => {
  const M = TL.mat, N = 96, list = [], bad = [];
  for (const d of M.list()) d.outputs.forEach((o, i) => list.push([d, i]));
  const cols = 10, sheet = document.createElement('canvas');
  sheet.width = cols * N; sheet.height = Math.ceil(list.length / cols) * (N + 12);
  const sx = sheet.getContext('2d'); sx.fillStyle = '#222'; sx.fillRect(0, 0, sheet.width, sheet.height); sx.font = '9px sans-serif';
  list.forEach(([d, i], k) => {
    const mat = { id: 'T', name: 't', size: 256, nodes: [], links: [] };
    const n = M.addNode(mat, d.id, 0, 0); n.seed = 3;
    if (d.inputs.length && d.id !== 'material') { const src = M.addNode(mat, 'bricks', 0, 0); d.inputs.forEach((inp, j) => { if (j < 2) M.link(mat, src.id, 0, n.id, j); }); }
    const c = M.toCanvas(M.engine.eval(mat, n, i, 256), { size: N });
    const x = (k % cols) * N, y = Math.floor(k / cols) * (N + 12);
    sx.drawImage(c, x, y); sx.fillStyle = M.engine.errors.has(n.id) ? '#f55' : '#ddd'; sx.fillText(d.id + ':' + d.outputs[i].k, x + 2, y + N + 9);
    if (M.engine.errors.has(n.id)) bad.push(d.id + ':' + d.outputs[i].k + ' ' + M.engine.errors.get(n.id).slice(0, 300));
  });
  return { n: list.length, defs: M.list().length, bad, png: sheet.toDataURL() };
});
fs.writeFileSync('nodes-sheet.png', Buffer.from(r.png.split(',')[1], 'base64'));
check(r.defs >= 50, 'node types registered', String(r.defs));
check(r.bad.length === 0, 'all ' + r.n + ' node outputs compile', r.bad.join('\n'));
await done(browser, errors);
