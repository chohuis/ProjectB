/**
 * 현역 군 생활(병영) — 데이터 형식과 상태 (docs/PLAN_MILITARY_LIFE.md 4부).
 *
 * 값(수치)은 여기 없다 — `resource/data/master/military/rules.json` 이 정본이다
 * (수치를 코드에 두 번 적지 않는다 · CLAUDE.md). 여기는 **모양**만 정한다.
 *
 * 내용(부대·부대원·캘린더·이벤트 문안)은 전부 사용자 데이터다 — A 는 한 줄도 짓지 않는다.
 * 검사는 `npm run check:militarydata`.
 */

export type MilitaryRoleId = "signal" | "mortar";
export type MilitaryMemberRole = "officer" | "senior" | "peer" | "junior";
/** 이번 주 남는 시간 — 공을 만진다 · 사람과 지낸다 · 쉰다 (§27) */
export type MilitaryWeekChoice = "ball" | "people" | "rest";

/** `military/unit.json` — 부대 하나 (§20 · §37) */
export interface MilitaryUnitRole {
  id: MilitaryRoleId;
  label: string;
  /** 주인공이 속하는 소단위 — 사람 카드 대상 가중 2배의 기준 (§26) */
  subunit: string;
  /** 1~5 · 주간 피로 폭 */
  dutyIntensity: number;
  /** 0~3 · 야구 감각이 오를 수 있는 상한 · 0 이면 공 카드가 없다 */
  ballAccess: number;
}
export interface MilitaryUnit {
  id: string;
  name: string;
  location: string;
  flavor: string;
  roles: MilitaryUnitRole[];
  /** "random" 이면 W6 에 씨앗으로 반반 (사용자 확정 §35) · 그 밖은 디버그·2회차용 고정 */
  roleAssign: "random" | MilitaryRoleId;
}

/** `military/members.json` — 부대원 한 장 (§37) */
export interface MilitaryMember {
  id: string;
  name: string;
  rank: string;
  role: MilitaryMemberRole;
  subunit: string;
  trait: string;
  /** −100~100 · 기존 relations 축과 같은 척도 */
  relationStart: number;
  /** 복무 주 0~100 · joinWeek ≤ W < leaveWeek 일 때 재적 */
  joinWeek: number;
  leaveWeek: number;
  /** 동작 훅 — decides_leave · grades_perf:signal|mortar · ball_partner · mentor:signal|mortar */
  tags: string[];
}

/** `military/calendar.json` — 고정 주 사건 (§29) · 한 주 한 사건 · 확률 밖 */
export interface MilitaryCalendarEntry {
  week: number;
  /** military_life 풀의 이벤트 id */
  event: string;
  label: string;
  leaveDays?: number;
  fatigue?: number;
  ballDelta?: number;
  /** 그 주는 선택 카드가 없다 (혹한기·유격·진지 공사) */
  noChoice?: boolean;
  /** 한 보직에만 뜬다 · 없으면 둘 다 */
  role?: MilitaryRoleId | null;
}

/** §28 조건 어휘 — 검사가 이 밖의 type 을 거부한다 */
export const MILITARY_CONDITION_TYPES = [
  "week_between", "rank", "role",
  "relation_gte", "relation_lte",
  "ballSense_gte", "ballSense_lte",
  "fatigue_gte", "fatigue_lte",
  "morale_gte", "morale_lte",
  "member_present", "season_month", "leave_recent",
] as const;
export type MilitaryConditionType = typeof MILITARY_CONDITION_TYPES[number];
export interface MilitaryCondition {
  type: MilitaryConditionType;
  value?: number | string;
  from?: number;
  to?: number;
  member?: string;
}

/** 선택지 효과 — 전부 선택 · 능력치(statDelta)는 현역에서 **없다** (§28) */
export interface MilitaryLifeChoice {
  id: string;
  label: string;
  effectHint?: string;
  relationDelta?: number;
  fatigueDelta?: number;
  moraleDelta?: number;
  ballDelta?: number;
  award?: string;
  penalty?: string;
  leaveDays?: number;
  /** 성과 판정 tier 보정 (성실 −1 등 · §36-1) */
  perfTierDelta?: number;
}

/** 성과 이벤트 — "경기" 대체 (§17 · §28) */
export type MilitaryPerfKind = "fire" | "signal_eval" | "inspection";

/** `events/pools/military_life.json` 의 한 건 — 기존 MilitaryEvent 위에 넷을 더한다 (§28) */
export interface MilitaryLifeEvent {
  id: string;
  title: string;
  description: string;
  minRank?: number;
  maxRank?: number;
  once?: boolean;
  /** 캘린더가 띄우는 필수 이벤트 — 랜덤 뽑기에서 제외 */
  calendar?: boolean;
  /** 이 주 안에는 다시 안 뜬다 · 기본은 rules.event.defaultCooldown */
  cooldownWeeks?: number;
  /** 뽑힐 가중 · 기본 1 */
  weight?: number;
  /** 이 부대원이 재적 중일 때만 · 문안이 그를 가리킨다 */
  member?: string;
  /** 보직 전용 · 없으면 공통 */
  roleTag?: MilitaryRoleId;
  perf?: MilitaryPerfKind;
  conditions?: MilitaryCondition[];
  choices: MilitaryLifeChoice[];
}

