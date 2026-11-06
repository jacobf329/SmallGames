// Two-phone co-op test: two separate browser contexts (separate storage, like
// two phones) host and join a party over real WebRTC, with signalling through
// the dev server's local Firestore stand-in. Ana hosts and plays the Fighter,
// Ben joins and plays the Rogue, and each takes the Coach's advice on their
// own turns until the fight ends. Then both screens must agree.
//
//   node tools/e2e.mjs [--bundle] [--shots dir]
//
// --bundle tests dist/first-roll.html (run tools/bundle.mjs first) instead of the sources.

import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const shotsAt = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

const { server, port } = await startServer({ port: 0, quiet: true });
const base = `http://localhost:${port}/${process.argv.includes('--bundle') ? 'dist/first-roll.html' : ''}`;
const signal = `signal=${encodeURIComponent(`http://localhost:${port}/signal`)}`;
const browser = await chromium.launch({
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'],
});

async function phone(name) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  // A 404 from the signalling mailbox is normal (the host deletes a join once
  // the link is open); any other failed request or console error is a bug.
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/signal/')) page.errors.push(`${r.status()} ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  page.label = name;
  return page;
}

try {
  const ana = await phone('Ana');
  const ben = await phone('Ben');

  // Ana hosts.
  await ana.goto(`${base}?${signal}`);
  await ana.fill('#in-name', 'Ana');
  await ana.click('#btn-host');
  await ana.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('lobby-code').textContent), null, { timeout: 15000 });
  const code = await ana.textContent('#lobby-code');
  console.log(`party code ${code}`);

  // Ben joins with the share link.
  await ben.goto(`${base}?join=${code}&${signal}`);
  await ben.fill('#in-name', 'Ben');
  await ben.click('#btn-join-link');
  await ben.waitForSelector('#seat-list li:nth-child(2)', { timeout: 30000 });
  await ana.waitForSelector('#seat-list li:nth-child(2)', { timeout: 10000 });
  console.log('Ben connected over WebRTC');

  await ana.click('[data-pick="fighter"]');
  await ben.waitForSelector('[data-pick="rogue"]');
  await ben.click('[data-pick="rogue"]');
  await ana.waitForFunction(() => document.querySelectorAll('.hero .btn[disabled]').length === 1);
  if (shotsAt) await ben.screenshot({ path: `${shotsAt}/coop-lobby-ben.png` });
  if (await ben.isVisible('#btn-start')) fail('a guest should not see Start');
  await ana.click('#btn-start');
  await Promise.all([ana.waitForSelector('#scr-battle.active'), ben.waitForSelector('#scr-battle.active')]);
  console.log('fight started on both phones');

  const turns = { Ana: 0, Ben: 0 };
  let reactions = 0, shot = false;
  for (let i = 0; i < 1500; i++) {
    const over = await ana.$('#over:not(.hidden)');
    if (over) break;
    for (const p of [ana, ben]) {
      if (await p.$('#react:not(.hidden) #btn-react-yes')) { await p.click('#btn-react-yes'); reactions++; continue; }
      if (await p.evaluate(() => document.body.dataset.myturn === '1')) {
        if (!shot && p === ben) { await p.waitForTimeout(400); if (shotsAt) await p.screenshot({ path: `${shotsAt}/coop-ben-turn.png` }); shot = true; }
        const c = await p.$('#btn-coach');
        if (c) await c.click(); else await p.click('[data-act="end"]');
        turns[p.label]++;
        await p.waitForTimeout(150);
      }
    }
    await ana.waitForTimeout(120);
  }
  await ben.waitForSelector('#over:not(.hidden)', { timeout: 10000 });
  const a = await ana.evaluate(() => ({ over: window.__FR.S.battle.over, seq: window.__FR.S.battle.seq, round: window.__FR.S.battle.round }));
  await ben.waitForFunction((seq) => window.__FR.S.battle.seq === seq, a.seq, { timeout: 5000 });
  const b = await ben.evaluate(() => ({ over: window.__FR.S.battle.over, seq: window.__FR.S.battle.seq, round: window.__FR.S.battle.round }));
  console.log(`result: ${a.over} in ${a.round} rounds; Ana took ${turns.Ana} actions, Ben ${turns.Ben}; ${reactions} reaction prompts answered`);
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`phones disagree: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  if (!turns.Ana || !turns.Ben) fail('both players should have acted');
  const takeovers = await ana.evaluate(() => window.__FR.room.aiForPlayers);
  if (takeovers) fail(`the AI played ${takeovers} steps for a connected player`);
  const rogueActs = await ana.evaluate(() => window.__FR.room.battle.log.filter((r) => r.by === 'rogue' && ['attack', 'move', 'check', 'action'].includes(r.kind)).length);
  console.log(`the Rogue's log: ${rogueActs} moves/attacks/actions, all from Ben's phone`);
  if (shotsAt) { await ana.screenshot({ path: `${shotsAt}/coop-over-ana.png` }); }

  // Ben drops and rejoins with his saved seat token.
  const pidBefore = await ben.evaluate(() => window.__FR.me);
  await ben.reload();
  await ben.fill('#in-name', 'Ben');
  await ben.click('#btn-join-link');
  await ben.waitForFunction(() => window.__FR.me, null, { timeout: 30000 });
  const pidAfter = await ben.evaluate(() => window.__FR.me);
  if (pidAfter !== pidBefore) fail(`rejoin should reclaim the seat (${pidBefore} -> ${pidAfter})`);
  else console.log('Ben reloaded and got his seat back');

  for (const p of [ana, ben]) if (p.errors.length) fail(`${p.label} console errors: ${p.errors.slice(0, 5).join(' | ')}`);
  if (!process.exitCode) console.log('PASS');
} catch (e) {
  fail(e.stack || e.message);
} finally {
  await browser.close();
  server.close();
}
