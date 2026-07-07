import { Container, Graphics, Text } from 'pixi.js';
import { depthOf, worldToScreen, type Vec2 } from '../../engine/iso';
import { CELL_SOLID, CELL_WALK, type CollisionGrid } from '../../engine/collision';
import { pickDialogue, type DialogueDefs } from '../systems/dialogue';
import type { GameState } from '../state';
import type { QuestLog } from '../systems/quests';
import type { DialogueDef } from '../systems/dialogue';

/** Shared adventure services handed to interactive props. */
export interface AdventureEnv {
  state: GameState;
  quests: QuestLog;
  dialogues: DialogueDefs;
  openDialogue(def: DialogueDef): void;
  toast(msg: string): void;
}

/** Anything the player can walk up to and press E on. */
export interface Interactable {
  x: number;
  y: number;
  canInteract(env: AdventureEnv): boolean;
  interact(env: AdventureEnv): void;
}

function labelText(text: string): Text {
  return new Text({
    text,
    style: { fill: 0xc8ccd8, fontSize: 13, fontFamily: 'monospace' },
  });
}

/** Grey-box NPC: coloured slab + name label; branching dialogue by requirements. */
export class Npc implements Interactable {
  readonly view = new Container();
  readonly dialogueIds: string[];

  constructor(
    public x: number,
    public y: number,
    props: Record<string, unknown>,
  ) {
    this.dialogueIds = (props.dialogues as string[] | undefined) ?? [];
    const color = typeof props.color === 'string' ? Number(props.color) : 0x8ad9a5;
    const name = typeof props.name === 'string' ? props.name : 'npc';

    const g = new Graphics();
    g.ellipse(0, 0, 30, 15).fill({ color: 0x000000, alpha: 0.3 });
    g.roundRect(-16, -64, 32, 42, 6).fill(color).stroke({ width: 2, color: 0x2c3c34 });
    g.circle(0, -74, 12).fill(color).stroke({ width: 2, color: 0x2c3c34 });
    this.view.addChild(g);
    const label = labelText(name);
    label.anchor.set(0.5, 1);
    label.position.set(0, -92);
    this.view.addChild(label);
    const s = worldToScreen(x, y);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(x, y);
  }

  canInteract(env: AdventureEnv): boolean {
    return pickDialogue(this.dialogueIds, env.dialogues, env.state, env.quests) !== null;
  }

  interact(env: AdventureEnv): void {
    const picked = pickDialogue(this.dialogueIds, env.dialogues, env.state, env.quests);
    if (picked) env.openDialogue(picked.def);
  }
}

/** Chest: one-shot item container; opened state persists via a flag. */
export class Chest implements Interactable {
  readonly view = new Container();
  private readonly item: string;
  private readonly flag: string;
  private readonly completeStep: { id: string; step: string } | undefined;
  private readonly g = new Graphics();
  private drawnOpen: boolean | null = null;

  constructor(
    public x: number,
    public y: number,
    props: Record<string, unknown>,
  ) {
    this.item = (props.item as string) ?? 'shard';
    this.flag = (props.flag as string) ?? `f_chest_${Math.round(x)}_${Math.round(y)}`;
    this.completeStep = props.completeStep as { id: string; step: string } | undefined;
    this.view.addChild(this.g);
    const s = worldToScreen(x, y);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(x, y);
  }

  private draw(open: boolean): void {
    if (this.drawnOpen === open) return;
    this.drawnOpen = open;
    this.g.clear();
    this.g.ellipse(0, 0, 30, 15).fill({ color: 0x000000, alpha: 0.3 });
    this.g.roundRect(-22, -30, 44, 28, 4).fill(0x8a6b46).stroke({ width: 2, color: 0x3c2c1a });
    if (open) {
      this.g.roundRect(-22, -52, 44, 12, 4).fill(0x6a5236).stroke({ width: 2, color: 0x3c2c1a });
      this.g.rect(-16, -28, 32, 8).fill(0x14141f);
    } else {
      this.g.roundRect(-22, -40, 44, 12, 4).fill(0xa5824f).stroke({ width: 2, color: 0x3c2c1a });
      this.g.rect(-4, -34, 8, 8).fill(0xffd97a);
    }
  }

  isOpen(env: AdventureEnv): boolean {
    return env.state.flags.get(this.flag);
  }

  canInteract(env: AdventureEnv): boolean {
    return !this.isOpen(env);
  }

  interact(env: AdventureEnv): void {
    if (this.isOpen(env)) return;
    env.state.flags.set(this.flag);
    if (this.item === 'heart_container') {
      env.state.maxHp += 2;
      env.state.hp = env.state.maxHp;
      env.toast('Got a Heart Container! Max hearts up!');
    } else {
      env.state.addItem(this.item);
      env.toast(`Got ${this.item.replace(/_/g, ' ')}!`);
    }
    if (this.completeStep) env.quests.completeStep(this.completeStep.id, this.completeStep.step);
  }

