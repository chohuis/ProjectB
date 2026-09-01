import { MONTH_STARTS_1 } from "../utils/seasonCalendar";
﻿import { derived, writable } from "svelte/store";
import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, DecisionTemplateOption } from "../types/event";
import type { CareerStage, CoachAttributes, CoachSpecialty } from "../types/save";
import type { DecisionEffect } from "../types/main";
import type { RelationKind } from "../types/relationship";
import { validateTeamRefs, primeTeamLeagueMap, primeHsRegionMap } from "../utils/ids";
import { language } from "../i18n";
import {
  KBL_TEAMS, ABL_TEAMS, JBL_TEAMS,
  KBL_FARM_TEAMS, ABL_FARM_TEAMS, JBL_FARM_TEAMS,
  UNIV_TEAMS, IND_TEAMS, HS_ALL_TEAMS,
} from "../utils/leagueScheduler";
import { HS_REGIONS } from "../utils/leagueTeams.generated";
import { buildMarkIndex } from "../utils/teamMark";
import { primeForeignRules } from "../utils/foreignSlots";
import { primeCareerScoreRules } from "../utils/universityUtils";
import { primeAcademicsHsRules } from "../utils/academicsEngine";
import { primeRosterOpsRules } from "../utils/rosterEngine";
import { primeManagerStyleRules } from "../utils/managerStyle";
import { primeTraitDisplay } from "../utils/playerTraits";
import { primePitchCost } from "../utils/pitchCost";
import { NUM_PATHS, EQ_PATHS } from "../utils/eventPaths";

export type { CoachAttributes, CoachSpecialty };

// ── 훈련·구종 ──────────────────────────────────────────────────────────────────
/**
 * 훈련 프로그램 — **정본은 `resource/data/master/training/programs.json` 하나다.**
 *
 * 화면(훈련 카드·일정)도 엔진(Rust 성장 계산)도 여기서 읽는다. 예전엔 같은 표가
 * 네 곳에 있었고 넷이 서로 달라서, 화면은 "피로 +7"이라 하고 엔진은 −4.25를
 * 적용했다 — 부호가 반대였다.
 *
 * 게이트: `npm run check:trainingtable`
 */
export interface TrainingProgram {
  id: string;
  name: string;
  /** "pitcher" | "batter" | "both" — 화면이 주인공 유형으로 거른다 */
  playerType: "pitcher" | "batter" | "both";
  /** 코치 담당영역 조회 키 (relationship_rules.training_area) */
  focus: string;
  focusLabel: string;
  gainsLabel: string;
  gainsPitching?: Record<string, number>;
  gainsBatting?: Record<string, number>;
  baseXp: number;
  fatigueCost: number;
  conditionCost: number;
  isRecovery?: boolean;
  isPitchDev?: boolean;
  progressPerWeek?: number;
}

export interface PitchEntry {
  id: string;
  name: string;
  nameKo?: string;
  group: string;
  /** 몸에 넣는 동안 제구가 흔들리는 정도 (0~3). 0이면 안 흔들린다 */
  formDifficulty?: number;
  unlockRuleId: string;
}

/**
 * 구종 해금 조건. **정본은 `training/pitch_unlock_rules.json` 이다.**
 *
 * 🔴 `"multi_stat"` 이 빠져 있었다 (2026-09-01 · 트랙 C 가 잡았다).
 * 데이터 10건 중 **3건**이 그 타입이고 화면(`TrainingPage`)은 이미 제대로
 * 처리한다 — **타입만 뒤처져 있었다.**
 *
 * ```json
 *   { "id": "PITCH_UNLOCK_CUTTER", "type": "multi_stat",
 *     "params": { "conditions": [ {"stat":"command","value":52},
 *                                 {"stat":"velocity","value":68} ] } }
 * ```
 *
 * ⚠ **타입을 데이터에 맞춘 것이지 동작을 바꾼 게 아니다.** 런타임은 원래
 *   맞게 돌고 있었고 `svelte-check` 오류 6건만 나고 있었다.
 */
export interface PitchUnlockRule {
  id: string;
  type: "always" | "min_stat" | "multi_stat";
  params: {
    stat?: string;
    value?: number;
    /** `multi_stat` 전용 — 전부 만족해야 해금이다 */
    conditions?: { stat: string; value: number }[];
  };
}

// ?? refs ???(refs.json 援ъ“) ?????????????????????????????????
export interface LeagueRef {
  id: string;
  name: string;
  nameEn?: string;
}

export interface SchoolRef {
  id: string;
  name: string;
  nameEn?: string;
}

/** 구장 — 고교 권역 키가 구장 ID라 **권역 표시명의 원천**이기도 하다 */
export interface StadiumRef {
  id: string;
  name: string;
  parkFactor?: string;
  /** **수용인원** (4-A · 2026-08-29). 관중 수입의 유일한 근거다.
   *  🔴 예전엔 필드 자체가 없었고, 팀 쪽 `capacity`도 ABL·JBL만 있었다 */
  capacity?: number;
  /**
   * 담장 — 좌·중·우 거리(m)와 펜스 높이(m).
   *
   * 🔴 중앙 거리는 예전에도 있었지만 **성격별 한 값씩**이었고
   *   (타자친화 100 · 중립 110 · 투수친화 122) **아무도 안 읽었다.**
   * ⚠ 안 넘기면 엔진이 중립 기본값을 쓴다 — 27개를 채워 놓고도
   *   같은 야구를 하게 된다.
   */
  dist?: { lf: number; cf: number; rf: number; fence: number };
}

export interface ClubRef {
  id: string;
  name: string;
  nameEn?: string;
  leagueId: string;
}

export interface TeamProfile {
  style?: string;
  desc?: string;
  tags?: string[];
  strengths?: string[];
  funding?: "최하" | "하" | "중" | "상" | "최상";
  difficulty?: "최하" | "하" | "중" | "상" | "최상";
  prestige?: "S" | "A" | "B" | "C" | "D";
  fanBase?: "메가" | "전국" | "광역" | "지역" | "소규모";
  facilityLevel?: 1 | 2 | 3 | 4 | 5;
  atmosphere?: "체계적" | "엄격" | "균형" | "자유로운" | "가족적";
  mediaPressure?: "낮음" | "보통" | "높음" | "매우높음";
  promoChance?: "낮음" | "보통" | "높음";
}

export interface ProTeamProfile {
  ownerSpendingWillingness: number;
  stability: number;
  developmentFocus: number;
  discipline: number;
  ownerPatience: number;
  winNowPressure: number;
  scoutingQuality: number;
  prestige: number;
  marketAppeal: number;
  clubhouseCulture: number;
  medicalQuality: number;
  farmInvestment: number;
}

/**
 * 팀 고정 세계관 (DESIGN §7.1) — refs.json `teams[].history`와 1:1.
 *
 * Phase 5-1에서 refs를 시드 CSV로 다시 만들며 모양이 바뀌었는데 타입과 화면이
 * v1(founded·nationalTitles·recentRecords·rival)에 남아 있었다. 전부 optional이라
 * tsc가 못 잡았고, 팀 상세는 빈 값을 보여주고 **새 게임 팀 선택은 렌더가 터졌다**
 * (`recentRecords.length` = undefined.length). v1 필드는 읽는 코드가 없어져 제거.
 */
