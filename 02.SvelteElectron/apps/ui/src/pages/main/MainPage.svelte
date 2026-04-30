<script lang="ts">
  import type { MainTabId } from "../../shared/types/main";
  import { gameStore, unreadCount, showAcademicsTab } from "../../shared/stores/game";
  import { seasonStore, nextPendingAction, seasonEnded } from "../../shared/stores/season";
  import { masterStore, teamMap } from "../../shared/stores/master";
  import { simulateProtagonistGame } from "../../shared/usecases/advanceWeek";
  import { calcGameGrowth } from "../../shared/utils/growthEngine";
  import { checkAchievements, computeMetrics } from "../../shared/utils/achievementEngine";
  import type { MatchResult } from "../../shared/types/season";
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
  import DevToolsHubModal from "../../features/devtools/ui/DevToolsHubModal.svelte";
  import EntityManagerModal from "../../features/entity-manager/ui/EntityManagerModal.svelte";
  import AchievementManagerModal from "../../features/achievements/ui/AchievementManagerModal.svelte";
  import SeasonEndModal from "../../features/season-end/ui/SeasonEndModal.svelte";

  export let onSeasonEnd: () => void = () => {};

  let currentTab: MainTabId = "home";
  let devToolsHubOpen = false;
  let eventManagerOpen = false;
  let entityManagerOpen = false;
  let achievementManagerOpen = false;
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

  $: if (!$showAcademicsTab && currentTab === "academics") {
    currentTab = "home";
  }

  // 메시지 결정 pendingAction → 메시지 탭 자동 전환 (최초 1회)
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

  // 경기 pendingAction → 해당 일정 항목
  $: pendingGame = $nextPendingAction?.type === "game" ? $nextPendingAction : null;
  $: pendingGameEntry = pendingGame
    ? $seasonStore.schedule.find((e) => e.id === pendingGame!.scheduleId) ?? null
    : null;

  // 경기 자동 시뮬 후 pendingAction 해제
  function autoSimGame() {
    if (!pendingGameEntry) return;
    const result: MatchResult = simulateProtagonistGame(
      pendingGameEntry.homeTeamId,
      pendingGameEntry.awayTeamId,
    );
    seasonStore.applyMatchResult(pendingGameEntry.id, result);
    seasonStore.resolvePendingAction("game", pendingGameEntry.id);

    const myTeamId = $gameStore.protagonist.teamId;
    const isHome   = pendingGameEntry.homeTeamId === myTeamId;
    const myScore  = isHome ? result.homeScore : result.awayScore;
    const oppScore = isHome ? result.awayScore : result.homeScore;
    const oppId    = isHome ? pendingGameEntry.awayTeamId : pendingGameEntry.homeTeamId;
    const won      = myScore > oppScore;
    const diff     = Math.abs(myScore - oppScore);
    const strikeouts = Math.max(0, Math.floor(Math.random() * 7) + 2);
    const gotSave = won && pendingGameEntry.week > 3 && diff <= 3 ? 1 : 0;

    const growth = calcGameGrowth($gameStore.protagonist, won, diff);
    const matchLog = `W${pendingGameEntry.week} vs ${tName(oppId)} ${myScore}:${oppScore} ${won ? "승리" : "패배"}`;
    gameStore.applyWeekResult(
      growth.protagonistPatch,
      [matchLog, ...growth.logs],
      [],
      $seasonStore.currentWeek,
    );
    gameStore.recordBaseballAchievementMetric({ strikeouts, save: gotSave });
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
    // 경기 후 업적 체크
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

  // 업적 뱃지 카운트
  $: pendingAchievementCount = $gameStore.pendingAchievements.length;

  function closeMatchEngine() {
    currentTab = "home";
  }

  // 개발자 이벤트 관리 도구 단축키: Ctrl+Q (메인 레이아웃에서만 동작)
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
    const anyOpen = devToolsHubOpen || eventManagerOpen || entityManagerOpen || achievementManagerOpen;
    if (anyOpen) {
      devToolsHubOpen = false;
      eventManagerOpen = false;
      entityManagerOpen = false;
      achievementManagerOpen = false;
      return;
    }
    devToolsHubOpen = true;
  }
</script>

<svelte:window on:keydown={handleGlobalShortcut} />

{#if currentTab === "test"}
  <TestMatchPage onExit={closeMatchEngine} />
{:else}
  <div class="layout">
    <TopHeader
      dayLabel={$gameStore.dayLabel}
      teamName={tName($gameStore.protagonist.teamId)}
      playerName={$gameStore.player.name}
    />

    <div class="body">
      <SidebarNav
        {currentTab}
        unreadMessageCount={$unreadCount}
        pendingAchievementCount={pendingAchievementCount}
        showAcademicsTab={$showAcademicsTab}
        onSelectTab={(tab) => {
          currentTab = tab;
          if (tab === "achievements") gameStore.clearAchievementNotifications();
        }}
      />

      <main>
        <div class="tab-content">
          {#if currentTab === "home"}
            <HomeDashboard />
          {:else if currentTab === "status"}
            <StatusPage />
          {:else if currentTab === "academics"}
            <AcademicsPage />
          {:else if currentTab === "roster"}
            <RosterPage />
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
            <TeamPage />
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
/>

<EventManagerModal open={eventManagerOpen} on:close={() => (eventManagerOpen = false)} />
<EntityManagerModal open={entityManagerOpen} on:close={() => (entityManagerOpen = false)} />
<AchievementManagerModal open={achievementManagerOpen} on:close={() => (achievementManagerOpen = false)} />

{#if $seasonEnded}
  <SeasonEndModal onExit={onSeasonEnd} />
{/if}

{#if pendingCareerChoice}
  <CareerChoiceModal />
{/if}

{#if pendingEvent}
  <InGameEventModal action={pendingEvent} />
{/if}

{#if pendingGameEntry}
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
        <button class="btn-play" disabled>직접 플레이 (준비 중)</button>
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

  /* ── 경기 대기 모달 ── */
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
    background: #1a2840;
    color: #4a6888;
    border: 1px solid #2e4060;
    border-radius: 8px;
    font-size: 14px;
    cursor: not-allowed;
  }
</style>
