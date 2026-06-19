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
  import SchedulePage from "../schedule/SchedulePage.svelte";
  import TrainingPage from "../training/TrainingPage.svelte";
  import FinancePage from "../finance/FinancePage.svelte";
  import LeaguePage from "../league/LeaguePage.svelte";
  import AchievementsPage from "../achievements/AchievementsPage.svelte";
  import MessagesPage from "../messages/MessagesPage.svelte";
  import TeamPage from "../team/TeamPage.svelte";
  import EventManagerModal from "../../features/events/ui/EventManagerModal.svelte";
  import CareerChoiceHubModal from "../../features/career/ui/CareerChoiceHubModal.svelte";
  import CareerResultsModal from "../../features/career/ui/CareerResultsModal.svelte";
  import CareerResultModal from "../../features/career/ui/CareerResultModal.svelte";
  import DraftObserveModal from "../../features/career/ui/DraftObserveModal.svelte";
  import ContractNegotiationModal from "../../features/contract/ui/ContractNegotiationModal.svelte";
  import OptionClauseModal from "../../features/contract/ui/OptionClauseModal.svelte";
  import TradeModal from "../../features/contract/ui/TradeModal.svelte";
  import FaMarketModal from "../../features/contract/ui/FaMarketModal.svelte";
  import MilitaryStatusPanel from "../../features/military/ui/MilitaryStatusPanel.svelte";
  import SportsUnitApplicationModal from "../../features/military/ui/SportsUnitApplicationModal.svelte";
  import MilitaryEnlistAskModal from "../../features/military/ui/MilitaryEnlistAskModal.svelte";
  import DevToolsHubModal from "../../features/devtools/ui/DevToolsHubModal.svelte";
  import AutoAdvancePanel from "../../features/devtools/ui/AutoAdvancePanel.svelte";
  import { runAutoAdvance } from "../../shared/usecases/runAutoAdvance";
  import MatchEngineLabModal from "../../features/match-engine-lab/ui/MatchEngineLabModal.svelte";
  import EntityManagerModal from "../../features/entity-manager/ui/EntityManagerModal.svelte";
  import AchievementManagerModal from "../../features/achievements/ui/AchievementManagerModal.svelte";
  import SeasonEndModal from "../../features/season-end/ui/SeasonEndModal.svelte";
  import InjuryTreatmentModal from "../../features/injury/ui/InjuryTreatmentModal.svelte";
  import PreGameBriefingModal from "../../features/pre-game-briefing/ui/PreGameBriefingModal.svelte";
  import GameStatusModal from "../../features/game-status/ui/GameStatusModal.svelte";
  import type { EntryInfo, NoEntryInfo } from "../../features/game-status/ui/GameStatusModal.svelte";
  import MatchPage from "../match/MatchPage.svelte";
  import type { InteractiveMatchContext, InteractiveMatchResult, UnifiedGameOutcome } from "../../shared/types/season";
  import { masterStore } from "../../shared/stores/master";
  import { buildBatterLineup, buildStarterStats, buildFielders, derivePreGameWeather, derivePreGamePark } from "../../shared/utils/matchLineupBuilder";

  export let onSeasonEnd: () => void = () => {};

  let currentTab: MainTabId = "home";
  let devToolsHubOpen = false;
  let eventManagerOpen = false;
  let entityManagerOpen = false;
  let achievementManagerOpen = false;
  let matchLabOpen = false;
  let activeMatchContext: InteractiveMatchContext | null = null;
  const tabPageKey: Record<MainTabId, string> = {
    home: "page.home",
    messages: "page.messages",
    status: "page.status",
    team: "page.team",
    schedule: "page.schedule",
    training: "page.training",
    finance: "page.finance",
    test: "page.matchEngine",
    league: "page.league",
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
      case "careerResults":
      case "careerChoice":
      case "draftObserve":
      case "sportsUnitApplication":
      case "militaryEnlistAsk":
      case "trade":
      case "salaryNegotiation":
      case "optionClause":
      case "faMarket":
        return "messages";
      case "hsGroupDraw":
      case "preGameBriefing":
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

  // 진로 선택 pendingAction
  $: pendingCareerChoiceHub = $nextPendingAction?.type === "careerChoiceHub";
  $: pendingCareerResults = $nextPendingAction?.type === "careerResults";
  $: pendingCareerChoice = $nextPendingAction?.type === "careerChoice";
  $: pendingDraftObserve = $nextPendingAction?.type === "draftObserve";
  $: pendingSalaryNegotiation = $nextPendingAction?.type === "salaryNegotiation" ? $nextPendingAction : null;
  $: pendingOptionClause = $nextPendingAction?.type === "optionClause" ? $nextPendingAction : null;
  $: pendingTrade = $nextPendingAction?.type === "trade" ? $nextPendingAction : null;
  $: pendingFaMarket = $nextPendingAction?.type === "faMarket";
  $: pendingSportsUnitApp = $nextPendingAction?.type === "sportsUnitApplication";
  $: pendingMilitaryEnlistAsk = $nextPendingAction?.type === "militaryEnlistAsk"
    ? ($nextPendingAction as import("../../shared/types/season").PendingAction & { type: "militaryEnlistAsk" })
    : null;
  $: pendingInjuryTreatment  = $nextPendingAction?.type === "injuryTreatment"  ? $nextPendingAction : null;
  $: pendingConditionWarning = $nextPendingAction?.type === "conditionWarning" ? $nextPendingAction : null;
  $: pendingPreGameBriefing  = $nextPendingAction?.type === "preGameBriefing"  ? $nextPendingAction : null;
  // 경기 pendingAction 과 해당 일정 찾기
  $: pendingGame = $nextPendingAction?.type === "game" ? $nextPendingAction : null;
  $: pendingGameEntry = pendingGame
    ? $seasonStore.schedule.find((e) => e.id === pendingGame!.scheduleId) ?? null
    : null;
  $: isFriendlyGame = pendingGameEntry?.isFriendly === true;
  type GameSimState = "idle" | "loading" | "no_entry" | "ready" | "error";
  let gameSimState: GameSimState = "idle";
  let gameSimErrorMsg = "";
  let gameEntryInfo:   EntryInfo   | null = null;
  let gameNoEntryInfo: NoEntryInfo | null = null;
  let autoSimRunning = false;

  // entry 시뮬 트리거 (공식·친선 모두 동일)
  $: if (pendingGameEntry && currentTab === "messages" && gameSimState === "idle") {
    startEntrySimulation();
  }

  $: if (!pendingGameEntry || currentTab !== "messages") {
    gameSimState    = "idle";
    gameEntryInfo   = null;
    gameNoEntryInfo = null;
  }

  function extractMatchSummary(r: any): import("../../features/game-status/ui/GameStatusModal.svelte").MatchSummary {
    return {
      inningScores:         r.inningScores         ?? { home: [], away: [] },
      batterAccum:          r.batterAccum           ?? {},
      homeLineup:           r.homeLineup            ?? [],
      awayLineup:           r.awayLineup            ?? [],
      oppPitcherName:       r.oppPitcherName        ?? null,
      oppPitcherPitchCount: r.oppPitcherPitchCount  ?? 0,
      oppPitcherStamina:    r.oppPitcherStamina     ?? 100,
      myPitcherName:        r.myPitcherName         ?? null,
      myPitcherPitchCount:  r.myPitcherPitchCount   ?? 0,
      myPitcherStamina:     r.myPitcherStamina      ?? 100,
      preEntryLogs:         r.preEntryLogs          ?? [],
      currentOuts:          r.currentOuts           ?? 0,
      runners:              r.runners ?? { first: false, second: false, third: false },
    };
  }

  async function startEntrySimulation() {
    if (!pendingGameEntry || gameSimState !== "idle") return;
    gameSimState = "loading";
    try {
      const p      = $gameStore.protagonist;
      const isHome = pendingGameEntry.homeTeamId === p.teamId;

      if ($masterStore.entities.length === 0) {
        await masterStore.loadEntities("");
      }
      const entities        = $masterStore.entities;
      const opponentTeamId  = isHome ? pendingGameEntry.awayTeamId : pendingGameEntry.homeTeamId;
      const opponentLineup  = buildBatterLineup(opponentTeamId, entities);
      const myLineup        = buildBatterLineup(p.teamId, entities);
      const opponentPitcher = buildStarterStats(opponentTeamId, entities);
      const myNpcStarter    = (p.position as string) !== "SP"
                                ? buildStarterStats(p.teamId, entities)
                                : undefined;

      const raw = await window.projectB!.matchSimulateToEntry({
        pitcher: { name: p.name, command: p.pitching.command, velocity: p.pitching.velocity,
                   staminaCap: p.pitching.stamina, mentalResil: p.pitching.mentality },
        role: (p.position as "SP" | "RP" | "CP") ?? "SP",
        protagonistSide: isHome ? "home" : "away",
        ...(opponentLineup.length >= 9 ? { opponentLineup } : { batterMean: 55 }),
        ...(myLineup.length >= 9       ? { myTeamLineup: myLineup } : {}),
        ...(opponentPitcher            ? { opponentPitcher } : {}),
        ...(myNpcStarter               ? { npcStarterPitcher: myNpcStarter } : {}),
      });
      const result = JSON.parse(raw) as { error?: string; entryReached?: boolean; homeScore?: number; awayScore?: number; [key: string]: unknown };
      if (result.error) {
        gameSimState    = "error";
        gameSimErrorMsg = result.error;
        return;
      }
      const summary = extractMatchSummary(result);
      if (result.entryReached) {
        gameEntryInfo = { inning: result.inning, half: result.half,
                          homeScore: result.homeScore, awayScore: result.awayScore, ...summary };
        gameSimState  = "ready";
      } else {
        gameNoEntryInfo = { homeScore: result.homeScore, awayScore: result.awayScore,
                            playerLines: Array.isArray(result.playerLines) ? result.playerLines : undefined,
                            ...summary };
        gameSimState = "no_entry";
      }
    } catch (e) {
      gameSimState    = "error";
      gameSimErrorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  // 게임 시뮬 에러 시 자동 패배 처리로 건너뜀
  async function skipBrokenGame() {
    if (!pendingGameEntry) return;
    const p = $gameStore.protagonist;
    const isHome = pendingGameEntry.homeTeamId === p.teamId;
    const outcome: UnifiedGameOutcome = {
      source: "auto",
      scheduleId:        pendingGameEntry.id,
      week:              pendingGameEntry.week,
      homeTeamId:        pendingGameEntry.homeTeamId,
      awayTeamId:        pendingGameEntry.awayTeamId,
      protagonistTeamId: p.teamId,
      homeScore:  isHome ? 0 : 1,
      awayScore:  isHome ? 1 : 0,
      strikeouts: 0, hitsAllowed: 3, walksAllowed: 1,
      outsRecorded: 0, errors: 0, pitchCount: 0,
      summary: "경기 처리 오류로 자동 패배 처리",
    };
    await applyGameOutcome(outcome);
    gameSimState  = "idle";
    gameSimErrorMsg = "";
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

  function startInteractiveMatch() {
    if (!pendingGameEntry) return;
    const p = $gameStore.protagonist;
    activeMatchContext = {
      scheduleId: pendingGameEntry.id,
      week: pendingGameEntry.week,
      homeTeamId: pendingGameEntry.homeTeamId,
      awayTeamId: pendingGameEntry.awayTeamId,
      protagonistTeamId: p.teamId,
      role: (p.position as "SP" | "RP" | "CP") ?? "SP",
      weather: derivePreGameWeather(pendingGameEntry.id),
      park: derivePreGamePark(pendingGameEntry.homeTeamId),
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
      midGameInjury: result.midGameInjury,
    };
    await applyGameOutcome(outcome);
    activeMatchContext = null;
  }

  // 키보드 이벤트 핸들러 - Ctrl+Q (메인 페이지에서만 동작)
  function handleGlobalShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key !== "q" && event.key !== "Q") return;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const typing =
      tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable === true;
    if (typing) return;

    event.preventDefault();
    const anyOpen = devToolsHubOpen || eventManagerOpen || entityManagerOpen || achievementManagerOpen || matchLabOpen;
    if (anyOpen) {
      devToolsHubOpen = false;
      eventManagerOpen = false;
      entityManagerOpen = false;
      achievementManagerOpen = false;
      matchLabOpen = false;
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
{:else}
  <div class="layout">
    <TopHeader
      dayLabel={$seasonStore.currentDate ? toDateKo($seasonStore.currentDate) : $gameStore.dayLabel}
      teamName={tName($gameStore.protagonist.teamId)}
      playerName={$gameStore.player.name}
      playerYear={$gameStore.player.year}
      playerPosition={$gameStore.player.position}
      playerRole={$gameStore.player.role}
      playerThrows={$gameStore.player.throws}
      playerBats={$gameStore.player.bats}
      playerBirthday={$gameStore.protagonist.birthday ?? ""}
      playerTags={$gameStore.player.tags}
      playerOverall={$gameStore.player.overall}
      playerCondition={$gameStore.player.condition}
      playerFatigue={$gameStore.player.fatigue}
      playerMorale={$gameStore.player.morale}
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
          {#if $gameStore.protagonist.careerStage === "military"}
            <MilitaryStatusPanel />
          {/if}
          {#if currentTab === "home"}
            <HomeDashboard />
          {:else if currentTab === "status"}
            <StatusPage />
          {:else if currentTab === "academics"}
            <AcademicsPage />
          {:else if currentTab === "schedule"}
            <SchedulePage />
          {:else if currentTab === "training"}
            <TrainingPage />
          {:else if currentTab === "finance"}
            <FinancePage />
          {:else if currentTab === "league"}
            <LeaguePage />
          {:else if currentTab === "achievements"}
            <AchievementsPage />
          {:else if currentTab === "messages"}
            <MessagesPage />
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
  on:openMatchLab={() => {
    devToolsHubOpen = false;
    matchLabOpen = true;
  }}
  on:openAutoAdvance={() => {
    devToolsHubOpen = false;
    runAutoAdvance();
  }}
/>

<AutoAdvancePanel />
<EventManagerModal open={eventManagerOpen} on:close={() => (eventManagerOpen = false)} />
<EntityManagerModal open={entityManagerOpen} on:close={() => (entityManagerOpen = false)} />
<AchievementManagerModal open={achievementManagerOpen} on:close={() => (achievementManagerOpen = false)} />
<MatchEngineLabModal open={matchLabOpen} on:close={() => (matchLabOpen = false)} />

{#if $seasonEnded}
  <SeasonEndModal onExit={onSeasonEnd} />
{/if}

{#if pendingCareerChoiceHub && currentTab === "messages"}
  <CareerChoiceHubModal />
{/if}

{#if pendingCareerResults && currentTab === "messages"}
  <CareerResultsModal />
{/if}

{#if pendingCareerChoice && currentTab === "messages"}
  <CareerResultModal />
{/if}

{#if pendingDraftObserve && currentTab === "messages"}
  <DraftObserveModal on:close={() => seasonStore.resolvePendingAction("draftObserve")} />
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

{#if pendingSportsUnitApp && currentTab === "messages"}
  <SportsUnitApplicationModal />
{/if}

{#if pendingMilitaryEnlistAsk && currentTab === "messages"}
  <MilitaryEnlistAskModal reason={pendingMilitaryEnlistAsk.reason} />
{/if}

{#if pendingInjuryTreatment && currentTab === "messages"}
  <InjuryTreatmentModal action={pendingInjuryTreatment} />
{/if}

{#if pendingPreGameBriefing && currentTab === "messages"}
  <PreGameBriefingModal
    scheduleId={pendingPreGameBriefing.scheduleId}
    onConfirm={() => { currentTab = "messages"; }}
  />
{/if}

{#if pendingConditionWarning && currentTab === "messages"}
  <div class="modal-overlay cond-warn-overlay" role="dialog" aria-modal="true">
    <div class="cond-warn-modal">
      <h3 class="cond-warn-title">⚠ 컨디션 저조</h3>
      <p class="cond-warn-body">
        현재 컨디션이 <strong>{pendingConditionWarning.condition}</strong>으로 낮습니다.<br>
        강행 등판 시 경기력이 크게 저하될 수 있습니다.
      </p>
      <div class="cond-warn-btns">
        <button class="cond-btn push" on:click={async () => {
          seasonStore.resolvePendingAction("conditionWarning", pendingConditionWarning!.scheduleId);
          seasonStore.setCurrentDate((await (async () => {
            const e = $seasonStore.schedule.find((e) => e.id === pendingConditionWarning!.scheduleId);
            return e?.gameDate ?? "";
          })()));
          seasonStore.pushPendingAction({ type: "game", scheduleId: pendingConditionWarning!.scheduleId });
        }}>강행 등판</button>
        <button class="cond-btn skip" on:click={async () => {
          seasonStore.resolvePendingAction("conditionWarning", pendingConditionWarning!.scheduleId);
          const schedId = pendingConditionWarning!.scheduleId;
          const entry = $seasonStore.schedule.find((e) => e.id === schedId);
          if (entry) {
            const result = JSON.parse(await window.projectB!.weekCalcNpcFallback(
              JSON.stringify({ homeTeamId: entry.homeTeamId, awayTeamId: entry.awayTeamId })
            )) as { homeScore: number; awayScore: number; winnerId: string; loserId: string };
            const matchResult = { homeScore: result.homeScore, awayScore: result.awayScore, winnerId: result.winnerId, loserId: result.loserId, playerLines: [], events: [] };
            if (entry.isFriendly) {
              const leagueId = $gameStore.protagonist.leagueId;
              const lState = $seasonStore.leagueState[leagueId];
              seasonStore.applyFriendlyResult(schedId, matchResult, leagueId, entry.homeTeamId, entry.awayTeamId, (lState?.teamRotationIndex?.[entry.homeTeamId] ?? 0) + 1, (lState?.teamRotationIndex?.[entry.awayTeamId] ?? 0) + 1, null);
            } else {
              seasonStore.applyMatchResult(schedId, matchResult, $gameStore.protagonist.leagueId);
            }
          }
          await gameStore.save(); await seasonStore.save();
        }}>등판 회피</button>
      </div>
    </div>
  </div>
{/if}

{#if !activeMatchContext && pendingGameEntry && currentTab === "messages"}
  <GameStatusModal
    homeTeamName={tName(pendingGameEntry.homeTeamId)}
    awayTeamName={tName(pendingGameEntry.awayTeamId)}
    week={pendingGameEntry.week}
    isFriendly={isFriendlyGame}
    protagonistTeamId={$gameStore.protagonist.teamId}
    homeTeamId={pendingGameEntry.homeTeamId}
    simState={gameSimState}
    entryInfo={gameEntryInfo}
    noEntryInfo={gameNoEntryInfo}
    errorMsg={gameSimErrorMsg}
    autoRunning={autoSimRunning}
    onAutoSim={autoFinishFromEntry}
    onDirectPlay={startInteractiveMatch}
    onConfirm={confirmNoEntry}
    onSkip={skipBrokenGame}
  />
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

  /* ── 컨디션 경고 모달 ── */
  .cond-warn-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 110;
  }
  .cond-warn-modal {
    background: #1a1508;
    border: 1px solid #8a6010;
    border-radius: 12px;
    padding: 24px 28px;
    width: 320px;
    display: grid; gap: 16px;
  }
  .cond-warn-title { margin: 0; font-size: 18px; color: #f0c060; }
  .cond-warn-body  { margin: 0; font-size: 14px; color: #d8c090; line-height: 1.6; }
  .cond-warn-body strong { color: #ff9b50; }
  .cond-warn-btns  { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cond-btn {
    padding: 10px; border-radius: 8px;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .cond-btn.push { background: #3a2810; border: 1px solid #8a5020; color: #f0a060; }
  .cond-btn.push:hover { background: #4a3418; }
  .cond-btn.skip { background: #0d1928; border: 1px solid #2a4060; color: #7aaed8; }
  .cond-btn.skip:hover { background: #162540; }

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

  .friendly-badge {
    display: inline-block;
    margin-left: 8px;
    padding: 1px 7px;
    background: #2a5c3a;
    color: #7ecc99;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    vertical-align: middle;
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

  .sim-error-msg {
    font-size: 11px;
    color: #c07070;
    text-align: center;
    margin: 4px 0;
    word-break: break-all;
    max-height: 48px;
    overflow: hidden;
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
