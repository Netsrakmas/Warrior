import {
  ColorMatrixFilter,
  Container,
  Graphics,
  Rectangle,
  Text,
  Texture,
  type Renderer,
} from 'pixi.js';
import { depthOf, worldToScreen, TILE_W, TILE_H } from '../../engine/iso';
import { Camera } from '../../engine/camera';
import { GroundLayer } from '../../engine/ground';
import { DebugOverlay } from '../../engine/debug';
import { Fx } from '../../engine/fx';
import type { AudioStub } from '../../engine/audio';
import type { Rng } from '../../engine/rng';
import type { SpriteDef } from '../../engine/anim';
import { CELL_CRACKED, CELL_WALK, type CollisionGrid } from '../../engine/collision';
import type { Input } from '../../engine/input';
import type { MapData, MapTrigger } from '../types';
import { Player, type HeroAssets, type PlayerCtx } from '../entities/player';
import { Husk, type EnemyCtx } from '../entities/husk';
import { Spitter } from '../entities/spitter';
import { Skitter } from '../entities/skitter';
import { Projectile } from '../entities/projectile';
import { Pickup, type PickupType } from '../entities/pickup';
import type { Hit } from '../systems/combat';
import {
  Npc,
  Chest,
  Door,
  PushBlock,
  PressurePlate,
  ChargePlate,
  type AdventureEnv,
  type Interactable,
} from '../entities/props';

export interface EnemyAssets {
  def: SpriteDef;
  sheet: Texture;
}

export interface SceneAssets {
  hero?: HeroAssets;
  husk?: EnemyAssets;
  spitter?: EnemyAssets;
  skitter?: EnemyAssets;
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

/** Common shape every enemy type satisfies. */
export interface Enemy {
  readonly kind: string;
  readonly view: Container;
  x: number;
  y: number;
  radius: number;
  hp: number;
  state: string;
  readonly alive: boolean;
  finished: boolean;
  applyHit(hit: Hit): boolean;
  rollDrops(ctx: EnemyCtx): void;
  update(dt: number, ctx: EnemyCtx): void;
  syncView(alpha: number): void;
}

const INTERACT_KEYS = ['KeyE', 'Enter'];
const CHARGE_KEYS = ['KeyX', 'KeyC'];
const INTERACT_RANGE = 1.2;
const BLAST_RADIUS = 1.8;
const RESTORE_LERP_RATE = 0.5; // drained→restored over ~2s (PLAN §7)

/** The playable world: ground, depth-sorted objects, combat + adventure entities. */
export class WorldScene {
  readonly container = new Container();
  readonly uiLayer = new Container();
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly pickups: Pickup[] = [];
  readonly projectiles: Projectile[] = [];
  readonly npcs: Npc[] = [];
  readonly chests: Chest[] = [];
  readonly doors: Door[] = [];
  readonly blocks: PushBlock[] = [];
  readonly plates: PressurePlate[] = [];
  readonly chargePlates: ChargePlate[] = [];
  readonly camera: Camera;
  readonly grid: CollisionGrid;
  readonly ground: GroundLayer;
  readonly debug = new DebugOverlay();
  readonly fx = new Fx();
  kills = 0;
  /** 1 = fully drained (grey), 0 = fully restored. */
  drainT = 0;

