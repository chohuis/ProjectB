import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  managerEffect, primeManagerStyleRules, NEUTRAL_STYLE, styleNoiseOf,
} from "../managerStyle";

/**
 * 감독 스타일 (2026-08-30).
 *
 * 🔴 **스타일 9종이 생성·저장되고 팀 상세에 표시까지 되는데 아무것도
 *   안 바꿨다.** `tacticalIQ`·`riskTolerance` 도 같이 죽어 있었다.
 *
 * ⚠ **보이는 값이 아무 효과가 없으면 플레이어가 먼저 알아챈다** —
 *   "공격 지향"이라 떠 있는 팀이 번트를 제일 많이 댈 수 있었다.
 *
 * ⚠ `offenseMind` 는 예외였다 — Rust 경기 엔진의 도루에 이미 쓰이고
 *   있었다(`OFFENSE_STEAL_MODIFIER`). **단, 주인공 팀 공격일 때만**이고
 *   타순에는 안 쓰였다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const rules = JSON.parse(
  read("resource/data/master/players/generation_rules.json"),
).managerStyleRules;

describe("감독 효과", () => {
  beforeEach(() => primeManagerStyleRules(rules));

  it("규칙 파일에 스타일 9종이 다 있다", () => {
    // 생성 규칙(`staff_rules.json`)의 9종과 하나라도 어긋나면
    // 그 스타일 감독은 조용히 중립이 된다
    const gen = JSON.parse(read("resource/data/master/players/staff_rules.json"))
      .rules.manager.styles as string[];
    expect(gen.length).toBe(9);
    for (const s of gen) {
      expect(Object.keys(rules.styles), `표에 없는 스타일: ${s}`).toContain(s);
    }
  });

  it("규칙이 없으면 중립이다 — 예전과 같게 돈다", () => {
    primeManagerStyleRules(null);
    expect(managerEffect({ style: "공격 지향" })).toEqual(NEUTRAL_STYLE);
  });

  it("감독이 없어도 중립이다", () => {
    const e = managerEffect(null);
    expect(e.power).toBe(0);
    expect(e.buntMult).toBe(1);
  });

  it("공격 지향은 파워를 올리고 번트를 줄인다", () => {
    const e = managerEffect({ style: "공격 지향", tacticalIQ: 50,
      offenseMind: 50, riskTolerance: 50 });
    expect(e.power).toBeGreaterThan(0);
    expect(e.buntMult).toBeLessThan(1);
    expect(e.stealMult).toBeGreaterThan(1);
  });

  it("수비 조직은 반대다", () => {
    const e = managerEffect({ style: "수비 조직", tacticalIQ: 50,
      offenseMind: 50, riskTolerance: 50 });
    expect(e.buntMult).toBeGreaterThan(1);
    expect(e.stealMult).toBeLessThan(1);
  });

  it("육성 우선과 노장 중용은 나이가 반대다", () => {
    const y = managerEffect({ style: "육성 우선", tacticalIQ: 50 });
    const o = managerEffect({ style: "노장 중용", tacticalIQ: 50 });
    expect(y.age).toBeLessThan(0);
    expect(o.age).toBeGreaterThan(0);
  });

  it("🔴 전술 이해도가 낮을수록 타순이 흔들린다", () => {
    const dumb = managerEffect({ style: "데이터 중심", tacticalIQ: 10 });
    const smart = managerEffect({ style: "데이터 중심", tacticalIQ: 95 });
    expect(dumb.noise).toBeGreaterThan(smart.noise);
  });

  it("과감할수록 도루가 늘고 번트가 준다", () => {
    const bold = managerEffect({ style: "데이터 중심", riskTolerance: 75 });
    const safe = managerEffect({ style: "데이터 중심", riskTolerance: 30 });
    expect(bold.stealMult).toBeGreaterThan(safe.stealMult);
    expect(bold.buntMult).toBeLessThan(safe.buntMult);
  });

  it("잡음은 선수마다 고정이다", () => {
    // 매번 다르면 같은 팀이 경기마다 타순을 새로 짠다
    expect(styleNoiseOf("PLY_1", "TEAM_A", 8)).toBe(styleNoiseOf("PLY_1", "TEAM_A", 8));
    expect(styleNoiseOf("PLY_1", "TEAM_A", 8)).not.toBe(styleNoiseOf("PLY_2", "TEAM_A", 8));
  });

  it("폭이 0이면 잡음이 없다", () => {
    expect(styleNoiseOf("PLY_1", "TEAM_A", 0)).toBe(0);
  });
});

describe("배선", () => {
  const roster = read("apps/ui/src/shared/utils/rosterEngine.ts");

  it("타순이 감독을 받는다", () => {
    expect(roster.includes("sortBattingOrder(lineup9, entities, managerEff, teamId)")).toBe(true);
  });

  it("🔴 감독을 실제로 뽑아 넘긴다", () => {
    // 인자만 만들고 안 넘기면 **아무 일도 안 일어난다**
    expect(roster.includes("const mgrProfile = managerProfileOf(teamId, entities);")).toBe(true);
    expect(roster.includes("const mgrEff = managerEffect(mgrProfile);")).toBe(true);
  });

  it("🔴 나이를 팀 안 상대값으로 잰다", () => {
    // 절대 나이(25 기준)는 고교(전원 16~18세)에서 안 먹어
    // **"육성 우선"과 "노장 중용"이 같은 타순**을 냈다(실측)
    expect(roster.includes("const ageAdj = ((age - ageMid) / ageSpan) * eff.age;")).toBe(true);
  });

  it("🔴 규칙 파일을 부팅 때 싣는다", () => {
    // 안 실으면 규칙이 늘 null 이라 스타일이 다시 죽는다
    const master = read("apps/ui/src/shared/stores/master.ts");
    expect(master.includes("primeManagerStyleRules(")).toBe(true);
  });
});

describe("경기 엔진 배선", () => {
  const rust = read("packages/engine-native/src/match_engine.rs");
  const types = read("packages/engine-native/src/types.rs");
  const page = read("apps/ui/src/pages/match/MatchPage.svelte");

  it("Rust가 배수를 받는다", () => {
    // ⚠ `serde(default)` 라 **안 넘겨도 조용히 통과한다** — 층마다 본다
    expect(types.includes("pub bunt_mult: f64,")).toBe(true);
    expect(types.includes("pub steal_mult: f64,")).toBe(true);
  });

  it("🔴 안 넘기면 1.0 — 예전 동작이다", () => {
    expect(types.includes('#[serde(default = "one", rename = "buntMult")]')).toBe(true);
    // ⚠ **TS 는 camelCase 로 보낸다** — 이 구조체엔 rename_all 이 없어
    //   이름을 명시해야 한다. 안 붙이면 조용히 기본값으로 돌아간다.
    expect(types.includes('rename = "stealMult"')).toBe(true);
    expect(rust.includes("opts.bunt_mult.unwrap_or(1.0)")).toBe(true);
    expect(rust.includes("opts.steal_mult.unwrap_or(1.0)")).toBe(true);
  });

  it("번트·도루에 실제로 곱한다", () => {
    // 받기만 하고 안 쓰면 죽은 갈래다.
    // ⚠ 지금은 양 팀 다 건다 — "상대 감독" 묶음이 그걸 따로 본다.
    expect(rust.includes("* batting_manager(&pre_state).bunt_mult.clamp(0.0, 3.0)")).toBe(true);
    expect(rust.includes("if rng.gen::<f64>() < attempt_prob * steal_mult {")).toBe(true);
  });

  it("🔴 TS가 실제로 넘긴다", () => {
    // 엔진·타입이 다 맞아도 TS가 안 넘기면 **아무 일도 안 일어난다**
    expect(page.includes("buntMult: myMgrEff.buntMult, stealMult: myMgrEff.stealMult")).toBe(true);
  });

  it("🔴 공격하는 쪽 감독이 정한다 — 양 팀 다", () => {
    // 예전엔 우리가 공격할 때만 걸렸고 상대 공격은 늘 기본값이었다
    expect(rust.includes("let steal_mult = bm.steal_mult.clamp(0.0, 3.0);")).toBe(true);
    expect(rust.includes("let steal_mult = if is_our_batting {")).toBe(false);
  });
});

describe("상대 감독", () => {
  const rust = read("packages/engine-native/src/match_engine.rs");
  const page = read("apps/ui/src/pages/match/MatchPage.svelte");
  const sim = read("apps/ui/src/shared/utils/gameSimulator.ts");
  const staff = read("apps/ui/src/shared/repo/staffGen.ts");

  it("🔴 공격·수비 감독을 나눠 본다", () => {
    // 한 함수로 뭉치면 우리가 수비할 때 우리 감독이 상대 도루를 정한다
    expect(rust.includes("fn batting_manager(state: &MatchState) -> &ManagerStats {")).toBe(true);
    expect(rust.includes("fn fielding_manager(state: &MatchState) -> &ManagerStats {")).toBe(true);
  });

  it("공격 쪽은 수비 쪽의 반대다", () => {
    expect(rust.includes(
      "if is_our_team_fielding(state) { &state.opponent_manager } else { &state.my_manager }"
    )).toBe(true);
  });

  it("번트·도루가 공격 쪽 감독을 쓴다", () => {
    expect(rust.includes("let bm = batting_manager(state);")).toBe(true);
    expect(rust.includes("* batting_manager(&pre_state).bunt_mult.clamp(0.0, 3.0)")).toBe(true);
  });

  it("🔴 주인공 경기가 상대 감독을 넘긴다", () => {
    // Rust에 자리가 있어도 TS가 안 넘기면 **기본값 50**이다
    expect(page.includes("opponentManager: oppManagerStats")).toBe(true);
  });

  it("🔴 리그 경기도 넘긴다 — 안 그러면 두 저울이 된다", () => {
    // 이 파일 주석이 이미 같은 함정을 적어 뒀다(수비 미전달)
    expect(sim.includes("myManager: params.homeManager")).toBe(true);
    expect(sim.includes("opponentManager: params.awayManager")).toBe(true);
  });

  it("🔴 감독 없던 리그 다섯에 감독을 만든다", () => {
    // 실측: 감독 있는 팀 182 · 없는 팀 56 (ABL·JBL·2군 전부)
    for (const lg of ["LEAGUE_ABL", "LEAGUE_JBL",
                      "LEAGUE_KBL_FARM", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]) {
      expect(staff.includes(`"${lg}"`), `${lg} 가 빠졌다`).toBe(true);
    }
  });

  it("감독 기량이 기존 리그 순서를 따른다", () => {
    // 지어낸 값이 아니라 OVR 상한·연봉 배수와 같은 순서다
    const lb = JSON.parse(read("resource/data/master/players/staff_rules.json"))
      .rules.league_bonus as Record<string, number>;
    expect(lb.LEAGUE_ABL).toBeGreaterThan(lb.LEAGUE_JBL);
    expect(lb.LEAGUE_JBL).toBeGreaterThan(lb.LEAGUE_KBL);
    expect(lb.LEAGUE_KBL).toBeGreaterThan(lb.LEAGUE_ABL_FARM);
    expect(lb.LEAGUE_ABL_FARM).toBeGreaterThan(lb.LEAGUE_JBL_FARM);
    expect(lb.LEAGUE_JBL_FARM).toBeGreaterThan(lb.LEAGUE_KBL_FARM);
    expect(lb.LEAGUE_KBL_FARM).toBeGreaterThan(lb.LEAGUE_INDEPENDENT);
  });
});

describe("누굴 쓸지 · 언제 바꿀지", () => {
  const roster = read("apps/ui/src/shared/utils/rosterEngine.ts");
  const rust = read("packages/engine-native/src/match_engine.rs");

  it("🔴 선발 9명 선택에도 감독이 든다", () => {
    // 예전엔 타순만 감독이 짜고 **누굴 쓸지는 OVR×컨디션만** 봤다 —
    // 육성 우선 감독이 유망주를 안 올렸다
    expect(roster.includes("const selEff = managerEff ?? NEUTRAL_STYLE;")).toBe(true);
    expect(roster.includes("return effOvr + mgrAdj")).toBe(true);
  });

  it("선택은 타순보다 약하게 건다", () => {
    // 세게 걸면 감독 취향이 OVR을 눌러 리그 수준이 내려간다
    expect(roster.includes("+ ((b?.speed ?? 50) - 50) / 50 * selEff.speed) * 0.5;")).toBe(true);
  });

  it("🔴 NPC 투수 교체가 감독을 본다", () => {
    // `bullpenRead` 가 **주인공 등판 시점에만** 쓰이고 NPC 교체는
    // 난수+리그값이라 감독이 누구든 똑같이 바꿨다
    // ⚠ 1.1 A② 에서 인자가 하나 늘었다(`starter_outs_factor` · 리그 계수).
    //   감독 항은 그대로고 이 검사도 그대로 본다 — 문자열만 서명에 맞췄다.
    expect(rust.includes("bullpen_read: f64, starter_outs_factor: f64) -> Vec<i32> {")).toBe(true);
    expect(rust.includes("queue_max_outs(&ps, rng, my_manager.bullpen_read, starter_outs_factor)")).toBe(true);
    expect(rust.includes("queue_max_outs(&ps, rng, opp_manager.bullpen_read, starter_outs_factor)")).toBe(true);
  });

  it("🔴 불펜은 절단이다 — 반올림으로 바꾸면 밸런스가 움직인다", () => {
    // 예전 식이 `3 + (rng * 4.0) as i32` 라 3~6인데 반올림하면 3~7이 된다.
    // 감독을 얹는 김에 조용히 바뀌었고 cargo 검사가 잡았다.
    expect(rust.includes("(3 + (rng.gen::<f64>() * 4.0) as i32 - (k * 1.5).round() as i32).max(1)")).toBe(true);
  });
});

describe("새 작전 셋 (C-①②④)", () => {
  const rust = read("packages/engine-native/src/match_engine.rs");
  const types = read("packages/engine-native/src/types.rs");
  const tune = read("packages/engine-native/src/tuning.rs");

  it("🔴 고의사구 — 1루가 비어야 건다", () => {
    // 1루가 차 있으면 밀어내기 위험만 늘고 포스 상황도 안 생긴다
    expect(rust.includes("let first_open = pre_state.runners.first.is_none();")).toBe(true);
    expect(rust.includes("if first_open && scoring && pre_state.outs >= 1 && diff <= 3 {")).toBe(true);
  });

  it("🔴 고의사구는 수비 쪽 감독이 정한다", () => {
    // 번트·도루(공격 쪽)와 반대다
    expect(rust.includes("let fm = fielding_manager(&pre_state);")).toBe(true);
  });

  it("🔴 조기 반환이 아니라 코드를 덮어쓴다", () => {
    // 조기 반환하면 아래 기록 집계를 건너뛰어 **볼넷이 안 남는다**
    expect(rust.includes("                result_code = PitchResultCode::Walk;")).toBe(true);
  });

  it("스퀴즈가 별도 결과 코드다", () => {
    // `SacBunt` 재활용하면 진루 규칙이 갈린다
    expect(types.includes("SqueezeBunt,")).toBe(true);
    expect(rust.includes("PitchResultCode::SqueezeBunt => {")).toBe(true);
  });

  it("🔴 스퀴즈는 3루 주자를 홈에 보내고 희생번트는 안 보낸다", () => {
    // 둘이 갈려 있어야 한다 — 기존 주석이 그렇게 적어 뒀다
    expect(rust.includes("if let Some(r3) = next_runners.third.take() {")).toBe(true);
    expect(rust.includes("// ⚠ 3루 주자는 홈으로 안 보낸다. 그건 스퀴즈고 다른 작전이다.")).toBe(true);
  });

  it("스퀴즈 실패는 대가가 크다", () => {
    // 3루 주자가 죽는다 — 번트 실패(그냥 아웃)보다 무겁다
    expect(rust.includes("            PitchResultCode::DoublePlay")).toBe(true);
    expect(tune.includes("pub const SQUEEZE_SUCCESS_BASE: f64 = 0.62;")).toBe(true);
  });

  it("🔴 견제사가 도루 판정 앞에 있다", () => {
    // 뒤에 두면 이미 뛴 주자를 견제하는 꼴이다
    const pick = rust.indexOf("// 🔴 **견제사** (C-④)");
    const steal = rust.indexOf("let (attempt_prob, success) = T::steal_second_probs");
    expect(pick).toBeGreaterThan(-1);
    expect(pick).toBeLessThan(steal);
  });

  it("견제는 주루센스와 반대 축이다", () => {
    expect(rust.includes("- lead * T::PICKOFF_INSTINCT_SPAN) * bold;")).toBe(true);
  });

  it("셋 다 드문 사건이다 — 상한이 있다", () => {
    // 자주 나오면 리그 지표가 통째로 움직인다
    expect(tune.includes("pub const IBB_MAX_PROB: f64 = 0.12;")).toBe(true);
    expect(tune.includes("pub const PICKOFF_MAX_PROB: f64 = 0.02;")).toBe(true);
  });
});

describe("히트앤런 (C-③)", () => {
  const rust = read("packages/engine-native/src/match_engine.rs");
  const tune = read("packages/engine-native/src/tuning.rs");

  it("🔴 도루와 별도 갈래다", () => {
    // 기존 도루 판정에 섞으면 시도율이 통째로 는다
    // (기준선 중앙 3.2~5.6% · 상위 18.3~18.8%)
    expect(rust.includes("let hit_and_run = pre_state.runners.first.is_some()")).toBe(true);
    expect(rust.includes("&& rng.gen::<f64>() < T::HIT_AND_RUN_PROB")).toBe(true);
  });

  it("🔴 걸리면 타자는 무조건 친다", () => {
    // 주자가 이미 뛰었으니 거르면 도루사가 된다 — 그게 작전이다
    expect(rust.includes("    let (swings, umpire_strike) = if hit_and_run {")).toBe(true);
    expect(rust.includes("        (true, false)")).toBe(true);
  });

  it("2스트라이크엔 안 건다", () => {
    // 헛스윙 삼진 + 도루사로 이닝이 한 번에 끝난다
    expect(rust.includes("        && pre_state.count.strikes < 2\n        && rng.gen::<f64>() < T::HIT_AND_RUN_PROB")).toBe(true);
  });

  it("🔴 병살을 땅볼로 낮춘다 — 그게 이 작전의 값이다", () => {
    // ⚠ 2단계에서 **삼중살도 같이 낮추게** 됐다 — 안 그러면 히트앤런을
    //   걸고도 주자 둘이 죽어 작전을 거는 이유가 사라진다.
    expect(rust.includes(
      "            PitchResultCode::DoublePlay | PitchResultCode::TriplePlay => {\n" +
      "                result_code = PitchResultCode::GroundOut;"
    )).toBe(true);
  });

  it("🔴 헛치면 주자가 죽는다", () => {
    // 판정만 하고 반영을 안 하면 죽은 갈래다
    expect(rust.includes("let mut hnr_runner_out = false;")).toBe(true);
    expect(rust.includes("    if hnr_runner_out && next_runners.first.is_some() {")).toBe(true);
    expect(rust.includes("        next_outs += 1;")).toBe(true);
  });

  it("주자 아웃이 3아웃 전환 앞에 있다", () => {
    // 뒤에 두면 이닝이 안 넘어간다
    const out = rust.indexOf("if hnr_runner_out && next_runners.first.is_some()");
    const half = rust.indexOf("// 3아웃 → half 전환");
    expect(out).toBeGreaterThan(-1);
    expect(out).toBeLessThan(half);
  });

  it("드문 작전이다", () => {
    // 실제 KBO 히트앤런은 경기당 0.5회꼴이다
    expect(tune.includes("pub const HIT_AND_RUN_PROB: f64 = 0.012;")).toBe(true);
  });
});
