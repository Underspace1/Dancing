// osu!mania dans Dancing! : chronologie d'un replay jugé et dessin du jeu + overlays exclusifs.
// Partagé par l'aperçu (navigateur) et l'export (Node + @napi-rs/canvas). Coordonnées 1920 × 1080.
// Données M (produites par mania.mjs) :
//   meta  : titre, clés, OD, joueur, mods, rate, résultats du .osr…
//   notes : [t, colonne, fin (0 = note simple), appui, relâche, résultat tête, résultat queue]
//   judg  : [t, résultat 0..5, écart ms, colonne]   (0 miss, 1 meh, 2 ok, 3 good, 4 great, 5 perfect)
//   press : [colonne, appui, relâche]

export const JUDGE = [
  { n: 'MISS', c: '#ff5d6a', w: 0 }, { n: 'MEH', c: '#ffd84b', w: 50 }, { n: 'OK', c: '#c39bff', w: 100 },
  { n: 'GOOD', c: '#6fe39a', w: 200 }, { n: 'GREAT', c: '#5ab8ff', w: 300 }, { n: 'PERFECT', c: '#d8f4ff', w: 320 },
];
export const THEMES = {
  colonne: { name: 'Colonne', desc: 'Panneau de stats en verre à droite, fiche de la map à gauche.' },
  arcade: { name: 'Arcade', desc: 'Notes arc-en-ciel, contour néon, gros combo derrière la piste.' },
  epure: { name: 'Épuré', desc: 'La piste et l’essentiel : précision, combo, progression.' },
};
export const maniaDefaults = { theme: 'colonne', accent: '#ff66ab', scroll: 650, lane: 0, dim: 0.85, errorBar: true, keyCounts: true };

const W = 1920, H = 1080;
const idx = (arr, t) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
export const maniaAcc = c => { const n = c[0] + c[1] + c[2] + c[3] + c[4] + c[5]; return n ? (50 * c[1] + 100 * c[2] + 200 * c[3] + 300 * (c[4] + c[5])) / (3 * n) : 100; };
export const maniaGrade = acc => acc >= 100 ? 'SS' : acc > 95 ? 'S' : acc > 90 ? 'A' : acc > 80 ? 'B' : acc > 70 ? 'C' : 'D';

export class ManiaTimeline {
  constructor(M) {
    this.M = M;
    const j = M.judg, n = j.length;
    this.times = j.map(x => x[0]);
    this.cnt = []; this.combo = new Int32Array(n); this.maxc = new Int32Array(n); this.wsum = new Float64Array(n); this.hp = new Float32Array(n);
    this.offN = new Int32Array(n); this.offS = new Float64Array(n); this.offS2 = new Float64Array(n);
    const c = [0, 0, 0, 0, 0, 0]; let combo = 0, maxc = 0, w = 0, hp = 1, on = 0, os = 0, os2 = 0;
    const HP = [-0.08, -0.03, -0.006, 0.004, 0.01, 0.012];
    j.forEach(([, r, off], i) => {
      c[r]++; combo = r ? combo + 1 : 0; maxc = Math.max(maxc, combo); w += JUDGE[r].w; hp = Math.min(1, Math.max(0, hp + HP[r]));
      if (r && off !== null) { on++; os += off; os2 += off * off; }
      this.cnt.push([...c]); this.combo[i] = combo; this.maxc[i] = maxc; this.wsum[i] = w; this.hp[i] = hp; this.offN[i] = on; this.offS[i] = os; this.offS2[i] = os2;
    });
    this.total = w;
    this.cols = Array.from({ length: M.meta.keys }, () => ({ down: [], up: [] }));
    for (const [col, d, u] of M.press) { this.cols[col]?.down.push(d); this.cols[col]?.up.push(u); }
    this.allDown = M.press.map(p => p[1]).sort((a, b) => a - b);
    this.offTimes = []; this.offVals = [];
    for (const [t, r, off] of j) if (r && off !== null) { this.offTimes.push(t); this.offVals.push(off); }
  }
  at(t) {
    const i = idx(this.times, t), M = this.M;
    const counts = i >= 0 ? this.cnt[i] : [0, 0, 0, 0, 0, 0], acc = maniaAcc(counts);
    const on = i >= 0 ? this.offN[i] : 0, mean = on ? this.offS[i] / on : 0;
    const keys = this.cols.map(c => { const k = idx(c.down, t); return { down: k >= 0 && c.up[k] > t, count: k + 1 }; });
    const kps = idx(this.allDown, t) - idx(this.allDown, t - 1000);
    const e = idx(this.offTimes, t), errors = [];
    for (let k = e; k >= 0 && k > e - 40; k--) errors.push({ off: this.offVals[k], age: t - this.offTimes[k] });
    return {
      t, counts, acc, grade: maniaGrade(acc), combo: i >= 0 ? this.combo[i] : 0, maxCombo: i >= 0 ? this.maxc[i] : 0,
      score: this.total ? Math.round((M.meta.score || 1e6) * (i >= 0 ? this.wsum[i] : 0) / this.total) : 0, hp: i >= 0 ? this.hp[i] : 1,
      ur: on > 1 ? Math.sqrt(Math.max(0, this.offS2[i] / on - mean * mean)) * 10 : 0,
      last: i >= 0 ? M.judg[i] : null, keys, kps, errors,
      progress: Math.min(1, Math.max(0, (t - M.meta.start) / Math.max(1, M.meta.end - M.meta.start))),
    };
  }
}

