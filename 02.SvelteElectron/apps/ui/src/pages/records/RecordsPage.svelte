<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore, teamMap } from "../../shared/stores/master";
  import type { PitcherSeasonStats, BatterSeasonStats, PlayerSeasonStats } from "../../shared/types/save";

  type RecordTab = "personal" | "team" | "standings" | "leaderboard";
  type Period    = "season" | "last10" | "last5";
  type LbTab     = "pitcher" | "batter";

  let tab:    RecordTab = "personal";
  let period: Period    = "season";
  let lbTab:  LbTab     = "pitcher";
  let selectedWeek: number | null = null;
  let selectedLeagueId: string = "";

  $: myTeamId   = $gameStore.protagonist.teamId;
  $: myLeagueId = $gameStore.protagonist.leagueId;

  // 초기 리그 선택
  $: if (!selectedLeagueId && myLeagueId) selectedLeagueId = myLeagueId;

  function tName(id: string): string {
    return $teamMap.get(id)?.name ?? id;
  }

  function leagueName(lid: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL:     "고교",
      LEAGUE_UNIVERSITY:     "대학",
      LEAGUE_INDEPENDENT:    "독립",
      LEAGUE_KBL:            "KBL",
      LEAGUE_ABL:            "ABL",
      LEAGUE_JBL:            "JBL",
    };
    if (lid === "LEAGUE_HIGHSCHOOL") {
      const hsGroupA = $seasonStore.hsGroupA ?? [];
      const isGroupA = hsGroupA.includes($gameStore.protagonist.teamId);
      return isGroupA ? "고등학교 A리그" : "고등학교 B리그";
    }
    if (lid === "LEAGUE_HIGHSCHOOL_NPC") {
      const hsGroupA = $seasonStore.hsGroupA ?? [];
      const isGroupA = hsGroupA.includes($gameStore.protagonist.teamId);
      return isGroupA ? "고등학교 B리그" : "고등학교 A리그";
    }
    return map[lid] ?? lid;
  }

  // ── 개인 경기 기록 ─────────────────────────────────────────────
  $: allGames = $seasonStore.schedule
    .filter((e) => e.isProtagonistGame && !!e.result)
    .slice()
    .sort((a, b) => b.week - a.week)
    .map((e) => {
      const isHome  = e.homeTeamId === myTeamId;
      const myScore = isHome ? e.result!.homeScore : e.result!.awayScore;
      const opScore = isHome ? e.result!.awayScore : e.result!.homeScore;
      const won     = e.result!.winnerId === myTeamId;
      return { week: e.week, isHome, oppId: isHome ? e.awayTeamId : e.homeTeamId, myScore, opScore, won };
    });

  function pickByPeriod<T>(rows: T[]): T[] {
    if (period === "last10") return rows.slice(0, 10);
    if (period === "last5")  return rows.slice(0, 5);
    return rows;
  }

  $: visibleGames  = pickByPeriod(allGames);
  $: selectedGame  = selectedWeek !== null
    ? visibleGames.find((g) => g.week === selectedWeek) ?? visibleGames[0] ?? null
    : visibleGames[0] ?? null;
  $: wins          = visibleGames.filter((g) => g.won).length;
  $: losses        = visibleGames.length - wins;
  $: winPct        = visibleGames.length > 0 ? (wins / visibleGames.length).toFixed(2) : "-";
  $: runsScored    = visibleGames.reduce((s, g) => s + g.myScore, 0);
  $: runsAllow     = visibleGames.reduce((s, g) => s + g.opScore, 0);

  // ── 소속팀 순위 (protagonist 리그) ─────────────────────────────
  $: sortedStandings = [...$seasonStore.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  $: myStanding      = $seasonStore.standings.find((s) => s.teamId === myTeamId);
  $: myRank          = sortedStandings.findIndex((s) => s.teamId === myTeamId) + 1;

  // ── 멀티리그 순위표 ────────────────────────────────────────────
  $: allLeagueIds = [
    myLeagueId,
    ...Object.keys($seasonStore.leagueState).filter((lid) => lid !== myLeagueId),
  ].filter(Boolean);

  function getLeagueStandings(lid: string) {
    if (lid === myLeagueId) {
      return [...$seasonStore.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    }
    return [...($seasonStore.leagueState[lid]?.standings ?? [])].sort(
      (a, b) => b.winPct - a.winPct || b.wins - a.wins,
    );
  }

  $: selectedStandings = getLeagueStandings(selectedLeagueId || myLeagueId);

  // ── 스탯 리더보드 ─────────────────────────────────────────────
  // 모든 리그 stats 통합
  $: allStats = (() => {
    const merged: Record<string, PlayerSeasonStats> = { ...$seasonStore.stats };
    for (const ls of Object.values($seasonStore.leagueState)) {
      for (const [id, st] of Object.entries(ls.stats)) {
        if (!merged[id]) merged[id] = st;
      }
    }
    return merged;
  })();

  interface PitcherRow {
    id: string; name: string; team: string;
    w: number; l: number; era: number; whip: number; ip: number; k: number; bb: number;
  }
  interface BatterRow {
    id: string; name: string; team: string;
    avg: number; hr: number; rbi: number; ops: number; ab: number; h: number; bb: number;
  }

  function entityName(id: string): string {
    const e = $masterStore.entities.find((en) => en.id === id);
    return e?.name ?? id;
  }
  function entityTeam(id: string): string {
    const e = $masterStore.entities.find((en) => en.id === id);
    return e ? tName(e.teamId) : "-";
  }

  $: pitcherRows = Object.entries(allStats)
    .filter(([, s]) => s.type === "pitcher" && (s as PitcherSeasonStats).ip >= 20)
    .map(([id, s]) => {
      const p = s as PitcherSeasonStats;
      return { id, name: entityName(id), team: entityTeam(id), w: p.w, l: p.l, era: p.era, whip: p.whip, ip: p.ip, k: p.k, bb: p.bb };
    })
    .sort((a, b) => a.era - b.era)
    .slice(0, 20) as PitcherRow[];

  $: batterRows = Object.entries(allStats)
    .filter(([, s]) => s.type === "batter" && (s as BatterSeasonStats).ab >= 50)
    .map(([id, s]) => {
      const b = s as BatterSeasonStats;
      return { id, name: entityName(id), team: entityTeam(id), avg: b.avg, hr: b.hr, rbi: b.rbi, ops: b.ops, ab: b.ab, h: b.h, bb: b.bb };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 20) as BatterRow[];

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
        <button class:active={tab === "personal"}   on:click={() => (tab = "personal")}>개인 기록</button>
        <button class:active={tab === "team"}       on:click={() => (tab = "team")}>소속팀</button>
        <button class:active={tab === "standings"}  on:click={() => (tab = "standings")}>리그 순위</button>
        <button class:active={tab === "leaderboard"} on:click={() => (tab = "leaderboard")}>스탯 순위</button>
      </div>
      {#if tab === "personal" || tab === "team"}
        <div class="period-box">
          <span>기간</span>
          <select bind:value={period}>
            <option value="season">시즌 전체</option>
            <option value="last10">최근 10경기</option>
            <option value="last5">최근 5경기</option>
          </select>
        </div>
      {/if}
    </header>

    <!-- ── 개인 기록 ── -->
    {#if tab === "personal"}
      <section class="content-grid">
        <section class="panel list-panel">
          <div class="list-head" style="grid-template-columns:0.4fr 0.5fr 1fr 0.35fr 0.35fr 0.35fr">
            <span>주차</span><span>홈/원정</span><span>상대</span><span>득점</span><span>실점</span><span>결과</span>
          </div>
          <div class="rows">
            {#if visibleGames.length === 0}
              <p class="empty">경기 기록이 없습니다.</p>
            {:else}
              {#each visibleGames as game}
                <button
                  class:selected={selectedGame?.week === game.week}
                  style="grid-template-columns:0.4fr 0.5fr 1fr 0.35fr 0.35fr 0.35fr"
                  on:click={() => (selectedWeek = game.week)}
                >
                  <span>W{game.week}</span>
                  <span>{game.isHome ? "홈" : "원정"}</span>
                  <strong>{tName(game.oppId)}</strong>
                  <span>{game.myScore}</span>
                  <span>{game.opScore}</span>
                  <span class={game.won ? "win" : "lose"}>{game.won ? "W" : "L"}</span>
                </button>
              {/each}
            {/if}
          </div>
        </section>
        <aside class="panel detail-panel">
          <h3>개인 경기 요약</h3>
          <p>{periodLabel(period)} 기준</p>
          <div class="kpi-grid">
            <div><span>경기수</span><strong>{visibleGames.length}</strong></div>
            <div><span>승</span><strong class="win-val">{wins}</strong></div>
            <div><span>패</span><strong class="lose-val">{losses}</strong></div>
            <div><span>승률</span><strong>{winPct}</strong></div>
            <div><span>팀 득점</span><strong>{runsScored}</strong></div>
            <div><span>팀 실점</span><strong>{runsAllow}</strong></div>
          </div>
          {#if selectedGame}
            <section class="game-note">
              <h4>W{selectedGame.week} vs {tName(selectedGame.oppId)}</h4>
              <p>{selectedGame.isHome ? "홈" : "원정"} · {selectedGame.myScore} : {selectedGame.opScore}</p>
              <p class="note">{selectedGame.won ? "승리" : "패배"}</p>
            </section>
          {/if}
        </aside>
      </section>

    <!-- ── 소속팀 기록 ── -->
    {:else if tab === "team"}
      <section class="content-grid">
        <section class="panel list-panel">
          <div class="list-head" style="grid-template-columns:0.4fr 1fr 0.5fr 0.35fr">
            <span>주차</span><span>상대</span><span>스코어</span><span>결과</span>
          </div>
          <div class="rows">
            {#if visibleGames.length === 0}
              <p class="empty">경기 기록이 없습니다.</p>
            {:else}
              {#each visibleGames as game}
                <button
                  class:selected={selectedGame?.week === game.week}
                  style="grid-template-columns:0.4fr 1fr 0.5fr 0.35fr"
                  on:click={() => (selectedWeek = game.week)}
                >
                  <span>W{game.week}</span>
                  <strong>{tName(game.oppId)}</strong>
                  <span>{game.myScore}-{game.opScore}</span>
                  <span class={game.won ? "win" : "lose"}>{game.won ? "W" : "L"}</span>
                </button>
              {/each}
            {/if}
          </div>
        </section>
        <aside class="panel detail-panel">
          <h3>{tName(myTeamId)}</h3>
          <div class="kpi-grid">
            <div><span>순위</span><strong>{myRank > 0 ? `${myRank}위` : "-"}</strong></div>
            <div><span>승-패-무</span><strong>{myStanding?.wins ?? 0}-{myStanding?.losses ?? 0}-{myStanding?.draws ?? 0}</strong></div>
            <div><span>승률</span><strong>{myStanding ? myStanding.winPct.toFixed(2) : "-"}</strong></div>
            <div><span>득점</span><strong>{myStanding?.runsFor ?? 0}</strong></div>
            <div><span>실점</span><strong>{myStanding?.runsAgainst ?? 0}</strong></div>
            <div><span>연속</span><strong>{myStanding?.streak || "-"}</strong></div>
            <div><span>최근10</span><strong>{myStanding?.last10 || "-"}</strong></div>
          </div>
          <h4 style="margin-top:8px">리그 순위표</h4>
          <table class="stbl">
            <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>승률</th><th>득실</th></tr></thead>
            <tbody>
              {#each sortedStandings as s, i}
                <tr class:my-row={s.teamId === myTeamId}>
                  <td>{i + 1}</td><td class="t-name">{tName(s.teamId)}</td>
                  <td>{s.wins}</td><td>{s.losses}</td>
                  <td>{s.winPct.toFixed(2)}</td><td>{s.runsFor}-{s.runsAgainst}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </aside>
      </section>

    <!-- ── 리그 순위 ── -->
    {:else if tab === "standings"}
      <section class="standings-layout">
        <!-- 리그 선택 사이드바 -->
        <nav class="league-nav">
          {#each allLeagueIds as lid}
            <button class:active={selectedLeagueId === lid} on:click={() => (selectedLeagueId = lid)}>
              {leagueName(lid)}
              {#if lid === myLeagueId}<span class="my-badge">내 리그</span>{/if}
            </button>
          {/each}
        </nav>

        <!-- 선택된 리그 순위표 -->
        <div class="panel standings-panel">
          <h3>{leagueName(selectedLeagueId || myLeagueId)} 순위표</h3>
          {#if selectedStandings.length === 0}
            <p class="empty">아직 경기 데이터가 없습니다.</p>
          {:else}
            <table class="stbl full">
              <thead>
                <tr>
                  <th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th>
                  <th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th>
                </tr>
              </thead>
              <tbody>
                {#each selectedStandings as s, i}
                  <tr class:my-row={s.teamId === myTeamId}>
                    <td>{i + 1}</td>
                    <td class="t-name">{tName(s.teamId)}</td>
                    <td class="w">{s.wins}</td>
                    <td class="l">{s.losses}</td>
                    <td>{s.draws}</td>
                    <td>{s.winPct.toFixed(2)}</td>
                    <td>{s.runsFor}</td>
                    <td>{s.runsAgainst}</td>
                    <td class:streak-w={s.streak.startsWith("W")} class:streak-l={s.streak.startsWith("L")}>
                      {s.streak || "-"}
                    </td>
                    <td>{s.last10 || "-"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </section>

    <!-- ── 스탯 순위 ── -->
    {:else if tab === "leaderboard"}
      <section class="lb-layout">
        <div class="lb-tabs">
          <button class:active={lbTab === "pitcher"} on:click={() => (lbTab = "pitcher")}>투수</button>
          <button class:active={lbTab === "batter"}  on:click={() => (lbTab = "batter")}>타자</button>
        </div>

        {#if lbTab === "pitcher"}
          {#if pitcherRows.length === 0}
            <p class="empty" style="padding:16px">스탯 데이터가 아직 없습니다. (최소 20이닝 필요)</p>
          {:else}
            <div class="lb-table-wrap">
              <table class="stbl full">
                <thead>
                  <tr>
                    <th>#</th><th>선수</th><th>팀</th>
                    <th>ERA</th><th>WHIP</th><th>이닝</th>
                    <th>승</th><th>패</th><th>K</th><th>BB</th>
                  </tr>
                </thead>
                <tbody>
                  {#each pitcherRows as row, i}
                    <tr class:my-row={row.id === $gameStore.protagonist.id}>
                      <td>{i + 1}</td>
                      <td class="t-name">{row.name}</td>
                      <td>{row.team}</td>
                      <td class="era">{row.era.toFixed(2)}</td>
                      <td>{row.whip.toFixed(2)}</td>
                      <td>{row.ip.toFixed(1)}</td>
                      <td class="w">{row.w}</td>
                      <td class="l">{row.l}</td>
                      <td>{row.k}</td>
                      <td>{row.bb}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

        {:else}
          {#if batterRows.length === 0}
            <p class="empty" style="padding:16px">스탯 데이터가 아직 없습니다. (최소 50타수 필요)</p>
          {:else}
            <div class="lb-table-wrap">
              <table class="stbl full">
                <thead>
                  <tr>
                    <th>#</th><th>선수</th><th>팀</th>
                    <th>AVG</th><th>OPS</th><th>HR</th>
                    <th>RBI</th><th>타수</th><th>안타</th><th>BB</th>
                  </tr>
                </thead>
                <tbody>
                  {#each batterRows as row, i}
                    <tr>
                      <td>{i + 1}</td>
                      <td class="t-name">{row.name}</td>
                      <td>{row.team}</td>
                      <td class="avg">{row.avg.toFixed(2).replace(/^0\./, ".")}</td>
                      <td>{row.ops.toFixed(2).replace(/^0\./, ".")}</td>
                      <td class="w">{row.hr}</td>
                      <td>{row.rbi}</td>
                      <td>{row.ab}</td>
                      <td>{row.h}</td>
                      <td>{row.bb}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/if}
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
  h3 { font-size: 14px; color: #d8e8ff; }
  h4 { font-size: 12px; color: #9eb6de; }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .tabs { display: flex; gap: 6px; flex-wrap: wrap; }

  .tabs button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .tabs button.active { background: #3262b0; border-color: #6da1f7; }

  .period-box { display: flex; gap: 6px; align-items: center; }
  .period-box span { color: #aac0e4; font-size: 12px; }
  .period-box select {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 12px;
  }

  /* 개인/소속팀 레이아웃 */
  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(240px, 1fr);
    gap: 10px;
    min-height: 0;
    overflow: hidden;
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

  .list-head {
    display: grid;
    color: #9fb4d8;
    padding: 0 6px;
    font-size: 11px;
    gap: 6px;
  }

  .rows {
    min-height: 0;
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 4px;
  }

  .rows button {
    display: grid;
    border: 1px solid #284269;
    background: #162a4a;
    border-radius: 8px;
    padding: 6px;
    color: #e4edff;
    text-align: left;
    cursor: pointer;
    font-size: 12px;
    gap: 6px;
    align-items: center;
  }
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

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .kpi-grid div {
    border: 1px solid #2e486f;
    border-radius: 8px;
    background: #152b4f;
    padding: 7px;
    display: grid;
    gap: 2px;
  }
  .kpi-grid span { color: #9eb6de; font-size: 11px; }
  .kpi-grid strong { color: #eff5ff; font-size: 14px; }

  .game-note { border-top: 1px solid #2b4467; padding-top: 8px; display: grid; gap: 4px; }
  .game-note h4 { color: #e6f0ff; font-size: 14px; }
  .note { color: #cfe0ff; font-size: 13px; }
  .empty { color: #9db2d8; font-size: 12px; padding: 4px; }

  /* 리그 순위 레이아웃 */
  .standings-layout {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .league-nav {
    display: grid;
    align-content: start;
    gap: 6px;
    overflow-y: auto;
  }

  .league-nav button {
    border: 1px solid #2d4870;
    background: #172540;
    color: #b0c8ee;
    border-radius: 8px;
    padding: 8px 6px;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    display: grid;
    gap: 2px;
  }
  .league-nav button.active { background: #2a4a80; border-color: #5c8fd8; color: #e8f0ff; }

  .my-badge {
    font-size: 10px;
    color: #f0e060;
    background: rgba(240,224,96,0.15);
    border-radius: 4px;
    padding: 1px 4px;
    display: block;
  }

  .standings-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    overflow: hidden;
  }

  /* 스탯 순위 레이아웃 */
  .lb-layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    min-height: 0;
    overflow: hidden;
  }

  .lb-tabs { display: flex; gap: 6px; }
  .lb-tabs button {
    border: 1px solid #2d4870;
    background: #172540;
    color: #b0c8ee;
    border-radius: 8px;
    padding: 5px 14px;
    font-size: 12px;
    cursor: pointer;
  }
  .lb-tabs button.active { background: #2a4a80; border-color: #5c8fd8; color: #e8f0ff; }

  .lb-table-wrap {
    min-height: 0;
    overflow-y: auto;
  }

  /* 공통 테이블 */
  .stbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .stbl.full { min-width: 560px; }

  .stbl thead th {
    color: #7a9ac8;
    padding: 5px 6px;
    text-align: center;
    border-bottom: 1px solid #2a3f62;
    white-space: nowrap;
    position: sticky;
    top: 0;
    background: #13223d;
  }

  .stbl tbody td {
    padding: 5px 6px;
    text-align: center;
    color: #b8ccec;
    border-bottom: 1px solid #1a2a44;
    white-space: nowrap;
  }

  .stbl .t-name { text-align: left; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
  .stbl .w { color: #79e0a2; font-weight: 700; }
  .stbl .l { color: #ffb68a; }
  .stbl .era { color: #79d8f0; font-weight: 700; }
  .stbl .avg { color: #f0c860; font-weight: 700; }

  .stbl tr.my-row td { color: #f0e060; font-weight: 700; background: rgba(240,224,96,0.06); }

  .streak-w { color: #79e0a2; font-weight: 700; }
  .streak-l { color: #ffb68a; font-weight: 700; }

  @media (max-width: 1180px) {
    .content-grid { grid-template-columns: 1fr; }
    .detail-panel { display: none; }
    .standings-layout { grid-template-columns: 80px 1fr; }
  }
</style>
