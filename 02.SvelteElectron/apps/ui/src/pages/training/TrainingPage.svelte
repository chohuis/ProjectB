<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";

  type TrainingTab = "daily" | "weekly" | "risk";
  type SlotType = "main" | "sub" | "recovery";
  type PitchStatus = "discovered" | "training" | "learned";

  type TrainingCard = {
    id: string;
    slot: SlotType;
    title: string;
    focus: string;
    gains: string;
    fatigue: number;
    risk: number;
  };

  type PitchCandidate = {
    id: string;
    name: string;
    status: PitchStatus;
    progress: number;
    requirements: Array<{ label: string; required: number; current: number }>;
  };

  let tab: TrainingTab = "daily";

  const trainingCards: TrainingCard[] = [
    { id: "bullpen_cmd", slot: "main", title: "불펜 제구 세션", focus: "제구/릴리스", gains: "제구 +2, 멘탈 +0.5", fatigue: 8, risk: 3 },
    { id: "velo_power", slot: "main", title: "구속 파워 세션", focus: "구속/하체 드라이브", gains: "구속 +2, 스태미나 +1", fatigue: 10, risk: 5 },
    { id: "game_sim", slot: "main", title: "실전 피칭 시뮬", focus: "구종 운용/경기 감각", gains: "무브 +1.5, 운용 +1", fatigue: 9, risk: 4 },

    { id: "video_analysis", slot: "sub", title: "영상 분석", focus: "투구 패턴/상대 대응", gains: "전술 +1, 제구 +0.5", fatigue: 2, risk: 0 },
    { id: "pickoff_drill", slot: "sub", title: "견제/퀵모션 드릴", focus: "주자 견제", gains: "견제 +1.5", fatigue: 3, risk: 1 },
    { id: "mental_routine", slot: "sub", title: "멘탈 루틴", focus: "압박 대응/집중", gains: "멘탈 +1.5", fatigue: 1, risk: -1 },

    { id: "recovery_pool", slot: "recovery", title: "수중 회복 세션", focus: "회복/유연성", gains: "회복 +2", fatigue: -5, risk: -3 },
    { id: "sleep_reset", slot: "recovery", title: "휴식 + 수면 리셋", focus: "피로 회복", gains: "피로 -6", fatigue: -6, risk: -2 },
    { id: "mobility", slot: "recovery", title: "모빌리티 케어", focus: "관절 가동 범위", gains: "유연성 +1, 부상위험 완화", fatigue: -3, risk: -2 }
  ];

  $: selectedMain = $gameStore.trainingPlan.primaryProgramId ?? "bullpen_cmd";
  $: selectedSub = $gameStore.trainingPlan.secondaryProgramId ?? "video_analysis";
  $: selectedRecovery = $gameStore.trainingPlan.recoveryProgramId ?? "recovery_pool";

  const baseCondition = 82;
  const baseFatigue = 28;
  const baseInjuryRisk = 12;

  // 투수 전용 능력치(더미)
  const pitcherStat = {
    command: 58,
    movement: 54,
    flexibility: 56,
    spin: 52,
    mental: 57,
    fatigueCap: 45
  };

  const coachMod = { efficiency: 1.1, fatigue: 0.95, risk: 0.9 };
  const facilityMod = { efficiency: 1.05, fatigue: 0.9, risk: 0.95 };

  let weeklyMix = {
    bullpen: 25,
    gameSim: 20,
    strength: 20,
    analysis: 15,
    recovery: 10,
    pitchDev: 10
  };

  // 전체 구종은 숨김(미발견 구종 수만 내부에서 관리)
  const hiddenPitchCount = 3;

  let pitchCandidates: PitchCandidate[] = [
    {
      id: "slider",
      name: "슬라이더",
      status: "learned",
      progress: 100,
      requirements: [
        { label: "제구", required: 50, current: pitcherStat.command },
        { label: "회전 효율", required: 45, current: pitcherStat.spin }
      ]
    },
    {
      id: "changeup",
      name: "체인지업",
      status: "training",
      progress: 42,
      requirements: [
        { label: "제구", required: 55, current: pitcherStat.command },
        { label: "멘탈", required: 50, current: pitcherStat.mental }
      ]
    },
    {
      id: "curve",
      name: "커브",
      status: "discovered",
      progress: 0,
      requirements: [
        { label: "유연성", required: 60, current: pitcherStat.flexibility },
        { label: "회전 효율", required: 55, current: pitcherStat.spin }
      ]
    },
    {
      id: "splitter",
      name: "스플리터",
      status: "discovered",
      progress: 0,
      requirements: [
        { label: "제구", required: 60, current: pitcherStat.command },
        { label: "멘탈", required: 58, current: pitcherStat.mental }
      ]
    }
  ];

  const recentLogs = [
    "불펜 제구 세션 적용: 제구 안정 +1, 피로 +6",
    "체인지업 훈련 진행률 +7%",
    "구속 파워 세션 과부하 경고(주의)",
    "수중 회복 세션 후 피로도 -4"
  ];

  $: mainCard = trainingCards.find((item) => item.id === selectedMain);
  $: subCard = trainingCards.find((item) => item.id === selectedSub);
  $: recoveryCard = trainingCards.find((item) => item.id === selectedRecovery);
  $: selectedCards = [mainCard, subCard, recoveryCard].filter(Boolean) as TrainingCard[];

  $: rawFatigueDelta = selectedCards.reduce((sum, card) => sum + card.fatigue, 0);
  $: rawRiskDelta = selectedCards.reduce((sum, card) => sum + card.risk, 0);

  $: finalFatigueDelta = Math.round(rawFatigueDelta * coachMod.fatigue * facilityMod.fatigue);
  $: finalRiskDelta = Math.round(rawRiskDelta * coachMod.risk * facilityMod.risk);

  $: projectedFatigue = Math.max(0, baseFatigue + finalFatigueDelta);
  $: projectedRisk = Math.max(0, baseInjuryRisk + finalRiskDelta);
  $: projectedCondition = Math.max(0, Math.min(100, baseCondition - Math.max(0, finalFatigueDelta) * 0.6));

  $: weeklyTotal =
    weeklyMix.bullpen +
    weeklyMix.gameSim +
    weeklyMix.strength +
    weeklyMix.analysis +
    weeklyMix.recovery +
    weeklyMix.pitchDev;

  $: learnedPitches = pitchCandidates.filter((pitch) => pitch.status === "learned");
  $: trainingPitch = pitchCandidates.find((pitch) => pitch.status === "training") ?? null;
  $: discoveredPitches = pitchCandidates.filter((pitch) => pitch.status === "discovered");
  $: pitchDevGain = Math.max(0, Math.round(weeklyMix.pitchDev * 0.6));
  $: projectedTrainingProgress = trainingPitch
    ? Math.min(100, trainingPitch.progress + pitchDevGain)
    : 0;

  function riskTone(value: number): "safe" | "warn" | "danger" {
    if (value >= 20) return "danger";
    if (value >= 13) return "warn";
    return "safe";
  }

  function isEligible(pitch: PitchCandidate): boolean {
    return pitch.requirements.every((req) => req.current >= req.required);
  }

  function unmetRequirementText(pitch: PitchCandidate): string {
    const unmet = pitch.requirements.filter((req) => req.current < req.required);
    if (unmet.length === 0) return "조건 충족";
    return unmet.map((req) => `${req.label} ${req.required} 필요(현재 ${req.current})`).join(" · ");
  }

  function canStartLearning(pitch: PitchCandidate): boolean {
    if (pitch.status !== "discovered") return false;
    if (!isEligible(pitch)) return false;
    if (trainingPitch) return false;
    if (projectedFatigue >= pitcherStat.fatigueCap) return false;
    return true;
  }

  function startPitchLearning(pitchId: string) {
    pitchCandidates = pitchCandidates.map((pitch) =>
      pitch.id === pitchId && canStartLearning(pitch)
        ? { ...pitch, status: "training", progress: 5 }
        : pitch
    );
  }
