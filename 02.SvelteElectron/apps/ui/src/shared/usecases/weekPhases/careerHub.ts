/**
 * **진로 허브 · 진학·지명 확정** (2026-09-30 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` 안에 있던 「진로허브 트리거」·「진로 결과 계산」·
 *   「배경 고교 졸업생 드래프트」 세 절이 그대로 나왔다. 블록 경계는 옮기기
 *   전 파일의 주석 절을 그대로 따랐다.
 *
 * ⚠ **셋은 한 덩이여야 한다.** 가운데 절이 세우는 `isHsResultWeek`·
 *   `isUnivResultWeek`·`hasCareerPending` 을 마지막 절이 읽는다 — 갈라 놓으면
 *   그 셋을 또 계산하게 되고, 그게 정본 둘이다.
 *
 * ⚠ **인자 묶음으로 받는다** — `s`·`g` 는 함수 머리의 스냅샷이고 `careerStageYear`
 *   는 훈련 뒤 값이다. 안에서 다시 읽으면 뜻이 바뀐다. 이름을 그대로 둔 것은
 *   본문을 한 글자도 안 고치기 위해서다. 안에서 새로 읽어야 하는 곳은 옮기기
 *   전에도 `get(gameStore)`·`get(seasonStore)` 로 다시 읽고 있었다.
 *
 * ⚠ 검사는 주간 진행 경로를 **한 덩이로** 읽으므로(`__tests__/weekPathSrc.ts`)
 *   검사 문장은 한 글자도 안 바뀌었다.
 */
import { get } from "svelte/store";
import { gameStore, type GameStoreState } from "../../stores/game";
import { seasonStore, npcLiveStatsStore, type SeasonStoreState } from "../../stores/season";
import { masterStore } from "../../stores/master";
import { livePitchingOvrOf } from "../../stores/npcLiveStats";
import {
  HS_CAREER_HUB_WEEK,
  UNIV_CAREER_HUB_WEEK,
  INDIE_CAREER_HUB_WEEK,
  CAREER_RESULT_WEEK,
} from "../../utils/seasonWeeks";
import { ensureLeagueActivatedV3 } from "../../repo/slotLifecycleV3";
import { seedOf } from "../../utils/seedOf";
import { canApplyToUniversity, canApplyToIndependent } from "../../utils/careerTransition";
import { ALL_TEAMS_BY_LEAGUE } from "../../utils/leagueScheduler";
import { isLeagueInScope } from "../../config/releaseScope";

/** 옮기기 전 지역 변수를 그대로 담은 인자 묶음 — 이름이 본문과 같아야 한다 */
export interface CareerHubArgs {
  weekNum: number;
  weekInYear: number;
  careerStageYear: number;
  s: SeasonStoreState;
  g: GameStoreState;
  /** 주간 로그 — **참조로 받는다.** 옮기기 전과 같은 배열에 쌓여야 한다 */
  logs: string[];
}

