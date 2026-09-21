"use strict";
/**
 * 해외 구단 0단계 기준선 — **고치기 전** 값 (2026-09-22 · A).
 *
 * `docs/PLAN_OVERSEAS_CLUBS_2026-09-22.md` 0단계. ABL 16 · JBL 12 · KBL 10 을
 * **팀별로** 잰다: 홈런/경기 · ERA · 승률 · 구장 담장 · 성향 12항목 · FA 영입.
 *
 * 1단계에서 구장 치수와 성향을 채운 **뒤 그대로 다시 돌려** 같은 표를 낸다.
 * 그래서 KBL 도 같이 잰다 — 해외만 보면 "원래 이 정도인지"를 못 가른다.
 *
 *   PF_SEEDS=20260802,777,31337 PF_YEARS=3 npm run probe:overseas
 *
 * ⚠ **주인공은 고교에 둔다.** 해외 리그는 반경 1(항상 풀 시뮬)이라
 *   주인공이 어디 있든 돈다(`radiusGate.ts`). 진로를 밀면 씨앗마다 세계가
 *   달라져 비교가 안 된다 — 아무 정책도 안 건다.
 * ⚠ 시즌 롤오버가 `leagueState` 를 비운다. 그래서 매 바퀴 찍고 **그 시즌에
 *   경기가 가장 많았던 순간**을 남긴다(`probe-bgsched.cjs` 와 같은 함정).
 */
const path = require("node:path");
const fs = require("node:fs");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEEDS = String(process.env.PF_SEEDS || "20260802,777,31337").split(",").map(Number);
const YEARS = Number(process.env.PF_YEARS || 3);
const OUT_DIR = path.join(process.cwd(), "runs/overseas-stage0");

const n2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const n3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

