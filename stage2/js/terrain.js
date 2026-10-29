import { WORLD_W, WORLD_H } from './config.js?v=1';

let heights = new Float64Array(WORLD_W);
let scorch = new Uint8Array(WORLD_W);
let burn = new Uint8Array(WORLD_W);
let canvas = null;
let ctx = null;
let mountains = [];
let noise = null;
let morph = null;
let burn0 = 1e9;
let burn1 = -1;

// World y grows downward. Peaks are small y, valleys are large y.
// Bedrock keeps a dirt thickness so the surface never kisses the bottom edge.
export const BEDROCK = 78;
// Phone (844×390) crops the top of the world under the HUD. 300 keeps
// peaks about 70 CSS px down, clear of the bar plus a margin.
export const MIN_Y = 300;
export const MAX_Y = WORLD_H - BEDROCK;
export const STYLES = ['rolling', 'mountains', 'canyon', 'islands', 'spires'];

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

function clearMarks() {
  scorch.fill(0);
  burn.fill(0);
  burn0 = 1e9;
  burn1 = -1;
}

/** Stage 1 hills: gentle, clamped, unchanged shape. */
function fillClassic(rng) {
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
  }
}

function fillRolling(rng) {
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  for (let x = 0; x < WORLD_W; x++) {
    heights[x] = 640
      + Math.sin(x * 0.0041 + p1) * 46
      + Math.sin(x * 0.0094 + p2) * 20
      + Math.sin(x * 0.021 + p3) * 9;
  }
}

/**
 * Blend the surface toward targetY. power > 1 makes a flatter top and steeper sides.
 * flat is a plateau width in px so a sample every 8 units still hits the extreme.
 */
function stamp(cx, width, targetY, power, flat) {
  const half = Math.max(24, width);
  const cap = flat || 18;
  const x0 = Math.max(0, Math.floor(cx - half));
  const x1 = Math.min(WORLD_W - 1, Math.ceil(cx + half));
  for (let x = x0; x <= x1; x++) {
    const d = Math.abs(x - cx);
    let u;
    if (d <= cap) u = 0;
    else u = (d - cap) / (half - cap);
    if (u >= 1) continue;
    const influence = Math.pow(1 - u, power || 1.3);
    heights[x] = heights[x] * (1 - influence) + targetY * influence;
  }
}

function fillMountains(rng) {
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  for (let x = 0; x < WORLD_W; x++) {
    const ridge = 1 - Math.abs(Math.sin(x * 0.0034 + p1));
    const ridge2 = 1 - Math.abs(Math.sin(x * 0.0088 + p2));
    heights[x] = 700 - ridge * 280 - ridge2 * 90 + Math.sin(x * 0.012 + p2) * 24;
  }
  stamp(300 + rng() * 140, 250, 312, 0.55, 22);
  stamp(1120 + rng() * 180, 280, 328, 0.5, 24);
  stamp(700 + rng() * 160, 320, 808, 1.6, 36);
}

function fillCanyon(rng) {
  const p = rng() * Math.PI * 2;
  for (let x = 0; x < WORLD_W; x++) {
    heights[x] = 348 + Math.sin(x * 0.004 + p) * 28 + Math.sin(x * 0.013) * 8;
  }
  // Mesas stay high. Steep walls (low power) drop into one or two deep cuts.
  stamp(460 + rng() * 80, 210, 812, 0.42, 70);
  if (rng() > 0.35) stamp(1080 + rng() * 120, 170, 796, 0.4, 48);
}

function fillIslands(rng) {
  for (let x = 0; x < WORLD_W; x++) heights[x] = 812;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const cx = 180 + (1400 * (i + 0.15 + rng() * 0.25)) / n;
    stamp(cx, 150 + rng() * 40, 318 + rng() * 36, 1.15, 20);
  }
}

function fillSpires(rng) {
  const p = rng() * Math.PI * 2;
  for (let x = 0; x < WORLD_W; x++) {
    heights[x] = 470 + Math.sin(x * 0.0026 + p) * 28;
  }
  stamp(640 + rng() * 200, 260, 808, 1.35, 40);
  stamp(260 + rng() * 80, 78, 308, 0.48, 14);
  stamp(980 + rng() * 80, 64, 322, 0.45, 12);
  stamp(1360 + rng() * 70, 70, 316, 0.5, 12);
}

