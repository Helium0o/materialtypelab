// TypeLab — Material workspace (key 7): node-based PBR materials, Material Maker style.
//
// Drop-in: it only needs its <script> tags (see INSTALL.md). It hooks into TypeLab by wrapping, not editing:
//   • registers the mode + pushes 'material' onto UI.modeOrder (tab 7, number key 7)
//   • wraps UI.setMode / UI.refresh to show / hide its own view (#matgraph inside #viewport)
//   • a capture-phase keydown guard so graph keys never reach the layer shortcuts in tools.js
//     (Delete would otherwise delete the selected *layer*)
//   • TL.migrate is wrapped in mat-core.js (doc.materials), image nodes store `imageId` (saved + GC-safe)
// Layout: node library (left, inside the view) · graph (centre) · Settings panel (right dock) = preview + node settings.
(function (TL) {
  const U = TL.util;
  const h = U.h;
  const UI = TL.ui;
  const st = TL.st;
  const M = TL.mat;
  const G = M.graph;
  const $ = (id) => document.getElementById(id);

  UI.I.mMaterial = '<circle cx="10" cy="10" r="6.5"/><path d="M5 7.5c3 1.6 7 1.6 10 0M4.6 11.5c3.4 2 7.4 2 10.8 0"/><circle cx="7.5" cy="6.5" r="1" fill="currentColor"/>';
  if (!UI.modeOrder.includes('material')) UI.modeOrder.push('material');

  // ----------------------------------------------------------------- state (not part of the document)
  const S = (M.ui = {
    active: false, root: null, lib: null, tabs: null,
    view: (() => { try { return Object.assign({ mode: '3d', channel: 'lit', mesh: 'sphere', tiles: 2, light: 0.8, yaw: 0.6, pitch: null, dist: 3.6, libTab: 'materials' }, JSON.parse(localStorage.getItem('matPreview') || '{}')); } catch (e) { return { mode: '3d', channel: 'lit', mesh: 'sphere', tiles: 2, light: 0.8, yaw: 0.6, pitch: null, dist: 3.6, libTab: 'materials' }; } })(),
    exp: (() => { try { return Object.assign({ size: 2048, maps: { albedo: true, normal: true, roughness: true, metallic: true, ao: true, height: true, emission: false, opacity: false, orm: false }, normalY: 0, layerTiles: 4, layerLit: true }, JSON.parse(localStorage.getItem('matExport') || '{}')); } catch (e) { return { size: 2048, maps: {}, normalY: 0, layerTiles: 4, layerLit: true }; } })(),
  });
  const saveView = U.debounce(() => { try { localStorage.setItem('matPreview', JSON.stringify(S.view)); } catch (e) { /* ignore */ } }, 300);
  const saveExp = () => { try { localStorage.setItem('matExport', JSON.stringify(S.exp)); } catch (e) { /* ignore */ } };
  const curMat = () => {
    const list = M.mats();
    let m = list.find((x) => x.id === st.matId);
    if (!m && list.length) { m = list[list.length - 1]; st.matId = m.id; }
    return m || null;
  };
  M.current = curMat;

  // ----------------------------------------------------------------- materials (add / remove / switch)
  const addMaterial = (mat) => {
    TL.doc.materials = TL.doc.materials || [];
    TL.doc.materials.push(mat);
    st.matId = mat.id;
    TL.commit('New material: ' + mat.name);
    G.setMaterial(mat);
    buildTabs();
    UI.buildInspector();
    requestAnimationFrame(() => G.fit());
    schedule();
    return mat;
  };
  M.newFromPreset = (id) => { const m = M.fromPreset(id); if (m) addMaterial(m); return m; };
  M.newEmpty = () => addMaterial(M.newMaterial('Material ' + (M.mats().length + 1)));
  const switchTo = (id) => { st.matId = id; G.setMaterial(curMat()); buildTabs(); UI.buildInspector(); requestAnimationFrame(() => G.fit()); schedule(); };
  const removeMaterial = (m) => {
    TL.doc.materials = M.mats().filter((x) => x !== m);
    if (st.matId === m.id) st.matId = null;
    TL.commit('Delete material');
    G.setMaterial(curMat());
    buildTabs(); UI.buildInspector(); schedule();
  };

  // ----------------------------------------------------------------- view DOM (built once)
  function buildView() {
    if (S.root) return;
    const root = h('div', { id: 'matgraph', class: 'mat-root', hidden: true });
    S.lib = h('div', { class: 'mat-lib' });
    S.tabs = h('div', { class: 'mat-tabs' });
    const main = h('div', { class: 'mat-main' }, S.tabs);
    const gHost = h('div', { class: 'mat-ghost' });
    main.append(gHost);
    S.start = h('div', { class: 'mat-start' });
    gHost.append(S.start);
    root.append(S.lib, main);
    $('viewport').append(root);
    S.root = root;
    G.mount(gHost);
    G.onChange = () => { buildTabs(); schedule(); };
    G.onSelect = () => { UI.buildInspector(); schedule(); };
    G.onRender = () => { schedule(); };
    buildLib();
  }

  // ----------------------------------------------------------------- material tabs
  function buildTabs() {
    if (!S.tabs) return;
    const cur = curMat();
    S.tabs.replaceChildren();
    M.mats().forEach((m) => {
      const name = h('span', { class: 'mt-name' }, m.name);
      const tab = h('div', { class: 'mat-tab' + (cur === m ? ' on' : ''), title: 'Double-click to rename · right-click for more' }, name,
        h('button', { class: 'mt-x', title: 'Delete material', onclick: (e) => { e.stopPropagation(); if (confirm('Delete the material "' + m.name + '"?')) removeMaterial(m); } }, '×'));
      tab.onclick = () => { if (cur !== m) switchTo(m.id); };
      tab.ondblclick = () => {
        const inp = UI.stopKeys(h('input', { type: 'text', class: 'mt-rename', value: m.name }));
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = m.name; inp.blur(); } });
        inp.addEventListener('blur', () => { const v = inp.value.trim(); if (v && v !== m.name) { m.name = v; TL.commit('Rename material'); } buildTabs(); UI.buildInspector(); });
        name.replaceWith(inp); inp.focus(); inp.select();
      };
      tab.oncontextmenu = (e) => {
        e.preventDefault();
        UI.menu(tab, [
          { label: 'Rename', action: () => tab.ondblclick() },
          { label: 'Duplicate', action: () => { const c = JSON.parse(JSON.stringify(m)); c.id = U.uid('M'); c.name = m.name + ' copy'; addMaterial(c); } },
          { label: 'Arrange nodes', action: () => { if (cur !== m) switchTo(m.id); G.arrange(); } },
          '-', { label: 'Delete', action: () => removeMaterial(m) },
        ]);
      };
      S.tabs.append(tab);
    });
    const add = h('button', { class: 'mat-addtab', title: 'New material' }, '+');
    add.onclick = () => UI.menu(add, [
      { label: 'Empty material', action: M.newEmpty },
      { label: 'From the material library…', action: () => { S.view.libTab = 'materials'; saveView(); buildLib(); } },
      { label: 'From a text layer (embossed)', action: () => M.newFromPreset('embossed-metal-type') },
    ]);
    const tools = h('div', { class: 'mat-gtools' },
      UI.btn('Add node', () => G.addMenuAtMouse(), 'xs'),
      UI.btn('Arrange', () => G.arrange(), 'xs'),
      UI.btn('Fit', () => G.fit(), 'xs'));
    S.tabs.append(add, h('div', { class: 'spacer' }), cur ? tools : null);
    // empty state: no material yet
    S.start.replaceChildren();
    S.start.hidden = !!cur;
    if (!cur) {
      S.start.append(h('div', { class: 'mat-startcard' },
        h('b', null, 'Make a material'),
        h('p', null, 'Seamless PBR materials from nodes: colour, normal, roughness, metal, AO and height maps. Use them on the canvas or export them for 3D.'),
        h('div', { class: 'row wrap tight' },
          UI.btn('Red bricks', () => M.newFromPreset('red-bricks'), 'accent'), UI.btn('Embossed text', () => M.newFromPreset('embossed-metal-type')),
          UI.btn('Rusty iron', () => M.newFromPreset('rusty-iron')), UI.btn('Oak planks', () => M.newFromPreset('oak-planks')), UI.btn('Empty', M.newEmpty)),
        UI.note('Or pick one of ' + M.presets.length + ' materials in the library on the left.')));
    }
  }

  // ----------------------------------------------------------------- library (nodes + materials)
  const thumbCache = new Map();
  let thumbQueue = [];
  let thumbBusy = false;
  const pumpThumbs = () => {
    if (thumbBusy || !thumbQueue.length || !S.active) return;
    thumbBusy = true;
    const [id, c] = thumbQueue.shift();
    setTimeout(() => {
      try {
        if (!thumbCache.has(id)) {
          const m = M.fromPreset(id);
          const maps = M.maps(m, 128);
          const t = U.canvas(96, 96);
          M.preview3d.draw(t, maps, { mesh: 'sphere', depth: Math.min(0.06, M.output(m).p.depth), yaw: 0.6, dist: 2.75 });
          thumbCache.set(id, t);
          // the thumbnails' textures are throwaway: free them right away
          M.engine.forget(m);
        }
        const src = thumbCache.get(id);
        if (c.isConnected) c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      } catch (e) { console.warn('material thumbnail', id, e); }
      thumbBusy = false;
      pumpThumbs();
    }, 16);
  };
  function buildLib() {
    if (!S.lib) return;
    const tab = S.view.libTab || 'materials';
    const filter = UI.stopKeys(h('input', { type: 'text', class: 'mat-filter', placeholder: tab === 'nodes' ? 'Filter nodes…' : 'Filter materials…', value: S.libFilter || '' }));
    const body = h('div', { class: 'mat-libbody' });
    const head = h('div', { class: 'mat-libhead' },
      UI.seg([['materials', 'Materials'], ['nodes', 'Nodes']], tab, (v) => { S.view.libTab = v; saveView(); buildLib(); }));
    S.lib.replaceChildren(head, filter, body);
    const fill = () => {
      const q = filter.value.trim().toLowerCase();
      S.libFilter = filter.value;
      body.replaceChildren();
      thumbQueue = [];
      if (tab === 'nodes') {
        M.CATS.forEach((cat) => {
          const list = M.list().filter((d) => d.cat === cat && d.id !== 'material' && (!q || (d.name + ' ' + (d.help || '') + ' ' + d.id).toLowerCase().includes(q)));
          if (!list.length) return;
          body.append(h('div', { class: 'mat-cat', style: { '--cat': M.CAT_COLOR[cat] } }, cat));
          list.forEach((d) => body.append(h('div', { class: 'mat-li', draggable: 'true', title: (d.help || d.name) + ' · click to add, or drag onto the graph',
            ondragstart: (e) => { e.dataTransfer.setData('text/x-mat-node', d.id); e.dataTransfer.effectAllowed = 'copy'; },
            onclick: () => { if (!curMat()) M.newEmpty(); const r = G.el().getBoundingClientRect(); const v = { x: r.left + r.width * 0.4, y: r.top + r.height * 0.4 }; G.addNodeAtScreen ? G.addNodeAtScreen(d.id, v.x, v.y) : G.addNode(d.id, 0, 0); } },
          h('i', { style: { background: M.CAT_COLOR[cat] } }), h('span', null, d.name))));
        });
      } else {
        M.PRESET_CATS.forEach((cat) => {
          const list = M.presets.filter((p) => p.cat === cat && (!q || (p.name + ' ' + p.desc + ' ' + cat).toLowerCase().includes(q)));
          if (!list.length) return;
          body.append(h('div', { class: 'mat-cat' }, cat + ' · ' + list.length));
          const grid = h('div', { class: 'mat-pgrid' });
          list.forEach((p) => {
            const c = h('canvas', { width: 96, height: 96 });
            if (thumbCache.has(p.id)) c.getContext('2d').drawImage(thumbCache.get(p.id), 0, 0); else thumbQueue.push([p.id, c]);
            grid.append(h('div', { class: 'mat-pi', title: p.name + ' — ' + p.desc + ' · click to open as a new material', onclick: () => M.newFromPreset(p.id) }, c, h('span', null, p.name)));
          });
          body.append(grid);
        });
        pumpThumbs();
      }
      if (!body.children.length) body.append(UI.note('Nothing matches “' + filter.value + '”'));
    };
    filter.addEventListener('input', fill);
    fill();
  }
  G.addNodeAtScreen = (type, sx, sy) => {
    const r = G.el().getBoundingClientRect();
    const tr = getComputedStyle(G.el().querySelector('.mg-world')).transform;
    const mm = new DOMMatrix(tr === 'none' ? undefined : tr);
    G.addNode(type, (sx - r.left - mm.e) / mm.a - 80, (sy - r.top - mm.f) / mm.a - 14);
  };

  // ----------------------------------------------------------------- previews
  let previewCanvas = null, raf = 0, idleT = 0, pointerDown = false;
  const previewSize = (draft) => { const m = curMat(); const full = Math.min(m ? m.size : 1024, 1024); return draft ? Math.min(256, full) : full; };
  const schedule = () => { if (!S.active) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render(pointerDown)); };
  window.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  window.addEventListener('pointerup', () => { if (!pointerDown) return; pointerDown = false; if (S.active) { clearTimeout(idleT); idleT = setTimeout(() => render(false), 60); } }, true);

  function render(draft) {
    const m = curMat();
    if (!S.active || !m) return;
    const size = previewSize(draft);
    const c = previewCanvas;
    try {
      if (c && c.isConnected) {
        const out = M.output(m);
        const active = G.active && M.node(m, G.active);
        const showNode = active && active.type !== 'material' && S.view.channel === 'node';
        if (S.view.mode === '3d' && !showNode) {
          const maps = M.maps(m, size);
          M.preview3d.draw(c, maps, { mesh: S.view.mesh, yaw: S.view.yaw, pitch: S.view.pitch, dist: S.view.dist, light: S.view.light, depth: out.p.depth });
        } else if (showNode) {
          const d = M.get(active.type);
          const t = M.evalNode(m, active.id, G.activeOut, size);
          const o = d && d.outputs[G.activeOut];
          M.draw2D(c, t, { mode: o && o.type === 'gray' ? 'gray' : 'color', tiles: S.view.tiles, checker: true });
        } else {
          const maps = M.maps(m, size);
          const ch = S.view.channel === 'node' ? 'lit' : S.view.channel;
          if (ch === 'lit') M.draw2D(c, maps.albedo, { mode: 'lit', maps, tiles: S.view.tiles, light: S.view.light });
          else M.draw2D(c, maps[ch], { mode: ['albedo', 'normal', 'emission'].includes(ch) ? 'color' : 'gray', tiles: S.view.tiles });
        }
      }
      G.drawThumbs(Math.min(size, 256));
      M.engine.tick();
    } catch (e) { console.error('Material preview failed', e); }
    if (draft) { clearTimeout(idleT); idleT = setTimeout(() => { if (!pointerDown) render(false); }, 180); }
    const s = $('status');
    if (s) s.textContent = `${m.name} · ${m.nodes.length} nodes · ${m.size}px · GPU ${Math.round(M.engine.mem / 1048576)} MB`;
  }

  function previewSection() {
    if (!previewCanvas) {
      previewCanvas = h('canvas', { class: 'mat-prev', width: 600, height: 600, title: '3D: drag to turn, wheel to zoom · 2D: shows the tile repeated' });
      // orbit / zoom in 3D
      previewCanvas.addEventListener('pointerdown', (e) => {
        if (S.view.mode !== '3d') return;
        previewCanvas.setPointerCapture(e.pointerId);
        const x0 = e.clientX, y0 = e.clientY, yaw0 = S.view.yaw, p0 = S.view.pitch != null ? S.view.pitch : (S.view.mesh === 'plane' ? 0.75 : 0.25);
        const mv = (ev) => { S.view.yaw = yaw0 - (ev.clientX - x0) * 0.01; S.view.pitch = U.clamp(p0 + (ev.clientY - y0) * 0.01, -1.4, 1.4); schedule(); };
        const up = () => { previewCanvas.removeEventListener('pointermove', mv); previewCanvas.removeEventListener('pointerup', up); saveView(); };
        previewCanvas.addEventListener('pointermove', mv); previewCanvas.addEventListener('pointerup', up);
      });
      previewCanvas.addEventListener('wheel', (e) => { if (S.view.mode !== '3d') return; e.preventDefault(); S.view.dist = U.clamp(S.view.dist * Math.exp(e.deltaY * 0.001), 2, 9); schedule(); saveView(); }, { passive: false });
    }
    const V = S.view;
    const set = (k, v) => { V[k] = v; saveView(); UI.buildInspector(); schedule(); };
    const active = curMat() && G.active && M.node(curMat(), G.active);
    const nodeOpt = active && active.type !== 'material' ? [['node', 'Selected node']] : [];
    const body = h('div', { class: 'stack' },
      h('div', { class: 'row' }, UI.seg([['3d', '3D'], ['2d', '2D']], V.mode, (v) => set('mode', v)),
        V.mode === '3d' ? UI.seg([['sphere', '●'], ['cube', '■'], ['cylinder', '▮'], ['plane', '▱']], V.mesh, (v) => { V.pitch = null; set('mesh', v); }) : UI.seg([['1', '1×'], ['2', '2×'], ['3', '3×']], String(V.tiles), (v) => set('tiles', +v))),
      previewCanvas,
      V.mode === '2d' || nodeOpt.length ? UI.select('Show', nodeOpt.concat([['lit', 'Material (lit)'], ['albedo', 'Albedo'], ['normal', 'Normal'], ['roughness', 'Roughness'], ['metallic', 'Metallic'], ['ao', 'Ambient occlusion'], ['height', 'Height'], ['emission', 'Emission'], ['opacity', 'Opacity']]), V.channel, (v) => set('channel', v)) : null,
      UI.slider({ label: 'Light', min: 0, max: 6.28, step: 0.01, value: V.light, def: 0.8, onInput: (v) => { V.light = v; schedule(); }, onChange: saveView }));
    return UI.section('Preview', body, { id: 'mat-preview' });
  }

  // ----------------------------------------------------------------- node settings
  function customControl(n, q) {
    if (q.type === 'layer') {
      const layers = TL.doc.layers.slice().reverse();
      return UI.select(q.label, [['', layers.length ? '— choose a layer —' : 'no layers yet']].concat(layers.map((l) => [l.id, UI.layerName(l, 30) + ' (' + l.type + ')'])), n.p[q.k] || '', (v) => { n.p[q.k] = v; TL.commit('Layer source'); schedule(); });
    }
    if (q.type === 'gen') {
      const PT = TL.patterns;
      if (!PT) return UI.note('Pattern generators are not available');
      return h('div', { class: 'stack tight' }, h('div', { class: 'lab' }, q.label), UI.picker({
        items: PT.list.map((g) => ({ id: g.id, label: g.name, group: g.cat, preview: () => (UI.patternThumb ? UI.patternThumb(Object.assign({ motifId: null }, PT.defaults(g.id)), 90) : h('span')) })),
        value: n.p[q.k], favKey: 'patterns', grid: true, wide: true,
        onChange: (id) => { n.p[q.k] = id; n.p.pat = null; TL.commit('Pattern'); UI.buildInspector(); schedule(); } }));
    }
    if (q.type === 'pat') {
      const pls = TL.doc.layers.filter((l) => l.type === 'pattern' && TL.patterns && TL.patterns.has(l.gen));
      if (!pls.length) return UI.note('Tip: set up a pattern layer in the Pattern workspace, then copy its exact settings here.');
      return UI.select('Copy from layer', [['', '— pattern layer —']].concat(pls.map((l) => [l.id, l.name])), '', (v) => {
        const l = TL.layer(v); if (!l) return;
        n.p.gen = l.gen; n.p.pat = JSON.parse(JSON.stringify({ gen: l.gen, p: l.p, colors: l.colors, tile: l.tile, scale: l.scale, rot: 0, bgOn: l.bgOn !== false, motifId: l.motifId || null }));
        TL.commit('Pattern from layer'); UI.buildInspector(); schedule();
      });
    }
    if (q.type === 'image') {
      const im = n.imageId ? TL.asset.get(n.imageId) : null;
      const prev = U.canvas(44, 44);
      if (im) { const x = prev.getContext('2d'), k = Math.min(44 / im.width, 44 / im.height); x.drawImage(im, (44 - im.width * k) / 2, (44 - im.height * k) / 2, im.width * k, im.height * k); }
      return h('div', { class: 'row' }, h('div', { class: 'motifprev' }, prev), UI.btn(im ? 'Replace image…' : 'Import image…', async () => {
        const [f] = await U.pickFiles('image/*');
        if (!f) return;
        const img = await U.loadImage(await U.fileToDataURL(f));
        const k = Math.min(1, 4096 / Math.max(img.width, img.height));
        const c = U.canvas(Math.round(img.width * k), Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        n.imageId = TL.asset.add(c);
        TL.commit('Import image'); UI.buildInspector(); schedule();
      }, 'sm'));
    }
    return null;
  }
  function nodeSection(m) {
    const n = G.active && M.node(m, G.active);
    if (!n) return null;
    const d = M.get(n.type);
    const body = h('div', { class: 'stack' });
    if (!d) { body.append(UI.note('This node type (' + n.type + ') is not installed in this version of TypeLab. It is kept so nothing is lost.')); return UI.section('Node', body, { id: 'mat-node' }); }
    if (d.help) body.append(UI.note(d.help));
    const err = M.engine.errors.get(n.id);
    if (err) body.append(h('div', { class: 'mat-err' }, 'Shader error: ' + err.slice(0, 300)));
    d.params.forEach((q) => {
      const c = customControl(n, q) || (['font', 'text', 'select', 'bool', 'color'].includes(q.type) || q.min != null ? UI.paramControl(q, n.p, q.label) : null);
      if (c) body.append(c);
    });
    if (n.type !== 'material') {
      body.append(UI.slider({ label: 'Seed', min: 1, max: 999, step: 1, value: n.seed, def: 1, seed: true, onInput: (v) => { n.seed = v; TL.touch(); }, onChange: () => TL.commit('Seed') }));
      const outs = d.outputs.map((o, i) => [o, i]).filter(([o]) => !o.hidden);
      if (outs.length > 1) body.append(h('div', { class: 'row' }, h('label', null, 'Preview output'), UI.seg(outs.map(([o, i]) => [String(i), o.label]), String(G.activeOut), (v) => { G.setActive(n.id, +v); if (S.view.channel !== 'node') { S.view.channel = 'node'; saveView(); } UI.buildInspector(); })));
      body.append(h('div', { class: 'row wrap tight' },
        UI.btn('Preview this node', () => { S.view.channel = 'node'; saveView(); UI.buildInspector(); schedule(); }, 'xs'),
        UI.btn('Duplicate', () => { G.select([n.id]); G.duplicate(); }, 'xs'),
        UI.btn('Reset', () => { n.p = M.defaults(n.type); TL.commit('Reset node'); G.sync(); UI.buildInspector(); }, 'xs'),
        UI.btn('Delete', () => { G.select([n.id]); G.deleteSelected(); }, 'xs')));
    }
    return UI.section((n.type === 'material' ? 'Material output' : 'Node · ' + d.name), body, { id: 'mat-node' });
  }

  function materialSection(m) {
    const name = UI.stopKeys(h('input', { type: 'text', class: 'grow', value: m.name }));
    name.addEventListener('change', () => { m.name = name.value.trim() || m.name; TL.commit('Rename material'); buildTabs(); });
    return UI.section('Material', h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('label', null, 'Name'), name),
      UI.select('Resolution', [[256, '256 px'], [512, '512 px'], [1024, '1024 px'], [2048, '2048 px'], [4096, '4096 px']], m.size, (v) => { m.size = +v; TL.commit('Material size'); schedule(); }),
      UI.note('The preview works at up to 1024 px; exports use the export size below. Seamless by construction.'),
      h('div', { class: 'row wrap tight' }, UI.btn('Arrange nodes', G.arrange, 'xs'), UI.btn('Fit view', G.fit, 'xs'), UI.btn('Duplicate material', () => { const c = JSON.parse(JSON.stringify(m)); c.id = U.uid('M'); c.name = m.name + ' copy'; addMaterial(c); }, 'xs'))), { id: 'mat-settings', closed: true });
  }

  // ----------------------------------------------------------------- export + use on the canvas
  const MAPS = [['albedo', 'Albedo / base colour'], ['normal', 'Normal'], ['roughness', 'Roughness'], ['metallic', 'Metallic'], ['ao', 'Ambient occlusion'], ['height', 'Height'], ['emission', 'Emission'], ['opacity', 'Opacity'], ['orm', 'ORM packed (R AO · G rough · B metal)']];
  const safe = (s) => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'material';
  M.renderMaps = (m, size, which, normalY) => {
    const maps = M.maps(m, size);
    const out = [];
    for (const [k] of MAPS) {
      if (!which[k]) continue;
      if (k === 'orm') { out.push([k, M.packORM(maps, size)]); continue; }
      let c = M.toCanvas(maps[k], { mode: ['albedo', 'normal', 'emission'].includes(k) ? 'color' : 'gray' });
      if (k === 'normal' && normalY === 1) { // DirectX: flip green
        const x = c.getContext('2d'), id = x.getImageData(0, 0, c.width, c.height);
        for (let i = 1; i < id.data.length; i += 4) id.data[i] = 255 - id.data[i];
        x.putImageData(id, 0, 0);
      }
      out.push([k, c]);
    }
    return out;
  };
  M.packORM = (maps, size) => {
    const ao = M.toCanvas(maps.ao, { mode: 'gray', size }), r = M.toCanvas(maps.roughness, { mode: 'gray', size }), mt = M.toCanvas(maps.metallic, { mode: 'gray', size });
    const c = U.canvas(size, size), x = c.getContext('2d'), o = x.createImageData(size, size);
    const a = ao.getContext('2d').getImageData(0, 0, size, size).data, b = r.getContext('2d').getImageData(0, 0, size, size).data, d = mt.getContext('2d').getImageData(0, 0, size, size).data;
    for (let i = 0; i < o.data.length; i += 4) { o.data[i] = a[i]; o.data[i + 1] = b[i]; o.data[i + 2] = d[i]; o.data[i + 3] = 255; }
    x.putImageData(o, 0, 0);
    return c;
  };
  M.exportZip = async (m) => {
    const E = S.exp;
    U.toast('Rendering ' + E.size + ' px maps…');
    await U.nextFrame();
    const list = M.renderMaps(m, E.size, E.maps, E.normalY);
    if (!list.length) { U.toast('Pick at least one map'); return; }
    const files = [];
    for (const [k, c] of list) files.push({ name: safe(m.name) + '_' + k + '.png', data: new Uint8Array(await (await U.canvasToBlob(c, 'image/png')).arrayBuffer()) });
    files.push({ name: safe(m.name) + '.typelab-material.json', data: new TextEncoder().encode(JSON.stringify(m, null, 1)) });
    return U.saveBlob(TL.zip(files), safe(m.name) + '_maps.zip', [{ name: 'Zip', extensions: ['zip'] }]);
  };
  M.exportOne = async (m, key) => {
    const list = M.renderMaps(m, S.exp.size, { [key]: true }, S.exp.normalY);
    if (!list.length) return;
    return U.saveBlob(await U.canvasToBlob(list[0][1], 'image/png'), safe(m.name) + '_' + key + '.png', [{ name: 'PNG', extensions: ['png'] }]);
  };
  // put the material on the canvas: a new image layer covering the page, the tile repeated `tiles` times across
  M.toLayer = (m, tiles, lit) => {
    const W = TL.doc.width, H = TL.doc.height, n = Math.max(1, tiles | 0);
    const tilePx = Math.min(2048, Math.max(64, Math.ceil(Math.max(W, H) / n)));
    const size = Math.min(m.size, 2048, 1 << Math.ceil(Math.log2(tilePx)));
    const maps = M.maps(m, size);
    const tile = M.toCanvas(maps.albedo, lit ? { mode: 'lit', maps, light: S.view.light } : { mode: 'color' });
    const c = U.canvas(W, H), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    const step = Math.max(W, H) / n;
    for (let yy = 0; yy < H; yy += step) for (let xx = 0; xx < W; xx += step) x.drawImage(tile, xx, yy, step, step);
    const L = TL.make.image(TL.asset.add(c), W, H, { name: m.name, x: 0, y: 0 });
    const cur = TL.cur();
    if (cur) TL.addLayerBelow(L, cur.id); else TL.addLayer(L);
    TL.commit('Material → layer');
    TL.emit('layers');
    U.toast('Added "' + m.name + '" as a layer');
    return L;
  };
  function exportSection(m) {
    const E = S.exp;
    const checks = h('div', { class: 'mat-checks' }, MAPS.map(([k, label]) => UI.toggle(label, !!E.maps[k], (v) => { E.maps[k] = v; saveExp(); })));
    return UI.section('Export & use', h('div', { class: 'stack' },
      UI.select('Size', [[512, '512 px'], [1024, '1024 px'], [2048, '2048 px'], [4096, '4096 px']], E.size, (v) => { E.size = +v; saveExp(); }),
      checks,
      h('div', { class: 'row' }, h('label', null, 'Normal map'), UI.seg([['0', 'OpenGL (Y+)'], ['1', 'DirectX (Y−)']], String(E.normalY), (v) => { E.normalY = +v; saveExp(); })),
      h('div', { class: 'row wrap tight' }, UI.btn('Export maps (.zip)', () => M.exportZip(m).catch((e) => U.toast(e.message)), 'accent'), UI.btn('Albedo PNG', () => M.exportOne(m, 'albedo').catch((e) => U.toast(e.message)), 'sm')),
      h('div', { class: 'lab' }, 'Use in this document'),
      UI.slider({ label: 'Tiles across', min: 1, max: 16, step: 1, value: E.layerTiles, def: 4, onInput: (v) => { E.layerTiles = v; }, onChange: saveExp }),
      UI.toggle('Lit (shaded with the normal map)', E.layerLit, (v) => { E.layerLit = v; saveExp(); }),
      h('div', { class: 'row wrap tight' }, UI.btn('Add as a layer', () => M.toLayer(m, E.layerTiles, E.layerLit), 'sm'))), { id: 'mat-export' });
  }

  // ----------------------------------------------------------------- mode
  UI.registerMode({
    id: 'material', label: 'Material', icon: 'mMaterial', tools: ['move', 'hand', 'zoom'],
    build(box) {
      enterIfNeeded();
      const m = curMat();
      if (G.material() !== m) G.setMaterial(m); else G.sync();
      buildTabs();
      const hint = $('hint');
      if (hint) hint.textContent = 'Space / right-click: add node · drag output → input to connect · wheel: zoom · middle-drag: pan · F: fit · Del: delete';
      if (!m) { box.append(UI.section('Material', UI.note('Pick a material from the library on the left, or start an empty one.'), { id: 'mat-none' })); return; }
      box.append(previewSection());
      const ns = nodeSection(m);
      if (ns) box.append(ns);
      box.append(materialSection(m), exportSection(m));
      schedule();
    },
  });

  // ----------------------------------------------------------------- show / hide (enter / leave)
  const app = () => $('app');
  const fixDocks = () => {
    // the Layers / History panels are hidden here; a dock left without visible panels collapses to 0
    for (const [side, prop] of [['dockL', '--wL'], ['dockR', '--wR']]) {
      const dock = $(side);
      const visible = dock && Array.from(dock.querySelectorAll('.panel')).some((p) => !['layers', 'history'].includes(p.dataset.panel));
      if (!visible) app().style.setProperty(prop, '0px', 'important');
    }
  };
  function enterIfNeeded() {
    if (S.active) return;
    S.active = true;
    buildView();
    document.body.dataset.mode = 'material';
    S.root.hidden = false;
    fixDocks();
    if (!M.engine.init()) U.toast('WebGL2 float textures are not available — materials need WebGL2');
    G.setMaterial(curMat());
    buildLib();
    requestAnimationFrame(() => { G.sync(); if (!S.fitted) { S.fitted = true; G.fit(); } schedule(); });
  }
  function leave() {
    if (!S.active) return;
    S.active = false;
    document.body.dataset.mode = st.mode;
    if (S.root) S.root.hidden = true;
    app().style.removeProperty('--wL'); app().style.removeProperty('--wR');
    if (UI.dock && UI.dock.apply) UI.dock.apply();
    document.querySelectorAll('.mg-menu').forEach((x) => x.remove());
    setTimeout(() => { if (TL.view) { TL.view.resize(); TL.view.request(true); } }, 30);
  }
  const syncMode = () => { if (st.mode === 'material') enterIfNeeded(); else leave(); document.body.dataset.mode = st.mode; };
  const setMode0 = UI.setMode;
  UI.setMode = (id) => { setMode0(id); syncMode(); };
  const refresh0 = UI.refresh;
  UI.refresh = () => { refresh0(); if ((st.mode === 'material') !== S.active) syncMode(); };
  window.addEventListener('resize', () => { if (S.active) setTimeout(fixDocks, 0); });
  // the topbar tooltip for the new tab (shell.js keeps its hints private)
  const top0 = UI.buildTopbar;
  UI.buildTopbar = () => {
    top0();
    const i = UI.modeOrder.indexOf('material');
    const b = document.querySelectorAll('#topbar .modes .mode')[i];
    if (b) b.title = 'Material (' + (i + 1) + ') — node-based seamless PBR materials, Material Maker style';
  };

  // live updates
  TL.on('touch', () => { if (S.active) { G.refreshValues(); schedule(); } });
  TL.on('matready', schedule);
  TL.on('doc', () => { if (S.active) { G.setMaterial(curMat()); buildTabs(); } });
  TL.on('history', () => { if (S.active) { G.sync(); buildTabs(); schedule(); } });

  // ----------------------------------------------------------------- keyboard guard (capture phase, runs before tools.js)
  window.addEventListener('keydown', guard, true);
  window.addEventListener('keyup', guard, true);
  function guard(e) {
    if (!S.active || st.mode !== 'material') return;
    if (document.querySelector('.overlay, .mg-menu')) return; // command palette / dialogs / add menu handle their own keys
    if (U.isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    // the graph first (Space, Delete, Ctrl+D/C/V/A, F, arrows, Esc)
    if (G.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.type === 'keyup') { e.stopImmediatePropagation(); return; }
    // let the app-wide ones through: undo / redo / save / open / Ctrl+K / F1 / Tab / workspace numbers
    if (mod && ['z', 'y', 's', 'o', 'k'].includes(k)) return;
    if (!mod && !e.altKey && (/^[1-9]$/.test(e.key) || e.key === 'F1' || e.key === 'Tab')) return;
    // everything else (layer shortcuts, tool letters, Delete layer, nudge…) is meaningless here: swallow it
    e.stopImmediatePropagation();
  }

  // ----------------------------------------------------------------- Ctrl+K commands
  if (UI.addCommands) UI.addCommands(() => [
    { label: 'Go to Material', cat: 'Workspace', key: String(UI.modeOrder.indexOf('material') + 1), run: () => UI.setMode('material') },
    { label: 'New empty material', cat: 'Material', run: () => { UI.setMode('material'); M.newEmpty(); } },
    { label: 'Export material maps (.zip)', cat: 'Material', run: () => { const m = curMat(); if (m) M.exportZip(m); else U.toast('No material yet'); } },
    { label: 'Add material to the canvas as a layer', cat: 'Material', run: () => { const m = curMat(); if (m) M.toLayer(m, S.exp.layerTiles, S.exp.layerLit); } },
    ...M.presets.map((p) => ({ label: 'New material: ' + p.name, cat: 'Material · ' + p.cat, run: () => { UI.setMode('material'); M.newFromPreset(p.id); } })),
    ...(st.mode === 'material' ? M.list().filter((d) => d.id !== 'material').map((d) => ({ label: 'Add node: ' + d.name, cat: 'Material node · ' + d.cat, run: () => G.addMenuAtMouse && G.addNodeAtScreen(d.id, innerWidth / 2, innerHeight / 2) })) : []),
  ]);
})(window.TL);
