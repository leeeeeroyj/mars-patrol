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

## Status (2026-11-13)

**v1 is complete.** All seven milestones are done, and the game is deployed to GitHub Pages from `leeeeeroyj/mars-patrol`.

- **Milestones 1–4:** the playable core, the full roster, and the course structure (sectors, beacons, par, Dusk laps, continue).
- **Milestone 5, HUD and feedback:** lamps, route strip, banners, sound, debris, dust. `src/effects.ts` (tunables in `FX` in `config.ts`) adds additive spark bursts with shockwave rings (two rings for big kills), pops for cancelled shots, ice cores and beacons, a white flash and camera roll on death, a ring that closes in at respawn, and soft glows under bright things. There's no full-screen bloom. With a burst every 150 ms, headless Chrome holds 40 fps, the same as idle.
- **Milestone 6, touch and mobile:** four touch buttons, the side-bar layout, the portrait overlay, and tappable SOUND / CONTINUE / TITLE. Tested with CDP touch emulation (844×390), then on a real phone, where it works.
- **Milestone 7, polish:** README with a staged hero screenshot (retaken with the effects), MIT licence (GitHub detects it as MIT), sprite dataset credit, repo settings per playbook C5. Balance pass below.

**Balance pass (2026-11-13)**
- **Survey drones hover over the rover.** Each of the three now hovers around its own screen x (`ENEMY.scout.hoverX`: 150, 120, 90) instead of 300 / 237 / 174, which kept them far ahead. The rover can reach them across brake to boost. Before: in reach about 4% of the time, about 0.14 pellets per wave falling on the rover. After: about 15% and about 0.8.
- **Mine pairs are spaced 56 apart (`COURSE.mineFieldGap`), up from 20.** The old pair could never be cleared at brake, and at cruise the takeoff window was about 0.07 s. Now, at brake or cruise, any jump that clears the first mine leaves room to clear the second. At boost about half do, so boosting through a pair is a risk.
- **Every layout checked:** a script ran the real course generator and the scene's collision rules for all 5 sectors across 4 laps, at brake, cruise and boost, with harvesters crawling. With shooting allowed, all 20 layouts can be cleared at all three speeds. Some can only be cleared at brake or cruise by shooting a boulder or harvester, and that's intended. The script doesn't model dozers, shells or air attacks.
- **Left as they were:** par (5,500 px at 88 px/s, so 63 s; cruise takes 73 s, full boost 50 s), extra rovers at 10k / 30k / 60k, and the Dusk ramp (+25% machine speed per lap, gaps × 0.82). Adjust them once there's play data.
- **Verified** in headless Chrome (CDP), 7/7 checks: drones come within reach, all three shot down at cruise with real key presses, a mine pair cleared at brake (two jumps) and at cruise (jump held), game over and continue, no exceptions.

**Earlier design changes**
- The relay satellite glides in, hangs over the rover flashing, then plunges. An arc aimed at the rover could only be shot once it was already on top of it.
- The camera zooms in slightly while it rolls or shakes. Without that, the death roll showed black wedges past the road's ends.

**Decided**
- **Dusk laps:** each lap is laid out from a new seed (the seed includes the lap), and a retry within a lap repeats its layout. You chose to keep this.
- **The name:** keep "Mars Patrol". It's a non-commercial hobby game with no plans to monetize.
- **Account security:** the GitHub account signs in with a passkey.

**Next (post-v1, pick any):** a high-score table, rolling boulders, dust storms that cut visibility, a boss at Olympus, music. Bring the balance numbers above back in when real play shows a problem.

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

None for v1. The name and the Dusk lap layout are settled (see Status).
