import { Container, Graphics, Texture } from 'pixi.js';
import { depthOf, facingFromVector, worldToScreen, type Facing } from '../../engine/iso';
import { moveCircle, type CollisionGrid } from '../../engine/collision';
import { AnimSprite, type SpriteDef } from '../../engine/anim';
import type { Input } from '../../engine/input';

const SPEED = 4; // tiles per second
export const PLAYER_RADIUS = 0.3; // footprint, tile units (matches hero.json)

export interface HeroAssets {
  def: SpriteDef;
  sheet: Texture;
}

/** The hero: sprite-tool-defined animations when assets exist, grey-box slab otherwise. */
export class Player {
  readonly view = new Container();
  x: number;
  y: number;
  facing: Facing = 'SE';
  readonly radius: number;
  private readonly anim: AnimSprite | null = null;
  private moving = false;
  private prevX: number;
  private prevY: number;

  constructor(spawnX: number, spawnY: number, assets?: HeroAssets) {
    this.x = spawnX;
    this.y = spawnY;
    this.prevX = spawnX;
    this.prevY = spawnY;
    this.radius = assets?.def.footprint.r ?? PLAYER_RADIUS;

    // Blob shadow (engine-drawn — PLAN §5.2).
    const shadow = new Graphics();
    shadow.ellipse(0, 0, 34, 17).fill({ color: 0x000000, alpha: 0.3 });
    this.view.addChild(shadow);

    if (assets) {
      this.anim = new AnimSprite(assets.def, assets.sheet);
      this.anim.play('idle', this.facing);
      this.view.addChild(this.anim);
    } else {
      const g = new Graphics();
      g.rect(-20, -78, 40, 72).fill(0xd9a066).stroke({ width: 2, color: 0x5a3a1a });
      g.rect(-6, -70, 12, 10).fill(0x5a3a1a);
      this.view.addChild(g);
    }
    this.syncView(1);
  }

  update(dt: number, input: Input, grid: CollisionGrid): void {
    this.prevX = this.x;
    this.prevY = this.y;

    const dir = input.worldDir();
    this.moving = dir.x !== 0 || dir.y !== 0;
    if (this.moving) {
      this.facing = facingFromVector(dir.x, dir.y);
      const next = moveCircle(
        grid,
        this.x,
        this.y,
        this.radius,
        dir.x * SPEED * dt,
        dir.y * SPEED * dt,
      );
      this.x = next.x;
      this.y = next.y;
    }

    if (this.anim) {
      this.anim.play(this.moving ? 'walk' : 'idle', this.facing);
      this.anim.update(dt);
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

  get animInfo(): { name: string; frame: number } | null {
    return this.anim ? { name: this.anim.animName, frame: this.anim.frame } : null;
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
