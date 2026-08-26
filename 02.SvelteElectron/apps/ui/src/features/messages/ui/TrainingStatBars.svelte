<script lang="ts">
  import type { TrainingStat } from "../../../shared/types/main";
  import { gaugeLabel } from "../../../shared/utils/baseballFormat";
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
    <span class="status-item"><span class="status-key">컨디션</span> {gaugeLabel(condition)}</span>
    <span class="sep">/</span>
    <span class="status-item"><span class="status-key">피로도</span> {gaugeLabel(fatigue)}</span>
    <span class="sep">/</span>
    <span class="status-item"><span class="status-key">사기</span> {gaugeLabel(morale)}</span>
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
    color: var(--ink-mute);
    text-align: right;
    white-space: nowrap;
  }

  .bar-track {
    height: 6px;
    background: var(--panel-sunk);
    border-radius: 3px;
    overflow: hidden;
  }

  /* 진행 막대는 팀 색을 쓴다 — 내 훈련이고, 강조 요소다 */
  .bar-fill {
    height: 100%;
    background: var(--t-dark);
    border-radius: 3px;
    min-width: 2px;
  }

  /* 레벨업만 의미색으로 튄다 */
  .leveled .bar-fill { background: var(--warn); }

  .stat-pct {
    font-size: 11px;
    color: var(--ink-mute);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .stat-cur {
    font-size: 11px;
    color: var(--ink-mid);
    white-space: nowrap;
  }

  .leveled-up {
    color: var(--warn);
    font-weight: 800;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--panel-sunk);
    border-radius: var(--radius);
  }

  .status-item {
    font-size: 12px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .status-key {
    color: var(--ink-mute);
    font-size: 11px;
  }

  .sep {
    color: var(--line-strong);
    font-size: 11px;
  }

  .extra-logs {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }

  .extra-log {
    font-size: 12px;
    color: var(--ink-mid);
    margin: 0;
    line-height: 1.5;
  }
</style>
