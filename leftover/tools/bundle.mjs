// Packs Leftover Uprising into one self-contained HTML file
// for a static web host such as jteef.com/play/leftover.
//
//   node arena/tools/bundle.mjs  ->  dist/leftover-uprising.html
//
// Each ES module becomes a function scope in a tiny module table, so the
// files never collide on top-level names.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ORDER = ['data', 'lines', 'director', 'game', 'ai', 'session', 'skillsui', 'foodinfo', 'banner', 'rtc', 'net', 'audio', 'render', 'main'];

function wrap(name) {
  let src = read(`js/${name}.js`);
  const exported = [];
  src = src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*'\.\/(\w+)\.js';?/gm,
    (_, names, mod) => `const {${names.replace(/\s+as\s+/g, ': ')}} = __mods.${mod};`);
  src = src.replace(/^export\s*\{([^}]*)\};?/gm, (_, names) => { exported.push(...names.split(',').map(n => n.trim()).filter(Boolean)); return ''; });
  // "export const A = 1, B = 2" would only export A here: refuse it.
  const multi = src.match(/^export\s+(const|let)\s+\w+\s*=[^;\n(]*,\s*\w+\s*=/m);
  if (multi) throw new Error(`${name}.js: split "${multi[0].slice(0, 60)}…" into one export per line`);
  src = src.replace(/^export\s+(const|let|function|class|async function)\s+(\w+)/gm, (_, kw, id) => { exported.push(id); return `${kw} ${id}`; });
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${name}.js has syntax the bundler does not handle`);
  return `/* ===== ${name}.js ===== */\n__mods.${name} = (() => {\n${src}\nreturn { ${[...new Set(exported)].join(', ')} };\n})();\n`;
}

let html = read('index.html');
html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${read('style.css')}\n</style>`);
html = html.replace(/<script type="module"[^>]*><\/script>/,
  () => `<script>\n(() => {\n"use strict";\nconst __mods = {};\n${ORDER.map(wrap).join('\n')}\n})();\n</script>`);

// --solo: practice-only build for jteef.com/play (multiplayer lives in Party Pad).
const SOLO = process.argv.includes('--solo');
// Where the page finds the art: --art-base=/games/leftover/art/ on jteef.com;
// by default, the repo's leftover/art next to dist/.
const artArg = process.argv.find(a => a.startsWith('--art-base='));
const ART_BASE = artArg ? artArg.slice(11) : '../leftover/art/';
const audioArg = process.argv.find(a => a.startsWith('--audio-base='));
const AUDIO_BASE = audioArg ? audioArg.slice(13) : '../leftover/audio/';
html = html.replace('<script>\n(() => {', () => `<script>globalThis.LU_ART_BASE = ${JSON.stringify(ART_BASE)}; globalThis.LU_AUDIO_BASE = ${JSON.stringify(AUDIO_BASE)};</script>\n<script>\n(() => {`);
if (SOLO) {
  html = html.replace('<div id="online">', '<div id="online" class="hidden">');
  html = html.replace('<p id="status" class="status"></p>', '<p class="hint" style="text-align:center">Playing with friends? Start a Party Pad room at <a href="/" style="color:inherit">jteef.com</a> and pick Leftover Uprising: the kitchen goes on the TV and everyone builds from their phone.</p>\n    <p id="status" class="status"></p>');
  html = html.replace('<button id="btn-practice" class="btn big">PLAY SOLO</button>', '<button id="btn-practice" class="btn big">PRACTICE SOLO</button>');
}
const dest = path.join(ROOT, '..', 'dist', SOLO ? 'leftover-uprising-solo.html' : 'leftover-uprising.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, html);
console.log(`wrote ${path.relative(process.cwd(), dest)}  (${(html.length / 1024).toFixed(0)} KB)`);
