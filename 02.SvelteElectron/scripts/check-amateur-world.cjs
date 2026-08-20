"use strict";
/**
 * 주인공이 아마추어인 동안 **프로 세계가 도는가** — `npm run check:amateurworld`
 *
 * `advanceWeek`의 오프시즌 블록 넷이 주인공 커리어 단계로 걸려 있다:
 *
 *     if (isProStage && weekInYear === OFFSEASON_START_WEEK)   팀 Win-Now 압박
 *     if (isProStage && weekInYear === STOVE_LEAGUE_WEEK)      연봉협상 + FA 시장
 *     if (isProStage && weekInYear >= FA_RETRY_START_WEEK ...) FA 재트리거
 *     if (weekInYear === MILITARY_RESULT_WEEK && isProStage)   loyalty 감쇠
 *
 * 넷 중 셋은 **세계 전체**를 움직인다(전 프로팀 · 전 리그 FA · 전 NPC).
 * 주인공은 고교 3년 + 대학 4년을 아마추어로 보내므로, 게이트가 그대로면
 * 그동안 프로 리그에 **FA 이동이 한 건도 없다.**
 *
 * ⚠ **코드만 읽고 단정하지 않는다.** 다른 경로가 FA를 돌릴 수도 있다.
 * 실제로 몇 시즌 돌려 `transactions`를 센다.
 *
 * 의도일 수도 있다(안 보이는 걸 안 돌려 아끼는 설계). 이 검사는 **사실만**
 * 낸다 — 판단은 사용자 몫이다.
 */
const fs = require("node:fs");
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 3);
const SEED = arg("seed", 20260731);

async function main() {
  const { app, tmp } = await headless.boot("amateur");
  try {
    await app.boot({ slotId: "AM", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();

    let guard = 0;
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }

    const stage = String((app.protagonistState() || {}).stage ?? "?");
    const dir = path.join(tmp, "saves");
    const f = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
    const Database = require(path.join(process.cwd(), "node_modules/better-sqlite3"));
    const db = new Database(path.join(dir, f), { readonly: true });

    console.log(`[아마추어 세계] 씨앗 ${SEED} · ${SEASONS}시즌 · 주인공 단계 ${stage}\n`);

    // 새 게임 시점 생성분(seasonYear = 시작연도 이전)과 진행 중 발생분을 가른다
    const rows = db.prepare(
      "SELECT season_year, category, COUNT(*) c FROM transactions GROUP BY season_year, category ORDER BY season_year, category"
    ).all();
    console.log("  연도별 · 종류별 거래");
    let liveFa = 0, liveTrade = 0;
    for (const r of rows) {
      const live = r.season_year >= start;
      if (live && r.category === "fa") liveFa += r.c;
      if (live && r.category === "trade") liveTrade += r.c;
      console.log(`    ${r.season_year}  ${String(r.category).padEnd(16)} ${String(r.c).padStart(5)}` +
        (live ? "   ← 진행 중 발생" : "   (새 게임 생성분)"));
    }
    console.log("");
    console.log(`  진행 중 FA    ${liveFa}건`);
    console.log(`  진행 중 트레이드 ${liveTrade}건`);
    if (liveFa === 0) {
      console.log("");
      console.log("  → **주인공이 아마추어인 동안 FA가 한 건도 안 일어났다.**");
      console.log("    의도인지 결함인지는 사용자가 정한다. 이 검사는 사실만 낸다.");
    }
    db.close();
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[check-amateur-world] 실패:", e); process.exit(1); });