export interface TeamHistory {
  foundedYear?: number | null;
  budget?: number | null;
  /** **모기업** (4-A · 2026-08-29).
   *
   * ⚠ **이름만 둔다.** 지원 규모는 `budget`에서 유도한다 — 이 저장소의
   *   원칙이다("새 밸런스 수치를 만들지 않는다").
   * ⚠ `clubs`(36개)는 **구 데이터**다 — KBL 8개고 팀 이름과도 안 맞는다.
   *   그래서 여기(`budget`이 있는 자리)에 붙였다. */
  parentCompany?: string;
  /** 과거 5시즌 순위 ("S-1" = 직전 시즌) — 첫 시즌 대회 시드의 근거 */
  seasonRanks?: { season: string; rank: number }[];
  titles?: { season: string; competition: string; result: string }[];
  rivals?: { with: string; desc: string }[];
}

export interface TeamRef {
  id: string;
  name: string;
  nameEn?: string;
  leagueId: string;
  clubId?: string;
  schoolId?: string;
  tier?: string;
  stadium?: string;
  city?: string;
  colors?: [string, string];
  capacity?: number;
  /** 전력★ 1~5 — 고정 세계관 (DESIGN §7.1). 예산·로스터 규모·대회 시드의 기준 */
  power?: number;
  traits?: { philosophy?: string; resource?: string; status?: string };
  colorLabel?: string;
  profile?: TeamProfile;
  proTeamProfile?: ProTeamProfile;
  history?: TeamHistory;
}

// ── 인물 엔티티 상세 타입 ──────────────────────────────────────
// 스태프 능력치 15종. **정본은 `players/staff_rules.json`의 `stats` 배열 하나**다 —
// 여기 이름이 그 배열과 다르면 값이 조용히 undefined가 된다.
//
// 고치기 전엔 이 타입이 옛 5종(motivation/development/strategy/handlePressure/
// handlePersonnel + injuryMgmt)을 들고 있었고 staffGen은 새 5종을 쓰고 있었다.
// 그래서 감독 능력치가 **매치엔진에 4종·성장에 1종·부상관리에 1종 전부 미전달**이었다
// (JSON.stringify가 undefined 키를 지워 Rust는 기본값을 썼다).
export interface EntityManagerStats {
  /** 전술 판단 — 매치엔진 */
  tacticalIQ: number;
  /** 불펜 운용 — 매치엔진 */
  bullpenRead: number;
  /** 타선 운용 — 매치엔진 */
  offenseMind: number;
  /** 동기부여 — 주간 성장 XP · 사기 회복 */
  motivator: number;
  /** 승부처 판단 — 매치엔진 · 콜업 정확도 */
  clutchDecision: number;
}

export interface EntityManagerDetails {
  style: string;
  experienceYears: number;
  stats: EntityManagerStats;
  gamePlanBias: string;
  riskTolerance: number;
}

export interface EntityCoachStats {
  /** 지도력 — 훈련 효율 */
  teaching: number;
  /** 분석력 — 잠재력 발현 · 상대 분석 */
  analysis: number;
  /** 소통 — 관계도 형성 · 사기 */
  communication: number;
  /** 관리 — 부상 예방(피로 누적 억제) */
  discipline: number;
  /** 통솔 — 팀 폼 안정 · 슬럼프 탈출 */
  leadership: number;
  /** 연차 1~5 등급. 능력치가 아니라 표시용 */
  experience: number;
}

export interface EntityOwnerStats {
  /** 예산 지원 — FA 오퍼 · 연봉 협상 상한 */
  budgetSupport: number;
  /** 인내 — 감독 경질 임계 */
  patience: number;
  /** 홍보력 — 주인공 명성 증가율 → 스폰서 수입 */
  prInfluence: number;
  /** 시설 투자 — 훈련 효율 · 부상 회복 속도 */
  facilityInvestment: number;
  /** 스태프 신뢰 — 코치 능력치 실효 배수 */
  staffTrust: number;
}

export interface EntityOwnerDetails {
  ownershipStyle: string;
  tenureYears: number;
  stats: EntityOwnerStats;
}

export interface EntityCoachDetails {
  specialty: CoachSpecialty | "-";
  experienceYears: number;
  stats: EntityCoachStats;
  trainingBuffs: string;
}

export interface NpcContract {
  salary: number;
  durationYears: number;
  remainingYears: number;
  signingBonus: number;
  teamOptionYears: number;
  playerOptionYears: number;
  noTrade: boolean;
  status: "active" | "expired";
}

export interface EntityPlayerDetails {
  playerType: "pitcher" | "batter" | "twoWay";
  /**
   * ⚠ `"L" | "R"`로 좁혀 놨었는데 **주인공 타입은 `Handedness`(양손 `"S"` 포함)다.**
   * 그래서 주인공을 로스터 행으로 만들 때마다 타입이 안 맞았다.
   * 지금 Rust는 L·R만 만들지만 화면(`game.ts`)은 이미 "양투/양타"를 그린다 —
   * 좁은 쪽이 사실과 달랐다.
   */
  handedness: import("../types/save").Handedness;
  position: string;
  jerseyNumber: number;
  pitching: import("../types/save").PitchingAttributes;
  batting: import("../types/save").BattingAttributes;
  positionRatings?: import("../types/save").PositionRatings;
  primaryPosition?: import("../types/save").PositionKey;
  diligence?: number;
  popularity?: number;
  developmentRate: number;
  potentialHidden: number;
  proServiceYears?: number;
  militaryEnlistYear?: number;
  militaryStatus?: "미필" | "현역" | "군필" | "면제";
  militaryUnit?: "sports" | "general";
  originalLeagueId?: string;
  originalTeamId?: string;
  contract?: NpcContract;
  pitches?: import("../types/save").PitchEntry[];
}

export interface EntityDetails {
  player: EntityPlayerDetails;
  coach:   EntityCoachDetails   | null;
  manager: EntityManagerDetails | null;
  owner:   EntityOwnerDetails      | null;
}

// ── 인물 엔티티 타입 (people_*.json 구조) ─────────────────────
export interface EntityRow {
  id: string;
  name: string;
  nameEn?: string;
  role: "player" | "coach" | "manager" | "owner";
  age: number;
  status: "active" | "inactive" | "retired" | "injured" | "military";
  originLeagueId: string;
  leagueId: string;
  clubId: string;
  teamId: string;
  tier?: string;
  schoolId: string;
  grade?: number;
  notes: string;
  militaryStatus?: "미필" | "현역" | "군필" | "면제";
  /**
   * 국적. 없으면 "KOR"로 읽는다(구 세이브).
   *
   * ⚠ **국가대표 발탁이 이걸 봐야 한다.** 예전엔 필드가 없어서
   * `militaryStatus !== "현역"`만 걸렀는데, 외국인은 "면제"라 그 조건을 통과한다.
   * KBL에 외국인이 들어온 뒤로는 한국 국가대표에 외국인이 뽑힌다.
   */
  nationality?: string;
  personality?: import("../types/save").NpcPersonality;
  entryYear?:   number;
  entryLeague?: string;
  entryTeam?:   string;
  entryAge?:    number;
  details: EntityDetails;
}

