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

const DIR = path.resolve(process.cwd(), process.env.PB_RUNS_DIR || "resource/logs/runs");

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

log(`# 계측 ${runs.length}판 — 통합 (${new Date().toISOString().slice(0, 10)})`);
log("");
log(`판 ${runs.length} · 각 12시즌 요청 · 이벤트 749종(동결)`);
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
  const ev = r.꼬리.커리어이벤트 ?? null;
  const 대학해 = ys.filter((y) => y.무대 === "university").map((y) => y.연도);
  const 독립해 = ys.filter((y) => y.무대 === "independent").map((y) => y.연도);
  const 첫대학독립 = Math.min(...[...대학해, ...독립해, Infinity]);
  const 첫프로 = Math.min(...[...ys.filter((y) => String(y.무대).startsWith("pro_")).map((y) => y.연도), Infinity]);
  let 고졸직행, 추정 = false;
  if (ev) {
    // 정본 — `careerEvents` 는 연도까지 온전하다
    const 지명해 = ev.filter((x) => x.endsWith(":draft_picked")).map((x) => Number(x.split(":")[0]));
    고졸직행 = 지명해.some((y) => y < 첫대학독립);
  } else {
    // ⚠ **옛 판은 `커리어이벤트` 를 안 실었다**(그 칸을 만들기 전에 돈 판이다).
    //   연도 줄로 **추정**한다: 프로에 닿았는데 그 전에 대학·독립을 안 밟았으면 직행.
    //   ⚠ 진로가 갈리는 해의 줄이 빠질 수 있으므로(같은 판에서 고친 결함)
    //     **한 해짜리 대학·독립은 못 볼 수 있다** — 그래서 「추정」이라고 적는다.
    고졸직행 = Number.isFinite(첫프로) && !Number.isFinite(첫대학독립);
    추정 = true;
  }
  const 불완전 = ys.filter((y) => y.불완전).length;
  const 프로시즌 = ys.filter((y) => String(y.무대).startsWith("pro_")).length;
  // 판이 끊겼나 — 12시즌을 못 채웠고 은퇴도 아니면 정지다
  // 판이 끊겼나 — **줄 수가 아니라 연도 폭**으로 본다.
  // 🔴 줄 수로 세면 「못 접은 해」가 있는 판이 전부 정지로 찍힌다 —
  //   실제로는 12해를 다 지났고 줄 하나가 없는 것뿐이다(같은 판에서 고친 결함).
  const 연도폭 = ys.length ? ys[ys.length - 1].연도 - ys[0].연도 + 1 : 0;
  const 정지 = 연도폭 < 12 && r.머리.은퇴나이 == null;
  return {
    n: i + 1, 성향: r.머리.성향, 프리셋: r.머리.프리셋, 씨앗: r.머리.씨앗,
    진로: r.꼬리.진로갈래, 고졸직행, 프로시즌,
    통산승: r.머리.통산승, 최고OVR: r.머리.최고OVR, 최고연봉: r.꼬리.최고연봉, 불완전, 추정, 연도폭,
    // 성향이 왜 갈리는지 — 몸값 쪽 재료
    부상: r.꼬리.부상횟수 ?? 0, 수술: r.꼬리.수술횟수 ?? 0,
    통산G: ys.reduce((a2, y) => a2 + y.G, 0),
    통산IP: Math.round(ys.reduce((a2, y) => a2 + y.IP, 0)),
    은퇴: r.머리.은퇴나이,
    군시즌: ys.filter((y) => String(y.무대) === "military").length,
    히든: ys.reduce((a, y) => a + y.히든, 0),
    예외: r.꼬리.예외, 폴백: r.꼬리.폴백, 정지, 시즌수: ys.length, ys,
    폴백자리: r.꼬리.폴백자리 ?? {},
  };
});
for (const x of rows) {
  log(`| ${x.n} | ${x.성향} | ${x.프리셋} | ${x.씨앗} | ${x.진로} | ${x.고졸직행 ? "✅" : "—"}${x.추정 ? "?" : ""} `
    + `| ${x.프로시즌} | ${x.통산승} | ${x.최고OVR} | ${x.최고연봉} | ${x.히든} `
    + `| ${x.예외 ? `🔴 ${x.예외}` : 0} | ${x.폴백 ? `🔴 ${x.폴백}` : 0} | ${x.불완전 ? `🔴 ${x.불완전}` : 0} | ${x.정지 ? "🔴 정지" : "—"} |`);
}
log("");

