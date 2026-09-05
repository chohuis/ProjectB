"use strict";
// D 세션(재현) — 「졸업 전 마지막 연습경기 선발」(EVT_HS_Y3_LAST_SCRIMMAGE) 「전력
// 투구한다」(power) 선택 뒤 진행이 멈춘다는 리포트를 헤드리스로 재현한다.
//
// 조건: 고교 · 3학년 · W16~21 · once_per_stage_year. `runAutoAdvance`의
// `handleMessage`가 이 소식을 피로도 휴리스틱으로 먼저 골라버리므로
// `armDecisionChoice`로 "power"를 선점한다(perfEntry.ts 참고 — 사용자가
// 실제로 그 버튼을 누른 것과 같은 스토어 패치를 동기로 먼저 부른다).
//
// ⚠ `autoRun()`은 W40·W51까지 멈추지 않고 내부에서 여러 주를 삼킨다 — 그래서
//   창(W16~21) 진입을 바깥 루프에서 잡으려 하면 놓친다. 대신 `armDecisionChoice`·
//   `armGameWatch`·`armPendingLog`는 스토어 구독이라 몇 주를 건너뛰든 그 순간을
//   놓치지 않는다. 바깥 루프는 그냥 커리어를 끝까지 미는 역할만 한다.
//
// 덤프: armedChoiceHits() · gameWatchDump() · pendingLogDump() —
//   미결정 소식이 언제 풀렸는지, "game" pendingAction의 scheduleId가 실제
//   seasonStore.schedule에 있었는지.
//
// 환경변수: PF_SEED (기본 20260802) · PF_YEARS (기본 5)
const path = require("node:path");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260802);
const YEARS = Number(process.env.PF_YEARS || 5);

(async () => {
  const { app, tmp } = await headless.boot("hsy3");
  let why = "완주";
  try {
    await app.boot({ slotId: "Y3", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });
    app.armDecisionChoice("EVT_HS_Y3_LAST_SCRIMMAGE", "power");
    app.armGameWatch();
    app.armPendingLog();

    const start = app.currentSeason();
    let guard = 0;
    let sinceHit = -1; // 트랩이 걸린 뒤 몇 바퀴 더 돌았는지 (-1 = 아직)
    while (guard++ < YEARS * 400) {
      if (app.retired()) { why = "은퇴"; break; }
      if (app.currentSeason() >= start + YEARS) { why = `씨즌 ${YEARS} 도달`; break; }

      const w0 = app.currentWeek(), s0 = app.currentSeason(), stage0 = app.careerStage();

      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        console.log(`[롤오버 진입] ${app.currentSeason()}시즌 종료 — stage=${app.careerStage()}`);
        await app.seasonRollover();
        continue;
      }

      await app.autoRun();
      console.log(`[진행] S${s0}W${w0}(${stage0}) → S${app.currentSeason()}W${app.currentWeek()}(${app.careerStage()})`
        + ` pending=${app.pendingKind()}`);

      const hits = app.armedChoiceHits();
      const hitCount = Object.values(hits).reduce((a, arr) => a + arr.length, 0);
      if (hitCount > 0 && sinceHit < 0) sinceHit = 0;
      if (sinceHit >= 0) {
        sinceHit++;
        if (sinceHit > 6) { why = "트랩 이후 6바퀴 관찰 완료"; break; }
      }

      if (app.currentWeek() === w0 && app.currentSeason() === s0 && app.careerStage() === stage0) {
        why = `정지 ${s0}W${w0} pending=${app.pendingKind()}`;
        break;
      }
    }
  } catch (e) {
    why = `예외 ${(e && e.stack) || e}`;
  }

  console.log(`\n[재현] 씨앗 ${SEED} · 종료사유 ${why}`);
  console.log(`[선택트랩] ${JSON.stringify(app.armedChoiceHits())}`);
  console.log(`[게임감시 ${app.gameWatchDump().length}건]`);
  for (const row of app.gameWatchDump()) console.log(`  ${JSON.stringify(row)}`);
  console.log(`[pending전이 ${app.pendingLogDump().length}건]`);
  for (const row of app.pendingLogDump()) {
    console.log(`  W${row.week} pending=${JSON.stringify(row.actions)}`);
  }
  console.log(`[현재상태] ${JSON.stringify(app.weekStageDump())}`);
  console.log(`[END] ${why}`);
  await headless.cleanup(tmp);
})();
