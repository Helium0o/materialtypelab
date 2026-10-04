// TypeLab Material — shared GLSL library (prepended to every node shader).
// Everything is periodic on uv ∈ [0,1): noises take an integer period, cells wrap, so every
// generator tiles seamlessly. Hashes are integer (pcg) so results are identical on every GPU.
(function (TL) {
  const M = (TL.mat = TL.mat || {});

  M.GLSL_HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 o;
uniform float u_size;   // texture size in px
uniform float u_px;     // 1.0 / u_size
uniform float u_seed;   // node seed
#define PI 3.14159265359
#define TAU 6.28318530718
`;

  M.GLSL_LIB = `
// ---------------------------------------------------------------- hashing (integer, wrap-safe)
uint pcg(uint v){ uint s = v*747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
uint hu2(ivec2 p, uint s){ return pcg(uint(p.x) + pcg(uint(p.y) + pcg(s))); }
uint seedu(float s){ return uint(int(floor(s))) * 2654435761u + 1013904223u; }
float hf(ivec2 p, float s){ return float(hu2(p, seedu(s))) * (1.0/4294967295.0); }
vec2 hf2(ivec2 p, float s){ uint a = hu2(p, seedu(s)); uint b = pcg(a ^ 0x9e3779b9u); return vec2(float(a), float(b)) * (1.0/4294967295.0); }
vec3 hf3(ivec2 p, float s){ uint a = hu2(p, seedu(s)); uint b = pcg(a ^ 0x9e3779b9u); uint c = pcg(b ^ 0x85ebca6bu); return vec3(float(a), float(b), float(c)) * (1.0/4294967295.0); }
float h1(float x, float s){ return float(pcg(uint(int(floor(x))) + pcg(seedu(s)))) * (1.0/4294967295.0); }
ivec2 wrapc(vec2 c, vec2 per){ return ivec2(mod(c, per)); }

// ---------------------------------------------------------------- periodic noises (p in cells, per = period in cells)
float vnoise(vec2 p, vec2 per, float s){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  float a = hf(wrapc(i, per), s), b = hf(wrapc(i+vec2(1,0), per), s), c = hf(wrapc(i+vec2(0,1), per), s), d = hf(wrapc(i+vec2(1,1), per), s);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec2 grad2(ivec2 c, float s){ float a = hf(c, s) * TAU; return vec2(cos(a), sin(a)); }
float pnoise(vec2 p, vec2 per, float s){ // gradient (Perlin) noise, 0..1
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  float a = dot(grad2(wrapc(i, per), s), f), b = dot(grad2(wrapc(i+vec2(1,0), per), s), f-vec2(1,0));
  float c = dot(grad2(wrapc(i+vec2(0,1), per), s), f-vec2(0,1)), d = dot(grad2(wrapc(i+vec2(1,1), per), s), f-vec2(1,1));
  return clamp(mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.75 + 0.5, 0.0, 1.0);
}
float cnoise(vec2 p, vec2 per, float s){ // cellular F1, 0..1
  vec2 i = floor(p), f = fract(p); float d = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y); vec2 r = g + hf2(wrapc(i+g, per), s) - f; d = min(d, dot(r, r));
  }
  return clamp(sqrt(d), 0.0, 1.0);
}
float noiseT(int t, vec2 p, vec2 per, float s){ return t == 0 ? vnoise(p, per, s) : t == 1 ? pnoise(p, per, s) : cnoise(p, per, s); }
// fbm: type 0 value / 1 perlin / 2 cellular; mode 0 plain / 1 ridged / 2 turbulence (billow)
float fbm(vec2 uv, vec2 scale, int oct, float persist, int type, int mode, float s){
  float sum = 0.0, amp = 1.0, norm = 0.0; vec2 per = max(vec2(1.0), floor(scale + 0.5));
  for (int i = 0; i < 12; i++) {
    if (i >= oct) break;
    float n = noiseT(type, uv*per, per, s + float(i)*17.0);
    if (mode == 1) n = 1.0 - abs(n*2.0-1.0);
    else if (mode == 2) n = abs(n*2.0-1.0);
    sum += n*amp; norm += amp; amp *= persist; per *= 2.0;
  }
  return sum / max(norm, 1e-5);
}
// domain-warped fbm (organic flowing look)
float wfbm(vec2 uv, vec2 scale, int oct, float persist, float warp, float s){
  vec2 q = vec2(fbm(uv, scale, 4, 0.5, 1, 0, s+3.0), fbm(uv, scale, 4, 0.5, 1, 0, s+7.0)) - 0.5;
  return fbm(fract(uv + q*warp/max(scale.x,1.0)), scale, oct, persist, 1, 0, s);
}

// ---------------------------------------------------------------- periodic voronoi
// returns x = F1 distance, y = F2 distance, z = distance to cell border, w = cell random 0..1
// (distances in units of one cell width). stag = row stagger 0..1 (1 + rnd 0 = hexagon-like cells).
// Non-square scales are measured in true (isotropic) distance, so borders keep an even width.
vec2 vpt(ivec2 c, float rnd, float stag, float s){ return 0.5 + vec2(0.5*stag*mod(float(c.y), 2.0), 0.0) + (hf2(c, s) - 0.5)*rnd; }
vec4 voronoi(vec2 uv, vec2 scale, float rnd, float stag, float s){
  vec2 per = max(vec2(1.0), floor(scale + 0.5));
  if (stag > 0.0) per.y = max(2.0, floor(per.y/2.0 + 0.5)*2.0);
  vec2 asp = vec2(1.0, per.x/per.y);
  vec2 p = uv*per, i = floor(p), f = fract(p);
  vec2 mg = vec2(0), mr = vec2(0); float f1 = 64.0, f2 = 64.0; ivec2 mc = ivec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -2; x <= 1; x++) {
    vec2 g = vec2(x, y); ivec2 c = wrapc(i+g, per);
    vec2 r = (g + vpt(c, rnd, stag, s) - f)*asp; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; mr = r; mg = g; mc = c; } else if (d < f2) f2 = d;
  }
  float md = 64.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 g = mg + vec2(x, y); ivec2 c = wrapc(i+g, per);
    vec2 r = (g + vpt(c, rnd, stag, s) - f)*asp;
    if (dot(mr-r, mr-r) > 1e-5) md = min(md, dot(0.5*(mr+r), normalize(r-mr)));
  }
  return vec4(sqrt(f1), sqrt(f2), md, hf(mc, s + 91.0));
}

// ---------------------------------------------------------------- shapes (local p in -1..1)
float sdPoly(vec2 p, float n, float r){ float a = atan(p.x, p.y) + PI; float b = TAU/n; return cos(floor(0.5 + a/b)*b - a)*length(p) - r; }
float sdStar(vec2 p, float n, float r, float inner){
  float a = atan(p.x, p.y) + PI; float b = TAU/n; float t = abs(fract(a/b) - 0.5)*2.0; // 0 at tip ... 1 at valley
  return length(p) - r*mix(1.0, inner, t);
}
float sdBox(vec2 p, vec2 b, float rr){ vec2 d = abs(p) - b + rr; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rr; }

// ---------------------------------------------------------------- colour
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10;
  return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x); }
vec3 hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
float sstep(float a, float b, float x){ float t = clamp((x-a)/max(b-a, 1e-6), 0.0, 1.0); return t*t*(3.0-2.0*t); }
`;
})(window.TL);
