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

// ── 파일 로그 공유 유틸 (자동진행 중에만 기록) ─────────────────────
let _autoLogFile: string | null = null;

export function setAutoLogFile(filename: string | null): void {
  _autoLogFile = filename;
}

export function autoLog(msg: string): void {
  if (!_autoLogFile) return;
  const api = (window as Window & { projectB?: { logWrite?: (p: string) => Promise<string> } }).projectB;
  if (!api?.logWrite) return;
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  api.logWrite(JSON.stringify({ filename: _autoLogFile, content: `[${ts}] ${msg}` })).catch(() => {});
}
