import { Container, Graphics, Texture } from 'pixi.js';
import {
  depthOf,
  facingFromVector,
  worldToScreen,
  FACING_DIRS,
  type Facing,
} from '../../engine/iso';
import { moveCircle, type CollisionGrid } from '../../engine/collision';
import { AnimSprite, type SpriteDef } from '../../engine/anim';
import {
  circlesOverlap,
  decayVelocity,
  knockbackVelocity,
  meleeHitbox,
  type Combatant,
  type Hit,
} from '../systems/combat';
import type { Fx } from '../../engine/fx';
import type { AudioStub } from '../../engine/audio';
import type { Rng } from '../../engine/rng';
import type { PickupType } from './pickup';

export type HuskState = 'patrol' | 'chase' | 'windup' | 'cooldown' | 'hurt' | 'dead';

const PATROL_SPEED = 1.2;
const CHASE_SPEED = 2.1;
const AGGRO_RANGE = 4;
const DEAGGRO_RANGE = 7;
const ATTACK_RANGE = 1.15;
const ATTACK_DAMAGE = 1;
const ATTACK_REACH = 0.6;
const ATTACK_R = 0.5;
const COOLDOWN = 0.8;
const STAGGER = 0.3;
const MAX_HP = 3;

export interface HuskCtx {
  grid: CollisionGrid;
  player: Combatant & { alive: boolean };
  fx: Fx;
  audio: AudioStub;
  rng: Rng;
  spawnPickup(type: PickupType, x: number, y: number): void;
}

/**
 * The husk: patrol → aggro → chase → windup (telegraph!) → attack → cooldown.
 * Its attack animation carries hit_on/hit_off frame events; the windup frames
 * before hit_on ARE the telegraph (PLAN §9 Phase 3).
 */
export class Husk implements Combatant {
  readonly view = new Container();
  x: number;
  y: number;
  readonly radius: number;
  hp = MAX_HP;
  state: HuskState = 'patrol';
  facing: Facing = 'SE';
  /** set true when the corpse can be removed from the scene */
  finished = false;

  private readonly anim: AnimSprite;
  private kvx = 0;
  private kvy = 0;
  private stateTimer = 0;
  private attackActive = false;
  private attackDidHit = false;
  private patrolPoints: [number, number][];
  private patrolIndex = 0;
  private prevX: number;
  private prevY: number;

  constructor(
    spawnX: number,
    spawnY: number,
    def: SpriteDef,
    sheet: Texture,
    patrol?: [number, number][],
  ) {
    this.x = spawnX;
    this.y = spawnY;
    this.prevX = spawnX;
    this.prevY = spawnY;
    this.radius = def.footprint.r;
    this.patrolPoints = patrol && patrol.length > 0 ? patrol : [];

    const shadow = new Graphics();
    shadow.ellipse(0, 0, 28, 14).fill({ color: 0x000000, alpha: 0.3 });
    this.view.addChild(shadow);
    this.anim = new AnimSprite(def, sheet);
    this.anim.onFrameEvent = (ev) => {
      if (ev === 'hit_on') {
        this.attackActive = true;
        this.attackDidHit = false;
      }
      if (ev === 'hit_off') this.attackActive = false;
    };
    this.anim.play('idle', this.facing);
    this.view.addChild(this.anim);
    this.syncView(1);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  applyHit(hit: Hit): boolean {
    if (!this.alive) return false;
    this.hp -= hit.damage;
    const kv = knockbackVelocity(hit, this.x, this.y);
    this.kvx = kv.x;
    this.kvy = kv.y;
    this.attackActive = false;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.anim.play('death', this.facing, true);
    } else {
      this.state = 'hurt';
      this.stateTimer = STAGGER;
      this.anim.play('hurt', this.facing, true);
    }
    return true;
  }

  /** Drop loot — called by the scene exactly once, right after the killing hit. */
  rollDrops(ctx: HuskCtx): void {
    if (ctx.rng.chance(0.5)) ctx.spawnPickup('heart', this.x, this.y);
    const shards = ctx.rng.int(1, 3);
    for (let i = 0; i < shards; i++) {
      const a = ctx.rng.next() * Math.PI * 2;
      ctx.spawnPickup('shard', this.x + Math.cos(a) * 0.4, this.y + Math.sin(a) * 0.4);
    }
  }