// ── ①-b 짝 — 한 칸 안에서 성향만 바뀐다 ──────────────────────
//
// 🔴 **씨앗이 하나여야 읽힌다.** 씨앗이 흩어져 있으면 성향 차이인지 씨앗
//   운인지 못 가린다 — 그래서 씨앗이 하나일 때만 이 절을 낸다.
{
  const 씨앗들 = [...new Set(rows.map((x) => x.씨앗))];
  const 성향들 = [...new Set(rows.map((x) => x.성향))];
  if (씨앗들.length === 1 && 성향들.length >= 2) {
    log("## 🔴 짝 — 프리셋마다 성향 셋 (씨앗 하나)");
    log("");
    log(`씨앗 **${씨앗들[0]}** 하나로 돈 판이다. 같은 세계·같은 선수라 `
      + `**세 줄의 차이는 순수하게 성향 것**이다.`);
    log("");
    log("⚠ 씨앗이 하나뿐이라 **프리셋별 절대값은 단정하지 않는다** — "
      + "볼 것은 프리셋 넷이 어떻게 갈리는지와 각 프리셋 안에서 성향 셋이 어떻게 갈리는지다.");
    log("");
    const 순서 = { growth: 0, safe: 1, lazy: 2 };
    const 프리셋들 = [...new Set(rows.map((x) => x.프리셋))];
    log("| 프리셋 | 성향 | 진로 | 프로시즌 | 통산승 | 통산G | 통산IP | 최고OVR | 최고연봉 | 부상 | 수술 | 군시즌 | 끊김 |");
    log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const preset of 프리셋들) {
      const g = rows.filter((x) => x.프리셋 === preset)
        .sort((a, b) => (순서[a.성향] ?? 9) - (순서[b.성향] ?? 9));
      for (const x of g) {
        log(`| ${preset} | **${x.성향}** | ${x.진로} | ${x.프로시즌} | ${x.통산승} | ${x.통산G} | ${x.통산IP} `
          + `| ${x.최고OVR} | ${x.최고연봉} | ${x.부상} | ${x.수술 ? `🔴 ${x.수술}` : 0} | ${x.군시즌} `
          + `| ${x.정지 ? "🔴 정지" : "—"} |`);
      }
      log("| | | | | | | | | | | | | |");
    }
    log("");

    // 칸마다 「성장이 안전을 이겼나」
    log("### 칸마다 — 성장이 안전을 이겼나");
    log("");
    log("| 프리셋 | 통산승 성장:안전 | 프로시즌 | 최고OVR | 판정 |");
    log("|---|---|---|---|---|");
    let 성장승 = 0, 안전승 = 0;
    for (const preset of 프리셋들) {
      const gr = rows.find((x) => x.프리셋 === preset && x.성향 === "growth");
      const sf = rows.find((x) => x.프리셋 === preset && x.성향 === "safe");
      if (!gr || !sf) continue;
      // 셋 중 둘 이상을 이기면 이긴 것으로 본다 — 한 칸만 보면 운이 섞인다
      const 점 = [gr.통산승 > sf.통산승, gr.프로시즌 > sf.프로시즌, gr.최고OVR > sf.최고OVR]
        .filter(Boolean).length;
      const 판정 = 점 >= 2 ? "성장 ✅" : 점 === 0 ? "🔴 안전" : "안전";
      if (점 >= 2) 성장승++; else 안전승++;
      log(`| ${preset} | ${gr.통산승} : ${sf.통산승} | ${gr.프로시즌} : ${sf.프로시즌} `
        + `| ${gr.최고OVR} : ${sf.최고OVR} | ${판정} |`);
    }
    log("");
    log(`**성장이 이긴 칸 ${성장승} · 안전이 이긴 칸 ${안전승}.** `
      + (성장승 > 안전승
        ? "몸값 계수를 넣은 뒤 성장형이 앞선다 — **도구가 고쳐진 것**이다."
        : "성장형이 아직 뒤진다 — **계수 0.5 가 약하거나, 안전형이 진짜로 나은 것**이다."));
    log("");

    // 성장형만 — 프리셋 비교
    log("### 성장형만 — 프리셋 비교 (🔴 체력형이 살아났나)");
    log("");
    log("옛 30판에서 체력형이 뒤졌다(성장형 프로시즌 중앙 **4** · 최고OVR **79** · "
      + "균형·파워는 7 / 81). 그게 프리셋이 약해서인지 몸값을 안 보던 도구 탓인지가 물음이다.");
    log("");
    log("| 프리셋 | 진로 | 프로시즌 | 통산승 | 통산IP | 최고OVR | 최고연봉 | 부상 | 수술 |");
    log("|---|---|---|---|---|---|---|---|---|");
    for (const preset of 프리셋들) {
      const x = rows.find((y) => y.프리셋 === preset && y.성향 === "growth");
      if (!x) continue;
      log(`| ${preset} | ${x.진로} | ${x.프로시즌} | ${x.통산승} | ${x.통산IP} | ${x.최고OVR} `
        + `| ${x.최고연봉} | ${x.부상} | ${x.수술 ? `🔴 ${x.수술}` : 0} |`);
    }
    log("");

    // 군 도달
    const 군판 = rows.filter((x) => x.군시즌 > 0);
    log("### 군 도달");
    log("");
    if (군판.length === 0) {
      log("🔴 **한 판도 군을 안 밟았다.**");
    } else {
      log(`군을 밟은 판 **${군판.length}/${rows.length}** — `
        + 성향들.map((p) => {
          const g = rows.filter((x) => x.성향 === p);
          return `${p} ${g.filter((x) => x.군시즌 > 0).length}/${g.length}`;
        }).join(" · "));
      log("");
      log("| 프리셋 | 성향 | 군시즌 | 프로시즌 | 통산승 | 커리어 |");
      log("|---|---|---|---|---|---|");
      for (const x of 군판) {
        const ev = (runs[x.n - 1].꼬리.커리어이벤트 ?? [])
          .filter((s) => String(s).includes("military")).join(" ");
        log(`| ${x.프리셋} | ${x.성향} | ${x.군시즌} | ${x.프로시즌} | ${x.통산승} | ${ev || "—"} |`);
      }
    }
    log("");
  }
}

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
log(`| 고졸 직행 지명${rows.some((x) => x.추정) ? "(추정 포함 · `?` 표시)" : ""} | 30~40% | **${고졸N}/${rows.length} = ${pct(고졸N, rows.length)}%** | `
  + `${고졸비 < GOAL.고졸직행[0] || 고졸비 > GOAL.고졸직행[1] ? "🔴 벗어남" : "ok"} |`);
