// Rendu vidéo d'un replay osu!mania (danser ne gère que le standard) : node mania-render.mjs <job.json>
// job : { replay, songs, cache, out, ffmpeg, size, fps, encoder, crf, mania, clip:{start,end} (ms de map),
//         scenes:{intro, outro} (s), volume, tosu, stageUrl, workers? }
// Rendu en tranches parallèles (node mania-render.mjs --segment <segments.json> <n>), recollées sans réencodage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { maniaData } from './mania.mjs';
import { ManiaTimeline, drawMania, drawManiaIntro, drawManiaResults, maniaBackdrop, maniaTosu, maniaDefaults } from './web/mania.js';
import { tosuMessages } from './web/tosu-emu.js';
import { dancingWidget, drawDancingWidgets } from './web/dancing-widgets.js';
import { chromium, openStage, encoderArgsBase } from './compose.mjs';
import { workerCount, splitRange, runSegments, writeConcatList, pipeFrames, runFfmpeg } from './segments.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
for (const w of [600, 700, 800]) GlobalFonts.registerFromPath(path.join(here, 'node_modules', '@fontsource', 'nunito', 'files', `nunito-latin-${w}-normal.woff2`), 'Nunito');
const log = o => process.stdout.write(JSON.stringify(o) + '\n');

// La ffmpeg de danser ne lit ni mp3 ni ogg : Chromium décode la musique en PCM flottant 48 kHz stéréo.
export async function decodeAudio(file, outFile) {
  const { ev, close } = await chromium();
  try {
    await ev(`window.__parts = []; true`);
    const bytes = fs.readFileSync(file);
    for (let o = 0; o < bytes.length; o += 3e6) await ev(`window.__parts.push(${JSON.stringify(bytes.subarray(o, o + 3e6).toString('base64'))}); true`);
    const frames = await ev(`(async () => {
      const bin = atob(__parts.join('')); __parts = null; const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(u.buffer);
      const L = buf.getChannelData(0), R = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0), pcm = new Float32Array(L.length * 2);
      for (let i = 0; i < L.length; i++) { pcm[2 * i] = L[i]; pcm[2 * i + 1] = R[i]; }
      window.__pcm = new Uint8Array(pcm.buffer); return L.length; })()`);
    const fd = fs.openSync(outFile, 'w');
    try {
      for (let o = 0; o < frames * 8; o += 3e6) {
        const b64 = await ev(`(() => { const s = __pcm.subarray(${o}, ${o + 3e6}); let r = ''; for (let i = 0; i < s.length; i += 0x8000) r += String.fromCharCode.apply(null, s.subarray(i, i + 0x8000)); return btoa(r); })()`);
        fs.writeSync(fd, Buffer.from(b64, 'base64'));
      }
    } finally { fs.closeSync(fd); }
    return frames / 48000;
  } finally { close(); }
}

// Plage jouée et découpage en images, communs au chef d'orchestre et aux tranches.
function maniaLayout(job, meta) {
  const fps = job.fps || 60, rate = meta.rate;
  const a = job.clip?.start > 0 ? job.clip.start : meta.start - 1500 * rate, b = job.clip?.end > 0 ? job.clip.end : meta.end + 1500 * rate;
  const G = Math.max(1, (b - a) / rate / 1000), I = job.scenes?.intro || 0, O = job.scenes?.outro || 0;
  const nI = Math.round(I * fps), nG = Math.round(G * fps), nO = Math.round(O * fps);
  return { fps, rate, a, b, G, I, O, nI, nG, nO, all: nI + nG + nO };
}

