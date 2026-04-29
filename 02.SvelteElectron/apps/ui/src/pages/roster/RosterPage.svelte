<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";
  import { seasonStore } from "../../shared/stores/season";

  type RosterTab = "all" | "pitcher" | "batter" | "staff";
  type RoleTab = "player" | "coach" | "manager" | "owner";

  let tab: RosterTab = "all";
  let keyword = "";
  let selectedId = "";

  function toLeagueId(stage: string): string {
    if (stage === "highschool") return "LEAGUE_HIGHSCHOOL";
    if (stage === "university") return "LEAGUE_UNIVERSITY";
    if (stage === "pro_kbl") return "LEAGUE_KBL";
    if (stage === "pro_abl") return "LEAGUE_ABL";
    return "LEAGUE_HIGHSCHOOL";
  }

  function isPitcherPosition(position: string): boolean {
    return position === "SP" || position === "RP" || position === "CP";
  }

  function roleLabel(role: RoleTab): string {
    if (role === "coach") return "코치";
    if (role === "manager") return "감독";
    if (role === "owner") return "구단주";
    return "선수";
  }

  function conditionLabel(value: number): string {
    if (value >= 70) return "좋음";
    if (value >= 40) return "보통";
    return "주의";
  }

  async function loadLeagueEntities() {
    const leagueId = toLeagueId($gameStore.protagonist.careerStage);
    await masterStore.loadEntities(leagueId);
  }

  onMount(async () => {
    await loadLeagueEntities();
  });

  $: currentLeagueId = toLeagueId($gameStore.protagonist.careerStage);
  $: if (currentLeagueId) {
    loadLeagueEntities();
  }

  $: myTeamId = $gameStore.protagonist.teamId;
  $: teamRows = $masterStore.entities.filter((e) => e.teamId === myTeamId);
  $: normalized = keyword.trim().toLowerCase();
  $: searchedRows = teamRows.filter((e) => e.name.toLowerCase().includes(normalized));

  $: filteredRows = searchedRows.filter((e) => {
    if (tab === "all") return true;
    if (tab === "staff") return e.role !== "player";
    if (tab === "pitcher") return e.role === "player" && isPitcherPosition(String((e.details as any)?.player?.position ?? ""));
    if (tab === "batter") return e.role === "player" && !isPitcherPosition(String((e.details as any)?.player?.position ?? ""));
    return true;
  });

  $: sortedRows = [...filteredRows].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  $: if (sortedRows.length > 0 && !sortedRows.some((x) => x.id === selectedId)) selectedId = sortedRows[0].id;
  $: selected = sortedRows.find((x) => x.id === selectedId) ?? null;

  $: selectedStats = selected ? $seasonStore.stats[selected.id] ?? null : null;
</script>

