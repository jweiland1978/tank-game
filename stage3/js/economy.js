import { clamp } from './config.js?v=1';
import { getWeapon, WEAPONS } from './weapons.js?v=1';

export const ECON = {
  cashLow: 2500,
  cashNormal: 5000,
  cashHigh: 10000,
  payPerHp: 30,
  selfPerHp: 10,
  killBonus: 800,
  winBonus: 1500,
  surviveBonus: 250,
  interest: 0.05,
  interestCap: 500,
  shieldHp: 60,
  armorStep: 25,
  fuelPx: 8,
  maxClimb: 2.5,
};

export const STARTER = { bigshot: 1, cluster: 1, dirtbomb: 1 };

const GEAR = [
  {
    id: 'shield', cat: 'accessory', name: 'Shield', price: 4000, bundle: 1, max: 3,
    blurb: 'Bubble absorbs 60 damage',
  },
  {
    id: 'parachute', cat: 'accessory', name: 'Parachute', price: 2500, bundle: 1, max: 4,
    blurb: 'Opens on a long fall, one use',
  },
  {
    id: 'fuel', cat: 'accessory', name: 'Fuel', price: 2000, bundle: 24, max: 72,
    blurb: 'Drive along the ground',
  },
  {
    id: 'laser', cat: 'accessory', name: 'Laser Sight', price: 1800, bundle: 1, max: 6,
    blurb: 'Long dotted aim, one shot',
  },
  {
    id: 'armor', cat: 'upgrade', name: 'Armor', price: 8000, bundle: 1, max: 2,
    blurb: '+25 max health per level',
  },
  {
    id: 'barrel', cat: 'upgrade', name: 'Bigger Barrel', price: 10000, bundle: 1, max: 1,
    blurb: 'Power slider reaches 120',
  },
];

const GEAR_BY = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export function getListing(id) {
  if (id === 'basic') {
    return {
      id: 'basic', cat: 'weapon', name: 'Basic Shell', price: 0, bundle: 0,
      max: Infinity, blurb: 'Free and unlimited', unsold: true,
    };
  }
  const w = getWeapon(id);
  if (w) {
    return {
      id: w.id, cat: 'weapon', name: w.name, price: w.price, bundle: w.bundle,
      max: w.max, blurb: w.blurb, unsold: w.shop === false,
    };
  }
  return GEAR_BY[id] || null;
}

export function listings(cat) {
  if (cat === 'weapon') {
    return WEAPONS.map((w) => getListing(w.id));
  }
  if (cat === 'accessory') return GEAR.filter((g) => g.cat === 'accessory');
  if (cat === 'upgrade') return GEAR.filter((g) => g.cat === 'upgrade');
  const basic = getListing('basic');
  return [basic].concat(WEAPONS.filter((w) => w.id !== 'basic').map((w) => getListing(w.id)), GEAR);
}

export function emptyItems() {
  return { shield: 0, parachute: 0, fuel: 0, laser: 0 };
}

export function emptyUpgrades() {
  return { armor: 0, barrel: 0 };
}

export function maxPowerOf(tank) {
  return tank && tank.upgrades && tank.upgrades.barrel ? 120 : 100;
}

export function ownedCount(tank, id) {
  if (!tank) return 0;
  if (id === 'basic') return Infinity;
  const w = getWeapon(id);
  if (w) {
    const n = tank.ammo ? tank.ammo[id] : 0;
    return n === Infinity ? Infinity : (n || 0);
  }
  if (id === 'armor' || id === 'barrel') return (tank.upgrades && tank.upgrades[id]) || 0;
  return (tank.items && tank.items[id]) || 0;
}

function syncArmor(tank) {
  const lvl = tank.upgrades.armor || 0;
  tank.maxHp = 100 + lvl * ECON.armorStep;
  if (tank.hp > tank.maxHp) tank.hp = tank.maxHp;
}

