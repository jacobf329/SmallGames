// Turbo Surfers - online play with the host's phone as the race server.
// Same approach (and the same Firestore mailbox) as Skyline Hustle: the host
// runs shared/session.js in the browser, friends connect over WebRTC, and
// gameRooms/{CODE} only carries connection details while someone joins.
// No Firebase library: plain REST with the site's public web API key.

const FIRESTORE = {
  project: 'campaign-e0a68',
  apiKey: 'AIzaSyAJMmGnR-izbXyriN6iWdip4cgXhWmi-fQ',
};
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';        // no I or O
const MSG_CHUNK = 15000;

// Tests can point signalling at a local stand-in: ?signal=http://localhost:9099
function base() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('signal') : null;
  return `${q || 'https://firestore.googleapis.com'}/v1/projects/${FIRESTORE.project}/databases/(default)/documents`;
}
const keyQ = (sep = '?') => `${sep}key=${FIRESTORE.apiKey}`;
const toFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) }]));
const fromFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, v.stringValue ?? (v.integerValue != null ? +v.integerValue : v.timestampValue)]));

async function rest(method, path, body) {
  const url = `${base()}/${path}${keyQ(path.includes('?') ? '&' : '?')}`;
  // keepalive lets a DELETE finish even while the page is closing.
  const r = await fetch(url, { method, keepalive: method === 'DELETE', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404) return null;
  if (!r.ok) { const e = new Error(`signal ${r.status}`); e.status = r.status; throw e; }
  return r.status === 204 ? {} : r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const onlineSupported = () => typeof RTCPeerConnection !== 'undefined' && typeof fetch !== 'undefined';
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

// ------------------------------------------------------------- WebRTC ----
// Collect this side's address candidates as they turn up.
function collect(pc) {
  pc._cands = [];
  pc._types = new Set();
  pc._t0 = performance.now();
  pc.addEventListener('icecandidate', e => {
    if (!e.candidate || !e.candidate.candidate) return;
    pc._cands.push(JSON.stringify({ c: e.candidate.candidate, m: e.candidate.sdpMid, i: e.candidate.sdpMLineIndex }));
    const ty = / typ (\w+)/.exec(e.candidate.candidate)?.[1];
    if (ty) { pc._types.add(ty); if (ty === 'srflx' && !pc._srflxAt) pc._srflxAt = performance.now(); }
  });
}
// Wait for addresses: until gathering is done, or shortly after the public
// (STUN) address turns up, or at most ms. Safari can be slow to finish.
async function gathered(pc, ms = 6000) {
  const t0 = performance.now();
  while (pc.iceGatheringState !== 'complete' && performance.now() - t0 < ms) {
    if (pc._srflxAt && performance.now() - pc._srflxAt > 600) break;
    await sleep(100);
  }
  pc._sent = pc._cands?.length || 0;
}
// Addresses found after the handshake went out are passed along too.
async function sendLate(pc, path, field) {
  const t0 = performance.now();
  while (pc.iceGatheringState !== 'complete' && performance.now() - t0 < 8000 && pc.connectionState !== 'connected') await sleep(250);
  if ((pc._cands?.length || 0) > (pc._sent || 0) && pc.connectionState !== 'connected') {
    await rest('PATCH', `${path}?updateMask.fieldPaths=${field}`, { fields: toFields({ [field]: JSON.stringify(pc._cands.slice(pc._sent)) }) }).catch(() => {});
  }
}
async function addLate(pc, json, seen) {
  let list = [];
  try { list = JSON.parse(json || '[]'); } catch { return seen; }
  for (const s of list.slice(seen)) {
    try { const o = JSON.parse(s); await pc.addIceCandidate({ candidate: o.c, sdpMid: o.m ?? '0', sdpMLineIndex: o.i ?? 0 }); } catch { /* stale */ }
  }
  return list.length;
}
export const candTypes = pc => [...(pc?._types || [])];

// Data channels have message size limits: split big messages, rejoin them.
function framed(ch) {
  let seq = 0;
  return str => {
    if (ch.readyState !== 'open') return;
    if (str.length <= MSG_CHUNK) return ch.send(str);
    const id = ++seq, n = Math.ceil(str.length / MSG_CHUNK);
    for (let i = 0; i < n; i++) ch.send(`\u0001${id}|${i}|${n}|${str.slice(i * MSG_CHUNK, (i + 1) * MSG_CHUNK)}`);
  };
}
function unframer(onText) {
  const parts = new Map();
  return data => {
    if (typeof data !== 'string') return;
    if (data[0] !== '\u0001') return onText(data);
    const a = data.indexOf('|'), b = data.indexOf('|', a + 1), c = data.indexOf('|', b + 1);
    const id = data.slice(1, a), i = +data.slice(a + 1, b), n = +data.slice(b + 1, c);
    const arr = parts.get(id) || [];
    arr[i] = data.slice(c + 1);
    parts.set(id, arr);
    if (arr.filter(x => x != null).length === n) { parts.delete(id); onText(arr.join('')); }
  };
}

// -------------------------------------------------------------- host ----
// Runs on the host's phone: creates a room code, answers friends' offers and
// plugs each data channel into the room.
export class Host {
  constructor(room, { name = 'Host', onStatus } = {}) {
    this.room = room;
    this.name = name;
    this.onStatus = onStatus;
    this.code = null;
    this.peers = new Map();          // join id -> { pc }
    this.stopped = false;
  }

  async start() {
    for (let tries = 0; tries < 8; tries++) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      try {
        await rest('POST', `gameRooms?documentId=${code}`, { fields: toFields({ game: 'turbo', host: this.name, created: Date.now() }) });
        this.code = code;
        this.poll();
        return code;
      } catch (e) {
        if (e.status !== 409) throw e;   // code taken: try another
      }
    }
    throw new Error('No free room code');
  }

  async poll() {
    while (!this.stopped) {
      try {
        const list = await rest('GET', `gameRooms/${this.code}/joins`);
        for (const doc of list?.documents || []) {
          const id = doc.name.split('/').pop();
          const f = fromFields(doc.fields);
          if (f.offer && !f.answer && !this.peers.has(id)) this.accept(id, f.offer).catch(() => {});
          const peer = this.peers.get(id);
          if (peer && f.ocands) peer.seen = await addLate(peer.pc, f.ocands, peer.seen || 0);
        }
        this.onStatus?.('online');
      } catch (e) { this.onStatus?.('offline'); }
      await sleep(2500);
    }
  }

  async accept(id, offer) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    collect(pc);
    this.peers.set(id, { pc, seen: 0 });
    let h = null;
    pc.ondatachannel = ev => {
      const ch = ev.channel;
      const send = framed(ch);
      ch.onopen = () => {
        const conn = { send, open: true, close: () => pc.close() };
        h = this.room.connect(conn);
        ch.addEventListener('close', () => { conn.open = false; });
        rest('DELETE', `gameRooms/${this.code}/joins/${id}`).catch(() => {});
      };
      const un = unframer(text => h?.message(text));
      ch.onmessage = e => un(e.data);
      ch.onclose = () => { h?.close(); h = null; this.peers.delete(id); };
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) { h?.close(); h = null; this.peers.delete(id); }
    };
    await pc.setRemoteDescription({ type: 'offer', sdp: offer });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    await rest('PATCH', `gameRooms/${this.code}/joins/${id}?updateMask.fieldPaths=answer`, { fields: toFields({ answer: pc.localDescription.sdp }) });
    sendLate(pc, `gameRooms/${this.code}/joins/${id}`, 'acands');
  }

  // The page is closing: no time to list joins, just remove the room.
  stopNow() {
    if (this.stopped || !this.code) return;
    this.stopped = true;
    for (const { pc } of this.peers.values()) try { pc.close(); } catch {}
    rest('DELETE', `gameRooms/${this.code}`).catch(() => {});
  }

  async stop() {
    if (this.stopped && !this.code) return;
    this.stopped = true;
    for (const { pc } of this.peers.values()) try { pc.close(); } catch {}
    this.peers.clear();
    if (this.code) {
      try {
        const list = await rest('GET', `gameRooms/${this.code}/joins`);
        for (const doc of list?.documents || []) await rest('DELETE', `gameRooms/${this.code}/joins/${doc.name.split('/').pop()}`).catch(() => {});
        await rest('DELETE', `gameRooms/${this.code}`);
      } catch {}
    }
  }
}

