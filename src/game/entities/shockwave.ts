import { Container, Graphics } from 'pixi.js';
import { TILE_W, TILE_H, worldToScreen } from '../../engine/iso';
import type { Combatant } from '../systems/combat';

const SPEED = 3.2; // tiles/sec — outrunnable at player speed 4 (the dodge)
const MAX_R = 5.5;
const BAND = 0.35;

/** Expanding grey ring from the Warden; hits once as it passes the player. */
export class Shockwave {
  readonly view = new Container();
  dead = false;
  private r = 0.4;
  private didHit = false;
  private readonly g = new Graphics();

  constructor(
    private readonly x: number,
    private readonly y: number,
  ) {
    this.view.addChild(this.g);
    const s = worldToScreen(x, y);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = 8_500;
  }

  update(dt: number, player: Combatant & { alive: boolean }): void {
    this.r += SPEED * dt;
    if (this.r > MAX_R) {
      this.dead = true;
      return;
    }
    if (!this.didHit && player.alive) {
      const dist = Math.hypot(player.x - this.x, player.y - this.y);
      if (Math.abs(dist - this.r) < BAND) {
        const landed = player.applyHit({
          damage: 1,
          fromX: this.x,
          fromY: this.y,
          knockback: 5,
        });
        if (landed) this.didHit = true;
      }
    }
    const alpha = 1 - this.r / MAX_R;
    const rx = (this.r * TILE_W) / Math.SQRT2;
    const ry = (this.r * TILE_H) / Math.SQRT2;
    this.g.clear();
    this.g.ellipse(0, 0, rx, ry).stroke({ width: 8, color: 0x9aa0b8, alpha: alpha * 0.9 });
    this.g.ellipse(0, 0, rx * 0.92, ry * 0.92).stroke({ width: 3, color: 0xd8dce8, alpha });
  }
}
