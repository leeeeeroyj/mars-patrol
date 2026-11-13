import Phaser from 'phaser';
import {
  COURSE, DEBRIS, DUSK_SPEEDUP, ENEMY, FONT, GROUND_Y, HUD_H, HUD_STATE, MIRROR, POINTS, RENDER_SCALE, ROVER, SCORING, SECTORS, SHOT,
  TEXT, WIDTH, COLORS, type AirKind, type SpriteKey,
} from '../config';
import { Backdrop } from '../backdrop';
import { Controls, type ControlState } from '../controls';
import { Effects } from '../effects';
import { generateSector, rng, type CourseItem, type SectorCourse } from '../course';
import { playSound, toggleMute } from '../sfx';
import { touchButtons } from '../touch';
import { fitCamera } from '../view';
import type { Banner, HudState } from './HudScene';

type GroundThing = {
  kind: 'boulder' | 'mine' | 'harvester' | 'dozer' | 'ice' | 'beacon';
  x: number;
  img: Phaser.GameObjects.Image;
  hp: number;
  big?: boolean;
  /** Dozer: still behind the rover. */
  behind?: boolean;
  passed?: boolean;
  cool?: number;
  flash?: number;
  dead?: boolean;
};
/** Air things live in screen space: they fly over the road rather than sit on it. */
type AirThing = {
  kind: 'scout' | 'bomber' | 'diver';
  x: number; y: number; t: number;
  img: Phaser.GameObjects.Image;
  hx?: number; hy?: number; hoverX?: number; phase?: number; cool?: number; left?: number; vy?: number;
  dead?: boolean;
};
type Crater = { x: number; w: number; fresh: number };
/** Forward shot (world x) and upward shot (screen x). `px`/`py` are last frame's positions, for swept hits. */
type Shot = { x: number; px: number; y: number; start: number; dead?: boolean };
type UpShot = { sx: number; y: number; py: number; dead?: boolean };
type Shell = { x: number; px: number; dead?: boolean };
type Drop = { sx: number; y: number; vy: number; kind: 'pellet' | 'charge'; dead?: boolean };
type Popup = { text: Phaser.GameObjects.Text; x: number };

