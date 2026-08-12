// ── NPC 드래프트 라운드 ↔ 능력치 대응표 (D단계) ──────────────────
//
// 주인공 산식만 손보고 NPC와 대조를 안 하면, 같은 OVR이 서로 다른 라운드를
// 받는 걸 못 본다. 주인공만 관대하면 육성 결과가 실제보다 좋게 보이고,
// 박하면 잘 키워도 보상이 없다.
//
//   ELECTRON_RUN_AS_NODE=1 npx electron scripts/study-npc-draft.cjs --years 6 --runs 3
//
// ⚠ electron이 `engine-native.node`와 `master.db`를 문다 — 돌리는 동안
// `npm run dev`가 안 된다.

const headless = require("./perf/headless.cjs");
const fs = require("fs");
const path = require("path");

const num = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};

const YEARS  = num("years", 6);
const RUNS   = num("runs", 3);
const SEED0  = num("seed", 20260812);
const OUT    = path.join(headless.ROOT, "resource", "logs", "npc-draft-table.json");
const LOG    = path.join(headless.ROOT, "resource", "logs", "npc-draft-table.log");

const lines = [];
const log = (s) => { lines.push(s); console.log(s); fs.writeFileSync(LOG, lines.join("\n")); };

(async () => {
  const all = [];
  let tmp = null;
  try {
    const boot = await headless.boot("npcdraft");
    tmp = boot.tmp;
    const app = boot.app;

    for (let run = 0; run < RUNS; run++) {
      try {
        const seed = SEED0 + run * 7919;
        await app.boot({ slotId: `ND${String(run).padStart(2, "0")}`, worldSeed: seed, seasonYear: 2026 });
        // 주인공 진로는 이 조사와 무관하다 — 세계만 돌린다
        app.setCareerPolicy({ draft: true, university: true, independent: true,
          enlistNow: false, rejectDraft: false, rejectTrade: false });

        let seenYears = new Set();
        let guard = 0;
        while (guard++ < YEARS * 52 * 60 && seenYears.size < YEARS) {
          if (app.retired()) break;
          if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
          if (await app.pushCareerForward()) continue;
          if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
          const w0 = app.currentWeek(), s0 = app.currentSeason();
          await app.autoRun();
          if (app.currentWeek() === w0 && app.currentSeason() === s0) continue;

          // 드래프트 로그는 그 해 것만 남는다(매년 덮어쓴다) — 보이는 즉시 집는다
          const t = app.npcDraftTable();
          const year = app.currentSeason();
          if (t["표본"] > 0 && !seenYears.has(year)) {
            seenYears.add(year);
            // 또래 분포는 그 해 것이다 — 행마다 백분위를 여기서 굳힌다
            const peers = t.peers ?? [];
            const pctOf = (o) =>
              peers.length === 0 ? null
                : (peers.filter((p) => p < o).length / peers.length) * 100;
            all.push(...t.rows.map((r) => ({ ...r, run, year, pct: pctOf(r.ovr) })));
          }
        }
        log(`  ${run + 1}/${RUNS}  ${seenYears.size}개 연도 · 누적 ${all.length}명`);
      } catch (e) {
        log(`  ${run + 1}/${RUNS}  회차 실패: ${e && e.message ? e.message : e}`);
      }
    }
  } finally {
    if (tmp) headless.cleanup(tmp);
  }

  fs.writeFileSync(OUT, JSON.stringify(all));

  const byRound = new Map();
  for (const r of all) {
    if (!byRound.has(r.round)) byRound.set(r.round, []);
    byRound.get(r.round).push(r);
  }
  const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
  log("");
  // ⚠ **live와 생성값을 나란히 놓는다.** 지명이 어느 쪽을 보고 있는지가
  // 이 조사의 핵심이다 — 라운드가 생성값과만 맞으면 성장이 진로에 안 비친다
  log("라운드     n    live OVR p25/중앙/p75     생성 OVR p25/중앙/p75    dev");
  for (const r of [...byRound.keys()].sort((a, b) => a - b)) {
    const rows = byRound.get(r);
    const a = rows.map((x) => x.ovr), b = rows.map((x) => x.genOvr ?? 0), d = rows.map((x) => x.dev);
    const n3 = (v) => String(Math.round(v)).padStart(3);
    log(
      "   " + String(r).padStart(2) + "R  " + String(rows.length).padStart(4) + "      " +
      [q(a, 0.25), q(a, 0.5), q(a, 0.75)].map(n3).join(" /") + "          " +
      [q(b, 0.25), q(b, 0.5), q(b, 0.75)].map(n3).join(" /") + "        " + n3(q(d, 0.5)),
    );
  }

  // 상관 — 라운드와 각 OVR. 음수여야 정상이다(라운드가 작을수록 능력치가 높다)
  const corr = (xs, ys) => {
    const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxy / Math.sqrt(sxx * syy || 1);
  };
  const rr = all.map((x) => x.round);
  log("");
  log("라운드 상관   live " + corr(rr, all.map((x) => x.ovr)).toFixed(3) +
      "   생성 " + corr(rr, all.map((x) => x.genOvr ?? 0)).toFixed(3) +
      "   dev " + corr(rr, all.map((x) => x.dev)).toFixed(3));

  // ── 주인공과 같은 저울로 ────────────────────────────────────
  //
  // 주인공 산식은 `round = 6 - (score-50)*0.111`이고 score의 6할이 백분위다.
  // NPC가 그 백분위에서 실제로 몇 라운드를 받는지 나란히 놓으면, 어느 쪽이
  // 관대한지가 보인다. **이게 D의 결론이다.**
  const withPct = all.filter((x) => x.pct != null);
  if (withPct.length > 0) {
    log("");
    log("고교 3학년 투수 백분위 → 라운드 (NPC 실측 vs 주인공 산식)");
    log("  백분위대       n    NPC 라운드 중앙   주인공 산식");
    const bands = [[0, 40], [40, 60], [60, 75], [75, 85], [85, 95], [95, 101]];
    for (const [lo, hi] of bands) {
      const g2 = withPct.filter((x) => x.pct >= lo && x.pct < hi);
      if (g2.length === 0) continue;
      const mid = (lo + hi) / 2;
      // 주인공 산식 — ovrNorm은 그 띠의 실제 OVR 중앙으로 낸다
      const ovrMid = q(g2.map((x) => x.ovr), 0.5);
      const ovrNorm = Math.min(100, Math.max(0, ((ovrMid - 40) / 45) * 100));
      const score = mid * 0.6 + ovrNorm * 0.4;
      const heroRound = score < 25 ? "미지명"
        : String(Math.min(11, Math.max(1, Math.round(6 - (score - 50) * 0.111)))) + "R";
      log("  " + String(lo).padStart(3) + "~" + String(Math.min(100, hi)).padStart(3) +
          "     " + String(g2.length).padStart(4) + "        " +
          String(Math.round(q(g2.map((x) => x.round), 0.5))).padStart(2) + "R" +
          "            " + heroRound.padStart(6));
    }
    // ⚠ 지명된 NPC만 담긴 표다. 그 백분위대에서 **안 뽑힌 사람**은 안 보인다 —
    // 미지명률까지 보려면 후보 전체를 집어야 하고 그건 다음 조사다
    log("  (지명자만. 같은 백분위의 미지명자는 이 표에 없다)");
  }
  log("");
  log(`총 ${all.length}명 · ${OUT}`);
})();
