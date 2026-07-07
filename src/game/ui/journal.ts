import { Container, Graphics, Text } from 'pixi.js';
import type { QuestLog } from '../systems/quests';

/** Quest journal panel, toggled with Q/Tab. */
export class Journal {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly title: Text;
  private rows: Text[] = [];
  visible = false;

  constructor() {
    this.container.visible = false;
    this.title = new Text({
      text: 'JOURNAL',
      style: {
        fill: 0xffd97a,
        fontSize: 20,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        letterSpacing: 4,
      },
    });
    this.container.addChild(this.bg, this.title);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
  }

  update(quests: QuestLog, viewW: number): void {
    if (!this.visible) return;
    const w = 420;
    const x = viewW - w - 16;
    const y = 16;
    const entries = quests.journal();
    const h = 60 + Math.max(1, entries.length) * 58;

    this.bg.clear();
    this.bg.roundRect(x, y, w, h, 10).fill({ color: 0x14141f, alpha: 0.92 }).stroke({
      width: 2,
      color: 0x5a5f78,
    });
    this.title.position.set(x + 18, y + 14);

    for (const r of this.rows) r.destroy();
    this.rows = [];
    if (entries.length === 0) {
      const t = new Text({
        text: 'No quests yet.',
        style: { fill: 0x8a8fa8, fontSize: 15, fontFamily: 'monospace' },
      });
      t.position.set(x + 18, y + 52);
      this.rows.push(t);
      this.container.addChild(t);
      return;
    }
    entries.forEach((e, i) => {
      const head = new Text({
        text: `${e.done ? '✓ ' : '• '}${e.title}`,
        style: {
          fill: e.done ? 0x6a9b6a : 0xe8e8f0,
          fontSize: 16,
          fontFamily: 'monospace',
          fontWeight: 'bold',
        },
      });
      head.position.set(x + 18, y + 52 + i * 58);
      const sub = new Text({
        text: `  ${e.stepDesc}${e.progress ? `  (${e.progress})` : ''}`,
        style: {
          fill: 0x9a9fb8,
          fontSize: 14,
          fontFamily: 'monospace',
          wordWrap: true,
          wordWrapWidth: w - 40,
        },
      });
      sub.position.set(x + 18, y + 74 + i * 58);
      this.rows.push(head, sub);
      this.container.addChild(head, sub);
    });
  }
}
