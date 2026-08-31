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
  // ⚠ **상무는 파생식을 안 쓴다.** 정원이 26(militaryRules.rosterSize)이고
  //   `pitcherRatio` 가 없다 — 군팀이라 독립 규칙과 잣대가 다르다.
  //   하한의 근거는 **경기를 치른다**는 것뿐이다: 타순 한 바퀴 9 · 선발+불펜 8.
  //   실측(2026-08-31)에 야수 14 → 8 로 빠지고 투수가 40까지 쌓였다 —
  //   그걸 잡으라고 두는 값이다.
  SANGMU: { bat: 9, pit: 8 },
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

/**
 * 🔴 **리그별 시즌 종료 주차** — 판정 창의 오른쪽 끝이다.
 *
 * 값의 근거는 `apps/ui/src/shared/utils/seasonWeeks.ts` 다:
 * ```
 *   INDIE_CAREER_HUB_WEEK = 26   독립 3단계 W10~25 → 결승 직후
 *   HS_CAREER_HUB_WEEK    = 28   고교 주말리그 W26 · 패왕기 W26~27 → 결승 직후
 *   UNIV_CAREER_HUB_WEEK  = 29   대학 정규 W28 · 여명기 W25~28 → 결승 직후
 * ```
 * ⚠ **여기에 값을 두 번 적는 셈이다.** 저쪽은 TS 라 이 CJS 검사가 못 읽는다.
 *   저쪽을 바꾸면 여기도 바꿔야 한다 — `seasonWeekCalendar.test.ts` 가
 *   두 값이 어긋나면 실패하게 물려 뒀다.
 *
 * 프로(KBL·ABL·JBL)와 상무는 W38 까지라 기본값을 쓴다.
 */
const SEASON_END_WEEK = {
  INDEPENDENT: 26,
  HIGHSCHOOL:  28,
  UNIVERSITY:  29,
};

/**
 * 🔴 **아마추어를 시즌 안에서 잴 표본 주차.**
 *
 * `autoRun` 은 W0 → W32 → W40 → W51 로 뛴다. 아마추어 시즌(~W29) 안에
 * 멈추는 자리가 **한 곳도 없어서**, 판정 창을 좁히면 표본이 0건이 된다.
 * 그래서 이 주차까지는 `oneWeek()` 으로 한 주씩 올라간다.
 *
 * ⚠ W20 은 셋 다 시즌 한복판이다(독립 W10~25 · 고교 ~W26 · 대학 ~W28).
 */
