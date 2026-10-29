import { GAME_TITLE, PALETTE } from './config.js?v=1';
import { formatMoney, listings } from './economy.js?v=1';

const $ = (id) => document.getElementById(id);

let count = 2;
const cpu = [false, true, true, true];
const skill = ['normal', 'normal', 'normal', 'normal'];
let rounds = 5;
let terrain = 'random';
let cashTier = 'normal';
let bannerTimer = 0;
let storeCat = 'weapon';
let handlers = {};
let tauntsOn = true;
let handoffOn = true;
let reduceOn = false;
let volOpen = false;

const CASH_TIERS = { low: 2500, normal: 5000, high: 10000 };
const TERRAINS = [
  ['rolling', 'Hills'],
  ['mountains', 'Mountains'],
  ['canyon', 'Canyon'],
  ['islands', 'Islands'],
  ['spires', 'Spires'],
  ['random', 'Random'],
];

const CONTROL_IDS = [
  'angle-minus', 'angle-plus', 'power-minus', 'power-plus', 'weapon-btn', 'fire-btn',
];

const ICONS = {
  basic: '<circle cx="20" cy="22" r="7" fill="#ffe27a"/><path d="M20 6v8" stroke="#fff" stroke-width="2"/>',
  bigshot: '<circle cx="20" cy="22" r="10" fill="#ff7a3c"/><circle cx="20" cy="22" r="4" fill="#fff"/>',
  cluster: '<circle cx="20" cy="16" r="5" fill="#8af6ff"/><circle cx="12" cy="26" r="4" fill="#8af6ff"/><circle cx="28" cy="26" r="4" fill="#8af6ff"/>',
  dirtbomb: '<ellipse cx="20" cy="26" rx="12" ry="6" fill="#d2a85a"/><circle cx="20" cy="16" r="6" fill="#a9743a"/>',
  napalm: '<path d="M20 30c8-6 8-12 4-16 2 2 2 6-1 8-4-8-2-14 2-18-10 4-12 14-5 26z" fill="#ff4a1a"/><path d="M18 28c3-3 4-7 2-10 0 4-2 6-2 10z" fill="#ffe9a0"/>',
  roller: '<circle cx="20" cy="22" r="9" fill="#e8eef2" stroke="#222" stroke-width="2"/><path d="M20 14v16M13 22h14" stroke="#888" stroke-width="1.5"/>',
  mirv: '<path d="M20 8l3 10h8l-6 5 2 9-7-5-7 5 2-9-6-5h8z" fill="#ffd36a"/>',
  funky: '<circle cx="12" cy="20" r="4" fill="#ff4ad8"/><circle cx="20" cy="14" r="4" fill="#7dff4a"/><circle cx="28" cy="20" r="4" fill="#4ad4ff"/><circle cx="20" cy="27" r="4" fill="#ffe14a"/>',
  nuke: '<ellipse cx="20" cy="16" rx="12" ry="6" fill="#ffb15a"/><rect x="17" y="16" width="6" height="12" fill="#ffe9c0"/><ellipse cx="20" cy="28" rx="8" ry="3" fill="#c46a22"/>',
  popcorn: '<circle cx="14" cy="16" r="5" fill="#ffe9a0"/><circle cx="24" cy="14" r="4.5" fill="#fff6d8"/><circle cx="18" cy="26" r="6" fill="#ffd36a"/><circle cx="28" cy="24" r="4" fill="#fff"/>',
  magnet: '<path d="M10 8h8v12a6 6 0 0012 0V8h8v12a14 14 0 01-28 0z" fill="#9ad0ff"/><rect x="10" y="6" width="8" height="6" fill="#ff5a4a"/><rect x="22" y="6" width="8" height="6" fill="#5a8cff"/>',
  bolt: '<path d="M22 4l-10 16h8l-4 16 14-20h-8z" fill="#e8f6ff" stroke="#7ec8ff"/>',
  shield: '<ellipse cx="20" cy="20" rx="10" ry="12" fill="none" stroke="#9ee7ff" stroke-width="3"/>',
  parachute: '<path d="M8 18a12 12 0 0124 0" fill="#ff6a6a"/><path d="M12 18l8 12 8-12" stroke="#fff" fill="none"/>',
  fuel: '<rect x="14" y="10" width="12" height="18" rx="2" fill="#ffb15a"/><rect x="17" y="7" width="6" height="4" fill="#fff"/>',
  laser: '<path d="M6 28l20-16" stroke="#ff4a4a" stroke-width="2" stroke-dasharray="3 2"/><circle cx="28" cy="12" r="3" fill="#ff4a4a"/>',
  armor: '<path d="M20 6l10 4v8c0 7-4 12-10 14-6-2-10-7-10-14V10z" fill="#c8d0da" stroke="#222"/>',
  barrel: '<rect x="8" y="16" width="24" height="6" rx="2" fill="#ddd"/><rect x="28" y="14" width="6" height="10" fill="#ffb15a"/>',
};

