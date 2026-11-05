# First Roll: scope

*Working title. A light turn-based RPG that teaches the 2024 fifth-edition rules
by playing them.*

Status: scoping, no code yet. Builds here in `SmallGames/first-roll/` and ships to
`jteef/public/play/first-roll/` the same way Skyline Hustle and Turbo Surfers do.

---

## 1. The idea in one paragraph

You make a level 1 character, and over a short campaign of about 8 chapters
(roughly 2–3 hours total) the game hands you the rules **one at a time, at the
moment you need them**. Every roll shows its math: *d20 (14) + STR 3 + PB 2 = 19
vs AC 15, hit*. Tap any number to see the rule behind it. By the end the player
has made a character, run full combat turns, cast spells, made saves, used
conditions, rested and leveled to 3. That's enough to sit down at a real table
and not feel lost.

**Success test:** someone who has never played can finish the game, then fill
out a real 2024 character sheet and play a combat turn at a table without asking
what to roll.

## 2. How it fits your existing setup

What I found in your repos:

| Thing | How it works today | What First Roll does |
| --- | --- | --- |
| Play hub | `jteef/public/play/index.html`. A `GAMES` array; each game is one folder with a single `index.html` | Add one tile, one folder |
| Skyline Hustle | One self-contained 1.4 MB HTML file, no external assets, online play over WebRTC with Firestore REST signalling | Same single-file format. Online is optional and comes later |
| Turbo Surfers | Plain ES modules, zero dependencies, `tools/bundle.mjs` inlines everything into `dist/*.html` | Same toolchain, copied and adapted |
| CampaignCraft (`jteef/dnd`) | Has a 2024 compendium JSON | **Not used.** See licensing below |

**Deploy flow (same as the other games):**

```
node first-roll/tools/bundle.mjs       -> first-roll/dist/first-roll.html
copy to jteef/public/play/first-roll/index.html
add the tile to GAMES in jteef/public/play/index.html
deploy as usual (firebase hosting)
```

Tile: `{ emoji:"🎲", name:"First Roll", desc:"Learn to play the 2024 fifth-edition rules by playing: make a hero, roll the dice, and see why every roll works.", url:"/play/first-roll/" }`

## 3. Licensing: the one hard constraint

- **Rules and stat content come only from the SRD 5.2.1** (the 2024 rules
  reference). It's published under **CC-BY-4.0**, so it's free to use in a
  public game as long as we include the attribution statement (on the credits
  screen and in the file header).
- **Do not use `jteef/dnd/public/compendium/2024-*.json`.** It was built from a
  user-supplied "Complete Compendium" XML that almost certainly holds
  non-SRD book text (it lists 66 monsters, for example, which looks like book
  content rather than the SRD set). That's fine inside a private campaign tool
  but not in a public game.
- **No trademarks in the branding.** Don't put "Dungeons & Dragons" or "D&D" in
  the game name or logo. "Fifth edition", "5e" and "2024 rules" in the
  description are fine.
- Setting, characters, story and art are all original.

What the SRD 5.2.1 gives us: all 12 classes (one subclass each), 9 species
(Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling), 4
backgrounds (Acolyte, Criminal, Sage, Soldier), origin feats, weapons with
Mastery properties, the spell list, conditions and a bestiary. That covers
everything this game needs.

## 4. What it teaches: the curriculum

Each chapter is one short scene (exploration, a talk, or a fight) built around
one new idea. Earlier ideas keep coming back so they stick.

