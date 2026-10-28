import {
  GAME_TITLE, WORLD_W, WORLD_H, SIM_DT, GRAVITY, POWER_SCALE,
  MAX_HP, FALL_SAFE, FALL_DPH, DPR_CAP, TANK, PALETTE,
  clamp, reducedMotion, makeRng,
} from './config.js?v=1';
import { getWeapon, cycleWeapon, weaponIds } from './weapons.js?v=1';
import * as terrain from './terrain.js?v=1';
import { flyStep, escapeMuzzle, hitsTank } from './physics.js?v=1';
import * as fx from './fx.js?v=1';
import * as audio from './audio.js?v=1';
import { createAI } from './ai.js?v=1';
import * as ui from './ui.js?v=1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const params = new URLSearchParams(location.search);
const urlSeed = params.has('seed') ? (Number(params.get('seed')) >>> 0) : null;

let screen = 'title';
let phase = 'aim';
let wind = 0;
let seed = urlSeed != null ? urlSeed : 1337;
let gameRng = makeRng(seed);
let speedMul = 1;
let tanks = [];
let roundWins = [];
let turn = 0;
let starter = 0;
let projectiles = [];
let hazards = [];
let shotActive = false;
let decor = [];
let clouds = [];
let stars = [];
const ai = createAI();
const samples = [];
const deathQ = [];
let spawnQ = [];
let winWait = null;

document.title = GAME_TITLE;

function makeAmmo() {
  const ammo = {};
  for (const id of weaponIds()) {
    const w = getWeapon(id);
    ammo[id] = w.ammoDefault;
  }
  return ammo;
}

function ammoSafe(ammo) {
  const o = {};
  for (const k in ammo) o[k] = ammo[k] === Infinity ? null : ammo[k];
  return o;
}

function livingTanks() {
  return tanks.filter((t) => t.alive);
}

function bootBackdrop() {
  const rng = makeRng(urlSeed != null ? urlSeed : 1337);
  terrain.generate(rng);
  decor = [260, 1320].map((x, i) => {
    terrain.flattenPad(x, 36);
    const pal = PALETTE[i];
    return {
      x, y: terrain.heightAt(x), angle: i === 0 ? 62 : 118, power: 45,
      color: pal.color, light: pal.light, dark: pal.dark,
      name: '', hp: 100, alive: true,
    };
  });
  stars = [];
  for (let i = 0; i < 80; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random() * 0.42,
      r: Math.random() * 1.4 + 0.4,
      p: Math.random() * Math.PI * 2,
    });
  }
  clouds = [];
  for (let i = 0; i < 7; i++) {
    clouds.push({
      x: Math.random() * WORLD_W,
      y: 70 + Math.random() * 180,
      w: 70 + Math.random() * 90,
      h: 16 + Math.random() * 16,
      a: 0.18 + Math.random() * 0.22,
      k: 0.4 + Math.random() * 0.8,
    });
  }
}

function buildTanks(spec) {
  tanks = spec.map((s, i) => {
    const pal = PALETTE[i % PALETTE.length];
    return {
      name: pal.name,
      color: pal.color,
      dark: pal.dark,
      light: pal.light,
      x: 0,
      y: 0,
      hp: MAX_HP,
      alive: true,
      isCpu: !!s.cpu,
      skill: s.skill || 'normal',
      angle: 60,
      power: 50,
      weapon: 'basic',
      ammo: makeAmmo(),
      falling: false,
      fallFrom: 0,
      vy: 0,
      recoil: 0,
    };
  });
  roundWins = tanks.map(() => 0);
}

function placeTanks() {
  const n = tanks.length;
  const margin = 170;
  const span = WORLD_W - margin * 2;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? WORLD_W / 2 : margin + (span * i) / (n - 1);
    terrain.flattenPad(x, 42);
    const t = tanks[i];
    t.x = x;
    t.y = terrain.heightAt(x);
    t.falling = false;
    t.vy = 0;
    t.angle = x < WORLD_W / 2 ? 58 : 122;
  }
}

function clearTransient() {
  projectiles = [];
  hazards = [];
  spawnQ = [];
  deathQ.length = 0;
  shotActive = false;
  winWait = null;
  fx.clear();
  ai.cancel();
}

function rollWind() {
  let w = wind;
  for (let k = 0; k < 6; k++) {
    w = ((gameRng() * 21) | 0) - 10;
    if (w !== wind) break;
  }
  return clamp(w, -10, 10);
}

function beginTurn() {
  if (!tanks.length) return;
  wind = rollWind();
  const t = tanks[turn];
  ui.showBanner(`${t.name}'s turn`, t.color);
  if (t.isCpu && t.alive) {
    phase = 'ai';
    ai.begin({
      tank: t,
      tanks,
      selfIndex: turn,
      wind,
      heightAt: terrain.heightAt,
      rng: gameRng,
    });
  } else {
    phase = 'aim';
    ai.cancel();
  }
  pushUI();
}

