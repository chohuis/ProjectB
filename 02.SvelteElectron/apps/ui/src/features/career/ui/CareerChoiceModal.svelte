<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";
  import { percentileToGrade } from "../../../shared/utils/academicsEngine";

  $: weekInYear = (($seasonStore.currentWeek - 1 + 52) % 52) + 1;
  $: ovr = $gameStore.protagonist.pitching.ovr;
  $: subjects = Object.values($gameStore.schoolState.subjectScores);
  $: avgPct = subjects.length ? subjects.reduce((a, s) => a + s.percentile, 0) / subjects.length : 50;
  $: avgGrade = percentileToGrade(avgPct);

  $: isPrimaryChoice =
    $gameStore.protagonist.careerStage === "highschool" &&
    $gameStore.protagonist.grade === 3 &&
    weekInYear === 50 &&
    !$gameStore.schoolState.fallbackSelectionPending;

  $: isFallbackChoice = $gameStore.schoolState.fallbackSelectionPending;
  $: univPassed = $gameStore.schoolState.fallbackUniversityPassed;
  $: indiePassed = $gameStore.schoolState.fallbackIndependentPassed;
  $: sportsPassed = $gameStore.schoolState.fallbackSportsMilitaryPassed;

  let resolving = false;

  function teamName(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  async function choosePrimary(choice: "draft" | "university" | "independent" | "military") {
    if (resolving) return;
    resolving = true;

    if (choice === "draft") {
      gameStore.setDraftIntent(true);
      gameStore.markCareerChoiceTriggered();
      seasonStore.resolvePendingAction("careerChoice");
    } else if (choice === "university") {
      gameStore.applyDraftDecision({
        stage: "university",
        leagueId: "LEAGUE_UNIVERSITY",
        teamId: $masterStore.teams.find((t) => t.leagueId === "LEAGUE_UNIVERSITY")?.id ?? $gameStore.protagonist.teamId,
      });
      seasonStore.resolvePendingAction("careerChoice");
    } else if (choice === "independent") {
      gameStore.applyDraftDecision({
        stage: "independent",
        leagueId: "LEAGUE_INDEPENDENT",
        teamId: $masterStore.teams.find((t) => t.leagueId === "LEAGUE_INDEPENDENT")?.id ?? $gameStore.protagonist.teamId,
      });
      seasonStore.resolvePendingAction("careerChoice");
    } else {
      gameStore.enlistMilitary("general");
      seasonStore.resolvePendingAction("careerChoice");
    }

    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function chooseFallback(kind: "university" | "independent" | "sports" | "general", teamId?: string) {
    if (resolving) return;
    resolving = true;

    if (kind === "university" && teamId) {
      gameStore.applyDraftDecision({ stage: "university", leagueId: "LEAGUE_UNIVERSITY", teamId });
    } else if (kind === "independent" && teamId) {
      gameStore.applyDraftDecision({ stage: "independent", leagueId: "LEAGUE_INDEPENDENT", teamId });
    } else if (kind === "sports") {
      gameStore.enlistMilitary("sports");
      gameStore.clearFallbackAdmissions();
      gameStore.setDraftIntent(false);
    } else {
      gameStore.enlistMilitary("general");
      gameStore.clearFallbackAdmissions();
      gameStore.setDraftIntent(false);
    }

    seasonStore.resolvePendingAction("careerChoice");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <div class="modal">
    <div class="modal-header">
      <span class="chip">진로 결정</span>
      <h2>{isFallbackChoice ? "W52 결과 확인" : "고3 진로 1차 선택"}</h2>
    </div>

    {#if isPrimaryChoice}
      <p class="body-text">이번 주에 진로를 먼저 정합니다. 드래프트 참가를 고르면 다음 주(W51)에 드래프트를 진행합니다.</p>
      <div class="info-row">
        <span class="info-item">OVR <strong>{ovr}</strong></span>
        <span class="info-item">평균 등급 <strong>{avgGrade}등급</strong></span>
      </div>
      <div class="options">
        <button class="opt-btn" on:click={() => choosePrimary("draft")} type="button"><span class="opt-label">드래프트 참가</span></button>
        <button class="opt-btn" on:click={() => choosePrimary("university")} type="button"><span class="opt-label">바로 대학 진학</span></button>
        <button class="opt-btn" on:click={() => choosePrimary("independent")} type="button"><span class="opt-label">바로 독립리그</span></button>
        <button class="opt-btn" on:click={() => choosePrimary("military")} type="button"><span class="opt-label">바로 군입대</span></button>
      </div>
    {:else if isFallbackChoice}
      <p class="body-text">드래프트 탈락 후 지원 결과입니다. 가능한 경로 중 하나를 선택하세요.</p>
      <div class="options">
        {#each univPassed as teamId}
          <button class="opt-btn" on:click={() => chooseFallback("university", teamId)} type="button">
            <span class="opt-label">대학 합격: {teamName(teamId)}</span>
          </button>
        {/each}
        {#each indiePassed as teamId}
          <button class="opt-btn" on:click={() => chooseFallback("independent", teamId)} type="button">
            <span class="opt-label">독립리그 합격: {teamName(teamId)}</span>
          </button>
        {/each}
        {#if sportsPassed}
          <button class="opt-btn" on:click={() => chooseFallback("sports")} type="button">
            <span class="opt-label">체육부대 입대</span>
          </button>
        {/if}
        {#if univPassed.length === 0 && indiePassed.length === 0 && !sportsPassed}
          <button class="opt-btn ok-btn" on:click={() => chooseFallback("general")} type="button">
            <span class="opt-label">전원 탈락: 현역 입대</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background: #0e1a30;
    border: 1px solid #3a5898;
    border-radius: 16px;
    padding: 32px 36px;
    width: min(560px, 92vw);
    display: grid;
    gap: 20px;
  }

  .modal-header {
    display: grid;
    gap: 8px;
  }

  .chip {
    font-size: 11px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #7a9ad0;
    background: #182a4a;
    border: 1px solid #2a4070;
    border-radius: 4px;
    padding: 2px 8px;
    width: fit-content;
  }

  h2 {
    margin: 0;
    font-size: 22px;
    color: #e8f0ff;
  }

  .body-text {
    margin: 0;
    font-size: 14px;
    color: #a8c0e0;
    line-height: 1.7;
    white-space: pre-line;
  }

  .info-row {
    display: flex;
    gap: 16px;
  }

  .info-item {
    font-size: 13px;
    color: #7a9ad0;
    background: #122040;
    border: 1px solid #2a3e65;
    border-radius: 6px;
    padding: 4px 12px;
  }

  .info-item strong {
    color: #e0eeff;
    margin-left: 4px;
  }

  .options {
    display: grid;
    gap: 8px;
  }

  .opt-btn {
    background: #111e38;
    border: 1px solid #2a4068;
    border-radius: 10px;
    padding: 12px 16px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 4px;
    transition: background 0.1s, border-color 0.1s;
  }

  .opt-btn:hover {
    background: #182a50;
    border-color: #4070b0;
  }

  .opt-btn.ok-btn {
    background: #3a1f1f;
    border-color: #804040;
  }

  .opt-label {
    font-size: 15px;
    font-weight: 600;
    color: #dceeff;
  }
</style>
