"use strict";
/**
 * P8-0 — 주간 경로 성능 계측 (Phase 8)
 *
 * 실행: npm run measure:perf -- [--weeks N] [--seed S] [--json]
 *
 * ── 왜 새로 만드는가 ─────────────────────────────────────────────
 * `npm run harness`는 slot.db와 Rust만 돈다. 실제 주간 처리는 TS
 * (`advanceWeek.ts` 2,171줄)를 지나는데 하네스는 거길 안 거친다 —
 * 그래서 지금까지 **주간 성능은 한 번도 측정된 적이 없다.**
 *
 * 이 스크립트는 렌더러 코드를 재현하지 않는다. `App.svelte` → `NewGamePage`
 * → `runAutoAdvance` → `advanceWeek`를 **그대로 import해서** 돌린다
 * (`scripts/perf/perfEntry.ts`).
 *
 * ── 어떻게 헤드리스로 도는가 ─────────────────────────────────────
 * 1. `electron` 모듈을 가짜로 갈아끼우고 **진짜 `apps/desktop/main.cjs`를 로드**한다.
 *    → `ipcMain.handle`로 등록되는 채널이 전부 그대로 살아난다.
 *    ⚠ 채널 표를 여기 두 번째로 적지 않는다. main.cjs가 채널을 추가하면
 *      이 하네스가 자동으로 따라간다 (Phase 7 교훈 #1·#6).
 * 2. 같은 방식으로 **진짜 `preload.cjs`를 로드**해 `window.projectB`를 얻는다.
 *    → 120개 브릿지 메서드 표도 복제하지 않는다.
 * 3. 그 사이 `ipcRenderer.invoke`를 계측 래퍼로 감싼다.
 *
 * ── 무엇을 내는가 ────────────────────────────────────────────────
 *   · 주차별 벽시계 시간 (p50/p95/max)
 *   · IPC 호출 횟수 · 누적 시간 · 페이로드 바이트 (fn 단위)
 *   · IPC 밖에서 태운 시간(= TS 자체 계산)
 *   · slot.db 파일 크기
 *
 * ── 경계 (정직하게) ──────────────────────────────────────────────
 * 시즌 롤오버(오프시즌)는 **여기서 못 잰다.** 그 로직이 usecase가 아니라
 * `features/season-end/ui/SeasonEndModal.svelte` 안에 있어서, 부르려면
 * 컴포넌트 내용을 복제해야 한다 — 그건 정본을 둘로 만드는 짓이다.
 * 필요해지면 usecase로 먼저 빼내고 잰다 (PHASE8_PLAN.md에 기록).
 */

const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");

// ── 인자 ──────────────────────────────────────────────────────────
const argNum = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (Number(process.argv[i + 1]) || dflt) : dflt;
};
const WEEKS = argNum("weeks", 51);
const SEED = argNum("seed", 20260731);
const AS_JSON = process.argv.includes("--json");

// ── 낡은 읽기 감시 (데이터 안전망) ────────────────────────────────
//
// `gameStore.save()`는 npc·season·protagonist를 메모리에서 slot.db로 밀어넣는다.
// 자동 진행이 그 저장을 주 경계까지 미루므로(P8-2a), **미룬 사이에 그 테이블을
// 읽으면 낡은 값이 온다.** `processTradeWindow`가 실제로 그랬다 — 최대 한 주
// 낡은 팀·연봉으로 트레이드를 판정하고 있었다.
//
// 그래서 **기본은 거부**다. 조회성 커맨드는 "gameStore가 안 쓰는 테이블을
// 읽는다"가 증명된 것만 통과시킨다. 새 조회가 생기면 분류될 때까지 실패한다 —
// 목록이 아니라 조건으로 검사한다 (Phase 7 교훈 #6).
const READ_OK = new Map([
  // gameStore.save()가 쓰지 않는 테이블들 — 낡을 수가 없다
  ["repo:getRelationships", "relationship 테이블 — save 대상 아님"],
  ["repo:getStaff",         "staff 테이블 — save 대상 아님"],
  ["repo:getMeta",          "meta는 save가 쓰지만 읽는 값이 슬롯 식별자뿐"],
  ["repo:listSlots",        "슬롯 목록 — 세계 상태 아님"],
  ["league:getTransactions","transactions 테이블 — addTransactions가 직접 쓴다"],
  ["npc:getCareerStats",    "npc_season_stats(projectb_v2.db) — slot.db 아님"],
  ["npc:getRecentGames",    "npc_game_log(projectb_v2.db) — slot.db 아님"],
]);

