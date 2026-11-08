// Replay HUD — overlay renderer (Canvas 2D).
// The same file draws the overlay in three places: the offline video compositor
// (Node + @napi-rs/canvas), the editor preview and the live tosu overlay (browser).
// All coordinates are in a 1920x1080 design space measured on the reference video.

export const W = 1920, H = 1080;

export const defaults = {
  font: 'Nunito', boardFont: 'Arial',
  showTop: true, showBottom: true, showHitError: true, showBoard: true, showGraph: true, showKeys: true,
  showExtra: true, extraMode: 'fc', extraLabel: 'vs FC',
  showFlag: true, countryRank: '', globalRank: '',
  boardSort: 'pp', boardRows: 8, boardOpacity: 0.45,
  rollDigits: true, opacity: 1, scale: 1, introFade: 0, keySpeed: 0.5,
  panelColor: '#5d6169', tubeColor: '#7e7d84', textColor: '#f4f4f6',
  hpColor: '#46464e', hpEmpty: '#0e0e10', hpLow: '#ff5a5a', hpLowWarn: true,
  c300: '#309bd0', c100: '#48fa7a', c50: '#ffd84b', keyColor: '#96969e',
  tubeShape: 'dip', panelShape: 'slant', glow: 1, layout: {},
  hudIntro: 700,   // ms: HUD elements slide in when gameplay starts (0 = appear instantly)
};
const hex2rgb = h => { const n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, k) => { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; };
const rgba = (h, a) => `rgba(${hex2rgb(h).join(',')},${a})`;

const GRADE_COLORS = { X: '#ffe8a8', S: '#ffd866', A: '#86e57f', B: '#5aa8f0', C: '#c77be0', D: '#f26464', F: '#f26464' };
const MOD_COLORS = { DT: '#7b6cf6', NC: '#7b6cf6', HT: '#7b6cf6', HD: '#f5c242', FL: '#f5c242', HR: '#f2555a', EZ: '#7ad15a', NF: '#7ad15a', SD: '#f2555a', PF: '#f2555a', SO: '#56c8f0', RX: '#56c8f0', AP: '#56c8f0', TD: '#56c8f0' };

export const gradeLetter = g => { g = String(g || '').toUpperCase(); if (g === 'XH' || g === 'SSH' || g === 'SS') return 'X'; if (g === 'SH') return 'S'; return g || 'X'; };
const group = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const trimFix = (n, d) => (+(+n).toFixed(d)).toString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = p => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
const shortScore = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);

// Odometer-style text: characters that change roll vertically.
class Roller {
  constructor() { this.cur = null; this.prev = null; this.t0 = -1e9; }
  draw(g, text, x, y, align, now, size, on = true) {
    if (!on) { g.textAlign = align; g.fillText(text, x, y); return; }
    if (text !== this.cur) { this.prev = this.cur; this.cur = text; this.t0 = now; }
    const p = ease((now - this.t0) / 220);
    const wNew = g.measureText(text).width;
    let left = align === 'right' ? x - wNew : align === 'center' ? x - wNew / 2 : x;
    g.textAlign = 'left';
    const prev = p < 1 && this.prev != null ? this.prev.padStart(text.length).slice(-text.length) : null;
    const h = size * 1.05;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], adv = g.measureText(text.slice(0, i + 1)).width - g.measureText(text.slice(0, i)).width;
      const old = prev ? prev[i] : ch;
      if (!prev || old === ch || !/\d/.test(ch + old)) g.fillText(ch, left, y);
      else {
        g.save(); g.beginPath(); g.rect(left - 2, y - size, adv + 4, size * 1.3); g.clip();
        const a = g.globalAlpha;
        g.globalAlpha = a * (1 - p); g.fillText(old, left, y - p * h);
        g.globalAlpha = a * p; g.fillText(ch, left, y + (1 - p) * h);
        g.restore();
      }
      left += adv;
    }
  }
}