function advanceTurn() {
  const n = tanks.length;
  for (let k = 0; k < n; k++) {
    turn = (turn + 1) % n;
    if (tanks[turn].alive) break;
  }
  beginTurn();
}

function endRound(winner) {
  if (screen === 'winner' || winWait) return;
  winWait = { winner: winner || null, left: 1.8 };
  phase = 'settle';
  shotActive = false;
  ai.cancel();
  ui.hideBanner();
}

function finishRound() {
  if (!winWait || screen === 'winner') {
    winWait = null;
    return;
  }
  const winner = winWait.winner;
  winWait = null;
  screen = 'winner';
  phase = 'aim';
  let headline = 'Draw';
  if (winner) {
    const idx = tanks.indexOf(winner);
    if (idx >= 0) roundWins[idx] += 1;
    headline = `${winner.name} wins!`;
  }
  const tally = tanks.map((t, i) => `${t.name} ${roundWins[i] || 0}`).join('   ·   ');
  ui.setWinner(headline, tally);
  ui.setScreen('winner');
  pushUI();
}

function markFalls() {
  let any = false;
  for (const t of tanks) {
    const g = terrain.heightAt(t.x);
    if (t.y < g - 1.5) {
      if (!t.falling) {
        t.falling = true;
        t.fallFrom = t.y;
        t.vy = 0;
      }
      any = true;
    }
  }
  if (any && screen === 'play' && (phase === 'aim' || phase === 'ai')) phase = 'settle';
  return any;
}

function hurt(t, dmg) {
  if (!t || !t.alive || !(dmg > 0)) return;
  t.hp -= dmg;
  if (t.hp <= 0) {
    t.hp = 0;
    t.alive = false;
    t.falling = false;
    deathQ.push(t);
  }
}

function flushDeaths() {
  let guard = 0;
  while (deathQ.length && guard++ < 8) {
    const t = deathQ.shift();
    fx.tankDeath(t.x, t.y, t.color);
    audio.death();
    terrain.carve(t.x, t.y - 4, 48);
    markFalls();
    for (const o of tanks) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - t.x, (o.y - TANK.hitUp) - (t.y - 8));
      if (d < 72) hurt(o, 26 * (1 - d / 72));
    }
  }
  deathQ.length = 0;
}

function damageTank(i, amount) {
  const t = tanks[i];
  if (!t || Number.isNaN(amount)) return;
  if (!t.alive) {
    if (amount < 0) t.hp = clamp(t.hp - amount, 0, MAX_HP);
    return;
  }
  if (amount < 0) {
    t.hp = clamp(t.hp - amount, 0, MAX_HP);
    return;
  }
  hurt(t, amount);
  flushDeaths();
  if (screen === 'play') {
    const living = livingTanks();
    if (living.length <= 1 && !projectiles.length && !tanks.some((tk) => tk.alive && tk.falling)) {
      endRound(living[0] || null);
    }
  }
}

function doExplode(p) {
  const pop = !!p.bomblet;
  const bits = terrain.carve(p.x, p.y, p.radius * 0.95);
  markFalls();
  fx.rubble(bits);
  fx.explosion(p.x, p.y, p.radius, { pop, shake: p.shake, color: p.color });
  audio.boom(Math.min(1.3, p.radius / 70), pop);
  for (const t of tanks) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - p.x, (t.y - TANK.hitUp) - p.y);
    if (d < p.radius) hurt(t, p.damage * (1 - d / p.radius));
  }
  flushDeaths();
}

function doDirt(p) {
  terrain.addMound(p.x, p.y, p.radius);
  fx.dirtBurst(p.x, terrain.heightAt(p.x), p.radius);
  audio.thud();
  for (const t of tanks) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - p.x, (t.y - TANK.hitUp) - p.y);
    if (d < p.radius * 0.55) hurt(t, p.damage * (1 - d / (p.radius * 0.55)));
  }
  flushDeaths();
}

function spawnNapalm(x, y) {
  // Stage 2 entry point. Hazards flow downhill and burn until ttl ends.
  for (let i = 0; i < 5; i++) {
    hazards.push({
      type: 'napalm',
      x: x + (i - 2) * 12,
      y,
      radius: 16,
      dps: 8,
      ttl: 6,
      flow: true,
      flowSpeed: 36,
    });
  }
}

function splitCluster(p) {
  const w = getWeapon('cluster');
  const n = w.bomblets || 5;
  const spread = w.spread || 76;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spread;
    spawnQ.push({
      x: p.x,
      y: p.y,
      vx: p.vx * 0.3 + off,
      vy: 16 + i * 18,
      age: 0,
      vyPrev: 0,
      dead: false,
      owner: p.owner,
      behavior: 'standard',
      bomblet: true,
      radius: w.bombletRadius,
      damage: w.bombletDamage,
      color: w.color,
      trail: 'spark',
      shake: 0.55,
      weaponId: 'cluster',
      lastTrail: 0,
    });
  }
  audio.boom(0.3, true);
  fx.splitFlash(p.x, p.y, p.color);
}

