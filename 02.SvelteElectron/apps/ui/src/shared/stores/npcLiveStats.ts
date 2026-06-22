import { writable } from "svelte/store";
import type { NpcLiveStat } from "../types/season";

export const npcLiveStatsStore = writable<Record<string, NpcLiveStat>>({});
