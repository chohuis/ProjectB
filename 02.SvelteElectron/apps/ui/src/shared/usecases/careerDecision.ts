// ── 진로 결정 (지원 → 결과 확인 → 선택 → 계약) ──────────────────
//
// 이 로직은 `features/career/ui/*.svelte`와 `features/contract/ui/*.svelte`
// **안에** 있었다. 그래서 헤드리스로 못 부르고, 고교 졸업 이후 경로가
// 자동 검증에서 통째로 비어 있었다 — 시나리오의 "투자 3택"이 영영
// SKIP이었고, 프로 단계 트레이드 윈도우도 한 번도 안 돌아봤다.
//
// `SeasonEndModal` → `seasonRollover`와 같은 이유·같은 방식으로 옮긴다.
// **모달에는 표시와 사용자 선택만 남는다.** 세계를 바꾸는 건 전부 여기다.
//
// ⚠ 여기 있는 함수는 사용자가 버튼을 눌렀을 때 일어나는 일이다.
// 자동으로 부르면 안 된다 — 부르는 쪽이 "눌렀다"를 책임진다.

import { get } from "svelte/store";
import type { CareerStage } from "../types/save";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { calcKblDraftContract } from "../utils/draftSalaryTable";
import { buildSalaryIndex, loadRosterRules } from "../repo/newGameV3";
import { canApplyToUniversity, isUniversityFinalYear } from "../utils/careerTransition";
import { loadAcademicsRules, canGraduate, majorEffects } from "../utils/academicsEngine";
import { openProSeason } from "./proSeason";
import { runWorldSeasonEnd } from "./seasonRollover";
import { enlistProtagonist } from "./militaryDecision";
import type { PendingAction } from "../types/season";

/** 진로 지원 제출 (`CareerChoiceHubModal.submitApplications`) */
export async function submitCareerApplications(opts: {
  draft: boolean;
  universityChoices?: string[];
  independentChoices?: string[];
  /**
   * 해외 2군 (실플 ②). ⚠ **셋과 같은 상한(3팀)**이다 —
   *   여기만 늘리면 해외가 유리해져 다른 진로가 죽는다.
   */
  overseasChoices?: string[];
}): Promise<void> {
  gameStore.setCareerApplications({
    draftApplied: opts.draft,
    universityChoices: (opts.universityChoices ?? []).slice(0, 3),
    independentChoices: (opts.independentChoices ?? []).slice(0, 3),
    overseasChoices: (opts.overseasChoices ?? []).slice(0, 3),
    sportsMilitaryApplied: false,
  });
  gameStore.setCareerApplicationsSubmitted(true);
  gameStore.markCareerChoiceTriggered();
  gameStore.setCareerChoiceUiState({ popupOpened: false, mode: "none", confirmed: true });
  seasonStore.resolvePendingAction("careerChoiceHub");
  await gameStore.save();
  await seasonStore.save();
}

/** 결과 확인 완료 → 최종 선택 단계로 (`CareerResultsModal.confirm`) */
export async function confirmCareerResults(): Promise<void> {
  seasonStore.resolvePendingAction("careerResults");
  if (!get(seasonStore).pendingActions.some((a) => a.type === "careerChoice")) {
    seasonStore.pushPendingAction({ type: "careerChoice" });
  }
  await gameStore.save();
  await seasonStore.save();
}

/**
 * 지금 무대를 계속한다 (`CareerResultModal`의 "다음 학년 진급" / "독립리그 계속").
 *
 * 대학은 최종 학년 전까지, 독립리그는 제한 없이 고를 수 있다 —
 * **미지명이어도 갈 곳이 없어 막히지 않게** 하는 자리다.
 */
