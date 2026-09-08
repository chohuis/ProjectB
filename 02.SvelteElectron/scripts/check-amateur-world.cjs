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
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

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

    const stallGuard = makeStallGuard();
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      // 한 바퀴 안 움직인 것은 정지 pending 을 민 정상 경로일 수 있다 — `perf/weekLoop.cjs` 머리말
      if (stallGuard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }

    const stage = String((app.protagonistState() || {}).stage ?? "?");
    const dir = path.join(tmp, "saves");
    const f = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
    const Database = require(path.join(process.cwd(), "node_modules/better-sqlite3"));
    const db = new Database(path.join(dir, f), { readonly: true });

    console.log(`[아마추어 세계] 씨앗 ${SEED} · ${SEASONS}시즌 · 주인공 단계 ${stage}\n`);

    // 🔴 **생성분과 진행분은 연도로 못 가른다.** `generateCareerHistory`가
    //   12년치를 만들어서 시작 연도에도 걸린다 — 그래서 2026년 트레이드 45건을
    //   "진행 중 발생"으로 잘못 찍었다(실은 전부 생성분이었다).
    //   정본은 **`week`**다: 생성분은 null, 진행 중 발생은 주차가 있다.
    const rows = db.prepare(
      "SELECT season_year, category, (week IS NULL) AS seeded, COUNT(*) c" +
      " FROM transactions GROUP BY season_year, category, seeded" +
      " ORDER BY season_year, category"
    ).all();
    console.log("  연도별 · 종류별 거래  (생성분 = 새 게임이 심은 과거)");
    const live = new Map();
    for (const r of rows) {
      const tag = r.seeded ? "(생성분)" : "← 진행 중";
      if (!r.seeded) live.set(r.category, (live.get(r.category) ?? 0) + r.c);
      console.log("    " + r.season_year + "  " + String(r.category).padEnd(16) +
        String(r.c).padStart(5) + "   " + tag);
    }
    console.log("");
    console.log("  진행 중 발생 합계");
    if (live.size === 0) console.log("    (없음)");
    for (const [k, v] of [...live].sort((a, b) => b[1] - a[1])) {
      console.log("    " + k.padEnd(16) + String(v).padStart(5));
    }
    const liveTrade = live.get("trade") ?? 0;
    const liveFa = live.get("fa") ?? 0;
    console.log("");
    if (liveTrade === 0) {
      console.log("  🔴 진행 중 트레이드 **0건** — 주인공이 아마추어인 동안");
      console.log("     프로 트레이드가 한 번도 안 돈다.");
      console.log("     `advanceWeek`의 트레이드 윈도우가 주인공 리그로 걸려 있다.");
    } else {
      console.log("  진행 중 트레이드 " + liveTrade + "건 — 돈다");
    }
    console.log("  (견줄 값: 진행 중 FA " + liveFa + "건 — FA는 배경 경로로 돈다)");

    // 진행 중 트레이드가 **어느 주차**에 났는지 — 트레이드 윈도우(W22·W39)면
    // `processTradeWindow`가 돈 것이고, 아니면 다른 경로다
    const tw = db.prepare(
      "SELECT season_year, week, from_league_id, to_league_id, detail FROM transactions" +
      " WHERE category = ? AND week IS NOT NULL ORDER BY season_year, week"
    ).all("trade");
    if (tw.length) {
      console.log("");
      console.log("  진행 중 트레이드의 주차 (윈도우는 W22 · W39)");
      for (const r of tw.slice(0, 10)) {
        console.log("    " + r.season_year + " W" + r.week + "  " +
          (r.from_league_id || "-") + " → " + (r.to_league_id || "-") +
          "  " + String(r.detail || "").slice(0, 40));
      }
    }

    // 🔴 **리그를 넘는 트레이드는 없어야 한다.** 예전에 JBL 선수가 KBL로
    // 넘어간 적이 있다(market.ts 주석). 국적 필터를 좁히면서 그 방어가
    // 얇아졌으므로 여기서 못박는다.
    const cross = db.prepare(
      "SELECT COUNT(*) c FROM transactions WHERE category = ? AND week IS NOT NULL" +
      " AND from_league_id IS NOT NULL AND to_league_id IS NOT NULL" +
      " AND from_league_id <> to_league_id"
    ).get("trade").c;
    console.log("");
    if (cross === 0) console.log("  ok  리그를 넘는 트레이드 0건");
    else console.log("  FAIL 리그를 넘는 트레이드 " + cross + "건 — JBL→KBL 결함이 되살아났다");

    // 리그별 트레이드 — 한 리그만 돌면 나머지가 막힌 것이다
    const perLg = db.prepare(
      "SELECT to_league_id lg, COUNT(*) c FROM transactions" +
      " WHERE category = ? AND week IS NOT NULL GROUP BY to_league_id ORDER BY c DESC"
    ).all("trade");
    console.log("  리그별 진행 중 트레이드");
    if (!perLg.length) console.log("    (없음)");
    for (const r of perLg) console.log("    " + String(r.lg || "-").padEnd(18) + String(r.c).padStart(4));

    db.close();
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[check-amateur-world] 실패:", e); process.exit(1); });
