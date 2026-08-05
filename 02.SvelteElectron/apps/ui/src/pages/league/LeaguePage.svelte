<script lang="ts">
  import { get } from "svelte/store";
  import { isLeagueInScope, scopedLeagueIds } from "../../shared/config/releaseScope";
  import { visibleLeagueIds, leaderboardLeagueIds } from "../../shared/utils/leagueVisibility";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore, teamMap } from "../../shared/stores/master";
  import { leagueUiState, type LeagueTab, type TxCategory } from "../../shared/stores/leagueUiStore";
  import { splitByGroup } from "../../shared/utils/standingsGroups";
  import type { PitcherSeasonStats, BatterSeasonStats, PlayerSeasonStats } from "../../shared/types/save";
  import {
    categoriesFor, cardCategoriesFor, categoryByKey,
    qualificationOf, qualifies, rankBy, type LbRow, type StatCategory,
  } from "../../shared/utils/leaderboard";
  import { toRounds, seriesState, bestOfLabel, winsNeeded } from "../../shared/utils/bracket";
  import PlayerDetailModal from "../../features/player/ui/PlayerDetailModal.svelte";

  import type { LeagueTransactionRow } from "../../shared/types/save";

  type LbTab      = "pitcher" | "batter";

  // 탭 이동 후 돌아와도 선택 상태 유지 (leagueUiStore에서 복원)
  const _saved = get(leagueUiState);
  let tab:        LeagueTab  = _saved.tab;
  let lbTab:      LbTab      = "pitcher";
  let selectedLeagueId: string = "";
  let lbLeagueId: string = "";
  let txModalEntityId: string = "";

  $: myTeamId   = $gameStore.protagonist.teamId;
  $: myLeagueId = $gameStore.protagonist.leagueId;

  const PRO_LEAGUES = new Set([
    "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL",
    "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
    "LEAGUE_KBL_FARM", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM",
  ]);

  $: lockedLeagueSet = new Set<string>();

  function isLocked(lid: string): boolean {
    return lockedLeagueSet.has(lid);
  }

  $: if (!selectedLeagueId && myLeagueId) selectedLeagueId = myLeagueId;
  $: if (selectedLeagueId && isLocked(selectedLeagueId)) selectedLeagueId = myLeagueId;

  // ── 리그 기록 탭 ─────────────────────────────────────────────
  const TX_LEAGUES = scopedLeagueIds(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
  const TX_CAT_LABEL: Record<TxCategory, string> = {
    all: "전체", trade: "트레이드", fa: "FA", draft: "드래프트", military: "병역", retirement: "은퇴",
  };
  const TX_ICON: Record<string, string> = {
    trade: "TR", fa: "FA", draft: "DR", military: "MIL", retirement: "RT",
  };

  function txMilIcon(detail?: string | null): string {
    if (detail === "체육부대 입대") return "SPT";
    if (detail === "전역") return "EXP";
    return "MIL";
  }

  // ── 공통 년도 선택 ───────────────────────────────────────────
  let selectedYear: number = _saved.selectedYear;
  let historyYears: number[] = [];

  // 히스토리 순위
  type HistStanding = {
    slot_id: string; season_year: number; league_id: string; team_id: string;
    wins: number; losses: number; draws: number; win_pct: number;
    runs_for: number; runs_against: number; streak: string; last10: string;
    group_label: string;
  };
  type HistPostseason = {
    slot_id: string; season_year: number; league_id: string;
    champion_id: string; runner_up_id: string; playoff_teams: string[];
  };
  type HistLbStat = {
    slot_id: string; season_year: number; league_id: string; player_id: string; stat_type: string;
    g: number; gs: number|null; w: number|null; l: number|null; sv: number|null; hd: number|null;
    ip: number|null; er: number|null; h_p: number|null; k_p: number|null; bb_p: number|null;
    era: number|null; whip: number|null;
    pa: number|null; ab: number|null; h_b: number|null; hr: number|null; rbi: number|null;
    sb: number|null; bb_b: number|null; k_b: number|null;
    avg_v: number|null; obp: number|null; slg: number|null; ops: number|null;
  };
  let historyStandings:  HistStanding[]  = [];
  let historyLbStats:    HistLbStat[]    = [];
  let historyPostseason: HistPostseason[] = [];

  async function loadHistoryYears() {
    const slotId = $gameStore.currentSlotId;
    if (!slotId) return;
    try {
      const res = JSON.parse(await window.projectB!.seasonGetHistoryYears(JSON.stringify({ slotId })));
      historyYears = Array.isArray(res) ? res : [];
      // 현재 시즌 순위 없고 과거 기록 있으면 가장 최근 연도 자동 선택
      if (historyYears.length > 0 && selectedYear === 0 && $seasonStore.standings.length === 0) {
        selectedYear = historyYears[0];
      }
    } catch { historyYears = []; }
  }

  async function loadHistoryData() {
    const slotId = $gameStore.currentSlotId;
    if (!slotId || selectedYear === 0) {
      historyStandings  = [];
      historyLbStats    = [];
      historyPostseason = [];
      return;
    }
    try {
      const [sr, lr, pr] = await Promise.all([
        window.projectB!.seasonGetHistoryStandings(JSON.stringify({ slotId, seasonYear: selectedYear })),
        window.projectB!.seasonGetHistoryLbStats(JSON.stringify({ slotId, seasonYear: selectedYear })),
        window.projectB!.seasonGetHistoryPostseason(JSON.stringify({ slotId, seasonYear: selectedYear })),
      ]);
      historyStandings  = JSON.parse(sr) ?? [];
      historyLbStats    = JSON.parse(lr) ?? [];
      historyPostseason = JSON.parse(pr) ?? [];
    } catch { historyStandings = []; historyLbStats = []; historyPostseason = []; }
  }

  // 변경된 상태를 스토어에 동기화 (탭 이동 후 복원용)
  $: leagueUiState.set({ selectedYear, tab, txCategory, txLeagueId });

  $: selectedYear, loadHistoryData();
  $: tab, loadHistoryYears();

  $: histStandings = (() => {
    const lid = selectedLeagueId || myLeagueId;
    return historyStandings
      .filter(r => r.league_id === lid)
      .sort((a, b) => b.win_pct - a.win_pct || b.wins - a.wins);
  })();

  $: histPostseasonForLeague = (lid: string): HistPostseason | undefined =>
    historyPostseason.find(r => r.league_id === lid);


  // ── 리그 기록 탭 ─────────────────────────────────────────────
  let txLeagueId: string = _saved.txLeagueId;
  let txCategory: TxCategory = _saved.txCategory;
  let txRows: LeagueTransactionRow[] = [];
  let txAllYears: number[] = [];  // 카테고리 필터와 무관한 전체 연도 목록
  let txLoading = false;

  $: if (!txLeagueId && myLeagueId && TX_LEAGUES.includes(myLeagueId as typeof TX_LEAGUES[number])) {
    txLeagueId = myLeagueId;
  }
  $: if (!txLeagueId && TX_LEAGUES.length) txLeagueId = TX_LEAGUES[0];

  $: if (tab === "transactions") loadTransactions();

  async function loadTransactions() {
    const slotId = $gameStore.currentSlotId;
    if (!slotId || txLoading) return;
    txLoading = true;
    try {
      const res = JSON.parse(
        await window.projectB!.leagueGetTransactions(JSON.stringify({
          slotId,
          seasonYear: selectedYear > 0 ? selectedYear : undefined,
          category:   txCategory !== "all" ? txCategory : undefined,
          leagueId:   txLeagueId || undefined,
          limit: 200,
        }))
      ) as LeagueTransactionRow[];
      txRows = res;

      const allRes = JSON.parse(
        await window.projectB!.leagueGetTransactions(JSON.stringify({
          slotId,
          leagueId: txLeagueId || undefined,
          limit: 1000,
        }))
      ) as LeagueTransactionRow[];
      txAllYears = [...new Set(allRes.map((r) => r.seasonYear))].sort((a, b) => b - a);
    } finally {
      txLoading = false;
    }
  }

  $: txCategory, txLeagueId, selectedYear, tab === "transactions" && loadTransactions();

  function parseDraftPickOrder(detail?: string | null): number {
    if (!detail) return 999999;
    const round = parseInt(detail.match(/(\d+)라운드/)?.[1] ?? "999");
    const pick  = parseInt(detail.match(/(\d+)순위/)?.[1]  ?? "999");
    return round * 1000 + pick;
  }

  // 연도별 그룹핑 (드래프트 항목은 라운드/순위 순 정렬)
  $: txByYear = (() => {
    const map = new Map<number, LeagueTransactionRow[]>();
    for (const r of txRows) {
      const yr = r.seasonYear;
      if (!map.has(yr)) map.set(yr, []);
      map.get(yr)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([yr, rows]) => {
      const sorted = [...rows].sort((a, b) => {
        if (a.category === "draft" && b.category === "draft") {
          return parseDraftPickOrder(a.detail) - parseDraftPickOrder(b.detail);
        }
        return 0;
      });
      return [yr, sorted] as [number, LeagueTransactionRow[]];
    });
  })();

  // 트레이드 양쪽 레코드를 groupId 기준으로 묶음
  $: txGroupedRows = (rows: LeagueTransactionRow[]) => {
    const used = new Set<string>();
    const result: Array<{ rows: LeagueTransactionRow[]; category: string }> = [];
    for (const r of rows) {
      if (r.groupId && used.has(r.groupId)) continue;
      if (r.groupId) {
        used.add(r.groupId);
        const group = rows.filter((x) => x.groupId === r.groupId);
        result.push({ rows: group, category: r.category });
      } else {
        result.push({ rows: [r], category: r.category });
      }
    }
    return result;
  };

  const SPECIAL_TEAM_NAMES: Record<string, string> = {
    "TEAM_SPORTS_UNIT": "상무",
  };

  function txTeamName(id?: string | null): string {
    if (!id) return "";
    const direct = $teamMap.get(id)?.name;
    if (direct) return direct;
    if (SPECIAL_TEAM_NAMES[id]) return SPECIAL_TEAM_NAMES[id];
    if (id.endsWith("_2")) {
      const base = $teamMap.get(id.slice(0, -2) + "_1")?.name;
      if (base) return base + " 2군";
    }
    if (id.startsWith("LEAGUE_")) return leagueName(id);
    return id;
  }

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
      LEAGUE_KBL_FARM:    "KBL 2군",
      LEAGUE_ABL_FARM:    "ABL 마이너",
      LEAGUE_JBL_FARM:    "JBL 2군",
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
      LEAGUE_KBL_FARM:    "KBL 2군",
      LEAGUE_ABL_FARM:    "ABL 마이너",
      LEAGUE_JBL_FARM:    "JBL 2군",
    };
    return map[lid] ?? lid;
  }

  // ── ABL East/West, JBL CL/PL 분리 (현재 시즌) ─────────────────
  // 권역·조·컨퍼런스 분할 — 어떻게 나눌지는 refs 정본에서 읽는다
  $: stadiumName = (id: string) =>
    $masterStore.stadiums.find((x) => x.id === id)?.name ?? id.replace(/^STADIUM_/, "");
  $: standingsGroupsView =
    splitByGroup(selectedLeagueId || myLeagueId, selectedStandings, stadiumName);

  // ── ABL East/West, JBL CL/PL 분리 (히스토리) ─────────────────
  $: histGroupsView = splitByGroup(
    selectedLeagueId || myLeagueId, histStandings, stadiumName, (r) => r.team_id);

  // 어느 리그를 보일지는 `utils/leagueVisibility`가 정한다 — 화면 안에 두면
  // 전제가 낡아도 아무도 검사하지 못한다 (실제로 2군 리그가 그렇게 사라졌다)
  $: allLeagueIds = visibleLeagueIds({
    leagueState: $seasonStore.leagueState,
    myLeagueId,
    locked: lockedLeagueSet,
  });

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
  $: lbLeagueIds = leaderboardLeagueIds({
    leagueState: $seasonStore.leagueState,
    myLeagueId,
    locked: lockedLeagueSet,
  });

  $: if (!lbLeagueId && lbLeagueIds.length > 0) lbLeagueId = lbLeagueIds[0];

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

  // ── 순위 부문 (U6) ───────────────────────────────────────────
  //
  // ⚠ 예전엔 정렬이 **하나뿐**이었다 — 투수 ERA 오름차순, 타자 AVG 내림차순 고정.
  // 세이브 34개짜리 마무리는 ERA 20위 안에 못 들어 화면에 아예 없었다.
  // 부문 정의·자격 판정의 정본은 `utils/leaderboard`다.

  /** 규정이닝 산출용 — 팀이 소화한 경기 수. 팀마다 한두 경기 차이가 나 최대값을 쓴다 */
  $: lbGamesPlayed = (() => {
    const rows: Array<{ wins: number; losses: number; draws: number }> =
      selectedYear > 0
        ? historyStandings.filter((r) => r.league_id === lbLeagueId)
        : ($seasonStore.leagueState[lbLeagueId]?.standings ?? []);
    if (rows.length === 0) return 0;
    return Math.max(...rows.map((r) => r.wins + r.losses + r.draws));
  })();
  $: lbQual = qualificationOf(lbGamesPlayed);

  /** 과거 시즌 행(넓은 한 테이블)을 시즌 스탯 모양으로 되돌린다 */
  function histToStats(r: HistLbStat): PlayerSeasonStats {
    if (r.stat_type === "pitcher") {
      return {
        type: "pitcher", g: r.g, gs: r.gs ?? 0, w: r.w ?? 0, l: r.l ?? 0,
        sv: r.sv ?? 0, hd: r.hd ?? 0, ip: r.ip ?? 0, er: r.er ?? 0,
        h: r.h_p ?? 0, k: r.k_p ?? 0, bb: r.bb_p ?? 0,
        era: r.era ?? 0, whip: r.whip ?? 0,
      } satisfies PitcherSeasonStats;
    }
    return {
      type: "batter", g: r.g, pa: r.pa ?? 0, ab: r.ab ?? 0, h: r.h_b ?? 0,
      hr: r.hr ?? 0, rbi: r.rbi ?? 0, sb: r.sb ?? 0, bb: r.bb_b ?? 0, k: r.k_b ?? 0,
      avg: r.avg_v ?? 0, obp: r.obp ?? 0, slg: r.slg ?? 0, ops: r.ops ?? 0,
    } satisfies BatterSeasonStats;
  }

  $: lbRows = ((): LbRow[] => {
    const mk = (id: string, st: PlayerSeasonStats): LbRow => ({
      id, name: entityName(id), team: entityTeam(id),
      stats: st, qualified: qualifies(st, lbQual),
    });
    if (selectedYear > 0) {
      return historyLbStats
        .filter((r) => r.league_id === lbLeagueId && r.stat_type === lbTab)
        .map((r) => mk(r.player_id, histToStats(r)));
    }
    return Object.entries(lbStats)
      .filter(([, st]) => st.type === lbTab)
      .map(([id, st]) => mk(id, st));
  })();

  // 투타를 바꾸면 정렬 기준도 그쪽 부문으로 옮긴다 — 안 하면 빈 표가 나온다
  let lbSortKey = "era";
  $: if (categoryByKey(lbSortKey)?.side !== lbTab) {
    lbSortKey = lbTab === "pitcher" ? "era" : "avg";
  }
  $: lbColumns = categoriesFor(lbTab);
  $: lbCat = categoryByKey(lbSortKey) ?? lbColumns[0];
  $: lbSorted = rankBy(lbRows, lbCat);
  $: lbCards = cardCategoriesFor(lbTab).map((c) => ({ cat: c, rows: rankBy(lbRows, c, 5) }));

  /** 비율 부문은 자격자만 센다 — "몇 명 중 몇 위"가 맞아야 한다 */
  $: lbPool = lbCat.kind === "rate" ? lbRows.filter((r) => r.qualified).length : lbRows.length;

  function sortByCat(c: StatCategory) { lbSortKey = c.key; }

  // ── 포스트시즌 (U6) ──────────────────────────────────────────
  //
  // ⚠ `postseasonBrackets`에는 **완전한 대진**이 있었다 — 진출 경로·시리즈
  // 형식·승수까지. 그런데 그리는 화면이 한 곳도 없었다.
  let psLeagueId = "";
  $: if (!psLeagueId && myLeagueId) psLeagueId = myLeagueId;

  /** 대진을 가진 리그만 고르게 한다 — 고교엔 포스트시즌이 없다 */
  $: psLeagueIds = allLeagueIds.filter(
    (lid) => ($seasonStore.postseasonBrackets[lid]?.length ?? 0) > 0
      || historyPostseason.some((r) => r.league_id === lid));
  $: if (psLeagueIds.length > 0 && !psLeagueIds.includes(psLeagueId)) psLeagueId = psLeagueIds[0];

  $: psRounds = selectedYear > 0
    ? []
    : toRounds($seasonStore.postseasonBrackets[psLeagueId] ?? []);

  /** 과거 시즌은 대진이 아니라 결과만 남는다 — 저장하는 게 우승·준우승·진출팀뿐이다 */
  $: psHistory = selectedYear > 0
    ? historyPostseason.find((r) => r.league_id === psLeagueId) ?? null
    : null;

  /** 이름이 비면 "미정" — 앞 시리즈를 기다리는 자리다 */
  function psTeam(id: string): string {
    return id ? tName(id) : "미정";
  }
