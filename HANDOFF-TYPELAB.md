# Handoff for the TypeLab session: Material workspace + node maps for everything

**From:** the session that built the Material workspace.
**For:** the session that owns TypeLab (Electron, `app/js/…`, ROADMAP at M27).
**Repo:** `helium0o/materialtypelab`, branch `claude/funny-cori-fpvm57`

There are two parts:

1. **Install the Material workspace.** The code is finished and tested. This takes about 5 minutes.
2. **Use the same node-map style for other effects.** This is a design to build next. The user wants to *join* things: TypeLab's effects, filters, dithers, patterns, text and materials, wired together in one map the way Material Maker wires nodes.

---

## Part 1: install the Material workspace (done, tested)

| What | Where |
|---|---|
| Code (9 files) | `typelab-material/app/…`, with the same paths as TypeLab |
| Steps | [`typelab-material/INSTALL.md`](typelab-material/INSTALL.md): copy 9 files, add 9 lines to `app/index.html` (or `patch -p1 < typelab-material/index.html.patch`) |
| How it works | [`typelab-material/README.md`](typelab-material/README.md) |
| All 90 materials and 54 nodes | [`typelab-material/docs/MATERIALS.md`](typelab-material/docs/MATERIALS.md) |
| Tests | `typelab-material/tests/`: every node, every material, and a 13-step UI walk-through. All pass. |

**What you get:**
- A 7th tab, **Material**: library on the left, node graph in the middle, and on the right a 3D or 2D preview plus the node settings.
- Material maps exported as a zip; "Add as a layer" puts the material on the canvas.
- Every edit is one undo step, and materials are saved in `.typelab` files and autosave.

**No existing TypeLab file is edited.** The workspace hooks in by wrapping `UI.setMode`, `UI.refresh`, `UI.buildTopbar` and `TL.migrate`. A capture-phase key guard keeps graph keys away from `tools.js`; otherwise Delete would delete the *layer*.

**Tested:** in headless Chromium, against the tree the user sent (v2.3.0). **Not tested:** the packaged exe. Run `npm start` once and work through the "Check it" list in INSTALL.md.

**One decision for the user:** key 7 now opens Material. It used to fall back to FX & Filters.

### Files and the APIs you will reuse in Part 2

```
mat-core.js       TL.mat.def(nodeDef) · M.get/list · graph model (M.addNode, M.link, M.canLink, M.removeNodes, M.fix, M.layout)
                  engine: M.engine.eval(mat, node, out, size) → texture · M.maps(mat, size) → {albedo, normal, …}
                  M.toCanvas(tex, {mode, size, maps}) → 2D canvas · M.hash(str) · signature cache (only re-runs what changed)
mat-graph.js      the editor (DOM nodes + SVG wires, minimap, Space / right-click add menu, box select, copy/paste)
mode-material.js  the workspace (library, material tabs, preview, node settings via UI.paramControl, export, key guard)
mat-presets.js    builder: g.n(type, params, inputs), h.o('output'), g.out({...}) → M.preset(name, cat, desc, fn)
```

---

## Part 2: node maps for other effects ("join them")

### The idea

Today TypeLab applies effects as a **list**: a layer's `effects[]`, plus the Whole image `finish` stack. Material Maker uses a **map**: any output can feed any input, branches can split and merge, and a mask from one branch can drive another.

The goal is for TypeLab effects, filters, dithers, patterns, text, layers and materials to all be nodes that can be wired together.

**This is cheap, because TypeLab already has one door that runs any effect:**

```js
TL.fx.apply(canvas, [effectObject], { scale, bounds })   // effects.js — runs any of the ~188 effects / filters
TL.make.effect(type)                                       // state.js  — a default effect object {id, type, on, mix, p, …}
TL.dither.apply(canvas, settings, scale)                   // dither.js — any of the 75 dither styles
TL.render.layer(L, scale, false) / TL.render.composite(s)  // render.js — any layer / the whole document as a canvas
TL.render.glBlend(base, top, mode, opacity, scale)         // render.js — the 27 Photoshop blend modes
TL.patterns.tileCanvas(L, px) / tileCanvasAsync(L, px)     // patterns.js + texturelib adapter — 112 generators
```