// Exponential smoothing toward a target (frame-rate independent).
class Smooth { constructor(v = null, ms = 140) { this.v = v; this.ms = ms; } to(t, dt) { if (this.v == null || !isFinite(this.v)) this.v = t; else this.v = lerp(this.v, t, 1 - Math.exp(-dt / this.ms)); return this.v; } }

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
// Parallelogram with rounded corners; the top edge is shifted right by `slant` (negative: left).
function slanted(g, x, y, w, h, slant, r) {
  const pts = [[x + slant, y], [x + w + slant, y], [x + w, y + h], [x, y + h]];
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const [px, py] = pts[i], [nx, ny] = pts[(i + 1) % 4], [qx, qy] = pts[(i + 3) % 4];
    const d1 = Math.hypot(qx - px, qy - py), d2 = Math.hypot(nx - px, ny - py);
    const a = [px + (qx - px) / d1 * r, py + (qy - py) / d1 * r], b = [px + (nx - px) / d2 * r, py + (ny - py) / d2 * r];
    if (i === 0) g.moveTo(a[0], a[1]); else g.lineTo(a[0], a[1]);
    g.quadraticCurveTo(px, py, b[0], b[1]);
  }
  g.closePath();
}
function star(g, cx, cy, R, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } g.closePath(); }

// Widget boxes in design space (x, y, w, h) — used for layout, hit-testing and the editor.
export const BOX = { graph: [10, 290, 305, 130], board: [0, 425, 420, 425], keys: [1560, 385, 355, 100], top: [460, 8, 1000, 127], bottom: [560, 1000, 960, 70], hiterror: [800, 965, 320, 110] };
export const WIDGET_NAMES = { top: 'Bandeau et vie', bottom: 'Combo et pp', hiterror: 'Barre d’erreur', board: 'Classement', graph: 'Graphe', keys: 'Touches' };
const BLOCKS = h => { const c = h.cfg; return [['graph', c.showGraph, h.drawGraph, -1, 0, 0], ['board', c.showBoard, h.drawBoard, -1, 0, 80], ['keys', c.showKeys, h.drawKeys, 1, 0, 80], ['top', c.showTop, h.drawTop, 0, -1, 0], ['bottom', c.showBottom, h.drawBottom, 0, 1, 120], ['hiterror', c.showHitError, h.drawHitError, 0, 1, 160]]; };
// screen-space rectangle of a widget after the user layout
export function widgetRect(cfg, key) { const [x, y, w, h] = BOX[key], l = (cfg.layout || {})[key] || {}, s = l.s || 1; const cx = x + w / 2 + (l.dx || 0), cy = y + h / 2 + (l.dy || 0); return [cx - w * s / 2, cy - h * s / 2, w * s, h * s]; }

export class HUD {
  constructor(cfg = {}, assets = {}) {
    this.cfg = { ...defaults, ...cfg }; this.assets = assets; // assets: { avatar, flag }
    this.r = {}; this.s = {}; this.now = 0; this.boardY = new Map();
  }
  roll(key) { return this.r[key] ??= new Roller(); }
  sm(key, ms) { return this.s[key] ??= new Smooth(null, ms); }
  font(w, px, fam = this.cfg.font) { return `${w} ${px}px "${fam}"`; }

  // st: state from Timeline.at() (or the tosu adapter); wallMs: monotonic clock for animations
  draw(g, st, wallMs) {
    const dt = this.last == null ? 16 : clamp(wallMs - this.last, 0, 1000); this.last = wallMs; this.now = wallMs;
    const c = this.cfg;
    g.save();
    g.globalAlpha = c.opacity * (c.introFade > 0 ? clamp(wallMs / c.introFade, 0, 1) : 1);
    if (c.scale !== 1) { g.translate(W / 2, H / 2); g.scale(c.scale, c.scale); g.translate(-W / 2, -H / 2); }
    g.textBaseline = 'alphabetic';
    const base = g.globalAlpha;
    // Each block is a widget: entrance animation + user layout (offset/scale around its own centre).
    const intro = c.hudIntro > 0 && st.since != null ? st.since : Infinity, L = c.layout || {};
    for (const [key, on, fn, dx, dy, delay] of BLOCKS(this)) {
      const lay = L[key] || {}; if (!on || lay.show === false) continue;
      const p = intro === Infinity ? 1 : ease((intro - delay) / c.hudIntro); if (p <= 0) continue;
      const [bx, by, bw, bh] = BOX[key], ox = bx + bw / 2, oy = by + bh / 2, sc = lay.s || 1;
      g.save(); g.globalAlpha = base * p * (lay.o ?? 1);
      g.translate((lay.dx || 0) + dx * (1 - p) * 120, (lay.dy || 0) + dy * (1 - p) * 90);
      if (sc !== 1) { g.translate(ox, oy); g.scale(sc, sc); g.translate(-ox, -oy); }
      fn.call(this, g, st, dt, base * p); g.restore();
    }
    g.restore();
  }

