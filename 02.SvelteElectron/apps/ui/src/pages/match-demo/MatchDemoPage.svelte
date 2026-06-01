<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import sceneConcept from "../../shared/assets/match-demo/stadium-scene-concept.png";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";
  import { seasonStore } from "../../shared/stores/season";
  import type { InteractiveMatchContext, InteractiveMatchResult } from "../../shared/types/season";

  export let matchContext: InteractiveMatchContext | null = null;
  export let onComplete: (result: InteractiveMatchResult) => void = () => {};
  export let onCancel: () => void = () => {};

  type PitchType = "fastball" | "slider" | "forkball";
  type WeatherType = "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
  type PitchResultCode =
    | "STRIKE_SWING"
    | "STRIKE_LOOK"
    | "BALL"
    | "FOUL"
    | "INPLAY_OUT"
    | "FIELDING_ERROR"
    | "HIT_SINGLE"
    | "HIT_DOUBLE"
    | "HIT_TRIPLE"
    | "HOME_RUN"
    | "WALK"
    | "GAME_OVER";

  interface SnapshotLike {
    inning: number;
    half: "top" | "bottom";
    outs: number;
    count: { balls: number; strikes: number };
    runners: { first: boolean; second: boolean; third: boolean };
    score: { home: number; away: number };
    pitchCount: number;
    pitchCountSinceEntry?: number;
    protagonistStamina?: number;
    protagonistMental?: number;
    currentBatter?: { name?: string; contact?: number; power?: number; eye?: number };
    weather?: WeatherType;
    isFinished?: boolean;
  }

  interface BatterTodayLine {
    ab: number;
    h: number;
    bb: number;
  }

  const WEATHER_LABEL: Record<WeatherType, string> = {
    sunny: "맑음",
    cloudy: "흐림",
    rainy: "비",
    windy_in: "맞바람",
    windy_out: "뒷바람",
  };

  const pitchButtons = [
    { type: "fastball" as PitchType, label: "직구", level: "LV 4" },
    { type: "slider" as PitchType, label: "슬라이더", level: "LV 3" },
    { type: "forkball" as PitchType, label: "포크", level: "LV 2" },
  ];

  let inning = "1회초";
  let score = { away: 0, home: 0 };
  let count = { balls: 0, strikes: 0, outs: 0 };
  let runners = { first: false, second: false, third: false };
  let awayTeamName = "원정팀";
  let homeTeamName = "홈팀";
  let weather = "맑음";
  let wind = "7m";
  let pitcherName = "투수";
  let batterName = "현재 타자";
  let batterBadge = "AVG .000";
  let pitchCount = 0;
  let stamina = 0;
  let mental = 0;
  let engineAvailable = false;
  let engineStarted = false;
  let engineBusy = false;
  let isAutoSimming = false;
  let isGameOver = false;
  let engineErrorMsg = "";
  let gameSummary = "";
  let currentSnapshot: SnapshotLike | null = null;
  let selectedPitchType: PitchType = "fastball";
  let selectedZone = 5;
  let resultBannerText = "READY";
  let resultBannerTone: "neutral" | "good" | "bad" = "neutral";
  let playTransitionVisible = false;
  let playTransitionText = "";
  let topviewVisible = false;
  let topviewResultText = "";
  let topviewBallClass = "to-center";
  let topviewFocusClass = "focus-center";
  let topviewRunnerAdvance = "";
  let pitcherPose: "idle" | "windup" | "release" | "follow" = "idle";
  let batterPose: "ready" | "swing" | "watch" = "ready";
  let catcherPose: "set" | "receive" | "frame" = "set";
  let umpirePose: "idle" | "strike" = "idle";
  let pitcherRoleBadge = "시즌";
  let pitcherInfoRows: Array<{ label: string; value: string }> = [];
  let batterDetailRows: Array<{ label: string; value: string }> = [];
  let batterTodayLines: Record<string, BatterTodayLine> = {};
  let zoneMarkerStyle = "";
  let pitchBallStyle = "";
  let totalStrikeouts = 0;
  let totalHitsAllowed = 0;
  let totalWalksAllowed = 0;
  let totalOutsRecorded = 0;
  let totalErrors = 0;

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") onCancel();
  }

  function refreshStaticPlayerInfo() {
    const state = get(gameStore) as any;
    const master = get(masterStore) as any;
    const season = get(seasonStore) as any;
    const player = state.player;

    pitcherName = player?.name ?? pitcherName;
    stamina = Math.round(player?.condition ?? stamina);
    mental = Math.round(player?.pitcherStats?.mentalResil ?? mental);

    const seasonStat = season?.stats?.[state?.protagonist?.id] ?? {};
    const seasonGames = Number(seasonStat.g ?? seasonStat.games ?? 0);
    const seasonWins = Number(seasonStat.w ?? seasonStat.wins ?? 0);
    const seasonLosses = Number(seasonStat.l ?? seasonStat.losses ?? 0);
    const seasonInnings = Number(seasonStat.ip ?? seasonStat.inningsPitched ?? 0);
    const seasonEra = Number(seasonStat.era ?? 0);
    const seasonStrikeouts = Number(seasonStat.so ?? seasonStat.k ?? seasonStat.strikeouts ?? 0);
    const seasonWalks = Number(seasonStat.bb ?? seasonStat.walks ?? 0);
    const seasonHomeRuns = Number(seasonStat.hr ?? seasonStat.homeRuns ?? 0);

    if (seasonGames > 0 || seasonInnings > 0) {
      pitcherRoleBadge = "시즌";
      pitcherInfoRows = [
        { label: "경기", value: String(seasonGames) },
        { label: "이닝", value: seasonInnings > 0 ? seasonInnings.toFixed(1) : "-" },
        { label: "승-패", value: `${seasonWins}-${seasonLosses}` },
        { label: "평균자책점", value: seasonEra > 0 ? seasonEra.toFixed(2) : "-" },
        { label: "탈삼진", value: String(seasonStrikeouts) },
        { label: "사사구", value: String(seasonWalks) },
        { label: "피홈런", value: String(seasonHomeRuns) },
      ];
    } else {
      pitcherRoleBadge = "투수 정보";
      pitcherInfoRows = [
        { label: "구속", value: String(Math.round(player?.pitcherStats?.velocity ?? 0)) },
        { label: "제구", value: String(Math.round(player?.pitcherStats?.command ?? 0)) },
        { label: "체력", value: String(Math.round(player?.pitcherStats?.staminaCap ?? 0)) },
        { label: "멘탈", value: String(Math.round(player?.pitcherStats?.mentalResil ?? 0)) },
        { label: "무브", value: String(Math.round(player?.pitcherStats?.movement ?? 0)) },
        { label: "견제", value: String(Math.round(player?.pitcherStats?.holdRunners ?? 0)) },
      ];
    }

    const teamById = new Map((master?.teams ?? []).map((team: any) => [team.id, team.name]));
    if (matchContext) {
      awayTeamName = teamById.get(matchContext.awayTeamId) ?? matchContext.awayTeamId;
      homeTeamName = teamById.get(matchContext.homeTeamId) ?? matchContext.homeTeamId;
    } else {
      homeTeamName = teamById.get(state?.protagonist?.teamId) ?? "홈팀";
      awayTeamName = "원정팀";
    }
  }

  function zoneToTarget(zone: number): { x: number; y: number } {
    const mapping: Record<number, { x: number; y: number }> = {
      7: { x: -0.67, y: -0.67 },
      8: { x: 0, y: -0.67 },
      9: { x: 0.67, y: -0.67 },
      4: { x: -0.67, y: 0 },
      5: { x: 0, y: 0 },
      6: { x: 0.67, y: 0 },
      1: { x: -0.67, y: 0.67 },
      2: { x: 0, y: 0.67 },
      3: { x: 0.67, y: 0.67 },
    };
    return mapping[zone] ?? mapping[5];
  }

  function zoneMarkerPosition(zone: number): { left: number; top: number } {
    const mapping: Record<number, { left: number; top: number }> = {
      7: { left: 18, top: 18 },
      8: { left: 45, top: 18 },
      9: { left: 72, top: 18 },
      4: { left: 18, top: 57 },
      5: { left: 45, top: 57 },
      6: { left: 72, top: 57 },
      1: { left: 18, top: 96 },
      2: { left: 45, top: 96 },
      3: { left: 72, top: 96 },
    };
    return mapping[zone] ?? mapping[5];
  }

  function landingToOverlay(x: number, y: number): { left: number; top: number } {
    return {
      left: 54 + x * 34,
      top: 65 + y * 42,
    };
  }

  function syncZoneVisuals(zone: number, landingTarget?: { x: number; y: number }) {
    const marker = zoneMarkerPosition(zone);
    zoneMarkerStyle = `left: calc(51.3% - 54px + ${marker.left}px); top: calc(53.7% + ${marker.top}px);`;
    if (landingTarget) {
      const ball = landingToOverlay(landingTarget.x, landingTarget.y);
      pitchBallStyle = `left: calc(51.3% - 54px + ${ball.left}px); top: calc(53.7% + ${ball.top}px);`;
    } else {
      pitchBallStyle = `left: calc(51.3% - 54px + ${marker.left}px); top: calc(53.7% + ${marker.top}px);`;
    }
  }

  function resultText(code: PitchResultCode): { text: string; tone: "neutral" | "good" | "bad" } {
    switch (code) {
      case "STRIKE_SWING":
        return { text: "SWING STRIKE", tone: "good" };
      case "STRIKE_LOOK":
        return { text: "STRIKE LOOKING", tone: "good" };
      case "BALL":
        return { text: "BALL", tone: "neutral" };
      case "FOUL":
        return { text: "FOUL", tone: "neutral" };
      case "INPLAY_OUT":
        return { text: "OUT", tone: "good" };
      case "FIELDING_ERROR":
        return { text: "ERROR", tone: "bad" };
      case "HIT_SINGLE":
        return { text: "SINGLE", tone: "bad" };
      case "HIT_DOUBLE":
        return { text: "DOUBLE", tone: "bad" };
      case "HIT_TRIPLE":
        return { text: "TRIPLE", tone: "bad" };
      case "HOME_RUN":
        return { text: "HOME RUN", tone: "bad" };
      case "WALK":
        return { text: "WALK", tone: "neutral" };
      default:
        return { text: "PLAY", tone: "neutral" };
    }
  }

  function isBallInPlayResult(code: PitchResultCode): boolean {
    return ["INPLAY_OUT", "FIELDING_ERROR", "HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"].includes(code);
  }

  function playTransitionLabel(code: PitchResultCode): string {
    switch (code) {
      case "INPLAY_OUT":
        return "타구 처리 화면 전환";
      case "FIELDING_ERROR":
        return "수비 실책 화면 전환";
      case "HIT_SINGLE":
      case "HIT_DOUBLE":
      case "HIT_TRIPLE":
        return "안타 장면 전환";
      case "HOME_RUN":
        return "홈런 장면 전환";
      default:
        return "플레이 장면 전환";
    }
  }

  function topviewMotionForResult(code: PitchResultCode) {
    switch (code) {
      case "INPLAY_OUT":
        return { ballClass: "to-short", focusClass: "focus-infield", runnerAdvance: "주자 정지 / 아웃 처리" };
      case "FIELDING_ERROR":
        return { ballClass: "to-third", focusClass: "focus-left", runnerAdvance: "실책으로 진루" };
      case "HIT_SINGLE":
        return { ballClass: "to-right", focusClass: "focus-right", runnerAdvance: "타자 1루 진루" };
      case "HIT_DOUBLE":
        return { ballClass: "to-gap-right", focusClass: "focus-right", runnerAdvance: "타자 2루 진루" };
      case "HIT_TRIPLE":
        return { ballClass: "to-gap-left", focusClass: "focus-left", runnerAdvance: "타자 3루 진루" };
      case "HOME_RUN":
        return { ballClass: "to-center-deep", focusClass: "focus-outfield", runnerAdvance: "홈런 / 전 주자 득점" };
      default:
        return { ballClass: "to-center", focusClass: "focus-center", runnerAdvance: "플레이 처리" };
    }
  }

  async function showTopview(resultCode: PitchResultCode) {
    topviewResultText = playTransitionLabel(resultCode);
    const motion = topviewMotionForResult(resultCode);
    topviewBallClass = motion.ballClass;
    topviewFocusClass = motion.focusClass;
    topviewRunnerAdvance = motion.runnerAdvance;
    topviewVisible = true;
    await new Promise((resolve) => setTimeout(resolve, 900));
    topviewVisible = false;
  }

  function outsDelta(prevOuts: number, nextOuts: number): number {
    if (nextOuts >= prevOuts) return nextOuts - prevOuts;
    return (3 - prevOuts) + nextOuts;
  }

  function applyOutcomeStats(code: PitchResultCode, prevOuts: number, nextOuts: number) {
    const gained = outsDelta(prevOuts, nextOuts);
    if (gained > 0) totalOutsRecorded += gained;
    if ((code === "STRIKE_SWING" || code === "STRIKE_LOOK") && gained > 0) totalStrikeouts += 1;
    if (["HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"].includes(code)) totalHitsAllowed += 1;
    if (code === "WALK") totalWalksAllowed += 1;
    if (code === "FIELDING_ERROR") totalErrors += 1;
  }

  function applyBatchStats(batchStats: { hits: number; walks: number; errors: number } | null | undefined) {
    if (!batchStats) return;
    totalHitsAllowed += Math.max(0, batchStats.hits ?? 0);
    totalWalksAllowed += Math.max(0, batchStats.walks ?? 0);
    totalErrors += Math.max(0, batchStats.errors ?? 0);
  }

  function getBatterTodayLine(name: string): BatterTodayLine {
    return batterTodayLines[name] ?? { ab: 0, h: 0, bb: 0 };
  }

  function formatTodayAverage(line: BatterTodayLine): string {
    if (line.ab <= 0) return ".000";
    return (line.h / line.ab).toFixed(3).replace(/^0/, "");
  }

  function recordBatterOutcome(name: string, code: PitchResultCode, prevOuts: number, nextOuts: number) {
    if (!name) return;
    const gained = outsDelta(prevOuts, nextOuts);
    const current = getBatterTodayLine(name);
    const next = { ...current };

    if ((code === "STRIKE_SWING" || code === "STRIKE_LOOK") && gained > 0) {
      next.ab += 1;
    } else if (code === "INPLAY_OUT") {
      next.ab += 1;
    } else if (["HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"].includes(code)) {
      next.ab += 1;
      next.h += 1;
    } else if (code === "WALK") {
      next.bb += 1;
    }

    batterTodayLines = {
      ...batterTodayLines,
      [name]: next,
    };
  }

  function applySnapshot(snapshot: SnapshotLike) {
    currentSnapshot = snapshot;
    score = { away: snapshot.score.away, home: snapshot.score.home };
    count = { balls: snapshot.count.balls, strikes: snapshot.count.strikes, outs: snapshot.outs };
    runners = { first: snapshot.runners.first, second: snapshot.runners.second, third: snapshot.runners.third };
    inning = `${snapshot.inning}회${snapshot.half === "top" ? "초" : "말"}`;
    pitchCount = snapshot.pitchCountSinceEntry ?? snapshot.pitchCount;
    stamina = Math.round(snapshot.protagonistStamina ?? stamina);
    mental = Math.round(snapshot.protagonistMental ?? mental);
    if (snapshot.weather) weather = WEATHER_LABEL[snapshot.weather] ?? weather;
    if (snapshot.currentBatter?.name) batterName = snapshot.currentBatter.name;

    const batterLine = getBatterTodayLine(batterName);
    batterBadge = `AVG ${formatTodayAverage(batterLine)}`;
    batterDetailRows = [
      { label: "오늘 기록", value: `${batterLine.ab}타수 ${batterLine.h}안타` },
      { label: "볼넷", value: String(batterLine.bb) },
    ];

    if (snapshot.isFinished) isGameOver = true;
  }

  async function handleGameOver() {
    if (!window.projectB?.matchFinish || isAutoSimming) return;
    try {
      const result = await window.projectB.matchFinish();
      if (result?.snapshot) applySnapshot(result.snapshot as SnapshotLike);
      gameSummary = result?.summary ?? "";
      resultBannerText = "FINAL";
      resultBannerTone = "neutral";

      if (matchContext) {
        onComplete({
          scheduleId: matchContext.scheduleId,
          week: matchContext.week,
          homeTeamId: matchContext.homeTeamId,
          awayTeamId: matchContext.awayTeamId,
          homeScore: score.home,
          awayScore: score.away,
          strikeouts: totalStrikeouts,
          hitsAllowed: totalHitsAllowed,
          walksAllowed: totalWalksAllowed,
          outsRecorded: totalOutsRecorded,
          errors: totalErrors,
          pitchCount,
          summary: gameSummary,
        });
      }
    } catch (error) {
      engineErrorMsg = `종료 처리 실패: ${String((error as Error)?.message ?? error)}`;
    }
  }

  async function runAutoInnings() {
    if (!window.projectB?.matchNextInning || isAutoSimming || !engineStarted) return;
    isAutoSimming = true;
    try {
      const prevOuts = count.outs;
      const response = await window.projectB.matchNextInning();
      if (response?.snapshot) applySnapshot(response.snapshot as SnapshotLike);
      totalOutsRecorded += 3 - prevOuts;
      applyBatchStats(response?.batchStats);
      if (response?.snapshot?.isFinished) await handleGameOver();
    } catch (error) {
      engineErrorMsg = `자동 진행 실패: ${String((error as Error)?.message ?? error)}`;
    } finally {
      isAutoSimming = false;
    }
  }

  async function throwPitch(zone: number) {
    if (!window.projectB?.matchStep || !engineAvailable || !engineStarted || engineBusy) return;

    engineBusy = true;
    selectedZone = zone;
    const prevOuts = count.outs;
    const batterAtPitch = batterName;
    pitcherPose = "windup";
    batterPose = "ready";
    catcherPose = "set";
    umpirePose = "idle";

    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      pitcherPose = "release";

      const response = await window.projectB.matchStep({
        pitchType: selectedPitchType,
        location: zone as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
        target: zoneToTarget(zone),
        strategy: "balanced",
        power: "normal",
      });

      if (response?.snapshot) applySnapshot(response.snapshot as SnapshotLike);
      if (response?.outcome?.resultCode) {
        const code = response.outcome.resultCode as PitchResultCode;
        const nextBanner = resultText(code);
        resultBannerText = nextBanner.text;
        resultBannerTone = nextBanner.tone;

        applyOutcomeStats(code, prevOuts, (response?.snapshot as SnapshotLike | undefined)?.outs ?? prevOuts);
        recordBatterOutcome(batterAtPitch, code, prevOuts, (response?.snapshot as SnapshotLike | undefined)?.outs ?? prevOuts);

        batterPose = ["STRIKE_SWING", "FOUL", "INPLAY_OUT", "HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"].includes(code) ? "swing" : "watch";
        catcherPose = code === "STRIKE_LOOK" || code === "BALL" || code === "WALK" ? "receive" : "frame";
        umpirePose = code === "STRIKE_LOOK" || code === "STRIKE_SWING" ? "strike" : "idle";

        if (isBallInPlayResult(code)) {
          playTransitionText = playTransitionLabel(code);
          playTransitionVisible = true;
          await new Promise((resolve) => setTimeout(resolve, 420));
          playTransitionVisible = false;
          await showTopview(code);
        }
      }

      syncZoneVisuals(zone, response?.outcome?.landingTarget);
      pitcherPose = "follow";
      if (response?.snapshot?.isFinished) await handleGameOver();
    } catch (error) {
      engineErrorMsg = `투구 실패: ${String((error as Error)?.message ?? error)}`;
      resultBannerText = "ERROR";
      resultBannerTone = "bad";
    } finally {
      setTimeout(() => {
        pitcherPose = "idle";
        batterPose = "ready";
        catcherPose = "set";
        umpirePose = "idle";
      }, 260);
      engineBusy = false;
    }
  }

  async function initMatchEngine() {
    if (!window.projectB?.matchStart) {
      engineAvailable = false;
      engineErrorMsg = "매치 엔진을 사용할 수 없습니다.";
      return;
    }

    try {
      const state = get(gameStore) as any;
      if (get(masterStore).entities.length === 0) {
        await masterStore.loadEntities(state.protagonist.leagueId);
      }

      const isHome = !matchContext || matchContext.protagonistTeamId === matchContext.homeTeamId;
      const player = state.player;

      const response = await window.projectB.matchStart({
        initialStamina: player.condition,
        initialMental: 74,
        pitcher: { ...player.pitcherStats, name: player.name },
        weather: "sunny",
        park: "neutral",
        role: (matchContext?.role ?? "SP") as "SP" | "RP" | "CP",
        protagonistSide: isHome ? "home" : "away",
        ...(matchContext?.entryTrigger ? { entryTrigger: matchContext.entryTrigger } : {}),
      });

      refreshStaticPlayerInfo();
      engineAvailable = true;
      engineStarted = true;
      engineErrorMsg = "";
      applySnapshot(response.snapshot as SnapshotLike);
      syncZoneVisuals(selectedZone);
      resultBannerText = "READY";
      resultBannerTone = "neutral";
      isGameOver = false;
      gameSummary = "";
      batterTodayLines = {};
      totalStrikeouts = 0;
      totalHitsAllowed = 0;
      totalWalksAllowed = 0;
      totalOutsRecorded = 0;
      totalErrors = 0;
    } catch (error) {
      engineAvailable = false;
      engineStarted = false;
      engineErrorMsg = `연결 실패: ${String((error as Error)?.message ?? error)}`;
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    void initMatchEngine();
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
</script>

<section class="demo-match-screen" aria-label="match engine demo screen">
  <div class="viewport">
    <div class="scoreboard-overlay">
      <div class="scorebar">
        <div class="club away">
          <span class="club-name">{awayTeamName}</span>
          <strong class="runs">{score.away}</strong>
        </div>
        <div class="center-meta">
          <strong>{inning}</strong>
          <span>{weather}</span>
          <span>{wind}</span>
        </div>
        <div class="club home">
          <strong class="runs">{score.home}</strong>
          <span class="club-name">{homeTeamName}</span>
        </div>
      </div>
    </div>

    <section class="game-info-card" aria-label="game info summary">
      <div class="game-info-top">
        <div class="mini-diamond">
          <span class="base second" class:active={runners.second}></span>
          <span class="base third" class:active={runners.third}></span>
          <span class="base first" class:active={runners.first}></span>
          <span class="base home"></span>
        </div>
        <div class="count-lamps">
          <div class="count-row"><span class="count-label">B</span><i class:active-ball={count.balls >= 1}></i><i class:active-ball={count.balls >= 2}></i><i class:active-ball={count.balls >= 3}></i></div>
          <div class="count-row"><span class="count-label">S</span><i class:active-strike={count.strikes >= 1}></i><i class:active-strike={count.strikes >= 2}></i></div>
          <div class="count-row"><span class="count-label">O</span><i class:active-out={count.outs >= 1}></i><i class:active-out={count.outs >= 2}></i></div>
        </div>
      </div>
      <div class="info-divider"></div>
      <section class="compact-row"><span class="compact-name">{pitcherName}</span><span class="compact-stat">P {pitchCount}</span></section>
      <section class="compact-row"><span class="compact-name">{batterName}</span><span class="compact-stat">{batterBadge}</span></section>
      <div class="info-divider"></div>
      {#each batterDetailRows as row}
        <section class="compact-row batter-detail-row"><span class="compact-name">{row.label}</span><span class="compact-stat">{row.value}</span></section>
      {/each}
    </section>

    <section class="player-card pitcher-card" aria-label="pitcher info">
      <header>
        <div class="team-mark">
          <span class="team-badge">PITCHER</span>
          <strong>{pitcherName}</strong>
        </div>
        <span class="role-badge">{pitcherRoleBadge}</span>
      </header>
      <div class="season-table">
        {#each pitcherInfoRows as stat}
          <div class="season-row">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        {/each}
      </div>
    </section>

    <img class="scene-image" src={sceneConcept} alt="도트 경기장 데모 화면" />

    <div class="sprite-layer" aria-hidden="true">
      <div class={`sprite pitcher-sprite pose-${pitcherPose}`}><span class="sprite-label">P</span></div>
      <div class={`sprite catcher-sprite pose-${catcherPose}`}><span class="sprite-label">C</span></div>
      <div class={`sprite umpire-sprite pose-${umpirePose}`}><span class="sprite-label">U</span></div>
      <div class={`sprite batter-sprite pose-${batterPose}`}><span class="sprite-label">B</span></div>
    </div>

    <div class="strike-zone" aria-hidden="true"></div>
    <div class="zone-grid" aria-label="pitch target">
      {#each [7, 8, 9, 4, 5, 6, 1, 2, 3] as zone}
        <button type="button" class:selected={selectedZone === zone} on:click={() => void throwPitch(zone)} aria-label={`zone ${zone}`}></button>
      {/each}
    </div>
    <div class="pitch-ball" aria-hidden="true" style={pitchBallStyle}></div>
    <div class="zone-marker" aria-hidden="true" style={zoneMarkerStyle}></div>

    <div class="pitch-cluster" aria-label="pitch selection">
      {#each pitchButtons as pitch}
        <button type="button" class:active={selectedPitchType === pitch.type} on:click={() => { selectedPitchType = pitch.type; }}>
          <span class="pitch-name">{pitch.label}</span>
          <span class="pitch-level">{pitch.level}</span>
        </button>
      {/each}
    </div>

    {#if playTransitionVisible}
      <div class="play-transition" aria-label="in-play transition">
        <strong>{playTransitionText}</strong>
        <span>탑뷰 처리 화면으로 전환 중</span>
      </div>
    {/if}

    {#if topviewVisible}
      <div class="topview-overlay" aria-label="topview play scene">
        <div class="topview-card">
          <div class="topview-header">
            <strong>탑뷰 처리 화면</strong>
            <span>{topviewResultText}</span>
          </div>
          <div class="topview-field">
            <div class={`diamond-lines ${topviewFocusClass}`}></div>
            <span class="base top second" class:active={runners.second}></span>
            <span class="base top third" class:active={runners.third}></span>
            <span class="base top first" class:active={runners.first}></span>
            <span class="base top home active"></span>
            <div class={`fielder pitcher-pos ${topviewFocusClass}`}>P</div>
            <div class={`fielder catcher-pos ${topviewFocusClass}`}>C</div>
            <div class={`fielder first-pos ${topviewFocusClass}`}>1B</div>
            <div class={`fielder second-pos ${topviewFocusClass}`}>2B</div>
            <div class={`fielder short-pos ${topviewFocusClass}`}>SS</div>
            <div class={`fielder third-pos ${topviewFocusClass}`}>3B</div>
            <div class={`fielder left-pos ${topviewFocusClass}`}>LF</div>
            <div class={`fielder center-pos ${topviewFocusClass}`}>CF</div>
            <div class={`fielder right-pos ${topviewFocusClass}`}>RF</div>
            <div class={`ball-path ${topviewBallClass}`}></div>
            <div class={`runner-chip runner-batter ${topviewBallClass}`}>타자</div>
            {#if runners.first}<div class="runner-chip runner-first">1루</div>{/if}
            {#if runners.second}<div class="runner-chip runner-second">2루</div>{/if}
            {#if runners.third}<div class="runner-chip runner-third">3루</div>{/if}
          </div>
          <div class="topview-footer"><span>{topviewRunnerAdvance}</span></div>
        </div>
      </div>
    {/if}

    <div class="result-banner" data-tone={resultBannerTone}>{resultBannerText}</div>

    <div class="status-gauges" aria-label="pitcher condition">
      <div class="gauge-card">
        <div class="gauge-head"><span>체력</span><strong>{stamina}</strong></div>
        <div class="gauge-track"><div class="gauge-fill stamina" style={`width: ${Math.max(0, Math.min(100, stamina))}%;`}></div></div>
      </div>
      <div class="gauge-card">
        <div class="gauge-head"><span>멘탈</span><strong>{mental}</strong></div>
        <div class="gauge-track"><div class="gauge-fill mental" style={`width: ${Math.max(0, Math.min(100, mental))}%;`}></div></div>
      </div>
    </div>

    <div class="utility-buttons">
      <button type="button" on:click={() => void runAutoInnings()} disabled={!engineStarted || isAutoSimming || isGameOver}>자동진행</button>
      <button type="button" on:click={() => void handleGameOver()} disabled={!engineStarted}>경기종료</button>
    </div>

    {#if !engineAvailable && engineErrorMsg}
      <div class="engine-state error">{engineErrorMsg}</div>
    {:else if engineStarted && currentSnapshot}
      <div class="engine-state ok">{isGameOver ? (gameSummary || "경기 종료") : "엔진 준비 완료"}</div>
    {/if}
  </div>
</section>

<style>
  .demo-match-screen { min-height: 100vh; background: radial-gradient(circle at top, rgba(55, 92, 160, 0.18), transparent 24%), linear-gradient(180deg, #0b1017 0%, #08111d 38%, #050a12 100%); color: #edf3ff; }
  .viewport { position: relative; min-height: 100vh; overflow: hidden; }
  .scene-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
  .scoreboard-overlay, .game-info-card, .player-card, .sprite-layer, .strike-zone, .zone-grid, .pitch-ball, .zone-marker, .pitch-cluster, .play-transition, .topview-overlay, .result-banner, .status-gauges, .utility-buttons, .engine-state { position: absolute; z-index: 3; }
  .scoreboard-overlay { top: 0; left: 0; right: 0; padding: 14px 18px 0; }
  .scorebar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; padding: 12px 18px; background: linear-gradient(180deg, rgba(10, 14, 22, 0.92), rgba(17, 24, 36, 0.78)); border: 1px solid rgba(123, 147, 194, 0.24); border-radius: 18px; box-shadow: 0 16px 34px rgba(0, 0, 0, 0.34); backdrop-filter: blur(10px); }
  .club { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .club.home { justify-content: flex-end; }
  .club-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 16px; color: #edf3ff; }
  .runs { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 12px; font-size: 24px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(151, 170, 204, 0.22); }
  .center-meta { display: flex; align-items: center; gap: 12px; color: #b8c7e7; font-size: 13px; }
  .center-meta strong { font-size: 24px; color: #ffffff; line-height: 1; }
  .game-info-card { top: 92px; right: 18px; display: grid; gap: 12px; width: 156px; padding: 14px 12px 12px; border-radius: 18px; background: linear-gradient(180deg, rgba(250, 252, 255, 0.96), rgba(236, 243, 252, 0.92)); border: 1px solid rgba(98, 135, 198, 0.24); box-shadow: 0 14px 28px rgba(0, 0, 0, 0.28); backdrop-filter: blur(10px); color: #172235; }
  .game-info-card::before, .player-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #d61f2c, #f25757); }
  .game-info-top { display: grid; justify-items: center; gap: 12px; }
  .mini-diamond { position: relative; width: 62px; height: 62px; justify-self: center; background: rgba(16, 26, 41, 0.03); }
  .mini-diamond::before { content: ""; position: absolute; inset: 9px; transform: rotate(45deg); border: 1px solid rgba(82, 104, 146, 0.24); border-radius: 8px; }
  .mini-diamond .base, .base.top { position: absolute; width: 12px; height: 12px; border: 1px solid rgba(94, 110, 142, 0.35); background: rgba(255, 255, 255, 0.72); transform: rotate(45deg); z-index: 1; }
  .mini-diamond .base.active, .base.top.active { background: #ffd85a; border-color: #fff0a2; }
  .mini-diamond .second { top: 3px; left: 25px; } .mini-diamond .third { top: 25px; left: 3px; } .mini-diamond .first { top: 25px; right: 3px; } .mini-diamond .home { bottom: 3px; left: 25px; }
  .count-lamps { display: grid; gap: 8px; width: 100%; }
  .count-row { display: flex; align-items: center; gap: 6px; justify-content: flex-start; }
  .count-label { width: 16px; font-weight: 700; color: #42536f; font-size: 12px; }
  .count-row i { display: inline-block; width: 12px; height: 12px; border-radius: 999px; background: rgba(87, 106, 140, 0.14); border: 1px solid rgba(87, 106, 140, 0.1); }
  .count-row i.active-ball { background: #38d96f; border-color: #9af0b4; box-shadow: 0 0 10px rgba(56, 217, 111, 0.5); }
  .count-row i.active-strike { background: #ffd85a; border-color: #fff0a2; box-shadow: 0 0 10px rgba(255, 216, 90, 0.52); }
  .count-row i.active-out { background: #ff5d67; border-color: #ffb2b8; box-shadow: 0 0 10px rgba(255, 93, 103, 0.52); }
  .info-divider { height: 1px; background: rgba(19, 33, 56, 0.08); }
  .compact-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 0; }
  .compact-name { min-width: 0; font-size: 11px; color: #2a3850; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .compact-stat { flex: 0 0 auto; font-size: 12px; font-weight: 700; color: #192539; }
  .player-card { width: 300px; padding: 14px 16px 16px; border-radius: 18px; background: linear-gradient(180deg, rgba(250, 252, 255, 0.96), rgba(236, 243, 252, 0.92)); border: 1px solid rgba(98, 135, 198, 0.24); color: #172235; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24); backdrop-filter: blur(8px); overflow: hidden; }
  .pitcher-card { top: 136px; left: 22px; }
  .player-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .team-mark { display: grid; gap: 6px; }
  .team-badge { width: fit-content; padding: 4px 8px; border-radius: 999px; background: rgba(214, 31, 44, 0.12); color: #b51e2a; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; }
  .player-card header strong { font-size: 20px; color: #1a2334; }
  .role-badge { font-size: 11px; padding: 5px 9px; border-radius: 999px; background: rgba(214, 31, 44, 0.1); color: #b71d29; }
  .season-table { display: grid; gap: 6px; }
  .season-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; padding: 7px 2px; border-bottom: 1px solid rgba(19, 33, 56, 0.08); }
  .season-row:last-child { border-bottom: 0; padding-bottom: 0; }
  .season-row span { font-size: 12px; color: #506079; }
  .season-row strong { font-size: 14px; color: #162236; }
  .sprite-layer { inset: 0; pointer-events: none; z-index: 2; }
  .sprite { position: absolute; display: grid; place-items: center; border-radius: 14px; border: 2px solid rgba(255, 255, 255, 0.18); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28); transition: transform 180ms ease, filter 180ms ease, opacity 180ms ease; opacity: 0.92; }
  .sprite::after { content: ""; position: absolute; inset: auto 14% -10px; height: 12px; border-radius: 999px; background: rgba(5, 10, 18, 0.28); filter: blur(6px); transform: scaleX(0.9); z-index: -1; }
  .sprite-label { font-size: 12px; font-weight: 800; color: rgba(255, 255, 255, 0.92); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
  .pitcher-sprite { left: 31.6%; bottom: 12.6%; width: 58px; height: 122px; background: linear-gradient(180deg, rgba(24, 52, 96, 0.88), rgba(12, 25, 48, 0.9)); border-color: rgba(121, 173, 255, 0.28); transform-origin: 50% 85%; }
  .pitcher-sprite.pose-windup { transform: translateY(-4px) rotate(-7deg) scale(1.02); }
  .pitcher-sprite.pose-release { transform: translate(8px, -8px) rotate(6deg) scale(1.04); filter: brightness(1.12) saturate(1.08); }
  .pitcher-sprite.pose-release::after { transform: scaleX(1.1); opacity: 0.7; }
  .pitcher-sprite.pose-follow { transform: translate(10px, 2px) rotate(8deg); filter: brightness(1.04); }
  .catcher-sprite { left: 50.3%; top: 58.6%; width: 34px; height: 46px; background: linear-gradient(180deg, rgba(35, 60, 98, 0.9), rgba(15, 26, 45, 0.92)); border-color: rgba(139, 186, 255, 0.24); transform: translateX(-50%); }
  .catcher-sprite.pose-receive { transform: translateX(-50%) translateY(-4px) scale(1.04); filter: brightness(1.08); }
  .catcher-sprite.pose-frame { transform: translateX(-50%) scale(1.06); filter: brightness(1.04); }
  .umpire-sprite { left: 53.2%; top: 57.2%; width: 28px; height: 56px; background: linear-gradient(180deg, rgba(44, 44, 48, 0.92), rgba(20, 20, 24, 0.94)); border-color: rgba(170, 170, 176, 0.18); transform: translateX(-50%); }
  .umpire-sprite.pose-strike { transform: translateX(-50%) translateY(-6px) scale(1.02); filter: brightness(1.12); }
  .batter-sprite { left: 58.8%; top: 56.7%; width: 46px; height: 94px; background: linear-gradient(180deg, rgba(150, 34, 34, 0.92), rgba(86, 18, 18, 0.94)); border-color: rgba(255, 166, 166, 0.22); transform-origin: 50% 85%; }
  .batter-sprite.pose-swing { transform: translate(-8px, -4px) rotate(-11deg) scale(1.03); filter: brightness(1.08) saturate(1.08); }
  .batter-sprite.pose-watch { transform: translateX(2px) scale(1.02); }
  .strike-zone { left: 51.3%; top: 53.7%; width: 108px; height: 130px; transform: translateX(-50%); border: 2px solid rgba(235, 243, 255, 0.82); box-shadow: 0 0 0 1px rgba(83, 123, 191, 0.45), inset 0 0 24px rgba(90, 162, 255, 0.08); background: linear-gradient(90deg, transparent 32%, rgba(255, 255, 255, 0.22) 33%, rgba(255, 255, 255, 0.22) 35%, transparent 36%, transparent 64%, rgba(255, 255, 255, 0.22) 65%, rgba(255, 255, 255, 0.22) 67%, transparent 68%), linear-gradient(180deg, transparent 32%, rgba(255, 255, 255, 0.22) 33%, rgba(255, 255, 255, 0.22) 35%, transparent 36%, transparent 64%, rgba(255, 255, 255, 0.22) 65%, rgba(255, 255, 255, 0.22) 67%, transparent 68%); }
  .zone-grid { left: 51.3%; top: 53.7%; width: 108px; height: 130px; transform: translateX(-50%); display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); z-index: 4; }
  .zone-grid button { background: transparent; border: 0; cursor: pointer; }
  .zone-grid button.selected { box-shadow: inset 0 0 0 1px rgba(255, 219, 109, 0.4); }
  .pitch-ball { width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffffff 0%, #f7f3ef 44%, #d7deed 100%); box-shadow: 0 0 22px rgba(255, 255, 255, 0.58); animation: pitchBallPulse 880ms ease-in-out infinite; }
  .zone-marker { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #ffdb6d; box-shadow: 0 0 0 4px rgba(255, 219, 109, 0.14); animation: zoneMarkerPulse 1400ms ease-in-out infinite; }
  .pitch-cluster { left: 15%; bottom: 24%; display: grid; gap: 10px; width: 132px; }
  .pitch-cluster button, .utility-buttons button { display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid rgba(255, 211, 91, 0.26); background: rgba(11, 17, 28, 0.72); color: #f6d76b; border-radius: 16px; padding: 11px 14px; box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22); backdrop-filter: blur(7px); cursor: pointer; }
  .pitch-cluster button.active { background: rgba(82, 50, 8, 0.86); color: #fff0a6; border-color: rgba(255, 211, 91, 0.6); transform: translateX(12px); }
  .pitch-name { font-size: 14px; font-weight: 700; }
  .pitch-level { font-size: 12px; color: #c0ddff; }
  .play-transition { left: 50%; top: 46%; transform: translate(-50%, -50%); display: grid; gap: 6px; justify-items: center; min-width: 240px; padding: 16px 18px; border-radius: 18px; background: rgba(8, 14, 24, 0.82); border: 1px solid rgba(130, 172, 243, 0.24); box-shadow: 0 18px 42px rgba(0, 0, 0, 0.32); backdrop-filter: blur(10px); animation: transitionCardIn 220ms ease-out; }
  .play-transition strong { font-size: 16px; color: #f4f8ff; }
  .play-transition span { font-size: 12px; color: #b8c8e8; letter-spacing: 0.04em; }
  .topview-overlay { inset: 0; display: grid; place-items: center; background: rgba(4, 8, 14, 0.42); backdrop-filter: blur(6px); z-index: 5; }
  .topview-card { width: min(420px, calc(100vw - 40px)); padding: 16px; border-radius: 22px; background: linear-gradient(180deg, rgba(246, 250, 255, 0.97), rgba(228, 237, 249, 0.94)); border: 1px solid rgba(110, 136, 180, 0.24); box-shadow: 0 24px 54px rgba(0, 0, 0, 0.32); color: #182438; animation: topviewCardIn 260ms ease-out; }
  .topview-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .topview-header strong { font-size: 18px; }
  .topview-header span { font-size: 12px; padding: 6px 10px; border-radius: 999px; background: rgba(214, 31, 44, 0.1); color: #b51e2a; }
  .topview-field { position: relative; height: 300px; border-radius: 18px; overflow: hidden; background: radial-gradient(circle at 50% 78%, #b9824f 0 18%, transparent 18.4%), radial-gradient(circle at 50% 45%, #d29e67 0 8%, transparent 8.4%), linear-gradient(180deg, #3e8f4d 0%, #2f7d41 100%); box-shadow: inset 0 0 0 1px rgba(20, 38, 27, 0.12); }
  .diamond-lines { position: absolute; left: 50%; top: 50%; width: 140px; height: 140px; transform: translate(-50%, -50%) rotate(45deg); border: 3px solid rgba(243, 245, 235, 0.96); transition: transform 180ms ease, box-shadow 180ms ease; }
  .diamond-lines.focus-infield { box-shadow: 0 0 0 8px rgba(255, 216, 90, 0.08); }
  .diamond-lines.focus-left { transform: translate(-54%, -50%) rotate(45deg); }
  .diamond-lines.focus-right { transform: translate(-46%, -50%) rotate(45deg); }
  .diamond-lines.focus-outfield { transform: translate(-50%, -46%) rotate(45deg); }
  .base.top.second { left: calc(50% - 7px); top: 52px; } .base.top.third { left: calc(50% - 78px); top: 123px; } .base.top.first { left: calc(50% + 64px); top: 123px; } .base.top.home { left: calc(50% - 7px); top: 194px; }
  .fielder { position: absolute; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 999px; background: rgba(16, 34, 63, 0.9); color: #f5f8ff; font-size: 10px; font-weight: 800; box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2); transition: transform 180ms ease, filter 180ms ease; }
  .fielder.focus-infield { filter: brightness(1.12); }
  .first-pos.focus-right, .second-pos.focus-right, .right-pos.focus-right, .center-pos.focus-right { transform: scale(1.08); filter: brightness(1.14); }
  .third-pos.focus-left, .short-pos.focus-left, .left-pos.focus-left, .center-pos.focus-left { transform: scale(1.08); filter: brightness(1.14); }
  .center-pos.focus-outfield, .left-pos.focus-outfield, .right-pos.focus-outfield { transform: translateY(-4px) scale(1.08); filter: brightness(1.16); }
  .pitcher-pos { left: calc(50% - 15px); top: 124px; } .catcher-pos { left: calc(50% - 15px); top: 222px; } .first-pos { left: calc(50% + 102px); top: 132px; } .second-pos { left: calc(50% + 38px); top: 82px; } .short-pos { left: calc(50% - 72px); top: 82px; } .third-pos { left: calc(50% - 136px); top: 132px; } .left-pos { left: calc(50% - 124px); top: 34px; } .center-pos { left: calc(50% - 15px); top: 8px; } .right-pos { left: calc(50% + 94px); top: 34px; }
  .ball-path { position: absolute; left: calc(50% + 8px); top: 144px; width: 108px; height: 3px; transform: rotate(-26deg); transform-origin: left center; background: linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,217,90,0.4), transparent); box-shadow: 0 0 10px rgba(255, 221, 131, 0.45); transition: transform 180ms ease, width 180ms ease, left 180ms ease, top 180ms ease; animation: ballPathPulse 520ms ease-in-out infinite; }
  .ball-path.to-short { width: 72px; left: calc(50% - 4px); top: 148px; transform: rotate(-138deg); }
  .ball-path.to-third { width: 102px; left: calc(50% - 8px); top: 154px; transform: rotate(-162deg); }
  .ball-path.to-right { width: 110px; left: calc(50% + 8px); top: 144px; transform: rotate(-26deg); }
  .ball-path.to-gap-right { width: 150px; left: calc(50% + 8px); top: 142px; transform: rotate(-38deg); }
  .ball-path.to-gap-left { width: 150px; left: calc(50% - 6px); top: 144px; transform: rotate(-144deg); }
  .ball-path.to-center { width: 118px; left: calc(50% + 2px); top: 142px; transform: rotate(-90deg); }
  .ball-path.to-center-deep { width: 170px; left: calc(50% + 2px); top: 142px; transform: rotate(-90deg); }
  .runner-chip { position: absolute; padding: 4px 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.86); color: #172235; font-size: 10px; font-weight: 700; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.14); }
  .runner-batter { left: calc(50% - 16px); top: 220px; transition: transform 220ms ease, left 220ms ease, top 220ms ease; }
  .runner-batter.to-right { left: calc(50% + 78px); top: 164px; }
  .runner-batter.to-gap-right { left: calc(50% + 18px); top: 102px; }
  .runner-batter.to-gap-left { left: calc(50% - 58px); top: 102px; }
  .runner-batter.to-center-deep { left: calc(50% - 16px); top: 36px; }
  .runner-batter.to-short, .runner-batter.to-third { left: calc(50% + 18px); top: 196px; }
  .runner-first { left: calc(50% + 84px); top: 154px; } .runner-second { left: calc(50% - 16px); top: 84px; } .runner-third { left: calc(50% - 116px); top: 154px; }
  .topview-footer { margin-top: 12px; color: #53627c; font-size: 12px; text-align: center; }
  .result-banner { left: 50%; bottom: 26px; transform: translateX(-50%); padding: 12px 22px; border-radius: 999px; background: rgba(8, 13, 22, 0.74); border: 1px solid rgba(96, 160, 255, 0.26); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28); backdrop-filter: blur(6px); color: #dbe9ff; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; }
  .result-banner[data-tone="good"] { border-color: rgba(92, 236, 145, 0.35); color: #d8ffe7; }
  .result-banner[data-tone="bad"] { border-color: rgba(255, 123, 123, 0.35); color: #ffd9d9; }
  .status-gauges { left: 52%; bottom: 108px; transform: translateX(-50%); display: grid; gap: 10px; width: 224px; }
  .gauge-card { padding: 10px 12px; border-radius: 14px; background: rgba(8, 15, 25, 0.58); border: 1px solid rgba(144, 174, 231, 0.18); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22); backdrop-filter: blur(6px); }
  .gauge-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
  .gauge-head span { font-size: 12px; color: #c7d7f6; } .gauge-head strong { font-size: 13px; color: #f4f8ff; }
  .gauge-track { height: 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
  .gauge-fill { height: 100%; border-radius: 999px; }
  .gauge-fill.stamina { background: linear-gradient(90deg, #33d17a, #92f2b6); }
  .gauge-fill.mental { background: linear-gradient(90deg, #56a8ff, #a9d1ff); }
  .utility-buttons { right: 18px; bottom: 28px; display: flex; gap: 10px; }
  .engine-state { left: 18px; bottom: 18px; padding: 8px 12px; border-radius: 999px; font-size: 12px; backdrop-filter: blur(6px); }
  .engine-state.ok { background: rgba(35, 92, 58, 0.76); border: 1px solid rgba(124, 224, 166, 0.3); color: #d4ffe4; }
  .engine-state.error { background: rgba(89, 24, 29, 0.78); border: 1px solid rgba(255, 129, 138, 0.28); color: #ffd7db; }
  @keyframes zoneMarkerPulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 4px rgba(255, 219, 109, 0.14); }
    50% { transform: scale(1.08); box-shadow: 0 0 0 8px rgba(255, 219, 109, 0.18); }
  }
  @keyframes pitchBallPulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 16px rgba(255, 255, 255, 0.45); }
    50% { transform: scale(1.08); box-shadow: 0 0 24px rgba(255, 255, 255, 0.64); }
  }
  @keyframes transitionCardIn {
    0% { opacity: 0; transform: translate(-50%, -46%) scale(0.96); }
    100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes topviewCardIn {
    0% { opacity: 0; transform: translateY(12px) scale(0.97); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes ballPathPulse {
    0%, 100% { opacity: 0.78; }
    50% { opacity: 1; }
  }
  @media (max-width: 980px) {
    .scorebar { grid-template-columns: 1fr; justify-items: center; }
    .club, .club.home { justify-content: center; }
    .game-info-card { top: 150px; }
    .pitch-cluster { left: 18px; bottom: 162px; }
    .utility-buttons { right: 12px; }
    .status-gauges { left: 50%; bottom: 104px; width: 216px; }
    .pitcher-sprite { left: 30.2%; }
    .batter-sprite { left: 60%; }
    .topview-card { width: min(400px, calc(100vw - 32px)); }
    .play-transition { top: 44%; }
  }
  @media (max-width: 720px) {
    .scoreboard-overlay { padding: 10px 10px 0; }
    .scorebar { padding: 10px 12px; gap: 10px; }
    .club-name { font-size: 13px; }
    .runs { width: 36px; height: 36px; font-size: 20px; }
    .center-meta { gap: 8px; font-size: 11px; }
    .center-meta strong { font-size: 20px; }
    .game-info-card { top: 132px; right: 10px; width: 142px; padding: 12px 10px; }
    .pitcher-card { top: 118px; left: 12px; width: 272px; }
    .player-card, .gauge-card { font-size: 12px; }
    .pitch-cluster { left: 12px; bottom: 152px; width: 122px; }
    .pitch-cluster button { padding: 10px 12px; }
    .pitch-name { font-size: 13px; }
    .pitch-level { font-size: 11px; }
    .utility-buttons { left: 12px; right: auto; bottom: 20px; }
    .status-gauges { left: 50%; right: auto; bottom: 92px; width: 188px; }
    .result-banner { bottom: 72px; font-size: 11px; }
    .engine-state { left: 12px; bottom: 62px; }
    .pitcher-sprite { left: 29.2%; bottom: 13.8%; width: 48px; height: 102px; }
    .catcher-sprite { top: 60.6%; width: 28px; height: 40px; }
    .umpire-sprite { top: 59%; width: 24px; height: 48px; }
    .batter-sprite { left: 60.4%; top: 58%; width: 40px; height: 80px; }
    .topview-field { height: 250px; }
    .play-transition { min-width: 190px; padding: 14px 16px; }
  }
</style>
