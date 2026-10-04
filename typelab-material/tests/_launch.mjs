// Shared launcher for the Material tests. Serves nothing itself: point TYPELAB_URL at TypeLab's app/index.html
// served over http (e.g. `cd app && python -m http.server 8123`). SOFTWARE_GL=1 forces SwiftShader (CI / no GPU).
import { chromium } from 'playwright';
export const URL = process.env.TYPELAB_URL || 'http://127.0.0.1:8123/index.html';
export async function open(viewport = { width: 1600, height: 950 }) {
  const args = process.env.SOFTWARE_GL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ args, executablePath: process.env.CHROMIUM || undefined });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  // TypeLab is exe-only: stand in for the Electron bridge so saves can be inspected
  await page.addInitScript(() => { window.native = { saveFile: async (o) => { window.__saved = o; return { ok: true, path: 'test/' + o.defaultPath }; }, chooseDir: async () => null, writeFile: async () => ({ ok: true }), platform: 'test' }; });
  await page.goto(URL);
  await page.waitForFunction(() => window.TL && TL.mat && TL.ui && TL.ui.modes && TL.ui.modes.material, null, { timeout: 30000 });
  return { browser, page, errors };
}
let failed = 0;
export const check = (ok, label, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); if (!ok) failed++; };
export const done = async (browser, errors) => {
  if (errors.length) { console.log('\nconsole errors:\n' + errors.slice(0, 15).join('\n')); failed++; }
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
};
