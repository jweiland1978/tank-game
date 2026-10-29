export const GAME_TITLE = 'Iron Rig';

export const WORLD_W = 1600;
export const WORLD_H = 900;
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

// Shell: power 100 at 45° reaches roughly one map-length. Wind is px/s² per HUD unit.
export const GRAVITY = 500;
export const POWER_SCALE = 8.4;
export const WIND_ACCEL = 8;
export const WIND_MIN = -10;
export const WIND_MAX = 10;

export const MAX_HP = 100;
export const FALL_SAFE = 20;
// Tuned so a deep test-carve hurts without deleting the tank outright.
export const FALL_DPH = 0.42;

export const MAX_PARTICLES = 2000;
export const DPR_CAP = 2;

export const TANK = {
  pivot: 44,
  barrel: 52,
  hitUp: 36,
  hitR: 30,
};

export const PALETTE = [
  { name: 'Red', color: '#ff4b4b', dark: '#8d1c1c', light: '#ffc1c1' },
  { name: 'Cyan', color: '#3de2ff', dark: '#0c6d86', light: '#d7f9ff' },
  { name: 'Lime', color: '#b6ff3a', dark: '#4c7a0e', light: '#e9ffc4' },
  { name: 'Gold', color: '#ffc83d', dark: '#8a6410', light: '#fff0c2' },
];

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

let reducePref = false;
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('ironrig-reduce') === '1') reducePref = true;
} catch (e) { /* private mode */ }

export function setReducePref(on) {
  reducePref = !!on;
  try { localStorage.setItem('ironrig-reduce', reducePref ? '1' : '0'); } catch (e) { /* ignore */ }
}

export function reducedMotion() {
  if (reducePref) return true;
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