</script>

<section class="page">
  <h2>{$t("page.training")}</h2>

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "daily"} on:click={() => (tab = "daily")}>일간 계획</button>
        <button class:active={tab === "weekly"} on:click={() => (tab = "weekly")}>주간 설정</button>
        <button class:active={tab === "risk"} on:click={() => (tab = "risk")}>리스크/로그</button>
      </div>

      <div class="kpis">
        <p>컨디션 <strong>{projectedCondition}</strong></p>
        <p>피로 <strong>{projectedFatigue}</strong></p>
        <p>부상위험 <strong class={riskTone(projectedRisk)}>{projectedRisk}%</strong></p>
      </div>
    </header>

    {#if tab === "daily"}
      <div class="content-grid">
        <section class="panel daily-plan">
          <h3>오늘의 3슬롯</h3>

          <label>
            <span>주훈련</span>
            <select
              value={selectedMain}
              on:change={(e) => gameStore.setTrainingPlan({ primaryProgramId: e.currentTarget.value })}
            >
              {#each trainingCards.filter((item) => item.slot === "main") as card}
                <option value={card.id}>{card.title}</option>
              {/each}
            </select>
          </label>

          <label>
            <span>보조훈련</span>
            <select
              value={selectedSub}
              on:change={(e) => gameStore.setTrainingPlan({ secondaryProgramId: e.currentTarget.value })}
            >
              {#each trainingCards.filter((item) => item.slot === "sub") as card}
                <option value={card.id}>{card.title}</option>
              {/each}
            </select>
          </label>

          <label>
            <span>회복/멘탈</span>
            <select
              value={selectedRecovery}
              on:change={(e) => gameStore.setTrainingPlan({ recoveryProgramId: e.currentTarget.value })}
            >
              {#each trainingCards.filter((item) => item.slot === "recovery") as card}
                <option value={card.id}>{card.title}</option>
              {/each}
            </select>
          </label>

          <div class="slot-cards">
            {#each selectedCards as card}
              <article>
                <strong>{card.title}</strong>
                <p>{card.focus}</p>
                <p class="gain">효과: {card.gains}</p>
                <p>피로 {card.fatigue >= 0 ? "+" : ""}{card.fatigue} · 위험 {card.risk >= 0 ? "+" : ""}{card.risk}</p>
              </article>
            {/each}
          </div>
        </section>

        <aside class="panel">
          <h3>적용 보정</h3>
          <ul>
            <li><span>코치 효율</span><strong>x{coachMod.efficiency.toFixed(2)}</strong></li>
            <li><span>코치 피로 보정</span><strong>x{coachMod.fatigue.toFixed(2)}</strong></li>
            <li><span>시설 피로 보정</span><strong>x{facilityMod.fatigue.toFixed(2)}</strong></li>
            <li><span>시설 리스크 보정</span><strong>x{facilityMod.risk.toFixed(2)}</strong></li>
          </ul>

          <h3>예상 결과</h3>
          <ul>
            <li><span>피로 변화</span><strong>{finalFatigueDelta >= 0 ? "+" : ""}{finalFatigueDelta}</strong></li>
            <li><span>부상 위험 변화</span><strong>{finalRiskDelta >= 0 ? "+" : ""}{finalRiskDelta}%p</strong></li>
            <li><span>훈련 가능 슬롯</span><strong>3 / 3</strong></li>
          </ul>

          <p class={`risk-note ${riskTone(projectedRisk)}`}>
            {#if projectedRisk >= 20}
              과부하 구간입니다. 회복 슬롯 강화를 권장합니다.
            {:else if projectedRisk >= 13}
              주의 구간입니다. 다음날 고강도 훈련은 피하세요.
            {:else}
              안정 구간입니다. 현재 루틴 유지 가능.
            {/if}
          </p>
        </aside>
      </div>
    {:else if tab === "weekly"}
      <div class="content-grid weekly-grid">
        <section class="panel">
          <h3>주간 훈련 비율 (투수 전용)</h3>
          <div class="mix-grid">
            <label><span>불펜 제구</span><input type="number" min="0" max="100" bind:value={weeklyMix.bullpen} /></label>
            <label><span>실전 피칭</span><input type="number" min="0" max="100" bind:value={weeklyMix.gameSim} /></label>
            <label><span>피지컬/구속</span><input type="number" min="0" max="100" bind:value={weeklyMix.strength} /></label>
            <label><span>영상/전술</span><input type="number" min="0" max="100" bind:value={weeklyMix.analysis} /></label>
            <label><span>회복/멘탈</span><input type="number" min="0" max="100" bind:value={weeklyMix.recovery} /></label>
            <label><span>구종 개발</span><input type="number" min="0" max="100" bind:value={weeklyMix.pitchDev} /></label>
          </div>
          <p class:warn={weeklyTotal !== 100}>현재 합계: {weeklyTotal}% (권장 100%)</p>
        </section>

        <section class="panel pitch-dev-panel">
          <h3>구종 개발 (전체 비공개 탐색형)</h3>
          <p class="sub">미발견 구종: {hiddenPitchCount}개</p>

          <div class="pitch-block">
            <h4>보유 구종</h4>
            <div class="chips">
              {#each learnedPitches as pitch}
                <span class="chip learned">{pitch.name}</span>
              {/each}
            </div>
          </div>

          <div class="pitch-block">
            <h4>훈련 진행중</h4>
            {#if trainingPitch}
              <div class="training-card">
                <strong>{trainingPitch.name}</strong>
                <p>현재 진행률 {trainingPitch.progress}%</p>
                <p class="gain">주간 구종 개발 비중 {weeklyMix.pitchDev}% -> 진행률 +{pitchDevGain}%</p>
                <p>주차 종료 예상 {projectedTrainingProgress}%</p>
                <div class="progress-wrap"><div class="progress" style={`width:${trainingPitch.progress}%`}></div></div>
              </div>
            {:else}
              <p class="empty-text">현재 진행중인 구종 훈련이 없습니다.</p>
            {/if}
          </div>

          <div class="pitch-block">
            <h4>습득 후보</h4>
            <div class="candidate-list">
              {#each discoveredPitches as pitch}
                <article>
                  <div class="row-head">
                    <strong>{pitch.name}</strong>
                    <button
                      disabled={!canStartLearning(pitch)}
                      on:click={() => startPitchLearning(pitch.id)}
                    >
                      습득 가능
                    </button>
                  </div>
                  <p>{unmetRequirementText(pitch)}</p>
                  {#if trainingPitch && trainingPitch.id !== pitch.id}
                    <p class="hint">다른 구종 훈련이 진행중이라 대기해야 합니다.</p>
                  {/if}
                </article>
              {/each}
            </div>
          </div>
        </section>
      </div>
    {:else}
      <div class="content-grid">
        <section class="panel">
          <h3>리스크 추적</h3>
          <ul>
            <li><span>현재 부상위험</span><strong class={riskTone(projectedRisk)}>{projectedRisk}%</strong></li>
            <li><span>현재 피로도</span><strong>{projectedFatigue}</strong></li>
            <li><span>연속 고강도 일수</span><strong>2일</strong></li>
            <li><span>다음 경기까지</span><strong>2일</strong></li>
          </ul>

          <h3>자동 경고 룰</h3>
          <ul>
            <li>고강도 3일 연속 시 효율 -15%</li>
            <li>피로 45 이상 시 제구 훈련 효율 -10%</li>
            <li>피로 55 이상 시 부상 위험 +6%p</li>
          </ul>
        </section>

        <aside class="panel">
          <h3>최근 훈련 로그</h3>
          <ol>
            {#each recentLogs as log}
              <li>{log}</li>
            {/each}
          </ol>
        </aside>
      </div>
    {/if}
  </article>
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  h2 {
    font-size: 22px;
  }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .board {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .tabs,
  .kpis {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .tabs button,
  select,
  input,
  .candidate-list button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
  }

  .tabs button,
  .candidate-list button {
    cursor: pointer;
  }

  .tabs button.active {
    background: #3262b0;
    border-color: #6da1f7;
  }

  .kpis p {
    border: 1px solid #2e486f;
    border-radius: 999px;
    background: #152b4f;
    padding: 3px 8px;
    color: #cfe0ff;
    font-size: 12px;
  }

  .kpis strong { margin-left: 4px; color: #f3f7ff; }
  .kpis strong.safe { color: #7be4a6; }
  .kpis strong.warn { color: #ffd78a; }
  .kpis strong.danger { color: #ff9b8a; }

  .content-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(260px, 1fr);
    gap: 10px;
  }

  .weekly-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .panel {
    border: 1px solid #2f486f;
    border-radius: 10px;
    background: #13223d;
    padding: 10px;
    min-height: 0;
    overflow: hidden;
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .daily-plan label,
  .mix-grid label {
    display: grid;
    gap: 4px;
  }

  .daily-plan label span,
  .mix-grid span,
  .sub {
    color: #aac0e4;
    font-size: 12px;
  }

  .slot-cards {
    display: grid;
    gap: 6px;
    margin-top: 4px;
  }

  .slot-cards article,
  .candidate-list article,
  .training-card {
    border: 1px solid #2d4a76;
    border-radius: 8px;
    background: #152b4f;
    padding: 8px;
    display: grid;
    gap: 4px;
  }

  .slot-cards strong,
  .candidate-list strong,
  .training-card strong {
    color: #eef5ff;
    font-size: 13px;
  }

  .slot-cards p,
  .candidate-list p,
  .training-card p {
    color: #bfd2f3;
    font-size: 12px;
  }

  .slot-cards .gain { color: #83e6ad; }
  .training-card .gain { color: #83e6ad; }

  ul,
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }

  li {
    border: 1px solid #2f486f;
    border-radius: 8px;
    background: #152b4f;
    padding: 7px 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    color: #dce5f7;
    font-size: 13px;
  }

  li strong { color: #eef4ff; font-size: 13px; }

  .risk-note {
    border: 1px solid;
    border-radius: 8px;
    padding: 7px 8px;
    font-size: 12px;
  }

  .risk-note.safe { border-color: #3c7a5a; color: #98e5bd; background: #1a3a2c; }
  .risk-note.warn { border-color: #8a6f3a; color: #ffe0a2; background: #3d311a; }
  .risk-note.danger { border-color: #8d4a3f; color: #ffc0b6; background: #3b1f1b; }

  .mix-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .warn { color: #ffd78a; }

  .pitch-dev-panel {
    grid-template-rows: auto auto auto auto;
  }

  .pitch-block {
    display: grid;
    gap: 6px;
  }

  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    border: 1px solid #406aa7;
    border-radius: 999px;
    padding: 2px 8px;
    color: #d2e3ff;
    font-size: 12px;
    background: #1d3660;
  }

  .chip.learned {
    border-color: #4e8b65;
    background: #234634;
    color: #bfe8d0;
  }

  .progress-wrap {
    height: 8px;
    border-radius: 999px;
    background: #20375c;
    overflow: hidden;
  }

  .progress {
    height: 100%;
    border-radius: inherit;
    background: #79aaff;
  }

  .candidate-list {
    display: grid;
    gap: 6px;
  }

  .row-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .candidate-list button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .hint,
  .empty-text {
    color: #9fb5db;
    font-size: 12px;
  }

  ol li { justify-content: flex-start; }

  @media (max-width: 1180px) {
    .content-grid,
    .weekly-grid,
    .mix-grid {
      grid-template-columns: 1fr;
    }
  }
</style>


