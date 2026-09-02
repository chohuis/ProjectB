<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
  import { chooseDraft, chooseSchoolOrIndependent, continueCurrentStage } from "../../../shared/usecases/careerDecision";
  import { enlistProtagonist } from "../../../shared/usecases/militaryDecision";
  import { canApplyToUniversity, canApplyToIndependent, universityGradeOf, isUniversityFinalYear } from "../../../shared/utils/careerTransition";
  import { firstTeamIdOf } from "../../../shared/utils/ids";
  import { ALL_TEAMS_BY_LEAGUE } from "../../../shared/utils/leagueScheduler";

  let resolving = false;

  $: results = $gameStore.schoolState.careerResults;
  // 학적 역행 방어 — 지원 단계에서 막지만 구 세이브에 남은 결과가 있을 수 있다.
  // 대학 재학생에게 "대학 합격" 버튼이 뜨면 누르는 순간 두 번 입학이 된다.
  $: stage = $gameStore.protagonist.careerStage;
  $: univPassed = canApplyToUniversity(stage) ? (results?.universityPassed ?? []) : [];
  $: indiePassed = canApplyToIndependent(stage) ? (results?.independentPassed ?? []) : [];
  // 해외 2군 직행 (실플 ②) — 무대 게이트가 없다. 고교·대학·독립 다 여기로 온다
  $: overseasPassed = results?.overseasPassed ?? [];
  $: draftPassed = results?.draftDrafted ?? false;
  /**
   * 해외 2군 제안은 **28팀까지** 온다(§0.45 · OVR 84 면 전부). 이름만 28줄이면 못 고른다 —
   * 리그(ABL/JBL)·부모 1군 전력★을 같이 적고, 리그 → ★ 순으로 세운다. 목록은 스크롤.
   */
  // ⚠ refs 의 2군 팀은 `leagueId` 가 1군 리그다(tier "마이너") — 소속은 판정과 같은 출처(ALL_TEAMS_BY_LEAGUE)로 본다
  const farmLeagueOf = (teamId: string): string | undefined =>
    (["LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"] as const).find((lid) => (ALL_TEAMS_BY_LEAGUE[lid] ?? []).includes(teamId));
  const leagueLabel = (id: string | undefined) =>
    id === "LEAGUE_ABL_FARM" ? "ABL 2군" : id === "LEAGUE_JBL_FARM" ? "JBL 2군" : "";
  $: overseasRows = overseasPassed
    .map((id) => {
      const t = $teamsL10n.find((x) => x.id === id);
      const parent = firstTeamIdOf(id);
      const power = Math.max(0, Math.min(5, Math.round((parent ? $teamsL10n.find((x) => x.id === parent)?.power : undefined) ?? 0)));
      return { id, name: t?.name ?? id, league: leagueLabel(farmLeagueOf(id)), power, stars: "★".repeat(power) + "☆".repeat(5 - power) };
    })
    .sort((a, b) => a.league.localeCompare(b.league) || b.power - a.power || a.name.localeCompare(b.name, "ko"));

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
    return $teamsL10n.find((t) => t.id === teamId)?.name ?? teamId;
  }

  // 이름은 "University"지만 독립리그 "계속"도 같은 버튼을 쓴다
  async function continueUniversity() {
    if (resolving) return;
    resolving = true;
    await continueCurrentStage();
    resolving = false;
  }

  async function chooseResult(kind: "draft" | "university" | "independent" | "overseas" | "sports" | "general", teamId?: string) {
    if (resolving) return;
    resolving = true;

    if (kind === "draft") {
      await chooseDraft();
    } else if ((kind === "university" || kind === "independent" || kind === "overseas") && teamId) {
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
      <!-- 해외 2군 제안 — 계약은 `salaryNegotiation`이 이어받는다(독립과 같은 흐름) -->
      {#if overseasRows.length > 0}
        <div class="overseas">
          <p class="overseas-head">해외 2군 제안 <strong>{overseasRows.length}팀</strong> <small>· 리그 → 1군 전력★ 순</small></p>
          <div class="overseas-list">
            {#each overseasRows as row (row.id)}
              {@const teamId = row.id}
              <button class="opt-btn overseas-btn" type="button" on:click={() => chooseResult("overseas", teamId)}>
                <span class="opt-label">{row.name}</span>
                <span class="opt-meta">{row.league} · 1군 {row.stars}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
      <!-- ⚠ **병역을 이미 마친 사람에게 입대를 권하지 않는다.**
           예전엔 조건이 "아무 데도 안 됐다"뿐이라, **군필자가 독립리그에서
           갈 곳이 없으면 이 버튼이 또 떴다.** 60회 조사에서 한 커리어가
           군 복무를 **세 번** 하는 경로가 나왔다.
           군필·면제·현역에게는 위의 "독립리그 계속"이 남는다. -->
      {#if !draftPassed && univPassed.length === 0 && indiePassed.length === 0
           && $gameStore.protagonist.militaryStatus === "미필"}
        <button class="opt-btn danger" type="button" on:click={() => chooseResult("general")}>
          <span class="opt-label">전원 탈락: 현역 입대</span>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display: flex; align-items: center; justify-content: center; z-index: 200; }
  /* U5 안전망 — 전역이 밝아져 색 없는 자식(.opt-btn 등)이 안 보인다 */
  .modal { background: var(--panel); border: 1px solid var(--ink-mute); border-radius: 16px; padding: 24px; width: min(700px, 92vw); max-height: 90vh; overflow-y: auto; display: grid; color: var(--ink); gap: 14px; }
  .overseas { border: 1px solid var(--line); border-radius: 10px; padding: 10px; display: grid; gap: 8px; }
  .overseas-head { margin: 0; font-size: 13px; color: var(--ink-mid); }
  .overseas-head strong { color: var(--ink); }
  .overseas-head small { color: var(--ink-mute); }
  /* 28줄이 와도 모달이 화면을 넘지 않는다 */
  .overseas-list { max-height: 38vh; overflow-y: auto; display: grid; gap: 6px; padding-right: 4px; }
  .overseas-btn { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .opt-meta { color: var(--ink-mute); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .chip { font-size: 11px; color: var(--ink-mid); }
  h2 { margin: 0; color: var(--ink); }
  .body-text { margin: 0; color: var(--ink); }
  .options { display: grid; gap: 8px; }
  .opt-btn { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; display: grid; width: 100%; gap: 2px; }
  .opt-btn.danger { background: rgba(179, 49, 31, 0.09); border-color: var(--bad); }
  .opt-btn.continue { background: rgba(31, 122, 71, 0.10); border-color: var(--ok); }
  .opt-label { color: var(--ink); font-weight: 600; }
  .opt-sub { color: var(--ok); font-size: 11px; }
</style>
