"use strict";
// A 세션 — `militaryStatus` 결측이 **언제** 생기는지 추적한다.
// DB(npc 테이블)는 `military_status TEXT NOT NULL DEFAULT '미필'`이라 결측이 0이다
// (실측 2026-09-05: 8,427명 전원 값 있음). 즉 결측은 **메모리에서** 생긴다.
// 매 틱마다 감사해서 숫자가 늘어난 지점을 찍는다.
const path = require("node:path");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SLOT = process.env.PB_SLOT || "slot_1";
const USERDATA = process.env.PB_USERDATA;
if (!USERDATA) throw new Error("PB_USERDATA 필요");

(async () => {
  const { app } = await headless.boot("a-mil-trace", { userDataDir: USERDATA });
  let last = -1;
  const mark = (label) => {
    const a = app.npcMilitaryStatusAudit();
    if (a.missing !== last) {
      console.log(`[결측변화] ${last} → ${a.missing} @ ${label} (전체 ${a.total})`);
      if (a.missing > 0 && last <= 0) {
        for (const s of a.samples.slice(0, 5)) console.log(`   ${JSON.stringify(s)}`);
      }
      last = a.missing;
    }
  };
  let why = "완주";
  try {
    if (!await app.bootContinue(SLOT)) throw new Error("bootContinue false");
    mark("로드직후");
    let guard = 0;
    while (guard++ < 400) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason(), stage0 = app.careerStage();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); mark(`S${s0}W${w0} skipDraftObserve`); continue; }
      if (await app.pushCareerForward()) { mark(`S${s0}W${w0} pushCareerForward`); continue; }
      if (app.isSeasonEnded()) { await app.seasonRollover(); mark(`S${s0}W${w0} seasonRollover`); continue; }
      if (app.pendingKind() === "message") { await app.resolveCurrentMessage(); mark(`S${s0}W${w0} message`); continue; }
      if (app.pendingKind() === "game") { await app.autoRun(); mark(`S${s0}W${w0} game`); continue; }
      await app.oneWeek();
      mark(`S${s0}W${w0} oneWeek → S${app.currentSeason()}W${app.currentWeek()}`);
      if (app.currentWeek() === w0 && app.currentSeason() === s0 && app.careerStage() === stage0 && app.pendingKind() === null) {
        why = `정지 S${s0}W${w0}`; break;
      }
    }
  } catch (e) {
    why = `예외 ${(e && e.stack) || e}`;
    try { mark("예외직후"); const a = app.npcMilitaryStatusAudit();
      console.log(`[감사] 전체=${a.total} 결측=${a.missing}`);
      for (const s of a.samples) console.log(`  ${JSON.stringify(s)}`);
    } catch {}
  }
  console.log(`[END] ${why}`);
  await headless.cleanup(USERDATA);
})();
