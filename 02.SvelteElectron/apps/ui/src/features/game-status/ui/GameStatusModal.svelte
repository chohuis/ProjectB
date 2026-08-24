<!--
  ⚠ **타입은 `context="module"`에 있어야 한다.** instance `<script>`의
     `export type`은 컴포넌트 prop 선언으로 읽혀서 다른 파일이 import할 수
     없다 — `MainPage`가 `EntryInfo`·`NoEntryInfo`·`MatchSummary`를 그렇게
     가져가려다 실패하고 있었다(svelte-check 7건이 한 원인이었다).
-->
<script context="module" lang="ts">
  import type { PlayerGameLine } from "../../../shared/types/season";

  export type MatchSummary = {
    inningScores:         { home: number[]; away: number[] };
    batterAccum:          Record<string, { pa:number; ab:number; h:number; hr:number; rbi:number; bb:number; k:number }>;
    homeLineup:           { id: string; name: string }[];
    awayLineup:           { id: string; name: string }[];
    oppPitcherName:       string | null;
    oppPitcherPitchCount: number;
    oppPitcherStamina:    number;
    myPitcherName:        string | null;
    myPitcherPitchCount:  number;
    myPitcherStamina:     number;
    preEntryLogs:         string[];
    currentOuts:          number;
    runners:              { first: boolean; second: boolean; third: boolean };
  };

  export type EntryInfo   = MatchSummary & { inning: number; half: string; homeScore: number; awayScore: number };
  /**
   * ⚠ `playerLines`는 **타입에 없는데 오가고 있었다.** `MainPage`가 넣고
   *   (`gameNoEntryInfo = { …, playerLines }`) 다시 읽어(`applyGameOutcome`)
   *   쓰는데, 타입 블록이 instance `<script>`에 있어 `{}`로 추론되는 바람에
   *   검사가 통과하고 있었다. 타입을 제자리로 옮기자 드러났다.
   */
  export type NoEntryInfo = MatchSummary & {
    homeScore: number; awayScore: number;
    playerLines?: PlayerGameLine[];
  };

  export type SimState = "idle" | "loading" | "no_entry" | "ready" | "error";
