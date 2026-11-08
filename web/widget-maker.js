// Créateur de widgets Dancing! : une description (éléments, style, texte, disposition, animation) devient un widget tosu autonome.
// Le même fichier HTML tourne dans tosu en direct, dans l'aperçu de l'éditeur et dans l'export vidéo.

// Données proposées. path : chemin dans le message tosu v2 ; digits : décimales ; ch : largeur réservée (le widget ne bouge pas).
export const FIELDS = {
  pp:       { label: 'PP',          path: 'play.pp.current',          unit: 'pp', ch: 4 },
  ppfc:     { label: 'PP si FC',    path: 'play.pp.fc',               unit: 'pp', ch: 4 },
  combo:    { label: 'Combo',       path: 'play.combo.current',       unit: '×',  ch: 4 },
  maxcombo: { label: 'Combo max',   path: 'play.combo.max',           unit: '×',  ch: 4 },
  acc:      { label: 'Précision',   path: 'play.accuracy',            unit: '%',  ch: 5, digits: 2 },
  score:    { label: 'Score',       path: 'play.score',               ch: 10 },
  ur:       { label: 'UR',          path: 'play.unstableRate',        ch: 5, digits: 1 },
  h300:     { label: '300',         path: 'play.hits.300',            ch: 4, color: '#5ab8ff' },
  h100:     { label: '100',         path: 'play.hits.100',            ch: 3, color: '#6fe39a' },
  h50:      { label: '50',          path: 'play.hits.50',             ch: 3, color: '#ffd84b' },
  miss:     { label: 'Miss',        path: 'play.hits.0',              ch: 3, color: '#ff6b74' },
  sb:       { label: 'Slider breaks', path: 'play.hits.sliderBreaks', ch: 3, color: '#ff9f5a' },
  hpnum:    { label: 'Vie',         path: 'play.healthBar.normal',    unit: '%',  ch: 3, scale: 0.5 },
  grade:    { label: 'Rang',        path: 'play.rank.current',        text: true, ch: 2 },
  mods:     { label: 'Mods',        path: 'play.mods.name',           text: true, ch: 6 },
  stars:    { label: 'Étoiles',     path: 'beatmap.stats.stars.total', unit: '★', ch: 4, digits: 2 },
  bpm:      { label: 'BPM',         path: 'beatmap.stats.bpm.realtime', ch: 3 },
  time:     { label: 'Temps',       clock: true, ch: 11 },
  title:    { label: 'Titre',       path: 'beatmap.title',            text: true, ch: 18 },
  artist:   { label: 'Artiste',     path: 'beatmap.artist',           text: true, ch: 14 },
  version:  { label: 'Difficulté',  path: 'beatmap.version',          text: true, ch: 14 },
  mapper:   { label: 'Mappeur',     path: 'beatmap.mapper',           text: true, ch: 12 },
  progress: { label: 'Progression', bar: 'progress', ch: 14 },
  hp:       { label: 'Barre de vie', bar: 'hp', ch: 14 },
  k1:       { label: 'K1',          key: 'k1', ch: 4 },
  k2:       { label: 'K2',          key: 'k2', ch: 4 },
};
export const STYLES = { glass: 'Verre', solid: 'Plein', outline: 'Contour', gradient: 'Dégradé', none: 'Aucun' };
export const FONTS = { Nunito: 'Nunito', 'Segoe UI': 'Segoe UI', Bahnschrift: 'Bahnschrift (étroite)', Consolas: 'Consolas (chasse fixe)', Georgia: 'Georgia (empattements)' };
export const LAYOUTS = { row: 'Ligne', column: 'Colonne', grid2: 'Grille 2', grid3: 'Grille 3' };

// Modèles de départ du créateur.
export const TEMPLATES = {
  'Compteur pp': { items: ['pp', 'ppfc'], layout: 'row', fontSize: 34, stripe: true },
  'Précision': { items: ['acc', 'ur'], layout: 'row', fontSize: 30 },
  'Hits': { items: ['h300', 'h100', 'h50', 'miss'], layout: 'row', fontSize: 24, dividers: true },
  'Fiche map': { items: ['title', 'artist', 'version', 'progress'], layout: 'column', fontSize: 22, labels: 'off', align: 'left' },
  'Combo géant': { items: ['combo'], layout: 'row', fontSize: 64, style: 'none', glow: true, labels: 'off' },
  'Touches': { items: ['k1', 'k2'], layout: 'row', fontSize: 26 },
};

