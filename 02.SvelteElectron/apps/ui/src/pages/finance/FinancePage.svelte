<script lang="ts">
  type FinanceTab = "overview" | "portfolio" | "contract";

  type CashFlowItem = {
    label: string;
    amount: number;
    tone: "income" | "expense";
  };

  type PortfolioItem = {
    label: string;
    value: number;
    ratio: number;
    risk: "low" | "mid" | "high";
  };

  const monthlyIncome: CashFlowItem[] = [
    { label: "연봉(월할)", amount: 1250, tone: "income" },
    { label: "출전/성과 보너스", amount: 180, tone: "income" },
    { label: "광고/스폰", amount: 120, tone: "income" }
  ];

  const monthlyExpense: CashFlowItem[] = [
    { label: "생활비", amount: 190, tone: "expense" },
    { label: "개인 훈련비", amount: 140, tone: "expense" },
    { label: "가족 지원", amount: 120, tone: "expense" },
    { label: "차량/취미", amount: 90, tone: "expense" }
  ];

  const portfolio: PortfolioItem[] = [
    { label: "현금", value: 4200, ratio: 35, risk: "low" },
    { label: "예금/적금", value: 3600, ratio: 30, risk: "low" },
    { label: "펀드", value: 2100, ratio: 17.5, risk: "mid" },
    { label: "주식", value: 1500, ratio: 12.5, risk: "high" },
    { label: "부동산", value: 600, ratio: 5, risk: "mid" }
  ];

  const contractInfo = {
    currentSalary: 15000,
    bonusCap: 2600,
    yearsLeft: 2,
    expiresAt: "2028 시즌 종료",
    expectedRange: "1.8억 ~ 2.3억",
    clause: "성적 인센티브 + 옵션 1년"
  };

  let tab: FinanceTab = "overview";

  $: totalIncome = monthlyIncome.reduce((sum, item) => sum + item.amount, 0);
  $: totalExpense = monthlyExpense.reduce((sum, item) => sum + item.amount, 0);
  $: netCashflow = totalIncome - totalExpense;

  $: totalAsset = portfolio.reduce((sum, item) => sum + item.value, 0);
  $: savingRate = totalIncome > 0 ? ((netCashflow / totalIncome) * 100).toFixed(1) : "0.0";
  $: emergencyMonths = totalExpense > 0 ? (portfolio[0].value / totalExpense).toFixed(1) : "0.0";

  function amountLabel(value: number): string {
    return `${value.toLocaleString()}만`;
  }

  function riskLabel(value: PortfolioItem["risk"]): string {
    if (value === "low") return "저위험";
    if (value === "high") return "고위험";
    return "중위험";
  }
</script>

