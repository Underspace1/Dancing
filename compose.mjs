// Composites the Replay HUD overlay onto a danser recording.
//   node compose.mjs <job.json>
// job: { export, video, out, ffmpeg, hud:{...overlay cfg}, size:[w,h], fps, oversample, encoder, crf, cache, png?, workers? }
// Le rendu est découpé en tranches rendues en parallèle (node compose.mjs --segment <segments.json> <n>), puis recollées.
// With job.png = { t, file } it writes a single PNG of the overlay at map time t instead.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts, ImageData } from '@napi-rs/canvas';
import { HUD, Timeline, W, H, modList } from './web/hud.js';
import { drawIntro, drawOutro, prepareBackdrop } from './web/scenes.js';
import { tosuMessages } from './web/tosu-emu.js';
import { findMoments, toVideoTime } from './clips.mjs';
import { dancingWidget, drawDancingWidgets } from './web/dancing-widgets.js';
import { workerCount, splitRange, alignStep, runSegments, writeConcatList, pipeFrames, runFfmpeg, probeColor, setparams } from './segments.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(here, 'node_modules', '@fontsource', 'nunito', 'files');
for (const w of [300, 600, 700, 800]) GlobalFonts.registerFromPath(path.join(fontDir, `nunito-latin-${w}-normal.woff2`), 'Nunito');

const log = o => process.stdout.write(JSON.stringify(o) + '\n');

