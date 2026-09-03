<script lang="ts">
  import type { TrainingStat } from "../../../shared/types/main";
  import { gaugeLabel } from "../../../shared/utils/baseballFormat";
  import type { BarsView } from "../../../shared/utils/dashboardView";

  /**
   * 막대 목록 — 훈련 결과와 **시험 결과·팀 분위기**가 같은 그릇을 쓴다
   * (`PLAN_MESSAGE_DASHBOARDS.md` §2 — 신설은 둘뿐이다).
   *
   * 🔴 **두 벌을 만들지 않았다.** 이름·막대·오른쪽 값 셋이 같은 모양이라
   *    컴포넌트를 하나 더 만들면 색·높이·간격이 곧 갈린다.
   *
   * ⚠ 훈련만 갖는 것 셋(레벨업 별·컨디션 줄·덧글)은 **훈련이 넘길 때만**
   *   그린다 — 시험 결과에 「컨디션 좋음」이 붙으면 안 된다.
   */
  export let stats: TrainingStat[] = [];
  export let condition: number = 0;
  export let fatigue: number = 0;
  export let morale: number = 0;
  export let extraLogs: string[] = [];
  /** 컨디션·피로·사기 한 줄 — 훈련 결과에만 뜻이 있다 */
  export let showStatus = true;
  /** 막대 소식(시험·팀 분위기). 주면 `stats` 대신 이것을 그린다 */
  export let bars: BarsView | null = null;

  /**
   * 그릴 막대들 — 훈련이면 `stats`, 소식이면 `bars` 다.
   *
   * ⚠ 훈련의 오른쪽 칸은 「현재 74」이고 시험은 「87」이다. 값을 여기서
   *   지어내지 않고 만드는 쪽이 정한 글자를 그대로 쓴다.
   */
  $: rows = bars
    ? bars.bars.map((b) => ({
        label: b.label, pct: b.pct, leveled: false,
        pctText: "", valueText: String(b.value), deltaText: b.delta?.text ?? "",
      }))
    : stats.map((s) => ({
        label: s.label, pct: s.pct, leveled: s.leveledUp,
        pctText: `${s.pct}%`,
        valueText: s.leveledUp ? `${s.current} (+1) ★` : `현재 ${s.current}`,
        deltaText: "",
      }));
</script>

<div class="training-result">
  <div class="stat-list">
    {#each rows as row, i (i)}
      <div class="stat-row" class:leveled={row.leveled}>
        <span class="stat-label">{row.label}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:{row.pct}%"></div>
        </div>
        <span class="stat-pct">{row.pctText || row.deltaText}</span>
        <span class="stat-cur">
          {#if row.leveled}
            <span class="leveled-up">{row.valueText}</span>
          {:else}
            {row.valueText}
          {/if}
        </span>
      </div>
    {/each}
  </div>

  <!-- 막대 아래 항목·값 — 학점이 그 자리다. 훈련엔 없다 -->
  {#if bars && bars.foot.length > 0}
    <div class="status-row">
      {#each bars.foot as f, i (i)}
        {#if i > 0}<span class="sep">/</span>{/if}
        <span class="status-item"><span class="status-key">{f.label}</span> {f.value}</span>
      {/each}
    </div>
  {/if}

  {#if rows.length === 0 && bars}
    <p class="bars-empty">{bars.empty}</p>
  {/if}

  {#if showStatus}
  <div class="status-row">
    <span class="status-item"><span class="status-key">컨디션</span> {gaugeLabel(condition)}</span>
    <span class="sep">/</span>
    <span class="status-item"><span class="status-key">피로도</span> {gaugeLabel(fatigue)}</span>
    <span class="sep">/</span>
    <span class="status-item"><span class="status-key">사기</span> {gaugeLabel(morale)}</span>
  </div>
  {/if}

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

  .bars-empty {
    margin: 0;
    font-size: 11px;
    color: var(--ink-mute);
    text-align: center;
    padding: 10px;
  }
</style>
