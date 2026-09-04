"use strict";
// D → C 세이브 산출 — 묶음 3·4(대회·연감·2군·FA보상) 눈확인용.
//
// 고교 3년 완주(대회 수상 msg-tour-award-·내 대회 msg-tour-my- · 연감
// msg-season-hs-sync-) → 드래프트 → 프로 2군 시즌 끝(msg-farm-champion-) →
// FA 보상(msg-facomp-)까지 자연 진행으로 닿는 판을 만든다. 전부 강제 주입
// 없이 `probe-paths.cjs`와 같은 "pro" 진로 정책(고교→드래프트→프로)으로
// autoRun만 돌려 자연 발생을 기다린다 — msg-farm-champion-·msg-facomp-는
// 리그 전체 소식이라 주인공 개인 성적과 무관하게 해마다 난다.
//
//   node scripts/probe-make-c58-save.cjs
//   PF_YEARS=25 PF_SEED=20260802 node scripts/probe-make-c58-save.cjs
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260802);
const YEARS = Number(process.env.PF_YEARS || 25);
const SLOT = "C58B34";

const NEEDED = {
  "고교 대회 수상": "msg-tour-award-",
  "고교 내 대회": "msg-tour-my-",
  "고교 연감 동기화": "msg-season-hs-sync-",
  "프로 2군 시즌 끝": "msg-farm-champion-",
  "FA 보상": "msg-facomp-",
};

function checkpoint(dbPath) {
  try {
    const Database = require("better-sqlite3");
    const d = new Database(dbPath);
    d.pragma("wal_checkpoint(TRUNCATE)");
    d.close();
    return true;
  } catch (e) {
    console.log(`[C58세이브] checkpoint 실패 ${dbPath} — ${e.message}`);
    return false;
  }
}

(async () => {
  const { app, tmp } = await headless.boot("c58save");
  let why = "완주";
  const hit = {};
  for (const k of Object.keys(NEEDED)) hit[k] = null; // null = 아직 · "YYYYWnn" = 처음 본 시점

  function scan(tag) {
    const box = app.mailboxRaw();
    for (const [label, prefix] of Object.entries(NEEDED)) {
      if (hit[label]) continue;
      if (box.some((m) => m.id.startsWith(prefix))) hit[label] = tag;
    }
  }

  try {
    await app.boot({ slotId: SLOT, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: false });
    console.log(`[C58세이브] 부팅 완료 · 시즌 ${app.currentSeason()} W${app.currentWeek()}`);

    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired && app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      const tag = `${app.currentSeason()}W${app.currentWeek()}`;
      scan(tag);
      if (Object.values(hit).every((v) => v !== null)) { why = "전부 도달"; break; }
      if (app.currentWeek() > w0) continue;
      const kind = app.pendingKind();
      if (kind === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushPendingForward()) continue;
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0} pending=${kind}`; break; }
    }
    scan(`${app.currentSeason()}W${app.currentWeek()}-종료`);
    console.log(`[C58세이브] 도달 현황 ${JSON.stringify(hit)}`);
    console.log(`[C58세이브] 진행 ${start} → ${app.currentSeason()} W${app.currentWeek()} · 종료사유 ${why}`);
    const missing = Object.entries(hit).filter(([, v]) => v === null).map(([k]) => k);
    if (missing.length > 0) console.log(`[C58세이브] 못 닿은 소식: ${missing.join(" · ")}`);

    await app.forceSave();

    // ── WAL 체크포인트 + 파일 복사 (공용 + 슬롯 본체 둘 다) ─────────
    const savesDir = path.join(tmp, "saves");
    const dbPathShared = path.join(savesDir, "projectb_v2.db");
    const dbPathSlot = path.join(savesDir, `slot3_${SLOT}.db`);
    const outDir = path.join(ROOT, "resource/logs/d-saves");
    fs.mkdirSync(outDir, { recursive: true });

    const outShared = path.join(outDir, `c58-bundle34-${SEED}-shared.db`);
    const outSlot = path.join(outDir, `c58-bundle34-${SEED}-slot3_${SLOT}.db`);

    const slotExists = fs.existsSync(dbPathSlot);
    console.log(`[C58세이브] 슬롯 파일 존재 ${slotExists} · ${dbPathSlot}`);
    if (fs.existsSync(dbPathShared)) {
      checkpoint(dbPathShared);
      fs.copyFileSync(dbPathShared, outShared);
      console.log(`[C58세이브] 공용 db 복사 완료 → ${outShared}`);
    }
    if (slotExists) {
      checkpoint(dbPathSlot);
      fs.copyFileSync(dbPathSlot, outSlot);
      console.log(`[C58세이브] 슬롯 db 복사 완료 → ${outSlot}`);
    } else {
      why = "슬롯 파일 없음 — slotFilePath 확인 필요";
    }
    console.log(`[C58세이브] 요약: slotId=${SLOT} · 씨앗=${SEED} · 진행=시즌${app.currentSeason()}W${app.currentWeek()} · 도달=${JSON.stringify(hit)} · 슬롯파일=${outSlot} · 공용파일=${outShared}`);
  } catch (e) {
    why = `예외 ${e && e.stack || e}`;
    console.log(`[C58세이브] 예외 — ${why}`);
  }
  console.log(`[END] ${why}`);
  await headless.cleanup(tmp);
})();
