import { Container, Graphics, Text } from 'pixi.js';
import type { Input } from '../../engine/input';

export interface MenuItem {
  label: string;
  disabled?: boolean;
  /** optional left/right handler (e.g. volume); returns the new label */
  adjust?: (delta: number) => string;
  action?: () => void;
}

/** Keyboard menu: up/down select, enter activates, left/right adjusts. */
export class MenuList {
  readonly container = new Container();
  private items: MenuItem[] = [];
  private texts: Text[] = [];
  private cursor = new Graphics();
  private index = 0;

  constructor(private readonly fontSize = 22) {
    this.container.addChild(this.cursor);
  }

  setItems(items: MenuItem[]): void {
    this.items = items;
    for (const t of this.texts) t.destroy();
    this.texts = [];
    items.forEach((item, i) => {
      const t = new Text({
        text: item.label,
        style: {
          fill: item.disabled ? 0x666677 : 0xd8d8e0,
          fontSize: this.fontSize,
          fontFamily: 'monospace',
        },
      });
      t.position.set(28, i * (this.fontSize + 14));
      this.texts.push(t);
      this.container.addChild(t);
    });
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    this.skipDisabled(1);
    this.drawCursor();
  }

  private skipDisabled(dir: number): void {
    let guard = 0;
    while (this.items[this.index]?.disabled && guard++ < this.items.length) {
      this.index = (this.index + dir + this.items.length) % this.items.length;
    }
  }

  private drawCursor(): void {
    this.cursor.clear();
    if (!this.items.length) return;
    const y = this.index * (this.fontSize + 14) + this.fontSize / 2 + 2;
    this.cursor.poly([8, y - 7, 20, y, 8, y + 7]).fill(0xffd97a);
    this.texts.forEach((t, i) => {
      t.style.fill = this.items[i]?.disabled ? 0x666677 : i === this.index ? 0xffd97a : 0xd8d8e0;
    });
  }

  update(input: Input): void {
    if (!this.items.length) return;
    if (input.justPressed('ArrowUp') || input.justPressed('KeyW')) {
      this.index = (this.index - 1 + this.items.length) % this.items.length;
      this.skipDisabled(-1);
      this.drawCursor();
    }
    if (input.justPressed('ArrowDown') || input.justPressed('KeyS')) {
      this.index = (this.index + 1) % this.items.length;
      this.skipDisabled(1);
      this.drawCursor();
    }
    const item = this.items[this.index];
    if (!item || item.disabled) return;
    if (item.adjust) {
      let delta = 0;
      if (input.justPressed('ArrowLeft') || input.justPressed('KeyA')) delta = -1;
      if (input.justPressed('ArrowRight') || input.justPressed('KeyD')) delta = 1;
      if (delta !== 0) {
        const label = item.adjust(delta);
        item.label = label;
        this.texts[this.index]!.text = label;
      }
    }
    if (input.justPressed('Enter') || input.justPressed('Space')) item.action?.();
  }
}
