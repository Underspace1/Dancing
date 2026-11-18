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

// Pile de cartes : chaque carte monte et se pose devant ; les précédentes reculent vers le haut, rapetissent
// et s'assombrissent jusqu'à ne laisser voir que leur bord.
const files = document.getElementById('fonctions'), sheets = [...document.querySelectorAll('.sheet')];
const chapters = [...document.querySelectorAll('.chapters li')], chapNow = document.getElementById('chapNow');
const filesRun = () => files.offsetHeight - innerHeight;
function pile() {
  const n = sheets.length, r = files.getBoundingClientRect();
  // chaque carte arrive pendant les 60 % de son tronçon, puis reste posée
  const raw = clamp(-r.top / Math.max(1, filesRun())) * (n - 1), seg = Math.min(n - 2, Math.floor(raw));
  const cur = raw >= n - 1 ? n - 1 : seg + smooth(clamp((raw - seg) / 0.6));
  const lift = innerWidth <= 900 ? 12 : 16;
  sheets.forEach((el, i) => {
    const d = cur - i;
    let ty = 0, sc = 1, rx = 0, dim = 0, show = 1;
    if (d < 0) { const e = clamp(d + 1); ty = (1 - e) * innerHeight * .85; rx = (1 - e) * 14; sc = 1 + (1 - e) * .04; }
    else { const k = Math.min(d, 3); ty = -k * lift; sc = 1 - k * .05; dim = k * .22; show = 1 - clamp(d * 2); }
    el.style.transform = `perspective(1600px) translate3d(0, ${ty.toFixed(1)}px, 0) rotateX(${rx.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    el.style.filter = dim ? `brightness(${(1 - Math.min(dim, .7)).toFixed(3)})` : '';
    el.style.visibility = d < -1 || d > 3.5 ? 'hidden' : '';
    el.style.zIndex = i;
    el.querySelector('.sheet-copy').style.opacity = show.toFixed(3);
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

// Sous le capot : la carte s'ouvre en couches (capot, radiateur, encodeur, puce, mémoire, circuit), chaque pièce
// qui travaille pour le rendu s'allume tour à tour, puis la carte se referme.
const gpuSec = document.getElementById('capot'), gcard = document.getElementById('gcard');
const gsteps = [...document.querySelectorAll('.gsteps li')];
let lastPart = null;
function gpu() {
  if (!gpuSec) return;
  const r = gpuSec.getBoundingClientRect(), run = r.height - innerHeight;
  const p = calm ? 0.5 : clamp(-r.top / Math.max(1, run));
  const open = calm ? 1 : smooth(clamp((p - 0.04) / 0.2)) * (1 - smooth(clamp((p - 0.88) / 0.1)));
  const w = gcard.offsetWidth, narrow = innerWidth <= 900;
  gcard.style.setProperty('--rx', `${(58 * open).toFixed(2)}deg`);
  gcard.style.setProperty('--rz', `${(-32 * open).toFixed(2)}deg`);
  gcard.style.setProperty('--gap', (w * (narrow ? 0.11 : 0.09) * open).toFixed(1));
  gcard.style.setProperty('--sc', (1 - (narrow ? 0.12 : 0.2) * open).toFixed(3));
  gcard.style.setProperty('--x', open.toFixed(3));
  const k = calm ? -1 : p < 0.26 ? (open > 0.5 ? 0 : -1) : p < 0.44 ? 1 : p < 0.62 ? 2 : p < 0.88 ? 3 : -1;
  const idx = k < 0 ? (p < 0.26 ? 0 : 3) : k;
  const part = calm || open < 0.85 ? null : gsteps[k]?.dataset.part ?? null;
  if (part !== lastPart) { lastPart = part; if (part) gcard.dataset.part = part; else delete gcard.dataset.part; }
  gsteps.forEach((li, i) => li.classList.toggle('on', calm || i === idx));
}

let ticking = false;
const frame = () => { ticking = false; anatomy(); gpu(); if (!calm) pile(); };
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
