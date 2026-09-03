import { get } from "svelte/store";
import type { ProtagonistSave, PitcherRole } from "../types/save";
import type { EntityRow } from "../stores/master";
import { npcLiveStatsStore } from "../stores/npcLiveStats";

/**
 * 팀 동료의 **지금** 투수 OVR — `details.player.pitching.ovr`은 생성값이다.
 *
 * ⚠ **성장 결과는 `npcLiveStatsStore`에만 쌓인다.** 생성값은 3년이 지나도
 * 9종 전부 +0이다(실측 2026-08-09). 그걸로 선발 경쟁을 붙이면 **동료는 안
 * 자라고 주인공만 자라서** 판정이 주인공에게 유리하게 기운다.
 *
 * 선발 배정은 절대 수치가 아니라 팀 내 경쟁이다 —
 * `player_engine.rs`가 `나보다 나은 팀 투수가 3명 이상이면 RP`로 가른다.
 * 비교 대상이 낡으면 그 문턱이 통째로 어긋난다.
 */
function livePitcherOvr(e: EntityRow, live: Record<string, { pitching?: { ovr?: number } }>): number {
  return live[e.id]?.pitching?.ovr
    ?? (e.details as any)?.player?.pitching?.ovr
    ?? 0;
}

// ── 고교 투수 포지션 배정 ─────────────────────────────────────

export async function assignHighschoolPosition(
  protagonist: Pick<ProtagonistSave, "teamId" | "pitching">,
  entities: EntityRow[],
): Promise<"SP" | "RP"> {
  const myOvr = protagonist.pitching.ovr;
  const live = get(npcLiveStatsStore);
  const teamPitcherOvrs = entities
    .filter(
      (e) =>
        e.teamId === protagonist.teamId &&
        e.role === "player" &&
        (e.details as any)?.player?.playerType === "pitcher",
    )
    .map((e) => livePitcherOvr(e, live));

  const result = JSON.parse(
    await window.projectB!.pitcherAssignHighschoolPosition(
      JSON.stringify({ myOvr, teamPitcherOvrs })
    )
  );
  return result.position as "SP" | "RP";
}

// ── 주인공 투수 역할 배정 ─────────────────────────────────────

export async function assignProtagonistRole(
  protagonist: ProtagonistSave,
  entities: EntityRow[],
  /**
   * 감독 관계 보정 (Phase 6C-5). 실력이 아니라 **감독이 나를 어떻게 보는가**다 —
   * 같은 OVR이라도 신뢰가 두터우면 선발 경쟁에서 앞선다. 0이면 구 동작과 동일.
   */
  roleOvrBias = 0,
): Promise<PitcherRole> {
  const myOvr = protagonist.pitching.ovr;
  const live = get(npcLiveStatsStore);
  const teamSpOvrs = entities
    .filter(
      (e) =>
        e.role === "player" &&
        e.teamId === protagonist.teamId &&
        e.status === "active" &&
        e.id !== protagonist.id &&
        (e.details as any)?.player?.playerType === "pitcher" &&
        (e.details as any)?.player?.position === "SP",
    )
    .map((e) => livePitcherOvr(e, live) || 50);

  const result = JSON.parse(
    await window.projectB!.pitcherAssignRole(
      JSON.stringify({ position: protagonist.position, ovr: myOvr, teamSpOvrs, roleOvrBias })
    )
  );
  return result.role as PitcherRole;
}

// ── 불펜 등판 판정 ────────────────────────────────────────────

/**
 * 불펜 등판 판정.
 *
 * `lastPitchedDate`·`gameDate`를 주면 **일 단위 의무 휴식표**로 판정한다 (Phase 5-8).
 * 안 주면 구 동작(같은 주 재등판 금지)으로 떨어진다 — 구 세이브 호환.
 */
