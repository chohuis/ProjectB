#!/usr/bin/env node
// ── 로스터 포지션 균형 다시즌 회귀 (Phase 2-a) ────────────────────
//
// 생성 시점은 `test-roster-gen`이 이미 본다 — 8포지션을 두 바퀴 돌아 백업까지
// 보장하고 국내 전 팀을 검사한다. **그건 새 게임 시점뿐이다.**
//
// 여기서 보는 건 **시즌이 돌아도 유지되는가**다. 은퇴·부상·승강·FA·드래프트가
// 매년 로스터를 갈아엎고, 충원 경로가 "몇 명"만 보고 "어느 자리"를 안 보면
// 포지션이 조용히 무너진다.
//
// ⚠ 실측(수정 전, 2029): 고교 102팀 중 **93팀**이 어느 포지션인가 공백,
// 포수 0명인 팀이 **22팀**. KBL 1군은 야수 8명/투수 29명인 팀이 나왔다.
// 아무 오류도 안 난다 — 라인업 구성기가 남는 야수로 메우고 넘어간다.
//
// ⚠ **포수를 따로 본다.** 다른 자리는 대체가 되지만 포수는 전문 요원이라
// 0명이면 경기가 성립하지 않는다.
//
// ⚠ **판정은 세 단계다** (아래 check/warn/UNDER_FLOOR_RATIO 주석 참고).
//   치명  야수<9 · 포수 0명    → 한 팀도 허용 안 함
//   하한  구성 하한 미달        → 미달 **비율**이 5%를 넘으면 실패
//   경고  포수 외 포지션 공백    → 보고만 함 (시뮬 결과에 안 들어간다)
//
//   npm run test:rosterbalance
//   node scripts/test-roster-balance.cjs --seasons 6 --verbose

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 4);
const SEED = arg("seed", 20260803);
const verbose = process.argv.includes("--verbose");

const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
let warned = 0;
function check(name, cond, extra = "") {
  if (cond) log(`  ok  ${name}`);
  else { failed++; log(`FAIL  ${name} ${extra}`); }
}
// ⚠ **심각도를 안 가르면 고칠 곳을 못 고른다.**
//
// 예전엔 "포수 0명"과 "좌익수 공백"이 똑같이 FAIL 한 줄이었다. 그런데 이 모델의
// 수비는 `fielding` 단일 스탯이라 **포지션 배치가 경기 결과에 안 들어가고**,
// 라인업 구성기도 `playerType`으로만 고른다. 좌익수 공백은 화면 표기 문제지
// 시뮬레이션 왜곡이 아니다. 반대로 야수 9명 미만은 타순이 짧아져 타석이
// 부풀고 **성적이 능력치가 아니라 출전량으로 결정된다** — 성격이 다르다.
//
// 그래서 셋으로 나눈다:
//   치명  시뮬 왜곡 또는 명백한 오표시 (야수<9, 포수 0명) — 한 팀도 허용 안 함
//   하한  구성 하한 미달 — **비율**로 본다 (아래 참고)
//   경고  포수 외 포지션 공백 — 보고만 하고 실패로 안 친다
function warn(name, cond, extra = "") {
  if (cond) log(`  ok  ${name}`);
  else { warned++; log(`WARN  ${name} ${extra}`); }
}
// 하한 미달을 **최소값이 아니라 비율로** 보는 이유.
//
// 최소값은 (팀 수 × 시즌 수) 표본의 극단값이다. 고교는 102팀 × 4시즌 = 408
// 표본이라 어느 한 팀이 한 해 낮게 나오는 건 정상 변동이고, 그걸 잡겠다고
// 생성기를 건드리면 없는 결함을 쫓게 된다. 실제로 "고교 야수 최소 9"를
// 결함으로 보고 생성 경로를 파고들 뻔했다.
//
// 봐야 하는 건 **상시 여러 팀이 미달인가**다. 5%를 넘으면 구조 문제로 본다.
const UNDER_FLOOR_RATIO = 0.05;

// ⚠⚠ **`--seasons`가 다른 두 실행을 나란히 비교하면 안 된다.**
//
// `absorb()`가 **시즌마다 최악값을 누적**하므로 시즌이 길수록 반드시 나빠
// 보인다. 실측: 같은 코드가 4시즌 실패 1건 · 6시즌 실패 3건이었다.
// 수정 전후를 비교할 때 시즌 수를 같이 바꾸면 **자가 움직인 것을 값이
// 움직인 것으로 읽는다** — 대학 배정 수정(P③) 직후 실제로 그럴 뻔했다.
//
// 비교는 항상 같은 `--seasons`로 한다.

