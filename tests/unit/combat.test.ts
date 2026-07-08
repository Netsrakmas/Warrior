import { describe, it, expect } from 'vitest';
import {
  circlesOverlap,
  decayVelocity,
  inSwordArc,
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

describe('sword swing arc (aim is analog, not quantized to 4 facings)', () => {
  const RANGE = 1.3;
  const HALF_ARC_COS = Math.cos(((110 / 2) * Math.PI) / 180);
  const POINT_BLANK = 0.45;
  const arc = (dir: { x: number; y: number }, tx: number, ty: number, r = 0.3): boolean =>
    inSwordArc(0, 0, dir, tx, ty, r, RANGE, HALF_ARC_COS, POINT_BLANK);

  it('hits a target straight ahead within range', () => {
    expect(arc({ x: 1, y: 0 }, 1.2, 0)).toBe(true);
  });

  it('misses beyond range', () => {
    expect(arc({ x: 1, y: 0 }, 1.7, 0)).toBe(false);
  });

  it('hits between the 4 sprite facings — screen-down aim connects', () => {
    // Screen-down = world (√½, √½); enemy directly there at near-max range.
    const d = Math.SQRT1_2;
    expect(arc({ x: d, y: d }, 0.85, 0.85)).toBe(true);
  });

  it('misses a target behind the swing', () => {
    expect(arc({ x: 1, y: 0 }, -1.0, 0)).toBe(false);
  });

  it('misses a target far off to the side (beyond the 55° half-arc)', () => {
    // 90° off-axis at mid range.
    expect(arc({ x: 1, y: 0 }, 0, 1.0)).toBe(false);
  });

  it('point-blank targets hit regardless of angle', () => {
    expect(arc({ x: 1, y: 0 }, -0.4, 0)).toBe(true); // touching, behind
  });

  it('edge of arc: ~50° off-axis still connects', () => {
    const a = (50 * Math.PI) / 180;
    expect(arc({ x: 1, y: 0 }, Math.cos(a), Math.sin(a))).toBe(true);
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
