/**
 * 주인공 경기 시작 옵션 중 **리그가 정하는 것** 한 벌 (1.1 A② · PLAN_ROLE_RECOMMEND §6-1).
 *
 * 세 호출부(MainPage · runAutoAdvance · MatchPage)가 같은 값을 넘겨야 한다 — 한 곳만 넘기면
 * 그 갈래만 다른 리그 규칙으로 던진다(leagueId 누락 결함과 같은 형태 · 09-03).
 *
 *   pitchLimitOverride   규칙 파일 `rosterOpsRules.starterPitchLimit` (고교 95 제안 · 소프트캡 ×0.75 는 Rust)
 *   starterOutsFactor    `rosterOpsRules.starterOutsFactor` (고교 0.80 제안)
 *   closerGate           `rosterOpsRules.closerGate` (고교 8회 고정 제안 · 없는 리그는 안 넘겨 감독 판정)
 *   restGuard            불펜 주인공의 의무 휴식 재료 — 직전 등판 날짜·투구수와 이 경기 날짜 (§6-1-4 결함)
 *
 * ⚠ 값은 전부 규칙 파일에서 온다. 여기 숫자를 적지 않는다.
 */
import { starterPitchLimitForLeague, starterOutsFactorForLeague, closerGateForLeague } from "./rosterEngine";
import { roleDepthOf } from "./pitcherRoleRules";

export interface LeagueMatchOptions {
  pitchLimitOverride: number;
  starterOutsFactor: number;
  closerGate?: { inningThreshold: number; maxLeadDiff: number; minLeadDiff: number };
  restGuard?: { lastPitchedDate: string; lastPitchCount: number; gameDate: string };
  /** 추천 밖 깊이 — 불펜·마무리 진입 문턱이 이만큼 늦는다 (§5-c · A④). 0 이면 안 싣는다 */
  roleDepth?: number;
}

export function leagueMatchOptions(
  leagueId: string,
  myCondition?: { lastPitchedDate?: string; lastPitchCount?: number } | null,
  gameDate?: string | null,
  roleFit?: { rank: number; seats: number } | null,
  /** 남은 선발 보장 경기 — 보장 중이면 깊이가 0 이다 (2026-09-08 · §5) */
  startGuaranteeGames?: number,
): LeagueMatchOptions {
  const out: LeagueMatchOptions = {
    pitchLimitOverride: starterPitchLimitForLeague(leagueId),
    starterOutsFactor: starterOutsFactorForLeague(leagueId),
  };
  const gate = closerGateForLeague(leagueId);
  if (gate) out.closerGate = gate;
  // 재료가 셋 다 있을 때만 — 하나라도 없으면 검사 자체를 안 건다(구 세이브 · 첫 등판)
  if (myCondition?.lastPitchedDate && gameDate && (myCondition.lastPitchCount ?? 0) > 0) {
    out.restGuard = {
      lastPitchedDate: myCondition.lastPitchedDate,
      lastPitchCount: myCondition.lastPitchCount ?? 0,
      gameDate,
    };
  }
  // 깊이 0 이면 안 싣는다 — 0 을 넘겨도 Rust 는 같게 돌지만, 안 넘겨야 "예전 그대로"가 눈에 보인다
  const depth = roleDepthOf(roleFit, startGuaranteeGames).roleDepth;
  if (depth > 0) out.roleDepth = depth;
  return out;
}