// Une tranche : le jeu mania est dessiné entièrement ici (rien ne dépend de l'image précédente, hors widgets tosu).
async function segmentMain(jobFile, index) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8')), seg = job.segments[index];
  const M = await maniaData(job.replay, job.songs, job.cache), tl = new ManiaTimeline(M), meta = M.meta;
  const cfg = { ...maniaDefaults, ...job.mania };
  const [vw, vh] = job.size, s = vw / 1920, { fps, rate, a, nI, nG, nO } = maniaLayout(job, meta);
  const bgImg = meta.bg ? await loadImage(fs.readFileSync(path.join(meta.dir, meta.bg))).catch(() => null) : null;
  const assets = { backdrop: maniaBackdrop(bgImg, cfg.dim, (w, h) => createCanvas(w, h)), cover: bgImg };
  const widgets = job.tosu || [], external = widgets.filter(w => !dancingWidget(w.folder)), bundled = widgets.filter(w => dancingWidget(w.folder));
  const game = seg.oa < nI + nG && seg.ob > nI;
  let stage = game && external.length ? await openStage({ ...job, tosu: external }, vw, vh, s).catch(e => { log({ warn: 'Widgets tosu ignorés : ' + e.message }); return null; }) : null;
  // verre dépoli : seule la zone du widget (plus la portée du flou) est floutée, pas l'image entière
  const glass = external.filter(w => w.glass > 0).map(w => {
    const sc = (w.s || 1) * s, x = Math.max(0, Math.round(w.x * s)), y = Math.max(0, Math.round(w.y * s));
    const r = { x, y, w: Math.min(vw - x, Math.round(w.w * sc)), h: Math.min(vh - y, Math.round(w.h * sc)), r: w.glass * sc, blur: (w.glassBlur || 18) * sc };
    const pad = Math.ceil(r.blur * 3) + 2;
    r.sx = Math.max(0, r.x - pad); r.sy = Math.max(0, r.y - pad); r.sw = Math.min(vw, r.x + r.w + pad) - r.sx; r.sh = Math.min(vh, r.y + r.h + pad) - r.sy;
    return r;
  }).filter(r => r.w > 8 && r.h > 8);
  for (const r of glass) r.tmp = createCanvas(r.sw, r.sh);
  const cv = createCanvas(vw, vh), g = cv.getContext('2d');
  const msgsAt = t => { const { st, meta: m } = maniaTosu(tl.at(t), M); return tosuMessages(st, { ...m, mods: meta.mods.join('') }, {}); };
  if (stage && seg.oa > nI) for (let i = Math.max(nI, seg.oa - Math.round(fps * 2)); i < seg.oa; i++) {
    const j = i - nI; if (j % 2 === 0) await stage.feed(j * 1000 / fps, msgsAt(a + j / fps * 1000 * rate)).catch(() => {});
  }
  let shot = null;
  const draw = async i => {
    g.setTransform(s, 0, 0, s, 0, 0);
    if (i < nI) drawManiaIntro(g, M, i / Math.max(1, nI), cfg, assets);
    else if (i >= nI + nG) drawManiaResults(g, M, (i - nI - nG) / Math.max(1, nO), cfg, assets);
    else {
      const j = i - nI, t = a + j / fps * 1000 * rate;
      drawMania(g, M, tl, t, cfg, assets);
      if (widgets.length) {
        const msgs = msgsAt(t);
        if (bundled.length) drawDancingWidgets(g, bundled, msgs);
        g.setTransform(1, 0, 0, 1, 0, 0);
        for (const r of glass) {                                  // verre dépoli : le jeu derrière le widget est flouté
          const tg = r.tmp.getContext('2d'); tg.clearRect(0, 0, r.sw, r.sh); tg.filter = `blur(${r.blur}px)`; tg.drawImage(cv, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh); tg.filter = 'none';
          g.save(); g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, r.r); g.clip(); g.drawImage(r.tmp, r.x - r.sx, r.y - r.sy, r.w, r.h, r.x, r.y, r.w, r.h); g.restore();
        }
        if (stage) {
          if (j % 2 === 0 || !shot) {
            try { shot = await stage.frame(j * 1000 / fps, msgs); }
            catch (e) { log({ warn: 'Capture des widgets interrompue : ' + e.message }); stage.close(); stage = null; shot = null; }
          }
          if (shot) g.drawImage(shot.img, shot.x, shot.y);
        }
      }
    }
    return Buffer.from(g.getImageData(0, 0, vw, vh).data.buffer);
  };
  const n = seg.ob - seg.oa;
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${vw}x${vh}`, '-r', String(fps), '-i', 'pipe:0',
    '-filter_complex', '[0:v]format=yuv420p[v]', '-map', '[v]', '-an', ...encoderArgsBase(job), '-frames:v', String(n), '-f', 'mpegts', seg.file];
  try { await pipeFrames(job.ffmpeg, args, n, k => draw(seg.oa + k), k => { if (k % 15 === 0 || k === n) log({ frame: k }); }); }
  finally { stage?.close(); }
}

async function main() {
  const jobFile = path.resolve(process.argv[2]), job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const t0 = Date.now();
  const M = await maniaData(job.replay, job.songs, job.cache), meta = M.meta;
  const L = maniaLayout(job, meta), { a, b, G, I, O, nI, nG, rate, all } = L;

  // Musique : décodée par Chromium pendant le rendu des tranches, recalée sur la plage, accélérée (DT/NC) ou ralentie (HT).
  const audioFile = meta.audio && path.join(meta.dir, meta.audio);
  const pcm = path.join(os.tmpdir(), `dancing-mania-${process.pid}.pcm`);
  const audio = audioFile && fs.existsSync(audioFile) ? decodeAudio(audioFile, pcm).then(() => true, e => { log({ warn: 'Musique ignorée : ' + e.message }); return false; }) : Promise.resolve(false);

  // Rendu en tranches parallèles (segments.mjs), recollées sans réencodage.
  const workers = workerCount(job), base = jobFile.replace(/\.json$/, '');
  const segments = [];
  if (nI > 0) segments.push({ oa: 0, ob: nI });
  for (const [oa, ob] of splitRange(nI, nI + nG, workers * 2, { min: Math.round(L.fps * 5) })) segments.push({ oa, ob });
  if (all > nI + nG) segments.push({ oa: nI + nG, ob: all });
  segments.forEach((sg, k) => { sg.file = `${base}.part${k}.ts`; });
  const segJob = base + '.segments.json', list = base + '.parts.txt';
  fs.writeFileSync(segJob, JSON.stringify({ ...job, segments }));
  const clean = () => { for (const f of [segJob, list, pcm, ...segments.map(sg => sg.file)]) fs.rmSync(f, { force: true }); };
  try {
    log({ info: `Rendu en ${segments.length} tranches, ${Math.min(workers, segments.length)} en parallèle` });
    await runSegments(segments, workers, i => spawn(process.execPath, [fileURLToPath(import.meta.url), '--segment', segJob, String(i)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }), {
      onProgress: (p, n) => log({ progress: p * 0.97, frame: n, total: all }),
      onLine: o => log(o),
    });
    writeConcatList(list, segments.map(sg => sg.file));
    const inputs = ['-f', 'concat', '-safe', '0', '-i', list];
    let fc = '', amap = ['-an'];
    if (await audio) {
      inputs.push('-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', pcm);
      const start = a / 1000, dur = (b - a) / 1000 + O * rate;
      const pre = start < 0 ? `adelay=${Math.round(-start * 1000)}:all=1,` : `atrim=start=${start.toFixed(3)},asetpts=PTS-STARTPTS,`;
      const tempo = rate !== 1 ? `atempo=${rate},` : '';
      fc = `[1:a]${pre}atrim=duration=${dur.toFixed(3)},${tempo}afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, G + O - 1.5).toFixed(3)}:d=1.5,volume=${job.volume ?? 1},adelay=${Math.round(I * 1000)}:all=1[a]`;
      amap = ['-map', '[a]', '-c:a', 'aac', '-b:a', '256k'];
    }
    const tag = /hevc|265/.test(job.encoder || '') ? ['-tag:v', 'hvc1'] : [];
    await runFfmpeg(job.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, ...(fc ? ['-filter_complex', fc] : []), '-map', '0:v', '-c:v', 'copy', ...tag, ...amap, '-t', String(I + G + O), '-movflags', '+faststart', job.out]);
  } catch (e) { await audio.catch(() => {}); clean(); throw e; }
  clean();
  log({ done: true, file: job.out, seconds: (Date.now() - t0) / 1000 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2] === '--segment' ? segmentMain(process.argv[3], Number(process.argv[4])) : main();
  run.catch(e => { log({ error: e.message || String(e) }); process.exit(1); });
}
