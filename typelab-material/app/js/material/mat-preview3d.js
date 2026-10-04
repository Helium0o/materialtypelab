// TypeLab Material — 3D preview: sphere / rounded cube / plane / cylinder with the material on it.
// GGX PBR + a procedural studio environment, parallax occlusion mapping from the height map, alpha test from
// opacity. Renders in the material engine's GL context (textures can't be shared across contexts), then copies
// into the preview canvas — no continuous animation loop: it re-renders only when something changes.
(function (TL) {
  const M = TL.mat;
  const E = M.engine;
  const P3 = (M.preview3d = {});
  let meshes = null, prog = null, bgVao = null;

  // ---------------------------------------------------------------- meshes (position, normal, tangent, uv)
  const sphere = (seg = 96, ring = 48) => {
    const v = [], idx = [];
    for (let j = 0; j <= ring; j++) {
      const t = j / ring, th = t * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const s = i / seg, ph = s * Math.PI * 2;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = -Math.sin(th) * Math.sin(ph);
        v.push(x, y, z, x, y, z, -Math.sin(ph), 0, -Math.cos(ph), s * 2, t);
      }
    }
    for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    return { v, idx };
  };
  const box = () => {
    const v = [], idx = [];
    // face: normal n, tangent t (u direction), bitangent b (v direction, "down" in the texture)
    const faces = [[[0, 0, 1], [1, 0, 0], [0, -1, 0]], [[0, 0, -1], [-1, 0, 0], [0, -1, 0]], [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, -1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]]];
    const N = 24;
    faces.forEach(([n, t, b]) => {
      const base = v.length / 11;
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const u = i / N, w = j / N;
        let p = [0, 1, 2].map((k) => n[k] + t[k] * (u * 2 - 1) + b[k] * (w * 2 - 1));
        // round the edges: blend toward a sphere near the corners
        const r = 0.12, q = p.map((c) => Math.max(-(1 - r), Math.min(1 - r, c)));
        const d = p.map((c, k) => c - q[k]); const dl = Math.hypot(...d) || 1;
        p = q.map((c, k) => c + d[k] / dl * r);
        const nn = d.map((c) => c / dl);
        v.push(p[0] * 0.8, p[1] * 0.8, p[2] * 0.8, nn[0], nn[1], nn[2], t[0], t[1], t[2], u, w);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = base + j * (N + 1) + i, c = a + N + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
    });
    return { v, idx };
  };
  const plane = () => {
    const v = [], idx = [], N = 4;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const u = i / N, w = j / N; v.push((u * 2 - 1) * 1.3, 0, (w * 2 - 1) * 1.3, 0, 1, 0, 1, 0, 0, u, w); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, c = a + N + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
    return { v, idx };
  };
  const cylinder = (seg = 96) => {
    const v = [], idx = [];
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= seg; i++) {
      const s = i / seg, ph = s * Math.PI * 2, x = Math.cos(ph), z = -Math.sin(ph);
      v.push(x * 0.8, (0.5 - j) * 2, z * 0.8, x, 0, z, -Math.sin(ph), 0, -Math.cos(ph), s * 2, j);
    }
    for (let i = 0; i < seg; i++) { const a = i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    return { v, idx };
  };

  const VS = `#version 300 es
layout(location=0) in vec3 a_p; layout(location=1) in vec3 a_n; layout(location=2) in vec3 a_t; layout(location=3) in vec2 a_uv;
uniform mat4 u_mvp; uniform mat4 u_model; uniform float u_tile;
out vec3 v_p; out vec3 v_n; out vec3 v_t; out vec2 v_uv2;
void main(){ vec4 w = u_model*vec4(a_p, 1.0); v_p = w.xyz; v_n = mat3(u_model)*a_n; v_t = mat3(u_model)*a_t; v_uv2 = a_uv*u_tile; gl_Position = u_mvp*vec4(a_p, 1.0); }`;
  const FS = `#version 300 es
precision highp float;
in vec3 v_p; in vec3 v_n; in vec3 v_t; in vec2 v_uv2; out vec4 o;
uniform sampler2D t_alb; uniform sampler2D t_nrm; uniform sampler2D t_rgh; uniform sampler2D t_met; uniform sampler2D t_ao; uniform sampler2D t_hgt; uniform sampler2D t_emi; uniform sampler2D t_opa;
uniform vec3 u_cam; uniform float u_light; uniform float u_depth; uniform float u_exposure;
const float PI = 3.14159265;
vec3 sky(vec3 d, float rough){
  float y = d.y; vec3 top = vec3(0.75, 0.82, 0.95), hor = vec3(0.55, 0.52, 0.5), gnd = vec3(0.12, 0.11, 0.1);
  vec3 c = y > 0.0 ? mix(hor, top, pow(y, 0.6)) : mix(hor, gnd, pow(-y, 0.4));
  // two soft-box lights
  float s1 = max(dot(d, normalize(vec3(0.6, 0.7, 0.4))), 0.0), s2 = max(dot(d, normalize(vec3(-0.7, 0.3, -0.5))), 0.0);
  float sh = mix(400.0, 6.0, rough);
  c += vec3(5.0)*pow(s1, sh)*mix(1.0, 0.15, rough) + vec3(2.0, 2.2, 2.6)*pow(s2, sh)*mix(1.0, 0.15, rough);
  return c;
}
float D_GGX(float nh, float a){ float a2 = a*a; float d = nh*nh*(a2 - 1.0) + 1.0; return a2/(PI*d*d); }
float G_S(float nv, float nl, float r){ float k = (r + 1.0)*(r + 1.0)/8.0; return nv/(nv*(1.0-k)+k) * nl/(nl*(1.0-k)+k); }
void main(){
  vec3 V = normalize(u_cam - v_p);
  vec3 N = normalize(v_n); if (dot(N, V) < 0.0) N = -N; // plane seen from below
  vec3 T = normalize(v_t - N*dot(N, v_t)), B = -cross(N, T); // B = +v (down in the texture); all meshes use this handedness
  vec2 uv = v_uv2;
  // parallax occlusion mapping (height 1 = top)
  if (u_depth > 0.0) {
    vec3 vt = vec3(dot(V, T), dot(V, B), dot(V, N));
    float nl = mix(32.0, 8.0, abs(vt.z));
    vec2 P = vt.xy/max(vt.z, 0.15)*u_depth; vec2 duv = P/nl;
    float ld = 1.0/nl, cd = 0.0; vec2 cuv = uv; float hm = 1.0 - texture(t_hgt, cuv).r;
    for (int i = 0; i < 32; i++) { if (cd >= hm) break; cuv -= duv; hm = 1.0 - texture(t_hgt, cuv).r; cd += ld; }
    vec2 puv = cuv + duv; float after = hm - cd, before = (1.0 - texture(t_hgt, puv).r) - cd + ld;
    float w = after/(after - before + 1e-5); uv = mix(cuv, puv, clamp(w, 0.0, 1.0));
  }
  if (texture(t_opa, uv).r < 0.5) discard;
  vec3 alb = pow(texture(t_alb, uv).rgb, vec3(2.2));
  vec3 nt = texture(t_nrm, uv).xyz*2.0 - 1.0;
  vec3 n = normalize(T*nt.x - B*nt.y + N*nt.z);
  float rough = clamp(texture(t_rgh, uv).r, 0.03, 1.0), metal = clamp(texture(t_met, uv).r, 0.0, 1.0), ao = texture(t_ao, uv).r;
  vec3 f0 = mix(vec3(0.04), alb, metal);
  float nv = max(dot(n, V), 1e-4);
  vec3 col = vec3(0.0);
  // key light (orbits with the light slider) + rim
  for (int k = 0; k < 2; k++) {
    vec3 L = k == 0 ? normalize(vec3(cos(u_light)*1.2, 0.9, sin(u_light)*1.2)) : normalize(vec3(-cos(u_light), 0.4, -sin(u_light)));
    vec3 Lc = k == 0 ? vec3(3.2) : vec3(1.1, 1.2, 1.4);
    vec3 H = normalize(L + V); float nl = max(dot(n, L), 0.0), nh = max(dot(n, H), 0.0);
    vec3 F = f0 + (1.0 - f0)*pow(1.0 - max(dot(H, V), 0.0), 5.0);
    vec3 spec = D_GGX(nh, rough*rough)*G_S(nv, nl, rough)*F/max(4.0*nv*nl, 1e-4);
    col += ((1.0 - F)*(1.0 - metal)*alb/PI + spec)*Lc*nl;
  }
  vec3 Fe = f0 + (max(vec3(1.0 - rough), f0) - f0)*pow(1.0 - nv, 5.0);
  col += (alb*(1.0 - metal)*sky(n, 1.0)*0.35 + Fe*sky(reflect(-V, n), rough)*0.8)*ao;
  col += pow(texture(t_emi, uv).rgb, vec3(2.2))*2.0;
  col *= u_exposure;
  col = (col*(2.51*col + 0.03))/(col*(2.43*col + 0.59) + 0.14); // ACES fit
  o = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0/2.2)), 1.0);
}`;
  const BG_FS = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o;
