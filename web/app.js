import { demoData } from './demo-data.js';
import { HUD, Timeline, defaults as HUD_DEFAULTS, W, H, modList, BOX, WIDGET_NAMES, widgetRect } from './hud.js';
import { BUILTIN, THEMES, dancingPresets, widgetPlacement } from './presets.js';
import { dancingWidget, drawDancingWidgets } from './dancing-widgets.js';
import { tosuMessages } from './tosu-emu.js';
import { FIELDS, STYLES, FONTS, LAYOUTS, TEMPLATES, defaultSpec, normalizeSpec, makeWidget } from './widget-maker.js';
import { ManiaTimeline, drawMania, drawManiaIntro, drawManiaResults, maniaBackdrop, maniaTosu, maniaDefaults, THEMES as MANIA_THEMES } from './mania.js';
import { drawIntro, drawOutro, prepareBackdrop } from './scenes.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); } e.append(...kids.flat().filter(k => k != null && k !== false)); return e; };
const S = { token: '', app: null, danserDefaults: {}, skins: [], replays: [], videos: [], job: null, selected: null, exportData: null };

// ---------- icons ----------
const ICONS = {
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>', pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
  image: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>', layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H17c3 0 5.5-2.5 5.5-5.5C22 6 17.5 2 12 2z"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  chev: '<polyline points="9 18 15 12 9 6"/>', info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>', check: '<polyline points="20 6 9 17 4 12"/>', plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
};
const icon = n => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.classList.add('ic'); s.innerHTML = ICONS[n] || ''; return s; };
const hydrate = (root = document) => root.querySelectorAll('i[data-i]').forEach(i => i.replaceWith(icon(i.dataset.i)));

// ---------- api / toasts / save ----------
async function api(p, body, raw) {
  const r = await fetch(p, body === undefined ? {} : { method: 'POST', headers: raw ? { 'x-token': S.token, ...raw } : { 'x-token': S.token, 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Error(j.error || r.statusText); return j;
}
function toast(msg, bad) { const t = el('div', { class: 'toast' + (bad ? ' bad' : '') }, icon(bad ? 'alert' : 'check'), msg); $('#toasts').append(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2400); }
let saveT, settingsWrite = Promise.resolve();
function commitSettings() {
  clearTimeout(saveT);
  const settings = structuredClone(S.app);
  settingsWrite = settingsWrite.catch(() => {}).then(() => api('/api/settings', settings));
  return settingsWrite;
}
function save(quiet) {
  clearTimeout(saveT);
  saveT = setTimeout(() => commitSettings().then(() => !quiet && toast('Enregistré')).catch(e => toast(e.message, true)), 450);
}

// ---------- danser settings helpers ----------
const getP = (o, p) => p.reduce((a, k) => a == null ? a : a[k], o);
function setP(o, p, v) { let a = o; for (const k of p.slice(0, -1)) a = a[k] ??= {}; a[p.at(-1)] = v; }
function delP(o, p) { const st = []; let a = o; for (const k of p.slice(0, -1)) { if (!a?.[k]) return; st.push([a, k]); a = a[k]; } delete a[p.at(-1)]; for (let i = st.length - 1; i >= 0; i--) { const [par, k] = st[i]; if (!Object.keys(par[k]).length) delete par[k]; } }
const dGet = p => { const v = getP(S.app.danser, p); return v !== undefined ? v : getP(S.danserDefaults, p); };
function dSet(p, v) { const def = getP(S.danserDefaults, p); if (JSON.stringify(def) === JSON.stringify(v)) delP(S.app.danser, p); else setP(S.app.danser, p, structuredClone(v)); save(true); }
const P = s => s.split('.');
const hudCfg = () => ({ ...HUD_DEFAULTS, ...S.app.hud });
const isHSV = v => v && typeof v === 'object' && !Array.isArray(v) && 'Hue' in v && 'Saturation' in v && 'Value' in v;
const hsvToHex = ({ Hue: h, Saturation: s, Value: v }) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
const hexToHsv = hex => { const [r, g, b] = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { Hue: (h * 60 + 360) % 360, Saturation: mx ? d / mx : 0, Value: mx }; };

// ---------- generic controls ----------
function segment(root, onPick) {
  const thumb = root.querySelector('.thumb');
  const place = () => { const on = root.querySelector('button.on'); if (on && thumb) { thumb.style.width = on.offsetWidth + 'px'; thumb.style.transform = `translateX(${on.offsetLeft - 3}px)`; } };
  root.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { root.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); place(); onPick?.(b.dataset.v); }));
  requestAnimationFrame(place); new ResizeObserver(place).observe(root); return place;
}
function segField(label, options, get, set) {
  const cur = String(get());
  const root = el('div', { class: 'seg' }, ...options.map(([v, l]) => el('button', { 'data-v': v, class: String(v) === cur ? 'on' : '' }, l)), el('span', { class: 'thumb' }));
  segment(root, v => set(v));
  return el('div', { class: 'field' }, el('div', { class: 'lab' }, label), root);
}
function sw(label, get, set, hint) { const i = el('input', { type: 'checkbox', onchange: e => set(e.target.checked) }); i.checked = !!get(); return el('div', { class: 'field row' }, el('div', {}, el('div', { class: 'lab', style: 'color:var(--tx)' }, label), hint ? el('small', {}, hint) : null), el('label', { class: 'switch' }, i, el('i'))); }
function range(label, { min, max, step = 1, fmt = v => v }, get, set, hint) {
  const v = get(), out = el('em', {}, fmt(v));
  const i = el('input', { type: 'range', min, max, step, value: v });
  const paint = () => i.style.setProperty('--p', ((i.value - min) / (max - min) * 100) + '%'); paint();
  i.addEventListener('input', () => { paint(); out.textContent = fmt(+i.value); set(+i.value, true); });
  i.addEventListener('change', () => set(+i.value, false));
  return el('div', { class: 'field' }, el('div', { class: 'lab' }, label, out), i, hint ? el('small', {}, hint) : null);
}
function select(label, options, get, set) { const s = el('select', { onchange: e => set(e.target.value) }, options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return el('option', { value: v }, l); })); s.value = String(get()); return el('div', { class: 'field' }, el('div', { class: 'lab' }, label), s); }
function text(label, get, set, ph = '') { return el('div', { class: 'field' }, el('div', { class: 'lab' }, label), el('input', { type: 'text', value: get() ?? '', placeholder: ph, onchange: e => set(e.target.value) })); }
function num(label, get, set, hint) { return el('div', { class: 'field' }, el('div', { class: 'lab' }, label), el('input', { type: 'number', min: 0, value: get(), onchange: e => set(+e.target.value) }), hint ? el('small', {}, hint) : null); }
function swatch(get, set, title) { const i = el('input', { type: 'color', value: get(), oninput: e => set(e.target.value) }); return el('label', { class: 'swatch', title }, i); }
function colorRow(label, get, set) { return el('div', { class: 'field row' }, el('div', { class: 'lab', style: 'color:var(--tx)' }, label), swatch(get, set, label)); }
const GRP_OPEN = ['Montage', 'Mes clips', 'Presets', 'Personnaliser', 'Widgets', 'Overlay osu!mania', 'Réglages mania', 'Image', 'Intro', 'Fin', 'Compte osu!'];
let grpState = {}; try { grpState = JSON.parse(localStorage.getItem('rh.grp') || '{}'); } catch { }
const grp = (title, ...kids) => {
  const key = String(title).replace(/s*«.*$/, '').trim(), open = grpState[key] ?? GRP_OPEN.includes(key);
  const d = el('details', { class: 'grp', ...(open ? { open: true } : {}) }, el('summary', {}, title), el('div', { class: 'grp-body' }, ...kids));
  d.addEventListener('toggle', () => { grpState[key] = d.open; try { localStorage.setItem('rh.grp', JSON.stringify(grpState)); } catch { } });
  return d;
};
const hint = (txt, warn, btn) => el('div', { class: 'hint' + (warn ? ' warn' : '') }, el('span', {}, txt), btn || null);

