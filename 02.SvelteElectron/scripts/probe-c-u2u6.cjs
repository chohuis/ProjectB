"use strict";
/**
 * C 세션 재현 — 사용자 v1.0.0 결함 U2·U6 (2026-09-07)
 *
 *   U2  고교 투수 랭킹 「통합」에 3학년이 안 보인다
 *   U6  「x월 고교 리그 경기 결과」 표의 홈·원정 자리 · 표와 본문 겹말
 *
 * 새 게임을 만들어 고교 시즌 중반까지 돌린 뒤 시즌마다,
 *  · 유망주 랭킹 네 컬럼을 **지금 다시 만들어** 학년을 붙여 본다
 *  · 경기 결과 소식의 metadata 와 body 를 나란히 찍는다
 *
 * 🔴 게임 코드·데이터는 안 건드린다. `perfEntry.top10GradeProbe` ·
 *   `msgRawProbe` 둘만 새로 얹은 계기다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEED = arg("seed", 20260731);
const STOP_WEEK = arg("week", 22);
const SEASONS = arg("seasons", 3);

async function main() {
  const { app, tmp } = await headless.boot("c-u2u6");
  try {
    await app.boot({ slotId: "CU", worldSeed: SEED, seasonYear: 2026 });
    const startYear = app.currentSeason();
    let guard = 0;
    let trackIds = [];
    for (let si = 0; si < SEASONS; si++) {
      const want = startYear + si;
      while (guard++ < 3000) {
        if (app.retired()) break;
        if (app.currentSeason() === want && app.currentWeek() >= STOP_WEEK) break;
        const w0 = app.currentWeek(), s0 = app.currentSeason();
        if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
        if (await app.pushCareerForward()) continue;
        if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
        await app.autoRun();
        if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
      }
      console.log("");
      console.log("[C U2] 씨앗 " + SEED + " · " + app.currentSeason() + " W" + app.currentWeek()
        + " · 무대 " + app.careerStage());
      const t = await app.top10GradeProbe();
      console.log("  풀 학년별 " + JSON.stringify(t["풀 학년별"]) + "  · 주인공 " + t["주인공학년"] + "학년");
      for (const c of t["컬럼"]) {
        const gs = c.entries.map((e) => e.grade).join(",");
        console.log("  [" + c["이름표"] + "] 줄 " + c["줄수"] + "  heroRank " + c.heroRank
          + "  학년: " + (gs || "(없음)"));
      }
      console.log("  OVR 학년별 " + JSON.stringify(app.hsOvrByGradeProbe()));
      const uni = t["컬럼"][0].entries.filter(function(e){return e.id;});
      const uo = app.hsOvrOfProbe(uni.map(function(e){return e.id;}));
      console.log("  통합 상위: " + uni.map(function(e){return e.rank+"."+e.name+"["+e.id+"](g"+e.grade+",ovr"+(uo[e.id]&&uo[e.id].ovr)+",sc"+e.score+")";}).join(" "));
      if (trackIds.length) console.log("  추적 " + JSON.stringify(app.hsOvrOfProbe(trackIds)));
      trackIds = t["컬럼"][0].entries.map(function(e){return e.id;}).filter(Boolean).slice(0,3);
      if (app.careerStage() !== "highschool") { console.log("  (고교를 떠났다 — 중단)"); break; }
    }

    console.log("");
    console.log("── U6 경기 결과 소식 ────────────────────────────");
    const ms = app.msgRawProbe("msg-league-results-", 1);
    if (ms.length === 0) console.log("  (소식 없음)");
    for (const m of ms) {
      console.log("  " + m.id + "  「" + m.subject + "」");
      const md = m.metadata;
      console.log("  metadata.columns = " + JSON.stringify(md && md.columns));
      for (const r of (md && md.rows ? md.rows : []).slice(0, 3)) console.log("    row " + JSON.stringify(r));
      console.log("  body:");
      for (const l of String(m.body).split("\n").slice(0, 3)) console.log("    " + l);
    }
  } finally {
    await headless.cleanup(tmp);
  }
}
main().catch((e) => { console.error("[probe-c-u2u6] 실패:", e); process.exit(1); });