function impact(p) {
  if (p.behavior === 'cluster' && !p.bomblet) {
    splitCluster(p);
    return;
  }
  if (p.behavior === 'dirt') {
    doDirt(p);
    return;
  }
  if (p.behavior === 'napalm') {
    spawnNapalm(p.x, p.y);
    fx.explosion(p.x, p.y, 20, { pop: true, shake: 0.4, color: '#ff6a2a' });
    return;
  }
  doExplode(p);
}

function fire() {
  if (screen !== 'play') return false;
  if (phase !== 'aim' && phase !== 'ai') return false;
  const t = tanks[turn];
  if (!t || !t.alive) return false;
  const w = getWeapon(t.weapon) || getWeapon('basic');
  const left = t.ammo[w.id];
  if (left !== Infinity && !(left > 0)) {
    t.weapon = 'basic';
    return fire();
  }
  if (left !== Infinity) t.ammo[w.id] -= 1;
  t.recoil = 1;
  const m = escapeMuzzle(t, terrain.heightAt);
  fx.muzzle(m.x, m.y, m.dx, m.dy);
  const spd = t.power * POWER_SCALE;
  projectiles.push({
    x: m.x,
    y: m.y,
    vx: Math.cos(t.angle * Math.PI / 180) * spd,
    vy: -Math.sin(t.angle * Math.PI / 180) * spd,
    age: 0,
    vyPrev: 0,
    dead: false,
    owner: turn,
    behavior: w.behavior,
    bomblet: false,
    radius: w.radius,
    damage: w.damage,
    color: w.color,
    trail: w.trail,
    shake: w.shake,
    weaponId: w.id,
    lastTrail: 0,
  });
  audio.unlock();
  audio.thump();
  phase = 'flight';
  shotActive = true;
  ui.hideBanner();
  return true;
}

function stepProjectiles(dt) {
  spawnQ = [];
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (p.dead) continue;
    flyStep(p, dt, wind);
    const trailEvery = p.trail === 'spark' ? 0.055 : 0.09;
    if (p.age - p.lastTrail > trailEvery) {
      p.lastTrail = p.age;
      fx.trail(p.x, p.y, p.trail, p.color);
    }
    if (p.behavior === 'cluster' && !p.bomblet && p.age > 0.08 && p.vyPrev < 0 && p.vy >= 0) {
      splitCluster(p);
      p.dead = true;
      continue;
    }
    if (p.x < 0 || p.x > WORLD_W) {
      p.dead = true;
      continue;
    }
    const arm = p.bomblet ? 0.04 : 0.12;
    if (p.age > arm) {
      for (let ti = 0; ti < tanks.length; ti++) {
        const t = tanks[ti];
        if (!t.alive) continue;
        if (ti === p.owner && p.age < 0.16 && !p.bomblet) continue;
        if (hitsTank(p.x, p.y, t)) {
          impact(p);
          p.dead = true;
          break;
        }
      }
    }
    if (p.dead) continue;
    if (p.age > 0.05 && p.y >= terrain.heightAt(p.x)) {
      impact(p);
      p.dead = true;
    }
  }
  if (spawnQ.length) projectiles.push(...spawnQ);
  let w = 0;
  for (let i = 0; i < projectiles.length; i++) {
    if (!projectiles[i].dead) projectiles[w++] = projectiles[i];
  }
  projectiles.length = w;
}

function updateHazards(dt) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.ttl -= dt;
    if (h.ttl <= 0) {
      hazards.splice(i, 1);
      continue;
    }
    if (h.flow) {
      const left = terrain.heightAt(h.x - 3);
      const right = terrain.heightAt(h.x + 3);
      const dir = left === right ? 0 : (left > right ? -1 : 1);
      h.x = clamp(h.x + dir * (h.flowSpeed || 30) * dt, 2, WORLD_W - 2);
      h.y = terrain.heightAt(h.x);
    }
    if (h.dps) {
      for (const t of tanks) {
        if (!t.alive) continue;
        const d = Math.hypot(t.x - h.x, (t.y - TANK.hitUp) - h.y);
        if (d < (h.radius || 16)) hurt(t, h.dps * dt * (1 - d / (h.radius || 16)));
      }
    }
    if (h.type === 'napalm' && Math.random() < 0.35) fx.trail(h.x, h.y - 4, 'spark', '#ff6a2a');
  }
  flushDeaths();
}

function stepTanks(dt) {
  for (const t of tanks) {
    if (!t.falling) continue;
    const g = terrain.heightAt(t.x);
    t.vy += GRAVITY * dt;
    t.y += t.vy * dt;
    if (t.y >= g) {
      const dist = g - (t.fallFrom == null ? t.y : t.fallFrom);
      t.y = g;
      t.vy = 0;
      t.falling = false;
      if (t.alive) {
        const extra = dist - FALL_SAFE;
        if (extra > 0) hurt(t, extra * FALL_DPH);
      }
    }
  }
  flushDeaths();
}

