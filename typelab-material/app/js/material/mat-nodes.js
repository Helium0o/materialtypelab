// TypeLab Material — built-in nodes (GPU). Conventions for a node's GLSL:
//   uv           0..1 tile coordinates (periodic; texture wrap is REPEAT)
//   i_<input>(uv) sample an input: float for gray inputs, vec4 for colour inputs (default used when unconnected;
//                 a default may be a GLSL expression using uv or p_* params)
//   has_<input>  1.0 when the input is connected
//   p_<param>    the node's params (float; vec3 for colours; selects are the option index; bools 0/1)
//   u_seed, u_size, u_px (= 1/u_size)
//   outputs[].expr  float for gray outputs, vec4 for colour outputs; `code` runs first (shared by all outputs)
//   passes       multi-pass nodes: each pass may call prev(uv) = the previous pass
// Sizes in pixels (blur radius, bevel width…) are given for a 1024 px tile and scale with the material size,
// so a material looks the same at 512 and 4096.
(function (TL) {
  const M = TL.mat;
  const F = (k, label, min, max, def, step) => ({ k, label, min, max, def, step: step != null ? step : (max - min > 20 ? 1 : 0.01) });
  const I = (k, label, min, max, def) => ({ k, label, min, max, def, step: 1 });
  const SEL = (k, label, options, def = 0) => ({ k, label, type: 'select', options, def });
  const B = (k, label, def) => ({ k, label, type: 'bool', def: !!def });
  const C = (k, label, def) => ({ k, label, type: 'color', def });
  const GI = (k, label, def = 0) => ({ k, label, type: 'gray', def });
  const CI = (k, label, def = [0.5, 0.5, 0.5, 1]) => ({ k, label, type: 'color', def });
  const GO = (k, label, expr, extra) => Object.assign({ k, label, type: 'gray', expr }, extra);
  const CO = (k, label, expr, extra) => Object.assign({ k, label, type: 'color', expr }, extra);
  const PX = 'u_size/1024.0'; // px-at-1024 → px at this size
  const def = M.def;

  // ================================================================ Generators
  def({ id: 'uniform', name: 'Uniform gray', cat: 'Generators', help: 'One flat gray value',
    params: [F('value', 'Value', 0, 1, 0.5)], outputs: [GO('out', 'Out', 'p_value')] });
  def({ id: 'color', name: 'Uniform color', cat: 'Generators', help: 'One flat colour',
    params: [C('color', 'Color', '#8a6a4a')], outputs: [CO('out', 'Out', 'vec4(p_color, 1.0)')] });

  def({ id: 'gradient', name: 'Gradient', cat: 'Generators', help: 'Linear, radial, angular or diamond ramp, repeated',
    params: [SEL('type', 'Type', ['Horizontal', 'Vertical', 'Diagonal', 'Radial', 'Angular', 'Diamond']), I('repeat', 'Repeat', 1, 32, 1), B('mirror', 'Mirror (ping-pong)', false)],
    code: `vec2 g = fract(uv*p_repeat); int ty = int(p_type); float t;
      if (ty == 0) t = g.x; else if (ty == 1) t = g.y; else if (ty == 2) t = fract((uv.x+uv.y)*p_repeat);
      else if (ty == 3) t = clamp(length(g-0.5)*2.0, 0.0, 1.0); else if (ty == 4) t = atan(g.y-0.5, g.x-0.5)/TAU + 0.5;
      else t = clamp(abs(g.x-0.5)+abs(g.y-0.5), 0.0, 1.0);
      if (p_mirror > 0.5) t = 1.0 - abs(t*2.0-1.0);`,
    outputs: [GO('out', 'Out', 't')] });

  def({ id: 'noise', name: 'Noise (FBM)', cat: 'Generators', help: 'Fractal noise: value, Perlin or cellular; plain, ridged or billowy',
    params: [SEL('type', 'Type', ['Value', 'Perlin', 'Cellular'], 1), SEL('mode', 'Mode', ['Plain', 'Ridged', 'Billow']), I('scaleX', 'Scale X', 1, 64, 4), I('scaleY', 'Scale Y', 1, 64, 4), I('octaves', 'Octaves', 1, 10, 5), F('persist', 'Roughness', 0, 1, 0.5)],
    inline: ['scaleX', 'scaleY', 'octaves'],
    outputs: [GO('out', 'Out', 'fbm(uv, vec2(p_scaleX, p_scaleY), int(p_octaves), p_persist, int(p_type), int(p_mode), u_seed)')] });

  def({ id: 'flow', name: 'Flow noise', cat: 'Generators', help: 'Domain-warped noise: marble, smoke, liquid',
    params: [I('scale', 'Scale', 1, 32, 3), I('octaves', 'Octaves', 1, 10, 6), F('persist', 'Roughness', 0, 1, 0.55), F('warp', 'Warp', 0, 8, 2.5)],
    outputs: [GO('out', 'Out', 'wfbm(uv, vec2(p_scale), int(p_octaves), p_persist, p_warp, u_seed)')] });

  def({ id: 'voronoi', name: 'Voronoi', cat: 'Generators', help: 'Cells: distance, borders, random value / colour per cell',
    params: [I('scaleX', 'Scale X', 1, 64, 8), I('scaleY', 'Scale Y', 1, 64, 8), F('rnd', 'Randomness', 0, 1, 1), F('width', 'Border width', 0, 0.5, 0.06), F('stagger', 'Stagger rows', 0, 1, 0)],
    code: 'vec4 v = voronoi(uv, vec2(p_scaleX, p_scaleY), p_rnd, p_stagger, u_seed);',
    outputs: [GO('cells', 'Cells', 'clamp(v.z*2.0, 0.0, 1.0)'), GO('borders', 'Borders', 'sstep(0.0, max(p_width, 0.001), v.z)'), GO('dist', 'Distance', 'clamp(v.x, 0.0, 1.0)'),
      GO('rand', 'Random', 'v.w'), CO('rcolor', 'Random color', 'vec4(hsv2rgb(vec3(v.w, 0.55, 0.9)), 1.0)')] });

  def({ id: 'bricks', name: 'Bricks', cat: 'Generators', help: 'Running / stack bond bricks with mortar, bevel and per-brick random',
    params: [I('rows', 'Rows', 1, 64, 8), I('cols', 'Columns', 1, 32, 4), F('offset', 'Row offset', 0, 1, 0.5), F('jitter', 'Offset jitter', 0, 1, 0), F('mortar', 'Mortar', 0, 0.3, 0.05), F('bevel', 'Bevel', 0, 0.5, 0.1), F('round', 'Corner round', 0, 0.5, 0.05)],
    inline: ['rows', 'cols', 'mortar'],
    glsl: `vec4 brickCell(vec2 uv, float rows, float cols, float off, float jit, float rr, float s){
      float r = floor(uv.y*rows);
      float ro = fract(r*off) + (h1(r, s+5.0)-0.5)*jit;
      float x = uv.x*cols + ro; float c = floor(x);
      vec2 lp = vec2(fract(x), fract(uv.y*rows));
      vec2 sz = vec2(1.0/cols, 1.0/rows); float m = min(sz.x, sz.y);
      vec2 q = (lp-0.5)*sz/m; vec2 b = 0.5*sz/m;
      float d = -sdBox(q, b, min(rr, min(b.x, b.y)));
      return vec4(d, hf(ivec2(int(mod(c, cols)), int(r)), s), lp);
    }`,
    code: 'vec4 b = brickCell(uv, p_rows, p_cols, p_offset, p_jitter, p_round, u_seed);',
    outputs: [GO('bricks', 'Bricks', 'sstep(p_mortar, p_mortar + max(p_bevel, 0.001), b.x)'), GO('rand', 'Random', 'b.y'), GO('mortar', 'Mortar mask', '1.0 - step(p_mortar, b.x)'), CO('uv', 'Brick UV', 'vec4(b.zw, b.y, 1.0)')] });

  def({ id: 'hextiles', name: 'Hex tiles', cat: 'Generators', help: 'Hexagonal tiles with grout, bevel and random per tile',
    params: [I('count', 'Count', 1, 48, 6), F('gap', 'Grout', 0, 0.3, 0.04), F('bevel', 'Bevel', 0, 0.5, 0.12)],
    code: 'float cx = p_count; float cy = max(2.0, floor(cx*1.1547/2.0 + 0.5)*2.0); vec4 v = voronoi(uv, vec2(cx, cy), 0.0, 1.0, u_seed);',
    outputs: [GO('tiles', 'Tiles', 'sstep(p_gap, p_gap + max(p_bevel, 0.001), v.z)'), GO('rand', 'Random', 'v.w')] });

  def({ id: 'herringbone', name: 'Herringbone', cat: 'Generators', help: 'Parquet planks laid in herringbone (plank length : width)',
    params: [I('count', 'Planks across', 2, 48, 8), I('ratio', 'Length : width', 2, 8, 3), F('gap', 'Gap', 0, 0.3, 0.03), F('bevel', 'Bevel', 0, 0.5, 0.08)],
    inline: ['count', 'ratio', 'gap'],
    code: `float n = p_ratio; float per = max(2.0*n, floor(p_count/(2.0*n) + 0.5)*2.0*n);
      vec2 p = uv*per; vec2 c = floor(p); float d = mod(c.x - c.y, 2.0*n);
      vec2 org; float along, across; float horiz;
      if (d < n) { horiz = 1.0; org = vec2(c.x - d, c.y); along = p.x - org.x; across = p.y - org.y; }
      else { horiz = 0.0; float j = 2.0*n - 1.0 - d; org = vec2(c.x, c.y - j); along = p.y - org.y; across = p.x - org.x; }
      float e = min(min(along, n - along), min(across, 1.0 - across));
      float rnd = hf(ivec2(mod(org, per)), u_seed);`,
    outputs: [GO('planks', 'Planks', 'sstep(p_gap, p_gap + max(p_bevel, 0.001), e)'), GO('rand', 'Random', 'rnd'), GO('dir', 'Direction', 'horiz'), CO('uv', 'Plank UV', 'vec4(along/n, across, rnd, 1.0)')] });

  def({ id: 'weave', name: 'Weave', cat: 'Generators', help: 'Plain weave: warp and weft threads going over and under',
    params: [I('count', 'Threads', 2, 128, 16), F('width', 'Thread width', 0.2, 1, 0.8), F('bulge', 'Bulge', 0, 1, 0.6)],
    code: `float cnt = max(2.0, floor(p_count/2.0 + 0.5)*2.0); vec2 g = uv*cnt; vec2 c = floor(g); vec2 f = fract(g);
      float px = sqrt(clamp(1.0 - abs(f.y-0.5)*2.0/p_width, 0.0, 1.0));
      float py = sqrt(clamp(1.0 - abs(f.x-0.5)*2.0/p_width, 0.0, 1.0));
      float wx = 0.5 + 0.5*sin(PI*g.x)*cos(PI*c.y);
      float wy = 0.5 - 0.5*sin(PI*g.y)*cos(PI*c.x);
      float hx = px*mix(1.0, wx, p_bulge), hy = py*mix(1.0, wy, p_bulge);`,
    outputs: [GO('height', 'Height', 'max(hx, hy)'), GO('weft', 'Weft mask', 'hx >= hy ? 1.0 : 0.0'), GO('threads', 'Thread mask', 'max(step(0.001, px), step(0.001, py))')] });

  def({ id: 'stripes', name: 'Stripes / waves', cat: 'Generators', help: 'Straight or wavy stripes (sine, triangle, square, saw), optional noise warp',
    params: [I('count', 'Count', 1, 128, 8), SEL('dir', 'Direction', ['Vertical', 'Horizontal', 'Diagonal /', 'Diagonal \\']), SEL('wave', 'Wave', ['Sine', 'Triangle', 'Square', 'Saw']), F('duty', 'Width (square)', 0.02, 0.98, 0.5), F('warp', 'Warp', 0, 2, 0), I('warpScale', 'Warp scale', 1, 16, 3)],
    code: `int dr = int(p_dir); float t = dr == 0 ? uv.x : dr == 1 ? uv.y : dr == 2 ? uv.x + uv.y : uv.x - uv.y;
      t = t*p_count + (fbm(uv, vec2(p_warpScale), 4, 0.5, 1, 0, u_seed) - 0.5)*p_warp*4.0;
      float f = fract(t); int w = int(p_wave);
      float v = w == 0 ? 0.5 + 0.5*cos(TAU*f) : w == 1 ? 1.0 - abs(f*2.0-1.0) : w == 2 ? step(f, p_duty) : f;`,
    outputs: [GO('out', 'Out', 'v')] });

  def({ id: 'wood', name: 'Wood rings', cat: 'Generators', help: 'Growth rings + fine grain, along the vertical axis',
    params: [I('rings', 'Rings', 1, 64, 10), F('warp', 'Distortion', 0, 2, 0.6), F('sharp', 'Ring sharpness', 0.2, 6, 1.6), I('grainX', 'Grain density', 4, 256, 96), F('grain', 'Grain amount', 0, 1, 0.35)],
    code: `float w = uv.x*p_rings + (fbm(uv, vec2(3.0, 1.0), 5, 0.5, 1, 0, u_seed) - 0.5)*p_warp*4.0 + (fbm(uv, vec2(8.0, 2.0), 3, 0.5, 1, 0, u_seed+3.0)-0.5)*p_warp;
      float ring = pow(1.0 - abs(fract(w)*2.0-1.0), p_sharp);
      float gr = fbm(uv, vec2(p_grainX, 2.0), 3, 0.6, 0, 0, u_seed+11.0);`,
    outputs: [GO('wood', 'Wood', 'mix(ring, ring*0.6 + gr*0.4, p_grain)'), GO('rings', 'Rings', 'ring'), GO('grain', 'Grain', 'gr')] });

  def({ id: 'shape', name: 'Shape', cat: 'Generators', help: 'Circle, square, polygon, star or ring — repeated in a grid',
    params: [SEL('type', 'Shape', ['Circle', 'Square', 'Polygon', 'Star', 'Ring', 'Cross']), I('repeat', 'Repeat', 1, 64, 1), I('sides', 'Sides / points', 3, 16, 6), F('radius', 'Size', 0, 1, 0.7), F('inner', 'Inner (star / ring)', 0, 1, 0.5), F('edge', 'Edge softness', 0, 1, 0.05), F('rotate', 'Rotate', -180, 180, 0, 1), F('stagger', 'Stagger rows', 0, 1, 0)],
    code: `vec2 q = uv*p_repeat; q.x += floor(q.y)*p_stagger*0.5; vec2 p = (fract(q) - 0.5)*2.0; p = rot(p, radians(p_rotate));
      int t = int(p_type); float d;
      if (t == 0) d = length(p) - p_radius;
      else if (t == 1) d = sdBox(p, vec2(p_radius), 0.0);
      else if (t == 2) d = sdPoly(p, p_sides, p_radius);
      else if (t == 3) d = sdStar(p, p_sides, p_radius, p_inner);
      else if (t == 4) d = abs(length(p) - p_radius*(0.5 + 0.5*p_inner)) - p_radius*(1.0 - p_inner)*0.5;
      else d = min(sdBox(p, vec2(p_radius, p_radius*p_inner*0.4), 0.0), sdBox(p, vec2(p_radius*p_inner*0.4, p_radius), 0.0));
      float e = max(p_edge, 0.002);`,
    outputs: [GO('out', 'Out', '1.0 - sstep(-e, 0.0, d)'), GO('dist', 'Distance', 'clamp(-d/max(p_radius, 0.001), 0.0, 1.0)')] });

  def({ id: 'grid', name: 'Grid / checker', cat: 'Generators', help: 'Grid lines and a checkerboard',
    params: [I('countX', 'Columns', 1, 128, 8), I('countY', 'Rows', 1, 128, 8), F('width', 'Line width', 0, 0.5, 0.05), F('soft', 'Softness', 0, 0.5, 0.01)],
    code: 'vec2 g = uv*vec2(p_countX, p_countY); vec2 f = fract(g); vec2 e = min(f, 1.0-f); float d = min(e.x, e.y);',
    outputs: [GO('lines', 'Lines', '1.0 - sstep(p_width*0.5, p_width*0.5 + p_soft + 0.001, d)'), GO('checker', 'Checker', 'mod(floor(g.x) + floor(g.y), 2.0)')] });

  def({ id: 'scratches', name: 'Scratches', cat: 'Generators', help: 'Random straight scratches (metal, plastic, wood wear)',
    params: [I('cells', 'Density', 1, 48, 10), I('layers', 'Layers', 1, 4, 2), F('length', 'Length', 0.1, 1.4, 0.8), F('width', 'Width', 0.002, 0.2, 0.02, 0.001), F('angle', 'Angle', -180, 180, 30, 1), F('spread', 'Angle spread', 0, 1, 0.15), F('fade', 'Random strength', 0, 1, 0.6)],
    glsl: `float segd(vec2 p, vec2 a, vec2 b){ vec2 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0); return length(pa - ba*h); }`,
    code: `float sc = 0.0; vec2 per = vec2(p_cells);
      for (int L = 0; L < 4; L++) { if (L >= int(p_layers)) break;
        vec2 p = uv*per + vec2(float(L)*0.37, float(L)*0.61); vec2 i = floor(p), f = fract(p);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(x, y); vec3 h = hf3(wrapc(i+g, per), u_seed + float(L)*31.0);
          vec2 c = g + h.xy; float a = radians(p_angle) + (h.z-0.5)*p_spread*PI;
          vec2 dvec = vec2(cos(a), sin(a))*p_length*0.5*(0.6 + 0.4*h.x);
          float d = segd(f, c - dvec, c + dvec);
          float s = (1.0 - sstep(0.0, p_width, d))*mix(1.0, h.y, p_fade);
          sc = max(sc, s);
        } }`,
    outputs: [GO('out', 'Out', 'sc')] });

  def({ id: 'scatter', name: 'Scatter', cat: 'Generators', help: 'Scatters a shape (input, or a dot) with random place, size, turn and value — pebbles, rivets, leaves, flakes',
    inputs: [GI('shape', 'Shape', 'clamp((0.5 - length(uv-0.5))*24.0, 0.0, 1.0)')],
    params: [I('cells', 'Density', 1, 64, 8), I('per', 'Copies per cell', 1, 4, 1), F('scale', 'Size', 0.05, 2, 0.8), F('svar', 'Size variation', 0, 1, 0.3), F('rvar', 'Turn variation', 0, 1, 1), F('jitter', 'Position jitter', 0, 1, 1), F('vvar', 'Value variation', 0, 1, 0.5), SEL('mode', 'Combine', ['Max', 'Add', 'Top-most'])],
    inline: ['cells', 'scale', 'svar'],
    code: `vec2 per = vec2(p_cells); vec2 p = uv*per; vec2 i = floor(p), f = fract(p);
      float res = 0.0, rid = 0.0; vec3 rc = vec3(0.0); float top = -1.0;
      for (int k = 0; k < 4; k++) { if (k >= int(p_per)) break;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(x, y); ivec2 cid = wrapc(i+g, per); vec3 h = hf3(cid, u_seed + float(k)*13.0); vec3 h2 = hf3(cid, u_seed + float(k)*13.0 + 7.0);
          vec2 c = g + 0.5 + (h.xy-0.5)*p_jitter;
          float sc = p_scale*(1.0 - p_svar*h.z);
          vec2 l = rot(f - c, -h2.x*p_rvar*TAU)/max(sc, 0.001) + 0.5;
          if (l.x < 0.0 || l.y < 0.0 || l.x > 1.0 || l.y > 1.0) continue;
          float v = i_shape(l)*(1.0 - p_vvar*h2.y);
          if (v <= 0.001) continue;
          int md = int(p_mode);
          if (md == 1) res += v; else if (md == 2) { if (h2.z > top) { top = h2.z; res = v; rid = h2.z; rc = h2; } continue; } else if (v > res) res = v;
          if (v > 0.001 && md != 2) { rid = h2.z; rc = h2; }
        } }`,
    outputs: [GO('out', 'Out', 'clamp(res, 0.0, 1.0)'), GO('id', 'Random', 'rid'), CO('rcolor', 'Random color', 'vec4(hsv2rgb(vec3(rc.z, 0.5, 0.9)), 1.0)')] });

  def({ id: 'cracks', name: 'Cracks', cat: 'Generators', help: 'Branching cracks (dry mud, old paint, ice)',
    params: [I('scale', 'Scale', 1, 32, 6), F('width', 'Width', 0.005, 0.3, 0.04, 0.001), F('warp', 'Wobble', 0, 2, 0.6), F('rnd', 'Randomness', 0, 1, 1)],
    code: `vec2 w = vec2(fbm(uv, vec2(4.0), 4, 0.5, 1, 0, u_seed+2.0), fbm(uv, vec2(4.0), 4, 0.5, 1, 0, u_seed+9.0)) - 0.5;
      vec4 v = voronoi(fract(uv + w*p_warp/p_scale), vec2(p_scale), p_rnd, 0.0, u_seed);
      vec4 v2 = voronoi(fract(uv*1.0 + w*p_warp/p_scale + 0.31), vec2(p_scale*2.0), p_rnd, 0.0, u_seed+5.0);`,
    outputs: [GO('out', 'Cracks', 'max(1.0 - sstep(0.0, p_width, v.z), (1.0 - sstep(0.0, p_width*0.6, v2.z))*0.6)'), GO('cells', 'Plates', 'sstep(0.0, p_width + 0.15, v.z)'), GO('rand', 'Random', 'v.w')] });

  def({ id: 'fibers', name: 'Fibers', cat: 'Generators', help: 'Long thin fibres / hair / brushed streaks along one axis',
    params: [I('count', 'Density', 8, 512, 128), I('length', 'Streak length', 1, 32, 3), F('angle', 'Direction', 0, 1, 0), F('contrast', 'Contrast', 0, 4, 1.5)],
    code: `vec2 q = int(p_angle + 0.5) == 1 ? uv.yx : uv;
      float n = fbm(q, vec2(p_count, p_length), 4, 0.55, 0, 0, u_seed);
      float v = clamp((n - 0.5)*p_contrast + 0.5, 0.0, 1.0);`,
    outputs: [GO('out', 'Out', 'v')] });

  def({ id: 'spots', name: 'Spots / dots', cat: 'Generators', help: 'Random soft spots of different sizes (rust spots, dirt, lichen)',
    params: [I('cells', 'Density', 1, 64, 10), F('size', 'Size', 0.05, 1.5, 0.5), F('svar', 'Size variation', 0, 1, 0.7), F('soft', 'Softness', 0, 1, 0.6), F('chance', 'Coverage', 0, 1, 0.6)],
    code: `vec2 per = vec2(p_cells); vec2 p = uv*per; vec2 i = floor(p), f = fract(p); float r = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(x, y); vec3 h = hf3(wrapc(i+g, per), u_seed);
        if (h.z > p_chance) continue;
        float rad = p_size*0.5*(1.0 - p_svar*fract(h.z*7.31));
        float d = length(g + h.xy - f);
        r = max(r, 1.0 - sstep(rad*(1.0 - p_soft), rad + 0.001, d));
      }`,
    outputs: [GO('out', 'Out', 'r')] });

  // ================================================================ Adjust (one input → one output)
  def({ id: 'invert', name: 'Invert', cat: 'Adjust', inputs: [CI('in', 'In')], outputs: [CO('out', 'Out', 'vec4(1.0 - i_in(uv).rgb, i_in(uv).a)')] });
  def({ id: 'grayscale', name: 'Grayscale', cat: 'Adjust', help: 'Colour → gray (luminance)', inputs: [CI('in', 'In')], outputs: [GO('out', 'Out', 'luma(i_in(uv).rgb)')] });
  def({ id: 'levels', name: 'Levels', cat: 'Adjust', help: 'Input black/white point, gamma, output range',
    inputs: [CI('in', 'In')], params: [F('inLow', 'In black', 0, 1, 0), F('inHigh', 'In white', 0, 1, 1), F('gamma', 'Gamma', 0.1, 5, 1), F('outLow', 'Out black', 0, 1, 0), F('outHigh', 'Out white', 0, 1, 1)],
    code: 'vec4 c = i_in(uv); vec3 t = clamp((c.rgb - p_inLow)/max(p_inHigh - p_inLow, 1e-4), 0.0, 1.0); t = pow(t, vec3(1.0/p_gamma));',
    outputs: [CO('out', 'Out', 'vec4(mix(vec3(p_outLow), vec3(p_outHigh), t), c.a)')] });
  def({ id: 'tonesstep', name: 'Tones step', cat: 'Adjust', help: 'Pushes values to black / white around a threshold (soft threshold)',
    inputs: [GI('in', 'In', 0.5)], params: [F('value', 'Threshold', 0, 1, 0.5), F('width', 'Softness', 0, 1, 0.1), B('invert', 'Invert', false)],
    code: 'float t = clamp((i_in(uv) - p_value)/max(p_width, 1e-4) + 0.5, 0.0, 1.0); if (p_invert > 0.5) t = 1.0 - t;',
    outputs: [GO('out', 'Out', 't')] });
  def({ id: 'curve', name: 'Curve', cat: 'Adjust', help: 'Remap gray values with a smooth 5-point curve (profile)',
    inputs: [GI('in', 'In', 0.5)], params: [F('y0', 'At 0', 0, 1, 0), F('y1', 'At ¼', 0, 1, 0.25), F('y2', 'At ½', 0, 1, 0.5), F('y3', 'At ¾', 0, 1, 0.75), F('y4', 'At 1', 0, 1, 1)],
    inline: ['y1', 'y2', 'y3'],
    glsl: `float cr(float a, float b, float c, float d, float t){ return 0.5*((2.0*b) + (-a + c)*t + (2.0*a - 5.0*b + 4.0*c - d)*t*t + (-a + 3.0*b - 3.0*c + d)*t*t*t); }
      float curve5(float x, float y0, float y1, float y2, float y3, float y4){
        float ys[7]; ys[0] = 2.0*y0 - y1; ys[1] = y0; ys[2] = y1; ys[3] = y2; ys[4] = y3; ys[5] = y4; ys[6] = 2.0*y4 - y3;
        float s = clamp(x, 0.0, 1.0)*4.0; int k = int(min(floor(s), 3.0)); float t = s - float(k);
        return clamp(cr(ys[k], ys[k+1], ys[k+2], ys[k+3], t), 0.0, 1.0); }`,
    outputs: [GO('out', 'Out', 'curve5(i_in(uv), p_y0, p_y1, p_y2, p_y3, p_y4)')] });
  def({ id: 'posterize', name: 'Posterize', cat: 'Adjust', inputs: [CI('in', 'In')], params: [I('steps', 'Steps', 2, 32, 4)],
    outputs: [CO('out', 'Out', 'vec4(floor(i_in(uv).rgb*p_steps)/(p_steps-1.0), i_in(uv).a)')] });
  def({ id: 'hsv', name: 'Hue / saturation / value', cat: 'Adjust', inputs: [CI('in', 'In')], params: [F('hue', 'Hue shift', -0.5, 0.5, 0), F('sat', 'Saturation', 0, 3, 1), F('val', 'Value', 0, 3, 1)],
    code: 'vec4 c = i_in(uv); vec3 h = rgb2hsv(c.rgb); h.x = fract(h.x + p_hue); h.y = clamp(h.y*p_sat, 0.0, 1.0); h.z *= p_val;',
    outputs: [CO('out', 'Out', 'vec4(hsv2rgb(h), c.a)')] });
  def({ id: 'contrast', name: 'Brightness / contrast', cat: 'Adjust', inputs: [CI('in', 'In')], params: [F('bright', 'Brightness', -1, 1, 0), F('contrast', 'Contrast', 0, 4, 1)],
    outputs: [CO('out', 'Out', 'vec4(clamp((i_in(uv).rgb - 0.5)*p_contrast + 0.5 + p_bright, 0.0, 1.0), i_in(uv).a)')] });
  def({ id: 'colorize', name: 'Colorize (gradient map)', cat: 'Adjust', help: 'Gray → colours along a 2–5 stop gradient',
    inputs: [GI('in', 'In', 'uv.x')], params: [I('stops', 'Stops', 2, 5, 3), C('c1', 'Colour 1', '#1b120c'), F('s1', 'Stop 1', 0, 1, 0), C('c2', 'Colour 2', '#7a4a2a'), F('s2', 'Stop 2', 0, 1, 0.5), C('c3', 'Colour 3', '#d9a86b'), F('s3', 'Stop 3', 0, 1, 1), C('c4', 'Colour 4', '#ffffff'), F('s4', 'Stop 4', 0, 1, 1), C('c5', 'Colour 5', '#ffffff'), F('s5', 'Stop 5', 0, 1, 1)],
    inline: ['stops'],
    code: `float x = i_in(uv); vec3 cs[5]; float ss[5]; cs[0]=p_c1; cs[1]=p_c2; cs[2]=p_c3; cs[3]=p_c4; cs[4]=p_c5; ss[0]=p_s1; ss[1]=p_s2; ss[2]=p_s3; ss[3]=p_s4; ss[4]=p_s5;
      int n = int(p_stops); vec3 col = cs[0];
      if (x <= ss[0]) col = cs[0];
      else { col = cs[n-1]; for (int k = 0; k < 4; k++) { if (k >= n-1) break; if (x >= ss[k] && x <= ss[k+1]) { col = mix(cs[k], cs[k+1], clamp((x - ss[k])/max(ss[k+1]-ss[k], 1e-4), 0.0, 1.0)); break; } } }`,
    outputs: [CO('out', 'Out', 'vec4(col, 1.0)')] });
  def({ id: 'channel', name: 'Extract channel', cat: 'Adjust', inputs: [CI('in', 'In')], params: [SEL('ch', 'Channel', ['Red', 'Green', 'Blue', 'Alpha', 'Luminance', 'Hue', 'Saturation', 'Value'], 4)],
    code: 'vec4 c = i_in(uv); int k = int(p_ch); vec3 h = rgb2hsv(c.rgb);',
    outputs: [GO('out', 'Out', 'k == 0 ? c.r : k == 1 ? c.g : k == 2 ? c.b : k == 3 ? c.a : k == 4 ? luma(c.rgb) : k == 5 ? h.x : k == 6 ? h.y : h.z')] });

  // ================================================================ Combine
  def({ id: 'blend', name: 'Blend', cat: 'Combine', help: 'Layer B over A with a blend mode, opacity and an optional mask',
    inputs: [CI('a', 'A (bottom)', [0, 0, 0, 1]), CI('b', 'B (top)', [1, 1, 1, 1]), GI('mask', 'Mask', 1)],
    params: [SEL('mode', 'Mode', ['Normal', 'Multiply', 'Screen', 'Overlay', 'Soft light', 'Hard light', 'Add', 'Subtract', 'Difference', 'Darken', 'Lighten', 'Color dodge', 'Color burn']), F('opacity', 'Opacity', 0, 1, 1)],
    inline: ['mode', 'opacity'],
    glsl: `vec3 bl(int m, vec3 a, vec3 b){
      if (m == 1) return a*b; if (m == 2) return 1.0 - (1.0-a)*(1.0-b);
      if (m == 3) return mix(2.0*a*b, 1.0 - 2.0*(1.0-a)*(1.0-b), step(0.5, a));
      if (m == 4) return mix(2.0*a*b + a*a*(1.0-2.0*b), sqrt(a)*(2.0*b-1.0) + 2.0*a*(1.0-b), step(0.5, b));
      if (m == 5) return mix(2.0*a*b, 1.0 - 2.0*(1.0-a)*(1.0-b), step(0.5, b));
      if (m == 6) return min(a + b, 1.0); if (m == 7) return max(a - b, 0.0); if (m == 8) return abs(a - b);
      if (m == 9) return min(a, b); if (m == 10) return max(a, b);
      if (m == 11) return min(a/max(1.0 - b, 1e-4), 1.0); if (m == 12) return 1.0 - min((1.0 - a)/max(b, 1e-4), 1.0);
      return b; }`,
    code: 'vec4 A = i_a(uv), Bc = i_b(uv); float k = clamp(p_opacity*i_mask(uv)*Bc.a, 0.0, 1.0);',
    outputs: [CO('out', 'Out', 'vec4(mix(A.rgb, bl(int(p_mode), A.rgb, Bc.rgb), k), max(A.a, k))')] });
  def({ id: 'math', name: 'Math', cat: 'Combine', help: 'Gray maths: A op B (unconnected inputs use the A / B values)',
    inputs: [GI('a', 'A', 'p_a'), GI('b', 'B', 'p_b')],
    params: [SEL('op', 'Operation', ['Add', 'Subtract', 'Multiply', 'Divide', 'Min', 'Max', 'Power', 'Difference', 'Average', 'Screen', 'Height blend (max)', 'A − B·inverse']), F('a', 'A value', 0, 1, 0.5), F('b', 'B value', 0, 1, 0.5), B('clamp', 'Clamp 0–1', true)],
    inline: ['op', 'b'],
    code: `float A = i_a(uv), Bv = i_b(uv); int o_ = int(p_op); float r;
      if (o_ == 0) r = A + Bv; else if (o_ == 1) r = A - Bv; else if (o_ == 2) r = A*Bv; else if (o_ == 3) r = A/max(Bv, 1e-4);
      else if (o_ == 4) r = min(A, Bv); else if (o_ == 5) r = max(A, Bv); else if (o_ == 6) r = pow(max(A, 0.0), Bv*4.0);
      else if (o_ == 7) r = abs(A - Bv); else if (o_ == 8) r = (A + Bv)*0.5; else if (o_ == 9) r = 1.0 - (1.0-A)*(1.0-Bv);
      else if (o_ == 10) r = max(A, Bv + 0.0) ; else r = A*(1.0 - Bv);
      if (p_clamp > 0.5) r = clamp(r, 0.0, 1.0);`,
    outputs: [GO('out', 'Out', 'r')] });
  def({ id: 'mix', name: 'Mix by mask', cat: 'Combine', help: 'A where the mask is black, B where it is white',
    inputs: [CI('a', 'A', [0, 0, 0, 1]), CI('b', 'B', [1, 1, 1, 1]), GI('mask', 'Mask', 0.5)], params: [F('contrast', 'Mask contrast', 0, 8, 1)],
    outputs: [CO('out', 'Out', 'mix(i_a(uv), i_b(uv), clamp((i_mask(uv) - 0.5)*p_contrast + 0.5, 0.0, 1.0))')] });
  def({ id: 'combine', name: 'Combine RGBA', cat: 'Combine', help: 'Four gray inputs → one colour (pack maps)',
    inputs: [GI('r', 'Red', 0), GI('g', 'Green', 0), GI('b', 'Blue', 0), GI('a', 'Alpha', 1)],
    outputs: [CO('out', 'Out', 'vec4(i_r(uv), i_g(uv), i_b(uv), i_a(uv))')] });

  // ================================================================ Filters (look at neighbours)
  const blurPass = (axis, src) => `float r = max(p_radius*${PX}, 0.001); float sg = max(r/2.5, 0.5); float st = max(1.0, r/32.0);
      int n = int(ceil(r/st)); vec4 acc = vec4(0.0); float ws = 0.0;
      for (int k = -64; k <= 64; k++) { if (k < -n || k > n) continue; float x = float(k)*st; float w = exp(-x*x/(2.0*sg*sg));
        acc += ${src}(uv + ${axis}*x*u_px)*w; ws += w; }`;
  def({ id: 'blur', name: 'Blur', cat: 'Filters', help: 'Gaussian blur (seamless)', inputs: [CI('in', 'In')], params: [F('radius', 'Radius', 0, 128, 8, 0.5)],
    passes: [{ code: blurPass('vec2(1.0, 0.0)', 'i_in'), expr: 'acc/ws', type: 'color' }, { code: blurPass('vec2(0.0, 1.0)', 'prev'), expr: 'acc/ws', type: 'color' }],
    outputs: [CO('out', 'Out', 'vec4(0.0)')] });
  def({ id: 'dirblur', name: 'Directional blur', cat: 'Filters', help: 'Motion / brushed blur along an angle', inputs: [CI('in', 'In')], params: [F('radius', 'Length', 0, 256, 20, 0.5), F('angle', 'Angle', -180, 180, 0, 1)],
    code: `vec2 d = vec2(cos(radians(p_angle)), sin(radians(p_angle)))*p_radius*${PX}*u_px; vec4 acc = vec4(0.0);
      for (int k = 0; k < 32; k++) { float t = float(k)/31.0 - 0.5; acc += i_in(uv + d*t); }`,
    outputs: [CO('out', 'Out', 'acc/32.0')] });
  def({ id: 'slopeblur', name: 'Slope blur', cat: 'Filters', help: 'Smears the input downhill along a height map (erosion, drips, melted edges)',
    inputs: [CI('in', 'In'), GI('slope', 'Slope (height)', 0.5)], params: [F('radius', 'Distance', 0, 128, 24, 0.5), F('mode', 'Downhill / uphill', -1, 1, 1)],
    code: `vec2 p = uv; vec4 acc = i_in(p); float ws = 1.0; float stp = p_radius*${PX}*u_px/16.0;
      for (int k = 1; k <= 16; k++) { float e = u_px*2.0;
        vec2 g = vec2(i_slope(p + vec2(e, 0.0)) - i_slope(p - vec2(e, 0.0)), i_slope(p + vec2(0.0, e)) - i_slope(p - vec2(0.0, e)));
        float gl = length(g); if (gl < 1e-6) break; p -= g/gl*stp*p_mode; float w = 1.0 - float(k)/17.0; acc += i_in(p)*w; ws += w; }`,
    outputs: [CO('out', 'Out', 'acc/ws')] });
  def({ id: 'warp', name: 'Warp', cat: 'Filters', help: 'Pushes the input along the slope (or by the value) of a second map',
    inputs: [CI('in', 'In'), GI('by', 'Warp map', 0.5)], params: [SEL('mode', 'Mode', ['Slope', 'Value → X/Y']), F('amount', 'Amount', 0, 1, 0.1), F('angle', 'Angle (value mode)', -180, 180, 45, 1)],
    code: `vec2 off; if (int(p_mode) == 0) { float e = u_px*2.0; off = vec2(i_by(uv + vec2(e, 0.0)) - i_by(uv - vec2(e, 0.0)), i_by(uv + vec2(0.0, e)) - i_by(uv - vec2(0.0, e)))/(2.0*e)*0.02; }
      else off = vec2(cos(radians(p_angle)), sin(radians(p_angle)))*(i_by(uv) - 0.5);`,
    outputs: [CO('out', 'Out', 'i_in(uv + off*p_amount)')] });
  def({ id: 'edge', name: 'Edge detect', cat: 'Filters', inputs: [GI('in', 'In', 0.5)], params: [F('width', 'Width', 0.5, 16, 1.5, 0.1), F('gain', 'Strength', 0, 8, 2)],
    code: `float e = p_width*${PX}*u_px; float gx = i_in(uv + vec2(e, 0.0)) - i_in(uv - vec2(e, 0.0)); float gy = i_in(uv + vec2(0.0, e)) - i_in(uv - vec2(0.0, e));`,
    outputs: [GO('out', 'Out', 'clamp(length(vec2(gx, gy))*p_gain, 0.0, 1.0)')] });
  def({ id: 'dilate', name: 'Grow / shrink', cat: 'Filters', help: 'Max (grow) or min (shrink) over a radius',
    inputs: [GI('in', 'In', 0.5)], params: [F('radius', 'Radius', 0, 64, 4, 0.5), SEL('mode', 'Mode', ['Grow', 'Shrink'])],
    code: `float r = p_radius*${PX}*u_px; float v = i_in(uv); bool grow = int(p_mode) == 0;
      for (int ring = 1; ring <= 3; ring++) for (int k = 0; k < 12; k++) { float a = float(k)*TAU/12.0 + float(ring)*0.4; float s = i_in(uv + vec2(cos(a), sin(a))*r*float(ring)/3.0); v = grow ? max(v, s) : min(v, s); }`,
    outputs: [GO('out', 'Out', 'v')] });
  def({ id: 'bevel', name: 'Bevel', cat: 'Height & normal', help: 'Turns a mask into a height map with sloped edges (distance to the edge)',
    inputs: [GI('in', 'Mask', 1)], params: [F('width', 'Width', 1, 128, 16, 0.5), SEL('profile', 'Profile', ['Linear', 'Smooth', 'Round', 'Inner glow'], 1)],
    code: `float w = p_width*${PX}*u_px; float d = 1.0;
      if (i_in(uv) < 0.5) d = 0.0;
      else { for (int s = 1; s <= 16; s++) { float r = w*float(s)/16.0; bool hit = false;
          for (int k = 0; k < 12; k++) { float a = float(k)*TAU/12.0 + float(s)*0.7; if (i_in(uv + vec2(cos(a), sin(a))*r) < 0.5) { hit = true; break; } }
          if (hit) { d = float(s - 1)/16.0 + 0.5/16.0; break; } } }
      int pr = int(p_profile); float h = pr == 0 ? d : pr == 1 ? d*d*(3.0-2.0*d) : pr == 2 ? sqrt(max(0.0, 1.0 - (1.0-d)*(1.0-d))) : 1.0 - d;
      if (pr == 3 && i_in(uv) < 0.5) h = 0.0;`,
    outputs: [GO('out', 'Out', 'h')] });
  def({ id: 'makeTileable', name: 'Make tileable', cat: 'Transform', help: 'Hides the seam of a non-seamless image by blending a shifted copy',
    inputs: [CI('in', 'In')], params: [F('width', 'Blend width', 0.02, 0.5, 0.2)],
    code: 'vec2 e = min(uv, 1.0 - uv); float k = sstep(0.0, p_width, min(e.x, e.y));',
    outputs: [CO('out', 'Out', 'mix(i_in(fract(uv + 0.5)), i_in(uv), k)')] });

  // ================================================================ Transform
  def({ id: 'transform', name: 'Transform', cat: 'Transform', help: 'Move, repeat (whole numbers stay seamless), turn (multiples of 90° stay seamless)',
    inputs: [CI('in', 'In')], params: [F('tx', 'Move X', -1, 1, 0), F('ty', 'Move Y', -1, 1, 0), I('rx', 'Repeat X', 1, 32, 1), I('ry', 'Repeat Y', 1, 32, 1), F('rotate', 'Rotate', -180, 180, 0, 1)],
    code: 'vec2 q = uv - 0.5; q = rot(q, -radians(p_rotate)); q = q*vec2(p_rx, p_ry) + 0.5 - vec2(p_tx, p_ty);',
    outputs: [CO('out', 'Out', 'i_in(q)')] });
  def({ id: 'mirror', name: 'Mirror', cat: 'Transform', inputs: [CI('in', 'In')], params: [SEL('mode', 'Mirror', ['Left ↔ right', 'Top ↕ bottom', 'Both (kaleidoscope 4)'])],
    code: 'vec2 q = uv; int m = int(p_mode); if (m != 1) q.x = 1.0 - abs(q.x*2.0 - 1.0); if (m != 0) q.y = 1.0 - abs(q.y*2.0 - 1.0); q *= 0.5;',
    outputs: [CO('out', 'Out', 'i_in(q)')] });
  def({ id: 'kaleido', name: 'Kaleidoscope', cat: 'Transform', inputs: [CI('in', 'In')], params: [I('count', 'Segments', 2, 24, 6), F('zoom', 'Zoom', 0.2, 4, 1)],
    code: 'vec2 p = uv - 0.5; float a = atan(p.y, p.x); float seg = TAU/p_count; a = abs(mod(a, seg) - seg*0.5); vec2 q = vec2(cos(a), sin(a))*length(p)/p_zoom + 0.5;',
    outputs: [CO('out', 'Out', 'i_in(q)')] });

  // ================================================================ Height & normal
  def({ id: 'normal', name: 'Normal map', cat: 'Height & normal', help: 'Height → normal map (OpenGL / DirectX green)',
    inputs: [GI('in', 'Height', 0.5)], params: [F('strength', 'Strength', 0, 8, 1), SEL('format', 'Format', ['OpenGL (Y+)', 'DirectX (Y−)'])],
    code: `float e = u_px; float l = i_in(uv - vec2(e, 0.0)), r = i_in(uv + vec2(e, 0.0)), t = i_in(uv - vec2(0.0, e)), b = i_in(uv + vec2(0.0, e));
      float k = p_strength*0.02/(2.0*e); vec3 n = normalize(vec3(-(r - l)*k, (b - t)*k, 1.0)); if (int(p_format) == 1) n.y = -n.y;`,
    outputs: [CO('out', 'Out', 'vec4(n*0.5 + 0.5, 1.0)')] });
  def({ id: 'emboss', name: 'Emboss / light', cat: 'Height & normal', help: 'Lights a height map from one side (gray shading)',
    inputs: [GI('in', 'Height', 0.5)], params: [F('angle', 'Light angle', -180, 180, 135, 1), F('strength', 'Strength', 0, 8, 1.5)],
    code: `float e = u_px; float k = p_strength*0.02/(2.0*e); vec3 n = normalize(vec3(-(i_in(uv + vec2(e, 0.0)) - i_in(uv - vec2(e, 0.0)))*k, (i_in(uv + vec2(0.0, e)) - i_in(uv - vec2(0.0, e)))*k, 1.0));
      vec3 L = normalize(vec3(cos(radians(p_angle)), sin(radians(p_angle)), 0.8));`,
    outputs: [GO('out', 'Out', 'clamp(dot(n, L), 0.0, 1.0)')] });
  def({ id: 'occlusion', name: 'Ambient occlusion', cat: 'Height & normal', help: 'Darkens creases and low areas of a height map',
    inputs: [GI('in', 'Height', 0.5)], params: [F('radius', 'Radius', 1, 128, 24, 0.5), F('strength', 'Strength', 0, 4, 1.2)],
    code: `float h = i_in(uv); float occ = 0.0; float r = p_radius*${PX}*u_px;
      for (int ring = 1; ring <= 4; ring++) for (int k = 0; k < 10; k++) { float a = float(k)*TAU/10.0 + float(ring)*1.3; float rr = r*float(ring)/4.0;
        float s = i_in(uv + vec2(cos(a), sin(a))*rr); occ += max(0.0, s - h)/(float(ring)*0.5 + 0.5); }
      occ = occ/40.0*p_strength*6.0;`,
    outputs: [GO('out', 'Out', 'clamp(1.0 - occ, 0.0, 1.0)')] });
  def({ id: 'curvature', name: 'Curvature', cat: 'Height & normal', help: 'Edges and ridges of a height map (bright = convex) — great for edge wear masks',
    inputs: [GI('in', 'Height', 0.5)], params: [F('radius', 'Radius', 0.5, 32, 2, 0.1), F('strength', 'Strength', 0, 32, 6)],
    code: `float e = p_radius*${PX}*u_px; float c = i_in(uv)*4.0 - i_in(uv + vec2(e, 0.0)) - i_in(uv - vec2(e, 0.0)) - i_in(uv + vec2(0.0, e)) - i_in(uv - vec2(0.0, e));`,
    outputs: [GO('out', 'Out', 'clamp(0.5 + c*p_strength, 0.0, 1.0)')] });

  // ================================================================ Output
  def({ id: 'material', name: 'Material', cat: 'Output', isOutput: true, help: 'The final material. Unconnected channels use the values below; with no normal input the normal map is made from the height.',
    inputs: [CI('albedo', 'Albedo', 'vec4(p_albedo, 1.0)'), GI('metallic', 'Metallic', 'p_metallic'), GI('roughness', 'Roughness', 'p_roughness'), CI('emission', 'Emission', [0, 0, 0, 1]),
      CI('normal', 'Normal', [0.5, 0.5, 1, 1]), GI('ao', 'Ambient occlusion', 1), GI('height', 'Height', 0.5), GI('opacity', 'Opacity', 1)],
    params: [C('albedo', 'Albedo', '#bbbbbb'), F('metallic', 'Metallic', 0, 1, 0), F('roughness', 'Roughness', 0, 1, 0.6), F('emissive', 'Emission strength', 0, 8, 1), F('normalStrength', 'Normal from height', 0, 8, 1), F('aoStrength', 'AO strength', 0, 1, 1), F('depth', 'Height depth (3D)', 0, 0.2, 0.05, 0.001)],
    inline: [],
    glsl: `vec3 nFromH(vec2 uv){ float e = u_px; float k = p_normalStrength*0.02/(2.0*e);
      return normalize(vec3(-(i_height(uv + vec2(e, 0.0)) - i_height(uv - vec2(e, 0.0)))*k, (i_height(uv + vec2(0.0, e)) - i_height(uv - vec2(0.0, e)))*k, 1.0)); }`,
    outputs: [CO('albedo', 'Albedo', 'vec4(i_albedo(uv).rgb, 1.0)', { hidden: true }), GO('metallic', 'Metallic', 'i_metallic(uv)', { hidden: true }), GO('roughness', 'Roughness', 'i_roughness(uv)', { hidden: true }),
      CO('emission', 'Emission', 'vec4(i_emission(uv).rgb*p_emissive, 1.0)', { hidden: true }),
      CO('normal', 'Normal', 'has_normal > 0.5 ? vec4(i_normal(uv).rgb, 1.0) : vec4(nFromH(uv)*0.5 + 0.5, 1.0)', { hidden: true }),
      GO('ao', 'AO', 'mix(1.0, i_ao(uv), p_aoStrength)', { hidden: true }), GO('height', 'Height', 'i_height(uv)', { hidden: true }), GO('opacity', 'Opacity', 'i_opacity(uv)', { hidden: true })] });
})(window.TL);
