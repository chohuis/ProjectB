/**
 * **진로 결정 — 무대 전이 한 자리** (2026-09-30 · Ⅱ-2 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `stores/game.ts` 의
 *   `applyDraftDecision` 하나가 그대로 나왔다. 바뀐 줄은 **머리 하나와 닫는
 *   하나**뿐이다(줄 단위 정규화 비교로 확인).
 *
 * 🔴 **여기가 진로 전이의 정본이다.** `setCareerStage` 를 2026-09-01 에 지운
 *   이유가 그것이다(호출부 0 · 그 기록은 `game.ts` 의 학사 절 뒤에 남아 있다).
 *   고교 → 대학 → 독립 → 프로가 다 이 한 자리를 지난다.
 *
 * 🔴 **`enrollWeekInYear` 를 안 넘기면 던진다.** 조용히 0 이 되면 대학 학년이
 *   20주 어긋난 채로 돌고, 그건 오류도 로그도 없이 이벤트 넷을 죽인다 —
 *   본문 주석이 그 자리다.
 *
 * ⚠ **전이 사유(`transitionReason`)는 정본 함수에서 온다.** 여기서 문안을
 *   다시 적지 않는다 — `test:career` 가 그 자리를 본다.
 *
 * ⚠ **`update` 를 첫 인자에서 풀어서 받는다** — 본문의 `update(…)` 가 그대로 돈다.
 *
 * ⚠ 검사는 `gamePathSrc()`/`scripts/game-path-src.cjs` 가 이 파일을 `game.ts` 와
 *   한 덩이로 읽는다.
 */
import type { GameStoreState } from "../../stores/game";
import { toPlayerCompat } from "../../stores/game";
import { transitionReason, universityWeekOnEnroll } from "../../utils/careerTransition";
import type { ProtagonistSave, SchoolState } from "../../types/save";

