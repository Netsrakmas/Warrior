import { Container, Graphics, Rectangle, Text, Texture, type Renderer } from 'pixi.js';
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
import type { MapData, MapTrigger } from '../types';
import { Player, type HeroAssets, type PlayerCtx } from '../entities/player';
import { Husk, type HuskCtx } from '../entities/husk';
import { Pickup, type PickupType } from '../entities/pickup';
import {
  Npc,
  Chest,
  Door,
  PushBlock,
  PressurePlate,
  type AdventureEnv,
  type Interactable,
} from '../entities/props';

export interface SceneAssets {
  hero?: HeroAssets;
  husk?: { def: SpriteDef; sheet: Texture };
}

export interface SceneServices {
  audio: AudioStub;
  rng: Rng;
}

/** Callbacks the scene raises toward the Game orchestrator. */
export interface SceneEnv extends AdventureEnv {
  requestTransition(target: string): void;
  onPlayerDeath(): void;
}

const INTERACT_KEYS = ['KeyE', 'Enter'];
const INTERACT_RANGE = 1.2;

/** The playable world: ground, depth-sorted objects, combat + adventure entities. */
export class WorldScene {
  readonly container = new Container();
  readonly uiLayer = new Container();
  readonly player: Player;
  readonly enemies: Husk[] = [];
  readonly pickups: Pickup[] = [];
  readonly npcs: Npc[] = [];
  readonly chests: Chest[] = [];
  readonly doors: Door[] = [];
  readonly blocks: PushBlock[] = [];
  readonly plates: PressurePlate[] = [];
  readonly camera: Camera;
  readonly grid: CollisionGrid;
  readonly ground: GroundLayer;
  readonly debug = new DebugOverlay();
  readonly fx = new Fx();
  kills = 0;

  private readonly objectLayer = new Container();
  private readonly prompt = new Container();
  private readonly playerCtx: PlayerCtx;
  private readonly huskCtx: HuskCtx;
  private readonly firedFlagTriggers = new Set<MapTrigger>();
  private suppressGoto = false;

  constructor(
    renderer: Renderer,
    readonly map: MapData,
    private readonly input: Input,
    private readonly view: { width: number; height: number },
    assets: SceneAssets,
    services: SceneServices,
    private readonly env: SceneEnv,
    spawnPos?: [number, number],
  ) {
    // Clone collision so doors/blocks can mutate it without corrupting map data.
    this.grid = {
      width: map.width,
      height: map.height,
      cells: map.layers.collision.map((row) => [...row]),
    };

    this.ground = new GroundLayer(renderer, map.layers.ground, map.width, map.height);
    this.container.addChild(this.ground.container);

    this.objectLayer.sortableChildren = true;
    this.container.addChild(this.objectLayer);

    for (const obj of map.objects ?? []) {
      if (obj.type === 'pillar') this.objectLayer.addChild(makePillar(obj.tx, obj.ty));
    }

    const spawnEnt = (map.entities ?? []).find((e) => e.type === 'player_spawn');
    const spawn: [number, number] = spawnPos ?? [
      spawnEnt ? spawnEnt.tx + 0.5 : map.width / 2,
      spawnEnt ? spawnEnt.ty + 0.5 : map.height / 2,
    ];
    this.player = new Player(spawn[0], spawn[1], assets.hero, {
      hp: env.state.hp,
      maxHp: env.state.maxHp,
    });
    this.objectLayer.addChild(this.player.view);

    for (const e of map.entities ?? []) {
      const props = e.props ?? {};
      switch (e.type) {
        case 'enemy_husk': {
          if (!assets.husk) break;
          const patrol = (props.patrol as [number, number][] | undefined)?.map(
            ([x, y]) => [x + 0.5, y + 0.5] as [number, number],
          );
          const husk = new Husk(e.tx + 0.5, e.ty + 0.5, assets.husk.def, assets.husk.sheet, patrol);
          this.enemies.push(husk);
          this.objectLayer.addChild(husk.view);
          break;
        }
        case 'npc': {
          const npc = new Npc(e.tx + 0.5, e.ty + 0.5, props);
          this.npcs.push(npc);
          this.objectLayer.addChild(npc.view);
          break;
        }
        case 'chest': {
          const chest = new Chest(e.tx + 0.5, e.ty + 0.5, props);
          this.chests.push(chest);
          this.objectLayer.addChild(chest.view);
          break;
        }
        case 'door': {
          const door = new Door(e.tx, e.ty, props);
          this.doors.push(door);
          this.objectLayer.addChild(door.view);
          break;
        }
        case 'pushable_block': {
          const block = new PushBlock(e.tx, e.ty);
          block.claim(this.grid);
          this.blocks.push(block);
          this.objectLayer.addChild(block.view);
          break;
        }
        case 'pressure_plate': {
          const plate = new PressurePlate(e.tx, e.ty, props);
          this.plates.push(plate);
          this.objectLayer.addChild(plate.view);
          break;
        }
      }
    }

    // Interaction prompt bubble.
    const pg = new Graphics();
    pg.roundRect(-16, -14, 32, 24, 6).fill({ color: 0x14141f, alpha: 0.9 }).stroke({
      width: 2,
      color: 0xffd97a,
    });
    const pt = new Text({
      text: 'E',
      style: { fill: 0xffd97a, fontSize: 15, fontFamily: 'monospace', fontWeight: 'bold' },
    });
    pt.anchor.set(0.5);
    pt.position.set(0, -2);
    this.prompt.addChild(pg, pt);
    this.prompt.visible = false;
    this.prompt.zIndex = 9_500;
    this.objectLayer.addChild(this.prompt);

    this.fx.layer.zIndex = 9_000;
    this.objectLayer.addChild(this.fx.layer);
    this.container.addChild(this.debug.worldLayer);
    this.uiLayer.addChild(this.debug.screenLayer);

    this.playerCtx = {
      grid: this.grid,
      enemies: this.enemies,
      fx: this.fx,
      audio: services.audio,
      onKill: (enemy) => {
        this.kills++;
        this.env.quests.notify('kill', 'enemy_husk');
        const husk = this.enemies.find((h) => h === enemy);
        husk?.rollDrops(this.huskCtx);
      },
      onDeath: () => this.env.onPlayerDeath(),
    };
    this.huskCtx = {
      grid: this.grid,
      player: this.player,
      fx: this.fx,
      audio: services.audio,
      rng: services.rng,
      spawnPickup: (type, x, y) => this.spawnPickup(type, x, y),
    };

    this.camera = new Camera({
      minX: worldToScreen(0, map.height).x,
      maxX: worldToScreen(map.width, 0).x,
      minY: worldToScreen(0, 0).y,
      maxY: worldToScreen(map.width, map.height).y,
    });
    const start = worldToScreen(this.player.x, this.player.y);
    this.camera.snapTo(start.x, start.y, view.width, view.height);

    // Don't re-fire a goto trigger we spawned inside of (transition bounce guard).
    this.suppressGoto = this.gotoTriggerAt(this.player.x, this.player.y) !== null;
    this.syncDynamicCollision();
  }