const AMATEUR_SAMPLE_UNTIL = 20;

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
    const weekly = [];
    const worst = {};
    // 야수를 두 기준으로 세어 어긋나는지 본다 (엔진 vs 검사)
    const mism = () => { try { log("  [기준대조] " + JSON.stringify(app.batterCountMismatchProbe())); } catch (e) { log("  [기준대조] " + e.message); } };

    // 시점별로 따로 모은다
    // 🔴 **시점을 셋으로 나눈다.** 둘로는 FA 구간이 시즌종료에 섞여 들어온다.
    //
    //    주차별 실측(2026-08-26): `W32 야수17 → **W40 8** → W51 10 → 다음해W0 13`
    //    시즌 일정(`seasonWeeks.ts:19`): W39 NPC 은퇴·FA → W40~46 FA 재트리거.
    //    **W39에 FA로 풀리고 W40~46에 다시 계약된다** — 그 사이가 비는 것이고,
    //    선수가 사라진 게 아니라 **소속이 잠깐 없다**(W0에 돌아온다).
    //
    //    ⚠ 실제 야구도 FA 시장 동안은 로스터가 얇다. **그 구간을 같은 잣대로
    //      재면 늘 미달로 잡힌다** — 총량 147명·쏠림 4로 분포는 멀쩡한데도 그랬다.
    //      기존 주석이 "한 시점만 재면 구분이 안 된다"고 적어 뒀다.
    //      **지우지 않고 하나 더 나눈다.**
    const byPhase = { "시즌중": {}, "시즌후": {}, "시즌종료": {}, "오프시즌": {}, "오프시즌직후": {} };
    const absorb = (phase = "시즌종료", week = null) => {
      const comp = app.rosterCompositionProbe();
      for (const [lg, v] of Object.entries(comp)) {
        if (v.로스터없음 === v.팀) continue;
        // 🔴 **보고도 판정과 같은 잣대로 갈라야 한다** (2026-08-31).
        //   아래에서 아마추어의 시즌 종료 뒤 주차를 판정에서 뺐는데, 보고는
        //   안 갈랐더니 **"판정은 이것만 쓴다"고 적힌 줄이 판정에 안 쓰이는
        //   값을 찍고 있었다.** 주석이 거짓말하는 그 형태다.
        //   `시즌후`로 따로 담는다 — 안 보이게 만드는 게 아니라 **갈라 보인다.**
        const key = (phase === "시즌중" && week != null
                     && week > (SEASON_END_WEEK[lg] ?? 38)) ? "시즌후" : phase;
        const bucket = byPhase[key];
        const b = bucket[lg] ?? { 최소야수: 999, 최소투수: 999, 포수없는팀: 0 };
        b.최소야수 = Math.min(b.최소야수, v.최소야수);
        b.최소투수 = Math.min(b.최소투수, v.최소투수);
        b.포수없는팀 = Math.max(b.포수없는팀, v.포수없는팀 ?? 0);
        bucket[lg] = b;
      }
      // 🔴 **FA 구간은 판정에서 뺀다 — 보고에는 남긴다.**
      //    W39에 FA로 풀리고 개막(W0) 전에 다시 채워진다. 그 사이가 얇은 건
      //    구조이지 결함이 아니다. **주차별 3회 실측(2026-08-26)**:
      //        시즌 중(W0~35) 최소야수  13 · 13 · 13   ← 타순 9명을 늘 넘는다
      //        오프시즌(W39~)  최소야수  8 ·  8 ·  7   ← 전부 2026W40
      //    ⚠ **W46이 경계가 아니다.** W51도 8이었다 — FA 재트리거가 끝나도
      //      개막 전까지 얕게 남고 W0에 회복한다. 그래서 오프시즌 전체를 뺀다.
      //    ⚠ 위 `byPhase`에는 그대로 담긴다 — **안 보이게 만드는 게 아니라
      //      판정 잣대에서만 제외한다.** 그 구간이 이상해지면 보고로 드러난다.
      // 🔴 **판정은 `시즌중`만 쓴다.** 나머지 셋은 보고에만 남는다.
      //
      //   오프시즌(W39~)  FA 로 풀렸다 다시 계약되는 구간 — 원래 빼고 있었다
      //   오프시즌직후     롤오버 직후 · **신입생 생성 전**
      //   시즌종료(W0)     같은 순간을 다른 이름으로 한 번 더 담던 자리
      //
      //   ⚠ 위 주석이 "오프시즌직후는 신입생 생성 전이라 그 순간 정상"이라고
      //     **적어 뒀는데 판정에서는 안 뺐다.** 그래서 네 씨앗 모두 실패했다.
      //   ⚠ 사각지대는 없다 — 신입생 생성이 실제로 실패하면 그 해 **시즌중**에
      //     미달로 잡힌다. 변이 검증으로 확인했다.
      if (phase !== "시즌중") return;
      for (const [lg, v] of Object.entries(comp)) {
        if (v.로스터없음 === v.팀) continue;   // 비활성 리그(ABL·JBL)
        // 🔴 **리그마다 시즌이 끝나는 주가 다르다** (2026-08-31).
        //
        //   아마추어는 프로보다 훨씬 일찍 끝난다(`seasonWeeks.ts`):
        //     독립 W26 · 고교 W28 · 대학 W29   ←→   프로 W38
        //   그런데 판정 창이 전부 W1~38 이었다. 그래서 **대학 로스터를
        //   시즌이 끝난 뒤에 재고 있었고**, 하필 `autoRun` 이 멈추는 W32 가
        //   `CAREER_RESULT_WEEK`(드래프트가 4학년을 데려가는 주)였다.
        //
        //   주차별 실측(2026-08-31):
        //     2026W32 드래프트 **전** 야수11/투수8 · 포수0 **0팀**
        //     2026W32 드래프트 **후** 야수 8/투수6 · 포수0 **4팀**   ← 여기만
        //     2026W40 야수8/투수6 · 포수0 0팀   ← 다음 측정엔 이미 없다
        //   4년 추이도 11 → 9 → 11 → 14 로 **돌아온다.** 결함이 아니라 상황이다.
        //
        // ⚠ **빼기만 하면 안 된다.** `autoRun` 은 W0 → W32 → W40 으로 뛰므로
        //   W32 를 빼면 대학은 표본이 **0건**이 된다. 아래 루프에서 시즌 안을
        //   한 주씩 올라가며 재도록 같이 고쳤다 — **둘 다 있어야 한다.**
        if (week != null && week > (SEASON_END_WEEK[lg] ?? 38)) continue;
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
      // 🔴 **주차별 스냅샷** — 두 시점(시즌종료·오프시즌직후)만으로는
      //    "언제" 내려가는지 안 보인다. 실측(2026-08-25): 총량 147명·쏠림 4로
      //    분포는 멀쩡한데 최악값만 11이었다 — 어느 한 시점에만 얕아진다.
      //    `PB_WEEKLY=1`로 켠다.
      if (process.env.PB_WEEKLY) {
        const w = app.currentWeek();
        const c = app.rosterCompositionProbe();
        // ⚠ **리그를 고를 수 있어야 한다.** 대학이 시즌 중 어디서 빠지는지를
        //   재려는데 이 스냅샷이 KBL 1군만 찍고 있었다. `PB_WEEKLY_LG` 로 바꾼다.
        const k = c[process.env.PB_WEEKLY_LG || "KBL_1군"];
        if (k && k.최소야수 !== undefined) {
          weekly.push(`${app.currentSeason()}W${w}:${k.최소야수}/${k.최소투수}/C${k.포수없는팀 ?? 0}`);
        }
      }
      // 🔴 **경기가 치러지는 구간을 잰다.** 예전엔 시즌 끝(W0)만 판정에
      //   썼는데 그 시점은 **신입생(W1) 생성 직전**이라 1학년이 0명이다.
      //   실측: 고교 총원 3052 → 1972 · 타순 미달 5팀 — 전부 W0 이었다.
      //   ⚠ W0 을 판정에서 빼기만 하면 **잴 게 없어져 검사가 0건이 된다.**
      //     실제로 한 번 그렇게 만들었다. 자리를 옮기는 것이 답이다.
      {
        const wkNow = app.currentWeek();
        // ⚠ **`autoRun` 이 여러 주를 한 번에 건너뛴다** — 실측 주차 흐름은
        //   `W0 → W32 → W40 → W51 → W52` 다. W10/20/30 을 노리면 한 번도
        //   안 걸린다(실제로 그렇게 짰다가 검사가 0건이 됐다).
        //   **정규 시즌 구간(W1~38)이면 잰다.**
        //   ⚠ **주차를 넘긴다.** 리그마다 시즌이 끝나는 주가 달라서
        //     `absorb` 안에서 리그별로 다시 거른다(`SEASON_END_WEEK`).
        if (wkNow >= 1 && wkNow <= 38) absorb("시즌중", wkNow);
        if (process.env.PB_WK) process.stdout.write("w"+wkNow+" ");
      }
      const before = app.currentWeek();
      // 🔴 **아마추어 시즌 안에서는 한 주씩 간다** (2026-08-31).
      //   `autoRun` 이 W0 → W32 로 뛰어서 고교·대학·독립은 **시즌 중을 한 번도
      //   안 쟀다.** W32 는 드래프트가 4학년을 데려간 직후라 늘 얇게 나왔고,
      //   그걸 로스터 결함으로 읽고 있었다.
      // ⚠ **막히면 예전 경로로 돌아간다.** `oneWeek` 은 pending 을 안 푼다 —
      //   여기서 주차가 안 오르면 아래 갈래가 다 어긋나 검사가 통째로 죽는다.
      if (before < AMATEUR_SAMPLE_UNTIL) {
        await app.oneWeek();
        if (app.currentWeek() === before) await app.autoRun();
      } else {
        await app.autoRun();
      }
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        // ⚠ **두 시점을 각각 잰다.** 야수 7명인 팀이 왜 남는지는
        //   · 오프시즌 직후에 이미 7명  → 충원(`fill_first_teams`)에 안 걸린다
        //   · 직후엔 14명인데 시즌 말 7명 → 시즌 중 유출(트레이드·부상)
        // 로 갈리고, 고칠 곳이 완전히 다르다. 한 시점만 재면 구분이 안 된다.
        // W39부터 개막(W0)까지는 구조적으로 얕다 — 아래 판정 제외 주석 참고
        const wk = app.currentWeek();
        absorb(wk >= 39 ? "오프시즌" : "시즌종료");
        await app.seasonRollover();
        absorb("오프시즌직후");
        continue;
      }
      break;
    }
    {
      const wk = app.currentWeek();
      absorb(wk >= 39 ? "오프시즌" : "시즌종료");
    }

    log(`      ${start}~${app.currentSeason()} · 시즌마다 최악값 누적`);
    if (weekly.length) {
      // 값이 바뀌는 지점만 — 전부 찍으면 못 읽는다
      const shrunk = weekly.filter((v, i) => i === 0
        || v.split(":")[1] !== weekly[i - 1].split(":")[1]);
      log(`  [주차별 ${process.env.PB_WEEKLY_LG || "KBL_1군"} 최소야수/투수/포수0팀] ` + shrunk.join(" "));
    }
    mism();
    try { log("  [유출] " + JSON.stringify(app.batterLeakProbe())); } catch (e) { log("  [유출] " + e.message); }
    // 시점 대조 — 어느 쪽에서 무너지는지 한눈에 본다
    for (const lg of Object.keys(byPhase["시즌종료"])) {
      const a1 = byPhase["오프시즌직후"][lg];
      const b1 = byPhase["시즌종료"][lg];
      const m1 = byPhase["시즌중"][lg];
      const m2 = byPhase["시즌후"][lg];
      if (!a1 || !b1) continue;
      // ⚠ **포수 0명을 시점별로 갈라 본다.** `오프시즌직후`는 졸업 후 ·
      // W1 신입생 생성 **전** 구간이라, 유일한 포수가 졸업한 팀은 그 순간
      // 정상적으로 0명이고 W1에 채워진다 — 경기엔 영향이 없다.
      // 시점을 안 찍으면 그걸 결함으로 읽고 생성 경로를 파게 된다.
      log(`      [시점] ${lg.padEnd(12)} 오프시즌직후 야수${a1.최소야수}/투수${a1.최소투수}` +
          `(포수0 ${a1.포수없는팀}팀)` +
          `  →  시즌종료 야수${b1.최소야수}/투수${b1.최소투수}` +
          `(포수0 ${b1.포수없는팀}팀)` +
          (m1 ? `  ||  **시즌중** 야수${m1.최소야수}/투수${m1.최소투수}` +
            `(포수0 ${m1.포수없는팀}팀) ← 판정은 이것만 쓴다` : "  ||  시즌중 측정 없음") +
          // 아마추어만 나온다 — 시즌(독립 W26·고교 W28·대학 W29)이 끝난 뒤 주차.
          // 드래프트(W32)가 상급생을 데려간 직후라 늘 얇다. **경기는 이미 없다.**
          (m2 ? `  ||  시즌후 야수${m2.최소야수}/투수${m2.최소투수}` +
            `(포수0 ${m2.포수없는팀}팀) ← 판정 제외` : ""));
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
        // 🔴 **한 팀짜리 버킷은 여유를 안 준다.** 비율 여유는 표본이
        //   여러일 때의 이야기다 — 팀이 하나면 max(1,…) 가 항상 1이라
        //   그 한 팀이 무너져도 통과한다. **상무가 바로 그렇다.**
        const lim = w.팀수 <= 1 ? 0 : Math.max(1, Math.floor(w.팀수 * UNDER_FLOOR_RATIO));
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
