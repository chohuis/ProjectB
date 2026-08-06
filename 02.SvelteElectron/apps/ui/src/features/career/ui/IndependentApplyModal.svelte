<script lang="ts">
  import { onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { masterStore } from "../../../shared/stores/master";
  import { isApplicableIndependent, indieCutOfPower } from "../../../shared/utils/universityUtils";
  import type { EntityDetails } from "../../../shared/stores/master";

  export let initialSelected: string[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: { selected: string[] };
  }>();

  let selected: string[] = [];
  let selectedTeamId = "";
  let loading = true;

  onMount(async () => {
    selected = [...initialSelected].slice(0, 3);
    loading = false;
  });

  // 상무는 병역 경로(`SportsUnitApplicationModal`)가 정본이라 여기서 뺀다 — 9팀이다
  $: teams = $masterStore.teams.filter(
    (t) => t.leagueId === "LEAGUE_INDEPENDENT" && isApplicableIndependent(t.id),
  );
  $: sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  $: if (!selectedTeamId || !sortedTeams.some((t) => t.id === selectedTeamId)) {
    selectedTeamId = sortedTeams[0]?.id ?? "";
  }
  $: selectedTeam = sortedTeams.find((t) => t.id === selectedTeamId) ?? null;
  $: rosterRows = selectedTeamId
    ? $masterStore.entities.filter((e) => e.teamId === selectedTeamId)
    : [];
  $: playerRows = rosterRows.filter((e) => e.role === "player");

  function toggleTeam(teamId: string) {
    if (selected.includes(teamId)) {
      selected = selected.filter((id) => id !== teamId);
      return;
    }
    if (selected.length >= 3) return;
    selected = [...selected, teamId];
  }

  function confirmSelection() {
    dispatch("confirm", { selected: selected.slice(0, 3) });
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="chip">독립리그 신청</p>
      <h3>희망 독립팀 선택 (최대 3개)</h3>
    </header>

    {#if loading}
      <p class="empty">독립리그 로스터 불러오는 중...</p>
    {:else}
      <div class="layout">
        <section class="panel list">
          <h4>독립팀 목록</h4>
          <div class="rows">
            {#each sortedTeams as team}
              <button class:selected={selectedTeamId === team.id} on:click={() => (selectedTeamId = team.id)}>
                <strong>{team.name}</strong>
                <span>{selected.includes(team.id) ? "신청됨 ✓" : "미신청"}</span>
              </button>
            {/each}
          </div>
        </section>

        <section class="panel detail">
          {#if selectedTeam}
            <h4>{selectedTeam.name}</h4>
            <p class="meta">{selectedTeam.id}</p>
            {#if selectedTeam.profile}
              <div class="profile">
                <div><span>스타일</span><strong>{selectedTeam.profile.style}</strong></div>
                <div><span>난이도</span><strong>{selectedTeam.profile.difficulty ?? "-"}</strong></div>
                <div><span>재정</span><strong>{selectedTeam.profile.funding ?? "-"}</strong></div>
                <div class="wide"><span>강점</span><strong>{selectedTeam.profile.strengths.join(" / ")}</strong></div>
                <div class="wide"><span>설명</span><p>{selectedTeam.profile.desc}</p></div>
              </div>
            {/if}
            <div class="stats">
              <div><span>총 인원</span><strong>{rosterRows.length}</strong></div>
              <div><span>선수</span><strong>{playerRows.length}</strong></div>
            </div>
            <div class="roster">
              {#each rosterRows.slice(0, 18) as row}
                {@const p = (row.details as EntityDetails)?.player}
                <div class="roster-row">
                  <strong>{row.name}</strong>
                  <span>{row.role === "player" ? (p?.position ?? "-") : row.role}</span>
                </div>
              {/each}
            </div>
            <button class="pick-btn" on:click={() => toggleTeam(selectedTeam.id)}>
              {selected.includes(selectedTeam.id) ? "신청 취소" : "이 팀 신청"}
            </button>
          {/if}
        </section>
      </div>
    {/if}

    <footer class="actions">
      <span class="sel-count">선택: {selected.length}/3</span>
      <div class="btns">
        <button class="ghost" on:click={() => dispatch("close")}>취소</button>
        <button on:click={confirmSelection} disabled={selected.length === 0}>확인</button>
      </div>
    </footer>
  </section>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box; z-index:270; }
  .modal { width:min(1040px,95vw); max-height:calc(100vh - 24px); background:var(--panel); border:1px solid var(--ink-mute); border-radius:14px; padding:18px; box-sizing:border-box; display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:12px; overflow:hidden; }
  .chip { margin:0; font-size:11px; color:var(--ink); }
  h3, h4 { margin:0; color:var(--ink); }
  .layout { display:grid; grid-template-columns:0.95fr 1.05fr; gap:10px; min-height:0; overflow:hidden; }
  .panel { border:1px solid var(--line); border-radius:10px; background:var(--panel-sunk); padding:10px; min-height:0; overflow:hidden; }
  .list { display:grid; grid-template-rows:auto minmax(0,1fr); gap:8px; }
  .rows { min-height:0; overflow:auto; display:grid; gap:4px; align-content:start; }
  .rows button { border:1px solid var(--line); background:var(--panel-sunk); color:var(--ink); border-radius:8px; padding:7px 8px; text-align:left; display:flex; justify-content:space-between; gap:8px; cursor:pointer; }
  .rows button.selected { border-color:var(--ink); background:var(--line); }
  .rows button span { color:var(--ink); font-size:12px; }
  .detail { display:grid; grid-template-rows:auto auto auto auto minmax(0,1fr) auto; gap:8px; }
  .meta { margin:0; color:var(--ink); font-size:12px; }
  .profile { border:1px solid var(--line); border-radius:8px; background:var(--panel-sunk); padding:8px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
  .profile div { border:1px solid var(--line); border-radius:6px; background:var(--panel-sunk); padding:6px; display:grid; gap:2px; }
  .profile .wide { grid-column:1 / -1; }
  .profile span { color:var(--ink); font-size:11px; }
  .profile strong { color:var(--ink); font-size:12px; }
  .profile p { margin:0; color:var(--ink); font-size:12px; line-height:1.35; }
  .stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  .stats div { border:1px solid var(--line); background:var(--panel-sunk); border-radius:8px; padding:7px; display:grid; gap:2px; }
  .stats span { color:var(--ink); font-size:11px; }
  .stats strong { color:var(--ink); font-size:14px; }
  .roster { min-height:0; overflow:auto; display:grid; gap:4px; }
  .roster-row { border:1px solid var(--line); border-radius:7px; background:var(--panel-sunk); padding:6px 8px; display:flex; justify-content:space-between; font-size:12px; color:var(--ink); }
  .roster-row span { color:var(--ink); }
  .pick-btn { border:1px solid var(--ink-mute); background:var(--line); color:var(--ink); border-radius:8px; padding:8px 10px; cursor:pointer; }
  .actions { display:flex; justify-content:space-between; align-items:center; }
  .sel-count { color:var(--ink); font-size:13px; }
  .btns { display:flex; gap:8px; }
  .btns button { border:1px solid var(--ink-mute); background:var(--panel-sunk); color:var(--ink); border-radius:8px; padding:8px 12px; cursor:pointer; }
  .btns .ghost { background:var(--panel); }
  .btns button:disabled { opacity:.55; cursor:default; }
  .empty { margin:0; color:var(--ink); }
  @media (max-width:1100px){
    .modal { max-height:calc(100vh - 16px); padding:14px; }
    .layout { grid-template-columns:1fr; min-height:0; }
  }
</style>
