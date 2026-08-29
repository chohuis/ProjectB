// ── 구단 재정 (4-C · 2026-08-29) ──────────────────────────────
//
// 🔴 **구단 수입이 통째로 없었다.** 팀 예산은 `refs.json`의 정적값이고
//   관중·중계권·스폰서 개념이 없었다 — `attendance`는 **학업 출결**이고
//   스폰서는 **주인공 개인** 재정이다.
//
// ⚠ **갈래 B**(사용자 확정): 예산은 움직이되 **구단 성향 12개는 안 흔들린다.**
//   `deriveProfileFromBudgetIndex`가 `if (out[t.id]) continue;`로 막혀 있어
//   성향이 세이브에 있으면 안 돈다 — 구조상 이미 그렇다.
//
// ⚠ **시즌 종료에 한 번** 돈다. 경기마다 재면 주 진행이 그만큼 느려진다
//   (실측: 주당 약 20,000경기).
//
// ⚠ 산식은 Rust(`finance::calc_club_revenue`)에 있다. 여기는 재료를 모아
//   넘기고 결과를 저장하는 자리다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { loadRosterRules } from "../repo/newGameV3";
import { seedFrom } from "../utils/hash";

export interface ClubRevenue {
  attendanceRate: number;
  attendanceTotal: number;
  gate: number; parent: number; tv: number;
  sponsor: number; goods: number; postseason: number;
  total: number;
}

interface RevenueShare {
  gate: number; parent: number; tv: number; sponsor: number; goods: number;
}

export interface ClubFinanceRules {
  attendance: {
    base: number; winPctSpan: number; marketAppealSpan: number;
    prestigeSpan: number; min: number; max: number;
  };
  ticketPrice: Record<string, number>;
  types: Record<string, RevenueShare>;
  typeWeights: Record<string, number>;
  sponsor: { prestigeSpan: number };
  postseason: { qualified: number; runnerUp: number; champion: number };
}

/**
 * 그 팀의 **수입 구조 유형**. 리그마다 5:3:2다(사용자 확정).
 *
 * ⚠ **팀 id에서 뽑는다.** `Math.random()`이면 세이브마다 유형이 바뀌어
 *   같은 구단이 해마다 다른 체질을 갖는다.
 * ⚠ 가중치 합으로 나눈다 — 표를 고치면 비율이 따라간다.
 */
export function revenueTypeOf(teamId: string, rules: ClubFinanceRules): string {
  const entries = Object.entries(rules.typeWeights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return entries[0]?.[0] ?? "balanced";
  let n = seedFrom(teamId) % total;
  for (const [name, w] of entries) {
    if (n < w) return name;
    n -= w;
  }
  return entries[0][0];
}

/** 포스트시즌 결과 → 0 미진출 · 1 진출 · 2 준우승 · 3 우승 */
function psResultOf(teamId: string, leagueId: string): number {
  const s = get(seasonStore);
  const b = s.postseasonBrackets?.[leagueId] as
    | { championId?: string; runnerUpId?: string; playoffTeams?: string[] } | undefined;
  if (!b) return 0;
  if (b.championId === teamId) return 3;
  if (b.runnerUpId === teamId) return 2;
  return (b.playoffTeams ?? []).includes(teamId) ? 1 : 0;
}

/**
 * 한 리그의 구단 수입을 정산하고 **예산을 갱신한다.**
 *
 * 🔴 예산이 움직이면 셋이 따라 움직인다 — `buildSalaryIndex`(신인 계약금·
 *   외국인 상한) · `market budgetIndex`(FA 입찰) · `targetOf`(감독 기대치).
 *   **셋 다 `refs.json`을 직접 읽으므로** 갱신값을 세이브에 둬야 한다.
 */
export async function settleClubFinance(seasonYear: number): Promise<string[]> {
  const rules = (await loadRosterRules() as unknown as
    { clubFinanceRules?: ClubFinanceRules }).clubFinanceRules;
  if (!rules) return [];

  const api = window.projectB?.engine;
  if (!api) return [];

  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);
  const logs: string[] = [];

  for (const leagueId of Object.keys(rules.ticketPrice)) {
    const ls = s.leagueState?.[leagueId];
    if (!ls?.standings?.length) continue;

    const teams = m.teams.filter((t) => t.leagueId === leagueId && t.id.endsWith("_1"));
    if (teams.length === 0) continue;

    // 기준 규모 — 저장된 예산이 있으면 그게 우선이다(전년 정산 결과)
    const scaleOf = (teamId: string) => {
      const saved = g.clubBudgets?.[teamId];
      if (saved != null) return saved;
      const t = m.teams.find((x) => x.id === teamId);
      // 원 → 만원
      return (t?.history?.budget ?? 0) / 10000;
    };
    const scales = teams.map((t) => scaleOf(t.id)).filter((v) => v > 0);
    if (scales.length === 0) continue;
    const leagueAvg = scales.reduce((a, b) => a + b, 0) / scales.length;

    const capOf = new Map((m.stadiums ?? []).map((x) => [x.id, x.capacity ?? 0]));
    const next: Record<string, number> = {};

    for (const t of teams) {
      const st = ls.standings.find((x) => x.teamId === t.id);
      if (!st) continue;
      const games = st.wins + st.losses + st.draws;
      const prof = (g.proTeamProfiles?.[t.id] ?? {}) as
        { marketAppeal?: number; prestige?: number };
      const share = rules.types[revenueTypeOf(t.id, rules)] ?? rules.types.balanced;

      const raw = await api("calcClubRevenueNative", JSON.stringify({
        attendance: rules.attendance,
        share,
        postseason: rules.postseason,
        sponsorPrestigeSpan: rules.sponsor.prestigeSpan,
        baseScale: scaleOf(t.id),
        leagueAvgScale: leagueAvg,
        ticketPrice: rules.ticketPrice[leagueId] ?? 1,
        // ⚠ 팀 값이 있으면 그게 우선이다 — ABL·JBL은 팀에 들어 있다
        capacity: (t.capacity && t.capacity > 0 ? t.capacity : capOf.get(t.stadium ?? "")) ?? 0,
        // 홈경기는 절반이다
        homeGames: Math.max(0, Math.round(games / 2)),
        winPct: st.winPct,
        marketAppeal: prof.marketAppeal ?? 50,
        prestige: prof.prestige ?? 50,
        postseasonResult: psResultOf(t.id, leagueId),
      }));
      const r = JSON.parse(raw) as ClubRevenue & { error?: string };
      if (r.error) continue;

      // ⚠ **지출은 4-B에서 붙는다.** 지금은 수입만 쌓는다 — 그때까지
      //   예산이 한없이 늘지 않게 **전년 예산과 수입의 평균**으로 둔다.
      //   4-B가 오면 `전년 잔고 + 수입 − 지출`로 바꾼다.
      const prev = scaleOf(t.id);
      next[t.id] = Math.round((prev + r.total) / 2);
    }

    if (Object.keys(next).length > 0) {
      gameStore.patchClubBudgets(next);
      const sample = Object.entries(next)[0];
      logs.push(`[구단재정] ${leagueId} ${seasonYear} — ${Object.keys(next).length}팀 정산`
        + (sample ? ` (예: ${Math.round(sample[1] / 10000)}억)` : ""));
    }
  }
  return logs;
}
