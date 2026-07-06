/**
 * Circle-footprint vs collision-grid resolution — PLAN §7.
 * Axis-separated (move X, resolve, move Y, resolve) → natural wall-slide.
 * All coordinates in world tile units; each grid cell is a 1×1 rect.
 */

export const CELL_WALK = 0;
export const CELL_SOLID = 1;
export const CELL_WATER = 2;
export const CELL_CRACKED = 3;

export interface CollisionGrid {
  width: number;
  height: number;
  /** cells[ty][tx] — row-major, values CELL_*. */
  cells: number[][];
}

/** Anything that isn't plain ground blocks walking (water/cracked gate items come later). */
export function isBlocked(grid: CollisionGrid, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return true;
  const row = grid.cells[ty];
  if (!row) return true;
  const cell = row[tx];
  return cell === undefined || cell !== CELL_WALK;
}

function circlePenetratesTile(px: number, py: number, r: number, tx: number, ty: number): boolean {
  const cx = Math.max(tx, Math.min(px, tx + 1));
  const cy = Math.max(ty, Math.min(py, ty + 1));
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy < r * r;
}

const EPS = 1e-7;
const MAX_RESOLVE_PASSES = 8;

/**
 * Resolve movement along one axis from `start` to `target`, with the other
 * axis fixed at `otherPos`. Scans the full swept band (no tunnelling through
 * tiles skipped by a large step) and repeats until stable, since clamping can
 * back the circle into a tile that wasn't penetrated at the target position.
 */
function resolveAxis(
  grid: CollisionGrid,
  otherPos: number,
  start: number,
  target: number,
  r: number,
  axis: 'x' | 'y',
): number {
  const dir = Math.sign(target - start);
  if (dir === 0) return target;
  let pos = target;
  for (let pass = 0; pass < MAX_RESOLVE_PASSES; pass++) {
    let hit = false;
    const aMin = Math.min(start, pos) - r;
    const aMax = Math.max(start, pos) + r;
    const bMin = otherPos - r;
    const bMax = otherPos + r;
    const tx0 = Math.floor(axis === 'x' ? aMin : bMin);
    const tx1 = Math.floor(axis === 'x' ? aMax : bMax);
    const ty0 = Math.floor(axis === 'y' ? aMin : bMin);
    const ty1 = Math.floor(axis === 'y' ? aMax : bMax);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isBlocked(grid, tx, ty)) continue;
        const cpx = axis === 'x' ? pos : otherPos;
        const cpy = axis === 'y' ? pos : otherPos;
        if (!circlePenetratesTile(cpx, cpy, r, tx, ty)) continue;
        const lo = axis === 'x' ? tx : ty;
        const clamped = dir > 0 ? Math.min(pos, lo - r - EPS) : Math.max(pos, lo + 1 + r + EPS);
        if (clamped !== pos) {
          pos = clamped;
          hit = true;
        }
      }
    }
    if (!hit) return pos;
  }
  return start; // couldn't reach a clean spot — refuse the move
}

/**
 * Move a circle footprint by (dx, dy), resolving against blocked cells one
 * axis at a time so the circle slides along walls instead of sticking.
 */
export function moveCircle(
  grid: CollisionGrid,
  x: number,
  y: number,
  r: number,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const nx = resolveAxis(grid, y, x, x + dx, r, 'x');
  const ny = resolveAxis(grid, nx, y, y + dy, r, 'y');
  return { x: nx, y: ny };
}
