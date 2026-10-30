import { MAX_PARTICLES, reducedMotion } from './config.js?v=4';
import { heightAt } from './terrain.js?v=4';

const parts = [];
const booms = [];
const wrecks = [];
let shake = 0;
let shakeDamp = 5.5;
let flash = 0;

let glow = null;
let hot = null;
let smokeSprite = null;
let dustSprite = null;
let puffWhite = null;
let puffYellow = null;
let puffOrange = null;
let puffRed = null;
let ashSprite = null;
let flameSprite = null;

function sprites() {
  if (glow) return;
  glow = radial(160, [
    [0, 'rgba(255,255,255,0.95)'],
    [0.18, 'rgba(255,236,170,0.75)'],
    [0.42, 'rgba(255,140,30,0.28)'],
    [1, 'rgba(255,40,0,0)'],
  ]);
  hot = radial(128, [
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,250,220,0.9)'],
    [0.55, 'rgba(255,210,80,0.25)'],
    [1, 'rgba(255,180,40,0)'],
  ]);
  puffWhite = radial(128, [
    [0, 'rgba(255,255,255,1)'],
    [0.2, 'rgba(255,250,230,0.95)'],
    [0.5, 'rgba(255,220,140,0.35)'],
    [1, 'rgba(255,180,60,0)'],
  ]);
  puffYellow = radial(128, [
    [0, 'rgba(255,250,210,0.95)'],
    [0.28, 'rgba(255,210,60,0.85)'],
    [0.62, 'rgba(255,140,20,0.28)'],
    [1, 'rgba(255,80,0,0)'],
  ]);
  puffOrange = radial(128, [
    [0, 'rgba(255,180,40,0.9)'],
    [0.35, 'rgba(255,90,12,0.7)'],
    [0.7, 'rgba(180,30,0,0.22)'],
    [1, 'rgba(80,0,0,0)'],
  ]);
  puffRed = radial(128, [
    [0, 'rgba(255,70,16,0.8)'],
    [0.4, 'rgba(140,16,0,0.45)'],
    [0.75, 'rgba(60,8,0,0.16)'],
    [1, 'rgba(20,0,0,0)'],
  ]);
  smokeSprite = radial(128, [
    [0, 'rgba(22,16,14,0.92)'],
    [0.32, 'rgba(48,36,32,0.72)'],
    [0.68, 'rgba(36,28,26,0.32)'],
    [1, 'rgba(12,10,10,0)'],
  ]);
  ashSprite = radial(160, [
    [0, 'rgba(244, 228, 210, 0.98)'],
    [0.42, 'rgba(196, 158, 122, 0.96)'],
    [0.7, 'rgba(110, 76, 54, 0.9)'],
    [0.88, 'rgba(62, 40, 30, 0.55)'],
    [1, 'rgba(30, 18, 14, 0)'],
  ]);
  // Hottest core is orange, not white, so additive stacks stay fiery.
  flameSprite = radial(128, [
    [0, 'rgba(255, 168, 32, 0.9)'],
    [0.28, 'rgba(255, 78, 8, 0.72)'],
    [0.58, 'rgba(160, 24, 0, 0.28)'],
    [1, 'rgba(60, 8, 0, 0)'],
  ]);
  dustSprite = radial(96, [
    [0, 'rgba(196,150,96,0.55)'],
    [0.5, 'rgba(140,96,54,0.22)'],
    [1, 'rgba(90,60,30,0)'],
  ]);
}

function radial(size, stops) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i < stops.length; i++) rg.addColorStop(stops[i][0], stops[i][1]);
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  return c;
}

function blit(ctx, img, x, y, d) {
  ctx.drawImage(img, x - d * 0.5, y - d * 0.5, d, d);
}

function scaledCount(n) {
  if (!reducedMotion()) return n | 0;
  return Math.max(4, (n * 0.4) | 0);
}

function pushPart(p) {
  parts.push(p);
  if (parts.length > MAX_PARTICLES) {
    parts.splice(0, parts.length - MAX_PARTICLES);
  }
}

export function count() {
  return parts.length;
}

export function busy() {
  for (let i = 0; i < booms.length; i++) {
    if (booms[i].age < booms[i].block) return true;
  }
  return false;
}

export function consumeShake() {
  return shake * (reducedMotion() ? 0.1 : 1);
}

export function consumeFlash() {
  return flash * (reducedMotion() ? 0.15 : 1);
}

export function clear() {
  parts.length = 0;
  booms.length = 0;
  wrecks.length = 0;
  floats.length = 0;
  shake = 0;
  flash = 0;
}

function addShake(amount, damp) {
  const n = Math.min(36, amount);
  if (n > shake) {
    shake = n;
    shakeDamp = damp || 5.5;
  }
}

function addFlash(amount) {
  flash = Math.min(0.88, flash + amount);
}

export function trail(x, y, kind, color, ribbon) {
  if (kind === 'spark') {
    const long = ribbon && ribbon.vx != null;
    pushPart({
      kind: 'spark', x, y,
      vx: long ? ribbon.vx : (Math.random() - 0.5) * 30,
      vy: long ? ribbon.vy : (Math.random() - 0.5) * 30,
      g: long ? 0 : 30,
      life: long ? 0.95 : 0.32,
      max: long ? 0.95 : 0.32,
      size: long ? 5 : 3.2,
      color: color || '#fff6c8',
      ribbon: long ? (ribbon.len || 120) : 0,
    });
    return;
  }
  pushPart({
    kind: 'smoke', x, y,
    vx: (Math.random() - 0.5) * 8,
    vy: -6 - Math.random() * 8,
    g: -4,
    life: 0.95 + Math.random() * 0.25,
    max: 1.2,
    size: 7 + Math.random() * 5,
    color: 'rgba(80,70,70,0.4)',
    wind: 1,
  });
}

