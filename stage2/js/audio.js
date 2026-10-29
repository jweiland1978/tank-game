const KEY = 'ironrig-muted';

let ctx = null;
let noiseBuf = null;
let muted = false;
let whistle = null;
let whistleGain = null;
let master = null;
let comp = null;

try {
  muted = localStorage.getItem(KEY) === '1';
} catch (e) {
  muted = false;
}

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* private mode */ }
  if (master && ctx) {
    try { master.gain.setValueAtTime(muted ? 0.0001 : 0.9, ctx.currentTime); } catch (e) { /* ignore */ }
  }
  if (muted) hush();
}

export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0.0001 : 0.9;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 18;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      master.connect(comp);
      comp.connect(ctx.destination);
      const len = Math.min(ctx.sampleRate, 48000);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (e) {
    ctx = null;
  }
}

function hush() {
  if (whistleGain && ctx) {
    try { whistleGain.gain.setValueAtTime(0.0001, ctx.currentTime); } catch (e) { /* ignore */ }
  }
}

function out() {
  return master || (ctx && ctx.destination);
}

function envGain(t, peak, attack, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
  return g;
}

function noiseBurst(t, dur, peak, freq0, freq1) {
  if (!noiseBuf || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.max(80, freq0), t);
  if (freq1) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq1), t + dur);
  const g = envGain(t, peak, 0.008, dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(out());
  src.start(t);
  src.stop(t + dur + 0.03);
}

export function thump() {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
  const g = envGain(t, 0.34, 0.006, 0.14);
  o.connect(g);
  g.connect(out());
  o.start(t);
  o.stop(t + 0.16);
  noiseBurst(t, 0.07, 0.22, 1800, 280);
}

export function boom(size, pop) {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  const s = Math.max(0.25, Math.min(1.4, size));
  if (pop) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.07);
    const g = envGain(t, 0.1, 0.004, 0.08);
    o.connect(g);
    g.connect(out());
    o.start(t);
    o.stop(t + 0.1);
    noiseBurst(t, 0.05, 0.08, 2200, 700);
    return;
  }
  const o = ctx.createOscillator();
  o.type = 'sine';
  const f0 = Math.max(42, 90 - s * 28);
  o.frequency.setValueAtTime(f0 + 30, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(28, f0 * 0.55), t + 0.32 + s * 0.16);
  const g = envGain(t, 0.16 + s * 0.14, 0.012, 0.42 + s * 0.22);
  o.connect(g);
  g.connect(out());
  o.start(t);
  o.stop(t + 0.75);
  noiseBurst(t, 0.22 + s * 0.18, 0.2 + s * 0.12, 900, 120);
  noiseBurst(t + 0.05, 0.18, 0.06 + s * 0.04, 2400, 400);
}

export function thud() {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.16);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(220, t);
  const g = envGain(t, 0.22, 0.01, 0.22);
  o.connect(filter);
  filter.connect(g);
  g.connect(out());
  o.start(t);
  o.stop(t + 0.24);
  noiseBurst(t, 0.12, 0.1, 200, 80);
}

export function death() {
  boom(1.25, false);
  if (muted || !ctx) return;
  const t = ctx.currentTime + 0.02;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(540, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.18);
  const g = envGain(t, 0.08, 0.004, 0.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 3;
  o.connect(filter);
  filter.connect(g);
  g.connect(out());
  o.start(t);
  o.stop(t + 0.22);
}

export function crackle() {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  noiseBurst(t, 0.09, 0.07, 3400, 900);
  noiseBurst(t + 0.04, 0.07, 0.045, 1800, 500);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(180 + Math.random() * 80, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
  const g = envGain(t, 0.04, 0.004, 0.09);
  o.connect(g);
  g.connect(out());
  o.start(t);
  o.stop(t + 0.1);
}

export function rumble() {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(58, t);
  o.frequency.exponentialRampToValueAtTime(24, t + 1.05);
  const g = envGain(t, 0.34, 0.02, 1.15);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(180, t);
  filter.frequency.exponentialRampToValueAtTime(50, t + 1);
  o.connect(filter);
  filter.connect(g);
  g.connect(out());
  o.start(t);
  o.stop(t + 1.25);
  noiseBurst(t, 0.9, 0.22, 420, 70);
  noiseBurst(t + 0.08, 0.55, 0.1, 1400, 180);
}

export function updateFlight(flying, speed, vy) {
  if (!ctx || muted || !flying) {
    if (whistleGain && ctx) {
      try { whistleGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
    }
    return;
  }
  const t = ctx.currentTime;
  if (!whistle) {
    whistle = ctx.createOscillator();
    whistle.type = 'sine';
    whistleGain = ctx.createGain();
    whistleGain.gain.setValueAtTime(0.0001, t);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 5;
    whistle.connect(filter);
    filter.connect(whistleGain);
    whistleGain.connect(out());
    whistle.start();
  }
  const base = 760 + Math.min(640, (speed || 0) * 0.4);
  const freq = (vy || 0) > 30 ? base * 0.62 : base;
  try {
    whistle.frequency.setTargetAtTime(Math.max(180, freq), t, 0.06);
    whistleGain.gain.setTargetAtTime(0.02, t, 0.08);
  } catch (e) { /* ignore */ }
}
