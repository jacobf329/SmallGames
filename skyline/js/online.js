// Skyline Hustle - online play with the host's phone as the server.
//
// The host's browser runs the room (room.js: lobby, the authoritative city,
// speed, saves) exactly as the LAN server does. Friends' phones connect to it
// directly over WebRTC data channels. The only thing in the cloud is a tiny
// "mailbox" in Firestore used to swap connection details:
//
//   gameRooms/{CODE}                     the host's room (created when hosting)
//   gameRooms/{CODE}/joins/{id}          a friend's offer; the host writes back an answer
//
// A join costs a handful of document reads and writes. No Firebase library:
// plain REST calls with the site's public web API key. Google's public STUN
// server helps phones on different networks find each other; there is no
// relay server, so a few strict networks (some mobile data, some work wifi)
// can't connect directly.

const FIRESTORE = {
  project: 'campaign-e0a68',
  apiKey: 'AIzaSyAJMmGnR-izbXyriN6iWdip4cgXhWmi-fQ',
};
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';        // no I or O
const CHUNK = 15000;

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
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404) return null;
  if (!r.ok) { const e = new Error(`signal ${r.status}`); e.status = r.status; throw e; }
  return r.status === 204 ? {} : r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const onlineSupported = () => typeof RTCPeerConnection !== 'undefined' && typeof fetch !== 'undefined';
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

// ------------------------------------------------------------- WebRTC ----
async function gathered(pc, ms = 3000) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise(res => {
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
// Data channels have message size limits: split big messages, rejoin them.
function framed(ch) {
  let seq = 0;
  return str => {
    if (ch.readyState !== 'open') return;
    if (str.length <= CHUNK) return ch.send(str);
    const id = ++seq, n = Math.ceil(str.length / CHUNK);
    for (let i = 0; i < n; i++) ch.send(`\u0001${id}|${i}|${n}|${str.slice(i * CHUNK, (i + 1) * CHUNK)}`);
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
        await rest('POST', `gameRooms?documentId=${code}`, { fields: toFields({ game: 'skyline', host: this.name, created: Date.now() }) });
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
        }
        this.onStatus?.('online');
      } catch (e) { this.onStatus?.('offline'); }
      await sleep(2500);
    }
  }

  async accept(id, offer) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.peers.set(id, { pc });
    let h = null;
    pc.ondatachannel = ev => {
      const ch = ev.channel;
      const send = framed(ch);
      ch.onopen = () => {
        h = this.room.connect({ send, close: () => pc.close() });
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
  }

  async stop() {
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

// The host's own phone talks to its room directly, no network involved.
export class LocalNet {
  constructor(room, onMessage, onStatus) {
    this.room = room;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.h = null;
  }
  connect(hello) {
    this.h = this.room.connect({ send: str => setTimeout(() => this.onMessage(JSON.parse(str))), close: () => {} });
    this.h.message(JSON.stringify({ t: 'hello', ...hello }));
    this.onStatus?.('online');
  }
  send(msg) { this.h?.message(JSON.stringify(msg)); }
  close() { this.h?.close(); this.h = null; }
}

// ------------------------------------------------------------- guest ----
// A friend's phone: same interface as the LAN Net (connect / send / close),
// reconnecting by itself if the link drops.
export class RtcNet {
  constructor(code, onMessage, onStatus) {
    this.code = normCode(code);
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.hello = null;
    this.closed = false;
    this.queue = [];
    this.send$ = null;
    this.fails = 0;
  }

  connect(hello) {
    this.hello = hello;
    this.closed = false;
    this.open();
  }

  async open() {
    if (this.closed) return;
    this.onStatus?.('connecting');
    let pc;
    try {
      const room = await rest('GET', `gameRooms/${this.code}`);
      if (!room) { this.onStatus?.('noroom'); return; }
      pc = new RTCPeerConnection({ iceServers: ICE });
      this.pc = pc;
      const ch = pc.createDataChannel('game', { ordered: true });
      const send = framed(ch);
      ch.onopen = () => {
        this.fails = 0;
        this.send$ = send;
        this.onStatus?.('online');
        send(JSON.stringify({ t: 'hello', ...this.hello }));
        for (const m of this.queue.splice(0)) send(m);
      };
      const un = unframer(text => { let m; try { m = JSON.parse(text); } catch { return; } this.onMessage(m); });
      ch.onmessage = e => un(e.data);
      ch.onclose = () => this.dropped(pc);
      pc.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) this.dropped(pc); };
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const doc = await rest('POST', `gameRooms/${this.code}/joins`, { fields: toFields({ offer: pc.localDescription.sdp, name: this.hello?.name || 'Player', created: Date.now() }) });
      const id = doc.name.split('/').pop();
      // Wait for the host's answer.
      let answer = null;
      for (let i = 0; i < 30 && !answer && !this.closed; i++) {
        await sleep(1000);
        const d = await rest('GET', `gameRooms/${this.code}/joins/${id}`);
        answer = fromFields(d?.fields).answer;
      }
      if (!answer) { pc.close(); rest('DELETE', `gameRooms/${this.code}/joins/${id}`).catch(() => {}); throw new Error('no answer'); }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      // If the link never opens, the networks can't see each other.
      setTimeout(() => { if (this.pc === pc && !this.send$) { this.onStatus?.('blocked'); this.dropped(pc); } }, 15000);
    } catch (e) {
      this.fails++;
      this.onStatus?.(this.fails > 2 ? 'blocked' : 'offline');
      if (pc) try { pc.close(); } catch {}
      if (!this.closed) setTimeout(() => this.open(), 3000);
    }
  }

  dropped(pc) {
    if (this.pc !== pc || this.closed) return;
    this.pc = null;
    this.send$ = null;
    try { pc.close(); } catch {}
    this.onStatus?.('offline');
    setTimeout(() => this.open(), 2000);
  }

  send(msg) {
    const str = JSON.stringify(msg);
    if (this.send$) this.send$(str);
    else if (this.queue.length < 50) this.queue.push(str);
  }

  close() {
    this.closed = true;
    try { this.pc?.close(); } catch {}
  }
}
