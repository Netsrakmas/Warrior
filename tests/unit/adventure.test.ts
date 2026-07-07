import { describe, it, expect } from 'vitest';
import { GameState, FlagStore } from '../../src/game/state';
import { QuestLog, type QuestDefs } from '../../src/game/systems/quests';
import {
  pickDialogue,
  requirementsMet,
  applyEffects,
  type DialogueDefs,
} from '../../src/game/systems/dialogue';
import { SaveManager, serialize, deserialize } from '../../src/game/systems/save';

const QUESTS: QuestDefs = {
  q1_test: {
    title: 'Test Quest',
    steps: [
      { id: 'talk', desc: 'Talk.' },
      { id: 'kill', desc: 'Kill 3.', count: 3, on: { event: 'kill', type: 'enemy_husk' } },
      { id: 'return', desc: 'Return.' },
    ],
    reward: { flag: 'q1_test_done' },
  },
};

describe('flag store', () => {
  it('gets, sets, and notifies listeners once per change', () => {
    const flags = new FlagStore();
    const seen: [string, boolean][] = [];
    flags.onChange((f, v) => seen.push([f, v]));
    expect(flags.get('f_x')).toBe(false);
    flags.set('f_x');
    flags.set('f_x'); // no-op, same value
    flags.set('f_x', false);
    expect(seen).toEqual([
      ['f_x', true],
      ['f_x', false],
    ]);
  });

  it('serializes only true flags and round-trips', () => {
    const flags = new FlagStore();
    flags.set('f_a');
    flags.set('f_b');
    flags.set('f_b', false);
    const json = flags.toJSON();
    expect(json).toEqual({ f_a: true });
    const other = new FlagStore();
    other.loadJSON(json);
    expect(other.get('f_a')).toBe(true);
  });
});

describe('quest engine', () => {
  it('starts once, walks steps in order, rewards a flag', () => {
    const state = new GameState();
    const log = new QuestLog(QUESTS, state);
    expect(log.start('q1_test')).toBe(true);
    expect(log.start('q1_test')).toBe(false); // already started
    expect(log.currentStep('q1_test')?.id).toBe('talk');

    expect(log.completeStep('q1_test', 'return')).toBe(false); // out of order
    expect(log.completeStep('q1_test', 'talk')).toBe(true);
    expect(log.currentStep('q1_test')?.id).toBe('kill');

    log.notify('kill', 'enemy_husk');
    log.notify('kill', 'enemy_spitter'); // wrong type, ignored
    log.notify('kill', 'enemy_husk');
    expect(log.isDone('q1_test')).toBe(false);
    log.notify('kill', 'enemy_husk');
    expect(log.currentStep('q1_test')?.id).toBe('return');

    log.completeStep('q1_test', 'return');
    expect(log.isDone('q1_test')).toBe(true);
    expect(state.flags.get('q1_test_done')).toBe(true);
  });

  it('journal reports progress on counted steps', () => {
    const state = new GameState();
    const log = new QuestLog(QUESTS, state);
    log.start('q1_test');
    log.completeStep('q1_test', 'talk');
    log.notify('kill', 'enemy_husk');
    const rows = log.journal();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.progress).toBe('1/3');
    expect(rows[0]!.done).toBe(false);
  });
});

