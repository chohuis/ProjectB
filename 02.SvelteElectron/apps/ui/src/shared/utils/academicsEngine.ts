import type { SchoolState, StudyMode, SubjectScore, GradeRisk } from "../types/save";

// ══ 고교 학업 표 — 정본은 `generation_rules.json`이다 ═══════════
//
// 🔴 숫자가 여기 박혀 있었다 (2026-08-28에 올렸다). 모드 4종 × 6값 · 9등급
//   절선 8개 · 시험 주차 2개가 전부 리터럴이었다. 밸런스 값을 코드에 두면
//   규칙 파일과 어긋난 걸 아무도 모른다.
//
// ⚠ **여기 남긴 이유** — 이 셋은 화면이 반응형(`$:`)·템플릿(`{@const}`)으로
//   부른다(`AcademicsPage`). IPC를 태우면 렌더마다 왕복이라 화면이 깨진다.
//   **숫자만 규칙 파일로 올리고 조회는 TS에 뒀다** — 이관의 두 번째 갈래다
//   (`docs/ENGINE_OWNERSHIP.md` 참고). **산식은 Rust에 있다.**

interface StudyModeEffect {
  examGain: number;           // 시험 점수 주당 누적
  efficiencyMod: number;      // 훈련 효율 배율 (1.0 = 100%)
  attendanceDelta: number;
  assignmentDelta: number;
  percentileDelta: number;    // 양수 = 등수 하락 (나쁜 방향)
  warningIncrement: boolean;
}

/** 규칙 파일을 못 읽었을 때. **0으로 두면 학업이 통째로 멈춘다** */
const MODE_FALLBACK: Record<StudyMode, StudyModeEffect> = {
  focus:  { examGain: 8, efficiencyMod: 0.70, attendanceDelta:  1, assignmentDelta:  2, percentileDelta: -2, warningIncrement: false },
  normal: { examGain: 4, efficiencyMod: 0.85, attendanceDelta:  0, assignmentDelta:  1, percentileDelta: -1, warningIncrement: false },
  rest:   { examGain: 1, efficiencyMod: 1.00, attendanceDelta: -3, assignmentDelta: -6, percentileDelta:  4, warningIncrement: false },
  sleep:  { examGain: 0, efficiencyMod: 1.05, attendanceDelta: -8, assignmentDelta: -9, percentileDelta:  7, warningIncrement: true  },
};
const CUTS_FALLBACK = [4, 11, 23, 40, 60, 77, 89, 96];
const EXAM_WEEKS_FALLBACK = { midterm: 11, final: 38 };

let _modes = MODE_FALLBACK;
let _cuts = CUTS_FALLBACK;
let _examWeeks = EXAM_WEEKS_FALLBACK;

/**
 * 규칙 파일을 주입한다. `primeForeignRules`와 같은 방식이고 같은 자리
 * (`stores/master`)에서 부른다 — 화면이 동기로 읽어야 해서 캐시한다.
 */
export function primeAcademicsHsRules(rulesFile: {
  academicsRules?: {
    highschool?: {
      studyModes?: Partial<Record<StudyMode, StudyModeEffect>>;
      gradeCuts?: number[];
      examWeeks?: { midterm: number; final: number };
    };
  };
}): void {
  const h = rulesFile.academicsRules?.highschool;
  if (h?.studyModes) _modes = { ...MODE_FALLBACK, ...h.studyModes };
  if (h?.gradeCuts?.length) _cuts = h.gradeCuts;
  if (h?.examWeeks) _examWeeks = h.examWeeks;
}

/** 화면이 모드 뱃지(훈련 효율 %)를 그릴 때 읽는다. **상수가 아니다** —
 *  규칙 파일이 주입되기 전엔 폴백을 준다 */
export function studyModeEffect(mode: StudyMode): StudyModeEffect {
  return _modes[mode] ?? MODE_FALLBACK[mode];
}

// ── 주간 학업 효과 계산 ────────────────────────────────────────
export interface WeeklyStudyResult {
  examAccumDelta: number;
  updatedSubjectScores: Record<string, SubjectScore>;
  warningCountDelta: number;
  efficiencyMod: number;
}

/**
 * 학생이 아닐 때 쓰는 중립값 — **학업이 훈련 효율에 영향을 주지 않는다.**
 *
 * 프로 선수에게도 주간 학업이 돌아서 `efficiencyMod`가 훈련에 곱해지고
 * "[학업] 주간 효율 85%" 로그까지 남았다 (실측). 학적이 없는 단계에서
 * 학업 상태는 의미가 없다.
 */
export const NEUTRAL_STUDY: WeeklyStudyResult = {
  examAccumDelta: 0,
  updatedSubjectScores: {},
  warningCountDelta: 0,
  efficiencyMod: 1.0,
};

