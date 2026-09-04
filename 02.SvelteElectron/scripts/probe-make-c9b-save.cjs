"use strict";
// D → C 세이브 산출 — 단위 9(인센티브 정산 화면) 눈확인용 · c9-incentive-*의 후속.
//
// 🔴 **2026-09-04 상태 — 미완주.** `overrideContractIncentives`가 처음엔
//   `p.contract`를 바꿨는데 이 시점엔 그게 비어 있고(renewal은
//   `pendingNextContract`에 있다 — 아래 주석) 실제로 안 먹었다. 그건 고쳤고
//   (`overrideContractIncentives`가 이제 `pendingNextContract`도 같이 바꾼다·
//   단독 실행으로 검증함 — before 문턱50/20 → after 12로 바뀐 것 확인),
//   **문턱을 12로 낮춘 뒤의 전 구간 완주(달성 확인)는 아직 못 봤다** — 사용자가
//   "포장본으로 직접 테스트"를 택해 헤드리스를 멈췄다. 다음에 이어받으면:
//   `cross-env ELECTRON_RUN_AS_NODE=1 electron scripts/probe-make-c9b-save.cjs`
//   그대로 다시 돌리면 된다(코드는 고쳐져 있다). 시즌당 세계 시뮬 비용이 커서
//   5시즌 완주까지 30~40분 걸릴 수 있다 — 배경으로 걸고 주기적으로 로그를 본다.
//
// ⚠ **c9(SP)는 "미달"만 났다** (2026-09-04 D 1차 실측 — 5게임/26.2이닝, 문턱 25게임/150이닝).
//   원인: `fastForwardToProIncentiveContract`가 강제로 만든 KBL 팀 로테이션에서
//   주인공이 "5선발"로 밀려 그 시즌 내내 거의 등판을 못 받았다.
// ⚠ **RP(forceRole)만으로도 부족했다** (2026-09-04 D 2차 실측 — 4시즌 실등판
//   24·3·3·25, 홀드 0~1). 불펜 등판이 "주당" 확률 판정(셋업맨 45%)이라
//   시즌 상한 자체가 낮고, 자동 선택 인센티브(게임50+홀드20)의 세 번째 후보
//   era 는 총액상한(연봉 25%) 때문에 자동으로는 절대 안 뽑힌다(§ perfEntry.ts
//   `overrideContractIncentives` 주석 참고). 그래서 **문턱도 같이 낮춘다** —
//   HANDOFF_OP_TO_D.md 가 준 두 대안("문턱을 낮추거나 등판 많은 보직으로")을
//   같이 쓴다: RP(등판 많은 보직) + 게임 문턱 12(실측 최댓값 24~25의 절반 아래
//   여유). 밸런스 파일(`generation_rules.json`)은 안 건드린다 — 이 세이브
//   한 판의 계약 객체만 `overrideContractIncentives`로 바꾼다.
//
// ⚠ `context:"renewal"` 계약은 즉시 적용이 아니다 — `setPendingNextContract`로
//   쌓였다가 다음 시즌 시작(W52 경계)에서 `p.contract`로 바뀐다.
// ⚠ **저장 파일은 projectb_v2.db 가 아니다.** 슬롯 본체는
//   `saves/slot3_<slotId>.db`(R3a v3 스키마) — 둘 다 복사한다.
// ⚠ journal_mode=WAL — 복사 전 `wal_checkpoint(TRUNCATE)`로 합친다.
//
//   cross-env ELECTRON_RUN_AS_NODE=1 electron scripts/probe-make-c9b-save.cjs
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
    // 자동 선택(게임50+홀드20)은 실전에서 거의 안 채워진다(스크립트 머리 주석) —
    // 문턱을 실측 기반으로 낮춘다. 밸런스 파일은 안 건드린다(이 계약 객체만).
    await app.overrideContractIncentives([{ kind: "games", threshold: 12, bonus: 1400 }]);
    console.log(`[C9B세이브] 인센티브 문턱 낮춤 → games≥12 (실측 최댓값 24~25 대비 여유)`);

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
