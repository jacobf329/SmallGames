# First Roll

A co-op, turn-based fantasy RPG built on the 2024 fifth-edition rules (SRD
5.2.1). Create a hero, team up with friends or AI companions, make choices
and skill checks in story scenes, and fight tactical battles on a grid. Any
roll can be opened to see its dice and modifiers. Scope and roadmap: [SCOPE.md](SCOPE.md).

**Early access: two chapters.**

| Chapter | What happens |
| --- | --- |
| 1 · The Flour Road | Escort a miller's cart to market: pick a route (the woods mean a Perception check), survive a goblin ambush, get paid in Dunmarket |
| 2 · The Goblin Camp | Follow the stolen flour: sneak in (group Stealth) or make demands (Intimidation), fight the Goblin Boss and its guards, bring the carts home |

**Progression.**
- **XP and levels:** fights and finished jobs give XP. Heroes reach level 2 in Dunmarket and level 3 by the end. Level-ups add Hit Points and the real class features:
  - Fighter: Action Surge, then Champion with Improved Critical.
  - Rogue: Cunning Action, then Steady Aim, 2d6 Sneak Attack and Thief.
  - Cleric: Channel Divinity (Divine Spark), then Life Domain with Disciple of Life, and Aid.
  - Wizard: more slots, then Evoker with Potent Cantrip, Scorching Ray and Misty Step.
- **Between fights:** HP, spell slots and limited uses carry over. A Short Rest spends Hit Point Dice and recovers Second Wind, Action Surge, Channel Divinity and Arcane Recovery. A stop in town is a Long Rest.
- **Gold and loot:** foes drop gold and Potions of Healing, which anyone drinks or gives as a Bonus Action. The boss also drops a +1 Weapon and a Cloak of Protection.
- **The merchant** sells potions and armor (studded leather, chain mail, splint).
- **Your hero is saved on your phone** (class, XP and gear). Bring them into anyone's party. Newcomers mid-campaign start at the party's level.

- **1–4 players**, each on their own phone, with **AI companions** filling the
  party (Auto keeps at least three heroes). Fights scale to the party's size
  with the 2024 XP budget.
- **Heroes:** Fighter, Rogue, Cleric and Wizard, with all 9 SRD species and the
  4 SRD backgrounds. Every species trait that matters in a fight works:
  - Halfling Luck
  - Dwarven Toughness
  - the Human Tough feat
  - Orc Adrenaline Rush and Relentless Endurance
  - Goliath Fire's Burn
  - Dragonborn Breath Weapon
  - the Wood Elf's 35 ft speed
  - Gnomish Cunning
  - Tiefling Fire Bolt
- **Spells:**
  - Cantrips: Fire Bolt, Ray of Frost, Sacred Flame, Spare the Dying
  - Level 1: Healing Word, Cure Wounds, Guiding Bolt, Magic Missile, Burning Hands
  - Magic Initiate's free casts
  - The 2024 one-spell-slot-per-turn rule

## Run it

```bash
node tools/serve.mjs                # Node 18+, no npm install
# open http://localhost:8090/?signal=http://localhost:8090/signal
```

`?signal=` points online play at the dev server's stand-in for Firestore, so
you can host in one browser and join from another. Use a private window or a
second browser, so each has its own storage. **Play solo** needs nothing at all.

## Test it

```bash
npm test                            # rules, spells, progression, room, campaign (46 tests)
node tools/e2e.mjs                  # two phones, real WebRTC, the whole campaign
node tools/e2e.mjs --bundle         # the same against dist/first-roll.html
```

The e2e test uses the pre-installed Playwright and Chromium:

1. Ana hosts and builds a Fighter; Ben joins by link and builds a Cleric. One AI companion makes up the party.
2. They vote, roll checks, rest, shop in town and fight both battles; on their turns each phone plays the way an AI companion would (`window.__FR.auto()`).
3. Everyone must reach level 3 by the end.
4. The test checks that both phones reach the end and that the AI never played for a connected player.
5. Ben reloads and must get his seat back.

## Build and deploy

```bash
node tools/bundle.mjs               # -> dist/first-roll.html (one file, ~270 KB)
```

To put it on jteef.com/play:

1. Copy `dist/first-roll.html` to `jteef/public/play/first-roll/index.html`.
2. `jteef/dnd/firestore.rules` must allow `'firstroll'` in `gameRooms` (done in
   jteef PR #1), with the rules deployed. Without them, online parties can't be
   created; solo still works.
3. The tile in `jteef/public/play/index.html` (also in PR #1).

## How it works

```
src/rules/     the rules engine: pure, seeded, JSON state, no DOM or network
  rng.js         mulberry32 dice (state is saveable; r.script forces rolls in tests)
  data.js        SRD 5.2.1 subset: classes, species, backgrounds, feats, weapons,
                 masteries, armor, spells, Goblin Warrior and Goblin Boss
  character.js   choices ("spec") -> creature; validateSpec guards what phones send
  grid.js        5-ft squares, movement costs, pathfinding, 15-ft cones
  combat.js      initiative and surprise, turns, attacks, Advantage/Disadvantage,
                 saves, spells and slots, cones, Multiattack, Redirect Attack,
                 species traits, Opportunity Attacks, Help, 0 HP and death saves
  ai.js          monsters and AI companions (one brain)
  glossary.js    plain-language rules for every rule key and spell
src/game/
  campaign.js    chapters 1-2: scenes, choices, checks, fights, companions
  encounters.js  maps and foes sized to the party
  room.js        the party: seats, heroes and their progress, gold/potions/items,
                 votes, checks, rests, town stops and the shop, fights, XP and
                 loot, turn control, AI turns, reaction prompts, saves.
                 Runs on the host's phone
src/net/online.js WebRTC + Firestore signalling, ported from Skyline Hustle
src/ui/        main.js (screens), builder.js, story.js, sheet.js,
               board.js (SVG grid), explain.js (Why? text), dom.js
tools/         serve.mjs, bundle.mjs, e2e.mjs
```

- **Every roll is a record.** Each resolution is appended to `battle.log`
  with what was rolled, what was added and which rule applied. The roll
  cards, the combat log and the Why? breakdowns are all rendered from those
  records.
- **Those records are also the network protocol.** Phones send intents
  (`{ a: 'cast', spell: 'guiding-bolt', target: 'f2' }`). The host's room
  checks each one against the rules and whose turn it is, resolves it, and
  broadcasts the new state. Dice are rolled only on the host.
- **The AI plays by the same rules.** Monster and companion turns go through
  the same `perform()` as a person's tap.
- **Dropping out is fine.** Seats have tokens. A player whose phone drops is
  handed to the AI after 8 s and gets their hero back when they rejoin. A
  newcomer mid-campaign can build a hero from the story screen. The host
  autosaves after every action, so **Continue your party** resumes where you were.
- `window.__FR` in the console exposes the app state (and the room, on the host).

Rules content: SRD 5.2.1 by Wizards of the Coast LLC, CC-BY-4.0 (see the
in-game Credits).