export async function relieverWouldPitch(
  role: PitcherRole,
  pitchOutsLast = 0,
  lastPitchedWeek = 0,
  currentWeek = 0,
  rest?: { lastPitchedDate?: string; lastPitchCount?: number; gameDate?: string },
  /** 추천 밖 깊이 재료 — `utils/pitcherRoleRules.roleDepthOf()` 가 만든다 (§5-b · A④) */
  depth?: { roleDepth: number; offRecommendation?: { perSeatOver: number; floor: number } },
): Promise<boolean> {
  const result = JSON.parse(
    await window.projectB!.pitcherRelieverWouldPitch(
      JSON.stringify({
        role, pitchOutsLast, lastPitchedWeek, currentWeek,
        lastPitchedDate: rest?.lastPitchedDate ?? "",
        lastPitchCount:  rest?.lastPitchCount ?? 0,
        gameDate:        rest?.gameDate ?? "",
        ...(depth ?? {}),
      })
    )
  );
  return result.wouldPitch as boolean;
}

/**
 * 선발이 그 주에 실제로 등판하나 (§5-a · A④).
 *
 * 🔴 **계수는 Rust 가 만든다** — 여기서 확률을 다시 적지 않는다. 깊이가 0 이면 Rust 가 늘 true 다.
 * ⚠ 엔진을 못 부르는 환경(Vite 단독)에서는 **등판한다** — 못 부른다고 시즌 기록이 비면 안 된다.
 */
export async function starterWouldStart(
  depth: { roleDepth: number; offRecommendation?: { perSeatOver: number; floor: number } },
  seed = 0,
): Promise<boolean> {
  const api = window.projectB?.engine;
  if (!api) return true;
  try {
    const r = JSON.parse(await api("starterWouldStartNative",
      JSON.stringify({ seed, ...depth }))) as { wouldStart?: boolean; error?: string };
    return r.error ? true : (r.wouldStart ?? true);
  } catch {
    return true;
  }
}

/** 투구수별 의무 휴식을 채웠는가 (Phase 5-8) */
export async function checkPitcherRest(
  lastPitchedDate: string,
  lastPitchCount: number,
  gameDate: string,
): Promise<{ available: boolean; requiredRestDays: number; actualRestDays: number }> {
  const raw = await window.projectB!.engine("checkPitcherRestNative",
    JSON.stringify({ lastPitchedDate, lastPitchCount, gameDate }));
  const p = JSON.parse(raw);
  if (p && typeof p === "object" && "error" in p) {
    console.error("[pitcherRoleEngine] checkPitcherRest 오류:", p.error);
    return { available: true, requiredRestDays: 0, actualRestDays: -1 };
  }
  return p;
}

/** 리그별 투구수 상한 (고교 105 / 그 외 120) */
export async function leaguePitchLimit(leagueId: string): Promise<{ hard: number; soft: number }> {
  const raw = await window.projectB!.engine("leaguePitchLimitNative", JSON.stringify({ leagueId }));
  const p = JSON.parse(raw);
  if (p && typeof p === "object" && "error" in p) return { hard: 120, soft: 90 };
  return p;
}

// ── 순수 유틸 (TS 유지) ───────────────────────────────────────

export const ROLE_DESCRIPTION: Record<PitcherRole, string> = {
  "1선발":    "팀 에이스. 시리즈 1차전 선발 고정.",
  "2선발":    "로테이션 2번째 자리. 시리즈 2차전 선발.",
  "3선발":    "로테이션 3번째 자리.",
  "4선발":    "로테이션 4번째 자리.",
  "5선발":    "로테이션 마지막 자리.",
  "스윙맨":   "선발·불펜 겸용. 필요에 따라 기용.",
  "오프너":   "이닝 초반 짧게 등판 후 롱릴리프에 연결.",
  "롱릴리프": "선발 조기 강판 시 긴 이닝 소화.",
  "중간계투": "중반 이닝 담당 불펜.",
  "셋업맨":   "마무리 앞 1~2이닝 담당 핵심 불펜.",
  "마무리":   "팀 클로저. 승리 상황 마지막 이닝 전담.",
  "패전처리": "열세 상황 이닝 소화 담당.",
};

export function isStarterRole(role: PitcherRole): boolean {
  return ["1선발", "2선발", "3선발", "4선발", "5선발", "스윙맨", "오프너"].includes(role);
}

export function isReliefsRole(role: PitcherRole): boolean {
  return !isStarterRole(role);
}

export function starterSlot(role: PitcherRole): number | null {
  const match = role.match(/^(\d)선발$/);
  return match ? Number(match[1]) : null;
}
