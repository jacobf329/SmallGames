# First Roll: scope

*Working title. A light, co-op, turn-based RPG that teaches the 2024
fifth-edition rules by playing them with friends.*

Status: **Phase 2 built** (see [README.md](README.md)): chapters 0 to 8, levels 1 to 3, co-op for 1–4 players. What Phase 2 left for Phase 3 is listed under section 8.
Builds here in `SmallGames/first-roll/` and ships to
`jteef/public/play/first-roll/` the same way Skyline Hustle and Turbo Surfers do.

---

## 1. The idea in one paragraph

**Two to four friends each make a level 1 hero and play a short campaign
together online**, each on their own phone. There are about 8 chapters, roughly
2–3 hours in all. The game hands out the rules **one at a time, at the moment the
party needs them**. Every roll shows its math to the whole table: *Mira: d20
(14) + STR 3 + PB 2 = 19 vs AC 15, hit*. Anyone can tap a number to see the rule
behind it. Watching each other's turns is half the teaching, just as at a real
table. By the end the group has made characters, run full combat turns, cast
spells, made saves, dealt with conditions, rested and leveled to 3. That's
enough to sit down at a real table, maybe as the same group, and not feel lost.

Solo still works: one player, with AI companions in the empty seats.

**Success test:** a group of newcomers finishes the campaign together, then
fills out real 2024 character sheets and plays a combat round at a table
without asking what to roll.

## 2. How it fits your existing setup

| Thing | How it works today | What First Roll does |
| --- | --- | --- |
| Play hub | `jteef/public/play/index.html`. A `GAMES` array; each game is one folder with a single `index.html` | Add one tile, one folder |
| Skyline Hustle online | Transport-free `room.js` runs on the **host's phone**. Friends connect over **WebRTC data channels**. Firestore (`gameRooms/{CODE}/joins`) is only a mailbox for swapping connection details. 4-letter codes, `?join=CODE` invites, seat tokens, saves, a LAN WebSocket mode | **Same architecture, ported.** A turn-based game is the easiest possible fit: tiny messages, no latency sensitivity |
| Turbo Surfers | Plain ES modules, zero dependencies, `tools/bundle.mjs` inlines everything into one HTML file | Same toolchain |
| Firestore rules (`jteef/dnd/firestore.rules`) | `gameRooms` create only allows `game in ['skyline','turbo','arena']` | **Add `'firstroll'`** and deploy the rules. That's the only backend change |
| CampaignCraft (`jteef/dnd`) | Has a 2024 compendium JSON | **Not used.** See licensing below |

**Deploy flow (same as the other games):**

```
node first-roll/tools/bundle.mjs       -> first-roll/dist/first-roll.html
copy to jteef/public/play/first-roll/index.html
add 'firstroll' to gameRooms in jteef/dnd/firestore.rules (one time), deploy rules
add the tile to GAMES in jteef/public/play/index.html
deploy as usual (firebase hosting)
```

Tile: `{ emoji:"🎲", name:"First Roll", desc:"Learn the 2024 fifth-edition rules together: make heroes, roll the dice, and see why every roll works. Solo, or co-op with up to 4 friends.", url:"/play/first-roll/" }`

## 3. Licensing: the one hard constraint

- **Rules and stat content come only from the SRD 5.2.1** (the 2024 rules
  reference). It's published under **CC-BY-4.0**, so it's free to use in a
  public game as long as we include the attribution statement (on the credits
  screen and in the file header).
- **Do not use `jteef/dnd/public/compendium/2024-*.json`.** It was built from a
  user-supplied "Complete Compendium" XML that almost certainly holds
  non-SRD book text. That's fine inside a private campaign tool, but not in a
  public game.
- **No trademarks in the branding.** Don't put "Dungeons & Dragons" or "D&D" in
  the game name or logo. "Fifth edition", "5e" and "2024 rules" in the
  description are fine.
- Setting, characters, story and art are all original.

What the SRD 5.2.1 gives us: all 12 classes (one subclass each), 9 species, 4
backgrounds (Acolyte, Criminal, Sage, Soldier), origin feats, weapons with
Mastery properties, the spell list, conditions and a bestiary.

## 4. Co-op design (the main focus)

### The session flow

1. **Host** taps *Start a party* and gets a 4-letter code plus a share link
   (`/play/first-roll/?join=CODE`).
2. **Friends join** (up to 4 heroes in all) and land in the **Tavern lobby**:
   each player builds a hero there, and everyone sees the others' choices as they
   make them. A party-roles panel ("no healer yet") teaches why parties mix
   classes.
3. Host taps *Begin*. Empty seats can be filled with **AI companions** (pre-made
   heroes) so encounters stay balanced for 4.
