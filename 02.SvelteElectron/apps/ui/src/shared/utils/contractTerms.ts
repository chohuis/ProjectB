/**
 * 계약 협상 화면이 쓰는 **규칙·계산** (PLAN_CONTRACT_TERMS §3 · §4 · §5-2 · §8).
 *
 * 🔴 **화면 안에 두지 않는다.** 예전 `ContractNegotiationModal` 은 허용치 계수와
 * 총액 식을 컴포넌트 안에 갖고 있었다 — 이 저장소의 vitest 는
 * `environment: "node"` 라 컴포넌트를 못 띄우고, 그러면 **그 식을 한 줄도 못 잰다.**
 * `faOfferTerms.ts`(FA 카드)와 같은 자리다.
 *
 * ## 밸런스 값은 여기 안 박는다
 *
 * 인센티브 후보·문턱·금액 비율은 전부 `players/generation_rules.json` 의
 * `contractRules` 에서 온다(`primeContractRules`). 코드의 값은 **규칙 파일을
 * 못 읽었을 때의 폴백**이고 파일과 같은 숫자다 — 두 벌이 되면 한쪽만 고쳐진다.
 *
 * ⚠ **조항 계수 다섯(0.95 · 0.97 · 0.94 · 1.05 · 1.10)만 코드에 남는다.**
 * 이미 화면에 있던 값을 그대로 옮긴 것이고, 이번에 값을 정한 게 아니다.
 * 규칙 파일로 옮기는 건 밸런스 소유(A·사용자) 판단이라 손대지 않았다.
 *
 * ⚠ **금액 단위는 만원**이다(게임 전체 규칙 · CLAUDE.md).
 */

import type { ContractIncentive, IncentiveKind } from "../types/save";
import { FA_TERM_LABEL } from "./faOfferTerms";

// ── 조항 ───────────────────────────────────────────────────────
/**
 * 조항은 **한 무리에 하나**다. 「선수 옵션 1년」과 「2년」을 같이 걸 수 없다 —
 * 계약서에 두 줄이 되는 게 아니라 한 줄의 값이 갈리는 것이다.
 */
export type ClauseGroup = "noTrade" | "playerOption" | "teamOption";
export type ClauseId =
  "noTrade" | "playerOption1" | "playerOption2" | "teamOption1" | "teamOption2";

export interface ClauseOption {
  id: ClauseId;
  group: ClauseGroup;
  /** 항목 이름 — FA 카드·선수 상세와 **같은 말**이어야 한다 */
  label: string;
  /** 옵션 연수. 노트레이드는 0 */
  years: number;
  /** 구단 허용치에 곱하는 계수. 1보다 크면 구단에 유리하다 */
  mult: number;
}

/**
 * 조항 다섯 — **계수는 예전 화면의 값 그대로다.**
 *
 * ```
 * 노트레이드        × 0.95   구단이 손해라 허용치가 준다
 * 선수 옵션 1 / 2년 × 0.97 / 0.94
 * 팀 옵션   1 / 2년 × 1.05 / 1.10   구단에 유리하니 허용치가 는다
 * ```
 */
export const CLAUSE_OPTIONS: readonly ClauseOption[] = [
  { id: "noTrade", group: "noTrade", label: FA_TERM_LABEL.noTrade, years: 0, mult: 0.95 },
  {
    id: "playerOption1",
    group: "playerOption",
    label: `${FA_TERM_LABEL.playerOption} 1년`,
    years: 1,
    mult: 0.97,
  },
  {
    id: "playerOption2",
    group: "playerOption",
    label: `${FA_TERM_LABEL.playerOption} 2년`,
    years: 2,
    mult: 0.94,
  },
  {
    id: "teamOption1",
    group: "teamOption",
    label: `${FA_TERM_LABEL.teamOption} 1년`,
    years: 1,
    mult: 1.05,
  },
  {
    id: "teamOption2",
    group: "teamOption",
    label: `${FA_TERM_LABEL.teamOption} 2년`,
    years: 2,
    mult: 1.1,
  },
];

export const clauseById = (id: ClauseId): ClauseOption => CLAUSE_OPTIONS.find((c) => c.id === id)!;

/** 이미 고른 무리는 다시 못 고른다 — 그 자리는 「＋ 추가」 목록에서 잠긴다 */
export function clauseAddable(picked: readonly ClauseId[], id: ClauseId): boolean {
  const g = clauseById(id).group;
  return !picked.some((p) => clauseById(p).group === g);
}

