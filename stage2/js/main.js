import {
  GAME_TITLE, WORLD_W, WORLD_H, SIM_DT, GRAVITY, POWER_SCALE, WIND_ACCEL,
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
import {
  ECON, STARTER, emptyItems, emptyUpgrades, maxPowerOf, ownedCount,
  canBuy as canBuyItem, canSell as canSellItem, buy as buyItem, sell as sellItem, give,
} from './economy.js?v=1';
import { shopCpus, humanOrder } from './store.js?v=1';

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

let stage2 = false;
let round = 1;
let totalRounds = 5;
let terrainChoice = 'random';
let terrainStyle = 'classic';
let matchOver = false;
let cashStart = 0;
let lastSpec = [];
let roundSettled = false;
let shopped = false;
let storeHumans = [];
let storeAt = 0;
let storeCat = 'weapon';
let cpuNote = '';
let moneyAcc = [];
let lastRoundMoney = [];
let lastImpact = null;
let lastGhost = null;
let crackleT = 0;
const PARTY = ['#ff4ad8', '#7dff4a', '#4ad4ff', '#ffe14a', '#c58bff', '#ff7a3c', '#fff'];

document.title = GAME_TITLE;

function makeAmmo(isStage2) {
  const ammo = {};
  for (const id of weaponIds()) {
    const w = getWeapon(id);
    ammo[id] = isStage2 ? w.ammoDefault : (w.s1 != null ? w.s1 : 0);
  }
  if (isStage2) {
    for (const k in STARTER) ammo[k] = (ammo[k] || 0) + STARTER[k];
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
  terrain.generate(rng, 'classic');
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

function blankMoney(t) {
  return {
    name: t.name,
    color: t.color,
    damage: 0,
    kills: 0,
    win: 0,
    survival: 0,
    interest: 0,
    self: 0,
    total: 0,
    balance: t.cash | 0,
  };
}

function resetMoneyAcc() {
  moneyAcc = tanks.map((t) => blankMoney(t));
}

function buildTanks(spec, cash) {
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
      maxHp: MAX_HP,
      alive: true,
      isCpu: !!s.cpu,
      skill: s.skill || 'normal',
      angle: 60,
      power: 50,
      weapon: 'basic',
      ammo: makeAmmo(stage2),
      items: emptyItems(),
      upgrades: emptyUpgrades(),
      cash: stage2 ? (cash | 0) : 0,
      shield: 0,
      shieldFlick: 0,
      chute: false,
      falling: false,
      fallFrom: 0,
      vy: 0,
      recoil: 0,
      kills: 0,
      damageDealt: 0,
      lastLand: null,
    };
  });
  roundWins = tanks.map(() => 0);
  resetMoneyAcc();
}

function placeTanks() {
  const xs = terrain.findSpawns(tanks.length, gameRng);
  for (let i = 0; i < tanks.length; i++) terrain.flattenPad(xs[i], 78, stage2 ? 460 : 0);
  for (let i = 0; i < tanks.length; i++) {
    const t = tanks[i];
    t.x = xs[i];
    t.y = terrain.heightAt(xs[i]);
    t.falling = false;
    t.vy = 0;
    t.chute = false;
    t.angle = t.x < WORLD_W / 2 ? 62 : 118;
    if (t.power > maxPowerOf(t)) t.power = maxPowerOf(t);
  }
}

function armShields() {
  if (!stage2) return;
  for (const t of tanks) {
    t.shield = 0;
    t.shieldFlick = 0;
    t.chute = false;
    if (t.items.shield > 0) {
      t.items.shield -= 1;
      t.shield = ECON.shieldHp;
    }
  }
}

function clearTransient() {
  projectiles = [];
  hazards = [];
  spawnQ = [];
  deathQ.length = 0;
  shotActive = false;
  winWait = null;
  crackleT = 0;
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
  if (screen === 'winner' || screen === 'final' || winWait || roundSettled) return;
  winWait = { winner: winner || null, left: 1.8 };
  phase = 'settle';
  shotActive = false;
  ai.cancel();
  ui.hideBanner();
}

function payout(winner) {
  if (!stage2) {
    lastRoundMoney = [];
    return;
  }
  for (let i = 0; i < tanks.length; i++) {
    const interest = Math.min(ECON.interestCap, Math.round(tanks[i].cash * ECON.interest));
    addCash(i, interest, 'interest');
  }
  for (let i = 0; i < tanks.length; i++) {
    if (winner && tanks[i] === winner) addCash(i, ECON.winBonus, 'win');
    if (tanks[i].alive) addCash(i, ECON.surviveBonus, 'survival');
  }
  lastRoundMoney = moneyAcc.map((m, i) => ({
    name: m.name,
    color: tanks[i].color,
    damage: m.damage,
    kills: m.kills,
    win: m.win,
    survival: m.survival,
    interest: m.interest,
    self: m.self,
    total: m.damage + m.kills + m.win + m.survival + m.interest - m.self,
    balance: tanks[i].cash,
  }));
}

function finishRoundNow(winner) {
  if (roundSettled || screen === 'winner' || screen === 'final') return;
  roundSettled = true;
  winWait = null;
  if (winner) {
    const idx = tanks.indexOf(winner);
    if (idx >= 0) roundWins[idx] += 1;
  }
  payout(winner);
  screen = 'winner';
  phase = 'aim';
  const headline = winner ? `${winner.name} wins!` : 'Draw';
  const tallyBits = tanks.map((t, i) => `${t.name} ${roundWins[i] || 0}`);
  const tally = stage2
    ? `Round ${round}/${totalRounds}   ·   ${tallyBits.join('   ·   ')}`
    : tallyBits.join('   ·   ');
  ui.setWinner(headline, tally);
  ui.renderMoney(stage2 ? lastRoundMoney : null);
  const last = stage2 && round >= totalRounds;
  if (last) matchOver = true;
  ui.setNextLabel(last ? 'Standings' : 'Next round');
  ui.setScreen('winner');
  pushUI();
}

