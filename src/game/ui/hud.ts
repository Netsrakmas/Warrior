import { Container, Graphics, Text } from 'pixi.js';

/** Grey-box HUD: hearts row, shard counter, key counter, toast messages. */
export class Hud {
  readonly container = new Container();
  private readonly heartsG = new Graphics();
  private readonly shardText: Text;
  private readonly keyText: Text;
  private lastKey = '';
  private toasts: { text: Text; life: number }[] = [];

  constructor() {
    this.heartsG.position.set(12, 12);
    this.container.addChild(this.heartsG);
    this.shardText = new Text({
      text: '◆ 0',
      style: { fill: 0x5ad9c8, fontSize: 18, fontFamily: 'monospace', fontWeight: 'bold' },
    });
    this.shardText.position.set(14, 44);
    this.container.addChild(this.shardText);
    this.keyText = new Text({
      text: '',
      style: { fill: 0xffd97a, fontSize: 18, fontFamily: 'monospace', fontWeight: 'bold' },
    });
    this.keyText.position.set(100, 44);
    this.container.addChild(this.keyText);
  }

  toast(msg: string): void {
    const t = new Text({
      text: msg,
      style: { fill: 0xfff2b0, fontSize: 18, fontFamily: 'monospace', fontWeight: 'bold' },
    });
    this.toasts.push({ text: t, life: 2.4 });
    this.container.addChild(t);
  }

  update(hp: number, maxHp: number, shards: number, keys: number, dt: number, viewW: number): void {
    const key = `${hp}/${maxHp}/${shards}/${keys}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.heartsG.clear();
      const hearts = Math.ceil(maxHp / 2);
      for (let i = 0; i < hearts; i++) {
        const x = i * 30;
        const fill = Math.max(0, Math.min(2, hp - i * 2));
        this.heartsG
          .roundRect(x, 0, 24, 22, 6)
          .fill(0x2a1218)
          .stroke({ width: 2, color: 0x5a1a22 });
        if (fill === 2) this.heartsG.roundRect(x + 3, 3, 18, 16, 4).fill(0xd94a5a);
        else if (fill === 1) this.heartsG.roundRect(x + 3, 3, 9, 16, 4).fill(0xd94a5a);
      }
      this.shardText.text = `◆ ${shards}`;
      this.keyText.text = keys > 0 ? `⚿ ${keys}` : '';
    }

    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i]!;
      t.life -= dt;
      t.text.alpha = Math.min(1, t.life / 0.6);
      t.text.position.set((viewW - t.text.width) / 2, 90 + i * 28 - (2.4 - t.life) * 10);
      if (t.life <= 0) {
        t.text.destroy();
        this.toasts.splice(i, 1);
      }
    }
  }
}
