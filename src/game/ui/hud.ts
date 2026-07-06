import { Container, Graphics, Text } from 'pixi.js';

/** Grey-box HUD: hearts row (hp in half-hearts) + shard counter. */
export class Hud {
  readonly container = new Container();
  private readonly heartsG = new Graphics();
  private readonly shardText: Text;
  private lastKey = '';

  constructor() {
    this.heartsG.position.set(12, 12);
    this.container.addChild(this.heartsG);
    this.shardText = new Text({
      text: '◆ 0',
      style: { fill: 0x5ad9c8, fontSize: 18, fontFamily: 'monospace', fontWeight: 'bold' },
    });
    this.shardText.position.set(14, 44);
    this.container.addChild(this.shardText);
  }

  update(hp: number, maxHp: number, shards: number): void {
    const key = `${hp}/${maxHp}/${shards}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.heartsG.clear();
    const hearts = Math.ceil(maxHp / 2);
    for (let i = 0; i < hearts; i++) {
      const x = i * 30;
      const fill = Math.max(0, Math.min(2, hp - i * 2)); // 0, 1 (half) or 2 (full)
      this.heartsG.roundRect(x, 0, 24, 22, 6).fill(0x2a1218).stroke({ width: 2, color: 0x5a1a22 });
      if (fill === 2) this.heartsG.roundRect(x + 3, 3, 18, 16, 4).fill(0xd94a5a);
      else if (fill === 1) this.heartsG.roundRect(x + 3, 3, 9, 16, 4).fill(0xd94a5a);
    }
    this.shardText.text = `◆ ${shards}`;
  }
}
