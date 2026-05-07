<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import type { PendingAction } from "../../../shared/types/season";
  import { isFaEligible } from "../../../shared/utils/faEngine";

  export let action: Extract<PendingAction, { type: "optionClause" }>;

  let resolving = false;

  async function confirmTeamOption() {
    if (resolving) return;
    resolving = true;
    gameStore.applyOptionResult({
      exercised: action.exercised,
      nextSalary: action.nextSalary,
      optionType: "team",
    });
    seasonStore.resolvePendingAction("optionClause");
    if (!action.exercised && isFaEligible($gameStore.protagonist, $gameStore.schoolState.attendsUniversity)) {
      seasonStore.pushPendingAction({ type: "faMarket" });
    } else {
      seasonStore.pushPendingAction({
        type: "salaryNegotiation",
        teamId: $gameStore.protagonist.contract?.teamId ?? $gameStore.protagonist.teamId,
        leagueId: $gameStore.protagonist.contract?.leagueId ?? $gameStore.protagonist.leagueId,
        offeredSalary: action.nextSalary,
        durationYears: 1,
        signingBonus: 0,
      });
    }
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function choosePlayerOption(exercised: boolean) {
    if (resolving) return;
    resolving = true;
    gameStore.applyOptionResult({
      exercised,
      nextSalary: action.nextSalary,
      optionType: "player",
    });
    seasonStore.resolvePendingAction("optionClause");
    if (!exercised && isFaEligible($gameStore.protagonist, $gameStore.schoolState.attendsUniversity)) {
      seasonStore.pushPendingAction({ type: "faMarket" });
    } else {
      seasonStore.pushPendingAction({
        type: "salaryNegotiation",
        teamId: $gameStore.protagonist.contract?.teamId ?? $gameStore.protagonist.teamId,
        leagueId: $gameStore.protagonist.contract?.leagueId ?? $gameStore.protagonist.leagueId,
        offeredSalary: action.nextSalary,
        durationYears: 1,
        signingBonus: 0,
      });
    }
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <h2>옵션 조항</h2>
    {#if action.optionType === "team"}
      <p>
        구단 옵션 결과:
        {action.exercised ? "구단이 옵션을 행사했습니다." : "구단이 옵션을 행사하지 않았습니다."}
      </p>
      <button disabled={resolving} on:click={confirmTeamOption}>확인</button>
    {:else}
      <p>선수 옵션을 행사할지 선택하세요.</p>
      <div class="actions">
        <button disabled={resolving} on:click={() => choosePlayerOption(true)}>선수 옵션 행사</button>
        <button disabled={resolving} on:click={() => choosePlayerOption(false)}>옵션 거부 (FA)</button>
      </div>
    {/if}
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; z-index:230; }
  .modal { width:min(520px,92vw); background:#10203a; border:1px solid #3b5f95; border-radius:12px; padding:20px; display:grid; gap:12px; }
  h2 { margin:0; color:#eff6ff; }
  p { margin:0; color:#c8dcf6; }
  .actions { display:flex; gap:10px; }
  button { border:1px solid #3f629a; background:#1a2f54; color:#e5f0ff; border-radius:8px; padding:8px 12px; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
</style>
