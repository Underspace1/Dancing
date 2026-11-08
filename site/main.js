// Site Dancing! : apparitions au défilement, capture inclinée qui se redresse, bandeaux liés à la vitesse de défilement.
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Apparitions (titres qui montent ligne par ligne, textes qui glissent)
const targets = document.querySelectorAll('.reveal, .big, .section-title, .mega, .hero-title');
if (calm || !('IntersectionObserver' in window)) targets.forEach(el => el.classList.add('in'));
else {
  const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
    { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
  targets.forEach(el => io.observe(el));
}

// Compteurs qui défilent quand ils apparaissent
const counters = document.querySelectorAll('[data-count]');
const countIo = 'IntersectionObserver' in window && new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  countIo.unobserve(e.target);
  const el = e.target, end = +el.dataset.count, t0 = performance.now();
  const tick = now => { const p = Math.min(1, (now - t0) / 1400), v = Math.round(end * (1 - (1 - p) ** 4)); el.textContent = v; if (p < 1) requestAnimationFrame(tick); };
  calm ? (el.textContent = end) : requestAnimationFrame(tick);
}), { threshold: 0.6 });
counters.forEach(el => countIo ? countIo.observe(el) : (el.textContent = el.dataset.count));

// Captures qui alternent (overlays mania, intro / résultats)
document.querySelectorAll('.shot.swap').forEach((el, i) => { if (!calm) setTimeout(() => setInterval(() => el.classList.toggle('flipped'), 2600), i * 900); });

if (!calm) {
  const hero = document.getElementById('heroShot');
  const shots = [...document.querySelectorAll('.shot')];
  const marquees = [...document.querySelectorAll('.marquee')].map(m => ({ el: m, track: m.querySelector('.track'), speed: +m.dataset.speed || 60, x: 0 }));
  let lastY = scrollY, boost = 0, last = performance.now();

  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const vh = innerHeight;

    // Hero : la capture est couchée en arrivant et se redresse quand elle monte vers le centre
    const r = hero.getBoundingClientRect(), t = Math.min(1, Math.max(0, (r.top - vh * 0.18) / (vh * 0.62)));
    hero.style.setProperty('--t', t.toFixed(3));

    // Captures des fonctionnalités : rotation vers 0 et léger décalage selon la position à l'écran
    for (const s of shots) {
      const b = s.getBoundingClientRect(); if (b.bottom < -200 || b.top > vh + 200) continue;
      const k = ((b.top + b.height / 2) - vh / 2) / vh;                 // -1 en haut, +1 en bas
      const flip = s.closest('.flip') ? -1 : 1;
      s.querySelectorAll('img').forEach(img => { img.style.setProperty('--r', (k * 14 * flip).toFixed(2)); img.style.setProperty('--y', (k * 40).toFixed(1)); });
    }

    // Bandeaux : vitesse de base + élan donné par le défilement, qui retombe doucement
    const v = scrollY - lastY; lastY = scrollY;
    boost += (Math.min(60, Math.abs(v)) * 9 - boost) * 0.12;
    for (const m of marquees) {
      const half = m.track.scrollWidth / 2; if (!half) continue;
      m.x -= (m.speed + Math.sign(m.speed) * boost) * dt;
      if (m.x <= -half) m.x += half; else if (m.x > 0) m.x -= half;
      m.track.style.transform = `translate3d(${m.x.toFixed(1)}px,0,0)`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// Vidéo : lecture quand elle est visible, son à la demande, cadre qui grandit au défilement
const reel = document.getElementById('reel');
if (reel) {
  const video = reel.querySelector('video'), sound = reel.querySelector('.sound');
  sound.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted) video.play().catch(() => {});
    sound.setAttribute('aria-pressed', String(!video.muted));
    sound.querySelector('.txt').textContent = video.muted ? 'Activer le son' : 'Couper le son';
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { if (e.isIntersecting && !calm) video.play().catch(() => {}); else video.pause(); }, { threshold: 0.35 }).observe(reel);
  if (calm) { reel.style.setProperty('--s', 0); video.controls = true; }
  else {
    const grow = () => { const b = reel.getBoundingClientRect(), s = Math.min(1, Math.max(0, (b.top - innerHeight * 0.12) / (innerHeight * 0.7))); reel.style.setProperty('--s', s.toFixed(3)); requestAnimationFrame(grow); };
    requestAnimationFrame(grow);
  }
}
