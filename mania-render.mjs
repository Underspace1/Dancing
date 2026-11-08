// Rendu vidéo d'un replay osu!mania (danser ne gère que le standard) : node mania-render.mjs <job.json>
// job : { replay, songs, cache, out, ffmpeg, size, fps, encoder, crf, mania, clip:{start,end} (ms de map),
//         scenes:{intro, outro} (s), volume, tosu, stageUrl }
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
import { chromium, openStage, encoderArgs } from './compose.mjs';

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

async function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const t0 = Date.now();
  const M = await maniaData(job.replay, job.songs, job.cache), tl = new ManiaTimeline(M), meta = M.meta;
  const cfg = { ...maniaDefaults, ...job.mania };
  const [vw, vh] = job.size, fps = job.fps || 60, s = vw / 1920, rate = meta.rate;
  const bgImg = meta.bg ? await loadImage(fs.readFileSync(path.join(meta.dir, meta.bg))).catch(() => null) : null;
  const assets = { backdrop: maniaBackdrop(bgImg, cfg.dim, (w, h) => createCanvas(w, h)), cover: bgImg };

  // Plage jouée, en temps de map (ms).
  const a = job.clip?.start > 0 ? job.clip.start : meta.start - 1500 * rate, b = job.clip?.end > 0 ? job.clip.end : meta.end + 1500 * rate;
  const G = Math.max(1, (b - a) / rate / 1000), I = job.scenes?.intro || 0, O = job.scenes?.outro || 0;
  const nI = Math.round(I * fps), nG = Math.round(G * fps), nO = Math.round(O * fps), all = nI + nG + nO;

  // Musique : décodée par Chromium, recalée sur la plage, accélérée (DT/NC) ou ralentie (HT) sans changer la hauteur.
  const inputs = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${vw}x${vh}`, '-r', String(fps), '-i', 'pipe:0'];
  let audio = ['-an'], pcm = null, fc = '[0:v]format=yuv420p[v]';
  const audioFile = meta.audio && path.join(meta.dir, meta.audio);
  if (audioFile && fs.existsSync(audioFile)) {
    try {
      pcm = path.join(os.tmpdir(), `dancing-mania-${process.pid}.pcm`);
      await decodeAudio(audioFile, pcm);
      inputs.push('-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', pcm);
      const start = a / 1000, dur = (b - a) / 1000 + O * rate;
      const pre = start < 0 ? `adelay=${Math.round(-start * 1000)}:all=1,` : `atrim=start=${start.toFixed(3)},asetpts=PTS-STARTPTS,`;
      const tempo = rate !== 1 ? `atempo=${rate},` : '';
      fc += `;[1:a]${pre}atrim=duration=${dur.toFixed(3)},${tempo}afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, G + O - 1.5).toFixed(3)}:d=1.5,volume=${job.volume ?? 1},adelay=${Math.round(I * 1000)}:all=1[a]`;
      audio = ['-map', '[a]', '-c:a', 'aac', '-b:a', '256k'];
    } catch (e) { log({ warn: 'Musique ignorée : ' + e.message }); pcm = null; }
  }
  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[v]', ...audio, ...encoderArgs(job), '-t', String(I + G + O), '-movflags', '+faststart', job.out];
  const ff = spawn(job.ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '', dead = false; ff.stderr.on('data', d => err = (err + d).slice(-4000));
  ff.stdin.on('error', () => { dead = true; });
  const closed = new Promise(r => ff.on('close', c => { dead = true; r(c); }));

  const widgets = job.tosu || [], external = widgets.filter(w => !dancingWidget(w.folder)), bundled = widgets.filter(w => dancingWidget(w.folder));
  let stage = external.length ? await openStage({ ...job, tosu: external }, vw, vh, s).catch(e => { log({ warn: 'Widgets tosu ignorés : ' + e.message }); return null; }) : null;
  const glass = external.filter(w => w.glass > 0).map(w => {
    const sc = (w.s || 1) * s, x = Math.max(0, Math.round(w.x * s)), y = Math.max(0, Math.round(w.y * s));
    return { x, y, w: Math.min(vw - x, Math.round(w.w * sc)), h: Math.min(vh - y, Math.round(w.h * sc)), r: w.glass * sc, blur: (w.glassBlur || 18) * sc };
  }).filter(r => r.w > 8 && r.h > 8);
  const tmp = glass.length ? createCanvas(vw, vh) : null;
  const cv = createCanvas(vw, vh), g = cv.getContext('2d');
  let shot = null;
  for (let i = 0; i < all && !dead; i++) {
    g.setTransform(s, 0, 0, s, 0, 0);
    if (i < nI) drawManiaIntro(g, M, i / Math.max(1, nI), cfg, assets);
    else if (i >= nI + nG) drawManiaResults(g, M, (i - nI - nG) / Math.max(1, nO), cfg, assets);
    else {
      const j = i - nI, t = a + j / fps * 1000 * rate;
      drawMania(g, M, tl, t, cfg, assets);
      if (widgets.length) {
        const { st, meta: m } = maniaTosu(tl.at(t), M), msgs = tosuMessages(st, { ...m, mods: meta.mods.join('') }, {});
        if (bundled.length) drawDancingWidgets(g, bundled, msgs);
        g.setTransform(1, 0, 0, 1, 0, 0);
        for (const r of glass) {                                  // verre dépoli : le jeu derrière le widget est flouté
          const tg = tmp.getContext('2d'); tg.clearRect(0, 0, vw, vh); tg.filter = `blur(${r.blur}px)`; tg.drawImage(cv, 0, 0); tg.filter = 'none';
          g.save(); g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, r.r); g.clip(); g.drawImage(tmp, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h); g.restore();
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
    if (!ff.stdin.write(Buffer.from(g.getImageData(0, 0, vw, vh).data.buffer))) await Promise.race([new Promise(r => ff.stdin.once('drain', r)), closed]);
    if (i % 30 === 0) log({ progress: i / all, frame: i, total: all });
  }
  ff.stdin.end();
  stage?.close();
  const code = await closed;
  if (pcm) fs.rmSync(pcm, { force: true });
  if (code !== 0) { log({ error: 'ffmpeg: ' + err.trim() }); process.exit(1); }
  log({ done: true, file: job.out, seconds: (Date.now() - t0) / 1000 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { log({ error: e.message || String(e) }); process.exit(1); });
