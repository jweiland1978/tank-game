const MUTE_KEY = 'ironrig-muted';
const VOL_KEY = 'ironrig-volume';

let ctx = null;
let noiseBuf = null;
let muted = false;
let volume = 0.85;
let whistle = null;
let whistleGain = null;
let master = null;
let comp = null;
let rollerOsc = null;
let rollerGain = null;
let crackleOn = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
  const stored = parseFloat(localStorage.getItem(VOL_KEY));
  if (Number.isFinite(stored)) volume = Math.max(0, Math.min(1, stored));
} catch (e) {
  muted = false;
}

function persist() {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    localStorage.setItem(VOL_KEY, String(volume));
  } catch (e) { /* private mode */ }
}

function applyGain() {
  if (!master || !ctx) return;
  const v = muted ? 0.0001 : Math.max(0.0001, volume * 0.95);
  try { master.gain.setTargetAtTime(v, ctx.currentTime, 0.03); } catch (e) {
    try { master.gain.value = v; } catch (err) { /* ignore */ }
  }
}

export function isMuted() {
  return muted;
}

export function getVolume() {
  return volume;
}

export function setMuted(v) {
  muted = !!v;
  persist();
  applyGain();
  if (muted) hush();
}

export function setVolume(v) {
  const n = Number(v);
  volume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : volume;
  if (volume > 0.02 && muted) muted = false;
  persist();
  applyGain();
}

export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0.0001 : volume * 0.95;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 16;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.16;
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
  stopRoller();
}

function live() {
  return !!(ctx && !muted && volume > 0.01);
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

function tone(type, f0, f1, peak, attack, dur, t0) {
  if (!ctx) return;
  const t = t0 != null ? t0 : ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = envGain(t, peak, attack, dur);
  o.connect(g);
  g.connect(out());
  o.start(t);
  o.stop(t + dur + 0.04);
}

export function thump() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone('sine', 180, 48, 0.34, 0.006, 0.14, t);
  noiseBurst(t, 0.07, 0.22, 1800, 280);
}

export function boom(size, pop) {
  if (!live()) return;
  const t = ctx.currentTime;
  const s = Math.max(0.25, Math.min(1.6, size));
  if (pop) {
    tone('triangle', 520, 160, 0.1, 0.004, 0.08, t);
    noiseBurst(t, 0.05, 0.08, 2200, 700);
    return;
  }
  // Layered: noise crack, low thump, short tail. Scale with radius.
  noiseBurst(t, 0.08 + s * 0.06, 0.22 + s * 0.12, 2400, 400);
  noiseBurst(t + 0.02, 0.22 + s * 0.2, 0.18 + s * 0.12, 900, 90);
  tone('sine', Math.max(42, 96 - s * 28), Math.max(26, 40 - s * 10), 0.18 + s * 0.16, 0.012, 0.42 + s * 0.28, t);
  tone('triangle', 70 + s * 20, 32, 0.08 + s * 0.05, 0.02, 0.55 + s * 0.2, t + 0.04);
}

export function thud() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone('sine', 70, 32, 0.22, 0.01, 0.22, t);
  noiseBurst(t, 0.12, 0.1, 200, 80);
}

export function magnetThump() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone('sine', 52, 22, 0.38, 0.008, 0.32, t);
  tone('triangle', 90, 36, 0.16, 0.01, 0.22, t);
  noiseBurst(t, 0.18, 0.2, 280, 60);
  noiseBurst(t + 0.04, 0.22, 0.12, 900, 140);
}

export function death() {
  boom(1.25, false);
  if (!live()) return;
  const t = ctx.currentTime + 0.02;
  tone('square', 540, 90, 0.08, 0.004, 0.2, t);
}

export function crackle() {
  if (!live()) return;
  const t = ctx.currentTime;
  const hop = Math.random() * 0.05;
  noiseBurst(t + hop, 0.05 + Math.random() * 0.05, 0.045 + Math.random() * 0.03, 2800 + Math.random() * 1200, 500);
  if (Math.random() < 0.55) {
    tone('triangle', 160 + Math.random() * 120, 60, 0.03, 0.003, 0.07, t + hop);
  }
}

