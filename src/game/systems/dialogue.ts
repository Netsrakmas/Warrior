import type { GameState } from '../state';
import type { QuestLog } from './quests';

/** Dialogue definitions — matches src/data/schemas/dialogue.schema.json. */
export interface DialogueLine {
  who: string;
  text: string;
  portrait?: string;
}

export interface DialogueDef {
  lines: DialogueLine[];
  requires?: {
    flag?: string;
    notFlag?: string;
    item?: string;
    questAt?: { id: string; step: string };
    questDone?: string;
  };
  setFlag?: string;
  startQuest?: string;
  giveItem?: string;
  takeItem?: string;
  completeStep?: { id: string; step: string };
}

export type DialogueDefs = Record<string, DialogueDef>;

export function requirementsMet(def: DialogueDef, state: GameState, quests: QuestLog): boolean {
  const r = def.requires;
  if (!r) return true;
  if (r.flag && !state.flags.get(r.flag)) return false;
  if (r.notFlag && state.flags.get(r.notFlag)) return false;
  if (r.item && !state.hasItem(r.item)) return false;
  if (r.questAt && quests.currentStep(r.questAt.id)?.id !== r.questAt.step) return false;
  if (r.questDone && !quests.isDone(r.questDone)) return false;
  return true;
}

/** Pick the first dialogue in the list whose requirements pass (NPC branching). */
export function pickDialogue(
  ids: string[],
  defs: DialogueDefs,
  state: GameState,
  quests: QuestLog,
): { id: string; def: DialogueDef } | null {
  for (const id of ids) {
    const def = defs[id];
    if (def && requirementsMet(def, state, quests)) return { id, def };
  }
  return null;
}

/** Run a dialogue's effects (called when its last line closes). */
export function applyEffects(def: DialogueDef, state: GameState, quests: QuestLog): void {
  if (def.setFlag) state.flags.set(def.setFlag);
  if (def.giveItem) state.addItem(def.giveItem);
  if (def.takeItem) state.removeItem(def.takeItem);
  if (def.startQuest) quests.start(def.startQuest);
  if (def.completeStep) quests.completeStep(def.completeStep.id, def.completeStep.step);
}