export const defaultSpec = () => ({
  name: 'Mon widget', items: [{ k: 'pp' }, { k: 'acc' }, { k: 'combo' }],
  style: 'glass', accent: '#ff6fa8', bg: '#0e0e14', bgAlpha: 0.34, blur: 18, radius: 14, border: 1, borderAccent: false, stripe: false,
  font: 'Nunito', fontSize: 26, weight: 900, textColor: '#ffffff', labelColor: '#ffffff', align: 'left', labels: 'top', upper: true, glow: false,
  layout: 'row', gap: 1, pad: 1, dividers: false,
  anim: 'slide', roll: 'smooth', kick: true,
});

// Anciennes créations (taille S/M/L, intitulés oui/non, éléments en texte) → format actuel.
export function normalizeSpec(s = {}) {
  const d = defaultSpec(), o = { ...d, ...s };
  if (s.size && !s.fontSize) o.fontSize = { S: 18, M: 26, L: 38 }[s.size] || 26;
  if (typeof s.labels === 'boolean') o.labels = s.labels ? 'top' : 'off';
  o.items = (s.items || d.items).map(it => typeof it === 'string' ? { k: it } : it).filter(it => FIELDS[it.k]);
  return o;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = (c, d) => /^#[0-9a-f]{6}$/i.test(c) ? c : d;
const rgba = (c, a) => `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`;
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// Partie commune : chiffres qui défilent, connexion tosu (reconnexion), démo pour l'aperçu (?demo).
const core = speed => `
const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, '\\u202f');
const nums = new Map(), SPEED = ${speed}, KICK = document.body.dataset.kick === '1';
function roll(el, target, digits) {
  let s = nums.get(el); if (!s) { s = { v: target, t: target, digits }; nums.set(el, s); }
  if (target !== s.t) { if (KICK && target > s.t) { el.classList.remove('kick'); void el.offsetWidth; el.classList.add('kick'); } s.t = target; }
}
let last = 0;
(function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
  for (const [el, s] of nums) { s.v = SPEED ? s.v + (s.t - s.v) * (1 - Math.exp(-SPEED * dt)) : s.t; if (Math.abs(s.t - s.v) < 0.5 / 10 ** s.digits) s.v = s.t; el.textContent = s.digits ? s.v.toFixed(s.digits) : fmt(s.v); }
  requestAnimationFrame(frame);
})(0);
const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function demo(cb) {
  let t = 0, c = 0, mx = 0, h = { 300: 0, 100: 0, 50: 0, 0: 0, sliderBreaks: 0 }, k1 = 0, k2 = 0, lane = 0;
  setInterval(() => {
    t += 120; const r = Math.random();
    if (r < .02) { h[0]++; c = 0; } else { r < .07 ? h[100]++ : r < .075 ? h[50]++ : h[300]++; c++; mx = Math.max(mx, c); }
    if (r > .995) h.sliderBreaks++;
    lane ? k2++ : k1++; lane ^= 1;
    const n = h[300] + h[100] + h[50] + h[0], acc = n ? (300 * h[300] + 100 * h[100] + 50 * h[50]) / (3 * n) : 100;
    const live = t * 4 % 228000;
    cb({ beatmap: { title: 'over the top', artist: 'xi', version: 'interstellar dimensions', mapper: 'Monstrata', stats: { stars: { total: 7.84 }, bpm: { realtime: 200 } }, time: { firstObject: 0, lastObject: 228000, live } },
      play: { pp: { current: Math.min(486, t / 60), fc: 486 }, accuracy: acc, score: n * 3127, unstableRate: 78 + Math.sin(t / 900) * 6, hits: h, combo: { current: c, max: mx }, mods: { name: 'HDDT' },
        rank: { current: acc > 98 ? 'SS' : acc > 95 ? 'S' : 'A' }, healthBar: { normal: 140 + Math.sin(t / 700) * 50 } } },
      { keys: { k1: { isPressed: !lane, count: k1 }, k2: { isPressed: !!lane, count: k2 } } });
  }, 120);
}
function connect(path, cb) {
  const ws = new WebSocket('ws://' + (location.host || '127.0.0.1:24050') + path);
  ws.onmessage = e => { try { cb(JSON.parse(e.data)); } catch {} };
  ws.onclose = () => setTimeout(() => connect(path, cb), 1000);
}`;

export function makeWidget(raw, size) {
  const s = normalizeSpec(raw);
  const accent = hex(s.accent, '#ff6fa8'), bgc = hex(s.bg, '#0e0e14'), text = hex(s.textColor, '#ffffff'), labc = hex(s.labelColor, '#ffffff');
  const fs = num(s.fontSize, 12, 72, 26), radius = num(s.radius, 0, 36, 14), alpha = num(s.bgAlpha, 0, 1, .34), blur = num(s.blur, 0, 40, 18), border = num(s.border, 0, 4, 1);
  const pad = Math.round(fs * .55 * num(s.pad, 0, 3, 1)), gap = Math.round(fs * .9 * num(s.gap, 0, 3, 1));
  const font = FONTS[s.font] ? s.font : 'Nunito', weight = [600, 700, 800, 900].includes(+s.weight) ? +s.weight : 900;
  const align = ['left', 'center', 'right'].includes(s.align) ? s.align : 'left';
  const items = s.items;
  const cells = items.map((it, i) => {
    const f = FIELDS[it.k], c = hex(it.color, '') || f.color || '';
    const lab = s.labels !== 'off' ? `<div class="lbl"${c ? ` style="color:${c}"` : ''}>${esc(it.label || f.label)}</div>` : '';
    const wrap = inner => `<div class="c${f.bar ? ' bar-c' : ''}${f.key ? ' key' : ''}"${f.key ? ` id="k${i}"` : ''}>${s.labels === 'bottom' ? inner + lab : lab + inner}</div>`;
    if (f.bar) return wrap(`<div class="bar"><i id="f${i}"${c ? ` style="background:${c};box-shadow:0 0 10px ${c}"` : ''}></i></div>`);
    if (f.key) return wrap(`<span class="num" id="f${i}" style="min-width:${f.ch}ch">0</span>`);
    const unit = f.unit ? `<span class="unit"${c ? ` style="color:${c}"` : ''}>${esc(f.unit)}</span>` : '';
    const span = f.text || f.clock ? `<span class="txt" id="f${i}" style="width:${f.ch}ch">—</span>` : `<span class="num" id="f${i}">0</span>`;
    return wrap(`<div class="v" style="min-width:${f.ch + (f.unit ? 1.5 : 0)}ch">${span}${unit}</div>`);
  }).join('');
  const bgCss = {
    glass: `background: linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.03) 55%, rgba(255,255,255,.07)), ${rgba(bgc, alpha)}; backdrop-filter: blur(${blur}px) saturate(1.6);`,
    solid: `background: ${rgba(bgc, Math.max(alpha, .6))};`,
    outline: 'background: transparent;',
    gradient: `background: linear-gradient(135deg, ${rgba(accent, Math.max(alpha, .5))}, ${rgba(bgc, Math.max(alpha, .6))});`,
    none: 'background: none;',
  }[s.style] || 'background: none;';
  const edge = s.style === 'none' || border === 0 ? '' : `inset 0 0 0 ${border}px ${s.borderAccent || s.style === 'outline' ? accent : 'rgba(255,255,255,.14)'}`;
  const shine = s.style === 'glass' ? 'inset 0 1px 0 rgba(255,255,255,.28)' : '';
  const shadow = [shine, edge].filter(Boolean).join(', ') || 'none';
  const cols = s.layout === 'grid2' ? 2 : s.layout === 'grid3' ? 3 : 0;
  const lay = cols ? `display: inline-grid; grid-template-columns: repeat(${cols}, auto);` : `display: inline-flex; flex-direction: ${s.layout === 'column' ? 'column' : 'row'};`;
  const anims = { slide: 'from { opacity: 0; transform: translateY(10px) scale(.97); }', fade: 'from { opacity: 0; }', zoom: 'from { opacity: 0; transform: scale(.8); }' };
  const css = `
@font-face { font-family: Nunito; font-weight: 600 900; src: local('Nunito'), url('/fonts/nunito-latin-800-normal.woff2'), url('/Replay%20HUD%202/fonts/nunito-800.woff2'); }
html, body { margin: 0; background: transparent; overflow: hidden; }
* { box-sizing: border-box; }
.w { ${size ? `width: ${size[0]}px; height: ${size[1]}px; ` : ''}${lay} position: relative; overflow: hidden; gap: ${gap}px; padding: ${pad}px ${Math.round(pad * 1.5) + (s.stripe ? 6 : 0)}px;
  border-radius: ${s.style === 'none' ? 0 : radius}px; ${bgCss} box-shadow: ${shadow}; color: ${text}; text-align: ${align};
  ${cols || s.layout === 'column' ? `justify-items: ${align === 'center' ? 'center' : align === 'right' ? 'end' : 'start'}; align-items: ${align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'};` : `justify-content: ${size ? 'space-between' : 'flex-start'}; align-items: flex-end;`}
  font-family: '${font}', Nunito, 'Segoe UI', sans-serif; text-shadow: ${s.glow ? `0 0 14px ${rgba(accent, .85)}, 0 1px 6px rgba(0,0,0,.5)` : '0 1px 8px rgba(0,0,0,.4)'};
  ${s.anim !== 'none' && anims[s.anim] ? 'animation: in .7s cubic-bezier(.2,.9,.25,1.15) both;' : ''} }
${s.stripe ? `.w::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: ${accent}; box-shadow: 0 0 12px ${accent}; }` : ''}
${s.dividers && !cols ? `.c + .c { ${s.layout === 'column' ? 'border-top' : 'border-left'}: 1px solid ${rgba(text, .16)}; ${s.layout === 'column' ? 'padding-top' : 'padding-left'}: ${gap}px; }` : ''}
.c { display: flex; flex-direction: column; gap: 2px; align-items: ${align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'}; }
.lbl { font-size: ${Math.max(10, Math.round(fs * .42))}px; font-weight: 800; letter-spacing: ${s.upper ? '.06em' : '0'}; ${s.upper ? 'text-transform: uppercase;' : ''} color: ${rgba(labc, .62)}; }
.v { font-size: ${fs}px; font-weight: ${weight}; line-height: 1.15; white-space: nowrap; }
.num { display: inline-block; font-variant-numeric: tabular-nums; }
.txt { display: inline-block; font-size: .72em; font-weight: ${Math.min(weight, 800)}; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
.unit { font-size: .55em; font-weight: 800; color: ${accent}; margin-left: 4px; }
.bar-c { min-width: ${Math.round(fs * 7)}px; align-self: stretch; justify-content: center; gap: 6px; }
.bar { height: ${Math.max(4, Math.round(fs * .22))}px; border-radius: 99px; background: ${rgba(text, .14)}; overflow: hidden; width: 100%; }
.bar i { display: block; height: 100%; width: 0; background: ${accent}; box-shadow: 0 0 10px ${accent}; transition: width .25s; }
.key { padding: 4px 10px; border-radius: ${Math.min(radius, 12)}px; background: ${rgba(text, .08)}; font-size: ${Math.round(fs * .8)}px; font-weight: ${weight}; transition: background .08s, transform .08s; }
.key .num { display: block; }
.key.on { background: ${rgba(accent, .34)}; transform: translateY(1px) scale(.97); }
.kick { animation: kick .32s cubic-bezier(.3,1.6,.5,1); }
@keyframes kick { 35% { transform: translateY(-2px) scale(1.08); } }
${anims[s.anim] ? `@keyframes in { ${anims[s.anim]} }` : ''}`;
  const fields = JSON.stringify(items.map(it => FIELDS[it.k]));
  const speed = { smooth: 14, fast: 32, off: 0 }[s.roll] ?? 14;
  const js = `
const F = ${fields};
function update(d) {
  F.forEach((f, i) => {
    const el = $('#f' + i); if (!el || f.key) return;
    if (f.bar === 'progress') { const t = d.beatmap?.time || {}, len = Math.max(1, (t.lastObject || 0) - (t.firstObject || 0)); el.style.width = Math.min(100, Math.max(0, ((t.live || 0) - (t.firstObject || 0)) / len * 100)) + '%'; }
    else if (f.bar === 'hp') el.style.width = Math.min(100, (d.play?.healthBar?.normal ?? 200) / 2) + '%';
    else if (f.clock) { const t = d.beatmap?.time || {}; el.textContent = mmss((t.live || 0) - (t.firstObject || 0)) + ' / ' + mmss((t.lastObject || 0) - (t.firstObject || 0)); }
    else if (f.text) el.textContent = get(d, f.path) || '—';
    else roll(el, (Number(get(d, f.path)) || 0) * (f.scale || 1), f.digits || 0);
  });
}
function keys(p) {
  F.forEach((f, i) => { if (!f.key) return; const k = p.keys?.[f.key] || {}; $('#k' + i).classList.toggle('on', !!k.isPressed); roll($('#f' + i), k.count || 0, 0); });
}
if (location.search.includes('demo')) demo((v2, precise) => { update(v2); keys(precise); });
else { connect('/websocket/v2', update); if (F.some(f => f.key)) connect('/websocket/v2/precise', keys); }`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(s.name)}</title><style>${css}</style></head>
<body data-kick="${s.kick ? 1 : 0}"><div class="w" id="w">${cells}</div>
<script>${core(speed)}${js}</script></body></html>
`;
}
