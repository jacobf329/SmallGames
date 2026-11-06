# First Roll

A co-op, turn-based RPG that teaches the 2024 fifth-edition rules by playing
them. Every roll shows its math, and every number links to the rule behind it.
Scope and roadmap: [SCOPE.md](SCOPE.md).

**Phase 0 (this):** one fight. A Fighter and a Rogue against three Goblin
Warriors, played by 1–2 people on their own phones, with AI companions in any
empty hero slot.

## Run it

```bash
node tools/serve.mjs                # Node 18+, no npm install
# open http://localhost:8090/?signal=http://localhost:8090/signal
```

`?signal=` points online play at the dev server's stand-in for Firestore, so
you can host in one browser and join from another (use a private window, or a
second browser, so each has its own storage). **Play solo** needs nothing at
all.

## Test it

```bash
npm test                            # rules engine + party room (node --test)
node tools/e2e.mjs                  # two phones, real WebRTC, a whole fight
node tools/e2e.mjs --bundle         # the same against dist/first-roll.html
```

The e2e test uses the pre-installed Playwright and Chromium. Ana hosts and
plays the Fighter, Ben joins by link and plays the Rogue, and both follow the
Coach until the fight ends. The test then checks that both phones agree, that
the AI never played for a connected player, and that Ben gets his seat back
after a reload.

## Build and deploy

```bash
node tools/bundle.mjs               # -> dist/first-roll.html (one file, ~136 KB)
```

To put it on jteef.com/play:

1. Copy `dist/first-roll.html` to `jteef/public/play/first-roll/index.html`.
2. Add `'firstroll'` to the allowed games for `gameRooms` in
   `jteef/dnd/firestore.rules`, and deploy the rules:
   `request.resource.data.game in ['skyline', 'turbo', 'arena', 'firstroll']`.
   Without this, online parties can't be created (solo still works).
3. Add the tile to `GAMES` in `jteef/public/play/index.html`:
   `{ emoji:"🎲", name:"First Roll", desc:"Learn the 2024 fifth-edition rules together: make heroes, roll the dice, and see why every roll works. Solo, or co-op with a friend.", url:"/play/first-roll/" }`

## How it works

```
src/rules/     the rules engine: pure, seeded, JSON state, no DOM or network
  rng.js         mulberry32 dice (state is saveable; r.script forces rolls in tests)
  data.js        SRD 5.2.1 subset: Fighter, Rogue, Human, Halfling, Soldier,
                 Criminal, weapons and masteries, Goblin Warrior
  character.js   choices -> numbers, every number keeps its parts
  grid.js        5-ft squares, movement costs, pathfinding
  combat.js      initiative, turns, attacks, Advantage/Disadvantage, Sneak
                 Attack, Vex/Sap, Opportunity Attacks, Help, Dodge, Dash,
                 Disengage, Second Wind, 0 HP, death saves, stabilizing
  ai.js          monsters, AI companions and the Coach (one brain)
  glossary.js    plain-language rules for every rule key
src/game/room.js the party: seats, lobby, turn control, AI turns, reaction
                 prompts, saves. Runs on the host's phone, transport-free
src/net/online.js WebRTC + Firestore signalling, ported from Skyline Hustle
src/ui/        main.js (screens), board.js (SVG grid), explain.js (Why? text)
tools/         serve.mjs, bundle.mjs, e2e.mjs
```

- **The engine explains itself.** Each resolution is appended to
  `battle.log` as a record of what was rolled, what was added and which rule
  applied. The roll cards, the combat log, the Why? sheet and the
  end-of-fight recap are all rendered from those records.
- **Those records are also the network protocol.** Phones send intents
  (`{ a: 'attack', target: 'g2', attack: 'longsword' }`). The host's room
  checks each one against the rules and whose turn it is, resolves it, and
  broadcasts the new state. Dice are rolled only on the host.
- **The AI plays by the same rules.** Monster and companion turns go through
  the same `perform()` as a person's tap, and the Coach's tip is the AI's
  choice for your hero, explained in words.
- **Dropping out is fine.** Seats have tokens. A player whose phone drops
  is handed to the AI after 8 s, and gets their hero back when they rejoin.
  The host autosaves after every action, so **Continue your party** resumes
  the fight.
- `window.__FR` in the console exposes the app state (and the room, on the host).

Rules content: SRD 5.2.1 by Wizards of the Coast LLC, CC-BY-4.0 (see the
in-game Credits).