// ------------------------------------------------------------ transports ----
// Net (net.js) talks to one of these instead of a WebSocket. open(h) gets
// { onopen, onmessage(text), onclose }.

// The host's own phone: straight into the in-page race server.
export class LocalTransport {
  constructor(server) { this.server = server; }
  // (window.TS_LAG adds a delay each way, to try the game as a far-away guest.)
  open(h) {
    const conn = { open: true, send: str => setTimeout(() => h.onmessage(str), window.TS_LAG || 0) };
    this.conn = conn;
    this.h = this.server.connect(conn);
    setTimeout(() => h.onopen());
  }
  send(str) { const lag = window.TS_LAG || 0; if (lag) setTimeout(() => this.h?.message(str), lag); else this.h?.message(str); }
  close() { if (this.conn) this.conn.open = false; this.h?.close(); this.h = null; }
}

// A friend's phone: WebRTC to the host, found through the room code.
// onStage(stage, diag) reports progress: finding, gathering, waiting,
// linking, online, noroom, blocked.
export class RtcTransport {
  constructor(code, name, onStage) {
    this.code = normCode(code);
    this.name = name;
    this.onStage = onStage;
    this.fails = 0;
  }
  stage(s) { this.stageName = s; this.onStage?.(s, this.diag); }

  async open(h) {
    let pc;
    const myTry = (this.try = (this.try || 0) + 1);
    const alive = () => this.try === myTry && !this.closed;
    this.closed = false;
    try {
      this.stage('finding');
      const room = await rest('GET', `gameRooms/${this.code}`);
      if (!room) { this.stage('noroom'); return; }
      pc = new RTCPeerConnection({ iceServers: ICE });
      collect(pc);
      this.pc = pc;
      const ch = pc.createDataChannel('game', { ordered: true });
      const send = framed(ch);
      let opened = false;
      ch.onopen = () => { opened = true; this.fails = 0; this.send$ = send; this.stage('online'); h.onopen(); };
      const un = unframer(text => h.onmessage(text));
      ch.onmessage = e => un(e.data);
      const lost = () => { if (!alive()) return; this.send$ = null; try { pc.close(); } catch {} if (opened) h.onclose(); };
      ch.onclose = lost;
      pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) lost(); };
      this.stage('gathering');
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      this.diag = { mine: candTypes(pc) };
      this.stage('waiting');
      const doc = await rest('POST', `gameRooms/${this.code}/joins`, { fields: toFields({ offer: pc.localDescription.sdp, name: this.name || 'Runner', created: Date.now() }) });
      const path = `gameRooms/${this.code}/joins/${doc.name.split('/').pop()}`;
      sendLate(pc, path, 'ocands');
      let answer = null;
      for (let i = 0; i < 30 && !answer && alive(); i++) {
        await sleep(1000);
        answer = fromFields((await rest('GET', path))?.fields).answer;
      }
      if (!answer) { rest('DELETE', path).catch(() => {}); throw new Error('no answer'); }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      this.diag = { mine: candTypes(pc), host: [...new Set((answer.match(/ typ (\w+)/g) || []).map(x => x.slice(5)))] };
      this.stage('linking');
      let seen = 0;
      for (let i = 0; i < 40 && !opened && alive(); i++) {
        await sleep(500);
        if (i % 2 === 0) {
          const f = fromFields((await rest('GET', path).catch(() => null))?.fields);
          if (f.acands) seen = await addLate(pc, f.acands, seen);
        }
      }
      if (!opened && alive()) throw new Error('blocked');
    } catch (e) {
      if (pc) try { pc.close(); } catch {}
      if (!alive()) return;
      this.fails++;
      this.stage(this.fails >= 2 ? 'blocked' : 'retrying');
      if (this.fails < 2) setTimeout(() => alive() && this.open(h), 2500);
    }
  }
  retry(h) { this.fails = 0; this.open(h); }
  send(str) { this.send$?.(str); }
  close() { this.closed = true; this.try++; try { this.pc?.close(); } catch {} }
}
