import { describe, it, expect } from 'vitest';
import {
  circlesOverlap,
  decayVelocity,
  knockbackVelocity,
  meleeHitbox,
} from '../../src/game/systems/combat';
import { Rng } from '../../src/engine/rng';
import { FACING_DIRS } from '../../src/engine/iso';

describe('combat math', () => {
  it('circle overlap detects touch and miss', () => {
    expect(circlesOverlap(0, 0, 0.5, 0.9, 0, 0.5)).toBe(true);
    expect(circlesOverlap(0, 0, 0.5, 1.1, 0, 0.5)).toBe(false);
  });

  it('knockback pushes directly away from the hit source', () => {
    const kv = knockbackVelocity({ damage: 1, fromX: 0, fromY: 0, knockback: 6 }, 1, 0);
    expect(kv.x).toBeCloseTo(6, 9);
    expect(kv.y).toBeCloseTo(0, 9);
    const diag = knockbackVelocity({ damage: 1, fromX: 1, fromY: 1, knockback: 6 }, 2, 2);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(6, 9);
    expect(diag.x).toBeCloseTo(diag.y, 9);
  });

  it('degenerate knockback (same position) still pushes somewhere', () => {
    const kv = knockbackVelocity({ damage: 1, fromX: 3, fromY: 3, knockback: 6 }, 3, 3);
    expect(Math.hypot(kv.x, kv.y)).toBeCloseTo(6, 9);
  });

  it('velocity decays toward zero and clamps to exactly zero', () => {
    let v = { x: 7, y: -7 };
    for (let i = 0; i < 120; i++) v = decayVelocity(v, 1 / 60);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('melee hitbox sits in front of the attacker toward its facing', () => {
    const hb = meleeHitbox(5, 5, FACING_DIRS.SE, 0.7, 0.55);
    expect(hb).toEqual({ x: 5.7, y: 5, r: 0.55 });
    const hbNE = meleeHitbox(5, 5, FACING_DIRS.NE, 0.7, 0.55);
    expect(hbNE).toEqual({ x: 5, y: 4.3, r: 0.55 });
  });
});

describe('seeded rng (deterministic test mode — PLAN §12)', () => {
  it('same seed produces the same sequence', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it('int() stays inclusive within bounds', () => {
    const r = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.int(1, 3);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('chance() respects probability roughly', () => {
    const r = new Rng(42);
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (r.chance(0.5)) hits++;
    expect(hits).toBeGreaterThan(850);
    expect(hits).toBeLessThan(1150);
  });
});
