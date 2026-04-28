<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { hasPendingAction, nextPendingAction } from "../../../shared/stores/season";
  import { advanceWeek } from "../../../shared/usecases/advanceWeek";
  import { t } from "../../../shared/i18n";

  export let dayLabel: string;
  export let teamName: string;
  export let playerName: string;

  let advancing = false;

  $: btnDisabled = advancing || $hasPendingAction;

  $: btnLabel =
    $nextPendingAction?.type === "game"    ? "경기 대기 중" :
    $nextPendingAction?.type === "message" ? "메시지 확인 필요" :
    $nextPendingAction?.type === "event"   ? "이벤트 처리 필요" :
    advancing ? "진행 중..." : "주 진행";

  async function handleAdvance() {
    if (btnDisabled) return;
    advancing = true;
    try {
      const result = await advanceWeek();
      gameStore.applyWeekResult({}, result.logs, [], result.processedWeek);
    } finally {
      advancing = false;
    }
  }
</script>

<header class="header">
  <div>
    <h1>ProjectB</h1>
    <p>{$t("header.playerLine", { team: teamName, player: playerName })}</p>
  </div>
  <div class="right">
    <strong>{dayLabel}</strong>
    <div class="controls">
      <button
        class="advance-button"
        on:click={handleAdvance}
        disabled={btnDisabled}
        class:advancing
        class:pending={$hasPendingAction}
      >
        {btnLabel}
      </button>
    </div>
  </div>
</header>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #121a2b;
    border: 1px solid #2d3852;
    border-radius: 10px;
    padding: 14px 16px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
  }

  p {
    margin: 4px 0 0;
    color: #aebad7;
  }

  .right {
    display: grid;
    gap: 8px;
    justify-items: end;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .advance-button {
    background: #2b4b80;
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.12s;
    white-space: nowrap;
  }

  .advance-button:hover:not(:disabled) {
    background: #3a5f9e;
  }

  .advance-button:disabled {
    cursor: default;
  }

  .advance-button.advancing {
    background: #1e3356;
    color: #6a8aaa;
  }

  .advance-button.pending {
    background: #5c3a1a;
    color: #f0b060;
    border: 1px solid #8a5a28;
  }
</style>
