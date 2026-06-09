<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";

  export let sportsUnitSelected = false;  // 체육부대 선발 결과 (부모에서 전달)

  let resolving = false;
  $: unitLabel = sportsUnitSelected ? "체육부대" : "일반부대";

  async function enlist() {
    if (resolving) return;
    resolving = true;
    const unit = sportsUnitSelected ? "sports" : "general";
    gameStore.enlistMilitary(unit, 52, sportsUnitSelected, $seasonStore.seasonYear);
    seasonStore.initSeason("LEAGUE_MILITARY", ($seasonStore.seasonYear || 2026) + 1, 100, []);
    seasonStore.setSchedule([]);
    seasonStore.resolvePendingAction("militaryEnlist");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="chip">군 복무</p>
      <h2>입대</h2>
    </header>
    <div class="info-grid">
      <div class="info-row">
        <span class="label">배치</span>
        <strong class:sports={sportsUnitSelected}>{unitLabel}</strong>
      </div>
      <div class="info-row">
        <span class="label">복무 기간</span>
        <strong>100주 (약 2년)</strong>
      </div>
      <div class="info-row">
        <span class="label">제대 예정</span>
        <strong>W48 (2년 후)</strong>
      </div>
    </div>
    {#if sportsUnitSelected}
      <p class="sports-notice">체육부대 선발로 복무 중에도 야구 훈련이 가능합니다.</p>
    {:else}
      <p class="general-notice">일반부대 복무 중 일부 능력치가 감소할 수 있습니다.</p>
    {/if}
    <div class="actions">
      <button disabled={resolving} on:click={enlist}>입대 진행</button>
    </div>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; z-index:245; }
  .modal { width:min(480px,90vw); background:#10233c; border:1px solid #40659a; border-radius:12px; padding:24px; display:grid; gap:14px; }
  .chip { margin:0; font-size:11px; color:#7aa8e0; }
  h2 { margin:4px 0 0; color:#eef6ff; }
  .info-grid { display:grid; gap:8px; }
  .info-row { display:flex; justify-content:space-between; align-items:center; background:#0d1e38; border:1px solid #2a4068; border-radius:8px; padding:8px 12px; }
  .label { color:#8ab0d8; font-size:13px; }
  strong { color:#d8f0ff; font-size:14px; }
  strong.sports { color:#60d890; }
  .sports-notice { margin:0; color:#60d890; font-size:13px; }
  .general-notice { margin:0; color:#c08060; font-size:13px; }
  .actions { display:flex; justify-content:flex-end; }
  button { border:1px solid #3f629a; background:#1a3052; color:#e8f2ff; border-radius:8px; padding:9px 14px; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
</style>