function finishRound() {
  if (!winWait || screen === 'winner') {
    winWait = null;
    return;
  }
  const winner = winWait.winner;
  winWait = null;
  finishRoundNow(winner);
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
        t.chute = false;
      }
      any = true;
    }
  }
  if (any && screen === 'play' && (phase === 'aim' || phase === 'ai')) phase = 'settle';
  return any;
}

function addCash(i, amount, bucket) {
  if (!stage2) return;
  const t = tanks[i];
  if (!t || !amount) return;
  const before = t.cash;
  t.cash = Math.max(0, Math.round(t.cash + amount));
  const applied = t.cash - before;
  const row = moneyAcc[i];
  if (!row || !bucket || !applied) return;
  if (bucket === 'self') row.self += -applied;
  else row[bucket] = (row[bucket] || 0) + applied;
}

function hurt(t, dmg, attacker) {
  if (!t || !t.alive || !(dmg > 0)) return;
  let left = dmg;
  if (t.shield > 0) {
    const absorb = Math.min(t.shield, left);
    t.shield -= absorb;
    left -= absorb;
    t.shieldFlick = 1;
    if (t.shield <= 0) {
      t.shield = 0;
      fx.shieldPop(t.x, t.y - 36, t.color);
    }
  }
  if (!(left > 0)) return;
  const idx = tanks.indexOf(t);
  const dealt = Math.min(left, t.hp);
  t.hp -= dealt;
  if (stage2 && attacker != null && attacker >= 0 && dealt > 0) {
    if (attacker !== idx) {
      addCash(attacker, Math.round(dealt * ECON.payPerHp), 'damage');
      if (tanks[attacker]) tanks[attacker].damageDealt += dealt;
    } else {
      addCash(idx, -Math.round(dealt * ECON.selfPerHp), 'self');
    }
  }
  if (t.hp <= 0) {
    t.hp = 0;
    t.alive = false;
    t.falling = false;
    t.killedBy = attacker;
    if (stage2 && attacker != null && attacker >= 0 && attacker !== idx) {
      addCash(attacker, ECON.killBonus, 'kills');
      if (tanks[attacker]) tanks[attacker].kills = (tanks[attacker].kills || 0) + 1;
    }
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
    const src = t.killedBy != null ? t.killedBy : null;
    for (const o of tanks) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - t.x, (o.y - TANK.hitUp) - (t.y - 8));
      if (d < 72) hurt(o, 26 * (1 - d / 72), src);
    }
  }
  deathQ.length = 0;
}

function maybeEnd() {
  if (screen !== 'play' || winWait || roundSettled) return;
  const living = livingTanks();
  if (living.length <= 1 && !projectiles.length && !hazards.length && !tanks.some((tk) => tk.alive && tk.falling)) {
    endRound(living[0] || null);
  }
}

function damageTank(i, amount) {
  const t = tanks[i];
  if (!t || Number.isNaN(amount)) return;
  if (!t.alive) {
    if (amount < 0) t.hp = clamp(t.hp - amount, 0, t.maxHp || MAX_HP);
    return;
  }
  if (amount < 0) {
    t.hp = clamp(t.hp - amount, 0, t.maxHp || MAX_HP);
    return;
  }
  hurt(t, amount, null);
  flushDeaths();
  maybeEnd();
}

function noteImpact(p) {
  lastImpact = {
    x: p.x,
    y: p.y,
    landX: p.landX != null ? p.landX : p.x,
    weapon: p.weaponId || p.behavior || '',
  };
  lastGhost = { x: p.x, y: p.y };
  const owner = tanks[p.owner];
  if (owner) owner.lastLand = { x: p.x, y: p.y };
}

function doExplode(p) {
  const pop = p.blast === 'pop';
  const party = p.blast === 'party';
  const nuke = p.behavior === 'nuke' || p.weaponId === 'nuke';
  const bits = terrain.carve(p.x, p.y, p.radius * (nuke ? 0.98 : 0.95));
  markFalls();
  fx.rubble(bits);
  if (nuke) {
    fx.nukeBoom(p.x, p.y, p.radius);
    audio.rumble();
  } else {
    fx.explosion(p.x, p.y, p.radius, {
      pop, party, shake: p.shake, color: p.color,
      block: party ? 0.22 : undefined,
    });
    audio.boom(Math.min(1.3, p.radius / 70), pop);
  }
  noteImpact(p);
  for (const t of tanks) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - p.x, (t.y - TANK.hitUp) - p.y);
    if (d < p.radius) hurt(t, p.damage * (1 - d / p.radius), p.owner);
  }
  flushDeaths();
}

function doDirt(p) {
  terrain.addMound(p.x, p.y, p.radius);
  fx.dirtBurst(p.x, terrain.heightAt(p.x), p.radius);
  audio.thud();
  noteImpact(p);
  for (const t of tanks) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - p.x, (t.y - TANK.hitUp) - p.y);
    if (d < p.radius * 0.55) hurt(t, p.damage * (1 - d / (p.radius * 0.55)), p.owner);
  }
  flushDeaths();
}

function spawnNapalm(x, y, owner) {
  const w = getWeapon('napalm');
  const n = (w && w.blobs) || 32;
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * 8 + (gameRng() - 0.5) * 24;
    const hx = clamp(x + ox, 4, WORLD_W - 4);
    hazards.push({
      type: 'napalm',
      x: hx,
      y: terrain.heightAt(hx),
      radius: 50,
      dps: (w && w.dps) || 1.15,
      ttl: ((w && w.burnTime) || 5.2) * (0.84 + gameRng() * 0.32),
      flow: true,
      flowSpeed: ((w && w.flowSpeed) || 52) * (0.62 + gameRng() * 0.75),
      phase: gameRng() * Math.PI * 2,
      owner,
      vis: gameRng() * 0.12,
    });
  }
  const spread = (n - 1) * 5.2;
  for (let k = -spread; k <= spread; k += 4) terrain.burnAt(x + k);
  audio.crackle();
  fx.napalmSplash(x, terrain.heightAt(x));
  noteImpact({ x, y: terrain.heightAt(x), owner, weaponId: 'napalm', behavior: 'napalm' });
}

