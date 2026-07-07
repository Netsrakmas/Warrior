import { screenDirToWorld, type Vec2 } from './iso';

/**
 * Keyboard input → 8-way screen intent → world-axis movement (PLAN §5.1).
 * "Up" on the keyboard is screen-up, i.e. world (-1,-1) normalized.
 */

const KEY_DIRS: Record<string, Vec2> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

export class Input {
  private down = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (KEY_DIRS[e.code] || e.code === 'F3' || e.code === 'Space' || e.code === 'Tab')
      e.preventDefault();
    this.down.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => {
    this.down.clear();
  };

  attach(target: Window): void {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(target: Window): void {
    target.removeEventListener('keydown', this.onKeyDown);
    target.removeEventListener('keyup', this.onKeyUp);
    target.removeEventListener('blur', this.onBlur);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Consume a one-shot press (returns true once per physical press). */
  private consumed = new Set<string>();
  justPressed(code: string): boolean {
    if (this.down.has(code) && !this.consumed.has(code)) {
      this.consumed.add(code);
      return true;
    }
    if (!this.down.has(code)) this.consumed.delete(code);
    return false;
  }

  /** Raw screen-space intent from held keys, each axis in {-1, 0, 1}. */
  screenIntent(): Vec2 {
    let x = 0;
    let y = 0;
    for (const [code, dir] of Object.entries(KEY_DIRS)) {
      if (this.down.has(code)) {
        x += dir.x;
        y += dir.y;
      }
    }
    return { x: Math.sign(x), y: Math.sign(y) };
  }

  /** Normalized world-space movement direction. */
  worldDir(): Vec2 {
    const s = this.screenIntent();
    return screenDirToWorld(s.x, s.y);
  }
}
