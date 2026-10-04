// TypeLab Material — node registry, graph model and GPU engine.
//
// Graph data lives in the document (TL.doc.materials), so undo, autosave and .typelab files work unchanged:
//   { id, name, size, nodes: [{ id, type, x, y, p: {...}, seed, imageId? }], links: [{ from, out, to, in }] }
// An Image node keeps its picture as `imageId` — the key TypeLab's asset GC / save regex already knows.
//
// Engine: its own WebGL2 context (isolated from TL.gl's state). Every node output renders into its own
// RGBA16F texture (RGBA8 fallback) with REPEAT wrapping, cached by a hash of everything upstream — so a change
// only re-runs the nodes below it. Materials are seamless by construction (all generators are periodic).
(function (TL) {
  const U = TL.util;
  const M = (TL.mat = TL.mat || {});

  // ================================================================= registry
  M.defs = new Map();
  M.CATS = ['TypeLab', 'Generators', 'Patterns', 'Filters', 'Adjust', 'Combine', 'Transform', 'Height & normal', 'Output'];
  M.TYPE_COLOR = { gray: '#9a9aa6', color: '#5aa2ff' };
  M.CAT_COLOR = { TypeLab: '#c8ff3c', Generators: '#e0a030', Patterns: '#d06fd8', Filters: '#5aa2ff', Adjust: '#3fc4b0', Combine: '#f07850', Transform: '#8a8cff', 'Height & normal': '#b38cff', Output: '#ff5577' };
  const NO_UNIFORM = new Set(['text', 'font', 'layer', 'pattern', 'image', 'gen']);
  M.noUniform = (q) => NO_UNIFORM.has(q.type) || !!q.noUniform;

  // d: { id, name, cat, help, inputs:[{k,label,type,def}], outputs:[{k,label,type,expr,hidden}], params:[...],
  //      glsl (helper functions), code (statements in main), passes:[{code,expr}], source(node,size), sourceSig(node),
  //      inline: [param keys shown on the node card] }
  M.def = (d) => {
    d.inputs = d.inputs || [];
    d.outputs = d.outputs || [];
    d.params = d.params || [];
    d.cat = d.cat || 'Filters';
    if (!d.inline) d.inline = d.params.filter((q) => !M.noUniform(q) && q.type !== 'color').slice(0, 3).map((q) => q.k);
    M.defs.set(d.id, d);
  };
  M.get = (id) => M.defs.get(id);
  M.list = () => Array.from(M.defs.values()).filter((d) => !d.hidden);
  M.defaults = (type) => { const d = M.get(type), p = {}; if (d) d.params.forEach((q) => (p[q.k] = Array.isArray(q.def) ? q.def.slice() : q.def)); return p; };

  // ================================================================= graph model
  M.newMaterial = (name = 'Material') => {
    const mat = { id: U.uid('M'), name, size: 1024, nodes: [], links: [] };
    M.addNode(mat, 'material', 600, 120);
    return mat;
  };
  M.addNode = (mat, type, x = 0, y = 0, p = {}) => {
    const n = { id: U.uid('N'), type, x: Math.round(x), y: Math.round(y), p: Object.assign(M.defaults(type), p), seed: 1 + Math.floor(Math.random() * 998) };
    mat.nodes.push(n);
    return n;
  };
  M.node = (mat, id) => mat.nodes.find((n) => n.id === id);
  M.output = (mat) => mat.nodes.find((n) => n.type === 'material');
  M.inLink = (mat, nodeId, inIdx) => mat.links.find((l) => l.to === nodeId && l.in === inIdx);
  // would linking from → to create a cycle? (is `to` upstream of `from`?)
  M.upstream = (mat, id, acc = new Set()) => {
    for (const l of mat.links) if (l.to === id && !acc.has(l.from)) { acc.add(l.from); M.upstream(mat, l.from, acc); }
    return acc;
  };
  M.canLink = (mat, from, to) => from !== to && !M.upstream(mat, from).has(to);
  M.link = (mat, from, out, to, inIdx) => {
    if (!M.canLink(mat, from, to)) return false;
    mat.links = mat.links.filter((l) => !(l.to === to && l.in === inIdx));
    mat.links.push({ from, out, to, in: inIdx });
    return true;
  };
  M.removeNodes = (mat, ids) => {
    const s = new Set(ids);
    mat.nodes = mat.nodes.filter((n) => !s.has(n.id) || n.type === 'material');
    mat.links = mat.links.filter((l) => M.node(mat, l.from) && M.node(mat, l.to));
  };
  // repair a material (old / damaged / hand-edited): unknown node types are kept (drawn as missing), params filled
  M.fix = (mat) => {
    if (!mat || typeof mat !== 'object') return null;
    if (!mat.id) mat.id = U.uid('M');
    if (typeof mat.name !== 'string') mat.name = 'Material';
    mat.size = [256, 512, 1024, 2048, 4096].includes(mat.size) ? mat.size : 1024;
    mat.nodes = (Array.isArray(mat.nodes) ? mat.nodes : []).filter((n) => n && typeof n === 'object' && typeof n.type === 'string');
    const ids = new Set();
    mat.nodes.forEach((n) => {
      if (!n.id || ids.has(n.id)) n.id = U.uid('N');
      ids.add(n.id);
      n.x = +n.x || 0; n.y = +n.y || 0; n.seed = +n.seed || 1;
      if (M.get(n.type)) n.p = Object.assign(M.defaults(n.type), n.p && typeof n.p === 'object' ? n.p : {});
      else if (!n.p) n.p = {};
    });
    if (!M.output(mat)) M.addNode(mat, 'material', 600, 120);
    mat.links = (Array.isArray(mat.links) ? mat.links : []).filter((l) => l && ids.has(l.from) && ids.has(l.to));
    return mat;
  };
  // wrap TL.migrate so every loaded / restored / new document has a valid materials list
  if (TL.migrate && !TL.migrate.__mat) {
    const m0 = TL.migrate;
    TL.migrate = (doc) => {
      const d = m0(doc);
      d.materials = (Array.isArray(d.materials) ? d.materials : []).map(M.fix).filter(Boolean);
      return d;
    };
    TL.migrate.__mat = true;
  }
  M.mats = () => (TL.doc && TL.doc.materials) || [];

  // tidy layout: columns by depth from the sources, rows in order (used by presets and "Arrange")
  M.layout = (mat) => {
    const depth = new Map();
    const d = (id, seen = new Set()) => {
      if (depth.has(id)) return depth.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      let v = 0;
      mat.links.filter((l) => l.to === id).forEach((l) => { v = Math.max(v, d(l.from, seen) + 1); });
      depth.set(id, v);
      return v;
    };
    mat.nodes.forEach((n) => d(n.id));
    const cols = new Map();
    mat.nodes.forEach((n) => { const c = depth.get(n.id); if (!cols.has(c)) cols.set(c, []); cols.get(c).push(n); });
    for (const [c, list] of cols) {
      let y = 0;
      list.forEach((n) => { n.x = c * 240; n.y = y; y += 70 + 26 * (M.get(n.type) ? Math.max(M.get(n.type).inputs.length, M.get(n.type).outputs.filter((o) => !o.hidden).length) + Math.min(3, M.get(n.type).inline.length) : 2); });
    }
  };

  // ================================================================= engine
  const E = (M.engine = { ok: false, float: false, mem: 0, budget: 384 * 1024 * 1024, errors: new Map() });
  let gl = null, cv = null, vao = null;
  const progs = new Map();
  const cache = new Map(); // key nodeId:out:size → {sig, t, last}
  const srcCache = new Map(); // nodeId:size → {sig, t, pending}
  const srcGen = new Map(); // nodeId:size → bumps when an async source arrives (part of the signature → dependents re-run)
  const pool = []; // free temp textures
  let frame = 0;

  const VS = `#version 300 es
out vec2 v_uv;
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); v_uv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;

  E.init = () => {
    if (gl) return E.ok;
    cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, depth: true, preserveDrawingBuffer: true });
    if (!gl) { E.ok = false; return false; }
    E.float = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    vao = gl.createVertexArray();
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); E.ok = false; });
    cv.addEventListener('webglcontextrestored', () => { progs.clear(); cache.clear(); srcCache.clear(); pool.length = 0; E.mem = 0; E.ok = true; TL.emit('matready'); });
    E.ok = true;
    E.gl = gl; E.canvas = cv;
    return true;
  };

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  };
  E.program = (key, fs, vs = VS) => {
    let p = progs.get(key);
    if (p) return p;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    p = { prog, locs: new Map() };
    progs.set(key, p);
    return p;
  };
  const loc = (p, name) => { if (!p.locs.has(name)) p.locs.set(name, gl.getUniformLocation(p.prog, name)); return p.locs.get(name); };
  E.loc = loc;

  // texture: {tex, fbo, size, bytes}
  const newTex = (size, fmt8) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const f = E.float && !fmt8;
    gl.texStorage2D(gl.TEXTURE_2D, 1, f ? gl.RGBA16F : gl.RGBA8, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const bytes = size * size * (f ? 8 : 4);
    E.mem += bytes;
    return { tex, fbo, size, bytes, f8: !!fmt8 };
  };
  const freeTex = (t) => { if (!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); E.mem -= t.bytes; };
  const tmpTex = (size) => { const i = pool.findIndex((t) => t.size === size); return i >= 0 ? pool.splice(i, 1)[0] : newTex(size); };
  const relTex = (t) => { pool.push(t); while (pool.length > 6) freeTex(pool.shift()); };
  E.flush = () => { for (const e of cache.values()) freeTex(e.t); cache.clear(); for (const e of srcCache.values()) freeTex(e.t); srcCache.clear(); while (pool.length) freeTex(pool.pop()); };
  // keep GPU memory under the budget: drop least recently used outputs (they are just recomputed when needed)
  const trim = () => {
    if (E.mem <= E.budget) return;
    const list = Array.from(cache.entries()).filter(([, e]) => e.last < frame).sort((a, b) => a[1].last - b[1].last);
    for (const [k, e] of list) { if (E.mem <= E.budget * 0.8) break; freeTex(e.t); cache.delete(k); }
    while (pool.length && E.mem > E.budget * 0.8) freeTex(pool.pop());
  };

  // ---------------------------------------------------------------- shader generation
  const glslNum = (v) => { const s = String(+v); return /[.e]/.test(s) ? s : s + '.0'; };
  const defExpr = (inp) => {
    const d = inp.def;
    if (typeof d === 'string') return d;
    if (inp.type === 'gray') return glslNum(d == null ? 0 : d);
    const a = Array.isArray(d) ? d : [0, 0, 0, 1];
    return `vec4(${a.map(glslNum).join(',')})`;
  };
  const buildFS = (d, outIdx, passIdx) => {
    const lines = [M.GLSL_HEAD, M.GLSL_LIB];
    d.params.forEach((q) => { if (!M.noUniform(q)) lines.push(`uniform ${q.type === 'color' ? 'vec3' : 'float'} p_${q.k};`); });
    d.inputs.forEach((inp) => {
      lines.push(`uniform sampler2D t_${inp.k}; uniform float has_${inp.k};`);
      if (inp.type === 'gray') lines.push(`float i_${inp.k}(vec2 uv){ return has_${inp.k} > 0.5 ? luma(texture(t_${inp.k}, uv).rgb) : ${defExpr(inp)}; }`);
      else lines.push(`vec4 i_${inp.k}(vec2 uv){ return has_${inp.k} > 0.5 ? texture(t_${inp.k}, uv) : ${defExpr(inp)}; }`);
    });
    if (d.source) lines.push('uniform sampler2D t_src; uniform float has_src; vec4 src(vec2 uv){ return has_src > 0.5 ? texture(t_src, uv) : vec4(0.0); }');
    if (d.passes) lines.push('uniform sampler2D t_prev; vec4 prev(vec2 uv){ return texture(t_prev, uv); }');
    if (d.glsl) lines.push(d.glsl);
    const out = d.outputs[outIdx];
    const pass = d.passes ? d.passes[passIdx] : null;
    const code = pass ? pass.code || '' : (d.code || '') + '\n' + (out.code || '');
    const expr = pass ? pass.expr : out.expr;
    const type = pass && pass.type ? pass.type : out.type;
    lines.push(`void main(){ vec2 uv = v_uv;\n${code}\n${type === 'gray' ? `float v_ = (${expr}); o = vec4(v_, v_, v_, 1.0);` : `o = (${expr});`}\n}`);
    return lines.join('\n');
  };
  E.buildFS = buildFS;

  const hexToRgb = (hx) => {
    let t = String(hx || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(t)) t = t.split('').map((c) => c + c).join('');
    const n = /^[0-9a-f]{6}$/i.test(t) ? parseInt(t, 16) : 0;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  };
  M.hexToRgb = hexToRgb;

  // ---------------------------------------------------------------- signatures (hash of everything upstream)
  const hash = (str) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36); };
  M.hash = hash;
  const sigOf = (mat, n, out, size, memo) => {
    const key = n.id + ':' + out;
    if (memo.has(key)) return memo.get(key);
    const d = M.get(n.type);
    let s = n.type + '|' + out + '|' + size + '|' + JSON.stringify(n.p) + '|' + n.seed + '|' + (n.imageId || '');
    if (d && d.sourceSig) { try { s += '|src:' + d.sourceSig(n, size); } catch (e) { s += '|src:err'; } }
    if (d && d.source) s += '|g' + (srcGen.get(n.id + ':' + size) || 0);
    if (d) d.inputs.forEach((inp, i) => {
      const l = M.inLink(mat, n.id, i);
      const up = l && M.node(mat, l.from);
      s += '|' + (up ? sigOf(mat, up, l.out, size, memo) : '-');
    });
    const h = hash(s);
    memo.set(key, h);
    return h;
  };

  // ---------------------------------------------------------------- external sources (Image / Text / Layer / Pattern…)
  const upCanvas = U.canvas ? U.canvas(1, 1) : document.createElement('canvas');
  const uploadSource = (canvas, size) => {
    const t = newTex(size, true);
    upCanvas.width = size; upCanvas.height = size;
    const x = upCanvas.getContext('2d');
    x.clearRect(0, 0, size, size);
    x.imageSmoothingQuality = 'high';
    x.drawImage(canvas, 0, 0, size, size);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, upCanvas);
    return t;
  };
  const sourceTex = (n, d, size) => {
    let sig;
    try { sig = d.sourceSig ? d.sourceSig(n, size) : JSON.stringify(n.p); } catch (e) { sig = 'err'; }
    const key = n.id + ':' + size;
    const hit = srcCache.get(key);
    if (hit && hit.sig === sig) return hit.t;
    if (hit && hit.pending === sig) return hit.t; // still rendering: keep showing the old one
    let r;
    try { r = d.source(n, size); } catch (e) { console.warn('Material source failed', n.type, e); r = null; }
    if (r && typeof r.then === 'function') {
      const entry = hit || { sig: null, t: null };
      entry.pending = sig;
      srcCache.set(key, entry);
      r.then((c) => {
        const cur = srcCache.get(key);
        if (!cur || cur.pending !== sig || !gl) return;
        if (cur.t) freeTex(cur.t);
        cur.t = c ? uploadSource(c, size) : null;
        cur.sig = sig; cur.pending = null;
        srcGen.set(key, (srcGen.get(key) || 0) + 1);
        TL.emit('matready');
      }).catch((e) => console.warn('Material source failed', e));
      return entry.t;
    }
    if (hit && hit.t) freeTex(hit.t);
    const t = r ? uploadSource(r, size) : null;
    srcCache.set(key, { sig, t, pending: null });
    return t;
  };

  // ---------------------------------------------------------------- run one node output
  const bindAndDraw = (prog, out) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, out.size, out.size);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const setUniforms = (p, d, n, size) => {
    gl.uniform1f(loc(p, 'u_size'), size);
    gl.uniform1f(loc(p, 'u_px'), 1 / size);
    gl.uniform1f(loc(p, 'u_seed'), n.seed || 0);
    d.params.forEach((q) => {
      if (M.noUniform(q)) return;
      const l = loc(p, 'p_' + q.k);
      if (l === null) return;
      const v = n.p[q.k] !== undefined ? n.p[q.k] : q.def;
      if (q.type === 'color') gl.uniform3fv(l, hexToRgb(v));
      else gl.uniform1f(l, typeof v === 'boolean' ? (v ? 1 : 0) : +v || 0);
    });
  };

  // evaluate output `out` of node `n` at `size`; returns a texture {tex, size} or null
  E.eval = (mat, n, out, size, memo = new Map()) => {
    if (!E.init()) return null;
    const d = M.get(n.type);
    if (!d) return null;
    const sig = sigOf(mat, n, out, size, memo);
    const key = n.id + ':' + out + ':' + size;
    const hit = cache.get(key);
    if (hit && hit.sig === sig) { hit.last = frame; return hit.t; }
    // inputs first
    const ins = d.inputs.map((inp, i) => {
      const l = M.inLink(mat, n.id, i);
      const up = l && M.node(mat, l.from);
      return up ? E.eval(mat, up, l.out, size, memo) : null;
    });
    const src = d.source ? sourceTex(n, d, size) : null;
    const target = hit ? hit.t : newTex(size);
    const passes = d.passes ? d.passes.length : 1;
    let prev = null;
    try {
      for (let pi = 0; pi < passes; pi++) {
        const last = pi === passes - 1;
        const dst = last ? target : tmpTex(size);
        const p = E.program(d.id + ':' + out + ':' + pi, buildFS(d, out, pi));
        gl.useProgram(p.prog);
        let unit = 0;
        const bindT = (name, t) => { const l = loc(p, name); if (l === null) return; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t ? t.tex : null); gl.uniform1i(l, unit); unit++; };
        d.inputs.forEach((inp, i) => { bindT('t_' + inp.k, ins[i]); const hl = loc(p, 'has_' + inp.k); if (hl !== null) gl.uniform1f(hl, ins[i] ? 1 : 0); });
        if (d.source) { bindT('t_src', src); const hl = loc(p, 'has_src'); if (hl !== null) gl.uniform1f(hl, src ? 1 : 0); }
        if (d.passes) bindT('t_prev', prev);
        setUniforms(p, d, n, size);
        if (d.setup) d.setup(gl, p, n, size, loc);
        bindAndDraw(p, dst);
        if (prev) relTex(prev);
        prev = last ? null : dst;
      }
      E.errors.delete(n.id);
    } catch (e) {
      if (!E.errors.has(n.id)) console.error('Material node failed:', n.type, e.message);
      E.errors.set(n.id, String(e.message || e));
      if (prev) relTex(prev);
      // error = magenta, so it is obvious in the preview
      const p = E.program('__err', M.GLSL_HEAD + 'void main(){ o = vec4(1.0, 0.0, 1.0, 1.0); }');
      gl.useProgram(p.prog); bindAndDraw(p, target);
    }
    cache.set(key, { sig, t: target, last: frame });
    return target;
  };
  E.tick = () => { frame++; trim(); };
  // free every cached texture of a material (throwaway materials: library thumbnails, previews of presets)
  E.forget = (mat) => {
    if (!gl || !mat) return;
    const ids = new Set(mat.nodes.map((n) => n.id));
    for (const [k, e] of cache) if (ids.has(k.split(':')[0])) { freeTex(e.t); cache.delete(k); }
    for (const [k, e] of srcCache) if (ids.has(k.split(':')[0])) { if (e.t) freeTex(e.t); srcCache.delete(k); }
  };

  // the material's channels (from the Material node; unconnected channels use the node's defaults)
  M.CHANNELS = ['albedo', 'metallic', 'roughness', 'emission', 'normal', 'ao', 'height', 'opacity'];
  M.maps = (mat, size) => {
    const out = M.output(mat);
    if (!out || !E.init()) return null;
    const memo = new Map(), d = M.get('material'), maps = {};
    M.CHANNELS.forEach((ch) => { maps[ch] = E.eval(mat, out, d.outputs.findIndex((o) => o.k === ch), size, memo); });
    return maps;
  };
  M.evalNode = (mat, nodeId, out, size) => { const n = M.node(mat, nodeId); return n ? E.eval(mat, n, out || 0, size) : null; };

  // ================================================================= display / readback
  const VIEW_FS = (M) => `${M.GLSL_HEAD}${M.GLSL_LIB}
uniform sampler2D t_a; uniform sampler2D t_n; uniform sampler2D t_r; uniform sampler2D t_m; uniform sampler2D t_ao; uniform sampler2D t_e;
uniform float u_tiles; uniform float u_mode; uniform float u_flip; uniform vec2 u_pan; uniform float u_zoom; uniform float u_light; uniform vec2 u_dim; uniform float u_bg;
vec3 checker(vec2 p){ vec2 c = floor(p*u_dim/12.0); return vec3(mod(c.x+c.y, 2.0) < 1.0 ? 0.16 : 0.21); }
void main(){
  vec2 s = v_uv; if (u_flip > 0.5) s.y = 1.0 - s.y;
  vec2 uv = (s - 0.5) / u_zoom * u_tiles + 0.5 + u_pan;
  vec4 c = texture(t_a, uv);
  vec3 col;
  if (u_mode < 0.5) col = c.rgb;                          // colour
  else if (u_mode < 1.5) col = vec3(luma(c.rgb));        // gray
  else if (u_mode < 2.5) col = vec3(c.a);                // alpha
  else {                                                 // lit: albedo × normal × light, + specular from roughness/metal
    vec3 nm = texture(t_n, uv).xyz*2.0 - 1.0; nm.y = -nm.y; nm = normalize(nm);
    float a = u_light; vec3 L = normalize(vec3(cos(a), -sin(a), 0.9));
    vec3 V = vec3(0.0, 0.0, 1.0), H = normalize(L + V);
    float rough = clamp(texture(t_r, uv).r, 0.04, 1.0), metal = texture(t_m, uv).r, ao = texture(t_ao, uv).r;
    vec3 alb = c.rgb;
    float ndl = max(dot(nm, L), 0.0);
    float sp = pow(max(dot(nm, H), 0.0), mix(256.0, 4.0, rough)) * mix(1.2, 0.08, rough);
    vec3 f0 = mix(vec3(0.04), alb, metal);
    // fake studio environment: a soft top light + horizon, seen through the normal (makes metals read as metal)
    vec3 R = reflect(-V, nm);
    float env = mix(0.35, 1.0, sstep(-0.2, 0.9, R.y*0.5 + R.x*0.3 + 0.4)) * mix(1.0, 0.55, rough);
    vec3 fres = f0 + (1.0 - f0)*pow(1.0 - max(nm.z, 0.0), 5.0)*(1.0 - rough);
    col = alb*(1.0-metal)*(0.28 + 0.8*ndl)*ao + fres*(env*0.85*ao + sp*2.5) + texture(t_e, uv).rgb;
  }
  if (u_bg > 0.5 && u_mode < 0.5) col = mix(checker(v_uv), col, c.a);
  // tile seams guide: faint lines at tile borders when tiled
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
  const viewProg = () => E.program('__view', VIEW_FS(M));

  // draw a texture (or the lit material) into a 2D canvas. o: {mode:'color'|'gray'|'alpha'|'lit', tiles, zoom, pan:[x,y], light, maps}
  M.draw2D = (target, t, o = {}) => {
    if (!E.init() || !t) return;
    const W = target.width, H = target.height;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const p = viewProg();
    gl.useProgram(p.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const mp = o.maps || {};
    let unit = 0;
    const bindT = (name, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex ? tex.tex : null); gl.uniform1i(loc(p, name), unit); unit++; };
    bindT('t_a', t); bindT('t_n', mp.normal); bindT('t_r', mp.roughness); bindT('t_m', mp.metallic); bindT('t_ao', mp.ao); bindT('t_e', mp.emission);
    const mode = { color: 0, gray: 1, alpha: 2, lit: 3 }[o.mode || 'color'];
    gl.uniform1f(loc(p, 'u_mode'), mode);
    gl.uniform1f(loc(p, 'u_tiles'), o.tiles || 1);
    gl.uniform1f(loc(p, 'u_flip'), 1);
    gl.uniform1f(loc(p, 'u_zoom'), o.zoom || 1);
    gl.uniform2f(loc(p, 'u_pan'), (o.pan && o.pan[0]) || 0, (o.pan && o.pan[1]) || 0);
    gl.uniform1f(loc(p, 'u_light'), o.light != null ? o.light : 0.8);
    gl.uniform2f(loc(p, 'u_dim'), W, H);
    gl.uniform1f(loc(p, 'u_bg'), o.checker ? 1 : 0);
    gl.uniform1f(loc(p, 'u_size'), W); gl.uniform1f(loc(p, 'u_px'), 1 / W); gl.uniform1f(loc(p, 'u_seed'), 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const x = target.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.drawImage(cv, 0, 0);
  };

  // read a texture back as an 8-bit 2D canvas (o.mode 'color' | 'gray' | 'lit' (needs o.maps) | 'alpha')
  M.toCanvas = (t, o = {}) => {
    if (!E.init() || !t) return null;
    const S = o.size || t.size;
    const tmp = newTex(S, true);
    const p = viewProg();
    gl.useProgram(p.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tmp.fbo);
    gl.viewport(0, 0, S, S);
    const mp = o.maps || {};
    let unit = 0;
    const bindT = (name, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex ? tex.tex : null); gl.uniform1i(loc(p, name), unit); unit++; };
    bindT('t_a', t); bindT('t_n', mp.normal); bindT('t_r', mp.roughness); bindT('t_m', mp.metallic); bindT('t_ao', mp.ao); bindT('t_e', mp.emission);
    gl.uniform1f(loc(p, 'u_mode'), { color: 0, gray: 1, alpha: 2, lit: 3 }[o.mode || 'color']);
    gl.uniform1f(loc(p, 'u_tiles'), o.tiles || 1);
    gl.uniform1f(loc(p, 'u_flip'), 0);
    gl.uniform1f(loc(p, 'u_zoom'), 1);
    gl.uniform2f(loc(p, 'u_pan'), 0, 0);
    gl.uniform1f(loc(p, 'u_light'), o.light != null ? o.light : 0.8);
    gl.uniform2f(loc(p, 'u_dim'), S, S);
    gl.uniform1f(loc(p, 'u_bg'), 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(S * S * 4);
    gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px);
    freeTex(tmp);
    const c = U.canvas(S, S);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), S, S), 0, 0);
    return c;
  };

  M.textureBytes = () => E.mem;
})(window.TL);
