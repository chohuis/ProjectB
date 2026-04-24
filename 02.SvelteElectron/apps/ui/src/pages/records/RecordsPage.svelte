<script lang="ts">
  type RecordTab = "personal" | "team";
  type Period = "season" | "last30" | "last10";

  type PitchGameLog = {
    id: string;
    date: string;
    opponent: string;
    result: "W" | "L" | "ND";
    pitchCount: number;
    ip: string;
    k: number;
    bb: number;
    er: number;
    note: string;
  };

  type TeamGameLog = {
    id: string;
    date: string;
    opponent: string;
    score: string;
    result: "W" | "L";
    note: string;
  };

  const myTeam = {
    name: "서울 이노베이션 고",
    rank: "1위",
    wins: 16,
    losses: 6,
    winPct: 0.727,
    home: "9-3",
    away: "7-3",
    streak: "최근 5경기 4승 1패",
    runFor: 118,
    runAgainst: 79
  };

  const pitchLogs: PitchGameLog[] = [
    { id: "p1", date: "04/20", opponent: "서울 프레스티지", result: "W", pitchCount: 96, ip: "7.0", k: 8, bb: 1, er: 1, note: "7회 위기에서 연속 삼진" },
    { id: "p2", date: "04/13", opponent: "부산 마린", result: "W", pitchCount: 102, ip: "6.0", k: 7, bb: 2, er: 2, note: "슬라이더 결정구 비율 증가" },
    { id: "p3", date: "04/06", opponent: "강릉 웨이브", result: "ND", pitchCount: 91, ip: "5.2", k: 6, bb: 2, er: 2, note: "초반 투구수 관리 필요" },
    { id: "p4", date: "03/30", opponent: "대구 스피릿", result: "W", pitchCount: 104, ip: "6.1", k: 9, bb: 3, er: 1, note: "포심 구위 우세" },
    { id: "p5", date: "03/23", opponent: "인천 스카이", result: "L", pitchCount: 99, ip: "6.2", k: 9, bb: 1, er: 3, note: "초반 실점 이후 안정" },
    { id: "p6", date: "03/16", opponent: "수원 퓨전", result: "W", pitchCount: 88, ip: "5.1", k: 5, bb: 2, er: 2, note: "커맨드 회복" },
    { id: "p7", date: "03/09", opponent: "부산 마린", result: "ND", pitchCount: 93, ip: "6.0", k: 6, bb: 2, er: 2, note: "주자 견제 성공률 상승" },
    { id: "p8", date: "03/02", opponent: "강릉 웨이브", result: "W", pitchCount: 84, ip: "5.0", k: 4, bb: 1, er: 1, note: "빠른 이닝 소화" }
  ];

  const teamLogs: TeamGameLog[] = [
    { id: "t1", date: "04/20", opponent: "서울 프레스티지", score: "5-2", result: "W", note: "7회 3득점" },
    { id: "t2", date: "04/19", opponent: "수원 퓨전", score: "6-4", result: "W", note: "불펜 무실점" },
    { id: "t3", date: "04/13", opponent: "부산 마린", score: "2-4", result: "L", note: "중반 실점 집중" },
    { id: "t4", date: "04/06", opponent: "강릉 웨이브", score: "4-1", result: "W", note: "선발 6이닝 1실점" },
    { id: "t5", date: "03/30", opponent: "대구 스피릿", score: "7-3", result: "W", note: "장타 3개" },
    { id: "t6", date: "03/23", opponent: "인천 스카이", score: "3-5", result: "L", note: "수비 실책 2회" }
  ];

  let tab: RecordTab = "personal";
  let period: Period = "season";
  let selectedPitchLogId = pitchLogs[0].id;
  let selectedTeamLogId = teamLogs[0].id;

  function pickByPeriod<T>(rows: T[]): T[] {
    if (period === "last10") return rows.slice(0, 10);
    if (period === "last30") return rows.slice(0, 6);
    return rows;
  }

  $: visiblePitchLogs = pickByPeriod(pitchLogs);
  $: visibleTeamLogs = pickByPeriod(teamLogs);

  $: selectedPitchLog =
    visiblePitchLogs.find((item) => item.id === selectedPitchLogId) ?? visiblePitchLogs[0] ?? null;

  $: selectedTeamLog =
    visibleTeamLogs.find((item) => item.id === selectedTeamLogId) ?? visibleTeamLogs[0] ?? null;

  $: pitchSummary = {
    games: visiblePitchLogs.length,
    avgPitchCount:
      visiblePitchLogs.length > 0
        ? (visiblePitchLogs.reduce((sum, item) => sum + item.pitchCount, 0) / visiblePitchLogs.length).toFixed(1)
        : "0.0",
    totalK: visiblePitchLogs.reduce((sum, item) => sum + item.k, 0),
    totalBB: visiblePitchLogs.reduce((sum, item) => sum + item.bb, 0)
  };

  $: kbb = pitchSummary.totalBB > 0
    ? (pitchSummary.totalK / pitchSummary.totalBB).toFixed(2)
    : "-";

  function periodLabel(value: Period): string {
    if (value === "last10") return "최근 10경기";
    if (value === "last30") return "최근 30일";
    return "시즌 전체";
  }