function iconSvg(id) {
  const body = ICONS[id] || ICONS.basic;
  return `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">${body}</svg>`;
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

export function setScreen(name) {
  document.body.dataset.screen = name;
}

export function readSetup() {
  const tanks = [];
  for (let i = 0; i < count; i++) tanks.push({ cpu: cpu[i], skill: skill[i] });
  return tanks;
}

export function readOptions() {
  return {
    rounds,
    terrain,
    cash: CASH_TIERS[cashTier] || CASH_TIERS.normal,
  };
}

function refreshSetup() {
  const tb = document.querySelector('[data-testid="setup-taunts"]');
  if (tb) {
    setText(tb, tauntsOn ? 'Taunts: On' : 'Taunts: Off');
    tb.classList.toggle('is-on', tauntsOn);
  }
  const hb = document.querySelector('[data-testid="setup-handoff"]');
  if (hb) {
    setText(hb, handoffOn ? 'Pass: On' : 'Pass: Off');
    hb.classList.toggle('is-on', handoffOn);
  }
  const tg = document.querySelector('[data-testid="taunts-toggle"]');
  if (tg) {
    setText(tg, tauntsOn ? 'Taunts: On' : 'Taunts: Off');
    tg.classList.toggle('is-on', tauntsOn);
  }
  const st = document.querySelector('[data-testid="settings-taunts"]');
  if (st) {
    setText(st, tauntsOn ? 'Taunts: On' : 'Taunts: Off');
    st.classList.toggle('is-on', tauntsOn);
  }
  const sp = document.querySelector('[data-testid="settings-pass"]');
  if (sp) {
    setText(sp, handoffOn ? 'Pass screen: On' : 'Pass screen: Off');
    sp.classList.toggle('is-on', handoffOn);
  }
  const sr = document.querySelector('[data-testid="settings-reduce"]');
  if (sr) {
    setText(sr, reduceOn ? 'Reduced effects: On' : 'Reduced effects: Off');
    sr.classList.toggle('is-on', reduceOn);
  }
  for (let n = 2; n <= 4; n++) {
    const b = document.querySelector(`[data-testid="setup-count-${n}"]`);
    if (b) b.classList.toggle('is-on', n === count);
  }
  for (const n of [3, 5, 10]) {
    const b = document.querySelector(`[data-testid="setup-rounds-${n}"]`);
    if (b) b.classList.toggle('is-on', n === rounds);
  }
  for (const [id] of TERRAINS) {
    const b = document.querySelector(`[data-testid="setup-terrain-${id}"]`);
    if (b) b.classList.toggle('is-on', id === terrain);
  }
  for (const tier of ['low', 'normal', 'high']) {
    const b = document.querySelector(`[data-testid="setup-cash-${tier}"]`);
    if (b) b.classList.toggle('is-on', tier === cashTier);
  }
  for (let i = 0; i < 4; i++) {
    const row = $(`tank-row-${i}`);
    if (row) row.style.display = i < count ? 'flex' : 'none';
    const cb = document.querySelector(`[data-testid="setup-cpu-${i}"]`);
    if (cb) setText(cb, cpu[i] ? 'Computer' : 'Human');
    if (cb) cb.classList.toggle('is-on', cpu[i]);
    for (const sk of ['easy', 'normal', 'hard']) {
      const sb = document.querySelector(`[data-testid="setup-skill-${i}-${sk}"]`);
      if (!sb) continue;
      sb.classList.toggle('is-on', skill[i] === sk);
      sb.classList.toggle('dim', !cpu[i]);
    }
  }
}

function bindHold(el, fn) {
  if (!el) return;
  let timer = 0;
  const stop = () => { if (timer) clearTimeout(timer); timer = 0; };
  el.addEventListener('pointerdown', (e) => {
    if (el.disabled) return;
    e.preventDefault();
    fn();
    let delay = 260;
    const tick = () => {
      if (el.disabled) { stop(); return; }
      fn();
      delay = 55;
      timer = setTimeout(tick, delay);
    };
    stop();
    timer = setTimeout(tick, delay);
  });
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('pointerleave', stop);
}

export function bind(h) {
  handlers = h || {};
  const title = $('game-title');
  if (title) title.textContent = GAME_TITLE;
  document.title = GAME_TITLE;
  const rotateNote = $('rotate-note');
  if (rotateNote) rotateNote.textContent = `${GAME_TITLE} plays in landscape.`;
  renderGuide();

  for (let i = 0; i < 4; i++) {
    const sw = $(`swatch-${i}`);
    if (sw) sw.style.background = PALETTE[i].color;
  }

  $('play-btn').addEventListener('click', () => h.onPlay());
  const settingsBtn = $('settings-btn');
  if (settingsBtn) settingsBtn.addEventListener('click', () => { if (h.onSettings) h.onSettings(); });
  const howtoBtn = $('howto-btn');
  if (howtoBtn) howtoBtn.addEventListener('click', () => { if (h.onHowto) h.onHowto(); });
  const settingsBack = $('settings-back-btn');
  if (settingsBack) settingsBack.addEventListener('click', () => { if (h.onTitle) h.onTitle(); });
  const howtoBack = $('howto-back-btn');
  if (howtoBack) howtoBack.addEventListener('click', () => { if (h.onTitle) h.onTitle(); });
  const settingsVol = $('settings-volume');
  if (settingsVol) settingsVol.addEventListener('input', () => {
    if (h.onVolume) h.onVolume(Number(settingsVol.value) / 100);
  });
  const settingsMute = $('settings-mute');
  if (settingsMute) settingsMute.addEventListener('click', () => { if (h.onMute) h.onMute(); });
  const settingsTaunts = document.querySelector('[data-testid="settings-taunts"]');
  if (settingsTaunts) settingsTaunts.addEventListener('click', () => { if (h.onTaunts) h.onTaunts(); });
  const settingsPass = document.querySelector('[data-testid="settings-pass"]');
  if (settingsPass) settingsPass.addEventListener('click', () => { if (h.onHandoff) h.onHandoff(); });
  const settingsReduce = document.querySelector('[data-testid="settings-reduce"]');
  if (settingsReduce) settingsReduce.addEventListener('click', () => { if (h.onReduce) h.onReduce(); });
  $('start-btn').addEventListener('click', () => h.onStart());
  for (let n = 2; n <= 4; n++) {
    document.querySelector(`[data-testid="setup-count-${n}"]`).addEventListener('click', () => {
      count = n;
      refreshSetup();
    });
  }
  for (const n of [3, 5, 10]) {
    document.querySelector(`[data-testid="setup-rounds-${n}"]`).addEventListener('click', () => {
      rounds = n;
      refreshSetup();
    });
  }
  for (const [id] of TERRAINS) {
    document.querySelector(`[data-testid="setup-terrain-${id}"]`).addEventListener('click', () => {
      terrain = id;
      refreshSetup();
    });
  }
  for (const tier of ['low', 'normal', 'high']) {
    document.querySelector(`[data-testid="setup-cash-${tier}"]`).addEventListener('click', () => {
      cashTier = tier;
      refreshSetup();
    });
  }
  for (let i = 0; i < 4; i++) {
    document.querySelector(`[data-testid="setup-cpu-${i}"]`).addEventListener('click', () => {
      cpu[i] = !cpu[i];
      refreshSetup();
    });
    for (const sk of ['easy', 'normal', 'hard']) {
      document.querySelector(`[data-testid="setup-skill-${i}-${sk}"]`).addEventListener('click', () => {
        skill[i] = sk;
        refreshSetup();
      });
    }
  }

  bindHold(document.querySelector('[data-testid="angle-minus"]'), () => h.onAngle(-1));
  bindHold(document.querySelector('[data-testid="angle-plus"]'), () => h.onAngle(1));
  bindHold(document.querySelector('[data-testid="power-minus"]'), () => h.onPower(-1));
  bindHold(document.querySelector('[data-testid="power-plus"]'), () => h.onPower(1));
  $('weapon-btn').addEventListener('click', () => h.onWeapon(1));
  $('fire-btn').addEventListener('click', () => h.onFire());
  const setupTaunts = document.querySelector('[data-testid="setup-taunts"]');
  if (setupTaunts) setupTaunts.addEventListener('click', () => { if (h.onTaunts) h.onTaunts(); });
  const setupHandoff = document.querySelector('[data-testid="setup-handoff"]');
  if (setupHandoff) setupHandoff.addEventListener('click', () => { if (h.onHandoff) h.onHandoff(); });
  const volBtn = $('volume-btn');
  if (volBtn) volBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    volOpen = !volOpen;
    setVolumeOpen(volOpen);
  });
  const slider = $('volume-slider');
  if (slider) slider.addEventListener('input', () => {
    if (h.onVolume) h.onVolume(Number(slider.value) / 100);
  });
  const mute = $('mute-btn');
  if (mute) mute.addEventListener('click', (e) => { e.stopPropagation(); h.onMute(); });
  const tauntToggle = $('taunts-toggle');
  if (tauntToggle) tauntToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (h.onTaunts) h.onTaunts();
  });
  const handoffGo = $('handoff-go-btn');
  if (handoffGo) handoffGo.addEventListener('click', () => { if (h.onHandoffGo) h.onHandoffGo(); });
  document.addEventListener('click', (e) => {
    if (!volOpen) return;
    const pop = $('volume-pop');
    if (pop && !pop.contains(e.target) && e.target !== $('volume-btn')) {
      volOpen = false;
      setVolumeOpen(false);
    }
  });
  $('next-round-btn').addEventListener('click', () => h.onNext());
  $('menu-btn').addEventListener('click', () => h.onMenu());
  const finalMenu = $('final-menu-btn');
  if (finalMenu) finalMenu.addEventListener('click', () => h.onMenu());
  const again = $('play-again-btn');
  if (again) again.addEventListener('click', () => h.onPlayAgain());
  $('store-done-btn').addEventListener('click', () => h.onStoreDone());
  $('pass-continue-btn').addEventListener('click', () => h.onPass());
  document.querySelectorAll('[data-store-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      storeCat = btn.dataset.storeTab;
      if (h.onStoreTab) h.onStoreTab(storeCat);
    });
  });
  $('store-grid').addEventListener('click', (e) => {
    const buyBtn = e.target.closest('[data-buy]');
    if (buyBtn && !buyBtn.disabled) h.onBuy(buyBtn.dataset.buy);
    const sellBtn = e.target.closest('[data-sell]');
    if (sellBtn && !sellBtn.disabled) h.onSell(sellBtn.dataset.sell);
  });
  bindHold(document.querySelector('[data-testid="move-left-btn"]'), () => h.onMove(-1));
  bindHold(document.querySelector('[data-testid="move-right-btn"]'), () => h.onMove(1));
  const shieldBtn = document.querySelector('[data-testid="shield-btn"]');
  if (shieldBtn) shieldBtn.addEventListener('click', () => h.onShield());
  refreshSetup();
}