const PX = 'fx-px';
const pts = (n: number) => n.toLocaleString('en-US');
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class PatrolScene extends Phaser.Scene {
  private controls!: Controls;
  private backdrop!: Backdrop;
  private dyn!: Phaser.GameObjects.Graphics;
  private rover!: Phaser.GameObjects.Image;
  private debris!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fx!: Effects;
  private palette = DEBRIS.dust as number[];

  // Run state, all reset in create() (scene.restart reuses this instance).
  private camX = 0;
  private speed: number = ROVER.cruise;
  private roverY = 0;
  private roverVy = 0;
  private landed = 0;
  private clock = 0;
  private score = 0;
  private lives = ROVER.lives;
  private extraIdx = 0;
  private lap = 0;
  private course!: SectorCourse;
  private itemIdx = 0;
  private pendingDozers: number[] = [];
  private beaconsPassed = 0;
  private respawnX = 0;
  private sectorTime = 0;
  private airClock = 0;
  private airRand = rng(1);
  private fireCool = 0;
  private deadFor = 0;
  private invulnerable = 0;
  private over = false;
  private overAt = 0;
  private banner: Banner = { id: 0, title: '', sub: '', ms: 0 };
  private lampWas = { air: false, mine: false, rear: false };

  private ground: GroundThing[] = [];
  private air: AirThing[] = [];
  private craters: Crater[] = [];
  private shots: Shot[] = [];
  private ups: UpShot[] = [];
  private shells: Shell[] = [];
  private drops: Drop[] = [];
  private popups: Popup[] = [];

  constructor() {
    super('patrol');
  }

  create() {
    Object.assign(this, {
      camX: 0, speed: ROVER.cruise, roverY: 0, roverVy: 0, landed: 0, clock: 0, score: 0, lives: ROVER.lives, extraIdx: 0, lap: 0,
      itemIdx: 0, pendingDozers: [], beaconsPassed: 0, respawnX: 0, sectorTime: 0, airClock: 4, airRand: rng(Date.now()),
      fireCool: 0, deadFor: 0, invulnerable: 0, over: false, overAt: 0, banner: { id: 0, title: '', sub: '', ms: 0 },
      lampWas: { air: false, mine: false, rear: false },
      ground: [], air: [], craters: [], shots: [], ups: [], shells: [], drops: [], popups: [],
    });
    fitCamera(this, RENDER_SCALE);
    this.scene.launch('hud');
    if (!this.textures.exists(PX)) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0xffffff).fillRect(0, 0, 2, 2);
      g.generateTexture(PX, 2, 2);
      g.destroy();
    }
    this.backdrop = new Backdrop(this, 0);
    this.dyn = this.add.graphics().setDepth(2);
    this.fx = new Effects(this);
    this.rover = this.sprite('player', 0, 0).setDepth(10);
    this.debris = this.add.particles(0, 0, PX, {
      emitting: false,
      speed: { onEmit: () => 20 + Math.random() * 90 },
      angle: { onEmit: () => 180 + Math.random() * 180 },
      lifespan: { onEmit: () => 350 + Math.random() * 450 },
      tint: { onEmit: () => Phaser.Utils.Array.GetRandom(this.palette) },
      gravityY: 160,
      alpha: { start: 1, end: 0 },
    }).setDepth(14);

    this.controls = new Controls(this);
    touchButtons.show(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => touchButtons.show(false));
    this.events.on('continue', () => this.continueRun());
    this.events.on('title', () => this.toTitle());
    this.startSector(0, 0, 0);
    this.cameras.main.fadeIn(250);
    if (import.meta.env.DEV) Object.assign(window, { __patrol: this });
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (this.over) {
      if (this.time.now - this.overAt > 800) {
        if (input.confirm) this.continueRun();
        else if (input.back) this.toTitle();
      }
    } else this.step(dt, input);
    this.draw();
    this.fx.update(this.camX, dt);
    this.writeHud(input);
  }

  // ---- Course ----

  private startSector(index: number, lap: number, startX: number) {
    this.course = generateSector(index, lap, startX);
    this.itemIdx = 0;
    this.pendingDozers = [];
    this.beaconsPassed = 0;
    this.respawnX = startX;
    this.sectorTime = 0;
    this.backdrop.setLook(SECTORS[index].look, lap > 0 ? 'dusk' : 'day');
    const shift = lap > 0 ? `DUSK SHIFT${lap > 1 ? ` ${lap}` : ''}  ·  ` : '';
    this.showBanner(`SECTOR ${index + 1}  ·  ${SECTORS[index].name}`, `${shift}PAR ${fmt(this.course.par)}`, 2600);
  }

  /** Puts course items on the road as they come within reach. */
  private spawnAhead() {
    const items = this.course.items;
    while (this.itemIdx < items.length && items[this.itemIdx].x < this.camX + WIDTH + 200) this.spawnItem(items[this.itemIdx++]);
    // A dozer's x is where it overtakes you, so it starts behind the rover a little before that.
    const rx = this.roverX();
    while (this.pendingDozers.length && rx >= this.pendingDozers[0] - 60) {
      this.pendingDozers.shift();
      this.ground.push({ kind: 'dozer', x: this.camX - 24, img: this.sprite('dozer', -50, 0), hp: 1, behind: true });
    }
  }

  private spawnItem(item: CourseItem) {
    // After a respawn, things already behind the rover are scenery: no points for "clearing" them.
    const behind = item.x < this.roverX();
    const add = (kind: GroundThing['kind'], extra: Partial<GroundThing> = {}) =>
      this.ground.push({ kind, x: item.x, img: this.sprite(kind, -50, 0), hp: 1, passed: behind, ...extra });
    if (item.kind === 'dozer' && item.x < this.roverX() + 60) return;
    switch (item.kind) {
      case 'crater': this.craters.push({ x: item.x, w: item.w ?? 24, fresh: 0 }); break;
      case 'boulder': add('boulder'); break;
      case 'bigBoulder': add('boulder', { hp: 2, big: true }); break;
      case 'harvester': add('harvester', { cool: 0.8 }); break;
      case 'dozer': this.pendingDozers.push(item.x); break;
      default: add(item.kind);
    }
  }

  private dusk() {
    return 1 + DUSK_SPEEDUP * this.lap;
  }

  private spawnAir(kind: AirKind) {
    if (kind === 'scouts') {
      for (let i = 0; i < 3; i++) {
        this.air.push({ kind: 'scout', x: 440 + i * 26, y: 80, t: 0, hx: 440 + i * 26, hy: 70 + i * 16, hoverX: ENEMY.scout.hoverX[i], phase: i * 2.1, cool: 1 + i * 0.6, img: this.sprite('scout', -50, 0) });
      }
    } else if (kind === 'bomber') {
      this.air.push({ kind: 'bomber', x: 440, y: ENEMY.bomber.y, t: 0, cool: 1.4, left: ENEMY.bomber.charges, img: this.sprite('bomber', -50, 0) });
    } else {
      this.air.push({ kind: 'diver', x: 430, y: 26, t: 0, phase: 0, vy: 0, img: this.sprite('diver', -50, 0) });
    }
  }

  // ---- Simulation ----

  private roverSX() {
    return ROVER.screenX + (Math.max(this.speed, ROVER.minSpeed) - ROVER.minSpeed) * ROVER.slide;
  }

  private roverX() {
    return this.camX + this.roverSX();
  }

  private step(dt: number, input: ControlState) {
    this.clock += dt;
    this.sectorTime += dt;
    const alive = this.deadFor <= 0;
    const target = !alive ? 0 : input.dir > 0 ? ROVER.maxSpeed : input.dir < 0 ? ROVER.minSpeed : ROVER.cruise;
    const accel = alive ? ROVER.accel : 140;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), accel * dt);
    this.camX += this.speed * dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (!alive) {
      this.deadFor -= dt;
      if (this.deadFor <= 0) {
        if (this.lives <= 0) this.gameOver();
        else this.respawn();
      }
    }
    const rx = this.roverX(), sx = this.roverSX(), dusk = this.dusk();

    // Jump and land
    if (input.jump && this.roverY === 0 && this.deadFor <= 0) {
      this.roverVy = ROVER.jumpSpeed;
      this.roverY = 0.01;
      playSound(this, 'jump');
    }
    if (this.roverY > 0) {
      this.roverVy -= ROVER.gravity * dt;
      this.roverY += this.roverVy * dt;
      if (this.roverY <= 0) {
        this.roverY = 0;
        this.roverVy = 0;
        this.landed = 0.15;
        this.burst(rx, GROUND_Y, DEBRIS.dust, 6);
        playSound(this, 'land', { volume: 0.6 });
      }
    }
    this.landed = Math.max(0, this.landed - dt);
    if (this.deadFor <= 0 && this.roverY === 0 && Math.random() < this.speed / 300) this.burst(rx - 9, GROUND_Y - 2, DEBRIS.dust, 1);

    // Fire: one press sends a forward shot (only one in flight) and an upward shot.
    this.fireCool -= dt;
    if (input.fire && this.fireCool <= 0 && this.deadFor <= 0) {
      this.fireCool = SHOT.cooldown;
      const y = GROUND_Y - 7 - this.roverY;
      if (!this.shots.length) this.shots.push({ x: rx + 9, px: rx + 9, y, start: rx + 9 });
      if (this.ups.length < SHOT.maxUp) this.ups.push({ sx, y: GROUND_Y - 16 - this.roverY, py: GROUND_Y - 16 - this.roverY });
      playSound(this, 'shot');
    }
    for (const s of this.shots) { s.px = s.x; s.x += (this.speed + SHOT.forwardSpeed) * dt; }
    this.shots = this.shots.filter((s) => s.x - s.start < SHOT.range);
    for (const u of this.ups) { u.py = u.y; u.y -= SHOT.upSpeed * dt; }
    this.ups = this.ups.filter((u) => u.y > HUD_H);

    this.spawnAhead();
    const sector = SECTORS[this.course.index];
    if (this.deadFor <= 0 && this.invulnerable <= 0.5) this.airClock -= dt;
    if (this.airClock <= 0) {
      this.spawnAir(sector.air[Math.floor(this.airRand() * sector.air.length)]);
      this.airClock = sector.airEvery / dusk;
    }

    this.stepGround(dt, rx, sx, dusk);
    this.stepAir(dt, sx, dusk);
    this.stepDrops(dt, sx);
    this.collideRover(rx);
    this.passThings(rx);

    for (const c of this.craters) c.fresh = Math.max(0, c.fresh - dt);
    this.craters = this.craters.filter((c) => c.x + c.w > this.camX - 10);
    this.lamps();
  }

  private stepGround(dt: number, rx: number, sx: number, dusk: number) {
    for (const g of this.ground) {
      g.flash = Math.max(0, (g.flash ?? 0) - dt);
      if (g.kind === 'harvester') {
        g.x -= ENEMY.harvester.speed * dusk * dt;
        g.cool = (g.cool ?? 0) - dt;
        const gs = g.x - this.camX;
        if (g.cool <= 0 && gs < WIDTH - 8 && gs > sx + 30) {
          this.shells.push({ x: g.x - 9, px: g.x - 9 });
          g.cool = ENEMY.harvester.fireEvery / dusk;
          playSound(this, 'shell');
        }
      }
      if (g.kind === 'dozer') {
        g.x += (this.speed + (g.behind ? ENEMY.dozer.catchUp : ENEMY.dozer.ahead)) * dt;
        if (g.behind && g.x > rx + 12) {
          g.behind = false;
          if (this.deadFor <= 0) this.addScore(POINTS.dozer.jump, rx, GROUND_Y - 30);
        }
      }
    }
    for (const s of this.shells) { s.px = s.x; s.x -= ENEMY.harvester.shellSpeed * dusk * dt; }

    // Forward shots: a shell cancels a shot; otherwise boulders, harvesters and dozers ahead take the hit.
    for (const s of this.shots) {
      for (const sh of this.shells) {
        if (sh.dead || s.dead) continue;
        const crossed = Math.sign(s.px - sh.px) !== Math.sign(s.x - sh.x) || Math.abs(s.x - sh.x) < 4;
        if (crossed) {
          sh.dead = s.dead = true;
          this.burst(s.x, s.y, [COLORS.tech, COLORS.shot], 6);
          this.fx.pop(s.x, s.y, [COLORS.tech, COLORS.shot], 6);
          playSound(this, 'cancel');
        }
      }
      for (const g of this.ground) {
        if (s.dead || g.dead || !['boulder', 'harvester', 'dozer'].includes(g.kind) || g.behind) continue;
        if (s.px <= g.x + 8 && s.x >= g.x - 8) {
          s.dead = true;
          g.hp -= 1;
          g.flash = 0.12;
          if (g.hp <= 0) this.destroyGround(g);
          else {
            this.fx.hit(g.x - 8, s.y, COLORS.rust, 0);
            playSound(this, 'cancel');
          }
        }
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);
    this.shells = this.shells.filter((s) => !s.dead && s.x > this.camX - 20);
    for (const g of this.ground) {
      const gone = g.dead || g.x < this.camX - 40 || (g.kind === 'dozer' && !g.behind && g.x > this.camX + WIDTH + 40);
      if (gone) g.img.destroy();
    }
    this.ground = this.ground.filter((g) => g.img.active);
  }

  private destroyGround(g: GroundThing) {
    g.dead = true;
    const rock = g.kind === 'boulder';
    this.burst(g.x, GROUND_Y - 8, rock ? DEBRIS.rock : DEBRIS.machine, rock ? 16 : 22);
    this.fx.burst(g.x, GROUND_Y - 8, rock ? DEBRIS.rock : DEBRIS.machine, rock && !g.big ? 'small' : 'big');
    const points = rock ? (g.big ? POINTS.boulder.bigKill : POINTS.boulder.kill) : g.kind === 'harvester' ? POINTS.harvester.kill : POINTS.dozer.kill;
    this.addScore(points, g.x, GROUND_Y - 24);
    playSound(this, 'boom');
  }

  private stepAir(dt: number, sx: number, dusk: number) {
    for (const a of this.air) {
      a.t += dt;
      if (a.kind === 'scout') {
        const goal = a.t < ENEMY.scout.life ? a.hoverX! : -120;
        a.hx! += (goal - a.hx!) * Math.min(1, dt * 0.8 * dusk);
        a.x = a.hx! + Math.sin(a.t * 1.3 * dusk + a.phase!) * ENEMY.scout.weave;
        a.y = a.hy! + Math.sin(a.t * 2.2 + a.phase!) * 12;
        a.cool! -= dt;
        if (a.cool! <= 0 && a.x > 20 && a.x < WIDTH - 20) {
          this.drops.push({ sx: a.x, y: a.y + 6, vy: 70, kind: 'pellet' });
          const [lo, hi] = ENEMY.scout.dropEvery;
          a.cool = (lo + Math.random() * (hi - lo)) / dusk;
          playSound(this, 'drop', { volume: 0.5 });
        }
        if (a.x < -30) a.dead = true;
      } else if (a.kind === 'bomber') {
        const goal = a.left! > 0 ? sx + ENEMY.bomber.ahead : -60;
        a.x += (goal - a.x) * Math.min(1, dt * 0.9 * dusk);
        a.y = ENEMY.bomber.y + Math.sin(a.t * 2) * 6;
        a.cool! -= dt;
        if (a.left! > 0 && a.cool! <= 0 && Math.abs(a.x - goal) < 30) {
          this.drops.push({ sx: a.x, y: a.y + 8, vy: 10, kind: 'charge' });
          a.left! -= 1;
          a.cool = ENEMY.bomber.dropEvery / dusk;
          playSound(this, 'drop');
        }
        if (a.x < -40) a.dead = true;
      } else {
        // Glide in over the rover, hang there (flashing), then plunge straight down where the rover was.
        const d = ENEMY.diver;
        if (a.phase === 0) {
          a.x += (sx - a.x) * Math.min(1, dt * 3 * dusk);
          a.y += (d.hoverY - a.y) * Math.min(1, dt * 3);
          if (a.t > d.glide / dusk) { a.phase = 1; a.t = 0; }
        } else if (a.phase === 1) {
          a.x += (sx - a.x) * Math.min(1, dt * 6);
          if (a.t > d.hang / dusk) { a.phase = 2; a.t = 0; }
        } else {
          a.vy! += d.plunge * dusk * dt;
          a.y += a.vy! * dt;
          if (a.y >= GROUND_Y - 6) {
            a.dead = true;
            this.burst(this.camX + a.x, GROUND_Y - 4, DEBRIS.air, 14);
            this.fx.burst(this.camX + a.x, GROUND_Y - 4, DEBRIS.air, 'small');
            playSound(this, 'boom');
          }
        }
      }
      for (const up of this.ups) {
        if (a.dead || up.dead) continue;
        if (Math.abs(up.sx - a.x) < 9 && up.py >= a.y - 9 && up.y <= a.y + 9) {
          up.dead = a.dead = true;
          this.burst(this.camX + a.x, a.y, DEBRIS.air, 18);
          this.fx.burst(this.camX + a.x, a.y, DEBRIS.air, a.kind === 'scout' ? 'small' : 'big');
          this.addScore(POINTS[a.kind], this.camX + a.x, a.y - 8);
          playSound(this, 'boom');
        }
      }
      if (!a.dead && this.canBeHit() && Math.abs(a.x - sx) < 11 && Math.abs(a.y - (GROUND_Y - 8 - this.roverY)) < 10) {
        a.dead = true;
        this.burst(this.camX + a.x, a.y, DEBRIS.air, 12);
        this.crash();
      }
    }
    for (const a of this.air) if (a.dead) a.img.destroy();
    this.air = this.air.filter((a) => !a.dead);
    this.ups = this.ups.filter((u) => !u.dead);
  }

  private stepDrops(dt: number, sx: number) {
    for (const d of this.drops) {
      d.vy += (d.kind === 'charge' ? 200 : 40) * dt;
      const py = d.y;
      d.y += d.vy * dt;
      for (const up of this.ups) {
        if (up.dead || d.dead) continue;
        if (Math.abs(up.sx - d.sx) < 5 && up.y <= d.y + 4 && up.py >= py - 4) {
          up.dead = d.dead = true;
          this.burst(this.camX + d.sx, d.y, [COLORS.tech, COLORS.shot], 6);
          this.fx.pop(this.camX + d.sx, d.y, [COLORS.tech, COLORS.shot], 6);
          playSound(this, 'cancel');
        }
      }
      if (!d.dead && this.canBeHit() && Math.abs(d.sx - sx) < 8 && Math.abs(d.y - (GROUND_Y - 8 - this.roverY)) < 8) {
        d.dead = true;
        this.crash();
      }
      if (!d.dead && d.y >= GROUND_Y - 2) {
        d.dead = true;
        const wx = this.camX + d.sx;
        if (d.kind === 'charge') {
          this.craters.push({ x: wx - ENEMY.chargeCrater / 2, w: ENEMY.chargeCrater, fresh: 0.6 });
          this.burst(wx, GROUND_Y - 2, DEBRIS.charge, 20);
          this.fx.burst(wx, GROUND_Y - 2, DEBRIS.charge, 'small');
          playSound(this, 'crater');
        } else this.burst(wx, GROUND_Y - 2, [0xc88a62, COLORS.tech], 4);
      }
    }
    this.drops = this.drops.filter((d) => !d.dead);
    this.ups = this.ups.filter((u) => !u.dead);
  }

  private canBeHit() {
    return this.deadFor <= 0 && this.invulnerable <= 0;
  }

  /** The rover against the road: craters, mines, boulders, machines, shells, ice. */
  private collideRover(rx: number) {
    if (!this.canBeHit()) return;
    const y = this.roverY;
    for (const c of this.craters) if (y === 0 && rx > c.x + 4 && rx < c.x + c.w - 4) return this.crash();
    for (const g of this.ground) {
      if (g.dead) continue;
      const near = Math.abs(g.x - rx) < 11;
      if (g.kind === 'mine' && near && y < 6) {
        g.dead = true;
        this.burst(g.x, GROUND_Y - 4, DEBRIS.charge, 12);
        return this.crash();
      }
      if ((g.kind === 'boulder' || g.kind === 'harvester') && near && y < 13) return this.crash();
      if (g.kind === 'dozer' && Math.abs(g.x - rx) < 10 && y < 13) {
        g.dead = true;
        return this.crash();
      }
      if (g.kind === 'ice' && Math.abs(g.x - rx) < 12 && Math.abs(GROUND_Y - 36 - (GROUND_Y - 8 - y)) < 12) {
        g.dead = true;
        this.burst(g.x, GROUND_Y - 36, DEBRIS.ice, 14);
        this.fx.pop(g.x, GROUND_Y - 36, DEBRIS.ice, 14);
        this.addScore(POINTS.ice, g.x, GROUND_Y - 50);
        playSound(this, 'pickup');
      }
    }
    for (const s of this.shells) if (Math.abs(s.x - rx) < 9 && y < 8) { s.dead = true; return this.crash(); }
  }

  /** Points for clearing things, and beacons. */
  private passThings(rx: number) {
    if (this.deadFor > 0) return;
    for (const g of this.ground) {
      if (g.dead || g.passed || g.kind === 'dozer' || g.x > rx - 10) continue;
      g.passed = true;
      if (g.kind === 'mine') this.addScore(POINTS.mine.jump, g.x, GROUND_Y - 22);
      else if (g.kind === 'boulder') this.addScore(POINTS.boulder.jump, g.x, GROUND_Y - 26);
      else if (g.kind === 'harvester') this.addScore(POINTS.harvester.jump, g.x, GROUND_Y - 26);
    }
    const next = this.course.beacons[this.beaconsPassed];
    if (next !== undefined && rx >= next) this.passBeacon(next);
  }

  private passBeacon(x: number) {
    this.beaconsPassed += 1;
    this.respawnX = x;
    const sector = this.course.index, t = Math.floor(this.sectorTime);
    const final = this.beaconsPassed === COURSE.beaconsPerSector;
    this.fx.pop(x, GROUND_Y - 18, final ? [COLORS.tech, COLORS.gold] : [COLORS.tech], final ? 24 : 10);
    if (!final) {
      playSound(this, 'beacon');
      this.showBanner(`BEACON ${sector + 1}-${this.beaconsPassed}`, `TIME ${fmt(t)}   PAR ${fmt(this.course.par)}`, 1800);
      return;
    }
    const bonus = SCORING.sectorBonus + SCORING.perSecondUnderPar * Math.max(0, this.course.par - t);
    this.addScore(bonus);
    playSound(this, 'sectorClear');
    const last = sector === SECTORS.length - 1;
    if (last) this.addScore(SCORING.routeBonus);
    const lap = last ? this.lap + 1 : this.lap;
    const clearSub = `TIME ${fmt(t)}  PAR ${fmt(this.course.par)}  +${pts(bonus)}${last ? `  ROUTE +${pts(SCORING.routeBonus)}` : ''}`;
    this.lap = lap;
    this.startSector(last ? 0 : sector + 1, lap, x);
    this.showBanner(`SECTOR ${sector + 1} CLEAR`, clearSub, 2600);
    this.time.delayedCall(2700, () => {
      if (this.over) return;
      const s = SECTORS[this.course.index];
      this.showBanner(`SECTOR ${this.course.index + 1}  ·  ${s.name}`, `${this.lap > 0 ? 'DUSK SHIFT  ·  ' : ''}PAR ${fmt(this.course.par)}`, 2200);
    });
  }

  private crash() {
    if (!this.canBeHit()) return;
    this.deadFor = ROVER.respawnDelayMs / 1000;
    this.lives -= 1;
    this.burst(this.roverX(), GROUND_Y - 8 - this.roverY, DEBRIS.rover, 36);
    this.fx.death(this.roverX(), GROUND_Y - 8 - this.roverY, DEBRIS.rover);
    playSound(this, 'die');
  }

  /** Back to the last beacon passed. Hazards ahead are laid out again; whatever you destroyed is back. */
  private respawn() {
    this.clearAll();
    this.speed = ROVER.cruise;
    this.roverY = 0;
    this.roverVy = 0;
    this.camX = this.respawnX - 40;
    this.invulnerable = ROVER.invulnerableMs / 1000;
    this.airClock = Math.max(this.airClock, 3);
    this.fx.implode(this.roverSX(), GROUND_Y - 8, COLORS.rust);
    const items = this.course.items;
    this.itemIdx = items.findIndex((it) => it.x >= this.camX - 40);
    if (this.itemIdx < 0) this.itemIdx = items.length;
    this.pendingDozers = [];
    this.showBanner(`${this.lives} ROVER${this.lives === 1 ? '' : 'S'} LEFT`, this.beaconsPassed ? `FROM BEACON ${this.course.index + 1}-${this.beaconsPassed}` : 'FROM THE SECTOR START', 1400);
  }

  private clearAll() {
    for (const g of this.ground) g.img.destroy();
    for (const a of this.air) a.img.destroy();
    this.ground = [];
    this.air = [];
    this.craters = [];
    this.shots = [];
    this.ups = [];
    this.shells = [];
    this.drops = [];
  }

  private gameOver() {
    this.over = true;
    this.overAt = this.time.now;
    this.deadFor = 0;
    playSound(this, 'gameOver');
    this.showBanner('GAME OVER', `SCORE ${pts(this.score)}`, 0);
  }

  /** Continue: the same sector from its start, a full set of rovers, and the score back at zero. */
  private continueRun() {
    if (!this.over) return;
    this.over = false;
    this.clearAll();
    this.score = 0;
    this.extraIdx = 0;
    this.lives = ROVER.lives;
    this.speed = ROVER.cruise;
    this.roverY = 0;
    this.camX = this.course.startX - 40;
    this.invulnerable = ROVER.invulnerableMs / 1000;
    this.airClock = 4;
    this.startSector(this.course.index, this.course.lap, this.course.startX);
    this.fx.clear();
    this.fx.implode(this.roverSX(), GROUND_Y - 8, COLORS.rust);
    playSound(this, 'start');
  }

  private toTitle() {
    this.scene.stop('hud');
    this.scene.start('title');
  }

  private addScore(points: number, wx?: number, y?: number) {
    this.score += points;
    if (wx !== undefined && y !== undefined) {
      const text = this.add.text(wx - this.camX, y, `+${points}`, { fontFamily: FONT, fontSize: '8px', color: TEXT.ink }).setOrigin(0.5).setDepth(15);
      const popup = { text, x: wx };
      this.popups.push(popup);
      this.tweens.add({
        targets: text, y: y - 14, alpha: 0, duration: 900, ease: 'Quad.out',
        onComplete: () => { text.destroy(); this.popups = this.popups.filter((p) => p !== popup); },
      });
    }
    const at = SCORING.extraRoversAt;
    while (this.extraIdx < at.length && this.score >= at[this.extraIdx]) {
      this.extraIdx += 1;
      this.lives += 1;
      playSound(this, 'extraRover');
      this.showBanner('EXTRA ROVER', `${this.lives} ROVERS`, 1600);
    }
  }

  private showBanner(title: string, sub: string, ms: number) {
    this.banner = { id: this.banner.id + 1, title, sub, ms };
  }

  // ---- Warning lamps ----

  private lampState() {
    const ahead = this.camX + WIDTH;
    return {
      air: this.air.length > 0 || this.airClock < 1.2,
      mine: this.ground.some((g) => g.kind === 'mine' && g.x > ahead - 40),
      rear: this.ground.some((g) => g.kind === 'dozer' && g.behind) || this.pendingDozers.some((x) => x - 60 - this.roverX() < ROVER.cruise),
    };
  }

  private lamps() {
    const now = this.lampState();
    if ((now.air && !this.lampWas.air) || (now.mine && !this.lampWas.mine) || (now.rear && !this.lampWas.rear)) playSound(this, 'warn');
    this.lampWas = now;
  }

  // ---- Drawing ----

  private sprite(key: SpriteKey, x: number, y: number) {
    return this.add.image(x, y, key).setFlipX(MIRROR.has(key)).setDepth(8);
  }

  private burst(wx: number, y: number, colors: number[], n: number) {
    this.palette = colors;
    this.debris.explode(n, wx, y);
  }

  private draw() {
    const camX = this.camX;
    this.backdrop.update(camX, this.clock);
    this.debris.x = -camX;
    this.fx.beginFrame();

    const g = this.dyn.clear();
    const p = this.backdrop.colors;
    // Craters: a bowl cut into the road, with a lit rim.
    for (const c of this.craters) {
      for (let i = 0; i < c.w; i++) {
        const x = Math.floor(c.x + i - camX);
        if (x < 0 || x >= WIDTH) continue;
        const d = Math.round(Math.sin((Math.PI * (i + 0.5)) / c.w) * 12);
        g.fillStyle(c.fresh > 0 ? 0xffb070 : p.hole).fillRect(x, GROUND_Y, 1, d);
        g.fillStyle(p.rim).fillRect(x, GROUND_Y + d, 1, 1);
      }
    }
    g.fillStyle(COLORS.tech);
    for (const s of this.shells) g.fillRect(Math.round(s.x - camX) - 2, GROUND_Y - 6, 4, 2);
    for (const d of this.drops) {
      if (d.kind === 'charge') {
        g.fillStyle(COLORS.danger).fillRect(Math.round(d.sx) - 2, Math.round(d.y) - 2, 4, 4);
        g.fillStyle(COLORS.gold).fillRect(Math.round(d.sx) - 1, Math.round(d.y) - 1, 2, 2);
      } else g.fillStyle(COLORS.tech).fillRect(Math.round(d.sx), Math.round(d.y), 2, 3);
    }
    for (const s of this.shots) {
      g.fillStyle(COLORS.shot).fillRect(Math.round(s.x - camX) - 3, Math.round(s.y), 5, 2);
      g.fillStyle(COLORS.rust).fillRect(Math.round(s.x - camX) - 6, Math.round(s.y), 3, 2);
    }
    g.fillStyle(COLORS.shot);
    for (const u of this.ups) g.fillRect(Math.round(u.sx), Math.round(u.y), 2, 5);
    for (const t of this.ground) {
      const x = t.x - camX;
      if (t.kind === 'ice') t.img.setPosition(x, GROUND_Y - 36 + Math.sin(this.clock * 3 + t.x) * 1.5);
      else t.img.setPosition(x, GROUND_Y - (t.kind === 'mine' ? 6 : 8));
      if (t.flash) t.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else t.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      if (t.big && t.hp > 1) g.fillStyle(COLORS.rust).fillRect(Math.round(x) - 3, GROUND_Y - 20, 7, 1).fillRect(Math.round(x) - 3, GROUND_Y - 22, 7, 1);
      if (t.kind === 'beacon' && Math.sin(this.clock * 6) > 0) g.fillStyle(COLORS.tech).fillRect(Math.round(x) - 1, GROUND_Y - 19, 2, 2);
    }
    // Beacons ahead are course items; draw them through the ground list.
    for (const a of this.air) {
      a.img.setPosition(a.x, a.y);
      // A diver flashes while it hangs, just before it plunges.
      if (a.kind === 'diver' && a.phase === 1 && Math.sin(this.clock * 30) > 0) a.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else a.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
    // Soft halos under the bright things: shots, shells, falling drops, ice cores, beacon lights and fresh craters.
    const fx = this.fx;
    for (const s of this.shots) fx.glow(s.x - camX, s.y + 1, 7, COLORS.shot);
    for (const u of this.ups) fx.glow(u.sx + 1, u.y + 2, 6, COLORS.shot);
    for (const s of this.shells) fx.glow(s.x - camX, GROUND_Y - 5, 6, COLORS.tech);
    for (const d of this.drops) fx.glow(d.sx, d.y, d.kind === 'charge' ? 9 : 5, d.kind === 'charge' ? COLORS.danger : COLORS.tech);
    for (const c of this.craters) if (c.fresh > 0) fx.glow(c.x + c.w / 2 - camX, GROUND_Y + 2, c.w * 0.7, COLORS.rust, c.fresh / 0.6);
    for (const t of this.ground) {
      if (t.kind === 'ice') fx.glow(t.x - camX, t.img.y, 13, COLORS.tech, 0.75 + 0.25 * Math.sin(this.clock * 4 + t.x));
      if (t.kind === 'beacon' && Math.sin(this.clock * 6) > 0) fx.glow(t.x - camX, GROUND_Y - 18, 8, COLORS.tech);
    }
    for (const pop of this.popups) pop.text.x = pop.x - camX;

    const sx = this.roverSX();
    const blink = this.invulnerable > 0 && Math.sin(this.clock * 30) < 0;
    const bob = this.landed > 0 ? 1 : this.roverY === 0 && Math.sin(camX * 0.35) > 0.6 ? -1 : 0;
    this.rover.setVisible(this.deadFor <= 0 && !this.over && !blink).setPosition(sx, GROUND_Y - 8 - this.roverY + bob);
  }

  private writeHud(input: ControlState) {
    const lamps = this.lampState();
    const segStart = this.beaconsPassed === 0 ? this.course.startX : this.course.beacons[this.beaconsPassed - 1];
    const along = Phaser.Math.Clamp((this.roverX() - segStart) / COURSE.segmentLength, 0, 0.99);
    const hud: HudState = {
      score: this.score, lives: this.lives, device: input.device, over: this.over,
      next: `${this.course.index + 1}-${Math.min(COURSE.beaconsPerSector, this.beaconsPassed + 1)}`,
      time: this.sectorTime, par: this.course.par,
      lamps, progress: this.course.index * COURSE.beaconsPerSector + this.beaconsPassed + along,
      dusk: this.lap > 0, banner: this.banner,
    };
    this.registry.set(HUD_STATE, hud);
  }
}
