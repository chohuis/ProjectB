/**
 * 개인 재정 (Phase 7-5 F-3).
 *
 * **계산은 전부 Rust `finance.rs`가 한다.** 여기는 규칙 로드 + 상태 패치만이다.
 * 예전 `FinancePage.svelte`는 Svelte 컴포넌트 안에서 OVR·사기로 수입을 즉석
 * 계산해 `money`와 무관한 숫자를 보여주고 있었다 (CLAUDE.md "화면에 게임 로직
 * 금지" 위반).
 *
 * **단위는 만원이다** — `money`·연봉·계약금·치료비가 같은 단위다.
 */

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { seasonStore } from "../stores/season";
import { seedOf } from "../utils/seedOf";
import { isMeasureMode } from "../utils/measureMode";
import { staffModsOf } from "../utils/staffEffects";
import { facilityTierOf } from "../utils/ids";
import type { ProtagonistSave } from "../types/save";

// ── 규칙 ──────────────────────────────────────────────────────

export interface FinanceRulesFile {
  stages: Record<string, { income: number; expense: number; label: string }>;
  tax: {
    brackets: { until: number; rate: number }[];
    otherIncomeRate: number;
    studentExempt: boolean;
  };
  sponsor: {
    proOnly: boolean;
    maxTotalPct: number;
    categories: { id: string; name: string; fameMin: number; pctMin: number; pctMax: number; termYears: number }[];
    fameSpan: number;
    minSalaryBase: number;
  };
  training: {
    areas: { id: string; name: string; target: string }[];
    tiers: { tier: number; weeklyCost: number; bonus: number; name: string }[];
    teamResourceInverse: number;
  };
  investment: {
    proOnly: boolean;
    minCash: number;
    options: { id: string; name: string; mean: number; sd: number; floor: number; desc: string }[];
  };
  luxury: {
    teammateRelationPerCost: number;
    selfFamePerCost: number;
    selfFameSplitDiligence: number;
  };
}

let cached: FinanceRulesFile | null = null;

export async function loadFinanceRules(): Promise<FinanceRulesFile> {
  if (cached) return cached;
  const raw = (await window.projectB!.masterFetch("players/generation_rules.json")) as
    { financeRules?: FinanceRulesFile } | null;
  if (!raw?.financeRules) {
    throw new Error("[finance] generation_rules.json financeRules 없음 — Phase 7-5 데이터 필요");
  }
  cached = raw.financeRules;
  return cached;
}

/** 테스트·슬롯 전환용 */
export function resetFinanceRulesCache(): void { cached = null; }

// ── 저장 상태 ─────────────────────────────────────────────────

/** 계약된 스폰서 한 건 */
export interface SponsorContract {
  categoryId: string;
  name: string;
  /** 연 금액 (만원) */
  annual: number;
  /** 이 시즌까지 유효 */
  untilSeason: number;
}

export interface FinanceState {
  sponsors: SponsorContract[];
  /** 구독 중인 개인 트레이닝 */
  subscriptions: { areaId: string; tier: number }[];
  /** 시즌말 투자 이력 — 은퇴 화면이 읽는다 */
  investments: {
    season: number; optionId: string; name: string;
    principal: number; rate: number; profit: number;
  }[];
  /** 누적 납세액 (표시용) */
  taxPaid: number;
  /** 마지막으로 스폰서 오퍼를 낸 시즌 — 한 시즌에 한 번만 */
  lastOfferSeason: number;
}

export const EMPTY_FINANCE: FinanceState = {
  sponsors: [], subscriptions: [], investments: [], taxPaid: 0, lastOfferSeason: 0,
};

export function financeOf(p: ProtagonistSave): FinanceState {
  return { ...EMPTY_FINANCE, ...(p.finance ?? {}) };
}

/** 유효한 스폰서의 연 수입 합 */
export function sponsorAnnualOf(f: FinanceState, seasonYear: number): number {
  return f.sponsors
    .filter((s) => s.untilSeason >= seasonYear)
    .reduce((a, s) => a + s.annual, 0);
}

// ── 엔진 호출 ─────────────────────────────────────────────────

async function engine<T>(fn: string, params: unknown): Promise<T> {
  const raw = await window.projectB!.engine(fn, JSON.stringify(params));
  const out = JSON.parse(raw) as T & { error?: string };
  if (out?.error) throw new Error(`[finance] ${fn}: ${out.error}`);
  return out;
}

export interface FinanceLine { label: string; amount: number }

