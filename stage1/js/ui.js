import { GAME_TITLE, PALETTE } from './config.js?v=1';

const $ = (id) => document.getElementById(id);

let count = 2;
const cpu = [false, true, true, true];
const skill = ['normal', 'normal', 'normal', 'normal'];
let bannerTimer = 0;

const CONTROL_IDS = [
  'angle-minus', 'angle-plus', 'power-minus', 'power-plus', 'weapon-btn', 'fire-btn',
];

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

function refreshSetup() {
  for (let n = 2; n <= 4; n++) {
    const b = document.querySelector(`[data-testid="setup-count-${n}"]`);
    if (b) b.classList.toggle('is-on', n === count);
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
  const title = $('game-title');
  if (title) title.textContent = GAME_TITLE;
  document.title = GAME_TITLE;

  for (let i = 0; i < 4; i++) {
    const sw = $(`swatch-${i}`);
    if (sw) sw.style.background = PALETTE[i].color;
  }

  $('play-btn').addEventListener('click', () => h.onPlay());
  $('start-btn').addEventListener('click', () => h.onStart());
  for (let n = 2; n <= 4; n++) {
    document.querySelector(`[data-testid="setup-count-${n}"]`).addEventListener('click', () => {
      count = n;
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
  $('mute-btn').addEventListener('click', () => h.onMute());
  $('next-round-btn').addEventListener('click', () => h.onNext());
  $('menu-btn').addEventListener('click', () => h.onMenu());
  refreshSetup();
}

export function setMuted(muted) {
  const b = $('mute-btn');
  if (!b) return;
  setText($('mute-label'), muted ? 'Sound' : 'Mute');
  b.classList.toggle('is-muted', !!muted);
  b.setAttribute('aria-pressed', muted ? 'true' : 'false');
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
}
