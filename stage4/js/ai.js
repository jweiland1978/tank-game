import { POWER_SCALE, TANK, GRAVITY, WIND_ACCEL, clamp } from './config.js?v=2';
import { predictImpact, escapeMuzzle } from './physics.js?v=2';
import { getWeapon } from './weapons.js?v=2';

const ERR = {
  easy: { a: 8, p: 10 },
  normal: { a: 3.8, p: 5 },
  hard: { a: 1.1, p: 2 },
};

const SPECIALS = ['bigshot', 'cluster', 'dirtbomb', 'napalm', 'roller', 'mirv', 'funky', 'nuke', 'popcorn', 'magnet', 'bolt'];

function owned(tank, id) {
  if (id === 'basic') return true;
  const n = tank.ammo ? tank.ammo[id] : 0;
  return n === Infinity || n > 0;
}

function stock(tank) {
  let n = 0;
  for (let i = 0; i < SPECIALS.length; i++) {
    const a = tank.ammo ? tank.ammo[SPECIALS[i]] : 0;
    if (a === Infinity) n += 4;
    else n += a || 0;
  }
  return n;
}

function selfPt(t) {
  return { x: t.x, y: t.y - TANK.hitUp };
}

function downhillDir(x, heightAt) {
  const spans = [40, 90, 160];
  for (let s = 0; s < spans.length; s++) {
    let bestD = 0;
    let bestH = heightAt(x);
    for (let di = 0; di < 2; di++) {
      const d = di === 0 ? -1 : 1;
      const xx = x + d * spans[s];
      if (xx < 12 || xx > 1588) continue;
      const h = heightAt(xx);
      if (h > bestH + 8) {
        bestH = h;
        bestD = d;
      }
    }
    if (bestD) return bestD;
  }
  return 0;
}

/** Positive means the predicted effect stays off this tank. */
function clearance(id, impact, self, heightAt) {
  const w = getWeapon(id) || getWeapon('basic');
  const s = selfPt(self);
  if (!impact) return -1;
  const d = Math.hypot(impact.x - s.x, impact.y - s.y);
  let need = (w.radius || 44) + 18;
  if (id === 'nuke') need = (w.radius || 280) + 40;
  else if (id === 'bigshot') need = (w.radius || 74) + 18;
  else if (id === 'basic') need = (w.radius || 44) + 14;
  else if (id === 'dirtbomb') need = (w.radius || 58) * 0.62 + 14;
  else if (id === 'bolt') need = (w.radius || 36) + 16;
  else if (id === 'magnet') need = (w.pull || 110) + 52;
  else if (id === 'cluster') need = 200;
  else if (id === 'mirv') need = 270;
  else if (id === 'funky') need = 300;
  else if (id === 'popcorn') need = 220;
  else if (id === 'napalm') need = (w.spreadPx || 90) * 0.55 + 72;
  else if (id === 'roller') need = 88;
  // A shell that leaves the map is gone. It does not bloom on the way out.
  if (impact.miss) return 80;
  let gap = d - need;
  if (id === 'napalm') {
    const dir = downhillDir(impact.x, heightAt);
    const toward = Math.sign(self.x - impact.x);
    if (Math.abs(self.x - impact.x) < need && Math.abs(self.y - impact.y) < 160) gap = Math.min(gap, d - need);
    if (dir && toward === dir && Math.abs(self.x - impact.x) < 340) gap = -1;
  }
  if (id === 'roller') {
    const dir = downhillDir(impact.x, heightAt);
    const toward = Math.sign(self.x - impact.x);
    if (dir && toward === dir && Math.abs(self.x - impact.x) < 540) gap = -1;
    if (!dir && Math.abs(self.x - impact.x) < 110) gap = -1;
  }
  if (id === 'magnet' && Math.abs(self.x - impact.x) < (w.pull || 110) + 46) gap = -1;
  return gap;
}

function safe(id, impact, self, heightAt) {
  return clearance(id, impact, self, heightAt) >= 0;
}

function enemiesOf(tanks, selfIndex) {
  const list = [];
  for (let i = 0; i < tanks.length; i++) {
    if (i !== selfIndex && tanks[i].alive) list.push(tanks[i]);
  }
  return list;
}

