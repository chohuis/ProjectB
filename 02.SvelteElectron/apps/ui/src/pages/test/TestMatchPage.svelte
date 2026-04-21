<script lang="ts">
  import { onMount } from "svelte";
  import BaseballField from "../../features/match-view/ui/BaseballField.svelte";

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
  const zoneTitle = "투구 도착 위치";
  const pitchSelectTitle = "투구 선택";
  const batterInfoTitle = "타자 정보";
  const pitcherInfoTitle = "투수 컨디션 정보";

  const awayLineup = ["1 RF", "2 CF", "3 1B", "4 DH", "5 LF", "6 3B", "7 C", "8 2B", "9 SS"];
  const homeLineup = ["1 2B", "2 SS", "3 RF", "4 1B", "5 3B", "6 DH", "7 LF", "8 C", "9 CF"];

  const baseField = {
    home: { x: 500, y: 820 },
    first: { x: 650, y: 670 },
    second: { x: 500, y: 520 },
    third: { x: 350, y: 670 },
    mound: { x: 500, y: 645 }
  };

  const zones = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
  const zoneTargetMap: Record<(typeof zones)[number], FieldPoint> = {
    1: { x: 470, y: 790 },
    2: { x: 500, y: 790 },
    3: { x: 530, y: 790 },
    4: { x: 470, y: 760 },
    5: { x: 500, y: 760 },
    6: { x: 530, y: 760 },
    7: { x: 470, y: 730 },
    8: { x: 500, y: 730 },
    9: { x: 530, y: 730 }
  };

  const defenseNormal = [
    { pos: "P", x: 500, y: 645 },
    { pos: "C", x: 500, y: 800 },
    { pos: "1B", x: 650, y: 675 },
    { pos: "2B", x: 590, y: 575 },
    { pos: "SS", x: 410, y: 575 },
    { pos: "3B", x: 350, y: 675 },
    { pos: "LF", x: 270, y: 360 },
    { pos: "CF", x: 500, y: 250 },
    { pos: "RF", x: 730, y: 360 }
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

  let selectedZone: (typeof zones)[number] = 5;
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

  let playByPlayLines = [
    "견제로 1루 주자 압박 중.",
    "다음 타자 우전 안타로 출루.",
    "3구째 헛스윙 삼진.",
    "2구째 파울, 유리한 카운트.",
    "1회초 선두타자, 초구 스트라이크."
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
  $: pitcherInfo = [
    { label: "이름", value: pitcherState.name },
    { label: "구속", value: pitcherState.speed },
    { label: "체력", value: `${pitcherState.stamina.toFixed(1)}` },
    { label: "멘탈", value: `${pitcherState.mental.toFixed(1)}` }
  ];

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onExit();
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

  function pushLog(line: string) {
    playByPlayLines = [line, ...playByPlayLines].slice(0, 12);
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
      pushLog(line);
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
    const frame = 16;
    const steps = Math.max(1, Math.round(duration / frame));

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const eased = 1 - (1 - t) * (1 - t);
      ballPos = {
        x: Number((from.x + (to.x - from.x) * eased).toFixed(2)),
        y: Number((from.y + (to.y - from.y) * eased).toFixed(2))
      };
      await sleep(frame);
    }
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

  function applyLocalResult(resultCode: PitchResultCode): { snapshot: SnapshotLike; resolvedCode: PitchResultCode } {
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

    if (localEngineState.outs >= 3) {
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
      snapshot: {
        ...localEngineState,
        count: { ...localEngineState.count },
        runners: { ...localEngineState.runners },
        score: { ...localEngineState.score },
        recentLogs: [...localEngineState.recentLogs]
      }
    };
  }

  async function runPitch() {
    if (isPitching) return;

    isPitching = true;
    const zoneTarget = zoneTargetMap[selectedZone];
    ballPos = { ...baseField.mound };

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
    }

    if (resultCode === "INPLAY_OUT" || resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN") {
      await tweenBall(getBattedTarget(resultCode), 300);
    }

    await tweenBall(baseField.mound, 180);
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

<section class="match-engine-empty" aria-label="match engine workspace">
  <div class="scoreboard-wrap">
    <table class="scoreboard" aria-label="baseball scoreboard">
      <thead>
        <tr>
          <th class="team-col">{teamHeader}</th>
          {#each innings as inningNumber}
            <th>{inningNumber}</th>
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
            {#each row.inningScores as inningScore}
              <td>{inningScore}</td>
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
              {baseField}
              defenders={defenseNormal}
              {runners}
              {ballPos}
              strikeZoneTarget={zoneTargetMap[selectedZone]}
              {isPitching}
              on:selectPosition={(event) => (selectedDefPosition = event.detail.pos)}
            />
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
            <li>{line}</li>
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
          <div class="zone-target">
            <div class="zone-grid">
              {#each zones as zone}
                <button
                  type="button"
                  class="zone-btn"
                  class:active={selectedZone === zone}
                  on:click={() => (selectedZone = zone)}
                >
                  {zone}
                </button>
              {/each}
            </div>
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
            {#each pitcherInfo as info}
              <li><span>{info.label}</span><strong>{info.value}</strong></li>
            {/each}
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
    height: calc(100% - 12px);
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
  }

  .sbo-lamp.count-ball.on {
    background: #ffd54f;
    border-color: #ffe58f;
  }

  .sbo-lamp.out.on {
    background: #ff2727;
    border-color: #ff6c6c;
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

  .zone-target {
    width: 80%;
    max-width: 200px;
    margin: 0 auto;
    background: #21314c;
    border: 5px solid #3a4f73;
    border-radius: 8px;
    padding: 10px 8px;
    box-shadow: inset 0 0 0 1px #5f79a8;
  }

  .zone-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .zone-btn {
    border: 1px solid #3a4a66;
    border-radius: 3px;
    background: #121a28;
    color: #9cb3d9;
    min-height: 62px;
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  .zone-btn.active {
    background: #1f2f4d;
    border-color: #88aef1;
    color: #eaf1ff;
    box-shadow: inset 0 0 0 1px #b2ccff;
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
    border: 1px solid #4f7fd6;
    border-radius: 8px;
    background: linear-gradient(180deg, #3d78df, #2e5fb5);
    color: #ffffff;
    padding: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .execute-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
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
    gap: 8px;
    border-bottom: 1px solid #24334d;
    padding-bottom: 6px;
    color: #d7e4fb;
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
    overflow-y: hidden;
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