</script>
<script lang="ts">
  export let homeTeamName  = "홈팀";
  export let awayTeamName  = "원정팀";
  export let week          = 0;
  export let isFriendly    = false;
  export let protagonistTeamId = "";
  export let homeTeamId    = "";


  export let simState:     SimState     = "idle";
  export let entryInfo:    EntryInfo   | null = null;
  export let noEntryInfo:  NoEntryInfo | null = null;
  export let errorMsg      = "";
  export let autoRunning   = false;

  export let onAutoSim:    () => void = () => {};
  export let onDirectPlay: () => void = () => {};
  /** 경기 전 브리핑 열기 — 읽기 전용 창이라 진행과 무관하다 */
  export let onOpenBriefing: () => void = () => {};
  export let onConfirm:    () => void = () => {};
  export let onSkip:       () => void = () => {};

  // ── 헬퍼 ─────────────────────────────────────────────────────
  function avg(ab: number, h: number): string {
    if (ab === 0) return "-";
    return (h / ab).toFixed(3).replace(/^0/, "");
  }

  function staminaBar(val: number): string {
    const pct = Math.round(Math.max(0, Math.min(100, val)));
    const filled = Math.round(pct / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  }

  function staminaColor(val: number): string {
    if (val >= 70) return "#1F7A47";
    if (val >= 40) return "#9A6510";
    return "#B3311F";
  }

  function halfKo(half: string): string {
    return half === "top" ? "초" : "말";
  }

  // 현재 정보 (entry 또는 noEntry에서 추출)
  $: info = (entryInfo ?? noEntryInfo) as MatchSummary | null;

  // 이닝별 스코어 표시용 (최대 9이닝, 현재 이닝 강조)
  $: currentInning = entryInfo?.inning ?? (info ? 9 : 1);
  $: scores = info?.inningScores ?? { home: [], away: [] };

  // 타자 성적 목록 생성
  function buildBatterRows(lineup: { id: string; name: string }[], accum: Record<string, { ab?: number; h?: number; hr?: number; rbi?: number; bb?: number }>) {
    return lineup.map(r => {
      const s = accum[r.id] ?? { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0 };
      return { name: r.name, ab: s.ab ?? 0, h: s.h ?? 0, hr: s.hr ?? 0, rbi: s.rbi ?? 0, bb: s.bb ?? 0 };
    }).filter(r => r.name);
  }

  $: homeBatters = buildBatterRows(info?.homeLineup ?? [], info?.batterAccum ?? {});
  $: awayBatters = buildBatterRows(info?.awayLineup ?? [], info?.batterAccum ?? {});

  // 홈팀이 주인공팀이면 홈 = 내 팀
  $: isHome       = homeTeamId === protagonistTeamId;
  $: myTeamName   = isHome ? homeTeamName : awayTeamName;
  $: oppTeamName  = isHome ? awayTeamName : homeTeamName;
  $: myBatters    = isHome ? homeBatters : awayBatters;
  $: oppBatters   = isHome ? awayBatters : homeBatters;
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="panel">

    <!-- ── 헤더 ──────────────────────────────────────────── -->
    <header class="hd">
      <div class="hd-left">
        <span class="week-chip">W{week}</span>
        {#if isFriendly}<span class="friendly-chip">친선경기</span>{/if}
      </div>
      <div class="hd-center">
        <span class="team-name" class:my={isHome}>{homeTeamName}</span>
        {#if info}
          <span class="score">{entryInfo?.homeScore ?? noEntryInfo?.homeScore ?? 0}</span>
          <span class="colon">:</span>
          <span class="score">{entryInfo?.awayScore ?? noEntryInfo?.awayScore ?? 0}</span>
        {:else}
          <span class="score-dash">vs</span>
        {/if}
        <span class="team-name" class:my={!isHome}>{awayTeamName}</span>
      </div>
      <div class="hd-right">
        {#if simState === "loading"}
          <span class="status-chip loading">분석 중…</span>
        {:else if simState === "ready" && entryInfo}
          <span class="status-chip entry">{entryInfo.inning}회 {halfKo(entryInfo.half)} 등판</span>
        {:else if simState === "no_entry"}
          <span class="status-chip no-entry">등판 없음</span>
        {:else if simState === "error"}
          <span class="status-chip err">오류</span>
        {/if}
      </div>
    </header>

    {#if simState === "loading"}
      <!-- ── 로딩 ─────────────────────────────────────── -->
      <div class="loading-body">
        <p class="loading-msg">감독의 기용을 기다리는 중...</p>
        <div class="loading-dots"><span></span><span></span><span></span></div>
      </div>

    {:else if simState === "error"}
      <!-- ── 에러 ─────────────────────────────────────── -->
      <div class="loading-body">
        <p class="err-msg">{errorMsg || "경기 엔진 연결에 실패했습니다."}</p>
        <button class="btn-skip" on:click={onSkip}>패배 처리 후 건너뛰기</button>
      </div>

    {:else if info}
      <!-- ── 메인 콘텐츠 (가로 3열) ───────────────────── -->
      <div class="main-grid">

        <!-- 좌 패널: 스코어보드 + 타자 성적 -->
        <div class="left-panel">

          <!-- 이닝별 스코어보드 -->
          <section class="scoreboard">
            <table class="score-table">
              <thead>
                <tr>
                  <th class="th-team"></th>
                  {#each Array(9) as _, i}
                    <th class="th-inn" class:current-inn={i + 1 === currentInning && simState === "ready"}>
                      {i + 1}
                    </th>
                  {/each}
                  <th class="th-total">R</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="td-team" class:my-team-row={isHome}>{homeTeamName}</td>
                  {#each Array(9) as _, i}
                    <td class="td-inn"
                      class:current-inn={i + 1 === currentInning && simState === "ready"}
                      class:future-inn={simState === "ready" && i + 1 > currentInning}>
                      {(scores.home[i] !== undefined && scores.home[i] !== 0)
                        ? scores.home[i]
                        : (simState === "ready" && i + 1 >= currentInning ? "·" : (scores.home[i] ?? "·"))}
                    </td>
                  {/each}
                  <td class="td-total">{entryInfo?.homeScore ?? noEntryInfo?.homeScore ?? 0}</td>
                </tr>
                <tr>
                  <td class="td-team" class:my-team-row={!isHome}>{awayTeamName}</td>
                  {#each Array(9) as _, i}
                    <td class="td-inn"
                      class:current-inn={i + 1 === currentInning && simState === "ready"}
                      class:future-inn={simState === "ready" && i + 1 > currentInning}>
                      {(scores.away[i] !== undefined && scores.away[i] !== 0)
                        ? scores.away[i]
                        : (simState === "ready" && i + 1 >= currentInning ? "·" : (scores.away[i] ?? "·"))}
                    </td>
                  {/each}
                  <td class="td-total">{entryInfo?.awayScore ?? noEntryInfo?.awayScore ?? 0}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- 타자 성적 (홈·원정 나란히) -->
          <section class="batters-grid">
            {#each [{ name: myTeamName, rows: myBatters, isMyTeam: true }, { name: oppTeamName, rows: oppBatters, isMyTeam: false }] as grp}
              <div class="batter-col">
                <p class="batter-team-label" class:my-label={grp.isMyTeam}>{grp.name}</p>
                <table class="batter-table">
                  <thead>
                    <tr>
                      <th class="bt-name">선수</th>
                      <th class="bt-stat">타율</th>
                      <th class="bt-stat">안타</th>
                      <th class="bt-stat">HR</th>
                      <th class="bt-stat">볼넷</th>
                      <th class="bt-stat">타점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each grp.rows.slice(0, 9) as r}
                      <tr>
                        <td class="bt-name-cell">{r.name}</td>
                        <td class="bt-val">{r.ab > 0 ? avg(r.ab, r.h) : "-"}</td>
                        <td class="bt-val">{r.h > 0 ? r.h : "-"}</td>
                        <td class="bt-val">{r.hr > 0 ? r.hr : "-"}</td>
                        <td class="bt-val">{r.bb > 0 ? r.bb : "-"}</td>
                        <td class="bt-val">{r.rbi > 0 ? r.rbi : "-"}</td>
                      </tr>
                    {/each}
                    {#if grp.rows.length === 0}
                      <tr><td colspan="4" class="no-data">데이터 없음</td></tr>
                    {/if}
                  </tbody>
                </table>
              </div>
            {/each}
          </section>
        </div>

        <!-- 우 패널: 투수 현황 + 경기 흐름 -->
        <div class="right-panel">

          <!-- 투수 현황 -->
          <section class="pitchers">
            <p class="section-label">투수 현황</p>
            {#each [
              { label: oppTeamName, name: info.oppPitcherName, pc: info.oppPitcherPitchCount, st: info.oppPitcherStamina },
              { label: myTeamName,  name: info.myPitcherName,  pc: info.myPitcherPitchCount,  st: info.myPitcherStamina  },
            ] as p}
              <div class="pitcher-row">
                <div class="pitcher-top">
                  <span class="pitcher-team">{p.label}</span>
                  <span class="pitcher-name">{p.name ?? "NPC 투수"}</span>
                  <span class="pitcher-pc">{p.pc}구</span>
                </div>
                <div class="stamina-bar-wrap">
                  <div class="stamina-track">
                    <div class="stamina-bar"
                      style="width:{Math.round(p.st)}%; background:{staminaColor(p.st)}">
                    </div>
                  </div>
                  <span class="stamina-pct" style="color:{staminaColor(p.st)}">{Math.round(p.st)}%</span>
                </div>
              </div>
            {/each}
          </section>

          <!-- 경기 흐름 -->
          <section class="game-log">
            <p class="section-label">경기 흐름</p>
            {#if info.preEntryLogs.length > 0}
              <ul class="log-list">
                {#each info.preEntryLogs as log}
                  <li class="log-item">{log}</li>
                {/each}
              </ul>
            {:else}
              <p class="no-data">경기 기록 없음</p>
            {/if}
          </section>

        </div>
      </div>

      <!-- ── 하단 액션 ───────────────────────────────── -->
      <footer class="ft">
        {#if simState === "ready" && entryInfo}
          <div class="entry-status">
            <span class="entry-badge">{entryInfo.inning}회 {halfKo(entryInfo.half)} 등판</span>
            <span class="outs-badge">{entryInfo.currentOuts}사</span>
            <span class="runners-badge">
              {#if entryInfo.runners.first || entryInfo.runners.second || entryInfo.runners.third}
                주자
                {entryInfo.runners.third  ? "3루 " : ""}
                {entryInfo.runners.second ? "2루 " : ""}
                {entryInfo.runners.first  ? "1루"  : ""}
              {:else}
                무주자
              {/if}
            </span>
          </div>
          <div class="ft-actions">
            <!-- ⚠ **브리핑은 진행 버튼이 아니다.** 예전엔 경기 전에 강제로
                 뜨는 창이라 매 경기 닫는 일이 됐다 — 이제 보고 싶을 때만
                 연다 (사용자 확정 2026-08-07) -->
            <button class="btn-brief" on:click={onOpenBriefing} disabled={autoRunning}>
              경기 전 브리핑
            </button>
            <span class="ft-gap"></span>
            <button class="btn-auto" on:click={onAutoSim} disabled={autoRunning}>
              {autoRunning ? "시뮬 중…" : "자동 시뮬"}
            </button>
            <button class="btn-play" on:click={onDirectPlay} disabled={autoRunning}>직접 플레이</button>
          </div>

        {:else if simState === "no_entry" && noEntryInfo}
          <div class="no-entry-status">
            <span class="no-entry-label">이번 경기 등판 기회 없음</span>
            <span class="no-entry-score">최종 {homeTeamName} {noEntryInfo.homeScore} : {noEntryInfo.awayScore} {awayTeamName}</span>
          </div>
          <div class="ft-actions">
            <button class="btn-confirm" on:click={onConfirm}>확인</button>
          </div>
        {/if}
      </footer>
    {/if}

  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 10, 24, 0.88);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    width: 100%;
    max-width: 1000px;
    height: calc(90vh - 24px);
    max-height: calc(90vh - 24px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── 헤더 ── */
  .hd {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--panel-sunk);
    background: var(--panel);
  }

  .hd-left  { display: flex; gap: 6px; align-items: center; }
  .hd-right { display: flex; justify-content: flex-end; }
  .hd-center { display: flex; align-items: center; gap: 10px; }

  .week-chip { background: var(--line); color: var(--ink); border: 1px solid var(--ink-mute); border-radius: 6px; font-size: 12px; font-weight: 700; padding: 2px 8px; }
  .friendly-chip { background: var(--panel-sunk); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; font-size: 11px; padding: 2px 7px; }

  .team-name { font-size: 15px; font-weight: 700; color: var(--ink); }
  .team-name.my { color: var(--ink); }
  .score { font-size: 22px; font-weight: 900; color: var(--ink); min-width: 22px; text-align: center; }
  .colon { font-size: 18px; color: var(--ink-mute); font-weight: 700; }
  .score-dash { font-size: 16px; color: var(--ink-mute); padding: 0 8px; }

  .status-chip { border-radius: 6px; font-size: 12px; font-weight: 700; padding: 3px 9px; }
  .status-chip.loading   { background: var(--panel-sunk); color: var(--ink); }
  .status-chip.entry     { background: rgba(31, 122, 71, 0.10); color: var(--ok); border: 1px solid var(--ok); }
  .status-chip.no-entry  { background: rgba(154, 101, 16, 0.12); color: var(--warn); }
  .status-chip.err       { background: rgba(179, 49, 31, 0.09); color: var(--bad); }

  /* ── 로딩 / 에러 ── */
  .loading-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .loading-msg { font-size: 16px; color: var(--ink); }
  .err-msg { font-size: 14px; color: var(--bad); text-align: center; max-width: 400px; }

  .loading-dots { display: flex; gap: 8px; }
  .loading-dots span {
    width: 8px; height: 8px; border-radius: 50%; background: var(--ink-mute);
    animation: dot-pulse 1.2s infinite ease-in-out;
  }
  .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dot-pulse { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; } }

  .btn-skip { background: rgba(179, 49, 31, 0.09); border: 1px solid rgba(179, 49, 31, 0.26); color: var(--bad); border-radius: 8px; padding: 9px 18px; cursor: pointer; font-size: 13px; }

  /* ── 메인 그리드 (가로 분할) ── */
  .main-grid {
    flex: 1 1 0;
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 0;
    overflow: hidden;
    min-height: 0;
  }

  /* ── 좌 패널 ── */
  .left-panel {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    border-right: 1px solid var(--panel-sunk);
  }

  /* 스코어보드 */
  .scoreboard {
    flex: 0 0 auto;
    padding: 10px 14px 8px;
    border-bottom: 1px solid var(--panel-sunk);
  }

  .score-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .score-table th, .score-table td { text-align: center; padding: 4px 5px; }
  .th-team { width: 52px; text-align: left; }
  .th-inn { width: 28px; font-size: 11px; color: var(--ink-mute); }
  .th-total { width: 32px; font-weight: 700; color: var(--ink-mid); font-size: 12px; }

  .td-team { text-align: left; font-size: 12px; font-weight: 700; color: var(--ink); padding-left: 4px; max-width: 52px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .td-team.my-team-row { color: var(--ink); }
  .td-inn { font-size: 13px; color: var(--ink-mid); }
  .td-inn.future-inn { color: var(--line); }
  .td-total { font-size: 15px; font-weight: 900; color: var(--ink); }

  .th-inn.current-inn, .td-inn.current-inn {
    background: var(--panel-sunk);
    color: var(--ink);
    font-weight: 700;
    border-radius: 3px;
  }

  /* 타자 성적 */
  .batters-grid {
    flex: 1 1 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    overflow: hidden;
    min-height: 0;
  }

  .batter-col {
    overflow-y: auto;
    padding: 8px 10px;
    border-right: 1px solid var(--panel-sunk);
    min-height: 0;
  }
  .batter-col:last-child { border-right: none; }

  .batter-team-label {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-mute);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .batter-team-label.my-label { color: var(--ink-mid); }

  .batter-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .batter-table th { color: var(--ink-mute); font-size: 10px; text-transform: uppercase; padding: 2px 4px; text-align: center; }
  .bt-name { text-align: left; width: 60px; }
  .bt-stat { width: 30px; }

  .batter-table tr:hover td { background: var(--panel-sunk); }
  .bt-name-cell { color: var(--ink); padding: 3px 4px; font-weight: 600; }
  .bt-val { color: var(--ink); text-align: center; padding: 3px 4px; }
  .no-data { color: var(--line); font-style: italic; font-size: 11px; padding: 6px; }

  /* ── 우 패널 ── */
  .right-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .section-label {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-mute);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* 투수 현황 */
  .pitchers {
    flex: 0 0 auto;
    padding: 10px 14px;
    border-bottom: 1px solid var(--panel-sunk);
  }

  .pitcher-row { margin-bottom: 10px; }
  .pitcher-row:last-child { margin-bottom: 0; }

  .pitcher-top {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .pitcher-team { font-size: 10px; color: var(--ink-mute); }
  .pitcher-name { font-size: 13px; font-weight: 700; color: var(--ink); flex: 1; }
  .pitcher-pc { font-size: 11px; color: var(--ink-mid); white-space: nowrap; }

  .stamina-bar { height: 6px; border-radius: 3px; transition: width 0.3s; }
  .stamina-pct { font-size: 11px; font-weight: 700; white-space: nowrap; min-width: 34px; text-align: right; }

  /* 경기 흐름 */
  .game-log {
    flex: 1 1 0;
    overflow-y: auto;
    padding: 10px 14px;
    min-height: 0;
  }

  .log-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  .log-item { font-size: 12px; color: var(--ink); line-height: 1.4; padding: 4px 8px; background: var(--panel-sunk); border-left: 2px solid var(--line); border-radius: 0 4px 4px 0; }

  /* ── 하단 액션 ── */
  .ft {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 18px;
    border-top: 1px solid var(--panel-sunk);
    background: var(--panel);
  }

  .entry-status, .no-entry-status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .entry-badge { background: rgba(31, 122, 71, 0.10); color: var(--ok); border: 1px solid var(--ok); border-radius: 6px; font-size: 13px; font-weight: 700; padding: 4px 10px; }
  .outs-badge  { background: var(--panel-sunk); color: var(--ink); border-radius: 6px; font-size: 12px; padding: 3px 8px; }
  .runners-badge { font-size: 12px; color: var(--ink); }

  .no-entry-label { font-size: 14px; color: var(--warn); font-weight: 600; }
  .no-entry-score { font-size: 13px; color: var(--ink-mid); }

  .ft-actions { display: flex; gap: 10px; flex: 0 0 auto; }

  .btn-auto, .btn-play, .btn-confirm {
    border-radius: 8px;
    font-size: 14px;
    font-weight: 700;
    padding: 9px 22px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .btn-auto    { background: var(--panel-sunk); border: 1px solid var(--line); color: var(--ink); }
  .btn-auto:hover:not(:disabled) { background: var(--line); }
  .btn-play    { background: var(--line); border: 1px solid var(--ink-mute); color: var(--ink); }
  .btn-play:hover:not(:disabled) { background: var(--ink-mute); }
  .btn-confirm { background: var(--line); border: 1px solid var(--ink-mute); color: var(--ink); }
  .btn-confirm:hover { background: var(--ink-mute); }

  .btn-auto:disabled, .btn-play:disabled { opacity: 0.5; cursor: default; }

  /* ⚠ **진행 버튼과 생김새를 다르게 한다.** 나란히 두면 "브리핑"이 진행
     선택지로 읽혀서, 읽으려던 사람이 경기를 시작한 줄 안다. 테두리만 있는
     보조 버튼 + 사이에 여백을 둬서 무리를 가른다 */
  .ft-gap { width: 14px; }
  .btn-brief {
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    padding: 9px 16px;
    cursor: pointer;
    background: none;
    border: 1px solid var(--line);
    color: var(--ink-mid);
    transition: border-color 0.12s, color 0.12s;
  }
  .btn-brief:hover:not(:disabled) { border-color: var(--ink-mute); color: var(--ink); }
  .btn-brief:disabled { opacity: 0.5; cursor: default; }

  .stamina-bar-wrap { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6px; }
  .stamina-track { height: 6px; background: var(--panel-sunk); border-radius: 3px; overflow: hidden; }
</style>
