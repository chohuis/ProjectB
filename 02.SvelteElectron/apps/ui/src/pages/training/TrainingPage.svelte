<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore, pitchUnlockRuleMap } from "../../shared/stores/master";

  type TrainingTab = "plan" | "pitch" | "risk";
  type PitchStatus = "grading" | "learned" | "training" | "discovered" | "locked";

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
    grade: number;
    progress: number;
    requirements: Array<{ label: string; required: number; current: number }>;
  };

  let tab: TrainingTab = "plan";

  const PITCH_NAMES: Record<string, string> = {
    PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커", PITCH_CUTTER: "커터",
    PITCH_SLIDER: "슬라이더", PITCH_CURVE: "커브", PITCH_CHANGEUP: "체인지업",
    PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼",
    PITCH_SCREWBALL: "스크루볼", PITCH_KNUCKLEBALL: "너클볼",
  };

  const GRADE_LABEL: Record<number, string> = {
    1: "습득중", 2: "기초", 3: "보통", 4: "능숙", 5: "마스터",
  };

  // growthEngine TRAINING_MAP과 동일한 ID 사용
  const pitcherPrograms: ProgramCard[] = [
    { id: "TRN_CMD_BASE",  title: "커맨드 기초",    focus: "커맨드/릴리스",         gains: "커맨드, 제구",      fatigue: 8,  risk: 2 },
    { id: "TRN_VEL_POWER", title: "구위 파워",       focus: "구속/하체 드라이브",    gains: "구위, 스태미나",    fatigue: 14, risk: 6 },
    { id: "TRN_CTRL_MECH", title: "제구 메커니즘",   focus: "제구/릴리스 일관성",    gains: "제구, 커맨드",      fatigue: 8,  risk: 2 },
    { id: "TRN_MVT_PITCH", title: "변화구 연습",     focus: "무브먼트/구종",         gains: "무브먼트, 제구",    fatigue: 9,  risk: 3 },
    { id: "TRN_MNT_FOCUS", title: "멘탈 집중 훈련", focus: "압박 대응/집중",        gains: "멘탈",              fatigue: 5,  risk: 0 },
    { id: "TRN_STA_COND",  title: "체력 강화",       focus: "스태미나/지구력",       gains: "스태미나, 회복력",  fatigue: 12, risk: 4 },
    { id: "TRN_CLUTCH",    title: "위기집중 훈련",   focus: "집중력/압박 상황",      gains: "위기집중력, 멘탈",  fatigue: 6,  risk: 0 },
    { id: "TRN_HOLD",      title: "견제 훈련",       focus: "주자 관리/견제",        gains: "견제력, 제구",      fatigue: 7,  risk: 1 },
    { id: "TRN_PITCH_DEV", title: "구종 개발",       focus: "구종 숙련도/신규 습득", gains: "진행중 구종 +20%",  fatigue: 10, risk: 0 },
  ];

  const batterPrograms: ProgramCard[] = [
    { id: "TRN_CONTACT",  title: "컨택 훈련",    focus: "타격 밀착/배트 컨트롤",  gains: "컨택, 선구안",    fatigue: 8,  risk: 2 },
    { id: "TRN_POWER",    title: "파워 훈련",    focus: "하체 드라이브/장타",      gains: "장타력, 컨택",    fatigue: 12, risk: 4 },
    { id: "TRN_EYE",      title: "선구안 훈련",  focus: "볼/스트라이크 판단",      gains: "선구안, 극기",    fatigue: 6,  risk: 0 },
    { id: "TRN_SPEED",    title: "주루 훈련",    focus: "스피드/베이스러닝",       gains: "주력, 주루판단",  fatigue: 10, risk: 3 },
    { id: "TRN_FIELDING", title: "수비 훈련",    focus: "글러브 워크/포지셔닝",    gains: "수비, 어깨",      fatigue: 9,  risk: 2 },
    { id: "TRN_BUNTING",  title: "번트 훈련",    focus: "상황 번트/정밀 타격",     gains: "번트, 컨택",      fatigue: 5,  risk: 0 },
    { id: "TRN_MNT_FOCUS",title: "멘탈 집중",   focus: "압박 대응/집중",          gains: "멘탈",            fatigue: 5,  risk: 0 },
    { id: "TRN_STA_COND", title: "체력 강화",   focus: "스태미나/지구력",         gains: "스태미나, 회복력",fatigue: 12, risk: 4 },
    { id: "TRN_BCLUTCH",  title: "클러치 훈련", focus: "득점권/결정적 상황 타격", gains: "클러치, 극기",    fatigue: 6,  risk: 0 },
  ];

  const recoveryPrograms: ProgramCard[] = [
    { id: "TRN_RECOVERY", title: "컨디셔닝 회복", focus: "회복/유연성", gains: "피로 ↓, 컨디션 ↑", fatigue: -8, risk: 0 },
  ];

  $: selectedMain     = $gameStore.trainingPlan.primaryProgramId   ?? "TRN_CMD_BASE";
  $: selectedSub      = $gameStore.trainingPlan.secondaryProgramId ?? "TRN_CTRL_MECH";
  $: selectedRecovery = $gameStore.trainingPlan.recoveryProgramId  ?? "TRN_RECOVERY";

  $: protagonist    = $gameStore.protagonist;
  $: realCondition  = protagonist.condition;
  $: realFatigue    = protagonist.fatigue;
  $: realMorale     = protagonist.morale;

  $: isBatter = protagonist.playerType === "batter";
  $: mainPrograms = isBatter ? batterPrograms : pitcherPrograms;
  $: allPrograms  = [...mainPrograms, ...recoveryPrograms];

  // 코치 스탯 기반 동적 coachMod
  $: pitchCoach = $masterStore.entities.find(
    (e) => e.role === "coach" && e.teamId === protagonist.teamId &&
           (e.details as import("../../shared/stores/master").EntityDetails)?.coach?.specialty === "pitching"
  );
  $: coachTeaching = (pitchCoach?.details as import("../../shared/stores/master").EntityDetails)?.coach?.stats?.teaching ?? 50;
  $: coachFatMod  = Math.max(0.88, 1.0 - coachTeaching * 0.0024);   // 50→0.88, 75→0.82 → clamp 0.88
  $: coachRiskMod = Math.max(0.85, 1.0 - coachTeaching * 0.003);    // 50→0.85, 75→0.775 → clamp 0.85
  $: coachMod     = { fatigue: coachFatMod, risk: coachRiskMod };

  const facilityMod = { fatigue: 0.90, risk: 0.95 };

  // 사기 슬럼프 상태
  $: lowMoraleWeeks = protagonist.consecutiveLowMoraleWeeks ?? 0;
  $: isSlump        = lowMoraleWeeks >= 3;

  // ── 구종 시스템 ──────────────────────────────────────────────
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

  function isPitchEligible(pitch: { unlockRuleId: string }, p: typeof protagonist): boolean {
    const rule = $pitchUnlockRuleMap.get(pitch.unlockRuleId);
    if (!rule || rule.type === "always") return true;
    if (rule.type === "min_stat" && rule.params.stat && rule.params.value !== undefined) {
      return getStatValue(rule.params.stat, p) >= rule.params.value;
    }
    if (rule.type === "multi_stat" && rule.params.conditions) {
      return rule.params.conditions.every((c: { stat: string; value: number }) =>
        getStatValue(c.stat, p) >= c.value
      );
    }
    return false;
  }

  $: learnedIds      = new Set((protagonist.pitches ?? []).map((e) => e.id));
  $: trainingPitchSt = protagonist.trainingPitchState ?? null;

  $: pitchCandidates = $masterStore.pitchCatalog.map((pitch) => {
    const pitchEntry   = (protagonist.pitches ?? []).find((e) => e.id === pitch.id);
    const learned      = !!pitchEntry;
    const inTraining   = trainingPitchSt?.id === pitch.id;
    const eligible     = isPitchEligible(pitch, protagonist);

    const rule = $pitchUnlockRuleMap.get(pitch.unlockRuleId);
    let requirements: Array<{ label: string; required: number; current: number }> = [];
    if (rule?.type === "min_stat" && rule.params.stat && rule.params.value !== undefined) {
      requirements = [{ label: STAT_LABEL[rule.params.stat] ?? rule.params.stat, required: rule.params.value, current: getStatValue(rule.params.stat, protagonist) }];
    } else if (rule?.type === "multi_stat" && rule.params.conditions) {
      requirements = rule.params.conditions.map((c: { stat: string; value: number }) => ({
        label:    STAT_LABEL[c.stat] ?? c.stat,
        required: c.value,
        current:  getStatValue(c.stat, protagonist),
      }));
    }

    let status: PitchStatus;
    if (learned && inTraining)  status = "grading";
    else if (learned)           status = "learned";
    else if (inTraining)        status = "training";
    else if (eligible)          status = "discovered";
    else                        status = "locked";

    return {
      id:       pitch.id,
      name:     pitch.nameKo ?? pitch.name,
      status,
      grade:    pitchEntry?.grade ?? 0,
      progress: inTraining ? trainingPitchSt!.progress : 0,
      requirements,
    } as PitchCandidate;
  });

  $: learnedPitches     = pitchCandidates.filter((p) => p.status === "learned" || p.status === "grading");
  $: trainingPitch      = pitchCandidates.find((p) => p.status === "training" || p.status === "grading") ?? null;
  $: eligiblePitches    = pitchCandidates.filter((p) => p.status === "discovered");
  $: lockedPitches      = pitchCandidates.filter((p) => p.status === "locked");

  $: mainCard     = allPrograms.find((p) => p.id === selectedMain);
  $: subCard      = allPrograms.find((p) => p.id === selectedSub);
  $: recoveryCard = allPrograms.find((p) => p.id === selectedRecovery);
  $: selectedCards = [mainCard, subCard, recoveryCard].filter(Boolean) as ProgramCard[];

  $: rawFatigueDelta = selectedCards.reduce((sum, c) => sum + c.fatigue, 0);
  $: rawRiskDelta    = selectedCards.reduce((sum, c) => sum + c.risk,    0);

  $: finalFatigueDelta   = Math.round(rawFatigueDelta * coachMod.fatigue * facilityMod.fatigue) - 5;
  $: finalRiskDelta      = Math.round(rawRiskDelta    * coachMod.risk    * facilityMod.risk);

  $: projectedFatigue   = Math.max(0, Math.min(100, realFatigue   + finalFatigueDelta));
  $: projectedCondition = Math.max(0, Math.min(100, realCondition - Math.max(0, finalFatigueDelta) * 0.4 + 3));
  $: projectedRisk      = Math.max(0, Math.round(Math.max(0, projectedFatigue - 60) * 0.8));

  $: recentLogs = $gameStore.logs.slice(0, 5);

  $: pitchDevSelected = selectedMain === "TRN_PITCH_DEV" || selectedSub === "TRN_PITCH_DEV";

  function riskTone(value: number): "safe" | "warn" | "danger" {
    if (value >= 20) return "danger";
    if (value >= 10) return "warn";
    return "safe";
  }

  function unmetRequirementText(pitch: PitchCandidate): string {
    const unmet = pitch.requirements.filter((req) => req.current < req.required);
    if (unmet.length === 0) return "조건 충족";
    return unmet.map((req) => `${req.label} ${req.required} 필요 (현재 ${req.current})`).join(" · ");
  }

  function canStart(pitch: PitchCandidate): boolean {
    return !trainingPitch && projectedFatigue < 80 &&
      (pitch.status === "discovered" || (pitch.status === "learned" && pitch.grade < 5));
  }

  function startTraining(pitchId: string) {
    const pitch = pitchCandidates.find((p) => p.id === pitchId);
    if (!pitch || !canStart(pitch)) return;
    gameStore.startPitchTraining(pitchId);
    gameStore.save();
  }

  function gradeTone(grade: number): string {
    if (grade >= 5) return "g5";
    if (grade >= 4) return "g4";
    if (grade >= 3) return "g3";
    return "g1";
  }
