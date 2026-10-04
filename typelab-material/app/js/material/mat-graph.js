// TypeLab Material — node graph editor (DOM nodes + one SVG layer for the wires).
//
//   add node      Space / right-click / double-click on empty space → search menu; or drag from the library
//   connect       drag output → input; drop a wire on empty space → menu of nodes that fit, auto-connected
//   re-route      drag a connected input away (drop on nothing = disconnect); Alt+click a wire deletes it
//   select        click · Shift+click adds · drag on empty space = box select · Ctrl+A all
//   move / view   drag a node · middle-drag or Space+drag pans · wheel zooms · F fits · arrows pan
//   edit          Delete · Ctrl+D duplicate · Ctrl+C / Ctrl+V · drag the small values on a node (Shift = fine)
// Every change is one TypeLab history step (TL.commit), so Ctrl+Z works as everywhere else.
(function (TL) {
  const U = TL.util;
  const h = U.h;
  const M = TL.mat;
  const G = (M.graph = { sel: new Set(), active: null, activeOut: 0 });
  let wrap, world, wires, nodesEl, boxEl, mini, tmpWire;
  let mat = null;
  const views = new Map(); // mat id → {x, y, z}
  const portPos = new Map(); // `${id}:i:${k}` / `${id}:o:${k}` → [dx, dy] from the node origin
  const nodeEls = new Map();
  let lastStruct = '';
  let mouse = { x: 0, y: 0 }; // last pointer position (screen)
  let spaceDown = false, spaceUsed = false;
  let clip = null;

  const view = () => { if (!mat) return { x: 0, y: 0, z: 1 }; if (!views.has(mat.id)) views.set(mat.id, loadView(mat.id) || { x: 60, y: 60, z: 0.85 }); return views.get(mat.id); };
  const loadView = (id) => { try { return JSON.parse(localStorage.getItem('matview:' + id) || 'null'); } catch (e) { return null; } };
  const saveView = U.debounce(() => { if (mat) try { localStorage.setItem('matview:' + mat.id, JSON.stringify(view())); } catch (e) { /* ignore */ } }, 400);
  const applyView = () => { const v = view(); world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`; wrap.style.setProperty('--z', v.z); drawMini(); saveView(); };
  const toWorld = (sx, sy) => { const r = wrap.getBoundingClientRect(), v = view(); return [(sx - r.left - v.x) / v.z, (sy - r.top - v.y) / v.z]; };
  const commit = (label) => { TL.commit(label); if (G.onChange) G.onChange(label); };

  // ================================================================= mount
  G.mount = (container) => {
    wrap = h('div', { class: 'mg-wrap', tabindex: '-1' });
    world = h('div', { class: 'mg-world' });
    wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wires.setAttribute('class', 'mg-wires');
    tmpWire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tmpWire.setAttribute('class', 'mg-wire tmp');
    nodesEl = h('div', { class: 'mg-nodes' });
    boxEl = h('div', { class: 'mg-box' });
    mini = h('canvas', { class: 'mg-mini', width: 180, height: 120, title: 'Overview · click or drag to move the view' });
    world.append(wires, nodesEl);
    wrap.append(world, boxEl, mini, h('div', { class: 'mg-empty' }));
    container.append(wrap);
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
    wrap.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('dblclick', (e) => { if (e.target === wrap || e.target === world || e.target === nodesEl || e.target.classList.contains('mg-wires')) addMenu(e.clientX, e.clientY); });
    wrap.addEventListener('contextmenu', onContext);
    wrap.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('text/x-mat-node')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    wrap.addEventListener('drop', (e) => {
      const type = e.dataTransfer.getData('text/x-mat-node');
      if (!type || !mat) return;
      e.preventDefault(); e.stopPropagation();
      const [x, y] = toWorld(e.clientX, e.clientY);
      G.addNode(type, x - 80, y - 14);
    });
    miniEvents();
    new ResizeObserver(() => drawMini()).observe(wrap);
  };
  G.el = () => wrap;

  // ================================================================= render
  const structKey = (m) => m ? m.id + '|' + m.nodes.map((n) => n.id + n.type + (n.preview ? 'p' : '') + (n.collapsed ? 'c' : '')).join() + '|' + m.links.map((l) => l.from + l.out + l.to + l.in).join() : '';
  G.setMaterial = (m) => {
    if (m !== mat) {
      // after undo / redo the document is a fresh copy: same material id → keep selection and the previewed node
      const same = m && mat && m.id === mat.id;
      mat = m; lastStruct = '';
      if (!same) { G.sel.clear(); G.active = m ? (M.output(m) || {}).id : null; G.activeOut = 0; }
    }
    G.sync();
  };
  G.material = () => mat;
  // rebuild the DOM only when the graph's structure changed; otherwise just move nodes / refresh values
  G.sync = () => {
    if (!wrap) return;
    if (mat && !M.mats().includes(mat)) { const same = M.mats().find((x) => x.id === mat.id); mat = same || null; lastStruct = ''; }
    const k = structKey(mat);
    if (k !== lastStruct) { lastStruct = k; G.render(); return; }
    if (!mat) return;
    mat.nodes.forEach((n) => { const el = nodeEls.get(n.id); if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; } });
    G.refreshValues();
    drawWires();
  };
  G.render = () => {
    nodesEl.replaceChildren();
    nodeEls.clear();
    portPos.clear();
    wrap.classList.toggle('none', !mat);
    if (!mat) { wires.replaceChildren(); return; }
    for (const id of Array.from(G.sel)) if (!M.node(mat, id)) G.sel.delete(id);
    if (G.active && !M.node(mat, G.active)) { G.active = (M.output(mat) || {}).id; G.activeOut = 0; }
    mat.nodes.forEach((n) => { const el = nodeEl(n); nodeEls.set(n.id, el); nodesEl.append(el); });
    // port offsets (measured once per render; nodes keep their size while dragged) — with the current zoom applied
    applyView();
    const v = view();
    nodeEls.forEach((el, id) => {
      const r0 = el.getBoundingClientRect();
      el.querySelectorAll('.mg-port').forEach((p) => {
        const r = p.getBoundingClientRect();
        portPos.set(id + ':' + p.dataset.dir + ':' + p.dataset.idx, [(r.left + r.width / 2 - r0.left) / v.z, (r.top + r.height / 2 - r0.top) / v.z]);
      });
    });
    applyView();
    drawWires();
    G.refreshValues();
    if (G.onRender) G.onRender();
  };

  const typeColor = (t) => M.TYPE_COLOR[t] || '#999';
  function nodeEl(n) {
    const d = M.get(n.type);
    const el = h('div', { class: 'mg-node' + (G.sel.has(n.id) ? ' sel' : '') + (G.active === n.id ? ' active' : '') + (d ? '' : ' missing') + (n.type === 'material' ? ' output' : ''), 'data-id': n.id, style: { left: n.x + 'px', top: n.y + 'px' } });
    const cat = d ? d.cat : 'Missing';
    const eye = h('button', { class: 'mg-eye' + (n.preview ? ' on' : ''), title: 'Show a preview on the node' }, '◉');
    eye.onclick = (e) => { e.stopPropagation(); n.preview = !n.preview; commit(n.preview ? 'Node preview on' : 'Node preview off'); G.sync(); };
    const head = h('div', { class: 'mg-head', style: { '--cat': M.CAT_COLOR[cat] || '#888' }, title: d ? (d.help || d.name) : 'This node type is not installed: ' + n.type },
      h('span', { class: 'mg-title' }, d ? d.name : 'Missing: ' + n.type), n.type === 'material' ? null : eye);
    el.append(head);
    if (!d) return el;
    const outs = d.outputs.map((o, i) => [o, i]).filter(([o]) => !o.hidden);
    const rows = Math.max(d.inputs.length, outs.length);
    const body = h('div', { class: 'mg-ports' });
    for (let r = 0; r < rows; r++) {
      const inp = d.inputs[r], out = outs[r];
      const row = h('div', { class: 'mg-row' });
      if (inp) row.append(h('span', { class: 'mg-port in', 'data-dir': 'i', 'data-idx': r, 'data-type': inp.type, style: { '--pc': typeColor(inp.type) }, title: inp.label + ' (' + inp.type + ')' }), h('span', { class: 'mg-pl in' }, inp.label));
      else row.append(h('span', { class: 'mg-pl in' }));
      if (out) {
        const [o, i] = out;
        const lab = h('span', { class: 'mg-pl out' + (G.active === n.id && G.activeOut === i ? ' on' : ''), title: 'Click to preview this output' }, o.label);
        lab.onclick = (e) => { e.stopPropagation(); G.setActive(n.id, i); };
        row.append(lab, h('span', { class: 'mg-port out', 'data-dir': 'o', 'data-idx': i, 'data-type': o.type, style: { '--pc': typeColor(o.type) }, title: o.label + ' (' + o.type + ')' }));
      }
      body.append(row);
    }
    el.append(body);
    if (d.inline.length) {
      const pr = h('div', { class: 'mg-params' });
      d.inline.forEach((k) => { const q = d.params.find((x) => x.k === k); if (q) pr.append(miniParam(n, q)); });
      el.append(pr);
    }
    if (n.preview) el.append(h('canvas', { class: 'mg-thumb', width: 150, height: 150 }));
    if (M.engine.errors.has(n.id)) { el.classList.add('err'); el.title = M.engine.errors.get(n.id); }
    return el;
  }

  // small draggable value on the node card
  const fmt = (q, v) => {
    if (q.type === 'select') return String(q.options[v | 0] != null ? q.options[v | 0] : v);
    if (q.type === 'bool') return v ? 'on' : 'off';
    if (typeof v !== 'number') return String(v == null ? '' : v).slice(0, 14);
    return q.step >= 1 ? String(Math.round(v)) : (Math.round(v * 100) / 100).toString();
  };
  function miniParam(n, q) {
    const val = h('span', { class: 'mg-pv' });
    const bar = h('span', { class: 'mg-pbar' });
    const row = h('div', { class: 'mg-param', 'data-k': q.k, title: q.label + (q.type === 'select' || q.type === 'bool' ? ' · click to change' : ' · drag ←→ (Shift = fine) · click to type') }, bar, h('span', { class: 'mg-pn' }, q.label), val);
    row.refresh = () => {
      const v = n.p[q.k];
      val.textContent = fmt(q, v);
      bar.style.width = (typeof v === 'number' && q.max > q.min && q.type !== 'select' ? U.clamp((v - q.min) / (q.max - q.min), 0, 1) * 100 : 0) + '%';
    };
    row.refresh();
    row.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (q.type === 'select') { UI().menu(row, q.options.map((o, i) => ({ label: o, on: (n.p[q.k] | 0) === i, action: () => { n.p[q.k] = i; commit(q.label); G.refreshValues(); } }))); return; }
      if (q.type === 'bool') { n.p[q.k] = !n.p[q.k]; commit(q.label); G.refreshValues(); return; }
      if (typeof n.p[q.k] !== 'number') return;
      const x0 = e.clientX, v0 = n.p[q.k];
      let moved = false;
      row.setPointerCapture(e.pointerId);
      const span = q.max - q.min, step = q.step || 0.01;
      const mv = (ev) => {
        const dx = ev.clientX - x0;
        if (!moved && Math.abs(dx) < 3) return;
        moved = true;
        let v = v0 + dx * span / 160 * (ev.shiftKey ? 0.1 : 1);
        v = U.clamp(Math.round(v / step) * step, q.min, q.max);
        if (v !== n.p[q.k]) { n.p[q.k] = +v.toFixed(4); row.refresh(); TL.touch(); }
      };
      const up = () => {
        row.removeEventListener('pointermove', mv); row.removeEventListener('pointerup', up);
        if (moved) { commit(q.label); return; }
        // click = type a value
        const inp = UI().stopKeys(h('input', { type: 'number', class: 'mg-pin', step, value: n.p[q.k] }));
        const done = () => { const v = parseFloat(inp.value); if (isFinite(v)) { n.p[q.k] = U.clamp(v, q.min, q.max + span); commit(q.label); } inp.remove(); G.refreshValues(); };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = n.p[q.k]; inp.blur(); } });
        inp.addEventListener('blur', done);
        row.append(inp); inp.focus(); inp.select();
      };
      row.addEventListener('pointermove', mv); row.addEventListener('pointerup', up);
    });
    return row;
  }
  const UI = () => TL.ui;
  G.refreshValues = () => { nodesEl && nodesEl.querySelectorAll('.mg-param').forEach((r) => r.refresh && r.refresh()); };

  // ================================================================= wires
  const portXY = (id, dir, idx) => { const n = M.node(mat, id), o = portPos.get(id + ':' + dir + ':' + idx); return n && o ? [n.x + o[0], n.y + o[1]] : null; };
  const curve = (a, b) => { const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5); return `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`; };
  function drawWires() {
    if (!mat) return;
    wires.replaceChildren();
    mat.links.forEach((l) => {
      const a = portXY(l.from, 'o', l.out), b = portXY(l.to, 'i', l.in);
      if (!a || !b) return;
      const fromN = M.node(mat, l.from), d = M.get(fromN.type), t = d && d.outputs[l.out] ? d.outputs[l.out].type : 'gray';
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', curve(a, b));
      p.setAttribute('class', 'mg-wire' + (G.sel.has(l.from) || G.sel.has(l.to) ? ' hl' : ''));
      p.style.stroke = typeColor(t);
      p.addEventListener('pointerdown', (e) => {
        if (!e.altKey) return;
        e.stopPropagation();
        mat.links = mat.links.filter((x) => x !== l);
        commit('Disconnect'); G.sync();
      });
      const hit = p.cloneNode(); hit.setAttribute('class', 'mg-wire-hit'); hit.style.stroke = '';
      hit.addEventListener('pointerdown', (e) => { if (!e.altKey) return; e.stopPropagation(); mat.links = mat.links.filter((x) => x !== l); commit('Disconnect'); G.sync(); });
      hit.append(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'title'), { textContent: 'Alt+click to delete this connection' }));
      wires.append(hit, p);
    });
    wires.append(tmpWire);
    drawMini();
  }

  // ================================================================= selection / active node
  G.select = (ids, add) => {
    if (!add) G.sel.clear();
    ids.forEach((id) => G.sel.add(id));
    nodeEls.forEach((el, id) => el.classList.toggle('sel', G.sel.has(id)));
    drawWires();
    if (G.onSelect) G.onSelect();
  };
  G.setActive = (id, out = 0) => {
    G.active = id; G.activeOut = out;
    nodeEls.forEach((el, nid) => el.classList.toggle('active', nid === id));
    nodesEl.querySelectorAll('.mg-pl.out').forEach((x) => x.classList.remove('on'));
    const el = nodeEls.get(id);
    if (el) { const lab = el.querySelector(`.mg-port.out[data-idx="${out}"]`); if (lab && lab.previousSibling) lab.previousSibling.classList.add('on'); }
    if (G.onSelect) G.onSelect();
  };
  G.selected = () => (mat ? mat.nodes.filter((n) => G.sel.has(n.id)) : []);

  // ================================================================= editing
  G.addNode = (type, x, y, link) => {
    if (!mat || !M.get(type)) return null;
    const n = M.addNode(mat, type, x, y);
    if (link) {
      const d = M.get(type);
      if (link.dir === 'o') { const i = d.inputs.findIndex((inp) => compatible(link.type, inp.type)); if (i >= 0) M.link(mat, link.id, link.idx, n.id, i); }
      else { const i = d.outputs.findIndex((o) => !o.hidden && compatible(o.type, link.type)); if (i >= 0) M.link(mat, n.id, i, link.id, link.idx); }
    }
    G.sel.clear(); G.sel.add(n.id);
    G.active = n.id; G.activeOut = 0;
    commit('Add ' + M.get(type).name);
    G.sync();
    return n;
  };
  const compatible = () => true; // gray ↔ colour convert automatically (luminance / gray→rgb)
  G.deleteSelected = () => {
    if (!mat) return;
    const ids = Array.from(G.sel).filter((id) => { const n = M.node(mat, id); return n && n.type !== 'material'; });
    if (!ids.length) return;
    M.removeNodes(mat, ids);
    G.sel.clear();
    commit(ids.length > 1 ? 'Delete nodes' : 'Delete node');
    G.sync();
  };
  G.copy = () => {
    if (!mat) return false;
    const nodes = G.selected().filter((n) => n.type !== 'material');
    if (!nodes.length) return false;
    const ids = new Set(nodes.map((n) => n.id));
    clip = { nodes: JSON.parse(JSON.stringify(nodes)), links: mat.links.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => Object.assign({}, l)) };
    try { navigator.clipboard && navigator.clipboard.writeText(JSON.stringify({ typelabMaterialNodes: clip })).catch(() => {}); } catch (e) { /* ignore */ }
    return true;
  };
  G.paste = (offset = 40) => {
    if (!mat || !clip) return;
    const map = new Map();
    const fresh = clip.nodes.map((n) => { const c = JSON.parse(JSON.stringify(n)); c.id = U.uid('N'); c.x += offset; c.y += offset; map.set(n.id, c.id); return c; });
    mat.nodes.push(...fresh);
    clip.links.forEach((l) => mat.links.push({ from: map.get(l.from), out: l.out, to: map.get(l.to), in: l.in }));
    G.sel = new Set(fresh.map((n) => n.id));
    commit('Paste nodes');
    G.sync();
  };
  G.duplicate = () => { if (G.copy()) G.paste(30); };
  G.fit = () => {
    if (!mat || !mat.nodes.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    mat.nodes.forEach((n) => { const el = nodeEls.get(n.id); const w = el ? el.offsetWidth : 170, hh = el ? el.offsetHeight : 80; x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + hh); });
    const r = wrap.getBoundingClientRect(), pad = 40;
    const z = U.clamp(Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0)), 0.25, 1.1);
    const v = view();
    v.z = z; v.x = (r.width - (x1 - x0) * z) / 2 - x0 * z; v.y = (r.height - (y1 - y0) * z) / 2 - y0 * z;
    applyView();
  };
  G.arrange = () => { if (!mat) return; M.layout(mat); commit('Arrange nodes'); G.sync(); requestAnimationFrame(G.fit); };

  // ================================================================= pointer
  function onWheel(e) {
    e.preventDefault();
    const v = view(), r = wrap.getBoundingClientRect();
    if (e.ctrlKey || Math.abs(e.deltaY) >= 40 || e.deltaMode) {
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const z = U.clamp(v.z * Math.exp(-dy * (Math.abs(dy) >= 40 ? 0.0015 : 0.01)), 0.2, 2.5);
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      v.x = mx - (mx - v.x) * z / v.z; v.y = my - (my - v.y) * z / v.z; v.z = z;
    } else { v.x -= e.deltaX; v.y -= e.deltaY; }
    applyView();
  }

  function onDown(e) {
    if (!mat) return;
    mouse = { x: e.clientX, y: e.clientY };
    wrap.focus({ preventScroll: true });
    const t = e.target;
    // pan: middle button, or Space / Alt held on empty space
    const empty = t === wrap || t === world || t === nodesEl || t === wires || t.classList.contains('mg-empty');
    if (e.button === 1 || (e.button === 0 && spaceDown)) { if (spaceDown) spaceUsed = true; return pan(e); }
    if (e.button !== 0) return;
    const port = t.closest('.mg-port');
    if (port) return wireDrag(e, port);
    const nodeE = t.closest('.mg-node');
    if (nodeE && !t.closest('button, input, .mg-param, .mg-pl.out')) return nodeDrag(e, nodeE.dataset.id);
    if (empty) return boxSelect(e);
  }

  function pan(e) {
    e.preventDefault();
    const v = view(), x0 = e.clientX - v.x, y0 = e.clientY - v.y;
    wrap.setPointerCapture(e.pointerId);
    wrap.classList.add('panning');
    const mv = (ev) => { v.x = ev.clientX - x0; v.y = ev.clientY - y0; applyView(); };
    const up = () => { wrap.removeEventListener('pointermove', mv); wrap.removeEventListener('pointerup', up); wrap.classList.remove('panning'); };
    wrap.addEventListener('pointermove', mv); wrap.addEventListener('pointerup', up);
  }

  function nodeDrag(e, id) {
    if (e.shiftKey) { G.sel.has(id) ? G.sel.delete(id) : G.sel.add(id); G.select([], true); return; }
    if (!G.sel.has(id)) G.select([id]);
    if (G.active !== id) G.setActive(id, 0);
    const v = view();
    const items = G.selected().map((n) => ({ n, x: n.x, y: n.y, el: nodeEls.get(n.id) }));
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    wrap.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const dx = (ev.clientX - x0) / v.z, dy = (ev.clientY - y0) / v.z;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      items.forEach((it) => { it.n.x = Math.round(it.x + dx); it.n.y = Math.round(it.y + dy); if (it.el) { it.el.style.left = it.n.x + 'px'; it.el.style.top = it.n.y + 'px'; } });
      drawWires();
    };
    const up = () => { wrap.removeEventListener('pointermove', mv); wrap.removeEventListener('pointerup', up); if (moved) commit(items.length > 1 ? 'Move nodes' : 'Move node'); };
    wrap.addEventListener('pointermove', mv); wrap.addEventListener('pointerup', up);
  }

  function boxSelect(e) {
    const r = wrap.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY, add = e.shiftKey;
    let moved = false;
    wrap.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      const a = [Math.min(x0, ev.clientX), Math.min(y0, ev.clientY)], b = [Math.max(x0, ev.clientX), Math.max(y0, ev.clientY)];
      Object.assign(boxEl.style, { display: 'block', left: a[0] - r.left + 'px', top: a[1] - r.top + 'px', width: b[0] - a[0] + 'px', height: b[1] - a[1] + 'px' });
      const ids = [];
      nodeEls.forEach((el, id) => { const q = el.getBoundingClientRect(); if (q.right > a[0] && q.left < b[0] && q.bottom > a[1] && q.top < b[1]) ids.push(id); });
      G.select(ids, add);
    };
    const up = () => {
      wrap.removeEventListener('pointermove', mv); wrap.removeEventListener('pointerup', up);
      boxEl.style.display = 'none';
      if (!moved && !add) G.select([]);
    };
    wrap.addEventListener('pointermove', mv); wrap.addEventListener('pointerup', up);
  }

  function wireDrag(e, port) {
    e.stopPropagation();
    let id = port.closest('.mg-node').dataset.id, dir = port.dataset.dir, idx = +port.dataset.idx, type = port.dataset.type;
    // grabbing a connected input picks the wire up from its source
    if (dir === 'i') {
      const l = M.inLink(mat, id, idx);
      if (l) {
        mat.links = mat.links.filter((x) => x !== l);
        drawWires();
        const fromD = M.get(M.node(mat, l.from).type);
        id = l.from; dir = 'o'; idx = l.out; type = fromD.outputs[l.out].type;
        G._detached = true;
      }
    }
    const start = portXY(id, dir, idx);
    tmpWire.style.stroke = typeColor(type);
    wrap.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const p = toWorld(ev.clientX, ev.clientY);
      tmpWire.setAttribute('d', dir === 'o' ? curve(start, p) : curve(p, start));
      wrap.querySelectorAll('.mg-port.hot').forEach((x) => x.classList.remove('hot'));
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const tp = over && over.closest && over.closest('.mg-port');
      if (tp && tp.dataset.dir !== dir) tp.classList.add('hot');
    };
    const up = (ev) => {
      wrap.removeEventListener('pointermove', mv); wrap.removeEventListener('pointerup', up);
      tmpWire.setAttribute('d', '');
      wrap.querySelectorAll('.mg-port.hot').forEach((x) => x.classList.remove('hot'));
      const detached = G._detached; G._detached = false;
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const tp = over && over.closest && over.closest('.mg-port');
      if (tp && tp.dataset.dir !== dir) {
        const tid = tp.closest('.mg-node').dataset.id, tidx = +tp.dataset.idx;
        const ok = dir === 'o' ? M.link(mat, id, idx, tid, tidx) : M.link(mat, tid, tidx, id, idx);
        if (!ok) U.toast('That connection would make a loop');
        commit(ok ? 'Connect' : 'Disconnect'); G.sync();
        return;
      }
      const onEmpty = !over || !over.closest || !over.closest('.mg-node');
      if (onEmpty && wrap.contains(over)) { addMenu(ev.clientX, ev.clientY, { id, dir, idx, type }, detached); return; }
      if (detached) { commit('Disconnect'); G.sync(); }
    };
    wrap.addEventListener('pointermove', mv); wrap.addEventListener('pointerup', up);
  }

  function onContext(e) {
    e.preventDefault();
    if (!mat) return;
    const nodeE = e.target.closest('.mg-node');
    if (!nodeE) { addMenu(e.clientX, e.clientY); return; }
    const id = nodeE.dataset.id, n = M.node(mat, id);
    if (!G.sel.has(id)) G.select([id]);
    const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
    UI().menu(anchor, [
      { label: 'Preview this node', action: () => G.setActive(id, 0) },
      { label: n.preview ? 'Hide preview on node' : 'Show preview on node', action: () => { n.preview = !n.preview; commit('Node preview'); G.sync(); } },
      { label: 'Duplicate', hint: 'Ctrl+D', action: G.duplicate },
      { label: 'Reset settings', action: () => { n.p = M.defaults(n.type); commit('Reset node'); G.sync(); if (G.onSelect) G.onSelect(); } },
      { label: 'New random seed', action: () => { n.seed = 1 + Math.floor(Math.random() * 998); commit('Seed'); } },
      '-',
      { label: 'Delete', hint: 'Del', disabled: n.type === 'material', action: G.deleteSelected },
    ]);
  }

  // ================================================================= add-node menu (search)
  function addMenu(sx, sy, link, detached) {
    UI().closePopups && UI().closePopups();
    const [wx, wy] = toWorld(sx, sy);
    const all = M.list().filter((d) => d.id !== 'material' || !M.output(mat));
    const items = all.filter((d) => !link || (link.dir === 'o' ? d.inputs.length : d.outputs.some((o) => !o.hidden)));
    const input = UI().stopKeys(h('input', { type: 'text', class: 'mg-search', placeholder: link ? 'Add a node and connect it…' : 'Add node…' }));
    const list = h('div', { class: 'mg-mlist' });
    let shown = [], sel = 0;
    const close = () => { pop.remove(); window.removeEventListener('pointerdown', outside, true); if (detached) { commit('Disconnect'); G.sync(); } };
    const pick = (d) => { detached = false; pop.remove(); window.removeEventListener('pointerdown', outside, true); G.addNode(d.id, wx - (link && link.dir === 'i' ? 170 : 0), wy - 14, link); };
    const render = () => {
      const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      shown = items.filter((d) => { const s = (d.name + ' ' + d.cat + ' ' + (d.help || '') + ' ' + d.id).toLowerCase(); return q.every((w) => s.includes(w)); });
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.replaceChildren();
      let lastCat = null;
      shown.forEach((d, i) => {
        if (!q.length && d.cat !== lastCat) { list.append(h('div', { class: 'mg-mcat' }, d.cat)); lastCat = d.cat; }
        list.append(h('div', { class: 'mg-mi' + (i === sel ? ' on' : ''), title: d.help || '', onmouseenter: () => { sel = i; paint(); }, onclick: () => pick(d) },
          h('i', { style: { background: M.CAT_COLOR[d.cat] } }), h('span', null, d.name), q.length ? h('small', null, d.cat) : null));
      });
      if (!shown.length) list.append(h('div', { class: 'mg-mcat' }, 'No matches'));
    };
    const paint = () => list.querySelectorAll('.mg-mi').forEach((el, i) => { el.classList.toggle('on', i === sel); if (i === sel) el.scrollIntoView({ block: 'nearest' }); });
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (shown[sel]) pick(shown[sel]); }
      else if (e.key === 'Escape') close();
      e.stopPropagation();
    });
    const pop = h('div', { class: 'mg-menu' }, input, list);
    document.body.append(pop);
    const W = 260, H = 340;
    pop.style.left = Math.min(sx, innerWidth - W - 8) + 'px';
    pop.style.top = Math.min(sy, innerHeight - H - 8) + 'px';
    const outside = (e) => { if (!pop.contains(e.target)) close(); };
    setTimeout(() => window.addEventListener('pointerdown', outside, true), 0);
    render();
    input.focus();
  }
  G.addMenuAtMouse = () => { const r = wrap.getBoundingClientRect(); const inside = mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom; addMenu(inside ? mouse.x : r.left + r.width / 2, inside ? mouse.y : r.top + r.height / 2); };

  // ================================================================= keyboard (called by the workspace's key guard)
  G.key = (e) => {
    if (!mat) return false;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.type === 'keyup') { if (e.key === ' ') { spaceDown = false; wrap.classList.remove('grab'); if (!spaceUsed) G.addMenuAtMouse(); } return e.key === ' '; }
    if (e.key === ' ') { if (!spaceDown) { spaceDown = true; spaceUsed = false; wrap.classList.add('grab'); } return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { G.deleteSelected(); return true; }
    if (mod && k === 'd') { G.duplicate(); return true; }
    if (mod && k === 'c') { G.copy(); return true; }
    if (mod && k === 'v') { G.paste(); return true; }
    if (mod && k === 'a') { G.select(mat.nodes.map((n) => n.id)); return true; }
    if (!mod && (k === 'f' || e.key === 'Home')) { G.fit(); return true; }
    if (e.key === 'Escape') { G.select([]); return true; }
    if (e.key.startsWith('Arrow') && !mod) {
      const v = view(), s = e.shiftKey ? 120 : 40;
      if (e.key === 'ArrowLeft') v.x += s; if (e.key === 'ArrowRight') v.x -= s; if (e.key === 'ArrowUp') v.y += s; if (e.key === 'ArrowDown') v.y -= s;
      applyView(); return true;
    }
    return false;
  };

  // ================================================================= minimap
  let miniBounds = null;
  function drawMini() {
    if (!mini || !mat) return;
    const x = mini.getContext('2d'), W = mini.width, H = mini.height;
    x.clearRect(0, 0, W, H);
    if (!mat.nodes.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const boxes = mat.nodes.map((n) => { const el = nodeEls.get(n.id); const w = el ? el.offsetWidth : 170, hh = el ? el.offsetHeight : 80; x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + hh); return [n, w, hh]; });
    const r = wrap.getBoundingClientRect(), v = view();
    const vx0 = -v.x / v.z, vy0 = -v.y / v.z, vx1 = vx0 + r.width / v.z, vy1 = vy0 + r.height / v.z;
    x0 = Math.min(x0, vx0); y0 = Math.min(y0, vy0); x1 = Math.max(x1, vx1); y1 = Math.max(y1, vy1);
    const k = Math.min((W - 8) / (x1 - x0), (H - 8) / (y1 - y0));
    const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = (H - (y1 - y0) * k) / 2 - y0 * k;
    miniBounds = { k, ox, oy };
    boxes.forEach(([n, w, hh]) => { const d = M.get(n.type); x.fillStyle = d ? M.CAT_COLOR[d.cat] : '#f55'; x.globalAlpha = G.sel.has(n.id) ? 1 : 0.55; x.fillRect(ox + n.x * k, oy + n.y * k, Math.max(2, w * k), Math.max(2, hh * k)); });
    x.globalAlpha = 1; x.strokeStyle = '#e6e6ea'; x.lineWidth = 1;
    x.strokeRect(ox + vx0 * k + 0.5, oy + vy0 * k + 0.5, (vx1 - vx0) * k, (vy1 - vy0) * k);
  }
  function miniEvents() {
    const go = (e) => {
      if (!miniBounds) return;
      const r = mini.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), v = view();
      const wx = (e.clientX - r.left - miniBounds.ox) / miniBounds.k, wy = (e.clientY - r.top - miniBounds.oy) / miniBounds.k;
      v.x = wr.width / 2 - wx * v.z; v.y = wr.height / 2 - wy * v.z;
      applyView();
    };
    mini.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); mini.setPointerCapture(e.pointerId); go(e);
      const mv = (ev) => go(ev), up = () => { mini.removeEventListener('pointermove', mv); mini.removeEventListener('pointerup', up); };
      mini.addEventListener('pointermove', mv); mini.addEventListener('pointerup', up);
    });
  }

  // node thumbnails (called by the workspace after each preview pass)
  G.drawThumbs = (size) => {
    if (!mat) return;
    nodeEls.forEach((el, id) => {
      const c = el.querySelector('.mg-thumb');
      if (!c) return;
      const n = M.node(mat, id), d = M.get(n.type);
      if (!d) return;
      const oi = Math.max(0, d.outputs.findIndex((o) => !o.hidden));
      const t = M.evalNode(mat, id, n.type === 'material' ? 0 : oi, size);
      if (t) M.draw2D(c, t, { mode: 'color' });
    });
    // error marks
    nodeEls.forEach((el, id) => { const err = M.engine.errors.get(id); el.classList.toggle('err', !!err); if (err) el.title = err; });
  };
})(window.TL);
