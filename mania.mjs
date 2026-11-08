// osu!mania côté serveur : lit le .osr (frames LZMA), retrouve la map dans Songs, rejoue les jugements.
// danser ne rend que le mode standard : les replays mania sont dessinés par Dancing! lui-même (web/mania.js).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { lzmaDecode } from './lzma.mjs';
import { maniaAcc, maniaGrade } from './web/mania.js';

const MODS = [[0, 'NF'], [1, 'EZ'], [3, 'HD'], [4, 'HR'], [5, 'SD'], [9, 'NC'], [6, 'DT'], [8, 'HT'], [10, 'FL'], [20, 'FI'], [30, 'MR'], [14, 'PF']];

export function readOsrFull(buf) {
  let o = 0;
  const b = () => buf[o++], u16 = () => { const v = buf.readUInt16LE(o); o += 2; return v; }, i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
  const str = () => { if (b() !== 0x0b) return ''; let len = 0, sh = 0, x; do { x = b(); len |= (x & 127) << sh; sh += 7; } while (x & 128); const v = buf.toString('utf8', o, o + len); o += len; return v; };
  const mode = b(); i32(); const md5 = str(), player = str(); str();
  const n300 = u16(), n100 = u16(), n50 = u16(), geki = u16(), katu = u16(), miss = u16(), score = i32(), combo = u16(); b();
  const modBits = i32(); str();
  const ticks = buf.readBigInt64LE(o); o += 8;
  const len = i32(), data = buf.subarray(o, o + len);
  const mods = []; for (const [bit, n] of MODS) if (modBits & (1 << bit)) { if (n === 'DT' && mods.includes('NC')) continue; if (n === 'SD' && modBits & (1 << 14)) continue; mods.push(n); }
  return { mode, md5, player, score, combo, modBits, mods, counts: { max: geki, n300, n200: katu, n100, n50, miss }, date: new Date(Number((ticks - 621355968000000000n) / 10000n)), data };
}

// Frames : "w|x|y|z," ; w = écart en ms, x = touches enfoncées (bit i = colonne i). Renvoie [[t, touches]].
export function replayFrames(data) {
  let t = 0; const out = [];
  for (const s of lzmaDecode(data).toString('latin1').split(',')) {
    const [w, x] = s.split('|'); if (x === undefined || w === '-12345') continue;
    t += Number(w); out.push([t, Math.round(Number(x)) | 0]);
  }
  return out;
}

export function parseOsu(text) {
  const m = { notes: [], keys: 4, od: 5, bpm: 0 }; let sec = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('//')) continue;
    if (line[0] === '[') { sec = line.slice(1, -1); continue; }
    if (sec === 'HitObjects') {
      const p = line.split(','), x = +p[0], t = +p[2], type = +p[3];
      const col = Math.max(0, Math.min(m.keys - 1, Math.floor(x * m.keys / 512)));
      m.notes.push([t, col, type & 128 ? parseInt(p[5]) || 0 : 0]);
    } else if (sec === 'TimingPoints') {
      const p = line.split(','); if (!m.bpm && +p[1] > 0 && (p[6] === undefined || p[6] === '1')) m.bpm = Math.round(60000 / +p[1]);
    } else if (sec === 'Events') {
      const ev = line.match(/^0\s*,\s*0\s*,\s*"([^"]+)"/); if (ev && !m.bg) m.bg = ev[1];
    } else {
      const kv = line.match(/^(\w+)\s*:\s*(.*)$/); if (!kv) continue;
      const [, k, v] = kv;
      if (k === 'CircleSize' && sec === 'Difficulty') m.keys = Math.max(1, Math.min(18, Math.round(+v)));
      else if (k === 'OverallDifficulty') m.od = +v;
      else if (k === 'Mode') m.mode = +v;
      else if (['AudioFilename', 'Title', 'Artist', 'Version', 'Creator', 'PreviewTime'].includes(k)) m[k[0].toLowerCase() + k.slice(1)] = v;
    }
  }
  m.notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return m;
}

// Index md5 → .osu des maps mania de Songs, mis en cache (le premier passage lit l'en-tête de chaque .osu).
export async function findManiaMap(md5, songs, cacheFile) {
  let idx = {}; try { idx = JSON.parse(await fsp.readFile(cacheFile, 'utf8')); } catch { }
  for (const [rel, v] of Object.entries(idx)) if (v[2] === md5 && fs.existsSync(path.join(songs, rel))) return path.join(songs, rel);
  let found = null, dirty = false;
  let dirs = []; try { dirs = await fsp.readdir(songs, { withFileTypes: true }); } catch { throw Error('Dossier Songs introuvable : ' + songs); }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    let files = []; try { files = await fsp.readdir(path.join(songs, d.name)); } catch { continue; }
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.osu')) continue;
      const rel = path.join(d.name, f), full = path.join(songs, rel);
      let st; try { st = await fsp.stat(full); } catch { continue; }
      const c = idx[rel];
      if (c && c[0] === st.mtimeMs && c[1] === st.size) { if (c[2] === md5) found = full; continue; }
      const buf = await fsp.readFile(full); dirty = true;
      const mania = /^Mode\s*:\s*3/m.test(buf.toString('utf8', 0, 4096));
      const hash = mania ? createHash('md5').update(buf).digest('hex') : 0;
      idx[rel] = [st.mtimeMs, st.size, hash];
      if (hash === md5) found = full;
    }
  }
  if (dirty) await fsp.writeFile(cacheFile, JSON.stringify(idx)).catch(() => {});
  return found;
}

