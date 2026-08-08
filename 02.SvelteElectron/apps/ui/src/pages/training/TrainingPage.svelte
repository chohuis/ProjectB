<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { masterStore, pitchUnlockRuleMap, entitiesL10n, teamsL10n } from "../../shared/stores/master";
  import type { TrainingProgram } from "../../shared/stores/master";
  import { previewTraining, injuryChance, formPenalty, type TrainingPreview } from "../../shared/utils/growthEngine";
  import { developingDifficultyOf } from "../../shared/utils/arsenal";
  import { staffStatsOf } from "../../shared/utils/staffEffects";
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

  // ⚠ **표를 여기 적지 않는다.** 예전엔 12종이 이 파일에 하드코딩돼 있었고
  // 마스터·엔진과 값이 달라서, 화면은 "피로 +7"이라 하고 엔진은 −4.25를
  // 적용했다(부호가 반대였다). 정본은 `training/programs.json` 하나다.
  //
  // ⚠ `risk`도 안 되살린다 — 화면에 표시되지도 않고 엔진 부상 판정에도
  // 안 쓰이던 값이었다 (design/training.md §3-5).
  const toCard = (p: TrainingProgram): ProgramCard => ({
    id: p.id, title: p.name, focus: p.focusLabel, gains: p.gainsLabel,
    fatigue: p.fatigueCost,
  });

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
  // 주인공 유형에 맞는 것 + 공용. 데이터의 `playerType`이 가른다
  $: mainPrograms   = $masterStore.trainingPrograms
    .filter((p) => !p.isRecovery && (p.playerType === "both"
      || p.playerType === (isBatter ? "batter" : "pitcher")))
    .map(toCard);
  $: recoveryPrograms = $masterStore.trainingPrograms
    .filter((p) => p.isRecovery).map(toCard);
  $: allPrograms    = [...mainPrograms, ...recoveryPrograms];
  $: slot12Programs = allPrograms.filter((p) => p.id !== "TRN_PITCH_DEV");

  $: pitchCoach = $entitiesL10n.find(
    (e) => e.role === "coach" && e.teamId === protagonist.teamId &&
           (e.details as import("../../shared/stores/master").EntityDetails)?.coach?.specialty === "투수"
  );
  // 스태프 능력치는 `staffEffects`만 읽는다 (7-5 F-0). 화면이 직접 파면
  // 키가 바뀌었을 때 조용히 50으로 떨어진다 — 실제로 그렇게 돌던 자리가 있었다
  $: coachTeaching = staffStatsOf(protagonist.teamId ?? "", $entitiesL10n, { specialty: "투수" }).teaching;
  $: coachFatMod  = Math.max(0.88, 1.0 - coachTeaching * 0.0024);
  $: coachRiskMod = Math.max(0.85, 1.0 - coachTeaching * 0.003);
  $: coachMod     = { fatigue: coachFatMod, risk: coachRiskMod };

  $: teamRef = $teamsL10n.find((t) => t.id === protagonist.teamId);
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

  // ── 폼 무너짐 ────────────────────────────────────────────────
  //
  // 새 구종을 몸에 넣는 동안 제구가 실제로 흔들린다. **반드시 보이게 한다** —
  // 경기에만 걸고 화면에 안 적으면 조용한 너프가 되고, 이 프로젝트는 그
  // 반대 방향(표시만 있고 효과 없음)으로 이미 여러 번 당했다.
  //
  // 하락폭은 엔진에 묻는다. 화면이 자기 식을 쓰면 또 갈린다.
  let formPen: { command: number; control: number } = { command: 0, control: 0 };
  $: formDifficulty = developingDifficultyOf(trainingPitchSt, $masterStore.pitchCatalog);
  $: void refreshFormPen(formDifficulty, protagonist.pitching.control);
  async function refreshFormPen(diff: number, ctl: number) {
    formPen = await formPenalty(diff, ctl);
  }
  $: formPitchName = trainingPitchSt
    ? ($masterStore.pitchCatalog.find((c) => c.id === trainingPitchSt!.id)?.nameKo
       ?? trainingPitchSt!.id)
    : "";
  $: formWeeksLeft = trainingPitchSt
    ? Math.max(1, Math.ceil((100 - trainingPitchSt.progress) / Math.max(1, 24 * pitchGradeFactor)))
    : 0;

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

  // ── 예상 결과 — **화면이 계산하지 않는다. 엔진에 묻는다.** ──────
  //
  // ⚠ 여기 자체 식이 셋 있었고 셋 다 엔진과 달랐다:
  //
  //   피로     카드 합 × 코치계수 × 시설계수 − 5
  //            → 슬롯 배수(0.5)도 피로 구간 승수(1.5/2.5/4.0)도 몰랐다.
  //              게다가 **엔진은 코치·시설로 피로를 안 깎는다** — 화면만의 보정이었다.
  //              결과: 화면 "피로 +7" / 엔진 −4.25. **부호가 반대였다.**
  //   컨디션   − max(0, 피로변화) × 0.4 + 3   → 엔진과 무관한 식
  //   부상위험 (예상피로 − 60) × 0.8          → 엔진 판정과 무관한 식
  //
  // 이제 `plan_load`·`injury_trigger_chance`를 그대로 탄다.
  let preview: TrainingPreview | null = null;
  let projectedRisk = 0;

  $: void refreshPreview(selectedMain, selectedSub1, selectedSub2, realFatigue, realCondition,
                         $masterStore.trainingPrograms);

  async function refreshPreview(..._deps: unknown[]) {
    const programs = $masterStore.trainingPrograms;
    if (programs.length === 0) return;
    const plan = {
      primaryProgramId:    selectedMain,
      secondaryProgramId:  selectedSub1,
      secondary2ProgramId: selectedSub2,
      recoveryProgramId:   null,
    };
    const pv = await previewTraining({
      fatigue: realFatigue, condition: realCondition, plan, programs,
    });
    if (!pv) return;
    preview = pv;

    // 부상 확률은 **예상 피로·컨디션**으로 묻는다 — "이대로 가면 얼마인가"다
    const chance = await injuryChance({
      fatigue: pv.projectedFatigue,
      consecutiveHighFatigueWeeks: protagonist.consecutiveHighFatigueWeeks ?? 0,
      hasInjury: !!protagonist.injury,
      playerType: protagonist.playerType,
      age: protagonist.age,
      condition: pv.projectedCondition,
      trainingIntensity,
      consecutiveLowMoraleWeeks: protagonist.consecutiveLowMoraleWeeks ?? 0,
      hasPriorInjurySameArea: (protagonist.injuryHistory ?? []).some((h) => h.severity !== "light"),
      priorSteroidUsed: protagonist.injury?.steroidUsed ?? false,
      injuryPrevention: coachMod.risk,
    });
    if (chance !== null) projectedRisk = Math.round(chance * 100);
  }

  // ⚠ 훈련 강도의 정본은 `advanceWeek`이다 — 회복·정신 훈련을 뺀 슬롯 비율.
  // 여기서 다르게 세면 부상 확률이 실제와 갈린다
  const LOW_INTENSITY = new Set(["TRN_RECOVERY", "TRN_MENTAL_P", "TRN_MENTAL_B"]);
  $: trainingIntensity = (() => {
    const slots = [selectedMain, selectedSub1, selectedSub2].filter(Boolean) as string[];
    if (slots.length === 0) return 0;
    return slots.filter((id) => !LOW_INTENSITY.has(id)).length / slots.length;
  })();

  $: finalFatigueDelta  = Math.round(preview?.fatigueDelta ?? 0);
  $: projectedFatigue   = Math.round(preview?.projectedFatigue ?? realFatigue);
  $: projectedCondition = Math.round(preview?.projectedCondition ?? realCondition);

  $: recentLogs = $gameStore.logs.slice(0, 5);

  $: pitchDevSelected = selectedSub2 === "TRN_PITCH_DEV";

  // grade에 따른 진행 속도 배율 (grade 높을수록 느려짐)
  $: pitchGradeFactor = (() => {
    if (!trainingPitch) return 1;
    const grade = learnedPitches.find((p) => p.id === trainingPitch!.id)?.grade ?? 0;
    if (grade <= 1) return 1.00;
    if (grade === 2) return 2 / 3;
    if (grade === 3) return 1 / 3;
    return 2 / 9;
  })();

  $: pitchDevWeeksLeft = trainingPitch
    ? Math.ceil((100 - trainingPitch.progress) / (12 * pitchGradeFactor))
    : 0;

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

  /**
   * 구종 상한 — **코드에 적지 않는다.** 경기 화면에도 같은 숫자가 필요해져
   * 여기 `const MAX_PITCHES = 5`를 두면 정본이 둘이 된다.
   * 정본은 `training/pitch_catalog.json`의 `maxLearned`.
   */
  $: MAX_PITCHES = $masterStore.pitchMaxLearned;

  function canStart(pitch: PitchCandidate): boolean {
    const baseOk = !trainingPitch && !isInjured && projectedFatigue < 80;
    // 숙련도 향상은 구종 수 제한 없음
    if (pitch.status === "learned" && pitch.grade < 5) return baseOk;
    // 신규 습득은 5개 미만일 때만 가능
    return baseOk && pitch.status === "discovered" && learnedPitches.length < MAX_PITCHES;
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

<!-- 제목("훈련")을 뺐다 — "나"의 상위 탭이 이미 그 이름이다 -->
<section class="page">
  <article class="board">
    <header class="top-row">
      <div class="u-subtabs">
        <button class:on={tab === "plan"}  on:click={() => (tab = "plan")}>훈련 계획</button>
        <button class:on={tab === "pitch"} on:click={() => (tab = "pitch")}>구종 개발</button>
        <button class:on={tab === "risk"}  on:click={() => (tab = "risk")}>리스크/로그</button>
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

          <!-- ⚠ **조용한 너프를 만들지 않는다.** 구종을 익히는 동안 제구가
               실제로 깎이므로(엔진 build_pitcher) 그 사실을 여기 적는다 -->
          {#if formPen.command > 0 || formPen.control > 0}
            <div class="form-banner">
              <b>폼 교정 중</b> — {formPitchName}을(를) 익히는 중입니다.
              커맨드 −{formPen.command} · 제구 −{formPen.control}
              <span class="form-weeks">남은 약 {formWeeksLeft}주</span>
              <p class="form-hint">습득을 마치면 원래대로 돌아옵니다. 성적이 걸린 시기라면 오프시즌으로 미루는 것도 방법입니다.</p>
            </div>
          {/if}

          <h3>훈련 슬롯</h3>

          <label class="slot-label-wrap">
            <span class="slot-label">주훈련</span>
            <select
              value={selectedMain}
              on:change={(e) => { gameStore.setTrainingPlan({ primaryProgramId: e.currentTarget.value }); gameStore.save(); }}
            >
              {#each slot12Programs as p}
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
              {#each slot12Programs as p}
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
                <p class="pdw-pause-notice">변화구 훈련의 경우 슬롯에서 해제하면 진행이 멈추고, 다시 등록하면 현재 진행도에서 이어집니다.</p>
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
          {#if learnedPitches.length >= MAX_PITCHES}
            <div class="pitch-limit-notice">
              보유 구종이 최대 {MAX_PITCHES}개에 도달했습니다. 새 구종을 더 이상 습득할 수 없습니다.
            </div>
          {/if}
          {#if eligiblePitches.length === 0}
            <p class="empty-text">조건을 충족한 신규 구종이 없습니다.</p>
          {:else}
            <div class="candidate-list">
              {#each eligiblePitches as pitch}
                <article>
                  <div class="row-head">
                    <strong>{pitch.name}</strong>
                    <button
                      disabled={!canStart(pitch)}
                      on:click={() => startTraining(pitch.id)}
                    >습득 시작</button>
                  </div>
                  {#if trainingPitch}
                    <p class="hint">다른 구종 훈련이 진행중입니다.</p>
                  {:else if learnedPitches.length >= MAX_PITCHES}
                    <p class="hint">보유 구종 {MAX_PITCHES}개 한도 초과</p>
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
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h3, p { margin: 0; }

  .board {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    overflow: hidden;
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
    flex-wrap: wrap;
  }

  .kpis { display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
  .kpis p {
    color: var(--ink-mute);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
  }
  .kpis strong {
    margin-left: 6px;
    color: var(--ink);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .kpis strong.safe   { color: var(--ok); }
  .kpis strong.warn   { color: var(--warn); }
  .kpis strong.danger { color: var(--bad); }

  select, .candidate-list button, .grade-up-btn {
    border: 1px solid var(--line-strong);
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius);
    padding: 5px 11px;
    font-size: 12px;
    cursor: pointer;
  }
  select:hover, .candidate-list button:hover:not(:disabled),
  .grade-up-btn:hover:not(:disabled) { border-color: var(--t-dark); }

  /* -- 프리셋 관리 -- */
  .preset-area { display: grid; gap: 6px; }
  .preset-header-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .preset-select { flex: 1; min-width: 120px; max-width: 200px; }

  .mgmt-btn {
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-mid);
    border-radius: var(--radius);
    padding: 4px 11px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .mgmt-btn:hover  { border-color: var(--t-dark); color: var(--t-dark); }
  .mgmt-btn.active { background: var(--t-dark); border-color: var(--t-dark); color: var(--ink-on-dark); }
  .mgmt-btn.add:hover { border-color: var(--ok);  color: var(--ok); }
  .mgmt-btn.del:hover { border-color: var(--bad); color: var(--bad); }
  .mgmt-btn:disabled  { opacity: 0.35; cursor: not-allowed; }

  .add-preset-row { display: flex; gap: 6px; align-items: center; }

  .preset-name-input {
    flex: 1;
    border: 1px solid var(--line-strong);
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius);
    padding: 5px 9px;
    font-size: 12px;
    outline: none;
    min-width: 80px;
  }
  .preset-name-input:focus { border-color: var(--t-dark); }

  .preset-editor {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 8px;
    display: grid;
    gap: 2px;
  }

  .preset-edit-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 7px;
    border-radius: var(--radius);
    border-left: 3px solid transparent;
  }
  .preset-edit-row.is-active { border-left-color: var(--t-accent); background: var(--panel); }
  .preset-edit-name { flex: 1; color: var(--ink); font-size: 12px; }

  /* -- 훈련 계획 -- */
  .content-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(240px, 1fr);
    gap: 10px;
    overflow: hidden;
  }

  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 12px;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .slot-label-wrap { display: grid; gap: 4px; }
  .slot-label {
    color: var(--ink-mid);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .slot-mult {
    font-size: 10.5px;
    color: var(--ink-mute);
    background: var(--panel-sunk);
    border-radius: 2px;
    padding: 1px 6px;
    font-variant-numeric: tabular-nums;
  }

  /* -- 구종 개발 위젯: 지금 크고 있는 것 하나. 팀 색 띠로 세운다 -- */
  .pitch-dev-widget {
    background: var(--panel-sunk);
    border-left: 3px solid var(--t-dark);
    border-radius: var(--radius);
    padding: 10px 12px;
    display: grid;
    gap: 6px;
  }
  .pdw-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pdw-label {
    font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--ink-mute);
  }
  .pdw-name { font-size: 13px; color: var(--ink); font-weight: 800; }
  .pdw-bar  { background: var(--t-dark); }
  .pdw-eta  { font-size: 11px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }

  .pitch-dev-notice {
    border-left: 3px solid var(--warn);
    border-radius: var(--radius);
    background: var(--panel-sunk);
    padding: 8px 11px;
  }
  .notice-warn { color: var(--warn); font-size: 12px; font-weight: 600; }

  /* -- 코치 -- */
  .coach-card {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 10px 12px;
    display: grid;
    gap: 5px;
  }
  .coach-name {
    font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--ink-mute); text-transform: uppercase;
  }
  .coach-feedback { font-size: 13px; color: var(--ink); font-style: italic; line-height: 1.55; }

  /* 코치 조언은 누르면 계획이 바뀐다 — 읽을 거리가 아니라 행동이라 강조색을 준다 */
  .advice-card {
    background: var(--panel);
    border-left: 3px solid var(--t-accent);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 10px 12px;
    display: grid;
    gap: 8px;
  }
  .advice-text { font-size: 12px; color: var(--ink-mid); line-height: 1.55; }
  .advice-btns { display: flex; gap: 6px; }

  .advice-apply-btn {
    border: 0;
    background: var(--t-accent);
    color: var(--ink-on-dark);
    border-radius: var(--radius);
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .advice-apply-btn:hover { filter: brightness(1.08); }

  .advice-dismiss-btn {
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-mute);
    border-radius: var(--radius);
    padding: 5px 11px;
    font-size: 12px;
    cursor: pointer;
  }
  .advice-dismiss-btn:hover { border-color: var(--line-strong); color: var(--ink-mid); }

  /* -- 예상 결과 -- */
  .result-section { display: grid; gap: 8px; }
  .gain-chips { display: flex; gap: 5px; flex-wrap: wrap; }
  .gain-chip {
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-on-dark);
  }
  .gain-chip.up   { background: var(--ok); }
  .gain-chip.down { background: var(--warn); }

  .fatigue-gauge-row { display: flex; align-items: center; gap: 8px; }
  .gauge-label { font-size: 11px; color: var(--ink-mute); width: 28px; flex-shrink: 0; }
  .gauge-track {
    flex: 1;
    height: 6px;
    background: var(--panel-sunk);
    border-radius: 999px;
    overflow: hidden;
  }
  .gauge-fill { height: 100%; border-radius: inherit; transition: width 0.3s; }
  /* 피로는 오르는 게 나쁘다 — 방향이 반대인 유일한 수치다 */
  .gauge-fill.fatigue-up   { background: var(--bad); }
  .gauge-fill.fatigue-down { background: var(--ok); }

  .gauge-arrow { font-size: 13px; font-weight: 800; width: 16px; text-align: center; flex-shrink: 0; }
  .gauge-arrow.up-text   { color: var(--bad); }
  .gauge-arrow.down-text { color: var(--ok); }

  ul, ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 1px; }
  li {
    border-bottom: 1px solid var(--line);
    padding: 8px 2px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    color: var(--ink-mid);
    font-size: 12.5px;
  }
  li:last-child { border-bottom: 0; }
  li strong { color: var(--ink); font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }

  .risk-note {
    border-left: 3px solid;
    border-radius: var(--radius);
    background: var(--panel-sunk);
    padding: 8px 11px;
    font-size: 12px;
  }
  .risk-note.safe   { border-color: var(--ok);   color: var(--ok); }
  .risk-note.warn   { border-color: var(--warn); color: var(--warn); }
  .risk-note.danger { border-color: var(--bad);  color: var(--bad); }

  ol li { justify-content: flex-start; }

  /* -- 구종 개발 탭 -- */
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
    background: var(--panel-sunk);
    color: var(--ink-mute);
    border-radius: 999px;
    font-size: 10.5px;
    padding: 1px 7px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .pitch-learned-list, .candidate-list, .locked-list { display: grid; gap: 6px; }

  .learned-card {
    background: var(--panel-sunk);
    border-left: 3px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 9px 11px;
    display: grid;
    gap: 6px;
  }
  /* 등급이 오를수록 띠가 진해진다. 마스터만 금색 */
  .learned-card.grade-g5 { border-left-color: var(--warn); }
  .learned-card.grade-g4 { border-left-color: var(--t-dark); }
  .learned-card.grade-g3 { border-left-color: var(--ink-mid); }

  .learned-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .learned-head strong { color: var(--ink); font-size: 13px; font-weight: 800; }

  .grade-badge {
    font-size: 10.5px;
    font-weight: 700;
    border-radius: 999px;
    padding: 2px 9px;
    background: var(--panel);
    color: var(--ink-mute);
  }
  .grade-badge.grade-g5 { background: var(--warn);    color: var(--ink-on-dark); }
  .grade-badge.grade-g4 { background: var(--t-dark);  color: var(--t-gold); }
  .grade-badge.grade-g3 { background: var(--ink-mid); color: var(--ink-on-dark); }

  .grade-up-btn { width: 100%; padding: 6px; font-size: 12px; }
  .grade-up-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .mastered {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--warn);
    text-align: center;
    padding: 4px 0;
  }

  .progress-row {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
  .progress-label { color: var(--ink-mute); }
  .progress-val   { color: var(--ink); font-weight: 700; }

  .progress-wrap {
    height: 5px;
    border-radius: 999px;
    background: var(--panel);
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    border-radius: inherit;
    background: var(--t-dark);
    transition: width 0.3s;
  }

  .candidate-list article {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 9px 11px;
    display: grid;
    gap: 4px;
  }
  .row-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .candidate-list strong { color: var(--ink); font-size: 13px; font-weight: 800; }
  .candidate-list button { padding: 4px 11px; }
  .candidate-list button:disabled { opacity: 0.35; cursor: not-allowed; }

  /* 아직 못 배우는 것 — 흐리게 두되 조건은 읽혀야 한다 */
  .locked-card {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 9px 11px;
    display: grid;
    gap: 6px;
  }
  .locked-card strong { color: var(--ink-mute); font-size: 13px; font-weight: 700; }

  .req-text { color: var(--ink-mute); font-size: 11px; }
  .req-bars { display: grid; gap: 4px; }
  .req-row {
    display: grid;
    grid-template-columns: 60px 1fr 56px;
    align-items: center;
    gap: 6px;
    font-size: 10.5px;
    color: var(--ink-mute);
    font-variant-numeric: tabular-nums;
  }
  .req-bar-wrap { height: 4px; border-radius: 999px; background: var(--panel); overflow: hidden; }
  .req-bar { height: 100%; border-radius: inherit; background: var(--line-strong); }
  .req-val { text-align: right; }
  .req-val.ok { color: var(--ok); font-weight: 700; }
  .req-val.no { color: var(--bad); font-weight: 700; }

  .training-card {
    background: var(--panel-sunk);
    border-left: 3px solid var(--t-dark);
    border-radius: var(--radius);
    padding: 9px 11px;
    display: grid;
    gap: 4px;
  }
  .training-card strong { color: var(--ink); font-size: 13px; font-weight: 800; }

  .empty-text { color: var(--ink-mute); font-size: 12px; }
  .hint       { color: var(--ink-mute); font-size: 11.5px; }

  /* -- 부상 -- */
  .injury-banner {
    background: var(--panel);
    border-left: 3px solid var(--bad);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 9px 12px;
    display: grid;
    gap: 6px;
    color: var(--ink-mid);
  }
  .inj-banner-top {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    font-size: 13px;
  }

  .inj-sev-tag {
    font-size: 10px;
    font-weight: 800;
    border-radius: 2px;
    padding: 2px 8px;
    color: var(--ink-on-dark);
  }
  .inj-sev-tag.inj-sev-light    { background: var(--ink-mute); }
  .inj-sev-tag.inj-sev-moderate { background: var(--warn); }
  .inj-sev-tag.inj-sev-severe   { background: var(--bad); }
  .inj-sev-tag.inj-sev-surgery  { background: #6B1E6B; }

  .inj-type-name  { font-size: 13px; color: var(--ink); font-weight: 700; }
  .inj-treat-tag, .inj-rehab-tag {
    font-size: 10.5px; color: var(--ink-mid);
    background: var(--panel-sunk); border-radius: 2px; padding: 2px 8px;
  }
  .inj-weeks-text {
    font-size: 11.5px; color: var(--ink-mute); margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .inj-progress-wrap { height: 4px; background: var(--panel-sunk); border-radius: 999px; overflow: hidden; }
  .inj-progress-fill { height: 100%; border-radius: inherit; background: var(--bad); transition: width 0.3s; }

  .form-banner {
    margin: 10px 0; padding: 10px 12px; border-radius: 8px;
    background: var(--panel-sunk); border-left: 3px solid var(--warn);
    font-size: 13px; color: var(--ink);
  }
  .form-weeks { margin-left: 6px; color: var(--ink-mid); font-size: 12px; }
  .form-hint  { margin: 6px 0 0; font-size: 12px; color: var(--ink-mid); line-height: 1.5; }

  .injury-risk-banner {
    border-left: 3px solid var(--warn);
    border-radius: var(--radius);
    background: var(--panel-sunk);
    padding: 8px 11px;
    font-size: 12px;
    color: var(--warn);
    font-weight: 600;
  }

  .history-list { display: grid; gap: 1px; }
  .history-list li {
    font-size: 11.5px;
    color: var(--ink-mid);
    justify-content: flex-start;
  }

  @media (max-width: 1180px) {
    .content-grid { grid-template-columns: 1fr; }
    .pitch-grid   { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: reduce) {
    .gauge-fill, .progress-bar, .inj-progress-fill { transition: none; }
  }
</style>
