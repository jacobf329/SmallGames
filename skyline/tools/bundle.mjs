// Packs Skyline Hustle into one self-contained HTML file (no server, no
// assets) that can be opened straight off a phone or hosted anywhere.
//
//   node skyline/tools/bundle.mjs  ->  dist/skyline-hustle.html
//
// Each ES module becomes a function scope in a tiny module table, so the
// files never collide on top-level names.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ORDER = ['data', 'sim', 'ai', 'audio', 'render', 'ui', 'main'];

function wrap(name) {
  let src = read(`js/${name}.js`);
  const exported = [];
  src = src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*'\.\/(\w+)\.js';?/gm,
    (_, names, mod) => `const {${names}} = __mods.${mod};`);
  src = src.replace(/^export\s+(const|let|function|class)\s+(\w+)/gm, (_, kw, id) => { exported.push(id); return `${kw} ${id}`; });
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${name}.js has syntax the bundler does not handle`);
  return `/* ===== ${name}.js ===== */\n__mods.${name} = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

let html = read('index.html');
html = html.replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${read('style.css')}\n</style>`);
html = html.replace(/<script type="module"[^>]*><\/script>/,
  () => `<script>\n(() => {\n"use strict";\nconst __mods = {};\n${ORDER.map(wrap).join('\n')}\n})();\n</script>`);

const dest = path.join(ROOT, '..', 'dist', 'skyline-hustle.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, html);
console.log(`wrote ${path.relative(process.cwd(), dest)}  (${(html.length / 1024).toFixed(1)} KB)`);
