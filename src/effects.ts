import Phaser from 'phaser';
import { FX, HEIGHT, WIDTH } from './config';

const STREAK = 'fx-streak';
const WHITE = 0xffffff;

/** Slows particles down over their life, so sparks fly out fast and hang in the air. */
class Drag extends Phaser.GameObjects.Particles.ParticleProcessor {
  constructor(private readonly perSecond: number) {
    super(0, 0, true);
  }

  override update(p: Phaser.GameObjects.Particles.Particle, _delta: number, step: number) {
    const k = Math.exp(-this.perSecond * step);
    p.velocityX *= k;
    p.velocityY *= k;
  }
}

export type BurstSize = keyof typeof FX.bursts;

/**
 * Juice for the patrol: neon spark bursts, shockwave rings, a death flash, camera roll and shake in game pixels,
 * plus soft additive glows. Bursts and rings are placed at world x and scroll with the road; glows are drawn in
 * screen space each frame between beginFrame() and update(). No full-screen filters, so it stays cheap on phones.
 */
export class Effects {
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Holds the rings; shifted by -camX so they stay put on the road. */
  private readonly world: Phaser.GameObjects.Container;
  /** Rings that follow something on screen rather than the road. */
  private readonly screen: Phaser.GameObjects.Container;
  private readonly glows: Phaser.GameObjects.Graphics;
  private readonly flash: Phaser.GameObjects.Rectangle;
  /** The camera's resting scroll and zoom; shake jiggles around them. */
  private readonly rest: { x: number; y: number; zoom: number };
  private wobble = { shake: 0, roll: 0, rollPhase: 0 };
  // The next burst's settings, read by the emitter's onEmit callbacks.
  private palette = [WHITE];
  private speed = 100;
  private life = 400;
  private spread = { from: 0, range: 360 };

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists(STREAK)) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(WHITE).fillRect(0, 0, 4, 1);
      g.generateTexture(STREAK, 4, 1);
      g.destroy();
    }
    this.world = scene.add.container(0, 0).setDepth(12);
    this.screen = scene.add.container(0, 0).setDepth(12);
    this.glows = scene.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.flash = scene.add.rectangle(0, 0, WIDTH, HEIGHT, WHITE).setOrigin(0).setDepth(30).setAlpha(0);

    let angle = 0;
    this.sparks = scene.add.particles(0, 0, STREAK, {
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
      // rotate is worked out before angle, so it picks the direction and angle reuses it: each streak points where it flies.
      rotate: { onEmit: () => (angle = this.spread.from + Math.random() * this.spread.range) },
      angle: { onEmit: () => angle },
      speed: { onEmit: () => this.speed * (0.25 + Math.random() * 0.75) },
      lifespan: { onEmit: () => this.life * (0.5 + Math.random() * 0.5) },
      tint: { onEmit: () => Phaser.Utils.Array.GetRandom(this.palette) },
      scaleX: { start: 1.6, end: 0.3 },
      scaleY: 1,
      alpha: { start: 1, end: 0 },
    }).setDepth(13);
    this.sparks.addParticleProcessor(new Drag(4));

    const cam = scene.cameras.main;
    this.rest = { x: cam.scrollX, y: cam.scrollY, zoom: cam.zoom };
  }

  /** An explosion at world x: sparks in the given colours, a shockwave ring (two for big ones) and a shake. */
  burst(wx: number, y: number, colors: number[], size: BurstSize = 'small') {
    const b = FX.bursts[size];
    this.emit(wx, y, b.sparks, [...colors, ...colors, WHITE], b.speed, b.life);
    this.ring(wx, y, colors[0], b.ring, b.life * 0.7);
    if (size !== 'small') this.ring(wx, y, WHITE, b.ring * 0.6, b.life * 0.5);
    this.wobble.shake = Math.max(this.wobble.shake, b.shake);
  }

  /** The rover's death: the biggest burst, a brief white flash and a camera roll. */
  death(wx: number, y: number, colors: number[]) {
    this.burst(wx, y, colors, 'huge');
    this.scene.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(FX.deathFlash);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: 220, ease: 'Quad.out' });
    this.wobble.roll = FX.deathRoll;
    this.wobble.rollPhase = 0;
  }

  /** A hit that doesn't kill: a few sparks spray back the way the shot came (`fromDeg` is the shot's heading). */
  hit(wx: number, y: number, color: number, fromDeg: number) {
    this.emit(wx, y, 4, [color, WHITE], 110, 260, fromDeg + 180 - 50, 100);
  }

  /** A celebration or a puff: sparks and a ring, with no shake. */
  pop(wx: number, y: number, colors: number[], sparks: number) {
    this.emit(wx, y, sparks, [...colors, WHITE], 110, 480);
    this.ring(wx, y, colors[0], 8 + sparks / 3, 400);
  }

  /** Something arriving at screen (x, y), such as the rover on respawn: a ring that closes in. */
  implode(x: number, y: number, color: number, radius = 30, ms = 650) {
    this.ring(x, y, color, radius, ms, true, this.screen);
  }

  /** Clears last frame's glows. Call before drawing, then glow() for each bright thing. */
  beginFrame() {
    this.glows.clear();
  }

  /** A soft halo at screen (x, y): three stacked circles, brightest in the middle. */
  glow(x: number, y: number, radius: number, color: number, strength = 1) {
    if (!FX.glow.enabled) return;
    const a = (FX.glow.alpha * strength) / 3;
    this.glows.fillStyle(color, a).fillCircle(x, y, radius).fillCircle(x, y, radius * 0.62).fillCircle(x, y, radius * 0.3);
  }

  /** Nothing from before a respawn or continue carries over. */
  clear() {
    this.sparks.killAll();
    for (const layer of [this.world, this.screen]) {
      for (const r of layer.list) this.scene.tweens.killTweensOf(r);
      layer.removeAll(true);
    }
    this.wobble.shake = 0;
  }

  update(camX: number, dt: number) {
    this.sparks.x = -camX;
    this.world.x = -camX;
    const w = this.wobble;
    w.roll *= Math.exp(-3 * dt);
    w.rollPhase += dt * 22;
    w.shake *= Math.exp(-7 * dt);
    if (w.shake < 0.05) w.shake = 0;
    const cam = this.scene.cameras.main;
    const rotation = w.roll > 0.0005 ? w.roll * Math.sin(w.rollPhase) : 0;
    cam.setRotation(rotation);
    cam.setScroll(this.rest.x + (Math.random() * 2 - 1) * w.shake, this.rest.y + (Math.random() * 2 - 1) * w.shake);
    // The road ends at the screen edges, so zoom in just enough that a roll or shake never shows past them.
    cam.setZoom(this.rest.zoom * (1 + Math.abs(rotation) * (WIDTH / HEIGHT + 0.1) + (2 * w.shake) / HEIGHT));
  }

  private emit(wx: number, y: number, count: number, palette: number[], speed: number, life: number, from = 0, range = 360) {
    this.palette = palette;
    this.speed = speed;
    this.life = life;
    this.spread = { from, range };
    // The emitter sits at -camX, so particle positions are in world x.
    this.sparks.explode(count, wx, y);
  }

  private ring(x: number, y: number, color: number, radius: number, ms: number, inward = false, layer = this.world) {
    const g = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    layer.add(g);
    const t = { p: 0 };
    this.scene.tweens.add({
      targets: t, p: 1, duration: ms, ease: inward ? 'Quad.in' : 'Quad.out',
      onUpdate: () => {
        const r = inward ? radius * (1 - t.p) + 1 : 2 + radius * t.p;
        g.clear().lineStyle(inward ? 1 : 2 - t.p, color, 1 - t.p * (inward ? 0.3 : 1)).strokeCircle(x, y, r);
      },
      onComplete: () => g.destroy(),
    });
  }
}
