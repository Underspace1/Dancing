// Carte graphique en 3D (Three.js) pour la section « Sous le capot ».
// Modèle procédural original : circuit, puce, mémoire, radiateur, caloducs, capot, ventilateurs, plaque arrière.
// La progression de défilement (0 → 1) pilote l'éclatement, la caméra, la pièce mise en avant et le flux d'air.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';

const LEN = 30, DEP = 12;                       // longueur (x) et largeur (z) de la carte
const ACCENT = new THREE.Color('#7aa7ff'), AIR = new THREE.Color('#9fe2ff');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const band = (p, a, b, f = 0.03) => smooth(clamp((p - a) / f)) * (1 - smooth(clamp((p - b) / f)));

// ---------- textures dessinées ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
const pcbTexture = () => canvasTex(2048, 820, (g, w, h) => {
  const r = rng(11), sx = w / LEN, sz = h / DEP, X = x => (x + LEN / 2) * sx, Z = z => (z + DEP / 2) * sz;
  g.fillStyle = '#0b1511'; g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(X(-1.5), Z(0), 40, X(-1.5), Z(0), 900); gr.addColorStop(0, 'rgba(40,70,55,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // pistes : segments orthogonaux avec coudes à 45°
  for (let k = 0; k < 420; k++) {
    let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 3; s++) { const l = 30 + r() * 160, d = Math.floor(r() * 4); if (d === 0) x += l; else if (d === 1) y += l * .6; else if (d === 2) { x += l * .5; y += l * .5; } else { x -= l * .5; y += l * .5; } g.lineTo(x, y); }
    g.strokeStyle = r() < .85 ? 'rgba(46,92,70,.55)' : 'rgba(170,140,70,.5)'; g.lineWidth = 1 + r() * 2.2; g.stroke();
  }
  // pastilles et vias
  for (let k = 0; k < 900; k++) { g.fillStyle = r() < .5 ? 'rgba(190,160,90,.6)' : 'rgba(20,35,28,1)'; g.beginPath(); g.arc(r() * w, r() * h, 1.5 + r() * 2, 0, 7); g.fill(); }
  // sérigraphie
  g.strokeStyle = 'rgba(230,236,232,.55)'; g.lineWidth = 2; g.fillStyle = 'rgba(230,236,232,.7)'; g.font = '600 22px "JetBrains Mono", monospace';
  g.strokeRect(X(-4.4), Z(-2.9), 5.8 * sx, 5.8 * sz);
  g.fillText('U1  GPU', X(-4.3), Z(-3.1));
  [[-6.6, -4.5], [-3.9, -5.2], [0.9, -5.2], [3.6, -4.5], [-6.6, 3.5], [-3.9, 4.2], [0.9, 4.2], [3.6, 3.5]].forEach(([x, z], i) => g.fillText('M' + (i + 1), X(x), Z(z) - 6));
  g.font = '700 26px "Inter Tight", sans-serif'; g.fillText('DANCING!  RT-01', X(9.5), Z(4.8));
  g.font = '500 18px "JetBrains Mono", monospace'; g.fillText('REV 3.4  ·  PCIe x16', X(9.5), Z(5.5));
});
const backTexture = () => canvasTex(2048, 820, (g, w, h) => {
  const lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, '#202227'); lg.addColorStop(.5, '#2a2c32'); lg.addColorStop(1, '#1d1f24');
  g.fillStyle = lg; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(255,255,255,${.012 + Math.random() * .02})`; g.fillRect(0, y, w, 1); }   // brossé
  g.fillStyle = '#0d0e11';
  for (let c = 0; c < 26; c++) for (let rr = 0; rr < 4; rr++) { const x = 1250 + c * 28, y = 150 + rr * 140; g.beginPath(); g.roundRect(x, y, 12, 110, 6); g.fill(); }
  g.fillStyle = 'rgba(230,232,236,.55)'; g.font = '700 54px "Inter Tight", sans-serif'; g.fillText('DANCING!', 160, 460);
});
const labelTexture = (text, sub) => canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(230,232,236,.85)'; g.font = '700 46px "Inter Tight", sans-serif'; g.fillText(text, 8, 62);
  if (sub) { g.fillStyle = 'rgba(160,166,178,.8)'; g.font = '500 22px "JetBrains Mono", monospace'; g.fillText(sub, 10, 102); }
});
const chipTexture = text => canvasTex(256, 192, (g, w, h) => {
  g.fillStyle = '#121316'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(200,204,212,.55)'; g.font = '600 22px "JetBrains Mono", monospace'; g.fillText(text, 18, 80); g.font = '500 16px "JetBrains Mono", monospace'; g.fillText('16Gb  G6X', 18, 112);
  g.beginPath(); g.arc(22, 160, 6, 0, 7); g.fill();
});
function shadowTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// ---------- géométries ----------
function bladeGeometry(r0, r1) {
  const s = new THREE.Shape();
  s.moveTo(r0, -0.5);
  s.quadraticCurveTo((r0 + r1) * .55, -1.15, r1, -0.15);
  s.quadraticCurveTo(r1 + .12, .45, r1 - .2, 1.05);
  s.quadraticCurveTo((r0 + r1) * .5, .45, r0, .5);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .07, bevelEnabled: true, bevelThickness: .02, bevelSize: .03, bevelSegments: 2, curveSegments: 18 });
  g.rotateX(-Math.PI / 2); g.rotateX(.42);           // couchée puis inclinée (pas de l'hélice)
  return g;
}
function shroudGeometry(holes) {
  const s = new THREE.Shape(), w = LEN / 2, d = DEP / 2, r = 1.1;
  s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d);
  s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
  for (const [x, rad] of holes) { const h = new THREE.Path(); h.absarc(x, 0, rad, 0, Math.PI * 2, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: .5, bevelEnabled: true, bevelThickness: .14, bevelSize: .14, bevelSegments: 4, curveSegments: 64 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export function mountGPU(host, { calm = false } = {}) {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch { canvas.remove(); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-12, 24, 18); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 1.6); rim.position.set(18, 8, -20); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x404858, .5));

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  const card = new THREE.Group(); scene.add(card);

  // matériaux
  const M = {
    shroud: new THREE.MeshPhysicalMaterial({ color: 0x1a1c21, metalness: .75, roughness: .38, clearcoat: .4, clearcoatRoughness: .3, transparent: true }),
    trim: new THREE.MeshPhysicalMaterial({ color: 0xc9ced8, metalness: 1, roughness: .28, transparent: true }),
    led: new THREE.MeshStandardMaterial({ color: 0x0b0d12, emissive: ACCENT, emissiveIntensity: 1.6, transparent: true }),
    blade: new THREE.MeshPhysicalMaterial({ color: 0x15161a, metalness: .1, roughness: .55, clearcoat: .2, side: THREE.DoubleSide, transparent: true }),
    hub: new THREE.MeshPhysicalMaterial({ color: 0x23252b, metalness: .9, roughness: .3, transparent: true }),
    fanRing: new THREE.MeshStandardMaterial({ color: 0x0e0f12, metalness: .4, roughness: .5, emissive: ACCENT, emissiveIntensity: 0, transparent: true }),
    fin: new THREE.MeshStandardMaterial({ color: 0xb7bcc5, metalness: 1, roughness: .32, transparent: true }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc27a4e, metalness: 1, roughness: .24, transparent: true }),
    pcb: new THREE.MeshStandardMaterial({ map: pcbTexture(), roughness: .62, metalness: .15 }),
    substrate: new THREE.MeshStandardMaterial({ color: 0x1f2a1d, roughness: .55, metalness: .2 }),
    die: new THREE.MeshPhysicalMaterial({ color: 0x15171c, metalness: 1, roughness: .12, clearcoat: 1, emissive: ACCENT, emissiveIntensity: 0 }),
    enc: new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: .2, metalness: .6, emissive: ACCENT, emissiveIntensity: 0, transparent: true, opacity: .0 }),
    vram: new THREE.MeshStandardMaterial({ map: chipTexture('DNC-G6'), roughness: .45, metalness: .3, emissive: ACCENT, emissiveIntensity: 0 }),
    choke: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: .5, metalness: .6 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x8b9099, roughness: .3, metalness: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8ab4f, roughness: .22, metalness: 1, emissive: ACCENT, emissiveIntensity: 0 }),
    bracket: new THREE.MeshPhysicalMaterial({ color: 0x9aa0aa, metalness: 1, roughness: .35 }),
    port: new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: .6 }),
    back: new THREE.MeshPhysicalMaterial({ map: backTexture(), metalness: .85, roughness: .42, clearcoat: .3 }),
  };

  // ----- plaque arrière -----
  const back = new THREE.Group(); card.add(back);
  back.add(new THREE.Mesh(new RoundedBoxGeometry(LEN, .14, DEP, 3, .07), M.back));

  // ----- circuit et composants -----
  const pcbG = new THREE.Group(); card.add(pcbG);
  pcbG.add(new THREE.Mesh(new RoundedBoxGeometry(LEN - .2, .16, DEP - .3, 2, .05), M.pcb));
  const tab = new THREE.Mesh(new THREE.BoxGeometry(14.5, .16, .9), M.pcb); tab.position.set(-1.2, 0, DEP / 2 - .1 + .45); pcbG.add(tab);
  const fingers = new THREE.InstancedMesh(new THREE.BoxGeometry(.32, .03, .75), M.gold, 36);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) { mtx.makeTranslation(-8.1 + i * .4, .095, DEP / 2 + .38); fingers.setMatrixAt(i, mtx); }
  pcbG.add(fingers);
  const DIE = new THREE.Vector3(-1.5, 0, 0);
  const pkg = new THREE.Mesh(new RoundedBoxGeometry(5.6, .16, 5.6, 2, .04), M.substrate); pkg.position.set(DIE.x, .16, DIE.z); pcbG.add(pkg);
  const die = new THREE.Mesh(new RoundedBoxGeometry(3.4, .14, 3.4, 2, .03), M.die); die.position.set(DIE.x, .3, DIE.z); pcbG.add(die);
  const enc = new THREE.Mesh(new THREE.BoxGeometry(1.05, .02, 1.05), M.enc); enc.position.set(DIE.x + 1.05, .385, DIE.z - 1.05); pcbG.add(enc);
  const VRAM = [[-6.6, -3.9], [-3.9, -4.6], [.9, -4.6], [3.6, -3.9], [-6.6, 3.9], [-3.9, 4.6], [.9, 4.6], [3.6, 3.9]];
  VRAM.forEach(([x, z]) => { const m = new THREE.Mesh(new RoundedBoxGeometry(1.9, .16, 1.3, 2, .03), M.vram); m.position.set(x + .6, .16, z); pcbG.add(m); });
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new RoundedBoxGeometry(.85, .7, .85, 2, .08), M.choke); c.position.set(6.8 + (i % 3) * 1.15, .42, -3.6 + Math.floor(i / 3) * 1.25); pcbG.add(c); }
  for (let i = 0; i < 12; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .55, 20), M.cap); c.position.set(10.8 + (i % 4) * .7, .36, -3.4 + Math.floor(i / 4) * .9); pcbG.add(c); }
  const power = new THREE.Mesh(new RoundedBoxGeometry(2.4, .9, 1.2, 2, .1), M.port); power.position.set(12.4, .55, -DEP / 2 + 1.1); pcbG.add(power);
  // équerre et sorties vidéo
  const bracket = new THREE.Mesh(new RoundedBoxGeometry(.14, 4.4, DEP + .4, 2, .05), M.bracket); bracket.position.set(-LEN / 2 - .2, 1.6, 0); pcbG.add(bracket);
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new RoundedBoxGeometry(.3, .9, i < 3 ? 1.9 : 1.6, 2, .06), M.port); p.position.set(-LEN / 2 - .3, .35, -4 + i * 2.6); pcbG.add(p); }

  // ----- radiateur : ailettes, socle cuivre, caloducs -----
  const heat = new THREE.Group(); card.add(heat);
  const FINS = 104, fins = new THREE.InstancedMesh(new THREE.BoxGeometry(.07, 1.75, DEP - .9), M.fin, FINS);
  for (let i = 0; i < FINS; i++) { mtx.makeTranslation(-LEN / 2 + .9 + i * ((LEN - 1.8) / (FINS - 1)), 1.42, 0); fins.setMatrixAt(i, mtx); }
  heat.add(fins);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(5.2, .34, 5.2, 2, .05), M.copper); plate.position.set(DIE.x, .55, DIE.z); heat.add(plate);
  [-1.8, -.6, .6, 1.8].forEach((z, i) => {
    const dir = i % 2 ? 1 : -1, xe = dir * (LEN / 2 - 1.6);
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(DIE.x - dir * 1.6, .62, z), new THREE.Vector3(DIE.x + dir * 2.5, .66, z), new THREE.Vector3(xe * .75, .8, z), new THREE.Vector3(xe, 1.3, z), new THREE.Vector3(xe, 2.15, z)]);
    heat.add(new THREE.Mesh(new THREE.TubeGeometry(path, 64, .17, 14), M.copper));
  });

  // ----- capot et ventilateurs -----
  const top = new THREE.Group(); card.add(top);
  const FANS = [-9.7, 0, 9.7], R = 4.25;
  const shroud = new THREE.Mesh(shroudGeometry(FANS.map(x => [x, R])), M.shroud); shroud.position.y = 2.35; top.add(shroud);
  // arêtes satinées entre les ventilateurs et liseré lumineux
  [-4.85, 4.85].forEach(x => { const t = new THREE.Mesh(new RoundedBoxGeometry(.5, .12, DEP - 1.6, 2, .05), M.trim); t.position.set(x, 3.06, 0); t.rotation.y = .12 * Math.sign(x); top.add(t); });
  const led = new THREE.Mesh(new RoundedBoxGeometry(LEN - 3, .06, .12, 2, .03), M.led); led.position.set(0, 3.02, DEP / 2 - .32); top.add(led);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: labelTexture('DANCING!', 'RT-01 · RENDER'), transparent: true, depthWrite: false }));
  plaque.rotation.x = -Math.PI / 2; plaque.position.set(LEN / 2 - 3.1, 3.03, -DEP / 2 + 1.0); top.add(plaque);
  const blade = bladeGeometry(1.05, 3.95), fans = [];
  FANS.forEach((x, k) => {
    const fan = new THREE.Group(); fan.position.set(x, 2.55, 0); top.add(fan);
    const rotor = new THREE.Group(); fan.add(rotor);
    for (let b = 0; b < 11; b++) { const m = new THREE.Mesh(blade, M.blade); m.rotation.y = b * Math.PI * 2 / 11; rotor.add(m); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.0, .07, 10, 96), M.fanRing); ring.rotation.x = Math.PI / 2; rotor.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.12, .5, 48), M.hub); rotor.add(hub);
    const capM = new THREE.MeshPhysicalMaterial({ map: labelTexture('D!', ''), color: 0xd9dde4, metalness: 1, roughness: .35, transparent: true });
    const cap = new THREE.Mesh(new THREE.CircleGeometry(.92, 48), capM); cap.rotation.x = -Math.PI / 2; cap.position.y = .26; rotor.add(cap);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(R - .05, .1, 12, 120), M.trim); frame.rotation.x = Math.PI / 2; frame.position.y = .35; fan.add(frame);
    fans.push({ rotor, dir: k === 1 ? -1 : 1 });       // le ventilateur central tourne dans l'autre sens
  });

  // ombre portée douce
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(46, 24), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -4.6; scene.add(shadow);

  // ----- flux d'air : particules aspirées par les ventilateurs, poussées à travers les ailettes -----
  const NP = calm ? 0 : 1100, pos = new Float32Array(NP * 3), col = new Float32Array(NP * 3), life = new Float32Array(NP), seed = new Float32Array(NP * 4);
  for (let i = 0; i < NP; i++) { life[i] = Math.random(); seed.set([Math.floor(Math.random() * 3), Math.random() * Math.PI * 2, .9 + Math.random() * 2.8, Math.random() < .5 ? -1 : 1], i * 4); }
  const airGeo = new THREE.BufferGeometry();
  airGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); airGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const air = new THREE.Points(airGeo, new THREE.PointsMaterial({ size: .16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  card.add(air);
  // données : paquets lumineux qui quittent le connecteur PCIe vers le processeur
  const ND = calm ? 0 : 160, dpos = new Float32Array(ND * 3), dcol = new Float32Array(ND * 3), dl = new Float32Array(ND).map(() => Math.random());
  const dataGeo = new THREE.BufferGeometry();
  dataGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dataGeo.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
  const data = new THREE.Points(dataGeo, new THREE.PointsMaterial({ size: .22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pcbG.add(data);

  // ----- caméra : un plan par chapitre, interpolé en douceur -----
  const SHOTS = [
    { at: 0.00, pos: [14, 22, 40], look: [-4.5, 0, 0] },       // la carte
    { at: 0.17, pos: [-20, 28, 48], look: [-5, 2.5, 0] },      // vue éclatée
    { at: 0.31, pos: [4, 13.5, 17.5], look: [-4, .2, 0] },       // puce
    { at: 0.45, pos: [-9, 15, 19], look: [-4.6, .2, 0] },      // mémoire
    { at: 0.59, pos: [2.5, 10, 11], look: [-2.2, .3, -1] },    // encodeur
    { at: 0.73, pos: [20, 19, 35], look: [-4, 4.5, 0] },       // refroidissement
    { at: 0.86, pos: [10, 12, 30], look: [-4, -1, 5] },       // PCIe
    { at: 1.00, pos: [14, 22, 40], look: [-4.5, 0, 0] },
  ];
  const cam = { pos: new THREE.Vector3(...SHOTS[0].pos), look: new THREE.Vector3(...SHOTS[0].look) };
  const tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
  function shotAt(p) {
    let i = 0; while (i < SHOTS.length - 2 && p > SHOTS[i + 1].at) i++;
    const a = SHOTS[i], b = SHOTS[i + 1], k = smooth(clamp((p - a.at) / (b.at - a.at) * 1.6 - .3));
    tPos.set(...a.pos).lerp(new THREE.Vector3(...b.pos), k); tLook.set(...a.look).lerp(new THREE.Vector3(...b.look), k);
  }

  // points d'ancrage des étiquettes (coordonnées du circuit)
  const anchors = {
    die: () => die.getWorldPosition(new THREE.Vector3()),
    vram: () => pcbG.localToWorld(new THREE.Vector3(VRAM[1][0] + .6, .3, VRAM[1][1])),
    enc: () => enc.getWorldPosition(new THREE.Vector3()),
    fans: () => fans[2].rotor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .4, 0)),
    pcie: () => pcbG.localToWorld(new THREE.Vector3(-1, .1, DEP / 2 + .5)),
  };

  let W = 1, H = 1, progress = 0, visible = true, raf = 0, last = performance.now(), spin = 0, yaw = 0;
  const fadeTop = v => { for (const m of [M.shroud, M.trim, M.led, M.blade, M.hub, M.fanRing]) m.opacity = v; plaque.material.opacity = v; for (const f of fans) f.rotor.children.at(-1).material.opacity = v; };
  const fadeHeat = v => { M.fin.opacity = v; M.copper.opacity = v; };

  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false); camera.aspect = W / H;
    camera.fov = W / H < 1 ? 44 : 30;
    // écran étroit : l'image remonte au-dessus du panneau de texte
    if (W / H < 1) camera.setViewOffset(W, H, 0, H * .17, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  function frame(now) {
    raf = 0;
    const real = Math.min(1, (now - last) / 1000), dt = Math.min(.05, real); last = now;
    const p = calm ? .17 : progress;
    // éclatement (0 → 1), levée des couches hautes pendant les plans sur les puces
    const ex = calm ? 1 : smooth(clamp((p - .08) / .14)) * (1 - smooth(clamp((p - .93) / .07)));
    const lift = calm ? 0 : band(p, .25, .66, .04);
    back.position.y = -.42 - 3.4 * ex;
    heat.position.y = 3.8 * ex + 7 * lift;
    top.position.y = 7.6 * ex + 13 * lift;
    fadeTop(1 - .88 * lift); fadeHeat(1 - .85 * lift);
    // la carte tourne doucement sur elle-même au début et à la fin
    const turn = 1 - smooth(clamp(ex * 1.4));
    yaw += ((calm ? 0 : Math.sin(now / 4200) * .22 * turn - .12 * (1 - turn)) - yaw) * (1 - Math.exp(-real * 3));
    card.rotation.y = yaw;
    // pièce mise en avant
    const hot = { die: band(p, .27, .41), vram: band(p, .41, .55), enc: band(p, .55, .69), fans: band(p, .69, .83), pcie: band(p, .83, .93) };
    const pulse = .75 + .25 * Math.sin(now / 260);
    M.die.emissiveIntensity = hot.die * .22 * pulse;
    M.vram.emissiveIntensity = hot.vram * .32 * pulse;
    M.enc.opacity = hot.enc * .9; M.enc.emissiveIntensity = hot.enc * 1.1 * pulse;
    M.gold.emissiveIntensity = hot.pcie * .45 * pulse;
    M.fanRing.emissiveIntensity = hot.fans * 1.4;
    // ventilateurs : plus rapides pendant le plan refroidissement
    const rpm = calm ? 0 : 5.5 + 9 * hot.fans;
    spin += dt * rpm; for (const f of fans) f.rotor.rotation.y = spin * f.dir;
    // flux d'air
    if (NP) {
      const strength = .35 + .65 * Math.max(hot.fans, 1 - ex) - .3 * lift, fy = top.position.y + 2.55, hy = heat.position.y + 1.4;
      for (let i = 0; i < NP; i++) {
        let l = life[i] + dt * (.28 + .2 * hot.fans) * (1 + (i % 7) * .05); if (l >= 1) l -= 1; life[i] = l;
        const f = seed[i * 4], a0 = seed[i * 4 + 1], r0 = seed[i * 4 + 2], side = seed[i * 4 + 3], cx = FANS[f];
        let x, y, z, b;
        if (l < .4) { const k = l / .4, ang = a0 + spin * .6 * fans[f].dir + k * 2; x = cx + Math.cos(ang) * r0; z = Math.sin(ang) * r0 * .9; y = fy + 4.5 * (1 - k) - .4; b = smooth(k) * .9; }
        else { const k = (l - .4) / .6, ang = a0; x = cx + Math.cos(ang) * r0 * (1 + k * .5); y = hy + Math.sin(a0 * 3) * .5; z = side * (Math.abs(Math.sin(ang)) * r0 * .5 + k * (DEP / 2 + 5)); b = (1 - k) * .9; }
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        const c = b * Math.max(0, strength); col[i * 3] = AIR.r * c; col[i * 3 + 1] = AIR.g * c; col[i * 3 + 2] = AIR.b * c;
      }
      airGeo.attributes.position.needsUpdate = true; airGeo.attributes.color.needsUpdate = true;
    }
    if (ND) {
      for (let i = 0; i < ND; i++) {
        let l = dl[i] + dt * .7; if (l >= 1) l -= 1; dl[i] = l;
        dpos[i * 3] = -8 + (i % 36) * .4; dpos[i * 3 + 1] = -.1 - l * 6; dpos[i * 3 + 2] = DEP / 2 + .4 + l * 3;
        const c = hot.pcie * (1 - l); dcol[i * 3] = ACCENT.r * c; dcol[i * 3 + 1] = ACCENT.g * c; dcol[i * 3 + 2] = ACCENT.b * c;
      }
      dataGeo.attributes.position.needsUpdate = true; dataGeo.attributes.color.needsUpdate = true;
    }
    // caméra
    shotAt(p);
    const narrow = W / H < 1, k = calm ? 1 : 1 - Math.exp(-real * 4);   // lissage selon le temps réel
    if (narrow) {   // recule jusqu'à ce que la carte tienne en largeur (même champ horizontal qu'en paysage)
      const f = Math.min(2.6, Math.max(1, .857 / (2 * Math.tan(THREE.MathUtils.degToRad(22)) * (W / H))));
      tLook.x *= .25; tPos.sub(tLook).multiplyScalar(f).add(tLook);
    }
    cam.pos.lerp(tPos, k); cam.look.lerp(tLook, k);
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
    renderer.render(scene, camera);
    // étiquettes
    const out = {};
    for (const [name, fn] of Object.entries(anchors)) {
      const v = fn().project(camera);
      out[name] = { x: (v.x * .5 + .5) * W, y: (-v.y * .5 + .5) * H, on: hot[name] > .6, front: v.z < 1 };
    }
    api.onFrame?.(out, p);
    if (visible && !calm) raf = requestAnimationFrame(frame);
  }

  const api = {
    set progress(v) { progress = v; },
    setVisible(v) { if (v === visible) return; visible = v; if (v && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    render() { if (!raf) raf = requestAnimationFrame(frame); },
    onFrame: null,
  };
  raf = requestAnimationFrame(frame);
  return api;
}