export interface WeeklyFinance {
  income: FinanceLine[];
  expense: FinanceLine[];
  grossWeekly: number;
  taxWeekly: number;
  expenseWeekly: number;
  netWeekly: number;
  grossAnnual: number;
  taxAnnual: number;
  effectiveTaxRate: number;
}

/**
 * 주간 수입·지출·세금. `advanceWeek`이 이 `netWeekly`를 `money`에 더한다.
 *
 * 예전 `calc_weekly_net`은 무대별 상수 표가 Rust 안에 박혀 있었다 —
 * 규칙 파일 밖이라 조정하려면 재컴파일이 필요했다.
 */
export async function calcWeeklyFinance(p: {
  protagonist: ProtagonistSave;
  seasonYear: number;
  treatmentWeekly?: number;
}): Promise<WeeklyFinance> {
  const rules = await loadFinanceRules();
  const f = financeOf(p.protagonist);
  return engine<WeeklyFinance>("calcWeeklyFinanceNative", {
    rules,
    careerStage: p.protagonist.careerStage,
    salary: p.protagonist.contract?.salary ?? null,
    sponsorAnnual: sponsorAnnualOf(f, p.seasonYear),
    subscriptions: f.subscriptions,
    treatmentWeekly: p.treatmentWeekly ?? 0,
  });
}

export interface SponsorOffer {
  categoryId: string; name: string; annual: number;
  termYears: number; pctOfSalary: number;
}

/** 명성 연동 스폰서 오퍼. 구단주 홍보력이 금액을 민다 (§7-5 F-1) */
export async function calcSponsorOffers(p: {
  protagonist: ProtagonistSave;
  seasonYear: number;
}): Promise<{ offers: SponsorOffer[]; totalAnnual: number; capped: boolean }> {
  const rules = await loadFinanceRules();
  const f = financeOf(p.protagonist);
  const mods = staffModsOf(p.protagonist.teamId ?? "", get(masterStore).entities);
  return engine("calcSponsorOffersNative", {
    rules: rules.sponsor,
    fame: p.protagonist.fame,
    salary: p.protagonist.contract?.salary ?? null,
    careerStage: p.protagonist.careerStage,
    prMod: mods.fame,
    signedCategoryIds: f.sponsors
      .filter((s) => s.untilSeason >= p.seasonYear)
      .map((s) => s.categoryId),
  });
}

export interface TrainingBonusResult {
  byArea: { areaId: string; tier: number; base: number; effective: number }[];
  weeklyCost: number;
  inverseFactor: number;
}

/**
 * 개인 트레이닝 구독 보너스 — **팀 자원에 반비례**한다 (DESIGN §7.3).
 *
 * 이게 성립하려면 스태프 15종 배선이 선행돼야 했다 (F-1). 팀 시설 계수는
 * 리그 기본값 × 구단주 `facilityInvestment`다.
 */
export async function calcTrainingBonus(p: {
  protagonist: ProtagonistSave;
}): Promise<TrainingBonusResult> {
  const rules = await loadFinanceRules();
  const f = financeOf(p.protagonist);
  const m = get(masterStore);
  const teamRef = m.teams.find((t) => t.id === p.protagonist.teamId);
  const mods = staffModsOf(p.protagonist.teamId ?? "", m.entities);
  // 리그 기본 시설 × 구단주 투자. 학생 무대는 구단주가 없어 1.0이 온다
  const leagueBase = teamRef ? LEAGUE_FACILITY[facilityTierOf(teamRef.leagueId)] ?? 1.0 : 1.0;
  return engine<TrainingBonusResult>("calcTrainingBonusNative", {
    rules: rules.training,
    subscriptions: f.subscriptions,
    teamFacility: leagueBase * mods.facility,
  });
}

/**
 * 리그별 시설 기준값. Rust `facility_factor`와 **같은 축**이지만 스케일이 다르다
 * — 저쪽은 NPC 성장 계수(0.78~1.08), 이쪽은 개인 트레이닝 반비례의 입력이다.
 * 1.0을 중립으로 두고 프로 1군이 가장 좋다.
 */
const LEAGUE_FACILITY: Record<string, number> = {
  "1군": 1.15, "2군": 1.00, "대학": 0.95, "고교": 0.90, "독립": 0.85,
};

export interface InvestmentResult {
  optionId: string; name: string; principal: number;
  rate: number; profit: number; payout: number;
}

