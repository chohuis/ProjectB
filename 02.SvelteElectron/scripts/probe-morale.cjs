"use strict";
/**
 * 사기가 **어디서 오는가** — 한 주씩 올리며 원천을 가른다 (2026-09-02).
 *
 * 🔴 `probe-traits` 의 `사기증감` 은 `autoRun` 이 여러 주를 건너뛰어 표본이
 *   등판주 2 · 미등판주 18 뿐이었다. 그걸로는 "미등판주 +0.37" 이 무엇인지
 *   못 가른다 — 주간 회귀는 −1.9 라 **누군가 매주 +2 남짓을 올리고 있다.**
 *
 * 후보 (운영 코드 전수 · 2026-09-02):
 *
 * ```
 *   경기 승패          Rust growth · 등판했을 때만          → 등판 여부로 가른다
 *   이벤트 선택지 효과  events/** moraleDelta 57건 · 합 +150   → 그 주 발동 수로 가른다
 *   TOP10 순위 보상    +1~+5 · 양수만                        → 드묾(ERA 10)
 *   시험 결과          applyExamResult                       → 잔차로 본다
 *   멘탈 케어 +6       사기 ≤ 40 에서만 뜬다                 → 도달 불가(최소 89)
 * ```
 *
 * 그래서 주마다 (등판 증가, 그 주 발동 이벤트 수) 를 같이 찍고 델타를 세 통에
 * 나눈다 — **등판주 · 이벤트주(무등판) · 아무것도 없는 주.** 마지막 통이
 * −1.9 근처면 회귀만 있는 것이고, 거기서 벗어난 만큼이 시험 등 잔차다.
 *
 *   npm run probe:morale -- --path univ
 *   PF_YEARS=8 PF_SEED=20260731 npm run probe:morale -- --path univ
 *
 * 실측 (2026-09-02 · 씨앗 20260731 · 대학 경로): 없는주 −1.8(회귀) ·
 * 등판주 −2.6(승패) · **이벤트주 85% 에 +0.58** → 원천은 이벤트 효과 쏠림.
 * 사용자 확정: B 가 데이터를 손질한다(HANDOFF_A_TO_B §3.6). 손질 전후를
 * 이 프로브 같은 명령으로 잰다.
 *
 * ⚠ 군 복무 주는 이벤트가 `careerTriggeredEvents`(커리어 통)에 남아 여기
 *   diff 에 안 잡힌다 — 없는주로 들어간다(실측 최대 +9). 군 사기를 가르려면
 *   `moraleSnapshot` 에 그 통도 실어야 한다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 8);

const PATHS = {
  indie: { draft: false, university: false, independent: true },
  univ:  { draft: false, university: true,  independent: false },
  draft: { draft: true,  university: false, independent: true },
  pro:   { draft: true,  university: false, independent: false },
};
const pi = process.argv.indexOf("--path");
const PATH_KEY = pi !== -1 ? process.argv[pi + 1] : "univ";
const POLICY = PATHS[PATH_KEY];
if (!POLICY) { console.log("경로: " + Object.keys(PATHS).join(" ")); process.exit(1); }

const dstat = (v) => v.length
  ? { 평균: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100,
      최소: Math.round(Math.min(...v) * 100) / 100,
      최대: Math.round(Math.max(...v) * 100) / 100, 표본: v.length }
  : { 표본: 0 };

(async () => {
  const { app, tmp } = await headless.boot("morale");
  let why = "완주";
  // 무대별 세 통 + 이벤트별 누적(어느 이벤트가 올리나)
  const buckets = {};
  const byEvent = {};
  // 🔴 **델타만으로는 목표를 못 잰다.** 손질의 목적은 "이벤트주 평균 0" 이 아니라
  //   `morale_lte 40~60` 대학 아홉이 **닿는가** 다 — 그건 사기의 절대값이다.
  //   그래서 주마다 절대 사기도 통에 넣고 60/50/40 아래 주수를 센다 (2026-09-02 · B).
  const fireCount = {};
  const bucket = (stage) => (buckets[stage] ??= { 등판주: [], 이벤트주: [], 없는주: [], 사기: [], 이벤트수: 0, 주수: 0 });
  try {
    await app.boot({ slotId: "MO", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    const start = app.currentSeason();
    let guard = 0;
    let prev = app.moraleSnapshot();
    while (guard++ < YEARS * 52 * 40 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      // ⚠ `oneWeek()` 은 pending 을 안 풀어 W1 에서 섰다. `runOneWeek()` 은
      //   `autoRun` 을 한 주 뒤에 세운다 — 경기·선택지는 자동 진행이 푼다
      //   (선택지는 `choices[0]`, `runAutoAdvance.ts:53`).
      await app.runOneWeek();
      const cur = app.moraleSnapshot();
      if (app.currentWeek() > w0 && app.currentSeason() === s0) {
        // 한 주 정확히 넘어갔다 — 델타를 통에 넣는다.
        // ⚠ 이번 주 발동 이벤트 = 앞 스냅샷과 **다른 값**을 가진 id.
        //   주차로 거르면 스탬프 방식에 따라 한 주가 빠지거나 두 번 센다.
        const fired = Object.keys(cur.triggered).filter((id) => cur.triggered[id] !== prev.triggered[id]);
        const d = cur.morale - prev.morale;
        const played = cur.gp - prev.gp;
        const b = bucket(cur.stage);
        b.주수++;
        b.이벤트수 += fired.length;
        b.사기.push(cur.morale);
        for (const id of fired) fireCount[id] = (fireCount[id] ?? 0) + 1;
        if (played > 0) b.등판주.push(d);
        else if (fired.length > 0) {
          b.이벤트주.push(d);
          for (const id of fired) (byEvent[id] ??= []).push(d);
        } else b.없는주.push(d);
      }
      prev = cur;
      if (app.currentWeek() > w0) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); prev = app.moraleSnapshot(); continue; }
      if (await app.pushCareerForward()) { prev = app.moraleSnapshot(); continue; }
      if (app.isSeasonEnded()) { await app.seasonRollover(); prev = app.moraleSnapshot(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }
  console.log("");
  console.log("── 사기 증감 — 무대별 세 통 (한 주 = 표본 1) ───────────────");
  for (const [stage, b] of Object.entries(buckets)) {
    console.log(`  [${stage}] 주 ${b.주수} · 이벤트 ${b.이벤트수}건(주당 ${(b.이벤트수 / Math.max(1, b.주수)).toFixed(2)})`);
    console.log(`     등판주   ${JSON.stringify(dstat(b.등판주))}`);
    console.log(`     이벤트주 ${JSON.stringify(dstat(b.이벤트주))}`);
    console.log(`     없는주   ${JSON.stringify(dstat(b.없는주))}   ← −1.9 근처면 회귀뿐`);
    const m = b.사기;
    const below = (t) => m.filter((v) => v <= t).length;
    console.log(`     사기(절대) ${JSON.stringify(dstat(m))}` +
      `  ≤60 ${below(60)}주 · ≤50 ${below(50)}주 · ≤40 ${below(40)}주   ← morale_lte 조건이 닿는가`);
  }
  // 발동 횟수 — 쿨다운을 손대면 여기가 먼저 움직인다 (델타 합은 같은 주 여러 개면 섞인다)
  const cnt = Object.entries(fireCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log("── 발동 횟수 상위 15 ───────────────────────────────────────");
  for (const [id, n] of cnt) console.log(`  ×${String(n).padStart(3)}  ${id}`);
  // 어느 이벤트가 올리나 — 주간 델타 합이 큰 순
  const top = Object.entries(byEvent)
    .map(([id, v]) => [id, v.reduce((a, b) => a + b, 0), v.length])
    .sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log("── 델타 합이 큰 이벤트 12 (같은 주 여러 개면 나눠 못 가른다) ──");
  for (const [id, sum, n] of top) console.log(`  ${String(Math.round(sum)).padStart(5)}  ×${n}  ${id}`);
  console.log(`[END] ${why} · 씨앗 ${SEED} · 경로 ${PATH_KEY} · ${YEARS}시즌`);
  await headless.cleanup(tmp);
})();