export async function continueCurrentStage(): Promise<boolean> {
  const g = get(gameStore);
  const p = g.protagonist;

  // ⚠ 4학년은 계속할 수 없다 — 5학년은 없다. 이 판정이 **화면에만** 있어서
  // (`CareerResultModal.isFinalYear`) 헤드리스는 그냥 계속 눌렀고,
  // 주인공이 **7년째 대학생(29세)** 이 됐다. 판정을 여기로 옮겨 화면과
  // 자동 진행이 같은 걸 본다.
  //
  // 단 **학점이 모자라면 졸업을 못 한다** — 그때는 한 해 더 다닌다(Phase 9-C).
  // 유급 자체는 `applySemesterResult`가 `universityWeek`을 되돌려 내므로
  // 여기서는 "졸업 자격이 없으면 최종 학년이어도 계속할 수 있다"만 본다.
  if (p.careerStage === "university"
      && isUniversityFinalYear(p.grade, g.schoolState.universityWeek)) {
    const rules = await loadAcademicsRules();
    const gpa = g.schoolState.universityGpa ?? 0;
    if (canGraduate(rules, gpa)) {
      gameStore.markGraduated();
      // ⚠ 취업 경로는 **기록만 남긴다.** 화면은 Phase 11 엔딩과 같이 만든다 —
      // 지금 만들면 엔딩 톤이 정해질 때 다시 손대게 된다.
      // 4년을 관리한 결과가 여기서 처음 의미를 갖는다(설계 §0 구멍 ③).
      const mj = majorEffects(rules, g.schoolState.universityMajor);
      const path = mj.coachPath ? "지도자" : mj.careerNet ? "일반 취업" : "야구 관련";
      gameStore.addCareerEvent({
        year: get(seasonStore).seasonYear,
        eventType: "graduation",
        fromTeamId: g.protagonist.teamId || undefined,
        fromLeagueId: "LEAGUE_UNIVERSITY",
        detail: `졸업 · ${g.schoolState.universityMajor} · 학점 ${gpa.toFixed(2)} · 대안 경로 ${path}`,
      });
      return false;          // 졸업 — 진로를 정해야 한다
    }
    // 학점 미달 — 한 해 더 다닌다. **여기서 반환하면 안 된다**:
    // 아래 해소 블록을 건너뛰면 `careerChoice` pending이 남아 같은 주가
    // 무한 반복된다 (#19·#26과 같은 형태다)
  } else if (p.careerStage !== "university" && p.careerStage !== "independent") {
    return false;
  }

  gameStore.setCareerApplicationsSubmitted(false);
  gameStore.clearCareerResults();
  seasonStore.resolvePendingAction("careerChoice");
  await gameStore.save();
  await seasonStore.save();
  return true;
}

/**
 * 드래프트 지명을 최종 선택한다 (`CareerResultModal.chooseResult("draft")`).
 *
 * 계약 표는 규칙 파일에서 온다 — NPC 신인(Rust `draft.rs`)과 **같은 표**를
 * 써야 화면에 나란히 떴을 때 안 어긋난다.
 */
export async function chooseDraft(): Promise<void> {
  const g = get(gameStore);
  const results = g.schoolState.careerResults;
  const pickNo = results?.draftPick ?? 80;
  const teamId = results?.draftTeamId ?? g.protagonist.teamId;
  const teamIndex = buildSalaryIndex(get(masterStore).teams).get(teamId) ?? 1.0;

  const contractRules = (await loadRosterRules()).draftRules?.contract;
  if (!contractRules) throw new Error("[careerDecision] draftRules.contract 없음");
  const { salary, durationYears, signingBonus } =
    calcKblDraftContract(pickNo, contractRules, teamIndex);

  seasonStore.resolvePendingAction("careerChoice");
  seasonStore.pushPendingAction({
    type: "draftNotification",
    teamId,
    leagueId: "LEAGUE_KBL",
    round: results?.draftRound ?? 10,
    pickNo, salary, durationYears, signingBonus,
    altUniversityTeamId: canApplyToUniversity(g.protagonist.careerStage)
      ? results?.universityPassed?.[0] : undefined,
    altIndependentTeamId: results?.independentPassed?.[0],
  });
  // clearCareerResults는 계약 수락/거절이 처리한다
  gameStore.setCareerFinalChoice("draft");
}