/**
 * 주간 학업. **산식은 Rust에 있다** (`week_engine::calc_weekly_study`).
 *
 * ⚠ 엔진이 없으면(Vite 단독) 중립값이다 — **여기서 산식을 다시 만들지
 *   않는다.** 만들면 또 두 벌이 된다.
 */
export async function applyWeeklyStudy(school: SchoolState): Promise<WeeklyStudyResult> {
  const api = window.projectB?.engine;
  if (!api) return NEUTRAL_STUDY;
  try {
    return JSON.parse(await api("weekCalcWeeklyStudyNative", JSON.stringify({
      mode: school.weeklyStudyMode,
      modes: _modes,
      examAccumScore: school.examAccumScore,
      subjectScores: school.subjectScores,
    }))) as WeeklyStudyResult;
  } catch {
    return NEUTRAL_STUDY;
  }
}

// ── 석차백분율 → 9등급 ─────────────────────────────────────────
/** 절선 표는 규칙 파일이 정본이다. 화면이 매 렌더 부르므로 동기다 */
export function percentileToGrade(pct: number): number {
  for (let i = 0; i < _cuts.length; i++) if (pct <= _cuts[i]) return i + 1;
  return _cuts.length + 1;
}

// ── 시험 결과 계산 ─────────────────────────────────────────────
export interface ExamResult {
  grade: number;        // 1~9
  riskLevel: GradeRisk;
  moraleDelta: number;
  eligibilityBlocked: boolean;
  messageSubject: string;
  messageBody: string;
}

export async function calcExamResult(
  accumScore: number,
  warningCount: number,
  examType: "midterm" | "final",
  /** 🔴 안 넘기면 엔진이 `thread_rng`로 떨어져 **진로가 실행마다 갈린다** */
  seed = 0,
): Promise<ExamResult> {
  const raw = JSON.parse(await window.projectB!.weekCalcExamResult(
    JSON.stringify({ accumScore, warningCount, examType, seed })
  )) as ExamResult;
  return raw;
}

// ── 대학 전공 목록 ────────────────────────────────────────────
//
// ⚠ **수치의 정본은 `generation_rules.json`의 `academicsRules.majors`다.**
// 여기 있는 건 화면이 고를 목록(id·설명)이고, `effBonus`는 **구 경로 폴백**이다.
// 주간 루프는 `majorEffects()`로 규칙 파일만 읽는다 — 두 값이 갈라지면
// `npm run test:events`가 잡는다(전공 대조).
export const UNIVERSITY_MAJORS = [
  { id: "체육교육",   effBonus: 0.05, desc: "전반적인 훈련 효율 +5%" },
  { id: "스포츠과학", effBonus: 0.08, desc: "전반적인 훈련 효율 +8%" },
  { id: "일반전공",   effBonus: 0.00, desc: "훈련 효율 보너스 없음, 학업 점수 획득 +50%" },
] as const;

export type UniversityMajorId = typeof UNIVERSITY_MAJORS[number]["id"];

/** @deprecated 규칙 파일이 정본이다 — `majorEffects(rules, major).trainingEffBonus`를 쓴다 */
export function getUniversityEffBonus(major: string): number {
  return UNIVERSITY_MAJORS.find((m) => m.id === major)?.effBonus ?? 0;
}

// ⚠ `getUniversityExamGainMult`를 지웠다 (2026-08-28). **죽은 갈래였다.**
//   대학 전공 "일반전공"에 1.5배를 곱했는데 그 배수가 닿는 값은
//   `examAccumDelta` 하나이고, `advanceWeek`은 대학일 때 그 결과를
//   **저장하지 않는다**(`if (isStudent && !isUniversity)`).
//   실측: 배수를 999로 키워도 `efficiencyMod`·과목 점수·경고가 전부 같았다.
//   화면이 약속하는 "학업 점수 획득 +50%"는 대학 축(`majors.일반전공.
//   gpaGainMult = 1.5`)이 실제로 주고 있다 — 그쪽은 살아 있다.

// ── 다음 시험까지 남은 주차 계산 ──────────────────────────────
/** 주차 표는 규칙 파일이 정본이다. 화면이 매 렌더 부르므로 동기다 */
export function weeksUntilNextExam(currentWeek: number): { label: string; weeksLeft: number } {
  const w = ((currentWeek - 1) % 52) + 1;
  if (w < _examWeeks.midterm) return { label: "중간고사", weeksLeft: _examWeeks.midterm - w };
  if (w < _examWeeks.final)   return { label: "기말고사", weeksLeft: _examWeeks.final   - w };
  return { label: "다음 시즌 중간고사", weeksLeft: 52 - w + _examWeeks.midterm };
}

