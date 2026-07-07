import { Container, Graphics } from 'pixi.js';
import { depthOf, worldToScreen } from '../../engine/iso';
import { isBlocked, type CollisionGrid } from '../../engine/collision';
import { circlesOverlap, type Combatant } from '../systems/combat';

const SPEED = 5; // tiles/sec
const RADIUS = 0.15;
const TTL = 2.5;

/** Enemy spit projectile: flies straight, dies on walls, damages the player. */
export class Projectile {
  readonly view = new Container();
  dead = false;
  private age = 0;

  constructor(
    public x: number,
    public y: number,
    private readonly dirX: number,
    private readonly dirY: number,
  ) {
    const g = new Graphics();
    g.ellipse(0, 0, 10, 5).fill({ color: 0x000000, alpha: 0.25 });
    g.circle(0, -22, 8).fill(0x8aa06a).stroke({ width: 2, color: 0x2c3c24 });
    this.view.addChild(g);
    this.syncView();
  }

  update(dt: number, grid: CollisionGrid, player: Combatant & { alive: boolean }): void {
    this.age += dt;
    if (this.age > TTL) {
      this.dead = true;
      return;
    }
    this.x += this.dirX * SPEED * dt;
    this.y += this.dirY * SPEED * dt;
    if (isBlocked(grid, Math.floor(this.x), Math.floor(this.y))) {
      this.dead = true;
      return;
    }
    if (player.alive && circlesOverlap(this.x, this.y, RADIUS, player.x, player.y, player.radius)) {
      const landed = player.applyHit({
        damage: 1,
        fromX: this.x - this.dirX,
        fromY: this.y - this.dirY,
        knockback: 4,
      });
      if (landed) this.dead = true;
    }
    this.syncView();
  }

  syncView(): void {
    const s = worldToScreen(this.x, this.y);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(this.x, this.y);
  }
}
