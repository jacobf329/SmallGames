# Turbo Surfers

An endless-runner kart racer for phones. Subway-Surfers movement — three-lane
dodging, jumping, sliding — crossed with Mario-Kart racing: item boxes, homing
shells, banana slicks, lightning, star power, slipstreaming and risky shortcuts.

Up to **12 players race at once over your local wifi**. Nobody installs
anything: one person runs the server, everybody else opens a URL on their
phone.

Crucially, hitting an obstacle does **not** end your run the way it does in
Subway Surfers — you get **knocked back**, lose speed, drop a few coins, and
keep racing. Every wipeout costs you position, not the game.

---

## Quick start

```bash
node server/index.js          # needs Node 18+, no npm install, zero dependencies
```

The server prints the addresses to hand around:

```
====================================================
  TURBO SURFERS  -  LAN race server is up
====================================================
  Players (max 12) open one of these on their phone:

    http://192.168.1.24:8080      [en0]
```

Everyone opens that URL, types a name, and joins. The first person in becomes
the host and gets the track / bot / item controls. Use a **race code** (any
short word) if you want more than one race running on the same server.

Options:

```bash
node server/index.js --port 3000
PORT=3000 node server/index.js
npm start
```

## Play solo first

Want to try the feel before rounding up twelve people?

```bash
node server/index.js     # then open http://localhost:8080/solo.html
```

Practice mode runs the **same** race the server runs — same physics, track
generation, bots and items — entirely in the browser tab, with no networking.
It is also what `tools/bundle.mjs` inlines into a single self-contained HTML
file you can open straight off a phone or host anywhere:

```bash
node tools/bundle.mjs    # -> dist/turbo-surfers-solo.html (~105 KB, no assets)
```

## How to play

| Action | Phone | Keyboard |
| --- | --- | --- |
| Change lane | swipe left / right | ← → or A D |
| Jump | swipe up | ↑ / W / space |
| Slide | swipe down | ↓ / S |
| Use item | tap the item button (or tap anywhere) | E / F / shift / enter |

- **Coins** raise your top speed (up to 40 of them count) and are your score.
- **? boxes** give an item. What you get depends on your position — leaders get
  bananas and shields, the back of the pack gets lightning, stars and rockets.
- **Ramps** on the outer lanes fling you onto a **shortcut rail**: three lanes
  instead of five, obstacles nearly back to back, and you cover ground 34%
  faster while you are up there. Clean runs win races.
- **Boost pads** on the road are free speed if you stay grounded over them.
- Tuck in **behind** a rival within ~14 m for a slipstream.
- Wipe out and you drop to 7.5 m/s, get shoved 4.5 m backwards and lose coins.
  A shield eats one hit; a star or rocket smashes straight through.

### Items

| Item | What it does |
| --- | --- |
| Turbo | Instant speed burst |
| Homer | Flies forward and homes on the nearest runner ahead |
| Grease | Drops behind you; spins out whoever runs over it |
| Bubble | Absorbs one wipeout for 14 s |
| Zap | Slows *everyone* ahead of you for 3.2 s |
| Blaze | Invincible and fast — plough through obstacles and rivals |
| Rocket | Auto-pilot rocket ride for the truly desperate |
| Magnet | Vacuums up nearby coins |
| Coins | Ten coins, which means more top speed |

### Host controls

- **Track**: Sprint (1100 m) / Classic (1800 m) / Marathon (2800 m)
- **Bots**: fill empty slots up to 12, at Easy / Normal / Rude skill
- **Items**: on or off (off = a pure dodging race)

A race ends when everyone finishes, or 20 s after the winner crosses the line.

## How it works

```
server/
  index.js    HTTP static server + room manager + 60 Hz simulation loop
  ws.js       RFC-6455 WebSocket server written from scratch (no deps)
shared/       imported by BOTH the server and the browser
  constants.js  every tuning number
  rng.js        seeded RNG (mulberry32)
  track.js      deterministic procedural track: obstacles, coins, shortcuts
  physics.js    the single movement/collision model
  items.js      item table, weighted by race position
  room.js       lobby, countdown, race, items, projectiles, results
  bots.js       AI runners; they send the same inputs a phone does
tools/
  bundle.mjs    inlines practice mode into one standalone HTML file
client/
  index.html  connect / lobby / race / results screens
  solo.html   offline practice mode against bots
  style.css   phone-first UI, safe-area aware
  js/main.js  prediction, reconciliation, interpolation, HUD
  js/solo.js  drives a Room locally for offline practice
  js/render.js pseudo-3D canvas renderer
  js/input.js  swipe + keyboard
  js/net.js    WebSocket with auto-reconnect and latency estimate
  js/audio.js  synthesised sound effects (no audio assets)
```

**The server is authoritative.** Phones send intent (`target lane`, `jump`,
`slide`, `use item`); the server simulates all runners at 60 Hz and broadcasts
snapshots at 20 Hz. Each snapshot also carries a private block for the player
it is sent to, so the phone can run the *same* `shared/physics.js` locally,
predict its own runner, and reconcile against authority — small errors blend
away, big ones snap. Other runners are interpolated ~95 ms in the past.

**The track is never transmitted.** The server picks a seed; every client
rebuilds the identical course from `shared/track.js`. A whole race is a
32-bit number.

**Nothing is downloaded.** No npm packages, no images, no audio files, no
fonts — which is the point when twelve people are joining a wifi network that
may not have internet.

Handy details:

- Disconnect mid-race and a bot takes over your runner so the race keeps its
  shape; you rejoin for the next one.
- Join while a race is running and you spectate from the leader's shoulder
  until the next race.
- `/api/rooms` and `/api/health` expose server state as JSON.
- `window.__TS` in the browser console exposes `{ G, net, renderer, sfx }`.

## Tuning

Everything that matters lives in `shared/constants.js` — speeds, knockback,
jump height, item durations, shortcut payoff, race lengths. Changing a number
there changes it for the server, the clients and the bots at once, so nothing
can drift out of sync.
