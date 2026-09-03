<script lang="ts">
  import { onMount } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import {
    signNegotiatedContract, rejectNegotiatedContract,
  } from "../../../shared/usecases/contractDecision";
  import { masterStore, entitiesL10n, teamsL10n } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { slotRepo } from "../../../shared/repo/slotRepo";
  import type { PendingAction } from "../../../shared/types/season";
  import type {
    PitcherSeasonStats, BatterSeasonStats, ProContract, ContractIncentive,
  } from "../../../shared/types/save";
  import { calcMarketSalary, calcSeasonRating } from "../../../shared/utils/salaryEngine";
  import { relationEffects } from "../../../shared/usecases/relationships";
  import { staffModsOf } from "../../../shared/utils/staffEffects";
  import { fillContractCopy } from "../../../shared/utils/contractCopy";
  import {
    CLAUSE_OPTIONS, clauseById, clauseAddable, addClause, removeClause,
    clauseTerms, incentiveCandidates, incentiveLabel, incentiveKey,
    incentiveAddable, addIncentive, removeIncentive, incentiveTotal,
    maxIncentives, minSalaryOf, requestedSalaryOf, contractTotalValue,
    acceptThresholdOf, acceptProbabilityOf, counterOfferRounds, compareRows,
    type ClauseId,
  } from "../../../shared/utils/contractTerms";

  /**
   * 계약 협상 — 시안 `docs/mock/contract-page-mock.html` 구성 (1.1 C③).
   * 정본은 `docs/PLAN_CONTRACT_TERMS.md` §3·§4·§5·§5-2·§5-3·§8.
   *
   * ## 예전과 무엇이 다른가
   *
   * ```
   * 조항       체크박스·버튼이 늘 떠 있었다  → 「＋ 추가」로 붙이고 「×」로 뺀다
   * 인센티브   없었다(죽은 필드)            → 최대 3개까지 고른다 (✅ 상한 확정)
   * 최저연봉   슬라이더에 바닥이 없었다     → salaryRules.minSalary 로 친다 (✅ 확정)
   * 역제안     늘 한 번                     → 성적·구단주 관계로 1~3회 (§5-2 ✅ 계수 확정)
   * 비교       제시/요청 두 칸              → 지금·제시·역제안 세 칸 표
   * ```
   *
   * ## 여기 없는 것 — 일부러다
   *
   * 🔴 **인센티브 정산을 안 넣는다** (C④·A 몫 · §7 ⑤⑥). 이 화면은 계약서에
   * 항목을 **싣기만** 한다. 시즌 끝에 성적과 대조해 돈을 주는 자리는
   * `runWorldSeasonEnd` 이고, 그건 엔진 쪽 순서가 따로 있다.
   *
   * 🔴 **구단이 조항을 제시하는 칸이 없다** (§7 ③ · `advanceWeek.ts:1306`).
   * 지금 `salaryNegotiation` 은 연봉·기간·계약금만 싣는다 — 팀 옵션을 실어 보내는
   * 건 그 자리를 고쳐야 하고 그건 A 몫이다. 실리면 이 화면은 **줄만 늘면 된다**.
   *
   * ⚠ **밸런스 값을 여기서 정하지 않는다.** 인센티브 후보·문턱·금액은
   * `generation_rules.json` 의 `contractRules` 에서 오고 전부 **제안값**이다(§7-1).
   * 조항 계수 다섯은 예전 화면에 있던 값 그대로다.
   *
   * ⚠ **관계 값을 숫자로 안 쓴다** (`relationship.ts`). 구단주 관계는 남은
   * 역제안 횟수와 제시액 배수로만 나간다.
   */

  export let action: Extract<PendingAction, { type: "salaryNegotiation" }>;

  const CONTEXT_LABEL: Record<string, string> = {
    initial:         "입단 계약 협상",
    renewal:         "계약 갱신 협상",
    military_return: "복귀 계약 협상",
  };

  let salaryRatio = 0;
  let selectedDuration = action.durationYears;
  let pickedClauses: ClauseId[] = [];
  let pickedIncentives: ContractIncentive[] = [];
  let resolving = false;
  /** 열려 있는 「＋ 추가」 목록. 한 번에 하나만 연다 */
  let openMenu: "" | "clause" | "incentive" = "";
  /** 구단이 되받은 줄. 문장은 `contract_terms.json` 에서만 온다 */
  let replyLine = "";

  // ── 구단주 관계 · 예산 (§7-5 F-4 / 7-4 이월) ──────────────────
  //
  // 두 입력이 다른 축이라는 게 요점이다:
  //   구단주 **관계**  — 나를 어떻게 보는가 (내가 쌓은 것)
  //   구단주 **예산**  — 지갑을 여는 사람인가 (팀이 원래 가진 것)
  // 관계가 좋아도 궁핍한 구단은 못 준다.
  let ownerLabel = "중립";
  let ownerBonus = 0;
  /** −100~+100 원값. **화면에 숫자로 안 쓴다** — 역제안 횟수 계산에만 들어간다 */
  let ownerRelation = 0;
  $: budgetMod = staffModsOf($gameStore.protagonist.teamId ?? "", $entitiesL10n).budget;

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
    try {
      const rows = await slotRepo.getRelationships(slotId, { kind: "owner" });
      // 구단주가 없는 팀(스태프가 아직 안 붙음)은 0 이다 — 성적만으로 1~2회가 된다
      ownerRelation = rows[0]?.value ?? 0;
    } catch {
      ownerRelation = 0;
    }
  });

  /** 구단주가 실제로 낼 수 있는 금액. 관계 × 예산 */
  $: ownerMult = (1 + ownerBonus) * budgetMod;
  $: effectiveOffer = Math.round((action.offeredSalary * ownerMult) / 100) * 100;

  $: teamName = $teamsL10n.find((t) => t.id === action.teamId)?.name ?? action.teamId;
  $: copy = $masterStore.contractCopy;

  // ── 최저연봉 하한 (§3 ✅ 사용자 확정 6) ──────────────────────
  $: minSalary = minSalaryOf(action.leagueId);
  $: rawRequest = Math.round((effectiveOffer * (1 + salaryRatio)) / 100) * 100;
  $: requestedSalary = requestedSalaryOf(effectiveOffer, salaryRatio, minSalary);
  /** 하한에 걸렸을 때만 안내 한 줄. 문장은 데이터에서 온다 */
  $: floorHit = minSalary > 0 && rawRequest < minSalary;

  // ── 조항·인센티브 ────────────────────────────────────────────
  $: role = $gameStore.protagonist.position;
  $: incCandidates = incentiveCandidates(role, requestedSalary);
  $: incTotal = incentiveTotal(pickedIncentives);

  // ⚠ 연봉이 바뀌면 후보 금액도 바뀐다. **이미 고른 항목의 금액은 안 따라간다** —
  //   고를 때의 금액으로 계약서에 실린다. 뒤에서 조용히 값이 변하면 표가 거짓말을 한다.

  // ── 구단 판정 ────────────────────────────────────────────────
  $: acceptThreshold = acceptThresholdOf({
    effectiveOffer,
    offeredYears: action.durationYears,
    requestedYears: selectedDuration,
    clauses: pickedClauses,
    incentiveCount: pickedIncentives.length,
  });
  $: acceptProb = acceptProbabilityOf(requestedSalary, acceptThreshold);
  $: withinThreshold = requestedSalary <= acceptThreshold;

  // ── 역제안 횟수 (§5-2) ───────────────────────────────────────
  let seasonRating = 50;
  let usedRounds = 0;
  $: myStats = ($seasonStore.stats[$gameStore.protagonist.id] ?? null);
  $: isPitcher = $gameStore.protagonist.playerType === "pitcher";
  $: pitcherStats = isPitcher ? (myStats as PitcherSeasonStats | null) : null;
  $: batterStats  = !isPitcher ? (myStats as BatterSeasonStats | null) : null;
  $: calcSeasonRating(pitcherStats ?? batterStats).then((r) => (seasonRating = r));

  $: totalRounds = counterOfferRounds(seasonRating, ownerRelation);
  $: roundsLeft = Math.max(0, totalRounds - usedRounds);

  let marketSalary = 0;
  $: calcMarketSalary(
    isPitcher ? $gameStore.protagonist.pitching?.ovr ?? 50 : $gameStore.protagonist.batting?.ovr ?? 50,
    $gameStore.protagonist.fame,
    action.leagueId,
  ).then((r) => (marketSalary = r));
  $: marketRatioPct = marketSalary > 0 ? Math.round((requestedSalary / marketSalary) * 100) : 100;

  // ── 비교표 ───────────────────────────────────────────────────
  $: current = $gameStore.protagonist.contract ?? null;
  $: rows = compareRows({
    current: current
      ? {
          salary: current.salary, years: current.durationYears,
          signingBonus: current.signingBonus, noTrade: current.noTrade,
          incentiveTotal: incentiveTotal(current.incentives ?? []),
        }
      : null,
    offered: { salary: effectiveOffer, years: action.durationYears, signingBonus: action.signingBonus },
    counter: {
      salary: requestedSalary, years: selectedDuration, signingBonus: action.signingBonus,
      clauses: pickedClauses, incentives: pickedIncentives,
    },
    yes: "있음", no: "없음",
  });

  $: totalValue = contractTotalValue(requestedSalary, selectedDuration, action.signingBonus) + incTotal;

  function formatSalary(v: number): string {
    if (v >= 10000) return `${(v / 10000).toFixed(1)}억`;
    return `${v.toLocaleString()}만`;
  }

  function buildContract(salary: number, years: number, incentives: ContractIncentive[], clauses: ClauseId[]): ProContract {
    const t = clauseTerms(clauses);
    return {
      teamId: action.teamId,
      leagueId: action.leagueId,
      salary,
      durationYears: years,
      remainingYears: years,
      signingBonus: action.signingBonus,
      teamOptionYears: t.teamOptionYears,
      playerOptionYears: t.playerOptionYears,
      noTrade: t.noTrade,
      ...(incentives.length > 0 ? { incentives } : {}),
      status: "active",
    };
  }

  /**
   * 제시 수락 — **조항도 인센티브도 안 붙인다.** 구단이 낸 그대로다.
   *
   * ⚠ 서명액이 `action.offeredSalary` 이고 화면이 보이는 건 `effectiveOffer`
   * (구단주 관계·예산 배수를 먹인 값)다. **예전 화면부터 그랬다** — 배수는
   * 표시와 역제안 기준에만 걸리고 서명액엔 안 걸린다. 금액을 바꾸는 건
   * 밸런스라 이번에 안 건드렸다(HANDOFF §0.52 · A 판단 자리).
   */
  async function accept() {
    if (resolving) return;
    resolving = true;
    await signNegotiatedContract(action, buildContract(action.offeredSalary, action.durationYears, [], []), teamName);
    resolving = false;
  }

  /**
   * 역제안 — 허용치 안이면 구단이 받아들이고 서명한다.
   * 넘으면 **횟수를 하나 쓰고** 되받는다. 다 쓰면 수락·거절만 남는다.
   */
  async function counter() {
    if (resolving || roundsLeft <= 0) return;
    if (!withinThreshold) {
      usedRounds += 1;
      replyLine = copy
        ? (roundsLeft - 1 <= 0 ? copy.counter.reason.roundsOut : copy.counter.reject)
        : "";
      return;
    }
    resolving = true;
    await signNegotiatedContract(
      action, buildContract(requestedSalary, selectedDuration, pickedIncentives, pickedClauses), teamName,
    );
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

  function toggleMenu(which: "clause" | "incentive", e: MouseEvent) {
    e.stopPropagation();
    openMenu = openMenu === which ? "" : which;
  }
</script>

<svelte:window on:click={() => (openMenu = "")} />

<div class="overlay">
  <section class="modal">
    <header>
      <p class="badge">{CONTEXT_LABEL[action.context] ?? "계약 협상"}</p>
      <h2>{teamName}</h2>
      <p class="rounds">역제안 {roundsLeft}회 남음</p>
    </header>

    <div class="cols">
      <!-- ── 구단 제시 ── -->
      <section class="card">
        <p class="card-h">구단 제시</p>
        <div class="row"><span class="k">연봉</span><span class="v big">{formatSalary(effectiveOffer)}원</span></div>
        <div class="row"><span class="k">기간</span><span class="v">{action.durationYears}년</span></div>
        <!-- 없는 조항은 줄 자체가 없다 — 「없음」·「0년」을 안 적는다 (§6) -->
        {#if action.signingBonus > 0}
          <div class="row"><span class="k">계약금</span><span class="v">{formatSalary(action.signingBonus)}원</span></div>
        {/if}
        {#if ownerMult !== 1}
          <p class="owner-line">
            구단주 관계 <strong>{ownerLabel}</strong>
            · 구단 예산 {budgetMod > 1 ? "여유" : budgetMod < 1 ? "빠듯" : "보통"}
            <span class="owner-net" class:up={ownerMult > 1} class:down={ownerMult < 1}>
              → 제시액 {ownerMult > 1 ? "+" : ""}{((ownerMult - 1) * 100).toFixed(1)}%
            </span>
          </p>
        {/if}
      </section>

      <!-- ── 역제안 ── -->
      <section class="card">
        <p class="card-h">역제안</p>
        <p class="f">연봉 <span class="pct">{salaryRatio > 0 ? "+" : ""}{Math.round(salaryRatio * 100)}%</span></p>
        <input class="slider" type="range" min="-0.2" max="0.2" step="0.01" bind:value={salaryRatio} />
        <div class="row"><span class="k">요구 연봉</span><span class="v">{formatSalary(requestedSalary)}원</span></div>
        {#if minSalary > 0}
          <div class="row"><span class="k">최저연봉</span><span class="v" class:floor={floorHit}>{formatSalary(minSalary)}원</span></div>
        {/if}
        {#if floorHit && copy}
          <!-- 문장은 contract_terms.json 에서만 온다 (B-13) -->
          <p class="note">{fillContractCopy(copy.minSalary.floor, { minSalary: minSalary.toLocaleString() })}</p>
        {/if}
        {#if durationRange.length > 1}
          <p class="f">기간</p>
          <div class="seg">
            {#each durationRange as yr}
              <button type="button" class="seg-b" class:on={selectedDuration === yr}
                aria-pressed={selectedDuration === yr}
                on:click={() => (selectedDuration = yr)}>{yr}년</button>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <div class="cols">
      <!-- ── 조항 ── -->
      <section class="card">
        <div class="card-h">
          조항
          <span class="menu">
            <button type="button" class="addbtn" on:click={(e) => toggleMenu("clause", e)}>＋ 추가</button>
            {#if openMenu === "clause"}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div class="pop" role="menu" tabindex="-1"
                on:click={(e) => e.stopPropagation()} on:keydown={() => {}}>
                {#each CLAUSE_OPTIONS as c}
                  <button type="button" role="menuitem" disabled={!clauseAddable(pickedClauses, c.id)}
                    on:click={() => { pickedClauses = addClause(pickedClauses, c.id); openMenu = ""; }}>
                    <span>{c.label}</span><span class="am">×{c.mult}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </span>
        </div>
        <ul class="picked">
          {#each pickedClauses as id (id)}
            <li>
              <span class="nm">{clauseById(id).label}</span>
              <span class="am">×{clauseById(id).mult}</span>
              <button type="button" class="rm" aria-label="빼기"
                on:click={() => (pickedClauses = removeClause(pickedClauses, id))}>×</button>
            </li>
          {:else}
            <li class="empty">없음</li>
          {/each}
        </ul>
      </section>

      <!-- ── 인센티브 ── -->
      {#if incCandidates.length > 0}
        <section class="card">
          <div class="card-h">
            인센티브
            <span class="cnt">{pickedIncentives.length} / {maxIncentives()}</span>
            <span class="menu">
              <button type="button" class="addbtn" on:click={(e) => toggleMenu("incentive", e)}>＋ 추가</button>
              {#if openMenu === "incentive"}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="pop" role="menu" tabindex="-1"
                  on:click={(e) => e.stopPropagation()} on:keydown={() => {}}>
                  {#each incCandidates as c (incentiveKey(c))}
                    <button type="button" role="menuitem"
                      disabled={!incentiveAddable(pickedIncentives, c, requestedSalary)}
                      on:click={() => { pickedIncentives = addIncentive(pickedIncentives, c, requestedSalary); openMenu = ""; }}>
                      <span>{incentiveLabel(c)}</span><span class="am">+{c.bonus.toLocaleString()}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </span>
          </div>
          <ul class="picked">
            {#each pickedIncentives as i (incentiveKey(i))}
              <li>
                <span class="nm">{incentiveLabel(i)}</span>
                <span class="am">+{i.bonus.toLocaleString()}만원</span>
                <button type="button" class="rm" aria-label="빼기"
                  on:click={() => (pickedIncentives = removeIncentive(pickedIncentives, incentiveKey(i)))}>×</button>
              </li>
            {:else}
              <li class="empty">없음</li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    <!-- ── 비교 ── -->
    <section class="card wide">
      <p class="card-h">비교</p>
      <table class="cmp">
        <thead>
          <tr><th>항목</th><th>지금 계약</th><th>구단 제시</th><th>내 역제안</th></tr>
        </thead>
        <tbody>
          {#each rows as r (r.key)}
            <tr class:total={r.key === "total"}>
              <td>{r.label}</td>
              <td>{r.current ?? "—"}</td>
              <td>{r.offered}</td>
              <td class:up={r.dir === "up"} class:dn={r.dir === "down"}>{r.counter}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <!-- ── 수락 확률 ── -->
    <section class="card wide">
      <p class="card-h">수락 확률</p>
      <div class="gauge" class:mid={acceptProb < 65} class:low={acceptProb < 40}>
        <i style="width:{acceptProb}%"></i>
      </div>
      <div class="row"><span class="k">추정</span><span class="v">{acceptProb}%</span></div>
      <div class="row"><span class="k">시장가 대비</span><span class="v" class:over={marketRatioPct > 110}>{marketRatioPct}%</span></div>
      {#if replyLine}
        <p class="note">{replyLine}</p>
      {/if}
    </section>

    <div class="actions">
      <button class="btn-counter" disabled={resolving || roundsLeft <= 0} on:click={counter}>역제안</button>
      <button class="btn-accept" disabled={resolving} on:click={accept}>
제시 수락</button>
      <button class="btn-reject" disabled={resolving} on:click={reject}>거절</button>
    </div>

    <p class="stats-row">
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
      <span class="muted">총액 {formatSalary(totalValue)}원</span>
    </p>
  </section>
</div>

<style>
  .overlay { position:fixed; inset:0; background: rgba(10, 18, 38, 0.52); display:flex; align-items:center; justify-content:center; z-index:220; }
  .modal { width:min(760px,95vw); background:var(--panel); border:1px solid var(--ink-mute); border-radius:16px; padding:22px; display:grid; gap:12px; max-height:92vh; overflow-y:auto; }

  header { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  .badge { margin:0; font-size:11px; color:var(--ink-mute); letter-spacing:.05em; }
  h2 { margin:0; color:var(--ink); font-size:19px; }
  .rounds { margin:0 0 0 auto; font-size:12px; color:var(--ink-mid); }

  .cols { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 700px) { .cols { grid-template-columns:1fr; } }

  .card { background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); padding:12px; }
  .card.wide { grid-column:1 / -1; }
  .card-h {
    margin:0 0 8px; font-size:12px; font-weight:700; color:var(--ink-mute);
    border-bottom:1px solid var(--line); padding-bottom:6px;
    display:flex; align-items:center; gap:8px;
  }
  .cnt { color:var(--ink-mute); font-weight:400; margin-left:auto; }
  .menu { position:relative; margin-left:auto; }
  /* 개수 칸이 있으면 그게 auto 를 먹으므로 메뉴는 붙여 둔다 */
  .cnt + .menu { margin-left:8px; }

  .row { display:flex; justify-content:space-between; align-items:baseline; gap:10px; padding:5px 0; border-bottom:1px dashed var(--line); }
  .row:last-child { border-bottom:0; }
  .k { color:var(--ink-mute); font-size:12px; }
  .v { font-weight:700; color:var(--ink); font-size:13px; }
  .v.big { font-size:19px; }
  .v.floor { color:var(--warn); }
  .v.over { color:var(--bad); }

  .f { margin:9px 0 3px; font-size:12px; color:var(--ink-mute); }
  .pct { color:var(--ink); font-weight:700; }
  .slider { width:100%; accent-color:var(--ink-mute); }
  .note { margin:6px 0 0; font-size:11.5px; color:var(--warn); }

  .seg { display:flex; gap:5px; }
  .seg-b { flex:1; padding:6px 5px; border:1px solid var(--line); background:var(--panel); color:var(--ink); border-radius:var(--radius); cursor:pointer; font-size:12.5px; font-family:inherit; }
  .seg-b.on { background:var(--line); border-color:var(--ink-mute); font-weight:700; }

  .addbtn {
    border:1px solid var(--line); background:var(--panel-sunk); color:var(--ink-mid);
    border-radius:var(--radius); cursor:pointer; font-family:inherit; font-size:11.5px;
    padding:2px 8px; font-weight:700;
  }
  .addbtn:hover { border-color:var(--ink-mute); color:var(--ink); }

  .pop {
    position:absolute; right:0; top:calc(100% + 4px); z-index:5; min-width:200px;
    background:var(--panel); border:1px solid var(--ink-mute); border-radius:var(--radius);
    box-shadow:0 6px 18px rgba(0,0,0,.18); padding:4px;
  }
  .pop button {
    display:flex; width:100%; gap:10px; align-items:baseline; padding:6px 8px; border:0;
    background:none; color:var(--ink); cursor:pointer; font-family:inherit; font-size:12.5px;
    text-align:left; border-radius:var(--radius);
  }
  .pop button:hover:not(:disabled) { background:var(--panel-sunk); }
  .pop button:disabled { opacity:.35; cursor:default; }
  .pop .am { margin-left:auto; color:var(--ink-mute); font-size:11.5px; }

  .picked { list-style:none; margin:0; padding:0; }
  .picked li { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px dashed var(--line); font-size:12.5px; color:var(--ink); }
  .picked li:last-child { border-bottom:0; }
  .picked .nm { font-weight:700; }
  .picked .am { margin-left:auto; color:var(--ink-mid); font-size:12px; }
  .picked .empty { color:var(--ink-mute); }
  .rm { border:0; background:none; color:var(--ink-mute); cursor:pointer; font-size:15px; line-height:1; padding:0 2px; font-family:inherit; }
  .rm:hover { color:var(--bad); }

  .cmp { width:100%; border-collapse:collapse; font-size:12.5px; }
  .cmp th, .cmp td { padding:5px 7px; border-bottom:1px solid var(--line); text-align:right; color:var(--ink-mid); }
  .cmp th:first-child, .cmp td:first-child { text-align:left; }
  .cmp thead th { background:var(--panel-sunk); color:var(--ink-mute); font-size:11px; font-weight:700; }
  .cmp tr.total td { font-weight:800; color:var(--ink); }
  .cmp td.up { color:var(--ok); font-weight:700; }
  .cmp td.dn { color:var(--bad); font-weight:700; }

  .gauge { height:8px; border-radius:999px; background:var(--panel-sunk); overflow:hidden; margin:4px 0 6px; }
  .gauge > i { display:block; height:100%; background:var(--ok); transition:width .18s; }
  .gauge.mid > i { background:var(--warn); }
  .gauge.low > i { background:var(--bad); }

  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  .actions button { flex:1; padding:10px 12px; border-radius:9px; cursor:pointer; font-size:13px; font-family:inherit; }
  .btn-counter { background:var(--line); color:var(--ink); border:1px solid var(--ink-mute); font-weight:700; }
  .btn-accept  { background:var(--panel); color:var(--ink); border:1px solid var(--line); }
  .btn-reject  { background:var(--panel); color:var(--bad); border:1px solid var(--bad); }
  button:disabled { opacity:.5; cursor:default; }

  .stats-row { margin:0; display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--ink); background:var(--panel-sunk); border-radius:var(--radius); padding:8px 10px; }
  .muted { color:var(--ink-mute); }

  .owner-line { margin:8px 0 0; font-size:11px; color:var(--ink-mid); line-height:1.6; }
  .owner-line strong { color:var(--ink); }
  .owner-net { font-weight:600; }
  .owner-net.up { color:var(--ok); }
  .owner-net.down { color:var(--warn); }
</style>