export function addClause(picked: readonly ClauseId[], id: ClauseId): ClauseId[] {
  if (!clauseAddable(picked, id)) return [...picked];
  return [...picked, id];
}

export function removeClause(picked: readonly ClauseId[], id: ClauseId): ClauseId[] {
  return picked.filter((p) => p !== id);
}

/** 고른 조항 → 계약서 칸. 화면이 따로 세지 않게 한 자리에서 낸다 */
export function clauseTerms(picked: readonly ClauseId[]): {
  noTrade: boolean;
  teamOptionYears: number;
  playerOptionYears: number;
} {
  const of = (g: ClauseGroup) => picked.map(clauseById).find((c) => c.group === g);
  return {
    noTrade: picked.includes("noTrade"),
    teamOptionYears: of("teamOption")?.years ?? 0,
    playerOptionYears: of("playerOption")?.years ?? 0,
  };
}

export const clauseMultiplier = (picked: readonly ClauseId[]): number =>
  picked.map(clauseById).reduce((m, c) => m * c.mult, 1);

// ── 규칙 파일 (contractRules) ──────────────────────────────────
export interface IncentiveCandidateRule {
  kind: IncentiveKind;
  roles: string[];
  threshold: number;
  /** 연봉 대비 % — 금액은 여기서 계산한다 */
  bonusPct: number;
  awardId?: string;
}

export interface ContractRules {
  incentives: {
    maxPerContract: number;
    totalPctOfSalary: number;
    perItemPctOfSalary: number;
    acceptMultPerIncentive: number;
    awardAxisAllRoles: boolean;
    byRole: Record<string, IncentiveKind[]>;
    candidates: IncentiveCandidateRule[];
  };
  renewalSigningBonus: number;
  counterOffer: {
    base: number;
    max: number;
    ratingBonusAt: number;
    ownerBonusAt: number;
    penaltyRatingBelow: number;
    penaltyOwnerBelow: number;
  };
}

/**
 * 폴백 — **규칙 파일과 같은 숫자다.** 파일을 못 읽는 자리(단위검사·부팅 전)에서
 * 화면이 죽지 않게 두는 것이지, 여기가 정본이 아니다.
 */
const FALLBACK: ContractRules = {
  incentives: {
    maxPerContract: 3,
    totalPctOfSalary: 25,
    perItemPctOfSalary: 15,
    acceptMultPerIncentive: 1.02,
    awardAxisAllRoles: true,
    byRole: {
      SP: ["games", "innings", "era", "wins"],
      RP: ["games", "holds", "era"],
      CP: ["games", "saves", "era"],
    },
    candidates: [],
  },
  renewalSigningBonus: 0,
  counterOffer: {
    base: 1,
    max: 3,
    ratingBonusAt: 65,
    ownerBonusAt: 30,
    penaltyRatingBelow: 40,
    penaltyOwnerBelow: 0,
  },
};

let _rules: ContractRules = FALLBACK;
let _minSalary: Record<string, number> = {};
let _awardLabel: Record<string, string> = {};

/** 리그별 최저연봉 (`salaryRules.minSalary`). 없으면 0 — 하한을 지어내지 않는다 */
export function minSalaryOf(leagueId: string): number {
  return _minSalary[leagueId] ?? 0;
}

/** 수상 이름표. 정본은 `awardRules` 다 — 코드가 이름을 또 적지 않는다 */
export function awardLabelOf(awardId: string): string {
  return _awardLabel[awardId] ?? awardId;
}

export const contractRules = (): ContractRules => _rules;

/**
 * 규칙 파일을 싣는다. 부팅 때 `masterStore` 가 한 번 부른다.
 *
 * ⚠ **세 곳을 같이 읽는다** — `contractRules`(협상) · `salaryRules.minSalary`(하한) ·
 * `awardRules`(수상 이름). 셋 다 같은 파일이라 로더를 셋으로 나눌 이유가 없다.
 */
