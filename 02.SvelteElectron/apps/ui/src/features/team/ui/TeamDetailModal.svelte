<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import { gameStore } from "../../../shared/stores/game";
  import type { EntityRow, EntityPlayerDetails, EntityManagerDetails } from "../../../shared/stores/master";

  export let teamId: string = "";
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  type DetailTab = "info" | "roster" | "lineup";
  let activeTab: DetailTab = "info";

  // 모달이 열릴 때마다 탭 초기화
  $: if (open) activeTab = "info";

  function close() { dispatch("close"); }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  $: team = $masterStore.teams.find((t) => t.id === teamId) ?? null;

  function leagueLabel(lid: string): string {
    const map: Record<string, string> = {
      LEAGUE_HIGHSCHOOL: "고교리그", LEAGUE_UNIVERSITY: "대학리그",
      LEAGUE_INDEPENDENT: "독립리그", LEAGUE_KBL: "KBL",
      LEAGUE_ABL: "ABL", LEAGUE_JBL: "JBL",
    };
    return map[lid] ?? lid;
  }

  $: standing = (() => {
    if (!teamId) return null;
    const myLeagueId = $gameStore.protagonist.leagueId;
    if (team?.leagueId === myLeagueId) {
      return $seasonStore.standings.find((s) => s.teamId === teamId) ?? null;
    }
    for (const ls of Object.values($seasonStore.leagueState)) {
      const s = ls.standings.find((s) => s.teamId === teamId);
      if (s) return s;
    }
    return null;
  })();

  // ── 로스터 ──────────────────────────────────────────────────
  $: allMembers = (() => {
    const p = $gameStore.protagonist;
    const fromEntities: EntityRow[] = $masterStore.entities.filter((e) => e.teamId === teamId);
    const roleOrder: Record<string, number> = { owner: 0, manager: 1, coach: 2, player: 3 };
    const rows: EntityRow[] = [
      ...(p.teamId === teamId ? [{
        id: p.id, name: p.name, role: "player" as const,
        teamId: p.teamId, age: p.age,
        status: "active" as const, originLeagueId: p.leagueId,
        leagueId: p.leagueId, clubId: "", schoolId: p.schoolId ?? "",
        grade: p.grade, notes: "",
        details: { player: { position: p.position, playerType: p.playerType, pitching: p.pitching, batting: p.batting, developmentRate: p.developmentRate, potentialHidden: p.potentialHidden, handedness: p.handedness, jerseyNumber: p.jerseyNumber } } as any,
      }] : []),
      ...fromEntities,
    ];
    return rows.sort((a, b) => {
      const diff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "ko");
    });
  })();

  $: manager = allMembers.find((e) => e.role === "manager");
  $: managerDetails = manager ? (manager.details as any).manager as EntityManagerDetails : null;

  function playerOvr(row: EntityRow): number {
    const d = (row.details as any)?.player as EntityPlayerDetails | undefined;
    if (!d) return 0;
    return d.playerType === "batter" ? (d.batting?.ovr ?? 0) : (d.pitching?.ovr ?? 0);
  }

  function playerPos(row: EntityRow): string {
    const d = (row.details as any)?.player as EntityPlayerDetails | undefined;
    return d?.position ?? "-";
  }

  function playerType(row: EntityRow): "pitcher" | "batter" | "twoWay" {
    const d = (row.details as any)?.player as EntityPlayerDetails | undefined;
    return d?.playerType ?? "pitcher";
  }

  // ── 선발라인업 ────────────────────────────────────────────────
  $: pitchers = allMembers.filter((e) => e.role === "player" && playerType(e) !== "batter")
    .sort((a, b) => playerOvr(b) - playerOvr(a));

  $: batters = allMembers.filter((e) => e.role === "player" && playerType(e) !== "pitcher")
    .sort((a, b) => {
      if (!managerDetails) return playerOvr(b) - playerOvr(a);
      const bias = managerDetails.gamePlanBias ?? "";
      const da = (a.details as any)?.player as EntityPlayerDetails;
      const db = (b.details as any)?.player as EntityPlayerDetails;
      if (!da || !db) return 0;
      const scoreA = lineupScore(da, bias);
      const scoreB = lineupScore(db, bias);
      return scoreB - scoreA;
    });

  function lineupScore(d: EntityPlayerDetails, bias: string): number {
    const spd = d.batting?.speed ?? 50;
    const con = d.batting?.contact ?? 50;
    const pow = d.batting?.power ?? 50;
    const ovr = d.batting?.ovr ?? 50;
    if (bias.includes("공격") || bias.includes("aggressive")) return spd * 0.35 + con * 0.25 + pow * 0.4;
    if (bias.includes("수비") || bias.includes("defense"))   return con * 0.5  + spd * 0.3  + pow * 0.2;
    return ovr;
  }

  const SP_LABELS = ["1선발", "2선발", "3선발", "4선발", "5선발"];
  const BATTER_SLOTS = ["1번", "2번", "3번", "4번", "5번", "6번", "7번", "8번", "9번"];
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open && team}
  <div class="overlay" on:click={handleOverlayClick} role="dialog" aria-modal="true">
    <div class="modal">

      <!-- 헤더 -->
      <header class="modal-header">
        <div class="title-row">
          <h2>{team.name}</h2>
          <span class="league-badge">{leagueLabel(team.leagueId)}</span>
          {#if team.tier}<span class="tier-badge">{team.tier}</span>{/if}
        </div>
        {#if team.nameEn}<p class="name-en">{team.nameEn}</p>{/if}
        <button class="close-btn" on:click={close} aria-label="닫기">✕</button>

        <!-- 서브탭 -->
        <nav class="sub-tabs">
          <button class:active={activeTab === "info"}   on:click={() => (activeTab = "info")}>기본정보</button>
          <button class:active={activeTab === "roster"} on:click={() => (activeTab = "roster")}>로스터</button>
          <button class:active={activeTab === "lineup"} on:click={() => (activeTab = "lineup")}>선발라인업</button>
        </nav>
      </header>

      <!-- ── 기본정보 ── -->
      {#if activeTab === "info"}
        <div class="modal-body">
          {#if standing}
            <section class="section">
              <h4>이번 시즌</h4>
              <div class="kpi-row">
                <div class="kpi"><span>승</span><strong class="win">{standing.wins}</strong></div>
                <div class="kpi"><span>패</span><strong class="lose">{standing.losses}</strong></div>
                <div class="kpi"><span>무</span><strong>{standing.draws}</strong></div>
                <div class="kpi"><span>승률</span><strong>{standing.winPct.toFixed(2)}</strong></div>
                <div class="kpi"><span>연속</span><strong>{standing.streak || "-"}</strong></div>
              </div>
            </section>
          {/if}

          {#if team.profile}
            <section class="section">
              <h4>팀 특성</h4>
              {#if team.profile.desc}<p class="desc">{team.profile.desc}</p>{/if}
              <div class="tag-row">
                {#if team.profile.style}<span class="tag tag-style">{team.profile.style}</span>{/if}
                {#each (team.profile.tags ?? []) as tag}<span class="tag">{tag}</span>{/each}
              </div>
              <div class="profile-meta">
                {#if team.profile.funding}<div><span>재정</span><strong>{team.profile.funding}</strong></div>{/if}
                {#if team.profile.difficulty}<div><span>난이도</span><strong>{team.profile.difficulty}</strong></div>{/if}
                {#if team.profile.strengths?.length}
                  <div class="strengths"><span>강점</span><strong>{team.profile.strengths.join(", ")}</strong></div>
                {/if}
              </div>
            </section>
          {/if}

          {#if team.history}
            <section class="section">
              <h4>팀 역사</h4>
              <div class="history-kpi">
                {#if team.history.founded}<div><span>창단</span><strong>{team.history.founded}년</strong></div>{/if}
                {#if team.history.nationalTitles}<div><span>전국 우승</span><strong>{team.history.nationalTitles}회</strong></div>{/if}
                {#if team.history.proPlayers}<div><span>프로 배출</span><strong>{team.history.proPlayers}명</strong></div>{/if}
              </div>
              {#if team.history.summary}<p class="desc">{team.history.summary}</p>{/if}
              {#if team.history.recentRecords?.length}
                <table class="stbl">
                  <thead><tr><th>연도</th><th>전국</th><th>지역</th><th>비고</th></tr></thead>
                  <tbody>
                    {#each team.history.recentRecords as rec}
                      <tr>
                        <td>{rec.year}</td>
                        <td>{rec.national || "-"}</td>
                        <td>{rec.regional || "-"}</td>
                        <td>{rec.note || "-"}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </section>
          {/if}

          <section class="section">
            <h4>구성원</h4>
            <div class="kpi-row">
              <div class="kpi"><span>선수</span><strong>{allMembers.filter(e => e.role === "player").length}</strong></div>
              <div class="kpi"><span>코치</span><strong>{allMembers.filter(e => e.role === "coach").length}</strong></div>
              {#if manager}<div class="kpi kpi-wide"><span>감독</span><strong>{manager.name}</strong></div>{/if}
            </div>
          </section>
        </div>

      <!-- ── 로스터 ── -->
      {:else if activeTab === "roster"}
        <div class="modal-body">
          {#if allMembers.filter(e => e.role !== "owner").length === 0}
            <p class="empty">로스터 데이터가 없습니다.</p>
          {:else}
            <div class="roster-wrap">
              <table class="stbl roster-table">
                <thead>
                  <tr><th>#</th><th>이름</th><th>역할/포지션</th><th>나이</th><th>OVR</th></tr>
                </thead>
                <tbody>
                  {#each allMembers.filter(e => e.role !== "owner") as row}
                    {@const d = (row.details as any)?.player as EntityPlayerDetails | undefined}
                    <tr class:hero={row.id === $gameStore.protagonist.id}>
                      <td class="num">{d?.jerseyNumber ?? "-"}</td>
                      <td class="name-cell">
                        {row.name}
                        {#if row.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                      </td>
                      <td>
                        {#if row.role === "player"}
                          {playerPos(row)}
                        {:else if row.role === "manager"}
                          <span class="role-badge role-mgr">감독</span>
                        {:else if row.role === "coach"}
                          <span class="role-badge role-coach">코치</span>
                        {/if}
                      </td>
                      <td>{row.age}</td>
                      <td class="ovr-cell">{row.role === "player" ? playerOvr(row) : "-"}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

      <!-- ── 선발라인업 ── -->
      {:else if activeTab === "lineup"}
        <div class="modal-body">
          {#if managerDetails}
            <div class="mgr-banner">
              <span class="mgr-label">감독</span>
              <strong>{manager?.name}</strong>
              <span class="mgr-style">{managerDetails.style || managerDetails.gamePlanBias || "-"}</span>
            </div>
          {/if}

          <div class="lineup-grid">
            <!-- 선발 로테이션 -->
            <section class="lineup-section">
              <h4>선발 로테이션</h4>
              {#if pitchers.length === 0}
                <p class="empty">투수 데이터 없음</p>
              {:else}
                <div class="lineup-rows">
                  {#each pitchers.slice(0, 5) as row, i}
                    <div class="lineup-row" class:hero={row.id === $gameStore.protagonist.id}>
                      <span class="slot-label">{SP_LABELS[i] ?? `${i + 1}선발`}</span>
                      <span class="player-name">
                        {row.name}
                        {#if row.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                      </span>
                      <span class="pos-tag">{playerPos(row)}</span>
                      <span class="ovr-tag">{playerOvr(row)}</span>
                    </div>
                  {/each}
                  {#if pitchers.length > 5}
                    <div class="lineup-more">불펜 {pitchers.length - 5}명</div>
                  {/if}
                </div>
              {/if}
            </section>

            <!-- 타순 -->
            <section class="lineup-section">
              <h4>타순</h4>
              {#if batters.length === 0}
                <p class="empty">타자 데이터 없음</p>
              {:else}
                <div class="lineup-rows">
                  {#each batters.slice(0, 9) as row, i}
                    <div class="lineup-row" class:hero={row.id === $gameStore.protagonist.id}>
                      <span class="slot-label">{BATTER_SLOTS[i]}</span>
                      <span class="player-name">
                        {row.name}
                        {#if row.id === $gameStore.protagonist.id}<span class="hero-tag">나</span>{/if}
                      </span>
                      <span class="pos-tag">{playerPos(row)}</span>
                      <span class="ovr-tag">{playerOvr(row)}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>
          </div>
        </div>
      {/if}

    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 150;
  }

  .modal {
    background: #0e1a30;
    border: 1px solid #3a5a96;
    border-radius: 14px;
    width: min(600px, 94vw);
    max-height: 87vh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .modal-header {
    padding: 18px 24px 0;
    border-bottom: 1px solid #1e2e48;
    display: grid; gap: 4px;
    position: relative;
  }

  .title-row {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding-right: 36px;
  }

  h2 { margin: 0; font-size: 21px; color: #e8f0ff; }
  h4 { margin: 0 0 8px; font-size: 12px; color: #9eb6de; text-transform: uppercase; letter-spacing: 0.5px; }

  .league-badge {
    font-size: 11px; font-weight: 700;
    background: #1a3058; border: 1px solid #3a5888;
    color: #80b4f0; border-radius: 6px; padding: 3px 8px;
  }

  .tier-badge {
    font-size: 11px;
    background: #2a1e08; border: 1px solid #8a6020;
    color: #f0c060; border-radius: 6px; padding: 3px 8px;
  }

  .name-en { margin: 0; font-size: 12px; color: #6080a0; }

  .close-btn {
    position: absolute; top: 16px; right: 18px;
    background: none; border: none;
    color: #6080a0; font-size: 18px;
    cursor: pointer; padding: 2px 6px; border-radius: 4px;
  }
  .close-btn:hover { color: #c8d8f0; background: #1a2a44; }

  .sub-tabs {
    display: flex; gap: 0; margin-top: 10px;
  }
  .sub-tabs button {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: #6080a0; font-size: 13px; padding: 8px 16px;
    cursor: pointer; transition: color 0.1s;
  }
  .sub-tabs button:hover { color: #a8c4f0; }
  .sub-tabs button.active { color: #80b4f8; border-bottom-color: #80b4f8; font-weight: 600; }

  .modal-body {
    overflow-y: auto;
    padding: 16px 24px 24px;
    display: flex; flex-direction: column; gap: 18px;
  }

  .section { display: grid; gap: 8px; }

  .kpi-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .kpi {
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 8px; padding: 8px 14px;
    display: grid; gap: 3px; text-align: center; min-width: 56px;
  }
  .kpi.kpi-wide { min-width: 90px; }
  .kpi span { font-size: 11px; color: #8aa4cc; }
  .kpi strong { font-size: 15px; color: #d8e8ff; }
  .win  { color: #68de92; }
  .lose { color: #ffb58a; }

  .desc { margin: 0; font-size: 13px; color: #9eb6de; line-height: 1.6; }

  .tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    font-size: 11px; color: #d5e2fd;
    border: 1px solid #3c4f74; background: #1a2a4a;
    border-radius: 999px; padding: 3px 9px;
  }
  .tag-style { color: #80c8ff; border-color: #1a4a6a; background: #0e2438; font-weight: 700; }

  .profile-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 6px; }
  .profile-meta > div {
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 8px; padding: 7px 10px;
    display: flex; align-items: center; gap: 6px;
  }
  .profile-meta span { font-size: 11px; color: #8aa4cc; }
  .profile-meta strong { font-size: 12px; color: #e8f0ff; }
  .strengths { grid-column: 1 / -1; }

  .history-kpi { display: flex; flex-wrap: wrap; gap: 8px; }
  .history-kpi > div {
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 8px; padding: 8px 14px;
    display: grid; gap: 3px; text-align: center;
  }
  .history-kpi span { font-size: 11px; color: #8aa4cc; }
  .history-kpi strong { font-size: 15px; color: #d8e8ff; }

  /* 공통 테이블 */
  .stbl { width: 100%; border-collapse: collapse; font-size: 12px; }
  .stbl th {
    color: #7a9ac8; padding: 5px 8px; text-align: center;
    border-bottom: 1px solid #2a3f62; white-space: nowrap;
  }
  .stbl td {
    padding: 5px 8px; text-align: center;
    color: #b8ccec; border-bottom: 1px solid #1a2a44; white-space: nowrap;
  }

  /* 로스터 */
  .roster-wrap { overflow-x: auto; }
  .roster-table td.num { color: #6080a0; width: 32px; }
  .roster-table td.name-cell { text-align: left; color: #d5e2fd; }
  .roster-table td.ovr-cell { font-weight: 700; color: #68de92; }
  .roster-table tr.hero td { color: #f0e060; font-weight: 700; background: rgba(240,224,96,0.05); }

  .role-badge { font-size: 10px; border-radius: 4px; padding: 2px 6px; font-weight: 700; }
  .role-mgr   { background: rgba(120,100,200,0.2); color: #a898f8; border: 1px solid #4a3878; }
  .role-coach { background: rgba(80,160,220,0.15); color: #70b0f0; border: 1px solid #2a5080; }

  .hero-tag {
    font-size: 9px; background: rgba(240,224,96,0.2);
    color: #f0e060; border: 1px solid rgba(240,224,96,0.4);
    border-radius: 3px; padding: 0 4px; margin-left: 4px;
    vertical-align: middle;
  }

  /* 선발라인업 */
  .mgr-banner {
    display: flex; align-items: center; gap: 10px;
    background: #1a2a48; border: 1px solid #2e4870;
    border-radius: 8px; padding: 10px 14px;
  }
  .mgr-label { font-size: 11px; color: #8aa4cc; }
  .mgr-banner strong { font-size: 14px; color: #d8e8ff; }
  .mgr-style {
    font-size: 11px; color: #80c8ff;
    background: #0e2438; border: 1px solid #1a4a6a;
    border-radius: 999px; padding: 2px 8px;
  }

  .lineup-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }

  .lineup-section { display: grid; gap: 6px; }

  .lineup-rows { display: grid; gap: 4px; }

  .lineup-row {
    display: grid; grid-template-columns: 52px 1fr 36px 32px;
    align-items: center; gap: 6px;
    background: #131f38; border: 1px solid #2a3f62;
    border-radius: 7px; padding: 6px 8px;
    font-size: 12px;
  }
  .lineup-row.hero { border-color: rgba(240,224,96,0.4); background: rgba(240,224,96,0.05); }

  .slot-label { font-size: 11px; color: #6080a0; font-weight: 700; }
  .player-name { color: #d5e2fd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pos-tag { text-align: center; font-size: 10px; color: #6888a8; }
  .ovr-tag { text-align: right; font-weight: 700; color: #68de92; font-size: 12px; }

  .lineup-more {
    font-size: 11px; color: #6080a0; text-align: center;
    padding: 4px;
  }

  .empty { color: #9db2d8; font-size: 13px; margin: 0; }

  @media (max-width: 520px) {
    .lineup-grid { grid-template-columns: 1fr; }
  }
</style>