function nearPoint(list, x, y, r) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (Math.hypot(t.x - x, (t.y - TANK.hitUp) - y) <= r) n += 1;
  }
  return n;
}

function clustered(tanks, target, selfIndex) {
  let n = 0;
  for (let i = 0; i < tanks.length; i++) {
    const t = tanks[i];
    if (!t.alive || i === selfIndex || t === target) continue;
    if (Math.hypot(t.x - target.x, t.y - target.y) < 190) n += 1;
  }
  return n;
}

function inValley(x, heightAt) {
  const y = heightAt(x);
  const l = heightAt(Math.max(0, x - 90));
  const r = heightAt(Math.min(1600, x + 90));
  return l < y - 16 && r < y - 16;
}

function downhillTo(impact, target, self, heightAt) {
  if (!impact || impact.miss) return false;
  const dir = downhillDir(impact.x, heightAt);
  if (!dir) return false;
  const towardT = Math.sign(target.x - impact.x);
  const towardS = Math.sign(self.x - impact.x);
  const drop = heightAt(target.x) - heightAt(impact.x);
  return towardT === dir && drop > 12 && Math.abs(target.x - impact.x) > 34
    && Math.abs(target.x - impact.x) < 440 && towardS !== dir;
}

function boltChance(tanks, selfIndex) {
  const range = (getWeapon('bolt') && getWeapon('bolt').chainRange) || 320;
  const alive = enemiesOf(tanks, selfIndex);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      if (Math.hypot(alive[i].x - alive[j].x, alive[i].y - alive[j].y) < range) return true;
    }
  }
  return false;
}

/**
 * Score every owned weapon against one predicted impact.
 * Always returns a safe choice when any owned weapon is safe.
 */