</script>

<section class="page">
  <h2>{$t("page.training")}</h2>

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "plan"}  on:click={() => (tab = "plan")}>훈련 계획</button>
        <button class:active={tab === "pitch"} on:click={() => (tab = "pitch")}>구종 개발</button>
        <button class:active={tab === "risk"}  on:click={() => (tab = "risk")}>리스크/로그</button>
      </div>

      <div class="kpis">
        <p>컨디션 <strong>{projectedCondition}</strong></p>
        <p>피로 <strong>{projectedFatigue}</strong></p>
        <p>부상위험 <strong class={riskTone(projectedRisk)}>{projectedRisk}%</strong></p>
      </div>
    </header>

    {#if tab === "plan"}
      <div class="content-grid">
        <section class="panel daily-plan">
          <h3>훈련 슬롯 (3슬롯)</h3>

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

          {#if pitchDevSelected}
            <div class="pitch-dev-notice">
              {#if trainingPitch}
                <span class="notice-label">구종 개발 대상</span>
                <strong>{trainingPitch.name}</strong>
                <span class="progress-text">{trainingPitch.progress.toFixed(0)}% 진행</span>
              {:else}
                <span class="notice-warn">⚠ 구종 개발 탭에서 훈련할 구종을 먼저 선택하세요.</span>
              {/if}
            </div>
          {/if}

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
            <li>
              <span>투수 코치{pitchCoach ? ` (${pitchCoach.name})` : ""}</span>
              <strong>지도 {coachTeaching}</strong>
            </li>
            <li><span>코치 피로 보정</span><strong>x{coachMod.fatigue.toFixed(2)}</strong></li>
            <li><span>시설 피로 보정</span><strong>x{facilityMod.fatigue.toFixed(2)}</strong></li>
            <li><span>시설 리스크 보정</span><strong>x{facilityMod.risk.toFixed(2)}</strong></li>
          </ul>
          {#if isSlump}
            <p class="risk-note danger">슬럼프 진행중 ({lowMoraleWeeks}주) — 훈련 효율 -30%</p>
          {:else if lowMoraleWeeks > 0}
            <p class="risk-note warn">사기 저하 {lowMoraleWeeks}주차 — 3주 연속 시 슬럼프 진입</p>
          {/if}

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

    {:else if tab === "pitch"}
      <div class="pitch-grid">

        <!-- 보유 구종 -->
        <section class="panel">
          <h3>보유 구종 <span class="count">{learnedPitches.length}</span></h3>
          {#if learnedPitches.length === 0}
            <p class="empty-text">아직 습득한 구종이 없습니다.</p>
          {:else}
            <div class="pitch-learned-list">
              {#each learnedPitches as pitch}
                <article class="learned-card grade-{gradeTone(pitch.grade)}">
                  <div class="learned-head">
                    <strong>{pitch.name}</strong>
                    <span class="grade-badge grade-{gradeTone(pitch.grade)}">{GRADE_LABEL[pitch.grade] ?? pitch.grade}</span>
                  </div>
                  {#if pitch.status === "grading"}
                    <div class="progress-row">
                      <span class="progress-label">숙련도 향상 중</span>
                      <span class="progress-val">{pitch.progress.toFixed(0)}%</span>
                    </div>
                    <div class="progress-wrap"><div class="progress-bar" style="width:{pitch.progress}%"></div></div>
                  {:else if pitch.grade < 5}
                    <button
                      class="grade-up-btn"
                      disabled={!!trainingPitch || projectedFatigue >= 80}
                      on:click={() => startTraining(pitch.id)}
                    >숙련도 향상 훈련 시작</button>
                  {:else}
                    <span class="mastered">마스터 완료</span>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </section>

        <!-- 신규 습득 훈련중 -->
        <section class="panel">
          <h3>신규 습득 훈련중</h3>
          {#if trainingPitch && trainingPitch.status === "training"}
            <article class="training-card">
              <strong>{trainingPitch.name}</strong>
              <div class="progress-row">
                <span class="progress-label">진행률</span>
                <span class="progress-val">{trainingPitch.progress.toFixed(0)}%</span>
              </div>
              <div class="progress-wrap"><div class="progress-bar" style="width:{trainingPitch.progress}%"></div></div>
              <p class="hint">TRN_PITCH_DEV 슬롯 선택 시 매주 +20% 진행</p>
            </article>
          {:else}
            <p class="empty-text">진행중인 신규 습득 훈련이 없습니다.</p>
          {/if}

          <!-- 해금 가능 구종 -->
          <h3 style="margin-top:12px">해금 가능 <span class="count">{eligiblePitches.length}</span></h3>
          {#if eligiblePitches.length === 0}
            <p class="empty-text">조건을 충족한 신규 구종이 없습니다.</p>
          {:else}
            <div class="candidate-list">
              {#each eligiblePitches as pitch}
                <article>
                  <div class="row-head">
                    <strong>{pitch.name}</strong>
                    <button
                      disabled={!!trainingPitch || projectedFatigue >= 80}
                      on:click={() => startTraining(pitch.id)}
                    >습득 시작</button>
                  </div>
                  {#if trainingPitch}
                    <p class="hint">다른 구종 훈련이 진행중입니다.</p>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </section>

        <!-- 조건 미충족 -->
        <section class="panel">
          <h3>조건 미충족 <span class="count">{lockedPitches.length}</span></h3>
          {#if lockedPitches.length === 0}
            <p class="empty-text">모든 구종 조건을 충족했습니다.</p>
          {:else}
            <div class="locked-list">
              {#each lockedPitches as pitch}
                <article class="locked-card">
                  <strong>{pitch.name}</strong>
                  <p class="req-text">{unmetRequirementText(pitch)}</p>
                  <div class="req-bars">
                    {#each pitch.requirements as req}
                      <div class="req-row">
                        <span>{req.label}</span>
                        <div class="req-bar-wrap">
                          <div class="req-bar" style="width:{Math.min(100, req.current / req.required * 100)}%"></div>
                        </div>
                        <span class="req-val {req.current >= req.required ? 'ok' : 'no'}">{req.current}/{req.required}</span>
                      </div>
                    {/each}
                  </div>
                </article>
              {/each}
            </div>
          {/if}
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
            <li>피로 70+: 훈련 XP ×0.70 페널티</li>
            <li>피로 85+: 훈련 XP ×0.50 페널티</li>
            <li>사기 35 미만 3주 연속: 슬럼프 (훈련 효율 -30%)</li>
          </ul>
          {#if isSlump}
            <p class="risk-note danger">슬럼프 진행중 ({lowMoraleWeeks}주 연속) — 즉시 사기 회복 필요</p>
          {:else if lowMoraleWeeks > 0}
            <p class="risk-note warn">사기 저하 {lowMoraleWeeks}주 연속 (3주 달성 시 슬럼프)</p>
          {:else}
            <p class="risk-note safe">사기 정상 — 슬럼프 위험 없음</p>
          {/if}
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

  h2, h3, h4, p { margin: 0; }
  h2 { font-size: 22px; }

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

  .tabs, .kpis {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .tabs button, select, .candidate-list button, .grade-up-btn {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .tabs button.active { background: #3262b0; border-color: #6da1f7; }

  .kpis p {
    border: 1px solid #2e486f;
    border-radius: 999px;
    background: #152b4f;
    padding: 3px 8px;
    color: #cfe0ff;
    font-size: 12px;
  }

  .kpis strong { margin-left: 4px; color: #f3f7ff; }
  .kpis strong.safe   { color: #7be4a6; }
  .kpis strong.warn   { color: #ffd78a; }
  .kpis strong.danger { color: #ff9b8a; }

  /* ── 훈련 계획 탭 ─────────────────── */
  .content-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(260px, 1fr);
    gap: 10px;
    overflow: hidden;
  }

  .panel {
    border: 1px solid #2f486f;
    border-radius: 10px;
    background: #13223d;
    padding: 10px;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .daily-plan label {
    display: grid;
    gap: 4px;
  }

  .daily-plan label span {
    color: #aac0e4;
    font-size: 12px;
  }

  .pitch-dev-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #2f6f58;
    border-radius: 8px;
    background: #0f2a22;
    padding: 8px 10px;
    font-size: 13px;
    flex-wrap: wrap;
  }

  .notice-label {
    color: #7ecfb8;
    font-size: 12px;
  }

  .pitch-dev-notice strong {
    color: #c0f0e0;
  }

  .progress-text {
    color: #7ecfb8;
    font-size: 12px;
    margin-left: auto;
  }

  .notice-warn {
    color: #ffd78a;
    font-size: 12px;
  }

  .slot-cards { display: grid; gap: 6px; margin-top: 4px; }

  .slot-cards article, .training-card {
    border: 1px solid #2d4a76;
    border-radius: 8px;
    background: #152b4f;
    padding: 8px;
    display: grid;
    gap: 4px;
  }

  .slot-cards strong, .training-card strong { color: #eef5ff; font-size: 13px; }
  .slot-cards p, .training-card p { color: #bfd2f3; font-size: 12px; }
  .slot-cards .gain { color: #83e6ad; }

  ul, ol {
    margin: 0; padding: 0;
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

  .risk-note.safe   { border-color: #3c7a5a; color: #98e5bd; background: #1a3a2c; }
  .risk-note.warn   { border-color: #8a6f3a; color: #ffe0a2; background: #3d311a; }
  .risk-note.danger { border-color: #8d4a3f; color: #ffc0b6; background: #3b1f1b; }

  ol li { justify-content: flex-start; }

  /* ── 구종 개발 탭 ─────────────────── */
  .pitch-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .count {
    display: inline-block;
    margin-left: 6px;
    background: #253d65;
    color: #aac6f5;
    border-radius: 999px;
    font-size: 11px;
    padding: 1px 7px;
    font-weight: 400;
  }

  .pitch-learned-list, .candidate-list, .locked-list {
    display: grid;
    gap: 6px;
  }

  /* 보유 구종 카드 */
  .learned-card {
    border: 1px solid #2e486f;
    border-radius: 8px;
    background: #152b4f;
    padding: 8px 10px;
    display: grid;
    gap: 6px;
  }

  .learned-card.grade-g5 { border-color: #c8a030; background: #2a1e06; }
  .learned-card.grade-g4 { border-color: #3a7ad8; background: #0e2040; }
  .learned-card.grade-g3 { border-color: #3a7a5a; background: #0e2a20; }

  .learned-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .learned-head strong { color: #eef5ff; font-size: 13px; }

  /* grade 뱃지 */
  .grade-badge {
    font-size: 11px;
    border-radius: 999px;
    padding: 2px 8px;
    border: 1px solid #2e486f;
    background: #152b4f;
    color: #9ab8e0;
  }

  .grade-badge.grade-g5 { border-color: #c8a030; background: #2a1e06; color: #f0c860; }
  .grade-badge.grade-g4 { border-color: #3a7ad8; background: #0e2040; color: #88b8f8; }
  .grade-badge.grade-g3 { border-color: #3a7a5a; background: #0e2a20; color: #7adfb8; }

  .grade-up-btn {
    width: 100%;
    padding: 5px;
    font-size: 12px;
  }

  .grade-up-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .mastered {
    font-size: 12px;
    color: #f0c860;
    text-align: center;
    padding: 4px 0;
  }

  /* progress 바 공용 */
  .progress-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .progress-label { color: #9eb6de; }
  .progress-val   { color: #c8e0ff; }

  .progress-wrap {
    height: 6px;
    border-radius: 999px;
    background: #20375c;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    border-radius: inherit;
    background: #79aaff;
    transition: width 0.3s;
  }

  /* 해금 가능 */
  .candidate-list article {
    border: 1px solid #2d4a76;
    border-radius: 8px;
    background: #152b4f;
    padding: 8px 10px;
    display: grid;
    gap: 4px;
  }

  .row-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .candidate-list strong { color: #eef5ff; font-size: 13px; }
  .candidate-list button { padding: 4px 10px; }
  .candidate-list button:disabled { opacity: 0.45; cursor: not-allowed; }

  /* 조건 미충족 */
  .locked-card {
    border: 1px solid #2d3a58;
    border-radius: 8px;
    background: #111c32;
    padding: 8px 10px;
    display: grid;
    gap: 6px;
    opacity: 0.85;
  }

  .locked-card strong { color: #8a9dbf; font-size: 13px; }

  .req-text { color: #8299c0; font-size: 11px; }

  .req-bars { display: grid; gap: 4px; }

  .req-row {
    display: grid;
    grid-template-columns: 60px 1fr 56px;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #7a90b8;
  }

  .req-bar-wrap {
    height: 4px;
    border-radius: 999px;
    background: #1e3054;
    overflow: hidden;
  }

  .req-bar {
    height: 100%;
    border-radius: inherit;
    background: #4a78c0;
  }

  .req-val { text-align: right; }
  .req-val.ok { color: #7be4a6; }
  .req-val.no { color: #ff9b8a; }

  .empty-text { color: #6a85b0; font-size: 12px; }
  .hint       { color: #9fb5db; font-size: 12px; }

  @media (max-width: 1180px) {
    .content-grid { grid-template-columns: 1fr; }
    .pitch-grid   { grid-template-columns: 1fr; }
  }
</style>
