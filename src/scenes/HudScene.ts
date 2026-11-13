import Phaser from 'phaser';
import { COLORS, COURSE, FONT, HEIGHT, HUD_H, HUD_SCALE, HUD_STATE, MIRROR, SECTORS, TEXT, WIDTH } from '../config';
import type { Device } from '../controls';
import { MUTED, toggleMute } from '../sfx';
import { fitCamera } from '../view';

export interface Banner {
  /** Changes whenever a new banner is shown. */
  id: number;
  title: string;
  sub: string;
  /** How long it stays up; 0 keeps it until the next one. */
  ms: number;
}

export interface HudState {
  score: number;
  lives: number;
  device: Device;
  over: boolean;
  /** The next beacon, as "sector-beacon". */
  next: string;
  /** Seconds on the sector clock, and the sector's par. */
  time: number;
  par: number;
  lamps: { air: boolean; mine: boolean; rear: boolean };
  /** Beacons along the whole route, 0..25 with fractions. */
  progress: number;
  dusk: boolean;
  banner: Banner;
}

// HUD space is the design size × HUD_SCALE (832×456): sprites drawn here at native 16px come out half the size
// of road sprites, with no resampling.
const S = HUD_SCALE;
const W = WIDTH * S, H = HEIGHT * S, BAR = HUD_H * S;
const STRIP = { x0: 12, x1: W - 12, y: 34 };
const ROUTE = COURSE.beaconsPerSector * SECTORS.length;
const LAMPS = [['air', 'AIR'], ['mine', 'MINE'], ['rear', 'REAR']] as const;
const MAX_ICONS = 4;
const HINTS: Record<Device, string> = {
  kbm: '← → SPEED  ·  ↑ JUMP  ·  Z / CLICK FIRE  ·  M SOUND',
  pad: 'STICK SPEED  ·  A JUMP  ·  X / RT FIRE  ·  Y SOUND',
  touch: '◀ ▶ SPEED  ·  JUMP  ·  FIRE',
};

const pts = (n: number) => String(n).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Top bar, warning lamps, route strip, banners and hint strip, drawn over the road at twice its resolution. */
export class HudScene extends Phaser.Scene {
  private score!: Phaser.GameObjects.Text;
  private next!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private extra!: Phaser.GameObjects.Text;
  private lampText: Phaser.GameObjects.Text[] = [];
  private dynamic!: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.Image[] = [];
  private bannerBg!: Phaser.GameObjects.Graphics;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerFade: Phaser.Tweens.Tween | undefined;
  private overButtons!: Phaser.GameObjects.Container;
  private overHint!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private soundToggle!: Phaser.GameObjects.Text;
  private shownBanner = -1;
  private shownLives = -1;
  private clock = 0;

  constructor() {
    super('hud');
  }

