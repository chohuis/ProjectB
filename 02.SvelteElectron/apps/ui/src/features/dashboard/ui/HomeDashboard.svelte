<script lang="ts">
  export let morale: number;
  export let fatigue: number;
  export let upcoming: string[];

  const injuryRisk = 14;
  const rank = "1위";
  const nextGame = {
    dday: "D-2",
    opponent: "부산 마린 고",
    venue: "원정",
    starter: "우완 강속구형"
  };

  const pendingMessages = [
    "불펜 추가 세션 제안 (선택 대기)",
    "주말 선발 확정 공지"
  ];

  const pitchDev = {
    current: "체인지업",
    progress: 42,
    blocker: "유연성 60 필요 (현재 56)"
  };

  const riskAlerts = [
    "연속 고강도 2일째: 내일 회복 비중 권장",
    "피로도 35 이상 진입 시 제구 효율 하락 가능",
    "선택 대기 메시지 1건"
  ];

  const recentGames = ["W 5-2 (서울 프레스티지)", "W 6-4 (수원 퓨전)", "L 2-4 (부산 마린)"];

  function toneClass(value: number, type: "fatigue" | "risk") {
    const warn = type === "fatigue" ? 35 : 13;
    const danger = type === "fatigue" ? 50 : 20;
    if (value >= danger) return "danger";
    if (value >= warn) return "warn";
    return "safe";
  }
</script>

<section class="layout">
  <section class="kpi-row">
    <article class="kpi"><span>컨디션</span><strong>{morale}</strong></article>
    <article class="kpi"><span>피로</span><strong class={toneClass(fatigue, "fatigue")}>{fatigue}</strong></article>
    <article class="kpi"><span>부상위험</span><strong class={toneClass(injuryRisk, "risk")}>{injuryRisk}%</strong></article>
    <article class="kpi"><span>팀 순위</span><strong>{rank}</strong></article>
    <article class="kpi"><span>다음 경기</span><strong>{nextGame.dday}</strong></article>
  </section>

  <section class="main-grid">
    <article class="card action-card">
      <h3>오늘의 의사결정</h3>
      <div class="action-box">
        <p class="title">훈련 추천</p>
        <p>불펜 제구 세션 + 회복 슬롯 조합 권장</p>
      </div>
      <div class="action-box">
        <p class="title">구종 개발</p>
        <p>진행중: {pitchDev.current} ({pitchDev.progress}%)</p>
        <p class="hint">잠금 조건: {pitchDev.blocker}</p>
      </div>
      <div class="action-box">
        <p class="title">메시지</p>
        {#each pendingMessages as msg}
          <p>{msg}</p>
        {/each}
      </div>
      <button class="primary">오늘 루틴 실행</button>
    </article>

    <article class="card schedule-card">
      <h3>일정 및 경기</h3>
      <div class="next-game">
        <p><strong>{nextGame.dday}</strong> {nextGame.opponent}</p>
        <p>{nextGame.venue} · 예상 선발 {nextGame.starter}</p>
      </div>
      <div class="timeline">
        <p class="title">3일 일정</p>
        {#each upcoming.slice(0, 3) as item}
          <p>{item}</p>
        {/each}
      </div>
      <div class="timeline">
        <p class="title">최근 3경기</p>
        {#each recentGames as game}
          <p>{game}</p>
        {/each}
      </div>
    </article>

    <article class="card risk-card">
      <h3>리스크 센터</h3>
      <ul>
        {#each riskAlerts as alert}
          <li>{alert}</li>
        {/each}
      </ul>
      <div class="finance-snap">
        <p class="title">개인 재정 스냅샷</p>
        <p>월 순현금흐름: +1,130만</p>
        <p>계약 잔여: 2년</p>
      </div>
    </article>
  </section>
</section>

<style>
  .layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .kpi-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .kpi {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 8px 10px;
    display: grid;
    gap: 3px;
  }

  .kpi span {
    color: #9eb6de;
    font-size: 11px;
  }

  .kpi strong {
    color: #eef5ff;
    font-size: 16px;
  }

  .safe { color: #79e0a2; }
  .warn { color: #ffd78a; }
  .danger { color: #ff9b8a; }

  .main-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: 1.2fr 1fr 0.9fr;
    gap: 10px;
  }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 10px;
    min-height: 0;
    overflow: hidden;
    display: grid;
    align-content: start;
    gap: 8px;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 16px;
    color: #eff5ff;
  }

  .action-box,
  .next-game,
  .timeline,
  .finance-snap {
    border: 1px solid #2f486f;
    border-radius: 8px;
    background: #13223d;
    padding: 8px;
    display: grid;
    gap: 4px;
  }

  .title {
    color: #b8caea;
    font-size: 12px;
    font-weight: 600;
  }

  .hint {
    color: #9fb5db;
    font-size: 12px;
  }

  .card p {
    color: #dce5f7;
    font-size: 13px;
  }

  .primary {
    border: 1px solid #5e89d6;
    background: #2f5ea8;
    color: #f1f6ff;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    cursor: pointer;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
  }

  li {
    color: #dce5f7;
    font-size: 13px;
  }

  @media (max-width: 1280px) {
    .kpi-row {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .main-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