// ── NPC 라이브 스탯 ─────────────────────────────────────────────────────────────
export interface NpcLiveStat {
  pitching?: import("../types/save").PitchingAttributes;
  batting?:  import("../types/save").BattingAttributes;
  pitchingXp?:         Record<string, number>;
  battingXp?:          Record<string, number>;
  seasonStartPitching?: import("../types/save").PitchingAttributes;
  seasonStartBatting?:  import("../types/save").BattingAttributes;
  peakOvr?: number;
}
export type NpcLiveStats = Record<string, NpcLiveStat>;

// ── 군 이벤트 ─────────────────────────────────────────────────
export interface MilitaryEvent {
  id: string;
  title: string;
  description: string;
  minRank?: number;
  /**
   * ⚠ **효과 필드를 여기 다시 나열하지 않는다.** 예전엔 `moraleDelta`·
   * `fatigueDelta`·`xp`·`statDelta` 넷만 선언돼 있어서, 데이터에 성실도나
   * 명성을 넣어도 **타입에 없어 파싱 단계에서 사라졌다** — 에러 없이
   * 아무 일도 안 일어난다. 정본은 `DecisionEffect` 하나다.
   */
  choices?: Array<{
    id: string;
    label: string;
    effectHint?: string;
  } & import("../types/main").DecisionEffect>;
  moraleDelta?: number;
  fatigueDelta?: number;
}

// ── 스토어 상태 ─────────────────────────────────────────────────────────────────
export interface MasterState {
  loaded: boolean;
  trainingPrograms: TrainingProgram[];
  pitchCatalog: PitchEntry[];
  /**
   * 한 투수가 보유할 수 있는 구종 수 상한.
   *
   * ⚠ 예전엔 `TrainingPage.svelte`에 `const MAX_PITCHES = 5`로 박혀 있었다.
   * 경기 화면에도 같은 숫자가 필요해지면서 **정본이 둘이 될 뻔했다** — 이
   * 프로젝트에서 반복해 나온 결함이라 데이터 파일 하나로 옮겼다
   * (`training/pitch_catalog.json`의 `maxLearned`).
   */
  pitchMaxLearned: number;
  pitchUnlockRules: PitchUnlockRule[];
  leagues: LeagueRef[];
  schools: SchoolRef[];
  stadiums: StadiumRef[];
  clubs: ClubRef[];
  teams: TeamRef[];
  staffEntities: EntityRow[];       // 코치·감독·구단주 (master.db에서만 로드)
  basePlayerEntities: EntityRow[]; // master.db 선수 전체 기본값 (HS/대학/독립/프로)
  entities: EntityRow[];            // 전체 (staffEntities + basePlayerEntities/npcs 병합)
  eventRules: EventRule[];
  messageTmpls: MessageTemplate[];
  decisionTmpls: DecisionTemplate[];
  eventPools: EventPool[];
  achievements: import("../utils/achievementEngine").MasterAchievement[];
  militaryCommonEvents: MilitaryEvent[];
  militarySportsEvents: MilitaryEvent[];
  militaryGeneralEvents: MilitaryEvent[];
}

