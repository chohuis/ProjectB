"use strict";
// D 세션(재현) — 「저장·재시작」 경계 phase 2. **다른 프로세스**로 실행해야
// 한다(phase1과 이 스크립트를 같은 node 프로세스에서 이어 부르면 모듈 전역
// 상태가 안 끊겨 "껐다 켰다"가 안 된다 — `loadGameV3`의
// `resetWorldSeasonEndGuard` 주석이 그 이유를 적어 뒀다).
//
// phase1이 저장한 slot.db를 `bootContinue(slotId)`로 연다 — 이건 실제
// `App.svelte`의 "이어하기"(loadGameV3)와 같은 경로다(`app.boot()`는 항상
// 새 게임이라 이 경로를 안 탄다).
//
// 불러온 직후 찍는 것: pendingActions 전부 · 미결 소식 목록(그 각각의
// selectedOptionId) · schedule id 전체 목록(저장 전과 대조) · "game" pending이
// 있으면 그 scheduleId가 불러온 schedule에 있는지. 이어서 주를 넘겨가며
// 같은 조회를 반복한다.
//
// 환경변수: PB_USERDATA(필수, phase1과 동일) · PB_SLOT(기본 RS1) ·
//   PB_SNAPSHOT(필수, phase1이 남긴 저장 전 스냅샷 JSON)
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SLOT = process.env.PB_SLOT || "RS1";
const USERDATA = process.env.PB_USERDATA;
const SNAPSHOT = process.env.PB_SNAPSHOT;
if (!USERDATA) throw new Error("PB_USERDATA 필요");
if (!SNAPSHOT) throw new Error("PB_SNAPSHOT 필요");

