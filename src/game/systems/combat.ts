import type { Vec2 } from '../../engine/iso';

/** A landed strike: damage in half-hearts, knockback impulse away from source. */
export interface Hit {
  damage: number;
  fromX: number;
  fromY: number;
  knockback: number; // tiles/sec initial impulse
}

/** Anything that can be struck. applyHit returns false if the hit was ignored (i-frames, dead). */
export interface Combatant {
  x: number;
  y: number;
  radius: number;
  readonly alive: boolean;
  applyHit(hit: Hit): boolean;
}

export function circlesOverlap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const r = r1 + r2;
  return dx * dx + dy * dy < r * r;
}

/** Impulse pushing the target directly away from the hit source. */
export function knockbackVelocity(hit: Hit, x: number, y: number): Vec2 {
  const dx = x - hit.fromX;
  const dy = y - hit.fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: hit.knockback, y: 0 };
  return { x: (dx / len) * hit.knockback, y: (dy / len) * hit.knockback };
}

/** Exponential decay used for knockback velocities (feels snappy, frame-rate independent). */
export function decayVelocity(v: Vec2, dt: number, rate = 10): Vec2 {
  const f = Math.exp(-rate * dt);
  const nx = v.x * f;
  const ny = v.y * f;
  return { x: Math.abs(nx) < 0.01 ? 0 : nx, y: Math.abs(ny) < 0.01 ? 0 : ny };
}

/** Melee hitbox helper: a circle offset from the attacker toward its facing. */
export function meleeHitbox(
  x: number,
  y: number,
  dir: Vec2,
  reach: number,
  r: number,
): { x: number; y: number; r: number } {
  return { x: x + dir.x * reach, y: y + dir.y * reach, r };
}

/**
 * Sword-swing arc test: does a swing from (ax,ay) aimed along `dir`
 * (normalized) reach a target circle at (tx,ty)? Targets inside the
 * point-blank ring hit regardless of angle; beyond it they must be within
 * the arc's half-angle of the aim direction. This replaces the old single
 * offset circle so aiming at any angle (including screen-down, between the
 * four sprite facings) connects.
 */
export function inSwordArc(
  ax: number,
  ay: number,
  dir: Vec2,
  tx: number,
  ty: number,
  targetR: number,
  range: number,
  halfArcCos: number,
  pointBlank: number,
): boolean {
  const ex = tx - ax;
  const ey = ty - ay;
  const dist = Math.hypot(ex, ey);
  if (dist > range + targetR) return false;
  if (dist <= pointBlank + targetR) return true;
  const dot = (ex * dir.x + ey * dir.y) / dist;
  return dot >= halfArcCos;
}