// ── masterFetch 헬퍼 (IPC 우선, fetch 폴백) ──────────────────────────────────────
async function fetchMaster<T>(relPath: string): Promise<T | null> {
  try {
    if (window.projectB?.masterFetch) {
      return (await window.projectB.masterFetch(relPath)) as T;
    }
    const res = await fetch(`/data/master/${relPath}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── 이벤트 JSON 파서 ─────────────────────────────────────────
// 한국 학사 연도 기준 월 → 주차 시작값 (3월=주1 기준).
// ⚠ 표는 `utils/seasonCalendar`가 정본이다 — 예전엔 여기 사본이 있었다

function scheduleToWeek(month: number, weekOfMonth: number): number {
  // 3월=index0, 4월=index1, ..., 12월=index9, 1월=index10, 2월=index11
  const idx = month >= 3 ? month - 3 : month + 9;
  // MONTH_STARTS_1은 1-based라 옛 0-based 값과 맞추려면 1을 뺀다
  const base = (MONTH_STARTS_1[idx] ?? 1) - 1;
  return base + weekOfMonth;
}

function stageToCareerStage(stage: string): CareerStage | null {
  const map: Record<string, CareerStage> = {
    highschool: "highschool",
    university: "university",
    pro: "pro_kbl",
    kbl: "pro_kbl",
    abl: "pro_abl",
  };
  return map[stage] ?? null;
}

/** 오타 하나가 관계를 **조용히** 안 움직이게 한다 — 아는 것만 받는다 */
const RELATION_KINDS = new Set<RelationKind>(["manager", "coach", "owner", "teammate", "rival"]);

/**
 * effects 문자열 배열 → `DecisionEffect`.
 *
 * 형식 예: `["condition:-4", "xp.command:+1", "money:-120", "relation.manager:+8"]`
 *
 * 돈·관계·사치품이 여기 없었다. 문자열형 선택지 **26개**만 그걸 못 썼다 —
 * 나머지 571개는 객체형이라 `{ moneyDelta: -120 }`을 그대로 통과시킨다.
 *
 * ⚠ **그러니 이건 막힘이 아니었다.** `moneyDelta`·`relationDelta`·`luxurySpend`가
 * 데이터에서 0건인 건 쓸 수단이 없어서가 아니라 **아무도 안 썼기 때문**이다
 * (배선은 `usecases/decisions.ts`에 다 있다 — 사치품은 Rust `calc_luxury`까지
 * 간다). 여기 넣는 건 문자열형이 저작하기 쉬워서다. (2026-08-25)
 *
 * ⚠ 모르는 키는 지금도 조용히 버린다. 그건 `assertConditions`가 있는
 * 조건 쪽과 다르다 — 보상 쪽 게이트는 `check:effectkeys`가 맡는다.
 */
export function parseEffectsArray(effects: string[]): DecisionEffect {
  const result: DecisionEffect = {};
  for (const e of effects) {
    const colonIdx = e.indexOf(":");
    if (colonIdx === -1) continue;
    const key = e.slice(0, colonIdx).trim();
    const rawVal = e.slice(colonIdx + 1).trim();
    const val = parseInt(rawVal, 10);
    if (key === "condition")        result.conditionDelta  = val;
    else if (key === "fatigue")     result.fatigueDelta    = val;
    else if (key === "morale")      result.moraleDelta     = val;
    else if (key === "fame")        { if (!isNaN(val)) result.fameDelta       = val; }
    else if (key === "popularity")  { if (!isNaN(val)) result.popularityDelta = val; }
    else if (key === "diligence")   { if (!isNaN(val)) result.diligenceDelta  = val; }
    // "removeTag:부상이력" — 값이 숫자가 아니라 태그 이름이다
    else if (key === "removeTag")   { result.removeTag = [...(result.removeTag ?? []), rawVal]; }
    // "study:+0.5" — 주당 학습 품질(0~1)이 눈금이라 **소수를 쓴다**
    else if (key === "study")       { const f = parseFloat(rawVal); if (!isNaN(f)) result.studyQualityDelta = f; }
    else if (key === "addTag")      result.addTag = [...(result.addTag ?? []), rawVal];
    else if (key.startsWith("xp.")) {
      if (!isNaN(val)) result.xp = { ...(result.xp ?? {}), [key.slice(3)]: val };
    }
    else if (key.startsWith("stat.")) {
      if (!isNaN(val)) result.statDelta = { ...(result.statDelta ?? {}), [key.slice(5)]: val };
    }
    // "money:-120" — 단위는 **만원**이다. money·연봉·계약금·치료비가 같은 축이다
    else if (key === "money")       { if (!isNaN(val)) result.moneyDelta = val; }
    // "relation.manager:+8" · "relation.teammate:-3"
    else if (key.startsWith("relation.")) {
      const kind = key.slice(9) as RelationKind;
      if (!isNaN(val) && RELATION_KINDS.has(kind)) result.relationDelta = { kind, delta: val };
    }
    // "luxury:150" 자기 소비 · "luxury.teammate:150" 동료에게.
    // ⚠ `money`와 같이 쓰면 두 번 빠진다 — 금액은 여기서도 빠진다
    else if (key === "luxury" || key === "luxury.teammate") {
      if (!isNaN(val)) result.luxurySpend = { cost: Math.abs(val), onTeammate: key !== "luxury" };
    }
  }
  return result;
}

/**
 * 조건 타입 → **평가기가 실제로 읽는 필드**.
 *
 * 🔴 **타입이 맞아도 필드 이름이 틀리면 조건은 늘 false다.**
 * `evaluateCondition`은 `cond.stage`를 읽는데 데이터가 `cond.value`를 쓰면
 * `undefined`와 비교하게 되고, `evaluateConditions`의 `every`가 그걸 false로
 * 만든다. **로그도 예외도 없이 그 이벤트가 영원히 안 뜬다.**
 *
 * 실측(2026-08-22): `career_stage`에 `value`를 쓴 게 21건, `season_phase`에
 * 쓴 게 23건 — 규칙 **35종**이 6시즌 내내 후보에조차 못 올랐다. 밀린 목록에도
 * 안 나타나서 "콘텐츠가 부족하다"로 읽혔다.
 *
 * ⚠ **여기가 두 번째 정본이다.** 진짜 정본은 `conditionEvaluator.ts`이고,
 * `scripts/check-eventconditions.cjs`가 **그 소스에서 필드를 뽑아** 이 표와
 * 데이터를 함께 검사한다. 표를 늘렸는데 평가기가 안 늘면 거기서 잡힌다.
 */
const CONDITION_FIELDS: Record<string, readonly string[]> = {
  week_gte: ["value"], week_lte: ["value"], week_eq: ["value"],
  season_phase: ["phase"],
  career_stage: [], league_id: [], grade: ["value"],
  player_type: ["playerType"],
  fatigue_gte: ["value"], fatigue_lte: ["value"],
  condition_gte: ["value"], condition_lte: ["value"],
  morale_gte: ["value"], morale_lte: ["value"],
  pitching_stat_gte: ["stat", "value"], pitching_stat_lte: ["stat", "value"],
  pitching_ovr_gte: ["value"], pitching_ovr_lte: ["value"],
  pitch_learned: ["pitchId"], pitch_training: ["pitchId"],
  has_tag: ["tag"],
  season_wins_gte: ["value"], season_era_lte: ["value"],
  season_ip_gte: ["value"], season_k_gte: ["value"],
  team_rank_lte: ["value"], team_rank_gte: ["value"],
  fame_gte: ["value"], pro_year_gte: ["value"],
  money_gte: ["value"], money_lte: ["value"],
  diligence_gte: ["value"], diligence_lte: ["value"],
  popularity_gte: ["value"], popularity_lte: ["value"],
  num_gte: ["path", "value"], num_lte: ["path", "value"],
  eq: ["path", "value"], neq: ["path", "value"],
  relation_gte: ["kind", "value"], relation_lte: ["kind", "value"],
  injured: ["value"], injury_severity: ["severity"],
  injury_weeks_gte: ["value"], injury_count_gte: ["value"],
  season_injury_count_gte: ["value"], had_surgery: ["value"],
  gpa_gte: ["value"], gpa_lte: ["value"], academic_warning_gte: ["value"],
};

/**
 * 데이터가 코드와 어긋나면 **로드에서 죽는다.** 조용히 도는 것보다 낫다 —
 * 어긋난 이벤트는 어차피 영영 안 뜨는데, 그때는 원인을 찾을 단서가 없다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertConditions(ruleId: string, conditions: any[]): void {
  for (const c of conditions) {
    const type = c?.type;
    const want = CONDITION_FIELDS[type];
    if (want === undefined) {
      throw new Error(`[master] ${ruleId}: 모르는 조건 타입 "${type}" — ${JSON.stringify(c)}`);
    }
    // 🔴 **경로는 표에 있어야 한다.** 필드가 채워져 있어도 경로가 오타면
    // `resolvePath`가 던지는데, 그건 **이벤트가 실제로 평가될 때**다 —
    // 조건이 안 맞는 주에는 안 불려서 몇 시즌 뒤에야 터진다.
    // 로드에서 잡으면 그 자리에서 끝난다.
    if ((type === "num_gte" || type === "num_lte") && typeof c.path === "string"
        && !NUM_PATHS.has(c.path)) {
      throw new Error(`[master] ${ruleId}: 모르는 경로 "${c.path}" — eventPaths.ts의 NUM_PATHS에 없다`);
    }
    if ((type === "eq" || type === "neq") && typeof c.path === "string"
        && !EQ_PATHS.has(c.path) && !NUM_PATHS.has(c.path)) {
      throw new Error(`[master] ${ruleId}: 모르는 경로 "${c.path}" — eventPaths.ts의 EQ_PATHS에 없다`);
    }

    // 🔴 **둘 중 하나면 되는 조건.** `want`는 전부 요구하므로 여기서 따로 본다.
    //    `career_stage`는 `stage` 하나 또는 `stages` 배열을 받는다 —
    //    프로 세 리그를 한 번에 가리키려고 배열을 열었다(2026-08-25).
    if (type === "league_id" && c.leagueId === undefined && !Array.isArray(c.leagueIds)) {
      throw new Error(
        `[master] ${ruleId}: 조건 "league_id"에 leagueId도 leagueIds도 없다 — ${JSON.stringify(c)}`
      );
    }
    if (type === "career_stage" && c.stage === undefined && !Array.isArray(c.stages)) {
      throw new Error(
        `[master] ${ruleId}: 조건 "career_stage"에 stage도 stages도 없다 — ${JSON.stringify(c)}`
      );
    }

    for (const k of want) {
      if (c[k] === undefined) {
        throw new Error(
          `[master] ${ruleId}: 조건 "${type}"에 필드 ${k}가 없다 — ${JSON.stringify(c)}. ` +
          `평가기는 cond.${k}를 읽으므로 이대로면 **영원히 false다**`
        );
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventRule(raw: Record<string, any>): EventRule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let conditions: import("../types/event").Condition[] = [];

  if (Array.isArray(raw.conditions)) {
    // 새 포맷: conditions 배열 직접 사용
    conditions = raw.conditions as import("../types/event").Condition[];
  } else if (raw.schedule && typeof raw.schedule === "object") {
    // 구형 포맷 처리: schedule 필드에서 week_eq + career_stage 조건 변환
    const { month, weekOfMonth, stage } = raw.schedule as Record<string, unknown>;
    if (typeof month === "number" && typeof weekOfMonth === "number") {
      conditions.push({ type: "week_eq", value: scheduleToWeek(month, weekOfMonth) });
    }
    if (typeof stage === "string") {
      const cs = stageToCareerStage(stage);
      if (cs) conditions.push({ type: "career_stage", stage: cs });
    }
  }

  const cooldownWeeks =
    typeof raw.cooldownWeeks === "number" ? raw.cooldownWeeks :
    typeof raw.cooldownDays  === "number" ? Math.ceil(raw.cooldownDays / 7) :
    undefined;

  assertConditions(String(raw.id ?? "(id 없음)"), conditions);

  // 등급은 셋뿐이다. 오타를 조용히 `ambient`로 떨어뜨리면 그 이벤트가
  // 왜 안 뜨는지 아무도 못 찾는다 — 조건 필드에서 이미 겪은 형태다
  const TIERS = ["urgent", "important", "ambient"];
  if (raw.tier !== undefined && !TIERS.includes(raw.tier)) {
    throw new Error(`[master] ${raw.id}: 모르는 tier "${raw.tier}" — ${TIERS.join("·")} 중 하나여야 한다`);
  }

  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? raw.id ?? ""),
    type: (raw.type as EventRule["type"]) ?? "random",
    tier: raw.tier as EventRule["tier"] | undefined,
    category: String(raw.category ?? ""),
    priority: Number(raw.priority ?? 0),
    oncePolicy: (raw.oncePolicy as EventRule["oncePolicy"]) ?? "repeatable",
    cooldownWeeks,
    conditions,
    weight: typeof raw.weight === "number" ? raw.weight : undefined,
    poolId: typeof raw.poolId === "string" ? raw.poolId : undefined,
    messageTemplateId: raw.messageTemplateId ?? null,
    decisionTemplateId: raw.decisionTemplateId ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMessageTemplate(raw: Record<string, any>): MessageTemplate {
  return {
    id: String(raw.id ?? ""),
    category: (raw.category as MessageTemplate["category"]) ?? "system",
    subject: String(raw.subject ?? ""),
    body: String(raw.body ?? ""),
    decisionTemplateId: raw.decisionTemplateId ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDecisionTemplate(raw: Record<string, any>): DecisionTemplate {
  const options: DecisionTemplateOption[] = (raw.options ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o: Record<string, any>): DecisionTemplateOption => {
      let effects: DecisionEffect | undefined;
      if (Array.isArray(o.effects)) {
        // 구 형식: ["fatigue:+10", "xp.velocity:+3"]
        const parsed = parseEffectsArray(o.effects as string[]);
        effects = Object.keys(parsed).length > 0 ? parsed : undefined;
      } else if (o.effects && typeof o.effects === "object") {
        // 신 형식: { fatigueDelta: 10, xp: { velocity: 3 } }
        effects = o.effects as DecisionEffect;
      }
      // 선택지 조건도 규칙 조건과 **같은 검증을 받는다** — 여기만 빠지면
      // 오타 하나가 그 선택지를 영원히 안 보이게 만들고 아무도 모른다
      const conditions = Array.isArray(o.conditions)
        ? (o.conditions as import("../types/event").Condition[])
        : undefined;
      if (conditions) assertConditions(`${raw.id ?? "(id 없음)"}#${o.id ?? "?"}`, conditions);

      return {
        id: String(o.id ?? ""),
        label: String(o.label ?? ""),
        effectHint: typeof o.effectHint === "string" ? o.effectHint : undefined,
        effects,
        conditions,
      };
    }
  );
  return {
    id: String(raw.id ?? ""),
    prompt: String(raw.prompt ?? ""),
    options,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventPool(raw: Record<string, any>): EventPool {
  return {
    id: String(raw.id ?? ""),
    description: typeof raw.description === "string" ? raw.description : undefined,
    baseRoll: {
      mode: "percent",
      value: Number(raw.baseRoll?.value ?? raw.baseRollValue ?? 0),
    },
    maxPicksPerWeek: Number(raw.maxPicksPerDay ?? raw.maxPicksPerWeek ?? 1),

  };
}

// ?? Manifest ????????????????????????????????????????????????
interface Manifest {
  generatedAt: string;
  events: {
    mandatory:   string[];
    conditional: string[];
    random: { media: string[]; social: string[]; team_life: string[] };
  };
  /**
   * 추첨 풀 파일 이름 (`events/pools/<name>.json`).
   *
   * 🔴 예전엔 이 목록이 **코드에 한 줄씩 박혀** 있었다. 새 풀을 만들어도
   * 아무도 안 읽고 오류도 로그도 안 난다 — 그 풀에 들어간 이벤트가 영원히
   * 안 뜬다. 이벤트·업적은 이미 매니페스트로 읽는데 풀만 빠져 있었다.
   */
  pools: string[];
  achievements: { baseball: string[]; growth: string[]; social: string[]; hidden: string[] };
}

// entities/players/_index.json 구조
interface EntityIndex {
  generated: string;
  byLeague: Record<string, string[]>;
}

// ⚠ 여기 `TEAM_NAME_MAP`(옛 고교·대학·독립 24팀 이름)과 `TEAM_PROFILE_MAP`,
// 그리고 둘을 쓰던 `teamNameFromId`가 있었다. **부르는 곳이 하나도 없었고**,
// `refs.json`에 238팀 전부 `name`과 `profile`이 들어 있어 이미 대체된 상태였다.
// 남겨 두면 다음 사람이 "여기도 고쳐야 하나" 하고 시간을 쓴다.


/**
 * ⚠ 여기 있던 `mergeSupplementTeams`를 제거했다 (2026-07-30).
 *
 * v1 시절 `teams/{highschool,university,independent}/index.json`의 팀을 refs에
 * **덧붙이던** 전환기 다리였다. Phase 5가 172팀으로 ID 체계를 갈아엎으면서
 * 그 31개 팀이 refs에 없어졌는데, 이 함수가 계속 목록에 얹고 있었다.
 *
 * 결과: 화면엔 뜨는데 **로스터도 일정도 순위표도 없는 유령 팀 31개**.
 * 새 게임 팀 선택도 `masterStore.teams`를 그대로 쓰므로 주인공이 그런 팀을
 * 고를 수 있었다.
 *
 * **refs.json이 팀의 유일한 정본이다** (DESIGN §8.2 원칙 6). 보충하지 않는다.
 */

// ── batchFetch 헬퍼 ──────────────────────────────────────────────
async function batchFetch<T>(ids: string[], pathFn: (id: string) => string): Promise<T[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => fetchMaster<T>(pathFn(id))));
  return results.filter((r): r is NonNullable<typeof r> => r !== null) as T[];
}

