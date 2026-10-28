import { WORLD_W, WORLD_H } from './config.js?v=1';

let heights = new Float64Array(WORLD_W);
let scorch = new Uint8Array(WORLD_W);
let canvas = null;
let ctx = null;
let mountains = [];
let noise = null;
let morph = null;

function hash(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function ensure() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  ctx = canvas.getContext('2d', { alpha: true });
  noise = document.createElement('canvas');
  noise.width = 128;
  noise.height = 128;
  const ng = noise.getContext('2d');
  for (let i = 0; i < 180; i++) {
    const n = hash(i * 3, i * 7);
    ng.fillStyle = n > 0.55 ? 'rgba(255,220,170,0.35)' : 'rgba(0,0,0,0.35)';
    ng.fillRect((n * 128) | 0, ((hash(i, 2) * 128) | 0), n > 0.8 ? 2 : 1, n > 0.8 ? 2 : 1);
  }
}

export function busy() {
  return morph != null;
}

function commitMorph() {
  if (!morph) return;
  const { x0, x1, to } = morph;
  for (let x = x0; x <= x1; x++) heights[x] = to[x - x0];
  paint(x0, x1);
  morph = null;
}

/** Grow a dirt mound (or any pending height morph) toward its target. */
export function tick(dt) {
  if (!morph) return;
  morph.t += dt;
  const u = morph.t >= morph.dur ? 1 : morph.t / morph.dur;
  const e = u * u * (3 - 2 * u);
  const { x0, x1, from, to } = morph;
  for (let x = x0; x <= x1; x++) {
    const i = x - x0;
    heights[x] = from[i] * (1 - e) + to[i] * e;
  }
  paint(x0, x1);
  if (u >= 1) morph = null;
}

export function getCanvas() {
  ensure();
  return canvas;
}

export function getMountains() {
  return mountains;
}

export function heightAt(x) {
  if (x <= 0) return heights[0];
  if (x >= WORLD_W - 1) return heights[WORLD_W - 1];
  const i = x | 0;
  const f = x - i;
  return heights[i] * (1 - f) + heights[i + 1] * f;
}

function buildMountains(rng) {
  const bases = [390, 470, 540];
  const amps = [64, 86, 48];
  const colors = ['#8d6eab', '#5c3878', '#341848'];
  mountains = [];
  for (let layer = 0; layer < 3; layer++) {
    const pts = [];
    const ph = rng() * Math.PI * 2;
    const ph2 = rng() * Math.PI * 2;
    for (let x = 0; x <= WORLD_W; x += 24) {
      const y = bases[layer]
        + Math.sin(x * 0.0042 + ph) * amps[layer]
        + Math.sin(x * 0.011 + ph2) * amps[layer] * 0.38;
      pts.push(x, y);
    }
    mountains.push({ pts, color: colors[layer], depth: layer });
  }
}

export function generate(rng) {
  ensure();
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const p4 = rng() * Math.PI * 2;
  const a1 = 54 + rng() * 26;
  const a2 = 22 + rng() * 16;
  const a3 = 8 + rng() * 10;
  for (let x = 0; x < WORLD_W; x++) {
    let y = 640
      + Math.sin(x * 0.0037 + p1) * a1
      + Math.sin(x * 0.0092 + p2) * a2
      + Math.sin(x * 0.0175 + p3) * a3
      + Math.sin(x * 0.033 + p4) * 5;
    if (y < 500) y = 500;
    if (y > 790) y = 790;
    heights[x] = y;
    scorch[x] = 0;
  }
  buildMountains(rng);
  morph = null;
  paint(0, WORLD_W - 1);
}

/** Flatten a pad so a tank does not spawn on a knife edge. Returns the pad height. */
export function flattenPad(cx, half = 40) {
  const ic = Math.max(0, Math.min(WORLD_W - 1, Math.round(cx)));
  const base = heights[ic];
  const x0 = Math.max(0, ic - half);
  const x1 = Math.min(WORLD_W - 1, ic + half);
  for (let x = x0; x <= x1; x++) {
    const t = Math.abs(x - ic) / half;
    const k = t < 0.7 ? 0 : (t - 0.7) / 0.3;
    heights[x] = base * (1 - k) + heights[x] * k;
    scorch[x] = 0;
  }
  paint(x0, x1);
  return base;
}

