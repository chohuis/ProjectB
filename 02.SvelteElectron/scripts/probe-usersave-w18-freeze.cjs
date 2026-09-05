"use strict";
// D 세션(재현) — 실사용자 세이브(slot3_slot_1.db · 고교 3학년 · 2028 W18)에서
// 「졸업 전 마지막 연습경기 선발」(EVT_HS_Y3_LAST_SCRIMMAGE) 선택 뒤 진행이
// 멈추고 소식 탭으로 전환조차 안 된다는 리포트를 헤드리스로 재현한다.
//
// OP 가 세이브를 직접 열어 확인한 것: pendingActions 딱 1건
//   {"type":"game","scheduleId":"FRIENDLY_W18_TEAM_HS_MUJIN"}
// 그 경기는 schedule 테이블에 bucket=primary·week=18·has_result=0 로 있고
// json 도 온전하다. 상대(TEAM_HS_JUNGNIM)도 순위표에 있고 선수 31명.
//
// bootContinue(slotId)로 실제 "이어하기"(loadGameV3) 경로를 그대로 탄다.
// 원본 파일은 절대 건드리지 않는다 — .tmp-d-repro 에 복사된 사본만 연다.
//
// 환경변수: PB_USERDATA(필수 · 사본이 든 디렉터리, 그 아래 saves/slot3_<slot>.db)
//   PB_SLOT(기본 slot_1)
const path = require("node:path");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SLOT = process.env.PB_SLOT || "slot_1";
const USERDATA = process.env.PB_USERDATA;
if (!USERDATA) throw new Error("PB_USERDATA 필요");

(async () => {
  const { app } = await headless.boot("usersave-w18", { userDataDir: USERDATA });
  let why = "완주";
  try {
    console.log(`[부팅] bootContinue(${SLOT}) 시작`);
    const ok = await app.bootContinue(SLOT);
    if (!ok) throw new Error(`bootContinue(${SLOT}) → false — v3 슬롯이 아니거나 로드 실패`);
    console.log(`[부팅] bootContinue(${SLOT}) → true`);

    app.armGameWatch();
    app.armPendingLog();

    // ── 1) 불러온 직후 덤프 ──────────────────────────────────────
    const stage = app.weekStageDump();
    const pending = app.pendingActionsDump();
    const scheduleIds = app.scheduleIdList();
    const targetId = "FRIENDLY_W18_TEAM_HS_MUJIN";
    const foundInSchedule = scheduleIds.includes(targetId);
    const foundDetail = app.scheduleFind(targetId);

    console.log("\n=== 불러온 직후 상태 ===");
    console.log(`weekStageDump = ${JSON.stringify(stage)}`);
    console.log(`pendingActions = ${JSON.stringify(pending)}`);
    console.log(`schedule 건수 = ${scheduleIds.length}`);
    console.log(`FRIENDLY_W18_TEAM_HS_MUJIN in seasonStore.schedule? ${foundInSchedule}`);
    console.log(`scheduleFind(${targetId}) = ${JSON.stringify(foundDetail)}`);
    console.log(`currentWeek() = ${app.currentWeek()} · currentSeason() = ${app.currentSeason()} · careerStage() = ${app.careerStage()}`);
    console.log(`pendingKind() = ${app.pendingKind()}`);

    // ── 2) 그 경기를 실제로 처리 — autoRun()이 runAutoAdvance()→handleGame()을
    //    화면과 같은 순서로 부른다(perfEntry.autoRun은 stopReason이 "오류:"로
    //    시작하면 스택과 함께 던진다 — MainPage.startEntrySimulation과 같은
    //    matchSimulateToEntry 인자 구성을 handleGame이 그대로 쓴다) ─────────
    console.log("\n=== 경기 처리 시도 (app.autoRun) ===");
    if (app.pendingKind() === "game") {
      const pa = pending.find((a) => a.type === "game");
      console.log(`[게임대기] scheduleId=${pa ? pa.scheduleId : "(없음)"}`);
      await app.autoRun();
      console.log(`[게임처리후] ${JSON.stringify(app.weekStageDump())}`);
    } else {
      console.log(`pendingKind()가 "game"이 아니다 — 실제 ${app.pendingKind()}. 그대로 autoRun 한 번 시도`);
      await app.autoRun();
      console.log(`[처리후] ${JSON.stringify(app.weekStageDump())}`);
    }

    // ── 3) 계속 진행해 다음 주까지 넘어가는지 확인 ────────────────
    console.log("\n=== 이후 진행 관찰 ===");
    let guard = 0;
    while (guard++ < 60) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason(), stage0 = app.careerStage();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { console.log(`[커리어처리] ${JSON.stringify(app.weekStageDump())}`); continue; }
      if (app.isSeasonEnded()) { await app.seasonRollover(); console.log("[롤오버]"); continue; }

      if (app.pendingKind() === "message") {
        const picked = await app.resolveCurrentMessage();
        console.log(`[소식처리] picked=${picked} ${JSON.stringify(app.weekStageDump())}`);
        continue;
      }
      if (app.pendingKind() === "game") {
        const pa = app.pendingActionsDump().find((a) => a.type === "game");
        const found = app.scheduleFind(pa.scheduleId);
        console.log(`[게임대기] scheduleId=${pa.scheduleId} → ${found ? "찾음 " + JSON.stringify(found) : "★못찾음★(고아)"}`);
        if (!found) { why = `게임 pending 고아 — scheduleId=${pa.scheduleId}`; break; }
        await app.autoRun();
        console.log(`[게임처리후] ${JSON.stringify(app.weekStageDump())}`);
        continue;
      }

      await app.oneWeek();
      console.log(`[주진행] S${s0}W${w0} → S${app.currentSeason()}W${app.currentWeek()} pending=${app.pendingKind()}`);

      if (app.currentWeek() === w0 && app.currentSeason() === s0 && app.careerStage() === stage0 && app.pendingKind() === null) {
        why = `정지(진행 없음) S${s0}W${w0}`;
        break;
      }
    }
    if (guard >= 60 && why === "완주") why = "가드(60틱) 도달 — 정상 계속 진행 중일 수 있음";
  } catch (e) {
    why = `예외 ${(e && e.stack) || e}`;
    try {
      const audit = app.npcMilitaryStatusAudit();
      console.log(`\n[militaryStatus 감사] 전체=${audit.total} 결측=${audit.missing}`);
      for (const s of audit.samples) console.log(`  ${JSON.stringify(s)}`);
    } catch (e2) {
      console.log(`[militaryStatus 감사 실패] ${(e2 && e2.stack) || e2}`);
    }
  }

  console.log(`\n[phase] 종료사유 ${why}`);
  console.log(`[게임감시 ${app.gameWatchDump().length}건]`);
  for (const row of app.gameWatchDump()) console.log(`  ${JSON.stringify(row)}`);
  console.log(`[pending전이 ${app.pendingLogDump().length}건]`);
  for (const row of app.pendingLogDump()) console.log(`  W${row.week} pending=${JSON.stringify(row.actions)}`);
  console.log(`[END] ${why}`);
  await headless.cleanup(USERDATA);
})();
