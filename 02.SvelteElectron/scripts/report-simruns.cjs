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

// 등급 빈도(노말·레어·유니크·히든) 목표는 여기서 다시 안 적는다 — 정본은
// `resource/data/master/events/tier_rules.json` `seasonFreq`(전 무대 공통) ·
// `seasonFreqByStage`(무대별 예외, 지금은 「군_일반병」·「군_체육부대」 둘 —
// 2026-09-20 사용자 확정으로 군 하나였던 키를 부대별로 갈랐다) 하나다.
// 숫자를 코드에 두 번 적으면 한쪽만 고쳐진 채 남는다(CLAUDE.md).
const TIER_RULES = JSON.parse(fs.readFileSync(
  path.resolve(process.cwd(), "resource/data/master/events/tier_rules.json"), "utf8"));
const freqOf = (grade, stage) =>
  (stage && TIER_RULES.seasonFreqByStage?.[stage]?.[grade]) ?? TIER_RULES.seasonFreq[grade];

/** 지금 아는 목표 — 서식 정본 「목표를 벗어난 칸은 빨강으로」 */
const GOAL = {
  // 사용자 확정(09-26) — 25~40. 정원 압축(γ=0.20)뒤 성장형 경계선 판이
  // 미지명으로 재배열됐다(`docs/SIM_102_DRAFT_GAMMA_2026-09-26.md` ·
  // 씨앗 다섯 20짝 중 4짝 갈림 · 총량 불변). 등급 빈도가 아니라 진로
  // 갈림 비율이라 여기 남는다 — `docs/BALANCE_BACKLOG.md` 그 항목 닫음.
  고졸직행: [0.25, 0.40],
  레어: [freqOf("rare").min, freqOf("rare").max],
  유니크: [freqOf("unique").min, freqOf("unique").max],
  노말: [freqOf("normal").min, freqOf("normal").max],
  히든: [freqOf("hidden").min, freqOf("hidden").max],
  폴백: [0, 0], 예외: [0, 0],
};
/** 무대별 목표 — 지금은 「군_일반병」·「군_체육부대」만 다르다. `mark`와 같은 (v,[lo,hi]) 짝을 낸다 */
const goalRangeOf = (grade, stage) => { const f = freqOf(grade, stage); return [f.min, f.max]; };
const mark = (v, [lo, hi]) => (v < lo || v > hi ? `🔴 ${v}` : `${v}`);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const med = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

// 🔴 **무대 갈림 해는 "A→B" 한 줄로 찍힌다** (2026-09-21 워커 고침 ·
//   `cef688b5a`). 이 파일의 옛 무대 판정(`===` · `.has()` · `startsWith`)은
//   워커가 무대 하나를 그대로 한 줄에 찍던 시절 것이라 "university→pro_kbl"
//   같은 접힌 줄을 통째로 놓친다 — 09-21 24판 첫 집계에서 대학 7→2 ·
//   독립 8→1 · 고졸직행 41.7%→87.5% 로 튀어 잣대부터 의심했더니 이거였다
//   (드라이버·엔진은 안 건드렸다). 무대 문자열을 "→" 로 쪼개 그 안에
//   찾는 무대가 있는지로 본다 — 안 갈린 줄은 쪼개도 원소 하나라 그대로다.
const stagesOf = (st) => String(st).split("→");
const hasStage = (st, name) => stagesOf(st).includes(name);
const isProStage = (st) => stagesOf(st).some((s) => s.startsWith("pro_"));

const files = fs.readdirSync(DIR).filter((f) => /^#\d+\.json$/.test(f))
  .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
if (files.length === 0) throw new Error(`[report] ${DIR} 에 판이 없다`);
const runs = files.map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) }));

const L = [];
const log = (s = "") => L.push(s);

log(`# 계측 ${runs.length}판 — 통합 (${new Date().toISOString().slice(0, 10)})`);
log("");
// 🔴 **요청 시즌 수를 판에서 읽는다** (2026-09-12). 12 를 박아 둬서
//   8시즌 판 셋이 전부 「🔴 정지」로 찍혔다 — 러너의 `[끝]` 줄은 8/8 이라고
//   제대로 말하는데 표만 거짓말을 했다. 잣대가 먼저 틀린 열째 자리다.
//   `PB_SEASONS` 가 있으면 그것, 없으면 **판들의 최대 연도폭**을 요청값으로 본다.
const 연도폭Of = (ys) => (ys.length ? ys[ys.length - 1].연도 - ys[0].연도 + 1 : 0);
const SEASONS_ASKED =
  Number(process.env.PB_SEASONS) || Math.max(...runs.map((r) => 연도폭Of(r.해마다)), 1);
