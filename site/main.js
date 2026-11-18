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
    el.style.filter = `drop-shadow(0 26px 30px rgba(0, 0, 0, .55))${dim ? ` brightness(${(1 - Math.min(dim, .6)).toFixed(3)})` : ''}`;
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

// Fenêtre du logiciel pendant un rendu (exemple) : le journal s'écrit au fil des chapitres, la progression suit.
// Classes des lignes : p = commande, d = danser, o = overlay, f = ffmpeg, ok = terminé.
const aw = (() => {
  const box = document.getElementById('awLines'); if (!box) return null;
  const pct = document.getElementById('awPct'), eta = document.getElementById('awEta'), bar = document.getElementById('awBar'), state = document.getElementById('awState');
  const steps = [...document.querySelectorAll('.aw-steps li')], now = document.getElementById('awNow');
  const LOG = [
    [['p', '> danser -settings=replay-hud-v2 -replay="xi - over the top.osr" -record -quickstart'], ['d', 'danser › base de maps : 4 812 maps chargées'], ['d', 'danser › replay : BTMCfanboy · HD DT · 98,42 %']],
    [['d', 'danser › enregistrement 1920 × 1080 · 60 i/s · flou ×8'], ['d', 'danser › export HUD activé (données de l’overlay)']],
    [['d', 'danser › cœurs : cercles, sliders, curseur, fond de la map'], ['d', 'danser › flou de mouvement : 8 sous-images par image']],
    [['d', 'danser › mémoire vidéo : textures du skin et de la map chargées'], ['d', 'danser › sous-images du flou fusionnées sur la carte']],
    [['f', 'ffmpeg › encodeur h264_nvenc · CQ 12 · preset p1'], ['f', 'ffmpeg › frame= 5120  fps=212  bitrate=48,2 Mb/s']],
    [['d', 'danser › 9 600 images enregistrées'], ['ok', 'danser › rendu du jeu terminé']],
    [['o', 'overlay › rendu en 6 tranches, 4 en parallèle'], ['o', 'overlay › tranches 6/6 terminées'], ['f', 'ffmpeg › recollage sans réencodage + mixage audio'], ['ok', '✓ vidéo prête : videos/BTMCfanboy - over the top.mp4']],
  ];
  // progression globale visée à la fin de chaque chapitre, et étape du pipeline
  const GOAL = [2, 6, 32, 55, 74, 88, 100], STEP = [0, 0, 0, 0, 0, 0, 1];
  let chap = -1, queue = [], prog = 0, live = null, timer = 0, typing = 0, last = 0;
  const add = ([c, t], anim = true) => { const d = document.createElement('div'); d.className = c; d.textContent = t; if (!anim) d.style.animation = 'none'; box.insertBefore(d, live); while (box.children.length > 9) box.firstChild.remove(); };
  const liveLine = () => { if (!live) { live = document.createElement('div'); live.className = 'cur'; box.appendChild(live); } return live; };
  const tick = () => {
    if (queue.length && !(typing++ % 4)) add(queue.shift());
    const t = performance.now(), dt = last ? Math.min(1, (t - last) / 1000) : .09; last = t;
    const goal = GOAL[chap] ?? 0; prog += (goal - prog) * (1 - Math.exp(-dt * 1.2)); if (Math.abs(goal - prog) < .05) prog = goal;
    const p = Math.min(100, prog);
    pct.textContent = Math.floor(p) + ' %'; bar.style.width = p.toFixed(1) + '%';
    const secs = Math.round((100 - p) * .62); eta.textContent = p >= 100 ? 'terminé en 1 min 02' : chap < 2 ? 'préparation…' : `reste ${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, '0')}`;
    const l = liveLine();
    if (p >= 100) { l.className = 'ok cur'; l.textContent = ''; }
    else if (chap >= 6) { const k = clamp((p - 88) / 12); l.className = 'o cur'; l.textContent = `overlay › tranches ${Math.min(6, 1 + Math.floor(k * 6))}/6 · ${Math.floor(k * 100)} %`; }
    else if (chap >= 2) { const dp = Math.min(100, Math.round(p / 88 * 100)); l.className = 'd cur'; l.textContent = `danser › Progress: ${dp}%, ETA: 00:${String(Math.round((100 - dp) * .5)).padStart(2, '0')}`; }
    else { l.className = 'p cur'; l.textContent = ''; }
    if (now) now.textContent = l.textContent || (box.lastChild?.previousSibling?.textContent ?? '');
    const st = p >= 100 ? 3 : STEP[chap] ?? 0;
    steps.forEach((li, i) => { li.classList.toggle('ok', i < st); li.classList.toggle('on', i === st); });
    state.textContent = p >= 100 ? 'Terminé' : chap < 2 ? 'Préparation' : 'Rendu en cours'; state.classList.toggle('done', p >= 100);
  };
  return {
    chapter(c) {
      if (c === chap) return;
      if (c < chap) {               // retour en arrière : journal reconstruit d'un coup
        box.textContent = ''; live = null; queue = []; LOG.slice(0, c + 1).flat().forEach(l => add(l, false)); prog = Math.min(prog, GOAL[c]);
      } else LOG.slice(chap + 1, c + 1).forEach(lines => queue.push(...lines));
      chap = c;
    },
    run(on) { if (on && !timer) { last = 0; timer = setInterval(tick, 90); } else if (!on && timer) { clearInterval(timer); timer = 0; } },
  };
})();

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
  if (c !== lastChap) { lastChap = c; gchap.forEach((li, i) => li.classList.toggle('on', i === c)); gpuSec.classList.toggle('deep', c >= 2); aw?.chapter(c); }
  { const r = gpuSec.getBoundingClientRect(); aw?.run(!calm && r.bottom > 0 && r.top < innerHeight); }
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
        el.classList.toggle('left', q.x > gpuStage.clientWidth * (innerWidth <= 900 ? .4 : .55));
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

