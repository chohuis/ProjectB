<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import type { PendingAction } from "../../../shared/types/season";
  import type { PitcherSeasonStats, BatterSeasonStats, ProContract } from "../../../shared/types/save";
  import { generateKblSchedule, generateAblSchedule, generateJblSchedule } from "../../../shared/utils/scheduleGen";
  import { calcMarketSalary, calcSeasonRating } from "../../../shared/utils/salaryEngine";
  import { isFaEligible } from "../../../shared/utils/faEngine";

  export let action: Extract<PendingAction, { type: "salaryNegotiation" }>;

  const CONTEXT_LABEL: Record<string, string> = {
    initial:         "입단 계약 협상",
    renewal:         "계약 갱신 협상",
    military_return: "복귀 계약 협상",
  };

  let salaryRatio = 0;
  let selectedDuration = action.durationYears;
  let noTrade = false;
  let teamOptionYears = 0;
  let playerOptionYears = 0;
  let resolving = false;

  $: requestedSalary = Math.round(action.offeredSalary * (1 + salaryRatio) / 100) * 100;
  $: teamName = $masterStore.teams.find((t) => t.id === action.teamId)?.name ?? action.teamId;
  $: totalValue = requestedSalary * selectedDuration + action.signingBonus;

  // 허용 임계값: 옵션 조합에 따라 조정
  $: acceptThreshold = (() => {
    let base = action.offeredSalary * 1.15;
    const durDiff = selectedDuration - action.durationYears;
    base *= (1 + durDiff * 0.03);
    if (noTrade)               base *= 0.95;
    if (teamOptionYears === 1) base *= 1.05;
    if (teamOptionYears === 2) base *= 1.10;
    if (playerOptionYears === 1) base *= 0.97;
    if (playerOptionYears === 2) base *= 0.94;
    return Math.round(base);
  })();

  $: acceptProb = (() => {
    if (requestedSalary <= acceptThreshold) return Math.min(95, 95);
    const over = (requestedSalary - acceptThreshold) / acceptThreshold;
    return Math.max(0, Math.round(95 - over * 400));
  })();

  $: canCounter = requestedSalary <= acceptThreshold;

  // 시즌 성적
  $: myStats = ($seasonStore.stats[$gameStore.protagonist.id] ?? null);
  $: isPitcher = $gameStore.protagonist.playerType === "pitcher";
  $: pitcherStats = isPitcher ? (myStats as PitcherSeasonStats | null) : null;
  $: batterStats  = !isPitcher ? (myStats as BatterSeasonStats | null) : null;

  let seasonRating = 50;
  let marketSalary = 0;
  $: calcSeasonRating(pitcherStats ?? batterStats).then((r) => (seasonRating = r));
  $: calcMarketSalary(
    isPitcher ? $gameStore.protagonist.pitching?.ovr ?? 50 : $gameStore.protagonist.batting?.ovr ?? 50,
    $gameStore.protagonist.fame,
    action.leagueId,
  ).then((r) => (marketSalary = r));

  $: marketRatioPct = marketSalary > 0 ? Math.round((requestedSalary / marketSalary) * 100) : 100;

  function formatSalary(v: number): string {
    if (v >= 10000) return `${(v / 10000).toFixed(1)}억`;
    return `${v.toLocaleString()}만`;
  }

  $: isImmediate = action.context === "military_return" || action.context === "initial";

  async function doSign(contract: ProContract) {
    if (isImmediate) {
      gameStore.signContract(contract);
      const proTeamIds = $masterStore.teams.filter((t) => t.leagueId === action.leagueId).map((t) => t.id);
      const seasonYear = ($seasonStore.seasonYear || 2026) + 1;
      const isAbl = action.leagueId === "LEAGUE_ABL";
      const isJbl = action.leagueId === "LEAGUE_JBL";
      seasonStore.initSeason(action.leagueId, seasonYear, 52, proTeamIds);
      seasonStore.setSchedule(
        isAbl ? await generateAblSchedule(proTeamIds, contract.teamId) :
        isJbl ? await generateJblSchedule(proTeamIds, contract.teamId) :
                await generateKblSchedule(proTeamIds, contract.teamId),
      );
    } else {
      gameStore.setPendingNextContract(contract);
      gameStore.addMessage({
        id: `msg-contract-signed-${Date.now()}`,
        category: "system", sender: "에이전트",
        subject: "계약 서명 완료",
        preview: `${teamName}와 계약이 완료되었습니다. W52 새 시즌부터 적용됩니다.`,
        body: [
          `${teamName}와의 계약이 완료되었습니다.`,
          `연봉: ${formatSalary(contract.salary)}원 / ${contract.durationYears}년`,
          `계약금: ${formatSalary(contract.signingBonus)}원`,
          ``,
          `W52 새 시즌 시작 시 정식 적용됩니다.`,
        ].join("\n"),
        createdAt: `W${$seasonStore.currentWeek}`, readAt: null,
      });
    }
    seasonStore.resolvePendingAction("salaryNegotiation");
    await gameStore.save();
    await seasonStore.save();
  }

  async function accept() {
    if (resolving) return;
    resolving = true;
    await doSign({
      teamId: action.teamId,
      leagueId: action.leagueId,
      salary: action.offeredSalary,
      durationYears: action.durationYears,
      remainingYears: action.durationYears,
      signingBonus: action.signingBonus,
      teamOptionYears,
      playerOptionYears,
      noTrade,
      status: "active",
    });
    resolving = false;
  }

  async function counter() {
    if (resolving || !canCounter) return;
    resolving = true;
    await doSign({
      teamId: action.teamId,
      leagueId: action.leagueId,
      salary: requestedSalary,
      durationYears: selectedDuration,
      remainingYears: selectedDuration,
      signingBonus: action.signingBonus,
      teamOptionYears,
      playerOptionYears,
      noTrade,
      status: "active",
    });
    resolving = false;
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

  const durationRange = Array.from(
    { length: action.maxDurationYears - action.minDurationYears + 1 },
    (_, i) => i + action.minDurationYears,
  );
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="badge">{CONTEXT_LABEL[action.context] ?? "계약 협상"}</p>
      <h2>{teamName}</h2>
    </header>

    <!-- 제시 vs 요청 비교 -->
    <div class="compare-grid">
      <div class="compare-col">
        <p class="col-label">팀 제시</p>
        <p class="col-val">{formatSalary(action.offeredSalary)}원</p>
        <p class="col-sub">{action.durationYears}년 · 계약금 {formatSalary(action.signingBonus)}원</p>
      </div>
      <div class="arrow">→</div>
      <div class="compare-col right">
        <p class="col-label">내 요청</p>
        <p class="col-val">{formatSalary(requestedSalary)}원</p>
        <p class="col-sub">{selectedDuration}년 · 총액 {formatSalary(totalValue)}원</p>
      </div>
    </div>

    <!-- 시장가 게이지 -->
    <div class="gauge-row">
      <span class="gauge-label">시장가 대비</span>
      <div class="gauge-track">
        <div class="gauge-fill" style="width:{Math.min(100, marketRatioPct)}%"
          class:over={marketRatioPct > 100}></div>
      </div>
      <span class="gauge-pct" class:over={marketRatioPct > 110}>{marketRatioPct}%</span>
    </div>

    <!-- 연봉 슬라이더 -->
    <div class="section">
      <p class="section-title">연봉 협상 <span class="muted">(±20%)</span></p>
      <input class="slider" type="range" min="-0.2" max="0.2" step="0.01" bind:value={salaryRatio} />
      <div class="range-labels">
        <span>{formatSalary(action.offeredSalary * 0.8)}원</span>
        <span class="center-label">{formatSalary(requestedSalary)}원</span>
        <span>{formatSalary(action.offeredSalary * 1.2)}원</span>
      </div>
    </div>

    <!-- 계약 기간 -->
    {#if durationRange.length > 1}
    <div class="section">
      <p class="section-title">계약 기간</p>
      <div class="dur-btns">
        {#each durationRange as yr}
          <button class="dur-btn" class:active={selectedDuration === yr}
            on:click={() => (selectedDuration = yr)}>{yr}년</button>
        {/each}
      </div>
    </div>
    {/if}

    <!-- 계약 옵션 -->
    <div class="section">
      <p class="section-title">계약 옵션</p>
      <label class="opt-row">
        <input type="checkbox" bind:checked={noTrade} />
        <span>트레이드 거부권</span>
        <span class="opt-effect">허용치 -5%</span>
      </label>
      <div class="opt-row">
        <span>팀 옵션</span>
        <div class="opt-btns">
          {#each [0, 1, 2] as y}
            <button class="opt-btn" class:active={teamOptionYears === y}
              on:click={() => (teamOptionYears = y)}>{y === 0 ? "없음" : `${y}년`}</button>
          {/each}
        </div>
        {#if teamOptionYears > 0}
          <span class="opt-effect pos">허용치 +{teamOptionYears * 5}%</span>
        {/if}
      </div>
      <div class="opt-row">
        <span>선수 옵션</span>
        <div class="opt-btns">
          {#each [0, 1, 2] as y}
            <button class="opt-btn" class:active={playerOptionYears === y}
              on:click={() => (playerOptionYears = y)}>{y === 0 ? "없음" : `${y}년`}</button>
          {/each}
        </div>
        {#if playerOptionYears > 0}
          <span class="opt-effect neg">허용치 -{playerOptionYears * 3}%</span>
        {/if}
      </div>
    </div>

    <!-- 수락 가능성 -->
    <div class="prob-section">
      <div class="prob-row">
        <span class="prob-label">팀 수락 가능성</span>
        <div class="prob-track">
          <div class="prob-fill" class:low={acceptProb < 50} style="width:{acceptProb}%"></div>
        </div>
        <span class="prob-num" class:low={acceptProb < 50}>{acceptProb}%</span>
      </div>
      {#if acceptProb < 60}
        <p class="warn">역제안이 허용 범위를 초과합니다. 조건을 낮추세요.</p>
      {/if}
    </div>

    <!-- 성적 요약 -->
    <div class="stats-row">
      {#if isPitcher}
        <span>ERA {pitcherStats?.era?.toFixed(2) ?? "-"}</span>
        <span>WHIP {pitcherStats?.whip?.toFixed(2) ?? "-"}</span>
        <span>K {pitcherStats?.k ?? "-"}</span>
      {:else}
        <span>AVG {batterStats?.avg?.toFixed(3) ?? "-"}</span>
        <span>HR {batterStats?.hr ?? "-"}</span>
        <span>OPS {batterStats?.ops?.toFixed(3) ?? "-"}</span>
      {/if}
      <span class="muted">시즌 평점 {seasonRating}</span>
      <span class="muted">시장가 {formatSalary(marketSalary)}원</span>
    </div>

    <div class="actions">
      <button class="btn-accept" disabled={resolving} on:click={accept}>수락 (팀 제시 그대로)</button>
      <button class="btn-counter" disabled={resolving || !canCounter} on:click={counter}>역제안</button>
      <button class="btn-reject" disabled={resolving} on:click={reject}>거부 (FA)</button>
    </div>
  </section>
</div>

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.75); display:flex; align-items:center; justify-content:center; z-index:220; }
  .modal { width:min(640px,94vw); background:#0e1928; border:1px solid #35568a; border-radius:16px; padding:24px; display:grid; gap:16px; max-height:92vh; overflow-y:auto; }

  .badge { margin:0; font-size:11px; color:#7aabdd; letter-spacing:.05em; }
  h2 { margin:3px 0 0; color:#eef6ff; font-size:19px; }

  .compare-grid { display:grid; grid-template-columns:1fr 24px 1fr; align-items:center; gap:8px; background:#091422; border:1px solid #2a4268; border-radius:12px; padding:14px; }
  .compare-col { display:grid; gap:3px; }
  .compare-col.right { text-align:right; }
  .col-label { margin:0; font-size:10px; color:#567aaa; text-transform:uppercase; }
  .col-val { margin:0; font-size:16px; color:#d8eaff; font-weight:700; }
  .col-sub { margin:0; font-size:11px; color:#7a9abd; }
  .arrow { text-align:center; color:#3a5a8a; font-size:16px; }

  .gauge-row { display:flex; align-items:center; gap:10px; }
  .gauge-label { font-size:12px; color:#7a9abd; white-space:nowrap; }
  .gauge-track { flex:1; height:6px; background:#152040; border-radius:3px; overflow:hidden; }
  .gauge-fill { height:100%; background:#3a78c8; border-radius:3px; transition:width .2s; }
  .gauge-fill.over { background:#c84848; }
  .gauge-pct { font-size:12px; color:#8aabda; white-space:nowrap; }
  .gauge-pct.over { color:#f07070; }

  .section { display:grid; gap:8px; }
  .section-title { margin:0; font-size:12px; color:#7a9abd; font-weight:600; }
  .muted { color:#4a6a8a; font-weight:400; }

  .slider { width:100%; accent-color:#3a78c8; }
  .range-labels { display:flex; justify-content:space-between; font-size:11px; color:#567aaa; }
  .center-label { color:#d8eaff; font-weight:600; }

  .dur-btns { display:flex; gap:6px; }
  .dur-btn { border:1px solid #2d4d7a; background:#0a1828; color:#8aabda; border-radius:8px; padding:6px 14px; cursor:pointer; font-size:13px; }
  .dur-btn.active { background:#1a3d7a; border-color:#4a7ac8; color:#d8f0ff; }

  .opt-row { display:flex; align-items:center; gap:10px; font-size:13px; color:#c0d8f0; }
  .opt-row label { display:flex; align-items:center; gap:6px; }
  .opt-btns { display:flex; gap:4px; }
  .opt-btn { border:1px solid #2d4d7a; background:#0a1828; color:#8aabda; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; }
  .opt-btn.active { background:#1a3d7a; border-color:#4a7ac8; color:#d8f0ff; }
  .opt-effect { font-size:11px; margin-left:auto; }
  .opt-effect.pos { color:#6ad08a; }
  .opt-effect.neg { color:#f07070; }

  .prob-section { display:grid; gap:6px; }
  .prob-row { display:flex; align-items:center; gap:10px; }
  .prob-label { font-size:12px; color:#7a9abd; white-space:nowrap; }
  .prob-track { flex:1; height:8px; background:#152040; border-radius:4px; overflow:hidden; }
  .prob-fill { height:100%; background:#3aaa6a; border-radius:4px; transition:width .25s; }
  .prob-fill.low { background:#c84848; }
  .prob-num { font-size:13px; color:#6ad08a; font-weight:600; white-space:nowrap; }
  .prob-num.low { color:#f07070; }
  .warn { margin:0; font-size:12px; color:#f0b060; background:#231800; border-radius:6px; padding:6px 10px; }

  .stats-row { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:#8aabda; background:#091422; border-radius:8px; padding:10px 12px; }

  .actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .btn-accept  { background:#1a3d7a; color:#d8f0ff; border:1px solid #3868c0; border-radius:9px; padding:9px 14px; cursor:pointer; font-size:13px; }
  .btn-counter { background:#1a3020; color:#80e0a0; border:1px solid #306050; border-radius:9px; padding:9px 14px; cursor:pointer; font-size:13px; }
  .btn-reject  { background:#2a1010; color:#f09090; border:1px solid #6a2020; border-radius:9px; padding:9px 14px; cursor:pointer; font-size:13px; }
  button:disabled { opacity:.5; cursor:default; }
  .btn-accept:not(:disabled):hover  { background:#214a92; }
  .btn-counter:not(:disabled):hover { background:#1f3a28; }
  .btn-reject:not(:disabled):hover  { background:#341414; }
</style>
