import type { CareerSeasonRecord, UniversityTier } from "../types/save";

// ── 대학 요건 — **팀 데이터에서 파생한다** ────────────────────────
//
// ⚠ 여기 `UNIVERSITY_REQUIREMENTS` 하드코딩 표가 있었다. 대학 7개가 적혀
// 있었는데 **그중 실재하는 팀은 하나뿐**이었다 — Phase 5에서 팀이 50개로
// 늘고 ID 체계가 바뀌었는데 표가 따라가지 않았다.
//
// 표에 없으면 `minAcademicGrade ?? 9` · `minBaseballScore ?? 0`으로 떨어져
// **49개 대학이 전부 무조건 합격**이었고, 등급이 없으니 스카우트 보너스도
// 전부 최하(D, -3)였다. 어디를 쓰든 붙고 어디를 가든 손해가 같았다.
//
// 이제 `refs.json`의 `power`(전력★ 1~5)에서 등급을 낸다. 대학 50팀 전부
// `power`를 갖고 있어 빠지는 팀이 없고, 팀이 늘어도 따라온다.
//
//   power 5 → S ( 1팀)   power 4 → A ( 7팀)   power 3 → B (15팀)
//   power 2 → C (23팀)   power 1 → D ( 4팀)          (2026-08-06 실측)

/** 전력★ → 등급. 범위를 벗어난 값은 가운데로 — 등급 없는 대학을 만들지 않는다 */
export function tierOfPower(power: number | null | undefined): UniversityTier {
  switch (Math.round(power ?? 3)) {
    case 5:  return "S";
    case 4:  return "A";
    case 3:  return "B";
    case 2:  return "C";
    case 1:  return "D";
    default: return power != null && power > 5 ? "S" : "D";
  }
}

/** 등급별 입학 기준. 옛 표(S 4/40 · A 5/20 · C 7/0)를 다섯 단계로 폈다 */
export const TIER_REQUIREMENTS: Record<UniversityTier, {
  minAcademicGrade: number;
  minBaseballScore: number;
}> = {
  S: { minAcademicGrade: 4, minBaseballScore: 40 },
  A: { minAcademicGrade: 5, minBaseballScore: 25 },
  B: { minAcademicGrade: 6, minBaseballScore: 12 },
  // ⚠ C를 0이 아니라 4로 뒀다. 50팀 중 23팀이 C라 0이면 **절반이 무조건 합격**이다
  C: { minAcademicGrade: 7, minBaseballScore: 4 },
  D: { minAcademicGrade: 9, minBaseballScore: 0 },
};

export interface UniversityRequirement {
  tier: UniversityTier;
  minAcademicGrade: number;
  minBaseballScore: number;
}

/** 팀의 전력★으로 요건을 만든다 */
export function requirementOfPower(power: number | null | undefined): UniversityRequirement {
  const tier = tierOfPower(power);
  return { tier, ...TIER_REQUIREMENTS[tier] };
}

// ── 등급별 드래프트 스카우트 보너스 ─────────────────────────────────
export const UNIVERSITY_SCOUT_BONUS: Record<UniversityTier, number> = {
  S: 15, A: 8, B: 3, C: 0, D: -3,
};

// ── 석차백분율 → 9등급 환산 ──────────────────────────────────────
export function pctToGrade(pct: number): number {
  if (pct <= 4)  return 1;
  if (pct <= 11) return 2;
  if (pct <= 23) return 3;
  if (pct <= 40) return 4;
  if (pct <= 60) return 5;
  if (pct <= 77) return 6;
  if (pct <= 89) return 7;
  if (pct <= 96) return 8;
  return 9;
}

// ── 석차백분율 → GPA 4.5 환산 ────────────────────────────────────
export function toGpa45(pct: number): number {
  if (pct <= 4)  return 4.5;
  if (pct <= 11) return 4.2;
  if (pct <= 23) return 3.8;
  if (pct <= 40) return 3.5;
  if (pct <= 60) return 3.0;
  if (pct <= 77) return 2.5;
  if (pct <= 89) return 2.0;
  if (pct <= 96) return 1.5;
  return 1.0;
}

