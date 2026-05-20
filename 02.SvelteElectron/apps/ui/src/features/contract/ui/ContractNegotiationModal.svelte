<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import type { PendingAction } from "../../../shared/types/season";
  import type { PitcherSeasonStats, ProContract } from "../../../shared/types/save";
  import { generateKblSchedule, generateAblSchedule } from "../../../shared/utils/scheduleGen";
  import { shuffleAblConferences } from "../../../shared/utils/postseasonEngine";
  import { calcMarketSalary, calcSeasonRating } from "../../../shared/utils/salaryEngine";
  import { isFaEligible } from "../../../shared/utils/faEngine";

  export let action: Extract<PendingAction, { type: "salaryNegotiation" }>;

  let salaryRatio = 0;
  let noTrade = false;
  let teamOptionYears = 0;
  let playerOptionYears = 0;
  let resolving = false;

  $: requestedSalary = Math.round(action.offeredSalary * (1 + salaryRatio));
  $: teamName = $masterStore.teams.find((t) => t.id === action.teamId)?.name ?? action.teamId;
  $: acceptThreshold = Math.round(action.offeredSalary * 1.15);
  $: acceptedByTeam = requestedSalary <= acceptThreshold;
  $: myPitcherStats = (($seasonStore.stats[$gameStore.protagonist.id] ?? null) as PitcherSeasonStats | null);
  let seasonRating = 50;
  let marketSalary = 0;
  $: calcSeasonRating(myPitcherStats).then((r) => (seasonRating = r));
  $: calcMarketSalary(
    $gameStore.protagonist.pitching.ovr,
    $gameStore.protagonist.fame,
    action.leagueId,
  ).then((r) => (marketSalary = r));

  async function accept() {
    if (resolving) return;
    resolving = true;
    const contract: ProContract = {
      teamId: action.teamId,
      leagueId: action.leagueId,
      salary: requestedSalary,
      durationYears: action.durationYears,
      remainingYears: action.durationYears,
      signingBonus: action.signingBonus,
      teamOptionYears,
      playerOptionYears,
      noTrade,
      status: "active",
    };
    gameStore.signContract(contract, $masterStore.contactDefs);
    const proTeamIds = $masterStore.teams
      .filter((t) => t.leagueId === action.leagueId)
      .map((t) => t.id);
    const seasonYear = ($seasonStore.seasonYear || 2026) + 1;
    const isAbl = action.leagueId === "LEAGUE_ABL";
    const totalWeeks = isAbl ? 33 : 30;
    seasonStore.initSeason(action.leagueId, seasonYear, totalWeeks, proTeamIds);
    seasonStore.setSchedule(
      isAbl
        ? await generateAblSchedule(proTeamIds, contract.teamId)
        : await generateKblSchedule(proTeamIds, contract.teamId),
    );
    if (isAbl) {
      const { east, west } = await shuffleAblConferences(proTeamIds);
      seasonStore.setAblConferences(east, west);
    }
    seasonStore.resolvePendingAction("salaryNegotiation");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function counter() {
    if (resolving) return;
    if (!acceptedByTeam) return;
    await accept();
  }

  async function reject() {
    if (resolving) return;
    resolving = true;
    seasonStore.resolvePendingAction("salaryNegotiation");
    if (isFaEligible($gameStore.protagonist, $gameStore.schoolState.attendsUniversity)) {
      seasonStore.pushPendingAction({ type: "faMarket" });
    }
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="badge">입단 계약 협상</p>
      <h2>{teamName}</h2>
    </header>

    <div class="summary">
      <p>제시 연봉: {action.offeredSalary.toLocaleString()}만원</p>
      <p>요청 연봉: {requestedSalary.toLocaleString()}만원</p>
      <p>기간/계약금: {action.durationYears}년 / {action.signingBonus.toLocaleString()}만원</p>
      <p>시즌 평점: {seasonRating} / 시장가: {marketSalary.toLocaleString()}만원</p>
      <p>
        시즌 성적:
        ERA {myPitcherStats?.era?.toFixed(2) ?? "-"} /
        WHIP {myPitcherStats?.whip?.toFixed(2) ?? "-"} /
        K {myPitcherStats?.k ?? "-"}
      </p>
    </div>

    <label class="row">
      역제안 (±20%)
      <input type="range" min="-0.2" max="0.2" step="0.01" bind:value={salaryRatio} />
    </label>

    <div class="row toggles">
      <label><input type="checkbox" bind:checked={noTrade} /> 트레이드 거부권</label>
      <label><input type="checkbox" checked={teamOptionYears === 1} on:change={() => teamOptionYears = teamOptionYears === 1 ? 0 : 1} /> 팀 옵션 1년</label>
      <label><input type="checkbox" checked={playerOptionYears === 1} on:change={() => playerOptionYears = playerOptionYears === 1 ? 0 : 1} /> 선수 옵션 1년</label>
    </div>

    {#if !acceptedByTeam}
      <p class="warn">역제안이 높아 구단이 거절할 확률이 높습니다. (허용 상한 약 +15%)</p>
    {/if}

    <div class="actions">
      <button disabled={resolving} on:click={accept}>수락</button>
      <button disabled={resolving || !acceptedByTeam} on:click={counter}>역제안 제출</button>
      <button disabled={resolving} on:click={reject}>거부 (FA)</button>
    </div>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; z-index:220; }
  .modal { width:min(620px,94vw); background:#101a2f; border:1px solid #39578a; border-radius:14px; padding:24px; display:grid; gap:14px; }
  .badge { margin:0; font-size:12px; color:#9bbcec; }
  h2 { margin:2px 0 0; color:#f0f6ff; }
  .summary { background:#162846; border:1px solid #335b95; border-radius:10px; padding:12px; display:grid; gap:4px; }
  .summary p { margin:0; color:#d7e8ff; }
  .row { display:grid; gap:8px; color:#d4e3ff; font-size:13px; }
  .toggles { display:flex; gap:12px; flex-wrap:wrap; }
  .warn { margin:0; color:#f0c78a; font-size:12px; }
  .actions { display:flex; gap:10px; justify-content:flex-end; }
  button { border:1px solid #40639a; background:#1a2d4d; color:#e8f2ff; border-radius:8px; padding:9px 14px; cursor:pointer; }
  button:disabled { opacity:.55; cursor:default; }
</style>
