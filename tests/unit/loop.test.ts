import { describe, it, expect } from 'vitest';
import { FixedLoop, SIM_DT } from '../../src/engine/loop';

describe('fixed-timestep loop (PLAN §7)', () => {
  it('runs exactly 60 updates for one simulated second', () => {
    let updates = 0;
    const loop = new FixedLoop(
      () => updates++,
      () => {},
    );
    for (let i = 0; i < 100; i++) loop.tick(10); // 1000 ms in 10 ms frames
    expect(updates).toBe(60);
    expect(loop.stepCount).toBe(60);
  });

  it('always steps with a constant dt', () => {
    const dts: number[] = [];
    const loop = new FixedLoop(
      (dt) => dts.push(dt),
      () => {},
    );
    loop.tick(33.3);
    loop.tick(8.2);
    loop.tick(100);
    expect(dts.length).toBeGreaterThan(0);
    for (const dt of dts) expect(dt).toBe(SIM_DT);
  });

  it('caps catch-up after a long stall (no spiral of death)', () => {
    let updates = 0;
    const loop = new FixedLoop(
      () => updates++,
      () => {},
    );
    loop.tick(10_000); // 10s stall
    expect(updates).toBeLessThanOrEqual(15); // MAX_ACCUM 0.25s → ≤15 steps
  });

  it('passes an interpolation alpha in [0,1) to render', () => {
    const alphas: number[] = [];
    const loop = new FixedLoop(
      () => {},
      (a) => alphas.push(a),
    );
    for (let i = 0; i < 20; i++) loop.tick(7);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });
});
