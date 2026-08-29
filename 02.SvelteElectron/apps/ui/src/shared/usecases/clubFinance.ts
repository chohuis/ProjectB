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
  expense: {
    staff: { managerBase: number; coachBase: number; abilityExp: number };
    operations: { stadium: number; farm: number; camp: number };
    minBudgetRatio: number;
    maxBudgetRatio: number;
    budgetAdjustRate: number;
  };
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
    // 🔴 **정적 기준**을 따로 쓴다. 수입·지출이 누적 예산에 비례하면
    //   되먹임이 생겨 매년 33%씩 발산한다(실측으로 잡았다).
    const staticOf = (teamId: string) =>
      ((m.teams.find((x) => x.id === teamId)?.history?.budget) ?? 0) / 10000;
    const scales = teams.map((t) => staticOf(t.id)).filter((v) => v > 0);
    if (scales.length === 0) continue;
    const leagueAvg = scales.reduce((a, b) => a + b, 0) / scales.length;

    const capOf = new Map((m.stadiums ?? []).map((x) => [x.id, x.capacity ?? 0]));
    const capacityOf = (t: { id: string; capacity?: number; stadium?: string }) =>
      (t.capacity && t.capacity > 0 ? t.capacity : capOf.get(t.stadium ?? "")) ?? 0;
    const caps = teams.map(capacityOf).filter((v) => v > 0);
    const avgCap = caps.length ? caps.reduce((a, b) => a + b, 0) / caps.length : 1;

    // 선수 총연봉 · 스태프 능력 — **한 번만 훑는다**
    // ⚠ 팀마다 다시 훑으면 NPC 전체를 팀 수만큼 본다
    const payrollOf = new Map<string, number>();
    for (const n of g.npcs ?? []) {
      if (n.careerStatus !== "active") continue;
      const tid = n.currentTeam ?? "";
      if (!tid) continue;
      payrollOf.set(tid, (payrollOf.get(tid) ?? 0) + (n.currentSalary ?? 0));
    }
    // 스태프 — 감독 능력 평균과 코치 능력 목록
    const staffOf = new Map<string, { mgr: number; coaches: number[] }>();
    for (const e of m.entities) {
      const tid = e.teamId ?? "";
      if (!tid) continue;
      // ⚠ 능력치 이름이 감독·코치가 다르다 — **값만 평균낸다**
      const d = e.details as unknown as { manager?: { stats?: Record<string, number> };
                              coach?: { stats?: Record<string, number> } } | undefined;
      const avg = (o?: Record<string, number>) => {
        const v = Object.values(o ?? {});
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
      };
      if (!staffOf.has(tid)) staffOf.set(tid, { mgr: 0, coaches: [] });
      const slot = staffOf.get(tid)!;
      if (d?.manager) slot.mgr = avg(d.manager.stats);
      else if (d?.coach) slot.coaches.push(avg(d.coach.stats));
    }
    const leagueMult = (await loadRosterRules() as unknown as
      { salaryRules?: { leagueMult?: Record<string, number> } })
      .salaryRules?.leagueMult?.[leagueId] ?? 1;
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
        baseScale: staticOf(t.id),
        leagueAvgScale: leagueAvg,
        // 🔴 **티켓값을 유형에 맞춘다.** 값을 `balanced`(관중 몫 0.45)
        //   기준으로 역산했는데, 모기업형은 몫이 0.25라 관중 수입이
        //   몫보다 2배 커져 **총수입이 기준 규모를 넘었다**
        //   (실측: 부산 static 210억인데 수입 261억).
        ticketPrice: (rules.ticketPrice[leagueId] ?? 1)
          * (share.gate / (rules.types.balanced?.gate ?? share.gate)),
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

      // ── 지출 (4-B) ───────────────────────────────────────
      const st2 = staffOf.get(t.id) ?? { mgr: 0, coaches: [] };
      const expRaw = await api("calcClubExpenseNative", JSON.stringify({
        staffRules: rules.expense.staff,
        operations: rules.expense.operations,
        baseScale: staticOf(t.id),
        leagueMult,
        // ⚠ 1군만 세면 2군 연봉이 빠진다 — 같은 구단이다
        payroll: (payrollOf.get(t.id) ?? 0) + (payrollOf.get(t.id.slice(0, -2) + "_2") ?? 0),
        managerAbility: st2.mgr,
        coachAbilities: st2.coaches,
        capacityRatio: avgCap > 0 ? capacityOf(t) / avgCap : 1,
        hasFarm: m.teams.some((x) => x.id === t.id.slice(0, -2) + "_2"),
      }));
      const exp = JSON.parse(expRaw) as { total?: number; error?: string };
      if (exp.error) continue;

      // 🔴 **전년 예산 + 수입 − 지출.** 적자가 나면 예산이 준다 —
      //   그러면 다음 해 FA 입찰 상한·신인 계약금·감독 기대치가 같이
      //   내려간다. 그게 이 시스템의 요점이다.
      // ⚠ **하한을 둔다.** 없으면 적자가 몇 해 겹칠 때 구단이 0으로
      //   수렴해 리그가 죽는다.
      // ⚠ **순익을 통째로 넣지 않는다.** 잔고가 그대로 예산이 되면
      //   흑자·적자가 몇 해만 겹쳐도 발산하거나 붕괴한다.
      const prev = scaleOf(t.id);
      const st0 = staticOf(t.id);
      const profit = r.total - (exp.total ?? 0);
      const nextRaw = prev + profit * rules.expense.budgetAdjustRate;
      next[t.id] = Math.round(Math.min(
        st0 * rules.expense.maxBudgetRatio,
        Math.max(st0 * rules.expense.minBudgetRatio, nextRaw),
      ));
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
