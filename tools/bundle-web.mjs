// Builds the whole game (online play, practice, everything but the LAN
// server) into one self-contained HTML file for a static web host such as
// jteef.com/play/turbo:
//
//   node tools/bundle-web.mjs  ->  dist/turbo-surfers.html

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Dependency order matters: everything lands in one shared scope.
const MODULES = [
  'shared/constants.js', 'shared/rng.js', 'shared/track.js', 'shared/physics.js',
  'shared/items.js', 'shared/bots.js', 'shared/room.js', 'shared/session.js',
  'client/js/rtc.js', 'client/js/net.js', 'client/js/input.js', 'client/js/render.js', 'client/js/audio.js', 'client/js/main.js',
];

function flatten(src) {
  return src
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+/gm, '');
}
const constantNames = [...read('shared/constants.js').matchAll(/^export const (\w+)/gm)].map(m => m[1]);

const js = [
  '(function () {',
  '"use strict";',
  'window.TS_WEB = true;',
  flatten(read('shared/constants.js')),
  `const C = { ${constantNames.join(', ')} };`,
  MODULES.slice(1).map(f => `\n/* ===== ${f} ===== */\n${flatten(read(f))}`).join('\n'),
  '})();',
].join('\n');

let html = read('client/index.html');
const head = html.slice(0, html.indexOf('<body>'))
  .replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${read('client/style.css')}\n</style>`);
let body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
body = body.replace(/<script[^>]*><\/script>\s*/g, '');

const out = `${head}${body}
<script type="module">
${js}
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const dest = path.join(ROOT, 'dist', 'turbo-surfers.html');
fs.writeFileSync(dest, out);
fs.writeFileSync('/tmp/ts-bundle-check.mjs', js);
console.log(`wrote ${dest}  (${(out.length / 1024).toFixed(1)} KB)`);