function splitVolley(p) {
  const w = getWeapon(p.weaponId) || getWeapon('cluster');
  const n = (w && w.bomblets) || 5;
  const spread = (w && w.spread) || 76;
  const mirv = p.behavior === 'mirv';
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spread;
    spawnQ.push({
      x: p.x,
      y: p.y,
      vx: p.vx * (mirv ? 0.22 : 0.3) + off,
      vy: (mirv ? 28 : 16) + i * (mirv ? 10 : 18),
      age: 0,
      vyPrev: 0,
      dead: false,
      owner: p.owner,
      behavior: 'standard',
      bomblet: !mirv,
      blast: mirv ? 'mid' : 'pop',
      radius: w.bombletRadius,
      damage: w.bombletDamage,
      color: mirv ? (i % 2 ? '#ffe9a8' : '#ff9a3c') : w.color,
      trail: 'spark',
      shake: mirv ? 0.9 : 0.55,
      weaponId: p.weaponId,
      lastTrail: 0,
    });
  }
  audio.boom(0.3, true);
  fx.splitFlash(p.x, p.y, w.color);
}

function splitFunky(p) {
  const w = getWeapon('funky');
  const n = (w && w.bomblets) || 7;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2);
    const sx = p.x + off * 6;
    spawnQ.push({
      x: sx,
      y: terrain.heightAt(sx) - 26,
      vx: off * 130,
      vy: -560 - Math.abs(off) * 20,
      age: 0,
      vyPrev: 0,
      dead: false,
      owner: p.owner,
      behavior: 'funkybit',
      bomblet: false,
      blast: 'party',
      bounces: 2,
      rainbow: true,
      radius: w.bombletRadius,
      damage: w.bombletDamage,
      color: PARTY[i % PARTY.length],
      trail: 'spark',
      shake: 0.45,
      weaponId: 'funky',
      lastTrail: 0,
    });
  }
  audio.boom(0.35, true);
  fx.splitFlash(p.x, p.y, '#ff4ad8');
}

function downhillDir(x) {
  let bestD = 0;
  let bestH = terrain.heightAt(x);
  for (const span of [36, 80, 150]) {
    for (const d of [-1, 1]) {
      const h = terrain.heightAt(clamp(x + d * span, 0, WORLD_W - 1));
      if (h > bestH + 2) {
        bestH = h;
        bestD = d;
      }
    }
    if (bestD) return bestD;
  }
  return bestD || 1;
}

function beginRoll(p) {
  p.rolling = true;
  p.landX = p.x;
  p.fuse = p.fuseTime || 4;
  p.spin = 0;
  p.traveled = 0;
  p.y = terrain.heightAt(p.x) - 12;
  p.vx = downhillDir(p.x) * 180;
  p.vy = 0;
}

function stepRoller(p, dt) {
  p.fuse -= dt;
  p.age += dt;
  const hL = terrain.heightAt(p.x - 10);
  const hR = terrain.heightAt(p.x + 10);
  const slope = (hR - hL) / 20;
  p.vx += slope * 1500 * dt;
  p.vx *= Math.exp(-0.4 * dt);
  let nx = p.x + p.vx * dt;
  if (nx < 14 || nx > WORLD_W - 14) {
    nx = clamp(nx, 14, WORLD_W - 14);
    p.vx *= -0.2;
  }
  const climb = terrain.heightAt(p.x) - terrain.heightAt(nx);
  if (climb > 4.5 && Math.abs(p.vx) < 90) p.vx *= 0.45;
  p.traveled += Math.abs(nx - p.x);
  p.x = nx;
  p.y = terrain.heightAt(p.x) - 12;
  p.spin += p.vx * 0.012;
  if (Math.random() < 0.45) fx.trail(p.x - Math.sign(p.vx || 1) * 10, p.y + 2, 'smoke', '#d7c8b4');
  let hit = false;
  for (let ti = 0; ti < tanks.length; ti++) {
    const t = tanks[ti];
    if (!t.alive) continue;
    if (hitsTank(p.x, p.y - 2, t)) { hit = true; break; }
  }
  const stopped = Math.abs(slope) < 0.05 && Math.abs(p.vx) < 24 && p.traveled > 36;
  if (hit || p.fuse <= 0 || stopped) {
    p.behavior = 'standard';
    p.rolling = false;
    p.blast = 'full';
    doExplode(p);
    p.dead = true;
  }
}

