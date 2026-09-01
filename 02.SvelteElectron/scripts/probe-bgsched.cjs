"use strict";
/**
 * 배경 리그 일정이 시즌마다 다시 만들어지는가 — **시즌 중**에 센다.
 *
 * 🔴 `startNewSeason` 은 `leagueSchedules` 를 **통째로 비운다**
 *   (`makeEmptySeason`). 그러니 매 시즌 누군가 다시 채워야 한다.
 *   그런데 채우는 자리가 둘뿐이고 **둘 다 고교 전용**이다:
 *
 * ```
 *   initAllLeaguesV3        새 게임에서 한 번
 *   reinitHighschoolSeason  고교 1→2 · 2→3 진급에서만
 * ```
 *
 * ⚠ `probe-traits` 의 `[일정끝]` 으로는 이걸 못 가린다. 무대의 마지막 주는
 *   대개 롤오버 **뒤**라 전부 0 으로 보이고, 고교만 꽉 차 보이는 건
 *   `reinitHighschoolSeason` 이 방금 **다시 만들었기 때문**이다 —
 *   리그가 도는 증거가 아니라 다시 만든 증거다.
 *
 * 그래서 **시즌 중(W15~25)** 에 한 장씩 찍는다. 거기가 0 이면 그 시즌에
 * 진짜로 일정이 없는 것이다.
 *
 *   npm run probe:bgsched
 *   PF_YEARS=6 PF_SEED=20260731 ... --path indie
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 6);

const PATHS = {
  indie: { draft: false, university: false, independent: true },
  univ:  { draft: false, university: true,  independent: false },
  draft: { draft: true,  university: false, independent: true },
};
const pi = process.argv.indexOf("--path");
const PATH_KEY = pi !== -1 ? process.argv[pi + 1] : "univ";
const POLICY = PATHS[PATH_KEY];
if (!POLICY) { console.log("경로: " + Object.keys(PATHS).join(" ")); process.exit(1); }

(async () => {
  const { app, tmp } = await headless.boot("bgsched");
  let why = "완주";
  const seen = new Map();
  try {
    await app.boot({ slotId: "BG", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      // 🔴 **주차 창으로 고르지 않는다** (2026-09-02).
      //
      //   처음엔 `W15~25` 에서 한 장 찍게 했는데 **한 줄도 안 나왔다.**
      //   `autoRun` 은 한 번에 여러 주를 넘긴다 — W0 → W32 → W40 으로 뛰어
      //   그 창을 **한 번도 안 지난다**(CLAUDE.md 가 대학 로스터 건에서
      //   같은 함정을 적어 뒀다).
      //
      //   그래서 매 바퀴 찍고 **그 시즌에 일정이 가장 많았던 순간**을 남긴다.
      //   "그 시즌에 일정이 만들어지긴 했는가" 에는 그게 답이다.
      const year = app.currentSeason();
      {
        const sum = app.leagueSummary();
        const total = Object.values(sum).reduce((a, v) => a + v.schedule, 0);
        const prev = seen.get(year);
        if (!prev || total > prev.total) {
          seen.set(year, { total, sum, wy: ((app.currentWeek() - 1) % 52) + 1, stage: app.careerStage() });
        }
      }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      if (app.currentWeek() > w0) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log("");
  console.log("── 시즌별 최대 일정 (일정 수/치른 수) ──────────────────");
  for (const year of [...seen.keys()].sort()) {
    const { sum, wy, stage } = seen.get(year);
    const live = Object.entries(sum)
      .filter(([, v]) => v.schedule > 0)
      .map(([lid, v]) => `${lid.replace("LEAGUE_", "")}:${v.schedule}/${v.played}`);
    console.log(`  ${year} W${wy} [${stage}] ${live.join(" ") || "(전 리그 0)"}`);
  }
  console.log(`[END] ${why} · 씨앗 ${SEED} · 경로 ${PATH_KEY} · ${YEARS}시즌`);
  await headless.cleanup(tmp);
})();
