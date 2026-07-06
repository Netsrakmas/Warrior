import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Facing } from './iso';

/** Shapes match src/data/schemas/sprite.schema.json (output of the sprite tool). */
export interface AnimDef {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
  /** frame index (string) → event name; fired when the frame is entered. */
  events?: Record<string, string>;
}

export interface SpriteDef {
  id: string;
  image: string;
  frameW: number;
  frameH: number;
  anchor: { x: number; y: number };
  footprint: { r: number };
  hurtbox?: { w: number; h: number };
  facings: { drawn: Facing[]; mirrored?: Partial<Record<Facing, Facing>> };
  animations: Record<string, AnimDef>;
}

/**
 * Pure playback logic (no Pixi) — frame timing, looping, frame-entered events.
 * Frame events drive gameplay (hit_on/hit_off etc.), so this must be exact:
 * every frame is entered at most once per pass, none skipped even if dt is long.
 */
export class AnimPlayer {
  time = 0;
  frame = 0;
  done = false;

  constructor(private def: AnimDef) {}

  set(def: AnimDef): void {
    this.def = def;
    this.reset();
  }

  reset(): void {
    this.time = 0;
    this.frame = 0;
    this.done = false;
  }

  /** Advance by dt seconds; returns events fired by frames entered, in order. */
  update(dt: number): string[] {
    if (this.done) return [];
    const events: string[] = [];
    this.time += dt;
    const frameDur = 1 / this.def.fps;
    while (this.time >= (this.frame + 1) * frameDur) {
      if (this.frame + 1 >= this.def.frames) {
        if (this.def.loop) {
          this.time -= this.def.frames * frameDur;
          this.frame = 0;
          this.fire(0, events);
        } else {
          this.done = true;
          break;
        }
      } else {
        this.frame++;
        this.fire(this.frame, events);
      }
    }
    return events;
  }

  private fire(frame: number, out: string[]): void {
    const ev = this.def.events?.[String(frame)];
    if (ev) out.push(ev);
  }
}

/**
 * Renderable animated sprite driven by a sprite definition. Resolves mirrored
 * facings (SW/NW drawn as horizontal flips of SE/NE — PLAN §5.2).
 */
export class AnimSprite extends Container {
  readonly sprite: Sprite;
  private readonly player: AnimPlayer;
  private readonly textureCache = new Map<string, Texture[]>();
  private currentAnim = '';
  onFrameEvent?: (event: string) => void;

  constructor(
    private readonly def: SpriteDef,
    private readonly sheet: Texture,
  ) {
    super();
    this.sprite = new Sprite();
    this.sprite.anchor.set(def.anchor.x / def.frameW, def.anchor.y / def.frameH);
    this.addChild(this.sprite);
    const first = Object.keys(def.animations)[0];
    if (!first) throw new Error(`sprite ${def.id} has no animations`);
    this.player = new AnimPlayer(def.animations[first]!);
    this.currentAnim = first;
    this.applyFrame();
  }

  /** Play `{state}_{facing}`, using a drawn facing + mirror when needed. */
  play(state: string, facing: Facing, restart = false): void {
    let name = `${state}_${facing}`;
    let mirror = false;
    if (!this.def.animations[name]) {
      const base = this.def.facings.mirrored?.[facing];
      if (base) {
        name = `${state}_${base}`;
        mirror = true;
      }
    }
    const anim = this.def.animations[name];
    if (!anim) return; // unknown state — keep playing what we have
    this.sprite.scale.x = mirror ? -1 : 1;
    if (name !== this.currentAnim || restart) {
      this.currentAnim = name;
      this.player.set(anim);
      this.applyFrame();
    }
  }

  update(dt: number): void {
    const events = this.player.update(dt);
    this.applyFrame();
    if (this.onFrameEvent) for (const ev of events) this.onFrameEvent(ev);
  }

  get animName(): string {
    return this.currentAnim;
  }

  get frame(): number {
    return this.player.frame;
  }

  get isDone(): boolean {
    return this.player.done;
  }

  private applyFrame(): void {
    const frames = this.framesFor(this.currentAnim);
    const tex = frames[Math.min(this.player.frame, frames.length - 1)];
    if (tex) this.sprite.texture = tex;
  }

  private framesFor(name: string): Texture[] {
    let frames = this.textureCache.get(name);
    if (!frames) {
      const anim = this.def.animations[name];
      if (!anim) return [];
      frames = [];
      for (let i = 0; i < anim.frames; i++) {
        frames.push(
          new Texture({
            source: this.sheet.source,
            frame: new Rectangle(
              i * this.def.frameW,
              anim.row * this.def.frameH,
              this.def.frameW,
              this.def.frameH,
            ),
          }),
        );
      }
      this.textureCache.set(name, frames);
    }
    return frames;
  }
}