export function setMuted(muted) {
  const label = muted ? 'Unmute' : 'Mute';
  const b = $('mute-btn');
  if (b) {
    setText($('mute-label'), label);
    b.classList.toggle('is-muted', !!muted);
    b.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  const sb = $('settings-mute');
  if (sb) {
    setText(sb, label);
    sb.classList.toggle('is-on', !!muted);
    sb.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  const vb = $('volume-btn');
  if (vb) vb.classList.toggle('is-muted', !!muted);
}

export function setVolume(v) {
  const pct = String(Math.round(Math.max(0, Math.min(1, v)) * 100));
  const slider = $('volume-slider');
  if (slider) slider.value = pct;
  const other = $('settings-volume');
  if (other) other.value = pct;
}

export function setReduced(on) {
  reduceOn = !!on;
  refreshSetup();
}

function setVolumeOpen(open) {
  const pop = $('volume-pop');
  const btn = $('volume-btn');
  if (pop) pop.hidden = !open;
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function setTaunts(on) {
  tauntsOn = !!on;
  refreshSetup();
}

export function setHandoff(on) {
  handoffOn = !!on;
  refreshSetup();
}

export function readExtras() {
  return { taunts: tauntsOn, handoff: handoffOn };
}

export function showHandoff(vm) {
  const name = vm && vm.name ? vm.name : 'Player';
  const color = (vm && vm.color) || '#fff6e4';
  setText($('handoff-title'), `${name}'s turn — pass the device`);
  const title = $('handoff-title');
  if (title) title.style.color = color;
  setText($('handoff-round'), vm && vm.roundText ? vm.roundText : '');
  setText($('handoff-stats'), vm && vm.statsText ? vm.statsText : '');
  setText($('handoff-wind'), vm && vm.windText ? vm.windText : '');
  const card = $('handoff-card');
  if (card) {
    card.style.borderColor = color;
    card.style.boxShadow = `0 0 0 1px ${color}55, 0 16px 40px rgba(0,0,0,0.45)`;
    card.style.background = `linear-gradient(150deg, ${color}33, rgba(12,4,16,0.94) 46%)`;
  }
  const board = $('handoff-board');
  if (board) {
    board.replaceChildren();
    const rows = (vm && vm.rows) || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const el = document.createElement('div');
      el.className = 'ho-row' + (row.active ? ' is-me' : '');
      const sw = document.createElement('i');
      sw.className = 'ho-swatch';
      sw.style.background = row.color || '#fff';
      const label = document.createElement('span');
      label.textContent = `${row.name}  ${row.hp} hp  ${row.wins} win${row.wins === 1 ? '' : 's'}  ${row.cash}`;
      el.append(sw, label);
      board.append(el);
    }
  }
  const btn = $('handoff-go-btn');
  if (btn) {
    setText(btn, `I'm ${name} — Go!`);
    btn.style.background = `linear-gradient(#fff0d0, ${color})`;
    btn.style.color = '#2a0c08';
  }
}

function renderGuide() {
  const weapons = $('howto-weapons');
  const gear = $('howto-gear');
  if (weapons && !weapons.childElementCount) {
    for (const item of listings('weapon')) {
      weapons.append(guideRow(item));
    }
  }
  if (gear && !gear.childElementCount) {
    for (const item of listings('accessory')) gear.append(guideRow(item));
    for (const item of listings('upgrade')) gear.append(guideRow(item));
  }
}

function guideRow(item) {
  const row = document.createElement('div');
  row.className = 'howto-row';
  const ic = document.createElement('div');
  ic.className = 'store-ic';
  ic.innerHTML = iconSvg(item.id);
  const text = document.createElement('div');
  const name = document.createElement('b');
  name.textContent = item.name;
  const blurb = document.createElement('span');
  blurb.textContent = item.blurb || '';
  text.append(name, blurb);
  row.append(ic, text);
  return row;
}

export function hideBanner() {
  const el = $('turn-banner');
  if (!el) return;
  el.classList.remove('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = 0;
}

export function showBanner(text, color) {
  const el = $('turn-banner');
  if (!el) return;
  setText(el, text);
  el.style.color = color || '#fff6e4';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1100);
}

export function setWinner(headline, tally) {
  setText($('winner-text'), headline);
  setText($('winner-tally'), tally);
}

export function setNextLabel(text) {
  setText($('next-round-btn'), text);
}

export function renderMoney(rows) {
  const el = $('money-summary');
  if (!el) return;
  if (!rows || !rows.length) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  const table = document.createElement('table');
  table.className = 'mtable';
  const head = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const label of ['Tank', 'Damage', 'Kills', 'Win', 'Live', 'Interest', 'Earned', 'Balance']) {
    const th = document.createElement('th');
    th.textContent = label;
    hr.append(th);
  }
  head.append(hr);
  const body = document.createElement('tbody');
  const cell = (text, className) => {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  };
  for (const r of rows) {
    const tr = document.createElement('tr');
    const name = cell(r.name, 'mname');
    name.style.color = r.color || '#fff';
    const earned = r.total || 0;
    const sign = earned < 0 ? '-' : '+';
    tr.append(
      name,
      cell(formatMoney(r.damage)),
      cell(formatMoney(r.kills)),
      cell(formatMoney(r.win)),
      cell(formatMoney(r.survival)),
      cell(formatMoney(r.interest)),
      cell(sign + formatMoney(Math.abs(earned)), 'mearned'),
      cell(formatMoney(r.balance), 'mbal'),
    );
    body.append(tr);
  }
  table.append(head, body);
  el.replaceChildren(table);
}

function ownedLabel(id, n) {
  if (id === 'basic' || n === Infinity) return '∞';
  return String(n | 0);
}

export function renderStore(vm) {
  storeCat = vm.cat || storeCat;
  const title = $('store-title');
  if (title) {
    title.textContent = `${vm.name}'s store`;
    title.style.color = vm.color || '#fff';
  }
  setText($('store-cash'), formatMoney(vm.cash));
  setText($('store-note'), vm.note || '');
  document.querySelectorAll('[data-store-tab]').forEach((btn) => {
    btn.classList.toggle('is-on', btn.dataset.storeTab === storeCat);
  });
  const grid = $('store-grid');
  if (!grid) return;
  const scroll = grid.scrollTop;
  const items = listings(storeCat);
  grid.replaceChildren();
  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'store-card';
    card.dataset.testid = `store-item-${item.id}`;
    const top = document.createElement('div');
    top.className = 'store-top';
    const ic = document.createElement('div');
    ic.className = 'store-ic';
    ic.innerHTML = iconSvg(item.id);
    const meta = document.createElement('div');
    meta.className = 'store-meta';
    const nm = document.createElement('strong');
    nm.textContent = item.name;
    const pr = document.createElement('span');
    pr.className = 'store-price';
    if (item.unsold) pr.textContent = 'Free';
    else pr.textContent = item.bundle > 1
      ? `${formatMoney(item.price)} ×${item.bundle}`
      : formatMoney(item.price);
    meta.append(nm, pr);
    top.append(ic, meta);
    const desc = document.createElement('p');
    desc.textContent = item.blurb || '';
    const own = document.createElement('div');
    own.className = 'store-own';
    const ownN = document.createElement('span');
    ownN.dataset.testid = `store-owned-${item.id}`;
    const n = vm.owned ? vm.owned[item.id] : 0;
    ownN.textContent = ownedLabel(item.id, n);
    own.append(document.createTextNode('Owned '), ownN);
    const row = document.createElement('div');
    row.className = 'store-actions';
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.dataset.buy = item.id;
    buyBtn.dataset.testid = `store-buy-${item.id}`;
    buyBtn.textContent = 'Buy';
    buyBtn.disabled = !vm.canBuy || !vm.canBuy[item.id];
    const sellBtn = document.createElement('button');
    sellBtn.type = 'button';
    sellBtn.dataset.sell = item.id;
    sellBtn.dataset.testid = `store-sell-${item.id}`;
    sellBtn.textContent = 'Sell';
    sellBtn.disabled = !vm.canSell || !vm.canSell[item.id];
    row.append(buyBtn, sellBtn);
    card.append(top, desc, own, row);
    grid.append(card);
  }
  grid.scrollTop = scroll;
  const more = $('store-more');
  const overflow = grid.scrollHeight > grid.clientHeight + 6;
  grid.classList.toggle('can-scroll', overflow);
  if (more) more.hidden = !overflow;
}

