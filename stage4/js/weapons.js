// Data-driven weapons. The engine switches on `behavior`:
//   standard — fly, explode on impact
//   cluster  — splits at apex into small pops
//   mirv     — splits at apex into a wide fan of medium blasts
//   dirt     — raises a round mound
//   napalm   — spills flowing fire hazards
//   roller   — lands, rolls downhill, then explodes
//   funky    — bursts into bouncing rainbow sub-bombs
//   popcorn  — bursts into hopping kernels that pop
//   magnet   — sucks dirt in, yanks tanks, then dumps a mound
//   bolt     — sky lightning at impact, then chains to a nearby tank
// A nuke is a standard shell with a huge radius plus a mushroom cloud.
//
// ammoDefault is the Stage 2 starting stock (before the free starter kit).
// s1 is the Stage 1 stock used by __game.startGame without {stage2:true}.
// price is for one store bundle of `bundle` rounds. max is the carry cap.
//
// To tune damage edit DAMAGE below. Weapon defs read from it (getters).

/** Single source of truth for combat numbers. Change these, not the WEAPONS list. */
export const DAMAGE = {
  // radius: blast bowl in px. damage: hp at the center (falls off to the rim).
  basic: { radius: 44, damage: 36 },
  // Wider crater, heavier center hit.
  bigshot: { radius: 74, damage: 52 },
  // Carrier blast, then bomblets: count, each radius/damage, horizontal split speed.
  cluster: { radius: 28, damage: 14, bomblets: 5, bombletRadius: 24, bombletDamage: 15, spread: 76 },
  // Mound radius; tiny contact damage if a tank is under the pile.
  dirtbomb: { radius: 58, damage: 8 },
  // blobs: fire puddles. blobDps: hp/s per overlapping blob. burnSeconds: puddle life.
  // maxDpsPerTank: cap so stacked blobs cannot melt instantly. spreadPx: spawn width.
  // flowSpeed: px/s downhill once the slope is steep. slopeMin: |dy/dx| before flow.
  napalm: {
    radius: 26, damage: 6, blobs: 32, blobDps: 2.05, burnSeconds: 5.2,
    maxDpsPerTank: 22, spreadPx: 90, flowSpeed: 52, slopeMin: 0.18,
  },
  // fuse: seconds of rolling before it blows. radius/damage are the final blast.
  roller: { radius: 42, damage: 44, fuse: 4 },
  // Six medium warheads, wide fan (spread is horizontal kick).
  mirv: { radius: 30, damage: 12, bomblets: 6, bombletRadius: 36, bombletDamage: 26, spread: 168 },
  // Rainbow bouncers; bombletDamage is each pop after the hops.
  funky: { radius: 30, damage: 10, bomblets: 7, bombletRadius: 30, bombletDamage: 16, spread: 210 },
  // Huge radius; damage can overkill a 100 hp tank at the center.
  nuke: { radius: 280, damage: 140 },
  // kernels: hopping bits. kernelDamage/radius: each pop. hops: bounces before pop.
  popcorn: { radius: 22, damage: 8, kernels: 14, kernelDamage: 7, kernelRadius: 18, hops: 3, spread: 160 },
  // pull: how far tanks slide toward the well. mound: dirt pile radius. suckSeconds: inbound swirl.
  magnet: { radius: 90, damage: 18, pull: 110, mound: 72, suckSeconds: 0.85 },
  // damage: bolt at the impact. chain: extra hit on the nearest tank. chainRange: max arc px.
  bolt: { radius: 36, damage: 28, chain: 22, chainRange: 320 },
};

function dmg(id) {
  return DAMAGE[id] || {};
}

