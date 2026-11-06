// Bundles First Roll into one self-contained HTML file, the same format as
// the other games on jteef.com/play: no assets, no external requests (apart
// from online play's signalling).
//
//   node tools/bundle.mjs  ->  dist/first-roll.html
//
// Each ES module becomes a function scope registered in __mods, so module
// names never collide. Imports become destructuring from __mods; exports are
// gathered into the scope's return value. Only the import/export forms this
// codebase uses are supported: `import { a, b as c } from './x.js'`,
// `export function|const|let|class name`, and `export { a, b }`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/ui/main.js';
const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"](.+?)['"];?[ \t]*$/gm;

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

// Depth-first so every module lands after the modules it imports.
const order = [];
const seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) visit(rel(path.resolve(path.dirname(path.join(ROOT, file)), m[2])));
  order.push(file);
}
visit(ENTRY);

function wrap(file) {
  let src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dir = path.dirname(path.join(ROOT, file));
  if (/^export\s+(const|let)\s+[\w$]+\s*=[^;\n]*,\s*[\w$]+\s*=/m.test(src)) throw new Error(`${file}: export one name per statement`);
  src = src.replace(IMPORT_RE, (_, names, from) => {
    const target = rel(path.resolve(dir, from));
    const list = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': ')).join(', ');
    return `const { ${list} } = __mods[${JSON.stringify(target)}];`;
  });
  if (/^\s*import\s/m.test(src)) throw new Error(`${file}: unsupported import form`);
  const names = [];
  src = src.replace(/^export\s+\{([^}]*)\};?[ \t]*$/gm, (_, list) => {
    names.push(...list.split(',').map((n) => n.trim()).filter(Boolean));
    return '';
  });
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  if (/^export\s/m.test(src)) throw new Error(`${file}: unsupported export form`);
  return `/* ===== ${file} ===== */\n__mods[${JSON.stringify(file)}] = (() => {\n${src}\nreturn { ${names.join(', ')} };\n})();\n`;
}

const js = `"use strict";\nconst __mods = {};\n${order.map(wrap).join('\n')}`;

const SRD = `This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.`;

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="style.css">/, () => `<style>\n${css}</style>`);
html = html.replace(/<script type="module" src="src\/ui\/main.js"><\/script>/, () => `<script type="module">\n${js}</script>`);
html = html.replace('<html lang="en">', () => `<html lang="en">\n<!-- First Roll (github.com/jacobf329/SmallGames, first-roll/). Built by tools/bundle.mjs: edit the sources, not this file.\n${SRD} -->`);
if (html.includes('src="src/') || html.includes('href="style.css"')) throw new Error('bundle still references a source file');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const dest = path.join(ROOT, 'dist', 'first-roll.html');
fs.writeFileSync(dest, html);
console.log(`wrote ${rel(dest)}  (${(html.length / 1024).toFixed(1)} KB, ${order.length} modules)`);
