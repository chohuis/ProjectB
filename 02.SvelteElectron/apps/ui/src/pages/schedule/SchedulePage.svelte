<script lang="ts">
  import { t } from "../../shared/i18n";
  import { seasonStore } from "../../shared/stores/season";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";

  type CalendarView = "year" | "month" | "week" | "season";
  type ScheduleType = "game" | "training" | "event" | "rest";

  type ScheduleItem = {
    id: string;
    date: string;
    type: ScheduleType;
    title: string;
    time: string;
    location: string;
    status: "planned" | "done" | "important";
    meta?: {
      result?: { won: boolean; score: string } | null;
      programs?: string[];
      body?: string;
    };
  };

  const typeLabel: Record<ScheduleType, string> = {
    game: "경기", training: "훈련", event: "이벤트", rest: "휴식"
  };

  const monthLabel = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const weekLabel  = ["월","화","수","목","금","토","일"];

  // ── 훈련 프로그램 이름 매핑 ────────────────────────────────────
  const PROGRAM_TITLE: Record<string, string> = {
    TRN_CMD_BASE:  "커맨드 기초",  TRN_VEL_POWER: "구위 파워",
    TRN_CTRL_MECH: "제구 메커니즘", TRN_MVT_PITCH: "변화구 연습",
    TRN_MNT_FOCUS: "멘탈 집중",   TRN_STA_COND:  "체력 강화",
    TRN_CLUTCH:    "위기집중",     TRN_HOLD:      "견제 훈련",
    TRN_PITCH_DEV: "구종 개발",    TRN_RECOVERY:  "컨디셔닝",
    TRN_CONTACT:   "컨택 훈련",   TRN_POWER:     "파워 훈련",
    TRN_EYE:       "선구안",       TRN_SPEED:     "주루 훈련",
    TRN_FIELDING:  "수비 훈련",   TRN_BUNTING:   "번트 훈련",
    TRN_BCLUTCH:   "클러치 훈련",
  };

  // ── Svelte 액션: 좌우 스와이프 → 이전/다음 ────────────────────
  function swipeNav(node: HTMLElement, onSwipe: (dir: "prev" | "next") => void) {
    let sx = 0, sy = 0;
    const down = (e: PointerEvent) => { sx = e.clientX; sy = e.clientY; };
    const up   = (e: PointerEvent) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2)
        onSwipe(dx < 0 ? "next" : "prev");
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointerup",   up);
    return {
      update(fn: typeof onSwipe) { onSwipe = fn; },
      destroy() {
        node.removeEventListener("pointerdown", down);
        node.removeEventListener("pointerup",   up);
      },
    };
  }

  // ── Svelte 액션: 마우스 드래그 세로 스크롤 ───────────────────
  function dragScroll(node: HTMLElement) {
    let active = false, startY = 0, scrollY = 0;
    const down  = (e: MouseEvent) => { active = true; startY = e.pageY; scrollY = node.scrollTop; node.style.cursor = "grabbing"; };
    const move  = (e: MouseEvent) => { if (!active) return; e.preventDefault(); node.scrollTop = scrollY - (e.pageY - startY); };
    const up    = () => { active = false; node.style.cursor = "grab"; };
    node.style.cursor = "grab";
    node.addEventListener("mousedown",  down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup",   up);
    return { destroy() {
      node.removeEventListener("mousedown",  down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup",   up);
    }};
  }

  // ── 날짜 유틸 ─────────────────────────────────────────────────
  function toDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function fromDateKey(dateKey: string): Date {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
  function startOfWeek(date: Date): Date {
    const day = date.getDay();
    return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), day === 0 ? -6 : 1 - day);
  }
  // 주차 번호 → 특정 요일의 날짜 (dayOffset: 0=월 3=목 5=토)
  function weekToDateKey(week: number, seasonYear: number, dayOffset = 3): string {
    const base = new Date(seasonYear, 2, 1);
    base.setDate(base.getDate() + (week - 1) * 7 + dayOffset);
    return toDateKey(base);
  }

  // ── 상태 ──────────────────────────────────────────────────────
  $: todayDate = $seasonStore.currentDate
    ? new Date($seasonStore.currentDate + "T00:00:00")
    : new Date(2026, 3, 21);
  let view: CalendarView = "season";
  let filter: "all" | ScheduleType = "all";
  let cursor = $seasonStore.currentDate
    ? new Date($seasonStore.currentDate + "T00:00:00")
    : new Date(2026, 3, 21);
  let selectedDateKey = $seasonStore.currentDate ?? "2026-03-01";

  // ── 포스트시즌 레이블 ─────────────────────────────────────────
  function psLabel(id: string): string {
    if (id.startsWith("PS_FINAL_")) return "[결승]";
    if (id.startsWith("PS_SEMI"))   return "[준결승]";
    if (id.includes("_KS_"))    return "[한국시리즈]";
    if (id.includes("_PO_"))    return "[플레이오프]";
    if (id.includes("_PREP_"))  return "[준플레이오프]";
    if (id.includes("_WC_"))    return "[와일드카드]";
    if (id.includes("_CS_"))    return "[챔피언십]";
    if (id.includes("_EDS_") || id.includes("_WDS_")) return "[디비전시리즈]";
    if (id.includes("_EWC_") || id.includes("_WWC_")) return "[와일드카드]";
    if (id.includes("_SEMI"))   return "[준결승]";
    if (id.includes("_FINAL"))  return "[결승]";
    return "";
  }

  // ── 기본 데이터 ───────────────────────────────────────────────
  $: protagonistTeamId = $gameStore.protagonist.teamId;
  $: seasonEntries = $seasonStore.schedule;
  $: hasSeasonSchedule = seasonEntries.length > 0;
  $: totalWeeks = $seasonStore.totalWeeks > 0 ? $seasonStore.totalWeeks : 52;
  $: allWeeks   = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  $: seasonYear = $seasonStore.seasonYear || 2026;
  $: currentWeek = $seasonStore.currentWeek ?? 1;

  function teamLabel(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }
  function gameStatusLabel(entry: (typeof seasonEntries)[0]): string {
    if (!entry.result) return entry.week > currentWeek ? "예정" : "진행 중";
    const won = entry.result.winnerId === protagonistTeamId;
    return `${won ? "승" : "패"} ${entry.result.homeScore}:${entry.result.awayScore}`;
  }

  const PHASE_LABEL: Record<string, string> = {
    preseason: "프리시즌", season: "정규시즌",
    postseason: "포스트시즌", offseason: "비시즌",
  };
  const PHASE_TRAIN_LABEL: Record<string, string> = {
    preseason: "스프링 캠프", season: "주간 훈련",
    postseason: "마무리 훈련", offseason: "비시즌",
  };

  // ── phase 맵 ──────────────────────────────────────────────────
  $: phaseByWeek = (() => {
    const m = new Map<number, string>();
    for (const e of seasonEntries) if (!m.has(e.week)) m.set(e.week, e.phase);
    return m;
  })();
  function weekPhase(week: number): string {
    return phaseByWeek.get(week) ?? "offseason";
  }

  // ── 훈련 프로그램 레이블 ──────────────────────────────────────
  $: trainingPrograms = (() => {
    const plan = $gameStore.trainingPlan;
    return [
      plan.primaryProgramId   ? (PROGRAM_TITLE[plan.primaryProgramId]   ?? plan.primaryProgramId)   : null,
      plan.secondaryProgramId ? (PROGRAM_TITLE[plan.secondaryProgramId] ?? plan.secondaryProgramId) : null,
      plan.recoveryProgramId  ? (PROGRAM_TITLE[plan.recoveryProgramId]  ?? plan.recoveryProgramId)  : null,
    ].filter(Boolean) as string[];
  })();
  $: trainingTitleStr = trainingPrograms.length > 0 ? trainingPrograms.join(" · ") : "주간 훈련";

  // ── 스케줄 항목 생성 ─────────────────────────────────────────
  // 1. 경기 항목
  $: gameItems = seasonEntries.map((entry): ScheduleItem => {
    const date = entry.gameDate ?? weekToDateKey(entry.week, seasonYear, 5);
    const isHome = entry.homeTeamId === protagonistTeamId;
    const opponent = teamLabel(isHome ? entry.awayTeamId : entry.homeTeamId);
    const status: ScheduleItem["status"] = entry.result
      ? "done"
      : entry.week >= currentWeek ? "important" : "planned";
    const prefix = psLabel(entry.id);
    const result = entry.result
      ? { won: entry.result.winnerId === protagonistTeamId, score: `${entry.result.homeScore}:${entry.result.awayScore}` }
      : null;
    return {
      id: entry.id, date, type: "game",
      title: `${prefix ? prefix + " " : ""}W${entry.week} vs ${opponent}`,
      time: "13:00", location: isHome ? "홈" : "원정", status,
      meta: { result },
    };
  });

  // 2. 훈련/휴식 항목 (경기 없는 주)
  $: gameWeeks = new Set(seasonEntries.filter(e => e.isProtagonistGame).map(e => e.week));
  $: trainItems = hasSeasonSchedule ? allWeeks
    .filter(w => !gameWeeks.has(w))
    .map((w): ScheduleItem => {
      const phase = weekPhase(w);
      const isRest = phase === "offseason";
      return {
        id: `TRN_W${w}`,
        date: weekToDateKey(w, seasonYear, 3), // 수요일
        type: isRest ? "rest" : "training",
        title: isRest ? "비시즌" : (PHASE_TRAIN_LABEL[phase] ?? "주간 훈련"),
        time: "09:00",
        location: isRest ? "–" : "훈련장",
        status: w < currentWeek ? "done" : "planned",
        meta: isRest ? undefined : { programs: trainingPrograms },
      };
    }) : [];

  // 3. 이벤트 항목 (upcoming 텍스트 → 현재 주 날짜에 배치)
  const DAY_OFFSETS: Record<string, number> = {
    "월요일": 0, "화요일": 1, "수요일": 2, "목요일": 3, "금요일": 4, "토요일": 5, "일요일": 6,
    "월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6,
  };
  $: eventItems = (() => {
    const upcoming = $gameStore.upcoming ?? [];
    if (!upcoming.length) return [] as ScheduleItem[];
    return upcoming.slice(0, 5).map((text, i): ScheduleItem => {
      let dayOffset = i % 5; // 기본: 월~금 순서
      for (const [key, off] of Object.entries(DAY_OFFSETS)) {
        if (text.startsWith(key)) { dayOffset = off; break; }
      }
      return {
        id: `EVT_${i}`,
        date: weekToDateKey(currentWeek, seasonYear, dayOffset),
        type: "event", title: text, time: "10:00", location: "", status: "important",
      };
    });
  })();

  // 4. 통합 스케줄
  $: schedules = [...gameItems, ...trainItems, ...eventItems];
  $: visibleSchedules = filter === "all" ? schedules : schedules.filter(s => s.type === filter);

  // ── 캘린더 계산 ───────────────────────────────────────────────
  $: monthCells = buildMonthCells(cursor);
  $: weekDates  = buildWeekDates(cursor);
  $: selectedItems = getSchedulesByDate(selectedDateKey);

  $: headerLabel =
    view === "year"  ? `${cursor.getFullYear()} 시즌 일정` :
    view === "month" ? `${cursor.getFullYear()}년 ${monthLabel[cursor.getMonth()]}` :
    view === "week"  ? `${formatDate(weekDates[0])} – ${formatDate(weekDates[6])}` : "";

  function buildWeekDates(base: Date): Date[] {
    const start = startOfWeek(base);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  function buildMonthCells(base: Date): Array<{ date: Date; key: string; inMonth: boolean }> {
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return { date, key: toDateKey(date), inMonth: date.getMonth() === base.getMonth() };
    });
  }
  function getSchedulesByDate(dateKey: string): ScheduleItem[] {
    return visibleSchedules.filter(s => s.date === dateKey).sort((a, b) => a.time.localeCompare(b.time));
  }
  function getMonthSummary(monthIndex: number): Record<ScheduleType, number> {
    const year = cursor.getFullYear();
    const summary = { game: 0, training: 0, event: 0, rest: 0 };
    visibleSchedules.forEach(s => {
      const d = fromDateKey(s.date);
      if (d.getFullYear() === year && d.getMonth() === monthIndex) summary[s.type]++;
    });
    return summary;
  }

  function navigate(direction: "prev" | "next") {
    const delta = direction === "next" ? 1 : -1;
    const next = new Date(cursor);
    if      (view === "year")  next.setFullYear(next.getFullYear() + delta);
    else if (view === "month") next.setMonth(next.getMonth() + delta);
    else                       next.setDate(next.getDate() + delta * 7);
    cursor = next;
  }
  function goToday() { cursor = new Date(todayDate); selectedDateKey = toDateKey(todayDate); }
  function selectDate(dateKey: string) { selectedDateKey = dateKey; }
  function jumpToMonth(monthIndex: number) { cursor = new Date(cursor.getFullYear(), monthIndex, 1); view = "month"; }
  function formatDate(date: Date): string { return `${date.getMonth() + 1}/${date.getDate()}`; }

  // ── 시즌 뷰 ──────────────────────────────────────────────────
  $: gameByWeek = new Map(seasonEntries.filter(e => e.isProtagonistGame).map(e => [e.week, e]));
  $: sortedStandings = [...$seasonStore.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

  // 주간 뷰 표시 상한 (이 수 초과 시 "+N 더" 표시)
  const WEEK_ITEM_LIMIT = 4;
</script>

<section class="page">
  <h2>{$t("page.schedule")}</h2>

  <article class="card board">

    <!-- ── 상단: 뷰 탭 + 네비게이션 ── -->
    <header class="top-row">
      <div class="tabs">
        <button class:active={view === "season"} on:click={() => (view = "season")}>시즌</button>
        <button class:active={view === "year"}   on:click={() => (view = "year")}>연간</button>
        <button class:active={view === "month"}  on:click={() => (view = "month")}>월간</button>
        <button class:active={view === "week"}   on:click={() => (view = "week")}>주간</button>
      </div>
      {#if view !== "season"}
        <div class="nav-tools">
          <button on:click={() => navigate("prev")}>‹</button>
          <p class="nav-label">{headerLabel}</p>
          <button on:click={() => navigate("next")}>›</button>
          <button class="today" on:click={goToday}>오늘</button>
        </div>
      {/if}
    </header>

    <!-- ── 필터 ── -->
    <div class="filters">
      <button class:active={filter === "all"}      on:click={() => (filter = "all")}>전체</button>
      <button class:active={filter === "game"}     on:click={() => (filter = "game")}>경기</button>
      <button class:active={filter === "training"} on:click={() => (filter = "training")}>훈련</button>
      <button class:active={filter === "event"}    on:click={() => (filter = "event")}>이벤트</button>
      <button class:active={filter === "rest"}     on:click={() => (filter = "rest")}>휴식</button>
      <span class="filter-count">{visibleSchedules.length}건</span>
    </div>

    <!-- ── 콘텐츠 ── -->
    <div class="content">

      <!-- 시즌 뷰 -->
      {#if view === "season"}
        <section class="season-view">
          {#if $seasonStore.totalWeeks === 0}
            <p class="no-season">시즌 일정이 설정되지 않았습니다.</p>
          {:else}
            <div class="season-layout">
              <div class="week-timeline" use:dragScroll>
                {#each allWeeks as week}
                  {@const phase = weekPhase(week)}
                  {@const game  = gameByWeek.get(week) ?? null}
                  {@const isCurrent = week === currentWeek}
                  {@const isPast    = week < currentWeek}
                  {@const isPostgame = game ? psLabel(game.id) !== "" : false}
                  <div class="week-row"
                    class:current={isCurrent}
                    class:past={isPast}
                    class:postseason-game={isPostgame}
                    on:click={() => { view = "week"; cursor = new Date(seasonYear, 2, 1); cursor.setDate(cursor.getDate() + (week - 1) * 7); }}
                  >
                    <span class="week-num">W{week}</span>
                    <span class="phase-tag"
                      class:pre={phase === "preseason"}  class:reg={phase === "season"}
                      class:post={phase === "postseason"} class:off={phase === "offseason"}>
                      {PHASE_LABEL[phase]}
                    </span>
                    {#if game}
                      {@const isHome = game.homeTeamId === protagonistTeamId}
                      {@const opp    = teamLabel(isHome ? game.awayTeamId : game.homeTeamId)}
                      {@const done   = !!game.result}
                      {@const psl    = psLabel(game.id)}
                      <span class="game-loc">{isHome ? "홈" : "원정"}</span>
                      <span class="opponent">{psl ? psl + " " : ""}vs {opp}</span>
                      <span class="status"
                        class:win ={done && game.result?.winnerId === protagonistTeamId}
                        class:lose={done && game.result?.winnerId !== protagonistTeamId}>
                        {gameStatusLabel(game)}
                      </span>
                    {:else}
                      <span class="no-game">{PHASE_TRAIN_LABEL[phase] ?? "–"}</span>
                      <span></span><span></span>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="standings-panel">
                <h4>팀 순위</h4>
                {#if sortedStandings.length === 0}
                  <p class="no-standings">순위 데이터 없음</p>
                {:else}
                  <div class="standings-scroll">
                    <table class="standings-table">
                      <thead>
                        <tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>승률</th></tr>
                      </thead>
                      <tbody>
                        {#each sortedStandings as s, i}
                          <tr class:my-team={s.teamId === protagonistTeamId}>
                            <td>{i + 1}</td>
                            <td class="team-name">{teamLabel(s.teamId)}</td>
                            <td>{s.wins}</td>
                            <td>{s.losses}</td>
                            <td>{s.winPct.toFixed(2)}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </section>

      <!-- 연간 뷰 -->
      {:else if view === "year"}
        <section class="year-grid">
          {#each monthLabel as label, monthIndex}
            {@const summary = getMonthSummary(monthIndex)}
            <button class="month-card" on:click={() => jumpToMonth(monthIndex)}>
              <strong>{label}</strong>
              <p>총 {summary.game + summary.training + summary.event + summary.rest}건</p>
              <div class="chips">
                {#if summary.game > 0}     <span class="chip game">경기 {summary.game}</span>{/if}
                {#if summary.training > 0} <span class="chip training">훈련 {summary.training}</span>{/if}
                {#if summary.event > 0}    <span class="chip event">이벤트 {summary.event}</span>{/if}
                {#if summary.rest > 0}     <span class="chip rest">휴식 {summary.rest}</span>{/if}
              </div>
            </button>
          {/each}
        </section>

      <!-- 월간 뷰 -->
      {:else if view === "month"}
        <section class="month-view" use:swipeNav={navigate}>
          <div class="week-head">
            {#each weekLabel as day}<span>{day}</span>{/each}
          </div>
          <div class="month-grid">
            {#each monthCells as cell}
              {@const dayItems = getSchedulesByDate(cell.key)}
              <button
                class="day-cell"
                class:outside={!cell.inMonth}
                class:selected={selectedDateKey === cell.key}
                on:click={() => selectDate(cell.key)}
              >
                <span class="day-num">{cell.date.getDate()}</span>
                <div class="day-items">
                  {#each dayItems.slice(0, 2) as item}
                    <p class={item.type}>{item.title}</p>
                  {/each}
                  {#if dayItems.length > 2}
                    <p class="more">+{dayItems.length - 2}</p>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </section>

      <!-- 주간 뷰 -->
      {:else}
        <section class="week-list" use:swipeNav={navigate}>
          {#each weekDates as date, index}
            {@const dateKey  = toDateKey(date)}
            {@const dayItems = getSchedulesByDate(dateKey)}
            {@const overflow = dayItems.length - WEEK_ITEM_LIMIT}
            <article class="week-day" class:selected={selectedDateKey === dateKey}>
              <button class="day-title" on:click={() => selectDate(dateKey)}>
                <strong>{weekLabel[index]}</strong>
                <span>{date.getMonth() + 1}/{date.getDate()}</span>
              </button>
              <ul>
                {#if dayItems.length === 0}
                  <li class="empty">없음</li>
                {:else}
                  {#each dayItems.slice(0, WEEK_ITEM_LIMIT) as item}
                    <li class={item.type}>
                      <p>{item.title}</p>
                    </li>
                  {/each}
                  {#if overflow > 0}
                    <li class="overflow-badge">+{overflow} 더</li>
                  {/if}
                {/if}
              </ul>
            </article>
          {/each}
        </section>
      {/if}
    </div>

    <!-- ── 선택 날짜 상세 ── -->
    <aside class="detail-box">
      <div class="detail-header">
        <h3>선택 날짜</h3>
        <span class="detail-date">{selectedDateKey}</span>
      </div>
      <ul class="detail-list">
        {#if selectedItems.length === 0}
          <li class="empty">등록된 일정이 없습니다.</li>
        {:else}
          {#each selectedItems as item}
            <li class="detail-item">
              <span class={`tag ${item.type}`}>{typeLabel[item.type]}</span>
              <div class="detail-body">
                <strong>{item.title}</strong>
                {#if item.type === "game" && item.meta?.result}
                  <span class="result-badge" class:win={item.meta.result.won} class:lose={!item.meta.result.won}>
                    {item.meta.result.won ? "승" : "패"} {item.meta.result.score}
                  </span>
                {/if}
                {#if item.type === "training" && item.meta?.programs?.length}
                  <p class="detail-sub">{item.meta.programs.join(" · ")}</p>
                {/if}
                <p class="detail-meta">{item.location ? item.location + " · " : ""}{item.time}</p>
              </div>
            </li>
          {/each}
        {/if}
      </ul>
    </aside>

  </article>
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  h2, h3, p { margin: 0; }
  h2 { font-size: 22px; }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  /* ── 보드 레이아웃: 상단/필터/콘텐츠/상세 ── */
  .board {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 8px;
  }

  /* ── 탭 + 네비 ── */
  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .tabs, .filters, .nav-tools {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .tabs button, .filters button, .nav-tools button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tabs button.active, .filters button.active {
    background: #3262b0;
    border-color: #6da1f7;
  }
  .nav-label {
    color: #dbe8ff;
    font-size: 12px;
    font-weight: 600;
    padding: 0 2px;
    white-space: nowrap;
  }
  .nav-tools .today {
    background: #295f84;
    border-color: #4da3df;
  }
  .filter-count {
    font-size: 11px;
    color: #5a7aaa;
    margin-left: 4px;
  }

  /* ── 콘텐츠 공통 ── */
  .content {
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  /* ── 연간 뷰 ── */
  .year-grid {
    height: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 6px;
    overflow: hidden;
  }
  .month-card {
    border: 1px solid #2f4b78;
    background: #162847;
    border-radius: 8px;
    padding: 8px 10px;
    text-align: left;
    color: #e4eeff;
    display: grid;
    gap: 4px;
    cursor: pointer;
    overflow: hidden;
  }
  .month-card:hover { background: #1d3357; }
  .month-card strong { font-size: 13px; }
  .month-card p { color: #9fb8df; font-size: 11px; }
  .chips { display: flex; gap: 3px; flex-wrap: wrap; }
  .chip {
    font-size: 10px;
    border: 1px solid #3d5f96;
    border-radius: 999px;
    padding: 1px 5px;
  }
  .chip.game     { background: #2b3f69; }
  .chip.training { background: #264f57; }
  .chip.event    { background: #5b4630; }
  .chip.rest     { background: #3a4456; }

  /* ── 월간 뷰 ── */
  .month-view {
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 4px;
    user-select: none;
  }
  .week-head {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }
  .week-head span {
    text-align: center;
    font-size: 11px;
    color: #a8bcde;
  }
  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-template-rows: repeat(6, minmax(0, 1fr));
    gap: 4px;
    overflow: hidden;
  }
  .day-cell {
    border: 1px solid #2a4068;
    border-radius: 6px;
    background: #13233f;
    color: #e2edff;
    padding: 4px;
    text-align: left;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    cursor: pointer;
    overflow: hidden;
  }
  .day-cell:hover { background: #182c4a; }
  .day-cell.selected { border-color: #7db1ff; background: #1a3156; }
  .day-cell.outside  { opacity: 0.35; }
  .day-num { font-size: 11px; color: #a0b8d8; }
  .day-items { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
  .day-items p {
    margin: 0;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 3px;
    padding: 1px 3px;
    line-height: 1.4;
  }
  .day-items .game     { background: #2f4d85; }
  .day-items .training { background: #2b6672; }
  .day-items .event    { background: #75603e; }
  .day-items .rest     { background: #44506b; }
  .day-items .more     { color: #8aa8cc; background: transparent; padding: 0; font-size: 9px; }

  /* ── 주간 뷰 ── */
  .week-list {
    height: 100%;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    user-select: none;
  }
  .week-day {
    border: 1px solid #2a4069;
    border-radius: 8px;
    background: #13243f;
    padding: 6px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 4px;
    min-height: 0;
    overflow: hidden;
  }
  .week-day.selected { border-color: #71a5f8; }
  .day-title {
    border: 0;
    background: transparent;
    color: #e8f0ff;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0;
    cursor: pointer;
    font-size: 12px;
  }
  .day-title strong { font-size: 13px; }
  .day-title span   { font-size: 11px; color: #9fb6db; }
  .week-day ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .week-day li {
    border-radius: 5px;
    padding: 3px 5px;
    border: 1px solid transparent;
    font-size: 11px;
    flex-shrink: 0;
  }
  .week-day li p { margin: 0; color: #e4edff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .week-day li.game     { border-color: #4f78be; background: #264277; }
  .week-day li.training { border-color: #3e8b93; background: #1f525c; }
  .week-day li.event    { border-color: #9b7a48; background: #5e4a30; }
  .week-day li.rest     { border-color: #606d87; background: #3b4559; }
  .week-day li.empty    { color: #5a7aa8; font-size: 11px; border: none; background: none; }
  .overflow-badge {
    color: #7a9cc8;
    font-size: 10px;
    padding: 2px 4px;
    background: #1a2a40;
    border-radius: 4px;
    text-align: center;
    flex-shrink: 0;
  }

  /* ── 시즌 뷰 ── */
  .season-view {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .no-season { color: #8aa2ca; font-size: 14px; padding: 16px 0; }
  .season-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px;
    gap: 10px;
    height: 100%;
    min-height: 0;
  }
  .week-timeline {
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow-y: auto;
    padding-right: 4px;
    cursor: grab;
    scroll-behavior: smooth;
  }
  .week-timeline:active { cursor: grabbing; }
  .week-row {
    display: grid;
    grid-template-columns: 40px 86px 40px minmax(0, 1fr) 68px;
    align-items: center;
    gap: 6px;
    border: 1px solid #2a4068;
    border-radius: 6px;
    background: #13243f;
    padding: 5px 8px;
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.1s;
  }
  .week-row:hover    { background: #182c4a; }
  .week-row.current  { border-color: #6da1f7; background: #1a3156; }
  .week-row.past     { opacity: 0.5; }
  .week-row.postseason-game { border-color: #c9960f; background: #2a1e08; }
  .week-row.postseason-game.current { border-color: #f5d050; background: #3a2a0a; }
  .week-num { color: #9fb6db; font-weight: 600; font-size: 10px; }
  .phase-tag {
    font-size: 9px;
    border-radius: 999px;
    padding: 1px 6px;
    text-align: center;
    border: 1px solid;
  }
  .phase-tag.pre  { border-color: #5b7ac8; color: #b8d0f7; background: #1e3560; }
  .phase-tag.reg  { border-color: #4c8c5e; color: #a8e8c0; background: #163828; }
  .phase-tag.post { border-color: #8a6530; color: #ffd8a0; background: #3a2810; }
  .phase-tag.off  { border-color: #5c6880; color: #c0ccdf; background: #2a3245; }
  .game-loc {
    font-size: 9px;
    border: 1px solid #3d5f96;
    border-radius: 999px;
    padding: 1px 5px;
    text-align: center;
    color: #b8d0f7;
  }
  .opponent {
    color: #e4edff;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .no-game { color: #607898; grid-column: span 3; font-size: 10px; }
  .status { text-align: right; font-size: 11px; color: #a8bfdf; }
  .status.win  { color: #68de92; font-weight: 700; }
  .status.lose { color: #ff8a8a; font-weight: 700; }

  /* 순위표 */
  .standings-panel {
    border: 1px solid #2d3a5a;
    border-radius: 8px;
    background: #111d34;
    padding: 8px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
    min-height: 0;
    overflow: hidden;
  }
  .standings-panel h4 { margin: 0; font-size: 12px; color: #c8d8f0; }
  .no-standings { color: #607898; font-size: 11px; }
  .standings-scroll { overflow-y: auto; height: 100%; }
  .standings-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .standings-table thead th {
    color: #8aa4cc;
    padding: 3px;
    text-align: center;
    border-bottom: 1px solid #2a3f60;
    position: sticky;
    top: 0;
    background: #111d34;
    font-size: 10px;
  }
  .standings-table tbody td {
    padding: 4px 3px;
    text-align: center;
    color: #c0d4ef;
    border-bottom: 1px solid #1e2e48;
  }
  .standings-table .team-name {
    text-align: left;
    max-width: 70px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .standings-table tr.my-team td { color: #f0e060; font-weight: 600; }

  /* ── 상세 박스 ── */
  .detail-box {
    border: 1px solid #2d456f;
    border-radius: 8px;
    background: #13223d;
    padding: 8px 10px;
    max-height: 140px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 4px;
    min-height: 0;
  }
  .detail-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .detail-header h3 { font-size: 12px; color: #c8d8f0; }
  .detail-date { font-size: 11px; color: #6a8fc4; }
  .detail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    min-height: 0;
  }
  .detail-item {
    border: 1px solid #2f4a76;
    border-radius: 6px;
    padding: 5px 8px;
    display: flex;
    align-items: flex-start;
    gap: 7px;
    flex-shrink: 0;
  }
  .detail-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .detail-body strong { font-size: 12px; color: #ebf3ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail-sub  { font-size: 11px; color: #7abecc; margin: 0; }
  .detail-meta { font-size: 10px; color: #8aa4c8; margin: 0; }
  .tag {
    flex-shrink: 0;
    border-radius: 999px;
    padding: 1px 6px;
    font-size: 10px;
    border: 1px solid;
  }
  .tag.game     { border-color: #628dd8; color: #cfe1ff; }
  .tag.training { border-color: #5cb0ba; color: #d4f5fa; }
  .tag.event    { border-color: #b9985f; color: #ffeccc; }
  .tag.rest     { border-color: #8b98b4; color: #dde3f1; }
  .result-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    padding: 0 4px;
    border-radius: 4px;
  }
  .result-badge.win  { color: #68de92; }
  .result-badge.lose { color: #ff8a8a; }
  li.empty { color: #607898; font-size: 11px; padding: 2px 0; list-style: none; }

  /* ── 반응형 ── */
  @media (max-width: 1280px) {
    .year-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(4, minmax(0, 1fr)); }
    .week-list { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 1024px) {
    .year-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); }
    .week-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
