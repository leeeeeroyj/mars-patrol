import Phaser from 'phaser';
import { touchButtons } from './touch';

export type Device = 'kbm' | 'pad' | 'touch';

export interface ControlState {
  /** -1 brake, 0 cruise, 1 boost. */
  dir: number;
  /** Held: the rover jumps whenever it's on the ground and this is down. */
  jump: boolean;
  fire: boolean;
  confirm: boolean;
  back: boolean;
  mute: boolean;
  device: Device;
}

const DEADZONE = 0.3;
const TRIGGER_THRESHOLD = 0.3;
// Standard gamepad mapping (Xbox layout).
const BTN = { A: 0, B: 1, X: 2, Y: 3, START: 9 } as const;
const TRACKED = Object.values(BTN);

type KeyName = 'LEFT' | 'RIGHT' | 'UP' | 'A' | 'D' | 'W' | 'SPACE' | 'Z' | 'J' | 'X' | 'M' | 'ENTER' | 'ESC';

/**
 * One input layer. Keyboard: left/right (or A/D) brake and boost, up/W/space jump, Z/J/X fire, M sound.
 * Mouse: left button fires, right button jumps. Controller: left stick or D-pad brake/boost, A jump, X/RT/RB fire,
 * Y sound. Touch: four buttons (src/touch.ts). The last device used decides which hints are shown.
 */
export class Controls {
  device: Device = window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'kbm';
  private prevButtons = new Set<number>();
  private readonly keys: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor(private readonly scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE,Z,J,X,M,ENTER,ESC') as Controls['keys'];
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.device = p.wasTouch ? 'touch' : 'kbm'));
  }

  pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const pad = this.scene.input.gamepad?.pad1;
    return pad && pad.connected ? pad : undefined;
  }

  read(): ControlState {
    const k = this.keys;
    const just = Phaser.Input.Keyboard.JustDown;
    const pointer = this.scene.input.activePointer;
    const mouse = !pointer.wasTouch && pointer.isDown;
    let dir = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let jump = k.UP.isDown || k.W.isDown || k.SPACE.isDown || (mouse && pointer.rightButtonDown());
    let fire = k.Z.isDown || k.J.isDown || k.X.isDown || (mouse && pointer.leftButtonDown());
    let confirm = just(k.ENTER) || just(k.SPACE);
    let back = just(k.ESC);
    let mute = just(k.M);
    if (dir || jump || fire || confirm || back || mute) this.device = 'kbm';

    const pad = this.pad();
    const down = new Set(pad ? TRACKED.filter((i) => pad.buttons[i]?.pressed) : []);
    const edges = new Set([...down].filter((i) => !this.prevButtons.has(i)));
    this.prevButtons = down;
    if (pad) {
      const x = Math.abs(pad.leftStick.x) < DEADZONE ? 0 : Math.sign(pad.leftStick.x);
      const padDir = pad.left ? -1 : pad.right ? 1 : x;
      const padFire = down.has(BTN.X) || pad.R2 > TRIGGER_THRESHOLD || pad.R1 > TRIGGER_THRESHOLD;
      if (padDir || down.size || padFire) this.device = 'pad';
      if (padDir) dir = padDir;
      jump ||= down.has(BTN.A);
      fire ||= padFire;
      confirm ||= edges.has(BTN.A) || edges.has(BTN.START);
      back ||= edges.has(BTN.B);
      mute ||= edges.has(BTN.Y);
    }

    touchButtons.render();
    if (touchButtons.active) {
      this.device = 'touch';
      const t = (b: Parameters<typeof touchButtons.pressed>[0]) => touchButtons.pressed(b);
      if (t('brake') || t('boost')) dir = (t('boost') ? 1 : 0) - (t('brake') ? 1 : 0);
      jump ||= t('jump');
      fire ||= t('fire');
    }
    return { dir, jump, fire, confirm, back, mute, device: this.device };
  }
}