  create() {
    fitCamera(this, HUD_SCALE);
    this.shownBanner = -1;
    this.shownLives = -1;
    this.icons = [];
    const label = (x: number, y: number, text: string, color = TEXT.dim, size = 16) =>
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color });

    const g = this.add.graphics();
    g.fillStyle(COLORS.void).fillRect(0, 0, W, BAR);
    g.fillStyle(COLORS.line).fillRect(0, BAR - 2, W, 2);
    g.fillStyle(COLORS.void, 0.7).fillRect(0, H - 24, W, 24);

    label(8, 4, 'SCORE');
    this.score = label(80, 4, '', TEXT.rust);
    label(196, 4, 'ROVERS');
    this.extra = label(0, 4, '', TEXT.rust);
    label(372, 4, 'NEXT');
    this.next = label(432, 4, '', TEXT.rust);
    label(478, 4, 'TIME');
    this.clockText = label(532, 4, '');
    this.lampText = LAMPS.map(([, name], i) => label(600 + i * 78 + 36, 5, name, TEXT.off).setOrigin(0.5, 0));
    this.dynamic = this.add.graphics();
    this.children.bringToTop(this.lampText[0]);
    for (const t of this.lampText) this.children.bringToTop(t);

    const mid = W / 2;
    this.bannerBg = this.add.graphics().setAlpha(0);
    this.bannerTitle = label(mid, 66, '', TEXT.rust).setOrigin(0.5, 0).setAlpha(0);
    this.bannerSub = label(mid, 92, '', TEXT.ink).setOrigin(0.5, 0).setAlpha(0);

    // Game over: tappable words on phones, key hints elsewhere.
    const patrol = () => this.scene.get('patrol');
    const button = (x: number, text: string, event: string) =>
      label(x, 0, text, TEXT.rust, 24).setOrigin(0.5, 0).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => patrol().events.emit(event));
    this.overButtons = this.add.container(0, 136, [button(mid - 120, 'CONTINUE', 'continue'), button(mid + 140, 'TITLE', 'title')]).setVisible(false);
    this.overHint = label(mid, 136, 'ENTER / A  CONTINUE (SCORE RESETS)     ESC / B  TITLE', TEXT.ink).setOrigin(0.5, 0).setVisible(false);

    this.hint = label(mid, H - 21, '', TEXT.dim).setOrigin(0.5, 0);
    // Phones have no M key: the sound toggle is a tap target, padded for a thumb.
    this.soundToggle = label(W - 8, H - 21, '', TEXT.dim).setOrigin(1, 0);
    this.soundToggle.setInteractive(new Phaser.Geom.Rectangle(-24, -12, 200, 40), Phaser.Geom.Rectangle.Contains).on('pointerdown', () => toggleMute(this));
  }

  update(_time: number, delta: number) {
    this.clock += delta / 1000;
    const s = this.registry.get(HUD_STATE) as HudState | undefined;
    if (!s) return;
    this.score.setText(pts(s.score));
    this.next.setText(s.next);
    this.clockText.setText(fmt(s.time)).setColor(s.time > s.par ? TEXT.danger : TEXT.ink);

    if (s.lives !== this.shownLives) {
      this.shownLives = s.lives;
      const reserve = Math.max(0, s.lives - 1);
      const shown = reserve > MAX_ICONS ? 1 : reserve;
      this.icons.forEach((i) => i.destroy());
      this.icons = Array.from({ length: shown }, (_, i) => this.add.image(290 + i * 18, 13, 'player').setFlipX(MIRROR.has('player')));
      this.extra.setText(reserve > MAX_ICONS ? `x${reserve}` : reserve === 0 ? '-' : '').setX(reserve > MAX_ICONS ? 304 : 290);
    }

    const g = this.dynamic.clear();
    const flash = Math.sin(this.clock * 12) > -0.4;
    LAMPS.forEach(([key], i) => {
      const lit = s.lamps[key] && flash;
      g.fillStyle(lit ? COLORS.tech : 0x1f1512).fillRect(600 + i * 78, 3, 72, 20);
      this.lampText[i].setColor(lit ? '#070403' : TEXT.off);
    });

    // Route strip: five sectors of five beacons; filled up to where you are.
    const span = STRIP.x1 - STRIP.x0, seg = span / ROUTE;
    const filled = Math.min(1, s.progress / ROUTE) * span;
    g.fillStyle(COLORS.line).fillRect(STRIP.x0, STRIP.y, span, 4);
    g.fillStyle(s.dusk ? COLORS.tech : COLORS.rust).fillRect(STRIP.x0, STRIP.y, Math.round(filled), 4);
    for (let i = 0; i <= ROUTE; i++) {
      const x = Math.round(STRIP.x0 + i * seg), major = i % COURSE.beaconsPerSector === 0;
      g.fillStyle(i <= Math.floor(s.progress) ? COLORS.rust : 0x6e5348).fillRect(x - 1, major ? 28 : 32, 2, major ? 14 : 8);
    }
    const mx = Math.round(STRIP.x0 + filled);
    g.fillStyle(COLORS.ink).fillTriangle(mx - 5, 25, mx + 5, 25, mx, 31);

    if (s.banner.id !== this.shownBanner) this.showBanner(s.banner);
    this.overButtons.setVisible(s.over && s.device === 'touch');
    this.overHint.setVisible(s.over && s.device !== 'touch');

    this.hint.setText(s.over ? '' : HINTS[s.device]);
    const muted = this.registry.get(MUTED) === true;
    this.soundToggle.setText(s.device === 'touch' ? (muted ? 'SOUND OFF' : 'SOUND ON') : '').setColor(muted ? TEXT.danger : TEXT.dim);
  }

  private showBanner(b: Banner) {
    this.shownBanner = b.id;
    this.bannerFade?.remove();
    const parts = [this.bannerBg, this.bannerTitle, this.bannerSub];
    this.bannerTitle.setText(b.title);
    this.bannerSub.setText(b.sub);
    const w = Math.max(this.bannerTitle.width, this.bannerSub.width) + 48, x = W / 2 - w / 2;
    this.bannerBg.clear().fillStyle(COLORS.void, 0.82).fillRect(x, 58, w, 60).lineStyle(2, COLORS.rust, 0.6).strokeRect(x, 58, w, 60);
    for (const p of parts) p.setAlpha(1);
    if (b.ms > 0) this.bannerFade = this.tweens.add({ targets: parts, alpha: 0, delay: b.ms, duration: 400 });
  }
}
