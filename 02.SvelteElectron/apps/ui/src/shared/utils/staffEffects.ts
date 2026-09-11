/**
 * 스태프 15종 → 게임 계수 (Phase 7-5).
 *
 * **스태프 능력치를 읽는 곳은 여기 하나다.** 화면·성장·부상·시장이 각자
 * `details.manager.stats.???`를 파고들면 안 된다 — 그렇게 해서 옛 키가
 * 세 벌 돌아다녔고 15종 중 14종이 아무 계산에도 닿지 않았다(7-5 F-0).
 *
 * 수치 정본은 `players/staff_rules.json`의 `effects` 섹션이다. 여기에 표를
 * 두 번째로 적지 않는다.
 */

import type { EntityRow, EntityDetails } from "../stores/master";
import type { CoachSpecialty } from "../types/save";

/** 감독 5종 — 이름은 `staff_rules.json manager.stats`와 같다 */
export const MANAGER_STATS = [
  "tacticalIQ",
  "bullpenRead",
  "offenseMind",
  "motivator",
  "clutchDecision",
] as const;

/** 코치 5종 */
export const COACH_STATS = [
  "teaching",
  "analysis",
  "communication",
  "discipline",
  "leadership",
] as const;

/** 구단주 5종 */
export const OWNER_STATS = [
  "budgetSupport",
  "patience",
  "prInfluence",
  "facilityInvestment",
  "staffTrust",
] as const;

export type StaffStatName =
  (typeof MANAGER_STATS)[number] | (typeof COACH_STATS)[number] | (typeof OWNER_STATS)[number];

/** 팀 하나의 스태프 능력치 15종. 스태프가 없으면 전부 50 */
export type TeamStaffStats = Record<StaffStatName, number>;

export interface StaffEffectRules {
  pivot: number;
  span: number;
  /** 능력치 30↔70 사이의 **전체 폭**. 0.15면 좋은 팀이 나쁜 팀보다 15% 유리 */
  amounts: Partial<Record<StaffStatName, number>>;
}

const NEUTRAL = 50;

/** 규칙이 아직 안 실린 시점(부팅 직후)에도 게임이 돌아야 한다 */
const FALLBACK_RULES: StaffEffectRules = { pivot: 50, span: 40, amounts: {} };

let rules: StaffEffectRules = FALLBACK_RULES;

/** `staffGen.loadStaffRules()`가 읽은 규칙을 한 번 넣어준다 */
export function setStaffEffectRules(r: StaffEffectRules | undefined | null): void {
  if (r && typeof r.pivot === "number" && typeof r.span === "number") rules = r;
}

export function getStaffEffectRules(): StaffEffectRules {
  return rules;
}

/**
 * 능력치 → 배수. `1 + amount × (v − pivot) / span`.
 *
 * span 40 · amount 0.15면 능력치 30에서 0.925, 70에서 1.075 —
 * **두 팀의 차이가 15%**다. 0이나 99 같은 끝값이 폭주하지 않게 ±1.25로 자른다.
 */
export function factorOf(stat: StaffStatName, value: number): number {
  const amount = rules.amounts[stat];
  if (!amount) return 1.0;
  const norm = Math.max(-1.25, Math.min(1.25, (value - rules.pivot) / rules.span));
  return 1 + amount * norm;
}

/** 배수가 아니라 가감산이 필요한 곳(확률·주차 등)에 쓴다. `factorOf − 1` */
export function deltaOf(stat: StaffStatName, value: number): number {
  return factorOf(stat, value) - 1;
}

