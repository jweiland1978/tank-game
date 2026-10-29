# Iron Rig — Stage 3

Static canvas game. Open `index.html` from a local server (relative URLs only). Every module import and the stylesheet carry `?v=1`.

```
python3 -m http.server 8893 --bind 127.0.0.1
```

`GAME_TITLE` in `js/config.js` stays `Iron Rig`. The title screen keeps the small "Made with AI help" note.

## Layout

- `js/config.js` — title, world (1600×900), gravity, wind, tank body, palette, seeded RNG.
- `js/weapons.js` — **DAMAGE table** (tune here) plus weapon data. The engine branches on `behavior`.
- `js/economy.js` — prices, payouts, buy/sell, CPU shopping.
- `js/store.js` — CPU shop lines and human turn order.
- `js/terrain.js` — heightmap, terrain styles, craters, mounds, burn darkening.
- `js/physics.js` — fixed-step flight. AI trials use the same integrator.
- `js/fx.js` — capped particles (2000), fireballs, nuke mushroom, popcorn, magnet, lightning, float damage, shake, flash.
- `js/audio.js` — Web Audio synth (master GainNode + compressor). Volume `localStorage["ironrig-volume"]`, mute `ironrig-muted`.
- `js/taunts.js` — speech-bubble lines and the taunts toggle (`ironrig-taunts`).
- `js/ai.js` — chunked angle/power search. CPUs fire basic, big shot, or cluster only.
- `js/ui.js` — DOM screens and HUD. `document.body.dataset.screen` mirrors the screen.
- `js/main.js` — match, money, store flow, weapons, `window.__game`.

Simulation is 120 Hz. `setSpeed(n)` runs `round(n * 2)` steps per frame so 1× matches a 60 fps display. The view scales the world to the screen width and pins the ground to the bottom. Shake is clamped (9 CSS px on a short screen, 14 otherwise). `prefers-reduced-motion` cuts shake, flash, and particle counts.

## To tune damage

Edit `DAMAGE` in `js/weapons.js`. Weapon definitions read from it (getters), so it is the single source of truth. Do not copy radius/damage into the weapon list.

## Stage 1 compatibility

`startGame(opts)` without `stage2:true` is the Stage 1 match: classic hills, ammo basic ∞ / big shot 3 / cluster 2 / dirt bomb 2 / everything else 0, no store, Next round rebuilds the round immediately with hp 100. The UI Start button always begins a Stage 2 match. `startGame({stage2:true})` uses Stage 2 rules. Hot-seat handoff is off unless `startGame({handoff:true})` or the setup Pass toggle (UI Start passes that flag).

## Match

Setup: rounds 3 / 5 / 10 (default 5), terrain, starting cash Low $2,500 / Normal $5,000 / High $10,000, Taunts On/Off, Pass (hot-seat) On/Off. Round 1 gives each tank a starter kit: 1 big shot, 1 cluster, 1 dirt bomb. Ammo and gear persist across rounds. Shields arm at the start of each round (one charge, 60 absorbed). At the end of the last round the Standings button opens final standings (wins, then cash, then damage). Play again repeats the same setup.

Hot-seat: with 2+ humans and Pass on, a full-screen "Name's turn — pass the device" overlay (`state().screen === 'handoff'`) appears before a human turn that follows a different human. Not shown before a CPU turn or when only one human is playing. Store pass screens are unchanged.

## Money

Numbers live in `ECON` in `js/economy.js`.

- $30 per hp dealt to another tank, $800 per kill, $1,500 round win, $250 survival.
- Self-damage costs $10 per hp. Friendly and API `damageTank` hits pay nothing.
- End of round: 5% interest on cash before the win and survival bonuses, capped at $500.
- A good round lands around $3,000–$8,000. Store bundles run from about $1,500 to $20,000.

## Store

