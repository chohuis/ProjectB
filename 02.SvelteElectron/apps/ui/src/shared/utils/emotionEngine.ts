import type {
  CareerStage,
  EmotionStatus,
  NpcEmotion,
  NpcMemory,
  NpcMemoryType,
  NpcSaveState,
} from "../types/save";
import type { MessageItem } from "../types/main";

// ── 주간 컨텍스트 ────────────────────────────────────────────
export interface WeeklyEmotionContext {
  weekInSeason:    number;
  careerStage:     CareerStage;
  protagonistOvr:  number;
  gameResult?:     { won: boolean; era: number; strikeouts: number };
  ovrDelta:        number;       // 이번 주 OVR 변화량
  trainingDone:    boolean;
  trainingSkipped: boolean;
  consecutiveTrainingSkips: number;
}

// ── Disposition — npcId 시드 기반 결정론적 생성 ──────────────
export interface NpcDisposition {
  competitive:  number;
  prideful:     number;
  nurturing:    number;
  territorial:  number;
  volatile:     number;
}

function seededRandom(seed: number, index: number): number {
  const x = Math.sin(seed * 9301 + index * 49297 + 233) * 10000;
  return Math.abs(x - Math.floor(x));
}

function hashNpcId(npcId: string): number {
  let h = 0;
  for (let i = 0; i < npcId.length; i++) {
    h = Math.imul(31, h) + npcId.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

export function getDisposition(npcId: string): NpcDisposition {
  const seed = hashNpcId(npcId);
  return {
    competitive:  Math.round(seededRandom(seed, 0) * 100),
    prideful:     Math.round(seededRandom(seed, 1) * 100),
    nurturing:    Math.round(seededRandom(seed, 2) * 100),
    territorial:  Math.round(seededRandom(seed, 3) * 100),
    volatile:     Math.round(seededRandom(seed, 4) * 100),
  };
}

// ── 기본 감정 초기값 ─────────────────────────────────────────
export function defaultEmotion(): NpcEmotion {
  return {
    recognition: 0,
    admiration:  0,
    jealousy:    0,
    contempt:    40,  // 신인에 대한 기본 경멸감
    trust:       20,
    dependence:  0,
    resentment:  0,
    pressure:    0,
    excitement:  0,
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ── 단기 축 감쇠 (매주) ───────────────────────────────────────
function decayShortTerm(e: NpcEmotion): NpcEmotion {
  return {
    ...e,
    pressure:   clamp(e.pressure   * 0.70),
    excitement: clamp(e.excitement * 0.75),
  };
}

// ── volatile 배율 ────────────────────────────────────────────
function vol(base: number, volatile: number): number {
  return base * (0.5 + (volatile / 100));
}

// ── NPC 유형별 업데이트 ────────────────────────────────────────

function updateManager(
  e: NpcEmotion,
  ctx: WeeklyEmotionContext,
  disp: NpcDisposition,
): NpcEmotion {
  let next = { ...e };

  if (ctx.gameResult) {
    if (ctx.gameResult.won) {
      next.trust      = clamp(next.trust      + 2);
      next.dependence = clamp(next.dependence + 1);
      next.contempt   = clamp(next.contempt   - 2);
    } else {
      next.pressure   = clamp(next.pressure + vol(5, disp.volatile));
      next.resentment = clamp(next.resentment + 1);
    }
  }

  if (ctx.ovrDelta > 2) {
    next.admiration = clamp(next.admiration + 2);
    next.dependence = clamp(next.dependence + 2);
    next.recognition = clamp(next.recognition + 3);
  } else if (ctx.ovrDelta < -2) {
    next.contempt = clamp(next.contempt + 2);
  }

  return next;
}

function updateCoach(
  e: NpcEmotion,
  ctx: WeeklyEmotionContext,
  disp: NpcDisposition,
): NpcEmotion {
  let next = { ...e };

  if (ctx.trainingDone) {
    next.trust      = clamp(next.trust      + 2);
    next.dependence = clamp(next.dependence + 1);
    next.resentment = clamp(next.resentment - 1);
  }

  if (ctx.trainingSkipped) {
    next.resentment = clamp(next.resentment + 3);
    next.pressure   = clamp(next.pressure   + vol(5, disp.volatile));
  }

  if (ctx.ovrDelta > 3) {
    next.admiration = clamp(next.admiration + 3);
    next.excitement = clamp(next.excitement + 5);
  } else if (ctx.ovrDelta === 0 && ctx.consecutiveTrainingSkips === 0) {
    // 스탯 정체
    next.pressure = clamp(next.pressure + 2);
  }

  return next;
}

function updateRival(
  e: NpcEmotion,
  ctx: WeeklyEmotionContext,
  rivalOvr: number,
  disp: NpcDisposition,
): NpcEmotion {
  let next = { ...e };

  if (ctx.protagonistOvr > rivalOvr) {
    const gap = ctx.protagonistOvr - rivalOvr;
    const boost = Math.ceil(gap / 10);
    next.recognition = clamp(next.recognition + boost * 3);
    next.jealousy    = clamp(next.jealousy    + boost * 2);
    next.contempt    = clamp(next.contempt    - boost);
  }

  if (ctx.ovrDelta > 3) {
    next.recognition = clamp(next.recognition + 5);
    next.jealousy    = clamp(next.jealousy    + vol(3, disp.competitive));
  }

  if (ctx.gameResult?.won) {
    next.pressure   = clamp(next.pressure   + vol(4, disp.competitive));
    next.excitement = clamp(next.excitement + 3);
  }

  return next;
}

function updateTeammate(
  e: NpcEmotion,
  ctx: WeeklyEmotionContext,
): NpcEmotion {
  let next = { ...e };

  if (ctx.gameResult?.won) {
    next.trust = clamp(next.trust + 1);
  }

  if (ctx.gameResult && !ctx.gameResult.won && ctx.gameResult.era < 3.0) {
    // 플레이어만 잘 던졌는데 팀이 졌을 때
    next.resentment = clamp(next.resentment + 2);
  }

  // 함께 있는 주마다 자연 증가
  next.trust = clamp(next.trust + 0.5);

  return next;
}

// ── 메모리 생성 헬퍼 ─────────────────────────────────────────
export function makeMemory(
  type: NpcMemoryType,
  week: number,
  intensity: 1 | 2 | 3,
  detail: string,
): NpcMemory {
  return { type, week, intensity, detail };
}

// ── 메모리 최대 보존 수 제한 ─────────────────────────────────
const MAX_MEMORIES = 10;

function trimMemories(memories: NpcMemory[]): NpcMemory[] {
  if (memories.length <= MAX_MEMORIES) return memories;
  // intensity 1짜리 중 오래된 것부터 제거
  const sorted = [...memories].sort((a, b) => {
    if (a.intensity !== b.intensity) return a.intensity - b.intensity;
    return a.week - b.week;
  });
  return sorted.slice(sorted.length - MAX_MEMORIES);
}

// ── 오프시즌 dormant 감쇠 ────────────────────────────────────
export function decayDormantEmotion(e: NpcEmotion): NpcEmotion {
  return {
    recognition:  clamp(e.recognition  - 5),
    admiration:   clamp(e.admiration   - 10),
    jealousy:     clamp(e.jealousy     - 10),
    contempt:     clamp(e.contempt     - 5),
    trust:        clamp(e.trust        - 5),
    dependence:   clamp(e.dependence   - 8),
    resentment:   clamp(e.resentment   - 3),
    pressure:     0,
    excitement:   0,
  };
}

// ── 메인 업데이트 함수 ───────────────────────────────────────
export interface EmotionUpdateResult {
  npc:          NpcSaveState;
  prevEmotion:  NpcEmotion;
  newMemories:  NpcMemory[];
}

export function updateNpcEmotion(
  npc: NpcSaveState,
  ctx: WeeklyEmotionContext,
  newMemoriesThisWeek: NpcMemory[] = [],
): EmotionUpdateResult {
  if (npc.emotionStatus === "archived") {
    return { npc, prevEmotion: npc.emotion ?? defaultEmotion(), newMemories: [] };
  }

  const disp     = getDisposition(npc.npcId);
  const prevRaw  = npc.emotion ?? defaultEmotion();
  const prev     = { ...prevRaw };

  let next: NpcEmotion;
  const rivalOvr = npc.pitching?.ovr ?? npc.batting?.ovr ?? 50;

  switch (npc.emotionRole) {
    case "manager":  next = updateManager(prevRaw, ctx, disp); break;
    case "coach":    next = updateCoach(prevRaw, ctx, disp);   break;
    case "rival":    next = updateRival(prevRaw, ctx, rivalOvr, disp); break;
    case "teammate": next = updateTeammate(prevRaw, ctx);      break;
    default:         next = prevRaw;
  }

  next = decayShortTerm(next);

  const updatedMemories = trimMemories([
    ...(npc.memories ?? []),
    ...newMemoriesThisWeek,
  ]);

  const updatedNpc: NpcSaveState = {
    ...npc,
    emotion:       next,
    memories:      updatedMemories,
    emotionStatus: npc.emotionStatus ?? "active",
  };

  return { npc: updatedNpc, prevEmotion: prev, newMemories: newMemoriesThisWeek };
}

// ── 라이프사이클: dormant → active (재회) ────────────────────
export function reactivateNpc(npc: NpcSaveState, currentStage: CareerStage): NpcSaveState {
  if (npc.emotionStatus !== "dormant") return npc;
  return {
    ...npc,
    emotionStatus:   "active" as EmotionStatus,
    lastActiveStage: currentStage,
  };
}

// ── 라이프사이클: active → dormant (이별) ────────────────────
export function deactivateNpc(npc: NpcSaveState): NpcSaveState {
  if (npc.emotionStatus === "archived") return npc;
  return { ...npc, emotionStatus: "dormant" as EmotionStatus };
}

// ── 라이프사이클: → archived (은퇴) ─────────────────────────
export function archiveNpc(npc: NpcSaveState): NpcSaveState {
  return {
    ...npc,
    emotion:       undefined,
    emotionStatus: "archived" as EmotionStatus,
  };
}

export function checkTeamMoodWarning(
  npcs: NpcSaveState[],
  week: number,
): MessageItem | null {
  const activeNamed = npcs.filter((npc) => npc.emotionStatus !== "archived");
  if (activeNamed.length === 0) return null;

  let lowTrustCount = 0;
  let highResentmentCount = 0;
  let highPressureCount = 0;

  for (const npc of activeNamed) {
    const emotion = npc.emotion ?? defaultEmotion();
    if (emotion.trust <= 20) lowTrustCount += 1;
    if (emotion.resentment >= 65) highResentmentCount += 1;
    if (emotion.pressure >= 70) highPressureCount += 1;
  }

  if (lowTrustCount === 0 && highResentmentCount === 0 && highPressureCount === 0) {
    return null;
  }

  const total = activeNamed.length;
  const warningLevel =
    highResentmentCount >= Math.ceil(total / 3) || highPressureCount >= Math.ceil(total / 2)
      ? "warning"
      : "notice";

  const summaryParts: string[] = [];
  if (lowTrustCount > 0) summaryParts.push(`신뢰 낮음 ${lowTrustCount}명`);
  if (highResentmentCount > 0) summaryParts.push(`불만 누적 ${highResentmentCount}명`);
  if (highPressureCount > 0) summaryParts.push(`압박 심화 ${highPressureCount}명`);

  return {
    id: `msg-team-mood-${week}-${warningLevel}`,
    category: "system",
    sender: "팀 케미 리포트",
    subject: warningLevel === "warning" ? `W${week} 팀 분위기 경고` : `W${week} 팀 분위기 점검`,
    preview: summaryParts.join(" / "),
    body: [
      `[주간 팀 분위기 리포트]`,
      "",
      ...summaryParts,
      "",
      "감정 변화가 누적된 선수들이 있습니다.",
      "휴식, 경기 결과, 이벤트 대응을 함께 점검해 주세요.",
    ].join("\n"),
    createdAt: `W${week}`,
    readAt: null,
  };
}
