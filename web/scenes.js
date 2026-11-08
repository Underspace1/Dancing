// Replay HUD — intro (map loading screen) and results scenes, styled after the results screen of the
// reference video. Canvas 2D, 1920x1080 design space; runs in Node (video) and in the browser (preview).
import { gradeLetter } from './hud.js';

const W = 1920, H = 1080;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const eo = p => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
const eio = p => { p = clamp(p, 0, 1); return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
const back = p => { p = clamp(p, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const comma = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const F = (w, px) => `${w} ${px}px "Nunito"`;
const MODC = { DT: '#e2453f', NC: '#e2453f', HR: '#e2453f', SD: '#e2453f', PF: '#e2453f', HD: '#ffcc22', FL: '#ffcc22', EZ: '#88da20', NF: '#88da20', HT: '#88da20', RX: '#4fd0e8', AP: '#4fd0e8', SO: '#4fd0e8', TD: '#4fd0e8' };
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function clip(g, t, w) { t = String(t ?? ''); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
function star(g, cx, cy, R) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? R * .45 : R; g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } g.closePath(); g.fill(); }
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function prepareBackdrop(img, makeCanvas) {
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0b0b0e'; g.fillRect(0, 0, W, H);
  if (img) { const s = Math.max(W / img.width, H / img.height) * 1.06; g.filter = 'blur(14px)'; g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); g.filter = 'none'; }
  else { const gr = g.createRadialGradient(W * .6, H * .35, 60, W / 2, H / 2, 1300); gr.addColorStop(0, '#2c2440'); gr.addColorStop(1, '#0b0b0e'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  c.image = img; return c;
}
function backdrop(g, bd, zoom, dim) {
  g.save(); g.translate(W / 2, H / 2); g.scale(zoom, zoom); g.drawImage(bd, -W / 2, -H / 2, W, H); g.restore();
  g.fillStyle = `rgba(8,8,10,${dim})`; g.fillRect(0, 0, W, H);
}
function cover(g, img, x, y, w, h) { if (!img) { g.fillStyle = '#2a2633'; g.fillRect(x, y, w, h); return; } const s = Math.max(w / img.width, h / img.height); g.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s); }
function modIcon(g, m, x, y, r = 15) {
  g.save(); g.translate(x, y); g.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fillStyle = MODC[m] || '#8a8f9a'; g.fill();
  g.fillStyle = 'rgba(0,0,0,.72)'; g.font = F(800, r * .72); g.textAlign = 'center'; g.fillText(m, 0, r * .26); g.restore();
}
function starPill(g, stars, x, y) {
  g.font = F(800, 17); const txt = stars.toFixed(2), w = g.measureText(txt).width + 46;
  g.fillStyle = '#16161c'; rr(g, x, y, w, 30, 15); g.fill();
  g.fillStyle = '#fff'; star(g, x + 18, y + 15, 8); g.textAlign = 'left'; g.fillText(txt, x + 31, y + 21); return w;
}
function fade(g, t, dur, a = .4, b = .6) { const k = Math.min(clamp(t / a, 0, 1), clamp((dur - t) / b, 0, 1)); if (k < 1) { g.fillStyle = `rgba(0,0,0,${1 - k})`; g.fillRect(0, 0, W, H); } }

// ---------------------------------------------------------------- intro: map loading screen
// info: { meta, player, mods[], bpm, countryRank, globalRank, settings:{dim, music, effects, storyboard, video} }
export function drawIntro(g, t, dur, info, assets, cfg = {}) {
  const m = info.meta, s = info.settings || {};
  g.save(); g.textBaseline = 'alphabetic';
  backdrop(g, assets.backdrop, 1.08 - .06 * eo(t / dur), .62);
  const at = d => eo((t - d) / .6);
  // centre metadata card
  const out = eio((t - (dur - .8)) / .8), cp = at(.05);
  const zoom = (0.94 + .06 * cp) * (1 + .12 * out);
  g.save(); g.translate(960, 520); g.scale(zoom, zoom); g.translate(-960, -520); g.globalAlpha = cp * (1 - out);
  const cx = 960 - 300, cy = 190, cw = 600, ch = 338;
  g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 40; rr(g, cx, cy, cw, ch, 18); g.fillStyle = '#000'; g.fill(); g.restore();
  g.save(); rr(g, cx, cy, cw, ch, 18); g.clip(); cover(g, assets.backdrop?.image, cx, cy, cw, ch);
  const gr = g.createLinearGradient(0, cy + ch * .45, 0, cy + ch); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.65)'); g.fillStyle = gr; g.fillRect(cx, cy, cw, ch); g.restore();
  g.textAlign = 'center';
  g.globalAlpha = at(.25) * (1 - out); g.font = F(800, 44); g.fillStyle = '#fff'; g.fillText(clip(g, m.title, 900), 960, 600 + (1 - at(.25)) * 14);
  g.globalAlpha = at(.35) * (1 - out); g.font = F(700, 26); g.fillStyle = '#d6d6de'; g.fillText(clip(g, m.artist, 800), 960, 638 + (1 - at(.35)) * 14);
  g.globalAlpha = at(.45) * (1 - out); g.font = F(800, 24); g.fillStyle = '#fff'; g.fillText(clip(g, m.version, 800), 960, 694);
  g.font = F(600, 18); g.fillStyle = '#b9b9c4'; g.fillText(`mappé par ${m.creator || '?'}`, 960, 720);
  // star pill + mods row
  g.globalAlpha = at(.55) * (1 - out);
  g.font = F(800, 17); const pw = g.measureText((m.stars || 0).toFixed(2)).width + 46, mods = info.mods || [], rowW = pw + mods.length * 36 + (mods.length ? 12 : 0);
  starPill(g, m.stars || 0, 960 - rowW / 2, 742);
  mods.forEach((md, i) => modIcon(g, md, 960 - rowW / 2 + pw + 12 + 18 + i * 36, 757));
  // stats strip
  const stats = [['BPM', Math.round(info.bpm || 0)], ['Durée', fmtTime((m.length || (m.end - m.start) || 0) / 1000 / (m.rate || 1))], ['CS', (+m.cs || 0).toFixed(1)], ['AR', (+m.ar || 0).toFixed(1)], ['OD', (+m.od || 0).toFixed(1)], ['HP', (+m.hp || 0).toFixed(1)]];
  stats.forEach(([k, v], i) => { const x = 960 + (i - 2.5) * 110, p = at(.65 + i * .05); g.globalAlpha = p * (1 - out); g.font = F(700, 14); g.fillStyle = '#9a9aa6'; g.fillText(k, x, 812); g.font = F(800, 24); g.fillStyle = '#fff'; g.fillText(String(v), x, 842); });
  // loading spinner (rounded square, rotating)
  g.globalAlpha = at(.4) * (1 - out);
  g.save(); g.translate(960, 914); g.rotate(t * 2.6); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.9)'; rr(g, -18, -18, 36, 36, 9); g.setLineDash([60, 200]); g.lineDashOffset = -t * 120; g.stroke(); g.restore(); g.setLineDash([]);
  g.restore();
  // player chip (bottom left)
  const pc = at(.5) * (1 - out); g.globalAlpha = pc;
  g.save(); rr(g, 40, 970, 70, 70, 14); g.clip(); if (assets.avatar) g.drawImage(assets.avatar, 40, 970, 70, 70); else { g.fillStyle = '#2a2a33'; g.fillRect(40, 970, 70, 70); } g.restore();
  g.textAlign = 'left'; g.font = F(800, 26); g.fillStyle = '#fff'; g.fillText(info.player || '', 128, 1000);
  g.font = F(600, 17); g.fillStyle = '#b9b9c4'; g.fillText([info.globalRank && `#${info.globalRank}`, info.countryRank && `#${info.countryRank} pays`].filter(Boolean).join('  ·  ') || 'joue', 128, 1028);
  g.restore();
  fade(g, t, dur, .45, .25);
}