export async function runCareerHubWeek({
  weekNum,
  weekInYear,
  careerStageYear,
  s,
  g,
  logs,
}: CareerHubArgs): Promise<void> {
  // 진로허브 트리거 — 스테이지별 시즌 종료 직후
  // **각 무대의 결승 직후다.** 주차는 `utils/seasonWeeks`가 정본이다 —
  // 예전엔 여기 숫자가 박혀 있어서 캘린더를 바꾸면 조용히 안 일어났다
  const gLatest = get(gameStore);
  const needsHsHub =
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 &&
    weekInYear === HS_CAREER_HUB_WEEK &&
    !gLatest.schoolState.careerChoiceTriggered;
  const needsUnivHub =
    gLatest.protagonist.careerStage === "university" &&
    weekInYear === UNIV_CAREER_HUB_WEEK &&
    !gLatest.schoolState.careerApplicationsSubmitted &&
    gLatest.schoolState.careerResults === null &&
    !get(seasonStore).pendingActions.some(
      (a) =>
        a.type === "careerChoiceHub" || a.type === "careerResults" || a.type === "careerChoice",
    );
  const needsIndieHub =
    gLatest.protagonist.careerStage === "independent" &&
    weekInYear === INDIE_CAREER_HUB_WEEK &&
    !gLatest.schoolState.careerApplicationsSubmitted &&
    gLatest.schoolState.careerResults === null &&
    !get(seasonStore).pendingActions.some(
      (a) =>
        a.type === "careerChoiceHub" || a.type === "careerResults" || a.type === "careerChoice",
    );
  if (needsHsHub || needsUnivHub || needsIndieHub) {
    // v3: 드래프트 보드·폴백 지원(대학/독립) 표시 전에 두 리그를 Lazy 활성화
    // 해두지 않으면 후보 풀이 고교 3학년만으로 국한돼 드래프트 라운드가 텅 빈다
    // (KBL 8팀×10라운드=80 슬롯인데 고교만으로는 부족 — DESIGN.md §2.2)
    if (needsHsHub) {
      await ensureLeagueActivatedV3("LEAGUE_UNIVERSITY", s.seasonYear);
      await ensureLeagueActivatedV3("LEAGUE_INDEPENDENT", s.seasonYear);
    }
    gameStore.markCareerChoiceTriggered();
    seasonStore.pushPendingAction({ type: "careerChoiceHub" });
  }

  // 진로 결과 계산 — 드래프트 마감 후 전 스테이지 동시 발표
  const gDraft = get(gameStore);
  const hasCareerPending = get(seasonStore).pendingActions.some(
    (a) => a.type === "careerChoice" || a.type === "careerChoiceHub" || a.type === "careerResults",
  );

  const isHsResultWeek =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 &&
    weekInYear === CAREER_RESULT_WEEK &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    gDraft.schoolState.careerResults === null &&
    !hasCareerPending;

  const isUnivResultWeek =
    (gDraft.protagonist.careerStage === "university" ||
      gDraft.protagonist.careerStage === "independent") &&
    weekInYear === CAREER_RESULT_WEEK &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    gDraft.schoolState.careerResults === null &&
    !hasCareerPending;

  if (isHsResultWeek || isUnivResultWeek) {
    const p = gDraft.protagonist;
    const apps = gDraft.schoolState.careerApplications;
    // 학적 역행 방어 (Phase 6B 보강) — `isUnivResultWeek`는 대학 재학생·독립 소속에도
    // 발동한다. 그때 universityChoices를 그대로 처리하면 **대학 두 번 입학**이 된다.
    // 지원 UI에서도 막지만, 구 세이브에 남은 지원 기록이 여기로 흘러들 수 있다.
    const univChoices = canApplyToUniversity(p.careerStage) ? (apps?.universityChoices ?? []) : [];
    const indieChoices = canApplyToIndependent(p.careerStage)
      ? (apps?.independentChoices ?? [])
      : [];
    // 해외 2군 직행 (실플 ②) — 고교·대학·독립 셋 다에서 지원할 수 있다
    // ⚠ 대학 재학생·독립 소속도 여기 오므로 무대 게이트를 안 건다 —
    //   지원 자체가 그 무대에서 이뤄진다
    const overseasChoices = apps?.overseasChoices ?? [];
    const draftApplied = apps?.draftApplied ?? false;

    const subjects = Object.values(gDraft.schoolState.subjectScores);
    const avgPct = subjects.length
      ? subjects.reduce((a, s2) => a + s2.percentile, 0) / subjects.length
      : 50;

    const {
      requirementOfPower,
      calcHsBaseballScore,
      indieCutOfPower,
      isApplicableIndependent,
      pctToGrade,
    } = await import("../../utils/universityUtils");
    const hsBaseballScore = calcHsBaseballScore(gDraft.protagonist.careerRecords ?? []);
    // 요건은 팀의 전력★에서 나온다 — 예전엔 하드코딩 표를 뒤졌고, 거기 없는
    // 49개 대학이 `?? 9` / `?? 0`으로 떨어져 **전부 무조건 합격**이었다
    const teamsNow = get(masterStore).teams;
    const univChoiceReqs = univChoices.map((teamId) => {
      const req = requirementOfPower(teamsNow.find((t) => t.id === teamId)?.power);
      return {
        teamId,
        minAcademicGrade: req.minAcademicGrade,
        minBaseballScore: req.minBaseballScore,
      };
    });
    // 독립도 팀별 난이도를 넘긴다. 상무는 병역 경로가 따로 있어 제외한다
    const indieChoiceReqs = indieChoices.filter(isApplicableIndependent).map((teamId) => ({
      teamId,
      minOvr: indieCutOfPower(teamsNow.find((t) => t.id === teamId)?.power),
    }));
    const admissionsCalc = JSON.parse(
      await window.projectB!.weekCalcHsAdmissions(
        JSON.stringify({
          ovr: p.pitching.ovr,
          avgPct,
          hsBaseballScore,
          univChoices: univChoiceReqs,
          indieChoices: indieChoiceReqs,
          // ⚠ 진학 합격이 주인공 진로를 정한다 — 씨앗이 없으면 매번 갈린다
          seed: seedOf(
            get(seasonStore).worldSeed ?? 0,
            get(seasonStore).seasonYear,
            weekNum,
            "admissions",
          ),
        }),
      ),
    ) as { univPassed: string[]; indiePassed: string[]; sportsPassed: boolean };

    // ── 주인공 드래프트 결과 ──────────────────────────────────
    //
    // ⚠ 예전엔 여기서 `draftDrafted: false`로 못박고 끝났다. 그리고 이 값을
    // true로 만드는 곳이 **어디에도 없었다**:
    //   · `DraftBoardModal`은 `careerResults.draftDrafted`가 이미 true여야
    //     주인공을 보드에 끼워 넣는다 → 순환이라 영원히 false
    //   · `determineProtagonistDraft`를 부르는 유일한 곳(`gameStore.processDraft`)은
    //     `processNpcDraft`로 대체되면서 **죽은 코드**가 됐다
    // 결과: **주인공은 절대 지명될 수 없었고, 따라서 프로에 갈 수 없었다.**
    // 승강·FA·트레이드·연봉협상 등 프로 콘텐츠 전부가 도달 불가였다.
    //
    // 주인공은 NPC 드래프트 풀에 안 들어간다 — 진로 결과가 따로 정해지는 게
    // 설계다(`DraftBoardModal` 주석). 그 "따로 정하는" 호출이 빠져 있었다.
    const { determineProtagonistDraft, hsDraftInputsOf, draftOrderOf, draftInjuryCounts } =
      await import("../../utils/draftSystem");
    // ⚠ **상대평가 입력을 모아 넘긴다.** 안 넘기면 Rust가 폴백으로 OVR을
    // 백분위처럼 쓰고, 그건 세계 전력이 바뀌면 어긋나는 옛 동작이다.
    //
    // 또래 = 같은 해 지명 대상 고교 3학년 투수. 주인공은 뺀다 —
    // 자기 자신을 분모에 넣으면 백분위가 인원수만큼 낮게 나온다
    //
    // ⚠ **`npcs[].pitching`이 아니라 live를 읽는다.** 생성값은 안 자란다 —
    // 3년을 추적해도 9종 전부 +0이다. 그걸 또래로 쓰면 **1학년 때 능력치와
    // 3학년인 나를 비교**하게 돼서 백분위가 통째로 부풀었다
    const liveStats = get(npcLiveStatsStore);
    const peerOvrs = g.npcs
      .filter(
        (n) =>
          n.playerType === "pitcher" &&
          n.grade === 3 &&
          n.currentLeague === "LEAGUE_HIGHSCHOOL" &&
          n.npcId !== p.id,
      )
      .map((n) => livePitchingOvrOf(n, liveStats))
      .filter((o) => o > 0);
    // 팀 내 투수 순위 — 나보다 나은 팀 동료 수 + 1
    const teamAceRank =
      1 +
      g.npcs.filter(
        (n) =>
          n.playerType === "pitcher" &&
          n.currentTeam === p.teamId &&
          n.npcId !== p.id &&
          livePitchingOvrOf(n, liveStats) > p.pitching.ovr,
      ).length;
    // 대회 활약과 수상 — **한 시즌 평균**이다. `calcHsBaseballScore`의 합계를
    // 그대로 넘기면 Rust의 0~100 척도와 어긋난다(그 함수는 진학 판정용이다)
    const hsInputs = hsDraftInputsOf(p.careerRecords ?? []);
    // ⚠ **심각도별로 센다.** 예전엔 `severity !== "light"`를 한 덩어리로 넘겨서
    // 팔꿈치 염증과 UCL 파열이 같은 무게(건당 -12, 상한 없음)였다 — 실측 감점이
    // -252까지 갔고 30커리어 중 6명이 이 항 하나로 미지명이었다
    // ⚠ **최근 세 시즌만 센다** — 이력은 평생 누적이라 전체를 세면 독립 재지원이
    // 해마다 나빠진다 (`draftInjuryCounts` 주석 · 씨앗 20260803 실측)
    const injuryCounts = draftInjuryCounts(p.injuryHistory ?? [], get(seasonStore).seasonYear);

    const draftOutcome = draftApplied
      ? await determineProtagonistDraft(
          p.scoutScore,
          p.pitching.ovr,
          get(seasonStore).seasonYear,
          { peerOvrs, teamAceRank, ...hsInputs, ...injuryCounts },
          // ⚠ **그 해 지명 순서를 넘긴다.** 안 넘기면 알파벳순 기본값이 쓰여
          // 순번은 맞는데 그 순번의 주인이 다른 팀이 된다
          draftOrderOf(get(seasonStore).prevSeasonKblStandings ?? []),
        )
      : { drafted: false };

    // 계측 전용 — 산식 항이 여섯이라 합만 보면 어느 항이 미는지 못 고친다.
    // 세이브에 넣을 값은 아니다 (`__lastOffseasonSummary`와 같은 자리)
    (globalThis as Record<string, unknown>).__lastDraftBreakdown =
      (draftOutcome as { breakdown?: unknown }).breakdown ?? null;

    // 계측 전용 — 대학 입학 분포를 재려면 판정에 실제로 들어간 avgPct·academicGrade·
    // hsBaseballScore가 필요한데, 결과가 저장된 뒤엔(`careerResults`) 합격 팀 수만
    // 남고 이 원시값은 사라진다. `BALANCE_PROPOSAL_102.md` ① 문턱 제안을 위한
    // 분포 재기 전용 로그 — 게임 로직·저장값에는 영향 없다 (`__PB_CAREER_LOG` 게이트).
    if (
      typeof globalThis !== "undefined" &&
      (globalThis as Record<string, unknown>).__PB_CAREER_LOG
    ) {
      // ⚠ **지망마다 어느 분기로 떨어지는지까지 적는다** (2026-09-18).
      //   Rust `calc_hs_admissions` 는 문턱 미달도 22~28% 로 붙이므로
      //   (`SIM_102_YARDSTICK_2026-09-18.md` ⓐ) 합격 수만 봐서는 「전부 충족
      //   (70~92%)」에 든 지원이 하나라도 있었는지 못 가린다. 판정에 들어간
      //   값과 같은 함수(`requirementOfPower`)로 여기서 다시 낸다 —
      //   **표를 새로 만들지 않는다.**
      const aGrade = pctToGrade(avgPct);
      const 지망 = univChoices
        .map((teamId) => {
          const req = requirementOfPower(teamsNow.find((t) => t.id === teamId)?.power);
          const a = aGrade <= req.minAcademicGrade ? "A" : "-";
          const b = hsBaseballScore >= req.minBaseballScore ? "B" : "-";
          return `${teamId}/${req.tier}/${req.minBaseballScore}/${a}${b}`;
        })
        .join(",");
      // 고교 시즌마다의 팀 성적 항 — 배선이 끊겨 있으면 전부 `-` 다
      const 고교성적 = (gDraft.protagonist.careerRecords ?? [])
        .filter((r) => r.leagueId === "LEAGUE_HIGHSCHOOL")
        .map((r) => `${r.year}:${r.psResult ?? "-"}:${(r.awards ?? []).length}`)
        .join(",");
      console.log(
        "[진로점수] year=" +
          get(seasonStore).seasonYear +
          " stage=" +
          p.careerStage +
          " grade=" +
          p.grade +
          " avgPct=" +
          avgPct.toFixed(1) +
          " academicGrade=" +
          aGrade +
          " hsBaseballScore=" +
          hsBaseballScore +
          " ovr=" +
          p.pitching.ovr +
          " drafted=" +
          draftOutcome.drafted +
          " round=" +
          (draftOutcome.round ?? "-") +
          " pick=" +
          (draftOutcome.pick ?? "-") +
          " team=" +
          (draftOutcome.teamId ?? "-") +
          " univPassed=" +
          admissionsCalc.univPassed.length +
          " indiePassed=" +
          admissionsCalc.indiePassed.length +
          " 고교성적=[" +
          고교성적 +
          "]" +
          " 지망=[" +
          지망 +
          "]" +
          " 합격=[" +
          admissionsCalc.univPassed.join(",") +
          "]",
      );
    }

    // ── 해외 2군 직행 판정 (실플 ②) ─────────────────────────
    //
    // ⚠ **팀 전력★이 문턱을 정한다** — `indieCutOfPower`와 같은 축이다.
    //   ★5는 84, ★3은 78(사용자 확정선), ★1은 72.
    // ⚠ 대회 성적은 `hsBaseballScore`를 그대로 쓴다 — 새로 만들지 않는다.
    const { overseasOfferTeams, calcIndividualScore } = await import("../../utils/universityUtils");
    const { firstTeamIdOf } = await import("../../utils/ids");
    // 🔴 **팀 점수가 아니라 개인 기여를 본다** — 우승팀이면 벤치도 100점인
    //   `hsBaseballScore`는 대학 입시용이다. 해외 스카우트는 그 선수를 본다.
    const indivScore = calcIndividualScore(gDraft.protagonist.careerRecords ?? []);
    // 🔴 **해외 2군 직행은 신청이 아니라 제안이다** (2026-09-02 · 사용자 확정).
    //   `overseasChoices`(허브에서 고른 3곳)는 더 이상 판정에 안 쓴다 — 범위 안
    //   해외 2군 28팀 전부를 **부모 1군 전력** 문턱으로 보고 넘는 팀이 제안한다.
    //   근거·숫자는 `overseasOfferTeams` 주석. 2군 팀만 후보다(1군은 FA·포스팅).
    const overseasFarmTeams = ["LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]
      .filter((lid) => isLeagueInScope(lid))
      .flatMap((lid) => ALL_TEAMS_BY_LEAGUE[lid] ?? [])
      .map((id) => {
        const parent = firstTeamIdOf(id);
        return { id, parentPower: teamsNow.find((x) => x.id === parent)?.power };
      });
    const overseasPassed = overseasOfferTeams(p.pitching.ovr, indivScore, overseasFarmTeams);
    logs.push(
      `[해외제안] ${overseasFarmTeams.length}팀 중 ${overseasPassed.length}팀 제안` +
        ` (OVR ${p.pitching.ovr} · 개인 ${Math.round(indivScore)}` +
        (overseasChoices.length > 0 ? ` · 허브 신청 ${overseasChoices.length}곳은 무시` : "") +
        ")",
    );

    gameStore.setCareerResults({
      draftDrafted: draftOutcome.drafted,
      draftTeamId: draftOutcome.teamId ?? null,
      draftRound: draftOutcome.round ?? null,
      draftPick: draftOutcome.pick ?? null,
      // 계약금은 지명 순위가 정한다 — 계약 표는 수락 시 규칙 파일에서 다시 읽는다
      draftSigningBonus: draftOutcome.drafted
        ? Math.max(3000, Math.round((p.pitching.ovr - 45) * 220))
        : 0,
      universityPassed: admissionsCalc.univPassed,
      independentPassed: admissionsCalc.indiePassed,
      overseasPassed,
    });

    // 🔴 **일어난 일을 적는다** (2026-09-08 · L1). 「올해도 지명되지 않았습니다」가
    //   조건을 **독립 + 주차 + 사기**로 쓰고 있었다 — 실제 미지명을 안 봤다
    gameStore.recordOutcome({
      kind: draftOutcome.drafted ? "drafted" : "undrafted",
      year: get(seasonStore).seasonYear,
      week: weekNum,
      detail: draftOutcome.teamId ?? undefined,
    });

    seasonStore.pushPendingAction({ type: "careerResults" });
  }

  // 배경 고교 졸업생 드래프트 (주인공 드래프트 결과 케이스가 아닐 때 항상 실행)
  // 주인공 학년과 무관하게 매년 실행되는 세계 이벤트 — needsHsHub(주인공 3학년 전용)와
  // 별개로 여기서도 대학/독립 리그를 Lazy 활성화해야 배경 드래프트 풀이 채워진다
  if (
    weekInYear === CAREER_RESULT_WEEK &&
    !isHsResultWeek &&
    !isUnivResultWeek &&
    !hasCareerPending
  ) {
    const alreadyQueued = get(seasonStore).pendingActions.some((a) => a.type === "draftObserve");
    if (!alreadyQueued) {
      const seasonYearNow = get(seasonStore).seasonYear;
      await ensureLeagueActivatedV3("LEAGUE_UNIVERSITY", seasonYearNow);
      await ensureLeagueActivatedV3("LEAGUE_INDEPENDENT", seasonYearNow);
      seasonStore.pushPendingAction({ type: "draftObserve" });
    }
  }
}