// ── 진로 점수 표 (2026-08-28) ────────────────────────────────────
//
// 🔴 **숫자가 코드에 박혀 있었다.** 우승 100 · 준우승 60 · 4강 30 · 수상 ×15가
//   전부 여기 리터럴이었다. 밸런스 값을 코드에 두면 규칙 파일과 어긋난 걸
//   아무도 모른다 — 이 저장소에서 되풀이된 형태다.
//
// ⚠ **Rust로 안 내린다.** 저장된 기록을 더하는 집계고 난수도 확률도 없다.
//   화면이 반응형(`$:`)으로 부르는 자리가 있어 IPC를 태우면 렌더가 깨진다.
//   숫자만 규칙 파일로 올리고 합산은 여기 둔다.
//
// ⚠ **못 채우면 옛 값으로 떨어진다.** 부팅 순서가 어긋나도 점수가 0이 되지
//   않게 — 0이면 "대회 성적이 없는 선수"가 되어 진로가 통째로 막힌다.
interface HsScoreTable {
  champion: number; runnerUp: number; semiFinal: number;
  notQualified: number; perAward: number;
}
interface IndividualScoreTable {
  champion: number; runnerUp: number; semiFinal: number; perAward: number;
  ipPerInning: number; ipCap: number;
  eraBase: number; eraPerRun: number; eraMin: number; eraMax: number;
}

const HS_FALLBACK: HsScoreTable = {
  champion: 100, runnerUp: 60, semiFinal: 30, notQualified: 10, perAward: 15,
};
const IND_FALLBACK: IndividualScoreTable = {
  champion: 25, runnerUp: 15, semiFinal: 8, perAward: 20,
  ipPerInning: 0.5, ipCap: 30, eraBase: 3.0, eraPerRun: 8, eraMin: -15, eraMax: 25,
};

let _hs: HsScoreTable = HS_FALLBACK;
let _ind: IndividualScoreTable = IND_FALLBACK;

/**
 * 규칙 파일에서 표를 캐시한다. `loadRosterRules()` 결과를 그대로 넘긴다.
 *
 * ⚠ 안 부르면 위 폴백이 쓰인다 — **조용히 0이 되지는 않는다.**
 *   `primeForeignRules`와 같은 방식이고 같은 자리(`stores/master`)에서 부른다.
 */
export function primeCareerScoreRules(rulesFile: {
  careerScoreRules?: { highschool?: Partial<HsScoreTable>; individual?: Partial<IndividualScoreTable> };
}): void {
  const c = rulesFile.careerScoreRules;
  if (c?.highschool) _hs = { ...HS_FALLBACK, ...c.highschool };
  if (c?.individual) _ind = { ...IND_FALLBACK, ...c.individual };
}

// ── 고교 야구 점수 계산 (careerRecords 기반) ─────────────────────
export function calcHsBaseballScore(records: CareerSeasonRecord[]): number {
  return records
    .filter((r) => r.leagueId === "LEAGUE_HIGHSCHOOL")
    .reduce((total, r) => {
      let score = 0;
      if (r.psResult === "champion")          score += _hs.champion;
      else if (r.psResult === "runnerUp")     score += _hs.runnerUp;
      else if (r.psResult === "semiFinal")    score += _hs.semiFinal;
      else if (r.psResult === "notQualified") score += _hs.notQualified;
      score += (r.awards?.length ?? 0) * _hs.perAward;
      return total + score;
    }, 0);
}

// ── 지원 자격 확인 ────────────────────────────────────────────────
export function checkUniversityEligibility(
  power: number | null | undefined,
  avgPct: number,        // 석차백분율 평균 (낮을수록 좋음)
  baseballScore: number,
): { eligible: boolean; meetsAcademic: boolean; meetsBaseball: boolean } {
  const req = requirementOfPower(power);
  const grade = pctToGrade(avgPct);
  const meetsAcademic = grade <= req.minAcademicGrade;
  const meetsBaseball = baseballScore >= req.minBaseballScore;
  return { eligible: meetsAcademic && meetsBaseball, meetsAcademic, meetsBaseball };
}

