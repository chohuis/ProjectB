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

  const schedules: ScheduleItem[] = [
    { id: "s1", date: "2026-04-01", type: "training", title: "웨이트 + 코어", time: "07:30", location: "실내 훈련장", status: "done" },
    { id: "s2", date: "2026-04-02", type: "training", title: "불펜 35구", time: "10:00", location: "불펜", status: "done" },
    { id: "s3", date: "2026-04-03", type: "event", title: "코치 면담", time: "16:00", location: "코치실", status: "done" },
    { id: "s4", date: "2026-04-04", type: "game", title: "주말 리그 1차전", time: "13:00", location: "부산 마린 구장", status: "important" },
    { id: "s5", date: "2026-04-05", type: "game", title: "주말 리그 2차전", time: "13:00", location: "부산 마린 구장", status: "planned" },
    { id: "s6", date: "2026-04-07", type: "training", title: "수비 전환 훈련", time: "09:00", location: "메인 그라운드", status: "planned" },
    { id: "s7", date: "2026-04-09", type: "rest", title: "회복/휴식", time: "전일", location: "팀 숙소", status: "planned" },
    { id: "s8", date: "2026-04-10", type: "training", title: "라이브 피칭", time: "11:00", location: "메인 그라운드", status: "planned" },
    { id: "s9", date: "2026-04-11", type: "game", title: "청백전", time: "14:00", location: "팀 구장", status: "planned" },
    { id: "s10", date: "2026-04-14", type: "event", title: "학교 시험 주간 시작", time: "09:00", location: "교실", status: "important" },
    { id: "s11", date: "2026-04-16", type: "training", title: "포심/슬라이더 정밀 세션", time: "10:30", location: "불펜", status: "planned" },
    { id: "s12", date: "2026-04-18", type: "game", title: "주말 리그 3차전", time: "13:00", location: "서울 이노베이션 구장", status: "important" },
    { id: "s13", date: "2026-04-19", type: "game", title: "주말 리그 4차전", time: "13:00", location: "서울 이노베이션 구장", status: "planned" },
    { id: "s14", date: "2026-04-20", type: "rest", title: "휴식", time: "전일", location: "팀 숙소", status: "planned" },
    { id: "s15", date: "2026-04-21", type: "training", title: "불펜 + 주자 견제", time: "10:00", location: "불펜", status: "important" },
    { id: "s16", date: "2026-04-22", type: "event", title: "스카우트 참관", time: "15:00", location: "메인 그라운드", status: "important" },
    { id: "s17", date: "2026-04-24", type: "training", title: "전술 회의", time: "17:00", location: "전력분석실", status: "planned" },
    { id: "s18", date: "2026-04-25", type: "game", title: "주말 리그 5차전", time: "13:00", location: "인천 스카이 구장", status: "planned" },
    { id: "s19", date: "2026-04-26", type: "game", title: "주말 리그 6차전", time: "13:00", location: "인천 스카이 구장", status: "planned" },
    { id: "s20", date: "2026-05-01", type: "event", title: "월간 평가 리포트", time: "18:00", location: "감독실", status: "planned" }
  ];

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
          {#if !hasSeasonSchedule}
            <p class="no-season">시즌 일정이 설정되지 않았습니다.</p>
          {:else}
            <ul class="season-list">
              {#each seasonEntries.filter((e) => e.isProtagonistGame) as entry}
                {@const isHome = entry.homeTeamId === protagonistTeamId}
                {@const opponent = isHome ? entry.awayTeamId : entry.homeTeamId}
                {@const status = gameStatusLabel(entry)}
                {@const done = !!entry.result}
                <li class:done class:current={entry.week === $seasonStore.currentWeek}>
                  <span class="week-badge">W{entry.week}</span>
                  <span class="vs-label">{isHome ? "홈" : "원정"}</span>
                  <span class="opponent">vs {teamLabel(opponent)}</span>
                  <span class="status" class:win={done && entry.result?.winnerId === protagonistTeamId}
                        class:lose={done && entry.result?.winnerId !== protagonistTeamId}>
                    {status}
                  </span>
                </li>
              {/each}
            </ul>
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
    overflow-y: auto;
  }

  .no-season {
    color: #8aa2ca;
    font-size: 14px;
    padding: 16px 0;
  }

  .season-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .season-list li {
    display: grid;
    grid-template-columns: 52px 48px minmax(0, 1fr) 80px;
    align-items: center;
    gap: 10px;
    border: 1px solid #2a4068;
    border-radius: 8px;
    background: #13243f;
    padding: 8px 12px;
    font-size: 13px;
  }

  .season-list li.current {
    border-color: #6da1f7;
    background: #1a3156;
  }

  .season-list li.done {
    opacity: 0.65;
  }

  .week-badge {
    font-size: 11px;
    color: #9fb6db;
    font-weight: 600;
  }

  .vs-label {
    font-size: 11px;
    border: 1px solid #3d5f96;
    border-radius: 999px;
    padding: 2px 7px;
    text-align: center;
    color: #b8d0f7;
  }

  .opponent {
    color: #e4edff;
    font-weight: 500;
  }

  .status {
    text-align: right;
    font-size: 12px;
    color: #a8bfdf;
  }

  .status.win {
    color: #68de92;
    font-weight: 700;
  }

  .status.lose {
    color: #ff8a8a;
    font-weight: 700;
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


