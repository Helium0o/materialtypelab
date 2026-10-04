# Handover: add a "Material" workspace to TypeLab

**For:** the session working on TypeLab (Electron app, `app/js/...`, ROADMAP at M27).
**From:** a planning session that read about half of the TypeLab source (the files listed in §9). It did not run the app.
**Ask:** add a new top-bar tab, **Material**, that works like [Material Maker](https://github.com/RodZill4/material-maker):
a node graph in the middle, a node library on the left, and a 2D/3D preview plus node settings on the right.
Other node-based material tools (Substance Designer, Blender shader nodes, Material Maker) are fine as inspiration too.

Reference screenshots (same folder as this file):
- `material-maker-reference.png`: the layout the user wants. It is Material Maker 1.6 with a bricks graph.
- `typelab-current-ui.png`: TypeLab as it looks today, with the Simple interface and the Type tab.

---

## 1. Summary

| | |
|---|---|
| What | A 7th workspace, `material`, with a node-graph editor that generates seamless PBR materials (albedo, normal, roughness, metallic, AO, height). |
| Looks like | Material Maker's layout, drawn in TypeLab's style: TypeLab colour tokens, kit controls and dock panels. Don't copy Godot's grey theme. |
| Engine | Run it on the existing `TL.gl` WebGL2 context. Each node is a GLSL snippet. Use float textures and REPEAT wrapping (see §6). |
| Unique selling point | Nodes that pull in TypeLab content: a text layer, the whole document, any of the 112 pattern generators. Results go back into TypeLab as a layer, a texture fill, or exported PBR maps. |
| Stored in | `TL.doc.materials[]`. Undo, autosave and `.typelab` files then work through the existing `TL.commit`. |
| Size | About 5 milestones (M28a–e in §8). Do them in order, and commit after each one. |

---

## 2. What the Material Maker screenshot shows

```
┌ Library ─────────┐┌ graph tab "bricks part 3.ptex" ─────────────────────┐┌ Preview2D ──────┐
│ category icons   ││ toolbar: zoom ▾ · view ▾ · align ▾ · 2D · 3D        ││ toolbar         │
│ [Filter.......]  ││                                                     ││                 │
│ ▾ Simple         ││  [Triangle Voronoi]──►[Weave]──►[Simple Edge Det.]  ││   live image of │
│   ▾ Uniform  ▇▇  ││        │                   └──►[Profile]──►...      ││   the selected  │
│   ▾ Shape    ⬢   ││  [Voronoi]──►[Profile]──►[Tones Step]──►[HBAO]      ││   node's output │
│     Square  ■    ││              ...many small nodes, bezier wires...  ││                 │
│     Star ...     ││                                       ┌─minimap─┐   ││                 │
│ ▸ SDF            ││                                       └─────────┘   ││                 │
│ [Browse Community Nodes]                                               ││                 │
└──────────────────┘└─────────────────────────────────────────────────────┘└─────────────────┘
status bar: "Space/🖱: Nodes menu, Arrow keys: Pan, Mouse wheel: Zoom" · FPS · memory
```

Details worth copying:
- **Nodes are compact.** Each has a coloured title bar (colour = category), one row per parameter (label plus a small slider or dropdown), input ports on the left, output ports on the right. Port dots are coloured by data type.
- **Wires are smooth bezier curves.** They are coloured by data type, and the selected wire is highlighted.
- **Library:** a tree with category headers, an icon thumbnail per node, a filter box at the top, and category quick-buttons in a row.
- **Preview 2D:** the selected node's output, shown live. The 3D preview is a toggle (sphere or cube with the material).
- **Minimap** in the bottom-right corner of the graph.
- **Space** or **right-click** on empty graph space opens a searchable "add node" menu at the cursor.
- **Status bar hint:** TypeLab already has `#hint`, so use that.

---

## 3. How TypeLab works (what you need for this task)

You know this codebase already. This section lists the parts the Material tab touches, with exact locations.

**Workspaces** (`ui/shell.js`)
- `UI.registerMode({ id, label, icon, tools: [...], build(box) })`. `build` fills the right-hand Settings panel (`#inspector`).
- `UI.modeOrder = ['type','pattern','dither','fx','paint','export']`. Number keys come from the order. Look at the `/^[1-7]$/` handler at the end of `UI.init`: today key 7 falls back to `fx`.
- `MODE_HINT` holds the tab tooltips. `UI.setMode(id)` rebuilds the top bar, rail and inspector. **It has no enter/leave hooks yet**, so you need to add them (see §5.1).
- Icons are the `I` map in `ui/kit.js` (20×20 stroke SVG paths). Mode icons are named `mType`, `mPattern`, and so on. Add `mMaterial`.

**Docks** (`ui/dock.js`)
- `IDS = ['layers','history','settings']` with a fixed `DEF` layout saved in `localStorage.dockLayout`. Panels are `<section class="panel" data-panel=...>` with a `.phead`/`.lhead` drag header.
- Panels added in a newer version join the dock that holds Layers (see `load()`), so adding IDs is migration-safe.

**UI kit** (`ui/kit.js`)
- Use these controls: `UI.slider`, `select`, `color`, `toggle`, `seg`, `btn`, `section`, `card`, `picker`/`pickerRow` (searchable, favourites, thumbnails), `menu`, `popup`, `note`, `dial`.
- `UI.paramControl(q, p, label)` (in `ui/mode-type.js`) builds a control from a param descriptor `{k, label, min, max, step, def, type:'select'|'bool'|'color'|..., seed}`. **Use this same descriptor format for node parameters**, so node settings render for free.
- Sliders call `onInput` live and `onChange` once at the end. Commit only in `onChange`.

**State and history** (`state.js`)
- `TL.doc` is plain JSON. `TL.commit(label)` snapshots `JSON.stringify(doc)` into history. `TL.touch()` is a live change with no snapshot. `TL.on`/`TL.emit` is the event bus.
- `TL.migrate(doc)` repairs and upgrades documents. Top-level keys it doesn't know survive, but **add explicit defaults for `doc.materials`**.
- **Rasters live in `TL.asset`** (`add`, `get`, `cow`) and are referenced by id. ⚠️ Asset ids are found by a regex over the doc JSON that only matches the keys `canvasId|maskId|imageId|tileAsset|motifId`. That regex is copied in 4 places: `state.js` (`docIds`, `ASSET_RE`), `export.js` (`saveProject`) and `autosave.js`. Anything not matched gets **garbage-collected** and is **not saved**. So an Image node must store its picture as `imageId: '<assetId>'`, or you must extend all 4 regexes.

**GPU** (`gl.js`)
- `TL.gl`: one WebGL2 context. `G.run(fragSrc, outTex, {u_tex, u_tex2, u_tex3, u_mask, u_tex4}, uniforms)`, `G.program`, and `G.warm(src)` (compiles in the background through `KHR_parallel_shader_compile`). `G.tex(w,h)` is a pooled texture with a 128 MB budget. Also `G.upload`, `G.toCanvas`, `G.read`.
- `G.PRELUDE` already provides `hash12`, `hash22`, `vnoise`, `fbm`, `rgb2hsv`, `luma`, `rot2`, and more. Reuse them.
- ⚠️ `G.tex` creates **RGBA8, premultiplied, CLAMP_TO_EDGE** textures. That is wrong for material maps (see §6). `texturelib-gpu.js` already uses `RGBA32F` with `EXT_color_buffer_float` (around line 386–396), so copy that pattern.

**Patterns** (`patterns.js`, `texturelib-typelab.js`, `vendor/texturelib.js`)
- `TL.patterns.list` holds 25 TypeLab generators plus 87 texturelib ones (`tx-*`). Use `PT.defaults(id)`, `PT.tileCanvas(L, px)` and `PT.tileCanvasAsync(L, px)` (runs on workers).
- `TextureLib.renderMaps(id, opts)` returns `{color, heightMap}`, and `TextureLib.heightToNormal` exists. Both are ideal sources for a "Pattern" node with real height.
- `TL.txgpu.has/render` are GPU ports of 12 slow patterns.

**Global keyboard** (`tools.js`, the `key()` function near the end)
- ⚠️ These shortcuts fire on `window`, whatever is under the mouse:
  - `Delete`/`Backspace` **deletes the selected layer**.
  - Arrow keys nudge the layer.
  - Single letters switch tools.
  - `Ctrl+D` deselects, `Ctrl+J` duplicates the layer, `Ctrl+A` selects all, `Ctrl+0`/`Ctrl+1` zoom.
  - `Space` is the temporary hand tool.
- In the Material tab every one of these must go to the graph instead (see §5.4).

**Viewport** (`view.js`, `index.html`)
- `#viewport` contains `<canvas id="view">`, `#hint` and `#statusbar`. `TL.view.request()` redraws the document.
- The grid columns are `--railW | dockL | view | dockR`.

**Interface variants** (`ui/variants.js`)
- Simple is the default. It shows "Quick picks" first, hides the sections listed in `HIDE[modeId]` behind "Show N more settings", and shows a Start card on an empty document. The Material tab must follow this too.

**Tests and build**
- `tools/exe-tests/` drives the packaged exe over CDP (`cdp.mjs`, `rebuild.ps1`).
- Add `m28_*.js` tests in the same style, and finish with an exe rebuild, as M7 and M10 did.

---

## 4. Target layout in TypeLab

```
┌ topbar: TYPELAB File │ Type Pattern Dither FX&Filters Paint Export [Material] │ Search ⟲ ⟳ zoom ┐
├──────────────┬───────────────────────────────────────────────┬──────────────────────────────┤
│ Node library │ graph toolbar: [+ Add] [Frame] [Fit] [Align▾] │ Preview  [2D|3D] [maps ▾]    │
│ [filter....] │  ┌ material tabs: Bricks × │ Rust × │ + ┐    │  ┌────────────────────────┐  │
│ ★ Favourites │                                               │  │ selected node / final  │  │
│ ▸ TypeLab    │   nodes + wires (bezier, type-coloured)       │  │ material, 2D tiled 2×2  │  │
│ ▸ Generators │                                               │  │ or 3D sphere/cube/plane │  │
│ ▸ Patterns   │                                               │  └────────────────────────┘  │
│ ▸ Filters    │                                   ┌minimap┐   ├──────────────────────────────┤
│ ▸ Transform  │                                   └───────┘   │ Node settings (kit controls) │
│ ▸ Material   │  hint bar: Space / right-click: add node …    │ = existing Settings panel     │
└──────────────┴───────────────────────────────────────────────┴──────────────────────────────┘
```

- Left dock: a new **`matlib`** panel (Node library). Right dock: a new **`matpreview`** panel stacked above **`settings`**.
- **Layers and History stay hidden** in this tab. Undo and redo still work: History shows "Add node", "Connect", and so on.
- The tool rail is hidden (`--railW: 0`). The graph has its own navigation.
- **Material tabs** across the top of the graph area switch between the materials in `doc.materials`. Same idea as MM's `.ptex` tabs.

---

## 5. Implementation plan

### 5.1 Shell changes (small, existing files)
1. **`ui/shell.js`**
   - Add `'material'` to `UI.modeOrder`, add a `MODE_HINT.material` tooltip, and add the `mMaterial` icon in `kit.js`.
   - In `UI.setMode`, call `UI.modes[old].leave?.()` and `UI.modes[new].enter?.()`, and set `document.body.dataset.mode = id`.
   - `enter` shows the graph and `leave` hides it. Existing modes have no hooks, so they don't change.
2. **Key 7.** Appending `material` makes key 7 open Material instead of FX & Filters (the M20 legacy shortcut). **Ask the user, or pick and note it in ROADMAP.** The alternative is no number key for Material at all.
3. **`index.html`**
   - Add `<div id="matgraph" hidden>` inside `#viewport`, next to `#view`.
   - Add the new scripts **after** `gl.js`, `patterns.js` and `texturelib*.js`, and **before** `ui/variants.js` and `main.js`: `js/material/*.js`, then `js/ui/mode-material.js`.
4. **`css/style.css`**
   - `body[data-mode=material] #view { display:none }`
   - `body[data-mode=material] { --railW:0 }` (or hide `#toolbar`)
   - Add graph styles.
   - Keep using `--panel*`, `--line*`, `--acc` and `--r`.
5. **`ui/dock.js`**
   - Add `matlib` and `matpreview` to `IDS`.
   - Give each panel a set of modes, e.g. `{layers:'*', history:'*', settings:'*', matlib:['material'], matpreview:['material']}`, with Layers and History hidden in `material`.
   - Make `D.apply()` skip panels that don't belong to the current mode, and call it from `setMode`.
   - **Keep one saved layout.** Hidden panels keep their slot.
   - Check that a dock left empty in one mode collapses to 0 width (the `.empty` class).
6. **`view.js`.** While the Material tab is open, skip document redraws (`V.draw`) and resume them on `leave`. If something else needs the document render in the meantime (thumbnails, export preview), call the renderer directly.

### 5.2 Data model (in the document → undo, autosave and save work)
```js
doc.materials = [{
  id: 'M…', name: 'Bricks',
  size: 1024,                    // working resolution, 256–4096 (power of two)
  nodes: [{ id: 'N…', type: 'voronoi', x: 120, y: 80, p: { scaleX: 8, … }, seed: 1,
            collapsed: false, preview: false,
            imageId: null }],    // ← an image node MUST use the key imageId (asset-GC regex, see §3)
  links: [{ from: 'N1', out: 0, to: 'N2', in: 0 }],
  frames: [{ id, x, y, w, h, title, color }],   // comment boxes, optional
}];
```
- Graph pan, zoom and the active material id belong in `TL.st` or `localStorage`, **not in the document**. Otherwise every pan would add a history step.
- Dragging a node calls `TL.touch()` while it moves and `TL.commit('Move node')` once on drop. Same rule for sliders.
- `TL.migrate`:
  - default `doc.materials = []`;
  - drop links to missing nodes;
  - **keep** nodes of unknown type as greyed-out placeholders, the way unknown pattern generators are kept today;
  - fill missing params from the node definition.

### 5.3 Node definitions (registry: `js/material/nodes-*.js`)
```js
TL.mat.def({
  id: 'tones_step', name: 'Tones Step', cat: 'Filters', help: 'Pushes tones to dark / light around a value',
  inputs:  [{ k: 'in', type: 'color', def: 'vec4(0.5,0.5,0.5,1.0)' }],
  outputs: [{ k: 'out', type: 'color' }],
  params:  [{ k: 'value', label: 'Value', min: 0, max: 1, step: 0.01, def: 0.5 },
            { k: 'width', label: 'Width', min: 0, max: 1, step: 0.01, def: 0.1 },
            { k: 'invert', label: 'Invert', type: 'bool', def: false }],
  // GLSL body; in_in(uv) samples the input, p_* are uniforms, uv is 0..1 tile space
  glsl: `vec3 v = clamp((in_in(uv).rgb - p_value) / max(1e-4, p_width) + 0.5, 0.0, 1.0);
         o_out = vec4(p_invert > 0.5 ? 1.0 - v : v, in_in(uv).a);`,
});
```
- **Port types** (the colour is the port dot and the wire):
  - `gray`: one float, height-like. Grey.
  - `color`: RGBA. Blue.
  - `normal`: optional. Lilac.
  - `sdf`: later. Orange.
- Implicit conversions: gray→color (`vec4(v,v,v,1)`) and color→gray (`luma`). Any other mismatch refuses the connection, and the port shakes.
- **The param descriptors are the same as FX params**, so `UI.paramControl` draws the settings panel. Also show 1–3 of the most important params inline on the node, the way MM does.
- **Seeds:** each node has its own `seed`, and the dice button is already part of the slider (`seed: true`).

### 5.4 Graph editor (`js/material/graph.js`)
Draw nodes as **DOM elements** (absolutely positioned, CSS `transform: scale()` for zoom) over **one SVG layer for the wires**. That keeps text crisp, lets you reuse kit controls inside nodes, and handles a few hundred nodes without trouble. Only switch to canvas if profiling says so.

Interactions (MM conventions, adapted to TypeLab):

| Action | Input |
|---|---|
| Add node | **Space**, **right-click** or **double-click** on empty space opens a searchable menu at the cursor (reuse the Ctrl+K palette look). Drag a node from the library. |
| Connect | Drag from an output to an input. Drop on empty space to open the add menu, filtered to compatible nodes, and connect automatically. |
| Disconnect / reroute | Drag an input's wire away. Alt+click a wire deletes it. |
| Pan / zoom | Middle-drag or Space+drag pans. Wheel zooms around the cursor. Arrow keys pan. `F` / `Ctrl+0` fits. |
| Select | Click a node. Shift-click adds. Drag on empty space draws a selection box. `Ctrl+A` selects all. |
| Edit | `Delete` removes nodes. `Ctrl+D` duplicates. `Ctrl+C`/`Ctrl+V` copy and paste (the clipboard holds graph JSON). `Ctrl+G` makes a frame. |
| Preview | Click a node to show it in Preview 2D. A per-node eye shows an inline thumbnail. |

⚠️ **Keyboard conflicts:** while `st.mode === 'material'`, the `key()` handler in `tools.js` must return early, except for undo, redo, save and Ctrl+K. Otherwise Delete removes a *layer*. The `/^[1-7]$/` mode switch in `shell.js` and `Tab` (focus mode) can stay. Ignore keys while an `<input>` inside a node is focused (`U.isTyping`).

### 5.5 Engine (`js/material/engine.js`)
**v1: one texture per node, lazy evaluation.** It is simple and easy to debug, and it gives free per-node previews.
- Topologically sort the graph and catch cycles (refuse a link that would create one).
- Keep a **dirty flag per node**. Changing a param marks that node and everything downstream. Only re-run dirty nodes that the visible previews actually need.
- Each node becomes one fragment shader: `G.PRELUDE`, then the material helpers, then the node's `glsl`. `in_<k>(uv)` becomes a `texture()` of the upstream texture (REPEAT wrap). Unconnected inputs use the input's `def`. Compile with `G.warm` so the UI never stalls on the first use.
- **Slider drags** evaluate at ¼ resolution (for example 256 for a 1024 material) and redo at full size on `onChange`. This is the same fast-path idea as `TL.view.interact`.
- **Memory:** float textures at 1024² cost 8 MB (RGBA16F) each. Keep an LRU of node outputs within about 256 MB. Evicted nodes are just dirty again.
- **Later optimisation:** fuse chains of per-pixel nodes into one shader, like MM does. Nodes that read neighbours (blur, warp, edge detect, slope blur, AO, normal) keep their own buffer. That's the reason for the "buffer" nodes in MM graphs.

### 5.6 Previews (`js/material/preview2d.js`, `preview3d.js`)
- **Preview 2D:** the selected node, or the Material node's albedo, drawn 2×2 so seams show. Toggles: single/tiled, channel (RGB / A / any material map), zoom and pan. Draw with `G.toCanvas`.
- **Preview 3D:** same GL context; render into an FBO, then `G.toCanvas` into the panel canvas. Don't create a second WebGL context, because textures can't be shared between contexts.
  - **Meshes:** sphere, rounded cube, plane, cylinder.
  - **Lighting:** GGX PBR plus a small procedural sky or studio environment. No HDR files needed.
  - **Height:** parallax occlusion mapping, with a "Height depth" slider.
  - **Controls:** drag orbits, wheel zooms, plus a light-angle dial (`UI.dial`).
  - **Speed:** re-render only on changes, so there is no continuous rAF loop.

---

## 6. GPU details (easy to get wrong)
- **Formats:** material buffers are `RGBA16F` when `EXT_color_buffer_float` is available, else `RGBA8`.
  - Write a **separate allocator** (`TL.mat.tex(w,h)`). Don't change `G.tex`: the existing effects rely on RGBA8 premultiplied textures.
  - `G.run` accepts any `{tex, fbo, w, h}`, so it works unchanged.
- **Straight alpha, not premultiplied.** Material maps are data. Only the final "send to canvas" step converts to premultiplied, through `G.upload` or `G.toCanvas`.
- **Wrap with REPEAT** on every material texture, so blurs, warps and edge detection tile seamlessly. `G.tex` uses CLAMP_TO_EDGE.
- **Work in tile UV space.** Use `uv` 0..1 on a periodic domain, not pixel coordinates. Noise must be periodic: lattice coordinates `mod` the frequency, the way MM's `perlin` does with `mod(xy, size)` and the way `texturelib-gpu.js` does it.
- **Colour:**
  - Albedo is authored in sRGB, as users pick it.
  - Blend in linear light where it matters (texturelib already does this).
  - Export albedo as sRGB, and normal, roughness, metallic, AO and height as linear data.
- **Normal maps:** export convention OpenGL (Y+) by default, with a DirectX (Y−) toggle in Export.

---

## 7. Node list

**v1 (M28b–d), about 40 nodes.** The MM name is in brackets where it differs.

| Category | Nodes |
|---|---|
| **TypeLab** (unique) | **Text** (any text layer, or type text into the node with font picker) · **Layer** (render any layer) · **Document** (whole composite) · **Pattern** (any of the 112 `TL.patterns` generators; outputs color + height through `TextureLib.renderMaps`; params come from the generator's own descriptors) · **Image** (import, stored as `imageId`) |
| Generators | Uniform color · Uniform gray · Gradient (linear / radial / circular) · Shape (circle, polygon, star, rays: MM "Shape") · Value noise ("Perlin") · FBM (value / perlin / cellular, ridged / turbulence) · Voronoi (+ Triangle Voronoi) · Bricks (rows, bevel, mortar, random colour / offset: outputs bricks + bevel + random gray) · Weave · Scratches · Tile / Splatter (scatter an input with random rotation / scale / colour) |
| Filters | Invert · Levels ("Tones") · Tones Step · Profile / Curve (curve editor: new kit control, or reuse the one in the Curves adjustment from M24) · Colorize (gradient map; reuse the M24 gradient UI) · Blend (Normal, Multiply, Screen, Overlay, Add, Subtract, Difference, Min, Max, plus mask input) · Math (gray: + − × ÷ pow, min, max, clamp) · Blur (gaussian) · Directional blur · Slope blur · Warp (by gray or by noise) · Edge detect ("Simple Edge Detect") · Emboss · Occlusion (AO from height; "HBAO" lite) · Make tileable · Mirror · Transform (translate, rotate, scale, repeat) · Switch (A/B) |
| Normal / height | Normal map (from height, strength, OpenGL / DirectX) · Height to AO · Curvature |
| Output | **Material** (one per graph; inputs: Albedo, Metallic, Roughness, Emission, Normal, AO, Height, Opacity; each input has a fallback value when unconnected) |

**Later:** SDF nodes (MM's SDF tree), subgraphs and groups with exposed params (MM's `remote` and `gen_inputs` / `gen_outputs`), a node-based "buffer" control, a pixel-art / dither material channel (reuse `TL.dither`), and importing simple MM `.mmg` nodes.

**Using Material Maker's node code**
- Material Maker is **MIT licensed** ("Copyright (c) 2018-present Rodolphe Suescun and contributors"). GLSL can be ported from its node files at `addons/material_maker/nodes/*.mmg`.
- Each `.mmg` file is JSON. `shader_model.global` holds helper GLSL, `shader_model.code` holds per-pixel code, and `outputs[].f` / `.rgba` hold expressions. `$(param)`, `$in($uv)` and `$uv` are template variables, and `parameters[]` lists `{name, default, min, max, step, type}`. Bigger nodes such as `slope_blur.mmg` are subgraphs of buffer and edge-detect nodes.
- Godot shader GLSL is nearly GLSL ES 3.0. Rename `rand`/`rand2` to the prelude's hashes, and check the precision qualifiers.
- **If any code is ported, add a `THIRD_PARTY_NOTICES` entry with MM's MIT licence text.** Writing the nodes from scratch is fine too.
- Raw files were reachable at `https://raw.githubusercontent.com/RodZill4/material-maker/master/addons/material_maker/nodes/<name>.mmg` (checked: `perlin`, `tones_step`, `slope_blur`). The GitHub API and tarball downloads were blocked from the planning session's network.

---

## 8. Milestones (paste into ROADMAP.md)

- [ ] **M28a Material workspace shell + graph editor (no rendering yet)**
  - Done when:
    - the tab is registered (icon, tooltip, key decided);
    - `#matgraph` shows in Material and the canvas, rail, Layers and History are hidden there;
    - the `matlib` and `matpreview` dock panels exist and the dock layout survives switching tabs and Reset panel layout;
    - material tabs work (new, rename, duplicate, delete);
    - nodes can be added (library drag, Space / right-click menu, drop-wire menu), moved, connected, disconnected, deleted, duplicated, copied and pasted, and box-selected;
    - the minimap works;
    - every edit is one undo step;
    - the graph survives save, open, autosave and crash recovery;
    - **Delete in the graph never deletes a layer**.
- [ ] **M28b Engine + Preview 2D + core nodes**
  - Done when:
    - the float / REPEAT allocator works;
    - per-node shaders compile in the background;
    - dirty propagation works, with ¼-resolution evaluation while dragging;
    - the LRU memory budget is in place;
    - Uniform, Gradient, Shape, Value noise, FBM, Voronoi, Bricks, Invert, Levels, Tones Step, Blend, Math, Blur, Warp, Transform, Normal map and Material all work;
    - Preview 2D (tiled, per channel) works;
    - every generator tiles seamlessly (3×3 seam check like the M22 tile preview).
- [ ] **M28c Material node + Preview 3D**
  - Done when:
    - the Material node with all channels works;
    - the 3D preview (sphere, cube, plane, cylinder; GGX; parallax; orbit; light dial) renders in the same GL context;
    - it holds 60 fps while orbiting at 1024².
- [ ] **M28d TypeLab nodes + full v1 node list**
  - Done when:
    - the Text, Layer, Document, Pattern (all 112 generators, colour + height) and Image nodes work;
    - the rest of the §7 v1 list is in;
    - the Profile curve and Colorize gradient controls work;
    - Simple interface: Quick picks open **starter graphs** (Bricks, Stone tiles, Wood planks, Brushed metal, Rust, Fabric, Leather, **Embossed text**: a text layer becomes raised metal or stone letters), and advanced sections sit behind "Show more" (`variants.js` `HIDE.material`);
    - the Start card gets a "Make a material" entry.
- [ ] **M28e Output + polish + tests + exe**
  - Done when:
    - **Export maps**: PNG per channel at 512–4096, plus a zip through `zip.js`. Naming uses `<name>_albedo.png`, `_normal`, `_roughness`, `_metallic`, `_ao`, `_height`, `_emission`, with an option to pack ORM (R=AO, G=rough, B=metal). Normal convention can be OpenGL or DirectX. The desktop build uses `window.native` save and folder dialogs;
    - **Send to canvas** adds the lit albedo (light angle, height depth) as an image layer;
    - **Use as texture fill / filter**: register each material as a pattern generator (`mat-<id>`), so the Type panel's "Fill with texture", the texture brush and Texture filters can use it;
    - Ctrl+K commands for the Material tab work (add node X, new material, export maps);
    - `tools/exe-tests/m28_*.js` exist (graph edit stress, all nodes at min / mid / max, seams, save / open roundtrip, keyboard conflicts, memory soak, 3D fps);
    - the exe is rebuilt and the version bumped.

Commit after each milestone, as the roadmap asks.

---

## 9. Files the planning session read (about half the app)

- `index.html`, `main.js`, `state.js`, `gl.js` (API part), `view.js` (top part), `tools.js` (keyboard and init)
- `export.js` (project save), `autosave.js` (top part)
- `texturelib-gpu.js` (top part), `texturelib-typelab.js` (header), `vendor/texturelib.js` (exports)
- `effects.js` (registry part)
- `ui/shell.js`, `ui/dock.js`, `ui/kit.js` (parts), `ui/mode-paint.js`, `ui/mode-pattern.js` (top part), `ui/variants.js` (top part)
- `ROADMAP.md`, `package.json`, `electron/preload.js`, `tools/exe-tests/README.md`

Not seen: the other half of the project. **Check §3's claims against your full tree before relying on them**, especially:
- whether any other global key handlers exist;
- whether anything else assumes `#view` is always visible (Start card, drop zone, toasts);
- whether `variants.js` iterates `UI.modeOrder` in a way a 7th mode breaks.

## 10. Open questions for the user (ask before or during M28a)
1. **Key 7:** move it from FX & Filters (legacy) to Material, or give Material no number key?
2. **Tab position:** last (after Export), or between Paint and Export?
3. **Scope of v1:** is the M28a–e plan right, or ship M28a–c first for a review?