// ── 스토어 생성 ─────────────────────────────────────────────────────────────────
// ── NpcSaveState → EntityRow 변환 브릿지 ─────────────────────
const _EMPTY_PITCHING = {
  ovr: 0, stamina: 0, velocity: 0, command: 0,
  control: 0, movement: 0, mentality: 0, recovery: 0,
  clutch: 0, holdRunners: 0,
} as import("../types/save").PitchingAttributes;

const _EMPTY_BATTING = {
  ovr: 0, contact: 0, power: 0, eye: 0,
  discipline: 0, speed: 0, baseInstinct: 0,
  bunting: 0, platoon: 0, fielding: 0, arm: 0, battingClutch: 0,
} as import("../types/save").BattingAttributes;

export function npcSaveStateToEntityRow(
  npc: import("../types/save").NpcSaveState,
  liveStats?: Record<string, NpcLiveStat>,
): EntityRow {
  const live = liveStats?.[npc.npcId];
  const statusMap: Record<string, EntityRow["status"]> = {
    retired: "retired", military: "military",
    injured: "injured", free_agent: "inactive",
  };
  return {
    id:             npc.npcId,
    name:           npc.name,
    nameEn:         npc.nameEn,
    role:           "player",
    age:            npc.age,
    status:         statusMap[npc.careerStatus] ?? "active",
    originLeagueId: npc.originalLeagueId ?? npc.currentLeague,
    leagueId:       npc.currentLeague,
    clubId:         npc.currentTeam,
    teamId:         npc.currentTeam,
    schoolId:       npc.schoolId ?? "",
    grade:          npc.grade,
    notes:          "",
    militaryStatus: npc.militaryStatus,
    nationality:    npc.nationality ?? "KOR",
    personality:    npc.personality,
    details: {
      player: {
        playerType:        npc.playerType,
        handedness:        npc.handedness ?? "R",
        position:          npc.position,
        jerseyNumber:      npc.jerseyNumber ?? 0,
        pitching:          (live?.pitching ?? npc.pitching ?? _EMPTY_PITCHING) as import("../types/save").PitchingAttributes,
        batting:           (live?.batting  ?? npc.batting  ?? _EMPTY_BATTING)  as import("../types/save").BattingAttributes,
        positionRatings:   npc.positionRatings,
        developmentRate:   npc.developmentRate,
        potentialHidden:   npc.potentialHidden ?? 75,
        proServiceYears:   npc.proServiceYears,
        militaryStatus:    npc.militaryStatus,
        militaryEnlistYear: npc.militaryEnlistYear,
        militaryUnit:      npc.militaryUnit,
        originalLeagueId:  npc.originalLeagueId,
        originalTeamId:    npc.originalTeamId,
      },
      coach:   null,
      manager: null,
      owner:   null,
    },
  };
}