export function muzzle(x, y, dx, dy) {
  sprites();
  booms.push({
    x, y, r: 16, age: 0, life: 0.12, block: 0.04,
    style: 'muzzle', groundY: y, big: false,
  });
  pushPart({
    kind: 'smoke', x, y,
    vx: (dx || 0) * 20 + (Math.random() - 0.5) * 10,
    vy: (dy || 0) * 20 - 8,
    g: -6,
    life: 0.45,
    max: 0.45,
    size: 8,
    color: 'rgba(90,80,78,0.45)',
    wind: 1,
  });
}

export function rubble(bits) {
  if (!bits || !bits.length) return;
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i];
    pushPart({
      kind: 'dirt', x: b.x, y: b.y - 2,
      vx: (Math.random() - 0.5) * 70,
      vy: -20 - Math.random() * 50,
      g: 720,
      life: 0.7 + Math.random() * 0.3,
      max: 1,
      size: 3.2 + Math.random() * 3,
      color: Math.random() > 0.6 ? '#d7b07a' : '#6a4124',
    });
  }
}

function makePuffs(n) {
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const rim = Math.random();
    puffs.push({
      a: Math.random() * Math.PI * 2,
      d: Math.pow(rim, 0.55),
      s: 0.42 + Math.random() * 0.85,
      ph: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.4,
      grow: 0.75 + Math.random() * 0.7,
    });
  }
  return puffs;
}