After Next round, CPUs shop instantly. Each human then gets a full-screen store (Weapons / Accessories / Upgrades). Sell refunds half of one unit, rounded (`max(1, round(price / bundle * 0.5))`). Basic Shell is free, unlimited, and not sold. A pass screen sits between humans. On a short phone screen the grid is a compact 3-column list so Buy/Sell stay on screen; a "more ▼" fade appears only if a tab still overflows.

CPU shop: Easy buys one cheap bundle at random. Normal buys a shield, then parachute or fuel, then a shell (and maybe popcorn / magnet). Hard buys a shield, sometimes saves (keeps about $6,000), and otherwise adds parachute, laser, and a strong weapon (nuke, MIRV, napalm, bolt, magnet, funky, popcorn, roller) when it can afford the reserve.

## Weapons

| id | bundle | notes |
| --- | --- | --- |
| basic | free | radius 44 |
| bigshot | $2,000 ×3 | radius 74 |
| cluster | $3,000 ×2 | 5 pops, spread 76 |
| dirtbomb | $1,500 ×3 | mound |
| napalm | $6,000 ×2 | ~32 pooling fire blobs, deadly on a direct hit |
| roller | $3,500 ×3 | rolls downhill, fuse 4s |
| mirv | $9,000 ×2 | 6 medium blasts, spread 168 |
| funky | $7,000 ×2 | 7 bouncing rainbow bombs |
| nuke | $20,000 ×1 | radius 280, max carry 3 |
| popcorn | $2,500 ×3 | hopping kernels that pop |
| magnet | $4,500 ×2 | sucks dirt, yanks tanks, dumps a mound |
| bolt | $5,500 ×2 | sky lightning, then a chain arc |

Napalm uses hazards (`state().hazards`, `hazardsInfo: [{x,y}]`). Blobs spawn across about a tank-width, pool on flat ground, and only flow when the slope is steep. Contact is the tank body/treads, not the turret center. Burn is capped by `DAMAGE.napalm.maxDpsPerTank`. A tank that is taking burn damage has `burning:true`. The turn waits until hazards are gone. Burnt ground darkens. Nuke draws a flash, shockwave, and a rising mushroom. The laser sight draws the first 40% of the predicted trajectory **including wind**.

## Audio and taunts

Speaker button (`volume-btn`) opens a popover with the volume slider, mute, and taunts toggle. Setup has the same taunts / pass toggles. Volume and mute persist. Audio starts after a user gesture.

Taunts are short PG bubbles over a tank (`state().taunt = {tank, text}` or `null`). `__game.forceTaunt(i, category)` with categories `fire` / `hit` / `kill` / `miss` / `low` / `easy` / `normal` / `hard`.

## Terrain

Styles: `rolling`, `mountains`, `canyon`, `islands`, `spires`, and `random` (a different style each round). The heightmap is a single column function. Bedrock keeps at least 78px of dirt (`MAX_Y = 822`). Peaks stop at y=300 so on an 844×390 phone they stay below the top HUD. Spawns are spread, kept off the edges, and flattened into a shelf no higher than y=460. `terrainProfile()` returns surface y every 8 world units.

## Test hooks

`window.__game`: `state`, `startGame`, `setAim`, `selectWeapon`, `fire`, `setWind`, `setSpeed`, `damageTank`, `carve`, `terrainHeightAt`, `terrainProfile`, `giveItem`, `setCash`, `buy`, `sell`, `storeDone`, `move`, `toggleShield`, `skipToRoundEnd`, `forceNextRound`, `frameStats`, `DAMAGE`, `detonateAt`, `forceTaunt`, `placeTank`, `setVolume`, `setMuted`, `setTaunts`, `setHandoff`, `handoffGo`.

`state()` adds cash, maxHp, shield, items, upgrades, round, totalRounds, terrainStyle (resolved), matchOver, lastRoundMoney, hazardsInfo, offscreenMarker, ghostMarker, lastImpact, roller, burning per tank, taunt, volume, muted. Screen may be `store`, `pass`, `handoff`, or `final`.
