<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import {
    isImmediateContract, signNegotiatedContract, rejectNegotiatedContract,
  } from "../../../shared/usecases/contractDecision";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import type { PendingAction } from "../../../shared/types/season";
  import type { PitcherSeasonStats, BatterSeasonStats, ProContract } from "../../../shared/types/save";
  import { generateKblSchedule, generateAblSchedule, generateJblSchedule } from "../../../shared/utils/scheduleGen";
  import { calcMarketSalary, calcSeasonRating } from "../../../shared/utils/salaryEngine";
  import { isFaEligible } from "../../../shared/utils/faEngine";
  import { relationEffects } from "../../../shared/usecases/relationships";
  import { staffModsOf } from "../../../shared/utils/staffEffects";
  import { onMount } from "svelte";

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

  // ── 구단주 관계 · 예산 (§7-5 F-4 / 7-4 이월) ──────────────────
  //
  // 7-4는 구단주 관계를 **방출 우선순위**에만 썼다. 나를 안 좋아하는 구단주가
  // 자르기만 하고 계약엔 아무 영향이 없으면 그 축이 절반만 사는 셈이다.
  // 여기서 재계약 쪽 소비처가 생긴다.
  //
  // 두 입력이 다른 축이라는 게 요점이다:
  //   구단주 **관계**  — 나를 어떻게 보는가 (내가 쌓은 것)
  //   구단주 **예산**  — 지갑을 여는 사람인가 (팀이 원래 가진 것)
  // 관계가 좋아도 궁핍한 구단은 못 준다.
  let ownerLabel = "중립";
  let ownerBonus = 0;
  $: budgetMod = staffModsOf($gameStore.protagonist.teamId ?? "", $masterStore.entities).budget;

  onMount(async () => {
    const slotId = $gameStore.currentSlotId;
    if (!slotId) return;
    try {
      const eff = await relationEffects({ slotId, teamId: action.teamId });
      ownerLabel = eff.ownerLabel;
      ownerBonus = eff.contractBonus;
    } catch {
      // 관계를 못 읽으면 중립으로 간다 — 보정 없음이 임의 보정보다 낫다
    }
  });

  /** 구단주가 실제로 낼 수 있는 금액. 관계 × 예산 */
  $: ownerMult = (1 + ownerBonus) * budgetMod;
  $: effectiveOffer = Math.round((action.offeredSalary * ownerMult) / 100) * 100;

  $: requestedSalary = Math.round(effectiveOffer * (1 + salaryRatio) / 100) * 100;
  $: teamName = $masterStore.teams.find((t) => t.id === action.teamId)?.name ?? action.teamId;
  $: totalValue = requestedSalary * selectedDuration + action.signingBonus;

  // 허용 임계값: 옵션 조합에 따라 조정
  $: acceptThreshold = (() => {
    // 임계값도 같은 배수를 탄다 — 오퍼만 올리면 "더 주는데 더 짜다"가 된다
    let base = effectiveOffer * 1.15;
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

  $: isImmediate = isImmediateContract(action.context);

  function buildContract(salary: number, years: number): ProContract {
    return {
      teamId: action.teamId,
      leagueId: action.leagueId,
      salary,
      durationYears: years,
      remainingYears: years,
      signingBonus: action.signingBonus,
      teamOptionYears,
      playerOptionYears,
      noTrade,
      status: "active",
    };
  }

  async function accept() {
    if (resolving) return;
    resolving = true;
    await signNegotiatedContract(action, buildContract(action.offeredSalary, action.durationYears), teamName);
    resolving = false;
  }

  async function counter() {
    if (resolving || !canCounter) return;
    resolving = true;
    await signNegotiatedContract(action, buildContract(requestedSalary, selectedDuration), teamName);
    resolving = false;
  }

  async function reject() {
    if (resolving) return;
    resolving = true;
    await rejectNegotiatedContract(action, teamName);
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
        <p class="col-val">{formatSalary(effectiveOffer)}원</p>
        <p class="col-sub">{action.durationYears}년 · 계약금 {formatSalary(action.signingBonus)}원</p>
      </div>
      <div class="arrow">→</div>
      <div class="compare-col right">
        <p class="col-label">내 요청</p>
        <p class="col-val">{formatSalary(requestedSalary)}원</p>
        <p class="col-sub">{selectedDuration}년 · 총액 {formatSalary(totalValue)}원</p>
      </div>
    </div>

    <!-- 구단주 (§7-5 F-4) — 관계와 예산은 다른 축이다 -->
    {#if ownerMult !== 1}
      <p class="owner-line">
        구단주 관계 <strong>{ownerLabel}</strong>
        {#if ownerBonus !== 0}
          ({ownerBonus > 0 ? "+" : ""}{(ownerBonus * 100).toFixed(0)}%)
        {/if}
        · 구단 예산 {budgetMod > 1 ? "여유" : budgetMod < 1 ? "빠듯" : "보통"}
        ({budgetMod > 1 ? "+" : ""}{((budgetMod - 1) * 100).toFixed(0)}%)
        <span class="owner-net" class:up={ownerMult > 1} class:down={ownerMult < 1}>
          → 제시액 {ownerMult > 1 ? "+" : ""}{((ownerMult - 1) * 100).toFixed(1)}%
        </span>
      </p>
    {/if}

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
        <span>{formatSalary(effectiveOffer * 0.8)}원</span>
        <span class="center-label">{formatSalary(requestedSalary)}원</span>
        <span>{formatSalary(effectiveOffer * 1.2)}원</span>
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
  /* ── 구단주 줄 (§7-5 F-4) ─────────────────────────────────────── */
  .owner-line {
    margin: 0 0 8px;
    font-size: 11px;
    color: #9eb6de;
    line-height: 1.6;
  }
  .owner-line strong { color: #eef4ff; }
  .owner-net { font-weight: 600; }
  .owner-net.up { color: #79e0a2; }
  .owner-net.down { color: #ffb68a; }

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
