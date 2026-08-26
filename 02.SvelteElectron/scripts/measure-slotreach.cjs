#!/usr/bin/env node
/**
 * **그 무대에 있는 이야기 중 몇이 실제로 뜨나.**
 *
 *   npm run measure:slotreach -- --seasons 3
 *
 * 재고(`measure:eventslots`)는 "몇 개 있나"를 답한다. 이건 "몇 개나 닿나"다.
 * **둘은 다르다** — 조건부는 주당 1칸을 두고 다투고, 랜덤은 풀 추첨을 통과해야
 * 한다. 재고가 많아도 소비가 안 되면 플레이어는 같은 이야기만 본다.
 *
 * ⚠ 한 실행이다. 랜덤 갈래는 편차가 크니 **종수의 대략치**로 읽는다.
 */
const fs = require("node:fs");
const path = require("node:path");
const headless = require("./perf/headless.cjs");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 3);
const SEED = arg("seed", 20260803);

/**
 * **경로를 고른다.** 헤드리스는 기본값이면 항상 한 갈래로만 간다 —
 * 그러면 대학·프로·군 무대는 재고가 있어도 영원히 0으로 나온다.
 *
 *   --path indie   고교 → 독립          (기본)
 *   --path univ    고교 → 대학 → …
 *   --path draft   고교 → 드래프트 → 프로
 *   --path army    고교 → 즉시 입대
 */
const PATHS = {
  indie: { draft: false, university: false, independent: true },
  univ:  { draft: false, university: true,  independent: false },
  draft: { draft: true,  university: false, independent: true },
  army:  { draft: false, university: false, independent: true, enlistNow: true },
};
const pi = process.argv.indexOf("--path");
const PATH_KEY = pi !== -1 ? process.argv[pi + 1] : "indie";
const POLICY = PATHS[PATH_KEY];
if (!POLICY) { console.log("경로: " + Object.keys(PATHS).join(" ")); process.exit(1); }

const M = "resource/data/master/events";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const R = [];
for (const lane of ["mandatory", "conditional", "random"]) {
  for (const f of walk(path.join(M, lane)).filter((x) => x.endsWith(".json"))) {
    R.push({ lane, ...JSON.parse(fs.readFileSync(f, "utf8")) });
  }
}
const C = (r, t) => (r.conditions ?? []).find((c) => c.type === t);
/**
 * 그 규칙이 속한 무대들. `career_stage`는 `stage` 하나 또는 `stages` 배열이다
 * — 프로 세 리그를 한 번에 가리키려고 배열을 열었다(2026-08-25).
 */
const stagesOf = (r) => {
  const c = C(r, "career_stage");
  if (!c) return [];
  return Array.isArray(c.stages) ? c.stages : c.stage ? [c.stage] : [];
};
const stage = (r) => { const a = stagesOf(r); return a.length === 1 ? a[0] : null; };
/** 그 무대에 속하나 — 배열이면 포함 여부 */
const inStage = (r, s) => stagesOf(r).includes(s);
/** 무대를 아예 안 가리는가 (진짜 전체 공용) */
const noStage = (r) => stagesOf(r).length === 0;
/** 군은 `career_stage`가 아니라 `militaryStatus` 경로로 갈린다 */
const isArmy = (r) => (r.conditions ?? []).some((c) => c.path === "militaryStatus");
const league = (r) => C(r, "league_id")?.leagueId ?? null;

const GROUPS = [
  ["전체 공용", (r) => noStage(r) && !league(r) && !isArmy(r)],
  ["고교",      (r) => inStage(r, "highschool")],
  ["대학",      (r) => inStage(r, "university")],
  ["독립",      (r) => inStage(r, "independent")],
  ["KBL 1군",   (r) => inStage(r, "pro_kbl") && !league(r)],
  ["KBL 2군",   (r) => league(r) === "LEAGUE_KBL_FARM"],
];

(async () => {
  const boot = await headless.boot("slotreach");
  const app = boot.app;
  await app.boot({ slotId: "SLTR", worldSeed: SEED, seasonYear: 2026 });
  app.setCareerPolicy(POLICY);
  app.resetEventFunnel();

  const start = app.currentSeason();
  let guard = 0;
  while (guard++ < 12000) {
    if (app.currentSeason() - start >= SEASONS) break;
    if (app.retired()) break;
    const before = app.currentWeek();
    await app.autoRun();
    if (app.currentWeek() > before) continue;
    if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
    if (await app.pushCareerForward()) continue;
    if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
    break;
  }

  const f = app.eventFunnelProbe();
  const log = (s) => process.stdout.write(s + "\n");
  log("");
  log(`  씨앗 ${SEED} · ${start}~${app.currentSeason()} (${SEASONS}시즌) · ${f.주수}주 · 경로 ${PATH_KEY}`);
  log("");
  // 🔴 **안 뜬 것을 두 부류로 가른다.** 이게 없으면 뽑기 운을 결함으로 읽는다:
  //    후보엔 올랐는데 안 뽑힘  →  다시 돌리면 다른 게 안 뜬다. 정상
  //    후보에 아예 못 오름      →  몇 번을 돌려도 영원히 안 뜬다. 결함
  log("  무대           재고    닿음   안뽑힘   못닿음★   닿은비율   발동");
  log("  " + "─".repeat(62));
  const neverCand = {};
  for (const [label, pick] of GROUPS) {
    const list = R.filter(pick);
    if (!list.length) continue;
    let reached = 0, fires = 0, unlucky = 0, never = 0;
    for (const r of list) {
      const p = app.eventRuleProbe(r.id);
      fires += p.발동;
      if (p.발동 > 0) reached++;
      else if (p.후보 > 0) unlucky++;
      else { never++; (neverCand[label] ??= []).push(r.id); }
    }
    const pct = ((reached / list.length) * 100).toFixed(0) + "%";
    log(`  ${label.padEnd(12)}${String(list.length).padStart(6)}${String(reached).padStart(8)}`
      + `${String(unlucky).padStart(9)}${String(never).padStart(10)}${pct.padStart(11)}${String(fires).padStart(8)}`);
  }
  log("");
  log("  ★ 후보에 한 번도 못 오른 것 — 조건이 안 닿는다. **뽑기 운이 아니다**");
  for (const [label, ids] of Object.entries(neverCand)) {
    {
      log(`    ${label} ${ids.length}종: ${ids.slice(0, 24).map((x) => x.replace("EVT_", "")).join(" ")}`);
      if (ids.length > 24) log(`      … 그 밖 ${ids.length - 24}종`);
    }
  }
  log("");
  log(`  ⚠ 커리어가 그 무대를 안 지나면 재고가 있어도 0이다 — 경로 ${PATH_KEY} · ${SEASONS}시즌`);
  log("");
  boot.cleanup?.();
  process.exit(0);
})();
