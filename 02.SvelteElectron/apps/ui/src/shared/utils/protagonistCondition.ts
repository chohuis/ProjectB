/**
 * 주인공 자신의 등판 기록 한 장 (1.1 A② · §6-1-4 결함).
 *
 * 🔴 **주인공만 `playerConditions` 에 안 들어가고 있었다.** `applyGameOutcome` 은 상대 선발과
 *   상대 불펜만 썼다 — 그래서 `leagueState[lid].playerConditions[protagonist.id]` 가 늘 비었고,
 *   그 값을 재료로 쓰는 자리가 **둘 다 아무 일도 안 했다**:
 *     · `advanceWeek.ts` 의 `myCondR` → 불펜 주인공 의무 휴식(일 단위)이 항상 통과
 *     · `utils/matchLeagueOptions.ts` 의 `restGuard` → 재료 셋이 없어 옵션 자체가 안 붙음
 *   NPC 는 `gameSimulator.mergeConditions` 가 같은 일을 한다. 여기는 그 규칙을 주인공에 맞춘
 *   **한 벌**이고, 친선·정식 두 갈래가 이 함수 하나를 쓴다 — 갈래마다 적으면 한쪽만 고쳐진다.
 *
 * 연속 출전(`consecutiveAppearances`) 규칙은 `mergeConditions` 와 같다:
 *   선발은 0 · 불펜은 직전 출전이 바로 앞 경기(`teamGameCount - 1`)면 +1, 아니면 1.
 */
import type { PlayerCondition } from "../types/season";

export interface ProtagonistPitchInput {
  /** 직전 기록 — 없으면 첫 등판 */
  prev?: PlayerCondition | null;
  /** 선발 등판인가 (SP) */
  isStarter: boolean;
  /** 경기 주차 */
  week: number;
  /** 경기 날짜 "YYYY-MM-DD" — 의무 휴식이 일 단위라 이게 정본이다 */
  gameDate: string;
  /** 그날 던진 투구 수 */
  pitchCount: number;
  /** 그날 잡은 아웃 수 */
  outsRecorded: number;
  /** 우리 팀 `teamRotationIndex` — 연속 출전 판정의 기준 */
  teamGameCount: number;
  /** 경기 뒤 주인공 피로도 — 지어내지 않고 `gameStore` 값을 그대로 받는다 */
  fatigue: number;
}

/** 주인공이 던진 경기 한 장 */
export function protagonistPitchCondition(input: ProtagonistPitchInput): PlayerCondition {
  const prev = input.prev ?? undefined;
  const outs = Math.max(0, Math.round(input.outsRecorded));
  const base = {
    fatigue: Math.max(0, Math.min(100, Math.round(input.fatigue))),
    lastPitchedWeek: input.week,
    lastPitchedDate: input.gameDate,
    lastPitchCount: Math.max(0, Math.round(input.pitchCount)),
    pitchOutsLast: outs,
  };
  if (input.isStarter) {
    return {
      ...base,
      lastStartGameCount: input.teamGameCount,
      lastAppearanceGameCount: prev?.lastAppearanceGameCount,
      consecutiveAppearances: 0,
    };
  }
  const prevCount = prev?.lastAppearanceGameCount ?? -99;
  const wasConsecutive = prevCount === input.teamGameCount - 1;
  return {
    ...base,
    lastStartGameCount: prev?.lastStartGameCount,
    lastAppearanceGameCount: input.teamGameCount,
    consecutiveAppearances: wasConsecutive ? (prev?.consecutiveAppearances ?? 0) + 1 : 1,
  };
}

/**
 * 주인공이 안 던진 팀 경기 — 연속 출전만 끊는다.
 *
 * ⚠ 직전 기록이 없으면 아무것도 안 쓴다. 안 던진 경기가 등판 기록을 만들면 안 된다.
 */
export function protagonistRestCondition(prev?: PlayerCondition | null): PlayerCondition | null {
  if (!prev) return null;
  if ((prev.consecutiveAppearances ?? 0) === 0) return null;
  return { ...prev, consecutiveAppearances: 0 };
}
