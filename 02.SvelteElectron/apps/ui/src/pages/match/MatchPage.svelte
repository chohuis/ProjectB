<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import BaseballField from "../../features/match-view/ui/BaseballField.svelte";
  import SettingsPanel from "../../features/settings/ui/SettingsPanel.svelte";
  import { fieldStyleStore, type FieldStyle } from "../../shared/stores/settings";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";
  import type { EntityRow } from "../../shared/stores/master";
  import type { InteractiveMatchContext, InteractiveMatchResult } from "../../shared/types/season";

  let fieldStyle: FieldStyle = 'retro';
  let settingsOpen = false;

  export let matchContext: InteractiveMatchContext | null = null;
  export let onComplete: (result: InteractiveMatchResult) => void = () => {};
  export let onCancel: () => void = () => {};
  // 실전 MatchPage는 기본적으로 로컬 데모 백업 모드를 사용하지 않음
  export let allowLocalFallback = false;

  type PitchType = "fastball" | "sinker" | "cutter" | "slider" | "curve" | "changeup" | "splitter" | "forkball" | "screwball" | "knuckleball";
  type PitchStrategy = "aggressive" | "balanced" | "safe";
  type PitchPower = "low" | "normal" | "high";
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

  interface FieldPoint {
    x: number;
    y: number;
  }

  type WeatherType = "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
  type ParkType = "neutral" | "pitcher_park" | "hitter_park" | "dome";

  interface SnapshotLike {
    inning: number;
    half: "top" | "bottom";
    outs: number;
    count: { balls: number; strikes: number };
    runners: { first: boolean; second: boolean; third: boolean };
    score: { home: number; away: number };
    inningScores?: { home: number[]; away: number[] };
    pitchCount: number;
    // local fallback fields
    stamina?: number;
    mental?: number;
    // engine fields
    protagonistStamina?: number;
    protagonistMental?: number;
    protagonistHasEntered?: boolean;
    protagonistExited?: boolean;
    protagonistSide?: "home" | "away";
    role?: "SP" | "RP" | "CP";
    pitchCountSinceEntry?: number;
    moundVisitsLeft?: number;
    isProtagonistPitching?: boolean;
    phase?: "protagonist_pitch" | "auto_inning" | "game_over";
    autoSimLogs?: string[];
    recentLogs: string[];
    batter?: { contact: number; power: number; eye: number };
    currentBatter?: { contact: number; power: number; eye: number };
    weather?: WeatherType;
    park?: ParkType;
    isFinished?: boolean;
    defenseStat?: { errors: number; assists: number; throwOuts: number; throwSafes: number };
  }

  const WEATHER_LABEL: Record<WeatherType, string> = {
    sunny: "맑음",
    cloudy: "흐림",
    rainy: "비",
    windy_in: "맞바람",
    windy_out: "뒷바람"
  };
  const PARK_LABEL: Record<ParkType, string> = {
    neutral: "중립 구장",
    pitcher_park: "투수 친화 구장",
    hitter_park: "타자 친화 구장",
    dome: "돔 구장"
  };

  const teamHeader = "팀";
  const innings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const sectionTitle = "경기 내용";
  const sceneTitle = "경기 화면";
  const awayLineupTitle = "원정 라인업";
  const homeLineupTitle = "홈 라인업";
  const baseStatusTitle = "진루 상황";
  const countTitle = "S / B / O";
  const zoneTitle = "투구 코스";
  const pitchSelectTitle = "투구 선택";
  const batterInfoTitle = "타자 정보";
  const pitcherInfoTitle = "투수 컨디션 정보";

  const awayLineup = ["1 RF", "2 CF", "3 1B", "4 DH", "5 LF", "6 3B", "7 C", "8 2B", "9 SS"];
  const homeLineup = ["1 2B", "2 SS", "3 RF", "4 1B", "5 3B", "6 DH", "7 LF", "8 C", "9 CF"];

  const baseField = {
    home:   { x: 500, y: 820 },
    first:  { x: 650, y: 670 },
    second: { x: 500, y: 520 },
    third:  { x: 350, y: 670 },
    mound:  { x: 500, y: 668 }
  };

  // 레트로 이미지 좌표 (probaseball.gif 기준)
  const retroField = {
    home:   { x: 497, y: 790 },
    first:  { x: 715, y: 580 },
    second: { x: 497, y: 454 },
    third:  { x: 280, y: 580 },
    mound:  { x: 497, y: 548 }
  };

  $: activeMound = fieldStyle === 'retro' ? retroField.mound : baseField.mound;

  function runnerOffset(base: 'first' | 'second' | 'third'): FieldPoint {
    if (fieldStyle === 'retro') {
      if (base === 'first') return { x: 14, y: -18 };
      if (base === 'second') return { x: 0, y: -20 };
      return { x: -14, y: -18 };
    }
    if (base === 'first') return { x: 18, y: -14 };
    if (base === 'second') return { x: 0, y: -18 };
    return { x: -18, y: -14 };
  }

  function runnerPoint(base: 'first' | 'second' | 'third'): FieldPoint {
    const f = fieldStyle === 'retro' ? retroField : baseField;
    const b = f[base];
    const o = runnerOffset(base);
    return { x: b.x + o.x, y: b.y + o.y };
  }

  // 타자/주자 애니메이션 상태 (레트로 전용)
  let batter: { handedness: 'L' | 'R' } = { handedness: 'R' };

  function getBatterPlatePos(handedness: 'L' | 'R'): FieldPoint {
    // 우타: 홈플레이트 왼쪽 오프셋, 좌타: 홈플레이트 오른쪽 오프셋
    const offset = handedness === 'R' ? -34 : 34;
    return { x: retroField.home.x + offset, y: retroField.home.y - 22 };
  }

  let retroBatterPos: FieldPoint | null = getBatterPlatePos('R');
  let retroRunnerPositions: (FieldPoint | null)[] = [null, null, null];

  function syncRetroPositions() {
    retroBatterPos = getBatterPlatePos(batter.handedness);
    retroRunnerPositions = [
      runners.first  ? runnerPoint('first')  : null,
      runners.second ? runnerPoint('second') : null,
      runners.third  ? runnerPoint('third')  : null,
    ];
  }

  async function animateRetroRunners(
    resultCode: PitchResultCode,
    prevRunners: { first: boolean; second: boolean; third: boolean }
  ) {
    type Movement = { from: FieldPoint; to: FieldPoint };
    const f = retroField;
    const movements: Movement[] = [];
    const bFrom = retroBatterPos ?? getBatterPlatePos(batter.handedness);

    if (resultCode === 'HIT_SINGLE') {
      movements.push({ from: { ...bFrom }, to: runnerPoint('first') });
      if (prevRunners.first)  movements.push({ from: runnerPoint('first'),  to: runnerPoint('second') });
      if (prevRunners.second) movements.push({ from: runnerPoint('second'), to: runnerPoint('third') });
      if (prevRunners.third)  movements.push({ from: { ...f.third },  to: { ...f.home } });
    } else if (resultCode === 'HIT_DOUBLE') {
      movements.push({ from: { ...bFrom }, to: runnerPoint('second') });
      if (prevRunners.first)  movements.push({ from: runnerPoint('first'),  to: runnerPoint('third') });
      if (prevRunners.second) movements.push({ from: { ...f.second }, to: { ...f.home } });
      if (prevRunners.third)  movements.push({ from: { ...f.third },  to: { ...f.home } });
    } else if (resultCode === 'HIT_TRIPLE') {
      movements.push({ from: { ...bFrom }, to: runnerPoint('third') });
      if (prevRunners.first)  movements.push({ from: { ...f.first },  to: { ...f.home } });
      if (prevRunners.second) movements.push({ from: { ...f.second }, to: { ...f.home } });
      if (prevRunners.third)  movements.push({ from: { ...f.third },  to: { ...f.home } });
    } else if (resultCode === 'HOME_RUN') {
      movements.push({ from: { ...bFrom }, to: { ...f.home } });
      if (prevRunners.first)  movements.push({ from: { ...f.first },  to: { ...f.home } });
      if (prevRunners.second) movements.push({ from: { ...f.second }, to: { ...f.home } });
      if (prevRunners.third)  movements.push({ from: { ...f.third },  to: { ...f.home } });
    } else if (resultCode === 'WALK') {
      movements.push({ from: { ...bFrom }, to: runnerPoint('first') });
      if (prevRunners.first) movements.push({ from: runnerPoint('first'), to: runnerPoint('second') });
      if (prevRunners.first && prevRunners.second)
        movements.push({ from: runnerPoint('second'), to: runnerPoint('third') });
      if (prevRunners.first && prevRunners.second && prevRunners.third)
        movements.push({ from: { ...f.third }, to: { ...f.home } });
    } else if (resultCode === 'INPLAY_OUT') {
      retroBatterPos = null;
      return;
    } else {
      return;
    }

    if (movements.length === 0) return;
    retroBatterPos = null; // 타자 이동 시작 시 타자 스프라이트 숨김

    const duration = 450;
    const frame = 16;
    const steps = Math.round(duration / frame);

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const eased = 1 - (1 - t) * (1 - t);
      retroRunnerPositions = movements.map(m => ({
        x: Math.round(m.from.x + (m.to.x - m.from.x) * eased),
        y: Math.round(m.from.y + (m.to.y - m.from.y) * eased),
      }));
      await sleep(frame);
    }
  }

  const zones = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

  /** 착탄 좌표(x,y) → 캔버스 비율(px,py) 변환. 스트라이크존 = x∈[-1,1], y∈[-1,1] */
  function landingToPct(x: number, y: number): { px: number; py: number } {
    return {
      px: 0.10 + ((x + 1) / 2) * 0.80,
      py: 0.08 + ((y + 1) / 2) * 0.84,
    };
  }

  let zoneClickPct = { px: 0.5, py: 0.5 };
  let zoneHoverPct: { px: number; py: number } | null = null;
  let lastPitchPct: { px: number; py: number } | null = null;
  let zoneCanvasEl: HTMLDivElement | null = null;

  // 캔버스 비율 좌표를 필드 SVG 좌표로 변환
  // 스트라이크존 박스: 캔버스 x 10~90%, y 8~92% => 필드 x 470~530, y 730~790
  // 볼 이동: 캔버스 각 방향 10%/8% 변화당 필드 약 7.5/5.7 이동
  $: clickedFieldPos = {
    x: Number((462.5 + zoneClickPct.px * 75).toFixed(1)),
    y: Number((724.3 + zoneClickPct.py * 71.4).toFixed(1))
  } as FieldPoint;

  // 클릭 위치 → zone(로그용) + target(연속 좌표, 엔진 전달용)
  function getZoneFromClick(px: number, py: number): { zone: (typeof zones)[number]; target: { x: number; y: number } } {
    const normX = (px - 0.10) / 0.80;   // 스트라이크존 내 비율 (밖은 0~1 초과)
    const normY = (py - 0.08) / 0.84;
    // 연속 좌표: [-1,1] 범위, 존 밖도 그대로 전달
    const target = { x: normX * 2 - 1, y: normY * 2 - 1 };
    const zoneMap: (typeof zones)[number][][] = [[7,8,9],[4,5,6],[1,2,3]];
    const zone = zoneMap[Math.min(2, Math.floor(Math.max(0, Math.min(1, normY)) * 3))][Math.min(2, Math.floor(Math.max(0, Math.min(1, normX)) * 3))];
    return { zone, target };
  }
  let selectedZone: (typeof zones)[number] = 5;
  let pitchTarget: { x: number; y: number } = { x: 0, y: 0 };
  let isIntentionalBall = false;
  $: ({ zone: selectedZone, target: pitchTarget } = getZoneFromClick(zoneClickPct.px, zoneClickPct.py));
  $: isIntentionalBall = Math.abs(pitchTarget.x) > 1 || Math.abs(pitchTarget.y) > 1;

  function handleZoneClick(e: MouseEvent) {
    if (!zoneCanvasEl) return;
    const rect = zoneCanvasEl.getBoundingClientRect();
    zoneClickPct = {
      px: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      py: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    };
  }

  function handleZoneMouseMove(e: MouseEvent) {
    if (!zoneCanvasEl || isPitching) return;
    const rect = zoneCanvasEl.getBoundingClientRect();
    zoneHoverPct = {
      px: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      py: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    };
  }

  // 수비 기본 위치 (SVG 좌표 1000x920)
  const DEFENSE_NORMAL_BASE = [
    { pos: "P",  x: 500, y: 668 },
    { pos: "C",  x: 500, y: 800 },
    { pos: "1B", x: 650, y: 675 },
    { pos: "2B", x: 590, y: 575 },
    { pos: "SS", x: 410, y: 575 },
    { pos: "3B", x: 350, y: 675 },
    { pos: "LF", x: 330, y: 600 },
    { pos: "CF", x: 500, y: 510 },
    { pos: "RF", x: 670, y: 600 }
  ] as { pos: string; x: number; y: number }[];

  const DEFENSE_RETRO_BASE = [
    { pos: "P",  x: 497, y: 548 },
    { pos: "C",  x: 497, y: 800 },
    { pos: "1B", x: 710, y: 588 },
    { pos: "2B", x: 600, y: 508 },
    { pos: "SS", x: 387, y: 508 },
    { pos: "3B", x: 272, y: 588 },
    { pos: "LF", x: 242, y: 518 },
    { pos: "CF", x: 497, y: 434 },
    { pos: "RF", x: 752, y: 518 }
  ] as { pos: string; x: number; y: number }[];

  // 애니메이션 중 위치 변경을 반영하기 위한 상태
  let defenseNormal = DEFENSE_NORMAL_BASE.map(d => ({ ...d }));
  let defenseRetro  = DEFENSE_RETRO_BASE.map(d => ({ ...d }));

  // 현재 이동 중인 수비수 포지션
  let activeFielderPos: string | null = null;
  // 실책 발생 수비수 포지션 (플래시 표시용)
  let errorFlashPos: string | null = null;

  let totalStrikeouts = 0;
  let totalHitsAllowed = 0;
  let totalWalksAllowed = 0;
  let totalOutsRecorded = 0;
  let matchDefenseStat = { errors: 0, assists: 0, throwOuts: 0, throwSafes: 0 };

  interface GameResult {
    awayScore: number; homeScore: number;
    pitchCount: number; strikeouts: number; errors: number;
    hitsAllowed: number; walksAllowed: number; outsRecorded: number; runsAllowed: number;
    won: boolean; summary: string;
    protagonistEntered?: boolean;
    batterLines?: import('../../shared/types/season').BatterGameLine[];
    playerLines?: import('../../shared/types/season').PlayerGameLine[];
    midGameInjury?: { injuryType: string; severity: string };
  }
  let isGameOver = false;
  let gameResult: GameResult = { awayScore: 0, homeScore: 0, pitchCount: 0, strikeouts: 0, errors: 0, hitsAllowed: 0, walksAllowed: 0, outsRecorded: 0, runsAllowed: 0, won: false, summary: '' };
  let midGameInjuryAlert: { injuryType: string; severity: string } | null = null;

  // 엔진 0~100 좌표와 SVG 수비 좌표 매핑용 lookup
  const FIELD_ENGINE_REF: Record<string, { x: number; y: number }> = {
    "P":  { x: 50, y: 62 }, "C":  { x: 50, y: 90 },
    "1B": { x: 78, y: 70 }, "2B": { x: 63, y: 55 },
    "3B": { x: 22, y: 70 }, "SS": { x: 37, y: 55 },
    "LF": { x: 18, y: 28 }, "CF": { x: 50, y: 16 }, "RF": { x: 82, y: 28 },
    "home": { x: 50, y: 88 }, "1B_base": { x: 78, y: 70 },
    "2B_base": { x: 50, y: 52 }, "3B_base": { x: 22, y: 70 },
  };

  function enginePosToSvg(p: { x: number; y: number }): FieldPoint {
    // 가장 가까운 사전 정의 수비수 SVG 좌표로 매핑
    const base = fieldStyle === 'retro' ? DEFENSE_RETRO_BASE : DEFENSE_NORMAL_BASE;
    let minDist = Infinity;
    let best = base[0];
    for (const ref of base) {
      const eng = FIELD_ENGINE_REF[ref.pos];
      if (!eng) continue;
      const dx = p.x - eng.x, dy = p.y - eng.y;
      const d = dx * dx + dy * dy;
      if (d < minDist) { minDist = d; best = ref; }
    }
    return { x: best.x, y: best.y };
  }

  function toLeagueId(stage: string): string {
    if (stage === 'university') return 'LEAGUE_UNIVERSITY';
    if (stage === 'pro_kbl')   return 'LEAGUE_KBL';
    if (stage === 'pro_abl')   return 'LEAGUE_ABL';
    return 'LEAGUE_HIGHSCHOOL';
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

    // 상대팀 타자 데이터가 9명 미만이면 리그 전체에서 대체 (seed/blank 대응)
    const opponents =
      opponentsInTeam.length >= 9
        ? opponentsInTeam
        : entities.filter((e: EntityRow) =>
            e.role === 'player' &&
            !pitcherPos.includes(String((e.details as any)?.player?.position ?? ''))
          );

    if (opponents.length < 9) return [];
    const sorted = [...opponents].sort((a: EntityRow, b: EntityRow) =>
      ((b.details as any)?.player?.batting?.ovr ?? 0) - ((a.details as any)?.player?.batting?.ovr ?? 0)
    );

    // 포지션 기반 우선 선발, 부족 인원은 OVR 상위로 채움
    const picked: EntityRow[] = [];
    const used = new Set<string>();
    for (const pos of fieldOrder) {
      const found = sorted.find((e) => {
        if (used.has(e.id)) return false;
        const p = String((e.details as any)?.player?.position ?? "");
        return p === pos;
      });
      if (found) {
        used.add(found.id);
        picked.push(found);
      }
    }
    for (const e of sorted) {
      if (picked.length >= 9) break;
      if (used.has(e.id)) continue;
      used.add(e.id);
      picked.push(e);
    }

    return picked.slice(0, 9).map((e: EntityRow) => {
      const bat = (e.details as any)?.player?.batting ?? {};
      return {
        id: e.id,
        name: e.name ?? undefined,
        contact: bat.contact ?? 50, power: bat.power ?? 50,
        eye: bat.eye ?? 50, discipline: bat.discipline ?? 50,
        battingClutch: bat.battingClutch ?? 50, platoon: bat.platoon ?? 50,
        speed: bat.speed ?? 50, baseInstinct: bat.baseInstinct ?? 50,
        fielding: bat.fielding ?? 50, arm: bat.arm ?? 50,
      };
    });
  }

  function buildLineupForTeam(teamId: string): import('../../shared/types/projectb').MatchBatterStats[] {
    return buildOpponentLineup(teamId);
  }

  function buildPitcherStatsForTeam(teamId: string): {
    command?: number; velocity?: number; staminaCap?: number;
    mentalResil?: number; control?: number; movement?: number;
    clutch?: number; holdRunners?: number;
  } | undefined {
    const entities = get(masterStore).entities;
    const pitcherPos = ['SP', 'RP', 'CP'];
    const pitchers = entities.filter((e: EntityRow) =>
      e.teamId === teamId &&
      e.role === 'player' &&
      pitcherPos.includes(String((e.details as any)?.player?.position ?? ''))
    );
    if (pitchers.length === 0) return undefined;
    const sorted = [...pitchers].sort((a: EntityRow, b: EntityRow) => {
      const posOrder: Record<string, number> = { SP: 0, RP: 1, CP: 2 };
      const aDiff = posOrder[String((a.details as any)?.player?.position ?? 'RP')] ?? 1;
      const bDiff = posOrder[String((b.details as any)?.player?.position ?? 'RP')] ?? 1;
      if (aDiff !== bDiff) return aDiff - bDiff;
      return ((b.details as any)?.player?.pitching?.ovr ?? 0) - ((a.details as any)?.player?.pitching?.ovr ?? 0);
    });
    const src = sorted[0];
    const pit = (src.details as any)?.player?.pitching ?? {};
    return {
      name: src.name ?? undefined,
      command: pit.command ?? 50,
      velocity: pit.velocity ?? 50,
      staminaCap: pit.stamina ?? 50,
      mentalResil: pit.mentality ?? 50,
      control: pit.control ?? 50,
      movement: pit.movement ?? 50,
      clutch: pit.clutch ?? 50,
      holdRunners: pit.holdRunners ?? 50,
    };
  }

  function buildOpponentFielders(opponentTeamId: string): import('../../shared/types/projectb').MatchFielderStats[] {
    const entities = get(masterStore).entities.filter(
      (e: EntityRow) => e.teamId === opponentTeamId && e.role === "player"
    );
    const posOrder: Array<import('../../shared/types/projectb').MatchFielderStats["position"]> = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
    const posToXY: Record<string, { x: number; y: number }> = {
      P: { x: 50, y: 62 }, C: { x: 50, y: 90 }, "1B": { x: 78, y: 70 }, "2B": { x: 63, y: 55 },
      "3B": { x: 22, y: 70 }, SS: { x: 37, y: 55 }, LF: { x: 18, y: 28 }, CF: { x: 50, y: 16 }, RF: { x: 82, y: 28 },
    };
    const pickByPos = (pos: string) =>
      entities.find((e) => String((e.details as any)?.player?.position ?? "") === pos);
    const pickPitcher = () =>
      pickByPos("SP") ?? pickByPos("RP") ?? pickByPos("CP") ?? entities[0];

    return posOrder.map((pos) => {
      const source = pos === "P" ? pickPitcher() : pickByPos(pos);
      const bat = (source?.details as any)?.player?.batting ?? {};
      return {
        position: pos,
        name: source?.name ?? pos,
        fielding: bat.fielding ?? 50,
        arm: bat.arm ?? 50,
        speed: bat.speed ?? 50,
        x: posToXY[pos].x,
        y: posToXY[pos].y,
      };
    });
  }

  const PITCH_ID_TO_ENGINE: Record<string, PitchType> = {
    PITCH_FASTBALL: "fastball",
    PITCH_SINKER: "sinker",
    PITCH_CUTTER: "cutter",
    PITCH_SLIDER: "slider",
    PITCH_CURVE: "curve",
    PITCH_CHANGEUP: "changeup",
    PITCH_SPLITTER: "splitter",
    PITCH_FORKBALL: "forkball",
    PITCH_SCREWBALL: "screwball",
    PITCH_KNUCKLEBALL: "knuckleball",
  };
  const fallbackPitchTypes: { id: PitchType; label: string }[] = [
    { id: "fastball", label: "Fastball" }
  ];

  const strategies: { id: PitchStrategy; label: string }[] = [
    { id: "aggressive", label: "공격" },
    { id: "balanced", label: "균형" },
    { id: "safe", label: "안정" }
  ];

  const powers: { id: PitchPower; label: string }[] = [
    { id: "low", label: "약" },
    { id: "normal", label: "보통" },
    { id: "high", label: "강" }
  ];

  let pitchTypes: { id: PitchType; label: string }[] = [...fallbackPitchTypes];
  let selectedPitchType: PitchType = "fastball";
  let selectedStrategy: PitchStrategy = "balanced";
  let selectedPower: PitchPower = "normal";

  let engineAvailable = false;
  let engineStarted = false;
  let isPitching = false;
  let isAutoSimming = false;
  let engineErrorMsg = "";
  let currentPhase: "protagonist_pitch" | "auto_inning" | "game_over" = "protagonist_pitch";
  let protagonistHasEntered = true;
  let snapshotPitchCount = 0;
  let snapshotPitchCountSinceEntry = 0;
  let protagonistSide: "home" | "away" = "home";
  let postExitPopupVisible = false;
  let postExitReason = "";

  let inning = 1;
  let half: "top" | "bottom" = "top";

  let count = { strike: 0, ball: 0, out: 0 };
  let runners = { first: true, second: false, third: false };

  let scoreRows = [
    {
      team: "원정",
      inningScores: Array(12).fill(0),
      r: 0,
      h: 0,
      e: 0,
      b: 0
    },
    {
      team: "홈",
      inningScores: Array(12).fill(0),
      r: 0,
      h: 0,
      e: 0,
      b: 0
    }
  ];
  $: {
    const catalogNameById = new Map($masterStore.pitchCatalog.map((p) => [p.id, p.nameKo ?? p.name]));
    const rawPitches = $gameStore.protagonist.pitches ?? [{ id: "PITCH_FASTBALL", grade: 3 as const }];
    const mapped = rawPitches
      .map((entry) => {
        const id = PITCH_ID_TO_ENGINE[entry.id];
        if (!id) return null;
        return {
          id,
          label: catalogNameById.get(entry.id) ?? entry.id.replace("PITCH_", ""),
        };
      })
      .filter((entry): entry is { id: PitchType; label: string } => Boolean(entry));
    const deduped: { id: PitchType; label: string }[] = [];
    for (const pitch of mapped) {
      if (deduped.some((d) => d.id === pitch.id)) continue;
      deduped.push(pitch);
    }
    pitchTypes = deduped.length > 0 ? deduped : [...fallbackPitchTypes];
    if (!pitchTypes.some((p) => p.id === selectedPitchType)) {
      selectedPitchType = pitchTypes[0].id;
    }
  }

  $: if (matchContext) {
    const teamById = new Map($masterStore.teams.map((t) => [t.id, t.name]));
    scoreRows = [
      { ...scoreRows[0], team: teamById.get(matchContext.awayTeamId) ?? matchContext.awayTeamId },
      { ...scoreRows[1], team: teamById.get(matchContext.homeTeamId) ?? matchContext.homeTeamId },
    ];
  }

  let playByPlayLines: { text: string; cls: string }[] = [
    { text: "매치 엔진 초기화 중...", cls: "" }
  ];

  let batterInfo = [
    { label: "컨택", value: "50" },
    { label: "파워", value: "50" },
    { label: "선구", value: "50" }
  ];

  let matchWeather: WeatherType = "sunny";
  let matchPark: ParkType = "neutral";

  function statToKmh(stat: number, power: PitchPower = "normal"): number {
    const base = Math.round(100 + stat * 0.65);
    const bonus = power === "high" ? 5 : power === "low" ? -5 : 0;
    return base + bonus;
  }

  const _initPlayer = get(gameStore).player;
  let pitcherState = {
    name: _initPlayer.name,
    speed: `${statToKmh(_initPlayer.pitcherStats.velocity)} km/h`,
    stamina: _initPlayer.condition,
    mental: 74
  };

  let ballPos: FieldPoint = { ...baseField.mound };
  let ballTrail: FieldPoint[] = [];
  const TRAIL_MAX = 6;
  let resultOverlay = { visible: false, text: '', color: '#ffffff' };
  let overlayTimer: ReturnType<typeof setTimeout> | null = null;
  let changeAlert = { visible: false };
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  let selectedDefPosition = "";

  const localEngineState: SnapshotLike = {
    inning: 1,
    half: "top",
    outs: 0,
    count: { balls: 0, strikes: 0 },
    runners: { first: false, second: false, third: false },
    score: { away: 0, home: 0 },
    pitchCount: 0,
    stamina: 82,
    mental: 74,
    recentLogs: ["경기 시작"]
  };

  $: inningHalfLabel = `${inning}회 ${half === "top" ? "초" : "말"}`;
  // 초: 원정 공격(홈 수비), 말: 홈 공격(원정 수비)
  $: fieldingTeam = (half === 'top' ? 'home' : 'away') as 'home' | 'away';
  $: staminaColor = pitcherState.stamina > 60 ? '#37d67a' : pitcherState.stamina > 30 ? '#ffd54f' : '#ff4a4a';
  $: mentalColor  = pitcherState.mental  > 60 ? '#5b9cf6' : pitcherState.mental  > 30 ? '#c47af5' : '#ff6b9d';

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (settingsOpen) { settingsOpen = false; return; }
      onCancel();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    void initMatchEngine();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  async function initMatchEngine() {
    if (!window.projectB?.matchStart) {
      engineAvailable = false;
      return;
    }

    try {
      const state = get(gameStore);
      const player = state.player;
      if (get(masterStore).entities.length === 0) {
        await masterStore.loadEntities(toLeagueId(state.protagonist.careerStage));
      }
      const myTeamId = matchContext?.protagonistTeamId ?? state.protagonist.teamId;
      const opponentTeamId = matchContext
        ? (matchContext.homeTeamId === myTeamId ? matchContext.awayTeamId : matchContext.homeTeamId)
        : "";
      const opponentLineup = opponentTeamId ? buildOpponentLineup(opponentTeamId) : [];
      const fielders = opponentTeamId ? buildOpponentFielders(opponentTeamId) : [];
      const myLineup = myTeamId ? buildLineupForTeam(myTeamId) : [];
      const opponentPitcherStats = opponentTeamId ? buildPitcherStatsForTeam(opponentTeamId) : undefined;
      const ctx = matchContext;
      const myNpcStarterStats = (ctx?.role !== 'SP' && myTeamId) ? buildPitcherStatsForTeam(myTeamId) : undefined;
      const isHome = !ctx || ctx.protagonistTeamId === ctx.homeTeamId;
      const myManagerEntity = get(masterStore).entities.find(
        (e) => e.role === "manager" && e.teamId === myTeamId
      );
      const myManagerStats = myManagerEntity ? {
        bullpenRead:    myManagerEntity.details.manager.riskTolerance,
        clutchDecision: myManagerEntity.details.manager.stats.handlePressure,
        tacticalIQ:     myManagerEntity.details.manager.stats.strategy,
        motivator:      myManagerEntity.details.manager.stats.motivation,
        offenseMind:    myManagerEntity.details.manager.stats.strategy,
      } : undefined;
      const response = await window.projectB.matchStart({
        initialStamina: player.condition,
        initialMental: 74,
        pitcher: { ...player.pitcherStats, name: player.name },
        weather: matchWeather,
        park: matchPark,
        role: (ctx?.role ?? "SP") as "SP" | "RP" | "CP",
        protagonistSide: isHome ? "home" : "away",
        ...(ctx?.entryTrigger ? { entryTrigger: ctx.entryTrigger } : {}),
        ...(opponentLineup.length >= 9 ? { opponentLineup } : {}),
        ...(myLineup.length >= 9 ? { myTeamLineup: myLineup } : { batterMean: 50 }),
        ...(fielders.length >= 9 ? { fielders } : {}),
        ...(opponentPitcherStats ? { opponentPitcher: opponentPitcherStats } : {}),
        ...(myNpcStarterStats ? { npcStarterPitcher: myNpcStarterStats } : {}),
        ...(myManagerStats ? { myManager: myManagerStats } : {}),
      });
      engineAvailable = true;
      engineStarted = true;
      engineErrorMsg = "";
      applySnapshot(response.snapshot, "매치 엔진 연결 완료");
      if (currentPhase === "auto_inning") {
        await runAutoInnings();
      }
    } catch (e) {
      engineAvailable = false;
      engineStarted = false;
      engineErrorMsg = `매치 엔진 연결 실패: ${String((e as Error)?.message ?? e)}`;
      if (allowLocalFallback) {
        pushLog("로컬 시뮬레이터 모드로 동작합니다.");
      } else {
        pushLog("매치 엔진 연결 실패: 직접 플레이를 시작할 수 없습니다.");
      }
    }
  }

  function resultToCls(code: PitchResultCode): string {
    if (code === 'HOME_RUN') return 'log-homerun';
    if (code === 'HIT_SINGLE' || code === 'HIT_DOUBLE' || code === 'HIT_TRIPLE') return 'log-hit';
    if (code === 'WALK') return 'log-walk';
    if (code === 'STRIKE_SWING' || code === 'STRIKE_LOOK') return 'log-strike';
    if (code === 'FOUL') return 'log-foul';
    if (code === 'BALL') return 'log-ball';
    if (code === 'INPLAY_OUT' || code === 'FIELDING_ERROR') return 'log-out';
    return '';
  }

  function pushLog(line: string, cls = '') {
    playByPlayLines = [{ text: line, cls }, ...playByPlayLines].slice(0, 20);
  }

  function updateScoreRows(
    awayScore: number,
    homeScore: number,
    resultCode: PitchResultCode,
    snapshot: SnapshotLike,
  ) {
    // top이닝 = away팀 타격, bottom이닝 = home팀 타격
    const battingTeamIsAway = snapshot.half === "top";
    const isHit = resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN";
    const isError = resultCode === "FIELDING_ERROR";

    if (snapshot.inningScores) {
      // Engine provides per-inning scores directly
      const eng = snapshot.inningScores;
      scoreRows = scoreRows.map((row, idx) => {
        const isAway = idx === 0;
        const source = isAway ? eng.away : eng.home;
        const padded = source.slice(0, 12).concat(Array(Math.max(0, 12 - source.length)).fill(0));
        const isBattingTeam = isAway === battingTeamIsAway;
        const isProtSide = (isAway && protagonistSide === "away") || (!isAway && protagonistSide === "home");
        return {
          ...row,
          inningScores: padded,
          r: isAway ? awayScore : homeScore,
          h: row.h + (isBattingTeam && isHit ? 1 : 0),
          b: row.b + (isBattingTeam && resultCode === "WALK" ? 1 : 0),
          e: row.e + (isError && isProtSide ? 1 : 0),
        };
      });
      return;
    }

    // Local fallback: only the current batting half scores in the current inning cell
    const inningIndex = Math.max(0, Math.min(11, (snapshot.inning ?? 1) - 1));
    const isTop = battingTeamIsAway;
    scoreRows = scoreRows.map((row, idx) => {
      const nextInningScores = [...row.inningScores];
      if (idx === 0 && isTop)  nextInningScores[inningIndex] = awayScore - (scoreRows[0].r - (scoreRows[0].inningScores[inningIndex] ?? 0));
      if (idx === 1 && !isTop) nextInningScores[inningIndex] = homeScore - (scoreRows[1].r - (scoreRows[1].inningScores[inningIndex] ?? 0));
      const isBattingTeam = (idx === 0 && isTop) || (idx === 1 && !isTop);
      const isProtSide = (idx === 0 && protagonistSide === "away") || (idx === 1 && protagonistSide === "home");
      return {
        ...row,
        inningScores: nextInningScores,
        r: idx === 0 ? awayScore : homeScore,
        h: row.h + (isBattingTeam && isHit ? 1 : 0),
        b: row.b + (isBattingTeam && resultCode === "WALK" ? 1 : 0),
        e: row.e + (isError && isProtSide ? 1 : 0),
      };
    });
  }

  function applySnapshot(snapshot: SnapshotLike, line?: string, resultCode: PitchResultCode = "BALL") {
    inning = snapshot.inning;
    half = snapshot.half;
    count = { strike: snapshot.count.strikes, ball: snapshot.count.balls, out: snapshot.outs };
    runners = { ...snapshot.runners };

    const stamina = snapshot.protagonistStamina ?? snapshot.stamina ?? pitcherState.stamina;
    const mental  = snapshot.protagonistMental  ?? snapshot.mental  ?? pitcherState.mental;
    pitcherState = { ...pitcherState, stamina, mental };

    const batter = snapshot.currentBatter ?? snapshot.batter;
    if (batter) {
      batterInfo = [
        { label: "컨택", value: String(batter.contact) },
        { label: "파워", value: String(batter.power) },
        { label: "선구", value: String(batter.eye) }
      ];
    }
    if (snapshot.weather) matchWeather = snapshot.weather;
    if (snapshot.park) matchPark = snapshot.park;
    if (snapshot.defenseStat) matchDefenseStat = { ...snapshot.defenseStat };

    if (snapshot.phase !== undefined) currentPhase = snapshot.phase;
    if (snapshot.protagonistHasEntered !== undefined) protagonistHasEntered = snapshot.protagonistHasEntered;
    if (snapshot.protagonistSide !== undefined) protagonistSide = snapshot.protagonistSide;
    snapshotPitchCount = snapshot.pitchCount;
    snapshotPitchCountSinceEntry = snapshot.pitchCountSinceEntry ?? 0;

    updateScoreRows(snapshot.score.away, snapshot.score.home, resultCode, snapshot);

    if (line) pushLog(line, resultToCls(resultCode));

    // Print auto-sim logs (inning transitions, NPC batting results)
    if (snapshot.autoSimLogs?.length) {
      for (const log of snapshot.autoSimLogs.slice(-8)) pushLog(log, "log-auto");
    }
  }

  function getBattedTarget(resultCode: PitchResultCode): FieldPoint {
    if (resultCode === "INPLAY_OUT") return { x: 560, y: 560 };
    if (resultCode === "HIT_SINGLE") return { x: 710, y: 640 };
    if (resultCode === "HIT_DOUBLE") return { x: 680, y: 430 };
    if (resultCode === "HIT_TRIPLE") return { x: 330, y: 360 };
    return { x: 500, y: 230 };
  }

  async function tweenBall(to: FieldPoint, duration: number) {
    const from = { ...ballPos };

    if (fieldStyle === 'dot') {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.round(dist / 10));
      const delay = Math.max(20, Math.round(duration / steps));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        ballTrail = [...ballTrail, { ...ballPos }].slice(-TRAIL_MAX);
        ballPos = { x: Math.round(from.x + dx * t), y: Math.round(from.y + dy * t) };
        await sleep(delay);
      }
    } else {
      const frame = 16;
      const steps = Math.max(1, Math.round(duration / frame));
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const eased = 1 - (1 - t) * (1 - t);
        ballTrail = [...ballTrail, { ...ballPos }].slice(-TRAIL_MAX);
        ballPos = {
          x: Number((from.x + (to.x - from.x) * eased).toFixed(2)),
          y: Number((from.y + (to.y - from.y) * eased).toFixed(2))
        };
        await sleep(frame);
      }
    }
    ballTrail = [];
  }

  function showResultOverlay(code: PitchResultCode) {
    const map: Partial<Record<PitchResultCode, { text: string; color: string }>> = {
      STRIKE_SWING: { text: "헛스윙!", color: "#37d67a" },
      STRIKE_LOOK: { text: "스트라이크!", color: "#37d67a" },
      BALL: { text: "볼", color: "#7a8fa8" },
      FOUL: { text: "파울", color: "#ffd54f" },
      INPLAY_OUT: { text: "아웃!", color: "#ff8c42" },
      FIELDING_ERROR: { text: "실책!", color: "#ff4a4a" },
      HIT_SINGLE: { text: "안타!", color: "#ffd54f" },
      HIT_DOUBLE: { text: "2루타!", color: "#ffd54f" },
      HIT_TRIPLE: { text: "3루타!", color: "#ff9800" },
      HOME_RUN: { text: "홈런!!", color: "#ff4a4a" },
      WALK: { text: "볼넷", color: "#7a8fa8" },
    };
    const entry = map[code] ?? { text: code, color: '#ffffff' };
    if (overlayTimer) clearTimeout(overlayTimer);
    resultOverlay = { visible: true, ...entry };
    overlayTimer = setTimeout(() => {
      resultOverlay = { ...resultOverlay, visible: false };
    }, 1400);
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function rollLocalResult(): PitchResultCode {
    const roll = Math.random();

    if (roll < 0.18) return "STRIKE_SWING";
    if (roll < 0.34) return "STRIKE_LOOK";
    if (roll < 0.47) return "FOUL";
    if (roll < 0.62) return "BALL";
    if (roll < 0.73) return "INPLAY_OUT";
    if (roll < 0.86) return "HIT_SINGLE";
    if (roll < 0.93) return "HIT_DOUBLE";
    if (roll < 0.97) return "HIT_TRIPLE";
    return "HOME_RUN";
  }

  function applyLocalResult(resultCode: PitchResultCode): { snapshot: SnapshotLike; resolvedCode: PitchResultCode; inningChange: boolean } {
    localEngineState.pitchCount += 1;
    localEngineState.stamina = Math.max(0, Number((localEngineState.stamina - 0.8).toFixed(1)));

    // In local mode: top = away batting, bottom = home batting
    const battingTeam = localEngineState.half === "top" ? "away" : "home";

    if (resultCode === "BALL") {
      localEngineState.count.balls += 1;
      if (localEngineState.count.balls >= 4) {
        localEngineState.count.balls = 0;
        localEngineState.count.strikes = 0;
        resultCode = "WALK";
        if (localEngineState.runners.first && localEngineState.runners.second && localEngineState.runners.third) {
          localEngineState.score[battingTeam] += 1;
        }
        localEngineState.runners.third = localEngineState.runners.third || localEngineState.runners.second;
        localEngineState.runners.second = localEngineState.runners.second || localEngineState.runners.first;
        localEngineState.runners.first = true;
      }
    } else if (resultCode === "STRIKE_SWING" || resultCode === "STRIKE_LOOK") {
      localEngineState.count.strikes += 1;
      if (localEngineState.count.strikes >= 3) {
        localEngineState.outs += 1;
        localEngineState.count.balls = 0;
        localEngineState.count.strikes = 0;
      }
    } else if (resultCode === "FOUL") {
      if (localEngineState.count.strikes < 2) {
        localEngineState.count.strikes += 1;
      }
    } else if (resultCode === "INPLAY_OUT") {
      localEngineState.outs += 1;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
    } else if (resultCode === "HIT_SINGLE") {
      if (localEngineState.runners.third) localEngineState.score[battingTeam] += 1;
      localEngineState.runners.third = localEngineState.runners.second;
      localEngineState.runners.second = localEngineState.runners.first;
      localEngineState.runners.first = true;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
    } else if (resultCode === "HIT_DOUBLE") {
      if (localEngineState.runners.third) localEngineState.score[battingTeam] += 1;
      if (localEngineState.runners.second) localEngineState.score[battingTeam] += 1;
      localEngineState.runners.third = localEngineState.runners.first;
      localEngineState.runners.second = true;
      localEngineState.runners.first = false;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
    } else if (resultCode === "HIT_TRIPLE") {
      if (localEngineState.runners.third) localEngineState.score[battingTeam] += 1;
      if (localEngineState.runners.second) localEngineState.score[battingTeam] += 1;
      if (localEngineState.runners.first) localEngineState.score[battingTeam] += 1;
      localEngineState.runners.third = true;
      localEngineState.runners.second = false;
      localEngineState.runners.first = false;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
    } else if (resultCode === "HOME_RUN") {
      if (localEngineState.runners.third) localEngineState.score[battingTeam] += 1;
      if (localEngineState.runners.second) localEngineState.score[battingTeam] += 1;
      if (localEngineState.runners.first) localEngineState.score[battingTeam] += 1;
      localEngineState.score[battingTeam] += 1;
      localEngineState.runners.third = false;
      localEngineState.runners.second = false;
      localEngineState.runners.first = false;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
    }

    let inningChange = false;
    if (localEngineState.outs >= 3) {
      inningChange = true;
      localEngineState.outs = 0;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
      localEngineState.runners = { first: false, second: false, third: false };
      if (localEngineState.half === "top") {
        localEngineState.half = "bottom";
      } else {
        localEngineState.half = "top";
        localEngineState.inning += 1;
      }
    }

    localEngineState.mental = Math.max(0, Number((localEngineState.mental + (resultCode.includes("HIT") || resultCode === "HOME_RUN" ? -0.9 : 0.4)).toFixed(1)));
    localEngineState.recentLogs = [...localEngineState.recentLogs.slice(-29), `로컬엔진: ${resultCode}`];

    return {
      resolvedCode: resultCode,
      inningChange,
      snapshot: {
        ...localEngineState,
        count: { ...localEngineState.count },
        runners: { ...localEngineState.runners },
        score: { ...localEngineState.score },
        recentLogs: [...localEngineState.recentLogs]
      }
    };
  }

  function applyBatchStats(batchStats: { hits: number; walks: number; errors: number; isTop: boolean } | null) {
    if (!batchStats) return;
    const { hits, walks, errors, isTop } = batchStats;
    const battingIdx = isTop ? 0 : 1;
    const fieldingIdx = isTop ? 1 : 0;
    scoreRows = scoreRows.map((row, idx) => {
      if (idx === battingIdx) return { ...row, h: row.h + hits, b: row.b + walks };
      if (idx === fieldingIdx) return { ...row, e: row.e + errors };
      return row;
    });
  }

  async function runAutoInnings() {
    if (!window.projectB?.matchNextInning) return;
    isAutoSimming = true;
    try {
      while (currentPhase === "auto_inning" && !isGameOver) {
        const response = await window.projectB.matchNextInning();
        for (const log of response.logs) {
          pushLog(log, "log-auto");
          await sleep(600);
        }
        applySnapshot(response.snapshot);
        applyBatchStats(response.batchStats);
        if (response.protagonistJustExited) {
          postExitReason = response.exitReason ?? "";
          postExitPopupVisible = true;
          break;
        }
        if (response.snapshot.isFinished) {
          await handleGameOver();
          break;
        }
      }
    } finally {
      isAutoSimming = false;
    }
  }

  function showChangeAlert() {
    if (changeTimer) clearTimeout(changeTimer);
    changeAlert = { visible: true };
    changeTimer = setTimeout(() => {
      changeAlert = { visible: false };
    }, 2200);
  }

  async function animateFielderMove(pos: string, svgTo: FieldPoint, duration: number) {
    const arr = fieldStyle === 'retro' ? defenseRetro : defenseNormal;
    const idx = arr.findIndex(d => d.pos === pos);
    if (idx < 0) return;
    const from = { x: arr[idx].x, y: arr[idx].y };
    const steps = Math.max(1, Math.round(duration / 16));
    activeFielderPos = pos;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = 1 - (1 - t) * (1 - t);
      arr[idx] = { ...arr[idx], x: Math.round(from.x + (svgTo.x - from.x) * eased), y: Math.round(from.y + (svgTo.y - from.y) * eased) };
      if (fieldStyle === 'retro') defenseRetro = [...arr];
      else defenseNormal = [...arr];
      await sleep(16);
    }
    await sleep(200);
    // 원위치 복귀
    const base = fieldStyle === 'retro' ? DEFENSE_RETRO_BASE : DEFENSE_NORMAL_BASE;
    const orig = base.find(d => d.pos === pos);
    if (orig) {
      arr[idx] = { ...arr[idx], x: orig.x, y: orig.y };
      if (fieldStyle === 'retro') defenseRetro = [...arr];
      else defenseNormal = [...arr];
    }
    activeFielderPos = null;
  }

  async function playAnimationCues(
    cues: import('../../shared/types/projectb').MatchAnimationCue[],
    code: PitchResultCode,
    prevRunners: { first: boolean; second: boolean; third: boolean }
  ) {
    const runnerCues: typeof cues = [];
    let lastFielderMovePos: string | null = null;

    for (const cue of cues) {
      if (cue.type === "ball_pitch") {
        await tweenBall(clickedFieldPos, cue.duration);
      } else if (cue.type === "ball_batted" || cue.type === "ball_throw") {
        const svgTo = enginePosToSvg(cue.to);
        await tweenBall(svgTo, cue.duration);
      } else if (cue.type === "fielder_move") {
        lastFielderMovePos = cue.position;
        const svgTo = enginePosToSvg(cue.to);
        void animateFielderMove(cue.position, svgTo, cue.duration);
      } else if (cue.type === "runner_advance") {
        runnerCues.push(cue);
      } else if (cue.type === "show_result") {
        if (code === 'FIELDING_ERROR' && lastFielderMovePos) {
          errorFlashPos = lastFielderMovePos;
          setTimeout(() => { errorFlashPos = null; }, 1200);
        }
        if (fieldStyle === 'retro' && runnerCues.length > 0) {
          await animateRetroRunners(code, prevRunners);
          syncRetroPositions();
        }
        showResultOverlay(code);
      }
    }

    await tweenBall(activeMound, 180);
  }

  async function runPitch() {
    if (isPitching) return;
    if (!engineAvailable && !allowLocalFallback) {
      pushLog("엔진 미연결 상태입니다. 화면을 닫고 다시 시도해 주세요.");
      return;
    }

    isPitching = true;
    const prevRunners = { first: runners.first, second: runners.second, third: runners.third };
    const pitchedAt = { ...zoneClickPct };
    ballPos = { ...activeMound };

    let resultCode: PitchResultCode;
    let line: string;
    let effectivePitchedAt = pitchedAt;

    if (engineAvailable && window.projectB?.matchStep) {
      if (!engineStarted && window.projectB.matchStart) {
        const player = get(gameStore).player;
        await window.projectB.matchStart({
          initialStamina: player.condition,
          initialMental: 74,
          pitcher: player.pitcherStats
        });
        engineStarted = true;
      }

      const response = await window.projectB.matchStep({
        pitchType: selectedPitchType,
        location: selectedZone,
        target: pitchTarget,
        strategy: selectedStrategy,
        power: selectedPower,
      });
      const lt = response.outcome?.landingTarget;
      effectivePitchedAt = lt ? landingToPct(lt.x, lt.y) : pitchedAt;

      if (!response.outcome) {
        // Not protagonist's turn — just sync state
        applySnapshot(response.snapshot);
        isPitching = false;
        return;
      }

      resultCode = response.outcome.resultCode as PitchResultCode;
      line = `${inningHalfLabel} ${pitchTypes.find((p) => p.id === selectedPitchType)?.label} ${response.outcome.comment}`;
      pitcherState = { ...pitcherState, speed: `${statToKmh(get(gameStore).player.pitcherStats.velocity, selectedPower)} km/h` };
      const prevOuts = count.out;
      applySnapshot(response.snapshot, line, resultCode);
      const outsGained = count.out >= prevOuts ? count.out - prevOuts : (3 - prevOuts) + count.out;
      if (outsGained > 0) totalOutsRecorded += outsGained;

      // 개인 기록 집계
      if ((resultCode === 'STRIKE_SWING' || resultCode === 'STRIKE_LOOK') && count.out > prevOuts) {
        totalStrikeouts++;
      }
      if (resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN") {
        totalHitsAllowed += 1;
      }
      if (resultCode === "WALK") {
        totalWalksAllowed += 1;
      }

      if (response.outcome.animationCues?.length) {
        await playAnimationCues(response.outcome.animationCues, resultCode, prevRunners);
        if (fieldStyle === 'retro') {
          const atBatEnded = resultCode !== 'STRIKE_SWING' && resultCode !== 'STRIKE_LOOK'
            && resultCode !== 'FOUL' && resultCode !== 'BALL';
          if (atBatEnded) batter = { handedness: Math.random() < 0.32 ? 'L' : 'R' };
          syncRetroPositions();
        }
      } else {
        await tweenBall(clickedFieldPos, 220);
        showResultOverlay(resultCode);
        if (resultCode === "INPLAY_OUT" || resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN") {
          await tweenBall(getBattedTarget(resultCode), 300);
        }
        if (fieldStyle === 'retro') {
          await animateRetroRunners(resultCode, prevRunners);
          const atBatEnded = resultCode !== 'STRIKE_SWING' && resultCode !== 'STRIKE_LOOK'
            && resultCode !== 'FOUL' && resultCode !== 'BALL';
          if (atBatEnded) batter = { handedness: Math.random() < 0.32 ? 'L' : 'R' };
          syncRetroPositions();
        }
        await tweenBall(activeMound, 180);
      }

      // 경기 중 부상 처리
      if ((response as any).midGameInjury) {
        const inj = (response as any).midGameInjury as { injuryType: string; severity: string };
        midGameInjuryAlert = inj;
        pushLog(`⚠️ 경기 중 부상 — ${inj.injuryType} (${inj.severity === "light" ? "경상" : inj.severity === "moderate" ? "중상" : "중증"})`, "log-auto");
        await handleGameOver(inj);
        lastPitchPct = effectivePitchedAt;
        isPitching = false;
        return;
      }

      if (response.snapshot.isFinished && !isGameOver) {
        await handleGameOver();
        lastPitchPct = effectivePitchedAt;
        isPitching = false;
        return;
      }

      if (currentPhase === "auto_inning") {
        isPitching = false;
        await runAutoInnings();
        lastPitchPct = effectivePitchedAt;
        return;
      }
    } else if (allowLocalFallback) {
      await tweenBall(clickedFieldPos, 220);
      resultCode = rollLocalResult();
      const local = applyLocalResult(resultCode);
      resultCode = local.resolvedCode;
      line = `${inningHalfLabel} ${pitchTypes.find((p) => p.id === selectedPitchType)?.label} ${localComment(resultCode)}`;
      const prevOuts = count.out;
      applySnapshot(local.snapshot, line, resultCode);
      const outsGained = count.out >= prevOuts ? count.out - prevOuts : (3 - prevOuts) + count.out;
      if (outsGained > 0) totalOutsRecorded += outsGained;
      if ((resultCode === 'STRIKE_SWING' || resultCode === 'STRIKE_LOOK') && count.out > prevOuts) {
        totalStrikeouts++;
      }
      if (resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN") {
        totalHitsAllowed += 1;
      }
      if (resultCode === "WALK") {
        totalWalksAllowed += 1;
      }
      if (local.inningChange) {
        if (local.snapshot.inning > 9 && !isGameOver) {
          await handleGameOver();
          lastPitchPct = pitchedAt;
          isPitching = false;
          return;
        }
        const newHalf = local.snapshot.half === 'top' ? '초' : '말';
        pushLog(`이닝 교체: ${local.snapshot.inning}회 ${newHalf}`, 'log-separator');
        showChangeAlert();
      }

      showResultOverlay(resultCode);
      if (resultCode === "INPLAY_OUT" || resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN") {
        await tweenBall(getBattedTarget(resultCode), 300);
      }
      if (fieldStyle === 'retro') {
        await animateRetroRunners(resultCode, prevRunners);
        const atBatEnded = resultCode !== 'STRIKE_SWING' && resultCode !== 'STRIKE_LOOK'
          && resultCode !== 'FOUL' && resultCode !== 'BALL';
        if (atBatEnded) batter = { handedness: Math.random() < 0.32 ? 'L' : 'R' };
        syncRetroPositions();
      }
      await tweenBall(activeMound, 180);
    } else {
      isPitching = false;
      return;
    }

    lastPitchPct = effectivePitchedAt;
    isPitching = false;
  }

  async function handleGameOver(injuryInfo?: { injuryType: string; severity: string }) {
    if (isGameOver) return;
    isGameOver = true;

    let summary = '';
    let batterLines: import('../../shared/types/season').BatterGameLine[] | undefined;
    let playerLines: import('../../shared/types/season').PlayerGameLine[] | undefined;
    let protagonistEntered: boolean | undefined;
    if (window.projectB?.matchFinish) {
      try {
        const result = await window.projectB.matchFinish();
        summary = result.summary;
        protagonistEntered = result.protagonistEntered ?? true;
        if (result.snapshot) applySnapshot(result.snapshot);
        if (Array.isArray(result.batterLines)) {
          batterLines = result.batterLines.map((bl: { playerId: string; pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; k: number }) => ({
            role: "batter" as const,
            playerId: bl.playerId,
            ab: bl.ab, h: bl.h, hr: bl.hr, rbi: bl.rbi, bb: bl.bb, k: bl.k, sb: 0,
          }));
        }
        if (Array.isArray(result.playerLines)) {
          playerLines = result.playerLines as import('../../shared/types/season').PlayerGameLine[];
        }
      } catch { /* ignore */ }
    }

    const awayScore = scoreRows[0].r;
    const homeScore = scoreRows[1].r;
    const won = protagonistSide === "home" ? homeScore > awayScore : awayScore > homeScore;

    const runsAllowed = Math.round(totalHitsAllowed * 0.35);
    gameResult = {
      awayScore, homeScore,
      pitchCount: engineAvailable ? snapshotPitchCountSinceEntry : localEngineState.pitchCount,
      strikeouts: totalStrikeouts,
      errors: matchDefenseStat.errors,
      hitsAllowed: totalHitsAllowed,
      walksAllowed: totalWalksAllowed,
      outsRecorded: totalOutsRecorded,
      runsAllowed,
      won, summary, protagonistEntered, batterLines, playerLines,
      midGameInjury: injuryInfo ? { injuryType: injuryInfo.injuryType, severity: injuryInfo.severity } : undefined,
    };

    const staminaUsed = Math.max(0, 82 - pitcherState.stamina);
    const condDelta = -Math.round(staminaUsed / 4);
    const protagonist = get(gameStore).protagonist;
    const resultLabel = won ? '승리' : awayScore === homeScore ? '무승부' : '패배';
    gameStore.applyWeekResult(
      { condition: Math.max(5, protagonist.condition + condDelta) },
      [`경기 ${resultLabel} - ${awayScore}:${homeScore} (${totalStrikeouts}K/${matchDefenseStat.errors}E)`],
      [],
      matchContext?.week ?? 1
    );
  }

  async function handlePostExitWatchInning() {
    if (!window.projectB?.matchNextInning) return;
    postExitPopupVisible = false;
    isAutoSimming = true;
    try {
      const response = await window.projectB.matchNextInning();
      for (const log of response.logs) {
        pushLog(log, "log-auto");
        await sleep(600);
      }
      applySnapshot(response.snapshot);
      applyBatchStats(response.batchStats);
      if (response.snapshot.isFinished) {
        await handleGameOver();
      } else {
        postExitPopupVisible = true;
      }
    } finally {
      isAutoSimming = false;
    }
  }

  async function handlePostExitShowResult() {
    postExitPopupVisible = false;
    await handleGameOver();
  }

  function handleExitAfterGame() {
    if (matchContext) {
      onComplete({
        scheduleId: matchContext.scheduleId,
        week: matchContext.week,
        homeTeamId: matchContext.homeTeamId,
        awayTeamId: matchContext.awayTeamId,
        homeScore: gameResult.homeScore,
        awayScore: gameResult.awayScore,
        strikeouts: gameResult.strikeouts,
        hitsAllowed: totalHitsAllowed,
        walksAllowed: totalWalksAllowed,
        outsRecorded: totalOutsRecorded,
        errors: gameResult.errors,
        pitchCount: gameResult.pitchCount,
        summary: gameResult.summary,
        protagonistEntered: gameResult.protagonistEntered,
        batterLines: gameResult.batterLines,
        playerLines: gameResult.playerLines,
        midGameInjury: gameResult.midGameInjury,
      });
    }
    isGameOver = false;
    onCancel();
  }

  function localComment(code: PitchResultCode): string {
    switch (code) {
      case "STRIKE_SWING":
        return "헛스윙 스트라이크";
      case "STRIKE_LOOK":
        return "루킹 스트라이크";
      case "BALL":
        return "볼";
      case "FOUL":
        return "파울";
      case "INPLAY_OUT":
        return "인플레이 아웃";
      case "HIT_SINGLE":
        return "안타";
      case "HIT_DOUBLE":
        return "2루타";
      case "HIT_TRIPLE":
        return "3루타";
      case "HOME_RUN":
        return "홈런";
      case "WALK":
        return "볼넷";
      case "FIELDING_ERROR":
        return "실책";
      default:
        return "플레이";
    }
  }
