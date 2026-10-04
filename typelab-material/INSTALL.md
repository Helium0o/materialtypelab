# Install the Material workspace into TypeLab

This is for the session working on TypeLab. It takes about 5 minutes, and **no existing JS or CSS file changes**.

The add-on was built and tested against the TypeLab tree the user sent (v2.3.0, ROADMAP at M27). It loads in that tree with zero console errors.

## 1. Copy the files

Copy these from `typelab-material/` into TypeLab, keeping the same paths:

```
app/css/material.css
app/js/material/mat-glsl.js
app/js/material/mat-core.js
app/js/material/mat-nodes.js
app/js/material/mat-nodes-typelab.js
app/js/material/mat-presets.js
app/js/material/mat-preview3d.js
app/js/material/mat-graph.js
app/js/ui/mode-material.js
```

## 2. Add 9 lines to `app/index.html`

Either run `patch -p1 < typelab-material/index.html.patch` from the TypeLab root, or add the lines by hand.

The patch keeps the file's CRLF line endings.

```html
<!-- after css/style.css -->
<link rel="stylesheet" href="css/material.css">

<!-- right before js/view.js (after autosave.js): needs util, state, patterns, texturelib, render, zip -->
<script src="js/material/mat-glsl.js"></script>
<script src="js/material/mat-core.js"></script>
<script src="js/material/mat-nodes.js"></script>
<script src="js/material/mat-nodes-typelab.js"></script>
<script src="js/material/mat-presets.js"></script>
<script src="js/material/mat-preview3d.js"></script>
<script src="js/material/mat-graph.js"></script>

<!-- right after js/ui/export-preview.js (after shell.js, dock.js, mode-type.js; before variants.js and main.js) -->
<script src="js/ui/mode-material.js"></script>
```

**Order matters:**
- `mat-core.js` must load **before `main.js`**, because it wraps `TL.migrate` before the first `TL.newDoc`.
- `mode-material.js` must load **after** `ui/shell.js`, `ui/kit.js` and `ui/mode-type.js`, because it uses `UI.paramControl`.

## 3. Check it

1. Start the app (`npm start`). A 7th tab, **Material**, appears. Press **7**.
2. Click **Red bricks** in the library. The 3D sphere in the Settings panel shows bricks.
3. Select a node and press **Delete**. The node disappears, and **the selected layer does not**. Press **Ctrl+Z** and it comes back.
4. Press **Ctrl+S**, reopen the project, and the material is still there.
5. Optional: run `tests/` (see `tests/README.md`): `test-nodes`, `test-materials` and `test-ui` (13 UI checks).

For the exe harness, the tests only use `TL.*` inside `page.evaluate`, so their bodies work as `cdp.mjs evalfile:` scripts.

## What changes for users

- **Key 7** now opens Material. Before, 7 fell back to FX & Filters (M20's legacy shortcut).
  - If you'd rather keep that, change the push in `mode-material.js` to insert Material somewhere else, or remove it from `modeOrder` and open it from the File menu.
  - **Ask the user** if unsure.
- The Simple, Standard and Compact interface variants all work. The Material tab has no Quick picks; its library *is* the quick start.
- Ctrl+K gains these commands:
  - "Go to Material", "New empty material", "Export material maps", "Add material to the canvas as a layer";
  - "New material: <name>" for each of the 90 materials;
  - "Add node: <name>" while the Material tab is open.

## Roadmap entry (paste into ROADMAP.md)

```
- [x] M28 Material workspace (tab 7, Material Maker style): node graph (54 nodes: generators, filters, blends,
  height/normal, TypeLab sources Text / Layer / Document / Pattern / Image), 90 starter materials in 10 groups,
  3D preview (sphere / cube / cylinder / plane, GGX, parallax) + 2D tiled / per-channel preview, PBR export
  (albedo, normal GL/DX, roughness, metallic, AO, height, emission, opacity, ORM) as zip, material → image layer;
  graphs in doc.materials (undo, autosave, .typelab); own WebGL2 context, RGBA16F + REPEAT, hash cache
```

## Known limits and next steps

- **Exports are 8-bit.** Height in particular would benefit from 16-bit PNG, which needs a PNG encoder. The textures are already 16-bit float, so `M.toCanvas` is the only place to change.
- **Pattern node tiles must be square.** Non-square TypeLab tiles (Tribal Hearts) get stretched into a square, which keeps them seamless.
- **Rotation in Transform** is seamless only at multiples of 90°. That is noted in the node help.
- **Not done yet:**
  - node groups and subgraphs, comment frames, SDF nodes;
  - a curve-editor widget (Curve uses 5 sliders for now);
  - multi-stop gradients beyond 5;
  - "use material as a texture fill or Texture filter" by registering each material as a `TL.patterns` generator `mat-<id>`;
  - importing Material Maker `.mmg` nodes.
- **Performance:**
  - Each node renders a full-size texture, and a node that only works per pixel could instead be fused into the next node's shader (Material Maker does this).
  - Preview runs at ≤1024 px, or 256 px while dragging. The full size is used only for export.
