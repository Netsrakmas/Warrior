import { Container, Graphics } from 'pixi.js';
import { depthOf, worldToScreen } from '../../engine/iso';

export type PickupType = 'heart' | 'shard';

const MAGNET_RANGE = 1.2;
const MAGNET_SPEED = 6;
const COLLECT_RANGE = 0.35;

/** Dropped collectible: bobs in place, magnets to the player, collected on contact. */
export class Pickup {
  readonly view = new Container();
  collected = false;
  private age = 0;

  constructor(
    readonly type: PickupType,
    public x: number,
    public y: number,
  ) {
    const g = new Graphics();
    if (type === 'heart') {
      g.circle(-5, -4, 6).fill(0xd94a5a);
      g.circle(5, -4, 6).fill(0xd94a5a);
      g.poly([-10, -1, 10, -1, 0, 12]).fill(0xd94a5a);
      g.stroke({ width: 1.5, color: 0x5a1a22 });
    } else {
      g.poly([0, -12, 8, 2, 0, 8, -8, 2]).fill(0x5ad9c8).stroke({ width: 1.5, color: 0x1a5a52 });
    }
    g.position.y = -14;
    this.view.addChild(g);
  }

  /** Returns true when collected this tick. */
  update(dt: number, playerX: number, playerY: number): boolean {
    this.age += dt;
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < COLLECT_RANGE) {
      this.collected = true;
      return true;
    }
    if (dist < MAGNET_RANGE && this.age > 0.35) {
      this.x += (dx / dist) * MAGNET_SPEED * dt;
      this.y += (dy / dist) * MAGNET_SPEED * dt;
    }
    return false;
  }

  syncView(): void {
    const s = worldToScreen(this.x, this.y);
    this.view.position.set(s.x, s.y + Math.sin(this.age * 5) * 3);
    this.view.zIndex = depthOf(this.x, this.y);
  }
}
