import Phaser from 'phaser';
import { GROUND_Y, HEIGHT, HUD_H, WIDTH } from './config';

export type Shift = 'day' | 'dusk';

type Rgb = [number, number, number];
interface Palette {
  skyTop: Rgb; skyLow: Rgb; sun: number; halo: number; haloAlpha: number; moons: number; stars: boolean;
  /** Far hills per sector look (0-4). */
  far: string[]; tower: string; towerLight: number; mid: string; near: string;
  road: string; roadTop: string; strata: string[]; hole: number; rim: number;
  /** Light on sun-facing slopes, and how strongly slopes are lit and shaded. */
  sunlight: Rgb; relief: number;
  cloud: Rgb; cloudAlpha: number;
  /** Dust devils (day only) and the grit in them. */
  dust: number; grit: number;
}

export const PALETTES: Record<Shift, Palette> = {
  day: {
    skyTop: [176, 104, 70], skyLow: [236, 186, 140], sun: 0xfff3d6, halo: 0xfff0d2, haloAlpha: 0.25, moons: 0xe8c7a8, stars: false,
    far: ['#c58a64', '#bd7d5d', '#c99470', '#b07058', '#c27f5c'], tower: '#a26446', towerLight: 0x4fdcc8, mid: '#a95c3a', near: '#8a4428',
    road: '#c87447', roadTop: '#efaa76', strata: ['#7a3a22', '#6c321d', '#843f25', '#5f2b19'], hole: 0x2a130c, rim: 0xefaa76,
    sunlight: [255, 226, 190], relief: 0.22, cloud: [255, 244, 232], cloudAlpha: 0.32, dust: 0xe3b48c, grit: 0x8a4428,
  },
  dusk: {
    skyTop: [14, 16, 34], skyLow: [92, 116, 160], sun: 0xe9f4ff, halo: 0x78aaff, haloAlpha: 0.35, moons: 0xc9c3d6, stars: true,
    far: ['#3d3f5e', '#3a3a58', '#444264', '#36344f', '#403d60'], tower: '#2b2a44', towerLight: 0x4fdcc8, mid: '#3b2b3c', near: '#4a2a2a',
    road: '#7a4a3a', roadTop: '#b07a62', strata: ['#4a2a24', '#3f241f', '#522e27', '#36201b'], hole: 0x140a08, rim: 0xb07a62,
    sunlight: [150, 182, 255], relief: 0.2, cloud: [130, 150, 205], cloudAlpha: 0.3, dust: 0, grit: 0,
  },
};

/** Every layer texture tiles at this width, so noise and features repeat seamlessly. */
const PERIOD = 1024;
const ROAD_PERIOD = 256;

const hash = (a: number, b: number) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0;
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;
const css = (c: Rgb, alpha = 1) => `rgba(${c.join(',')},${alpha})`;

/** Smooth value noise that repeats every `period` pixels; `cell` must divide `period`. */
function noise(x: number, cell: number, seed: number, period = PERIOD) {
  const n = period / cell, i = Math.floor(x / cell), f = x / cell - i, u = f * f * (3 - 2 * f);
  const a = (hash(((i % n) + n) % n, seed) % 1000) / 1000, b = (hash((((i + 1) % n) + n) % n, seed) % 1000) / 1000;
  return a + (b - a) * u;
}

interface Layer { key: string; factor: number; y: number; h: number; sprite?: Phaser.GameObjects.TileSprite }

/**
 * Sky, sun and moons, ice clouds, five parallax layers (a distant range, volcano and mesas, terraformer towers, ridges, near rocks) and
 * the road. Hills are lit on the sun side and hazed at the foot. Layers are drawn once into canvas textures and scrolled
 * as tile sprites; redrawn when the sector or shift changes. Dust devils (day) and meteors (dusk) are drawn per frame.
 */
export class Backdrop {
  private readonly layers: Layer[] = [
    { key: 'bd-distant', factor: 0.04, y: 84, h: 70 },
    { key: 'bd-far', factor: 0.08, y: 70, h: 92 },
    { key: 'bd-towers', factor: 0.2, y: 100, h: 66 },
    { key: 'bd-mid', factor: 0.3, y: 146, h: 56 },
    { key: 'bd-near', factor: 0.6, y: GROUND_Y - 14, h: 14 },
  ];
  private readonly road: Phaser.GameObjects.TileSprite;
  private readonly clouds: Phaser.GameObjects.TileSprite;
  private readonly lights: Phaser.GameObjects.Graphics;
  private readonly devils: Phaser.GameObjects.Graphics;
  private readonly sun: Phaser.GameObjects.Graphics;
  private palette = PALETTES.day;
  private look = { far: 0, volcano: 0.3 };
  private shift: Shift = 'day';

