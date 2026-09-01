import { describe, it, expect } from "vitest";
import { evaluateCondition } from "../conditionEvaluator";
import { GROUPS_BY_LEAGUE } from "../leagueTeams.generated";
import type { EventContext, Condition } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";
import type { Standing } from "../../types/season";

/**
 * 🔴 **`team_rank` 는 조·권역 안의 순위다** (2026-09-01).
 *
 * 예전엔 리그 전체에서 셌다. 그런데 아마추어 리그는 통짜가 아니다:
 *
 * ```
 *   고교  102팀  권역 8개 (6~20팀)
 *   대학   50팀  조   5개 (각 10팀)
 *   프로   10팀  조 없음 — 리그가 곧 조
 * ```
 *
 * 그래서 `team_rank_lte 2` 가 고교에서 **102팀 중 2위**를 요구했고 넷 다
 * 한 번도 안 떴다(트랙 B 실측 0/4).
 *
 * ⚠ **문턱이 아니라 모수가 틀렸다는 증거는 이름에 있다** —
 * `EVT_UNIV_GROUP_LAST` 가 `team_rank_gte 4` 다. 50팀 기준이면 4위는
 * 상위권인데 「조 꼴찌」라 부른다. 10팀 조를 전제로 쓴 값이다.
 * 그래서 **문턱은 하나도 안 고쳤다.**
 */

const proto = (over: Partial<ProtagonistSave> = {}): ProtagonistSave => ({
  id: "PLY_HERO", name: "검사", careerStage: "highschool",
  leagueId: "LEAGUE_HIGHSCHOOL", teamId: "TEAM_HS_GYERYONG",
  grade: 1, age: 17, playerType: "pitcher", position: "SP",
  ...over,
} as unknown as ProtagonistSave);

const ctxOf = (p: ProtagonistSave, standings: Standing[]): EventContext => ({
  protagonist: p, currentWeek: 10, seasonPhase: "season",
  standings, stats: {}, triggeredEvents: {},
} as unknown as EventContext);

/** 승률만 다른 순위표를 만든다 — 앞에 올수록 강하다 */
const st = (teamIds: string[]): Standing[] =>
  teamIds.map((teamId, i) => ({
    teamId, wins: 100 - i, losses: i, draws: 0,
    winPct: (100 - i) / 100, runsFor: 0, runsAgainst: 0, streak: "", last10: "",
  })) as unknown as Standing[];

const lte = (value: number): Condition => ({ type: "team_rank_lte", value } as Condition);
const gte = (value: number): Condition => ({ type: "team_rank_gte", value } as Condition);

// 실제 편성에서 가져온다 — 검사에 팀 이름을 적으면 편성이 바뀔 때 안 따라간다
const HS_REGION = Object.values(GROUPS_BY_LEAGUE.LEAGUE_HIGHSCHOOL)[0];
const UNIV_GROUP = Object.values(GROUPS_BY_LEAGUE.LEAGUE_UNIVERSITY)[0];
const HS_OTHERS = Object.values(GROUPS_BY_LEAGUE.LEAGUE_HIGHSCHOOL)
  .slice(1).flat();