export function scoreWeapons(ctx) {
  const tank = ctx.tank;
  const self = tank;
  const target = ctx.target;
  const impact = ctx.impact;
  const heightAt = ctx.heightAt;
  const rng = ctx.rng || Math.random;
  const skill = ctx.skill || tank.skill || 'normal';
  const wind = ctx.wind || 0;
  const foes = enemiesOf(ctx.tanks, ctx.selfIndex);
  const distT = impact && target
    ? Math.hypot(impact.x - target.x, impact.y - (target.y - TANK.hitUp))
    : 999;
  const precise = distT < 55;
  const windy = Math.abs(wind) >= 4;
  const groups = target ? clustered(ctx.tanks, target, ctx.selfIndex) : 0;
  const valley = target ? inValley(target.x, heightAt) : false;
  const down = target ? downhillTo(impact, target, self, heightAt) : false;
  const crowd = impact && !impact.miss ? nearPoint(foes, impact.x, impact.y, 200) : 0;
  const tight = impact && !impact.miss ? nearPoint(foes, impact.x, impact.y, 150) : 0;
  const chain = boltChance(ctx.tanks, ctx.selfIndex);
  const scarce = stock(tank) <= 2;
  const hurting = target && target.hp <= 34;
  const rows = [];

  const add = (id, score, reason) => {
    if (!owned(tank, id)) return;
    if (!safe(id, impact, self, heightAt)) return;
    rows.push({ id, score, reason });
  };

  let basicScore = 22;
  if (hurting) basicScore += 46;
  if (scarce) basicScore += 34;
  if (precise) basicScore += 6;
  add('basic', basicScore, hurting ? 'basic: target is nearly done' : (scarce ? 'basic: saving the cupboard' : 'basic: a plain shell'));

  add('bigshot', 54 + (distT < 100 ? 16 : 0) + (target && target.hp > 45 ? 6 : 0), 'big shot: solid default');

  if (groups >= 1 || windy || distT > 75) {
    add('cluster', 28 + (groups >= 1 ? 34 : 0) + (windy || distT > 75 ? 26 : 0), groups ? 'cluster: they are bunched' : 'cluster: sloppy air, wide net');
    add('popcorn', 22 + (groups >= 1 ? 30 : 0) + (windy ? 18 : 0) + (distT > 70 ? 12 : 0), 'popcorn: scatter the kernels');
    add('funky', 18 + (groups >= 1 ? 28 : 0) + (windy || distT > 80 ? 22 : 0), 'funky: bouncing cover');
    add('mirv', 20 + (groups >= 1 ? 46 : 0) + (windy ? 16 : 0) + (distT > 60 ? 10 : 0), groups ? 'mirv: fan the group' : 'mirv: wind needs a fan');
  } else {
    add('cluster', 16, 'cluster: spare spread');
    add('popcorn', 14, 'popcorn: spare hops');
  }

  add(
    'napalm',
    20 + (valley ? 62 : 0) + (down ? 44 : 0) + (groups >= 1 ? 24 : 0) + (distT < 110 ? 12 : 0),
    valley ? 'napalm: target sits in a valley' : (down ? 'napalm: fire runs downhill onto them' : 'napalm: a pool on their pad'),
  );

  if (down) add('roller', 70, 'roller: it will roll downhill onto them');
  else add('roller', 12, 'roller: no downhill, skip unless nothing else');

  if (crowd >= 2 && impact && clearance('nuke', impact, self, heightAt) > 24) {
    add('nuke', 88 + crowd * 8, 'nuke: more than one tank in the blast');
  } else if (tight >= 1 && precise && target && target.hp > 40 && impact && clearance('nuke', impact, self, heightAt) > 36) {
    add('nuke', 48, 'nuke: centered and well clear of me');
  }

  if (distT < 80) add('dirtbomb', 36, 'dirt bomb: bury the spot');
  else add('dirtbomb', 12, 'dirt bomb: a mound, not a kill');

  if (distT < 120) add('magnet', 34 + (valley ? 12 : 0), 'magnet: yank and bury');
  else add('magnet', 10, 'magnet: they are outside the pull');

  if (chain) add('bolt', 58 + (distT < 70 ? 10 : 0), 'bolt: two tanks are inside chain range');
  else if (distT < 50) add('bolt', 22, 'bolt: a single strike');

  const basic = rows.find((r) => r.id === 'basic') || { id: 'basic', score: 10, reason: 'basic: fallback' };
  const finish = (row, why) => ({
    weapon: row.id,
    reason: why || row.reason,
    safe: safe(row.id, impact, self, heightAt),
    laser: wantsLaser(tank, row.id, wind, rng, skill),
    announce: row.id === 'nuke' || row.id === 'napalm' ? row.id : '',
  });

  if (skill === 'easy') {
    if (rng() > 0.125 || stock(tank) === 0) return finish(basic, 'easy: mostly the free shell');
    const easyPick = rows.filter((r) => r.id === 'bigshot' || r.id === 'dirtbomb' || r.id === 'cluster');
    if (!easyPick.length || rng() < 0.35) return finish(basic, 'easy: lost the nerve');
    const pick = easyPick[(rng() * easyPick.length) | 0];
    return finish(pick, `easy rare: ${pick.reason}`);
  }

  if (skill === 'normal') {
    if (rng() > 0.44 || stock(tank) === 0) return finish(basic, 'normal: keeping it ordinary');
    const simple = [];
    const pushId = (id) => {
      const row = rows.find((r) => r.id === id);
      if (row) simple.push(row);
    };
    if (valley || down) pushId('napalm');
    if (groups >= 1 || windy) {
      pushId('cluster');
      pushId('popcorn');
      pushId('mirv');
    }
    if (chain) pushId('bolt');
    if (down) pushId('roller');
    pushId('bigshot');
    pushId('magnet');
    pushId('dirtbomb');
    if (!simple.length) return finish(basic, 'normal: nothing safe and special');
    const pick = simple[(rng() * simple.length) | 0];
    return finish(pick, `normal: ${pick.reason}`);
  }

  // Hard. Best shots win, with a weighted mix so it is not the same shell every time.
  if (!rows.length) return finish(basic, 'hard: nothing scored');
  let pool = rows.slice();
  if (hurting) {
    pool = pool.filter((r) => r.id === 'basic' || r.id === 'bigshot' || (r.id === 'nuke' && crowd >= 2));
    if (!pool.length) pool = [basic];
  }
  let best = pool[0].score;
  for (let i = 1; i < pool.length; i++) if (pool[i].score > best) best = pool[i].score;
  let band = pool.filter((r) => r.score >= best - 22 && r.score > 8);
  if (!band.length) band = pool;
  // Drop nuke unless it truly earned the top band.
  band = band.filter((r) => r.id !== 'nuke' || r.score >= 70);
  if (!band.length) band = pool.filter((r) => r.id !== 'nuke');
  if (!band.length) band = [basic];
  // A minority of shots browse the cupboard so more than one special shows up.
  if (rng() < 0.28) {
    const shelf = rows.filter((r) => r.id !== 'basic' && r.id !== 'nuke' && r.score >= 18);
    const nukes = rows.filter((r) => r.id === 'nuke' && r.score >= 70);
    const mix = shelf.concat(nukes);
    if (mix.length) {
      const alt = mix[(rng() * mix.length) | 0];
      return finish(alt, `hard mix: ${alt.reason}`);
    }
  }
  let sum = 0;
  for (let i = 0; i < band.length; i++) sum += Math.max(1, band[i].score);
  let ticket = rng() * sum;
  let pick = band[band.length - 1];
  for (let i = 0; i < band.length; i++) {
    ticket -= Math.max(1, band[i].score);
    if (ticket <= 0) { pick = band[i]; break; }
  }
  return finish(pick, `hard: ${pick.reason}`);
}

