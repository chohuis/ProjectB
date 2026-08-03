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

  export let urgency = 0;
  export let reason: "decline" | "injury" = "decline";
  export let detail = "";

  let resolving = false;

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

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display:flex; align-items:center; justify-content:center; z-index:245; }
  .modal { width:min(440px,90vw); background:#10233c; border:1px solid #40659a; border-radius:12px; padding:24px; display:grid; gap:14px; }
  .chip { margin:0; font-size:11px; color:#7aa8e0; }
  h2 { margin:4px 0 0; color:#eef6ff; }
  .body-text { margin:0; color:#a8c8e8; font-size:14px; white-space:pre-line; line-height:1.6; }
  .warning-box { background:#2a1010; border:1px solid #804040; border-radius:8px; padding:10px 14px; color:#f08080; font-size:13px; }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  .btn-keep { border:1px solid #2a4068; background:#0d1e38; color:#7aa8d8; border-radius:8px; padding:9px 16px; cursor:pointer; font-size:13px; }
  .btn-retire { border:1px solid #5a4020; background:#2a1e08; color:#e0a040; border-radius:8px; padding:9px 20px; cursor:pointer; font-size:13px; font-weight:700; }
  button:disabled { opacity:.5; cursor:default; }
</style>
