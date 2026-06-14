<script lang="ts">
  import type { TrainingStat } from "../../../shared/types/main";
  export let stats: TrainingStat[];
  export let condition: number = 0;
  export let fatigue: number = 0;
  export let morale: number = 0;
  export let extraLogs: string[] = [];
</script>

<div class="training-result">
  <div class="stat-list">
    {#each stats as stat}
      <div class="stat-row" class:leveled={stat.leveledUp}>
        <span class="stat-label">{stat.label}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:{stat.pct}%"></div>
        </div>
        <span class="stat-pct">{stat.pct}%</span>
        <span class="stat-cur">
          {#if stat.leveledUp}
            <span class="leveled-up">{stat.current} (+1) ★</span>
          {:else}
            현재 {stat.current}
          {/if}
        </span>
      </div>
    {/each}
  </div>

  <div class="status-row">
    <span class="status-item"><span class="status-key">컨디션</span> {condition}</span>
    <span class="sep">/</span>
    <span class="status-item"><span class="status-key">피로도</span> {fatigue}</span>
    <span class="sep">/</span>
    <span class="status-item"><span class="status-key">사기</span> {morale}</span>
  </div>

  {#if extraLogs.length > 0}
    <div class="extra-logs">
      {#each extraLogs as log}
        <p class="extra-log">{log}</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .training-result {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .stat-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .stat-row {
    display: grid;
    grid-template-columns: 52px 1fr 36px 90px;
    align-items: center;
    gap: 8px;
  }

  .stat-label {
    font-size: 12px;
    color: #8aabda;
    text-align: right;
    white-space: nowrap;
  }

  .bar-track {
    height: 6px;
    background: #1a2d4a;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid #243a58;
  }

  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #2a6cb8, #4d9ef5);
    border-radius: 3px;
    min-width: 2px;
  }

  .leveled .bar-fill {
    background: linear-gradient(90deg, #c47c00, #f0b030);
  }

  .stat-pct {
    font-size: 11px;
    color: #6a8ab0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .stat-cur {
    font-size: 11px;
    color: #7a9ac8;
    white-space: nowrap;
  }

  .leveled-up {
    color: #f0b030;
    font-weight: 700;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #111e30;
    border-radius: 6px;
    border: 1px solid #1e3050;
  }

  .status-item {
    font-size: 12px;
    color: #c8dcf8;
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .status-key {
    color: #5a7aa8;
    font-size: 11px;
  }

  .sep {
    color: #2a3e58;
    font-size: 11px;
  }

  .extra-logs {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 4px;
    border-top: 1px solid #1a2d4a;
  }

  .extra-log {
    font-size: 12px;
    color: #7a96c0;
    margin: 0;
    line-height: 1.5;
  }
</style>