<section class="page">
  <h2>{$t("page.roster")}</h2>

  <article class="card board">
    <header class="tools">
      <div class="tabs">
        <button class:active={tab === "all"} on:click={() => (tab = "all")}>전체</button>
        <button class:active={tab === "pitcher"} on:click={() => (tab = "pitcher")}>투수</button>
        <button class:active={tab === "batter"} on:click={() => (tab = "batter")}>타자</button>
        <button class:active={tab === "staff"} on:click={() => (tab = "staff")}>스태프</button>
      </div>
      <input bind:value={keyword} placeholder="이름 검색" />
    </header>

    <div class="content-grid">
      <section class="list-wrap">
        <div class="head-row">
          <span>이름</span>
          <span>역할</span>
          <span>포지션</span>
          <span>나이</span>
          <span>상태</span>
        </div>
        <div class="rows">
          {#if sortedRows.length === 0}
            <p class="empty">검색 결과가 없습니다.</p>
          {:else}
            {#each sortedRows as row}
              {@const p = (row.details as any)?.player}
              <button class="data-row" class:selected={selected?.id === row.id} on:click={() => (selectedId = row.id)}>
                <strong>{row.name}</strong>
                <span>{roleLabel(row.role as RoleTab)}</span>
                <span>{row.role === "player" ? (p?.position ?? "-") : "-"}</span>
                <span>{row.age}</span>
                <span>{row.status}</span>
              </button>
            {/each}
          {/if}
        </div>
      </section>

      <aside class="detail-card">
        {#if selected}
          {@const p = (selected.details as any)?.player}
          {@const c = (selected.details as any)?.coach}
          {@const m = (selected.details as any)?.manager}
          <h3>{selected.name}</h3>
          <p>{roleLabel(selected.role as RoleTab)} · {selected.age}세</p>

          {#if selected.role === "player"}
            <section class="detail-section">
              <h4>기본 능력치</h4>
              <div class="ability-grid">
                <div><span>OVR(투구)</span><strong>{p?.pitching?.ovr ?? "-"}</strong></div>
                <div><span>OVR(타격)</span><strong>{p?.batting?.ovr ?? "-"}</strong></div>
                <div><span>컨디션</span><strong>{conditionLabel($gameStore.protagonist.condition)}</strong></div>
              </div>
            </section>

            <section class="detail-section">
              <h4>시즌 누적</h4>
              {#if selectedStats}
                {#if selectedStats.type === "pitcher"}
                  <ul class="stat-list">
                    <li>G: {selectedStats.g}</li><li>IP: {selectedStats.ip}</li><li>ERA: {selectedStats.era.toFixed(2)}</li>
                    <li>WHIP: {selectedStats.whip.toFixed(2)}</li><li>K: {selectedStats.k}</li><li>BB: {selectedStats.bb}</li>
                  </ul>
                {:else}
                  <ul class="stat-list">
                    <li>G: {selectedStats.g}</li><li>AVG: {selectedStats.avg.toFixed(3)}</li><li>OPS: {selectedStats.ops.toFixed(3)}</li>
                    <li>HR: {selectedStats.hr}</li><li>RBI: {selectedStats.rbi}</li><li>SB: {selectedStats.sb}</li>
                  </ul>
                {/if}
              {:else}
                <p class="pending">시즌 누적 집계 중</p>
              {/if}
            </section>

            <section class="detail-section">
              <h4>최근 5경기</h4>
              <p class="pending">집계 중</p>
            </section>
          {:else}
            <section class="detail-section">
              <h4>스태프 정보</h4>
              <div class="ability-grid">
                <div><span>전문</span><strong>{c?.specialty ?? m?.style ?? "-"}</strong></div>
                <div><span>리더십</span><strong>{c?.stats?.leadership ?? m?.stats?.moraleMgmt ?? "-"}</strong></div>
                <div><span>메모</span><strong>{selected.notes || "-"}</strong></div>
              </div>
            </section>
          {/if}
        {:else}
          <p class="empty">선택된 인물이 없습니다.</p>
        {/if}
      </aside>
    </div>
  </article>
</section>

<style>
  .page { display:grid; grid-template-rows:auto minmax(0,1fr); gap:12px; height:100%; min-height:0; overflow:hidden; }
  .card { background:#161f33; border:1px solid #2d3956; border-radius:10px; padding:12px; min-height:0; overflow:hidden; }
  .board { display:grid; grid-template-rows:auto minmax(0,1fr); gap:10px; }
  .tools { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .tabs { display:flex; gap:6px; }
  .tabs button, .tools input { border:1px solid #355182; background:#1f2f4f; color:#dbe8ff; border-radius:8px; padding:5px 10px; font-size:12px; }
  .tabs button.active { background:#3262b0; border-color:#6da1f7; }
  .tools input { width:160px; }
  .content-grid { min-height:0; display:grid; grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr); gap:10px; }
  .list-wrap { min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr); gap:6px; border:1px solid #2f486f; border-radius:10px; padding:8px; background:#13223d; }
  .head-row, .data-row { display:grid; grid-template-columns:1fr 0.7fr 0.6fr 0.5fr 0.6fr; gap:6px; align-items:center; font-size:12px; }
  .head-row { color:#9fb4d8; padding:0 6px; }
  .rows { min-height:0; overflow:auto; display:grid; align-content:start; gap:4px; }
  .data-row { border:1px solid #284269; background:#162a4a; border-radius:8px; padding:6px; color:#e4edff; text-align:left; cursor:pointer; }
  .data-row.selected { border-color:#79abf6; background:#1d3760; }
  .data-row strong { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .detail-card { border:1px solid #2f486f; border-radius:10px; background:#13223d; padding:10px; display:grid; align-content:start; gap:8px; min-height:0; overflow:auto; }
  .detail-card p { margin:0; color:#b4c8ea; font-size:13px; }
  .detail-section { display:grid; gap:6px; }
  .detail-section h4 { margin:0; color:#dbe8ff; font-size:13px; }
  .ability-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
  .ability-grid div { border:1px solid #2e486f; border-radius:8px; background:#152b4f; padding:6px; display:grid; gap:2px; }
  .ability-grid span { color:#9eb6de; font-size:11px; }
  .ability-grid strong { color:#eff5ff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .stat-list { margin:0; padding-left:16px; color:#d7e5ff; font-size:12px; display:grid; gap:3px; }
  .pending { color:#9db2d8; font-size:12px; }
  .empty { color:#9db2d8; font-size:12px; padding:8px; }
  @media (max-width:1180px){ .content-grid { grid-template-columns:1fr; } .detail-card { display:none; } }
</style>