function impact(p) {
  if ((p.behavior === 'cluster' || p.behavior === 'mirv') && !p.bomblet && p.blast !== 'mid') {
    splitVolley(p);
    return;
  }
  if (p.behavior === 'funky') {
    splitFunky(p);
    noteImpact(p);
    return;
  }
  if (p.behavior === 'dirt') {
    doDirt(p);
    return;
  }
  if (p.behavior === 'napalm') {
    spawnNapalm(p.x, p.y, p.owner);
    return;
  }
  if (p.behavior === 'roller' && !p.rolling) {
    beginRoll(p);
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
  if (stage2 && t.items.laser > 0) t.items.laser -= 1;
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
    blast: 'full',
    radius: w.radius,
    damage: w.damage,
    color: w.color,
    trail: w.trail,
    shake: w.shake,
    weaponId: w.id,
    fuseTime: w.fuse || 4,
    lastTrail: 0,
    rolling: false,
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
    if (p.rolling) {
      stepRoller(p, dt);
      continue;
    }
    flyStep(p, dt, wind);
    const trailEvery = p.rainbow ? 0.028 : (p.trail === 'spark' ? 0.055 : 0.09);
    if (p.age - p.lastTrail > trailEvery) {
      p.lastTrail = p.age;
      const col = p.rainbow ? PARTY[((p.age * 12) | 0) % PARTY.length] : p.color;
      if (p.rainbow) fx.trail(p.x, p.y, 'spark', col, { vx: -p.vx * 0.45, vy: -p.vy * 0.45, len: 130 });
      else fx.trail(p.x, p.y, p.trail === 'smoke' ? 'smoke' : 'spark', col);
    }
    if ((p.behavior === 'cluster' || p.behavior === 'mirv') && !p.bomblet && p.blast !== 'mid'
      && p.age > 0.08 && p.vyPrev < 0 && p.vy >= 0) {
      splitVolley(p);
      p.dead = true;
      continue;
    }
    if (p.x < 0 || p.x > WORLD_W) {
      p.dead = true;
      continue;
    }
    if (p.behavior === 'funkybit' && p.age > 0.05 && p.y >= terrain.heightAt(p.x)) {
      if (p.bounces > 0) {
        p.bounces -= 1;
        p.vy = -Math.abs(p.vy) * 0.64;
        p.vx *= 0.88;
        p.y = terrain.heightAt(p.x) - 4;
        fx.explosion(p.x, p.y, 14, { pop: true, party: true, shake: 0.15, color: p.color, block: 0.04 });
      } else {
        doExplode(p);
        p.dead = true;
      }
      continue;
    }
    const arm = p.bomblet ? 0.04 : 0.12;
    if (p.age > arm && p.behavior !== 'roller') {
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
      if (p.behavior === 'roller' && !p.rolling) beginRoll(p);
      else {
        impact(p);
        p.dead = true;
      }
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
  const touch = [];
  for (let i = 0; i < tanks.length; i++) touch.push(0);
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.ttl -= dt;
    if (h.ttl <= 0) {
      hazards.splice(i, 1);
      continue;
    }
    if (h.flow) {
      const left = terrain.heightAt(h.x - 4);
      const right = terrain.heightAt(h.x + 4);
      let dir = left === right ? 0 : (left > right ? -1 : 1);
      if (!dir) {
        const farL = terrain.heightAt(h.x - 18);
        const farR = terrain.heightAt(h.x + 18);
        dir = farL === farR ? 0 : (farL > farR ? -1 : 1);
      }
      h.x = clamp(h.x + dir * (h.flowSpeed || 48) * dt, 2, WORLD_W - 2);
      h.y = terrain.heightAt(h.x);
      if (((h.x | 0) % 6) === 0) terrain.burnAt(h.x);
    }
    if (h.dps) {
      for (let ti = 0; ti < tanks.length; ti++) {
        const t = tanks[ti];
        if (!t.alive) continue;
        const d = Math.hypot(t.x - h.x, (t.y - TANK.hitUp) - h.y);
        const rad = h.radius || 16;
        if (d < rad) touch[ti] += h.dps * (1 - d / rad);
      }
    }
    if (h.type === 'napalm') {
      h.vis = (h.vis || 0) + dt;
      if (h.vis > 0.11) {
        h.vis = 0;
        fx.napalmPuff(h.x, h.y);
      }
    }
  }
  let anyBurn = false;
  for (let ti = 0; ti < tanks.length; ti++) {
    if (!(touch[ti] > 0)) continue;
    anyBurn = true;
    const owner = hazards.length ? hazards[0].owner : null;
    hurt(tanks[ti], Math.min(touch[ti], 16) * dt, owner);
  }
  if (anyBurn || hazards.some((h) => h.type === 'napalm')) {
    crackleT += dt;
    if (crackleT > 0.55) {
      crackleT = 0;
      audio.crackle();
    }
  }
  flushDeaths();
}

function stepTanks(dt) {
  for (const t of tanks) {
    if (t.shieldFlick) {
      t.shieldFlick = Math.max(0, t.shieldFlick - dt * 3);
    }
    if (!t.falling) continue;
    const g = terrain.heightAt(t.x);
    const dropped = t.y - (t.fallFrom == null ? t.y : t.fallFrom);
    if (!t.chute && t.alive && t.items && t.items.parachute > 0 && dropped > FALL_SAFE) t.chute = true;
    t.vy += GRAVITY * dt * (t.chute ? 0.35 : 1);
    if (t.chute) t.vy = Math.min(t.vy, 110);
    t.y += t.vy * dt;
    if (t.y >= g) {
      const dist = g - (t.fallFrom == null ? t.y : t.fallFrom);
      t.y = g;
      t.vy = 0;
      t.falling = false;
      if (t.alive) {
        if (t.chute) {
          t.items.parachute = Math.max(0, (t.items.parachute || 0) - 1);
          t.chute = false;
          fx.dirtBurst(t.x, t.y, 18);
        } else {
          const extra = dist - FALL_SAFE;
          if (extra > 0) hurt(t, extra * FALL_DPH, null);
        }
      } else t.chute = false;
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
  maybeEnd();
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
  const human = screen === 'play' && phase === 'aim' && t && t.alive && !t.isCpu;
  const fuelN = t && t.items ? t.items.fuel : 0;
  const showMove = !!(human && fuelN > 0.2);
  const showShield = !!(human && t && ((t.items && t.items.shield > 0) || t.shield > 0));
  const health = tanks.map((tk, i) => ({
    name: tk.name,
    color: tk.color,
    hp: tk.hp,
    alive: tk.alive,
    active: i === turn && tk.alive,
  }));
  const cap = t ? maxPowerOf(t) : 100;
  ui.sync({
    turnText: t ? (stage2 ? `${t.name}  ${round}/${totalRounds}` : `${t.name}'s turn`) : '—',
    windText: windText(wind),
    angleText: t ? `Angle ${Math.round(t.angle)}°` : 'Angle 0°',
    powerText: t ? `Power ${Math.round(t.power)}` : 'Power 0',
    powerPct: t ? Math.round((t.power / cap) * 100) : 0,
    weaponText: weaponLabel(t),
    weaponBtn: weaponLabel(t),
    health,
    healthSig: health.map((h) => `${h.name}:${Math.round(h.hp)}:${h.alive}:${h.active}`).join('|'),
    controlsOn: human,
    showMove,
    showShield,
    showFuel: !!(t && t.items && t.items.fuel > 0 && screen === 'play'),
    fuelText: `Fuel ${Math.floor(fuelN)}`,
    shieldText: t && t.shield > 0 ? `Shield ${Math.round(t.shield)}` : 'Shield',
  });
}

function moneyView() {
  const src = (screen === 'winner' || screen === 'final' || screen === 'store' || screen === 'pass')
    ? lastRoundMoney
    : moneyAcc;
  return src.map((m, i) => ({
    name: m.name,
    color: tanks[i] ? tanks[i].color : m.color,
    damage: m.damage || 0,
    kills: m.kills || 0,
    win: m.win || 0,
    survival: m.survival || 0,
    interest: m.interest || 0,
    self: m.self || 0,
    total: (m.damage || 0) + (m.kills || 0) + (m.win || 0) + (m.survival || 0) + (m.interest || 0) - (m.self || 0),
    balance: tanks[i] ? tanks[i].cash : m.balance,
  }));
}

function rollerState() {
  for (const p of projectiles) {
    if (p.rolling) return { x: p.x, y: p.y, landX: p.landX, vx: p.vx };
  }
  return null;
}

function offscreenNow() {
  if (!projectiles.length) return false;
  const L = layout();
  for (const p of projectiles) {
    if (p.x < -40 || p.x > WORLD_W + 40) continue;
    const sy = L.offY + p.y * L.scale;
    if (sy < 16) return true;
  }
  return false;
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
      maxHp: t.maxHp,
      alive: t.alive,
      isCpu: t.isCpu,
      skill: t.skill,
      angle: t.angle,
      power: t.power,
      weapon: t.weapon,
      ammo: ammoSafe(t.ammo),
      cash: t.cash | 0,
      shield: t.shield || 0,
      items: {
        parachute: t.items.parachute || 0,
        fuel: t.items.fuel || 0,
        laser: t.items.laser || 0,
        shield: t.items.shield || 0,
      },
      upgrades: {
        armor: t.upgrades.armor || 0,
        barrel: t.upgrades.barrel || 0,
      },
    })),
    projectiles: projectiles.length,
    shots: projectiles.filter((p) => !p.dead).slice(0, 16).map((p) => ({ x: p.x, y: p.y })),
    particles: fx.count(),
    hazards: hazards.length,
    hazardsInfo: hazards.map((h) => ({ x: h.x, y: h.y })),
    roundWins: roundWins.slice(),
    weaponIds: weaponIds(),
    round,
    totalRounds,
    terrainStyle,
    matchOver,
    lastRoundMoney: moneyView(),
    offscreenMarker: offscreenNow(),
    ghostMarker: lastGhost,
    lastImpact,
    roller: rollerState(),
  };
}

