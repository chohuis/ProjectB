import type { SchoolState, StudyMode, SubjectScore, GradeRisk } from "../types/save";

// ── 학업 모드별 효과 ──────────────────────────────────────────
interface StudyModeEffect {
  examGain: number;           // 시험 점수 주당 누적
  efficiencyMod: number;      // 훈련 효율 배율 (1.0 = 100%)
  attendanceDelta: number;
  assignmentDelta: number;
  percentileDelta: number;    // 양수 = 등수 하락 (나쁜 방향)
  warningIncrement: boolean;
}

export const STUDY_MODE_EFFECTS: Record<StudyMode, StudyModeEffect> = {
  focus:  { examGain: 8, efficiencyMod: 0.70, attendanceDelta:  1, assignmentDelta:  2, percentileDelta: -2, warningIncrement: false },
  normal: { examGain: 4, efficiencyMod: 0.85, attendanceDelta:  0, assignmentDelta:  1, percentileDelta: -1, warningIncrement: false },
  rest:   { examGain: 1, efficiencyMod: 1.00, attendanceDelta: -3, assignmentDelta: -6, percentileDelta:  4, warningIncrement: false },
  sleep:  { examGain: 0, efficiencyMod: 1.05, attendanceDelta: -8, assignmentDelta: -9, percentileDelta:  7, warningIncrement: true  },
};

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

export function applyWeeklyStudy(school: SchoolState, examGainMult = 1.0): WeeklyStudyResult {
  const fx = STUDY_MODE_EFFECTS[school.weeklyStudyMode];
  const clamp  = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v * 10) / 10));

  const updatedSubjectScores: Record<string, SubjectScore> = {};
  for (const [id, s] of Object.entries(school.subjectScores)) {
    updatedSubjectScores[id] = {
      percentile: clamp(s.percentile + fx.percentileDelta, 1, 100),
      attendance: clamp(s.attendance + fx.attendanceDelta, 0, 100),
      assignment: clamp(s.assignment + fx.assignmentDelta, 0, 100),
    };
  }

  const rawGain = fx.examGain * examGainMult;
  return {
    examAccumDelta:       Math.min(rawGain, 100 - school.examAccumScore),
    updatedSubjectScores,
    warningCountDelta:    fx.warningIncrement ? 1 : 0,
    efficiencyMod:        fx.efficiencyMod,
  };
}

// ── 석차백분율 → 9등급 ─────────────────────────────────────────
export function percentileToGrade(pct: number): number {
  if (pct <=  4) return 1;
  if (pct <= 11) return 2;
  if (pct <= 23) return 3;
  if (pct <= 40) return 4;
  if (pct <= 60) return 5;
  if (pct <= 77) return 6;
  if (pct <= 89) return 7;
  if (pct <= 96) return 8;
  return 9;
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

export function getUniversityExamGainMult(major: string): number {
  return major === "일반전공" ? 1.5 : 1.0;
}

// ── 다음 시험까지 남은 주차 계산 ──────────────────────────────
export function weeksUntilNextExam(currentWeek: number): { label: string; weeksLeft: number } {
  const MIDTERM = 11;
  const FINAL   = 38;
  const w = ((currentWeek - 1) % 52) + 1;

  if (w < MIDTERM) return { label: "중간고사",  weeksLeft: MIDTERM - w };
  if (w < FINAL)   return { label: "기말고사",  weeksLeft: FINAL   - w };
  return { label: "다음 시즌 중간고사", weeksLeft: 52 - w + MIDTERM };
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
 *
 * 경고는 **단계로 오르내린다** — 기준 미달이면 +1, 넘기면 -1이다.
 * 예전 고교식은 누적 경고가 임계를 넘는 순간 바로 출전 정지라
 * **회복할 틈이 없었다.** 3단계에서만 유급한다.
 */
export function settleSemester(
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
): SemesterResult {
  const u = rules.university;
  const mj = majorEffects(rules, opts.major);
  // ⚠ **평균 품질로 낸다.** 합계를 그대로 쓰면 기말(27주)이 중간(11주)보다
  // 무조건 높아져, 중간고사에서 늘 경고가 걸린다
  const avgQuality = opts.weeks > 0 ? opts.qualityAccum / opts.weeks : 0;
  const gpa = Math.max(0, Math.min(u.gpaMax, avgQuality * u.gpaMax * mj.gpaGainMult));

  const n = Math.max(1, opts.semestersDone);
  const cumulativeGpa = Math.round(((opts.priorCumulative * (n - 1) + gpa) / n) * 100) / 100;

  const below = gpa < u.warningGpa;
  const raw = below ? opts.warningLevel + 1 : opts.warningLevel - 1;
  const newWarningLevel = Math.max(0, Math.min(3, raw)) as 0 | 1 | 2 | 3;
  const fx = warningEffect(rules, newWarningLevel);

  const body = below
    ? [
        `이번 학기 학점은 ${gpa.toFixed(2)}입니다. 기준(${u.warningGpa.toFixed(2)})에 미치지 못했습니다.`,
        "",
        newWarningLevel === 1 ? "학사 경고를 받았습니다. 훈련에 쓸 시간이 줄어듭니다."
        : newWarningLevel === 2 ? "경고가 누적되어 다음 학기 경기 출전이 정지됩니다."
        : "경고가 세 번 쌓였습니다. 유급 처리되어 졸업이 한 해 밀립니다.",
      ].join("\n")
    : [
        `이번 학기 학점은 ${gpa.toFixed(2)}입니다. 누적 ${cumulativeGpa.toFixed(2)}.`,
        "",
        opts.warningLevel > 0 ? "경고 단계가 한 단계 내려갔습니다." : "기준을 넘겼습니다.",
      ].join("\n");

  return {
    gpa, cumulativeGpa, newWarningLevel,
    repeats: !!fx?.repeats,
    label: fx?.label ?? "정상",
    messageSubject: below ? `학사 경고 — ${fx?.label ?? ""}` : "학기 성적 발표",
    messageBody: body,
  };
}

/** 졸업할 수 있는가 — 4학년을 마쳤고 누적 학점이 기준 이상 */
export function canGraduate(rules: AcademicsRules, cumulativeGpa: number): boolean {
  return cumulativeGpa >= rules.university.graduationGpa;
}
