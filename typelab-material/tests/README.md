# Material tests

Browser tests (Playwright + Chromium) for the Material workspace. They load TypeLab's `app/index.html` over http,
with a stand-in for the Electron `window.native` bridge.

```
cd app && python -m http.server 8123          # in one terminal (TypeLab's app folder)
cd typelab-material/tests && npm i playwright # once (or use a global playwright)
node test-nodes.mjs        # every node output compiles + renders      → nodes-sheet.png
node test-materials.mjs    # all starter materials build + render       → materials-sheet.png
node test-ui.mjs           # the workspace driven like a user (13 checks)
```

Env: `TYPELAB_URL` (default `http://127.0.0.1:8123/index.html`), `SOFTWARE_GL=1` (SwiftShader, no GPU needed),
`CHROMIUM=/path/to/chrome`. Exit code 1 on any failed check or console error.

To run the same checks inside the packaged exe, paste the `page.evaluate(...)` bodies into `tools/exe-tests/cdp.mjs`
`evalfile:` scripts (they only use `TL.*`).