function startRoundTerrain() {
  const style = stage2 ? terrain.resolveStyle(gameRng, terrainChoice) : 'classic';
  terrainStyle = style;
  terrain.generate(gameRng, style);
}

function startGame(opts) {
  const o = opts || {};
  const spec = o.tanks && o.tanks.length ? o.tanks : ui.readSetup();
  stage2 = !!o.stage2;
  lastSpec = spec.map((s) => ({ cpu: !!s.cpu, skill: s.skill || 'normal' }));
  if (o.seed != null && o.seed !== '') seed = Number(o.seed) >>> 0;
  else seed = urlSeed != null ? urlSeed : ((Math.random() * 1e9) >>> 0);
  gameRng = makeRng(seed);
  if (stage2) {
    const opt = ui.readOptions();
    totalRounds = o.rounds || opt.rounds || 5;
    terrainChoice = o.terrain || opt.terrain || 'random';
    cashStart = o.cash != null ? o.cash : opt.cash;
  } else {
    totalRounds = 99;
    terrainChoice = 'classic';
    cashStart = 0;
  }
  round = 1;
  matchOver = false;
  roundSettled = false;
  shopped = false;
  storeHumans = [];
  storeAt = 0;
  lastImpact = null;
  lastGhost = null;
  lastRoundMoney = [];
  clearTransient();
  startRoundTerrain();
  buildTanks(spec, cashStart);
  placeTanks();
  armShields();
  starter = 0;
  turn = 0;
  screen = 'play';
  phase = 'aim';
  ui.renderMoney(null);
  ui.setNextLabel('Next round');
  ui.setScreen('play');
  beginTurn();
}

function nextRoundClassic() {
  if (!tanks.length) {
    goMenu();
    return;
  }
  clearTransient();
  roundSettled = false;
  shopped = false;
  starter = (starter + 1) % tanks.length;
  seed = (seed + 9973) >>> 0;
  gameRng = makeRng(seed);
  terrain.generate(gameRng, 'classic');
  terrainStyle = 'classic';
  for (const t of tanks) {
    t.hp = MAX_HP;
    t.maxHp = MAX_HP;
    t.alive = true;
    t.falling = false;
    t.vy = 0;
    t.chute = false;
    t.shield = 0;
    t.weapon = 'basic';
    t.ammo = makeAmmo(false);
    t.items = emptyItems();
    t.upgrades = emptyUpgrades();
  }
  placeTanks();
  resetMoneyAcc();
  round += 1;
  turn = starter;
  screen = 'play';
  phase = 'aim';
  matchOver = false;
  ui.renderMoney(null);
  ui.setNextLabel('Next round');
  ui.setScreen('play');
  beginTurn();
}

