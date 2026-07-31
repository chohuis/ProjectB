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
const os = require("node:os");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "..");

// ── 인자 ──────────────────────────────────────────────────────────
const argNum = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (Number(process.argv[i + 1]) || dflt) : dflt;
};
const WEEKS = argNum("weeks", 51);
const SEED = argNum("seed", 20260731);
const AS_JSON = process.argv.includes("--json");

// ── 계측 수집 ─────────────────────────────────────────────────────
const ipcStats = new Map(); // key -> { calls, ms, inBytes, outBytes }
let ipcTotalMs = 0;
let collecting = false;

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

// ── 가짜 electron ────────────────────────────────────────────────
const handlers = new Map();
const missing = new Set();

const noop = () => {};
const fakeWebContents = {
  on: noop, send: noop, setWindowOpenHandler: noop,
  openDevTools: noop, closeDevTools: noop,
};
class FakeBrowserWindow {
  constructor() { this.webContents = fakeWebContents; }
  loadURL() {} isDestroyed() { return true; }
  static getAllWindows() { return []; }
}

let USER_DATA = "";

const fakeElectron = {
  app: {
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    getPath: (k) => (k === "userData" ? USER_DATA : USER_DATA),
    on: noop,
    quit: noop,
  },
  BrowserWindow: FakeBrowserWindow,
  ipcMain: {
    handle(channel, fn) { handlers.set(channel, fn); },
    removeHandler(channel) { handlers.delete(channel); },
  },
  ipcRenderer: {
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) {
        // 조건으로 검사한다 — 미등록 채널을 조용히 넘기면 그 경로가
        // 계측에서 통째로 빠진 줄 모른다 (Phase 7 교훈 #6)
        missing.add(channel);
        throw new Error(`[measure-perf] 미등록 IPC 채널: ${channel}`);
      }
      if (!collecting) return await fn({}, ...args);
      const t0 = process.hrtime.bigint();
      const out = await fn({}, ...args);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      bump(keyOf(channel, args), ms, args.reduce((a, v) => a + sizeOf(v), 0), sizeOf(out));
      return out;
    },
    on: noop,
  },
  contextBridge: {
    exposeInMainWorld(name, api) { globalThis[`__bridge_${name}`] = api; },
  },
  session: { defaultSession: { webRequest: { onHeadersReceived: noop } } },
  protocol: { registerSchemesAsPrivileged: noop, handle: noop },
  net: { fetch: () => { throw new Error("net.fetch는 계측 경로에 없다"); } },
};

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return fakeElectron;
  return origLoad.call(this, request, ...rest);
};

// ── main.cjs / preload.cjs 로드 (진짜 파일) ───────────────────────
async function bootIpc(tmpDir) {
  USER_DATA = tmpDir;
  fs.mkdirSync(path.join(tmpDir, "saves"), { recursive: true });
  require(path.join(ROOT, "apps/desktop/main.cjs"));
  // app.whenReady().then(...) 안에서 등록된다 — 마이크로태스크를 흘려보낸다
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  if (handlers.size === 0) throw new Error("[measure-perf] main.cjs가 IPC를 하나도 등록하지 않았다");

  require(path.join(ROOT, "apps/desktop/preload.cjs"));
  const bridge = globalThis.__bridge_projectB;
  if (!bridge?.engine) throw new Error("[measure-perf] preload.cjs가 projectB를 노출하지 않았다");
  return bridge;
}

// ── 번들 ─────────────────────────────────────────────────────────
function bundleEntry(outFile) {
  const esbuild = require("esbuild");
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, "perf/perfEntry.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: outFile,
    // svelte/store는 순수 JS라 노드에서 그대로 돈다
    logLevel: "warning",
  });
}

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-"));
  const bundleFile = path.join(tmp, "perfEntry.cjs");

  const tBundle0 = Date.now();
  bundleEntry(bundleFile);
  const bundleMs = Date.now() - tBundle0;

  const bridge = await bootIpc(tmp);
  globalThis.window = globalThis;
  globalThis.window.projectB = bridge;
  globalThis.localStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  };

  const app = require(bundleFile);

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

  // ── 주간 진행 ─────────────────────────────────────────────────
  const weekLog = [];
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
      weekLog.push({ from: before, to: after, ms, blocked: pend ?? app.stopReason() });
      // 진로 선택 등으로 막혔다 — 계측 목적상 여기서 끝낸다 (우회하면 실제 경로가 아니다)
      break;
    }
    weekLog.push({ from: before, to: after, ms });
    lastWeek = after;
  }

  collecting = false;
  const weekTimings = app.weekTimings();
  const weekMs = weekTimings.map((w) => w.ms);

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
    weekTimings,
    slowestWeeks: [...weekTimings].sort((a, b) => b.ms - a.ms).slice(0, 8),
    weekLog,
    dbFiles,
    npcCount: app.npcCount(),
    entityCount: app.entityCount(),
    fingerprint: app.fingerprint(),
    missingChannels: [...missing],
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
    console.log(`세계 지문       ${report.fingerprint}   ← 최적화 전후로 같아야 한다`);
    console.log(`⚠ IPC 시간은 Promise.all 구간에서 겹쳐 세어진다 (합 > 벽시계 가능).`);
    console.log(`⚠ 이 하네스엔 프로세스 경계가 없다 — 실제 Electron은 구조화 복제만큼 더 느리다.`);
    const blocked = weekLog.find((w) => w.blocked);
    if (blocked) console.log(`정지            W${blocked.to}에서 "${blocked.blocked}" — 여기까지가 무인 진행 범위다`);
    if (missing.size) console.log(`⚠ 미등록 채널   ${[...missing].join(", ")}`);
    console.log(`\n리포트 → docs/reports/perf_last.json  (번들 ${bundleMs}ms)`);
  }

  // better-sqlite3 핸들이 열린 채라 Windows에서 지워지지 않는다 — 실패해도 무시한다
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp는 OS가 치운다 */ }
  process.exit(0);
})().catch((e) => {
  console.error("[measure-perf] 실패:", e);
  process.exit(1);
});
