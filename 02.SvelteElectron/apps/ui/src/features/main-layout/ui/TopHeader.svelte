<script lang="ts">
  import { get } from "svelte/store";
  import { gameStore } from "../../../shared/stores/game";

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
        // 세이브 (비동기, fire-and-forget)
        if (window.projectB.gameSave) {
          void window.projectB.gameSave(get(gameStore) as unknown as Record<string, unknown>);
        }
      } else {
        // 브라우저 dev 모드: 로컬 시뮬
        gameStore.applyDayResult(
          { ...coreState, day: coreState.day + 1, morale: Math.min(100, coreState.morale + 1) },
          [`[DAY ${coreState.day + 1}] 훈련 루틴 완료`]
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
    <p>{teamName} · {playerName}</p>
  </div>
  <div class="right">
    <strong>{dayLabel}</strong>
    <button on:click={handleAdvance} disabled={advancing} class:advancing>
      {advancing ? '진행 중…' : '진행'}
    </button>
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

  button {
    background: #2b4b80;
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.12s;
  }
  button:hover:not(:disabled) { background: #3a5f9e; }
  button:disabled, button.advancing { background: #1e3356; color: #6a8aaa; cursor: default; }
</style>
