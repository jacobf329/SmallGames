// Skyline Hustle - faces. Companies get illustrated portraits (portraits.js);
// citizens and staff get little generated SVG faces: seeded by name, dressed
// for the era (hats and lapels in the thirties, turtlenecks in the sixties,
// hoodies later), smiling or frowning with their mood.

import { RIVAL_FACES, AVATARS } from './portraits.js';

export { AVATARS };
export const AVATAR_COUNT = AVATARS.length;

export function faceSrc(p) {
  if (!p) return AVATARS[0];
  if (!p.human && RIVAL_FACES[p.company]) return RIVAL_FACES[p.company];
  return AVATARS[((p.avatar ?? p.id) % AVATARS.length + AVATARS.length) % AVATARS.length];
}
const escA = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function faceHTML(p, size = 40, cls = '') {
  return `<img class="face ${cls}" src="${faceSrc(p)}" width="${size}" height="${size}" style="--ring:${p?.color || '#888'}" alt="${escA(p?.name || '')}">`;
}

// ------------------------------------------------------- generated faces ----
const SKIN = ['#f6d7c3', '#eac0a2', '#d9a27e', '#c08562', '#a0694a', '#7a4b33', '#5c3a28'];
const HAIR = ['#1f1a17', '#3b2a20', '#6b4a2b', '#a0612f', '#d9a441', '#b8b8b8', '#e8e2d6', '#8a2f1e'];
const BG = ['#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#a0c4ff', '#ffadad'];
const CLOTH = ['#33415c', '#7d4e57', '#3d5a40', '#5b4b8a', '#9c6644', '#2b6777', '#b23a48', '#4a4e69', '#e09f3e'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const cache = new Map();

// seed: any string (a name); year: the game year; mood 0..1; rich 0..3.
export function svgFace(seed, year = 1960, mood = 0.6, rich = 1) {
  const key = `${seed}|${Math.floor(year / 10)}|${mood < 0.35 ? 0 : mood > 0.7 ? 2 : 1}|${rich}`;
  if (cache.has(key)) return cache.get(key);
  let r = hash(seed);
  const pick = arr => { r = Math.imul(r ^ (r >>> 15), 2246822519) >>> 0; return arr[r % arr.length]; };
  const chance = p => { r = Math.imul(r ^ (r >>> 13), 3266489917) >>> 0; return (r % 1000) / 1000 < p; };
  const skin = pick(SKIN), hair = pick(HAIR), bg = pick(BG);
  const cloth = rich >= 2 ? pick(['#22223b', '#2d3142', '#3c1642', '#1b263b']) : pick(CLOTH);
  const style = pick(['short', 'side', 'long', 'bun', 'curly', 'bob', 'bald', 'crop']);
  const glasses = chance(0.2), beard = (style === 'short' || style === 'side' || style === 'bald' || style === 'crop') && chance(0.3);
  const hat = year < 1960 && chance(0.4) ? pick(['fedora', 'cloche', 'boater']) : year >= 1990 && chance(0.12) ? 'cap' : null;
  const top = year < 1955 ? 'suit' : year < 1970 ? pick(['suit', 'turtle']) : year < 1985 ? pick(['collar', 'turtle', 'suit']) : year < 2000 ? pick(['tee', 'collar', 'suit']) : pick(['hoodie', 'tee', 'suit']);
  const mouth = mood > 0.7 ? 'M25 41 Q32 47 39 41' : mood < 0.35 ? 'M25 44 Q32 39 39 44' : 'M26 42 Q32 44 38 42';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${bg}"/>`;
  // Hair behind the head.
  if (style === 'long') s += `<path d="M16 28 Q16 12 32 11 Q48 12 48 28 L50 52 L14 52 Z" fill="${hair}"/>`;
  if (style === 'bob') s += `<path d="M17 30 Q16 12 32 12 Q48 12 47 30 L47 40 L17 40 Z" fill="${hair}"/>`;
  // Shoulders and clothes.
  s += `<path d="M8 64 Q10 49 32 48 Q54 49 56 64 Z" fill="${cloth}"/><rect x="28" y="40" width="8" height="9" fill="${skin}"/>`;
  if (top === 'suit') s += `<path d="M27 49 L32 58 L37 49 L34 48 L32 52 L30 48 Z" fill="#f4f1ea"/><path d="M31 51 L33 51 L33.5 60 L32 62 L30.5 60 Z" fill="${pick(['#b23a48', '#2b6777', '#e09f3e', '#4a4e69'])}"/>`;
  if (top === 'turtle') s += `<rect x="26" y="45" width="12" height="6" rx="3" fill="${cloth}" stroke="#0002"/>`;
  if (top === 'collar') s += `<path d="M26 48 L32 55 L22 56 Z M38 48 L32 55 L42 56 Z" fill="#f4f1ea"/>`;
  if (top === 'hoodie') s += `<path d="M20 50 Q32 58 44 50" stroke="#0003" stroke-width="3" fill="none"/><path d="M30 53 L30 60 M34 53 L34 60" stroke="#fff8" stroke-width="1"/>`;
  if (top === 'tee') s += `<path d="M27 48 Q32 52 37 48" stroke="#0003" stroke-width="2" fill="none"/>`;
  // Head.
  s += `<ellipse cx="32" cy="29" rx="12" ry="14" fill="${skin}"/><ellipse cx="20" cy="30" rx="2" ry="3" fill="${skin}"/><ellipse cx="44" cy="30" rx="2" ry="3" fill="${skin}"/>`;
  // Hair on top.
  if (style === 'short') s += `<path d="M20 26 Q20 13 32 14 Q44 13 44 26 Q40 19 32 19 Q24 19 20 26 Z" fill="${hair}"/>`;
  if (style === 'side') s += `<path d="M20 27 Q19 13 33 13 Q45 14 44 25 L37 19 Q28 22 20 27 Z" fill="${hair}"/>`;
  if (style === 'crop') s += `<path d="M21 24 Q22 15 32 15 Q42 15 43 24 Q38 20 32 20 Q26 20 21 24 Z" fill="${hair}"/>`;
  if (style === 'long' || style === 'bob') s += `<path d="M20 28 Q19 14 32 14 Q45 14 44 28 Q42 20 32 19 Q22 20 20 28 Z" fill="${hair}"/>`;
  if (style === 'bun') s += `<circle cx="32" cy="12" r="5" fill="${hair}"/><path d="M20 27 Q20 14 32 15 Q44 14 44 27 Q40 19 32 19 Q24 19 20 27 Z" fill="${hair}"/>`;
  if (style === 'curly') for (const [x, y] of [[21, 22], [25, 16], [32, 14], [39, 16], [43, 22], [28, 18], [36, 18]]) s += `<circle cx="${x}" cy="${y}" r="5" fill="${hair}"/>`;
  if (style === 'bald') s += `<path d="M20 30 Q20 26 22 25 M44 30 Q44 26 42 25" stroke="${hair}" stroke-width="3" fill="none"/>`;
  // Face.
  s += `<path d="M24 24 L29 23.5 M35 23.5 L40 24" stroke="${hair === '#e8e2d6' ? '#9a9187' : hair}" stroke-width="1.6" stroke-linecap="round"/>`;
  s += `<ellipse cx="27" cy="28.5" rx="1.6" ry="2" fill="#2b2118"/><ellipse cx="37" cy="28.5" rx="1.6" ry="2" fill="#2b2118"/>`;
  s += `<path d="M32 30 Q30.5 34.5 32.5 35" stroke="#0003" stroke-width="1.2" fill="none"/>`;
  if (beard) s += `<path d="M21 33 Q22 45 32 46 Q42 45 43 33 Q40 40 32 40 Q24 40 21 33 Z" fill="${hair}"/>`;
  s += `<path d="${mouth}" stroke="#7a3b2e" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  if (mood > 0.7) s += `<circle cx="23.5" cy="34" r="2.2" fill="#ff6b6b33"/><circle cx="40.5" cy="34" r="2.2" fill="#ff6b6b33"/>`;
  if (glasses) s += `<g fill="none" stroke="#222" stroke-width="1.2"><circle cx="27" cy="28.5" r="4"/><circle cx="37" cy="28.5" r="4"/><path d="M31 28.5 L33 28.5"/></g>`;
  // Hats.
  if (hat === 'fedora') s += `<ellipse cx="32" cy="18" rx="17" ry="3.5" fill="#3b3a3f"/><path d="M22 18 Q22 7 32 7 Q42 7 42 18 Z" fill="#4a494f"/><rect x="22" y="14" width="20" height="3" fill="#8a2f1e"/>`;
  if (hat === 'cloche') s += `<path d="M18 24 Q17 9 32 9 Q47 9 46 24 Q40 19 32 19 Q24 19 18 24 Z" fill="${pick(['#b23a48', '#5b4b8a', '#2b6777'])}"/><circle cx="41" cy="16" r="2.5" fill="#f4f1ea"/>`;
  if (hat === 'boater') s += `<ellipse cx="32" cy="17" rx="16" ry="3" fill="#e9d8a6"/><rect x="23" y="10" width="18" height="7" rx="1" fill="#e9d8a6"/><rect x="23" y="13" width="18" height="2.5" fill="#22223b"/>`;
  if (hat === 'cap') s += `<path d="M20 22 Q20 11 32 11 Q44 11 44 22 Z" fill="${pick(['#b23a48', '#2b6777', '#e09f3e'])}"/><path d="M32 21 L50 23 Q46 19 40 19 Z" fill="#222a"/>`;
  s += '</svg>';
  const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
  cache.set(key, uri);
  return uri;
}
export function svgFaceHTML(seed, year, mood, rich, size = 40, cls = '') {
  return `<img class="face gen ${cls}" src="${svgFace(seed, year, mood, rich)}" width="${size}" height="${size}" alt="">`;
}
