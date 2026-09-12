#!/usr/bin/env node
/**
 * **등급 커버리지** — `npm run check:tiercoverage` (PLAN_EVENT_TIERS §10 · A 4-1)
 *
 * 무대별로 헤드리스를 돌려 넷을 본다:
 *
 *   ① **폴백 발동 0**            비면 한 등급 아래로 내려간 횟수. 0 이 아니면 **데이터 부족**
 *   ② 등급별 실제 빈도가 §2 범위 안  (`tier_rules.json` 의 `seasonFreq` 가 정본)
 *   ③ 시즌 상한 위반 0            rare 6 · unique 2 · hidden 1
 *   ④ 히든 커리어 상한 위반 0      종당 커리어 1회
 *
 * ⚠ **`check:tiers`(B 4-2)와 겹치는 줄은 저쪽에서 지운다.** 저기는 파일을 읽어
 *   「등급이 다 붙었나」를 보는 정적 검사이고, 여기는 **돌려서** 「그 등급이
 *   실제로 뜨나」를 본다. 둘은 다른 것을 본다 — 저쪽 다섯 줄 중 겹치는 것은 없다.
 *
 * 🔴 **「독립·2군은 레어·유니크가 0종이라 빨강이 정상이다」는 옛말이다**
 *   (여기 적혀 있던 2026-09-08 기록을 2026-09-12 에 지웠다).
 *   그 뒤 같은 날 B 가 두 무대를 채웠고, `npm run check:tiers` 로 재면
 *   **독립 60/15/8/3 · 2군 60/16/8/3**(노말/레어/유니크/히든)이다.
 *
 *   ⚠ **이 주석이 D 를 한 번 헛짚게 했다**(1.0.2 0단계). 콘텐츠가 이미 있는데
 *   「0종」이라고 적힌 글을 보고 콘텐츠 부족을 의심했다 — 「문서가 둘이면
 *   한쪽만 고쳐진 채 남는다」의 또 한 자리다.
 *
 *   그래서 **이 검사는 원인을 단정하지 않는다.** 빨강이면 「어느 무대·등급에서
 *   몇 번인지」를 표로 낼 뿐이고, 그것이 데이터 부족인지 배선인지 밸런스인지는
 *   표를 보고 가른다. 실제로 1.0.2 0단계에서 셋이 다 나왔다 —
 *   독립 0/12 는 **계측 드라이버**, 2군 3/12 는 **강등 알고리즘**,
 *   군 노말 부족은 **확률 상한 + 배선 버그**였다
 *   (`docs/SIM_102_STAGE0_2026-09-12.md`).
 *
 * ⚠ **한 판이 8~9분이다**(3시즌). 기본은 진로 셋 × 씨앗 셋 = 아홉 판이라
 *   한 시간을 넘는다 — 배경으로 걸어라. `--quick` 은 진로 셋 × 씨앗 하나다.
 *
 *   node scripts/check-tiercoverage.cjs [--seasons 3] [--seeds a,b,c] [--quick]
 *   node scripts/check-tiercoverage.cjs --json     (한 판 · 기계용 · 내부에서 쓴다)
 */
const path = require("node:path");
const fs = require("node:fs");

const ROOT = process.cwd();
const RULES = JSON.parse(fs.readFileSync(
  path.join(ROOT, "resource/data/master/events/tier_rules.json"), "utf8"));
const GRADES = ["normal", "rare", "unique", "hidden"];

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (process.argv[i + 1] ?? d) : d;
};
/**
 * 🔴 **3시즌으로는 고교밖에 못 잰다** (2026-09-08 실측). §10 이 「무대별 3시즌」이라
 *   적었는데, 주인공은 진로를 **고교 3년을 마친 뒤에** 고르므로 3시즌짜리 판은
 *   전부 고교에서 끝난다(실측: 고교 408주 · 대학 20주 · 나머지 0주).
 *   다음 무대에서도 3시즌을 보려면 **고교 3 + 그 뒤 3 = 7**이 있어야 한다.
 * ⚠ 그만큼 오래 걸린다(한 판 20분쯤). 급하면 `--seasons 3` 으로 고교만 본다 —
 *   그때 아래 「안 잰 무대」가 무엇을 못 봤는지 말한다.
 */
