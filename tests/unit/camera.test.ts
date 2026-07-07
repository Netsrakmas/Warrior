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
    cam.update(x0 + 50, y0 + 30, VIEW_W, VIEW_H); // inside 60×40 deadzone
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

  it('look-ahead: the view leads a moving target so incoming threats are visible', () => {
    const cam = new Camera(BOUNDS);
    cam.snapTo(0, 1024, VIEW_W, VIEW_H);
    // Player standing still at (0,1024), pushing screen-right.
    for (let i = 0; i < 400; i++) cam.update(0, 1024, VIEW_W, VIEW_H, { x: 1, y: 0 });
    // Camera center should settle AHEAD of the player (beyond the deadzone),
    // not lagging behind it.
    expect(cam.x).toBeGreaterThan(60);
    // Converged near lookAhead - deadzone: 170 - 60 = 110.
    expect(cam.x).toBeGreaterThan(100);
  });

  it('look-ahead eases back to center when movement stops', () => {
    const cam = new Camera(BOUNDS);
    cam.snapTo(0, 1024, VIEW_W, VIEW_H);
    for (let i = 0; i < 400; i++) cam.update(0, 1024, VIEW_W, VIEW_H, { x: 1, y: 0 });
    const ahead = cam.x;
    for (let i = 0; i < 600; i++) cam.update(0, 1024, VIEW_W, VIEW_H, { x: 0, y: 0 });
    expect(cam.x).toBeLessThan(ahead);
    // Back inside the deadzone around the resting player.
    expect(Math.abs(cam.x)).toBeLessThanOrEqual(61);
  });

  it('look-ahead is capped on small (phone) views', () => {
    const cam = new Camera(BOUNDS);
    const w = 400; // small landscape phone half
    cam.snapTo(0, 1024, w, 300);
    for (let i = 0; i < 400; i++) cam.update(0, 1024, w, 300, { x: 1, y: 0 });
    // Cap is 20% of view width = 80px → camera never leads past cap.
    expect(cam.x).toBeLessThanOrEqual(80 + 1);
  });

  it('returns pixel-rounded offsets (no sprite shimmer)', () => {
    const cam = new Camera(BOUNDS);
    cam.snapTo(123.4567, 456.789, VIEW_W, VIEW_H);
    const off = cam.offset(VIEW_W, VIEW_H);
    expect(off.x).toBe(Math.round(off.x));
    expect(off.y).toBe(Math.round(off.y));
  });
});
