// Data-driven weapons. The engine switches on `behavior`:
//   standard — fly, explode on impact
//   cluster  — splits at apex into small pops
//   mirv     — splits at apex into a wide fan of medium blasts
//   dirt     — raises a round mound
//   napalm   — spills flowing fire hazards
//   roller   — lands, rolls downhill, then explodes
//   funky    — bursts into bouncing rainbow sub-bombs
// A nuke is a standard shell with a huge radius plus a mushroom cloud.
//
// ammoDefault is the Stage 2 starting stock (before the free starter kit).
// s1 is the Stage 1 stock used by __game.startGame without {stage2:true}.
// price is for one store bundle of `bundle` rounds. max is the carry cap.

export const WEAPONS = [
  {
    id: 'basic',
    name: 'Basic Shell',
    price: 0,
    bundle: 0,
    max: Infinity,
    ammoDefault: Infinity,
    s1: Infinity,
    radius: 44,
    damage: 36,
    color: '#ffe27a',
    trail: 'smoke',
    behavior: 'standard',
    shake: 1,
    blurb: 'Free, unlimited, always loaded',
    shop: false,
  },
  {
    id: 'bigshot',
    name: 'Big Shot',
    price: 2000,
    bundle: 3,
    max: 10,
    ammoDefault: 0,
    s1: 3,
    radius: 74,
    damage: 52,
    color: '#ff7a3c',
    trail: 'spark',
    behavior: 'standard',
    shake: 1.85,
    blurb: 'Heavy shell, wide crater',
  },
  {
    id: 'cluster',
    name: 'Cluster Bomb',
    price: 3000,
    bundle: 2,
    max: 10,
    ammoDefault: 0,
    s1: 2,
    radius: 28,
    damage: 14,
    color: '#8af6ff',
    trail: 'spark',
    behavior: 'cluster',
    shake: 0.75,
    bomblets: 5,
    bombletRadius: 24,
    bombletDamage: 15,
    spread: 76,
    blurb: 'Splits at the top into 5',
  },
  {
    id: 'dirtbomb',
    name: 'Dirt Bomb',
    price: 1500,
    bundle: 3,
    max: 10,
    ammoDefault: 0,
    s1: 2,
    radius: 58,
    damage: 8,
    color: '#d2a85a',
    trail: 'smoke',
    behavior: 'dirt',
    shake: 0.4,
    blurb: 'Piles a hill instead of a hole',
  },
  {
    id: 'napalm',
    name: 'Napalm',
    price: 6000,
    bundle: 2,
    max: 10,
    ammoDefault: 0,
    s1: 0,
    radius: 26,
    damage: 6,
    color: '#ff4a1a',
    trail: 'spark',
    behavior: 'napalm',
    shake: 0.55,
    blobs: 32,
    burnTime: 5.2,
    dps: 1.15,
    flowSpeed: 52,
    blurb: 'Fire that runs downhill and burns',
  },
  {
    id: 'roller',
    name: 'Roller',
    price: 3500,
    bundle: 3,
    max: 10,
    ammoDefault: 0,
    s1: 0,
    radius: 42,
    damage: 44,
    color: '#e8eef2',
    trail: 'smoke',
    behavior: 'roller',
    shake: 1.1,
    fuse: 4,
    blurb: 'Rolls downhill, then blows',
  },
  {
    id: 'mirv',
    name: 'MIRV',
    price: 9000,
    bundle: 2,
    max: 10,
    ammoDefault: 0,
    s1: 0,
    radius: 30,
    damage: 12,
    color: '#ffd36a',
    trail: 'spark',
    behavior: 'mirv',
    shake: 0.8,
    bomblets: 6,
    bombletRadius: 36,
    bombletDamage: 26,
    spread: 168,
    blurb: 'Six warheads, wide fan',
  },
  {
    id: 'funky',
    name: 'Funky Bomb',
    price: 7000,
    bundle: 2,
    max: 10,
    ammoDefault: 0,
    s1: 0,
    radius: 30,
    damage: 10,
    color: '#ff4ad8',
    trail: 'spark',
    behavior: 'funky',
    shake: 0.7,
    bomblets: 7,
    bombletRadius: 30,
    bombletDamage: 16,
    spread: 210,
    blurb: 'Rainbow bouncers, silly blasts',
  },
  {
    id: 'nuke',
    name: 'Nuke',
    price: 20000,
    bundle: 1,
    max: 3,
    ammoDefault: 0,
    s1: 0,
    radius: 280,
    damage: 140,
    color: '#fff6d0',
    trail: 'spark',
    behavior: 'nuke',
    shake: 3.4,
    blurb: 'Blinding blast and a mushroom cloud',
  },
];

const BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export function getWeapon(id) {
  return BY_ID[id] || null;
}

export function weaponIds() {
  return WEAPONS.map((w) => w.id);
}

/** Next selectable weapon that still has ammo. dir is +1 or -1. */
export function cycleWeapon(id, ammo, dir) {
  const list = WEAPONS;
  let i = list.findIndex((w) => w.id === id);
  if (i < 0) i = 0;
  const step = dir < 0 ? -1 : 1;
  for (let k = 0; k < list.length; k++) {
    i = (i + step + list.length) % list.length;
    const w = list[i];
    const n = ammo ? ammo[w.id] : w.ammoDefault;
    if (n === Infinity || n == null || n > 0) return w.id;
  }
  return id;
}