// État au format attendu par l'émulateur tosu (web/tosu-emu.js), pour que les widgets tosu marchent aussi en mania.
export function maniaTosu(st, M) {
  const c = st.counts, keys = {};
  st.keys.forEach((k, i) => { keys['k' + (i + 1)] = k; });
  return {
    st: { t: st.t, hp: st.hp, nmiss: c[0], n50: c[1], n100: c[2] + c[3], n300: c[4] + c[5], nsb: 0, keys, errors: st.errors.map(e => ({ e: e.off })), strains: {}, stars: 0, bpm: M.meta.bpm || 0,
      player: M.meta.player, acc: st.acc, score: st.score, combo: st.combo, maxCombo: st.maxCombo, grade: st.grade, pp: 0, fc: 0, ur: st.ur, board: [] },
    meta: { ...M.meta, mods: M.meta.mods, rate: M.meta.rate, start: M.meta.start, end: M.meta.end, maxCombo: M.notes.length },
  };
}

// ---------------------------------------------------------------- dessin
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
function colColor(theme, k, i, accent) {
  if (theme === 'arcade') return `hsl(${Math.round(i / k * 300 + 190) % 360} 95% 66%)`;
  const mid = (k - 1) / 2;
  if (k % 2 && i === mid) return theme === 'epure' ? accent : '#ffd45e';
  if (theme === 'epure') return '#e9ebf2';
  const d = Math.abs(i - mid), inner = Math.floor(d) % 2 === (k % 2 ? 1 : 0);
  return inner ? accent : '#eef1f8';
}
function glass(g, x, y, w, h, r = 18) {
  g.save(); rr(g, x, y, w, h, r); g.fillStyle = 'rgba(14,14,20,.5)'; g.fill();
  const gr = g.createLinearGradient(x, y, x + w * .6, y + h); gr.addColorStop(0, 'rgba(255,255,255,.14)'); gr.addColorStop(.55, 'rgba(255,255,255,.03)'); gr.addColorStop(1, 'rgba(255,255,255,.06)');
  g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5; g.stroke(); g.restore();
}
const font = (px, w = 800) => `${w} ${px}px Nunito, "Segoe UI", sans-serif`;
const fmtInt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Fond : image de la map assombrie (préparée une fois). make(w, h) crée un canvas.
export function maniaBackdrop(img, dim, make) {
  const c = make(W, H), g = c.getContext('2d');
  g.fillStyle = '#07070a'; g.fillRect(0, 0, W, H);
  if (img) { const s = Math.max(W / img.width, H / img.height); g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); }
  g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, W, H);
  return c;
}

