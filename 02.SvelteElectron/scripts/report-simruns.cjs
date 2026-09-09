"use strict";
/**
 * **30판을 사람이 읽을 표로** — `npm run report:simruns`
 * (2026-09-09 · 서식 정본 `docs/PLAN_SIM_REPORT_2026-09-09.md`).
 *
 * `runs/#NN.json` 을 읽어 통합 표와 목표 대비를 낸다. 🔴 **목표를 벗어난 칸은
 * 빨강으로** 표시한다 — 사용자가 이 표를 보고 5단계 밸런스를 확정한다.
 *
 * ⚠ **여기서 값을 고치지 않는다.** 재고 표만 낸다.
 */
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(process.cwd(), process.env.PB_RUNS_DIR || "resource/logs/runs");

/** 지금 아는 목표 — 서식 정본 「목표를 벗어난 칸은 빨강으로」 */
const GOAL = {
  고졸직행: [0.30, 0.40],     // 사용자 확정
  레어: [3, 6], 유니크: [1, 2], 노말: [30, 52], 히든: [0, 1],
  폴백: [0, 0], 예외: [0, 0],
};
const mark = (v, [lo, hi]) => (v < lo || v > hi ? `🔴 ${v}` : `${v}`);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const med = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

const files = fs.readdirSync(DIR).filter((f) => /^#\d+\.json$/.test(f))
  .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
if (files.length === 0) throw new Error(`[report] ${DIR} 에 판이 없다`);
const runs = files.map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) }));

const L = [];
const log = (s = "") => L.push(s);

log(`# 계측 30판 — 통합 (${new Date().toISOString().slice(0, 10)})`);
log("");
log(`판 ${runs.length} · 각 ${runs[0].해마다.length}시즌(최대) · 이벤트 749종(동결)`);
log("");

// ── ① 판별 한 줄 ────────────────────────────────────────────
log("## 판별");
log("");
log("| # | 성향 | 프리셋 | 씨앗 | 진로 | 고졸직행 | 프로시즌 | 통산승 | 최고OVR | 최고연봉 | 히든 | 예외 | 폴백 | 못접은해 | 정지 |");
log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const rows = runs.map((r, i) => {
  const ys = r.해마다;
  // 🔴 **고졸 직행 = 대학·독립을 안 거치고 지명됐다.**
  //   최종 무대가 `pro_kbl` 이어도 대학을 거쳤으면 직행이 아니다.
  //   ⚠ **연도 줄로 세면 안 된다** — 진로가 갈리는 해는 줄이 빠질 수 있다
  //     (무대가 바뀌며 새 시즌이 직접 열린다). `커리어이벤트` 는 온전하다.
  const ev = r.꼬리.커리어이벤트 ?? [];
  const 지명해 = ev.filter((x) => x.endsWith(":draft_picked")).map((x) => Number(x.split(":")[0]));
  const 대학해 = ys.filter((y) => y.무대 === "university").map((y) => y.연도);
  const 독립해 = ys.filter((y) => y.무대 === "independent").map((y) => y.연도);
  // 지명된 해가 대학·독립을 **밟기 전**이면 직행이다
  const 첫대학독립 = Math.min(...[...대학해, ...독립해, Infinity]);
  const 고졸직행 = 지명해.some((y) => y < 첫대학독립);
  const 불완전 = ys.filter((y) => y.불완전).length;
  const 프로시즌 = ys.filter((y) => String(y.무대).startsWith("pro_")).length;
  // 판이 끊겼나 — 12시즌을 못 채웠고 은퇴도 아니면 정지다
  // 판이 끊겼나 — 12해를 못 채웠고 은퇴도 아니면 정지다
  // ⚠ 못 접은 해(`불완전`)도 **지나긴 지났다** — 시즌 수에는 넣는다
  const 정지 = ys.length < 12 && r.머리.은퇴나이 == null;
  return {
    n: i + 1, 성향: r.머리.성향, 프리셋: r.머리.프리셋, 씨앗: r.머리.씨앗,
    진로: r.꼬리.진로갈래, 고졸직행, 프로시즌,
    통산승: r.머리.통산승, 최고OVR: r.머리.최고OVR, 최고연봉: r.꼬리.최고연봉, 불완전,
    히든: ys.reduce((a, y) => a + y.히든, 0),
    예외: r.꼬리.예외, 폴백: r.꼬리.폴백, 정지, 시즌수: ys.length, ys,
    폴백자리: r.꼬리.폴백자리 ?? {},
  };
});
for (const x of rows) {
  log(`| ${x.n} | ${x.성향} | ${x.프리셋} | ${x.씨앗} | ${x.진로} | ${x.고졸직행 ? "✅" : "—"} `
    + `| ${x.프로시즌} | ${x.통산승} | ${x.최고OVR} | ${x.최고연봉} | ${x.히든} `
    + `| ${x.예외 ? `🔴 ${x.예외}` : 0} | ${x.폴백 ? `🔴 ${x.폴백}` : 0} | ${x.불완전 ? `🔴 ${x.불완전}` : 0} | ${x.정지 ? "🔴 정지" : "—"} |`);
}
log("");

