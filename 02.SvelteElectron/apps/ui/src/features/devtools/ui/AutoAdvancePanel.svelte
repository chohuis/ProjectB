<script lang="ts">
  import { autoAdvanceStore } from "../../../shared/stores/autoAdvance";
  import { runAutoAdvance } from "../../../shared/usecases/runAutoAdvance";

  $: log = $autoAdvanceStore.log;
  $: running = $autoAdvanceStore.running;
  $: stopReason = $autoAdvanceStore.stopReason;
  $: visible = running || stopReason !== null;

  $: recentLog = log.slice(-10);

  function stop() {
    autoAdvanceStore.stop("사용자가 중지");
  }

  function dismiss() {
    autoAdvanceStore.reset();
  }

  async function restart() {
    await runAutoAdvance();
  }
</script>

{#if visible}
  <div class="panel">
    <header class="panel-head">
      <span class="title">자동 진행</span>
      <div class="status-row">
        {#if running}
          <span class="dot dot-run"></span>
          <span class="status-text">진행 중...</span>
        {:else}
          <span class="dot dot-stop"></span>
          <span class="status-text">정지됨</span>
        {/if}
      </div>
    </header>

    {#if stopReason && !running}
      <p class="stop-reason">{stopReason}</p>
    {/if}

    <ul class="log-list">
      {#each recentLog as line}
        <li class="log-line">{line}</li>
      {/each}
    </ul>

    <div class="actions">
      {#if running}
        <button class="btn btn-stop" on:click={stop}>정지</button>
      {:else}
        <button class="btn btn-restart" on:click={restart}>재시작</button>
        <button class="btn btn-dismiss" on:click={dismiss}>닫기</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 300;
    width: 260px;
    background: #0d1b30;
    border: 1px solid #2d4a72;
    border-radius: 10px;
    padding: 12px 14px;
    display: grid;
    gap: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    font-size: 12px;
    font-weight: 700;
    color: #7aaae0;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .dot-run {
    background: #40e080;
    box-shadow: 0 0 6px #40e080;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .dot-stop {
    background: #e06040;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  .status-text {
    font-size: 11px;
    color: #8ab0d8;
  }

  .stop-reason {
    margin: 0;
    font-size: 11px;
    color: #e08060;
    background: rgba(224, 80, 40, 0.1);
    border: 1px solid rgba(224, 80, 40, 0.3);
    border-radius: 6px;
    padding: 5px 8px;
    line-height: 1.4;
    word-break: keep-all;
  }

  .log-list {
    list-style: none;
    margin: 0;
    padding: 6px 8px;
    background: #071020;
    border-radius: 6px;
    display: grid;
    gap: 2px;
    max-height: 140px;
    overflow-y: auto;
  }

  .log-list::-webkit-scrollbar { width: 4px; }
  .log-list::-webkit-scrollbar-thumb { background: #1e3a5a; border-radius: 2px; }

  .log-line {
    font-size: 10px;
    color: #6a90b8;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .log-line:last-child {
    color: #a0c8e8;
  }

  .actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .btn {
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    padding: 5px 12px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn-stop {
    background: #2a1010;
    border-color: #7a2020;
    color: #f07060;
  }

  .btn-stop:hover { background: #3a1818; }

  .btn-restart {
    background: #0f2a18;
    border-color: #2a6040;
    color: #60e090;
  }

  .btn-restart:hover { background: #183820; }

  .btn-dismiss {
    background: #111e34;
    border-color: #2d4060;
    color: #6a90b8;
  }

  .btn-dismiss:hover { background: #1a2a40; }
</style>