</script>

<SettingsPanel bind:open={settingsOpen} />
<section class="match-engine-empty" aria-label="match engine workspace">
  <div class="scoreboard-wrap">
    <table class="scoreboard" aria-label="baseball scoreboard">
      <thead>
        <tr>
          <th class="team-col">{teamHeader}</th>
          {#each innings as inningNumber}
            <th class:current-inning={inningNumber === inning}>{inningNumber}</th>
          {/each}
          <th>R</th>
          <th>H</th>
          <th>E</th>
          <th>B</th>
        </tr>
      </thead>
      <tbody>
        {#each scoreRows as row, i}
          {@const isMyTeam = (i === 0 && protagonistSide === "away") || (i === 1 && protagonistSide === "home")}
          <tr class:my-team-row={isMyTeam}>
            <th class="team-col">{row.team}</th>
            {#each row.inningScores as inningScore, i}
              <td class:current-inning={i + 1 === inning}>{inningScore}</td>
            {/each}
            <td>{row.r}</td>
            <td>{row.h}</td>
            <td>{row.e}</td>
            <td>{row.b}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="engine-grid">
    <div class="left-column">
      <section class="scene-panel" aria-label="match scene">
        <div class="panel-head">
          <h2>{sceneTitle}</h2>
          <span class="inning-badge">{inningHalfLabel}</span>
          {#if selectedDefPosition}
            <span class="pos-badge">선택: {selectedDefPosition}</span>
          {/if}
        </div>

        <div class="scene-layout">
          <aside class="lineup-panel" aria-label="away lineup">
            <h3>{awayLineupTitle}</h3>
            <ol>
              {#each awayLineup as item}
                <li>{item}</li>
              {/each}
            </ol>
          </aside>

          <div class="field-stage-wrap">
            <BaseballField
              baseField={fieldStyle === 'retro' ? retroField : baseField}
              defenders={fieldStyle === 'retro' ? defenseRetro : defenseNormal}
              {runners}
              {ballPos}
              {ballTrail}
              strikeZoneTarget={clickedFieldPos}
              {isPitching}
              {fieldStyle}
              {fieldingTeam}
              runnerTeam={half === 'top' ? 'away' : 'home'}
              {batter}
              batterAnimPos={fieldStyle === 'retro' ? retroBatterPos : null}
              runnerAnimPositions={fieldStyle === 'retro' ? retroRunnerPositions : [null, null, null]}
              {activeFielderPos}
              {errorFlashPos}
              on:selectPosition={(event) => (selectedDefPosition = event.detail.pos)}
            />
            {#if resultOverlay.visible}
              {#if fieldStyle === 'dot'}
                <div class="result-overlay dot-result-overlay">
                  <div class="dot-result-box" style="border-color: {resultOverlay.color}; color: {resultOverlay.color};">
                    <div class="dot-result-corner tl"></div>
                    <div class="dot-result-corner tr"></div>
                    <div class="dot-result-corner bl"></div>
                    <div class="dot-result-corner br"></div>
                    <span class="dot-result-text">{resultOverlay.text}</span>
                  </div>
                </div>
              {:else}
                <div class="result-overlay">
                  <span class="result-overlay-text" style="color: {resultOverlay.color}; text-shadow: 0 0 24px {resultOverlay.color};">{resultOverlay.text}</span>
                </div>
              {/if}
            {/if}
            {#if changeAlert.visible}
              <div class="change-overlay">
                <span class="change-text">체인지!</span>
              </div>
            {/if}
          </div>

          <aside class="lineup-panel" aria-label="home lineup">
            <h3>{homeLineupTitle}</h3>
            <ol>
              {#each homeLineup as item}
                <li>{item}</li>
              {/each}
            </ol>
          </aside>
        </div>
      </section>

      <section class="play-text-panel" aria-label="play by play">
        <h2>{sectionTitle}</h2>
        <ul>
          {#each playByPlayLines as line}
            <li class={line.cls}>{line.text}</li>
          {/each}
        </ul>
      </section>
    </div>

    <div class="right-column">
      <div class="pair-row">
        <section class="panel base-panel" aria-label="base state panel">
          <h2>{baseStatusTitle}</h2>
          <div class="diamond">
            <div class="base b2" class:on={runners.second}></div>
            <div class="base b3" class:on={runners.third}></div>
            <div class="base b1" class:on={runners.first}></div>
            <div class="base home"></div>
          </div>
        </section>

        <section class="panel count-panel" aria-label="count panel">
          <h2>{countTitle}</h2>
          <div class="sbo-board">
            <div class="sbo-row">
              <span class="sbo-label strike">S</span>
              <div class="sbo-lamps">
                {#each [0, 1] as lampIndex}
                  <span class="sbo-lamp strike" class:on={count.strike > lampIndex}></span>
                {/each}
              </div>
            </div>
            <div class="sbo-row">
              <span class="sbo-label count-ball">B</span>
              <div class="sbo-lamps">
                {#each [0, 1, 2] as lampIndex}
                  <span class="sbo-lamp count-ball" class:on={count.ball > lampIndex}></span>
                {/each}
              </div>
            </div>
            <div class="sbo-row">
              <span class="sbo-label out">O</span>
              <div class="sbo-lamps">
                {#each [0, 1] as lampIndex}
                  <span class="sbo-lamp out" class:on={count.out > lampIndex}></span>
                {/each}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="pair-row">
        <section class="panel zone-panel" aria-label="pitch zone panel">
          <h2>{zoneTitle}</h2>
          <div
            class="zone-canvas"
            class:pitching={isPitching}
            bind:this={zoneCanvasEl}
            role="button"
            tabindex="0"
            aria-label="투구 위치 선택"
            on:click={handleZoneClick}
            on:mousemove={handleZoneMouseMove}
            on:mouseleave={() => (zoneHoverPct = null)}
            on:keydown={(e) => e.key === 'Enter' && handleZoneClick(e as unknown as MouseEvent)}
          >
            <div class="sz-inner-box"></div>
            {#if lastPitchPct}
              <div class="zone-last-dot" style="left:{lastPitchPct.px * 100}%;top:{lastPitchPct.py * 100}%;"></div>
            {/if}
            {#if zoneHoverPct && !isPitching}
              <div class="zone-hover-dot" style="left:{zoneHoverPct.px * 100}%;top:{zoneHoverPct.py * 100}%;"></div>
            {/if}
            <div class="zone-target-dot" class:ball-zone={isIntentionalBall} style="left:{zoneClickPct.px * 100}%;top:{zoneClickPct.py * 100}%;"></div>
          </div>
        </section>

        <section class="panel pitch-select-panel" aria-label="pitch selection panel">
          <h2>{pitchSelectTitle}</h2>
          <div class="pitch-buttons">
            {#each pitchTypes as pitch}
              <button
                type="button"
                class="pitch-btn"
                class:active={selectedPitchType === pitch.id}
                on:click={() => (selectedPitchType = pitch.id)}
              >
                {pitch.label}
              </button>
            {/each}
          </div>

          <div class="choice-row">
            {#each strategies as strategy}
              <button
                type="button"
                class="mini-btn"
                class:active={selectedStrategy === strategy.id}
                on:click={() => (selectedStrategy = strategy.id)}
              >
                {strategy.label}
              </button>
            {/each}
          </div>

          <div class="choice-row">
            {#each powers as power}
              <button
                type="button"
                class="mini-btn"
                class:active={selectedPower === power.id}
                on:click={() => (selectedPower = power.id)}
              >
                {power.label}
              </button>
            {/each}
          </div>

          <button
            type="button"
            class="execute-btn"
            disabled={isPitching || isAutoSimming || (!engineAvailable && !allowLocalFallback) || (engineAvailable && currentPhase !== "protagonist_pitch")}
            on:click={runPitch}
          >
            {#if isPitching}
              투구 진행 중...
            {:else if isAutoSimming}
              이닝 진행 중...
            {:else if engineAvailable && !protagonistHasEntered}
              등판 대기 중...
            {:else}
              투구 실행
            {/if}
          </button>

          {#if engineErrorMsg}
            <p class="engine-state">{engineErrorMsg}</p>
          {/if}
        </section>
      </div>

      <div class="pair-row">
        <section class="panel info-panel" aria-label="batter info panel">
          <h2>{batterInfoTitle}</h2>
          <ul class="stat-list">
            {#each batterInfo as info}
              <li><span>{info.label}</span><strong>{info.value}</strong></li>
            {/each}
          </ul>
          <div class="match-env-badges">
            <span class="env-badge">{WEATHER_LABEL[matchWeather]}</span>
            <span class="env-badge">{PARK_LABEL[matchPark]}</span>
          </div>
        </section>

        <section class="panel info-panel" aria-label="pitcher info panel">
          <h2>{pitcherInfoTitle}</h2>
          <ul class="stat-list">
            <li><span>이름</span><strong>{pitcherState.name}</strong></li>
            <li><span>구속</span><strong>{pitcherState.speed}</strong></li>
            <li class="gauge-row">
              <span>체력</span>
              <div class="gauge-wrap"><div class="gauge-bar" style="width:{pitcherState.stamina}%;background:{staminaColor};"></div></div>
              <strong>{pitcherState.stamina.toFixed(1)}</strong>
            </li>
            <li class="gauge-row">
              <span>멘탈</span>
              <div class="gauge-wrap"><div class="gauge-bar" style="width:{pitcherState.mental}%;background:{mentalColor};"></div></div>
              <strong>{pitcherState.mental.toFixed(1)}</strong>
            </li>
            <li><span>투구수</span><strong>{engineAvailable ? snapshotPitchCountSinceEntry : localEngineState.pitchCount}</strong></li>
          </ul>
        </section>
      </div>
    </div>
  </div>

  {#if postExitPopupVisible}
    <div class="gameover-overlay">
      <div class="gameover-box">
        <h2 class="gameover-title">교체 타이밍</h2>
        {#if postExitReason}
          <p class="gameover-summary">{postExitReason}</p>
        {/if}
        <p class="post-exit-question">남은 경기를 어떻게 볼까요?</p>
        <div class="post-exit-btns">
          <button class="post-exit-btn watch-btn" type="button" on:click={handlePostExitWatchInning} disabled={isAutoSimming}>
            진행 보기
          </button>
          <button class="post-exit-btn result-btn" type="button" on:click={handlePostExitShowResult} disabled={isAutoSimming}>
            결과 보기
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if isGameOver}
    <div class="gameover-overlay">
      <div class="gameover-box">
        <h2 class="gameover-title">경기 종료</h2>
        <div class="gameover-score">
          <span class="score-label">원정</span>
          <span class="score-num">{gameResult.awayScore}</span>
          <span class="score-sep">:</span>
          <span class="score-num home-score">{gameResult.homeScore}</span>
          <span class="score-label">홈</span>
        </div>
        <div class="gameover-result" class:won={gameResult.won} class:lost={!gameResult.won && gameResult.awayScore !== gameResult.homeScore}>
          {gameResult.won ? '승리' : gameResult.awayScore === gameResult.homeScore ? '무승부' : '패배'}
        </div>
        {#if gameResult.protagonistEntered === false}
          <p class="gameover-no-entry">이번 경기 등판 없음</p>
          <ul class="gameover-stats">
            <li><span>실책</span><strong>{gameResult.errors} E</strong></li>
          </ul>
        {:else}
          <ul class="gameover-stats">
            <li><span>이닝</span><strong>{(Math.max(0, gameResult.outsRecorded) / 3).toFixed(1)} IP</strong></li>
            <li><span>투구 수</span><strong>{gameResult.pitchCount}</strong></li>
            <li><span>탈삼진</span><strong>{gameResult.strikeouts} K</strong></li>
            <li><span>피안타</span><strong>{gameResult.hitsAllowed} H</strong></li>
            <li><span>볼넷</span><strong>{gameResult.walksAllowed} BB</strong></li>
            <li><span>자책(추정)</span><strong>{gameResult.runsAllowed} ER</strong></li>
            <li><span>실책</span><strong>{gameResult.errors} E</strong></li>
          </ul>
        {/if}
        {#if gameResult.summary}
          <p class="gameover-summary">{gameResult.summary}</p>
        {/if}
        <button class="gameover-exit-btn" type="button" on:click={handleExitAfterGame}>
          경기 나가기
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .match-engine-empty {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: #0a0f1a;
    padding: 12px;
    box-sizing: border-box;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
  }

  .scoreboard-wrap {
    width: 100%;
    overflow-x: auto;
    margin-bottom: 0;
  }

  .settings-btn {
    margin-left: auto;
    background: none;
    border: 1px solid #2a3a56;
    border-radius: 5px;
    color: #6a8aaa;
    font-size: 15px;
    padding: 1px 7px;
    cursor: pointer;
    line-height: 1.5;
  }
  .settings-btn:hover { color: #c8d8f0; border-color: #5a7aaa; }

  .scoreboard {
    width: 100%;
    border-collapse: collapse;
    background: #0e1523;
    border: 1px solid #2a3550;
    color: #edf2ff;
    table-layout: fixed;
  }

  .scoreboard th,
  .scoreboard td {
    border: 1px solid #2a3550;
    text-align: center;
    padding: 6px 4px;
    font-size: 12px;
  }

  .scoreboard thead th {
    background: #172338;
    color: #d3ddf6;
    font-weight: 700;
  }

  .scoreboard thead th:nth-last-child(4) {
    color: #ff4a7d;
  }

  .scoreboard thead th:nth-last-child(-n + 3) {
    color: #ffe27a;
  }

  .team-col {
    width: 64px;
    text-align: left;
    padding-left: 8px;
    background: #121c2f;
    color: #ffffff;
    font-weight: 700;
  }

  .scoreboard tbody tr:nth-child(2n) td {
    background: #101a2c;
  }

  .scoreboard tbody td:nth-last-child(4) {
    color: #ff3f71;
    font-weight: 700;
  }

  .scoreboard tbody td:nth-last-child(-n + 3) {
    color: #ffe27a;
    font-weight: 700;
  }

  .engine-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    min-height: 0;
    height: 100%;
  }

  .left-column {
    grid-column: 1 / 8;
    height: 100%;
    display: grid;
    grid-template-rows: minmax(0, 1.48fr) minmax(0, 0.52fr);
    gap: 12px;
    min-height: 0;
  }

  .scene-panel,
  .play-text-panel {
    background: #0e1523;
    border: 1px solid #2a3550;
    border-radius: 8px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .scene-panel {
    padding-top: 8px;
    padding-bottom: 10px;
    display: flex;
    flex-direction: column;
  }

  .play-text-panel {
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .right-column {
    grid-column: 8 / 13;
    display: grid;
    gap: 12px;
    align-content: start;
    min-height: 0;
  }

  .pair-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .panel {
    min-height: 170px;
    background: #0e1523;
    border: 1px solid #2a3550;
    border-radius: 8px;
    padding: 12px;
  }

  .panel h2 {
    margin: 0 0 10px;
    font-size: 16px;
    color: #edf2ff;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 2px;
    transform: translateY(-3px);
  }

  .inning-badge {
    font-size: 12px;
    color: #b3d4ff;
    border: 1px solid #355483;
    border-radius: 999px;
    padding: 4px 9px;
    background: #101b2d;
  }

  .pos-badge {
    font-size: 12px;
    color: #9ed9ff;
    border: 1px solid #2f6f9c;
    border-radius: 999px;
    padding: 4px 9px;
    background: #0f2231;
  }

  .scene-layout {
    display: grid;
    grid-template-columns: 108px minmax(0, 1fr) 108px;
    gap: 8px;
    align-items: stretch;
    flex: 1;
    min-height: 0;
  }

  .lineup-panel {
    border: 1px solid #2f456b;
    border-radius: 8px;
    background: #0d1628;
    padding: 8px;
    overflow: hidden;
  }

  .lineup-panel h3 {
    margin: 0 0 8px;
    font-size: 12px;
    color: #dce7ff;
  }

  .lineup-panel ol {
    margin: 0;
    padding: 0 0 0 16px;
    display: grid;
    gap: 4px;
    color: #bfcdea;
    font-size: 11px;
  }

  .field-stage-wrap {
    display: grid;
    min-height: 0;
    height: 100%;
    width: 100%;
    align-items: start;
    margin-top: -4px;
    position: relative;
  }

  .result-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 10;
  }

  .result-overlay-text {
    font-size: 54px;
    font-weight: 900;
    animation: overlayPop 1.4s ease-out forwards;
    filter: drop-shadow(0 2px 10px rgba(0,0,0,0.9));
  }

  @keyframes overlayPop {
    0%   { opacity: 0; transform: scale(0.4); }
    18%  { opacity: 1; transform: scale(1.18); }
    35%  { transform: scale(1.0); }
    65%  { opacity: 1; }
    100% { opacity: 0; transform: scale(0.92) translateY(-28px); }
  }

  /* 도트 결과 오버레이 */
  .dot-result-overlay { background: none; }

  .dot-result-box {
    position: relative;
    border: 3px solid;
    padding: 10px 24px;
    image-rendering: pixelated;
    background: rgba(4, 8, 16, 0.88);
    animation: dotResultAnim 1.4s steps(1) forwards;
  }

  .dot-result-corner {
    position: absolute;
    width: 6px;
    height: 6px;
    background: currentColor;
  }
  .dot-result-corner.tl { top: -3px; left: -3px; }
  .dot-result-corner.tr { top: -3px; right: -3px; }
  .dot-result-corner.bl { bottom: -3px; left: -3px; }
  .dot-result-corner.br { bottom: -3px; right: -3px; }

  .dot-result-text {
    font-size: 40px;
    font-weight: 900;
    font-family: 'Courier New', monospace;
    letter-spacing: 0.06em;
    animation: dotResultAnim 1.4s steps(1) forwards;
  }

  @keyframes dotResultAnim {
    0%   { opacity: 0; }
    8%   { opacity: 1; }
    70%  { opacity: 1; }
    80%  { opacity: 0; }
    90%  { opacity: 1; }
    100% { opacity: 0; }
  }

  .base-panel {
    display: grid;
    place-items: center;
  }

  .diamond {
    position: relative;
    width: 120px;
    height: 120px;
    background: #0a111f;
    border: 1px solid #324362;
    border-radius: 10px;
  }

  .base {
    position: absolute;
    width: 16px;
    height: 16px;
    transform: rotate(45deg);
    border: 1px solid #9ab0d9;
    background: #23324d;
  }

  .base.on {
    background: #f3ca63;
    border-color: #ffe6a9;
  }

  .b2 { top: 16px; left: 52px; }
  .b3 { top: 52px; left: 16px; }
  .b1 { top: 52px; right: 16px; }
  .home { bottom: 16px; left: 52px; }

  .count-panel {
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .sbo-board {
    background: #111216;
    border: 1px solid #3b3d45;
    border-radius: 10px;
    padding: 10px;
    display: grid;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .sbo-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sbo-label {
    width: 34px;
    text-align: center;
    font-size: 36px;
    font-weight: 700;
    line-height: 1;
    color: #f3f6ff;
  }

  .sbo-lamps {
    display: flex;
    gap: 10px;
  }

  .sbo-lamp {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid #3a3d46;
    background: #595d67;
  }

  .sbo-lamp.strike.on {
    background: #37d67a;
    border-color: #7df0ae;
    animation: sboPulseStrike 1.8s ease-in-out infinite;
  }

  .sbo-lamp.count-ball.on {
    background: #ffd54f;
    border-color: #ffe58f;
    animation: sboPulseBall 1.8s ease-in-out infinite;
  }

  .sbo-lamp.out.on {
    background: #ff2727;
    border-color: #ff6c6c;
    animation: sboPulseOut 1.8s ease-in-out infinite;
  }

  @keyframes sboPulseStrike {
    0%, 100% { box-shadow: 0 0 4px rgba(55, 214, 122, 0.4); }
    50% { box-shadow: 0 0 14px 4px rgba(55, 214, 122, 0.75); }
  }

  @keyframes sboPulseBall {
    0%, 100% { box-shadow: 0 0 4px rgba(255, 213, 79, 0.4); }
    50% { box-shadow: 0 0 14px 4px rgba(255, 213, 79, 0.75); }
  }

  @keyframes sboPulseOut {
    0%, 100% { box-shadow: 0 0 4px rgba(255, 39, 39, 0.4); }
    50% { box-shadow: 0 0 14px 4px rgba(255, 39, 39, 0.75); }
  }

  .sbo-label.strike {
    color: #37d67a;
  }

  .sbo-label.count-ball {
    color: #ffd54f;
  }

  .sbo-label.out {
    color: #ff4a4a;
  }

  .zone-canvas {
    width: 80%;
    max-width: 180px;
    min-height: 260px;
    margin: 0 auto;
    background: #21314c;
    border: 5px solid #3a4f73;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px #5f79a8;
    position: relative;
    cursor: crosshair;
    user-select: none;
    display: block;
  }

  .zone-canvas.pitching {
    cursor: not-allowed;
    opacity: 0.75;
  }

  /* 스트라이크존 박스: 캔버스 x 10~90%, y 8~92% */
  .sz-inner-box {
    position: absolute;
    left: 10%;
    right: 10%;
    top: 8%;
    bottom: 8%;
    border: 2px solid rgba(100, 160, 220, 0.6);
    border-radius: 2px;
    background-image:
      linear-gradient(to right, rgba(90, 120, 180, 0.2) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(90, 120, 180, 0.2) 1px, transparent 1px);
    background-size: 33.333% 33.333%;
    pointer-events: none;
  }

  /* 조준 dot (타겟) */
  .zone-target-dot {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid #88aef1;
    background: rgba(101, 180, 255, 0.2);
    transform: translate(-50%, -50%);
    pointer-events: none;
    box-shadow: 0 0 8px rgba(101, 180, 255, 0.5);
    z-index: 3;
  }

  .zone-target-dot::after {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: rgba(150, 210, 255, 0.5);
  }

  .zone-target-dot.ball-zone {
    border-color: #ff7043;
    background: rgba(255, 112, 67, 0.2);
    box-shadow: 0 0 8px rgba(255, 112, 67, 0.6);
  }

  .zone-target-dot.ball-zone::after {
    background: rgba(255, 150, 100, 0.5);
  }

  /* 마지막 투구 위치 dot (흰색) */
  .zone-last-dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #ffd54f;
    background: rgba(255, 213, 79, 0.35);
    transform: translate(-50%, -50%);
    pointer-events: none;
    box-shadow: 0 0 6px rgba(255, 213, 79, 0.5);
    z-index: 2;
  }

  /* hover 미리보기 dot */
  .zone-hover-dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(120, 160, 210, 0.4);
    background: rgba(100, 150, 200, 0.08);
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 1;
  }

  .pitch-buttons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .pitch-btn,
  .mini-btn {
    border: 1px solid #304868;
    border-radius: 8px;
    background: #101a2d;
    color: #e9f1ff;
    padding: 9px 8px;
    cursor: pointer;
  }

  .pitch-btn.active,
  .mini-btn.active {
    background: #2f4f85;
    border-color: #7ba4f0;
  }

  .choice-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .execute-btn {
    width: 100%;
    border: none;
    border-radius: 10px;
    background: linear-gradient(180deg, #4a8cf0 0%, #2e5fb5 100%);
    color: #ffffff;
    padding: 13px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.04em;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(61, 120, 223, 0.5), inset 0 1px 0 rgba(255,255,255,0.15);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .execute-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 22px rgba(61, 120, 223, 0.6);
  }

  .execute-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(61, 120, 223, 0.35);
  }

  .execute-btn:disabled {
    cursor: not-allowed;
    background: linear-gradient(180deg, #2a4a7a, #1e3560);
    box-shadow: none;
    animation: pitchPulse 1.2s ease-in-out infinite;
  }

  @keyframes pitchPulse {
    0%, 100% { box-shadow: 0 0 0 rgba(61, 120, 223, 0); }
    50% { box-shadow: 0 0 20px rgba(61, 120, 223, 0.45); }
  }

  .mound-visit-btn {
    width: 100%;
    margin-top: 6px;
    border: 1px solid #5a8040;
    border-radius: 8px;
    background: linear-gradient(180deg, #3a6030 0%, #2a4a22 100%);
    color: #a8d88a;
    padding: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
  }
  .mound-visit-btn:hover { background: linear-gradient(180deg, #4a7838 0%, #365a2a 100%); }

  .engine-state {
    margin: 8px 0 0;
    font-size: 12px;
    color: #d3a160;
    text-align: center;
  }

  .engine-state.on {
    color: #74d8a2;
  }

  .stat-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .match-env-badges {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  .env-badge {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 10px;
    background: #1a2a3f;
    color: #8ab4d8;
    border: 1px solid #2a3f5c;
  }

  .stat-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #24334d;
    padding-bottom: 6px;
    color: #d7e4fb;
  }

  .gauge-row {
    flex-direction: row;
  }

  .gauge-wrap {
    flex: 1;
    height: 8px;
    background: #1a2a3f;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #2a3d5a;
  }

  .gauge-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s ease, background 0.4s ease;
  }

  .change-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 12;
  }

  .change-text {
    font-size: 52px;
    font-weight: 900;
    color: #f0f4ff;
    text-shadow: 0 0 30px rgba(160, 190, 255, 0.85), 0 2px 12px rgba(0,0,0,0.9);
    animation: changeFlash 2.2s ease-out forwards;
  }

  @keyframes changeFlash {
    0%   { opacity: 0; transform: scale(0.5); }
    15%  { opacity: 1; transform: scale(1.15); }
    30%  { transform: scale(1.0); }
    70%  { opacity: 1; }
    100% { opacity: 0; transform: scale(0.95) translateY(-20px); }
  }

  .play-text-panel h2 {
    margin: 0 0 10px;
    font-size: 16px;
    color: #edf2ff;
  }

  .play-text-panel ul {
    margin: 0;
    padding-left: 18px;
    color: #d3ddf6;
    max-height: calc(100% - 28px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(196, 218, 255, 0.22) transparent;
  }

  .play-text-panel ul::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .play-text-panel ul::-webkit-scrollbar-track {
    background: transparent;
  }

  .play-text-panel ul::-webkit-scrollbar-thumb {
    background: rgba(196, 218, 255, 0.22);
    border-radius: 999px;
  }

  .play-text-panel ul::-webkit-scrollbar-thumb:hover {
    background: rgba(196, 218, 255, 0.38);
  }

  .play-text-panel li {
    margin-bottom: 8px;
  }

  .play-text-panel li.log-homerun { color: #ff6b6b; font-weight: 700; }
  .play-text-panel li.log-hit     { color: #ffd54f; }
  .play-text-panel li.log-strike  { color: #37d67a; }
  .play-text-panel li.log-foul    { color: #a0b8d8; }
  .play-text-panel li.log-ball    { color: #7a8fa8; }
  .play-text-panel li.log-out     { color: #ff8c42; }
  .play-text-panel li.log-walk    { color: #8ecfff; }
  .play-text-panel li.log-auto    { color: #6a7a9a; font-style: italic; }

  .play-text-panel li.log-separator {
    list-style: none;
    margin-left: -18px;
    text-align: center;
    color: #4a6080;
    font-size: 11px;
    letter-spacing: 0.08em;
    border-top: 1px solid #1e3050;
    border-bottom: 1px solid #1e3050;
    padding: 3px 0;
    margin-bottom: 6px;
  }

  .scoreboard th.current-inning,
  .scoreboard td.current-inning {
    background: rgba(70, 120, 200, 0.18);
    color: #aad0ff;
  }

  .scoreboard tr.my-team-row th,
  .scoreboard tr.my-team-row td {
    color: #ffe27a;
  }

  @media (max-width: 1280px) {
    .left-column {
      grid-column: 1 / 7;
    }

    .right-column {
      grid-column: 7 / 13;
    }

    .scene-layout {
      grid-template-columns: 96px minmax(0, 1fr) 96px;
    }
  }

  @media (max-width: 960px) {
    .match-engine-empty {
      padding: 8px;
      gap: 8px;
    }

    .engine-grid {
      grid-template-columns: 1fr;
    }

    .left-column,
    .right-column {
      grid-column: 1;
    }

    .left-column {
      height: auto;
      grid-template-rows: minmax(0, 1.32fr) minmax(0, 0.68fr);
    }

    .scene-panel {
      min-height: 380px;
    }

    .play-text-panel {
      min-height: 220px;
    }

    .scene-layout {
      grid-template-columns: 80px minmax(0, 1fr) 80px;
      gap: 6px;
    }

    .pair-row {
      grid-template-columns: 1fr;
    }
  }

  /* 게임 종료 모달 */
  .gameover-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.4s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .gameover-box {
    background: #0e1a2e;
    border: 2px solid #2a4070;
    border-radius: 16px;
    padding: 36px 44px;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    box-shadow: 0 8px 48px rgba(0, 0, 0, 0.7);
    animation: popIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
  }

  @keyframes popIn {
    from { transform: scale(0.7); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .gameover-title {
    margin: 0;
    font-size: 22px;
    color: #d3e4ff;
    letter-spacing: 0.06em;
  }

  .gameover-score {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .score-label {
    font-size: 13px;
    color: #6a8aaa;
  }

  .score-num {
    font-size: 52px;
    font-weight: 900;
    color: #edf2ff;
    line-height: 1;
    min-width: 48px;
    text-align: center;
  }

  .home-score { color: #7ecfff; }

  .score-sep {
    font-size: 36px;
    color: #4a6080;
    font-weight: 300;
  }

  .gameover-result {
    font-size: 28px;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #7a8fa8;
    padding: 6px 24px;
    border-radius: 999px;
    border: 2px solid #2a3f5c;
  }

  .gameover-result.won {
    color: #37d67a;
    border-color: #2a5a3a;
    background: rgba(55, 214, 122, 0.08);
  }

  .gameover-result.lost {
    color: #ff4a4a;
    border-color: #5a2a2a;
    background: rgba(255, 74, 74, 0.08);
  }

  .gameover-stats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 20px;
  }

  .gameover-stats li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .gameover-stats li span {
    font-size: 11px;
    color: #6a8aaa;
  }

  .gameover-stats li strong {
    font-size: 20px;
    font-weight: 700;
    color: #c8d8f0;
  }

  .gameover-summary {
    margin: 0;
    font-size: 13px;
    color: #7a9ab8;
    text-align: center;
    max-width: 280px;
    line-height: 1.5;
  }

  .gameover-no-entry {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #8890a8;
    text-align: center;
    padding: 4px 0;
  }

  .gameover-exit-btn {
    margin-top: 8px;
    padding: 12px 36px;
    background: linear-gradient(180deg, #3a6abf 0%, #2050a0 100%);
    border: none;
    border-radius: 10px;
    color: #ffffff;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.04em;
    box-shadow: 0 4px 16px rgba(50, 100, 200, 0.4);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .gameover-exit-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 22px rgba(50, 100, 200, 0.55);
  }

  .post-exit-question {
    margin: 0;
    font-size: 14px;
    color: #a0b8d4;
    text-align: center;
  }

  .post-exit-btns {
    display: flex;
    gap: 12px;
    margin-top: 4px;
  }

  .post-exit-btn {
    padding: 12px 28px;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.04em;
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .post-exit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .watch-btn {
    background: linear-gradient(180deg, #3a6abf 0%, #2050a0 100%);
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(50, 100, 200, 0.4);
  }

  .watch-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 22px rgba(50, 100, 200, 0.55);
  }

  .result-btn {
    background: linear-gradient(180deg, #3a4a5e 0%, #22303f 100%);
    color: #c8d8f0;
    box-shadow: 0 4px 16px rgba(20, 40, 70, 0.4);
  }

  .result-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 22px rgba(20, 40, 70, 0.55);
  }
</style>



