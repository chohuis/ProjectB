<script lang="ts">
  import { onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { masterStore } from "../../../shared/stores/master";
  import type { EntityDetails } from "../../../shared/stores/master";
  import { gameStore } from "../../../shared/stores/game";
  import { checkUniversityEligibility, calcHsBaseballScore, pctToGrade, UNIVERSITY_REQUIREMENTS } from "../../../shared/utils/universityUtils";

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

  $: subjectScores = $gameStore.schoolState.subjectScores;
  $: avgPct = Object.values(subjectScores).length
    ? Object.values(subjectScores).reduce((a, s) => a + s.percentile, 0) / Object.values(subjectScores).length
    : 50;
  $: hsBaseballScore = calcHsBaseballScore($gameStore.protagonist.careerRecords ?? []);
  $: avgGrade = pctToGrade(avgPct);

  $: teams = $masterStore.teams.filter((t) => t.leagueId === "LEAGUE_UNIVERSITY" && t.id !== "TEAM_SPORTS_UNIT");
  $: sortedTeams = [...teams].sort((a, b) => {
    const ra = UNIVERSITY_REQUIREMENTS[a.id];
    const rb = UNIVERSITY_REQUIREMENTS[b.id];
    const tierOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 };
    return (tierOrder[ra?.tier ?? "D"] ?? 4) - (tierOrder[rb?.tier ?? "D"] ?? 4);
  });
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
      <p class="chip">대학 진학 신청</p>
      <h3>희망 대학 선택 (최대 3개)</h3>
    </header>

    {#if loading}
      <p class="empty">대학 로스터 불러오는 중...</p>
    {:else}
      <div class="layout">
        <section class="panel list">
          <h4>대학 목록</h4>
          <div class="elig-info">
            <span>내 교과: <strong>{avgGrade}등급</strong></span>
            <span>야구 점수: <strong>{hsBaseballScore}점</strong></span>
          </div>
          <div class="rows">
            {#each sortedTeams as team}
              {@const req = UNIVERSITY_REQUIREMENTS[team.id]}
              {@const elig = checkUniversityEligibility(team.id, avgPct, hsBaseballScore)}
              <button class:selected={selectedTeamId === team.id} on:click={() => (selectedTeamId = team.id)}>
                <span class="tier-badge tier-{req?.tier ?? 'D'}">{req?.tier ?? '?'}</span>
                <strong class:dim={!elig.eligible}>{team.name}</strong>
                <span class="elig-status" class:pass={elig.eligible} class:warn={!elig.eligible && (elig.meetsAcademic || elig.meetsBaseball)} class:fail={!elig.meetsAcademic && !elig.meetsBaseball}>
                  {selected.includes(team.id) ? "신청됨 ✓" : elig.eligible ? "지원 가능" : "조건 미달"}
                </span>
              </button>
            {/each}
          </div>
        </section>

        <section class="panel detail">
          {#if selectedTeam}
            {@const req = UNIVERSITY_REQUIREMENTS[selectedTeam.id]}
            {@const elig = checkUniversityEligibility(selectedTeam.id, avgPct, hsBaseballScore)}
            <div class="detail-head">
              <h4>{selectedTeam.name}</h4>
              {#if req}<span class="tier-badge tier-{req.tier}">{req.tier}등급</span>{/if}
            </div>
            <div class="req-row">
              <span class:meet={elig.meetsAcademic} class:nomeet={!elig.meetsAcademic}>
                교과 {req?.minAcademicGrade ?? "-"}등급 이내 {elig.meetsAcademic ? "✓" : "✗"}
              </span>
              <span class:meet={elig.meetsBaseball} class:nomeet={!elig.meetsBaseball}>
                야구 {req?.minBaseballScore ?? 0}점 이상 {elig.meetsBaseball ? "✓" : "✗"}
              </span>
            </div>
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
              {selected.includes(selectedTeam.id) ? "신청 취소" : "이 대학 신청"}
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
  .elig-info { display:flex; gap:12px; font-size:12px; color:var(--ink); padding:4px 2px; }
  .elig-info strong { color:var(--ink); }
  .rows button { border:1px solid var(--line); background:var(--panel-sunk); color:var(--ink); border-radius:8px; padding:7px 8px; text-align:left; display:flex; align-items:center; gap:8px; cursor:pointer; }
  .rows button.selected { border-color:var(--ink); background:var(--line); }
  .rows button .dim { color:var(--ink-mute); }
  .elig-status { margin-left:auto; font-size:11px; }
  .elig-status.pass { color:var(--ok); }
  .elig-status.warn { color:var(--warn); }
  .elig-status.fail { color:var(--bad); }
  .tier-badge { font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; flex-shrink:0; border:1px solid; }
  .tier-S { background:rgba(90, 58, 168, 0.10); border-color:#5B3AA8; color:#5B3AA8; }
  .tier-A { background:var(--panel); border-color:var(--ink-mute); color:var(--ink); }
  .tier-B { background:var(--panel); border-color:var(--ok); color:var(--ok); }
  .tier-C { background:var(--panel); border-color:var(--ink-mute); color:var(--ink); }
  .tier-D { background:rgba(179, 49, 31, 0.09); border-color:rgba(179, 49, 31, 0.26); color:var(--bad); }
  .detail-head { display:flex; align-items:center; gap:8px; }
  .req-row { display:flex; gap:12px; font-size:12px; }
  .req-row .meet { color:var(--ok); }
  .req-row .nomeet { color:var(--bad); }
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
  .btns .ghost { background:var(--panel-sunk); }
  .btns button:disabled { opacity:.55; cursor:default; }
  .empty { margin:0; color:var(--ink); }
  @media (max-width:1100px){
    .modal { max-height:calc(100vh - 16px); padding:14px; }
    .layout { grid-template-columns:1fr; min-height:0; }
  }
</style>
