<script lang="ts">
  import { get } from "svelte/store";
  import { isLeagueInScope, scopedLeagueIds } from "../../shared/config/releaseScope";
  import { visibleLeagueIds, leaderboardLeagueIds } from "../../shared/utils/leagueVisibility";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore, teamMap } from "../../shared/stores/master";
  import { leagueUiState, type LeagueTab, type TxCategory } from "../../shared/stores/leagueUiStore";
  import {
    tournamentsOfLeague, tournamentPhase, bracketRounds, championOf,
    teamRun, runSummary, PHASE_LABEL,
  } from "../../shared/utils/tournamentView";
  import { splitByGroup } from "../../shared/utils/standingsGroups";
  import type { PitcherSeasonStats, BatterSeasonStats, PlayerSeasonStats } from "../../shared/types/save";
  import {
    categoriesFor, cardCategoriesFor, categoryByKey,
    qualificationOf, qualifies, rankBy, type LbRow, type StatCategory,
  } from "../../shared/utils/leaderboard";
  import { toRounds, seriesState, bestOfLabel, winsNeeded } from "../../shared/utils/bracket";
  import PlayerDetailModal from "../../features/player/ui/PlayerDetailModal.svelte";
  import TeamMark from "../../features/team/ui/TeamMark.svelte";

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
    /** 그 시즌의 팀 이름. v9 이전 세이브엔 빈 문자열이다 */
    team_name?: string;
    wins: number; losses: number; draws: number; win_pct: number;
    runs_for: number; runs_against: number; streak: string; last10: string;
    group_label: string;
  };
  type HistPostseason = {
    slot_id: string; season_year: number; league_id: string;
    champion_id: string; runner_up_id: string; playoff_teams: string[];
    champion_name?: string; runner_up_name?: string;
    /** 대진 JSON. **빈 문자열이면 v9 이전 세이브** — "[]"와 구분해야 한다 */
    bracket_json?: string;
  };
  type HistLbStat = {
    slot_id: string; season_year: number; league_id: string; player_id: string; stat_type: string;
    player_name?: string; team_name?: string;
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
  /** 지난 시즌 대회 — **안 열린 대회도 한 줄 온다**(우승 빈칸) */
  type HistTournament = {
    tour_id: string; league_id: string; tour_name: string;
    champion_id: string; champion_name: string;
    runner_up_id: string; runner_up_name: string;
    bracket_json: string; group_json: string;
  };
  let historyTournaments: HistTournament[] = [];

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
      historyStandings   = [];
      historyLbStats     = [];
      historyPostseason  = [];
      historyTournaments = [];
      return;
    }
    try {
      const [sr, lr, pr, tr] = await Promise.all([
        window.projectB!.seasonGetHistoryStandings(JSON.stringify({ slotId, seasonYear: selectedYear })),
        window.projectB!.seasonGetHistoryLbStats(JSON.stringify({ slotId, seasonYear: selectedYear })),
        window.projectB!.seasonGetHistoryPostseason(JSON.stringify({ slotId, seasonYear: selectedYear })),
        window.projectB!.seasonGetHistoryTournaments(JSON.stringify({ slotId, seasonYear: selectedYear })),
      ]);
      historyStandings  = JSON.parse(sr) ?? [];
      historyLbStats    = JSON.parse(lr) ?? [];
      historyPostseason  = JSON.parse(pr) ?? [];
      historyTournaments = JSON.parse(tr) ?? [];
    } catch {
      historyStandings = []; historyLbStats = []; historyPostseason = []; historyTournaments = [];
    }
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
  /**
   * ⚠ **내 리그가 맨 위다.** 제일 자주 보는 곳인데 고정 순서라 중간에 묻혀 있었다.
   * 나머지는 원래 순서를 지킨다 — 리그 나열 순서에도 뜻이 있다(고교→대학→프로).
   */
  $: allLeagueIds = (() => {
    const ids = visibleLeagueIds({
      leagueState: $seasonStore.leagueState,
      myLeagueId,
      locked: lockedLeagueSet,
    });
    const mine = ids.filter((id) => id === myLeagueId);
    return [...mine, ...ids.filter((id) => id !== myLeagueId)];
  })();

  /**
   * 권역 2단 — 리그를 고르면 그 리그의 권역 목록이 옆에 열린다.
   *
   * 고교(8권역)·대학(조)처럼 나뉜 리그는 순위표를 통째로 늘어놓으면 어느
   * 권역인지 스크롤하며 세어야 한다. `splitByGroup`이 이미 나눠 주므로
   * 그 결과를 **목록으로 세우고 하나만 펼친다.**
   */
  let selectedGroupLabel: string | null = null;
  /** 리그를 바꾸면 권역 선택을 초기화한다 — 없는 권역이 남으면 표가 빈다 */
  $: selectedLeagueId, (selectedGroupLabel = null);
  // ── 대회 (S4) ────────────────────────────────────────────────
  //
  // ⚠ **엔진은 매 시즌 대회를 돌리는데 화면이 한 곳도 없었다.** 고교 5개·
  // 대학 3개가 열리고 우승팀까지 나오는데 볼 데가 없었다.
  let selectedTourId = "";
  $: tourLeagueId = selectedLeagueId || myLeagueId;
  $: tourDefs = tournamentsOfLeague(tourLeagueId);
  /** 리그를 바꾸면 대회 선택을 초기화한다 — 다른 리그 대회가 남으면 빈 화면이 된다 */
  $: tourLeagueId, (selectedTourId = "");
  /** 저장된 대회 대진 — 문자열이라 못 파싱하면 없는 것으로 본다 */
  function savedTour(row: HistTournament | undefined, key: "bracket_json" | "group_json") {
    const raw = row?.[key];
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // ⚠ **예전엔 연도를 골라도 현재 시즌 대회를 봤다.** 대회만 과거 기록이
  // 저장되지 않아서(순위·개인기록·포스트시즌은 남는데) 시즌이 넘어가면
  // 지난해 우승팀이 통째로 사라졌다.
  $: tourRows = tourDefs.map((def) => {
    const hist    = selectedYear > 0
      ? historyTournaments.find((r) => r.tour_id === def.id) : undefined;
    const bracket = selectedYear > 0
      ? savedTour(hist, "bracket_json")
      : ($seasonStore.tournaments?.[def.id] ?? null);
    const group   = selectedYear > 0
      ? savedTour(hist, "group_json")
      : ($seasonStore.groupStages?.[def.id] ?? null);
    // 과거 시즌엔 "진행 중"이 없다. 현재 주차로 재면 지난해 대회가 예정으로 뜬다
    const phase   = selectedYear > 0
      ? (bracket || group ? "done" as const : "upcoming" as const)
      : tournamentPhase(def, $seasonStore.currentWeek, bracket, group);
    const run     = teamRun(bracket, myTeamId);
    return { def, bracket, group, phase, run, summary: runSummary(run, phase) };
  });
  /** 기본 선택 — 진행 중인 대회가 있으면 그것, 없으면 가장 최근에 끝난 것 */
  $: activeTour = tourRows.find((r) => r.def.id === selectedTourId)
    ?? tourRows.find((r) => r.phase === "live" || r.phase === "qualifying")
    ?? [...tourRows].reverse().find((r) => r.phase === "done")
    ?? tourRows[0]
    ?? null;
  $: tourRounds = bracketRounds(activeTour?.bracket);
  $: tourChampion = championOf(activeTour?.bracket);

  /** 내 권역이 맨 앞 — 리그 목록과 같은 규칙이어야 한다 */
  $: groupLabels = (() => {
    const all = standingsGroupsView.map((g) => g.label).filter((l): l is string => !!l);
    if (!myGroupLabel) return all;
    return [myGroupLabel, ...all.filter((l) => l !== myGroupLabel)];
  })();
  $: activeGroup = groupLabels.length === 0
    ? null
    : (selectedGroupLabel && groupLabels.includes(selectedGroupLabel)
        ? selectedGroupLabel
        : myGroupLabel ?? groupLabels[0]);
  /** 내 팀이 속한 권역 — 리그를 열면 여기가 먼저 보여야 한다 */
  $: myGroupLabel = standingsGroupsView
    .find((g) => g.rows.some((r) => (r as { teamId?: string }).teamId === $gameStore.protagonist.teamId))
    ?.label ?? null;
  $: shownGroups = activeGroup
    ? standingsGroupsView.filter((g) => g.label === activeGroup)
    : standingsGroupsView;

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
        .map((r) => ({
          id: r.player_id,
          name: histPersonName(r.player_name, r.player_id),
          team: r.team_name || entityTeam(r.player_id),
          stats: histToStats(r),
          qualified: qualifies(histToStats(r), lbQual),
        }));
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
  /** 부문 카드에 몇 명까지. 투수·타자 모두 카드 부문이 **정확히 5개**다 */
  const CARD_TOP_N = 10;
  $: lbCards = cardCategoriesFor(lbTab).map((c) => ({ cat: c, rows: rankBy(lbRows, c, CARD_TOP_N) }));

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
  // ⚠ **대진이 있는 리그만.** 롤오버는 순위가 있는 리그마다 한 줄씩 남기므로
  // 고교·대학도 `history_postseason`에 들어온다 — 그것까지 목록에 넣으면
  // 골라도 "기록이 없습니다"만 나오는 칸이 생긴다
  $: psLeagueIds = allLeagueIds.filter(
    (lid) => ($seasonStore.postseasonBrackets[lid]?.length ?? 0) > 0
      || historyPostseason.some((r) => r.league_id === lid && !!r.bracket_json));
  $: if (psLeagueIds.length > 0 && !psLeagueIds.includes(psLeagueId)) psLeagueId = psLeagueIds[0];

  /**
   * 지난 시즌 대진 — 시즌이 끝날 때 통째로 저장한 것.
   *
   * 포스트시즌이 없는 리그(고교 등)는 빈 문자열이라 대진표를 안 그린다.
   */
  function savedBracket(row: HistPostseason | null | undefined) {
    if (!row?.bracket_json) return null;
    try {
      const parsed = JSON.parse(row.bracket_json);
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }

  $: psRounds = selectedYear > 0
    ? toRounds(savedBracket(historyPostseason.find((r) => r.league_id === psLeagueId)) ?? [])
    : toRounds($seasonStore.postseasonBrackets[psLeagueId] ?? []);

  /** 결과 요약. 대진이 저장된 시즌에도 우승/준우승 줄은 같이 보여준다 */
  $: psHistory = selectedYear > 0
    ? historyPostseason.find((r) => r.league_id === psLeagueId) ?? null
    : null;

  /** 이름이 비면 "미정" — 앞 시리즈를 기다리는 자리다 */
  function psTeam(id: string): string {
    return id ? tName(id) : "미정";
  }

  /**
   * 과거 기록의 이름 — **저장된 것이 먼저다.**
   *
   * ⚠ 지금 조회로 대신하면 은퇴·이적으로 사라진 사람이 ID로 떨어진다.
   * 저장이 어떤 이유로 비었더라도 **ID를 그대로 보여주지는 않는다** —
   * 화면이 내부 값을 흘리면 안 된다.
   */
  const GONE = "(기록 없음)";
  function histTeamName(saved: string | undefined, id: string): string {
    if (saved) return saved;
    const looked = $teamMap.get(id)?.name;
    return looked ?? (id ? GONE : "미정");
  }
  function histPersonName(saved: string | undefined, id: string): string {
    if (saved) return saved;
    if (id === $gameStore.protagonist.id) return $gameStore.protagonist.name;
    const e = $masterStore.entities.find((en) => en.id === id);
    return e?.name ?? GONE;
  }
</script>

<!-- 제목("리그")을 뺐다 — 사이드바가 이미 그 이름이다 -->
<section class="page">

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "standings"}    on:click={() => (tab = "standings")}>리그 순위</button>
        <button class:active={tab === "leaderboard"}  on:click={() => (tab = "leaderboard")}>스탯 순위</button>
        <button class:active={tab === "tournaments"}  on:click={() => (tab = "tournaments")}>대회</button>
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
          <!--
            2단의 두 번째 단 — 리그를 골랐으면 그 안의 권역을 고른다.
            권역이 없는 리그(프로·독립)에서는 `groupLabels`가 비어 안 나온다.
          -->
          {#if groupLabels.length > 1 && selectedYear === 0}
            <nav class="group-nav" aria-label="권역">
              {#each groupLabels as label}
                <button
                  class:on={activeGroup === label}
                  on:click={() => (selectedGroupLabel = label)}
                >
                  {label}
                  {#if label === myGroupLabel}<span class="gn-mine">내 권역</span>{/if}
                </button>
              {/each}
            </nav>
          {/if}
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
                            <td class="t-name"><TeamMark teamId={r.team_id} size={18} />{histTeamName(r.team_name, r.team_id)}</td>
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
                    {#each shownGroups as grp}
                      {#if grp.label && groupLabels.length <= 1}
                        <tr class="group-row"><td colspan="10">{grp.label} <span class="grp-n">{grp.rows.length}팀</span></td></tr>
                      {/if}
                      {#each grp.rows as s, i}
                        <tr class:my-row={s.teamId === myTeamId}>
                          <td>{i + 1}</td>
                          <td class="t-name"><TeamMark teamId={s.teamId} size={18} />{tName(s.teamId)}</td>
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
            <!-- ── 부문별 TOP10 ── -->
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
    <!-- ── 대회 (S4) ── -->
    {#if tab === "tournaments"}
      <section class="standings-layout tn-layout">
        <!-- 왼쪽: 그 리그의 대회를 주차 순으로 -->
        <nav class="league-nav" aria-label="대회">
          {#each tourRows as row (row.def.id)}
            <button
              class:active={activeTour?.def.id === row.def.id}
              on:click={() => (selectedTourId = row.def.id)}
            >
              <span class="tn-main">
                <b>{row.def.name}</b>
                <span class="tn-week">W{row.def.startWeek}–{row.def.endWeek}</span>
              </span>
              <span class="tn-state ph-{row.phase}">{PHASE_LABEL[row.phase]}</span>
            </button>
          {:else}
            <span class="ps-none">이 리그에는 대회가 없습니다</span>
          {/each}
        </nav>

        <div class="panel standings-panel">
          {#if !activeTour}
            <p class="empty">대회 정보가 없습니다.</p>
          {:else}
            <h3>
              {activeTour.def.name}
              <span class="th-sub">{activeTour.def.totalSlots}팀 · {PHASE_LABEL[activeTour.phase]}</span>
            </h3>

            <!-- 우리 팀이 어떻게 됐나 — 대진표보다 이게 먼저 궁금하다 -->
            {#if activeTour.summary}
              <p class="my-run" class:won={activeTour.run?.champion}>
                {#if activeTour.run?.champion}🏆{/if}
                {tName(myTeamId)} — {activeTour.summary}
                {#if activeTour.run?.lostAt}
                  {@const l = activeTour.run.lostAt}
                  <span class="run-vs">
                    vs {tName(l.homeTeamId === myTeamId ? (l.awayTeamId ?? "") : (l.homeTeamId ?? ""))}
                  </span>
                {/if}
              </p>
            {/if}

            <div class="standings-body">
              {#if activeTour.phase === "upcoming"}
                <p class="empty">
                  {activeTour.def.startWeek}주차에 열린다.
                  {#if activeTour.def.groupCount}조별예선 {activeTour.def.groupCount}조 후 본선.{/if}
                </p>

              <!-- 조별예선이 있는 대회(은하기·여명기)는 조 표가 먼저다 -->
              {:else if activeTour.phase === "qualifying" && activeTour.group}
                <div class="grp-wrap">
                  {#each activeTour.group.groups as g}
                    <div class="grp-card">
                      <!-- 조 이름은 엔진이 준다 — 인덱스로 A·B를 지어내지 않는다 -->
                      <div class="grp-head">{g.label}</div>
                      <ol class="grp-teams">
                        {#each g.teams as tid}
                          <li class:mine={tid === myTeamId}>
                            <TeamMark teamId={tid} size={16} />{tName(tid)}
                          </li>
                        {/each}
                      </ol>
                    </div>
                  {/each}
                </div>
                <p class="empty">조 {activeTour.def.advancePerGroup ?? 1}위가 본선에 오른다.</p>

              {:else if tourRounds.length === 0}
                <p class="empty">대진이 아직 없습니다.</p>

              {:else}
                {#if tourChampion}
                  <p class="tour-champ">🏆 {tName(tourChampion)} 우승</p>
                {/if}
                <div class="bracket-wrap">
                  {#each tourRounds as r (r.round)}
                    <div class="tb-round">
                      <div class="tb-label">{r.label}</div>
                      {#each r.matches as m (m.id)}
                        <div class="tb-match" class:mine={m.homeTeamId === myTeamId || m.awayTeamId === myTeamId}>
                          {#if m.isBye}
                            <!-- 부전승은 경기가 아니다 — 점수 칸을 만들지 않는다 -->
                            <div class="tb-side won">
                              {#if m.homeTeamId}<TeamMark teamId={m.homeTeamId} size={14} />{tName(m.homeTeamId)}{/if}
                              <span class="tb-bye">부전승</span>
                            </div>
                          {:else}
                            <div class="tb-side" class:won={m.winnerTeamId && m.winnerTeamId === m.homeTeamId}>
                              {#if m.homeTeamId}<TeamMark teamId={m.homeTeamId} size={14} />{tName(m.homeTeamId)}{:else}<span class="tb-tbd">미정</span>{/if}
                            </div>
                            <div class="tb-side" class:won={m.winnerTeamId && m.winnerTeamId === m.awayTeamId}>
                              {#if m.awayTeamId}<TeamMark teamId={m.awayTeamId} size={14} />{tName(m.awayTeamId)}{:else}<span class="tb-tbd">미정</span>{/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </section>
    {/if}

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
            <div class="ps-past">
              <div class="ps-champ">
                <span class="u-label">우승</span>
                <strong>{histTeamName(psHistory.champion_name, psHistory.champion_id)}</strong>
              </div>
              {#if psHistory.runner_up_id}
                <div class="ps-runner">
                  <span class="u-label">준우승</span>
                  <strong>{histTeamName(psHistory.runner_up_name, psHistory.runner_up_id)}</strong>
                </div>
              {/if}
              {#if psHistory.playoff_teams.length > 0}
                <p class="ps-teams">
                  <span class="u-label">진출</span>
                  {psHistory.playoff_teams.map((id) => psTeam(id)).join(" · ")}
                </p>
              {/if}
              <!-- 대진이 없는 리그(고교 등)는 우승 팀만 남는다 -->
            </div>
          {/if}

          <!-- ⚠ 대진이 있을 때만 그린다. `!psHistory`로만 갈라 놓으면 결과만 남은
               옛 세이브에서 **빈 대진표**가 그려진다 -->
          {#if psRounds.length > 0}
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
          {:else if !psHistory}
            <p class="empty" style="padding:16px">
              {selectedYear > 0 ? "이 시즌 포스트시즌 기록이 없습니다." : "아직 포스트시즌이 시작되지 않았습니다."}
            </p>
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

  /* ── 권역 줄 (2단의 두 번째) ── */
  .group-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 8px 0 2px;
  }
  .group-nav button {
    display: inline-flex; align-items: center; gap: 5px;
    background: none;
    border: 1px solid var(--line);
    border-radius: 20px;
    color: var(--ink-mid);
    font-size: 12px;
    padding: 4px 11px;
    cursor: pointer;
  }
  .group-nav button:hover { border-color: var(--line-strong); color: var(--ink); }
  .group-nav button.on {
    background: var(--t-dark);
    border-color: var(--t-dark);
    color: var(--ink-on-dark);
    font-weight: 700;
  }
  .gn-mine {
    font-size: 9.5px;
    font-weight: 700;
    opacity: 0.72;
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
  /* ⚠ grid 2행 고정이었다. 대회 탭은 자식이 셋이라 세 번째가 암묵 행으로
     밀려 우승 줄이 대진표를 덮었다 — 자식 수에 안 묶이게 flex로 */
  .standings-panel { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .standings-panel > .standings-body { flex: 1 1 auto; min-height: 0; }
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
  .stbl .t-name :global(.tm) { vertical-align: -4px; margin-right: 6px; }

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

  /* 부문별 TOP10 — "누가 1위인가"가 표를 뒤지지 않고 보여야 한다.
     ⚠ `auto-fit`에 `minmax(160px, ...)`이라 폭이 모자라면 **다섯 중 넷만 한 줄에
     들어가고 하나가 다음 줄로 떨어졌다.** 부문은 투수·타자 모두 정확히 다섯이라
     칸 수를 고정한다 — 남는 칸도, 흘러넘치는 칸도 생기지 않는다. */
  .cards {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    min-height: 0;
  }
  .lb-card {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 7px 8px;
    display: grid; gap: 4px; align-content: start;
    min-width: 0;
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
  /* 다섯 칸이 되면서 카드 하나가 150px 남짓이다. 팀은 원래부터 카드에서
     숨겨져 있고(`.lb-card-list .tm`) 아래 전체표가 보여준다 — 좁은 칸에서는
     이름이 잘리는 쪽이 더 나쁘다 */
  .lb-card-list li {
    display: grid;
    grid-template-columns: 13px minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 4px;
    font-size: 11px;
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

  /* ── 대회 (S4) ── */
  /* 148px에선 "개나리 / 기"로 잘렸다 — 이 탭만 왼쪽 칸을 넓힌다 */
  .standings-layout.tn-layout { grid-template-columns: 186px minmax(0, 1fr); }
  .tn-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .tn-main b { font-weight: 700; white-space: nowrap; }
  .tn-week { font-size: 10px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
  .tn-state {
    font-size: 9.5px; font-weight: 700;
    border-radius: 10px; padding: 1px 7px;
    flex: 0 0 auto;
  }
  /* 진행 중만 눈에 띈다 — 나머지는 상태를 알리기만 한다 */
  .ph-live        { background: var(--t-accent); color: var(--ink-on-dark); }
  .ph-qualifying  { background: var(--t-accent); color: var(--ink-on-dark); }
  .ph-done        { background: var(--panel-sunk); color: var(--ink-mute); }
  .ph-upcoming    { background: transparent; color: var(--ink-mute); border: 1px solid var(--line); }

  .th-sub { font-size: 11.5px; font-weight: 400; color: var(--ink-mute); margin-left: 8px; }

  .my-run {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--ink);
    background: var(--panel-sunk);
    border-left: 3px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 7px 11px;
  }
  .my-run.won { border-left-color: var(--warn); font-weight: 700; }
  .run-vs { color: var(--ink-mute); font-size: 12px; margin-left: 4px; }

  .tour-champ {
    margin: 0 0 10px;
    font-size: 15px; font-weight: 800;
    color: var(--warn);
  }

  /* 조별예선 */
  .grp-wrap {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .grp-card {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 8px 10px;
  }
  .grp-head { font-size: 11px; font-weight: 800; color: var(--ink-mute); margin-bottom: 5px; }
  .grp-teams { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
  .grp-teams li {
    display: flex; align-items: center; gap: 5px;
    font-size: 12px; color: var(--ink-mid);
  }
  .grp-teams li.mine { color: var(--ink); font-weight: 700; }

  /* 대진표 — 라운드를 가로로 세운다 */
  .bracket-wrap {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    overflow-x: auto;
    padding-bottom: 6px;
  }
  /* ⚠ 포스트시즌 대진표가 이미 `.br-*`를 쓴다. 같은 이름을 쓰면 나중에
     선언한 이 규칙이 그쪽을 덮는다 — 대회는 `.tb-*`로 분리한다 */
  .tb-round { display: grid; gap: 6px; min-width: 132px; }
  .tb-label {
    font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
    color: var(--ink-mute); text-transform: uppercase;
    padding-bottom: 4px; border-bottom: 1px solid var(--line);
  }
  .tb-match {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .tb-match.mine { box-shadow: inset 3px 0 0 var(--t-accent); }
  .tb-side {
    display: flex; align-items: center; gap: 5px;
    font-size: 12px; color: var(--ink-mute);
    padding: 4px 8px;
  }
  .tb-side + .tb-side { border-top: 1px solid var(--line); }
  /* 이긴 쪽만 진하게 — 진 쪽을 지우면 누구와 붙었는지가 사라진다 */
  .tb-side.won { color: var(--ink); font-weight: 700; background: var(--panel); }
  .tb-tbd { color: var(--ink-mute); opacity: 0.6; }
  .tb-bye { margin-left: auto; font-size: 10px; color: var(--ink-mute); }

  .empty { color: var(--ink-mute); font-size: 12.5px; }

  @media (max-width: 1100px) {
    .standings-layout, .lb-layout, .ps-layout { grid-template-columns: 1fr; }
    .league-nav { flex-direction: row; overflow-x: auto; }
  }
</style>
