<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore, teamMap } from "../../shared/stores/master";
  import type { PitcherSeasonStats, BatterSeasonStats, PlayerSeasonStats } from "../../shared/types/save";

  type LeagueTab = "standings" | "leaderboard";
  type LbTab     = "pitcher" | "batter";

  let tab:      LeagueTab = "standings";
  let lbTab:    LbTab     = "pitcher";
  let selectedLeagueId: string = "";
  let lbLeagueId: string = "";

  $: myTeamId   = $gameStore.protagonist.teamId;
  $: myLeagueId = $gameStore.protagonist.leagueId;

  const PRO_LEAGUES = new Set([
    "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL",
    "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
  ]);

  $: lockedLeagueSet = (
    $gameStore.protagonist.careerStage === "highschool" &&
    ($gameStore.protagonist.grade ?? 1) <= 2
  ) ? PRO_LEAGUES : new Set<string>();

  function isLocked(lid: string): boolean {
    return lockedLeagueSet.has(lid);
  }

  $: if (!selectedLeagueId && myLeagueId) selectedLeagueId = myLeagueId;
  $: if (selectedLeagueId && isLocked(selectedLeagueId)) selectedLeagueId = myLeagueId;

  function tName(id: string): string {
    return $teamMap.get(id)?.name ?? id;
  }

  function leagueName(lid: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL:  "고교 리그",
      LEAGUE_UNIVERSITY:  "대학",
      LEAGUE_INDEPENDENT: "독립",
      LEAGUE_KBL:         "KBL",
      LEAGUE_ABL:         "ABL",
      LEAGUE_JBL:         "JBL",
    };
    return map[lid] ?? lid;
  }

  function lbLeagueName(lid: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL:  "고교리그",
      LEAGUE_UNIVERSITY:  "대학리그",
      LEAGUE_INDEPENDENT: "독립리그",
      LEAGUE_KBL:         "KBL",
      LEAGUE_ABL:         "ABL",
      LEAGUE_JBL:         "JBL",
    };
    return map[lid] ?? lid;
  }

  // ── HS 리그 순위표 A/B 분리 ────────────────────────────────────
  $: hsGroupAStandings = [...$seasonStore.standings]
    .filter((s) => ($seasonStore.hsGroupA ?? []).includes(s.teamId))
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  $: hsGroupBStandings = [...$seasonStore.standings]
    .filter((s) => ($seasonStore.hsGroupB ?? []).includes(s.teamId))
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

  // ── 멀티리그 순위표 ────────────────────────────────────────────
  $: allLeagueIds = (() => {
    const all = [
      myLeagueId,
      ...Object.keys($seasonStore.leagueState).filter((lid) => lid !== myLeagueId),
    ].filter(Boolean);
    if (lockedLeagueSet.size === 0) return all;
    return [
      ...all.filter((lid) => !lockedLeagueSet.has(lid)),
      ...all.filter((lid) =>  lockedLeagueSet.has(lid)),
    ];
  })();

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
  $: lbLeagueIds = (() => {
    const others = Object.keys($seasonStore.leagueState)
      .filter((lid) => lid !== myLeagueId && !lockedLeagueSet.has(lid));
    return [myLeagueId, ...others].filter(Boolean);
  })();

  $: if (!lbLeagueId && lbLeagueIds.length > 0) lbLeagueId = lbLeagueIds[0];

  $: {
    if (lbLeagueId) masterStore.loadEntities(lbLeagueId);
  }

  $: lbStats = (() => {
    if (!lbLeagueId) return {} as Record<string, PlayerSeasonStats>;
    const ls = $seasonStore.leagueState[lbLeagueId];
    const base: Record<string, PlayerSeasonStats> = ls?.stats ? { ...ls.stats } : {};
    if ($gameStore.protagonist.leagueId === lbLeagueId) {
      const hero = $seasonStore.stats[$gameStore.protagonist.id];
      if (hero) base[$gameStore.protagonist.id] = hero;
    }
    return base;
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
    if (id === $gameStore.protagonist.id) return $gameStore.protagonist.name;
    const e = $masterStore.entities.find((en) => en.id === id);
    return e?.name ?? id;
  }
  function entityTeam(id: string): string {
    if (id === $gameStore.protagonist.id) return tName($gameStore.protagonist.teamId);
    const e = $masterStore.entities.find((en) => en.id === id);
    return e ? tName(e.teamId) : "-";
  }

  $: pitcherRows = Object.entries(lbStats)
    .filter(([, s]) => s.type === "pitcher" && (s as PitcherSeasonStats).ip >= 10)
    .map(([id, s]) => {
      const p = s as PitcherSeasonStats;
      return { id, name: entityName(id), team: entityTeam(id), w: p.w, l: p.l, era: p.era, whip: p.whip, ip: p.ip, k: p.k, bb: p.bb };
    })
    .sort((a, b) => a.era - b.era)
    .slice(0, 20) as PitcherRow[];

  $: batterRows = Object.entries(lbStats)
    .filter(([, s]) => s.type === "batter" && (s as BatterSeasonStats).ab >= 20)
    .map(([id, s]) => {
      const b = s as BatterSeasonStats;
      return { id, name: entityName(id), team: entityTeam(id), avg: b.avg, hr: b.hr, rbi: b.rbi, ops: b.ops, ab: b.ab, h: b.h, bb: b.bb };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 20) as BatterRow[];
</script>

<section class="page">
  <h2>{$t("page.league")}</h2>

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "standings"}   on:click={() => (tab = "standings")}>리그 순위</button>
        <button class:active={tab === "leaderboard"} on:click={() => (tab = "leaderboard")}>스탯 순위</button>
      </div>
    </header>

    <!-- ── 리그 순위 ── -->
    {#if tab === "standings"}
      <section class="standings-layout">
        <nav class="league-nav">
          {#each allLeagueIds as lid}
            {@const locked = isLocked(lid)}
            <button
              class:active={!locked && selectedLeagueId === lid}
              class:locked={locked}
              on:click={() => { if (!locked) selectedLeagueId = lid; }}
              title={locked ? "3학년 진급 후 열람 가능" : undefined}
            >
              {#if locked}<span class="lock-icon">🔒</span>{/if}
              {leagueName(lid)}
              {#if !locked && lid === myLeagueId}<span class="my-badge">내 리그</span>{/if}
              {#if locked}<span class="lock-hint">3학년↑</span>{/if}
            </button>
          {/each}
        </nav>

        <div class="panel standings-panel">
          <h3>{leagueName(selectedLeagueId || myLeagueId)} 순위표</h3>
          <div class="standings-body">
            {#if (selectedLeagueId || myLeagueId) === "LEAGUE_HIGHSCHOOL"}
              {#each [{ label: "A조", rows: hsGroupAStandings }, { label: "B조", rows: hsGroupBStandings }] as group}
                <h4 class="group-label">{group.label}</h4>
                {#if group.rows.length === 0}
                  <p class="empty">아직 경기 데이터가 없습니다.</p>
                {:else}
                  <div class="tbl-wrap">
                    <table class="stbl full">
                      <thead>
                        <tr>
                          <th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th>
                          <th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each group.rows as s, i}
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
                  </div>
                {/if}
              {/each}
            {:else if selectedStandings.length === 0}
              <p class="empty">아직 경기 데이터가 없습니다.</p>
            {:else}
              <div class="tbl-wrap">
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
              </div>
            {/if}
          </div>
        </div>
      </section>

    <!-- ── 스탯 순위 ── -->
    {:else if tab === "leaderboard"}
      <section class="lb-layout">
        <nav class="league-nav">
          {#each lbLeagueIds as lid}
            <button class:active={lbLeagueId === lid} on:click={() => (lbLeagueId = lid)}>
              {lbLeagueName(lid)}
              {#if lid === myLeagueId}<span class="my-badge">내 리그</span>{/if}
            </button>
          {/each}
        </nav>

        <div class="lb-content panel">
          <div class="lb-tabs">
            <button class:active={lbTab === "pitcher"} on:click={() => (lbTab = "pitcher")}>투수</button>
            <button class:active={lbTab === "batter"}  on:click={() => (lbTab = "batter")}>타자</button>
          </div>

          {#if lbTab === "pitcher"}
            {#if pitcherRows.length === 0}
              <p class="empty" style="padding:16px">스탯 데이터가 아직 없습니다. (최소 10이닝 필요)</p>
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
              <p class="empty" style="padding:16px">스탯 데이터가 아직 없습니다. (최소 20타수 필요)</p>
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
                      <tr class:my-row={row.id === $gameStore.protagonist.id}>
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
        </div>
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

  .panel {
    border: 1px solid #2f486f;
    border-radius: 10px;
    background: #13223d;
    padding: 10px;
    min-height: 0;
    overflow: hidden;
  }

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
  .league-nav button.locked {
    opacity: 0.38;
    cursor: not-allowed;
    border-color: #1e2e46;
    color: #506882;
  }
  .lock-icon { font-size: 10px; line-height: 1; }
  .lock-hint {
    font-size: 9px;
    color: #4a6278;
    letter-spacing: 0.3px;
  }

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

  .standings-body {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }

  .group-label {
    margin: 6px 0 2px;
    font-size: 12px;
    color: #9eb6de;
  }
  .group-label:first-child { margin-top: 0; }

  .tbl-wrap {
    overflow-x: auto;
  }

  /* 스탯 순위 레이아웃 */
  .lb-layout {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .lb-content {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
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
    .standings-layout { grid-template-columns: 80px 1fr; }
    .lb-layout { grid-template-columns: 80px 1fr; }
  }
</style>
