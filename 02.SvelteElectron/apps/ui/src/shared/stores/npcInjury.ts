import type { NpcInjuryEntry } from "../types/save";
import type { SeasonStoreState } from "./season";

export function setNpcInjury(s: SeasonStoreState, playerId: string, entry: NpcInjuryEntry): SeasonStoreState {
  return { ...s, npcInjuries: { ...s.npcInjuries, [playerId]: entry } };
}

export function clearNpcInjury(s: SeasonStoreState, playerId: string): SeasonStoreState {
  const next = { ...s.npcInjuries };
  delete next[playerId];
  return { ...s, npcInjuries: next };
}

export interface HealedNpc {
  playerId: string;
  entry: NpcInjuryEntry;
}

export function tickNpcInjuries(s: SeasonStoreState): {
  state: SeasonStoreState;
  healed: HealedNpc[];
} {
  const next: Record<string, NpcInjuryEntry> = {};
  const healed: HealedNpc[] = [];
  for (const [pid, entry] of Object.entries(s.npcInjuries)) {
    const weeksLeft = entry.weeksLeft - 1;
    if (weeksLeft <= 0) {
      healed.push({ playerId: pid, entry });
    } else {
      next[pid] = { ...entry, weeksLeft };
    }
  }
  return { state: { ...s, npcInjuries: next }, healed };
}

export function retireNpc(s: SeasonStoreState, playerId: string): SeasonStoreState {
  const next = { ...s.npcInjuries };
  delete next[playerId];
  return {
    ...s,
    npcInjuries: next,
    npcRetired: [...(s.npcRetired ?? []), playerId],
  };
}
