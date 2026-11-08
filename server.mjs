// Replay HUD 2 — local server: editor UI + render pipeline (danser record + HUD export -> overlay compositing).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createExtras } from './extras.mjs';
import { captureGameFrames, nativeSnapshot } from './compose.mjs';
import { demoData } from './web/demo-data.js';
import { BUILTIN, dancingPresets } from './web/presets.js';
import { maniaData } from './mania.mjs';
import { DatabaseSync } from 'node:sqlite';
import { clipArgs, drawClipCard } from './clips.mjs';
import { createCanvas } from '@napi-rs/canvas';
import os from 'node:os';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, 'runtime');
const PORT = Number(process.env.PORT || 24070);
const nativeToken = process.env.DANCING_NATIVE_TOKEN;
const token = nativeToken || randomBytes(16).toString('hex');
const dataDir = path.join(root, 'data');
const demo = demoData();
let gamePreview = null;
let nativePreviewSource;
const nativePreviews = new Map();
for (const d of ['data', 'data/replays', 'data/work', 'videos', 'cache']) fs.mkdirSync(path.join(root, d), { recursive: true });
const settingsFile = path.join(dataDir, 'settings.json');

// ---------- settings ----------
const defaultsApp = {
  paths: { tools: path.join(process.env.USERPROFILE || '', 'Desktop', 'tool osu'), output: path.join(root, 'videos') },
  // overrides on top of danser's default.json (same structure); these defaults match the reference video
  danser: { Gameplay: { HpBar: { Show: false }, Mods: { Show: false }, AimErrorMeter: { Show: false }, ScoreBoard: { ModsOnly: false } }, Playfield: { Background: { Dim: { Normal: 0.92 } }, SeizureWarning: { Enabled: false } } },
  hud: {},                          // overlay options (see web/hud.js defaults)
  render: { quickstart: true, overlayFps: 60, finalQuality: 18, keepIntermediate: false, clipStart: 0, clipEnd: 0 },
  preset: 'cpol', tosu: [], board: { exclude: [], custom: [], limit: 50 }, mania: {},
  scenes: { intro: true, introDur: 4.5, outro: true, outroDur: 8, music: true, volume: 0.6 },
};
let app = deepMerge(structuredClone(defaultsApp), readJSON(settingsFile) || {});
const toolsDir = () => fs.existsSync(path.join(runtime, 'danser-hud', 'danser-cli.exe')) ? runtime : app.paths.tools;
const danserDir = () => path.join(toolsDir(), 'danser-hud');
const tosuDir = () => path.join(toolsDir(), 'tosu');
const osuFolders = ['Songs', 'Skins', 'Replays'];
function directoryExists(folder) {
  try { return typeof folder === 'string' && path.isAbsolute(folder) && fs.statSync(folder).isDirectory(); }
  catch { return false; }
}
function detectOsu() {
  const general = readJSON(path.join(danserDir(), 'settings', 'default.json'))?.General || {};
  const roots = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  return Object.fromEntries(osuFolders.map(name => {
    const candidates = [general['Osu' + name + 'Dir'], ...roots.map(root => path.join(root, 'osu!', name))];
    return [name, candidates.find(directoryExists) || ''];
  }));
}
const danserBase = () => {
  const profile = readJSON(path.join(danserDir(), 'settings', 'default.json')) || {};
  if (toolsDir() === runtime && profile.General) {
    for (const folder of ['Songs', 'Skins', 'Replays']) {
      profile.General['Osu' + folder + 'Dir'] ||= path.join(process.env.LOCALAPPDATA || root, 'osu!', folder);
    }
  }
  return profile;
};
const osuDir = name => app.danser?.General?.['Osu' + name + 'Dir'] || danserBase().General?.['Osu' + name + 'Dir'];
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } }
function deepMerge(a, b) { for (const [k, v] of Object.entries(b || {})) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v); else a[k] = structuredClone(v); } return a; }
async function saveApp(settings = app) {
  const tmp = settingsFile + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    await fsp.writeFile(tmp, JSON.stringify(settings, null, 2));
    await fsp.rename(tmp, settingsFile);
  } finally {
    await fsp.rm(tmp, { force: true });
  }
}

// What our overlay replaces: danser must not draw these itself.
function forcedPatch(profile) {
  const hud = app.hud || {};
  return {
    Gameplay: {
      HpBar: { Show: false },                       // the overlay's top tube is the health bar
      ...(app.scenes?.outro ? { ShowResultsScreen: false } : {}),  // our results scene replaces danser's
      Score: { Show: false }, ComboCounter: { Show: false }, PPCounter: { Show: false }, HitCounter: { Show: false },
      HitErrorMeter: { Show: false }, StrainGraph: { Show: false }, KeyOverlay: { Show: false },
      ScoreBoard: { Show: false, HideOthers: hud.showBoard === false, Compact: true },
      Underlay: { Path: '' }, Statistics: [],
    },
    Recording: { Container: 'mp4', OutputDir: path.join(root, 'data', 'work'), ...masterQuality(profile.Recording) },
  };
}
// The danser pass is an intermediate: encode it close to lossless, the final pass applies the chosen quality.
function masterQuality(rec) {
  const e = rec.Encoder, o = {};
  if (rec[e]) {
    const p = { ...rec[e] };
    for (const k of ['CRF', 'CQ', 'Quality']) if (k in p) p[k] = Math.min(p[k], 12);
    if ('RateControl' in p && /cbr|vbr|abr/.test(p.RateControl)) p.RateControl = e.includes('nvenc') ? 'cq' : e.includes('qsv') ? 'icq' : 'crf';
    o[e] = p;
  }
  return o;
}
function buildProfile() {
  const profile = deepMerge(danserBase(), app.danser);
  return deepMerge(profile, forcedPatch(profile));
}