  spawnPickup(type: PickupType, x: number, y: number): void {
    const p = new Pickup(type, x, y);
    this.pickups.push(p);
    this.objectLayer.addChild(p.view);
  }

  private gotoTriggerAt(x: number, y: number): MapTrigger | null {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    for (const t of this.map.triggers ?? []) {
      if (t.action !== 'goto') continue;
      if (tx >= t.tx && tx < t.tx + t.w && ty >= t.ty && ty < t.ty + t.h) return t;
    }
    return null;
  }

  private syncDynamicCollision(): void {
    for (const door of this.doors) door.update(this.env, this.grid);
  }

  /** Nearest interactable in range that currently accepts interaction. */
  private nearestInteractable(): Interactable | null {
    let best: Interactable | null = null;
    let bestDist = INTERACT_RANGE;
    const candidates: Interactable[] = [...this.npcs, ...this.chests, ...this.doors];
    for (const c of candidates) {
      if (!c.canInteract(this.env)) continue;
      const d = Math.hypot(c.x - this.player.x, c.y - this.player.y);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  update(dt: number): void {
    if (this.input.justPressed('F3')) this.debug.toggle();

    const frozen = this.fx.update(dt);
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
          else this.env.state.shards++;
          this.playerCtx.audio.play('pickup');
          p.view.destroy();
          this.pickups.splice(i, 1);
        }
      }

      // Adventure props.
      const dir = this.input.worldDir();
      for (const block of this.blocks) {
        block.update(dt, this.player.x, this.player.y, dir, this.player.radius, this.grid);
      }
      for (const plate of this.plates) {
        plate.update(this.env, this.player.x, this.player.y, this.blocks);
      }
      this.syncDynamicCollision();
      for (const chest of this.chests) chest.update(this.env);

      // Interaction.
      const target = this.player.alive ? this.nearestInteractable() : null;
      this.prompt.visible = target !== null;
      if (target) {
        const s = worldToScreen(target.x, target.y);
        this.prompt.position.set(s.x, s.y - 100);
        if (INTERACT_KEYS.some((k) => this.input.justPressed(k))) {
          target.interact(this.env);
          // Interactions may change hp/maxHp (heart container) — resync.
          this.player.syncFromState(this.env.state);
        }
      }

      // Triggers.
      const tx = Math.floor(this.player.x);
      const ty = Math.floor(this.player.y);
      const inGoto = this.gotoTriggerAt(this.player.x, this.player.y);
      if (!inGoto) this.suppressGoto = false;
      for (const t of this.map.triggers ?? []) {
        const inside = tx >= t.tx && tx < t.tx + t.w && ty >= t.ty && ty < t.ty + t.h;
        if (!inside) continue;
        if (t.action === 'flag' && t.set && !this.firedFlagTriggers.has(t)) {
          this.firedFlagTriggers.add(t);
          this.env.state.flags.set(t.set);
        } else if (t.action === 'goto' && t.target && !this.suppressGoto) {
          this.suppressGoto = true;
          this.env.requestTransition(t.target);
        }
      }

      // Persist runtime vitals into the shared state.
      this.env.state.hp = this.player.hp;
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
