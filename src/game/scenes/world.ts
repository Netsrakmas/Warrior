import { Container, Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import { depthOf, worldToScreen } from '../../engine/iso';
import { Camera } from '../../engine/camera';
import { GroundLayer } from '../../engine/ground';
import { DebugOverlay } from '../../engine/debug';
import { Fx } from '../../engine/fx';
import type { AudioStub } from '../../engine/audio';
import type { Rng } from '../../engine/rng';
import type { SpriteDef } from '../../engine/anim';
import type { CollisionGrid } from '../../engine/collision';
import type { Input } from '../../engine/input';
import type { MapData } from '../types';
import { Player, type HeroAssets, type PlayerCtx } from '../entities/player';
import { Husk, type HuskCtx } from '../entities/husk';
import { Pickup, type PickupType } from '../entities/pickup';
import { Hud } from '../ui/hud';

export interface SceneAssets {
  hero?: HeroAssets;
  husk?: { def: SpriteDef; sheet: Texture };
}

export interface SceneServices {
  audio: AudioStub;
  rng: Rng;
}

/** The playable world: chunked ground, depth-sorted objects, combat entities, HUD. */
export class WorldScene {
  readonly container = new Container();
  readonly uiLayer = new Container();
  readonly player: Player;
  readonly enemies: Husk[] = [];
  readonly pickups: Pickup[] = [];
  readonly camera: Camera;
  readonly grid: CollisionGrid;
  readonly ground: GroundLayer;
  readonly debug = new DebugOverlay();
  readonly fx = new Fx();
  readonly hud = new Hud();
  shards = 0;
  kills = 0;

  private readonly objectLayer = new Container();
  private readonly playerCtx: PlayerCtx;
  private readonly huskCtx: HuskCtx;

  constructor(
    renderer: Renderer,
    readonly map: MapData,
    private readonly input: Input,
    private readonly view: { width: number; height: number },
    assets: SceneAssets = {},
    services: SceneServices,
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
      assets.hero,
    );
    this.objectLayer.addChild(this.player.view);

    if (assets.husk) {
      for (const e of map.entities ?? []) {
        if (e.type !== 'enemy_husk') continue;
        const patrol = (e.props?.patrol as [number, number][] | undefined)?.map(
          ([x, y]) => [x + 0.5, y + 0.5] as [number, number],
        );
        const husk = new Husk(e.tx + 0.5, e.ty + 0.5, assets.husk.def, assets.husk.sheet, patrol);
        this.enemies.push(husk);
        this.objectLayer.addChild(husk.view);
      }
    }

    this.fx.layer.zIndex = 9_000; // sparks render above world objects
    this.objectLayer.addChild(this.fx.layer);
    this.container.addChild(this.debug.worldLayer);
    this.uiLayer.addChild(this.hud.container, this.debug.screenLayer);

    this.playerCtx = {
      grid: this.grid,
      enemies: this.enemies,
      fx: this.fx,
      audio: services.audio,
      onKill: (enemy) => {
        this.kills++;
        const husk = this.enemies.find((h) => h === enemy);
        husk?.rollDrops(this.huskCtx);
      },
    };
    this.huskCtx = {
      grid: this.grid,
      player: this.player,
      fx: this.fx,
      audio: services.audio,
      rng: services.rng,
      spawnPickup: (type, x, y) => this.spawnPickup(type, x, y),
    };

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

  spawnPickup(type: PickupType, x: number, y: number): void {
    const p = new Pickup(type, x, y);
    this.pickups.push(p);
    this.objectLayer.addChild(p.view);
  }

  update(dt: number): void {
    if (this.input.justPressed('F3')) this.debug.toggle();

    const frozen = this.fx.update(dt); // hitstop — fx timers still tick
    if (!frozen) {
      const wasHp = this.player.hp;
      this.player.update(dt, this.input, this.playerCtx);
      if (this.player.hp < wasHp) {
        this.playerCtx.audio.play(this.player.alive ? 'hurt' : 'player_die');
        this.fx.shake(5, 0.18);
      }

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const husk = this.enemies[i]!;
        husk.update(dt, this.huskCtx);
        if (husk.finished) {
          husk.view.destroy();
          this.enemies.splice(i, 1);
        }
      }

      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i]!;
        if (p.update(dt, this.player.x, this.player.y) && this.player.alive) {
          if (p.type === 'heart') this.player.heal(2);
          else this.shards++;
          this.playerCtx.audio.play('pickup');
          p.view.destroy();
          this.pickups.splice(i, 1);
        }
      }
    }

    const target = worldToScreen(this.player.x, this.player.y);
    this.camera.update(target.x, target.y, this.view.width, this.view.height);
  }

  render(alpha: number, fps: number): void {
    this.player.syncView(alpha);
    for (const e of this.enemies) e.syncView(1);
    for (const p of this.pickups) p.syncView();

    const offset = this.camera.offset(this.view.width, this.view.height);
    const shake = this.fx.shakeOffset();
    this.container.position.set(offset.x + shake.x, offset.y + shake.y);

    const viewRect = new Rectangle(
      this.camera.x - this.view.width / 2,
      this.camera.y - this.view.height / 2,
      this.view.width,
      this.view.height,
    );
    this.ground.cull(viewRect);

    this.hud.update(this.player.hp, this.player.maxHp, this.shards);
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
