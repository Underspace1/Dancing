// Site Dancing! : image démontée en couches au défilement, cartes empilées, lecteur vidéo.
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);

// Boutons « Télécharger » : lien direct vers l'installateur de la dernière release GitHub et numéro de version.
// Sans réponse de GitHub, ils mènent à la page de la release, où le fichier est en un clic.
fetch('https://api.github.com/repos/Underspace1/Dancing/releases/latest').then(r => r.ok ? r.json() : null).then(rel => {
  const exe = rel?.assets?.find(a => /setup.*\.exe$/i.test(a.name)); if (!exe) return;
  document.querySelectorAll('[data-dl]').forEach(a => { a.href = exe.browser_download_url; });
  document.querySelectorAll('[data-ver]').forEach(s => { s.textContent = `${rel.tag_name} · ${Math.round(exe.size / 1048576)} Mo`; s.hidden = false; });
}).catch(() => {});

// Apparitions discrètes (ajoutées seulement si le script tourne : sans lui, tout reste visible)
if (!calm && 'IntersectionObserver' in window) {
  const els = document.querySelectorAll('.section-head, .spec-list > div, .faq details, .final > *');
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
  els.forEach(el => { el.classList.add('fade'); io.observe(el); });
}

// Anatomie : l'image est à plat, se démonte en trois couches (replay, overlay, widgets), chaque couche est
// présentée tour à tour, puis tout se recolle pour l'export.
const anat = document.getElementById('anatomie'), stack = document.getElementById('stack');
const steps = [...document.querySelectorAll('.steps li')], tc = document.getElementById('tc');
let lastStep = -1;
function anatomy() {
  const r = anat.getBoundingClientRect(), run = r.height - innerHeight;
  const p = calm ? 0.5 : clamp(-r.top / Math.max(1, run));
  const open = smooth(clamp((p - 0.06) / 0.24)) * (1 - smooth(clamp((p - 0.8) / 0.16)));
  const w = stack.offsetWidth;
  stack.style.setProperty('--rx', `${(56 * open).toFixed(2)}deg`);
  stack.style.setProperty('--rz', `${(-34 * open).toFixed(2)}deg`);
  stack.style.setProperty('--gap', (w * 0.16 * open).toFixed(1));
  stack.style.setProperty('--sc', (1 - 0.2 * open).toFixed(3));
  stack.style.setProperty('--x', open.toFixed(3));
  stack.parentElement.style.setProperty('--x', open.toFixed(3));
  const step = calm ? -1 : p < 0.38 ? 0 : p < 0.56 ? 1 : p < 0.74 ? 2 : 3;
  if (step !== lastStep) {
    lastStep = step;
    steps.forEach((li, i) => li.classList.toggle('on', calm || i === step));
    if (step >= 0 && step < 3 && !calm) stack.dataset.focus = step; else delete stack.dataset.focus;
  }
  // focus seulement quand les couches sont bien séparées
  if (stack.dataset.focus != null && open < 0.85) delete stack.dataset.focus;
  else if (step >= 0 && step < 3 && open >= 0.85 && stack.dataset.focus == null) stack.dataset.focus = step;
  if (tc) { const f = Math.round(6252 + p * 900); tc.textContent = `00:${String(Math.floor(f / 3600)).padStart(2, '0')}:${String(Math.floor(f / 60) % 60).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`; }
}

// Dossiers qui s'additionnent : chaque dossier tombe sur la pile avec un léger rebond, sa feuille sort ;
// les dossiers recouverts reculent, leur feuille rentre et ils s'empilent un peu de travers, onglets visibles.
const files = document.getElementById('fonctions'), sheets = [...document.querySelectorAll('.folder')];
const chapters = [...document.querySelectorAll('.chapters li')], chapNow = document.getElementById('chapNow');
const filesRun = () => files.offsetHeight - innerHeight;
const backOut = t => { const c = 1.35; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const TILT = [-1.2, 1.4, -0.8, 1.6, -1.4];
function pile() {
  const n = sheets.length, r = files.getBoundingClientRect();
  const raw = clamp(-r.top / Math.max(1, filesRun())) * (n - 1), seg = Math.min(n - 2, Math.floor(raw));
  const cur = raw >= n - 1 ? n - 1 : seg + clamp((raw - seg) / 0.6);
  const lift = innerWidth <= 900 ? 22 : 34;
  sheets.forEach((el, i) => {
    const d = cur - i;
    let ty = 0, sc = 1, rot = 0, dim = 0, out = 0;
    if (d < 0) { const e = clamp(d + 1), b = backOut(e); ty = (1 - b) * innerHeight * .95; rot = (1 - e) * 7 * (i % 2 ? 1 : -1); out = smooth(clamp((e - .55) / .45)); }
    else { const k = Math.min(d, 3); ty = -k * lift; sc = 1 - k * .045; rot = TILT[i % 5] * Math.min(1, d); dim = k * .2; out = 1 - smooth(clamp(d * 1.8)); }
    el.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    el.style.filter = dim ? `brightness(${(1 - Math.min(dim, .6)).toFixed(3)})` : '';
    el.style.visibility = d < -1 || d > 3.5 ? 'hidden' : '';
    el.style.zIndex = i;
    el.style.setProperty('--out', out.toFixed(3));
  });
  const now = Math.round(Math.max(0, cur));
  chapters.forEach((li, i) => { li.classList.toggle('on', i === now); li.querySelector('i').style.setProperty('--fill', i < now ? 1 : i === now ? clamp(raw - i + 1, 0, 1).toFixed(3) : 0); });
  if (chapNow) chapNow.textContent = String(now + 1).padStart(2, '0');
}
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
  const n = sheets.length, i = +b.dataset.go;
  if (calm) return sheets[i].scrollIntoView();
  scrollTo({ top: files.offsetTop + ((i ? i - 0.3 : 0) / (n - 1)) * filesRun() + 1, behavior: 'smooth' });
}));