function stepClouds(dt) {
  const slow = reducedMotion() ? 0.2 : 1;
  const drift = ((screen === 'play' ? wind : 3) * 2.4 + 16) * slow;
  for (const c of clouds) {
    c.x += drift * dt * c.k;
    if (c.x - c.w > WORLD_W + 30) c.x = -c.w - 40;
    if (c.x + c.w < -40) c.x = WORLD_W + 20;
  }
}

function resolvePhase() {
  if (screen !== 'play' || winWait) return;
  if (phase !== 'flight' && phase !== 'settle') return;
  if (projectiles.length) {
    phase = 'flight';
    return;
  }
  if (tanks.some((t) => t.alive && t.falling) || fx.busy() || hazards.length || terrain.busy()) {
    phase = 'settle';
    return;
  }
  const living = livingTanks();
  if (shotActive) {
    shotActive = false;
    if (living.length <= 1) endRound(living[0] || null);
    else advanceTurn();
    return;
  }
  if (living.length <= 1) endRound(living[0] || null);
  else if (!tanks[turn] || !tanks[turn].alive) advanceTurn();
  else phase = tanks[turn].isCpu ? 'ai' : 'aim';
}

function simulate(dt) {
  stepClouds(dt);
  terrain.tick(dt);
  if (winWait) {
    winWait.left -= dt;
    if (winWait.left <= 0) finishRound();
  }
  for (let i = 0; i < tanks.length; i++) {
    const t = tanks[i];
    if (t.recoil) {
      t.recoil *= Math.exp(-9 * dt);
      if (t.recoil < 0.02) t.recoil = 0;
    }
  }
  if (screen !== 'play') {
    fx.update(dt, wind);
    return;
  }
  if (phase === 'ai') {
    const act = ai.update(dt);
    if (act === 'fire') fire();
  }
  stepProjectiles(dt);
  updateHazards(dt);
  stepTanks(dt);
  fx.update(dt, wind);
  resolvePhase();
}

function windText(w) {
  if (w > 0) return `Wind → ${w}`;
  if (w < 0) return `Wind ← ${Math.abs(w)}`;
  return 'Calm';
}

function weaponLabel(t) {
  if (!t) return '—';
  const w = getWeapon(t.weapon);
  if (!w) return t.weapon;
  const n = t.ammo[w.id];
  const ammo = n === Infinity || n == null ? '∞' : `×${n}`;
  return `${w.name} ${ammo}`;
}

function pushUI() {
  const t = tanks[turn];
  const health = tanks.map((tk, i) => ({
    name: tk.name,
    color: tk.color,
    hp: tk.hp,
    alive: tk.alive,
    active: i === turn && tk.alive,
  }));
  ui.sync({
    turnText: t ? `${t.name}'s turn` : '—',
    windText: windText(wind),
    angleText: t ? `Angle ${Math.round(t.angle)}°` : 'Angle 0°',
    powerText: t ? `Power ${Math.round(t.power)}` : 'Power 0',
    powerPct: t ? Math.round(t.power) : 0,
    weaponText: weaponLabel(t),
    weaponBtn: weaponLabel(t),
    health,
    healthSig: health.map((h) => `${h.name}:${Math.round(h.hp)}:${h.alive}:${h.active}`).join('|'),
    controlsOn: screen === 'play' && phase === 'aim' && t && t.alive && !t.isCpu,
  });
}

function state() {
  return {
    screen,
    turn,
    phase,
    wind,
    tanks: tanks.map((t) => ({
      name: t.name,
      color: t.color,
      x: t.x,
      y: t.y,
      hp: t.hp,
      alive: t.alive,
      isCpu: t.isCpu,
      skill: t.skill,
      angle: t.angle,
      power: t.power,
      weapon: t.weapon,
      ammo: ammoSafe(t.ammo),
    })),
    projectiles: projectiles.length,
    particles: fx.count(),
    hazards: hazards.length,
    roundWins: roundWins.slice(),
    weaponIds: weaponIds(),
  };
}

function startGame(opts) {
  const spec = opts && opts.tanks && opts.tanks.length ? opts.tanks : ui.readSetup();
  if (opts && opts.seed != null && opts.seed !== '') seed = Number(opts.seed) >>> 0;
  else seed = urlSeed != null ? urlSeed : ((Math.random() * 1e9) >>> 0);
  gameRng = makeRng(seed);
  clearTransient();
  terrain.generate(gameRng);
  buildTanks(spec);
  placeTanks();
  starter = 0;
  turn = 0;
  screen = 'play';
  phase = 'aim';
  ui.setScreen('play');
  beginTurn();
}