  drawTop(g, st, dt) {
    const c = this.cfg;
    // Each wing is drawn from the avatar outward, so the health fill drains from the outer ends.
    const wing = (side) => {
      const X = x => side < 0 ? x : 1920 - x;
      g.beginPath();
      if (c.tubeShape === 'straight') { g.moveTo(X(920), 52); g.lineTo(X(477), 52); }
      else { g.moveTo(X(920), 70); g.lineTo(X(871), 70); g.bezierCurveTo(X(824), 70, X(822), 29, X(775), 29); g.lineTo(X(477), 29); }
    };
    const WING = c.tubeShape === 'straight' ? 443 : 457; // path length of one wing
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of [-1, 1]) { wing(s); g.strokeStyle = c.tubeColor; g.lineWidth = 16; g.stroke(); }
    for (const s of [-1, 1]) { wing(s); g.strokeStyle = c.hpEmpty; g.lineWidth = 7.5; g.stroke(); }
    const hp = clamp(this.sm('hp', 110).to(st.hp ?? 1, dt), 0, 1);
    if (hp > 0.002) {
      const low = c.hpLowWarn ? clamp((0.3 - hp) / 0.3, 0, 1) : 0;
      const pulse = low > 0 ? 0.5 + 0.5 * Math.sin(this.now / 140) : 0;
      g.setLineDash([WING * hp, 4000]);
      for (const s of [-1, 1]) { wing(s); g.strokeStyle = low ? mix(c.hpColor, c.hpLow, low * (0.6 + 0.4 * pulse)) : c.hpColor; g.lineWidth = 7.5; g.stroke(); }
      g.setLineDash([]);
    }
    g.save(); rr(g, 922, 14, 77, 76, 7); g.clip();
    if (this.assets.avatar) g.drawImage(this.assets.avatar, 922, 14, 77, 76);
    else { const gr = g.createLinearGradient(922, 14, 999, 90); gr.addColorStop(0, '#9aa0aa'); gr.addColorStop(1, '#3a3e46'); g.fillStyle = gr; g.fillRect(922, 14, 77, 76); }
    g.restore();
    rr(g, 922, 14, 77, 76, 7); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5; g.stroke();