| # | Chapter teaches | 2024 rules covered |
| --- | --- | --- |
| 0 | **Rolling the d20** | D20 Tests (ability checks, saves, attacks), modifiers, DC, Advantage / Disadvantage, Heroic Inspiration |
| 1 | **Making your hero** | Class → Background (its +2/+1 or +1/+1/+1 ability increases, Origin feat, skills) → Species → equipment. Point-buy or standard array. Proficiency Bonus |
| 2 | **Your first fight** | Initiative, a turn = move + action + bonus action (+ reaction), Attack action, attack roll vs AC, damage dice, HP |
| 3 | **Weapon Mastery** | Mastery properties (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex), Two-Weapon fighting with Nick |
| 4 | **Positioning** | 5-ft squares, Opportunity Attacks, Disengage, Dash, Dodge, cover, ranged in melee, Help |
| 5 | **Out of combat** | Skills, Search / Study / Influence / Utilize actions, Hide (DC 15 Stealth, Invisible), passive Perception, group checks |
| 6 | **Magic** | Cantrips, spell slots, spell attack vs saving throw, spell save DC, Concentration, the one-slot-spell-per-turn rule, rituals |
| 7 | **Conditions and danger** | Prone, Grappled (2024 unarmed grapple save), Frightened, Poisoned, Restrained, Exhaustion (−2 per level), surprise (Disadvantage on Initiative) |
| 8 | **Rest and grow** | Short / Long Rest, Hit Point Dice, Death Saving Throws, level up to 2 and 3, subclass choice at 3 |

A **Rules Glossary** fills up as chapters unlock terms. That gives the player a
plain-language reference they've already earned, with links back to the
moment each rule first came up.

## 5. Gameplay

### Party

You create **one hero** (this teaches character building), and **two pre-made
companions** join in chapter 2. You control all three in combat, which gets you
hands-on with a martial class, a caster and a support class.

### MVP class set (levels 1–3)

| Class | Why it's in | SRD subclass at 3 |
| --- | --- | --- |
| Fighter | Simplest turn, teaches Mastery, Second Wind, Action Surge | Champion |
| Rogue | Sneak Attack, Cunning Action, Hide, bonus actions | Thief |
| Cleric | Saves vs attacks, healing, Concentration | Life Domain |
| Wizard | Slots, cantrips, rituals, spellbook | Evoker |

The other 8 classes come after launch (each about one session of data plus a few
rules hooks).

### The screens

1. **Map / story**: a node map of the chapter. Text scenes with choices; some
   choices are skill checks with the DC and odds shown.
2. **Combat board**: a small square grid (about 8×10, fits a phone in portrait).
   Tokens, movement range highlighted in 5-ft squares, threat zones shown for
   Opportunity Attacks.
3. **Action bar**: Action / Bonus Action / Reaction / Movement as four "budget"
   chips that empty as you use them. This makes the turn structure visible.
4. **Dice tray + "Why?" panel**: animated dice, then the full breakdown. Every
   number links to its rule.
5. **Character sheet**: laid out like a real 2024 sheet so the skill carries over
   to the table.

### Coaching levels (player picks, can change anytime)

- **Coach**: explains every roll and suggests a good action each turn.
- **Hints**: explains when tapped. No suggestions.
- **Table**: no help. Optional **"use my own dice"**: you roll real dice and type
  the result, so you practise the physical habit too.

## 6. Technical design

Same philosophy as Turbo Surfers: **plain JS modules, zero dependencies, no asset
files, one HTML out.**

```
first-roll/
  SCOPE.md
  index.html, style.css
  src/rules/      pure rules engine, no DOM
    dice.js         seeded RNG (reuse shared/rng.js mulberry32), roll parsing "2d6+3"
    d20.js          D20 Tests, adv/dis, Heroic Inspiration
    character.js    derive stats: mods, PB, AC, HP, saves, skills, spell DC
    combat.js       initiative, turn budget, attacks, damage, resistances
    actions.js      the 2024 action list (Attack, Dash, Disengage, Dodge, Help,
                    Hide, Influence, Magic, Ready, Search, Study, Utilize)
    mastery.js      the 8 mastery properties
    conditions.js   the condition list and their effects as modifiers
    spells.js       slots, concentration, save/attack spells, area templates
    rest.js         rests, Hit Point Dice, death saves, level up
  src/data/       SRD 5.2.1 subset as JS objects (classes, species, backgrounds,
                  feats, weapons, armor, ~40 spells, ~15 monsters)
  src/game/       chapters, encounters, monster AI, save/load (localStorage)
  src/ui/         board, action bar, dice tray, why-panel, sheet, glossary, story
  test/           node --test, rules engine unit tests
  tools/bundle.mjs
  dist/first-roll.html
```

**The key design decision is that the rules engine explains itself.** Every
function that resolves something returns a structured record, not just a number:

```js
{ kind: 'attack', who: 'Mira', target: 'Goblin Warrior',
  die: { sides: 20, rolls: [14, 6], kept: 14, mode: 'advantage', why: 'Target is Prone' },
  mods: [ { label: 'STR', value: 3 }, { label: 'Proficiency', value: 2 } ],
  total: 19, vs: { label: 'AC', value: 15 }, outcome: 'hit',
  rule: 'attack-roll' }
```

The UI renders these records as the "Why?" panel, the combat log and the glossary
links. Teaching comes straight out of the engine, so the explanations can't
drift from what the game actually did. Because the engine is pure and seeded,
it can be unit-tested against worked examples from the rules.

**Monster AI:** simple utility scoring (target the weakest in reach, use
mastery and conditions, retreat when bloodied). Enough to feel fair, but it
plays by the same rules and logs the same records, so the player can tap a
monster's turn and see why it hit.

**Visuals and sound:** SVG/emoji tokens and procedurally drawn tiles, synthesized
dice sounds (the Turbo Surfers `audio.js` approach). Size target: under 1 MB.

**Saving:** localStorage, wrapped in try/catch, with an export/import code as a
backup.

## 7. Phases

| Phase | Delivers | Rough size |
| --- | --- | --- |
| **0. Combat prototype** | Rules engine core (dice, d20, character, combat, actions), one Fighter vs 3 goblins on the grid, Why? panel working, engine tests. Plays in the browser from `first-roll/index.html` | 1–2 sessions |
| **1. Vertical slice** | Chapters 0–3, character creator (4 classes, 9 species, 4 backgrounds), companions, Coach mode, save/load, bundle and deploy to `/play/first-roll/` as **early access** | 3–4 sessions |
| **2. Full curriculum** | Chapters 4–8, spells, conditions, rests, level 2–3 and subclasses, glossary, all three coaching levels, "use my own dice" | 4–6 sessions |
| **3. Polish and extras** | Sound, animation, accessibility pass (colour-blind-safe, screen-reader log), credits/attribution, replayable "Skirmish" mode with random encounters | 2–3 sessions |
| **Later (optional)** | Remaining 8 classes; 2–4 player online co-op using Skyline's WebRTC + Firestore signalling; AI narrator for scene text | separate scope |

A "session" is one focused build conversation like the ones that made Turbo
Surfers.

## 8. Risks and how we handle them

| Risk | Mitigation |
| --- | --- |
| Rules scope creep (5e is huge) | Hard cap: 4 classes, levels 1–3, ~40 spells, ~15 monsters for launch. Anything else goes in "Later" |
| Teaching 2014 rules by accident | Data comes only from SRD 5.2.1. Engine tests cite the 2024 rule they check. Watch the known differences: backgrounds give the ability increases, Weapon Mastery, Exhaustion, surprise, grapple, Hide, bonus-action spell rule |
| Licensing | SRD-only data, CC-BY attribution, no trademarks in branding, original story/art |
| Grid tactics on a phone | Portrait-first 8×10 grid, tap-to-select, tap-to-move with a confirm, big targets. Test on a phone at Phase 0 |
| Too much text | One new idea per chapter. Explanations are one line by default and expand on tap |

## 9. Decisions I need from you

Defaults are in **bold**; I'll go with them unless you say otherwise.

1. **Audience**: **teens/adults new to the game**, or kids (your HGL site
   suggests that might matter; it would change reading level and tone).
2. **Name**: "First Roll" is a placeholder.
3. **Party**: **your hero + 2 companions you control**, or a solo hero only
   (simpler, but you learn one class).
4. **Online co-op**: **later**, or in scope for launch.
5. **Where the source lives**: **`SmallGames/first-roll/`** (Turbo Surfers stays at
   the repo root), or its own repo.

Once those are settled, Phase 0 can start straight away.

---

### Attribution (goes in the game's credits)

> This work includes material from the System Reference Document 5.2.1 ("SRD
> 5.2.1") by Wizards of the Coast LLC, available at
> https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
> Commons Attribution 4.0 International License, available at
> https://creativecommons.org/licenses/by/4.0/legalcode.
