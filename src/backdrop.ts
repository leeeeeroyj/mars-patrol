import Phaser from 'phaser';
import { GROUND_Y, HEIGHT, HUD_H, WIDTH } from './config';

export type Shift = 'day' | 'dusk';

type Rgb = [number, number, number];
interface Palette {
  skyTop: Rgb; skyLow: Rgb; sun: number; halo: number; haloAlpha: number; moons: number; stars: boolean;
  /** Far hills per sector look (0-4). */
  far: string[]; tower: string; towerLight: number; mid: string; near: string;
  road: string; roadTop: string; strata: string[]; hole: number; rim: number;
}

export const PALETTES: Record<Shift, Palette> = {
  day: {
    skyTop: [176, 104, 70], skyLow: [236, 186, 140], sun: 0xfff3d6, halo: 0xfff0d2, haloAlpha: 0.25, moons: 0xe8c7a8, stars: false,
    far: ['#c58a64', '#bd7d5d', '#c99470', '#b07058', '#c27f5c'], tower: '#a26446', towerLight: 0x4fdcc8, mid: '#a95c3a', near: '#8a4428',
    road: '#c87447', roadTop: '#efaa76', strata: ['#7a3a22', '#6c321d', '#843f25', '#5f2b19'], hole: 0x2a130c, rim: 0xefaa76,
  },
  dusk: {
    skyTop: [14, 16, 34], skyLow: [92, 116, 160], sun: 0xe9f4ff, halo: 0x78aaff, haloAlpha: 0.35, moons: 0xc9c3d6, stars: true,
    far: ['#3d3f5e', '#3a3a58', '#444264', '#36344f', '#403d60'], tower: '#2b2a44', towerLight: 0x4fdcc8, mid: '#3b2b3c', near: '#4a2a2a',
    road: '#7a4a3a', roadTop: '#b07a62', strata: ['#4a2a24', '#3f241f', '#522e27', '#36201b'], hole: 0x140a08, rim: 0xb07a62,
  },
};

/** Every layer texture tiles at this width, so noise and features repeat seamlessly. */
const PERIOD = 1024;
const ROAD_PERIOD = 256;

const hash = (a: number, b: number) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0;

/** Smooth value noise that repeats every `period` pixels; `cell` must divide `period`. */
function noise(x: number, cell: number, seed: number, period = PERIOD) {
  const n = period / cell, i = Math.floor(x / cell), f = x / cell - i, u = f * f * (3 - 2 * f);
  const a = (hash(((i % n) + n) % n, seed) % 1000) / 1000, b = (hash((((i + 1) % n) + n) % n, seed) % 1000) / 1000;
  return a + (b - a) * u;
}

interface Layer { key: string; factor: number; y: number; h: number; sprite?: Phaser.GameObjects.TileSprite }

/**
 * Sky, sun and moons, four parallax layers (volcano and mesas, terraformer towers, ridges, near rocks) and the road.
 * Layers are drawn once into canvas textures and scrolled as tile sprites; redrawn when the sector or shift changes.
 */
export class Backdrop {
  private readonly layers: Layer[] = [
    { key: 'bd-far', factor: 0.08, y: 70, h: 92 },
    { key: 'bd-towers', factor: 0.2, y: 100, h: 66 },
    { key: 'bd-mid', factor: 0.3, y: 146, h: 56 },
    { key: 'bd-near', factor: 0.6, y: GROUND_Y - 14, h: 14 },
  ];
  private readonly road: Phaser.GameObjects.TileSprite;
  private readonly lights: Phaser.GameObjects.Graphics;
  private readonly sun: Phaser.GameObjects.Graphics;
  private palette = PALETTES.day;
  private look = { far: 0, volcano: 0.3 };
  private shift: Shift = 'day';

  constructor(private readonly scene: Phaser.Scene, depth = 0) {
    for (const key of ['bd-sky', 'bd-road', ...this.layers.map((l) => l.key)]) if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.createCanvas('bd-sky', WIDTH, GROUND_Y - HUD_H);
    scene.textures.createCanvas('bd-road', ROAD_PERIOD, HEIGHT - GROUND_Y);
    for (const l of this.layers) scene.textures.createCanvas(l.key, PERIOD, l.h);

    scene.add.image(0, HUD_H, 'bd-sky').setOrigin(0).setDepth(depth);
    this.sun = scene.add.graphics().setDepth(depth + 0.1);
    this.lights = scene.add.graphics().setDepth(depth + 0.5);
    this.layers.forEach((l, i) => {
      l.sprite = scene.add.tileSprite(0, l.y, WIDTH, l.h, l.key).setOrigin(0).setDepth(depth + 0.2 + i * 0.1);
    });
    this.lights.setDepth(depth + 0.35);
    this.road = scene.add.tileSprite(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y, 'bd-road').setOrigin(0).setDepth(depth + 1);
    this.redraw();
  }

  get colors() {
    return this.palette;
  }

  setLook(look: { far: number; volcano: number }, shift: Shift) {
    if (look.far === this.look.far && look.volcano === this.look.volcano && shift === this.shift) return;
    this.look = look;
    this.shift = shift;
    this.palette = PALETTES[shift];
    this.redraw();
  }