// 리그별 하한을 **규칙 파일에서 파생한다.** 코드에 숫자를 적지 않는다.
//
// ⚠ **처음엔 손으로 적었고 근거가 틀렸다.** 고교 야수 하한을 11로 뒀는데
// 그건 `rosterSize`(30)에서 뽑은 값이다. 고교는 학년제라 졸업 직후 로스터가
// `rosterMin`(18)까지 내려가고, 18 × 야수비율 0.55 = 9.9다 — **야수 9~10이
// 정상인데 결함으로 읽혔다.** 실측에서 102팀 **전부**가 미달로 나왔고,
// 그걸 보고 생성 경로를 파고들 뻔했다. 전 팀이 미달이면 대개 기준이 틀린 것이다.
//
// 기준선은 **최소 정원 × 보직 비율**이다:
//   `rosterMin` × (1−pitcherRatio) = 야수   ·   `rosterMin` × pitcherRatio = 투수
//   (pitcherRatio 정본은 generation_rules.json의 리그별 값이다)
// 거기서 부상·이동 여유 2를 뺀다 — 프로 1군 하한(생성 16 → 14)과 같은 폭이다.
//
// 프로 1군은 엔진이 직접 지키는 하한(`tuning.rs`의 `FIRST_TEAM_MIN_BATTERS` 14 /
// `FIRST_TEAM_MIN_PITCHERS` 12)이 따로 있다. 여기 값은 그보다 느슨하다 —
// 엔진 하한은 **강등·트레이드를 막는 선**이고, 여기는 부상까지 겪은 뒤의
// 결과를 보는 선이라 여유가 있어야 한다.
const FLOOR_SLACK   = 2;      // 부상·이동 여유. tuning.rs가 생성값 16 → 14로 뺀 폭과 같다
const gr = require(path.join(process.cwd(), "resource/data/master/players/generation_rules.json"));
const floorOf = (leagueKey) => {
  const r = gr.rosterRules[leagueKey];
  if (!r) return null;
  const min = r.rosterMin ?? r.rosterSize;
  // ⚠ **비율을 여기 적어두면 안 된다.** 예전엔 `const PITCHER_RATIO = 0.45`가
  // 이 파일에 있었고 정본은 `roster_gen.rs`였다 — 검사가 자기 잣대를 들고
  // 있으면 생성 비율이 바뀌어도 **검사만 옛 기준으로 통과한다.**
  // 없으면 조용히 폴백하지 말고 죽는다. 이 프로젝트의 결함은 대부분
  // "값이 안 넘어왔는데 기본값으로 아무 일도 안 일어남"이었다.
  if (typeof r.pitcherRatio !== "number") {
    throw new Error(`${leagueKey}에 pitcherRatio가 없다 — generation_rules.json이 정본이다`);
  }
  return {
    bat: Math.max(1, Math.floor(min * (1 - r.pitcherRatio)) - FLOOR_SLACK),
    pit: Math.max(1, Math.floor(min * r.pitcherRatio)       - FLOOR_SLACK),
  };
};
const FLOOR = {
  HIGHSCHOOL:  floorOf("LEAGUE_HIGHSCHOOL"),
  UNIVERSITY:  floorOf("LEAGUE_UNIVERSITY"),
  INDEPENDENT: floorOf("LEAGUE_INDEPENDENT"),
  "KBL_1군":   floorOf("LEAGUE_KBL"),
  // ⚠ **2군만 파생식을 안 쓴다.** 위 식(`rosterMin × 비율 − 여유2`)은 독립
  // 리그용이고, 2군은 리그이면서 동시에 **1군에 공급하는 풀**이라 잣대가 다르다.
  // 파생하면 9/12가 나오는데, 그 값을 엔진 하한으로 넣었더니 공백 충원이
  // 막혀 **KBL 1군 최소 야수가 12 → 7로 무너졌다.** 하한을 한쪽에 걸면
  // 반대쪽이 밀리는 그 패턴이다.
  //
  // 2군 하한의 정본은 `promotionRules.farmMin*`이고 근거는 "2군도 경기를
  // 치른다"다 — 선발 5 + 불펜 3 = 8, 타순 한 바퀴 = 9.
  "KBL_2군":   {
    bat: gr.promotionRules?.farmMinBatters  ?? 9,
    pit: gr.promotionRules?.farmMinPitchers ?? 8,
  },
};

