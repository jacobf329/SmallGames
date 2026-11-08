// Balance check: every encounter fought by AI-run parties, fresh each time.
//   node tools/sim.mjs [runs]
import { buildHero, defaultSpec } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform, resolveReaction } from '../src/rules/combat.js';
import { makeRng } from '../src/rules/rng.js';
import { aiNext, aiReact } from '../src/rules/ai.js';
import { ENCOUNTERS, buildEncounter } from '../src/game/encounters.js';
import { COMPANIONS } from '../src/game/campaign.js';

const runs = +process.argv[2] || 30;
const players = { fighter: 'human', rogue: 'halfling', cleric: 'dwarf', wizard: 'elf', barbarian: 'goliath', bard: 'human', druid: 'elf', monk: 'human', paladin: 'dragonborn', ranger: 'elf', sorcerer: 'tiefling', warlock: 'tiefling' };
const only = process.argv[3] ? process.argv[3].split(',') : null;
const refused = new Map();      // intents the AI picked that the rules turned down
const rows = [];
for (const [cls, species] of Object.entries(players).filter(([c]) => !only || only.includes(c))) {
  for (const id of Object.keys(ENCOUNTERS)) {
    let wins = 0, downs = 0;
    for (let r = 0; r < runs; r++) {
      const enc = buildEncounter(id, 4);
      const lv = enc.level || 1;
      const mates = COMPANIONS.filter((c) => c.spec.cls !== cls).slice(0, 3);
      const specs = [{ id: 'p', name: 'Player', spec: defaultSpec(cls, { species }) }, ...mates];
      const heroes = specs.map((p, i) => Object.assign(buildHero(p.spec, { id: p.id, name: p.name, level: lv }), enc.heroStarts[i]));
      const b = createBattle({ heroes, foes: enc.foes, walls: enc.walls, cover: enc.cover, seed: 1000 + r });
      b.rng = makeRng(7 + r * 31);
      rollInitiative(b);
      let steps = 0;
      while (!b.over && steps++ < 3000) {
        if (b.pending) { resolveReaction(b, aiReact(b)); continue; }
        const who = b.order[b.idx];
        const i = aiNext(b, who) || { a: 'end' };
        const res = perform(b, who, i);
        if (!res.ok) {
          const k = `${b.creatures[who].cls || 'foe'} ${i.a}${i.spell ? ' ' + i.spell : ''}: ${res.error}`;
          refused.set(k, (refused.get(k) || 0) + 1);
          perform(b, who, { a: 'end' });
        }
      }
      if (b.over === 'victory') wins++;
      downs += heroes.filter((h) => b.creatures[h.id].hp <= 0).length;
    }
    rows.push(`${cls.padEnd(8)} ${id.padEnd(14)} win ${String(Math.round((wins / runs) * 100)).padStart(3)}%  downs/fight ${(downs / runs).toFixed(2)}`);
  }
}
console.log(rows.join('\n'));
if (refused.size) { console.log('\nRefused AI choices:'); for (const [k, n] of [...refused].sort((p, q) => q[1] - p[1])) console.log(`  ${n}x ${k}`); }