function clampHeights() {
  for (let x = 0; x < WORLD_W; x++) {
    let y = heights[x];
    if (y < MIN_Y) y = MIN_Y;
    if (y > MAX_Y) y = MAX_Y;
    heights[x] = y;
  }
}

export function resolveStyle(rng, style) {
  if (style === 'classic') return 'classic';
  if (STYLES.indexOf(style) >= 0) return style;
  return STYLES[(rng() * STYLES.length) | 0];
}

export function generate(rng, style) {
  ensure();
  const kind = style || 'classic';
  if (kind === 'classic') fillClassic(rng);
  else if (kind === 'rolling') fillRolling(rng);
  else if (kind === 'mountains') fillMountains(rng);
  else if (kind === 'canyon') fillCanyon(rng);
  else if (kind === 'islands') fillIslands(rng);
  else if (kind === 'spires') fillSpires(rng);
  else fillRolling(rng);
  if (kind !== 'classic' && kind !== 'rolling') clampHeights();
  else {
    for (let x = 0; x < WORLD_W; x++) {
      if (heights[x] < 480) heights[x] = 480;
      if (heights[x] > 800) heights[x] = 800;
    }
  }
  clearMarks();
  buildMountains(rng);
  morph = null;
  paint(0, WORLD_W - 1);
}

/** Surface y every `step` world units, for tests and debug. */
export function profile(step) {
  const s = step || 8;
  const out = [];
  for (let x = 0; x < WORLD_W; x += s) out.push(heightAt(x));
  return out;
}

/**
 * Spread `n` tanks onto reasonably flat columns, away from the edges.
 * Returns integer x positions. Caller flattens a pad on each.
 */
export function findSpawns(n, rng) {
  const margin = 130;
  const minSep = n <= 2 ? 460 : n === 3 ? 300 : 220;
  const picks = [];
  for (let i = 0; i < n; i++) {
    const band0 = margin + ((WORLD_W - margin * 2) * i) / n;
    const band1 = margin + ((WORLD_W - margin * 2) * (i + 1)) / n;
    let bestX = (band0 + band1) / 2;
    let best = 1e9;
    const lo = Math.max(margin, band0 + 10);
    const hi = Math.min(WORLD_W - margin, band1 - 10);
    for (let x = lo; x <= hi; x += 8) {
      let blocked = false;
      for (let p = 0; p < picks.length; p++) {
        if (Math.abs(picks[p] - x) < minSep) { blocked = true; break; }
      }
      if (blocked) continue;
      const y = heightAt(x);
      const slope = Math.abs(heightAt(x + 28) - heightAt(x - 28));
      const toward = x < WORLD_W * 0.5 ? 1 : -1;
      const ahead = heightAt(x + toward * 110) - y;
      // Prefer a pad below the phone HUD and with open ground toward center.
      const wall = ahead < -16 ? (-ahead) * 2 : 0;
      const high = y < 390 ? (390 - y) * 1.2 : 0;
      const jitter = rng ? rng() * 0.01 : 0;
      const score = slope * 30 + wall + high + jitter;
      if (score < best) {
        best = score;
        bestX = x;
      }
    }
    // Phone crops the top of the world under the HUD. Step downhill toward
    // center until the pad sits in the visible band, then the caller flattens it.
    let x = Math.round(bestX);
    const toward = x < WORLD_W * 0.5 ? 1 : -1;
    if (heightAt(x) < 360) {
      for (let step = 0; step < 10; step++) {
        const nx = x + toward * 14;
        if (nx < margin + 20 || nx > WORLD_W - margin - 20) break;
        let crowded = false;
        for (let p = 0; p < picks.length; p++) {
          if (Math.abs(picks[p] - nx) < minSep) { crowded = true; break; }
        }
        if (crowded) break;
        x = Math.round(nx);
        if (heightAt(x) >= 360) break;
      }
    }
    picks.push(x);
  }
  return picks;
}

/** Darken the surface where napalm has burned. Repaint is batched. */
export function burnAt(x) {
  const i = x < 0 ? 0 : x >= WORLD_W ? WORLD_W - 1 : x | 0;
  const a = Math.max(0, i - 3);
  const b = Math.min(WORLD_W - 1, i + 3);
  let dirty = false;
  for (let k = a; k <= b; k++) {
    if (!burn[k]) {
      burn[k] = 1;
      dirty = true;
    }
  }
  if (!dirty) return;
  if (a < burn0) burn0 = a;
  if (b > burn1) burn1 = b;
}

