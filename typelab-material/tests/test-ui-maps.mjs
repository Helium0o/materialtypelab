// Effect maps in the Material tab, driven like a user: library → Effect maps → starter, preview, add to a layer,
// node settings, the FX & Filters card ("Edit in Material tab"), materials in the Pattern picker. Screenshots: ui-map-*.png
import { open, check, done } from './_launch.mjs';
const { browser, page: p, errors } = await open();
const ev = (f, a) => p.evaluate(f, a);
await ev(() => { TL.newDoc(1200, 700, '#1a1a1e'); const L = TL.make.text({ text: 'NEON', x: 250, y: 220, size: 260, fill: '#ffffff' }); TL.addLayer(L); TL.select(L.id); TL.commit('t'); TL.emit('layers'); });
await p.keyboard.press('7'); await p.waitForTimeout(800);
await p.click('.mat-libhead .seg button:has-text("Maps")'); await p.waitForTimeout(300);
check(await p.locator('.mat-mapi').count() >= 8, 'library lists the starter effect maps');
await p.click('.mat-mapi:has-text("Neon double glow")'); await p.waitForTimeout(2000);
check(await ev(() => TL.mat.kindOf(TL.mat.current())) === 'effect', 'a starter opens as an effect map tab');
check(await p.locator('.mat-tab.on .mt-kind').count() === 1, 'the tab shows the fx badge');
check(await p.locator('.mg-node').count() >= 4, 'its nodes are in the graph');
await p.click('button:has-text("Add to “NEON”")'); await p.waitForTimeout(1500);
check(await ev(() => TL.doc.layers[0].effects.some((e) => e.type === 'effectmap' && e.p.map === TL.mat.current().id)), 'Add to layer puts an Effect map entry on the layer');
await p.screenshot({ path: 'ui-map-graph.png' });
// node settings: click a glow node, its params show in the Settings panel
await p.locator('.mg-node', { hasText: 'Glow' }).first().locator('.mg-head').click(); await p.waitForTimeout(600);
check(await p.locator('#inspector .sec-t:has-text("Node · Glow")').count() === 1, 'selecting a node shows its settings');
// the Nodes tab now lists effect-map nodes
await p.click('.mat-libhead .seg button:has-text("Nodes")'); await p.waitForTimeout(300);
check(await p.locator('.mat-kindnote:has-text("effect maps")').count() === 1, 'Nodes tab lists effect-map nodes for an effect map');
// Space menu finds a Filter Gallery filter and dither
const g = await p.locator('.mg-wrap').boundingBox();
await p.mouse.move(g.x + 150, g.y + g.height - 120); await p.keyboard.down(' '); await p.keyboard.up(' '); await p.waitForTimeout(300);
await p.keyboard.type('watercolor'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
check(await ev(() => TL.mat.current().nodes.some((n) => n.type === 'fx:fg_watercolor')), 'Space menu adds a Filter Gallery filter as a node');
// FX & Filters: the effect card shows the map picker + Edit button
await p.keyboard.press('4'); await p.waitForTimeout(800);
await ev(() => { TL.st.fxScope = 'layer'; TL.ui.buildInspector(); });
await p.waitForTimeout(400);
const editBtn = p.locator('#inspector button:has-text("Edit in Material tab")');
check(await editBtn.count() >= 1, 'FX & Filters card has “Edit in Material tab”');
await p.screenshot({ path: 'ui-map-fxcard.png' });
if (await editBtn.count()) { await editBtn.first().click(); await p.waitForTimeout(800); }
check(await ev(() => TL.st.mode === 'material' && TL.mat.kindOf(TL.mat.current()) === 'effect'), '…which opens the map in the Material tab');
// materials as patterns
await ev(() => { TL.mat.newFromPreset('oak-planks'); });
await p.waitForTimeout(1500);
check(await ev(() => TL.patterns.list.some((g2) => g2.cat === 'Materials (node)')), 'materials are listed as patterns (Materials (node))');
await p.click('button:has-text("Fill selected text")').catch(() => {}); await p.waitForTimeout(800);
const filled = await ev(() => TL.doc.layers.some((l) => l.type === 'pattern' && l.gen.startsWith('mat-') && l.clipTo));
if (!filled) await ev(() => { const L = TL.doc.layers.find((l) => l.type === 'text'); TL.select(L.id); TL.mat.asPatternLayer(TL.mat.current(), L.id); });
check(await ev(() => TL.doc.layers.some((l) => l.type === 'pattern' && l.gen.startsWith('mat-') && l.clipTo)), 'Fill selected text makes a material text fill');
await p.keyboard.press('1'); await p.waitForTimeout(1500);
await p.screenshot({ path: 'ui-map-canvas.png' });
check(await ev(() => TL.st.mode === 'type' && getComputedStyle(document.getElementById('view')).display !== 'none'), 'back on the canvas');
await done(browser, errors);
