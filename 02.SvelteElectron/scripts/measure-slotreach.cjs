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
const stage = (r) => C(r, "career_stage")?.stage ?? null;
const league = (r) => C(r, "league_id")?.leagueId ?? null;

const GROUPS = [
  ["전체 공용", (r) => !stage(r) && !league(r)],
  ["고교",      (r) => stage(r) === "highschool"],
  ["대학",      (r) => stage(r) === "university"],
  ["독립",      (r) => stage(r) === "independent"],
  ["KBL 1군",   (r) => stage(r) === "pro_kbl" && !league(r)],
  ["KBL 2군",   (r) => league(r) === "LEAGUE_KBL_FARM"],
];

(async () => {
  const boot = await headless.boot("slotreach");
  const app = boot.app;
  await app.boot({ slotId: "SLTR", worldSeed: SEED, seasonYear: 2026 });
  // 고교에서 시작해 그대로 둔다 — 진로를 안 밀면 고교 3년이 그대로 잡힌다
  app.setCareerPolicy({ draft: false, university: false, independent: true });
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
  log(`  씨앗 ${SEED} · ${start}~${app.currentSeason()} (${SEASONS}시즌) · ${f.주수}주`);
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
    if (label === "전체 공용" || label === "고교") {
      log(`    ${label} ${ids.length}종: ${ids.slice(0, 24).map((x) => x.replace("EVT_", "")).join(" ")}`);
      if (ids.length > 24) log(`      … 그 밖 ${ids.length - 24}종`);
    }
  }
  log("");
  log(`  ⚠ 커리어가 그 무대를 안 지나면 재고가 있어도 0이다 — 여기선 고교에서 시작해 ${SEASONS}시즌이다`);
  log("");
  boot.cleanup?.();
  process.exit(0);
})();