function wantsLaser(tank, weapon, wind, rng, skill) {
  if (!tank.items || !(tank.items.laser > 0)) return false;
  if (skill === 'easy') return rng() < 0.12;
  if (skill === 'normal') return weapon !== 'basic' && rng() < 0.55;
  return weapon === 'nuke' || weapon === 'napalm' || weapon === 'mirv' || weapon === 'bolt' || Math.abs(wind) >= 4;
}

function buildTrials(self, target, maxP) {
  const right = target.x >= self.x;
  const angles = [];
  const a0 = right ? 6 : 94;
  const a1 = right ? 89 : 176;
  for (let a = a0; a <= a1; a += 4) angles.push(a);
  const cap = maxP && maxP > 40 ? maxP : 100;
  const powers = [];
  for (let p = 30; p <= cap; p += 8) powers.push(p);
  if (powers[powers.length - 1] !== cap) powers.push(cap);
  const trials = [];
  for (let i = 0; i < angles.length; i++) {
    for (let j = 0; j < powers.length; j++) trials.push(angles[i], powers[j]);
  }
  return trials;
}

function scoreOf(impact, target) {
  if (!impact) return -1e9;
  const dx = impact.x - target.x;
  const dy = impact.y - (target.y - TANK.hitUp);
  let s = -Math.hypot(dx, dy);
  if (impact.hitTank >= 0) s += 420;
  if (impact.miss) s -= 700;
  return s;
}

function aimOrigin(tank, heightAt) {
  return escapeMuzzle(tank, heightAt);
}

function launch(tank, angle, power, heightAt) {
  const savedA = tank.angle;
  tank.angle = angle;
  const m = aimOrigin(tank, heightAt);
  tank.angle = savedA;
  const rad = angle * Math.PI / 180;
  const spd = power * POWER_SCALE;
  return {
    x: m.x,
    y: m.y,
    vx: Math.cos(rad) * spd,
    vy: -Math.sin(rad) * spd,
  };
}

function predictStandard(tank, angle, power, wind, heightAt, tanks, selfIndex) {
  const m = launch(tank, angle, power, heightAt);
  return predictImpact(m.x, m.y, m.vx, m.vy, wind, heightAt, tanks, selfIndex);
}

function evalOne(tank, target, selfIndex, angle, power, wind, heightAt, tanks) {
  const m = launch(tank, angle, power, heightAt);
  return scoreOf(predictImpact(m.x, m.y, m.vx, m.vy, wind, heightAt, tanks, selfIndex), target);
}

function pickTarget(tank, tanks, selfIndex) {
  let target = null;
  let bestD = 1e9;
  for (let i = 0; i < tanks.length; i++) {
    const o = tanks[i];
    if (!o.alive || i === selfIndex) continue;
    const d = Math.abs(o.x - tank.x) + o.hp * 0.4;
    if (d < bestD) { bestD = d; target = o; }
  }
  return target;
}