// ---------- demo data ----------
// ---------- stage / preview ----------
const P_ = { canvas: null, g: null, hud: null, scene: 'game', playing: true, pos: 0, last: 0, since: 0 };
let timeline = null, assets = {};
function sceneDur() { const sc = S.app.scenes; if (P_.scene === 'intro') return sc.introDur; if (P_.scene === 'outro') return sc.outroDur; const m = timeline.d.meta; return (m.end - m.start + 5000) / 1000; }
function rebuildTimeline() {
  const data = S.exportData || demoData(S.selected?.player || 'Ton pseudo');
  timeline = new Timeline(data, { countryRank: S.app.hud.countryRank || '12', globalRank: S.app.hud.globalRank || '1 234', playerAvatar: assets.avatar, playedIso: S.selected?.date });
  P_.hud = new HUD(hudCfg(), assets); P_.since = 0;
  $('#previewTag').textContent = S.exportData ? 'Données du dernier rendu' : 'Données de démonstration';
}
async function loadAssets() {
  const load = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const cc = S.app.hud.country || 'FR';
  const [avatar, flag, bg] = await Promise.all([S.app.hud.avatarPath ? load('/api/avatar?' + Date.now()) : null,
    /^[A-Z]{2}$/i.test(cc) ? load(`https://osu.ppy.sh/assets/images/flags/${[...cc.toUpperCase()].map(c => (0x1f1e6 + c.charCodeAt(0) - 65).toString(16)).join('-')}.svg`) : null,
    S.exportData ? load('/api/bg?' + Date.now()) : null]);
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  assets = { avatar, flag, backdrop: prepareBackdrop(bg, mk) };
  rebuildTimeline();
}
function fmt(s) { s = Math.max(0, s); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
function frame(now) {
  const dt = Math.min(100, now - (P_.last || now)); P_.last = now;
  if (S.mania && P_.canvas.offsetParent) { drawManiaPreview(dt); requestAnimationFrame(frame); return; }
  if (timeline && P_.canvas.offsetParent) {
    const dur = sceneDur();
    if (P_.playing) { P_.pos += dt / 1000 / dur; if (P_.pos >= 1) { P_.pos = 0; P_.since = 0; P_.hud = new HUD(hudCfg(), assets); } P_.since += dt; }
    const g = P_.g, t = P_.pos * dur, cfg = hudCfg();
    if (P_.scene !== 'game') hideTosu();
    if (P_.scene === 'intro') { const m = timeline.d.meta; drawIntro(g, t, dur, { meta: m, player: m.player, mods: modList(m.mods), bpm: timeline.at(m.start).bpm, countryRank: cfg.countryRank || '12', globalRank: cfg.globalRank || '1 234', settings: { dim: dGet(P('Playfield.Background.Dim.Normal')), music: dGet(P('Audio.MusicVolume')), effects: dGet(P('Audio.SampleVolume')), storyboard: dGet(P('Playfield.Background.LoadStoryboards')), video: dGet(P('Playfield.Background.LoadVideos')) } }, assets, cfg); }
    else if (P_.scene === 'outro') { drawOutro(g, t, dur, { ...(P_.sum ||= timeline.summary()), player: timeline.d.meta.player }, assets, { ...cfg, outroStyle: S.app.scenes.outroStyle }); }
    else {
      const m = timeline.d.meta, mt = m.start - 1500 + t * 1000, st = timeline.at(mt, cfg.boardSort); st.since = P_.editing ? null : P_.since;
      g.drawImage(backdropGame, 0, 0); P_.hud.draw(g, st, now);
      if (S.app.tosu.some(w => dancingWidget(w.folder))) drawDancingWidgets(g, S.app.tosu, tosuMessages(st, m));
      if (P_.editing) drawEditor(g); syncTosu(st, m);
    }
    $('#scrubFill').style.width = (P_.pos * 100) + '%'; $('#scrubKnob').style.left = (P_.pos * 100) + '%'; $('#time').textContent = fmt(t);
  }
  requestAnimationFrame(frame);
}
let backdropGame;
// ---- osu!mania : données jugées par le serveur, dessin partagé avec l'export (web/mania.js)
let maniaLoad = 0;
const maniaCfg = () => ({ ...maniaDefaults, ...(S.app.mania || {}) });
async function loadMania(r) {
  const my = ++maniaLoad; S.mania = { loading: true }; P_.pos = 0;
  try {
    const M = await api('/api/mania?replay=' + encodeURIComponent(r.id));
    const img = await new Promise(res => { if (!M.meta.bg) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '/api/mania/bg?replay=' + encodeURIComponent(r.id); });
    if (my !== maniaLoad) return;
    S.mania = { M, tl: new ManiaTimeline(M), img };
    maniaAssets();
  } catch (e) { if (my === maniaLoad) { S.mania = { error: e.message }; toast(e.message, true); } }
  if (my === maniaLoad) paneOverlay();
}
function maniaAssets() { const m = S.mania; if (!m?.M) return; m.assets = { backdrop: maniaBackdrop(m.img, maniaCfg().dim, (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })), cover: m.img }; }
function drawManiaPreview(dt) {
  const g = P_.g, m = S.mania;
  if (!m.M) {
    hideTosu(); g.fillStyle = '#09090b'; g.fillRect(0, 0, W, H);
    g.fillStyle = m.error ? '#ff8a8a' : '#9c9ca8'; g.font = '800 34px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(m.error || 'Recherche de la map osu!mania dans Songs…', W / 2, H / 2);
    $('#previewTag').textContent = m.error ? 'osu!mania · map introuvable' : 'osu!mania · chargement';
    return;
  }
  const meta = m.M.meta, cfg = maniaCfg();
  const dur = P_.scene === 'intro' ? 3 : P_.scene === 'outro' ? S.app.scenes.outroDur : (meta.end - meta.start + 3000) / meta.rate / 1000;
  if (P_.playing) { P_.pos += dt / 1000 / dur; if (P_.pos >= 1) P_.pos = 0; }
  if (P_.scene === 'intro') { hideTosu(); drawManiaIntro(g, m.M, P_.pos, cfg, m.assets); }
  else if (P_.scene === 'outro') { hideTosu(); drawManiaResults(g, m.M, P_.pos, cfg, m.assets); }
  else {
    const t = meta.start - 1500 * meta.rate + P_.pos * dur * 1000 * meta.rate;
    drawMania(g, m.M, m.tl, t, cfg, m.assets);
    const x = maniaTosu(m.tl.at(t), m.M), mm = { ...x.meta, mods: meta.mods.join('') };
    if (S.app.tosu.some(w => dancingWidget(w.folder))) drawDancingWidgets(g, S.app.tosu, tosuMessages(x.st, mm));
    if (P_.editing) drawEditor(g); syncTosu(x.st, mm);
  }
  $('#previewTag').textContent = `osu!mania · ${meta.keys}K · moteur Dancing!`;
  $('#scrubFill').style.width = (P_.pos * 100) + '%'; $('#scrubKnob').style.left = (P_.pos * 100) + '%'; $('#time').textContent = fmt(P_.pos * dur);
}
function maniaBlock() {
  const c = maniaCfg(), m = S.app.mania ||= {};
  const set = k => (v, live) => { m[k] = v; if (k === 'dim') maniaAssets(); if (!live) save(true); };
  const cards = el('div', { class: 'presetgrid' }, Object.entries(MANIA_THEMES).map(([id, t], i) => el('button', { class: 'pcard' + (c.theme === id ? ' on' : ''), style: `--i:${i}`, onclick: () => { m.theme = id; save(true); paneOverlay(); } },
    el('div', { class: 'sw mania-sw ' + id }, [0, 1, 2, 3].map(() => el('i'))), el('b', {}, t.name), el('small', {}, t.desc))));
  return [
    grp('Overlay osu!mania', hint('Dessiné par Dancing! (danser ne gère que le standard).'), cards),
    grp('Réglages mania',
      colorRow('Couleur d’accent', () => c.accent, set('accent')),
      range('Vitesse de défilement', { min: 300, max: 1400, step: 10, fmt: v => `${v} ms à l’écran` }, () => c.scroll, set('scroll'), 'Plus la valeur est basse, plus les notes descendent vite.'),
      range('Largeur des colonnes', { min: 0, max: 140, step: 2, fmt: v => v ? v + ' px' : 'auto' }, () => c.lane, set('lane')),
      range('Fond assombri', { min: 0, max: 1, step: 0.01, fmt: pct }, () => c.dim, set('dim')),
      sw('Barre d’erreur', () => c.errorBar, set('errorBar')),
      sw('Compteurs de touches', () => c.keyCounts, set('keyCounts'))),
  ];
}
function makeGameBackdrop() {
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 1100); gr.addColorStop(0, '#16171d'); gr.addColorStop(1, '#040405'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.lineWidth = 6; [[760, 520], [880, 430], [1010, 470], [1120, 600], [1040, 720]].forEach(([x, y], i) => { g.globalAlpha = 0.08 + i * 0.05; g.strokeStyle = '#dfe3ea'; g.beginPath(); g.arc(x, y, 58, 0, Math.PI * 2); g.stroke(); });
  return c;
}
function setScene(s) { P_.scene = s; P_.pos = 0; P_.since = 0; P_.sum = null; P_.playing = true; playIcon(); $$('#sceneSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === s)); placeScene(); }
function playIcon() { $('#btnPlay').replaceChildren(icon(P_.playing ? 'pause' : 'play')); }
let placeScene;

// ---------- inspector panes ----------
const RES = [['1280x720', '720p'], ['1920x1080', '1080p'], ['2560x1440', '1440p'], ['3840x2160', '4K']];
const ENC = [['libx264', 'H.264 · CPU (x264)'], ['h264_nvenc', 'H.264 · NVIDIA'], ['hevc_nvenc', 'H.265 · NVIDIA'], ['av1_nvenc', 'AV1 · NVIDIA'], ['h264_amf', 'H.264 · AMD'], ['hevc_amf', 'H.265 · AMD'], ['h264_qsv', 'H.264 · Intel'], ['hevc_qsv', 'H.265 · Intel'], ['libx265', 'H.265 · CPU (x265)'], ['libsvtav1', 'AV1 · CPU']];
const pct = v => Math.round(v * 100) + '%';
// Flou de mouvement : chaque préréglage vise une durée de flou (ms), pas un nombre d'images. danser mélange BlendFrames images
// rendues à FPS × Oversample : à 240 i/s, 12 images ×8 ne floutent que 6 ms (invisible). On recalcule BlendFrames depuis le FPS.
const BLUR = [
  { k: 'off', l: 'Aucun', s: 'net', dots: [0] },
  { k: 'light', l: 'Léger', s: '8 ms', o: 6, ms: 8, gw: 1.5, dots: [0, 7] },
  { k: 'bal', l: 'Équilibré', s: '16 ms', o: 8, ms: 16, gw: 2, dots: [0, 7, 14] },
  { k: 'intense', l: 'Intense', s: '28 ms', o: 10, ms: 28, gw: 3, dots: [0, 6, 12, 18] },
  { k: 'extreme', l: 'Extrême', s: '45 ms', o: 12, ms: 45, gw: 4, dots: [0, 5, 10, 15, 20] },
];
const blurWindow = mb => mb?.Enabled ? mb.BlendFrames / ((dGet(P('Recording.FPS')) || 60) * (mb.OversampleMultiplier || 1)) * 1000 : 0;
function blurPreset() { const mb = dGet(P('Recording.MotionBlur')); if (!mb?.Enabled) return 'off'; const w = blurWindow(mb); return BLUR.slice(1).reduce((a, b) => Math.abs(b.ms - w) < Math.abs(a.ms - w) ? b : a).k; }
function applyBlur(k) {
  const b = BLUR.find(x => x.k === k), mb = dGet(P('Recording.MotionBlur')) || {};
  if (!b?.ms) return dSet(P('Recording.MotionBlur'), { ...mb, Enabled: false });
  const fps = dGet(P('Recording.FPS')) || 60, frames = Math.max(b.o, Math.min(512, Math.round(b.ms / 1000 * fps * b.o)));
  dSet(P('Recording.MotionBlur'), { ...mb, Enabled: true, OversampleMultiplier: b.o, BlendFrames: frames, GaussWeightsMult: b.gw });
}

function paneRender() {
  const r = S.app.render, rs = k => (v, live) => { r[k] = v; if (!live) save(true); };
  const fps = dGet(P('Recording.FPS')), blur = blurPreset();
  const presets = el('div', { class: 'presets' }, BLUR.map(b => el('button', { class: 'preset' + (b.k === blur ? ' on' : ''), onclick: () => { applyBlur(b.k); paneRender(); } },
    el('div', { class: 'vis' }, b.dots.map((d, i) => el('i', { style: `left:${d + 4}px;opacity:${(i + 1) / b.dots.length};filter:blur(${b.dots.length > 1 ? 0.6 : 0}px)` }))), el('b', {}, b.l), el('small', {}, b.s))));
  const blurInfo = blur === 'off' ? hint('Image nette. L’overlay reste toujours net.')
    : fps > 60 ? hint(`À ${fps} i/s avec flou, le rendu est ${Math.round(fps / 60)}× plus long qu’en 60, pour un résultat presque identique.`, true, el('button', { class: 'btn ghost sm', onclick: () => { const k = blurPreset(); dSet(P('Recording.FPS'), 60); if (k !== 'off') applyBlur(k); paneRender(); } }, 'Passer à 60 FPS'))
      : hint(`Flou sur ${Math.round(blurWindow(dGet(P('Recording.MotionBlur'))))} ms : ${dGet(P('Recording.MotionBlur')).BlendFrames} images fusionnées par image finale.`);
  $('#t-render').replaceChildren(
    grp('Image',
      segField('Résolution', RES, () => `${dGet(P('Recording.FrameWidth'))}x${dGet(P('Recording.FrameHeight'))}`, v => { const [w, h] = v.split('x').map(Number); dSet(P('Recording.FrameWidth'), w); dSet(P('Recording.FrameHeight'), h); }),
      segField('Images par seconde', [[30, '30'], [60, '60'], [120, '120'], [240, '240']], () => fps, v => { const k = blurPreset(); dSet(P('Recording.FPS'), +v); if (k !== 'off') applyBlur(k); paneRender(); }),
      select('Encodeur', ENC, () => dGet(P('Recording.Encoder')), v => dSet(P('Recording.Encoder'), v)),
      range('Qualité finale', { min: 10, max: 34, fmt: v => v <= 15 ? `${v} · excellente` : v <= 22 ? `${v} · élevée` : v <= 28 ? `${v} · moyenne` : `${v} · légère` }, () => r.finalQuality, rs('finalQuality'))),
    grp('Flou de mouvement', presets, blurInfo),
    grp('Son',
      range('Volume général', { min: 0, max: 1, step: 0.01, fmt: pct }, () => dGet(P('Audio.GeneralVolume')), (v, l) => !l && dSet(P('Audio.GeneralVolume'), v)),
      el('div', { class: 'two' }, range('Musique', { min: 0, max: 1, step: 0.01, fmt: pct }, () => dGet(P('Audio.MusicVolume')), (v, l) => !l && dSet(P('Audio.MusicVolume'), v)),
        range('Hitsounds', { min: 0, max: 1, step: 0.01, fmt: pct }, () => dGet(P('Audio.SampleVolume')), (v, l) => !l && dSet(P('Audio.SampleVolume'), v)))),
    grp('Jeu',
      range('Fond assombri', { min: 0, max: 1, step: 0.01, fmt: pct }, () => dGet(P('Playfield.Background.Dim.Normal')), (v, l) => !l && dSet(P('Playfield.Background.Dim.Normal'), v)),
      sw('Storyboard', () => dGet(P('Playfield.Background.LoadStoryboards')), v => dSet(P('Playfield.Background.LoadStoryboards'), v)),
      sw('Vidéo de fond', () => dGet(P('Playfield.Background.LoadVideos')), v => dSet(P('Playfield.Background.LoadVideos'), v)),
      sw('Passer l’attente avant la 1ʳᵉ note', () => r.quickstart, rs('quickstart'))),
    grp('Plage du replay', el('div', { class: 'two' }, num('Début (s)', () => r.clipStart, rs('clipStart'), '0 = début'), num('Fin (s)', () => r.clipEnd, rs('clipEnd'), '0 = fin'))),
  );
  hydrate($('#t-render'));
}

function paneSkin() {
  const cur = dGet(P('Skin.CurrentSkin')), q = el('input', { placeholder: 'Rechercher un skin…', autocomplete: 'off' });
  const grid = el('div', { class: 'skins' });
  const draw = () => {
    const f = q.value.trim().toLowerCase();
    grid.replaceChildren(...S.skins.filter(s => !f || s.toLowerCase().includes(f)).slice(0, 120).map((s, i) => {
      const src = n => `/api/skin?name=${encodeURIComponent(s)}&f=${n}`;
      const art = s === 'default' ? [el('div', { class: 'ph' })] : [el('img', { class: 'hc', src: src('hitcircle'), loading: 'lazy', onerror: e => e.target.remove() }), el('img', { class: 'hc', src: src('hitcircleoverlay'), loading: 'lazy', onerror: e => e.target.remove() }), el('img', { class: 'cur', src: src('cursor'), loading: 'lazy', onerror: e => e.target.remove() })];
      return el('button', { class: 'skin' + (s === cur ? ' on' : ''), style: `--i:${i}`, onclick: () => { dSet(P('Skin.CurrentSkin'), s); toast('Skin : ' + s); paneSkin(); } }, el('div', { class: 'art' }, art), el('span', { class: 'nm', title: s }, s));
    }));
  };
  q.addEventListener('input', draw); draw();
  $('#t-skin').replaceChildren(
    grp('Skin', el('div', { class: 'search' }, icon('search'), q), grid),
    grp('Curseur', sw('Curseur du skin', () => dGet(P('Skin.Cursor.UseSkinCursor')), v => dSet(P('Skin.Cursor.UseSkinCursor'), v)),
      range('Taille du curseur', { min: 0.5, max: 2, step: 0.05, fmt: v => '×' + (+v).toFixed(2) }, () => dGet(P('Skin.Cursor.Scale')), (v, l) => !l && dSet(P('Skin.Cursor.Scale'), v))),
    grp('Secours', select('Skin de secours (éléments manquants)', S.skins, () => dGet(P('Skin.FallbackSkin')), v => dSet(P('Skin.FallbackSkin'), v))),
  );
}

function paneOverlay() {
  const h = S.app.hud, c = hudCfg(), set = k => (v, live) => { h[k] = v; P_.hud && (P_.hud.cfg = hudCfg()); if (!live) save(true); };
  const t = (label, k) => sw(label, () => c[k], set(k));
  const avatarImg = el('img', { src: h.avatarPath ? '/api/avatar?' + Date.now() : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#16161a"/><circle cx="24" cy="19" r="8" fill="#2f2f37"/><ellipse cx="24" cy="42" rx="15" ry="11" fill="#2f2f37"/></svg>') });
  const pick = el('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); try { const { path } = await api('/api/avatar', { data }); h.avatarPath = path; save(true); await loadAssets(); paneOverlay(); } catch (err) { toast(err.message, true); } } });
  if (S.selected?.mode === 3) { $('#t-overlay').replaceChildren(...(P_.editing ? [] : maniaBlock()), widgetsBlock()); hydrate($('#t-overlay')); return; }
  $('#t-overlay').replaceChildren(
    P_.editing ? widgetsBlock() : presetsBlock(), P_.editing ? null : customizeBlock(), P_.editing ? null : widgetsBlock(),
    grp('Éléments', t('Bandeau et barre de vie', 'showTop'), t('Combo et pp', 'showBottom'), t('Barre d’erreur et UR', 'showHitError'), t('Classement', 'showBoard'), t('Graphe de difficulté', 'showGraph'), t('Touches', 'showKeys'), t('Indicateur à droite du pp', 'showExtra')),
    grp('Joueur', el('div', { class: 'avatar-row' }, avatarImg, el('div', {}, el('button', { class: 'btn ghost sm', onclick: () => pick.click() }, 'Choisir un portrait'), h.avatarPath ? el('button', { class: 'link', style: 'margin-left:10px', onclick: () => { delete h.avatarPath; save(true); loadAssets(); paneOverlay(); } }, 'Retirer') : null, el('div', { class: 'muted', style: 'font-size:11.5px;margin-top:4px' }, 'Par défaut : l’avatar osu! du joueur')), pick),
      el('div', { class: 'two' }, text('Rang mondial', () => h.globalRank, v => { h.globalRank = v.trim(); rebuildTimeline(); save(true); }, 'auto'), text('Rang pays', () => h.countryRank, v => { h.countryRank = v.trim(); rebuildTimeline(); save(true); }, 'auto')),
      el('div', { class: 'two' }, text('Pays', () => h.country, v => { h.country = v.trim().toUpperCase(); save(true); loadAssets(); }, 'auto (FR, JP…)'), el('div', { class: 'field', style: 'justify-content:flex-end' }, t('Drapeau', 'showFlag')))),
    grp('Indicateur pp', select('Valeur', [['fc', 'Écart avec le pp si FC'], ['ss', 'Écart avec le pp si SS'], ['off', 'Masqué']], () => c.extraMode, set('extraMode')), text('Libellé', () => c.extraLabel, v => set('extraLabel')(v))),
    grp('Classement', segField('Tri', [['pp', 'Par pp'], ['score', 'Par score']], () => c.boardSort, set('boardSort')),
      range('Lignes visibles', { min: 4, max: 12 }, () => c.boardRows, set('boardRows')),
      range('Opacité des autres joueurs', { min: 0.15, max: 1, step: 0.05, fmt: pct }, () => c.boardOpacity, set('boardOpacity')),
      segField('Scores en ligne', [['Normal', 'Mondial'], ['Country', 'Pays'], ['Friends', 'Amis']], () => dGet(P('Gameplay.ScoreBoard.Mode')), v => dSet(P('Gameplay.ScoreBoard.Mode'), v)),
      sw('Uniquement les mêmes mods', () => dGet(P('Gameplay.ScoreBoard.ModsOnly')), v => dSet(P('Gameplay.ScoreBoard.ModsOnly'), v))),
    grp('Animation', t('Chiffres qui défilent', 'rollDigits'),
      range('Entrée du HUD au début du jeu', { min: 0, max: 1500, step: 50, fmt: v => v ? v + ' ms' : 'instantanée' }, () => c.hudIntro, set('hudIntro')),
      range('Vitesse des barres de touches', { min: 0.2, max: 1.2, step: 0.05, fmt: v => (+v).toFixed(2) }, () => c.keySpeed, set('keySpeed')),
      t('Barre de vie qui clignote en rouge si basse', 'hpLowWarn')),
    grp('Taille', range('Opacité globale', { min: 0.2, max: 1, step: 0.05, fmt: pct }, () => c.opacity, set('opacity')), range('Échelle', { min: 0.7, max: 1.2, step: 0.01, fmt: v => '×' + (+v).toFixed(2) }, () => c.scale, set('scale'))),
    el('button', { class: 'link', style: 'margin-top:14px', onclick: () => { S.app.hud = {}; save(); paneOverlay(); paneColors(); loadAssets(); } }, 'Réinitialiser l’overlay'),
  );
}

function paneColors() {
  const h = S.app.hud, c = hudCfg(), set = k => v => { h[k] = v; P_.hud && (P_.hud.cfg = hudCfg()); save(true); };
  const ov = (l, k) => colorRow(l, () => c[k], set(k));
  // gameplay colour source
  const src = dGet(P('Skin.UseColorsFromSkin')) ? 'skin' : dGet(P('Skin.UseBeatmapColors')) ? 'map' : dGet(P('Objects.Colors.Color.EnableRainbow')) && !dGet(P('Objects.Colors.UseComboColors')) ? 'rainbow' : 'custom';
  const setSrc = v => { dSet(P('Skin.UseColorsFromSkin'), v === 'skin'); dSet(P('Skin.UseBeatmapColors'), v === 'map'); dSet(P('Objects.Colors.UseComboColors'), v === 'custom'); dSet(P('Objects.Colors.Color.EnableRainbow'), v === 'rainbow'); paneColors(); };
  const combos = dGet(P('Objects.Colors.ComboColors')) || [];
  const comboRow = el('div', { class: 'colors-row' }, combos.map((col, i) => swatch(() => hsvToHex(col), v => { const a = structuredClone(dGet(P('Objects.Colors.ComboColors'))); a[i] = { ...a[i], ...hexToHsv(v) }; dSet(P('Objects.Colors.ComboColors'), a); }, 'Combo ' + (i + 1))),
    combos.length < 8 ? el('button', { class: 'icon-btn', title: 'Ajouter', onclick: () => { dSet(P('Objects.Colors.ComboColors'), [...combos, { Hue: (combos.length * 70) % 360, Saturation: 0.7, Value: 1 }]); paneColors(); } }, icon('plus')) : null,
    combos.length > 1 ? el('button', { class: 'icon-btn', title: 'Retirer', onclick: () => { dSet(P('Objects.Colors.ComboColors'), combos.slice(0, -1)); paneColors(); } }, icon('minus')) : null);
  const hsvRow = (label, path) => colorRow(label, () => hsvToHex(dGet(P(path))), v => dSet(P(path), { ...dGet(P(path)), ...hexToHsv(v) }));
  const border = dGet(P('Objects.Colors.Sliders.Border.UseHitCircleColor')), body = dGet(P('Objects.Colors.Sliders.Body.UseHitCircleColor'));
  $('#t-colors-game').replaceChildren(
    grp('Couleurs des cercles', segField('Couleurs', [['skin', 'Skin'], ['map', 'Map'], ['custom', 'Perso'], ['rainbow', 'Arc-en-ciel']], () => src, setSrc),
      src === 'custom' ? el('div', { class: 'field' }, el('div', { class: 'lab' }, 'Couleurs de combo'), comboRow) : null),
    grp('Couleurs des sliders', sw('Bordure = couleur du cercle', () => border, v => { dSet(P('Objects.Colors.Sliders.Border.UseHitCircleColor'), v); paneColors(); }), !border ? hsvRow('Bordure', 'Objects.Colors.Sliders.Border.Color.BaseColor') : null,
      sw('Corps = couleur du cercle', () => body, v => { dSet(P('Objects.Colors.Sliders.Body.UseHitCircleColor'), v); paneColors(); }), !body ? hsvRow('Corps', 'Objects.Colors.Sliders.Body.Color.BaseColor') : null),
    grp('Couleurs du curseur', hsvRow('Couleur', 'Cursor.Colors.BaseColor'), sw('Arc-en-ciel', () => dGet(P('Cursor.Colors.EnableRainbow')), v => dSet(P('Cursor.Colors.EnableRainbow'), v)), sw('Halo de la traînée', () => dGet(P('Cursor.EnableTrailGlow')), v => dSet(P('Cursor.EnableTrailGlow'), v)),
      dGet(P('Skin.Cursor.UseSkinCursor')) ? hint('Le curseur du skin est actif : ces couleurs s’appliquent à la traînée danser.') : null));
  $('#t-colors').replaceChildren(
    grp('Couleurs de l’overlay', ov('Textes', 'textColor'), ov('Contour du bandeau', 'tubeColor'), ov('Barre de vie', 'hpColor'), ov('Vie basse', 'hpLow'), ov('Panneaux combo / pp', 'panelColor'), ov('Barres de touches', 'keyColor')),
    grp('Couleurs de la barre d’erreur', ov('Zone 300', 'c300'), ov('Zone 100', 'c100'), ov('Zone 50', 'c50')),
    grp('Couleur des scènes', ov('Couleur d’accent (intro et fin)', 'accent')),
  );
  hydrate($('#t-colors')); hydrate($('#t-colors-game'));
}

function paneScenes() {
  const sc = S.app.scenes, set = k => (v, live) => { sc[k] = v; if (!live) save(true); };
  $('#t-scenes').replaceChildren(
    grp('Intro', el('p', {}, 'Carte animée de la map et du joueur avant le replay, sur le fond de la map.'),
      sw('Activer l’intro', () => sc.intro, set('intro')),
      range('Durée', { min: 2, max: 10, step: 0.5, fmt: v => v + ' s' }, () => sc.introDur, (v, l) => { set('introDur')(v, l); if (P_.scene === 'intro') P_.pos = 0; }),
      el('button', { class: 'btn ghost sm', onclick: () => setScene('intro') }, icon('play'), 'Voir l’intro')),
    grp('Fin', el('p', {}, 'Écran de résultats animé : rang, score, statistiques et classement de la map.'),
      sw('Activer la fin', () => sc.outro, set('outro'), 'Remplace l’écran de résultats de danser'),
      el('div', { class: 'lab' }, 'Style de la fin'),
      el('div', { class: 'presetgrid endpick' }, [['lens', 'Loupe', 'Note dans un cercle en verre, classement de la map', 'img/fin-loupe.jpg'], ['classic', 'Classique', 'Frappes, carte de précision, statistiques', 'img/fin-classique.jpg']].map(([v, name, desc, img]) =>
        el('button', { class: 'pcard' + ((sc.outroStyle || 'lens') === v ? ' on' : ''), title: desc, onclick: e => { set('outroStyle')(v); e.currentTarget.parentElement.querySelectorAll('.pcard').forEach(c => c.classList.toggle('on', c === e.currentTarget)); setScene('outro'); } },
          el('img', { class: 'pthumb', src: img, alt: '' }), el('span', { class: 'pname' }, el('b', {}, name)), el('small', { class: 'pdesc' }, desc)))),
      range('Durée', { min: 4, max: 15, step: 0.5, fmt: v => v + ' s' }, () => sc.outroDur, set('outroDur')),
      el('button', { class: 'btn ghost sm', onclick: () => setScene('outro') }, icon('play'), 'Voir la fin')),
    grp('Musique', sw('Musique de la map pendant l’intro et la fin', () => sc.music, set('music'), 'Démarre au point d’extrait de la map, avec fondus'),
      range('Volume', { min: 0, max: 1, step: 0.05, fmt: pct }, () => sc.volume, set('volume'))),
    hint('Les scènes sont ajoutées au rendu complet, pas à l’aperçu 12 s.'),
  );
  hydrate($('#t-scenes'));
}

function paneMore() {
  const mods = JSON.stringify(S.app.danser).match(/:/g)?.length || 0;
  const url = el('div', { class: 'tosu-url', hidden: true });
  $('#t-more').replaceChildren(
    accountBlock(), boardBlock(),
    grp('danser', el('p', {}, 'Toutes les options de danser, exactement comme dans son interface.'), el('button', { class: 'btn ghost', onclick: openDrawer }, icon('sliders'), 'Tous les réglages danser', mods ? el('span', { class: 'chip', style: 'margin-left:4px' }, `${mods} modifiés`) : null)),
    grp('Overlay en direct (tosu)', el('p', {}, 'Le même overlay en jeu ou dans OBS. tosu, fourni avec Dancing!, démarre tout seul avec tes réglages actuels.'),
      el('button', { class: 'btn ghost', onclick: async () => { try { const r = await api('/api/tosu', {}); url.hidden = false; url.textContent = r.url; toast('Installé dans tosu'); } catch (e) { toast(e.message, true); } } }, icon('radio'), 'Démarrer l’overlay en direct'), url),
    grp('Fichiers', el('div', { class: 'muted', style: 'font-size:12px;word-break:break-all' }, S.app.paths.output), el('button', { class: 'btn ghost sm', onclick: () => api('/api/reveal', {}) }, icon('folder'), 'Ouvrir le dossier des vidéos'),
      sw('Garder la vidéo danser intermédiaire', () => S.app.render.keepIntermediate, v => { S.app.render.keepIntermediate = v; save(true); })),
  );
}

// ---------- danser drawer ----------
const LOCKED = ['Gameplay.Score.Show', 'Gameplay.ComboCounter.Show', 'Gameplay.PPCounter.Show', 'Gameplay.HitCounter.Show', 'Gameplay.HitErrorMeter.Show', 'Gameplay.StrainGraph.Show', 'Gameplay.KeyOverlay.Show', 'Gameplay.ScoreBoard.Show', 'Gameplay.ScoreBoard.HideOthers', 'Gameplay.ScoreBoard.Compact', 'Gameplay.Underlay.Path', 'Gameplay.Statistics', 'Gameplay.HpBar.Show', 'Recording.Container', 'Recording.OutputDir'];
const ENUMS = { 'Recording.Encoder': ENC.map(e => e[0]).concat('custom'), 'Recording.AudioCodec': ['aac', 'libmp3lame', 'libopus', 'flac', 'customAudio'], 'Recording.PixelFormat': ['yuv420p', 'yuv422p', 'yuv444p', 'yuv420p10le', 'yuv444p10le'], 'Gameplay.ScoreBoard.Mode': ['Normal', 'Country', 'Friends'], 'Gameplay.Score.ProgressBar': ['Pie', 'HorizontalRight', 'HorizontalLeft', 'Horizontal', 'Vertical'] };
const nice = k => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
function openDrawer() { $('#drawer').hidden = false; danserForm(); setTimeout(() => $('#dq').focus(), 50); }
function closeDrawer() { $('#drawer').hidden = true; paneRender(); paneSkin(); paneColors(); paneMore(); }
function danserForm() {
  const root = $('#danserForm'); root.replaceChildren(); const def = S.danserDefaults;
  const locked = new Set(LOCKED); if (S.app.scenes?.outro) locked.add('Gameplay.ShowResultsScreen');
  const kv = (p, v) => {
    const key = p.join('.'), lock = locked.has(key); let ctl;
    const opts = ENUMS[key] || (/Skin\.(CurrentSkin|FallbackSkin)$/.test(key) ? S.skins : null);
    const mark = () => row.classList.toggle('mod', getP(S.app.danser, p) !== undefined);
    if (isHSV(v)) ctl = swatch(() => hsvToHex(v), x => { dSet(p, { ...v, ...hexToHsv(x) }); mark(); });
    else if (typeof v === 'boolean') { const i = el('input', { type: 'checkbox', onchange: e => { dSet(p, e.target.checked); mark(); } }); i.checked = v; i.disabled = lock; ctl = el('label', { class: 'switch' }, i, el('i')); }
    else if (opts) { ctl = el('select', { onchange: e => { dSet(p, e.target.value); mark(); } }, [...new Set([v, ...opts])].map(o => el('option', { value: o }, o))); ctl.value = v; }
    else if (typeof v === 'number') ctl = el('input', { type: 'number', value: v, step: Number.isInteger(getP(def, p) ?? v) ? 1 : 'any', onchange: e => { dSet(p, +e.target.value); mark(); } });
    else if (v && typeof v === 'object') ctl = el('textarea', { rows: 1, onchange: e => { try { dSet(p, JSON.parse(e.target.value)); mark(); } catch { toast('JSON invalide', true); } } }, JSON.stringify(v));
    else ctl = el('input', { type: 'text', value: v ?? '', onchange: e => { dSet(p, e.target.value); mark(); } });
    if (lock && ctl.tagName !== 'LABEL') ctl.disabled = true;
    const row = el('div', { class: 'kv' + (getP(S.app.danser, p) !== undefined ? ' mod' : '') + (lock ? ' lock' : ''), 'data-k': (key + ' ' + nice(p.at(-1))).toLowerCase() },
      el('label', { title: key }, nice(p.at(-1))), el('div', { class: 'ctl' }, ctl), el('button', { class: 'rst', title: 'Valeur par défaut', onclick: () => { delP(S.app.danser, p); save(true); danserForm(); } }, '↺'));
    return row;
  };
  const walk = (obj, p, body) => { for (const [k, v0] of Object.entries(obj)) { const path = [...p, k]; if (v0 && typeof v0 === 'object' && !Array.isArray(v0) && !isHSV(v0) && Object.keys(v0).length) { body.append(el('div', { class: 'sub-h' }, path.slice(1).map(nice).join(' › '))); walk(v0, path, body); } else body.append(kv(path, dGet(path))); } };
  for (const [sec, obj] of Object.entries(def)) {
    if (!obj || typeof obj !== 'object') continue;
    const body = el('div', { class: 'sec-body' }); walk(obj, [sec], body);
    const n = JSON.stringify(S.app.danser[sec] || {}).match(/:/g)?.length || 0;
    root.append(el('details', { class: 'sec', open: sec === 'Recording' }, el('summary', {}, icon('chev'), nice(sec), el('small', {}, Object.keys(obj).length + ' réglages'), n ? el('span', { class: 'badge' }, 'modifié') : null), body));
  }
  filterDanser();
}
function filterDanser() {
  const q = $('#dq').value.trim().toLowerCase();
  for (const d of $$('details.sec')) { let any = 0; for (const r of d.querySelectorAll('.kv')) { const ok = !q || r.dataset.k.includes(q); r.classList.toggle('hide', !ok); any += ok; } d.querySelectorAll('.sub-h').forEach(h => h.classList.toggle('hide', !!q)); d.classList.toggle('hide', !any); if (q && any) d.open = true; }
}

// ---------- library ----------
const ago = iso => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min'; if (s < 86400) return Math.round(s / 3600) + ' h'; if (s < 86400 * 30) return Math.round(s / 86400) + ' j'; return new Date(iso).toLocaleDateString('fr-FR'); };
function replayList() {
  const q = $('#q').value.trim().toLowerCase(), items = S.replays.filter(r => !q || `${r.player} ${r.song} ${r.diff}`.toLowerCase().includes(q));
  $('#replayList').replaceChildren(...(items.length ? items.slice(0, 300).map((r, i) => el('div', { class: 'rp' + (S.selected?.id === r.id ? ' on' : ''), style: `--i:${Math.min(i, 20)}`, onclick: () => select_(r) },
    el('div', { class: 'l1' }, el('b', {}, r.song), el('span', { class: 'acc' }, r.acc.toFixed(2) + '%')),
    el('div', { class: 'l2' }, `[${r.diff}] · ${r.player}`),
    el('div', { class: 'l3' }, r.mode === 3 ? el('span', { class: 'chip mania' }, 'MANIA') : null, r.lazer ? el('span', { class: 'chip lazer', title: 'Replay osu! lazer : rejoué avec les règles de lazer' }, 'LAZER') : null, ...r.mods.map(m => el('span', { class: 'chip ' + m }, m)), el('span', {}, `${r.combo}x`), r.miss ? el('span', { style: 'color:var(--bad)' }, `${r.miss} miss`) : null, el('span', { class: 'when' }, ago(r.date))))) : [el('div', { class: 'empty' }, S.replays.length ? 'Aucun résultat' : 'Aucun replay trouvé.')]));
}
function select_(r) {
  S.selected = r;
  const wasMania = !!S.mania;
  if (r?.mode === 3) loadMania(r); else { maniaLoad++; S.mania = null; }
  if (S.app && (wasMania || r?.mode === 3)) paneOverlay();
  if (!r) {
    localStorage.removeItem('rh.sel');
    $('#crumb').replaceChildren(el('span', { class: 'muted' }, 'Aucun replay'));
    $('#selected').replaceChildren(el('span', { class: 'muted' }, 'Choisis un replay dans la bibliothèque.'));
    rebuildTimeline(); syncButtons(); return;
  }
  localStorage.setItem('rh.sel', r.id);
  $$('.rp').forEach(x => x.classList.remove('on')); replayList();
  $('#crumb').replaceChildren(el('b', {}, r.song), el('span', { class: 'dim' }, `[${r.diff}]`), el('span', { class: 'dim' }, '·'), el('span', { class: 'muted' }, r.player), ...(r.lazer ? [el('span', { class: 'chip lazer' }, 'LAZER')] : []), ...r.mods.map(m => el('span', { class: 'chip ' + m }, m)));
  $('#selected').replaceChildren(el('div', {}, el('div', { class: 't' }, r.song), el('div', { class: 's' }, `[${r.diff}] · ${r.player} · ${new Date(r.date).toLocaleString('fr-FR')}`)),
    el('div', { class: 'stats' }, ...[['Précision', r.acc.toFixed(2) + '%'], ['Combo', r.combo + 'x'], ['Miss', r.miss], ['Score', r.score.toLocaleString('fr-FR')]].map(([a, b]) => el('div', { class: 'stat' }, el('b', {}, String(b)), el('span', {}, a)))));
  if (!S.exportData) rebuildTimeline();
  syncButtons();
}
async function upload(file) {
  if (!file?.name.toLowerCase().endsWith('.osr')) return toast('Dépose un fichier .osr', true);
  try { const { id } = await api('/api/upload', file, { 'x-name': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' }); await refresh(); const r = S.replays.find(x => x.id === id); if (r) select_(r); toast('Replay ajouté'); } catch (e) { toast(e.message, true); }
}
const size = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : (b / 1e6).toFixed(0) + ' Mo';
function videoList() {
  paneMontage();
  $('#videoCount').textContent = S.videos.length || '';
  $('#videoList').replaceChildren(...(S.videos.length ? S.videos.map((v, i) => el('div', { class: 'vid', style: `--i:${i}` }, listPlayer(v), el('div', {}, el('b', { title: v.name }, v.name), el('small', {}, size(v.size)), el('button', { class: 'link', onclick: () => api('/api/reveal', { name: v.name }) }, 'Afficher'), v.name.includes('(TikTok ') ? null : el('button', { class: 'link', onclick: () => openEditor(v.name) }, 'Montage')))) : [el('div', { class: 'empty' }, 'Tes vidéos rendues apparaîtront ici.')]));
}
// Lecteur de la liste : direct si le format est lisible ; sinon un bouton qui prépare l'aperçu H.264 au premier clic.
function listPlayer(v) {
  if (CAN_PLAY[v.codec] !== false) return el('video', { src: '/videos/' + encodeURIComponent(v.name), controls: true, preload: 'none' });
  const msg = el('small', {}, 'Vidéo en H.265 : l’appli prépare un aperçu lisible au premier clic.');
  const box = el('div', { class: 'vid-ph' }, el('button', { class: 'btn primary sm', onclick: () => {
    const video = el('video', { controls: true, autoplay: true, preload: 'auto' });
    box.replaceChildren(video, msg); bindPlayable(video, v.name, m => { msg.textContent = m; msg.hidden = !m; });
  } }, icon('play'), 'Lire'), msg);
  return box;
}

// ---------- montage : onglet dédié + éditeur plein écran (clips verticaux pour TikTok, Shorts, Reels) ----------
// Une vidéo HEVC 240 i/s occupe un décodeur matériel : tout lecteur fermé est vidé (src retiré), sinon les suivants restent noirs.
const releaseVideos = root => root?.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
// Formats que le moteur de l'appli (WebView2) sait afficher : le H.265 demande l'extension Windows « Extensions vidéo HEVC ».
const CAN_PLAY = { h264: true, '?': true, hevc: !location.search.includes('nohevc') && !!window.MediaSource?.isTypeSupported?.('video/mp4; codecs="hvc1.1.6.L120.90"'), av1: !!window.MediaSource?.isTypeSupported?.('video/mp4; codecs="av01.0.08M.08"') };
const unplayable = name => CAN_PLAY[S.videos.find(v => v.name === name)?.codec] === false;
// Branche un lecteur : l'original s'il est lisible, sinon une copie d'aperçu H.264 préparée à la demande (aussi si l'image reste vide).
function bindPlayable(video, name, status = () => {}) {
  let proxied = false;
  const useProxy = async () => {
    if (proxied) return; proxied = true;
    const t = video.currentTime || 0, wasPlaying = !video.paused; video.pause();
    status('Préparation d’un aperçu lisible (vidéo en H.265)…');
    try {
      await api('/api/proxy', { name });
      video.addEventListener('loadedmetadata', () => { if (t) video.currentTime = t; if (wasPlaying) video.play().catch(() => {}); }, { once: true });
      video.src = '/api/proxy-file?name=' + encodeURIComponent(name); status('');
    } catch (e) { status(e.message); }
  };
  if (unplayable(name)) return useProxy();
  video.addEventListener('loadedmetadata', () => { if (!video.videoWidth) useProxy(); });
  video.src = '/videos/' + encodeURIComponent(name);
}
function paneMontage() {
  if (!$('#t-montage')) return;
  const vids = S.videos.filter(v => !v.name.includes('(TikTok ')), clips = S.videos.filter(v => v.name.includes('(TikTok '));
  const label = n => n.replace(/\.mp4$/i, '');
  $('#t-montage').replaceChildren(
    grp('Montage', el('p', {}, 'Choisis une vidéo exportée : Dancing! repère ses moments forts et en fait un clip vertical 1080×1920 pour TikTok, Shorts ou Reels.'),
      vids.length ? el('div', { class: 'mlist' }, vids.map(v => el('button', { class: 'mitem', onclick: () => openEditor(v.name) },
        icon('scissors'), el('span', { class: 'mtxt' }, el('b', {}, label(v.name)), el('small', {}, size(v.size))), el('span', { class: 'chip' }, 'Monter'))))
        : el('p', { class: 'muted' }, 'Exporte d’abord une vidéo avec « Exporter la vidéo ».')),
    grp('Mes clips', clips.length ? el('div', { class: 'mlist' }, clips.map(v => el('div', { class: 'mitem' },
      icon('film'), el('span', { class: 'mtxt' }, el('b', {}, label(v.name)), el('small', {}, size(v.size))),
      el('button', { class: 'link', onclick: () => playClip(v.name) }, 'Lire'), el('button', { class: 'link', onclick: () => api('/api/reveal', { name: v.name }) }, 'Afficher'))))
      : el('p', { class: 'muted' }, 'Tes clips verticaux apparaîtront ici.')));
}
function playClip(name) {
  modal(name.replace(/\.mp4$/i, ''), el('video', { class: 'clip-player', src: '/videos/' + encodeURIComponent(name), controls: true, autoplay: true }));
}

let edState = null;
function closeEditor() {
  const e = edState; if (!e) return; edState = null;
  cancelAnimationFrame(e.raf); clearTimeout(e.poll); removeEventListener('keydown', e.keys);
  releaseVideos($('#editor')); $('#editor').hidden = true; $('#editor').replaceChildren();
  videoList();   // lecteurs de la liste recréés (vidés à l'ouverture de l'éditeur)
}
async function openEditor(name) {
  closeEditor(); $('#modal').hidden = true; releaseVideos($('#mBody')); releaseVideos($('#videoList'));
  const C = S.app.clip ||= { layout: 'zoom', cards: true, overlay: false, bg: 'dedicated' }; C.caption ??= ''; C.opacity ??= 0.45;
  if (C.v !== 2) { C.bg = 'dedicated'; C.v = 2; }   // 3.3 : le rendu vertical dédié devient le fond par défaut
  const keep = () => save(true);
  const { moments = [], info: cardInfo = null, vt = null } = await api('/api/moments?name=' + encodeURIComponent(name)).catch(() => ({}));
  // rendu vertical dédié possible si la vidéo connaît son replay et la correspondance des temps (vidéos exportées depuis la 3.3)
  const canDedicated = !!(cardInfo?.replay && vt?.map?.some(v => v != null));
  if (C.bg === 'dedicated' && !canDedicated) C.bg = cardInfo?.bg ? 'map' : 'video';
  const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const st = edState = { raf: 0, poll: 0, start: 0, end: 0, keys: null };
  const video = el('video', { class: 'ed-video', preload: 'auto', playsinline: true }), vstatus = el('div', { class: 'ed-vstatus', hidden: true });
  bindPlayable(video, name, msg => { vstatus.textContent = msg; vstatus.hidden = !msg; });
  const bgImg = cardInfo?.bg ? Object.assign(new Image(), { src: '/api/clip-bg?name=' + encodeURIComponent(name) }) : null;
  const dur = () => video.duration || 1, pct = t => t / dur() * 100 + '%';

  // ligne de temps : passage choisi, poignées de début/fin à faire glisser, moments forts, tête de lecture
  const track = el('div', { class: 'ed-track' }), range = el('div', { class: 'ed-range' }), hs = el('i', { class: 'ed-handle', title: 'Début' }), he = el('i', { class: 'ed-handle', title: 'Fin' }), head = el('i', { class: 'ed-head' });
  track.append(range, hs, he, head);
  const time = el('span', { class: 'ed-time' });
  const draw = () => { range.style.left = pct(st.start); range.style.width = (st.end - st.start) / dur() * 100 + '%'; hs.style.left = pct(st.start); he.style.left = pct(st.end); time.textContent = `${fmt(st.start)} → ${fmt(st.end)} · ${(st.end - st.start).toFixed(1)} s`; };
  const setRange = (s, e) => { st.start = Math.max(0, Math.min(s, dur() - 0.5)); st.end = Math.min(dur(), Math.max(e, st.start + 0.5)); draw(); };
  const tAt = ev => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * dur(); };
  const drag = which => ev => {
    ev.preventDefault(); ev.stopPropagation(); video.pause();
    const move = m => { const t = tAt(m); if (which === 's') { setRange(t, st.end); video.currentTime = st.start; } else { setRange(st.start, t); video.currentTime = st.end; } };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  hs.addEventListener('pointerdown', drag('s')); he.addEventListener('pointerdown', drag('e'));
  track.addEventListener('pointerdown', ev => { video.currentTime = tAt(ev); });

  const playLabel = el('span', {}, 'Lire le passage'), playIco = el('span', {}, icon('play'));
  // lecture du passage : avec l'intro activée, la carte de la map passe d'abord sur l'image figée (comme dans l'export)
  const toggle = () => {
    if (st.seq || !video.paused) { st.seq = null; video.pause(); return; }
    const fromStart = video.currentTime < st.start || video.currentTime >= st.end - 0.05;
    if (fromStart) video.currentTime = st.start;
    if (fromStart && withCards()) { st.seq = { phase: 'intro', t0: performance.now() }; playIco.replaceChildren(icon('pause')); playLabel.textContent = 'Pause'; }
    else video.play();
  };
  const playBtn = el('button', { class: 'btn primary sm', onclick: toggle }, playIco, playLabel);
  video.addEventListener('play', () => { playIco.replaceChildren(icon('pause')); playLabel.textContent = 'Pause'; });
  video.addEventListener('pause', () => { playIco.replaceChildren(icon('play')); playLabel.textContent = 'Lire le passage'; });
  video.addEventListener('click', toggle);
  const inBtn = el('button', { class: 'btn ghost sm', title: 'Raccourci : I', onclick: () => setRange(video.currentTime, Math.max(st.end, video.currentTime + 1)) }, 'Début ici');
  const outBtn = el('button', { class: 'btn ghost sm', title: 'Raccourci : O', onclick: () => setRange(Math.min(st.start, video.currentTime - 1), video.currentTime) }, 'Fin ici');
  const durRow = el('div', { class: 'ed-row' }, el('span', { class: 'lab' }, 'Durée'), ...[10, 15, 20, 30, 60].map(s => el('button', { class: 'pick', onclick: () => setRange(st.start, st.start + s) }, s + ' s')));

  const list = el('div', { class: 'ed-moments' });
  const showMoments = () => {
    track.querySelectorAll('.ed-mark').forEach(m => m.remove());
    for (const m of moments) track.insertBefore(el('b', { class: 'ed-mark', title: m.label, style: `left:${pct(m.start)};width:${(m.end - m.start) / dur() * 100}%` }), range);
    list.replaceChildren(...(moments.length ? moments.map(m => el('button', { class: 'pick', onclick: () => { setRange(m.start, m.end); video.currentTime = m.start; } }, el('b', {}, fmt(m.start)), ' ', m.label))
      : [el('span', { class: 'muted' }, 'Pas de moments détectés (vidéo exportée avant la 3.1) : choisis le passage avec les poignées.')]));
  };

  // aperçu téléphone : les mêmes images que l'export (fond flouté, cadre aux bords fondus, cartes), le jeu dessiné en direct,
  // et l'intro / la fin jouées autour du passage quand elles sont activées
  const phone = el('canvas', { class: 'ed-phone', width: 360, height: 640 }), pg = phone.getContext('2d'), K = 360 / 1080;
  const cover = img => { const iw = img.videoWidth || img.naturalWidth, ih = img.videoHeight || img.naturalHeight, s = Math.max(360 / iw, 640 / ih) * 1.08; pg.drawImage(img, (360 - iw * s) / 2, (640 - ih * s) / 2, iw * s, ih * s); };
  const art = k => Object.assign(new Image(), { src: `/api/clip-art?name=${encodeURIComponent(name)}&kind=${k}` + (k === 'frame' ? `&overlay=${C.overlay ? 1 : 0}&layout=${C.layout}` : '') });
  const A = cardInfo ? { intro: art('intro'), outro: art('outro'), bg: bgImg && art('bg'), frame: bgImg && art('frame') } : {};
  const refreshFrame = () => { if (A.frame) A.frame = art('frame'); };
  const ok = i => i?.complete && i.naturalWidth;
  // même cadre que gameRect() dans clips.mjs (vidéo 16:9, jeu large de 1000 px sur 1080)
  const rect = () => { const f = !C.overlay ? [0.19, 0.085, 0.62, 0.83] : C.layout === 'zoom' ? [0.19, 0, 0.62, 1] : [0, 0, 1, 1], h = 1000 / (f[2] * 16 / (f[3] * 9)); return { f, x: 40, y: (1920 - h) / 2, w: 1000, h }; };
  const scene = () => {
    const vw = video.videoWidth, vh = video.videoHeight; pg.filter = 'none'; pg.globalAlpha = 1; pg.fillStyle = '#0b0b0e'; pg.fillRect(0, 0, 360, 640);
    if (!vw) return;
    const R = rect(), [cx, cy, cw, ch] = R.f.map((v, i) => v * (i % 2 ? vh : vw));
    // rendu vertical dédié (approximation) : image de la map assombrie selon la visibilité choisie, cercles par-dessus
    if (C.bg === 'dedicated' && ok(bgImg)) {
      pg.filter = 'blur(2px)'; cover(bgImg); pg.filter = 'none'; pg.fillStyle = `rgba(0,0,0,${1 - C.opacity})`; pg.fillRect(0, 0, 360, 640);
      const [px, py, pw, ph] = [0.2, 0.08, 0.6, 0.84].map((v, i) => v * (i % 2 ? vh : vw)), dh = 344 * ph / pw;
      pg.globalCompositeOperation = 'lighten'; pg.drawImage(video, px, py, pw, ph, 8, (640 - dh) / 2, 344, dh); pg.globalCompositeOperation = 'source-over';
    }
    else if (C.bg === 'map' && ok(A.bg)) { pg.drawImage(A.bg, 0, 0, 360, 640); pg.drawImage(video, cx, cy, cw, ch, R.x * K, R.y * K, R.w * K, R.h * K); if (ok(A.frame)) pg.drawImage(A.frame, 0, 0, 360, 640); }
    else { pg.filter = 'blur(9px)'; cover(video); pg.filter = 'none'; const dh = 360 * ch / cw; pg.drawImage(video, cx, cy, cw, ch, 0, (640 - dh) / 2, 360, dh); }
  };
  const caption = () => {
    const cap = (C.caption || '').trim(); if (!cap) return;
    pg.font = '800 22px Nunito, sans-serif'; const w = Math.min(330, pg.measureText(cap).width + 30); pg.fillStyle = 'rgba(14,14,20,.55)'; pg.beginPath(); pg.roundRect((360 - w) / 2, 80, w, 40, 13); pg.fill(); pg.fillStyle = '#fff'; pg.textAlign = 'center'; pg.fillText(cap.length > 32 ? cap.slice(0, 31) + '…' : cap, 180, 107);
  };
  const withCards = () => C.cards && cardInfo;
  const renderPhone = () => {
    if (st.seq) { const t = (performance.now() - st.seq.t0) / 1000; if (st.seq.phase === 'intro' && t >= 2.6) { st.seq = null; video.play(); } else if (st.seq.phase === 'outro' && t >= 2.8) st.seq = null; }
    scene();
    const s = st.seq; if (!s) return caption();
    // comme l'export : image floutée par-dessus, carte en fondu, sortie du noir (intro) ou fondu au noir (fin)
    const t = (performance.now() - s.t0) / 1000, D = s.phase === 'intro' ? 2.6 : 2.8, cl = v => Math.max(0, Math.min(1, v));
    pg.globalAlpha = s.phase === 'intro' ? cl((D - t) / 0.5) : cl(t / 0.5); pg.filter = 'blur(7px)'; pg.drawImage(phone, 0, 0); pg.filter = 'none';
    if (ok(A[s.phase])) { pg.globalAlpha = s.phase === 'intro' ? Math.min(cl((t - 0.2) / 0.5), cl((D - 0.05 - t) / 0.45)) : cl((t - 0.35) / 0.5); pg.drawImage(A[s.phase], 0, 0, 360, 640); }
    pg.globalAlpha = s.phase === 'intro' ? cl(1 - t / 0.7) : cl((t - (D - 0.8)) / 0.8); pg.fillStyle = '#000'; pg.fillRect(0, 0, 360, 640); pg.globalAlpha = 1;
  };
  const loop = () => {
    st.raf = requestAnimationFrame(loop); head.style.left = pct(video.currentTime);
    if (!video.paused && video.currentTime >= st.end) { video.pause(); video.currentTime = st.end; if (withCards()) st.seq = { phase: 'outro', t0: performance.now() }; }
    renderPhone();
  };

  // réglages
  const layoutSeg = segField('Cadrage avec overlay', [['zoom', 'Zoom sur le jeu'], ['full', 'Plein cadre']], () => C.layout, v => { C.layout = v; refreshFrame(); keep(); });
  // rendu vertical dédié : seul réglage, la visibilité du fond (le reste ne concerne que le recadrage de la vidéo exportée)
  const opacityRow = range('Visibilité du fond de la map', { min: 0.1, max: 0.8, step: 0.05, fmt: v => Math.round(v * 100) + ' %' }, () => C.opacity, (v, live) => { C.opacity = v; if (!live) keep(); });
  const overlaySw = sw('Afficher l’overlay', () => C.overlay, v => { C.overlay = v; layoutSeg.hidden = !v || C.bg === 'dedicated'; refreshFrame(); keep(); }, 'Désactivé : recadré sur le terrain de jeu');
  const showFor = () => { const d = C.bg === 'dedicated'; opacityRow.hidden = !d; overlaySw.hidden = d; layoutSeg.hidden = d || !C.overlay; };
  const modes = [canDedicated && ['dedicated', 'Rendu vertical'], bgImg && ['map', 'Fond flouté'], ['video', 'Vidéo floutée']].filter(Boolean);
  const settings = el('div', { class: 'ed-settings' },
    modes.length > 1 ? segField('Fond', modes, () => C.bg, v => { C.bg = v; showFor(); keep(); }) : null,
    canDedicated ? el('p', { class: 'muted', style: 'font-size:12px;margin:-4px 0 0' }, 'Rendu vertical : danser rejoue le passage en 1080×1920, cercles sur le fond de la map moins assombri, comme en baissant le « background dim » d’osu!.') : null,
    opacityRow, overlaySw,
    layoutSeg,
    cardInfo ? sw('Intro et fin animées', () => C.cards, v => { C.cards = v; keep(); }, 'Carte de la map au début, carte du score à la fin') : el('p', { class: 'muted', style: 'font-size:12px' }, 'Intro et fin animées : pour les vidéos exportées à partir de la 3.1.'),
    el('div', { class: 'field' }, el('div', { class: 'lab' }, 'Légende en haut du clip'), el('input', { value: C.caption, maxlength: 90, placeholder: 'ex. FC 7★ en HDDT', oninput: e => { C.caption = e.target.value; }, onchange: keep })));

  showFor();
  // export en tâche de fond avec progression
  const bar = el('div', { class: 'ed-bar', hidden: true }, el('i')), result = el('div', { class: 'ed-result' });
  const go = el('button', { class: 'btn primary ed-go', onclick: async () => {
    video.pause(); go.disabled = true; result.replaceChildren(); bar.hidden = false; bar.firstChild.style.width = '0%';
    try {
      await api('/api/clip', { name, start: st.start, end: st.end, layout: C.layout, cards: C.cards, overlay: C.overlay, bg: C.bg, opacity: C.opacity, caption: C.caption });
      const tick = async () => {
        const j = await api('/api/clip-job').catch(() => null); if (!j || edState !== st) return;
        const p = Math.round(j.progress * 100); bar.classList.toggle('wait', j.running && !p); bar.firstChild.style.width = p + '%';
        go.textContent = !j.running ? 'Exporter le clip vertical' : j.phase === 'danser' ? `Rendu danser… ${p} %` : p ? `Export… ${p} %` : 'Préparation de l’intro…';
        if (j.running) { st.poll = setTimeout(tick, 400); return; }
        go.disabled = false; bar.hidden = true;
        if (j.error) return toast(j.error, true);
        S.videos = await api('/api/videos').catch(() => S.videos); videoList();
        result.replaceChildren(el('b', {}, 'Clip prêt'), el('span', { class: 'muted' }, j.name),
          el('div', { class: 'ed-row' }, el('button', { class: 'btn ghost sm', onclick: () => { closeEditor(); playClip(j.name); } }, icon('play'), 'Lire'), el('button', { class: 'btn ghost sm', onclick: () => api('/api/reveal', { name: j.name }) }, icon('folder'), 'Afficher')));
      };
      tick();
    } catch (e) { toast(e.message, true); go.disabled = false; bar.hidden = true; }
  } }, 'Exporter le clip vertical');

  $('#editor').replaceChildren(el('div', { class: 'ed-panel' },
    el('header', {}, el('div', {}, el('h2', {}, 'Montage'), el('small', { class: 'muted' }, name.replace(/\.mp4$/i, ''))),
      el('span', { class: 'muted ed-keys' }, 'Espace : lire · I / O : début / fin · Échap : fermer'), el('button', { class: 'icon-btn', title: 'Fermer', onclick: closeEditor }, icon('x'))),
    el('div', { class: 'ed-grid' },
      el('div', { class: 'ed-main' }, el('div', { class: 'ed-vwrap' }, video, vstatus), track, el('div', { class: 'ed-row' }, time, playBtn, inBtn, outBtn), durRow, el('div', { class: 'lab' }, 'Moments forts'), list),
      el('div', { class: 'ed-side' }, phone, settings, go, bar, result))));
  $('#editor').hidden = false;

  st.keys = e => {
    if (edState !== st || e.target?.matches?.('input, textarea, select')) return;
    if (e.key === 'Escape') closeEditor();
    else if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key.toLowerCase() === 'i') inBtn.click();
    else if (e.key.toLowerCase() === 'o') outBtn.click();
  };
  addEventListener('keydown', st.keys);
  const ready = () => { if (edState !== st) return; showMoments(); if (moments.length) setRange(moments[0].start, moments[0].end); else setRange(Math.max(0, dur() - 15), dur()); video.currentTime = st.start; st.raf = requestAnimationFrame(loop); };
  if (video.readyState >= 1) ready(); else video.addEventListener('loadedmetadata', ready, { once: true });
}

// ---------- job ----------
let pollT, shownDone = null;
function syncButtons() { const busy = !!S.job?.running; $('#btnRender').disabled = busy || !S.selected; $('#btnPreview').disabled = busy || !S.selected; $('.screen').classList.toggle('rendering', busy); const st = $('#status'); st.className = 'status' + (busy ? ' busy' : S.danserOk ? '' : ' bad'); st.textContent = busy ? 'Rendu en cours' : S.danserOk ? '' : 'danser introuvable'; st.hidden = !busy && S.danserOk; }
async function startJob(mode) { if (!S.selected) return; try { await commitSettings(); await api('/api/render', { replay: S.selected.id, mode }); $('#result').hidden = true; poll(); } catch (e) { toast(e.message, true); } }
async function poll() {
  clearTimeout(pollT);
  const j = S.job = await api('/api/job').catch(() => S.job);
  showJob(j); syncButtons();
  if (j?.running) pollT = setTimeout(poll, 700);
  else if (j?.stage === 'done' && shownDone !== j.out) { shownDone = j.out; toast('Vidéo prête'); refresh(); try { S.exportData = await (await fetch('/api/export')).json(); await loadAssets(); } catch { } }
}
let shownPct = 0;
function showJob(j) {
  if (!j) { $('#dockJob').hidden = true; return; }
  $('#dockJob').hidden = j.stage === 'done'; $('#dockIdle').hidden = j.running; $('#dock').classList.toggle('busy', !!j.running);
  const order = ['danser', 'overlay', 'done'], cur = order.indexOf(j.stage);
  $$('#steps span').forEach(s => { const i = order.indexOf(s.dataset.s); s.className = i < cur || j.stage === 'done' ? 'ok' : i === cur ? 'cur' : ''; });
  const overall = j.maps ? j.maps.done / Math.max(1, j.maps.total) : j.stage === 'done' ? 1 : j.stage === 'overlay' ? 0.6 + j.progress * 0.4 : j.progress * 0.6;
  $('#jobBar').style.width = (overall * 100) + '%';
  const target = Math.round(overall * 100), from = shownPct; shownPct = target;
  const t0 = performance.now(); const tick = n => { const p = Math.min(1, (n - t0) / 500); $('#jobPct').textContent = Math.round(from + (target - from) * p) + '%'; if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const label = j.maps ? 'danser prépare tes maps : ' + j.maps.done.toLocaleString('fr-FR') + ' / ' + j.maps.total.toLocaleString('fr-FR') + ' (une seule fois, ensuite c’est direct)' : j.stage === 'danser' ? 'danser enregistre le replay' : j.stage === 'overlay' ? 'Composition de l’overlay et des scènes' : j.stage === 'done' ? `Terminé en ${Math.round((j.finished - j.started) / 1000)} s` : j.stage === 'cancelled' ? 'Rendu annulé' : `Échec : ${j.error || ''}`;
  $('#jobText').replaceChildren(el('span', { class: j.stage === 'error' ? 'err' : '' }, label + (j.eta && j.running ? ` · reste ${j.eta}` : '')));
  $('#btnCancel').hidden = !j.running;
  const log = $('#log'); if (!log.hidden) { log.textContent = j.log.join('\n'); log.scrollTop = log.scrollHeight; }
  if (j.stage === 'done') { $('#result').hidden = false; $('#dockIdle').hidden = true; const v = $('#resultVideo'), src = '/videos/' + encodeURIComponent(j.out); if (!v.src.endsWith(encodeURIComponent(j.out))) v.src = src; $('#resultName').textContent = j.out; }
}

// ---------- boot ----------
async function refresh() {
  const st = await api('/api/state');
  Object.assign(S, { token: st.token, app: st.app, danserDefaults: st.danserDefaults, skins: st.skins, replays: st.replays, videos: st.videos, danserOk: st.danserOk });
  S.app.hud ||= {}; S.app.danser ||= {}; S.app.tosu ||= []; S.app.board ||= { exclude: [], custom: [], limit: 50 }; S.app.preset ||= 'cpol';
  Object.assign(S, { userPresets: st.userPresets || [], tosuInstalled: st.tosuInstalled || [], account: st.account || {}, updates: st.updates, osuDetected: st.osuDetected });
  showUpdates(); S.app.scenes ||= { intro: true, introDur: 4.5, outro: true, outroDur: 8, music: true, volume: 0.6 };
  if (S.selected) S.selected = S.replays.find(r => r.id === S.selected.id) || S.selected;
  replayList(); videoList(); return st;
}
async function boot() {
  hydrate();
  await Promise.all(['600', '700', '800'].map(w => document.fonts.load(`${w} 24px Nunito`))).catch(() => {});
  P_.canvas = $('#preview'); P_.g = P_.canvas.getContext('2d'); backdropGame = makeGameBackdrop(); P_.canvasEvents();
  const st = await refresh();
  paneRender(); paneSkin(); paneOverlay(); paneColors(); paneScenes(); paneMore(); paneMontage();
  if (!S.app.setupComplete) openSetup();
  const sel = S.replays.find(r => r.id === localStorage.getItem('rh.sel')) || S.replays[0]; if (sel) select_(sel);
  await loadAssets(); requestAnimationFrame(frame);
  if (st.job) { S.job = st.job; poll(); }
  syncButtons();
}

function openSetup() {
  if (!S.app) return;
  const dialog = $('#setup');
  if (dialog.open) return;
  const error = el('p', { class: 'setup-error', role: 'status' });
  const labels = [['Songs', 'Beatmaps'], ['Skins', 'Skins'], ['Replays', 'Replays']];
  const fields = Object.fromEntries(labels.map(([key, label]) => [key, el('input', {
    id: 'setup-' + key, value: S.app.danser.General?.['Osu' + key + 'Dir'] || S.osuDetected?.[key] || '',
    placeholder: 'Chemin du dossier ' + label,
  })]));
  async function browse(button, key) {
    button.disabled = true; error.textContent = '';
    try {
      const { folder, dirs } = await api('/api/setup/browse', {});
      if (!folder) return;
      if (key) fields[key].value = folder;
      else {
        for (const [key] of labels) if (dirs[key]) fields[key].value = dirs[key];
        if (!Object.values(dirs).some(Boolean)) error.textContent = 'Aucun sous-dossier osu! détecté ici. Choisis chaque dossier séparément.';
      }
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  }
  const pick = (label, key) => el('button', { type: 'button', class: 'btn ghost sm', onclick: e => browse(e.currentTarget, key) }, icon('folder'), label);
  const resolution = el('select', { id: 'setup-resolution' }, el('option', { value: '' }, 'Conserver le réglage actuel'),
    ...RES.map(([value, label]) => el('option', { value }, label)));
  const finish = el('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer');
  const form = el('form', { onsubmit: async e => {
    e.preventDefault(); clearTimeout(saveT); finish.disabled = true; error.textContent = '';
    try {
      await settingsWrite.catch(() => {});
      await api('/api/setup', { dirs: Object.fromEntries(labels.map(([key]) => [key, fields[key].value.trim()])), resolution: resolution.value });
      await refresh(); paneSkin(); paneRender(); syncButtons();
      select_(S.replays.find(replay => replay.id === S.selected?.id) || S.replays[0] || null);
      dialog.close();
    } catch (e) { error.textContent = e.message; }
    finally { finish.disabled = false; }
  } },
  el('h2', { id: 'setupTitle' }, S.app.setupComplete ? 'Configuration osu!' : 'Bienvenue dans Dancing!'),
  el('p', { class: 'muted' }, 'Vérifie les dossiers détectés pour retrouver tes beatmaps, tes skins et tes replays.'),
  pick('Choisir le dossier osu!'),
  ...labels.map(([key, label]) => el('div', { class: 'setup-field' }, el('label', { for: fields[key].id }, label),
    el('span', { class: 'setup-path' }, fields[key], pick('Parcourir', key)))),
  el('label', { class: 'setup-field', for: 'setup-resolution' }, 'Résolution vidéo', resolution),
  error,
  el('footer', {}, el('button', { class: 'btn ghost', type: 'button', onclick: () => dialog.close() }, 'Plus tard'), finish));
  dialog.replaceChildren(form); dialog.showModal();
}

// tabs with sliding ink
const ink = $('.tabs .ink');
const placeInk = () => { const on = $('.tabs button.on'); ink.style.width = (on.offsetWidth - 20) + 'px'; ink.style.transform = `translateX(${on.offsetLeft + 10}px)`; };
$$('.tabs button').forEach(b => b.addEventListener('click', () => { $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $$('.pane').forEach(p => { const on = p.dataset.panel === b.dataset.t; p.classList.toggle('on', on); p.classList.toggle('enter', on); if (on) setTimeout(() => p.classList.remove('enter'), 700); }); placeInk(); }));
new ResizeObserver(placeInk).observe($('.tabs'));
segment($('#libSeg'), v => $$('.lib-view').forEach(x => x.classList.toggle('on', x.id === 'lib-' + v)));
placeScene = segment($('#sceneSeg'), v => setScene(v));
$('#btnPlay').addEventListener('click', () => { P_.playing = !P_.playing; playIcon(); });
const scrub = $('#scrub'); let dragging = false;
const seek = e => { const r = scrub.getBoundingClientRect(); P_.pos = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width)); P_.since = 1e9; P_.sum = P_.sum; P_.hud && (P_.hud.last = null); };
scrub.addEventListener('pointerdown', e => { dragging = true; scrub.setPointerCapture(e.pointerId); seek(e); });
scrub.addEventListener('pointermove', e => dragging && seek(e));
scrub.addEventListener('pointerup', () => dragging = false);
$('#q').addEventListener('input', replayList);
$('#dq').addEventListener('input', filterDanser);
$('#file').addEventListener('change', e => upload(e.target.files[0]));
let dragDepth = 0;
document.addEventListener('dragenter', e => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); dragDepth++; $('#dropzone').classList.add('on'); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropzone').classList.remove('on'); } });
document.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#dropzone').classList.remove('on'); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); });
$('#btnRender').addEventListener('click', () => startJob('full'));
$('#btnPreview').addEventListener('click', () => startJob('preview'));
$('#btnCancel').addEventListener('click', () => api('/api/cancel', {}));
$('#btnLog').addEventListener('click', () => { const l = $('#log'); l.hidden = !l.hidden; if (S.job) showJob(S.job); });
$('#btnReveal').addEventListener('click', () => api('/api/reveal', { name: S.job?.out }));
$('#btnCloseRes').addEventListener('click', () => { $('#result').hidden = true; $('#dockIdle').hidden = false; $('#resultVideo').pause(); });
$('#btnOpenOut').addEventListener('click', () => api('/api/reveal', {}));
$$('[data-close]').forEach(b => b.addEventListener('click', closeDrawer));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) $('#modal').hidden = true; else if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); if (e.key === ' ' && e.target === document.body) { e.preventDefault(); $('#btnPlay').click(); } });
$('#danserReset').addEventListener('click', () => { if (!confirm('Revenir aux réglages danser d’origine ?')) return; S.app.danser = {}; save(); danserForm(); });
$('#btnSetup').addEventListener('click', openSetup);

// =====================================================================================
// Presets, layout editor, tosu widgets, osu! account, updates
// =====================================================================================
const PLAYER_KEYS = ['countryRank', 'globalRank', 'country', 'avatarPath', 'showFlag'];
const catalogWidgets = () => {
  const remote = [...(S.store || []), ...(S.tosuCatalog || [])];
  const local = S.tosuInstalled.filter(w => w.folder !== 'Replay HUD - Précision');
  return [...remote, ...local.filter(w => !remote.some(c => c.folder === w.folder)).map(w => ({ ...w, installed: true, resolution: [w.w, w.h] }))];
};
let catalogRequest;
const loadStore = () => api('/api/store').then(list => S.store = list).catch(() => S.store = []);
const loadCatalog = () => catalogRequest ||= api('/api/tosu/catalog').then(list => S.tosuCatalog = list.map(widget => ({ ...widget, source: 'tosu' }))).finally(() => { catalogRequest = null; });
const allPresets = () => [...BUILTIN, ...dancingPresets(), ...S.userPresets];
async function installWidget(widget) {
  if (widget.installed) return widget;
  const installed = await api('/api/tosu/install', { id: widget.id });
  Object.assign(widget, installed, { installed: true, outdated: false, resolution: [installed.w, installed.h] });
  return widget;
}
function applyPreset(p) {
  const keep = Object.fromEntries(PLAYER_KEYS.filter(k => S.app.hud[k] !== undefined).map(k => [k, S.app.hud[k]]));
  S.app.preset = p.id; S.app.hud = { ...structuredClone(p.hud || {}), ...keep }; S.app.tosu = structuredClone(p.tosu || []);
  P_.sel = null;
  commitSettings().catch(e => toast(e.message, true));
  P_.hud = new HUD(hudCfg(), assets); paneOverlay(); paneColors(); toast('Preset : ' + p.name);
}
const savePresets = () => api('/api/presets', S.userPresets).catch(e => toast(e.message, true));
function snapshotPreset(name) {
  const hud = structuredClone(S.app.hud); for (const k of PLAYER_KEYS) delete hud[k];
  return { id: 'u' + Date.now().toString(36), name, desc: 'Preset personnel', hud, tosu: structuredClone(S.app.tosu) };
}
// Miniature d'un preset : le vrai overlay dessiné avec ses couleurs sur le fond de jeu, au milieu du replay de démo.
function presetThumb(p) {
  const c = el('canvas', { class: 'pthumb', width: 384, height: 216 });
  const paint = () => {
    if (!timeline) return setTimeout(paint, 200);
    const g = c.getContext('2d'), s = c.width / W, m = timeline.d.meta, hud = { ...HUD_DEFAULTS, ...p.hud };
    // Fond sobre teinté par la couleur du preset (sans le terrain de jeu) pour que l'overlay ressorte à petite taille
    g.setTransform(s, 0, 0, s, 0, 0); g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.6);
    glow.addColorStop(0, hud.tubeColor + '33'); glow.addColorStop(1, 'transparent'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
    const st = timeline.at(m.start + (m.end - m.start) * 0.45); st.since = null;
    new HUD(hud, assets).draw(g, st, 1e6);
    if (p.tosu?.some(w => dancingWidget(w.folder))) drawDancingWidgets(g, p.tosu, tosuMessages(st, m));
  };
  requestAnimationFrame(paint);
  return c;
}
function presetsBlock() {
  const cur = S.app.preset, user = S.userPresets.find(p => p.id === cur), active = allPresets().find(p => p.id === cur);
  const card = (p, i) => el('button', { class: 'pcard' + (p.id === cur ? ' on' : ''), style: `--i:${i}`, title: p.desc || p.name, onclick: e => applyPreset(p, e.currentTarget) },
    presetThumb(p),
    el('span', { class: 'pname' }, el('b', {}, p.name), p.id === cur ? icon('check') : null),
    p.id.startsWith('u') ? el('span', { class: 'del icon-btn', title: 'Supprimer', onclick: e => { e.stopPropagation(); if (!confirm(`Supprimer « ${p.name} » ?`)) return; S.userPresets = S.userPresets.filter(x => x.id !== p.id); savePresets(); paneOverlay(); } }, icon('x')) : null);
  const builtin = [...BUILTIN, ...dancingPresets()];
  return grp('Presets',
    active?.desc ? el('p', { class: 'pdesc' }, el('b', {}, active.name), ' · ', active.desc) : null,
    el('div', { class: 'presetgrid' }, builtin.map(card)),
    S.userPresets.length ? el('div', { class: 'lab', style: 'margin-top:4px' }, 'Mes presets') : null,
    S.userPresets.length ? el('div', { class: 'presetgrid' }, S.userPresets.map((p, i) => card(p, builtin.length + i))) : null,
    el('div', { class: 'two' },
      el('button', { class: 'btn ghost sm', onclick: () => { const n = prompt('Nom du nouveau preset', 'Mon preset'); if (!n) return; const p = snapshotPreset(n.trim()); S.userPresets.push(p); S.app.preset = p.id; save(true); savePresets(); paneOverlay(); toast('Preset créé'); } }, icon('plus'), 'Enregistrer comme preset'),
      user ? el('button', { class: 'btn ghost sm', onclick: () => { Object.assign(user, { ...snapshotPreset(user.name), id: user.id }); savePresets(); toast('Preset mis à jour'); } }, icon('check'), 'Mettre à jour « ' + user.name + ' »') : el('span')));
}

// ---- personnalisation du preset actif : appliquée par-dessus, le preset lui-même ne change jamais
const STYLE_KEYS = ['tubeColor', 'panelColor', 'hpColor', 'hpEmpty', 'textColor', 'glow', 'tubeShape', 'panelShape', 'c300', 'c100', 'c50', 'keyColor'];
function customizeBlock() {
  const h = S.app.hud, c = hudCfg(), base = allPresets().find(p => p.id === S.app.preset) || BUILTIN[0], bh = base.hud || {};
  const refresh = () => { P_.hud && (P_.hud.cfg = hudCfg()); };
  const set = k => (v, live) => { h[k] = v; refresh(); if (!live) save(true); };
  const assign = vals => { for (const [k, v] of Object.entries(vals)) { if (v === undefined) delete h[k]; else h[k] = v; } refresh(); save(true); paneOverlay(); paneColors(); };
  const changed = STYLE_KEYS.some(k => h[k] !== undefined && h[k] !== bh[k]);
  const theme = ([name, vals]) => {
    const a = vals.tubeColor || bh.tubeColor || HUD_DEFAULTS.tubeColor, on = ['tubeColor', 'hpColor', 'panelColor'].every(k => c[k] === (vals[k] ?? bh[k] ?? HUD_DEFAULTS[k]));
    return el('button', { class: 'theme' + (on ? ' on' : ''), style: '--a:' + a, onclick: () => assign(Object.fromEntries(['tubeColor', 'hpColor', 'panelColor'].map(k => [k, vals[k] ?? bh[k]]))) }, el('i'), el('span', {}, name));
  };
  return grp('Personnaliser « ' + base.name + ' »',
    el('p', { class: 'muted small' }, 'Tes réglages s’ajoutent par-dessus le preset : l’original reste intact.'),
    el('div', { class: 'themes' }, THEMES.map(theme)),
    el('div', { class: 'two' }, colorRow('Bandeau', () => c.tubeColor, set('tubeColor')), colorRow('Barre de vie', () => c.hpColor, set('hpColor'))),
    el('div', { class: 'two' }, colorRow('Panneaux', () => c.panelColor, set('panelColor')), colorRow('Texte', () => c.textColor, set('textColor'))),
    segField('Forme du bandeau', [['dip', 'Incurvé'], ['straight', 'Droit']], () => c.tubeShape, v => set('tubeShape')(v)),
    segField('Panneaux combo et pp', [['slant', 'Inclinés'], ['round', 'Arrondis']], () => c.panelShape, v => set('panelShape')(v)),
    range('Lueur', { min: 0, max: 2, step: 0.05, fmt: v => Math.round(v * 100) + ' %' }, () => c.glow, set('glow')),
    changed ? el('button', { class: 'btn ghost sm reset-preset', onclick: () => assign(Object.fromEntries(STYLE_KEYS.map(k => [k, bh[k]]))) }, 'Revenir à « ' + base.name + ' » d’origine') : null);
}

// ---- widgets list (native + tosu), selection, properties
P_.sel = null;  // { kind: 'native', key } | { kind: 'tosu', i }
const layoutOf = key => (S.app.hud.layout ||= {})[key] ||= {};
function removeWidget(index) {
  if (!S.app.tosu[index]) return;
  S.app.tosu.splice(index, 1);
  P_.sel = null;
  buildTosu();
  paneOverlay();
  commitSettings().catch(e => toast(e.message, true));
}
function widgetsBlock() {
  const c = hudCfg(), sel = P_.sel;
  const natives = Object.keys(BOX).map(k => el('div', { class: 'witem' + (sel?.kind === 'native' && sel.key === k ? ' on' : ''), onclick: () => { P_.sel = { kind: 'native', key: k }; paneOverlay(); } },
    el('b', {}, WIDGET_NAMES[k]), el('small', {}, 'HUD'), el('label', { class: 'switch', onclick: e => e.stopPropagation() }, (() => { const i = el('input', { type: 'checkbox', onchange: e => { layoutOf(k).show = e.target.checked; P_.hud.cfg = hudCfg(); save(true); } }); i.checked = (c.layout?.[k]?.show ?? true); return i; })(), el('i'))));
  const tosu = S.app.tosu.map((w, i) => el('div', { class: 'witem' + (sel?.kind === 'tosu' && sel.i === i ? ' on' : ''), onclick: () => { P_.sel = { kind: 'tosu', i }; paneOverlay(); } },
    el('b', {}, w.name || w.folder), el('button', { class: 'btn ghost sm', onclick: e => { e.stopPropagation(); removeWidget(i); } }, 'Retirer')));
  let props = null;
  if (sel?.kind === 'native') {
    const L = layoutOf(sel.key);
    props = el('div', { class: 'grp', style: 'border:0;padding-top:4px' }, el('h3', {}, WIDGET_NAMES[sel.key]),
      range('Échelle', { min: .4, max: 2, step: .01, fmt: v => '×' + (+v).toFixed(2) }, () => L.s || 1, (v, l) => { L.s = v; P_.hud.cfg = hudCfg(); if (!l) save(true); }),
      range('Opacité', { min: .1, max: 1, step: .05, fmt: pct }, () => L.o ?? 1, (v, l) => { L.o = v; P_.hud.cfg = hudCfg(); if (!l) save(true); }),
      el('button', { class: 'link', onclick: () => { delete S.app.hud.layout[sel.key]; P_.hud.cfg = hudCfg(); save(true); paneOverlay(); } }, 'Remettre à sa place d’origine'));
  } else if (sel?.kind === 'tosu' && S.app.tosu[sel.i]) {
    const w = S.app.tosu[sel.i];
    props = el('div', { class: 'grp', style: 'border:0;padding-top:4px' }, el('h3', {}, w.name || w.folder),
      range('Échelle', { min: .2, max: 3, step: .01, fmt: v => '×' + (+v).toFixed(2) }, () => w.s || 1, (v, l) => { w.s = v; layoutTosu(); if (!l) save(true); }),
      range('Opacité', { min: .1, max: 1, step: .05, fmt: pct }, () => w.o ?? 1, (v, l) => { w.o = v; layoutTosu(); if (!l) save(true); }),
      el('div', { class: 'two' }, num('Largeur (px)', () => w.w, v => { w.w = v; tosuBuilt = ''; buildTosu(); save(true); }), num('Hauteur (px)', () => w.h, v => { w.h = v; tosuBuilt = ''; buildTosu(); save(true); })),
      el('button', { class: 'btn ghost sm', onclick: () => removeWidget(sel.i) }, 'Retirer du montage'));
  }
  return grp('Widgets', el('p', {}, P_.editing ? 'Glisse un widget pour le déplacer. Utilise la molette pour changer sa taille.' : 'Ouvre le mode montage pour déplacer et redimensionner les widgets.'),
    el('div', { class: 'wlist' }, natives, tosu), props,
    el('button', { class: 'btn ghost sm', onclick: () => openCatalog('store') }, icon('plus'), 'Bibliothèque de widgets'));
}

// ---- editor on the stage canvas
function rectOf(sel) {
  if (sel.kind === 'native') return widgetRect(hudCfg(), sel.key);
  const w = S.app.tosu[sel.i]; return [w.x, w.y, w.w * (w.s || 1), w.h * (w.s || 1)];
}
const visibleNativeKeys = () => Object.keys(BOX).filter(key => {
  const cfg = hudCfg(), flag = { hiterror: 'showHitError' }[key] || 'show' + key[0].toUpperCase() + key.slice(1);
  return cfg[flag] && cfg.layout?.[key]?.show !== false;
});
function hitTest(x, y) {
  for (let i = S.app.tosu.length - 1; i >= 0; i--) { const [rx, ry, rw, rh] = rectOf({ kind: 'tosu', i }); if (x >= rx && y >= ry && x <= rx + rw && y <= ry + rh) return { kind: 'tosu', i }; }
  for (const k of visibleNativeKeys().reverse()) { const [rx, ry, rw, rh] = rectOf({ kind: 'native', key: k }); if (x >= rx && y >= ry && x <= rx + rw && y <= ry + rh) return { kind: 'native', key: k }; }
  return null;
}
function drawEditor(g) {
  g.save(); g.setLineDash([8, 6]); g.lineWidth = 2;
  const items = [...visibleNativeKeys().map(key => ({ kind: 'native', key })), ...S.app.tosu.map((_, i) => ({ kind: 'tosu', i }))];
  for (const it of items) {
    const [x, y, w, h] = rectOf(it), on = !!P_.sel && P_.sel.kind === it.kind && (it.kind === 'native' ? P_.sel.key === it.key : P_.sel.i === it.i);
    g.strokeStyle = on ? '#ff66ab' : 'rgba(255,255,255,.35)'; g.strokeRect(x, y, w, h);
    g.fillStyle = on ? '#ff66ab' : 'rgba(255,255,255,.55)'; g.font = '800 15px Nunito'; g.textAlign = 'left';
    g.fillText(it.kind === 'native' ? WIDGET_NAMES[it.key] : (S.app.tosu[it.i].name || S.app.tosu[it.i].folder), x + 4, y - 6);
  }
  g.restore();
}
function canvasPoint(e) { const r = P_.canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
let drag = null;
P_.canvasEvents = () => {
  const cv = P_.canvas;
  cv.addEventListener('pointerdown', e => {
    if (!P_.editing) return; const [x, y] = canvasPoint(e), hit = hitTest(x, y); P_.sel = hit; if (!hit) return paneOverlay();
    const start = hit.kind === 'native' ? { ...layoutOf(hit.key) } : { x: S.app.tosu[hit.i].x, y: S.app.tosu[hit.i].y };
    drag = { hit, x, y, start }; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return; const [x, y] = canvasPoint(e), dx = x - drag.x, dy = y - drag.y;
    if (drag.hit.kind === 'native') { const L = layoutOf(drag.hit.key); L.dx = Math.round((drag.start.dx || 0) + dx); L.dy = Math.round((drag.start.dy || 0) + dy); P_.hud.cfg = hudCfg(); }
    else { const w = S.app.tosu[drag.hit.i]; w.x = Math.round(drag.start.x + dx); w.y = Math.round(drag.start.y + dy); layoutTosu(); }
  });
  cv.addEventListener('pointerup', () => { if (drag) { drag = null; save(true); paneOverlay(); } });
  cv.addEventListener('wheel', e => {
    if (!P_.editing) return; const [x, y] = canvasPoint(e), hit = hitTest(x, y); if (!hit) return; e.preventDefault();
    const k = e.deltaY < 0 ? 1.04 : 1 / 1.04;
    if (hit.kind === 'native') { const L = layoutOf(hit.key); L.s = Math.max(.3, Math.min(3, (L.s || 1) * k)); P_.hud.cfg = hudCfg(); }
    else { const w = S.app.tosu[hit.i]; w.s = Math.max(.2, Math.min(4, (w.s || 1) * k)); layoutTosu(); }
    clearTimeout(P_.wheelT); P_.wheelT = setTimeout(() => save(true), 400);
  }, { passive: false });
};

// ---- tosu widgets live in the preview (iframes fed with replay data)
window.__tosuBus = { last: null };
let tosuBuilt = '', tosuTick = 0;
function buildTosu() {
  const key = JSON.stringify(S.app.tosu.map(w => [w.folder, w.w, w.h]));
  if (key === tosuBuilt) return layoutTosu(); tosuBuilt = key;
  $('#wlayer').replaceChildren(...S.app.tosu.flatMap((w, i) => dancingWidget(w.folder) ? [] : [el('iframe', { src: `/tosu/${encodeURIComponent(w.folder)}/`, 'data-index': i, title: w.name || w.folder, allowtransparency: 'true' })]));
  layoutTosu();
}
function layoutTosu() {
  const k = $('#screen').clientWidth / W;
  for (const f of $('#wlayer').children) { const w = S.app.tosu[f.dataset.index]; if (!w) continue; w.glass ??= S.store?.find(c => c.folder === w.folder)?.glass; w.glassBlur ??= S.tosuInstalled?.find(c => c.folder === w.folder)?.glassBlur; Object.assign(f.style, { left: w.x * k + 'px', top: w.y * k + 'px', width: w.w + 'px', height: w.h + 'px', transform: `scale(${(w.s || 1) * k})`, opacity: w.o ?? 1, display: '', borderRadius: w.glass ? w.glass + 'px' : '', backdropFilter: w.glass ? `blur(${w.glassBlur || 18}px) saturate(1.6)` : '' }); }
}
function hideTosu() { [...$('#wlayer').children].forEach(f => f.style.display = 'none'); }
function syncTosu(st, meta) {
  if (!S.app.tosu.length) { if (tosuBuilt) { tosuBuilt = ''; $('#wlayer').replaceChildren(); } return; }
  buildTosu();
  if (!$('#wlayer').children.length || ++tosuTick % 3) return;
  const msgs = tosuMessages(st, meta, { board: st.board }); window.__tosuBus.last = msgs;
  for (const f of $('#wlayer').children) { try { f.contentWindow.__tosuDeliver?.(msgs); } catch { } }
}
new ResizeObserver(() => layoutTosu()).observe(document.getElementById('screen'));

// ---- catalogue
function modal(title, body) { releaseVideos($('#mBody')); $('#mTitle').textContent = title; $('#mBody').replaceChildren(body); $('#modal').hidden = false; }
$$('[data-mclose]').forEach(b => b.addEventListener('click', () => { $('#modal').hidden = true; releaseVideos($('#mBody')); }));
async function openCatalog(view = 'store') {
  if (!S.app) return;
  if (!S.store) await loadStore();
  const box = el('div'); modal('Bibliothèque de widgets', box);
  const status = el('p', { class: 'muted', hidden: true });
  const q = el('input', { placeholder: 'Rechercher un widget…', 'aria-label': 'Rechercher un widget' });
  const grid = el('div', { class: 'catalog' });
  const filters = el('nav', { class: 'catalog-filters', 'aria-label': 'Collections de widgets' });
  const add = widget => {
    const placement = widgetPlacement(widget, W - 64, H - 64);
    const boxes = [...visibleNativeKeys().map(key => rectOf({ kind: 'native', key })), ...S.app.tosu.map((_, i) => rectOf({ kind: 'tosu', i }))];
    const w = placement.w * placement.s, h = placement.h * placement.s;
    for (let y = 32; y + h <= H - 32; y += 24) {
      const x = [32, W - w - 32].find(x => boxes.every(([bx, by, bw, bh]) => x + w + 12 < bx || x > bx + bw + 12 || y + h + 12 < by || y > by + bh + 12));
      if (x !== undefined) { Object.assign(placement, { x: Math.round(x), y }); break; }
    }
    S.app.tosu.push(placement);
    P_.sel = { kind: 'tosu', i: S.app.tosu.length - 1 };
    setEditing(true); save(true); $('#modal').hidden = true;
    toast('Widget ajouté à la composition');
  };
  const draw = () => {
    const f = q.value.trim().toLowerCase();
    const matches = catalogWidgets().filter(c => (view === 'installed' ? c.installed : c.source === view) && `${c.name} ${c.author}`.toLowerCase().includes(f));
    status.hidden = view !== 'tosu' || !status.textContent;
    grid.replaceChildren(...matches.map((c, i) => {
      const btn = el('button', { class: 'btn ghost sm' }, c.installed ? 'Ajouter au montage' : c.outdated ? 'Mettre à jour' : c.source === 'store' ? 'Installer' : 'Télécharger');
      btn.onclick = async () => {
        if (c.installed) { add(c); return; }
        btn.disabled = true;
        try { await installWidget(c); toast(c.name + ' téléchargé'); draw(); }
        catch (e) { toast(e.message, true); btn.disabled = false; }
      };
      // mes créations : aperçu animé et bouton Modifier (la description est gardée dans widget.json)
      const mine = c.author === 'Créateur Dancing!', src = c.preview || (mine ? `/tosu/${encodeURIComponent(c.folder)}/?demo` : '');
      const edit = mine ? el('button', { class: 'btn ghost sm', onclick: async () => {
        try { const spec = await fetch(`/tosu/${encodeURIComponent(c.folder)}/widget.json`).then(r => r.json()); openCreator(add, { ...spec, name: c.name }); }
        catch { toast('Impossible de rouvrir ce widget.', true); }
      } }, 'Modifier') : null;
      const preview = el('div', { class: 'img' });
      if (src) {
        const [w, h] = c.resolution, k = Math.min(196 / w, 96 / h);
        preview.classList.add('live');
        preview.append(el('iframe', { src, tabindex: '-1', title: c.name, style: `width:${w}px;height:${h}px;transform:scale(${k})${c.glass ? `;border-radius:${c.glass}px;backdrop-filter:blur(${c.glassBlur || 18}px) saturate(1.6)` : ';backdrop-filter:none'}` }));
      } else if (c.image) {
        preview.append(el('img', { src: c.image, alt: '', loading: 'lazy' }));
      } else preview.append(icon('layers'));
      return el('div', { class: 'cat', style: `--i:${Math.min(i, 12)}` }, preview, el('div', { class: 't' }, el('b', {}, c.name), el('small', {}, c.author + (c.version ? ` · v${c.version}` : ''))), el('div', { class: 'act' }, btn, edit));
    }));
    if (!matches.length && status.hidden) grid.append(el('p', { class: 'muted' }, 'Aucun widget dans cette vue.'));
    for (const button of filters.children) button.setAttribute('aria-pressed', button.dataset.view === view);
  };
  for (const [id, label] of [['store', 'Store Dancing!'], ['tosu', 'Catalogue communautaire'], ['installed', 'Téléchargés']]) {
    filters.append(el('button', { class: 'btn ghost sm', 'data-view': id, onclick: async () => {
      view = id;
      if (id !== 'tosu' || S.tosuCatalog) { draw(); return; }
      status.textContent = 'Chargement du catalogue officiel…'; draw();
      try { await loadCatalog(); status.textContent = ''; }
      catch { status.textContent = 'Catalogue indisponible. Les widgets téléchargés restent dans Mes widgets.'; }
      draw();
    } }, label));
  }
  filters.append(el('button', { class: 'btn primary sm creator-open', onclick: () => openCreator(add) }, icon('plus'), 'Créer un widget'));
  box.append(filters, el('div', { class: 'search catalog-search' }, icon('search'), q), status, grid);
  q.addEventListener('input', draw); draw();
  if (view === 'tosu' && !S.tosuCatalog) filters.firstElementChild.click();
  q.focus();
}

// ---- créateur de widgets : contenu, style, texte, disposition et animation, avec aperçu en direct
function openCreator(onCreated, initial) {
  const spec = normalizeSpec(initial || defaultSpec());
  const frame = el('iframe', { class: 'creator-frame', title: 'Aperçu du widget', tabindex: '-1' });
  const size = el('small', { class: 'muted' }, '');
  const measure = () => { const w = frame.contentDocument?.getElementById('w'); if (!w) return null; return [w.offsetWidth, w.offsetHeight]; };
  frame.onload = () => setTimeout(() => {
    const m = measure(); if (!m) return;
    const box = frame.parentElement;
    Object.assign(frame.style, { width: m[0] + 'px', height: m[1] + 'px', transform: `scale(${Math.min(1, (box.clientWidth - 40) / m[0], (box.clientHeight - 40) / m[1])})`,
      borderRadius: spec.style === 'none' ? '0' : spec.radius + 'px', backdropFilter: spec.style === 'glass' ? `blur(${spec.blur}px) saturate(1.6)` : 'none' });
    size.textContent = `${m[0]} × ${m[1]} px`;
  }, 250);
  let timer;
  const render = () => { clearTimeout(timer); timer = setTimeout(() => { frame.srcdoc = makeWidget(spec).replace("location.search.includes('demo')", 'true'); }, 90); };
  const set = k => v => { spec[k] = v; render(); };
  // again = true : le choix fait apparaître ou disparaître d'autres réglages, on redessine le panneau
  const opt = (label, list, k, again) => segField(label, list, () => spec[k], v => { spec[k] = /^\d+$/.test(v) ? +v : v; if (again) refresh(); else render(); });

  // Contenu : modèles, éléments à cocher, puis réglages de chaque élément choisi
  const chips = el('div', { class: 'creator-chips' }), rows = el('div', { class: 'citems' });
  const drawItems = () => {
    chips.replaceChildren(...Object.entries(FIELDS).map(([k, f]) => {
      const n = spec.items.findIndex(it => it.k === k);
      return el('button', { class: 'pick' + (n >= 0 ? ' on' : ''), 'aria-pressed': n >= 0, onclick: () => {
        if (n >= 0) spec.items.splice(n, 1); else if (spec.items.length < 10) spec.items.push({ k }); else return toast('10 éléments au maximum', true);
        drawItems(); render();
      } }, n >= 0 ? el('b', {}, String(n + 1)) : null, f.label);
    }));
    rows.replaceChildren(...spec.items.map((it, i) => {
      const f = FIELDS[it.k], move = d => { const j = i + d; if (j < 0 || j >= spec.items.length) return; [spec.items[i], spec.items[j]] = [spec.items[j], spec.items[i]]; drawItems(); render(); };
      const col = el('input', { type: 'color', value: it.color || f.color || spec.accent, title: 'Couleur de l’élément', oninput: e => { it.color = e.target.value; render(); } });
      return el('div', { class: 'citem' },
        el('span', { class: 'cnum' }, String(i + 1)),
        el('input', { type: 'text', value: it.label || '', placeholder: f.label, maxlength: 24, 'aria-label': 'Intitulé de ' + f.label, oninput: e => { it.label = e.target.value.trim() || undefined; render(); } }),
        el('label', { class: 'swatch mini', title: 'Couleur' }, col),
        it.color ? el('button', { class: 'icon-btn sm', title: 'Couleur par défaut', onclick: () => { delete it.color; drawItems(); render(); } }, icon('x')) : null,
        el('button', { class: 'icon-btn sm up', title: 'Monter', disabled: i === 0, onclick: () => move(-1) }, icon('chev')),
        el('button', { class: 'icon-btn sm down', title: 'Descendre', disabled: i === spec.items.length - 1, onclick: () => move(1) }, icon('chev')));
    }));
  };
  const templates = el('div', { class: 'creator-chips' }, Object.entries(TEMPLATES).map(([n, t]) => el('button', { class: 'pick', onclick: () => {
    Object.assign(spec, normalizeSpec({ ...defaultSpec(), name: spec.name, accent: spec.accent, ...t })); refresh();
  } }, n)));
  const name = el('input', { type: 'text', value: spec.name, maxlength: 40, oninput: e => { spec.name = e.target.value; } });
  const opened = new Set(['Contenu', 'Style']);
  const section = (title, ...kids) => {
    const d = el('details', { class: 'cgrp', ...(opened.has(title) ? { open: true } : {}) }, el('summary', {}, title), el('div', { class: 'cgrp-body' }, ...kids));
    d.addEventListener('toggle', () => d.open ? opened.add(title) : opened.delete(title));
    return d;
  };
  const filled = () => spec.style !== 'none' && spec.style !== 'outline';

  const side = el('div', { class: 'creator-side' });
  function refresh() {
    const top = side.scrollTop;
    side.replaceChildren(
      el('div', { class: 'field' }, el('div', { class: 'lab' }, 'Nom'), name),
      section('Contenu',
        el('div', { class: 'field' }, el('div', { class: 'lab' }, 'Partir d’un modèle'), templates),
        el('div', { class: 'field' }, el('div', { class: 'lab' }, 'Éléments', el('em', {}, 'dans l’ordre du clic')), chips),
        el('div', { class: 'field' }, el('div', { class: 'lab' }, 'Réglages des éléments', el('em', {}, 'intitulé, couleur, ordre')), rows)),
      section('Style',
        opt('Fond', Object.entries(STYLES), 'style', true),
        colorRow('Couleur d’accent', () => spec.accent, set('accent')),
        filled() ? colorRow('Couleur du fond', () => spec.bg, set('bg')) : null,
        filled() ? range('Opacité du fond', { min: 0, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + ' %' }, () => spec.bgAlpha, set('bgAlpha')) : null,
        spec.style === 'glass' ? range('Flou du verre', { min: 2, max: 40, fmt: v => v + ' px' }, () => spec.blur, set('blur'), 'Flou réel dans l’aperçu et dans la vidéo.') : null,
        spec.style !== 'none' ? range('Arrondi des coins', { min: 0, max: 36, fmt: v => v + ' px' }, () => spec.radius, set('radius')) : null,
        spec.style !== 'none' ? range('Bordure', { min: 0, max: 4, fmt: v => v ? v + ' px' : 'aucune' }, () => spec.border, set('border')) : null,
        spec.style !== 'none' ? sw('Bordure de la couleur d’accent', () => spec.borderAccent, set('borderAccent')) : null,
        sw('Bande d’accent à gauche', () => spec.stripe, set('stripe'))),
      section('Texte',
        select('Police', Object.entries(FONTS), () => spec.font, set('font')),
        range('Taille des chiffres', { min: 12, max: 72, fmt: v => v + ' px' }, () => spec.fontSize, set('fontSize')),
        opt('Épaisseur', [[600, 'Normal'], [700, 'Gras'], [800, 'Très gras'], [900, 'Noir']], 'weight'),
        colorRow('Couleur du texte', () => spec.textColor, set('textColor')),
        colorRow('Couleur des intitulés', () => spec.labelColor, set('labelColor')),
        opt('Intitulés', [['top', 'Au-dessus'], ['bottom', 'En dessous'], ['off', 'Masqués']], 'labels'),
        sw('Intitulés en majuscules', () => spec.upper, set('upper')),
        sw('Lueur de la couleur d’accent', () => spec.glow, set('glow'))),
      section('Disposition',
        opt('Agencement', Object.entries(LAYOUTS), 'layout'),
        opt('Alignement', [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']], 'align'),
        range('Espacement', { min: 0, max: 3, step: 0.05, fmt: v => '×' + (+v).toFixed(2) }, () => spec.gap, set('gap')),
        range('Marges intérieures', { min: 0, max: 3, step: 0.05, fmt: v => '×' + (+v).toFixed(2) }, () => spec.pad, set('pad')),
        sw('Séparateurs entre les éléments', () => spec.dividers, set('dividers'))),
      section('Animation',
        opt('Apparition', [['slide', 'Glisse'], ['fade', 'Fondu'], ['zoom', 'Zoom'], ['none', 'Aucune']], 'anim'),
        opt('Chiffres', [['smooth', 'Doux'], ['fast', 'Rapide'], ['off', 'Instantané']], 'roll'),
        sw('Petit saut quand une valeur monte', () => spec.kick, set('kick'))),
    );
    hydrate(side); drawItems(); render(); side.scrollTop = top;
  }

  const create = el('button', { class: 'btn primary' }, icon('check'), initial ? 'Enregistrer et ajouter au montage' : 'Créer et ajouter au montage');
  create.onclick = async () => {
    if (!spec.items.length) return toast('Choisis au moins un élément', true);
    const m = measure(); if (!m) return;
    create.disabled = true;
    try {
      const meta = await api('/api/widgets/create', { name: spec.name, html: makeWidget(spec, m), w: m[0], h: m[1], glass: spec.style === 'glass' ? Math.max(1, spec.radius) : 0, blur: spec.blur, spec });
      S.tosuInstalled = [...S.tosuInstalled.filter(w => w.folder !== meta.folder), meta];
      // un widget modifié déjà placé dans le montage prend sa nouvelle taille
      S.app.tosu.filter(w => w.folder === meta.folder).forEach(w => Object.assign(w, { w: meta.w, h: meta.h, glass: meta.glass, glassBlur: meta.glassBlur }));
      tosuBuilt = '';
      onCreated({ ...meta, installed: true, resolution: [meta.w, meta.h] });
      toast(`« ${meta.name} » enregistré`);
    } catch (e) { toast(e.message, true); create.disabled = false; }
  };
  const stage = el('div', { class: 'creator-stage' }, frame);
  modal(initial ? 'Modifier le widget' : 'Créer un widget', el('div', { class: 'creator' }, side,
    el('div', { class: 'creator-main' }, stage, el('div', { class: 'creator-foot' }, size,
      el('button', { class: 'btn ghost', onclick: () => openCatalog('installed') }, 'Retour'), create))));
  refresh();
}

// ---- osu! account + leaderboard customisation (pane "Plus")
function accountBlock() {
  const id = el('input', { placeholder: 'ID client (ex. 12345)', inputmode: 'numeric' }), secret = el('input', { type: 'password', placeholder: 'Clé secrète du client' });
  const st = el('div', { class: 'hint' }, icon(S.account?.configured ? 'check' : 'info'), el('span', {}, S.account?.configured ? `Compte connecté (application ${S.account.clientId}) : le classement utilise les scores d’osu!.` : 'Pas encore connecté : le classement en ligne ne fonctionnera pas.'));
  const go = el('button', { class: 'btn primary sm' }, icon('check'), 'Connecter');
  go.onclick = async () => { go.disabled = true; try { S.account = await api('/api/osu-auth', { id: id.value.trim(), secret: secret.value.trim() }); toast('Compte osu! connecté'); paneMore(); } catch (e) { toast(e.message, true); } go.disabled = false; };
  return grp('Compte osu!', el('p', {}, 'Pour afficher le vrai classement des joueurs d’osu!, crée une application OAuth sur ton compte osu! et colle ici son ID et sa clé secrète.'),
    st, el('div', { class: 'field' }, el('div', { class: 'lab' }, 'ID client'), id), el('div', { class: 'field' }, el('div', { class: 'lab' }, 'Clé secrète'), secret), go,
    el('div', { class: 'muted', style: 'font-size:12px;line-height:1.6' }, 'Comment obtenir ces clés : ',
      el('a', { class: 'ext', href: 'https://osu.ppy.sh/docs/index.html#registering-an-oauth-application', target: '_blank' }, 'tutoriel officiel osu! (enregistrer une application OAuth)'), ' · ',
      el('a', { class: 'ext', href: 'https://osu.ppy.sh/home/account/edit#oauth', target: '_blank' }, 'mes paramètres osu! → OAuth'),
      el('div', {}, 'Dans « Nouvelle application OAuth », donne un nom (ex. Replay HUD) et l’URL de rappel http://localhost:8294, puis copie l’ID client et la clé secrète.')));
}
function boardBlock() {
  const b = S.app.board, rows = el('div', { class: 'wlist' });
  const drawRows = () => rows.replaceChildren(...b.custom.map((c, i) => el('div', { class: 'custom-row' },
    ...[['name', 'Pseudo'], ['pp', 'pp'], ['acc', 'préc. %'], ['combo', 'combo']].map(([k, ph]) => el('input', { value: c[k] ?? '', placeholder: ph, onchange: e => { c[k] = e.target.value; save(true); rebuildTimeline(); } })),
    el('button', { class: 'icon-btn', onclick: () => { b.custom.splice(i, 1); save(true); drawRows(); rebuildTimeline(); } }, icon('x')))));
  drawRows();
  return grp('Classement personnalisé',
    segField('Serveur du classement', [['osu', 'osu!'], ['akatsuki', 'Akatsuki'], ['gatari', 'Gatari']], () => b.source || 'osu', v => { b.source = v; save(true); }),
    el('p', { class: 'muted', style: 'font-size:12px;margin:-4px 0 0' }, 'Akatsuki : classement Relax ou Autopilot choisi tout seul selon les mods du replay. Appliqué à l’export vidéo.'),
    range('Nombre de scores en ligne', { min: 5, max: 50 }, () => b.limit || 50, (v, l) => { b.limit = v; if (!l) { save(true); rebuildTimeline(); } }),
    text('Joueurs à masquer (séparés par des virgules)', () => (b.exclude || []).join(', '), v => { b.exclude = v.split(',').map(x => x.trim()).filter(Boolean); save(true); rebuildTimeline(); }, 'ex. joueur1, joueur2'),
    el('div', { class: 'field' }, el('div', { class: 'lab' }, 'Joueurs ajoutés à la main (amis, rivaux…)'), rows),
    el('button', { class: 'btn ghost sm', onclick: () => { b.custom.push({ name: '', pp: '', acc: '', combo: '' }); save(true); drawRows(); } }, icon('plus'), 'Ajouter un joueur'));
}

// ---- updates
function showUpdates() {
  const u = S.updates, any = !!u && !!(u.tosu?.available || u.danser?.available || u.dancing?.available);
  $('#btnUpd').hidden = !any;
  // Nouvelle version de Dancing! : fenêtre une fois par version (« Plus tard » la met de côté jusqu'à la suivante).
  const d = u?.dancing; let skipped = null; try { skipped = localStorage.getItem('rh.skipVer'); } catch { }
  if (d?.available && d.asset && skipped !== d.latest && !S.updPrompted) { S.updPrompted = true; promptDancingUpdate(d); }
}
function promptDancingUpdate(d) {
  const v = s => String(s || '?').replace(/^v/, ''), log = el('pre', { class: 'log', hidden: true });
  const go = el('button', { class: 'btn primary', onclick: async () => {
    go.disabled = later.disabled = true;
    try { await api('/api/update', { what: 'dancing' }); log.hidden = false; pollUpd(log); } catch (e) { toast(e.message, true); go.disabled = later.disabled = false; }
  } }, icon('upload'), 'Mettre à jour');
  const later = el('button', { class: 'btn ghost', onclick: () => { try { localStorage.setItem('rh.skipVer', d.latest); } catch { } $('#modal').hidden = true; } }, 'Plus tard');
  modal('Nouvelle version de Dancing!', el('div', {},
    el('p', {}, el('b', {}, `Dancing! ${v(d.latest)}`), ` est disponible (tu as la ${v(d.current)}).`),
    d.notes ? el('pre', { class: 'log', style: 'white-space:pre-wrap;max-height:220px' }, d.notes) : null,
    el('p', { class: 'muted', style: 'font-size:12px' }, 'Dancing! se ferme, s’installe et redémarre tout seul. Tes réglages, vidéos et widgets sont gardés.'),
    log, el('div', { class: 'two' }, later, go)));
}
setTimeout(async () => { S.updates = await api('/api/updates').catch(() => S.updates); showUpdates(); }, 4000);
function openUpdates() {
  const u = S.updates || {}, log = el('pre', { class: 'log', hidden: true });
  const v = s => String(s || '?').replace(/^v/, '');
  const row = (what, label, info) => el('div', { class: 'updrow' }, icon(info?.available ? 'upload' : 'check'), el('b', {}, info?.available ? `${label} ${info.current} → ${v(info.latest)}` : `${label} ${v(info?.current || info?.latest)}`),
    info?.available ? el('button', { class: 'btn primary sm upd-go', onclick: async e => { const b = e.currentTarget; b.disabled = true; try { await api('/api/update', { what }); log.hidden = false; pollUpd(log); } catch (err) { toast(err.message, true); b.disabled = false; } } }, 'Mettre à jour') : el('span', { class: 'muted' }, info?.error || 'à jour'));
  modal('Mises à jour', el('div', {}, row('dancing', 'Dancing!', u.dancing), row('tosu', 'tosu', u.tosu), row('danser', 'danser', u.danser),
    el('p', { class: 'muted', style: 'font-size:12px' }, 'tosu : remplace tosu.exe (une copie de l’ancien est gardée). danser : télécharge la nouvelle version, y réapplique l’export de Dancing! puis la recompile (quelques minutes, l’ancienne version est sauvegardée).'), log));
  // une mise à jour déjà lancée : on reprend son journal
  api('/api/update-job').then(j => { if (j?.running) { log.hidden = false; $$('.upd-go').forEach(b => b.disabled = true); pollUpd(log); } }).catch(() => {});
}
async function pollUpd(log) {
  const j = await api('/api/update-job').catch(() => null); if (!j) return;
  log.textContent = j.log.join('\n'); log.scrollTop = log.scrollHeight;
  if (j.restarting) { log.textContent += '\nRedémarrage de Dancing!…'; return; }
  if (j.running) setTimeout(() => pollUpd(log), 1000); else { toast(j.ok ? 'Mise à jour terminée' : 'Mise à jour échouée', !j.ok); S.updates = await api('/api/updates').catch(() => S.updates); showUpdates(); }
}
$('#btnUpd').addEventListener('click', openUpdates);
function setEditing(active) {
  P_.editing = active;
  $('#screen').classList.toggle('editing', active);
  $('#btnEdit').setAttribute('aria-pressed', active);
  $('#btnEdit span').textContent = active ? 'Terminer' : 'Disposition';
  if (active) {
    setScene('game'); P_.playing = false; playIcon(); $('.tabs button[data-t=style]').click();
  }
  paneOverlay();
}
$('#screen').addEventListener('contextmenu', event => {
  if (!P_.editing) return;
  event.preventDefault();
  const hit = hitTest(...canvasPoint(event));
  if (hit?.kind === 'tosu') { P_.sel = hit; paneOverlay(); }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Delete' || !P_.editing || P_.sel?.kind !== 'tosu' || event.target.closest('input, textarea, select, [contenteditable]')) return;
  event.preventDefault(); removeWidget(P_.sel.i);
});
$('#btnEdit').addEventListener('click', () => S.app && setEditing(!P_.editing));

boot().catch(e => { console.error(e); toast(e.message, true); });

// Comportement d'application native : pas de menu contextuel, de zoom, de recherche, d'impression ni de rechargement.
document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
document.addEventListener('dragstart', e => { if (e.target.closest?.('img, a, svg, canvas')) e.preventDefault(); });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (['f3', 'f5', 'f7', 'f12', 'browserback', 'browserforward', 'browserrefresh'].includes(k) || (e.altKey && ['arrowleft', 'arrowright'].includes(k))
    || (mod && !e.target.closest?.('input, textarea') && ['r', 'p', 'f', 'g', 'j', 'h', 'u', 's', 'o', 'n', 't', 'w', '+', '-', '=', '0', 'l', 'd', 'e'].includes(k))
    || (mod && e.shiftKey && ['i', 'c', 'j', 'delete'].includes(k)))
    e.preventDefault();
}, true);

// ---- fenêtre sans cadre Windows : déplacement par la barre du haut et boutons maison (shell Tauri uniquement)
const tauriWin = window.__TAURI__?.window?.getCurrentWindow?.();
if (tauriWin) {
  document.body.classList.add('frameless');
  $('#winctl').hidden = false;
  const bar = $('.topbar'), interactive = e => e.target.closest('button, a, input, select, textarea, label, [role="button"]');
  bar.addEventListener('mousedown', e => { if (e.button === 0 && !interactive(e) && e.detail === 1) tauriWin.startDragging(); });
  bar.addEventListener('dblclick', e => { if (!interactive(e)) tauriWin.toggleMaximize(); });
  const syncMax = async () => { const m = await tauriWin.isMaximized(); document.body.classList.toggle('maximized', m); $('#winMax').setAttribute('aria-label', m ? 'Restaurer' : 'Agrandir'); };
  $('#winMin').onclick = () => tauriWin.minimize();
  $('#winMax').onclick = () => tauriWin.toggleMaximize();
  $('#winClose').onclick = () => tauriWin.close();
  tauriWin.onResized?.(syncMax); syncMax();
}