/** 조회성인가 (쓰기는 낡을 수 없으니 감시 대상이 아니다) */
function isReadCmd(channel, args) {
  if (channel === "repo:call") return /^(get|count|list)/.test(String(args[0] ?? ""));
  return channel === "npc:getByLeague" || channel === "league:getTransactions"
      || channel === "npc:getCareerStats" || channel === "npc:getRecentGames";
}

const staleReads = new Map();

// ── 계측 수집 ─────────────────────────────────────────────────────
const ipcStats = new Map(); // key -> { calls, ms, inBytes, outBytes }
let ipcTotalMs = 0;
let collecting = false;
let watchStale = null;  // () => 저장이 밀려 있는가

function bump(key, ms, inB, outB) {
  let s = ipcStats.get(key);
  if (!s) { s = { calls: 0, ms: 0, inBytes: 0, outBytes: 0 }; ipcStats.set(key, s); }
  s.calls++; s.ms += ms; s.inBytes += inB; s.outBytes += outB;
  ipcTotalMs += ms;
}

const sizeOf = (v) =>
  typeof v === "string" ? Buffer.byteLength(v, "utf8")
  : v === undefined || v === null ? 0
  : Buffer.byteLength(JSON.stringify(v), "utf8");

/**
 * 계측 키. `engine:call`은 채널이 하나뿐이라 채널 단위로 세면 아무것도 안 보인다 —
 * 첫 인자(함수명)까지 붙여야 어느 엔진 호출이 비싼지 드러난다.
 */
function keyOf(channel, args) {
  if (channel === "engine:call" && typeof args[0] === "string") return `engine:${args[0]}`;
  if (channel === "repo:call" && typeof args[0] === "string") return `repo:${args[0]}`;
  return channel;
}

// ── 헤드리스 부팅은 공용 장치에서 ────────────────────────────────
// 가짜 electron·main.cjs/preload.cjs 로드·window 심기는 `perf/headless.cjs`가
// 한다. 회귀(`test-savebatch`)와 **같은 장치**를 써야 둘이 다른 세계를 안 돈다.
const headless = require("./perf/headless.cjs");

headless.setInterceptor(async (channel, args, call) => {
  if (!collecting) return await call();
  if (watchStale && isReadCmd(channel, args)) {
    const key = keyOf(channel, args);
    if (!READ_OK.has(key) && watchStale()) {
      staleReads.set(key, (staleReads.get(key) ?? 0) + 1);
    }
  }
  const t0 = process.hrtime.bigint();
  const out = await call();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  bump(keyOf(channel, args), ms, args.reduce((a, v) => a + sizeOf(v), 0), sizeOf(out));
  return out;
});

// ── 통계 ──────────────────────────────────────────────────────────
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};
const fmtMs = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n.toFixed(1)}ms`);
const fmtB = (n) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)}MB` : n >= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`);

// ── 실행 ──────────────────────────────────────────────────────────
(async () => {
  const { app, tmp, bundleMs } = await headless.boot("perf");

  // ── 부팅 (새 게임 생성) ───────────────────────────────────────
  collecting = true;
  const tBoot0 = process.hrtime.bigint();
  const boot = await app.boot({ slotId: "PERF", worldSeed: SEED, seasonYear: 2026 });
  const bootMs = Number(process.hrtime.bigint() - tBoot0) / 1e6;
  const bootIpcMs = ipcTotalMs;
  const bootIpcStats = new Map([...ipcStats].map(([k, v]) => [k, { ...v }]));

  // 부팅 비용은 주간 비용과 성격이 다르다 — 섞어 재면 둘 다 못 읽는다
  ipcStats.clear();
  ipcTotalMs = 0;

  watchStale = () => app.isSaveDirty();

  // ── 주간 진행 ─────────────────────────────────────────────────
  const weekLog = [];
  const offseasonLog = [];
  let guard = 0;
  let lastWeek = app.currentWeek();
  app.startTimeline();

  while (app.currentWeek() < WEEKS && guard++ < WEEKS * 4) {
    const before = app.currentWeek();
    const t0 = process.hrtime.bigint();
    await app.autoRun();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const after = app.currentWeek();
    process.stderr.write(`  W${before} → W${after}  ${(ms / 1000).toFixed(1)}s\n`);

    if (after - before <= 0) {
      const pend = app.pendingKind();
      // 사용자 입력이 필요한 두 지점은 "누른 셈 치고" 넘긴다 — 그래야 시즌
      // 경계 너머를 잰다. 로직은 usecase 그대로고 여기서 재현하지 않는다
      if (pend === "draftObserve") {
        const t = process.hrtime.bigint();
        await app.skipDraftObserve();
        offseasonLog.push({ kind: "draftSkip", ms: Number(process.hrtime.bigint() - t) / 1e6 });
        continue;
      }
      // 진로 결정 — 여기를 안 넘기면 **프로 단계를 영영 못 잰다.**
      // 승강·FA·트레이드가 전부 프로에서만 도는데 고교 3년에서 멈춰 있었다
      {
        const t = process.hrtime.bigint();
        const done = await app.pushCareerForward();
        if (done) {
          const cms = Number(process.hrtime.bigint() - t) / 1e6;
          offseasonLog.push({ kind: `career:${done}`, ms: cms });
          process.stderr.write(`  [진로] ${done} → ${app.careerStage()}\n`);
          continue;
        }
      }
      if (app.isSeasonEnded()) {
        const t = process.hrtime.bigint();
        const year = await app.seasonRollover();
        const rms = Number(process.hrtime.bigint() - t) / 1e6;
        offseasonLog.push({ kind: "rollover", year, ms: rms });
        process.stderr.write(`  [오프시즌] ${year} 롤오버 ${(rms / 1000).toFixed(1)}s
