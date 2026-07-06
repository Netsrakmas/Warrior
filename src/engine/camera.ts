/**
 * Camera: lerp follow with deadzone rect, clamped to map bounds,
 * final position rounded to whole pixels (kills sprite shimmer) — PLAN §7.
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
  deadzoneW = 120;
  deadzoneH = 80;

  /** Per-60Hz-tick lerp factor. */
  smoothing = 0.15;

  constructor(private bounds: ScreenBounds) {}

  setBounds(bounds: ScreenBounds): void {
    this.bounds = bounds;
  }

  snapTo(tx: number, ty: number, viewW: number, viewH: number): void {
    this.x = tx;
    this.y = ty;
    this.clamp(viewW, viewH);
  }

  /** Fixed-timestep update; targetX/Y is the followed entity in world-screen px. */
  update(targetX: number, targetY: number, viewW: number, viewH: number): void {
    let desiredX = this.x;
    let desiredY = this.y;
    if (targetX > this.x + this.deadzoneW) desiredX = targetX - this.deadzoneW;
    else if (targetX < this.x - this.deadzoneW) desiredX = targetX + this.deadzoneW;
    if (targetY > this.y + this.deadzoneH) desiredY = targetY - this.deadzoneH;
    else if (targetY < this.y - this.deadzoneH) desiredY = targetY + this.deadzoneH;

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