/** Add (or remove) units. Armor also moves maxHp and current hp. */
export function give(tank, id, count) {
  const n = count | 0;
  if (!tank || !n) return 0;
  const item = getListing(id);
  if (!item || item.unsold) return 0;
  if (id === 'armor' || id === 'barrel') {
    const before = tank.upgrades[id] || 0;
    const after = clamp(before + n, 0, item.max);
    const diff = after - before;
    tank.upgrades[id] = after;
    if (id === 'armor') {
      syncArmor(tank);
      if (diff > 0) tank.hp = clamp(tank.hp + diff * ECON.armorStep, 0, tank.maxHp);
    }
    return diff;
  }
  if (getWeapon(id)) {
    const cur = tank.ammo[id] === Infinity ? 0 : (tank.ammo[id] || 0);
    const next = Math.max(0, cur + n);
    tank.ammo[id] = next;
    return next - cur;
  }
  const cur = tank.items[id] || 0;
  const next = Math.max(0, cur + n);
  tank.items[id] = next;
  return next - cur;
}

export function canBuy(tank, id) {
  const item = getListing(id);
  if (!tank || !item || item.unsold || !(item.price > 0) || !(item.bundle > 0)) return false;
  if ((tank.cash | 0) < item.price) return false;
  const have = ownedCount(tank, id);
  if (have === Infinity) return false;
  if (have + item.bundle > item.max) return false;
  return true;
}

export function canSell(tank, id) {
  const item = getListing(id);
  if (!tank || !item || item.unsold) return false;
  const have = ownedCount(tank, id);
  return have !== Infinity && have > 0;
}

export function unitRefund(item) {
  if (!item || !(item.bundle > 0)) return 0;
  return Math.max(1, Math.round((item.price / item.bundle) * 0.5));
}

export function buy(tank, id) {
  if (!canBuy(tank, id)) return false;
  const item = getListing(id);
  tank.cash -= item.price;
  give(tank, id, item.bundle);
  return true;
}

export function sell(tank, id) {
  if (!canSell(tank, id)) return false;
  const item = getListing(id);
  give(tank, id, -1);
  tank.cash += unitRefund(item);
  return true;
}

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function labelOf(id) {
  const item = getListing(id);
  if (!item) return id;
  return item.bundle > 1 ? `${item.bundle}× ${item.name}` : item.name;
}

/**
 * CPU shop. Easy grabs one cheap bundle. Normal buys a shield and a useful extra.
 * Hard buys shield and parachute, then a strong weapon if it can keep a reserve
 * (it saves sometimes). Returns display labels of what was bought.
 */
export function cpuShop(tank, rng) {
  const bought = [];
  const take = (id) => {
    if (!canBuy(tank, id)) return false;
    buy(tank, id);
    bought.push(labelOf(id));
    return true;
  };
  const skill = (tank && tank.skill) || 'normal';
  const roll = rng || Math.random;
  if (skill === 'easy') {
    const cheap = shuffled(['dirtbomb', 'fuel', 'laser', 'parachute', 'bigshot', 'roller'], roll);
    for (let i = 0; i < cheap.length; i++) {
      if (take(cheap[i])) break;
    }
  } else if (skill === 'normal') {
    if ((tank.items.shield || 0) < 1) take('shield');
    if ((tank.items.parachute || 0) < 1 && tank.cash >= 4500) take('parachute');
    else if ((tank.items.fuel || 0) < 24 && tank.cash >= 3500) take('fuel');
    if ((tank.ammo.bigshot || 0) < 4 && tank.cash >= 5000) take('bigshot');
    else if ((tank.ammo.popcorn || 0) < 3 && tank.cash >= 4000) take('popcorn');
    else if (tank.cash >= 4500) take('dirtbomb');
    if ((tank.ammo.magnet || 0) < 2 && tank.cash >= 6000) take('magnet');
  } else {
    const save = roll() < 0.45;
    const reserve = save ? 6000 : 1200;
    if ((tank.items.shield || 0) < 1) take('shield');
    if ((tank.items.parachute || 0) < 1 && tank.cash - 2500 >= Math.min(reserve, 2000)) take('parachute');
    if ((tank.items.laser || 0) < 1 && tank.cash - 1800 >= reserve) take('laser');
    const wants = ['nuke', 'mirv', 'napalm', 'bolt', 'magnet', 'funky', 'popcorn', 'roller'];
    for (let i = 0; i < wants.length; i++) {
      const item = getListing(wants[i]);
      if (!item) continue;
      if (tank.cash - item.price >= reserve && take(wants[i])) break;
    }
    if ((tank.items.fuel || 0) < 12 && tank.cash - 2000 >= reserve) take('fuel');
  }
  return bought;
}

export function formatMoney(n) {
  const v = Math.round(n || 0);
  const sign = v < 0 ? '-' : '';
  const s = String(Math.abs(v));
  return sign + '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