describe("고교 — 권역 안에서 센다", () => {
  it("대조군: 편성이 실제로 있다", () => {
    expect(HS_REGION.length).toBeGreaterThan(3);
    expect(HS_OTHERS.length).toBeGreaterThan(50);
  });

  /**
   * 🔴 **이 검사가 결함을 재현한다.** 내 권역에서는 1위인데, 다른 권역 팀
   * 90여 개를 순위표 앞에 깔면 전국 순위는 90위대가 된다.
   * 예전 코드는 여기서 `lte 2` 를 거짓이라 답했다.
   */
  it("다른 권역 팀이 앞에 깔려도 내 권역 1위면 lte 2 가 참이다", () => {
    const me = HS_REGION[0];
    // 다른 권역 전부가 나보다 강하다 — 전국 순위로는 한참 뒤다
    const standings = st([...HS_OTHERS, ...HS_REGION]);
    const ctx = ctxOf(proto({ teamId: me }), standings);
    expect(evaluateCondition(lte(2), ctx)).toBe(true);
  });

  it("권역 안 꼴찌면 lte 2 가 거짓이다", () => {
    const me = HS_REGION[HS_REGION.length - 1];
    const standings = st([...HS_REGION, ...HS_OTHERS]);
    const ctx = ctxOf(proto({ teamId: me }), standings);
    expect(evaluateCondition(lte(2), ctx)).toBe(false);
  });

  it("권역 안 꼴찌면 gte(권역 크기) 가 참이다", () => {
    const me = HS_REGION[HS_REGION.length - 1];
    const standings = st([...HS_REGION, ...HS_OTHERS]);
    const ctx = ctxOf(proto({ teamId: me }), standings);
    expect(evaluateCondition(gte(HS_REGION.length), ctx)).toBe(true);
  });
});

describe("대학 — 조 안에서 센다", () => {
  /** `EVT_UNIV_GROUP_LAST` 가 `gte 4` 다. 10팀 조에서 4위 이하 = 하위권 */
  it("조 4위면 gte 4 가 참이다 (50팀 전체로는 상위권)", () => {
    const me = UNIV_GROUP[3];
    const others = Object.values(GROUPS_BY_LEAGUE.LEAGUE_UNIVERSITY).slice(1).flat();
    const standings = st([...UNIV_GROUP, ...others]);
    const ctx = ctxOf(
      proto({ leagueId: "LEAGUE_UNIVERSITY", teamId: me, careerStage: "university" }),
      standings);
    expect(evaluateCondition(gte(4), ctx)).toBe(true);
  });

  /** `EVT_UNIV_GROUP_LEAD` 가 `lte 1` — 「조 선두」 */
  it("조 선두면 lte 1 이 참이다", () => {
    const me = UNIV_GROUP[0];
    const others = Object.values(GROUPS_BY_LEAGUE.LEAGUE_UNIVERSITY).slice(1).flat();
    // 다른 조 팀들을 앞에 깔아 전국 1위가 아니게 만든다
    const standings = st([...others, ...UNIV_GROUP]);
    const ctx = ctxOf(
      proto({ leagueId: "LEAGUE_UNIVERSITY", teamId: me, careerStage: "university" }),
      standings);
    expect(evaluateCondition(lte(1), ctx)).toBe(true);
  });
});

describe("프로 — 조가 없으면 리그 전체가 모수다", () => {
  const KBL = ["TEAM_KBL_A_1", "TEAM_KBL_B_1", "TEAM_KBL_C_1", "TEAM_KBL_D_1"];

  it("리그 1위면 lte 1 이 참이다", () => {
    const ctx = ctxOf(
      proto({ leagueId: "LEAGUE_KBL", teamId: KBL[0], careerStage: "pro_kbl" }),
      st(KBL));
    expect(evaluateCondition(lte(1), ctx)).toBe(true);
  });

  it("리그 3위면 lte 2 가 거짓이다", () => {
    const ctx = ctxOf(
      proto({ leagueId: "LEAGUE_KBL", teamId: KBL[2], careerStage: "pro_kbl" }),
      st(KBL));
    expect(evaluateCondition(lte(2), ctx)).toBe(false);
  });
});

describe("순위표에 팀이 없으면 거짓이다", () => {
  /**
   * ⚠ **이건 조용히 false 다** — 오류도 로그도 없다. 트랙 B 가 독립리그에서
   * 실제로 그 상태를 실측했다(`s.standings` 에 주인공 팀이 없었다).
   * 그건 별개 결함이고, 여기서는 **판정이 그때 false 라는 것만** 못박는다.
   */
  it("빈 순위표", () => {
    const ctx = ctxOf(proto(), []);
    expect(evaluateCondition(lte(99), ctx)).toBe(false);
    expect(evaluateCondition(gte(1), ctx)).toBe(false);
  });
});
