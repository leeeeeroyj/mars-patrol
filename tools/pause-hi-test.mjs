// Pause and high score: P, Start (the pad), Esc and the page going to the background pause the patrol; P or Enter
// resumes; Esc from the pause menu goes to the title. A run's score becomes the high score (mars-patrol-hi), shown on
// the title and the game-over banner, and a lower score doesn't replace it.
// Usage: node tools/pause-hi-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5242, debugPort: 9412 });
const { evaluate, until, shot, tap, check, sleep } = t;
const G = 'window.__marsPatrol';
const S = `${G}.scene.getScene('patrol')`;
const camX = () => evaluate(`${S}.camX`);
const start = async () => {
  await until(() => evaluate(`${G}.scene.isActive('title')`));
  await sleep(400);
  await tap('Enter');
  await until(() => evaluate(`${G}.scene.isActive('patrol') && !!${G}.registry.get('hudState')`), 5000);
  await sleep(600);
};

await until(() => evaluate(`!!${G}`));
await evaluate(`localStorage.clear()`);
await start();

// ---- Pause ----
await tap('p');
await sleep(100);
const a = await camX();
await sleep(600);
check('P pauses: the road stops', (await evaluate(`${S}.paused`)) && (await camX()) === a);
check('the pause panel shows', await evaluate(`${G}.scene.getScene('hud').pauseMenu.visible`));
await shot('1-paused');
await tap('p');
await sleep(400);
check('P again resumes', !(await evaluate(`${S}.paused`)) && (await camX()) > a);
await tap('Escape');
await sleep(100);
check('Esc pauses too', await evaluate(`${S}.paused`));
await tap('Enter');
await sleep(100);
check('Enter resumes', !(await evaluate(`${S}.paused`)));
await evaluate(`Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange'))`);
await sleep(100);
check('the page going to the background pauses', await evaluate(`${S}.paused`));
// Phaser's own loop sleeps on the same event: wake it.
await evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))`);
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title')`), 3000).catch(() => {});
check('Esc from the pause menu goes to the title', await evaluate(`${G}.scene.isActive('title') && !${G}.scene.isActive('hud')`));
await sleep(300);

// ---- High score ----
await start();
check('a run started after leaving from pause is not paused, and its clock and tweens run', !(await evaluate(`${S}.paused || ${S}.time.paused || ${S}.tweens.paused`)));
await evaluate(`(() => { const s = ${S}; s.score = 1234; s.lives = 1; s.invulnerable = 0; s.crash(); })()`);
await until(() => evaluate(`${S}.over`), 5000);
await sleep(300);
await shot('2-new-high');
check('game over saves the high score', (await evaluate(`localStorage.getItem('mars-patrol-hi')`)) === '1234');
check('the banner says NEW HIGH SCORE!', await evaluate(`${G}.scene.getScene('hud').bannerTitle.text === 'NEW HIGH SCORE!'`));
await sleep(700);
await tap('Enter');
await until(() => evaluate(`!${S}.over`), 3000);
await sleep(400);
await evaluate(`(() => { const s = ${S}; s.score = 500; s.lives = 1; s.invulnerable = 0; s.crash(); })()`);
await until(() => evaluate(`${S}.over`), 5000);
await sleep(300);
check('a lower score leaves it alone', (await evaluate(`localStorage.getItem('mars-patrol-hi')`)) === '1234');
{ const sub = await evaluate(`${G}.scene.getScene('hud').bannerSub.text`); check('and the banner shows the high score', sub.includes('HI 1,234'), sub); }
await sleep(700);
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title')`), 3000);
await sleep(400);
await shot('3-title');
check('the title shows HI', await evaluate(`${G}.scene.getScene('title').children.list.some((o) => o.text === 'HI 1,234')`));
t.done();
