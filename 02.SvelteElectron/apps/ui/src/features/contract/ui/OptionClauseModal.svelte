<script lang="ts">
  import { applyOptionClause } from "../../../shared/usecases/contractDecision";
  import type { PendingAction } from "../../../shared/types/season";

  export let action: Extract<PendingAction, { type: "optionClause" }>;

  let resolving = false;

  async function decide(exercised: boolean) {
    if (resolving) return;
    resolving = true;
    await applyOptionClause(action, exercised);
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <h2>옵션 조항</h2>
    {#if action.optionType === "team"}
      <p>
        구단 옵션 결과:
        {action.exercised ? "구단이 옵션을 행사했습니다." : "구단이 옵션을 행사하지 않았습니다."}
      </p>
      <button disabled={resolving} on:click={() => decide(action.exercised)}>확인</button>
    {:else}
      <p>선수 옵션을 행사할지 선택하세요.</p>
      <div class="actions">
        <button disabled={resolving} on:click={() => decide(true)}>선수 옵션 행사</button>
        <button disabled={resolving} on:click={() => decide(false)}>옵션 거부 (FA)</button>
      </div>
    {/if}
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; z-index:230; }
  .modal { width:min(520px,92vw); background:#10203a; border:1px solid #3b5f95; border-radius:12px; padding:20px; display:grid; gap:12px; }
  h2 { margin:0; color:#eff6ff; }
  p { margin:0; color:#c8dcf6; }
  .actions { display:flex; gap:10px; }
  button { border:1px solid #3f629a; background:#1a2f54; color:#e5f0ff; border-radius:8px; padding:8px 12px; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
</style>
