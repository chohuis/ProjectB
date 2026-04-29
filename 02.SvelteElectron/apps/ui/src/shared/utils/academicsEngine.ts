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
  focus:  { examGain: 8, efficiencyMod: 0.75, attendanceDelta:  1, assignmentDelta:  2, percentileDelta: -2, warningIncrement: false },
  normal: { examGain: 4, efficiencyMod: 0.90, attendanceDelta:  0, assignmentDelta:  1, percentileDelta: -1, warningIncrement: false },
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

export function calcExamResult(
  accumScore: number,
  warningCount: number,
  examType: "midterm" | "final",
): ExamResult {
  const penalty  = warningCount * 8;
  const rand     = Math.floor(Math.random() * 25);
  const raw      = Math.max(0, Math.min(100, accumScore - penalty + rand));

  const grade =
    raw >= 90 ? 1 :
    raw >= 80 ? 2 :
    raw >= 65 ? 3 :
    raw >= 50 ? 4 :
    raw >= 38 ? 5 :
    raw >= 28 ? 6 :
    raw >= 18 ? 7 :
    raw >= 10 ? 8 : 9;

  const riskLevel: GradeRisk =
    grade <= 6 ? "ok" :
    grade <= 7 ? "warn" : "danger";

  const moraleDelta =
    grade === 1 ?  12 :
    grade === 2 ?   8 :
    grade <= 4  ?   4 :
    grade <= 6  ?   0 :
    grade <= 7  ?  -8 : -15;

  const eligibilityBlocked = grade >= 9;

  const label = examType === "midterm" ? "중간고사" : "기말고사";
  const gradeStr = `${grade}등급`;

  const messageBody =
    grade <= 2 ? `${label} 결과: ${gradeStr}\n\n탁월한 성적입니다! 학업과 훈련을 훌륭하게 병행하고 있습니다. 사기 +${moraleDelta}` :
    grade <= 4 ? `${label} 결과: ${gradeStr}\n\n양호한 성적입니다. 꾸준한 학업 관리를 유지하고 있습니다. 사기 +${moraleDelta}` :
    grade <= 6 ? `${label} 결과: ${gradeStr}\n\n평균 수준의 성적입니다. 다음 시험에는 학업에 좀 더 집중해보세요.` :
    grade <= 7 ? `${label} 결과: ${gradeStr}\n\n성적 부진으로 출전 자격 경고가 발령되었습니다. 다음 시험까지 학업에 집중하세요. 사기 ${moraleDelta}` :
                 `${label} 결과: ${gradeStr}\n\n성적 불량으로 학사 경고가 발령되었습니다. 이번 주 경기 출전이 제한됩니다. 즉시 학업 개선이 필요합니다. 사기 ${moraleDelta}`;

  return {
    grade,
    riskLevel,
    moraleDelta,
    eligibilityBlocked,
    messageSubject: `${label} 성적 통보 — ${gradeStr}`,
    messageBody,
  };
}

// ── 대학 전공별 훈련 효율 보너스 ──────────────────────────────
export const UNIVERSITY_MAJORS = [
  { id: "체육교육",   effBonus: 0.05, desc: "전반적인 훈련 효율 +5%" },
  { id: "스포츠과학", effBonus: 0.08, desc: "전반적인 훈련 효율 +8%" },
  { id: "일반전공",   effBonus: 0.00, desc: "훈련 효율 보너스 없음, 학업 점수 획득 +50%" },
] as const;

export type UniversityMajorId = typeof UNIVERSITY_MAJORS[number]["id"];

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
