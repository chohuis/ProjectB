<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { enlistProtagonist } from "../../../shared/usecases/militaryDecision";
  import { seasonStore } from "../../../shared/stores/season";

  export let reason: "rejected" | "overdue";

  let resolving = false;

  $: p = $gameStore.protagonist;
  $: penalty = p.militaryDeferPenalty ?? 0;

  $: title = reason === "rejected" ? "체육부대 탈락" : "입영 기간 만료";
  $: bodyText = reason === "rejected"
    ? p.age <= 26
      ? "이번 체육부대 선발에서 탈락하였습니다.\n내년에 다시 도전하거나 현역으로 입대할 수 있습니다."
      : "이번 체육부대 선발에서 탈락하였습니다.\n현역으로 입대하시겠습니까?"
    : `입영 이행 기간이 만료되었습니다.\n현재 누적 패널티: -${penalty}pt\n현역으로 입대하시겠습니까?`;
  $: canDefer = reason === "overdue" || (reason === "rejected" && p.age <= 26);

  async function enlist() {
    if (resolving) return;
    resolving = true;
    await enlistProtagonist("general");
    seasonStore.resolvePendingAction("militaryEnlistAsk");
    await seasonStore.save();
    resolving = false;
  }

  async function decline() {
    if (resolving) return;
    resolving = true;
    seasonStore.resolvePendingAction("militaryEnlistAsk");
    await gameStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="chip">병역</p>
      <h2>{title}</h2>
    </header>
    <p class="body-text">{bodyText}</p>
    {#if reason === "overdue"}
      <div class="warning-box">
        입대를 미룰수록 패널티가 누적됩니다.
      </div>
    {/if}
    <div class="actions">
      <button class="btn-decline" disabled={resolving || !canDefer} on:click={decline}>다음 시즌으로</button>
      <button class="btn-enlist" disabled={resolving} on:click={enlist}>현역 입대</button>
    </div>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display:flex; align-items:center; justify-content:center; z-index:245; }
  .modal { width:min(440px,90vw); background:var(--panel); border:1px solid var(--ink-mute); border-radius:12px; padding:24px; display:grid; gap:14px; }
  .chip { margin:0; font-size:11px; color:var(--ink); }
  h2 { margin:4px 0 0; color:var(--ink); }
  .body-text { margin:0; color:var(--ink); font-size:14px; white-space:pre-line; line-height:1.6; }
  .warning-box { background:rgba(179, 49, 31, 0.09); border:1px solid var(--bad); border-radius:8px; padding:10px 14px; color:var(--bad); font-size:13px; }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  .btn-decline { border:1px solid var(--line); background:var(--panel); color:var(--ink); border-radius:8px; padding:9px 16px; cursor:pointer; font-size:13px; }
  .btn-enlist { border:1px solid rgba(154, 101, 16, 0.30); background:rgba(154, 101, 16, 0.12); color:var(--warn); border-radius:8px; padding:9px 20px; cursor:pointer; font-size:13px; font-weight:700; }
  button:disabled { opacity:.5; cursor:default; }
</style>
