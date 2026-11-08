// Montage léger : moments forts d'un replay et export de clips au format vertical (TikTok, 1080x1920).
// findMoments lit les jugements exportés par danser ; toVideoTime convertit un temps de map en temps dans la vidéo finale.

// hits : [{ t (ms de map), c (combo), pp, nm (miss cumulés) }]. Renvoie jusqu'à `count` fenêtres sans chevauchement,
// plus la fin de la map, triées dans l'ordre de la vidéo.
export function findMoments(hits, { win = 15000, count = 4 } = {}) {
  const h = hits.filter(x => x.t != null);
  if (h.length < 2) return [];
  const t0 = h[0].t, t1 = h.at(-1).t, cands = [];
  for (let s = t0, a = 0, b = 0; s + win * 0.5 < t1; s += 1000) {
    while (a < h.length && h[a].t < s) a++;
    while (b < h.length && h[b].t <= s + win) b++;
    if (b - a < 4) continue;
    const before = h[a - 1], last = h[b - 1];
    const misses = Math.max(0, (last.nm ?? 0) - (before?.nm ?? 0));
    // les pp en direct bondissent dans les premières secondes : pas de gain compté sans point de départ, et plafonné
    const pp = before ? Math.min(60, Math.max(0, (last.pp ?? 0) - (before.pp ?? 0))) : 0;
    const dens = (b - a) / (win / 1000);
    const value = dens * 4 + pp * 0.6 + (misses ? -10 * misses : 12) + Math.min(last.c ?? 0, 400) * 0.02;
    const kind = misses === 0 && dens >= 6 ? 'Dense sans faute' : misses === 0 ? 'Série sans faute' : 'Passage intense';
    const label = `${kind} · ${dens.toFixed(1)} notes/s${pp >= 1 ? ` · +${Math.round(pp)} pp` : ''}`;
    cands.push({ start: s, end: Math.min(t1, s + win), value, label });
  }
  cands.sort((x, y) => y.value - x.value);
  const free = (c, list) => list.every(o => c.end <= o.start || c.start >= o.end);
  const out = [];
  for (const c of cands) { if (out.length >= count) break; if (free(c, out)) out.push(c); }
  const end = { start: Math.max(t0, t1 - win), end: t1, value: 0, label: 'Fin de la map' };
  if (free(end, out)) out.push(end);
  return out.sort((x, y) => x.start - y.start);
}

// frames : temps de map de chaque image rendue par danser (fps × oversample). intro : secondes ajoutées avant le jeu.
export function toVideoTime(mapMs, frames, { oversample = 1, fps = 60, intro = 0 } = {}) {
  const m = Math.max(1, oversample), n = Math.floor(frames.length / m);
  let lo = 0, hi = Math.max(0, n - 1);
  while (lo < hi) { const mid = (lo + hi) >> 1; if (frames[mid * m] < mapMs) lo = mid + 1; else hi = mid; }
  return intro + lo / fps;
}

