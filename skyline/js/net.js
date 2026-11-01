// Skyline Hustle - LAN client connection: one WebSocket to server.mjs that
// reconnects by itself (phones lock, wifi blips). Messages are JSON.

export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.hello = null;
    this.closed = false;
    this.queue = [];
  }

  connect(hello) {
    this.hello = hello;
    this.closed = false;
    this.open();
  }

  open() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.onStatus?.('online');
      ws.send(JSON.stringify({ t: 'hello', ...this.hello }));
      for (const m of this.queue.splice(0)) ws.send(m);
    };
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.onStatus?.('offline');
      if (!this.closed) setTimeout(() => this.open(), 1500);
    };
    ws.onerror = () => ws.close();
  }

  send(msg) {
    const str = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) this.ws.send(str);
    else if (this.queue.length < 50) this.queue.push(str);
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }
}

export async function lanAvailable() {
  if (!/^https?:$/.test(location.protocol)) return null;
  try {
    const r = await fetch('/api/lan', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