export function explosion(x, y, radius, opts = {}) {
  sprites();
  const pop = !!opts.pop;
  const big = !pop && (radius >= 68 || (opts.shake || 1) >= 1.6);
  const life = pop ? 0.4 : opts.party ? 0.7 : 0.66;
  const groundY = heightAt(x);
  const puffN = pop ? 9 : big ? 30 : 18;
  booms.push({
    x, y, r: radius, age: 0, life,
    // Hold the turn until the main fireball has burned down. Pops stay short
    // so a cluster of bomblets does not stack the delay.
    block: opts.block != null ? opts.block : (pop ? 0.2 : 0.5),
    style: opts.party ? 'party' : (pop ? 'pop' : 'fire'),
    groundY,
    big,
    tint: opts.color || '#ffb03a',
    puffs: makePuffs(puffN),
  });
  const mul = pop ? 0.45 : big ? 1.65 : 1;
  const sparks = scaledCount(42 * mul);
  const smokes = scaledCount(14 * mul);
  const dirts = scaledCount(16 * mul);
  const embers = scaledCount(8 * mul);
  for (let i = 0; i < sparks; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (90 + Math.random() * 280) * (0.65 + radius / 90);
    pushPart({
      kind: 'spark', x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 50,
      g: 460,
      life: 0.38 + Math.random() * 0.38,
      max: 0.76,
      size: 2.2,
      color: Math.random() > 0.45 ? '#fff6d2' : (opts.color || '#ffb03a'),
    });
  }
  for (let i = 0; i < smokes; i++) {
    const a = Math.random() * Math.PI * 2;
    pushPart({
      kind: 'smoke', x, y,
      vx: Math.cos(a) * (12 + Math.random() * 36),
      vy: -40 - Math.random() * 36,
      g: -12,
      life: 2.05 + Math.random() * 0.45,
      max: 2.5,
      size: 20 + Math.random() * 22,
      color: 'rgba(28,22,20,0.9)',
      wind: 1,
    });
  }
  for (let i = 0; i < dirts; i++) {
    const a = -Math.PI * (0.12 + Math.random() * 0.76);
    const sp = 80 + Math.random() * 200 * (radius / 48);
    const dirtColors = ['#e2c48a', '#c4956a', '#8a5a32', '#5c3a22', '#6aaa3a'];
    pushPart({
      kind: 'dirt', x, y,
      vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
      vy: -Math.abs(Math.sin(a)) * sp - 40,
      g: 760,
      life: 0.95 + Math.random() * 0.4,
      max: 1.35,
      size: 10 + Math.random() * 8,
      color: dirtColors[(Math.random() * dirtColors.length) | 0],
    });
  }
  for (let i = 0; i < embers; i++) {
    const a = Math.random() * Math.PI * 2;
    pushPart({
      kind: 'ember',
      x: x + Math.cos(a) * radius * 0.85,
      y: y + Math.sin(a) * radius * 0.35,
      vx: Math.cos(a) * 12,
      vy: -8 - Math.random() * 16,
      g: -2,
      life: 1.1 + Math.random() * 0.7,
      max: 1.8,
      size: 2 + Math.random() * 1.6,
      color: Math.random() > 0.5 ? '#ffb03a' : '#ffe08a',
    });
  }
  if (opts.party) {
    const confetti = ['#ff4ad8', '#7dff4a', '#4ad4ff', '#ffe14a', '#c58bff', '#ff7a3c'];
    const cn = scaledCount(16);
    for (let i = 0; i < cn; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220;
      pushPart({
        kind: 'debris',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        g: 420,
        life: 0.7 + Math.random() * 0.4,
        max: 1.1,
        size: 4 + Math.random() * 4,
        color: confetti[i % confetti.length],
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }
  if (big) {
    for (let i = 0; i < scaledCount(10); i++) {
      pushPart({
        kind: 'smoke',
        x: x + (Math.random() - 0.5) * radius * 0.4,
        y: y,
        vx: (Math.random() - 0.5) * 14,
        vy: -50 - Math.random() * 40 - i * 4,
        g: -8,
        life: 2.15 + Math.random() * 0.4,
        max: 2.55,
        size: 34 + Math.random() * 28,
        color: 'rgba(18,14,14,0.92)',
        wind: 0.55,
      });
    }
    addFlash(0.62);
  } else {
    addFlash(pop ? 0.06 : 0.2);
  }
  const dist = Math.hypot(x - 800, y - 640);
  const falloff = Math.max(0.28, 1 - dist / 1500);
  const shakeMul = opts.shake == null ? 1 : opts.shake;
  addShake(radius * 0.42 * shakeMul * falloff, big ? 2.4 : 6.2);
}

/** Huge blast: white flash, shockwave, rising stem and a billowing cap. */
export function nukeBoom(x, y, radius) {
  sprites();
  const reduce = reducedMotion();
  addFlash(reduce ? 0.22 : 0.94);
  addShake(34, 1.25);
  const groundY = heightAt(x);
  booms.push({
    style: 'nuke',
    x, y, r: radius,
    age: 0,
    life: reduce ? 1.4 : 3.4,
    block: 0.7,
    groundY,
    big: true,
    cap: makePuffs(reduce ? 8 : 16),
    stem: makePuffs(reduce ? 4 : 7),
  });
  const sparks = scaledCount(36);
  for (let i = 0; i < sparks; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 420;
    pushPart({
      kind: 'spark', x, y: groundY - 10,
      vx: Math.cos(a) * sp,
      vy: -Math.abs(Math.sin(a)) * sp * 0.45 - 40,
      g: 380,
      life: 0.55 + Math.random() * 0.4,
      max: 0.95,
      size: 2.4,
      color: Math.random() > 0.5 ? '#fff' : '#ffe7a0',
    });
  }
  const dirtN = scaledCount(22);
  for (let i = 0; i < dirtN; i++) {
    const a = -Math.PI * (0.08 + Math.random() * 0.84);
    const sp = 160 + Math.random() * 380;
    pushPart({
      kind: 'dirt', x, y: groundY,
      vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
      vy: -Math.abs(Math.sin(a)) * sp - 80,
      g: 700,
      life: 1.15,
      max: 1.3,
      size: 8 + Math.random() * 8,
      color: Math.random() > 0.5 ? '#c4956a' : '#5c3a22',
    });
  }
  const smokeN = scaledCount(12);
  for (let i = 0; i < smokeN; i++) {
    pushPart({
      kind: 'smoke',
      x: x + (Math.random() - 0.5) * 80,
      y: groundY,
      vx: (Math.random() - 0.5) * 24,
      vy: -30 - Math.random() * 40,
      g: -6,
      life: 2.2,
      max: 2.4,
      size: 40 + Math.random() * 30,
      color: 'rgba(20,16,14,0.9)',
      wind: 0.4,
    });
  }
}

/** Rising embers. Smoke columns are drawn with the flames, not as soot blobs. */
export function napalmPuff(x, y) {
  pushPart({
    kind: 'ember',
    x: x + (Math.random() - 0.5) * 14,
    y: y - 10,
    vx: (Math.random() - 0.5) * 22,
    vy: -50 - Math.random() * 70,
    g: 40,
    life: 0.55 + Math.random() * 0.4,
    max: 0.95,
    size: 2.4,
    color: Math.random() > 0.5 ? '#ff8a14' : '#ffb43a',
  });
}

/** Fiery splash when napalm hits: orange droplets flung out, no white flash. */
export function napalmSplash(x, y) {
  sprites();
  const n = scaledCount(22);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.05 + Math.random() * 0.9);
    const sp = 90 + Math.random() * 260;
    const side = Math.random() < 0.5 ? -1 : 1;
    pushPart({
      kind: 'spark',
      x, y: y - 4,
      vx: Math.cos(a) * sp * side,
      vy: -Math.abs(Math.sin(a)) * sp * 0.85,
      g: 520,
      life: 0.38 + Math.random() * 0.28,
      max: 0.66,
      size: 3,
      color: Math.random() > 0.45 ? '#ff6a10' : '#ffb020',
      ribbon: 16,
    });
  }
}

function flameTongue(ctx, x, y, h, w, lean) {
  const tip = x + lean;
  ctx.beginPath();
  ctx.moveTo(x - w, y + 1);
  ctx.quadraticCurveTo(x - w * 0.25 + lean * 0.35, y - h * 0.55, tip, y - h);
  ctx.quadraticCurveTo(x + w * 0.4 + lean * 0.45, y - h * 0.42, x + w * 0.82, y + 1);
  ctx.closePath();
  ctx.fill();
}

/** Roaring pool. Tongues are source-over orange/red. One soft additive glow, never a white pool. */
export function drawNapalm(ctx, hazards, time, wind) {
  sprites();
  const fires = [];
  let cx = 0;
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (!h || h.type !== 'napalm') continue;
    fires.push(h);
    cx += h.x;
  }
  const n = fires.length;
  if (!n) return;
  cx /= n;
  const spread = Math.max(1, fires.reduce((m, h) => Math.max(m, Math.abs(h.x - cx)), 0));
  const sec = time * 0.001;
  const gust = (wind || 0) * 5;
  fires.sort((a, b) => a.y - b.y);

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#14110f';
  for (let i = 0; i < n; i += 5) {
    const h = fires[i];
    const near = 1 - Math.min(1, Math.abs(h.x - cx) / (spread + 36));
    const drift = gust * (0.35 + near) + Math.sin(sec * 0.45 + h.phase) * (6 + near * 8);
    const lifts = [28 + near * 8, 58 + near * 12, 86 + near * 14];
    const alphas = [0.28, 0.18, 0.1];
    const rys = [22, 20, 18];
    const rxs = [7, 9, 11];
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = alphas[k];
      ctx.beginPath();
      ctx.ellipse(
        h.x + drift * (0.15 + k * 0.5),
        h.y - lifts[k],
        rxs[k],
        rys[k],
        drift * 0.004,
        0, 6.3,
      );
      ctx.fill();
    }
  }

  for (let i = 0; i < n; i++) {
    const h = fires[i];
    const near = 1 - Math.min(1, Math.abs(h.x - cx) / (spread + 36));
    const flick = 0.76 + 0.24 * Math.sin(sec * 11 + h.phase);
    const flick2 = 0.68 + 0.32 * Math.sin(sec * 17 + h.phase * 1.7);
    const lead = Math.floor(h.phase * 2.1) % 3;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = '#5c1004';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 1, 14 + near * 8, 5, 0, 0, 6.3);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#e23c08';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y - 1, 8 + near * 3, 3, 0, 0, 6.3);
    ctx.fill();

    for (let k = 0; k < 3; k++) {
      const sway = Math.sin(sec * 8 + h.phase + k * 2.1) * (6 + near * 12) + gust * 0.4;
      const ox = (k - 1) * (7 + near * 6) + Math.sin(sec * 5 + h.phase + k) * 4;
      const jag = 0.4 + (0.5 + 0.5 * Math.sin(h.phase * 5 + k * 2.4)) * 0.55;
      const mul = k === lead ? 1.22 : jag;
      const hgt = (18 + near * 72) * mul * (k === lead ? flick : flick2);
      const w = 5.5 + near * 4 + (k === lead ? 2.5 : 0);
      ctx.globalAlpha = 0.97;
      ctx.fillStyle = k === lead ? '#c42000' : '#7a1204';
      flameTongue(ctx, h.x + ox, h.y + 1, hgt, w, sway);
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = '#ff5c0c';
      flameTongue(ctx, h.x + ox, h.y, hgt * 0.64, w * 0.5, sway * 0.75);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffb02e';
      flameTongue(ctx, h.x + ox + sway * 0.12, h.y - hgt * 0.2, hgt * 0.34, w * 0.26, sway * 0.45);
    }

    const bob = (sec * 48 + h.phase * 17) % (36 + near * 80);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ffc14a';
    ctx.beginPath();
    ctx.arc(h.x + Math.sin(h.phase * 2 + sec * 3) * 14, h.y - 18 - bob, 2.2, 0, 6.3);
    ctx.fill();

    const left = heightAt(h.x - 10);
    const right = heightAt(h.x + 10);
    const dir = left === right ? (h.x < cx ? -1 : 1) : (left > right ? -1 : 1);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ff4a06';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    for (let d = 0; d < 2; d++) {
      const dist = 16 + ((sec * 40 + h.phase * 11 + d * 18) % 40);
      const dx = dir * dist;
      const gy = heightAt(h.x + dx);
      ctx.beginPath();
      ctx.moveTo(h.x + dir * 8, h.y - 2);
      ctx.lineTo(h.x + dx, gy - 3);
      ctx.stroke();
      ctx.fillStyle = d ? '#ffb01a' : '#ff4e08';
      ctx.beginPath();
      ctx.arc(h.x + dx, gy - 4, d ? 3.4 : 5.4, 0, 6.3);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export function shieldPop(x, y, color) {
  sprites();
  booms.push({
    x, y, r: 54, age: 0, life: 0.38, block: 0.05,
    style: 'pop', groundY: y, big: false,
    puffs: makePuffs(10),
    tint: color || '#9ee7ff',
  });
  addFlash(0.08);
}

