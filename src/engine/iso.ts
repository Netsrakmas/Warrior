/**
 * Isometric (2:1 dimetric) coordinate math — PLAN §5.1.
 * World positions are floats in tile units (wx, wy). Screen positions in px.
 */

export const TILE_W = 128;
export const TILE_H = 64;

export interface Vec2 {
  x: number;
  y: number;
}

/** World (tile units) → screen (px). */
export function worldToScreen(wx: number, wy: number): Vec2 {
  return {
    x: ((wx - wy) * TILE_W) / 2,
    y: ((wx + wy) * TILE_H) / 2,
  };
}

/** Screen (px) → world (tile units). Inverse of worldToScreen. */
export function screenToWorld(sx: number, sy: number): Vec2 {
  return {
    x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
    y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
  };
}

/** Draw-order key: ascending depth = back to front. Use feet position. */
export function depthOf(wx: number, wy: number): number {
  return wx + wy;
}

export type Facing = 'SE' | 'NE' | 'SW' | 'NW';

/**
 * Nearest of 4 facings for a world-space direction vector.
 * World +x runs screen down-right (SE); world +y runs screen down-left (SW).
 */
export function facingFromVector(dx: number, dy: number): Facing {
  if (dx === 0 && dy === 0) return 'SE';
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'SE' : 'NW';
  return dy > 0 ? 'SW' : 'NE';
}

/**
 * Screen-space input intent → normalized world-space direction (PLAN §5.1):
 * screen-up (0,-1) maps to world (-1,-1)/√2; screen-right (1,0) to (+1,-1)/√2.
 */
export function screenDirToWorld(sx: number, sy: number): Vec2 {
  if (sx === 0 && sy === 0) return { x: 0, y: 0 };
  const wx = sx + sy;
  const wy = sy - sx;
  const len = Math.hypot(wx, wy);
  return { x: wx / len, y: wy / len };
}
