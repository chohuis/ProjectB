<script lang="ts">
  import { teamTokens } from "../../shared/utils/teamTheme";
  import { masterStore, entitiesL10n, teamsL10n } from "../../shared/stores/master";
  import { inScope, isLeagueInScope } from "../../shared/config/releaseScope";
  import type { EntityDetails } from "../../shared/stores/master";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import TeamDetailModal from "../../features/team/ui/TeamDetailModal.svelte";
  import TeamMark from "../../features/team/ui/TeamMark.svelte";

  type LeagueTab = "all" | "hs" | "univ" | "ind" | "kbl" | "abl" | "jbl";
  const LEAGUE_MAP: Record<Exclude<LeagueTab, "all">, string> = {
    hs: "LEAGUE_HIGHSCHOOL",
    univ: "LEAGUE_UNIVERSITY",
    ind: "LEAGUE_INDEPENDENT",
    kbl: "LEAGUE_KBL",
    abl: "LEAGUE_ABL",
    jbl: "LEAGUE_JBL",
  };

  /** 범위 밖 리그 탭은 아예 안 그린다 (확장팩에서 releaseScope Set을 비우면 돌아온다) */
  const SCOPED_TABS: LeagueTab[] = (
    ["all", "hs", "univ", "ind", "kbl", "abl", "jbl"] as LeagueTab[]
  ).filter((t) => t === "all" || isLeagueInScope(LEAGUE_MAP[t as Exclude<LeagueTab, "all">]));

  let leagueTab: LeagueTab = "all";
  let selectedTeamId = "";
  let detailTeamId = "";
  let detailOpen = false;

  $: myTeamId = $gameStore.protagonist.teamId;

  function leagueLabel(tab: LeagueTab): string {
    const labels: Record<LeagueTab, string> = {
      all: "전체",
      hs: "고교리그",
      univ: "대학리그",
      ind: "독립리그",
      kbl: "KBL",
      abl: "ABL",
      jbl: "JBL",
    };
    return labels[tab] ?? tab;
  }

  function teamLeagueLabel(leagueId: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL: "고교",
      LEAGUE_UNIVERSITY: "대학",
      LEAGUE_INDEPENDENT: "독립",
      LEAGUE_KBL: "KBL",
      LEAGUE_ABL: "ABL",
      LEAGUE_JBL: "JBL",
    };
    return map[leagueId] ?? leagueId;
  }

  // 1차 출시 범위 밖(해외) 팀은 목록에 넣지 않는다 — releaseScope.ts
  $: filteredTeams = inScope($teamsL10n).filter((team) => {
    if (leagueTab === "all") return true;
    return team.leagueId === LEAGUE_MAP[leagueTab as Exclude<LeagueTab, "all">];
  });

  const TIER_ORDER: Record<string, number> = {
    "1군": 0,
    메이저: 0,
    "2군": 1,
    마이너: 1,
    육성: 2,
    AAA: 3,
    AA: 4,
    A: 5,
  };
  function tierOrd(t?: string) {
    return t != null ? (TIER_ORDER[t] ?? 6) : 0;
  }

  $: sortedTeams = [...filteredTeams].sort((a, b) => {
    if (a.id === myTeamId) return -1;
    if (b.id === myTeamId) return 1;
    const td = tierOrd(a.tier) - tierOrd(b.tier);
    return td !== 0 ? td : a.name.localeCompare(b.name, "ko");
  });

  $: if (!selectedTeamId || !sortedTeams.some((t) => t.id === selectedTeamId)) {
    selectedTeamId = sortedTeams[0]?.id ?? "";
  }

  $: selectedTeam = sortedTeams.find((t) => t.id === selectedTeamId) ?? null;
  $: selectedTeamLeagueId = selectedTeam?.leagueId ?? "";

  $: protagonistTeamRow = (() => {
    const p = $gameStore.protagonist;
    if (!p.teamId) return null;
    return {
      id: p.id,
      name: p.name,
      role: "player" as const,
      teamId: p.teamId,
      age: p.age,
      status: "active" as const,
      details: {
        player: { position: p.position, playerType: p.playerType } as EntityDetails["player"],
        coach: null,
        manager: null,
        owner: null,
      },
    };
  })();

  $: teamRows = selectedTeamId
    ? [
        ...(protagonistTeamRow?.teamId === selectedTeamId ? [protagonistTeamRow] : []),
        ...$entitiesL10n.filter((e) => e.teamId === selectedTeamId),
      ].sort((a, b) => {
        const roleOrder: Record<string, number> = { owner: 0, manager: 1, coach: 2, player: 3 };
        const diff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, "ko");
      })
    : [];

  $: playerCount = teamRows.filter((e) => e.role === "player").length;
  $: coachCount = teamRows.filter((e) => e.role === "coach").length;
  $: managerCount = teamRows.filter((e) => e.role === "manager").length;

  // ⚠ 여기 `onMount`가 있었는데 지역 변수 하나를 만들고 아무것도 안 했다.
  // 초기 리그 선택은 위 반응형 블록이 이미 한다.

  /** 팀 색 띠 — 182팀 목록에서 어느 팀인지 색으로 먼저 잡힌다 */
  function stripeOf(colors?: readonly string[] | null): string {
    return teamTokens(colors).dark;
  }
