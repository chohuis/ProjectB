<script lang="ts">
  import type { MainTabId } from "../../shared/types/main";
  import { gaugeLabel } from "../../shared/utils/baseballFormat";
  import { gameStore, unreadCount } from "../../shared/stores/game";
  import { seasonStore, nextPendingAction, seasonEnded } from "../../shared/stores/season";
  import { teamMap, entitiesL10n } from "../../shared/stores/master";
  import { applyGameOutcome } from "../../shared/usecases/applyGameOutcome";
  import type { PendingAction } from "../../shared/types/season";
  import { toDateKo } from "../../shared/utils/scheduleGen";
  import { playerYearLabel } from "../../shared/utils/playerYearLabel";
  import { visibleNavTabs } from "../../shared/utils/navVisibility";

  function tName(id: string): string {
    return $teamMap.get(id)?.name ?? id;
  }
  import SidebarNav from "../../features/navigation/ui/SidebarNav.svelte";
  import TopHeader from "../../features/main-layout/ui/TopHeader.svelte";
  import NewsPage from "../news/NewsPage.svelte";
  import MePage from "../me/MePage.svelte";
  import RightPanel from "../../features/main-layout/ui/RightPanel.svelte";
  import SchedulePage from "../schedule/SchedulePage.svelte";
  import LeaguePage from "../league/LeaguePage.svelte";
  import TeamPage from "../team/TeamPage.svelte";
  import PeoplePage from "../people/PeoplePage.svelte";
  import CareerChoiceHubModal from "../../features/career/ui/CareerChoiceHubModal.svelte";
  import CareerResultsModal from "../../features/career/ui/CareerResultsModal.svelte";
  import CareerResultModal from "../../features/career/ui/CareerResultModal.svelte";
  import DraftObserveModal from "../../features/career/ui/DraftObserveModal.svelte";
  import DraftNotificationModal from "../../features/contract/ui/DraftNotificationModal.svelte";
  import ContractNegotiationModal from "../../features/contract/ui/ContractNegotiationModal.svelte";
  import OptionClauseModal from "../../features/contract/ui/OptionClauseModal.svelte";
  import TradeModal from "../../features/contract/ui/TradeModal.svelte";
  import FaMarketModal from "../../features/contract/ui/FaMarketModal.svelte";
  import MilitaryStatusPanel from "../../features/military/ui/MilitaryStatusPanel.svelte";
  import SportsUnitApplicationModal from "../../features/military/ui/SportsUnitApplicationModal.svelte";
  import MilitaryEnlistAskModal from "../../features/military/ui/MilitaryEnlistAskModal.svelte";
  import RetirementAskModal from "../../features/retirement/ui/RetirementAskModal.svelte";
  import AutoAdvancePanel from "../../features/devtools/ui/AutoAdvancePanel.svelte";
  import { runAutoAdvance } from "../../shared/usecases/runAutoAdvance";
  import SeasonEndModal from "../../features/season-end/ui/SeasonEndModal.svelte";
  import InjuryTreatmentModal from "../../features/injury/ui/InjuryTreatmentModal.svelte";
  import PreGameBriefingModal from "../../features/pre-game-briefing/ui/PreGameBriefingModal.svelte";
  import GameStatusModal from "../../features/game-status/ui/GameStatusModal.svelte";
  import type { EntryInfo, NoEntryInfo } from "../../features/game-status/ui/GameStatusModal.svelte";
  import MatchPage from "../match/MatchPage.svelte";
  import type { InteractiveMatchContext, InteractiveMatchResult, UnifiedGameOutcome } from "../../shared/types/season";
  import { masterStore } from "../../shared/stores/master";
  import { buildBatterLineup, buildStarterStats, buildFielders, derivePreGameWeather, derivePreGamePark, rotIdxOf } from "../../shared/utils/matchLineupBuilder";

  export let onSeasonEnd: () => void = () => {};

  let currentTab: MainTabId = "news";
  let activeMatchContext: InteractiveMatchContext | null = null;


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
      case "retirementAsk":
      case "draftNotification":
      case "trade":
      case "salaryNegotiation":
      case "optionClause":
      case "faMarket":
        return "news";
    }
  }



  // 보이는 내비 — 판정의 정본은 `utils/navVisibility`다
  $: navTabs = visibleNavTabs($gameStore.protagonist);
  $: if (!navTabs.includes(currentTab)) currentTab = navTabs[0] ?? "news";

  // 소식 결정 pendingAction 시 소식 탭 자동 전환 (최대 1회)
  let handledMessageId: string | null = null;
  $: {
    const pa = $nextPendingAction;
    if (pa?.type === "message" && pa.messageId !== handledMessageId) {
      handledMessageId = pa.messageId;
      currentTab = "news";
    }
    if (!pa || pa.type !== "message") handledMessageId = null;
  }

  // 진로 선택 pendingAction
  $: pendingCareerChoiceHub = $nextPendingAction?.type === "careerChoiceHub";
  $: pendingCareerResults = $nextPendingAction?.type === "careerResults";
  $: pendingCareerChoice = $nextPendingAction?.type === "careerChoice";
  $: pendingDraftObserve = $nextPendingAction?.type === "draftObserve";
  $: pendingDraftNotification = $nextPendingAction?.type === "draftNotification" ? $nextPendingAction : null;
  $: pendingSalaryNegotiation = $nextPendingAction?.type === "salaryNegotiation" ? $nextPendingAction : null;
  $: pendingOptionClause = $nextPendingAction?.type === "optionClause" ? $nextPendingAction : null;
  $: pendingTrade = $nextPendingAction?.type === "trade" ? $nextPendingAction : null;
  $: pendingFaMarket = $nextPendingAction?.type === "faMarket";
  $: pendingSportsUnitApp = $nextPendingAction?.type === "sportsUnitApplication";
  $: pendingMilitaryEnlistAsk = $nextPendingAction?.type === "militaryEnlistAsk"
    ? ($nextPendingAction as import("../../shared/types/season").PendingAction & { type: "militaryEnlistAsk" })
    : null;
  $: pendingRetirementAsk = $nextPendingAction?.type === "retirementAsk" ? $nextPendingAction : null;
  $: pendingInjuryTreatment  = $nextPendingAction?.type === "injuryTreatment"  ? $nextPendingAction : null;
  $: pendingConditionWarning = $nextPendingAction?.type === "conditionWarning" ? $nextPendingAction : null;
  // 경기 전 브리핑 — 경기 창에서 여는 읽기 전용 창. 주 진행과 무관하다
  let briefingScheduleId: string | null = null;
  /**
   * 경기 창을 **탭과 무관하게** 열어 두는 표식.
   *
   * 🔴 예전엔 경기 창이 소식 탭에만 묶여 있어(`currentTab === "news"`),
   *   헤더의 [경기 대기 중]을 눌러도 **소식 탭에 이미 있으면 아무 일도
   *   안 일어났다** — 탭만 바꾸는 버튼이라 바꿀 탭이 없었다.
   * ⚠ 경기가 끝나거나 사라지면 저절로 꺼진다(아래 반응형).
   */
  let gameModalForced = false;
  // 경기가 끝나거나 바뀌면 닫는다 — 안 닫으면 다음 경기 창 위에 이전
  // 브리핑이 남는다
  $: if (!pendingGameEntry && briefingScheduleId) briefingScheduleId = null;
  // ⚠ 대기가 사라지면 강제 표식도 끈다 — 안 끄면 다음 경기까지 켜져 있다
  $: if (!pendingGameEntry && gameModalForced) gameModalForced = false;
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
  $: gameModalOpen = !!pendingGameEntry && (currentTab === "news" || gameModalForced);
  $: if (gameModalOpen && gameSimState === "idle") {
    startEntrySimulation();
  }

  $: if (!gameModalOpen) {
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

      const entities        = $entitiesL10n;
      const opponentTeamId  = isHome ? pendingGameEntry.awayTeamId : pendingGameEntry.homeTeamId;
      const opponentLineup  = buildBatterLineup(opponentTeamId, entities);
      const myLineup        = buildBatterLineup(p.teamId, entities);
      // ⚠ **컨디션·로테이션 슬롯·리그를 넘긴다.** 안 넘기면 슬롯이 0으로
      //   고정돼 주인공이 늘 상대 1번 투수를 만난다 (실측: 예고와 실제가
      //   44%만 일치했다)
      const lid       = p.leagueId;
      const conds     = $seasonStore.leagueState[lid]?.playerConditions;
      const opponentPitcher = buildStarterStats(
        opponentTeamId, entities, conds,
        rotIdxOf($seasonStore.leagueState, lid, opponentTeamId), lid, $seasonStore.npcInjuries);
      const myNpcStarter    = (p.position as string) !== "SP"
                                ? buildStarterStats(p.teamId, entities, conds,
                                    rotIdxOf($seasonStore.leagueState, lid, p.teamId), lid, $seasonStore.npcInjuries)
                                : undefined;

      const raw = await window.projectB!.matchSimulateToEntry({
        // ⚠ **여덟 개를 다 넘긴다.** 넷만 넘기면 control·movement·clutch·
        // holdRunners가 빠져 OVR의 33%가 엔진에 안 간다 — 오류 없이 조용히
        // 기본값이 되고, 주인공 ERA가 같은 OVR NPC의 2배가 된다
        pitcher: { name: p.name, command: p.pitching.command, velocity: p.pitching.velocity,
                   staminaCap: p.pitching.stamina, mentalResil: p.pitching.mentality,
                   control: p.pitching.control, movement: p.pitching.movement,
                   clutch: p.pitching.clutch, holdRunners: p.pitching.holdRunners },
        role: (p.position as "SP" | "RP" | "CP") ?? "SP",
        protagonistSide: isHome ? "home" : "away",
        // ⚠ 수비를 안 넘기면 엔진이 평균 50으로 만든다. `buildFielders`는
        // import만 돼 있고 쓰이지 않았다 — 자기 팀 야수를 넘긴다
        // ⚠ **`get(masterStore)`는 여기서 안 된다.** 둘 다 import가 없어
        // `get is not defined`로 **경기 화면이 통째로 죽었다**(새 게임 2주차
        // 친선경기에서 재현). 화면은 언어 반영본을 읽는 게 규칙이기도 하다.
        fielders: buildFielders(p.teamId, $entitiesL10n),
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
                            // ⚠ 엔진 응답이 `[key: string]: unknown`이라 여기서 좁힌다 —
                            //   넓은 채로 두면 `applyGameOutcome`이 받는 타입과 어긋난다.
                            playerLines: Array.isArray(result.playerLines)
                              ? (result.playerLines as import("../../shared/types/season").PlayerGameLine[]) : undefined,
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
    // 🔴 **경기는 창을 직접 연다.** 탭만 바꾸면 소식 탭에 이미 있을 때
    //   버튼이 안 듣는다 — 누른 사람에게는 고장으로 보인다.
    if (pa.type === "game") gameModalForced = true;
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

  // Ctrl+Q — 자동 진행 (메인 페이지에서만 동작)
  //
  // 예전엔 개발자 도구 허브를 열었고 그 아래 항목이 여섯이었다(이벤트·업적·
  // 메신저 에디터 · 매치 엔진 랩 · 자동 진행 · 테스트 시나리오).
  // 2026-08-20에 **자동 진행만 남기고 다 지웠다** — 하나만 남으니 허브가
  // 껍데기라 바로 연다. 나머지는 CLI가 대신한다(`npm run smoke` · `test:*`).
  function handleGlobalShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key !== "q" && event.key !== "Q") return;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const typing =
      tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable === true;
    if (typing) return;

    event.preventDefault();
    runAutoAdvance();
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
      weekLabel={$seasonStore.currentWeek > 0 ? `${$seasonStore.currentWeek}주차` : ""}
      teamName={tName($gameStore.protagonist.teamId)}
      teamId={$gameStore.protagonist.teamId}
      playerName={$gameStore.player.name}
      playerYear={playerYearLabel($gameStore.protagonist)}
      playerPosition={$gameStore.player.position}
      playerThrows={$gameStore.player.throws}
      playerBats={$gameStore.player.bats}
      jerseyNumber={$gameStore.protagonist.jerseyNumber ?? 0}
      onOpenPending={openPendingFromNext}
    />

    <div class="body">
      <SidebarNav
        {currentTab}
        tabs={navTabs}
        unreadMessageCount={$unreadCount}
        pendingAchievementCount={pendingAchievementCount}
        pendingByTab={pendingByTab}
        militaryCountdownLabel={militaryCountdownLabel}
        onSelectTab={(tab) => (currentTab = tab)}
      />

      <main>
        <div class="tab-content">
          {#if $gameStore.protagonist.careerStage === "military"}
            <MilitaryStatusPanel />
          {/if}
          <!-- 여섯 갈래가 전부 구현돼 있다. "준비중" 안내와 그 문구를 조립하던
               `tabPageKey`는 갈 곳이 없어져 같이 지웠다 -->
          {#if currentTab === "news"}
            <NewsPage />
          {:else if currentTab === "me"}
            <MePage />
          {:else if currentTab === "team"}
            <TeamPage />
          {:else if currentTab === "league"}
            <LeaguePage />
          {:else if currentTab === "people"}
            <PeoplePage />
          {:else if currentTab === "schedule"}
            <SchedulePage />
          {/if}
        </div>
      </main>

      <RightPanel />
    </div>
  </div>
{/if}

<!-- 자동 진행 — 스스로 뜰지 판단한다(진행 중이거나 중지 사유가 있을 때).
     Ctrl+Q가 `runAutoAdvance()`를 바로 부른다 -->
<AutoAdvancePanel />

{#if $seasonEnded}
  <SeasonEndModal onExit={onSeasonEnd} />
{/if}

{#if pendingCareerChoiceHub && currentTab === "news"}
  <CareerChoiceHubModal />
{/if}

{#if pendingCareerResults && currentTab === "news"}
  <CareerResultsModal />
{/if}

{#if pendingCareerChoice && currentTab === "news"}
  <CareerResultModal />
{/if}

{#if pendingDraftObserve && currentTab === "news"}
  <DraftObserveModal on:close={() => seasonStore.resolvePendingAction("draftObserve")} />
{/if}

{#if pendingDraftNotification && currentTab === "news"}
  <DraftNotificationModal action={pendingDraftNotification} />
{/if}

{#if pendingSalaryNegotiation && currentTab === "news"}
  <ContractNegotiationModal action={pendingSalaryNegotiation} />
{/if}

{#if pendingOptionClause && currentTab === "news"}
  <OptionClauseModal action={pendingOptionClause} />
{/if}

{#if pendingTrade && currentTab === "news"}
  <TradeModal action={pendingTrade} />
{/if}

{#if pendingFaMarket && currentTab === "news"}
  <FaMarketModal />
{/if}

{#if pendingSportsUnitApp && currentTab === "news"}
  <SportsUnitApplicationModal />
{/if}

{#if pendingMilitaryEnlistAsk && currentTab === "news"}
  <MilitaryEnlistAskModal reason={pendingMilitaryEnlistAsk.reason} />
{/if}

{#if pendingRetirementAsk && currentTab === "news"}
  <RetirementAskModal
    urgency={pendingRetirementAsk.urgency}
    reason={pendingRetirementAsk.reason ?? "decline"}
    detail={pendingRetirementAsk.detail ?? ""}
  />
{/if}

{#if pendingInjuryTreatment && currentTab === "news"}
  <InjuryTreatmentModal action={pendingInjuryTreatment} />
{/if}

<!-- ⚠ **PendingAction이 아니다.** 예전엔 경기 전에 강제로 뜨는 창이라
     매 경기 닫아야 넘어갔다 — 그 사이 쌓인 소식은 볼 기회가 없었다.
     이제 경기 창에서 열어보는 창이고, 진행은 경기 창이 맡는다 -->
{#if briefingScheduleId}
  <PreGameBriefingModal
    scheduleId={briefingScheduleId}
    onClose={() => (briefingScheduleId = null)}
  />
{/if}

{#if pendingConditionWarning && currentTab === "news"}
  <div class="modal-overlay cond-warn-overlay" role="dialog" aria-modal="true">
    <div class="cond-warn-modal">
      <h3 class="cond-warn-title">⚠ 컨디션 저조</h3>
      <p class="cond-warn-body">
        현재 컨디션이 <strong>{gaugeLabel(pendingConditionWarning.condition)}</strong>으로 낮습니다.<br>
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

{#if !activeMatchContext && pendingGameEntry && gameModalOpen}
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
    onOpenBriefing={() => (briefingScheduleId = pendingGameEntry.id)}
    onConfirm={confirmNoEntry}
    onSkip={skipBrokenGame}
  />
{/if}

<style>
  /* 헤더는 **가장자리까지 꽉 채운다.** 떠 있는 상자로 두면 유니폼의 가슴 띠가
     아니라 카드 하나가 되고, 아래 지면과 관계가 안 읽힌다 */
  .layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    overflow: hidden;
  }

  .body {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr) 220px;
    gap: 10px;
    padding: 10px;
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




  @media (max-width: 1280px) {
    .body {
      grid-template-columns: 154px minmax(0, 1fr) 196px;
    }
  }

  /* ── 컨디션 경고 모달 ── */
  .cond-warn-overlay {
    position: fixed; inset: 0;
    background: rgba(10, 18, 38, 0.52);
    display: flex; align-items: center; justify-content: center;
    z-index: 110;
  }
  .cond-warn-modal {
    background: rgba(154, 101, 16, 0.12);
    border: 1px solid var(--warn);
    border-radius: 12px;
    padding: 24px 28px;
    width: 320px;
    display: grid; gap: 16px;
  }
  .cond-warn-title { margin: 0; font-size: 18px; color: var(--warn); }
  .cond-warn-body  { margin: 0; font-size: 14px; color: var(--warn); line-height: 1.6; }
  .cond-warn-body strong { color: var(--warn); }
  .cond-warn-btns  { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cond-btn {
    padding: 10px; border-radius: 8px;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .cond-btn.push { background: rgba(154, 101, 16, 0.12); border: 1px solid var(--warn); color: var(--warn); }
  .cond-btn.push:hover { background: rgba(154, 101, 16, 0.30); }
  .cond-btn.skip { background: var(--panel); border: 1px solid var(--line); color: var(--ink); }
  .cond-btn.skip:hover { background: var(--panel-sunk); }

  /* ── 경기 오버레이 ── */
  .game-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 18, 38, 0.52);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .game-modal {
    background: var(--panel);
    border: 1px solid var(--ink-mute);
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
    background: var(--ok);
    color: var(--ok);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    vertical-align: middle;
  }

  .week-badge {
    margin: 0;
    font-size: 13px;
    color: var(--ink-mid);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .matchup {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 18px;
    font-weight: 600;
    color: var(--ink);
  }

  .matchup .my-team {
    color: var(--warn);
  }

  .vs {
    font-size: 13px;
    color: var(--ink-mute);
    font-weight: 400;
  }

  .game-actions {
    display: flex;
    gap: 10px;
  }

  .btn-auto {
    padding: 10px 28px;
    background: var(--ok);
    color: #fff;
    border: 0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-auto:hover:not(:disabled) {
    background: var(--ok);
  }

  .btn-auto:disabled,
  .btn-play:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sim-status {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--ink);
    text-align: center;
  }

  .sim-error-msg {
    font-size: 11px;
    color: var(--bad);
    text-align: center;
    margin: 4px 0;
    word-break: break-all;
    max-height: 48px;
    overflow: hidden;
  }

  .sim-status.no-entry {
    font-size: 15px;
    color: var(--warn);
    font-weight: 600;
  }

  .sim-final-score {
    margin: 6px 0 0;
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 4px;
  }

  .entry-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 16px;
  }

  .entry-label {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }

  .entry-score {
    font-size: 20px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 3px;
  }

  .game-actions.single {
    justify-content: center;
  }

  .btn-play {
    padding: 10px 20px;
    background: var(--ink-mute);
    color: var(--ink);
    border: 1px solid var(--ink-mid);
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-play:hover {
    background: var(--ink-mute);
  }
</style>
