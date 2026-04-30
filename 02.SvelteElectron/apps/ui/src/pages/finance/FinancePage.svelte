<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";

  type FinanceTab = "overview" | "portfolio" | "support";
  type CashFlowItem = { label: string; amount: number; tone: "income" | "expense" };
  type AssetItem = { label: string; value: number; risk: "low" | "mid" | "high" };

  let tab: FinanceTab = "overview";
  let assets: AssetItem[] = [];

  const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

  $: p = $gameStore.protagonist;
  $: stage = p.careerStage;

  $: stageLabel =
    stage === "highschool" ? "고등학교" :
    stage === "university" ? "대학교" :
    stage === "military" ? "군 복무" : "프로";

  $: monthlyIncome = buildIncome(stage, p.condition, p.morale, p.pitching.ovr);
  $: monthlyExpense = buildExpense(stage, p.fatigue, $gameStore.schoolState.weeklyStudyMode);

  $: totalIncome = monthlyIncome.reduce((s, x) => s + x.amount, 0);
  $: totalExpense = monthlyExpense.reduce((s, x) => s + x.amount, 0);
  $: netCashflow = totalIncome - totalExpense;

  $: cash = 80 + p.grade * 12 + Math.round(p.morale * 0.6);
  $: savings = 140 + Math.round(p.pitching.ovr * 1.7);
  $: investments = stage === "pro" ? 220 + Math.round(p.pitching.ovr * 2.2) : Math.round(p.pitching.ovr * 0.5);

  $: assets = [
    { label: "현금", value: cash, risk: "low" },
    { label: "예금", value: savings, risk: "low" },
    { label: stage === "pro" ? "투자" : "교육/장비 적립", value: investments, risk: stage === "pro" ? "mid" : "low" },
  ];

  $: totalAsset = assets.reduce((s, x) => s + x.value, 0);
  $: savingRate = totalIncome > 0 ? ((netCashflow / totalIncome) * 100).toFixed(1) : "0.0";
  $: emergencyMonths = totalExpense > 0 ? (cash / totalExpense).toFixed(1) : "0.0";

  $: supportTitle = stage === "pro" ? "계약" : "지원 내역";
  $: primaryLine =
    stage === "highschool" ? "용돈 + 가족 지원 중심" :
    stage === "university" ? "용돈 + 장학금 중심" :
    stage === "military" ? "군 급여 중심" : "연봉 + 성과 보너스 중심";

  $: supportRows = buildSupportRows(stage, p.pitching.ovr, p.morale);

  function buildIncome(stageId: string, condition: number, morale: number, ovr: number): CashFlowItem[] {
    if (stageId === "highschool") {
      return [
        { label: "월 용돈", amount: 10, tone: "income" },
        { label: "가족 지원", amount: 24 + Math.round(morale * 0.08), tone: "income" },
        { label: "학교 활동 지원", amount: 8 + Math.round(condition * 0.05), tone: "income" },
      ];
    }
    if (stageId === "university") {
      return [
        { label: "월 용돈", amount: 30, tone: "income" },
        { label: "장학금", amount: 20 + Math.round(ovr * 0.25), tone: "income" },
        { label: "대회 지원금", amount: 12 + Math.round(condition * 0.07), tone: "income" },
      ];
    }
    if (stageId === "military") {
      return [
        { label: "군 급여", amount: 180, tone: "income" },
        { label: "포상/격려금", amount: 10 + Math.round(morale * 0.07), tone: "income" },
        { label: "외부 지원", amount: 6, tone: "income" },
      ];
    }
    return [
      { label: "연봉(월할)", amount: 520 + Math.round(ovr * 3.8), tone: "income" },
      { label: "경기/성과 보너스", amount: 70 + Math.round(condition * 1.1), tone: "income" },
      { label: "광고/스폰", amount: 18 + Math.round(morale * 0.35), tone: "income" },
    ];
  }

  function buildExpense(stageId: string, fatigue: number, studyMode: string): CashFlowItem[] {
    const trainCost = 18 + Math.round(fatigue * 0.15);
    const lifeCost = stageId === "pro" ? 140 : stageId === "military" ? 34 : 54;
    const studyCost = stageId === "highschool" || stageId === "university"
      ? (studyMode === "hard" ? 20 : studyMode === "light" ? 8 : 13)
      : 0;

    const rows: CashFlowItem[] = [
      { label: "생활비", amount: lifeCost, tone: "expense" },
      { label: "개인 훈련비", amount: trainCost, tone: "expense" },
    ];

    if (studyCost > 0) rows.push({ label: "학업 관련 지출", amount: studyCost, tone: "expense" });
    if (stageId === "pro") rows.push({ label: "가족/매니지먼트", amount: 58, tone: "expense" });

    return rows;
  }

  function buildSupportRows(stageId: string, ovr: number, morale: number): Array<{ k: string; v: string }> {
    if (stageId === "pro") {
      const annual = 6200 + ovr * 35;
      const bonusCap = 900 + morale * 5;
      return [
        { k: "연봉", v: amountLabel(annual) },
        { k: "성과 보너스 상한", v: amountLabel(bonusCap) },
        { k: "잔여 기간", v: "2년" },
        { k: "조항", v: "성과 인센티브 + 팀 옵션" },
      ];
    }

    if (stageId === "military") {
      return [
        { k: "기본 급여", v: amountLabel(180) + " / 월" },
        { k: "포상 정책", v: "주간 성과 기반" },
        { k: "주요 지출", v: "개인 장비/휴가" },
        { k: "비고", v: "훈련 성실도에 따라 격려금" },
      ];
    }

    if (stageId === "university") {
      return [
        { k: "월 용돈", v: amountLabel(30) },
        { k: "장학금", v: amountLabel(20 + Math.round(ovr * 0.25)) },
        { k: "지원 조건", v: "출석/훈련 성실도 유지" },
        { k: "비고", v: "대회 성과 시 추가 지원" },
      ];
    }

    return [
      { k: "월 용돈", v: amountLabel(10) },
      { k: "가족 지원", v: amountLabel(24 + Math.round(morale * 0.08)) },
      { k: "지원 조건", v: "생활 규칙/훈련 태도" },
      { k: "비고", v: "학교 일정에 따라 변동" },
    ];
  }

  function amountLabel(value: number): string {
    return `${value.toLocaleString()}만`;
  }

  function riskLabel(value: AssetItem["risk"]): string {
    if (value === "low") return "저위험";
    if (value === "high") return "고위험";
    return "중위험";
  }

  function assetRatio(v: number): number {
    if (totalAsset <= 0) return 0;
    return clamp((v / totalAsset) * 100);
  }