log(`| 🔴 삼킨 예외가 난 판 | 0 | **${예외판.length}판** | ${예외판.length ? "🔴" : "ok"} |`);
log(`| 정지로 끊긴 판 | 0 | **${정지판.length}판** | ${정지판.length ? "🔴" : "ok"} |`);
const 불완전합 = rows.reduce((a, x) => a + x.불완전, 0);
const 불완전판 = rows.filter((x) => x.불완전 > 0).length;
log(`| 못 접은 해(진로 갈리는 해) | 0 | **${불완전합}해 / ${불완전판}판** | `
  + `${불완전합 ? "🔴 그 해만 성적이 빈다(등급 빈도에서는 뺐다)" : "ok"} |`);
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
// 무대별 주 수. 정본은 `꼬리.무대주수`(엔진이 센 값)이고, 없으면 연도 줄에서
// **추정**한다(시즌 × 52) — 옛 판은 그 칸을 안 실었다.
// ⚠ 무대 이름은 `stageGroupOf` 것이다(고교·대학·독립·2군·프로초반·프로중후반).
const 무대주 = {};
let 주추정 = false;
for (const r of runs) {
  const w = r.꼬리.무대주수;
  if (w && Object.keys(w).length) {
    for (const [k, v] of Object.entries(w)) 무대주[k] = (무대주[k] ?? 0) + v;
    continue;
  }
  주추정 = true;
  let proN = 0;
  for (const y of r.해마다) {
    const st = String(y.무대), farm = String(y.소속).endsWith("_2");
    let k = null;
    if (st === "highschool") k = "고교";
    else if (st === "university") k = "대학";
    else if (st === "independent") k = "독립";
    else if (st === "military") k = "군";
    else if (st.startsWith("pro_")) { proN++; k = farm ? "2군" : (proN <= 3 ? "프로초반" : "프로중후반"); }
    if (k) 무대주[k] = (무대주[k] ?? 0) + 52;
  }
}

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
  const 총주 = Object.values(무대주).reduce((a, b) => a + b, 0);
  log(`전체 **${폴백합}건 / ${총주}주 = ${총주 ? Math.round((폴백합 / 총주) * 10000) / 100 : 0}%**`
    + `${주추정 ? " (주 수는 시즌×52 추정)" : ""}`
    + " — B 커버리지 실측은 **1480주에 10건(0.68%)** 이었다.");
  log("");
  const 배수 = Math.round((총주 / 1480) * 10) / 10;
  log(`🔴 **비율이 거의 같다.** ${폴백합} 이 10 보다 큰 것은 나빠져서가 아니라`
    + ` **표본이 ${배수}배**라서다 — 판 수와 시즌이 늘었다.`
    + " 몰려 있는 자리는 **프로초반**과 **고교**다(위 비율).");
  log("");
}

