# First Roll: scope

*Working title. A co-op, turn-based fantasy RPG built on the 2024
fifth-edition rules, for 1–4 players on their phones.*

Status: **Phase 1 built** (see [README.md](README.md)): early access with two
chapters, co-op for 1–4 players with AI companions.

Builds here in `SmallGames/first-roll/` and ships to
`jteef/public/play/first-roll/` like Skyline Hustle and Turbo Surfers.

---

## 1. What it is

A party of heroes, made with real 2024 character creation, plays a campaign
of story scenes and tactical grid fights. It runs on the rules from the
System Reference Document 5.2.1: classes, species, backgrounds, feats,
weapons, Weapon Mastery, spells and slots, saving throws, conditions and
monsters, all resolved by the game.

It's a game first. The dice are on show: every roll can be opened to see
the d20, the modifiers and the target. There are no lessons or coaching,
just the rules doing their job.

**Co-op is the core.** The host's phone runs the game, and friends join with a
4-letter code over WebRTC (Skyline Hustle's setup). AI companions fill out
the party, take over for anyone who drops, and hand the hero back when they
return.

## 2. Built so far

| Area | Done |
| --- | --- |
| Heroes | 6-step creation: Fighter, Rogue, Cleric, Wizard; 9 species; 4 backgrounds; standard array; background increases; Origin feats |
| Combat | 8×10 grid, initiative and surprise, movement and Opportunity Attacks, attacks, crits, Advantage/Disadvantage, Weapon Mastery (Sap, Vex), Sneak Attack, Help, Dodge, Dash, Disengage, 0 HP and death saves, Multiattack, monster reactions |
| Magic | Cantrips and level 1 spells, spell slots, one slot per turn, saves, 15-ft cones, Magic Initiate |
| Story | Scenes with party votes, skill checks (single with Help, or group), surprise, retry on defeat |
| Campaign | Chapter 1, The Flour Road; Chapter 2, The Goblin Camp |
| Multiplayer | Host-authoritative room, seat tokens and rejoin, AI takeover, autosave and continue |

## 3. Roadmap

### Phase 2: Progression (the RPG loop)

- **XP and levels 1 → 5:** XP from fights and quests, with a level-up screen.
  - Hit Points on level-up.
  - Class features as you level: Action Surge, Cunning Action, Extra Attack.
  - Level 2 spells.
  - Subclasses at level 3: Champion, Thief, Life Domain, Evoker.
- **Persistent heroes:** HP, spell slots and limited uses carry between fights.
  **Short and Long Rests** recover them, using Hit Point Dice.
- **Loot and gold:** foes and chests drop gold, Potions of Healing, ammunition
  and simple magic items (+1 weapons, a Cloak of Protection). Items equip
  from a shared inventory.
- **Camp between chapters:** spend gold at a merchant, rest, and swap
  companions.
- **Heroes saved per player:** bring your hero into a friend's party.

### Phase 3: A bigger campaign

- Chapters 3–6, picked from a small region map, with side quests.
- More SRD monsters: wolves, skeletons, zombies, bandits and their captain,
  a bugbear, an ogre, giant spiders, and a final boss.
- Conditions: Prone, Grappled, Restrained, Frightened, Poisoned. This brings in
  Topple and grappling.
- Concentration (Bless), reactions mid-attack (Shield, Stone's Endurance),
  Heroic Inspiration, cover, difficult terrain, two-weapon fighting (Nick).

### Phase 4: Polish

- Sound and animations.
- More classes (Barbarian, Paladin, Ranger and the rest of the SRD).
- Difficulty settings.
- Optionally, a TURN relay for strict networks and host migration.

## 4. Risks

| Risk | Mitigation |
| --- | --- |
| Waiting on other players | Fast monster turns, a turn timer option, AI for absent players |
| Some networks can't connect (no TURN) | LAN mode; a relay later if it bites |
| Rules scope creep | Each phase names its rules; anything else waits |
| Balance as levels and items arrive | XP-budget encounters, simulation runs per encounter (the AI already plays full fights) |
| Licensing | SRD 5.2.1 content only, CC-BY attribution, no trademarks in the branding, original story |

---

### Attribution (in the game's credits)

> This work includes material from the System Reference Document 5.2.1 ("SRD
> 5.2.1") by Wizards of the Coast LLC, available at
> https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
> Commons Attribution 4.0 International License, available at
> https://creativecommons.org/licenses/by/4.0/legalcode.
