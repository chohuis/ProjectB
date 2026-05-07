<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";

  $: p = $gameStore.protagonist;
  $: remainingWeeks = Math.max(0, 104 - p.militaryServiceWeeks);
  $: unitLabel = p.militaryUnit === "sports" ? "체육부대" : "일반부대";
  $: progress = Math.round((p.militaryServiceWeeks / 104) * 100);
</script>

<section class="panel">
  <div class="head">
    <h3>군 복무 상태</h3>
    <span class="badge">{unitLabel}</span>
  </div>
  <div class="grid">
    <p>남은 기간: <strong>{remainingWeeks}주</strong></p>
    <p>복무 진행: <strong>{progress}%</strong></p>
    <p>컨디션: <strong>{p.condition}</strong></p>
    <p>피로도: <strong>{p.fatigue}</strong></p>
    <p>사기: <strong>{p.morale}</strong></p>
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
  }
  h3 {
    margin: 0;
    font-size: 14px;
    color: #eef5ff;
  }
  .badge {
    font-size: 11px;
    color: #ffe8a8;
    border: 1px solid #8b6a2d;
    background: #3a2f14;
    border-radius: 999px;
    padding: 2px 8px;
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
