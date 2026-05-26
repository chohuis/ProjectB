<script lang="ts">
  import type { MainTabId } from "../../shared/types/main";
  import { gameStore, unreadCount, showAcademicsTab } from "../../shared/stores/game";
  import { seasonStore, nextPendingAction, seasonEnded } from "../../shared/stores/season";
  import { teamMap } from "../../shared/stores/master";
  import { applyGameOutcome } from "../../shared/usecases/applyGameOutcome";
  import type { PendingAction } from "../../shared/types/season";
  import { t } from "../../shared/i18n";
  import { toDateKo } from "../../shared/utils/scheduleGen";

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
  import CareerChoiceHubModal from "../../features/career/ui/CareerChoiceHubModal.svelte";
  import CareerResultModal from "../../features/career/ui/CareerResultModal.svelte";
  import DraftBoardModal from "../../features/career/ui/DraftBoardModal.svelte";
  import DraftModal from "../../features/draft/ui/DraftModal.svelte";
  import ContractNegotiationModal from "../../features/contract/ui/ContractNegotiationModal.svelte";
  import OptionClauseModal from "../../features/contract/ui/OptionClauseModal.svelte";
  import TradeModal from "../../features/contract/ui/TradeModal.svelte";
  import FaMarketModal from "../../features/contract/ui/FaMarketModal.svelte";
  import HsGroupDrawModal from "../../features/hs-group-draw/ui/HsGroupDrawModal.svelte";
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
  import type { InteractiveMatchContext, InteractiveMatchResult, UnifiedGameOutcome } from "../../shared/types/season";

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


  let committedMatchScheduleIds = new Set<string>();
  let lastSeasonYear = 0;

  function tabForPending(action: PendingAction): MainTabId {
    switch (action.type) {
      case "message":
      case "event":
      case "game":
      case "careerChoiceHub":
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
      case "hsGroupDraw":
        return "messages";
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
  $: pendingCareerChoiceHub = $nextPendingAction?.type === "careerChoiceHub";
  $: pendingCareerChoice = $nextPendingAction?.type === "careerChoice";
  $: pendingDraft = $nextPendingAction?.type === "draft";
  $: pendingSalaryNegotiation = $nextPendingAction?.type === "salaryNegotiation" ? $nextPendingAction : null;
  $: pendingOptionClause = $nextPendingAction?.type === "optionClause" ? $nextPendingAction : null;
  $: pendingTrade = $nextPendingAction?.type === "trade" ? $nextPendingAction : null;
  $: pendingFaMarket = $nextPendingAction?.type === "faMarket";
  $: pendingMilitaryEnlist = $nextPendingAction?.type === "militaryEnlist";
  $: pendingHsGroupDraw   = $nextPendingAction?.type === "hsGroupDraw";
  $: hsDrawMsgDecided = !!$gameStore.mailbox
    .find((m) => m.id === `msg-hs-group-draw-${$seasonStore.seasonYear}`)
    ?.decision?.selectedOptionId;

  // 메신저 스크립트 pendingAction
  $: pendingScript = $nextPendingAction?.type === "messengerScript" ? $nextPendingAction : null;

  // 경기 pendingAction 과 해당 일정 찾기
  $: pendingGame = $nextPendingAction?.type === "game" ? $nextPendingAction : null;
  $: pendingGameEntry = pendingGame
    ? $seasonStore.schedule.find((e) => e.id === pendingGame!.scheduleId) ?? null
    : null;
  type GameSimState = "idle" | "loading" | "no_entry" | "ready";
  let gameSimState: GameSimState = "idle";
  let gameEntryInfo: { inning: number; half: string; homeScore: number; awayScore: number } | null = null;
  let gameNoEntryInfo: { homeScore: number; awayScore: number; playerLines?: import('../../shared/types/season').PlayerGameLine[] } | null = null;
  let autoSimRunning = false;

  $: if (pendingGameEntry && currentTab === "messages" && gameSimState === "idle") {
    startEntrySimulation();
  }
  $: if (!pendingGameEntry || currentTab !== "messages") {
    gameSimState = "idle";
    gameEntryInfo = null;
    gameNoEntryInfo = null;
  }

  async function startEntrySimulation() {
    if (!pendingGameEntry || gameSimState !== "idle") return;
    gameSimState = "loading";
    try {
      const p = $gameStore.protagonist;
      const isHome = pendingGameEntry.homeTeamId === p.teamId;
      const raw = await window.projectB!.matchSimulateToEntry({
        pitcher: { name: p.name, command: p.pitching.command, velocity: p.pitching.velocity, staminaCap: p.pitching.stamina, mentalResil: p.pitching.mentality },
        batterMean: 55,
        role: (p.position as "SP" | "RP" | "CP") ?? "SP",
        protagonistSide: isHome ? "home" : "away",
      });
      const result = JSON.parse(raw) as { entryReached: boolean; inning?: number; half?: string; homeScore: number; awayScore: number; playerLines?: import('../../shared/types/season').PlayerGameLine[]; error?: string };
      if (result.error) { gameSimState = "idle"; return; }
      if (result.entryReached) {
        gameEntryInfo = { inning: result.inning!, half: result.half!, homeScore: result.homeScore, awayScore: result.awayScore };
        gameSimState = "ready";
      } else {
        gameNoEntryInfo = {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          playerLines: Array.isArray(result.playerLines) ? result.playerLines : undefined,
        };
        gameSimState = "no_entry";
      }
    } catch {
      gameSimState = "idle";
    }
  }

  async function autoFinishFromEntry() {
    if (!pendingGameEntry || autoSimRunning) return;
    autoSimRunning = true;
    try {
      const raw = await window.projectB!.matchAutoFinishFromEntry();
      const result = JSON.parse(raw) as { homeScore: number; awayScore: number; summary: string; strikeouts?: number; hitsAllowed?: number; walksAllowed?: number; outsRecorded?: number; pitchCount?: number; playerLines?: import('../../shared/types/season').PlayerGameLine[]; error?: string };
      if (result.error) return;
      const p = $gameStore.protagonist;
      const outcome: UnifiedGameOutcome = {
        source: "auto",
        scheduleId: pendingGameEntry.id,
        week: pendingGameEntry.week,
        homeTeamId: pendingGameEntry.homeTeamId,
        awayTeamId: pendingGameEntry.awayTeamId,
        protagonistTeamId: p.teamId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        strikeouts:   result.strikeouts   ?? 0,
        hitsAllowed:  result.hitsAllowed  ?? 0,
        walksAllowed: result.walksAllowed ?? 0,
        outsRecorded: result.outsRecorded ?? 0,
        errors: 0,
        pitchCount:   result.pitchCount   ?? 0,
        summary: result.summary ?? "",
        playerLines: Array.isArray(result.playerLines) ? result.playerLines : undefined,
      };
      await applyGameOutcome(outcome);
    } finally {
      autoSimRunning = false;
    }
  }

  async function confirmNoEntry() {
    if (!pendingGameEntry || !gameNoEntryInfo) return;
    const p = $gameStore.protagonist;
    const outcome: UnifiedGameOutcome = {
      source: "auto",
      scheduleId: pendingGameEntry.id,
      week: pendingGameEntry.week,
      homeTeamId: pendingGameEntry.homeTeamId,
      awayTeamId: pendingGameEntry.awayTeamId,
      protagonistTeamId: p.teamId,
      homeScore: gameNoEntryInfo.homeScore,
      awayScore: gameNoEntryInfo.awayScore,
      strikeouts: 0, hitsAllowed: 0, walksAllowed: 0, outsRecorded: 0, errors: 0, pitchCount: 0,
      playerLines: gameNoEntryInfo.playerLines,
      summary: "등판하지 못했습니다",
    };
    await applyGameOutcome(outcome);
    gameSimState = "idle";
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

  $: pendingByTab = $seasonStore.pendingActions.reduce((acc, action) => {
    const tab = tabForPending(action);
    acc[tab] = (acc[tab] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<MainTabId, number>>);
  $: if ($seasonStore.seasonYear !== lastSeasonYear) {
    committedMatchScheduleIds = new Set<string>();
    lastSeasonYear = $seasonStore.seasonYear;
  }

  function openPendingFromNext() {
    const pa = $nextPendingAction;
    if (!pa) return;
    currentTab = tabForPending(pa);
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

  async function completeInteractiveMatch(result: InteractiveMatchResult) {
    if (committedMatchScheduleIds.has(result.scheduleId)) {
      activeMatchContext = null;
      return;
    }
    committedMatchScheduleIds.add(result.scheduleId);

    const outcome: UnifiedGameOutcome = {
      source: "interactive",
      scheduleId: result.scheduleId,
      week: result.week,
      homeTeamId: result.homeTeamId,
      awayTeamId: result.awayTeamId,
      protagonistTeamId: $gameStore.protagonist.teamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      strikeouts: result.strikeouts,
      hitsAllowed: result.hitsAllowed,
      walksAllowed: result.walksAllowed,
      outsRecorded: result.outsRecorded,
      errors: result.errors,
      pitchCount: result.pitchCount,
      summary: result.summary,
      batterLines: result.batterLines,
      playerLines: result.playerLines,
    };
    await applyGameOutcome(outcome);
    activeMatchContext = null;
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
      dayLabel={$seasonStore.currentDate ? toDateKo($seasonStore.currentDate) : $gameStore.dayLabel}
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
          {#if canVoluntaryEnlist}
            <div class="voluntary-enlist-banner">
              <span>군복무를 지금 시작할 수 있습니다.</span>
              <button on:click={triggerVoluntaryEnlist}>지원 입대</button>
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
  on:openMatchEngine={() => {
    devToolsHubOpen = false;
    currentTab = "test";
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

{#if pendingCareerChoiceHub && currentTab === "messages"}
  <CareerChoiceHubModal />
{/if}

{#if pendingCareerChoice && currentTab === "messages"}
  <CareerResultModal />
{/if}

{#if pendingDraft && currentTab === "messages"}
  {#if $gameStore.protagonist.careerStage === "highschool"}
    <DraftBoardModal />
  {:else}
    <DraftModal />
  {/if}
{/if}

{#if pendingSalaryNegotiation && currentTab === "messages"}
  <ContractNegotiationModal action={pendingSalaryNegotiation} />
{/if}

{#if pendingOptionClause && currentTab === "messages"}
  <OptionClauseModal action={pendingOptionClause} />
{/if}

{#if pendingTrade && currentTab === "messages"}
  <TradeModal action={pendingTrade} />
{/if}

{#if pendingFaMarket && currentTab === "messages"}
  <FaMarketModal />
{/if}

{#if pendingMilitaryEnlist && currentTab === "messages"}
  <MilitaryEnlistModal />
{/if}

{#if pendingHsGroupDraw && currentTab === "messages" && hsDrawMsgDecided}
  <HsGroupDrawModal />
{/if}

{#if pendingEvent && currentTab === "messages"}
  <InGameEventModal action={pendingEvent} />
{/if}

{#if pendingScript && currentTab === "messenger"}
  <MessengerScriptModal contactId={pendingScript.contactId} arcId={pendingScript.arcId} />
{/if}

{#if !activeMatchContext && pendingGameEntry && currentTab === "messages"}
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

      {#if gameSimState === "loading"}
        <p class="sim-status">경기 상황 분석 중…</p>

      {:else if gameSimState === "no_entry" && gameNoEntryInfo}
        <p class="sim-status no-entry">이번 경기 등판 기회 없음</p>
        <p class="sim-final-score">{gameNoEntryInfo.homeScore} : {gameNoEntryInfo.awayScore}</p>
        <div class="game-actions single">
          <button class="btn-play" on:click={confirmNoEntry}>확인</button>
        </div>

      {:else if gameSimState === "ready" && gameEntryInfo}
        <div class="entry-info">
          <span class="entry-label">{gameEntryInfo.inning}회 {gameEntryInfo.half === "top" ? "초" : "말"} 등판</span>
          <span class="entry-score">{gameEntryInfo.homeScore} : {gameEntryInfo.awayScore}</span>
        </div>
        <div class="game-actions">
          <button class="btn-auto" on:click={autoFinishFromEntry} disabled={autoSimRunning}>
            {autoSimRunning ? "시뮬 중…" : "자동 시뮬"}
          </button>
          <button class="btn-play" on:click={startInteractiveMatch} disabled={autoSimRunning}>직접 플레이</button>
        </div>

      {:else}
        <p class="sim-status">경기 준비 중…</p>
      {/if}
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

  .btn-auto:hover:not(:disabled) {
    background: #22854f;
  }

  .btn-auto:disabled,
  .btn-play:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sim-status {
    margin: 4px 0 0;
    font-size: 13px;
    color: #8aafd6;
    text-align: center;
  }

  .sim-status.no-entry {
    font-size: 15px;
    color: #c8a060;
    font-weight: 600;
  }

  .sim-final-score {
    margin: 6px 0 0;
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    color: #d8eaff;
    letter-spacing: 4px;
  }

  .entry-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #0d1e36;
    border: 1px solid #2c4870;
    border-radius: 8px;
    padding: 10px 16px;
  }

  .entry-label {
    font-size: 15px;
    font-weight: 600;
    color: #7ec8f8;
  }

  .entry-score {
    font-size: 20px;
    font-weight: 700;
    color: #e8f4ff;
    letter-spacing: 3px;
  }

  .game-actions.single {
    justify-content: center;
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