function applyNoise(tank, target, selfIndex, bestA, bestP, wind, heightAt, tanks, rng, skill, maxP) {
  const e = ERR[skill] || ERR.normal;
  let to = clamp(bestA + (rng() * 2 - 1) * e.a, 1, 179);
  let power = clamp(bestP + (rng() * 2 - 1) * e.p, 15, maxP || 100);
  const slipped = evalOne(tank, target, selfIndex, to, power, wind, heightAt, tanks);
  if (slipped < -70) {
    const keep = skill === 'easy' ? 0.42 : skill === 'normal' ? 0.22 : 0.08;
    to = clamp(bestA * (1 - keep) + to * keep, 1, 179);
    power = clamp(bestP * (1 - keep) + power * keep, 15, maxP || 100);
  }
  return { angle: to, power };
}

function runSearch(tank, target, selfIndex, wind, heightAt, tanks, maxP) {
  const trials = buildTrials(tank, target, maxP);
  let best = -1e9;
  let bestA = tank.angle;
  let bestP = tank.power;
  for (let i = 0; i + 1 < trials.length; i += 2) {
    const s = evalOne(tank, target, selfIndex, trials[i], trials[i + 1], wind, heightAt, tanks);
    if (s > best) {
      best = s;
      bestA = trials[i];
      bestP = trials[i + 1];
    }
  }
  const fine = [];
  for (let a = bestA - 6; a <= bestA + 6; a += 2) {
    const aa = clamp(a, 1, 179);
    for (let p = bestP - 8; p <= bestP + 8; p += 3) fine.push(aa, clamp(p, 20, maxP || 100));
  }
  for (let i = 0; i + 1 < fine.length; i += 2) {
    const s = evalOne(tank, target, selfIndex, fine[i], fine[i + 1], wind, heightAt, tanks);
    if (s > best) {
      best = s;
      bestA = fine[i];
      bestP = fine[i + 1];
    }
  }
  return { bestA, bestP, best };
}

/** Full aim search plus the same weapon score the live CPU uses. */
export function planWeapon(ctx) {
  const tank = ctx.tank;
  const tanks = ctx.tanks;
  const selfIndex = ctx.selfIndex;
  const heightAt = ctx.heightAt;
  const wind = ctx.wind || 0;
  const rng = ctx.rng || Math.random;
  const skill = ctx.skill || tank.skill || 'normal';
  const target = ctx.target || pickTarget(tank, tanks, selfIndex);
  const maxP = tank.upgrades && tank.upgrades.barrel ? 120 : 100;
  if (!target) {
    return { weapon: 'basic', reason: 'no target', safe: true, angle: tank.angle, power: tank.power, laser: false, announce: '' };
  }
  const found = runSearch(tank, target, selfIndex, wind, heightAt, tanks, maxP);
  const posed = applyNoise(tank, target, selfIndex, found.bestA, found.bestP, wind, heightAt, tanks, rng, skill, maxP);
  const impact = predictStandard(tank, posed.angle, posed.power, wind, heightAt, tanks, selfIndex);
  const picked = scoreWeapons({
    tank, tanks, selfIndex, target, impact, wind, heightAt, rng, skill,
  });
  return {
    weapon: picked.weapon,
    reason: picked.reason,
    safe: picked.safe !== false,
    angle: posed.angle,
    power: posed.power,
    laser: picked.laser,
    announce: picked.announce,
    impact,
  };
}

/**
 * Chunked AI. think() is once per frame so a high sim speed does not
 * multiply the search cost. update() advances the visible barrel turn in sim time.
 */
