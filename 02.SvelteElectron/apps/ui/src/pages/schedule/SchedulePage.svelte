<script lang="ts">
  import { seasonStore } from "../../shared/stores/season";
  import { gameStore } from "../../shared/stores/game";
  import { hsRegionOfTeam, hsRegionTeams } from "../../shared/utils/ids";
  import { HS_REGIONS } from "../../shared/utils/leagueTeams.generated";
  import { hsRegionMeta } from "../../shared/utils/hsRegionLabel";
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
      friendly?: boolean;
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
  // 1. 경기 항목 (주인공 경기만)
  $: gameItems = seasonEntries.filter(e => e.isProtagonistGame).map((entry): ScheduleItem => {
    const date = entry.gameDate ?? weekToDateKey(entry.week, seasonYear, entry.isFriendly ? 2 : 5);
    const isHome = entry.homeTeamId === protagonistTeamId;
    const opponent = teamLabel(isHome ? entry.awayTeamId : entry.homeTeamId);
    const status: ScheduleItem["status"] = entry.result
      ? "done"
      : entry.week >= currentWeek ? "important" : "planned";
    const prefix = entry.isFriendly ? "[친선]" : psLabel(entry.id);
    const result = entry.result
      ? { won: entry.result.winnerId === protagonistTeamId, score: `${entry.result.homeScore}:${entry.result.awayScore}` }
      : null;
    return {
      id: entry.id, date, type: "game",
      title: `${prefix ? prefix + " " : ""}W${entry.week} vs ${opponent}`,
      time: entry.isFriendly ? "10:00" : "13:00",
      location: isHome ? "홈" : "원정", status,
      meta: { result, friendly: entry.isFriendly === true },
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
  type ScheduleEntryRow = (typeof seasonEntries)[0];
  type WeekGames = { officials: ScheduleEntryRow[]; friendlies: ScheduleEntryRow[] };
  $: gamesByWeek = (() => {
    const m = new Map<number, WeekGames>();
    for (const e of seasonEntries) {
      if (!e.isProtagonistGame) continue;
      const cur = m.get(e.week) ?? { officials: [], friendlies: [] };
      if (e.isFriendly) cur.friendlies.push(e);
      else cur.officials.push(e);
      m.set(e.week, cur);
    }
    return m;
  })();
  /**
   * 옆단 순위표. **내 권역만 보여준다.**
   *
   * 예전엔 리그 전체(고교 102팀)를 그렸다. 옆단이 좁아 스크롤이 한없이 길고,
   * 고교는 **실제로 겨루는 상대가 권역 안 팀들**이라 전국 표는 여기서 쓸모가 적다.
   * 권역이 없는 리그(대학·프로)에서는 `regionTeams`가 비어 리그 전체가 나온다.
   */
  $: myRegionTeams = hsRegionTeams(
    $gameStore.protagonist.teamId,
    HS_REGIONS as Record<string, readonly string[]>,
  );
  $: myRegionName = hsRegionOfTeam($gameStore.protagonist.teamId)
    ? hsRegionMeta(hsRegionOfTeam($gameStore.protagonist.teamId)!).label
    : "";
  $: sortedStandings = [...$seasonStore.standings]
    .filter((s) => myRegionTeams.length === 0 || myRegionTeams.includes(s.teamId))
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

  // 주간 뷰 표시 상한 (이 수 초과 시 "+N 더" 표시)
  const WEEK_ITEM_LIMIT = 4;
</script>

<!-- 제목("일정")을 뺐다 — 사이드바가 이미 그 이름이다 -->
<section class="page">
  <div class="board">

    <!-- ── 상단: 뷰 탭 + 네비게이션 ── -->
    <header class="top-row">
      <div class="u-subtabs">
        <button class:on={view === "season"} on:click={() => (view = "season")}>시즌</button>
        <button class:on={view === "year"}   on:click={() => (view = "year")}>연간</button>
        <button class:on={view === "month"}  on:click={() => (view = "month")}>월간</button>
        <button class:on={view === "week"}   on:click={() => (view = "week")}>주간</button>
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
                  {@const phase    = weekPhase(week)}
                  {@const wg         = gamesByWeek.get(week) ?? { officials: [], friendlies: [] }}
                  {@const isCurrent  = week === currentWeek}
                  {@const isPast     = week < currentWeek}
                  {@const hasPost    = wg.officials.some(o => psLabel(o.id) !== "")}
                  {@const hasFriendly = wg.friendlies.length > 0}
                  <div class="week-row"
                    class:current={isCurrent}
                    class:past={isPast}
                    class:postseason-game={hasPost}
                    class:has-friendly={hasFriendly}
                    on:click={() => { view = "week"; cursor = new Date(seasonYear, 2, 1); cursor.setDate(cursor.getDate() + (week - 1) * 7); }}
                  >
                    <!-- 주차 + 페이즈 -->
                    <div class="week-left">
                      <span class="week-num">W{week}</span>
                      <span class="phase-tag"
                        class:pre={phase === "preseason"}  class:reg={phase === "season"}
                        class:post={phase === "postseason"} class:off={phase === "offseason"}>
                        {PHASE_LABEL[phase]}
                      </span>
                    </div>

                    <!-- 경기 정보 영역 -->
                    <div class="week-games">
                      {#if wg.officials.length > 0}
                        {#each wg.officials as official}
                          {@const isHome = official.homeTeamId === protagonistTeamId}
                          {@const opp    = teamLabel(isHome ? official.awayTeamId : official.homeTeamId)}
                          {@const done   = !!official.result}
                          {@const psl    = psLabel(official.id)}
                          <div class="game-row official">
                            <span class="game-loc">{isHome ? "홈" : "원정"}</span>
                            <span class="opponent">{psl ? psl + " " : ""}vs {opp}</span>
                            <span class="status"
                              class:win ={done && official.result?.winnerId === protagonistTeamId}
                              class:lose={done && official.result?.winnerId !== protagonistTeamId}>
                              {gameStatusLabel(official)}
                            </span>
                          </div>
                        {/each}
                      {:else if wg.friendlies.length === 0}
                        <div class="game-row">
                          <span class="no-game">{PHASE_TRAIN_LABEL[phase] ?? "–"}</span>
                        </div>
                      {/if}

                      {#each wg.friendlies as friendly}
                        {@const isHome = friendly.homeTeamId === protagonistTeamId}
                        {@const opp    = teamLabel(isHome ? friendly.awayTeamId : friendly.homeTeamId)}
                        {@const done   = !!friendly.result}
                        <div class="game-row friendly">
                          <span class="friendly-tag">친선</span>
                          <span class="game-loc">{isHome ? "홈" : "원정"}</span>
                          <span class="opponent">vs {opp}</span>
                          <span class="status"
                            class:win ={done && friendly.result?.winnerId === protagonistTeamId}
                            class:lose={done && friendly.result?.winnerId !== protagonistTeamId}>
                            {gameStatusLabel(friendly)}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>

              <div class="standings-panel">
                <h4>
                  팀 순위
                  {#if myRegionName}<span class="scope-chip">{myRegionName} 권역</span>{/if}
                </h4>
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
                    <p class="{item.type}{item.meta?.friendly ? ' friendly' : ''}">{item.title}</p>
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
                    <li class="{item.type}{item.meta?.friendly ? ' friendly' : ''}">
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
              <span class={`tag ${item.type}${item.meta?.friendly ? ' friendly' : ''}`}>
                {item.type === "game" ? (item.meta?.friendly ? "친선" : "공식") : typeLabel[item.type]}
              </span>
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

  </div>
</section>

<style>
  .page { display: grid; grid-template-rows: minmax(0, 1fr); height: 100%; min-height: 0; overflow: hidden; }
  h3, p { margin: 0; }

  .board {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 8px;
    min-height: 0;
    overflow: hidden;
  }

  /* -- 상단 -- */
  .top-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .filters, .nav-tools { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

  .filters button, .nav-tools button {
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-mid);
    border-radius: var(--radius);
    padding: 4px 10px;
    font-size: 11.5px;
    cursor: pointer;
    white-space: nowrap;
  }
  .filters button:hover, .nav-tools button:hover { border-color: var(--t-dark); color: var(--t-dark); }
  .filters button.active {
    background: var(--t-dark); border-color: var(--t-dark);
    color: var(--ink-on-dark); font-weight: 700;
  }
  .nav-tools .today { border-color: var(--t-accent); color: var(--t-accent); font-weight: 700; }
  .nav-label {
    color: var(--ink); font-size: 13px; font-weight: 800;
    padding: 0 6px; white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .filter-count { font-size: 10.5px; color: var(--ink-mute); margin-left: 4px; }

  .content { min-height: 0; overflow: hidden; position: relative; }

  /* ══ 일정 종류의 색 ══
     넷에 다 색을 주면 아무것도 안 도드라진다. **경기만 팀 색**이고
     나머지는 중요도 순으로 명도가 내려간다.
     친선은 공식 기록에 안 들어가므로 가장 약하다 */
  .day-items .game,          .week-day li.game          { background: var(--t-dark);      color: var(--ink-on-dark); }
  .day-items .game.friendly, .week-day li.game.friendly { background: var(--panel-sunk);  color: var(--ink-mid); }
  .day-items .training,      .week-day li.training      { background: var(--ink-mid);     color: var(--ink-on-dark); }
  .day-items .event,         .week-day li.event         { background: var(--warn);        color: var(--ink-on-dark); }
  .day-items .rest,          .week-day li.rest          { background: var(--line-strong); color: var(--ink-mid); }

  /* -- 연간 -- */
  .year-grid {
    height: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 6px;
    overflow: hidden;
  }
  .month-card {
    background: var(--panel);
    border: 0;
    border-left: 3px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.14);
    padding: 9px 11px;
    text-align: left;
    color: var(--ink);
    display: grid; gap: 4px;
    cursor: pointer; overflow: hidden;
    align-content: start;
  }
  .month-card:hover { border-left-color: var(--t-accent); }
  .month-card strong { font-size: 13px; font-weight: 800; }
  .month-card p { color: var(--ink-mute); font-size: 11px; }

  .chips { display: flex; gap: 3px; flex-wrap: wrap; }
  .chip {
    font-size: 9.5px; font-weight: 700;
    border-radius: 999px; padding: 1px 7px;
    color: var(--ink-on-dark);
  }
  .chip.game     { background: var(--t-dark); }
  .chip.training { background: var(--ink-mid); }
  .chip.event    { background: var(--warn); }
  .chip.rest     { background: var(--line-strong); color: var(--ink-mid); }

  /* -- 월간 -- */
  .month-view { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 4px; user-select: none; }
  .week-head { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .week-head span {
    text-align: center; font-size: 10px; font-weight: 800;
    letter-spacing: 0.06em; color: var(--ink-mute);
    padding-bottom: 4px; border-bottom: 2px solid var(--t-dark);
  }
  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-template-rows: repeat(6, minmax(0, 1fr));
    gap: 3px;
    overflow: hidden;
  }
  .day-cell {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--ink);
    padding: 4px;
    text-align: left;
    display: grid; grid-template-rows: auto minmax(0, 1fr);
    cursor: pointer; overflow: hidden;
  }
  .day-cell:hover { background: var(--panel-sunk); }
  .day-cell.selected { border-color: var(--t-dark); box-shadow: inset 0 0 0 1px var(--t-dark); }
  .day-cell.outside  { opacity: 0.3; }
  .day-num { font-size: 10.5px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
  .day-items { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
  .day-items p {
    margin: 0; font-size: 9.5px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    border-radius: 2px; padding: 1px 4px; line-height: 1.45;
  }
  .day-items .more { color: var(--ink-mute); background: transparent; padding: 0; font-size: 9px; font-weight: 400; }

  /* -- 주간 -- */
  .week-list { height: 100%; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; user-select: none; }
  .week-day {
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.14);
    padding: 8px;
    display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 5px;
    min-height: 0; overflow: hidden;
  }
  .week-day.selected { box-shadow: inset 0 0 0 2px var(--t-dark); }
  .day-title {
    border: 0; background: transparent;
    color: var(--ink); text-align: left;
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 0 0 5px; cursor: pointer; font-size: 12px;
    border-bottom: 1px solid var(--line);
  }
  .day-title strong { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .day-title span   { font-size: 10.5px; color: var(--ink-mute); }
  .week-day ul {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 3px;
    min-height: 0; overflow-y: auto; overflow-x: hidden;
  }
  .week-day li {
    border-radius: var(--radius); padding: 4px 6px;
    font-size: 10.5px; font-weight: 600; flex-shrink: 0;
  }
  .week-day li p { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .week-day li.empty { color: var(--ink-mute); font-size: 11px; background: none; font-weight: 400; }
  .overflow-badge {
    color: var(--ink-mute); font-size: 9.5px;
    padding: 2px 4px; background: var(--panel-sunk);
    border-radius: 2px; text-align: center; flex-shrink: 0;
  }

  /* -- 시즌 -- */
  .season-view { height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  .no-season { color: var(--ink-mute); font-size: 13px; padding: 16px 0; }
  .season-layout {
    display: grid; grid-template-columns: minmax(0, 1fr) 210px;
    gap: 10px; height: 100%; min-height: 0;
  }
  .week-timeline {
    display: flex; flex-direction: column; gap: 2px;
    overflow-y: auto; padding-right: 4px;
    cursor: grab; scroll-behavior: smooth;
  }
  .week-timeline:active { cursor: grabbing; }

  .week-row {
    display: grid; grid-template-columns: 132px minmax(0, 1fr);
    align-items: start; gap: 8px;
    background: var(--panel);
    border: 0;
    border-left: 3px solid transparent;
    border-bottom: 1px solid var(--line);
    padding: 6px 9px;
    font-size: 11px;
    cursor: pointer; flex-shrink: 0;
  }
  .week-row:hover   { background: var(--panel-sunk); }
  .week-row.current { border-left-color: var(--t-accent); background: var(--panel-sunk); }
  .week-row.past    { opacity: 0.45; }
  /* 포스트시즌 주간은 다른 주와 무게가 다르다 */
  .week-row.postseason-game { border-left-color: var(--warn); }

  .week-left { display: flex; align-items: center; gap: 6px; padding-top: 2px; flex-shrink: 0; }
  .week-num {
    color: var(--ink-mute); font-weight: 800; font-size: 10px;
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .phase-tag {
    font-size: 9px; font-weight: 800;
    border-radius: 999px; padding: 1px 7px;
    text-align: center; white-space: nowrap;
    color: var(--ink-on-dark);
  }
  .phase-tag.pre  { background: var(--line-strong); color: var(--ink-mid); }
  .phase-tag.reg  { background: var(--t-dark); color: var(--t-gold); }
  .phase-tag.post { background: var(--warn); }
  .phase-tag.off  { background: var(--panel-sunk); color: var(--ink-mute); }

  .week-games { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .game-row {
    display: grid; grid-template-columns: 40px minmax(0, 1fr) 64px;
    align-items: center; gap: 7px; min-width: 0;
  }
  .game-row.friendly {
    grid-template-columns: 34px 40px minmax(0, 1fr) 64px;
    padding: 2px 5px;
    border-radius: var(--radius);
    background: var(--panel-sunk);
  }
  .game-loc {
    font-size: 9px; font-weight: 700;
    border-radius: 999px; padding: 1px 6px;
    text-align: center;
    background: var(--panel-sunk); color: var(--ink-mute);
  }
  .friendly-tag {
    font-size: 9px; font-weight: 700;
    border-radius: 999px; padding: 1px 6px;
    text-align: center; white-space: nowrap;
    background: var(--line-strong); color: var(--ink-mid);
  }
  .opponent {
    color: var(--ink); font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* 친선은 기록에 안 남는다 — 눈에서도 한 단계 내린다 */
  .game-row.friendly .opponent { color: var(--ink-mute); font-weight: 500; }
  .no-game { color: var(--ink-mute); font-size: 10px; }

  .status {
    text-align: right; font-size: 11px; color: var(--ink-mute);
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .status.win  { color: var(--ok);  font-weight: 800; }
  .status.lose { color: var(--bad); font-weight: 800; }

  .scope-chip {
    margin-left: 6px;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink-mute);
    background: var(--panel-sunk);
    border-radius: 10px;
    padding: 1px 7px;
    vertical-align: middle;
  }

  /* -- 순위표 (옆단) -- */
  .standings-panel {
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.14);
    padding: 10px;
    display: grid; grid-template-rows: auto minmax(0, 1fr);
    gap: 6px; min-height: 0; overflow: hidden;
  }
  .standings-panel h4 {
    margin: 0;
    font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--ink-mute); text-transform: uppercase;
  }
  .no-standings { color: var(--ink-mute); font-size: 11px; }
  .standings-scroll { overflow-y: auto; height: 100%; }
  .standings-table {
    width: 100%; border-collapse: collapse; font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .standings-table thead th {
    color: var(--ink-mute); padding: 4px 3px; text-align: center;
    border-bottom: 2px solid var(--t-dark);
    position: sticky; top: 0; background: var(--panel);
    font-size: 9.5px; font-weight: 800;
  }
  .standings-table tbody td {
    padding: 5px 3px; text-align: center;
    color: var(--ink-mid);
    border-bottom: 1px solid var(--line);
  }
  .standings-table .team-name {
    text-align: left; max-width: 78px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .standings-table tr.my-team td { background: var(--t-dark); color: var(--t-gold); font-weight: 700; }

  /* -- 상세 -- */
  .detail-box {
    background: var(--panel);
    border-left: 3px solid var(--t-dark);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.14);
    padding: 9px 12px;
    max-height: 140px;
    display: grid; grid-template-rows: auto minmax(0, 1fr);
    gap: 5px; min-height: 0;
  }
  .detail-header { display: flex; align-items: baseline; gap: 9px; }
  .detail-header h3 { font-size: 12px; font-weight: 800; color: var(--ink); }
  .detail-date { font-size: 11px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
  .detail-list {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column;
    overflow-y: auto; min-height: 0;
  }
  .detail-item {
    border-bottom: 1px solid var(--line);
    padding: 6px 2px;
    display: flex; align-items: flex-start; gap: 8px; flex-shrink: 0;
  }
  .detail-item:last-child { border-bottom: 0; }
  .detail-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .detail-body strong {
    font-size: 12px; color: var(--ink); font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .detail-sub  { font-size: 11px; color: var(--ink-mid); margin: 0; }
  .detail-meta { font-size: 10px; color: var(--ink-mute); margin: 0; }

  .tag {
    flex-shrink: 0;
    border-radius: 999px; padding: 1px 7px;
    font-size: 9.5px; font-weight: 700;
    color: var(--ink-on-dark);
  }
  .tag.game          { background: var(--t-dark); }
  .tag.game.friendly { background: var(--line-strong); color: var(--ink-mid); }
  .tag.training      { background: var(--ink-mid); }
  .tag.event         { background: var(--warn); }
  .tag.rest          { background: var(--line-strong); color: var(--ink-mid); }

  .result-badge {
    display: inline-block; font-size: 11px; font-weight: 800;
    padding: 0 4px; border-radius: 2px;
  }
  .result-badge.win  { color: var(--ok); }
  .result-badge.lose { color: var(--bad); }
  li.empty { color: var(--ink-mute); font-size: 11px; padding: 4px 0; list-style: none; }

  @media (max-width: 1280px) {
    .year-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(4, minmax(0, 1fr)); }
    .week-list { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 1024px) {
    .year-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); }
    .week-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