// Arguments ffmpeg d'un clip vertical. layout : 'full' (vidéo entière sur fond flou) ou 'zoom' (centre du jeu agrandi).
// cards : { intro, outro } = fichiers RGBA bruts 1080x1920 (une image chacun, voir drawClipCard). Le clip s'ouvre alors
// sur sa première image floutée qui sort du noir avec la carte de la map, et se ferme sur la dernière image floutée,
// la carte du score puis le noir. Le son (copié tel quel, le ffmpeg fourni ne décode pas l'AAC) est décalé d'autant.
// overlay : false = recadre sur le terrain de jeu, hors des zones de l'overlay (bandeau y<135, barre d'erreur y>965,
// classement x<420, touches x>1560 sur 1920x1080). background : fichier RGBA brut 1080x1920 (fond de la map flouté)
// à la place de la vidéo floutée.
export const CARD_IN = 2.6, CARD_OUT = 2.8;
const PLAYFIELD = 'crop=iw*0.5885:ih*0.7593:iw*0.2214:ih*0.1296';
export function clipArgs({ input, output, start, end, layout = 'full', encoder = 'libx264', cards = null, overlay = true, background = null, caption = null }) {
  const dur = Math.max(0.5, end - start), f = n => n.toFixed(3);
  const I = cards ? CARD_IN : 0, O = cards ? CARD_OUT : 0, T = I + dur + O;
  const fg = !overlay ? `${PLAYFIELD},scale=1080:-2` : layout === 'zoom' ? 'crop=iw*0.62:ih,scale=1080:-2' : 'scale=1080:-2';
  const raw = file => ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1080x1920', '-framerate', '60', '-i', file];
  const bgIdx = cards ? 4 : 1;   // entrées : 0 vidéo, [1 intro, 2 fin, 3 son décalé], puis le fond
  // intro/fin : la vidéo du jeu est prolongée (première et dernière image) avant d'être posée sur le fond
  const pad = cards ? `,tpad=start_duration=${f(I)}:start_mode=clone:stop_duration=${f(O)}:stop_mode=clone` : '';
  // fond de la map : le jeu est fusionné en « éclaircir » (le fond sombre de danser laisse voir l'image de la map,
  // les cercles et le curseur passent par-dessus), sans bande noire autour du terrain
  const vert = background
    ? `[${bgIdx}:v]loop=loop=-1:size=1:start=0,setpts=N/(60*TB),trim=duration=${f(T)},format=gbrp[bg];[0:v]fps=60,${fg}${pad},pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=gbrp[fg];[bg][fg]blend=all_mode=lighten:shortest=1,format=yuv420p,setsar=1`
    : `[0:v]fps=60,split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2[bg];[b]${fg}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1${pad}`;
  const enc = /nvenc/.test(encoder) ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '20', '-b:v', '0'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18'];
  const src = ['-ss', start.toFixed(3), '-t', dur.toFixed(3)], bgIn = background ? raw(background) : [], capIn = caption ? raw(caption) : [];
  // légende : visible pendant le jeu seulement (pas sur les cartes), entrée placée après le fond
  const capIdx = (cards ? 4 : 1) + (background ? 1 : 0);
  const withCap = out => caption ? `${vert}[pre];[${capIdx}:v]loop=loop=-1:size=1:start=0,setpts=N/(60*TB),trim=duration=${f(dur)},format=rgba,fade=t=in:st=0:d=0.4:alpha=1,setpts=PTS+${f(I)}/TB[cap];[pre][cap]overlay=eof_action=pass${out}` : `${vert}${out}`;
  if (!cards) return ['-hide_banner', '-y', ...src, '-i', input, ...bgIn, ...capIn, '-filter_complex', withCap(',format=yuv420p[v]'), '-map', '[v]', '-map', '0:a?', ...enc, '-c:a', 'copy', '-movflags', '+faststart', output];
  const card = (k, d) => `[${k}:v]loop=loop=-1:size=1:start=0,setpts=N/(60*TB),trim=duration=${f(d)},format=rgba`;
  const filter = [
    withCap('[base]'),
    // deux calques flous, seulement sur l'intro et la fin (un seul fondu par calque : un fondu « in » rend le calque transparent avant son début)
    `[base]split=3[sharp][s1][s2];[s1]trim=end=${f(I)},scale=270:480,boxblur=8:2,scale=1080:1920,format=yuva420p,fade=t=out:st=${f(I - 0.5)}:d=0.5:alpha=1[b1];[s2]trim=start=${f(I + dur)},scale=270:480,boxblur=8:2,scale=1080:1920,format=yuva420p,fade=t=in:st=${f(I + dur)}:d=0.5:alpha=1[b2]`,
    `[sharp][b1]overlay=eof_action=pass[x1];[x1][b2]overlay=eof_action=pass[mix]`,
    `${card(1, I)},fade=t=in:st=0.2:d=0.5:alpha=1,fade=t=out:st=${f(I - 0.5)}:d=0.45:alpha=1[ci]`,
    `${card(2, O)},fade=t=in:st=0.35:d=0.5:alpha=1,setpts=PTS+${f(I + dur)}/TB[co]`,
    `[mix][ci]overlay=eof_action=pass[m1]`,
    `[m1][co]overlay=eof_action=pass[m2]`,
    `[m2]fade=t=in:st=0:d=0.7,fade=t=out:st=${f(T - 0.8)}:d=0.8,format=yuv420p[v]`,
  ].join(';');
  return ['-hide_banner', '-y', ...src, '-i', input, ...raw(cards.intro), ...raw(cards.outro), ...src, '-itsoffset', f(I), '-i', input, ...bgIn, ...capIn,
    '-filter_complex', filter, '-map', '[v]', '-map', '3:a?', '-t', f(T), ...enc, '-c:a', 'copy', '-movflags', '+faststart', output];
}

