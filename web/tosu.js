// Live adapter: feeds the Replay HUD renderer from tosu's websocket API (v2 + precise).
import { HUD, sortBoard, modList } from './hud.js';

const cfg = await fetch('hud-config.json').then(r => r.json()).catch(() => ({}));
await Promise.all(['600', '700', '800'].map(w => document.fonts.load(`${w} 24px Nunito`))).catch(() => {});
const canvas = document.getElementById('c'), g = canvas.getContext('2d');
const host = location.host || '127.0.0.1:24050';
const assets = {}, hud = new HUD(cfg, assets);
let d = null, precise = null, lastMap = '', lastPlayer = '';
const errors = [], lanes = { k1: [], k2: [] }, counts = { k1: 0, k2: 0 }, down = { k1: false, k2: false };
let seenErrors = 0;

function connect(path, onMsg) {
  const ws = new WebSocket(`ws://${host}${path}`);
  ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch { } };
  ws.onclose = () => setTimeout(() => connect(path, onMsg), 1500);
}
connect('/websocket/v2', m => { d = m; });
connect('/websocket/v2/precise', m => { precise = m; });

const loadImg = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
const flag = cc => cc && /^[A-Z]{2}$/i.test(cc) ? `https://osu.ppy.sh/assets/images/flags/${[...cc.toUpperCase()].map(c => (0x1f1e6 + c.charCodeAt(0) - 65).toString(16)).join('-')}.svg` : null;

function laneUpdate(t) {
  const k = precise?.keys || d?.keys || {};
  for (const [lane, a, b] of [['k1', 'k1', 'm1'], ['k2', 'k2', 'm2']]) {
    const isDown = !!(k[a]?.isPressed || k[b]?.isPressed), L = lanes[lane];
    if (isDown && !down[lane]) L.push([t, null]);
    if (!isDown && down[lane] && L.length) L.at(-1)[1] = t;
    down[lane] = isDown; counts[lane] = (k[a]?.count || 0) + (k[b]?.count || 0);
    while (L.length > 16) L.shift();
  }
}

function state(now) {
  const b = d.beatmap || {}, p = d.play || {}, perf = d.performance || {};
  const t = b.time?.live ?? 0;
  const mapKey = b.checksum || b.title;
  if (mapKey !== lastMap) { lastMap = mapKey; errors.length = 0; seenErrors = 0; lanes.k1 = []; lanes.k2 = []; }
  const he = precise?.hitErrors || p.hitErrorArray || [];
  if (he.length < seenErrors) seenErrors = 0;
  for (let i = seenErrors; i < he.length; i++) errors.push({ t, e: he[i] });
  seenErrors = he.length; while (errors.length > 64) errors.shift();
  laneUpdate(t);
  const keys = {};
  for (const k of ['k1', 'k2']) {
    const L = lanes[k], last = L.slice(-5).map(x => x[0]);
    const iv = last.length >= 2 ? (last.at(-1) - last[0]) / (last.length - 1) : 0;
    keys[k] = { presses: L, count: counts[k], down: down[k], bpm: iv > 0 && t - last.at(-1) < 1000 ? 30000 / iv * 1 : 0 };
  }
  const hits = p.hits || {}, od = b.stats?.od?.converted ?? b.stats?.od?.original ?? 8;
  const rate = p.mods?.rate || (/DT|NC/.test(p.mods?.name || '') ? 1.5 : /HT/.test(p.mods?.name || '') ? 0.75 : 1);
  const series = perf.graph?.series || [], xa = perf.graph?.xaxis || [];
  const pick = n => series.find(s => s.name === n)?.data || [];
  const name = p.playerName || d.profile?.name || '';
  if (name !== lastPlayer) {
    lastPlayer = name;
    const id = d.profile?.id; loadImg(cfg.avatarURL || (id ? `https://a.ppy.sh/${id}` : null)).then(i => assets.avatar = i);
    loadImg(flag(cfg.country || d.profile?.countryCode?.name || d.profile?.countryCode)).then(i => assets.flag = i);
  }
  const recent = errors.slice(-30);
  const st = {
    t, player: name, stars: b.stats?.stars?.live ?? b.stats?.stars?.total ?? 0, bpm: b.stats?.bpm?.realtime ?? b.stats?.bpm?.common ?? 0,
    score: p.score || 0, acc: p.accuracy ?? 100, grade: p.rank?.current || 'X', combo: p.combo?.current || 0, maxCombo: p.combo?.max || 0,
    pp: p.pp?.current || 0, fc: p.pp?.fc || perf.accuracy?.[100] || 0, ss: perf.accuracy?.[100] || 0, ur: p.unstableRate || 0,
    n100: hits['100'] || 0, n50: hits['50'] || 0, nmiss: hits['0'] || 0, nsb: hits.sliderBreaks || 0,
    hit50: (199.5 - 10 * od), hit100: (139.5 - 8 * od), hit300: (79.5 - 6 * od),
    errors, avgError: recent.length ? recent.reduce((a, e) => a + e.e, 0) / recent.length : 0,
    events: [], strains: { aim: pick('aim'), speed: pick('speed'), start: xa[0] || 0, section: xa.length > 1 ? xa[1] - xa[0] : 400 * rate },
    end: b.time?.lastObject || b.time?.mp3Length || 1, keys,
    countryRank: cfg.countryRank || d.profile?.countryRank, globalRank: cfg.globalRank || d.profile?.globalRank,
    hp: (v => v == null ? 1 : v > 100 ? v / 200 : v > 1.5 ? v / 100 : v)(p.healthBar?.normal ?? p.healthBar?.smooth),
  };
  const lb = (d.leaderboard || []).map((e, i) => ({ key: e.isPlayer ? 'me' : 'l' + (e.name || i), name: e.name, player: !!e.isPlayer, score: e.score || 0, combo: e.maxCombo || e.combo?.max || 0, acc: e.accuracy || 0, pp: e.pp ?? null, grade: e.rank || 'A', misses: e.hits?.['0'] || 0, mods: modList(e.mods?.name), avatarImg: e.isPlayer ? assets.avatar : null }));
  if (lb.length && !lb.some(e => e.player)) lb.push({ key: 'me', name, player: true, score: st.score, combo: st.maxCombo, acc: st.acc, pp: st.pp, grade: st.grade, misses: st.nmiss, mods: modList(p.mods?.name), avatarImg: assets.avatar });
  for (const e of lb) if (e.player) Object.assign(e, { score: st.score, combo: st.maxCombo, acc: st.acc, pp: st.pp, grade: st.grade });
  st.board = sortBoard(lb, lb.some(e => !e.player && e.pp != null) ? hud.cfg.boardSort : 'score');
  return st;
}

function frame(now) {
  g.clearRect(0, 0, 1920, 1080);
  const playing = d && (d.state?.name === 'play' || d.state?.name === 'resultScreen' || d.state?.number === 2 || d.state?.number === 7);
  if (playing) hud.draw(g, state(now), now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