export function primeContractRules(rulesFile: {
  contractRules?: Partial<ContractRules>;
  salaryRules?: { minSalary?: Record<string, number> };
  awardRules?: Record<string, unknown>;
}): void {
  const c = rulesFile.contractRules;
  if (c) {
    _rules = {
      incentives: { ...FALLBACK.incentives, ...(c.incentives ?? {}) },
      renewalSigningBonus: c.renewalSigningBonus ?? FALLBACK.renewalSigningBonus,
      counterOffer: { ...FALLBACK.counterOffer, ...(c.counterOffer ?? {}) },
    };
  }
  if (rulesFile.salaryRules?.minSalary) _minSalary = { ...rulesFile.salaryRules.minSalary };

  const aw = rulesFile.awardRules;
  if (aw) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(aw)) {
      if (k.startsWith("_") || !v || typeof v !== "object") continue;
      const label = (v as { label?: string }).label;
      if (typeof label === "string") out[k] = label;
    }
    _awardLabel = out;
  }
}

// ── 인센티브 ───────────────────────────────────────────────────
/** 축 이름 — 문턱 뒤에 붙는 말. 「25등판」의 「등판」이다 */
export const INCENTIVE_UNIT: Record<Exclude<IncentiveKind, "award">, string> = {
  games: "등판",
  innings: "이닝",
  era: "ERA",
  wins: "승",
  saves: "세이브",
  holds: "홀드",
};

/**
 * 항목 이름 — 「25등판」·「ERA 3.00 이하」·「골든글러브」.
 *
 * ⚠ **조사를 안 붙인다.** 받침이 제각각이라 코드가 이어 붙이면 깨진다
 * (`contract_terms.json` 의 `_josa` 가 같은 규칙을 못박아 뒀다).
 */
export function incentiveLabel(
  i: Pick<ContractIncentive, "kind" | "threshold" | "awardId">,
): string {
  if (i.kind === "award") return awardLabelOf(i.awardId ?? "");
  if (i.kind === "era") return `ERA ${i.threshold.toFixed(2)} 이하`;
  return `${i.threshold}${INCENTIVE_UNIT[i.kind]}`;
}

/** 인센티브를 구분하는 키. 같은 축·같은 문턱을 두 번 걸 수 없다 */
export const incentiveKey = (
  i: Pick<ContractIncentive, "kind" | "threshold" | "awardId">,
): string => `${i.kind}:${i.awardId ?? ""}:${i.threshold}`;

/** 만원 단위로 100 자리에서 끊는다 — 연봉과 같은 눈금이다 */
const round100 = (v: number) => Math.max(0, Math.round(v / 100) * 100);

/**
 * 후보 목록 — **그 보직의 축만** 낸다(§5-3). 수상은 보직과 무관하다.
 *
 * 금액은 `연봉 × bonusPct` 이고 `perItemPctOfSalary` 로 한 번 더 깎인다.
 * 🔴 둘 다 **제안값**이다 — §7-1 계측 전까지 확정이 아니다.
 */
export function incentiveCandidates(role: string, salary: number): ContractIncentive[] {
  const r = _rules.incentives;
  const perItemCap = round100(salary * (r.perItemPctOfSalary / 100));
  const allowed = new Set(r.byRole[role] ?? []);

  return r.candidates
    .filter((c) => {
      if (!c.roles.includes(role)) return false;
      if (c.kind === "award") return r.awardAxisAllRoles;
      return allowed.has(c.kind);
    })
    .map((c) => ({
      kind: c.kind,
      threshold: c.threshold,
      ...(c.awardId ? { awardId: c.awardId } : {}),
      bonus: Math.min(round100(salary * (c.bonusPct / 100)), perItemCap),
    }));
}

export const maxIncentives = (): number => _rules.incentives.maxPerContract;

/** 총액 상한 — 연봉의 `totalPctOfSalary` %. 제안값이다 */
export const incentiveTotalCap = (salary: number): number =>
  round100(salary * (_rules.incentives.totalPctOfSalary / 100));

export const incentiveTotal = (picked: readonly ContractIncentive[]): number =>
  picked.reduce((s, i) => s + i.bonus, 0);

/**
 * 더할 수 있나 — **상한 셋을 다 본다.**
 *
 * ```
 * 개수      maxPerContract (✅ 3 확정)
 * 중복      같은 축·같은 문턱은 한 번만
 * 총액      totalPctOfSalary (제안)
 * ```
 */
