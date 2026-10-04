# Install: Material workspace + effect maps

This is for the session working on TypeLab. It takes about 10 minutes. **No existing TypeLab JS or CSS file changes.**

Everything was built and tested against the TypeLab tree the user sent (v2.3.0, ROADMAP at M27): 5 Playwright suites, all passing, with zero console errors.

## User decisions (already made, built in)

- The **effect-map editor lives inside the Material tab.** It's a second kind of tab next to materials, marked with a lime **fx** badge.
- **Key 7** opens the Material tab. Before, 7 fell back to FX & Filters (M20's legacy shortcut).
- There is **no "convert stack to map" button**, by request.

## 1. Copy 11 files (same paths)

```
app/css/material.css
app/js/material/mat-glsl.js
app/js/material/mat-core.js
app/js/material/mat-nodes.js
app/js/material/mat-nodes-typelab.js
app/js/material/mat-presets.js
app/js/material/mat-preview3d.js
app/js/material/mat-link.js
app/js/material/mat-fxmap.js
app/js/material/mat-graph.js
app/js/ui/mode-material.js
```

## 2. Add 11 lines to `app/index.html`

Either run `patch -p1 < typelab-material/index.html.patch` from the TypeLab root (it keeps the CRLF line endings), or add the lines by hand:

```html
<!-- after css/style.css -->
<link rel="stylesheet" href="css/material.css">

<!-- right before js/view.js (after autosave.js) — needs util, state, patterns, texturelib, gl, effects + all filters, dither, render, zip -->
<script src="js/material/mat-glsl.js"></script>
<script src="js/material/mat-core.js"></script>
<script src="js/material/mat-nodes.js"></script>
<script src="js/material/mat-nodes-typelab.js"></script>
<script src="js/material/mat-presets.js"></script>
<script src="js/material/mat-preview3d.js"></script>
<script src="js/material/mat-link.js"></script>
<script src="js/material/mat-fxmap.js"></script>
<script src="js/material/mat-graph.js"></script>

<!-- right after js/ui/export-preview.js (after shell, dock, kit, mode-type; before variants.js and main.js) -->
<script src="js/ui/mode-material.js"></script>
```

**Order matters:**
- `mat-link.js` and `mat-fxmap.js` turn **every effect in `TL.fx.list` at load time** into a node. So they must load after `effects*.js` and `filters-*.js`, which they do if you insert them before `view.js`.
- `mat-core.js` must load before `main.js`, because it wraps `TL.migrate`.
- `mode-material.js` must load after `ui/mode-type.js`, because it wraps `UI.paramControl`.

## 3. Check it in the app (`npm start`)

1. A 7th tab, **Material**, appears. Press **7**.
2. Library → **Materials** → **Red bricks**. A 3D brick sphere appears in the Settings panel.
3. Library → **Maps** → **Neon double glow**. Select a text layer first; then **Use this map → Add to "…"**. The text glows on the canvas.
4. In **FX & Filters**, the layer's stack shows an **Effect map** card. It has a map picker and **Edit in Material tab**.
5. Open a material, select a text layer, then **Export & use → Fill selected text**. The letters are filled with the material.
6. In the graph, select a node and press **Delete**. The node goes, **the selected layer does not**. Ctrl+Z brings the node back.
7. Press Ctrl+S, reopen the project, and the materials and maps are all still there.

**Automated tests** (see `tests/README.md`): `test-nodes`, `test-materials`, `test-ui`, `test-ui-maps`, `test-effectmaps`. The test bodies only use `TL.*` inside `page.evaluate`, so they can also run in the exe harness (`cdp.mjs evalfile:`).

## What users get

- **Material tab, library on the left:**
  - **Materials**: 90 starters with 3D thumbnails.
  - **Maps**: 8 starter effect maps, plus "Empty effect map".
  - **Nodes**: the nodes for whichever graph is open. 54 GPU nodes plus 313 TypeLab effects for materials; 347 nodes for effect maps. Categories fold, and the filter box searches them.
- **Settings panel:**
  - for a material: Preview (3D or 2D), node settings, Material, and **Export & use**. Export & use covers the maps zip, add as layer, pattern layer, *Fill selected text* and *Material effect on layer*.
  - for an effect map: Preview (the result on its layer, or one node), node settings, and **Use this map** (add to layer or Whole image, list of where it's used, remove).
- **FX & Filters gains two effects:**
  - **Effect map**, in the "Node maps" category;
  - **Material**: Fill, Overlay, Multiply, Relief, Lit material or Displace with a material.
- **Pattern picker:** "Materials (node)" lists every material, for pattern layers, text fill and the texture brush.
- **Ctrl+K:**
  - "Go to Material", "New empty material", "New empty effect map", "Export material maps", "Add material to the canvas as a layer";
  - "New material: …" for each of the 90 materials, and "New effect map: …" for each of the 8 maps;
  - "Add node: …" while the Material tab is open.

## Roadmap entry (paste into ROADMAP.md)

```
- [x] M28 Material workspace (tab 7, Material Maker style) + effect maps: node graph editor shared by two graph kinds.
  Materials: 54 GPU nodes + 313 TypeLab effects/filters as seamless material nodes (3×3 wrap), 90 starter materials,
  3D (sphere/cube/cylinder/plane, GGX, parallax) + 2D preview, PBR zip export (albedo, normal GL/DX, roughness,
  metallic, AO, height, emission, opacity, ORM), material → layer / pattern layer / text fill / texture brush,
  "Material" effect (relief from the real normal map). Effect maps: every TL.fx effect/filter as a node with an optional
  mask, dither, 27 blends, masks, layers, document, patterns, materials, tiled generators; one "Effect map" entry in
  any stack; map chain == list (pixel-identical); 8 starter maps. Graphs in doc.materials (undo, autosave, .typelab).
```

## Known limits and next steps

- **Exports are 8-bit PNG.** Height would benefit from 16-bit; the engine is float internally, so only `M.toCanvas` needs to change.
- **Effect maps don't nest.** A map inside a map, or inside a Document or Layer node, passes its input through, so nothing can loop.
- **In normal canvas renders, nodes that depend on the input re-run** whenever their layer re-renders. TypeLab's layer cache limits how often that happens. Cross-render caching is used for input-independent branches and in the Material-tab preview.
- **"TypeLab FX" material nodes run on the CPU** at 3× the tile size. Above roughly 1365 px per tile, `TL.fx.apply` downscales to the GPU limit. Slow filters show their quick version first, then refine.
- **The Pattern node in materials stretches non-square tiles** into a square, which keeps them seamless.
- **Not built yet:** node groups and comment frames, a curve-editor widget (5 sliders for now), SDF nodes, importing Material Maker `.mmg` files.