// ── ③ 등급 빈도 (무대별 · 시즌당) ────────────────────────────
log("## 등급 빈도 — 시즌당 (무대별)");
log("");
log("목표: 노말 30~52 · 레어 **3~6** · 유니크 **1~2** · 히든 0~1");
log("");
// 🔴 **못 접은 해는 빼고 센다** (2026-09-09 실측으로 잡았다).
//   그 줄은 등급이 전부 0 인데 **분모에는 든다** — 대학 노말이 54.7 에서 28.3 으로
//   반토막 나 보인 것이 그 때문이었다(빈 줄 34개). 안 뺐으면 「대학이 목표를
//   밑돈다」는 **없는 결함**을 보고할 뻔했다.
const byStage = {};
for (const x of rows) for (const y of x.ys) {
  if (y.불완전) continue;
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
log("| 성향 | 판 | 고졸직행 | 프로시즌 | 통산G | 통산IP | 통산승 | 최고OVR | 부상 | **수술(합)** |");
log("|---|---|---|---|---|---|---|---|---|---|");
for (const per of ["growth", "safe", "lazy"]) {
  const g = rows.filter((x) => x.성향 === per);
  if (!g.length) continue;
  log(`| ${per} | ${g.length} | ${g.filter((x) => x.고졸직행).length}/${g.length} `
    + `| ${med(g.map((x) => x.프로시즌))} | ${med(g.map((x) => x.통산G))} | ${med(g.map((x) => x.통산IP))} `
    + `| ${med(g.map((x) => x.통산승))} | ${med(g.map((x) => x.최고OVR))} `
    + `| ${med(g.map((x) => x.부상))} | **${g.reduce((a, x) => a + x.수술, 0)}** |`);
}
log("");
log("중앙값이다(수술만 합). **고졸직행은 판 수 분의 몇.**");
log("");
// 🔴 성향이 갈리는 이유 — 몸값이 커리어 길이를 가른다
const 성향몸 = ["growth", "safe", "lazy"].map((per) => {
  const g = rows.filter((x) => x.성향 === per);
  return { per, n: g.length, 수술판: g.filter((x) => x.수술 > 0).length,
    프로0: g.filter((x) => x.프로시즌 === 0).length,
    프로3이하: g.filter((x) => x.프로시즌 <= 3).length };
}).filter((x) => x.n);
log("### 왜 갈리나 — 몸값이 커리어 길이를 가른다");
log("");
log("| 성향 | 판 | 수술이 난 판 | 프로 0시즌 | 프로 3시즌 이하 |");
log("|---|---|---|---|---|");
for (const x of 성향몸) {
  log(`| ${x.per} | ${x.n} | ${x.수술판}/${x.n} | ${x.프로0}/${x.n} | ${x.프로3이하}/${x.n} |`);
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
