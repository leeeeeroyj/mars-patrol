# Mars Patrol: build plan

Side-scrolling rover patrol re-imagined from Irem's *Moon Patrol* (1982). Concept and picks: `design/concept-sheet.html`.

## Scope

**v1**
- One patrol route: 5 sectors × 5 beacons (Chryse Flats, Ares Vallis, Tharsis Rise, Noctis Labyrinth, Olympus Approach), then the same route at Dusk, harder each lap.
- Rover: auto-scroll with brake/boost, jump, dual fire (forward + up).
- Roster: survey drone, grader saucer (charges blast craters), relay satellite (diving arc), boulder (small and big), seed charge, harvester (shells cancel your shot), dozer (from behind), ice core, relay beacon.
- Par-time sector bonus, route bonus, extra rovers at 10k / 30k / 60k, respawn at the last beacon, continue from the sector start with score reset.
- HUD: score, rovers, beacon, sector clock, AIR / MINE / REAR lamps, route strip.
- Keyboard + mouse, controller, touch. Procedural sound. Deployed to GitHub Pages.

**Later**
- High-score table, rolling boulders, dust storms that cut visibility, a boss at Olympus, music.

## Architecture

Vite 8 + Phaser 4 + TypeScript, copied from Space Raider (`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, deploy workflow). `assets/` is Vite's public dir, so `tools/sprites.py build` output is live.

| Module | Source | What |
|---|---|---|
| `config.ts` | new | Every tunable: sizes, speeds, jump, points, sector table, colours. Mirror flags for sprites. |
| `controls.ts` | rewritten from Space Raider | Brake/boost, jump, fire, menu keys; keyboard + mouse, controller, touch; last-used device for hints. |
| `touch.ts` | adapted | Four buttons instead of two sticks; same side-bar layout on wide phones. |
| `sfx.ts` | copied | Same synth, new sound list, own mute key. |
| `view.ts` | copied | Camera fit at 4× (game) and 2× (HUD). |
| `course.ts` | new | Seeded course generator: hazards per beacon segment, from each sector's allowed list, spaced so every jump is fair. Par time from segment length. |
| `backdrop.ts` | new | Sky, sun and moons, four parallax layers and the road, baked to tileable canvas textures and scrolled as TileSprites. Craters drawn per frame. |
| `scenes/TitleScene.ts` | new | Title, legend, controls, start. |
| `scenes/PatrolScene.ts` | new | The game: scroll, rover, hazards, collisions, scoring, respawn, game over. Writes HUD state to the registry. |
| `scenes/HudScene.ts` | new | Top bar, lamps, route strip, hint strip, sound toggle, at 2× so 16 px icons show at half size. |

The game camera doesn't scroll. The scene keeps `camX` (distance driven) and places world things at `x - camX`, which keeps the HUD, air enemies (screen space) and parallax simple.

## Status (2026-11-12)

- **Done, not yet committed:** milestones 1–4, plus sound (from 5) and touch buttons (from 6).
- **Verified:** headless CDP suite, 16/16 checks: crater crash and jump, boulder kill, shell cancelling, dozer jump and kill, REAR lamp, satellite shot down, saucer craters, sector bonus maths, route bonus and Dusk lap, game over and continue, no exceptions. A touch run on an emulated 844×390 phone covered boost, fire and jump.
- **Design change:** the relay satellite now glides in, hangs over the rover (flashing), then plunges. An arc aimed at the rover could only be shot once it was already on top of it.
- **Next:** milestone 5 juice (shockwaves, bloom-free glow), a balance pass, then a real phone (6) and the README (7).

## Milestones

Each ends playable. After each one: verify, show, wait for the go-ahead before committing or pushing.

1. **Skeleton.** Project files, title scene, backdrop scrolling, the rover on the road, deploy workflow.
   *Verify:* `npm run build` passes; headless screenshot shows title, then the road scrolling.
2. **First playable.** Brake/boost, jump, dual fire, craters, boulders, survey drones, collisions, score, lives, respawn.
   *Verify:* CDP test drives the rover into a crater (life lost), jumps one (no loss), shoots a boulder (score up).
3. **Full roster.** Saucer + crater charges, relay satellite, seed charges, harvester + shell cancelling, dozer, ice cores.
   *Verify:* a debug spawn per type; screenshot each; CDP checks shell cancel and dozer jump scoring.
4. **Structure.** Course generator, 5 sectors, beacons, par bonus, route bonus, Dusk lap, extra rovers, game over, continue.
   *Verify:* run the course with a test hook that skips to each sector; check bonus maths and respawn point.
5. **HUD and feedback.** Lamps, route strip, banners, sound, sparks, shockwaves, shake in game pixels, dust.
   *Verify:* screenshots; frame time with effects on in headless Chrome (bloom off if added).
6. **Touch and mobile.** Four buttons, side bars on wide phones, landscape overlay, tappable sound and game-over buttons.
   *Verify:* CDP with touch emulation; then a real phone.
7. **Polish.** Balance pass, README with screenshot, MIT licence, credit the sprite dataset.

## Testing

Headless Chrome via CDP, driving real key, mouse and touch events. Dev builds expose the game as `window.__marsPatrol`. Screenshots at key moments. Real phone before touch is called done.

## Open questions

- **The name.** "Mars Patrol" is already the title of a rover game (MobyGames), and it's one word from *Moon Patrol*. You chose to keep it for a non-commercial project; revisit before any public promotion.
- GitHub repo name and Pages URL: `leeeeeroyj/mars-patrol`?
- Should Dusk laps keep the same layout (learnable, like the original) or reseed each lap?
