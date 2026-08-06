"use strict";
/**
 * D-1 — 해외 1군 로스터가 왜 상한을 넘는가 (진단 전용)
 *
 *   npm run diag:roster -- [--seasons 2]
 *
 * ⚠ `releaseScope.ts`에 **"1군 로스터 캡이 해외에 안 걸린다 — 왜 안 잘리는지
 * 아직 모른다"**고 적혀 있었고, 그게 ABL·JBL을 못 여는 마지막 이유였다.
 * JBL 팀당 최대 47명(상한 32), ABL 39명(상한 34).
 *
 * ⚠ **게이트를 닫아 두면 잴 수 없다** — 해외는 반경 3(비활성)이라 선수가 0명이다.
 * 돌리기 전에 `releaseScope.ts`의 `OUT_OF_SCOPE_LEAGUES`를 **임시로 비우고**,
 * 재고 나서 되돌린다. 열어둔 채로 커밋하면 로스터가 깨진 세계가 들어간다.
 *
 * ## 실측 (2026-08-06, 2시즌) — 결과 표는 `releaseScope.ts` 주석에 옮겨 뒀다
 *
 * 한 줄 요약: **캡이 안 걸리는 게 아니라, 캡이 도는 시점과 채우는 시점이
 * 어긋난다.** 새 게임은 해외를 아예 안 만들고(생성 직후 0팀), 첫 W1에 팜만
 * 가득 차고(34/34, 1군은 ABL 최소 7 · JBL 최소 2), 그다음 롤오버에서 1군이
 * 한꺼번에 차오르며 상한을 넘는다(ABL 41 / JBL 46, 상한 34 / 32).
 *
 * 국내도 시즌 중엔 넘지만(KBL 38) 롤오버 뒤 34로 잡힌다 — **해외만 안 잡힌다.**
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 2);
const log = (s) => process.stdout.write(s + "\n");

const rules = require(path.join(process.cwd(),
  "resource/data/master/players/generation_rules.json")).rosterRules;

function dump(label, app) {
  log(`\n── ${label} ──`);
  log(`  ${"리그".padEnd(20)} 팀   최소  최대  총원   상한  야수↓ 투수↓`);
  const d = app.rosterDiag();
  for (const [lid, v] of Object.entries(d).sort()) {
    const cap = rules[lid]?.rosterMax;
    const over = cap != null && v.max > cap;
    // ⚠ 야수 하한이 핵심이다 — 9명 미만이면 타순이 짧아져 성적이 능력치가
    // 아니라 출전량으로 결정된다. 총원이 맞아도 여기가 무너질 수 있다
    log(`  ${lid.padEnd(20)} ${String(v.teams).padStart(3)} ${String(v.min).padStart(5)}`
      + ` ${String(v.max).padStart(5)} ${String(v.total).padStart(6)}`
      + ` ${String(cap ?? "-").padStart(6)}`
      + ` ${String(v.batMin).padStart(5)} ${String(v.pitMin).padStart(5)}`
      + `${over ? "  ← 정원넘김" : ""}${v.batMin < 12 ? "  ← 야수부족" : ""}`);
  }
}

(async () => {
  const { app } = await headless.boot("diag-roster");
  await app.boot({ slotId: "DIAGR", worldSeed: 20260806, seasonYear: 2026 });
  dump("생성 직후 (W1 전)", app);

  let guard = 0;
  const start = app.currentSeason();
  while (app.currentSeason() - start < SEASONS && guard++ < SEASONS * 200) {
    const before = app.currentWeek();
    await app.autoRun();
    if (app.currentWeek() - before <= 0) {
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        dump(`${app.currentSeason()} 시즌 끝 (롤오버 전)`, app);
        await app.seasonRollover();
        dump(`${app.currentSeason()} W1 (롤오버 후)`, app);
        continue;
      }
      break;
    }
  }
  dump("최종", app);
  headless.cleanup();
  process.exit(0);
})().catch((e) => { log(`ERROR ${e.stack || e}`); process.exit(1); });
