// Builds tosu websocket payloads (v2, v2/precise, v1 "gosumemory") from a Replay HUD state,
// so tosu widgets can run on replay data — in the editor preview and in the video render.
import { gradeLetter, modList } from './hud.js';

const MODBITS = { NF: 1, EZ: 2, TD: 4, HD: 8, HR: 16, SD: 32, DT: 64, RX: 128, HT: 256, NC: 576, FL: 1024, AP: 8192, SO: 4096, PF: 16416 };
const NN = (number, name) => ({ number, name });
const rankName = g => { const l = gradeLetter(g); return l === 'X' ? (String(g).toLowerCase().endsWith('h') ? 'XH' : 'X') : (l === 'S' && String(g).toLowerCase().endsWith('h') ? 'SH' : l); };

// st: Timeline.at() state; meta: export meta; ctx: { board, hitErrors(all so far), host }
export function tosuMessages(st, meta, ctx = {}) {
  const mods = modList(meta.mods), num = mods.reduce((a, m) => a | (MODBITS[m] || 0), 0), rate = meta.rate || 1;
  const modsObj = { checksum: '', number: num, name: mods.join(''), array: mods.map(acronym => ({ acronym })), rate };
  const t = st.t, hp = Math.round((st.hp ?? 1) * 200);
  const hits = { '0': st.nmiss, '50': st.n50, '100': st.n100, '300': st.n300 ?? 0, geki: 0, katu: 0, sliderBreaks: st.nsb, sliderEndHits: 0, smallTickHits: 0, largeTickHits: 0 };
  const keys = {};
  for (const [k, lane] of [['k1', 'k1'], ['k2', 'k2']]) keys[k] = { isPressed: !!st.keys?.[lane]?.down, count: st.keys?.[lane]?.count || 0 };
  keys.m1 = { isPressed: false, count: 0 }; keys.m2 = { isPressed: false, count: 0 };
  const errs = ctx.hitErrors || st.errors.map(e => e.e);
  const bg = meta.bg || '', folder = (meta.dir || '').split(/[\\/]/).pop() || '';
  const strains = st.strains || {}, xaxis = (strains.aim || []).map((_, i) => Math.round(strains.start + i * strains.section));
  const series = [{ name: 'aim', data: strains.aim || [] }, { name: 'speed', data: strains.speed || [] }];
  const acc = {}; for (let a = 90; a <= 100; a++) acc[a] = a === 100 ? meta.maxPP : meta.maxPP * Math.pow(a / 100, 9);
  const stats = {
    stars: { live: st.stars, aim: undefined, speed: undefined, total: meta.stars },
    ar: { original: meta.ar, converted: meta.ar }, cs: { original: meta.cs, converted: meta.cs }, od: { original: meta.od, converted: meta.od }, hp: { original: meta.hp, converted: meta.hp },
    bpm: { realtime: Math.round(st.bpm), common: Math.round(st.bpm), min: Math.round(st.bpm), max: Math.round(st.bpm) },
    objects: { circles: meta.circles || 0, sliders: meta.sliders || 0, spinners: meta.spinners || 0, holds: 0, total: meta.objects || 0 },
    hitWindow: { great: meta.hit300, ok: meta.hit100, meh: meta.hit50 }, maxCombo: meta.maxCombo || 0,
  };
  const board = (ctx.board || st.board || []).slice(0, 50).map((e, i) => ({
    isFailed: false, position: i + 1, team: 0, id: e.id || 0, name: e.name, score: e.score, accuracy: e.acc,
    hits: { '0': e.misses || 0, '50': 0, '100': 0, '300': 0, geki: 0, katu: 0 }, combo: { current: e.combo, max: e.combo },
    mods: { checksum: '', number: 0, name: (e.mods || []).join(''), array: (e.mods || []).map(acronym => ({ acronym })), rate: 1 }, rank: rankName(e.grade), isPlayer: !!e.player,
  }));
  const v2 = {
    game: { focused: true, paused: false }, client: 'stable', server: 'ppy.sh',
    state: NN(2, 'play'), session: { playTime: 0, playCount: 0 },
    settings: { interfaceVisible: true, replayUIVisible: false, chatVisibilityStatus: NN(0, 'hidden'), leaderboard: { visible: true, type: NN(1, 'global') }, progressBar: NN(0, 'pie'), bassDensity: 0,
      resolution: { fullscreen: true, width: 1920, height: 1080, widthFullscreen: 1920, heightFullscreen: 1080 }, client: { updateAvailable: false, branch: 0, version: '' },
      scoreMeter: { type: NN(2, 'error'), size: 1 }, cursor: { useSkinCursor: true, autoSize: false, menuSize: 1, size: 1 }, mouse: { disableButtons: true, disableWheel: true, rawInput: true, sensitivity: 1 },
      tablet: { enabled: true, x: 0, y: 0, width: 0, height: 0, rotation: 0, pressureThreshold: 0 }, mania: { speedBPMScale: false, usePerBeatmapSpeedScale: false, scrollSpeed: 0, scrollDirection: NN(0, 'down') },
      sort: NN(0, 'artist'), group: NN(0, 'none'), skin: { useDefaultSkinInEditor: false, ignoreBeatmapSkins: true, tintSliderBall: false, useTaikoSkin: false, name: ctx.skin || '' },
      mode: NN(0, 'osu'), audio: { ignoreBeatmapSounds: false, useSkinSamples: false, volume: { masterInactive: 50, master: 100, music: 60, effect: 60 }, offset: { universal: 0 } },
      background: { storyboard: false, video: false, blur: 0, dim: 92 }, keybinds: { osu: { k1: 'Z', k2: 'X', smokeKey: 'C' }, fruits: { k1: 'Z', k2: 'X', Dash: 'Shift' }, taiko: { innerLeft: 'X', innerRight: 'C', outerLeft: 'Z', outerRight: 'V' }, quickRetry: '`' } },
    profile: { userStatus: NN(0, 'idle'), banchoStatus: NN(2, 'playing'), id: ctx.playerId || 0, name: st.player, mode: NN(0, 'osu'), rankedScore: 0, level: 100, accuracy: st.acc, pp: 0, playCount: 0,
      globalRank: Number(String(st.globalRank || 0).replace(/\D/g, '')) || 0, countryCode: NN(0, ctx.country || ''), backgroundColour: 'ffffff', matchmaking: null },
    beatmap: { isKiai: false, isBreak: false, isConvert: false, time: { live: t, firstObject: meta.start, lastObject: meta.end, mp3Length: meta.end + 3000 },
      status: NN(4, 'ranked'), checksum: meta.md5 || '', id: meta.beatmapId || 0, set: meta.setId || 0, mode: NN(0, 'osu'),
      artist: meta.artist || '', artistUnicode: meta.artist || '', title: meta.title || '', titleUnicode: meta.title || '', mapper: meta.creator || '', version: meta.version || '', source: meta.source || '', tags: meta.tags || '', stats },
    play: { failed: false, playerName: st.player, mode: NN(0, 'osu'), score: st.score, accuracy: st.acc, healthBar: { normal: hp, smooth: hp }, hits, hitErrorArray: errs,
      combo: { current: st.combo, max: st.maxCombo }, mods: modsObj, rank: { current: rankName(st.grade), maxThisPlay: rankName(st.grade) },
      pp: { current: st.pp, fc: st.fc, maxAchieved: st.pp, maxAchievable: st.fc, detailed: { current: { aim: 0, speed: 0, accuracy: 0, difficulty: 0, flashlight: 0, total: st.pp }, fc: { aim: 0, speed: 0, accuracy: 0, difficulty: 0, flashlight: 0, total: st.fc } } },
      unstableRate: st.ur },
    leaderboard: board,
    performance: { accuracy: acc, graph: { series, xaxis } },
    resultsScreen: { scoreId: 0, playerName: st.player, mode: NN(0, 'osu'), score: st.score, accuracy: st.acc, name: st.player, hits, mods: modsObj, maxCombo: st.maxCombo, rank: rankName(st.grade), pp: { current: st.pp, fc: st.fc }, createdAt: new Date().toISOString() },
    folders: { game: '', skin: '', songs: '', beatmap: folder }, files: { beatmap: '', background: bg, audio: meta.audio || '' },
    directPath: { beatmapFile: '', beatmapBackground: bg, beatmapAudio: meta.audio || '', beatmapFolder: folder, skinFolder: '' },
    tourney: undefined,
  };
  const precise = { keys, hitErrors: errs, tourney: [] };
  const player = b => ({ name: b.name, score: b.score, combo: b.combo, maxCombo: b.combo, mods: b.mods?.name ?? '', h300: 0, geki: 0, h100: 0, katu: 0, h50: 0, h0: b.misses || 0, team: 0, position: b.position, isPassing: 1 });
  const v1 = {
    client: 'stable',
    settings: { showInterface: true, folders: { game: '', skin: '', songs: '' } },
    menu: { mainMenu: { bassDensity: 0 }, state: 2, gameMode: 0, isChatEnabled: 0,
      bm: { time: { firstObj: meta.start, current: t, full: meta.end, mp3: meta.end + 3000 }, id: meta.beatmapId || 0, set: meta.setId || 0, md5: meta.md5 || '', rankedStatus: 4,
        metadata: { artist: meta.artist || '', artistOriginal: meta.artist || '', title: meta.title || '', titleOriginal: meta.title || '', mapper: meta.creator || '', difficulty: meta.version || '' },
        stats: { AR: meta.ar, CS: meta.cs, OD: meta.od, HP: meta.hp, SR: st.stars, BPM: stats.bpm, circles: stats.objects.circles, sliders: stats.objects.sliders, spinners: stats.objects.spinners, holds: 0, maxCombo: meta.maxCombo || 0, fullSR: meta.stars, memoryAR: meta.ar, memoryCS: meta.cs, memoryOD: meta.od, memoryHP: meta.hp },
        path: { full: bg, folder, file: '', bg, audio: meta.audio || '' } },
      mods: { num, str: mods.join('') || 'NM' },
      pp: { ...acc, strains: strains.aim || [], strainsAll: { series, xaxis } } },
    gameplay: { gameMode: 0, name: st.player, score: st.score, accuracy: st.acc, combo: { current: st.combo, max: st.maxCombo }, hp: { normal: hp, smooth: hp },
      hits: { '300': st.n300 ?? 0, geki: 0, '100': st.n100, katu: 0, '50': st.n50, '0': st.nmiss, sliderBreaks: st.nsb, grade: { current: rankName(st.grade), maxThisPlay: rankName(st.grade) }, unstableRate: st.ur, hitErrorArray: errs },
      pp: { current: st.pp, fc: st.fc, maxThisPlay: st.pp }, keyOverlay: keys,
      leaderboard: { hasLeaderboard: board.length > 0, isVisible: true, ourplayer: player(board.find(b => b.isPlayer) || { name: st.player, score: st.score, combo: st.maxCombo, position: 0 }), slots: board.map(player) }, _isReplayUiHidden: true },
    resultsScreen: { mode: 0, name: st.player, score: st.score, accuracy: st.acc, maxCombo: st.maxCombo, mods: { num, str: mods.join('') }, '300': st.n300 ?? 0, geki: 0, '100': st.n100, katu: 0, '50': st.n50, '0': st.nmiss, grade: rankName(st.grade), createdAt: '' },
    userProfile: { rawLoginStatus: 0, name: st.player, accuracy: 0, rankedScore: 0, id: ctx.playerId || 0, level: 0, playCount: 0, playMode: 0, rank: 0, countryCode: 0, performancePoints: 0, rawBanchoStatus: 0, backgroundColour: '' },
  };
  return { v2, precise, v1 };
}
