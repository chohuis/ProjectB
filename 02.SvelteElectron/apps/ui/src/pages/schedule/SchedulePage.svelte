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
  };

  const typeLabel: Record<ScheduleType, string> = {
    game: "경기",
    training: "훈련",
    event: "이벤트",
    rest: "휴식"
  };

  const monthLabel = [
    "1월",
    "2월",
    "3월",
    "4월",
    "5월",
    "6월",
    "7월",
    "8월",
    "9월",
    "10월",
    "11월",
    "12월"
  ];

  const weekLabel = ["월", "화", "수", "목", "금", "토", "일"];

  const today = new Date(2026, 3, 21);
  let view: CalendarView = "month";
  let filter: "all" | ScheduleType = "all";
  let cursor = new Date(today);
  let selectedDateKey = toDateKey(today);

  $: schedules = seasonEntries.map((entry): ScheduleItem => {
    const seasonYear = $seasonStore.seasonYear || 2026;
    const baseDate = new Date(seasonYear, 2, 1); // 3월 1주차 기준
    baseDate.setDate(baseDate.getDate() + (entry.week - 1) * 7);
    const date = toDateKey(baseDate);
    const isHome = entry.homeTeamId === protagonistTeamId;
    const opponent = teamLabel(isHome ? entry.awayTeamId : entry.homeTeamId);
    const status: ScheduleItem["status"] = entry.result
      ? "done"
      : entry.week >= $seasonStore.currentWeek
        ? "important"
        : "planned";
    return {
      id: entry.id,
      date,
      type: "game",
      title: `W${entry.week} vs ${opponent}`,
      time: "13:00",
      location: isHome ? "홈" : "원정",
      status,
    };
  });

  $: visibleSchedules =
    filter === "all" ? schedules : schedules.filter((item) => item.type === filter);

  $: monthCells = buildMonthCells(cursor);
  $: weekDates = buildWeekDates(cursor);
  $: selectedItems = getSchedulesByDate(selectedDateKey);

  $: headerLabel =
    view === "year"
      ? `${cursor.getFullYear()} 시즌 일정`
      : view === "month"
        ? `${cursor.getFullYear()}년 ${monthLabel[cursor.getMonth()]}`
        : `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`;

  function toDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function fromDateKey(dateKey: string): Date {
    const [y, m, d] = dateKey.split("-").map((v) => Number(v));
    return new Date(y, m - 1, d);
  }

  function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function startOfWeek(date: Date): Date {
    const day = date.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), offset);
  }

  function buildWeekDates(base: Date): Date[] {
    const start = startOfWeek(base);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  function buildMonthCells(base: Date): Array<{ date: Date; key: string; inMonth: boolean }> {
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = startOfWeek(first);

    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return {
        date,
        key: toDateKey(date),
        inMonth: date.getMonth() === base.getMonth()
      };
    });
  }

  function getSchedulesByDate(dateKey: string): ScheduleItem[] {
    return visibleSchedules
      .filter((item) => item.date === dateKey)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  function getMonthSummary(monthIndex: number): Record<ScheduleType, number> {
    const year = cursor.getFullYear();
    const summary: Record<ScheduleType, number> = {
      game: 0,
      training: 0,
      event: 0,
      rest: 0
    };

    visibleSchedules.forEach((item) => {
      const date = fromDateKey(item.date);
      if (date.getFullYear() === year && date.getMonth() === monthIndex) {
        summary[item.type] += 1;
      }
    });

    return summary;
  }

  function navigate(direction: "prev" | "next") {
    const delta = direction === "next" ? 1 : -1;
    const next = new Date(cursor);

    if (view === "year") {
      next.setFullYear(next.getFullYear() + delta);
    } else if (view === "month") {
      next.setMonth(next.getMonth() + delta);
    } else {
      next.setDate(next.getDate() + delta * 7);
    }

    cursor = next;
  }

  function goToday() {
    cursor = new Date(today);
    selectedDateKey = toDateKey(today);
  }

  function selectDate(dateKey: string) {
    selectedDateKey = dateKey;
  }

  function jumpToMonth(monthIndex: number) {
    cursor = new Date(cursor.getFullYear(), monthIndex, 1);
    view = "month";
  }

  function formatDate(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  // 시즌 일정: seasonStore에서 주인공 팀 경기 목록
  $: protagonistTeamId = $gameStore.protagonist.teamId;
  $: seasonEntries = $seasonStore.schedule;
  $: hasSeasonSchedule = seasonEntries.length > 0;

  // 팀 이름 표시 (masterStore에 팀 정보가 없으면 ID 그대로)
  function teamLabel(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  function gameStatusLabel(entry: (typeof seasonEntries)[0]): string {
    if (!entry.result) {
      return entry.week > $seasonStore.currentWeek ? "예정" : "진행 중";
    }
    const r = entry.result;
    const won = r.winnerId === protagonistTeamId;
    return `${won ? "승" : "패"} ${r.homeScore}:${r.awayScore}`;
  }

  // 52주 전체 타임라인
  const SEASON_START = 5;
  const SEASON_END   = 36;
  const POST_END     = 44;

  const PHASE_LABEL: Record<string, string> = {
    preseason: "프리시즌",
    season: "정규시즌",
    postseason: "포스트시즌",
    offseason: "비시즌",
  };
  const NO_GAME_LABEL: Record<string, string> = {
    preseason: "스프링 캠프",
    season: "훈련",
    postseason: "마무리 훈련",
    offseason: "비시즌 훈련",
  };

  function weekPhase(week: number): string {
    if (week < SEASON_START) return "preseason";
    if (week <= SEASON_END)  return "season";
    if (week <= POST_END)    return "postseason";
    return "offseason";
  }

  $: totalWeeks = $seasonStore.totalWeeks > 0 ? $seasonStore.totalWeeks : 52;
  $: allWeeks   = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  $: gameByWeek = new Map(
    seasonEntries
      .filter((e) => e.isProtagonistGame)
      .map((e) => [e.week, e]),
  );
  $: sortedStandings = [...$seasonStore.standings].sort(
    (a, b) => b.winPct - a.winPct || b.wins - a.wins,
  );
</script>

<section class="page">
  <h2>{$t("page.schedule")}</h2>

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={view === "season"} on:click={() => (view = "season")}>시즌</button>
        <button class:active={view === "year"} on:click={() => (view = "year")}>연간</button>
        <button class:active={view === "month"} on:click={() => (view = "month")}>월간</button>
        <button class:active={view === "week"} on:click={() => (view = "week")}>주간</button>
      </div>

      <div class="nav-tools">
        <button on:click={() => navigate("prev")}>이전</button>
        <p>{headerLabel}</p>
        <button on:click={() => navigate("next")}>다음</button>
        <button class="today" on:click={goToday}>오늘</button>
      </div>
    </header>

    <div class="filters">
      <button class:active={filter === "all"} on:click={() => (filter = "all")}>전체</button>
      <button class:active={filter === "game"} on:click={() => (filter = "game")}>경기</button>
      <button class:active={filter === "training"} on:click={() => (filter = "training")}>훈련</button>
      <button class:active={filter === "event"} on:click={() => (filter = "event")}>이벤트</button>
      <button class:active={filter === "rest"} on:click={() => (filter = "rest")}>휴식</button>
    </div>

    <div class="content">
      {#if view === "season"}
        <section class="season-view">
          {#if $seasonStore.totalWeeks === 0}
            <p class="no-season">시즌 일정이 설정되지 않았습니다.</p>
          {:else}
            <div class="season-layout">
              <div class="week-timeline">
                {#each allWeeks as week}
                  {@const phase = weekPhase(week)}
                  {@const game = gameByWeek.get(week) ?? null}
                  {@const isCurrent = week === $seasonStore.currentWeek}
                  {@const isPast = week < $seasonStore.currentWeek}
                  <div class="week-row" class:current={isCurrent} class:past={isPast}>
                    <span class="week-num">W{week}</span>
                    <span class="phase-tag" class:pre={phase === "preseason"} class:reg={phase === "season"} class:post={phase === "postseason"} class:off={phase === "offseason"}>
                      {PHASE_LABEL[phase]}
                    </span>
                    {#if game}
                      {@const isHome = game.homeTeamId === protagonistTeamId}
                      {@const opp = teamLabel(isHome ? game.awayTeamId : game.homeTeamId)}
                      {@const done = !!game.result}
                      <span class="game-loc">{isHome ? "홈" : "원정"}</span>
                      <span class="opponent">vs {opp}</span>
                      <span class="status" class:win={done && game.result?.winnerId === protagonistTeamId} class:lose={done && game.result?.winnerId !== protagonistTeamId}>
                        {gameStatusLabel(game)}
                      </span>
                    {:else}
                      <span class="no-game" colspan="3">{NO_GAME_LABEL[phase]}</span>
                      <span></span>
                      <span></span>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="standings-panel">
                <h4>팀 순위</h4>
                {#if sortedStandings.length === 0}
                  <p class="no-standings">순위 데이터 없음</p>
                {:else}
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
                          <td>{s.winPct.toFixed(3)}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {/if}
              </div>
            </div>
          {/if}
        </section>
      {:else if view === "year"}
        <section class="year-grid">
          {#each monthLabel as label, monthIndex}
            {@const summary = getMonthSummary(monthIndex)}
            <button class="month-card" on:click={() => jumpToMonth(monthIndex)}>
              <strong>{label}</strong>
              <p>총 {summary.game + summary.training + summary.event + summary.rest}건</p>
              <div class="chips">
                <span class="game">경기 {summary.game}</span>
                <span class="training">훈련 {summary.training}</span>
                <span class="event">이벤트 {summary.event}</span>
              </div>
            </button>
          {/each}
        </section>
      {:else if view === "month"}
        <section class="month-view">
          <div class="week-head">
            {#each weekLabel as day}
              <span>{day}</span>
            {/each}
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
      {:else}
        <section class="week-list">
          {#each weekDates as date, index}
            {@const dateKey = toDateKey(date)}
            {@const dayItems = getSchedulesByDate(dateKey)}
            <article class="week-day" class:selected={selectedDateKey === dateKey}>
              <button class="day-title" on:click={() => selectDate(dateKey)}>
                <strong>{weekLabel[index]}</strong>
                <span>{date.getMonth() + 1}/{date.getDate()}</span>
              </button>
              <ul>
                {#if dayItems.length === 0}
                  <li class="empty">일정 없음</li>
                {:else}
                  {#each dayItems as item}
                    <li class={item.type}>
                      <span>{item.time}</span>
                      <p>{item.title}</p>
                    </li>
                  {/each}
                {/if}
              </ul>
            </article>
          {/each}
        </section>
      {/if}
    </div>

    <aside class="detail-box">
      <h3>선택 날짜 일정</h3>
      <p class="selected-date">{selectedDateKey}</p>
      <ul>
        {#if selectedItems.length === 0}
          <li class="empty">등록된 일정이 없습니다.</li>
        {:else}
          {#each selectedItems as item}
            <li>
              <span class={`tag ${item.type}`}>{typeLabel[item.type]}</span>
              <strong>{item.title}</strong>
              <p>{item.time} · {item.location}</p>
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

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 22px;
  }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .board {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 10px;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .tabs,
  .filters,
  .nav-tools {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tabs button,
  .filters button,
  .nav-tools button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .tabs button.active,
  .filters button.active {
    background: #3262b0;
    border-color: #6da1f7;
  }

  .nav-tools p {
    color: #dbe8ff;
    font-size: 13px;
    font-weight: 600;
    padding: 0 4px;
  }

  .nav-tools .today {
    background: #295f84;
    border-color: #4da3df;
  }

  .content {
    min-height: 0;
    overflow: hidden;
  }

  .year-grid {
    height: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .month-card {
    border: 1px solid #2f4b78;
    background: #162847;
    border-radius: 10px;
    padding: 10px;
    text-align: left;
    color: #e4eeff;
    display: grid;
    gap: 6px;
    cursor: pointer;
  }

  .month-card strong {
    font-size: 14px;
  }

  .month-card p {
    color: #9fb8df;
    font-size: 12px;
  }

  .chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .chips span {
    font-size: 11px;
    border: 1px solid #3d5f96;
    border-radius: 999px;
    padding: 2px 7px;
  }

  .chips .game {
    background: #2b3f69;
  }

  .chips .training {
    background: #264f57;
  }

  .chips .event {
    background: #5b4630;
  }

  .month-view {
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
  }

  .week-head {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }

  .week-head span {
    text-align: center;
    font-size: 12px;
    color: #a8bcde;
  }

  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    min-height: 0;
  }

  .day-cell {
    border: 1px solid #2a4068;
    border-radius: 8px;
    background: #13233f;
    color: #e2edff;
    padding: 6px;
    text-align: left;
    min-height: 70px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    cursor: pointer;
  }

  .day-cell.selected {
    border-color: #7db1ff;
    background: #1a3156;
  }

  .day-cell.outside {
    opacity: 0.45;
  }

  .day-num {
    font-size: 12px;
  }

  .day-items {
    display: grid;
    align-content: start;
    gap: 2px;
  }

  .day-items p {
    margin: 0;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 5px;
    padding: 1px 4px;
  }

  .day-items .game {
    background: #2f4d85;
  }

  .day-items .training {
    background: #2b6672;
  }

  .day-items .event {
    background: #75603e;
  }

  .day-items .rest {
    background: #44506b;
  }

  .day-items .more {
    color: #b7c8e9;
    background: transparent;
    padding: 0;
  }

  .week-list {
    height: 100%;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
  }

  .week-day {
    border: 1px solid #2a4069;
    border-radius: 8px;
    background: #13243f;
    padding: 7px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
    min-height: 0;
  }

  .week-day.selected {
    border-color: #71a5f8;
  }

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
  }

  .day-title span {
    font-size: 12px;
    color: #9fb6db;
  }

  .week-day ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 4px;
    align-content: start;
    min-height: 0;
    overflow: hidden;
  }

  .week-day li {
    border-radius: 6px;
    padding: 4px 6px;
    display: grid;
    gap: 2px;
    border: 1px solid transparent;
  }

  .week-day li span {
    font-size: 11px;
    color: #b9cae8;
  }

  .week-day li p {
    font-size: 12px;
    color: #e4edff;
  }

  .week-day li.game {
    border-color: #4f78be;
    background: #264277;
  }

  .week-day li.training {
    border-color: #3e8b93;
    background: #1f525c;
  }

  .week-day li.event {
    border-color: #9b7a48;
    background: #5e4a30;
  }

  .week-day li.rest {
    border-color: #606d87;
    background: #3b4559;
  }

  .empty {
    color: #9db2d8;
    font-size: 12px;
    padding: 4px 0;
  }

  .season-view {
    height: 100%;
    overflow: hidden;
  }

  .no-season {
    color: #8aa2ca;
    font-size: 14px;
    padding: 16px 0;
  }

  /* 시즌 뷰: 타임라인 + 순위표 */
  .season-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 10px;
    height: 100%;
    min-height: 0;
  }

  .week-timeline {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .week-row {
    display: grid;
    grid-template-columns: 44px 90px 44px minmax(0, 1fr) 70px;
    align-items: center;
    gap: 8px;
    border: 1px solid #2a4068;
    border-radius: 7px;
    background: #13243f;
    padding: 6px 10px;
    font-size: 12px;
  }

  .week-row.current {
    border-color: #6da1f7;
    background: #1a3156;
  }

  .week-row.past {
    opacity: 0.55;
  }

  .week-num {
    color: #9fb6db;
    font-weight: 600;
    font-size: 11px;
  }

  .phase-tag {
    font-size: 10px;
    border-radius: 999px;
    padding: 2px 7px;
    text-align: center;
    border: 1px solid;
  }

  .phase-tag.pre  { border-color: #5b7ac8; color: #b8d0f7; background: #1e3560; }
  .phase-tag.reg  { border-color: #4c8c5e; color: #a8e8c0; background: #163828; }
  .phase-tag.post { border-color: #8a6530; color: #ffd8a0; background: #3a2810; }
  .phase-tag.off  { border-color: #5c6880; color: #c0ccdf; background: #2a3245; }

  .game-loc {
    font-size: 10px;
    border: 1px solid #3d5f96;
    border-radius: 999px;
    padding: 2px 6px;
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

  .no-game {
    color: #607898;
    font-size: 11px;
    grid-column: span 3;
  }

  .status {
    text-align: right;
    font-size: 12px;
    color: #a8bfdf;
  }

  .status.win  { color: #68de92; font-weight: 700; }
  .status.lose { color: #ff8a8a; font-weight: 700; }

  /* 순위표 */
  .standings-panel {
    border: 1px solid #2d3a5a;
    border-radius: 10px;
    background: #111d34;
    padding: 10px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    min-height: 0;
    overflow: hidden;
  }

  .standings-panel h4 {
    margin: 0;
    font-size: 13px;
    color: #c8d8f0;
  }

  .no-standings {
    color: #607898;
    font-size: 12px;
  }

  .standings-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    overflow-y: auto;
    display: block;
  }

  .standings-table thead th {
    color: #8aa4cc;
    padding: 4px 4px;
    text-align: center;
    border-bottom: 1px solid #2a3f60;
    position: sticky;
    top: 0;
    background: #111d34;
  }

  .standings-table tbody td {
    padding: 5px 4px;
    text-align: center;
    color: #c0d4ef;
    border-bottom: 1px solid #1e2e48;
  }

  .standings-table .team-name {
    text-align: left;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .standings-table tr.my-team td {
    color: #f0e060;
    font-weight: 600;
  }

  .week-badge {
    font-size: 11px;
    color: #9fb6db;
    font-weight: 600;
  }

  .detail-box {
    border: 1px solid #2d456f;
    border-radius: 10px;
    background: #13223d;
    padding: 10px;
  }

  .detail-box h3 {
    font-size: 14px;
  }

  .selected-date {
    margin-top: 2px;
    font-size: 12px;
    color: #a8bfdf;
  }

  .detail-box ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .detail-box li {
    border: 1px solid #2f4a76;
    border-radius: 8px;
    padding: 6px 8px;
    display: grid;
    gap: 2px;
  }

  .detail-box li strong {
    font-size: 13px;
    color: #ebf3ff;
  }

  .detail-box li p {
    font-size: 12px;
    color: #b5c9e9;
  }

  .tag {
    width: fit-content;
    border-radius: 999px;
    padding: 1px 7px;
    font-size: 11px;
    border: 1px solid;
  }

  .tag.game {
    border-color: #628dd8;
    color: #cfe1ff;
  }

  .tag.training {
    border-color: #5cb0ba;
    color: #d4f5fa;
  }

  .tag.event {
    border-color: #b9985f;
    color: #ffeccc;
  }

  .tag.rest {
    border-color: #8b98b4;
    color: #dde3f1;
  }

  @media (max-width: 1280px) {
    .year-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .week-list {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (max-width: 1024px) {
    .year-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .week-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>

