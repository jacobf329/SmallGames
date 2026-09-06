// Inlines the offline practice mode into one self-contained HTML file, so it
// can be opened straight off a phone or hosted anywhere with no server.
//
//   node tools/bundle.mjs  ->  dist/turbo-surfers-solo.html

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Dependency order matters: everything lands in one shared scope.
const MODULES = [
  'shared/constants.js', 'shared/rng.js', 'shared/track.js', 'shared/physics.js',
  'shared/items.js', 'shared/bots.js', 'shared/room.js',
  'client/js/render.js', 'client/js/input.js', 'client/js/audio.js', 'client/js/solo.js'
];

// Strip ESM syntax; every import here is local, so concatenation replaces it.
function flatten(src) {
  return src
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+/gm, '');
}

// `import * as C from './constants.js'` becomes one object built from the
// constants module's own exported names.
const constantNames = [...read('shared/constants.js').matchAll(/^export const (\w+)/gm)].map(m => m[1]);

const js = [
  '(function () {',
  '"use strict";',
  'window.TS_STANDALONE = true;',
  flatten(read('shared/constants.js')),
  `const C = { ${constantNames.join(', ')} };`,
  MODULES.slice(1).map(f => `\n/* ===== ${f} ===== */\n${flatten(read(f))}`).join('\n'),
  '})();'
].join('\n');

// Page markup: drop the document shell and asset links, the artifact host
// supplies its own <head>.
let html = read('client/solo.html');
html = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
html = html.replace(/<link[^>]*>\s*/g, '').replace(/<script[^>]*><\/script>\s*/g, '');

const out = `<title>Turbo Surfers</title>
<style>
${read('client/style.css')}
</style>
${html.trim()}
<script type="module">
${js}
</script>
`;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const dest = path.join(ROOT, 'dist', 'turbo-surfers-solo.html');
fs.writeFileSync(dest, out);
console.log(`wrote ${dest}  (${(out.length / 1024).toFixed(1)} KB)`);