export function showPass(name, color) {
  setText($('pass-title'), `Pass the device to ${name}`);
  const el = $('pass-title');
  if (el) el.style.color = color || '#fff6e4';
}

export function renderFinal(rows) {
  const list = $('final-list');
  if (!list) return;
  list.replaceChildren();
  const medals = ['gold', 'silver', 'bronze'];
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'final-row';
    const medal = document.createElement('i');
    medal.className = `medal ${medals[i] || 'plain'}`;
    medal.textContent = String(i + 1);
    const name = document.createElement('b');
    name.textContent = r.name;
    name.style.color = r.color;
    const stats = document.createElement('span');
    stats.textContent = `${r.wins} wins · ${r.kills} kills · ${Math.round(r.damage)} dmg · ${formatMoney(r.cash)}`;
    li.append(medal, name, stats);
    list.append(li);
  });
}

export function setExtras(vm) {
  const bar = $('move-bar');
  const left = document.querySelector('[data-testid="move-left-btn"]');
  const right = document.querySelector('[data-testid="move-right-btn"]');
  const shield = document.querySelector('[data-testid="shield-btn"]');
  const fuel = $('hud-fuel');
  const showMove = !!(vm && vm.showMove);
  const showShield = !!(vm && vm.showShield);
  if (left) left.classList.toggle('show', showMove);
  if (right) right.classList.toggle('show', showMove);
  if (shield) shield.classList.toggle('show', showShield);
  if (bar) bar.classList.toggle('on', showMove || showShield);
  if (fuel) {
    fuel.classList.toggle('on', !!(vm && vm.showFuel));
    if (vm && vm.showFuel) setText(fuel, vm.fuelText || 'Fuel 0');
  }
  if (shield && vm && vm.shieldText) setText(shield, vm.shieldText);
}

