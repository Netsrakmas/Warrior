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
import type { Input } from '../../engine/input';

const SPEED = 4; // tiles per second
export const PLAYER_RADIUS = 0.3; // fallback footprint, tile units
const MAX_HP = 6; // half-hearts (3 hearts)
const IFRAMES = 1.0;
const SWORD_DAMAGE = 1;
const SWORD_KNOCKBACK = 7;
const SWORD_REACH = 0.7;
const SWORD_R = 0.55;
const HURT_TIME = 0.25;
const RESPAWN_TIME = 1.4;

export const ATTACK_KEYS = ['Space', 'KeyZ', 'KeyJ'];

export type PlayerState = 'normal' | 'attack' | 'hurt' | 'dead';

export interface HeroAssets {
  def: SpriteDef;
  sheet: Texture;
}

export interface PlayerCtx {
  grid: CollisionGrid;
  enemies: Combatant[];
  fx: Fx;
  audio: AudioStub;
  /** called with each enemy killed by the sword this tick */
  onKill(enemy: Combatant): void;
  /** called once when the death animation finishes */
  onDeath(): void;
}

/** The hero: movement, sword combat driven by frame events, HP/i-frames/death. */
export class Player implements Combatant {
  readonly view = new Container();
  x: number;
  y: number;
  facing: Facing = 'SE';
  readonly radius: number;
  hp = MAX_HP;
  maxHp = MAX_HP;
  state: PlayerState = 'normal';
  deaths = 0;

  private readonly anim: AnimSprite | null = null;
  private readonly spawnX: number;
  private readonly spawnY: number;
  private kvx = 0;
  private kvy = 0;
  private iframes = 0;
  private stateTimer = 0;
  private attackActive = false;
  private swingHits = new Set<Combatant>();
  private moving = false;
  private prevX: number;
  private prevY: number;

