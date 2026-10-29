import { GRAVITY, WIND_ACCEL, WORLD_W, TANK } from './config.js?v=1';

/** One fixed integration step. Mutates body {x,y,vx,vy,vyPrev,age}. */
export function flyStep(b, dt, wind) {
  b.vyPrev = b.vy;
  b.vy += GRAVITY * dt;
  b.vx += wind * WIND_ACCEL * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.age = (b.age || 0) + dt;
}

export function muzzleOf(tank) {
  const rad = tank.angle * Math.PI / 180;
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad);
  return {
    x: tank.x + dx * TANK.barrel,
    y: tank.y - TANK.pivot + dy * TANK.barrel,
    dx,
    dy,
  };
}

/** Walk the barrel forward until the tip is in open air so a buried tank can still fire. */
export function escapeMuzzle(tank, heightAt) {
  const m = muzzleOf(tank);
  let x = m.x;
  let y = m.y;
  for (let i = 0; i < 16; i++) {
    if (y < heightAt(x) - 0.5) break;
    x += m.dx * 5;
    y += m.dy * 5;
  }
  return { x, y, dx: m.dx, dy: m.dy };
}

export function hitsTank(px, py, tank) {
  const dx = px - tank.x;
  const dy = py - (tank.y - TANK.hitUp);
  const r = TANK.hitR;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Trial shot using the same integrator as live shells.
 * Returns impact {x, y, miss, hitTank}.
 */
export function predictImpact(x, y, vx, vy, wind, heightAt, tanks, selfIndex) {
  let age = 0;
  const dt = 1 / 120;
  let px = x;
  let py = y;
  for (let n = 0; n < 960; n++) {
    vy += GRAVITY * dt;
    vx += wind * WIND_ACCEL * dt;
    px += vx * dt;
    py += vy * dt;
    age += dt;
    if (px < 0 || px > WORLD_W || py > 980) return { x: px, y: py, miss: true, hitTank: -1 };
    if (age > 0.12 && tanks) {
      for (let i = 0; i < tanks.length; i++) {
        const t = tanks[i];
        if (!t.alive || i === selfIndex) continue;
        if (hitsTank(px, py, t)) return { x: px, y: py, miss: false, hitTank: i };
      }
    }
    if (age > 0.05 && py >= heightAt(px)) return { x: px, y: py, miss: false, hitTank: -1 };
  }
  return { x: px, y: py, miss: true, hitTank: -1 };
}
