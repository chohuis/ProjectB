"use strict";
/**
 * 시즌별 메모리·IPC 추이 — `npm run measure:memory`
 *
 * ## 왜 필요한가
 *
 * `measure:perf`가 내는 **IPC 3.05GB**는 "점유"가 아니라 **한 시즌 동안 오간
 * 바이트의 합**이다. 그런데 정작 걱정되는 건 두 가지고 **둘 다 안 재봤다**:
 *
 *   ① 주당 전송량이 **시즌이 갈수록 커지는가** — 쌓이는 표(`npc_game_log`
 *      12만 행)가 페이로드에 실리면 커진다. 커지면 후반 시즌이 느려진다
 *   ② 프로세스가 실제로 **몇 GB를 쥐고 있는가** — 이건 rss/heapUsed다
 *
 * 누적량이 크다고 무거운 게 아니다. **한 번에 얼마를 쥐느냐**와
 * **그게 시즌이 갈수록 커지느냐**가 무거움을 만든다. 그래서 시즌 경계마다
 * 둘을 같이 찍어 **기울기**를 본다 — 평평하면 몇 시즌을 가도 안 무거워진다.
 *
 * ⚠ **헤드리스엔 프로세스 경계가 없다.** 실제 Electron은 renderer↔main이
 * 갈려 있어 직렬화가 한 번 더 든다. 여기 숫자는 **하한**이다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 6);
const SEED = arg("seed", 20260731);

// ── IPC 계측 (measure-perf와 같은 방식) ──────────────────────────
let ipcBytes = 0, ipcCalls = 0;
let collecting = false;
const sizeOf = (v) =>
  typeof v === "string" ? Buffer.byteLength(v, "utf8")
  : v === undefined || v === null ? 0
  : Buffer.byteLength(JSON.stringify(v), "utf8");

// 어느 채널이 무거운지도 같이 본다 — 총량만 보면 원인을 못 가린다
const perKey = new Map();
function keyOf(channel, args) {
  if (channel === "engine:call" && typeof args[0] === "string") return `engine:${args[0]}`;
  if (channel === "repo:call" && typeof args[0] === "string") return `repo:${args[0]}`;
  return channel;
}

headless.setInterceptor(async (channel, args, call) => {
  if (!collecting) return await call();
  const out = await call();
  const b = args.reduce((a, v) => a + sizeOf(v), 0) + sizeOf(out);
  ipcBytes += b; ipcCalls++;
  const k = keyOf(channel, args);
  const s = perKey.get(k) || { calls: 0, bytes: 0 };
  s.calls++; s.bytes += b; perKey.set(k, s);
  return out;
});

const MB = (b) => (b / 1048576).toFixed(1);
const GB = (b) => (b / 1073741824).toFixed(2);

async function main() {
  const { app, tmp } = await headless.boot("memory");
  try {
    collecting = true;
    await app.boot({ slotId: "MEM", worldSeed: SEED, seasonYear: 2026 });

    const startSeason = app.currentSeason();
    console.log(`[메모리] 씨앗 ${SEED} · ${SEASONS}시즌 · 부팅 후 rss ${MB(process.memoryUsage().rss)}MB`);
    console.log("");
    console.log("  시즌    주수   IPC(시즌)   주당IPC     호출     rss      heapUsed");

    let prevBytes = 0, prevCalls = 0;
    let weeksThis = 0;
    let seen = startSeason;
    let guard = 0;
    const rows = [];

    const record = () => {
      const m = process.memoryUsage();
      const dB = ipcBytes - prevBytes, dC = ipcCalls - prevCalls;
      const perWeek = weeksThis > 0 ? dB / weeksThis : 0;
      rows.push({ season: seen, weeks: weeksThis, bytes: dB, perWeek, calls: dC, rss: m.rss, heap: m.heapUsed });
      console.log(
        `  ${String(seen).padEnd(7)}${String(weeksThis).padStart(4)}` +
        `${(GB(dB) + "GB").padStart(11)}${(MB(perWeek) + "MB").padStart(11)}` +
        `${String(dC).padStart(9)}${(MB(m.rss) + "MB").padStart(10)}${(MB(m.heapUsed) + "MB").padStart(11)}`
      );
      prevBytes = ipcBytes; prevCalls = ipcCalls; weeksThis = 0;
    };

    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < startSeason + SEASONS) {
      if (app.retired()) { console.log("  (은퇴로 종료)"); break; }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) { /* 진로 */ }
      else if (app.isSeasonEnded()) { await app.seasonRollover(); }
      else {
        await app.autoRun();
        if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
      }
      const w = app.currentWeek(), s = app.currentSeason();
      weeksThis += (s > s0) ? Math.max(1, w) : Math.max(0, w - w0);
      if (s > seen) { seen = s; record(); }
    }

    // 기울기 — 이게 답이다. 평평하면 시즌을 아무리 가도 안 무거워진다
    if (rows.length >= 2) {
      const a = rows[0], z = rows[rows.length - 1];
      console.log("");
      console.log(`  주당 IPC   ${MB(a.perWeek)}MB → ${MB(z.perWeek)}MB   (${((z.perWeek / Math.max(1, a.perWeek) - 1) * 100).toFixed(0)}%)`);
      console.log(`  rss        ${MB(a.rss)}MB → ${MB(z.rss)}MB   (${((z.rss / Math.max(1, a.rss) - 1) * 100).toFixed(0)}%)`);
      console.log(`  heapUsed   ${MB(a.heap)}MB → ${MB(z.heap)}MB`);
    }

    const top = [...perKey.entries()].sort((x, y) => y[1].bytes - x[1].bytes).slice(0, 10);
    console.log("\n  누적 전송량 상위");
    for (const [k, v] of top) {
      console.log(`  ${k.padEnd(34)}${(GB(v.bytes) + "GB").padStart(9)}${String(v.calls).padStart(9)}회`);
    }
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[measure-memory] 실패:", e); process.exit(1); });
