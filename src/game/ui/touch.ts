import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import type { Input } from '../../engine/input';

const STICK_RADIUS = 60;
const STICK_DEADZONE = 0.18;
const BTN_ALPHA = 0.55;

interface TouchButton {
  view: Container;
  code: string;
  r: number;
  /** layout offsets from the bottom-right corner (or top-right for small) */
  ox: number;
  oy: number;
  corner: 'br' | 'tr';
}

/**
 * Mobile controls (pulled forward from the backlog for on-device testing):
 * left-half virtual stick → analog intent; right-side buttons → virtual keys.
 * Everything routes through the existing Input, so game logic is unchanged.
 */
export class TouchControls {
  readonly container = new Container();
  private readonly zone = new Container();
  private readonly stickBase = new Graphics();
  private readonly stickKnob = new Graphics();
  private readonly buttons: TouchButton[] = [];
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private viewW = 0;
  private viewH = 0;
  /** action buttons hidden outside active play (menus are tap-driven instead) */
  private actionsVisible = true;

  constructor(private readonly input: Input) {
    // Stick zone: left ~55% of the screen; hitArea set in layout().
    this.zone.eventMode = 'static';
    this.zone.on('pointerdown', (e) => this.stickDown(e));
    this.zone.on('globalpointermove', (e) => this.stickMove(e));
    this.zone.on('pointerup', (e) => this.stickUp(e));
    this.zone.on('pointerupoutside', (e) => this.stickUp(e));
    this.zone.on('pointercancel', (e) => this.stickUp(e));
    this.container.addChild(this.zone);

    this.stickBase.circle(0, 0, STICK_RADIUS).stroke({ width: 3, color: 0xd8dce8, alpha: 0.5 });
    this.stickBase.circle(0, 0, STICK_RADIUS * 0.25).fill({ color: 0xd8dce8, alpha: 0.15 });
    this.stickKnob.circle(0, 0, 26).fill({ color: 0xd8dce8, alpha: 0.5 });
    this.stickBase.visible = false;
    this.stickKnob.visible = false;
    this.container.addChild(this.stickBase, this.stickKnob);

    // Action cluster (bottom-right) + system buttons (top-right).
    this.addButton('⚔', 'Space', 44, -70, -80, 'br');
    this.addButton('E', 'KeyE', 34, -170, -140, 'br');
    this.addButton('⚡', 'KeyX', 34, -60, -195, 'br');
    this.addButton('☰', 'Escape', 24, -40, 84, 'tr');
    this.addButton('!', 'KeyQ', 24, -100, 84, 'tr');
  }

  private addButton(
    label: string,
    code: string,
    r: number,
    ox: number,
    oy: number,
    corner: 'br' | 'tr',
  ): void {
    const view = new Container();
    const g = new Graphics();
    g.circle(0, 0, r).fill({ color: 0x14141f, alpha: BTN_ALPHA }).stroke({
      width: 3,
      color: 0xd8dce8,
      alpha: 0.6,
    });
    const t = new Text({
      text: label,
      style: { fill: 0xd8dce8, fontSize: r * 0.8, fontFamily: 'monospace', fontWeight: 'bold' },
    });
    t.anchor.set(0.5);
    view.addChild(g, t);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    const press = (): void => {
      g.alpha = 1.6;
      this.input.virtualDown(code);
    };
    const release = (): void => {
      g.alpha = 1;
      this.input.virtualUp(code);
    };
    view.on('pointerdown', press);
    view.on('pointerup', release);
    view.on('pointerupoutside', release);
    view.on('pointercancel', release);
    this.buttons.push({ view, code, r, ox, oy, corner });
    this.container.addChild(view);
  }

  private stickDown(e: FederatedPointerEvent): void {
    if (this.stickPointer !== null) return;
    this.stickPointer = e.pointerId;
    this.stickOrigin = { x: e.global.x, y: e.global.y };
    this.stickBase.position.copyFrom(e.global);
    this.stickKnob.position.copyFrom(e.global);
    this.stickBase.visible = true;
    this.stickKnob.visible = true;
    this.input.setAnalog(null);
  }

  private stickMove(e: FederatedPointerEvent): void {
    if (e.pointerId !== this.stickPointer) return;
    let dx = e.global.x - this.stickOrigin.x;
    let dy = e.global.y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.stickKnob.position.set(this.stickOrigin.x + dx, this.stickOrigin.y + dy);
    const ix = dx / STICK_RADIUS;
    const iy = dy / STICK_RADIUS;
    this.input.setAnalog(Math.hypot(ix, iy) < STICK_DEADZONE ? null : { x: ix, y: iy });
  }

  private stickUp(e: FederatedPointerEvent): void {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.stickBase.visible = false;
    this.stickKnob.visible = false;
    this.input.setAnalog(null);
  }

  /** Called each frame: reposition for the current view and game mode. */
  layout(viewW: number, viewH: number, playing: boolean): void {
    if (viewW !== this.viewW || viewH !== this.viewH) {
      this.viewW = viewW;
      this.viewH = viewH;
      this.zone.hitArea = new Rectangle(0, 0, viewW * 0.55, viewH);
      for (const b of this.buttons) {
        b.view.position.set(viewW + b.ox, b.corner === 'br' ? viewH + b.oy : b.oy);
      }
    }
    if (playing !== this.actionsVisible) {
      this.actionsVisible = playing;
      this.zone.eventMode = playing ? 'static' : 'none';
      for (const b of this.buttons) {
        // ⚔/E/⚡ + journal only during play; ☰ stays (opens/closes pause).
        b.view.visible = playing || b.code === 'Escape';
      }
      if (!playing && this.stickPointer !== null) {
        this.stickPointer = null;
        this.stickBase.visible = false;
        this.stickKnob.visible = false;
        this.input.setAnalog(null);
      }
    }
  }

  /** Test hook: where the buttons are, for e2e taps. */
  debugInfo(): { code: string; x: number; y: number; r: number }[] {
    return this.buttons.map((b) => ({
      code: b.code,
      x: b.view.position.x,
      y: b.view.position.y,
      r: b.r,
    }));
  }
}