4. Play the chapter. The host's phone **autosaves after every action**.
5. Stop at any point. Next time the host taps *Continue campaign*, and friends
   rejoin with the same code link; their **seat token** (kept in their browser)
   puts them back on their hero.

### Who does what during play

| Moment | How it works in co-op | What it teaches |
| --- | --- | --- |
| **Combat** | Initiative order. On your turn, your phone gets the board and action bar; everyone else watches live and sees each roll's Why? breakdown | Turn structure, by watching three other people take turns |
| **Reactions** | Off-turn prompt with a short timer: *"Goblin is leaving your reach: Opportunity Attack?"* | Reactions happen on other people's turns |
| **Help action** | Help a friend; they see the Advantage you gave them arrive | Teamwork rules |
| **Skill challenges** | The game asks "who checks?" The party picks the best person, uses a **Group Check**, or someone takes the Help action | Group checks, picking the right character |
| **Story choices** | Party vote; ties go to the host. Shown as a short poll | Table decision-making |
| **Loot** | A shared pool, claimed in turn | Party economy |
| **Rests** | Anyone proposes a Short or Long Rest; it starts when everyone accepts | Rest rules and Hit Point Dice |

### Keeping waits short

Waiting for other players is the biggest risk in co-op turn-based play.

- Monster turns resolve fast, as one compact animated step each.
- The **Coach** gives a suggested action, so a new player never stares at the
  screen.
- An optional **turn timer** (off by default). When it runs out, the turn ends
  with Dodge, which teaches Dodge.
- **Table talk**: tap-to-ping a square, quick emoji reactions, and preset
  "plan" chips ("I'll take the archer", "Need healing").
- Each player sets their **own coaching level**, so a veteran friend can turn
  hints off while a newcomer keeps Coach on.

### Dice

The host rolls every die with a seeded RNG. That keeps one truth and makes
cheating pointless, and every roll is broadcast as an explained record.
**"Use my own dice"** works per player: on your roll your phone asks for the
number you rolled at your real table, and the host trusts it, as a real table
would.

### Solo

The same game with one seat. Companions are AI-controlled by default, or set to
"you control" (the earlier default) to practise every class.

## 5. What it teaches: the curriculum

Each chapter is one short scene (exploration, a talk, or a fight) built around one
new idea. Earlier ideas keep coming back.

| # | Chapter teaches | 2024 rules covered |
| --- | --- | --- |
| 0 | **Rolling the d20** (in the lobby, while friends join) | D20 Tests (ability checks, saves, attacks), modifiers, DC, Advantage / Disadvantage, Heroic Inspiration |
| 1 | **Making your hero** | Class → Background (its +2/+1 or +1/+1/+1 ability increases, Origin feat, skills) → Species → equipment. Standard array or point-buy. Proficiency Bonus. Party roles |
| 2 | **Your first fight** | Initiative, a turn = move + action + bonus action (+ reaction), Attack action, attack roll vs AC, damage dice, HP |
| 3 | **Weapon Mastery and teamwork** | Mastery properties (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex), Help, flanking positions *without* the optional flanking rule |
| 4 | **Positioning** | 5-ft squares, Opportunity Attacks, Disengage, Dash, Dodge, cover, ranged attacks in melee |
| 5 | **Out of combat** | Skills, Search / Study / Influence / Utilize actions, Hide (DC 15 Stealth, Invisible), passive Perception, Group Checks |
| 6 | **Magic** | Cantrips, spell slots, spell attack vs saving throw, spell save DC, Concentration, the one-slot-spell-per-turn rule, rituals |
| 7 | **Conditions and danger** | Prone, Grappled (2024 unarmed grapple save), Frightened, Poisoned, Restrained, Exhaustion (−2 per level), surprise (Disadvantage on Initiative) |
| 8 | **Rest and grow** | Short / Long Rest, Hit Point Dice, Death Saving Throws (and friends stabilising you), level up to 2 and 3, subclass at 3 |

A shared **Rules Glossary** fills up as chapters unlock terms, with links back to
the moment each rule first came up.

## 6. Classes, party and screens

**MVP classes (levels 1–3):** Fighter (Champion), Rogue (Thief), Cleric (Life
Domain), Wizard (Evoker). That's one of each classic role, so a full party of 4 is
a natural first group. Duplicate classes are allowed. The other 8 SRD classes
come after launch.

**Encounter scaling:** encounters are built with the 2024 XP budget for the
actual party size (1–4 heroes, counting AI companions).

**Screens:**

1. **Lobby / Tavern**: room code, seats, hero builder, party-roles panel.
2. **Map / story**: chapter node map, text scenes, votes, skill checks with the
   DC and odds shown.