export function incentiveAddable(
  picked: readonly ContractIncentive[],
  cand: ContractIncentive,
  salary: number,
): boolean {
  if (picked.length >= maxIncentives()) return false;
  if (picked.some((p) => incentiveKey(p) === incentiveKey(cand))) return false;
  return incentiveTotal(picked) + cand.bonus <= incentiveTotalCap(salary);
}

export function addIncentive(
  picked: readonly ContractIncentive[],
  cand: ContractIncentive,
  salary: number,
): ContractIncentive[] {
  if (!incentiveAddable(picked, cand, salary)) return [...picked];
  return [...picked, cand];
}

export function removeIncentive(
  picked: readonly ContractIncentive[],
  key: string,
): ContractIncentive[] {
  return picked.filter((p) => incentiveKey(p) !== key);
}

// ── 역제안 횟수 (§5-2) ─────────────────────────────────────────
/**
 * 남은 역제안 횟수 — **성적과 구단주 관계가 정한다.**
 *
 * ```
 * rounds = 1
 *        + (성적 >= 65 ? 1 : 0)
 *        + (구단주 관계 >= 30 ? 1 : 0)
 *        − (성적 < 40 && 관계 < 0 ? 1 : 0)
 *        clamp 1 ~ 3
 * ```
 *
 * ✅ 계수 넷은 사용자 확정이다(65 · 30 · 40 · 0).
 *
 * ⚠ **관계 값을 화면에 숫자로 안 쓴다** — `relationship.ts` 가
 * "플레이어에게 숫자로 노출하지 않는다"고 못박아 뒀다. 화면에 나가는 건
 * 남은 횟수뿐이다.
 *
 * ⚠ 구단주가 없는 팀(스태프가 아직 안 붙음)은 관계 0으로 본다 — 성적만으로 1~2회다.
 */
export function counterOfferRounds(seasonRating: number, ownerRelation: number): number {
  const c = _rules.counterOffer;
  let rounds = c.base;
  if (seasonRating >= c.ratingBonusAt) rounds += 1;
  if (ownerRelation >= c.ownerBonusAt) rounds += 1;
  if (seasonRating < c.penaltyRatingBelow && ownerRelation < c.penaltyOwnerBelow) rounds -= 1;
  return Math.max(c.base, Math.min(c.max, rounds));
}

// ── 금액 ───────────────────────────────────────────────────────
/**
 * 요구 연봉 — 슬라이더 비율을 얹고 **최저연봉으로 바닥을 친다**(§3 ✅ 사용자 확정 6).
 *
 * ⚠ 하한이 제시액보다 높을 수 있다(독립리그에서 올라온 계약 등). 그때도
 * 하한이 이긴다 — 최저연봉 아래 계약은 규칙상 존재할 수 없다.
 */
export function requestedSalaryOf(offer: number, ratio: number, minSalary: number): number {
  const raw = Math.round((offer * (1 + ratio)) / 100) * 100;
  return Math.max(raw, minSalary);
}

/** 총액 — 연봉 × 기간 + 계약금. `faTotalValue` 와 **같은 식이다** */
export const contractTotalValue = (salary: number, years: number, signingBonus: number): number =>
  salary * (years > 0 ? years : 0) + signingBonus;

// ── 구단 판정 ──────────────────────────────────────────────────
export interface AcceptInput {
  /** 관계·예산 배수를 이미 먹인 제시액 */
  effectiveOffer: number;
  offeredYears: number;
  requestedYears: number;
  clauses: readonly ClauseId[];
  incentiveCount: number;
}

/**
 * 구단 허용치 — **예전 화면의 식 그대로**에 인센티브 항만 더했다.
 *
 * ```
 * base = 제시액 × 1.15
 *      × (1 + (요구기간 − 제시기간) × 0.03)
 *      × 조항 계수 곱
 *      × acceptMultPerIncentive ^ 인센티브 개수     ← 새로 더한 항 (제안 1.02)
 * ```
 */
export function acceptThresholdOf(i: AcceptInput): number {
  let base = i.effectiveOffer * 1.15;
  base *= 1 + (i.requestedYears - i.offeredYears) * 0.03;
  base *= clauseMultiplier(i.clauses);
  base *= Math.pow(_rules.incentives.acceptMultPerIncentive, i.incentiveCount);
  return Math.round(base);
}

