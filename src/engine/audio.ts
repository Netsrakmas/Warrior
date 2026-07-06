/** Web Audio synth SFX stubs (PLAN §9 Phase 3) — real SFX pass lands in Phase 7. */

export type SfxName = 'swing' | 'hit' | 'hurt' | 'pickup' | 'enemy_die' | 'player_die';

export class AudioStub {
  private ctx: AudioContext | null = null;

  constructor(private readonly muted: boolean) {}

  /** Browsers require a user gesture before audio; call lazily from input. */
  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  play(name: SfxName): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.connect(gain);

    switch (name) {
      case 'swing':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(700, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.09);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        break;
      case 'hit':
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        break;
      case 'hurt':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.18);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        break;
      case 'pickup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.setValueAtTime(990, t + 0.06);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        break;
      case 'enemy_die':
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        break;
      case 'player_die':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.7);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        break;
    }
    osc.start(t);
    osc.stop(t + 0.8);
  }
}