  constructor(private readonly scene: Phaser.Scene, depth = 0) {
    for (const key of ['bd-sky', 'bd-road', 'bd-clouds', ...this.layers.map((l) => l.key)]) if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.createCanvas('bd-sky', WIDTH, GROUND_Y - HUD_H);
    scene.textures.createCanvas('bd-clouds', PERIOD, 44);
    scene.textures.createCanvas('bd-road', ROAD_PERIOD, HEIGHT - GROUND_Y);
    for (const l of this.layers) scene.textures.createCanvas(l.key, PERIOD, l.h);

    scene.add.image(0, HUD_H, 'bd-sky').setOrigin(0).setDepth(depth);
    this.sun = scene.add.graphics().setDepth(depth + 0.1);
    this.clouds = scene.add.tileSprite(0, HUD_H + 6, WIDTH, 44, 'bd-clouds').setOrigin(0).setDepth(depth + 0.15);
    this.lights = scene.add.graphics().setDepth(depth + 0.5);
    this.layers.forEach((l, i) => {
      l.sprite = scene.add.tileSprite(0, l.y, WIDTH, l.h, l.key).setOrigin(0).setDepth(depth + 0.2 + i * 0.05);
    });
    // Layers sit at 0.2 to 0.4; tower lights go just in front of the towers (0.3).
    this.lights.setDepth(depth + 0.32);
    // Between the ridges (0.35) and the near rocks (0.4): dust devils stand on the plain.
    this.devils = scene.add.graphics().setDepth(depth + 0.38);
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
    this.clouds.tilePositionX = camX * 0.03 + clock * 3;
    const p = this.palette;
    this.drawDevils(camX, clock);
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
    // Dusk: now and then a meteor streaks down toward the hills.
    if (this.shift === 'dusk') {
      const every = 3.7, k = Math.floor(clock / every), t = clock - k * every, life = 0.45;
      if (hash(k, 71) % 3 !== 0 && t < life) {
        const u = t / life, hx = 60 + (hash(k, 72) % 300) - u * 44, hy = 30 + (hash(k, 73) % 24) + u * 18;
        for (let i = 0; i < 9; i++) g.fillStyle(0xffffff, (1 - i / 9) * (1 - u * u)).fillRect(Math.round(hx + i * 2.4), Math.round(hy - i), 1, 1);
      }
    }
  }

