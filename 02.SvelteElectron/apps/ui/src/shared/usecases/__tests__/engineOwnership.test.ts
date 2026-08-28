import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **계산은 Rust가 한다** — CLAUDE.md의 아키텍처 원칙이다.
 *
 *     apps/ui/       화면 렌더링, 입력값 전달만.  게임 로직·Math.random() 금지
 *     engine-native  게임 본체 — 로직·난수·암호화 전부
 *
 * 🔴 감사(2026-08-28)에서 세 부류의 누수를 찾았고, 이 검사는 그중 **고친 둘**을
 *   지킨다. 나머지는 `docs/`에 남겼다.
 *
 *   ① **값을 지어내던 자리** — 자책점을 `피안타 × 0.35`로 역산했다.
 *      엔진이 실제 자책점을 아는데 TS가 어림수를 만들어 ERA·경력 기록·계약
 *      평가로 흘려보냈다. 같은 역산이 **세 곳**이었고 하나만 고쳐져 있었다.
 *
 *   ② **규칙이 두 벌이던 자리** — 투수 승패 판정. `npc_sim`의 클로저 안에
 *      갇혀 있어서 TS가 손으로 옮겨 적었고, 그 사본이 **이미 갈라져 있었다**
 *      (세이브에 `outs >= 1`이 붙고 여유 점수가 3으로 박혔다).
 *      **주인공만 다른 승패 규칙**을 쓰고 있었다.
 *
 * ⚠ 정규식을 최소로 쓴다 — 찾는 문자열을 그대로 적는다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const UI = resolve(ROOT, "apps/ui/src");

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      srcFiles(p, out);
    } else if (name.endsWith(".ts") || name.endsWith(".svelte")) out.push(p);
  }
  return out;
}
const FILES = srcFiles(UI).map((p) => ({ path: p, src: readFileSync(p, "utf8") }));
const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");

describe("자책점은 엔진이 준다", () => {
  /**
   * 🔴 **`피안타 × 0.35`가 남아 있으면 안 된다** — 폴백으로만 허용한다.
   *   그 식이 조건 없이 서 있으면 값을 지어내는 것이다.
   */
  it("역산이 폴백으로만 남아 있다", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (!f.src.includes("* 0.35")) continue;
      // 폴백이면 바로 위에 엔진 값을 먼저 보는 갈래가 있어야 한다
      const usesEngine = f.src.includes("outcome.earnedRuns") || f.src.includes("myLine.er");
      // 성장 xp 공식은 이 검사의 대상이 아니다(아래에서 따로 본다)
      const isXp = f.src.includes("xp_threshold");
      if (!usesEngine && !isXp) bad.push(rel(f.path));
    }
    expect(bad).toEqual([]);
  });

  /** ⚠ 세 자리가 다 고쳐졌는지 본다 — 하나만 고치는 게 이 저장소의 버릇이다 */
  it("세 자리가 다 엔진 값을 본다", () => {
    const apply = read("apps/ui/src/shared/usecases/applyGameOutcome.ts");
    const match = read("apps/ui/src/pages/match/MatchPage.svelte");
    // 연습경기 · 정식경기 두 갈래.
    // ⚠ **자리를 세지 말고 갈래를 봐야 한다.** 처음엔 `earnedRuns`가 몇 번
    //   나오는지만 셌는데, 정식 갈래 하나에 이미 두 번 나와서 **연습 갈래를
    //   역산으로 되돌려도 통과**했다(변이 검증에서 걸렸다).
    //   두 갈래가 각자 엔진 값을 쓰는 꼴을 그대로 찾는다.
    const useEngine = "typeof outcome.earnedRuns === \"number\"";
    expect(apply.split(useEngine).length - 1,
      "자책점을 엔진에서 받는 갈래가 둘이어야 한다(연습·정식)").toBe(2);
    // 경기 화면 — **쓰는 자리**를 본다. `myLine.er`은 조건절에도 나오므로
    // 그것만 찾으면 값을 도로 역산으로 바꿔도 통과한다(변이 검증에서 걸렸다).
    expect(match.includes("Math.max(0, Math.round(myLine.er))")).toBe(true);
    // ⚠ **표시 문자열만 본다 — 주석은 세지 않는다.** 왜 고쳤는지 적으려고
    //   주석에 옛 라벨이 남아 있고, 그냥 찾으면 **거짓으로 실패한다.**
    //   실제로 걸렸다. 이 저장소에서 되풀이되는 함정이다.
    expect(match.includes("<span>자책(추정)</span>")).toBe(false);
    expect(match.includes("<span>자책</span>")).toBe(true);
  });
});