// ══ 대학 학업 (Phase 9-C) ══════════════════════════════════════
//
// ⚠ **고교와 축이 다르다.** 고교는 석차 9등급 → 대학 입학 티어이고
// (`universityUtils.minAcademicGrade`), 그 경로는 여기서 안 건드린다.
// 대학은 **학점 → 졸업 자격 → 진로 안전망**이다.
//
// 수치는 전부 `generation_rules.json`의 `academicsRules`에서 온다 —
// 여기에 같은 표를 다시 적으면 그게 다음 드리프트다.

export interface WarningEffect {
  level: number;
  trainingEffMod: number;
  blocksGames: boolean;
  repeats: boolean;
  label: string;
}

export interface AcademicsRules {
  university: {
    gpaMax: number;
    graduationGpa: number;
    warningGpa: number;
    warningEffects: WarningEffect[];
    studyModeGpa: Record<string, number>;
  };
  majors: Record<string, {
    trainingEffBonus: number;
    xpBonus: Record<string, number>;
    injuryMod: number;
    gpaGainMult: number;
    coachPath?: boolean;
    careerNet?: boolean;
  }>;
}

let _rules: AcademicsRules | null = null;

/** 규칙 파일에서 읽는다. 한 번 읽고 캐시한다 (주간 경로에서 매번 부른다) */
export async function loadAcademicsRules(): Promise<AcademicsRules> {
  if (_rules) return _rules;
  const raw = await window.projectB!.masterFetch("players/generation_rules.json") as
    { academicsRules?: AcademicsRules } | null;
  if (!raw?.academicsRules) throw new Error("[academics] generation_rules.json academicsRules 없음");
  _rules = raw.academicsRules;
  return _rules;
}

/** 전공 효과 — 없는 전공이면 무보정. 화면·훈련·부상이 전부 여기를 본다 */
export function majorEffects(rules: AcademicsRules, major: string) {
  return rules.majors[major] ?? {
    trainingEffBonus: 0, xpBonus: {}, injuryMod: 1, gpaGainMult: 1,
  };
}

/** 지금 경고 단계의 효과. 단계가 없으면 무보정 */
export function warningEffect(rules: AcademicsRules, level: number): WarningEffect | null {
  if (!level) return null;
  return rules.university.warningEffects.find((w) => w.level === level) ?? null;
}

export interface SemesterResult {
  gpa: number;
  cumulativeGpa: number;
  newWarningLevel: 0 | 1 | 2 | 3;
  /** 이번 학기 결과로 유급하는가 */
  repeats: boolean;
  label: string;
  messageSubject: string;
  messageBody: string;
}

/**
 * 학기 학점을 확정한다 (중간·기말 각 1회).
 * **산식은 Rust에 있다** (`week_engine::calc_semester_result`).
 *
 * 경고는 **단계로 오르내린다** — 기준 미달이면 +1, 넘기면 -1이다.
 * 예전 고교식은 누적 경고가 임계를 넘는 순간 바로 출전 정지라
 * **회복할 틈이 없었다.** 3단계에서만 유급한다.
 *
 * ⚠ 엔진이 없으면 **직전 상태를 그대로 돌려준다** — 여기서 학점을 지어내면
 *   졸업 자격이 갈린다.
 */
export async function settleSemester(
  rules: AcademicsRules,
  opts: {
    /** 이번 학기 주당 품질(0~1)의 합 */
    qualityAccum: number;
    /** 이번 학기 주차 수 — 길이가 다르므로 반드시 나눈다 */
    weeks: number;
    priorCumulative: number;     // 직전까지의 누적 학점
    semestersDone: number;       // 이번 학기 포함 전 학기 수
    warningLevel: number;
    major: string;
  },
): Promise<SemesterResult> {
  const api = window.projectB?.engine;
  if (!api) {
    return {
      gpa: 0, cumulativeGpa: opts.priorCumulative,
      newWarningLevel: (opts.warningLevel || 0) as 0 | 1 | 2 | 3,
      repeats: false, label: "정상",
      messageSubject: "학기 성적 발표", messageBody: "",
    };
  }
  return JSON.parse(await api("weekCalcSemesterResultNative", JSON.stringify({
    gpaMax: rules.university.gpaMax,
    warningGpa: rules.university.warningGpa,
    warningEffects: rules.university.warningEffects,
    gpaGainMult: majorEffects(rules, opts.major).gpaGainMult,
    qualityAccum: opts.qualityAccum,
    weeks: opts.weeks,
    priorCumulative: opts.priorCumulative,
    semestersDone: opts.semestersDone,
    warningLevel: opts.warningLevel,
  }))) as SemesterResult;
}

/** 졸업할 수 있는가 — 4학년을 마쳤고 누적 학점이 기준 이상 */
export function canGraduate(rules: AcademicsRules, cumulativeGpa: number): boolean {
  return cumulativeGpa >= rules.university.graduationGpa;
}