// Fenêtres de jugement d'osu!stable (ms, ±) : [miss, meh, ok, good, great, perfect].
export function hitWindows(od, mods) {
  const k = mods.includes('HR') ? 1 / 1.4 : mods.includes('EZ') ? 1.4 : 1;
  return [188 - 3 * od, 151 - 3 * od, 127 - 3 * od, 97 - 3 * od, 64 - 3 * od, 16].map(w => w * k);
}

// Rejoue le replay sur la map. ponytail: règles des notes longues simplifiées (tête + queue jugées séparément,
// relâcher après la fin compte comme parfait) ; les compteurs live peuvent différer de quelques unités du .osr,
// l'écran de résultats utilise les vrais chiffres du .osr.
export function simulate(map, frames, mods) {
  const keys = map.keys, win = hitWindows(map.od, mods), mirror = mods.includes('MR');
  const judge = off => { const a = Math.abs(off); for (let r = 5; r >= 1; r--) if (a <= win[r]) return r; return 0; };
  const events = Array.from({ length: keys }, () => []), press = [];
  let prev = 0;
  const down = new Array(keys).fill(null);
  for (const [t, x] of frames) {
    for (let c = 0; c < keys; c++) {
      const col = mirror ? keys - 1 - c : c, on = (x >> c) & 1, was = (prev >> c) & 1;
      if (on && !was) { events[col].push([t, 1]); down[col] = t; }
      if (!on && was) { events[col].push([t, 0]); press.push([col, down[col], t]); down[col] = null; }
    }
    prev = x;
  }
  const lastT = frames.length ? frames[frames.length - 1][0] : 0;
  down.forEach((d, col) => { if (d !== null) { press.push([col, d, lastT]); events[col].push([lastT, 0]); } });
  const notes = map.notes.map(([t, col, end]) => [t, col, end, null, null, null, null]);
  const judg = [];
  for (let col = 0; col < keys; col++) {
    const list = notes.filter(n => n[1] === col);
    let i = 0, holding = null;
    const missUntil = t => { while (i < list.length && list[i][0] + win[0] < t) { const n = list[i++]; n[5] = 0; judg.push([n[0] + win[0], 0, null, col]); if (n[2]) { n[6] = 0; judg.push([n[2], 0, null, col]); } } };
    const tail = (n, rel) => { const off = rel >= n[2] ? 0 : rel - n[2], r = judge(off); n[4] = rel; n[6] = r; judg.push([Math.min(rel, n[2]), r, null, col]); };
    for (const [t, on] of events[col]) {
      if (holding && holding[2] + win[1] < t && on) { tail(holding, holding[2]); holding = null; }
      missUntil(t);
      if (on) {
        const n = list[i];
        if (n && t >= n[0] - win[0]) {
          const off = t - n[0], r = judge(off); i++;
          n[3] = t; n[5] = r; judg.push([t, r, r ? off : null, col]);
          if (n[2]) { if (r) holding = n; else { n[6] = 0; judg.push([n[2], 0, null, col]); } }
        }
      } else if (holding) { tail(holding, t); holding = null; }
    }
    if (holding) tail(holding, Math.max(holding[2], lastT));
    missUntil(Infinity);
  }
  judg.sort((a, b) => a[0] - b[0]);
  return { notes, judg, press: press.sort((a, b) => a[1] - b[1]), windows: win };
}

// Tout ce qu'il faut pour dessiner un replay mania (aperçu et export).
export async function maniaData(osrFile, songs, cacheDir) {
  const osr = readOsrFull(await fsp.readFile(osrFile));
  if (osr.mode !== 3) throw Error("Ce replay n'est pas un replay osu!mania.");
  const file = await findManiaMap(osr.md5, songs, path.join(cacheDir, 'mania-maps.json'));
  if (!file) throw Error('Map introuvable dans Songs. Installe la map (les maps standard converties en mania ne sont pas prises en charge).');
  const map = parseOsu(await fsp.readFile(file, 'utf8'));
  const frames = replayFrames(osr.data), sim = simulate(map, frames, osr.mods);
  const rate = osr.mods.some(m => m === 'DT' || m === 'NC') ? 1.5 : osr.mods.includes('HT') ? 0.75 : 1;
  const c = osr.counts, acc = maniaAcc([c.miss, c.n50, c.n100, c.n200, c.n300, c.max]);
  const first = map.notes[0]?.[0] ?? 0, last = Math.max(...map.notes.map(n => n[2] || n[0]), first);
  const dir = path.dirname(file);
  return {
    meta: { title: map.title || '', artist: map.artist || '', version: map.version || '', creator: map.creator || '', keys: map.keys, od: map.od, bpm: map.bpm,
      player: osr.player, mods: osr.mods, rate, score: osr.score, combo: osr.combo, counts: c, acc, grade: maniaGrade(acc), md5: osr.md5,
      playedAt: osr.date.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      start: first, end: last, windows: sim.windows, dir, bg: map.bg || '', audio: map.audioFilename || '' },
    notes: sim.notes, judg: sim.judg, press: sim.press,
  };
}
