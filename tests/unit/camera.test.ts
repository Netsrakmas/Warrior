import { describe, it, expect } from 'vitest';
import { Camera } from '../../src/engine/camera';

const BOUNDS = { minX: -2048, maxX: 2048, minY: 0, maxY: 2048 };
const VIEW_W = 1280;
const VIEW_H = 720;

describe('camera (PLAN §7)', () => {
  it('does not move while the target stays inside the deadzone', () => {
    const cam = new Camera(BOUNDS);
    cam.snapTo(0, 1024, VIEW_W, VIEW_H);
    const x0 = cam.x;
    const y0 = cam.y;
    cam.update(x0 + 50, y0 + 30, VIEW_W, VIEW_H); // inside 120×80 deadzone
    expect(cam.x).toBe(x0);
    expect(cam.y).toBe(y0);
  });

  it('converges on a target outside the deadzone', () => {
    const cam = new Camera(BOUNDS);
    cam.snapTo(0, 1024, VIEW_W, VIEW_H);
    for (let i = 0; i < 300; i++) cam.update(600, 1024, VIEW_W, VIEW_H);
    // Camera should end with the target just inside the deadzone edge.
    expect(Math.abs(600 - cam.x)).toBeLessThanOrEqual(cam.deadzoneW + 1);
  });

  it('clamps so the view never leaves map bounds', () => {
    const cam = new Camera(BOUNDS);
    cam.snapTo(99999, 99999, VIEW_W, VIEW_H);
    expect(cam.x).toBeLessThanOrEqual(BOUNDS.maxX - VIEW_W / 2);
    expect(cam.y).toBeLessThanOrEqual(BOUNDS.maxY - VIEW_H / 2);
    cam.snapTo(-99999, -99999, VIEW_W, VIEW_H);
    expect(cam.x).toBeGreaterThanOrEqual(BOUNDS.minX + VIEW_W / 2);
    expect(cam.y).toBeGreaterThanOrEqual(BOUNDS.minY + VIEW_H / 2);
  });

  it('centers when the map is smaller than the view', () => {
    const cam = new Camera({ minX: -100, maxX: 100, minY: 0, maxY: 100 });
    cam.snapTo(9999, 9999, VIEW_W, VIEW_H);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(50);
  });

  it('returns pixel-rounded offsets (no sprite shimmer)', () => {
    const cam = new Camera(BOUNDS);
    cam.snapTo(123.4567, 456.789, VIEW_W, VIEW_H);
    const off = cam.offset(VIEW_W, VIEW_H);
    expect(off.x).toBe(Math.round(off.x));
    expect(off.y).toBe(Math.round(off.y));
  });
});