export function dirtBurst(x, y, radius) {
  sprites();
  booms.push({
    x, y, r: radius, age: 0, life: 0.42, block: 0.08,
    style: 'dust', groundY: y, big: false,
  });
  const n = scaledCount(28);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.05 + Math.random() * 0.9);
    const sp = 40 + Math.random() * 160;
    pushPart({
      kind: 'dirt', x, y,
      vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
      vy: -Math.abs(Math.sin(a)) * sp - 30,
      g: 680,
      life: 0.7 + Math.random() * 0.4,
      max: 1.1,
      size: 3 + Math.random() * 4,
      color: Math.random() > 0.5 ? '#c99562' : '#6e4528',
    });
  }
  for (let i = 0; i < scaledCount(8); i++) {
    pushPart({
      kind: 'smoke', x, y,
      vx: (Math.random() - 0.5) * 40,
      vy: -20 - Math.random() * 30,
      g: -4,
      life: 0.8,
      max: 0.9,
      size: 14,
      color: 'rgba(120,90,60,0.4)',
      wind: 1,
    });
  }
  addShake(radius * 0.12, 7);
}

export function tankDeath(x, y, color) {
  explosion(x, y - 18, 92, { shake: 2.2, color: '#ffd0a0' });
  const n = scaledCount(8);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 90 + Math.random() * 200;
    pushPart({
      kind: i === 0 ? 'turret' : 'debris',
      x, y: y - 28,
      vx: Math.cos(a) * sp,
      vy: -160 - Math.random() * 200,
      g: 620,
      life: 1.15 + Math.random() * 0.4,
      max: 1.55,
      size: i === 0 ? 16 : 5 + Math.random() * 5,
      color: i % 2 ? color : '#241810',
      rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 14,
    });
  }
  addFlash(0.55);
}

