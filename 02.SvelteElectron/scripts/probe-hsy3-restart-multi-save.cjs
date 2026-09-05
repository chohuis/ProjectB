"use strict";
// D 세션(재현) — 코디네이터 지시 #5: 미결 소식이 **둘 이상** 남은 채로
// 저장했다가 불러오면 각각의 selectedOptionId(이미 고른 것 포함)가 살아
// 있는지. HS Y3 W16 SCRIMMAGE를 "power"로 답한 뒤 계속 진행하다, mailbox에
// 미결 decision이 2개 이상 동시에 쌓이는 첫 순간에 멈추고 저장한다.
//
// 환경변수: PF_SEED(기본 20260802) · PB_USERDATA(필수) · PB_SLOT(기본 RM1) ·
//   PB_SNAPSHOT(필수)
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260802);
const SLOT = process.env.PB_SLOT || "RM1";
const USERDATA = process.env.PB_USERDATA;
const SNAPSHOT = process.env.PB_SNAPSHOT;
if (!USERDATA) throw new Error("PB_USERDATA 필요");
if (!SNAPSHOT) throw new Error("PB_SNAPSHOT 필요");

(async () => {
  fs.rmSync(USERDATA, { recursive: true, force: true });
  fs.mkdirSync(USERDATA, { recursive: true });

  const { app } = await headless.boot("hsy3rm", { userDataDir: USERDATA });
  let why = "완주(2개 이상 미결을 못 만남)";
  try {
    await app.boot({ slotId: SLOT, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });
    app.armDecisionChoice("EVT_HS_Y3_LAST_SCRIMMAGE", "power");

    // 1) SCRIMMAGE까지는 이전과 같은 방식(트랩이 autoRun을 스스로 멈춘다)
    let guard = 0;
    while (guard++ < 5 * 400) {
      if (Object.values(app.armedChoiceHits()).some((h) => h.length > 0)) break;
      if (app.retired()) { why = "은퇴(트랩 전)"; break; }
      const kind = app.pendingKind();
      if (kind === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0 && app.pendingKind() === kind) break;
    }
    console.log(`[SCRIMMAGE 이후] ${JSON.stringify(app.weekStageDump())}`);

    // 2) 이제부터는 한 건씩 직접 고르되, **미결이 2개 이상 쌓이는 순간** 멈춘다.
    //    (실제로는 그 전 것 하나도 안 고르고 저장하는 셈 — "여러 개를 밀린 채
    //    두고 껐다"를 재현한다)
    guard = 0;
    while (guard++ < 400) {
      const unresolved = app.unresolvedMailboxDump();
      if (unresolved.length >= 2) { why = `미결 ${unresolved.length}건 — 여기서 저장`; break; }
      const kind = app.pendingKind();
      if (kind === null) { await app.oneWeek(); continue; }
      if (kind === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (kind === "message") {
        // pendingAction에 걸린 건 하나 고르고 넘어간다 — 그런데 **같은 주
        // 다이제스트가 한 번에 여러 통을 mailbox에 넣는 경우**가 있어(위 phase2
        // 실측: W18에 3통) pendingAction이 아직 하나만 승격돼 있어도
        // unresolvedMailboxDump는 이미 2+ 일 수 있다 — 그래서 위 체크를
        // 루프 맨 앞에 둔다.
        await app.resolveCurrentMessage();
        continue;
      }
      why = `예상 밖 pending=${kind}`;
      break;
    }
  } catch (e) {
    why = `예외 ${(e && e.stack) || e}`;
  }

  const dec = app.mailboxDecisionDump();
  console.log(`[phase-multi] 씨앗 ${SEED} · 슬롯 ${SLOT} · 종료사유 ${why}`);
  console.log(`[저장전 상태] ${JSON.stringify(app.weekStageDump())}`);
  console.log(`[저장전 decision전체 ${dec.length}건] ${JSON.stringify(dec)}`);

  await app.saveSlot();
  fs.writeFileSync(SNAPSHOT, JSON.stringify({
    seed: SEED, slot: SLOT, why,
    weekStage: app.weekStageDump(),
    decisions: dec,
  }, null, 2));
  console.log(`[phase-multi] 저장 완료 — userData=${USERDATA} slot=${SLOT}`);
  console.log(`[END-PHASE-MULTI-SAVE] ${why}`);
})();
