<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import DraftBoardModal from "./DraftBoardModal.svelte";

  const dispatch = createEventDispatcher<{ close: void }>();

  type Phase = "results" | "draft-board";
  let phase: Phase = "results";
  let resolving = false;

  $: apps = $gameStore.schoolState.careerApplications;
  $: results = $gameStore.schoolState.careerResults;
  $: draftApplied = apps?.draftApplied ?? false;
  $: hasUniv = (apps?.universityChoices?.length ?? 0) > 0;
  $: hasIndie = (apps?.independentChoices?.length ?? 0) > 0;
  $: hasSports = apps?.sportsMilitaryApplied ?? false;

  let draftRevealed = false;
  let universityRevealed = false;
  let indieRevealed = false;
  let sportsRevealed = false;

  $: canProceed =
    (!draftApplied || draftRevealed) &&
    (!hasUniv     || universityRevealed) &&
    (!hasIndie    || indieRevealed) &&
    (!hasSports   || sportsRevealed);

  function teamName(teamId: string | null): string {
    if (!teamId) return "-";
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  function revealDraft() {
    phase = "draft-board";
  }

  async function onDraftCompleted(e: CustomEvent<{
    drafted: boolean; teamId: string | null; round: number | null; pick: number | null; signingBonus: number;
  }>) {
    const { drafted, teamId, round, pick, signingBonus } = e.detail;
    gameStore.setCareerResults({
      ...(results ?? {
        universityPassed: [],
        independentPassed: [],
        sportsMilitaryPassed: false,
      }),
      draftDrafted: drafted,
      draftTeamId: teamId,
      draftRound: round,
      draftPick: pick,
      draftSigningBonus: signingBonus,
    });
    draftRevealed = true;
    phase = "results";
  }

  function onDraftClose() {
    draftRevealed = true;
    phase = "results";
  }

  async function confirm() {
    if (resolving) return;
    resolving = true;
    seasonStore.resolvePendingAction("careerResults");
    if (!$seasonStore.pendingActions.some((a) => a.type === "careerChoice")) {
      seasonStore.pushPendingAction({ type: "careerChoice" });
    }
    await gameStore.save();
    await seasonStore.save();
    dispatch("close");
    resolving = false;
  }
</script>

{#if phase === "draft-board"}
  <DraftBoardModal
    on:completed={onDraftCompleted}
    on:close={onDraftClose}
  />
{:else}
  <div class="overlay">
    <section class="modal">
      <header>
        <p class="chip">진로 결과</p>
        <h2>W47 지원 결과 확인</h2>
      </header>

      <div class="results-grid">

        {#if draftApplied}
          <div
            class="result-block"
            class:pass={draftRevealed && (results?.draftDrafted ?? false)}
            class:fail={draftRevealed && !(results?.draftDrafted ?? false)}
            class:pending={!draftRevealed}
          >
            <p class="block-label">드래프트</p>
            {#if !draftRevealed}
              <button class="reveal-btn" on:click={revealDraft}>드래프트 보드 확인 →</button>
            {:else if results?.draftDrafted}
              <p class="block-main">{teamName(results.draftTeamId)} / {results.draftRound}R {results.draftPick}P</p>
              <p class="block-sub">계약금 {(results.draftSigningBonus ?? 0).toLocaleString()}만원</p>
            {:else}
              <p class="block-main fail-text">미지명</p>
            {/if}
          </div>
        {/if}

        {#if hasUniv}
          <div
            class="result-block"
            class:pass={universityRevealed && (results?.universityPassed?.length ?? 0) > 0}
            class:fail={universityRevealed && (results?.universityPassed?.length ?? 0) === 0}
            class:pending={!universityRevealed}
          >
            <p class="block-label">대학 지원</p>
            {#if !universityRevealed}
              <button class="reveal-btn" on:click={() => (universityRevealed = true)}>결과 확인 →</button>
            {:else if results?.universityPassed?.length}
              {#each results.universityPassed as teamId}
                <p class="block-main">{teamName(teamId)} 합격</p>
              {/each}
            {:else}
              <p class="block-main fail-text">전원 불합격</p>
            {/if}
          </div>
        {/if}

        {#if hasIndie}
          <div
            class="result-block"
            class:pass={indieRevealed && (results?.independentPassed?.length ?? 0) > 0}
            class:fail={indieRevealed && (results?.independentPassed?.length ?? 0) === 0}
            class:pending={!indieRevealed}
          >
            <p class="block-label">독립리그 지원</p>
            {#if !indieRevealed}
              <button class="reveal-btn" on:click={() => (indieRevealed = true)}>결과 확인 →</button>
            {:else if results?.independentPassed?.length}
              {#each results.independentPassed as teamId}
                <p class="block-main">{teamName(teamId)} 합격</p>
              {/each}
            {:else}
              <p class="block-main fail-text">전원 불합격</p>
            {/if}
          </div>
        {/if}

        {#if hasSports}
          <div
            class="result-block"
            class:pass={sportsRevealed && (results?.sportsMilitaryPassed ?? false)}
            class:fail={sportsRevealed && !(results?.sportsMilitaryPassed ?? false)}
            class:pending={!sportsRevealed}
          >
            <p class="block-label">체육부대</p>
            {#if !sportsRevealed}
              <button class="reveal-btn" on:click={() => (sportsRevealed = true)}>결과 확인 →</button>
            {:else}
              <p class="block-main" class:fail-text={!results?.sportsMilitaryPassed}>
                {results?.sportsMilitaryPassed ? "합격" : "불합격"}
              </p>
            {/if}
          </div>
        {/if}

      </div>

      <p class="guide">
        {canProceed ? "다음 화면에서 최종 진로를 선택합니다." : "모든 결과를 확인한 후 진행할 수 있습니다."}
      </p>

      <div class="actions">
        <button disabled={resolving || !canProceed} on:click={confirm}>진로 선택으로 →</button>
      </div>
    </section>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.78);
    display: flex; align-items: center; justify-content: center;
    z-index: 260;
  }
  .modal {
    width: min(600px, 94vw);
    background: #0d1928;
    border: 1px solid #2d4a7a;
    border-radius: 14px;
    padding: 24px;
    display: grid;
    gap: 16px;
  }
  .chip { margin: 0; font-size: 11px; color: #7aa8e0; }
  h2 { margin: 4px 0 0; color: #e8f2ff; }

  .results-grid { display: grid; gap: 10px; }

  .result-block {
    border-radius: 10px;
    padding: 14px 16px;
    display: grid;
    gap: 8px;
    border: 1px solid #2a4060;
    background: #0e1e38;
  }
  .result-block.pass    { background: #0e2818; border-color: #2a6040; }
  .result-block.fail    { background: #1e1010; border-color: #503030; }
  .result-block.pending { background: #101828; border-color: #2a3a58; }

  .block-label { margin: 0; font-size: 11px; color: #6888b0; }
  .block-main  { margin: 0; font-size: 15px; font-weight: 700; color: #c8e8ff; }
  .block-sub   { margin: 0; font-size: 12px; color: #6888b0; }
  .fail-text   { color: #c06060; }

  .reveal-btn {
    background: #1a2e50;
    border: 1px solid #3a5a90;
    color: #a0c8f0;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    width: fit-content;
  }
  .reveal-btn:hover { background: #1e3860; }

  .guide { margin: 0; font-size: 13px; color: #7090b0; }

  .actions { display: flex; justify-content: flex-end; }
  button:not(.reveal-btn) {
    background: #1a3a6a; border: 1px solid #3a6ab0;
    color: #d8f0ff; border-radius: 8px;
    padding: 9px 18px; cursor: pointer; font-size: 14px;
  }
  button:not(.reveal-btn):disabled { opacity: 0.5; cursor: default; }
</style>
