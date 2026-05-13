<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";

  let resolving = false;

  $: univPassed = $gameStore.schoolState.fallbackUniversityPassed;
  $: indiePassed = $gameStore.schoolState.fallbackIndependentPassed;
  $: sportsPassed = $gameStore.schoolState.fallbackSportsMilitaryPassed;
  $: draftPassed = $gameStore.schoolState.fallbackDraftPassed;

  function teamName(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  async function chooseResult(kind: "draft" | "university" | "independent" | "sports" | "general", teamId?: string) {
    if (resolving) return;
    resolving = true;

    if (kind === "draft") {
      seasonStore.resolvePendingAction("careerChoice");
      seasonStore.pushPendingAction({
        type: "salaryNegotiation",
        teamId: $gameStore.schoolState.fallbackDraftTeamId ?? $gameStore.protagonist.teamId,
        leagueId: "LEAGUE_KBL",
        offeredSalary: Math.max(3000, Math.round(($gameStore.protagonist.pitching.ovr - 45) * 220)),
        durationYears: 2,
        signingBonus: $gameStore.schoolState.fallbackDraftSigningBonus,
      });
      gameStore.setDraftIntent(false);
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.clearFallbackAdmissions();
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
    } else if (kind === "sports") {
      gameStore.enlistMilitary("sports");
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.setDraftIntent(false);
      gameStore.clearFallbackAdmissions();
      gameStore.setCareerFinalChoice("sports");
      seasonStore.resolvePendingAction("careerChoice");
    } else {
      gameStore.enlistMilitary("general");
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.setDraftIntent(false);
      gameStore.clearFallbackAdmissions();
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
      <h2>W51 최종 선택</h2>
    </div>

    <p class="body-text">합격/지명 결과에서 최종 경로 1개를 선택하세요.</p>
    <div class="options">
      {#if draftPassed}
        <button class="opt-btn" type="button" on:click={() => chooseResult("draft")}>
          <span class="opt-label">드래프트 지명: {teamName($gameStore.schoolState.fallbackDraftTeamId ?? "-")} / {$gameStore.schoolState.fallbackDraftRound}R {$gameStore.schoolState.fallbackDraftPick}P</span>
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
      {#if sportsPassed}
        <button class="opt-btn" type="button" on:click={() => chooseResult("sports")}>
          <span class="opt-label">체육부대 입대</span>
        </button>
      {/if}
      {#if !draftPassed && univPassed.length === 0 && indiePassed.length === 0 && !sportsPassed}
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
  .opt-btn { background: #111e38; border: 1px solid #2a4068; border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; display: block; width: 100%; }
  .opt-btn.danger { background: #3a1f1f; border-color: #804040; }
  .opt-label { color: #dceeff; font-weight: 600; }
</style>