// ── ② 목표 대비 ─────────────────────────────────────────────
const 고졸N = rows.filter((x) => x.고졸직행).length;
const 고졸비 = 고졸N / rows.length;
const 예외판 = rows.filter((x) => x.예외 > 0);
const 정지판 = rows.filter((x) => x.정지);
const 폴백합 = rows.reduce((a, x) => a + x.폴백, 0);

log("## 목표 대비");
log("");
log("| 무엇 | 목표 | 실측 | |");
log("|---|---|---|---|");
log(`| 고졸 직행 지명 | 30~40% | **${고졸N}/${rows.length} = ${pct(고졸N, rows.length)}%** | `
  + `${고졸비 < GOAL.고졸직행[0] || 고졸비 > GOAL.고졸직행[1] ? "🔴 벗어남" : "ok"} |`);
log(`| 🔴 삼킨 예외가 난 판 | 0 | **${예외판.length}판** | ${예외판.length ? "🔴" : "ok"} |`);
log(`| 정지로 끊긴 판 | 0 | **${정지판.length}판** | ${정지판.length ? "🔴" : "ok"} |`);
const 불완전합 = rows.reduce((a, x) => a + x.불완전, 0);
log(`| 못 접은 해(진로 갈리는 해) | 0 | **${불완전합}해** | ${불완전합 ? "🔴 성적이 그 해만 빈다" : "ok"} |`);
log(`| 폴백 | 0 | **${폴백합}** | ${폴백합 ? "🔴" : "ok"} |`);
log("");

if (예외판.length) {
  log("### 🔴 예외가 난 판 — 파야 한다");
  log("");
  for (const x of 예외판) {
    const r = runs[x.n - 1];
    log(`- **#${x.n}** ${x.성향}/${x.프리셋}/${x.씨앗} — 예외 **${x.예외}회**`);
    for (const s of (r.꼬리.예외표본 ?? [])) log(`  - ${s}`);
  }
  log("");
}
if (정지판.length) {
  log("### 🔴 정지로 끊긴 판");
  log("");
  for (const x of 정지판) log(`- **#${x.n}** ${x.성향}/${x.프리셋}/${x.씨앗} — ${x.시즌수}시즌에서 끊겼다`);
  log("");
}
// 무대별 폴백 비율 — 분모가 있어야 「많다」를 말할 수 있다
const 무대주 = {};
for (const r of runs) for (const [k, v] of Object.entries(r.꼬리.무대주수 ?? {})) 무대주[k] = (무대주[k] ?? 0) + v;

if (폴백합) {
  log("### 🔴 폴백 — 어느 무대·등급에서");
  log("");
  const by = {};
  for (const x of rows) for (const [k, v] of Object.entries(x.폴백자리)) by[k] = (by[k] ?? 0) + v;
  log("| 무대/등급 | 횟수 | 그 무대 주 | 비율 |");
  log("|---|---|---|---|");
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
    const w = 무대주[k.split("/")[0]] ?? 0;
    log(`| ${k} | ${v} | ${w || "—"} | ${w ? (Math.round((v / w) * 10000) / 100) + "%" : "—"} |`);
  }
  log("");
  log(`전체 ${폴백합}건 / ${Object.values(무대주).reduce((a, b) => a + b, 0)}주`
    + ` = ${(Math.round((폴백합 / Math.max(1, Object.values(무대주).reduce((a, b) => a + b, 0))) * 10000) / 100)}%`
    + " — B 커버리지 실측은 1480주에 10건(0.68%)이었다");
  log("");
}

