<script lang="ts">
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { masterStore } from "../../shared/stores/master";

  type TeamTab = "my" | "all";
  type TeamSortField = "rank" | "winPct" | "name";
  type SortDirection = "asc" | "desc";

  let tab: TeamTab = "my";
  let sortField: TeamSortField = "rank";
  let sortDirection: SortDirection = "asc";
  let selectedTeamId = "";

  function tName(teamId: string): string {
    return $masterStore.teams.find((x) => x.id === teamId)?.name ?? teamId;
  }

  $: myTeamId = $gameStore.protagonist.teamId;
  $: sorted = [...$seasonStore.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  $: rows = sorted.map((s, i) => ({
    id: s.teamId,
    rank: i + 1,
    name: tName(s.teamId),
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    winPct: s.winPct,
    runsFor: s.runsFor,
    runsAgainst: s.runsAgainst,
    streak: s.streak || "-"
  }));

  $: if (!selectedTeamId && rows.length > 0) selectedTeamId = rows[0].id;
  $: my = rows.find((r) => r.id === myTeamId) ?? rows[0] ?? null;
  $: selected = rows.find((r) => r.id === selectedTeamId) ?? rows[0] ?? null;

  $: visible = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") cmp = a.name.localeCompare(b.name, "ko");
    else cmp = Number(a[sortField]) - Number(b[sortField]);
    return sortDirection === "asc" ? cmp : -cmp;
  });

  function toggleSortDirection() {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  }
</script>

<section class="page">
  <h2>{$t("page.team")}</h2>
  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "my"} on:click={() => (tab = "my")}>내 팀</button>
        <button class:active={tab === "all"} on:click={() => (tab = "all")}>전체 팀</button>
      </div>
      {#if tab === "all"}
        <div class="tools">
          <select bind:value={sortField}>
            <option value="rank">순위</option>
            <option value="winPct">승률</option>
            <option value="name">팀명</option>
          </select>
          <button class="sort-dir" on:click={toggleSortDirection}>
            {sortDirection === "asc" ? "오름차순" : "내림차순"}
          </button>
        </div>
      {/if}
    </header>

    {#if rows.length === 0}
      <p class="empty">시즌 팀 데이터가 없습니다.</p>
    {:else if tab === "my" && my}
      <div class="my-team-layout">
        <section class="panel">
          <h3>{my.name}</h3>
          <div class="metrics">
            <div><span>순위</span><strong>{my.rank}위</strong></div>
            <div><span>승-패-무</span><strong>{my.wins}-{my.losses}-{my.draws}</strong></div>
            <div><span>승률</span><strong>{my.winPct.toFixed(3)}</strong></div>
            <div><span>연속</span><strong>{my.streak}</strong></div>
            <div><span>득점</span><strong>{my.runsFor}</strong></div>
            <div><span>실점</span><strong>{my.runsAgainst}</strong></div>
          </div>
        </section>
      </div>
    {:else}
      <div class="all-team-layout">
        <section class="team-list panel">
          <div class="team-list-head">
            <span>팀</span><span>순위</span><span>승-패-무</span><span>승률</span>
          </div>
          <div class="team-rows">
            {#each visible as team}
              <button class:selected={selected?.id === team.id} on:click={() => (selectedTeamId = team.id)}>
                <strong>{team.name}</strong>
                <span>{team.rank}</span>
                <span>{team.wins}-{team.losses}-{team.draws}</span>
                <span>{team.winPct.toFixed(3)}</span>
              </button>
            {/each}
          </div>
        </section>
        {#if selected}
          <aside class="team-detail panel">
            <h3>{selected.name}</h3>
            <div class="metrics">
              <div><span>순위</span><strong>{selected.rank}위</strong></div>
              <div><span>승-패-무</span><strong>{selected.wins}-{selected.losses}-{selected.draws}</strong></div>
              <div><span>승률</span><strong>{selected.winPct.toFixed(3)}</strong></div>
              <div><span>연속</span><strong>{selected.streak}</strong></div>
              <div><span>득점</span><strong>{selected.runsFor}</strong></div>
              <div><span>실점</span><strong>{selected.runsAgainst}</strong></div>
            </div>
          </aside>
        {/if}
      </div>
    {/if}
  </article>
</section>

<style>
  .page { display:grid; grid-template-rows:auto minmax(0,1fr); gap:12px; height:100%; min-height:0; overflow:hidden; }
  .card { background:#161f33; border:1px solid #2d3956; border-radius:10px; padding:12px; min-height:0; overflow:hidden; }
  .board { display:grid; grid-template-rows:auto minmax(0,1fr); gap:10px; }
  .top-row { display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .tabs { display:flex; gap:6px; }
  .tabs button, .tools select, .sort-dir { border:1px solid #355182; background:#1f2f4f; color:#dbe8ff; border-radius:8px; padding:5px 10px; font-size:12px; }
  .tabs button.active { background:#3262b0; border-color:#6da1f7; }
  .sort-dir { cursor:pointer; }
  .my-team-layout, .all-team-layout { min-height:0; overflow:hidden; }
  .all-team-layout { display:grid; grid-template-columns:1fr 0.9fr; gap:10px; }
  .panel { border:1px solid #2f486f; border-radius:10px; background:#13223d; padding:10px; min-height:0; overflow:hidden; }
  .metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin-top:8px; }
  .metrics div { border:1px solid #2e486f; border-radius:8px; background:#152b4f; padding:7px; display:grid; gap:2px; }
  .metrics span { color:#9eb6de; font-size:11px; }
  .metrics strong { color:#eff5ff; font-size:14px; }
  .team-list { display:grid; grid-template-rows:auto minmax(0,1fr); gap:6px; }
  .team-list-head, .team-rows button { display:grid; grid-template-columns:1fr 0.45fr 0.9fr 0.7fr; gap:6px; align-items:center; font-size:12px; }
  .team-list-head { color:#9fb4d8; padding:0 6px; }
  .team-rows { min-height:0; overflow:auto; display:grid; align-content:start; gap:4px; }
  .team-rows button { border:1px solid #284269; background:#162a4a; border-radius:8px; padding:7px 6px; color:#e4edff; text-align:left; cursor:pointer; }
  .team-rows button.selected { border-color:#79abf6; background:#1d3760; }
  .team-rows button strong { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .empty { color:#9db2d8; font-size:13px; }
  @media (max-width:1180px){ .all-team-layout { grid-template-columns:1fr; } .team-detail{ display:none; } }
</style>