</script>

<!-- 제목("리그")을 뺐다 — 사이드바가 이미 그 이름이다 -->
<section class="page">

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "standings"}    on:click={() => (tab = "standings")}>리그 순위</button>
        <button class:active={tab === "leaderboard"}  on:click={() => (tab = "leaderboard")}>스탯 순위</button>
        <button class:active={tab === "postseason"}   on:click={() => (tab = "postseason")}>포스트시즌</button>
        <button class:active={tab === "transactions"} on:click={() => (tab = "transactions")}>리그 기록</button>
      </div>
      <select class="yr-select" bind:value={selectedYear}>
        <option value={0}>현재</option>
        {#each historyYears as yr}
          <option value={yr}>{yr}시즌</option>
        {/each}
      </select>
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
          <h3>{leagueName(selectedLeagueId || myLeagueId)} 순위표{selectedYear > 0 ? ` (${selectedYear}시즌)` : ""}</h3>
          <div class="standings-body">
            {#if selectedYear > 0}
              {#if histStandings.length === 0}
                <p class="empty">해당 시즌 순위 기록이 없습니다.</p>
              {:else}
                <div class="tbl-wrap">
                  <table class="stbl full">
                    <thead>
                      <tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th></tr>
                    </thead>
                    <tbody>
                      {#each histGroupsView as grp}
                        {#if grp.label}
                          <tr class="group-row"><td colspan="10">{grp.label} <span class="grp-n">{grp.rows.length}팀</span></td></tr>
                        {/if}
                        {#each grp.rows as r, i}
                          <tr>
                            <td>{i + 1}</td>
                            <td class="t-name">{tName(r.team_id)}</td>
                            <td class="w">{r.wins}</td><td class="l">{r.losses}</td><td>{r.draws}</td>
                            <td>{r.win_pct.toFixed(2)}</td><td>{r.runs_for}</td><td>{r.runs_against}</td>
                            <td class:streak-w={r.streak.startsWith("W")} class:streak-l={r.streak.startsWith("L")}>{r.streak || "-"}</td>
                            <td>{r.last10 || "-"}</td>
                          </tr>
                        {/each}
                      {/each}
                    </tbody>
                  </table>
                </div>
                {@const ps = histPostseasonForLeague(selectedLeagueId || myLeagueId)}
                {#if ps && ps.champion_id}
                  <div class="ps-history-card">
                    <span class="ps-hist-label">🏆 우승</span>
                    <span class="ps-hist-team">{tName(ps.champion_id)}</span>
                    {#if ps.runner_up_id}
                      <span class="ps-hist-sep">·</span>
                      <span class="ps-hist-label">준우승</span>
                      <span class="ps-hist-team">{tName(ps.runner_up_id)}</span>
                    {/if}
                    {#if ps.playoff_teams.length > 0}
                      <div class="ps-hist-playoff">
                        플레이오프: {ps.playoff_teams.map(id => tName(id)).join(" · ")}
                      </div>
                    {/if}
                  </div>
                {/if}
              {/if}
            {:else if selectedStandings.length === 0}
              <p class="empty">아직 경기 데이터가 없습니다.</p>
            {:else}
              <!-- 권역·조·컨퍼런스로 나눠 그린다. 어떻게 나눌지는
                   utils/standingsGroups가 refs 정본에서 읽는다 —
                   예전엔 ABL·JBL만 표를 따로 박아뒀고 고교 102팀·대학 50팀은
                   통짜 한 표였다 (리그 구조가 화면에 없었다) -->
              <div class="tbl-wrap">
                <table class="stbl full">
                  <thead>
                    <tr>
                      <th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th>
                      <th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each standingsGroupsView as grp}
                      {#if grp.label}
                        <tr class="group-row"><td colspan="10">{grp.label} <span class="grp-n">{grp.rows.length}팀</span></td></tr>
                      {/if}
                      {#each grp.rows as s, i}
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
          <div class="lb-top-row">
            <div class="u-subtabs">
              <button class:on={lbTab === "pitcher"} on:click={() => (lbTab = "pitcher")}>투수</button>
              <button class:on={lbTab === "batter"}  on:click={() => (lbTab = "batter")}>타자</button>
            </div>
            <!-- 규정을 숨기지 않는다 — "왜 저 선수가 없지"의 답이 여기 있다 -->
            {#if lbGamesPlayed > 0}
              <span class="qual-note u-num">
                {lbGamesPlayed}경기 · 규정 {lbTab === "pitcher" ? `${lbQual.ip}이닝` : `${lbQual.pa}타석`}
              </span>
            {/if}
          </div>

          {#if lbRows.length === 0}
            <p class="empty" style="padding:16px">스탯 기록이 아직 없습니다.</p>
          {:else}
            <!-- ── 부문별 TOP5 ── -->
            <div class="cards">
              {#each lbCards as { cat, rows }}
                <section class="lb-card">
                  <button class="lb-card-head" type="button" on:click={() => sortByCat(cat)}>
                    {cat.label}
                  </button>
                  {#if rows.length === 0}
                    <p class="lb-card-empty">자격자 없음</p>
                  {:else}
                    <ol class="lb-card-list">
                      {#each rows as r, i}
                        <li class:is-me={r.id === $gameStore.protagonist.id}>
                          <span class="rk u-num">{i + 1}</span>
                          <button class="nm" type="button" on:click={() => (txModalEntityId = r.id)}>{r.name}</button>
                          <span class="tm">{r.team}</span>
                          <span class="vl u-num">{cat.format(cat.value(r.stats))}</span>
                        </li>
                      {/each}
                    </ol>
                  {/if}
                </section>
              {/each}
            </div>

            <!-- ── 전체표 (머리를 눌러 정렬) ── -->
            <div class="lb-table-wrap">
              <table class="u-table lb-full">
                <thead>
                  <tr>
                    <th class="num">#</th>
                    <th>선수</th>
                    <th>팀</th>
                    {#each lbColumns as c}
                      <th class="num sortable" class:on={c.key === lbSortKey}>
                        <button type="button" on:click={() => sortByCat(c)}>
                          {c.label}{#if c.key === lbSortKey}<i>{c.dir === "asc" ? "▲" : "▼"}</i>{/if}
                        </button>
                      </th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each lbSorted as r, i}
                    <tr class:is-me={r.id === $gameStore.protagonist.id}>
                      <td class="num">{i + 1}</td>
                      <td>
                        <button class="nm" type="button" on:click={() => (txModalEntityId = r.id)}>{r.name}</button>
                        {#if !r.qualified}<span class="unq" title="규정 미달 — 비율 부문에서 빠진다">규정미달</span>{/if}
                      </td>
                      <td class="tm">{r.team}</td>
                      {#each lbColumns as c}
                        <td class="num" class:hi={c.key === lbSortKey}>{c.format(c.value(r.stats))}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- ── 포스트시즌 ── -->
    {#if tab === "postseason"}
      <section class="ps-layout">
        <nav class="league-nav">
          {#each psLeagueIds as lid}
            <button class:active={psLeagueId === lid} on:click={() => (psLeagueId = lid)}>
              {lbLeagueName(lid)}
              {#if lid === myLeagueId}<span class="my-badge">내 리그</span>{/if}
            </button>
          {:else}
            <span class="ps-none">포스트시즌이 있는 리그가 없습니다</span>
          {/each}
        </nav>

        <div class="panel ps-panel">
          {#if psHistory}
            <!-- 과거 시즌 — 저장된 건 결과뿐이다 -->
            <div class="ps-past">
              <div class="ps-champ">
                <span class="u-label">우승</span>
                <strong>{psTeam(psHistory.champion_id)}</strong>
              </div>
              {#if psHistory.runner_up_id}
                <div class="ps-runner">
                  <span class="u-label">준우승</span>
                  <strong>{psTeam(psHistory.runner_up_id)}</strong>
                </div>
              {/if}
              {#if psHistory.playoff_teams.length > 0}
                <p class="ps-teams">
                  <span class="u-label">진출</span>
                  {psHistory.playoff_teams.map((id) => psTeam(id)).join(" · ")}
                </p>
              {/if}
              <p class="ps-note">지난 시즌은 대진 과정이 아니라 결과만 남는다.</p>
            </div>

          {:else if psRounds.length === 0}
            <p class="empty" style="padding:16px">
              {selectedYear > 0 ? "이 시즌 포스트시즌 기록이 없습니다." : "아직 포스트시즌이 시작되지 않았습니다."}
            </p>

          {:else}
            <div class="bracket">
              {#each psRounds as r}
                <div class="br-round">
                  <p class="br-round-name">{r.label}</p>
                  <div class="br-series-list">
                    {#each r.series as sx}
                      {@const st = seriesState(sx)}
                      {@const need = winsNeeded(sx.bestOf)}
                      <article class="br-series" data-state={st}>
                        <div class="br-side"
                             class:win={sx.winner === sx.homeTeamId && !!sx.winner}
                             class:me={sx.homeTeamId === myTeamId}>
                          <span class="br-team">{psTeam(sx.homeTeamId)}</span>
                          <span class="br-wins u-num">{sx.homeWins}</span>
                        </div>
                        <div class="br-side"
                             class:win={sx.winner === sx.awayTeamId && !!sx.winner}
                             class:me={sx.awayTeamId === myTeamId}>
                          <span class="br-team">{psTeam(sx.awayTeamId)}</span>
                          <span class="br-wins u-num">{sx.awayWins}</span>
                        </div>
                        <p class="br-meta">
                          {bestOfLabel(sx.bestOf)}
                          {#if st === "live"}<span class="br-live">{need}승까지 {need - Math.max(sx.homeWins, sx.awayWins)}</span>
                          {:else if st === "waiting"}<span class="br-wait">대기</span>{/if}
                        </p>
                      </article>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- ── 거래 내역 ── -->
    {#if tab === "transactions"}
      <section class="tx-layout">
        <!-- 필터 바 -->
        <div class="tx-filters">
          <!-- 리그 선택 -->
          <div class="tx-filter-group">
            {#each TX_LEAGUES as lid}
              <button
                class="tx-filter-btn"
                class:tx-active={txLeagueId === lid}
                on:click={() => { txLeagueId = lid; }}
              >{leagueName(lid)}</button>
            {/each}
          </div>

          <!-- 카테고리 -->
          <div class="tx-filter-group">
            {#each (["all", "trade", "fa", "draft", "military", "retirement"] as TxCategory[]) as cat}
              <button
                class="tx-filter-btn"
                class:tx-active={txCategory === cat}
                on:click={() => { txCategory = cat; }}
              >{TX_CAT_LABEL[cat]}</button>
            {/each}
          </div>

          <!-- 연도 (상단 년도 선택기와 연동) -->
        </div>

        <!-- 거래 목록 -->
        <div class="tx-feed">
          {#if txLoading}
            <p class="tx-empty">불러오는 중…</p>
          {:else if txByYear.length === 0}
            <p class="tx-empty">거래 기록이 없습니다. 시즌이 진행되면 트레이드, FA, 드래프트 결과가 여기 표시됩니다.</p>
          {:else}
            {#each txByYear as [year, rows]}
              <div class="tx-year-group">
                <h3 class="tx-year-heading">{year}년</h3>
                {#each txGroupedRows(rows) as group}
                  <div class="tx-entry tx-cat-{group.category}">
                    <span class="tx-icon">{group.category === "military" ? txMilIcon(group.rows[0]?.detail) : (TX_ICON[group.category] ?? "·")}</span>
                    <div class="tx-body">
                      {#if group.category === "trade"}
                        <!-- 트레이드: 두 선수 한 줄 -->
                        {@const [r1, r2] = group.rows}
                        <span class="tx-tag tag-trade">트레이드</span>
                        <span class="tx-detail">
                          <strong class="player-link" on:dblclick|stopPropagation={() => { if (r1.playerId) txModalEntityId = r1.playerId; }} title="더블클릭: 선수 상세">{r1.playerName}</strong>
                          <span class="tx-arrow">{txTeamName(r1.fromTeamId)} → {txTeamName(r1.toTeamId)}</span>
                          {#if r2}
                            &nbsp;/&nbsp;
                            <strong class="player-link" on:dblclick|stopPropagation={() => { if (r2.playerId) txModalEntityId = r2.playerId; }} title="더블클릭: 선수 상세">{r2.playerName}</strong>
                            <span class="tx-arrow">{txTeamName(r2.fromTeamId)} → {txTeamName(r2.toTeamId)}</span>
                          {/if}
                        </span>
                        {#if group.rows[0].detail}
                          <span class="tx-reason">{group.rows[0].detail}</span>
                        {/if}
                      {:else if group.category === "fa"}
                        {@const r = group.rows[0]}
                        <span class="tx-tag tag-fa">FA</span>
                        <span class="tx-detail">
                          <strong class="player-link" on:dblclick|stopPropagation={() => { if (r.playerId) txModalEntityId = r.playerId; }} title="더블클릭: 선수 상세">{r.playerName}</strong>
                          {#if r.toTeamId}<span class="tx-arrow">→ {txTeamName(r.toTeamId)}</span>{/if}
                        </span>
                        {#if r.detail}<span class="tx-reason">{r.detail}</span>{/if}
                      {:else if group.category === "draft"}
                        {@const r = group.rows[0]}
                        <span class="tx-tag tag-draft">드래프트</span>
                        <span class="tx-detail">
                          <strong class="player-link" on:dblclick|stopPropagation={() => { if (r.playerId) txModalEntityId = r.playerId; }} title="더블클릭: 선수 상세">{r.playerName}</strong>
                          {#if r.toTeamId}<span class="tx-arrow">→ {txTeamName(r.toTeamId)}</span>{/if}
                        </span>
                        {#if r.detail}<span class="tx-reason">{r.detail}</span>{/if}
                      {:else if group.category === "military"}
                        {@const r = group.rows[0]}
                        {#if r.detail === "체육부대 입대"}
                          <span class="tx-tag tag-mil-sports">체육부대</span>
                        {:else if r.detail === "일반병 입대"}
                          <span class="tx-tag tag-mil-general">일반입대</span>
                        {:else if r.detail === "전역"}
                          <span class="tx-tag tag-mil-discharge">전역</span>
                        {:else}
                          <span class="tx-tag tag-military">병역</span>
                        {/if}
                        <span class="tx-detail">
                          <strong class="player-link" on:dblclick|stopPropagation={() => { if (r.playerId) txModalEntityId = r.playerId; }} title="더블클릭: 선수 상세">{r.playerName}</strong>
                          {#if r.detail !== "전역" && r.fromTeamId}<span class="tx-arrow">{txTeamName(r.fromTeamId)}</span>{/if}
                          {#if r.detail === "전역" && r.toTeamId}<span class="tx-arrow">→ {txTeamName(r.toTeamId)}</span>{/if}
                        </span>
                      {:else if group.category === "retirement"}
                        {@const r = group.rows[0]}
                        <span class="tx-tag tag-retirement">은퇴</span>
                        <span class="tx-detail">
                          <strong class="player-link" on:dblclick|stopPropagation={() => { if (r.playerId) txModalEntityId = r.playerId; }} title="더블클릭: 선수 상세">{r.playerName}</strong>
                          {#if r.fromTeamId}<span class="tx-arrow">{txTeamName(r.fromTeamId)}</span>{/if}
                        </span>
                        {#if r.detail}<span class="tx-reason">{r.detail}</span>{/if}
                      {/if}
                    </div>
                    {#if group.rows[0].week}
                      <span class="tx-week">W{group.rows[0].week}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/each}
          {/if}
        </div>
      </section>
    {/if}
  </article>
</section>

<PlayerDetailModal entityId={txModalEntityId} on:close={() => (txModalEntityId = "")} />

<style>
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h3, p { margin: 0; }

  .top-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .tabs { display: flex; gap: 5px; flex-wrap: wrap; }
  .tabs button {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    color: var(--ink-mute);
    font-size: 13.5px; font-weight: 700;
    padding: 8px 14px;
    cursor: pointer; white-space: nowrap;
  }
  .tabs button:hover { color: var(--ink); }
  .tabs button.active { color: var(--t-dark); border-bottom-color: var(--t-dark); }

  .yr-select {
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--ink);
    font-size: 12.5px; font-weight: 700;
    padding: 5px 11px; cursor: pointer; outline: none;
  }
  .yr-select:hover { border-color: var(--t-dark); }

  .board { display: grid; min-height: 0; overflow: hidden; }
  .card, .panel {
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  /* -- 리그 고르기 (왼쪽 세로 줄) -- */
  .standings-layout, .lb-layout, .ps-layout {
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .league-nav {
    display: flex; flex-direction: column; gap: 2px;
    min-height: 0; overflow-y: auto;
  }
  .league-nav button {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    background: none;
    border: 0;
    border-left: 3px solid transparent;
    color: var(--ink-mid);
    font-size: 12.5px;
    text-align: left;
    padding: 8px 10px;
    cursor: pointer;
  }
  .league-nav button:hover { background: var(--panel); color: var(--ink); }
  .league-nav button.active {
    background: var(--panel);
    border-left-color: var(--t-accent);
    color: var(--t-dark);
    font-weight: 800;
  }
  .league-nav button.locked { opacity: 0.4; cursor: default; }
  .my-badge {
    font-size: 9px; font-weight: 800; letter-spacing: 0.06em;
    background: var(--t-dark); color: var(--t-gold);
    border-radius: 2px; padding: 1px 5px; white-space: nowrap;
  }
  .lock-icon { font-size: 10px; color: var(--ink-mute); }
  .lock-hint { font-size: 10.5px; color: var(--ink-mute); padding: 6px 10px; line-height: 1.5; }

  /* -- 순위표 -- */
  .standings-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; }
  .standings-body { min-height: 0; overflow-y: auto; display: grid; gap: 12px; align-content: start; }
  .tbl-wrap { overflow-x: auto; }
  .group-row { display: flex; align-items: baseline; gap: 7px; margin-bottom: 4px; }
  .grp-n { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; color: var(--ink-mute); }

  .stbl {
    width: 100%; border-collapse: collapse;
    font-size: 12.5px; color: var(--ink-mid);
    font-variant-numeric: tabular-nums;
  }
  .stbl th {
    padding: 6px 8px; text-align: center;
    font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
    color: var(--ink-mute);
    border-bottom: 2px solid var(--t-dark);
    white-space: nowrap;
  }
  .stbl td {
    padding: 7px 8px; text-align: center;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  .stbl tbody tr:last-child td { border-bottom: 0; }
  .stbl tbody tr:hover { background: var(--panel-sunk); }
  .stbl .t-name { text-align: left; color: var(--ink); font-weight: 700; }

  /* 내 팀·내 행은 팀 색으로 반전한다 — `.u-table tr.is-me`와 같은 규칙 */
  .stbl tr.my-row td, .u-table tr.is-me td {
    background: var(--t-dark); color: var(--t-gold);
  }
  .stbl tr.my-row .t-name, .u-table tr.is-me .nm { color: var(--t-gold); }

  .streak-w { color: var(--ok); font-weight: 700; }
  .streak-l { color: var(--bad); font-weight: 700; }
  .stbl tr.my-row .streak-w, .stbl tr.my-row .streak-l { color: var(--t-gold); }

  /* -- 과거 시즌 포스트시즌 한 줄 (순위표 아래) -- */
  .ps-history-card {
    background: var(--panel-sunk);
    border-left: 3px solid var(--warn);
    border-radius: var(--radius);
    padding: 9px 12px;
    display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
    font-size: 12.5px;
  }
  .ps-hist-label { font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em; color: var(--ink-mute); }
  .ps-hist-team  { font-weight: 800; color: var(--ink); }
  .ps-hist-sep   { color: var(--line-strong); }
  .ps-hist-playoff { font-size: 11.5px; color: var(--ink-mute); width: 100%; }

  /* == 스탯 순위 == */
  .lb-content { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 10px; }
  .lb-top-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .qual-note { font-size: 10.5px; color: var(--ink-mute); }

  /* 부문별 TOP5 — "누가 1위인가"가 표를 뒤지지 않고 보여야 한다 */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
  }
  .lb-card {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 8px 10px;
    display: grid; gap: 5px; align-content: start;
  }
  .lb-card-head {
    background: none; border: 0; padding: 0 0 5px;
    border-bottom: 2px solid var(--t-dark);
    color: var(--ink); font-size: 11px; font-weight: 800;
    letter-spacing: 0.06em; text-align: left; cursor: pointer;
  }
  .lb-card-head:hover { color: var(--t-accent); }
  .lb-card-empty { font-size: 11px; color: var(--ink-mute); }
  .lb-card-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .lb-card-list li {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 5px;
    font-size: 11.5px;
  }
  .lb-card-list .rk { color: var(--ink-mute); font-size: 10px; font-weight: 800; }
  .lb-card-list .tm { display: none; }
  .lb-card-list .vl { color: var(--ink); font-weight: 800; }
  .lb-card-list li.is-me .vl, .lb-card-list li.is-me .nm { color: var(--t-accent); font-weight: 800; }

  /* 이름은 눌러서 선수 상세로 간다 — 파고들기 경로 */
  .nm {
    background: none; border: 0; padding: 0;
    color: var(--ink); font: inherit; font-weight: 600;
    cursor: pointer; text-align: left;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .nm:hover { color: var(--t-accent); text-decoration: underline; }

  .lb-table-wrap { min-height: 0; overflow: auto; }
  .lb-full { font-size: 12px; }
  .lb-full td { text-align: center; }
  .lb-full td:nth-child(2), .lb-full th:nth-child(2) { text-align: left; }
  .lb-full .tm { color: var(--ink-mute); font-size: 11px; }
  .lb-full th.sortable { padding: 0; }
  .lb-full th.sortable button {
    width: 100%;
    background: none; border: 0;
    color: inherit; font: inherit; letter-spacing: inherit;
    padding: 6px 8px; cursor: pointer; white-space: nowrap;
  }
  .lb-full th.sortable button:hover { color: var(--t-accent); }
  .lb-full th.sortable.on button { color: var(--t-dark); }
  .lb-full th.sortable i { font-style: normal; font-size: 8px; margin-left: 3px; }
  /* 지금 정렬 기준인 칸만 진하게 — 어느 순위를 보고 있는지 안 헷갈리게 */
  .lb-full td.hi { color: var(--ink); font-weight: 800; }
  .lb-full tr.is-me td.hi { color: var(--t-gold); }

  .unq {
    font-size: 9px; font-weight: 700;
    color: var(--ink-mute); background: var(--panel-sunk);
    border-radius: 2px; padding: 1px 5px; margin-left: 5px;
  }
  .u-table tr.is-me .unq { background: rgba(255,255,255,0.18); color: var(--ink-on-dark); }

  /* == 포스트시즌 == */
  .ps-panel { min-height: 0; overflow: auto; }
  .ps-none { font-size: 11.5px; color: var(--ink-mute); padding: 8px 10px; line-height: 1.5; }

  .bracket { display: flex; gap: 14px; align-items: stretch; min-width: min-content; }
  .br-round { display: flex; flex-direction: column; gap: 8px; min-width: 150px; }
  .br-round-name {
    font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--ink-mute); text-transform: uppercase;
    padding-bottom: 5px; border-bottom: 2px solid var(--t-dark);
  }
  /* 라운드가 오른쪽으로 갈수록 세로 가운데로 모인다 — 대진표 관습 */
  .br-series-list { display: flex; flex-direction: column; justify-content: space-around; gap: 8px; flex: 1; }

  .br-series {
    background: var(--panel-sunk);
    border-left: 3px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 7px 9px;
    display: grid; gap: 1px;
  }
  .br-series[data-state="live"]    { border-left-color: var(--t-accent); background: var(--panel); box-shadow: 0 1px 3px -1px rgba(15,29,61,0.2); }
  .br-series[data-state="done"]    { border-left-color: var(--ok); }
  .br-series[data-state="waiting"] { opacity: 0.55; }

  .br-side {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    font-size: 12px; color: var(--ink-mid);
    padding: 2px 0;
  }
  .br-team { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .br-wins { font-weight: 800; color: var(--ink); }
  /* 이긴 쪽만 진하게. 둘 다 진하면 누가 올라갔는지 안 보인다 */
  .br-side.win .br-team, .br-side.win .br-wins { color: var(--ok); font-weight: 800; }
  .br-side.me  .br-team { color: var(--t-dark); font-weight: 800; }
  .br-side.me.win .br-team { color: var(--ok); }

  .br-meta {
    font-size: 9.5px; color: var(--ink-mute);
    margin-top: 3px; padding-top: 4px;
    border-top: 1px solid var(--line);
    display: flex; justify-content: space-between; gap: 6px;
  }
  .br-live { color: var(--t-accent); font-weight: 800; }
  .br-wait { color: var(--ink-mute); }

  .ps-past { display: grid; gap: 10px; align-content: start; }
  .ps-champ, .ps-runner { display: flex; align-items: baseline; gap: 9px; }
  .ps-champ strong  { font-size: 20px; font-weight: 800; color: var(--ink); }
  .ps-runner strong { font-size: 14px; font-weight: 700; color: var(--ink-mid); }
  .ps-teams { font-size: 12.5px; color: var(--ink-mid); display: flex; gap: 9px; align-items: baseline; flex-wrap: wrap; }
  .ps-note  { font-size: 11px; color: var(--ink-mute); }

  /* == 리그 기록 == */
  .tx-layout { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 10px; min-height: 0; overflow: hidden; }
  .tx-filters { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
  .tx-filter-group { display: flex; gap: 4px; flex-wrap: wrap; }
  .tx-filter-btn {
    background: none;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink-mid);
    font-size: 11.5px;
    padding: 4px 11px;
    cursor: pointer; white-space: nowrap;
  }
  .tx-filter-btn:hover { border-color: var(--line-strong); color: var(--ink); }
  .tx-filter-btn.tx-active {
    background: var(--t-dark); border-color: var(--t-dark);
    color: var(--ink-on-dark); font-weight: 700;
  }

  .tx-feed { min-height: 0; overflow-y: auto; display: grid; gap: 14px; align-content: start; }
  .tx-year-group { display: grid; gap: 4px; }
  .tx-year-heading {
    font-size: 11px; font-weight: 800; letter-spacing: 0.1em;
    color: var(--ink-mute);
    padding-bottom: 5px; border-bottom: 2px solid var(--t-dark);
    font-variant-numeric: tabular-nums;
  }

  .tx-entry {
    display: flex; align-items: flex-start; gap: 9px;
    padding: 8px 4px;
    border-bottom: 1px solid var(--line);
    font-size: 12.5px;
  }
  .tx-entry:last-child { border-bottom: 0; }

  /* 종류 배지 — 팀 색과 안 섞는다. 트레이드/FA/드래프트는 뜻이 고정이다 */
  .tx-icon {
    flex-shrink: 0;
    min-width: 30px; text-align: center;
    font-size: 9px; font-weight: 800; letter-spacing: 0.04em;
    border-radius: 2px; padding: 3px 5px;
    color: var(--ink-on-dark);
    background: var(--ink-mute);
  }
  .tag-trade          { background: #2A5D8F; }
  .tag-fa             { background: #1F7A47; }
  .tag-draft          { background: #7A3F9A; }
  .tag-military,
  .tag-mil-general    { background: #5A6478; }
  .tag-mil-sports     { background: #9A6510; }
  .tag-mil-discharge  { background: #1F7A47; }
  .tag-retirement     { background: #B3311F; }

  .tx-body { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .tx-body strong { color: var(--ink); font-weight: 700; }
  .player-link { cursor: pointer; }
  .player-link:hover { color: var(--t-accent); text-decoration: underline; }
  .tx-arrow  { color: var(--ink-mute); margin: 0 4px; }
  .tx-detail { font-size: 11.5px; color: var(--ink-mid); }
  .tx-reason { font-size: 11px; color: var(--ink-mute); }
  .tx-week   { font-size: 10.5px; color: var(--ink-mute); flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .tx-tag {
    font-size: 9.5px; color: var(--ink-mid);
    background: var(--panel-sunk); border-radius: 2px; padding: 1px 6px;
  }
  .tx-empty { color: var(--ink-mute); font-size: 12.5px; padding: 16px 4px; }

  .empty { color: var(--ink-mute); font-size: 12.5px; }

  @media (max-width: 1100px) {
    .standings-layout, .lb-layout, .ps-layout { grid-template-columns: 1fr; }
    .league-nav { flex-direction: row; overflow-x: auto; }
  }
</style>
