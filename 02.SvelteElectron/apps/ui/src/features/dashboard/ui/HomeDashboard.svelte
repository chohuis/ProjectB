<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { teamMap } from "../../../shared/stores/master";

  $: protagonist = $gameStore.protagonist;
  $: myTeamId    = protagonist.teamId;
  $: fatigue     = protagonist.fatigue;
  $: condition   = protagonist.condition;
  $: morale      = protagonist.morale;

  // 다음 경기
  $: nextGame = $seasonStore.schedule.find((e) => e.isProtagonistGame && !e.result) ?? null;
  $: nextGameWeekDiff = nextGame ? nextGame.week - $seasonStore.currentWeek : null;
  $: nextGameLabel =
    nextGameWeekDiff === 0 ? "이번 주" :
    nextGameWeekDiff === 1 ? "다음 주" :
    nextGameWeekDiff !== null ? `${nextGameWeekDiff}주 후` : "없음";
  $: nextGameOpponent = nextGame
    ? ($teamMap.get(nextGame.homeTeamId === myTeamId ? nextGame.awayTeamId : nextGame.homeTeamId)?.name ?? "?")
    : "-";
  $: isHomeGame = nextGame ? nextGame.homeTeamId === myTeamId : false;

  // 팀 순위
  $: sortedStandings = [...$seasonStore.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  $: myRank = sortedStandings.findIndex((s) => s.teamId === myTeamId) + 1;
  $: rankLabel = myRank > 0 ? `${myRank}위` : "-";

  // 최근 3경기 결과
  $: recentGames = $seasonStore.schedule
    .filter((e) => e.isProtagonistGame && e.result)
    .slice(-3)
    .reverse()
    .map((e) => {
      const isHome  = e.homeTeamId === myTeamId;
      const my      = isHome ? e.result!.homeScore : e.result!.awayScore;
      const opp     = isHome ? e.result!.awayScore : e.result!.homeScore;
      const oppName = $teamMap.get(isHome ? e.awayTeamId : e.homeTeamId)?.name ?? "?";
      return `${my > opp ? "W" : "L"} ${my}-${opp} (${oppName})`;
    });

  // 선택 대기 메시지
  $: pendingMessages = $gameStore.mailbox
    .filter((m) => m.decision && m.decision.selectedOptionId === null)
    .map((m) => `${m.subject} (선택 대기)`);

  // 부상위험 추정 (피로 기반 프록시)
  $: injuryRisk = Math.min(99, Math.max(0, Math.round((fatigue - 55) * 0.9)));

  // 리스크 알림
  $: riskAlerts = [
    ...(fatigue > 70 ? [`피로도 ${fatigue} — 훈련 강도 조절 권장`] : []),
    ...(morale  < 40 ? [`사기 저하 (${morale}) — 회복 전략 필요`]   : []),
    ...(condition < 50 ? [`컨디션 저하 (${condition}) — 회복 집중 필요`] : []),
    ...(pendingMessages.length > 0 ? [`선택 대기 메시지 ${pendingMessages.length}건`] : []),
  ].slice(0, 4);

  function toneClass(value: number, type: "fatigue" | "risk") {
    const warn   = type === "fatigue" ? 35 : 10;
    const danger = type === "fatigue" ? 65 : 20;
    if (value >= danger) return "danger";
    if (value >= warn)   return "warn";
    return "safe";
  }
</script>

<section class="layout">
  <section class="kpi-row">
    <article class="kpi"><span>컨디션</span><strong>{condition}</strong></article>
    <article class="kpi"><span>피로</span><strong class={toneClass(fatigue, "fatigue")}>{fatigue}</strong></article>
    <article class="kpi"><span>부상위험</span><strong class={toneClass(injuryRisk, "risk")}>{injuryRisk}%</strong></article>
    <article class="kpi"><span>팀 순위</span><strong>{rankLabel}</strong></article>
    <article class="kpi"><span>다음 경기</span><strong>{nextGameLabel}</strong></article>
  </section>

  <section class="main-grid">
    <article class="card action-card">
      <h3>오늘의 의사결정</h3>
      {#if pendingMessages.length > 0}
        <div class="action-box alert">
          <p class="title">선택 대기</p>
          {#each pendingMessages as msg}
            <p>{msg}</p>
          {/each}
        </div>
      {:else}
        <div class="action-box">
          <p class="title">훈련 추천</p>
          <p>
            {#if fatigue > 70}
              피로도가 높습니다. 회복 프로그램 집중 권장
            {:else if morale < 50}
              사기 회복을 위해 가벼운 훈련 권장
            {:else}
              현재 선택된 훈련 계획을 유지하세요
            {/if}
          </p>
        </div>
      {/if}
      <div class="action-box">
        <p class="title">상태 요약</p>
        <p>사기 {morale} · 컨디션 {condition} · 피로 {fatigue}</p>
      </div>
    </article>

    <article class="card schedule-card">
      <h3>일정 및 경기</h3>
      {#if nextGame}
        <div class="next-game">
          <p><strong>{nextGameLabel}</strong> vs {nextGameOpponent}</p>
          <p>{isHomeGame ? "홈" : "원정"} · W{nextGame.week}</p>
        </div>
      {:else}
        <div class="next-game">
          <p>남은 경기가 없습니다</p>
        </div>
      {/if}
      <div class="timeline">
        <p class="title">예정 일정</p>
        {#each $gameStore.upcoming.slice(0, 3) as item}
          <p>{item}</p>
        {:else}
          <p>예정 없음</p>
        {/each}
      </div>
      <div class="timeline">
        <p class="title">최근 경기 결과</p>
        {#each recentGames as game}
          <p>{game}</p>
        {:else}
          <p>경기 기록 없음</p>
        {/each}
      </div>
    </article>

    <article class="card risk-card">
      <h3>리스크 센터</h3>
      {#if riskAlerts.length > 0}
        <ul>
          {#each riskAlerts as alert}
            <li>{alert}</li>
          {/each}
        </ul>
      {:else}
        <p class="safe-msg">특이사항 없음 — 현재 상태 양호</p>
      {/if}
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

  .safe   { color: #79e0a2; }
  .warn   { color: #ffd78a; }
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
  .timeline {
    border: 1px solid #2f486f;
    border-radius: 8px;
    background: #13223d;
    padding: 8px;
    display: grid;
    gap: 4px;
  }

  .action-box.alert {
    border-color: #8a6530;
    background: #2a1f0e;
  }

  .title {
    color: #b8caea;
    font-size: 12px;
    font-weight: 600;
  }

  .card p {
    color: #dce5f7;
    font-size: 13px;
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

  .safe-msg {
    color: #79e0a2;
    font-size: 13px;
    padding: 4px 0;
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