// Downloads (and caches) an image; returns null on any failure so a missing avatar never breaks a render.
export async function fetchImage(url, cacheDir) {
  if (!url) return null;
  try {
    if (!/^https?:/.test(url)) return await loadImage(fs.readFileSync(url));
    fs.mkdirSync(cacheDir, { recursive: true });
    const file = path.join(cacheDir, url.replace(/^https?:\/\//, '').replace(/[^a-z0-9._-]+/gi, '_').slice(-120));
    if (!fs.existsSync(file)) {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    return await loadImage(fs.readFileSync(file));
  } catch { return null; }
}
export const flagURL = cc => cc && /^[A-Z]{2}$/i.test(cc) ? `https://osu.ppy.sh/assets/images/flags/${[...cc.toUpperCase()].map(c => (0x1f1e6 + c.charCodeAt(0) - 65).toString(16)).join('-')}.svg` : null;

export async function loadAssets(data, job) {
  const cache = job.cache || path.join(here, 'cache');
  const avatars = new Map();
  const urls = [...new Set((data.board || []).map(b => b.avatar).filter(Boolean))];
  for (let i = 0; i < urls.length; i += 8) await Promise.all(urls.slice(i, i + 8).map(async u => avatars.set(u, await fetchImage(u, cache))));
  const avatar = await fetchImage(job.hud?.avatarPath || data.meta.playerAvatar, cache);
  const flag = await fetchImage(flagURL(job.hud?.country || data.meta.playerCountry), cache);
  const m = data.meta, bg = m.dir && m.bg ? await fetchImage(path.join(m.dir, m.bg), cache) : null;
  return { avatars, avatar, flag, backdrop: prepareBackdrop(bg, (w, h) => createCanvas(w, h)) };
}

// H.265 : étiquette « hvc1 » (et non « hev1 ») pour que QuickTime, iPhone et TikTok le reconnaissent
export function encoderArgs(job) { const a = encoderArgsBase(job); return /hevc|265/.test(job.encoder || '') ? [...a, '-tag:v', 'hvc1'] : a; }
export function encoderArgsBase(job) {
  const enc = job.encoder || 'libx264', q = String(job.crf ?? 18);
  if (enc === 'libx264') return ['-c:v', 'libx264', '-preset', job.preset || 'veryfast', '-crf', q];
  if (enc === 'libx265') return ['-c:v', 'libx265', '-preset', job.preset || 'fast', '-crf', q];
  if (/nvenc/.test(enc)) return ['-c:v', enc, '-preset', 'p5', '-rc', 'vbr', '-cq', q, '-b:v', '0'];
  if (/amf/.test(enc)) return ['-c:v', enc, '-quality', 'quality', '-rc', 'cqp', '-qp_i', q, '-qp_p', q];
  if (/qsv/.test(enc)) return ['-c:v', enc, '-global_quality', q];
  return ['-c:v', enc];
}

// Chromium renders the HTML widgets offscreen, separate from the Windows interface.
const BROWSER = [
  path.join(here, 'runtime', 'chromium', 'chrome-headless-shell.exe'),
  path.join(here, 'app', 'headless', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(f => fs.existsSync(f));
// Chromium headless piloté par CDP : widgets HTML (openStage) et décodage audio des maps mania.
export async function chromium(vw = 800, vh = 600) {
  if (!BROWSER) throw Error('Le moteur Chromium des widgets tosu est introuvable.');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-stage-'));
  const br = spawn(BROWSER, ['--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--user-data-dir=${prof}`, '--remote-debugging-port=0', `--window-size=${vw},${vh}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws;
  const close = () => {
    ws?.close(); br.kill();
    setTimeout(() => fs.promises.rm(prof, { recursive: true, force: true, maxRetries: 3 }).catch(() => {}), 1000).unref();
  };
  br.on('error', () => {});
  try {
  let port; for (let k = 0; k < 100 && !port; k++) { await new Promise(r => setTimeout(r, 100)); try { port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { } }
  if (!port) { br.kill(); throw Error('DevTools indisponible'); }
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { const [r, j] = wait.get(m.id); wait.delete(m.id); m.error ? j(Error(m.error.message)) : r(m.result); } };
  const cdp = async (method, params = {}) => {
    const i = ++id;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(Error(`Chromium ne répond plus (${method}).`)), 10000);
        wait.set(i, [resolve, reject]);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    } finally {
      clearTimeout(timer);
      wait.delete(i);
    }
  };
  const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || 'erreur JS'); return r.result.value; };
  await cdp('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
  return { cdp, ev, close };
  } catch (error) { close(); throw error; }
}

export async function openStage(job, vw, vh, s) {
  const { cdp, ev, close } = await chromium(vw, vh);
  try {
  await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await cdp('Page.navigate', { url: job.stageUrl });
  for (let k = 0; k < 100; k++) { await new Promise(r => setTimeout(r, 100)); if (await ev('!!window.__stage && document.readyState === "complete"')) break; }
  const ws2 = job.tosu.map(w => ({ folder: w.folder, x: Math.round(w.x * s), y: Math.round(w.y * s), w: w.w, h: w.h, s: (w.s || 1) * s, o: w.o ?? 1 }));
  await ev(`__stage.setup(${JSON.stringify(ws2)})`);
  const x0 = Math.max(0, Math.min(...ws2.map(w => w.x))), y0 = Math.max(0, Math.min(...ws2.map(w => w.y)));
  const x1 = Math.min(vw, Math.max(...ws2.map(w => w.x + w.w * w.s))), y1 = Math.min(vh, Math.max(...ws2.map(w => w.y + w.h * w.s)));
  const clipBox = { x: x0, y: y0, width: Math.max(1, Math.ceil(x1 - x0)), height: Math.max(1, Math.ceil(y1 - y0)), scale: 1 };
  return {
    async frame(t, msgs) {
      await ev(`__stage.frame(${t}, ${JSON.stringify(msgs)})`);
      const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip: clipBox, fromSurface: true, optimizeForSpeed: true });
      return { img: await loadImage(Buffer.from(data, 'base64')), x: clipBox.x, y: clipBox.y };
    },
    // fait avancer les widgets sans capture (préchauffage d'une tranche)
    async feed(t, msgs) { await ev(`__stage.frame(${t}, ${JSON.stringify(msgs)})`); },
    close,
  };
  } catch (error) { close(); throw error; }
}

const runFile = promisify(execFile);
export async function captureGameFrames(video, ffmpeg, frames, fps, oversample) {
  const count = Math.floor(frames.length / oversample), width = 960, height = 540;
  if (count < 1 || !(fps > 0)) return [];
  const canvas = createCanvas(width,height), g = canvas.getContext('2d'), snapshots = [];
  for (const fraction of [0.05,0.27,0.5,0.73,0.95]) {
    const index = Math.round((count-1)*fraction), t = frames[index*oversample];
    if (!Number.isFinite(t)) continue;
    const { stdout } = await runFile(ffmpeg, ['-hide_banner','-loglevel','error','-ss',String(index/fps),'-i',video,'-frames:v','1','-an','-vf',`scale=${width}:${height}`,'-pix_fmt','rgba','-f','rawvideo','pipe:1'], {
      encoding:'buffer', maxBuffer:width*height*4+65536, timeout:10000, windowsHide:true,
    });
    if (stdout.length !== width*height*4) continue;
    g.putImageData(new ImageData(new Uint8ClampedArray(stdout),width,height),0,0);
    snapshots.push({ fraction, t, image:await loadImage(canvas.toBuffer('image/png')) });
  }
  return snapshots;
}

export async function nativeSnapshot(data, job, position, scene) {
  const width = 960, height = 540, scale = width / W;
  const cv = createCanvas(width, height), g = cv.getContext('2d'), meta = data.meta;
  const tl = new Timeline(data, { board: job.board });
  const game = scene !== 'intro' && scene !== 'outro';
  const frame = game && job.frames?.reduce((best,next) => !best || Math.abs(next.fraction-position)<Math.abs(best.fraction-position) ? next : best,null);
  const st = tl.at(frame?.t ?? meta.start + position * (meta.end - meta.start), job.hud?.boardSort);
  const assets = job.assets || {};
  if ((scene === 'intro' || scene === 'outro') && !assets.backdrop) assets.backdrop = prepareBackdrop(null, createCanvas);
  g.scale(scale, scale);
  if (scene === 'intro') drawIntro(g, position * 4.5, 4.5, { meta, player: meta.player, mods: modList(meta.mods), bpm: st.bpm }, assets, job.hud);
  else if (scene === 'outro') drawOutro(g, position * 8, 8, { ...tl.summary(), player: meta.player }, assets, job.hud);
  else {
    if (frame) g.drawImage(frame.image,0,0,W,H);
    else {
      const bg = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 1100);
      bg.addColorStop(0, '#16171d'); bg.addColorStop(1, '#040405');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.save();
      g.lineWidth = 6; g.strokeStyle = '#dfe3ea';
      for (const [i, [x, y]] of [[760, 520], [880, 430], [1010, 470], [1120, 600], [1040, 720]].entries()) {
        g.globalAlpha = .08 + i * .05;
        g.beginPath(); g.arc(x, y, 58, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
    const hud = new HUD(job.hud, assets);
    hud.draw(g, { ...st, since: null }, position * 1000);
    const msgs = tosuMessages(st, meta, { board: st.board });
    drawDancingWidgets(g, job.tosu, msgs);
    const external = job.tosu.filter(w => !dancingWidget(w.folder));
    if (external.length) {
      const stage = await openStage({ ...job, tosu: external }, width, height, scale);
      try {
        const shot = await stage.frame(position * 1000, msgs);
        g.resetTransform(); g.drawImage(shot.img, shot.x, shot.y);
      } finally { stage.close(); }
    }
  }
  return cv.toBuffer('image/png');
}


// Verre dépoli : le jeu derrière chaque widget « Glass: <rayon> » est flouté (coins arrondis) avant que le widget soit posé dessus.
export function glassChain(job, inputs, vw, vh, s, label) {
  const files = [];
  let chain = '', cur = label;
  (job.tosu || []).filter(w => w.glass > 0).forEach((w, k) => {
    const sc = (w.s || 1) * s;
    const x = Math.max(0, Math.round(w.x * s)), y = Math.max(0, Math.round(w.y * s));
    const ww = Math.min(vw - x, Math.round(w.w * sc)) & ~1, hh = Math.min(vh - y, Math.round(w.h * sc)) & ~1;
    if (ww < 8 || hh < 8) return;
    const cv = createCanvas(ww, hh), g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, ww, hh); g.fillStyle = '#fff';
    g.beginPath(); g.roundRect(0, 0, ww, hh, w.glass * sc); g.fill();
    const rgba = g.getImageData(0, 0, ww, hh).data, gray = Buffer.alloc(ww * hh);
    for (let i = 0; i < gray.length; i++) gray[i] = rgba[i * 4];
    const file = path.join(os.tmpdir(), `dancing-glass-${process.pid}-${k}.gray`);
    fs.writeFileSync(file, gray); files.push(file);
    const idx = inputs.filter(a => a === '-i').length;
    inputs.push('-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${ww}x${hh}`, '-framerate', String(job.fps || 60), '-stream_loop', '-1', '-i', file);
    const r = Math.max(1, Math.min(Math.round((w.glassBlur || 18) * sc), Math.floor(Math.min(ww, hh) / 2) - 1));
    chain += `${cur}split[ga${k}][gb${k}];[gb${k}]crop=${ww}:${hh}:${x}:${y},boxblur=${r}:2,format=yuva420p[gc${k}];[gc${k}][${idx}:v]alphamerge[gd${k}];[ga${k}][gd${k}]overlay=${x}:${y}:shortest=1[gl${k}];`;
    cur = `[gl${k}]`;
  });
  return { chain, out: cur, cleanup: () => files.forEach(f => fs.rmSync(f, { force: true })) };
}

// Découpage commun au chef d'orchestre et aux tranches : images d'overlay (fps) et de la vidéo danser (job.fps).
function layout(job, data) {
  const fps = job.overlayFps || job.fps, ratio = job.fps / fps, m = Math.max(1, job.oversample || 1);
  const frames = data.frames, videoFrames = Math.floor(frames.length / m), total = Math.floor(videoFrames / ratio);
  const sc = job.scenes || {}, I = sc.intro > 0 ? sc.intro : 0, O = sc.outro > 0 ? sc.outro : 0;
  const nI = Math.round(I * fps), nO = Math.round(O * fps), G = videoFrames / job.fps;
  return { fps, ratio, m, frames, videoFrames, total, sc, I, O, nI, nO, G, all: nI + total + nO };
}

// Tranches de la vidéo finale : intro, morceaux du replay, fin. oa/ob : images d'overlay ; count : images de sortie ;
// A : première image de la vidéo danser (replay). Les coupes du replay tombent sur des images communes aux deux cadences.
export function planSegments(job, L, workers) {
  const segs = [];
  if (L.nI > 0) segs.push({ kind: 'intro', oa: 0, ob: L.nI, count: Math.max(1, Math.round(L.I * job.fps)) });
  const K = alignStep(job.fps, L.fps);
  const parts = K ? splitRange(L.nI, L.nI + L.total, workers * 2, { align: K, min: Math.max(K, Math.round(L.fps * 5)) }) : [[L.nI, L.nI + L.total]];
  parts.forEach(([oa, ob], k) => {
    const A = Math.round((oa - L.nI) * L.ratio), B = k === parts.length - 1 ? L.videoFrames : Math.round((ob - L.nI) * L.ratio);
    if (B > A) segs.push({ kind: 'game', oa, ob, A, count: B - A });
  });
  if (L.nO > 0) segs.push({ kind: 'outro', oa: L.nI + L.total, ob: L.all, count: Math.max(1, Math.round(L.O * job.fps)) });
  return segs;
}

// Une tranche : dessine ses images d'overlay et les fusionne à sa partie de la vidéo danser dans son propre ffmpeg.
async function segmentMain(jobFile, index) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const data = JSON.parse(fs.readFileSync(job.export, 'utf8'));
  const seg = job.segments[index], L = layout(job, data), { fps, ratio, m, frames, videoFrames, I, O, nI, total } = L;
  const assets = await loadAssets(data, job);
  const tl = new Timeline(data, { avatars: assets.avatars, playerAvatar: assets.avatar, countryRank: job.hud?.countryRank, globalRank: job.hud?.globalRank, board: job.board, playedAt: job.playedAt, playedIso: job.playedIso });
  const sort = job.hud?.boardSort || 'pp', meta = data.meta;
  const [vw, vh] = job.size, s = vw / W;
  const cv = createCanvas(vw, vh), g = cv.getContext('2d');
  const hud = new HUD(job.hud, assets);
  const info = { meta, player: meta.player, mods: modList(meta.mods), bpm: tl.at(meta.start).bpm, countryRank: job.hud?.countryRank, globalRank: job.hud?.globalRank, settings: job.introSettings };
  const summary = O ? { ...tl.summary(), player: meta.player } : null;
  const widgets = job.tosu || [], game = seg.kind === 'game';
  const external = game ? widgets.filter(w => !dancingWidget(w.folder)) : [];
  const bundled = widgets.filter(w => dancingWidget(w.folder));
  let stage = external.length ? await openStage({ ...job, tosu: external }, vw, vh, s).catch(e => { log({ warn: 'Widgets tosu ignorés : ' + e.message }); return null; }) : null;
  const tosuEvery = Math.max(1, Math.round(fps / (job.tosuFps || 30)));
  let shot = null;
  const stateAt = j => { const t = frames[Math.min(videoFrames - 1, Math.round(j * ratio)) * m + (m >> 1)], st = tl.at(t, sort); st.since = j * 1000 / fps; return { t, st }; };
  const tosuMsgs = (st, t) => {
    const at = Timeline.idx(tl.errs, t), errs = tl.errs.slice(Math.max(0, at - 199), at + 1).map(e => e.e);
    return tosuMessages(st, meta, { board: st.board, hitErrors: errs, country: job.hud?.country });
  };
  // Le HUD lisse ses valeurs d'une image à l'autre : une tranche du replay rejoue d'abord 2 s sans les envoyer à ffmpeg.
  if (game && seg.oa > nI) {
    for (let i = Math.max(nI, seg.oa - Math.round(fps * 2)); i < seg.oa; i++) {
      const j = i - nI, { t, st } = stateAt(j);
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, vw, vh); g.setTransform(s, 0, 0, s, 0, 0);
      hud.draw(g, st, j * 1000 / fps);
      if (stage && j % tosuEvery === 0) await stage.feed(j * 1000 / fps, tosuMsgs(st, t)).catch(() => {});
    }
  }
  const draw = async i => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, vw, vh); g.setTransform(s, 0, 0, s, 0, 0);
    if (i < nI) drawIntro(g, i / fps, I, info, assets, job.hud);
    else if (i >= nI + total) drawOutro(g, (i - nI - total) / fps, O, summary, assets, job.hud);
    else {
      const j = i - nI, { t, st } = stateAt(j);
      hud.draw(g, st, j * 1000 / fps);
      if (bundled.length) drawDancingWidgets(g, bundled, tosuMessages(st, meta, { board: st.board }));
      if (stage) {
        if (j % tosuEvery === 0 || !shot) {
          try { shot = await stage.frame(j * 1000 / fps, tosuMsgs(st, t)); }
          catch (e) { log({ warn: 'Capture des widgets interrompue : ' + e.message }); stage.close(); stage = null; shot = null; }
        }
        if (shot) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(shot.img, shot.x, shot.y); }
      }
    }
    return Buffer.from(g.getImageData(0, 0, vw, vh).data.buffer);
  };

  // Fond de la tranche : la vidéo danser (cherchée à l'image près) ou du noir pour l'intro et la fin.
  const inputs = [];
  if (game) { if (seg.A > 0) inputs.push('-ss', ((seg.A - 0.5) / job.fps).toFixed(6)); inputs.push('-i', job.video); }
  inputs.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${vw}x${vh}`, '-r', String(fps), '-i', 'pipe:0');
  const color = setparams(job.color), ov = game ? '[1:v]' : '[0:v]';
  let fc, cleanup;
  if (game) {
    const glass = glassChain(job, inputs, vw, vh, s, '[g0]');
    fc = `[0:v]setpts=PTS-STARTPTS[g0];${glass.chain}${glass.out}${ov}overlay=0:0:format=auto:eof_action=repeat,format=yuv420p${color}[v]`;
    cleanup = glass.cleanup;
  } else fc = `color=c=black:s=${vw}x${vh}:r=${job.fps},format=yuv420p[bk];[bk]${ov}overlay=0:0:format=auto:eof_action=repeat,format=yuv420p${color}[v]`;
  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-an', ...encoderArgsBase(job), '-frames:v', String(seg.count), '-f', 'mpegts', seg.file];
  try {
    await pipeFrames(job.ffmpeg, args, seg.ob - seg.oa, k => draw(seg.oa + k), k => { if (k % 15 === 0 || k === seg.ob - seg.oa) log({ frame: k }); });
  } finally { stage?.close(); cleanup?.(); }
}

async function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const data = JSON.parse(fs.readFileSync(job.export, 'utf8'));
  const assets = await loadAssets(data, job);
  const tl = new Timeline(data, { avatars: assets.avatars, playerAvatar: assets.avatar, countryRank: job.hud?.countryRank, globalRank: job.hud?.globalRank, board: job.board, playedAt: job.playedAt, playedIso: job.playedIso });
  const sort = job.hud?.boardSort || 'pp';

  if (job.png) {
    const hud = new HUD(job.hud, assets);
    const cv = createCanvas(W, H), g = cv.getContext('2d'), m = data.meta;
    if (job.png.scene === 'intro') drawIntro(g, job.png.t, job.png.dur || 4.5, { meta: m, player: m.player, mods: modList(m.mods), bpm: tl.at(m.start).bpm, countryRank: job.hud?.countryRank, globalRank: job.hud?.globalRank }, assets, job.hud);
    else if (job.png.scene === 'outro') drawOutro(g, job.png.t, job.png.dur || 8, { ...tl.summary(), player: m.player }, assets, job.hud);
    else for (let k = 0; k <= 40; k++) { g.fillStyle = job.png.bg || '#000'; g.fillRect(0, 0, W, H); hud.draw(g, tl.at(job.png.t - (40 - k) * 16, sort), k * 16); }
    fs.writeFileSync(job.png.file, await cv.encode('png'));
    return log({ done: true, file: job.png.file });
  }

  const t0 = Date.now(), L = layout(job, data), { fps, m, frames, videoFrames, I, O, nI, G, all } = L, meta = data.meta;
  // Rendu en tranches parallèles (segments.mjs), recollées sans réencodage ; le son est ajouté au recollage.
  // tranches à côté du fichier de tâche (data/work), pas dans le dossier des vidéos
  const workers = workerCount(job), base = path.join(path.dirname(path.resolve(process.argv[2])), path.basename(job.out).replace(/\.[^.]+$/, ''));
  const segments = planSegments(job, L, workers).map((sg, k) => ({ ...sg, file: `${base}.part${k}.ts` }));
  const color = await probeColor(job.ffmpeg, job.video);
  const segJob = process.argv[2].replace(/\.json$/, '') + '.segments.json', list = base + '.parts.txt';
  fs.writeFileSync(segJob, JSON.stringify({ ...job, segments, color }));
  const clean = () => { for (const f of [segJob, list, ...segments.map(sg => sg.file)]) fs.rmSync(f, { force: true }); };
  try {
    log({ info: `Rendu en ${segments.length} tranches, ${Math.min(workers, segments.length)} en parallèle` });
    await runSegments(segments, workers, i => spawn(process.execPath, [fileURLToPath(import.meta.url), '--segment', segJob, String(i)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }), {
      onProgress: (p, n) => log({ progress: p * 0.97, frame: n, total: all, fps: n / ((Date.now() - t0) / 1000 + 1e-9) }),
      onLine: o => log(o),
    });

    // Recollage : vidéo copiée telle quelle, son de danser (et musique de la map sur l'intro et la fin) mixé ici.
    writeConcatList(list, segments.map(sg => sg.file));
    const inputs = ['-f', 'concat', '-safe', '0', '-i', list];
    const music = L.sc.music !== false && job.audio && fs.existsSync(job.audio) && (I || O), pv = 0, vol = L.sc.volume ?? 0.6;
    let fc = '', amap;
    if (!I && !O) { inputs.push('-i', job.video); amap = ['-map', '1:a?', '-c:a', 'copy']; }
    else if (job.pcm && fs.existsSync(job.pcm)) {
      // danser's ffmpeg cannot decode AAC: danser also writes its mixed audio as raw PCM (job.pcm), which we mix here
      inputs.push('-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', job.pcm);
      const mix = [`[1:a]adelay=${Math.round(I * 1000)}:all=1[ga]`], lab = ['[ga]'];
      if (music && I) { inputs.push('-ss', String(pv), '-t', String(I + 0.5), '-i', job.audio); mix.push(`[2:a]atrim=0:${I},afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, I - 0.9)}:d=0.9,volume=${vol}[ia]`); lab.push('[ia]'); }
      if (music && O) { const k = 2 + (I ? 1 : 0); inputs.push('-ss', String(pv + Math.max(0, Math.min(I, 30 - O))), '-t', String(O + 0.5), '-i', job.audio); mix.push(`[${k}:a]atrim=0:${O},afade=t=in:d=1.2,afade=t=out:st=${Math.max(0, O - 1.5)}:d=1.5,volume=${vol},adelay=${Math.round((I + G) * 1000)}:all=1[oa]`); lab.push('[oa]'); }
      fc = mix.join(';') + `;${lab.join('')}amix=inputs=${lab.length}:normalize=0:duration=longest[a]`;
      amap = ['-map', '[a]', '-c:a', 'aac', '-b:a', '256k'];
    } else { inputs.push('-itsoffset', String(I), '-i', job.video); amap = ['-map', '1:a?', '-c:a', 'copy']; }   // no PCM: danser audio only, kept in sync
    const tag = /hevc|265/.test(job.encoder || '') ? ['-tag:v', 'hvc1'] : [];
    await runFfmpeg(job.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, ...(fc ? ['-filter_complex', fc] : []),
      '-map', '0:v', '-c:v', 'copy', ...tag, ...amap, '-t', String(I + G + O), '-movflags', '+faststart', job.out]);
  } catch (e) { log({ error: e.message }); clean(); process.exit(1); }
  clean();
  // Moments forts pour l'éditeur de montage, en secondes dans la vidéo finale (à côté du fichier).
  try {
    const tv = ms => toVideoTime(ms, frames, { oversample: m, fps: job.fps, intro: I });
    const f0 = frames[0], f1 = frames[frames.length - 1], sm = tl.summary();
    // seulement les moments filmés (un aperçu ne couvre que 12 s de la map)
    const moments = findMoments(data.hits || []).filter(x => x.start >= f0 && x.end <= f1 + 50).map(x => ({ start: +tv(x.start).toFixed(2), end: +tv(x.end).toFixed(2), label: x.label }));
    // infos de la map et du score pour les cartes d'intro et de fin des clips verticaux
    const info = { bg: meta.dir && meta.bg ? path.join(meta.dir, meta.bg) : null, title: meta.title, artist: meta.artist, version: meta.version, creator: meta.creator, stars: meta.stars, cs: meta.cs, ar: meta.ar, od: meta.od, hp: meta.hp, bpm: tl.at(meta.start).bpm,
      player: meta.player, mods: modList(meta.mods), score: sm.score, acc: sm.acc, pp: sm.pp, grade: sm.grade, combo: sm.maxCombo, maxCombo: meta.maxCombo, miss: sm.nmiss, n100: sm.n100, n50: sm.n50, rank: sm.of > 1 ? sm.rank : null, of: sm.of };
    // temps de map (ms) toutes les 0,5 s de vidéo, et le replay : permet de refaire un rendu danser dédié pour un clip vertical
    const vt = { intro: I, step: 0.5, map: [] };
    for (let s = 0; s <= nI / fps + videoFrames / job.fps + 0.5; s += 0.5) { const k = Math.round((s - I) * job.fps); vt.map.push(k < 0 || k >= videoFrames ? null : Math.round(frames[k * m])); }
    fs.writeFileSync(job.out + '.moments.json', JSON.stringify({ moments, info: { ...info, replay: job.replay || null }, vt }));
  } catch { }
  log({ done: true, file: job.out, seconds: (Date.now() - t0) / 1000 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2] === '--segment' ? segmentMain(process.argv[3], Number(process.argv[4])) : main();
  run.catch(e => { log({ error: e.stack || String(e) }); process.exit(1); });
}