/** 진학·독립 입단 선택 (`CareerResultModal.chooseResult`) */
export async function chooseSchoolOrIndependent(
  kind: "university" | "independent" | "overseas",
  teamId: string,
): Promise<void> {
  // 🔴 **해외는 팀에서 리그를 읽는다.** ABL 2군인지 JBL 2군인지는 그 팀이 안다 —
  //   여기서 하나로 정하면 둘 중 하나가 잘못 들어간다.
  const leagueId = kind === "university" ? "LEAGUE_UNIVERSITY"
    : kind === "independent" ? "LEAGUE_INDEPENDENT"
    : (get(masterStore).teams.find((t) => t.id === teamId)?.leagueId ?? "LEAGUE_ABL_FARM");
  // 🔴 **무대는 리그가 정한다.** `overseas`는 진로 선택의 이름이고,
  //   실제 `careerStage`는 `pro_abl`/`pro_jbl`이다 — 그 둘은 이미 있다.
  const stage: CareerStage = kind === "overseas"
    ? (leagueId.startsWith("LEAGUE_JBL") ? "pro_jbl" : "pro_abl")
    : kind;
  gameStore.applyDraftDecision({ stage, leagueId, teamId });
  gameStore.setCareerApplicationsSubmitted(false);
  gameStore.setCareerFinalChoice(kind);
  seasonStore.resolvePendingAction("careerChoice");

  if (kind === "independent" || kind === "overseas") {
    const p = get(gameStore).protagonist;
    const ovr = p.pitching?.ovr ?? p.batting?.ovr ?? 50;
    // 독립리그 입단은 1년 단기 계약 고정이라 min=max=1이다.
    // (BACKLOG에 "salaryNegotiation 필수 필드 3개 누락"으로 올라 있던 자리 —
    //  캐스팅으로 덮으면 협상 화면이 undefined를 읽는다)
    seasonStore.pushPendingAction({
      type: "salaryNegotiation",
      teamId, leagueId,
      // ⚠ **해외 2군은 조건이 다르다.** 독립은 1년 단기지만 해외는 육성 계약이라
      //   여러 해를 준다 — 1년으로 두면 매년 재계약을 물어 흐름이 끊긴다.
      offeredSalary: kind === "overseas"
        ? Math.max(2000, Math.round((ovr - 40) * 140))
        : Math.max(800, Math.round((ovr - 40) * 60)),
      durationYears: kind === "overseas" ? 3 : 1,
      minDurationYears: kind === "overseas" ? 2 : 1,
      maxDurationYears: kind === "overseas" ? 4 : 1,
      signingBonus: kind === "overseas" ? Math.max(1000, Math.round((ovr - 60) * 300)) : 0,
      context: "initial",
    });
  }
  await gameStore.save();
  await seasonStore.save();
}

/**
 * 지명을 **거부**하고 대안 경로로 간다.
 *
 * `DraftNotificationModal.reject` 안에 있던 로직이다. 대안이 셋이라
 * (대학 · 독립 · 갈 곳 없음→현역) 커리어가 크게 갈리는데, 화면 안에 있어서
 * **한 번도 검증된 적이 없다** — 수락 경로만 헤드리스로 밟혔다.
 *
 * @returns 어디로 갔는지 — 호출부가 화면 문구·검증에 쓴다
 */
