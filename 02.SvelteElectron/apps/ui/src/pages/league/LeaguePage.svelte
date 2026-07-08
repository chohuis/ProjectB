<script lang="ts">
  import { get } from "svelte/store";
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore, teamMap } from "../../shared/stores/master";
  import { leagueUiState } from "../../shared/stores/leagueUiStore";
  import { ablConference, jblConference } from "../../shared/utils/leagueConferences";
  import type { PitcherSeasonStats, BatterSeasonStats, PlayerSeasonStats } from "../../shared/types/save";
  import PlayerDetailModal from "../../features/player/ui/PlayerDetailModal.svelte";

  import type { LeagueTransactionRow } from "../../shared/types/save";

  type LeagueTab  = "standings" | "leaderboard" | "transactions";
  type LbTab      = "pitcher" | "batter";
  type TxCategory = "all" | "trade" | "fa" | "draft" | "military" | "retirement";

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

  const FARM_LEAGUES = new Set(["LEAGUE_KBL_FARM", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]);
  function isFarmLeague(lid: string): boolean { return FARM_LEAGUES.has(lid); }

  $: lockedLeagueSet = new Set<string>();

  function isLocked(lid: string): boolean {
    return lockedLeagueSet.has(lid);
  }

  $: if (!selectedLeagueId && myLeagueId) selectedLeagueId = myLeagueId;
  $: if (selectedLeagueId && isLocked(selectedLeagueId)) selectedLeagueId = myLeagueId;

  // ── 리그 기록 탭 ─────────────────────────────────────────────
  const TX_LEAGUES = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"] as const;
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

  $: histPitcherRows = historyLbStats
    .filter(r => r.league_id === lbLeagueId && r.stat_type === "pitcher" && (r.ip ?? 0) >= 10)
    .map(r => ({ id: r.player_id, name: entityName(r.player_id), team: entityTeam(r.player_id),
      w: r.w ?? 0, l: r.l ?? 0, era: r.era ?? 0, whip: r.whip ?? 0, ip: r.ip ?? 0, k: r.k_p ?? 0, bb: r.bb_p ?? 0 }))
    .sort((a, b) => a.era - b.era)
    .slice(0, 20) as PitcherRow[];

  $: histBatterRows = historyLbStats
    .filter(r => r.league_id === lbLeagueId && r.stat_type === "batter" && (r.ab ?? 0) >= 20)
    .map(r => ({ id: r.player_id, name: entityName(r.player_id), team: entityTeam(r.player_id),
      avg: r.avg_v ?? 0, hr: r.hr ?? 0, rbi: r.rbi ?? 0, ops: r.ops ?? 0, ab: r.ab ?? 0, h: r.h_b ?? 0, bb: r.bb_b ?? 0 }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 20) as BatterRow[];

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
  function splitStandings<T extends { teamId: string }>(rows: T[], fn: (id: string) => string | null, val: string) {
    return rows.filter((r) => fn(r.teamId) === val).sort((a: any, b: any) => b.winPct - a.winPct || b.wins - a.wins);
  }
  $: ablEastStandings = splitStandings(selectedStandings, ablConference, "East");
  $: ablWestStandings = splitStandings(selectedStandings, ablConference, "West");
  $: jblClStandings   = splitStandings(selectedStandings, jblConference, "CL");
  $: jblPlStandings   = splitStandings(selectedStandings, jblConference, "PL");

  // ── ABL East/West, JBL CL/PL 분리 (히스토리) ─────────────────
  function splitHistStandings<T extends { team_id: string }>(rows: T[], fn: (id: string) => string | null, val: string) {
    return rows.filter((r) => fn(r.team_id) === val).sort((a: any, b: any) => b.win_pct - a.win_pct || b.wins - a.wins);
  }
  $: histAblEastStandings = splitHistStandings(histStandings, ablConference, "East");
  $: histAblWestStandings = splitHistStandings(histStandings, ablConference, "West");
  $: histJblClStandings   = splitHistStandings(histStandings, jblConference, "CL");
  $: histJblPlStandings   = splitHistStandings(histStandings, jblConference, "PL");

  // ── 멀티리그 순위표 ─────────────────────────────────────────
  // KBL → KBL2군 → ABL → ABL2군 → JBL → JBL2군 고정 순서
  const LEAGUE_ORDER = [
    "LEAGUE_HIGHSCHOOL",
    "LEAGUE_UNIVERSITY",
    "LEAGUE_INDEPENDENT",
    "LEAGUE_KBL",     "LEAGUE_KBL_FARM",
    "LEAGUE_ABL",     "LEAGUE_ABL_FARM",
    "LEAGUE_JBL",     "LEAGUE_JBL_FARM",
  ];

  $: allLeagueIds = (() => {
    const keys = new Set([...Object.keys($seasonStore.leagueState).filter(Boolean), myLeagueId]);
    const ordered  = LEAGUE_ORDER.filter((lid) => keys.has(lid) && !lockedLeagueSet.has(lid));
    const extra    = [...keys].filter((lid) => !LEAGUE_ORDER.includes(lid) && !lockedLeagueSet.has(lid));
    const locked   = [...keys].filter((lid) => lockedLeagueSet.has(lid));
    return [...ordered, ...extra, ...locked];
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
  // leaderboard는 farm 리그 제외 (배경 시뮬 전용)
  $: lbLeagueIds = (() => {
    const others = Object.keys($seasonStore.leagueState)
      .filter((lid) => lid !== myLeagueId && !lockedLeagueSet.has(lid) && !isFarmLeague(lid));
    return [myLeagueId, ...others].filter(Boolean);
  })();

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
        <button class:active={tab === "standings"}    on:click={() => (tab = "standings")}>리그 순위</button>
        <button class:active={tab === "leaderboard"}  on:click={() => (tab = "leaderboard")}>스탯 순위</button>
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
                {#if (selectedLeagueId || myLeagueId) === "LEAGUE_ABL"}
                  <div class="tbl-wrap">
                    <table class="stbl full">
                      <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th></tr></thead>
                      <tbody>
                        <tr class="group-row"><td colspan="10">East</td></tr>
                        {#each histAblEastStandings as r, i}
                          <tr><td>{i+1}</td><td class="t-name">{tName(r.team_id)}</td>
                            <td class="w">{r.wins}</td><td class="l">{r.losses}</td><td>{r.draws}</td>
                            <td>{r.win_pct.toFixed(2)}</td><td>{r.runs_for}</td><td>{r.runs_against}</td>
                            <td class:streak-w={r.streak.startsWith("W")} class:streak-l={r.streak.startsWith("L")}>{r.streak||"-"}</td>
                            <td>{r.last10||"-"}</td></tr>
                        {/each}
                        <tr class="group-row"><td colspan="10">West</td></tr>
                        {#each histAblWestStandings as r, i}
                          <tr><td>{i+1}</td><td class="t-name">{tName(r.team_id)}</td>
                            <td class="w">{r.wins}</td><td class="l">{r.losses}</td><td>{r.draws}</td>
                            <td>{r.win_pct.toFixed(2)}</td><td>{r.runs_for}</td><td>{r.runs_against}</td>
                            <td class:streak-w={r.streak.startsWith("W")} class:streak-l={r.streak.startsWith("L")}>{r.streak||"-"}</td>
                            <td>{r.last10||"-"}</td></tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {:else if (selectedLeagueId || myLeagueId) === "LEAGUE_JBL"}
                  <div class="tbl-wrap">
                    <table class="stbl full">
                      <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th></tr></thead>
                      <tbody>
                        <tr class="group-row"><td colspan="10">센트럴 (CL)</td></tr>
                        {#each histJblClStandings as r, i}
                          <tr><td>{i+1}</td><td class="t-name">{tName(r.team_id)}</td>
                            <td class="w">{r.wins}</td><td class="l">{r.losses}</td><td>{r.draws}</td>
                            <td>{r.win_pct.toFixed(2)}</td><td>{r.runs_for}</td><td>{r.runs_against}</td>
                            <td class:streak-w={r.streak.startsWith("W")} class:streak-l={r.streak.startsWith("L")}>{r.streak||"-"}</td>
                            <td>{r.last10||"-"}</td></tr>
                        {/each}
                        <tr class="group-row"><td colspan="10">퍼시픽 (PL)</td></tr>
                        {#each histJblPlStandings as r, i}
                          <tr><td>{i+1}</td><td class="t-name">{tName(r.team_id)}</td>
                            <td class="w">{r.wins}</td><td class="l">{r.losses}</td><td>{r.draws}</td>
                            <td>{r.win_pct.toFixed(2)}</td><td>{r.runs_for}</td><td>{r.runs_against}</td>
                            <td class:streak-w={r.streak.startsWith("W")} class:streak-l={r.streak.startsWith("L")}>{r.streak||"-"}</td>
                            <td>{r.last10||"-"}</td></tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {:else}
                  <div class="tbl-wrap">
                    <table class="stbl full">
                      <thead>
                        <tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th></tr>
                      </thead>
                      <tbody>
                        {#each histStandings as r, i}
                          <tr>
                            <td>{i + 1}</td>
                            <td class="t-name">{tName(r.team_id)}</td>
                            <td class="w">{r.wins}</td><td class="l">{r.losses}</td><td>{r.draws}</td>
                            <td>{r.win_pct.toFixed(2)}</td><td>{r.runs_for}</td><td>{r.runs_against}</td>
                            <td class:streak-w={r.streak.startsWith("W")} class:streak-l={r.streak.startsWith("L")}>{r.streak || "-"}</td>
                            <td>{r.last10 || "-"}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/if}
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
            {:else if (selectedLeagueId || myLeagueId) === "LEAGUE_ABL"}
              <div class="tbl-wrap">
                <table class="stbl full">
                  <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th></tr></thead>
                  <tbody>
                    <tr class="group-row"><td colspan="10">East</td></tr>
                    {#if ablEastStandings.length === 0}<tr><td colspan="10" class="empty-cell">아직 경기 데이터가 없습니다.</td></tr>
                    {:else}{#each ablEastStandings as s, i}
                      <tr class:my-row={s.teamId === myTeamId}>
                        <td>{i+1}</td><td class="t-name">{tName(s.teamId)}</td>
                        <td class="w">{s.wins}</td><td class="l">{s.losses}</td><td>{s.draws}</td>
                        <td>{s.winPct.toFixed(2)}</td><td>{s.runsFor}</td><td>{s.runsAgainst}</td>
                        <td class:streak-w={s.streak.startsWith("W")} class:streak-l={s.streak.startsWith("L")}>{s.streak||"-"}</td>
                        <td>{s.last10||"-"}</td>
                      </tr>
                    {/each}{/if}
                    <tr class="group-row"><td colspan="10">West</td></tr>
                    {#if ablWestStandings.length === 0}<tr><td colspan="10" class="empty-cell">아직 경기 데이터가 없습니다.</td></tr>
                    {:else}{#each ablWestStandings as s, i}
                      <tr class:my-row={s.teamId === myTeamId}>
                        <td>{i+1}</td><td class="t-name">{tName(s.teamId)}</td>
                        <td class="w">{s.wins}</td><td class="l">{s.losses}</td><td>{s.draws}</td>
                        <td>{s.winPct.toFixed(2)}</td><td>{s.runsFor}</td><td>{s.runsAgainst}</td>
                        <td class:streak-w={s.streak.startsWith("W")} class:streak-l={s.streak.startsWith("L")}>{s.streak||"-"}</td>
                        <td>{s.last10||"-"}</td>
                      </tr>
                    {/each}{/if}
                  </tbody>
                </table>
              </div>
            {:else if (selectedLeagueId || myLeagueId) === "LEAGUE_JBL"}
              <div class="tbl-wrap">
                <table class="stbl full">
                  <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th></tr></thead>
                  <tbody>
                    <tr class="group-row"><td colspan="10">센트럴 (CL)</td></tr>
                    {#if jblClStandings.length === 0}<tr><td colspan="10" class="empty-cell">아직 경기 데이터가 없습니다.</td></tr>
                    {:else}{#each jblClStandings as s, i}
                      <tr class:my-row={s.teamId === myTeamId}>
                        <td>{i+1}</td><td class="t-name">{tName(s.teamId)}</td>
                        <td class="w">{s.wins}</td><td class="l">{s.losses}</td><td>{s.draws}</td>
                        <td>{s.winPct.toFixed(2)}</td><td>{s.runsFor}</td><td>{s.runsAgainst}</td>
                        <td class:streak-w={s.streak.startsWith("W")} class:streak-l={s.streak.startsWith("L")}>{s.streak||"-"}</td>
                        <td>{s.last10||"-"}</td>
                      </tr>
                    {/each}{/if}
                    <tr class="group-row"><td colspan="10">퍼시픽 (PL)</td></tr>
                    {#if jblPlStandings.length === 0}<tr><td colspan="10" class="empty-cell">아직 경기 데이터가 없습니다.</td></tr>
                    {:else}{#each jblPlStandings as s, i}
                      <tr class:my-row={s.teamId === myTeamId}>
                        <td>{i+1}</td><td class="t-name">{tName(s.teamId)}</td>
                        <td class="w">{s.wins}</td><td class="l">{s.losses}</td><td>{s.draws}</td>
                        <td>{s.winPct.toFixed(2)}</td><td>{s.runsFor}</td><td>{s.runsAgainst}</td>
                        <td class:streak-w={s.streak.startsWith("W")} class:streak-l={s.streak.startsWith("L")}>{s.streak||"-"}</td>
                        <td>{s.last10||"-"}</td>
                      </tr>
                    {/each}{/if}
                  </tbody>
                </table>
              </div>
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
          <div class="lb-top-row">
            <div class="lb-tabs">
              <button class:active={lbTab === "pitcher"} on:click={() => (lbTab = "pitcher")}>투수</button>
              <button class:active={lbTab === "batter"}  on:click={() => (lbTab = "batter")}>타자</button>
            </div>
          </div>

          {#if lbTab === "pitcher"}
            {@const pRows = selectedYear > 0 ? histPitcherRows : pitcherRows}
            {#if pRows.length === 0}
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
                    {#each pRows as row, i}
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
            {@const bRows = selectedYear > 0 ? histBatterRows : batterRows}
            {#if bRows.length === 0}
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
                    {#each bRows as row, i}
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

  .yr-select {
    border: 1px solid #2d4a7a;
    background: #19263d;
    color: #a0b8e0;
    border-radius: 6px;
    padding: 3px 9px;
    font-size: 11px;
    cursor: pointer;
  }

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
    min-height: 0;
  }

  .tbl-wrap { overflow-x: auto; }

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

  .stbl .group-row td {
    background: #0e1d35;
    color: #7a9ac8;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 6px;
    text-align: left;
    letter-spacing: 0.5px;
  }
  .stbl .empty-cell { color: #9db2d8; font-size: 11px; text-align: center; padding: 8px; }

  .lb-top-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

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

  /* 거래 내역 */
  .tx-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .tx-filters {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tx-filter-group {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .tx-filter-btn {
    border: 1px solid #2a4070;
    background: #132038;
    color: #8ab0e0;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .tx-filter-btn.tx-active {
    background: #1e4080;
    border-color: #5080c0;
    color: #ddeeff;
  }

  .tx-feed {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }

  .tx-empty {
    color: #6a90c0;
    font-size: 12px;
    padding: 16px 0;
    text-align: center;
  }

  .tx-year-group { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }

  .tx-year-heading {
    font-size: 11px;
    color: #5a80b0;
    margin: 0 0 4px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #1e3058;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .tx-entry {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: #0d1c32;
    border-radius: 7px;
    padding: 7px 10px;
    border-left: 3px solid #2a4070;
    font-size: 12px;
  }
  .tx-cat-trade      { border-left-color: #4a80e8; }
  .tx-cat-fa         { border-left-color: #50c878; }
  .tx-cat-draft      { border-left-color: #f0c040; }
  .tx-cat-military   { border-left-color: #a060e0; }
  .tx-cat-retirement { border-left-color: #e06040; }

  .tx-icon {
    font-size: 9px;
    font-weight: 700;
    color: #7090b8;
    flex-shrink: 0;
    width: 26px;
    text-align: center;
    letter-spacing: 0.3px;
    padding-top: 2px;
  }

  .tx-body {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .tx-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .tag-trade      { background: #1a3878; color: #80b0ff; }
  .tag-fa         { background: #0e3820; color: #60d890; }
  .tag-draft      { background: #3a3010; color: #f0c840; }
  .tag-military        { background: #2a1060; color: #c080ff; }
  .tag-mil-sports      { background: #1a2860; color: #80b0ff; }
  .tag-mil-general     { background: #282828; color: #909090; }
  .tag-mil-discharge   { background: #0d2a18; color: #50c878; }
  .tag-retirement { background: #3a1008; color: #ff9070; }

  .tx-detail { color: #c8dcf6; }
  .tx-detail strong { color: #eef6ff; }
  .player-link { cursor: pointer; }
  .player-link:hover { text-decoration: underline; color: #a8d4ff; }
  .tx-arrow { color: #7090b8; font-size: 11px; }
  .tx-reason {
    font-size: 11px;
    color: #6a90b8;
    background: #0a1628;
    border-radius: 4px;
    padding: 1px 6px;
  }
  .tx-week {
    font-size: 10px;
    color: #4a6a98;
    flex-shrink: 0;
    margin-left: auto;
    align-self: center;
  }

  .ps-history-card {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin-top: 10px;
    padding: 8px 12px;
    background: #0d1e38;
    border: 1px solid #2a4060;
    border-radius: 6px;
    font-size: 13px;
  }
  .ps-hist-label { color: #8aabcc; font-size: 11px; }
  .ps-hist-team  { color: #d4e8ff; font-weight: 600; }
  .ps-hist-sep   { color: #3a5a80; }
  .ps-hist-playoff {
    width: 100%;
    margin-top: 4px;
    font-size: 11px;
    color: #6a90b8;
  }

  @media (max-width: 1180px) {
    .standings-layout { grid-template-columns: 80px 1fr; }
    .lb-layout { grid-template-columns: 80px 1fr; }
  }
</style>