describe("승패 판정은 규칙이 하나다", () => {
  const APPLY = read("apps/ui/src/shared/usecases/applyGameOutcome.ts");
  const NPC   = read("packages/engine-native/src/npc_sim.rs");

  /** 🔴 규칙이 Rust에 자유 함수로 있어야 TS가 부를 수 있다 */
  it("Rust가 규칙을 내보낸다", () => {
    expect(NPC.includes("pub fn decide_pitcher(")).toBe(true);
    expect(read("packages/engine-native/src/lib.rs")
      .includes("pub fn calc_pitcher_decision_native")).toBe(true);
  });

  it("TS가 그 규칙을 부른다", () => {
    expect(APPLY.includes('"calcPitcherDecisionNative"')).toBe(true);
  });

  /**
   * 🔴 **TS가 규칙을 다시 적으면 안 된다.** 갈라진 사본의 표식들이
   *   되살아나지 않게 못박는다.
   */
  it("TS에 규칙 사본이 없다", () => {
    expect(APPLY.includes('outs >= 15 ? "W"')).toBe(false);
    expect(APPLY.includes('outs >= 3 ? "HD"')).toBe(false);
    expect(APPLY.includes("margin <= 3")).toBe(false);
  });

  /** ⚠ 여유 점수는 `tuning`이 정본이다 — 숫자를 두 번 적지 않는다 */
  it("세이브 여유 점수가 Rust 상수다", () => {
    expect(NPC.includes("margin <= crate::tuning::SAVE_MAX_MARGIN")).toBe(true);
  });
});

describe("성장 xp 공식", () => {
  /**
   * ⚠ **표시용 진행바가 Rust 공식을 옮겨 적고 있다.** 렌더마다 IPC를 태울 수
   *   없어 사본을 남겼다 — 대신 **어긋나면 여기서 잡는다.**
   *   Rust가 바뀌면 이 검사가 먼저 빨간불이 된다.
   */
  it("TS 사본이 Rust와 같은 값이다", () => {
    const rs = read("packages/engine-native/src/growth_engine.rs");
    const ts = read("apps/ui/src/shared/usecases/weekPhases/training.ts");
    expect(rs.includes("fn xp_threshold(v: f64) -> f64 { 7.5 + v * 0.35 }")).toBe(true);
    expect(ts.includes("return 7.5 + statVal * 0.35;")).toBe(true);
  });
});

