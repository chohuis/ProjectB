"use strict";
/**
 * D 세션 계측 — E2. 「경기 출전이 성장에 얼마나 기여하나」(1.0.1 단계 0 ·
 * PLAN_101_2026-09-06.md). 무대별(고교·대학·독립·2군·1군) 주인공 연간
 * 등판 수·이닝과, 그 무대에서 **경기가 있던 주 대 없던 주**의 스탯(투구
 * velocity+command+control 합) 주간 증가분을 나란히 잰다.
 *
 * ── 방법 ──────────────────────────────────────────────────────────
 * 훈련은 조건 없이 매주 돈다(`growth_engine.rs calc_week_growth`) — 그래서
 * "경기가 있던 주"의 증가분은 **훈련분 + 경기분**이고 "없던 주"는 훈련분만이다.
 * 둘의 차를 그 주 등판 수로 나누면 **경기 1회의 증가분**이 실측으로 나온다
 * (`probe-morale.cjs`가 사기에 쓴 것과 같은 방식 — 회귀만 있는 통과 사건이
 * 섞인 통을 가른다).
 *
 * 훈련 쪽 기준선은 **주 슬롯 몰빵**(`setTrainingSlots([primary])` — 보조
 * 슬롯을 비운다)으로 고정한다. `SLOT_MULTS`상 주 슬롯이 배수 2.5로 가장 크다.
 *
 * ⚠ 표본이 아니라 **주 단위 실측**이다 — `runOneWeek()`으로 한 주씩만
 *   간다(`autoRun()`은 여러 주를 건너뛰어 "그 주"를 특정 못 한다).
 * ⚠ 시즌 경계에서 `s.stats`가 리그별로 통째로 리셋된다(`season.ts`) —
 *   경기 수(g)·이닝(ip)이 누적이 아니라 **그 시즌 값**이다. 연간 표는
 *   시즌 끝(롤오버 직전)에서 걷고, 주간 델타의 누적 등판 기준선(prevG)도
 *   그 시점에 0으로 되돌린다.
 *
 *   npm run probe:d:e2 -- --path pro --years 10
 *   PF_SEED=777 npm run probe:d:e2 -- --path univ --years 8
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const YEARS = Number(process.env.PF_YEARS || 10);
const PATHS = {
  indie: { draft: false, university: false, independent: true },
  univ: { draft: false, university: true, independent: false },
  pro: { draft: true, university: false, independent: true },
};
const pi = process.argv.indexOf("--path");
const PATH_KEY = pi !== -1 ? process.argv[pi + 1] : "pro";
const POLICY = PATHS[PATH_KEY];
if (!POLICY) { console.log("경로: " + Object.keys(PATHS).join(" ")); process.exit(1); }

const stageKeyOf = (stage, farm) => {
  if (stage === "highschool") return "고교";
  if (stage === "university") return "대학";
  if (stage === "independent") return "독립";
  if (/^pro/.test(stage || "")) return farm ? "2군" : "1군";
  return stage || "?";
};

const stat3 = (a) => (a.velocity ?? 0) + (a.command ?? 0) + (a.control ?? 0);

const bkt = () => ({ 등판주: [], 없는주: [], 게임수: [], 연간: [] });

(async () => {
  const { app, tmp } = await headless.boot("e2growth");
  let why = "완주";
  const buckets = {};
  const bucket = (k) => (buckets[k] ??= bkt());
  try {
    await app.boot({ slotId: "E2G", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);

    // 훈련 — 주 슬롯 몰빵 (보조 슬롯 비움)
    const first = await app.trainingProbe();
    app.setTrainingSlots([first.계획[0]]);

    let prevStat = stat3(app.protagonistAbilities());
    let prevG = 0;
    const start = app.currentSeason();
    let guard = 0;
    let lastSeason = -1;
    while (guard++ < YEARS * 52 * 40 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (s0 !== lastSeason) {
        lastSeason = s0;
        process.stdout.write(`  [진행] ${s0} W${w0} ${app.protagonistState().stage}\n`);
      }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (await app.pushPendingForward()) continue;
      if (app.isSeasonEnded()) {
        // 롤오버 직전 — 이번 시즌 누적 g/ip를 연간 표에 걷는다
        const st = app.protagonistStatProbe();
        const stage = app.protagonistState().stage;
        const farm = !!app.pathSignals().farm;
        const key = stageKeyOf(stage, farm);
        if (st && st.역할 === "투수" && (st.경기 ?? 0) > 0) {
          bucket(key).연간.push({ year: s0, g: st.경기, ip: st.ip });
        }
        await app.seasonRollover();
        prevG = 0;
        prevStat = stat3(app.protagonistAbilities());
        continue;
      }
      await app.runOneWeek();
      const w1 = app.currentWeek(), s1 = app.currentSeason();
      if (s1 === s0) {
        const stAfter = app.protagonistStatProbe();
        const gNow = (stAfter && stAfter.역할 === "투수") ? (stAfter.경기 ?? 0) : 0;
        const gDelta = gNow - prevG;
        prevG = gNow;
        const curStat = stat3(app.protagonistAbilities());
        const delta = curStat - prevStat;
        prevStat = curStat;
        const stage = app.protagonistState().stage;
        const farm = !!app.pathSignals().farm;
        const key = stageKeyOf(stage, farm);
        const b = bucket(key);
        if (gDelta > 0) { b.등판주.push(delta); b.게임수.push(gDelta); }
        else b.없는주.push(delta);
      }
      if (w1 === w0 && s1 === s0) { why = `정지 ${s0}W${w0} pending=${app.pendingKind()}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }

  const avg = (v) => v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;

  console.log("");
  console.log(`── E2 경기 출전 vs 훈련 XP (씨앗 ${SEED} · 경로 ${PATH_KEY} · 훈련 주슬롯 몰빵) ──`);
  console.log("무대   연간등판(평균) 연간이닝(평균) 표본시즌   없는주Δ(훈련만)  등판주Δ(훈련+경기)  주당게임  경기당증분(추정)");
  for (const [key, b] of Object.entries(buckets)) {
    const gAvg = avg(b.연간.map((x) => x.g));
    const ipAvg = avg(b.연간.map((x) => x.ip));
    const noGame = avg(b.없는주);
    const game = avg(b.등판주);
    const gamesPerWeek = avg(b.게임수);
    const perGame = (noGame != null && game != null && gamesPerWeek)
      ? Math.round(((game - noGame) / gamesPerWeek) * 1000) / 1000 : null;
    console.log(`${key.padEnd(6)} ${String(gAvg).padStart(8)}      ${String(ipAvg).padStart(8)}      ${String(b.연간.length).padStart(4)}     ` +
      `${String(noGame).padStart(10)}(n=${b.없는주.length})   ${String(game).padStart(10)}(n=${b.등판주.length})   ` +
      `${String(gamesPerWeek).padStart(6)}   ${perGame}`);
  }
  console.log("");
  console.log(`[END] ${why} · 씨앗 ${SEED} · 경로 ${PATH_KEY} · ${YEARS}시즌`);
  // 오케스트레이터(`probe-d-e2-runall.cjs`)가 여러 판을 모아 합산하는 용도
  const summary = {};
  for (const [key, b] of Object.entries(buckets)) {
    summary[key] = {
      gAvg: avg(b.연간.map((x) => x.g)), ipAvg: avg(b.연간.map((x) => x.ip)), seasons: b.연간.length,
      noGame: avg(b.없는주), noGameN: b.없는주.length,
      game: avg(b.등판주), gameN: b.등판주.length,
      gamesPerWeek: avg(b.게임수),
    };
  }
  console.log("RESULT " + JSON.stringify({ path: PATH_KEY, seed: SEED, years: YEARS, why, summary }));
  await headless.cleanup(tmp);
})();
