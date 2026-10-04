# Material tests

Browser tests (Playwright + Chromium) for the Material workspace. They load TypeLab's `app/index.html` over http,
with a stand-in for the Electron `window.native` bridge.

```
cd app && python -m http.server 8123          # in one terminal (TypeLab's app folder)
cd typelab-material/tests && npm i playwright # once (or use a global playwright)
node test-nodes.mjs        # every node output compiles + renders      → nodes-sheet.png
node test-materials.mjs    # all starter materials build + render       → materials-sheet.png
node test-ui.mjs           # the workspace driven like a user (15 checks)
node test-ui-maps.mjs      # effect maps in the Material tab + FX card + materials as patterns (13 checks)
node test-effectmaps.mjs   # every effect-map node, map == list pixels, starter maps, live layer, links
                           #   (ALL_TLFX=1 runs all 313 TypeLab effects as material nodes, ~10 min on SwiftShader)
```

Env: `TYPELAB_URL` (default `http://127.0.0.1:8123/index.html`), `SOFTWARE_GL=1` (SwiftShader, no GPU needed),
`CHROMIUM=/path/to/chrome`. Exit code 1 on any failed check or console error.

To run the same checks inside the packaged exe, paste the `page.evaluate(...)` bodies into `tools/exe-tests/cdp.mjs`
`evalfile:` scripts (they only use `TL.*`).
