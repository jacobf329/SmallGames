// Two-phone co-op test: two separate browser contexts (separate storage, like
// two phones) host and join a party over real WebRTC, with signalling through
// the dev server's local Firestore stand-in. Ana hosts and builds a Fighter,
// Ben joins by link and builds a Cleric, one AI companion joins them, and they
// play the whole early-access campaign: votes, skill checks and both fights,
// each taking the Coach's advice on their own turns. Both phones must reach
// the end, the AI must never play for a connected player, and Ben must get
// his seat back after a reload.
//
//   node tools/e2e.mjs [--bundle] [--shots dir]
//
// --bundle tests dist/first-roll.html (run tools/bundle.mjs first) instead of the sources.

import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const shotsAt = arg('--shots');

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

// Chapter 1: build a hero with the builder (pick the class, then Next through the rest).
async function build(p, cls) {
  await p.click('#btn-build');
  await p.click(`[data-cls="${cls}"]`);
  for (let i = 0; i < 5; i++) await p.click('#build-next');
  await p.click('#build-next');                       // "Done: this is my hero"
  await p.waitForSelector('#scr-lobby.active');
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

  await build(ana, 'fighter');
  await build(ben, 'cleric');
  await ana.waitForFunction(() => window.__FR.S.seats.filter((s) => s.spec).length === 2);
  if (shotsAt) await ben.screenshot({ path: `${shotsAt}/coop-lobby-ben.png`, fullPage: true });
  if (await ben.isVisible('#btn-start')) fail('a guest should not see Start');
  await ana.click('[data-comp="1"]');
  await ana.waitForFunction(() => window.__FR.S.party.length === 3);
  await ana.click('#btn-start');
  await Promise.all([ana.waitForSelector('#scr-story.active'), ben.waitForSelector('#scr-story.active')]);
  console.log('both heroes built; the story begins on both phones');

  const turns = { Ana: 0, Ben: 0 };
  const done = { votes: 0, checks: 0, fights: 0, retries: 0 };
  let reactions = 0, shot = false;
  const state = (p) => p.evaluate(() => ({ phase: window.__FR.S?.phase, scene: window.__FR.S?.story?.scene, me: window.__FR.me }));
  for (let i = 0; i < 4000; i++) {
    const a = await state(ana);
    if (a.phase === 'story' && a.scene === 'c3-end') break;
    for (const p of [ana, ben]) {
      const st = await state(p);
      if (st.phase === 'story') {
        if (p === ana && await p.$('#s-continue')) { await p.click('#s-continue'); continue; }
        if (await p.$('#s-roll')) { await p.click('#s-roll'); done.checks++; continue; }
        const claim = await p.$(`[data-claim="${st.me}"]`);
        if (claim && p === ana) { await claim.click(); continue; }
        const roll = await p.$(`[data-roll="${st.me}"]`);
        if (roll) { await roll.click(); done.checks++; continue; }
        if (!(await p.$('.choice.on')) && await p.$('[data-vote]')) { await (await p.$$('[data-vote]'))[0].click(); done.votes++; }
      } else if (st.phase === 'battle') {
        if (await p.$('#over:not(.hidden)')) {
          if (p === ana) {
            if (await p.$('#btn-cont')) { done.fights++; await p.click('#btn-cont'); }
            else if (await p.$('#btn-retry')) { done.retries++; await p.click('#btn-retry'); }
          }
          continue;
        }
        if (await p.$('#react:not(.hidden) #btn-react-yes')) { await p.click('#btn-react-yes'); reactions++; continue; }
        if (await p.evaluate(() => document.body.dataset.myturn === '1')) {
          if (!shot && p === ben) { await p.waitForTimeout(400); if (shotsAt) await p.screenshot({ path: `${shotsAt}/coop-ben-turn.png` }); shot = true; }
          const c = await p.$('#btn-coach');
          if (c) await c.click(); else await p.click('[data-act="end"]');
          turns[p.label]++;
          await p.waitForTimeout(120);
        }
      }
    }
    await ana.waitForTimeout(100);
  }
  await ben.waitForFunction(() => window.__FR.S?.story?.scene === 'c3-end', null, { timeout: 10000 });
  console.log(`campaign finished: ${done.votes} votes, ${done.checks} check rolls, ${done.fights} fights won, ${done.retries} retries; Ana took ${turns.Ana} battle actions, Ben ${turns.Ben}; ${reactions} reaction prompts`);
  if (!turns.Ana || !turns.Ben) fail('both players should have acted in battle');
  if (done.fights !== 2) fail(`expected 2 fights won, got ${done.fights}`);
  const takeovers = await ana.evaluate(() => window.__FR.room.aiForPlayers);
  if (takeovers) fail(`the AI played ${takeovers} steps for a connected player`);
  if (shotsAt) await ana.screenshot({ path: `${shotsAt}/coop-end-ana.png`, fullPage: true });

  // Ben drops and rejoins with his saved seat token.
  const pidBefore = await ben.evaluate(() => window.__FR.me);
  await ben.reload();
  await ben.fill('#in-name', 'Ben');
  await ben.click('#btn-join-link');
  await ben.waitForFunction(() => window.__FR.me && window.__FR.S, null, { timeout: 30000 });
  const pidAfter = await ben.evaluate(() => window.__FR.me);
  if (pidAfter !== pidBefore) fail(`rejoin should reclaim the seat (${pidBefore} -> ${pidAfter})`);
  else console.log('Ben reloaded and got his seat (and his Cleric) back');

  for (const p of [ana, ben]) if (p.errors.length) fail(`${p.label} console errors: ${p.errors.slice(0, 5).join(' | ')}`);
  if (!process.exitCode) console.log('PASS');
} catch (e) {
  fail(e.stack || e.message);
} finally {
  await browser.close();
  server.close();
}
