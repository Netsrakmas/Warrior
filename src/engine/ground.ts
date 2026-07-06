import { Container, Graphics, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { TILE_W, TILE_H, worldToScreen } from './iso';

/**
 * Ground layer: never depth-sorted. Pre-rendered to RenderTextures in
 * 8×8-tile chunks; chunks outside the camera view are culled — PLAN §7.
 */

export const CHUNK_TILES = 8;

/** Grey-box tile palette (replaced by real tilesets in Phase 5). */
const TILE_COLORS: Record<number, number> = {
  1: 0x3d5c3d, // grass A
  2: 0x466a46, // grass B
  3: 0x8a7a5a, // path
  4: 0x2a6b7a, // water
};
const TILE_EDGE = 0x2c422c;

interface Chunk {
  sprite: Sprite;
  rect: Rectangle; // bounds in world-screen px
}

export class GroundLayer {
  readonly container = new Container();
  private chunks: Chunk[] = [];

  constructor(renderer: Renderer, ground: number[][], mapWidth: number, mapHeight: number) {
    for (let cy = 0; cy < mapHeight; cy += CHUNK_TILES) {
      for (let cx = 0; cx < mapWidth; cx += CHUNK_TILES) {
        const chunk = this.buildChunk(renderer, ground, cx, cy, mapWidth, mapHeight);
        if (chunk) {
          this.chunks.push(chunk);
          this.container.addChild(chunk.sprite);
        }
      }
    }
  }

  private buildChunk(
    renderer: Renderer,
    ground: number[][],
    cx: number,
    cy: number,
    mapWidth: number,
    mapHeight: number,
  ): Chunk | null {
    const txEnd = Math.min(cx + CHUNK_TILES, mapWidth);
    const tyEnd = Math.min(cy + CHUNK_TILES, mapHeight);

    // Screen-space bounds of this chunk's diamond footprint.
    const originX = worldToScreen(cx, tyEnd).x; // leftmost corner
    const originY = worldToScreen(cx, cy).y; // topmost corner
    const w = worldToScreen(txEnd, cy).x - originX;
    const h = worldToScreen(txEnd, tyEnd).y - originY;

    const g = new Graphics();
    let drewAny = false;
    for (let ty = cy; ty < tyEnd; ty++) {
      const row = ground[ty];
      if (!row) continue;
      for (let tx = cx; tx < txEnd; tx++) {
        const id = row[tx];
        if (!id) continue;
        drewAny = true;
        const top = worldToScreen(tx, ty);
        const lx = top.x - originX;
        const ly = top.y - originY;
        g.poly([
          lx,
          ly,
          lx + TILE_W / 2,
          ly + TILE_H / 2,
          lx,
          ly + TILE_H,
          lx - TILE_W / 2,
          ly + TILE_H / 2,
        ])
          .fill(TILE_COLORS[id] ?? 0x555555)
          .stroke({ width: 1, color: TILE_EDGE, alpha: 0.5 });
      }
    }
    if (!drewAny) {
      g.destroy();
      return null;
    }

    const texture: Texture = renderer.generateTexture({
      target: g,
      frame: new Rectangle(0, 0, w, h),
      antialias: false,
    });
    g.destroy();

    const sprite = new Sprite(texture);
    sprite.position.set(originX, originY);
    return { sprite, rect: new Rectangle(originX, originY, w, h) };
  }

  /** Hide chunks fully outside the view rect (world-screen px). */
  cull(view: Rectangle): void {
    for (const chunk of this.chunks) {
      chunk.sprite.visible =
        chunk.rect.x < view.x + view.width &&
        chunk.rect.x + chunk.rect.width > view.x &&
        chunk.rect.y < view.y + view.height &&
        chunk.rect.y + chunk.rect.height > view.y;
    }
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  get visibleChunkCount(): number {
    return this.chunks.filter((c) => c.sprite.visible).length;
  }
}