void main(){ float d = length(v_uv - vec2(0.5, 0.45)); o = vec4(mix(vec3(0.16, 0.16, 0.18), vec3(0.06, 0.06, 0.07), clamp(d*1.4, 0.0, 1.0)), 1.0); }`;

  const upload = (gl, m) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(m.idx), gl.STATIC_DRAW);
    const st = 11 * 4;
    [[0, 3, 0], [1, 3, 3], [2, 3, 6], [3, 2, 9]].forEach(([l, n, off]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, st, off * 4); });
    gl.bindVertexArray(null);
    return { vao, n: m.idx.length };
  };

  // ---------------------------------------------------------------- matrices
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const lookAt = (e, c, up) => {
    const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  };
  const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // o: { mesh: 'sphere'|'cube'|'plane'|'cylinder', yaw, pitch, dist, light, tile, depth, exposure, spin }
  P3.draw = (target, maps, o = {}) => {
    if (!E.init() || !maps) return;
    const gl = E.gl, cv = E.canvas;
    if (!meshes) meshes = { sphere: upload(gl, sphere()), cube: upload(gl, box()), plane: upload(gl, plane()), cylinder: upload(gl, cylinder()) };
    if (!prog) prog = E.program('__3d', FS, VS);
    const bg = E.program('__3dbg', BG_FS);
    const W = target.width, H = target.height;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    if (!bgVao) bgVao = gl.createVertexArray();
    gl.useProgram(bg.prog); gl.bindVertexArray(bgVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    const meshName = meshes[o.mesh] ? o.mesh : 'sphere';
    const m = meshes[meshName];
    const pitch = o.pitch != null ? o.pitch : (meshName === 'plane' ? 0.75 : 0.25), yaw = o.yaw || 0, dist = o.dist || 3.6;
    const eye = [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist];
    const model = rotY(o.spin || 0);
    const vp = mul(persp(0.62, W / H, 0.1, 50), lookAt(eye, [0, 0, 0], [0, 1, 0]));
    const p = prog, loc = (n) => E.loc(p, n);
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(loc('u_mvp'), false, new Float32Array(mul(vp, model)));
    gl.uniformMatrix4fv(loc('u_model'), false, new Float32Array(model));
    gl.uniform3fv(loc('u_cam'), eye);
    gl.uniform1f(loc('u_light'), o.light != null ? o.light : 0.8);
    gl.uniform1f(loc('u_depth'), o.depth != null ? o.depth : 0.05);
    gl.uniform1f(loc('u_tile'), o.tile || 1);
    gl.uniform1f(loc('u_exposure'), o.exposure || 1);
    [['t_alb', 'albedo'], ['t_nrm', 'normal'], ['t_rgh', 'roughness'], ['t_met', 'metallic'], ['t_ao', 'ao'], ['t_hgt', 'height'], ['t_emi', 'emission'], ['t_opa', 'opacity']].forEach(([u, k], i) => {
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, maps[k] ? maps[k].tex : null); gl.uniform1i(loc(u), i);
    });
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    const x = target.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.drawImage(cv, 0, 0);
  };
})(window.TL);
