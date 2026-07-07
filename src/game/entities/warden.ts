import { Container, Graphics, Texture } from 'pixi.js';
import {
  depthOf,
  facingFromVector,
  worldToScreen,
  FACING_DIRS,
  type Facing,
} from '../../engine/iso';
import { moveCircle } from '../../engine/collision';
import { AnimSprite, type SpriteDef } from '../../engine/anim';
import {
  circlesOverlap,
  decayVelocity,
  knockbackVelocity,
  meleeHitbox,
  type Combatant,
  type Hit,
} from '../systems/combat';
import type { EnemyCtx } from './husk';

const MAX_HP = 20;
const P2_HP = 13;
const P3_HP = 7;
const ATTACK_RANGE = 1.7;
const ATTACK_REACH = 1.2;
const ATTACK_R = 0.85;
const ATTACK_DAMAGE = 2;
const STUN_TIME = 2.2;
const AGGRO_RANGE = 7;

export type WardenState =
  'idle' | 'chase' | 'attack' | 'summon' | 'transition' | 'stunned' | 'hurt' | 'dead';

interface PhaseTuning {
  speed: number;
  attackCooldown: number;
  summonCooldown: number | null;
  shockCooldown: number | null;
}

const TUNING: Record<1 | 2 | 3, PhaseTuning> = {
  1: { speed: 1.6, attackCooldown: 1.4, summonCooldown: null, shockCooldown: null },
  2: { speed: 1.9, attackCooldown: 1.1, summonCooldown: 8, shockCooldown: 6 },
  3: { speed: 2.3, attackCooldown: 0.8, summonCooldown: 6, shockCooldown: 3.5 },
};

/**
 * The Warden (PLAN §11.4). Phase 1: slow telegraphed blade patterns.
 * Phase 2: summons husks + grey shockwaves; a Resonant Charge stuns him.
 * Phase 3: everything faster and denser — escalation is the theme.
 */
export class Warden implements Combatant {
  readonly kind = 'boss_warden';
  readonly view = new Container();
  x: number;
  y: number;
  readonly radius: number;
  hp = MAX_HP;
  readonly maxHp = MAX_HP;
  phase: 1 | 2 | 3 = 1;
  state: WardenState = 'idle';
  facing: Facing = 'SW';
  finished = false;
  /** flags the scene sets when the boss dies (defeat + region restore). */
  readonly defeatFlags: string[];

  private readonly anim: AnimSprite;
  private kvx = 0;
  private kvy = 0;
  private stateTimer = 0;
  private attackCd = 1;
  private summonCd = 4;
  private shockCd = 3;
  private attackActive = false;
  private attackDidHit = false;

