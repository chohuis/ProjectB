"use strict";
/**
 * 테스트 시나리오를 헤드리스로 돌린다 (Ctrl+Q → 테스트 시나리오와 같은 함수).
 *
 * 실행: npm run scenarios [-- --weeks N]
 *
 * 버튼이 도는지 확인하려고 사람이 눌러볼 필요가 없게 하려는 것이다.
 * `--weeks N`을 주면 그만큼 자동 진행한 **뒤** 시나리오를 돌린다 —
 * 드래프트·메시지처럼 "몇 주 지나야 생기는" 것들이 skip을 벗어난다.
 */
const headless = require("./perf/headless.cjs");

const i = process.argv.indexOf("--weeks");
const WEEKS = i !== -1 ? (Number(process.argv[i + 1]) || 0) : 0;

(async () => {
  const { app, tmp } = await headless.boot("scenarios");
  await app.boot({ slotId: "SC", worldSeed: 20260731, seasonYear: 2026 });

  if (WEEKS > 0) {
    process.stderr.write(`W${WEEKS}까지 자동 진행...\n`);
    let guard = 0;
    while (app.currentWeek() < WEEKS && guard++ < WEEKS * 4) {
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() <= before) {
        if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
        // 진로 pending — 사용자가 누를 자리를 대신 눌러 프로까지 민다
        const done = await app.pushCareerForward();
        if (done) { process.stderr.write(`  [진로] ${done} → ${app.careerStage()}\n`); continue; }
        if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
        process.stderr.write(`  W${before}에서 정지: ${app.pendingKind()}\n`);
        break;
      }
    }
    process.stderr.write(`  W${app.currentWeek()} 도달 · ${app.careerStage()}\n`);
  }

  console.log(await app.runScenarios());
  headless.cleanup(tmp);
  process.exit(0);
})().catch((e) => { console.error("[run-scenarios] 실패:", e); process.exit(1); });