  update(env: AdventureEnv): void {
    this.draw(this.isOpen(env));
  }
}

/** Door: blocks its tile until opened by a key (interact) or a watched flag. */
export class Door implements Interactable {
  readonly view = new Container();
  readonly tx: number;
  readonly ty: number;
  x: number;
  y: number;
  private readonly stateFlag: string;
  private readonly opensWith: string | null;
  private readonly watchFlag: string | null;
  private readonly g = new Graphics();
  private drawnOpen: boolean | null = null;

  constructor(tx: number, ty: number, props: Record<string, unknown>) {
    this.tx = tx;
    this.ty = ty;
    this.x = tx + 0.5;
    this.y = ty + 0.5;
    this.stateFlag = (props.flag as string) ?? `f_door_${tx}_${ty}`;
    this.opensWith = (props.opensWith as string) ?? null;
    this.watchFlag = (props.openOnFlag as string) ?? null;
    this.view.addChild(this.g);
    const s = worldToScreen(this.x, this.y);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(this.x, this.y);
  }

  isOpen(env: AdventureEnv): boolean {
    return env.state.flags.get(this.stateFlag);
  }

  private draw(open: boolean): void {
    if (this.drawnOpen === open) return;
    this.drawnOpen = open;
    this.g.clear();
    if (open) {
      // Open: just the frame posts.
      this.g.rect(-30, -96, 10, 92).fill(0x5a5f78).stroke({ width: 2, color: 0x2c2f3c });
      this.g.rect(20, -96, 10, 92).fill(0x5a5f78).stroke({ width: 2, color: 0x2c2f3c });
    } else {
      this.g.ellipse(0, 0, 34, 17).fill({ color: 0x000000, alpha: 0.3 });
      this.g.rect(-30, -96, 60, 92).fill(0x6a6f88).stroke({ width: 2, color: 0x2c2f3c });
      if (this.opensWith === 'key') this.g.circle(0, -50, 7).fill(0xffd97a);
    }
  }

  canInteract(env: AdventureEnv): boolean {
    return !this.isOpen(env) && this.opensWith === 'key';
  }

  interact(env: AdventureEnv): void {
    if (this.isOpen(env) || this.opensWith !== 'key') return;
    if (env.state.removeItem('key')) {
      env.state.flags.set(this.stateFlag);
      env.toast('Used a key.');
    } else {
      env.toast("It's locked. Needs a key.");
    }
  }

  /** Keeps the collision grid and visuals in sync with the open flag. */
  update(env: AdventureEnv, grid: CollisionGrid): void {
    if (!this.isOpen(env) && this.watchFlag && env.state.flags.get(this.watchFlag)) {
      env.state.flags.set(this.stateFlag);
    }
    const open = this.isOpen(env);
    const row = grid.cells[this.ty];
    if (row) row[this.tx] = open ? CELL_WALK : CELL_SOLID;
    this.draw(open);
  }
}

const PUSH_DELAY = 0.15;
const SLIDE_SPEED = 2.5; // tiles/sec

/** Pushable block: slides one tile when pushed; depth-sorts while moving. */
export class PushBlock {
  readonly view = new Container();
  x: number;
  y: number;
  private tileX: number;
  private tileY: number;
  private sliding: { tx: number; ty: number } | null = null;
  private pushTimer = 0;
  private pushDir: Vec2 | null = null;

  constructor(tx: number, ty: number) {
    this.tileX = tx;
    this.tileY = ty;
    this.x = tx + 0.5;
    this.y = ty + 0.5;
    const g = new Graphics();
    g.ellipse(0, 0, 38, 19).fill({ color: 0x000000, alpha: 0.3 });
    g.poly([0, -76, 44, -54, 44, -10, 0, 12, -44, -10, -44, -54]).fill(0x7a8598);
    g.poly([0, -76, 44, -54, 0, -32, -44, -54])
      .fill(0x99a4b8)
      .stroke({ width: 2, color: 0x3c4152 });
    g.poly([0, -32, 44, -54, 44, -10, 0, 12]).fill(0x6a7588).stroke({ width: 2, color: 0x3c4152 });
    g.poly([0, -32, -44, -54, -44, -10, 0, 12])
      .fill(0x5a6578)
      .stroke({ width: 2, color: 0x3c4152 });
    this.view.addChild(g);
    this.syncView();
  }

  get occupiedTile(): { tx: number; ty: number } {
    return this.sliding ?? { tx: this.tileX, ty: this.tileY };
  }

