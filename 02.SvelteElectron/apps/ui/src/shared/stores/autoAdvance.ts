import { writable } from "svelte/store";

interface AutoAdvanceState {
  running: boolean;
  log: string[];
  stopReason: string | null;
}

function createAutoAdvanceStore() {
  const { subscribe, update, set } = writable<AutoAdvanceState>({
    running: false,
    log: [],
    stopReason: null,
  });

  return {
    subscribe,
    start() {
      update(() => ({ running: true, stopReason: null, log: [] }));
    },
    stop(reason: string) {
      update((s) => ({ ...s, running: false, stopReason: reason }));
    },
    addLog(msg: string) {
      update((s) => ({ ...s, log: [...s.log.slice(-99), msg] }));
    },
    reset() {
      set({ running: false, log: [], stopReason: null });
    },
  };
}

export const autoAdvanceStore = createAutoAdvanceStore();
