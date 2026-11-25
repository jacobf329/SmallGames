// Leftover Uprising - the banner that slides in when a wave starts, and the
// boss title card. Shared by the solo page and the Party Pad TV.

export function showBanner(stage, { kicker = '', title = '', sub = '', boss = false, ms = 2800 }) {
  if (!stage) return;
  let el = stage.querySelector(':scope > .lu-banner');
  if (!el) { el = document.createElement('div'); el.className = 'lu-banner'; stage.appendChild(el); }
  el.className = 'lu-banner' + (boss ? ' boss' : '');
  el.innerHTML = `${kicker ? `<small>${esc(kicker)}</small>` : ''}<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
  void el.offsetWidth;                 // restart the animation
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const BANNER_CSS = `
.lu-banner{position:absolute;left:50%;top:18%;transform:translate(-50%,-30px) scale(.9);opacity:0;pointer-events:none;z-index:5;
  text-align:center;padding:10px 26px 12px;border-radius:18px;background:rgba(29,20,16,.9);border:2px solid #ffd23f;color:#fff4e6;
  box-shadow:0 14px 40px rgba(0,0,0,.45);transition:transform .35s cubic-bezier(.2,1.4,.4,1),opacity .25s;max-width:92%}
.lu-banner.show{opacity:1;transform:translate(-50%,0) scale(1)}
.lu-banner small{display:block;font-weight:900;letter-spacing:.18em;color:#ffd23f;font-size:.75em}
.lu-banner b{display:block;font-size:clamp(1.3rem,4.5vw,2.6rem);font-weight:900;line-height:1.1}
.lu-banner span{display:block;color:#d8c2a8;font-size:clamp(.9rem,2.4vw,1.25rem);margin-top:4px}
.lu-banner.boss{top:50%;transform:translate(-50%,-50%) scale(.6);background:linear-gradient(160deg,#5a1a0e,#1d1410);border-color:#ff5a5f;padding:20px 36px 24px}
.lu-banner.boss.show{transform:translate(-50%,-50%) scale(1)}
.lu-banner.boss small{color:#ff8a7a}
.lu-banner.boss b{font-size:clamp(2rem,7vw,4.2rem);color:#ffd23f;text-transform:uppercase;letter-spacing:.02em}
`;
