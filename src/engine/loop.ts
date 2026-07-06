/**
 * Fixed 60 Hz simulation, render on rAF — PLAN §7.
 * Deterministic sim step count enables scripted Playwright tests.
 */

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/** Cap catch-up work per frame so a background tab doesn't spiral. */
const MAX_ACCUM = 0.25;

export class FixedLoop {
  private accumulator = 0;
  stepCount = 0;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  /** Feed real elapsed milliseconds (from rAF / Pixi ticker). */
  tick(elapsedMs: number): void {
    this.accumulator = Math.min(this.accumulator + elapsedMs / 1000, MAX_ACCUM);
    while (this.accumulator >= SIM_DT) {
      this.update(SIM_DT);
      this.accumulator -= SIM_DT;
      this.stepCount++;
    }
    this.render(this.accumulator / SIM_DT);
  }
}
