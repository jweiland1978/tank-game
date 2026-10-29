import { cpuShop } from './economy.js?v=3';

/** CPUs buy immediately. Returns short lines for the store subtitle. */
export function shopCpus(tanks, rng) {
  const lines = [];
  for (let i = 0; i < tanks.length; i++) {
    const t = tanks[i];
    if (!t.isCpu) continue;
    const bought = cpuShop(t, rng);
    if (bought.length) lines.push(`${t.name} bought: ${bought.join(', ')}`);
    else lines.push(`${t.name} bought: nothing`);
  }
  return lines;
}

/** Human tank indexes, low to high, so the device can be passed in order. */
export function humanOrder(tanks) {
  const idx = [];
  for (let i = 0; i < tanks.length; i++) {
    if (!tanks[i].isCpu) idx.push(i);
  }
  return idx;
}