So **one generic wrapper turns every effect into a node.** You don't need to write a node per effect.

Build it in three steps, smallest first. Each step is useful on its own.

---

### Step A: materials as textures everywhere (smallest, biggest win)

Register each material in `doc.materials` as a **pattern generator** with id `mat-<materialId>`. Every place that already takes a pattern then takes a material for free:
- Pattern layers;
- the Type panel's **Fill with texture**;
- the **texture brush**;
- all **Texture filters**, with their six "Apply as" modes: Fill, Overlay, Colorize, Texturizer relief, Cut out, Displace.

Sketch (untested; follow the shape `texturelib-typelab.js` uses for raster generators):

```js
// app/js/material/mat-as-pattern.js — load after mode-material.js
(function (TL) {
  const PT = TL.patterns, M = TL.mat;
  const isMat = (id) => typeof id === 'string' && id.startsWith('mat-');
  const matOf = (id) => M.mats().find((m) => 'mat-' + m.id === id);
  // keep PT.list in sync with doc.materials (call on 'doc' / 'history' and after material edits)
  M.syncPatterns = () => {
    PT.list = PT.list.filter((g) => !isMat(g.id));
    M.mats().forEach((m) => PT.list.push({
      id: 'mat-' + m.id, name: m.name, cat: 'Materials', raster: true, defTile: 512, defScale: 1,
      params: [{ k: 'channel', label: 'Channel', type: 'select', options: ['Lit', 'Albedo', 'Height', 'Normal', 'Roughness'], def: 'Lit' }],
      colors: [], build() {},
    }));
  };
  const tile0 = PT.tileCanvas;
  PT.tileCanvas = (L, px) => {
    if (!isMat(L.gen)) return tile0(L, px);
    const m = matOf(L.gen); if (!m) return TL.util.canvas(px, px);
    const size = Math.min(2048, 1 << Math.ceil(Math.log2(Math.max(16, px))));
    const maps = M.maps(m, size), ch = (L.p && L.p.channel) || 'Lit';
    const c = ch === 'Lit' ? M.toCanvas(maps.albedo, { mode: 'lit', maps }) : M.toCanvas(maps[ch.toLowerCase()], { mode: ch === 'Albedo' || ch === 'Normal' ? 'color' : 'gray' });
    // scale to px
  };
  // also wrap PT.tileCanvasAsync (resolve the same canvas), PT.items (raster: no vector items), PT.svgBody (embed PNG)
})(window.TL);
```

**Gotchas:**
- **Caching.** Pattern caches key on `JSON.stringify(L.p)` and similar keys. The material can change while `L.p` stays the same, so put a material version into the key. `M.hash(JSON.stringify(material))` works; the simplest place is to wrap the cache key, or add `L.p.__v` when the material changes.
- **Undo.** `PT.list` is not saved in history, so rebuild it after every `doc` and `history` event.
- **Texture filters' "Apply as" modes want height.** Today they derive height from brightness. For materials, feed the real height map (`maps.height`). Find where `filters-texture.js` gets its height and add a `mat-` branch.

**Done when:** in the Type panel, "Fill with texture" lists "Materials → Red bricks", and letters filled with it look like bricks. In FX & Filters, the Textures tab shows the materials, and "Texturizer" gives real brick relief.

---

### Step B: "Effect map", a node-based effect stack

**What the user sees:**
- A new effect, **Effect map**, shows up in the FX & Filters gallery. It can be added to any layer's stack or to the Whole image, like any other effect.
- Its card has an **"Edit map"** button. That opens the graph editor, on the Material tab with a second kind of tab, or as a full-screen overlay.
- Inside the map, the layer's image comes in at the **Input** node and leaves at the **Output** node. Everything in between is a node:
  - any of the 188 effects and filters;
  - dither;
  - the 27 blend modes;
  - masks;
  - patterns, text, other layers;
  - materials.

  Branches can split and merge.

