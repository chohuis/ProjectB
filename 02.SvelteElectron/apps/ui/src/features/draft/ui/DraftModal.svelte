<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { calcDraftRank, type DraftRankResult } from "../../../shared/utils/draftEngine";

  let result: DraftRankResult | null = null;
  let resolving = false;

  $: weekInYear = (($seasonStore.currentWeek - 1 + 52) % 52) + 1;
  $: isHighschoolDraftFlow =
    $gameStore.protagonist.careerStage === "highschool" &&
    $gameStore.protagonist.grade === 3 &&
    weekInYear === 51;
  $: isUniversityDraftFlow =
    $gameStore.protagonist.careerStage === "university" &&
    weekInYear === 52;
  $: teamName = result?.teamId
    ? $masterStore.teams.find((t) => t.id === result!.teamId)?.name ?? result.teamId
    : null;

  $: if (result === null) {
    result = calcDraftRank($gameStore.protagonist.scoutScore);
  }

  function pickTopTeams(leagueId: string, count: number): string[] {
    return $masterStore.teams.filter((t) => t.leagueId === leagueId).slice(0, count).map((t) => t.id);
  }

  function evalUnivPass(ovr: number, avgPct: number, idx: number): boolean {
    const base = 38 + (avgPct * 0.35) + (ovr * 0.35) - idx * 8;
    return Math.random() * 100 < Math.max(10, Math.min(92, base));
  }

  function evalIndiePass(ovr: number, idx: number): boolean {
    const base = 45 + (ovr * 0.45) - idx * 6;
    return Math.random() * 100 < Math.max(15, Math.min(95, base));
  }

  function evalSportsMilitaryPass(ovr: number): boolean {
    const base = 18 + ovr * 0.55;
    return Math.random() * 100 < Math.max(5, Math.min(82, base));
  }

  async function finishAccept() {
    if (!result || !result.drafted || resolving) return;
    resolving = true;
    const offeredSalary = Math.max(3000, Math.round(($gameStore.protagonist.pitching.ovr - 45) * 220));
    seasonStore.resolvePendingAction("draft");
    seasonStore.pushPendingAction({
      type: "salaryNegotiation",
      teamId: result.teamId ?? $gameStore.protagonist.teamId,
      leagueId: "LEAGUE_KBL",
      offeredSalary,
      durationYears: 2,
      signingBonus: result.signingBonus,
    });
    gameStore.setDraftIntent(false);
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function processFailAndApply() {
    if (resolving) return;
    resolving = true;

    const p = $gameStore.protagonist;
    const subjects = Object.values($gameStore.schoolState.subjectScores);
    const avgPct = subjects.length ? subjects.reduce((a, s) => a + s.percentile, 0) / subjects.length : 50;

    const univChoices = pickTopTeams("LEAGUE_UNIVERSITY", 3);
    const indieChoices = pickTopTeams("LEAGUE_INDEPENDENT", 3);

    const univPassed = univChoices.filter((id, i) => evalUnivPass(p.pitching.ovr, avgPct, i));
    const indiePassed = indieChoices.filter((id, i) => evalIndiePass(p.pitching.ovr, i));
    const sportsPassed = evalSportsMilitaryPass(p.pitching.ovr);

    gameStore.setFallbackAdmissions({
      universityChoices: univChoices,
      independentChoices: indieChoices,
      universityPassed: univPassed,
      independentPassed: indiePassed,
      sportsMilitaryPassed: sportsPassed,
    });

    seasonStore.resolvePendingAction("draft");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function rejectDirect() {
    if (resolving) return;
    resolving = true;
    gameStore.applyDraftDecision({
      stage: "independent",
      leagueId: "LEAGUE_INDEPENDENT",
      teamId: pickTopTeams("LEAGUE_INDEPENDENT", 1)[0] ?? $gameStore.protagonist.teamId,
    });
    seasonStore.resolvePendingAction("draft");
    gameStore.setDraftIntent(false);
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function rejectToMilitary() {
    if (resolving) return;
    resolving = true;
    gameStore.enlistMilitary("general");
    seasonStore.resolvePendingAction("draft");
    gameStore.setDraftIntent(false);
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="badge">드래프트</p>
      <h2>프로 지명 결과</h2>
    </header>

    {#if result?.drafted}
      <div class="summary success">
        <p>{teamName ?? result.teamId} / {result.round}라운드 {result.pick}순위</p>
        <p>계약금 {result.signingBonus.toLocaleString()}만원</p>
      </div>
    {:else}
      <div class="summary fail">
        <p>이번 드래프트에서 지명되지 않았습니다.</p>
        {#if isHighschoolDraftFlow}
          <p>다음 단계: W52에 대학/독립리그/체육부대 지원 결과를 확인합니다.</p>
        {:else if isUniversityDraftFlow}
          <p>대학 졸업 시점입니다. 독립리그 진입 또는 군입대를 선택하세요.</p>
        {/if}
      </div>
    {/if}

    <div class="actions">
      {#if result?.drafted}
        <button disabled={resolving} on:click={finishAccept}>수락</button>
      {:else if isHighschoolDraftFlow}
        <button disabled={resolving} on:click={processFailAndApply}>W52 지원 결과 보기</button>
      {:else if isUniversityDraftFlow}
        <button disabled={resolving} on:click={rejectDirect}>독립리그 진입</button>
        <button disabled={resolving} on:click={rejectToMilitary}>군입대</button>
      {:else}
        <button disabled={resolving} on:click={rejectDirect}>독립리그 진입</button>
      {/if}
    </div>
  </section>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .modal {
    width: min(560px, 92vw);
    background: #101a2f;
    border: 1px solid #375483;
    border-radius: 14px;
    padding: 24px;
    display: grid;
    gap: 16px;
  }
  .badge {
    margin: 0;
    font-size: 12px;
    color: #8eb4e8;
  }
  h2 {
    margin: 4px 0 0;
    color: #f0f6ff;
  }
  .summary {
    border-radius: 10px;
    padding: 14px;
    display: grid;
    gap: 6px;
  }
  .summary p {
    margin: 0;
    color: #d3e6ff;
  }
  .summary.success {
    background: #17355a;
    border: 1px solid #3c6aa2;
  }
  .summary.fail {
    background: #3a1d1d;
    border: 1px solid #7e3a3a;
  }
  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  button {
    border: 1px solid #3d5f94;
    background: #1a2b49;
    color: #e7f1ff;
    border-radius: 8px;
    padding: 9px 14px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
