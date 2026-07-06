import { Container, Graphics } from 'pixi.js';
import { depthOf, facingFromVector, worldToScreen, type Facing } from '../../engine/iso';
import { moveCircle, type CollisionGrid } from '../../engine/collision';
import type { Input } from '../../engine/input';

const SPEED = 4; // tiles per second
export const PLAYER_RADIUS = 0.3; // footprint, tile units

/** Grey-box hero: an outlined slab + engine blob shadow. Real sprites arrive in Phase 5. */
export class Player {
  readonly view = new Container();
  x: number;
  y: number;
  facing: Facing = 'SE';
  private prevX: number;
  private prevY: number;

  constructor(spawnX: number, spawnY: number) {
    this.x = spawnX;
    this.y = spawnY;
    this.prevX = spawnX;
    this.prevY = spawnY;

    const g = new Graphics();
    // Blob shadow (engine-drawn — PLAN §5.2).
    g.ellipse(0, 0, 34, 17).fill({ color: 0x000000, alpha: 0.3 });
    // Body slab, anchored at the feet.
    g.rect(-20, -78, 40, 72).fill(0xd9a066).stroke({ width: 2, color: 0x5a3a1a });
    // Facing tick so orientation is readable in grey-box.
    g.rect(-6, -70, 12, 10).fill(0x5a3a1a);
    this.view.addChild(g);
    this.syncView(1);
  }

  update(dt: number, input: Input, grid: CollisionGrid): void {
    this.prevX = this.x;
    this.prevY = this.y;

    const dir = input.worldDir();
    if (dir.x !== 0 || dir.y !== 0) {
      this.facing = facingFromVector(dir.x, dir.y);
      const next = moveCircle(
        grid,
        this.x,
        this.y,
        PLAYER_RADIUS,
        dir.x * SPEED * dt,
        dir.y * SPEED * dt,
      );
      this.x = next.x;
      this.y = next.y;
    }
  }

  teleport(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
  }

  get depth(): number {
    return depthOf(this.x, this.y);
  }

  /** Interpolated render position between sim ticks. */
  syncView(alpha: number): void {
    const ix = this.prevX + (this.x - this.prevX) * alpha;
    const iy = this.prevY + (this.y - this.prevY) * alpha;
    const s = worldToScreen(ix, iy);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(ix, iy);
  }
}
