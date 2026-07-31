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
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { calcKblDraftContract } from "../utils/draftSalaryTable";
import { buildSalaryIndex, loadRosterRules } from "../repo/newGameV3";
import { canApplyToUniversity } from "../utils/careerTransition";
import { generateKblSchedule } from "../utils/scheduleGen";
import type { PendingAction } from "../types/season";

/** 진로 지원 제출 (`CareerChoiceHubModal.submitApplications`) */
export async function submitCareerApplications(opts: {
  draft: boolean;
  universityChoices?: string[];
  independentChoices?: string[];
}): Promise<void> {
  gameStore.setCareerApplications({
    draftApplied: opts.draft,
    universityChoices: (opts.universityChoices ?? []).slice(0, 3),
    independentChoices: (opts.independentChoices ?? []).slice(0, 3),
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
  kind: "university" | "independent",
  teamId: string,
): Promise<void> {
  const leagueId = kind === "university" ? "LEAGUE_UNIVERSITY" : "LEAGUE_INDEPENDENT";
  gameStore.applyDraftDecision({ stage: kind, leagueId, teamId });
  gameStore.setCareerApplicationsSubmitted(false);
  gameStore.setCareerFinalChoice(kind);
  seasonStore.resolvePendingAction("careerChoice");

  if (kind === "independent") {
    const p = get(gameStore).protagonist;
    const ovr = p.pitching?.ovr ?? p.batting?.ovr ?? 50;
    seasonStore.pushPendingAction({
      type: "salaryNegotiation",
      teamId, leagueId,
      offeredSalary: Math.max(800, Math.round((ovr - 40) * 60)),
      durationYears: 1,
      signingBonus: 0,
    } as PendingAction);
  }
  await gameStore.save();
  await seasonStore.save();
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

  const proTeamIds = get(masterStore).teams
    .filter((t) => t.leagueId === action.leagueId)
    .map((t) => t.id);
  const seasonYear = (get(seasonStore).seasonYear || 2026) + 1;
  seasonStore.initSeason(action.leagueId, seasonYear, 52, proTeamIds);
  seasonStore.setSchedule(await generateKblSchedule(proTeamIds, action.teamId));

  gameStore.clearCareerResults();
  gameStore.setCareerApplicationsSubmitted(false);
  seasonStore.resolvePendingAction("draftNotification");
  await gameStore.save();
  await seasonStore.save();
}
