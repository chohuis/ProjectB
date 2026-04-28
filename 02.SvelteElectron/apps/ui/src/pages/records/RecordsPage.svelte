<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { teamMap } from "../../shared/stores/master";

  type RecordTab = "personal" | "team";
  type Period    = "season" | "last10" | "last5";

  let tab:    RecordTab = "personal";
  let period: Period    = "season";
  let selectedWeek: number | null = null;

  $: myTeamId = $gameStore.protagonist.teamId;

  function tName(id: string): string {
    return $teamMap.get(id)?.name ?? id;
  }

  // 주인공 경기 로그 (최신순)
  $: allGames = $seasonStore.schedule
    .filter((e) => e.isProtagonistGame && !!e.result)
    .slice()
    .sort((a, b) => b.week - a.week)
    .map((e) => {
      const isHome  = e.homeTeamId === myTeamId;
      const myScore = isHome ? e.result!.homeScore : e.result!.awayScore;
      const opScore = isHome ? e.result!.awayScore : e.result!.homeScore;
      const won     = e.result!.winnerId === myTeamId;
      return {
        week: e.week,
        isHome,
        oppId:   isHome ? e.awayTeamId : e.homeTeamId,
        myScore,
        opScore,
        won,
        result: won ? "W" : "L",
      };
    });

  function pickByPeriod<T>(rows: T[]): T[] {
    if (period === "last10") return rows.slice(0, 10);
    if (period === "last5")  return rows.slice(0, 5);
    return rows;
  }

  $: visibleGames = pickByPeriod(allGames);

  $: selectedGame = selectedWeek !== null
    ? visibleGames.find((g) => g.week === selectedWeek) ?? visibleGames[0] ?? null
    : visibleGames[0] ?? null;

  // 개인 요약
  $: totalGames = visibleGames.length;
  $: wins       = visibleGames.filter((g) => g.won).length;
  $: losses     = totalGames - wins;
  $: winPct     = totalGames > 0 ? (wins / totalGames).toFixed(3) : "-";
  $: runsScored = visibleGames.reduce((s, g) => s + g.myScore, 0);
  $: runsAllow  = visibleGames.reduce((s, g) => s + g.opScore, 0);

  // 소속팀 순위표
  $: sortedStandings = [...$seasonStore.standings].sort(
    (a, b) => b.winPct - a.winPct || b.wins - a.wins,
  );
  $: myStanding = $seasonStore.standings.find((s) => s.teamId === myTeamId);
  $: myRank     = sortedStandings.findIndex((s) => s.teamId === myTeamId) + 1;
  $: totalTeams = $seasonStore.standings.length;

  function periodLabel(value: Period): string {
    if (value === "last10") return "최근 10경기";
    if (value === "last5")  return "최근 5경기";
    return "시즌 전체";
  }
</script>