(async () => {
  const before = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const { app } = await headless.boot("hsy3rl", { userDataDir: USERDATA });
  let why = "완주";
  try {
    const ok = await app.bootContinue(SLOT);
    if (!ok) throw new Error(`bootContinue(${SLOT}) → false — v3 슬롯이 아니거나 로드 실패`);

    app.armGameWatch();
    app.armPendingLog();
    // 재로드 직후에도 다른 이벤트가 새로 뜰 수 있으니 계속 걸어 둔다
    app.armDecisionChoice("EVT_HS_Y3_LAST_SCRIMMAGE", "power");

    // ── 대조표: 저장 전 vs 불러온 직후 ──────────────────────────
    const after = {
      weekStage: app.weekStageDump(),
      pendingActions: app.pendingActionsDump(),
      unresolvedMailbox: app.unresolvedMailboxDump(),
      scheduleIds: app.scheduleIdList(),
    };

    console.log("=== 저장 전/후 대조 ===");
    console.log(`currentWeek  전=${before.weekStage.week} 후=${after.weekStage.week}`
      + `  ${before.weekStage.week === after.weekStage.week ? "일치" : "★불일치★"}`);
    console.log(`pendingActions 전=${JSON.stringify(before.pendingActions)}`);
    console.log(`pendingActions 후=${JSON.stringify(after.pendingActions)}`);
    console.log(`미결소식 전=${JSON.stringify(before.unresolvedMailbox)}`);
    console.log(`미결소식 후=${JSON.stringify(after.unresolvedMailbox)}`);
    // selectedOptionId 생존 여부 — id는 같은데 후 목록에 없으면 resolved된
    // 것이거나(정상) 통째로 사라진 것(결함)이다. mailbox 원본을 마저 본다
    for (const m of before.unresolvedMailbox) {
      const stillUnresolved = after.unresolvedMailbox.some((x) => x.id === m.id);
      console.log(`  소식 ${m.id} (${m.subject}) — 불러온 뒤 ${stillUnresolved ? "여전히 미결(정상 — 안 건드림)" : "미결목록에 없음(선택됨 또는 유실 — 아래 mailboxRaw로 확인)"}`);
    }

    const idsBeforeSet = new Set(before.scheduleIds);
    const idsAfterSet = new Set(after.scheduleIds);
    const onlyBefore = before.scheduleIds.filter((id) => !idsAfterSet.has(id));
    const onlyAfter = after.scheduleIds.filter((id) => !idsBeforeSet.has(id));
    console.log(`schedule 전체 건수  전=${before.scheduleIds.length} 후=${after.scheduleIds.length}`);
    console.log(`schedule id — 저장 전에만 있음(사라짐) ${onlyBefore.length}건: ${JSON.stringify(onlyBefore.slice(0, 30))}${onlyBefore.length > 30 ? " ...(생략)" : ""}`);
    console.log(`schedule id — 불러온 뒤에만 있음(새로 생김) ${onlyAfter.length}건: ${JSON.stringify(onlyAfter.slice(0, 30))}${onlyAfter.length > 30 ? " ...(생략)" : ""}`);

    // "game" pending이 있었다면(저장 전이든 후든) scheduleId가 불러온
    // schedule에 있는지 — MainPage.svelte:182와 같은 조회
    const checkGamePending = (label, list) => {
      for (const a of list) {
        if (a.type !== "game") continue;
        const found = after.scheduleIds.includes(a.scheduleId);
        console.log(`  [${label}] game pending scheduleId=${a.scheduleId} → 불러온 schedule에 ${found ? "있음" : "★없음★(고아)"}`);
        if (found) {
          const detail = app.scheduleFind(a.scheduleId);
          console.log(`    상세: ${JSON.stringify(detail)}`);
        }
      }
    };
    checkGamePending("저장전pending", before.pendingActions);
    checkGamePending("불러온후pending", after.pendingActions);

    console.log(`판정: schedule id 전후 ${onlyBefore.length === 0 && onlyAfter.length === 0 ? "완전히 같다(재생성 없음)" : "달라졌다 — 재생성 의심"}`);

    // ── 이어서 주를 넘겨 다음 경기까지 ────────────────────────────
    console.log("\n=== 재로드 후 진행 ===");
    let guard = 0;
    let sawGame = false, extra = 0;
    while (guard++ < 300) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason(), stage0 = app.careerStage();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { console.log(`[커리어처리] ${JSON.stringify(app.weekStageDump())}`); continue; }
      if (app.isSeasonEnded()) { await app.seasonRollover(); console.log("[롤오버]"); continue; }

      // 소식은 한 건씩 직접 고른다(자동 휴리스틱 대신) — 실제 클릭과 같은 결
      if (app.pendingKind() === "message") {
        const picked = await app.resolveCurrentMessage();
        console.log(`[소식처리] picked=${picked} ${JSON.stringify(app.weekStageDump())}`);
        continue;
      }
      if (app.pendingKind() === "game") {
        const pa = app.pendingActionsDump().find((a) => a.type === "game");
        const found = app.scheduleFind(pa.scheduleId);
        console.log(`[게임대기] scheduleId=${pa.scheduleId} → ${found ? "찾음 " + JSON.stringify(found) : "★못찾음★(고아 — 화면이 안 뜰 자리)"}`);
        if (!found) { why = `게임 pending 고아 확인 — scheduleId=${pa.scheduleId}`; break; }
        // 찾았으면 계속 진행해 본다 — autoRun 한 번으로 이 게임을 처리시킨다
        await app.autoRun();
        sawGame = true;
        console.log(`[게임처리후] ${JSON.stringify(app.weekStageDump())}`);
        continue;
      }

      await app.oneWeek();
      console.log(`[주진행] S${s0}W${w0} → S${app.currentSeason()}W${app.currentWeek()} pending=${app.pendingKind()}`);

      if (sawGame) {
        extra++;
        if (extra > 4) { why = "게임 처리 뒤 관찰 완료"; break; }
      }

      if (app.currentWeek() === w0 && app.currentSeason() === s0 && app.careerStage() === stage0 && app.pendingKind() === null) {
        why = `정지(진행 없음) S${s0}W${w0}`;
        break;
      }
    }
  } catch (e) {
    why = `예외 ${(e && e.stack) || e}`;
  }

  console.log(`\n[phase2] 종료사유 ${why}`);
  console.log(`[phase2][선택트랩] ${JSON.stringify(app.armedChoiceHits())}`);
  console.log(`[phase2][게임감시 ${app.gameWatchDump().length}건]`);
  for (const row of app.gameWatchDump()) console.log(`  ${JSON.stringify(row)}`);
  console.log(`[END-PHASE2] ${why}`);
  await headless.cleanup(USERDATA);
})();
