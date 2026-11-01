// Packs Skyline Hustle into one self-contained HTML file (no server, no
// assets, three.js included) that can be opened straight off a phone or
// hosted anywhere.
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
const ORDER = ['data', 'map', 'staff', 'demand', 'citizens', 'sim', 'ai', 'auction', 'supply', 'civic', 'advisor', 'game', 'actions', 'net', 'audio', 'music', 'lens', 'render3d', 'ui', 'main'];

// three.js ships as one module ending in `export{a as B, ...}`.
function wrapThree() {
  let src = read('vendor/three.module.min.js');
  const at = src.lastIndexOf('export{');
  const list = src.slice(at + 7, src.indexOf('}', at));
  src = src.slice(0, at) + 'return {' + list.split(',').map(e => {
    const [local, name] = e.trim().split(/\s+as\s+/);
    return `${name || local}: ${local}`;
  }).join(',') + '};';
  return `__mods.three = (() => {\n${src}\n})();\n`;
}

function wrap(name) {
  let src = read(`js/${name}.js`);
  const exported = [];
  src = src.replace(/^import\s*\*\s*as\s+(\w+)\s+from\s*'[^']*three\.module\.min\.js';?/gm, (_, id) => `const ${id} = __mods.three;`);
  src = src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*'\.\/(\w+)\.js';?/gm,
    (_, names, mod) => `const {${names.replace(/\s+as\s+/g, ': ')}} = __mods.${mod};`);
  src = src.replace(/^export\s*\{([^}]*)\};?/gm, (_, names) => { exported.push(...names.split(',').map(n => n.trim()).filter(Boolean)); return ''; });
  src = src.replace(/^export\s+(const|let|function|class|async function)\s+(\w+)/gm, (_, kw, id) => { exported.push(id); return `${kw} ${id}`; });
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${name}.js has syntax the bundler does not handle`);
  return `/* ===== ${name}.js ===== */\n__mods.${name} = (() => {\n${src}\nreturn { ${[...new Set(exported)].join(', ')} };\n})();\n`;
}

let html = read('index.html');
html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${read('style.css')}\n</style>`);
html = html.replace(/<script type="module"[^>]*><\/script>/,
  () => `<script>\n(() => {\n"use strict";\nconst __mods = {};\n${wrapThree()}\n${ORDER.map(wrap).join('\n')}\n})();\n</script>`);

const dest = path.join(ROOT, '..', 'dist', 'skyline-hustle.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, html);
console.log(`wrote ${path.relative(process.cwd(), dest)}  (${(html.length / 1024).toFixed(0)} KB)`);