export function createAI() {
  let job = null;

  return {
    busy() { return !!job; },
    cancel() { job = null; },
    begin({ tank, tanks, selfIndex, wind, heightAt, rng }) {
      const target = pickTarget(tank, tanks, selfIndex);
      if (!target) { job = null; return; }
      const skill = tank.skill || 'normal';
      const maxP = tank.upgrades && tank.upgrades.barrel ? 120 : 100;
      job = {
        mode: 'search',
        tank,
        tanks,
        selfIndex,
        target,
        wind,
        heightAt,
        rng,
        skill,
        weapon: 'basic',
        maxP,
        trials: buildTrials(tank, target, maxP),
        i: 0,
        best: -1e9,
        bestA: tank.angle,
        bestP: tank.power,
        from: tank.angle,
        to: tank.angle,
        power: tank.power,
        aimT: 0,
      };
    },
    /** Run a bounded number of trial shots. Returns true when the aim pose is ready. */
    think(budget) {
      const jobRef = job;
      if (!jobRef || jobRef.mode !== 'search') return jobRef ? jobRef.mode === 'aim' : false;
      const b = budget || 48;
      const trials = jobRef.trials;
      let n = 0;
      while (jobRef.i + 1 < trials.length && n < b) {
        const angle = trials[jobRef.i];
        const power = trials[jobRef.i + 1];
        jobRef.i += 2;
        n += 1;
        const s = evalOne(
          jobRef.tank, jobRef.target, jobRef.selfIndex,
          angle, power, jobRef.wind, jobRef.heightAt, jobRef.tanks,
        );
        if (s > jobRef.best) {
          jobRef.best = s;
          jobRef.bestA = angle;
          jobRef.bestP = power;
        }
      }
      if (jobRef.i + 1 < trials.length) return false;
      if (!jobRef.refined) {
        jobRef.refined = true;
        const fine = [];
        for (let a = jobRef.bestA - 6; a <= jobRef.bestA + 6; a += 2) {
          const aa = clamp(a, 1, 179);
          for (let p = jobRef.bestP - 8; p <= jobRef.bestP + 8; p += 3) {
            fine.push(clamp(aa, 1, 179), clamp(p, 20, jobRef.maxP || 100));
          }
        }
        jobRef.trials = fine;
        jobRef.i = 0;
        return false;
      }
      const posed = applyNoise(
        jobRef.tank, jobRef.target, jobRef.selfIndex,
        jobRef.bestA, jobRef.bestP, jobRef.wind, jobRef.heightAt, jobRef.tanks,
        jobRef.rng, jobRef.skill, jobRef.maxP,
      );
      const impact = predictStandard(
        jobRef.tank, posed.angle, posed.power, jobRef.wind, jobRef.heightAt, jobRef.tanks, jobRef.selfIndex,
      );
      const picked = scoreWeapons({
        tank: jobRef.tank,
        tanks: jobRef.tanks,
        selfIndex: jobRef.selfIndex,
        target: jobRef.target,
        impact,
        wind: jobRef.wind,
        heightAt: jobRef.heightAt,
        rng: jobRef.rng,
        skill: jobRef.skill,
      });
      jobRef.to = posed.angle;
      jobRef.power = posed.power;
      jobRef.from = jobRef.tank.angle;
      jobRef.fromP = jobRef.tank.power;
      jobRef.aimT = 0;
      jobRef.waitT = 0;
      jobRef.waitDur = 0.4 + jobRef.rng() * 0.3;
      jobRef.mode = 'wait';
      jobRef.weapon = picked.weapon;
      jobRef.tank.weapon = picked.weapon;
      jobRef.tank.laserThisShot = !!picked.laser;
      jobRef.tank.announce = picked.announce || '';
      return true;
    },
    /** Sim-time think pause, then barrel and power ease. Returns 'fire' when the shot should leave. */
    update(dt) {
      if (!job) return null;
      if (job.mode === 'wait') {
        job.waitT += dt;
        if (job.waitT < job.waitDur) return null;
        job.mode = 'aim';
        job.aimT = 0;
        job.from = job.tank.angle;
        job.fromP = job.tank.power;
      }
      if (job.mode !== 'aim') return null;
      job.aimT += dt;
      const u = Math.min(1, job.aimT / 0.6);
      const s = u * u * (3 - 2 * u);
      job.tank.angle = job.from + (job.to - job.from) * s;
      const p0 = job.fromP == null ? job.power : job.fromP;
      job.tank.power = p0 + (job.power - p0) * s;
      if (u >= 1) {
        job.tank.angle = job.to;
        job.tank.power = job.power;
        const w = getWeapon(job.weapon);
        job.tank.weapon = w ? w.id : 'basic';
        job = null;
        return 'fire';
      }
      return null;
    },
  };
}
