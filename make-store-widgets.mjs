// Génère les widgets du store inspirés de l'overlay natif (graphique de difficulté, barre d'UR, stats de la map, touches).
// Le gabarit commun (police, verre, nombres qui roulent, démo, connexion tosu) vient de « Dancing! PP Gauge ».
// Usage : node make-store-widgets.mjs   (réécrit store/Dancing! <Nom>/)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const store = path.join(path.dirname(fileURLToPath(import.meta.url)), 'store');
const tpl = fs.readFileSync(path.join(store, 'Dancing! PP Gauge', 'index.html'), 'utf8');
const css = tpl.slice(tpl.indexOf('@font-face'), tpl.indexOf('.stripe'));
let helpers = tpl.slice(tpl.indexOf('<script>') + 8, tpl.indexOf('</script>'));
// Démo plus riche : graphique, erreurs de frappe, stats de la map
helpers = helpers.replace("keys: { k1:", "performance: { graph: { series: [{ name: 'aim', data: G.aim }, { name: 'speed', data: G.speed }], xaxis: G.aim.map((_, i) => i * 4000) } },\n      keys: { k1:")
  .replace("function demo(onData) {", "const G = { aim: Array.from({ length: 57 }, (_, i) => 60 + 40 * Math.sin(i / 5) ** 2 + 30 * Math.random()), speed: Array.from({ length: 57 }, (_, i) => 40 + 50 * Math.cos(i / 7) ** 2 + 20 * Math.random()) }, E = [];\nfunction demo(onData) {")
  .replace("stats: { stars: { total: 7.84 } }", "stats: { stars: { total: 7.84, live: 7.84 }, cs: { converted: 4 }, ar: { converted: 10 }, od: { converted: 10 }, hp: { converted: 5 }, bpm: { realtime: 220 }, hitWindow: { great: 19.5, ok: 59.5, meh: 99.5 } }")
  .replace("play: { pp:", "play: { hitErrorArray: (E.push((Math.random() - .45) * 40), E.splice(0, E.length - 40), E), unstableRate: 70 + 30 * Math.random(), pp:")
  .replace("hits: h,", "hits: { ...h, sliderBreaks: h['0'] ? 1 : 0 },");

const glassCss = (w, h, accent) => `:root { --accent: ${accent}; }\n${css.replace(/260px/g, w + 'px').replace(/96px/g, h + 'px')}`;
const page = (name, w, h, accent, style, body, script, ws = '/websocket/v2') => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Dancing! ${name}</title><style>
${glassCss(w, h, accent)}${style}</style></head>
<body><div class="w">${body}</div>
<script>${helpers}</script><script>${script}
connect('ws://' + host + '${ws}', d => update(d));</script></body></html>
`;
const meta = (name, w, h) => `Usecase: ingame, obs-overlay\nName: ${name}\nVersion: 2.0\nAuthor: Dancing!\nCompatibleWith: tosu\nResolution: ${w}x${h}\nGlass: 14\n`;

const W = {
  // Graphique de difficulté (aim / speed), la partie déjà jouée en plein, le reste estompé
  'Strain Graph': [320, 112, '#8fe39a', `
canvas { position: absolute; left: 12px; top: 10px; }
.leg { position: absolute; left: 14px; bottom: 9px; display: flex; gap: 12px; }
.leg i { display: inline-block; width: 14px; height: 4px; border-radius: 2px; margin-right: 5px; vertical-align: 2px; }
.pct { position: absolute; right: 14px; bottom: 7px; font-size: 13px; }`,
  `<canvas id="c" width="592" height="148" style="width:296px;height:74px"></canvas><div class="leg lbl"><span><i style="background:var(--accent)"></i>aim</span><span><i style="background:#f4f4f6"></i>speed</span></div><div class="pct num" id="pct">0 %</div>`,
  `const c = $('#c'), g = c.getContext('2d'), accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
