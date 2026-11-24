// Thin WebSocket client with auto-reconnect and a latency estimate.

export class Net extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.ready = false;
    this.latency = 0;
    this.clockOffset = 0;      // serverNow - clientNow
    this.reconnectIn = 0;
    this._pingSeq = 1;
    this._pings = new Map();
    this._retry = 0;
    this._closedByUs = false;
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  // Online play swaps the WebSocket for another transport (rtc.js): anything
  // with open({ onopen, onmessage, onclose }), send(text) and close().
  useTransport(t) { this.transport = t; }

  connect() {
    this._closedByUs = false;
    if (this.transport) {
      if (this._tOpen) return;
      this._tOpen = true;
      this.transport.open({ onopen: () => this._opened(), onmessage: (text) => this._text(text), onclose: () => { this._tOpen = false; this._closed(); } });
      return;
    }
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    let ws;
    try { ws = new WebSocket(this.url()); } catch { this._scheduleRetry(); return; }
    this.ws = ws;
    ws.onopen = () => this._opened();
    ws.onclose = () => this._closed();
    ws.onerror = () => { /* onclose follows */ };
    ws.onmessage = (e) => this._text(e.data);
  }

  _opened() {
    this.ready = true;
    this._retry = 0;
    this.emit('open');
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => this.ping(), 2000);
    this.ping();
  }
  _closed() {
    this.ready = false;
    clearInterval(this._pingTimer);
    this.emit('close');
    if (!this._closedByUs) this._scheduleRetry();
  }
  _text(data) {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'pong') {
      const sent = this._pings.get(m.c);
      if (sent) {
        this._pings.delete(m.c);
        const rtt = performance.now() - sent;
        this.latency = this.latency ? this.latency * 0.7 + rtt * 0.3 : rtt;
        this.clockOffset = (m.now + this.latency / 2) - Date.now();
      }
      return;
    }
    this.emit(m.t, m);
    this.emit('*', m);
  }

  close() {
    this._closedByUs = true;
    clearTimeout(this._retryTimer);
    clearInterval(this._pingTimer);
    this.ready = false;
    this._tOpen = false;
    this.transport?.close();
    this.ws?.close();
  }

  _scheduleRetry() {
    this._retry = Math.min(this._retry + 1, 6);
    const delay = Math.min(500 * this._retry, 3000);
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => this.connect(), delay);
  }

  ping() {
    const c = this._pingSeq++;
    this._pings.set(c, performance.now());
    if (this._pings.size > 8) this._pings.delete(this._pings.keys().next().value);
    this.send({ t: 'ping', c });
  }

  send(obj) {
    if (this.transport) { if (!this.ready) return false; this.transport.send(JSON.stringify(obj)); return true; }
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); return this; }
}