function neutralStats(): TeamStaffStats {
  const out = {} as TeamStaffStats;
  for (const k of [...MANAGER_STATS, ...COACH_STATS, ...OWNER_STATS]) out[k] = NEUTRAL;
  return out;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface StaffLookupOptions {
  /**
   * 이 전문 분야 코치를 먼저 본다 (주인공 훈련은 투수 코치가 정본).
   * 해당 코치가 없으면 팀 코치 평균으로 떨어진다.
   */
  specialty?: CoachSpecialty;
}

/**
 * 팀의 스태프 15종을 모은다.
 *
 * - 감독·구단주는 팀당 1명이므로 그대로
 * - 코치는 여러 명이라 **평균**이다. `specialty`를 주면 그 코치를 우선한다
 * - 코치 5종에는 구단주 `staffTrust`가 곱해진다 — 스태프를 안 믿는 구단에선
 *   좋은 코치를 데려와도 덜 먹힌다. 이게 구단주 5번째 능력치의 유일한 소비처다
 */
/**
 * 그 팀 감독의 스타일과 전술 능력치.
 *
 * 🔴 **스타일 9종이 생성·저장되고 팀 상세에 표시까지 되는데 아무것도
 *   안 바꿨다.** `staffStatsOf` 는 능력치 숫자만 내주고 스타일 문자열은
 *   버렸다 — 읽는 데가 없으니 뽑을 이유가 없었다.
 *
 * ⚠ 감독이 없으면 `null` 이다. 호출부는 중립으로 돌아야 한다.
 */
export function managerProfileOf(
  teamId: string,
  entities: readonly EntityRow[],
): { style: string | null; tacticalIQ: number; offenseMind: number; riskTolerance: number } | null {
  if (!teamId) return null;
  for (const e of entities) {
    if (e.teamId !== teamId || e.role !== "manager") continue;
    const d = e.details as EntityDetails | undefined;
    if (!d?.manager) continue;
    const st = d.manager.stats as unknown as Record<string, unknown>;
    const mg = d.manager as unknown as Record<string, unknown>;
    return {
      style: (mg.style as string) ?? null,
      tacticalIQ: num(st.tacticalIQ) ?? 50,
      offenseMind: num(st.offenseMind) ?? 50,
      riskTolerance: num(mg.riskTolerance) ?? num(st.riskTolerance) ?? 50,
    };
  }
  return null;
}

export function staffStatsOf(
  teamId: string,
  entities: readonly EntityRow[],
  opts: StaffLookupOptions = {},
): TeamStaffStats {
  const out = neutralStats();
  if (!teamId) return out;

  const coaches: EntityRow[] = [];
  let picked: EntityRow | null = null;

  for (const e of entities) {
    if (e.teamId !== teamId) continue;
    const d = e.details as EntityDetails | undefined;
    if (e.role === "manager" && d?.manager) {
      for (const k of MANAGER_STATS) {
        const v = num((d.manager.stats as unknown as Record<string, unknown>)[k]);
        if (v !== null) out[k] = v;
      }
    } else if (e.role === "owner" && d?.owner) {
      for (const k of OWNER_STATS) {
        const v = num((d.owner.stats as unknown as Record<string, unknown>)[k]);
        if (v !== null) out[k] = v;
      }
    } else if (e.role === "coach" && d?.coach) {
      coaches.push(e);
      if (opts.specialty && d.coach.specialty === opts.specialty) picked = e;
    }
  }

  const source = picked ? [picked] : coaches;
  if (source.length > 0) {
    for (const k of COACH_STATS) {
      let sum = 0;
      let n = 0;
      for (const c of source) {
        const v = num(
          ((c.details as EntityDetails).coach!.stats as unknown as Record<string, unknown>)[k],
        );
        if (v !== null) {
          sum += v;
          n++;
        }
      }
      if (n > 0) out[k] = sum / n;
    }
  }

  // 구단주 신뢰가 코치 실효치를 민다. 50이면 그대로
  const trust = factorOf("staffTrust", out.staffTrust);
  if (trust !== 1) {
    for (const k of COACH_STATS) out[k] = Math.max(1, Math.min(99, out[k] * trust));
  }

  return out;
}

/** `staffStatsOf`와 같지만 팀 참조가 아니라 리그 전체 평균이 필요할 때 */
export function neutralStaffStats(): TeamStaffStats {
  return neutralStats();
}

// ── 소비처가 받는 배수 15종 ─────────────────────────────────────
//
// 각 화면·유스케이스가 "어느 능력치가 내 축이지"를 매번 고르면 또 흩어진다.
// 배선표를 여기 한 번만 적고 소비처는 이름으로 가져간다.

export interface StaffMods {
  /** 사기 변동폭 — 감독 motivator */
  morale: number;
  /** 명성 증감폭 — 구단주 prInfluence. 스폰서 수입의 입력이다 */
  fame: number;
  /** 성장률(developmentRate) — 코치 analysis */
  devRate: number;
  /** 훈련 효율 — 코치 teaching (기존 배선과 축이 같다) */
  training: number;
  /** 시설 효율 · 부상 회복 — 구단주 facilityInvestment */
  facility: number;
  /** 부상 발생 억제 — 코치 discipline. **1보다 크면 덜 다친다** */
  injuryPrevention: number;
  /** 관계도 형성 속도 — 코치 communication */
  relation: number;
  /** 슬럼프 저항 — 코치 leadership. 1보다 크면 슬럼프에 늦게 빠지고 덜 깎인다 */
  slump: number;
  /** FA 오퍼·연봉 상한 — 구단주 budgetSupport */
  budget: number;
  /** 콜업/강등 판단 정확도 — 감독 clutchDecision */
  callup: number;
}

export function staffModsOf(
  teamId: string,
  entities: readonly EntityRow[],
  opts: StaffLookupOptions = {},
): StaffMods {
  const s = staffStatsOf(teamId, entities, opts);
  return {
    morale: factorOf("motivator", s.motivator),
    fame: factorOf("prInfluence", s.prInfluence),
    devRate: factorOf("analysis", s.analysis),
    training: factorOf("teaching", s.teaching),
    facility: factorOf("facilityInvestment", s.facilityInvestment),
    injuryPrevention: factorOf("discipline", s.discipline),
    relation: factorOf("communication", s.communication),
    slump: factorOf("leadership", s.leadership),
    budget: factorOf("budgetSupport", s.budgetSupport),
    callup: factorOf("clutchDecision", s.clutchDecision),
  };
}

/** 스태프가 없는 무대(학생·독립·군)에서 쓰는 중립값 */
export const NEUTRAL_MODS: StaffMods = {
  morale: 1,
  fame: 1,
  devRate: 1,
  training: 1,
  facility: 1,
  injuryPrevention: 1,
  relation: 1,
  slump: 1,
  budget: 1,
  callup: 1,
};