// Cartes en verre des clips verticaux, dessinées sur un canvas 1080x1920 transparent (le flou vient de la vidéo dessous).
const GRADE_C = { X: '#e8eef8', S: '#ffd45e', A: '#8fe36b', B: '#6fb8ff', C: '#d58cff', D: '#ff7070', F: '#ff7070' };
export function drawClipCard(g, kind, info = {}) {
  const W = 1080, cx = W / 2, F = (w, px) => `${w} ${px}px "Nunito", "Segoe UI", sans-serif`;
  const fit = (t, max) => { t = String(t ?? ''); if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  g.clearRect(0, 0, W, 1920);
  const x = 90, w = 900, y = kind === 'intro' ? 620 : 560, h = kind === 'intro' ? 640 : 760;
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 60; rr(x, y, w, h, 44); g.fillStyle = 'rgba(16,16,22,.42)'; g.fill(); g.restore();
  const shine = g.createLinearGradient(0, y, 0, y + h); shine.addColorStop(0, 'rgba(255,255,255,.16)'); shine.addColorStop(.4, 'rgba(255,255,255,.03)'); shine.addColorStop(1, 'rgba(255,255,255,.06)');
  rr(x, y, w, h, 44); g.fillStyle = shine; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.24)'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
  const mods = (info.mods || []).join(' ');
  if (kind === 'intro') {
    g.font = F(800, 30); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText(info.player ? `${info.player} joue` : 'osu!', cx, y + 92);
    g.font = F(800, 68); g.fillStyle = '#fff'; g.fillText(fit(info.title, w - 90), cx, y + 190);
    g.font = F(700, 38); g.fillStyle = 'rgba(255,255,255,.82)'; g.fillText(fit(info.artist, w - 110), cx, y + 248);
    g.font = F(800, 40); g.fillStyle = '#fff'; g.fillText(fit(`[${info.version || '?'}]`, w - 110), cx, y + 330);
    g.font = F(600, 30); g.fillStyle = 'rgba(255,255,255,.65)'; g.fillText(fit(`mappé par ${info.creator || '?'}`, w - 110), cx, y + 376);
    const chips = [`    ${(+info.stars || 0).toFixed(2)}`, info.bpm ? `${Math.round(info.bpm)} BPM` : null, mods || null].filter(Boolean);
    g.font = F(800, 34); const cw = chips.map(c => g.measureText(c).width + 48), tot = cw.reduce((a, b) => a + b, 0) + 16 * (chips.length - 1);
    let px = cx - tot / 2; chips.forEach((c, i) => { rr(px, y + 420, cw[i], 64, 32); g.fillStyle = i === 0 ? '#ffd45e' : 'rgba(255,255,255,.14)'; g.fill(); g.fillStyle = i === 0 ? '#2a2210' : '#fff'; g.fillText(c, px + cw[i] / 2, y + 464);
      if (i === 0) { const sx = px + 38, sy = y + 452; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, d = k % 2 ? 6.5 : 15; g.lineTo(sx + Math.cos(a) * d, sy + Math.sin(a) * d); } g.closePath(); g.fill(); }
      px += cw[i] + 16; });
    [['CS', info.cs, '#ff6b74'], ['AR', info.ar, '#7fe08a'], ['OD', info.od, '#b48cff'], ['HP', info.hp, '#6f9bff']].forEach(([k, v, col], i) => {
      const bx = x + 70 + i * 200, by = y + 540; v = +v || 0;
      g.fillStyle = 'rgba(255,255,255,.14)'; rr(bx, by, 160, 10, 5); g.fill(); g.fillStyle = col; rr(bx, by, 160 * Math.max(.04, Math.min(1, v / 10)), 10, 5); g.fill();
      g.font = F(800, 28); g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(k, bx, by + 50); g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText(v.toFixed(1), bx + 160, by + 50); g.textAlign = 'center';
    });
  } else {
    const gl = String(info.grade || 'S').toUpperCase().replace(/^(SS|XH|SSH)$/, 'X').replace(/^SH$/, 'S');
    const gr = g.createLinearGradient(0, y + 40, 0, y + 300); gr.addColorStop(0, '#fff'); gr.addColorStop(1, GRADE_C[gl] || '#ffd45e');
    g.font = F(800, 250); g.fillStyle = gr; g.fillText(gl, cx, y + 280);
    g.font = F(800, 76); g.fillStyle = '#fff'; g.fillText(Math.round(info.score || 0).toLocaleString('fr-FR').replace(/ | /g, ' '), cx, y + 390);
    const cells = [['Précision', `${(+info.acc || 0).toFixed(2)} %`], ['Combo', `${info.combo || 0}x${info.maxCombo ? ' / ' + info.maxCombo : ''}`], ['pp', String(Math.round(info.pp || 0))], ['Miss', String(info.miss || 0)]];
    cells.forEach(([k, v], i) => { const col = i % 2, row = i >> 1, bx = x + 50 + col * 410, by = y + 440 + row * 120;
      rr(bx, by, 390, 100, 24); g.fillStyle = 'rgba(255,255,255,.1)'; g.fill();
      g.font = F(700, 26); g.fillStyle = 'rgba(255,255,255,.62)'; g.fillText(k, bx + 195, by + 38); g.font = F(800, 40); g.fillStyle = k === 'Miss' && +v > 0 ? '#ff8a8a' : '#fff'; g.fillText(v, bx + 195, by + 84); });
    g.font = F(700, 30); g.fillStyle = 'rgba(255,255,255,.7)';
    g.fillText(fit([info.player, mods, info.rank ? `#${info.rank} sur ${info.of} au classement` : null].filter(Boolean).join('  ·  '), w - 90), cx, y + 720);
  }
  g.font = F(800, 30); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText('Dancing!', cx, 1820);
}