export function setCrackle(on) {
  crackleOn = !!on;
}

export function rumble() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone('sine', 58, 24, 0.34, 0.02, 1.15, t);
  noiseBurst(t, 0.9, 0.22, 420, 70);
  noiseBurst(t + 0.08, 0.55, 0.1, 1400, 180);
  // Nuke crack over the rumble.
  noiseBurst(t, 0.12, 0.28, 3200, 400);
  tone('square', 220, 40, 0.06, 0.004, 0.18, t);
}

export function startRoller() {
  if (!live() || !ctx) return;
  if (rollerOsc) return;
  const t = ctx.currentTime;
  rollerOsc = ctx.createOscillator();
  rollerOsc.type = 'sawtooth';
  rollerOsc.frequency.setValueAtTime(48, t);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  rollerGain = ctx.createGain();
  rollerGain.gain.setValueAtTime(0.0001, t);
  rollerGain.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
  rollerOsc.connect(filter);
  filter.connect(rollerGain);
  rollerGain.connect(out());
  try { rollerOsc.start(); } catch (e) { /* ignore */ }
}

export function stopRoller() {
  if (!rollerGain || !ctx) {
    rollerOsc = null;
    rollerGain = null;
    return;
  }
  const t = ctx.currentTime;
  try { rollerGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); } catch (e) { /* ignore */ }
  const osc = rollerOsc;
  rollerOsc = null;
  rollerGain = null;
  if (osc) {
    try { osc.stop(t + 0.12); } catch (e) { /* ignore */ }
  }
}

export function popcornPop() {
  if (!live()) return;
  const t = ctx.currentTime;
  const f = 820 + Math.random() * 380;
  tone('triangle', f, f * 0.45, 0.055, 0.001, 0.055, t);
  tone('sine', f * 1.6, f * 0.7, 0.03, 0.001, 0.04, t);
  noiseBurst(t, 0.028, 0.045, 3400, 1400);
}

export function magnetHum() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone('sine', 62, 36, 0.16, 0.06, 0.95, t);
  tone('triangle', 124, 70, 0.08, 0.08, 0.8, t);
  tone('sine', 248, 90, 0.045, 0.1, 0.7, t);
  noiseBurst(t, 0.7, 0.1, 420, 70);
}

export function zap() {
  if (!live()) return;
  const t = ctx.currentTime;
  noiseBurst(t, 0.12, 0.2, 4200, 600);
  tone('square', 880, 140, 0.08, 0.002, 0.12, t);
  tone('sawtooth', 240, 60, 0.06, 0.004, 0.18, t + 0.02);
}

export function click() {
  if (!live()) return;
  tone('square', 880, 440, 0.04, 0.002, 0.04, ctx.currentTime);
}

export function ching() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone('sine', 880, 1320, 0.08, 0.004, 0.12, t);
  tone('sine', 1320, 1760, 0.05, 0.006, 0.16, t + 0.05);
}

export function sellBlip() {
  if (!live()) return;
  tone('sine', 520, 220, 0.06, 0.004, 0.1, ctx.currentTime);
}

export function buzz() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone('square', 140, 90, 0.08, 0.004, 0.12, t);
  noiseBurst(t, 0.1, 0.05, 400, 120);
}

export function tauntBlip() {
  if (!live()) return;
  tone('sine', 640, 880, 0.05, 0.004, 0.09, ctx.currentTime);
}

export function turnChime() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone('sine', 392, 392, 0.05, 0.01, 0.12, t);
  tone('sine', 523, 523, 0.045, 0.01, 0.14, t + 0.09);
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
    whistleGain.gain.setTargetAtTime(0.02 * volume, t, 0.08);
  } catch (e) { /* ignore */ }
}
