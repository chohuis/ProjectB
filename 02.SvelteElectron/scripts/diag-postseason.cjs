"use strict";
/**
 * B-0 — 포스트시즌이 왜 독립리그 하나만 뜨는가 (진단 전용, 고치지 않는다)
 *
 *   npm run diag:postseason -- [--seasons 1] [--seed S]
 *
 * ⚠ **화면에 브래킷이 독립 하나만 뜬다.** `backgroundPostseason.ts`가
 * 리그마다 **다른 근거**로 정규시즌 종료를 판정한다:
 *
 *     독립     survival.stage > lastRegularStage()   ← 단계
 *     KBL·팜   schedule.every(e => !!e.result)       ← 일정 전부 소화
 *
 * ## 실측 결과 (2026-08-06, 1시즌) — **처음 가설은 틀렸다**
 *
 * "마지막 주 경기가 검사 뒤에 시뮬돼서 브래킷이 영영 안 만들어진다"고 봤는데
 * 아니었다. **KBL·팜 브래킷은 정상적으로 만들어진다 — W51에.**
 *
 *     W40  KBL 150/720 미소화   브래킷: 독립
 *     W47  KBL  50/720 미소화   브래킷: 독립
 *     W51  KBL   0/720 미소화   브래킷: 독립, KBL, KBL_FARM   ← 여기서 생긴다
 *
 * 화면에 독립만 보이는 건 **시즌 중에 봤기 때문**이다. 독립은 사다리라 일찍
 * 끝나고 KBL은 정규시즌(~W50)이 끝나야 열린다 — 야구가 원래 그렇다.
 *
 * 대신 **저장 쪽에 진짜 결함이 있었다**: 롤오버가 배경 리그 우승팀을
 * `standings[0]`(정규시즌 1위)로 적고 준우승은 빈칸으로 뒀다. 진짜 우승자가
 * 담긴 브래킷을 바로 옆에서 같이 저장하면서. `bracketFinalists`로 고쳤다.
 *
 * ⚠ **계측 안 했으면 없는 결함을 고칠 뻔했다.**
 */

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 1);
const SEED = arg("seed", 20260806);

const log = (s) => process.stdout.write(s + "\n");
const L = ["LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_UNIVERSITY"];
const short = (lid) => lid.replace("LEAGUE_", "");

(async () => {
  const { app } = await headless.boot("diag-ps");
  await app.boot({ slotId: "DIAG", worldSeed: SEED, seasonYear: 2026 });

  const rows = [];
  let tourSnap = { state: [], sched: {} };
  let guard = 0;
  const startSeason = app.currentSeason();

  while (app.currentSeason() - startSeason < SEASONS && guard++ < SEASONS * 200) {
    const before = app.currentWeek();
    await app.autoRun();
    const after = app.currentWeek();

    const d = app.postseasonDiag();
    rows.push(d);

    if (after - before <= 0) {
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        // ⚠ **롤오버 전에 담는다.** 롤오버가 `tournaments`를 비우므로 뒤에서
        // 읽으면 전부 빈 것으로 보인다 — 처음에 그렇게 재서 아무것도 안 나왔다
        tourSnap = { state: app.tournamentState(), sched: app.tourScheduleState() };
        await app.seasonRollover(); continue;
      }
      break;
    }
  }

  // ── 결과 ────────────────────────────────────────────────────────
  log("\n주차별 — 미소화 경기 수와 브래킷 생성 시점\n");
  log(`  주차 | ${L.map((l) => short(l).padEnd(14)).join("| ")}| 독립      | 브래킷`);
  log(`  ${"-".repeat(84)}`);

  let prevBrackets = "";
  for (const d of rows) {
    const cells = L.map((lid) => {
      const g = d.leagues[lid];
      if (!g || g.sched === 0) return "일정 없음".padEnd(14);
      return `${g.unplayed}/${g.sched} (~W${g.lastWeek})`.padEnd(14);
    });
    const sv = d.survival ? `st${d.survival.stage} r${d.survival.ranked}`.padEnd(10) : "—".padEnd(10);
    const b = d.brackets.map(short).join(",");
    // 브래킷이 바뀐 주차와 마지막 몇 주만 — 52줄을 다 찍으면 아무도 안 본다
    const interesting = b !== prevBrackets
      || L.some((lid) => d.leagues[lid]?.done)
      || d === rows[rows.length - 1];
    if (interesting) log(`  W${String(d.week).padStart(3)} | ${cells.join("| ")}| ${sv}| ${b || "(없음)"}`);
    prevBrackets = b;
  }

  const last = rows[rows.length - 1] ?? { leagues: {}, brackets: [] };
  log("\n── 마지막 상태 ──");
  for (const lid of L) {
    const g = last.leagues[lid];
    if (!g) continue;
    log(`  ${short(lid).padEnd(14)} 일정 ${g.sched} · 미소화 ${g.unplayed} · 마지막 W${g.lastWeek}`
      + ` · 종료판정 ${g.done ? "참" : "거짓"}`);
  }
  log(`  브래킷 생성: ${last.brackets.map(short).join(", ") || "(없음)"}`);

  const missing = L.filter((lid) => (last.leagues[lid]?.sched ?? 0) > 0 && !last.brackets.includes(lid));
  if (missing.length > 0) {
    log(`\n⚠ 일정이 있는데 브래킷이 없는 리그: ${missing.map(short).join(", ")}`);
    for (const lid of missing) {
      const g = last.leagues[lid];
      log(`    ${short(lid)} — ${g.done
        ? "종료판정은 참인데 브래킷이 없다 → 호출 순서 또는 build() 문제"
        : `미소화 ${g.unplayed}경기가 남아 종료판정이 거짓 → 일정이 안 끝난다`}`);
    }
  }

  // ── 저장된 과거 기록 (B-1) ─────────────────────────────────────
  const year = 2026;
  const h = await app.historyDiag("DIAG", year);
  log(`
── ${year} 저장 기록 ──`);
  log(`  대회 ${h.tournaments.length}건`);
  for (const t of h.tournaments) {
    log(`    ${t.id.padEnd(22)} ${(t.champ || "(안 열림)").padEnd(12)}`
      + ` 준 ${(t.runnerUp || "—").padEnd(12)} 대진 ${t.hasBracket ? "있음" : "없음"}`);
  }
  log(`  포스트시즌 ${h.postseason.length}건`);
  for (const q of h.postseason) {
    log(`    ${q.league.replace("LEAGUE_", "").padEnd(16)} 우승 ${(q.champ || "—").padEnd(12)}`
      + ` 준 ${(q.runnerUp || "—").padEnd(12)} 대진 ${q.hasBracket ? "있음" : "없음"}`);
  }

  // ── 대회 진행 상태 ─────────────────────────────────────────────
  // ⚠ 2시즌 실측에서 **대학 대회 3개가 전부 미완**이었다(고교 5개는 정상).
  // 왕중왕전은 대진이 있는데 우승이 없고, 은하기·여명기는 대진조차 없다.
  log(`
── 대회 진행 ──`);
  for (const t of tourSnap.state) {
    log(`  ${t.id.padEnd(22)} 라운드 ${t.rounds} · 완료 ${t.done} · 우승 ${t.champ ?? "—"}`);
  }
  log(`
── 대회 일정 소화 ──`);
  for (const [id, v] of Object.entries(tourSnap.sched)) {
    log(`  ${id.padEnd(22)} 일정 ${v.entries} · 치름 ${v.played}`);
  }

  headless.cleanup();
  process.exit(0);
})().catch((e) => { log(`ERROR ${e.stack || e}`); process.exit(1); });