const SEASONS = parseInt(arg("seasons", "7"), 10) || 7;
const QUICK = process.argv.includes("--quick");
const SEEDS = String(arg("seeds", QUICK ? "20260803" : "20260803,31337,4242"))
  .split(",").map((s) => parseInt(s, 10)).filter(Boolean);

/**
 * 진로 — **무대를 직접 지정할 수 없다.** 진로는 성적이 정하므로 정책으로 민다.
 * 어느 무대를 실제로 밟았는지는 `tier.weeksByStage` 가 말해 준다 —
 * 그래서 「고교 3시즌만 도는 판」을 따로 만들지 않고 **밟은 무대별로 집계**한다.
 */
const PATHS = [
  ["프로행",  { draft: true,  university: false, independent: true,  overseas: false }],
  ["대학행",  { draft: false, university: true,  independent: true,  overseas: false }],
  ["독립행",  { draft: false, university: false, independent: true,  overseas: false }],
];

const MARK = "__TIERCOV_JSON__";
const log = (s) => process.stdout.write(s + "\n");

// ── 한 판 (자식 프로세스에서 돈다) ────────────────────────────────
async function runOne(seed, policy) {
  const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));
  let tmp = null;
  try {
    const boot = await headless.boot("tiercov");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "TIER", worldSeed: seed, seasonYear: 2026 });
    app.setCareerPolicy(policy);
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
    return { seasons: Math.max(1, app.currentSeason() - start), tier: f.tier, weeks: f["주수"], grade: f.grade };
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
}

if (process.argv.includes("--json")) {
  (async () => {
    const seed = parseInt(arg("seed", "0"), 10);
    const policy = JSON.parse(arg("policy", "{}"));
    const out = await runOne(seed, policy);
    log(MARK + JSON.stringify(out));
  })();
  return;
}

// ── 아홉 판을 모아 표를 낸다 ──────────────────────────────────────
const { spawnSync } = require("node:child_process");

/**
 * **자식이 왜 죽었는지 그대로 내놓는다** (2026-09-08 · A · L4 실사고).
 *
 * 🔴 왜 있나. 커버리지 하네스가 실패하면 **stdout 마지막 800자만** 찍었다.
 *   그런데 그날의 진짜 오류는 **stderr 에 있었다** —
 *   `[masterStore] load failed  …: 모르는 조건 타입 "outcome_within"`.
 *   화면엔 「출력에 __TIERCOV_JSON__ 가 없다」만 떠서, B 가 단판을 손으로
 *   직접 돌려서야 원인이 보였다. **하루를 태울 수 있는 자리다.**
 *
 * ⚠ **둘 다 낸다.** stderr 만 내면 진행 로그(stdout)가 사라지고, stdout 만 내면
 *   이번 일이 또 난다. 어느 쪽이 비어 있는지도 적는다 — 「비었다」가 신호다.
 * ⚠ 종료 코드·시그널도 적는다. maxBuffer 초과·타임아웃 킬은 출력이 아예 없어
 *   두 통 다 비는데, 그때 코드/시그널이 유일한 단서다.
 */
function childFailureReport(r, tail = 1500) {
  const out = String(r.stdout || "");
  const err = String(r.stderr || "");
  const lines = [];
  lines.push(`    종료코드 ${r.status ?? "없음"}${r.signal ? ` · 시그널 ${r.signal}` : ""}`
    + (r.error ? ` · 띄우기 실패 ${r.error.message}` : ""));
  lines.push(`    ── stderr (${err.length}자)${err ? "" : " — 비었다"}`);
  if (err) lines.push(err.slice(-tail));
  lines.push(`    ── stdout (${out.length}자)${out ? "" : " — 비었다"}`);
  if (out) lines.push(out.slice(-tail));
  return lines.join(String.fromCharCode(10));
}

const rows = [];
log("");
log("── 등급 커버리지 (§10) ────────────────────────────────────");
log(`  씨앗 ${SEEDS.join(" ")} · 진로 ${PATHS.map((p) => p[0]).join(" ")} · 각 ${SEASONS}시즌`);
log("  ⚠ 한 판이 8~9분이다 — 배경으로 걸어라");
log("");
// 🔴 **순차 하나였다** (2026-09-09 · 계측 2-2 에서 고쳤다). 12시즌 한 판이 두
//   시간이라 아홉 판이면 열여덟 시간이었다 — 그 그림이 안 돈다.
const JOBS = PATHS.flatMap(([name, policy]) => SEEDS.map((seed) => ({ name, policy, seed })));
log(`  동시 ${CONC}판 (실측 안전선 ${SAFE_CONCURRENCY} · PB_CONC 로 바꾼다)`);