export function drawMania(g, M, tl, t, cfg = {}, assets = {}) {
  cfg = { ...maniaDefaults, ...cfg };
  const th = cfg.theme in THEMES ? cfg.theme : 'colonne', k = M.meta.keys, st = tl.at(t);
  const lw = cfg.lane > 0 ? cfg.lane : Math.min(110, Math.round(640 / k)), sw = lw * k, x0 = Math.round((W - sw) / 2);
  const hitY = th === 'epure' ? 960 : 920, speed = hitY / Math.max(200, cfg.scroll);
  if (assets.backdrop) g.drawImage(assets.backdrop, 0, 0, W, H); else { g.fillStyle = '#07070a'; g.fillRect(0, 0, W, H); }

  if (th === 'arcade' && st.combo >= 3) {
    g.save(); g.font = font(260, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = cfg.accent; g.globalAlpha = .13;
    g.fillText(String(st.combo), W / 2, 470); g.restore();
  }
  // piste
  g.save();
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(.18, th === 'epure' ? 'rgba(0,0,0,.55)' : 'rgba(6,6,10,.86)'); bg.addColorStop(1, 'rgba(6,6,10,.92)');
  g.fillStyle = bg; g.fillRect(x0, 0, sw, H);
  g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 1; i < k; i++) g.fillRect(x0 + i * lw - 1, 0, 2, H);
  if (th === 'arcade') { g.shadowColor = cfg.accent; g.shadowBlur = 24; g.fillStyle = cfg.accent; g.fillRect(x0 - 4, 0, 3, H); g.fillRect(x0 + sw + 1, 0, 3, H); g.shadowBlur = 0; }
  else { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x0 - 2, 0, 2, H); g.fillRect(x0 + sw, 0, 2, H); }
  // faisceaux des touches enfoncées
  st.keys.forEach((key, i) => {
    if (!key.down) return;
    const gr = g.createLinearGradient(0, hitY, 0, hitY - 420); gr.addColorStop(0, colColor(th, k, i, cfg.accent)); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = .22; g.fillStyle = gr; g.fillRect(x0 + i * lw, hitY - 420, lw, 420); g.globalAlpha = 1;
  });
  // notes
  const nh = Math.max(18, Math.round(lw * .28)), pad = Math.max(4, Math.round(lw * .07));
  const from = t - 600, to = t + cfg.scroll + 200;
  for (const n of M.notes) {
    const [nt, col, end, hit, rel, hr] = n, last = end || nt;
    if (last < from) continue;
    if (nt > to) break;
    const c = colColor(th, k, col, cfg.accent), x = x0 + col * lw + pad, w = lw - pad * 2;
    let yHead = hitY - (nt - t) * speed;
    const held = end && hit !== null && hit <= t && t < Math.min(rel ?? Infinity, end);
    const missed = hr === 0;
    if (!end) { if (hit !== null && hit <= t) continue; }
    else {
      if (rel !== null && rel <= t && rel >= end - 30) continue;   // tenue jusqu'au bout : terminée
      if (held) yHead = hitY;
      const yTail = hitY - (end - t) * speed;
      const broken = missed || (rel !== null && rel <= t);
      g.globalAlpha = broken ? .28 : .62; g.fillStyle = c;
      rr(g, x + w * .14, yTail, w * .72, Math.max(0, yHead - yTail), w * .2); g.fill();
      if (held) { g.globalAlpha = .9; g.shadowColor = c; g.shadowBlur = 18; rr(g, x + w * .14, yTail, w * .72, Math.max(0, yHead - yTail), w * .2); g.fill(); g.shadowBlur = 0; }
      g.globalAlpha = broken ? .3 : 1; rr(g, x, yTail - nh * .25, w, nh * .5, nh * .25); g.fill();
    }
    g.globalAlpha = missed ? .3 : 1; g.fillStyle = c;
    rr(g, x, yHead - nh / 2, w, nh, th === 'epure' ? 3 : nh / 2.4); g.fill();
    if (!missed && th !== 'epure') { g.fillStyle = 'rgba(255,255,255,.55)'; rr(g, x + 4, yHead - nh / 2 + 3, w - 8, nh * .28, nh * .14); g.fill(); }
    g.globalAlpha = 1;
  }
  // récepteurs + éclats
  st.keys.forEach((key, i) => {
    const c = colColor(th, k, i, cfg.accent), x = x0 + i * lw + pad, w = lw - pad * 2;
    g.lineWidth = 3; g.strokeStyle = key.down ? c : 'rgba(255,255,255,.28)';
    rr(g, x, hitY - nh / 2, w, nh, th === 'epure' ? 3 : nh / 2.4);
    if (key.down) { g.fillStyle = c; g.globalAlpha = .85; g.shadowColor = c; g.shadowBlur = 26; g.fill(); g.shadowBlur = 0; g.globalAlpha = 1; } else g.stroke();
  });
  for (let q = idx(tl.times, t); q >= 0; q--) {
    const [jt, r, , col] = M.judg[q], age = t - jt;
    if (age > 200) break;
    if (!r || col == null) continue;
    const p = age / 200, c = colColor(th, k, col, cfg.accent);
    g.globalAlpha = (1 - p) * .9; g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 30;
    rr(g, x0 + col * lw + pad - p * 10, hitY - nh / 2 - p * 14, lw - pad * 2 + p * 20, nh + p * 28, nh / 2); g.fill();
    g.shadowBlur = 0; g.globalAlpha = 1;
  }
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x0, hitY + nh / 2 + 6, sw, 2);
  // compteurs de touches
  if (cfg.keyCounts && th !== 'epure') {
    g.font = font(15); g.textAlign = 'center'; g.textBaseline = 'top';
    st.keys.forEach((key, i) => { g.fillStyle = key.down ? '#fff' : 'rgba(255,255,255,.5)'; g.fillText(String(key.count), x0 + i * lw + lw / 2, hitY + nh / 2 + 16); });
  }
  // jugement + combo
  const last = st.last;
  if (last && t - last[0] < 450) {
    const age = (t - last[0]) / 450, J = JUDGE[last[1]], s = age < .12 ? .7 + age / .12 * .42 : 1.12 - Math.min(1, (age - .12) / .2) * .12;
    g.save(); g.translate(W / 2, hitY - 330); g.scale(s, s); g.globalAlpha = age > .7 ? (1 - age) / .3 : 1;
    g.font = font(th === 'arcade' ? 54 : 46, 900); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = J.c; g.shadowBlur = 22; g.fillStyle = J.c; g.fillText(J.n, 0, 0); g.restore();
  }
  if (st.combo >= 3 && th !== 'arcade') {
    g.font = font(th === 'epure' ? 44 : 64, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.92)';
    g.fillText(String(st.combo), W / 2, hitY - 420);
  }
  g.restore();
  // barre d'erreur
  if (cfg.errorBar && th !== 'epure') {
    const w50 = M.meta.windows?.[1] || 150, bw = Math.min(sw + 80, 520), bx = W / 2 - bw / 2, by = H - 46, sc = bw / 2 / w50;
    g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, bx - 8, by - 12, bw + 16, 24, 12); g.fill();
    [[1, '#ffd84b'], [2, '#c39bff'], [3, '#6fe39a'], [4, '#5ab8ff'], [5, '#d8f4ff']].forEach(([ri, c]) => {
      const w = (M.meta.windows?.[ri] || w50 / ri) * sc; g.fillStyle = c; g.globalAlpha = .55; g.fillRect(W / 2 - w, by - 3, w * 2, 6);
    });
    g.globalAlpha = 1;
    for (const e of st.errors) { g.globalAlpha = Math.max(0, 1 - e.age / 4000); g.fillStyle = '#fff'; g.fillRect(W / 2 + Math.max(-w50, Math.min(w50, e.off)) * sc - 1.5, by - 10, 3, 20); }
    g.globalAlpha = 1; g.fillStyle = '#fff'; g.fillRect(W / 2 - 1.5, by - 13, 3, 26);
  }
  if (th === 'colonne') drawColonne(g, M, st, x0, sw, cfg, assets);
  else if (th === 'arcade') drawArcade(g, M, st, x0, sw, cfg);
  else drawEpure(g, M, st, cfg);
}

