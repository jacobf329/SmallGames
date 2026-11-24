# Leftover Uprising

Co-op tower defense for phones, 1 to 8 cooks. The food has come alive and is
marching through the kitchen to the back door; every escapee costs lives.

**Draft status:** fully playable, placeholder art (emoji and shapes). Art,
music and a polish pass come next.

## The design in one screen

- **Everyone starts the same.** Every tower begins as a blank **Prep Station**.
  You spend gold to send it down one of five trees: **Heat**, **Chop**,
  **Cold**, **Sticky**, **Service**. Anyone can buy anything.
- **Mastery.** Gold you spend in a tree is your mastery there: cheaper upgrades
  (4% per level), stronger towers (6% per level), and the tier-4 towers need
  mastery 2. Nobody can afford to master everything, so cooks specialise by
  choice.
- **The food adapts.** The director (`js/director.js`) watches the team's
  damage mix. Lean too hard on one type (over 40% of team damage) and the next
  waves bring food that shrugs it off, with a warning toast. Gentle solo, hard
  at 5 to 8 cooks.
- **Combos need two trees.** Freeze (Cold) then Chop = **Shatter** (x2.2).
  Syrup (Sticky) then Heat = **Caramelize** (stun + bonus). Chilled food takes
  extra Chop. Service towers only boost towers of *other* trees.
- **Team size scales everything.** Doors open (1 / 2 at 2-4 cooks / 3 at 5-8),
  enemy numbers and boss toughness rise, more food families arrive at once.
  Solo, the director only sends families your towers can actually hurt, and
  bosses don't hard-counter you, so one strategy can win.
- 30 waves, bosses at 10 (Wedding Cake), 20 (Roast Turkey), 30 (Giant Pizza),
  then endless.

## Where it lives

- **Party Pad** (jteef.com, the TV + phones platform) is the main way to play
  with friends: `public/js/games/leftover.js` in the JTEEF repo runs this
  engine on the TV and turns phones into controllers. The engine files there
  (`public/games/leftover/js/`) are copies of `leftover/js/` here: change them
  here, run the balance test, then copy them across.
- **jteef.com/play/leftover** is the solo practice build:
  `node leftover/tools/bundle.mjs --solo` -> `dist/leftover-uprising-solo.html`.

## Play

- `node leftover/tools/bundle.mjs` builds `dist/leftover-uprising.html`, one
  self-contained file. **Play solo** works anywhere (add AI cooks in the lobby
  to try a 4- or 8-cook kitchen). **Host online** needs a real web host such as
  jteef.com/play/leftover: the host's phone runs the game and friends join with
  a 4-letter code over WebRTC (same Firestore mailbox as Turbo Surfers and
  Blockout Arena).
- During development: serve the repo (`npx serve` or `python3 -m http.server`)
  and open `leftover/index.html`.

## Files

```
js/data.js      every number: map, trees, towers, food, families, scaling
js/director.js  builds waves for the team size and reacts to the team's mix
js/game.js      the simulation: towers, food, statuses, combos, gold, lives
js/ai.js        AI cooks (lobby fillers, and the balance test's players)
js/session.js   the host: lobby, snapshots to phones, requests from phones
js/main.js      phone client: screens, input, sheet, team panel, HUD
js/render.js    2D canvas renderer (placeholder art lives here)
js/rtc.js, net.js   online rooms (shared with Blockout Arena)
tools/simtest.mjs   balance test: AI kitchens of 1-8 cooks, diverse vs one-tree
tools/trace.mjs     one game wave by wave
tools/sessiontest.mjs  two fake phones against a host
```

## Balance snapshot (AI cooks, Normal, `node leftover/tools/simtest.mjs 5`)

| Team | Mixed trees | Everyone on one tree |
| --- | --- | --- |
| 1 cook | reaches wave ~24, wins some | n/a |
| 2 cooks | reaches wave 30 | dies ~wave 11 |
| 4 cooks | wins | dies ~wave 11 |
| 6 cooks | reaches wave 30, wins some | dies ~wave 7 |
| 8 cooks | reaches wave 30 (Pizza) | dies ~wave 8 |

The AI cooks are simple; people should do better. Tune in `js/data.js`.