(async () => {
  log("");
  log("── 로스터 포지션 균형 회귀 ───────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("rosterbal");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "RBAL", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    let guard = 0;
    // 마지막 시즌 관측값. **시즌마다 최악을 누적**한다 — 마지막 한 시점만 보면
    // 중간에 무너졌다가 회복된 구간을 놓친다
    const worst = {};
    // 야수를 두 기준으로 세어 어긋나는지 본다 (엔진 vs 검사)
    const mism = () => { try { log("  [기준대조] " + JSON.stringify(app.batterCountMismatchProbe())); } catch (e) { log("  [기준대조] " + e.message); } };

    // 시점별로 따로 모은다
    const byPhase = { "시즌종료": {}, "오프시즌직후": {} };
    const absorb = (phase = "시즌종료") => {
      const comp = app.rosterCompositionProbe();
      const bucket = byPhase[phase];
      for (const [lg, v] of Object.entries(comp)) {
        if (v.로스터없음 === v.팀) continue;
        const b = bucket[lg] ?? { 최소야수: 999, 최소투수: 999, 포수없는팀: 0 };
        b.최소야수 = Math.min(b.최소야수, v.최소야수);
        b.최소투수 = Math.min(b.최소투수, v.최소투수);
        b.포수없는팀 = Math.max(b.포수없는팀, v.포수없는팀 ?? 0);
        bucket[lg] = b;
      }
      for (const [lg, v] of Object.entries(comp)) {
        if (v.로스터없음 === v.팀) continue;   // 비활성 리그(ABL·JBL)
        const w = worst[lg] ?? {
          포수없는팀: 0, 포지션공백팀: 0, 타순미달팀: 0,
          최소야수: 999, 최소투수: 999, 야수5퍼센타일: 999, 투수5퍼센타일: 999,
          야수미달팀: 0, 투수미달팀: 0, 팀수: 0, 상세: [],
        };
        w.포수없는팀   = Math.max(w.포수없는팀, v.포수없는팀);
        w.포지션공백팀 = Math.max(w.포지션공백팀, v.포지션공백팀);
        w.타순미달팀   = Math.max(w.타순미달팀, v.타순미달팀 ?? 0);
        w.최소야수     = Math.min(w.최소야수, v.최소야수);
        w.최소투수     = Math.min(w.최소투수, v.최소투수);
        w.야수5퍼센타일 = Math.min(w.야수5퍼센타일, v.야수5퍼센타일 ?? 0);
        w.투수5퍼센타일 = Math.min(w.투수5퍼센타일, v.투수5퍼센타일 ?? 0);
        // 하한 미달 팀 수는 여기서 센다 — 하한을 아는 쪽이 검사측이다
        const floor = FLOOR[lg];
        if (floor) {
          const below = (arr, f) => (arr ?? []).filter((x) => x < f).length;
          w.야수미달팀 = Math.max(w.야수미달팀, below(v.야수분포, floor.bat));
          w.투수미달팀 = Math.max(w.투수미달팀, below(v.투수분포, floor.pit));
        }
        w.팀수 = Math.max(w.팀수, (v.야수분포 ?? []).length);
        if (w.상세.length === 0 && v.상세.length > 0) w.상세 = v.상세;
        worst[lg] = w;
      }
    };

    while (guard++ < 4000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        // ⚠ **두 시점을 각각 잰다.** 야수 7명인 팀이 왜 남는지는
        //   · 오프시즌 직후에 이미 7명  → 충원(`fill_first_teams`)에 안 걸린다
        //   · 직후엔 14명인데 시즌 말 7명 → 시즌 중 유출(트레이드·부상)
        // 로 갈리고, 고칠 곳이 완전히 다르다. 한 시점만 재면 구분이 안 된다.
        absorb("시즌종료");
        await app.seasonRollover();
        absorb("오프시즌직후");
        continue;
      }
      break;
    }
    absorb("시즌종료");

    log(`      ${start}~${app.currentSeason()} · 시즌마다 최악값 누적`);
    mism();
    try { log("  [유출] " + JSON.stringify(app.batterLeakProbe())); } catch (e) { log("  [유출] " + e.message); }
    // 시점 대조 — 어느 쪽에서 무너지는지 한눈에 본다
    for (const lg of Object.keys(byPhase["시즌종료"])) {
      const a1 = byPhase["오프시즌직후"][lg];
      const b1 = byPhase["시즌종료"][lg];
      if (!a1 || !b1) continue;
      // ⚠ **포수 0명을 시점별로 갈라 본다.** `오프시즌직후`는 졸업 후 ·
      // W1 신입생 생성 **전** 구간이라, 유일한 포수가 졸업한 팀은 그 순간
      // 정상적으로 0명이고 W1에 채워진다 — 경기엔 영향이 없다.
      // 시점을 안 찍으면 그걸 결함으로 읽고 생성 경로를 파게 된다.
      log(`      [시점] ${lg.padEnd(12)} 오프시즌직후 야수${a1.최소야수}/투수${a1.최소투수}` +
          `(포수0 ${a1.포수없는팀}팀)` +
          `  →  시즌종료 야수${b1.최소야수}/투수${b1.최소투수}` +
          `(포수0 ${b1.포수없는팀}팀)`);
    }
    // ── 육성선수 병목 — 상한인가 유출인가 ──────────────────────
    //
    // ⚠ maxPerYear를 추측으로 올리면 안 된다. 2군 팀이 야수 17·투수 6이면
    // 부족분이 3이라 상한 4에 안 걸린다 — 올려도 안 고쳐진다.
    {
      const fd = app.farmDevProbe();
      log("");
      log("   [육성선수] " + JSON.stringify(fd));
    }

    for (const [lg, w] of Object.entries(worst)) {
      if (verbose) log(`      ${lg} ${JSON.stringify(w)}`);
      const floor = FLOOR[lg];

      // ── 치명 ── 한 팀도 허용하지 않는다
      //
      // 야수 9명 미만은 타순이 안 돈다 — 실측으로 타석이 1.5배 부풀고
      // OVR·성적 상관이 −0.5 → −0.25로 무너졌다. 이건 표본 변동이 아니다.
      check(`${lg}: 타순 미달(야수<9) 0팀`, w.타순미달팀 === 0, `${w.타순미달팀}팀`);
      // 포수 0명은 시뮬 결과엔 안 들어가지만 화면에서 명백히 잘못이다
      check(`${lg}: 포수 없는 팀 0`, w.포수없는팀 === 0, `${w.포수없는팀}팀`);

      // ── 하한 ── 비율로 본다 (최소값은 극단값이라 못 쓴다)
      if (floor && w.팀수 > 0) {
        const lim = Math.max(1, Math.floor(w.팀수 * UNDER_FLOOR_RATIO));
        check(`${lg}: 야수 ${floor.bat} 미달 ${lim}팀 이하`, w.야수미달팀 <= lim,
          `${w.야수미달팀}/${w.팀수}팀 (최소 ${w.최소야수}, 5%tile ${w.야수5퍼센타일})`);
        check(`${lg}: 투수 ${floor.pit} 미달 ${lim}팀 이하`, w.투수미달팀 <= lim,
          `${w.투수미달팀}/${w.팀수}팀 (최소 ${w.최소투수}, 5%tile ${w.투수5퍼센타일})`);
      }

      // ── 경고 ── 수비는 `fielding` 단일 스탯이라 포지션 배치가 결과에 안 들어간다.
      // 화면 표기 문제지 시뮬 왜곡이 아니므로 보고만 한다
      warn(`${lg}: 포지션 공백 팀 0`, w.포지션공백팀 === 0,
        `${w.포지션공백팀}팀 ${w.상세.slice(0, 2).join(" / ")}`);
    }
  } catch (e) {
    failed++;
    log(`FAIL  ${String((e && e.message) || e).split("\n").slice(0, 6).join("\n      ")}`);
  } finally {
    if (tmp) headless.cleanup(tmp);
  }

  log("");
  if (warned > 0) log(`경고 ${warned}건 — 시뮬 결과엔 안 들어가지만 화면 표기가 어색하다`);
  log(failed === 0 ? "로스터 균형 회귀 통과" : `로스터 균형 회귀 실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log("ERR " + ((e && e.stack) || e)); process.exit(1); });
