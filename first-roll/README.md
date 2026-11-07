# First Roll

A co-op, turn-based RPG that teaches the 2024 fifth-edition rules by playing
them. Every roll shows its math, and every number links to the rule behind it.
Scope and roadmap: [SCOPE.md](SCOPE.md).

**Phase 2: the whole campaign, chapters 0 to 8, from your first d20 to level 3.**

| Chapter | What you do | What it teaches |
| --- | --- | --- |
| 0 · Rolling the d20 | A hands-on dice lesson on your own phone while friends join | D20 Tests, modifiers vs DC, Advantage/Disadvantage, attack rolls vs AC, saves, Heroic Inspiration |
| 1 · Making your hero | A six-step builder in the lobby | Class → background (its +2/+1 and Origin feat) → species → standard array → increases → name |
| 2 · Your First Fight | Escort a flour cart, then a goblin ambush | Initiative, surprise, turns, attack rolls, damage |
| 3 · Weapon Mastery and Teamwork | Follow the trail to the Goblin Boss | Mastery, Help, group checks, healing, Multiattack, Redirect Attack |
| 4 · High Ground | Goblin archers behind a field wall, wolves through the gap | Cover, line of sight, Opportunity Attacks, Prone, Pack Tactics |
| 5 · Asking Around | Search the hut or talk to the shepherd's daughter, then a night's sleep | Skills, Long Rest, level 2 |
| 6 · Magic in the Cellar | Sneak in (or use the back door you found), cultists and skeletons | Spell slots, Concentration, saving throws, Vulnerability |
| 7 · Bad Air and Worse Company | Yellow mold, a Short Rest, a Giant Spider's nest and a Bugbear | Poisoned, Restrained, Grappled, Short Rest and Hit Point Dice, Undead Fortitude |
| 8 · The Barrow | Level 3 and a subclass, then Corva Lund and the dead she raised | Subclasses, upcasting, Turn Undead, Hold Person, talking a fight smaller |

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
- **Levels 1 to 3** with the 2024 features: Action Surge, Tactical Mind,
  Champion (Improved Critical, Remarkable Athlete); Cunning Action, Steady Aim,
  Thief; Channel Divinity (Divine Spark, Turn Undead), Life Domain (Disciple of
  Life, Preserve Life); Arcane Recovery, Evoker (Potent Cantrip).
- **Spells:**
  - Cantrips: Fire Bolt, Ray of Frost, Sacred Flame, Spare the Dying
  - Level 1: Healing Word, Cure Wounds, Guiding Bolt, Magic Missile, Burning Hands,
    Bless, Shield of Faith, Shield (a Reaction), Thunderwave, Command
  - Level 2: Scorching Ray, Misty Step, Aid, Hold Person, Spiritual Weapon, Lesser Restoration
  - Concentration, casting with a higher slot, Magic Initiate's free casts,
    and the 2024 one-spell-slot-per-turn rule
- **Conditions and terrain:** cover and line of sight, Prone, Restrained,
  Grappled, Frightened, Poisoned, Paralyzed, Incapacitated, Exhaustion, Hide,
  Shove. Monsters: wolves, skeletons, zombies, cultists, a Giant Spider, a
  Bugbear and a Cultist Fanatic.
- **Between fights** the party keeps its wounds, spent slots and uses. Short and
  Long Rests, Hit Point Dice, and a retry that puts everyone back as they were
  before the fight.
- **Rules book** (📖) with every rule and spell; a per-player tips toggle; an
  optional host turn timer (30, 60 or 90 seconds).

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
npm test                            # rules, spells, Phase 2 rules, room and campaign (node --test)
node tools/ui-smoke.mjs cleric      # every screen rendered through the whole campaign, no browser
node tools/e2e.mjs                  # two phones, real WebRTC, the whole campaign
node tools/e2e.mjs --bundle         # the same against dist/first-roll.html
```

`ui-smoke.mjs` runs the real screens against a stand-in DOM: a solo hero of the
class you name plus three AI companions, every target card and sheet drawn on
each of your turns. It catches broken screens, not layout.

The e2e test needs Playwright and Chromium:

1. Ana hosts and builds a Fighter; Ben joins by link and builds a Cleric. One AI companion makes up the party.
2. They vote, roll checks and saves, rest, and fight all six battles, following the Coach on their turns.
3. The test checks that both phones reach the end and that the AI never played for a connected player.
4. Ben reloads and must get his seat back.

## Build and deploy

```bash
node tools/bundle.mjs               # -> dist/first-roll.html (one file, ~400 KB)
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
                 masteries, armor, spells and the monsters' stat blocks
  character.js   choices ("spec") -> creature; validateSpec guards what phones send
  grid.js        5-ft squares, movement costs, pathfinding, cones and cubes,
                 line of sight and cover
  combat.js      initiative and surprise, turns, attacks, Advantage/Disadvantage,
                 saves, spells and slots, cones, Multiattack, Redirect Attack,
                 species traits, Opportunity Attacks, Help, 0 HP and death saves,
                 conditions, Concentration, upcasting, Shield, class features
  ai.js          monsters, AI companions and the Coach (one brain)
  glossary.js    plain-language rules for every rule key and spell
src/game/
  campaign.js    chapters 2-8: scenes, choices and flags, checks, saves,
                 rests, level-ups, fights
  encounters.js  maps and foes sized to the party
  room.js        the party: seats, heroes, votes, checks, fights, turn control,
                 AI turns, reaction prompts, rests, levels, the turn timer,
                 the party's state between fights, saves. Runs on the host's phone
src/net/online.js WebRTC + Firestore signalling, ported from Skyline Hustle
src/ui/        main.js (screens), builder.js, lesson.js, story.js, sheet.js,
               board.js (SVG grid), explain.js (Why? text), dom.js
tools/         serve.mjs, bundle.mjs, e2e.mjs, ui-smoke.mjs
```

- **The engine explains itself.** Each resolution is appended to
  `battle.log` as a record of what was rolled, what was added and which rule
  applied. The roll cards, the combat log, the Why? sheet and the
  end-of-fight recap are all rendered from those records.
- **Those records are also the network protocol.** Phones send intents
  (`{ a: 'cast', spell: 'guiding-bolt', target: 'f2' }`). The host's room
  checks each one against the rules and whose turn it is, resolves it, and
  broadcasts the new state. Dice are rolled only on the host.
- **The AI plays by the same rules.** Monster and companion turns go through
  the same `perform()` as a person's tap, and the Coach's tip is the AI's
  choice for your hero, explained in words.
- **Dropping out is fine.** Seats have tokens. A player whose phone drops is
  handed to the AI after 8 s and gets their hero back when they rejoin. A
  newcomer mid-campaign can build a hero from the story screen. The host
  autosaves after every action, so **Continue your party** resumes where you were.
- `window.__FR` in the console exposes the app state (and the room, on the host).

Rules content: SRD 5.2.1 by Wizards of the Coast LLC, CC-BY-4.0 (see the
in-game Credits).
