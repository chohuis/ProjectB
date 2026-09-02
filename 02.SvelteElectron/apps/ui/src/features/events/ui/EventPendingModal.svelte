<script lang="ts">
  import type { PendingAction } from "../../../shared/types/season";
  import { resolveEventPending } from "../../../shared/usecases/runAutoAdvance";

  /**
   * `type: "event"` pending 을 그리는 유일한 자리 (C-13 · HANDOFF_A_TO_C §0.48).
   *
   * 🔴 2026-09-02 실측: 군 이벤트가 매주 한 건까지 pending 을 올리는데 그걸 그리는
   *   Svelte 가 한 곳도 없어 사람 플레이에선 진행이 막혔다. 헤드리스(runAutoAdvance)만 풀었다.
   *
   * ⚠ **효과 적용·pending 해제·저장은 `resolveEventPending` 안에 있다.** 여기서 다시
   *   계산하지 않는다 — 헤드리스와 화면이 같은 함수를 부르므로 한쪽만 고쳐지는 일이 없다.
   */
  export let action: Extract<PendingAction, { type: "event" }>;

  let resolving = false;

  $: choices = action.choices ?? [];

  async function choose(choiceId: string) {
    if (resolving) return;
    resolving = true;
    try {
      await resolveEventPending(action, choiceId);
    } finally {
      resolving = false;
    }
  }
</script>

<div class="overlay">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ev-title">
    <header>
      <p class="chip">이벤트</p>
      <h2 id="ev-title">{action.title}</h2>
    </header>
    <p class="body-text">{action.description}</p>

    {#if choices.length > 0}
      <div class="choices">
        {#each choices as c (c.id)}
          <!-- `opt` 는 scripts/drive.mjs 가 "선택 대기의 선택지"로 알아보는 훅 — 소식의 결정 버튼과 같은 이름이라 드라이버가 첫 선택지를 고르고 넘어간다 -->
          <button class="choice opt" type="button" disabled={resolving} on:click={() => choose(c.id)}>
            <span class="label">{c.label}</span>
            {#if c.effectHint}<span class="hint">{c.effectHint}</span>{/if}
          </button>
        {/each}
      </div>
    {:else}
      <!-- 선택지가 없는 이벤트 — 읽고 넘긴다. resolveEventPending 은 choices[0] 폴백이라 빈 배열이어도 pending 을 지운다 -->
      <div class="actions">
        <button class="choice single" type="button" disabled={resolving} on:click={() => choose("")}>확인</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display: flex; align-items: center; justify-content: center; z-index: 245; }
  .modal {
    width: min(520px, 92vw); max-height: 88vh; overflow-y: auto;
    background: var(--panel); color: var(--ink);
    border: 1px solid var(--line); border-top: 4px solid var(--warn); border-radius: var(--radius);
    padding: 22px 24px; display: grid; gap: 14px;
  }
  .chip { margin: 0; font-size: 11px; font-weight: 700; color: var(--warn); letter-spacing: .06em; }
  h2 { margin: 4px 0 0; font-size: 18px; color: var(--ink); }
  .body-text { margin: 0; color: var(--ink-mid); font-size: 13.5px; white-space: pre-line; line-height: 1.6; }
  .choices { display: grid; gap: 8px; }
  .choice {
    display: grid; gap: 3px; text-align: left;
    border: 1px solid var(--line-strong); border-radius: var(--radius);
    background: var(--panel-sunk); color: var(--ink);
    padding: 10px 12px; cursor: pointer;
  }
  .choice:hover:not(:disabled) { border-color: var(--t-accent); background: var(--panel); }
  .choice:disabled { opacity: .5; cursor: default; }
  .choice .label { font-weight: 700; font-size: 13.5px; }
  /* 효과는 숨기지 않는다 — 값을 그대로 적는다 (§27 · effectHint 원칙) */
  .choice .hint { color: var(--ink-mute); font-size: 11.5px; }
  .actions { display: flex; justify-content: flex-end; }
  .choice.single { text-align: center; padding: 9px 20px; }
</style>
