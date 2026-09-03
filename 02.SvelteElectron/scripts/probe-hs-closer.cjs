"use strict";
// 1.1 A② §6-1-5 — 고교 한 시즌에서 주인공 보직 정책(PB_ROLE_CHOICE)별 등판 수·이닝·투구수를 잰다.
//
// 마무리(cp)면 「마무리 시즌 등판 수」가 이 기획의 잣대다. 선발(sp)이면 선발 평균 이닝·투구수.
//
// ⚠ **등판 하나하나를 찍는다.** 총량(등판당 평균 이닝)만 찍으면 "2.7이닝"이 어디서 오는지 못 가린다 —
//   일찍 들어간 것인지, 안 내려온 것인지, 연장인지가 전부 같은 평균으로 뭉개진다.
//   `match:simulateToEntry` 응답의 진입 이닝과 `match:autoFinishFromEntry` 의 아웃 수를 짝지어 본다.
//
// 환경변수
//   PF_SEED          씨앗 (기본 20260802)
//   PB_ROLE_CHOICE   보직 정책 sp | rp | cp (기본 cp)
//   PB_CFG           경기 옵션 단계 file(규칙 파일 그대로 · 기본) | base | limit | factor
//   PB_DUMP          1 이면 등판을 한 줄씩 전부 찍는다
const path = require("node:path");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260802);
const POLICY = process.env.PB_ROLE_CHOICE || "cp";
const CFG = process.env.PB_CFG || "file";
globalThis.__PB_ROLE_CHOICE = POLICY;

