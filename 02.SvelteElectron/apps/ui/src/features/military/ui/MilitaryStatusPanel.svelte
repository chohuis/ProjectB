<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";

  const TOTAL_WEEKS = 100;

  $: p = $gameStore.protagonist;
  $: remainingWeeks = Math.max(0, TOTAL_WEEKS - p.militaryServiceWeeks);
  $: progress = Math.round((p.militaryServiceWeeks / TOTAL_WEEKS) * 100);
  $: unitLabel = p.sportsUnitSelected ? "체육부대" : "일반부대";
  $: hasContract = !!p.contract;
</script>

<section class="panel">
  <div class="head">
    <h3>군 복무 상태</h3>
    <div class="badges">
      <span class="badge" class:badge-sports={p.sportsUnitSelected}>{unitLabel}</span>
      {#if hasContract}
        <span class="badge badge-contract">계약 +2년 적용됨</span>
      {/if}
    </div>
  </div>
  <div class="grid">
    <p>남은 기간: <strong>{remainingWeeks}주</strong></p>
    <p>복무 진행: <strong>{progress}%</strong></p>
    <p>컨디션: <strong>{p.condition}</strong></p>
    <p>피로도: <strong>{p.fatigue}</strong></p>
    <p>사기: <strong>{p.morale}</strong></p>
    {#if p.militaryDischargeYear}
      <p>전역 예정: <strong>{p.militaryDischargeYear}년 W48</strong></p>
    {/if}
  </div>
  <div class="bar">
    <div class="fill" style={`width:${progress}%`}></div>
  </div>
</section>

<style>
  .panel {
    background: #1a253c;
    border: 1px solid #3c547f;
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
    color: #eef5ff;
  }
  .badges {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .badge {
    font-size: 11px;
    color: #ffe8a8;
    border: 1px solid #8b6a2d;
    background: #3a2f14;
    border-radius: 999px;
    padding: 2px 8px;
  }
  .badge.badge-sports {
    color: #80f0b0;
    border-color: #2a7a50;
    background: #0e2a1a;
  }
  .badge.badge-contract {
    color: #ffd060;
    border-color: #7a5a10;
    background: #2a1e04;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px 10px;
  }
  p {
    margin: 0;
    color: #cfe0fa;
    font-size: 12px;
  }
  strong {
    color: #f5fbff;
  }
  .bar {
    height: 8px;
    background: #0e1a30;
    border: 1px solid #304666;
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, #2f79d4, #4db58a);
  }
  @media (max-width: 960px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