<section class="page">
  <h2>{$t("page.records")}</h2>

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "personal"} on:click={() => (tab = "personal")}>개인 기록</button>
        <button class:active={tab === "team"}     on:click={() => (tab = "team")}>소속팀 기록</button>
      </div>
      <div class="period-box">
        <span>조회 기간</span>
        <select bind:value={period}>
          <option value="season">시즌 전체</option>
          <option value="last10">최근 10경기</option>
          <option value="last5">최근 5경기</option>
        </select>
      </div>
    </header>

    {#if tab === "personal"}
      <section class="content-grid">
        <!-- 경기 목록 -->
        <section class="panel list-panel">
          <div class="list-head pitch">
            <span>주차</span><span>홈/원정</span><span>상대</span><span>득점</span><span>실점</span><span>결과</span>
          </div>
          <div class="rows">
            {#if visibleGames.length === 0}
              <p class="empty">경기 기록이 없습니다.</p>
            {:else}
              {#each visibleGames as game}
                <button
                  class:selected={selectedGame?.week === game.week}
                  on:click={() => (selectedWeek = game.week)}
                >
                  <span>W{game.week}</span>
                  <span>{game.isHome ? "홈" : "원정"}</span>
                  <strong>{tName(game.oppId)}</strong>
                  <span>{game.myScore}</span>
                  <span>{game.opScore}</span>
                  <span class={game.won ? "win" : "lose"}>{game.result}</span>
                </button>
              {/each}
            {/if}
          </div>
        </section>

        <!-- 요약 -->
        <aside class="panel detail-panel">
          <h3>개인 경기 요약</h3>
          <p>{periodLabel(period)} 기준</p>
          <div class="detail-metrics">
            <div><span>경기수</span><strong>{totalGames}</strong></div>
            <div><span>승</span><strong class="win-val">{wins}</strong></div>
            <div><span>패</span><strong class="lose-val">{losses}</strong></div>
            <div><span>승률</span><strong>{winPct}</strong></div>
            <div><span>팀 득점 합계</span><strong>{runsScored}</strong></div>
            <div><span>팀 실점 합계</span><strong>{runsAllow}</strong></div>
          </div>

          {#if selectedGame}
            <section class="game-note">
              <h4>W{selectedGame.week} vs {tName(selectedGame.oppId)}</h4>
              <p>{selectedGame.isHome ? "홈" : "원정"} · {selectedGame.myScore} : {selectedGame.opScore}</p>
              <p class="note">{selectedGame.won ? "승리" : "패배"}</p>
            </section>
          {/if}

          <p class="hint">※ 투구수·이닝 등 세부 스탯은 직접 플레이 모드에서 확인 가능합니다.</p>
        </aside>
      </section>

    {:else}
      <!-- 소속팀 탭 -->
      <section class="content-grid">
        <section class="panel team-summary">
          <h3>{tName(myTeamId)}</h3>
          <p>시즌 팀 성적</p>
          <div class="detail-metrics">
            <div><span>순위</span><strong>{myRank > 0 ? `${myRank} / ${totalTeams}위` : "-"}</strong></div>
            <div><span>승-패-무</span><strong>{myStanding?.wins ?? 0}-{myStanding?.losses ?? 0}-{myStanding?.draws ?? 0}</strong></div>
            <div><span>승률</span><strong>{myStanding ? myStanding.winPct.toFixed(3) : "-"}</strong></div>
            <div><span>득점</span><strong>{myStanding?.runsFor ?? 0}</strong></div>
            <div><span>실점</span><strong>{myStanding?.runsAgainst ?? 0}</strong></div>
            <div><span>최근 흐름</span><strong>{myStanding?.streak || "-"}</strong></div>
          </div>

          <!-- 팀 경기 목록 (=개인 경기 목록과 동일, 주인공팀이 참여한 모든 경기) -->
          <div class="list-head team">
            <span>주차</span><span>상대</span><span>스코어</span><span>결과</span>
          </div>
          <div class="rows">
            {#if visibleGames.length === 0}
              <p class="empty">경기 기록이 없습니다.</p>
            {:else}
              {#each visibleGames as game}
                <button
                  class:selected={selectedGame?.week === game.week}
                  on:click={() => (selectedWeek = game.week)}
                >
                  <span>W{game.week}</span>
                  <strong>{tName(game.oppId)}</strong>
                  <span>{game.myScore}-{game.opScore}</span>
                  <span class={game.won ? "win" : "lose"}>{game.result}</span>
                </button>
              {/each}
            {/if}
          </div>
        </section>

        <!-- 리그 순위표 -->
        <aside class="panel detail-panel">
          <h3>리그 순위표</h3>
          {#if sortedStandings.length === 0}
            <p class="empty">순위 데이터 없음</p>
          {:else}
            <table class="standings-table">
              <thead>
                <tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>승률</th><th>득실</th></tr>
              </thead>
              <tbody>
                {#each sortedStandings as s, i}
                  <tr class:my-row={s.teamId === myTeamId}>
                    <td>{i + 1}</td>
                    <td class="t-name">{tName(s.teamId)}</td>
                    <td>{s.wins}</td>
                    <td>{s.losses}</td>
                    <td>{s.winPct.toFixed(3)}</td>
                    <td>{s.runsFor}-{s.runsAgainst}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
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

  h2, h3, h4, p { margin: 0; }
  h2 { font-size: 22px; }

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

  .tabs, .period-box {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .tabs button, .period-box select {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .tabs button.active { background: #3262b0; border-color: #6da1f7; }
  .period-box span { color: #aac0e4; font-size: 12px; }

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

  .list-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
  }

  .team-summary {
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr);
    gap: 6px;
  }

  .list-head {
    color: #9fb4d8;
    padding: 0 6px;
    font-size: 12px;
  }

  .list-head.pitch { display: grid; grid-template-columns: 0.4fr 0.5fr 1fr 0.35fr 0.35fr 0.35fr; gap: 6px; }
  .list-head.team  { display: grid; grid-template-columns: 0.4fr 1fr 0.5fr 0.35fr; gap: 6px; margin-top: 4px; }

  .rows {
    min-height: 0;
    overflow-y: auto;
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
    font-size: 12px;
    align-items: center;
  }

  .list-head.pitch + .rows button,
  .rows button { display: grid; gap: 6px; }

  .list-panel .rows button { grid-template-columns: 0.4fr 0.5fr 1fr 0.35fr 0.35fr 0.35fr; }
  .team-summary .rows button { grid-template-columns: 0.4fr 1fr 0.5fr 0.35fr; }

  .rows button.selected { border-color: #79abf6; background: #1d3760; }
  .rows button strong { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .win  { color: #79e0a2; font-weight: 700; }
  .lose { color: #ffb68a; font-weight: 700; }
  .win-val  { color: #79e0a2; }
  .lose-val { color: #ffb68a; }

  .detail-panel {
    display: grid;
    align-content: start;
    gap: 8px;
    overflow-y: auto;
  }

  .detail-panel > p { color: #b4c8ea; font-size: 13px; }

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

  .detail-metrics span { color: #9eb6de; font-size: 11px; }
  .detail-metrics strong { color: #eff5ff; font-size: 14px; }

  .game-note {
    border-top: 1px solid #2b4467;
    padding-top: 8px;
    display: grid;
    gap: 4px;
  }

  .game-note h4 { color: #e6f0ff; font-size: 14px; }
  .note { color: #cfe0ff; font-size: 13px; }
  .hint { color: #7090b8; font-size: 11px; }

  .empty { color: #9db2d8; font-size: 12px; padding: 8px; }

  /* 순위표 */
  .standings-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .standings-table thead th {
    color: #7a9ac8;
    padding: 5px 4px;
    text-align: center;
    border-bottom: 1px solid #2a3f62;
  }

  .standings-table tbody td {
    padding: 5px 4px;
    text-align: center;
    color: #b8ccec;
    border-bottom: 1px solid #1a2a44;
  }

  .standings-table .t-name { text-align: left; }

  .standings-table tr.my-row td {
    color: #f0e060;
    font-weight: 700;
    background: rgba(240, 224, 96, 0.07);
  }

  @media (max-width: 1180px) {
    .content-grid { grid-template-columns: 1fr; }
    .detail-panel { display: none; }
  }
</style>