export function sync(vm) {
  setText($('hud-turn'), vm.turnText);
  setText($('hud-wind'), vm.windText);
  setText($('hud-angle'), vm.angleText);
  setText($('hud-power-label') || $('hud-power'), vm.powerText);
  const meter = $('power-meter');
  if (meter) meter.style.width = `${vm.powerPct || 0}%`;
  setText($('hud-weapon'), vm.weaponText);
  setText($('weapon-btn'), vm.weaponBtn);
  const health = $('hud-health');
  if (health && health.dataset.sig !== vm.healthSig) {
    health.dataset.sig = vm.healthSig;
    health.replaceChildren();
    for (const t of vm.health) {
      const chip = document.createElement('span');
      chip.className = 'chip' + (t.active ? ' chip-on' : '') + (t.alive ? '' : ' chip-dead');
      const dot = document.createElement('i');
      dot.style.background = t.color;
      const label = document.createElement('b');
      label.textContent = `${t.name} ${Math.max(0, Math.round(t.hp))}`;
      chip.append(dot, label);
      health.append(chip);
    }
  }
  const on = !!vm.controlsOn;
  const controls = $('controls');
  if (controls) controls.classList.toggle('live', on);
  for (const id of CONTROL_IDS) {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) el.disabled = !on;
  }
  setExtras(vm);
}
