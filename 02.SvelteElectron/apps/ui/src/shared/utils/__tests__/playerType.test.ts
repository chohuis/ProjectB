import { describe, it, expect } from "vitest";
import { evaluateCondition, evaluateConditions } from "../conditionEvaluator";
import type { EventContext, Condition } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

/**
 * **`player_type` — 이 이야기가 누구 것인가.**
 *
 * 🔴 2026-08-25 실측: 전체 공용 11종 중 **여덟이 투수 대사인데 조건에
 * 선언이 없었다.** "커맨드가 장난 아니네" 댓글도, "30구 추가 불펜"도.
 * 지금은 주인공이 항상 투수라(`NewGamePage.svelte:271`) 안 터진다 —
 * **타자가 열리는 날 터질 자리**를 미리 막는 것이다.
 */
const proto = (over: Partial<ProtagonistSave> = {}): ProtagonistSave => ({
  id: "PLY_HERO", name: "검사", careerStage: "highschool",
  leagueId: "LEAGUE_HIGHSCHOOL", teamId: "TEAM_A", grade: 1, age: 17,
  playerType: "pitcher", position: "SP", handedness: "R", pitchingForm: "overhand",
  jerseyNumber: 18, condition: 80, fatigue: 10, morale: 70,
  pitching: { ovr: 50, stamina: 50, velocity: 50, command: 50, control: 50,
    movement: 50, mentality: 50, recovery: 50, clutch: 50, holdRunners: 50 },
  batting: { ovr: 30, contact: 42, power: 25, eye: 28, discipline: 28, speed: 48,
    baseInstinct: 48, bunting: 45, platoon: 50, fielding: 40, arm: 50, battingClutch: 25 },
  primaryPosition: "SP", positionRatings: { SP: 50 },
  diligence: 60, popularity: 10, developmentRate: 1, potentialHidden: 70,
  growthPoints: 0, tags: [], pitchingXP: {}, battingXP: {}, pitches: [],
  money: 1000, fame: 0, scoutScore: 0, proServiceYears: 0,
  ...over,
} as unknown as ProtagonistSave);

const ctx = (t: "pitcher" | "batter" | "twoWay"): EventContext => ({
  protagonist: proto({ playerType: t } as Partial<ProtagonistSave>),
  currentWeek: 10, seasonPhase: "season", standings: [], stats: {}, triggeredEvents: {},
});

const want = (t: "pitcher" | "batter" | "twoWay"): Condition =>
  ({ type: "player_type", playerType: t }) as Condition;

describe("player_type", () => {
  it("투수는 투수 것만 받는다", () => {
    expect(evaluateCondition(want("pitcher"), ctx("pitcher"))).toBe(true);
    expect(evaluateCondition(want("batter"),  ctx("pitcher"))).toBe(false);
  });

  it("타자는 타자 것만 받는다", () => {
    expect(evaluateCondition(want("batter"),  ctx("batter"))).toBe(true);
    expect(evaluateCondition(want("pitcher"), ctx("batter"))).toBe(false);
  });

  /**
   * 🔴 예전엔 `===` 하나였다. `twoWay` 주인공에게 **투수 것도 타자 것도
   * 안 떴다** — 선언을 붙인 규칙이 통째로 사라지는 모양이다. 겸업은 둘 다다.
   */
  it("🔴 투타겸업은 양쪽 다 받는다 — 정확 일치면 통째로 사라진다", () => {
    expect(evaluateCondition(want("pitcher"), ctx("twoWay"))).toBe(true);
    expect(evaluateCondition(want("batter"),  ctx("twoWay"))).toBe(true);
    expect(evaluateCondition(want("twoWay"),  ctx("twoWay"))).toBe(true);
  });

  it("겸업만 노리는 조건은 겸업에게만", () => {
    expect(evaluateCondition(want("twoWay"), ctx("pitcher"))).toBe(false);
    expect(evaluateCondition(want("twoWay"), ctx("batter"))).toBe(false);
  });

  /**
   * 선택지 갈래 — `DEC_COND_FATIGUE_WARNING`·`DEC_RAND_SENIOR_ADVICE`가
   * 이 모양으로 투구/타격 보상을 가른다. **선택지 조건의 첫 데이터 사용처**다.
   *
   * ⚠ 겸업이면 **둘 다 열린다.** 같은 이름표가 두 개 뜨는 건 화면 문제지만,
   * 하나도 안 열려 선택지가 통째로 사라지는 것보다 낫다.
   */
  it("선택지 갈래 — 한쪽은 반드시 열린다", () => {
    const pitcherOpt = [want("pitcher")];
    const batterOpt  = [want("batter")];
    for (const t of ["pitcher", "batter", "twoWay"] as const) {
      const open = [pitcherOpt, batterOpt].filter((c) => evaluateConditions(c, ctx(t)));
      expect(open.length).toBeGreaterThanOrEqual(1);
    }
  });
});

/**
 * **무대·리그 조건이 배열을 받는다.**
 *
 * 🔴 둘 다 단일 값만 받아서 **여러 리그를 한 번에 가리킬 수단이 없었다.**
 *   `career_stage: "pro_kbl"`  →  해외로 나가면 1군 이야기 171종이 통째로 멈췄다
 *   `league_id: "LEAGUE_KBL_FARM"`  →  **ABL·JBL 2군이 0종**이었다
 *
 * 타입을 늘리지 않고 배열을 열었다(`stages` / `leagueIds`). 단일 값은 그대로 동작한다.
 */
describe("무대·리그 배열 조건", () => {
  const at = (over: Partial<ProtagonistSave>): EventContext => ({
    protagonist: proto(over), currentWeek: 10, seasonPhase: "season",
    standings: [], stats: {}, triggeredEvents: {},
  });
  const PRO = ["pro_kbl", "pro_abl", "pro_jbl"];
  const FARMS = ["LEAGUE_KBL_FARM", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"];

  it("career_stage — stages 배열", () => {
    const c = { type: "career_stage", stages: PRO } as unknown as Condition;
    for (const s of PRO) {
      expect(evaluateCondition(c, at({ careerStage: s } as Partial<ProtagonistSave>))).toBe(true);
    }
    expect(evaluateCondition(c, at({ careerStage: "highschool" } as Partial<ProtagonistSave>))).toBe(false);
  });

  it("league_id — leagueIds 배열", () => {
    const c = { type: "league_id", leagueIds: FARMS } as unknown as Condition;
    for (const l of FARMS) {
      expect(evaluateCondition(c, at({ leagueId: l } as Partial<ProtagonistSave>))).toBe(true);
    }
    expect(evaluateCondition(c, at({ leagueId: "LEAGUE_KBL" } as Partial<ProtagonistSave>))).toBe(false);
  });

  it("단일 값은 그대로 동작한다 — 기존 데이터가 안 깨진다", () => {
    expect(evaluateCondition({ type: "career_stage", stage: "pro_kbl" } as unknown as Condition,
      at({ careerStage: "pro_kbl" } as Partial<ProtagonistSave>))).toBe(true);
    expect(evaluateCondition({ type: "league_id", leagueId: "LEAGUE_KBL_FARM" } as unknown as Condition,
      at({ leagueId: "LEAGUE_KBL_FARM" } as Partial<ProtagonistSave>))).toBe(true);
  });
});
