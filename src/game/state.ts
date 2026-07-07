/**
 * Persistent world/adventure state — everything that survives map changes
 * and gets serialized into save slots (PLAN §6.3).
 */

export type FlagListener = (flag: string, value: boolean) => void;

export class FlagStore {
  private flags = new Map<string, boolean>();
  private listeners: FlagListener[] = [];

  get(flag: string): boolean {
    return this.flags.get(flag) === true;
  }

  set(flag: string, value = true): void {
    if (this.flags.get(flag) === value) return;
    this.flags.set(flag, value);
    for (const l of this.listeners) l(flag, value);
  }

  onChange(listener: FlagListener): void {
    this.listeners.push(listener);
  }

  toJSON(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const [k, v] of this.flags) if (v) out[k] = true;
    return out;
  }

  loadJSON(data: Record<string, boolean>): void {
    this.flags.clear();
    for (const [k, v] of Object.entries(data)) this.flags.set(k, v);
  }
}

export interface QuestProgress {
  state: 'active' | 'done';
  step: number;
  counts: Record<string, number>;
}

export class GameState {
  readonly flags = new FlagStore();
  quests: Record<string, QuestProgress> = {};
  inventory: string[] = ['sword'];
  hp = 6;
  maxHp = 6;
  shards = 0;
  charges = 0;
  map = 'greybox_01';
  pos: [number, number] = [16.5, 16.5];

  hasItem(item: string): boolean {
    return this.inventory.includes(item);
  }

  countItem(item: string): number {
    return this.inventory.filter((i) => i === item).length;
  }

  addItem(item: string): void {
    this.inventory.push(item);
  }

  /** Removes one instance; returns false if absent. */
  removeItem(item: string): boolean {
    const i = this.inventory.indexOf(item);
    if (i < 0) return false;
    this.inventory.splice(i, 1);
    return true;
  }
}
