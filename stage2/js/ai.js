import { POWER_SCALE, TANK, clamp } from './config.js?v=1';
import { predictImpact, escapeMuzzle } from './physics.js?v=1';
import { getWeapon } from './weapons.js?v=1';

const ERR = {
  easy: { a: 8, p: 10 },
  normal: { a: 3.8, p: 5 },
  hard: { a: 1.1, p: 2 },
};

function chooseWeapon(tank, rng, skill) {
  if (skill !== 'hard') return 'basic';
  const big = tank.ammo.bigshot;
  const cl = tank.ammo.cluster;
  if (big > 0 && rng() < 0.5) return 'bigshot';
  if (cl > 0 && rng() < 0.38) return 'cluster';
  return 'basic';
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

/**
 * Chunked AI. think() is once per frame so a high sim speed does not
 * multiply the search cost. update() advances the visible barrel turn in sim time.
 */
export function createAI() {
  let job = null;

  function aimOrigin(tank, heightAt) {
    return escapeMuzzle(tank, heightAt);
  }

  function evalOne(tank, target, selfIndex, angle, power, wind, heightAt, tanks, cluster) {
    const savedA = tank.angle;
    tank.angle = angle;
    const m = aimOrigin(tank, heightAt);
    tank.angle = savedA;
    const rad = angle * Math.PI / 180;
    const spd = power * POWER_SCALE;
    const vx = Math.cos(rad) * spd;
    const vy = -Math.sin(rad) * spd;
    if (!cluster) {
      return scoreOf(predictImpact(m.x, m.y, vx, vy, wind, heightAt, tanks, selfIndex), target);
    }
    // Carrier until apex, then the middle bomblet falls from there.
    let px = m.x;
    let py = m.y;
    let pvx = vx;
    let pvy = vy;
    let age = 0;
    const dt = 1 / 120;
    const G = 500;
    const WA = 8;
    for (let n = 0; n < 780; n++) {
      const prev = pvy;
      pvy += G * dt;
      pvx += wind * WA * dt;
      px += pvx * dt;
      py += pvy * dt;
      age += dt;
      if (px < 0 || px > 1600) break;
      if (age > 0.08 && prev < -5 && pvy >= 0) {
        return scoreOf(
          predictImpact(px, py, pvx * 0.35, 36, wind, heightAt, tanks, selfIndex),
          target,
        );
      }
      if (age > 0.05 && py >= heightAt(px)) {
        return scoreOf({ x: px, y: py, miss: false, hitTank: -1 }, target);
      }
    }
    return -1e9;
  }

  return {
    busy() { return !!job; },
    cancel() { job = null; },
    begin({ tank, tanks, selfIndex, wind, heightAt, rng }) {
      let target = null;
      let bestD = 1e9;
      for (let i = 0; i < tanks.length; i++) {
        const o = tanks[i];
        if (!o.alive || i === selfIndex) continue;
        const d = Math.abs(o.x - tank.x) + o.hp * 0.4;
        if (d < bestD) { bestD = d; target = o; }
      }
      if (!target) { job = null; return; }
      const skill = tank.skill || 'normal';
      const weapon = chooseWeapon(tank, rng, skill);
      tank.weapon = weapon;
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
        weapon,
        maxP,
        cluster: weapon === 'cluster',
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
        n++;
        const s = evalOne(
          jobRef.tank, jobRef.target, jobRef.selfIndex,
          angle, power, jobRef.wind, jobRef.heightAt, jobRef.tanks, jobRef.cluster,
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
      const e = ERR[jobRef.skill] || ERR.normal;
      const jitterA = (jobRef.rng() * 2 - 1) * e.a;
      const jitterP = (jobRef.rng() * 2 - 1) * e.p;
      const capP = jobRef.maxP || 100;
      let to = clamp(jobRef.bestA + jitterA, 1, 179);
      let power = clamp(jobRef.bestP + jitterP, 15, capP);
      const slipped = evalOne(
        jobRef.tank, jobRef.target, jobRef.selfIndex,
        to, power, jobRef.wind, jobRef.heightAt, jobRef.tanks, jobRef.cluster,
      );
      // Large skill error still has to land in the neighborhood or easy games never end.
      if (slipped < -70) {
        const keep = jobRef.skill === 'easy' ? 0.42 : jobRef.skill === 'normal' ? 0.22 : 0.08;
        to = clamp(jobRef.bestA * (1 - keep) + to * keep, 1, 179);
        power = clamp(jobRef.bestP * (1 - keep) + power * keep, 15, capP);
      }
      jobRef.to = to;
      jobRef.power = power;
      jobRef.from = jobRef.tank.angle;
      jobRef.fromP = jobRef.tank.power;
      jobRef.aimT = 0;
      jobRef.waitT = 0;
      jobRef.waitDur = 0.4 + jobRef.rng() * 0.3;
      jobRef.mode = 'wait';
      jobRef.tank.weapon = jobRef.weapon;
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
