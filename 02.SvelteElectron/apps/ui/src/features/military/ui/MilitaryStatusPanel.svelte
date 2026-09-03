<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { gaugeLabel } from "../../../shared/utils/baseballFormat";
  import { SERVICE_WEEKS } from "../../../shared/usecases/militaryDecision";
  import { dischargeWeekOf } from "../../../shared/utils/militarySportsCopy";

  // 상무 갈래의 병역 탭 머리 (§39 · 현역은 MilitaryHead). 복무 주 정본은 전역 판정과 같은 SERVICE_WEEKS 다
  const TOTAL_WEEKS = SERVICE_WEEKS;

  $: p = $gameStore.protagonist;
  $: remainingWeeks = Math.max(0, TOTAL_WEEKS - p.militaryServiceWeeks);
  $: progress = Math.round((p.militaryServiceWeeks / TOTAL_WEEKS) * 100);
  $: unitLabel = p.sportsUnitSelected ? "체육부대" : "일반부대";
  $: hasContract = !!p.contract;
  $: dischargeWeek = dischargeWeekOf(p.militaryEnlistWeek, TOTAL_WEEKS);

  $: rank = (() => {
    const w = p.militaryServiceWeeks;
    if (w <= 8)  return "이병";
    if (w <= 34) return "일병";
    if (w <= 60) return "상병";
    return "병장";
  })();
</script>

<section class="panel">
  <div class="head">
    <h3>군 복무 상태</h3>
    <div class="badges">
      <span class="badge badge-rank">{rank}</span>
      <span class="badge" class:badge-sports={p.sportsUnitSelected}>{unitLabel}</span>
      {#if hasContract}
        <span class="badge badge-contract">계약 +2년 적용됨</span>
      {/if}
    </div>
  </div>
  <div class="grid">
    <p>남은 기간: <strong>{remainingWeeks}주</strong></p>
    <p>복무 진행: <strong>{progress}%</strong></p>
    <p>컨디션: <strong>{gaugeLabel(p.condition)}</strong></p>
    <p>피로도: <strong>{gaugeLabel(p.fatigue)}</strong></p>
    <p>사기: <strong>{gaugeLabel(p.morale)}</strong></p>
    {#if p.militaryDischargeYear}
      <!-- ⚠ 「W48」이 박혀 있었다. 전역은 복무 100주가 차는 주라 입대 주에
           따라 달라진다 — 기본 입대 주(W50)면 W46 이다 -->
      <p>전역 예정: <strong>{p.militaryDischargeYear}년{dischargeWeek !== null ? ` W${dischargeWeek}` : ""}</strong></p>
    {/if}
  </div>
  <div class="bar">
    <div class="fill" style={`width:${progress}%`}></div>
  </div>
</section>

<style>
  .panel {
    background: var(--panel-sunk);
    border: 1px solid var(--ink-mute);
    border-radius: 10px;
    padding: 10px 12px;
    display: grid;
    gap: 8px;
    margin-bottom: 10px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    color: var(--ink);
  }
  .badges {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .badge {
    font-size: 11px;
    color: var(--warn);
    border: 1px solid var(--warn);
    background: rgba(154, 101, 16, 0.12);
    border-radius: 999px;
    padding: 2px 8px;
  }
  .badge.badge-rank {
    color: var(--ink);
    border-color: var(--ink-mute);
    background: var(--panel);
    font-weight: 700;
  }
  .badge.badge-sports {
    color: var(--ok);
    border-color: var(--ok);
    background: rgba(31, 122, 71, 0.10);
  }
  .badge.badge-contract {
    color: var(--warn);
    border-color: var(--warn);
    background: rgba(154, 101, 16, 0.12);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px 10px;
  }
  p {
    margin: 0;
    color: var(--ink);
    font-size: 12px;
  }
  strong {
    color: var(--ink);
  }
  .bar {
    height: 8px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, var(--ink-mute), var(--ok));
  }
  @media (max-width: 960px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
