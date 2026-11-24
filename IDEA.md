# Youtube Enhancer

Violentmonkey userscript that adds answer assistance, focus/anti-cheat protection and
copy/paste restoration to Wayground (formerly Quizizz).

Source lives in `src/` as small files. `Youtube Enhancer.user.js` in the repo root is
**generated** — it is the single-file artifact you install and upload to Greasyfork.

## Commands

```bash
npm run build     # rebuild "Youtube Enhancer.user.js" from src/
npm run watch     # rebuild on every save
npm run verify    # rebuild + syntax check
```

No dependencies. Node 18+ only.

## Layout

| File                         | Lines | Role                                                                                                                                |
| ---------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/header.txt`             |    23 | Userscript metadata block. **Single source of truth** for `@grant`, `@connect`, `@match`, version.                                  |
| `src/core/state.js`          |    39 | All shared mutable state (`API_KEY`, `QUIZ_DATA`, `ANTI_CHEAT`, …) + the URL regexes.                                               |
| `src/core/xhr-intercept.js`  |   165 | Patches `XMLHttpRequest` to read/rewrite join + attempt responses.                                                                  |
| `src/core/fetch-quiz-id.js`  |    36 | Resolves a room hash to a quiz id.                                                                                                  |
| `src/ui/ui.css`              |   778 | The whole shadow-DOM stylesheet. Plain CSS — full editor highlighting.                                                              |
| `src/ui/ui.html`             |   228 | The whole shadow-DOM markup.                                                                                                        |
| `src/ui/ui-controller.js`    |   729 | `toLoad()`: creates the shadow host, injects CSS+HTML, queries elements, wires every menu/button, then boots on `DOMContentLoaded`. |
| `src/features/protection.js` |    28 | Shield UI state (`SHIELD_PATHS`, `updateProtectionUI`).                                                                             |
| `src/ai/fetch-quiz.js`       |    48 | Fetches raw quiz JSON; `getShadowEl`, `getSelectedProvider`.                                                                        |
| `src/ai/solver.js`           |   197 | `startQuizSolver`, `processQuizAi` — the solve pipeline.                                                                            |
| `src/ai/normalize.js`        |   156 | `stripHtml`, `normalizeText`, `cleanQuizData`, `formatQuizResults`.                                                                 |
| `src/ai/providers/groq.js`   |    97 | Groq provider.                                                                                                                      |
| `src/ai/providers/gpt.js`    |    57 | OpenAI provider.                                                                                                                    |
| `src/ai/providers/gemini.js` |    59 | Gemini provider.                                                                                                                    |
| `src/ui/toast.js`            |    55 | `showNotification`.                                                                                                                 |
| `src/features/quiz-hash.js`  |    70 | Content keys, hashing, saved-result formatting.                                                                                     |
| `src/features/answers.js`    |   125 | `fetchQuizAnswers` — official answer retrieval.                                                                                     |
| `src/features/highlight.js`  |   321 | Answer highlighting engine + `MutationObserver` + polling interval.                                                                 |

## Why not ES modules

A userscript runs as one classic script, so all 54 top-level declarations share one
scope: `ANTI_CHEAT` is written from inside an XHR handler, `toLoad()` calls 20+ helpers
by bare name, and every helper can call every other helper. `import`/`export` would
force a rewrite of every shared-state reference — exactly the kind of edit that breaks
a working script.

Instead the build **concatenates** the fragments into one IIFE in the order listed in
`build.mjs`. Function declarations hoist across fragments, so only `let`/`const`
initialisation order matters (state first, `features/highlight.js` last).

Two consequences:

- The IIFE wrapper and `'use strict'` live in `build.mjs` (the `prologue`), not in any
  source file. Every file under `src/` parses on its own in the editor.
- `jsconfig.json` makes VS Code treat all fragments as one global program, so
  go-to-definition, rename and autocomplete work across files.

## Adding a feature

1. Put the code in the file that already owns that area (`src/ai/…`, `src/ui/…`,
   `src/features/…`). New file? Add it to `ORDER` in `build.mjs`.
2. Need a CSS rule or markup? Edit `src/ui/ui.css` / `src/ui/ui.html` — they are
   injected at the `@@UI_CSS@@` / `@@UI_HTML@@` markers in `ui-controller.js`.
3. New `GM_*` call? Add the matching `@grant` / `@connect` to `src/header.txt`.
4. `npm run build`, reload the script in Violentmonkey, test on a real quiz.

## Publishing

Upload the built `Youtube Enhancer.user.js` (root of this repo) to Greasyfork.
`@downloadURL`/`@updateURL` in `src/header.txt` already point at script 602640.
Do not hand-edit the built file — the next build overwrites it.

## Invariant worth keeping

The build output is **byte-for-byte identical** to the v4.3.0 monolith (CRLF line
endings, no trailing newline). That is how the split was proven safe. After a pure
refactor, this should print nothing:

```bash
npm run build && git diff --exit-code -- "Youtube Enhancer.user.js"
```