/** 시즌말 투자 정산. 원금 손실 가능 (2026-07-31 사용자 확정) */
export async function resolveInvestment(p: {
  optionId: string;
  amount: number;
  seasonYear?: number;
}): Promise<InvestmentResult> {
  const rules = await loadFinanceRules();
  // 🔴 **계측 모드에서만 씨앗을 넘긴다** (사용자 확정 2026-09-07). `finance.rs
  //   resolve_investment` 이 `thread_rng` 라 같은 세이브를 다시 열어도 수익이
  //   달랐다 — 계측에서는 그게 노이즈가 된다. 실제 플레이는 안 넘기므로
  //   0(= 씨앗 없음)이 되어 예전 그대로 굴린다.
  const s = get(seasonStore);
  const seed = isMeasureMode()
    ? seedOf(s.worldSeed ?? 0, p.seasonYear ?? s.seasonYear, p.optionId, "investment")
    : 0;
  return engine<InvestmentResult>("resolveInvestmentNative", {
    rules: rules.investment, optionId: p.optionId, amount: p.amount, seed,
  });
}

export interface LuxuryResult { cost: number; relationDelta: number; fameDelta: number }

/** 사치품 — 동료면 관계도, 자기 소비면 성격에 따라 명성 ± */
export async function calcLuxury(p: {
  cost: number; onTeammate: boolean; diligence: number;
}): Promise<LuxuryResult> {
  const rules = await loadFinanceRules();
  return engine<LuxuryResult>("calcLuxuryNative", {
    rules: rules.luxury, cost: p.cost, onTeammate: p.onTeammate, diligence: p.diligence,
  });
}

// ── 상태 변경 ─────────────────────────────────────────────────

function patchFinance(fn: (f: FinanceState) => FinanceState): void {
  gameStore.patchFinance(fn);
}

/** 스폰서 계약 체결 — 계약금은 기타소득이라 세후로 들어온다 */
export async function signSponsor(offer: SponsorOffer, seasonYear: number): Promise<void> {
  patchFinance((f) => ({
    ...f,
    sponsors: [
      ...f.sponsors,
      {
        categoryId: offer.categoryId,
        name: offer.name,
        annual: offer.annual,
        untilSeason: seasonYear + Math.max(1, offer.termYears) - 1,
      },
    ],
  }));
}

/**
 * 구독 토글. 같은 분야를 다시 누르면 단계가 오르고, 최고 단계에서 누르면 해지된다
 * — 가계부 화면 없이 토글 하나로 지출을 조작한다는 DESIGN §7.3 원칙이다.
 */
export async function toggleSubscription(areaId: string): Promise<void> {
  const rules = await loadFinanceRules();
  const maxTier = Math.max(...rules.training.tiers.map((t) => t.tier));
  patchFinance((f) => {
    const cur = f.subscriptions.find((s) => s.areaId === areaId);
    if (!cur) {
      return { ...f, subscriptions: [...f.subscriptions, { areaId, tier: 1 }] };
    }
    if (cur.tier >= maxTier) {
      return { ...f, subscriptions: f.subscriptions.filter((s) => s.areaId !== areaId) };
    }
    return {
      ...f,
      subscriptions: f.subscriptions.map((s) =>
        s.areaId === areaId ? { ...s, tier: s.tier + 1 } : s),
    };
  });
}

/** 시즌말 투자 실행 — 원금을 빼고 결과를 더한다 */
export async function applyInvestment(p: {
  optionId: string; amount: number; seasonYear: number;
}): Promise<InvestmentResult> {
  const res = await resolveInvestment(p);
  gameStore.applyInvestmentResult({
    season: p.seasonYear, optionId: res.optionId, name: res.name,
    principal: res.principal, rate: res.rate, profit: res.profit,
  });
  return res;
}

/** 만료된 스폰서를 정리한다. 시즌 종료에서 부른다 */
export function expireSponsors(seasonYear: number): SponsorContract[] {
  const g = get(gameStore);
  const f = financeOf(g.protagonist);
  const expired = f.sponsors.filter((s) => s.untilSeason < seasonYear);
  if (expired.length === 0) return [];
  patchFinance((cur) => ({
    ...cur,
    sponsors: cur.sponsors.filter((s) => s.untilSeason >= seasonYear),
  }));
  return expired;
}

/**
 * 은퇴 화면이 쓰는 최종 자산. **등급 없이 숫자만** (DESIGN §7.3) —
 * 인생을 점수로 매기는 화면이 아니다.
 */
export function finalAssets(p: ProtagonistSave): {
  cash: number; totalInvested: number; totalProfit: number; taxPaid: number;
} {
  const f = financeOf(p);
  return {
    cash: p.money,
    totalInvested: f.investments.reduce((a, i) => a + i.principal, 0),
    totalProfit: f.investments.reduce((a, i) => a + i.profit, 0),
    taxPaid: f.taxPaid,
  };
}
