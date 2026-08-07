#!/usr/bin/env node
// 소식 **종류별 인구조사** — 통합 후보를 찾기 위한 조사 도구.
//
//   npm run measure:messagekinds                 6시즌 (고교→대학/독립→프로)
//   node scripts/measure-message-kinds.cjs --seasons 8
//
// `measure:mailbox`는 "얼마나 밀려나는가"를 본다. 이건 **무엇이 몇 통 오는가**다.
// 분류(`category`)가 4종뿐이라 `system`·`news`에 뭉뚱그려지는데 실제 종류는 40종이
// 넘고, 어느 종류가 다른 종류를 밀어내는지는 분류로 안 보인다.
//
// ⚠ **메일함이 아니라 생산 시점에서 센다.** 상한(200)에 밀려 사라진 뒤에 세면
// ①이미 없어진 종류가 0으로 보이고 ②여러 시즌을 밀면 고교와 프로 소식이 한
// 상자에 섞인다. 시즌 경계마다 생산 누계를 찍어 **차분**하고, 그 시점의 커리어
// 단계를 같이 남긴다 — 그래야 "프로가 되면 무엇이 늘어나는가"를 볼 수 있다.

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 6);
const SEED = arg("seed", 20260803);
const TOP = arg("top", 14);

const log = (s) => process.stdout.write(s + "\n");

(async () => {
  log("");
  log("── 소식 종류별 인구조사 (단계별) ─────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("msgkinds");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "MKIND", worldSeed: SEED, seasonYear: 2026 });
    // 프로까지 밀어야 `msg-standings`(비고교 월간)를 볼 수 있다
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    let guard = 0;
    let prev = { 총생산: 0, 종류별: {} };
    let curSeason = start;
    const seasons = [];   // { year, stage, total, byKind }

    // ⚠ **시즌이 끝난 순간의 단계를 쓰면 안 된다.** 그건 이미 다음 단계다 —
    // 고3(2028) 시즌 소식이 통째로 `pro_kbl`에 붙어 `msg-hs-digest`(고교 전용)가
    // 프로에 3건 잡혔다. 그 한 줄이 "프로에서 무엇이 늘어나는가"를 통째로
    // 틀리게 만든다. **시즌 시작 시점**의 단계를 들고 있다가 그걸 쓴다.
    let stageAtStart = app.careerStage();

    const cut = () => {
      const now = app.mailboxProduceProbe();
      const byKind = {};
      for (const [k, v] of Object.entries(now.종류별)) {
        const d = v - (prev.종류별[k] ?? 0);
        if (d > 0) byKind[k] = d;
      }
      seasons.push({
        year: curSeason,
        stage: stageAtStart,
        endStage: app.careerStage(),
        total: now.총생산 - prev.총생산,
        byKind,
      });
      prev = { 총생산: now.총생산, 종류별: { ...now.종류별 } };
      stageAtStart = app.careerStage();
    };

    while (guard++ < 12000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;
      if (app.currentSeason() !== curSeason) { cut(); curSeason = app.currentSeason(); }
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      break;
    }
    cut();

    const p = app.mailboxProbe();
    // ⚠ 보유가 상한을 넘을 수 있다 — **미결 선택지는 상한을 넘겨서라도 남기기**
    // 때문이다(버리면 진행이 막힌다). 초과분이 곧 안 풀린 선택지 수이므로
    // 같이 찍는다. 안 찍으면 "상한이 안 지켜진다"로 잘못 읽는다
    log(`      ${start}~${app.currentSeason()} · 총 생산 ${prev.총생산}건 · 메일함 ${p.보유}/${p.상한}`
      + ` (미결 ${p.미결선택}) · 밀려남 ${p["밀려남(누계)"]}`);
    log("");

    // ── 단계별 합산 ────────────────────────────────────────────
    const byStage = {};
    for (const s of seasons) {
      const st = (byStage[s.stage] ??= { years: 0, total: 0, byKind: {} });
      st.years++;
      st.total += s.total;
      for (const [k, v] of Object.entries(s.byKind)) st.byKind[k] = (st.byKind[k] ?? 0) + v;
    }

    log("  시즌별  (단계는 시즌 **시작** 시점. 끝 단계가 다르면 그 해에 넘어간 것이다)");
    log("    연도  시작단계        끝단계          생산");
    for (const s of seasons) {
      log(`    ${s.year}  ${String(s.stage).padEnd(16)}${String(s.endStage).padEnd(16)}${String(s.total).padStart(5)}`
        + (s.stage !== s.endStage ? "   ← 전환" : ""));
    }
    log("");

    for (const [stage, st] of Object.entries(byStage)) {
      log(`  [${stage}] ${st.years}시즌 · 총 ${st.total}건 · 시즌당 ${(st.total / st.years).toFixed(0)}건`);
      const rows = Object.entries(st.byKind).sort((a, b) => b[1] - a[1]).slice(0, TOP);
      for (const [k, v] of rows) {
        const perSeason = (v / st.years).toFixed(1);
        const pct = (v / st.total * 100).toFixed(1);
        log(`      ${k.padEnd(26)}${String(v).padStart(5)}   시즌당 ${perSeason.padStart(5)}   ${pct.padStart(5)}%`);
      }
      log("");
    }

    // ── 다이제스트 통합 대상만 따로 ────────────────────────────
    // Phase 2에서 이 넷이 한 통으로 합쳐진다. 지금 몇 통인지가 기준선이다
    const TARGETS = ["msg-neighbor", "msg-myrank", "msg-hs-digest", "msg-standings"];
    log("  ▶ 다이제스트 통합 대상 (Phase 2에서 msg-digest 하나로)");
    log("    단계            " + TARGETS.map((t) => t.replace("msg-", "").padStart(10)).join("") + "      합계  시즌당");
    for (const [stage, st] of Object.entries(byStage)) {
      const vals = TARGETS.map((t) => st.byKind[t] ?? 0);
      const sum = vals.reduce((a, b) => a + b, 0);
      log(`    ${stage.padEnd(14)}` + vals.map((v) => String(v).padStart(10)).join("")
        + String(sum).padStart(10) + (sum / st.years).toFixed(1).padStart(8));
    }
    log("");
    log("  읽는 법");
    log("    · 시즌당 통수가 곧 Phase 2의 절감 상한이다 (합쳐지면 월 1통 = 13통)");
    log("    · 단계가 바뀔 때 늘어나는 종류가 통합 값어치가 큰 것이다");
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
})();