function startNextRound() {
  if (!stage2) {
    nextRoundClassic();
    return;
  }
  if (round >= totalRounds) {
    showFinal();
    return;
  }
  clearTransient();
  roundSettled = false;
  shopped = false;
  cpuNote = '';
  round += 1;
  starter = (starter + 1) % tanks.length;
  seed = (seed + 9973) >>> 0;
  gameRng = makeRng(seed);
  startRoundTerrain();
  for (const t of tanks) {
    t.alive = true;
    t.maxHp = MAX_HP + (t.upgrades.armor || 0) * ECON.armorStep;
    t.hp = t.maxHp;
    t.falling = false;
    t.vy = 0;
    t.chute = false;
    t.shield = 0;
    t.weapon = 'basic';
    if (t.power > maxPowerOf(t)) t.power = maxPowerOf(t);
  }
  placeTanks();
  armShields();
  resetMoneyAcc();
  turn = starter;
  screen = 'play';
  phase = 'aim';
  matchOver = false;
  ui.setScreen('play');
  beginTurn();
}

function showStoreAt(i) {
  storeAt = i;
  const idx = storeHumans[i];
  const t = tanks[idx];
  if (!t) {
    startNextRound();
    return;
  }
  screen = 'store';
  phase = 'aim';
  ui.setScreen('store');
  const owned = {};
  const buyMap = {};
  const sellMap = {};
  const ids = weaponIds().concat(['shield', 'parachute', 'fuel', 'laser', 'armor', 'barrel']);
  for (const id of ids) {
    owned[id] = ownedCount(t, id);
    buyMap[id] = canBuyItem(t, id);
    sellMap[id] = canSellItem(t, id);
  }
  ui.renderStore({
    name: t.name,
    color: t.color,
    cash: t.cash,
    cat: storeCat,
    note: cpuNote,
    owned,
    canBuy: buyMap,
    canSell: sellMap,
  });
}

function openStore() {
  if (!shopped) {
    const lines = shopCpus(tanks, gameRng).filter((l) => !l.endsWith('nothing'));
    cpuNote = lines.join('   ·   ');
    shopped = true;
  }
  storeHumans = humanOrder(tanks);
  if (!storeHumans.length) {
    startNextRound();
    return;
  }
  showStoreAt(0);
}

function onNext() {
  if (!stage2) {
    nextRoundClassic();
    return;
  }
  if (round >= totalRounds) {
    showFinal();
    return;
  }
  openStore();
}

function storeDone() {
  if (screen !== 'store') return;
  const next = storeAt + 1;
  if (next >= storeHumans.length) {
    startNextRound();
    return;
  }
  const t = tanks[storeHumans[next]];
  screen = 'pass';
  ui.setScreen('pass');
  ui.showPass(t.name, t.color);
  storeAt = next;
}

function passContinue() {
  if (screen !== 'pass') return;
  showStoreAt(storeAt);
}

function showFinal() {
  matchOver = true;
  screen = 'final';
  phase = 'aim';
  const rows = tanks.map((t, i) => ({
    name: t.name,
    color: t.color,
    wins: roundWins[i] || 0,
    kills: t.kills || 0,
    damage: t.damageDealt || 0,
    cash: t.cash || 0,
  })).sort((a, b) => b.wins - a.wins || b.cash - a.cash || b.damage - a.damage);
  ui.renderFinal(rows);
  ui.setScreen('final');
}

function goMenu() {
  clearTransient();
  screen = 'title';
  phase = 'aim';
  matchOver = false;
  ui.renderMoney(null);
  ui.setScreen('title');
  bootBackdrop();
}

function playAgain() {
  startGame({
    tanks: lastSpec,
    stage2: true,
    rounds: totalRounds,
    terrain: terrainChoice,
    cash: cashStart,
  });
}

function skipToRoundEnd() {
  if (screen !== 'play') return;
  projectiles = [];
  hazards = [];
  shotActive = false;
  winWait = null;
  ai.cancel();
  fx.clear();
  for (const t of tanks) {
    t.falling = false;
    t.vy = 0;
    t.chute = false;
    if (t.alive) t.y = terrain.heightAt(t.x);
  }
  const living = livingTanks();
  const winner = living.length === 1 ? living[0] : null;
  finishRoundNow(winner);
}

function forceNextRound() {
  if (screen === 'play') {
    if (winWait) finishRound();
    else skipToRoundEnd();
  }
  if (!stage2) {
    nextRoundClassic();
    return;
  }
  if (round >= totalRounds) {
    showFinal();
    return;
  }
  if (!shopped) {
    shopCpus(tanks, gameRng);
    shopped = true;
  }
  startNextRound();
}

function currentStoreTank() {
  if (screen !== 'store') return null;
  return tanks[storeHumans[storeAt]] || null;
}

function doBuy(id) {
  const t = currentStoreTank();
  if (!t) return false;
  const ok = buyItem(t, id);
  if (ok) showStoreAt(storeAt);
  return ok;
}

function doSell(id) {
  const t = currentStoreTank();
  if (!t) return false;
  const ok = sellItem(t, id);
  if (ok) showStoreAt(storeAt);
  return ok;
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
  t.power = clamp(t.power + d, 0, maxPowerOf(t));
  pushUI();
}

