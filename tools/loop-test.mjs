// The risk/reward loop: the cannon overheats when held and not when tapped; points are multiplied by speed (x1 brake,
// x3 boost). Hazards are placed by hand on an empty road, and the rover can't be hit unless a check needs it to be.
// Usage: node tools/loop-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5243, debugPort: 9413 });
const { evaluate, until, shot, tap, down, up, check, sleep } = t;
const G = 'window.__marsPatrol';
const S = `${G}.scene.getScene('patrol')`;
const hud = () => evaluate(`${G}.registry.get('hudState')`);
// Game seconds, not wall seconds: headless Chrome runs slower than real time, and Phaser steps a fixed 16.7 ms a frame.
const clock = () => evaluate(`${S}.clock`);
const wait = async (sec) => { const end = (await clock()) + sec; await until(async () => (await clock()) >= end, 60000, 20); };

await until(() => evaluate(`${G}.scene.isActive('title')`));
await sleep(400);
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('patrol') && !!${G}.registry.get('hudState')`), 5000);
await sleep(600);
// An empty road, no air waves, and a rover that can't be hit.
const quiet = () => evaluate(`(() => { const s = ${S}; s.clearAll(); s.itemIdx = s.course.items.length; s.pendingDozers = []; s.pendingRollers = []; s.airClock = 999; s.invulnerable = 999; })()`);
await quiet();

// ---- Heat ----
await down('z');
const t0 = await clock();
await until(() => evaluate(`${S}.jam > 0`), 20000, 20).catch(() => {});
const held = (await clock()) - t0;
await up('z');
check('holding fire jams the cannon in about 2 s', held > 1.5 && held < 2.8, `${held.toFixed(2)} s`);
await shot('1-jammed');
check('jammed: no shots for a moment', await evaluate(`${S}.jam > 0.5`));
await until(() => evaluate(`${S}.jam === 0 && ${S}.heat < 0.01`), 20000);
let jammed = false;
for (let i = 0; i < 10; i++) {
  await down('z');
  await wait(0.05);
  await up('z');
  await wait(0.45);
  jammed ||= await evaluate(`${S}.jam > 0`);
}
check('tapping twice a second never jams', !jammed, `heat ${(await evaluate(`${S}.heat`)).toFixed(2)}`);

// ---- Speed multiplier ----
await down('ArrowLeft');
await wait(1);
check('braking: x1', (await hud()).mult === 1);
await up('ArrowLeft');
await down('ArrowRight');
await wait(1);
check('boosting: x3', (await hud()).mult === 3);
await until(() => evaluate(`${S}.jam === 0 && ${S}.heat < 0.3`), 20000);
await evaluate(`(() => { const s = ${S}; s.spawnItem({ kind: 'boulder', x: s.roverX() + 70 }); })()`);
const before = await evaluate(`${S}.score`);
await tap('z', 80);
await until(() => evaluate(`!${S}.ground.some((g) => g.kind === 'boulder')`), 10000).catch(() => {});
const gained = (await evaluate(`${S}.score`)) - before;
check('a boulder shot while boosting scores 100 x 3', gained === 300, `+${gained}`);
await up('ArrowRight');
await wait(1);
check('cruising: x2', (await hud()).mult === 2);

// ---- Mines ----
// Crashes are counted instead of costing a rover.
await evaluate(`(() => { const s = ${S}; window.__crashes = 0; s.crash = () => { window.__crashes++; }; s.invulnerable = 0; })()`);
const mine = () => evaluate(`(() => { const g = ${S}.ground.find((g) => g.kind === 'mine'); return g ? { armed: !!g.armed, fuse: g.fuse ?? null, lift: g.lift ?? 0, d: g.x - ${S}.roverX() } : null; })()`);
const placeMine = (ahead) => evaluate(`(() => { const s = ${S}; s.clearAll(); s.heat = s.jam = 0; s.spawnItem({ kind: 'mine', x: s.roverX() + ${ahead} }); })()`);

await placeMine(100);
await tap('z', 80);
await until(async () => (await mine())?.armed, 10000).catch(() => {});
check('a shot arms a mine', (await mine())?.armed === true);
await until(async () => (await mine())?.lift > 10, 10000).catch(() => {});
await shot('2-mine-leaping');
check('then it leaps', (await mine())?.lift > 10);
await until(async () => !(await mine()), 10000).catch(() => {});
check('and gets a rover that does nothing', (await evaluate('window.__crashes')) === 1, `${await evaluate('window.__crashes')} crashes`);

await evaluate('window.__crashes = 0');
await placeMine(100);
await tap('z', 80);
await until(async () => { const m = await mine(); return m?.armed && m.fuse <= 0; }, 10000).catch(() => {});
await down('ArrowLeft');
await until(async () => !(await mine()), 10000).catch(() => {});
await up('ArrowLeft');
check('braking as it leaps makes it land short', (await evaluate('window.__crashes')) === 0, `${await evaluate('window.__crashes')} crashes`);

await evaluate('window.__crashes = 0');
await wait(1);
await placeMine(110);
await tap('z', 80);
await until(async () => { const m = await mine(); return m?.armed && m.fuse <= 0; }, 10000).catch(() => {});
const score0 = await evaluate(`${S}.score`);
await until(async () => (await mine())?.lift > 20, 10000).catch(() => {});
await down('z');
await until(async () => !(await mine()), 10000).catch(() => {});
await up('z');
const defused = (await evaluate(`${S}.score`)) - score0;
check('shooting a leaping mine down scores 300 x 2 at cruise', defused === 600 && (await evaluate('window.__crashes')) === 0, `+${defused}, ${await evaluate('window.__crashes')} crashes`);

await evaluate('window.__crashes = 0');
await placeMine(120);
const s1 = await evaluate(`${S}.score`);
await until(async () => (await mine())?.d < 30, 10000);
await down('ArrowUp');
await until(async () => !(await mine()) || (await mine()).d < -20, 10000).catch(() => {});
await up('ArrowUp');
check('a mine left alone is just jumped (50 x 2)', (await evaluate(`${S}.score`)) - s1 === 100 && (await evaluate('window.__crashes')) === 0);

// ---- Ice cores: coolant and overdrive ----
await evaluate(`(() => { const s = ${S}; s.clearAll(); s.heat = 0.9; s.jam = 0; s.spawnItem({ kind: 'ice', x: s.roverX() + 30 }); })()`);
await down('ArrowUp');
await until(() => evaluate(`!${S}.ground.some((g) => g.kind === 'ice')`), 10000).catch(() => {});
await up('ArrowUp');
check('an ice core vents the cannon and gives overdrive', await evaluate(`${S}.heat === 0 && ${S}.overdrive > 2`), `heat ${await evaluate(`${S}.heat`)}, overdrive ${await evaluate(`${S}.overdrive`)}`);
await down('z');
await wait(1.5);
await shot('3-overdrive');
check('in overdrive, holding fire doesn\'t heat the cannon', await evaluate(`${S}.heat === 0 && ${S}.jam === 0`));
await up('z');

// ---- The course: 3 set pieces a sector, an intro that shows only the new hazards, a core in every stretch ----
const course = await evaluate(`(async () => {
  const { generateSector } = await import('/src/course.ts');
  const { SECTORS, COURSE } = await import('/src/config.ts');
  const out = [];
  for (let lap = 0; lap < 2; lap++) for (let i = 0; i < SECTORS.length; i++) {
    const c = generateSector(i, lap, 0), sector = SECTORS[i];
    const stretch = (b) => c.items.filter((it) => it.x > (b ? c.beacons[b - 1] : c.startX) && it.x < c.beacons[b]);
    const hazards = (items) => items.filter((it) => !['ice', 'beacon', 'wave'].includes(it.kind));
    const intro = sector.stretches[0] !== 'intro' || hazards(stretch(0)).every((it) => sector.introduces.includes(it.kind === 'mine' && sector.introduces.includes('mine') ? 'mine' : it.kind));
    const cores = c.beacons.map((_, b) => stretch(b).filter((it) => it.kind === 'ice').length);
    const raids = sector.stretches.map((s, b) => s !== 'airRaid' || stretch(b).filter((it) => it.kind === 'wave').length === COURSE.raidWaves);
    out.push({ i, lap, beacons: c.beacons.length, intro, cores, raids: raids.every(Boolean), length: c.endX - c.startX });
  }
  return out;
})()`);
check('every sector has 3 beacons', course.every((c) => c.beacons === 3));
check('each intro shows only that sector\'s new hazards', course.every((c) => c.intro), JSON.stringify(course.filter((c) => !c.intro)));
check('one ice core in every stretch', course.every((c) => c.cores.every((n) => n === 1)), JSON.stringify(course.map((c) => c.cores)));
check('air raids send their waves', course.every((c) => c.raids));
const route = course.filter((c) => c.lap === 0).reduce((sum, c) => sum + c.length, 0);
check('the route takes about 3 min at cruise', route / 75 < 200, `${route} px, ${(route / 75).toFixed(0)} s`);

t.done();
