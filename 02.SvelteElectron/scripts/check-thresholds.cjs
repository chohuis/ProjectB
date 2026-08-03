#!/usr/bin/env node
// ── 판정 기준 재검증 (Phase 3) ────────────────────────────────────
//
// **테스트가 아니라 숫자를 보는 도구다.** 통과/실패를 내지 않는다 —
// 기준선을 옮길지는 사람이 정한다.
//
// ⚠ **수상 자격선·승강 기준선은 계산이 아니라 판정이다.** 엔진이 바뀌면
// 같은 규칙이 다른 결과를 낸다. 리그 타율이 .431 → .253으로 내려오고
// 리그 ERA가 11.67 → 4.7이 됐는데 기준선은 그대로였다:
//
//   promotionRules.batterOpsBaseline   0.700  ← "이게 0점"
//   promotionRules.pitcherEraBaseline  4.50   ← "이게 0점"
//   awardRules.*.minValue / maxValue          ← "이 정도는 돼야 상"
//
// 기준선이 리그 중앙값과 어긋나면 승강 판정이 한쪽으로 쏠린다. 중앙보다
// 낮으면 대부분이 +점수를 받아 성적이 변별력을 잃고, 높으면 전원이 부진이다.
//
// `awardRules._note4`가 이미 "타격왕 이상치(.583)가 남아 있어 추가 조정이
// 필요하다"고 적어 두었다 — 그 확인이 이 스크립트다.
//
//   npm run check:thresholds
//   node scripts/check-thresholds.cjs --seasons 3 --seed 20260804

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const gr = require(path.join(process.cwd(), "resource/data/master/players/generation_rules.json"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 3);
const SEED = arg("seed", 20260804);
const log = (s) => process.stdout.write(s + "\n");
const r3 = (v) => Math.round(v * 1000) / 1000;

(async () => {
  log("");
  log("── 판정 기준 재검증 ──────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("thresholds");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "THR", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    let guard = 0;
    // 시즌마다 찍는다 — 한 해만 보면 그 해 변동을 기준선 문제로 오독한다
    const seasons = [];

    while (guard++ < 4000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        // ⚠ **롤오버 전에 찍는다.** 롤오버가 시즌 기록을 정산해 비운다
        seasons.push({
          year: app.currentSeason(),
          bat: app.batterSampleProbe(),
          spread: app.abilitySpreadProbe("LEAGUE_KBL"),
          awards: await app.awardThresholdProbe("LEAGUE_KBL"),
        });
        await app.seasonRollover();
        continue;
      }
      break;
    }

    if (seasons.length === 0) { log("시즌을 한 번도 못 넘겼다"); return; }

    // ── ① 승강 기준선 ────────────────────────────────────────
    const pr = gr.promotionRules;
    log("");
    log(`① 승강 기준선 — 성적 점수의 0점 위치`);
    log(`   설정: batterOpsBaseline ${pr.batterOpsBaseline} · pitcherEraBaseline ${pr.pitcherEraBaseline}`);
    for (const s of seasons) {
      const kbl = s.bat.KBL ?? {};
      log(`   ${s.year}  규정타자OPS ${kbl.규정타자OPS ?? "-"} (전체 ${kbl.평균OPS ?? "-"})`
        + `  ·  ERA 중앙 ${s.spread.ERA_중앙 ?? "-"} (p10 ${s.spread.ERA_p10 ?? "-"} / p90 ${s.spread.ERA_p90 ?? "-"})`);
    }
    // 기준선이 중앙값과 얼마나 떨어져 있나 — 이게 쏠림의 크기다
    const opsMed = seasons.map((s) => Number(s.bat.KBL?.규정타자OPS ?? 0)).filter((v) => v > 0);
    const eraMed = seasons.map((s) => Number(s.spread.ERA_중앙 ?? 0)).filter((v) => v > 0);
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    if (opsMed.length) {
      const m = avg(opsMed);
      log(`   → OPS 실측 중앙 ${r3(m)} vs 기준 ${pr.batterOpsBaseline}`
        + `  (${m > pr.batterOpsBaseline ? "실측이 높다 — 대부분이 +점수" : "실측이 낮다 — 대부분이 부진"})`);
    }
    if (eraMed.length) {
      const m = avg(eraMed);
      log(`   → ERA 실측 중앙 ${r3(m)} vs 기준 ${pr.pitcherEraBaseline}`
        + `  (${m < pr.pitcherEraBaseline ? "실측이 낮다 — 대부분이 +점수" : "실측이 높다 — 대부분이 부진"})`);
    }

    // ── ② 수상 자격선 ────────────────────────────────────────
    log("");
    log("② 수상 자격선 — 통과 인원 · 1위 값 · 2위와의 차");
    log("   통과 0 = 그 상이 안 나온다 / 통과가 얕으면 요행이 1위가 된다");
    for (const s of seasons) {
      log(`   ── ${s.year}`);
      for (const [label, v] of Object.entries(s.awards)) {
        if (label === "MVP") continue;
        const flag = v.수상없음 ? `  ⚠ ${v.수상없음}`
          : (v.통과 ?? 0) === 0 ? "  ⚠ 자격자 없음"
          : (v.통과 ?? 0) < 5 ? `  ⚠ 통과 ${v.통과}명뿐`
          : "";
        log(`      ${String(label).padEnd(8)} 통과 ${String(v.통과 ?? 0).padStart(3)}`
          + `  1위 ${String(v["1위"] ?? "-").padStart(6)}`
          + `  2위차 ${String(v["2위차"] ?? "-").padStart(5)}`
          + `  중앙 ${String(v.중앙 ?? "-").padStart(6)}${flag}`);
      }
      const mvp = s.awards.MVP;
      if (mvp) log(`      MVP      ${mvp.기준} → ${mvp.해당}명 (최다 ${mvp.최다부문}부문)`);
    }

    // ── ③ 능력치가 성적을 만드는가 ───────────────────────────
    log("");
    log("③ OVR–성적 상관 — 성격 계수를 판단하려면 이게 먼저 깨끗해야 한다");
    for (const s of seasons) {
      log(`   ${s.year}  OVR-ERA ${s.spread["OVR-ERA 상관"] ?? "-"}`
        + `  ·  OVR-K9 ${s.spread["OVR-K9 상관"] ?? "-"}`
        + `  ·  상위25% ERA ${s.spread["상위25% ERA"] ?? "-"} vs 하위25% ${s.spread["하위25% ERA"] ?? "-"}`
        + `  (표본 ${s.spread.표본 ?? 0})`);
    }
  } catch (e) {
    log("ERR " + String((e && e.stack) || e).split("\n").slice(0, 8).join("\n    "));
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
  log("");
})().catch((e) => { log("ERR " + ((e && e.stack) || e)); process.exit(1); });
