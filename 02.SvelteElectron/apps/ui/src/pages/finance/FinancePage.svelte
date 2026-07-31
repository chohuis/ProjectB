<script lang="ts">
  /**
   * 개인 재정 화면 (Phase 7-5 F-3).
   *
   * **여기서 계산하지 않는다.** 전부 Rust `finance.rs`가 낸 값을 표시만 한다.
   * 예전 이 파일은 컴포넌트 안에서 OVR·사기로 수입을 즉석 계산했고, 그 숫자가
   * 실제 `money`와 아무 관계가 없었다 (CLAUDE.md "화면에 게임 로직 금지" 위반).
   *
   * DESIGN §7.3 관리 UI 원칙: **가계부·예산배분 화면 없이 상시 잔액만.**
   * 지출은 이벤트 선택 또는 구독 토글로만 한다 — 그래서 여기 "예산 짜기"가 없다.
   */
  import { onMount } from "svelte";
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import {
    loadFinanceRules, calcWeeklyFinance, calcSponsorOffers, calcTrainingBonus,
    financeOf, sponsorAnnualOf, signSponsor, toggleSubscription,
    type FinanceRulesFile, type WeeklyFinance, type SponsorOffer, type TrainingBonusResult,
  } from "../../shared/usecases/finance";

  type FinanceTab = "overview" | "sponsor" | "training" | "invest";
  let tab: FinanceTab = "overview";

  let rules: FinanceRulesFile | null = null;
  let weekly: WeeklyFinance | null = null;
  let offers: SponsorOffer[] = [];
  let offersCapped = false;
  let bonus: TrainingBonusResult | null = null;
  let loadError = "";
  let busy = false;

  $: p = $gameStore.protagonist;
  $: seasonYear = $seasonStore.seasonYear;
  $: fin = financeOf(p);
  $: sponsorAnnual = sponsorAnnualOf(fin, seasonYear);
  $: isPro = p.careerStage === "pro" || p.careerStage.startsWith("pro_");

  $: stageLabel =
    p.careerStage === "highschool" ? "고등학교" :
    p.careerStage === "university" ? "대학교" :
    p.careerStage === "military" ? "군 복무" :
    p.careerStage === "independent" ? "독립리그" : "프로";

  // 주인공 상태가 바뀌면 다시 계산한다 — 화면이 스스로 추정하지 않는다
  $: refreshKey = `${p.careerStage}|${p.contract?.salary ?? 0}|${p.fame}|${sponsorAnnual}|${JSON.stringify(fin.subscriptions)}`;
  $: if (refreshKey) void refresh();

  onMount(() => { void refresh(); });

  async function refresh(): Promise<void> {
    try {
      rules = await loadFinanceRules();
      weekly = await calcWeeklyFinance({ protagonist: p, seasonYear });
      bonus = await calcTrainingBonus({ protagonist: p });
      const so = await calcSponsorOffers({ protagonist: p, seasonYear });
      offers = so.offers;
      offersCapped = so.capped;
      loadError = "";
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }

  async function onSign(o: SponsorOffer): Promise<void> {
    if (busy) return;
    busy = true;
    try { await signSponsor(o, seasonYear); await refresh(); }
    finally { busy = false; }
  }

  async function onToggle(areaId: string): Promise<void> {
    if (busy) return;
    busy = true;
    try { await toggleSubscription(areaId); await refresh(); }
    finally { busy = false; }
  }

  /** 만원 단위를 사람이 읽는 문자열로. 1억(10,000만원)부터는 억으로 */
  function won(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 10_000) {
      const eok = v / 10_000;
      return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(2)}억`;
    }
    return `${Math.round(v).toLocaleString()}만`;
  }

  function tierOf(areaId: string): number {
    return fin.subscriptions.find((s) => s.areaId === areaId)?.tier ?? 0;
  }
  function tierLabel(areaId: string): string {
    const tr = tierOf(areaId);
    if (tr === 0) return "미구독";
    return rules?.training.tiers.find((x) => x.tier === tr)?.name ?? `${tr}단계`;
  }
  function effectiveOf(areaId: string): number {
    return bonus?.byArea.find((b) => b.areaId === areaId)?.effective ?? 0;
  }
</script>

<section class="page">
  <h2>{$t("page.finance")}</h2>

  <article class="card board">
    <header class="head">
      <div class="stage-chip">
        <strong>{stageLabel}</strong>
        <span>보유 자산 {won(p.money)}원</span>
      </div>
      <div class="tabs">
        <button class:active={tab === "overview"} on:click={() => (tab = "overview")}>개요</button>
        <button class:active={tab === "sponsor"}  on:click={() => (tab = "sponsor")}>스폰서</button>
        <button class:active={tab === "training"} on:click={() => (tab = "training")}>개인 트레이닝</button>
        <button class:active={tab === "invest"}   on:click={() => (tab = "invest")}>투자</button>
      </div>
    </header>

    {#if loadError}
      <section class="panel err">
        <h3>재정 규칙을 못 읽었습니다</h3>
        <p class="sub">{loadError}</p>
        <p class="sub">`generation_rules.json`의 <code>financeRules</code>가 필요합니다 (Phase 7-5).</p>
      </section>
    {:else if !weekly}
      <section class="panel"><p class="sub">계산 중…</p></section>

    {:else if tab === "overview"}
      <div class="overview-grid">
        <section class="panel kpi-grid">
          <article><span>보유 자산</span><strong>{won(p.money)}</strong></article>
          <article>
            <span>주간 순현금</span>
            <strong class:up={weekly.netWeekly >= 0} class:down={weekly.netWeekly < 0}>
              {weekly.netWeekly >= 0 ? "+" : ""}{won(weekly.netWeekly)}
            </strong>
          </article>
          <article><span>연 총수입</span><strong>{won(weekly.grossAnnual)}</strong></article>
          <article>
            <span>실효 세율</span>
            <strong>{weekly.taxAnnual > 0 ? `${(weekly.effectiveTaxRate * 100).toFixed(1)}%` : "비과세"}</strong>
          </article>
          <article><span>명성</span><strong>{Math.round(p.fame)}</strong></article>
          <article><span>스폰서 계약</span><strong>{fin.sponsors.filter((s) => s.untilSeason >= seasonYear).length}건</strong></article>
        </section>

        <section class="panel ledger-panel">
          <h3>주간 수입 · 지출</h3>
          <p class="sub">
            {#if weekly.taxAnnual > 0}
              세금은 수령 시 원천징수됩니다 — 위 순현금은 세후입니다.
            {:else}
              학생·군 무대는 과세하지 않습니다.
            {/if}
          </p>
          <div class="ledger-grid">
            <div>
              <p class="ledger-title up">수입</p>
              <ul>
                {#each weekly.income as item}
                  <li><span>{item.label}</span><strong>{won(item.amount)}</strong></li>
                {:else}
                  <li><span>수입 없음</span><strong>-</strong></li>
                {/each}
              </ul>
            </div>
            <div>
              <p class="ledger-title down">지출</p>
              <ul>
                {#each weekly.expense as item}
                  <li><span>{item.label}</span><strong>{won(item.amount)}</strong></li>
                {:else}
                  <li><span>지출 없음</span><strong>-</strong></li>
                {/each}
              </ul>
            </div>
          </div>
        </section>
      </div>

    {:else if tab === "sponsor"}
      <div class="overview-grid">
        <section class="panel">
          <h3>계약 중</h3>
          <p class="sub">연 합계 {won(sponsorAnnual)} · 기타소득 분리과세 {rules ? (rules.tax.otherIncomeRate * 100).toFixed(0) : "-"}%</p>
          <ul>
            {#each fin.sponsors.filter((s) => s.untilSeason >= seasonYear) as s}
              <li>
                <span>{s.name}</span>
                <strong>{won(s.annual)} / 년 · {s.untilSeason}까지</strong>
              </li>
            {:else}
              <li><span>계약 중인 스폰서가 없습니다</span><strong>-</strong></li>
            {/each}
          </ul>
        </section>

        <section class="panel">
          <h3>받은 제안</h3>
          <p class="sub">
            {#if !isPro}
              학생·독립 무대에는 스폰서가 붙지 않습니다 (아마추어 규정).
            {:else if offers.length === 0}
              지금 명성({Math.round(p.fame)})으로 들어온 제안이 없습니다.
              가장 낮은 문턱은 명성 {rules?.sponsor.categories[0]?.fameMin ?? "-"}입니다.
            {:else}
              명성이 오르면 금액도 같이 오릅니다{offersCapped ? " · 연봉 대비 상한에 걸려 조정됐습니다" : ""}.
            {/if}
          </p>
          <ul>
            {#each offers as o}
              <li class="offer">
                <div class="offer-left">
                  <strong>{o.name}</strong>
                  <span>{won(o.annual)} / 년 · {o.termYears}년 · 연봉의 {(o.pctOfSalary * 100).toFixed(1)}%</span>
                </div>
                <button class="act" disabled={busy} on:click={() => onSign(o)}>계약</button>
              </li>
            {/each}
          </ul>
        </section>
      </div>

    {:else if tab === "training"}
      <section class="panel training-panel">
        <h3>개인 트레이닝 구독</h3>
        <p class="sub">
          누를 때마다 단계가 오르고, 마지막 단계에서 누르면 해지됩니다.
          {#if bonus && bonus.inverseFactor !== 1}
            <br />
            <strong class:up={bonus.inverseFactor > 1} class:down={bonus.inverseFactor < 1}>
              팀 시설 보정 ×{bonus.inverseFactor.toFixed(2)}
            </strong>
            — {bonus.inverseFactor > 1
              ? "시설이 열악해 개인 트레이닝이 더 크게 먹힙니다."
              : "시설이 좋아 개인 트레이닝의 추가 효과가 줄어듭니다."}
          {/if}
        </p>
        <ul>
          {#each rules?.training.areas ?? [] as a}
            <li class="offer">
              <div class="offer-left">
                <strong>{a.name}</strong>
                <span>
                  {tierLabel(a.id)}
                  {#if tierOf(a.id) > 0}
                    · 효율 +{(effectiveOf(a.id) * 100).toFixed(1)}%
                    · 주 {rules?.training.tiers.find((x) => x.tier === tierOf(a.id))?.weeklyCost ?? 0}만원
                  {/if}
                </span>
              </div>
              <button class="act" disabled={busy} on:click={() => onToggle(a.id)}>
                {tierOf(a.id) === 0 ? "구독" : tierOf(a.id) >= (rules?.training.tiers.length ?? 2) ? "해지" : "상향"}
              </button>
            </li>
          {/each}
        </ul>
        <p class="sub">
          주간 구독료 합계 <strong>{won(bonus?.weeklyCost ?? 0)}</strong> —
          위 개요 탭의 순현금에 이미 반영돼 있습니다.
        </p>
      </section>

    {:else}
      <section class="panel">
        <h3>투자</h3>
        <p class="sub">
          투자는 <strong>시즌 종료 화면</strong>에서 한 번만 선택합니다.
          여기서는 지금까지의 결과만 봅니다.
          {#if rules && p.money < rules.investment.minCash}
            <br />현금이 {won(rules.investment.minCash)} 이상이어야 선택지가 열립니다.
          {/if}
        </p>
        <ul>
          {#each fin.investments.slice().reverse() as inv}
            <li>
              <span>{inv.season} {inv.name}</span>
              <strong class:up={inv.profit >= 0} class:down={inv.profit < 0}>
                {won(inv.principal)} → {inv.profit >= 0 ? "+" : ""}{won(inv.profit)}
                ({(inv.rate * 100).toFixed(1)}%)
              </strong>
            </li>
          {:else}
            <li><span>아직 투자 이력이 없습니다</span><strong>-</strong></li>
          {/each}
        </ul>
        {#if fin.investments.length > 0}
          <p class="sub">
            누적 손익
            <strong class:up={fin.investments.reduce((a, i) => a + i.profit, 0) >= 0}
                    class:down={fin.investments.reduce((a, i) => a + i.profit, 0) < 0}>
              {won(fin.investments.reduce((a, i) => a + i.profit, 0))}
            </strong>
          </p>
        {/if}
      </section>
    {/if}
  </article>
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h2, h3, p { margin: 0; }
  h2 { font-size: 20px; }

  .card {
    background: linear-gradient(180deg, #161f33 0%, #121a2a 100%);
    border: 1px solid #2d3956;
    border-radius: 12px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .board {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .stage-chip {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid #3a4c73;
    background: #172745;
  }

  .stage-chip strong { font-size: 13px; color: #eff5ff; }
  .stage-chip span { font-size: 11px; color: #a8bcdd; }

  .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .tabs button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 6px 11px;
    font-size: 12px;
    cursor: pointer;
  }
  .tabs button.active { background: #3262b0; border-color: #6da1f7; }

  .overview-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .panel {
    border: 1px solid #2f486f;
    border-radius: 10px;
    background: #13223d;
    padding: 10px;
    min-height: 0;
    overflow: auto;
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .err { border-color: #7a3b3b; background: #2a1620; }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    align-content: start;
  }

  .kpi-grid article {
    border: 1px solid #2e486f;
    border-radius: 8px;
    background: #152b4f;
    padding: 8px;
    display: grid;
    gap: 2px;
  }

  .kpi-grid span { color: #9eb6de; font-size: 11px; }
  .kpi-grid strong { color: #eef4ff; font-size: 14px; }
  .up { color: #79e0a2; }
  .down { color: #ffb68a; }

  .ledger-panel { grid-template-rows: auto auto minmax(0, 1fr); }
  .ledger-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; min-height: 0; }
  .ledger-title { font-size: 12px; margin-bottom: 6px; }

  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
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
    font-size: 12px;
  }

  li strong { color: #eef4ff; font-size: 12px; }

  .sub { color: #aac0e4; font-size: 11px; line-height: 1.5; }
  .sub code { color: #cfe0ff; }

  .offer { align-items: center; }
  .offer-left { display: grid; gap: 2px; }
  .offer-left span { color: #9eb6de; font-size: 11px; }

  .act {
    border: 1px solid #4a7fd0;
    background: #2b53a0;
    color: #eaf2ff;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .act:disabled { opacity: 0.5; cursor: default; }

  .training-panel { grid-template-rows: auto auto minmax(0, 1fr) auto; }

  @media (max-width: 1100px) {
    .overview-grid, .ledger-grid { grid-template-columns: 1fr; }
  }
</style>
