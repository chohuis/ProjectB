<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore, pitchUnlockRuleMap } from "../../shared/stores/master";

  type TrainingTab = "daily" | "weekly" | "risk";
  type PitchStatus = "discovered" | "training" | "learned";

  type ProgramCard = {
    id: string;
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

  // growthEngine TRAINING_MAP과 동일한 ID 사용
  const mainPrograms: ProgramCard[] = [
    { id: "TRN_CMD_BASE",  title: "커맨드 기초",    focus: "커맨드/릴리스",      gains: "커맨드, 제구",      fatigue: 8,  risk: 2 },
    { id: "TRN_VEL_POWER", title: "구위 파워",       focus: "구속/하체 드라이브", gains: "구위, 스태미나",     fatigue: 14, risk: 6 },
    { id: "TRN_CTRL_MECH", title: "제구 메커니즘",   focus: "제구/릴리스 일관성", gains: "제구, 커맨드",       fatigue: 8,  risk: 2 },
    { id: "TRN_MVT_PITCH", title: "변화구 연습",     focus: "무브먼트/구종",      gains: "무브먼트, 제구",     fatigue: 9,  risk: 3 },
    { id: "TRN_MNT_FOCUS", title: "멘탈 집중 훈련", focus: "압박 대응/집중",     gains: "멘탈",              fatigue: 5,  risk: 0 },
    { id: "TRN_STA_COND",  title: "체력 강화",       focus: "스태미나/지구력",    gains: "스태미나, 회복력",   fatigue: 12, risk: 4 },
  ];

  const recoveryPrograms: ProgramCard[] = [
    { id: "TRN_RECOVERY", title: "컨디셔닝 회복", focus: "회복/유연성", gains: "피로 ↓, 컨디션 ↑", fatigue: -8, risk: 0 },
  ];

  const allPrograms = [...mainPrograms, ...recoveryPrograms];

  $: selectedMain     = $gameStore.trainingPlan.primaryProgramId   ?? "TRN_CMD_BASE";
  $: selectedSub      = $gameStore.trainingPlan.secondaryProgramId ?? "TRN_CTRL_MECH";
  $: selectedRecovery = $gameStore.trainingPlan.recoveryProgramId  ?? "TRN_RECOVERY";

  // 실제 주인공 상태
  $: protagonist = $gameStore.protagonist;
  $: realCondition = protagonist.condition;
  $: realFatigue   = protagonist.fatigue;
  $: realMorale    = protagonist.morale;

  const coachMod    = { fatigue: 0.95, risk: 0.9 };
  const facilityMod = { fatigue: 0.90, risk: 0.95 };

  let weeklyMix = {
    bullpen: 25,
    gameSim: 20,
    strength: 20,
    analysis: 15,
    recovery: 10,
    pitchDev: 10
  };

  // 구종 시스템 — masterStore + protagonist 실데이터
  const STAT_LABEL: Record<string, string> = {
    command:   "커맨드",
    control:   "제구",
    velocity:  "구위",
    movement:  "무브먼트",
    stamina:   "스태미나",
    mentality: "멘탈",
    mental:    "멘탈",
    recovery:  "회복력",
  };

  function getStatValue(statKey: string, p: typeof protagonist): number {
    const map: Record<string, number> = {
      command:   p.pitching.command,
      control:   p.pitching.control,
      velocity:  p.pitching.velocity,
      movement:  p.pitching.movement,
      stamina:   p.pitching.stamina,
      mentality: p.pitching.mentality,
      mental:    p.pitching.mentality,
      recovery:  p.pitching.recovery,
    };
    return map[statKey] ?? 0;
  }

  function isPitchUnlocked(pitch: { unlockRuleId: string }, p: typeof protagonist): boolean {
    const rule = $pitchUnlockRuleMap.get(pitch.unlockRuleId);
    if (!rule || rule.type === "always") return true;
    if (rule.type === "min_stat" && rule.params.stat && rule.params.value !== undefined) {
      return getStatValue(rule.params.stat, p) >= rule.params.value;
    }
    return false;
  }

  $: learnedIds       = new Set(protagonist.learnedPitchIds ?? ["PITCH_FASTBALL"]);
  $: trainingPitchSt  = protagonist.trainingPitchState ?? null;

  $: pitchCandidates = $masterStore.pitchCatalog.map((pitch) => {
    const learned = learnedIds.has(pitch.id);
    const inTraining = !learned && trainingPitchSt?.id === pitch.id;
    const rule = $pitchUnlockRuleMap.get(pitch.unlockRuleId);
    const requirements = (rule?.type === "min_stat" && rule.params.stat && rule.params.value !== undefined)
      ? [{ label: STAT_LABEL[rule.params.stat] ?? rule.params.stat, required: rule.params.value, current: getStatValue(rule.params.stat, protagonist) }]
      : [];
    return {
      id:           pitch.id,
      name:         pitch.name,
      status:       learned ? "learned" : inTraining ? "training" : "discovered",
      progress:     inTraining ? trainingPitchSt!.progress : learned ? 100 : 0,
      requirements,
    } as PitchCandidate;
  });

  $: mainCard     = allPrograms.find((p) => p.id === selectedMain);
  $: subCard      = allPrograms.find((p) => p.id === selectedSub);
  $: recoveryCard = allPrograms.find((p) => p.id === selectedRecovery);
  $: selectedCards = [mainCard, subCard, recoveryCard].filter(Boolean) as ProgramCard[];

  $: rawFatigueDelta = selectedCards.reduce((sum, c) => sum + c.fatigue, 0);
  $: rawRiskDelta    = selectedCards.reduce((sum, c) => sum + c.risk,    0);

  // 기본 주간 회복 (-5 fatigue, +3 condition) 포함
  $: finalFatigueDelta   = Math.round(rawFatigueDelta * coachMod.fatigue * facilityMod.fatigue) - 5;
  $: finalRiskDelta      = Math.round(rawRiskDelta    * coachMod.risk    * facilityMod.risk);

  $: projectedFatigue   = Math.max(0,   Math.min(100, realFatigue   + finalFatigueDelta));
  $: projectedCondition = Math.max(0,   Math.min(100, realCondition - Math.max(0, finalFatigueDelta) * 0.4 + 3));
  $: projectedRisk      = Math.max(0,   Math.round(Math.max(0, projectedFatigue - 60) * 0.8));

  $: weeklyTotal =
    weeklyMix.bullpen + weeklyMix.gameSim + weeklyMix.strength +
    weeklyMix.analysis + weeklyMix.recovery + weeklyMix.pitchDev;

  $: learnedPitches    = pitchCandidates.filter((p) => p.status === "learned");
  $: trainingPitch     = pitchCandidates.find((p) => p.status === "training") ?? null;
  $: discoveredPitches = pitchCandidates.filter((p) => p.status === "discovered");
  $: pitchDevGain      = Math.max(0, Math.round(weeklyMix.pitchDev * 0.6));
  $: projectedTrainingProgress = trainingPitch
    ? Math.min(100, trainingPitch.progress + pitchDevGain)
    : 0;

  $: recentLogs = $gameStore.logs.slice(0, 5);

  function riskTone(value: number): "safe" | "warn" | "danger" {
    if (value >= 20) return "danger";
    if (value >= 10) return "warn";
    return "safe";
  }

  function isEligible(pitch: PitchCandidate): boolean {
    return pitch.requirements.every((req) => req.current >= req.required);
  }

  function unmetRequirementText(pitch: PitchCandidate): string {
    const unmet = pitch.requirements.filter((req) => req.current < req.required);
    if (unmet.length === 0) return "조건 충족";
    return unmet.map((req) => `${req.label} ${req.required} 필요 (현재 ${req.current})`).join(" · ");
  }

  function canStartLearning(pitch: PitchCandidate): boolean {
    return pitch.status === "discovered" && isEligible(pitch) && !trainingPitch && projectedFatigue < 80;
  }

  function startPitchLearning(pitchId: string) {
    if (!canStartLearning(pitchCandidates.find((p) => p.id === pitchId)!)) return;
    gameStore.startPitchTraining(pitchId);
    gameStore.save();
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
              {#each mainPrograms as p}
                <option value={p.id}>{p.title}</option>
              {/each}
            </select>
          </label>

          <label>
            <span>보조훈련</span>
            <select
              value={selectedSub}
              on:change={(e) => gameStore.setTrainingPlan({ secondaryProgramId: e.currentTarget.value })}
            >
              {#each mainPrograms as p}
                <option value={p.id}>{p.title}</option>
              {/each}
            </select>
          </label>

          <label>
            <span>회복/멘탈</span>
            <select
              value={selectedRecovery}
              on:change={(e) => gameStore.setTrainingPlan({ recoveryProgramId: e.currentTarget.value })}
            >
              {#each recoveryPrograms as p}
                <option value={p.id}>{p.title}</option>
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
            <li><span>현재 피로도</span><strong class={riskTone(realFatigue >= 70 ? 20 : realFatigue >= 50 ? 13 : 0)}>{realFatigue}</strong></li>
            <li><span>현재 컨디션</span><strong>{realCondition}</strong></li>
            <li><span>현재 사기</span><strong>{realMorale}</strong></li>
            <li><span>부상 위험 추정</span><strong class={riskTone(projectedRisk)}>{projectedRisk}%</strong></li>
          </ul>

          <h3>자동 경고 룰</h3>
          <ul>
            <li>피로 70 이상: 훈련 XP -30% 페널티</li>
            <li>피로 85 이상 × 2주 연속: 긴급 이벤트</li>
            <li>사기 35 미만 × 3주: 슬럼프 진입</li>
          </ul>
        </section>

        <aside class="panel">
          <h3>최근 활동 로그</h3>
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