  constructor(
    spawnX: number,
    spawnY: number,
    assets?: HeroAssets,
    vitals?: { hp: number; maxHp: number },
  ) {
    this.x = spawnX;
    this.y = spawnY;
    this.spawnX = spawnX;
    this.spawnY = spawnY;
    this.prevX = spawnX;
    this.prevY = spawnY;
    this.radius = assets?.def.footprint.r ?? PLAYER_RADIUS;
    if (vitals) {
      this.maxHp = vitals.maxHp;
      this.hp = Math.min(vitals.hp, vitals.maxHp);
    }

    // Blob shadow (engine-drawn — PLAN §5.2).
    const shadow = new Graphics();
    shadow.ellipse(0, 0, 34, 17).fill({ color: 0x000000, alpha: 0.3 });
    this.view.addChild(shadow);

    if (assets) {
      this.anim = new AnimSprite(assets.def, assets.sheet);
      this.anim.onFrameEvent = (ev) => {
        if (ev === 'hit_on') {
          this.attackActive = true;
          this.swingHits.clear();
        }
        if (ev === 'hit_off') this.attackActive = false;
      };
      this.anim.play('idle', this.facing);
      this.view.addChild(this.anim);
    } else {
      const g = new Graphics();
      g.rect(-20, -78, 40, 72).fill(0xd9a066).stroke({ width: 2, color: 0x5a3a1a });
      g.rect(-6, -70, 12, 10).fill(0x5a3a1a);
      this.view.addChild(g);
    }
    this.syncView(1);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  applyHit(hit: Hit): boolean {
    if (!this.alive || this.iframes > 0) return false;
    this.hp -= hit.damage;
    this.iframes = IFRAMES;
    const kv = knockbackVelocity(hit, this.x, this.y);
    this.kvx = kv.x;
    this.kvy = kv.y;
    this.attackActive = false;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.deaths++;
      this.stateTimer = RESPAWN_TIME;
      this.anim?.play('death', this.facing, true);
    } else {
      this.state = 'hurt';
      this.stateTimer = HURT_TIME;
      this.anim?.play('hurt', this.facing, true);
    }
    return true;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  update(dt: number, input: Input, ctx: PlayerCtx): void {
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.iframes > 0) this.iframes -= dt;
    // I-frame flicker keeps the hit state readable.
    this.view.alpha =
      this.iframes > 0 && this.alive ? (Math.floor(this.iframes * 20) % 2 === 0 ? 0.5 : 1) : 1;

    // Knockback applies in every living state.
    if (this.kvx !== 0 || this.kvy !== 0) {
      const moved = moveCircle(ctx.grid, this.x, this.y, this.radius, this.kvx * dt, this.kvy * dt);
      this.x = moved.x;
      this.y = moved.y;
      const kv = decayVelocity({ x: this.kvx, y: this.kvy }, dt);
      this.kvx = kv.x;
      this.kvy = kv.y;
    }

    switch (this.state) {
      case 'normal': {
        const dir = input.worldDir();
        this.moving = dir.x !== 0 || dir.y !== 0;
        if (this.moving) {
          this.facing = facingFromVector(dir.x, dir.y);
          const next = moveCircle(
            ctx.grid,
            this.x,
            this.y,
            this.radius,
            dir.x * SPEED * dt,
            dir.y * SPEED * dt,
          );
          this.x = next.x;
          this.y = next.y;
        }
        if (ATTACK_KEYS.some((k) => input.justPressed(k))) {
          this.state = 'attack';
          this.attackActive = false;
          this.anim?.play('attack', this.facing, true);
          ctx.audio.play('swing');
        } else {
          this.anim?.play(this.moving ? 'walk' : 'idle', this.facing);
        }
        break;
      }
      case 'attack': {
        if (this.attackActive) this.resolveSword(ctx);
        if (!this.anim || this.anim.isDone) {
          this.state = 'normal';
          this.attackActive = false;
        }
        break;
      }
      case 'hurt': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'normal';
        break;
      }
      case 'dead': {
        if (this.stateTimer > 0) {
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) ctx.onDeath(); // Game shows the game-over screen
        }
        break;
      }
    }

    this.anim?.update(dt);
  }

  private resolveSword(ctx: PlayerCtx): void {
    const dir = FACING_DIRS[this.facing];
    const hb = meleeHitbox(this.x, this.y, dir, SWORD_REACH, SWORD_R);
    for (const enemy of ctx.enemies) {
      if (!enemy.alive || this.swingHits.has(enemy)) continue;
      if (!circlesOverlap(hb.x, hb.y, hb.r, enemy.x, enemy.y, enemy.radius)) continue;
      const landed = enemy.applyHit({
        damage: SWORD_DAMAGE,
        fromX: this.x,
        fromY: this.y,
        knockback: SWORD_KNOCKBACK,
      });
      if (!landed) continue;
      this.swingHits.add(enemy);
      ctx.fx.hitstop(0.06);
      ctx.fx.shake(4, 0.12);
      ctx.fx.spark(enemy.x, enemy.y);
      ctx.audio.play('hit');
      if (!enemy.alive) {
        ctx.audio.play('enemy_die');
        ctx.onKill(enemy);
      }
    }
  }

  /** Revive at the map spawn with full hearts (game-over → Continue). */
  respawn(): void {
    this.hp = this.maxHp;
    this.state = 'normal';
    this.iframes = 1.5;
    this.kvx = 0;
    this.kvy = 0;
    this.teleport(this.spawnX, this.spawnY);
    this.anim?.play('idle', this.facing, true);
  }

  /** Pull hp/maxHp changes made by adventure systems (heart containers, saves). */
  syncFromState(state: { hp: number; maxHp: number }): void {
    this.maxHp = state.maxHp;
    this.hp = Math.min(state.hp, state.maxHp);
  }

  teleport(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
  }

  get depth(): number {
    return depthOf(this.x, this.y);
  }

  get animInfo(): { name: string; frame: number } | null {
    return this.anim ? { name: this.anim.animName, frame: this.anim.frame } : null;
  }

  /** Interpolated render position between sim ticks. */
  syncView(alpha: number): void {
    const ix = this.prevX + (this.x - this.prevX) * alpha;
    const iy = this.prevY + (this.y - this.prevY) * alpha;
    const s = worldToScreen(ix, iy);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(ix, iy);
  }
}