  private readonly objectLayer = new Container();
  private readonly prompt = new Container();
  private readonly playerCtx: PlayerCtx;
  private readonly enemyCtx: EnemyCtx;
  private readonly firedFlagTriggers = new Set<MapTrigger>();
  private readonly crackMarkers = new Map<string, Graphics>();
  private readonly colorFilter = new ColorMatrixFilter();
  private readonly restoredFlag: string | undefined;
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
    // Clone collision so doors/blocks/blasts can mutate it without corrupting map data.
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
          this.addEnemy(
            new Husk(e.tx + 0.5, e.ty + 0.5, assets.husk.def, assets.husk.sheet, patrol),
          );
          break;
        }
        case 'enemy_spitter': {
          if (!assets.spitter) break;
          this.addEnemy(
            new Spitter(e.tx + 0.5, e.ty + 0.5, assets.spitter.def, assets.spitter.sheet),
          );
          break;
        }
        case 'enemy_skitter': {
          if (!assets.skitter) break;
          this.addEnemy(
            new Skitter(e.tx + 0.5, e.ty + 0.5, assets.skitter.def, assets.skitter.sheet),
          );
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
        case 'charge_plate': {
          const plate = new ChargePlate(e.tx, e.ty, props);
          this.chargePlates.push(plate);
          this.objectLayer.addChild(plate.view);
          break;
        }
      }
    }

    // Cracked cells: already-blasted ones (flag set) become walkable; the rest get markers.
    for (let ty = 0; ty < this.grid.height; ty++) {
      for (let tx = 0; tx < this.grid.width; tx++) {
        if (this.grid.cells[ty]?.[tx] !== CELL_CRACKED) continue;
        if (env.state.flags.get(this.crackFlag(tx, ty))) {
          this.grid.cells[ty]![tx] = CELL_WALK;
        } else {
          this.addCrackMarker(tx, ty);
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
        const en = this.enemies.find((h) => h === enemy);
        if (en) this.registerKill(en);
      },
      onDeath: () => this.env.onPlayerDeath(),
    };
    this.enemyCtx = {
      grid: this.grid,
      player: this.player,
      fx: this.fx,
      audio: services.audio,
      rng: services.rng,
      spawnPickup: (type, x, y) => this.spawnPickup(type, x, y),
      spawnProjectile: (x, y, dx, dy) => {
        const p = new Projectile(x, y, dx, dy);
        this.projectiles.push(p);
        this.objectLayer.addChild(p.view);
      },
    };

    this.camera = new Camera({
      minX: worldToScreen(0, map.height).x,
      maxX: worldToScreen(map.width, 0).x,
      minY: worldToScreen(0, 0).y,
      maxY: worldToScreen(map.width, map.height).y,
    });
    const start = worldToScreen(this.player.x, this.player.y);
    this.camera.snapTo(start.x, start.y, view.width, view.height);

    // Restoration tint: region starts drained until its flag is set (PLAN §7).
    this.restoredFlag = map.ambient?.restoredFlag;
    this.drainT = this.restoredFlag && !env.state.flags.get(this.restoredFlag) ? 1 : 0;
    this.applyTint();

    // Don't re-fire a goto trigger we spawned inside of (transition bounce guard).
    this.suppressGoto = this.gotoTriggerAt(this.player.x, this.player.y) !== null;
    this.syncDynamicCollision();
  }

  private addEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
    this.objectLayer.addChild(enemy.view);
  }

  private registerKill(enemy: Enemy): void {
    this.kills++;
    this.env.quests.notify('kill', enemy.kind);
    enemy.rollDrops(this.enemyCtx);
  }

  spawnPickup(type: PickupType, x: number, y: number): void {
    const p = new Pickup(type, x, y);
    this.pickups.push(p);
    this.objectLayer.addChild(p.view);
  }

  private crackFlag(tx: number, ty: number): string {
    return `f_crack_${this.map.id}_${tx}_${ty}`;
  }

  private addCrackMarker(tx: number, ty: number): void {
    const g = new Graphics();
    const cx = 0;
    const cy = 0;
    g.poly([cx, cy - TILE_H / 2, cx + TILE_W / 2, cy, cx, cy + TILE_H / 2, cx - TILE_W / 2, cy])
      .fill({ color: 0x4a4438, alpha: 0.9 })
      .stroke({ width: 2, color: 0x2c2820 });
    // Crack lines.
    g.moveTo(-20, -6).lineTo(2, 2).lineTo(-6, 14).stroke({ width: 2, color: 0x1a1712 });
    g.moveTo(18, -8).lineTo(4, 0).stroke({ width: 2, color: 0x1a1712 });
    const s = worldToScreen(tx + 0.5, ty + 0.5);
    g.position.set(s.x, s.y);
    g.zIndex = depthOf(tx + 0.5, ty + 0.5) - 0.45;
    this.objectLayer.addChild(g);
    this.crackMarkers.set(`${tx},${ty}`, g);
  }

  /** Resonant Charge detonation: breaks cracked stone, hits enemies, trips charge plates. */
  private detonateCharge(): void {
    const st = this.env.state;
    st.charges--;
    this.fx.shake(6, 0.2);
    this.playerCtx.audio.play('enemy_die');
    const px = this.player.x;
    const py = this.player.y;
    this.fx.spark(px, py, 0x5ad9c8);

    for (let ty = Math.floor(py - BLAST_RADIUS); ty <= Math.floor(py + BLAST_RADIUS); ty++) {
      for (let tx = Math.floor(px - BLAST_RADIUS); tx <= Math.floor(px + BLAST_RADIUS); tx++) {
        if (this.grid.cells[ty]?.[tx] !== CELL_CRACKED) continue;
        const d = Math.hypot(tx + 0.5 - px, ty + 0.5 - py);
        if (d > BLAST_RADIUS) continue;
        this.grid.cells[ty]![tx] = CELL_WALK;
        st.flags.set(this.crackFlag(tx, ty));
        this.crackMarkers.get(`${tx},${ty}`)?.destroy();
        this.crackMarkers.delete(`${tx},${ty}`);
        this.fx.spark(tx + 0.5, ty + 0.5, 0xc8b88a);
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (Math.hypot(enemy.x - px, enemy.y - py) > BLAST_RADIUS) continue;
      const landed = enemy.applyHit({ damage: 2, fromX: px, fromY: py, knockback: 8 });
      if (landed) {
        this.fx.spark(enemy.x, enemy.y);
        if (!enemy.alive) this.registerKill(enemy);
      }
    }

    for (const plate of this.chargePlates) {
      if (Math.hypot(plate.x - px, plate.y - py) <= BLAST_RADIUS) plate.trigger(this.env);
    }
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

  private applyTint(): void {
    if (this.drainT <= 0.001) {
      this.container.filters = [];
      return;
    }
    this.colorFilter.reset();
    this.colorFilter.saturate(-0.9 * this.drainT, false);
    this.colorFilter.brightness(1 - 0.12 * this.drainT, true);
    this.container.filters = [this.colorFilter];
  }

  update(dt: number): void {
    if (this.input.justPressed('F3')) this.debug.toggle();

    // Restoration tint eases out once the region flag flips (the payoff moment).
    const drainTarget = this.restoredFlag && !this.env.state.flags.get(this.restoredFlag) ? 1 : 0;
    if (this.drainT !== drainTarget) {
      this.drainT +=
        Math.sign(drainTarget - this.drainT) *
        Math.min(RESTORE_LERP_RATE * dt, Math.abs(drainTarget - this.drainT));
      this.applyTint();
    }

    const frozen = this.fx.update(dt);
    if (!frozen) {
      const wasHp = this.player.hp;
      this.player.update(dt, this.input, this.playerCtx);
      if (this.player.hp < wasHp) {
        this.playerCtx.audio.play(this.player.alive ? 'hurt' : 'player_die');
        this.fx.shake(5, 0.18);
      }

      if (
        this.player.alive &&
        this.player.state === 'normal' &&
        this.env.state.charges > 0 &&
        CHARGE_KEYS.some((k) => this.input.justPressed(k))
      ) {
        this.detonateCharge();
      }

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i]!;
        enemy.update(dt, this.enemyCtx);
        if (enemy.finished) {
          enemy.view.destroy();
          this.enemies.splice(i, 1);
        }
      }

      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i]!;
        p.update(dt, this.grid, this.player);
        if (p.dead) {
          p.view.destroy();
          this.projectiles.splice(i, 1);
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
      for (const plate of this.chargePlates) plate.update(this.env);
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
