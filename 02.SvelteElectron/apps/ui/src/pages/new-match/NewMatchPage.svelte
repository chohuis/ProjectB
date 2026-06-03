<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import stadiumBackdrop from "../../shared/assets/match-demo/stadium-backdrop-concept.png";
  import { getPitcherSprite, getBatterSprite } from "../../shared/utils/spriteColor";

  // 투수 포즈 PNG
  import pitcherIdlePng    from "../../shared/assets/sprites/pitcher_idle.png";
  import pitcherWindupPng  from "../../shared/assets/sprites/pitcher_windup.png";
  import pitcherReleasePng from "../../shared/assets/sprites/pitcher_release.png";
  import pitcherFollowPng  from "../../shared/assets/sprites/pitcher_follow.png";
  // 타자 포즈 PNG (우타·좌타)
  import batterReadyRPng from "../../shared/assets/sprites/batter_ready_r.png";
  import batterSwingRPng from "../../shared/assets/sprites/batter_swing_r.png";
  import batterWatchRPng from "../../shared/assets/sprites/batter_watch_r.png";
  import batterReadyLPng from "../../shared/assets/sprites/batter_ready_l.png";
  import batterSwingLPng from "../../shared/assets/sprites/batter_swing_l.png";
  import batterWatchLPng from "../../shared/assets/sprites/batter_watch_l.png";
  // 포수 포즈 PNG
  import catcherSetPng     from "../../shared/assets/sprites/catcher_set.png";
  import catcherReceivePng from "../../shared/assets/sprites/catcher_receive.png";
  // 심판 포즈 PNG
  import umpireIdlePng   from "../../shared/assets/sprites/umpire_idle.png";
  import umpireStrikePng from "../../shared/assets/sprites/umpire_strike.png";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";
  import type { EntityRow } from "../../shared/stores/master";
  import { seasonStore } from "../../shared/stores/season";
  import type { InteractiveMatchContext, InteractiveMatchResult } from "../../shared/types/season";

  export let matchContext: InteractiveMatchContext | null = null;
  export let onComplete: (result: InteractiveMatchResult) => void = () => {};
  export let onCancel: () => void = () => {};

  type PitchType = "fastball" | "sinker" | "cutter" | "slider" | "curve" | "changeup" | "splitter" | "forkball" | "screwball" | "knuckleball";
  type PitchStrategy = "aggressive" | "balanced" | "safe";
  type PitchPower = "low" | "normal" | "high";
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
    inningScores?: { home: number[]; away: number[] };
    pitchCount: number;
    pitchCountSinceEntry?: number;
    protagonistStamina?: number;
    protagonistMental?: number;
    currentBatter?: { name?: string; contact?: number; power?: number; eye?: number };
    weather?: WeatherType;
    phase?: "protagonist_pitch" | "auto_inning" | "game_over";
    isProtagonistPitching?: boolean;
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

  // PNG URL 포즈 맵
  const pitcherPngs: Record<string, string> = {
    idle: pitcherIdlePng, windup: pitcherWindupPng,
    release: pitcherReleasePng, follow: pitcherFollowPng,
  };
  const batterPngsR: Record<string, string> = {
    ready: batterReadyRPng, swing: batterSwingRPng, watch: batterWatchRPng,
  };
  const batterPngsL: Record<string, string> = {
    ready: batterReadyLPng, swing: batterSwingLPng, watch: batterWatchLPng,
  };
  const catcherPngs: Record<string, string> = {
    set: catcherSetPng, receive: catcherReceivePng, frame: catcherSetPng,
  };
  const umpirePngs: Record<string, string> = {
    idle: umpireIdlePng, strike: umpireStrikePng,
  };

  // 런타임 컬러 교체된 스프라이트 src (초기값: 기본 PNG URL)
  let pitcherImgSrc: string = pitcherIdlePng;
  let catcherImgSrc: string = catcherSetPng;
  let batterImgSrc:  string = batterReadyRPng;
  let umpireImgSrc:  string = umpireIdlePng;
  let batterHandedness: "L" | "R" = "R";

  const PITCH_ID_TO_ENGINE: Record<string, PitchType> = {
    PITCH_FASTBALL: "fastball", PITCH_SINKER: "sinker", PITCH_CUTTER: "cutter",
    PITCH_SLIDER: "slider", PITCH_CURVE: "curve", PITCH_CHANGEUP: "changeup",
    PITCH_SPLITTER: "splitter", PITCH_FORKBALL: "forkball",
    PITCH_SCREWBALL: "screwball", PITCH_KNUCKLEBALL: "knuckleball",
  };
  const fallbackPitchTypes: { id: PitchType; label: string }[] = [
    { id: "fastball", label: "직구" },
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
  let gameOverVisible = false;
  let engineErrorMsg = "";
  let gameSummary = "";
  let currentPhase: "protagonist_pitch" | "auto_inning" | "game_over" = "protagonist_pitch";
  let inningScores: { home: number[]; away: number[] } = { home: Array(12).fill(0), away: Array(12).fill(0) };
  let playByPlayLines: { text: string; cls: string }[] = [];
  let postExitPopupVisible = false;
  let postExitReason = "";
  let currentSnapshot: SnapshotLike | null = null;
  let pitchTypes: { id: PitchType; label: string }[] = [...fallbackPitchTypes];
  let selectedPitchType: PitchType = "fastball";
  let selectedStrategy: PitchStrategy = "balanced";
  let selectedPower: PitchPower = "normal";
  let selectedZone: 1|2|3|4|5|6|7|8|9 = 5;
  let zoneClickPct = { px: 0.5, py: 0.5 };
  let zoneHoverPct: { px: number; py: number } | null = null;
  let lastPitchPct: { px: number; py: number } | null = null;
  let zoneCanvasEl: HTMLDivElement | null = null;
  let pitchTarget: { x: number; y: number } = { x: 0, y: 0 };
  let isIntentionalBall = false;
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

  // 팀 컬러 — Phase 3-D에서 SVG 스프라이트에 주입
  let myTeamId = "";
  let oppTeamId = "";
  let myTeamColors:  [string, string] = ["#1a3a8a", "#ffffff"];
  let oppTeamColors: [string, string] = ["#8a1a1a", "#ffffff"];

  let totalStrikeouts = 0;
  let totalHitsAllowed = 0;
  let totalWalksAllowed = 0;
  let totalOutsRecorded = 0;
  let totalErrors = 0;

  $: {
    const catalogNameById = new Map(
      ($masterStore.pitchCatalog ?? []).map((p: any) => [p.id, p.nameKo ?? p.name])
    );
    const rawPitches = ($gameStore.protagonist as any)?.pitches ?? [{ id: "PITCH_FASTBALL" }];
    const mapped = rawPitches
      .map((entry: any) => {
        const id = PITCH_ID_TO_ENGINE[entry.id];
        if (!id) return null;
        return { id, label: catalogNameById.get(entry.id) ?? entry.id.replace("PITCH_", "") };
      })
      .filter(Boolean) as { id: PitchType; label: string }[];
    const deduped: { id: PitchType; label: string }[] = [];
    for (const pitch of mapped) {
      if (!deduped.some((d) => d.id === pitch.id)) deduped.push(pitch);
    }
    pitchTypes = deduped.length > 0 ? deduped : [...fallbackPitchTypes];
    if (!pitchTypes.some((p) => p.id === selectedPitchType)) selectedPitchType = pitchTypes[0].id;
  }

  // 팀 ID → masterStore.teams에서 컬러 추출 (팀 데이터 로드 후 자동 반영)
  $: {
    const teams = $masterStore.teams as any[];
    const myT  = teams.find(t => t.id === myTeamId);
    const oppT = teams.find(t => t.id === oppTeamId);
    myTeamColors  = [myT?.colors?.[0]  ?? "#1a3a8a", myT?.colors?.[1]  ?? "#ffffff"];
    oppTeamColors = [oppT?.colors?.[0] ?? "#8a1a1a", oppT?.colors?.[1] ?? "#ffffff"];
  }

  $: selectedZone = getZoneFromClick(zoneClickPct.px, zoneClickPct.py);
  $: pitchTarget  = getPitchTargetFromPct(zoneClickPct.px, zoneClickPct.py);
  $: isIntentionalBall = Math.abs(pitchTarget.x) > 1 || Math.abs(pitchTarget.y) > 1;

  // 포즈 또는 팀 컬러 변경 시 스프라이트 src 갱신 (캐시 덕에 2회차부터 동기적)
  $: void (async () => {
    pitcherImgSrc = await getPitcherSprite(pitcherPngs[pitcherPose] ?? pitcherPngs.idle, myTeamColors[0]);
  })();
  $: void (async () => {
    catcherImgSrc = await getPitcherSprite(catcherPngs[catcherPose] ?? catcherPngs.set, myTeamColors[0]);
  })();
  $: void (async () => {
    const pngs = batterHandedness === "L" ? batterPngsL : batterPngsR;
    batterImgSrc = await getBatterSprite(pngs[batterPose] ?? pngs.ready, oppTeamColors[0]);
  })();
  $: void (async () => {
    umpireImgSrc = umpirePngs[umpirePose] ?? umpirePngs.idle;
  })();

  async function preloadTeamSprites() {
    const pc = myTeamColors[0];
    const oc = oppTeamColors[0];
    await Promise.all([
      ...Object.values(pitcherPngs).map(s => getPitcherSprite(s, pc)),
      ...Object.values(catcherPngs).map(s => getPitcherSprite(s, pc)),
      ...Object.values(batterPngsR).map(s => getBatterSprite(s, oc)),
      ...Object.values(batterPngsL).map(s => getBatterSprite(s, oc)),
    ]);
  }

  function getZoneFromClick(px: number, py: number): 1|2|3|4|5|6|7|8|9 {
    const normX = Math.max(0, Math.min(1, (px - 0.10) / 0.80));
    const normY = Math.max(0, Math.min(1, (py - 0.08) / 0.84));
    const map: (1|2|3|4|5|6|7|8|9)[][] = [[7,8,9],[4,5,6],[1,2,3]];
    return map[Math.min(2, Math.floor(normY * 3))][Math.min(2, Math.floor(normX * 3))];
  }

  function getPitchTargetFromPct(px: number, py: number): { x: number; y: number } {
    return {
      x: ((px - 0.10) / 0.80) * 2 - 1,
      y: ((py - 0.08) / 0.84) * 2 - 1,
    };
  }

  function handleZoneClick(e: MouseEvent) {
    if (!zoneCanvasEl || engineBusy) return;
    const rect = zoneCanvasEl.getBoundingClientRect();
    zoneClickPct = {
      px: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      py: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handleZoneMouseMove(e: MouseEvent) {
    if (!zoneCanvasEl || engineBusy) return;
    const rect = zoneCanvasEl.getBoundingClientRect();
    zoneHoverPct = {
      px: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      py: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

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
        { label: "구속", value: `${Math.round(100 + (player?.pitcherStats?.velocity ?? 0) * 0.65)} km/h` },
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

  function buildOpponentLineup(opponentTeamId: string): import('../../shared/types/projectb').MatchBatterStats[] {
    const entities = get(masterStore).entities;
    const pitcherPos = ['SP', 'RP', 'CP'];
    const fieldOrder = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
    const opponentsInTeam = entities.filter((e: EntityRow) =>
      e.teamId === opponentTeamId &&
      e.role === 'player' &&
      !pitcherPos.includes(String((e.details as any)?.player?.position ?? ''))
    );
    const opponents = opponentsInTeam.length >= 9
      ? opponentsInTeam
      : entities.filter((e: EntityRow) =>
          e.role === 'player' &&
          !pitcherPos.includes(String((e.details as any)?.player?.position ?? ''))
        );
    if (opponents.length < 9) return [];
    const sorted = [...opponents].sort((a: EntityRow, b: EntityRow) =>
      ((b.details as any)?.player?.batting?.ovr ?? 0) - ((a.details as any)?.player?.batting?.ovr ?? 0)
    );
    const picked: EntityRow[] = [];
    const used = new Set<string>();
    for (const pos of fieldOrder) {
      const found = sorted.find((e) => {
        if (used.has(e.id)) return false;
        return String((e.details as any)?.player?.position ?? "") === pos;
      });
      if (found) { used.add(found.id); picked.push(found); }
    }
    for (const e of sorted) {
      if (picked.length >= 9) break;
      if (!used.has(e.id)) { used.add(e.id); picked.push(e); }
    }
    return picked.slice(0, 9).map((e: EntityRow) => {
      const bat = (e.details as any)?.player?.batting ?? {};
      return {
        id: e.id, name: e.name ?? undefined,
        contact: bat.contact ?? 50, power: bat.power ?? 50,
        eye: bat.eye ?? 50, discipline: bat.discipline ?? 50,
        battingClutch: bat.battingClutch ?? 50, platoon: bat.platoon ?? 50,
        speed: bat.speed ?? 50, baseInstinct: bat.baseInstinct ?? 50,
        fielding: bat.fielding ?? 50, arm: bat.arm ?? 50,
      };
    });
  }

  function buildOpponentFielders(opponentTeamId: string): import('../../shared/types/projectb').MatchFielderStats[] {
    const entities = get(masterStore).entities.filter(
      (e: EntityRow) => e.teamId === opponentTeamId && e.role === "player"
    );
    const posOrder: Array<import('../../shared/types/projectb').MatchFielderStats["position"]> =
      ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
    const posToXY: Record<string, { x: number; y: number }> = {
      P: { x: 50, y: 62 }, C: { x: 50, y: 90 }, "1B": { x: 78, y: 70 },
      "2B": { x: 63, y: 55 }, "3B": { x: 22, y: 70 }, SS: { x: 37, y: 55 },
      LF: { x: 18, y: 28 }, CF: { x: 50, y: 16 }, RF: { x: 82, y: 28 },
    };
    const pickByPos = (pos: string) =>
      entities.find((e) => String((e.details as any)?.player?.position ?? "") === pos);
    const pickPitcher = () =>
      pickByPos("SP") ?? pickByPos("RP") ?? pickByPos("CP") ?? entities[0];
    return posOrder.map((pos) => {
      const source = pos === "P" ? pickPitcher() : pickByPos(pos);
      const bat = (source?.details as any)?.player?.batting ?? {};
      return {
        position: pos, name: source?.name ?? pos,
        fielding: bat.fielding ?? 50, arm: bat.arm ?? 50, speed: bat.speed ?? 50,
        x: posToXY[pos].x, y: posToXY[pos].y,
      };
    });
  }

  function buildPitcherStatsForTeam(teamId: string): Record<string, number | string | undefined> | undefined {
    const entities = get(masterStore).entities;
    const pitcherPos = ['SP', 'RP', 'CP'];
    const pitchers = entities.filter((e: EntityRow) =>
      e.teamId === teamId &&
      e.role === 'player' &&
      pitcherPos.includes(String((e.details as any)?.player?.position ?? ''))
    );
    if (pitchers.length === 0) return undefined;
    const sorted = [...pitchers].sort((a: EntityRow, b: EntityRow) => {
      const order: Record<string, number> = { SP: 0, RP: 1, CP: 2 };
      const aO = order[String((a.details as any)?.player?.position ?? 'RP')] ?? 1;
      const bO = order[String((b.details as any)?.player?.position ?? 'RP')] ?? 1;
      if (aO !== bO) return aO - bO;
      return ((b.details as any)?.player?.pitching?.ovr ?? 0) - ((a.details as any)?.player?.pitching?.ovr ?? 0);
    });
    const src = sorted[0];
    const pit = (src.details as any)?.player?.pitching ?? {};
    return {
      name: src.name ?? undefined,
      command: pit.command ?? 50, velocity: pit.velocity ?? 50,
      staminaCap: pit.stamina ?? 50, mentalResil: pit.mentality ?? 50,
      control: pit.control ?? 50, movement: pit.movement ?? 50,
      clutch: pit.clutch ?? 50, holdRunners: pit.holdRunners ?? 50,
    };
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

  function syncZoneVisuals(landingTarget?: { x: number; y: number }) {
    if (landingTarget) {
      const ball = landingToOverlay(landingTarget.x, landingTarget.y);
      pitchBallStyle = `left: calc(51.3% - 54px + ${ball.left}px); top: calc(53.7% + ${ball.top}px);`;
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

  // Rust animationCue의 fielder_move.position → topview CSS 클래스
  // result code 기반 추측이 아닌 실제 수비 위치 기반
  function fieldPosToTopview(
    pos: import('../../shared/types/projectb').MatchFieldPos,
    isHomeRun = false
  ): { ballClass: string; focusClass: string; runnerAdvance: string } {
    if (isHomeRun) return { ballClass: "to-center-deep", focusClass: "focus-outfield", runnerAdvance: "홈런 / 전 주자 득점" };
    switch (pos) {
      case "LF": return { ballClass: "to-gap-left",  focusClass: "focus-left",     runnerAdvance: "좌익수 타구" };
      case "CF": return { ballClass: "to-center",     focusClass: "focus-outfield", runnerAdvance: "중견수 타구" };
      case "RF": return { ballClass: "to-right",      focusClass: "focus-right",    runnerAdvance: "우익수 타구" };
      case "3B": return { ballClass: "to-third",      focusClass: "focus-left",     runnerAdvance: "3루수 타구" };
      case "SS": return { ballClass: "to-short",      focusClass: "focus-infield",  runnerAdvance: "유격수 타구" };
      case "2B": return { ballClass: "to-short",      focusClass: "focus-infield",  runnerAdvance: "2루수 타구" };
      case "1B": return { ballClass: "to-right",      focusClass: "focus-infield",  runnerAdvance: "1루수 타구" };
      case "P":  return { ballClass: "to-short",      focusClass: "focus-infield",  runnerAdvance: "투수 타구" };
      case "C":  return { ballClass: "to-short",      focusClass: "focus-infield",  runnerAdvance: "포수 타구" };
      default:   return { ballClass: "to-center",     focusClass: "focus-infield",  runnerAdvance: "타구 처리" };
    }
  }

  function resultCls(code: PitchResultCode): string {
    if (code === "HOME_RUN") return "log-homerun";
    if (["HIT_SINGLE","HIT_DOUBLE","HIT_TRIPLE"].includes(code)) return "log-hit";
    if (code === "WALK") return "log-walk";
    if (code === "STRIKE_SWING" || code === "STRIKE_LOOK") return "log-strike";
    if (code === "FOUL") return "log-foul";
    if (code === "BALL") return "log-ball";
    return "log-out";
  }

  function pushLog(text: string, cls = "") {
    playByPlayLines = [{ text, cls }, ...playByPlayLines].slice(0, 14);
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
    if (snapshot.currentBatter?.name) {
      batterName = snapshot.currentBatter.name;
      // masterStore 엔티티에서 핸드니스 조회 (L/R)
      const entity = get(masterStore).entities.find(
        (e: EntityRow) => e.name === batterName && e.role === "player"
      );
      const h = (entity?.details as any)?.player?.handedness;
      if (h === "L" || h === "R") batterHandedness = h;
    }
    if (snapshot.inningScores) {
      const src = snapshot.inningScores;
      inningScores = {
        home: src.home.slice(0, 12).concat(Array(Math.max(0, 12 - src.home.length)).fill(0)),
        away: src.away.slice(0, 12).concat(Array(Math.max(0, 12 - src.away.length)).fill(0)),
      };
    }
    if (snapshot.phase) currentPhase = snapshot.phase;

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
      gameOverVisible = true;

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
      while (currentPhase === "auto_inning" && !isGameOver) {
        const response = await window.projectB.matchNextInning();

        // 로그 순차 표시
        for (const log of (response.logs ?? [])) {
          pushLog(log, "log-auto");
          await new Promise(r => setTimeout(r, 300));
        }

        if (response?.snapshot) applySnapshot(response.snapshot as SnapshotLike);
        if (response?.batchStats) applyBatchStats(response.batchStats);

        // 강판 이벤트
        if (response.protagonistJustExited) {
          postExitReason = response.exitReason ?? "";
          postExitPopupVisible = true;
          break;
        }

        // 경기 종료
        if (response?.snapshot?.isFinished) {
          await handleGameOver();
          break;
        }

        // 로그도 batchStats도 없으면 투구 차례 → 중단
        if (!response.logs?.length && !response.batchStats) break;
      }
    } catch (error) {
      engineErrorMsg = `자동 진행 실패: ${String((error as Error)?.message ?? error)}`;
    } finally {
      isAutoSimming = false;
    }
  }

  async function requestMoundVisit() {
    if (!window.projectB?.moundVisit || !engineStarted || isGameOver) return;
    try {
      const result = await window.projectB.moundVisit();
      if (result?.snapshot) applySnapshot(result.snapshot as SnapshotLike);
      pushLog("마운드 방문 — 멘탈 회복", "log-auto");
    } catch { /* ignore */ }
  }

  async function handlePostExitWatch() {
    postExitPopupVisible = false;
    // auto_inning 페이즈로 전환 후 자동 시뮬 계속
    currentPhase = "auto_inning";
    await runAutoInnings();
  }

  async function handlePostExitResult() {
    postExitPopupVisible = false;
    await handleGameOver();
  }

  async function playAnimationCues(
    cues: import('../../shared/types/projectb').MatchAnimationCue[],
    code: PitchResultCode,
  ) {
    let topviewStarted = false;

    for (const cue of cues) {

      if (cue.type === "ball_pitch") {
        // 투구 모션 타이밍: windup → release
        pitcherPose = "windup";
        const windupMs = Math.round(cue.duration * 0.35);
        await new Promise(r => setTimeout(r, windupMs));
        pitcherPose = "release";
        await new Promise(r => setTimeout(r, cue.duration - windupMs));

      } else if (cue.type === "ball_batted") {
        batterPose = "swing";

        // playTransition 표시
        playTransitionText = playTransitionLabel(code);
        playTransitionVisible = true;
        await new Promise(r => setTimeout(r, 380));
        playTransitionVisible = false;

        // topview 시작 (fielder_move가 이미 focusClass를 설정해뒀을 수 있음)
        topviewResultText = playTransitionLabel(code);
        topviewVisible = true;
        topviewStarted = true;
        await new Promise(r => setTimeout(r, Math.min(cue.duration, 760)));

      } else if (cue.type === "fielder_move") {
        // 실제 Rust 수비 위치 → topview CSS 클래스 결정 (비동기 아님)
        const info = fieldPosToTopview(cue.position, code === "HOME_RUN");
        topviewBallClass = info.ballClass;
        topviewFocusClass = info.focusClass;
        topviewRunnerAdvance = info.runnerAdvance;

      } else if (cue.type === "ball_throw") {
        await new Promise(r => setTimeout(r, Math.min(cue.duration, 280)));

      } else if (cue.type === "runner_advance") {
        // 주자 이동은 snapshot 업데이트 + topviewBallClass CSS로 처리됨
        // 추가 처리 불필요 (Phase 5에서 필요 시 확장)

      } else if (cue.type === "show_result") {
        // topview 닫기
        if (topviewStarted) {
          topviewVisible = false;
        }
        // 최종 스프라이트 포즈
        catcherPose = code === "STRIKE_LOOK" || code === "BALL" || code === "WALK" ? "receive" : "frame";
        umpirePose  = code === "STRIKE_LOOK" || code === "STRIKE_SWING" ? "strike" : "idle";
        if (!["STRIKE_SWING","FOUL","INPLAY_OUT","HIT_SINGLE","HIT_DOUBLE","HIT_TRIPLE","HOME_RUN"].includes(code)) {
          batterPose = "watch";
        }
      }
    }

    // topview가 열린 채로 cues 종료됐으면 정리
    if (topviewStarted && topviewVisible) {
      await new Promise(r => setTimeout(r, 360));
      topviewVisible = false;
    }

    pitcherPose = "follow";
  }

  async function throwPitch() {
    if (!window.projectB?.matchStep || !engineAvailable || !engineStarted || engineBusy) return;

    engineBusy = true;
    const zoneAtThrow = selectedZone;
    const targetAtThrow = { ...pitchTarget };
    const pitchedPct = { ...zoneClickPct };
    const prevOuts = count.outs;
    const batterAtPitch = batterName;
    // 초기 포즈 리셋
    pitcherPose = "idle";
    batterPose = "ready";
    catcherPose = "set";
    umpirePose = "idle";

    try {
      const response = await window.projectB.matchStep({
        pitchType: selectedPitchType,
        location: zoneAtThrow,
        target: targetAtThrow,
        strategy: selectedStrategy,
        power: selectedPower,
      });

      if (response?.snapshot) applySnapshot(response.snapshot as SnapshotLike);

      if (response?.outcome?.resultCode) {
        const code = response.outcome.resultCode as PitchResultCode;
        const nextOuts = (response?.snapshot as SnapshotLike | undefined)?.outs ?? prevOuts;

        // 결과 배너 즉시 업데이트
        const banner = resultText(code);
        resultBannerText = banner.text;
        resultBannerTone = banner.tone;

        // 통계 집계
        applyOutcomeStats(code, prevOuts, nextOuts);
        recordBatterOutcome(batterAtPitch, code, prevOuts, nextOuts);

        const cues = response.outcome.animationCues as
          import('../../shared/types/projectb').MatchAnimationCue[] | undefined;

        if (cues?.length) {
          // animationCues 기반 — Rust 계산 타이밍으로 포즈·topview 구동
          await playAnimationCues(cues, code);
        } else {
          // fallback — 수동 포즈 + topview
          pitcherPose = "windup";
          await new Promise(r => setTimeout(r, 120));
          pitcherPose = "release";
          batterPose = ["STRIKE_SWING","FOUL","INPLAY_OUT","HIT_SINGLE","HIT_DOUBLE","HIT_TRIPLE","HOME_RUN"].includes(code) ? "swing" : "watch";
          catcherPose = code === "STRIKE_LOOK" || code === "BALL" || code === "WALK" ? "receive" : "frame";
          umpirePose  = code === "STRIKE_LOOK" || code === "STRIKE_SWING" ? "strike" : "idle";
          if (isBallInPlayResult(code)) {
            playTransitionText = playTransitionLabel(code);
            playTransitionVisible = true;
            await new Promise(r => setTimeout(r, 420));
            playTransitionVisible = false;
            await showTopview(code);
          }
          pitcherPose = "follow";
        }
      }

      syncZoneVisuals(response?.outcome?.landingTarget);
      lastPitchPct = pitchedPct;
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
      const master = get(masterStore);

      // 고교리그 엔티티 로드 (없으면)
      if (master.entities.length === 0) {
        await masterStore.loadEntities("LEAGUE_HIGHSCHOOL");
      }

      const player = state.player;
      myTeamId = matchContext?.protagonistTeamId ?? state.protagonist?.teamId ?? "";
      const isHome = !matchContext || matchContext.protagonistTeamId === matchContext.homeTeamId;

      // 고교리그에서 상대팀 선정 (주인공 팀 제외)
      const allTeams = get(masterStore).teams;
      const leagueTeams = allTeams.filter(
        (t: any) => t.id !== myTeamId && t.leagueId === "LEAGUE_HIGHSCHOOL"
      );
      const opponentTeam = leagueTeams[Math.floor(Math.random() * leagueTeams.length)];
      oppTeamId = opponentTeam?.id ?? "";

      // 팀명 설정
      const teamById = new Map(allTeams.map((t: any) => [t.id, t.name as string]));
      if (isHome) {
        homeTeamName = teamById.get(myTeamId) ?? "홈팀";
        awayTeamName = teamById.get(oppTeamId) ?? "원정팀";
      } else {
        awayTeamName = teamById.get(myTeamId) ?? "원정팀";
        homeTeamName = teamById.get(oppTeamId) ?? "홈팀";
      }

      const opponentLineup = oppTeamId ? buildOpponentLineup(oppTeamId) : [];
      const fielders      = oppTeamId ? buildOpponentFielders(oppTeamId) : [];
      const myLineup      = myTeamId  ? buildOpponentLineup(myTeamId)   : [];
      const opponentPitcherStats = oppTeamId ? buildPitcherStatsForTeam(oppTeamId) : undefined;

      const response = await window.projectB.matchStart({
        initialStamina: player.condition,
        initialMental: 74,
        pitcher: { ...player.pitcherStats, name: player.name },
        weather: "sunny",
        park: "neutral",
        role: (matchContext?.role ?? "SP") as "SP" | "RP" | "CP",
        protagonistSide: isHome ? "home" : "away",
        ...(matchContext?.entryTrigger ? { entryTrigger: matchContext.entryTrigger } : {}),
        ...(opponentLineup.length >= 9 ? { opponentLineup } : {}),
        ...(myLineup.length >= 9 ? { myTeamLineup: myLineup } : { batterMean: 50 }),
        ...(fielders.length >= 9 ? { fielders } : {}),
        ...(opponentPitcherStats ? { opponentPitcher: opponentPitcherStats } : {}),
      });

      refreshStaticPlayerInfo();
      engineAvailable = true;
      engineStarted = true;
      engineErrorMsg = "";
      applySnapshot(response.snapshot as SnapshotLike);
      syncZoneVisuals();
      resultBannerText = "READY";
      resultBannerTone = "neutral";
      isGameOver = false;
      gameOverVisible = false;
      gameSummary = "";
      playByPlayLines = [];
      postExitPopupVisible = false;
      postExitReason = "";
      inningScores = { home: Array(12).fill(0), away: Array(12).fill(0) };
      batterTodayLines = {};
      totalStrikeouts = 0;
      totalHitsAllowed = 0;
      totalWalksAllowed = 0;
      totalOutsRecorded = 0;
      totalErrors = 0;
      void preloadTeamSprites();
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
        </div>
        <div class="club home">
          <strong class="runs">{score.home}</strong>
          <span class="club-name">{homeTeamName}</span>
        </div>
      </div>
      <div class="inning-score-row" aria-label="이닝별 점수">
        <span class="is-team">{awayTeamName.slice(0, 4)}</span>
        {#each [0,1,2,3,4,5,6,7,8] as i}
          <span class="is-cell" class:current-inn={i + 1 === (currentSnapshot?.inning ?? 1)}>
            {inningScores.away[i] > 0 ? inningScores.away[i] : "·"}
          </span>
        {/each}
        <span class="is-total">{score.away}</span>
        <span class="is-team home-team">{homeTeamName.slice(0, 4)}</span>
        {#each [0,1,2,3,4,5,6,7,8] as i}
          <span class="is-cell" class:current-inn={i + 1 === (currentSnapshot?.inning ?? 1)}>
            {inningScores.home[i] > 0 ? inningScores.home[i] : "·"}
          </span>
        {/each}
        <span class="is-total">{score.home}</span>
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

    <img class="scene-image" src={stadiumBackdrop} alt="도트 경기장" />

    <div class="sprite-layer" aria-hidden="true">
      <img class={`sprite pitcher-sprite pose-${pitcherPose}`} src={pitcherImgSrc} alt="" />
      <img class={`sprite catcher-sprite pose-${catcherPose}`} src={catcherImgSrc} alt="" />
      <img class={`sprite batter-sprite hand-${batterHandedness} pose-${batterPose}`} src={batterImgSrc} alt="" />
      <img class={`sprite umpire-sprite  pose-${umpirePose}`}  src={umpireImgSrc}  alt="" />
    </div>

    <div class="strike-zone" aria-hidden="true"></div>
    <div
      class="zone-canvas"
      class:busy={engineBusy}
      bind:this={zoneCanvasEl}
      role="button"
      tabindex="0"
      aria-label="투구 위치 선택"
      on:click={handleZoneClick}
      on:mousemove={handleZoneMouseMove}
      on:mouseleave={() => (zoneHoverPct = null)}
      on:keydown={(e) => { if (e.key === "Enter") void throwPitch(); }}
    >
      <div class="sz-inner-box"></div>
      {#if lastPitchPct}
        <div class="zone-last-dot" style="left:{lastPitchPct.px * 100}%;top:{lastPitchPct.py * 100}%;"></div>
      {/if}
      {#if zoneHoverPct && !engineBusy}
        <div class="zone-hover-dot" style="left:{zoneHoverPct.px * 100}%;top:{zoneHoverPct.py * 100}%;"></div>
      {/if}
      <div
        class="zone-target-dot"
        class:intentional={isIntentionalBall}
        style="left:{zoneClickPct.px * 100}%;top:{zoneClickPct.py * 100}%;"
      ></div>
    </div>
    <div class="pitch-ball" aria-hidden="true" style={pitchBallStyle}></div>

    <div class="pitch-cluster" aria-label="pitch selection">
      <div class="pitch-type-row">
        {#each pitchTypes as pitch}
          <button type="button" class:active={selectedPitchType === pitch.id} on:click={() => { selectedPitchType = pitch.id; }}>
            <span class="pitch-name">{pitch.label}</span>
          </button>
        {/each}
      </div>
      <div class="mini-row">
        {#each [["aggressive","공격"],["balanced","균형"],["safe","안정"]] as [id, label]}
          <button type="button" class="mini-btn" class:active={selectedStrategy === id} on:click={() => { selectedStrategy = id as typeof selectedStrategy; }}>
            {label}
          </button>
        {/each}
      </div>
      <div class="mini-row">
        {#each [["low","약"],["normal","보통"],["high","강"]] as [id, label]}
          <button type="button" class="mini-btn" class:active={selectedPower === id} on:click={() => { selectedPower = id as typeof selectedPower; }}>
            {label}
          </button>
        {/each}
      </div>
      <button type="button" class="throw-btn" disabled={engineBusy || !engineStarted || isGameOver} on:click={() => void throwPitch()}>
        {engineBusy ? "투구 중..." : "투 구"}
      </button>
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

    {#if playByPlayLines.length > 0}
      <div class="log-panel" aria-label="play-by-play log">
        {#each playByPlayLines as line}
          <div class="log-line {line.cls}">{line.text}</div>
        {/each}
      </div>
    {/if}

    <div class="utility-buttons">
      <button type="button" on:click={() => void runAutoInnings()} disabled={!engineStarted || isAutoSimming || isGameOver || currentPhase !== "auto_inning"}>자동진행</button>
      <button type="button" on:click={() => void requestMoundVisit()} disabled={!engineStarted || isGameOver || engineBusy}>마운드</button>
      <button type="button" on:click={() => void handleGameOver()} disabled={!engineStarted || isGameOver}>경기종료</button>
    </div>

    {#if !engineAvailable && engineErrorMsg}
      <div class="engine-state error">{engineErrorMsg}</div>
    {:else if engineStarted && !isGameOver}
      <div class="engine-state ok">엔진 준비 완료</div>
    {/if}

    {#if postExitPopupVisible}
      <div class="modal-overlay" aria-label="강판 알림">
        <div class="modal-card">
          <p class="modal-title">강판</p>
          <p class="modal-desc">{postExitReason || "투수 교체됩니다"}</p>
          <div class="modal-actions">
            <button type="button" on:click={() => void handlePostExitWatch()}>관전 계속</button>
            <button type="button" class="btn-primary" on:click={() => void handlePostExitResult()}>결과 바로 보기</button>
          </div>
        </div>
      </div>
    {/if}

    {#if gameOverVisible}
      <div class="modal-overlay" aria-label="경기 결과">
        <div class="modal-card gameover-card">
          <p class="modal-title">경기 종료</p>
          <div class="gameover-score">
            <span class="gs-team">{awayTeamName}</span>
            <strong class="gs-num">{score.away}</strong>
            <span class="gs-sep">:</span>
            <strong class="gs-num">{score.home}</strong>
            <span class="gs-team">{homeTeamName}</span>
          </div>
          {#if gameSummary}
            <p class="gameover-summary">{gameSummary}</p>
          {/if}
          <div class="gameover-stats">
            <span>{totalStrikeouts}K</span>
            <span>{totalHitsAllowed}H</span>
            <span>{totalWalksAllowed}BB</span>
            <span>P{pitchCount}</span>
          </div>
          <button type="button" class="btn-primary gameover-exit" on:click={onCancel}>경기장 나가기</button>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .demo-match-screen { min-height: 100vh; background: radial-gradient(circle at top, rgba(55, 92, 160, 0.18), transparent 24%), linear-gradient(180deg, #0b1017 0%, #08111d 38%, #050a12 100%); color: #edf3ff; }
  .viewport { position: relative; min-height: 100vh; overflow: hidden; }
  .scene-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
  .scoreboard-overlay, .game-info-card, .player-card, .sprite-layer, .strike-zone, .zone-canvas, .pitch-ball, .pitch-cluster, .play-transition, .topview-overlay, .result-banner, .status-gauges, .utility-buttons, .engine-state, .log-panel { position: absolute; z-index: 3; }
  .modal-overlay { z-index: 10; }
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
  /* 팀 컬러 컨텍스트 — CSS 변수를 SVG 자식에게 전달 */
  /* PNG <img>: 각 sprite CSS의 width/height를 따르며, 픽셀 선명하게 렌더 */
  img.sprite { object-fit: contain; image-rendering: pixelated; display: block; }
  /* 스프라이트 공통: 색깔 박스 없이 위치/트랜지션만 */
  .sprite { position: absolute; transition: transform 180ms ease, filter 180ms ease, opacity 180ms ease; opacity: 0.96; overflow: visible; }
  .sprite::after { content: ""; position: absolute; inset: auto 10% -8px; height: 10px; border-radius: 999px; background: rgba(0, 0, 0, 0.22); filter: blur(5px); z-index: -1; }
  /* 투수 — 마운드 중앙 */
  .pitcher-sprite { left: 33%; bottom: 15%; width: 96px; height: 192px; transform-origin: 50% 90%; }
  .pitcher-sprite.pose-windup  { transform: translateY(-8px) rotate(-8deg) scale(1.03); }
  .pitcher-sprite.pose-release { transform: translate(12px, -12px) rotate(7deg) scale(1.05); filter: brightness(1.1); }
  .pitcher-sprite.pose-follow  { transform: translate(14px, 2px) rotate(9deg); filter: brightness(1.04); }
  /* 포수 — 홈플레이트, 스퀘어 PNG(1254×1254) */
  .catcher-sprite { left: 49%; bottom: 27%; width: 88px; height: 88px; transform: translateX(-50%); }
  .catcher-sprite.pose-receive { transform: translateX(-50%) translateY(-5px) scale(1.05); filter: brightness(1.08); }
  .catcher-sprite.pose-frame   { transform: translateX(-50%) scale(1.04); }
  /* 심판 — 포수 바로 뒤 (살짝 작게) */
  .umpire-sprite { left: 52%; bottom: 31%; width: 54px; height: 96px; transform: translateX(-50%); }
  .umpire-sprite.pose-strike   { transform: translateX(-50%) translateY(-8px) scale(1.04); filter: brightness(1.14); }
  /* 타자 — 우타: 홈플레이트 우측, 좌타: 홈플레이트 좌측 */
  .batter-sprite { left: 57%; bottom: 26%; width: 84px; height: 144px; transform-origin: 50% 90%; }
  .batter-sprite.hand-L { left: 39%; }
  .batter-sprite.pose-swing { transform: translate(-12px, -6px) rotate(-11deg) scale(1.04); filter: brightness(1.08) saturate(1.1); }
  .batter-sprite.pose-watch { transform: translateX(3px) scale(1.02); }
  .strike-zone { left: 51.3%; top: 53.7%; width: 108px; height: 130px; transform: translateX(-50%); border: 2px solid rgba(235, 243, 255, 0.55); box-shadow: 0 0 0 1px rgba(83, 123, 191, 0.3); background: none; }
  .zone-canvas { left: 51.3%; top: 53.7%; width: 108px; height: 130px; transform: translateX(-50%); cursor: crosshair; user-select: none; z-index: 4; }
  .zone-canvas.busy { cursor: not-allowed; opacity: 0.7; }
  .sz-inner-box { position: absolute; left: 10%; right: 10%; top: 8%; bottom: 8%; border: 1px solid rgba(235, 243, 255, 0.3); background-image: linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 33.333% 33.333%; pointer-events: none; }
  .zone-target-dot { position: absolute; width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(101, 180, 255, 0.9); background: rgba(101, 180, 255, 0.2); transform: translate(-50%, -50%); pointer-events: none; box-shadow: 0 0 8px rgba(101, 180, 255, 0.5); z-index: 3; }
  .zone-target-dot.intentional { border-color: rgba(255, 160, 50, 0.9); background: rgba(255, 160, 50, 0.15); box-shadow: 0 0 8px rgba(255, 160, 50, 0.4); }
  .zone-last-dot { position: absolute; width: 10px; height: 10px; border-radius: 50%; border: 2px solid rgba(255, 213, 79, 0.8); background: rgba(255, 213, 79, 0.25); transform: translate(-50%, -50%); pointer-events: none; z-index: 2; }
  .zone-hover-dot { position: absolute; width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(200, 220, 255, 0.3); background: rgba(200, 220, 255, 0.08); transform: translate(-50%, -50%); pointer-events: none; z-index: 1; }
  .pitch-ball { width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffffff 0%, #f7f3ef 44%, #d7deed 100%); box-shadow: 0 0 22px rgba(255, 255, 255, 0.58); animation: pitchBallPulse 880ms ease-in-out infinite; }
  .pitch-cluster { left: 15%; bottom: 22%; display: grid; gap: 8px; width: 148px; }
  .pitch-type-row { display: grid; gap: 6px; }
  .pitch-cluster .pitch-type-row button { display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 211, 91, 0.26); background: rgba(11, 17, 28, 0.72); color: #f6d76b; border-radius: 14px; padding: 9px 12px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22); backdrop-filter: blur(7px); cursor: pointer; }
  .pitch-cluster .pitch-type-row button.active { background: rgba(82, 50, 8, 0.86); color: #fff0a6; border-color: rgba(255, 211, 91, 0.6); transform: translateX(10px); }
  .mini-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .mini-btn { border: 1px solid rgba(180, 200, 255, 0.2); background: rgba(11, 17, 28, 0.68); color: #b8c8e8; border-radius: 10px; padding: 6px 4px; font-size: 11px; cursor: pointer; }
  .mini-btn.active { background: rgba(40, 60, 110, 0.86); color: #c8daff; border-color: rgba(120, 160, 255, 0.5); }
  .throw-btn { width: 100%; border: none; border-radius: 14px; background: linear-gradient(180deg, #4a8cf0, #2e5fb5); color: #fff; padding: 13px; font-size: 15px; font-weight: 800; letter-spacing: 0.1em; cursor: pointer; box-shadow: 0 4px 18px rgba(61, 120, 223, 0.5); transition: transform 0.1s, box-shadow 0.1s; }
  .throw-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(61, 120, 223, 0.65); }
  .throw-btn:disabled { cursor: not-allowed; background: linear-gradient(180deg, #2a4a7a, #1e3560); box-shadow: none; animation: pitchPulse 1.2s ease-in-out infinite; }
  .pitch-name { font-size: 13px; font-weight: 700; }
  .utility-buttons button { display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 211, 91, 0.26); background: rgba(11, 17, 28, 0.72); color: #f6d76b; border-radius: 14px; padding: 10px 14px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22); backdrop-filter: blur(7px); cursor: pointer; }
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
  .status-gauges { right: 18px; bottom: 76px; display: grid; gap: 10px; width: 224px; }
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

  /* 이닝별 점수 */
  .inning-score-row { display: grid; grid-template-columns: 44px repeat(9, 1fr) 32px; gap: 0; margin-top: 6px; background: rgba(8, 12, 22, 0.72); border: 1px solid rgba(100, 130, 180, 0.18); border-radius: 8px; overflow: hidden; font-size: 10px; }
  .is-team { padding: 4px 6px; color: #8baed4; font-weight: 700; display: flex; align-items: center; background: rgba(255,255,255,0.04); }
  .is-team.home-team { grid-column-start: 1; }
  .is-cell { padding: 4px 2px; text-align: center; color: #c8d8f0; border-left: 1px solid rgba(100,130,180,0.1); }
  .is-cell.current-inn { background: rgba(90, 140, 255, 0.12); color: #fff; font-weight: 700; }
  .is-total { padding: 4px 6px; text-align: center; color: #fff; font-weight: 800; border-left: 1px solid rgba(100,130,180,0.2); background: rgba(255,255,255,0.05); }

  /* play-by-play 로그 */
  .log-panel { left: 22px; bottom: 108px; width: 220px; max-height: 120px; overflow: hidden; display: flex; flex-direction: column-reverse; gap: 2px; }
  .log-line { font-size: 10px; padding: 3px 7px; border-radius: 6px; background: rgba(8, 13, 22, 0.76); color: #b8c8e8; border-left: 2px solid rgba(100, 140, 200, 0.3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .log-line.log-auto   { color: #88a8cc; border-color: rgba(80, 120, 180, 0.4); }
  .log-line.log-strike { border-color: rgba(56, 217, 111, 0.6); color: #a8f0c8; }
  .log-line.log-hit    { border-color: rgba(255, 213, 79, 0.6); color: #ffe8a0; }
  .log-line.log-homerun{ border-color: rgba(255, 100, 100, 0.6); color: #ffb8b8; }
  .log-line.log-walk   { border-color: rgba(180, 180, 220, 0.4); }
  .log-line.log-out    { border-color: rgba(255, 140, 60, 0.5); color: #ffc890; }
  .log-line.log-ball   { color: #8898b8; }
  .log-line.log-foul   { color: #a8a8c8; }

  /* 모달 공통 */
  .modal-overlay { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(4, 8, 14, 0.6); backdrop-filter: blur(6px); z-index: 10; }
  .modal-card { width: min(360px, calc(100vw - 40px)); padding: 24px; border-radius: 22px; background: linear-gradient(180deg, rgba(248, 251, 255, 0.97), rgba(228, 238, 252, 0.95)); border: 1px solid rgba(110, 140, 190, 0.24); box-shadow: 0 24px 54px rgba(0,0,0,0.36); color: #172438; animation: topviewCardIn 240ms ease-out; }
  .modal-title { font-size: 20px; font-weight: 800; margin: 0 0 10px; text-align: center; }
  .modal-desc { font-size: 14px; color: #4a5e7a; text-align: center; margin: 0 0 18px; }
  .modal-actions { display: flex; gap: 10px; }
  .modal-actions button { flex: 1; border: 1px solid rgba(100, 130, 180, 0.3); background: rgba(230, 238, 250, 0.8); color: #2a3e5c; border-radius: 12px; padding: 12px; font-size: 14px; cursor: pointer; }
  .btn-primary { background: linear-gradient(180deg, #4a8cf0, #2e5fb5) !important; color: #fff !important; border-color: transparent !important; font-weight: 700; }

  /* 게임오버 */
  .gameover-card { text-align: center; }
  .gameover-score { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 12px 0 10px; }
  .gs-team { font-size: 13px; color: #506080; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gs-num { font-size: 40px; font-weight: 900; color: #172438; }
  .gs-sep { font-size: 24px; color: #8898b4; }
  .gameover-summary { font-size: 12px; color: #5a7090; margin: 0 0 12px; }
  .gameover-stats { display: flex; justify-content: center; gap: 16px; font-size: 13px; color: #3a5070; font-weight: 700; margin: 0 0 18px; }
  .gameover-exit { width: 100%; padding: 14px; border-radius: 14px; font-size: 15px; }
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
    .status-gauges { right: 12px; bottom: 76px; width: 216px; }
    .pitcher-sprite { left: 44%; }
    .batter-sprite { left: 57%; }
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
    .pitch-cluster { left: 12px; bottom: 144px; width: 136px; }
    .pitch-name { font-size: 12px; }
    .throw-btn { padding: 11px; font-size: 13px; }
    .utility-buttons { left: 12px; right: auto; bottom: 20px; }
    .status-gauges { left: 12px; right: auto; bottom: 68px; width: 188px; }
    .result-banner { bottom: 72px; font-size: 11px; }
    .engine-state { left: 12px; bottom: 62px; }
    .pitcher-sprite { left: 44%; bottom: 34%; width: 72px; height: 144px; }
    .catcher-sprite { bottom: 20%; width: 66px; height: 66px; }
    .umpire-sprite  { bottom: 24%; width: 40px; height: 72px; }
    .batter-sprite  { left: 57%; bottom: 20%; width: 64px; height: 110px; }
    .batter-sprite.hand-L { left: 38%; }
    .topview-field { height: 250px; }
    .play-transition { min-width: 190px; padding: 14px 16px; }
  }
</style>
