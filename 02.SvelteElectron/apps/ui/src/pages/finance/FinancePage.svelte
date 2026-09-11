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
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import {
    loadFinanceRules,
    calcWeeklyFinance,
    calcSponsorOffers,
    calcTrainingBonus,
    financeOf,
    sponsorAnnualOf,
    signSponsor,
    toggleSubscription,
    type FinanceRulesFile,
    type WeeklyFinance,
    type SponsorOffer,
    type TrainingBonusResult,
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
    p.careerStage === "highschool"
      ? "고등학교"
      : p.careerStage === "university"
        ? "대학교"
        : p.careerStage === "military"
          ? "군 복무"
          : p.careerStage === "independent"
            ? "독립리그"
            : "프로";

  // 주인공 상태가 바뀌면 다시 계산한다 — 화면이 스스로 추정하지 않는다
  $: refreshKey = `${p.careerStage}|${p.contract?.salary ?? 0}|${p.fame}|${sponsorAnnual}|${JSON.stringify(fin.subscriptions)}`;
  $: if (refreshKey) void refresh();

  onMount(() => {
    void refresh();
  });

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
    try {
      await signSponsor(o, seasonYear);
      await refresh();
    } finally {
      busy = false;
    }
  }

  async function onToggle(areaId: string): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await toggleSubscription(areaId);
      await refresh();
    } finally {
      busy = false;
    }
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

<!-- ⚠ 화면 제목("재정")을 뺐다. "나"의 상위 탭이 이미 그 이름이라
     같은 글자가 두 번 나온다 -->