export function flushBurn() {
  if (burn1 < 0) return;
  const a = burn0;
  const b = burn1;
  burn0 = 1e9;
  burn1 = -1;
  paint(a - 2, b + 2);
}

/** Flatten a pad so a tank does not spawn on a knife edge. Returns the pad height. */
export function flattenPad(cx, half = 40, floorY = 0) {
  const ic = Math.max(0, Math.min(WORLD_W - 1, Math.round(cx)));
  const base = Math.max(heights[ic], floorY || 0);
  const x0 = Math.max(0, ic - half);
  const x1 = Math.min(WORLD_W - 1, ic + half);
  for (let x = x0; x <= x1; x++) {
    const t = Math.abs(x - ic) / half;
    const k = t < 0.7 ? 0 : (t - 0.7) / 0.3;
    heights[x] = base * (1 - k) + heights[x] * k;
    scorch[x] = 0;
    burn[x] = 0;
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

  // Stops below y=460 match the Stage 1 dirt. Higher stops paint snow and rock
  // on peaks without shifting the color of classic hills (those stay y>=500).
  const g = ctx.createLinearGradient(0, 140, 0, WORLD_H);
  const span = WORLD_H - 140;
  const stop = (y, color) => g.addColorStop((y - 140) / span, color);
  stop(140, '#f4f7fb');
  stop(210, '#d9e0e8');
  stop(280, '#b7a898');
  stop(360, '#8a6244');
  stop(450, '#6b4630');
  stop(500, '#8f5a31');
  stop(530, '#7a4a28');
  stop(610, '#5e3a20');
  stop(702, '#4a2e1a');
  stop(803, '#352114');
  stop(900, '#1c100c');
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

  // Bowl interior: a wide dark stroke under the burnt lip, then a hard rim.
  strokeOffset(x0, x1, 16, 'rgba(0,0,0,0.5)', 30, true);
  strokeOffset(x0, x1, 6, 'rgba(18,8,4,0.82)', 12, true);
  strokeOffset(x0, x1, 2, 'rgba(0,0,0,0.88)', 4, true);
  strokeOffset(x0, x1, 3, 'rgba(36,72,18,0.9)', 4.5, false);
  // High ground wears rock and snow. y>=430 keeps the Stage 1 grass lip.
  strokeByHeight(x0, x1, [
    { maxY: 240, color: '#e7eef6', width: 2.4 },
    { maxY: 340, color: '#c3b6a6', width: 2.4 },
    { maxY: 430, color: '#b7c97a', width: 2.6 },
    { maxY: 9999, color: '#9ed85a', width: 2.6 },
  ]);
  strokeByHeight(x0, x1, [
    { maxY: 240, color: '#ffffff', width: 1.3 },
    { maxY: 340, color: '#f0e6d4', width: 1.2 },
    { maxY: 430, color: '#e7f5b8', width: 1.2 },
    { maxY: 9999, color: '#f3ffc2', width: 1.2 },
  ]);
  strokeSurface(x0, x1, true, '#1a0c08', 5.5, true);
  strokeOffset(x0, x1, 2, 'rgba(0,0,0,0.65)', 2, true);
  strokeBurn(x0, x1);

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

function strokeBurn(x0, x1) {
  ctx.beginPath();
  let pen = false;
  for (let x = x0; x <= x1; x++) {
    if (!burn[x] || scorch[x]) {
      pen = false;
      continue;
    }
    if (!pen) {
      ctx.moveTo(x, heights[x] + 1);
      pen = true;
    } else ctx.lineTo(x, heights[x] + 1);
  }
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(42, 22, 14, 0.72)';
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(18, 8, 6, 0.9)';
  ctx.stroke();
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

function strokeByHeight(x0, x1, picks) {
  const styleAt = (y) => {
    for (let i = 0; i < picks.length; i++) if (y < picks[i].maxY) return picks[i];
    return picks[picks.length - 1];
  };
  let i0 = x0;
  let cur = styleAt(heights[x0]);
  const flush = (xEnd) => {
    if (!cur || xEnd <= i0) return;
    ctx.beginPath();
    ctx.moveTo(i0, heights[i0]);
    for (let x = i0 + 1; x <= xEnd; x++) ctx.lineTo(x, heights[x]);
    ctx.strokeStyle = cur.color;
    ctx.lineWidth = cur.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  for (let x = x0 + 1; x <= x1; x++) {
    const s = styleAt(heights[x]);
    if (s !== cur) {
      flush(x);
      i0 = x;
      cur = s;
    }
  }
  flush(x1);
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