  /** player pos + intended world dir come from the scene each tick. */
  update(
    dt: number,
    playerX: number,
    playerY: number,
    playerDir: Vec2,
    playerRadius: number,
    grid: CollisionGrid,
  ): void {
    if (this.sliding) {
      const target = this.sliding;
      const cx = target.tx + 0.5;
      const cy = target.ty + 0.5;
      const dx = cx - this.x;
      const dy = cy - this.y;
      const dist = Math.hypot(dx, dy);
      const step = SLIDE_SPEED * dt;
      if (dist <= step) {
        this.x = cx;
        this.y = cy;
        // Free the old tile now the slide is done.
        const oldRow = grid.cells[this.tileY];
        if (oldRow && oldRow[this.tileX] === CELL_SOLID) oldRow[this.tileX] = CELL_WALK;
        this.tileX = target.tx;
        this.tileY = target.ty;
        this.sliding = null;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
      this.syncView();
      return;
    }

    // Push detection: player pressed up against the block, moving into it.
    const dx = this.x - playerX;
    const dy = this.y - playerY;
    const touching = Math.hypot(dx, dy) < playerRadius + 0.75;
    let dir: Vec2 | null = null;
    if (touching && (playerDir.x !== 0 || playerDir.y !== 0)) {
      // Cardinal push direction: dominant axis of the player's intent,
      // and the intent must point toward the block.
      if (Math.abs(playerDir.x) >= Math.abs(playerDir.y)) {
        dir = { x: Math.sign(playerDir.x), y: 0 };
        if (Math.sign(dx) !== dir.x || Math.abs(dy) > 0.6) dir = null;
      } else {
        dir = { x: 0, y: Math.sign(playerDir.y) };
        if (Math.sign(dy) !== dir.y || Math.abs(dx) > 0.6) dir = null;
      }
    }

    if (dir && this.pushDir && dir.x === this.pushDir.x && dir.y === this.pushDir.y) {
      this.pushTimer += dt;
    } else {
      this.pushTimer = 0;
      this.pushDir = dir;
    }

    if (dir && this.pushTimer >= PUSH_DELAY) {
      const ntx = this.tileX + dir.x;
      const nty = this.tileY + dir.y;
      const row = grid.cells[nty];
      if (row && row[ntx] === CELL_WALK) {
        row[ntx] = CELL_SOLID; // claim the destination for the whole slide
        this.sliding = { tx: ntx, ty: nty };
        this.pushTimer = 0;
        this.pushDir = null;
      }
    }
  }

  /** Register the block's initial footprint in the grid. */
  claim(grid: CollisionGrid): void {
    const row = grid.cells[this.tileY];
    if (row) row[this.tileX] = CELL_SOLID;
  }

  private syncView(): void {
    const s = worldToScreen(this.x, this.y);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(this.x, this.y); // sorts correctly mid-push (PLAN §9 P4)
  }
}

/** Pressure plate: pressed by the player or a block standing on its tile. */
export class PressurePlate {
  readonly view = new Container();
  readonly tx: number;
  readonly ty: number;
  private readonly flag: string;
  private readonly latch: boolean;
  private readonly g = new Graphics();
  private drawnPressed: boolean | null = null;

  constructor(tx: number, ty: number, props: Record<string, unknown>) {
    this.tx = tx;
    this.ty = ty;
    this.flag = (props.flag as string) ?? `f_plate_${tx}_${ty}`;
    this.latch = props.latch === true;
    this.view.addChild(this.g);
    const s = worldToScreen(tx + 0.5, ty + 0.5);
    this.view.position.set(s.x, s.y);
    this.view.zIndex = depthOf(tx + 0.5, ty + 0.5) - 0.4; // hugs the ground
  }

  private draw(pressed: boolean): void {
    if (this.drawnPressed === pressed) return;
    this.drawnPressed = pressed;
    this.g.clear();
    const c = pressed ? 0x9b8a4a : 0xc8b86a;
    this.g.poly([0, -18, 36, 0, 0, 18, -36, 0]).fill(c).stroke({ width: 2, color: 0x5a5230 });
    if (!pressed) this.g.poly([0, -12, 26, 0, 0, 12, -26, 0]).stroke({ width: 1, color: 0x5a5230 });
  }

  update(env: AdventureEnv, playerX: number, playerY: number, blocks: PushBlock[]): void {
    const onTile = (x: number, y: number): boolean =>
      Math.floor(x) === this.tx && Math.floor(y) === this.ty;
    let pressed = onTile(playerX, playerY);
    if (!pressed) {
      for (const b of blocks) {
        const t = b.occupiedTile;
        if (t.tx === this.tx && t.ty === this.ty) {
          pressed = true;
          break;
        }
      }
    }
    if (pressed) env.state.flags.set(this.flag, true);
    else if (!this.latch && env.state.flags.get(this.flag)) env.state.flags.set(this.flag, false);
    this.draw(pressed || (this.latch && env.state.flags.get(this.flag)));
  }
}
