<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  import type { EntityRow, EntityDetails } from "../../../shared/stores/master";
  import type { NpcSaveState } from "../../../shared/types/save";
  import {
    runDraftBoard,
    type DraftBoardCandidate,
    type DraftBoardPick,
  } from "../../../shared/utils/draftSystem";

  export let viewOnly = false;

  const dispatch = createEventDispatcher<{
    close: void;
    completed: { drafted: boolean; teamId: string | null; round: number | null; pick: number | null; signingBonus: number };
  }>();

  type OriginType = "HS" | "UNIV" | "IND";

  type Candidate = {
    id: string;
    name: string;
    ovr: number;
    age: number;
    potential: number;
    isUser: boolean;
    position: string;
    origin: string;
    originType: OriginType;
    drafted: boolean;
  };

  type PickEntry = {
    pickNo: number;
    round: number;
    teamId: string;
    teamName: string;
    candidate: Candidate;
  };

  const ROUND_COUNT = 10;
  const PICKS_PER_ROUND = 8;
  const TOTAL_PICKS = ROUND_COUNT * PICKS_PER_ROUND;

  let started = false;
  let loading = false;
  let pickCursor = 0;
  let candidates: Candidate[] = [];
  let draftTeamIds: string[] = [];
  let boardPicks: DraftBoardPick[] = [];   // Rust 사전 계산 전체 픽
  let displayPicks: PickEntry[] = [];      // 화면에 표시된 픽 로그
  let userDrafted = false;
  let finished = false;
  let logEl: HTMLDivElement;
  let listFilter: "all" | OriginType = "all";

  $: heroId = $gameStore.protagonist.id;
  $: heroName = $gameStore.protagonist.name;

  $: currentRound = Math.floor(pickCursor / PICKS_PER_ROUND) + 1;
  $: currentPickInRound = (pickCursor % PICKS_PER_ROUND) + 1;

  $: currentTeamId = (() => {
    if (finished || draftTeamIds.length === 0 || pickCursor >= TOTAL_PICKS) return "";
    const teamOrder = pickCursor % PICKS_PER_ROUND;
    const roundNo = currentRound;
    const slot = roundNo % 2 === 1 ? teamOrder : PICKS_PER_ROUND - 1 - teamOrder;
    return draftTeamIds[slot] ?? "";
  })();

  $: currentTeamName = getTeamName(currentTeamId);
  $: undraftedCount = candidates.filter((c) => !c.drafted).length;
  $: filteredList =
    listFilter === "all"
      ? candidates
      : candidates.filter((c) => c.originType === listFilter);

  function getTeamName(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  function toOriginType(leagueId: string): OriginType {
    if (leagueId === "LEAGUE_HIGHSCHOOL") return "HS";
    if (leagueId === "LEAGUE_UNIVERSITY") return "UNIV";
    return "IND";
  }

  function originLabel(type: OriginType): string {
    if (type === "HS") return "고교";
    if (type === "UNIV") return "대학";
    return "독립";
  }

  function buildFromEntity(e: EntityRow, isUser = false): Candidate {
    const p = (e.details as EntityDetails)?.player ?? {};
    const pitchOvr = Number(p.pitching?.ovr ?? 0);
    const batOvr = Number(p.batting?.ovr ?? 0);
    return {
      id: e.id,
      name: e.name,
      ovr: Math.max(pitchOvr, batOvr),
      age: e.age,
      potential: Number(p.potentialHidden ?? 70),
      isUser,
      position: p.position ?? "?",
      origin: getTeamName(e.teamId),
      originType: toOriginType(e.leagueId),
      drafted: false,
    };
  }

  function buildFromNpc(npc: NpcSaveState, isUser = false): Candidate {
    const pitchOvr = npc.pitching?.ovr ?? 0;
    const batOvr = npc.batting?.ovr ?? 0;
    const origin = npc.currentTeam ? getTeamName(npc.currentTeam) : npc.schoolId;
    return {
      id: npc.npcId,
      name: npc.name,
      ovr: Math.max(pitchOvr, batOvr),
      age: npc.age,
      potential: npc.developmentRate,
      isUser,
      position: npc.position,
      origin,
      originType: "HS",
      drafted: false,
    };
  }

  function npcOvr(npc: NpcSaveState): number {
    return Math.max(npc.pitching?.ovr ?? 0, npc.batting?.ovr ?? 0);
  }

  function entityOvr(e: EntityRow): number {
    const p = (e.details as EntityDetails)?.player ?? {};
    return Math.max(Number(p.pitching?.ovr ?? 0), Number(p.batting?.ovr ?? 0));
  }

  async function initBoard() {
    loading = true;
    try {

    await masterStore.loadEntities("LEAGUE_UNIVERSITY");
    await masterStore.loadEntities("LEAGUE_INDEPENDENT");

    // 전년도 KBL 순위 역순 (꼴지팀부터 지명) — 데이터 없으면 masterStore 순서 폴백
    const prevStandings = $seasonStore.prevSeasonKblStandings ?? [];
    if (prevStandings.length > 0) {
      draftTeamIds = [...prevStandings]
        .sort((a, b) => a.winPct - b.winPct || a.wins - b.wins)
        .map((s) => s.teamId);
    } else {
      draftTeamIds = $masterStore.teams
        .filter((t) => t.leagueId === "LEAGUE_KBL" && t.tier === "1군")
        .map((t) => t.id);
    }

    pickCursor = 0;
    userDrafted = false;
    finished = false;
    displayPicks = [];
    boardPicks = [];

    const seen = new Set<string>();
    const rows: Candidate[] = [];

    // ── 고교: npcs에서 3학년 필터, 없으면 masterStore 폴백 ──
    const hsNpcs = $gameStore.npcs.filter(
      (n) =>
        n.currentLeague === "LEAGUE_HIGHSCHOOL" &&
        n.grade === 3 &&
        n.careerStatus === "active"
    );

    if (hsNpcs.length > 0) {
      const sorted = [...hsNpcs].sort((a, b) => npcOvr(b) - npcOvr(a));
      const cutoff = Math.ceil(sorted.length * 0.8);
      for (const npc of sorted.slice(0, cutoff)) {
        if (seen.has(npc.npcId)) continue;
        seen.add(npc.npcId);
        rows.push(buildFromNpc(npc, !viewOnly && npc.npcId === heroId));
      }
    } else {
      await masterStore.loadEntities("LEAGUE_HIGHSCHOOL");
      const hsEntities = $masterStore.entities
        .filter((e) => e.leagueId === "LEAGUE_HIGHSCHOOL" && e.role === "player" && e.grade === 3 && (!viewOnly || e.id !== heroId))
        .sort((a, b) => entityOvr(b) - entityOvr(a));
      const cutoff = Math.ceil(hsEntities.length * 0.8);
      for (const e of hsEntities.slice(0, cutoff)) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        rows.push(buildFromEntity(e, !viewOnly && e.id === heroId));
      }
    }

    // ── 주인공 (HS 풀에 없으면 별도 추가) ──
    if (!viewOnly && !seen.has(heroId)) {
      seen.add(heroId);
      rows.push({
        id: heroId,
        name: heroName,
        ovr: $gameStore.protagonist.pitching.ovr,
        age: $gameStore.protagonist.age ?? 19,
        potential: 75,
        isUser: true,
        position: $gameStore.protagonist.position ?? "SP",
        origin: getTeamName($gameStore.protagonist.teamId),
        originType: "HS",
        drafted: false,
      });
    }

    // ── 대학: OVR 상위 30명 ──
    const allPlayers = $masterStore.entities.filter((e) => e.role === "player");

    const univTop = allPlayers
      .filter((e) => e.leagueId === "LEAGUE_UNIVERSITY")
      .sort((a, b) => entityOvr(b) - entityOvr(a))
      .slice(0, 30);

    for (const e of univTop) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      rows.push(buildFromEntity(e));
    }

    // ── 독립: OVR 상위 15명 ──
    const indTop = allPlayers
      .filter((e) => e.leagueId === "LEAGUE_INDEPENDENT")
      .sort((a, b) => entityOvr(b) - entityOvr(a))
      .slice(0, 15);

    for (const e of indTop) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      rows.push(buildFromEntity(e));
    }

    candidates = rows;
    gameStore.clearCareerDraftPickLog();

    // ── Rust에서 전체 픽 시퀀스 사전 계산 ──
    const rustCandidates: DraftBoardCandidate[] = rows.map((c) => ({
      id: c.id,
      ovr: c.ovr,
      age: c.age,
      potential: c.potential,
      isUser: c.isUser,
    }));

    boardPicks = (await runDraftBoard(
      rustCandidates,
      $gameStore.protagonist.scoutScore,
      $gameStore.protagonist.pitching.ovr,
      draftTeamIds,
      $seasonStore.seasonYear,
      ROUND_COUNT,
    )).picks;

    } finally {
      loading = false;
    }
  }

  async function startDraft() {
    await initBoard();
    started = true;
  }

  function applyPick(): PickEntry | null {
    if (finished || pickCursor >= boardPicks.length) return null;

    const bp = boardPicks[pickCursor];
    const cidx = candidates.findIndex((c) => c.id === bp.candidateId);
    if (cidx < 0) { pickCursor++; return null; }

    candidates[cidx] = { ...candidates[cidx], drafted: true };
    candidates = candidates;

    const entry: PickEntry = {
      pickNo: bp.pickNo,
      round: bp.round,
      teamId: bp.teamId,
      teamName: getTeamName(bp.teamId),
      candidate: { ...candidates[cidx] },
    };
    displayPicks = [...displayPicks, entry];

    gameStore.appendCareerDraftPickLog({
      pickNo: bp.pickNo,
      round: bp.round,
      teamId: bp.teamId,
      playerId: bp.candidateId,
      playerName: candidates[cidx].name,
      isUser: bp.isUser,
    });

    if (bp.isUser) userDrafted = true;
    pickCursor++;
    if (pickCursor >= boardPicks.length) finished = true;

    return entry;
  }

  async function doNextPick() {
    applyPick();
    await tick();
    logEl?.scrollTo({ top: logEl.scrollHeight, behavior: "smooth" });
  }

  async function doAutoAll() {
    while (!finished) {
      applyPick();
      await tick();
    }
    await tick();
    logEl?.scrollTo({ top: logEl.scrollHeight, behavior: "smooth" });
  }

  async function complete() {
    const userPick = viewOnly
      ? null
      : $gameStore.schoolState.careerDraftPickLog.find((r) => r.isUser) ?? null;
    const slotId = $gameStore.currentSlotId;
    const seasonYear = $seasonStore.seasonYear;

    // 드래프트 전체 픽 리그 거래 기록
    if (slotId && $gameStore.schoolState.careerDraftPickLog.length > 0) {
      const draftRows = $gameStore.schoolState.careerDraftPickLog.map((pick) => ({
        seasonYear, category: "draft",
        playerId: pick.playerId ?? "",
        playerName: pick.playerName ?? "",
        fromTeamId: null, fromLeagueId: null,
        toTeamId: pick.teamId, toLeagueId: "LEAGUE_KBL",
        detail: `${pick.round}라운드 ${pick.pickNo}순위`,
        groupId: null,
      }));
      await window.projectB?.leagueAddTransactions(JSON.stringify({ slotId, rows: draftRows }));
    }

    await gameStore.save();
    await seasonStore.save();
    dispatch("completed", {
      drafted: !viewOnly && userDrafted,
      teamId: userPick?.teamId ?? null,
      round: userPick?.round ?? null,
      pick: userPick?.pickNo ?? null,
      signingBonus: !viewOnly && userDrafted
        ? Math.max(3000, Math.round(($gameStore.protagonist.pitching.ovr - 45) * 220))
        : 0,
    });
    dispatch("close");
  }