// ---------- replays ----------
function readOsr(buf) {
  let o = 0;
  const b = () => buf[o++], s16 = () => { const v = buf.readUInt16LE(o); o += 2; return v; }, s32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
  const str = () => { if (b() !== 0x0b) return ''; let len = 0, sh = 0, x; do { x = b(); len |= (x & 127) << sh; sh += 7; } while (x & 128); const v = buf.toString('utf8', o, o + len); o += len; return v; };
  const mode = b(), version = s32(), md5 = str(), player = str(); str();
  const n300 = s16(), n100 = s16(), n50 = s16(), geki = s16(), katu = s16(), miss = s16(), score = s32(), combo = s16(); b(); const mods = s32(); str();
  const ticks = buf.readBigInt64LE(o); const date = new Date(Number((ticks - 621355968000000000n) / 10000n));
  const total = n300 + n100 + n50 + miss;
  const mtotal = total + geki + katu, acc = mode === 3 ? (mtotal ? (300 * (n300 + geki) + 200 * katu + 100 * n100 + 50 * n50) / (3 * mtotal) : 0) : total ? (300 * n300 + 100 * n100 + 50 * n50) / (3 * total) : 0;
  // lazer écrit une version « dans 1000 ans » (30000000+) : danser le détecte aussi et simule alors les règles de lazer
  // (notelock, santé, réglages des mods Classic / Difficulty Adjust / vitesse).
  return { mode, md5, player, n300, n100, n50, miss, score, combo, mods: modString(mods), acc, date: date.toISOString(), lazer: version >= 30000000 };
}
const MODS = [[0, 'NF'], [1, 'EZ'], [3, 'HD'], [4, 'HR'], [5, 'SD'], [9, 'NC'], [6, 'DT'], [7, 'RX'], [8, 'HT'], [10, 'FL'], [12, 'SO'], [13, 'AP'], [14, 'PF']];
function modString(m) { const out = []; for (const [bit, n] of MODS) if (m & (1 << bit)) { if (n === 'DT' && out.includes('NC')) continue; if (n === 'SD' && m & (1 << 14)) continue; out.push(n); } return out; }
// stable : « Joueur - Artiste - Titre [Diff] (2026-07-04) Osu.osr » ; lazer : « Joueur playing Artiste - Titre (Mappeur) [Diff] (2026-07-04_23-13).osr »
function titleFromName(name) {
  const lz = name.match(/^.+? playing (.+) \([^()]*\) \[(.+)\] \(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\)/);
  if (lz) return { song: lz[1], diff: lz[2] };
  const m = name.match(/^(.+?) - (.+) \[(.+)\] \(\d{4}-\d{2}-\d{2}\)/); return m ? { song: m[2], diff: m[3] } : { song: name.replace(/\.osr$/i, ''), diff: '' };
}
// Le replay vise une version de la map qui n'est plus dans Songs (map mise à jour par son mappeur) : danser cherche par md5 et abandonne.
// On retrouve la version installée par « Artiste - Titre [Diff] » (nom du fichier .osr) dans danser.db, la plus récente si plusieurs.
function updatedMapMd5(dbFile, replayName) {
  const { song, diff } = titleFromName(replayName); if (!diff) return null;
  const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const want = norm(song + diff);
  try {
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try { return db.prepare('SELECT artist, title, version, md5, dir, file FROM beatmaps WHERE mode = 0 ORDER BY lastModified DESC').all().find(r => norm(`${r.artist} - ${r.title}${r.version}`) === want) || null; }
    finally { db.close(); }
  } catch { return null; }
}
// Replays exportés par osu! lazer : %APPDATA%\osu\exports, ou le dossier choisi dans lazer (storage.ini, FullPath = …).
function lazerExports() {
  const base = path.join(process.env.APPDATA || '', 'osu');
  try { const m = fs.readFileSync(path.join(base, 'storage.ini'), 'utf8').match(/^\s*FullPath\s*=\s*(.+?)\s*$/m); if (m) return path.join(m[1], 'exports'); } catch { }
  return path.join(base, 'exports');
}
async function listReplays() {
  const dirs = [path.join(root, 'data', 'replays'), osuDir('Replays') || path.join(process.env.LOCALAPPDATA || '', 'osu!', 'Replays'), lazerExports()];
  const seen = new Set(), out = [];
  for (const dir of dirs) {
    let names = []; try { names = await fsp.readdir(dir); } catch { continue; }
    for (const name of names.filter(n => n.toLowerCase().endsWith('.osr'))) {
      const file = path.join(dir, name); if (seen.has(file)) continue; seen.add(file);
      try { const st = await fsp.stat(file); const info = readOsr(await fsp.readFile(file)); if (info.mode !== 0 && info.mode !== 3) continue; out.push({ id: Buffer.from(file).toString('base64url'), name, file, mtime: st.mtimeMs, uploaded: dir.startsWith(root), ...titleFromName(name), ...info }); } catch { }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
const replayPath = id => { const p = Buffer.from(String(id), 'base64url').toString(); if (!p.toLowerCase().endsWith('.osr') || !fs.existsSync(p)) throw Error('Replay introuvable.'); return p; };

function listSkins() { try { return ['default', ...fs.readdirSync(osuDir('Skins'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)]; } catch { return ['default']; } }
async function listVideos() {
  const dir = app.paths.output; let names = []; try { names = await fsp.readdir(dir); } catch { }
  const out = [];
  for (const n of names.filter(n => /\.(mp4|mkv|mov)$/i.test(n))) { const st = await fsp.stat(path.join(dir, n)); out.push({ name: n, size: st.size, mtime: st.mtimeMs }); }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// ---------- osu! API (player avatar / ranks) using danser's own credentials ----------
let apiToken = null;
// Sans clé configurée, on remplit credentials.json avec l'application osu! livrée avec Dancing! (assets/osu-client.json) :
// danser affiche alors le classement global de la map. Une clé entrée par l'utilisateur n'est jamais remplacée.
function ensureOsuClient() {
  const file = path.join(danserDir(), 'settings', 'credentials.json'), def = readJSON(path.join(root, 'assets', 'osu-client.json'));
  const c = readJSON(file) || {};
  if ((c.ClientId && c.ClientSecret) || !def?.ClientId || !fs.existsSync(path.dirname(file))) return;
  fs.writeFileSync(file, JSON.stringify({ CallbackPort: 8294, ...c, ClientId: def.ClientId, ClientSecret: def.ClientSecret, AuthType: 'ClientCredentials', AccessToken: '', RefreshToken: '' }, null, 2));
}
try { ensureOsuClient(); } catch { }
async function osuToken() {
  if (apiToken && apiToken.exp > Date.now()) return apiToken.v;
  const c = readJSON(path.join(danserDir(), 'settings', 'credentials.json'));
  if (!c?.ClientId || !c?.ClientSecret) return null;
  const r = await fetch('https://osu.ppy.sh/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: Number(c.ClientId), client_secret: c.ClientSecret, grant_type: 'client_credentials', scope: 'public' }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null; const j = await r.json(); apiToken = { v: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }; return apiToken.v;
}
// Classements des serveurs privés, API publiques sans clé. Akatsuki : relax=1 (RX) / 2 (AP) / 0 selon les mods du replay.
const PRIVATE_UA = { 'user-agent': 'Dancing! (osu! replay renderer; github.com/Underspace1/Dancing)' };
async function privateBoard(source, beatmapId, mods = []) {
  if (!beatmapId) throw Error('map sans identifiant');
  const get = async url => { const r = await fetch(url, { headers: PRIVATE_UA, signal: AbortSignal.timeout(10000) }); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const bits = m => modString(m);
  if (source === 'akatsuki') {
    const relax = mods.includes('RX') ? 1 : mods.includes('AP') ? 2 : 0;
    const j = await get(`https://akatsuki.gg/api/v1/scores?b=${beatmapId}&relax=${relax}&l=50`);
    return (j.scores || []).map(s => ({ name: s.user?.username || '?', id: s.user?.id || 0, avatar: s.user?.id ? `https://a.akatsuki.gg/${s.user.id}` : '', country: s.user?.country || '',
      score: s.score, combo: s.max_combo, acc: s.accuracy, pp: s.pp || null, rank: s.rank, misses: s.count_miss, mods: bits(s.mods) }));
  }
  if (source === 'gatari') {
    const j = await get(`https://api.gatari.pw/beatmap/${beatmapId}/scores?mode=0&sort=pp&l=50`);
    return (j.data || []).map(s => ({ name: s.username || '?', id: s.userid || 0, avatar: s.userid ? `https://a.gatari.pw/${s.userid}` : '', country: s.country || '',
      score: s.score, combo: s.max_combo, acc: s.accuracy, pp: s.pp || null, rank: s.rank, misses: s.count_miss, mods: bits(s.mods) }));
  }
  throw Error('serveur inconnu');
}
async function lookupUser(name) {
  try {
    const t = await osuToken(); if (!t) return null;
    const r = await fetch(`https://osu.ppy.sh/api/v2/users/${encodeURIComponent('@' + name)}/osu`, { headers: { authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null; const u = await r.json();
    return { avatar: u.avatar_url, country: u.country_code, globalRank: u.statistics?.global_rank, countryRank: u.statistics?.country_rank };
  } catch { return null; }
}

// ---------- render job ----------
let job = null;
const kill = p => { if (p && p.exitCode == null) execFile('taskkill', ['/PID', String(p.pid), '/T', '/F'], () => {}); };
function runProc(cmd, args, opts, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts }); job.proc = p;
    let buf = '';
    const feed = d => { buf += d; let i; while ((i = buf.search(/\r?\n|\r/)) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) onLine(line); } };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', reject); p.on('close', code => { if (buf.trim()) onLine(buf); job.proc = null; code === 0 ? resolve() : reject(Error(job.cancelled ? 'Rendu annulé.' : `${path.basename(cmd)} s'est arrêté (code ${code}).`)); });
  });
}
const logLine = l => {
  l = l.replace(/\x1b\[[0-9;]*m/g, '');
  if (/^\s*frame=/.test(l)) { if (/^\s*frame=/.test(job.log.at(-1) || '')) job.log.pop(); }  // keep only the latest ffmpeg status line
  job.log.push(l); if (job.log.length > 400) job.log.splice(0, job.log.length - 400); };

const maniaCache = new Map();
function maniaFor(id) {
  const file = replayPath(id);
  if (!maniaCache.has(file)) maniaCache.set(file, maniaData(file, osuDir('Songs') || path.join(process.env.LOCALAPPDATA || '', 'osu!', 'Songs'), path.join(root, 'cache')).catch(e => { maniaCache.delete(file); throw e; }));
  return maniaCache.get(file);
}

// osu!mania : danser ne gère que le standard, Dancing! dessine le jeu lui-même (mania-render.mjs).
async function startManiaRender(file, info, mode) {
  const profile = buildProfile(), rec = profile.Recording, r = app.render, M = await maniaFor(Buffer.from(file).toString('base64url'));
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19), work = path.join(root, 'data', 'work');
  const base = `${info.player} - ${M.meta.title}`.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 90);
  const outName = `${base}${mode === 'preview' ? ' (aperçu)' : ''} - ${stamp}.mp4`, out = path.join(app.paths.output, outName);
  const mid = M.meta.start + Math.max(0, (r.clipStart || 20) * 1000);
  const clip = mode === 'preview' ? { start: mid, end: mid + 12000 * M.meta.rate } : { start: r.clipStart > 0 ? r.clipStart * 1000 : 0, end: r.clipEnd > 0 ? r.clipEnd * 1000 : 0 };
  const vol = (profile.Audio?.GeneralVolume ?? 1) * (profile.Audio?.MusicVolume ?? 1) * 1.6;
  job = { running: true, stage: 'overlay', progress: 0, eta: null, log: ['> rendu osu!mania (moteur Dancing!)'], replay: path.basename(file), mode, started: Date.now(), out: outName };
  const jobFile = path.join(work, `rh-${stamp}.mania.json`);
  await fsp.writeFile(jobFile, JSON.stringify({
    replay: file, songs: osuDir('Songs') || path.join(process.env.LOCALAPPDATA || '', 'osu!', 'Songs'), cache: path.join(root, 'cache'), out,
    ffmpeg: path.join(danserDir(), 'ffmpeg', 'ffmpeg.exe'), size: [rec.FrameWidth, rec.FrameHeight], fps: Math.min(rec.FPS, 120),
    encoder: app.danser?.Recording?.Encoder || danserBase().Recording?.Encoder || 'libx264', crf: r.finalQuality, mania: app.mania || {}, clip, volume: Math.min(1.5, vol),
    scenes: mode === 'preview' ? {} : { intro: app.scenes.intro ? Math.min(4, app.scenes.introDur) : 0, outro: app.scenes.outro ? app.scenes.outroDur : 0 },
    tosu: (app.tosu || []).map(w => ({ ...w, glass: w.glass ?? extras.metadata(w.folder).glass, glassBlur: w.glassBlur || extras.metadata(w.folder).glassBlur })), stageUrl: `http://127.0.0.1:${PORT}/stage.html`,
  }));
  (async () => {
    const t0 = Date.now();
    try {
      await runProc(process.execPath, [path.join(root, 'mania-render.mjs'), jobFile], { cwd: root }, l => {
        let o; try { o = JSON.parse(l); } catch { return logLine(l); }
        if (o.progress != null) { job.progress = o.progress; const s = (Date.now() - t0) / 1000 / Math.max(o.progress, 1e-3) * (1 - o.progress); job.eta = `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`; }
        if (o.error) logLine('Erreur : ' + o.error);
        if (o.warn) logLine(o.warn);
        if (o.done) logLine(`Vidéo osu!mania terminée en ${o.seconds?.toFixed?.(0)} s`);
      });
      Object.assign(job, { running: false, stage: 'done', progress: 1, eta: null, finished: Date.now() });
    } catch (e) {
      logLine('Erreur : ' + e.message);
      Object.assign(job, { running: false, stage: job.cancelled ? 'cancelled' : 'error', error: e.message });
    } finally { if (!r.keepIntermediate) fsp.rm(jobFile, { force: true }); }
  })();
}

async function startRender({ replay, mode }) {
  if (job?.running) throw Error('Un rendu est déjà en cours.');
  try { ensureOsuClient(); } catch { }
  const file = replayPath(replay), info = readOsr(await fsp.readFile(file));
  if (info.mode === 3) return startManiaRender(file, info, mode);
  const dd = danserDir(), cli = path.join(dd, 'danser-cli.exe');
  if (!fs.existsSync(cli)) throw Error(`danser introuvable : ${cli}`);
  const profile = buildProfile();
  await fsp.writeFile(path.join(dd, 'settings', 'replay-hud-v2.json'), JSON.stringify(profile, null, 2));
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const base = `${info.player} - ${titleFromName(path.basename(file)).song}`.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 90);
  const work = path.join(root, 'data', 'work'), name = `rh-${stamp}`;
  const exportFile = path.join(work, name + '.json'), master = path.join(work, name + '.mp4'), audioFile = path.join(work, name + '.wav'), pcmFile = path.join(work, name + '.pcm');
  const outName = `${base}${mode === 'preview' ? ' (aperçu)' : ''} - ${stamp}.mp4`, out = path.join(app.paths.output, outName);
  job = { running: true, stage: 'danser', progress: 0, eta: null, log: [], replay: path.basename(file), mode, started: Date.now(), out: outName, exportFile };
  (async () => {
    try {
      const args = ['-settings=replay-hud-v2', `-replay=${file}`, '-record', '-noupdatecheck', `-out=${name}`];
      if (app.render.quickstart) args.push('-quickstart');
      const r = app.render;
      if (mode === 'preview') { const mid = Math.max(0, r.clipStart || 20); args.push(`-start=${mid}`, `-end=${mid + 12}`); }
      else { if (r.clipStart > 0) args.push(`-start=${r.clipStart}`); if (r.clipEnd > 0) args.push(`-end=${r.clipEnd}`); }
      logLine('> danser ' + args.join(' '));
      // Avant un premier rendu (ou après l'ajout de beaucoup de maps), danser indexe Songs dans danser.db sans afficher
      // de pourcentage : on compte les maps déjà en base pour montrer l'avancement au lieu d'un 0 % figé.
      const dbFile = path.join(dd, 'danser.db');
      const dbCount = () => { try { const db = new DatabaseSync(dbFile, { readOnly: true }); try { return db.prepare('SELECT COUNT(*) AS n FROM beatmaps').get().n; } finally { db.close(); } } catch { return null; } };
      let mapsTimer = null, notFound = false;
      const stopMaps = () => { clearInterval(mapsTimer); mapsTimer = null; if (job.maps) { job.maps = null; job.progress = 0; } };
      const runDanser = async args => { try {
        await runProc(cli, args, { cwd: dd, env: { ...process.env, DANSER_HUD_EXPORT: exportFile, DANSER_HUD_AUDIO: audioFile, DANSER_HUD_PCM: pcmFile } }, l => {
          logLine(l);
          if (/Beatmap not found/.test(l)) notFound = true;
          const imp = l.match(/DatabaseManager: Starting import of (\d+) maps/);
          if (imp) {
            const base = dbCount() ?? 0, total = +imp[1];
            job.maps = { done: 0, total };
            mapsTimer = setInterval(() => { const n = dbCount(); if (n != null && job.maps) job.maps.done = Math.max(0, Math.min(total, n - base)); }, 1000);
          }
          if (/DatabaseManager: (Imported \d+|No new\/updated|Loaded \d+ total)/.test(l)) stopMaps();
          const m = l.match(/Progress: (\d+)%.*?ETA: ([\w:]+)/); if (m) { stopMaps(); job.progress = +m[1] / 100; job.eta = m[2]; }
        });
      } finally { stopMaps(); } };
      await runDanser(args);
      if (notFound) {
        const hit = updatedMapMd5(dbFile, path.basename(file));
        if (!hit) throw Error("La map de ce replay n'est pas dans ton dossier Songs. Télécharge-la depuis osu!, puis relance le rendu.");
        logLine(`La map a été mise à jour depuis ce replay : rendu avec la version installée (${hit.file}). Si le mappeur a déplacé des notes, le curseur peut être décalé.`);
        // Copie du replay qui pointe vers la version installée (le md5 a toujours 32 caractères, on le remplace en place)
        const buf = await fsp.readFile(file), at = buf.indexOf(info.md5, 0, 'latin1');
        if (at < 0) throw Error('Replay illisible.');
        buf.write(hit.md5, at, 'latin1');
        const patched = path.join(work, name + '.osr'); await fsp.mkdir(work, { recursive: true }); await fsp.writeFile(patched, buf);
        notFound = false;
        try { await runDanser(args.map(a => a.startsWith('-replay=') ? `-replay=${patched}` : a)); } finally { fsp.rm(patched, { force: true }); }
        if (notFound) throw Error("danser ne trouve toujours pas la map de ce replay (voir le journal).");
      }
      if (!fs.existsSync(exportFile) || !fs.existsSync(master)) throw Error("danser n'a pas produit la vidéo ou l'export HUD (voir le journal).");
      const source = app.board?.source || 'osu';
      if (source !== 'osu') {
        const d = readJSON(exportFile);
        try {
          const board = await privateBoard(source, d.meta.beatmapId, info.mods);
          d.board = board; await fsp.writeFile(exportFile, JSON.stringify(d));
          logLine(`Classement ${source === 'akatsuki' ? 'Akatsuki' : 'Gatari'} : ${board.length} scores.`);
        } catch (e) { logLine(`Classement ${source} indisponible (${e.message}) : classement osu! gardé.`); }
      }
      job.stage = 'overlay'; job.progress = 0; job.eta = null;
      const user = await lookupUser(info.player) || {};
      const rec = profile.Recording, hud = { ...app.hud, outroStyle: app.scenes?.outroStyle };
      hud.avatarPath = hud.avatarPath || user.avatar; hud.country = hud.country || user.country;
      hud.countryRank = hud.countryRank || (user.countryRank ? String(user.countryRank) : ''); hud.globalRank = hud.globalRank || (user.globalRank ? String(user.globalRank) : '');
      const finalEnc = app.danser?.Recording?.Encoder || danserBase().Recording?.Encoder || 'libx264';
      const jobFile = path.join(work, name + '.job.json');
      await fsp.writeFile(jobFile, JSON.stringify({
        export: exportFile, video: master, out, audio: audioFile, pcm: pcmFile, ffmpeg: path.join(dd, 'ffmpeg', 'ffmpeg.exe'), cache: path.join(root, 'cache'), hud,
        size: [rec.FrameWidth, rec.FrameHeight], fps: rec.FPS, overlayFps: Math.min(rec.FPS, r.overlayFps || 60),
        oversample: rec.MotionBlur?.Enabled ? rec.MotionBlur.OversampleMultiplier : 1, encoder: finalEnc, crf: r.finalQuality,
        tosu: (app.tosu || []).map(w => ({ ...w, glass: w.glass ?? extras.metadata(w.folder).glass, glassBlur: w.glassBlur || extras.metadata(w.folder).glassBlur })), stageUrl: `http://127.0.0.1:${PORT}/stage.html`, board: app.board, playedIso: info.date, playedAt: new Date(info.date).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        introSettings: { dim: profile.Playfield?.Background?.Dim?.Normal, music: profile.Audio?.MusicVolume, effects: profile.Audio?.SampleVolume, storyboard: profile.Playfield?.Background?.LoadStoryboards, video: profile.Playfield?.Background?.LoadVideos },
        scenes: mode === 'preview' ? {} : { intro: app.scenes.intro ? app.scenes.introDur : 0, outro: app.scenes.outro ? app.scenes.outroDur : 0, music: app.scenes.music, volume: app.scenes.volume },
      }));
      const t0 = Date.now();
      await runProc(process.execPath, [path.join(root, 'compose.mjs'), jobFile], { cwd: root }, l => {
        let o; try { o = JSON.parse(l); } catch { return logLine(l); }
        if (o.progress != null) { job.progress = o.progress; const s = (Date.now() - t0) / 1000 / Math.max(o.progress, 1e-3) * (1 - o.progress); job.eta = `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`; }
        if (o.error) logLine('Erreur : ' + o.error);
        if (o.warn) logLine(o.warn);
        if (o.done) logLine(`Overlay composé en ${o.seconds?.toFixed?.(0)} s`);
      });
      if (nativeToken) {
        try {
          const data = readJSON(exportFile);
          const frames = await captureGameFrames(master, path.join(dd,'ffmpeg','ffmpeg.exe'), data?.frames || [], rec.FPS, rec.MotionBlur?.Enabled ? rec.MotionBlur.OversampleMultiplier : 1);
          gamePreview = { exportFile, frames };
          job.hasGamePreview = frames.length > 0;
        } catch (error) { logLine('Aperçu du jeu : ' + error.message); }
      }
      if (!r.keepIntermediate) for (const f of [master, jobFile, audioFile, pcmFile]) fsp.rm(f, { force: true });
      Object.assign(job, { running: false, stage: 'done', progress: 1, eta: null, finished: Date.now() });
    } catch (e) {
      logLine('Erreur : ' + e.message);
      Object.assign(job, { running: false, stage: job.cancelled ? 'cancelled' : 'error', error: e.message });
    }
  })();
}

// ---------- tosu overlay install ----------
// tosu fourni avec Dancing! : démarré à la demande, arrêté avec l'application.
let tosuProc = null;
function startTosu() {
  if (tosuProc && tosuProc.exitCode === null) return;
  const exe = path.join(tosuDir(), 'tosu.exe');
  if (!fs.existsSync(exe)) return;
  tosuProc = spawn(exe, [], { cwd: tosuDir(), windowsHide: true, stdio: 'ignore' });
  tosuProc.on('error', () => { tosuProc = null; });
}
for (const sig of ['exit', 'SIGINT', 'SIGTERM']) process.on(sig, () => { try { tosuProc?.kill(); } catch {} if (sig !== 'exit') process.exit(0); });
function installTosu() {
  const dest = path.join(tosuDir(), 'static', 'Replay HUD 2');
  fs.mkdirSync(path.join(dest, 'fonts'), { recursive: true });
  for (const f of ['hud.js', 'tosu.js']) fs.copyFileSync(path.join(root, 'web', f), path.join(dest, f));
  fs.copyFileSync(path.join(root, 'web', 'overlay.html'), path.join(dest, 'index.html'));
  for (const w of [600, 700, 800]) fs.copyFileSync(path.join(root, 'node_modules/@fontsource/nunito/files', `nunito-latin-${w}-normal.woff2`), path.join(dest, 'fonts', `nunito-${w}.woff2`));
  fs.writeFileSync(path.join(dest, 'hud-config.json'), JSON.stringify(app.hud, null, 2));
  fs.writeFileSync(path.join(dest, 'metadata.txt'), 'Usecase: ingame, obs-overlay\nName: Replay HUD 2\nVersion: 2.0\nAuthor: Mikael\nCompatibleWith: tosu\nResolution: 1920x1080\n');
  return 'http://127.0.0.1:24050/Replay%20HUD%202/';
}

// ---------- tosu widgets, presets, osu! account, updates ----------
let extras;
setTimeout(() => { extras.checkUpdates().catch(() => {}); setInterval(() => extras.checkUpdates().catch(() => {}), 6 * 3600e3); }, 3000);

// ---------- http ----------
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
async function body(req, limit = 20e6) { const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > limit) throw Error('Fichier trop volumineux.'); chunks.push(c); } return Buffer.concat(chunks); }
function serveFile(req, res, file) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) return send(res, 404, { error: 'Introuvable' });
    const h = { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) { const s = +m[1] || 0, en = m[2] ? +m[2] : st.size - 1; res.writeHead(206, { ...h, 'content-range': `bytes ${s}-${en}/${st.size}`, 'content-length': en - s + 1 }); fs.createReadStream(file, { start: s, end: en }).pipe(res); }
    else { res.writeHead(200, { ...h, 'content-length': st.size }); fs.createReadStream(file).pipe(res); }
  });
}
const inside = (dir, p) => { const r = path.resolve(dir, p); return r.startsWith(path.resolve(dir) + path.sep) ? r : null; };

