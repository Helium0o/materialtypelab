# Prompt to give the TypeLab session

Copy everything between the lines and send it to the TypeLab session, together with the zip (unpacked next to the TypeLab project, or anywhere that session can read).

---

I'm giving you a finished add-on for TypeLab: a **Material** workspace (tab 7, Material Maker style) plus **effect maps**. With effect maps, TypeLab's effects, filters, dither, blends, masks, layers, patterns and materials can be wired together as nodes and used as one effect in any layer's FX stack.

It was built and tested against our current tree (v2.3.0, ROADMAP at M27). Five Playwright test suites pass with 0 shader errors and 0 console errors. It has **not** been tested inside the packaged exe yet.

Please:

1. Read `HANDOFF-TYPELAB.md` first, then `typelab-material/INSTALL.md`.
2. Install it exactly as INSTALL.md says:
   - copy the 11 files from `typelab-material/app/` into `app/`, keeping their paths;
   - add the 11 lines to `app/index.html`, or run `patch -p1 < typelab-material/index.html.patch`. Load order matters.
   - **Don't edit the add-on's wrapping approach.** It needs no changes to existing TypeLab files.
3. Run the 7-step check from INSTALL.md **inside the exe** (`npm start`), using real input. Report anything that fails, and fix it in the add-on files rather than in TypeLab core where possible.
4. Optionally, port the test bodies in `typelab-material/tests/` to `tools/exe-tests/` (they only use `TL.*` inside `page.evaluate`).
5. Add the **M28** entry from INSTALL.md to ROADMAP.md, commit, and rebuild the exe (bump the version).

Decisions I've already made, so don't ask about them again:
- the effect-map editor lives **inside the Material tab**;
- **key 7** opens the Material tab (it no longer falls back to FX & Filters);
- **no "convert stack to map" button**.

When you're done, tell me:
- what you checked in the exe;
- anything you had to change;
- the new version number.

---

## What's in the zip

| File | For |
|---|---|
| `HANDOFF-TYPELAB.md` | the handoff: what was built, how it plugs in, what to watch |
| `PROMPT-FOR-TYPELAB.md` | this message |
| `typelab-material/INSTALL.md` | install steps, the 7-step check, ROADMAP entry, known limits |
| `typelab-material/README.md` | architecture + how to add nodes and starters |
| `typelab-material/index.html.patch` | the 11 `index.html` lines as a patch |
| `typelab-material/app/…` | the 11 files to copy |
| `typelab-material/tests/…` | 5 Playwright suites |
| `typelab-material/docs/CATALOG.md` + images | every material, effect map and node; screenshots |
| `handover/…` | the original plan and reference screenshots (background only) |
