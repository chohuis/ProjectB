<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { confirmCareerResults } from "../../../shared/usecases/careerDecision";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
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
  // 🔴 **체육부대는 여기 있을 자리가 아니었다** (2026-09-01, A 회신 2차).
  //
  //   `sportsMilitaryApplied` 를 `true` 로 만드는 코드가 저장소에 **0건**이라
  //   이 갈래는 화면에 **뜬 적이 없다.** 리터럴 `false` 둘과 읽는 곳 하나뿐이었다.
  //
  //   시점도 대상도 다르다 —
  //     진로 허브   고2 W28 · 대학 W29     아마추어 진로(대학·독립·드래프트)
  //     체육부대    W46 후보공개 → W50 결과  **프로 선수** 대상
  //
  //   진짜 경로는 `advanceWeek:2263` 이 `p.sportsUnitApplied` 로 이미 제대로
  //   돈다(선발 → `enlistProtagonist("sports", …)` · 탈락 → `militaryEnlistAsk`).
  //   여기 두면 죽은 갈래가 둘이 된다.

  let draftRevealed = false;
  let universityRevealed = false;
  let indieRevealed = false;

  $: canProceed =
    (!draftApplied || draftRevealed) &&
    (!hasUniv     || universityRevealed) &&
    (!hasIndie    || indieRevealed);

  function teamName(teamId: string | null): string {
    if (!teamId) return "-";
    return $teamsL10n.find((t) => t.id === teamId)?.name ?? teamId;
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
    await confirmCareerResults();
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
    background: rgba(10, 18, 38, 0.52);
    display: flex; align-items: center; justify-content: center;
    z-index: 260;
  }
  .modal {
    width: min(600px, 94vw);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 24px;
    display: grid;
    gap: 16px;
  }
  .chip { margin: 0; font-size: 11px; color: var(--ink); }
  h2 { margin: 4px 0 0; color: var(--ink); }

  .results-grid { display: grid; gap: 10px; }

  .result-block {
    border-radius: 10px;
    padding: 14px 16px;
    display: grid;
    gap: 8px;
    border: 1px solid var(--line);
    background: var(--panel-sunk);
  }
  .result-block.pass    { background: rgba(31, 122, 71, 0.10); border-color: var(--ok); }
  .result-block.fail    { background: var(--panel); border-color: rgba(179, 49, 31, 0.26); }
  .result-block.pending { background: var(--panel); border-color: var(--line); }

  .block-label { margin: 0; font-size: 11px; color: var(--ink-mid); }
  .block-main  { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }
  .block-sub   { margin: 0; font-size: 12px; color: var(--ink-mid); }
  .fail-text   { color: var(--bad); }

  .reveal-btn {
    background: var(--panel-sunk);
    border: 1px solid var(--ink-mute);
    color: var(--ink);
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    width: fit-content;
  }
  .reveal-btn:hover { background: var(--line); }

  .guide { margin: 0; font-size: 13px; color: var(--ink-mid); }

  .actions { display: flex; justify-content: flex-end; }
  button:not(.reveal-btn) {
    background: var(--line); border: 1px solid var(--ink-mute);
    color: var(--ink); border-radius: 8px;
    padding: 9px 18px; cursor: pointer; font-size: 14px;
  }
  button:not(.reveal-btn):disabled { opacity: 0.5; cursor: default; }
</style>