function area(data, max, col, alpha, upto) {
  const n = data.length; if (n < 2) return; const W = c.width, H = c.height, x = i => i / (n - 1) * W, y = v => H - v / max * (H - 6);
  const shape = () => { g.beginPath(); g.moveTo(0, H); data.forEach((v, i) => g.lineTo(x(i), y(v))); g.lineTo(W, H); g.closePath(); };
  g.save(); g.beginPath(); g.rect(0, 0, upto * W, H); g.clip(); shape(); g.globalAlpha = alpha; g.fillStyle = col; g.fill(); g.restore();
  g.save(); g.beginPath(); g.rect(upto * W, 0, W, H); g.clip(); shape(); g.globalAlpha = .16; g.fillStyle = col; g.fill(); g.restore();
}
function update(d) {
  const s = d.performance?.graph?.series || [], aim = s.find(x => x.name === 'aim')?.data || [], speed = s.find(x => x.name === 'speed')?.data || [];
  const tm = d.beatmap?.time || {}, p = Math.max(0, Math.min(1, ((tm.live || 0) - (tm.firstObject || 0)) / Math.max(1, (tm.lastObject || 1) - (tm.firstObject || 0))));
  const max = Math.max(1, ...aim, ...speed); g.clearRect(0, 0, c.width, c.height);
  area(aim, max, accent, .75, p); area(speed, max, '#f4f4f6', .5, p);
  g.fillStyle = '#fff'; g.fillRect(p * c.width - 1.5, 0, 3, c.height);
  $('#pct').textContent = Math.round(p * 100) + ' %';
}`],

  // Barre d'erreur de frappe : fenêtres 300/100/50, dernières frappes qui s'estompent, moyenne en flèche, UR au-dessus
  'UR Bar': [380, 96, '#66ccff', `
.top { position: absolute; left: 0; right: 0; top: 8px; display: flex; justify-content: center; gap: 34px; text-align: center; }
.top div { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.top .num { font-size: 22px; line-height: 1.1; }
#ur { font-size: 28px; }
canvas { position: absolute; left: 14px; bottom: 10px; }`,
  `<div class="top"><div><span class="lbl">SB</span><span class="num" id="sb">0</span></div><div><span class="lbl">UR</span><span class="num" id="ur">0</span></div><div><span class="lbl" style="color:#88e070">100</span><span class="num" id="ok">0</span></div></div><canvas id="c" width="704" height="44" style="width:352px;height:22px"></canvas>`,
  `const c = $('#c'), g = c.getContext('2d');
function update(d) {
  const hw = d.beatmap?.stats?.hitWindow || {}, w50 = hw.meh || 100, w100 = hw.ok || 60, w300 = hw.great || 20, errs = (d.play?.hitErrorArray || []).slice(-30);
  const W = c.width, H = c.height, mid = W / 2, x = e => mid + Math.max(-1, Math.min(1, e / w50)) * (W / 2 - 4), barY = H - 14;
  g.clearRect(0, 0, W, H);
  [[w50, '#ffcc22'], [w100, '#88e070'], [w300, '#66ccff']].forEach(([w, col]) => { g.fillStyle = col; g.beginPath(); g.roundRect(x(-w), barY, x(w) - x(-w), 8, 4); g.fill(); });
  errs.forEach((e, i) => { g.globalAlpha = .25 + .75 * (i + 1) / errs.length; g.fillStyle = Math.abs(e) <= w300 ? '#bfeaff' : Math.abs(e) <= w100 ? '#c8f5b0' : '#ffe08a'; g.fillRect(x(e) - 2, 2, 4, H - 6); });
  g.globalAlpha = 1; const mean = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x(mean), barY - 2); g.lineTo(x(mean) - 7, barY - 12); g.lineTo(x(mean) + 7, barY - 12); g.closePath(); g.fill();
  roll($('#ur'), d.play?.unstableRate || 0, 0, 8); roll($('#sb'), d.play?.hits?.sliderBreaks || 0); roll($('#ok'), d.play?.hits?.['100'] || 0);
}`],

  // Stats de la map façon écran de fin : CS / AR / OD / HP en barres colorées, étoiles au centre
  'Map Stats': [520, 84, '#f2c060', `
