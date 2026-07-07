import { Container, Graphics, Texture } from 'pixi.js';
import { depthOf, facingFromVector, worldToScreen, type Facing, type Vec2 } from '../../engine/iso';
import { moveCircle } from '../../engine/collision';
import { AnimSprite, type SpriteDef } from '../../engine/anim';
import {
  circlesOverlap,
  decayVelocity,
  knockbackVelocity,
  type Combatant,
  type Hit,
} from '../systems/combat';
import type { EnemyCtx } from './husk';

const NOTICE_RANGE = 5;
const DASH_SPEED = 4.5;
const DASH_TIME = 0.45;
const PAUSE_TIME = 0.6;
const MAX_HP = 1;

export type SkitterState = 'idle' | 'pause' | 'dash' | 'dead';

/** Skitter: fast low critter that darts at the player in bursts. */
export class Skitter implements Combatant {
  readonly kind = 'enemy_skitter';
  readonly view = new Container();
  x: number;
  y: number;
  readonly radius: number;
  hp = MAX_HP;
  state: SkitterState = 'idle';
  facing: Facing = 'SE';
  finished = false;

  private readonly anim: AnimSprite;
  private kvx = 0;
  private kvy = 0;
  private stateTimer = 0;
  private dashDir: Vec2 = { x: 1, y: 0 };
  private dashDidHit = false;

  constructor(spawnX: number, spawnY: number, def: SpriteDef, sheet: Texture) {
    this.x = spawnX;
    this.y = spawnY;
    this.radius = def.footprint.r;
    const shadow = new Graphics();
    shadow.ellipse(0, 0, 26, 12).fill({ color: 0x000000, alpha: 0.3 });
    this.view.addChild(shadow);
    this.anim = new AnimSprite(def, sheet);
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
    if (this.hp <= 0) {
      this.state = 'dead';
      this.anim.play('death', this.facing, true);
    }
    return true;
  }

  rollDrops(ctx: EnemyCtx): void {
    if (ctx.rng.chance(0.25)) ctx.spawnPickup('heart', this.x, this.y);
    ctx.spawnPickup('shard', this.x, this.y);
  }

  update(dt: number, ctx: EnemyCtx): void {
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
      this.syncView(1);
      return;
    }

    const dx = ctx.player.x - this.x;
    const dy = ctx.player.y - this.y;
    const dist = Math.hypot(dx, dy);

    switch (this.state) {
      case 'idle': {
        if (ctx.player.alive && dist < NOTICE_RANGE) {
          this.state = 'pause';
          this.stateTimer = PAUSE_TIME;
        }
        this.anim.play('idle', this.facing);
        break;
      }
      case 'pause': {
        // Telegraph: face the player, hold still, then dart.
        this.facing = facingFromVector(dx, dy);
        this.anim.play('idle', this.facing);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (!ctx.player.alive || dist > NOTICE_RANGE + 2) {
            this.state = 'idle';
            break;
          }
          this.dashDir = { x: dx / (dist || 1), y: dy / (dist || 1) };
          this.dashDidHit = false;
          this.state = 'dash';
          this.stateTimer = DASH_TIME;
          this.anim.play('attack', this.facing, true);
        }
        break;
      }
      case 'dash': {
        this.stateTimer -= dt;
        const moved = moveCircle(
          ctx.grid,
          this.x,
          this.y,
          this.radius,
          this.dashDir.x * DASH_SPEED * dt,
          this.dashDir.y * DASH_SPEED * dt,
        );
        this.x = moved.x;
        this.y = moved.y;
        // Contact damage only while dashing (readable threat window).
        if (
          !this.dashDidHit &&
          ctx.player.alive &&
          circlesOverlap(
            this.x,
            this.y,
            this.radius + 0.1,
            ctx.player.x,
            ctx.player.y,
            ctx.player.radius,
          )
        ) {
          const landed = ctx.player.applyHit({
            damage: 1,
            fromX: this.x,
            fromY: this.y,
            knockback: 4,
          });
          if (landed) this.dashDidHit = true;
        }
        if (this.stateTimer <= 0) {
          this.state = 'pause';
          this.stateTimer = PAUSE_TIME;
        }
        break;
      }
    }

    this.anim.update(dt);
    this.syncView(1);
  }

  syncView(_alpha: number): void {
    const s = worldToScreen(this.x, this.y);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(this.x, this.y);
  }
}