</script>

<!-- 제목("팀")을 뺐다 — 사이드바가 이미 그 이름이다 -->
<section class="page">
  <div class="board">
    <header class="top-row">
      <div class="u-subtabs">
        {#each SCOPED_TABS as tab}
          <button class:on={leagueTab === tab} on:click={() => (leagueTab = tab)}
            >{leagueLabel(tab)}</button
          >
        {/each}
      </div>
      <span class="count u-num">{sortedTeams.length}팀</span>
    </header>

    <div class="layout">
      <section class="team-list panel">
        <div class="head"><span>팀</span><span>리그</span></div>
        <div class="rows">
          {#if sortedTeams.length === 0}
            <p class="empty">표시할 팀이 없습니다.</p>
          {:else}
            {#each sortedTeams as team, i}
              {#if leagueTab !== "all" && i > 0 && team.id !== myTeamId && team.tier && sortedTeams[i - 1].tier !== team.tier}
                <div class="tier-sep">{team.tier}</div>
              {/if}
              <button
                class:selected={selectedTeamId === team.id}
                class:my-team={team.id === myTeamId}
                style="--stripe:{stripeOf(team.colors)}"
                on:click={() => (selectedTeamId = team.id)}
                on:dblclick={() => {
                  detailTeamId = team.id;
                  detailOpen = true;
                }}
                title="더블클릭: 팀 상세 정보"
              >
                <strong class="team-name-cell">
                  <TeamMark teamId={team.id} size={20} />
                  {team.name}
                  {#if team.id === myTeamId}
                    <span class="my-team-tag">소속팀</span>
                  {/if}
                </strong>
                <span class="lg">{teamLeagueLabel(team.leagueId)}</span>
              </button>
            {/each}
          {/if}
        </div>
      </section>

      <aside class="panel detail">
        {#if selectedTeam}
          <div class="detail-head">
            <TeamMark teamId={selectedTeam.id} size={56} />
            <div class="detail-stripe" style="background:{stripeOf(selectedTeam.colors)}"></div>
          </div>
          <h3>
            {selectedTeam.name}
            {#if selectedTeam.id === myTeamId}
              <span class="my-team-tag">소속팀</span>
            {/if}
          </h3>
          <p class="meta">
            {teamLeagueLabel(selectedTeam.leagueId)}{#if selectedTeam.city}
              · {selectedTeam.city}{/if}
          </p>

          <div class="metrics">
            <div><span>선수</span><strong>{playerCount}</strong></div>
            <div><span>코치</span><strong>{coachCount}</strong></div>
            <div><span>감독</span><strong>{managerCount}</strong></div>
            <div><span>총 인원</span><strong>{teamRows.length}</strong></div>
          </div>

          <div class="roster-head">로스터</div>
          <div class="roster-rows">
            {#if teamRows.length === 0}
              <p class="empty">로스터 데이터가 없습니다.</p>
            {:else}
              {#each teamRows as row}
                {@const p = (row.details as EntityDetails)?.player}
                <div class="roster-row" class:hero-row={row.id === $gameStore.protagonist.id}>
                  <strong>
                    {row.name}
                    {#if row.id === $gameStore.protagonist.id}
                      <span class="me-tag">나</span>
                    {/if}
                  </strong>
                  <span
                    >{row.role === "player"
                      ? (p?.position ?? "-")
                      : row.role === "manager"
                        ? "감독"
                        : row.role === "coach"
                          ? "코치"
                          : row.role === "owner"
                            ? "구단주"
                            : row.role}</span
                  >
                </div>
              {/each}
            {/if}
          </div>
        {:else}
          <p class="empty">팀을 선택하세요.</p>
        {/if}
      </aside>
    </div>
  </div>
</section>

<TeamDetailModal teamId={detailTeamId} open={detailOpen} on:close={() => (detailOpen = false)} />

<style>
  .page {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  .board {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }
  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .count {
    font-size: 10.5px;
    color: var(--ink-mute);
  }

  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    min-height: 0;
  }

  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .team-list {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
  }
  .head,
  .rows button {
    display: grid;
    grid-template-columns: 1fr 0.5fr;
    gap: 8px;
    align-items: center;
    font-size: 12.5px;
  }
  .head {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--ink-mute);
    padding: 0 10px 6px;
    border-bottom: 2px solid var(--t-dark);
  }
  .rows {
    min-height: 0;
    overflow: auto;
    display: grid;
    align-content: start;
  }

  /* 왼쪽 3px가 그 팀의 색이다 — 182팀을 훑을 때 이름보다 색이 먼저 잡힌다 */
  .rows button {
    border: 0;
    border-left: 3px solid var(--stripe);
    border-bottom: 1px solid var(--line);
    background: none;
    padding: 8px 10px;
    color: var(--ink-mid);
    text-align: left;
    cursor: pointer;
  }
  .rows button:hover {
    background: var(--panel-sunk);
  }
  .rows button.selected {
    background: var(--panel-sunk);
    color: var(--ink);
    font-weight: 700;
  }
  .rows button.my-team .team-name-cell {
    color: var(--t-dark);
    font-weight: 800;
  }
  .rows button strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lg {
    color: var(--ink-mute);
    font-size: 11px;
  }

  .team-name-cell {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .my-team-tag,
  .me-tag {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 800;
    background: var(--t-dark);
    color: var(--t-gold);
    border-radius: 2px;
    padding: 1px 5px;
    white-space: nowrap;
  }

  .tier-sep {
    color: var(--ink-mute);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    padding: 10px 10px 4px;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .tier-sep::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  /* -- 오른쪽 상세 -- */
  .detail {
    display: grid;
    grid-template-rows: auto auto auto auto auto minmax(0, 1fr);
    gap: 8px;
    position: relative;
  }
  .detail-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .detail-stripe {
    height: 4px;
    border-radius: 2px;
    flex: 1;
  }
  .detail h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .meta {
    margin: 0;
    color: var(--ink-mute);
    font-size: 12px;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .metrics div {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 8px 9px;
    display: grid;
    gap: 1px;
  }
  .metrics span {
    color: var(--ink-mute);
    font-size: 10px;
  }
  .metrics strong {
    color: var(--ink);
    font-size: 15px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .roster-head {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--ink-mute);
    text-transform: uppercase;
    padding-bottom: 5px;
    border-bottom: 2px solid var(--t-dark);
  }
  .roster-rows {
    min-height: 0;
    overflow: auto;
    display: grid;
  }
  .roster-row {
    border-bottom: 1px solid var(--line);
    padding: 7px 2px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    color: var(--ink-mid);
  }
  .roster-row:last-child {
    border-bottom: 0;
  }
  .roster-row strong {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--ink);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .roster-row span {
    color: var(--ink-mute);
    white-space: nowrap;
  }
  .roster-row.hero-row strong {
    color: var(--t-dark);
    font-weight: 800;
  }

  .empty {
    color: var(--ink-mute);
    font-size: 12.5px;
  }

  @media (max-width: 1180px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
