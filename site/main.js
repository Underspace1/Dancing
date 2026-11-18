// Site Dancing! : image démontée en couches au défilement, cartes empilées, lecteur vidéo.
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);

// Boutons « Télécharger » : lien direct vers l'installateur de la dernière release GitHub et numéro de version.
// Sans réponse de GitHub, ils mènent à la page de la release, où le fichier est en un clic.
fetch('https://api.github.com/repos/Underspace1/Dancing/releases/latest').then(r => r.ok ? r.json() : null).then(rel => {
  const exe = rel?.assets?.find(a => /setup.*\.exe$/i.test(a.name)); if (!exe) return;
  document.querySelectorAll('[data-dl]').forEach(a => { a.href = exe.browser_download_url; });
  document.querySelectorAll('[data-ver]').forEach(s => { s.textContent = `${rel.tag_name} · ${Math.round(exe.size / 1048576)} Mo`; });
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

// Cartes empilées : une carte recouverte recule et s'assombrit.
const cards = [...document.querySelectorAll('.card')];
function deck() {
  for (let i = 0; i < cards.length - 1; i++) {
    const a = cards[i].getBoundingClientRect(), b = cards[i + 1].getBoundingClientRect();
    cards[i].style.setProperty('--d', clamp(1 - (b.top - a.top) / Math.max(1, a.height)).toFixed(3));
  }
}

let ticking = false;
const frame = () => { ticking = false; anatomy(); if (!calm) deck(); };
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
