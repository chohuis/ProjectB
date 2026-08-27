import type { ProtagonistSave, ProContract } from "../types/save";
import type { TeamRef } from "../stores/master";
import { ALL_TEAMS_BY_LEAGUE } from "./leagueScheduler";
import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { npcLiveStatsStore, livePitchingOvrOf } from "../stores/npcLiveStats";
import { postingInterest, POSTING_INTEREST_MIN } from "./postingInterest";

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

/**
 * FA로 갈 수 있는 리그 — **어디서 어디로 갈 수 있는가.**
 *
 * ⚠ **1군만 담는다.** 2군 계약은 FA가 아니라 육성 계약이다.
 *   3단계(아마추어 직행)가 2군을 따로 연다.
 * ⚠ 아마추어(고교·대학·독립)는 FA가 없다 — 진로 선택으로 간다.
 */
const PRO_LEAGUES = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"] as const;

export function faDestinationLeagues(fromLeagueId: string): string[] {
  // 프로끼리는 서로 오간다 — 나가는 길과 돌아오는 길이 같은 규칙이다
  if ((PRO_LEAGUES as readonly string[]).includes(fromLeagueId)) return [...PRO_LEAGUES];
  // 그 밖(아마추어·2군·FA 상태)은 원래 리그만
  return [fromLeagueId];
}

/**
 * 그 팀 투수들의 OVR — 관심도의 **팀 상대 축**이다.
 *
 * ⚠ 살아 있는 능력치를 본다(`livePitchingOvrOf`) — 생성 시점 값을 쓰면
 *   시즌이 갈수록 실제와 벌어진다.
 */
function teamPitcherOvrsOf(teamId: string): number[] {
  const live = get(npcLiveStatsStore);
  return get(gameStore).npcs
    .filter((n) => n.currentTeam === teamId && n.careerStatus === "active"
      && n.playerType === "pitcher")
    .map((n) => livePitchingOvrOf(n, live));
}

/** 통산 수상 횟수 — **시즌 기록마다 흩어져 있다**(`careerRecords[].awards`) */
function awardCountOf(p: ProtagonistSave): number {
  return (p.careerRecords ?? []).reduce((n, r) => n + (r.awards ?? []).length, 0);
}

/** 최근 한 시즌 평균자책점. 없으면 `undefined` — **0이 아니다** */
function recentEraOf(p: ProtagonistSave): number | undefined {
  const recs = p.careerRecords ?? [];
  for (let i = recs.length - 1; i >= 0; i--) {
    const st = recs[i].stats;
    if (st?.type === "pitcher" && st.ip > 0) return st.era;
  }
  return undefined;
}

export async function generateFaOffers(
  protagonist: ProtagonistSave,
  teams: TeamRef[],
): Promise<FaOffer[]> {
  // ⚠ 엔진은 `leagueId`가 같은 팀을 후보로 삼는데, refs에서 KBL은 1군(`_1`)과
  // 2군(`_2`)이 **같은 leagueId**를 쓴다. 그대로 넘기면 FA 제안에 2군이 섞이고
  // 실제로 그리로 이적한다 (실측: TEAM_KBL_CHANGWON_STARS_2와 3년 계약).
  // 1군/2군을 나눠 담는 정본은 `ALL_TEAMS_BY_LEAGUE`다.
  // 🔴 **해외를 후보에 넣는다** (2026-08-27). 예전엔 자기 리그만 봤다 —
  //   그 한 줄이 **나가는 길(KBL→해외)과 돌아오는 길(해외→KBL)을 동시에**
  //   막고 있었다. NPC는 이미 오간다(`market.ts`).
  //
  // ⚠ **2군은 여전히 안 섞는다.** `ALL_TEAMS_BY_LEAGUE`가 1군·2군을 따로
  //   담는 게 그 근거다 — refs에서 KBL 1군(`_1`)과 2군(`_2`)이 **같은
  //   `leagueId`**를 쓰므로, 리그로만 거르면 2군이 들어온다
  //   (실측: `TEAM_KBL_CHANGWON_STARS_2`와 3년 계약).
  //   여기서도 그 표를 통해서만 담는다.
  const destLeagues = faDestinationLeagues(protagonist.leagueId);
  const allowed = new Set(destLeagues.flatMap((lid) => ALL_TEAMS_BY_LEAGUE[lid] ?? []));
  const poolAll = allowed.size > 0 ? teams.filter((t) => allowed.has(t.id)) : teams;

  // 🔴 **해외는 관심을 받아야 후보가 된다** (2026-08-27).
  //   1단계에서 풀만 열었더니 OVR 75~77에게 해외 제안이 **84%**였다 —
  //   조건이 없으면 KBL에 남을 이유가 사라진다.
  //
  // ⚠ **국내는 아직 안 거른다.** 5단계에서 모든 리그를 같이 고친다 —
  //   지금 국내까지 건드리면 기존 밸런스가 흔들려 해외 쪽 실측이 오염된다.
  const pool = poolAll.filter((t) => {
    if (t.leagueId === protagonist.leagueId) return true;   // 국내(=자기 리그)
    const interest = postingInterest({
      teamPitcherOvrs: teamPitcherOvrsOf(t.id),
      pitchingOvr:     protagonist.pitching.ovr,
      scoutScore:      protagonist.scoutScore ?? 0,
      fame:            protagonist.fame ?? 0,
      proServiceYears: protagonist.proServiceYears ?? 0,
      awardCount:      awardCountOf(protagonist),
      recentEra:       recentEraOf(protagonist),
    });
    return interest >= POSTING_INTEREST_MIN;
  });

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
