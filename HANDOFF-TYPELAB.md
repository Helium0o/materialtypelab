# Handoff for the TypeLab session: Material workspace + effect maps (done, tested)

**From:** the session that built this add-on.
**For:** the session that owns TypeLab (Electron, `app/js/…`, ROADMAP at M27).
**Status:** finished and tested in TypeLab's own code (the v2.3.0 tree the user sent), in headless Chromium.
- 5 test suites pass: 0 shader errors, 0 console errors.
- A straight chain in an effect map gives pixel-identical results to the same effects as a plain list.
- **Not tested yet: inside the packaged exe.** Please do that, using step 3 of INSTALL.md.

## What the user asked for

1. A Material tab like Material Maker: library on the left, node graph in the middle, 2D/3D preview and settings on the right. **Done.** It has 90 starter materials.
2. TypeLab should be able to use **the same node-map style for its other effects**, so the user can **join** effects, filters, dither, patterns, text, layers and materials. **Done:** effect maps, plus links in both directions between materials and effects.
3. The user's decisions:
   - the map editor lives **inside the Material tab**;
   - **key 7** opens it;
   - there is **no "convert stack to map" button**.

## What to do

1. Read [`typelab-material/INSTALL.md`](typelab-material/INSTALL.md).
2. Copy the 11 files.
3. Add 11 lines to `app/index.html`, or apply [`typelab-material/index.html.patch`](typelab-material/index.html.patch).
4. Run through the 7-step check in the exe.
5. Add the M28 entry to ROADMAP.md (the text is in INSTALL.md), commit, and rebuild the exe.

## What it adds (for users)

| Where | What |
|---|---|
| **Material tab (7)**, library | **Materials** (90 starters with 3D thumbnails) · **Maps** (8 starter effect maps) · **Nodes** (for the open graph; categories fold, and the filter box searches them) |
| Material graphs | 54 GPU nodes, plus **all 313 TypeLab effects and filters as material nodes** (seamless via a 3×3 wrap), plus Text, Layer, Document, Pattern and Image sources. Preview in 3D or 2D, PBR zip export. |
| Effect maps (tabs marked **fx**) | **347 nodes:** every TypeLab effect and filter (each with an optional Mask input), Dither, Blend (27 modes), Mix, Cut out, Mask from image, Mask adjust, Layer, Document, Solid colour, Pattern, Material, 19 tiled generators, Transform |
| Using a map | **Use this map → Add to layer / Add to whole image.** The map becomes one **Effect map** entry in that FX stack. Its preview shows the result on that layer. |
| FX & Filters | New **Effect map** effect ("Node maps" category) and **Material** effect (Fill, Overlay, Multiply, Relief from the real normal map, Lit material, Displace). Both cards have a picker and an **Edit in Material tab** button. |
| Pattern / Type / Paint | Every material shows up in the Pattern picker under **"Materials (node)"**, so it works as a pattern layer, a text fill and the texture brush. The Material tab also has **Fill selected text** and **Pattern layer** buttons. |
| Ctrl+K | New material or effect map from any starter, Add node, Export maps, Add to canvas |

What "joining" looks like in practice: in the screenshot the user's text is filled with the Oak planks material and has the Neon double glow effect map applied.

![joined](typelab-material/docs/ui-joined-on-canvas.png)

## How it fits into TypeLab (for you)

**No TypeLab file is edited.** Everything hooks in by wrapping existing functions:

| Wrapped | Why |
|---|---|
| `UI.setMode` / `UI.refresh` / `UI.buildTopbar` | show the workspace |
| `UI.paramControl` | the material and map pickers |
| `TL.migrate` | keep `doc.materials` valid |
| `TL.render.key` | layers re-render when a material or map they use changes |
| `TL.patterns.tileCanvas`, `tileCanvasAsync`, `items`, `svgBody` | serve `mat-*` generators |
| `TL.fx.apply` | remembers `env.bounds` for map nodes |
| `TL.fx.prepare` | prepares texture filters inside maps before an export |

There is also a capture-phase key guard. **Without it, Delete in the graph would delete the selected layer.**

**Data:** everything lives in `doc.materials`:
- materials: `{ id, name, size, nodes, links }`;
- effect maps: `{ id, name, kind: 'effect', nodes, links }`;
- layers point at them with `{ type: 'effectmap', p: { map } }`, `{ type: 'matfx', p: { mat } }` or pattern `gen: 'mat-<id>'`.

So undo, autosave and `.typelab` files work with no changes. Image nodes store their picture under `imageId`, so TypeLab's asset GC keeps them.

**Engines:**
- **Materials:** their own WebGL2 context, RGBA16F textures with REPEAT wrapping, cached by a hash of everything upstream.
- **Effect maps:** document-size canvases, run through `TL.fx.apply(canvas, [effect], env)`, `TL.dither.apply` and `TL.render.glBlend`.

**New effects or filters added to TypeLab later become nodes automatically** at load time, both as effect-map nodes (`fx:<id>`) and as material nodes (`tlfx:<id>`).

The full architecture and the extension API are in [`typelab-material/README.md`](typelab-material/README.md). Every node and starter is in [`typelab-material/docs/CATALOG.md`](typelab-material/docs/CATALOG.md).

## Things to watch

- **Load order:** the material scripts go **before `view.js`** (after every `effects*` and `filters-*` file), and `mode-material.js` goes **after `ui/export-preview.js`**. See INSTALL.md.
- **If you change `R.key`, `PT.tileCanvas`, `UI.paramControl` or `FX.apply` signatures, keep the wrappers working.** They all pass through to the original.
- **Two GL contexts:** TL.gl and the material engine. They share data only as canvases.
- **Effect maps don't nest.** A map inside a map, or inside a Document or Layer node, passes its input through; that is the loop guard.
- **Limits and next steps** are listed at the end of INSTALL.md: 16-bit height export, node groups, a curve widget, SDF nodes, `.mmg` import.

## Files in this package

```
HANDOFF-TYPELAB.md            ← this file
PROMPT-FOR-TYPELAB.md         ← the message to paste into the TypeLab session
typelab-material/INSTALL.md   ← steps, checks, ROADMAP entry, limits
typelab-material/README.md    ← architecture, extension API
typelab-material/index.html.patch
typelab-material/app/…        ← the 11 files to copy
typelab-material/tests/…      ← 5 Playwright suites
typelab-material/docs/…       ← CATALOG.md + screenshots
handover/…                    ← the original plan + reference screenshots (background only)
```