</script>

<section class="page">
  <h2>{$t("page.finance")}</h2>

  <article class="card board">
    <header class="head">
      <div class="stage-chip">
        <strong>{stageLabel}</strong>
        <span>{primaryLine}</span>
      </div>
      <div class="tabs">
        <button class:active={tab === "overview"} on:click={() => (tab = "overview")}>개요</button>
        <button class:active={tab === "portfolio"} on:click={() => (tab = "portfolio")}>자산</button>
        <button class:active={tab === "support"} on:click={() => (tab = "support")}>{supportTitle}</button>
      </div>
    </header>

    {#if tab === "overview"}
      <div class="overview-grid">
        <section class="panel kpi-grid">
          <article><span>총 자산</span><strong>{amountLabel(totalAsset)}</strong></article>
          <article><span>월 수입</span><strong class="up">{amountLabel(totalIncome)}</strong></article>
          <article><span>월 지출</span><strong class="down">{amountLabel(totalExpense)}</strong></article>
          <article><span>월 순현금흐름</span><strong class:up={netCashflow >= 0} class:down={netCashflow < 0}>{amountLabel(netCashflow)}</strong></article>
          <article><span>저축률</span><strong>{savingRate}%</strong></article>
          <article><span>현금 커버</span><strong>{emergencyMonths}개월</strong></article>
        </section>

        <section class="panel ledger-panel">
          <h3>월간 현금흐름</h3>
          <div class="ledger-grid">
            <div>
              <p class="ledger-title up">수입</p>
              <ul>
                {#each monthlyIncome as item}
                  <li><span>{item.label}</span><strong>{amountLabel(item.amount)}</strong></li>
                {/each}
              </ul>
            </div>
            <div>
              <p class="ledger-title down">지출</p>
              <ul>
                {#each monthlyExpense as item}
                  <li><span>{item.label}</span><strong>{amountLabel(item.amount)}</strong></li>
                {/each}
              </ul>
            </div>
          </div>
        </section>
      </div>
    {:else if tab === "portfolio"}
      <section class="panel portfolio-panel">
        <h3>자산 구성</h3>
        <p class="sub">총 {amountLabel(totalAsset)} 기준</p>
        <ul>
          {#each assets as a}
            <li class="asset-row">
              <div class="asset-left">
                <strong>{a.label}</strong>
                <span>{amountLabel(a.value)} · {riskLabel(a.risk)}</span>
              </div>
              <div class="asset-bar-wrap">
                <div class="asset-bar" style={`width:${assetRatio(a.value)}%`}></div>
              </div>
              <p>{assetRatio(a.value).toFixed(1)}%</p>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <div class="support-grid">
        <section class="panel support-panel">
          <h3>{supportTitle}</h3>
          <ul>
            {#each supportRows as row}
              <li><span>{row.k}</span><strong>{row.v}</strong></li>
            {/each}
          </ul>
        </section>

        <section class="panel support-panel">
          <h3>재정 메모</h3>
          <ul>
            <li><span>핵심 포인트</span><strong>{primaryLine}</strong></li>
            <li><span>권장 운영</span><strong>월 순현금흐름 플러스 유지</strong></li>
            <li><span>리스크</span><strong>컨디션/피로도 악화 시 비용 증가</strong></li>
            <li><span>다음 단계</span><strong>주간 이벤트와 지출 자동 연동</strong></li>
          </ul>
        </section>
      </div>
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

  .tabs { display: flex; gap: 6px; }
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

  .overview-grid, .support-grid {
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
    overflow: hidden;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
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

  .ledger-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; }
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

  .portfolio-panel { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 8px; }
  .sub { color: #aac0e4; font-size: 11px; }

  .asset-row {
    display: grid;
    grid-template-columns: minmax(130px, 1fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  .asset-left { display: grid; gap: 2px; }
  .asset-left span { color: #9eb6de; font-size: 11px; }

  .asset-bar-wrap { height: 8px; border-radius: 999px; background: #20375c; overflow: hidden; }
  .asset-bar { height: 100%; border-radius: inherit; background: #6ea3ff; }

  .support-panel { display: grid; gap: 8px; }

  @media (max-width: 1100px) {
    .overview-grid, .support-grid, .ledger-grid { grid-template-columns: 1fr; }
  }
</style>