function judgeRows(g, st, x, y, w, rowH, big) {
  const total = Math.max(1, st.counts.reduce((a, b) => a + b, 0));
  for (let r = 5; r >= 0; r--) {
    const J = JUDGE[r], yy = y + (5 - r) * rowH, v = st.counts[r];
    g.font = font(big ? 17 : 15); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = J.c; g.fillText(J.n, x, yy);
    g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = font(big ? 22 : 18, 900); g.fillText(fmtInt(v), x + w, yy);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, yy + rowH * .36, w, 3);
    g.fillStyle = J.c; g.fillRect(x, yy + rowH * .36, w * v / total, 3);
  }
}

function drawColonne(g, M, st, x0, sw, cfg, assets) {
  const m = M.meta, px = x0 + sw + 48, pw = Math.min(380, W - px - 40);
  if (pw > 220) {
    glass(g, px, 250, pw, 540);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(255,255,255,.6)'; g.font = font(15); g.fillText('PRÉCISION', px + 28, 300);
    g.fillStyle = '#fff'; g.font = font(54, 900); g.fillText(st.acc.toFixed(2) + '%', px + 26, 362);
    g.textAlign = 'right'; g.font = font(44, 900); g.fillStyle = cfg.accent; g.fillText(st.grade, px + pw - 28, 366);
    judgeRows(g, st, px + 28, 420, pw - 56, 46, true);
    g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.6)'; g.font = font(14); g.fillText('UR', px + 28, 726); g.fillText('KPS', px + pw / 2, 726);
    g.fillStyle = '#fff'; g.font = font(26, 900); g.fillText(st.ur.toFixed(1), px + 28, 760); g.fillText(String(st.kps), px + pw / 2, 760);
  }
  const lx = 40, lwid = x0 - 88;
  if (lwid > 240) {
    glass(g, lx, 250, lwid, 300);
    if (assets.cover) { g.save(); rr(g, lx + 24, 274, 120, 120, 14); g.clip(); const s = Math.max(120 / assets.cover.width, 120 / assets.cover.height); g.drawImage(assets.cover, lx + 84 - assets.cover.width * s / 2, 334 - assets.cover.height * s / 2, assets.cover.width * s, assets.cover.height * s); g.restore(); }
    const tx = lx + (assets.cover ? 164 : 28), tw = lwid - (tx - lx) - 24;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    clipText(g, m.title, tx, 310, tw, font(26, 900), '#fff');
    clipText(g, m.artist, tx, 342, tw, font(18, 700), 'rgba(255,255,255,.65)');
    clipText(g, '[' + m.version + ']', tx, 372, tw, font(16, 800), cfg.accent);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = font(15); g.fillText(`${m.keys}K · OD ${m.od}${m.mods.length ? ' · +' + m.mods.join('') : ''}`, lx + 24, 438);
    g.fillStyle = '#fff'; g.font = font(22, 900); g.fillText(m.player, lx + 24, 476);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = font(15); g.fillText('SCORE', lx + 24, 510);
    g.fillStyle = '#fff'; g.font = font(22, 900); g.fillText(fmtInt(st.score), lx + 90, 511);
    g.fillStyle = 'rgba(255,255,255,.1)'; rr(g, lx + 24, 526, lwid - 48, 6, 3); g.fill();
    g.fillStyle = cfg.accent; rr(g, lx + 24, 526, (lwid - 48) * st.progress, 6, 3); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x0, 0, sw, 5); g.fillStyle = cfg.accent; g.fillRect(x0, 0, sw * st.progress, 5);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0 + sw + 8, 0, 4, H);
  g.fillStyle = st.hp > .3 ? 'rgba(255,255,255,.75)' : '#ff5d6a'; g.fillRect(x0 + sw + 8, H * (1 - st.hp), 4, H * st.hp);
}

