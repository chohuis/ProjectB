<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import type { PendingAction } from "../../../shared/types/season";

  export let action: Extract<PendingAction, { type: "trade" }>;

  let resolving = false;

  $: fromTeamName = $masterStore.teams.find((t) => t.id === action.fromTeamId)?.name ?? action.fromTeamId;
  $: toTeamName = $masterStore.teams.find((t) => t.id === action.toTeamId)?.name ?? action.toTeamId;
  $: hasNoTrade = $gameStore.protagonist.contract?.noTrade ?? false;

  async function acceptTrade() {
    if (resolving) return;
    resolving = true;
    seasonStore.pushPendingAction({
      type: "event",
      eventId: "EVT_TRADE_CONFIRMED",
      title: "트레이드 확정",
      description: `${fromTeamName} -> ${toTeamName} 이적이 확정되었습니다.`,
      choices: [{ id: "ok", label: "확인" }],
    });
    gameStore.applyTradeTransfer(action.toTeamId);
    seasonStore.resolvePendingAction("trade");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function rejectTrade() {
    if (resolving || !hasNoTrade) return;
    resolving = true;
    seasonStore.resolvePendingAction("trade");
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <h2>트레이드 통보</h2>
    <p>{fromTeamName} -> {toTeamName}</p>
    {#if hasNoTrade}
      <p class="note">계약의 트레이드 거부권을 행사할 수 있습니다.</p>
    {/if}
    <div class="actions">
      <button disabled={resolving} on:click={acceptTrade}>수락</button>
      {#if hasNoTrade}
        <button disabled={resolving} on:click={rejectTrade}>거부권 행사</button>
      {/if}
    </div>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; z-index:235; }
  .modal { width:min(500px,90vw); background:#102038; border:1px solid #3e6397; border-radius:12px; padding:20px; display:grid; gap:10px; }
  h2 { margin:0; color:#eef6ff; }
  p { margin:0; color:#c8dcf6; }
  .note { color:#f2d596; font-size:12px; }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  button { border:1px solid #3f6299; background:#1a2f52; color:#e6f1ff; border-radius:8px; padding:8px 12px; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
</style>
