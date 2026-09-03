"use strict";
// D §5 — NPC 덤프 다섯 (A 지정). 새 게임 NPC 전원을 찍고, 나이대별 군필률·계약
// 상한을 확인하고, 한 오프시즌을 지나 careerEvents·OffseasonEvent·거래를 잰다.
//
//   node scripts/probe-npc-dump.cjs
//   PF_SEED=20260802 node scripts/probe-npc-dump.cjs
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260802);
const SLOT = "ND" + SEED;

(async () => {
  const { app, tmp } = await headless.boot("npcdump");
  let why = "완주";
  try {
    await app.boot({ slotId: SLOT, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: false, university: false, independent: true });

    // ── 1) 새 게임 직후 NPC 전원 덤프 ──────────────────────────────
    const dump0 = app.npcDumpProbe();
    console.log(`[NPC덤프] 새 게임 NPC ${dump0.length}명`);

    const active = dump0.filter((n) => n.careerStatus === "active");
    const bucket = (lo, hi) => active.filter((n) => n.age >= lo && (hi == null || n.age <= hi));
    const servedRate = (rows) => {
      const served = rows.filter((n) => n.militaryStatus === "군필" || n.militaryStatus === "면제");
      return rows.length ? (100 * served.length / rows.length).toFixed(1) : "N/A";
    };
    // 🔴 **병역 규칙은 한국인에게만 걸린다** (`roster_gen.past_service_of` —
    //   외국인은 무조건 「면제」다). 전원을 세면 ABL·JBL 로스터가 통째로
    //   군필로 잡혀 기대값을 넘는다 — 2026-09-04 실측 26~28세 87.0% 가
    //   그것이었다(한국인만 세면 60.4%). 규칙과 같은 잣대로 센다.
    const kor = (rows) => rows.filter((n) => (n.nationality ?? "KOR") === "KOR");
    const b2628 = kor(bucket(26, 28));
    const b29p = kor(bucket(29, null));
    const b33p = bucket(33, null);
    const b36p = bucket(36, null);
    console.log(`[NPC덤프-군필] 26~28세 한국인 ${b2628.length}명 군필률 ${servedRate(b2628)}% (기대 60%)`);
    console.log(`[NPC덤프-군필] 29세+ 한국인 ${b29p.length}명 군필률 ${servedRate(b29p)}% (기대 100%)`);

    const contractOver = (rows, cap) => rows.filter((n) => n.contractYears != null && n.contractYears > cap);
    const withContract = (rows) => rows.filter((n) => n.contractYears != null);
    const c33 = withContract(b33p);
    const c36 = withContract(b36p);
    console.log(`[NPC덤프-계약] 33세+ 계약보유 ${c33.length}명 · ≤2 위반 ${contractOver(c33, 2).length}건 (기대 0)`);
    console.log(`[NPC덤프-계약] 36세+ 계약보유 ${c36.length}명 · ≤1 위반 ${contractOver(c36, 1).length}건 (기대 0)`);

    // ── careerHistory 마지막 팀 대 현재 소속 일치율 (새 게임 시점) ──
    const withHist = active.filter((n) => n.historyLen > 0);
    const match0 = withHist.filter((n) => n.lastHistoryTeam === n.currentTeam);
    console.log(`[NPC덤프-이력] 새 게임 이력있음 ${withHist.length}명 · teamId 일치 ${match0.length} (${withHist.length ? (100 * match0.length / withHist.length).toFixed(1) : "N/A"}%)`);

    // ── transactions (새 게임 시점 — 세계 생성 배경 거래) ──────────
    const tx0 = await app.transactionsTally(SLOT);
    console.log(`[NPC덤프-거래] 새 게임 시점 ${JSON.stringify(tx0)}`);

    // ── 2) 한 오프시즌을 지난다 (probe-hs-closer 와 같은 루프) ─────
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < 52 * 40 && app.currentSeason() < start + 1) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      if (app.currentWeek() > w0) continue;
      const kind = app.pendingKind();
      if (kind === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushPendingForward()) continue;
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0} pending=${kind}`; break; }
    }
    console.log(`[NPC덤프] 오프시즌 통과 — 시즌 ${start} → ${app.currentSeason()} · 종료사유 ${why}`);

    // ── 3) 오프시즌 뒤 재덤프 + careerEvents · OffseasonEvent · transactions ──
    const dump1 = app.npcDumpProbe();
    const active1 = dump1.filter((n) => n.careerStatus === "active");
    const withHist1 = active1.filter((n) => n.historyLen > 0);
    const match1 = withHist1.filter((n) => n.lastHistoryTeam === n.currentTeam);
    console.log(`[NPC덤프-이력] 오프시즌 뒤 이력있음 ${withHist1.length}명 · teamId 일치 ${match1.length} (${withHist1.length ? (100 * match1.length / withHist1.length).toFixed(1) : "N/A"}%)`);
    if (match1.length < withHist1.length) {
      const mism = withHist1.filter((n) => n.lastHistoryTeam !== n.currentTeam).slice(0, 10);
      console.log(`[NPC덤프-이력-불일치] 표본 ${mism.map((n) => `${n.npcId}(hist=${n.lastHistoryTeam}/now=${n.currentTeam})`).join(" · ")}`);
    }

    const evTally = app.careerEventTally();
    console.log(`[NPC덤프-careerEvents] ${JSON.stringify(evTally)}`);

    const osTally = app.offseasonEventTally();
    console.log(`[NPC덤프-offseasonEvent] ${JSON.stringify(osTally)}`);

    const tx1 = await app.transactionsTally(SLOT);
    console.log(`[NPC덤프-거래] 오프시즌 뒤 ${JSON.stringify(tx1)}`);

    // 파일로도 남긴다 — 큰 배열은 로그에서 잘리기 쉽다
    const outDir = path.join(ROOT, "resource/logs/d-regress");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `npcdump-${SEED}-new.json`), JSON.stringify(dump0, null, 1));
    fs.writeFileSync(path.join(outDir, `npcdump-${SEED}-post-offseason.json`), JSON.stringify(dump1, null, 1));
  } catch (e) {
    why = `예외 ${e && e.stack || e}`;
    console.log(`[NPC덤프] 예외 — ${why}`);
  }
  console.log(`[END] ${why}`);
  await headless.cleanup(tmp);
})();
