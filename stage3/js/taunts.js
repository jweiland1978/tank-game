const LINES = {
  fire: [
    'Eat dirt!',
    'Incoming!',
    'Have a snack!',
    'Watch this arc!',
    'Special delivery!',
    'Try dodge this!',
    "Barrel's hungry!",
    'Kiss the sky!',
    'Air mail!',
    'One for the cheap seats!',
  ],
  hit: [
    'Ow! My paint!',
    'That dent counts!',
    'Rude!',
    'You scuffed the hull!',
    'Hey, I just waxed!',
    'Oof, spicy!',
    'Not the treads!',
    "I'm leaking pride!",
    'Who taught you manners?',
    'I felt that in the rivets!',
  ],
  kill: [
    'And stay down!',
    "That's a wrap!",
    'One less rivet!',
    'Nighty night!',
    'Hull, meet dirt!',
    'Too easy!',
    'Send a postcard!',
    'Folded like a lawn chair!',
  ],
  miss: [
    'Whew, close!',
    'Missed me, pal!',
    'Felt the breeze!',
    'Almost had me!',
    'Lucky dirt!',
    'Still rolling!',
    'Nice try, sky!',
    'I blinked on purpose!',
  ],
  low: [
    "I'm on fumes!",
    'Anyone got tape?',
    'This is fine!',
    "Don't look at the hole!",
    'Running on spite!',
    'One more scratch and I sneeze!',
    'Send snacks, not shells!',
  ],
  easy: [
    'Did I do it?',
    'Was that the trigger?',
    'Oops, firing!',
    'Is this the pointy end?',
    'I closed my eyes a little!',
  ],
  normal: [
    'Calculated-ish.',
    'Standard issue boom.',
    "Let's keep it tidy.",
    'By the book.',
    'That should land. Probably.',
  ],
  hard: [
    'Predictable.',
    'I already solved you.',
    'Sleep now.',
    'Math wins.',
    'You telegraphed that.',
  ],
};

const KEY = 'ironrig-taunts';

let on = true;
try {
  const v = localStorage.getItem(KEY);
  if (v === '0') on = false;
  if (v === '1') on = true;
} catch (e) { /* private mode */ }

export function tauntsOn() {
  return on;
}

export function setTaunts(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
}

export function pickLine(category, rng) {
  const list = LINES[category] || LINES.fire;
  const r = rng || Math.random;
  return list[(r() * list.length) | 0];
}

export function categories() {
  return Object.keys(LINES);
}