/** 스토어가 건네는 손잡이 — 이 덩이는 store 메서드를 하나도 안 부른다 */
export interface CareerDecisionCtx {
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
}
export function applyDraftDecision(
  { update }: CareerDecisionCtx,
  payload: {
    stage: import("../../types/save").CareerStage;
    leagueId?: string;
    teamId?: string;
    teamName?: string;
    signingBonus?: number;
    resetDraftTrigger?: boolean;
    /**
     * 🔴 **대학 진학 주차** — `stage === "university"`면 필수다.
     *
     * `universityWeek` 축을 시즌 경계에 맞추는 데 쓴다. 아래 주석 참고.
     * 안 넘기면 **던진다** — 조용히 0이 되면 학년이 20주 어긋난 채로 돌고,
     * 그건 오류도 로그도 없이 이벤트 넷을 죽인다.
     */
    enrollWeekInYear?: number;
  },
) {
  update((s) => {
    // 학적은 되돌릴 수 없다 — 고교 재입학·대학 두 번 입학·프로에서 학교 복귀 거부.
    // 여기가 없어서 `isUnivResultWeek`가 대학 재학생에도 발동하며 대학 재입학이
    // 실제로 성립했다 (careerTransition.ts 주석 참고).
    const reason = transitionReason(s.protagonist.careerStage, payload.stage);
    if (reason) {
      console.error(`[applyDraftDecision] 전이 거부: ${reason}`);
      return s; // 상태를 건드리지 않는다
    }
    const protagonist: ProtagonistSave = {
      ...s.protagonist,
      careerStage: payload.stage,
      leagueId: payload.leagueId ?? s.protagonist.leagueId,
      teamId: payload.teamId ?? s.protagonist.teamId,
      money: Math.max(0, s.protagonist.money + (payload.signingBonus ?? 0)),
      // ⚠ **대학도 학년이 있다** (1~4). 예전엔 고교만 남기고 나머지를 전부
      // 지워서, 대학에 진학하면 `grade`가 undefined가 됐다. 그러면
      // `processSeasonEnd`의 `isStudentProto`(grade != null 검사)가 거짓이라
      // `advanceProtagonistGrade`가 **한 번도 안 불린다** — 학년이 안 오르고
      // 졸업이 영영 안 온다. 실측: 2032 진학 → 2038까지 7년째 대학생(29세),
      // 매년 W42 진로 허브만 반복.
      // 프로·독립·군은 학년이 없는 게 맞다.
      grade:
        payload.stage === "highschool"
          ? s.protagonist.grade
          : payload.stage === "university"
            ? 1
            : undefined,
    };
    // 🔴 **대학 학년 계수기의 원점을 시즌 경계로 맞춘다** (2026-09-01).
    //
    // 진학은 `CAREER_RESULT_WEEK`(W32)에 확정되는데 예전엔 `universityWeek`
    // 을 안 세워서 초기값 0에서 시작했다. 그러면 계수기가 **진학한 주부터**
    // 세므로 학년이 매 시즌 W33에 오른다 — 시즌과 20주 어긋난다.
    //
    // 그래서 진학 시 `weekInYear - 52`로 세운다. 진학 첫 해의 남은 주는
    // 음수(입학 전)이고, **다음 시즌 W1에 정확히 1**이 된다:
    //
    // ```
    //          예전                     지금
    //   시즌A W33   uw   1            uw -19       합격했으나 학기 전
    //   시즌B W1    uw  21   1학년    uw   1       1학년
    //   시즌B W50   uw  70   2학년★  uw  50       1학년
    //   시즌C W1    uw  73   2학년    uw  53       2학년
    // ```
    //
    // ★ 여기가 결함이었다. `universityGradeOf`가 `(uw-1)/52+1`이라
    // uw 53부터 2학년인데, 시즌B는 아직 1학년 시즌이다.
    //
    // 이벤트가 `week_eq` + `school.universityWeek` 창을 **같이** 걸어서
    // 어긋나면 창 밖으로 밀린다. 실측으로 넷이 죽어 있었다 —
    // `UNIV_Y1_W50_YEAR_WRAP`(uw 70, 창 ≤52) · `UNIV_Y2_W50_YEAR_WRAP` ·
    // `UNIV_Y3_W34_DRAFT_TRACK`(uw 158, 창 ≤156) · `UNIV_Y3_W50_YEAR_WRAP`.
    //
    // ⚠ **던진다.** `serde(default)`류의 조용한 0은 여기서 제일 나쁘다 —
    // 학년이 어긋나도 게임은 돌고 이벤트만 사라진다(CLAUDE.md가 적은
    // "데이터가 코드와 어긋나도 아무도 안 죽는다"가 이 형태다).
    if (payload.stage === "university" && payload.enrollWeekInYear == null) {
      throw new Error(
        "[applyDraftDecision] 대학 진학인데 enrollWeekInYear가 없다 — " +
          "학년 계수기의 원점을 못 잡는다",
      );
    }
    const schoolState: SchoolState = {
      ...s.schoolState,
      attendsUniversity: payload.stage === "university",
      ...(payload.stage === "university"
        ? { universityWeek: universityWeekOnEnroll(payload.enrollWeekInYear as number) }
        : {}),
      careerApplicationsSubmitted: false,
      careerApplications: null,
      careerResults: null,
      careerChoicePopupOpened: false,
      careerChoiceMode: "none",
      careerChoiceConfirmed: false,
      careerDraftPickLog: [],
      careerFinalChoice: "none",
      draftTriggered: payload.resetDraftTrigger ? false : s.schoolState.draftTriggered,
    };
    const logs = payload.teamName
      ? [`드래프트: ${payload.teamName} 지명`, ...s.logs].slice(0, 30)
      : s.logs;
    return {
      ...s,
      protagonist,
      player: toPlayerCompat(protagonist),
      schoolState,
      logs,
    };
  });
}
