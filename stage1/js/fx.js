import { MAX_PARTICLES, reducedMotion } from './config.js?v=1';
import { heightAt } from './terrain.js?v=1';

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

export function trail(x, y, kind, color) {
  if (kind === 'spark') {
    pushPart({
      kind: 'spark', x, y,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      g: 30,
      life: 0.32,
      max: 0.32,
      size: 3.2,
      color: color || '#fff6c8',
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
  const life = pop ? 0.4 : 0.66;
  const groundY = heightAt(x);
  const puffN = pop ? 9 : big ? 30 : 18;
  booms.push({
    x, y, r: radius, age: 0, life,
    // Hold the turn until the main fireball has burned down. Pops stay short
    // so a cluster of bomblets does not stack the delay.
    block: pop ? 0.2 : 0.5,
    style: pop ? 'pop' : 'fire',
    groundY,
    big,
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
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      const last = parts.pop();
      if (i < parts.length) parts[i] = last;
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
    const len = 12 + Math.min(26, sp * 0.045);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
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

function drawBoom(ctx, b) {
  const u = b.age / Math.max(0.001, b.life);
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
