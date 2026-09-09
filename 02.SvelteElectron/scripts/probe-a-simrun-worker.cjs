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
  const { app, tmp } = await headless.boot(`simrun-${SEED}-${PERSONA}`);
  const years = [];
  try {
    app.setPersona(PERSONA);
    await app.boot({ slotId: "SR" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });
    app.resetEventFunnel();

    let prev = app.tierCounters();
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
     * 🔴 **해가 통째로 빠졌다** (2026-09-09 실측 · 24판에서 26자리 · 11%).
     *
     * 줄은 `isSeasonEnded()` 가 참일 때만 접었는데, **진로가 갈리는 해는
     * 그 갈래를 안 지난다** — 무대가 바뀌면 `initSeason`/`openProSeason` 이
     * 새 시즌을 직접 열어서, 다음 바퀴에는 이미 다음 해다.
     * 그래서 #01 은 2030 이, #06 은 2032·2033 이 통째로 없었다 —
     * **하필 지명·진학이 일어난 해**가 사라진다.
     *
     * 못 접은 해를 되살릴 수는 없다(성적이 이미 초기화됐다). 대신 **빠졌다는
     * 사실을 남긴다** — 조용히 사라지는 것이 제일 나쁘고, 표가 「11시즌」이라고
     * 말하면 읽는 사람은 은퇴로 읽는다.
     */
    let lastSeason = app.currentSeason();
    const guard = makeStallGuard();
    let n = 0;
    while (n++ < SEASONS * 52 * 40 && app.currentSeason() - start < SEASONS) {
      if (app.retired()) break;
      // 우리가 안 접었는데 해가 넘어갔다 — 빈 줄로 표시한다
      if (app.currentSeason() !== lastSeason) {
        for (let y = lastSeason; y < app.currentSeason(); y++) {
          if (!years.some((r) => r.연도 === y)) {
            years.push({ 연도: y, 나이: 0, 무대: yearAt.무대, 소속: yearAt.소속, 연봉: 0,
              G: 0, IP: 0, ERA: 0, 승: 0, 패: 0, OVR: 0,
              노말: 0, 레어: 0, 유니크: 0, 히든: 0, 통지: 0,
              일: [], 불완전: true });
          }
        }
        lastSeason = app.currentSeason();
        yearAt = snap();
      }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { guard.hit(true); await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { guard.hit(true); continue; }
      if (await app.pushPendingForward()) { guard.hit(true); continue; }
      if (app.isSeasonEnded()) {
        // ⚠ **롤오버 전에 접는다** — 뒤에 부르면 나이·소속이 이미 다음 해 것이다
        const now = app.tierCounters();
        const d = {};
        for (const k of ["normal", "rare", "unique", "hidden"]) d[k] = (now.등급[k] ?? 0) - (prev.등급[k] ?? 0);
        years.push(app.simYearRow(d, now.통지 - prev.통지, yearAt));
        prev = now;
        guard.hit(true);
        await app.seasonRollover();
        lastSeason = app.currentSeason();
        yearAt = snap();   // 다음 해의 시작 시점
        continue;
      }
      await app.autoRun();
      if (guard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }
  } catch (e) {
    console.error("[simrun] 예외", e && e.stack || e);
  }
  const report = app.simRunReport({ 번호: RUN_NO, 씨앗: SEED, 프리셋: PRESET }, years);
  await headless.cleanup(tmp);
  console.log("SIMRUN_JSON " + JSON.stringify(report));
})();