// ---------------------------------------------------------------- results: lens style
// L'overlay s'efface, la barre CS/AR/OD/HP descend, une loupe en verre monte au centre avec la note,
// le classement de la map à gauche, le score détaillé à droite, la date en bas.
const GRADE = { X: ['#ffffff', '#b8c4d6'], S: ['#ffe27a', '#d9a020'], A: ['#b6f07a', '#5cb82c'], B: ['#9fd6ff', '#3c8fd8'], C: ['#e0a8ff', '#a050d0'], D: ['#ff9a9a', '#d83c3c'], F: ['#ff9a9a', '#d83c3c'] };
const ago = iso => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000; if (!(d >= 0)) return '';
  const u = [[31536000, 'an', 'ans'], [2592000, 'mois', 'mois'], [86400, 'jour', 'jours'], [3600, 'heure', 'heures'], [60, 'minute', 'minutes']].find(([s]) => d >= s);
  if (!u) return 'à l’instant'; const n = Math.floor(d / u[0]); return `il y a ${n} ${n > 1 ? u[2] : u[1]}`;
};
function gradeText(g, gl, x, y, px) {
  const [a, b] = GRADE[gl] || GRADE.S; g.font = F(800, px); g.textAlign = 'center';
  const lg = g.createLinearGradient(0, y - px * .75, 0, y); lg.addColorStop(0, a); lg.addColorStop(1, b); g.fillStyle = lg; g.fillText(gl, x, y);
}
export function drawOutro(g, t, dur, s, assets, cfg = {}) {
  if (cfg.outroStyle === 'classic') return drawOutroClassic(g, t, dur, s, assets, cfg);
  const m = s.meta, gl = gradeLetter(s.grade), R = 290, CX = 960;
  g.save(); g.textBaseline = 'alphabetic';
  backdrop(g, assets.backdrop, 1.03, .6);
  const at = d => eo((t - d) / .55);

  // ===== barre du haut : CS / AR / OD / HP et étoiles
  const tp = at(0), ty = -90 * (1 - tp); g.globalAlpha = tp;
  [['CS', m.cs, '#e0505a', 480], ['AR', m.ar, '#6fdc5a', 735], ['OD', m.od, '#9a6cf0', 1185], ['HP', m.hp, '#5a7ff0', 1440]].forEach(([k, v, col, x]) => {
    v = +v || 0; g.fillStyle = 'rgba(255,255,255,.14)'; rr(g, x - 105, ty + 22, 210, 9, 5); g.fill();
    g.fillStyle = col; rr(g, x - 105, ty + 22, 210 * clamp(v / 10, .03, 1), 9, 5); g.fill();
    g.font = F(700, 24); g.fillStyle = '#e8e8ee'; g.textAlign = 'left'; g.fillText(k + ':', x - 105, ty + 66); g.textAlign = 'right'; g.fillText(v.toFixed(2), x + 105, ty + 66);
  });
  g.fillStyle = '#f2b640'; g.beginPath(); g.arc(CX, ty + 22, 26, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; star(g, CX, ty + 23, 15);
  g.font = F(700, 50); g.textAlign = 'center'; g.fillStyle = '#f2c060'; g.fillText((m.stars || 0).toFixed(2), CX, ty + 96);

  // ===== loupe : monte du bas jusqu'au centre
  const lp = eo((t - .2) / 1.0), cy = 640 + (1 - lp) * 820;
  // le bord du cercle (position finale) sert de guide aux colonnes gauche et droite
  const edge = (y, side) => CX + side * (Math.sqrt(Math.max(0, R * R - (y - 640) ** 2)) + 22);

  // ===== colonne gauche : joueur puis classement de la map
  const board = s.board || [], me = board.find(b => b.player);
  const cp = at(1.2); g.globalAlpha = cp;
  { const y = 392, x1 = edge(y + 26, -1) + 60, x0 = x1 - 340 - (1 - cp) * 60;
    g.fillStyle = 'rgba(70,70,80,.85)'; rr(g, x0, y, x1 - x0, 58, 10); g.fill();
    g.save(); rr(g, x0 + 8, y + 7, 44, 44, 8); g.clip(); if (assets.avatar) g.drawImage(assets.avatar, x0 + 8, y + 7, 44, 44); else { g.fillStyle = '#2a2a33'; g.fillRect(x0 + 8, y + 7, 44, 44); } g.restore();
    g.textAlign = 'left'; g.font = F(800, 22); g.fillStyle = '#fff'; g.fillText(clip(g, (s.player || '') + (me && s.of > 1 ? ` #${s.rank}` : ''), 240), x0 + 64, y + 28);
    g.font = F(600, 14); g.fillStyle = '#c4c4cc'; g.fillText(s.of > 1 ? `sur ${s.of} au classement de la map` : 'classement indisponible', x0 + 64, y + 48); }
  board.filter(b => !b.player).slice(0, 6).forEach((b, i) => {
    const p = at(1.3 + i * .07), y = 476 + i * 66, xr = edge(y + 20, -1) - (1 - p) * 60, x0 = xr - 250; g.globalAlpha = p;
    g.font = F(800, 34); g.textAlign = 'left'; const bg = gradeLetter(b.grade || b.rank); g.fillStyle = (GRADE[bg] || GRADE.A)[0]; g.fillText(bg, x0, y + 34);
    g.save(); rr(g, x0 + 34, y + 2, 44, 44, 6); g.clip(); if (b.avatarImg) g.drawImage(b.avatarImg, x0 + 34, y + 2, 44, 44); else { g.fillStyle = '#34343c'; g.fillRect(x0 + 34, y + 2, 44, 44); } g.restore();
    g.font = F(700, 17); g.fillStyle = '#fff'; g.fillText(clip(g, b.name, xr - x0 - 88), x0 + 88, y + 20);
    const mods = (b.mods || []).slice(0, 4); mods.forEach((md, j) => modIcon(g, md, x0 + 98 + j * 26, y + 36, 11));
    g.font = F(700, 15); g.fillStyle = '#d8d8e0';
    g.fillText(b.pp != null ? `${Math.round(b.pp)}pp` : comma(b.score || 0), x0 + 88 + mods.length * 26 + (mods.length ? 8 : 0), y + 41);
  });

  // ===== la loupe elle-même : le fond agrandi derrière un verre
  g.globalAlpha = 1;
  g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 50; g.beginPath(); g.arc(CX, cy, R, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(CX, cy, R, 0, Math.PI * 2); g.clip();
  const img = assets.backdrop?.image;
  if (img) { const k = Math.max(W / img.width, H / img.height) * 1.6; g.filter = 'blur(3px)'; g.drawImage(img, CX - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); g.filter = 'none'; }
  else { g.save(); g.translate(CX, cy); g.scale(1.6, 1.6); g.drawImage(assets.backdrop, -W / 2, -H / 2, W, H); g.restore(); }
  g.fillStyle = 'rgba(10,10,14,.42)'; g.fillRect(CX - R, cy - R, R * 2, R * 2);
  const gp = back((t - 1.1) / .5);
  const glow = g.createRadialGradient(CX, cy, 0, CX, cy, R); glow.addColorStop(0, (GRADE[gl] || GRADE.S)[1] + '55'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = clamp(gp, 0, 1); g.fillStyle = glow; g.fillRect(CX - R, cy - R, R * 2, R * 2); g.globalAlpha = 1;
  const vig = g.createRadialGradient(CX, cy, R * .62, CX, cy, R); vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = vig; g.fillRect(CX - R, cy - R, R * 2, R * 2);
  if (gp > 0) { g.save(); g.translate(CX, cy); g.scale(gp, gp); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 24; gradeText(g, gl, 0, 118, 340); g.restore(); }
  g.restore();
  g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(CX, cy, R, 0, Math.PI * 2); g.stroke();
  const fl = clamp(1 - (t - 1.1) / .6, 0, 1); if (fl > 0 && t > 1.1) { g.globalAlpha = fl * .6; g.lineWidth = 4; g.strokeStyle = '#fff'; g.beginPath(); g.arc(CX, cy, R + (1 - fl) * 70, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }

  // ===== colonne droite : score détaillé
  const row = (d, y, draw) => { const p = at(d); if (p <= 0) return; g.globalAlpha = p; g.save(); g.translate((1 - p) * 60, 0); draw(edge(y, 1)); g.restore(); };
  const cu = eio((t - 1.3) / 1.4);
  row(1.3, 470, x => { g.font = F(700, 15); const lw = g.measureText('Score').width + 18; g.fillStyle = 'rgba(120,120,130,.8)'; rr(g, x, 452, lw, 24, 6); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('Score', x + 9, 469);
    (s.mods || []).forEach((md, j) => modIcon(g, md, x + lw + 20 + j * 30, 464, 12)); });
  row(1.35, 512, x => { g.font = F(800, 46); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(comma(s.score * cu).replace(/,/g, ' '), x, 526); });
  row(1.4, 585, x => { g.font = F(600, 38); g.fillStyle = '#c8c8d0'; g.textAlign = 'left'; g.fillText(`${Math.round(s.maxCombo * cu)}/${m.maxCombo || s.maxCombo}x`, x, 596); });
  row(1.45, 640, x => {
    const txt = `${Math.round(s.pp * cu)}PP`; g.font = F(800, 30); const w = g.measureText(txt).width + 34;
    g.fillStyle = 'rgba(205,205,215,.9)'; g.beginPath(); g.moveTo(x, 618); g.lineTo(x + w - 14, 618); g.lineTo(x + w, 640); g.lineTo(x + w - 14, 662); g.lineTo(x, 662); g.closePath(); g.fill();
    g.fillStyle = '#26262c'; g.textAlign = 'left'; g.fillText(txt, x + 14, 652);
    if (s.fc && Math.round(s.fc) > Math.round(s.pp)) { g.font = F(600, 24); g.fillStyle = '#d8d8e0'; g.fillText(`FC : ${Math.round(s.fc)}`, x + w + 18, 650); }
  });
  row(1.5, 700, x => { g.font = F(600, 38); g.fillStyle = '#c8c8d0'; g.textAlign = 'left'; g.fillText(`${s.acc.toFixed(2)}%`, x, 712); });
  row(1.55, 758, x => {
    let px = x; [[s.n100, '#5ec24a'], [s.n50, '#e0c040'], [s.nmiss, '#e0505a'], [s.nsb, '#9a9aa2']].forEach(([v, col], i) => {
      g.font = F(800, 26); const w = Math.max(56, g.measureText(String(v ?? 0)).width + 28);
      g.fillStyle = col; g.beginPath(); g.moveTo(px + (i ? 10 : 0), 740); g.lineTo(px + w + 10, 740); g.lineTo(px + w, 776); g.lineTo(px, 776); g.closePath(); g.fill();
      g.fillStyle = i === 3 ? '#26262c' : '#fff'; g.textAlign = 'center'; g.fillText(String(v ?? 0), px + w / 2 + 5, 768); px += w + 4;
    });
  });

  // ===== date
  const when = s.playedIso ? ago(s.playedIso) : s.playedAt || '';
  if (when) { g.globalAlpha = at(1.8); g.textAlign = 'center'; g.font = F(600, 24); g.fillStyle = '#9a9aa4'; g.fillText(when, CX, 1050); }
  g.restore();
  fade(g, t, dur, .35, .6);
}

// ---------------------------------------------------------------- results: ancien style (écran de résultats façon osu!lazer)
const RANK = { X: '#ffffff', S: '#4fd0e8', A: '#88da20', B: '#ffcc22', C: '#ff8e5d', D: '#ff5a5a', F: '#ff5a5a' };
const THRESH = [[0, .7, 'D'], [.7, .8, 'C'], [.8, .9, 'B'], [.9, .95, 'A'], [.95, 1, 'S']];
function drawOutroClassic(g, t, dur, s, assets, cfg = {}) {
  const m = s.meta, gl = gradeLetter(s.grade), acc = s.acc / 100;
  g.save(); g.textBaseline = 'alphabetic';
  backdrop(g, assets.backdrop, 1.03, .55);
  const at = d => eo((t - d) / .55);

  // ===== left score panel
  const pp = at(0), px = 150, pw = 500;
  g.save(); g.globalAlpha = pp; g.translate(400, 540); g.scale(.94 + .06 * pp, .94 + .06 * pp); g.translate(-400, -540);
  g.fillStyle = 'rgba(42,42,44,.96)'; rr(g, px, 105, pw, 895, 22); g.fill();
  // avatar + name
  g.save(); rr(g, 345, 40, 110, 110, 20); g.clip(); if (assets.avatar) g.drawImage(assets.avatar, 345, 40, 110, 110); else { g.fillStyle = '#3a3a44'; g.fillRect(345, 40, 110, 110); } g.restore();
  g.textAlign = 'center'; g.font = F(700, 19); g.fillStyle = '#fff'; g.fillText(s.player || m.player || '', 400, 180);
  // coloured card
  const card = g.createLinearGradient(0, 196, 0, 790); card.addColorStop(0, '#7e5a99'); card.addColorStop(.55, '#5f4877'); card.addColorStop(1, '#3d3150');
  g.fillStyle = card; rr(g, px, 196, pw, 594, 20); g.fill();
  g.save(); rr(g, px, 196, pw, 594, 20); g.clip(); g.globalAlpha = pp * .18; cover(g, assets.backdrop?.image, px, 196, pw, 594); g.restore(); g.globalAlpha = pp;
  g.font = F(800, 26); g.fillStyle = '#fff'; g.fillText(clip(g, m.title, pw - 40), 400, 238);
  g.font = F(700, 17); g.fillStyle = '#ece6f2'; g.fillText(clip(g, m.artist, pw - 40), 400, 262);
  // accuracy ring
  const cx = 400, cy = 468, sweep = eio((t - .45) / 1.7), show = Math.min(acc, sweep * acc);
  const a0 = -Math.PI / 2, A = f => a0 + Math.PI * 2 * f;
  g.lineCap = 'butt';
  g.lineWidth = 6; for (const [f0, f1, r] of THRESH) { const e = Math.min(f1, sweep); if (e > f0) { g.beginPath(); g.arc(cx, cy, 112, A(f0) + .02, A(e) - .02); g.strokeStyle = RANK[r]; g.stroke(); } }
  g.lineWidth = 34; g.beginPath(); g.arc(cx, cy, 147, 0, Math.PI * 2); g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke();
  if (show > 0) { const grd = g.createConicGradient ? g.createConicGradient(a0, cx, cy) : null; if (grd) { grd.addColorStop(0, '#7cf0ff'); grd.addColorStop(.5, '#88ff99'); grd.addColorStop(1, '#7cf0ff'); g.strokeStyle = grd; } else g.strokeStyle = '#88f0d0'; g.beginPath(); g.arc(cx, cy, 147, A(0) + .015, A(show) - .005); g.stroke(); }
  // rank badges around the ring
  for (const [f0, f1, r] of THRESH) {
    const mid = r === 'D' ? .32 : (f0 + f1) / 2, p = back((sweep - f0) / .08); if (p <= 0) continue;
    const ang = A(mid), bx = cx + Math.cos(ang) * 184, by = cy + Math.sin(ang) * 184;
    g.save(); g.translate(bx, by); g.scale(p, p); g.fillStyle = RANK[r]; rr(g, -19, -11, 38, 22, 11); g.fill();
    g.fillStyle = 'rgba(0,0,0,.65)'; g.font = F(800, 15); g.fillText(r, 0, 5.5); g.restore();
  }
  g.fillStyle = 'rgba(20,18,26,.9)'; g.beginPath(); g.arc(cx, cy, 104, 0, Math.PI * 2); g.fill();
  const pop = back((t - 2.25) / .5);
  if (pop > 0) {
    g.save(); g.translate(cx, cy + 46); g.scale(pop, pop); g.font = F(800, 140);
    g.lineWidth = 6; g.strokeStyle = 'rgba(160,220,255,.55)'; g.strokeText(gl, 0, 0);
    const lg = g.createLinearGradient(0, -110, 0, 0); lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#cfe6ff'); g.fillStyle = lg; g.fillText(gl, 0, 0); g.restore();
    const fl = clamp(1 - (t - 2.25) / .6, 0, 1); if (fl > 0 && t > 2.25) { g.globalAlpha = pp * fl * .5; g.beginPath(); g.arc(cx, cy, 104 + (1 - fl) * 90, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke(); g.globalAlpha = pp; }
  }
  // score
  const cu = eio((t - .45) / 1.7);
  g.font = F(300, 60); g.fillStyle = '#fff'; g.fillText(comma(s.score * cu), 400, 690);
  // stars + mods, difficulty, mapper
  g.font = F(800, 17); const sw = g.measureText((m.stars || 0).toFixed(2)).width + 46, rowW = sw + 10 + s.mods.length * 34;
  starPill(g, m.stars || 0, 400 - rowW / 2, 702); s.mods.forEach((md, i) => modIcon(g, md, 400 - rowW / 2 + sw + 10 + 17 + i * 34, 717));
  g.textAlign = 'center'; g.font = F(800, 21); g.fillStyle = '#fff'; g.fillText(clip(g, m.version, pw - 40), 400, 757);
  g.font = F(600, 15); const mb = 'mapped by ', mw = g.measureText(mb).width; g.font = F(800, 15); const cw2 = g.measureText(m.creator || '').width; g.textAlign = 'left'; g.font = F(600, 15); g.fillStyle = '#ddd5e8'; g.fillText(mb, 400 - (mw + cw2) / 2, 779); g.font = F(800, 15); g.fillStyle = '#fff'; g.fillText(m.creator || '', 400 - (mw + cw2) / 2 + mw, 779);
  // statistics grid
  const cell = (x, y, w, label, color, value, sub, d) => {
    const p = at(d); g.globalAlpha = pp * p;
    g.fillStyle = 'rgba(20,20,22,.85)'; rr(g, x, y, w, 20, 10); g.fill();
    g.textAlign = 'center'; g.font = F(800, 12.5); g.fillStyle = color; g.fillText(label, x + w / 2, y + 14.5);
    g.font = F(600, 24); g.fillStyle = '#fff'; const vw = g.measureText(value).width; g.font = F(600, 13); const swd = sub ? g.measureText(sub).width + 3 : 0;
    g.font = F(600, 24); g.textAlign = 'left'; g.fillText(value, x + w / 2 - (vw + swd) / 2, y + 48);
    if (sub) { g.font = F(600, 13); g.fillStyle = '#bdbdc6'; g.fillText(sub, x + w / 2 - (vw + swd) / 2 + vw + 3, y + 48); }
  };
  const gx = px + 14, gw = pw - 28;
  [['ACCURACY', '#fff', `${(s.acc).toFixed(2)}%`], ['MAX COMBO', '#fff', String(s.maxCombo), `/${m.maxCombo || s.maxCombo}`], ['PP', '#fff', String(Math.round(s.pp))]].forEach(([l, c, v, sb], i) => cell(gx + i * (gw / 3), 800, gw / 3 - 6, l, c, v, sb, 1.0 + i * .05));
  [['GREAT', '#66ccff', s.n300], ['OK', '#88e070', s.n100], ['MEH', '#ffcc22', s.n50], ['MISS', '#ff5a5a', s.nmiss]].forEach(([l, c, v], i) => cell(gx + i * (gw / 4), 864, gw / 4 - 6, l, c, String(v), null, 1.15 + i * .05));
  [['SLIDER TICK', '#66ccff', String(s.ticks ?? '—')], ['SLIDER END', '#88e070', String(s.sliderEnd ?? '—'), s.maxSliderEnd ? `/${s.maxSliderEnd}` : ''], ['SLIDERBREAK', '#ff8e5d', String(s.nsb)], ['UR', '#ffffff', s.ur.toFixed(1)]].forEach(([l, c, v, sb], i) => cell(gx + i * (gw / 4), 928, gw / 4 - 6, l, c, v, sb, 1.3 + i * .05));
  g.globalAlpha = pp * at(1.5); g.textAlign = 'center'; g.font = F(600, 12.5); g.fillStyle = '#cfcfd8';
  g.fillText(`Played on ${s.playedAt || new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 400, 993);
  g.restore();

  // ===== right column (scrolls like the reference)
  const colX = 700, colW = 1090, top = 40, bottom = 995;
  const panels = [['Timing Distribution', 300], ['Accuracy Heatmap', 330], ['Statistics', 96], ['Overall Ranking', 150], ['Tag the beatmap', 140]];
  const total = panels.reduce((a, [, h]) => a + h + 22, 0), maxScroll = Math.max(0, total - (bottom - top));
  const scroll = maxScroll * eio((t - 4) / Math.max(1, dur - 5.5));
  g.save(); g.beginPath(); g.rect(colX - 10, top - 10, colW + 20, bottom - top + 20); g.clip();
  let y = top - scroll;
  panels.forEach(([title, h], i) => {
    const p = at(.25 + i * .12); g.globalAlpha = p; const x = colX + (1 - p) * 80;
    g.fillStyle = 'rgba(38,38,40,.94)'; rr(g, x, y, colW, h, 14); g.fill();
    g.textAlign = 'left'; g.font = F(800, 17); g.fillStyle = '#fff'; g.fillText(title, x + 18, y + 30);
    g.fillStyle = '#88e8c8'; g.fillRect(x + 18, y + 37, g.measureText(title).width, 2);
    const body = { x: x + 18, y: y + 50, w: colW - 36, h: h - 62 };
    if (i === 0) timing(g, body, s, m, t);
    else if (i === 1) heatmap(g, body, s, t);
    else if (i === 2) statsRow(g, body, s);
    else if (i === 3) ranking(g, body, s, t);
    else tags(g, body, m, s);
    y += h + 22;
  });
  g.restore();

  // ===== bottom bar
  const bb = at(.6); g.globalAlpha = bb; const by = 1012;
  g.fillStyle = '#ff66ab'; g.beginPath(); g.moveTo(0, by); g.lineTo(190, by); g.lineTo(178, by + 50); g.lineTo(0, by + 50); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(44, by + 25, 13, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(48, by + 18); g.lineTo(41, by + 25); g.lineTo(48, by + 32); g.stroke();
  g.fillStyle = '#fff'; g.font = F(700, 18); g.textAlign = 'left'; g.fillText('back', 76, by + 31);
  const btn = (x, w, col, draw) => { g.fillStyle = col; rr(g, x, by + 6, w, 38, 8); g.fill(); g.save(); g.translate(x + w / 2, by + 25); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 2.6; draw(); g.restore(); };
  btn(760, 300, '#86b300', () => { g.beginPath(); g.moveTo(-10, -6); g.lineTo(-10, 4); g.moveTo(-15, -1); g.lineTo(-10, 5); g.lineTo(-5, -1); g.moveTo(-17, 9); g.lineTo(-3, 9); g.moveTo(2, 0); g.lineTo(7, 5); g.lineTo(16, -6); g.stroke(); });
  btn(1080, 300, '#86b300', () => { g.beginPath(); g.arc(0, 0, 9, -2.4, 2.6); g.stroke(); g.beginPath(); g.moveTo(-9, -9); g.lineTo(-7, -3); g.lineTo(-1, -5); g.stroke(); });
  btn(1400, 80, '#3a3a40', () => { g.fillRect(-7, -9, 14, 18); });
  btn(1500, 90, '#86b300', () => { g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-14, -2, -8, -12, 0, -5); g.bezierCurveTo(8, -12, 14, -2, 0, 8); g.fill(); });
  g.restore();
  fade(g, t, dur, .45, .6);
}

function timing(g, b, s, m, t) {
  const w50 = m.hit50 || 100, bins = 81, cnt = new Array(bins).fill(0);
  for (const e of s.errors) cnt[clamp(Math.round((e / w50 + 1) / 2 * (bins - 1)), 0, bins - 1)]++;
  const mx = Math.max(1, ...cnt), bw = b.w / bins, base = b.y + b.h - 22, grow = eio((t - .7) / 1.2);
  cnt.forEach((n, i) => { const e = Math.abs(i / (bins - 1) * 2 - 1) * w50, col = e <= m.hit300 ? '#66ccff' : e <= m.hit100 ? '#88e070' : '#ffcc22'; const h = n / mx * (b.h - 40) * grow; g.fillStyle = col; if (h > .5) { rr(g, b.x + i * bw + 1.5, base - h, bw - 3, h, 2); g.fill(); } });
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(b.x, base, b.w, 1.5);
  g.font = F(700, 14); g.fillStyle = '#aaaab4';
  g.textAlign = 'left'; g.fillText(`-${Math.round(w50)}ms`, b.x, base + 18); g.textAlign = 'center'; g.fillText('0', b.x + b.w / 2, base + 18); g.textAlign = 'right'; g.fillText(`+${Math.round(w50)}ms`, b.x + b.w, base + 18);
}
function heatmap(g, b, s, t) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.h / 2 - 6, n = 21, cells = new Float32Array(n * n);
  const shown = Math.floor(s.hits.length * eio((t - .8) / 1.4));
  for (let i = 0; i < shown; i++) { const [a, c] = s.hits[i]; const rx = (a - c) * Math.SQRT1_2, ry = -(a + c) * Math.SQRT1_2; const gx = Math.round((rx / 1.1 + 1) / 2 * (n - 1)), gy = Math.round((ry / 1.1 + 1) / 2 * (n - 1)); if (gx >= 0 && gy >= 0 && gx < n && gy < n) cells[gy * n + gx]++; }
  const mx = Math.max(1, ...cells), step = r * 2 / n;
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = cx - r + (x + .5) * step, py = cy - r + (y + .5) * step; if (Math.hypot(px - cx, py - cy) > r - 4) continue;
    const v = cells[y * n + x] / mx; if (v <= 0) continue;
    g.fillStyle = `rgba(${Math.round(80 + 100 * v)},${Math.round(200 + 55 * v)},${Math.round(160 + 40 * v)},${.25 + .75 * v})`; g.beginPath(); g.arc(px, py, step * .32 + step * .12 * v, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - r * 1.25, cy + r * 1.0); g.lineTo(cx + r * 1.25, cy - r * 1.0); g.stroke();
  g.font = F(600, 13); g.fillStyle = '#e6e6ee'; g.textAlign = 'left'; g.fillText('Overshoot', cx + r * .95, cy - r * .9); g.textAlign = 'right'; g.fillText('Undershoot', cx - r * .95, cy + r * .98);
}
function statsRow(g, b, s) {
  const late = s.mean >= 0, items = [['Average Hit Error', `${Math.abs(s.mean).toFixed(2)} ms ${late ? 'late' : 'early'}`], ['Unstable Rate', s.ur.toFixed(2)]];
  items.forEach(([k, v], i) => { const x = b.x + i * (b.w / 2); g.textAlign = 'left'; g.font = F(600, 15); g.fillStyle = '#d0d0d8'; g.fillText(k, x + 10, b.y + 20); g.textAlign = 'right'; g.font = F(800, 15); g.fillStyle = '#fff'; g.fillText(v, x + b.w / 2 - 30, b.y + 20); });
}
function ranking(g, b, s, t) {
  g.save(); g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) { const sx = b.x + ((i * 97.3 + t * 18) % b.w), sy = b.y + b.h - 6 - ((i * 37) % 3) * 8, z = 10 + (i * 13) % 18; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + z, sy); g.lineTo(sx + z / 2, sy - z * .9); g.closePath(); g.stroke(); }
  g.restore();
  const ready = clamp((t - 2.6) / .5, 0, 1);
  if (ready < 1) { g.save(); g.globalAlpha *= 1 - ready; g.translate(b.x + b.w / 2, b.y + b.h / 2); g.rotate(t * 5); g.lineWidth = 3; g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 1.5); g.stroke(); g.restore(); }
  if (ready > 0 && s.of > 1) { g.globalAlpha *= ready; g.textAlign = 'center'; g.font = F(800, 34); g.fillStyle = '#fff'; g.fillText(`#${s.rank}`, b.x + b.w / 2, b.y + b.h / 2 + 6); g.font = F(600, 14); g.fillStyle = '#c8c8d0'; g.fillText(`sur ${s.of} scores du classement`, b.x + b.w / 2, b.y + b.h / 2 + 28); }
}
function tags(g, b, m, s) {
  const words = [...new Set(String(m.tags || '').split(/\s+/).filter(w => w.length > 1))].slice(0, 14);
  const list = words.length ? words : s.mods.length ? s.mods : ['osu!'];
  let x = b.x, y = b.y + 4; g.font = F(700, 14);
  for (const [i, w] of list.entries()) {
    const n = String(((i * 7 + 3) % 40) + 2), tw = g.measureText(w).width, nw = g.measureText(n).width, cw = tw + nw + 34;
    if (x + cw > b.x + b.w) { x = b.x; y += 34; if (y > b.y + b.h - 26) break; }
    const on = i % 3 !== 2; g.fillStyle = on ? '#9acd32' : '#4a4a52'; rr(g, x, y, cw, 26, 13); g.fill();
    g.fillStyle = on ? '#16200a' : '#e0e0e6'; g.textAlign = 'left'; g.fillText(w, x + 12, y + 18);
    g.fillStyle = '#16161a'; rr(g, x + tw + 18, y + 3, nw + 12, 20, 10); g.fill(); g.fillStyle = '#fff'; g.fillText(n, x + tw + 24, y + 18);
    x += cw + 8;
  }
}
