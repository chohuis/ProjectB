import type { PitcherSeasonStats, ProtagonistSave } from "../types/save";

/**
 * 리그 연봉 배수 — **정본은 `generation_rules.json`의 `salaryRules.leagueMult`다.**
 *
 * 🔴 예전엔 Rust에 표가 따로 박혀 있었고 규칙 파일과 어긋났다 —
 * 독립 0.14 vs 0.35(2.5배), KBL 2군 0.3 vs 없음→1.0(3.3배).
 * 2군 선수의 시장가·FA 오퍼가 1군과 같은 배수로 계산됐다.
 *
 * ⚠ 못 읽으면 빈 지도를 넘긴다 — Rust가 옛 표로 떨어져 예전 동작이 된다.
 * 0을 넘기면 연봉이 통째로 무너지므로 그 경로는 만들지 않는다.
 */
async function leagueMultOf(): Promise<Record<string, number>> {
  try {
    const { loadRosterRules } = await import("../repo/newGameV3");
    const rules = await loadRosterRules();
    const m = (rules as { salaryRules?: { leagueMult?: Record<string, number> } })
      .salaryRules?.leagueMult;
    return m && Object.keys(m).length ? m : {};
  } catch {
    return {};
  }
}


export async function calcSeasonRating(stats: PitcherSeasonStats | null): Promise<number> {
  const raw = await window.projectB!.salaryCalcSeasonRating(
    JSON.stringify({ stats: stats ?? null })
  );
  return JSON.parse(raw) as number;
}

export async function calcMarketSalary(ovr: number, fame: number, leagueId: string): Promise<number> {
  const raw = await window.projectB!.salaryCalcMarketSalary(
    JSON.stringify({ ovr, fame, leagueId, leagueMult: await leagueMultOf() })
  );
  return JSON.parse(raw) as number;
}

export async function calcOfferedSalary(
  currentSalary: number,
  rating: number,
  marketSalary: number,
): Promise<number> {
  const raw = await window.projectB!.salaryCalcOfferedSalary(
    JSON.stringify({ currentSalary, rating, marketSalary })
  );
  return JSON.parse(raw) as number;
}

export async function calcOfferedSalaryForProtagonist(
  protagonist: ProtagonistSave,
  seasonStats: PitcherSeasonStats | null,
  /** 구단주 budgetSupport 계수 (§7-5 F-1). 없으면 중립 */
  budgetMod = 1.0,
): Promise<number> {
  const params = {
    pitchingOvr:   protagonist.pitching.ovr,
    fame:          protagonist.fame,
    leagueId:      protagonist.leagueId,
    currentSalary: protagonist.contract?.salary ?? null,
    stats:         seasonStats ?? null,
    budgetMod,
    leagueMult:    await leagueMultOf(),
  };
  const raw = await window.projectB!.salaryCalcOfferedSalaryForProtagonist(
    JSON.stringify(params)
  );
  return JSON.parse(raw) as number;
}
