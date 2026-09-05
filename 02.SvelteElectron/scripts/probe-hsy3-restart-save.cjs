"use strict";
// D 세션(재현) — 「저장·재시작」 경계 phase 1.
//
// 코디네이터 지시: 이전 재현(probe-hsy3-scrimmage.cjs)은 한 프로세스 안에서
// 끊지 않고 이어 돌렸다 — 실제 "껐다 켰다"가 아니다. 이 스크립트는 고교
// 3학년 W16 EVT_HS_Y3_LAST_SCRIMMAGE를 "power"로 답한 **바로 그 자리**에서
// 저장하고 프로세스를 끝낸다. slot.db는 지우지 않는다 — phase 2
// (probe-hsy3-restart-load.cjs)가 **다른 프로세스**로 이어서 그 슬롯을 연다.
//
// 저장 직전에 찍는 것: pendingActions 전부 · 미결 소식 목록(2개 이상일 수
// 있다 — TEAM_CHEM_01 등 같은 주 다른 소식) · schedule id 전체 목록(재로드
// 후 대조용) · currentWeek.
//
// 환경변수: PF_SEED(기본 20260802) · PB_USERDATA(필수 — phase 2와 공유할
//   고정 디렉터리) · PB_SLOT(기본 RS1) · PB_SNAPSHOT(필수 — 저장 전 스냅샷
//   JSON 경로, phase 2가 읽어 대조한다)
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260802);
const SLOT = process.env.PB_SLOT || "RS1";
const USERDATA = process.env.PB_USERDATA;
const SNAPSHOT = process.env.PB_SNAPSHOT;
if (!USERDATA) throw new Error("PB_USERDATA 필요 — phase 2와 공유할 고정 디렉터리");
if (!SNAPSHOT) throw new Error("PB_SNAPSHOT 필요 — 저장 전 스냅샷을 남길 경로");

(async () => {
  // 깨끗하게 새로 시작 — 이전 실행 잔재가 있으면 지운다
  fs.rmSync(USERDATA, { recursive: true, force: true });
  fs.mkdirSync(USERDATA, { recursive: true });

  const { app } = await headless.boot("hsy3rs", { userDataDir: USERDATA });
  let why = "완주(이벤트를 못 만남)";
  try {
    await app.boot({ slotId: SLOT, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });
    app.armDecisionChoice("EVT_HS_Y3_LAST_SCRIMMAGE", "power");
    app.armPendingLog();

    // `armDecisionChoice`가 이제 트랩이 걸리는 순간 `autoAdvanceStore`를
    // 스스로 멈춘다(perfEntry.ts 참고 — `runOneWeek()`와 같은 수법). 그래서
    // 단계를 가를 필요 없이 `autoRun()`을 반복하기만 하면 된다 — 정지
    // 사유가 STOP_WEEKS(40·51)·진로 결정 등 **다른** 이유가 아니라 우리
    // 트랩인지만 매 바퀴 확인한다.
    let guard = 0;
    while (guard++ < 5 * 400) {
      if (Object.values(app.armedChoiceHits()).some((h) => h.length > 0)) {
        why = "SCRIMMAGE 트랩 성공 — 여기서 저장";
        break;
      }
      if (app.retired()) { why = "은퇴(트랩 전)"; break; }
      const kind = app.pendingKind();
      if (kind === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0 && app.pendingKind() === kind) {
        why = `정지(진행 없음) S${s0}W${w0} pending=${kind}`;
        break;
      }
    }
  } catch (e) {
    why = `예외 ${(e && e.stack) || e}`;
  }

  console.log(`[phase1] 씨앗 ${SEED} · 슬롯 ${SLOT} · 종료사유 ${why}`);
  console.log(`[phase1][트랩] ${JSON.stringify(app.armedChoiceHits())}`);
  console.log(`[phase1][저장전 상태] ${JSON.stringify(app.weekStageDump())}`);
  console.log(`[phase1][저장전 pendingActions] ${JSON.stringify(app.pendingActionsDump())}`);
  const idsBefore = app.scheduleIdList();
  console.log(`[phase1][저장전 schedule ${idsBefore.length}건] ${JSON.stringify(idsBefore)}`);

  await app.saveSlot();

  fs.writeFileSync(SNAPSHOT, JSON.stringify({
    seed: SEED, slot: SLOT, why,
    armedChoiceHits: app.armedChoiceHits(),
    weekStage: app.weekStageDump(),
    pendingActions: app.pendingActionsDump(),
    unresolvedMailbox: app.unresolvedMailboxDump(),
    scheduleIds: idsBefore,
  }, null, 2));

  console.log(`[phase1] 저장 완료 — userData=${USERDATA} slot=${SLOT} snapshot=${SNAPSHOT}`);
  console.log(`[END-PHASE1] ${why}`);
  // ⚠ headless.cleanup()을 안 부른다 — slot.db를 지우면 phase 2가 못 읽는다
})();