export const WEAPONS = [
  {
    id: 'basic',
    name: 'Basic Shell',
    price: 0,
    bundle: 0,
    max: Infinity,
    ammoDefault: Infinity,
    s1: Infinity,
    get radius() { return dmg('basic').radius; },
    get damage() { return dmg('basic').damage; },
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
    get radius() { return dmg('bigshot').radius; },
    get damage() { return dmg('bigshot').damage; },
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
    get radius() { return dmg('cluster').radius; },
    get damage() { return dmg('cluster').damage; },
    color: '#8af6ff',
    trail: 'spark',
    behavior: 'cluster',
    shake: 0.75,
    get bomblets() { return dmg('cluster').bomblets; },
    get bombletRadius() { return dmg('cluster').bombletRadius; },
    get bombletDamage() { return dmg('cluster').bombletDamage; },
    get spread() { return dmg('cluster').spread; },
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
    get radius() { return dmg('dirtbomb').radius; },
    get damage() { return dmg('dirtbomb').damage; },
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
    get radius() { return dmg('napalm').radius; },
    get damage() { return dmg('napalm').damage; },
    color: '#ff4a1a',
    trail: 'spark',
    behavior: 'napalm',
    shake: 0.55,
    get blobs() { return dmg('napalm').blobs; },
    get dps() { return dmg('napalm').blobDps; },
    get burnTime() { return dmg('napalm').burnSeconds; },
    get maxDps() { return dmg('napalm').maxDpsPerTank; },
    get spreadPx() { return dmg('napalm').spreadPx; },
    get flowSpeed() { return dmg('napalm').flowSpeed; },
    get slopeMin() { return dmg('napalm').slopeMin; },
    blurb: 'Fire that pools, then runs downhill',
  },
  {
    id: 'roller',
    name: 'Roller',
    price: 3500,
    bundle: 3,
    max: 10,
    ammoDefault: 0,
    s1: 0,
    get radius() { return dmg('roller').radius; },
    get damage() { return dmg('roller').damage; },
    color: '#e8eef2',
    trail: 'smoke',
    behavior: 'roller',
    shake: 1.1,
    get fuse() { return dmg('roller').fuse; },
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
    get radius() { return dmg('mirv').radius; },
    get damage() { return dmg('mirv').damage; },
    color: '#ffd36a',
    trail: 'spark',
    behavior: 'mirv',
    shake: 0.8,
    get bomblets() { return dmg('mirv').bomblets; },
    get bombletRadius() { return dmg('mirv').bombletRadius; },
    get bombletDamage() { return dmg('mirv').bombletDamage; },
    get spread() { return dmg('mirv').spread; },
    blurb: 'Six warheads, wide fan',
  },
  {
    id: 'funky',
    name: 'Chaos Bomb',
    price: 7000,
    bundle: 2,
    max: 10,
    ammoDefault: 0,
    s1: 0,
    get radius() { return dmg('funky').radius; },
    get damage() { return dmg('funky').damage; },
    color: '#ff4ad8',
    trail: 'spark',
    behavior: 'funky',
    shake: 0.7,
    get bomblets() { return dmg('funky').bomblets; },
    get bombletRadius() { return dmg('funky').bombletRadius; },
    get bombletDamage() { return dmg('funky').bombletDamage; },
    get spread() { return dmg('funky').spread; },
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
    get radius() { return dmg('nuke').radius; },
    get damage() { return dmg('nuke').damage; },
    color: '#fff6d0',
    trail: 'spark',
    behavior: 'nuke',
    shake: 3.4,
    blurb: 'Blinding blast and a mushroom cloud',
  },
  {
    id: 'popcorn',
    name: 'Popcorn Bomb',
    price: 2500,
    bundle: 3,
    max: 10,
    ammoDefault: 0,
    s1: 0,
    get radius() { return dmg('popcorn').radius; },
    get damage() { return dmg('popcorn').damage; },
    color: '#ffe9a0',
    trail: 'spark',
    behavior: 'popcorn',
    shake: 0.55,
    get kernels() { return dmg('popcorn').kernels; },
    get kernelDamage() { return dmg('popcorn').kernelDamage; },
    get kernelRadius() { return dmg('popcorn').kernelRadius; },
    get hops() { return dmg('popcorn').hops; },
    get spread() { return dmg('popcorn').spread; },
    blurb: 'Kernels hop, then pop',
  },
  {
    id: 'magnet',
    name: 'Dirt Magnet',
    price: 4500,
    bundle: 2,
    max: 8,
    ammoDefault: 0,
    s1: 0,
    get radius() { return dmg('magnet').radius; },
    get damage() { return dmg('magnet').damage; },
    color: '#9ad0ff',
    trail: 'spark',
    behavior: 'magnet',
    shake: 0.9,
    get pull() { return dmg('magnet').pull; },
    get mound() { return dmg('magnet').mound; },
    get suckSeconds() { return dmg('magnet').suckSeconds; },
    blurb: 'Sucks dirt in, then dumps a hill',
  },
  {
    id: 'bolt',
    name: 'Lightning Rod',
    price: 5500,
    bundle: 2,
    max: 8,
    ammoDefault: 0,
    s1: 0,
    get radius() { return dmg('bolt').radius; },
    get damage() { return dmg('bolt').damage; },
    color: '#c8e8ff',
    trail: 'spark',
    behavior: 'bolt',
    shake: 1.2,
    get chain() { return dmg('bolt').chain; },
    get chainRange() { return dmg('bolt').chainRange; },
    blurb: 'Sky bolt, then a chain arc',
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
