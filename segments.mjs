// Rendu en segments parallèles : la vidéo finale est découpée en tranches rendues en même temps (un processus Node
// et un ffmpeg par tranche), puis recollées sans réencodage. Un seul ffmpeg enchaîne fusion de l'overlay et encodage
// sur un seul fil ; plusieurs tranches occupent tous les cœurs (et l'encodeur GPU) pendant tout le rendu.
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';

// Nombre de tranches rendues en même temps. x264/x265 utilisent déjà plusieurs cœurs chacun : on en garde moins.
// Les encodeurs GPU laissent le processeur libre pour l'overlay ; NVENC limite les sessions simultanées sur certains pilotes.
export function workerCount(job = {}) {
  const forced = Number(job.workers) > 0 ? Number(job.workers) : Number(process.env.DANCING_WORKERS) > 0 ? Number(process.env.DANCING_WORKERS) : 0;
  if (forced) return Math.max(1, Math.min(16, Math.floor(forced)));
  const cores = os.availableParallelism?.() || os.cpus().length || 1, enc = String(job.encoder || 'libx264');
  if (/nvenc/.test(enc)) return Math.max(1, Math.min(3, Math.ceil(cores / 2)));
  if (/amf|qsv/.test(enc)) return Math.max(1, Math.min(4, Math.ceil(cores / 2)));
  return Math.max(1, Math.min(6, Math.ceil(cores / 3)));
}

// Découpe [a, b) en au plus `parts` tranches de longueur multiple de `align` (sauf la dernière), d'au moins `min` images.
export function splitRange(a, b, parts, { align = 1, min = 1 } = {}) {
  const n = b - a; if (n <= 0) return [];
  const steps = Math.ceil(n / align), count = Math.max(1, Math.min(parts, Math.floor(n / Math.max(1, min)) || 1, steps));
  const out = [];
  for (let k = 0, prev = a; k < count; k++) {
    const end = k === count - 1 ? b : a + Math.round(steps * (k + 1) / count) * align;
    if (end > prev) out.push([prev, Math.min(b, end)]);
    prev = Math.min(b, end);
  }
  return out;
}

const gcd = (a, b) => b ? gcd(b, a % b) : a;
// Nombre d'images d'overlay par pas où l'overlay et la vidéo danser tombent ensemble sur une image (0 : jamais alignés).
export function alignStep(videoFps, overlayFps) {
  if (!Number.isInteger(videoFps) || !Number.isInteger(overlayFps) || videoFps <= 0 || overlayFps <= 0) return 0;
  return overlayFps / gcd(videoFps, overlayFps);
}

// Lance les tranches (les plus longues d'abord) avec au plus `workers` processus à la fois.
// start(index) renvoie le processus enfant ; ses lignes JSON { frame } font avancer la progression.
export function runSegments(segments, workers, start, { onProgress, onLine } = {}) {
  const done = new Array(segments.length).fill(0), size = segments.map(s => s.ob - s.oa), total = size.reduce((a, b) => a + b, 0) || 1;
  const queue = segments.map((_, i) => i).sort((x, y) => size[y] - size[x]);
  const live = new Set();
  let failed = null;
  const killAll = () => { for (const p of live) try { p.kill(); } catch { } };
  process.once('exit', killAll);
  return new Promise((resolve, reject) => {
    const next = () => {
      if (failed) return;
      if (!queue.length) { if (!live.size) { process.off('exit', killAll); resolve(); } return; }
      const i = queue.shift(), p = start(i); live.add(p);
      let buf = '', err = '', error = null;
      p.stdout.on('data', d => {
        buf += d; let k;
        while ((k = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1); if (!line) continue;
          let o; try { o = JSON.parse(line); } catch { onLine?.({ warn: line }); continue; }
          if (o.frame != null) { done[i] = Math.min(size[i], o.frame); onProgress?.(done.reduce((a, b) => a + b, 0) / total, done.reduce((a, b) => a + b, 0)); }
          else if (o.error) error = o.error;
          else onLine?.(o);
        }
      });
      p.stderr.on('data', d => { err = (err + d).slice(-4000); });
      p.on('error', e => { error ||= e.message; });
      p.on('close', code => {
        live.delete(p);
        if (failed) return;
        if (code !== 0) { failed = Error(error || err.trim() || `tranche ${i + 1} arrêtée (code ${code})`); killAll(); process.off('exit', killAll); return reject(failed); }
        done[i] = size[i]; next();
      });
    };
    for (let k = 0; k < Math.max(1, workers); k++) next();
  });
}

// Liste du démuxeur concat de ffmpeg (chemins absolus, apostrophes échappées).
export function writeConcatList(file, parts) {
  fs.writeFileSync(file, 'ffconcat version 1.0\n' + parts.map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n');
}

// Envoie `count` images RGBA produites par produce(k) dans un ffmpeg ; renvoie quand ffmpeg a fini.
export async function pipeFrames(ffmpeg, args, count, produce, onFrame) {
  const ff = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let err = '', dead = false; ff.stderr.on('data', d => err = (err + d).slice(-4000));
  ff.stdin.on('error', () => { dead = true; });
  const closed = new Promise(r => { ff.on('close', c => { dead = true; r(c); }); ff.on('error', e => { err += e.message; dead = true; r(-1); }); });
  for (let k = 0; k < count && !dead; k++) {
    const buf = await produce(k);
    if (!ff.stdin.write(buf)) await Promise.race([new Promise(r => ff.stdin.once('drain', r)), closed]);
    onFrame?.(k + 1);
  }
  ff.stdin.end();
  const code = await closed;
  if (code !== 0) throw Error('ffmpeg: ' + err.trim());
}

export function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = ''; ff.stderr.on('data', d => err = (err + d).slice(-4000));
    ff.on('error', reject);
    ff.on('close', c => c === 0 ? resolve() : reject(Error('ffmpeg: ' + err.trim())));
  });
}

// Plage de couleurs et espace colorimétrique d'une vidéo, lus dans la sortie de « ffmpeg -i ».
// Toutes les tranches reçoivent les mêmes étiquettes : leurs en-têtes H.264/H.265 sont alors identiques et se recollent.
export function probeColor(ffmpeg, file) {
  return new Promise(resolve => {
    const ff = spawn(ffmpeg, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = ''; ff.stderr.on('data', d => err += d);
    ff.on('error', () => resolve(null));
    ff.on('close', () => resolve(parseColor(err)));
  });
}
export function parseColor(text) {
  const m = String(text).match(/Video: [^\n]*?, (?:yuv|nv)\w*\(([^)]*)\)/);
  if (!m) return null;
  const parts = m[1].split(/,\s*/).filter(p => !/progressive|interlaced|top first|bottom first/.test(p));
  const out = {};
  if (/^(tv|pc)$/.test(parts[0] || '')) out.range = parts.shift();
  const c = (parts[0] || '').split('/');
  const ok = v => v && /^[\w-]+$/.test(v) && v !== 'unknown' && v !== 'reserved';
  if (ok(c[0])) out.colorspace = c[0];
  if (ok(c[1] || c[0])) out.primaries = c[1] || c[0];
  if (ok(c[2] || c[0])) out.trc = c[2] || c[0];
  return Object.keys(out).length ? out : null;
}
export function setparams(color) {
  if (!color) return '';
  const o = [];
  if (color.range) o.push(`range=${color.range}`);
  if (color.primaries) o.push(`color_primaries=${color.primaries}`);
  if (color.trc) o.push(`color_trc=${color.trc}`);
  if (color.colorspace) o.push(`colorspace=${color.colorspace}`);
  return o.length ? ',setparams=' + o.join(':') : '';
}
