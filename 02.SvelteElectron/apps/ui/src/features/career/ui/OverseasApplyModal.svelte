<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { entitiesL10n, teamsL10n } from "../../../shared/stores/master";
  import { gameStore } from "../../../shared/stores/game";
  import { overseasFarmCutOfPower, passesOverseasFarm, calcIndividualScore } from "../../../shared/utils/universityUtils";
  import { firstTeamIdOf } from "../../../shared/utils/ids";
  import { ALL_TEAMS_BY_LEAGUE } from "../../../shared/utils/leagueScheduler";
  import { isLeagueInScope } from "../../../shared/config/releaseScope";
  import type { EntityDetails } from "../../../shared/stores/master";

  /**
   * 해외 2군 **제안 전망** — 읽기 전용 (HANDOFF_A_TO_C §0.45 · 사용자 확정 09-02).
   *
   * 🔴 예전엔 여기서 3곳을 골라 "신청"했다. 지금은 **신청이 아니라 제안**이다 — W47 에
   *   28팀 전부를 부모 1군 전력 문턱으로 보고 넘는 팀이 결과 화면에 온다. 고르는 건 그때다.
   *   이 화면은 "어느 팀이 얼마를 요구하고 내가 어디까지 되는가"만 보여준다(문턱을 숨기지 않는다).
   */
  const dispatch = createEventDispatcher<{ close: void }>();

  let selectedTeamId = "";

  /**
   * 🔴 **2군만 보여준다.** 1군은 FA·포스팅 경로다 — 여기 섞으면
   *   아마추어가 바로 ABL 1군에 지원하게 된다.
   *
   * 🔴 **refs 의 2군 팀은 `leagueId` 가 1군 리그다**(`LEAGUE_ABL` · tier "마이너") — 2026-09-02 눈확인.
   *   예전엔 팀의 leagueId 로 걸러서 **한 팀도 안 떴다**(0/0). 판정(advanceWeek)과
   *   같은 출처 `ALL_TEAMS_BY_LEAGUE[…_FARM]` 로 소속을 정한다.
   */
  const FARM_LEAGUES = ["LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"] as const;
  const farmLeagueOf = (teamId: string): string | undefined =>
    FARM_LEAGUES.find((lid) => (ALL_TEAMS_BY_LEAGUE[lid] ?? []).includes(teamId));
  $: teams = FARM_LEAGUES
    .filter((lid) => isLeagueInScope(lid))
    .flatMap((lid) => ALL_TEAMS_BY_LEAGUE[lid] ?? [])
    .map((id) => $teamsL10n.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);
  $: sortedTeams = [...teams].sort((a, b) =>
    (farmLeagueOf(a.id) ?? "").localeCompare(farmLeagueOf(b.id) ?? "") || a.name.localeCompare(b.name, "ko"));
  $: if (!selectedTeamId || !sortedTeams.some((t) => t.id === selectedTeamId)) {
    selectedTeamId = sortedTeams[0]?.id ?? "";
  }
  $: selectedTeam = sortedTeams.find((t) => t.id === selectedTeamId) ?? null;
  $: rosterRows = selectedTeamId ? $entitiesL10n.filter((e) => e.teamId === selectedTeamId) : [];
  $: playerRows = rosterRows.filter((e) => e.role === "player");

  // ── 내 자격 ────────────────────────────────────────────────
  $: myOvr = $gameStore.protagonist.pitching.ovr;
  // 🔴 **개인 기여로 본다.** 팀 점수(`calcHsBaseballScore`)는 우승팀이면
  //   벤치도 100점이라 해외 스카우트가 보는 축이 아니다.
  $: myScore = Math.round(calcIndividualScore($gameStore.protagonist.careerRecords ?? []));
  $: offerCount = sortedTeams.filter((t) => passes(t.id)).length;
  const leagueLabel = (id: string | undefined) =>
    id === "LEAGUE_ABL_FARM" ? "ABL 2군" : id === "LEAGUE_JBL_FARM" ? "JBL 2군" : "-";

  /**
   * 🔴 **부모 1군 전력으로 본다** — 판정(`advanceWeek` · `overseasOfferTeams`)과 같은 축.
   *   refs 의 `_2` 팀은 전부 ★3 이라 2군 전력을 쓰면 28팀이 한 문턱(78)에 몰려 화면과 판정이 어긋난다.
   */
  function parentPower(teamId: string): number | undefined {
    const parent = firstTeamIdOf(teamId);
    return parent ? $teamsL10n.find((t) => t.id === parent)?.power : undefined;
  }
  function stars(teamId: string): string {
    const p = Math.max(0, Math.min(5, Math.round(parentPower(teamId) ?? 0)));
    return "★".repeat(p) + "☆".repeat(5 - p);
  }
  function cutOf(teamId: string): number {
    return overseasFarmCutOfPower(parentPower(teamId));
  }
  function passes(teamId: string): boolean {
    return passesOverseasFarm(myOvr, myScore, parentPower(teamId));
  }
