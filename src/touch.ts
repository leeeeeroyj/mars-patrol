import { WIDTH } from './config';

export type TouchButton = 'brake' | 'boost' | 'fire' | 'jump';

const BUTTONS: TouchButton[] = ['brake', 'boost', 'fire', 'jump'];
const LABELS: Record<TouchButton, string> = { brake: '◀', boost: '▶', fire: 'FIRE', jump: 'JUMP' };
const RGB: Record<TouchButton, string> = { brake: '243, 229, 217', boost: '243, 229, 217', fire: '255, 130, 67', jump: '79, 220, 200' };
/** Over the game: bottom-corner spots in design pixels, and the radius. */
const OVERLAY = { radius: 14, brake: { x: 22, y: 204 }, boost: { x: 56, y: 204 }, fire: { x: 358, y: 206 }, jump: { x: 394, y: 180 } };
/** A touch within this many radii of a button's centre presses it. */
const GRAB = 1.5;
/** Gap (CSS px) between buttons and screen edges. */
const MARGIN = 8;

type Layout = { radius: number; centers: Record<TouchButton, { x: number; y: number }> };

/**
 * Four touch buttons drawn as page elements: brake and boost under the left thumb, fire and jump under the right.
 * They sit in the empty bars beside the game when those are wide enough, otherwise over its bottom corners.
 * Touches are read from the whole page, because Phaser only hears touches that start on its canvas. A thumb can
 * slide between brake and boost (or fire and jump) without lifting.
 */
class TouchButtons {
  private readonly held = new Map<number, TouchButton | null>();
  private els: Record<TouchButton, HTMLDivElement> | undefined;
  private shown = false;
  private touched = false;
  private readonly coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  constructor() {
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.shown) return;
      this.touched = true;
      this.held.set(e.pointerId, this.hit(e.clientX, e.clientY));
    });
    window.addEventListener('pointermove', (e) => {
      if (this.held.has(e.pointerId)) this.held.set(e.pointerId, this.hit(e.clientX, e.clientY));
    });
    const up = (e: PointerEvent) => this.held.delete(e.pointerId);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Shown during play on touch screens (or once the screen has been touched); hidden on the title screen. */
  show(on: boolean) {
    this.shown = on;
    if (!on) this.held.clear();
    this.render();
  }

  get active() {
    return [...this.held.values()].some(Boolean);
  }

  pressed(which: TouchButton) {
    for (const b of this.held.values()) if (b === which) return true;
    return false;
  }

  /** Redraws the buttons. Call once per frame while playing. */
  render() {
    const visible = this.shown && (this.coarse || this.touched);
    if (!visible) {
      if (this.els) for (const b of BUTTONS) this.els[b].style.display = 'none';
      return;
    }
    const els = (this.els ??= this.build());
    const { radius, centers } = this.layout();
    for (const b of BUTTONS) {
      const c = centers[b], on = this.pressed(b);
      Object.assign(els[b].style, {
        display: 'flex', left: `${c.x - radius}px`, top: `${c.y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px`,
        fontSize: `${Math.max(10, radius * 0.5)}px`,
        background: `rgba(${RGB[b]}, ${on ? 0.45 : 0.12})`, border: `2px solid rgba(${RGB[b]}, ${on ? 0.8 : 0.45})`,
      });
    }
  }

  private hit(x: number, y: number): TouchButton | null {
    const { radius, centers } = this.layout();
    let best: TouchButton | null = null, bestD = radius * GRAB;
    for (const b of BUTTONS) {
      const d = Math.hypot(x - centers[b].x, y - centers[b].y);
      if (d < bestD) [best, bestD] = [b, d];
    }
    return best;
  }

  private layout(): Layout {
    const canvas = document.querySelector('#game canvas');
    const rect = canvas?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const k = rect.width / WIDTH;
    const base = OVERLAY.radius * k;
    const gutter = Math.min(rect.left, window.innerWidth - rect.right);
    // Wide screens: two buttons side by side in each bar beside the game.
    const sideRadius = Math.min(base * 1.3, (gutter - MARGIN * 3) / 4);
    if (sideRadius >= base * 0.8) {
      const r = sideRadius, y = Math.min(rect.bottom - r - MARGIN, window.innerHeight - r - MARGIN);
      const l = gutter / 2, rt = window.innerWidth - gutter / 2, dx = r + MARGIN / 2;
      return {
        radius: r,
        centers: { brake: { x: l - dx, y }, boost: { x: l + dx, y }, fire: { x: rt - dx, y }, jump: { x: rt + dx, y: y - r * 1.2 } },
      };
    }
    const at = (p: { x: number; y: number }) => ({ x: rect.left + p.x * k, y: rect.top + p.y * k });
    return { radius: base, centers: { brake: at(OVERLAY.brake), boost: at(OVERLAY.boost), fire: at(OVERLAY.fire), jump: at(OVERLAY.jump) } };
  }

  private build() {
    const make = (b: TouchButton) => {
      const el = document.createElement('div');
      el.textContent = LABELS[b];
      Object.assign(el.style, {
        position: 'fixed', borderRadius: '50%', pointerEvents: 'none', zIndex: '5', boxSizing: 'border-box',
        alignItems: 'center', justifyContent: 'center', color: '#f3e5d9', fontFamily: 'Silkscreen, monospace',
      });
      document.body.append(el);
      return el;
    };
    return { brake: make('brake'), boost: make('boost'), fire: make('fire'), jump: make('jump') };
  }
}

export const touchButtons = new TouchButtons();
