import { GameState, type QuestProgress } from '../state';

/** Save slot shape — matches src/data/schemas/save.schema.json (PLAN §6.3). */
export interface SaveData {
  v: 1;
  map: string;
  pos: [number, number];
  hp: number;
  maxHp: number;
  inventory: string[];
  charges: number;
  shards: number;
  flags: Record<string, boolean>;
  quests: Record<string, QuestProgress>;
}

export const SAVE_SLOTS = 3;
const KEY = (slot: number): string => `keystone_save_${slot}`;

export function serialize(state: GameState): SaveData {
  return {
    v: 1,
    map: state.map,
    pos: [state.pos[0], state.pos[1]],
    hp: state.hp,
    maxHp: state.maxHp,
    inventory: [...state.inventory],
    charges: state.charges,
    shards: state.shards,
    flags: state.flags.toJSON(),
    quests: JSON.parse(JSON.stringify(state.quests)) as Record<string, QuestProgress>,
  };
}

export function deserialize(data: SaveData): GameState {
  const state = new GameState();
  state.map = data.map;
  state.pos = [data.pos[0], data.pos[1]];
  state.hp = data.hp;
  state.maxHp = data.maxHp;
  state.inventory = [...data.inventory];
  state.charges = data.charges;
  state.shards = data.shards ?? 0;
  state.flags.loadJSON(data.flags);
  state.quests = JSON.parse(JSON.stringify(data.quests)) as Record<string, QuestProgress>;
  return state;
}

export class SaveManager {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}

  save(slot: number, state: GameState): void {
    this.storage.setItem(KEY(slot), JSON.stringify(serialize(state)));
  }

  load(slot: number): GameState | null {
    const raw = this.storage.getItem(KEY(slot));
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as SaveData;
      if (data.v !== 1) return null;
      return deserialize(data);
    } catch {
      return null;
    }
  }

  /** Slot summaries for the title screen. */
  list(): ({ map: string; hp: number; maxHp: number } | null)[] {
    const out: ({ map: string; hp: number; maxHp: number } | null)[] = [];
    for (let s = 0; s < SAVE_SLOTS; s++) {
      const raw = this.storage.getItem(KEY(s));
      if (!raw) {
        out.push(null);
        continue;
      }
      try {
        const d = JSON.parse(raw) as SaveData;
        out.push({ map: d.map, hp: d.hp, maxHp: d.maxHp });
      } catch {
        out.push(null);
      }
    }
    return out;
  }
}
