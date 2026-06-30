<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";
  import type { EntityDetails } from "../../shared/stores/master";
  import { seasonStore } from "../../shared/stores/season";
  import PlayerDetailModal from "../../features/player/ui/PlayerDetailModal.svelte";

  type RosterTab = "all" | "pitcher" | "batter" | "staff";
  type RoleTab = "player" | "coach" | "manager" | "owner";

  export let filterTeamId: string = "";

  let tab: RosterTab = "all";
  let keyword = "";
  let selectedId = "";
  let modalEntityId = "";

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

  function conditionLabel(v: number): string {
    return v >= 70 ? "좋음" : v >= 40 ? "보통" : "주의";
  }
  function conditionClass(v: number): string {
    return v >= 70 ? "good" : v >= 40 ? "mid" : "low";
  }
  function fatigueLabel(v: number): string {
    return v >= 70 ? "높음" : v >= 40 ? "보통" : "낮음";
  }
  function fatigueClass(v: number): string {
    return v >= 70 ? "low" : v >= 40 ? "mid" : "good";
  }

  onMount(async () => {
  });

  $: currentLeagueId = toLeagueId($gameStore.protagonist.careerStage);
  $: if (currentLeagueId) loadLeagueEntities();

  $: myTeamId = $gameStore.protagonist.teamId;
  $: activeTeamId = filterTeamId || myTeamId;

  $: protagonistRow = (() => {
    const p = $gameStore.protagonist;
    return {
      id: p.id,
      name: p.name,
      nameEn: p.nameEn,
      role: "player" as const,
      age: p.age,
      status: "active" as const,
      originLeagueId: p.leagueId,
      leagueId: p.leagueId,
      clubId: "",
      teamId: p.teamId,
      schoolId: p.schoolId ?? "",
      grade: p.grade,
      notes: "",
      details: {
        player: {
          playerType: p.playerType,
          handedness: p.handedness,
          position: p.position,
          jerseyNumber: p.jerseyNumber,
          pitching: p.pitching,
          batting: p.batting,
          positionRatings: p.positionRatings,
          primaryPosition: p.primaryPosition,
          diligence: p.diligence,
          popularity: p.popularity,
          developmentRate: p.developmentRate,
          potentialHidden: p.potentialHidden,
        },
      },
      coach: null, manager: null, owner: null,
    },
  };
  })();

  $: teamRows = [
    ...(protagonistRow.teamId === activeTeamId ? [protagonistRow] : []),
    ...$masterStore.entities.filter((e) => e.teamId === activeTeamId),
  ];
  $: normalized = keyword.trim().toLowerCase();
  $: searchedRows = teamRows.filter((e) => e.name.toLowerCase().includes(normalized));

  $: filteredRows = searchedRows.filter((e) => {
    if (tab === "all") return true;
    if (tab === "staff") return e.role !== "player";
    if (tab === "pitcher") return e.role === "player" && isPitcherPosition(String((e.details as EntityDetails)?.player?.position ?? ""));
    if (tab === "batter") return e.role === "player" && !isPitcherPosition(String((e.details as EntityDetails)?.player?.position ?? ""));
    return true;
  });

  const ROLE_ORDER: Record<string, number> = { owner: 0, manager: 1, coach: 2, player: 3 };

  $: sortedRows = [...filteredRows].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
    if (roleDiff !== 0) return roleDiff;
    return a.name.localeCompare(b.name, "ko");
  });
  $: if (sortedRows.length > 0 && !sortedRows.some((x) => x.id === selectedId)) selectedId = sortedRows[0].id;
  $: selected = sortedRows.find((x) => x.id === selectedId) ?? null;

  $: selectedStats = selected
    ? ($seasonStore.stats[selected.id]
        ?? Object.values($seasonStore.leagueState ?? {}).map((ls) => ls.stats?.[selected!.id]).find(Boolean)
        ?? null)
    : null;

  import { INJURY_LABEL } from "../../shared/types/save";

  const SEV_BADGE: Record<string, string> = {
    light: "경상", moderate: "부상", severe: "중상", surgery: "수술",
  };

  $: npcInjuries = $seasonStore.npcInjuries ?? {};
  $: npcRetired  = new Set($seasonStore.npcRetired ?? []);

  function getRowInjury(rowId: string): { severity: string; weeksLeft: number; playingThrough: boolean; type?: string } | null {
    if (rowId === $gameStore.protagonist.id) {
      const inj = $gameStore.protagonist.injury;
      if (!inj) return null;
      return { severity: inj.severity, weeksLeft: inj.recoveryWeeksLeft, playingThrough: false, type: inj.type };
    }
    const npcInj = npcInjuries[rowId];
    if (!npcInj) return null;
    return { severity: npcInj.severity, weeksLeft: npcInj.weeksLeft, playingThrough: npcInj.isPlayingThrough, type: npcInj.type };
  }
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
          <span>이름</span><span>역할</span><span>포지션</span><span>나이</span><span>상태</span>
        </div>
        <div class="rows">
          {#if sortedRows.length === 0}
            <p class="empty">검색 결과가 없습니다.</p>
          {:else}
            {#each sortedRows as row}
              {@const p = (row.details as EntityDetails)?.player}
              {@const rowInj = getRowInjury(row.id)}
              {@const isRetired = npcRetired.has(row.id)}
              <button
                class="data-row"
                class:selected={selected?.id === row.id}
                on:click={() => (selectedId = row.id)}
                on:dblclick={() => (modalEntityId = row.id)}
                title="더블클릭: 상세 보기"
              >
                <strong class="row-name">
                  {row.name}
                  {#if isRetired}
                    <span class="inj-badge inj-badge-retired">은퇴</span>
                  {:else if rowInj}
                    <span class="inj-badge inj-badge-{rowInj.severity}"
                          title="{rowInj.type ? (INJURY_LABEL[rowInj.type as keyof typeof INJURY_LABEL] ?? SEV_BADGE[rowInj.severity]) : SEV_BADGE[rowInj.severity]} · {rowInj.weeksLeft}주 남음{rowInj.playingThrough ? ' (출전중)' : ''}">
                      {SEV_BADGE[rowInj.severity] ?? rowInj.severity}
                    </span>
                  {/if}
                </strong>
                <span>{roleLabel(row.role as RoleTab)}</span>
                <span>{row.role === "player" ? (p?.position ?? "-") : "-"}</span>
                <span>{row.age}</span>
                <span>{isRetired ? "은퇴" : rowInj ? (rowInj.playingThrough ? "출전중" : "부상") : row.status}</span>
              </button>
            {/each}
          {/if}
        </div>
      </section>

      <aside class="detail-card">
        {#if selected}
          {@const p = (selected.details as EntityDetails)?.player}
          {@const c = (selected.details as EntityDetails)?.coach}
          {@const m = (selected.details as EntityDetails)?.manager}
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
                    <li>G: {selectedStats.g}</li><li>W: {selectedStats.w}</li>
                    <li>L: {selectedStats.l}</li><li>SV: {selectedStats.sv ?? 0}</li>
                    <li>IP: {selectedStats.ip}</li><li>ERA: {selectedStats.era.toFixed(2)}</li>
                    <li>WHIP: {selectedStats.whip.toFixed(2)}</li><li>K: {selectedStats.k}</li>
                  </ul>
                {:else}
                  <ul class="stat-list">
                    <li>G: {selectedStats.g}</li><li>AVG: {selectedStats.avg.toFixed(3)}</li>
                    <li>OPS: {selectedStats.ops.toFixed(3)}</li><li>HR: {selectedStats.hr}</li>
                    <li>RBI: {selectedStats.rbi}</li><li>SB: {selectedStats.sb}</li>
                  </ul>
                {/if}
              {:else}
                <p class="pending">시즌 누적 집계 중</p>
              {/if}
            </section>
          {:else}
            <section class="detail-section">
              <h4>스태프 정보</h4>
              <div class="ability-grid">
                <div><span>전문</span><strong>{c?.specialty ?? m?.style ?? "-"}</strong></div>
                {#if selected.role === "coach"}
                  <div><span>지도력</span><strong>{c?.stats?.teaching ?? "-"}</strong></div>
                  <div><span>경험</span><strong>Lv.{c?.stats?.experience ?? "-"}</strong></div>
                {:else if selected.role === "manager"}
                  <div><span>전술</span><strong>{m?.stats?.strategy ?? "-"}</strong></div>
                  <div><span>동기부여</span><strong>{m?.stats?.motivation ?? "-"}</strong></div>
                {:else}
                  <div><span>메모</span><strong>{selected.notes || "-"}</strong></div>
                {/if}
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

<PlayerDetailModal entityId={modalEntityId} on:close={() => (modalEntityId = "")} />

<style>
  /* ── 페이지 레이아웃 ── */
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
  @media (max-width:1180px) { .content-grid { grid-template-columns:1fr; } .detail-card { display:none; } }

  /* ── 부상 배지 (로스터 리스트) ── */
  .row-name { display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden; }
  .inj-badge {
    flex-shrink:0;
    font-size:9px; font-weight:700;
    padding:1px 5px; border-radius:6px;
    white-space:nowrap;
  }
  .inj-badge-light    { background:#1c2a18; color:#80e880; border:1px solid #2a5a30; }
  .inj-badge-moderate { background:#2a1f08; color:#ffc040; border:1px solid #5a3a10; }
  .inj-badge-severe   { background:#2e1010; color:#ff8080; border:1px solid #6a2020; }
  .inj-badge-surgery  { background:#200e2e; color:#d090ff; border:1px solid #5a2a7a; }
  .inj-badge-retired  { background:#1a1a1a; color:#888; border:1px solid #444; }
  .badge-retired      { background:#1a1a1a; color:#888; border:1px solid #444; }
</style>
