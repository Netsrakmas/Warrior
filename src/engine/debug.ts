import { Container, Graphics, Text } from 'pixi.js';
import { TILE_W, TILE_H, worldToScreen } from './iso';
import { isBlocked, type CollisionGrid } from './collision';
import { PLAYER_RADIUS, type Player } from '../game/entities/player';

/**
 * F3 debug overlay — PLAN §7: fps, tile coords, collision grid, footprints, depth keys.
 * `screenLayer` sits on the stage (fixed); `worldLayer` goes inside the world container.
 */
export class DebugOverlay {
  readonly screenLayer = new Container();
  readonly worldLayer = new Container();
  private readonly text: Text;
  private readonly collisionG = new Graphics();
  private readonly footprintG = new Graphics();
  private enabled = false;
  private collisionDrawn = false;

  constructor() {
    this.text = new Text({
      text: '',
      style: { fill: 0xffffff, fontSize: 14, fontFamily: 'monospace', lineHeight: 18 },
    });
    this.text.position.set(8, 8);
    this.screenLayer.addChild(this.text);
    this.worldLayer.addChild(this.collisionG, this.footprintG);
    this.worldLayer.zIndex = 10_000; // always on top of world content
    this.setEnabled(false);
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  private setEnabled(on: boolean): void {
    this.enabled = on;
    this.screenLayer.visible = on;
    this.worldLayer.visible = on;
  }

  update(
    fps: number,
    player: Player,
    grid: CollisionGrid,
    visibleChunks: number,
    totalChunks: number,
  ): void {
    if (!this.enabled) return;

    this.text.text =
      `fps ${fps.toFixed(0)}\n` +
      `pos ${player.x.toFixed(2)}, ${player.y.toFixed(2)}\n` +
      `tile ${Math.floor(player.x)}, ${Math.floor(player.y)}\n` +
      `facing ${player.facing}  depth ${player.depth.toFixed(2)}\n` +
      `chunks ${visibleChunks}/${totalChunks}`;

    if (!this.collisionDrawn) {
      this.drawCollision(grid);
      this.collisionDrawn = true;
    }

    // Footprint circle in world space renders as a screen-space ellipse.
    const s = worldToScreen(player.x, player.y);
    const rx = (PLAYER_RADIUS * TILE_W) / Math.SQRT2;
    const ry = (PLAYER_RADIUS * TILE_H) / Math.SQRT2;
    this.footprintG.clear();
    this.footprintG.ellipse(s.x, s.y, rx, ry).stroke({ width: 2, color: 0x00ff88 });
  }

  private drawCollision(grid: CollisionGrid): void {
    this.collisionG.clear();
    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        if (!isBlocked(grid, tx, ty)) continue;
        const top = worldToScreen(tx, ty);
        this.collisionG
          .poly([
            top.x,
            top.y,
            top.x + TILE_W / 2,
            top.y + TILE_H / 2,
            top.x,
            top.y + TILE_H,
            top.x - TILE_W / 2,
            top.y + TILE_H / 2,
          ])
          .fill({ color: 0xff3333, alpha: 0.25 });
      }
    }
  }
}
