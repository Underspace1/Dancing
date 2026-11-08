import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { BUILTIN, dancingPresets } from './web/presets.js';
import { DANCING_WIDGETS, drawDancingWidget, drawDancingWidgets } from './web/dancing-widgets.js';
import { lzmaDecode } from './lzma.mjs';
import { replayFrames, simulate } from './mania.mjs';
import { ManiaTimeline } from './web/mania.js';
import { makeWidget, defaultSpec, normalizeSpec } from './web/widget-maker.js';

test('reference and built-in layouts fit the editor without the marketplace', () => {
  // La Référence reste identique ; les autres presets intégrés ne changent que des couleurs, sans widgets.
  assert.deepEqual((({ id, hud, tosu }) => ({ id, hud, tosu }))(BUILTIN[0]), { id: 'cpol', hud: {}, tosu: [] });
  assert(BUILTIN.slice(1).every(p => p.tosu.length === 0 && Object.keys(p.hud).length > 0));
  assert.equal(new Set(BUILTIN.map(p => p.id)).size, BUILTIN.length);
  assert.equal(DANCING_WIDGETS.length, 10);
  assert.equal(new Set(DANCING_WIDGETS.map(w => w.folder)).size, 10);
  const presets = dancingPresets();
  assert.equal(presets.length, 4);
  for (const { tosu } of presets) {
    for (const [i, a] of tosu.entries()) {
      assert(a.x >= 32 && a.y >= 32 && a.x + a.w <= 1888 && a.y + a.h <= 1048);
      assert(tosu.slice(i + 1).every(b => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));
    }
  }
});

test('widget backgrounds preserve the alpha channel in previews and video', () => {
  for (const widget of DANCING_WIDGETS) {
    const ctx = createCanvas(widget.w, widget.h).getContext('2d');
    drawDancingWidget(ctx, widget);
    const pixels = ctx.getImageData(0, 0, widget.w, widget.h).data;
    let filled = 0, clear = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 128) filled++;
      if (pixels[i] === 0) clear++;
    }
    assert(clear > widget.w * widget.h / 10, widget.name + ' conserve du vide transparent');
    assert(filled > 150, widget.name + ' dessine un widget visible');
  }
  const ctx = createCanvas(1920, 1080).getContext('2d');
  const { tosu } = dancingPresets()[0];
  drawDancingWidgets(ctx, tosu, { v2: { play: { accuracy: 99 } }, precise: { keys: {} } });
  assert.equal(ctx.getImageData(500, 500, 1, 1).data[3], 0);
  assert(ctx.getImageData(tosu[0].x + 20, tosu[0].y + 40, 1, 1).data[3] > 0);
});

test('osu!mania : frames LZMA, jugements et chronologie', () => {
  // flux produit par xz --format=lzma (même format que les .osr)
  const lz = Buffer.from('5d00000004ffffffffffffffff00181f1f04582cc45aea082d8ad1bfacb33d248b4e41b0b35df399da943293dcedeff663330214ffff97990000', 'hex');
  assert.equal(lzmaDecode(lz).toString(), '0|0|0|0,-1|0|0|0,1000|1|0|0,60|0|0|0,940|2|0|0,500|0|0|0,-12345|0|0|0');
  const frames = replayFrames(lz);
  assert.deepEqual(frames, [[0, 0], [-1, 0], [999, 1], [1059, 0], [1999, 2], [2499, 0]]);
  // 2 colonnes : note à 1000 (appui à 999 → PERFECT), note longue 2000→2500 tenue jusqu'au bout, note à 4000 jamais jouée
  const map = { keys: 2, od: 8, notes: [[1000, 0, 0], [2000, 1, 2500], [4000, 0, 0]] };
  const sim = simulate(map, frames, []);
  assert.deepEqual(sim.judg.map(j => j[1]), [5, 5, 5, 0]);
  const tl = new ManiaTimeline({ meta: { keys: 2, score: 1000, start: 1000, end: 4000 }, notes: sim.notes, judg: sim.judg, press: sim.press });
  const st = tl.at(3000);
  assert.deepEqual(st.counts, [0, 0, 0, 0, 0, 3]);
  assert.equal(st.combo, 3);
  assert.equal(tl.at(5000).combo, 0);
  assert.equal(tl.at(5000).maxCombo, 3);
});

test('créateur de widgets : taille fixe et texte échappé', () => {
  const html = makeWidget({ ...defaultSpec(), name: '<script>x</script>' }, [300, 70]);
  assert.match(html, /width: 300px; height: 70px/);
  assert(!html.includes('<title><script>'));
});

