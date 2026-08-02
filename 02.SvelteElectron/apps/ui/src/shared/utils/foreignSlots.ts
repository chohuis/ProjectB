// ── 외국인 선수 보유 슬롯 ────────────────────────────────────────
//
// **정본은 `generation_rules.json`의 `foreignRules`다.** 여기엔 표를 두지 않는다.
//
// ⚠ "외국인"은 국적이 아니라 **리그 기준 상대 개념**이다. ABL 선수의 국적은
// USA고 그건 그 리그의 자국민이다. 그래서 `국적 !== "KOR"`로 판정하면
// ABL·JBL 로스터 전원이 외국인이 되고, 승강·방출 규칙이 그쪽에서 통째로 뒤집힌다.
// 자국 국적의 정본도 규칙 파일이다 — `rosterRules[리그].nationality`
// (없으면 KOR, Rust `roster_gen`의 폴백과 같다).
//
// 보유 한도가 걸리는 리그는 `foreignRules.leagues`에 든 리그뿐이다.

export interface ForeignRulesData {
  leagues: string[];
  perTeam: number;
  maxPitchers: number;
  ovrMin: number;
  ovrMax: number;
  nationality: string;
  devRateMin: number;
  devRateMax: number;
  ageMin: number;
  ageMax: number;
  namePool?: { surnames: string[]; givenA: string[]; givenB: string[]; western?: boolean };
}

let _rules: ForeignRulesData | null = null;
/** 리그 → 자국 국적. `rosterRules[리그].nationality`에서 뽑는다 */
let _home: Record<string, string> = {};

/**
 * 규칙 파일에서 표를 캐시한다. `loadRosterRules()` 결과를 그대로 넘긴다.
 * 안 부르면 `isForeignPlayer`가 항상 false — 조용히 틀린 값을 주는 대신
 * "외국인 규칙이 아직 없다"로 동작한다.
 */
export function primeForeignRules(rulesFile: {
  foreignRules?: unknown;
  rosterRules?: Record<string, { nationality?: string }>;
}): void {
  _rules = (rulesFile.foreignRules as ForeignRulesData | undefined) ?? null;
  const home: Record<string, string> = {};
  for (const [lid, r] of Object.entries(rulesFile.rosterRules ?? {})) {
    home[lid] = r?.nationality ?? "KOR";
  }
  _home = home;
}

export function foreignRules(): ForeignRulesData | null {
  return _rules;
}

/** 이 리그에 보유 한도가 걸리는가 */
export function hasForeignSlots(leagueId: string): boolean {
  return !!_rules?.leagues?.includes(leagueId);
}

/** 리그 기준 자국 국적. 규칙이 없으면 KOR */
export function homeNationalityOf(leagueId: string): string {
  return _home[leagueId] ?? "KOR";
}

/**
 * 이 선수가 그 리그의 **외국인 슬롯 보유자**인가.
 *
 * 보유 한도가 없는 리그(ABL·JBL·아마추어)에서는 항상 false다 —
 * 거기선 국적이 달라도 "용병 슬롯"이라는 개념 자체가 없다.
 */
export function isForeignPlayer(leagueId: string, nationality?: string): boolean {
  if (!hasForeignSlots(leagueId)) return false;
  return (nationality ?? "KOR") !== homeNationalityOf(leagueId);
}
