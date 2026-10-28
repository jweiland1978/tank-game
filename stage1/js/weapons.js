// Data-driven weapons. The engine switches on `behavior`:
//   standard — fly, explode on impact
//   cluster  — onUpdate splits at apex (vy sign change); bomblets are standard
//   dirt     — onImpact adds a round mound instead of a crater
//   napalm   — onImpact spawns flowing hazards (Stage 2; stub below, not selectable)
//   roller   — reserved: onImpact becomes a ground-following fuse, then explodes
// A nuke is just a standard shell with a huge radius, damage, and shake.

export const WEAPONS = [
  {
    id: 'basic',
    name: 'Basic Shell',
    price: 0,
    ammoDefault: Infinity,
    radius: 44,
    damage: 36,
    color: '#ffe27a',
    trail: 'smoke',
    behavior: 'standard',
    shake: 1,
  },
  {
    id: 'bigshot',
    name: 'Big Shot',
    price: 750,
    ammoDefault: 3,
    radius: 74,
    damage: 52,
    color: '#ff7a3c',
    trail: 'spark',
    behavior: 'standard',
    shake: 1.85,
  },
  {
    id: 'cluster',
    name: 'Cluster Bomb',
    price: 900,
    ammoDefault: 2,
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
  },
  {
    id: 'dirtbomb',
    name: 'Dirt Bomb',
    price: 500,
    ammoDefault: 2,
    radius: 58,
    damage: 8,
    color: '#d2a85a',
    trail: 'smoke',
    behavior: 'dirt',
    shake: 0.4,
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

/*
Stage 2 stub — NOT in WEAPONS, not selectable, not in weaponIds().

{
  id: 'napalm',
  name: 'Napalm',
  price: 1200,
  ammoDefault: 1,
  radius: 18,
  damage: 0,
  color: '#ff4a1a',
  trail: 'spark',
  behavior: 'napalm',
  shake: 0.5,
  // onImpact: spawn ~5 hazards
  //   { type:'napalm', x, y, radius:16, dps:8, ttl:6, flow:true, flowSpeed:36 }
  // The hazard stepper (see main.js updateHazards) already:
  //   - moves flow hazards downhill along terrainHeightAt
  //   - pins them to the surface
  //   - applies dps * dt to tanks inside radius
  //   - holds the turn in 'settle' until hazards.length === 0
  // Visuals: spawn short-lived fire particles each frame while ttl > 0.
  blobs: 5,
  burnTime: 6,
  dps: 8,
},
{
  id: 'nuke',
  name: 'Nuke',
  price: 5000,
  ammoDefault: 1,
  radius: 280,
  damage: 120,
  color: '#fff6d0',
  trail: 'spark',
  behavior: 'standard',
  shake: 3.2,
},
{
  id: 'roller',
  name: 'Roller',
  price: 1100,
  ammoDefault: 2,
  radius: 40,
  damage: 40,
  color: '#e6e6e6',
  trail: 'smoke',
  behavior: 'roller',
  // onImpact: convert to a roller body that onUpdate walks downhill
  // for fuse seconds, then onImpact explodes as standard.
  fuse: 2.4,
}
*/
