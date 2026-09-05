"use strict";
// D 세션(재현) — #5 phase 2: 다른 프로세스로 불러와 decision 생존을 대조한다.
// 환경변수: PB_USERDATA(필수) · PB_SLOT(기본 RM1) · PB_SNAPSHOT(필수)
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SLOT = process.env.PB_SLOT || "RM1";
const USERDATA = process.env.PB_USERDATA;
const SNAPSHOT = process.env.PB_SNAPSHOT;
if (!USERDATA) throw new Error("PB_USERDATA 필요");
if (!SNAPSHOT) throw new Error("PB_SNAPSHOT 필요");

(async () => {
  const before = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const { app } = await headless.boot("hsy3rml", { userDataDir: USERDATA });
  try {
    const ok = await app.bootContinue(SLOT);
    if (!ok) throw new Error(`bootContinue(${SLOT}) → false`);

    const after = app.mailboxDecisionDump();
    console.log("=== decision 생존 대조 (저장 전 → 불러온 뒤) ===");
    console.log(`currentWeek 전=${before.weekStage.week} 후=${app.weekStageDump().week}`);
    console.log(`decision 건수 전=${before.decisions.length} 후=${after.length}`);

    const afterMap = new Map(after.map((d) => [d.id, d]));
    let mismatches = 0;
    for (const b of before.decisions) {
      const a = afterMap.get(b.id);
      if (!a) {
        console.log(`  ★유실★ ${b.id} (${b.subject}) — 전=${b.selectedOptionId ?? "null"} · 불러온 뒤 목록에 없음`);
        mismatches++;
        continue;
      }
      const same = a.selectedOptionId === b.selectedOptionId;
      console.log(`  ${b.id} (${b.subject}) — 전=${b.selectedOptionId ?? "null"} 후=${a.selectedOptionId ?? "null"} ${same ? "일치" : "★불일치★"}`);
      if (!same) mismatches++;
    }
    console.log(`판정: ${mismatches === 0 ? "전부 살아있다(정상)" : `${mismatches}건 어긋남(결함 의심)`}`);

    // 저장 당시 "game" pending도 있었다 — scheduleId 생존까지 본다
    const pas = app.pendingActionsDump();
    console.log(`불러온 뒤 pendingActions=${JSON.stringify(pas)}`);
    for (const pa of pas) {
      if (pa.type !== "game") continue;
      const found = app.scheduleFind(pa.scheduleId);
      console.log(`  game pending scheduleId=${pa.scheduleId} → ${found ? "찾음 " + JSON.stringify(found) : "★못찾음★(고아)"}`);
    }

    console.log(`[END-PHASE-MULTI-LOAD] 대조 완료 · 불일치 ${mismatches}건`);
  } catch (e) {
    console.log(`[END-PHASE-MULTI-LOAD] 예외 ${(e && e.stack) || e}`);
  }
  await headless.cleanup(USERDATA);
})();