/** 한 리그의 팀 행을 표로 — 같은 팀의 여러 시즌을 평균낸다 */
function foldByTeam(snapshots) {
  const acc = new Map();
  for (const snap of snapshots) {
    for (const r of snap.팀) {
      if (r.경기 === 0) continue;   // 아직 안 돈 시즌은 안 센다
      const a = acc.get(r.팀) ?? { 견본: 0, 행: r, 홈런경기: 0, ERA: 0, 승률: 0, FA: 0 };
      a.견본 += 1;
      a.홈런경기 += r["홈런/경기"];
      a.ERA += r.ERA;
      a.승률 += r.승률;
      a.FA += r.FA영입;
      a.행 = r;   // 성향·구장은 시즌마다 안 바뀌니 마지막 것을 둔다
      acc.set(r.팀, a);
    }
  }
  return [...acc.values()].map((a) => ({
    ...a.행,
    견본: a.견본,
    "홈런/경기": a.홈런경기 / a.견본,
    ERA: a.ERA / a.견본,
    승률: a.승률 / a.견본,
    FA영입: a.FA / a.견본,
  }));
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const all = [];
  for (const seed of SEEDS) {
    const { app, tmp } = await headless.boot(`overseas-${seed}`);
    let why = "완주";
    const bySeason = new Map();
    try {
      await app.boot({ slotId: "OS" + seed, worldSeed: seed, seasonYear: 2026 });

      // ① 새 게임 직후의 성향 — 파생이 돌았는가
      const first = app.overseasClubBaseline();
      // ② 세이브 왕복 뒤에도 같은가 — `hydrateFromSlot(toSaveGame())`
      app.saveRoundTripTargets();
      const after = app.overseasClubBaseline();
      const drift = [];
      for (let i = 0; i < first.팀.length; i++) {
        const a = first.팀[i], b = after.팀[i];
        for (const k of Object.keys(a)) {
          if (k === "경기" || k === "승률" || k === "홈런" || k === "홈런/경기"
            || k === "ERA" || k === "FA영입" || k === "FA평균OVR") continue;
          if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) drift.push(`${a.팀}.${k}`);
        }
      }
      console.log(`\n=== 씨앗 ${seed} ===`);
      console.log(`[왕복] 성향·구장이 저장 왕복에서 바뀐 칸: ${drift.length}`
        + (drift.length ? ` — ${drift.slice(0, 8).join(" ")}` : " (없다)"));

      // ③ 3시즌
      const start = app.currentSeason();
      let guard = 0;
      while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
        if (app.retired()) { why = "은퇴"; break; }
        const snap = app.overseasClubBaseline();
        const played = snap.팀.reduce((a, r) => a + r.경기, 0);
        const cur = bySeason.get(snap.시즌);
        if (!cur || played > cur.played) bySeason.set(snap.시즌, { played, snap });

        // 🔴 **`autoRun` 만 부르면 2026 에서 안 나간다** (실측 2026-09-22 ·
        //   세 씨앗 다 `snaps=1`). 진로 결정·드래프트 관전·롤오버는 주를
        //   안 넘기고 대기만 밀어 넣는다 — `probe-bgsched.cjs` 와 같은
        //   손차례를 그대로 쓴다. 여기서 순서를 다시 지어내지 않는다.
        const w0 = app.currentWeek(), s0 = app.currentSeason();
        await app.autoRun();
        if (app.currentWeek() > w0) continue;
        if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
        if (await app.pushCareerForward()) continue;
        if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
        if (app.currentWeek() === w0 && app.currentSeason() === s0) {
          why = `정지 ${s0}W${w0}`; break;
        }
      }
      const last = app.overseasClubBaseline();
      const lastPlayed = last.팀.reduce((a, r) => a + r.경기, 0);
      const cur = bySeason.get(last.시즌);
      if (!cur || lastPlayed > cur.played) bySeason.set(last.시즌, { played: lastPlayed, snap: last });
    } catch (e) {
      why = `멈춤: ${e && e.message ? e.message.split("\n")[0] : e}`;
    } finally {
      const snaps = [...bySeason.values()].map((v) => v.snap);
      const rows = foldByTeam(snaps);
      all.push({ seed, why, 시즌수: snaps.length, 팀: rows });
      fs.writeFileSync(
        path.join(OUT_DIR, `${seed}.json`),
        JSON.stringify({ seed, why, snapshots: snaps }, null, 1), "utf8");
      console.log(`[씨앗 ${seed}] ${why} · 시즌 ${snaps.length}`);
      await headless.cleanup(tmp);
    }
  }

  // ── 표 ────────────────────────────────────────────────────────
  // 씨앗을 평균낸다 — 팀 하나의 한 시즌은 잡음이 크다
  const merged = new Map();
  for (const run of all) {
    for (const r of run.팀) {
      const a = merged.get(r.팀) ?? { n: 0, 행: r, hrg: 0, era: 0, wp: 0, fa: 0 };
      a.n += 1; a.hrg += r["홈런/경기"]; a.era += r.ERA; a.wp += r.승률; a.fa += r.FA영입;
      a.행 = r;
      merged.set(r.팀, a);
    }
  }
  const rows = [...merged.values()].map((a) => ({
    ...a.행, 씨앗수: a.n,
    "홈런/경기": a.hrg / a.n, ERA: a.era / a.n, 승률: a.wp / a.n, FA영입: a.fa / a.n,
  }));
  fs.writeFileSync(path.join(OUT_DIR, "merged.json"), JSON.stringify(rows, null, 1), "utf8");

  for (const lg of ["KBL", "ABL", "JBL"]) {
    const rs = rows.filter((r) => r.리그 === lg).sort((a, b) => b.승률 - a.승률);
    if (rs.length === 0) continue;
    console.log(`\n### ${lg} — 씨앗 ${SEEDS.length} × ${YEARS}시즌 평균`);
    console.log("팀".padEnd(26) + "★ 성향출처 구장표 lf/cf/rf/fence   승률    HR/G   ERA   FA  수용");
    for (const r of rs) {
      console.log(
        r.팀.padEnd(26)
        + String(r.전력) + " "
        + String(r.성향출처).padEnd(7) + " "
        + (r.구장표에있나 ? "  O  " : "  X  ") + " "
        + `${r.lf}/${r.cf}/${r.rf}/${r.fence}`.padEnd(18)
        + n3(r.승률).padStart(6) + "  "
        + n2(r["홈런/경기"]).padStart(5) + "  "
        + n2(r.ERA).padStart(5) + "  "
        + n2(r.FA영입).padStart(4) + "  "
        + String(r.수용인원).padStart(6));
    }
    const spread = (k) => {
      const v = rs.map((r) => r[k]).sort((a, b) => a - b);
      return `${n2(v[0])} ~ ${n2(v[v.length - 1])}`;
    };
    console.log(`  퍼짐: HR/G ${spread("홈런/경기")} · ERA ${spread("ERA")}`);
  }
  console.log(`\n원자료 ${OUT_DIR}`);
})();