// ⚠ `getUniversityScoutBonus`를 지웠다 (2026-08-28) — 아무도 안 불렀다.
//   표(`UNIVERSITY_SCOUT_BONUS`)는 남긴다. 화면이 티어별 값을 그대로 보여준다.

// 🔴 **`calcDraftSalary`를 지웠다** (2026-08-28).
//
//   `(ovr − 45) × 220`을 여기서 다시 적고 있었는데 **아무도 안 불렀다.**
//   같은 식이 Rust `player_engine.rs`의 독립리그 스카우트 제안에 있고,
//   신인 계약은 규칙 파일의 `draftRules.contract`가 정본이다
//   (KBO 규정대로 연봉은 최저연봉 균일이고 차등은 계약금이 진다).
//
// ⚠ **셋이 서로 다른 것을 재고 있었다.** 죽은 사본을 남겨 두면 언젠가
//   누군가 그걸 부른다 — 그때 신인 연봉이 규정을 벗어난다.

// ── 독립 리그 ─────────────────────────────────────────────────────
//
// ⚠ **상무는 지원 대상이 아니다.** `TEAM_IND_SANGMU_PHOENIX`가 독립 리그에
// 들어 있지만 병역 경로(`SportsUnitApplicationModal`)가 정본이라 여기서 뺀다.
// 안 빼면 고교생이 상무에 원서를 넣을 수 있다.
export const SANGMU_TEAM_ID = "TEAM_IND_SANGMU_PHOENIX";

export const isApplicableIndependent = (teamId: string): boolean => teamId !== SANGMU_TEAM_ID;

/**
 * 독립 리그 입단 컷(OVR). **팀의 전력★에서 낸다.**
 *
 * ⚠ 예전엔 엔진이 지망 순서로만 컷을 정했다(1지망 52 · 2지망 48 · 3지망 44).
 * 어느 팀을 쓰든 같았고 **1지망에 약팀을 써도 컷이 52**였다.
 *
 *   power 4 → 54   power 3 → 49   power 2 → 44   power 1 → 39   (2026-08-06 실측 분포)
 */
export function indieCutOfPower(power: number | null | undefined): number {
  const p = Math.round(power ?? 2);
  if (p >= 4) return 54;
  if (p === 3) return 49;
  if (p === 2) return 44;
  return 39;
}

/**
 * 해외 2군 직행 문턱 — **팀 전력★이 정한다** (실플 ②, 사용자 확정 2026-08-27).
 *
 * 🔴 고교·대학·독립에서 아주 잘하면 KBL 드래프트를 건너뛰고 ABL·JBL **2군**으로
 *   바로 간다. 사용자가 정한 선은 **OVR 78 + 대회 성적**이다.
 *
 * ⚠ **해외 2군 실측(2026-08-27, 투수 OVR)**: ABL 2군 팀 평균 **66** ·
 *   JBL 2군 **63**. OVR 78이면 그 안에서 압도적이다 — 그게 의도다.
 *   빨리 올라가라고 여는 문이지 거기서 눌러앉으라는 게 아니다.
 *
 * ⚠ **★이 셀수록 어렵다.** `indieCutOfPower`와 같은 축이다 —
 *   같은 모양이라야 두 자리가 같게 읽힌다.
 * ⚠ **드래프트를 대체하면 안 된다.** 문턱이 낮으면 잘 키운 선수가 전부
 *   해외로 새어 KBL 드래프트가 죽는다.
 */
export function overseasFarmCutOfPower(power: number | null | undefined): number {
  const p = Math.round(power ?? 3);
  if (p >= 5) return 84;
  if (p === 4) return 81;
  if (p === 3) return 78;   // 사용자 확정선 — 평범한 팀 기준
  if (p === 2) return 75;
  return 72;
}