  /** Dust devils, day only: twisting columns on the plain, each at its own spot along the road, drifting slowly. */
  private drawDevils(camX: number, clock: number) {
    const g = this.devils.clear(), p = this.palette;
    if (this.shift !== 'day') return;
    const spacing = 560, scroll = camX * 0.45 + clock * 5, base = GROUND_Y - 8;
    const first = Math.floor((scroll - 60) / spacing);
    for (let k = first; k <= first + 2; k++) {
      if (hash(k, 61) % 3 === 0) continue;
      const bx = k * spacing + (hash(k, 62) % 300) - scroll;
      if (bx < -30 || bx > WIDTH + 30) continue;
      const h = 26 + (hash(k, 63) % 16);
      g.fillStyle(p.dust, 0.45).fillEllipse(bx, base, 22, 5);
      for (let r = 0; r < h; r++) {
        const u = r / h, w = 2 + u * 9;
        const cx = bx + u * 4 + Math.sin(r * 0.35 - clock * 8) * (1 + u * 2);
        g.fillStyle(p.dust, 0.7 * (1 - u) ** 0.6 * (0.75 + 0.25 * Math.sin(r * 0.9 + clock * 12))).fillRect(Math.round(cx - w / 2), base - r, Math.round(w), 1);
      }
      // Grit spiralling up the column.
      for (let i = 0; i < 6; i++) {
        const u = (clock * 0.6 + i / 6) % 1, w = 2 + u * 9;
        g.fillStyle(p.grit, 0.8 * (1 - u)).fillRect(Math.round(bx + u * 4 + Math.cos(clock * 7 + i * 1.3) * (w / 2)), Math.round(base - u * h), 1, 1);
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

    // A pale range on the horizon, behind the volcano: crater rims and buttes.
    this.paint('bd-distant', (ctx, h) => {
      const color = mix(rgb(p.far[this.look.far % p.far.length]), p.skyLow, 0.5);
      this.ridge(ctx, h, `#${color.map((v) => v.toString(16).padStart(2, '0')).join('')}`, 0.25, (x) => {
        const butte = noise(x, 64, 81 + this.look.far) > 0.7 ? 8 : 0;
        return 18 + noise(x, 128, 82 + this.look.far) * 22 + noise(x, 16, 83) * 3 + butte;
      });
    });
    this.paint('bd-far', (ctx, h) => {
      this.ridge(ctx, h, p.far[this.look.far % p.far.length], 0.3, (x) => {
        const m = x - PERIOD / 2;
        const volcano = (10 + 50 * this.look.volcano) * Math.exp(-((m / 230) ** 2));
        const mesa = noise(x, 128, 12 + this.look.far) > 0.62 ? 12 : 0;
        return 14 + volcano + noise(x, 32, 11 + this.look.far) * 10 + mesa;
      });
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
      this.haze(ctx, h, 0.4);
    });
    this.paint('bd-mid', (ctx, h) => {
      // Ridges of layered rock: strata lines follow the crest down the face.
      const tops = this.ridge(ctx, h, p.mid, 0.18, (x) => 30 + noise(x, 64, 21) * 16 + noise(x, 16, 22) * 4);
      const strata = css(mix(rgb(p.mid), [0, 0, 0], 0.14));
      ctx.fillStyle = strata;
      for (let x = 0; x < PERIOD; x++) {
        for (const depth of [7, 13, 20]) if (noise(x, 32, 23 + depth) > 0.3) ctx.fillRect(x, Math.round(h - tops[x] + depth), 1, 1);
      }
    });
    this.paint('bd-near', (ctx, h) => {
      const tops = this.ridge(ctx, h, p.near, 0, (x) => 3 + noise(x, 16, 31) * 9);
      // Loose rocks on the ground line, lit on the sun side.
      const base = rgb(p.near), lit = css(mix(base, p.sunlight, p.relief * 2.2)), body = css(mix(base, [0, 0, 0], 0.08));
      for (let k = 0; k < 40; k++) {
        const x0 = hash(k, 41) % PERIOD, w = 3 + (hash(k, 42) % 7), rh = 2 + (hash(k, 43) % 4);
        for (let i = 0; i < w; i++) {
          const x = (x0 + i) % PERIOD, ground = h - tops[x] + 2, colH = Math.max(1, Math.round(Math.sin((Math.PI * (i + 0.5)) / w) * rh));
          ctx.fillStyle = body;
          ctx.fillRect(x, ground - colH, 1, colH);
          if (i >= w / 2) { ctx.fillStyle = lit; ctx.fillRect(x, ground - colH, 1, 1); }
        }
      }
    });
    this.paint('bd-clouds', (ctx) => {
      // Thin water-ice clouds: a few long wisps, broken up by noise.
      for (let k = 0; k < 8; k++) {
        const cx = hash(k, 51) % PERIOD, cy = 3 + (hash(k, 52) % 30), len = 60 + (hash(k, 53) % 130), rows = 1 + (hash(k, 54) % 3);
        for (let j = 0; j < rows; j++) {
          const rowLen = len - j * 24;
          for (let i = 0; i < rowLen; i++) {
            const x = (cx + j * 9 + i) % PERIOD, n = noise(x, 8, 55 + k + j * 7);
            if (n < 0.3) continue;
            ctx.fillStyle = css(p.cloud, p.cloudAlpha * Math.sin((Math.PI * i) / rowLen) * n);
            ctx.fillRect(x, cy + j, 1, 1);
          }
        }
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
        // Earth, the evening star.
        ctx.fillStyle = 'rgba(140,190,255,0.25)';
        ctx.fillRect(83, 37, 4, 4);
        ctx.fillStyle = '#bfe0ff';
        ctx.fillRect(84, 38, 2, 2);
      }
    });
  }

  /**
   * Fills a ridge line up to `top(x)`: the slope that faces the sun (on the right) lit near the crest, the other slope
   * shaded, a bright crest line, then `haze` (0-1) of sky colour rising from the foot. Returns the heights.
   */
  private ridge(ctx: CanvasRenderingContext2D, h: number, color: string, haze: number, top: (x: number) => number) {
    const p = this.palette, base = rgb(color);
    const lit = css(mix(base, p.sunlight, p.relief)), shade = css(mix(base, [0, 0, 0], p.relief * 0.8)), crest = css(mix(base, p.sunlight, p.relief * 1.8));
    const tops = Array.from({ length: PERIOD }, (_, x) => top(x));
    for (let x = 0; x < PERIOD; x++) {
      const t = Math.round(tops[x]), slope = tops[(x + 1) % PERIOD] - tops[(x + PERIOD - 1) % PERIOD];
      ctx.fillStyle = css(base);
      ctx.fillRect(x, h - t, 1, t);
      const band = Math.min(7, Math.round(1 + Math.abs(slope) * 4));
      if (Math.abs(slope) > 0.15) {
        ctx.fillStyle = slope < 0 ? lit : shade;
        ctx.fillRect(x, h - t, 1, band);
      }
      ctx.fillStyle = crest;
      ctx.fillRect(x, h - t, 1, 1);
    }
    if (haze > 0) this.haze(ctx, h, haze);
    return tops;
  }

  /** Sky colour over what's already drawn, rising from the foot of the layer. */
  private haze(ctx: CanvasRenderingContext2D, h: number, amount: number) {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, css(this.palette.skyLow, 0));
    gradient.addColorStop(1, css(this.palette.skyLow, amount));
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, PERIOD, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  private paint(key: string, draw: (ctx: CanvasRenderingContext2D, h: number) => void) {
    const tex = this.scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, tex.width, tex.height);
    draw(ctx, tex.height);
    tex.refresh();
  }
}
