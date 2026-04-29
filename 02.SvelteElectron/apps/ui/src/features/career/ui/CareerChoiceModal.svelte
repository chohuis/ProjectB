<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { percentileToGrade } from "../../../shared/utils/academicsEngine";
  import {
    resolveChoice,
    getStepView,
    type CareerStep,
  } from "../../../shared/utils/careerChain";

  // OVR + 평균 등급 계산
  $: ovr      = $gameStore.protagonist.pitching.ovr;
  $: subjects = Object.values($gameStore.schoolState.subjectScores);
  $: avgPct   = subjects.length
    ? subjects.reduce((a, s) => a + s.percentile, 0) / subjects.length
    : 50;
  $: avgGrade = percentileToGrade(avgPct);

  let step: CareerStep = { type: "initial" };
  $: view = getStepView(step);

  let resolving = false;

  function pick(choiceId: string) {
    if (resolving) return;
    resolving = true;

    const next = resolveChoice(step, choiceId, ovr, avgGrade);

    // result 화면을 잠깐 보여준 뒤 자동 진행하지 않음 — 사용자가 OK 클릭
    step = next;

    if (step.type === "resolved") {
      // 최종 결과 → 확인 버튼 클릭 시 finish()
    }
    resolving = false;
  }

  function finish() {
    if (step.type !== "resolved") return;
    gameStore.setCareerStage(step.stage);
    seasonStore.resolvePendingAction("careerChoice");
    gameStore.save();
    seasonStore.save();
  }

  function stageKor(stage: string): string {
    const map: Record<string, string> = {
      pro: "프로 입단", university: "대학 진학",
      independent: "독립리그 입단", military: "군 입대",
    };
    return map[stage] ?? stage;
  }
</script>

<div class="overlay">
  <div class="modal">
    <div class="modal-header">
      <span class="chip">진로 결정</span>
      <h2>{view.title}</h2>
    </div>

    <p class="body-text">{view.body}</p>

    {#if step.type === "initial"}
      <div class="info-row">
        <span class="info-item">OVR <strong>{ovr}</strong></span>
        <span class="info-item">평균 등급 <strong>{avgGrade}등급</strong></span>
      </div>
    {/if}

    {#if view.isResultScreen}
      <div class="result-box" class:success={view.resultSuccess} class:fail={!view.resultSuccess}>
        {#if step.type === "resolved"}
          <span class="result-label">확정: {stageKor(step.stage)}</span>
        {:else if view.resultSuccess}
          <span class="result-label">성공</span>
        {:else}
          <span class="result-label">실패</span>
        {/if}
      </div>
    {/if}

    <div class="options" class:single={view.options.length === 1}>
      {#each view.options as opt}
        <button
          class="opt-btn"
          class:ok-btn={opt.id === "ok" || step.type === "resolved"}
          on:click={() => step.type === "resolved" ? finish() : (view.isResultScreen && opt.id === "ok") ? pick(opt.id) : pick(opt.id)}
          type="button"
        >
          <span class="opt-label">{opt.label}</span>
          {#if opt.desc}
            <span class="opt-desc">{opt.desc}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.80);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background: #0e1a30;
    border: 1px solid #3a5898;
    border-radius: 16px;
    padding: 32px 36px;
    width: min(560px, 92vw);
    display: grid;
    gap: 20px;
  }

  .modal-header {
    display: grid;
    gap: 8px;
  }

  .chip {
    font-size: 11px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #7a9ad0;
    background: #182a4a;
    border: 1px solid #2a4070;
    border-radius: 4px;
    padding: 2px 8px;
    width: fit-content;
  }

  h2 {
    margin: 0;
    font-size: 22px;
    color: #e8f0ff;
  }

  .body-text {
    margin: 0;
    font-size: 14px;
    color: #a8c0e0;
    line-height: 1.7;
    white-space: pre-line;
  }

  .info-row {
    display: flex;
    gap: 16px;
  }

  .info-item {
    font-size: 13px;
    color: #7a9ad0;
    background: #122040;
    border: 1px solid #2a3e65;
    border-radius: 6px;
    padding: 4px 12px;
  }

  .info-item strong {
    color: #e0eeff;
    margin-left: 4px;
  }

  .result-box {
    border-radius: 8px;
    padding: 12px 16px;
    text-align: center;
  }

  .result-box.success {
    background: #0d2a18;
    border: 1px solid #2a6a38;
  }

  .result-box.fail {
    background: #2a0e0e;
    border: 1px solid #6a2020;
  }

  .result-label {
    font-size: 15px;
    font-weight: 700;
    color: #e0f0ff;
  }

  .result-box.success .result-label { color: #70e898; }
  .result-box.fail    .result-label { color: #ff9090; }

  .options {
    display: grid;
    gap: 8px;
  }

  .options.single {
    grid-template-columns: 1fr;
  }

  .opt-btn {
    background: #111e38;
    border: 1px solid #2a4068;
    border-radius: 10px;
    padding: 12px 16px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 4px;
    transition: background 0.1s, border-color 0.1s;
  }

  .opt-btn:hover {
    background: #182a50;
    border-color: #4070b0;
  }

  .opt-btn.ok-btn {
    background: #0d2a48;
    border-color: #3a6090;
    text-align: center;
  }

  .opt-btn.ok-btn:hover {
    background: #1a3a60;
    border-color: #5080c0;
  }

  .opt-label {
    font-size: 15px;
    font-weight: 600;
    color: #dceeff;
  }

  .opt-desc {
    font-size: 12px;
    color: #6a88b8;
  }
</style>
