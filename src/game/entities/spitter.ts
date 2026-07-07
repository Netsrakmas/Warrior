import { Container, Graphics, Texture } from 'pixi.js';
import { depthOf, facingFromVector, worldToScreen, type Facing } from '../../engine/iso';
import { moveCircle } from '../../engine/collision';
import { AnimSprite, type SpriteDef } from '../../engine/anim';
import { decayVelocity, knockbackVelocity, type Combatant, type Hit } from '../systems/combat';
import type { EnemyCtx } from './husk';

const RANGE = 5;
const COOLDOWN = 2.0;
const STAGGER = 0.3;
const MAX_HP = 2;

export type SpitterState = 'idle' | 'attack' | 'hurt' | 'dead';

/** Spitter: stationary plant, lobs projectiles at the player in range. */
export class Spitter implements Combatant {
  readonly kind = 'enemy_spitter';
  readonly view = new Container();
  x: number;
  y: number;
  readonly radius: number;
  hp = MAX_HP;
  state: SpitterState = 'idle';
  facing: Facing = 'SE';
  finished = false;

  private readonly anim: AnimSprite;
  private kvx = 0;
  private kvy = 0;
  private cooldown = 1.0; // small initial delay so it doesn't fire instantly
  private stateTimer = 0;

  constructor(spawnX: number, spawnY: number, def: SpriteDef, sheet: Texture) {
    this.x = spawnX;
    this.y = spawnY;
    this.radius = def.footprint.r;
    const shadow = new Graphics();
    shadow.ellipse(0, 0, 30, 15).fill({ color: 0x000000, alpha: 0.3 });
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
    } else {
      this.state = 'hurt';
      this.stateTimer = STAGGER;
      this.anim.play('hurt', this.facing, true);
    }
    return true;
  }

  rollDrops(ctx: EnemyCtx): void {
    if (ctx.rng.chance(0.4)) ctx.spawnPickup('heart', this.x, this.y);
    const shards = ctx.rng.int(1, 2);
    for (let i = 0; i < shards; i++) {
      const a = ctx.rng.next() * Math.PI * 2;
      ctx.spawnPickup('shard', this.x + Math.cos(a) * 0.4, this.y + Math.sin(a) * 0.4);
    }
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
    if (this.cooldown > 0) this.cooldown -= dt;

    switch (this.state) {
      case 'idle': {
        if (ctx.player.alive && dist < RANGE && this.cooldown <= 0) {
          this.facing = facingFromVector(dx, dy);
          this.state = 'attack';
          this.anim.onFrameEvent = (ev) => {
            if (ev !== 'spit') return;
            const d = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) || 1;
            ctx.spawnProjectile(
              this.x,
              this.y,
              (ctx.player.x - this.x) / d,
              (ctx.player.y - this.y) / d,
            );
          };
          this.anim.play('attack', this.facing, true);
        }
        break;
      }
      case 'attack': {
        if (this.anim.isDone) {
          this.state = 'idle';
          this.cooldown = COOLDOWN;
          this.anim.play('idle', this.facing);
        }
        break;
      }
      case 'hurt': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'idle';
          this.anim.play('idle', this.facing);
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
