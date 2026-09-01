<!--
  은퇴 결정 (05_히스토리_엔딩 §3).

  ⚠ **`retirementAsk`를 밀어넣는 코드는 있었는데 받는 화면이 없었다.**
  `advanceWeek`가 노쇠·방출 압박 판정에서 이 pendingAction을 만들었지만
  아무도 소비하지 않아 자동 진행이 "은퇴 여부 결정"에서 멈춘 채 풀리지 않았다.
  `retireProtagonist`도 호출부가 하나도 없었다 — 커리어가 끝나지 않는다.

  사유에 따라 선택지가 다르다:
    decline  구단이 다시 부르지 않는 상황 — **거절하고 더 뛸 수 있다**
    injury   수술급 부상의 재기 불가 판정 — 설계상 "부상 강제"라 거절이 없다
-->
<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { retireProtagonist } from "../../../shared/usecases/retirement";
  import CareerEndScreen from "./CareerEndScreen.svelte";

  /** 커리어를 마치고 타이틀로. `MainPage` → `App` 으로 이어진다 */
  export let onExit: () => void = () => {};

  export let urgency = 0;
  export let reason: "decline" | "injury" = "decline";
  export let detail = "";

  let resolving = false;
  /**
   * 은퇴를 누르면 이 모달이 **커리어 결산으로 바뀐다.**
   * "결산을 봤는가" 플래그를 세이브에 새로 넣지 않으려는 것이다 — 은퇴하는
   * 그 순간이 곧 첫 관람이고, 다시 보는 건 나 > 상태에서 누를 때다.
   */
  let showSummary = false;

  $: p = $gameStore.protagonist;
  $: seasons = (p.careerRecords ?? []).length;
  $: forced = reason === "injury";
  $: title = forced ? "재기 불가 판정" : "은퇴 권고";
  $: bodyText = forced
    ? `${detail || "부상"}\n\n의료진이 선수 생활 지속이 어렵다고 판단했습니다.\n${p.age}세, 통산 ${seasons}시즌.`
    : `계약이 끝났고 어느 구단도 다시 부르지 않습니다.\n${p.age}세, 통산 ${seasons}시즌.\n\n`
      + (urgency >= 0.7
          ? "복귀 가능성은 거의 없어 보입니다."
          : "무소속으로 한 해 더 기다려 볼 수는 있습니다.");

  async function retire() {
    if (resolving) return;
    resolving = true;
    await retireProtagonist(forced ? "injury" : "decline");
    seasonStore.resolvePendingAction("retirementAsk");
    await seasonStore.save();
    resolving = false;
    // 저장이 끝난 뒤에 바꾼다 — 결산은 `careerRecords`를 읽으므로
    // 기록이 확정되기 전에 띄우면 마지막 시즌이 빠진 채로 나온다
    showSummary = true;
  }

  async function keepPlaying() {
    if (resolving || forced) return;
    resolving = true;
    seasonStore.resolvePendingAction("retirementAsk");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

{#if showSummary}
  <CareerEndScreen onClose={() => (showSummary = false)} {onExit} />
{:else}
<div class="overlay">
  <section class="modal">
    <header>
      <p class="chip">커리어</p>
      <h2>{title}</h2>
    </header>
    <p class="body-text">{bodyText}</p>
    {#if forced}
      <div class="warning-box">이 판정은 되돌릴 수 없습니다.</div>
    {/if}
    <div class="actions">
      {#if !forced}
        <button class="btn-keep" disabled={resolving} on:click={keepPlaying}>더 뛴다</button>
      {/if}
      <button class="btn-retire" disabled={resolving} on:click={retire}>은퇴한다</button>
    </div>
  </section>
</div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display:flex; align-items:center; justify-content:center; z-index:245; }
  .modal { width:min(440px,90vw); background:var(--panel); border:1px solid var(--ink-mute); border-radius:12px; padding:24px; display:grid; gap:14px; }
  .chip { margin:0; font-size:11px; color:var(--ink); }
  h2 { margin:4px 0 0; color:var(--ink); }
  .body-text { margin:0; color:var(--ink); font-size:14px; white-space:pre-line; line-height:1.6; }
  .warning-box { background:rgba(179, 49, 31, 0.09); border:1px solid var(--bad); border-radius:8px; padding:10px 14px; color:var(--bad); font-size:13px; }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  .btn-keep { border:1px solid var(--line); background:var(--panel); color:var(--ink); border-radius:8px; padding:9px 16px; cursor:pointer; font-size:13px; }
  .btn-retire { border:1px solid rgba(154, 101, 16, 0.30); background:rgba(154, 101, 16, 0.12); color:var(--warn); border-radius:8px; padding:9px 20px; cursor:pointer; font-size:13px; font-weight:700; }
  button:disabled { opacity:.5; cursor:default; }
</style>
