// Injected first into every tosu widget served by Replay HUD.
// 1) Replaces WebSocket: tosu sockets (/ws, /websocket/v2, /websocket/v2/precise, /websocket/commands)
//    receive replay data from the parent page (window.parent.__tosuBus) instead of a live game.
// 2) Optional virtual clock (render mode): timers, requestAnimationFrame, performance.now/Date and
//    CSS/Web animations follow a clock the renderer advances frame by frame.
(() => {
  const seg = decodeURIComponent(location.pathname.split('/')[2] || '');
  window.COUNTER_PATH = window.COUNTER_PATH || seg;
  const bus = () => { try { return window.parent && window.parent.__tosuBus; } catch { return null; } };

  const RealWS = window.WebSocket;
  class FakeWS extends EventTarget {
    constructor(url) {
      super(); this.url = String(url); this.readyState = 0; this.protocol = ''; this.extensions = ''; this.binaryType = 'blob';
      const p = new URL(this.url, location.href).pathname;
      this.kind = /precise/.test(p) ? 'precise' : /commands/.test(p) ? 'commands' : /websocket\/v2/.test(p) ? 'v2' : /\/ws$/.test(p) ? 'v1' : /tokens/.test(p) ? 'tokens' : 'other';
      FakeWS.all.add(this);
      setTimeout(() => { this.readyState = 1; this._emit('open', {}); const b = bus(); if (b?.last) this.deliver(b.last); }, 0);
    }
    _emit(type, init) { const ev = Object.assign(new Event(type), init); this.dispatchEvent(ev); const h = this['on' + type]; if (typeof h === 'function') h.call(this, ev); }
    deliver(msgs) { if (this.readyState !== 1) return; const m = msgs[this.kind]; if (m) this._emit('message', { data: typeof m === 'string' ? m : JSON.stringify(m) }); }
    send(data) {
      const s = String(data);
      if (this.kind === 'commands') {
        const [cmd, ...rest] = s.split(':'); const arg = rest.join(':');
        if (cmd === 'getSettings') fetch(`/tosu-settings/${encodeURIComponent(arg || window.COUNTER_PATH)}`).then(r => r.json()).then(v => this._emit('message', { data: JSON.stringify({ command: 'getSettings', message: v }) })).catch(() => {});
      }
    }
    close() { this.readyState = 3; FakeWS.all.delete(this); this._emit('close', { code: 1000, reason: '' }); }
  }
  FakeWS.all = new Set(); FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS; window.__RealWebSocket = RealWS;
  window.__tosuDeliver = msgs => { for (const s of FakeWS.all) s.deliver(msgs); };

  // ---- virtual clock
  const real = { now: performance.now.bind(performance), dnow: Date.now, raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window), st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window), si: window.setInterval.bind(window), ci: window.clearInterval.bind(window), Date: window.Date };
  const vt = { on: false, t: 0, epoch: real.dnow(), timers: new Map(), id: 1, rafs: new Map(), anims: new Map() };
  window.__vt = vt;
  performance.now = () => vt.on ? vt.t : real.now();
  const VDate = class extends real.Date { constructor(...a) { if (a.length) super(...a); else super(vt.on ? vt.epoch + vt.t : real.dnow()); } static now() { return vt.on ? vt.epoch + vt.t : real.dnow(); } };
  window.Date = VDate;
  window.requestAnimationFrame = cb => { if (!vt.on) return real.raf(cb); const id = vt.id++; vt.rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { vt.rafs.delete(id); real.caf(id); };
  const addTimer = (fn, ms, args, every) => { if (!vt.on) return every ? real.si(fn, ms, ...args) : real.st(fn, ms, ...args); const id = vt.id++; vt.timers.set(id, { fn, at: vt.t + Math.max(0, +ms || 0), every: every ? Math.max(1, +ms || 1) : 0, args }); return id; };
  window.setTimeout = (fn, ms, ...a) => addTimer(fn, ms, a, false);
  window.setInterval = (fn, ms, ...a) => addTimer(fn, ms, a, true);
  window.clearTimeout = id => { vt.timers.delete(id); real.ct(id); };
  window.clearInterval = id => { vt.timers.delete(id); real.ci(id); };

  // Advance the virtual clock to `to` ms, running due timers, then one rAF batch, then syncing animations.
  vt.advanceTo = to => {
    for (let guard = 0; guard < 10000; guard++) {
      let next = null; for (const [id, x] of vt.timers) if (x.at <= to && (!next || x.at < next[1].at)) next = [id, x];
      if (!next) break;
      const [id, x] = next; vt.t = Math.max(vt.t, x.at);
      if (x.every) x.at += x.every; else vt.timers.delete(id);
      try { typeof x.fn === 'function' ? x.fn(...x.args) : (0, eval)(x.fn); } catch (e) { console.error(e); }
    }
    vt.t = to;
    const batch = [...vt.rafs.values()]; vt.rafs.clear();
    for (const cb of batch) { try { cb(vt.t); } catch (e) { console.error(e); } }
    for (const a of document.getAnimations()) {
      if (!vt.anims.has(a)) { vt.anims.set(a, vt.t); try { a.pause(); } catch { } }
      try {
        const local = vt.t - vt.anims.get(a), end = a.effect?.getComputedTiming?.().endTime;
        if (Number.isFinite(end) && local >= end) { a.finish(); vt.anims.delete(a); } else a.currentTime = local;
      } catch { vt.anims.delete(a); }
    }
  };
  vt.enable = () => { if (vt.on) return; vt.t = real.now(); vt.on = true; };
})();