function smoothRim(x0, x1) {
  const a = Math.max(1, x0 - 3);
  const b = Math.min(WORLD_W - 2, x1 + 3);
  const tmp = new Float64Array(b - a + 1);
  for (let x = a; x <= b; x++) tmp[x - a] = heights[x];
  for (let x = a; x <= b; x++) {
    const i = x - a;
    const l2 = tmp[Math.max(0, i - 2)];
    const l = tmp[Math.max(0, i - 1)];
    const c = tmp[i];
    const r = tmp[Math.min(tmp.length - 1, i + 1)];
    const r2 = tmp[Math.min(tmp.length - 1, i + 2)];
    heights[x] = l2 * 0.08 + l * 0.18 + c * 0.48 + r * 0.18 + r2 * 0.08;
  }
  // Dig the lip outward so a steep circle wall becomes a smooth roll.
  // The floor is never lifted, so a tank still falls the full bowl depth.
  const c0 = Math.max(1, x0 - 100);
  const c1 = Math.min(WORLD_W - 2, x1 + 100);
  const maxStep = 2.6;
  for (let pass = 0; pass < 80; pass++) {
    const dir = pass % 2 === 0 ? 1 : -1;
    const start = dir > 0 ? c0 : c1;
    const end = dir > 0 ? c1 : c0;
    for (let x = start; dir > 0 ? x <= end : x >= end; x += dir) {
      const d = heights[x] - heights[x - 1];
      if (d > maxStep) heights[x - 1] = heights[x] - maxStep;
      else if (d < -maxStep) heights[x] = heights[x - 1] - maxStep;
    }
  }
}

/**
 * Cut a true circle, then let unsupported dirt fall.
 * A column inside the circle loses the overlapped span, so a surface
 * hit opens a round bowl and a buried hit still settles into a bowl.
 */
export function carve(cx, cy, r) {
  const bits = [];
  if (!(r > 0)) return bits;
  commitMorph();
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(WORLD_W - 1, Math.ceil(cx + r + 2));
  const r2 = r * r;
  let nbit = 0;
  const bitPhase = x0 % 9;
  for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx;
    const rem = r2 - dx * dx;
    if (rem <= 0) continue;
    const half = Math.sqrt(rem);
    const top = cy - half;
    const bot = cy + half;
    const old = heights[x];
    if (old >= bot) continue;
    const removed = Math.min(bot, WORLD_H - 2) - Math.max(top, old);
    if (removed <= 0.4) continue;
    heights[x] = Math.min(WORLD_H - 2, old + removed);
    scorch[x] = 1;
    if (removed > 8 && nbit < 14 && (x % 9) === bitPhase) {
      bits.push({ x, y: old, drop: removed });
      nbit++;
    }
  }
  smoothRim(x0, x1);
  paint(x0 - 110, x1 + 110);
  return bits;
}

/** Raise a round mound sitting on the current surface at cx. */
export function addMound(cx, cy, r) {
  if (!(r > 0)) return;
  commitMorph();
  const anchor = Math.max(heightAt(cx), Math.min(cy, heightAt(cx)));
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(WORLD_W - 1, Math.ceil(cx + r + 1));
  const r2 = r * r;
  const from = new Float64Array(x1 - x0 + 1);
  const to = new Float64Array(x1 - x0 + 1);
  let changed = false;
  for (let x = x0; x <= x1; x++) {
    const i = x - x0;
    from[i] = heights[x];
    to[i] = heights[x];
    const dx = x + 0.5 - cx;
    const rem = r2 - dx * dx;
    if (rem <= 0) continue;
    const top = Math.max(80, anchor - Math.sqrt(rem));
    if (top < heights[x]) {
      to[i] = top;
      scorch[x] = 0;
      changed = true;
    }
  }
  if (!changed) return;
  morph = { x0, x1, from, to, t: 0, dur: 0.3 };
}