</script>

<div class="overlay">
  <section class="modal">
    <header>
      <p class="chip">해외 2군 제안 전망</p>
      <h3>W47 시즌 결과에 제안이 온다 — 지금 값으로는 {offerCount}/{sortedTeams.length}팀</h3>
      <p class="mine">내 능력 <strong>{myOvr}</strong> · 개인 기여 <strong>{myScore}</strong> · 문턱은 부모 1군 전력★이 정한다 (★3 → 78 · ★4 → 81 · ★5 → 84)</p>
    </header>

    {#if sortedTeams.length === 0}
      <p class="empty">범위 안에 해외 2군 구단이 없습니다.</p>
    {:else}
      <div class="layout">
        <section class="panel list">
          <h4>구단 목록</h4>
          <div class="rows">
            {#each sortedTeams as team}
              <button class:selected={selectedTeamId === team.id} on:click={() => (selectedTeamId = team.id)}>
                <strong>{team.name} <small class="lg">{leagueLabel(farmLeagueOf(team.id))} {stars(team.id)}</small></strong>
                <span class:ok={passes(team.id)}>
                  {passes(team.id) ? "제안 예상 · " : ""}{cutOf(team.id)} 필요
                </span>
              </button>
            {/each}
          </div>
        </section>

        <section class="panel detail">
          {#if selectedTeam}
            <h4>{selectedTeam.name} <span class="lg">{leagueLabel(farmLeagueOf(selectedTeam.id))} · 1군 {stars(selectedTeam.id)}</span></h4>
            <div class="stats">
              <div><span>필요 능력</span><strong>{cutOf(selectedTeam.id)}</strong></div>
              <div><span>내 능력</span><strong>{myOvr}</strong></div>
              <div><span>총 인원</span><strong>{rosterRows.length}</strong></div>
              <div><span>선수</span><strong>{playerRows.length}</strong></div>
            </div>
            <p class="verdict" class:ok={passes(selectedTeam.id)}>
              {#if passes(selectedTeam.id)}
                지금 값이면 W47 에 이 구단의 제안이 온다.
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
          {/if}
        </section>
      </div>
    {/if}

    <footer class="actions">
      <span class="sel-count">신청은 없다 — 제안이 오면 결과 화면에서 고른다</span>
      <div class="btns">
        <button on:click={() => dispatch("close")}>닫기</button>
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
  .rows button span { color:var(--ink); font-size:12px; white-space:nowrap; }
  .detail { display:grid; grid-template-rows:auto auto auto minmax(0,1fr); gap:8px; }
  .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
  .stats div { border:1px solid var(--line); background:var(--panel-sunk); border-radius:8px; padding:7px; display:grid; gap:2px; }
  .stats span { color:var(--ink); font-size:11px; }
  .stats strong { color:var(--ink); font-size:14px; }
  .roster { min-height:0; overflow:auto; display:grid; gap:4px; }
  .roster-row { border:1px solid var(--line); border-radius:7px; background:var(--panel-sunk); padding:6px 8px; display:flex; justify-content:space-between; font-size:12px; color:var(--ink); }
  .roster-row span { color:var(--ink); }
  .actions { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .sel-count { color:var(--ink-mid); font-size:12.5px; }
  .btns { display:flex; gap:8px; }
  .btns button { border:1px solid var(--ink-mute); background:var(--panel-sunk); color:var(--ink); border-radius:8px; padding:8px 12px; cursor:pointer; }
  .empty { margin:0; color:var(--ink); }
  .lg { font-size:11px; color:var(--ink-mute); font-weight:400; }
  .mine { margin:4px 0 0; font-size:12px; color:var(--ink-mid); }
  /* 갈 수 있는 곳은 눈에 띄어야 한다 — 목록이 28팀이라 하나씩 눌러 볼 수 없다 */
  .rows button span.ok { color:var(--ok); font-weight:700; }
  .verdict { margin:0; padding:7px 9px; border:1px solid var(--line); border-radius:8px;
    font-size:12px; color:var(--ink-mid); background:var(--panel-sunk); }
  .verdict.ok { color:var(--ink); border-color:var(--ok); }
  @media (max-width:1100px){
    .modal { max-height:calc(100vh - 16px); padding:14px; }
    .layout { grid-template-columns:1fr; min-height:0; }
    .stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
</style>