    g.fillStyle = '#d9d9de'; g.lineJoin = 'round'; g.lineWidth = 2; g.strokeStyle = '#d9d9de'; star(g, 490, 63, 9.4, 4.3); g.fill(); g.stroke();
    g.fillStyle = c.textColor; g.font = this.font(700, 24);
    this.roll('stars').draw(g, trimFix(st.stars, 1), 503, 71, 'left', this.now, 24, c.rollDigits);
    g.textAlign = 'left'; g.fillText(`${Math.round(st.bpm)}bpm`, 693, 71);
    this.roll('score').draw(g, group(st.score), 1137, 71, 'left', this.now, 24, c.rollDigits);
    this.roll('acc').draw(g, `${trimFix(st.acc, 2)}%`, 1407, 71, 'right', this.now, 24, c.rollDigits);
    const gl = gradeLetter(st.grade);
    g.fillStyle = GRADE_COLORS[gl] || '#fff'; g.textAlign = 'left'; g.fillText(gl, 1423, 71.5);
    g.fillStyle = c.textColor; g.textAlign = 'center'; g.fillText(st.player || '', 959.5, 123);
    g.font = this.font(700, 22);
    const cr = c.countryRank || st.countryRank, gr = c.globalRank || st.globalRank;
    if (cr) { g.textAlign = 'right'; g.fillText(`#${String(cr).replace(/^#/, '')}`, 872, 43); }
    if (c.showFlag && this.assets.flag) { g.save(); rr(g, 884, 28, 27, 19, 3); g.clip(); g.drawImage(this.assets.flag, 884, 28, 27, 19); g.restore(); }
    if (gr) {
      g.beginPath(); g.arc(1019.5, 37, 9.3, 0, Math.PI * 2); g.strokeStyle = c.textColor; g.lineWidth = 2.2; g.stroke();
      g.beginPath(); g.arc(1019.5, 37, 5.2, 0, Math.PI * 2); g.fill();
      g.textAlign = 'left'; g.fillText(`#${String(gr).replace(/^#/, '')}`, 1036, 44);
    }
  }

  panel(g, x, w, slant) {
    const y = 1011, h = 52;
    g.save();
    g.shadowColor = 'rgba(150,152,165,.32)'; g.shadowBlur = 22;
    const shape = () => this.cfg.panelShape === 'round' ? rr(g, x + slant / 2, y, w, h, h / 2) : slanted(g, x, y, w, h, slant, 7);
    g.shadowBlur = 22 * (this.cfg.glow ?? 1); shape(); g.fillStyle = this.cfg.panelColor; g.fill();
    g.restore();
    g.save(); shape(); g.clip();
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x - 30, y, w + 60, 5);
    g.fillStyle = 'rgba(0,0,0,.36)'; g.fillRect(x - 30, y + h - 5, w + 60, 5);
    g.restore();
  }

  drawBottom(g, st, dt) {
    const c = this.cfg; g.font = this.font(700, 30);
    const combo = st.combo < st.maxCombo ? `${group(st.combo)} / ${group(st.maxCombo)}x` : `${group(st.combo)}x`;
    const pp = `${group(st.pp)} / ${Math.round(st.fc)}pp`;
    const cw = this.sm('cw', 90).to(g.measureText(combo).width, dt), pw = this.sm('pw', 90).to(g.measureText(pp).width, dt);
    const cR = 781, cL = 762 - cw - 11;          // combo: text right edge 762, "/" slant (mid-edge x)
    this.panel(g, cL - 9.5, cR - cL, 19);
    const pL = 1140, pR = 1158 + pw + 11;        // pp: text left edge 1158, "\" slant
    this.panel(g, pL + 9.5, pR - pL, -19);
    g.fillStyle = c.textColor;
    this.roll('combo').draw(g, combo, 762, 1047, 'right', this.now, 30, c.rollDigits);
    this.roll('pp').draw(g, pp, 1158, 1047, 'left', this.now, 30, c.rollDigits);
    if (c.showExtra && c.extraMode !== 'off') {
      const v = c.extraMode === 'ss' ? st.pp - st.ss : st.pp - st.fc, x = pR + 40;
      g.textAlign = 'left'; g.font = this.font(800, 20); g.fillStyle = Math.round(v) < 0 ? '#ff6b6b' : '#7dffa0';
      g.fillText(Math.round(v) === 0 ? '0' : `${v > 0 ? '+' : '-'}${group(Math.abs(v))}pp`, x, 1031);
      g.font = this.font(700, 15); g.fillStyle = c.textColor; g.fillText(c.extraLabel, x, 1046);
    }
  }

  drawHitError(g, st, dt, base) {
    const c = this.cfg, cx = 960, half = 150, y = 1039, h = 11;
    const w50 = st.hit50 || 100, k = half / w50, b100 = (st.hit100 || 60) * k, b300 = (st.hit300 || 20) * k;
    g.save(); rr(g, cx - half, y, half * 2, h, h / 2); g.clip();
    g.fillStyle = c.c50; g.fillRect(cx - half, y, half * 2, h);
    g.fillStyle = c.c100; g.fillRect(cx - b100, y, b100 * 2, h);
    g.fillStyle = c.c300; g.fillRect(cx - b300, y, b300 * 2, h);
    g.restore();
    for (const e of st.errors) {
      const age = st.t - e.t; if (age < 0 || age > 4000) continue;
      const abs = Math.abs(e.e), col = abs <= st.hit300 ? '#b9e6ff' : abs <= st.hit100 ? '#b8ffcc' : '#ffe9a0';
      g.globalAlpha = base * 0.75 * Math.pow(1 - age / 4000, 1.6); g.fillStyle = col;
      g.fillRect(cx + clamp(e.e * k, -half, half) - 1.5, y - 5, 3, h + 10);
    }
    g.globalAlpha = base;
    const ax = cx + clamp(this.sm('avg', 180).to(st.avgError * k, dt), -half, half);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(ax, 1057); g.lineTo(ax + 8.5, 1072); g.lineTo(ax - 8.5, 1072); g.closePath(); g.fill();
    const slot = (x, label, value, color, big = false) => {
      if (!big) { g.fillStyle = 'rgba(255,255,255,.035)'; rr(g, x - 28, 996, 56, 28, 5); g.fill(); }
      g.textAlign = 'center'; g.font = this.font(700, 15); g.fillStyle = color; g.fillText(label, x, 988.5);
      g.font = this.font(800, big ? 33 : 27); g.fillStyle = big ? '#ffffff' : color;
      this.roll('slot' + label).draw(g, String(Math.round(value)), x, 1019.5, 'center', this.now, big ? 33 : 27, c.rollDigits);
    };
    slot(960, 'UR', st.ur, '#ffffff', true);
    if (st.nsb) slot(840, 'SB', st.nsb, '#d8d8dc');
    if (st.n50) slot(900, 'Meh', st.n50, '#ffd84b');
    if (st.n100) slot(1020, 'Ok', st.n100, '#8fe39a');
    if (st.nmiss) slot(1080, 'Miss', st.nmiss, '#ff6b6b');
  }

  drawGraph(g, st) {
    const x0 = 15, x1 = 308, base = 380, top = 300, span = st.end || 1;
    const X = t => x0 + clamp(t / span, 0, 1) * (x1 - x0);
    const S = st.strains || {}; const max = Math.max(1e-9, ...(S.aim || [0]), ...(S.speed || [0]));
    const cut = X(st.t);
    const area = (arr, played, col) => {
      if (!arr?.length) return;
      g.save(); g.beginPath(); if (played) g.rect(x0, top - 40, cut - x0, 140); else g.rect(cut, top - 40, x1 - cut + 2, 140); g.clip();
      g.beginPath(); g.moveTo(X(S.start), base);
      arr.forEach((v, i) => g.lineTo(X(S.start + (i + 0.5) * S.section), base - (v / max) * (base - top)));
      g.lineTo(X(S.start + arr.length * S.section), base); g.closePath(); g.fillStyle = col; g.fill(); g.restore();
    };
    area(S.aim, false, '#252527'); area(S.speed, false, 'rgba(18,18,20,.85)');
    area(S.aim, true, '#76757c'); area(S.speed, true, 'rgba(48,48,53,.82)');
    g.fillStyle = 'rgba(16,40,22,.92)'; g.fillRect(x0, 396, x1 - x0, 10);
    g.fillStyle = '#242424'; g.fillRect(x0, 406, x1 - x0, 10);
    for (const ev of st.events || []) {
      if (ev.t > st.t) break;
      const x = X(ev.t);
      if (ev.r === '100') { g.fillStyle = 'rgba(110,235,140,.85)'; g.fillRect(x - 1.5, 397, 3, 9); }
      else if (ev.r === '50') { g.fillStyle = '#ffd84b'; g.fillRect(x - 1.5, 397, 3, 9); }
      else if (ev.r === 'miss') { g.fillStyle = '#ff5b5b'; g.fillRect(x - 1.5, 396, 3, 20); }
      else if (ev.r === 'sb') { g.fillStyle = '#e6e6e6'; g.fillRect(x - 1.5, 403, 3, 13); }
    }
    g.fillStyle = 'rgba(200,200,200,.75)'; g.fillRect(cut - 1, 406, 2, 10);
  }

  drawBoard(g, st, dt, base) {
    const c = this.cfg, rows = c.boardRows, pitch = 48, top0 = 436;
    const list = st.board; if (!list?.length) return;
    const pi = list.findIndex(e => e.player), n = list.length;
    const wantStart = this.sm('bstart', 160).to(clamp(pi - 3, 0, Math.max(0, n - rows)), dt);
    g.save(); g.beginPath(); g.rect(0, top0 - 6, 420, rows * pitch + 4); g.clip();
    for (let i = 0; i < n; i++) {
      const e = list[i];
      let yRow = this.boardY.get(e.key); if (!yRow) this.boardY.set(e.key, yRow = new Smooth(null, 170));
      const y = top0 + (yRow.to(i, dt) - wantStart) * pitch;
      if (y < top0 - pitch || y > top0 + rows * pitch) continue;
      g.globalAlpha = base * (e.player ? 1 : c.boardOpacity);
      if (e.player) { g.fillStyle = '#e8e8ea'; rr(g, 10, y + 7, 5.5, 25, 3); g.fill(); }
      g.font = this.font(400, 17, c.boardFont); g.textAlign = 'center';
      g.fillStyle = i === 0 ? '#e9c46a' : i === 1 ? '#c9ced6' : i === 2 ? '#d49a6a' : '#b4b4b8';
      g.fillText(String(i + 1), 28, y + 23);
      g.save(); rr(g, 43.5, y + 3, 30, 31, 5); g.clip();
      if (e.avatarImg) g.drawImage(e.avatarImg, 43.5, y + 3, 30, 31); else { g.fillStyle = '#3a3d44'; g.fillRect(43.5, y + 3, 30, 31); }
      g.restore();
      const gl = gradeLetter(e.grade);
      g.font = this.font(800, 16, c.font); g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.5)'; g.strokeText(gl, 66, y + 31);
      g.fillStyle = GRADE_COLORS[gl] || '#fff'; g.fillText(gl, 66, y + 31);
      g.textAlign = 'left'; g.font = this.font(e.player ? 700 : 400, 18, c.boardFont); g.fillStyle = c.textColor;
      g.fillText(e.name, 83, y + 16);
      g.font = this.font(400, 15, c.boardFont); g.fillStyle = '#a3a3a8';
      g.fillText(shortScore(e.score), 83, y + 34);
      g.textAlign = 'right'; g.fillText(`${group(e.combo)}x`, 221, y + 34);
      if (e.misses) { g.textAlign = 'left'; g.fillStyle = '#ff5c5c'; g.fillText(String(e.misses), 225, y + 34); }
      g.textAlign = 'right'; g.fillStyle = '#a3a3a8'; g.fillText(`${(+e.acc).toFixed(2)}%`, 300, y + 34);
      g.font = this.font(700, 21, c.boardFont); g.fillStyle = c.textColor;
      g.fillText(e.pp == null ? '—' : `${group(e.pp)}pp`, 300, y + 20);
      let mx = 315;
      for (const m of (e.mods || []).filter(m => m !== 'CL' && m !== 'LZ').slice(0, 4)) {
        g.fillStyle = MOD_COLORS[m] || '#8890a0'; rr(g, mx, y + 10, 16, 16, 3.5); g.fill();
        g.font = this.font(800, 8, c.font); g.fillStyle = 'rgba(0,0,0,.75)'; g.textAlign = 'center'; g.fillText(m, mx + 8, y + 21);
        mx += 17;
      }
    }
    g.restore();
    g.globalAlpha = base;
    g.font = `italic 700 15px "${c.boardFont}"`; g.fillStyle = '#b9b9bd'; g.textAlign = 'center';
    g.fillText(`Sorted by ${c.boardSort}`, 162, top0 + Math.min(rows, n) * pitch + 14);
  }

  drawKeys(g, st) {
    const c = this.cfg, xr = 1854, span = 280;
    for (const [k, y] of [['k1', 393], ['k2', 441]]) {
      const key = st.keys?.[k]; if (!key) continue;
      for (const [a, b] of key.presses) {
        const xs = xr - (st.t - a) * c.keySpeed, xe = b == null ? xr : xr - (st.t - b) * c.keySpeed;
        if (xe < xr - span) continue;
        const l = Math.max(xs, xr - span), w = Math.max(6, xe - l), fade = clamp((l - (xr - span)) / (span * 0.75), 0, 1);
        g.fillStyle = rgba(c.keyColor, 0.42 * fade + 0.08); rr(g, l, y, w, 36, 7); g.fill();
      }
      g.fillStyle = key.down ? c.textColor : '#5b5b62'; rr(g, 1861, y + 4, 7, 29, 3.5); g.fill();
      g.fillStyle = c.textColor; g.textAlign = 'right';
      g.font = this.font(700, 19); const bw = g.measureText('bpm').width; g.fillText('bpm', 1844, y + 27);
      g.font = this.font(700, 29); g.fillText(String(Math.round(key.bpm)), 1844 - bw - 1, y + 27);
      g.textAlign = 'center'; g.font = this.font(700, 20); g.fillText(String(key.count), 1893, y + 21);
      g.font = this.font(700, 17); g.fillStyle = '#a9a9ae'; g.fillText(k, 1893, y + 37);
    }
  }
}