`);
        continue;
      }
      weekLog.push({ from: before, to: after, ms, blocked: pend ?? app.stopReason() });
      // 그 외 진로 선택 등으로 막혔다 — 계측 목적상 여기서 끝낸다
      break;
    }
    weekLog.push({ from: before, to: after, ms });
    lastWeek = after;
  }

  collecting = false;
  const weekTimings = app.weekTimings();
  const weekMs = weekTimings.map((w) => w.ms);

  // ── 유실 검사 ─────────────────────────────────────────────────
  // 저장을 배치로 미루면(P8-2a) "메모리엔 있는데 디스크엔 없다"가 조용히 생긴다.
  // 자동 진행이 끝난 시점에 둘이 다르면 그게 유실이다 — 벽시계보다 이게 먼저다.
  const memFp = app.fingerprint();
  const dbFp = await app.dbFingerprint("PERF");

  // ── slot.db 크기 ──────────────────────────────────────────────
  const savesDir = path.join(tmp, "saves");
  const dbFiles = fs.existsSync(savesDir)
    ? fs.readdirSync(savesDir).map((f) => ({ f, size: fs.statSync(path.join(savesDir, f)).size }))
    : [];

  // ── 리포트 ────────────────────────────────────────────────────
  const rows = [...ipcStats.entries()]
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => b.ms - a.ms);
  const totalWeekMs = weekMs.reduce((a, b) => a + b, 0);
  const jsMs = totalWeekMs - ipcTotalMs;

  const report = {
    ranAt: new Date().toISOString(),
    config: { weeks: WEEKS, seed: SEED },
    bundleMs,
    boot: {
      ms: bootMs, ipcMs: bootIpcMs,
      npcCount: boot.npcCount, entityCount: boot.entityCount,
      teamId: boot.teamId, worldSeed: boot.worldSeed,
      topIpc: [...bootIpcStats.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)
        .map(([k, v]) => ({ key: k, ...v })),
    },
    weekly: {
      weeksRun: weekMs.length,
      reachedWeek: lastWeek,
      totalMs: totalWeekMs,
      avgMs: weekMs.length ? totalWeekMs / weekMs.length : 0,
      p50: pct(weekMs, 0.5), p95: pct(weekMs, 0.95), max: Math.max(0, ...weekMs),
      ipcMs: ipcTotalMs,
      jsMs,
      ipcCalls: rows.reduce((a, r) => a + r.calls, 0),
      ipcBytes: rows.reduce((a, r) => a + r.inBytes + r.outBytes, 0),
    },
    ipc: rows,
    offseason: offseasonLog,
    weekTimings,
    slowestWeeks: [...weekTimings].sort((a, b) => b.ms - a.ms).slice(0, 8),
    weekLog,
    dbFiles,
    npcCount: app.npcCount(),
    entityCount: app.entityCount(),
    staleReads: [...staleReads.entries()].map(([key, count]) => ({ key, count })),
    fingerprint: memFp,
    dbFingerprint: dbFp,
    lossFree: memFp === dbFp,
    staleFree: staleReads.size === 0,
    missingChannels: [...headless.missing],
  };

  const outPath = path.join(ROOT, "docs/reports/perf_last.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const W = report.weekly;
    console.log(`\n주간 경로 계측 — seed ${SEED}, 목표 W${WEEKS}\n${"─".repeat(72)}`);
    console.log(`부팅(새 게임)   ${fmtMs(bootMs)}  (IPC ${fmtMs(bootIpcMs)} · ${((bootIpcMs / bootMs) * 100).toFixed(0)}%)`);
    console.log(`                NPC ${boot.npcCount} · 엔티티 ${boot.entityCount}`);
    for (const r of report.boot.topIpc.slice(0, 5)) {
      console.log(`                  ${r.key.padEnd(38)} ${String(r.calls).padStart(5)}회 ${fmtMs(r.ms).padStart(9)}`);
    }
    console.log(`${"─".repeat(72)}`);
    console.log(`주간 진행       ${W.weeksRun}주 진행 (W${W.reachedWeek} 도달) · 총 ${fmtMs(W.totalMs)}`);
    console.log(`  주당          평균 ${fmtMs(W.avgMs)} · p50 ${fmtMs(W.p50)} · p95 ${fmtMs(W.p95)} · 최대 ${fmtMs(W.max)}`);
    console.log(`  분해          IPC ${fmtMs(W.ipcMs)} (${((W.ipcMs / W.totalMs) * 100).toFixed(0)}%) · TS ${fmtMs(W.jsMs)} (${((W.jsMs / W.totalMs) * 100).toFixed(0)}%)`);
    console.log(`  느린 주       ${report.slowestWeeks.map((w) => `W${w.week} ${fmtMs(w.ms)}`).join(" · ")}`);
    if (offseasonLog.length) {
      console.log(`  오프시즌      ${offseasonLog.map((o) => `${o.kind}${o.year ? ` ${o.year}` : ""} ${fmtMs(o.ms)}`).join(" · ")}`);
    }
    console.log(`  IPC           ${W.ipcCalls}회 · ${fmtB(W.ipcBytes)} (주당 ${(W.ipcCalls / Math.max(1, W.weeksRun)).toFixed(0)}회 · ${fmtB(W.ipcBytes / Math.max(1, W.weeksRun))})`);
    console.log(`${"─".repeat(72)}`);
    console.log(`IPC 상위 (누적 시간순)`);
    console.log(`  ${"호출".padEnd(40)}${"횟수".padStart(7)}${"시간".padStart(10)}${"%".padStart(6)}${"바이트".padStart(10)}`);
    for (const r of rows.slice(0, 18)) {
      const shareStr = `${((r.ms / W.totalMs) * 100).toFixed(1)}%`;
      console.log(`  ${r.key.slice(0, 39).padEnd(40)}${String(r.calls).padStart(7)}${fmtMs(r.ms).padStart(10)}${shareStr.padStart(6)}${fmtB(r.inBytes + r.outBytes).padStart(10)}`);
    }
    if (rows.length > 18) console.log(`  ... 외 ${rows.length - 18}종`);
    console.log(`${"─".repeat(72)}`);
    console.log(`slot.db         ${dbFiles.map((d) => `${d.f} ${fmtB(d.size)}`).join(" · ") || "(없음)"}`);
    console.log(`메모리 NPC      ${report.npcCount} · 엔티티 ${report.entityCount}`);
    console.log(`유실 검사       ${report.lossFree ? "통과 — 메모리 == slot.db" : "!! 실패 !!"}`);
    console.log(`낡은 읽기       ${report.staleFree ? "없음 — 저장이 밀린 채로 slot.db를 읽는 곳 없음" : "!! 발견 !!"}`);
    for (const r of report.staleReads) console.log(`                ${r.key}  ${r.count}회`);
    if (!report.lossFree) console.log(`                메모리 ${report.fingerprint} / slot.db ${report.dbFingerprint}`);
    console.log(`⚠ IPC 시간은 Promise.all 구간에서 겹쳐 세어진다 (합 > 벽시계 가능).`);
    console.log(`⚠ 이 하네스엔 프로세스 경계가 없다 — 실제 Electron은 구조화 복제만큼 더 느리다.`);
    const blocked = weekLog.find((w) => w.blocked);
    if (blocked) console.log(`정지            W${blocked.to}에서 "${blocked.blocked}" — 여기까지가 무인 진행 범위다`);
    if (headless.missing.size) console.log(`⚠ 미등록 채널   ${[...headless.missing].join(", ")}`);
    console.log(`\n리포트 → docs/reports/perf_last.json  (번들 ${bundleMs}ms)`);
  }

  headless.cleanup(tmp);
  // 유실·낡은 읽기는 성능 수치와 무관하게 실패다 — 조용히 0으로 끝내지 않는다
  process.exit(report.lossFree && report.staleFree ? 0 : 1);
})().catch((e) => {
  console.error("[measure-perf] 실패:", e);
  process.exit(1);
});
