import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { depthOf, worldToScreen } from '../../engine/iso';
import { Camera } from '../../engine/camera';
import { GroundLayer } from '../../engine/ground';
import { DebugOverlay } from '../../engine/debug';
import type { CollisionGrid } from '../../engine/collision';
import type { Input } from '../../engine/input';
import type { MapData } from '../types';
import { Player, type HeroAssets } from '../entities/player';

/** Grey-box world scene: chunked ground, depth-sorted object layer, player, camera. */
export class WorldScene {
  readonly container = new Container();
  readonly player: Player;
  readonly camera: Camera;
  readonly grid: CollisionGrid;
  readonly ground: GroundLayer;
  readonly debug = new DebugOverlay();
  private readonly objectLayer = new Container();

  constructor(
    renderer: Renderer,
    readonly map: MapData,
    private readonly input: Input,
    private readonly view: { width: number; height: number },
    heroAssets?: HeroAssets,
  ) {
    this.grid = { width: map.width, height: map.height, cells: map.layers.collision };

    this.ground = new GroundLayer(renderer, map.layers.ground, map.width, map.height);
    this.container.addChild(this.ground.container);

    this.objectLayer.sortableChildren = true;
    this.container.addChild(this.objectLayer);

    for (const obj of map.objects ?? []) {
      if (obj.type === 'pillar') this.objectLayer.addChild(makePillar(obj.tx, obj.ty));
    }

    const spawn = (map.entities ?? []).find((e) => e.type === 'player_spawn');
    this.player = new Player(
      spawn ? spawn.tx + 0.5 : map.width / 2,
      spawn ? spawn.ty + 0.5 : map.height / 2,
      heroAssets,
    );
    this.objectLayer.addChild(this.player.view);

    this.container.addChild(this.debug.worldLayer);

    // Camera bounds = the map diamond's screen-space bounding box.
    this.camera = new Camera({
      minX: worldToScreen(0, map.height).x,
      maxX: worldToScreen(map.width, 0).x,
      minY: worldToScreen(0, 0).y,
      maxY: worldToScreen(map.width, map.height).y,
    });
    const start = worldToScreen(this.player.x, this.player.y);
    this.camera.snapTo(start.x, start.y, view.width, view.height);
  }

  update(dt: number): void {
    if (this.input.justPressed('F3')) this.debug.toggle();
    this.player.update(dt, this.input, this.grid);
    const target = worldToScreen(this.player.x, this.player.y);
    this.camera.update(target.x, target.y, this.view.width, this.view.height);
  }

  render(alpha: number, fps: number): void {
    this.player.syncView(alpha);

    const offset = this.camera.offset(this.view.width, this.view.height);
    this.container.position.set(offset.x, offset.y);

    const viewRect = new Rectangle(
      this.camera.x - this.view.width / 2,
      this.camera.y - this.view.height / 2,
      this.view.width,
      this.view.height,
    );
    this.ground.cull(viewRect);

    this.debug.update(
      fps,
      this.player,
      this.grid,
      this.ground.visibleChunkCount,
      this.ground.chunkCount,
    );
  }
}

/** Grey-box pillar: tall slab + cap, anchored at its tile center's feet point. */
function makePillar(tx: number, ty: number): Container {
  const wx = tx + 0.5;
  const wy = ty + 0.5;
  const c = new Container();
  const g = new Graphics();
  g.ellipse(0, 0, 40, 20).fill({ color: 0x000000, alpha: 0.3 });
  g.rect(-28, -128, 56, 122).fill(0x8a8fa8).stroke({ width: 2, color: 0x3c3f52 });
  g.poly([0, -152, 34, -134, 0, -116, -34, -134])
    .fill(0xa5aac2)
    .stroke({ width: 2, color: 0x3c3f52 });
  c.addChild(g);
  const s = worldToScreen(wx, wy);
  c.position.set(s.x, s.y);
  c.zIndex = depthOf(wx, wy);
  return c;
}
