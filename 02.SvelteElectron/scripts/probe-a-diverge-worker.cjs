"use strict";
/**
 * 계측 모드 재현 — **어느 주에서 갈리는지** 찾는 워커.
 * `probe-a-diverge.cjs` 가 두 번 띄워 줄 단위로 비교한다.
 *
 * 한 주마다 한 줄을 찍는다: 시즌·주차 · 주인공 능력치 합·피로·컨디션 ·
 * 그 주까지의 등판 수·이닝 · NPC 수. 첫 번째로 어긋나는 줄이 원인 자리다.
 *
 * ⚠ 한 프로세스 = 한 판 (`probe-d-dr-worker.cjs` 머리말과 같은 이유).
 *
 *   PB_DIVERGE_OUT=<파일> PF_SEED=20260802 electron scripts/probe-a-diverge-worker.cjs
 */
const path = require("node:path");
const fs = require("node:fs");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const WEEKS = Number(process.env.PB_DIVERGE_WEEKS || 60);
const OUT = process.env.PB_DIVERGE_OUT || "diverge.txt";
const POLICY = { draft: true, university: true, independent: true };
const r2 = (v) => Math.round((v ?? 0) * 100) / 100;

(async () => {
  const lines = [];
  const reqs = [];    // 주인공 경기 **요청 원문** — 갈리면 어느 칸인지 따로 본다
  const dumps = [];   // NPC 능력치 전량 — 갈리는 **사람**을 찾는다
  // 주인공 경기 IPC 를 그대로 찍는다 — 갈리는 게 「경기」인지 「경기 뒤 처리」인지
  // 가르려면 요청과 응답을 같이 봐야 한다(2026-09-07 진단에서 그게 갈랐다)
  headless.setInterceptor(async (channel, args, invoke) => {
    const res = await invoke();
    if (channel === "match:simulateToEntry" || channel === "match:autoFinishFromEntry") {
      const r = typeof res === "string" ? JSON.parse(res) : res;
      const q = args?.[0] ?? {};
      if (channel === "match:simulateToEntry") reqs.push(JSON.stringify(q));
      lines.push(`  IPC ${channel} seed=${q.seed ?? "-"}`
        + (q.opponentPitcher ? ` opp=${q.opponentPitcher.name}` : "")
        + (q.protagonistSide ? ` side=${q.protagonistSide}` : "")
        + (q.opponentLineup ? ` oppBat1=${q.opponentLineup[0]?.name}` : "") + " "
        + `→ ${["entryReached", "homeScore", "awayScore", "outsRecorded", "strikeouts",
               "hitsAllowed", "walksAllowed", "earnedRuns", "pitchCount"]
            .filter((k) => r[k] !== undefined).map((k) => `${k}=${r[k]}`).join(" ")}`);
    }
    return res;
  });
  const { app, tmp } = await headless.boot(`dv-${SEED}-${process.pid}`);
  try {
    await app.boot({ slotId: "DV" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    let prevSchedule = new Set(app.scheduleIdList());
    for (let i = 0; i < WEEKS; i++) {
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (await app.pushPendingForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.runOneWeek();
      const ab = app.protagonistAbilities();
      const st = app.protagonistStatProbe();
      const sum = Object.entries(ab)
        .filter(([k]) => k !== "ovr").reduce((a, [, v]) => a + v, 0);
      const ps = app.protagonistState();
      lines.push([
        `S${s0}W${String(w0).padStart(2, "0")}`,
        `ovr=${ab.ovr}`, `sum=${sum}`,
        `vel=${ab.velocity}`, `cmd=${ab.command}`, `ctl=${ab.control}`,
        `fat=${r2(ps.fatigue)}`, `cond=${r2(ps.condition)}`,
        `g=${st.경기 ?? 0}`, `ip=${r2(st.ip)}`, `era=${st.era ?? "-"}`,
        `npc=${app.npcCount()}`,
        // 일정이 갈리면 씨앗도 갈린다(씨앗 재료에 `scheduleEntry.id` 가 들어간다) —
        // 그때 「경기가 달라졌다」와 「일정이 달라졌다」를 여기서 가른다
        `sch=${app.scheduleIdList().length}`,
        // 주간 성장이 NPC 배열 **순서**에 걸린다 — 순서가 흔들리면 여기서 잡힌다
        `ents=${(() => { const f = app.entityOrderFingerprint(); return `${f.count}:${f.hash}`; })()}`,
        // NPC 능력치 전량 지문 — 주간 성장이 갈리면 여기가 먼저 갈린다
        `live=${(() => { const f = app.npcLiveFingerprint(); return `${f.count}:${f.hash}`; })()}`,
      ].join(" "));
      dumps.push(app.npcLiveDump());
      // 일정에 새로 붙은 id 만 찍는다(전량은 너무 길다). 친선·대회가 여기서 는다
      const now = app.scheduleIdList();
      const added = now.filter((x) => !prevSchedule.has(x));
      if (added.length) lines.push(`  SCH+ ${added.join(",")}`);
      prevSchedule = new Set(now);
    }
  } catch (e) {
    lines.push(`EXCEPTION ${e && e.stack || e}`);
  }
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  fs.writeFileSync(OUT + ".reqs", reqs.join("\n") + "\n", "utf8");
  fs.writeFileSync(OUT + ".live", dumps.join("\n===\n"), "utf8");
  await headless.cleanup(tmp);
  console.log(`RESULT ${lines.length}줄 → ${OUT}`);
})();
