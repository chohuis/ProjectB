<script lang="ts">
  import { get } from "svelte/store";
  import { gameStore } from "../../../shared/stores/game";
  import { t } from "../../../shared/i18n";

  export let dayLabel: string;
  export let teamName: string;
  export let playerName: string;

  let advancing = false;

  async function handleAdvance() {
    if (advancing) return;
    advancing = true;
    try {
      const coreState = gameStore.toCoreState();

      if (window.projectB?.dayAdvance) {
        const result = await window.projectB.dayAdvance(coreState);
        gameStore.applyDayResult(result.snapshot, result.logs);
        if (window.projectB.gameSave) {
          void window.projectB.gameSave(get(gameStore) as unknown as Record<string, unknown>);
        }
      } else {
        gameStore.applyDayResult(
          { ...coreState, day: coreState.day + 1, morale: Math.min(100, coreState.morale + 1) },
          [`[DAY ${coreState.day + 1}] Training routine completed`]
        );
      }
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
      <button class="advance-button" on:click={handleAdvance} disabled={advancing} class:advancing>
        {advancing ? $t("header.progressRunning") : $t("header.progress")}
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
  }

  .advance-button:hover:not(:disabled) {
    background: #3a5f9e;
  }

  .advance-button:disabled,
  .advance-button.advancing {
    background: #1e3356;
    color: #6a8aaa;
    cursor: default;
  }
</style>