describe('dialogue selection & effects', () => {
  const DEFS: DialogueDefs = {
    done: { requires: { questDone: 'q1_test' }, lines: [{ who: 'A', text: 'done' }] },
    busy: {
      requires: { questAt: { id: 'q1_test', step: 'kill' } },
      lines: [{ who: 'A', text: 'busy' }],
    },
    intro: {
      lines: [{ who: 'A', text: 'hi' }],
      setFlag: 'f_met',
      startQuest: 'q1_test',
      completeStep: { id: 'q1_test', step: 'talk' },
    },
  };

  it('picks the first dialogue whose requirements pass', () => {
    const state = new GameState();
    const log = new QuestLog(QUESTS, state);
    const order = ['done', 'busy', 'intro'];
    expect(pickDialogue(order, DEFS, state, log)?.id).toBe('intro');
    applyEffects(DEFS.intro!, state, log);
    expect(state.flags.get('f_met')).toBe(true);
    expect(log.currentStep('q1_test')?.id).toBe('kill');
    expect(pickDialogue(order, DEFS, state, log)?.id).toBe('busy');
    log.notify('kill', 'enemy_husk');
    log.notify('kill', 'enemy_husk');
    log.notify('kill', 'enemy_husk');
    log.completeStep('q1_test', 'return');
    expect(pickDialogue(order, DEFS, state, log)?.id).toBe('done');
  });

  it('checks item and flag requirements', () => {
    const state = new GameState();
    const log = new QuestLog(QUESTS, state);
    const needsItem = { requires: { item: 'kite' }, lines: [{ who: 'A', text: 'x' }] };
    const notFlag = { requires: { notFlag: 'f_gone' }, lines: [{ who: 'A', text: 'x' }] };
    expect(requirementsMet(needsItem, state, log)).toBe(false);
    state.addItem('kite');
    expect(requirementsMet(needsItem, state, log)).toBe(true);
    expect(requirementsMet(notFlag, state, log)).toBe(true);
    state.flags.set('f_gone');
    expect(requirementsMet(notFlag, state, log)).toBe(false);
  });

  it('takeItem removes exactly one instance', () => {
    const state = new GameState();
    const log = new QuestLog(QUESTS, state);
    state.addItem('key');
    state.addItem('key');
    applyEffects({ lines: [], takeItem: 'key' }, state, log);
    expect(state.countItem('key')).toBe(1);
  });
});

describe('save system (PLAN §6.3)', () => {
  function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
      clear: () => data.clear(),
      key: () => null,
      get length() {
        return data.size;
      },
    };
  }

  it('serialize → deserialize round-trips the full state', () => {
    const state = new GameState();
    state.map = 'greybox_02';
    state.pos = [3.5, 9.25];
    state.hp = 4;
    state.maxHp = 8;
    state.shards = 12;
    state.addItem('key');
    state.addItem('kite');
    state.flags.set('f_met_elder');
    state.quests['q1_test'] = { state: 'active', step: 1, counts: { kill: 2 } };

    const restored = deserialize(JSON.parse(JSON.stringify(serialize(state))));
    expect(restored.map).toBe('greybox_02');
    expect(restored.pos).toEqual([3.5, 9.25]);
    expect(restored.hp).toBe(4);
    expect(restored.maxHp).toBe(8);
    expect(restored.shards).toBe(12);
    expect(restored.countItem('key')).toBe(1);
    expect(restored.hasItem('kite')).toBe(true);
    expect(restored.flags.get('f_met_elder')).toBe(true);
    expect(restored.quests['q1_test']).toEqual({ state: 'active', step: 1, counts: { kill: 2 } });
  });

  it('SaveManager stores 3 slots and lists summaries', () => {
    const mgr = new SaveManager(memoryStorage());
    const state = new GameState();
    state.hp = 2;
    mgr.save(1, state);
    const list = mgr.list();
    expect(list[0]).toBeNull();
    expect(list[1]).toEqual({ map: 'greybox_01', hp: 2, maxHp: 6 });
    expect(list[2]).toBeNull();
    expect(mgr.load(0)).toBeNull();
    expect(mgr.load(1)?.hp).toBe(2);
  });

  it('rejects corrupt or wrong-version saves', () => {
    const storage = memoryStorage();
    storage.setItem('keystone_save_0', 'not json {');
    storage.setItem('keystone_save_1', JSON.stringify({ v: 99 }));
    const mgr = new SaveManager(storage);
    expect(mgr.load(0)).toBeNull();
    expect(mgr.load(1)).toBeNull();
  });
});
