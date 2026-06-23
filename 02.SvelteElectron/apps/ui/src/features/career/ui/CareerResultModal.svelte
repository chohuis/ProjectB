<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";
  import { calcKblDraftContract } from "../../../shared/utils/draftSalaryTable";

  let resolving = false;

  $: results = $gameStore.schoolState.careerResults;
  $: univPassed = results?.universityPassed ?? [];
  $: indiePassed = results?.independentPassed ?? [];
  $: draftPassed = results?.draftDrafted ?? false;

  // 대학 재학 중 여부 및 학년
  $: isUniversity = $gameStore.protagonist.careerStage === "university";
  $: univYear = isUniversity
    ? Math.floor(Math.max(0, ($gameStore.schoolState.universityWeek ?? 1) - 1) / 52)
    : -1;
  $: isFinalYear = univYear >= 3;
  $: canContinue = isUniversity && !isFinalYear && !draftPassed;

  // 독립리그 계속 여부
  $: isIndependent = $gameStore.protagonist.careerStage === "independent";
  $: canContinueIndie = isIndependent && !draftPassed;

  function teamName(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  async function continueUniversity() {
    if (resolving) return;
    resolving = true;
    gameStore.setCareerApplicationsSubmitted(false);
    gameStore.clearCareerResults();
    seasonStore.resolvePendingAction("careerChoice");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function chooseResult(kind: "draft" | "university" | "independent" | "sports" | "general", teamId?: string) {
    if (resolving) return;
    resolving = true;

    if (kind === "draft") {
      const pickNo  = results?.draftPick   ?? 80;
      const teamId  = results?.draftTeamId ?? $gameStore.protagonist.teamId;
      const { salary, durationYears, signingBonus } = calcKblDraftContract(pickNo, teamId);
      seasonStore.resolvePendingAction("careerChoice");
      seasonStore.pushPendingAction({
        type: "draftNotification",
        teamId,
        leagueId: "LEAGUE_KBL",
        round:    results?.draftRound ?? 10,
        pickNo,
        salary,
        durationYears,
        signingBonus,
        altUniversityTeamId:  univPassed[0] ?? undefined,
        altIndependentTeamId: indiePassed[0] ?? undefined,
      });
      // clearCareerResults는 DraftNotificationModal에서 처리
      gameStore.setCareerFinalChoice("draft");
    } else if (kind === "university" && teamId) {
      gameStore.applyDraftDecision({ stage: "university", leagueId: "LEAGUE_UNIVERSITY", teamId });
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.setCareerFinalChoice("university");
      seasonStore.resolvePendingAction("careerChoice");
    } else if (kind === "independent" && teamId) {
      gameStore.applyDraftDecision({ stage: "independent", leagueId: "LEAGUE_INDEPENDENT", teamId });
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.setCareerFinalChoice("independent");
      seasonStore.resolvePendingAction("careerChoice");
      // 입단 계약 협상 발동
      seasonStore.pushPendingAction({
        type: "salaryNegotiation",
        teamId,
        leagueId: "LEAGUE_INDEPENDENT",
        offeredSalary: Math.max(800, Math.round(($gameStore.protagonist.pitching.ovr - 40) * 60)),
        durationYears: 1,
        signingBonus: 0,
      });
    } else {
      // 전원 탈락: 현역 입대 (고3 강제 케이스)
      gameStore.enlistMilitary("general", 52, false, $seasonStore.seasonYear);
      seasonStore.initSeason("LEAGUE_MILITARY", ($seasonStore.seasonYear || 2026) + 1, 100, []);
      seasonStore.setSchedule([]);
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.clearCareerResults();
      gameStore.setCareerFinalChoice("general");
      seasonStore.resolvePendingAction("careerChoice");
    }

    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <div class="modal">
    <div class="modal-header">
      <span class="chip">진로 결정</span>
      <h2>W47 최종 선택</h2>
    </div>

    <p class="body-text">합격/지명 결과에서 최종 경로 1개를 선택하세요.</p>
    <div class="options">
      {#if canContinue}
        <button class="opt-btn continue" type="button" on:click={continueUniversity}>
          <span class="opt-label">다음 학년 진급 ({univYear + 2}학년)</span>
          <span class="opt-sub">드래프트 미지명 — 대학 계속</span>
        </button>
      {/if}
      {#if canContinueIndie}
        <button class="opt-btn continue" type="button" on:click={continueUniversity}>
          <span class="opt-label">독립리그 계속</span>
          <span class="opt-sub">드래프트 미지명 — 독립리그 시즌 계속</span>
        </button>
      {/if}
      {#if draftPassed}
        <button class="opt-btn" type="button" on:click={() => chooseResult("draft")}>
          <span class="opt-label">드래프트 지명: {teamName(results?.draftTeamId ?? "-")} / {results?.draftRound}R {results?.draftPick}P</span>
        </button>
      {/if}
      {#each univPassed as teamId}
        <button class="opt-btn" type="button" on:click={() => chooseResult("university", teamId)}>
          <span class="opt-label">대학 합격: {teamName(teamId)}</span>
        </button>
      {/each}
      {#each indiePassed as teamId}
        <button class="opt-btn" type="button" on:click={() => chooseResult("independent", teamId)}>
          <span class="opt-label">독립리그 합격: {teamName(teamId)}</span>
        </button>
      {/each}
      {#if !draftPassed && univPassed.length === 0 && indiePassed.length === 0}
        <button class="opt-btn danger" type="button" on:click={() => chooseResult("general")}>
          <span class="opt-label">전원 탈락: 현역 입대</span>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .modal { background: #0e1a30; border: 1px solid #3a5898; border-radius: 16px; padding: 24px; width: min(700px, 92vw); display: grid; gap: 14px; }
  .chip { font-size: 11px; color: #7a9ad0; }
  h2 { margin: 0; color: #e8f0ff; }
  .body-text { margin: 0; color: #a8c0e0; }
  .options { display: grid; gap: 8px; }
  .opt-btn { background: #111e38; border: 1px solid #2a4068; border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; display: grid; width: 100%; gap: 2px; }
  .opt-btn.danger { background: #3a1f1f; border-color: #804040; }
  .opt-btn.continue { background: #0e2818; border-color: #2a6040; }
  .opt-label { color: #dceeff; font-weight: 600; }
  .opt-sub { color: #6a9080; font-size: 11px; }
</style>