// Sous le capot : la carte 3D (gpu3d.js, Three.js) est chargée quand la section approche, puis pilotée par le défilement.
const gpuSec = document.getElementById('capot'), gpuStage = document.getElementById('gpuStage');
const gchap = [...document.querySelectorAll('.gchap li')], gbars = [...document.querySelectorAll('.gpu-bars i')];
const callouts = Object.fromEntries([...document.querySelectorAll('.callout')].map(c => [c.dataset.for, c]));
const CHAP = [0, .08, .27, .41, .55, .69, .83, 1.01];     // début de chaque chapitre (progression de la section)
let gpu3d = null, lastChap = -1;
const gpuProgress = () => { const r = gpuSec.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };
function gpu() {
  if (!gpuSec) return;
  const p = gpuProgress();
  let c = 0; while (c < gchap.length - 1 && p >= CHAP[c + 1]) c++;
  if (c !== lastChap) { lastChap = c; gchap.forEach((li, i) => li.classList.toggle('on', i === c)); gpuSec.classList.toggle('deep', c >= 2); }
  gbars.forEach((b, i) => b.style.setProperty('--f', clamp((p - CHAP[i]) / (CHAP[i + 1] - CHAP[i])).toFixed(3)));
  if (gpu3d) { gpu3d.progress = p; const r = gpuSec.getBoundingClientRect(); gpu3d.setVisible(r.bottom > 0 && r.top < innerHeight); }
}
if (gpuSec) {
  const start = () => import('./gpu3d.js').then(({ mountGPU }) => {
    gpu3d = mountGPU(gpuStage, { calm });
    if (!gpu3d) throw Error('WebGL indisponible');
    gpu3d.progress = gpuProgress();
    gpu3d.onFrame = pts => {
      for (const [k, el] of Object.entries(callouts)) {
        const q = pts[k]; if (!q) continue;
        el.classList.toggle('on', q.on && q.front);
        el.classList.toggle('left', q.x > gpuStage.clientWidth * .55);
        el.style.transform = `translate3d(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0)`;
      }
    };
    gpu();
  }).catch(() => { gpuSec.classList.add('nogl'); gpuStage.remove(); });
  // mouvement réduit : pas de 3D, les chapitres s'affichent en liste
  if (calm) { gpuSec.classList.add('nogl'); gpuStage.remove(); }
  else if (!('IntersectionObserver' in window)) start();
  else { const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '150% 0px' }); io.observe(gpuSec); }
}

// Export : la tête de lecture parcourt la timeline (intro, partie, fin), puis l'export se remplit et devient le bouton.
const studio = document.getElementById('export');
const monImgs = [...document.querySelectorAll('.mon-view img')], playhead = document.getElementById('playhead');
const tcMon = document.getElementById('tcMon'), exportTxt = document.getElementById('exportTxt'), exportBtn = document.getElementById('exportBtn');
let lastScene = null;
function exportScene() {
  if (!studio) return;
  const r = studio.getBoundingClientRect(), p = calm ? .6 : clamp(-r.top / Math.max(1, r.height - innerHeight));
  const ph = calm ? .6 : clamp(p / .72);
  playhead.parentElement.style.setProperty('--ph', ph.toFixed(4));
  const scene = ph < .15 ? 'intro' : ph < .85 ? 'jeu' : 'fin';
  if (scene !== lastScene) { lastScene = scene; monImgs.forEach(im => im.classList.toggle('on', im.dataset.scene === scene)); }
  const f = Math.round(ph * 160 * 60); tcMon.textContent = `00:${String(Math.floor(f / 3600)).padStart(2, '0')}:${String(Math.floor(f / 60) % 60).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`;
  const e = calm ? 1 : clamp((p - .74) / .18);
  studio.classList.toggle('rendering', e < 1);
  exportBtn.style.setProperty('--ex', e.toFixed(3));
  exportTxt.textContent = e >= 1 ? 'Télécharger Dancing!' : e > 0 ? `Export en cours… ${Math.floor(e * 100)} %` : 'Exporter la vidéo';
}

let ticking = false;
const frame = () => { ticking = false; anatomy(); gpu(); exportScene(); if (!calm) pile(); };
const ask = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
addEventListener('scroll', ask, { passive: true });
addEventListener('resize', ask);
frame();

// Lecteur : lecture quand la vidéo est visible, son à la demande, barre de progression.
const reel = document.getElementById('reel');
if (reel) {
  const video = reel.querySelector('video'), sound = reel.querySelector('.sound');
  const bar = document.getElementById('reelProgress'), time = document.getElementById('reelTime');
  sound.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted) video.play().catch(() => {});
    sound.setAttribute('aria-pressed', String(!video.muted));
    sound.textContent = video.muted ? 'Activer le son' : 'Couper le son';
  });
  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    bar.style.width = `${(video.currentTime / video.duration * 100).toFixed(2)}%`;
    const s = Math.floor(video.currentTime); time.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });
  if (calm) video.controls = true;
  else if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { if (e.isIntersecting) video.play().catch(() => {}); else video.pause(); }, { threshold: 0.35 }).observe(reel);
}
