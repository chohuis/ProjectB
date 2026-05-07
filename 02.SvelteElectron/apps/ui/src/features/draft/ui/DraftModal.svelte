<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { calcDraftRank, type DraftRankResult } from "../../../shared/utils/draftEngine";

  let result: DraftRankResult | null = null;
  let resolving = false;

  $: careerYear = Math.floor((Math.max(1, $seasonStore.currentWeek) - 1) / 52);
  $: isUniversityEarlyDraft = $gameStore.protagonist.careerStage === "university" && careerYear < 3;
  $: teamName = result?.teamId
    ? $masterStore.teams.find((t) => t.id === result!.teamId)?.name ?? result.teamId
    : null;
  $: defaultUniversityTeamId =
    $masterStore.teams.find((t) => t.leagueId === "LEAGUE_UNIVERSITY")?.id ?? $gameStore.protagonist.teamId;
  $: defaultIndependentTeamId =
    $masterStore.teams.find((t) => t.leagueId === "LEAGUE_INDEPENDENT")?.id ?? $gameStore.protagonist.teamId;

  $: if (result === null) {
    result = calcDraftRank($gameStore.protagonist.scoutScore);
  }

  async function finishAccept() {
    if (!result || !result.drafted || resolving) return;
    resolving = true;
    const offeredSalary = Math.max(3000, Math.round(($gameStore.protagonist.pitching.ovr - 45) * 220));
    seasonStore.resolvePendingAction("draft");
    seasonStore.pushPendingAction({
      type: "salaryNegotiation",
      teamId: result.teamId ?? $gameStore.protagonist.teamId,
      leagueId: "LEAGUE_KBL",
      offeredSalary,
      durationYears: 2,
      signingBonus: result.signingBonus,
    });
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function rejectDraft() {
    if (resolving) return;
    resolving = true;
    if ($gameStore.protagonist.careerStage === "highschool") {
      gameStore.applyDraftDecision({
        stage: "university",
        leagueId: "LEAGUE_UNIVERSITY",
        teamId: defaultUniversityTeamId,
      });
    } else {
      gameStore.applyDraftDecision({
        stage: "independent",
        leagueId: "LEAGUE_INDEPENDENT",
        teamId: defaultIndependentTeamId,
      });
    }
    seasonStore.resolvePendingAction("draft");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function deferAndRedraft() {
    if (resolving) return;
    resolving = true;
    gameStore.markDraftTriggered(false);
    seasonStore.resolvePendingAction("draft");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="badge">드래프트</p>
      <h2>프로 지명 결과</h2>
    </header>

    {#if result?.drafted}
      <div class="summary success">
        <p>{teamName ?? result.teamId} / {result.round}라운드 {result.pick}순위</p>
        <p>계약금: {result.signingBonus.toLocaleString()}만원</p>
      </div>
    {:else}
      <div class="summary fail">
        <p>이번 드래프트에서 지명되지 않았습니다.</p>
      </div>
    {/if}

    <div class="actions">
      {#if result?.drafted}
        <button disabled={resolving} on:click={finishAccept}>수락</button>
        {#if isUniversityEarlyDraft}
          <button disabled={resolving} on:click={deferAndRedraft}>졸업 후 재지명</button>
        {:else}
          <button disabled={resolving} on:click={rejectDraft}>거부</button>
        {/if}
      {:else}
        <button disabled={resolving} on:click={rejectDraft}>
          {$gameStore.protagonist.careerStage === "highschool" ? "대학 진학" : "독립리그"}
        </button>
      {/if}
    </div>
  </section>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .modal {
    width: min(560px, 92vw);
    background: #101a2f;
    border: 1px solid #375483;
    border-radius: 14px;
    padding: 24px;
    display: grid;
    gap: 16px;
  }
  .badge {
    margin: 0;
    font-size: 12px;
    color: #8eb4e8;
  }
  h2 {
    margin: 4px 0 0;
    color: #f0f6ff;
  }
  .summary {
    border-radius: 10px;
    padding: 14px;
    display: grid;
    gap: 6px;
  }
  .summary p {
    margin: 0;
    color: #d3e6ff;
  }
  .summary.success {
    background: #17355a;
    border: 1px solid #3c6aa2;
  }
  .summary.fail {
    background: #3a1d1d;
    border: 1px solid #7e3a3a;
  }
  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  button {
    border: 1px solid #3d5f94;
    background: #1a2b49;
    color: #e7f1ff;
    border-radius: 8px;
    padding: 9px 14px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
