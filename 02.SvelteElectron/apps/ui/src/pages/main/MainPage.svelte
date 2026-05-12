<script lang="ts">
  import type { MainTabId } from "../../shared/types/main";
  import { gameStore, unreadCount, showAcademicsTab } from "../../shared/stores/game";
  import { seasonStore, nextPendingAction, seasonEnded } from "../../shared/stores/season";
  import { masterStore, teamMap } from "../../shared/stores/master";
  import { runSimpleGame } from "@core/usecases/matchEngine";
  import { calcGameGrowth } from "../../shared/utils/growthEngine";
  import { checkAchievements, computeMetrics } from "../../shared/utils/achievementEngine";
  import type { MatchResult, PendingAction, PitcherGameLine } from "../../shared/types/season";
  import { t } from "../../shared/i18n";

  function tName(id: string): string {
    return $teamMap.get(id)?.name ?? id;
  }
  import SidebarNav from "../../features/navigation/ui/SidebarNav.svelte";
  import TopHeader from "../../features/main-layout/ui/TopHeader.svelte";
  import HomeDashboard from "../../features/dashboard/ui/HomeDashboard.svelte";
  import RightPanel from "../../features/main-layout/ui/RightPanel.svelte";
  import StatusPage from "../status/StatusPage.svelte";
  import AcademicsPage from "../academics/AcademicsPage.svelte";
  import RosterPage from "../roster/RosterPage.svelte";
  import SchedulePage from "../schedule/SchedulePage.svelte";
  import TrainingPage from "../training/TrainingPage.svelte";
  import FinancePage from "../finance/FinancePage.svelte";
  import TestMatchPage from "../test/TestMatchPage.svelte";
  import RecordsPage from "../records/RecordsPage.svelte";
  import AchievementsPage from "../achievements/AchievementsPage.svelte";
  import MessagesPage from "../messages/MessagesPage.svelte";
  import MessengerPage from "../messenger/MessengerPage.svelte";
  import TeamPage from "../team/TeamPage.svelte";
  import EventManagerModal from "../../features/events/ui/EventManagerModal.svelte";
  import InGameEventModal from "../../features/events/ui/InGameEventModal.svelte";
  import CareerChoiceModal from "../../features/career/ui/CareerChoiceModal.svelte";
  import DraftModal from "../../features/draft/ui/DraftModal.svelte";
  import ContractNegotiationModal from "../../features/contract/ui/ContractNegotiationModal.svelte";
  import OptionClauseModal from "../../features/contract/ui/OptionClauseModal.svelte";
  import TradeModal from "../../features/contract/ui/TradeModal.svelte";
  import FaMarketModal from "../../features/contract/ui/FaMarketModal.svelte";
  import MilitaryEnlistModal from "../../features/military/ui/MilitaryEnlistModal.svelte";
  import MilitaryStatusPanel from "../../features/military/ui/MilitaryStatusPanel.svelte";
  import MessengerScriptModal from "../../features/messenger/ui/MessengerScriptModal.svelte";
  import MessengerManagerModal from "../../features/messenger-manager/ui/MessengerManagerModal.svelte";
  import DevToolsHubModal from "../../features/devtools/ui/DevToolsHubModal.svelte";
  import MatchEngineLabModal from "../../features/match-engine-lab/ui/MatchEngineLabModal.svelte";
  import EntityManagerModal from "../../features/entity-manager/ui/EntityManagerModal.svelte";
  import AchievementManagerModal from "../../features/achievements/ui/AchievementManagerModal.svelte";
  import SeasonEndModal from "../../features/season-end/ui/SeasonEndModal.svelte";
  import MatchPage from "../match/MatchPage.svelte";
  import type { InteractiveMatchContext, InteractiveMatchResult } from "../../shared/types/season";

  export let onSeasonEnd: () => void = () => {};

  let currentTab: MainTabId = "home";
  let rosterTeamId = "";
  let devToolsHubOpen = false;
  let eventManagerOpen = false;
  let entityManagerOpen = false;
  let achievementManagerOpen = false;
  let matchLabOpen = false;
  let messengerManagerOpen = false;
  let activeMatchContext: InteractiveMatchContext | null = null;
  const tabPageKey: Record<MainTabId, string> = {
    home: "page.home",
    messages: "page.messages",
    messenger: "page.messenger",
    status: "page.status",
    team: "page.team",
    roster: "page.roster",
    schedule: "page.schedule",
    training: "page.training",
    finance: "page.finance",
    test: "page.matchEngine",
    records: "page.records",
    achievements: "page.achievements",
    academics: "page.academics"
  };

  type QueueItem = {
    action: PendingAction;
    index: number;
    tab: MainTabId;
    tag: string;
    priority: number;
    title: string;
    detail: string;
  };

  let committedMatchScheduleIds = new Set<string>();
  let lastSeasonYear = 0;

  function tabForPending(action: PendingAction): MainTabId {
    switch (action.type) {
      case "message":
      case "event":
      case "game":
      case "careerChoice":
      case "militaryEnlist":
      case "draft":
      case "trade":
      case "salaryNegotiation":
      case "optionClause":
      case "faMarket":
        return "messages";
      case "messengerScript":
        return "messenger";
    }
  }

  function queueLabel(action: PendingAction): string {
    switch (action.type) {
      case "message": return "메시지 확인";
      case "event": return "이벤트 처리";
      case "messengerScript": return "메신저 아크";
      case "game": return "경기 진행";
      case "careerChoice": return "진로 선택";
      case "draft": return "드래프트";
      case "salaryNegotiation": return "연봉 협상";
      case "optionClause": return "옵션 조항";
      case "trade": return "트레이드";
      case "faMarket": return "FA 시장";
      case "militaryEnlist": return "군입대 결정";
    }
  }

  function queueDetail(action: PendingAction): string {
    const p = $gameStore.protagonist;
    const ss = $gameStore.schoolState;
    const weekInYear = (($seasonStore.currentWeek - 1 + 52) % 52) + 1;
    switch (action.type) {
      case "message":
        return `messageId: ${action.messageId}`;
      case "event":
        return action.title;
      case "messengerScript":
        return `${action.contactId} / ${action.arcId}`;
      case "game":
        return `scheduleId: ${action.scheduleId}`;
      case "careerChoice":
        if (ss.fallbackSelectionPending) {
          const passCount =
            ss.fallbackUniversityPassed.length +
            ss.fallbackIndependentPassed.length +
            (ss.fallbackSportsMilitaryPassed ? 1 : 0);
          return `fallback selection / passed ${passCount}`;
        }
        return `career choice week ${weekInYear}`;
      case "draft":
        return `scout ${p.scoutScore} / ovr ${p.pitching.ovr}`;
      case "salaryNegotiation":
        return `${action.teamId} / offered ${action.offeredSalary.toLocaleString()}`;
      case "optionClause":
        return `${action.optionType} option`;
      case "trade":
        return `${action.fromTeamId} -> ${action.toTeamId}`;
      case "faMarket":
        return `FA round ${p.faNegotiationRound ?? 0} / unsigned ${p.faUnsignedWeeks ?? 0}w`;
      case "militaryEnlist":
        return `age ${p.age} / stage ${p.careerStage}`;
      default:
        return "";
    }
  }

  function queueTag(action: PendingAction): string {
    switch (action.type) {
      case "game": return "MATCH";
      case "draft":
      case "careerChoice": return "CAREER";
      case "salaryNegotiation":
      case "optionClause":
      case "faMarket":
      case "trade": return "CONTRACT";
      case "militaryEnlist": return "MILITARY";
      case "messengerScript": return "MESSENGER";
      case "event": return "EVENT";
      case "message": return "MESSAGE";
    }
  }

  function queuePriority(action: PendingAction): number {
    switch (action.type) {
      case "game": return 100;
      case "careerChoice":
      case "draft": return 90;
      case "salaryNegotiation":
      case "optionClause":
      case "faMarket":
      case "trade": return 80;
      case "militaryEnlist": return 70;
      case "messengerScript": return 60;
      case "event": return 50;
      case "message": return 40;
    }
  }

  function pendingKey(action: PendingAction | null): string {
    if (!action) return "";
    switch (action.type) {
      case "message": return `message:${action.messageId}`;
      case "event": return `event:${action.eventId}`;
      case "messengerScript": return `script:${action.contactId}:${action.arcId}`;
      case "game": return `game:${action.scheduleId}`;
      case "salaryNegotiation": return `salary:${action.teamId}:${action.offeredSalary}`;
      case "optionClause": return `option:${action.optionType}:${action.nextSalary}`;
      case "trade": return `trade:${action.fromTeamId}:${action.toTeamId}`;
      case "faMarket": return "faMarket";
      case "draft": return "draft";
      case "careerChoice": return "careerChoice";
      case "militaryEnlist": return "militaryEnlist";
    }
  }

  $: if (!$showAcademicsTab && currentTab === "academics") {
    currentTab = "home";
  }

  // 메시지 결정 pendingAction 시 메시지 탭 자동 전환 (최대 1회)
  let handledMessageId: string | null = null;
  $: {
    const pa = $nextPendingAction;
    if (pa?.type === "message" && pa.messageId !== handledMessageId) {
      handledMessageId = pa.messageId;
      currentTab = "messages";
    }
    if (!pa || pa.type !== "message") handledMessageId = null;
  }

  // 이벤트 pendingAction
  $: pendingEvent = $nextPendingAction?.type === "event" ? $nextPendingAction : null;

  // 진로 선택 pendingAction
  $: pendingCareerChoice = $nextPendingAction?.type === "careerChoice";
  $: pendingDraft = $nextPendingAction?.type === "draft";
  $: pendingSalaryNegotiation = $nextPendingAction?.type === "salaryNegotiation" ? $nextPendingAction : null;
  $: pendingOptionClause = $nextPendingAction?.type === "optionClause" ? $nextPendingAction : null;
  $: pendingTrade = $nextPendingAction?.type === "trade" ? $nextPendingAction : null;
  $: pendingFaMarket = $nextPendingAction?.type === "faMarket";
  $: pendingMilitaryEnlist = $nextPendingAction?.type === "militaryEnlist";

  // 메신저 스크립트 pendingAction
  $: pendingScript = $nextPendingAction?.type === "messengerScript" ? $nextPendingAction : null;

  // 경기 pendingAction 과 해당 일정 찾기
  $: pendingGame = $nextPendingAction?.type === "game" ? $nextPendingAction : null;
  $: pendingGameEntry = pendingGame
    ? $seasonStore.schedule.find((e) => e.id === pendingGame!.scheduleId) ?? null
    : null;
  let armedPendingKey = "";
  $: currentPendingKey = pendingKey($nextPendingAction);
  $: if (armedPendingKey && armedPendingKey !== currentPendingKey) {
    armedPendingKey = "";
  }
  $: pendingReady = armedPendingKey !== "" && armedPendingKey === currentPendingKey;

  // 경기 자동 시뮬 후 pendingAction 제거
  function autoSimGame() {
    if (!pendingGameEntry) return;
    const p = $gameStore.protagonist;
    const pitcherStats = {
      command:    p.pitching.command,
      velocity:   p.pitching.velocity,
      staminaCap: p.pitching.stamina,
      mentalResil: p.pitching.mentality,
    };
    const gameSummary = runSimpleGame(pitcherStats, 55, p.pitching.ovr);

    const myTeamId = p.teamId;
    const isHome   = pendingGameEntry.homeTeamId === myTeamId;
    const result = buildTeamMatchResult(
      pendingGameEntry.homeTeamId,
      pendingGameEntry.awayTeamId,
      gameSummary.homeScore,
      gameSummary.awayScore,
    );
    seasonStore.applyMatchResult(pendingGameEntry.id, result);
    seasonStore.resolvePendingAction("game", pendingGameEntry.id);

    const myScore  = isHome ? result.homeScore : result.awayScore;
    const oppScore = isHome ? result.awayScore : result.homeScore;
    const oppId    = isHome ? pendingGameEntry.awayTeamId : pendingGameEntry.homeTeamId;
    const won      = myScore > oppScore;
    const diff     = Math.abs(myScore - oppScore);
    const strikeouts = gameSummary.strikeouts;
    const gotSave = won && pendingGameEntry.week > 3 && diff <= 3 ? 1 : 0;

    const growth = calcGameGrowth(p, won, diff, strikeouts);
    const matchLog = `W${pendingGameEntry.week} vs ${tName(oppId)} ${myScore}:${oppScore} ${won ? "승리" : "패배"}`;
    gameStore.applyWeekResult(
      growth.protagonistPatch,
      [matchLog, ...growth.logs],
      [],
      $seasonStore.currentWeek,
    );
    if (growth.fameDelta !== 0) gameStore.updateFame(growth.fameDelta);
    gameStore.recordBaseballAchievementMetric({ strikeouts, save: gotSave, won });
    gameStore.addMessage({
      id: `msg-game-w${pendingGameEntry.week}-${Date.now()}`,
      category: "system",
      sender: "경기 시스템",
      subject: matchLog,
      preview: growth.logs[1] ?? growth.logs[0] ?? matchLog,
      body: [matchLog, ...growth.logs].join("\n"),
      createdAt: `W${pendingGameEntry.week}`,
      readAt: null,
    });
    // 경기 후 업적 처리
    const achMetrics = computeMetrics(
      $gameStore.achievementMetrics,
      $gameStore.mailbox,
      $seasonStore.standings,
      $seasonStore.schedule,
      myTeamId,
    );
    const achResult = checkAchievements($masterStore.achievements, $gameStore.achievements, achMetrics, `W${pendingGameEntry.week}`);
    if (achResult.newlyUnlocked.length > 0) {
      gameStore.applyAchievementCheck(achResult);
    }

    gameStore.save();
    seasonStore.save();
  }

  // 업적 알림 배지 갱신
  $: pendingAchievementCount = $gameStore.pendingAchievements.length;
  $: militaryCountdownLabel =
    $gameStore.protagonist.careerStage === "military"
      ? `전역까지 ${Math.max(0, 104 - $gameStore.protagonist.militaryServiceWeeks)}주 남음`
      : "";

  $: canVoluntaryEnlist =
    ($gameStore.protagonist.careerStage === "pro_kbl" ||
      $gameStore.protagonist.careerStage === "pro_abl" ||
      $gameStore.protagonist.careerStage === "independent") &&
    $gameStore.protagonist.careerStage !== "military" &&
    !$seasonStore.pendingActions.some((a) => a.type === "militaryEnlist");

  $: pendingQueue = $seasonStore.pendingActions.map((action, index) => ({
    action,
    index,
    tab: tabForPending(action),
    tag: queueTag(action),
    priority: queuePriority(action),
    title: queueLabel(action),
    detail: queueDetail(action),
  }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index) as QueueItem[];

  $: pendingByTab = pendingQueue.reduce((acc, item) => {
    acc[item.tab] = (acc[item.tab] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<MainTabId, number>>);

  $: currentTabQueue = pendingQueue.filter((item) => item.tab === currentTab);
  $: if ($seasonStore.seasonYear !== lastSeasonYear) {
    committedMatchScheduleIds = new Set<string>();
    lastSeasonYear = $seasonStore.seasonYear;
  }

  function goToQueueItem(item: QueueItem) {
    currentTab = item.tab;
    if (item.index === 0) {
      armedPendingKey = pendingKey(item.action);
    }
  }

  function openPendingFromNext() {
    const pa = $nextPendingAction;
    if (!pa) return;
    currentTab = tabForPending(pa);
    armedPendingKey = "";
  }

  function triggerVoluntaryEnlist() {
    if (!canVoluntaryEnlist) return;
    seasonStore.pushPendingAction({ type: "militaryEnlist" });
  }

  function closeMatchEngine() {
    currentTab = "home";
  }

  function startInteractiveMatch() {
    if (!pendingGameEntry) return;
    activeMatchContext = {
      scheduleId: pendingGameEntry.id,
      week: pendingGameEntry.week,
      homeTeamId: pendingGameEntry.homeTeamId,
      awayTeamId: pendingGameEntry.awayTeamId,
      protagonistTeamId: $gameStore.protagonist.teamId,
    };
  }

  function completeInteractiveMatch(result: InteractiveMatchResult) {
    if (committedMatchScheduleIds.has(result.scheduleId)) {
      activeMatchContext = null;
      return;
    }
    committedMatchScheduleIds.add(result.scheduleId);

    const myTeamId = $gameStore.protagonist.teamId;
    const teamResult = buildTeamMatchResult(
      result.homeTeamId,
      result.awayTeamId,
      result.homeScore,
      result.awayScore,
    );
    const isDraw = teamResult.loserId === null;
    const runsAllowed = result.homeTeamId === myTeamId ? result.awayScore : result.homeScore;
    const inningsPitched = Number((Math.max(0, result.outsRecorded) / 3).toFixed(1));
    const pitcherLine: PitcherGameLine = {
      role: "pitcher",
      playerId: $gameStore.protagonist.id,
      ip: inningsPitched,
      er: runsAllowed,
      h: Math.max(0, result.hitsAllowed),
      k: result.strikeouts,
      bb: Math.max(0, result.walksAllowed),
      decision:
        teamResult.winnerId === myTeamId ? "W" : teamResult.loserId === myTeamId ? "L" : "ND",
    };

    const matchResult: MatchResult = { ...teamResult, playerLines: [pitcherLine] };

    seasonStore.applyMatchResult(result.scheduleId, matchResult);
    seasonStore.resolvePendingAction("game", result.scheduleId);

    const won = teamResult.winnerId === myTeamId && !isDraw;
    gameStore.recordBaseballAchievementMetric({
      strikeouts: result.strikeouts,
      won,
    });
    gameStore.addMessage({
      id: `msg-game-w${result.week}-${Date.now()}`,
      category: "system",
      sender: "경기 시스템",
      subject: `W${result.week} 경기 결과`,
      preview: `${result.awayScore}:${result.homeScore} ${won ? "승리" : isDraw ? "무승부" : "패배"} / ${result.strikeouts}K / ${result.hitsAllowed}H / ${result.walksAllowed}BB`,
      body:
        result.summary ||
        `W${result.week} ${result.awayTeamId} ${result.awayScore}:${result.homeScore} ${result.homeTeamId}\n` +
          `기록: ${result.strikeouts}K / ${result.hitsAllowed}H / ${result.walksAllowed}BB / ${result.errors}E`,
      createdAt: `W${result.week}`,
      readAt: null,
    });

    // 직접 플레이 후 업적 체크 (자동 시뮬 경로와 동일 규칙)
    const achMetrics = computeMetrics(
      $gameStore.achievementMetrics,
      $gameStore.mailbox,
      $seasonStore.standings,
      $seasonStore.schedule,
      myTeamId,
    );
    const achResult = checkAchievements(
      $masterStore.achievements,
      $gameStore.achievements,
      achMetrics,
      `W${result.week}`,
    );
    if (
      achResult.newlyUnlocked.length > 0 ||
      achResult.updatedRuntime.some((r, i) => r.progress !== $gameStore.achievements[i]?.progress)
    ) {
      gameStore.applyAchievementCheck(achResult);
    }

    gameStore.save();
    seasonStore.save();
    activeMatchContext = null;
  }

  function buildTeamMatchResult(
    homeTeamId: string,
    awayTeamId: string,
    homeScore: number,
    awayScore: number,
  ): MatchResult {
    const isDraw = homeScore === awayScore;
    return {
      homeScore,
      awayScore,
      winnerId: isDraw ? homeTeamId : homeScore > awayScore ? homeTeamId : awayTeamId,
      loserId: isDraw ? null : homeScore > awayScore ? awayTeamId : homeTeamId,
      playerLines: [],
      events: [],
    };
  }

  // 키보드 이벤트 핸들러 - Ctrl+Q (메인 페이지에서만 동작)
  function handleGlobalShortcut(event: KeyboardEvent) {
    if (currentTab === "test") return;
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key !== "q" && event.key !== "Q") return;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const typing =
      tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable === true;
    if (typing) return;

    event.preventDefault();
    const anyOpen = devToolsHubOpen || eventManagerOpen || entityManagerOpen || achievementManagerOpen || matchLabOpen || messengerManagerOpen;
    if (anyOpen) {
      devToolsHubOpen = false;
      eventManagerOpen = false;
      entityManagerOpen = false;
      achievementManagerOpen = false;
      matchLabOpen = false;
      messengerManagerOpen = false;
      return;
    }
    devToolsHubOpen = true;
  }
</script>

<svelte:window on:keydown={handleGlobalShortcut} />

{#if activeMatchContext}
  <MatchPage
    matchContext={activeMatchContext}
    onComplete={completeInteractiveMatch}
    onCancel={() => { activeMatchContext = null; }}
  />
{:else if currentTab === "test"}
  <TestMatchPage onExit={closeMatchEngine} />
{:else}
  <div class="layout">
    <TopHeader
      dayLabel={$gameStore.dayLabel}
      teamName={tName($gameStore.protagonist.teamId)}
      playerName={$gameStore.player.name}
      onOpenPending={openPendingFromNext}
    />

    <div class="body">
      <SidebarNav
        {currentTab}
        unreadMessageCount={$unreadCount}
        pendingAchievementCount={pendingAchievementCount}
        pendingByTab={pendingByTab}
        showAcademicsTab={$showAcademicsTab}
        militaryCountdownLabel={militaryCountdownLabel}
        onSelectTab={(tab) => {
          currentTab = tab;
          if (tab === "achievements") gameStore.clearAchievementNotifications();
        }}
      />

      <main>
        <div class="tab-content">
          {#if currentTabQueue.length > 0}
            <section class="pending-queue-panel">
              <header>
                <strong>처리 대기 {currentTabQueue.length}건</strong>
              </header>
              <div class="pending-queue-list">
                {#each currentTabQueue as item}
                  <article class="pending-queue-card">
                    <div class="pending-queue-text">
                      <p class="pending-tag">{item.tag}</p>
                      <p class="pending-title">{item.title}</p>
                      {#if item.detail}
                        <p class="pending-detail">{item.detail}</p>
                      {/if}
                    </div>
                    <div class="pending-queue-actions">
                      {#if item.index === 0}
                        <button class="pending-action-btn" on:click={() => goToQueueItem(item)}>처리하기</button>
                      {:else}
                        <span class="pending-order">선행 {item.index}건</span>
                      {/if}
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {/if}
          {#if canVoluntaryEnlist}
            <div class="voluntary-enlist-banner">
              <span>군복무를 지금 시작할 수 있습니다.</span>
              <button on:click={triggerVoluntaryEnlist}>자발 입대</button>
            </div>
          {/if}
          {#if $gameStore.protagonist.careerStage === "military"}
            <MilitaryStatusPanel />
          {/if}
          {#if currentTab === "home"}
            <HomeDashboard />
          {:else if currentTab === "status"}
            <StatusPage />
          {:else if currentTab === "academics"}
            <AcademicsPage />
          {:else if currentTab === "roster"}
            <RosterPage filterTeamId={rosterTeamId} />
          {:else if currentTab === "schedule"}
            <SchedulePage />
          {:else if currentTab === "training"}
            <TrainingPage />
          {:else if currentTab === "finance"}
            <FinancePage />
          {:else if currentTab === "records"}
            <RecordsPage />
          {:else if currentTab === "achievements"}
            <AchievementsPage />
          {:else if currentTab === "messages"}
            <MessagesPage />
          {:else if currentTab === "messenger"}
            <MessengerPage />
          {:else if currentTab === "team"}
            <TeamPage on:gotoRoster={(e) => { rosterTeamId = e.detail.teamId; currentTab = "roster"; }} />
          {:else}
            <section class="placeholder">
              {$t("main.placeholderPreparing", { tab: $t(tabPageKey[currentTab]) })}
            </section>
          {/if}
        </div>
      </main>

      <RightPanel logs={$gameStore.logs} />
    </div>
  </div>
{/if}

<DevToolsHubModal
  open={devToolsHubOpen}
  on:close={() => (devToolsHubOpen = false)}
  on:openEvent={() => {
    devToolsHubOpen = false;
    eventManagerOpen = true;
  }}
  on:openEntity={() => {
    devToolsHubOpen = false;
    entityManagerOpen = true;
  }}
  on:openAchievement={() => {
    devToolsHubOpen = false;
    achievementManagerOpen = true;
  }}
  on:openMatchLab={() => {
    devToolsHubOpen = false;
    matchLabOpen = true;
  }}
  on:openMessenger={() => {
    devToolsHubOpen = false;
    messengerManagerOpen = true;
  }}
/>

<EventManagerModal open={eventManagerOpen} on:close={() => (eventManagerOpen = false)} />
<EntityManagerModal open={entityManagerOpen} on:close={() => (entityManagerOpen = false)} />
<AchievementManagerModal open={achievementManagerOpen} on:close={() => (achievementManagerOpen = false)} />
<MatchEngineLabModal open={matchLabOpen} on:close={() => (matchLabOpen = false)} />
<MessengerManagerModal open={messengerManagerOpen} on:close={() => (messengerManagerOpen = false)} />

{#if $seasonEnded}
  <SeasonEndModal onExit={onSeasonEnd} />
{/if}

{#if pendingCareerChoice && currentTab === "messages" && pendingReady}
  <CareerChoiceModal />
{/if}

{#if pendingDraft && currentTab === "messages" && pendingReady}
  <DraftModal />
{/if}

{#if pendingSalaryNegotiation && currentTab === "messages" && pendingReady}
  <ContractNegotiationModal action={pendingSalaryNegotiation} />
{/if}

{#if pendingOptionClause && currentTab === "messages" && pendingReady}
  <OptionClauseModal action={pendingOptionClause} />
{/if}

{#if pendingTrade && currentTab === "messages" && pendingReady}
  <TradeModal action={pendingTrade} />
{/if}

{#if pendingFaMarket && currentTab === "messages" && pendingReady}
  <FaMarketModal />
{/if}

{#if pendingMilitaryEnlist && currentTab === "messages" && pendingReady}
  <MilitaryEnlistModal />
{/if}

{#if pendingEvent && currentTab === "messages" && pendingReady}
  <InGameEventModal action={pendingEvent} />
{/if}

{#if pendingScript && currentTab === "messenger" && pendingReady}
  <MessengerScriptModal contactId={pendingScript.contactId} arcId={pendingScript.arcId} />
{/if}

{#if !activeMatchContext && pendingGameEntry && currentTab === "messages" && pendingReady}
  <div class="game-overlay">
    <div class="game-modal">
      <p class="week-badge">W{pendingGameEntry.week} 경기</p>
      <div class="matchup">
        <span class:my-team={pendingGameEntry.homeTeamId === $gameStore.protagonist.teamId}>
          {tName(pendingGameEntry.homeTeamId)}
        </span>
        <span class="vs">vs</span>
        <span class:my-team={pendingGameEntry.awayTeamId === $gameStore.protagonist.teamId}>
          {tName(pendingGameEntry.awayTeamId)}
        </span>
      </div>
      <div class="game-actions">
        <button class="btn-auto" on:click={autoSimGame}>자동 시뮬</button>
        <button class="btn-play" on:click={startInteractiveMatch}>직접 플레이</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
    height: 100%;
    overflow: hidden;
  }

  .body {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr) 220px;
    gap: 10px;
    align-items: stretch;
    min-height: 0;
    overflow: hidden;
  }

  main {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .tab-content {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .tab-content > :global(*) {
    min-height: 0;
  }

  .pending-queue-panel {
    margin-bottom: 10px;
    border: 1px solid #5a2d35;
    border-radius: 10px;
    background: #2a1820;
    padding: 10px;
  }

  .pending-queue-panel header {
    margin-bottom: 8px;
    color: #ffd8dd;
    font-size: 13px;
  }

  .pending-queue-list {
    display: grid;
    gap: 8px;
  }

  .pending-queue-card {
    border: 1px solid #6a3942;
    border-radius: 8px;
    background: #341f28;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .pending-title {
    margin: 0;
    color: #ffeef0;
    font-size: 13px;
    font-weight: 700;
  }

  .pending-tag {
    margin: 0 0 2px;
    color: #ffd0d8;
    font-size: 10px;
    letter-spacing: 0.7px;
    text-transform: uppercase;
  }

  .pending-detail {
    margin: 2px 0 0;
    color: #d6a9b2;
    font-size: 12px;
  }

  .pending-action-btn {
    border: 1px solid #f06a74;
    background: #8a2430;
    color: #fff6f7;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .pending-order {
    color: #ffc6ce;
    font-size: 12px;
    white-space: nowrap;
  }

  .voluntary-enlist-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    padding: 8px 10px;
    border: 1px solid #8b6a2d;
    border-radius: 10px;
    background: #302410;
    color: #ffe8a8;
  }

  .voluntary-enlist-banner button {
    border: 1px solid #c19a53;
    background: #4c3b1b;
    color: #ffecc1;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .placeholder {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 14px;
    height: 100%;
  }

  @media (max-width: 1280px) {
    .body {
      grid-template-columns: 154px minmax(0, 1fr) 196px;
    }
  }

  /* ── 경기 오버레이 ── */
  .game-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .game-modal {
    background: #111d34;
    border: 1px solid #3a5a96;
    border-radius: 14px;
    padding: 32px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    min-width: 340px;
  }

  .week-badge {
    margin: 0;
    font-size: 13px;
    color: #7a9ac8;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .matchup {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 18px;
    font-weight: 600;
    color: #b8d0f7;
  }

  .matchup .my-team {
    color: #f0e060;
  }

  .vs {
    font-size: 13px;
    color: #4a6888;
    font-weight: 400;
  }

  .game-actions {
    display: flex;
    gap: 10px;
  }

  .btn-auto {
    padding: 10px 28px;
    background: #1a6640;
    color: #fff;
    border: 0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-auto:hover {
    background: #22854f;
  }

  .btn-play {
    padding: 10px 20px;
    background: #1d63d8;
    color: #f2f8ff;
    border: 1px solid #3e86ff;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-play:hover {
    background: #2a72ea;
  }
</style>


