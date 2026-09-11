import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allStarSideOf, campusEventFor } from "../campusEvents";

/**
 * **프로 올스타전 · FA 미계약 → 독립 재도전** (2026-08-29 · 3단계).
 *
 * 🔴 프로 올스타전이 **아예 없었다.** 그런데 `run_allstar`는 처음부터 리그를
 *   안 가렸고 쿼터도 팀 단위였다 — 호출부가 `"LEAGUE_UNIVERSITY"`를 박아
 *   놓고 `stage === "university"`로 막고 있었을 뿐이다. **기계를 다시 짜지
 *   않았다.**
 *
 * 🔴 편 가르기가 **해외에서 안 선다.** 남/북을 국내 도시 목록으로 가르는데
 *   ABL·JBL은 그 목록에 없어 **전원이 북**이 된다 — 한 편이 통째로 빈다.
 *   그럴 땐 팀 id 정렬 순서로 반씩 가른다(결정성).
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const RULES = JSON.parse(read("resource/data/master/players/generation_rules.json"));

describe("프로 올스타전", () => {
  const CE = read("apps/ui/src/shared/usecases/campusEvents.ts");

  it("규칙이 있다", () => {
    const a = RULES.campusEvents?.proAllstar;
    expect(a).toBeTruthy();
    expect(a.week).toBeGreaterThan(0);
    expect(a.squadSize).toBeGreaterThan(0);
    expect(a.perSchoolCap).toBeGreaterThan(0);
    expect(a.requiredPositions?.length).toBeGreaterThan(0);
  });

  /** ⚠ 대학 올스타와 **같은 기계**를 쓴다 — 두 벌이면 저울이 갈린다 */
  it("리그를 인자로 받는다", () => {
    expect(CE).toContain(
      "async function runAllStar(rules: unknown, weekNum: number, leagueId: string)",
    );
    expect(CE).toContain("gatherCandidates(leagueId)");
    // ⚠ 올스타에는 리그를 박아 놓은 자리가 남아 있지 않다.
    //   **쇼케이스는 대학 전용이 맞다** — 그건 세지 않는다
    const at = CE.indexOf("async function runAllStar");
    const body = CE.slice(at, CE.indexOf("\n}", at));
    expect(body.includes('"LEAGUE_UNIVERSITY"')).toBe(false);
  });

  /**
   * ⚠ 예전엔 게이트 **문장을 문자열로** 찾았다. 문장이 바뀌면 빨강인데
   *   정작 무대가 새는지는 안 봤다 — 배분표를 값으로 본다
   *   (전체 표는 `campusStageGate.test.ts`).
   */
  it("프로 세 단계가 프로 올스타 주차에 통과한다", () => {
    const w = {
      showcase: RULES.campusEvents.showcase.week,
      allstar: RULES.campusEvents.allstar.week,
      proAllstar: RULES.campusEvents.proAllstar.week,
    };
    for (const stage of ["pro_kbl", "pro_abl", "pro_jbl"]) {
      expect(campusEventFor(stage, w.proAllstar, w), stage).toBe("pro_allstar");
    }
  });

  /** 🔴 국내는 도시 축, 해외는 정렬 순서 — 한 편이 비면 경기가 안 선다 */
  it("해외에서도 편이 갈린다", () => {
    const teams = ["TEAM_ABL_A", "TEAM_ABL_B", "TEAM_ABL_C", "TEAM_ABL_D"];
    const sides = teams.map((t) => allStarSideOf(t, undefined, teams));
    expect(new Set(sides).size, `한 편만 나왔다: ${sides.join(",")}`).toBe(2);
    // 반씩 갈린다
    expect(sides.filter((x) => x === "north")).toHaveLength(2);
  });

  it("국내는 도시 축이 이긴다", () => {
    expect(allStarSideOf("TEAM_KBL_X", "부산", ["TEAM_KBL_X"])).toBe("south");
  });

  /** ⚠ 같은 세이브가 늘 같은 편이어야 한다 */
  it("편 배정이 결정적이다", () => {
    const teams = ["TEAM_A", "TEAM_B", "TEAM_C"];
    const a = teams.map((t) => allStarSideOf(t, undefined, teams));
    const b = teams.map((t) => allStarSideOf(t, undefined, teams));
    expect(a).toEqual(b);
  });
});

describe("FA 미계약 → 독립 재도전", () => {
  it("규칙에 나이 상한이 있다", () => {
    expect(RULES.faRules?.independentAgeMax).toBeGreaterThan(0);
  });

  /** 🔴 안 넘기면 갈래가 꺼져 **바로 은퇴**한다 */
  it("호출부가 나이 상한을 넘긴다", () => {
    expect(read("apps/ui/src/shared/stores/game.ts")).toContain("independentAgeMax?: number");
    expect(read("apps/ui/src/shared/utils/npcEngine.ts")).toContain(
      "...(faIndependentAgeMax != null ? { faIndependentAgeMax } : {})",
    );
  });

  it("엔진이 독립 갈래를 갖는다", () => {
    const NS = read("packages/engine-native/src/npc_sim.rs");
    expect(NS).toContain('npc.current_league = "LEAGUE_INDEPENDENT".to_string();');
    expect(NS).toContain('events.push(ev("fa_independent", npc, Some(team), None));');
    // 정원과 나이를 둘 다 본다
    expect(NS).toContain("let age_ok = independent_age_max.map_or(false, |m| npc.age <= m);");
  });
});