/** Small flash where a cluster shell splits. Not a long turn-blocker. */
export function splitFlash(x, y, color) {
  sprites();
  booms.push({
    x, y, r: 36, age: 0, life: 0.42, block: 0.06,
    style: 'pop', groundY: y, big: false,
    puffs: makePuffs(14),
  });
  const n = scaledCount(22);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 160;
    pushPart({
      kind: 'spark', x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      g: 180,
      life: 0.28 + Math.random() * 0.22,
      max: 0.5,
      size: 2.4,
      color: Math.random() > 0.5 ? '#fff' : (color || '#8af6ff'),
    });
  }
  addFlash(0.12);
}

const floats = [];

export function floatNum(x, y, n, color) {
  if (!(n > 0.4)) return;
  floats.push({
    x: x + (Math.random() - 0.5) * 10,
    y: y - 8,
    text: '-' + Math.round(n),
    life: 0.85,
    max: 0.85,
    color: color || '#ffd0a0',
  });
}

export function popcornBurst(x, y) {
  sprites();
  const n = scaledCount(10);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 140;
    pushPart({
      kind: 'spark', x, y: y - 2,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.55 - 30,
      g: 280,
      life: 0.18 + Math.random() * 0.16,
      max: 0.34,
      size: 2.4,
      color: Math.random() > 0.45 ? '#fff6d8' : '#ffd36a',
    });
  }
  const crumbs = scaledCount(7);
  const crumbCol = ['#fff8e0', '#ffe9a0', '#f0c45a', '#d4a04a', '#c48a28'];
  for (let i = 0; i < crumbs; i++) {
    const a = -Math.PI * (0.1 + Math.random() * 0.8);
    const sp = 50 + Math.random() * 160;
    pushPart({
      kind: 'dirt',
      x, y: y - 2,
      vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
      vy: -Math.abs(Math.sin(a)) * sp - 20,
      g: 620,
      life: 0.4 + Math.random() * 0.28,
      max: 0.7,
      size: 2.2 + Math.random() * 2.4,
      color: crumbCol[(Math.random() * crumbCol.length) | 0],
    });
  }
  booms.push({
    x, y, r: 16, age: 0, life: 0.22, block: 0.03,
    style: 'kernel', groundY: y, big: false,
  });
}

export function magnetSuck(x, y, radius) {
  sprites();
  const reach = Math.max(240, radius || 220);
  const n = scaledCount(48);
  const cols = ['#e2c48a', '#c99562', '#8a5a32', '#5c3a22', '#6aaa3a', '#d4b07a'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 70 + Math.random() * reach;
    pushPart({
      kind: 'dirt',
      magnet: true,
      cx: x,
      cy: y - 16,
      x: x + Math.cos(a) * d,
      y: y - 22 - Math.random() * 48 + Math.sin(a) * 28,
      vx: 0,
      vy: 0,
      g: 0,
      life: 0.7 + Math.random() * 0.4,
      max: 1.1,
      size: 6 + Math.random() * 9,
      color: cols[(Math.random() * cols.length) | 0],
    });
  }
  const streams = scaledCount(10);
  for (let i = 0; i < streams; i++) {
    const side = i % 2 ? -1 : 1;
    const d = 140 + Math.random() * 160;
    pushPart({
      kind: 'dirt',
      magnet: true,
      cx: x,
      cy: y - 16,
      x: x + side * d,
      y: y - 8 - Math.random() * 24,
      vx: 0,
      vy: 0,
      g: 0,
      life: 0.85,
      max: 0.9,
      size: 7 + Math.random() * 8,
      color: cols[(Math.random() * cols.length) | 0],
    });
  }
}

export function magnetDump(x, y, radius) {
  dirtBurst(x, y, radius);
  addShake(radius * 0.28, 7);
  const extra = scaledCount(18);
  for (let i = 0; i < extra; i++) {
    pushPart({
      kind: 'smoke',
      x: x + (Math.random() - 0.5) * radius * 0.8,
      y: y - 6,
      vx: (Math.random() - 0.5) * 28,
      vy: -16 - Math.random() * 24,
      g: -4,
      life: 0.7 + Math.random() * 0.3,
      max: 1,
      size: 16 + Math.random() * 14,
      color: 'rgba(140,110,80,0.4)',
      wind: 0.8,
    });
  }
}

export function lightningFlash(x, y) {
  sprites();
  addFlash(0.28);
  addShake(10, 8);
  const n = scaledCount(20);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 80 + Math.random() * 240;
    pushPart({
      kind: 'spark', x, y: y - 10,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.4 - 40,
      g: 120,
      life: 0.22 + Math.random() * 0.18,
      max: 0.42,
      size: 2.6,
      color: Math.random() > 0.5 ? '#e8f6ff' : '#7ec8ff',
    });
  }
}

