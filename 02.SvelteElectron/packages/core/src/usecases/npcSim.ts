// ── 네이티브 엔진 주입 ────────────────────────────────────────────────────────

type NpcSimEngine = {
  simGameNative(paramsJson: string): string;
  runOffseasonNative(paramsJson: string): string;
  advanceGradesNative(paramsJson: string): string;
  generateFreshmenNative(paramsJson: string): string;
  runDraftNative(paramsJson: string): string;
  applyDraftNative(paramsJson: string): string;
  determineProtagonistDraftNative(paramsJson: string): string;
  advanceProtagonistGradeNative(paramsJson: string): string;
};

let _engine: NpcSimEngine | null = null;

export function setNpcSimEngine(engine: NpcSimEngine): void {
  _engine = engine;
}

function e(): NpcSimEngine {
  if (!_engine) throw new Error("[core/npcSim] 엔진 미초기화 — setNpcSimEngine() 먼저 호출");
  return _engine;
}

function parse<T>(json: string): T {
  const v = JSON.parse(json) as { error?: string } & T;
  if (v && typeof v === "object" && "error" in v) throw new Error(String(v.error));
  return v as T;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

export function simGame(paramsJson: string): string {
  return e().simGameNative(paramsJson);
}

export function runOffseason(paramsJson: string): string {
  return e().runOffseasonNative(paramsJson);
}

export function advanceGrades(paramsJson: string): string {
  return e().advanceGradesNative(paramsJson);
}

export function generateFreshmen(paramsJson: string): string {
  return e().generateFreshmenNative(paramsJson);
}

export function runDraft(paramsJson: string): string {
  return e().runDraftNative(paramsJson);
}

export function applyDraft(paramsJson: string): string {
  return e().applyDraftNative(paramsJson);
}

export function determineProtagonistDraft(paramsJson: string): string {
  return e().determineProtagonistDraftNative(paramsJson);
}

export function advanceProtagonistGrade(paramsJson: string): string {
  return e().advanceProtagonistGradeNative(paramsJson);
}

// parse 헬퍼 (main.cjs에서 직접 호출 시 사용 가능하도록 export)
export { parse };