function drive(dir, units) {
  if (screen !== 'play') return false;
  const t = tanks[turn];
  if (!t || !t.alive || !(t.items.fuel > 0)) return false;
  const sign = dir < 0 ? -1 : 1;
  let left = Math.max(0, +units || 0);
  if (!(left > 0)) left = 16;
  while (left > 0.4 && t.items.fuel > 0.01) {
    const step = Math.min(4, left);
    const nx = clamp(t.x + sign * step, 40, WORLD_W - 40);
    const moved = Math.abs(nx - t.x);
    if (moved < 0.15) break;
    const climb = terrain.heightAt(t.x) - terrain.heightAt(nx);
    if (climb > ECON.maxClimb * moved) break;
    const cost = moved / ECON.fuelPx;
    if (cost > t.items.fuel + 1e-4) break;
    t.x = nx;
    t.y = terrain.heightAt(nx);
    t.items.fuel -= cost;
    left -= moved;
    if (Math.random() < 0.4) fx.trail(t.x, t.y - 2, 'smoke', '#cbb89a');
  }
  if (t.items.fuel < 0.05) t.items.fuel = 0;
  t.falling = false;
  pushUI();
  return true;
}

function toggleShield() {
  const t = tanks[turn];
  if (!t) return 0;
  if (t.shield > 0) return t.shield;
  if (!(t.items.shield > 0)) return 0;
  t.items.shield -= 1;
  t.shield = ECON.shieldHp;
  pushUI();
  return t.shield;
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
  t.power = clamp(Math.hypot(dx, dy) / 4.4, 1, maxPowerOf(t));
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

function drawParachute(t) {
  ctx.save();
  ctx.fillStyle = t.color;
  ctx.beginPath();
  ctx.moveTo(t.x - 34, t.y - 78);
  ctx.quadraticCurveTo(t.x, t.y - 128, t.x + 34, t.y - 78);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.moveTo(t.x - 34, t.y - 78);
  ctx.lineTo(t.x, t.y - 36);
  ctx.lineTo(t.x + 34, t.y - 78);
  ctx.moveTo(t.x, t.y - 118);
  ctx.lineTo(t.x, t.y - 36);
  ctx.stroke();
  ctx.restore();
}

function drawShield(t, time) {
  const pulse = t.shieldFlick > 0.2 ? 1 : 0.72 + 0.28 * Math.sin(time * 0.008 + t.x);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.28 * pulse;
  ctx.fillStyle = '#d8f6ff';
  ctx.beginPath();
  ctx.ellipse(t.x, t.y - 28, 58, 46, 0, 0, 6.3);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.95 * pulse;
  ctx.strokeStyle = '#e9fbff';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = t.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(t.x, t.y - 28, 50, 38, 0, 0, 6.3);
  ctx.stroke();
  ctx.restore();
}

function drawTank(t, active, time) {
  if (t.chute) drawParachute(t);
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
    const labelY = t.y < 520 ? t.y + 36 : t.y - 92;
    ctx.font = '700 16px Trebuchet MS, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(t.name, t.x, labelY);
    ctx.fillStyle = '#fff8ee';
    ctx.fillText(t.name, t.x, labelY);
    const bw = 56;
    const cap = t.maxHp || MAX_HP;
    const ratio = clamp(t.hp / cap, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(t.x - bw / 2, labelY + 4, bw, 7);
    ctx.fillStyle = ratio > 0.55 ? '#8dff6a' : ratio > 0.28 ? '#ffd15c' : '#ff5b45';
    ctx.fillRect(t.x - bw / 2, labelY + 4, bw * ratio, 7);
    if (stage2 && screen === 'play') {
      ctx.font = '700 13px Trebuchet MS, Segoe UI, sans-serif';
      ctx.strokeText(`$${t.cash | 0}`, t.x, labelY + 26);
      ctx.fillStyle = '#ffe7b0';
      ctx.fillText(`$${t.cash | 0}`, t.x, labelY + 26);
    }
  }
  if (active) {
    const bob = Math.sin(time * 0.007) * 5;
    const tip = t.y < 520 ? t.y + 78 : t.y - 112;
    const dir = t.y < 520 ? 1 : -1;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.moveTo(t.x, tip + bob);
    ctx.lineTo(t.x - 8, tip + dir * 14 + bob);
    ctx.lineTo(t.x + 8, tip + dir * 14 + bob);
    ctx.closePath();
    ctx.fill();
  }
  if (t.shield > 0 && t.alive !== false) drawShield(t, time);
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

function drawFlames(time) {
  fx.drawNapalm(ctx, hazards, time, wind);
}

function drawProjectiles() {
  for (const p of projectiles) {
    if (p.rolling) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin || 0);
      ctx.fillStyle = '#d5dee6';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = '#1c2430';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 12);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    const sp = Math.hypot(p.vx, p.vy) || 1;
    if (p.blast === 'mid') {
      const len = 38;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ff9a28';
      ctx.lineWidth = 4.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#ff3c00';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, 6.3);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ff560c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8.5, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = '#fff0c0';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, 6.3);
      ctx.fill();
      continue;
    }
    const len = p.rainbow ? 46 : (p.bomblet ? 16 : 22);
    const glowR = p.rainbow ? 58 : (p.bomblet ? 20 : 26);
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
    ctx.arc(p.x, p.y, p.rainbow ? 26 : (p.bomblet ? 9 : 8), 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.bomblet ? 3.4 : 3.2, 0, 6.3);
    ctx.fill();
    if (p.trail === 'spark' || p.rainbow) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 8, p.y - 1, 3, 3);
      ctx.fillRect(p.x + 4, p.y - 6, 2, 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawGhost() {
  const t = tanks[turn];
  if (!t || !t.lastLand || screen !== 'play') return;
  if (phase !== 'aim' && phase !== 'ai') return;
  const g = t.lastLand;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#fff6e4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(g.x, g.y, 11, 0, 6.3);
  ctx.moveTo(g.x - 7, g.y - 7);
  ctx.lineTo(g.x + 7, g.y + 7);
  ctx.moveTo(g.x + 7, g.y - 7);
  ctx.lineTo(g.x - 7, g.y + 7);
  ctx.stroke();
  ctx.restore();
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
    const cap = maxPowerOf(t);
    const pct = clamp(t.power / cap, 0, 1);
    ctx.fillStyle = pct > 0.66 ? '#ff5b3a' : '#ffb15a';
    ctx.fillRect(gx, gy + gh * (1 - pct), 6, gh * pct);
  }
  if (t.items && t.items.laser > 0 && (phase === 'aim' || phase === 'ai')) drawLaser(t, L);
  if (!canHuman()) return;
  const m = escapeMuzzle(t, terrain.heightAt);
  const rad = t.angle * Math.PI / 180;
  const lenPx = 50;
  const len = lenPx / L.scale;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.4 / L.scale;
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(m.x + Math.cos(rad) * len, m.y - Math.sin(rad) * len);
  ctx.stroke();
}

/** Dotted sight: first 40% of the predicted path, wind included. */
function drawLaser(t, L) {
  const m = escapeMuzzle(t, terrain.heightAt);
  const rad = t.angle * Math.PI / 180;
  const spd = t.power * POWER_SCALE;
  let x = m.x;
  let y = m.y;
  let vx = Math.cos(rad) * spd;
  let vy = -Math.sin(rad) * spd;
  const pts = [[x, y]];
  const dt = 1 / 60;
  for (let n = 0; n < 220; n++) {
    vy += GRAVITY * dt;
    vx += wind * WIND_ACCEL * dt;
    x += vx * dt;
    y += vy * dt;
    if ((n & 1) === 0) pts.push([x, y]);
    if (x < -20 || x > WORLD_W + 20 || y >= terrain.heightAt(x)) break;
  }
  const n = Math.max(2, Math.floor(pts.length * 0.4));
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 80, 70, 0.95)';
  ctx.lineWidth = 2.2 / L.scale;
  ctx.setLineDash([7 / L.scale, 8 / L.scale]);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}

