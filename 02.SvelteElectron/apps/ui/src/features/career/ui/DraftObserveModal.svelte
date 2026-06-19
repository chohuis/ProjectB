<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { runDraftBoardBackground } from "../../../shared/usecases/runDraftBoardBackground";
  import DraftBoardModal from "./DraftBoardModal.svelte";

  const dispatch = createEventDispatcher<{ close: void }>();

  let phase: "ask" | "board" | "running" = "ask";
  let errorMessage = "";
  let closing = false;

  async function closeAndResolve() {
    if (closing) return;
    closing = true;
    seasonStore.resolvePendingAction("draftObserve");
    await seasonStore.save();
    dispatch("close");
  }

  function handleObserve() {
    errorMessage = "";
    phase = "board";
  }

  async function handleSkip() {
    const slotId = $gameStore.currentSlotId;
    if (!slotId) {
      errorMessage = "저장 슬롯 정보를 찾을 수 없습니다.";
      return;
    }

    errorMessage = "";
    phase = "running";
    try {
      await runDraftBoardBackground(slotId, $seasonStore.seasonYear);
      await closeAndResolve();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      phase = "ask";
    }
  }

  async function handleBoardDone() {
    await closeAndResolve();
  }
</script>

{#if phase === "board"}
  <DraftBoardModal
    viewOnly={true}
    on:completed={handleBoardDone}
    on:close={handleBoardDone}
  />
{:else}
  <div class="overlay">
    <section class="modal">
      <header>
        <h2>{$seasonStore.seasonYear} 드래프트</h2>
      </header>
      <p class="desc">KBL 드래프트가 진행됩니다.<br>드래프트를 참관하시겠습니까?</p>
      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
      <div class="actions">
        <button class="btn-primary" on:click={handleObserve} disabled={phase === "running"}>참관</button>
        <button class="btn-secondary" on:click={handleSkip} disabled={phase === "running"}>
          {phase === "running" ? "처리 중..." : "스킵"}
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background: var(--bg-card, #1e1e2e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 24px 28px;
    min-width: 340px;
    max-width: 520px;
    color: var(--text, #e0e0e0);
  }

  h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }

  .desc {
    line-height: 1.6;
    margin-bottom: 20px;
  }

  .error {
    margin: 0 0 16px;
    color: #f08080;
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .btn-primary {
    padding: 8px 20px;
    background: var(--accent, #5865f2);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-secondary {
    padding: 8px 16px;
    background: transparent;
    color: var(--text-muted, #888);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
