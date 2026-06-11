<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../../shared/i18n";
  import { masterStore } from "../../shared/stores/master";
  import type { EntityDetails } from "../../shared/stores/master";
  import { gameStore } from "../../shared/stores/game";
  import TeamDetailModal from "../../features/team/ui/TeamDetailModal.svelte";

  type LeagueTab = "all" | "hs" | "univ" | "ind" | "kbl" | "abl" | "jbl";
  const LEAGUE_MAP: Record<Exclude<LeagueTab, "all">, string> = {
    hs:   "LEAGUE_HIGHSCHOOL",
    univ: "LEAGUE_UNIVERSITY",
    ind:  "LEAGUE_INDEPENDENT",
    kbl:  "LEAGUE_KBL",
    abl:  "LEAGUE_ABL",
    jbl:  "LEAGUE_JBL",
  };

  let leagueTab: LeagueTab = "all";
  let selectedTeamId = "";
  let detailTeamId = "";
  let detailOpen = false;

  $: myTeamId = $gameStore.protagonist.teamId;

  function leagueLabel(tab: LeagueTab): string {
    const labels: Record<LeagueTab, string> = {
      all: "전체", hs: "고교리그", univ: "대학리그",
      ind: "독립리그", kbl: "KBL", abl: "ABL", jbl: "JBL",
    };
    return labels[tab] ?? tab;
  }

  function teamLeagueLabel(leagueId: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL: "고교", LEAGUE_UNIVERSITY: "대학",
      LEAGUE_INDEPENDENT: "독립", LEAGUE_KBL: "KBL",
      LEAGUE_ABL: "ABL", LEAGUE_JBL: "JBL",
    };
    return map[leagueId] ?? leagueId;
  }

  $: filteredTeams = $masterStore.teams.filter((team) => {
    if (leagueTab === "all") return true;
    return team.leagueId === LEAGUE_MAP[leagueTab as Exclude<LeagueTab, "all">];
  });

  const TIER_ORDER: Record<string, number> = { "1군": 0, "메이저": 0, "2군": 1, "마이너": 1, "육성": 2, AAA: 3, AA: 4, A: 5 };
  function tierOrd(t?: string) { return t != null ? (TIER_ORDER[t] ?? 6) : 0; }

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
      id: p.id, name: p.name, role: "player" as const,
      teamId: p.teamId, age: p.age, status: "active" as const,
      details: { player: { position: p.position, playerType: p.playerType } as EntityDetails["player"], coach: null, manager: null, owner: null },
    };
  })();

  $: teamRows = selectedTeamId
    ? [
        ...(protagonistTeamRow?.teamId === selectedTeamId ? [protagonistTeamRow] : []),
        ...$masterStore.entities.filter((e) => e.teamId === selectedTeamId),
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

  async function ensureLeagueEntities(leagueId: string) {
    if (!leagueId) return;
    await masterStore.loadEntities(leagueId);
  }

  onMount(async () => {
    const initialLeague = sortedTeams[0]?.leagueId ?? "LEAGUE_HIGHSCHOOL";
    await ensureLeagueEntities(initialLeague);
  });

  $: if (selectedTeamLeagueId) {
    ensureLeagueEntities(selectedTeamLeagueId);
  }
</script>

<section class="page">
  <h2>{$t("page.team")}</h2>
  <article class="card board">
    <header class="top-row">
      <div class="league-tabs">
        {#each (["all", "hs", "univ", "ind", "kbl", "abl", "jbl"] as LeagueTab[]) as tab}
          <button class:active={leagueTab === tab} on:click={() => (leagueTab = tab)}>{leagueLabel(tab)}</button>
        {/each}
      </div>
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
                on:click={() => (selectedTeamId = team.id)}
                on:dblclick={() => { detailTeamId = team.id; detailOpen = true; }}
                title="더블클릭: 팀 상세 정보"
              >
                <strong class="team-name-cell">
                  {team.name}
                  {#if team.id === myTeamId}
                    <span class="my-team-tag">소속팀</span>
                  {/if}
                </strong>
                <span>{teamLeagueLabel(team.leagueId)}</span>
              </button>
            {/each}
          {/if}
        </div>
      </section>

      <aside class="panel detail">
        {#if selectedTeam}
          <h3>
            {selectedTeam.name}
            {#if selectedTeam.id === myTeamId}
              <span class="my-team-tag">소속팀</span>
            {/if}
          </h3>
          <p class="meta">{teamLeagueLabel(selectedTeam.leagueId)}{#if selectedTeam.city} · {selectedTeam.city}{/if}</p>

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
                  <span>{row.role === "player" ? (p?.position ?? "-") : row.role === "manager" ? "감독" : row.role === "coach" ? "코치" : row.role === "owner" ? "구단주" : row.role}</span>
                </div>
              {/each}
            {/if}
          </div>
        {:else}
          <p class="empty">팀을 선택하세요.</p>
        {/if}
      </aside>
    </div>

  </article>
</section>

<TeamDetailModal
  teamId={detailTeamId}
  open={detailOpen}
  on:close={() => (detailOpen = false)}
/>

<style>
  .page { display:grid; grid-template-rows:auto minmax(0,1fr); gap:12px; height:100%; min-height:0; overflow:hidden; }
  .card { background:#161f33; border:1px solid #2d3956; border-radius:10px; padding:12px; min-height:0; overflow:hidden; }
  .board { display:grid; grid-template-rows:auto minmax(0,1fr); gap:10px; }
  .top-row { display:flex; align-items:center; }
  .league-tabs { display:flex; gap:6px; flex-wrap:wrap; }
  .league-tabs button { border:1px solid #355182; background:#1f2f4f; color:#dbe8ff; border-radius:8px; padding:5px 10px; font-size:12px; }
  .league-tabs button.active { background:#3262b0; border-color:#6da1f7; }
  .layout { display:grid; grid-template-columns:1fr 1fr; gap:10px; min-height:0; }
  .panel { border:1px solid #2f486f; border-radius:10px; background:#13223d; padding:10px; min-height:0; overflow:hidden; }
  .team-list { display:grid; grid-template-rows:auto minmax(0,1fr); gap:6px; }
  .head, .rows button { display:grid; grid-template-columns:1fr 0.5fr; gap:6px; align-items:center; font-size:12px; }
  .head { color:#9fb4d8; padding:0 6px; }
  .rows { min-height:0; overflow:auto; display:grid; align-content:start; gap:4px; }
  .rows button { border:1px solid #284269; background:#162a4a; border-radius:8px; padding:7px 6px; color:#e4edff; text-align:left; cursor:pointer; }
  .rows button.selected { border-color:#79abf6; background:#1d3760; }
  .rows button.my-team { border-color:rgba(240,224,96,0.5); background:rgba(240,224,96,0.06); }
  .rows button.my-team.selected { border-color:#f0e060; background:rgba(240,224,96,0.12); }
  .rows button strong { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .team-name-cell { display:flex; align-items:center; gap:5px; min-width:0; }
  .my-team-tag {
    flex-shrink:0;
    font-size:9px; font-weight:700;
    background:rgba(240,224,96,0.2); color:#f0e060;
    border:1px solid rgba(240,224,96,0.4);
    border-radius:3px; padding:0 4px;
    white-space:nowrap;
  }
  .tier-sep { color:#5a7aaa; font-size:11px; padding:4px 6px 2px; display:flex; align-items:center; gap:6px; }
  .tier-sep::before, .tier-sep::after { content:""; flex:1; height:1px; background:#2a3f62; }
  .tier-sep::before { flex:0 0 6px; }
  .detail { display:grid; grid-template-rows:auto auto auto auto minmax(0,1fr); gap:8px; }
  .detail h3 { margin:0; font-size:16px; color:#e8f0ff; display:flex; align-items:center; gap:6px; }
  .meta { margin:0; color:#93add6; font-size:12px; }
  .metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  .metrics div { border:1px solid #2e486f; border-radius:8px; background:#152b4f; padding:7px; display:grid; gap:2px; }
  .metrics span { color:#9eb6de; font-size:11px; }
  .metrics strong { color:#eff5ff; font-size:14px; }
  .roster-head { color:#cfe3ff; font-size:13px; font-weight:700; }
  .roster-rows { min-height:0; overflow:auto; display:grid; gap:4px; }
  .roster-row { border:1px solid #2b4268; background:#142743; border-radius:8px; padding:6px 8px; display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; font-size:12px; }
  .roster-row strong { display:flex; align-items:center; gap:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .roster-row span { color:#a8bfdc; white-space:nowrap; }
  .roster-row.hero-row { border-color:rgba(240,224,96,0.35); background:rgba(240,224,96,0.05); }
  .me-tag {
    font-size:9px; font-weight:700;
    background:rgba(240,224,96,0.2); color:#f0e060;
    border:1px solid rgba(240,224,96,0.4);
    border-radius:3px; padding:0 4px; flex-shrink:0;
  }
  .empty { color:#9db2d8; font-size:13px; }
  @media (max-width:1180px){ .layout { grid-template-columns:1fr; } }
</style>
