# Boom Ridge — Stage 4

Static canvas game. Open `index.html` from a local server (relative URLs only). Every module import and the stylesheet carry `?v=2`.

```
python3 -m http.server 8895 --bind 127.0.0.1
```

`GAME_TITLE` in `js/config.js` is `Boom Ridge`. localStorage keys keep the old `ironrig-` prefix so saved settings carry over. The title screen keeps the small "Made with AI help" note.

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
- `js/ai.js` — chunked angle/power search, then a weapon score. CPUs fire whatever they own.
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

CPU shop: Easy buys one cheap bundle (dirt bomb, fuel, laser, parachute, big shot, or roller). Normal buys a shield, parachute or fuel, a big shot, then one affordable special (napalm, cluster, roller, popcorn, magnet, bolt, funky, dirt bomb). Hard buys a shield, then up to two weapons from nuke, MIRV, napalm, bolt, magnet, funky, popcorn, roller, cluster, and big shot, keeping a reserve (sometimes about $4,000), then parachute, laser, and fuel if cash remains.

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

Taunts are short original PG bubbles (`state().taunt = {tank, text}` or `null`, `state().tauntBox` in CSS pixels). The same line is not spoken twice in a row. Categories: `fire`, `hit`, `kill`, `miss`, `low`, `easy`, `normal`, `hard`, `big`, `win` (about 130 lines; `__game.tauntCount()`). Bubbles sit above a tank's name and hp bar, or to the side if that would hit the HUD, and stay inside the viewport. `__game.labelRects()` returns those label stacks. `__game.forceTaunt(i, category)` still works; an unknown category falls back to `fire`.

## Title, settings, how to play

The title screen draws `GAME_TITLE` as chunky metallic stencil lettering (CSS, with a tank and crosshair mark) over a dim demo of the backdrop tanks trading a few shells. `prefers-reduced-motion`, or Settings → Reduced effects (`localStorage["ironrig-reduce"]`), freezes that demo (`__game.demoClock()` stops) and the logo glow. Play (`play-btn`) still opens setup. Settings (`settings-btn`) has volume, mute, taunts, pass screen, and reduced effects. How to Play (`howto-btn` / `howto-screen`, back `howto-back-btn`) is a scrolling guide: goal, turns, aiming (drag, nudge buttons, arrows, Shift for fine steps, Space, Tab/Q/E, A/D), wind, money and the store, weapon icons, accessories, and the hot-seat tip. "Made with AI help" stays on the title screen. Portrait still shows the rotate hint.

## Pass the device

The handoff card keeps `handoff-screen` and `handoff-go-btn`. It shows the player's color, a canvas portrait of their tank (`handoff-portrait`, shield and armor included), round text, cash, hp, round wins, the scoreboard row, and the wind for the coming turn. The previous aim is hidden behind the card. Wind is rolled once when the card opens.

## CPU weapon choice

`scoreWeapons` / `planWeapon` in `js/ai.js` run after the usual ballistic search (same integrator as a live shell). The predicted impact, wind, valleys, and nearby tanks pick the shell. Safety comes first on every skill: a weapon is skipped when the blast or effect would reach the shooter (nuke uses radius 280 plus a margin; napalm is skipped when the fire would run downhill onto the shooter; a roller that would roll back, and a magnet that would pull the shooter, are skipped too). If nothing special is safe, the CPU fires basic.

- Hard aims well and spends specials when they fit: nuke only when the impact is clear of itself and more than one tank sits in the blast (or a centered shot on a healthy target); napalm in a valley or downhill of the impact; MIRV, funky, cluster, and popcorn when tanks are bunched or the air is sloppy; roller when the target is downhill; magnet and dirt bomb to bury a close target; bolt when two tanks are inside chain range; big shot is the strong default. About a quarter of shots browse the safe cupboard so the arsenal varies. A nearly dead target or a thin ammo pile pushes basic. Nuke and napalm raise a "Name readies NAPALM!" banner.
- Normal uses a special on roughly 35–50% of shots, with simpler rules (valley napalm, clustered spreads, bolt, roller, otherwise big shot / magnet / dirt bomb).
- Easy stays on basic about 85–90% of the time and only rarely tries big shot, dirt bomb, or cluster.

Laser sight: Hard turns it on for nuke, napalm, MIRV, bolt, or strong wind. Normal uses it on many specials. Easy rarely. Humans still consume a laser on every shot if they own one. Hard and Normal arm a stored shield at the start of their turn. A Hard tank with fuel may drive a short step out of a deep pit when the lip is climbable.

After each fire, `state().lastShot` is `{tank, weapon, cpu, angle, power}` and `state().weaponStats[tankIndex][weaponId]` counts shots. `__game.aiChoose(tankIndex)` runs the same planner and returns `{weapon, reason, safe}` (plus the aim it would use). `state().selfSpecial[i]` sums hp that tank dealt to itself with a special weapon.

Projectiles time out (roller about 8s or 1s stuck, popcorn kernels about 7s, anything else about 12s). A busy turn that is still unresolved after about 14s drops leftover shells and hazards so the turn can end. Napalm stops burning a tank the moment it dies.

## Terrain

Styles: `rolling`, `mountains`, `canyon`, `islands`, `spires`, and `random` (a different style each round). The heightmap is a single column function. Bedrock keeps at least 78px of dirt (`MAX_Y = 822`). Peaks stop at y=300 so on an 844×390 phone they stay below the top HUD. Spawns are spread, kept off the edges, and flattened into a shelf no higher than y=460. `terrainProfile()` returns surface y every 8 world units.

## Test hooks

`window.__game`: `state`, `startGame`, `setAim`, `selectWeapon`, `fire`, `setWind`, `setSpeed`, `damageTank`, `carve`, `terrainHeightAt`, `terrainProfile`, `giveItem`, `setCash`, `buy`, `sell`, `storeDone`, `move`, `toggleShield`, `skipToRoundEnd`, `forceNextRound`, `frameStats`, `DAMAGE`, `detonateAt`, `forceTaunt`, `placeTank`, `setVolume`, `setMuted`, `setTaunts`, `setHandoff`, `handoffGo`, `aiChoose`, `labelRects`, `tauntCount`, `demoClock`.

`state()` adds cash, maxHp, shield, items, upgrades, round, totalRounds, terrainStyle (resolved), matchOver, lastRoundMoney, hazardsInfo, offscreenMarker, ghostMarker, lastImpact, roller, burning per tank, taunt, tauntBox, volume, muted, taunts, reduced, handoff, lastShot, weaponStats, selfSpecial. Screen may be `store`, `pass`, `handoff`, `settings`, `howto`, or `final`.

Keyboard: arrow keys step angle and power by 5, Shift+arrows by 1. The on-screen nudge buttons stay ±1.