function createMasterStore() {
  const { subscribe, update } = writable<MasterState>({
    loaded: false,
    trainingPrograms: [],
    pitchCatalog: [],
    pitchMaxLearned: 5,
    pitchUnlockRules: [],
    leagues: [],
    schools: [],
    stadiums: [],
    clubs: [],
    teams: [],
    staffEntities: [],
    basePlayerEntities: [],
    entities: [],
    eventRules: [],
    messageTmpls: [],
    decisionTmpls: [],
    eventPools: [],
    achievements: [],
    militaryCommonEvents: [],
    militarySportsEvents: [],
    militaryGeneralEvents: [],
  });

  // ── manifest 기반 이벤트 로드 ─────────────────────────────────
  async function loadEventsFromManifest(m: Manifest): Promise<EventRule[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [mandatory, conditional, media, social, teamLife] = await Promise.all([
      batchFetch<Record<string, unknown>>(m.events.mandatory,   (id) => `events/mandatory/${id}.json`),
      batchFetch<Record<string, unknown>>(m.events.conditional, (id) => `events/conditional/${id}.json`),
      batchFetch<Record<string, unknown>>(m.events.random.media,     (id) => `events/random/media/${id}.json`),
      batchFetch<Record<string, unknown>>(m.events.random.social,    (id) => `events/random/social/${id}.json`),
      batchFetch<Record<string, unknown>>(m.events.random.team_life, (id) => `events/random/team_life/${id}.json`),
    ]);
    return [...mandatory, ...conditional, ...media, ...social, ...teamLife]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r) => parseEventRule(r as Record<string, any>));
  }

  // ── manifest 기반 업적 로드 ──────────────────────────────────────────────────────
  async function loadAchievementsFromManifest(
    m: Manifest,
  ): Promise<import("../utils/achievementEngine").MasterAchievement[]> {
    const all = await Promise.all([
      batchFetch(m.achievements.baseball, (id) => `achievements/baseball/${id}.json`),
      batchFetch(m.achievements.growth,   (id) => `achievements/growth/${id}.json`),
      batchFetch(m.achievements.social,   (id) => `achievements/social/${id}.json`),
      batchFetch(m.achievements.hidden,   (id) => `achievements/hidden/${id}.json`),
    ]);
    return all.flat() as import("../utils/achievementEngine").MasterAchievement[];
  }

  async function load() {
    try {
      // ── 공통 데이터 (변경 없음) ─────────────────────────────────────────────────────────
      const [
        trainingData, pitchData, unlockData, refsData,
        msgTmplData, decisionTmplData,
        militaryCommonData, militarySportsData, militaryGeneralData,
        manifest,
      ] = await Promise.all([
        fetchMaster<{ programs: TrainingProgram[] }>("training/programs.json"),
        fetchMaster<{ pitches: PitchEntry[]; maxLearned?: number }>("training/pitch_catalog.json"),
        fetchMaster<{ rules: PitchUnlockRule[] }>("training/pitch_unlock_rules.json"),
        fetchMaster<{ leagues: LeagueRef[]; schools: SchoolRef[]; stadiums: StadiumRef[]; clubs: ClubRef[]; teams: TeamRef[] }>(
          "entities/refs.json"
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<{ templates: Record<string, any>[] }>("messages/templates.json"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<{ decisions: Record<string, any>[] }>("messages/decision_templates.json"),
        fetchMaster<{ events: MilitaryEvent[] }>("events/pools/military_common.json"),
        fetchMaster<{ events: MilitaryEvent[] }>("events/pools/military_sports.json"),
        fetchMaster<{ events: MilitaryEvent[] }>("events/pools/military_general.json"),
        fetchMaster<Manifest>("_manifest.json"),
      ]);

      const messageTmpls  = (msgTmplData?.templates  ?? []).map(parseMessageTemplate);
      const decisionTmpls = (decisionTmplData?.decisions ?? []).map(parseDecisionTemplate);
      // 풀은 **매니페스트가 정본**이다 — 파일을 더해도 코드를 안 고친다
      const rawPools = (await Promise.all(
        (manifest?.pools ?? []).map((name) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fetchMaster<Record<string, any>>(`events/pools/${name}.json`)),
      )).filter((p): p is Record<string, unknown> => p !== null && typeof p === "object");
      if (rawPools.length === 0) {
        throw new Error(
          "[masterStore] 추첨 풀을 하나도 못 읽었다 — `npm run gen:manifest`를 돌려라. " +
          "풀이 비면 랜덤 이벤트가 통째로 안 뜬다"
        );
      }
      const eventPools = rawPools.map(parseEventPool);
      // refs가 팀의 유일한 정본이다 — 보충하지 않는다 (위 주석 참고)
      const mergedTeams = refsData?.teams ?? [];

      // ── manifest 기반 로드 (이벤트·업적) ────────────────────────────────────────────────
      let eventRules:  EventRule[] = [];
      let achievements: import("../utils/achievementEngine").MasterAchievement[] = [];

      if (manifest) {
        [eventRules, achievements] = await Promise.all([
          loadEventsFromManifest(manifest),
          loadAchievementsFromManifest(manifest),
        ]);
      } else {
        // 🔴 **여기가 조용한 함정이었다.**
        //
        // `_manifest.json`은 `npm run gen:manifest`가 만드는 생성물이라 갓 판
        // 워크트리엔 없다. 없으면 이 갈래가 돌면서 `events/rules/*.json`
        // **19건짜리 스텁**을 물고 게임이 그냥 돈다 — 콘텐츠 537건 중 3.5%다.
        // `console.warn` 한 줄이 전부였고, 그 상태로 6시즌을 재고 "이벤트가
        // 안 뜬다"고 결론 낸 적이 실제로 있다(2026-08-22).
        //
        // **안 뜨는 게 낫다.** 고치는 법은 한 줄이고, 정상 경로(`dev:ui`·
        // `build:ui`)는 이미 `gen:manifest`를 먼저 돌린다.
        throw new Error(
          "[masterStore] `_manifest.json`이 없다 — `npm run gen:manifest`를 돌려라. " +
          "예전엔 여기서 19건짜리 레거시 스텁으로 조용히 폴백했고, 그 상태로 잰 계측이 " +
          "콘텐츠의 3.5%만 보고 '이벤트가 안 뜬다'는 오진을 냈다"
        );
      }

      update((s) => ({
        ...s,
        loaded:          true,
        trainingPrograms: trainingData?.programs  ?? [],
        pitchCatalog:     pitchData?.pitches      ?? [],
        pitchMaxLearned:  pitchData?.maxLearned   ?? 5,
        pitchUnlockRules: unlockData?.rules       ?? [],
        leagues:          refsData?.leagues ?? [],
        schools:          refsData?.schools ?? [],
        stadiums:         refsData?.stadiums ?? [],
        clubs:            refsData?.clubs   ?? [],
        teams:            mergedTeams,
        eventRules,
        messageTmpls,
        decisionTmpls,
        eventPools,
        achievements,
        militaryCommonEvents:  militaryCommonData?.events  ?? [],
        militarySportsEvents:  militarySportsData?.events  ?? [],
        militaryGeneralEvents: militaryGeneralData?.events ?? [],
      }));

      // 팀→리그 표를 채운다 — 선수 소속을 바꿀 때 `leagueOfTeam`이 이걸 쓴다.
      // 안 채우면 ID 접두사 폴백으로 돌지만, refs가 정본이므로 여기서 먼저 준다.
      primeTeamLeagueMap(mergedTeams);
      // 고교 권역 역방향 표 — "이 팀이 어느 권역인가"를 화면마다 뒤지지 않게
      primeHsRegionMap(HS_REGIONS as Record<string, readonly string[]>);

      // 생성 규칙 표 — **부팅 때 채운다.**
      // 예전엔 `primeForeignRules`가 `advanceWeek`의 성장 단계에서만 불렸다.
      // 그래서 새 게임을 켜고 한 주도 안 넘긴 상태에서 선수 상세를 열면
      // 외국인 판정표가 비어 있었다. 성격·성장여지 표도 같은 파일이라 같이 준다.
      {
        const genRules = await fetchMaster<Record<string, unknown>>(
          "players/generation_rules.json",
        );
        if (genRules) {
          primeForeignRules(genRules as Parameters<typeof primeForeignRules>[0]);
          primeTraitDisplay(genRules);
          // 진로 점수 표 — 대학 입시·해외 2군 판정이 쓴다.
          // ⚠ 안 채우면 코드의 폴백이 쓰인다 — 조용히 0이 되지는 않는다
          primeCareerScoreRules(genRules as Parameters<typeof primeCareerScoreRules>[0]);
          primeAcademicsHsRules(genRules as Parameters<typeof primeAcademicsHsRules>[0]);
          primeRosterOpsRules(genRules as Parameters<typeof primeRosterOpsRules>[0]);
          // 감독 스타일 — 안 실으면 규칙이 늘 null 이라 **스타일이 다시 죽는다**
          primeManagerStyleRules((genRules as Record<string, unknown>).managerStyleRules);
        }
        // 경기 화면이 투구 선택의 스태미나 소모를 표시한다.
        // **엔진과 같은 파일**을 읽는다 — 숫자를 두 벌로 두지 않는다.
        const tuning = await fetchMaster<Record<string, unknown>>(
          "balance/match_engine_tuning.json",
        );
        if (tuning) primePitchCost(tuning as Parameters<typeof primePitchCost>[0]);
      }

      // 부팅 무결성 검증 — 코드 팀 상수 ⊆ refs.json + _1→_2 팜 규칙 (DESIGN.md §8.2 원칙 6)
      validateTeamRefs(
        new Set(mergedTeams.map((t) => t.id)),
        {
          KBL_TEAMS, ABL_TEAMS, JBL_TEAMS,
          KBL_FARM_TEAMS, ABL_FARM_TEAMS, JBL_FARM_TEAMS,
          UNIV_TEAMS, IND_TEAMS, HS_ALL_TEAMS,
        },
      );

      // 전체 엔티티 사전 로드 — 배경 리그 시뮬에 모든 팀 선수 데이터가 필요하다
      // loaded: true 이후에 실행되므로 게임 진입을 블로킹하지 않는다
      await reloadEntities();
    } catch (e) {
      console.warn("[masterStore] load failed", e);
      update((s) => ({ ...s, loaded: true }));
    }
  }

  // ── 부분 리로드 (파일 감시 핫리로드용) ───────────────────────────────────────────────────
  async function reloadEvents() {
    const manifest = await fetchMaster<Manifest>("_manifest.json");
    if (!manifest) return;
    const eventRules = await loadEventsFromManifest(manifest);
    update((s) => ({ ...s, eventRules }));
  }

  async function reloadAchievements() {
    const manifest = await fetchMaster<Manifest>("_manifest.json");
    if (!manifest) return;
    const achievements = await loadAchievementsFromManifest(manifest);
    update((s) => ({ ...s, achievements }));
  }

  async function reloadEntities(seasonYear?: number, slotId?: string) {
    try {
      let rows: EntityRow[];
      if (window.projectB?.masterLoadEntities) {
        rows = (await window.projectB.masterLoadEntities("", seasonYear, slotId)) as EntityRow[];
      } else {
        console.error("[masterStore] window.projectB 없음 — npm run dev (Electron 포함) 으로 실행하세요");
        return;
      }
      // 스태프는 **slot.db가 정본**이다 (Phase 6A). master.db의 스태프 행은
      // 구 374 JSON에서 온 것이고 폐기됐다 — 절차 생성 결과를 읽는다.
      let staffEntities: EntityRow[] = [];
      if (slotId) {
        try {
          const { slotRepo } = await import("../repo/slotRepo");
          const { staffRowToEntityRow } = await import("../repo/staffGen");
          const rowsStaff = await slotRepo.getStaff(slotId, { status: "active" });
          staffEntities = rowsStaff.map(staffRowToEntityRow);
        } catch (e) {
          console.warn("[masterStore] slot.db 스태프 로드 실패 — 스태프 없이 계속", e);
        }
      }
      // seasonYear 없이 호출되면 선수 로드 안 함 (미래 선수 노출 차단)
      const basePlayerEntities = seasonYear !== undefined
        ? rows.filter(r => r.role === "player")
        : [];
      update((s) => ({
        ...s,
        staffEntities,
        basePlayerEntities,
        entities: [...staffEntities, ...basePlayerEntities],
      }));
    } catch (e) {
      console.warn("[masterStore] reloadEntities failed", e);
    }
  }

  // W1 신입생 활성화용: master.db에서 entryYear == seasonYear인 플레이어 직접 조회 (store 미갱신)
  async function fetchEntryEntities(seasonYear: number): Promise<EntityRow[]> {
    if (!window.projectB?.masterLoadEntities) return [];
    try {
      const all = (await window.projectB.masterLoadEntities("", seasonYear)) as EntityRow[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return all.filter(e => e.role === "player" && (e as any).entryYear === seasonYear);
    } catch {
      return [];
    }
  }

  function connectToGameStore(
    gameStoreSubscribe: (fn: (state: { npcs: import("../types/save").NpcSaveState[] }) => void) => () => void,
    npcLiveStatsSubscribe: (fn: (stats: Record<string, NpcLiveStat>) => void) => () => void,
  ): () => void {
    let currentNpcs: import("../types/save").NpcSaveState[] = [];
    let currentLiveStats: Record<string, NpcLiveStat> = {};
    let prevNpcs: import("../types/save").NpcSaveState[] | null = null;

    function rebuild() {
      const npcIds = new Set(currentNpcs.map(n => n.npcId));
      update((s) => {
        const baseOnly = s.basePlayerEntities.filter(e => !npcIds.has(e.id));
        const npcPlayers = currentNpcs.map(n => npcSaveStateToEntityRow(n, currentLiveStats));
        return { ...s, entities: [...s.staffEntities, ...baseOnly, ...npcPlayers] };
      });
    }

    const unsub1 = gameStoreSubscribe((state) => {
      if (state.npcs !== prevNpcs) {
        prevNpcs = state.npcs;
        currentNpcs = state.npcs;
        rebuild();
      }
    });

    const unsub2 = npcLiveStatsSubscribe((stats) => {
      currentLiveStats = stats;
      rebuild();
    });

    return () => { unsub1(); unsub2(); };
  }

  // ── 핫리로드 리스너 (개발 환경: 파일 감시 → 자동 반영) ────────────────────────────────────────
  function setupContentWatcher() {
    const api = (window as Window & typeof globalThis & { projectB?: { onContentChanged?: (cb: (data: { filename: string }) => void) => void } }).projectB;
    if (!api?.onContentChanged) return;
    api.onContentChanged(({ filename }) => {
      if (filename.includes("events/")) {
        reloadEvents().catch(console.warn);
      } else if (filename.includes("achievements/")) {
        reloadAchievements().catch(console.warn);
      } else if (filename.includes("entities/players/")) {
        reloadEntities().catch(console.warn);
      }
    });
  }

  return {
    subscribe, load, reloadEntities,
    reloadEvents, reloadAchievements,
    setupContentWatcher,
    connectToGameStore,
    fetchEntryEntities,
  };
}

export const masterStore = createMasterStore();

// ── 파생 스토어 ─────────────────────────────────────────────────────────────────
export const trainingProgramMap = derived(masterStore, ($m) =>
  new Map($m.trainingPrograms.map((p) => [p.id, p]))
);

/**
 * 팀 조회표 — **언어 설정을 반영한 `name`을 담는다.**
 *
 * ⚠ 화면 19곳이 `$teamMap.get(id)?.name`으로 팀 이름을 찍는다. 여기서 한 번
 * 고르면 그 19곳을 한 줄도 안 고쳐도 된다.
 *
 * ⚠ **원본(`masterStore.teams`)은 안 건드린다.** 거기 값을 갈아끼우면
 * 저장·비교·ID 파생이 전부 표시 언어에 끌려다닌다.
 */
export const teamMap = derived([masterStore, language], ([$m, $lang]) =>
  new Map($m.teams.map((t) => [
    t.id,
    $lang === "en" && t.nameEn ? { ...t, name: t.nameEn } : t,
  ]))
);

/**
 * 팀 마크 배정표. **한 번만 계산하고 캐시된다** — 238팀을 매 렌더 돌리면 안 된다.
 *
 * 배정 규칙(권역 내 문양 비충돌, 1군·2군 공용)은 `utils/teamMark`가 갖는다.
 */
export const teamMarkIndex = derived(masterStore, ($m) => buildMarkIndex($m.teams));

export const leagueMap = derived(masterStore, ($m) =>
  new Map($m.leagues.map((l) => [l.id, l]))
);

export const pitchUnlockRuleMap = derived(masterStore, ($m) =>
  new Map($m.pitchUnlockRules.map((r) => [r.id, r]))
);

export const eventRuleMap = derived(masterStore, ($m) =>
  new Map($m.eventRules.map((r) => [r.id, r]))
);

export const messageTmplMap = derived(masterStore, ($m) =>
  new Map($m.messageTmpls.map((t) => [t.id, t]))
);

export const decisionTmplMap = derived(masterStore, ($m) =>
  new Map($m.decisionTmpls.map((d) => [d.id, d]))
);

/**
 * 인물 목록 — **언어 설정을 반영한 `name`을 담는다.**
 *
 * ⚠ 화면이 `$masterStore.entities`를 직접 읽으면 언어가 안 따라온다.
 * 이름을 찍는 화면은 **이 스토어를 읽어야** 한다.
 *
 * ⚠ **원본은 안 건드린다.** `masterStore.entities`의 `name`을 갈아끼우면
 * 다음 저장에서 slot.db의 `name` 열이 표시 언어로 덮인다 — 한글 원본이 사라진다.
 */
export const entitiesL10n = derived([masterStore, language], ([$m, $lang]) =>
  $lang === "en"
    ? $m.entities.map((e) => (e.nameEn ? { ...e, name: e.nameEn } : e))
    : $m.entities,
);

/** 인물 조회표 (언어 반영). id로 한 명 찾을 때 */
export const entityMap = derived(entitiesL10n, ($list) =>
  new Map($list.map((e) => [e.id, e])),
);

/**
 * 팀 목록 — **언어 설정을 반영한 `name`을 담는다.**
 *
 * `teamMap`이 조회용이라면 이건 목록용이다. 화면 22곳이 `$masterStore.teams`를
 * 직접 읽고 있었고, 그러면 영어로 바꿔도 **그 화면만 한글로 남는다.**
 */
export const teamsL10n = derived([masterStore, language], ([$m, $lang]) =>
  $lang === "en"
    ? $m.teams.map((t) => (t.nameEn ? { ...t, name: t.nameEn } : t))
    : $m.teams,
);
