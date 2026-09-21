"use strict";
/** 판 하나 — 해마다 한 줄을 모아 `SIMRUN_JSON` 으로 낸다. `probe-a-simrun.cjs` 가 띄운다 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const SEASONS = Number(process.env.PB_SEASONS || 6);
const PERSONA = process.env.PB_PERSONA || "growth";
const PRESET = process.env.PB_START_PRESET || "balanced";
const RUN_NO = Number(process.env.PB_RUN_NO || 1);

(async () => {
  // 계측 전용 — 대학 지원 분기(「전부 충족」 vs 뽑기 통과)를 `advanceWeek.ts`의
  // `__PB_CAREER_LOG` 게이트가 console.log("[진로점수] ...")로 찍는다. 게임
  // 로직·저장값엔 영향 없다(주석 확인). 여기서 그 줄만 걸러 리포트에 싣는다 —
  // 표를 새로 만들지 않고 기존 `#NN.json`에 얹는다(24판 재계측 2026-09-19).
  globalThis.__PB_CAREER_LOG = true;
  const 진로로그 = [];
  // ⚠ **머리표가 둘이다** (2026-09-19 · A). `[진로점수]` 는 대학 지원 분기고,
  //   `[군결정]` 은 `runAutoAdvance` 의 입대 여부(누가 정했나)다 — 안전형이
  //   대학 1학년에 입대한 것을 「드라이버인가 게임 로직인가」로 가르려고 넓혔다.
  //   둘 다 같은 `__PB_CAREER_LOG` 게이트라 실제 플레이는 안 지난다.
  const 로그머리 = ["[진로점수]", "[군결정]"];
  const rawLog = console.log.bind(console);
  console.log = (...args) => {
    if (typeof args[0] === "string" && 로그머리.some((h) => args[0].startsWith(h))) 진로로그.push(args.join(" "));
    else rawLog(...args);
  };
  const { app, tmp } = await headless.boot(`simrun-${SEED}-${PERSONA}`);
  const years = [];
  try {
    app.setPersona(PERSONA);
    await app.boot({ slotId: "SR" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });
    app.resetEventFunnel();
    app.resetMilitaryCounters();

    let prev = app.tierCounters();
    let prevMil = app.militaryCounters();
    const start = app.currentSeason();
    // 🔴 **그 해 시작 시점의 무대·소속을 든다.** 진로 결정이 시즌 끝 무렵에
    //   처리돼서, 접는 시점에는 이미 다음 무대의 소속이다 — 그대로 적으면
    //   성적과 소속이 서로 다른 해를 가리킨다(실측으로 잡았다)
    const snap = () => {
      const st = app.protagonistState();
      return { 무대: String(st.stage), 소속: String(st.team ?? ""), 나이: Number(st.age ?? 0) };
    };
    let yearAt = snap();
    /**
     * 🔴 **연도 라벨은 엔진의 `seasonYear` 를 안 믿는다** (2026-09-21 고침 ·
     *   사용자 확정 — 이 함수·`perfEntry.ts` 는 안 건드린다, 워커만 고친다).
     *   옛 코드는 매 줄에 `s.seasonYear`(엔진 값)를 그대로 찍었는데 두 갈래로
     *   어긋나는 게 실측으로 잡혔다(24판·2026-09-20 · 51+5건):
     *
     *   ① **진로가 갈리는 해**(드래프트·진학·독립·입대)는 `pushCareerForward`/
     *     `pushPendingForward` 가 `isSeasonEnded()` 를 거치지 않고 새 시즌을
     *     직접 연다(`S2028 W32` → `S2029 W0` — 이 파일 아래 `runWorldSeasonEnd`
     *     주석과 perfEntry.ts 8251번째 줄 주석 실측). `isSeasonEnded()` 가 한
     *     번도 참이 된 적이 없으니 그 해는 통째로 안 접히고, 성적은 다음
     *     무대가 리셋해 버려 되살릴 수 없다. 예전엔 이 자리를 `불완전:true`
     *     빈 줄(성적 전부 0)로 메웠다(51건).
     *
     *   ② **군 전역**은 다르다 — `isSeasonEnded()` 가 **두 번** 참이 된다
     *     (전역 전 마지막 시즌 · 전역 뒤 첫 프로 시즌), 성적도 둘 다 진짜인데
     *     `seasonYear` 가 그 사이 안 늘어(엔진 쪽 값이라 여기서 못 고친다)
     *     같은 라벨이 두 번 찍힌다(5건 — 나이는 실제로 26→27로 늘었다).
     *
     *   **고친 방식** — 둘 다 "줄 하나 = 실제로 지나간 해 하나" 라는 불변식은
     *   깨지지 않는다(①은 줄이 아예 없는 게 문제, ②는 줄은 맞는데 라벨만
     *   겹치는 게 문제). `seasonYear` 를 읽는 대신 **우리가 접은 줄 수**로
     *   라벨을 매긴다(`label`, `start` 에서 시작해 줄마다 1씩 늘린다). ①은
     *   전이 직전에 미리 잰 진짜 성적(대개 0 이지만 0 도 관측값이다)으로
     *   줄을 채우고, 무대가 실제로 바뀌면 「A→B」로 적는다. ②는 그냥 다음
     *   번호를 매기면 둘이 저절로 갈린다.
     */
    let label = start;
    const guard = makeStallGuard();
    let n = 0;
    while (n++ < SEASONS * 52 * 40 && app.currentSeason() - start < SEASONS) {
      if (app.retired()) break;

      // 이번 바퀴에서 시즌이 안 접히고 그냥 넘어갈 경우를 대비해, 리셋되기
      // 전의 진짜 성적을 미리 담아 둔다 — 안 쓰면(전이가 안 나면) 버린다.
      // `tierCounters`/`militaryCounters`/`simYearRow` 는 모두 순수 조회라
      // 매 바퀴 불러도 게임 상태에 영향이 없다(계측값·판 진행 둘 다 그대로).
      const preNow = app.tierCounters();
      const preD = {};
      for (const k of ["normal", "rare", "unique", "hidden"]) preD[k] = (preNow.등급[k] ?? 0) - (prev.등급[k] ?? 0);
      const preMilNow = app.militaryCounters();
      const preMilD = { 캘린더: preMilNow.캘린더 - prevMil.캘린더, 뽑기: preMilNow.뽑기 - prevMil.뽑기 };
      const preRow = app.simYearRow(preD, preNow.통지 - prev.통지, yearAt, preMilD);
      const preStage = yearAt.무대;
      const preSeason = app.currentSeason();

      const w0 = app.currentWeek(), s0 = app.currentSeason();
      let stalled = false;
      if (app.pendingKind() === "draftObserve") { guard.hit(true); await app.skipDraftObserve(); }
      else if (await app.pushCareerForward()) { guard.hit(true); }
      else if (await app.pushPendingForward()) { guard.hit(true); }
      else if (app.isSeasonEnded()) {
        // ⚠ **롤오버 전에 접는다** — 뒤에 부르면 나이·소속이 이미 다음 해 것이다.
        //   이 갈래는 시즌을 스스로 접으므로(정상 경로) 아래 "안 접힌 전이"
        //   검사 없이 바로 다음 바퀴로 넘어간다.
        const now = app.tierCounters();
        const d = {};
        for (const k of ["normal", "rare", "unique", "hidden"]) d[k] = (now.등급[k] ?? 0) - (prev.등급[k] ?? 0);
        const nowMil = app.militaryCounters();
        const milD = { 캘린더: nowMil.캘린더 - prevMil.캘린더, 뽑기: nowMil.뽑기 - prevMil.뽑기 };
        const row = app.simYearRow(d, now.통지 - prev.통지, yearAt, milD);
        // 🔴 라벨은 `s.seasonYear` 가 아니라 우리가 접은 순번이다 — 위 큰
        //   주석 ②(군 전역 직후 같은 해가 두 번 찍히는 결함, 5건 실측)가 이
        //   자리다. `s.seasonYear` 가 안 늘어도 줄마다 라벨은 늘어난다.
        row.연도 = label++;
        years.push(row);
        prev = now;
        prevMil = nowMil;
        guard.hit(true);
        await app.seasonRollover();
        yearAt = snap();   // 다음 해의 시작 시점
        continue;
      } else {
        await app.autoRun();
        stalled = guard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0);
      }

      // 위 네 갈래(관전 건너뛰기·진로 전이 둘·자동 진행) 전부 시즌을 직접
      // 접지 않고 넘어갈 수 있는 자리다 — 한 곳에서 같이 본다. 실측(24판
      // 51건)은 전부 진로 전이 쪽이었지만, 자동 진행이 안에서 같은 일을
      // 해도 여기서 똑같이 잡힌다(죽은 갈래 아님 — 아직 실측에 안 걸렸을
      // 뿐인 방어선이다).
      if (app.currentSeason() !== preSeason) {
        const afterSnap = snap();
        // 방어적으로 범위를 두지만(한 번에 여러 해를 건너뛸 가능성), 24판
        // 51건 실측은 늘 1이었다 — 그 이상이면 이 성적(preRow)을 되풀이해
        // 채운다(엔진이 그 사이를 안 알려 주니 더 잘게 쪼갤 근거가 없다).
        for (let y = preSeason; y < app.currentSeason(); y++) {
          const row = y === preSeason
            ? preRow
            : app.simYearRow({ normal: 0, rare: 0, unique: 0, hidden: 0 }, 0, afterSnap, { 캘린더: 0, 뽑기: 0 });
          row.연도 = label++;
          if (afterSnap.무대 !== preStage) row.무대 = `${preStage}→${afterSnap.무대}`;
          years.push(row);
        }
        prev = app.tierCounters();
        // ⚠ **`prevMil`은 여기서 안 당긴다** — 실측으로 잡았다(2026-09-18 · D,
        //   전후 비교 진단 중). `tierCounters`는 전 무대가 같이 쓰는 누계라
        //   다른 무대의 사건이 새어 들어올 수 있어 위에서 리셋이 맞다. 그런데
        //   `militaryLifeCounters`는 군 주간 루프 안에서만 늘어나는 **군 전용**
        //   값이라 애초에 새어 들어올 다른 무대가 없다 — 군 전용 계수기는
        //   리셋 없이 그대로 둬야 다음 실제 `isSeasonEnded()`가 처음부터
        //   끝까지 온전한 델타를 잡는다(대조군 비교로 확인 · 2026-09-21 라벨
        //   고침과 무관하게 그대로 유지한다).
        yearAt = afterSnap;
      }

      if (stalled) break;
    }
  } catch (e) {
    console.error("[simrun] 예외", e && e.stack || e);
  }
  const report = app.simRunReport({ 번호: RUN_NO, 씨앗: SEED, 프리셋: PRESET }, years);
  report.진로로그 = 진로로그;
  await headless.cleanup(tmp);
  console.log("SIMRUN_JSON " + JSON.stringify(report));
})();
