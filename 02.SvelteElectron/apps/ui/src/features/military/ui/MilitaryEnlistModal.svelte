<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";

  let resolving = false;
  $: eligibleSportsUnit =
    $gameStore.protagonist.pitching.ovr >= 75 &&
    $gameStore.achievements.some((a) => a.id === "ACH_NATIONAL_TEAM" && a.unlockedAt !== null);

  async function enlist() {
    if (resolving) return;
    resolving = true;
    gameStore.enlistMilitary(eligibleSportsUnit ? "sports" : "general");
    seasonStore.initSeason("LEAGUE_MILITARY", ($seasonStore.seasonYear || 2026) + 1, 104, []);
    seasonStore.setSchedule([]);
    seasonStore.resolvePendingAction("militaryEnlist");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <h2>군 입대</h2>
    <p>입대 후 104주 동안 군 복무가 진행됩니다.</p>
    <p>배치: {eligibleSportsUnit ? "체육부대" : "일반부대"}</p>
    <div class="actions">
      <button disabled={resolving} on:click={enlist}>입대 진행</button>
    </div>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; z-index:245; }
  .modal { width:min(480px,90vw); background:#10233c; border:1px solid #40659a; border-radius:12px; padding:20px; display:grid; gap:10px; }
  h2 { margin:0; color:#eef6ff; }
  p { margin:0; color:#cbe0f9; }
  .actions { display:flex; justify-content:flex-end; }
  button { border:1px solid #3f629a; background:#1a3052; color:#e8f2ff; border-radius:8px; padding:8px 12px; cursor:pointer; }
</style>