**Examples the user can now build** (a plain list can't do any of these):
- glow only on the parts of the text that a noise mask selects;
- a dither of the shadow only, blended back with Multiply;
- the text's outline coloured from a brick material, plus a halftone of the fill, merged with Screen.

#### Data

Store maps in the **same list** as materials, so the editor, tabs, undo and save work unchanged. Mark them with a `kind` field:

```js
doc.materials = [
  { id, name, kind: 'material', size, nodes, links },            // existing (kind missing = 'material')
  { id, name, kind: 'effect', nodes, links },                    // NEW: an effect map
]
// the effect entry in a layer's stack just points at it:
{ id: 'E…', type: 'effectmap', on: true, p: { map: '<materialId>' } }
```

Update `M.fix` so it keeps the `kind` field. Make the library and tabs show only the right node categories for each kind.

#### Nodes (most are generated automatically)

| Node | How |
|---|---|
| **Input** (the layer's pixels) | the canvas that reaches the effect, held in the evaluation context |
| **Output** | one image input; whatever arrives there is the effect's result |
| **Every TL.fx effect** (~188) | **generated** from `TL.fx.list`: one image input, one image output, params = the effect's own `def.params` (reuse `UI.paramControl` in the inspector) → runs `TL.fx.apply(input, [effectObj], env)` |
| **Dither** | one image in/out, params from `TL.dither.defaults()` (or reuse the Dither panel UI inside the inspector) → `TL.dither.apply` |
| **Blend** | A, B, optional Mask; 27 modes from `TL.render.BLENDS` → `TL.render.glBlend` (or 2D canvas composite for the native ones) |
| **Mask from…** | alpha, luminance, colour range, selection, a layer's mask → gray image |
| **Mix by mask / Opacity** | A, B, Mask |
| **Layer / Document / Text / Pattern** | the same as the material source nodes, but at document size, not tile size |
| **Material** | a material from `doc.materials` drawn across the canvas (tiles across, channel) → reuse `M.toLayer`'s tiling code |
| **Transform / Offset / Mirror** | geometry at document size |

A generated FX node, as a sketch:

```js
TL.fx.list.filter((f) => !f.hidden).forEach((f) => FXG.def({
  id: 'fx:' + f.id, name: f.name, cat: f.family ? f.family + ' · ' + f.cat : f.cat,
  inputs: [{ k: 'in', type: 'image' }], outputs: [{ k: 'out', type: 'image' }],
  params: f.params,                                    // same descriptors → UI.paramControl just works
  run: (ctx, node, [img]) => {
    if (!img) return null;
    const e = TL.make.effect(f.id);
    Object.assign(e.p, node.p);
    return TL.fx.apply(img, [e], { scale: ctx.scale, bounds: ctx.bounds });
  },
}));
```

#### Evaluation (a CPU/canvas engine next to the GPU material engine)

- Values are **document-size canvases** at the current render scale `s`, not tiles.
- **Cache by signature**, the same idea as `mat-core.js` `sigOf`: hash of node type, params, seed, scale, and input signatures, plus the asset versions and layer JSON for source nodes. **Only re-run what changed.** Several TypeLab effects are slow (Embroidery, texture filters), so this matters.
- **Live view vs export:**
  - Respect `TL.fx.liveAsync()` and `TL.fx.provisional`. When a node used a quick approximation, its cached entry must never count as final (see how `render.js` keys `~p`).
  - Call `TL.fx.prepare(scale)` before exports. It walks `TL.doc` for `effects` arrays, so it will **not** find effects inside a map. Add a walk over the map's FX nodes.
- **Memory:** canvases at 1920×1080 are about 8 MB each. Keep an LRU budget, as the material engine does.
- **Plug into the stack:** register one effect, `effectmap`, with `run: (c, p) => …`:
  1. read `c.src` to a canvas with `G.toCanvas`;
  2. evaluate the map, with Input = that canvas;
  3. upload the result with `G.upload`;
  4. return it.

  TL.fx's own loop then handles mix, masks and ordering, so an effect map behaves exactly like one effect.
- **Cycles:** a map must never contain an `effectmap` node that points at itself, directly or through other maps. Reuse `M.canLink`'s upstream walk, and refuse self-references when picking a map.

#### Editor reuse

`mat-graph.js` is generic except for three things. Factor them out:
1. It reads node definitions from `TL.mat.get` / `TL.mat.list`. Pass a **registry** in instead: `createGraphEditor({ registry, typeColors, catColors })`.
2. Port types today are `gray` and `color`. Add `image` (document-size RGBA) and `mask`. Material nodes and effect nodes stay separate types. To cross between them, use the Material node (tile → canvas) or a "Capture as tile" node (canvas → material).
3. `G.drawThumbs` calls `M.evalNode`. Pass an evaluator in instead.

Everything else carries over unchanged: add menu, wires, minimap, copy and paste, undo through `TL.commit`, and the key guard.

**Done when:**
- A text layer with one "Effect map" entry runs this map: Input → Glow (masked by Noise) → Blend Screen with Input → Dither (Atkinson) on the shadow branch only → Output.
- Changing one slider re-runs only the nodes after it.
- Export PNG matches the live view.
- Undo and save work, and Ctrl+K "Add effect: Effect map" works.

---

### Step C: TypeLab effects inside material graphs (optional, after B)

Add a material node, **"TypeLab effect"**, so a material can use any TypeLab filter: Filter Gallery, Craft Lab, Embroidery. Embroidered patches as a material is one example.

- **The catch:** material maps must stay seamless, but TL.fx effects treat the image edge as a hard border.
- **The trick:** render the incoming tile **3×3** into one canvas, apply the effect, then crop the **centre** tile. Anything within one tile's reach wraps correctly. This is the only way a non-periodic filter can stay seamless.
- **Engine:** it runs on the CPU (canvas), so add it as a `source`-style node. Read its input with `M.toCanvas` and return a canvas, which the engine uploads (see how `mat-nodes-typelab.js` does sources). Its sourceSig must include the upstream signature.

---

## Suggested milestones

```
- [ ] M28  Material workspace installed (Part 1) + exe test pass
- [ ] M29  Materials as patterns (Step A): fill with texture / texture brush / texture filters / pattern layers list materials;
           real height in Texturizer & relief modes
- [ ] M30  Effect map (Step B): generic graph editor (registry), image/mask port types, CPU engine with signature cache,
           generated nodes for all TL.fx effects + dither + blend + masks + sources + Material, the "effectmap" effect,
           export prepare walk, tests (every FX node compiles, map == list result for a straight chain)
- [ ] M31  TypeLab effects inside materials (Step C) via the 3×3 seamless wrap
```

**Good regression test for M30:** a straight chain Input → A → B → C → Output must give the **same pixels** as the plain effect list [A, B, C]. If it doesn't, the wrapper is wrong (scale, bounds, premultiplied alpha).

## Things to watch

- **Premultiplied alpha.** TL.gl and TL.fx work premultiplied. The material engine works with **straight** alpha in float textures. Convert only where the two meet: the Material and Capture nodes, and `M.toLayer`.
- **Asset IDs.** Anything a node keeps as a raster must be stored under a key the asset regex knows (`imageId`, `maskId`, `canvasId`, `tileAsset`, `motifId`). Otherwise it is garbage-collected and not saved. The regex is copied in 4 places: `state.js` ×2, `export.js`, `autosave.js`.
- **Keyboard.** Any new full-screen graph view needs the same capture-phase guard as `mode-material.js`. Otherwise Delete removes the selected layer.
- **Two GL contexts.** The material engine has its own context, separate from TL.gl. Move data between them as canvases (`M.toCanvas` / `G.toCanvas` → `G.upload` / texImage2D). Textures cannot be shared.
- **Cost.** Effects run at document size. Keep the draft-while-dragging approach: ¼ scale during pointer drags, full size on release. The material preview already does this.

## Ask the user

1. Where should the map editor open: inside the Material tab (a second tab kind, "Effect map"), or as a full-screen overlay launched from the effect card?
2. Should key 7 stay on Material?
3. Should the existing per-layer effect lists be convertible to maps ("Convert stack to map")? It is easy once M30 exists.
