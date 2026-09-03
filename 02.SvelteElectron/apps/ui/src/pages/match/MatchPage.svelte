<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import BaseballField from "../../features/match-view/ui/BaseballField.svelte";
  import { gameStore } from "../../shared/stores/game";
  import { masterStore, teamsL10n, teamMap } from "../../shared/stores/master";
  import type { EntityRow, EntityDetails } from "../../shared/stores/master";
  import type { InteractiveMatchContext, InteractiveMatchResult } from "../../shared/types/season";
  import { parkViewForHomeTeam } from "../../shared/utils/parkView";
  import { managerEffect } from "../../shared/utils/managerStyle";
  import { managerProfileOf } from "../../shared/utils/staffEffects";
  import TeamMark from "../../features/team/ui/TeamMark.svelte";
  import {
    staminaCostOf, pitchesLeft,
    type CostStrategy, type CostPower,
  } from "../../shared/utils/pitchCost";
  import { pitchSlotsOf, slotCountLabel, gradeFraction } from "../../shared/utils/pitchSlots";
  import { batterBars, seasonLines, seasonStatsOf } from "../../shared/utils/statCard";
  import {
    isOutInPlay, isHit, isStrike, isStrikeout, flashLabel, logLabel, logClass, flashColor,
    type PitchResultCode, type BallInPlay,
  } from "../../shared/utils/matchResult";
  import { seasonStore } from "../../shared/stores/season";
  import { leagueMatchOptions } from "../../shared/utils/matchLeagueOptions";
  import { settingsStore } from "../../shared/stores/settings";
  import {
    scaleMs, showsOverlay, overlayMs, reducesMotion, systemReducedMotion,
  } from "../../shared/utils/effectTiming";
  // 🔴 **import가 없었다.** 아래 `$:` 블록이 이 이름을 쓰는데 스코프에 없어
  //    매번 ReferenceError로 죽었고, `pitchTypes`가 폴백 초기값에 머물러
  //    **주인공이 실제로 던지는 구질 대신 폴백 넷만 보였다.**
  //    조용히 잘못 도는 종류라 화면만 봐선 안 드러난다.
  import { PITCH_ID_TO_ENGINE, type EnginePitchType } from "../../shared/utils/arsenal";


  export let matchContext: InteractiveMatchContext | null = null;
  export let onComplete: (result: InteractiveMatchResult) => void = () => {};
  export let onCancel: () => void = () => {};
  // 실전 MatchPage는 기본적으로 로컬 데모 백업 모드를 사용하지 않음
  export let allowLocalFallback = false;

  /** 엔진이 실제로 보내는 타자 능력치. 셋만 적어 두면 나머지를 화면이 못 읽는다 */
  interface SnapshotBatter {
    id?: string;
    name?: string;
    contact: number;
    power: number;
    eye: number;
    discipline?: number;
    battingClutch?: number;
    platoon?: number;
    speed?: number;
    baseInstinct?: number;
    fielding?: number;
    arm?: number;
  }

  // ⚠ 같은 유니온이 여기에도 적혀 있었다 — `arsenal.ts`가 "정본은 여기
  //   하나다"라고 적어 뒀는데 실제로는 둘이었다. 별칭으로 잇는다.
  type PitchType = EnginePitchType;
  type PitchStrategy = "aggressive" | "balanced" | "safe";
  type PitchPower = "low" | "normal" | "high";

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
    /**
     * ⚠ 엔진은 처음부터 **열 개**를 보낸다(`discipline`·`battingClutch`·
     * `speed`·`baseInstinct`·`fielding`·`arm`·`platoon`). 여기 셋만 적혀 있어
     * 화면이 나머지를 못 봤다 — 값이 없던 게 아니라 타입이 좁았다.
     */
    batter?: SnapshotBatter;
    currentBatter?: SnapshotBatter;
    // 엔진이 들고 있던 라인업 — U7-b에서 DTO에 실어 보내기 시작했다
    awayLineup?: SnapshotBatter[];
    homeLineup?: SnapshotBatter[];
    awayLineupIndex?: number;
    homeLineupIndex?: number;
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

  /**
   * 라인업. **예전엔 하드코딩 상수였다** — `["1 RF", "2 CF", …]`가 박혀 있어서
   * 어느 팀이 붙어도 같은 아홉 명이 나왔다. 엔진은 진짜 라인업을 들고 있었고
   * DTO가 `currentBatter`를 뽑는 데 이미 쓰고 있었는데 목록만 안 보냈다.
   */
  interface LineupBatter { id?: string; name?: string; contact: number; power: number; eye: number }
  let awayLineup: LineupBatter[] = [];
  let homeLineup: LineupBatter[] = [];
  let awayLineupIndex = 0;
  let homeLineupIndex = 0;

  /** 지금 타석에 선 순번. 공격 중인 쪽만 의미가 있다 */
  /**
   * 수비 팀의 [주색, 보조색] — 알 표식이 쓴다.
   *
   * 🔴 **초에는 홈이 수비고 말에는 원정이 수비다.** `half`가 바뀌면 색도 바뀐다.
   * ⚠ **여기서 정하는 이유** — 구장 모듈(`parkView`)은 구장만 알지
   *   어느 팀이 수비인지 모른다. 경기 화면이 아는 값이다.
   * ⚠ 색이 없는 팀은 회색으로 떨어진다. 화면이 안 깨지는 게 먼저다.
   */
  $: defenseTeamId = half === "top" ? matchContext?.homeTeamId : matchContext?.awayTeamId;
  /** 공격 팀 — 수비의 **반대**다. 타자·주자가 이 색을 입는다 */
  $: offenseTeamId = half === "top" ? matchContext?.awayTeamId : matchContext?.homeTeamId;
  $: defenseColors = (($teamMap.get(defenseTeamId ?? "")?.colors)
    ?? ["#7a8a99", "#e8e8c8"]) as readonly [string, string];
  $: offenseColors = (($teamMap.get(offenseTeamId ?? "")?.colors)
    ?? ["#b0503f", "#f0ecc8"]) as readonly [string, string];

  $: awayAtBat = half === "top" ? awayLineupIndex % Math.max(1, awayLineup.length) : -1;
  $: homeAtBat = half === "bottom" ? homeLineupIndex % Math.max(1, homeLineup.length) : -1;

  /**
   * 구장 좌표 — 1000×920 SVG 공간.
   *
   * **경기가 열리는 구장에 따라 달라진다.** 원본 구장 그림 세 장이 각각 따로
   * 그려져 내야 위치가 다르기 때문이다(`parkAnchors.ts` 머리말 참고).
   * 경기 도중 구장이 바뀌지 않으므로 **초기화 때 한 번 정한다** — 반응형으로
   * 두면 아래 `let ballPos = {...retroField.mound}` 류의 초기값이 먼저 실행돼
   * 첫 프레임이 엉뚱한 자리에 찍힌다.
   *
   * ⚠ 예전엔 `baseField`(디지털·닷용)와 짝을 이뤄 화면마다 골라 썼는데,
   * **고르는 코드가 없었다** — `fieldStyle`이 'retro' 하드코딩이라
   * `baseField`는 한 번도 안 쓰였다. U7에서 레트로만 남기며 지웠다.
   */
  const parkView = parkViewForHomeTeam(
    matchContext?.homeTeamId,
    get(masterStore).teams ?? [],
  );
  const retroField = parkView.coords.field;

  $: activeMound = retroField.mound;

  /** 주자는 베이스 위에 정확히 서지 않는다 — 살짝 비껴 서는 게 야구 관습이다 */
  function runnerOffset(base: 'first' | 'second' | 'third'): FieldPoint {
    if (base === 'first') return { x: 14, y: -18 };
    if (base === 'second') return { x: 0, y: -20 };
    return { x: -14, y: -18 };
  }

  function runnerPoint(base: 'first' | 'second' | 'third'): FieldPoint {
    const f = retroField;
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
    } else if (isOutInPlay(resultCode)) {
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

  // 수비 기본 위치 (SVG 좌표 1000x920). 구장 티어에 따라 다르다
  const DEFENSE_RETRO_BASE = parkView.coords.defense as { pos: string; x: number; y: number }[];

  // 애니메이션 중 위치 변경을 반영하기 위한 상태
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
    const base = DEFENSE_RETRO_BASE;
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
      !pitcherPos.includes(String((e.details as EntityDetails)?.player?.position ?? ''))
    );

    // 상대팀 타자 데이터가 9명 미만이면 리그 전체에서 대체 (seed/blank 대응)
    const opponents =
      opponentsInTeam.length >= 9
        ? opponentsInTeam
        : entities.filter((e: EntityRow) =>
            e.role === 'player' &&
            !pitcherPos.includes(String((e.details as EntityDetails)?.player?.position ?? ''))
          );

    if (opponents.length < 9) return [];
    const sorted = [...opponents].sort((a: EntityRow, b: EntityRow) =>
      ((b.details as EntityDetails)?.player?.batting?.ovr ?? 0) - ((a.details as EntityDetails)?.player?.batting?.ovr ?? 0)
    );

    // 포지션 기반 우선 선발, 부족 인원은 OVR 상위로 채움
    const picked: EntityRow[] = [];
    const used = new Set<string>();
    for (const pos of fieldOrder) {
      const found = sorted.find((e) => {
        if (used.has(e.id)) return false;
        const p = String((e.details as EntityDetails)?.player?.position ?? "");
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
      const bat = (e.details as EntityDetails)?.player?.batting ?? {};
      return {
        id: e.id,
        name: e.name ?? undefined,
        contact: bat.contact ?? 50, power: bat.power ?? 50,
        eye: bat.eye ?? 50, discipline: bat.discipline ?? 50,
        battingClutch: bat.battingClutch ?? 50, platoon: bat.platoon ?? 50,
        speed: bat.speed ?? 50, baseInstinct: bat.baseInstinct ?? 50,
      // 🔴 번트를 안 넘기면 희생번트가 다시 죽는다 — 성장 엔진에만 있던 값이다
      bunting: bat.bunting ?? 50,
        fielding: bat.fielding ?? 50, arm: bat.arm ?? 50,
      };
    });
  }

  function buildLineupForTeam(teamId: string): import('../../shared/types/projectb').MatchBatterStats[] {
    return buildOpponentLineup(teamId);
  }

  /**
   * 벤치 — 라인업에 안 든 타자 중 좋은 순으로 넷.
   *
   * ⚠ 안 넘기면 엔진이 빈 벤치로 돌아 **대타가 한 번도 안 나온다**
   *   (`serde(default)` 라 오류도 안 난다).
   * ⚠ 라인업과 **같은 재료**로 뽑는다 — 다른 기준을 쓰면 라인업에 든
   *   사람이 벤치에도 들어가 자기 자신으로 교체된다.
   */
  function buildBenchForTeam(teamId: string): import('../../shared/types/projectb').MatchBatterStats[] {
    const inLineup = new Set(buildOpponentLineup(teamId).map((b) => b.id));
    const entities = get(masterStore).entities;
    const pitcherPos = ['SP', 'RP', 'CP'];
    return entities
      .filter((e: EntityRow) =>
        e.teamId === teamId && e.role === 'player' &&
        !pitcherPos.includes(String((e.details as EntityDetails)?.player?.position ?? '')) &&
        !inLineup.has(e.id))
      .sort((a: EntityRow, b: EntityRow) =>
        ((b.details as EntityDetails)?.player?.batting?.ovr ?? 0) -
        ((a.details as EntityDetails)?.player?.batting?.ovr ?? 0))
      .slice(0, 4)
      .map((e: EntityRow) => {
        const bat = (e.details as EntityDetails)?.player?.batting ?? {};
        return {
          id: e.id,
          name: e.name ?? undefined,
          contact: bat.contact ?? 50, power: bat.power ?? 50,
          eye: bat.eye ?? 50, discipline: bat.discipline ?? 50,
          battingClutch: bat.battingClutch ?? 50, platoon: bat.platoon ?? 50,
          speed: bat.speed ?? 50, baseInstinct: bat.baseInstinct ?? 50,
          bunting: bat.bunting ?? 50,
          fielding: bat.fielding ?? 50, arm: bat.arm ?? 50,
        };
      });
  }

  function buildPitcherStatsForTeam(teamId: string): {
    // ⚠ **`name` 이 빠져 있었다.** 아래 `return` 은 넣어서 보내는데 선언에만
    //   없었다 — 엔진 쪽 `pitcher` 페이로드는 이름을 받는다(`MainPage` 도
    //   같이 넘긴다). 값이 아니라 선언이 뒤처진 자리다
    name?: string;
    command?: number; velocity?: number; staminaCap?: number;
    mentalResil?: number; control?: number; movement?: number;
    clutch?: number; holdRunners?: number;
  } | undefined {
    const entities = get(masterStore).entities;
    const pitcherPos = ['SP', 'RP', 'CP'];
    const pitchers = entities.filter((e: EntityRow) =>
      e.teamId === teamId &&
      e.role === 'player' &&
      pitcherPos.includes(String((e.details as EntityDetails)?.player?.position ?? ''))
    );
    if (pitchers.length === 0) return undefined;
    const sorted = [...pitchers].sort((a: EntityRow, b: EntityRow) => {
      const posOrder: Record<string, number> = { SP: 0, RP: 1, CP: 2 };
      const aDiff = posOrder[String((a.details as EntityDetails)?.player?.position ?? 'RP')] ?? 1;
      const bDiff = posOrder[String((b.details as EntityDetails)?.player?.position ?? 'RP')] ?? 1;
      if (aDiff !== bDiff) return aDiff - bDiff;
      return ((b.details as EntityDetails)?.player?.pitching?.ovr ?? 0) - ((a.details as EntityDetails)?.player?.pitching?.ovr ?? 0);
    });
    const src = sorted[0];
    const pit = (src.details as EntityDetails)?.player?.pitching ?? {};
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
      entities.find((e) => String((e.details as EntityDetails)?.player?.position ?? "") === pos);
    const pickPitcher = () =>
      pickByPos("SP") ?? pickByPos("RP") ?? pickByPos("CP") ?? entities[0];

    return posOrder.map((pos) => {
      const source = pos === "P" ? pickPitcher() : pickByPos(pos);
      const bat = (source?.details as EntityDetails)?.player?.batting ?? {};
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

  interface PitchOption { id: PitchType; label: string; grade: number | null }

  let pitchTypes: PitchOption[] = fallbackPitchTypes.map((p) => ({ ...p, grade: null }));
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

  // ── 등판 / 관전 (U7-a) ────────────────────────────────────────
  //
  // ⚠ `isProtagonistPitching`은 Rust가 계산해 스냅샷으로 보내는데
  // **UI가 한 번도 안 읽었다.** 타입 선언 한 줄뿐이었다(match_engine.rs:242 →
  // lib.rs:121 → projectb.d.ts:358 → 여기).
  //
  // 화면은 대신 `currentPhase !== "protagonist_pitch"`로 **버튼만 비활성화**
  // 했다. 관전 중에도 구종 버튼 10개·존·실행 버튼이 그대로 떠 있고 눌리지만
  // 않아서 "내가 뭘 해야 하는데 안 되는 건가"로 읽혔다.
  let isProtagonistPitching = true;

  /** 지금 내가 던지고 있나. 아니면 관전이다 */
  $: onMound = isProtagonistPitching && currentPhase === "protagonist_pitch";
  $: modeLabel = onMound ? "등판 중" : "관전";

  /** 지금 고른 조합의 스태미나 소모. 정본은 `balance/match_engine_tuning.json` */
  $: currentCost = staminaCostOf(
    selectedPitchType === "fastball",
    selectedStrategy as CostStrategy,
    selectedPower as CostPower,
  );
  $: remainingPitches = pitchesLeft(pitcherState.stamina, currentCost);

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
      .map((entry): PitchOption | null => {
        const id = PITCH_ID_TO_ENGINE[entry.id];
        if (!id) return null;
        return {
          id,
          label: catalogNameById.get(entry.id) ?? entry.id.replace("PITCH_", ""),
          // 숙련도는 이미 세이브에 있었는데 경기 화면이 안 읽고 있었다
          grade: entry.grade ?? null,
        };
      })
      .filter((entry): entry is PitchOption => Boolean(entry));
    const deduped: PitchOption[] = [];
    for (const pitch of mapped) {
      if (deduped.some((d) => d.id === pitch.id)) continue;
      deduped.push(pitch);
    }
    pitchTypes = deduped.length > 0 ? deduped : fallbackPitchTypes.map((p) => ({ ...p, grade: null }));
    if (!pitchTypes.some((p) => p.id === selectedPitchType)) {
      selectedPitchType = pitchTypes[0].id;
    }
  }

  /**
   * 5칸 슬롯. 빈칸은 **어떤 구종의 자리도 아니므로 이름을 붙이지 않는다** —
   * 자세한 건 `pitchSlots.ts` 머리말.
   */
  $: pitchSlots = pitchSlotsOf(pitchTypes, $masterStore.pitchMaxLearned);
  $: slotLabel  = slotCountLabel(pitchTypes.length, $masterStore.pitchMaxLearned);

  $: if (matchContext) {
    const teamById = new Map($teamsL10n.map((t) => [t.id, t.name]));
    scoreRows = [
      { ...scoreRows[0], team: teamById.get(matchContext.awayTeamId) ?? matchContext.awayTeamId },
      { ...scoreRows[1], team: teamById.get(matchContext.homeTeamId) ?? matchContext.homeTeamId },
    ];
  }

  let playByPlayLines: { text: string; cls: string }[] = [
    { text: "매치 엔진 초기화 중...", cls: "" }
  ];

  /** 지금 타석에 선 타자. 엔진이 준 값을 그대로 들고 있는다 */
  let currentBatter: SnapshotBatter | null = null;

  /** 카드 뒤집기 — 앞면 능력치 / 뒷면 시즌 성적 */
  let batterFlipped = false;
  let pitcherFlipped = false;

  $: batterAttrBars = batterBars(currentBatter);
  $: batterSeason = seasonLines(
    seasonStatsOf(currentBatter?.id, $seasonStore.stats, $seasonStore.leagueState),
  );
  $: pitcherSeason = seasonLines(
    seasonStatsOf($gameStore.protagonist.id, $seasonStore.stats, $seasonStore.leagueState),
  );

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

  let ballPos: FieldPoint = { ...retroField.mound };
  let ballTrail: FieldPoint[] = [];
  const TRAIL_MAX = 6;
  let resultOverlay = { visible: false, text: '', color: '#ffffff' };
  // ── 연출 설정 (S4) ────────────────────────────────────────────
  //
  // ⚠ **시간을 곱할 자리를 하나로 모은다.** 예전엔 1400·600·220 같은 숫자가
  // 이 파일에 흩어져 있어 설정으로 조절할 방법이 없었다.
  $: speed = $settingsStore.effectSpeed;
  /** 그 연출에 쓸 시간. 설정이 "끄기"여도 0이 되지는 않는다 */
  const ms = (base: number) => scaleMs(base, $settingsStore.effectSpeed);
  $: lessMotion = reducesMotion($settingsStore.reduceMotion, systemReducedMotion());

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
  // 게이지 색은 의미색 토큰을 쓴다 — 밝은 지면에서 읽히는 값은 거기 있다
  $: staminaColor = pitcherState.stamina > 60 ? 'var(--ok)' : pitcherState.stamina > 30 ? 'var(--warn)' : 'var(--bad)';
  $: mentalColor  = pitcherState.mental  > 60 ? 'var(--ok)' : pitcherState.mental  > 30 ? 'var(--warn)' : 'var(--bad)';

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
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
      const myTeamId = matchContext?.protagonistTeamId ?? state.protagonist.teamId;
      const opponentTeamId = matchContext
        ? (matchContext.homeTeamId === myTeamId ? matchContext.awayTeamId : matchContext.homeTeamId)
        : "";
      const opponentLineup = opponentTeamId ? buildOpponentLineup(opponentTeamId) : [];
      // ⚠ **자기 팀 수비다.** 엔진의 `fielders`는 배열 하나이고 주인공이
      // 던지는 동안의 인플레이 타구 판정에 쓰인다(`resolve_fielding_result`) —
      // 그때 뒤에 서는 건 소속팀 야수지 상대가 아니다. 예전엔 상대 팀을
      // 넘기고 있었고, 자동 진행 경로는 아예 안 넘겨 평균 50이 됐다.
      const fielders = myTeamId ? buildOpponentFielders(myTeamId) : [];
      const myLineup = myTeamId ? buildLineupForTeam(myTeamId) : [];
      // 🔴 **벤치** — 대타 후보. 안 넘기면 교체가 한 번도 안 일어난다.
      const myBench = myTeamId ? buildBenchForTeam(myTeamId) : [];
      const oppBench = opponentTeamId ? buildBenchForTeam(opponentTeamId) : [];
      const opponentPitcherStats = opponentTeamId ? buildPitcherStatsForTeam(opponentTeamId) : undefined;
      const ctx = matchContext;
      const myNpcStarterStats = (ctx?.role !== 'SP' && myTeamId) ? buildPitcherStatsForTeam(myTeamId) : undefined;
      const isHome = !ctx || ctx.protagonistTeamId === ctx.homeTeamId;
      const myManagerEntity = get(masterStore).entities.find(
        (e) => e.role === "manager" && e.teamId === myTeamId
      );
      // Rust ManagerStats와 키가 같으므로 그대로 넘긴다. 예전엔 옛 키를 새 키에
      // 별칭으로 붙이고 있었는데 옛 키가 이미 없어서 5종 중 4종이 undefined였다 —
      // JSON.stringify가 그 키를 지워 Rust는 매 경기 기본값으로 돌았다
      // 🔴 **작전 배수를 같이 넘긴다.** 스타일 9종이 저장되고 팀 상세에
      //   표시까지 되는데 경기에선 아무것도 안 바꿨다 — 안 넘기면
      //   `serde(default)` 라 조용히 1.0(예전 동작)이 된다.
      const myMgrEff = managerEffect(managerProfileOf(myTeamId ?? "", get(masterStore).entities));
      const myManagerStats = myManagerEntity?.details.manager
        ? { ...myManagerEntity.details.manager.stats,
            buntMult: myMgrEff.buntMult, stealMult: myMgrEff.stealMult }
        : undefined;
      // 상대 팀 감독 — 같은 방식으로 뽑는다
      const oppTeamId = ctx
        ? (ctx.protagonistTeamId === ctx.homeTeamId ? ctx.awayTeamId : ctx.homeTeamId)
        : "";
      const oppManagerEntity = get(masterStore).entities.find(
        (e) => e.role === "manager" && e.teamId === oppTeamId
      );
      const oppMgrEff = managerEffect(managerProfileOf(oppTeamId, get(masterStore).entities));
      const oppManagerStats = oppManagerEntity?.details.manager
        ? { ...oppManagerEntity.details.manager.stats,
            buntMult: oppMgrEff.buntMult, stealMult: oppMgrEff.stealMult }
        : undefined;
      const response = await window.projectB.matchStart({
        // 투구수 상한이 리그별이다 — 고교 105 / 그 외 120 (Phase 5-8)
        leagueId: $gameStore.protagonist.leagueId,
        // 1.1 A② §6-1 — 리그가 정하는 투구수 상한·선발 아웃 계수·마무리 문·의무 휴식 (규칙 파일)
        ...leagueMatchOptions($gameStore.protagonist.leagueId,
          $seasonStore.leagueState[$gameStore.protagonist.leagueId]?.playerConditions?.[$gameStore.protagonist.id],
          $seasonStore.currentDate, $gameStore.protagonist.roleFit),
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
        // 🔴 **상대 감독도 넘긴다.** `opponent_manager` 는 Rust 에 자리가
        //   있는데 TS 가 한 번도 안 넘겨서 늘 기본값 50이었다 —
        //   상대 팀은 감독이 누구든 똑같이 번트를 대고 도루를 걸었다.
        ...(oppManagerStats ? { opponentManager: oppManagerStats } : {}),
        // 🔴 **벤치** — `homeBench`/`awayBench` 는 **절대 좌표**다.
        //   라인업처럼 `myTeamLineup` 별칭이 없어서 여기서 갈라 넣는다.
        //   뒤집어 넣으면 상대 벤치가 우리 타순으로 들어간다.
        ...(myBench.length > 0
          ? (isHome ? { homeBench: myBench } : { awayBench: myBench }) : {}),
        ...(oppBench.length > 0
          ? (isHome ? { awayBench: oppBench } : { homeBench: oppBench }) : {}),
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

  // 색·문구의 정본은 `matchResult.ts` 하나다 (예전엔 네 군데였다)
  const resultToCls = logClass;

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
    const hitThisPitch = isHit(resultCode);
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
          h: row.h + (isBattingTeam && hitThisPitch ? 1 : 0),
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
        h: row.h + (isBattingTeam && hitThisPitch ? 1 : 0),
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
    if (batter) currentBatter = batter;
    if (snapshot.weather) matchWeather = snapshot.weather;
    if (snapshot.park) matchPark = snapshot.park;
    if (snapshot.defenseStat) matchDefenseStat = { ...snapshot.defenseStat };

    if (snapshot.phase !== undefined) currentPhase = snapshot.phase;
    if (snapshot.protagonistHasEntered !== undefined) protagonistHasEntered = snapshot.protagonistHasEntered;
    if (snapshot.protagonistSide !== undefined) protagonistSide = snapshot.protagonistSide;
    // 엔진이 계속 보내던 값 — U7-a에서 처음 읽는다
    if (snapshot.isProtagonistPitching !== undefined) isProtagonistPitching = snapshot.isProtagonistPitching;
    if (snapshot.awayLineup) awayLineup = snapshot.awayLineup as LineupBatter[];
    if (snapshot.homeLineup) homeLineup = snapshot.homeLineup as LineupBatter[];
    if (snapshot.awayLineupIndex !== undefined) awayLineupIndex = snapshot.awayLineupIndex;
    if (snapshot.homeLineupIndex !== undefined) homeLineupIndex = snapshot.homeLineupIndex;
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
    if (isOutInPlay(resultCode)) return { x: 560, y: 560 };
    if (resultCode === "HIT_SINGLE") return { x: 710, y: 640 };
    if (resultCode === "HIT_DOUBLE") return { x: 680, y: 430 };
    if (resultCode === "HIT_TRIPLE") return { x: 330, y: 360 };
    return { x: 500, y: 230 };
  }

  /**
   * 공 이동. **좌표를 정수로 끊는다** — 픽셀아트 위에서 소수 좌표로 움직이면
   * 공이 반 픽셀에 걸쳐 흐릿해진다. 거리에 비례해 걸음 수를 잡아 속도감도 살린다.
   *
   * ⚠ 예전엔 여기 분기가 둘이었다. 정수 경로는 `dot` 모드 전용이고 레트로는
   * 소수 보간 쪽으로 갔는데, **레트로야말로 픽셀아트다** — 방향이 뒤바뀌어 있었다.
   */
  /**
   * 공을 옮긴다.
   *
   * 🔴 **엔진이 `arc` 를 채워 보내는데 받아서 버리고 있었다.** 직선
   *   보간만 해서 **팝업도 땅볼도 같은 궤적**이었다. 엔진은 타구
   *   종류별로 이미 다른 값을 준다(팝업 0.85 · 뜬공 0.60 · 라인 0.15 ·
   *   땅볼 0.05 · 번트 0.08).
   *
   * ⚠ 0이면 예전과 똑같은 직선이다 — 투구·송구는 arc 를 안 넘긴다.
   */
  async function tweenBall(to: FieldPoint, duration: number, arc = 0) {
    const from = { ...ballPos };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.round(dist / 10));
    const delay = Math.max(20, Math.round(duration / steps));
    // 포물선 높이 — 거리에 비례한다. 짧은 타구가 높이 뜨면 어색하다
    const lift = arc * dist * 0.55;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // 4t(1-t) 는 t=0.5 에서 1이고 양 끝에서 0이다 — 시작·도착이 안 뜬다
      const rise = lift * 4 * t * (1 - t);
      ballTrail = [...ballTrail, { ...ballPos }].slice(-TRAIL_MAX);
      ballPos = {
        x: Math.round(from.x + dx * t),
        y: Math.round(from.y + dy * t - rise),
      };
      await sleep(delay);
    }
    ballTrail = [];
  }

  function showResultOverlay(code: PitchResultCode) {
    // "끄기"는 이 연출을 통째로 건너뛴다 — 100구면 2분 20초다
    if (!showsOverlay(speed)) return;
    const entry = { text: flashLabel(code), color: flashColor(code) };
    if (overlayTimer) clearTimeout(overlayTimer);
    resultOverlay = { visible: true, ...entry };
    overlayTimer = setTimeout(() => {
      resultOverlay = { ...resultOverlay, visible: false };
    }, overlayMs(speed));
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 🔴 **로컬 시뮬 114줄을 지웠다** (2026-08-28).
  //
  //   `rollLocalResult`가 안타 종류 분포를 `Math.random()`으로 굴리고
  //   `applyLocalResult`가 주자·아웃·이닝까지 처리했다 — **TS 안의 두 번째
  //   야구 엔진**이었다. 규칙이 Rust와 갈릴 수밖에 없는 구조다.
  //
  // ⚠ **아무도 안 켜고 있었다.** `allowLocalFallback` 기본값이 false이고
  //   `MainPage`가 그 prop을 안 넘긴다 — 죽은 갈래였다.
  //   엔진이 없으면 위 `runPitch`가 안내 문구를 띄우고 멈춘다.
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
          await sleep(ms(600));
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
    const arr = defenseRetro;
    const idx = arr.findIndex(d => d.pos === pos);
    if (idx < 0) return;
    const from = { x: arr[idx].x, y: arr[idx].y };
    const steps = Math.max(1, Math.round(duration / 16));
    activeFielderPos = pos;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = 1 - (1 - t) * (1 - t);
      arr[idx] = { ...arr[idx], x: Math.round(from.x + (svgTo.x - from.x) * eased), y: Math.round(from.y + (svgTo.y - from.y) * eased) };
      defenseRetro = [...arr];
      await sleep(16);
    }
    await sleep(200);
    // 원위치 복귀
    const base = DEFENSE_RETRO_BASE;
    const orig = base.find(d => d.pos === pos);
    if (orig) {
      arr[idx] = { ...arr[idx], x: orig.x, y: orig.y };
      defenseRetro = [...arr];
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
        await tweenBall(clickedFieldPos, ms(cue.duration));
      } else if (cue.type === "ball_batted") {
        // ⚠ **타구만 포물선이다.** 송구는 직선이라 arc 를 안 넘긴다.
        const svgTo = enginePosToSvg(cue.to);
        await tweenBall(svgTo, ms(cue.duration), cue.arc);
      } else if (cue.type === "ball_throw") {
        const svgTo = enginePosToSvg(cue.to);
        await tweenBall(svgTo, ms(cue.duration));
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
        if (runnerCues.length > 0) {
          await animateRetroRunners(code, prevRunners);
          syncRetroPositions();
        }
        showResultOverlay(code);
      }
    }

    await tweenBall(activeMound, ms(180));
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
          leagueId: get(gameStore).protagonist.leagueId,
          ...leagueMatchOptions(get(gameStore).protagonist.leagueId,
            get(seasonStore).leagueState[get(gameStore).protagonist.leagueId]?.playerConditions?.[get(gameStore).protagonist.id],
            get(seasonStore).currentDate, get(gameStore).protagonist.roleFit),
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
      // 타구 정보가 있으면 "유격수 땅볼 아웃"까지 쓴다. 없으면 기본 문구다
      const ball = (response.outcome.ballInPlay ?? null) as BallInPlay | null;
      const pitchLabel = pitchTypes.find((p) => p.id === selectedPitchType)?.label ?? "";
      line = `${inningHalfLabel} · ${pitchLabel} → ${logLabel(resultCode, ball)}`;
      pitcherState = { ...pitcherState, speed: `${statToKmh(get(gameStore).player.pitcherStats.velocity, selectedPower)} km/h` };
      const prevOuts = count.out;
      applySnapshot(response.snapshot, line, resultCode);

      // ⚠ 엔진이 만들던 주루·실책 문장이 **직접 투구에서는 화면에 안 왔다.**
      // 자동 시뮬만 `response.logs`를 읽고 있었다.
      for (const nl of response.narrativeLogs ?? []) pushLog(nl, "log-auto");
      const outsGained = count.out >= prevOuts ? count.out - prevOuts : (3 - prevOuts) + count.out;
      if (outsGained > 0) totalOutsRecorded += outsGained;

      // 개인 기록 집계
      /*
        ⚠ **간접 판정이었다** — `isStrike(코드) && 아웃이 늘었나`.
        스트라이크와 아웃이 겹치기만 하면 세므로, 그 투구에 **도루 저지**처럼
        다른 이유로 아웃이 늘면 삼진이 아닌데도 하나 올라갔다.

        엔진이 3스트라이크째에 코드를 좁혀 주고(`STRIKEOUT_*`) 그걸 가르는
        `isStrikeout` 이 있다 — 그걸 쓴다. 정확하고 읽기도 쉽다.
      */
      if (isStrikeout(resultCode)) {
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
        {
          const atBatEnded = resultCode !== 'STRIKE_SWING' && resultCode !== 'STRIKE_LOOK'
            && resultCode !== 'FOUL' && resultCode !== 'BALL';
          if (atBatEnded) batter = { handedness: batterHandOf(currentBatter) };
          syncRetroPositions();
        }
      } else {
        await tweenBall(clickedFieldPos, ms(220));
        showResultOverlay(resultCode);
        if (isOutInPlay(resultCode) || isHit(resultCode)) {
          await tweenBall(getBattedTarget(resultCode), ms(300));
        }
        {
          await animateRetroRunners(resultCode, prevRunners);
          const atBatEnded = resultCode !== 'STRIKE_SWING' && resultCode !== 'STRIKE_LOOK'
            && resultCode !== 'FOUL' && resultCode !== 'BALL';
          if (atBatEnded) batter = { handedness: batterHandOf(currentBatter) };
          syncRetroPositions();
        }
        await tweenBall(activeMound, ms(180));
      }

      // 경기 중 부상 처리
      if (response.midGameInjury) {
        const inj = response.midGameInjury;
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
    let engineEarnedRuns: number | undefined;
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
        if (typeof result.earnedRuns === 'number') engineEarnedRuns = result.earnedRuns;
      } catch { /* ignore */ }
    }

    const awayScore = scoreRows[0].r;
    const homeScore = scoreRows[1].r;
    const won = protagonistSide === "home" ? homeScore > awayScore : awayScore > homeScore;

    // 🔴 **자책점은 엔진이 준다** (2026-08-28). 예전엔 `피안타 × 0.35`로
    //   **값을 지어냈다** — 피안타가 부풀면 자책점이 자동으로 따라 올랐다.
    //   화면도 스스로 "자책(추정)"이라 적고 있었다.
    //
    //   엔진이 준 `playerLines`에 주인공 투수 줄이 있고 거기 진짜 자책점이 있다.
    // ⚠ 엔진 줄이 없을 때만(구 경로·주인공 미등판) 옛 역산으로 떨어진다.
    // ⚠ `playerLines`는 옵셔널이고 투타 유니온이다 — `role`로 좁혀야
    //   `er`을 볼 수 있다. 안 좁히면 타자 줄에서 없는 필드를 읽는다.
    const myLine = (playerLines ?? []).find(
      (l): l is Extract<import('../../shared/types/season').PlayerGameLine, { role: "pitcher" }> =>
        l.role === "pitcher" && l.playerId === $gameStore.protagonist.id,
    );
    // ⚠ **주인공 줄은 `playerLines`에 없다** — 엔진이 등판 중엔 큐 누적을
    //   건너뛰고 `erSinceEntry`에 따로 쌓는다. 그래서 엔진 자책점을 먼저 본다.
    //   `myLine`은 구 경로·다른 투수용 갈래로 남긴다.
    const runsAllowed = typeof engineEarnedRuns === "number"
      ? Math.max(0, Math.round(engineEarnedRuns))
      : myLine && typeof myLine.er === "number"
        ? Math.max(0, Math.round(myLine.er))
        : Math.round(totalHitsAllowed * 0.35);
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
        await sleep(ms(600));
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
        // 🔴 **안 넘기고 있었다** — 받는 쪽(`applyGameOutcome`)이 다시
        //   `피안타 × 0.35`로 역산했다. 직접 플레이 경기만 그랬다
        earnedRuns: gameResult.runsAllowed,
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

  // 엔진이 없을 때 쓰는 문구도 같은 표에서 온다
  const localComment = (code: PitchResultCode) => logLabel(code);

  /**
   * 타석에 선 타자의 **실제 좌우**.
   *
   * 🔴 예전엔 `Math.random() < 0.32`로 매 타석 굴렸다 — TS 게임 로직에서
   *   난수는 금지고, 무엇보다 **화면에 뜬 타자와 스프라이트가 달랐다.**
   *   같은 타자가 타석마다 좌우가 바뀌었다.
   *
   * ⚠ 좌우는 **엔진이 안 보는 값**이다(`BatterStats`에 없다) — 결과에
   *   영향이 없는 스프라이트 표시다. 그래서 세이브에서 직접 읽는다.
   * ⚠ 스위치히터(`"S"`)는 투수 반대쪽에 선다 — 지금은 우투 기준으로 좌타다.
   * ⚠ 못 찾으면 우타로 둔다. **지어내지 않는다.**
   */
  function batterHandOf(b: SnapshotBatter | null | undefined): 'L' | 'R' {
    const id = b?.id;
    if (!id) return 'R';
    const h = $gameStore.npcs.find((x) => x.npcId === id)?.handedness
      ?? (id === $gameStore.protagonist.id ? $gameStore.protagonist.handedness : undefined);
    if (h === 'L') return 'L';
    if (h === 'S') return 'L';
    return 'R';
  }
