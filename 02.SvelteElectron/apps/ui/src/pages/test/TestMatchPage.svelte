<script lang="ts">
  import { onMount } from "svelte";
  import BaseballField from "../../features/match-view/ui/BaseballField.svelte";
  import SettingsPanel from "../../features/settings/ui/SettingsPanel.svelte";
  import { fieldStyleStore, type FieldStyle } from "../../shared/stores/settings";

  let fieldStyle: FieldStyle = 'digital';
  fieldStyleStore.subscribe(v => { fieldStyle = v; });
  let settingsOpen = false;

  export let onExit: () => void = () => {};

  type PitchType = "fastball" | "slider" | "curve" | "changeup";
  type PitchStrategy = "aggressive" | "balanced" | "safe";
  type PitchPower = "low" | "normal" | "high";
  type PitchResultCode =
    | "STRIKE_SWING"
    | "STRIKE_LOOK"
    | "BALL"
    | "FOUL"
    | "INPLAY_OUT"
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

  interface SnapshotLike {
    inning: number;
    half: "top" | "bottom";
    outs: number;
    count: { balls: number; strikes: number };
    runners: { first: boolean; second: boolean; third: boolean };
    score: { home: number; away: number };
    pitchCount: number;
    stamina: number;
    mental: number;
    recentLogs: string[];
  }

  const teamHeader = "팀";
  const innings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const sectionTitle = "경기 내용";
  const sceneTitle = "경기화면";
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
    mound:  { x: 500, y: 645 }
  };

  // 레트로 이미지 좌표 (probaseball.gif 기준)
  const retroField = {
    home:   { x: 497, y: 790 },
    first:  { x: 715, y: 580 },
    second: { x: 497, y: 454 },
    third:  { x: 280, y: 580 },
    mound:  { x: 497, y: 530 }
  };

  $: activeMound = fieldStyle === 'retro' ? retroField.mound : baseField.mound;

  // ── 타자 / 주자 애니메이션 (레트로 전용) ─────────────────────────────
  let batter: { handedness: 'L' | 'R' } = { handedness: 'R' };

  function getBatterPlatePos(handedness: 'L' | 'R'): FieldPoint {
    // 우타: 좌타석(플레이트 왼쪽 오프셋), 좌타: 우타석(플레이트 오른쪽)
    const offset = handedness === 'R' ? -34 : 34;
    return { x: retroField.home.x + offset, y: retroField.home.y - 22 };
  }

  let retroBatterPos: FieldPoint | null = getBatterPlatePos('R');
  // [first, second, third] 슬롯; 초기 runners 상태({ first:true })에 맞춰 설정
  let retroRunnerPositions: (FieldPoint | null)[] = [{ ...retroField.first }, null, null];

  function syncRetroPositions() {
    retroBatterPos = getBatterPlatePos(batter.handedness);
    retroRunnerPositions = [
      runners.first  ? { ...retroField.first }  : null,
      runners.second ? { ...retroField.second } : null,
      runners.third  ? { ...retroField.third }  : null,
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
      movements.push({ from: { ...bFrom }, to: { ...f.first } });
      if (prevRunners.first)  movements.push({ from: { ...f.first },  to: { ...f.second } });
      if (prevRunners.second) movements.push({ from: { ...f.second }, to: { ...f.third } });
      if (prevRunners.third)  movements.push({ from: { ...f.third },  to: { ...f.home } });
    } else if (resultCode === 'HIT_DOUBLE') {
      movements.push({ from: { ...bFrom }, to: { ...f.second } });
      if (prevRunners.first)  movements.push({ from: { ...f.first },  to: { ...f.third } });
      if (prevRunners.second) movements.push({ from: { ...f.second }, to: { ...f.home } });
      if (prevRunners.third)  movements.push({ from: { ...f.third },  to: { ...f.home } });
    } else if (resultCode === 'HIT_TRIPLE') {
      movements.push({ from: { ...bFrom }, to: { ...f.third } });
      if (prevRunners.first)  movements.push({ from: { ...f.first },  to: { ...f.home } });
      if (prevRunners.second) movements.push({ from: { ...f.second }, to: { ...f.home } });
      if (prevRunners.third)  movements.push({ from: { ...f.third },  to: { ...f.home } });
    } else if (resultCode === 'HOME_RUN') {
      movements.push({ from: { ...bFrom }, to: { ...f.home } });
      if (prevRunners.first)  movements.push({ from: { ...f.first },  to: { ...f.home } });
      if (prevRunners.second) movements.push({ from: { ...f.second }, to: { ...f.home } });
      if (prevRunners.third)  movements.push({ from: { ...f.third },  to: { ...f.home } });
    } else if (resultCode === 'WALK') {
      movements.push({ from: { ...bFrom }, to: { ...f.first } });
      if (prevRunners.first) movements.push({ from: { ...f.first }, to: { ...f.second } });
      if (prevRunners.first && prevRunners.second)
        movements.push({ from: { ...f.second }, to: { ...f.third } });
      if (prevRunners.first && prevRunners.second && prevRunners.third)
        movements.push({ from: { ...f.third }, to: { ...f.home } });
    } else if (resultCode === 'INPLAY_OUT') {
      retroBatterPos = null;
      return;
    } else {
      return;
    }

    if (movements.length === 0) return;
    retroBatterPos = null; // 타자 이동 시작 → 타석 스프라이트 숨김

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

  // 클릭 위치 기반 존 선택 (0~1 비율)
  let zoneClickPct = { px: 0.5, py: 0.5 };
  let zoneHoverPct: { px: number; py: number } | null = null;
  let lastPitchPct: { px: number; py: number } | null = null;
  let zoneCanvasEl: HTMLDivElement | null = null;

  // 캔버스 전체 → 필드 SVG 좌표 변환
  // 스트라이크존 박스: 캔버스 x 10-90%, y 8-92% → 필드 x:470-530, y:730-790
  // Ball 여백: 캔버스 각 방향 10%/8% → 필드 ±7.5/±5.7 유닛
  $: clickedFieldPos = {
    x: Number((462.5 + zoneClickPct.px * 75).toFixed(1)),
    y: Number((724.3 + zoneClickPct.py * 71.4).toFixed(1))
  } as FieldPoint;

  // 스트라이크존 내 정규화 비율로 zone 1-9 파생 (존 외곽 = 가장 가까운 변 존)
  function getZoneFromClick(px: number, py: number): (typeof zones)[number] {
    const normX = Math.max(0, Math.min(1, (px - 0.10) / 0.80));
    const normY = Math.max(0, Math.min(1, (py - 0.08) / 0.84));
    const zoneMap: (typeof zones)[number][][] = [[7,8,9],[4,5,6],[1,2,3]];
    return zoneMap[Math.min(2, Math.floor(normY * 3))][Math.min(2, Math.floor(normX * 3))];
  }
  $: selectedZone = getZoneFromClick(zoneClickPct.px, zoneClickPct.py);

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

  const defenseNormal = [
    { pos: "P",  x: 500, y: 645 },
    { pos: "C",  x: 500, y: 800 },
    { pos: "1B", x: 650, y: 675 },
    { pos: "2B", x: 590, y: 575 },
    { pos: "SS", x: 410, y: 575 },
    { pos: "3B", x: 350, y: 675 },
    { pos: "LF", x: 330, y: 600 },
    { pos: "CF", x: 500, y: 510 },
    { pos: "RF", x: 670, y: 600 }
  ];

  // 레트로 이미지 기준 수비 위치 (probaseball.gif 좌표계)
  const defenseRetro = [
    { pos: "P",  x: 497, y: 530 },
    { pos: "C",  x: 497, y: 800 },
    { pos: "1B", x: 710, y: 588 },
    { pos: "2B", x: 600, y: 508 },
    { pos: "SS", x: 387, y: 508 },
    { pos: "3B", x: 272, y: 588 },
    { pos: "LF", x: 242, y: 518 },
    { pos: "CF", x: 497, y: 434 },
    { pos: "RF", x: 752, y: 518 }
  ];

  const pitchTypes: { id: PitchType; label: string }[] = [
    { id: "fastball", label: "패스트볼" },
    { id: "slider", label: "슬라이더" },
    { id: "curve", label: "커브" },
    { id: "changeup", label: "체인지업" }
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

  let selectedPitchType: PitchType = pitchTypes[0].id;
  let selectedStrategy: PitchStrategy = "balanced";
  let selectedPower: PitchPower = "normal";

  let engineAvailable = false;
  let engineStarted = false;
  let isPitching = false;

  let inning = 1;
  let half: "top" | "bottom" = "top";

  let count = { strike: 0, ball: 0, out: 0 };
  let runners = { first: true, second: false, third: false };

  let scoreRows = [
    {
      team: "A팀",
      inningScores: [0, 1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0],
      r: 4,
      h: 9,
      e: 1,
      b: 3
    },
    {
      team: "B팀",
      inningScores: [1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0],
      r: 4,
      h: 8,
      e: 0,
      b: 2
    }
  ];

  let playByPlayLines: { text: string; cls: string }[] = [
    { text: "견제로 1루 주자 압박 중.", cls: '' },
    { text: "다음 타자 우전 안타로 출루.", cls: 'log-hit' },
    { text: "3구째 헛스윙 삼진.", cls: 'log-strike' },
    { text: "2구째 파울, 유리한 카운트.", cls: 'log-foul' },
    { text: "1회초 선두타자, 초구 스트라이크.", cls: 'log-strike' }
  ];

  const batterInfo = [
    { label: "이름", value: "홍길동" },
    { label: "타율", value: ".312" },
    { label: "홈런", value: "21" },
    { label: "타점", value: "78" }
  ];

  let pitcherState = {
    name: "김철수",
    speed: "152 km/h",
    stamina: 82,
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
  // 초: 원정 공격 → 홈팀 수비(파랑), 말: 홈 공격 → 원정팀 수비(빨강)
  $: fieldingTeam = (half === 'top' ? 'home' : 'away') as 'home' | 'away';
  $: staminaColor = pitcherState.stamina > 60 ? '#37d67a' : pitcherState.stamina > 30 ? '#ffd54f' : '#ff4a4a';
  $: mentalColor  = pitcherState.mental  > 60 ? '#5b9cf6' : pitcherState.mental  > 30 ? '#c47af5' : '#ff6b9d';

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (settingsOpen) { settingsOpen = false; return; }
      onExit();
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'q' || event.key === 'Q')) {
      event.preventDefault();
      settingsOpen = !settingsOpen;
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
      const response = await window.projectB.matchStart({ initialStamina: 82, initialMental: 74 });
      engineAvailable = true;
      engineStarted = true;
      applySnapshot(response.snapshot, "매치 엔진 연결 완료");
    } catch {
      engineAvailable = false;
      engineStarted = false;
      pushLog("로컬 시뮬레이터 모드로 동작합니다.");
    }
  }

  function resultToCls(code: PitchResultCode): string {
    if (code === 'HOME_RUN') return 'log-homerun';
    if (code === 'HIT_SINGLE' || code === 'HIT_DOUBLE' || code === 'HIT_TRIPLE') return 'log-hit';
    if (code === 'WALK') return 'log-walk';
    if (code === 'STRIKE_SWING' || code === 'STRIKE_LOOK') return 'log-strike';
    if (code === 'FOUL') return 'log-foul';
    if (code === 'BALL') return 'log-ball';
    if (code === 'INPLAY_OUT') return 'log-out';
    return '';
  }

  function pushLog(line: string, cls = '') {
    playByPlayLines = [{ text: line, cls }, ...playByPlayLines].slice(0, 20);
  }

  function updateScoreRows(awayScore: number, homeScore: number, resultCode: PitchResultCode) {
    scoreRows = scoreRows.map((row, idx) => {
      if (idx === 0) {
        return {
          ...row,
          r: awayScore,
          h: row.h + (resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN" ? 1 : 0),
          b: row.b + (resultCode === "WALK" ? 1 : 0)
        };
      }

      return {
        ...row,
        r: homeScore
      };
    });
  }

  function applySnapshot(snapshot: SnapshotLike, line?: string, resultCode: PitchResultCode = "BALL") {
    inning = snapshot.inning;
    half = snapshot.half;
    count = {
      strike: snapshot.count.strikes,
      ball: snapshot.count.balls,
      out: snapshot.outs
    };
    runners = { ...snapshot.runners };
    pitcherState = {
      ...pitcherState,
      stamina: snapshot.stamina,
      mental: snapshot.mental
    };

    updateScoreRows(snapshot.score.away, snapshot.score.home, resultCode);

    if (line) {
      pushLog(line, resultToCls(resultCode));
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
      STRIKE_SWING: { text: '헛스윙!',  color: '#37d67a' },
      STRIKE_LOOK:  { text: '루킹!',    color: '#37d67a' },
      BALL:         { text: '볼',       color: '#7a8fa8' },
      FOUL:         { text: '파울',     color: '#ffd54f' },
      INPLAY_OUT:   { text: '아웃!',    color: '#ff8c42' },
      HIT_SINGLE:   { text: '안타!',    color: '#ffd54f' },
      HIT_DOUBLE:   { text: '2루타!',   color: '#ffd54f' },
      HIT_TRIPLE:   { text: '3루타!',   color: '#ff9800' },
      HOME_RUN:     { text: '홈런!!',   color: '#ff4a4a' },
      WALK:         { text: '볼넷',     color: '#7a8fa8' },
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

    if (resultCode === "BALL") {
      localEngineState.count.balls += 1;
      if (localEngineState.count.balls >= 4) {
        localEngineState.count.balls = 0;
        localEngineState.count.strikes = 0;
        resultCode = "WALK";
        if (localEngineState.runners.first && localEngineState.runners.second && localEngineState.runners.third) {
          localEngineState.score.away += 1;
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
      if (localEngineState.runners.third) localEngineState.score.away += 1;
      localEngineState.runners.third = localEngineState.runners.second;
      localEngineState.runners.second = localEngineState.runners.first;
      localEngineState.runners.first = true;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
    } else if (resultCode === "HIT_DOUBLE") {
      if (localEngineState.runners.third) localEngineState.score.away += 1;
      if (localEngineState.runners.second) localEngineState.score.away += 1;
      localEngineState.runners.third = localEngineState.runners.first;
      localEngineState.runners.second = true;
      localEngineState.runners.first = false;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
    } else if (resultCode === "HIT_TRIPLE") {
      if (localEngineState.runners.third) localEngineState.score.away += 1;
      if (localEngineState.runners.second) localEngineState.score.away += 1;
      if (localEngineState.runners.first) localEngineState.score.away += 1;
      localEngineState.runners.third = true;
      localEngineState.runners.second = false;
      localEngineState.runners.first = false;
      localEngineState.count.balls = 0;
      localEngineState.count.strikes = 0;
    } else if (resultCode === "HOME_RUN") {
      if (localEngineState.runners.third) localEngineState.score.away += 1;
      if (localEngineState.runners.second) localEngineState.score.away += 1;
      if (localEngineState.runners.first) localEngineState.score.away += 1;
      localEngineState.score.away += 1;
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

  function showChangeAlert() {
    if (changeTimer) clearTimeout(changeTimer);
    changeAlert = { visible: true };
    changeTimer = setTimeout(() => {
      changeAlert = { visible: false };
    }, 2200);
  }

  async function runPitch() {
    if (isPitching) return;

    isPitching = true;
    const prevRunners = { first: runners.first, second: runners.second, third: runners.third };
    const pitchedAt = { ...zoneClickPct };
    const zoneTarget = { ...clickedFieldPos };
    ballPos = { ...activeMound };

    await tweenBall(zoneTarget, 220);

    let resultCode: PitchResultCode;
    let line: string;

    if (engineAvailable && window.projectB?.matchStep) {
      if (!engineStarted && window.projectB.matchStart) {
        await window.projectB.matchStart({ initialStamina: 82, initialMental: 74 });
        engineStarted = true;
      }

      const response = await window.projectB.matchStep({
        pitchType: selectedPitchType,
        location: selectedZone,
        strategy: selectedStrategy,
        power: selectedPower
      });

      resultCode = response.outcome.resultCode as PitchResultCode;
      line = `${inningHalfLabel} ${pitchTypes.find((p) => p.id === selectedPitchType)?.label} ${response.outcome.comment}`;
      applySnapshot(response.snapshot, line, resultCode);
    } else {
      resultCode = rollLocalResult();
      const local = applyLocalResult(resultCode);
      resultCode = local.resolvedCode;
      line = `${inningHalfLabel} ${pitchTypes.find((p) => p.id === selectedPitchType)?.label} ${localComment(resultCode)}`;
      applySnapshot(local.snapshot, line, resultCode);
      if (local.inningChange) {
        const newHalf = local.snapshot.half === 'top' ? '초' : '말';
        pushLog(`──── ${local.snapshot.inning}회 ${newHalf} ────`, 'log-separator');
        showChangeAlert();
      }
    }

    showResultOverlay(resultCode);

    if (resultCode === "INPLAY_OUT" || resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN") {
      await tweenBall(getBattedTarget(resultCode), 300);
    }

    // 공 애니메이션 이후 주자/타자 이동 (레트로 전용)
    if (fieldStyle === 'retro') {
      await animateRetroRunners(resultCode, prevRunners);
      // 타석 종료 결과면 다음 타자 핸드니스 랜덤 결정
      const atBatEnded = resultCode !== 'STRIKE_SWING' && resultCode !== 'STRIKE_LOOK'
        && resultCode !== 'FOUL' && resultCode !== 'BALL';
      if (atBatEnded) {
        batter = { handedness: Math.random() < 0.32 ? 'L' : 'R' };
      }
      syncRetroPositions();
    }

    await tweenBall(activeMound, 180);
    lastPitchPct = pitchedAt;
    isPitching = false;
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
        return "땅볼 아웃";
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
        {#each scoreRows as row}
          <tr>
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
          <button class="settings-btn" type="button" on:click={() => (settingsOpen = !settingsOpen)} title="환경설정 (Ctrl+Q)">⚙</button>
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
              {batter}
              batterAnimPos={fieldStyle === 'retro' ? retroBatterPos : null}
              runnerAnimPositions={fieldStyle === 'retro' ? retroRunnerPositions : [null, null, null]}
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
            <div class="zone-target-dot" style="left:{zoneClickPct.px * 100}%;top:{zoneClickPct.py * 100}%;"></div>
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

          <button type="button" class="execute-btn" disabled={isPitching} on:click={runPitch}>
            {isPitching ? "투구 진행 중..." : "투구 실행"}
          </button>

          <p class="engine-state" class:on={engineAvailable}>
            {engineAvailable ? "엔진 연동" : "로컬 시뮬레이터"}
          </p>
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
            <li><span>투구수</span><strong>{localEngineState.pitchCount}</strong></li>
          </ul>
        </section>
      </div>
    </div>
  </div>
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

  /* 스트라이크존 박스: 캔버스 x 10-90%, y 8-92% */
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

  /* 조준 dot (파란색) */
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

  /* 마지막 투구 위치 dot (노란색) */
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
</style>