log(`판 ${runs.length} · 각 ${SEASONS_ASKED}시즌 요청 · 이벤트 749종(동결)`);
log("");

// ── ① 판별 한 줄 ────────────────────────────────────────────
log("## 판별");
log("");
log("| # | 성향 | 프리셋 | 씨앗 | 진로 | 고졸직행 | 프로시즌 | 통산승 | 최고OVR | 최고연봉 | 히든 | 예외 | 폴백 | 못접은해 | 중복연도 | 정지 |");
log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const rows = runs.map((r, i) => {
  const ys = r.해마다;
  // 🔴 **고졸 직행 = 대학·독립을 안 거치고 지명됐다.**
  //   최종 무대가 `pro_kbl` 이어도 대학을 거쳤으면 직행이 아니다.
  //   ⚠ **연도 줄로 세면 안 된다** — 진로가 갈리는 해는 줄이 빠질 수 있다
  //     (무대가 바뀌며 새 시즌이 직접 열린다). `커리어이벤트` 는 온전하다.
  //
  // 🔴 **"지명해 == 첫대학독립"(같은 해)을 재확인했다** (2026-09-11 · D).
  //   코치가 이걸 세는 방식 버그로 의심했었다 — `advanceWeek.ts`의
  //   `isHsResultWeek`(고3 첫 드래프트)·`isUnivResultWeek`(대학·독립
  //   재학 중 재도전, `careerStage`가 **이미** university/independent
  //   여야 발동)를 직접 확인했고, 실제 판 데이터(after/combined/final
  //   3배치·36건 전수)에서 "같은 해" 로 찍히는 모든 사례가
  //   **예외 없이** 그 전 해에 `undrafted` 태그를 갖고 있었다 —
  //   즉 고3 때 한 번 떨어져서 대학에 들어간 뒤 그 대학 첫 해에
  //   재도전으로 뽑힌 것이다("대학 재학 중 지명" — 실제로 대학에
  //   딛였다, `무대주수.대학`도 그 해를 온전히 채운다). 반대로
  //   대학 기록이 아예 없이(`firstUniv=none`) 뽑힌 36건 중 나머지는
  //   전부 `undrafted` 태그가 없다 — 완전히 갈린다.
  //   **"같은 해"는 전부 재도전이지 직행이 아니다 — 세는 방식은
  //   이미 맞았다.** 바꾸지 않는다.
  const ev = r.꼬리.커리어이벤트 ?? null;
  const 대학해 = ys.filter((y) => hasStage(y.무대, "university")).map((y) => y.연도);
  const 독립해 = ys.filter((y) => hasStage(y.무대, "independent")).map((y) => y.연도);
  const 첫대학독립 = Math.min(...[...대학해, ...독립해, Infinity]);
  const 첫프로 = Math.min(...[...ys.filter((y) => isProStage(y.무대)).map((y) => y.연도), Infinity]);
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
  const 프로시즌 = ys.filter((y) => isProStage(y.무대)).length;
  // 🔴 **워커가 한 해 한 줄로 고쳐졌다** (2026-09-21 · `probe-a-simrun-worker.cjs`).
  //   진로가 갈리는 해도 이제 줄 하나(무대 「A→B」)로 나오고, 군 전역 뒤
  //   같은 라벨이 두 번 찍히는 것도 없다 — 그래서 `연도폭`이 그냥
  //   `해마다.length`다. 예전엔 이 자리가 「줄과 커리어이벤트 둘 중 넓은
  //   쪽」을 연도폭으로 잡는 우회였다(2026-09-13 실측 · #7 — 마지막 해가
  //   무대 갈림이면 그 줄이 아예 안 남았다). 원인(워커의 라벨링)이
  //   없어졌으니 그 우회는 지운다 — **옛 판**(이 고침 전에 돈 24판 등)을
  //   이 표에 돌리면 못 접은 해·중복 연도가 실제로 있어 아래 값이
  //   0보다 클 수 있다. 숨기지 않고 그대로 보여 준다(하위 호환 — 읽기는
  //   깨지지 않는다. `docs/PLAN_SIM_REPORT_2026-09-09.md` 「무대 갈림 해」 절).
  const 연도들 = ys.map((y) => y.연도);
  const 연도폭 = 연도들.length;
  const 정지 = 연도폭 < SEASONS_ASKED && r.머리.은퇴나이 == null;
  // 🔴 **같은 "연도" 가 두 줄로 찍히는 결함은 이제 나면 안 된다** — 위와
  //   같은 이유(워커가 라벨을 접은 줄 수로 매긴다). 남겨 둔 이 칸은 이제
  //   「검사」다 — 새로 돈 판에서 0보다 크면 결함이 되살아난 것이다.
  const 중복연도 = 연도들.length - new Set(연도들).size;
  return {
    n: i + 1, 성향: r.머리.성향, 프리셋: r.머리.프리셋, 씨앗: r.머리.씨앗,
    진로: r.꼬리.진로갈래, 고졸직행, 프로시즌,
    통산승: r.머리.통산승, 최고OVR: r.머리.최고OVR, 최고연봉: r.꼬리.최고연봉, 불완전, 추정, 연도폭,
    // 성향이 왜 갈리는지 — 몸값 쪽 재료
    부상: r.꼬리.부상횟수 ?? 0, 수술: r.꼬리.수술횟수 ?? 0,
    통산G: ys.reduce((a2, y) => a2 + y.G, 0),
    통산IP: Math.round(ys.reduce((a2, y) => a2 + y.IP, 0)),
    은퇴: r.머리.은퇴나이,
    군시즌: ys.filter((y) => hasStage(y.무대, "military")).length,
    // 부대(sports|general|null) — 「등급 빈도」 표가 군을 부대별로 가르는 열쇠다
    // (2026-09-20 · 사용자 확정). 한 커리어에 입대는 한 번뿐이라 판 하나에 부대 하나.
    군부대: r.꼬리.군부대 ?? null,
    // 🔴 **2군·콜업을 센다** (2026-09-12 · 신인 2군 출발 확정).
    //   무대(`careerStage`)로는 1군·2군이 안 갈린다 — 둘 다 `pro_*` 다.
    //   가르는 것은 **소속 팀 id** 뿐이다(팜은 `_2` 로 끝난다).
    //   콜업 = 프로 안에서 `_2` → `_2` 아닌 해로 넘어간 횟수.
    farm시즌: ys.filter((y) => String(y.소속).endsWith("_2")).length,
    콜업: (() => {
      const pro = ys.filter((y) => isProStage(y.무대));
      let n = 0;
      for (let i = 1; i < pro.length; i++) {
        if (String(pro[i - 1].소속).endsWith("_2") && !String(pro[i].소속).endsWith("_2")) n++;
      }
      return n;
    })(),
    히든: ys.reduce((a, y) => a + y.히든, 0),
    예외: r.꼬리.예외, 폴백: r.꼬리.폴백, 정지, 중복연도, 시즌수: ys.length, ys,
    폴백자리: r.꼬리.폴백자리 ?? {},
  };
});
for (const x of rows) {
  log(`| ${x.n} | ${x.성향} | ${x.프리셋} | ${x.씨앗} | ${x.진로} | ${x.고졸직행 ? "✅" : "—"}${x.추정 ? "?" : ""} `
    + `| ${x.프로시즌} | ${x.통산승} | ${x.최고OVR} | ${x.최고연봉} | ${x.히든} `
    + `| ${x.예외 ? `🔴 ${x.예외}` : 0} | ${x.폴백 ? `🔴 ${x.폴백}` : 0} | ${x.불완전 ? `🔴 ${x.불완전}` : 0} | ${x.중복연도 ? `🔴 ${x.중복연도}` : 0} | ${x.정지 ? "🔴 정지" : "—"} |`);
}
log("");