  update(dt: number, ctx: HuskCtx): void {
    this.prevX = this.x;
    this.prevY = this.y;

    // Knockback applies in every state (including death slide).
    if (this.kvx !== 0 || this.kvy !== 0) {
      const moved = moveCircle(ctx.grid, this.x, this.y, this.radius, this.kvx * dt, this.kvy * dt);
      this.x = moved.x;
      this.y = moved.y;
      const kv = decayVelocity({ x: this.kvx, y: this.kvy }, dt);
      this.kvx = kv.x;
      this.kvy = kv.y;
    }

    if (this.state === 'dead') {
      this.anim.update(dt);
      if (this.anim.isDone) this.finished = true;
      this.syncFacinglessView();
      return;
    }

    const px = ctx.player.x;
    const py = ctx.player.y;
    const dist = Math.hypot(px - this.x, py - this.y);

    switch (this.state) {
      case 'patrol': {
        if (ctx.player.alive && dist < AGGRO_RANGE) {
          this.state = 'chase';
          break;
        }
        if (this.patrolPoints.length > 0) {
          const target = this.patrolPoints[this.patrolIndex]!;
          const dx = target[0] - this.x;
          const dy = target[1] - this.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.15) {
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
          } else {
            this.walk(dx / d, dy / d, PATROL_SPEED, dt, ctx.grid);
          }
          this.anim.play('walk', this.facing);
        } else {
          this.anim.play('idle', this.facing);
        }
        break;
      }
      case 'chase': {
        if (!ctx.player.alive || dist > DEAGGRO_RANGE) {
          this.state = 'patrol';
          break;
        }
        if (dist < ATTACK_RANGE) {
          this.state = 'windup';
          this.facing = facingFromVector(px - this.x, py - this.y);
          this.anim.play('attack', this.facing, true); // frames before hit_on = telegraph
          break;
        }
        const dx = (px - this.x) / dist;
        const dy = (py - this.y) / dist;
        this.walk(dx, dy, CHASE_SPEED, dt, ctx.grid);
        this.anim.play('walk', this.facing);
        break;
      }
      case 'windup': {
        // Attack animation runs; hitbox lives between hit_on/hit_off events.
        if (this.attackActive && !this.attackDidHit && ctx.player.alive) {
          const dir = FACING_DIRS[this.facing];
          const hb = meleeHitbox(this.x, this.y, dir, ATTACK_REACH, ATTACK_R);
          if (circlesOverlap(hb.x, hb.y, hb.r, px, py, ctx.player.radius)) {
            const landed = ctx.player.applyHit({
              damage: ATTACK_DAMAGE,
              fromX: this.x,
              fromY: this.y,
              knockback: 5,
            });
            if (landed) this.attackDidHit = true;
          }
        }
        if (this.anim.isDone) {
          this.state = 'cooldown';
          this.stateTimer = COOLDOWN;
          this.attackActive = false;
          this.anim.play('idle', this.facing);
        }
        break;
      }
      case 'cooldown': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0)
          this.state = ctx.player.alive && dist < DEAGGRO_RANGE ? 'chase' : 'patrol';
        break;
      }
      case 'hurt': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = dist < DEAGGRO_RANGE ? 'chase' : 'patrol';
        break;
      }
    }

    this.anim.update(dt);
    this.syncFacinglessView();
  }

  private walk(dx: number, dy: number, speed: number, dt: number, grid: CollisionGrid): void {
    this.facing = facingFromVector(dx, dy);
    const moved = moveCircle(grid, this.x, this.y, this.radius, dx * speed * dt, dy * speed * dt);
    this.x = moved.x;
    this.y = moved.y;
  }

  private syncFacinglessView(): void {
    // Enemies don't interpolate (simpler); position updates each sim tick.
    this.syncView(1);
  }

  syncView(alpha: number): void {
    const ix = this.prevX + (this.x - this.prevX) * alpha;
    const iy = this.prevY + (this.y - this.prevY) * alpha;
    const s = worldToScreen(ix, iy);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(ix, iy);
  }
}
