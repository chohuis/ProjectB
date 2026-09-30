/**
 * **학사 — 고교 시험 · 대학 학점 · 출전 자격** (2026-09-30 · Ⅱ-2 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `stores/game.ts` 의 store
 *   메서드 아홉이 그대로 나왔다 — `setStudyMode` · `applyWeeklyStudyResult` ·
 *   `applyExamResult` · `applySemesterResult` · `markGraduated` ·
 *   `addWeeklyGpa` · `clearEligibilityBlock` · `selectMajor` ·
 *   `incrementUniversityWeek`. 바뀐 줄은 **머리 아홉과 닫는 아홉**뿐이고
 *   본문은 들여쓰기 4칸만 줄었다(줄 단위 정규화 비교로 확인).
 *
 * ⚠ **고교와 대학은 축이 다르다.** 고교는 석차 9등급으로 대학 입학 티어를
 *   정하고(`applyExamResult`), 대학은 **학점 → 졸업 자격**이다
 *   (`applySemesterResult`). 한 파일에 둔 것은 둘이 **같은 `schoolState`** 를
 *   적기 때문이다 — 갈라 놓으면 어느 쪽이 어느 칸의 정본인지가 흐려진다.
 *
 * 🔴 **유급은 `universityWeek` 을 안 올리는 방식으로 낸다.** 학년 계수기가
 *   거기 하나뿐이라 그래야 정본이 갈라지지 않는다. 그리고 `grade` 는
 *   **계수기가 움직이는 자리에서 같이 비춘다**(`incrementUniversityWeek`) —
 *   시즌 끝에 적던 옛 방식은 한 해 뒤처졌다(그 자리 주석).
 *
 * ⚠ **`update` 를 첫 인자에서 풀어서 받는다** — 본문의 `update(…)` 가 그대로 돈다.
 *
 * ⚠ 검사는 `gamePathSrc()`/`scripts/game-path-src.cjs` 가 이 파일을 `game.ts` 와
 *   한 덩이로 읽는다 — `universityGradeMirror` 가 거울 자리를 그렇게 본다.
 */
import type { GameStoreState } from "../../stores/game";
import { toPlayerCompat } from "../../stores/game";
import { universityGradeOf } from "../../utils/careerTransition";

export interface AcademicsCtx {
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
}

export function setStudyMode({ update }: AcademicsCtx, mode: import("../../types/save").StudyMode) {
  update((s) => ({ ...s, schoolState: { ...s.schoolState, weeklyStudyMode: mode } }));
}

// advanceWeek에서 주간 학업 효과 반영
export function applyWeeklyStudyResult(
  { update }: AcademicsCtx,
  result: import("../../utils/academicsEngine").WeeklyStudyResult,
) {
  update((s) => ({
    ...s,
    schoolState: {
      ...s.schoolState,
      examAccumScore: Math.min(100, s.schoolState.examAccumScore + result.examAccumDelta),
      warningCount: s.schoolState.warningCount + result.warningCountDelta,
      subjectScores: result.updatedSubjectScores,
    },
  }));
}

// 시험 결과 반영
export function applyExamResult(
  { update }: AcademicsCtx,
  result: import("../../utils/academicsEngine").ExamResult,
) {
  update((s) => {
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const p = s.protagonist;
    return {
      ...s,
      protagonist: {
        ...p,
        morale: clamp(p.morale + result.moraleDelta),
      },
      player: toPlayerCompat({ ...p, morale: clamp(p.morale + result.moraleDelta) }),
      schoolState: {
        ...s.schoolState,
        lastGrade: result.grade,
        lastGradeRisk: result.riskLevel,
        eligibilityBlocked: result.eligibilityBlocked,
        examAccumScore: 0, // 시험 후 리셋
        warningCount: result.eligibilityBlocked
          ? s.schoolState.warningCount
          : Math.max(0, s.schoolState.warningCount - 1), // 경고 1감소(자연 회복)
      },
    };
  });
}

/**
 * 대학 학기 성적 확정 (Phase 9-C).
 *
 * ⚠ 고교의 `applyExamResult`와 **다른 경로다.** 고교는 석차 9등급으로
 * 대학 입학 티어를 정하고, 대학은 학점으로 졸업 자격을 정한다.
 * 유급은 `universityWeek`을 **안 올리는 방식**으로 낸다 — 학년 계수기가
 * 거기 하나뿐이라 그래야 정본이 갈라지지 않는다.
 */
