<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { entitiesL10n, teamsL10n } from "../../../shared/stores/master";
  import { gameStore } from "../../../shared/stores/game";
  import { overseasFarmCutOfPower, passesOverseasFarm, isOverseasFarmTeam,
    calcIndividualScore } from "../../../shared/utils/universityUtils";
  import type { EntityDetails } from "../../../shared/stores/master";

  export let initialSelected: string[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: { selected: string[] };
  }>();

  let selected: string[] = [];
  let selectedTeamId = "";
  let loading = true;

  onMount(() => {
    selected = [...initialSelected].slice(0, 3);
    loading = false;
  });

  /**
   * 🔴 **2군만 보여준다.** 1군은 FA·포스팅 경로다 — 여기 섞으면
   *   아마추어가 바로 ABL 1군에 지원하게 된다.
   */
  $: teams = $teamsL10n.filter((t) => isOverseasFarmTeam(t.leagueId));
  $: sortedTeams = [...teams].sort((a, b) =>
    (a.leagueId ?? "").localeCompare(b.leagueId ?? "") || a.name.localeCompare(b.name, "ko"));
  $: if (!selectedTeamId || !sortedTeams.some((t) => t.id === selectedTeamId)) {
    selectedTeamId = sortedTeams[0]?.id ?? "";
  }
  $: selectedTeam = sortedTeams.find((t) => t.id === selectedTeamId) ?? null;
  $: rosterRows = selectedTeamId ? $entitiesL10n.filter((e) => e.teamId === selectedTeamId) : [];
  $: playerRows = rosterRows.filter((e) => e.role === "player");

  // ── 내 자격 ────────────────────────────────────────────────
  //
  // ⚠ **문턱을 숨기지 않는다.** 지원해 놓고 왜 떨어졌는지 모르면
  //   그 화면은 제비뽑기로 읽힌다. 팀마다 얼마가 필요한지 보여준다.
  $: myOvr = $gameStore.protagonist.pitching.ovr;
  // 🔴 **개인 기여로 본다.** 팀 점수(`calcHsBaseballScore`)는 우승팀이면
  //   벤치도 100점이라 해외 스카우트가 보는 축이 아니다.
  $: myScore = Math.round(calcIndividualScore($gameStore.protagonist.careerRecords ?? []));
  const leagueLabel = (id: string | undefined) =>
    id === "LEAGUE_ABL_FARM" ? "ABL 2군" : id === "LEAGUE_JBL_FARM" ? "JBL 2군" : "-";

  function cutOf(teamId: string): number {
    return overseasFarmCutOfPower($teamsL10n.find((t) => t.id === teamId)?.power);
  }
  function passes(teamId: string): boolean {
    return passesOverseasFarm(myOvr, myScore, $teamsL10n.find((t) => t.id === teamId)?.power);
  }

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
      <p class="chip">해외 2군 신청</p>
      <h3>희망 구단 선택 (최대 3개)</h3>
      <p class="mine">내 능력 <strong>{myOvr}</strong> · 개인 기여 <strong>{myScore}</strong></p>
    </header>

    {#if loading}
      <p class="empty">해외 구단 불러오는 중...</p>
    {:else if sortedTeams.length === 0}
      <p class="empty">지원할 수 있는 해외 구단이 없습니다.</p>
    {:else}
      <div class="layout">
        <section class="panel list">
          <h4>구단 목록</h4>
          <div class="rows">
            {#each sortedTeams as team}
              <button class:selected={selectedTeamId === team.id} on:click={() => (selectedTeamId = team.id)}>
                <strong>{team.name}</strong>
                <span class:ok={passes(team.id)}>
                  {selected.includes(team.id) ? "신청됨 ✓ · " : ""}{cutOf(team.id)} 필요
                </span>
              </button>
            {/each}
          </div>
        </section>

        <section class="panel detail">
          {#if selectedTeam}
            <h4>{selectedTeam.name} <span class="lg">{leagueLabel(selectedTeam.leagueId)}</span></h4>
            <div class="stats">
              <div><span>필요 능력</span><strong>{cutOf(selectedTeam.id)}</strong></div>
              <div><span>내 능력</span><strong>{myOvr}</strong></div>
              <div><span>총 인원</span><strong>{rosterRows.length}</strong></div>
              <div><span>선수</span><strong>{playerRows.length}</strong></div>
            </div>
            <p class="verdict" class:ok={passes(selectedTeam.id)}>
              {#if passes(selectedTeam.id)}
                지원 조건을 넘었습니다.
              {:else if myOvr < cutOf(selectedTeam.id)}
                능력이 {cutOf(selectedTeam.id) - myOvr} 모자랍니다.
              {:else}
                능력은 되지만 기여가 모자랍니다. 더 던지거나 더 키우면 열립니다.
              {/if}
            </p>
            <div class="roster">
              {#each rosterRows.slice(0, 18) as row}
                {@const pl = (row.details as EntityDetails)?.player}
                <div class="roster-row">
                  <strong>{row.name}</strong>
                  <span>{row.role === "player" ? (pl?.position ?? "-") : row.role}</span>
                </div>
              {/each}
            </div>
            <button class="pick-btn" on:click={() => toggleTeam(selectedTeam.id)}>
              {selected.includes(selectedTeam.id) ? "신청 취소" : "이 구단 신청"}
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
  /* ⚠ 독립 모달의 `.profile` 규칙 6개를 지웠다 — 이 화면은 구단 소개를
     안 그린다. 문턱과 로스터만 보여주면 되는 자리다. */
  /* ── 해외 지원에만 있는 것 ─────────────────────────────── */
  .lg { font-size:11px; color:var(--ink-mute); font-weight:400; }
  .mine { margin:4px 0 0; font-size:12px; color:var(--ink-mid); }
  /* 갈 수 있는 곳은 눈에 띄어야 한다 — 목록이 28팀이라 하나씩 눌러 볼 수 없다 */
  .rows button span.ok { color:var(--ink); font-weight:700; }
  .verdict { margin:0; padding:7px 9px; border:1px solid var(--line); border-radius:8px;
    font-size:12px; color:var(--ink-mid); background:var(--panel-sunk); }
  .verdict.ok { color:var(--ink); border-color:var(--ink-mute); }
  /* 이 화면은 프로필 칸이 없다 — 행이 하나 적다 */
  .detail { grid-template-rows:auto auto auto minmax(0,1fr) auto; }
  .stats { grid-template-columns:repeat(4,minmax(0,1fr)); }
  @media (max-width:1100px){ .stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
