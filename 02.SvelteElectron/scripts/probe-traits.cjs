"use strict";
/** 성실·사기가 실제로 도는 범위 — **조건선에 닿는 주가 있는가.**
 *
 *  🔴 데이터만 봐서는 모른다. `diligence_lte 30`도 `COND_SLUMP`(사기≤38)도
 *    "값이 거기까지 안 간다"가 원인이라 **궤적을 재야** 보인다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 6);

/**
 * **경로를 고른다** (2026-09-01).
 *
 * 🔴 예전엔 `setCareerPolicy` 를 아예 안 불러서 기본값(넷 다 켬)으로 돌았고,
 * 그러면 **드래프트가 먼저 먹어 대학을 안 탄다.** 그래서 대학 구간 궤적이
 * 표본 0 이었는데 출력에는 안 드러났다 — 전 커리어를 뭉쳐 찍었으니까.
 *
 *   node scripts/probe-traits.cjs --path univ
 */
const PATHS = {
  indie: { draft: false, university: false, independent: true },
  univ:  { draft: false, university: true,  independent: false },
  draft: { draft: true,  university: false, independent: true },
};
const pi = process.argv.indexOf("--path");
const PATH_KEY = pi !== -1 ? process.argv[pi + 1] : "draft";
const POLICY = PATHS[PATH_KEY];
if (!POLICY) { console.log("경로: " + Object.keys(PATHS).join(" ")); process.exit(1); }

(async () => {
  const { app, tmp } = await headless.boot("traits");
  let why = "완주";
  // ⚠ **try 밖에 둔다.** 안에서 선언하면 아래 출력부가 못 읽어 ReferenceError 다
  //   (`node --check` 는 문법만 봐서 안 잡는다).
  const lastStat = {};
  const lastSched = {};
  let prevStage = null;
  try {
    await app.boot({ slotId: "PT", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    const start = app.currentSeason();
    app.trajReset();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      // ⚠ **진행 전후로 둘 다 걷는다.** 한 번만 걷으니 6시즌 312주에서
      //   표본이 38~48개뿐이었다 — autoRun이 여러 주를 한 번에 넘긴다.
      app.trajTick();
      // 🔴 **무대별 마지막 성적을 남긴다** (2026-09-01).
      //   대학에서 주인공이 경기를 뛰는지 확인해야 한다 — `s.schedule` 은
      //   고교 일정이고 대학은 `leagueSchedules` 에만 있어서, 진학 뒤
      //   **주인공 경기가 아예 없을** 가능성이 있다.
      //   그러면 사기(승패 ±6/−8)도 성적 조건(`season_ip_gte` 등)도 전부 죽는다.
      {
        // ⚠ **`경기 > 0` 으로 거르면 아무것도 안 남는다** — 실제로 첫 실행에서
        //   고교조차 한 줄도 안 찍혔다(고교는 확실히 뛰는데도).
        //   `{기록:"없음"}` 도 남겨야 **"안 뛴다"와 "프로브가 못 읽는다"** 가
        //   갈린다. 그리고 **최대 경기 수**를 남긴다 — 마지막 값만 남기면
        //   시즌 종료 뒤(stats 리셋) 값을 잡는다.
        const st = app.protagonistStatProbe();
        const stage = app.careerStage();
        if (st) {
          const prev = lastStat[stage];
          if (!prev || (st.경기 ?? -1) >= (prev.경기 ?? -1)) lastStat[stage] = st;
        }
        // 🔴 **무대가 바뀐 주에 일정을 찍는다.** `leagueSummary` 가
        //   "주인공 리그는 `schedule`, 나머지는 `leagueSchedules`" 를 이미
        //   가른다 — 대학에서 주인공 일정이 0이면 **경기를 안 뛰는 것**이
        //   직접 확인된다.
        // ⚠ 매주 부르면 무겁다(전 리그 순회). 무대 전환에서만 찍는다.
        if (stage !== prevStage) {
          prevStage = stage;
          lastSched[stage] = app.leagueSummary();
        }
      }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      app.trajTick();   // 진행 뒤에도 걷는다
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  const t = app.trajProbe();
  console.log(`[성실] ${JSON.stringify(t.성실)}`);
  console.log(`[사기] ${JSON.stringify(t.사기)}`);
  console.log(`[닿음] ${JSON.stringify(t.닿음)}   ← 0이면 그 조건은 영원히 false다`);
  // ⚠ **무대별로 봐야 한다.** 뭉치면 프로에서만 내려간 걸 "대학도 내려간다"로
  //   읽는다 — 대학 이벤트 아홉이 `morale_lte 40~60` 으로 전멸했다(트랙 B)
  for (const [stage, v] of Object.entries(t.무대별 ?? {})) {
    console.log(`  [${stage}] ${JSON.stringify(v)}`);
  }
  for (const [stage, st] of Object.entries(lastStat)) {
    console.log(`  [성적:${stage}] ${JSON.stringify(st)}`);
  }
  // 🔴 주인공 리그의 `schedule` 이 0이면 **그 무대에서 경기를 안 뛴다**
  for (const [stage, sum] of Object.entries(lastSched)) {
    const mine = Object.entries(sum).filter(([, v]) => v.schedule > 0)
      .map(([lid, v]) => `${lid.replace("LEAGUE_", "")}:${v.schedule}/${v.played}`);
    console.log(`  [일정:${stage}] ${mine.join(" ") || "(전 리그 0)"}`);
  }
  console.log(`[END] ${why} · 씨앗 ${SEED} · 경로 ${PATH_KEY} · ${YEARS}시즌`);
  await headless.cleanup(tmp);
})();