function drawArcade(g, M, st, x0, sw, cfg) {
  const lx = Math.max(40, x0 - 300);
  JUDGE.slice().reverse().forEach((J, i) => {
    const y = 300 + i * 62, v = st.counts[5 - i];
    g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, lx, y, 240, 48, 24); g.fill();
    g.fillStyle = J.c; rr(g, lx, y, 10, 48, 5); g.fill();
    g.font = font(16); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(J.n, lx + 24, y + 24);
    g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = font(24, 900); g.fillText(fmtInt(v), lx + 222, y + 25);
  });
  const rx = x0 + sw + 60;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = font(84, 900); g.fillStyle = '#fff'; g.shadowColor = cfg.accent; g.shadowBlur = 24; g.fillText(st.acc.toFixed(2) + '%', rx, 400); g.shadowBlur = 0;
  g.font = font(34, 900); g.fillStyle = cfg.accent; g.fillText(fmtInt(st.score), rx, 452);
  g.font = font(20); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(`${st.combo}× · max ${st.maxCombo}× · ${st.kps} kps`, rx, 494);
  g.font = font(18); g.fillText(`${M.meta.title} [${M.meta.version}]`.slice(0, 48), rx, 540);
  g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x0 + sw + 10, 0, 6, H); g.fillStyle = cfg.accent; g.shadowColor = cfg.accent; g.shadowBlur = 16; g.fillRect(x0 + sw + 10, H * (1 - st.progress), 6, H * st.progress); g.shadowBlur = 0;
}

