// Décodeur LZMA (format « alone » des replays osu!), d'après la spécification de référence LzmaSpec.cpp.
// Node n'a pas de LZMA intégré ; ce fichier évite d'ajouter une dépendance pour lire les frames des .osr.

export function lzmaDecode(buf) {
  let d = buf[0];
  const lc = d % 9; d = (d / 9) | 0;
  const lp = d % 5, pb = (d / 5) | 0;
  const dictSize = Math.max(buf.readUInt32LE(1), 4096);
  const lo = buf.readUInt32LE(5), hi = buf.readUInt32LE(9);
  const known = !(lo === 0xffffffff && hi === 0xffffffff), size = known ? hi * 2 ** 32 + lo : -1;
  let out = new Uint8Array(known ? size : Math.max(1 << 16, buf.length * 8)), n = 0;
  const grow = need => { if (need <= out.length) return; const o = new Uint8Array(Math.max(need, out.length * 2)); o.set(out); out = o; };

  // Décodeur d'intervalle
  let pos = 13, range = 0xffffffff, code = 0;
  if (buf[pos++] !== 0) throw Error('Flux LZMA invalide.');
  for (let i = 0; i < 4; i++) code = ((code << 8) | buf[pos++]) >>> 0;
  const norm = () => { if (range < 0x1000000) { range = (range << 8) >>> 0; code = ((code << 8) | (buf[pos++] ?? 0)) >>> 0; } };
  const bit = (p, i) => {
    const v = p[i], bound = (range >>> 11) * v;
    let b;
    if (code < bound) { p[i] = v + ((2048 - v) >>> 5); range = bound; b = 0; }
    else { p[i] = v - (v >>> 5); code -= bound; range -= bound; b = 1; }
    norm(); return b;
  };
  const direct = k => { let r = 0; while (k--) { range >>>= 1; let b = 0; if (code >= range) { code -= range; b = 1; } r = ((r << 1) | b) >>> 0; norm(); } return r; };
  const tree = (p, off, k) => { let m = 1; for (let i = 0; i < k; i++) m = (m << 1) | bit(p, off + m); return m - (1 << k); };
  const treeRev = (p, off, k) => { let m = 1, s = 0; for (let i = 0; i < k; i++) { const b = bit(p, off + m); m = (m << 1) | b; s |= b << i; } return s; };
  const probs = k => new Uint16Array(k).fill(1024);
  const lenCoder = () => ({ choice: probs(2), low: probs(16 << 3), mid: probs(16 << 3), high: probs(256) });
  const decodeLen = (L, ps) => !bit(L.choice, 0) ? tree(L.low, ps << 3, 3) : !bit(L.choice, 1) ? 8 + tree(L.mid, ps << 3, 3) : 16 + tree(L.high, 0, 8);

  const lit = probs(0x300 << (lc + lp)), posSlot = probs(4 << 6), posDec = probs(115), align = probs(16);
  const isMatch = probs(12 << 4), isRep = probs(12), isRepG0 = probs(12), isRepG1 = probs(12), isRepG2 = probs(12), isRep0Long = probs(12 << 4);
  const lenDec = lenCoder(), repLenDec = lenCoder();
  let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
  const pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;

  while (!(known && n >= size)) {
    const ps = n & pbMask;
    if (!bit(isMatch, (state << 4) + ps)) {
      const prev = n > 0 ? out[n - 1] : 0, base = 0x300 * (((n & lpMask) << lc) + (prev >> (8 - lc)));
      let s = 1;
      if (state >= 7) {
        let mb = out[n - rep0 - 1];
        do { const m = (mb >> 7) & 1; mb <<= 1; const b = bit(lit, base + ((1 + m) << 8) + s); s = (s << 1) | b; if (m !== b) break; } while (s < 0x100);
      }
      while (s < 0x100) s = (s << 1) | bit(lit, base + s);
      grow(n + 1); out[n++] = s - 0x100;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }
    let len;
    if (bit(isRep, state)) {
      if (n === 0) throw Error('Flux LZMA invalide.');
      if (!bit(isRepG0, state)) {
        if (!bit(isRep0Long, (state << 4) + ps)) { state = state < 7 ? 9 : 11; grow(n + 1); out[n] = out[n - rep0 - 1]; n++; continue; }
      } else {
        let dist;
        if (!bit(isRepG1, state)) dist = rep1;
        else { if (!bit(isRepG2, state)) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
        rep1 = rep0; rep0 = dist;
      }
      len = decodeLen(repLenDec, ps); state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      len = decodeLen(lenDec, ps); state = state < 7 ? 7 : 10;
      const slot = tree(posSlot, Math.min(len, 3) << 6, 6);
      if (slot < 4) rep0 = slot;
      else {
        const k = (slot >> 1) - 1;
        let dist = ((2 | (slot & 1)) << k) >>> 0;
        if (slot < 14) dist += treeRev(posDec, dist - slot, k);
        else dist += (direct(k - 4) << 4 >>> 0) + treeRev(align, 0, 4);
        rep0 = dist >>> 0;
      }
      if (rep0 === 0xffffffff) break;                    // marqueur de fin
      if (rep0 >= n || rep0 >= dictSize) throw Error('Flux LZMA invalide.');
    }
    len += 2;
    if (known) len = Math.min(len, size - n);
    grow(n + len);
    for (; len > 0; len--, n++) out[n] = out[n - rep0 - 1];
  }
  return Buffer.from(out.buffer, out.byteOffset, n);
}
