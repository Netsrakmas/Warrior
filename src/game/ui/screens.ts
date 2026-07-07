import { Container, Graphics, Text } from 'pixi.js';
import { MenuList, type MenuItem } from './menu';
import type { Input } from '../../engine/input';

/** Full-screen overlay with a heading and a keyboard menu (title/pause/game-over). */
export class Screen {
  readonly container = new Container();
  readonly menu = new MenuList();
  private readonly bg = new Graphics();
  private readonly heading: Text;
  private readonly subheading: Text;

  constructor(heading: string, dim = 0.75) {
    this.container.visible = false;
    this.heading = new Text({
      text: heading,
      style: {
        fill: 0xffd97a,
        fontSize: 44,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        letterSpacing: 8,
      },
    });
    this.subheading = new Text({
      text: '',
      style: { fill: 0x8a8fa8, fontSize: 16, fontFamily: 'monospace' },
    });
    this.container.addChild(this.bg, this.heading, this.subheading, this.menu.container);
    this.dim = dim;
  }

  private dim: number;

  setHeading(text: string): void {
    this.heading.text = text;
  }

  setSubheading(text: string): void {
    this.subheading.text = text;
  }

  show(items: MenuItem[]): void {
    this.menu.setItems(items);
    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  update(input: Input, viewW: number, viewH: number): void {
    if (!this.container.visible) return;
    this.bg.clear();
    this.bg.rect(0, 0, viewW, viewH).fill({ color: 0x0a0a12, alpha: this.dim });
    this.heading.position.set((viewW - this.heading.width) / 2, viewH * 0.22);
    this.subheading.position.set((viewW - this.subheading.width) / 2, viewH * 0.22 + 60);
    this.menu.container.position.set(viewW / 2 - 140, viewH * 0.45);
    this.menu.update(input);
  }
}

/** Fade-to-black used by map transitions and scene changes. */
export class Fader {
  readonly container = new Container();
  private readonly g = new Graphics();
  private alpha = 0;
  private target = 0;
  private speed = 3.5; // alpha/sec
  private onDone: (() => void) | null = null;

  constructor() {
    this.container.addChild(this.g);
  }

  fadeOut(onDone: () => void): void {
    this.target = 1;
    this.onDone = onDone;
  }

  fadeIn(): void {
    this.target = 0;
    this.onDone = null;
  }

  /** Instantly black (used when booting into a fade-in). */
  snapBlack(): void {
    this.alpha = 1;
    this.target = 1;
  }

  get busy(): boolean {
    return this.alpha !== this.target || this.onDone !== null;
  }

  update(dt: number, viewW: number, viewH: number): void {
    if (this.alpha < this.target) this.alpha = Math.min(this.target, this.alpha + this.speed * dt);
    else if (this.alpha > this.target)
      this.alpha = Math.max(this.target, this.alpha - this.speed * dt);
    if (this.alpha === 1 && this.onDone) {
      const cb = this.onDone;
      this.onDone = null;
      cb();
    }
    this.g.clear();
    if (this.alpha > 0)
      this.g.rect(0, 0, viewW, viewH).fill({ color: 0x000000, alpha: this.alpha });
  }
}
