"use strict";
// D → C 세이브 산출 — 단위 9(인센티브 정산 화면) 눈확인용.
// 프로 베테랑 + 인센티브 계약(재계약)으로 강제 전환한 뒤 정상 진행해
// 시즌 끝 인센티브 정산 소식이 뜬 시점을 slot.db 로 남긴다.
//
// ⚠ `context:"renewal"` 계약은 즉시 적용이 아니다 — `setPendingNextContract`로
//   쌓였다가 다음 시즌 시작(W52 경계)에서 `p.contract`로 바뀐다
//   (contractDecision.ts `isImmediateContract`). 그래서 시즌 경계를
//   **둘** 넘어야 한다: ① 계약 활성화 ② 그 시즌을 다 뛰어 정산까지.
// ⚠ **저장 파일은 projectb_v2.db 가 아니다.** 그건 슬롯 공용(역대기록·배경리그
//   기록)이고, 슬롯 본체(주인공·시즌·npc·거래·이력)는 apps/desktop/ipc/slotdb.cjs
//   의 slotFilePath() 가 정하는 `saves/slot3_<slotId>.db` 다(R3a v3 스키마 ·
//   슬롯마다 파일 하나). 처음엔 projectb_v2.db 만 복사해서 protagonist·
//   mailbox·save_slots 가 전부 0행이었다 — 그 테이블들은 db.cjs 가 만드는
//   낡은 v2 잔재라 아무도 안 쓴다. 둘 다 복사한다.
// ⚠ journal_mode=WAL 이라 최근 쓰기가 `-wal` 사이드카에 남는다 — 복사 전
//   새 커넥션으로 `wal_checkpoint(TRUNCATE)` 해서 본 파일 하나로 합친다.
//
//   node scripts/probe-make-c9-save.cjs
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260802);
const SLOT = "C9INC";

function checkpoint(dbPath) {
  try {
    const Database = require("better-sqlite3");
    const d = new Database(dbPath);
    d.pragma("wal_checkpoint(TRUNCATE)");
    d.close();
    return true;
  } catch (e) {
    console.log(`[C9세이브] checkpoint 실패 ${dbPath} — ${e.message}`);
    return false;
  }
}

(async () => {
  const { app, tmp } = await headless.boot("c9save");
  let why = "완주";
  try {
    await app.boot({ slotId: SLOT, worldSeed: SEED, seasonYear: 2026 });
    console.log(`[C9세이브] 부팅 완료 · 시즌 ${app.currentSeason()} W${app.currentWeek()}`);

    const ff = await app.fastForwardToProIncentiveContract();
    console.log(`[C9세이브] 강제전환(재계약 서명) 결과 ${JSON.stringify(ff)}`);
    // ⚠ 여기서 incentiveCount==0 인 게 정상이다 — renewal 은 다음 시즌에야 활성화된다.

    const startSeason = app.currentSeason();
    let guard = 0;
    let sawActive = false;
    while (guard++ < 52 * 6 * 2 && app.currentSeason() < startSeason + 2) {
      if (app.retired && app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      if (app.currentWeek() > w0) {
        if (!sawActive) {
          const mid = app.incentiveProbe();
          if (mid.contract && mid.contract.length > 0) {
            sawActive = true;
            console.log(`[C9세이브] 계약 활성화 확인 · 시즌${app.currentSeason()}W${app.currentWeek()} · ${JSON.stringify(mid.contract)}`);
          }
        }
        continue;
      }
      const kind = app.pendingKind();
      if (kind === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushPendingForward()) continue;
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0} pending=${kind}`; break; }
    }
    const probe = app.incentiveProbe();
    console.log(`[C9세이브] 시즌 진행 뒤 ${JSON.stringify(probe)}`);
    const sawIncentiveMsg = probe.msgIds && probe.msgIds.length > 0;
    console.log(`[C9세이브] 정산 소식 ${sawIncentiveMsg ? "있음" : "없음"} · 시즌 ${startSeason} → ${app.currentSeason()} · 종료사유 ${why}`);

    // ── WAL 체크포인트 + 파일 복사 (공용 + 슬롯 본체 둘 다) ─────────
    const savesDir = path.join(tmp, "saves");
    const dbPathShared = path.join(savesDir, "projectb_v2.db");
    const dbPathSlot = path.join(savesDir, `slot3_${SLOT}.db`);
    const outDir = path.join(ROOT, "resource/logs/d-saves");
    fs.mkdirSync(outDir, { recursive: true });

    const outShared = path.join(outDir, `c9-incentive-${SEED}-shared.db`);
    const outSlot = path.join(outDir, `c9-incentive-${SEED}-slot3_${SLOT}.db`);

    const slotExists = fs.existsSync(dbPathSlot);
    console.log(`[C9세이브] 슬롯 파일 존재 ${slotExists} · ${dbPathSlot}`);
    if (fs.existsSync(dbPathShared)) {
      checkpoint(dbPathShared);
      fs.copyFileSync(dbPathShared, outShared);
      console.log(`[C9세이브] 공용 db 복사 완료 → ${outShared}`);
    }
    if (slotExists) {
      checkpoint(dbPathSlot);
      fs.copyFileSync(dbPathSlot, outSlot);
      console.log(`[C9세이브] 슬롯 db 복사 완료 → ${outSlot}`);
    } else {
      why = "슬롯 파일 없음 — slotFilePath 확인 필요";
    }
    console.log(`[C9세이브] 요약: slotId=${SLOT} · 씨앗=${SEED} · 진행=시즌${app.currentSeason()}W${app.currentWeek()} · 인센티브항목수=${probe.contract ? probe.contract.length : 0} · 정산소식id=${JSON.stringify(probe.msgIds)} · 슬롯파일=${outSlot} · 공용파일=${outShared}`);
  } catch (e) {
    why = `예외 ${e && e.stack || e}`;
    console.log(`[C9세이브] 예외 — ${why}`);
  }
  console.log(`[END] ${why}`);
  await headless.cleanup(tmp);
})();