3. **Combat board**: portrait-first square grid (about 8×10), tokens in player
   colours, movement range in 5-ft squares, threat zones for Opportunity
   Attacks, pings.
4. **Action bar**: Action / Bonus Action / Reaction / Movement as four budget
   chips that empty as you use them.
5. **Dice tray + Why? panel**: on everyone's screen for every roll.
6. **Character sheet**: laid out like a real 2024 sheet. Tap a party member to
   see theirs.

## 7. Technical design

Same philosophy as your other games: **plain JS modules, zero dependencies, no
asset files, one HTML out.**

```
first-roll/
  SCOPE.md
  index.html, style.css
  src/rules/      pure rules engine, no DOM, no network
    dice.js         seeded RNG (mulberry32), "2d6+3" parsing
    d20.js          D20 Tests, adv/dis, Heroic Inspiration
    character.js    derive stats: mods, PB, AC, HP, saves, skills, spell DC
    combat.js       initiative, turn budget, attacks, damage, resistances
    actions.js      the 2024 action list (Attack, Dash, Disengage, Dodge, Help,
                    Hide, Influence, Magic, Ready, Search, Study, Utilize)
    mastery.js, conditions.js, spells.js, rest.js
  src/data/       SRD 5.2.1 subset (classes, species, backgrounds, feats,
                  weapons, armor, ~40 spells, ~15 monsters)
  src/game/
    room.js         THE authoritative party: seats, lobby, campaign state,
                    turn order, votes, saves. Transport-free, like Skyline's
    campaign.js     chapters, scenes, encounters
    ai.js           monster AI and AI companions
  src/net/        ported from Skyline Hustle
    online.js       Firestore-signalled WebRTC (host + join), framing/chunking
    lan.js          WebSocket for a local server (optional)
    local.js        in-tab loopback transport, for solo and tests
  src/ui/         lobby, board, action bar, dice tray, why-panel, sheet,
                  glossary, story, votes, pings
  test/           node --test (rules engine, room protocol)
  tools/bundle.mjs
  dist/first-roll.html
```

### Two design decisions carry the whole thing

**1. The rules engine explains itself.** Every resolution returns a structured
record, not just a number:

```js
{ kind: 'attack', who: 'Mira', target: 'Goblin Warrior',
  die: { sides: 20, rolls: [14, 6], kept: 14, mode: 'advantage', why: 'Target is Prone' },
  mods: [ { label: 'STR', value: 3 }, { label: 'Proficiency', value: 2 } ],
  total: 19, vs: { label: 'AC', value: 15 }, outcome: 'hit', rule: 'attack-roll' }
```

The UI renders these records as the Why? panel, the log and the glossary links,
so the explanations can't drift from what the game actually did.

**2. These records are also the network protocol.** Players send *intents*
(`{ t:'act', action:'attack', with:'longsword', target:'g2' }`). The host's
`room.js` validates each intent against the rules, resolves it, and broadcasts
the resolution records plus a small state patch. All phones animate the same
records. Messages are tiny (well under 1 KB), and a turn-based game doesn't care
about 200 ms of latency, so it's a very easy load for Skyline's transport.

### Networking details

- **Topology:** a star, with the host's browser as the authority. Skyline's
  `online.js` is reused: offer/answer through `gameRooms/{CODE}/joins`, STUN
  only, and the mailbox is deleted when the host leaves.
- **Seats:** each join gets `{ pid, token }`, and the token is stored in the
  player's localStorage. Rejoining with the token reclaims the seat and hero. A
  dropped player's hero switches to the AI companion until they're back, so
  nobody is stuck waiting on them.
- **Saves:** the host keeps the campaign (all heroes and progress) in
  localStorage after every action, with an export code as a backup. Each player
  also keeps a copy of **their own hero**, so they can bring that hero into
  another friend's party.
- **Host leaves:** the session pauses for everyone ("Waiting for host…"). It
  resumes when the host reopens and continues. There's no host migration in v1.
- **Validation:** the host rejects intents that break the rules or come out of
  turn, so a modified client can't break the game.

**Visuals and sound:** SVG/emoji tokens, procedural tiles, synthesized dice
sounds. Size target: under 1.2 MB.

## 8. Phases

Co-op is built in from the first prototype rather than added on later.

