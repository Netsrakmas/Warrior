import type { Vec2 } from './iso';

/**
 * Camera: lerp follow with deadzone rect + movement look-ahead, clamped to
 * map bounds, final position rounded to whole pixels (kills shimmer) — PLAN §7.
 * Camera position is the view center, in world-screen (container) pixels.
 */

export interface ScreenBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class Camera {
  x = 0;
  y = 0;

  /** Deadzone half-extents in px: target may drift this far before the camera follows. */
  deadzoneW = 60;
  deadzoneH = 40;

  /**
   * Look-ahead in px: the view leads the player toward their movement
   * direction so incoming threats are visible before they're on top of you.
   * Capped to a fraction of the view so small (phone) screens never push
   * the player offscreen.
   */
  lookAheadX = 170;
  lookAheadY = 110;

  /** Per-60Hz-tick lerp factors. */
  smoothing = 0.15;
  lookSmoothing = 0.06;

  private lookX = 0;
  private lookY = 0;

  constructor(private bounds: ScreenBounds) {}

  setBounds(bounds: ScreenBounds): void {
    this.bounds = bounds;
  }

  snapTo(tx: number, ty: number, viewW: number, viewH: number): void {
    this.x = tx;
    this.y = ty;
    this.lookX = 0;
    this.lookY = 0;
    this.clamp(viewW, viewH);
  }

  /**
   * Fixed-timestep update; targetX/Y is the followed entity in world-screen
   * px, moveDir the screen-space movement intent (length ≤ ~1.5, zero at rest).
   */
  update(
    targetX: number,
    targetY: number,
    viewW: number,
    viewH: number,
    moveDir: Vec2 = { x: 0, y: 0 },
  ): void {
    // Ease the look-ahead offset toward the movement direction (and back to
    // zero at rest), normalized so diagonals don't overshoot.
    let mx = moveDir.x;
    let my = moveDir.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const lax = Math.min(this.lookAheadX, viewW * 0.2);
    const lay = Math.min(this.lookAheadY, viewH * 0.2);
    this.lookX += (mx * lax - this.lookX) * this.lookSmoothing;
    this.lookY += (my * lay - this.lookY) * this.lookSmoothing;

    const tx = targetX + this.lookX;
    const ty = targetY + this.lookY;
    let desiredX = this.x;
    let desiredY = this.y;
    if (tx > this.x + this.deadzoneW) desiredX = tx - this.deadzoneW;
    else if (tx < this.x - this.deadzoneW) desiredX = tx + this.deadzoneW;
    if (ty > this.y + this.deadzoneH) desiredY = ty - this.deadzoneH;
    else if (ty < this.y - this.deadzoneH) desiredY = ty + this.deadzoneH;

    this.x += (desiredX - this.x) * this.smoothing;
    this.y += (desiredY - this.y) * this.smoothing;
    this.clamp(viewW, viewH);
  }

  private clamp(viewW: number, viewH: number): void {
    this.x = clampAxis(this.x, this.bounds.minX, this.bounds.maxX, viewW);
    this.y = clampAxis(this.y, this.bounds.minY, this.bounds.maxY, viewH);
  }

  /** Container offset that centers the camera in the view, pixel-rounded. */
  offset(viewW: number, viewH: number): { x: number; y: number } {
    return {
      x: Math.round(viewW / 2 - this.x),
      y: Math.round(viewH / 2 - this.y),
    };
  }
}

function clampAxis(center: number, min: number, max: number, view: number): number {
  const half = view / 2;
  if (max - min <= view) return (min + max) / 2; // map smaller than view → center it
  return Math.max(min + half, Math.min(max - half, center));
}