export function tankBurn(x, y) {
  if (Math.random() > 0.65) return;
  pushPart({
    kind: 'ember',
    x: x + (Math.random() - 0.5) * 28,
    y: y - 18 - Math.random() * 22,
    vx: (Math.random() - 0.5) * 18,
    vy: -40 - Math.random() * 50,
    g: 30,
    life: 0.4 + Math.random() * 0.3,
    max: 0.7,
    size: 2.4,
    color: Math.random() > 0.5 ? '#ff8a14' : '#ffd24a',
  });
  if (Math.random() < 0.35) {
    pushPart({
      kind: 'smoke',
      x: x + (Math.random() - 0.5) * 16,
      y: y - 36,
      vx: (Math.random() - 0.5) * 12,
      vy: -24 - Math.random() * 20,
      g: -6,
      life: 0.7,
      max: 0.8,
      size: 12,
      color: 'rgba(40,20,12,0.55)',
      wind: 0.5,
    });
  }
}

export function drawFloats(ctx) {
  if (!floats.length) return;
  ctx.save();
  ctx.font = '800 18px Trebuchet MS, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < floats.length; i++) {
    const f = floats[i];
    const a = Math.max(0, f.life / f.max);
    ctx.globalAlpha = a;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.fillStyle = f.color;
    const y = f.y - (1 - a) * 28;
    ctx.strokeText(f.text, f.x, y);
    ctx.fillText(f.text, f.x, y);
  }
  ctx.restore();
}

export function update(dt, wind) {
  const w = wind || 0;
  shake *= Math.exp(-shakeDamp * dt);
  if (shake < 0.15) shake = 0;
  flash *= Math.exp(-7.5 * dt);
  if (flash < 0.01) flash = 0;
  for (let i = booms.length - 1; i >= 0; i--) {
    booms[i].age += dt;
    if (booms[i].age >= booms[i].life) booms.splice(i, 1);
  }
  for (let i = wrecks.length - 1; i >= 0; i--) wrecks[i].age += dt;
  for (let i = floats.length - 1; i >= 0; i--) {
    floats[i].life -= dt;
    if (floats[i].life <= 0) floats.splice(i, 1);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      const last = parts.pop();
      if (i < parts.length) parts[i] = last;
      continue;
    }
    if (p.magnet) {
      const dx = p.cx - p.x;
      const dy = p.cy - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      const tx = -ny;
      const ty = nx;
      const pull = 130 + dist * 0.22;
      const swirl = 190;
      p.x += (nx * pull + tx * swirl) * dt;
      p.y += (ny * pull * 0.72 + ty * swirl * 0.48) * dt;
      if (dist < 16) p.life = Math.min(p.life, 0.08);
      continue;
    }
    if (p.wind) p.vx += w * 14 * p.wind * dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'debris' || p.kind === 'turret') p.rot = (p.rot || 0) + (p.spin || 0) * dt;
    if ((p.kind === 'dirt' || p.kind === 'debris' || p.kind === 'turret') && p.vy > 0) {
      const gy = heightAt(p.x);
      if (p.y > gy) {
        p.y = gy - 1;
        p.vy *= -0.32;
        p.vx *= 0.62;
        p.bounced = (p.bounced || 0) + 1;
        if (p.bounced === 1 && p.kind === 'dirt' && parts.length < MAX_PARTICLES - 8) {
          pushPart({
            kind: 'smoke', x: p.x, y: gy - 2,
            vx: (Math.random() - 0.5) * 16,
            vy: -10,
            g: -4,
            life: 0.45,
            max: 0.5,
            size: 8,
            color: 'rgba(140,110,80,0.35)',
            wind: 1,
          });
        }
        if (p.bounced >= 2) p.life = Math.min(p.life, 0.12);
      }
    }
  }
}

export function draw(ctx) {
  sprites();
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i].kind;
    if (k === 'smoke' || k === 'dirt') drawPart(ctx, parts[i]);
  }
  for (let i = 0; i < booms.length; i++) drawBoom(ctx, booms[i]);
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i].kind;
    if (k !== 'smoke' && k !== 'dirt') drawPart(ctx, parts[i]);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawFloats(ctx);
}

function drawPart(ctx, p) {
  const a = Math.max(0, p.life / p.max);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.min(1, a);
  if (p.kind === 'smoke') {
    const grow = 1.15 + (1 - a) * 0.85;
    blit(ctx, smokeSprite, p.x, p.y, p.size * grow * 2.7);
  } else if (p.kind === 'spark') {
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const len = p.ribbon ? p.ribbon : (12 + Math.min(26, sp * 0.045));
    let x2 = p.x - (p.vx / sp) * len;
    let y2 = p.y - (p.vy / sp) * len;
    if (p.ribbon) {
      const ground = heightAt(p.x) - 6;
      if (p.y > ground) return;
      if (y2 > ground) {
        const dy = y2 - p.y;
        const dx = x2 - p.x;
        if (dy > 0.01) {
          const u = (ground - p.y) / dy;
          x2 = p.x + dx * u;
          y2 = ground;
        }
      }
    }
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.ribbon ? 6 : 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (p.kind === 'turret') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot || 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = '#1a120e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, -3);
    ctx.stroke();
    ctx.restore();
  } else if (p.kind === 'debris') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot || 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size * 0.55, -p.size * 0.35, p.size, p.size * 0.7);
    ctx.restore();
  } else if (p.kind === 'ember') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  } else {
    ctx.fillStyle = 'rgba(20,12,8,0.45)';
    ctx.fillRect(p.x - p.size * 0.55, p.y - p.size * 0.42, p.size * 1.15, p.size * 0.95);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size * 0.48, p.y - p.size * 0.38, p.size, p.size * 0.72);
  }
  ctx.globalAlpha = 1;
}