| Phase | Delivers | Rough size |
| --- | --- | --- |
| **0. Co-op combat prototype** | Rules engine core, `room.js` with turn order and intents, the in-tab loopback transport, then the ported Skyline WebRTC transport. **Two phones fight 3 goblins together** with a Fighter and a Rogue. Why? panel on both screens. Engine and room tests, plus a two-browser Playwright test | 2–3 sessions |
| **1. Vertical slice (early access)** | Lobby with hero builder (4 classes, 9 species, 4 backgrounds), chapters 0–3, reactions, Help, votes, pings, AI companions for empty or dropped seats, saves and rejoin. Firestore rule updated. Deployed to `/play/first-roll/` | 4–5 sessions |
| **2. Full curriculum** | Chapters 4–8, spells, conditions, rests, death saves, level 2–3 and subclasses, shared glossary, per-player coaching levels, "use my own dice", turn timer | 4–6 sessions |
| **3. Polish** | Sound, animation, accessibility pass (colour-blind-safe player colours, screen-reader log), credits and attribution, replayable **Skirmish** mode (random co-op encounters for an evening), LAN mode | 2–3 sessions |
| **Later** | Remaining 8 classes; levels 4–5; TURN relay for strict networks; host migration; AI narrator for scene text | separate scope |

### What Phase 2 built, and what moved to Phase 3

Built: chapters 4 to 8 (High Ground, Asking Around, Magic in the Cellar, Bad
Air and Worse Company, The Barrow); levels 2 and 3 with each class's features
and one subclass each (Champion, Thief, Life Domain, Evoker); 11 new spells,
Concentration and casting with a higher slot; the Shield reaction; cover and
line of sight; Prone, Restrained, Grappled, Frightened, Poisoned, Paralyzed,
Incapacitated and Exhaustion; Hide and Shove; seven new monsters; saving-throw
scenes, Short and Long Rests with Hit Point Dice; the party's state carried
between fights; choices that set flags (a back door you found, cultists you
talked out of it); the Rules book; a per-player tips toggle; the host's turn
timer.

After the first playtest (Nov 8): the builder makes every 2024 choice (Origin
feats including the Human's Versatile feat, point buy and rolled scores,
lineages, skills, gear, Fighting Style, Mastery, Divine Order, Magic Initiate),
players choose their own cantrips and spells at creation, at each level-up and
after a Long Rest, and spells aim the way the rules say (self, ally, creature,
split, point, or an area placed on any square with a preview). Weapon Mastery
Nick, Graze, Slow and Topple and the Light weapon's extra attack now work too.

Moved to Phase 3:

- **"Use my own dice"**: typing in a physical roll instead of the app rolling.
- **Coaching levels** beyond on/off (for example, tips only when asked).
- **A glossary that fills up as chapters unlock terms**, with links back to
  where each rule first came up. Phase 2 ships the whole Rules book at once.
- **Grappling by heroes** (monsters can grapple, heroes can only escape),
  the Search, Study, Influence and Utilize actions in fights, rituals, and one
  more subclass per class.
- **A Skirmish mode** of random fights, as already planned.

A "session" is one focused build conversation like the ones that made Turbo
Surfers.

## 9. Risks and how we handle them

| Risk | Mitigation |
| --- | --- |
| Waiting around in co-op | Fast monster turns, Coach suggestions, reactions and pings on other people's turns, optional timer, drop-in AI for absent players |
| Some networks can't connect (STUN only, no TURN), as with Skyline | Clear "couldn't connect" message with a tip to try another network. LAN mode. Adding TURN is a "Later" item if friends hit it often |
| Host's phone sleeps or closes | Autosave every action, Wake Lock while hosting, everyone pauses and resumes cleanly |
| Rules scope creep (5e is huge) | Hard cap: 4 classes, levels 1–3, ~40 spells, ~15 monsters for launch |
| Teaching 2014 rules by accident | SRD 5.2.1 data only. Tests cite the 2024 rule they check. Watch the known differences: backgrounds give the ability increases, Weapon Mastery, Exhaustion, surprise, grapple, Hide, the bonus-action spell rule |
| Licensing | SRD-only data, CC-BY attribution, no trademarks in branding, original story and art |
| Grid tactics on a phone | Portrait 8×10 grid, tap-to-select, tap-to-move with a confirm. Tested on real phones in Phase 0 |

## 10. Decisions

Settled:

- **Audience:** teens and adults who are new to the game.
- **Name:** "First Roll" (placeholder until something better comes up).
- **Party:** each player brings one hero, and AI companions fill empty seats (in
  solo they can be set to "you control").
- **Co-op:** the main focus, 1–4 players, built in from Phase 0.
- **Source:** `SmallGames/first-roll/`.

Nothing is blocking Phase 0.

---

### Attribution (goes in the game's credits)

> This work includes material from the System Reference Document 5.2.1 ("SRD
> 5.2.1") by Wizards of the Coast LLC, available at
> https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
> Commons Attribution 4.0 International License, available at
> https://creativecommons.org/licenses/by/4.0/legalcode.
