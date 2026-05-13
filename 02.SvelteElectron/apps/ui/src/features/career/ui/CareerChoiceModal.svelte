<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";

  $: weekInYear = (($seasonStore.currentWeek - 1 + 52) % 52) + 1;
  $: isPrimaryChoice =
    $gameStore.protagonist.careerStage === "highschool" &&
    $gameStore.protagonist.grade === 3 &&
    weekInYear === 50 &&
    !$gameStore.schoolState.fallbackSelectionPending;
  $: isResultChoice = $gameStore.schoolState.fallbackSelectionPending;

  let resolving = false;
  let draftChecked = false;
  let universityChecked = false;
  let independentChecked = false;

  let universityChoices: string[] = [];
  let independentChoices: string[] = [];

  $: univPassed = $gameStore.schoolState.fallbackUniversityPassed;
  $: indiePassed = $gameStore.schoolState.fallbackIndependentPassed;
  $: sportsPassed = $gameStore.schoolState.fallbackSportsMilitaryPassed;
  $: draftPassed = $gameStore.schoolState.fallbackDraftPassed;

  function teamName(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  function setupPrimaryDefaults() {
    if (!isPrimaryChoice) return;
    draftChecked = $gameStore.schoolState.draftIntent;
    universityChoices = [...$gameStore.schoolState.fallbackUniversityChoices];
    independentChoices = [...$gameStore.schoolState.fallbackIndependentChoices];
    universityChecked = universityChoices.length > 0;
    independentChecked = independentChoices.length > 0;
  }
  $: setupPrimaryDefaults();

  function toggleChoice(list: string[], id: string): string[] {
    if (list.includes(id)) return list.filter((v) => v !== id);
    if (list.length >= 3) return list;
    return [...list, id];
  }

  function pickTopTeams(leagueId: string, count: number): string[] {
    return $masterStore.teams.filter((t) => t.leagueId === leagueId).slice(0, count).map((t) => t.id);
  }

  function openUniversitySelect() {
    if (universityChoices.length === 0) universityChoices = pickTopTeams("LEAGUE_UNIVERSITY", 3);
    universityChecked = true;
  }

  function openIndependentSelect() {
    if (independentChoices.length === 0) independentChoices = pickTopTeams("LEAGUE_INDEPENDENT", 3);
    independentChecked = true;
  }

  async function chooseMilitaryNow() {
    if (resolving) return;
    if (!confirm("바로 입대하시겠습니까? 기존 신청은 모두 무시됩니다.")) return;
    resolving = true;
    gameStore.enlistMilitary("general");
    gameStore.setDraftIntent(false);
    gameStore.setCareerApplicationsSubmitted(false);
    gameStore.clearFallbackAdmissions();
    seasonStore.resolvePendingAction("careerChoice");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function submitApplications() {
    if (resolving) return;
    const hasAny = draftChecked || universityChecked || independentChecked;
    if (!hasAny) return;
    resolving = true;
    gameStore.setDraftIntent(draftChecked);
    gameStore.setCareerApplicationsSubmitted(true);
    gameStore.setFallbackAdmissions({
      universityChoices: universityChoices.slice(0, 3),
      independentChoices: independentChoices.slice(0, 3),
      universityPassed: [],
      independentPassed: [],
      sportsMilitaryPassed: false,
      draftPassed: false,
      draftTeamId: null,
      draftRound: null,
      draftPick: null,
      draftSigningBonus: 0,
      pendingSelection: false,
    });
    gameStore.markCareerChoiceTriggered();
    seasonStore.resolvePendingAction("careerChoice");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function chooseResult(kind: "draft" | "university" | "independent" | "sports" | "general", teamId?: string) {
    if (resolving) return;
    resolving = true;

    if (kind === "draft") {
      seasonStore.resolvePendingAction("careerChoice");
      seasonStore.pushPendingAction({
        type: "salaryNegotiation",
        teamId: $gameStore.schoolState.fallbackDraftTeamId ?? $gameStore.protagonist.teamId,
        leagueId: "LEAGUE_KBL",
        offeredSalary: Math.max(3000, Math.round(($gameStore.protagonist.pitching.ovr - 45) * 220)),
        durationYears: 2,
        signingBonus: $gameStore.schoolState.fallbackDraftSigningBonus,
      });
      gameStore.setDraftIntent(false);
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.clearFallbackAdmissions();
    } else if (kind === "university" && teamId) {
      gameStore.applyDraftDecision({ stage: "university", leagueId: "LEAGUE_UNIVERSITY", teamId });
      gameStore.setCareerApplicationsSubmitted(false);
      seasonStore.resolvePendingAction("careerChoice");
    } else if (kind === "independent" && teamId) {
      gameStore.applyDraftDecision({ stage: "independent", leagueId: "LEAGUE_INDEPENDENT", teamId });
      gameStore.setCareerApplicationsSubmitted(false);
      seasonStore.resolvePendingAction("careerChoice");
    } else if (kind === "sports") {
      gameStore.enlistMilitary("sports");
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.setDraftIntent(false);
      gameStore.clearFallbackAdmissions();
      seasonStore.resolvePendingAction("careerChoice");
    } else {
      gameStore.enlistMilitary("general");
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.setDraftIntent(false);
      gameStore.clearFallbackAdmissions();
      seasonStore.resolvePendingAction("careerChoice");
    }

    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <div class="modal">
    <div class="modal-header">
      <span class="chip">진로 결정</span>
      <h2>{isPrimaryChoice ? "W50 진로 신청" : "W51 최종 선택"}</h2>
    </div>

    {#if isPrimaryChoice}
      <p class="body-text">클릭 즉시 확정되지 않습니다. 체크 후 신청 완료를 눌러 다음 주로 진행하세요.</p>
      <div class="options">
        <button class="opt-btn" type="button" on:click={() => { if (confirm("드래프트 참가하시겠습니까?")) draftChecked = true; }}>
          <span class="opt-label">드래프트 참가 {draftChecked ? "✓" : ""}</span>
        </button>

        <button class="opt-btn" type="button" on:click={openUniversitySelect}>
          <span class="opt-label">대학 진학 신청 {universityChecked ? `✓ (${universityChoices.length}/3)` : ""}</span>
        </button>
        {#if universityChecked}
          <div class="opt-box">
            {#if universityChecked}
              <div class="list">
                {#each $masterStore.teams.filter((t) => t.leagueId === "LEAGUE_UNIVERSITY").slice(0, 8) as t}
                  <button class="small" type="button" on:click={() => (universityChoices = toggleChoice(universityChoices, t.id))}>{universityChoices.includes(t.id) ? "[✓]" : "[ ]"} {t.name}</button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <button class="opt-btn" type="button" on:click={openIndependentSelect}>
          <span class="opt-label">독립리그 신청 {independentChecked ? `✓ (${independentChoices.length}/3)` : ""}</span>
        </button>
        {#if independentChecked}
          <div class="opt-box">
            {#if independentChecked}
              <div class="list">
                {#each $masterStore.teams.filter((t) => t.leagueId === "LEAGUE_INDEPENDENT").slice(0, 8) as t}
                  <button class="small" type="button" on:click={() => (independentChoices = toggleChoice(independentChoices, t.id))}>{independentChoices.includes(t.id) ? "[✓]" : "[ ]"} {t.name}</button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <button class="opt-btn danger" type="button" on:click={chooseMilitaryNow}>
          <span class="opt-label">군입대 (즉시 확정)</span>
        </button>
      </div>
      <button class="submit" disabled={resolving || !(draftChecked || universityChecked || independentChecked)} on:click={submitApplications}>신청 완료</button>
    {:else if isResultChoice}
      <p class="body-text">합격/지명 결과에서 최종 경로 1개를 선택하세요.</p>
      <div class="options">
        {#if draftPassed}
          <button class="opt-btn" type="button" on:click={() => chooseResult("draft")}>
            <span class="opt-label">드래프트 지명: {teamName($gameStore.schoolState.fallbackDraftTeamId ?? "-")} / {$gameStore.schoolState.fallbackDraftRound}R {$gameStore.schoolState.fallbackDraftPick}P</span>
          </button>
        {/if}
        {#each univPassed as teamId}
          <button class="opt-btn" type="button" on:click={() => chooseResult("university", teamId)}>
            <span class="opt-label">대학 합격: {teamName(teamId)}</span>
          </button>
        {/each}
        {#each indiePassed as teamId}
          <button class="opt-btn" type="button" on:click={() => chooseResult("independent", teamId)}>
            <span class="opt-label">독립리그 합격: {teamName(teamId)}</span>
          </button>
        {/each}
        {#if sportsPassed}
          <button class="opt-btn" type="button" on:click={() => chooseResult("sports")}>
            <span class="opt-label">체육부대 입대</span>
          </button>
        {/if}
        {#if !draftPassed && univPassed.length === 0 && indiePassed.length === 0 && !sportsPassed}
          <button class="opt-btn danger" type="button" on:click={() => chooseResult("general")}>
            <span class="opt-label">전원 탈락: 현역 입대</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .modal { background: #0e1a30; border: 1px solid #3a5898; border-radius: 16px; padding: 24px; width: min(700px, 92vw); display: grid; gap: 14px; }
  .chip { font-size: 11px; color: #7a9ad0; }
  h2 { margin: 0; color: #e8f0ff; }
  .body-text { margin: 0; color: #a8c0e0; }
  .options { display: grid; gap: 8px; }
  .opt-box { border: 1px solid #2a4068; border-radius: 10px; padding: 10px; background: #0f1a2c; }
  .opt-btn { background: #111e38; border: 1px solid #2a4068; border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; display: block; width: 100%; }
  .opt-btn.danger { background: #3a1f1f; border-color: #804040; }
  .opt-label { color: #dceeff; font-weight: 600; }
  .list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
  .small { background: #0f1a2c; color: #bcd4f2; border: 1px solid #2a3d60; border-radius: 6px; padding: 6px; text-align: left; cursor: pointer; }
  .submit { background: #1e5aaa; color: #fff; border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
  .submit:disabled { opacity: 0.5; cursor: default; }
</style>