describe("난수는 Rust가 굴린다", () => {
  /**
   * 🔴 **`Math.random()`은 게임 로직에서 금지다** (CLAUDE.md).
   *   화면·usecase·util 어디에도 남으면 안 된다.
   *
   * ⚠ **주석은 세지 않는다.** 왜 지웠는지 설명하려고 그 이름이 주석에 남아
   *   있다 — 호출 꼴(`Math.random()` 뒤에 연산자·괄호가 오는 형태)만 본다.
   */
  it("게임 코드에 Math.random() 호출이 없다", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      // 주석 줄을 걷어내고 본다
      const code = f.src
        .split("\n")
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .join("\n");
      if (code.includes("Math.random()")) bad.push(rel(f.path));
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 **주인공 생성은 `roster_gen`이 한다.** NPC는 거기서 만드는데
   *   주인공만 화면에서 만들고 있었다.
   * ⚠ 분포는 안 바꿨다 — 값은 `protagonistRules`가 정본이고 NPC 고교와
   *   **일부러 다르다**(주인공 devRate 73~88 · NPC 45~75).
   */
  it("주인공 잠재력·성장률을 Rust가 만든다", () => {
    const ng = read("apps/ui/src/pages/new-game/NewGamePage.svelte");
    expect(ng.includes('"genProtagonistHiddenNative"')).toBe(true);
    const rules = JSON.parse(read("resource/data/master/players/generation_rules.json")) as {
      protagonistRules?: Record<string, number>;
      rosterRules?: Record<string, Record<string, number>>;
    };
    const p = rules.protagonistRules ?? {};
    expect(p.potentialMin).toBe(80);
    expect(p.potentialMax).toBe(99);
    expect(p.devRateMin).toBe(73);
    expect(p.devRateMax).toBe(88);
    // ⚠ NPC 고교와 다른 건 **의도다** — 같아지면 그게 회귀다
    const hs = rules.rosterRules?.["LEAGUE_HIGHSCHOOL"] ?? {};
    expect(p.devRateMin).not.toBe(hs.devRateMin);
  });

  /**
   * 🔴 **TS 안의 두 번째 야구 엔진을 지웠다.** `rollLocalResult`가 안타 종류
   *   분포를 굴리고 `applyLocalResult`가 주자·아웃·이닝까지 처리했다 —
   *   114줄짜리였고 **아무도 안 켜는 갈래**에 있었다(`allowLocalFallback`
   *   기본 false, `MainPage`가 안 넘김).
   */
  it("경기 화면에 로컬 시뮬이 없다", () => {
    const mp = read("apps/ui/src/pages/match/MatchPage.svelte");
    expect(mp.includes("function rollLocalResult")).toBe(false);
    expect(mp.includes("function applyLocalResult")).toBe(false);
  });
});

describe("유망주 점수는 Rust가 낸다", () => {
  const TOP10 = read("apps/ui/src/shared/utils/top10Engine.ts");
  const PE    = read("packages/engine-native/src/player_engine.rs");

  /**
   * 🔴 **점수 계산 셋이 TS에 있었다** (2026-08-28에 옮겼다):
   *   · `calcProspectScore` — OVR·스카우트 가중, 성적 가중(0 / 0.15 / 0.30)
   *   · `calcNpcScore`      — 같은 축
   *   · `simNpcScout`       — **id 뒷자리로 만드는 유사난수**
   *
   *   `Math.random()`은 아니었지만 **난수를 TS가 만드는 것**은 같다.
   */
  it("TS에 점수 산식이 없다", () => {
    expect(TOP10.includes("function calcProspectScore")).toBe(false);
    expect(TOP10.includes("function calcNpcScore")).toBe(false);
    expect(TOP10.includes("function simNpcScout")).toBe(false);
    // 가중치가 되살아나는 것도 막는다
    expect(TOP10.includes("* 0.80 + sc * 0.20")).toBe(false);
  });

  it("Rust가 산식을 갖는다", () => {
    expect(PE.includes("fn sim_npc_scout(")).toBe(true);
    expect(PE.includes("fn hero_prospect_score(")).toBe(true);
    expect(PE.includes("pub fn calc_prospect_rank(")).toBe(true);
    expect(read("packages/engine-native/src/lib.rs")
      .includes("pub fn calc_prospect_rank_native")).toBe(true);
  });

  it("TS가 그 함수를 부른다", () => {
    expect(TOP10.includes('"calcProspectRankNative"')).toBe(true);
  });

  /**
   * 🔴 **정렬도 Rust가 한다.** 점수만 받아 TS가 다시 줄을 세우면
   *   동점 처리가 두 곳에서 갈린다.
   */
  it("TS가 점수로 다시 정렬하지 않는다", () => {
    expect(TOP10.includes("sort((a, b) => b.score - a.score)")).toBe(false);
  });

  /**
   * 🔴 **`heroRankInAll`을 지웠다.** TOP10 밖일 때의 순위를 전 고교 선수를
   *   한 번 더 훑으며 **다시 계산**했다 — 같은 점수를 두 번 만드는 구조였다.
   *   Rust가 `heroRank`를 함께 돌려준다.
   */
  it("주인공 순위를 두 번 계산하지 않는다", () => {
    expect(TOP10.includes("function heroRankInAll")).toBe(false);
  });

  /**
   * ⚠ **풀을 한 번만 만든다.** 컬럼이 넷이라 매번 만들면 1,377명을 네 번
   *   훑고 네 번 직렬화한다.
   */
  it("후보 풀을 컬럼마다 다시 만들지 않는다", () => {
    const n = TOP10.split("buildNpcPayload(").length - 1;
    expect(n).toBe(3);   // 정의 1 + generateTop10 1 + buildTop10Metadata 1
  });
});
