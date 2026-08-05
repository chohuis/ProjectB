<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";
  import { chooseDraft, chooseSchoolOrIndependent, continueCurrentStage } from "../../../shared/usecases/careerDecision";
  import { enlistProtagonist } from "../../../shared/usecases/militaryDecision";
  import { canApplyToUniversity, canApplyToIndependent, universityGradeOf, isUniversityFinalYear } from "../../../shared/utils/careerTransition";

  let resolving = false;

  $: results = $gameStore.schoolState.careerResults;
  // 학적 역행 방어 — 지원 단계에서 막지만 구 세이브에 남은 결과가 있을 수 있다.
  // 대학 재학생에게 "대학 합격" 버튼이 뜨면 누르는 순간 두 번 입학이 된다.
  $: stage = $gameStore.protagonist.careerStage;
  $: univPassed = canApplyToUniversity(stage) ? (results?.universityPassed ?? []) : [];
  $: indiePassed = canApplyToIndependent(stage) ? (results?.independentPassed ?? []) : [];
  $: draftPassed = results?.draftDrafted ?? false;

  // 대학 재학 중 여부 및 학년 — 판정은 `careerTransition`이 정본이다.
  // 예전엔 여기서 `universityWeek / 52`로 따로 계산해 `protagonist.grade`와
  // 정본이 둘이었다 (그리고 grade는 대학 진학 시 지워지고 있었다).
  $: isUniversity = $gameStore.protagonist.careerStage === "university";
  $: univGrade = universityGradeOf($gameStore.protagonist.grade, $gameStore.schoolState.universityWeek);
  $: isFinalYear = isUniversity && isUniversityFinalYear($gameStore.protagonist.grade, $gameStore.schoolState.universityWeek);
  $: canContinue = isUniversity && !isFinalYear && !draftPassed;

  // 독립리그 계속 여부
  $: isIndependent = $gameStore.protagonist.careerStage === "independent";
  $: canContinueIndie = isIndependent && !draftPassed;

  function teamName(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  // 이름은 "University"지만 독립리그 "계속"도 같은 버튼을 쓴다
  async function continueUniversity() {
    if (resolving) return;
    resolving = true;
    await continueCurrentStage();
    resolving = false;
  }

  async function chooseResult(kind: "draft" | "university" | "independent" | "sports" | "general", teamId?: string) {
    if (resolving) return;
    resolving = true;

    if (kind === "draft") {
      await chooseDraft();
    } else if ((kind === "university" || kind === "independent") && teamId) {
      await chooseSchoolOrIndependent(kind, teamId);
    } else {
      // 전원 탈락: 현역 입대 (고3 강제 케이스).
      // ⚠ 입대 처리는 `militaryDecision`이 정본이다 — 예전엔 여기서
      // `processAllLeaguesSeasonEnd`를 빠뜨려 **그해 NPC 오프시즌이 통째로
      // 안 돌았다** (나이·은퇴·FA·드래프트 배정 전부).
      await enlistProtagonist("general");
      gameStore.setCareerApplicationsSubmitted(false);
      gameStore.clearCareerResults();
      gameStore.setCareerFinalChoice("general");
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
      <h2>W47 최종 선택</h2>
    </div>

    <p class="body-text">합격/지명 결과에서 최종 경로 1개를 선택하세요.</p>
    <div class="options">
      {#if canContinue}
        <button class="opt-btn continue" type="button" on:click={continueUniversity}>
          <span class="opt-label">다음 학년 진급 ({univGrade + 1}학년)</span>
          <span class="opt-sub">드래프트 미지명 — 대학 계속</span>
        </button>
      {/if}
      {#if canContinueIndie}
        <button class="opt-btn continue" type="button" on:click={continueUniversity}>
          <span class="opt-label">독립리그 계속</span>
          <span class="opt-sub">드래프트 미지명 — 독립리그 시즌 계속</span>
        </button>
      {/if}
      {#if draftPassed}
        <button class="opt-btn" type="button" on:click={() => chooseResult("draft")}>
          <span class="opt-label">드래프트 지명: {teamName(results?.draftTeamId ?? "-")} / {results?.draftRound}R {results?.draftPick}P</span>
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
      {#if !draftPassed && univPassed.length === 0 && indiePassed.length === 0}
        <button class="opt-btn danger" type="button" on:click={() => chooseResult("general")}>
          <span class="opt-label">전원 탈락: 현역 입대</span>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 200; }
  /* U5 안전망 — 전역이 밝아져 색 없는 자식(.opt-btn 등)이 안 보인다 */
  .modal { background: #0e1a30; border: 1px solid #3a5898; border-radius: 16px; padding: 24px; width: min(700px, 92vw); display: grid; color: #E4EDFF; gap: 14px; }
  .chip { font-size: 11px; color: #7a9ad0; }
  h2 { margin: 0; color: #e8f0ff; }
  .body-text { margin: 0; color: #a8c0e0; }
  .options { display: grid; gap: 8px; }
  .opt-btn { background: #111e38; border: 1px solid #2a4068; border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; display: grid; width: 100%; gap: 2px; }
  .opt-btn.danger { background: #3a1f1f; border-color: #804040; }
  .opt-btn.continue { background: #0e2818; border-color: #2a6040; }
  .opt-label { color: #dceeff; font-weight: 600; }
  .opt-sub { color: #6a9080; font-size: 11px; }
</style>
