"use strict";
/**
 * 계측 재현 — **주간 성장 요청 원문**을 주마다 통째로 남기는 워커.
 *
 * `probe-a-diverge.cjs` 가 "NPC 한 명 능력치가 1 다르다"까지 좁혀 준다.
 * 거기서 더 좁히려면 **엔진에 넘어간 재료**를 봐야 한다 — 같은 씨앗·같은
 * 순서인데 값이 갈리면 원인은 엔진이 아니라 요청이다.
 *
 * `engine:call` 을 가로채 `npcCalcWeeklyGrowth` 의 인자를 주마다 파일로
 * 떨어뜨린다. 러너가 두 판을 띄워 같은 이름의 파일끼리 깊게 비교한다.
 *
 *   PB_GR_OUT=<디렉터리> PF_SEED=20260802 electron scripts/probe-a-growthreq-worker.cjs
 */
const path = require("node:path");
const fs = require("node:fs");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const WEEKS = Number(process.env.PB_GR_WEEKS || 8);
const OUT = process.env.PB_GR_OUT || "growthreq";
const POLICY = { draft: true, university: true, independent: true };

// 어떤 네이티브 호출을 남길지 — 주간 성장 앞뒤로 난수를 쓰는 것들
const WATCH = new Set([
  "npcCalcWeeklyGrowth",
  "syntheticWeeklyPerfNative",
  "weekCalcNpcFallbackNative",
  "weekRollRandomBatchNative",
  "weekCalcNpcInjuriesNative",
  "resolveNonProtagonistSeriesNative",
]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  const index = [];
  headless.setInterceptor(async (channel, args, invoke) => {
    if (channel !== "engine:call" || !WATCH.has(args?.[0])) return await invoke();
    const fn = args[0];
    const res = await invoke();
    n += 1;
    const name = `${String(n).padStart(4, "0")}_${fn}`;
    fs.writeFileSync(path.join(OUT, name + ".req.json"), String(args[1] ?? ""), "utf8");
    fs.writeFileSync(path.join(OUT, name + ".res.json"), typeof res === "string" ? res : JSON.stringify(res), "utf8");
    index.push(name);
    return res;
  });
  const { app, tmp } = await headless.boot(`gr-${SEED}-${process.pid}`);
  try {
    await app.boot({ slotId: "GR" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    for (let i = 0; i < WEEKS; i++) {
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (await app.pushPendingForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.runOneWeek();
    }
  } catch (e) {
    fs.writeFileSync(path.join(OUT, "EXCEPTION.txt"), String((e && e.stack) || e), "utf8");
  }
  fs.writeFileSync(path.join(OUT, "index.txt"), index.join("\n") + "\n", "utf8");
  await headless.cleanup(tmp);
  console.log(`RESULT ${index.length}건 → ${OUT}`);
})();