/**
 * **개인 기여 점수** — 해외 스카우트가 보는 축 (2026-08-27).
 *
 * 🔴 `calcHsBaseballScore`를 그대로 쓰면 안 된다. 그건 **팀 성적**이라
 *   우승팀이면 벤치에 앉아 있어도 100점이다 — 대학 입시엔 맞는 식이지만
 *   (어느 학교 출신인가가 실제로 입시에 영향을 준다)
 *   **해외 스카우트가 보는 건 그 선수 개인**이다.
 *
 * ⚠ **개인 성적은 이미 있다** — `CareerSeasonRecord.stats`에 ERA·이닝·탈삼진이
 *   들어 있다(2026-08-26에 과거 5년치를 심으면서 확인했다). 새로 만들지 않는다.
 *
 * ⚠ **대회 개인 기록(A3)이 아직 없다.** 대회에서 몇 이닝을 던졌는지는 못 본다 —
 *   시즌 전체 성적으로 대신한다. A3이 생기면 그 축을 여기 더한다.
 *
 *     이닝     많이 던졌나 — 팀이 믿고 맡겼다는 뜻이다
 *     ERA      잘 던졌나
 *     수상     개인이 받은 것
 *     팀 성적  **비중을 줄인다** — 우승 100 → 25. 운의 몫이다
 */
export function calcIndividualScore(records: CareerSeasonRecord[]): number {
  return records.reduce((total, r) => {
    let score = 0;
    // 팀 성적 — 남기되 **작게**. 큰 무대를 밟은 경험은 값이 있다
    if (r.psResult === "champion")        score += _ind.champion;
    else if (r.psResult === "runnerUp")   score += _ind.runnerUp;
    else if (r.psResult === "semiFinal")  score += _ind.semiFinal;
    // 개인 수상 — 이게 개인 축이다
    score += (r.awards?.length ?? 0) * _ind.perAward;
    // 개인 성적 — 이닝과 ERA
    const st = r.stats;
    if (st?.type === "pitcher" && st.ip > 0) {
      // 한 시즌 60이닝이면 주축이다 — 그 근처를 만점으로 본다
      score += Math.min(_ind.ipCap, st.ip * _ind.ipPerInning);
      // ERA 3.00이 기준. 좋으면 더, 나쁘면 깎는다
      score += Math.max(_ind.eraMin,
        Math.min(_ind.eraMax, (_ind.eraBase - st.era) * _ind.eraPerRun));
    }
    return total + score;
  }, 0);
}

/**
 * 해외 2군 직행 판정 — **OVR + 대회 성적** (사용자 확정).
 *
 * ⚠ **개인 기여로 본다** — `calcIndividualScore`. `calcHsBaseballScore`(우승 100 ·
 *   준우승 60 · 4강 30 · 미진출 10)와 수상(×15)으로 낸다 — **새로 만들지 않는다.**
 *   대학·독립도 같은 필드를 쓰므로 무대와 무관하게 돈다.
 *
 * ⚠ **대회 개인 기록(A3)이 아직 없다.** 지금은 팀 성적 + 수상으로 대신한다.
 *   A3이 생기면 개인 기록을 여기 더한다 — 그때 이 주석을 지운다.
 *
 * ⚠ 대회 점수가 낮아도 **OVR이 문턱보다 한참 위면** 통과한다 —
 *   약팀에서 대회를 못 나간 좋은 투수를 통째로 묻으면 안 된다.
 *   (드래프트 판정이 같은 이유로 순수 실력 축을 따로 둔다.)
 */
export function passesOverseasFarm(
  ovr: number, baseballScore: number, power: number | null | undefined,
): boolean {
  const cut = overseasFarmCutOfPower(power);
  if (ovr < cut) return false;
  // 문턱을 넘겼으면 대회 성적을 본다 — 다만 실력이 충분히 위면 면제한다
  const OVR_EXEMPT = 4;        // 문턱 +4면 대회를 안 본다
  const SCORE_MIN  = 40;       // 4강 한 번(30) + 수상 하나(15) 정도
  return ovr >= cut + OVR_EXEMPT || baseballScore >= SCORE_MIN;
}

/** 해외 2군 팀인가 — 직행 후보는 여기뿐이다(1군은 FA·포스팅 경로다) */
export function isOverseasFarmTeam(leagueId: string | undefined): boolean {
  return leagueId === "LEAGUE_ABL_FARM" || leagueId === "LEAGUE_JBL_FARM";
}