test('créateur : anciennes créations relues, nouvelles options appliquées', () => {
  const old = normalizeSpec({ name: 'Vieux', style: 'glass', size: 'L', labels: false, items: ['pp', 'inconnu', 'acc'] });
  assert.equal(old.fontSize, 38);
  assert.equal(old.labels, 'off');
  assert.deepEqual(old.items, [{ k: 'pp' }, { k: 'acc' }]);
  const html = makeWidget({ ...defaultSpec(), style: 'outline', accent: '#123456', layout: 'grid2', font: 'Consolas', items: [{ k: 'pp', label: 'Perf', color: '#ff0000' }, { k: 'time' }] });
  assert.match(html, /inset 0 0 0 1px #123456/);
  assert(html.includes('grid-template-columns: repeat(2, auto)'));
  assert.match(html, /'Consolas'/);
  assert.match(html, />Perf</);
  assert.match(html, /color:#ff0000/);
});

test('mods des replays lazer : réglages retirés, LZ masqué', async () => {
  const { modList } = await import('./web/hud.js');
  assert.deepEqual(modList('LZCLDAAR10'), ['CL', 'DA']);
  assert.deepEqual(modList('LZDAAR10OD8.6'), ['DA']);
  assert.deepEqual(modList('LZDTHDRXS1.14x'), ['DT', 'HD', 'RX']);
  assert.deepEqual(modList('HDHRMR0'), ['HD', 'HR', 'MR']);
  assert.deepEqual(modList('HDDT'), ['HD', 'DT']);
});

test('montage : moments forts sans chevauchement, fin de map, clip vertical', async () => {
  const { findMoments, toVideoTime, clipArgs } = await import('./clips.mjs');
  // 120 s de map : passage calme, puis un stream dense sans faute entre 60 et 75 s, des miss vers 30 s
  const hits = []; let nm = 0;
  for (let t = 0; t <= 120000; t += 250) { if (t >= 60000 && t < 75000) { hits.push({ t, c: 0, pp: t / 1000, nm }); hits.push({ t: t + 80, c: 0, pp: t / 1000, nm }); } else { if (t > 30000 && t < 33000 && t % 1000 === 0) nm++; hits.push({ t, c: 0, pp: t / 1000, nm }); } }
  const m = findMoments(hits);
  assert(m.length >= 2 && m.length <= 5);
  for (let i = 1; i < m.length; i++) assert(m[i].start >= m[i - 1].end, 'pas de chevauchement');
  assert(m.some(x => x.start >= 55000 && x.start <= 65000 && /sans faute/.test(x.label)), 'le stream est trouvé');
  assert(m.some(x => x.label === 'Fin de la map') || m.at(-1).end === 120080);
  assert.equal(toVideoTime(5000, [0, 1000, 2000, 3000, 4000, 5000, 6000], { fps: 1, intro: 3 }), 8);
  const a = clipArgs({ input: 'in.mp4', output: 'out.mp4', start: 10, end: 25, layout: 'zoom', encoder: 'hevc_nvenc' });
  assert.deepEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 4), ['-ss', '10.000', '-t', '15.000']);
  assert(a.includes('h264_nvenc') && a.join(' ').includes('crop=iw*0.62:ih') && a.join(' ').includes('fps=60'));
});

test('clip vertical avec cartes : intro + fin, son décalé, deux calques flous', async () => {
  const { clipArgs, CARD_IN, CARD_OUT, drawClipCard } = await import('./clips.mjs');
  const a = clipArgs({ input: 'in.mp4', output: 'o.mp4', start: 5, end: 13, cards: { intro: 'i.rgba', outro: 'o.rgba' } }), s = a.join(' ');
  assert(s.includes('-itsoffset ' + CARD_IN.toFixed(3)) && s.includes('-map 3:a?'));
  assert(s.includes('-t ' + (CARD_IN + 8 + CARD_OUT).toFixed(3)));
  assert(s.includes('[b1]') && s.includes('[b2]') && !s.includes('enable='));
  const c = createCanvas(1080, 1920), g = c.getContext('2d');
  for (const k of ['intro', 'outro']) drawClipCard(g, k, { title: 'T', artist: 'A', version: 'V', stars: 6, grade: 'S', score: 1e6, acc: 99 });
});

test('clip vertical : fond de la map fusionné, overlay masqué, prolongé pour les cartes', async () => {
  const { clipArgs, drawClipBackground } = await import('./clips.mjs');
  const s = clipArgs({ input: 'in.mp4', output: 'o.mp4', start: 0, end: 8, background: 'bg.rgba', overlay: false, cards: { intro: 'i', outro: 'o' } }).join(' ');
  assert(s.includes('blend=all_mode=lighten') && s.includes('crop=iw*0.5885:ih*0.7593'));
  assert(s.includes('-framerate 60') && s.includes('trim=duration=13.400') && s.includes(',tpad='));
  const c = createCanvas(1080, 1920); drawClipBackground(c.getContext('2d'), null);
});

test('clip vertical : légende pendant le jeu seulement, étoile dessinée', async () => {
  const { clipArgs, drawClipCaption } = await import('./clips.mjs');
  const s = clipArgs({ input: 'in.mp4', output: 'o.mp4', start: 0, end: 10, caption: 'c.rgba', background: 'bg.rgba', cards: { intro: 'i', outro: 'o' } }).join(' ');
  assert(s.includes('[5:v]loop') && s.includes('setpts=PTS+2.600/TB[cap]') && s.includes('[pre][cap]overlay'));
  const n = clipArgs({ input: 'in.mp4', output: 'o.mp4', start: 0, end: 10, caption: 'c.rgba' }).join(' ');
  assert(n.includes('[1:v]loop') && n.includes('setpts=PTS+0.000/TB[cap]'));
  const c = createCanvas(1080, 1920); drawClipCaption(c.getContext('2d'), 'FC 7★ en HDDT');
});
