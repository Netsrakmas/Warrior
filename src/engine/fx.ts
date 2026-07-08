import { Container, Graphics } from 'pixi.js';
import { worldToScreen } from './iso';

/**
 * Feel effects (PLAN §9 Phase 3): hitstop (~60 ms world freeze), screen shake,
 * and placeholder hit sparks.
 */
export class Fx {
  /** World container for sparks (depth-sorted with everything else). */
  readonly layer = new Container();
  private hitstopTimer = 0;
  private shakeTimer = 0;
  private shakeDuration = 0;
  private shakeAmp = 0;
  private sparks: { g: Container; life: number }[] = [];

  hitstop(seconds = 0.06): void {
    this.hitstopTimer = Math.max(this.hitstopTimer, seconds);
  }

  shake(amplitude = 5, duration = 0.15): void {
    this.shakeAmp = Math.max(this.shakeAmp, amplitude);
    this.shakeDuration = duration;
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  /**
   * Sword-swing arc oriented along the world-space aim direction, drawn as a
   * screen-space iso-squashed sweep so the player can read exactly where the
   * hit lands (placeholder until the Phase 7 slash VFX).
   */
  slash(wx: number, wy: number, dirX: number, dirY: number, halfArcRad: number): void {
    const wrap = new Container();
    const g = new Graphics();
    // In un-squashed circle space the screen angle of world dir (dx,dy) is
    // atan2(dx+dy, dx-dy); the wrapper's y-scale applies the iso squash.
    const angle = Math.atan2(dirX + dirY, dirX - dirY);
    g.arc(0, 0, 86, angle - halfArcRad, angle + halfArcRad).stroke({
      width: 14,
      color: 0xfff2b0,
      alpha: 0.85,
    });
    g.arc(0, 0, 70, angle - halfArcRad * 0.8, angle + halfArcRad * 0.8).stroke({
      width: 6,
      color: 0xffffff,
      alpha: 0.9,
    });
    wrap.scale.y = 0.5;
    wrap.addChild(g);
    const s = worldToScreen(wx, wy);
    wrap.position.set(s.x, s.y - 24);
    wrap.zIndex = wx + wy + 0.02;
    this.layer.addChild(wrap);
    this.sparks.push({ g: wrap, life: 0.2 });
  }

  spark(wx: number, wy: number, color = 0xfff2b0): void {
    const g = new Graphics();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      g.moveTo(Math.cos(a) * 4, Math.sin(a) * 2)
        .lineTo(Math.cos(a) * 14, Math.sin(a) * 7)
        .stroke({ width: 3, color });
    }
    const s = worldToScreen(wx, wy);
    g.position.set(s.x, s.y - 30);
    g.zIndex = wx + wy + 0.01;
    this.layer.addChild(g);
    this.sparks.push({ g, life: 0.15 });
  }

  /** True while the world should be frozen. Always ticks its own timers. */
  update(dt: number): boolean {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i]!;
      sp.life -= dt;
      sp.g.alpha = Math.max(0, sp.life / 0.15);
      if (sp.life <= 0) {
        sp.g.destroy();
        this.sparks.splice(i, 1);
      }
    }
    if (this.shakeTimer > 0) this.shakeTimer -= dt;
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return true;
    }
    return false;
  }

  /** Current shake offset in px, decaying over the shake duration. */
  shakeOffset(): { x: number; y: number } {
    if (this.shakeTimer <= 0 || this.shakeDuration <= 0) return { x: 0, y: 0 };
    const falloff = this.shakeTimer / this.shakeDuration;
    const amp = this.shakeAmp * falloff;
    // Deterministic wobble (no Math.random — keeps test mode reproducible).
    const t = this.shakeTimer * 120;
    return { x: Math.sin(t * 1.3) * amp, y: Math.cos(t * 1.7) * amp * 0.6 };
  }
}
