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
    'Sending a postcard!',
    "This one's got your name!",
    "Hold still, I'm painting!",
    'Clear the ridge!',
    'Parcel for the hull!',
    'Eyes up!',
    'Count the seconds!',
    'There it goes!',
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
    'My windshield is a suggestion!',
    'That rang the turret!',
    'I will remember that scratch!',
    'Rattled, not rattled enough!',
    'You knocked my lunch over!',
    'The plates are warm now!',
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
    'Garage is closed!',
    'Back to the shed!',
    'Turret down, story over!',
    'That was the whole tank!',
    'Dust to dust, pal!',
    'Thanks for playing along!',
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
    'The hill took that one!',
    'I ducked with style!',
    'Wind owes me one!',
    'Still shiny!',
    'You fertilized the dirt!',
    'My mirror is intact!',
  ],
  low: [
    "I'm on fumes!",
    'Anyone got tape?',
    'This is fine!',
    "Don't look at the hole!",
    'Running on spite!',
    'One more scratch and I sneeze!',
    'Send snacks, not shells!',
    'Tape and hope!',
    'One sneeze from scrap!',
    'Clapping with one tread!',
    'The medic is a rumor!',
    'Floor is warm, so am I!',
  ],
  easy: [
    'Did I do it?',
    'Was that the trigger?',
    'Oops, firing!',
    'Is this the pointy end?',
    'I closed my eyes a little!',
    'The button was right there!',
    'I aimed at the pretty cloud!',
    'Learning is loud!',
    'Was the wind supposed to help?',
    'I picked a direction!',
  ],
  normal: [
    'Calculated-ish.',
    'Standard issue boom.',
    "Let's keep it tidy.",
    'By the book.',
    'That should land. Probably.',
    'Textbook arc. Mostly.',
    'Nothing fancy, just physics.',
    'That line looks honest.',
    'Keeping the receipt.',
    'Steady hands, steady shell.',
  ],
  hard: [
    'Predictable.',
    'I already solved you.',
    'Sleep now.',
    'Math wins.',
    'You telegraphed that.',
    'I measured twice.',
    'Your hill already told me.',
    'The wind signed a confession.',
    'Leave a gap and I will use it.',
    'That angle was a gift.',
    'I do not miss on purpose.',
    'Check the math if you want.',
  ],
  big: [
    'Big toy, big noise!',
    'This one has a reputation!',
    'Say hello to the special!',
    'I saved this for you!',
    "The cupboard's best!",
    'Cover your eyebrows!',
    'This is the loud shelf!',
    'Not the free shell!',
    'I brought the fancy one!',
    'Sky, meet the ground!',
    'Hold onto your treads!',
    'This receipt is spicy!',
    'Clear the valley!',
    'I read the label twice!',
  ],
  win: [
    "Round's mine!",
    'The hill agrees with me!',
    'Park the trophy on the tread!',
    'That is a full card!',
    'I will take the sunset!',
    'Winner, still muddy!',
    'Leave the gate open!',
    'Cash and bragging rights!',
    'The scoreboard blinked!',
    'I brought extra paint!',
    'Last tank rolling!',
    'See you at the store!',
  ],
};

const KEY = 'ironrig-taunts';

let on = true;
let lastLine = '';
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
  const list = LINES[category] && LINES[category].length ? LINES[category] : LINES.fire;
  const r = rng || Math.random;
  let i = (r() * list.length) | 0;
  if (list.length > 1 && list[i] === lastLine) i = (i + 1) % list.length;
  lastLine = list[i];
  return lastLine;
}

export function categories() {
  return Object.keys(LINES);
}

export function lineCount() {
  let n = 0;
  for (const k in LINES) n += LINES[k].length;
  return n;
}
