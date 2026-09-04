"use strict";
// D → C 세이브 산출 — 단위 9(인센티브 정산 화면) 눈확인용 · c9-incentive-*의 후속.
//
// ⚠ **c9(SP)는 "미달"만 났다** (2026-09-04 D 실측 — 5게임/26.2이닝, 문턱 25게임/150이닝).
//   원인: `fastForwardToProIncentiveContract`가 강제로 만든 KBL 팀 로테이션에서
//   주인공이 "5선발"로 밀려 그 시즌 내내 거의 등판을 못 받았다(선발 등판 확률이
//   팀 내 순위 기반이라 순위가 낮으면 낮다 — `ROLE_ASSIGNMENT_2026-09-03.md`).
//   RP는 순위가 아니라 OVR+감독관계bias 티어라 강제 OVR 85면 항상 "셋업맨"
//   (경기당 등판확률 45%)로 떨어져 훨씬 안정적으로 문턱을 넘는다.
// 이 스크립트는 `forceRole="RP"`로 그 함정을 피해 "최소 1건 달성" 세이브를 만든다.
//
// ⚠ `context:"renewal"` 계약은 즉시 적용이 아니다 — `setPendingNextContract`로
//   쌓였다가 다음 시즌 시작(W52 경계)에서 `p.contract`로 바뀐다.
// ⚠ **저장 파일은 projectb_v2.db 가 아니다.** 슬롯 본체는
//   `saves/slot3_<slotId>.db`(R3a v3 스키마) — 둘 다 복사한다.
// ⚠ journal_mode=WAL — 복사 전 `wal_checkpoint(TRUNCATE)`로 합친다.
//
//   node scripts/probe-make-c9b-save.cjs
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260802);
const SLOT = "C9BMET";
const MAX_SEASONS = 5; // 인센티브 달성이 확률적이라 몇 시즌 여유를 둔다

function checkpoint(dbPath) {
  try {
    const Database = require("better-sqlite3");
    const d = new Database(dbPath);
    d.pragma("wal_checkpoint(TRUNCATE)");
    d.close();
    return true;
  } catch (e) {
    console.log(`[C9B세이브] checkpoint 실패 ${dbPath} — ${e.message}`);
    return false;
  }
}

(async () => {
  const { app, tmp } = await headless.boot("c9bsave");
  let why = "완주";
  try {
    await app.boot({ slotId: SLOT, worldSeed: SEED, seasonYear: 2026 });
    console.log(`[C9B세이브] 부팅 완료 · 시즌 ${app.currentSeason()} W${app.currentWeek()}`);

    const ff = await app.fastForwardToProIncentiveContract("RP");
    console.log(`[C9B세이브] 강제전환(RP·재계약 서명) 결과 ${JSON.stringify(ff)}`);

    const startSeason = app.currentSeason();
    let guard = 0;
    let met = false;
    let lastProbe = null;
    while (guard++ < 52 * MAX_SEASONS * 2 && app.currentSeason() < startSeason + MAX_SEASONS && !met) {
      if (app.retired && app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      if (app.currentWeek() > w0) {
        const probe = app.incentiveProbe();
        const msgs = (probe.msgIds || []);
        if (msgs.length > 0) {
          const lastBody = (probe.lastBody || []).join("\n");
          if (lastBody.includes("달성 (") && lastBody.includes("합계 +")) {
            met = true;
            lastProbe = probe;
            console.log(`[C9B세이브] 달성 확인 · 시즌${app.currentSeason()}W${app.currentWeek()}`);
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
    const probe = lastProbe || app.incentiveProbe();
    console.log(`[C9B세이브] 시즌 진행 뒤 ${JSON.stringify(probe)}`);
    console.log(`[C9B세이브] 달성여부 ${met ? "있음" : "없음"} · 시즌 ${startSeason} → ${app.currentSeason()} · 종료사유 ${why}`);
    if (!met) why = `달성 못함(${MAX_SEASONS}시즌 안) — ${why}`;

    // ── WAL 체크포인트 + 파일 복사 (공용 + 슬롯 본체 둘 다) ─────────
    const savesDir = path.join(tmp, "saves");
    const dbPathShared = path.join(savesDir, "projectb_v2.db");
    const dbPathSlot = path.join(savesDir, `slot3_${SLOT}.db`);
    const outDir = path.join(ROOT, "resource/logs/d-saves");
    fs.mkdirSync(outDir, { recursive: true });

    const outShared = path.join(outDir, `c9b-incentive-met-${SEED}-shared.db`);
    const outSlot = path.join(outDir, `c9b-incentive-met-${SEED}-slot3_${SLOT}.db`);

    const slotExists = fs.existsSync(dbPathSlot);
    console.log(`[C9B세이브] 슬롯 파일 존재 ${slotExists} · ${dbPathSlot}`);
    if (fs.existsSync(dbPathShared)) {
      checkpoint(dbPathShared);
      fs.copyFileSync(dbPathShared, outShared);
      console.log(`[C9B세이브] 공용 db 복사 완료 → ${outShared}`);
    }
    if (slotExists) {
      checkpoint(dbPathSlot);
      fs.copyFileSync(dbPathSlot, outSlot);
      console.log(`[C9B세이브] 슬롯 db 복사 완료 → ${outSlot}`);
    } else {
      why = "슬롯 파일 없음 — slotFilePath 확인 필요";
    }
    console.log(`[C9B세이브] 요약: slotId=${SLOT} · 씨앗=${SEED} · 진행=시즌${app.currentSeason()}W${app.currentWeek()} · 달성=${met} · 정산소식id=${JSON.stringify(probe.msgIds)} · 슬롯파일=${outSlot} · 공용파일=${outShared}`);
  } catch (e) {
    why = `예외 ${e && e.stack || e}`;
    console.log(`[C9B세이브] 예외 — ${why}`);
  }
  console.log(`[END] ${why}`);
  await headless.cleanup(tmp);
})();
