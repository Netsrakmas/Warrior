import { describe, it, expect } from 'vitest';
import { AnimPlayer, type AnimDef } from '../../src/engine/anim';

const walk: AnimDef = { row: 1, frames: 8, fps: 12, loop: true };
const attack: AnimDef = {
  row: 2,
  frames: 5,
  fps: 15,
  loop: false,
  events: { '2': 'hit_on', '4': 'hit_off' },
};

describe('AnimPlayer (PLAN §6.2 — timing lives in data)', () => {
  it('advances frames at the configured fps', () => {
    const p = new AnimPlayer(walk);
    p.update(1 / 12);
    expect(p.frame).toBe(1);
    p.update(3 / 12);
    expect(p.frame).toBe(4);
  });

  it('loops back to frame 0', () => {
    const p = new AnimPlayer(walk);
    p.update(8 / 12); // exactly one full cycle
    expect(p.frame).toBe(0);
    expect(p.done).toBe(false);
  });

  it('non-looping animation holds its last frame and reports done', () => {
    const p = new AnimPlayer(attack);
    p.update(10); // way past the end
    expect(p.frame).toBe(4);
    expect(p.done).toBe(true);
    expect(p.update(1)).toEqual([]); // no further events
  });

  it('fires frame events exactly once, in order, even across a big dt', () => {
    const p = new AnimPlayer(attack);
    const events = p.update(1); // whole animation in one step
    expect(events).toEqual(['hit_on', 'hit_off']);
  });

  it('fires events at the right moments with small steps', () => {
    const p = new AnimPlayer(attack);
    const fired: string[] = [];
    for (let i = 0; i < 10; i++) fired.push(...p.update(1 / 30));
    expect(fired).toEqual(['hit_on', 'hit_off']);
    // hit_on must have fired when frame 2 was entered: 2 frames at 15fps = 2/15s ≈ 4 steps of 1/30.
    const p2 = new AnimPlayer(attack);
    expect(p2.update(1 / 30)).toEqual([]);
    expect(p2.update(1 / 30)).toEqual([]);
    expect(p2.update(1 / 30)).toEqual([]);
    expect(p2.update(1 / 30)).toEqual(['hit_on']); // 4/30 ≥ 2/15
  });

  it('looping animation re-fires events every pass', () => {
    const looped: AnimDef = { row: 0, frames: 4, fps: 4, loop: true, events: { '0': 'step' } };
    const p = new AnimPlayer(looped);
    const fired: string[] = [];
    for (let i = 0; i < 8; i++) fired.push(...p.update(0.25)); // 2 seconds = 2 cycles
    expect(fired).toEqual(['step', 'step']);
  });

  it('set() switches animation and resets state', () => {
    const p = new AnimPlayer(walk);
    p.update(0.5);
    p.set(attack);
    expect(p.frame).toBe(0);
    expect(p.time).toBe(0);
    expect(p.done).toBe(false);
  });
});