<section class="page">
  <h2>재정</h2>

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "overview"} on:click={() => (tab = "overview")}>재정 개요</button>
        <button class:active={tab === "portfolio"} on:click={() => (tab = "portfolio")}>포트폴리오</button>
        <button class:active={tab === "contract"} on:click={() => (tab = "contract")}>계약</button>
      </div>
    </header>

    {#if tab === "overview"}
      <div class="overview-grid">
        <section class="panel kpi-grid">
          <article><span>총 자산</span><strong>{amountLabel(totalAsset)}</strong></article>
          <article><span>월 수입</span><strong>{amountLabel(totalIncome)}</strong></article>
          <article><span>월 지출</span><strong>{amountLabel(totalExpense)}</strong></article>
          <article><span>월 순현금흐름</span><strong class:plus={netCashflow >= 0}>{amountLabel(netCashflow)}</strong></article>
          <article><span>저축률</span><strong>{savingRate}%</strong></article>
          <article><span>비상금 커버</span><strong>{emergencyMonths}개월</strong></article>
        </section>

        <section class="panel flow-panel">
          <h3>월간 현금흐름</h3>
          <div class="flow-cols">
            <div>
              <p class="title income">수입</p>
              <ul>
                {#each monthlyIncome as item}
                  <li><span>{item.label}</span><strong>{amountLabel(item.amount)}</strong></li>
                {/each}
              </ul>
            </div>
            <div>
              <p class="title expense">지출</p>
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
        <h3>개인 자산 포트폴리오</h3>
        <p class="sub">총 자산 {amountLabel(totalAsset)} 기준</p>
        <ul>
          {#each portfolio as asset}
            <li>
              <div class="left">
                <strong>{asset.label}</strong>
                <span>{amountLabel(asset.value)} · {riskLabel(asset.risk)}</span>
              </div>
              <div class="bar-wrap">
                <div class="bar" style={`width:${asset.ratio}%`}></div>
              </div>
              <p>{asset.ratio}%</p>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <div class="contract-grid">
        <section class="panel contract-panel">
          <h3>현재 계약</h3>
          <ul>
            <li><span>연봉</span><strong>{amountLabel(contractInfo.currentSalary)}</strong></li>
            <li><span>보너스 상한</span><strong>{amountLabel(contractInfo.bonusCap)}</strong></li>
            <li><span>잔여 계약</span><strong>{contractInfo.yearsLeft}년</strong></li>
            <li><span>만료 시점</span><strong>{contractInfo.expiresAt}</strong></li>
            <li><span>계약 조항</span><strong>{contractInfo.clause}</strong></li>
          </ul>
        </section>

        <section class="panel contract-panel">
          <h3>다음 계약 전망</h3>
          <p class="sub">현재 성적/기여도 기준 더미 추정</p>
          <div class="forecast-box">
            <span>예상 연봉 범위</span>
            <strong>{contractInfo.expectedRange}</strong>
          </div>
          <ul>
            <li>투구 이닝 유지 시 상단 범위 접근 가능</li>
            <li>볼넷 감소 시 옵션 연봉 상승 여지</li>
            <li>부상 리스크 관리가 핵심 변수</li>
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
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 22px;
  }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .board {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }

  .tabs {
    display: flex;
    gap: 6px;
  }

  .tabs button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .tabs button.active {
    background: #3262b0;
    border-color: #6da1f7;
  }

  .overview-grid,
  .contract-grid {
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
    gap: 6px;
  }

  .kpi-grid article {
    border: 1px solid #2e486f;
    border-radius: 8px;
    background: #152b4f;
    padding: 8px;
    display: grid;
    gap: 2px;
  }

  .kpi-grid span {
    color: #9eb6de;
    font-size: 11px;
  }

  .kpi-grid strong {
    color: #eff5ff;
    font-size: 14px;
  }

  .kpi-grid strong.plus {
    color: #79e0a2;
  }

  .flow-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
  }

  .flow-cols {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    min-height: 0;
  }

  .title {
    font-size: 13px;
    margin-bottom: 6px;
  }

  .title.income {
    color: #79e0a2;
  }

  .title.expense {
    color: #ffb68a;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }

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
    font-size: 13px;
  }

  li strong {
    color: #eef4ff;
    font-size: 13px;
  }

  .portfolio-panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 8px;
  }

  .sub {
    color: #aac0e4;
    font-size: 12px;
  }

  .portfolio-panel ul li {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  .left {
    display: grid;
    gap: 2px;
  }

  .left span {
    color: #9eb6de;
    font-size: 11px;
  }

  .bar-wrap {
    height: 8px;
    border-radius: 999px;
    background: #20375c;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    border-radius: inherit;
    background: #6ea3ff;
  }

  .contract-panel {
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .forecast-box {
    border: 1px solid #3b5f98;
    border-radius: 10px;
    background: #1a3157;
    padding: 10px;
    display: grid;
    gap: 3px;
  }

  .forecast-box span {
    color: #b5ccef;
    font-size: 12px;
  }

  .forecast-box strong {
    color: #f1f6ff;
    font-size: 16px;
  }

  @media (max-width: 1180px) {
    .overview-grid,
    .contract-grid,
    .flow-cols {
      grid-template-columns: 1fr;
    }

    .kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