/** `military/rules.json` — 수치 정본 (§26 · §9 · §10 · §35 제안값 1차) */
export interface MilitaryLifeRules {
  serviceWeeks: number;
  bootCampWeeks: number;
  /** 계급 띠 상한 주 — [8, 34, 60] : 0=이병 1=일병 2=상병 3=병장 */
  rankBandWeeks: number[];
  ballSense: {
    start: number; startPro: number; startStudent: number;
    weeklyDecay: number;
    /** ballAccess 0~3 → 공 카드 증가 */
    gainByAccess: number[];
    /** 상한 = 100 − capPerAccessGap × (3 − ballAccess) */
    capPerAccessGap: number;
    leaveGain: number;
    hardWeekLoss: number;
  };
  fatigue: {
    /** dutyIntensity 0~5 → 주간 base */
    baseByIntensity: number[];
    choice: Record<MilitaryWeekChoice, number>;
    natural: number;
    leave: number;
  };
  morale: {
    choice: Partial<Record<MilitaryWeekChoice, number>>;
    leave: number;
  };
  relation: {
    weeklyDecay: number;
    /** 계급 띠 0~3 → 사람 카드 폭 */
    peopleByBand: number[];
    sameSubunitWeight: number;
    rewardLeaveOfficerSum: number;
  };
  event: {
    weeklyChance: number;
    defaultCooldown: number;
  };
  perf: {
    bandCoef: number;
    relationCoef: number;
    fatigueThreshold: number;
  };
  /** 전역 환산 — ballSense 하한별 · 위에서부터 첫 일치 (§9) */
  discharge: Array<{ minSense: number; statDelta: number; velocityDelta?: number; recoveryWeeks: number }>;
}

/** 세이브 상태 (§24) — 현역만 · 상무는 ballSense 100 고정 · roleId null */
export interface MilitaryLifeState {
  unitId: string;
  roleId: MilitaryRoleId | null;
  /** 보직 아크 0~3 (§38-1) */
  arcStage: number;
  ballSense: number;
  /** memberId → −100~100 */
  relations: Record<string, number>;
  /** leaveWeek 지난 부대원 — 재회용 */
  frozen: Record<string, number>;
  calendarDone: string[];
  /** eventId → 마지막으로 뜬 복무 주 */
  cooldown: Record<string, number>;
  choiceLog: Array<{ week: number; choice: MilitaryWeekChoice | null }>;
  /** 병역 탭에서 미리 고른 이번 주 선택 · 없으면 "쉰다" (§35) */
  nextChoice: MilitaryWeekChoice | null;
  leaveDays: number;
  awards: Array<{ week: number; id: string }>;
  penalties: Array<{ week: number; id: string }>;
  perf: Array<{ week: number; id: string; tier: number; note: string }>;
  /** 4주마다 ballSense 표본 — 경력 탭 곡선 */
  senseCurve: number[];
}

/** 전역 때 접는 "군 경력 한 장" (§30) — 인생 기록 화면 · 재회 이벤트가 읽는다 */
export interface MilitaryRecord {
  unitId: string;
  unitName: string;
  roleId: MilitaryRoleId | null;
  roleLabel: string;
  arcLabel: string;
  finalBallSense: number;
  leaveDays: number;
  awards: Array<{ week: number; id: string }>;
  penalties: Array<{ week: number; id: string }>;
  perf: Array<{ week: number; id: string; tier: number; note: string }>;
  /** 관계 상위 셋 — 재회 후보 */
  topRelations: Array<{ memberId: string; name: string; value: number }>;
  senseCurve: number[];
  /** 전역 환산 — 무엇이 얼마나 깎였나 (화면·소식이 그대로 적는다) */
  conversion: { statDelta: number; velocityDelta: number; recoveryWeeks: number };
}

export function emptyMilitaryLife(unitId: string, ballSense: number): MilitaryLifeState {
  return {
    unitId, roleId: null, arcStage: 0, ballSense,
    relations: {}, frozen: {}, calendarDone: [], cooldown: {},
    choiceLog: [], nextChoice: null, leaveDays: 0,
    awards: [], penalties: [], perf: [], senseCurve: [],
  };
}

/** 계급 띠 — 코드 띠(8/34/60) 그대로 · rules.rankBandWeeks 가 정본 */
export function rankBandOf(serviceWeeks: number, bands: readonly number[]): number {
  let band = 0;
  for (const upper of bands) { if (serviceWeeks > upper) band++; }
  return Math.min(band, bands.length);
}
