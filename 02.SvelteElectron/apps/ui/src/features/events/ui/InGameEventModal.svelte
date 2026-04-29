<script lang="ts">
  import { seasonStore } from "../../../shared/stores/season";
  import { gameStore } from "../../../shared/stores/game";
  import type { PendingAction } from "../../../shared/types/season";

  export let action: Extract<PendingAction, { type: "event" }>;

  let resolving = false;

  async function resolve(choiceId?: string) {
    if (resolving) return;
    resolving = true;

    if (choiceId && action.choices) {
      const choice = action.choices.find((c) => c.id === choiceId);
      if (choice?.effects) {
        gameStore.applyEventEffect(choice.effects);
      }
    }

    seasonStore.resolvePendingAction("event", action.eventId);
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay" role="presentation">
  <section class="modal" role="dialog" aria-modal="true" aria-label="이벤트">
    <header class="modal-header">
      <span class="badge">이벤트</span>
      <p class="title">{action.title}</p>
    </header>

    <article class="body">
      {#each action.description.split("\n") as line}
        <p>{line}</p>
      {/each}
    </article>

    {#if action.choices && action.choices.length > 0}
      <footer class="choices">
        {#each action.choices as choice}
          <button
            class="choice-btn"
            disabled={resolving}
            on:click={() => resolve(choice.id)}
          >
            <span class="choice-label">{choice.label}</span>
            {#if choice.effectHint}
              <span class="choice-effect">{choice.effectHint}</span>
            {/if}
          </button>
        {/each}
      </footer>
    {:else}
      <footer class="choices single">
        <button class="choice-btn confirm" disabled={resolving} on:click={() => resolve()}>
          확인
        </button>
      </footer>
    {/if}
  </section>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
    padding: 24px;
  }

  .modal {
    width: min(560px, 95vw);
    background: #111d34;
    border: 1px solid #4a6a9e;
    border-radius: 16px;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    max-height: 80vh;
  }

  .modal-header {
    padding: 16px 20px 14px;
    border-bottom: 1px solid #2a3f65;
    display: grid;
    gap: 6px;
  }

  .badge {
    display: inline-block;
    width: fit-content;
    background: #1f3c6a;
    border: 1px solid #4a75b5;
    border-radius: 999px;
    color: #a8c8f8;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 2px 10px;
  }

  .title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #f0f7ff;
    line-height: 1.3;
  }

  .body {
    padding: 16px 20px;
    overflow-y: auto;
    min-height: 60px;
  }

  .body p {
    margin: 0 0 10px;
    color: #d4e4ff;
    font-size: 14px;
    line-height: 1.6;
  }

  .body p:last-child {
    margin-bottom: 0;
  }

  .choices {
    padding: 14px 20px 20px;
    border-top: 1px solid #2a3f65;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }

  .choices.single {
    grid-template-columns: 1fr;
    max-width: 200px;
    margin: 0 auto;
    width: 100%;
    padding-bottom: 20px;
    border-top: none;
  }

  .choice-btn {
    background: #192d4e;
    border: 1px solid #3a5d94;
    border-radius: 10px;
    color: #ddeeff;
    padding: 10px 14px;
    cursor: pointer;
    text-align: left;
    display: grid;
    gap: 4px;
    transition: background 0.12s, border-color 0.12s;
  }

  .choice-btn:hover:not(:disabled) {
    background: #24406a;
    border-color: #6494cc;
  }

  .choice-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .choice-btn.confirm {
    text-align: center;
    background: #1a4a3a;
    border-color: #3a8060;
    color: #c0eeda;
    font-weight: 600;
    font-size: 14px;
  }

  .choice-btn.confirm:hover:not(:disabled) {
    background: #225e4a;
    border-color: #50a880;
  }

  .choice-label {
    font-size: 14px;
    font-weight: 600;
    color: #e8f2ff;
  }

  .choice-effect {
    font-size: 12px;
    color: #94b8e4;
  }
</style>
