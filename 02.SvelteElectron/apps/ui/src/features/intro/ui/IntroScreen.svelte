<script lang="ts">
  export let onNew: () => void;
  export let onContinue: () => void;

  export let hasSave = false;
  export let loading = false;
  export let errorMsg = "";
</script>

<div class="intro">
  <div class="center">
    <h1 class="title">ProjectB</h1>
    <p class="subtitle">투수 육성 시뮬레이션</p>
    <p class="year">2026</p>

    <div class="buttons">
      <button class="btn primary" on:click={onNew}>새 게임 시작</button>
      <button class="btn secondary" on:click={onContinue} disabled={!hasSave || loading}>
        {loading ? "불러오는 중..." : "이어하기"}
      </button>
    </div>

    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}

    {#if !hasSave}
      <p class="hint">저장된 데이터가 없습니다</p>
    {/if}
  </div>
</div>

<style>
  .intro {
    width: 100vw;
    height: 100vh;
    background: #080f1e;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .title {
    margin: 0;
    font-size: 72px;
    font-weight: 900;
    color: #e8f2ff;
    letter-spacing: 4px;
  }

  .subtitle {
    margin: 0;
    font-size: 18px;
    color: #6a8fc4;
    letter-spacing: 2px;
  }

  .year {
    margin: 0 0 24px;
    font-size: 14px;
    color: #3d5a8a;
    letter-spacing: 3px;
  }

  .buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 240px;
  }

  .btn {
    width: 100%;
    padding: 14px;
    border: 0;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn.primary {
    background: #2b5aaa;
    color: #fff;
  }

  .btn.primary:hover {
    background: #3a6ecf;
  }

  .btn.secondary {
    background: #1a2840;
    color: #9bbce8;
    border: 1px solid #2e4872;
  }

  .btn.secondary:hover:not(:disabled) {
    background: #243655;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .error {
    margin: 8px 0 0;
    color: #ff7d7d;
    font-size: 13px;
  }

  .hint {
    margin: 4px 0 0;
    color: #3d5270;
    font-size: 13px;
  }
</style>