</script>

<div class="overlay">
  <section class="modal">

    <!-- 헤더 -->
    <header class="modal-head">
      <div class="head-left">
        <p class="chip">{viewOnly ? "드래프트 참관" : "드래프트 진행"}</p>
        <h3>KBL 드래프트 보드</h3>
      </div>
      {#if started && !finished}
        <div class="status-bar">
          <span class="status-item">라운드 <strong>{currentRound}</strong> / {ROUND_COUNT}</span>
          <span class="sep">·</span>
          <span class="status-item">픽 <strong>{currentPickInRound}</strong> / {PICKS_PER_ROUND}</span>
          <span class="sep">·</span>
          <span class="status-item">전체 <strong>{pickCursor}</strong> / {TOTAL_PICKS}</span>
        </div>
      {:else if started && finished}
        <div class="status-bar">
          <span class="status-done">드래프트 완료 · 총 {displayPicks.length}픽</span>
        </div>
      {/if}
    </header>

    {#if !started}
      <!-- 시작 전 -->
      <div class="pre-start">
        <p class="pre-desc">KBL 8개 구단이 10라운드(총 80픽)에 걸쳐 신청 선수를 지명합니다.</p>
        <ul class="pre-info">
          <li>참가 팀: KBL 1군 8개 구단 (전년도 꼴지팀부터 지명)</li>
          <li>라운드: 10라운드 (스네이크 드래프트)</li>
          <li>총 지명 인원: 80명</li>
          <li>참가 선수: 고교 졸업예정 · 대학 · 독립리그</li>
          {#if viewOnly}
            <li>참관 모드: 주인공은 후보에서 제외됩니다</li>
          {/if}
        </ul>
      </div>
      <div class="actions">
        <button class="btn-ghost" on:click={() => dispatch("close")}>닫기</button>
        <button class="btn-primary" on:click={startDraft} disabled={loading}>
          {loading ? "불러오는 중..." : "드래프트 시작"}
        </button>
      </div>

    {:else}
      <!-- 현재 지명팀 배너 -->
      {#if !finished}
        <div class="current-team-banner">
          <span class="banner-label">현재 지명팀</span>
          <span class="banner-team">{currentTeamName}</span>
          <span class="banner-sub">라운드 {currentRound} · {currentPickInRound}번째 픽</span>
        </div>
      {:else}
        <div class="current-team-banner done">
          {#if !viewOnly && userDrafted}
            <span class="banner-team user-picked">지명 완료 — {displayPicks.find(p => p.candidate.isUser)?.teamName}이(가) 지명했습니다</span>
          {:else}
            <span class="banner-team undrafted">{viewOnly ? "드래프트가 종료되었습니다" : "지명되지 않았습니다"}</span>
          {/if}
        </div>
      {/if}

      <!-- 메인 2컬럼 -->
      <div class="board">

        <!-- 좌: 지명 로그 테이블 -->
        <div class="draft-log-wrap">
          <h4>지명 현황</h4>
          <div class="log-table-wrap" bind:this={logEl}>
            {#if displayPicks.length === 0}
              <p class="empty-log">아직 지명된 선수가 없습니다.</p>
            {:else}
              <table class="log-table">
                <thead>
                  <tr>
                    <th>픽</th>
                    <th>R</th>
                    <th>구단</th>
                    <th>선수명</th>
                    <th>OVR</th>
                    <th>출신</th>
                    <th>포지션</th>
                  </tr>
                </thead>
                <tbody>
                  {#each displayPicks as p (p.pickNo)}
                    <tr class:user-row={p.candidate.isUser}>
                      <td class="td-pick">{p.pickNo}</td>
                      <td class="td-round">{p.round}</td>
                      <td class="td-team">{p.teamName}</td>
                      <td class="td-name">
                        {p.candidate.name}
                        {#if p.candidate.isUser}<span class="star">★</span>{/if}
                      </td>
                      <td class="td-ovr">{p.candidate.ovr}</td>
                      <td class="td-origin">
                        <span class="origin-badge origin-{p.candidate.originType}">
                          {originLabel(p.candidate.originType)}
                        </span>
                        {p.candidate.origin}
                      </td>
                      <td class="td-pos">{p.candidate.position}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        </div>

        <!-- 우: 신청 선수 목록 -->
        <div class="candidate-wrap">
          <div class="candidate-head">
            <h4>신청 선수 ({candidates.length}명 · 미지명 {undraftedCount}명)</h4>
            <div class="filter-row">
              {#each ([["all","전체"],["HS","고교"],["UNIV","대학"],["IND","독립"]] as const) as [key, label]}
                <button
                  class="filter-btn"
                  class:active={listFilter === key}
                  on:click={() => (listFilter = key)}
                >{label}</button>
              {/each}
            </div>
          </div>
          <div class="candidate-list">
            {#each filteredList as c (c.id)}
              <div
                class="candidate-row"
                class:drafted={c.drafted}
                class:is-user={c.isUser}
              >
                <span class="c-name">
                  {c.name}
                  {#if c.isUser}<span class="star">★</span>{/if}
                </span>
                <span class="c-ovr">{c.ovr}</span>
                <span class="c-age">{c.age}세</span>
                <span class="origin-badge origin-{c.originType}">{originLabel(c.originType)}</span>
                <span class="c-origin">{c.origin}</span>
                <span class="c-pos">{c.position}</span>
                {#if c.drafted}
                  <span class="drafted-badge">지명</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>

      </div><!-- /board -->

      <!-- 하단 버튼 -->
      <div class="actions">
        {#if !(started && finished)}
          <button class="btn-ghost" on:click={() => dispatch("close")}>닫기</button>
        {/if}
        <div class="action-right">
          {#if !finished}
            <button class="btn-auto" on:click={doAutoAll}>전체 자동 진행</button>
            <button class="btn-primary" on:click={doNextPick}>다음 픽</button>
          {:else}
            <button class="btn-primary" on:click={complete}>
              {viewOnly ? "참관 종료" : userDrafted ? "지명 확인" : "미지명 확인"}
            </button>
          {/if}
        </div>
      </div>
    {/if}

  </section>
</div>

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.78);
    display: flex; align-items: center; justify-content: center;
    z-index: 260;
  }

  .modal {
    width: min(1180px, 96vw);
    height: 88vh;
    max-height: 92vh;
    background: #0d1928;
    border: 1px solid #2d4a7a;
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }

  /* ── 헤더 ── */
  .modal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .head-left { display: flex; flex-direction: column; gap: 2px; }
  .chip { margin: 0; color: #7aa8e0; font-size: 11px; }
  h3 { margin: 0; font-size: 20px; color: #e8f2ff; }
  h4 { margin: 0; font-size: 13px; color: #b0ccea; }

  .status-bar {
    display: flex; align-items: center; gap: 8px;
    background: #121f38; border: 1px solid #1e3560;
    border-radius: 8px; padding: 6px 14px;
    font-size: 13px; color: #8ab4e0;
    flex-shrink: 0;
  }
  .status-bar strong { color: #d0e8ff; }
  .sep { color: #2a4060; }
  .status-done { color: #60d890; font-weight: 600; }

  /* ── 시작 전 ── */
  .pre-start { display: grid; gap: 10px; }
  .pre-desc { margin: 0; color: #a0b8d8; font-size: 14px; }
  .pre-info {
    margin: 0; padding-left: 20px;
    display: grid; gap: 4px;
    color: #7a9cc4; font-size: 13px;
  }

  /* ── 현재 지명팀 배너 ── */
  .current-team-banner {
    display: flex; align-items: center; gap: 12px;
    background: #0e2044; border: 1px solid #1e3a6a;
    border-radius: 10px; padding: 10px 16px;
    flex-shrink: 0;
  }
  .current-team-banner.done { background: #0d2218; border-color: #1e4030; }

  .banner-label { font-size: 11px; color: #6888b0; flex-shrink: 0; }
  .banner-team { font-size: 17px; font-weight: 700; color: #d8f0ff; }
  .banner-team.user-picked { color: #60d890; }
  .banner-team.undrafted { color: #d08080; }
  .banner-sub { font-size: 12px; color: #5070a0; margin-left: auto; }

  /* ── 메인 보드 ── */
  .board {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
    flex: 1 1 0;
    overflow: hidden;
  }

  /* ── 지명 로그 ── */
  .draft-log-wrap {
    display: flex; flex-direction: column; gap: 8px;
    min-height: 0; overflow: hidden;
    background: #0a1628; border: 1px solid #1a3050; border-radius: 10px; padding: 10px;
  }

  .log-table-wrap {
    overflow-y: auto; flex: 1 1 0; min-height: 0;
  }

  .empty-log { color: #3a5878; font-size: 12px; padding: 12px 4px; margin: 0; }

  .log-table {
    width: 100%; border-collapse: collapse;
    font-size: 12px;
  }

  .log-table thead th {
    position: sticky; top: 0;
    background: #0d1e38; color: #5a82b8;
    padding: 5px 8px; text-align: left;
    border-bottom: 1px solid #1a3050;
    font-weight: 600; white-space: nowrap;
  }

  .log-table tbody tr { border-bottom: 1px solid #111e34; }
  .log-table tbody tr:hover { background: #101e38; }

  .log-table tbody tr.user-row { background: #1a2c10; }
  .log-table tbody tr.user-row:hover { background: #203410; }

  .log-table td {
    padding: 5px 8px; color: #b8d0f0; vertical-align: middle;
  }

  .td-pick { color: #5a8ac0; font-variant-numeric: tabular-nums; width: 36px; }
  .td-round { color: #4a7098; width: 28px; }
  .td-team { color: #c0d8f8; font-weight: 600; }
  .td-name { color: #e0f0ff; }
  .td-ovr { color: #80c0f8; font-weight: 700; width: 40px; }
  .td-origin { display: flex; align-items: center; gap: 5px; }
  .td-pos { color: #7090b8; width: 36px; }

  .star { color: #f8d060; font-size: 12px; }

  /* ── 신청 선수 목록 ── */
  .candidate-wrap {
    display: flex; flex-direction: column; gap: 8px;
    min-height: 0; overflow: hidden;
    background: #0a1628; border: 1px solid #1a3050; border-radius: 10px; padding: 10px;
  }

  .candidate-head { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }

  .filter-row { display: flex; gap: 4px; }
  .filter-btn {
    font-size: 11px; padding: 2px 8px;
    border: 1px solid #1e3a5a; background: #0e1e38;
    color: #6888a8; border-radius: 999px; cursor: pointer;
  }
  .filter-btn.active { background: #1a3a6a; border-color: #3a6ab0; color: #d0e8ff; }

  .candidate-list {
    overflow-y: auto; flex: 1 1 0; min-height: 0;
    display: flex; flex-direction: column; gap: 2px;
  }

  .candidate-row {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 6px; border-radius: 5px;
    font-size: 11px; transition: background 0.1s;
  }
  .candidate-row:hover { background: #111e34; }
  .candidate-row.drafted { opacity: 0.38; }
  .candidate-row.is-user { background: #1a2a10; }
  .candidate-row.is-user:hover { background: #203210; }

  .c-name { flex: 1; color: #c0d8f8; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c-ovr { color: #70a8e0; font-weight: 700; width: 28px; text-align: right; flex-shrink: 0; }
  .c-age { color: #486888; font-size: 10px; width: 26px; flex-shrink: 0; }
  .c-origin { color: #5a7898; font-size: 10px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c-pos { color: #4a6888; font-size: 10px; width: 24px; flex-shrink: 0; }

  .drafted-badge {
    font-size: 9px; padding: 1px 4px;
    border: 1px solid #2a5a30; background: #0e2818;
    color: #50a860; border-radius: 3px; flex-shrink: 0;
  }

  /* ── 출신 배지 ── */
  .origin-badge {
    font-size: 9px; font-weight: 700; padding: 1px 5px;
    border-radius: 3px; flex-shrink: 0; border: 1px solid;
  }
  .origin-HS   { background: #1a1030; border-color: #5a3090; color: #c090f8; }
  .origin-UNIV { background: #101830; border-color: #2a5090; color: #70a8f8; }
  .origin-IND  { background: #101a20; border-color: #2a6050; color: #60c0a0; }

  /* ── 버튼 ── */
  .actions {
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0; gap: 8px;
  }
  .action-right { display: flex; gap: 8px; }

  button { border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-primary {
    background: #1a3a6a; border: 1px solid #3a6ab0; color: #d8f0ff;
  }
  .btn-primary:hover:not(:disabled) { background: #1e4480; }

  .btn-ghost {
    background: #111e38; border: 1px solid #1e3458; color: #7090b8;
  }
  .btn-ghost:hover { background: #162440; }

  .btn-auto {
    background: #1a2818; border: 1px solid #2a4a28; color: #80c070;
  }
  .btn-auto:hover { background: #1e3020; }
</style>
