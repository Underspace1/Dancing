const specs = [
  ['accuracy', 'Précision', 236, 76, '#9ee5cf', '99.48 %'],
  ['pp', 'Performance', 216, 76, '#c6b7ff', '243 pp'],
  ['combo', 'Combo', 176, 76, '#f8ca8b', '427×'],
  ['timing', 'Stabilité', 190, 76, '#a9d5ff', '81 UR'],
  ['score', 'Score', 252, 76, '#d7e2f4', '12 048 816'],
  ['misses', 'Erreurs', 176, 76, '#ffa9ae', '1 miss'],
  ['health', 'Vie', 280, 80, '#9ee5cf', '87 %'],
  ['progress', 'Progression', 330, 80, '#a9d5ff', '01:24 / 03:48'],
  ['keys', 'Touches', 288, 76, '#f8ca8b', 'K1   207     K2   220'],
  ['track', 'Beatmap', 530, 80, '#c6b7ff', 'xi — over the top'],
];
export const DANCING_WIDGETS = specs.map(([id, name, w, h, accent, sample]) => ({
  id, folder: 'Dancing! ' + id, name, w, h, accent, sample, author: 'Dancing!', source: 'dancing',
}));
export const dancingWidget = folder => DANCING_WIDGETS.find(widget => widget.folder === folder);

export function drawDancingWidgets(ctx, placements, messages) {
  for (const placement of placements) {
    const widget = dancingWidget(placement.folder);
    if (!widget) continue;
    ctx.save();
    ctx.translate(placement.x, placement.y);
    ctx.scale(placement.w / widget.w * placement.s, placement.h / widget.h * placement.s);
    ctx.globalAlpha = placement.o ?? 1;
    drawDancingWidget(ctx, widget, { ...messages.v2, keys: messages.precise.keys });
    ctx.restore();
  }
}
const pct = value => Math.max(0, Math.min(1, Number(value) || 0));
const time = ms => {
  const sec = Math.floor(Math.max(0, ms || 0) / 1000);
  return [Math.floor(sec / 60), sec % 60].map(n => String(n).padStart(2, '0')).join(':');
};

