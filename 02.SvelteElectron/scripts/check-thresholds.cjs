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

    let guard = 0;
    // 시즌마다 찍는다 — 한 해만 보면 그 해 변동을 기준선 문제로 오독한다
    const seasons = [];

    // ⚠ **연도 차이로 세면 한 시즌이 빈다.** 수집은 시즌 종료 시점에 하는데
    // 종료 판정 전에 위 조건이 먼저 걸린다 — `--seasons 3`인데 2시즌만 모였다.
    // **모은 개수로 센다.** 상관은 표본이 전부라 한 시즌이 통째로 빠지면 크다.
    while (guard++ < 6000) {
      if (seasons.length >= SEASONS) break;
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
          steal: app.stealInputProbe("LEAGUE_KBL"),
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

    // ── ②-1 도루 입력 분포 ───────────────────────────────────
    log("");
    log("②-1 도루 입력 — 계수를 만지기 전에 실제 분포를 본다");
    for (const s2 of seasons) {
      const v = s2.steal ?? {};
      log(`   ${s2.year}  speed p25 ${v.speed_p25} / 중앙 ${v.speed_중앙} / p75 ${v.speed_p75} / p95 ${v.speed_p95}`
        + `  ·  instinct 중앙 ${v.instinct_중앙} p95 ${v.instinct_p95}`
        + `  ·  견제 중앙 ${v.holdRunners_중앙}`);
      log(`         시도확률 중앙주자 ${v["시도%_중앙주자"]}% · 상위주자 ${v["시도%_상위주자"]}%`);
    }

    // ── ③ 능력치가 성적을 만드는가 ───────────────────────────
    log("");
    log("③ OVR–성적 상관 — 성격 계수를 판단하려면 이게 먼저 깨끗해야 한다");
    for (const s of seasons) {
      log(`   ${s.year}  OVR-ERA ${s.spread["OVR-ERA 상관"] ?? "-"}`
        + `  ·  OVR-K9 ${s.spread["OVR-K9 상관"] ?? "-"}`
        + `  ·  상위25% ERA ${s.spread["상위25% ERA"] ?? "-"} vs 하위25% ${s.spread["하위25% ERA"] ?? "-"}`
        + `  (표본 ${s.spread.표본 ?? 0})`);
      // ⚠ **예측변수의 분산이 사라지면 상관은 자연히 0이 된다.**
      // 상관만 보면 "능력치가 성적을 안 만든다"로 읽히지만, 실제 원인이
      // "모두 능력치가 비슷해졌다"일 수 있다 — 고칠 곳이 완전히 다르다.
      log(`         OVR 상위25% ${s.spread["상위25% OVR"] ?? "-"} vs 하위25% ${s.spread["하위25% OVR"] ?? "-"}`
        + `  (차 ${((s.spread["상위25% OVR"] ?? 0) - (s.spread["하위25% OVR"] ?? 0)).toFixed(1)})`
        + `  · 옛 소속리그 필터였다면 빠질 표본 ${s.spread["강등제외됐을표본"] ?? "-"}명`);
      // ⚠ 천장(0.68)에 붙은 투수끼리는 엔진이 구별하지 못한다 — 능력 차가
      // 결과 차를 못 만드는 진짜 이유일 수 있다. 상관이 아니라 기울기 문제다.
      log(`         제구 천장(0.68) 비율 ${((s.spread["제구천장비율"] ?? 0) * 100).toFixed(0)}%`
        + ` · 평균 strike_prob ${s.spread["평균strike_prob"] ?? "-"}`);
      log(`         선발 ${s.spread.선발수 ?? 0}명 ERA ${s.spread["선발 OVR-ERA"] ?? "-"} / K9 ${s.spread["선발 OVR-K9"] ?? "-"}`
        + ` · 불펜 ${(s.spread.표본 ?? 0) - (s.spread.선발수 ?? 0)}명 ${s.spread["불펜 OVR-ERA"] ?? "-"}`);
      // ⚠ **OVR은 경기에 안 쓰이는 능력치를 29% 포함한다.** 경기가 보는
      // 4종(velocity·command·control·movement)만 따로 재서, OVR이 실제
      // 실력을 나타내는지 가른다
      log(`         구위(경기 4종) ERA ${s.spread["구위-ERA 상관"] ?? "-"}`
        + ` · K9 ${s.spread["구위-K9 상관"] ?? "-"}`
        + `   평균 OVR ${s.spread["평균 OVR"] ?? "-"} vs 구위 ${s.spread["평균 구위"] ?? "-"}`);
    }

    // ── ④ 재능 분포 — 꼬리가 실제 세계에 있는가 ───────────────
    //
    // ⚠ OVR 상관으로는 이걸 못 본다. 2026년에 태어난 꼬리는 16~18세라
    // 6시즌 뒤에도 22~24세다 — 효과가 1군 상위권에 도착하려면 10~15년이
    // 걸린다. 6시즌 측정만 보고 "안 변했다"로 되돌리면 안 된다.
    {
      const pot = app.potentialProbe();
      log("");
      log("④ 재능 분포 — 나이대별 잠재력 (꼬리가 깔렸는지)");
      for (const k of ["16-18세", "19-22세", "23-27세", "28세이상"]) {
        log(`   ${k.padEnd(9)} ${pot[k] ?? "-"}`);
      }
    }

    // ── 합산 상관 ────────────────────────────────────────────
    //
    // ⚠ **시즌별 상관은 표본 60이라 못 쓴다.** `ip >= 40` 필터가 사실상 선발만
    // 남겨서, 몇 명이 지표를 통째로 흔든다 — 같은 설정에서 −0.13 ~ −0.64가
    // 나왔고 "둘째 시즌에 무너진다"는 잘못된 결론에 이를 뻔했다.
    //
    // 시즌을 합쳐 표본을 늘린다. **불펜을 넣는 건 안 된다** — 마무리는
    // OVR이 높고 짧은 이닝만 던져 ERA가 낮으니 상관이 인위적으로 강해진다.
    const pooled = seasons.flatMap((s2) => s2.spread.행 ?? []);
    const corrOf = (rowsIn) => {
      if (rowsIn.length < 30) return null;
      const xs = rowsIn.map((r) => r[0]);
      const ys = rowsIn.map((r) => r[1]);
      const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
      const mx = mean(xs), my = mean(ys);
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2;
      }
      return dx > 0 && dy > 0 ? r3(num / Math.sqrt(dx * dy)) : 0;
    };
    if (pooled.length >= 30) {
      const sp = pooled.filter((r) => r[2] === 1);
      const rp = pooled.filter((r) => r[2] !== 1);
      log("");
      log(`   합산 ${seasons.length}시즌 · 표본 ${pooled.length}  →  OVR-ERA ${corrOf(pooled)}`);
      // ⚠ **선발만 봐야 능력치가 성적을 만드는지 알 수 있다.** 불펜은
      // 이닝이 짧아 ERA가 운에 흔들린다 — 섞으면 상관이 희석된다.
      // 투수 비율을 45%로 고친 뒤 불펜이 표본에 들어와 −0.47 → −0.19가 됐는데,
      // 그건 능력치가 무력해진 게 아니라 **표본 구성이 바뀐 것**일 수 있다.
      log(`   선발만 ${sp.length}명 → ${corrOf(sp) ?? "표본부족"}`
        + ` · 불펜만 ${rp.length}명 → ${corrOf(rp) ?? "표본부족"}`);
      log(`   (성격 계수는 **선발 값** 위에서 판단한다)`);
    }
  } catch (e) {
    log("ERR " + String((e && e.stack) || e).split("\n").slice(0, 8).join("\n    "));
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
  log("");
})().catch((e) => { log("ERR " + ((e && e.stack) || e)); process.exit(1); });
