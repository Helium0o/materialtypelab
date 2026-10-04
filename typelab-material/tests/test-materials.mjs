// Every starter material builds and renders without a node error. Writes materials-sheet.png (lit 2D).
// Usage: node test-materials.mjs [filter,filter] [size]
import fs from 'fs';
import { open, check, done } from './_launch.mjs';
const only = process.argv[2] || '', SZ = +(process.argv[3] || 256);
const { browser, page, errors } = await open();
const r = await page.evaluate(async ({ only, SZ }) => {
  const M = TL.mat, N = 160, bad = [];
  const list = M.presets.filter((pr) => !only || only.split(',').some((o) => pr.id.includes(o)));
  const cols = 8, sheet = document.createElement('canvas');
  sheet.width = cols * N; sheet.height = Math.ceil(list.length / cols) * (N + 14);
  const sx = sheet.getContext('2d'); sx.fillStyle = '#222'; sx.fillRect(0, 0, sheet.width, sheet.height); sx.font = '11px sans-serif';
  const L = TL.make.text({ text: 'TL', x: 200, y: 200, size: 300 }); TL.addLayer(L);
  for (let k = 0; k < list.length; k++) {
    const pr = list[k]; let mat;
    try { mat = M.fromPreset(pr.id); } catch (e) { bad.push(pr.id + ' build: ' + e.message); continue; }
    const ln = mat.nodes.find((n) => n.type === 'layer'); if (ln) ln.p.layer = L.id;
    let maps = M.maps(mat, SZ);
    if (mat.nodes.some((n) => n.type === 'pattern')) { await new Promise((res) => setTimeout(res, 1500)); maps = M.maps(mat, SZ); }
    const c = M.toCanvas(maps.albedo, { size: N, mode: 'lit', maps });
    const x = (k % cols) * N, y = Math.floor(k / cols) * (N + 14);
    sx.drawImage(c, x, y); sx.fillStyle = '#ddd'; sx.fillText(pr.name, x + 2, y + N + 11);
    mat.nodes.filter((n) => M.engine.errors.has(n.id)).forEach((n) => bad.push(pr.id + ' ' + n.type + ': ' + M.engine.errors.get(n.id).slice(0, 200)));
    M.engine.forget(mat);
  }
  return { n: list.length, bad, png: sheet.toDataURL() };
}, { only, SZ });
fs.writeFileSync('materials-sheet.png', Buffer.from(r.png.split(',')[1], 'base64'));
check(r.n > 0, 'materials found', String(r.n));
check(r.bad.length === 0, 'all materials build and render', r.bad.join('\n'));
await done(browser, errors);