export function drawDancingWidget(ctx, widget, data) {
  const { id, name, w, h, accent, sample } = widget;
  const { play, beatmap, keys } = data || {};
  const last = beatmap?.time?.lastObject || 0;
  const live = beatmap?.time?.live || 0;
  const progress = pct(live / last), health = pct(play?.healthBar?.normal / 200);
  const values = play && {
    accuracy: (play.accuracy || 0).toFixed(2) + ' %',
    pp: Math.round(play.pp?.current || 0) + ' pp',
    combo: (play.combo?.current || 0) + '×',
    timing: Math.round(play.unstableRate || 0) + ' UR',
    score: (play.score || 0).toLocaleString('fr-FR'),
    misses: (play.hits?.['0'] || 0) + ' miss',
    health: Math.round(health * 100) + ' %',
    progress: time(live) + ' / ' + time(last),
    keys: `K1  ${keys?.k1?.count || 0}     K2  ${keys?.k2?.count || 0}`,
    track: [beatmap?.artist, beatmap?.title].filter(Boolean).join(' — '),
  };
  ctx.save();
  ctx.textBaseline = 'middle';
  const ink = '#fff8ff', night = 'rgba(16, 17, 32, .93)';
  const value = values?.[id] || sample;
  const pill = (x, y, width, height, radius, color) => {
    if (width <= 0 || height <= 0) return;
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  };
  const label = (text, x, y, size, color = ink, max = w - x - 8) => {
    ctx.fillStyle = color; ctx.font = `800 ${size}px Nunito, sans-serif`;
    ctx.fillText(text, x, y, Math.max(1, max));
  };
  const line = (points, color, width = 2) => {
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
  };
  const ring = (x, y, r, start, sweep, color, width) => {
    ctx.beginPath(); ctx.arc(x, y, r, start, start + sweep);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
  };
  switch (id) {
    case 'accuracy': {
      pill(3, 5, 68, 66, 32, night);
      ring(37, 38, 25, -Math.PI / 2, Math.PI * 2, '#303b46', 5);
      ring(37, 38, 25, -Math.PI / 2, Math.PI * 2 * (data ? pct(play?.accuracy / 100) : .97), accent, 5);
      label('%', 28, 39, 19, accent);
      label('PRÉCISION', 82, 24, 13, accent); label(value, 82, 49, 31);
      break;
    }
    case 'pp': {
      ctx.beginPath(); ctx.moveTo(18, 12); ctx.lineTo(w - 3, 12); ctx.lineTo(w - 20, 67); ctx.lineTo(2, 67); ctx.closePath();
      ctx.fillStyle = night; ctx.fill(); line([[19, 12], [w - 4, 12]], accent, 3);
      label(String(parseInt(value, 10) || 0), 25, 42, 40, ink, 115);
      label('PP', 151, 44, 21, accent);
      break;
    }
    case 'combo':
      label('CHAIN', 12, 16, 12, accent);
      label(value, 11, 44, 47, ink, 150);
      line([[13, 68], [94, 68], [107, 57], [156, 57]], accent, 3);
      break;
    case 'timing': {
      pill(4, 5, w - 8, 66, 14, night);
      label(value, 14, 22, 24); label('TIMING', 112, 23, 12, accent);
      line([[18, 52], [172, 52]], '#515779', 2); line([[95, 41], [95, 63]], '#f5f3ff', 2);
      const errors = play?.hitErrorArray?.slice(-13) || [-17, -12, 5, 10, -6, 18, 2, 6, -24, 12];
      for (const [i, error] of errors.entries()) {
        const x = 95 + Math.max(-72, Math.min(72, error * 2));
        ctx.save(); ctx.globalAlpha *= .45 + .55 * i / errors.length;
        line([[x, 46], [x, 57]], accent, 2);
        ctx.restore();
      }
      break;
    }
    case 'score':
      pill(4, 8, 67, 20, 5, '#e1ebff'); label('SCORE', 13, 18, 13, '#202543');
      label(value, 5, 48, 39); line([[5, 68], [w - 6, 68]], '#acb8ff', 2);
      break;
    case 'misses': {
      pill(4, 8, 56, 56, 13, '#51293e');
      line([[22, 25], [42, 46]], accent, 4); line([[42, 25], [22, 46]], accent, 4);
      label('MISSES', 73, 22, 12, accent);
      label(String(parseInt(value, 10) || 0).padStart(2, '0'), 72, 46, 34);
      break;
    }
    case 'health': {
      label('HP', 9, 24, 20, accent); label(value, w - 64, 24, 22);
      const level = data ? health : .87;
      for (let i = 0; i < 12; i++) {
        pill(9 + i * 22, 45, 17, 18, 3, '#323446');
        pill(9 + i * 22, 45, 17 * pct(level * 12 - i), 18, 3, level < .3 ? '#ff748e' : accent);
      }
      break;
    }
    case 'progress': {
      pill(5, 13, 34, 34, 17, '#2b3e59');
      ctx.beginPath(); ctx.moveTo(19, 22); ctx.lineTo(19, 38); ctx.lineTo(30, 30); ctx.closePath();
      ctx.fillStyle = accent; ctx.fill();
      label(value, 49, 30, 25); label('REPLAY', w - 68, 31, 12, accent);
      const position = data ? progress : .37;
      line([[13, 62], [w - 13, 62]], '#3e4863', 4);
      if (position) line([[13, 62], [13 + (w - 26) * position, 62]], accent, 4);
      pill(8 + (w - 26) * position, 57, 10, 10, 5, ink);
      break;
    }
    case 'keys':
      for (const [i, key] of ['k1', 'k2'].entries()) {
        const x = 5 + i * 145, active = keys?.[key]?.isPressed ?? i === 0;
        pill(x, 10, 128, 55, 14, active ? accent : '#242840');
        label(key.toUpperCase(), x + 12, 38, 17, active ? '#4f3421' : accent);
        label(String(keys?.[key]?.count ?? (i ? 220 : 207)), x + 48, 38, 28, active ? '#1a1420' : ink);
      }
      break;
    case 'track':
      pill(4, 10, 61, 59, 12, '#483561');
      for (const [i, bar] of [16, 29, 40, 23, 13].entries()) pill(16 + i * 8, 39 - bar / 2, 4, bar, 2, accent);
      label('NOW PLAYING', 79, 23, 12, accent);
      label(value, 79, 46, 29); line([[80, 67], [w - 17, 67]], '#7763a6', 2);
      break;
  }
  ctx.restore();
}