function nextRound() {
  if (!tanks.length) {
    goMenu();
    return;
  }
  clearTransient();
  starter = (starter + 1) % tanks.length;
  seed = (seed + 9973) >>> 0;
  gameRng = makeRng(seed);
  terrain.generate(gameRng);
  for (const t of tanks) {
    t.hp = MAX_HP;
    t.alive = true;
    t.falling = false;
    t.vy = 0;
    t.weapon = 'basic';
    t.ammo = makeAmmo();
  }
  placeTanks();
  turn = starter;
  screen = 'play';
  phase = 'aim';
  ui.setScreen('play');
  beginTurn();
}

function goMenu() {
  clearTransient();
  screen = 'title';
  phase = 'aim';
  ui.setScreen('title');
  bootBackdrop();
}

function canHuman() {
  if (screen !== 'play' || phase !== 'aim') return false;
  const t = tanks[turn];
  return !!(t && t.alive && !t.isCpu);
}

function nudgeAngle(d) {
  if (!canHuman()) return;
  const t = tanks[turn];
  t.angle = clamp(t.angle + d, 0, 180);
  pushUI();
}

function nudgePower(d) {
  if (!canHuman()) return;
  const t = tanks[turn];
  t.power = clamp(t.power + d, 0, 100);
  pushUI();
}

function layout() {
  const cssW = canvas.clientWidth || window.innerWidth;
  const cssH = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  // Fit the world to the screen width and pin the ground to the bottom
  // so dirt and ridges reach every edge. Extra space above is sky.
  const scale = cssW / WORLD_W;
  const offX = 0;
  const offY = cssH - WORLD_H * scale;
  return { dpr, scale, offX, offY, cssW, cssH };
}

function screenToWorld(cx, cy) {
  const L = layout();
  const rect = canvas.getBoundingClientRect();
  return {
    x: (cx - rect.left - L.offX) / L.scale,
    y: (cy - rect.top - L.offY) / L.scale,
  };
}