</script>

<section class="page">
  <h2>기록</h2>

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "personal"} on:click={() => (tab = "personal")}>개인 기록</button>
        <button class:active={tab === "team"} on:click={() => (tab = "team")}>소속팀 기록</button>
      </div>

      <div class="period-box">
        <span>조회 기간</span>
        <select bind:value={period}>
          <option value="season">시즌 전체</option>
          <option value="last30">최근 30일</option>
          <option value="last10">최근 10경기</option>
        </select>
      </div>
    </header>

    {#if tab === "personal"}
      <section class="content-grid">
        <section class="panel list-panel">
          <div class="list-head pitch">
            <span>날짜</span><span>상대</span><span>결과</span><span>투구수</span><span>IP</span><span>K</span><span>BB</span>
          </div>
          <div class="rows">
            {#if visiblePitchLogs.length === 0}
              <p class="empty">기록이 없습니다.</p>
            {:else}
              {#each visiblePitchLogs as game}
                <button class:selected={selectedPitchLog?.id === game.id} on:click={() => (selectedPitchLogId = game.id)}>
                  <span>{game.date}</span>
                  <strong>{game.opponent}</strong>
                  <span class={game.result === "W" ? "win" : game.result === "L" ? "lose" : "draw"}>{game.result}</span>
                  <span>{game.pitchCount}</span>
                  <span>{game.ip}</span>
                  <span>{game.k}</span>
                  <span>{game.bb}</span>
                </button>
              {/each}
            {/if}
          </div>
        </section>

        <aside class="panel detail-panel">
          <h3>개인 투구 기록 요약</h3>
          <p>{periodLabel(period)} 기준</p>
          <div class="detail-metrics">
            <div><span>경기수</span><strong>{pitchSummary.games}</strong></div>
            <div><span>평균 투구수</span><strong>{pitchSummary.avgPitchCount}</strong></div>
            <div><span>총 삼진</span><strong>{pitchSummary.totalK}</strong></div>
            <div><span>총 볼넷</span><strong>{pitchSummary.totalBB}</strong></div>
            <div><span>K/BB</span><strong>{kbb}</strong></div>
          </div>

          {#if selectedPitchLog}
            <section class="game-note">
              <h4>{selectedPitchLog.date} vs {selectedPitchLog.opponent}</h4>
              <p>투구수 {selectedPitchLog.pitchCount} · {selectedPitchLog.ip}이닝 · 실점 {selectedPitchLog.er}</p>
              <p class="note">메모: {selectedPitchLog.note}</p>
            </section>
          {/if}
        </aside>
      </section>
    {:else}
      <section class="content-grid">
        <section class="panel team-summary">
          <h3>{myTeam.name}</h3>
          <p>{periodLabel(period)} 기준 팀 성적</p>
          <div class="detail-metrics">
            <div><span>순위</span><strong>{myTeam.rank}</strong></div>
            <div><span>승-패</span><strong>{myTeam.wins}-{myTeam.losses}</strong></div>
            <div><span>승률</span><strong>{myTeam.winPct.toFixed(3)}</strong></div>
            <div><span>홈</span><strong>{myTeam.home}</strong></div>
            <div><span>원정</span><strong>{myTeam.away}</strong></div>
            <div><span>최근 흐름</span><strong>{myTeam.streak}</strong></div>
            <div><span>득점</span><strong>{myTeam.runFor}</strong></div>
            <div><span>실점</span><strong>{myTeam.runAgainst}</strong></div>
          </div>

          <div class="list-head team">
            <span>날짜</span><span>상대</span><span>스코어</span><span>결과</span>
          </div>
          <div class="rows">
            {#if visibleTeamLogs.length === 0}
              <p class="empty">기록이 없습니다.</p>
            {:else}
              {#each visibleTeamLogs as game}
                <button class:selected={selectedTeamLog?.id === game.id} on:click={() => (selectedTeamLogId = game.id)}>
                  <span>{game.date}</span>
                  <strong>{game.opponent}</strong>
                  <span>{game.score}</span>
                  <span class={game.result === "W" ? "win" : "lose"}>{game.result}</span>
                </button>
              {/each}
            {/if}
          </div>
        </section>

        <aside class="panel detail-panel">
          <h3>소속팀 경기 기록</h3>
          <p>{periodLabel(period)} 기준</p>
          {#if selectedTeamLog}
            <div class="detail-metrics">
              <div><span>상대</span><strong>{selectedTeamLog.opponent}</strong></div>
              <div><span>스코어</span><strong>{selectedTeamLog.score}</strong></div>
              <div><span>결과</span><strong>{selectedTeamLog.result}</strong></div>
            </div>
            <p class="note">하이라이트: {selectedTeamLog.note}</p>
          {/if}
        </aside>
      </section>
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
  h4,
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

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .tabs,
  .period-box {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .tabs button,
  .period-box select {
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

  .period-box span {
    color: #aac0e4;
    font-size: 12px;
  }

  .content-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(240px, 1fr);
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

  .list-panel,
  .team-summary {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
  }

  .list-head,
  .rows button {
    display: grid;
    gap: 6px;
    align-items: center;
    font-size: 12px;
  }

  .list-head.pitch,
  .rows button {
    grid-template-columns: 0.45fr 1fr 0.45fr 0.55fr 0.45fr 0.35fr 0.35fr;
  }

  .list-head.team {
    margin-top: 10px;
    grid-template-columns: 0.45fr 1fr 0.65fr 0.45fr;
  }

  .list-head {
    color: #9fb4d8;
    padding: 0 6px;
  }

  .rows {
    min-height: 0;
    overflow: hidden;
    display: grid;
    align-content: start;
    gap: 4px;
  }

  .rows button {
    border: 1px solid #284269;
    background: #162a4a;
    border-radius: 8px;
    padding: 7px 6px;
    color: #e4edff;
    text-align: left;
    cursor: pointer;
  }

  .rows button.selected {
    border-color: #79abf6;
    background: #1d3760;
  }

  .rows button strong {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .win {
    color: #79e0a2;
    font-weight: 700;
  }

  .lose {
    color: #ffb68a;
    font-weight: 700;
  }

  .draw {
    color: #d5e3ff;
    font-weight: 700;
  }

  .detail-panel {
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .detail-panel > p {
    color: #b4c8ea;
    font-size: 13px;
  }

  .detail-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .detail-metrics div {
    border: 1px solid #2e486f;
    border-radius: 8px;
    background: #152b4f;
    padding: 7px;
    display: grid;
    gap: 2px;
  }

  .detail-metrics span {
    color: #9eb6de;
    font-size: 11px;
  }

  .detail-metrics strong {
    color: #eff5ff;
    font-size: 14px;
  }

  .game-note {
    border-top: 1px solid #2b4467;
    padding-top: 8px;
    display: grid;
    gap: 4px;
  }

  .game-note h4 {
    color: #e6f0ff;
    font-size: 14px;
  }

  .note {
    color: #cfe0ff;
    font-size: 13px;
  }

  .empty {
    color: #9db2d8;
    font-size: 12px;
    padding: 8px;
  }

  @media (max-width: 1180px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .detail-panel {
      display: none;
    }
  }
</style>