// ---------------------------------------------------------------------------
// Timeline: the HUD state at any map time, from a danser HUD export.
export class Timeline {
  constructor(data, extra = {}) {
    this.d = data; this.extra = extra; const m = data.meta;
    this.hits = data.hits || [];
    this.errs = this.hits.filter(h => h.e != null).map(h => ({ t: h.t, e: h.e }));
    this.events = this.hits.filter(h => ['100', '50', 'miss', 'sb'].includes(h.r)).map(h => ({ t: h.t, r: h.r }));
    this.bpm = (data.bpm || []).filter(p => p[1] > 0);
    this.lanes = { k1: [], k2: [] }; let prev = 0;        // k1 = K1|M1, k2 = K2|M2
    for (const [t, mask] of data.keys || []) {
      for (const [k, bits] of [['k1', 1 | 4], ['k2', 2 | 8]]) {
        const was = !!(prev & bits), is = !!(mask & bits);
        if (is && !was) this.lanes[k].push([t, null]);
        if (!is && was && this.lanes[k].length) this.lanes[k].at(-1)[1] = t;
      }
      prev = mask;
    }
    this.strains = { aim: data.strains?.Aim || [], speed: data.strains?.Speed || [], start: m.start, section: 400 * (m.rate || 1) };
    // leaderboard customisation: hidden players, hand-added entries, size limit
    const bc = extra.board || {}, hide = new Set((bc.exclude || []).map(n => String(n).toLowerCase()));
    const custom = (bc.custom || []).filter(c => c.name).map((c, i) => ({ name: c.name, score: +c.score || 0, combo: +c.combo || 0, acc: +c.acc || 0, pp: c.pp === '' || c.pp == null ? null : +c.pp, rank: c.rank || 'S', misses: +c.misses || 0, mods: modList(c.mods || ''), avatar: c.avatar, key: 'c' + i }));
    this.board = sortBoard([...(data.board || []).filter(b => !hide.has(String(b.name).toLowerCase())), ...custom], 'pp').slice(0, Math.max(1, (bc.limit || 50)))
      .map((b, i) => ({ ...b, key: b.key || 'b' + i, grade: b.rank || 'A', avatarImg: extra.avatars?.get(b.avatar) }));
  }
  // health at map time t: from the per-frame log when present, else from the hits (demo data)
  hpAt(t) {
    const F = this.d.frames, HP = this.d.hp;
    if (F?.length && HP?.length) { const i = Timeline.idx(F, t, x => x); return HP[clamp(i, 0, HP.length - 1)]; }
    const h = this.hits[Timeline.idx(this.hits, t)]; return h?.hp ?? 1;
  }
  // summary of the whole play, for the results scene
  summary() {
    const m = this.d.meta, last = this.hits.at(-1) || {}, errs = this.errs.map(e => e.e);
    const mean = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length);
    const early = errs.filter(e => e < 0), late = errs.filter(e => e >= 0), avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const me = { player: true, pp: last.pp || 0, score: last.s || 0 };
    const board = sortBoard([...this.board, me], 'pp'), rank = board.indexOf(me) + 1;
    return {
      meta: m, score: last.s || 0, acc: last.a ?? 100, grade: last.g || 'X', maxCombo: last.mc || 0, pp: last.pp || 0, fc: last.fc || m.maxPP,
      n300: last.n3 || 0, n100: last.n1 || 0, n50: last.n5 || 0, nmiss: last.nm || 0, nsb: last.nsb || 0, ur: last.ur || 0,
      errors: errs, mean, early: avg(early), late: avg(late), hits: this.hits.filter(h => h.px != null).map(h => [h.px, h.py, h.r]),
      rank, of: board.length, board: board.slice(0, 7), playedIso: this.extra.playedIso, strains: this.strains, mods: modList(m.mods), ticks: last.tk, sliderEnd: last.se, maxSliderEnd: last.sem, playedAt: this.extra.playedAt,
    };
  }
  static idx(arr, t, get = x => x.t) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (get(arr[mid]) <= t) lo = mid + 1; else hi = mid; } return lo - 1; }
  at(t, sort = 'pp') {
    const m = this.d.meta, h = this.hits[Timeline.idx(this.hits, t)], rate = m.rate || 1;
    const bl = (this.bpm[Math.max(0, Timeline.idx(this.bpm, t, p => p[0]))] || [0, 500])[1];
    const ei = Timeline.idx(this.errs, t), recent = this.errs.slice(Math.max(0, ei - 29), ei + 1);
    const keys = {};
    for (const k of ['k1', 'k2']) {
      const L = this.lanes[k], j = Timeline.idx(L, t, p => p[0]);
      const last = L.slice(Math.max(0, j - 4), j + 1).map(p => p[0]);
      let bpm = 0;
      if (last.length >= 2 && t - last.at(-1) < 1000) { const iv = (last.at(-1) - last[0]) / (last.length - 1) / rate; bpm = iv > 0 ? 30000 / iv : 0; }
      keys[k] = { presses: L.slice(Math.max(0, j - 12), j + 1).map(([a, b]) => [a, b != null && b <= t ? b : null]), count: j + 1, down: j >= 0 && (L[j][1] == null || L[j][1] > t), bpm };
    }
    const st = {
      t, player: m.player, stars: h ? h.st : 0, bpm: 60000 / bl * rate,
      score: h ? h.s : 0, acc: h ? h.a : 100, grade: h ? h.g : 'X', combo: h ? h.c : 0, maxCombo: h ? h.mc : 0,
      pp: h ? h.pp : 0, fc: h ? h.fc : m.maxPP, ss: h ? h.ss : m.maxPP, ur: h ? h.ur : 0,
      n300: h ? h.n3 : 0, n100: h ? h.n1 : 0, n50: h ? h.n5 : 0, nmiss: h ? h.nm : 0, nsb: h ? h.nsb : 0,
      hit50: m.hit50, hit100: m.hit100, hit300: m.hit300,
      errors: this.errs.slice(Math.max(0, Timeline.idx(this.errs, t - 4000) + 1), ei + 1),
      avgError: recent.length ? recent.reduce((a, e) => a + e.e, 0) / recent.length : 0,
      events: this.events, strains: this.strains, end: m.end, keys,
      countryRank: this.extra.countryRank, globalRank: this.extra.globalRank, hp: this.hpAt(t),
    };
    const me = { key: 'me', name: m.player, player: true, score: st.score, combo: st.maxCombo, acc: st.acc, pp: st.pp, grade: st.grade, misses: st.nmiss, mods: modList(m.mods), avatarImg: this.extra.playerAvatar };
    st.board = sortBoard([...this.board, me], sort);
    return st;
  }
}

// danser écrit les mods puis leurs réglages lazer : « LZCLDAAR10OD8.6S1.38xMR0 ». On retire les réglages (AR/OD/CS/HP n, S n x, MR n)
// avant de couper en paires, sinon « AR10 » devient un faux mod « AR ». LZ (replay lazer) n'est pas un mod affiché.
export const modList = s => (String(s || '').replace(/(AR|OD|CS|HP)\d+(\.\d+)?|S\d+(\.\d+)?x/g, '').replace(/MR\d/g, 'MR').match(/[A-Z]{2}/g) || []).filter(x => x !== 'LZ');
export const sortBoard = (list, sort) => list.sort((a, b) => sort === 'score' ? b.score - a.score : ((b.pp ?? -1) - (a.pp ?? -1)) || (b.score - a.score));