</script>

<section class="match-engine-empty" aria-label="match engine workspace">
  <!--
    상단 줄 — 어느 경기이고, 내가 지금 뭘 하는 중이고, 어떻게 나가나.
    ⚠ 예전엔 **나가는 길이 화면에 없었다.** `onCancel`이 Esc에만 걸려 있어서
    경기 도중 나가려면 그 단축키를 알아야 했다.
  -->
  <div class="match-bar">
    <span class="mode-chip" class:on-mound={onMound}>{modeLabel}</span>
    <span class="bar-inning">{inningHalfLabel}</span>
    <span class="bar-park">
      <span class="chip-mini">{WEATHER_LABEL[matchWeather]}</span>
      <span class="chip-mini">{PARK_LABEL[matchPark]}</span>
    </span>
    <button class="exit-btn" type="button" on:click={onCancel} title="Esc">나가기</button>
  </div>

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
          {@const rowTeamId = i === 0 ? (matchContext?.awayTeamId ?? "") : (matchContext?.homeTeamId ?? "")}
          <tr class:my-team-row={isMyTeam}>
            <th class="team-col">
              <!--
                ⚠ **두 팀을 색으로 가르지 않는다.** 헤더용 팀 색은 238팀이
                전부 L*26으로 눌려서 30.8%의 대진이 구분되지 않는다(§3-6 실측).
                형태로 가르는 마크가 그 일을 한다 — 같은 리그 안에서 안 겹치는
                게 테스트로 보증된다.
              -->
              <span class="team-cell">
                {#if rowTeamId}<TeamMark teamId={rowTeamId} size={16} />{/if}
                <span class="team-name">{row.team}</span>
              </span>
            </th>
            {#each row.inningScores as inningScore, i}
              <td class:current-inning={i + 1 === inning}>{inningScore}</td>
            {/each}
            <td class="rhe r-col">{row.r}</td>
            <td class="rhe">{row.h}</td>
            <td class="rhe">{row.e}</td>
            <td class="rhe">{row.b}</td>
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
            <ol class="lineup-list">
              {#each awayLineup as b, i}
                <li class:at-bat={i === awayAtBat} class:on-deck={i === (awayAtBat + 1) % Math.max(1, awayLineup.length) && awayAtBat >= 0}>
                  <span class="lu-no">{i + 1}</span>
                  <span class="lu-name">{b.name ?? "-"}</span>
                </li>
              {/each}
              {#if awayLineup.length === 0}<li class="lu-empty">-</li>{/if}
            </ol>
          </aside>

          <div class="field-stage-wrap">
            <BaseballField
              defenders={defenseRetro}
              {defenseColors}
              {offenseColors}
              {ballPos}
              {ballTrail}
              strikeZoneTarget={clickedFieldPos}
              {isPitching}
              parkImage={parkView.imageUrl}
              {batter}
              batterAnimPos={retroBatterPos}
              runnerAnimPositions={retroRunnerPositions}
              on:selectPosition={(event) => (selectedDefPosition = event.detail.pos)}
            />
            {#if resultOverlay.visible}
              <!--
                트래킹 인 — 넓게 흩어진 글자가 제자리로 모인다.
                판(상자)이 없어 다이아몬드를 덜 가리고, 움직임 자체가 장식이라
                글자에 테두리를 두르지 않아도 된다. 색은 아래 막대가 맡는다.
              -->
              <div class="result-overlay" style="--rc: {resultOverlay.color};">
                <div class="track-grp">
                  <span class="track-text">{resultOverlay.text}</span>
                  <div class="track-rule"></div>
                </div>
              </div>
            {/if}
            {#if changeAlert.visible}
              <div class="change-overlay">
                <span class="change-text">체인지!</span>
              </div>
            {/if}
          </div>

          <aside class="lineup-panel" aria-label="home lineup">
            <h3>{homeLineupTitle}</h3>
            <ol class="lineup-list">
              {#each homeLineup as b, i}
                <li class:at-bat={i === homeAtBat} class:on-deck={i === (homeAtBat + 1) % Math.max(1, homeLineup.length) && homeAtBat >= 0}>
                  <span class="lu-no">{i + 1}</span>
                  <span class="lu-name">{b.name ?? "-"}</span>
                </li>
              {/each}
              {#if homeLineup.length === 0}<li class="lu-empty">-</li>{/if}
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
      <!--
        주자와 카운트를 한 패널로 합쳤다. 둘은 **한 상황의 두 축**이고
        따로 보면 "2사 만루"를 읽는 데 눈이 두 번 움직인다.
      -->
      <section class="panel situation-panel" aria-label="base and count panel">
        <h2>상황</h2>
        <div class="situation-body">
          <div class="base-panel">
            <div class="diamond">
              <div class="base b2" class:on={runners.second}></div>
              <div class="base b3" class:on={runners.third}></div>
              <div class="base b1" class:on={runners.first}></div>
              <div class="base home"></div>
            </div>
          </div>

          <div class="count-panel">
            <h3 class="sr-only">{countTitle}</h3>
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
          </div><!-- /.sbo-board -->
          </div><!-- /.count-panel -->
        </div><!-- /.situation-body -->
      </section>

      <!--
        관전 중에는 접는다. **비활성화가 아니라 접는 것**이다 — 눌리지 않는
        버튼 10개가 그대로 떠 있으면 "내가 뭘 해야 하는데 안 되는 건가"로 읽힌다.
      -->
      {#if onMound}
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
          <div class="ps-head">
            <h2>{pitchSelectTitle}</h2>
            <!--
              ⚠ **구종을 흐리게 만들지 않는다.** 엔진은 스태미나로 구종을 막지
              않는다 — 낮은 스태미나는 모든 구질을 함께 깎을 뿐이다. 화면이
              막으면 없는 규칙을 지어내는 것이고, 이 프로젝트는 이미 "부상위험 %"
              에서 그 실수를 했다. 대신 **실제로 있는 것**(선택별 소모)을 보여준다.
            -->
            {#if currentCost !== null}
              <span class="cost-chip" class:thin={remainingPitches !== null && remainingPitches <= 15}>
                이 선택 {currentCost.toFixed(2)}/구{#if remainingPitches !== null} · 약 {remainingPitches}구{/if}
              </span>
            {/if}
          </div>

          <!--
            좌우 분할 — 왼쪽은 구종 슬롯, 오른쪽은 전략·세기.
            전략·세기를 세로로 쌓으면 패널이 393px까지 늘어 오른쪽 열이
            153px 넘친다(실측). 세그먼트로 묶으면 두 줄이면 된다.
          -->
          <div class="ps-split">
            <div class="slot-col" role="radiogroup" aria-label="구종">
              {#each pitchSlots as slot (slot.no)}
                {#if slot.kind === "learned"}
                  <button
                    type="button"
                    class="slot"
                    class:active={selectedPitchType === slot.id}
                    role="radio"
                    aria-checked={selectedPitchType === slot.id}
                    on:click={() => (selectedPitchType = slot.id as PitchType)}
                  >
                    <span class="slot-no">{slot.no}</span>
                    <span class="slot-name">{slot.label}</span>
                    {#if gradeFraction(slot.grade) !== null}
                      <span class="slot-grade" title="숙련도 {slot.grade}/5">
                        <i style="width:{(gradeFraction(slot.grade) ?? 0) * 100}%"></i>
                      </span>
                    {/if}
                  </button>
                {:else}
                  <!--
                    ⚠ 빈칸에 구종 이름을 적지 않는다. 슬롯은 특정 구종의 자리가
                    아니라 조건을 채운 것 중 아무거나 들어갈 칸이다 — 이름을 적으면
                    화면이 없는 규칙을 지어내는 것이 된다.
                  -->
                  <div class="slot empty" aria-label="빈 구종 칸">
                    <span class="slot-no">{slot.no}</span>
                    <span class="slot-lock" aria-hidden="true">🔒</span>
                  </div>
                {/if}
              {/each}
            </div>

            <div class="opt-col">
              <p class="opt-label" id="lbl-strategy">전략</p>
              <div class="seg" role="radiogroup" aria-labelledby="lbl-strategy">
                {#each strategies as strategy}
                  <button
                    type="button"
                    class:active={selectedStrategy === strategy.id}
                    role="radio"
                    aria-checked={selectedStrategy === strategy.id}
                    on:click={() => (selectedStrategy = strategy.id)}
                  >{strategy.label}</button>
                {/each}
              </div>

              <p class="opt-label" id="lbl-power">세기</p>
              <div class="seg" role="radiogroup" aria-labelledby="lbl-power">
                {#each powers as power}
                  <button
                    type="button"
                    class:active={selectedPower === power.id}
                    role="radio"
                    aria-checked={selectedPower === power.id}
                    on:click={() => (selectedPower = power.id)}
                  >{power.label}</button>
                {/each}
              </div>

              <p class="slot-count">구종 {slotLabel}</p>
            </div>
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
      {:else}
        <!-- 관전 — 조작할 게 없으니 지금 무슨 일이 벌어지는지만 크게 둔다 -->
        <section class="panel watch-panel" aria-label="spectator panel">
          <h2>관전 중</h2>
          <p class="watch-note">
            {protagonistHasEntered ? "교체돼 벤치에 있다." : "아직 등판하지 않았다."}
          </p>
          <p class="watch-sub">{inningHalfLabel} · {scoreRows[0].r} : {scoreRows[1].r}</p>
        </section>
      {/if}

      <div class="pair-row">
        <!--
          앞면 능력치 / 뒷면 시즌 성적. 뒷면은 **실제 기록만** 그린다 —
          없으면 0이 아니라 "기록 없음"이다 (`statCard.ts` 머리말).
        -->
        <section class="panel info-panel" aria-label="batter info panel">
          <div class="card-head">
            <h2>{currentBatter?.name ?? batterInfoTitle}</h2>
            <button
              type="button"
              class="flip-btn"
              aria-pressed={batterFlipped}
              on:click={() => (batterFlipped = !batterFlipped)}
            >{batterFlipped ? "능력치" : "성적"}</button>
          </div>

          {#if !batterFlipped}
            <ul class="bar-list">
              {#each batterAttrBars as b (b.label)}
                <li>
                  <span class="bl">{b.label}</span>
                  <span class="bt"><i style="width:{Math.max(0, Math.min(100, b.value))}%"></i></span>
                  <strong class="bv">{Math.round(b.value)}</strong>
                </li>
              {:else}
                <li class="card-empty">타자 정보를 기다리는 중</li>
              {/each}
            </ul>
          {:else}
            <ul class="line-list">
              {#each batterSeason as l (l.label)}
                <li><span>{l.label}</span><strong>{l.value}</strong></li>
              {:else}
                <li class="card-empty">이번 시즌 기록 없음</li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="panel info-panel" aria-label="pitcher info panel">
          <div class="card-head">
            <h2>{pitcherState.name}</h2>
            <!--
              🔴 **경기 중에 탈삼진이 안 보였다.** 종료 화면에만 있어서, 삼진이
              한 번도 안 잡히던 결함(2026-09-01)이 **한 시즌 내내 0 인 채로**
              아무 눈에도 안 띄었다.

              ⚠ **능력치 목록에 넣으면 소용이 없다.** 실측 —

                  해상도        카드 패널  머리글  목록에 남는 높이
                  1280×720        44px     21px      0px
                  1366×768        92px     21px     39px   (내용 104px)
                  1536×864       190px     21px    137px

                실사용 두 해상도에서 목록은 **한 줄도 안 보인다.** 머리글은
                어디서나 남으므로 여기 세운다.
            -->
            <span class="k-tag" title="이 경기 탈삼진">K {totalStrikeouts}</span>
            <button
              type="button"
              class="flip-btn"
              aria-pressed={pitcherFlipped}
              on:click={() => (pitcherFlipped = !pitcherFlipped)}
            >{pitcherFlipped ? "컨디션" : "성적"}</button>
          </div>

          {#if !pitcherFlipped}
            <ul class="bar-list">
              <li>
                <span class="bl">체력</span>
                <span class="bt"><i style="width:{pitcherState.stamina}%;background:{staminaColor};"></i></span>
                <strong class="bv">{pitcherState.stamina.toFixed(0)}</strong>
              </li>
              <li>
                <span class="bl">멘탈</span>
                <span class="bt"><i style="width:{pitcherState.mental}%;background:{mentalColor};"></i></span>
                <strong class="bv">{pitcherState.mental.toFixed(0)}</strong>
              </li>
              <li class="plain"><span class="bl">구속</span><strong class="bv">{pitcherState.speed}</strong></li>
              <li class="plain"><span class="bl">투구수</span><strong class="bv">{engineAvailable ? snapshotPitchCountSinceEntry : localEngineState.pitchCount}</strong></li>
            </ul>
          {:else}
            <ul class="line-list">
              {#each pitcherSeason as l (l.label)}
                <li><span>{l.label}</span><strong>{l.value}</strong></li>
              {:else}
                <li class="card-empty">이번 시즌 기록 없음</li>
              {/each}
            </ul>
          {/if}
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
            <li><span>자책</span><strong>{gameResult.runsAllowed} ER</strong></li>
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
    background: var(--panel);
    /*
      S2에서 밝은 지면으로 옮겼다 (2026-08-06). 예전엔 이 화면 전체가
      어두운 섬이었고, 뿌리에서 글자색을 안 정하면 색 규칙 없는 자식이
      전역 `--ink`를 물려받아 사라졌다 — 그 안전망이 여기 있었다.

      ⚠ **지금 어두운 건 구장 뷰 하나뿐이다.** `BaseballField.svelte`가
      자기 배경과 글자색을 들고 있고, 그 위에 뜨는 결과 오버레이도
      흰 글자를 명시한다. 토큰을 물려받으면 어두운 구장 위에서 사라진다.
    */
    color: var(--ink);
    padding: 12px;
    box-sizing: border-box;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
  }

  .scoreboard-wrap {
    width: 100%;
    overflow-x: auto;
    margin-bottom: 0;
  }

  /* ── 상단 줄 (U7-a) ── */
  .match-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 2px;
  }
  .mode-chip {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 3px 10px;
    border-radius: 20px;
    background: var(--panel-sunk);
    color: var(--ink);
    border: 1px solid var(--line);
  }
  /* 등판 중일 때만 눈에 띈다 — 관전은 가만히 있는 상태다 */
  .mode-chip.on-mound {
    background: var(--t-accent);
    color: var(--ink-on-dark);
    border-color: transparent;
  }
  .bar-inning { font-size: 13px; font-weight: 700; color: var(--ink); }
  .bar-park { display: flex; gap: 6px; margin-left: auto; }
  .chip-mini {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--panel-sunk);
    color: var(--ink-mid);
    border: 1px solid var(--panel-sunk);
  }
  .exit-btn {
    background: none;
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 12px;
    cursor: pointer;
  }
  .exit-btn:hover { background: var(--panel-sunk); color: var(--ink); }

  /* 관전 패널 — 조작이 없을 때 이 자리를 뭘로 채우나 */
  .watch-panel { display: grid; gap: 6px; align-content: start; }
  .watch-note { margin: 0; font-size: 13px; color: var(--ink); }
  .watch-sub {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  /* ── 투구 선택의 대가 (U7-b) ── */
  .ps-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .ps-head h2 { margin: 0; }
  .cost-chip {
    font-size: 11px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* 남은 구수가 얼마 안 되면 눈에 띈다. **선택을 막지는 않는다** */
  .cost-chip.thin { color: var(--warn); font-weight: 700; }

  /* ── 라인업 (U7-b) ── */
  .lineup-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  .lineup-list li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 11px;
    color: var(--ink);
    padding: 2px 4px;
    border-radius: 3px;
  }
  .lu-no { color: var(--ink-mute); min-width: 11px; font-variant-numeric: tabular-nums; }
  .lu-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lu-empty { color: var(--ink-mute); }
  /* 지금 타석 — 공격 중인 쪽에만 붙는다 */
  /* 지금 타석 — 옅은 노랑 배경은 흰 지면에서 사라진다. 면을 팀 색으로 채운다 */
  .lineup-list li.at-bat {
    background: var(--t-dark);
    color: var(--ink-on-dark);
    font-weight: 700;
  }
  .lineup-list li.at-bat .lu-no { color: var(--ink-on-dark); opacity: 0.75; }
  /* 다음 타자 — 지금 타석보다 한 단계 약하게 */
  .lineup-list li.on-deck { color: var(--ink); font-weight: 600; }

  /* 주자와 카운트는 한 상황의 두 축이다 — 상자 하나에 나란히 */
  .situation-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
  }
  .situation-panel .diamond { margin: 0 auto; }

  /* 화면에는 안 보이고 스크린리더에만 남긴다 */
  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .settings-btn {
    margin-left: auto;
    background: none;
    border: 1px solid var(--line);
    border-radius: 5px;
    color: var(--ink-mid);
    font-size: 15px;
    padding: 1px 7px;
    cursor: pointer;
    line-height: 1.5;
  }
  .settings-btn:hover { color: var(--ink); border-color: var(--ink-mute); }

  .scoreboard {
    width: 100%;
    border-collapse: collapse;
    background: var(--panel);
    border: 1px solid var(--line);
    color: var(--ink);
    table-layout: fixed;
  }

  .scoreboard th,
  .scoreboard td {
    border: 1px solid var(--line);
    text-align: center;
    padding: 6px 4px;
    font-size: 12px;
  }

  .scoreboard thead th {
    background: var(--panel-sunk);
    color: var(--ink);
    font-weight: 700;
  }

  .scoreboard thead th:nth-last-child(4) {
    color: var(--bad);
  }

  .scoreboard thead th:nth-last-child(-n + 3) {
    color: var(--warn);
  }

  .team-col {
    width: 132px;
    text-align: left;
    padding-left: 8px;
    background: var(--panel-sunk);
    color: var(--ink);
    font-weight: 700;
  }
  /* 🔴 **셀 자체에 flex를 걸던 것을 안쪽 래퍼로 옮겼다** (2026-08-28).
     예전 주석이 "표 셀에 flex를 쓰면 높이가 무너진다"며 `height: 30px`로
     떠받치고 있었다 — 증상만 눌렀지 **그 칸이 열 계산에서 빠지는 건 그대로**였다.
     같은 원인으로 부상 리포트에서 팀 이름이 "탄…", "금…"으로 잘렸다. */
  .scoreboard tbody th.team-col .team-cell {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .team-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  /* R은 결과다. H·E·B보다 굵게 */
  .scoreboard td.rhe { font-variant-numeric: tabular-nums; }
  .scoreboard td.r-col { font-weight: 800; color: var(--ink); }

  .scoreboard tbody tr:nth-child(2n) td {
    background: var(--panel-sunk);
  }

  /* ⚠ 머리글(R·H·E·B)만 색으로 구분한다. 어두운 지면에서는 숫자까지 색칠해도
     읽혔지만, 흰 바탕에서는 **0이 스물여덟 개 색칠돼** 산만해진다 */
  .scoreboard tbody td:nth-last-child(4) {
    color: var(--ink);
    font-weight: 800;
  }

  .scoreboard tbody td:nth-last-child(-n + 3) {
    color: var(--ink-mid);
    font-weight: 600;
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
    background: var(--panel);
    border: 1px solid var(--line);
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
    /* ⚠ `align-content: start`에 행 크기가 없었다. 패널 셋이 자연 높이로 쌓여
       696px 칸에 773px를 넣었고, 부모가 `overflow: hidden`이라 **아래 77px이
       그냥 잘렸다**(투수 컨디션의 멘탈·투구수가 안 보였다).
       마지막 행이 남는 만큼 갖게 해 넘치는 대신 그 안에서 해결하도록 한다. */
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }
  .right-column > .pair-row { min-height: 0; }

  .pair-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .panel {
    /* ⚠ `min-height: 170px`을 뺐다. 여섯 칸이 전부 같은 높이라 카운트(램프 7개)와
       구종 선택(버튼 10개)이 같은 자리를 먹었다 (§3-3) */
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
    min-height: 0;
  }

  /* 존은 남는 높이에 맞춰 줄어야 한다 — 캔버스가 `flex: 1`을 쓰려면 부모가 flex여야 한다 */
  .zone-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel h2 {
    margin: 0 0 10px;
    font-size: 16px;
    color: var(--ink);
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
    color: var(--ink);
    border: 1px solid var(--ink-mute);
    border-radius: 999px;
    padding: 4px 9px;
    background: var(--panel-sunk);
  }

  .pos-badge {
    font-size: 12px;
    color: var(--ink);
    border: 1px solid var(--ink-mute);
    border-radius: 999px;
    padding: 4px 9px;
    background: var(--panel-sunk);
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
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    padding: 8px;
    overflow: hidden;
  }

  .lineup-panel h3 {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--ink);
  }

  .lineup-panel ol {
    margin: 0;
    padding: 0 0 0 16px;
    display: grid;
    gap: 4px;
    color: var(--ink);
    font-size: 11px;
  }

  .field-stage-wrap {
    /* 구장이 칸 높이를 다 쓴다 — `start` 면 높이가 내용 기준이라
       `.viewport` 의 `100%` 가 풀린다(2026-08-30 계측) */
    align-items: stretch;
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
  /* ── 결과 오버레이 — 트래킹 인 ─────────────────────────────
     자간이 넓게 벌어진 채로 나타나 제자리로 모인다. 상자가 없다. */
  .track-grp { text-align: center; }

  .track-text {
    display: block;
    font-size: 40px;
    font-weight: 900;
    /* ⚠ **토큰을 쓰지 않는다.** 이 글자는 어두운 구장 그림 위에 뜬다 —
       `--ink`(거의 검정)를 물려받으면 배경에 묻힌다 */
    color: #ffffff;
    /* 딱 떨어지는 오프셋 — 번짐은 도트를 뭉갠다 */
    text-shadow: 3px 3px 0 rgba(4, 8, 16, 0.9);
    letter-spacing: 0.6em;
    text-indent: 0.6em;
    white-space: nowrap;
    animation: trackIn 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  /* 색은 글자가 아니라 막대가 말한다 — 어느 바탕에서도 글자가 읽힌다 */
  .track-rule {
    height: 6px;
    margin-top: 6px;
    background: var(--rc, #ffffff);
    transform: scaleX(0);
    animation: trackRule 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes trackIn {
    0%   { letter-spacing: 0.6em;  text-indent: 0.6em;  opacity: 0; }
    26%  { letter-spacing: -0.02em; text-indent: 0;     opacity: 1; }
    82%  { letter-spacing: -0.02em; text-indent: 0;     opacity: 1; }
    100% { letter-spacing: 0.14em;  text-indent: 0.14em; opacity: 0; }
  }
  @keyframes trackRule {
    0%   { transform: scaleX(0); opacity: 0; }
    30%  { transform: scaleX(1); opacity: 1; }
    82%  { transform: scaleX(1); opacity: 1; }
    100% { transform: scaleX(1); opacity: 0; }
  }

  /* 움직임이 불편한 사람에겐 그냥 떴다 사라지게 */
  @media (prefers-reduced-motion: reduce) {
    .track-text, .track-rule { animation: none; }
    .track-text { letter-spacing: -0.02em; text-indent: 0; }
    .track-rule { transform: scaleX(1); }
  }

  .base-panel {
    display: grid;
    place-items: center;
  }

  .diamond {
    position: relative;
    width: 104px;
    height: 104px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
  }

  .base {
    position: absolute;
    width: 16px;
    height: 16px;
    transform: rotate(45deg);
    border: 1px solid var(--ink);
    background: var(--panel-sunk);
  }

  /* 주자가 있는 베이스. 팀과 무관한 상태라 의미색을 쓴다 */
  .base.on {
    background: var(--attn);
    border-color: var(--ink);
  }

  /* 🔴 **네 베이스가 8px씩 어긋나 있었다** (2026-08-26).
     `.base`는 16px인데 `left: 52px`가 **절반을 안 뺐다** — 상자의 왼쪽 모서리가
     52에 놓여 중심이 60이 됐다(다이아몬드 중앙은 52다).
     그래서 홈과 1루만 붙어 보였다:
         홈 중심(60,80) · 1루 중심(80,60)  → 거리 28.3
         2루 중심(60,24) · 3루 중심(24,60) → 거리 50.9
     ⚠ `rotate(45deg)`는 중심 기준이라 위치를 안 옮긴다 — 범인이 아니다.
     중앙 52에서 절반 8을 빼 **44**로 맞춘다. 네 거리가 39.6으로 같아진다.

     ⚠ 720p 대응으로 다이아몬드가 **줄어들 수 있게** 되면서 px 을 뗐다.
     위 계산을 그대로 옮긴 것이라 104px 에서는 **값이 한 픽셀도 안 바뀐다** —
     `15.38% × 104 = 16` · `calc(50% - 8px) = 44`. 88px 로 줄어도 네 거리가
     서로 같다(중심에서 22.5). */
  .b2 { top: 15.38%; left: calc(50% - 8px); }
  .b3 { top: calc(50% - 8px); left: 15.38%; }
  .b1 { top: calc(50% - 8px); right: 15.38%; }
  .home { bottom: 15.38%; left: calc(50% - 8px); }

  .count-panel {
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .sbo-board {
    background: var(--panel);
    border: 1px solid var(--line);
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
    color: var(--ink);
  }

  .sbo-lamps {
    display: flex;
    gap: 10px;
  }

  /* ⚠ **꺼진 램프가 켜진 것처럼 보였다.** 어두운 지면에서는 회색이 "꺼짐"
     이었는데 밝은 지면으로 옮기면서 그대로 뒀더니 흰 바탕 위의 진한 원이
     되어 뜻이 뒤집혔다. 꺼짐은 지면보다 살짝 가라앉은 자리여야 한다. */
  .sbo-lamp {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--panel-sunk);
  }

  .sbo-lamp.strike.on {
    background: var(--ok);
    border-color: var(--ok);
    animation: sboPulseStrike 1.8s ease-in-out infinite;
  }

  .sbo-lamp.count-ball.on {
    background: var(--warn);
    border-color: var(--warn);
    animation: sboPulseBall 1.8s ease-in-out infinite;
  }

  .sbo-lamp.out.on {
    background: var(--bad);
    border-color: var(--bad);
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
    color: var(--ok);
  }

  .sbo-label.count-ball {
    color: var(--warn);
  }

  .sbo-label.out {
    color: var(--bad);
  }

  /*
    🔴 **720p 에서 선수 카드가 이름만 남았다.** (2026-09-01 · 실측)

    오른쪽 열은 `auto auto minmax(0, 1fr)` 이라 앞 두 행이 먹고 남는 것을
    카드가 갖는다. 1280×720 에서 남는 것이 **46px** 이고 머리글이 21px 이라
    목록에 0px 이 남았다 — 투구를 고르라고 띄운 상대 타자 능력치다.

        열 558 = 상황 203 + 가운데 285 + 간격 24 + 카드 46

    ## ⚠ 존 캔버스를 줄이는 길은 **한 픽셀도 안 내준다**

    주입해서 쟀다 — `max-width` 를 176→110 으로 줄여도 가운데 행은 285 그대로다.
    존은 `flex: 1 1 auto` 라 행 높이를 안 정한다. **옆 칸(구종 선택)이 정한다**
    (머리 31 + 목록 166 + 던지기 44). 존을 줄이면 조준 정밀도만 잃고 얻는 게
    없다. 그래서 **안 건드린다.**

    ## 내주는 쪽은 상황 패널, 아끼는 쪽은 카드

    | | 1280×720 | 1366×768 |
    |---|---|---|
    | 상황 패널 | 203 → 145 | 203 → 145 |
    | 카드 행 | 46 → 104 | 94 → 152 |
    | 보이는 줄 (타자/투수) | 0·0 → **5/5 · 4/4** | 2·2 → **5/5 · 4/4** |

    ⚠ SBO 만 조여서는 **161 에서 안 내려간다** — 거기서부터는 다이아몬드
      104px 이 바닥이다. 그래서 다이아몬드도 88px 로 줄인다(베이스 좌표를
      비율로 바꿔 둔 이유다).

    ⚠ 1536×864 이상은 이 블록이 안 걸린다. 지금과 똑같다 — 실측으로 확인했다.
  */
  @media (max-height: 800px) {
    .diamond { width: 88px; height: 88px; }

    .sbo-board { gap: 4px; padding: 6px; }
    .sbo-label { font-size: 20px; width: 22px; }
    .sbo-lamp { width: 15px; height: 15px; }
    .sbo-lamps { gap: 6px; }

    /* 세로로 쌓으면 안 들어간다. **두 열로 눕힌다** */
    .bar-list, .line-list { grid-template-columns: 1fr 1fr; column-gap: 12px; row-gap: 4px; }
    .info-panel { padding: 7px; }
    .info-panel .card-head { margin-bottom: 4px; }
  }

  .zone-canvas {
    /* ⚠ `min-height: 260px`이 투구 행 높이를 혼자 정했다 — 옆 칸(투구 선택)이
       241px인데도 행이 317px이 됐다. 남는 높이에 맞춰 줄되 **실제 스트라이크
       존 비율**(17in x 22in)은 지킨다. */
    flex: 1 1 auto;
    min-height: 120px;
    aspect-ratio: 17 / 22;
    width: auto;
    max-width: 180px;
    margin: 0 auto;
    background: var(--panel-sunk);
    border: 5px solid var(--line);
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--ink-mute);
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
    border: 2px solid var(--ink);
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
    border-color: var(--bad);
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
    border: 2px solid var(--warn);
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

  /* ── 투구 선택 배치 (M3) ─────────────────────────────────────
     왼쪽 구종 슬롯 · 오른쪽 전략/세기. 전략·세기를 세로 버튼 6개로 쌓았더니
     패널이 393px이 돼 오른쪽 열이 153px 넘쳤다(실측) — 세그먼트로 묶었다. */
  .ps-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 118px;
    gap: 8px;
    margin-bottom: 8px;
  }

  .slot-col { display: grid; gap: 5px; align-content: start; }

  .slot {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--panel-sunk);
    color: var(--ink);
    padding: 6px 8px;
    text-align: left;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  .slot.active { background: var(--t-dark); border-color: var(--t-dark); color: var(--ink-on-dark); }
  /* 빈칸은 누를 게 없다 — 테두리를 점선으로 두어 "아직 안 찬 자리"로 읽힌다 */
  .slot.empty {
    border-style: dashed;
    border-color: var(--panel-sunk);
    background: var(--panel);
    cursor: default;
    justify-items: center;
    grid-template-columns: 12px minmax(0, 1fr);
  }
  .slot-no { font-size: 9.5px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
  .slot.active .slot-no { color: var(--ink-on-dark); opacity: 0.72; }
  .slot-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* 글자 막대(▮▮▮▯▯)는 이름을 밀어내 "패스..."로 잘렸다 — CSS 막대가 훨씬 좁다 */
  .slot-grade {
    display: block;
    width: 22px;
    height: 3px;
    border-radius: 2px;
    background: var(--panel-sunk);
    overflow: hidden;
  }
  .slot-grade i { display: block; height: 100%; background: var(--ink); }
  .slot.active .slot-grade { background: rgba(255, 255, 255, 0.28); }
  .slot.active .slot-grade i { background: var(--ink-on-dark); }
  .slot-lock { font-size: 11px; opacity: 0.5; }

  .opt-col { display: grid; align-content: start; gap: 3px; }
  .opt-label {
    font-size: 9.5px;
    letter-spacing: 0.08em;
    color: var(--ink-mid);
    margin: 0;
  }
  .opt-label + .seg { margin-bottom: 6px; }

  /* 셋 중 하나임을 모양으로 말한다 — 테두리를 나눠 쓴다 */
  .seg {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .seg button {
    flex: 1;
    border: none;
    background: var(--panel-sunk);
    color: var(--ink);
    font: inherit;
    font-size: 11.5px;
    padding: 8px 2px;
    cursor: pointer;
    min-width: 0;
  }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.active { background: var(--t-dark); color: var(--ink-on-dark); font-weight: 700; }

  /* 상한을 글로 남긴다 — 자물쇠만으로는 "몇 개까지"가 안 전달된다 */
  .slot-count {
    font-size: 10px;
    color: var(--ink-mid);
    margin: 4px 0 0;
    font-variant-numeric: tabular-nums;
  }

  .execute-btn {
    width: 100%;
    border: none;
    border-radius: 10px;
    /* ⚠ 자동 변환이 잉크 계열로 바꿔 **눌리지 않는 버튼처럼 보였다.**
       화면에서 가장 중요한 액션이라 팀 색으로 채운다 */
    background: var(--t-dark);
    color: var(--ink-on-dark);
    padding: 13px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.04em;
    cursor: pointer;
    box-shadow: 0 4px 14px -6px rgba(8, 16, 36, 0.45);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .execute-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 7px 18px -6px rgba(8, 16, 36, 0.5);
  }

  .execute-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 6px -3px rgba(8, 16, 36, 0.4);
  }

  .execute-btn:disabled {
    cursor: not-allowed;
    background: var(--line-strong);
    color: var(--ink-mute);
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
    border: 1px solid var(--ok);
    border-radius: 8px;
    background: linear-gradient(180deg, var(--ok) 0%, rgba(31, 122, 71, 0.28) 100%);
    color: var(--ok);
    padding: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
  }
  .mound-visit-btn:hover { background: linear-gradient(180deg, var(--ok) 0%, var(--ok) 100%); }

  .engine-state {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--warn);
    text-align: center;
  }

  .engine-state.on {
    color: var(--ok);
  }

  /* ── 타자·투수 카드 (M4) ─────────────────────────────────────
     앞뒤 두 면. 뒷면은 실제 기록이 있을 때만 그린다 — 없으면 "기록 없음"이다. */
  .info-panel { display: flex; flex-direction: column; overflow: hidden; }

  /* 이름과 뒤집기 버튼 사이. **줄바꿈 없이** 붙어 있어야 머리글이 안 늘어난다 */
  .k-tag {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--panel-sunk);
    color: var(--ink-mid);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.5;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .card-head h2 {
    margin: 0;
    /* ⚠ K 표식이 붙어 셋이 됐다. 이름이 길면 이 줄이 안 줄어 버튼을 민다 */
    flex: 0 1 auto;
    min-width: 0;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .flip-btn {
    flex: 0 0 auto;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--panel-sunk);
    color: var(--ink);
    font: inherit;
    font-size: 10.5px;
    padding: 2px 9px;
    cursor: pointer;
  }
  .flip-btn:hover { border-color: var(--ink); color: var(--ink); }
  .flip-btn[aria-pressed="true"] { background: var(--line); border-color: var(--ink); color: #fff; }

  /*
    🔴 **`overflow: hidden` 이 능력치를 소리 없이 잘랐다** (2026-09-01 눈확인).

    카드가 짧아지면 막대가 그냥 사라진다 — 스크롤바도 없어서 **잘린 줄도
    모른다.** 투구를 고를 때 보라고 띄운 상대 타자 능력치가 그 자리다.

    해상도별로 잰 잘린 높이(px · [타자, 투수]):

        1280×720   [104, 82]   ← FHD @150%
        1366×768   [ 65, 43]   ← 노트북 표준
        1536×864 이상          [0, 0]

    ⚠ **`hidden` 을 지우면 안 된다.** 그러면 카드가 늘어나 옆 열의 높이를
      밀어 구장까지 흔든다. `auto` 로 바꾼다 — 넘칠 때만 스크롤바가 생기고
      1536 이상에서는 지금과 똑같다.
  */
  .bar-list, .line-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    align-content: start;
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
  }

  /* 라벨 · 막대 · 숫자 — 세 열을 고정해 두 카드의 눈금이 서로 맞는다 */
  .bar-list li {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) 30px;
    align-items: center;
    gap: 8px;
    color: var(--ink);
    font-size: 12px;
  }
  .bar-list li.plain { grid-template-columns: 42px minmax(0, 1fr); }
  .bar-list li.plain .bv { text-align: left; }
  .bl { color: var(--ink); }
  .bt {
    display: block;
    height: 7px;
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }
  .bt i {
    display: block;
    height: 100%;
    background: var(--ink-mid);
    transition: width 0.35s ease, background 0.35s ease;
  }
  .bv { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }

  .line-list li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1px solid var(--panel-sunk);
    padding-bottom: 5px;
    color: var(--ink);
    font-size: 12px;
  }
  .line-list li span { color: var(--ink); }
  .line-list li strong { font-variant-numeric: tabular-nums; }

  /* 값이 없을 때 0을 그리지 않는다 — 왜 비었는지를 쓴다 */
  .card-empty {
    color: var(--ink-mid);
    font-size: 11.5px;
    border: none;
    padding: 10px 0;
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
    color: var(--ink);
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
    color: var(--ink);
  }

  .play-text-panel ul {
    margin: 0;
    padding-left: 18px;
    color: var(--ink);
    max-height: calc(100% - 28px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(196, 218, 255, 0.22) transparent;
  }





  .play-text-panel li {
    margin-bottom: 8px;
  }

  /* ── 로그 색 — **투수 시점의 좋고 나쁨** 한 축이다 ────────────
     ⚠ 자동 변환이 안타와 아웃을 둘 다 `--warn`으로 뭉갰고 파울을 볼보다
     진하게 만들었다(원본은 반대였다). 어두운 지면에서 쓰던 여덟 색을
     밝은 지면의 의미색 셋 + 잉크 세 단계로 다시 배분한다. */
  .play-text-panel li.log-homerun { color: var(--bad);  font-weight: 700; }
  .play-text-panel li.log-hit     { color: var(--bad); }
  .play-text-panel li.log-walk    { color: var(--warn); }
  .play-text-panel li.log-out     { color: var(--ink-mid); }
  .play-text-panel li.log-strike  { color: var(--ok); }
  /* 병살은 삼진보다 좋은 일이다 — 같은 초록에 굵기로 한 단계 올린다 */
  .play-text-panel li.log-dp      { color: var(--ok);   font-weight: 700; }
  .play-text-panel li.log-foul    { color: var(--ink-mute); }
  .play-text-panel li.log-ball    { color: var(--ink-mute); }
  .play-text-panel li.log-auto    { color: var(--ink-mute); font-style: italic; }

  .play-text-panel li.log-separator {
    list-style: none;
    margin-left: -18px;
    text-align: center;
    color: var(--ink-mute);
    font-size: 11px;
    letter-spacing: 0.08em;
    border-top: 1px solid var(--panel-sunk);
    border-bottom: 1px solid var(--panel-sunk);
    padding: 3px 0;
    margin-bottom: 6px;
  }

  .scoreboard th.current-inning,
  .scoreboard td.current-inning {
    background: rgba(70, 120, 200, 0.18);
    color: var(--ink);
  }

  /* 내 팀 행. **상대는 표시하지 않는다** — "내 팀 하나만 구분"은 언제나
     성립하지만 "두 팀을 서로 구분"은 238팀에서 성립하지 않는다 (§3-6) */
  /* ⚠ **행 전체에 색을 주지 않는다.** 어두운 지면에서는 호박색 글자가
     강조였는데 흰 바탕에서는 숫자 열여섯 개가 전부 물들어 어느 게 점수인지
     흐려졌다. 밝은 지면에서는 **면과 왼쪽 띠**만으로 충분하다 */
  .scoreboard tr.my-team-row th,
  .scoreboard tr.my-team-row td {
    background: var(--t-wash);
  }
  .scoreboard tr.my-team-row th.team-col {
    box-shadow: inset 3px 0 0 var(--t-accent);
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
    background: rgba(10, 18, 38, 0.52);
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
    background: var(--panel-sunk);
    border: 2px solid var(--line);
    border-radius: 16px;
    padding: 36px 44px;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    box-shadow: 0 24px 60px -28px rgba(8, 16, 36, 0.55);
    animation: popIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
  }

  @keyframes popIn {
    from { transform: scale(0.7); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .gameover-title {
    margin: 0;
    font-size: 22px;
    color: var(--ink);
    letter-spacing: 0.06em;
  }

  .gameover-score {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .score-label {
    font-size: 13px;
    color: var(--ink-mid);
  }

  .score-num {
    font-size: 52px;
    font-weight: 900;
    color: var(--ink);
    line-height: 1;
    min-width: 48px;
    text-align: center;
  }

  .home-score { color: var(--ink); }

  .score-sep {
    font-size: 36px;
    color: var(--ink-mute);
    font-weight: 300;
  }

  .gameover-result {
    font-size: 28px;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: var(--ink-mid);
    padding: 6px 24px;
    border-radius: 999px;
    border: 2px solid var(--line);
  }

  .gameover-result.won {
    color: var(--ok);
    border-color: var(--ok);
    background: rgba(55, 214, 122, 0.08);
  }

  .gameover-result.lost {
    color: var(--bad);
    border-color: rgba(179, 49, 31, 0.26);
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
    color: var(--ink-mid);
  }

  .gameover-stats li strong {
    font-size: 20px;
    font-weight: 700;
    color: var(--ink);
  }

  .gameover-summary {
    margin: 0;
    font-size: 13px;
    color: var(--ink-mid);
    text-align: center;
    max-width: 280px;
    line-height: 1.5;
  }

  .gameover-no-entry {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-mid);
    text-align: center;
    padding: 4px 0;
  }

  .gameover-exit-btn {
    margin-top: 8px;
    padding: 12px 36px;
    background: linear-gradient(180deg, var(--ink-mute) 0%, var(--ink-mute) 100%);
    border: none;
    border-radius: 10px;
    color: var(--ink);
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
    color: var(--ink);
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
    background: linear-gradient(180deg, var(--ink-mute) 0%, var(--ink-mute) 100%);
    color: var(--ink);
    box-shadow: 0 4px 16px rgba(50, 100, 200, 0.4);
  }

  .watch-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 22px rgba(50, 100, 200, 0.55);
  }

  .result-btn {
    background: linear-gradient(180deg, var(--line) 0%, var(--panel-sunk) 100%);
    color: var(--ink);
    box-shadow: 0 4px 16px rgba(20, 40, 70, 0.4);
  }

  .result-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 22px rgba(20, 40, 70, 0.55);
  }
</style>



