import { Container, Graphics, Text } from 'pixi.js';
import type { DialogueDef } from '../systems/dialogue';

const CHARS_PER_SEC = 45;
const BOX_H = 150;

/** Bottom dialogue panel: typewriter text, name tag, portrait slot (PLAN §9 P4). */
export class DialogueBox {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly nameTag: Text;
  private readonly body: Text;
  private readonly portrait = new Graphics();
  private readonly hint: Text;

  private def: DialogueDef | null = null;
  private lineIndex = 0;
  private shown = 0;
  private onClose: (() => void) | null = null;

  constructor() {
    this.container.visible = false;
    this.nameTag = new Text({
      text: '',
      style: { fill: 0xffd97a, fontSize: 16, fontFamily: 'monospace', fontWeight: 'bold' },
    });
    this.body = new Text({
      text: '',
      style: { fill: 0xe8e8f0, fontSize: 18, fontFamily: 'monospace', wordWrap: true },
    });
    this.hint = new Text({
      text: '▼',
      style: { fill: 0x8a8fa8, fontSize: 14, fontFamily: 'monospace' },
    });
    this.container.addChild(this.bg, this.portrait, this.nameTag, this.body, this.hint);
  }

  get isOpen(): boolean {
    return this.def !== null;
  }

  open(def: DialogueDef, onClose: () => void): void {
    this.def = def;
    this.lineIndex = 0;
    this.shown = 0;
    this.onClose = onClose;
    this.container.visible = true;
  }

  /** Advance key: finish the typewriter, then next line, then close. */
  advance(): void {
    if (!this.def) return;
    const line = this.def.lines[this.lineIndex];
    if (line && this.shown < line.text.length) {
      this.shown = line.text.length;
      return;
    }
    this.lineIndex++;
    this.shown = 0;
    if (this.lineIndex >= this.def.lines.length) {
      this.def = null;
      this.container.visible = false;
      const cb = this.onClose;
      this.onClose = null;
      cb?.();
    }
  }

  update(dt: number, viewW: number, viewH: number): void {
    if (!this.def) return;
    const line = this.def.lines[this.lineIndex];
    if (!line) return;
    this.shown = Math.min(line.text.length, this.shown + CHARS_PER_SEC * dt);

    const w = Math.min(760, viewW - 40);
    const x = (viewW - w) / 2;
    const y = viewH - BOX_H - 20;
    this.bg.clear();
    this.bg.roundRect(x, y, w, BOX_H, 10).fill({ color: 0x14141f, alpha: 0.92 }).stroke({
      width: 2,
      color: 0x5a5f78,
    });
    // Portrait slot (art arrives in Phase 5 — grey placeholder square).
    this.portrait.clear();
    this.portrait
      .roundRect(x + 14, y + 14, 72, 72, 6)
      .fill(0x2a2a3a)
      .stroke({
        width: 2,
        color: 0x5a5f78,
      });
    this.nameTag.text = line.who;
    this.nameTag.position.set(x + 100, y + 14);
    this.body.text = line.text.slice(0, Math.floor(this.shown));
    this.body.style.wordWrapWidth = w - 120;
    this.body.position.set(x + 100, y + 42);
    const complete = this.shown >= line.text.length;
    this.hint.visible = complete;
    this.hint.position.set(x + w - 26, y + BOX_H - 26);
  }
}