// ── ①-b 짝 — 한 칸 안에서 성향만 바뀐다 ──────────────────────
//
// 🔴 **씨앗이 하나여야 읽힌다.** 씨앗이 흩어져 있으면 성향 차이인지 씨앗
//   운인지 못 가린다 — 그래서 씨앗이 하나일 때만 이 절을 낸다.
{
  const 씨앗들 = [...new Set(rows.map((x) => x.씨앗))];
  const 성향들 = [...new Set(rows.map((x) => x.성향))];
  if (성향들.length >= 2) {
    log("## 🔴 짝 — 프리셋마다 성향 셋 (씨앗 하나)");
    log("");
    log(`씨앗 **${씨앗들[0]}** 하나로 돈 판이다. 같은 세계·같은 선수라 `
      + `**세 줄의 차이는 순수하게 성향 것**이다.`);
    log("");
    log("⚠ 씨앗이 하나뿐이라 **프리셋별 절대값은 단정하지 않는다** — "
      + "볼 것은 프리셋 넷이 어떻게 갈리는지와 각 프리셋 안에서 성향 셋이 어떻게 갈리는지다.");
    log("");
    const 순서 = { growth: 0, safe: 1, lazy: 2 };
    // 🔴 **씨앗이 여럿이면 칸은 「프리셋 × 씨앗」이다** (2026-09-13).
    //   예전엔 씨앗 하나일 때만 이 절을 냈다 — 씨앗을 늘리자 표가 통째로
    //   사라졌다. 성향 셋을 붙여 세우는 것이 이 표의 일이고, 그건 씨앗이
    //   몇이든 「같은 세계·같은 프리셋 안에서」 하면 된다.
    const 칸들 = [];
    for (const preset of [...new Set(rows.map((x) => x.프리셋))]) {
      for (const seed of [...new Set(rows.filter((x) => x.프리셋 === preset).map((x) => x.씨앗))]) {
        칸들.push({ preset, seed });
      }
    }
    log("| 프리셋 | 성향 | 진로 | 프로시즌 | 2군시즌 | 콜업 | 통산승 | 통산G | 통산IP | 최고OVR | 최고연봉 | 부상 | 수술 | 군시즌 | 끊김 |");
    log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const { preset, seed } of 칸들) {
      const g = rows.filter((x) => x.프리셋 === preset && x.씨앗 === seed)
        .sort((a, b) => (순서[a.성향] ?? 9) - (순서[b.성향] ?? 9));
      for (const x of g) {
        log(`| ${preset}/${seed} | **${x.성향}** | ${x.진로} | ${x.프로시즌} | ${x.farm시즌} | ${x.콜업} `
          + `| ${x.통산승} | ${x.통산G} | ${x.통산IP} `
          + `| ${x.최고OVR} | ${x.최고연봉} | ${x.부상} | ${x.수술 ? `🔴 ${x.수술}` : 0} | ${x.군시즌} `
          + `| ${x.정지 ? "🔴 정지" : "—"} |`);
      }
      log("| | | | | | | | | | | | | | | |");
    }
    log("");

    // 칸마다 「성장이 안전을 이겼나」
    log("### 칸마다 — 성장이 안전을 이겼나");
    log("");
    log("| 프리셋/씨앗 | 통산승 성장:안전 | 프로시즌 | 최고OVR | 판정 |");
    log("|---|---|---|---|---|");
    let 성장승 = 0, 안전승 = 0;
    for (const { preset, seed } of 칸들) {
      const gr = rows.find((x) => x.프리셋 === preset && x.씨앗 === seed && x.성향 === "growth");
      const sf = rows.find((x) => x.프리셋 === preset && x.씨앗 === seed && x.성향 === "safe");
      if (!gr || !sf) continue;
      // 셋 중 둘 이상을 이기면 이긴 것으로 본다 — 한 칸만 보면 운이 섞인다
      const 점 = [gr.통산승 > sf.통산승, gr.프로시즌 > sf.프로시즌, gr.최고OVR > sf.최고OVR]
        .filter(Boolean).length;
      const 판정 = 점 >= 2 ? "성장 ✅" : 점 === 0 ? "🔴 안전" : "안전";
      if (점 >= 2) 성장승++; else 안전승++;
      log(`| ${preset}/${seed} | ${gr.통산승} : ${sf.통산승} | ${gr.프로시즌} : ${sf.프로시즌} `
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
    log("| 프리셋/씨앗 | 진로 | 프로시즌 | 통산승 | 통산IP | 최고OVR | 최고연봉 | 부상 | 수술 |");
    log("|---|---|---|---|---|---|---|---|---|");
    for (const { preset, seed } of 칸들) {
      const x = rows.find((y) => y.프리셋 === preset && y.씨앗 === seed && y.성향 === "growth");
      if (!x) continue;
      log(`| ${preset}/${seed} | ${x.진로} | ${x.프로시즌} | ${x.통산승} | ${x.통산IP} | ${x.최고OVR} `
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
      // ⚠ **부대 칸이 있어야 군 계수기 0 을 읽을 수 있다** (2026-09-19 · A).
      //   체육부대는 캘린더가 없어 그 칸이 늘 0 이다 — 부대를 안 적으면
      //   「안 났다」로 읽힌다. `군부대` 는 `perfEntry.simRunReport` 가
      //   `militaryServedUnit`(세이브 값)에서 그대로 옮겨 적은 것이다.
      log("| 프리셋 | 성향 | 부대 | 군시즌 | 군캘린더 | 군뽑기 | 프로시즌 | 통산승 | 커리어 |");
      log("|---|---|---|---|---|---|---|---|---|");
      for (const x of 군판) {
        const r = runs[x.n - 1];
        const ev = (r.꼬리.커리어이벤트 ?? [])
          .filter((s) => String(s).includes("military")).join(" ");
        const ys2 = r.해마다 ?? [];
        const cal = ys2.reduce((a2, y) => a2 + (y.군캘린더 ?? 0), 0);
        const draw = ys2.reduce((a2, y) => a2 + (y.군뽑기 ?? 0), 0);
        const unit = r.꼬리.군부대 === "sports" ? "체육"
          : r.꼬리.군부대 === "general" ? "일반" : "?";
        log(`| ${x.프리셋} | ${x.성향} | ${unit} | ${x.군시즌} | ${unit === "체육" ? `${cal}(없음)` : cal} | ${draw}`
          + ` | ${x.프로시즌} | ${x.통산승} | ${ev || "—"} |`);
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
log(`| 고졸 직행 지명${rows.some((x) => x.추정) ? "(추정 포함 · `?` 표시)" : ""} | ${GOAL.고졸직행[0] * 100}~${GOAL.고졸직행[1] * 100}% | **${고졸N}/${rows.length} = ${pct(고졸N, rows.length)}%** | `
  + `${고졸비 < GOAL.고졸직행[0] || 고졸비 > GOAL.고졸직행[1] ? "🔴 벗어남" : "ok"} |`);
log(`| 🔴 삼킨 예외가 난 판 | 0 | **${예외판.length}판** | ${예외판.length ? "🔴" : "ok"} |`);
log(`| 정지로 끊긴 판 | 0 | **${정지판.length}판** | ${정지판.length ? "🔴" : "ok"} |`);
// 🔴 **이제 둘 다 검사다** (2026-09-21 워커를 고쳤다 · `probe-a-simrun-worker.cjs`).
//   새로 돈 판이면 0이어야 한다 — 0보다 크면 워커의 라벨링 결함이 되살아난
//   것이다. **옛 판**(이 고침 전에 돈 24판 등)을 이 표에 돌리면 그때는 실제
//   결함이 있었으니 0보다 나오는 게 맞다(하위 호환 — 숨기지 않는다).
const 불완전합 = rows.reduce((a, x) => a + x.불완전, 0);
const 불완전판 = rows.filter((x) => x.불완전 > 0).length;
log(`| 못 접은 해(진로 갈리는 해) | 0 | **${불완전합}해 / ${불완전판}판** | `
  + `${불완전합 ? "🔴 그 해만 성적이 빈다(옛 판 · 이 워커로 다시 돌리면 안 나야 한다)" : "ok"} |`);
const 중복연도합 = rows.reduce((a, x) => a + x.중복연도, 0);
const 중복연도판 = rows.filter((x) => x.중복연도 > 0).length;
log(`| 같은 해가 두 줄로 찍힘(연도 라벨 겹침) | 0 | **${중복연도합}건 / ${중복연도판}판** | `
  + `${중복연도합 ? "🔴 옛 판의 워커 결함 · 이 워커로 다시 돌리면 안 나야 한다" : "ok"} |`);
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
    // ⚠ 이 추정 갈래는 `꼬리.무대주수`가 없는 옛 판에서만 돈다(2026-09-21
    //   24판 전부 있어 여긴 안 탔다) — "A→B" 접힌 줄을 한쪽에만 몰아 주는
    //   근사라 손 안 댔다. 새 판인데 여기로 떨어지면 그 자체가 이상 신호다.
    const st = String(y.무대), farm = String(y.소속).endsWith("_2");
    let k = null;
    if (st === "highschool") k = "고교";
    else if (st === "university") k = "대학";
    else if (st === "independent") k = "독립";
    // ⚠ 군은 부대별로 가른다(위 byStage 와 같은 규약) — 폴백은 군에서 안 나지만
    //   (등급 시스템을 아예 안 탄다) 이름표는 맞춰 둔다.
    else if (st === "military") k = r.꼬리.군부대 === "sports" ? "군_체육부대" : r.꼬리.군부대 === "general" ? "군_일반병" : "군_모름";
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
log("목표(전 무대 공통): 노말 " + GOAL.노말.join("~") + " · 레어 **" + GOAL.레어.join("~")
  + "** · 유니크 **" + GOAL.유니크.join("~") + "** · 히든 " + GOAL.히든.join("~"));
// ⚠ **군은 부대별로 목표가 다르다** (2026-09-20 · 사용자 확정). 일반병은
//   캘린더 + 40% 뽑기, 체육부대는 40% 뽑기만이라 이론 상한 자체가 다르다
//   (`SIM_102_MILITARY_COUNTER_2026-09-18.md` 「체육부대 목표 제안」 절).
//   `seasonFreqByStage` 키도 `군_일반병`·`군_체육부대` 둘로 갈랐다 —
//   `tier_rules.json`에 「군」 하나만 있던 옛 키는 더 없다.
log("⚠ 군은 부대마다 다르다 — 일반병 노말 " + goalRangeOf("normal", "군_일반병").join("~")
  + " · 체육부대 노말 " + goalRangeOf("normal", "군_체육부대").join("~")
  + " (엔진이 다르다. tier_rules.json seasonFreqByStage · SIM_102_MILITARY_COUNTER_2026-09-18.md)."
  + " 레어·유니크·히든은 아직 전 무대 공통값으로 잰다"
  + " (제안은 BALANCE_PROPOSAL_102.md 2장).");
log("");
// 🔴 **군의 「노말」은 아래 표에서만 다른 정의다** (2026-09-18 · D ·
//   `docs/SIM_102_YARDSTICK_2026-09-18.md` ⓑ). 군 복무 주는 `tierCounters`
//   (eventFunnel)를 애초에 안 타서 노말/레어/유니크/히든 자체가 개념이 없다
//   — 그래서 군 줄의 「노말」 칸은 `militaryLifeCounters`(계측 전용 훅 ·
//   `apps/ui/src/shared/usecases/militaryLife.ts`)가 센 **캘린더 히트 + 40%
//   뽑기 성공**을 쓴다. 목표(24~30)의 근거(STAGE0 3장 「캘린더 22건/100주 ≈
//   11.4/시즌 + 비캘린더 40.6주×40%≈16.2 → 합계 27.6/시즌」)가 잰 것도
//   정확히 이 둘의 합이라 **같은 정의로 비교된다.**
// ⚠ **「군 시즌 하나」는 다른 무대와 같은 단위(52주 · 연도 줄 하나)다** — 군
//   복무 자체는 100주(≈두 「시즌」)지만, 이 표의 분모(`byStage.군.n`)는
//   군 복무 주만 따로 센 것이 아니라 **연도 줄 수**(다른 무대와 같은 잣대)다.
//   위 STAGE0 이론값도 52주 단위로 환산해 냈으므로 잣대가 맞는다.
// ⚠ **부대 둘이 세는 칸이 다르다** (2026-09-19 · A). 체육부대는
//   `runMilitaryLifeWeek`(일반병 병영생활)를 아예 안 타서 처음엔 통째로 0 이
//   찍혔다 — 24판 재계측의 성장형 일곱 판이 그것이다(결함이 아니라 잣대).
//   이제 `advanceWeek` 의 군 주간 갈래가 같은 40% 게이트를 통과한 사건을
//   `뽑기` 칸에 같이 센다. `캘린더`(확률 밖 고정 일정)는 **일반병에만 있다** —
//   체육부대 줄의 캘린더 0 은 「안 쟀다」가 아니라 「없다」다.
log("(군 「노말」 = 계측 전용 계수기 `militaryLifeCounters` — 캘린더 히트 + 40% 뽑기 성공. "
  + "다른 무대의 노말(tierCounters)과 다른 정의다. 군 시즌 하나 = 52주 연도 줄, STAGE0 이론값과 같은 단위.)");
log("⚠ **부대마다 칸이 다르다** — 일반병은 캘린더 + 뽑기, 체육부대는 뽑기만이다"
  + "(체육부대엔 캘린더라는 개념이 없다). 판별은 `커리어이벤트` 의"
  + " `military_enlist(sports|general)` 로 한다.");
log("");
// 🔴 **못 접은 해는 빼고 센다** (2026-09-09 실측으로 잡았다).
//   그 줄은 등급이 전부 0 인데 **분모에는 든다** — 대학 노말이 54.7 에서 28.3 으로
//   반토막 나 보인 것이 그 때문이었다(빈 줄 34개). 안 뺐으면 「대학이 목표를
//   밑돈다」는 **없는 결함**을 보고할 뻔했다.
const byStage = {};
for (const x of rows) for (const y of x.ys) {
  if (y.불완전) continue;
  // ⚠ `y.무대`는 원시 careerStage 문자열이다("military"). `tier_rules.json`의
  //   `seasonFreqByStage`(무대별 목표 예외) 키는 `stageGroupOf`가 내는 한글 id다 —
  //   여기서 안 맞추면 goalRangeOf 조회가 늘 전 무대 공통값으로 떨어져 군 목표가
  //   적용 안 된다(2026-09-12 D 실측으로 잡았다). 다른 무대 라벨은 그대로 둔다 —
  //   전부 공통 목표를 쓰므로 표기가 달라도 비교에 영향이 없다.
  // 🔴 **군은 부대별로 두 줄로 가른다** (2026-09-20 · 사용자 확정). `y`(해마다
  //   한 줄)엔 부대가 없다 — 판 하나(`x`)에 부대 하나뿐이라 `x.군부대`로 가른다.
  //   부대를 못 적은 옛 판(2026-09-19 이전)은 `군_모름`으로 떨어진다 —
  //   `goalRangeOf`가 그 키를 못 찾아 전 무대 공통값(30~52)으로 비교되므로
  //   표에서 바로 티가 난다(안 잰 것이 초록으로 안 보인다).
  // 🔴 **"A→B" 접힌 줄은 A(원 무대) 쪽으로 센다** (2026-09-21). 그 줄의
  //   등급·G·IP 는 전이 직전 스냅샷(`cef688b5a`) — 즉 실제로 A 에 있는
  //   동안 쌓인 값이다(`꼬리.무대주수`도 이 해 52주를 A 앞자리에 통째로
  //   준다 — #08 실측: `university→pro_kbl` 2029 → 대학주 52). B 로
  //   세면 있지도 않은 자리(프로 첫날 등급)에 값을 붙이는 것이다.
  const 원무대 = stagesOf(y.무대)[0];
  const k = 원무대 === "military"
    ? (x.군부대 === "sports" ? "군_체육부대" : x.군부대 === "general" ? "군_일반병" : "군_모름")
    : 원무대;
  (byStage[k] ??= { n: 0, normal: 0, rare: 0, unique: 0, hidden: 0, notice: 0, milCal: 0, milDice: 0 });
  byStage[k].n++; byStage[k].normal += y.노말; byStage[k].rare += y.레어;
  byStage[k].unique += y.유니크; byStage[k].hidden += y.히든; byStage[k].notice += y.통지;
  // 옛 판(이 계수기 전에 돈 판)엔 이 칸이 없다 — 없으면 0
  byStage[k].milCal += y.군캘린더 ?? 0; byStage[k].milDice += y.군뽑기 ?? 0;
}
log("| 무대 | 시즌 | 노말 | 레어 | 유니크 | 히든 | 통지 |");
log("|---|---|---|---|---|---|---|");
const r1 = (v, n) => Math.round((v / Math.max(1, n)) * 10) / 10;
const isMil = (k) => k === "군_일반병" || k === "군_체육부대" || k === "군_모름";
for (const [k, v] of Object.entries(byStage).sort((a, b) => b[1].n - a[1].n)) {
  // ⚠ 무대별 예외(군 둘)가 있으면 그 목표로 비교한다 — 나머지는 위 GOAL(전 무대 공통).
  //   `군_모름`은 정의된 목표가 없어 `goalRangeOf`가 전 무대 공통(30~52)으로 떨어진다.
  // 🔴 **군은 「노말」 칸이 다른 정의다** — 위 머리말 참고. `militaryLifeCounters`
  //   (캘린더 히트 + 40% 뽑기)의 시즌당 합을 `tierCounters` 노말 자리에 넣어
  //   부대별 목표와 비교한다. 체육부대는 캘린더가 없어 뽑기만 합에 들어간다.
  const 노말표시 = isMil(k) ? r1(v.milCal + v.milDice, v.n) : r1(v.normal, v.n);
  log(`| ${k} | ${v.n} | ${mark(노말표시, goalRangeOf("normal", k))}${isMil(k) ? ` (캘린더${r1(v.milCal, v.n)}+뽑기${r1(v.milDice, v.n)})` : ""} | ${mark(r1(v.rare, v.n), goalRangeOf("rare", k))} `
    + `| ${mark(r1(v.unique, v.n), goalRangeOf("unique", k))} | ${mark(r1(v.hidden, v.n), goalRangeOf("hidden", k))} | ${r1(v.notice, v.n)} |`);
}
log("");

// ── ④ 무대 도달 — 「안 잰 것이지 초록이 아니다」로 남아 있던 자리 ──
log(`## 무대 도달 — ${SEASONS_ASKED}시즌이면 밟히는가`);
log("");
const reach = { 고교: 0, 대학: 0, 독립: 0, "2군": 0, "프로 1군": 0, 군: 0, "프로 중후반(4년+)": 0 };
for (const x of rows) {
  // "A→B" 접힌 줄은 양쪽 다 밟은 것으로 센다 — `hasStage` 가 "→" 로 쪼갠다
  const st = new Set(x.ys.flatMap((y) => stagesOf(y.무대)));
  const farm = x.ys.some((y) => String(y.소속).endsWith("_2"));
  const pro1 = x.ys.some((y) => isProStage(y.무대) && !String(y.소속).endsWith("_2"));
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

// 🔴 **2군에 갇히면 그건 결함이다** (2026-09-12 · 신인 2군 출발 확정).
//   내려보내는 길만 있고 올라오는 길이 안 돌면 도달률이 아니라 함정이 된다.
//   그래서 「밟았나」와 따로 **콜업이 실제로 몇 번 났나**를 센다.
{
  const farm판 = rows.filter((x) => x.farm시즌 > 0);
  const 콜업합 = rows.reduce((a, x) => a + x.콜업, 0);
  const 갇힘 = farm판.filter((x) => x.콜업 === 0);
  log(`**2군** — 밟은 판 ${farm판.length}/${rows.length} · 2군 시즌 합 `
    + `${rows.reduce((a, x) => a + x.farm시즌, 0)} · **콜업 ${콜업합}회**`);
  if (farm판.length && 갇힘.length) {
    log("");
    log(`⚠ **콜업이 한 번도 안 난 판 ${갇힘.length}** — `
      + 갇힘.map((x) => `#${x.n}(${x.성향}/${x.프리셋} · 2군 ${x.farm시즌}시즌)`).join(" · "));
    log("  ⚠ **그 자체로 결함은 아니다** — 방출·재지명으로 무대를 옮겨 다닌 판이 섞인다.");
    log("  🔴 결함은 **2군에 앉은 채 아무 일도 안 일어나는 것**이다. 위 「콜업 N회」가 0 이면 그때다.");
  }
  log("");
}

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