// ── ③ 등급 빈도 (무대별 · 시즌당) ────────────────────────────
log("## 등급 빈도 — 시즌당 (무대별)");
log("");
log("목표: 노말 30~52 · 레어 **3~6** · 유니크 **1~2** · 히든 0~1");
log("");
const byStage = {};
for (const x of rows) for (const y of x.ys) {
  const k = String(y.무대);
  (byStage[k] ??= { n: 0, normal: 0, rare: 0, unique: 0, hidden: 0, notice: 0 });
  byStage[k].n++; byStage[k].normal += y.노말; byStage[k].rare += y.레어;
  byStage[k].unique += y.유니크; byStage[k].hidden += y.히든; byStage[k].notice += y.통지;
}
log("| 무대 | 시즌 | 노말 | 레어 | 유니크 | 히든 | 통지 |");
log("|---|---|---|---|---|---|---|");
const r1 = (v, n) => Math.round((v / Math.max(1, n)) * 10) / 10;
for (const [k, v] of Object.entries(byStage).sort((a, b) => b[1].n - a[1].n)) {
  log(`| ${k} | ${v.n} | ${mark(r1(v.normal, v.n), GOAL.노말)} | ${mark(r1(v.rare, v.n), GOAL.레어)} `
    + `| ${mark(r1(v.unique, v.n), GOAL.유니크)} | ${mark(r1(v.hidden, v.n), GOAL.히든)} | ${r1(v.notice, v.n)} |`);
}
log("");

// ── ④ 무대 도달 — 「안 잰 것이지 초록이 아니다」로 남아 있던 자리 ──
log("## 무대 도달 — 12시즌이면 밟히는가");
log("");
const reach = { 고교: 0, 대학: 0, 독립: 0, "2군": 0, "프로 1군": 0, 군: 0, "프로 중후반(4년+)": 0 };
for (const x of rows) {
  const st = new Set(x.ys.map((y) => String(y.무대)));
  const farm = x.ys.some((y) => String(y.소속).endsWith("_2"));
  const pro1 = x.ys.some((y) => String(y.무대).startsWith("pro_") && !String(y.소속).endsWith("_2"));
  if (st.has("highschool")) reach.고교++;
  if (st.has("university")) reach.대학++;
  if (st.has("independent")) reach.독립++;
  if (farm) reach["2군"]++;
  if (pro1) reach["프로 1군"]++;
  if (st.has("military")) reach.군++;
  if (x.프로시즌 >= 4) reach["프로 중후반(4년+)"]++;
}
log("| 무대 | 밟은 판 |");
log("|---|---|");
for (const [k, v] of Object.entries(reach)) log(`| ${k} | ${v}/${rows.length} ${v === 0 ? "🔴 한 판도 안 밟았다" : ""} |`);
log("");

// ── ⑤ 성향별 폭 ─────────────────────────────────────────────
log("## 성향별 폭");
log("");
log("| 성향 | 판 | 고졸직행 | 프로시즌 중앙 | 통산승 중앙 | 최고OVR 중앙 | 히든 합 |");
log("|---|---|---|---|---|---|---|");
for (const per of ["growth", "safe", "lazy"]) {
  const g = rows.filter((x) => x.성향 === per);
  if (!g.length) continue;
  log(`| ${per} | ${g.length} | ${g.filter((x) => x.고졸직행).length}/${g.length} `
    + `| ${med(g.map((x) => x.프로시즌))} | ${med(g.map((x) => x.통산승))} `
    + `| ${med(g.map((x) => x.최고OVR))} | ${g.reduce((a, x) => a + x.히든, 0)} |`);
}
log("");

// ── ⑥ 프리셋별 (성장 20판) ──────────────────────────────────
const gr = rows.filter((x) => x.성향 === "growth");
if (gr.length) {
  log("## 프리셋별 (성장 우선 판만 — 밸런스 기준)");
  log("");
  log("| 프리셋 | 판 | 고졸직행 | 프로시즌 중앙 | 최고OVR 중앙 |");
  log("|---|---|---|---|---|");
  for (const ps of ["balanced", "power", "control", "stamina"]) {
    const g = gr.filter((x) => x.프리셋 === ps);
    if (!g.length) continue;
    log(`| ${ps} | ${g.length} | ${g.filter((x) => x.고졸직행).length}/${g.length} `
      + `| ${med(g.map((x) => x.프로시즌))} | ${med(g.map((x) => x.최고OVR))} |`);
  }
  log("");
}

const md = L.join("\n") + "\n";
fs.writeFileSync(path.join(DIR, "report.md"), md);
console.log(md);
console.log(`  → ${path.relative(process.cwd(), path.join(DIR, "report.md"))}`);
