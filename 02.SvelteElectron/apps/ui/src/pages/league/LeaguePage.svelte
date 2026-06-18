<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore, teamMap } from "../../shared/stores/master";
  import type { PitcherSeasonStats, BatterSeasonStats, PlayerSeasonStats } from "../../shared/types/save";

  import type { LeagueTransactionRow } from "../../shared/types/save";

  type LeagueTab  = "standings" | "leaderboard" | "transactions";
  type LbTab      = "pitcher" | "batter";
  type HsLbGroup  = "all" | "A" | "B";
  type TxCategory = "all" | "trade" | "fa" | "draft" | "military" | "retirement";

  let tab:        LeagueTab  = "standings";
  let lbTab:      LbTab      = "pitcher";
  let hsLbGroup:  HsLbGroup  = "all";
  let selectedLeagueId: string = "";
  let lbLeagueId: string = "";

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

  let txLeagueId: string = "";
  let txCategory: TxCategory = "all";
  let txYear: number = 0;  // 0 = 전체
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
      // 필터 적용된 결과
      const res = JSON.parse(
        await window.projectB!.leagueGetTransactions(JSON.stringify({
          slotId,
          seasonYear: txYear > 0 ? txYear : undefined,
          category:   txCategory !== "all" ? txCategory : undefined,
          leagueId:   txLeagueId || undefined,
          limit: 200,
        }))
      ) as LeagueTransactionRow[];
      txRows = res;

      // 연도 목록은 카테고리/연도 필터 없이 별도 조회 (리그만 적용)
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

  // 카테고리/리그/연도 변경 시 재로드
  $: txCategory, txLeagueId, txYear, tab === "transactions" && loadTransactions();

  // 연도별 그룹핑
  $: txByYear = (() => {
    const map = new Map<number, LeagueTransactionRow[]>();
    for (const r of txRows) {
      const yr = r.seasonYear;
      if (!map.has(yr)) map.set(yr, []);
      map.get(yr)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
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

  function txTeamName(id?: string | null): string {
    if (!id) return "";
    return $teamMap.get(id)?.name ?? id;
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

  // ── HS 리그 순위표 A/B 분리 ────────────────────────────────────
  $: hsGroupAStandings = [...$seasonStore.standings]
    .filter((s) => ($seasonStore.hsGroupA ?? []).includes(s.teamId))
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  $: hsGroupBStandings = [...$seasonStore.standings]
    .filter((s) => ($seasonStore.hsGroupB ?? []).includes(s.teamId))
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

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

  $: {
    if (lbLeagueId) masterStore.loadEntities(lbLeagueId, $seasonStore.seasonYear);
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

  $: hsGroupASet = new Set($seasonStore.hsGroupA ?? []);
  $: hsGroupBSet = new Set($seasonStore.hsGroupB ?? []);

  $: filteredLbStats = (() => {
    if (lbLeagueId !== "LEAGUE_HIGHSCHOOL" || hsLbGroup === "all") return lbStats;
    const groupSet = hsLbGroup === "A" ? hsGroupASet : hsGroupBSet;
    return Object.fromEntries(
      Object.entries(lbStats).filter(([id]) => {
        const teamId = id === $gameStore.protagonist.id
          ? $gameStore.protagonist.teamId
          : ($masterStore.entities.find((e) => e.id === id)?.teamId ?? "");
        return groupSet.has(teamId);
      })
    ) as Record<string, PlayerSeasonStats>;
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

  $: pitcherRows = Object.entries(filteredLbStats)
    .filter(([, s]) => s.type === "pitcher" && (s as PitcherSeasonStats).ip >= 10)
    .map(([id, s]) => {
      const p = s as PitcherSeasonStats;
      return { id, name: entityName(id), team: entityTeam(id), w: p.w, l: p.l, era: p.era, whip: p.whip, ip: p.ip, k: p.k, bb: p.bb };
    })
    .sort((a, b) => a.era - b.era)
    .slice(0, 20) as PitcherRow[];

  $: batterRows = Object.entries(filteredLbStats)
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
              <div class="tbl-wrap">
                <table class="stbl full hs-fixed">
                  <colgroup>
                    <col style="width:28px"><col style="width:110px">
                    <col style="width:32px"><col style="width:32px"><col style="width:28px">
                    <col style="width:44px"><col style="width:40px"><col style="width:40px">
                    <col style="width:46px"><col style="width:56px">
                  </colgroup>
                  <thead>
                    <tr>
                      <th>#</th><th class="t-name">팀</th><th>승</th><th>패</th><th>무</th>
                      <th>승률</th><th>득점</th><th>실점</th><th>연속</th><th>최근10</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="group-row"><td colspan="10">A조</td></tr>
                    {#if hsGroupAStandings.length === 0}
                      <tr><td colspan="10" class="empty-cell">아직 경기 데이터가 없습니다.</td></tr>
                    {:else}
                      {#each hsGroupAStandings as s, i}
                        <tr class:my-row={s.teamId === myTeamId}>
                          <td>{i + 1}</td>
                          <td class="t-name">{tName(s.teamId)}</td>
                          <td class="w">{s.wins}</td><td class="l">{s.losses}</td><td>{s.draws}</td>
                          <td>{s.winPct.toFixed(2)}</td><td>{s.runsFor}</td><td>{s.runsAgainst}</td>
                          <td class:streak-w={s.streak.startsWith("W")} class:streak-l={s.streak.startsWith("L")}>{s.streak || "-"}</td>
                          <td>{s.last10 || "-"}</td>
                        </tr>
                      {/each}
                    {/if}
                    <tr class="group-row"><td colspan="10">B조</td></tr>
                    {#if hsGroupBStandings.length === 0}
                      <tr><td colspan="10" class="empty-cell">아직 경기 데이터가 없습니다.</td></tr>
                    {:else}
                      {#each hsGroupBStandings as s, i}
                        <tr class:my-row={s.teamId === myTeamId}>
                          <td>{i + 1}</td>
                          <td class="t-name">{tName(s.teamId)}</td>
                          <td class="w">{s.wins}</td><td class="l">{s.losses}</td><td>{s.draws}</td>
                          <td>{s.winPct.toFixed(2)}</td><td>{s.runsFor}</td><td>{s.runsAgainst}</td>
                          <td class:streak-w={s.streak.startsWith("W")} class:streak-l={s.streak.startsWith("L")}>{s.streak || "-"}</td>
                          <td>{s.last10 || "-"}</td>
                        </tr>
                      {/each}
                    {/if}
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
            {#if lbLeagueId === "LEAGUE_HIGHSCHOOL"}
              <div class="hs-group-tabs">
                <button class:active={hsLbGroup === "all"} on:click={() => (hsLbGroup = "all")}>통합</button>
                <button class:active={hsLbGroup === "A"}   on:click={() => (hsLbGroup = "A")}>A조</button>
                <button class:active={hsLbGroup === "B"}   on:click={() => (hsLbGroup = "B")}>B조</button>
              </div>
            {/if}
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

          <!-- 연도 -->
          {#if txAllYears.length > 0}
            <div class="tx-filter-group">
              <button class="tx-filter-btn" class:tx-active={txYear === 0} on:click={() => { txYear = 0; }}>전체</button>
              {#each txAllYears as yr}
                <button class="tx-filter-btn" class:tx-active={txYear === yr} on:click={() => { txYear = yr; }}>{yr}년</button>
              {/each}
            </div>
          {/if}
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
                    <span class="tx-icon">{TX_ICON[group.category] ?? "·"}</span>
                    <div class="tx-body">
                      {#if group.category === "trade"}
                        <!-- 트레이드: 두 선수 한 줄 -->
                        {@const [r1, r2] = group.rows}
                        <span class="tx-tag tag-trade">트레이드</span>
                        <span class="tx-detail">
                          <strong>{r1.playerName}</strong>
                          <span class="tx-arrow">{txTeamName(r1.fromTeamId)} → {txTeamName(r1.toTeamId)}</span>
                          {#if r2}
                            &nbsp;/&nbsp;
                            <strong>{r2.playerName}</strong>
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
                          <strong>{r.playerName}</strong>
                          {#if r.toTeamId}<span class="tx-arrow">→ {txTeamName(r.toTeamId)}</span>{/if}
                        </span>
                        {#if r.detail}<span class="tx-reason">{r.detail}</span>{/if}
                      {:else if group.category === "draft"}
                        {@const r = group.rows[0]}
                        <span class="tx-tag tag-draft">드래프트</span>
                        <span class="tx-detail">
                          <strong>{r.playerName}</strong>
                          {#if r.toTeamId}<span class="tx-arrow">→ {txTeamName(r.toTeamId)}</span>{/if}
                        </span>
                        {#if r.detail}<span class="tx-reason">{r.detail}</span>{/if}
                      {:else if group.category === "military"}
                        {@const r = group.rows[0]}
                        <span class="tx-tag tag-military">병역</span>
                        <span class="tx-detail"><strong>{r.playerName}</strong></span>
                        {#if r.detail}<span class="tx-reason">{r.detail}</span>{/if}
                      {:else if group.category === "retirement"}
                        {@const r = group.rows[0]}
                        <span class="tx-tag tag-retirement">은퇴</span>
                        <span class="tx-detail">
                          <strong>{r.playerName}</strong>
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

  .stbl.hs-fixed { table-layout: fixed; }
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

  .hs-group-tabs { display: flex; gap: 4px; margin-left: auto; }
  .hs-group-tabs button {
    border: 1px solid #2d4870;
    background: #172540;
    color: #b0c8ee;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .hs-group-tabs button.active { background: #1e4a30; border-color: #3a9a60; color: #80e8a8; }

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
  .tag-military   { background: #2a1060; color: #c080ff; }
  .tag-retirement { background: #3a1008; color: #ff9070; }

  .tx-detail { color: #c8dcf6; }
  .tx-detail strong { color: #eef6ff; }
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

  @media (max-width: 1180px) {
    .standings-layout { grid-template-columns: 80px 1fr; }
    .lb-layout { grid-template-columns: 80px 1fr; }
  }
</style>
