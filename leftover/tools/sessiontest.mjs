// Two fake phones join one host, build, upgrade, gift and play a few waves.
import { createServer } from '../js/session.js';
const srv = createServer({ code: 'TEST' });
const inbox = [[], []];
const phones = [0, 1].map(i => srv.connect({ open: true, send: s => inbox[i].push(JSON.parse(s)) }));
phones[0].message(JSON.stringify({ t: 'join', name: 'Ana' }));
phones[1].message(JSON.stringify({ t: 'join', name: 'Ben' }));
phones[0].message(JSON.stringify({ t: 'setup', cooks: 2, diff: 'easy' }));
phones[1].message(JSON.stringify({ t: 'start' }));               // not host: ignored
console.log('state after non-host start:', srv.state);
phones[0].message(JSON.stringify({ t: 'start' }));
console.log('state:', srv.state, 'seats', srv.seats.map(s => s.name).join(','));
const id = n => inbox[n].find(m => m.t === 'joined').id;
phones[0].message(JSON.stringify({ t: 'build', x: 4, y: 4 }));
phones[1].message(JSON.stringify({ t: 'build', x: 4, y: 4 }));    // taken
const tw = [...srv.game.towers.values()][0];
phones[1].message(JSON.stringify({ t: 'up', id: tw.id, to: 'grill' }));  // not theirs
phones[0].message(JSON.stringify({ t: 'up', id: tw.id, to: 'grill' }));
phones[0].message(JSON.stringify({ t: 'gift', to: id(1), amt: 25 }));
console.log('nopes for Ben:', inbox[1].filter(m => m.t === 'nope').map(m => m.msg));
console.log('tower now', srv.game.towers.get(tw.id).kind, 'gold', [...srv.game.players.values()].map(p => p.name + ':' + Math.floor(p.gold)).join(' '));
for (let i = 0; i < 30 * 300; i++) srv.tick(1 / 30);
const snaps = inbox[1].filter(m => m.t === 'snap');
console.log('snaps to Ben', snaps.length, 'last wave', snaps.at(-1).w, 'phase', snaps.at(-1).ph, 'lives', snaps.at(-1).lv);
phones[0].close();
console.log('after host leaves, host is', srv.seats.find(s => !s.ai)?.name, 'players in game', srv.game.players.size);
