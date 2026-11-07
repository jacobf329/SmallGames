// Small DOM helpers shared by the screens.

export const $ = (id) => document.getElementById(id);

export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
  json(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
};

let errTimer = null;
export function showErr(text) {
  const e = $('err');
  e.textContent = text;
  e.classList.remove('hidden');
  clearTimeout(errTimer);
  errTimer = setTimeout(() => e.classList.add('hidden'), 3200);
}

export function openSheet(html) {
  $('sheet-body').innerHTML = html;
  $('sheet').classList.remove('hidden');
  $('sheet-body').scrollTop = 0;
}
export const closeSheet = () => $('sheet').classList.add('hidden');

export function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === `scr-${id}`);
  window.scrollTo(0, 0);
}
