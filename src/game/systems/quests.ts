import type { GameState } from '../state';

/** Quest definitions — matches src/data/schemas/quest.schema.json (PLAN §6.3). */
export interface QuestStepDef {
  id: string;
  desc: string;
  count?: number;
  /** auto-progress trigger, e.g. { event: "kill", type: "enemy_husk" } */
  on?: { event: string; type: string };
}

export interface QuestDef {
  title: string;
  steps: QuestStepDef[];
  reward?: { item?: string; flag?: string };
}

export type QuestDefs = Record<string, QuestDef>;

/** Quest engine over GameState.quests. Steps complete strictly in order. */
export class QuestLog {
  constructor(
    private readonly defs: QuestDefs,
    private readonly state: GameState,
  ) {}

  start(id: string): boolean {
    if (!this.defs[id] || this.state.quests[id]) return false;
    this.state.quests[id] = { state: 'active', step: 0, counts: {} };
    return true;
  }

  isActive(id: string): boolean {
    return this.state.quests[id]?.state === 'active';
  }

  isDone(id: string): boolean {
    return this.state.quests[id]?.state === 'done';
  }

  currentStep(id: string): QuestStepDef | null {
    const p = this.state.quests[id];
    if (!p || p.state !== 'active') return null;
    return this.defs[id]?.steps[p.step] ?? null;
  }

  /** Complete the quest's CURRENT step if it matches stepId. */
  completeStep(id: string, stepId: string): boolean {
    const step = this.currentStep(id);
    if (!step || step.id !== stepId) return false;
    this.advance(id);
    return true;
  }

  /** Increment a counted step; completes it when the count is reached. */
  increment(id: string, stepId: string, n = 1): void {
    const p = this.state.quests[id];
    const step = this.currentStep(id);
    if (!p || !step || step.id !== stepId || !step.count) return;
    const cur = (p.counts[stepId] ?? 0) + n;
    p.counts[stepId] = cur;
    if (cur >= step.count) this.advance(id);
  }

  /** Broadcast a game event (e.g. kill) to all active quests' current steps. */
  notify(event: string, type: string): void {
    for (const id of Object.keys(this.state.quests)) {
      const step = this.currentStep(id);
      if (!step?.on || step.on.event !== event || step.on.type !== type) continue;
      if (step.count) this.increment(id, step.id);
      else this.advance(id);
    }
  }

  private advance(id: string): void {
    const p = this.state.quests[id];
    const def = this.defs[id];
    if (!p || !def) return;
    p.step++;
    if (p.step >= def.steps.length) {
      p.state = 'done';
      if (def.reward?.flag) this.state.flags.set(def.reward.flag);
      if (def.reward?.item && def.reward.item !== 'none') this.state.addItem(def.reward.item);
    }
  }

  /** Journal view model: active first, then done. */
  journal(): {
    id: string;
    title: string;
    done: boolean;
    stepDesc: string;
    progress: string;
  }[] {
    const rows = [];
    for (const [id, p] of Object.entries(this.state.quests)) {
      const def = this.defs[id];
      if (!def) continue;
      const step = def.steps[Math.min(p.step, def.steps.length - 1)]!;
      const count = step.count ? `${p.counts[step.id] ?? 0}/${step.count}` : '';
      rows.push({
        id,
        title: def.title,
        done: p.state === 'done',
        stepDesc: p.state === 'done' ? 'Complete' : step.desc,
        progress: p.state === 'done' ? '' : count,
      });
    }
    rows.sort((a, b) => Number(a.done) - Number(b.done));
    return rows;
  }
}
