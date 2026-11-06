// Dev server: serves first-roll/ as static files, plus a tiny in-memory
// stand-in for the Firestore REST calls online.js makes, so two browsers on
// one machine can host and join without the cloud:
//
//   node tools/serve.mjs [--port 8090]
//   open http://localhost:8090/?signal=http://localhost:8090/signal
//
// The stand-in implements only what online.js uses: create with documentId
// (409 if taken), auto-id create, get, list a collection, PATCH with
// updateMask, delete.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

export function startServer({ port = 8090, quiet = false } = {}) {
  const docs = new Map();   // full path -> { fields, createTime }
  let auto = 0;

  const docName = (p) => `projects/x/databases/(default)/documents/${p}`;
  const docOut = (p, d) => ({ name: docName(p), fields: d.fields, createTime: d.createTime });

  function signal(req, res, rel, body) {
    const [p, qs] = rel.split('?');
    const q = new URLSearchParams(qs || '');
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj ? JSON.stringify(obj) : ''); };
    const parts = p.split('/').filter(Boolean);
    const isCollection = parts.length % 2 === 1;
    if (req.method === 'POST' && isCollection) {
      const id = q.get('documentId') || `auto${++auto}`;
      const full = `${p}/${id}`;
      if (docs.has(full)) return send(409, { error: { code: 409, status: 'ALREADY_EXISTS' } });
      const d = { fields: JSON.parse(body || '{}').fields || {}, createTime: new Date().toISOString() };
      docs.set(full, d);
      return send(200, docOut(full, d));
    }
    if (req.method === 'GET' && isCollection) {
      const documents = [...docs].filter(([k]) => k.startsWith(`${p}/`) && k.split('/').length === parts.length + 1).map(([k, d]) => docOut(k, d));
      return send(200, documents.length ? { documents } : {});
    }
    if (req.method === 'GET') return docs.has(p) ? send(200, docOut(p, docs.get(p))) : send(404, { error: { code: 404 } });
    if (req.method === 'PATCH') {
      const d = docs.get(p);
      if (!d) return send(404, { error: { code: 404 } });
      const f = JSON.parse(body || '{}').fields || {};
      const mask = q.getAll('updateMask.fieldPaths');
      for (const k of mask.length ? mask : Object.keys(f)) if (f[k]) d.fields[k] = f[k];
      return send(200, docOut(p, d));
    }
    if (req.method === 'DELETE') {
      for (const k of [...docs.keys()]) if (k === p || k.startsWith(`${p}/`)) docs.delete(k);
      return send(200, {});
    }
    return send(400, { error: 'unsupported' });
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = req.url;
      const m = /^\/signal\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/(.*)$/.exec(decodeURI(url));
      if (m) return signal(req, res, m[1], body);
      let file = decodeURIComponent(url.split('?')[0]);
      if (file.endsWith('/')) file += 'index.html';
      const abs = path.join(ROOT, path.normalize(file));
      if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(abs, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });
  });
  return new Promise((resolve) => server.listen(port, () => {
    const p = server.address().port;
    if (!quiet) console.log(`First Roll dev server: http://localhost:${p}/?signal=http://localhost:${p}/signal`);
    resolve({ server, port: p });
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  startServer({ port: i > 0 ? +process.argv[i + 1] : +(process.env.PORT || 8090) });
}