// ---------- Presets : carrousel 3D (flèches, pastilles, clic, glisser, clavier, défilement auto) ----------
(() => {
  const cards = [...document.querySelectorAll('.pcard')], chips = [...document.querySelectorAll('.pchip')], box = document.getElementById('carousel');
  if (!cards.length) return;
  let cur = 0, auto = 0, hover = false;
  const show = i => {
    cur = (i + cards.length) % cards.length;
    cards.forEach((c, k) => { let d = k - cur; if (d > cards.length / 2) d -= cards.length; if (d < -cards.length / 2) d += cards.length;
      c.style.setProperty('--d', d); c.style.setProperty('--ad', Math.abs(d)); c.classList.toggle('on', d === 0); c.style.visibility = Math.abs(d) > 2 ? 'hidden' : ''; });
    chips.forEach((c, k) => c.classList.toggle('on', k === cur));
  };
  box.querySelector('.prev').addEventListener('click', () => show(cur - 1));
  box.querySelector('.next').addEventListener('click', () => show(cur + 1));
  cards.forEach((c, k) => c.addEventListener('click', () => show(k)));
  chips.forEach((c, k) => c.addEventListener('click', () => show(k)));
  box.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
  let x0 = null; box.addEventListener('pointerdown', e => { x0 = e.clientX; }); box.addEventListener('pointerup', e => { if (x0 != null && Math.abs(e.clientX - x0) > 40) show(cur + (e.clientX < x0 ? 1 : -1)); x0 = null; });
  box.addEventListener('pointerenter', () => { hover = true; }); box.addEventListener('pointerleave', () => { hover = false; });
  show(0);
  if (!calm && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => { clearInterval(auto); if (e.isIntersecting) auto = setInterval(() => { if (!hover) show(cur + 1); }, 4200); }).observe(box);
})();