// Fond des clips verticaux : l'image de la map en plein cadre, floutée et un peu assombrie.
export function drawClipBackground(g, img, { blur = 26, dim = 0.38 } = {}) {
  const W = 1080, H = 1920; g.clearRect(0, 0, W, H); g.fillStyle = '#0b0b0e'; g.fillRect(0, 0, W, H);
  if (img) { const s = Math.max(W / img.width, H / img.height) * 1.08; g.filter = `blur(${blur}px)`; g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); g.filter = 'none'; }
  g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, W, H);
}

// Légende des clips : texte en haut de l'écran, dans une pastille en verre (une ou deux lignes).
export function drawClipCaption(g, text) {
  const W = 1080, F = px => `800 ${px}px "Nunito", "Segoe UI", sans-serif`;
  g.clearRect(0, 0, W, 1920);
  let px = 66; g.font = F(px);
  const words = String(text).split(/\s+/).filter(Boolean);
  let lines = wrap(g, words, 900);
  // on réduit la taille jusqu'à tenir sur deux lignes
  while ((lines.length > 2 || lines.some(l => g.measureText(l).width > 900)) && px > 34) { px -= 4; g.font = F(px); lines = wrap(g, words, 900); }
  lines = lines.slice(0, 2);
  // « ★ » n'existe pas dans Nunito : les étoiles sont dessinées à la main entre les morceaux de texte
  const sw = px * 0.9, lineW = l => l.split(/[★☆]/).reduce((a, t) => a + g.measureText(t).width, 0) + (l.split(/[★☆]/).length - 1) * sw;
  const lh = px * 1.22, h = lines.length * lh + 56, w = Math.min(980, Math.max(...lines.map(lineW)) + 80), x = (W - w) / 2, y = 250;
  g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 40; g.beginPath(); g.roundRect(x, y, w, h, 36); g.fillStyle = 'rgba(14,14,20,.5)'; g.fill(); g.restore();
  g.beginPath(); g.roundRect(x, y, w, h, 36); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.22)'; g.stroke();
  g.textAlign = 'left'; g.fillStyle = '#fff';
  lines.forEach((l, i) => {
    const by = y + 28 + px * 0.95 + i * lh; let cx = (W - lineW(l)) / 2;
    l.split(/[★☆]/).forEach((t, k, parts) => {
      g.fillText(t, cx, by); cx += g.measureText(t).width;
      if (k < parts.length - 1) { const sx = cx + sw / 2, sy = by - px * 0.36, R = px * 0.4; g.beginPath(); for (let n = 0; n < 10; n++) { const a = -Math.PI / 2 + n * Math.PI / 5, d = n % 2 ? R * 0.45 : R; g.lineTo(sx + Math.cos(a) * d, sy + Math.sin(a) * d); } g.closePath(); g.fill(); cx += sw; }
    });
  });
}
function wrap(g, words, max) { const out = []; for (const w of words) { const cur = out.at(-1); if (cur && g.measureText(cur + ' ' + w).width <= max) out[out.length - 1] = cur + ' ' + w; else out.push(w); } return out; }