function applyDrag(e) {
  if (!canHuman()) return;
  const t = tanks[turn];
  const w = screenToWorld(e.clientX, e.clientY);
  const pivotY = t.y - TANK.pivot;
  const dx = w.x - t.x;
  const dy = w.y - pivotY;
  let ang = Math.atan2(-dy, dx) * 180 / Math.PI;
  if (ang < 0) ang = dx < 0 ? 180 : 0;
  t.angle = clamp(ang, 0, 180);
  t.power = clamp(Math.hypot(dx, dy) / 4.4, 1, 100);
  pushUI();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCharred(t, time) {
  const s = 1.22;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(1, -1, 32, 6, 0, 0, 6.3);
  ctx.fill();
  roundRect(-34, -14, 68, 13, 4);
  ctx.fillStyle = '#100c0b';
  ctx.fill();
  ctx.fillStyle = '#2a211c';
  for (let i = -24; i <= 24; i += 12) {
    ctx.beginPath();
    ctx.arc(i, -7, 3.2, 0, 6.3);
    ctx.fill();
  }
  roundRect(-26, -30, 50, 18, 5);
  ctx.fillStyle = '#1a1210';
  ctx.fill();
  ctx.fillStyle = '#3a2822';
  roundRect(-14, -28, 16, 4, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-2, -32, 8, 0, 6.3);
  ctx.fillStyle = '#140e0c';
  ctx.fill();
  const flick = 0.5 + 0.5 * Math.abs(Math.sin(time * 0.018 + t.x));
  ctx.globalAlpha = flick;
  ctx.fillStyle = '#ffb15a';
  ctx.beginPath();
  ctx.ellipse(-5, -40, 3.4, 7, -0.2, 0, 6.3);
  ctx.fill();
  ctx.globalAlpha = 0.8 * flick;
  ctx.fillStyle = '#ff4d12';
  ctx.beginPath();
  ctx.ellipse(4, -37, 2.6, 5, 0.3, 0, 6.3);
  ctx.fill();
  ctx.restore();
  const rise = (time * 0.03) % 36;
  ctx.globalAlpha = 0.4 * (1 - rise / 36);
  ctx.fillStyle = '#1a1412';
  ctx.beginPath();
  ctx.arc(t.x + Math.sin(time * 0.004 + t.x) * 5, t.y - 46 - rise, 9 + rise * 0.15, 0, 6.3);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTank(t, active, time) {
  const rad = (t.angle || 0) * Math.PI / 180;
  const kick = t.recoil || 0;
  const s = 1.22;
  ctx.save();
  ctx.translate(t.x - Math.cos(rad) * kick * 9, t.y + Math.sin(rad) * kick * 7);
  if (active) {
    const pulse = 0.35 + 0.2 * Math.sin(time * 0.006);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -TANK.pivot, 46 * s, 28 * s, 0, 0, 6.3);
    ctx.stroke();
    ctx.globalAlpha = 0.18 * pulse;
    ctx.fillStyle = t.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(2, -1, 32, 6, 0, 0, 6.3);
  ctx.fill();

  roundRect(-36, -16, 72, 16, 5);
  ctx.fillStyle = '#141414';
  ctx.fill();
  ctx.fillStyle = '#2c2c2c';
  roundRect(-34, -15, 68, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#0c0c0c';
  for (let i = -26; i <= 26; i += 13) {
    ctx.beginPath();
    ctx.arc(i, -8, 4.2, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#6a6a6a';
    ctx.beginPath();
    ctx.arc(i, -8, 1.6, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#0c0c0c';
  }

  const hull = ctx.createLinearGradient(0, -40, 0, -16);
  hull.addColorStop(0, t.light || '#fff');
  hull.addColorStop(0.35, t.color);
  hull.addColorStop(1, t.dark || '#222');
  roundRect(-28, -40, 56, 26, 8);
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  roundRect(-18, -37, 22, 5, 2);
  ctx.fill();

  const domeY = -TANK.pivot / s;
  const dome = ctx.createRadialGradient(-5, domeY - 5, 2, 0, domeY, 16);
  dome.addColorStop(0, '#fff');
  dome.addColorStop(0.35, t.color);
  dome.addColorStop(1, t.dark || '#333');
  ctx.beginPath();
  ctx.arc(0, domeY, 14, 0, 6.3);
  ctx.fillStyle = dome;
  ctx.fill();
  ctx.strokeStyle = t.dark || '#222';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();

  const m = {
    x: t.x + Math.cos(rad) * TANK.barrel,
    y: t.y - TANK.pivot + -Math.sin(rad) * TANK.barrel,
  };
  const ox = t.x - Math.cos(rad) * kick * 9;
  const oy = t.y + Math.sin(rad) * kick * 7;
  const bx0 = ox + Math.cos(rad) * 14;
  const by0 = oy - TANK.pivot - Math.sin(rad) * 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a120e';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(bx0, by0);
  ctx.lineTo(m.x, m.y);
  ctx.stroke();
  ctx.strokeStyle = t.light || '#fff';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(bx0 + Math.cos(rad) * 2, by0 - Math.sin(rad) * 2);
  ctx.lineTo(m.x - Math.cos(rad) * 6, m.y + Math.sin(rad) * 6);
  ctx.stroke();
  ctx.fillStyle = '#2a211c';
  ctx.beginPath();
  ctx.arc(m.x, m.y, 4.2, 0, 6.3);
  ctx.fill();

  if (t.hp < 40 && t.alive !== false) {
    const puff = 0.35 + 0.35 * Math.sin(time * 0.01 + t.x);
    ctx.globalAlpha = puff;
    ctx.fillStyle = 'rgba(80,80,80,0.7)';
    ctx.beginPath();
    ctx.arc(t.x + 6, t.y - 58 - puff * 8, 5 + puff * 3, 0, 6.3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (t.name) {
    const labelY = t.y - 92;
    ctx.font = '700 16px Trebuchet MS, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(t.name, t.x, labelY);
    ctx.fillStyle = '#fff8ee';
    ctx.fillText(t.name, t.x, labelY);
    const bw = 56;
    const ratio = clamp(t.hp / MAX_HP, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(t.x - bw / 2, labelY + 4, bw, 7);
    ctx.fillStyle = ratio > 0.55 ? '#8dff6a' : ratio > 0.28 ? '#ffd15c' : '#ff5b45';
    ctx.fillRect(t.x - bw / 2, labelY + 4, bw * ratio, 7);
  }
  if (active) {
    const bob = Math.sin(time * 0.007) * 5;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 112 + bob);
    ctx.lineTo(t.x - 8, t.y - 126 + bob);
    ctx.lineTo(t.x + 8, t.y - 126 + bob);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSky(L, time) {
  const { cssW: w, cssH: h } = L;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#070114');
  g.addColorStop(0.22, '#2a0a48');
  g.addColorStop(0.42, '#6c1868');
  g.addColorStop(0.58, '#c43458');
  g.addColorStop(0.72, '#ff6a2a');
  g.addColorStop(0.86, '#ffb15a');
  g.addColorStop(1, '#ffd9a4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const band = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.78);
  band.addColorStop(0, 'rgba(255,80,20,0)');
  band.addColorStop(0.45, 'rgba(255,140,50,0.28)');
  band.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, h * 0.42, w, h * 0.36);

  const reduce = reducedMotion();
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const tw = reduce ? 0.7 : 0.45 + 0.55 * Math.sin(time * 0.002 + s.p);
    ctx.globalAlpha = tw;
    ctx.fillStyle = '#fff6e4';
    ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  const sx = w * 0.76;
  const sy = h * 0.2;
  const R = Math.min(w, h) * 0.42;
  const pulse = reduce ? 1 : 1 + Math.sin(time * 0.0012) * 0.03;
  ctx.globalCompositeOperation = 'lighter';
  const rg = ctx.createRadialGradient(sx, sy, R * 0.08, sx, sy, R * pulse);
  rg.addColorStop(0, 'rgba(255,255,236,0.95)');
  rg.addColorStop(0.16, 'rgba(255,220,140,0.7)');
  rg.addColorStop(0.42, 'rgba(255,120,40,0.28)');
  rg.addColorStop(1, 'rgba(255,70,20,0)');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(sx, sy, R * pulse, 0, 6.3);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff8e6';
  ctx.beginPath();
  ctx.arc(sx, sy, R * 0.22, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,236,190,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, R * 0.3, 0, 6.3);
  ctx.stroke();
}

function drawMountains(time) {
  const layers = terrain.getMountains();
  const drift = reducedMotion() ? 0 : Math.sin(time * 0.00015) * 18;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const pts = layer.pts;
    const ox = drift * (0.25 + layer.depth * 0.35);
    const y0 = pts[1];
    const y1 = pts[pts.length - 1];
    ctx.beginPath();
    ctx.moveTo(-420, WORLD_H);
    ctx.lineTo(-420, y0);
    for (let p = 0; p < pts.length; p += 2) ctx.lineTo(pts[p] + ox, pts[p + 1]);
    ctx.lineTo(WORLD_W + 420, y1);
    ctx.lineTo(WORLD_W + 420, WORLD_H);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();
  }
}

function drawClouds() {
  for (const c of clouds) {
    ctx.fillStyle = `rgba(255, 228, 214, ${c.a})`;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w, c.h, 0, 0, 6.3);
    ctx.ellipse(c.x + c.w * 0.42, c.y + 2, c.w * 0.62, c.h * 0.85, 0, 0, 6.3);
    ctx.ellipse(c.x - c.w * 0.38, c.y + 3, c.w * 0.5, c.h * 0.72, 0, 0, 6.3);
    ctx.ellipse(c.x + c.w * 0.1, c.y - c.h * 0.45, c.w * 0.4, c.h * 0.6, 0, 0, 6.3);
    ctx.fill();
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const len = p.bomblet ? 16 : 22;
    const glowR = p.bomblet ? 20 : 26;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = p.color || '#ffe7a0';
    ctx.globalAlpha = p.bomblet ? 0.45 : 0.28;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glowR, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = p.color || '#ffe7a0';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = p.bomblet ? 3.5 : 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.color || '#ffe7a0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.bomblet ? 8 : 7.5, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.bomblet ? 3.4 : 3.2, 0, 6.3);
    ctx.fill();
    if (p.trail === 'spark') {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 8, p.y - 1, 3, 3);
      ctx.fillRect(p.x + 4, p.y - 6, 2, 2);
    }
    if (p.y < 8 && p.x >= 0 && p.x <= WORLD_W) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = p.color || '#fff';
      ctx.beginPath();
      ctx.moveTo(p.x, 18);
      ctx.lineTo(p.x - 7, 30);
      ctx.lineTo(p.x + 7, 30);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawAim(L) {
  const t = tanks[turn];
  if (!t || !t.alive || screen !== 'play') return;
  if (phase === 'aim' || phase === 'ai') {
    const gh = 40;
    const side = t.angle > 90 ? 34 : -34;
    const gx = t.x + side;
    const gy = t.y - 78;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(gx, gy, 6, gh);
    const pct = clamp(t.power / 100, 0, 1);
    ctx.fillStyle = pct > 0.66 ? '#ff5b3a' : '#ffb15a';
    ctx.fillRect(gx, gy + gh * (1 - pct), 6, gh * pct);
  }
  if (!canHuman()) return;
  const m = escapeMuzzle(t, terrain.heightAt);
  const rad = t.angle * Math.PI / 180;
  const lenPx = 40 + (t.power / 100) * 20;
  const len = lenPx / L.scale;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.4 / L.scale;
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(m.x + Math.cos(rad) * len, m.y - Math.sin(rad) * len);
  ctx.stroke();
}

function render(now) {
  const L = layout();
  const sh = fx.consumeShake();
  let sx = sh ? (Math.random() - 0.5) * sh * 2 : 0;
  let sy = sh ? (Math.random() - 0.5) * sh * 2 : 0;
  const cap = L.cssH < 500 ? 9 : 14;
  const mag = Math.hypot(sx, sy);
  if (mag > cap) {
    sx *= cap / mag;
    sy *= cap / mag;
  }
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  drawSky(L, now);
  ctx.save();
  ctx.translate(L.offX + sx, L.offY + sy);
  ctx.scale(L.scale, L.scale);
  drawMountains(now);
  drawClouds();
  const tc = terrain.getCanvas();
  const bleed = 100 / Math.max(0.25, L.scale);
  ctx.drawImage(tc, 0, 0, 4, WORLD_H, -bleed, 0, bleed + 4, WORLD_H);
  ctx.drawImage(tc, WORLD_W - 4, 0, 4, WORLD_H, WORLD_W - 4, 0, bleed + 8, WORLD_H);
  ctx.drawImage(tc, 0, WORLD_H - 4, WORLD_W, 4, 0, WORLD_H - 4, WORLD_W, bleed);
  ctx.drawImage(tc, 0, 0);
  ctx.fillStyle = '#140c09';
  ctx.fillRect(-bleed, WORLD_H - 2, WORLD_W + bleed * 2, 900);
  const backdrop = screen === 'title' || screen === 'setup';
  const list = backdrop ? decor : tanks;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.alive === false) drawCharred(t, now);
    else drawTank(t, screen === 'play' && i === turn && phase !== 'flight', now);
  }
  drawProjectiles();
  fx.draw(ctx);
  drawAim(L);
  ctx.restore();

  const vg = ctx.createRadialGradient(
    L.cssW / 2, L.cssH / 2, Math.min(L.cssW, L.cssH) * 0.35,
    L.cssW / 2, L.cssH / 2, Math.max(L.cssW, L.cssH) * 0.72,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,0,12,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, L.cssW, L.cssH);

  const flash = fx.consumeFlash();
  if (flash > 0.02) {
    ctx.fillStyle = `rgba(255, 236, 214, ${flash})`;
    ctx.fillRect(0, 0, L.cssW, L.cssH);
  }
}

let lastUI = 0;
function frame(now) {
  const t0 = performance.now();
  if (screen === 'play' && phase === 'ai') ai.think(36);
  const steps = Math.max(1, Math.round(speedMul * 2));
  for (let i = 0; i < steps; i++) simulate(SIM_DT);
  let speed = 0;
  let vy = 0;
  if (projectiles.length) {
    let s = 0;
    let v = 0;
    for (const p of projectiles) {
      s += Math.hypot(p.vx, p.vy);
      v += p.vy;
    }
    speed = s / projectiles.length;
    vy = v / projectiles.length;
  }
  audio.updateFlight(screen === 'play' && projectiles.length > 0, speed, vy);
  render(now || performance.now());
  if (screen === 'play' && now - lastUI > 80) {
    lastUI = now;
    pushUI();
  }
  const ms = performance.now() - t0;
  samples.push(ms);
  if (samples.length > 60) samples.shift();
  requestAnimationFrame(frame);
}

let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (!canHuman()) return;
  dragging = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  applyDrag(e);
});
canvas.addEventListener('pointermove', (e) => { if (dragging) applyDrag(e); });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (!canHuman()) return;
  const t = tanks[turn];
  if (e.key === 'ArrowLeft') { e.preventDefault(); t.angle = clamp(t.angle - 1, 0, 180); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); t.angle = clamp(t.angle + 1, 0, 180); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); t.power = clamp(t.power + 1, 0, 100); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); t.power = clamp(t.power - 1, 0, 100); }
  else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fire(); }
  else if (e.key === 'Tab' || e.key === 'q' || e.key === 'e' || e.key === 'Q' || e.key === 'E') {
    e.preventDefault();
    const dir = (e.key === 'q' || e.key === 'Q') ? -1 : 1;
    t.weapon = cycleWeapon(t.weapon, t.ammo, dir);
  } else return;
  pushUI();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