  constructor(
    spawnX: number,
    spawnY: number,
    def: SpriteDef,
    sheet: Texture,
    props: Record<string, unknown> = {},
  ) {
    this.x = spawnX;
    this.y = spawnY;
    this.radius = def.footprint.r;
    this.defeatFlags = (props.defeatFlags as string[] | undefined) ?? [];

    const shadow = new Graphics();
    shadow.ellipse(0, 0, 48, 24).fill({ color: 0x000000, alpha: 0.35 });
    this.view.addChild(shadow);
    this.anim = new AnimSprite(def, sheet);
    this.anim.play('idle', this.facing);
    this.view.addChild(this.anim);
    this.syncView(1);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  private get tuning(): PhaseTuning {
    return TUNING[this.phase];
  }

  applyHit(hit: Hit): boolean {
    if (!this.alive) return false;
    this.hp -= hit.damage;
    // Heavy: takes reduced knockback.
    const kv = knockbackVelocity(hit, this.x, this.y);
    this.kvx = kv.x * 0.25;
    this.kvy = kv.y * 0.25;

    const newPhase: 1 | 2 | 3 = this.hp <= P3_HP ? 3 : this.hp <= P2_HP ? 2 : 1;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.attackActive = false;
      this.anim.play('death', this.facing, true);
    } else if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.state = 'transition'; // fires a shockwave via frame event
      this.attackActive = false;
      this.anim.play('transition', this.facing, true);
    } else if (this.state === 'chase' || this.state === 'idle') {
      this.state = 'hurt';
      this.stateTimer = 0.2;
      this.anim.play('hurt', this.facing, true);
    }
    return true;
  }

  /** Resonant Charge detonation nearby interrupts and stuns him (item reuse). */
  stun(): void {
    if (!this.alive || this.state === 'transition') return;
    this.state = 'stunned';
    this.stateTimer = STUN_TIME;
    this.attackActive = false;
    this.anim.play('hurt', this.facing, true);
  }

  rollDrops(ctx: EnemyCtx): void {
    ctx.spawnPickup('heart', this.x, this.y);
    for (let i = 0; i < 5; i++) {
      const a = ctx.rng.next() * Math.PI * 2;
      ctx.spawnPickup('shard', this.x + Math.cos(a) * 0.6, this.y + Math.sin(a) * 0.6);
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

    const px = ctx.player.x;
    const py = ctx.player.y;
    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy);
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.summonCd > 0) this.summonCd -= dt;
    if (this.shockCd > 0) this.shockCd -= dt;

    // Frame events drive the dangerous moments.
    this.anim.onFrameEvent = (ev) => {
      if (ev === 'hit_on') {
        this.attackActive = true;
        this.attackDidHit = false;
      } else if (ev === 'hit_off') {
        this.attackActive = false;
      } else if (ev === 'summon') {
        this.doSummon(ctx);
      } else if (ev === 'shockwave') {
        ctx.spawnShockwave(this.x, this.y);
      }
    };

    switch (this.state) {
      case 'idle': {
        if (ctx.player.alive && dist < AGGRO_RANGE) this.state = 'chase';
        this.anim.play('idle', this.facing);
        break;
      }
      case 'chase': {
        if (!ctx.player.alive) {
          this.state = 'idle';
          break;
        }
        const t = this.tuning;
        // Pick the next pattern: shockwave > summon > blade.
        if (t.shockCooldown !== null && this.shockCd <= 0) {
          this.shockCd = t.shockCooldown;
          this.state = 'transition';
          this.anim.play('transition', this.facing, true);
          break;
        }
        if (t.summonCooldown !== null && this.summonCd <= 0 && ctx.countAlive('enemy_husk') < 3) {
          this.summonCd = t.summonCooldown;
          this.state = 'summon';
          this.anim.play('summon', this.facing, true);
          break;
        }
        if (dist < ATTACK_RANGE && this.attackCd <= 0) {
          this.facing = facingFromVector(dx, dy);
          this.state = 'attack';
          this.anim.play('attack', this.facing, true); // frames before hit_on = windup
          break;
        }
        if (dist > ATTACK_RANGE * 0.8) {
          this.facing = facingFromVector(dx, dy);
          const moved = moveCircle(
            ctx.grid,
            this.x,
            this.y,
            this.radius,
            (dx / dist) * t.speed * dt,
            (dy / dist) * t.speed * dt,
          );
          this.x = moved.x;
          this.y = moved.y;
          this.anim.play('walk', this.facing);
        } else {
          this.anim.play('idle', this.facing);
        }
        break;
      }
      case 'attack': {
        if (this.attackActive && !this.attackDidHit && ctx.player.alive) {
          const dir = FACING_DIRS[this.facing];
          const hb = meleeHitbox(this.x, this.y, dir, ATTACK_REACH, ATTACK_R);
          if (circlesOverlap(hb.x, hb.y, hb.r, px, py, ctx.player.radius)) {
            const landed = ctx.player.applyHit({
              damage: ATTACK_DAMAGE,
              fromX: this.x,
              fromY: this.y,
              knockback: 6,
            });
            if (landed) this.attackDidHit = true;
          }
        }
        if (this.anim.isDone) {
          this.attackCd = this.tuning.attackCooldown;
          this.attackActive = false;
          this.state = 'chase';
        }
        break;
      }
      case 'summon':
      case 'transition': {
        if (this.anim.isDone) {
          if (this.state === 'transition' && this.phase === 3) {
            ctx.spawnShockwave(this.x, this.y); // second ring on the tail
          }
          this.state = 'chase';
        }
        break;
      }
      case 'stunned':
      case 'hurt': {
        this.stateTimer -= dt;
        this.view.alpha = this.state === 'stunned' ? 0.6 : 1;
        if (this.stateTimer <= 0) {
          this.view.alpha = 1;
          this.state = 'chase';
        }
        break;
      }
    }

    this.anim.update(dt);
    this.syncView(1);
  }

  private doSummon(ctx: EnemyCtx): void {
    for (const [ox, oy] of [
      [1.6, 0],
      [-1.6, 0],
    ]) {
      if (ctx.countAlive('enemy_husk') >= 3) break;
      ctx.spawnEnemy('enemy_husk', this.x + ox!, this.y + oy!);
    }
  }

  syncView(_alpha: number): void {
    const s = worldToScreen(this.x, this.y);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(this.x, this.y);
  }
}