extras = createExtras({ root, token, danserDir, tosuDir, osuDir, getJob: () => job, readJSON, send, serveFile, body, resetToken: () => { apiToken = null; } });
http.createServer(async (req, res) => {
  try {
    if (![`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(req.headers.host)) return send(res, 403, { error: 'Hôte refusé' });
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`), p = url.pathname;
    if (nativeToken && p.startsWith('/api/') && p !== '/api/calculate/pp' && req.headers['x-token'] !== token) {
      return send(res, 403, { error: 'Accès réservé à Dancing!.' });
    }
    if (await extras.handle(req, res, url)) return;
    if (req.method === 'POST') {
      if (req.headers['x-token'] !== token) return send(res, 403, { error: 'Jeton invalide' });
      if (p === '/api/upload') {
        const name = path.basename(decodeURIComponent(req.headers['x-name'] || 'replay.osr')).replace(/[^\w .()\[\]'-]+/g, '_');
        if (!name.toLowerCase().endsWith('.osr')) throw Error('Ce fichier n’est pas un replay .osr');
        const buf = await body(req); const info = readOsr(buf); if (info.mode !== 0 && info.mode !== 3) throw Error('Seuls les replays osu!standard et osu!mania sont pris en charge.');
        const file = path.join(root, 'data', 'replays', name); await fsp.writeFile(file, buf);
        return send(res, 200, { id: Buffer.from(file).toString('base64url') });
      }
      const input = JSON.parse((await body(req)).toString() || '{}');
      if (p === '/api/setup/browse') {
        const script = `[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $d = New-Object Windows.Forms.FolderBrowserDialog; $d.Description = 'Choisir un dossier osu!'; $d.ShowNewFolderButton = $false; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }; $d.Dispose()`;
        const folder = await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout.trim())));
        const dirs = Object.fromEntries(osuFolders.map(name => [name, directoryExists(path.join(folder, name)) ? path.join(folder, name) : '']));
        return send(res, 200, { folder, dirs });
      }
      if (p === '/api/setup') {
        if (job?.running) throw Error('Attends la fin du rendu.');
        const general = { ...app.danser.General };
        for (const name of osuFolders) {
          const key = 'Osu' + name + 'Dir', folder = input.dirs?.[name];
          if (folder && !directoryExists(folder)) throw Error(`Dossier ${name} introuvable.`);
          if (folder) general[key] = path.normalize(folder); else delete general[key];
        }
        const recording = { ...app.danser.Recording };
        if (input.resolution) {
          if (!['1280x720', '1920x1080', '2560x1440', '3840x2160'].includes(input.resolution)) throw Error('Résolution invalide.');
          [recording.FrameWidth, recording.FrameHeight] = input.resolution.split('x').map(Number);
        }
        const updated = { ...app, setupComplete: true, danser: { ...app.danser, General: general, Recording: recording } };
        await saveApp(updated);
        app = updated;
        return send(res, 200, { ok: true });
      }
      if (p === '/api/settings') { if (job?.running) throw Error('Attends la fin du rendu.'); app = deepMerge(structuredClone(defaultsApp), input); await saveApp(); return send(res, 200, { ok: true }); }
      if (p === '/api/render') { await startRender(input); return send(res, 202, { ok: true }); }
      if (p === '/api/cancel') { if (job?.running) { job.cancelled = true; kill(job.proc); } return send(res, 200, { ok: true }); }
      if (p === '/api/clip') {
        // Montage : un passage de la vidéo exporté en vertical (TikTok) dans le dossier des vidéos.
        const src = inside(app.paths.output, input.name || ''); if (!src || !fs.existsSync(src)) throw Error('Vidéo introuvable.');
        const start = +input.start, end = +input.end; if (!(end > start)) throw Error('Choisis un début avant la fin.');
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(11, 19), outName = path.basename(src, path.extname(src)).slice(0, 80) + ' (TikTok ' + stamp + ').mp4';
        const enc = app.danser?.Recording?.Encoder || danserBase().Recording?.Encoder || 'libx264';
        // cartes d'intro et de fin (infos de la map et du score enregistrées avec la vidéo au rendu)
        const info = input.cards === false ? null : readJSON(src + '.moments.json')?.info;
        let cards = null, tmp = null;
        if (info) {
          tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dancing-clip-')); cards = { intro: path.join(tmp, 'intro.rgba'), outro: path.join(tmp, 'outro.rgba') };
          const c = createCanvas(1080, 1920), g = c.getContext('2d');
          for (const k of ['intro', 'outro']) { drawClipCard(g, k, info); fs.writeFileSync(cards[k], Buffer.from(g.getImageData(0, 0, 1080, 1920).data.buffer)); }
        }
        try { await new Promise((ok, ko) => execFile(path.join(danserDir(), 'ffmpeg', 'ffmpeg.exe'), clipArgs({ input: src, output: path.join(app.paths.output, outName), start, end, layout: input.layout, encoder: enc, cards }), { windowsHide: true, timeout: 600000, maxBuffer: 1 << 24 }, (e, o, er) => e ? ko(Error('ffmpeg : ' + String(er).trim().split(/\r?\n/).slice(-2).join(' '))) : ok())); }
        finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
        return send(res, 200, { ok: true, name: outName, cards: !!cards });
      }
      if (p === '/api/reveal') { const f = inside(app.paths.output, input.name || '.'); execFile('explorer', f && fs.existsSync(f) && input.name ? ['/select,', f] : [app.paths.output]); return send(res, 200, { ok: true }); }
      if (p === '/api/tosu') { const url = installTosu(); startTosu(); return send(res, 200, { url }); }
      if (p === '/api/quit') { send(res, 200, { ok: true }); if (job?.running) { job.cancelled = true; kill(job.proc); } setTimeout(() => process.exit(0), 300); return; }
      if (p === '/api/avatar') { const buf = Buffer.from(String(input.data || '').split(',')[1] || '', 'base64'); if (buf.length < 50 || buf.length > 3e6) throw Error('Image invalide.'); const f = path.join(dataDir, 'avatar' + (input.data.startsWith('data:image/png') ? '.png' : '.jpg')); await fsp.writeFile(f, buf); return send(res, 200, { path: f }); }
      return send(res, 404, { error: 'Route inconnue' });
    }
    if (p === '/api/state') return send(res, 200, { token, app, defaultsApp, danserDefaults: danserBase(), osuDetected: detectOsu(), skins: listSkins(), replays: await listReplays(), videos: await listVideos(), ...extras.state(), job: job && { ...job, proc: undefined }, danserOk: fs.existsSync(path.join(danserDir(), 'danser-cli.exe')) });
    if (p === '/api/mania') return send(res, 200, await maniaFor(url.searchParams.get('replay')));
    if (p === '/api/mania/bg') { const m = await maniaFor(url.searchParams.get('replay')); return m.meta.bg ? serveFile(req, res, path.join(m.meta.dir, m.meta.bg)) : send(res, 404, {}); }
    if (p === '/api/job') return send(res, 200, job ? { ...job, proc: undefined } : null);
    if (p === '/api/videos') return send(res, 200, await listVideos());
    if (p === '/api/moments') { const f = inside(app.paths.output, url.searchParams.get('name') || ''); return send(res, 200, (f && readJSON(f + '.moments.json')) || { moments: [] }); }
    if (p === '/api/native/library') return send(res, 200, { presets: [...BUILTIN, ...dancingPresets()] });
    if (p === '/api/native/preview') {
      let position = Math.min(1, Math.max(0, Number(url.searchParams.get('position')) || 0));
      const scene = ['intro','outro'].includes(url.searchParams.get('scene')) ? url.searchParams.get('scene') : 'game';
      const frames = gamePreview?.exportFile === job?.exportFile ? gamePreview?.frames : null;
      const file = job?.stage !== 'danser' && job?.exportFile && fs.existsSync(job.exportFile) ? job.exportFile : null;
      if (nativePreviewSource?.app !== app || nativePreviewSource.file !== file || nativePreviewSource.frames !== frames) {
        nativePreviews.clear();
        nativePreviewSource = { app, file, frames, data: (file && readJSON(file)) || demo };
      }
      if (scene === 'game' && frames?.length) {
        position = frames.reduce((best,frame) => Math.abs(frame.fraction-position)<Math.abs(best.fraction-position) ? frame : best).fraction;
      }
      const key = `${scene}:${position}`;
      let snapshot = nativePreviews.get(key);
      if (!snapshot) {
        snapshot = nativeSnapshot(nativePreviewSource.data, { hud: { ...app.hud, outroStyle: app.scenes?.outroStyle }, tosu: app.tosu || [], board: app.board, frames, stageUrl: `http://127.0.0.1:${PORT}/stage.html` }, position, scene);
        nativePreviews.set(key,snapshot);
        if (nativePreviews.size > 12) nativePreviews.delete(nativePreviews.keys().next().value);
      }
      try { return send(res,200,await snapshot,'image/png'); }
      catch (error) {
        if (nativePreviews.get(key) === snapshot) nativePreviews.delete(key);
        throw error;
      }
    }
    if (p === '/api/export') { const f = job?.exportFile && fs.existsSync(job.exportFile) ? job.exportFile : null; return f ? serveFile(req, res, f) : send(res, 404, { error: 'Aucun export' }); }
    if (p === '/api/skin') {   // a skin element for the picker thumbnails, @2x preferred
      const skins = osuDir('Skins');
      const dir = skins && inside(skins, url.searchParams.get('name') || '');
      const el = String(url.searchParams.get('f') || '').replace(/[^\w-]/g, '');
      const f = dir && ['@2x.png', '.png'].map(x => path.join(dir, el + x)).find(x => fs.existsSync(x));
      return f ? serveFile(req, res, f) : send(res, 404, { error: 'Absent' });
    }
    if (p === '/api/bg') {     // background of the last rendered map, for the scene previews
      const d = job?.exportFile && readJSON(job.exportFile), f = d?.meta?.dir && path.join(d.meta.dir, d.meta.bg || '');
      return f && fs.existsSync(f) ? serveFile(req, res, f) : send(res, 404, { error: 'Absent' });
    }
    if (p === '/api/avatar') { const f = app.hud?.avatarPath; return f && fs.existsSync(f) ? serveFile(req, res, f) : send(res, 404, { error: 'Aucun avatar' }); }
    if (p.startsWith('/videos/')) { const f = inside(app.paths.output, decodeURIComponent(p.slice(8))); return f ? serveFile(req, res, f) : send(res, 403, { error: 'Refusé' }); }
    if (p.startsWith('/fonts/')) return serveFile(req, res, path.join(root, 'node_modules/@fontsource/nunito/files', path.basename(p)));
    const f = inside(path.join(root, 'web'), p === '/' ? 'index.html' : p.slice(1));
    return f ? serveFile(req, res, f) : send(res, 403, { error: 'Refusé' });
  } catch (e) { send(res, 400, { error: e.message }); }
}).on('error', e => {
  if (e.code === 'EADDRINUSE') { if (process.argv.includes('--open')) openBrowser(); console.log('Replay HUD tourne déjà.'); process.exit(0); }
  throw e;
}).listen(PORT, '127.0.0.1', () => { console.log(`Replay HUD : http://127.0.0.1:${PORT}`); if (process.argv.includes('--open')) openBrowser(); });
function openBrowser() { execFile('cmd', ['/c', 'start', '', `http://127.0.0.1:${PORT}/`], { windowsHide: true }); }
