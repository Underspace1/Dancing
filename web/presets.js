import { DANCING_WIDGETS } from './dancing-widgets.js';
// Built-in presets. A preset = overlay options (colours, styles, widget layout) + widgets.
// hud.layout[key] = { dx, dy, s, o, show } moves/scales a native widget; tosu = [{ folder, x, y, w, h, s, o }].
export const BUILTIN = [
  {
    id: 'cpol', name: 'Référence', desc: 'Identique à la vidéo : bandeau incurvé, panneaux inclinés, classement à gauche.',
    hud: {}, tosu: [],
  },
  // Variantes : seules les valeurs listées changent, la Référence (cpol) n'est jamais modifiée.
  { id: 'neon', name: 'Néon', desc: 'Bandeau rose électrique, lueur forte, jugements cyan.', tosu: [],
    hud: { tubeColor: '#ff4fa3', panelColor: '#2b1631', hpColor: '#ff4fa3', hpEmpty: '#16070f', textColor: '#fff2fa', glow: 1.9, c300: '#4fd8ff', c100: '#a6ff6b', c50: '#ffd84b', keyColor: '#ff8cc6' } },
  { id: 'glacier', name: 'Glacier', desc: 'Bleus froids et lueur douce, lisible sur les fonds clairs.', tosu: [],
    hud: { tubeColor: '#a9d8ff', panelColor: '#2f4257', hpColor: '#5aa9e6', hpEmpty: '#0a121c', textColor: '#f2f8ff', glow: 0.6, c300: '#7cc8ff', c100: '#9be7c4', keyColor: '#8fb8dc' } },
  { id: 'ambre', name: 'Ambre', desc: 'Tons chauds cuivrés, ambiance coucher de soleil.', tosu: [],
    hud: { tubeColor: '#ffb547', panelColor: '#4a3420', hpColor: '#ff9a3c', hpEmpty: '#160d05', textColor: '#fff6ea', glow: 1.2, c300: '#ffcf6b', c100: '#b8e07a', c50: '#ff8f5a', keyColor: '#e0a35c' } },
  { id: 'tournoi', name: 'Tournoi', desc: 'Formes droites et sobres, sans lueur, classement court.', tosu: [],
    hud: { tubeShape: 'straight', panelShape: 'round', glow: 0, panelColor: '#1d1f24', tubeColor: '#e9ecf1', hpColor: '#e9ecf1', hpEmpty: '#0c0d10', boardRows: 6, boardOpacity: 0.6 } },
  { id: 'mono', name: 'Monochrome', desc: 'Noir et blanc, idéal pour les montages épurés.', tosu: [],
    hud: { tubeColor: '#d9d9de', panelColor: '#3a3a40', hpColor: '#f4f4f6', hpEmpty: '#0a0a0b', glow: 0.4, c300: '#ffffff', c100: '#bdbdc3', c50: '#7a7a80', keyColor: '#bdbdc3' } },
];

// Thèmes rapides pour personnaliser n'importe quel preset (y compris la Référence) sans le modifier.
export const THEMES = [
  ['Origine', {}],
  ['Rose', { tubeColor: '#ff6fa8', hpColor: '#ff6fa8', panelColor: '#3b2433' }],
  ['Menthe', { tubeColor: '#7fe0c0', hpColor: '#4fc79e', panelColor: '#24393a' }],
  ['Lavande', { tubeColor: '#c6b7ff', hpColor: '#9d88ff', panelColor: '#2f2a45' }],
  ['Soleil', { tubeColor: '#ffd36b', hpColor: '#ffb43d', panelColor: '#40361f' }],
  ['Rubis', { tubeColor: '#ff6b74', hpColor: '#e8434e', panelColor: '#3d1f24' }],
];

export function widgetPlacement(widget, maxWidth = 1920, maxHeight = 1080) {
  const [width, height] = widget.resolution || [];
  const w = Number(width) > 1 ? Number(width) : 600;
  const h = Number(height) > 1 ? Number(height) : 200;
  const s = Math.min(1, maxWidth / w, maxHeight / h);
  return { folder: widget.folder, name: widget.name, x: Math.round((1920 - w * s) / 2), y: Math.round((1080 - h * s) / 2), w, h, s, o: 1, ...(widget.glass > 0 ? { glass: widget.glass, glassBlur: widget.glassBlur || 18 } : {}) };
}

export function dancingPresets() {
  const layouts = [
    ['track', 'Carte musicale', 'Beatmap et progression', [['track', 32, 32], ['progress', 32, 940]]],
    ['precision', 'Précision', 'Précision, stabilité et erreurs', [['accuracy', 32, 32], ['timing', 32, 122], ['misses', 32, 212]]],
    ['broadcast', 'Diffusion', 'Beatmap, score et performance', [['track', 32, 32], ['score', 1636, 32], ['pp', 1672, 122], ['combo', 1712, 212]]],
    ['minimal', 'Minimal', 'Vie et combo en bas à droite', [['health', 1608, 960], ['combo', 1712, 870]]],
  ];
  return layouts.map(([id, name, desc, items]) => {
    const tosu = items.map(([key, x, y]) => {
      const { folder, name, w, h } = DANCING_WIDGETS.find(w => w.id === key);
      return { folder, name, x, y, w, h, s: 1, o: 1 };
    });
    return {
      id: 'dancing-' + id, name, desc, tosu,
      hud: { showTop: false, showBottom: false, showHitError: false, showKeys: false, showBoard: false, showGraph: false },
    };
  });
}
