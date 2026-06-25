<script lang="ts">
  import { autoAdvanceStore, eventHistory, countByType, type PlayerEventType } from "../../../shared/stores/autoAdvance";
  import { runAutoAdvance } from "../../../shared/usecases/runAutoAdvance";

  $: log = $autoAdvanceStore.log;
  $: running = $autoAdvanceStore.running;
  $: stopReason = $autoAdvanceStore.stopReason;
  $: visible = running || stopReason !== null;
  $: recentLog = log.slice(-10);
  $: events = $eventHistory.events;

  // 이벤트 카운터
  $: counts = {
    trade:          countByType(events, "trade"),
    fa_apply:       countByType(events, "fa_apply"),
    fa_result:      countByType(events, "fa_result"),
    draft:          countByType(events, "draft"),
    enlist_sports:  countByType(events, "enlist_sports"),
    enlist_general: countByType(events, "enlist_general"),
    discharge:      countByType(events, "discharge"),
    callup:         countByType(events, "callup"),
    calldown:       countByType(events, "calldown"),
    renewal:        countByType(events, "renewal"),
    adjustment:     countByType(events, "adjustment"),
    retire:         countByType(events, "retire"),
  };

  const FILTER_OPTS: { key: PlayerEventType | "all"; label: string }[] = [
    { key: "all",           label: "전체" },
    { key: "trade",         label: "트레이드" },
    { key: "fa_apply",      label: "FA신청" },
    { key: "fa_result",     label: "FA이동" },
    { key: "draft",         label: "드래프트" },
    { key: "enlist_sports", label: "체육부대" },
    { key: "enlist_general",label: "일반병" },
    { key: "discharge",     label: "전역" },
    { key: "callup",        label: "콜업" },
    { key: "calldown",      label: "콜다운" },
    { key: "renewal",       label: "재계약" },
    { key: "adjustment",    label: "조정" },
    { key: "retire",        label: "은퇴" },
  ];

  let filterKey: PlayerEventType | "all" = "all";
  let showEvents = false;

  $: filteredEvents = filterKey === "all"
    ? events
    : events.filter(e => e.type === filterKey);

  function stop() { autoAdvanceStore.stop("사용자가 중지"); }
  function dismiss() { autoAdvanceStore.reset(); }
  async function restart() { await runAutoAdvance(); }

  function exportLog() {
    const lines = events.flatMap(e => {
      const hdr = `[${e.type}] Y${e.seasonYear}${e.week ? ` W${e.week}` : ""} 투입:${e.counts.input} 처리:${e.counts.processed} 저장:${e.counts.saved} ${e.durationMs}ms`;
      const rows = e.players.map(p => `  ${p.name} | ${p.fromTeamId ?? "-"}→${p.toTeamId ?? "-"} | ${p.detail}`);
      return [hdr, ...rows, e.extra ? `  ${e.extra}` : ""].filter(Boolean);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `player-events-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  }
</script>

{#if visible}
  <div class="panel">
    <header class="panel-head">
      <span class="title">자동 진행</span>
      <div class="status-row">
        {#if running}
          <span class="dot dot-run"></span>
          <span class="status-text">진행 중...</span>
        {:else}
          <span class="dot dot-stop"></span>
          <span class="status-text">정지됨</span>
        {/if}
      </div>
    </header>

    <!-- 이벤트 카운터 요약 -->
    <div class="counter-row">
      {#if counts.trade > 0}<span class="cnt">TR:{counts.trade}</span>{/if}
      {#if counts.fa_result > 0}<span class="cnt">FA:{counts.fa_result}</span>{/if}
      {#if counts.draft > 0}<span class="cnt">DR:{counts.draft}</span>{/if}
      {#if counts.enlist_sports > 0}<span class="cnt">SU:{counts.enlist_sports}</span>{/if}
      {#if counts.enlist_general > 0}<span class="cnt">GN:{counts.enlist_general}</span>{/if}
      {#if counts.discharge > 0}<span class="cnt">DC:{counts.discharge}</span>{/if}
      {#if counts.callup > 0}<span class="cnt">CU:{counts.callup}</span>{/if}
      {#if counts.retire > 0}<span class="cnt">RT:{counts.retire}</span>{/if}
    </div>

    {#if stopReason && !running}
      <p class="stop-reason">{stopReason}</p>
    {/if}

    <ul class="log-list">
      {#each recentLog as line}
        <li class="log-line">{line}</li>
      {/each}
    </ul>

    <!-- 이벤트 히스토리 토글 -->
    <button class="btn btn-toggle" on:click={() => showEvents = !showEvents}>
      {showEvents ? "▲ 이벤트 숨기기" : `▼ 이벤트 상세 (${events.length}건)`}
    </button>

    {#if showEvents}
      <!-- 필터 -->
      <div class="filter-row">
        {#each FILTER_OPTS as opt}
          <button
            class="btn-filter {filterKey === opt.key ? 'active' : ''}"
            on:click={() => filterKey = opt.key}
          >{opt.label}</button>
        {/each}
      </div>

      <ul class="event-list">
        {#each filteredEvents.slice(-50).reverse() as ev}
          <li class="event-item">
            <div class="ev-head">
              <span class="ev-type ev-{ev.type}">{ev.type}</span>
              <span class="ev-meta">Y{ev.seasonYear}{ev.week ? ` W${ev.week}` : ""}</span>
              <span class="ev-count">{ev.players.length}명</span>
              <span class="ev-db {ev.dbOk ? 'ok' : 'fail'}">{ev.dbOk ? "✓" : "✗"}</span>
              <span class="ev-ms">{ev.durationMs}ms</span>
            </div>
            {#each ev.players.slice(0, 5) as p}
              <div class="ev-player">{p.name} | {p.detail}</div>
            {/each}
            {#if ev.players.length > 5}
              <div class="ev-more">... 외 {ev.players.length - 5}명</div>
            {/if}
            {#if ev.extra}
              <div class="ev-extra">{ev.extra}</div>
            {/if}
          </li>
        {/each}
        {#if filteredEvents.length === 0}
          <li class="ev-empty">이벤트 없음</li>
        {/if}
      </ul>

      <button class="btn btn-export" on:click={exportLog}>로그 내보내기 (.txt)</button>
    {/if}

    <div class="actions">
      {#if running}
        <button class="btn btn-stop" on:click={stop}>정지</button>
      {:else}
        <button class="btn btn-restart" on:click={restart}>재시작</button>
        <button class="btn btn-dismiss" on:click={dismiss}>닫기</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 300;
    width: 340px;
    background: #0d1b30;
    border: 1px solid #2d4a72;
    border-radius: 10px;
    padding: 12px 14px;
    display: grid;
    gap: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    max-height: 90vh;
    overflow-y: auto;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    font-size: 12px;
    font-weight: 700;
    color: #7aaae0;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .dot-run {
    background: #40e080;
    box-shadow: 0 0 6px #40e080;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .dot-stop { background: #e06040; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  .status-text { font-size: 11px; color: #8ab0d8; }

  /* 카운터 */
  .counter-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .cnt {
    font-size: 10px;
    font-weight: 700;
    font-family: monospace;
    color: #a0d0ff;
    background: #0a2040;
    border: 1px solid #1e3a60;
    border-radius: 4px;
    padding: 1px 5px;
  }

  .stop-reason {
    margin: 0;
    font-size: 11px;
    color: #e08060;
    background: rgba(224, 80, 40, 0.1);
    border: 1px solid rgba(224, 80, 40, 0.3);
    border-radius: 6px;
    padding: 5px 8px;
    line-height: 1.4;
    word-break: keep-all;
  }

  .log-list {
    list-style: none;
    margin: 0;
    padding: 6px 8px;
    background: #071020;
    border-radius: 6px;
    display: grid;
    gap: 2px;
    max-height: 140px;
    overflow-y: auto;
  }

  .log-list::-webkit-scrollbar { width: 4px; }
  .log-list::-webkit-scrollbar-thumb { background: #1e3a5a; border-radius: 2px; }

  .log-line {
    font-size: 10px;
    color: #6a90b8;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .log-line:last-child { color: #a0c8e8; }

  /* 필터 */
  .filter-row {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .btn-filter {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid #2d4a72;
    background: #0a1a30;
    color: #6a90b8;
    cursor: pointer;
  }
  .btn-filter.active {
    background: #1a3a60;
    border-color: #4a8ad8;
    color: #a0d0ff;
    font-weight: 700;
  }

  /* 이벤트 리스트 */
  .event-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    max-height: 300px;
    overflow-y: auto;
  }
  .event-item {
    background: #071020;
    border: 1px solid #1a3050;
    border-radius: 6px;
    padding: 5px 8px;
    display: grid;
    gap: 2px;
  }
  .ev-head {
    display: flex;
    gap: 5px;
    align-items: center;
    flex-wrap: wrap;
  }
  .ev-type {
    font-size: 9px;
    font-weight: 700;
    font-family: monospace;
    padding: 1px 5px;
    border-radius: 3px;
    background: #1a3050;
    color: #80b8f0;
  }
  .ev-type.ev-trade         { color: #f0c040; background: #2a2010; }
  .ev-type.ev-fa_result     { color: #60e0a0; background: #0a2015; }
  .ev-type.ev-draft         { color: #80c0ff; background: #0a1530; }
  .ev-type.ev-enlist_sports { color: #c080f0; background: #180a30; }
  .ev-type.ev-enlist_general{ color: #f08060; background: #2a1010; }
  .ev-type.ev-discharge     { color: #40d0d0; background: #082020; }
  .ev-type.ev-retire        { color: #a0a0a0; background: #181818; }
  .ev-meta { font-size: 10px; color: #6a90b8; font-family: monospace; }
  .ev-count { font-size: 10px; color: #a0c8e8; font-family: monospace; }
  .ev-db { font-size: 10px; font-weight: 700; }
  .ev-db.ok   { color: #40e080; }
  .ev-db.fail { color: #e04040; }
  .ev-ms { font-size: 9px; color: #4a6888; font-family: monospace; margin-left: auto; }
  .ev-player {
    font-size: 10px;
    color: #8ab0d8;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 4px;
  }
  .ev-more { font-size: 10px; color: #4a6888; padding-left: 4px; }
  .ev-extra { font-size: 10px; color: #b0b040; padding-left: 4px; }
  .ev-empty { font-size: 11px; color: #4a6888; text-align: center; padding: 8px; }

  .actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .btn {
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    padding: 5px 12px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn-toggle {
    font-size: 10px;
    font-weight: 600;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    background: #0a1a30;
    border: 1px solid #2d4a72;
    color: #6a90b8;
    text-align: left;
  }
  .btn-toggle:hover { background: #12253d; }

  .btn-export {
    font-size: 10px;
    font-weight: 600;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    background: #0a2010;
    border: 1px solid #2a5030;
    color: #60a080;
  }
  .btn-export:hover { background: #122818; }

  .btn-stop {
    background: #2a1010;
    border-color: #7a2020;
    color: #f07060;
  }
  .btn-stop:hover { background: #3a1818; }

  .btn-restart {
    background: #0f2a18;
    border-color: #2a6040;
    color: #60e090;
  }
  .btn-restart:hover { background: #183820; }

  .btn-dismiss {
    background: #111e34;
    border-color: #2d4060;
    color: #6a90b8;
  }
  .btn-dismiss:hover { background: #1a2a40; }
</style>