<section class="page">
  <header class="head">
    <div class="stage">
      <strong>{stageLabel}</strong>
      <span class="u-num">보유 자산 {won(p.money)}원</span>
    </div>
    <div class="u-subtabs">
      <button class:on={tab === "overview"} on:click={() => (tab = "overview")}>개요</button>
      <button class:on={tab === "sponsor"} on:click={() => (tab = "sponsor")}>스폰서</button>
      <button class:on={tab === "training"} on:click={() => (tab = "training")}
        >개인 트레이닝</button
      >
      <button class:on={tab === "invest"} on:click={() => (tab = "invest")}>투자</button>
    </div>
  </header>

  <div class="board">
    {#if loadError}
      <section class="panel err">
        <h3>재정 규칙을 못 읽었습니다</h3>
        <p class="sub">{loadError}</p>
        <p class="sub">
          `generation_rules.json`의 <code>financeRules</code>가 필요합니다 (Phase 7-5).
        </p>
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
            <strong
              >{weekly.taxAnnual > 0
                ? `${(weekly.effectiveTaxRate * 100).toFixed(1)}%`
                : "비과세"}</strong
            >
          </article>
          <article><span>명성</span><strong>{Math.round(p.fame)}</strong></article>
          <article>
            <span>스폰서 계약</span><strong
              >{fin.sponsors.filter((s) => s.untilSeason >= seasonYear).length}건</strong
            >
          </article>
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
          <p class="sub">
            연 합계 {won(sponsorAnnual)} · 기타소득 분리과세 {rules
              ? (rules.tax.otherIncomeRate * 100).toFixed(0)
              : "-"}%
          </p>
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
              지금 명성({Math.round(p.fame)})으로 들어온 제안이 없습니다. 가장 낮은 문턱은 명성 {rules
                ?.sponsor.categories[0]?.fameMin ?? "-"}입니다.
            {:else}
              명성이 오르면 금액도 같이 오릅니다{offersCapped
                ? " · 연봉 대비 상한에 걸려 조정됐습니다"
                : ""}.
            {/if}
          </p>
          <ul>
            {#each offers as o}
              <li class="offer">
                <div class="offer-left">
                  <strong>{o.name}</strong>
                  <span
                    >{won(o.annual)} / 년 · {o.termYears}년 · 연봉의 {(o.pctOfSalary * 100).toFixed(
                      1,
                    )}%</span
                  >
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
                    · 효율 +{(effectiveOf(a.id) * 100).toFixed(1)}% · 주 {rules?.training.tiers.find(
                      (x) => x.tier === tierOf(a.id),
                    )?.weeklyCost ?? 0}만원
                  {/if}
                </span>
              </div>
              <button class="act" disabled={busy} on:click={() => onToggle(a.id)}>
                {tierOf(a.id) === 0
                  ? "구독"
                  : tierOf(a.id) >= (rules?.training.tiers.length ?? 2)
                    ? "해지"
                    : "상향"}
              </button>
            </li>
          {/each}
        </ul>
        <p class="sub">
          주간 구독료 합계 <strong>{won(bonus?.weeklyCost ?? 0)}</strong> — 위 개요 탭의 순현금에 이미
          반영돼 있습니다.
        </p>
      </section>
    {:else}
      <section class="panel">
        <h3>투자</h3>
        <p class="sub">
          투자는 <strong>시즌 종료 화면</strong>에서 한 번만 선택합니다. 여기서는 지금까지의 결과만
          봅니다.
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
            <strong
              class:up={fin.investments.reduce((a, i) => a + i.profit, 0) >= 0}
              class:down={fin.investments.reduce((a, i) => a + i.profit, 0) < 0}
            >
              {won(fin.investments.reduce((a, i) => a + i.profit, 0))}
            </strong>
          </p>
        {/if}
      </section>
    {/if}
  </div>
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

  h3,
  p {
    margin: 0;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  /* 단계 + 잔액 — 이 화면에서 항상 참인 사실 하나 */
  .stage {
    display: grid;
    gap: 1px;
    border-left: 3px solid var(--t-dark);
    padding-left: 10px;
  }
  .stage strong {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--ink);
  }
  .stage span {
    font-size: 11.5px;
    color: var(--ink-mute);
  }

  .board {
    min-height: 0;
    overflow: hidden;
  }

  .overview-grid {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 12px;
    min-height: 0;
    overflow: auto;
    display: grid;
    gap: 8px;
    align-content: start;
  }
  .panel h3 {
    font-size: 13px;
    font-weight: 800;
    color: var(--ink);
  }

  .err {
    border-left: 3px solid var(--bad);
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    align-content: start;
  }

  .kpi-grid article {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 8px 10px;
    display: grid;
    gap: 1px;
  }
  .kpi-grid span {
    color: var(--ink-mute);
    font-size: 10.5px;
  }
  .kpi-grid strong {
    color: var(--ink);
    font-size: 15px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  /* 돈은 늘고 주는 게 전부다 — 의미색을 쓰고 팀 색과 섞지 않는다 */
  .up {
    color: var(--ok);
  }
  .down {
    color: var(--bad);
  }

  .ledger-panel {
    grid-template-rows: auto auto minmax(0, 1fr);
  }
  .ledger-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-height: 0;
  }
  .ledger-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--line);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 1px;
  }
  li {
    border-bottom: 1px solid var(--line);
    padding: 7px 2px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    color: var(--ink-mid);
    font-size: 12px;
  }
  li:last-child {
    border-bottom: 0;
  }
  li strong {
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .sub {
    color: var(--ink-mute);
    font-size: 11.5px;
    line-height: 1.55;
  }
  .sub strong {
    color: var(--ink);
  }
  .sub code {
    background: var(--panel-sunk);
    border-radius: 2px;
    padding: 1px 4px;
    color: var(--ink-mid);
  }

  .offer {
    align-items: center;
  }
  .offer-left {
    display: grid;
    gap: 1px;
  }
  .offer-left strong {
    text-align: left;
  }
  .offer-left span {
    color: var(--ink-mute);
    font-size: 11px;
  }

  .act {
    border: 0;
    background: var(--t-accent);
    color: var(--ink-on-dark);
    border-radius: var(--radius);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .act:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .training-panel {
    grid-template-rows: auto auto minmax(0, 1fr) auto;
  }

  @media (max-width: 1100px) {
    .overview-grid,
    .ledger-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
