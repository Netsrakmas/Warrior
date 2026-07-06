import { describe, it, expect } from 'vitest';
import {
  moveCircle,
  isBlocked,
  CELL_SOLID,
  CELL_WATER,
  type CollisionGrid,
} from '../../src/engine/collision';

/** 10×10 open grid with optional blocked cells. */
function grid(blocked: Array<[number, number, number?]> = []): CollisionGrid {
  const cells = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0));
  for (const [tx, ty, kind] of blocked) {
    const row = cells[ty];
    if (row) row[tx] = kind ?? CELL_SOLID;
  }
  return { width: 10, height: 10, cells };
}

const R = 0.3;

describe('circle vs grid collision (PLAN §7)', () => {
  it('moves freely on open ground', () => {
    const g = grid();
    const p = moveCircle(g, 5, 5, R, 0.5, -0.25);
    expect(p.x).toBeCloseTo(5.5, 9);
    expect(p.y).toBeCloseTo(4.75, 9);
  });

  it('out of bounds counts as blocked', () => {
    const g = grid();
    expect(isBlocked(g, -1, 5)).toBe(true);
    expect(isBlocked(g, 5, 10)).toBe(true);
    expect(isBlocked(g, 5, 5)).toBe(false);
  });

  it('water blocks walking', () => {
    const g = grid([[5, 5, CELL_WATER]]);
    expect(isBlocked(g, 5, 5)).toBe(true);
  });

  it('stops at a solid wall, keeping the footprint outside', () => {
    const g = grid([[5, 5]]);
    const p = moveCircle(g, 4.5, 5.5, R, 1, 0);
    expect(p.x).toBeLessThanOrEqual(5 - R);
    expect(p.x).toBeCloseTo(5 - R, 4);
    expect(p.y).toBeCloseTo(5.5, 9);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const g = grid([[5, 5]]);
    // Push east into the wall while also moving south → x clamps, y continues.
    const p = moveCircle(g, 4.5, 5.5, R, 1, 0.3);
    expect(p.x).toBeCloseTo(5 - R, 4);
    expect(p.y).toBeCloseTo(5.8, 9);
  });

  it('slides along a wall of multiple tiles without snagging seams', () => {
    const g = grid([
      [5, 3],
      [5, 4],
      [5, 5],
      [5, 6],
    ]);
    let x = 4.5;
    let y = 3.5;
    // Many small steps pressing diagonally into the wall, like held input.
    for (let i = 0; i < 60; i++) {
      const p = moveCircle(g, x, y, R, 0.05, 0.05);
      x = p.x;
      y = p.y;
    }
    expect(x).toBeLessThanOrEqual(5 - R + 1e-6);
    expect(y).toBeCloseTo(3.5 + 60 * 0.05, 4); // full southward travel
  });

  it('blocks on tile corners (no tunnelling through diagonals)', () => {
    const g = grid([[5, 5]]);
    // Approach the north-west corner of (5,5) diagonally.
    const p = moveCircle(g, 4.8, 4.8, R, 0.4, 0.4);
    const cx = Math.max(5, Math.min(p.x, 6));
    const cy = Math.max(5, Math.min(p.y, 6));
    const dist = Math.hypot(p.x - cx, p.y - cy);
    expect(dist).toBeGreaterThanOrEqual(R - 1e-6);
  });

  it('map border walls contain the player', () => {
    const g = grid();
    const p = moveCircle(g, 0.5, 5, R, -2, 0);
    expect(p.x).toBeGreaterThanOrEqual(R);
  });

  it('does not clamp movement away from a wall', () => {
    const g = grid([[5, 5]]);
    const p = moveCircle(g, 5 - R - 1e-6, 5.5, R, -0.5, 0);
    expect(p.x).toBeCloseTo(5 - R - 1e-6 - 0.5, 9);
  });
});