export async function rejectDraftOffer(
  action: Extract<PendingAction, { type: "draftNotification" }>,
): Promise<"university" | "independent" | "general"> {
  seasonStore.resolvePendingAction("draftNotification");
  const p = get(gameStore).protagonist;

  let went: "university" | "independent" | "general";
  // 대학 대안은 고교생만 — 대학 재학생이 미지명 시 여기로 오면 두 번 입학이 된다
  if (action.altUniversityTeamId && canApplyToUniversity(p.careerStage)) {
    gameStore.applyDraftDecision({
      stage: "university", leagueId: "LEAGUE_UNIVERSITY", teamId: action.altUniversityTeamId,
    });
    gameStore.setCareerFinalChoice("university");
    went = "university";
  } else if (action.altIndependentTeamId) {
    gameStore.applyDraftDecision({
      stage: "independent", leagueId: "LEAGUE_INDEPENDENT", teamId: action.altIndependentTeamId,
    });
    gameStore.setCareerFinalChoice("independent");
    const ovr = p.pitching?.ovr ?? p.batting?.ovr ?? 50;
    seasonStore.pushPendingAction({
      type: "salaryNegotiation",
      teamId: action.altIndependentTeamId,
      leagueId: "LEAGUE_INDEPENDENT",
      offeredSalary: Math.max(800, Math.round((ovr - 40) * 60)),
      durationYears: 1, minDurationYears: 1, maxDurationYears: 1,
      signingBonus: 0, context: "initial",
    });
    went = "independent";
  } else {
    // 갈 곳이 없다 — 현역 입대. 입대 처리는 `militaryDecision`이 정본이다
    // (예전엔 여기서 오프시즌 처리를 빠뜨려 그해 세계가 정체됐다)
    await enlistProtagonist("general");
    gameStore.setCareerFinalChoice("general");
    went = "general";
  }

  gameStore.clearCareerResults();
  gameStore.setCareerApplicationsSubmitted(false);
  await gameStore.save();
  await seasonStore.save();
  return went;
}

/**
 * 지명 계약을 수락한다 (`DraftNotificationModal.accept`).
 *
 * 다음 시즌을 프로 리그로 새로 연다 — 일정까지 여기서 만든다.
 * 이걸 컴포넌트에 두면 "계약은 됐는데 일정이 고교 그대로"가 조용히 난다.
 */
export async function acceptDraftOffer(action: {
  teamId: string; leagueId: string;
  salary: number; durationYears: number; signingBonus: number;
}): Promise<void> {
  gameStore.signContract({
    teamId: action.teamId,
    leagueId: action.leagueId,
    salary: action.salary,
    durationYears: action.durationYears,
    remainingYears: action.durationYears,
    signingBonus: action.signingBonus,
    teamOptionYears: 0,
    playerOptionYears: 0,
    noTrade: false,
    status: "active" as const,
  });

  // ⚠ **다음 시즌을 열기 전에 이번 시즌의 세계를 닫아야 한다.**
  // `openProSeason`은 현재 연도 +1로 새 시즌을 직접 여는데, 그러면
  // `runSeasonRollover`를 안 타므로 **그 해 세계 처리가 통째로 사라진다** —
  // 실측: 주인공이 지명된 해의 NPC 사건이 `fa_signed 6`뿐이었고 드래프트·
  // 은퇴·이적·연도기록이 전부 없었으며 주인공 나이도 안 올랐다.
  // 연도 가드가 있어 롤오버가 이미 돌았으면 그냥 지나간다.
  const closingYear = get(seasonStore).seasonYear;
  await runWorldSeasonEnd(closingYear);
  // ⚠ **끝나는 시즌의 리그를 넘긴다.** 이 시점엔 아직 고교·대학 시즌이다 —
  //   드래프트 결정이 `careerStage`를 먼저 pro로 바꿔 놓았을 뿐이다.
  //   안 넘기면 프로 데뷔도 안 한 사람의 연차가 1이 된다(A7).
  gameStore.advanceSeasonYear(closingYear, get(seasonStore).leagueId);

  // 프로 시즌 열기는 `proSeason`이 정본이다 — 예전엔 여기·재계약 모달·
  // 시즌 롤오버 셋이 각자 리그 분기를 적고 있었다
  await openProSeason(action.leagueId, action.teamId);

  gameStore.clearCareerResults();
  gameStore.setCareerApplicationsSubmitted(false);
  seasonStore.resolvePendingAction("draftNotification");
  await gameStore.save();
  await seasonStore.save();
}