  /** `camX` is the distance driven; `clock` is seconds, for the blinking tower lights and drifting moons. */
  update(camX: number, clock: number) {
    for (const l of this.layers) l.sprite!.tilePositionX = camX * l.factor;
    this.road.tilePositionX = camX;
    const p = this.palette;
    const g = this.lights.clear();
    // Moons: Phobos fast and lumpy, Deimos slow and tiny.
    const phobos = WIDTH + 20 - ((clock * 3) % (WIDTH + 60)), deimos = WIDTH + 20 - ((clock * 1.2 + 260) % (WIDTH + 60));
    g.fillStyle(p.moons).fillRect(Math.round(phobos), 40, 4, 3).fillRect(Math.round(phobos) + 1, 39, 2, 1).fillRect(Math.round(deimos), 62, 2, 2);
    // Tower beacons, still blinking for nobody.
    const shift = (camX * 0.2) % PERIOD;
    for (let k = 0; k < 3; k++) {
      const x = ((this.towerX(k) - shift) % PERIOD + PERIOD) % PERIOD;
      for (const sx of [x, x - PERIOD, x + PERIOD]) {
        if (sx < -4 || sx > WIDTH + 4 || Math.sin(clock * 3 + k * 2) < 0.2) continue;
        g.fillStyle(p.towerLight).fillRect(Math.round(sx) + 2, 105, 2, 2);
      }
    }
  }

  private towerX(k: number) {
    return 140 + k * 340 + (hash(k, 5) % 90);
  }

  private redraw() {
    const p = this.palette;
    this.drawSky();
    this.sun.clear();
    const day = this.shift === 'day';
    const sx = day ? 300 : 250, sy = day ? 46 : 132;
    this.sun.fillStyle(p.halo, p.haloAlpha).fillCircle(sx, sy, day ? 12 : 26);
    this.sun.fillStyle(p.sun).fillCircle(sx, sy, 4);

    this.paint('bd-far', (ctx, h) => {
      ctx.fillStyle = p.far[this.look.far % p.far.length];
      for (let x = 0; x < PERIOD; x++) {
        const m = x - PERIOD / 2;
        const volcano = (10 + 50 * this.look.volcano) * Math.exp(-((m / 230) ** 2));
        const mesa = noise(x, 128, 12 + this.look.far) > 0.62 ? 12 : 0;
        const top = 14 + volcano + noise(x, 32, 11 + this.look.far) * 10 + mesa;
        ctx.fillRect(x, h - top, 1, top);
      }
    });
    this.paint('bd-towers', (ctx, h) => {
      ctx.fillStyle = p.tower;
      for (let k = 0; k < 3; k++) {
        const x = this.towerX(k), base = h - 2;
        // An atmosphere processor: mast, collar, cap, aerial, and a squat pump house beside it.
        ctx.fillRect(x, base - 44, 6, 44);
        ctx.fillRect(x - 4, base - 32, 14, 4);
        ctx.fillRect(x - 2, base - 50, 10, 6);
        ctx.fillRect(x + 2, base - 58, 2, 8);
        ctx.fillRect(x + 10, base - 18, 10, 18);
        ctx.fillRect(x + 12, base - 24, 2, 6);
      }
    });
    this.paint('bd-mid', (ctx, h) => {
      ctx.fillStyle = p.mid;
      for (let x = 0; x < PERIOD; x++) {
        const top = 10 + noise(x, 64, 21) * 16 + noise(x, 16, 22) * 4;
        ctx.fillRect(x, h - top - 20, 1, top + 20);
      }
    });
    this.paint('bd-near', (ctx, h) => {
      ctx.fillStyle = p.near;
      for (let x = 0; x < PERIOD; x++) {
        const top = 3 + noise(x, 16, 31) * 9;
        ctx.fillRect(x, h - top, 1, top);
      }
    });
    this.paint('bd-road', (ctx, h) => {
      for (let x = 0; x < ROAD_PERIOD; x++) {
        ctx.fillStyle = p.roadTop;
        ctx.fillRect(x, 0, 1, 1);
        ctx.fillStyle = p.road;
        ctx.fillRect(x, 1, 1, 3);
        for (let y = 4; y < h; y += 2) {
          const band = hash(x >> 1, y >> 2) % 7 === 0 ? 2 : (y >> 3) % 4;
          ctx.fillStyle = p.strata[band];
          ctx.fillRect(x, y, 1, 2);
        }
      }
    });
  }

  private drawSky() {
    const p = this.palette;
    this.paint('bd-sky', (ctx, h) => {
      for (let y = 0; y < h; y += 4) {
        const t = y / h;
        const c = p.skyTop.map((v, i) => Math.round(v + (p.skyLow[i] - v) * t));
        ctx.fillStyle = `rgb(${c.join(',')})`;
        ctx.fillRect(0, y, WIDTH, 4);
      }
      if (p.stars) {
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = `rgba(255,255,255,${0.3 + (hash(i, 4) % 60) / 100})`;
          ctx.fillRect(hash(i, 1) % WIDTH, 2 + (hash(i, 2) % 90), 1, 1);
        }
      }
    });
  }

  private paint(key: string, draw: (ctx: CanvasRenderingContext2D, h: number) => void) {
    const tex = this.scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, tex.width, tex.height);
    draw(ctx, tex.height);
    tex.refresh();
  }
}