/** 수락 확률 — 예전 식 그대로. 허용치 안이면 95%, 넘으면 초과분만큼 급히 떨어진다 */
export function acceptProbabilityOf(requestedSalary: number, threshold: number): number {
  if (threshold <= 0) return 0;
  if (requestedSalary <= threshold) return 95;
  const over = (requestedSalary - threshold) / threshold;
  return Math.max(0, Math.round(95 - over * 400));
}

// ── 비교표 (시안 §9) ───────────────────────────────────────────
export type CompareKey = "salary" | "years" | "signingBonus" | "incentive" | "noTrade" | "total";

export interface CompareRow {
  key: CompareKey;
  label: string;
  /** 지금 계약 · 구단 제시 · 내 역제안. 없으면 null — 「—」로 그린다 */
  current: string | null;
  offered: string;
  counter: string;
  /** 역제안이 지금보다 큰가 작은가. 숫자 칸에만 있다 */
  dir: "up" | "down" | "same";
}

export const COMPARE_LABEL: Record<CompareKey, string> = {
  salary: "연봉",
  years: "기간",
  signingBonus: FA_TERM_LABEL.signingBonus,
  incentive: "인센티브 최대",
  noTrade: FA_TERM_LABEL.noTrade,
  total: FA_TERM_LABEL.total,
};

const num = (v: number) => v.toLocaleString();
const dirOf = (a: number, b: number): "up" | "down" | "same" =>
  a > b ? "up" : a < b ? "down" : "same";

export interface CompareInput {
  current: {
    salary: number;
    years: number;
    signingBonus: number;
    noTrade: boolean;
    incentiveTotal: number;
  } | null;
  offered: { salary: number; years: number; signingBonus: number };
  counter: {
    salary: number;
    years: number;
    signingBonus: number;
    clauses: readonly ClauseId[];
    incentives: readonly ContractIncentive[];
  };
  /** 조항이 걸렸나 없나 — 두 글자 */
  yes: string;
  no: string;
}

/**
 * 지금 / 제시 / 역제안 세 칸 비교.
 *
 * ⚠ **없는 계약은 「—」다.** 신인·전역 복귀는 지금 계약이 없다 — 0으로 채우면
 * "연봉 0인 계약이 있었다"로 읽힌다.
 */
export function compareRows(i: CompareInput): CompareRow[] {
  const cur = i.current;
  const cTerms = clauseTerms(i.counter.clauses);
  const cInc = incentiveTotal(i.counter.incentives);
  const counterTotal =
    contractTotalValue(i.counter.salary, i.counter.years, i.counter.signingBonus) + cInc;
  const offeredTotal = contractTotalValue(
    i.offered.salary,
    i.offered.years,
    i.offered.signingBonus,
  );
  const currentTotal = cur
    ? contractTotalValue(cur.salary, cur.years, cur.signingBonus) + cur.incentiveTotal
    : 0;

  return [
    {
      key: "salary",
      label: COMPARE_LABEL.salary,
      current: cur ? num(cur.salary) : null,
      offered: num(i.offered.salary),
      counter: num(i.counter.salary),
      dir: dirOf(i.counter.salary, i.offered.salary),
    },
    {
      key: "years",
      label: COMPARE_LABEL.years,
      current: cur ? `${cur.years}년` : null,
      offered: `${i.offered.years}년`,
      counter: `${i.counter.years}년`,
      dir: dirOf(i.counter.years, i.offered.years),
    },
    {
      key: "signingBonus",
      label: COMPARE_LABEL.signingBonus,
      current: cur ? num(cur.signingBonus) : null,
      offered: num(i.offered.signingBonus),
      counter: num(i.counter.signingBonus),
      dir: dirOf(i.counter.signingBonus, i.offered.signingBonus),
    },
    {
      key: "incentive",
      label: COMPARE_LABEL.incentive,
      current: cur ? num(cur.incentiveTotal) : null,
      offered: "0",
      counter: num(cInc),
      dir: dirOf(cInc, 0),
    },
    {
      key: "noTrade",
      label: COMPARE_LABEL.noTrade,
      current: cur ? (cur.noTrade ? i.yes : i.no) : null,
      offered: i.no,
      counter: cTerms.noTrade ? i.yes : i.no,
      dir: "same",
    },
    {
      key: "total",
      label: COMPARE_LABEL.total,
      current: cur ? num(currentTotal) : null,
      offered: num(offeredTotal),
      counter: num(counterTotal),
      dir: dirOf(counterTotal, offeredTotal),
    },
  ];
}