function drawNuke(ctx, b) {
  const age = b.age;
  // Fast enough to read as a mushroom in the first half second, then keeps climbing.
  const burst = Math.min(1, age / 0.55);
  const creep = Math.min(1, age / 2.7);
  const ease = burst * 0.7 + creep * 0.3;
  const fade = age < 2.55 ? 1 : Math.max(0, 1 - (age - 2.55) / 0.85);
  const gy = b.groundY || b.y;
  // Phone view crops world y below ~170. Hold the cap in the open sky.
  const want = 130 + ease * 360;
  const maxRise = Math.max(170, gy - 290);
  const rise = Math.min(want, maxRise);
  const capY = gy - rise;
  const stemH = rise;

  ctx.globalCompositeOperation = 'lighter';
  if (age < 0.28) {
    const f = 1 - age / 0.28;
    ctx.globalAlpha = f * 0.95;
    blit(ctx, hot, b.x, gy - 20, b.r * (0.8 + age * 3));
    ctx.globalAlpha = f * 0.55;
    blit(ctx, puffWhite, b.x, gy - 8, b.r * 1.6);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.9 * fade * (0.35 + 0.65 * (1 - ease));
  ctx.strokeStyle = 'rgba(255,252,240,0.92)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(b.x, gy - 6, Math.max(20, b.r * (0.25 + age * 1.15)), 0, 6.3);
  ctx.stroke();
  ctx.globalAlpha = 0.35 * fade * (1 - Math.min(1, age / 1.4));
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(b.x, gy - 6, Math.max(30, b.r * (0.4 + age * 1.7)), 0, 6.3);
  ctx.stroke();

  // One stretched ash body so the stem and cap read as a single mushroom.
  const column = Math.max(80, stemH - 20);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = fade * 0.96;
  ctx.translate(b.x, gy - column * 0.46);
  ctx.scale(0.85, column / 150);
  blit(ctx, ashSprite, 0, 0, 150);
  ctx.restore();

  const capRx = Math.min(260, 130 + ease * 150);
  const lobes = [
    [-1.02, 46, 0.58],
    [-0.78, 22, 0.9],
    [-0.52, 2, 1.05],
    [-0.28, -16, 0.74],
    [0.0, -24, 1.16],
    [0.26, -12, 0.86],
    [0.5, 6, 1.08],
    [0.76, 24, 0.88],
    [1.02, 44, 0.56],
  ];
  for (let i = 0; i < lobes.length; i++) {
    const lobe = lobes[i];
    const wob = Math.sin(age * 2.2 + i) * 6;
    const px = b.x + lobe[0] * capRx + wob;
    const py = capY + lobe[1] + ease * 4;
    const d = 150 * lobe[2];
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade * 0.9;
    blit(ctx, smokeSprite, px, py - 6, d * 1.25);
    ctx.globalAlpha = fade * 0.95;
    blit(ctx, ashSprite, px, py, d);
  }
  const bumps = [[-0.4, -36, 0.46], [0.08, -42, 0.4], [0.42, -30, 0.5], [-0.12, -8, 0.34]];
  for (let i = 0; i < bumps.length; i++) {
    const bump = bumps[i];
    const wob = Math.sin(age * 2.8 + i * 1.7) * 5;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade * 0.72;
    blit(ctx, smokeSprite, b.x + bump[0] * capRx + wob, capY + bump[1], 90 * bump[2]);
    ctx.globalAlpha = fade * 0.8;
    blit(ctx, ashSprite, b.x + bump[0] * capRx + wob * 0.4, capY + bump[1] + 4, 70 * bump[2]);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * 0.45;
  blit(ctx, puffOrange, b.x, capY + 28, capRx * 0.9);
  ctx.globalAlpha = fade * 0.32;
  blit(ctx, puffYellow, b.x, capY + 16, capRx * 0.42);
  ctx.globalAlpha = fade * 0.4;
  blit(ctx, puffOrange, b.x - capRx * 0.38, capY + 36, capRx * 0.36);
  blit(ctx, puffOrange, b.x + capRx * 0.38, capY + 36, capRx * 0.36);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawBoom(ctx, b) {
  const u = b.age / Math.max(0.001, b.life);
  if (b.style === 'nuke') {
    drawNuke(ctx, b);
    return;
  }
  if (b.style === 'kernel') {
    ctx.globalCompositeOperation = 'lighter';
    const fade = 1 - u;
    ctx.globalAlpha = fade * 0.95;
    blit(ctx, puffWhite, b.x, b.y, 26 + u * 16);
    ctx.globalAlpha = fade * 0.85;
    blit(ctx, puffYellow, b.x, b.y - 2, 16 + u * 10);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade * 0.9;
    ctx.strokeStyle = 'rgba(255, 248, 210, 0.95)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 8 + u * 14, 0, 6.3);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (b.style === 'muzzle') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - u;
    blit(ctx, hot, b.x, b.y, 36 * (0.6 + u));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (b.style === 'dust') {
    const rad = b.r * (0.4 + u * 1.3);
    ctx.globalAlpha = 0.85 * (1 - u);
    blit(ctx, dustSprite, b.x, b.y - 8, rad * 2.2);
    ctx.globalAlpha = 0.45 * (1 - u);
    ctx.save();
    ctx.translate(b.x, b.groundY || b.y);
    ctx.scale(1, 0.28);
    blit(ctx, dustSprite, 0, 0, b.r * (0.8 + u * 2.4));
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  // Overlapping additive puffs. Full size within ~0.08s so the impact
  // frame is already a fireball, then they billow, redden, and smoke.
  const open = Math.min(1, u / 0.12);
  const fade = u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.5);
  const span = b.r * (b.style === 'pop' ? 1.7 : b.big ? 3.55 : 2.35) * (0.82 + 0.18 * open);
  const puffs = b.puffs || [];
  for (let i = 0; i < puffs.length; i++) {
    const puff = puffs[i];
    const heat = Math.min(1, Math.max(0, (u - 0.08) * 0.85 + puff.d * 0.4));
    if (heat < 0.84 || u < 0.22) continue;
    const flick = 0.85 + 0.15 * Math.sin(b.age * 22 + puff.ph);
    const ang = puff.a + b.age * puff.spin;
    const dist = puff.d * span * (0.15 + 0.9 * Math.min(1, u * 1.6));
    const px = b.x + Math.cos(ang) * dist;
    const py = b.y + Math.sin(ang) * dist * 0.9 - u * span * 0.08;
    const size = span * puff.s * (0.7 + u * 0.85) * flick;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade * 0.72 * flick * Math.min(1, (heat - 0.7) / 0.25);
    blit(ctx, smokeSprite, px, py - u * 18, size * 1.35);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < puffs.length; i++) {
    const puff = puffs[i];
    const heat = Math.min(1, Math.max(0, (u - 0.08) * 0.85 + puff.d * 0.4));
    if (heat > 0.96) continue;
    const flick = 0.78 + 0.22 * Math.sin(b.age * 30 + puff.ph);
    const ang = puff.a + b.age * puff.spin;
    const dist = puff.d * span * (0.2 + 0.85 * open) * puff.grow;
    const px = b.x + Math.cos(ang) * dist;
    const py = b.y + Math.sin(ang) * dist * 0.88;
    let sprite = puffWhite;
    if (heat > 0.62) sprite = puffRed;
    else if (heat > 0.4) sprite = puffOrange;
    else if (heat > 0.18) sprite = puffYellow;
    const size = span * puff.s * (0.55 + 0.45 * open) * (1.05 - heat * 0.25) * flick;
    ctx.globalAlpha = fade * flick * (heat > 0.75 ? 0.55 : 0.95);
    blit(ctx, sprite, px, py, size);
  }
  if (u < 0.55) {
    ctx.globalAlpha = (1 - u / 0.55) * fade;
    blit(ctx, hot, b.x, b.y - span * 0.04, span * (b.big ? 0.62 : 0.42));
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.max(0, 0.9 * (1 - u * 1.15));
  ctx.strokeStyle = 'rgba(255,252,236,0.95)';
  ctx.lineWidth = b.big ? 6 : 3.5;
  ctx.beginPath();
  ctx.arc(b.x, b.y, Math.max(span * 0.72, b.r * (1.35 + u * 1.7)), 0, 6.3);
  ctx.stroke();
  const gy = b.groundY || b.y;
  if (u < 0.34) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - u / 0.34) * (b.big ? 0.9 : 0.55);
    ctx.save();
    ctx.translate(b.x, gy);
    ctx.scale(1, 0.2);
    blit(ctx, puffYellow, 0, 0, span * 2.3);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.45 * (1 - u);
  ctx.save();
  ctx.translate(b.x, gy);
  ctx.scale(1, 0.22);
  blit(ctx, dustSprite, 0, 0, b.r * (1.2 + u * 2.8));
  ctx.restore();
  if (b.style === 'party') {
    const cols = [b.tint || '#ff4ad8', '#7dff4a', '#4ad4ff', '#ffe14a'];
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const ang = u * 4 + i * 1.4;
      const ox = Math.cos(ang) * b.r * 0.28;
      const oy = Math.sin(ang) * b.r * 0.2;
      ctx.globalAlpha = (1 - u) * 0.7;
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.arc(b.x + ox, b.y + oy, b.r * (0.35 + u * 0.4), 0, 6.3);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawWreck(ctx, w) {
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -2, 34, 7, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#1a1210';
  round(ctx, -30, -16, 60, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#2a1814';
  round(ctx, -22, -30, 44, 18, 5);
  ctx.fill();
  ctx.fillStyle = '#140e0c';
  ctx.beginPath();
  ctx.arc(0, -34, 12, 0, 6.3);
  ctx.fill();
  const flick = 0.45 + 0.55 * Math.abs(Math.sin(w.age * 18));
  ctx.globalAlpha = flick;
  ctx.fillStyle = '#ff7a2a';
  ctx.beginPath();
  ctx.ellipse(-8, -38, 4, 7, 0, 0, 6.3);
  ctx.ellipse(6, -36, 3, 5, 0, 0, 6.3);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  blit(ctx, smokeSprite, Math.sin(w.age * 2) * 6, -52 - (w.age % 1.4) * 18, 28);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