export function applySemesterResult(
  { update }: AcademicsCtx,
  r: import("../../utils/academicsEngine").SemesterResult,
  term: "midterm" | "final",
  seasonYear: number,
) {
  update((s) => {
    const sc = s.schoolState;
    return {
      ...s,
      schoolState: {
        ...sc,
        universityGpa: r.cumulativeGpa,
        semesterGpaHistory: [
          ...(sc.semesterGpaHistory ?? []),
          { year: seasonYear, term, gpa: r.gpa },
        ],
        academicWarningLevel: r.newWarningLevel,
        repeatedYears: (sc.repeatedYears ?? 0) + (r.repeats ? 1 : 0),
        // 2단계 이상이면 다음 학기 출전 정지
        eligibilityBlocked: r.newWarningLevel >= 2,
        // 유급하면 학년 계수기를 한 해(52주) 되돌린다.
        //
        // ⚠ **하한을 뺐다** (2026-09-01). 예전엔 `Math.max(0, …)`였는데,
        // 축 원점을 시즌 경계로 옮기면서 **0 이하가 정상 값**이 됐다
        // (입학 전 위상). 1학년이 유급하면 uw가 음수로 가는 게 맞다 —
        // 다음 시즌 W1에 정확히 1이 되어 1학년을 다시 시작한다.
        // 0에 붙잡아 두면 그 시즌이 한 주씩 밀려 축이 또 어긋난다.
        universityWeek: r.repeats ? sc.universityWeek - 52 : sc.universityWeek,
        // 다음 학기를 위해 누적기를 비운다
        semesterQualityAccum: 0,
        semesterWeeks: 0,
      },
    };
  });
}

/** 졸업 확정 — 미지명이어도 여기서 취업 경로가 갈린다 (Phase 11 엔딩) */
export function markGraduated({ update }: AcademicsCtx) {
  update((s) => ({ ...s, schoolState: { ...s.schoolState, graduated: true } }));
}

/**
 * 주간 학업 품질 누적 (대학 전용).
 *
 * ⚠ **고교의 `examAccumScore`를 쓰지 않는다.** 거기엔 `applyWeeklyStudy`가
 * 주당 4씩 더하고 있어서 섞이면 학점이 상한으로 튄다(실측 4.50).
 */
export function addWeeklyGpa({ update }: AcademicsCtx, quality: number) {
  update((s) => ({
    ...s,
    schoolState: {
      ...s.schoolState,
      semesterQualityAccum: (s.schoolState.semesterQualityAccum ?? 0) + quality,
      semesterWeeks: (s.schoolState.semesterWeeks ?? 0) + 1,
    },
  }));
}

// 출전 정지 해제 (1주 후 자동)
export function clearEligibilityBlock({ update }: AcademicsCtx) {
  update((s) => ({
    ...s,
    schoolState: { ...s.schoolState, eligibilityBlocked: false },
  }));
}

export function selectMajor({ update }: AcademicsCtx, major: string) {
  update((s) => ({
    ...s,
    schoolState: { ...s.schoolState, universityMajor: major, majorSelected: true },
  }));
}

// 대학 진행 주차 증가 (advanceWeek에서 호출)
//
// 🔴 **`grade` 를 여기서 같이 맞춘다** (2026-09-27 · `BALANCE_BACKLOG`
//   「`protagonist.grade` 가 대학에서 한 해 뒤처진다」 · 제안 ㉯).
//
//   예전엔 `processSeasonEnd` 가 적었다. 그 블록은 시즌 **끝**에 도는데
//   그때 `universityWeek` 은 정확히 52 이고 `universityGradeOf(52)` 는 1 이라
//   **직전 시즌의 학년**이 남았다(판 #6·#12 의 `[진로점수]` 줄이 2029·2030
//   둘 다 `grade=1` · 2030 의 진짜 학년은 2).
//
// ⚠ **축을 하나로 둔다.** 「+1 을 더해서 다음 주 학년을 적는」 쪽(제안 ㉮)은
//   왜 +1 인지가 또 하나의 축이 된다. 계수기가 **움직이는 자리**에서 같이
//   비추면 어긋날 틈이 없다 — `universityWeek` 이 정본이고 `grade` 는 거울이다
//   (`careerTransition.universityGradeOf` 머리말).
export function incrementUniversityWeek({ update }: AcademicsCtx) {
  update((s) => {
    const universityWeek = s.schoolState.universityWeek + 1;
    const grade = universityGradeOf(undefined, universityWeek) as 1 | 2 | 3 | 4;
    return {
      ...s,
      schoolState: { ...s.schoolState, universityWeek },
      protagonist: { ...s.protagonist, grade },
    };
  });
}