function drawEpure(g, M, st, cfg) {
  g.fillStyle = cfg.accent; g.fillRect(0, 0, W * st.progress, 4);
  g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.font = font(44, 900); g.fillText(st.acc.toFixed(2) + '%', W - 48, 84);
  g.font = font(18); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText(`${M.meta.title} [${M.meta.version}] · ${M.meta.player}`.slice(0, 70), W - 48, 116);
}

function clipText(g, s, x, y, w, f, c) {
  g.font = f; g.fillStyle = c; s = String(s || '');
  if (g.measureText(s).width > w) { while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); s += '…'; }
  g.fillText(s, x, y);
}

// Écran d'intro et de résultats (export) : p = progression 0..1 de la scène.
export function drawManiaIntro(g, M, p, cfg, assets) {
  cfg = { ...maniaDefaults, ...cfg }; const m = M.meta;
  if (assets.backdrop) g.drawImage(assets.backdrop, 0, 0, W, H); else { g.fillStyle = '#07070a'; g.fillRect(0, 0, W, H); }
  const a = Math.min(1, p * 4) * Math.min(1, (1 - p) * 5), y = 470 - (1 - Math.min(1, p * 3)) ** 3 * 40;
  g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = cfg.accent; g.font = font(22); g.fillText(`osu!mania · ${m.keys}K`, W / 2, y - 70);
  g.fillStyle = '#fff'; g.font = font(72, 900); g.fillText(m.title, W / 2, y);
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = font(30, 700); g.fillText(m.artist, W / 2, y + 50);
  g.fillStyle = cfg.accent; g.font = font(26, 800); g.fillText(`[${m.version}]  ·  mappée par ${m.creator}`, W / 2, y + 96);
  g.fillStyle = '#fff'; g.font = font(28, 900); g.fillText(m.player + (m.mods.length ? '  +' + m.mods.join('') : ''), W / 2, y + 190);
  g.globalAlpha = 1;
}
export function drawManiaResults(g, M, p, cfg, assets) {
  cfg = { ...maniaDefaults, ...cfg }; const m = M.meta, c = m.counts;
  if (assets.backdrop) g.drawImage(assets.backdrop, 0, 0, W, H); else { g.fillStyle = '#07070a'; g.fillRect(0, 0, W, H); }
  const e = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3, a = e(p * 4);
  g.globalAlpha = a; glass(g, 360, 170 + (1 - a) * 30, 1200, 740, 28);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  clipText(g, m.title, 420, 250, 900, font(44, 900), '#fff');
  clipText(g, `${m.artist} · [${m.version}]`, 420, 292, 900, font(22, 700), 'rgba(255,255,255,.7)');
  g.fillStyle = cfg.accent; g.font = font(220, 900); g.textAlign = 'center'; g.globalAlpha = e(p * 3 - .3);
  g.fillText(m.grade, 620, 600); g.globalAlpha = a;
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.6)'; g.font = font(18); g.fillText('PRÉCISION', 860, 380); g.fillText('SCORE', 860, 470); g.fillText('COMBO MAX', 1200, 470);
  g.fillStyle = '#fff'; g.font = font(58, 900); g.fillText(m.acc.toFixed(2) + '%', 856, 440);
  g.font = font(40, 900); g.fillText(fmtInt(m.score * e(p * 2)), 856, 520); g.fillText(m.combo + '×', 1196, 520);
  judgeRows(g, { counts: [c.miss, c.n50, c.n100, c.n200, c.n300, c.max] }, 860, 580, 620, 48, true);
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.7)'; g.font = font(22, 800); g.fillText(m.player + (m.mods.length ? '  +' + m.mods.join('') : '') + '  ·  ' + m.playedAt, 420, 860);
  g.globalAlpha = 1;
}
