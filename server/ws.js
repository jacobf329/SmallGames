// A small RFC-6455 WebSocket server. Written from scratch so the whole game
// runs with `node server/index.js` and zero npm installs - handy when you are
// setting up on a LAN with no internet.

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 1 << 20;   // 1 MiB is far more than any game message needs

export class WSConnection extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.remote = req.socket.remoteAddress;
    this.open = true;
    this.alive = true;
    this._buf = Buffer.alloc(0);
    this._frag = null;
    this._fragOp = 0;

    socket.on('data', (d) => this._onData(d));
    socket.on('error', () => this.destroy());
    socket.on('close', () => this._closed());
    socket.setNoDelay(true);
  }

  send(data) {
    if (!this.open) return;
    const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
    try {
      this.socket.write(frame(0x1, payload));
    } catch {
      this.destroy();
    }
  }

  ping() {
    if (!this.open) return;
    try { this.socket.write(frame(0x9, Buffer.alloc(0))); } catch { this.destroy(); }
  }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    try { this.socket.write(frame(0x8, body)); } catch { /* ignore */ }
    this.open = false;
    setTimeout(() => this.destroy(), 100);
  }

  destroy() {
    if (this.socket.destroyed) { this._closed(); return; }
    this.socket.destroy();
  }

  _closed() {
    if (!this.open && this._emittedClose) return;
    this.open = false;
    if (!this._emittedClose) { this._emittedClose = true; this.emit('close'); }
  }

  _onData(chunk) {
    this._buf = this._buf.length ? Buffer.concat([this._buf, chunk]) : chunk;
    for (;;) {
      const f = parse(this._buf);
      if (!f) return;
      if (f.error) { this.close(1002, 'protocol'); return; }
      this._buf = this._buf.subarray(f.size);

      if (f.opcode === 0x8) { this.close(1000); return; }
      if (f.opcode === 0x9) { try { this.socket.write(frame(0xA, f.payload)); } catch { /* ignore */ } continue; }
      if (f.opcode === 0xA) { this.alive = true; continue; }

      if (f.opcode === 0x0) {
        if (!this._frag) { this.close(1002, 'bad continuation'); return; }
        this._frag = Buffer.concat([this._frag, f.payload]);
      } else {
        if (this._frag) { this.close(1002, 'nested fragment'); return; }
        this._frag = f.payload;
        this._fragOp = f.opcode;
      }
      if (this._frag.length > MAX_FRAME) { this.close(1009, 'too big'); return; }
      if (f.fin) {
        const body = this._frag;
        const op = this._fragOp;
        this._frag = null;
        this.alive = true;
        if (op === 0x1) this.emit('message', body.toString('utf8'));
        else this.emit('binary', body);
      }
    }
  }
}

function frame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

function parse(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  const fin = (b0 & 0x80) !== 0;
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < off + 2) return null;
    len = buf.readUInt16BE(off); off += 2;
  } else if (len === 127) {
    if (buf.length < off + 8) return null;
    const big = buf.readBigUInt64BE(off); off += 8;
    if (big > BigInt(MAX_FRAME)) return { error: true, size: buf.length };
    len = Number(big);
  }
  if (!masked) return { error: true, size: buf.length };   // clients must mask
  if (buf.length < off + 4 + len) return null;
  const mask = buf.subarray(off, off + 4); off += 4;
  const payload = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) payload[i] = buf[off + i] ^ mask[i & 3];
  return { fin, opcode, payload, size: off + len };
}

export function attachWebSocket(server, onConnection, { path = '/ws' } = {}) {
  // Drop connections that stop answering pings (phone locked, wifi dropped).
  const conns = new Set();
  const timer = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.destroy(); continue; }
      c.alive = false;
      c.ping();
    }
  }, 15000);
  timer.unref?.();

  server.on('upgrade', (req, socket) => {
    const url = req.url.split('?')[0];
    if (url !== path) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const conn = new WSConnection(socket, req);
    conns.add(conn);
    conn.on('close', () => conns.delete(conn));
    onConnection(conn);
  });

  return () => { clearInterval(timer); for (const c of conns) c.destroy(); };
}
