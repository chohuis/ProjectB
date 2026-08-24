import type { ProtagonistSave, ProContract } from "../types/save";
import type { TeamRef } from "../stores/master";
import { ALL_TEAMS_BY_LEAGUE } from "./leagueScheduler";

/**
 * 리그별 FA 자격 연수 **폴백** (프로 입단 후 연수).
 *
 * 정본은 `generation_rules.json`의 `faRules.eligibleYears`다.
 * 여기 값은 규칙 파일을 못 읽는 동기 호출 경로를 위한 것이고,
 * **규칙 파일과 달라지면 `npm run test:fa`가 깨진다.**
 */
export const FA_THRESHOLD: Record<string, number> = {
  LEAGUE_KBL: 5,
  LEAGUE_ABL: 6,
  LEAGUE_JBL: 4,
};
export function getFaThreshold(leagueId: string): number {
  return FA_THRESHOLD[leagueId] ?? 5;
}

/**
 * FA **재취득**까지의 연수. 짝은 Rust `npc_sim.rs`의 `FA_REACQUIRE_YEARS`다.
 *
 * 🔴 **연차를 0으로 되돌려선 안 된다.** `proServiceYears`는 통산 연차이고
 *   **연봉 산식의 입력**이다(`estimate_salary_and_contract`). 리셋하면 FA를
 *   신청한 순간 그 선수의 몸값이 신인 수준으로 떨어진다.
 *
 *   Rust는 이미 그렇게 고쳐져 있었다 — 그 주석이 증상까지 적어 뒀다:
 *   "리셋해서 1군 평균이 7년 → 1.8년으로 폭락하고 7년차 이상이 157명 → 0명".
 *   **TS 경로만 안 고쳐져 있었다.**
 *
 *   실측(씨앗 20260731 · 한 시즌): KBL 1군 7년차+ 45% → 5%. 리셋을 빼면 16%다.
 *
 * ⚠ 그래서 자격은 **누적 연차 + 마지막 취득으로부터의 경과**로 본다.
 *   리셋을 그냥 빼기만 하면 자격자가 매년 FA를 신청한다.
 */
export const FA_REACQUIRE_YEARS = 4;

/**
 * 지금 FA를 다시 신청할 수 있는가 — 마지막 `fa_signed` 이후 경과를 본다.
 * 기록이 없으면 첫 취득이라 언제나 참이다.
 */
export function canReacquireFa(
  careerEvents: ReadonlyArray<{ year: number; eventType: string }> | undefined,
  seasonYear: number,
): boolean {
  let last = -Infinity;
  for (const e of careerEvents ?? []) {
    if (e.eventType === "fa_signed" && e.year > last) last = e.year;
  }
  return !Number.isFinite(last) || seasonYear - last >= FA_REACQUIRE_YEARS;
}

export interface FaOffer {
  teamId: string;
  leagueId: string;
  salary: number;
  durationYears: number;
  signingBonus: number;
  teamOptionYears: number;
  playerOptionYears: number;
  noTrade: boolean;
}

export async function generateFaOffers(
  protagonist: ProtagonistSave,
  teams: TeamRef[],
): Promise<FaOffer[]> {
  // ⚠ 엔진은 `leagueId`가 같은 팀을 후보로 삼는데, refs에서 KBL은 1군(`_1`)과
  // 2군(`_2`)이 **같은 leagueId**를 쓴다. 그대로 넘기면 FA 제안에 2군이 섞이고
  // 실제로 그리로 이적한다 (실측: TEAM_KBL_CHANGWON_STARS_2와 3년 계약).
  // 1군/2군을 나눠 담는 정본은 `ALL_TEAMS_BY_LEAGUE`다.
  const firstTeams = ALL_TEAMS_BY_LEAGUE[protagonist.leagueId];
  const pool = firstTeams ? teams.filter((t) => firstTeams.includes(t.id)) : teams;

  const params = {
    pitchingOvr:     protagonist.pitching.ovr,
    fame:            protagonist.fame,
    leagueId:        protagonist.leagueId,
    teamId:          protagonist.teamId,
    faUnsignedWeeks: protagonist.faUnsignedWeeks ?? 0,
    teams:           pool.map((t) => ({ id: t.id, leagueId: t.leagueId })),
    // 리그 배수는 규칙 파일이 정본이다 — Rust에 표를 두 번 두지 않는다
    leagueMult:      await (async () => {
      try {
        const { loadRosterRules } = await import("../repo/newGameV3");
        const r = await loadRosterRules() as { salaryRules?: { leagueMult?: Record<string, number> } };
        return r.salaryRules?.leagueMult ?? {};
      } catch { return {}; }
    })(),
  };
  return JSON.parse(
    await window.projectB!.faGenerateOffers(JSON.stringify(params))
  ) as FaOffer[];
}

// ── TS 유지 ───────────────────────────────────────────────────

export function isFaEligible(protagonist: ProtagonistSave, _attendsUniversity: boolean): boolean {
  const requiredYears = getFaThreshold(protagonist.leagueId);
  return protagonist.proServiceYears >= requiredYears;
}

export function toContract(offer: FaOffer): ProContract {
  return {
    teamId:             offer.teamId,
    leagueId:           offer.leagueId,
    salary:             offer.salary,
    durationYears:      offer.durationYears,
    remainingYears:     offer.durationYears,
    signingBonus:       offer.signingBonus,
    teamOptionYears:    offer.teamOptionYears,
    playerOptionYears:  offer.playerOptionYears,
    noTrade:            offer.noTrade,
    status:             "active",
  };
}