(async () => {
  const { app, tmp } = await headless.boot("hsc");
  let entryCalls = 0;
  let roleSeen = null, gates = 0, restGuards = 0, closerGateN = 0, restBlocked = 0;
  // 등판 한 건 = { 진입 이닝·half·점수차, 아웃, 투구수 }
  const apps = [];
  let pendingEntry = null, reqRole = "", reqWeek = 0;
  headless.setInterceptor(async (channel, args, call) => {
    if (channel === "match:simulateToEntry") {
      entryCalls++;
      const req = args && args[0] ? args[0] : {};
      // §6-1-5 단계 — 규칙 파일은 안 건드리고 요청만 덮는다 (한 번에 하나씩)
      //   base: 105 · 계수 1 · 문 없음   limit: 95 · 1 · 없음   factor: 95 · 0.8 · 없음   file: 파일값 그대로
      if (CFG === "base") { req.pitchLimitOverride = 105; req.starterOutsFactor = 1; delete req.closerGate; }
      else if (CFG === "limit") { req.pitchLimitOverride = 95; req.starterOutsFactor = 1; delete req.closerGate; }
      else if (CFG === "factor") { req.pitchLimitOverride = 95; req.starterOutsFactor = 0.8; delete req.closerGate; }
      if (req.role === "CP") roleSeen = "CP"; else if (req.role && !roleSeen) roleSeen = req.role;
      if (req.closerGate) closerGateN++;
      if (req.restGuard) restGuards++;
      if (req.pitchLimitOverride) gates++;
      // 🔴 **보직을 경기마다 적는다.** 보직이 정해지기 전 경기(선발 등판)가 섞이면
      //   "마무리 등판당 2.7이닝" 같은 값이 나온다 — 엔진이 아니라 평균이 만든 숫자다.
      reqRole = req.role ?? "";
      reqWeek = app.currentWeek ? app.currentWeek() : 0;
      pendingEntry = null;
    }
    const out = await call();
    if (channel === "match:simulateToEntry") {
      try {
        const j = JSON.parse(out);
        if (j.entryReached) {
          pendingEntry = { inning: j.inning ?? 0, half: j.half ?? "", home: j.homeScore ?? 0, away: j.awayScore ?? 0 };
        } else {
          // 진입 자체가 없었다 — 의무 휴식으로 막혔거나 문이 안 열렸다
          restBlocked++;
        }
      } catch { /* 형식이 다르면 세지 않는다 */ }
    }
    if (channel === "match:autoFinishFromEntry") {
      try {
        const j = JSON.parse(out);
        if (typeof j.pitchCount === "number" && j.pitchCount > 0) {
          apps.push({
            pitches: j.pitchCount,
            outs: j.outsRecorded ?? 0,
            k: j.strikeouts ?? 0,
            er: j.earnedRuns ?? 0,
            inning: pendingEntry ? pendingEntry.inning : 0,
            half: pendingEntry ? pendingEntry.half : "",
            role: reqRole, week: reqWeek,
          });
        }
      } catch { /* 형식이 다르면 세지 않는다 */ }
      pendingEntry = null;
    }
    return out;
  });
  let why = "완주";
  try {
    await app.boot({ slotId: "HC", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: false, university: true, independent: false });
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
  } catch (e) { why = `예외 ${e && e.stack || e}`; }

  const n = apps.length;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const pitches = apps.map((a) => a.pitches);
  const outs = apps.map((a) => a.outs);
  const ipTotal = (sum(outs) / 3).toFixed(1);
  const st = app.protagonistStatProbe ? app.protagonistStatProbe() : {};
  const hero = app.heroProbe ? app.heroProbe() : {};
  console.log(`[고교보직] 정책 ${POLICY} · 씨앗 ${SEED} · cfg ${CFG} · 경기호출 ${entryCalls} · 등판 ${n} · 미진입 ${restBlocked} · 이닝합 ${ipTotal} · 등판당이닝 ${n ? (sum(outs) / 3 / n).toFixed(2) : 0} · 투구 평균 ${n ? Math.round(sum(pitches) / n) : 0} 최대 ${n ? Math.max(...pitches) : 0} · 옵션(상한 ${gates} · 마무리문 ${closerGateN} · 휴식재료 ${restGuards}) · role ${roleSeen}`);

  // ── 진입 이닝 분포 · 아웃 분포 — "2.7이닝"의 출처를 가른다 ──────────────
  if (n > 0) {
    const byInning = new Map();
    for (const a of apps) byInning.set(a.inning, (byInning.get(a.inning) ?? 0) + 1);
    const inningStr = [...byInning.entries()].sort((x, y) => x[0] - y[0]).map(([i, c]) => `${i}회×${c}`).join(" ");
    const over6 = apps.filter((a) => a.outs > 6).length;
    console.log(`[고교보직] 진입이닝 ${inningStr} · 아웃 최소 ${Math.min(...outs)} 최대 ${Math.max(...outs)} · 6아웃 초과 ${over6}건`);
    // 🔴 **보직별로 가른다.** 섞어 평균 내면 보직이 정해지기 전 선발 등판(1회 진입·17아웃)이
    //   마무리 평균을 통째로 끌어올린다 — 엔진 결함처럼 보였던 값의 정체다.
    for (const r of ["SP", "RP", "CP", ""]) {
      const g = apps.filter((a) => (a.role ?? "") === r);
      if (g.length === 0) continue;
      const go = g.map((a) => a.outs), gp = g.map((a) => a.pitches);
      console.log(`[고교보직-보직] ${r || "미지정"} · 등판 ${g.length} · 이닝합 ${(sum(go) / 3).toFixed(1)} · 등판당이닝 ${(sum(go) / 3 / g.length).toFixed(2)} · 투구 평균 ${Math.round(sum(gp) / g.length)} 최대 ${Math.max(...gp)}`);
    }
    if (process.env.PB_DUMP === "1") {
      for (const a of apps) console.log(`  등판 W${a.week} ${a.role || "미지정"} ${a.inning}회${a.half} 진입 · 아웃 ${a.outs} · 투구 ${a.pitches} · K ${a.k} · 자책 ${a.er}`);
    }
  }
  console.log(`[고교보직] 시즌기록 ${JSON.stringify(st)} · 보직 ${JSON.stringify(hero.position ?? null)}`);
  console.log(`[END] ${why}`);
  await headless.cleanup(tmp);
})();
