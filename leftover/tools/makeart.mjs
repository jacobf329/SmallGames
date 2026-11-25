// Generates Leftover Uprising's art from art/prompts.json with the JTEEF
// image tool (tools/imagegen.py), several at a time, then trims each sprite
// to its outline and saves a small webp next to prompts.json.
//
//   node leftover/tools/makeart.mjs                # everything missing
//   node leftover/tools/makeart.mjs coconut grill  # just these (regenerates)
//   IMAGEGEN=/path/to/imagegen.py  JOBS=8          # optional
//
// Needs OPENAI_API_KEY in the environment (any value behind a key-injecting
// proxy) and Python with Pillow. Raw 1024px PNGs go to art/raw/ (not committed).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ART = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'art');
const RAW = path.join(ART, 'raw');
const P = JSON.parse(fs.readFileSync(path.join(ART, 'prompts.json'), 'utf8'));
const IMAGEGEN = process.env.IMAGEGEN || '/home/user/jteef/tools/imagegen.py';
const JOBS = +process.env.JOBS || 4;
fs.mkdirSync(RAW, { recursive: true });

const jobs = [];
for (const [n, d] of Object.entries(P.food)) jobs.push({ n, prompt: `${d}, ${P.style}`, alpha: true, size: 256 });
for (const [n, d] of Object.entries(P.tower)) jobs.push({ n: 'tower_' + n, prompt: `${d}, ${P.towerStyle}`, alpha: true, size: 256 });
for (const [n, d] of Object.entries(P.door)) jobs.push({ n, prompt: `${d}, ${P.style}`, alpha: true, size: 256 });
for (const [n, d] of Object.entries(P.texture)) jobs.push({ n: 'tex_' + n, prompt: d, alpha: false, size: 256 });

const only = process.argv.slice(2);
const todo = jobs.filter(j => only.length ? only.includes(j.n) || only.includes(j.n.replace(/^tower_|^tex_/, '')) : !fs.existsSync(path.join(ART, j.n + '.webp')));
console.log(`${todo.length} image(s) to make (${JOBS} at a time)`);

const run = (cmd, args) => new Promise(res => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('close', code => res({ code, out }));
});

async function make(j) {
  const raw = path.join(RAW, j.n + '.png');
  if (only.length || !fs.existsSync(raw)) {
    // The image API allows ~20 images a minute: on a rate limit, wait and retry.
    for (let attempt = 1; attempt <= 6; attempt++) {
      const r = await run('python3', [IMAGEGEN, j.prompt, '-o', raw, '--model', P.model, '--quality', P.quality,
        '--background', j.alpha ? 'transparent' : 'opaque', '--size', '1024x1024']);
      if (r.code === 0) break;
      if (attempt === 6) { console.log(`FAIL ${j.n}: ${r.out.trim().split('\n').pop()}`); return; }
      await new Promise(res => setTimeout(res, (/429/.test(r.out) ? 20000 : 5000) * attempt));
    }
  }
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(raw)}).convert('RGBA')
if ${j.alpha ? 'True' : 'False'}:
    bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bb)
    s = max(im.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(im, ((s - im.width) // 2, (s - im.height) // 2)); im = sq
im = im.resize((${j.size}, ${j.size}), Image.LANCZOS)
im.save(${JSON.stringify(path.join(ART, j.n + '.webp'))}, 'WEBP', quality=88, method=6)
`;
  const r = await run('python3', ['-c', py]);
  console.log(r.code === 0 ? `ok   ${j.n}` : `FAIL ${j.n} (resize): ${r.out.trim().split('\n').pop()}`);
}

let i = 0;
await Promise.all(Array.from({ length: JOBS }, async () => { while (i < todo.length) await make(todo[i++]); }));
const all = jobs.filter(j => fs.existsSync(path.join(ART, j.n + '.webp'))).length;
console.log(`done: ${all}/${jobs.length} images in art/`);
