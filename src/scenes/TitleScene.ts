import Phaser from 'phaser';
import { FONT, MIRROR, RENDER_SCALE, SECTORS, SPRITES, TEXT, WIDTH, type SpriteKey } from '../config';
import { Backdrop } from '../backdrop';
import { Controls } from '../controls';
import { playSound, registerSounds, restoreMute, toggleMute } from '../sfx';
import { fitCamera } from '../view';

const AIR: SpriteKey[] = ['scout', 'bomber', 'diver'];
const GROUND: SpriteKey[] = ['boulder', 'mine', 'harvester', 'dozer'];

export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private backdrop!: Backdrop;
  private padStatus: Phaser.GameObjects.Text | undefined;
  private start!: Phaser.GameObjects.Text;
  private leaving = false;
  private camX = 0;
  private clock = 0;

  constructor() {
    super('title');
  }

  preload() {
    for (const key of SPRITES) this.load.image(key, `sprites/${key}.png`);
  }

  create() {
    this.leaving = false;
    this.padStatus = undefined;
    this.controls = new Controls(this);
    fitCamera(this, RENDER_SCALE);
    registerSounds(this);
    restoreMute(this);
    this.cameras.main.fadeIn(250);
    this.backdrop = new Backdrop(this, 0);
    this.backdrop.setLook(SECTORS[4].look, 'day');
    const sprite = (key: SpriteKey, x: number, y: number) => this.add.image(x, y, key).setFlipX(MIRROR.has(key)).setDepth(5);

    const cx = WIDTH / 2;
    const shade = this.add.graphics().setDepth(4);
    shade.fillStyle(0x070403, 0.72).fillRect(0, 0, WIDTH, 228);
    const text = (x: number, y: number, str: string, size: number, color: string) =>
      this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5, 0).setDepth(5);

    text(cx, 10, 'A ROVER PATROL FROM CHRYSE FLATS TO OLYMPUS', 8, TEXT.dim);
    text(cx, 20, 'MARS PATROL', 24, TEXT.rust);
    text(cx, 48, 'JUMP THE CRATERS. SHOOT THE MACHINES. BEAT PAR.', 8, TEXT.ink);

    text(70, 64, 'YOU', 8, TEXT.dim);
    sprite('player', 70, 84);
    text(178, 64, 'AIR: SHOOT UP', 8, TEXT.tech);
    AIR.forEach((key, i) => sprite(key, 160 + i * 18, 84));
    text(320, 64, 'GROUND: JUMP OR SHOOT', 8, TEXT.tech);
    GROUND.forEach((key, i) => sprite(key, 293 + i * 18, 84));

    this.start = text(cx, 106, '> START <', 16, TEXT.rust).setInteractive({ useHandCursor: true });
    this.start.on('pointerdown', () => this.begin());
    const touchScreen = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    text(cx, 128, touchScreen ? 'TAP START' : 'PRESS ENTER OR A, OR CLICK START', 8, TEXT.dim);

    const column = (x: number, title: string, keys: string, actions: string) => {
      text(x, 146, title, 8, TEXT.rust);
      this.add.text(x - 4, 158, keys, { fontFamily: FONT, fontSize: '8px', color: TEXT.ink, align: 'right', lineSpacing: 2 }).setOrigin(1, 0).setDepth(5);
      this.add.text(x + 4, 158, actions, { fontFamily: FONT, fontSize: '8px', color: TEXT.dim, lineSpacing: 2 }).setDepth(5);
    };
    if (touchScreen) {
      column(cx, 'TOUCH', 'LEFT THUMB\nRIGHT THUMB\nTAP', '◀ ▶ SPEED\nJUMP + FIRE\nSOUND, BOTTOM RIGHT');
      return;
    }
    column(112, 'KEYBOARD + MOUSE', '← →\n↑ / SPACE\nZ / CLICK\nM', 'BRAKE / BOOST\nJUMP\nFIRE\nSOUND ON/OFF');
    column(304, 'CONTROLLER', 'L-STICK\nA\nX / RT\nY', 'BRAKE / BOOST\nJUMP\nFIRE\nSOUND ON/OFF');
    this.padStatus = text(cx, 214, '', 8, TEXT.dim);
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    this.clock += dt;
    this.camX += 30 * dt;
    this.backdrop.update(this.camX, this.clock);
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (input.confirm) this.begin();
    this.start.setAlpha(Math.sin(this.clock * 4) > -0.5 ? 1 : 0.5);
    const pad = this.controls.pad();
    this.padStatus?.setText(pad ? 'CONTROLLER CONNECTED' : 'USING A CONTROLLER? PRESS ANY BUTTON ON IT').setColor(pad ? TEXT.tech : TEXT.dim);
  }

  private begin() {
    if (this.leaving) return;
    this.leaving = true;
    playSound(this, 'start');
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('patrol'));
  }
}
