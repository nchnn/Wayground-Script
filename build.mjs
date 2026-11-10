// Build: concatenate the source fragments into one Violentmonkey-ready .user.js.
//
// The fragments share a single function scope -- that is deliberate. A userscript
// runs as one classic script, so `let`/`function` declarations are visible across
// fragments exactly as they were when this was one 3,200-line file. Splitting into
// ES modules would force `import`/`export` on ~50 mutually-recursive helpers and
// every shared-state assignment; concatenation keeps the runtime byte-identical.
//
// Order matters only for top-level statements (`let` is not hoisted across files,
// function declarations are). Keep this list in dependency order, not alphabetical.
import { readFileSync, writeFileSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, 'src', p), 'utf8').replace(/\r\n/g, '\n');

const ORDER = [
  'core/state.js',
  'core/xhr-intercept.js',
  'core/fetch-quiz-id.js',
  'ui/ui-controller.js',
  'features/protection.js',
  'ai/fetch-quiz.js',
  'ai/solver.js',
  'ai/normalize.js',
  'ai/providers/groq.js',
  'ai/providers/gpt.js',
  'ai/providers/gemini.js',
  'ui/toast.js',
  'features/quiz-hash.js',
  'features/answers.js',
  'features/highlight.js',
];

const OUT = join(root, 'Wayground Script.user.js');

function build() {
  const header = read('header.txt').replace(/\s*$/, '\n');
  // Blank line, IIFE opener, strict mode -- the only unbalanced braces live here,
  // so every file under src/ parses on its own in the editor.
  const prologue = "\n(function() {\n    'use strict';\n";
  let out = header + prologue + ORDER.map(read).join('') + '})();';

  for (const [marker, content] of [['@@UI_CSS@@', read('ui/ui.css')], ['@@UI_HTML@@', read('ui/ui.html')]]) {
    const hits = out.split(marker).length - 1;
    if (hits !== 1) throw new Error(`${marker}: expected 1 occurrence, found ${hits}`);
    out = out.split(marker).join(content); // split/join: no `$&` special-casing
  }

  writeFileSync(OUT, out.replace(/\n/g, '\r\n'), 'utf8'); // original is CRLF with no trailing newline
  return out.split('\n').length;
}

try {
  console.log(`built  ${build()} lines -> Wayground Script.user.js`);
} catch (e) {
  console.error(`build failed: ${e.message}`);
  process.exit(1);
}

if (process.argv.includes('--watch')) {
  let timer;
  watch(join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        console.log(`rebuilt ${build()} lines`);
      } catch (e) {
        console.error(`build failed: ${e.message}`);
      }
    }, 80);
  });
  console.log('watching src/ ...');
}
