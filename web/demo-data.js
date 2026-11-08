export function demoData(player = 'Ton pseudo') {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / 1.2; };
  const start = 2500, end = 150000, rate = 1.5, maxPP = 1162;
  const hits = [], keys = []; let combo = 0, max = 0, n3 = 0, n1 = 0, nm = 0, nsb = 0, score = 0, errs = [], lane = 0, hp = 1;
  for (let t = start; t < end; t += 95 + (rnd() < 0.05 ? 700 : 0)) {
    if (t > 70000 && t < 78000) continue;
    let e = gauss() * 11 - 3, r = '300'; const roll = rnd();
    if (roll < 0.035) { e = (rnd() < .5 ? -1 : 1) * (22 + rnd() * 30); r = '100'; } else if (roll < 0.039) r = 'miss'; else if (roll < 0.0405) r = 'sb';
    if (r === 'miss' || r === 'sb') { combo = 0; r === 'miss' ? nm++ : nsb++; hp = Math.max(0.05, hp - 0.22); } else { combo++; r === '300' ? n3++ : n1++; errs.push(e); hp = Math.min(1, hp + (r === '300' ? 0.012 : 0.004)); }
    max = Math.max(max, combo); score += (r === '300' ? 300 : r === '100' ? 100 : 0) * (1 + Math.max(0, combo - 1) * 0.12);
    const tot = n3 + n1 + nm, acc = tot ? (300 * n3 + 100 * n1) / (3 * tot) : 100, prog = (t - start) / (end - start);
    const mean = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length), ur = errs.length > 1 ? Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / errs.length) * 10 / rate : 0;
    const fc = maxPP * Math.pow(acc / 100, 9), pp = fc * Math.pow(prog, 1.15) * Math.pow(0.97, nm);
    const pr = r === '300' || r === '100' ? { px: gauss() * 0.28, py: gauss() * 0.28 } : {};
    hits.push({ t, r, e: r === 'miss' || r === 'sb' ? undefined : e, c: combo, mc: max, s: Math.round(score), a: acc, pp, fc, ss: maxPP, st: 7.84 * Math.min(1, Math.pow(prog * 1.1, 0.3)), ur, g: acc === 100 ? 'xh' : acc > 93.17 ? 'sh' : 'a', n3, n1, n5: 0, nm, nsb, hp, ...pr });
    if (r !== 'miss') { keys.push([t - 8, lane ? 2 : 1], [t + 34, 0]); lane ^= 1; }
  }
  const strains = { Aim: [], Speed: [] };
  for (let i = 0; i < (end - start) / 600; i++) { const t = start + i * 600, br = t > 70000 && t < 78000, w = 0.55 + 0.45 * Math.sin(i / 9) * Math.sin(i / 23); strains.Aim.push(br ? 0 : Math.max(0, w + rnd() * 0.35)); strains.Speed.push(br ? 0 : Math.max(0, w * 0.75 + rnd() * 0.3)); }
  const names = ['Aster', 'Kiyomi', 'nebula', 'Faust', 'Hikari', 'lumen', 'Orbit', 'Sable', 'Tenshi', 'velvet', 'Wren', 'Yuki'];
  const board = names.map((name, i) => ({ name, score: Math.round(9e7 - i * 6.1e6), combo: 2400 - i * 130, acc: 99.1 - i * 0.37, pp: Math.round(1180 - i * 61), rank: i < 3 ? 'S' : i < 7 ? 'A' : 'B', misses: i > 4 ? i - 4 : 0, mods: i % 3 ? ['HD', 'DT'] : ['DT'] }));
  return { meta: { player, mods: 'HDDT', rate, stars: 7.84, maxPP, start, end, hit50: 99.5, hit100: 59.5, hit300: 19.5, title: 'Démo · Titre de la map', artist: 'Artiste', version: 'Extra', creator: 'mappeur', ar: 10, od: 10, cs: 4, length: 147000 }, strains, bpm: [[0, 60000 / 220]], hits, keys, board };
}