ui.bind({
  onPlay() { screen = 'setup'; ui.setScreen('setup'); },
  onStart() { startGame({}); },
  onAngle: nudgeAngle,
  onPower: nudgePower,
  onFire() { if (canHuman()) { fire(); pushUI(); } },
  onWeapon(dir) {
    if (!canHuman()) return;
    const t = tanks[turn];
    t.weapon = cycleWeapon(t.weapon, t.ammo, dir || 1);
    pushUI();
  },
  onMute() {
    audio.unlock();
    audio.setMuted(!audio.isMuted());
    ui.setMuted(audio.isMuted());
  },
  onNext: nextRound,
  onMenu: goMenu,
});
ui.setMuted(audio.isMuted());
ui.setScreen('title');
bootBackdrop();

function frameStats() {
  if (!samples.length) return { avgMs: 0, maxMs: 0, frames: 0 };
  let sum = 0;
  let max = 0;
  for (const m of samples) {
    sum += m;
    if (m > max) max = m;
  }
  return { avgMs: sum / samples.length, maxMs: max, frames: samples.length };
}

window.__game = {
  state,
  terrainHeightAt(x) { return terrain.heightAt(+x); },
  setAim(angle, power) {
    const t = tanks[turn];
    if (!t) return;
    if (angle != null) t.angle = clamp(+angle, 0, 180);
    if (power != null) t.power = clamp(+power, 0, 100);
    pushUI();
  },
  selectWeapon(id) {
    const t = tanks[turn];
    const w = getWeapon(id);
    if (!t || !w) return;
    t.weapon = w.id;
    pushUI();
  },
  fire() { const ok = fire(); pushUI(); return ok; },
  startGame(opts) { startGame(opts || {}); },
  setWind(n) { wind = clamp(Math.round(+n || 0), -10, 10); pushUI(); },
  setSpeed(mult) { speedMul = clamp(+mult || 1, 0.25, 40); },
  damageTank(i, hp) { damageTank(i | 0, +hp || 0); pushUI(); },
  carve(x, y, r) { terrain.carve(+x, +y, +r); markFalls(); },
  frameStats,
};

requestAnimationFrame(frame);
