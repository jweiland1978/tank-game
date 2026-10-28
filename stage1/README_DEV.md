# Iron Rig — Stage 1

Static canvas game. Open `index.html` from a local server (relative URLs only). Every module import and the stylesheet carry `?v=1`. Bump that query when you ship a new stage so caches drop.

```
python3 -m http.server 8881 --bind 127.0.0.1
```

## Layout

- `js/config.js` — `GAME_TITLE`, world size, gravity, wind scale, tank body, palette, seeded RNG.
- `js/weapons.js` — `WEAPONS` data. The engine branches on `behavior`.
- `js/terrain.js` — column heightmap, round carve / mound, offscreen dirt texture, background ridges.
- `js/physics.js` — fixed-step flight (`flyStep`) and the same integrator for AI trials.
- `js/fx.js` — capped particles, fireballs, shake, flash. `prefers-reduced-motion` cuts shake, flash, and particle counts.
- `js/audio.js` — Web Audio synth. Mute flag is `localStorage["ironrig-muted"]`.
- `js/ai.js` — chunked angle/power search, then a 0.6s barrel turn.
- `js/ui.js` — DOM screens and HUD. `document.body.dataset.screen` mirrors the screen.
- `js/main.js` — state, turn loop, `window.__game`.

Simulation is 120 Hz. `setSpeed(n)` runs `round(n * 2)` steps per frame so 1× matches a 60 fps display.

The view scales the 1600×900 world to the screen width and pins the ground to the bottom edge, so the dirt reaches the left, right, and bottom on phone, tablet, and laptop. Extra space above the world is sky. Camera shake is clamped and the terrain is overdrawn past the edges so a blast never shows a gap. Blasts are stacks of pre-rendered fire puffs in `fx.js` (cap 2000 particles). A non-pop explosion blocks the next turn for 0.5s of sim time. The winner card waits 1.8s of sim time after the last kill. Craters are circular bowls. A dirt mound eases in over 0.3s via `terrain.tick`; `terrain.busy()` holds the turn until it finishes. Dead tanks are drawn as wrecks from tank state, not from the particle list, so a finished round can still decay `particles`.

## Add a weapon

1. Push a plain object onto `WEAPONS` (`id`, `name`, `price`, `ammoDefault`, `radius`, `damage`, `color`, `trail`, `behavior`, plus any extra numbers).
2. If `behavior` is new, handle it in `impact()` / the projectile step in `main.js` (`onImpact` / `onUpdate` / `onSplit` live there so weapons stay data).
3. `standard` explodes. `cluster` splits when vertical velocity changes sign. `dirt` calls `terrain.addMound`. Ammo `Infinity` shows as ∞ and is omitted from the JSON state as `null`.

Do not add the weapon to the list until it should be selectable. `weaponIds()` is that list.

## Hazards (napalm and anything that burns over time)

`hazards` is a list on the live state (`state().hazards` is the count). Each item is a plain object:

- `type`, `x`, `y`, `radius`, `dps`, `ttl`
- `flow: true` plus `flowSpeed` — each step, compare `terrainHeightAt(x-3)` and `x+3` (y grows downward, so the larger height is downhill) and slide that way, then pin `y` to the surface.

`updateHazards` applies `dps * dt` to tanks inside `radius`, spawns a few fire puffs for `type === 'napalm'`, and drops the item at `ttl <= 0`. The turn stays in `settle` until `hazards` is empty (and shells, falling tanks, and blocking explosion frames are done).

Stage 2 napalm is a commented object in `weapons.js` with `behavior: 'napalm'`. Wiring it means uncommenting that object into `WEAPONS` and calling `spawnNapalm` from `impact` (the helper is already in `main.js`). Nukes are a `standard` shell with a large radius. Rollers should be a behavior that, on impact, becomes a body whose `onUpdate` walks the surface until a fuse expires.
