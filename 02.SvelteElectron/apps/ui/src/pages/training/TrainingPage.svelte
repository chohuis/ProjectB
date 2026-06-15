<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore, pitchUnlockRuleMap } from "../../shared/stores/master";
  import { INJURY_LABEL } from "../../shared/types/save";
  import type { TrainingPreset } from "../../shared/types/save";

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

  type CoachAdviceSuggestion = { text: string; primary: string; sub1: string; sub2: string };

  let tab: TrainingTab = "plan";

  // Preset management local state
  let showPresetEditor = false;
  let editingPresetId: string | null = null;
  let editingName = "";
  let addingPreset = false;
  let newPresetName = "";
  let coachAdviceDismissed = false;

  const TREATMENT_LABEL: Record<string, string> = {
    rest: "자연 휴식", conservative: "보존 치료", steroid: "스테로이드",
    prp: "PRP 주사", surgery: "수술", counseling: "심리 상담", self: "자가 극복",
  };
  const SEV_LABEL: Record<string, string> = {
    light: "경상", moderate: "중상", severe: "중증", surgery: "수술",
  };

  const GRADE_LABEL: Record<number, string> = {
    1: "습득중", 2: "기초", 3: "보통", 4: "능숙", 5: "마스터",
  };

  const pitcherPrograms: ProgramCard[] = [
    { id: "TRN_VEL",       title: "구속 훈련",        focus: "구속/하체 드라이브",       gains: "구속, 스태미나",           fatigue: 14, risk: 6 },
    { id: "TRN_CTRL_CMD",  title: "제구/커맨드 훈련", focus: "제구·커맨드 정밀도",       gains: "제구, 커맨드 (균등)",       fatigue: 8,  risk: 2 },
    { id: "TRN_MOVEMENT",  title: "변화구 훈련",      focus: "무브먼트/구종 궤적",       gains: "무브먼트, 제구",            fatigue: 9,  risk: 3 },
    { id: "TRN_MENTAL_P",  title: "정신 훈련",        focus: "압박 대응/집중/견제",      gains: "멘탈, 위기집중력, 견제력",  fatigue: 6,  risk: 0 },
    { id: "TRN_STAMINA",   title: "체력 훈련",        focus: "스태미나/지구력",          gains: "스태미나, 회복력",          fatigue: 12, risk: 4 },
    { id: "TRN_PITCH_DEV", title: "구종 개발",        focus: "구종 숙련도/신규 습득",    gains: "진행중 구종 +17%",          fatigue: 10, risk: 0 },
  ];

  const batterPrograms: ProgramCard[] = [
    { id: "TRN_BATTING",   title: "타격 훈련",        focus: "컨택/파워 드라이브",       gains: "컨택, 장타력",              fatigue: 10, risk: 3 },
    { id: "TRN_PLATE_EYE", title: "출루 훈련",        focus: "볼-스트라이크 판단/번트",  gains: "선구안, 극기, 번트",        fatigue: 6,  risk: 0 },
    { id: "TRN_BASERUN",   title: "주루 훈련",        focus: "스피드/베이스러닝",        gains: "주력, 주루판단",            fatigue: 10, risk: 3 },
    { id: "TRN_DEFENSE",   title: "수비 훈련",        focus: "글러브 워크/어깨",         gains: "수비, 어깨",                fatigue: 9,  risk: 2 },
    { id: "TRN_MENTAL_B",  title: "정신/클러치 훈련", focus: "압박 대응/득점권 집중",    gains: "멘탈, 클러치",              fatigue: 6,  risk: 0 },
    { id: "TRN_STAMINA",   title: "체력 훈련",        focus: "스태미나/지구력",          gains: "스태미나, 회복력",          fatigue: 12, risk: 4 },
  ];

  const recoveryPrograms: ProgramCard[] = [
    { id: "TRN_RECOVERY", title: "컨디셔닝 회복", focus: "회복/유연성", gains: "피로 ↓, 컨디션 ↑", fatigue: -10, risk: 0 },
  ];

  const GAIN_CHIPS: Record<string, Array<{ label: string; type: "up" | "down" }>> = {
    TRN_VEL:       [{ label: "구속",    type: "up" }, { label: "스태미나", type: "up" }],
    TRN_CTRL_CMD:  [{ label: "제구",    type: "up" }, { label: "커맨드",   type: "up" }],
    TRN_MOVEMENT:  [{ label: "무브먼트",type: "up" }, { label: "제구",     type: "up" }],
    TRN_MENTAL_P:  [{ label: "멘탈",   type: "up" }, { label: "집중력",   type: "up" }],
    TRN_STAMINA:   [{ label: "스태미나",type: "up" }, { label: "회복력",   type: "up" }],
    TRN_PITCH_DEV: [{ label: "구종 진행", type: "up" }],
    TRN_BATTING:   [{ label: "컨택",    type: "up" }, { label: "장타력",   type: "up" }],
    TRN_PLATE_EYE: [{ label: "선구안",  type: "up" }, { label: "극기",     type: "up" }],
    TRN_BASERUN:   [{ label: "주력",    type: "up" }, { label: "주루",     type: "up" }],
    TRN_DEFENSE:   [{ label: "수비",    type: "up" }, { label: "어깨",     type: "up" }],
    TRN_MENTAL_B:  [{ label: "멘탈",   type: "up" }, { label: "클러치",   type: "up" }],
    TRN_RECOVERY:  [{ label: "피로",    type: "down"}, { label: "컨디션",  type: "up" }],
  };

  $: selectedMain = $gameStore.trainingPlan.primaryProgramId   ?? "TRN_CTRL_CMD";
  $: selectedSub1 = $gameStore.trainingPlan.secondaryProgramId ?? "TRN_VEL";
  $: selectedSub2 = $gameStore.trainingPlan.secondary2ProgramId ?? "TRN_RECOVERY";

  $: savedPresets = $gameStore.trainingPresets ?? [];

  $: activePresetId = savedPresets.find((p) =>
    p.primaryProgramId === selectedMain &&
    p.secondary1ProgramId === selectedSub1 &&
    p.secondary2ProgramId === selectedSub2
  )?.id ?? null;

  $: protagonist    = $gameStore.protagonist;
  $: realCondition  = protagonist.condition;
  $: realFatigue    = protagonist.fatigue;
  $: realMorale     = protagonist.morale;

  $: isBatter = protagonist.playerType === "batter";
  $: mainPrograms = isBatter ? batterPrograms : pitcherPrograms;
  $: allPrograms  = [...mainPrograms, ...recoveryPrograms];

  $: pitchCoach = $masterStore.entities.find(
    (e) => e.role === "coach" && e.teamId === protagonist.teamId &&
           (e.details as import("../../shared/stores/master").EntityDetails)?.coach?.specialty === "pitching"
  );
  $: coachTeaching = (pitchCoach?.details as import("../../shared/stores/master").EntityDetails)?.coach?.stats?.teaching ?? 50;
  $: coachFatMod  = Math.max(0.88, 1.0 - coachTeaching * 0.0024);
  $: coachRiskMod = Math.max(0.85, 1.0 - coachTeaching * 0.003);
  $: coachMod     = { fatigue: coachFatMod, risk: coachRiskMod };

  $: teamRef = $masterStore.teams.find((t) => t.id === protagonist.teamId);
  $: facilityFatMod = (() => {
    switch (protagonist.careerStage) {
      case "highschool":  return 0.92;
      case "university":  return 0.95;
      case "military":    return 0.90;
      case "independent": return 0.88;
      default: return teamRef?.tier === "1군" ? 0.88 : 0.94;
    }
  })();
  $: facilityRiskMod = (() => {
    switch (protagonist.careerStage) {
      case "highschool":  return 0.97;
      case "university":  return 0.96;
      case "military":    return 0.98;
      case "independent": return 0.99;
      default: return teamRef?.tier === "1군" ? 0.90 : 0.95;
    }
  })();
  $: facilityMod = { fatigue: facilityFatMod, risk: facilityRiskMod };

  $: lowMoraleWeeks = protagonist.consecutiveLowMoraleWeeks ?? 0;
  $: isSlump        = lowMoraleWeeks >= 3;

  $: injury       = protagonist.injury;
  $: isInjured    = !!injury;
  $: highFatWeeks = protagonist.consecutiveHighFatigueWeeks ?? 0;

  $: trainingHistoryLogs = $gameStore.logs.filter((l) => l.startsWith("[훈련]")).slice(0, 6);

  const STAT_LABEL: Record<string, string> = {
    command:   "커맨드",
    control:   "제구",
    velocity:  "구속",
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

  $: trainingPitchSt = protagonist.trainingPitchState ?? null;

  $: pitchCandidates = $masterStore.pitchCatalog.map((pitch) => {
    const pitchEntry = (protagonist.pitches ?? []).find((e) => e.id === pitch.id);
    const learned    = !!pitchEntry;
    const inTraining = trainingPitchSt?.id === pitch.id;
    const eligible   = isPitchEligible(pitch, protagonist);

    const rule = $pitchUnlockRuleMap.get(pitch.unlockRuleId);
    let requirements: Array<{ label: string; required: number; current: number }> = [];
    if (rule?.type === "min_stat" && rule.params.stat && rule.params.value !== undefined) {
      requirements = [{ label: STAT_LABEL[rule.params.stat] ?? rule.params.stat, required: rule.params.value, current: getStatValue(rule.params.stat, protagonist) }];
    } else if (rule?.type === "multi_stat" && rule.params.conditions) {
      requirements = rule.params.conditions.map((c: { stat: string; value: number }) => ({
        label: STAT_LABEL[c.stat] ?? c.stat, required: c.value, current: getStatValue(c.stat, protagonist),
      }));
    }

    let status: PitchStatus;
    if (learned && inTraining)  status = "grading";
    else if (learned)           status = "learned";
    else if (inTraining)        status = "training";
    else if (eligible)          status = "discovered";
    else                        status = "locked";

    return {
      id: pitch.id, name: pitch.nameKo ?? pitch.name, status,
      grade: pitchEntry?.grade ?? 0,
      progress: inTraining ? trainingPitchSt!.progress : 0,
      requirements,
    } as PitchCandidate;
  });

  $: learnedPitches  = pitchCandidates.filter((p) => p.status === "learned" || p.status === "grading");
  $: trainingPitch   = pitchCandidates.find((p) => p.status === "training" || p.status === "grading") ?? null;
  $: eligiblePitches = pitchCandidates.filter((p) => p.status === "discovered");
  $: lockedPitches   = pitchCandidates.filter((p) => p.status === "locked");

  $: mainCard = allPrograms.find((p) => p.id === selectedMain);
  $: sub1Card = allPrograms.find((p) => p.id === selectedSub1);
  $: sub2Card = allPrograms.find((p) => p.id === selectedSub2);
  $: selectedCards = [mainCard, sub1Card, sub2Card].filter(Boolean) as ProgramCard[];

  $: rawFatigueDelta = selectedCards.reduce((sum, c) => sum + c.fatigue, 0);
  $: rawRiskDelta    = selectedCards.reduce((sum, c) => sum + c.risk,    0);

  $: finalFatigueDelta = Math.round(rawFatigueDelta * coachMod.fatigue * facilityMod.fatigue) - 5;
  $: finalRiskDelta    = Math.round(rawRiskDelta    * coachMod.risk    * facilityMod.risk);

  $: projectedFatigue   = Math.max(0, Math.min(100, realFatigue   + finalFatigueDelta));
  $: projectedCondition = Math.max(0, Math.min(100, realCondition - Math.max(0, finalFatigueDelta) * 0.4 + 3));
  $: projectedRisk      = Math.max(0, Math.round(Math.max(0, projectedFatigue - 60) * 0.8));

  $: recentLogs = $gameStore.logs.slice(0, 5);

  $: pitchDevSelected = selectedMain === "TRN_PITCH_DEV" || selectedSub1 === "TRN_PITCH_DEV" || selectedSub2 === "TRN_PITCH_DEV";

  $: pitchDevWeeksLeft = trainingPitch ? Math.ceil((100 - trainingPitch.progress) / 17) : 0;

  $: fatigueGaugePct = Math.min(100, Math.abs(finalFatigueDelta) / 35 * 100);
  $: fatigueGaugeDir = finalFatigueDelta >= 0 ? "up" : "down";

  $: gainChips = (() => {
    const seen = new Set<string>();
    const result: Array<{ label: string; type: "up" | "down" }> = [];
    for (const card of selectedCards) {
      for (const chip of (GAIN_CHIPS[card.id] ?? [])) {
        if (!seen.has(chip.label)) {
          seen.add(chip.label);
          result.push(chip);
        }
      }
    }
    return result;
  })();

  $: coachFeedback = (() => {
    if (!pitchCoach) return "담당 코치가 없어 훈련 효율이 낮습니다.";
    if (isInjured) return "부상 중에는 무리한 훈련을 피해야 합니다.";
    if (realCondition < 40) return "컨디션이 좋지 않습니다. 무리하지 마세요.";
    if (realFatigue > 70) return "피로 누적으로 훈련 효율이 떨어지고 있습니다.";
    if (isSlump) return "슬럼프 중입니다. 멘탈 관리가 중요합니다.";
    return "훈련에 집중할 수 있는 좋은 상태입니다.";
  })();

  $: coachAdvice = ((): CoachAdviceSuggestion | null => {
    if (isInjured) return { text: "부상 중입니다. 무리하지 말고 회복에 전념하세요.", primary: "TRN_RECOVERY", sub1: "TRN_MENTAL_P", sub2: "TRN_RECOVERY" };
    if (realCondition < 35) return { text: "컨디션이 매우 낮습니다. 이번 주는 회복을 최우선으로 하세요.", primary: "TRN_RECOVERY", sub1: "TRN_MENTAL_P", sub2: "TRN_STAMINA" };
    if (realFatigue > 75) return { text: "피로가 많이 쌓였습니다. 고강도 훈련을 줄이는 것을 권장합니다.", primary: "TRN_RECOVERY", sub1: "TRN_STAMINA", sub2: "TRN_MENTAL_P" };
    if (isSlump) return { text: "슬럼프 상태입니다. 정신 훈련으로 돌파구를 마련해 보세요.", primary: "TRN_MENTAL_P", sub1: "TRN_RECOVERY", sub2: "TRN_STAMINA" };
    if (!isBatter && protagonist.pitching.velocity < 55) return { text: "구속이 낮습니다. 구속 훈련에 집중해보세요.", primary: "TRN_VEL", sub1: "TRN_CTRL_CMD", sub2: "TRN_STAMINA" };
    if (!isBatter && protagonist.pitching.control < 55) return { text: "제구력이 부족합니다. 제구 훈련을 우선시하세요.", primary: "TRN_CTRL_CMD", sub1: "TRN_MOVEMENT", sub2: "TRN_MENTAL_P" };
    return null;
  })();

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
    return !trainingPitch && !isInjured && projectedFatigue < 80 &&
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

  function applyPreset(p: TrainingPreset) {
    gameStore.setTrainingPlan({
      primaryProgramId:    p.primaryProgramId,
      secondaryProgramId:  p.secondary1ProgramId,
      secondary2ProgramId: p.secondary2ProgramId,
    });
    gameStore.save();
  }

  function saveNewPreset() {
    if (!newPresetName.trim()) return;
    gameStore.addTrainingPreset({
      id: `preset-${Date.now()}`,
      name: newPresetName.trim(),
      primaryProgramId:    selectedMain,
      secondary1ProgramId: selectedSub1,
      secondary2ProgramId: selectedSub2,
    });
    gameStore.save();
    newPresetName = "";
    addingPreset = false;
  }

  function startRenamePreset(id: string, currentName: string) {
    editingPresetId = id;
    editingName = currentName;
  }

  function confirmRenamePreset(id: string) {
    if (!editingName.trim()) return;
    gameStore.renameTrainingPreset(id, editingName.trim());
    gameStore.save();
    editingPresetId = null;
    editingName = "";
  }

  function deletePreset(id: string) {
    gameStore.removeTrainingPreset(id);
    gameStore.save();
  }

  function applyCoachAdvice(advice: CoachAdviceSuggestion) {
    gameStore.setTrainingPlan({
      primaryProgramId:    advice.primary,
      secondaryProgramId:  advice.sub1,
      secondary2ProgramId: advice.sub2,
    });
    gameStore.save();
    coachAdviceDismissed = true;
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
    <div class="plan-wrapper">
      <!-- ── 프리셋 관리 ──────────────────────────────────────── -->
      <div class="preset-area">
        <div class="preset-header-row">
          <select
            class="preset-select"
            value={activePresetId ?? "__custom__"}
            on:change={(e) => {
              const found = savedPresets.find((p) => p.id === e.currentTarget.value);
              if (found) applyPreset(found);
            }}
          >
            {#if !activePresetId}
              <option value="__custom__" disabled>— 현재 설정 —</option>
            {/if}
            {#each savedPresets as p}
              <option value={p.id}>{p.name}</option>
            {/each}
            {#if savedPresets.length === 0}
              <option value="__empty__" disabled>저장된 프리셋 없음</option>
            {/if}
          </select>
          <button
            class="mgmt-btn"
            class:active={showPresetEditor}
            on:click={() => { showPresetEditor = !showPresetEditor; }}
          >{showPresetEditor ? "닫기" : "관리"}</button>
          <button
            class="mgmt-btn add"
            class:active={addingPreset}
            on:click={() => { addingPreset = !addingPreset; newPresetName = ""; }}
          >+ 새 프리셋</button>
        </div>

        {#if addingPreset}
          <div class="add-preset-row">
            <input
              bind:value={newPresetName}
              placeholder="프리셋 이름 입력"
              class="preset-name-input"
              on:keydown={(e) => e.key === "Enter" && saveNewPreset()}
            />
            <button class="mgmt-btn" disabled={!newPresetName.trim()} on:click={saveNewPreset}>저장</button>
            <button class="mgmt-btn" on:click={() => { addingPreset = false; newPresetName = ""; }}>취소</button>
          </div>
        {/if}

        {#if showPresetEditor}
          <div class="preset-editor">
            {#if savedPresets.length === 0}
              <p class="empty-text">저장된 프리셋이 없습니다.</p>
            {:else}
              {#each savedPresets as p (p.id)}
                <div class="preset-edit-row" class:is-active={activePresetId === p.id}>
                  {#if editingPresetId === p.id}
                    <input
                      bind:value={editingName}
                      class="preset-name-input"
                      on:keydown={(e) => e.key === "Enter" && confirmRenamePreset(p.id)}
                    />
                    <button class="mgmt-btn" on:click={() => confirmRenamePreset(p.id)}>확인</button>
                    <button class="mgmt-btn" on:click={() => { editingPresetId = null; }}>취소</button>
                  {:else}
                    <span class="preset-edit-name">{p.name}</span>
                    <button class="mgmt-btn" on:click={() => startRenamePreset(p.id, p.name)}>이름변경</button>
                    <button class="mgmt-btn del" on:click={() => deletePreset(p.id)}>삭제</button>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </div>

      <div class="content-grid">
        <!-- ── 왼쪽: 훈련 슬롯 ──────────────────────────────── -->
        <section class="panel daily-plan">
          {#if isInjured && injury}
            <div class="injury-banner">
              <div class="inj-banner-top">
                <span class="inj-sev-tag inj-sev-{injury.severity}">{SEV_LABEL[injury.severity] ?? injury.severity}</span>
                <strong class="inj-type-name">{INJURY_LABEL[injury.type] ?? injury.type}</strong>
                {#if injury.treatmentChoice}
                  <span class="inj-treat-tag">{TREATMENT_LABEL[injury.treatmentChoice] ?? injury.treatmentChoice}</span>
                {/if}
                {#if injury.rehabPhase}
                  <span class="inj-rehab-tag">재활 {injury.rehabPhase}단계</span>
                {/if}
                <span class="inj-weeks-text">잔여 {injury.recoveryWeeksLeft}주 · 훈련 효율 -80%</span>
              </div>
              <div class="inj-progress-wrap">
                <div class="inj-progress-fill" style="width:{Math.round((1 - injury.recoveryWeeksLeft / injury.totalRecoveryWeeks) * 100)}%"></div>
              </div>
            </div>
          {:else if highFatWeeks >= 2}
            <div class="injury-risk-banner">
              피로 위험 구간 {highFatWeeks}주 연속 — 부상 위험 상승 중
            </div>
          {/if}

          <h3>훈련 슬롯</h3>

          <label class="slot-label-wrap">
            <span class="slot-label">주훈련</span>
            <select
              value={selectedMain}
              on:change={(e) => { gameStore.setTrainingPlan({ primaryProgramId: e.currentTarget.value }); gameStore.save(); }}
            >
              {#each allPrograms as p}
                <option value={p.id} disabled={p.id === selectedSub1 || p.id === selectedSub2}>{p.title}</option>
              {/each}
            </select>
          </label>

          <label class="slot-label-wrap">
            <span class="slot-label">보조훈련 1</span>
            <select
              value={selectedSub1}
              on:change={(e) => { gameStore.setTrainingPlan({ secondaryProgramId: e.currentTarget.value }); gameStore.save(); }}
            >
              {#each allPrograms as p}
                <option value={p.id} disabled={p.id === selectedMain || p.id === selectedSub2}>{p.title}</option>
              {/each}
            </select>
          </label>

          <label class="slot-label-wrap">
            <span class="slot-label">보조훈련 2</span>
            <select
              value={selectedSub2}
              on:change={(e) => { gameStore.setTrainingPlan({ secondary2ProgramId: e.currentTarget.value }); gameStore.save(); }}
            >
              {#each allPrograms as p}
                <option value={p.id} disabled={p.id === selectedMain || p.id === selectedSub1}>{p.title}</option>
              {/each}
            </select>
          </label>

          {#if pitchDevSelected}
            {#if trainingPitch}
              <div class="pitch-dev-widget">
                <div class="pdw-header">
                  <span class="pdw-label">구종 개발</span>
                  <span class="pdw-name">{trainingPitch.name}</span>
                </div>
                <div class="progress-row">
                  <span class="progress-label">진행도</span>
                  <span class="progress-val">{trainingPitch.progress.toFixed(0)}%</span>
                </div>
                <div class="progress-wrap">
                  <div class="progress-bar pdw-bar" style="width:{trainingPitch.progress}%"></div>
                </div>
                <p class="pdw-eta">예상 완료: 약 {pitchDevWeeksLeft}주 후</p>
              </div>
            {:else}
              <div class="pitch-dev-notice">
                <span class="notice-warn">⚠ 구종 개발 탭에서 훈련할 구종을 먼저 선택하세요.</span>
              </div>
            {/if}
          {/if}
        </section>

        <!-- ── 오른쪽: 코치 + 예상 결과 ─────────────────────── -->
        <aside class="panel">
          <!-- 코치 피드백 -->
          <div class="coach-card">
            <div class="coach-name">
              {isBatter ? "타격 코치" : "투수 코치"}{pitchCoach ? ` ${pitchCoach.name}` : " (미배정)"}
            </div>
            <p class="coach-feedback">"{coachFeedback}"</p>
          </div>

          <!-- 코치 조언 -->
          {#if coachAdvice && !coachAdviceDismissed}
            <div class="advice-card">
              <p class="advice-text">{coachAdvice.text}</p>
              <div class="advice-btns">
                <button class="advice-apply-btn" on:click={() => applyCoachAdvice(coachAdvice!)}>제안 적용</button>
                <button class="advice-dismiss-btn" on:click={() => { coachAdviceDismissed = true; }}>무시</button>
              </div>
            </div>
          {/if}

          <!-- 예상 결과 -->
          <div class="result-section">
            <h3>예상 결과</h3>

            {#if gainChips.length > 0}
              <div class="gain-chips">
                {#each gainChips as chip}
                  <span class="gain-chip {chip.type}">
                    {chip.label}{chip.type === "up" ? " ↑" : " ↓"}
                  </span>
                {/each}
              </div>
            {/if}

            <div class="fatigue-gauge-row">
              <span class="gauge-label">피로</span>
              <div class="gauge-track">
                <div
                  class="gauge-fill {fatigueGaugeDir === 'up' ? 'fatigue-up' : 'fatigue-down'}"
                  style="width:{fatigueGaugePct}%"
                ></div>
              </div>
              <span class="gauge-arrow {fatigueGaugeDir === 'up' ? 'up-text' : 'down-text'}">
                {fatigueGaugeDir === "up" ? "↑" : "↓"}
              </span>
            </div>

            <p class={`risk-note ${riskTone(projectedRisk)}`}>
              {#if projectedRisk >= 20}
                과부하 구간입니다. 회복 슬롯 강화를 권장합니다.
              {:else if projectedRisk >= 13}
                주의 구간입니다. 다음 주 고강도 훈련은 피하세요.
              {:else}
                안정 구간입니다. 현재 루틴 유지 가능.
              {/if}
            </p>
          </div>

          {#if isSlump}
            <p class="risk-note danger">슬럼프 진행중 ({lowMoraleWeeks}주) — 훈련 효율 -30%</p>
          {:else if lowMoraleWeeks > 0}
            <p class="risk-note warn">사기 저하 {lowMoraleWeeks}주차 — 3주 연속 시 슬럼프 진입</p>
          {/if}
        </aside>
      </div>
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
                    <span class="grade-badge grade-{gradeTone(pitch.grade)}">{(({ 1: "습득중", 2: "기초", 3: "보통", 4: "능숙", 5: "마스터" } as Record<number, string>)[pitch.grade] ?? pitch.grade)}</span>
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
              <p class="hint">구종 개발 슬롯 선택 시 매주 +17% 진행</p>
            </article>
          {:else}
            <p class="empty-text">진행중인 신규 습득 훈련이 없습니다.</p>
          {/if}

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
          <h3>현재 상태</h3>
          <ul>
            <li><span>피로도</span><strong class={riskTone(realFatigue >= 70 ? 20 : realFatigue >= 50 ? 13 : 0)}>{realFatigue}</strong></li>
            <li><span>컨디션</span><strong>{realCondition}</strong></li>
            <li><span>사기</span><strong>{realMorale}</strong></li>
            <li><span>부상 위험</span><strong class={riskTone(projectedRisk)}>{projectedRisk}%</strong></li>
            <li><span>시설 등급</span><strong>{teamRef?.tier ?? protagonist.careerStage}</strong></li>
            <li><span>시설 피로 보정</span><strong>×{facilityMod.fatigue.toFixed(2)}</strong></li>
          </ul>

          {#if isInjured && injury}
            <p class="risk-note danger">
              {SEV_LABEL[injury.severity] ?? injury.severity} ({INJURY_LABEL[injury.type] ?? injury.type}) — {injury.recoveryWeeksLeft}주 회복 필요{injury.treatmentChoice ? ` · ${TREATMENT_LABEL[injury.treatmentChoice]}` : ""}
            </p>
          {:else if highFatWeeks >= 2}
            <p class="risk-note warn">피로 위험 {highFatWeeks}주 연속 — 부상 발생 가능</p>
          {/if}

          <h3>경고 룰</h3>
          <ul>
            <li>피로 70+: XP ×0.70 / 85+: XP ×0.50</li>
            <li>피로 85+ 2주 연속: 부상 위험 25%+</li>
            <li>사기 35 미만 3주 연속: 슬럼프 (-30%)</li>
          </ul>
          {#if isSlump}
            <p class="risk-note danger">슬럼프 진행중 ({lowMoraleWeeks}주 연속)</p>
          {:else if lowMoraleWeeks > 0}
            <p class="risk-note warn">사기 저하 {lowMoraleWeeks}주차</p>
          {:else}
            <p class="risk-note safe">정상 상태 — 슬럼프 위험 없음</p>
          {/if}
        </section>

        <aside class="panel">
          <h3>훈련 히스토리</h3>
          {#if trainingHistoryLogs.length > 0}
            <ol class="history-list">
              {#each trainingHistoryLogs as log}
                <li>{log.replace("[훈련] ", "")}</li>
              {/each}
            </ol>
          {:else}
            <p class="empty-text">아직 훈련 기록이 없습니다.</p>
          {/if}

          <h3 style="margin-top:10px">최근 활동</h3>
          <ol>
            {#each recentLogs.slice(0, 4) as log}
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

  .plan-wrapper {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    min-height: 0;
    overflow: hidden;
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

  /* ── 프리셋 관리 ─────────────────────────────────────── */
  .preset-area {
    display: grid;
    gap: 6px;
  }

  .preset-header-row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .preset-select {
    flex: 1;
    min-width: 120px;
    max-width: 200px;
  }

  .mgmt-btn {
    border: 1px solid #2e486f;
    background: #1a2f50;
    color: #b0c8ef;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, border-color 0.12s;
  }

  .mgmt-btn:hover     { background: #1e3a6a; border-color: #4a78c0; }
  .mgmt-btn.active    { background: #1e3f7a; border-color: #6da1f7; color: #e8f3ff; }
  .mgmt-btn.add       { border-color: #3a6a3a; color: #8ee4a0; }
  .mgmt-btn.add:hover { background: #1e3a2a; }
  .mgmt-btn.del       { border-color: #6a3a3a; color: #e49090; }
  .mgmt-btn.del:hover { background: #3a1e1e; }
  .mgmt-btn:disabled  { opacity: 0.45; cursor: not-allowed; }

  .add-preset-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .preset-name-input {
    flex: 1;
    border: 1px solid #355182;
    background: #1a2f50;
    color: #dbe8ff;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    outline: none;
    min-width: 80px;
  }

  .preset-name-input:focus { border-color: #6da1f7; }

  .preset-editor {
    border: 1px solid #2a3f60;
    border-radius: 8px;
    background: #111c32;
    padding: 8px;
    display: grid;
    gap: 4px;
  }

  .preset-edit-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid transparent;
  }

  .preset-edit-row.is-active {
    border-color: #3a5a8f;
    background: #162040;
  }

  .preset-edit-name {
    flex: 1;
    color: #c0d8ff;
    font-size: 12px;
  }

  /* ── 훈련 계획 탭 ─────────────────── */
  .content-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(240px, 1fr);
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

  .slot-label-wrap {
    display: grid;
    gap: 4px;
  }

  .slot-label {
    color: #aac0e4;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .slot-mult {
    font-size: 11px;
    color: #6a8fbf;
    border: 1px solid #2e486f;
    border-radius: 4px;
    padding: 1px 5px;
  }

  /* ── 구종 개발 위젯 ─────────────────── */
  .pitch-dev-widget {
    border: 1px solid #2f6f58;
    border-radius: 8px;
    background: #0f2a22;
    padding: 10px;
    display: grid;
    gap: 6px;
  }

  .pdw-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .pdw-label {
    font-size: 11px;
    color: #7ecfb8;
  }

  .pdw-name {
    font-size: 13px;
    color: #c0f0e0;
    font-weight: 600;
  }

  .pdw-bar { background: #4abf98; }

  .pdw-eta {
    font-size: 11px;
    color: #7ecfb8;
  }

  .pitch-dev-notice {
    border: 1px solid #6f6f2f;
    border-radius: 8px;
    background: #2a2a0f;
    padding: 8px 10px;
  }

  .notice-warn {
    color: #ffd78a;
    font-size: 12px;
  }

  /* ── 코치 패널 ─────────────────────── */
  .coach-card {
    border: 1px solid #2a4060;
    border-radius: 8px;
    background: #0e1e38;
    padding: 10px 12px;
    display: grid;
    gap: 6px;
  }

  .coach-name {
    font-size: 12px;
    color: #7a9fcc;
    font-weight: 600;
  }

  .coach-feedback {
    font-size: 13px;
    color: #c8deff;
    font-style: italic;
    line-height: 1.5;
  }

  .advice-card {
    border: 1px solid #4a703a;
    border-radius: 8px;
    background: #152512;
    padding: 10px 12px;
    display: grid;
    gap: 8px;
  }

  .advice-text {
    font-size: 12px;
    color: #a8d890;
    line-height: 1.5;
  }

  .advice-btns {
    display: flex;
    gap: 6px;
  }

  .advice-apply-btn {
    border: 1px solid #4a703a;
    background: #1e3a18;
    color: #90e878;
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .advice-apply-btn:hover { background: #284a20; }

  .advice-dismiss-btn {
    border: 1px solid #3a3a4a;
    background: #1a1a2a;
    color: #8090b0;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .advice-dismiss-btn:hover { background: #22223a; }

  /* ── 예상 결과 ─────────────────────── */
  .result-section {
    display: grid;
    gap: 8px;
  }

  .gain-chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .gain-chip {
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 11px;
    border: 1px solid;
  }

  .gain-chip.up   { border-color: #3a6a5a; background: #0f2a22; color: #7adfc0; }
  .gain-chip.down { border-color: #6a5a3a; background: #2a1e0f; color: #dfbc7a; }

  .fatigue-gauge-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .gauge-label {
    font-size: 12px;
    color: #8090b0;
    width: 28px;
    flex-shrink: 0;
  }

  .gauge-track {
    flex: 1;
    height: 8px;
    background: #1e3054;
    border-radius: 999px;
    overflow: hidden;
  }

  .gauge-fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.3s;
  }

  .gauge-fill.fatigue-up   { background: #c05040; }
  .gauge-fill.fatigue-down { background: #40a060; }

  .gauge-arrow {
    font-size: 14px;
    font-weight: bold;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .gauge-arrow.up-text   { color: #e07060; }
  .gauge-arrow.down-text { color: #60c080; }

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

  .training-card {
    border: 1px solid #2d4a76;
    border-radius: 8px;
    background: #152b4f;
    padding: 8px;
    display: grid;
    gap: 4px;
  }

  .training-card strong { color: #eef5ff; font-size: 13px; }

  .empty-text { color: #6a85b0; font-size: 12px; }
  .hint       { color: #9fb5db; font-size: 12px; }

  .injury-banner {
    border: 1px solid #8d4a3f;
    border-radius: 8px;
    background: #3b1f1b;
    padding: 8px 10px;
    display: grid;
    gap: 6px;
    color: #ffc0b6;
  }

  .inj-banner-top {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    font-size: 13px;
  }

  .inj-sev-tag {
    font-size: 11px;
    font-weight: 700;
    border-radius: 4px;
    padding: 1px 7px;
  }
  .inj-sev-tag.inj-sev-light    { background: rgba(100,180,255,0.10); color: #80c8ff; border: 1px solid #2a4a6a; }
  .inj-sev-tag.inj-sev-moderate { background: rgba(255,160,50,0.15);  color: #ffa030; border: 1px solid #7a4010; }
  .inj-sev-tag.inj-sev-severe   { background: rgba(220,60,60,0.15);   color: #e05050; border: 1px solid #7a2020; }
  .inj-sev-tag.inj-sev-surgery  { background: rgba(180,80,255,0.15);  color: #d080ff; border: 1px solid #5a2080; }

  .inj-type-name { font-size: 13px; color: #ffd8c8; }
  .inj-treat-tag { font-size: 11px; color: #c0a898; border: 1px solid #604040; border-radius: 4px; padding: 1px 6px; }
  .inj-rehab-tag { font-size: 11px; color: #d080ff; border: 1px solid #5a2080; border-radius: 4px; padding: 1px 6px; background: rgba(180,80,255,0.08); }
  .inj-weeks-text { font-size: 12px; color: #c09898; margin-left: auto; }

  .inj-progress-wrap {
    height: 4px;
    background: #5a2a2a;
    border-radius: 999px;
    overflow: hidden;
  }
  .inj-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: #e08060;
    transition: width 0.3s;
  }

  .injury-risk-banner {
    border: 1px solid #8a6f3a;
    border-radius: 8px;
    background: #3d311a;
    padding: 7px 10px;
    font-size: 12px;
    color: #ffe0a2;
  }

  .history-list {
    display: grid;
    gap: 5px;
  }

  .history-list li {
    border-color: #2a4a6f;
    background: #0f1e38;
    font-size: 12px;
    color: #b8d0f5;
    justify-content: flex-start;
  }

  @media (max-width: 1180px) {
    .content-grid { grid-template-columns: 1fr; }
    .pitch-grid   { grid-template-columns: 1fr; }
  }
</style>