function paint(x0, x1) {
  ensure();
  // Clear a padded rect, but keep the clip edge one pixel outside it so
  // the anti-aliased boundary is never a half-cleared column.
  const pad = 2;
  const c0 = Math.max(0, (x0 | 0) - pad);
  const c1 = Math.min(WORLD_W - 1, (x1 | 0) + pad);
  const clearL = Math.max(0, c0 - 1);
  const clearR = Math.min(WORLD_W - 1, c1 + 1);
  ctx.clearRect(clearL, 0, clearR - clearL + 1, WORLD_H);

  const left = clearL === 0 ? 0 : clearL - 1;
  const right = clearR === WORLD_W - 1 ? WORLD_W - 1 : clearR + 1;
  x0 = clearL;
  x1 = clearR;
  ctx.beginPath();
  ctx.moveTo(left, WORLD_H + 2);
  ctx.lineTo(left, heights[left]);
  for (let x = left; x <= right; x++) ctx.lineTo(x + 0.5, heights[Math.min(WORLD_W - 1, x)]);
  ctx.lineTo(right + 1, WORLD_H + 2);
  ctx.closePath();
  ctx.save();
  ctx.clip();

  const g = ctx.createLinearGradient(0, 460, 0, WORLD_H);
  g.addColorStop(0, '#8ed45f');
  g.addColorStop(0.025, '#67a83d');
  g.addColorStop(0.055, '#9a6236');
  g.addColorStop(0.16, '#7a4a28');
  g.addColorStop(0.34, '#5e3a20');
  g.addColorStop(0.55, '#4a2e1a');
  g.addColorStop(0.78, '#352114');
  g.addColorStop(1, '#1c100c');
  ctx.fillStyle = g;
  ctx.fillRect(x0, 0, x1 - x0 + 1, WORLD_H);

  // Speckles are keyed by column, not by the dirty-rect origin, so a
  // partial repaint cannot shift them into a vertical seam.
  for (let x = x0; x <= x1; x++) {
    const n = hash(x, 11);
    if (n < 0.62) continue;
    const h = heights[x] | 0;
    const y = h + 12 + ((hash(x, 17) * Math.max(8, WORLD_H - h - 20)) | 0);
    if (y >= WORLD_H - 1) continue;
    const pebble = hash(x, 23) > 0.84;
    ctx.fillStyle = pebble ? 'rgba(255,226,180,0.2)' : 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, pebble ? 2 : 1, 1);
    if (hash(x, 29) > 0.72) {
      const y2 = y + 18 + ((hash(x, 31) * 70) | 0);
      if (y2 < WORLD_H - 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(x, y2, 1, 1);
      }
    }
  }
  // Strata that follow the hills, not the screen.
  const bands = [
    [7, 'rgba(92,140,48,0.55)', 5],
    [16, 'rgba(150,96,52,0.7)', 6],
    [30, 'rgba(90,52,28,0.55)', 7],
    [52, 'rgba(40,24,16,0.45)', 8],
    [86, 'rgba(20,12,10,0.4)', 10],
  ];
  for (let b = 0; b < bands.length; b++) {
    ctx.beginPath();
    ctx.moveTo(x0, heights[x0] + bands[b][0]);
    for (let x = x0 + 1; x <= x1; x++) ctx.lineTo(x + 0.5, heights[x] + bands[b][0]);
    ctx.strokeStyle = bands[b][1];
    ctx.lineWidth = bands[b][2];
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();

  // Bowl interior: a wide dark stroke under scorched lips, then a hard rim.
  strokeOffset(x0, x1, 16, 'rgba(0,0,0,0.5)', 30, true);
  strokeOffset(x0, x1, 6, 'rgba(18,8,4,0.82)', 12, true);
  strokeOffset(x0, x1, 2, 'rgba(0,0,0,0.88)', 4, true);
  strokeOffset(x0, x1, 3, 'rgba(36,72,18,0.9)', 4.5, false);
  strokeSurface(x0, x1, false, '#9ed85a', 2.6, false);
  strokeSurface(x0, x1, false, '#f3ffc2', 1.2, false);
  strokeSurface(x0, x1, true, '#1a0c08', 5.5, true);
  strokeOffset(x0, x1, 2, 'rgba(0,0,0,0.65)', 2, true);

  for (let x = x0; x <= x1; x += 4) {
    if (!scorch[x]) continue;
    const n = hash(x, 7);
    if (n < 0.45) continue;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = n > 0.75 ? '#ffb15a' : '#c2411a';
    ctx.fillRect(x, heights[x] - 1, 2, 2);
    ctx.globalAlpha = 1;
  }
}

function strokeOffset(x0, x1, dy, style, width, scorchOnly) {
  ctx.beginPath();
  let pen = false;
  for (let x = x0; x <= x1; x++) {
    const on = scorch[x] === 1;
    if (on !== scorchOnly) {
      pen = false;
      continue;
    }
    if (!pen) {
      ctx.moveTo(x, heights[x] + dy);
      pen = true;
    } else ctx.lineTo(x, heights[x] + dy);
  }
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = style;
  ctx.stroke();
}

function strokeSurface(x0, x1, wantScorch, style, width, skipOpposite) {
  ctx.beginPath();
  let pen = false;
  for (let x = x0; x <= x1; x++) {
    const on = scorch[x] === 1;
    if (skipOpposite && on !== wantScorch) {
      pen = false;
      continue;
    }
    if (!pen) {
      ctx.moveTo(x, heights[x]);
      pen = true;
    } else ctx.lineTo(x, heights[x]);
  }
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = style;
  ctx.stroke();
}
