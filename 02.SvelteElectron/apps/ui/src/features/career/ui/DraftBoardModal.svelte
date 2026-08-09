<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
  import { seasonStore } from "../../../shared/stores/season";
  // 보드 OVR도 성장값이어야 한다 — 생성값은 3년을 지나도 안 자란다
  import { npcLiveStatsStore, liveOvrOf } from "../../../shared/stores/npcLiveStats";
  import type { NpcSaveState } from "../../../shared/types/save";
  import {
    draftDestinationTeams,
    pickInRound,
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

  // 라운드·순번·지명 팀은 **실제 픽에서 읽는다.** 예전엔 화면이 8팀 스네이크
  // 방식을 따로 계산했는데, 엔진은 10팀 정순이라 표시가 매번 어긋났다
  $: nextPick = boardPicks[pickCursor];
  $: currentRound = nextPick?.round ?? 0;
  $: currentPickInRound = nextPick
    ? pickInRound(nextPick.pickNo, nextPick.round, draftTeamIds.length)
    : 0;
  $: currentTeamId = finished ? "" : (nextPick?.teamId ?? "");
  $: totalRounds = boardPicks.length > 0 ? boardPicks[boardPicks.length - 1].round : 0;

  $: currentTeamName = getTeamName(currentTeamId);
  $: undraftedCount = candidates.filter((c) => !c.drafted).length;
  $: filteredList =
    listFilter === "all"
      ? candidates
      : candidates.filter((c) => c.originType === listFilter);

  function getTeamName(teamId: string): string {
    return $teamsL10n.find((t) => t.id === teamId)?.name ?? teamId;
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

  /**
   * 재도전인가 — **"23세 고등학생"을 만들지 않기 위한 표시.**
   *
   * ⚠ 미지명자는 소속이 없어진 채 다음 해에 다시 후보가 된다. 그때 경력의
   * 마지막이 고교라 화면이 `고교`라고 썼고, 그래서 **20~29세가 '고교' 출신**
   * 으로 보드에 떴다. 그들은 고등학생이 아니라 미지명 재도전자다.
   *
   * 첫 드래프트 나이(고졸 19 · 대졸 23)를 넘긴 만큼이 재도전 햇수다 —
   * 엔진의 `reentryMaxYears`와 같은 기준이라 둘이 어긋나지 않는다.
   */
  const FIRST_DRAFT_AGE = { HS: 19, UNIV: 23 } as const;
  function redoYears(c: { originType: OriginType; age: number }): number {
    if (c.originType === "IND") return 0;   // 독립은 소속이 있어 재도전이 아니다
    return Math.max(0, c.age - FIRST_DRAFT_AGE[c.originType]);
  }

  /**
   * 보드에 뜨는 시점의 NPC는 **이미 지명 처리가 끝나** 소속이 2군으로 바뀌어 있다.
   * 출신은 지명 이벤트가 남긴 `fromLeagueId`에서 읽고, 졸업생이라 그게 비면
   * 마지막 경력 기록으로 폴백한다 — 현재 소속을 보면 전원 "프로 출신"이 된다.
   */
  function buildFromNpc(npc: NpcSaveState, isUser = false): Candidate {
    const draftEvent = [...(npc.careerEvents ?? [])].reverse()
      .find((e) => e.eventType === "draft_picked");
    const fromLeague = draftEvent?.fromLeagueId
      ?? npc.careerHistory?.[npc.careerHistory.length - 1]?.leagueId
      ?? "LEAGUE_HIGHSCHOOL";
    const fromTeam = draftEvent?.fromTeamId;
    return {
      id: npc.npcId,
      name: npc.name,
      ovr: liveOvrOf(npc, $npcLiveStatsStore),
      age: npc.age,
      potential: npc.developmentRate,
      isUser,
      position: npc.position,
      origin: fromTeam ? getTeamName(fromTeam) : (npc.schoolId || "-"),
      originType: toOriginType(fromLeague),
      drafted: false,
    };
  }

  /**
   * 보드는 **실제 드래프트 결과를 재생만 한다.**
   *
   * 예전엔 여기서 자체 후보 풀(고교 3학년 상위 80% + 대학 상위 30 + 독립 상위 15)을
   * `masterStore.entities` 정의치로 만들고 자체 시뮬(`runDraftBoard`)을 돌렸다.
   * 실제 반영은 `processNpcDraft`가 **다른 후보 풀·다른 규칙**으로 따로 했으므로,
   * 화면에서 본 지명과 선수의 실제 소속이 달랐다.
   */
  async function initBoard() {
    loading = true;
    try {
      pickCursor = 0;
      userDrafted = false;
      finished = false;
      displayPicks = [];
      boardPicks = [];

      // 아직 안 돌았으면 여기서 돌린다. 이미 돌았으면 `lastDraftYear` 가드가 막고
      // 그때 남긴 로그를 그대로 읽는다 (관전 → 스킵, 스킵 → 관전 어느 순서든 같다)
      const { univIds, indIds } = draftDestinationTeams($teamsL10n);
      await gameStore.processNpcDraft($seasonStore.seasonYear, univIds, indIds);

      const log = $gameStore.schoolState.careerDraftPickLog;
      boardPicks = log.map((r) => ({
        pickNo: r.pickNo, round: r.round, teamId: r.teamId,
        candidateId: r.playerId ?? "", isUser: false,
      }));

      // 지명 순서는 실제 결과에서 읽는다 — 화면이 순서를 따로 계산하면
      // 엔진과 어긋난다 (예전엔 8팀 스네이크 방식을 별도로 계산했다)
      draftTeamIds = [...new Set(boardPicks.map((p) => p.teamId))];

      // ── 후보 카드 ──────────────────────────────────────────
      //
      // ⚠ 예전엔 후보를 **지명 결과(boardPicks)에서만** 만들었다. 그래서
      // 화면에 뜨는 후보 수가 정확히 지명 수와 같았고 **미지명이 항상 0명**이라
      // 긴장감이 없었다 — 실제 후보 풀은 1,600명이 넘는데 안 보였다.
      // 지금은 `processNpcDraft`가 남긴 후보 명단(지명 수의 배수)을 읽는다.
      const npcById = new Map($gameStore.npcs.map((n) => [n.npcId, n]));
      const rows: Candidate[] = [];
      const seen = new Set<string>();

      const saved = $gameStore.schoolState.careerDraftCandidates ?? [];
      for (const c of saved) {
        if (seen.has(c.playerId)) continue;
        seen.add(c.playerId);
        const npc = npcById.get(c.playerId);
        rows.push(npc ? buildFromNpc(npc) : {
          id: c.playerId, name: c.playerName, ovr: c.ovr, age: c.age,
          potential: c.potential, isUser: false, position: c.position,
          origin: c.originTeamId ? getTeamName(c.originTeamId) : "-",
          originType: c.route.includes("대학") ? "UNIV" : c.route.includes("독립") ? "IND" : "HS",
          drafted: false,
        });
      }

      // 명단이 없는 구 세이브 폴백 — 지명 결과로라도 채운다
      if (rows.length === 0) {
        for (const p of boardPicks) {
          if (seen.has(p.candidateId)) continue;
          seen.add(p.candidateId);
          const npc = npcById.get(p.candidateId);
          rows.push(npc
            ? buildFromNpc(npc)
            : { id: p.candidateId, name: p.candidateId, ovr: 0, age: 0, potential: 0,
                isUser: false, position: "?", origin: "-", originType: "HS", drafted: false });
        }
      }

      // ── 주인공 ──
      // 주인공은 NPC 드래프트에 안 들어간다 (진로 결과가 따로 정해진다).
      // 지명됐다면 그 순번에 끼워 넣어 보드에 같이 보이게 한다
      const cr = $gameStore.schoolState.careerResults;
      if (!viewOnly && cr?.draftDrafted && cr.draftTeamId) {
        rows.unshift({
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
        const at = Math.max(0, Math.min(boardPicks.length, (cr.draftPick ?? 1) - 1));
        boardPicks = [
          ...boardPicks.slice(0, at),
          { pickNo: cr.draftPick ?? at + 1, round: cr.draftRound ?? 1,
            teamId: cr.draftTeamId, candidateId: heroId, isUser: true },
          ...boardPicks.slice(at),
        ];
      }

      candidates = rows;
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

    // ⚠ 로그에 다시 append하지 않는다. **재생 원본이 그 로그다** —
    // 여기서 쓰면 같은 픽이 두 번 쌓이고 200개 상한에 잘려 앞부분이 사라진다

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
    // 주인공 지명은 진로 결과가 정본이다 — 보드가 만든 값이 아니라
    const cr = $gameStore.schoolState.careerResults;
    const userPick = !viewOnly && cr?.draftDrafted
      ? { teamId: cr.draftTeamId, round: cr.draftRound, pickNo: cr.draftPick }
      : null;

    // ⚠ 여기서 거래기록을 쓰지 않는다. `processNpcDraft`가 이미 썼다 —
    // 예전엔 이 함수가 careerDraftPickLog를 통째로 다시 삽입해서
    // 같은 지명이 리그 기록에 두 번 남았다

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
          <span class="status-item">라운드 <strong>{currentRound}</strong> / {totalRounds}</span>
          <span class="sep">·</span>
          <span class="status-item">픽 <strong>{currentPickInRound}</strong> / {draftTeamIds.length}</span>
          <span class="sep">·</span>
          <span class="status-item">전체 <strong>{pickCursor}</strong> / {boardPicks.length}</span>
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
                  <!--
                    ⚠ **`pickNo`로 키를 잡으면 안 된다.** 주인공은 NPC 드래프트에
                    안 들어가고 결과만 보드 중간에 끼워 넣는데(위 `boardPicks`
                    삽입), **번호를 다시 매기지 않아 그 순번이 둘이 된다.**
                    실제로 6R 56P 지명에서 `pickNo` 56이 두 개가 되어 Svelte가
                    `each_key_duplicate`로 죽었다(2026-08-08, 자동 진행 중 5회).

                    이 목록은 **덧붙이기만 하고 재정렬이 없다** — 키가 없어도
                    DOM 재사용이 어긋나지 않는다. 유일성을 못 보장하는 값으로
                    키를 잡느니 안 잡는 게 낫다.
                  -->
                  {#each displayPicks as p}
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
                <span class="origin-badge origin-{c.originType}" class:redo={redoYears(c) > 0}>
                  {redoYears(c) > 0 ? `재수 ${redoYears(c)}년` : originLabel(c.originType)}
                </span>
                <span class="c-origin">
                  {redoYears(c) > 0 ? `${originLabel(c.originType)} 출신 · ${c.origin}` : c.origin}
                </span>
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
    background: rgba(10, 18, 38, 0.52);
    display: flex; align-items: center; justify-content: center;
    z-index: 260;
  }

  .modal {
    width: min(1180px, 96vw);
    height: 88vh;
    max-height: 92vh;
    background: var(--panel);
    border: 1px solid var(--line);
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
  .chip { margin: 0; color: var(--ink); font-size: 11px; }
  h3 { margin: 0; font-size: 20px; color: var(--ink); }
  h4 { margin: 0; font-size: 13px; color: var(--ink); }

  .status-bar {
    display: flex; align-items: center; gap: 8px;
    background: var(--panel-sunk); border: 1px solid var(--line);
    border-radius: 8px; padding: 6px 14px;
    font-size: 13px; color: var(--ink);
    flex-shrink: 0;
  }
  .status-bar strong { color: var(--ink); }
  .sep { color: var(--line); }
  .status-done { color: var(--ok); font-weight: 600; }

  /* ── 시작 전 ── */
  .pre-start { display: grid; gap: 10px; }
  .pre-desc { margin: 0; color: var(--ink); font-size: 14px; }
  .pre-info {
    margin: 0; padding-left: 20px;
    display: grid; gap: 4px;
    color: var(--ink-mid); font-size: 13px;
  }

  /* ── 현재 지명팀 배너 ── */
  .current-team-banner {
    display: flex; align-items: center; gap: 12px;
    background: var(--panel-sunk); border: 1px solid var(--line);
    border-radius: 10px; padding: 10px 16px;
    flex-shrink: 0;
  }
  .current-team-banner.done { background: rgba(31, 122, 71, 0.10); border-color: rgba(31, 122, 71, 0.28); }

  .banner-label { font-size: 11px; color: var(--ink-mid); flex-shrink: 0; }
  .banner-team { font-size: 17px; font-weight: 700; color: var(--ink); }
  .banner-team.user-picked { color: var(--ok); }
  .banner-team.undrafted { color: var(--bad); }
  .banner-sub { font-size: 12px; color: var(--ink-mute); margin-left: auto; }

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
    background: var(--panel); border: 1px solid var(--panel-sunk); border-radius: 10px; padding: 10px;
  }

  .log-table-wrap {
    overflow-y: auto; flex: 1 1 0; min-height: 0;
  }

  .empty-log { color: var(--ink-mute); font-size: 12px; padding: 12px 4px; margin: 0; }

  .log-table {
    width: 100%; border-collapse: collapse;
    font-size: 12px;
  }

  .log-table thead th {
    position: sticky; top: 0;
    background: var(--panel-sunk); color: var(--ink-mid);
    padding: 5px 8px; text-align: left;
    border-bottom: 1px solid var(--panel-sunk);
    font-weight: 600; white-space: nowrap;
  }

  .log-table tbody tr { border-bottom: 1px solid var(--panel-sunk); }
  .log-table tbody tr:hover { background: var(--panel-sunk); }

  .log-table tbody tr.user-row { background: rgba(31, 122, 71, 0.10); }
  .log-table tbody tr.user-row:hover { background: rgba(31, 122, 71, 0.10); }

  .log-table td {
    padding: 5px 8px; color: var(--ink); vertical-align: middle;
  }

  .td-pick { color: var(--ink-mid); font-variant-numeric: tabular-nums; width: 36px; }
  .td-round { color: var(--ink-mute); width: 28px; }
  .td-team { color: var(--ink); font-weight: 600; }
  .td-name { color: var(--ink); }
  .td-ovr { color: var(--ink); font-weight: 700; width: 40px; }
  .td-origin { display: flex; align-items: center; gap: 5px; }
  .td-pos { color: var(--ink-mid); width: 36px; }

  .star { color: var(--warn); font-size: 12px; }

  /* ── 신청 선수 목록 ── */
  .candidate-wrap {
    display: flex; flex-direction: column; gap: 8px;
    min-height: 0; overflow: hidden;
    background: var(--panel); border: 1px solid var(--panel-sunk); border-radius: 10px; padding: 10px;
  }

  .candidate-head { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }

  .filter-row { display: flex; gap: 4px; }
  .filter-btn {
    font-size: 11px; padding: 2px 8px;
    border: 1px solid var(--line); background: var(--panel-sunk);
    color: var(--ink-mid); border-radius: 999px; cursor: pointer;
  }
  .filter-btn.active { background: var(--line); border-color: var(--ink-mute); color: var(--ink); }

  .candidate-list {
    overflow-y: auto; flex: 1 1 0; min-height: 0;
    display: flex; flex-direction: column; gap: 2px;
  }

  .candidate-row {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 6px; border-radius: 5px;
    font-size: 11px; transition: background 0.1s;
  }
  .candidate-row:hover { background: var(--panel-sunk); }
  .candidate-row.drafted { opacity: 0.38; }
  .candidate-row.is-user { background: rgba(31, 122, 71, 0.10); }
  .candidate-row.is-user:hover { background: rgba(31, 122, 71, 0.10); }

  .c-name { flex: 1; color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c-ovr { color: var(--ink); font-weight: 700; width: 28px; text-align: right; flex-shrink: 0; }
  .c-age { color: var(--ink-mute); font-size: 10px; width: 26px; flex-shrink: 0; }
  /* 재도전은 출신과 다른 상태다 — 색으로 구분한다 */
  .origin-badge.redo { background: var(--warn); color: var(--ink-on-dark); }
  .c-origin { color: var(--ink-mute); font-size: 10px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c-pos { color: var(--ink-mute); font-size: 10px; width: 24px; flex-shrink: 0; }

  .drafted-badge {
    font-size: 9px; padding: 1px 4px;
    border: 1px solid var(--ok); background: rgba(31, 122, 71, 0.10);
    color: var(--ok); border-radius: 3px; flex-shrink: 0;
  }

  /* ── 출신 배지 ── */
  .origin-badge {
    font-size: 9px; font-weight: 700; padding: 1px 5px;
    border-radius: 3px; flex-shrink: 0; border: 1px solid;
  }
  .origin-HS   { background: rgba(90, 58, 168, 0.10); border-color: rgba(90, 58, 168, 0.26); color: #5B3AA8; }
  .origin-UNIV { background: var(--panel); border-color: var(--ink-mute); color: var(--ink); }
  .origin-IND  { background: var(--panel); border-color: var(--ok); color: var(--ok); }

  /* ── 버튼 ── */
  .actions {
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0; gap: 8px;
  }
  .action-right { display: flex; gap: 8px; }

  button { border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-primary {
    background: var(--line); border: 1px solid var(--ink-mute); color: var(--ink);
  }
  .btn-primary:hover:not(:disabled) { background: var(--line); }

  .btn-ghost {
    background: var(--panel-sunk); border: 1px solid var(--panel-sunk); color: var(--ink-mid);
  }
  .btn-ghost:hover { background: var(--panel-sunk); }

  .btn-auto {
    background: rgba(31, 122, 71, 0.10); border: 1px solid rgba(31, 122, 71, 0.28); color: var(--ok);
  }
  .btn-auto:hover { background: rgba(31, 122, 71, 0.10); }
</style>