(async () => {
  const results = await runPool(JOBS, CONC, async (j) => {
    const r = await runChild([
      __filename, "--json", "--seed", String(j.seed),
      "--policy", JSON.stringify(j.policy), "--seasons", String(SEASONS),
    ]);
    const line = String(r.stdout || "").split(String.fromCharCode(10)).find((l) => l.startsWith(MARK));
    log(`  ${j.name}/${j.seed} ${line ? "끝" : "🔴 실패"}`);
    return { j, r, line };
  });
  for (const { j, r, line } of results) {
    if (!line) {
      log(`  🔴 ${j.name}/${j.seed} 실패 — 출력에 ${MARK} 가 없다`);
      // ⚠ **stderr 를 먼저 낸다** (2026-09-08 실사고 · `childFailureReport` 머리말)
      log(childFailureReport(r));
      process.exit(1);
    }
    rows.push({ name: j.name, seed: j.seed, ...JSON.parse(line.slice(MARK.length)) });
  }
log("");

// 집계 — 무대별로 접는다. **어느 판에서 밟았는지가 아니라 무대가 축이다**
const stageWeeks = {};      // 무대 → 주 수
const stageEmit = {};       // 무대 → 등급 → 발동 수
const stageFallback = {};   // 무대 → 등급 → 폴백 수
let capViolation = 0, hiddenViolation = 0, fallbackTotal = 0, totalWeeks = 0;
for (const r of rows) {
  capViolation += r.tier.capViolation ?? 0;
  hiddenViolation += r.tier.hiddenCareerViolation ?? 0;
  fallbackTotal += r.tier.fallback ?? 0;
  totalWeeks += r.weeks ?? 0;
  for (const [st, w] of Object.entries(r.tier.weeksByStage ?? {})) {
    stageWeeks[st] = (stageWeeks[st] ?? 0) + w;
  }
  for (const [k, v] of Object.entries(r.tier.emittedByStage ?? {})) {
    const [st, g] = k.split("/");
    (stageEmit[st] ??= {})[g] = (stageEmit[st][g] ?? 0) + v;
  }
  for (const [k, v] of Object.entries(r.tier.fallbackBy ?? {})) {
    const [st, g] = k.split("/");
    (stageFallback[st] ??= {})[g] = (stageFallback[st][g] ?? 0) + v;
  }
}

// ⚠ **52주를 한 시즌으로 본다.** 무대는 시즌 중간에 바뀌므로 「그 무대에서
//   보낸 시즌 수」를 판 수로 셀 수 없다 — 주 수로 나눠야 뜻이 맞는다
const seasonsOf = (st) => (stageWeeks[st] ?? 0) / 52;

const stages = Object.keys(stageWeeks).sort((a, b) => stageWeeks[b] - stageWeeks[a]);
log("  무대별 등급 빈도 (시즌당) — §2 범위와 맞춘다");
log("  무대          주수   시즌  " + GRADES.map((g) => g.padStart(9)).join(""));
const outOfRange = [];
for (const st of stages) {
  const seasons = seasonsOf(st);
  const cells = GRADES.map((g) => {
    const per = seasons > 0 ? (stageEmit[st]?.[g] ?? 0) / seasons : 0;
    const f = RULES.seasonFreq?.[g];
    // ⚠ 표본이 반 시즌도 안 되는 무대는 범위를 안 잰다 — 「한 주 스쳤다」로
    //   빈도를 말하면 그건 숫자가 아니라 잡음이다
    if (f && seasons >= 0.5 && (per < f.min || per > f.max)) outOfRange.push([st, g, per.toFixed(1), `${f.min}~${f.max}`]);
    return per.toFixed(1).padStart(9);
  });
  log(`  ${st.padEnd(12)}${String(stageWeeks[st]).padStart(6)}${seasons.toFixed(1).padStart(7)}  ${cells.join("")}`);
}
log("");

log("  🔴 폴백 — 어느 무대의 어느 등급이 비었나 (0 이어야 한다)");
if (fallbackTotal === 0) {
  log("     없다");
} else {
  log("  무대          " + GRADES.map((g) => g.padStart(9)).join("") + "      합");
  for (const st of stages) {
    const by = stageFallback[st] ?? {};
    const sum = GRADES.reduce((a, g) => a + (by[g] ?? 0), 0);
    if (sum === 0) continue;
    log(`  ${st.padEnd(12)}  ` + GRADES.map((g) => String(by[g] ?? 0).padStart(9)).join("")
      + String(sum).padStart(9));
  }
  log(`  합계 ${fallbackTotal}회 / 주 ${totalWeeks}`);
}
log("");

/**
 * 🔴 **안 잰 무대를 이름으로 말한다.** 「검사가 무엇을 못 봤는지 말하지 않으면
 *   통과가 거짓말이 된다」(`check-roundtrip.cjs` 머리말). 실제로 3시즌 판은
 *   고교밖에 못 밟았는데, 그때 「폴백 27회」만 보면 **독립·2군이 초록인 줄 안다** —
 *   안 밟은 무대는 초록이 아니라 **안 잰 것**이다.
 * ⚠ 이건 실패가 아니라 **계측의 구멍**이다. 세어서 이름으로 남긴다.
 */
const declared = (RULES.stageGroups ?? []).map((g) => g.id);
const unseen = declared.filter((id) => (stageWeeks[id] ?? 0) < 26);   // 반 시즌 미만 = 못 잰 것
if (unseen.length) {
  log(`  ⚠ 반 시즌도 못 밟은 무대 ${unseen.length} — **안 잰 것이지 초록이 아니다**`);
  log(`      ${unseen.map((id) => `${id}(${stageWeeks[id] ?? 0}주)`).join(" · ")}`);
  log(`      ${SEASONS}시즌으로는 여기까지다. 더 보려면 --seasons 를 올려라`);
  log("");
}

let bad = 0;
const rule = (ok, what, extra) => {
  if (ok) { log(`  ok  ${what}`); return; }
  bad++; log(`  🔴 ${what}${extra ? " — " + extra : ""}`);
};
rule(fallbackTotal === 0, "폴백 발동 0", `${fallbackTotal}회 (위 표가 4-4 의 일감이다)`);
rule(outOfRange.length === 0, "등급별 빈도가 §2 범위 안", `${outOfRange.length}칸이 벗어났다`);
for (const [st, g, per, range] of outOfRange.slice(0, 12)) {
  log(`        ${st.padEnd(12)}${g.padEnd(8)}${per.padStart(6)} / 기대 ${range}`);
}
// 🔴 **시즌 상한은 없앴다** (사용자 확정 2026-09-08 · `tier_rules.json`
//    `_seasonCapDoc`). 상한을 아무도 안 걸면 `capViolation` 은 늘 0 이고
//    **아무것도 안 지킨다** — 늘 초록인 줄을 규칙으로 두면 통과가 거짓말이 된다.
//    그래서 **상한이 선언된 판에서만** 규칙으로 센다. 지금 등급 빈도를
//    지키는 것은 위의 「무대별 등급 빈도」 표 하나뿐이다.
const declaredCaps = Object.entries(RULES.seasonCap ?? {}).filter(([, v]) => typeof v === "number");
if (declaredCaps.length > 0) {
  rule(capViolation === 0, `시즌 상한 위반 0 (${declaredCaps.map(([g, v]) => `${g} ${v}`).join(" · ")})`, `${capViolation}건`);
} else {
  log("  --  시즌 상한 없음 — 등급 빈도는 위 표(`weights` 가 정한다)로만 본다");
}
rule(hiddenViolation === 0, "히든 커리어 상한 위반 0", `${hiddenViolation}건`);
log("");
if (bad) {
  log(`  🔴 어긴 규칙 ${bad}개`);
  log("  ⚠ **원인을 여기서 단정하지 않는다.** 위 무대×등급 표를 먼저 본다 —");
  log("    데이터 부족 · 배선 · 밸런스가 다 같은 모양으로 빨강이 된다.");
  log("    (독립·2군 종수는 `npm run check:tiers` 가 센다 — 2026-09-08 에 채웠다)");
  log("");
  process.exitCode = 1;
}

})();