.row { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr 96px 1fr 1fr; align-items: center; padding: 0 16px; gap: 14px; }
.s .bar { height: 7px; border-radius: 4px; background: rgba(255,255,255,.14); overflow: hidden; }
.s .bar i { display: block; height: 100%; width: 3%; border-radius: 4px; transition: width .6s cubic-bezier(.2,.9,.25,1); }
.s .t { display: flex; justify-content: space-between; margin-top: 7px; font-size: 15px; font-weight: 800; }
.s .t span:first-child { color: rgba(255,255,255,.7); }
.sr { text-align: center; }
.sr .ic { width: 30px; height: 30px; margin: 0 auto 2px; border-radius: 50%; background: var(--accent); display: grid; place-items: center; }
.sr .num { font-size: 26px; color: var(--accent); }`,
  `<div class="row"><div class="s"><div class="bar"><i id="bcs" style="background:#e0505a"></i></div><div class="t"><span>CS</span><span class="num" id="cs">0</span></div></div><div class="s"><div class="bar"><i id="bar" style="background:#6fdc5a"></i></div><div class="t"><span>AR</span><span class="num" id="ar">0</span></div></div><div class="sr"><div class="ic"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/></svg></div><span class="num" id="sr">0</span></div><div class="s"><div class="bar"><i id="bod" style="background:#9a6cf0"></i></div><div class="t"><span>OD</span><span class="num" id="od">0</span></div></div><div class="s"><div class="bar"><i id="bhp" style="background:#5a7ff0"></i></div><div class="t"><span>HP</span><span class="num" id="hp">0</span></div></div></div>`,
  `function update(d) {
  const st = d.beatmap?.stats || {};
  for (const k of ['cs', 'ar', 'od', 'hp']) { const v = +(st[k]?.converted ?? st[k]?.original ?? 0); roll($('#' + k), v, 1, 8); $('#b' + k).style.width = Math.max(3, Math.min(100, v * 10)) + '%'; }
  roll($('#sr'), +(st.stars?.live || st.stars?.total || 0), 2, 8);
}`],

  // Touches : nombre de frappes et cadence, barre qui s'allume à chaque appui
  'Key BPM': [240, 96, '#ff7ab6', `
.k { position: absolute; left: 14px; right: 14px; height: 32px; display: grid; grid-template-columns: 34px 1fr 52px; align-items: center; gap: 10px; }
.k b { font-size: 15px; text-align: center; border-radius: 7px; padding: 3px 0; background: rgba(255,255,255,.12); transition: background .08s, color .08s; }
.k.on b { background: var(--accent); color: #1a1a20; }
.k .bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,.12); overflow: hidden; }
.k .bar i { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 4px; transition: width .25s; }
.k .num { font-size: 15px; text-align: right; }`,
  `<div class="k" id="k1" style="top:12px"><b>K1</b><div class="bar"><i></i></div><span class="num">0</span></div><div class="k" id="k2" style="top:52px"><b>K2</b><div class="bar"><i></i></div><span class="num">0</span></div>`,
  `const hist = { k1: [], k2: [] };
function update(d) {
  const now = performance.now();
  for (const k of ['k1', 'k2']) {
    const key = d.keys?.[k] || {}, el = $('#' + k), h = hist[k];
    if (!h.length || key.count !== h.at(-1)[1]) h.push([now, key.count || 0]); while (h.length > 1 && now - h[0][0] > 1500) h.shift();
    const rate = h.length > 1 ? (h.at(-1)[1] - h[0][1]) / Math.max(.25, (now - h[0][0]) / 1000) : 0;
    el.classList.toggle('on', !!key.isPressed); el.querySelector('i').style.width = Math.min(100, rate * 8) + '%';
    el.querySelector('.num').textContent = key.count || 0;
  }
}`, '/websocket/v2/precise'],
};

for (const [name, [w, h, accent, style, body, script, ws]] of Object.entries(W)) {
  const dir = path.join(store, 'Dancing! ' + name); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(name, w, h, accent, style, body, script, ws));
  fs.writeFileSync(path.join(dir, 'metadata.txt'), meta(name, w, h));
  console.log('écrit', dir);
}