// ---------- En un coup d'œil : mini visuels animés quand la grille est visible ----------
(() => {
  const combo = document.getElementById('bvCombo'), pp = document.getElementById('bvPp'), err = document.getElementById('bvErr');
  if (!combo) return;
  let timers = [], c = 427, p = 538;
  const start = () => {
    if (timers.length || calm) return;
    timers.push(setInterval(() => { c++; p += Math.random() < .5 ? 1 : 0; combo.textContent = c.toLocaleString('fr-FR'); pp.textContent = p; if (c > 999) c = 1; }, 140));
    timers.push(setInterval(() => {
      const t = document.createElement('i'); t.className = 't';
      const e = (Math.random() + Math.random() + Math.random() - 1.5) * 26; t.style.left = `calc(50% + ${e.toFixed(1)}%)`;
      err.appendChild(t); setTimeout(() => t.remove(), 1600);
    }, 160));
  };
  const stop = () => { timers.forEach(clearInterval); timers = []; };
  const cards = document.querySelectorAll('.bc, .eng');
  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } }), { threshold: .4 });
    cards.forEach(el => seen.observe(el));
    new IntersectionObserver(([e]) => e.isIntersecting ? start() : stop()).observe(document.querySelector('.bento'));
  } else { cards.forEach(el => el.classList.add('in')); start(); }
})();

// ---------- Éditeur : glisser les widgets, molette = taille, double-clic = position d'origine ----------
(() => {
  const frame = document.getElementById('edFrame'); if (!frame) return;
  const ws = [...frame.querySelectorAll('.ed-w')], info = document.getElementById('edInfo'), gv = frame.querySelector('.ed-guide.v'), gh = frame.querySelector('.ed-guide.h');
  const place = w => { w.style.left = w.dataset.cx + '%'; w.style.top = w.dataset.cy + '%'; w.style.width = (+w.dataset.w / 1920 * 100) + '%'; w.style.setProperty('--s', w.dataset.s); };
  const reset = w => { w.dataset.cx = w.dataset.x; w.dataset.cy = w.dataset.y; w.dataset.s = 1; place(w); };
  const say = w => { info.textContent = `${w.alt} · x ${Math.round(w.dataset.cx)} % · y ${Math.round(w.dataset.cy)} % · taille ${Math.round(w.dataset.s * 100)} %`; };
  ws.forEach(w => {
    reset(w);
    w.addEventListener('pointerdown', e => {
      e.preventDefault(); w.setPointerCapture(e.pointerId); w.classList.add('drag'); frame.appendChild(w);
      const r = frame.getBoundingClientRect(), ox = e.clientX - (r.left + r.width * w.dataset.cx / 100), oy = e.clientY - (r.top + r.height * w.dataset.cy / 100);
      const move = ev => {
        let x = (ev.clientX - ox - r.left) / r.width * 100, y = (ev.clientY - oy - r.top) / r.height * 100;
        x = clamp(x, 3, 97); y = clamp(y, 4, 92);
        const sx = Math.abs(x - 50) < 1.5, sy = Math.abs(y - 50) < 2;       // aimantation au centre
        if (sx) x = 50; if (sy) y = 50; gv.classList.toggle('on', sx); gh.classList.toggle('on', sy);
        w.dataset.cx = x; w.dataset.cy = y; place(w); say(w);
      };
      const up = () => { w.classList.remove('drag'); gv.classList.remove('on'); gh.classList.remove('on'); w.removeEventListener('pointermove', move); w.removeEventListener('pointerup', up); };
      w.addEventListener('pointermove', move); w.addEventListener('pointerup', up);
    });
    w.addEventListener('wheel', e => { e.preventDefault(); w.dataset.s = clamp(+w.dataset.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08), .6, 1.8).toFixed(3); place(w); say(w); }, { passive: false });
    w.addEventListener('dblclick', () => { reset(w); say(w); });
  });
  document.getElementById('edReset').addEventListener('click', () => { ws.forEach(reset); info.textContent = 'Disposition d’origine'; });
})();

// ---------- 3 étapes : la ligne se remplit au défilement, chaque étape s'allume ----------
const s3 = document.querySelector('.s3'), s3Fill = document.getElementById('s3Fill'), s3c = [...document.querySelectorAll('.s3c')];
function steps3() {
  if (!s3) return;
  const r = s3.getBoundingClientRect(), f = calm ? 1 : clamp((innerHeight * .75 - r.top) / (r.height + innerHeight * .1));
  s3Fill.parentElement.style.setProperty('--f', f.toFixed(3));
  s3c.forEach((c, i) => c.classList.toggle('on', f >= i / (s3c.length - 1) - .02));
}

let ticking = false;
const frame = () => { ticking = false; anatomy(); gpu(); exportScene(); steps3(); if (!calm) pile(); };
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