function drawOffscreen(L) {
  if (!projectiles.length) return;
  ctx.save();
  ctx.font = '700 12px Trebuchet MS, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const p of projectiles) {
    if (p.x < -40 || p.x > WORLD_W + 40) continue;
    const sy = L.offY + p.y * L.scale;
    if (sy >= 16) continue;
    const sx = clamp(L.offX + p.x * L.scale, 14, L.cssW - 14);
    const alt = Math.max(0, Math.round((16 - sy) / Math.max(0.2, L.scale)));
    ctx.fillStyle = p.color || '#ffe27a';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, 4);
    ctx.lineTo(sx - 8, 16);
    ctx.lineTo(sx + 8, 16);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 3;
    ctx.strokeText(String(alt), sx, 16);
    ctx.fillStyle = '#fff6e4';
    ctx.fillText(String(alt), sx, 16);
  }
  ctx.restore();
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
  drawGhost();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.alive === false) drawCharred(t, now);
    else drawTank(t, screen === 'play' && i === turn && phase !== 'flight', now);
  }
  drawProjectiles();
  fx.draw(ctx);
  drawFlames(now);
  drawAim(L);
  ctx.restore();
  drawOffscreen(L);

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
    ctx.fillStyle = `rgba(255, 244, 230, ${flash})`;
    ctx.fillRect(0, 0, L.cssW, L.cssH);
  }
}

let lastUI = 0;
function frame(now) {
  const t0 = performance.now();
  if (screen === 'play' && phase === 'ai') ai.think(36);
  const steps = Math.max(1, Math.round(speedMul * 2));
  for (let i = 0; i < steps; i++) simulate(SIM_DT);
  terrain.flushBurn();
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
  else if (e.key === 'ArrowUp') { e.preventDefault(); t.power = clamp(t.power + 1, 0, maxPowerOf(t)); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); t.power = clamp(t.power - 1, 0, maxPowerOf(t)); }
  else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); drive(-1, 14); }
  else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); drive(1, 14); }
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
  onStart() {
    const opt = ui.readOptions();
    startGame({
      stage2: true,
      tanks: ui.readSetup(),
      rounds: opt.rounds,
      terrain: opt.terrain,
      cash: opt.cash,
    });
  },
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
  onNext,
  onMenu: goMenu,
  onPlayAgain: playAgain,
  onStoreDone: storeDone,
  onPass: passContinue,
  onBuy: doBuy,
  onSell: doSell,
  onStoreTab(cat) {
    storeCat = cat === 'weapons' ? 'weapon' : cat;
    if (screen === 'store') showStoreAt(storeAt);
  },
  onMove(dir) { if (canHuman()) drive(dir, 18); },
  onShield() { if (canHuman()) toggleShield(); },
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
  terrainProfile() { return terrain.profile(8); },
  setAim(angle, power) {
    const t = tanks[turn];
    if (!t) return;
    if (angle != null) t.angle = clamp(+angle, 0, 180);
    if (power != null) t.power = clamp(+power, 0, maxPowerOf(t));
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
  giveItem(i, id, count) {
    const t = tanks[i | 0];
    if (!t) return 0;
    const n = give(t, id, count == null ? 1 : count);
    if (screen === 'store') showStoreAt(storeAt);
    pushUI();
    return n;
  },
  setCash(i, n) {
    const t = tanks[i | 0];
    if (!t) return;
    t.cash = Math.max(0, Math.round(+n || 0));
    if (screen === 'store') showStoreAt(storeAt);
    pushUI();
  },
  buy(id) { return doBuy(id); },
  sell(id) { return doSell(id); },
  storeDone() { storeDone(); },
  move(dir, units) { return drive(dir, units); },
  toggleShield() { return toggleShield(); },
  skipToRoundEnd() { skipToRoundEnd(); },
  forceNextRound() { forceNextRound(); },
  frameStats,
};

requestAnimationFrame(frame);
