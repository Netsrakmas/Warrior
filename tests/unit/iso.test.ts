import { describe, it, expect } from 'vitest';
import {
  TILE_W,
  TILE_H,
  worldToScreen,
  screenToWorld,
  depthOf,
  facingFromVector,
  screenDirToWorld,
} from '../../src/engine/iso';

describe('iso transforms (PLAN §5.1)', () => {
  it('locked spec: 128×64 tiles', () => {
    expect(TILE_W).toBe(128);
    expect(TILE_H).toBe(64);
  });

  it('maps known world points to screen', () => {
    expect(worldToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(worldToScreen(1, 0)).toEqual({ x: 64, y: 32 });
    expect(worldToScreen(0, 1)).toEqual({ x: -64, y: 32 });
    expect(worldToScreen(1, 1)).toEqual({ x: 0, y: 64 });
  });

  it('round-trips world → screen → world', () => {
    for (let wx = -3; wx <= 35; wx += 0.7) {
      for (let wy = -3; wy <= 35; wy += 0.9) {
        const s = worldToScreen(wx, wy);
        const w = screenToWorld(s.x, s.y);
        expect(w.x).toBeCloseTo(wx, 9);
        expect(w.y).toBeCloseTo(wy, 9);
      }
    }
  });

  it('round-trips screen → world → screen', () => {
    for (let sx = -500; sx <= 500; sx += 137) {
      for (let sy = -300; sy <= 900; sy += 91) {
        const w = screenToWorld(sx, sy);
        const s = worldToScreen(w.x, w.y);
        expect(s.x).toBeCloseTo(sx, 9);
        expect(s.y).toBeCloseTo(sy, 9);
      }
    }
  });

  it('depth ascends toward the camera (feet position)', () => {
    // An entity standing north-west of a pillar draws behind it.
    expect(depthOf(4, 4)).toBeLessThan(depthOf(5, 5));
    // Same tile diagonal → same depth.
    expect(depthOf(3, 7)).toBe(depthOf(7, 3));
  });

  it('picks the nearest of 4 facings from a world vector', () => {
    expect(facingFromVector(1, 0)).toBe('SE');
    expect(facingFromVector(-1, 0)).toBe('NW');
    expect(facingFromVector(0, 1)).toBe('SW');
    expect(facingFromVector(0, -1)).toBe('NE');
    expect(facingFromVector(1, 0.5)).toBe('SE');
    expect(facingFromVector(0.2, -0.9)).toBe('NE');
  });

  it('screen-up input maps to world (-1,-1) normalized (PLAN §5.1)', () => {
    const up = screenDirToWorld(0, -1);
    expect(up.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(up.y).toBeCloseTo(-Math.SQRT1_2, 9);
  });

  it('screen-right input maps to world (+1,-1) normalized', () => {
    const right = screenDirToWorld(1, 0);
    expect(right.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(right.y).toBeCloseTo(-Math.SQRT1_2, 9);
  });

  it('returns zero vector for no input', () => {
    expect(screenDirToWorld(0, 0)).toEqual({ x: 0, y: 0 });
  });
});
