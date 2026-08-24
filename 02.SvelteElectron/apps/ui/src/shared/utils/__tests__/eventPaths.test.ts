import { describe, it, expect } from "vitest";
import { evaluateCondition } from "../conditionEvaluator";
import { NUM_PATHS, EQ_PATHS, resolvePath } from "../eventPaths";
import type { EventContext, Condition } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

/**
 * **경로로 읽는 일반 조건.**
 *
 * 조건 타입을 필드마다 하나씩 만들던 걸 여기서 멈췄다. 45종까지 그렇게
 * 늘렸는데 새 축이 생길 때마다 평가기·타입 유니온·`CONDITION_FIELDS`·문서
 * 넷을 같이 고쳐야 했고, **그 넷이 어긋나는 게 이 트랙이 두 번 겪은 결함**이다.
 *
 * 🔴 **제일 중요한 검사는 "모르는 경로면 던진다"**이다. 조용히 `undefined`를
 * 돌려주면 비교가 false가 되고, 그게 2026-08-22에 35종을 죽인 형태다.
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

const ctx = (over: Partial<EventContext> = {}): EventContext => ({
  protagonist: proto(), currentWeek: 10, seasonPhase: "season",
  standings: [], stats: {}, triggeredEvents: {},
  ...over,
});

const ev = (c: Condition, x: EventContext = ctx()) => evaluateCondition(c, x);

describe("경로 조건", () => {
  it("🔴 모르는 경로는 던진다 — 조용히 false가 되면 안 된다", () => {
    expect(() => resolvePath(ctx(), "batting.contct")).toThrow(/모르는 경로/);
    expect(() => resolvePath(ctx(), "없는.경로")).toThrow(/모르는 경로/);
  });

  it("타격 능력치를 읽는다 — 예전엔 조건이 아예 없었다", () => {
    expect(ev({ type: "num_gte", path: "batting.contact", value: 40 })).toBe(true);
    expect(ev({ type: "num_gte", path: "batting.contact", value: 50 })).toBe(false);
    expect(ev({ type: "num_lte", path: "batting.power", value: 30 })).toBe(true);
  });

  it("중첩 경로 — 계약·부상·시즌건강", () => {
    const c = ctx({
      protagonist: proto({
        contract: { remainingYears: 1, salary: 5000 },
        injury: { severity: "light", recoveryWeeksLeft: 2 },
        seasonHealth: { lowConditionWeeks: 4, highFatigueWeeks: 7, injuryCount: 1, totalWeeks: 20 },
      } as unknown as Partial<ProtagonistSave>),
    });
    expect(ev({ type: "num_lte", path: "contract.remainingYears", value: 1 }, c)).toBe(true);
    expect(ev({ type: "num_gte", path: "injury.recoveryWeeksLeft", value: 2 }, c)).toBe(true);
    expect(ev({ type: "num_gte", path: "seasonHealth.highFatigueWeeks", value: 5 }, c)).toBe(true);
  });

  it("값이 없으면 false — 경로가 틀린 것과 다르다", () => {
    // 안 다쳤으면 injury가 undefined다. 그건 결함이 아니라 상태다
    expect(ev({ type: "num_gte", path: "injury.recoveryWeeksLeft", value: 1 })).toBe(false);
    expect(ev({ type: "num_gte", path: "contract.salary", value: 1 })).toBe(false);
  });

  it("배열 길이를 센다", () => {
    const c = ctx({ protagonist: proto({ tags: ["가", "나"] }) });
    expect(ev({ type: "num_gte", path: "tags.count", value: 2 }, c)).toBe(true);
    expect(ev({ type: "num_gte", path: "tags.count", value: 3 }, c)).toBe(false);
  });

  it("eq / neq — 문자열·열거", () => {
    expect(ev({ type: "eq", path: "careerStage", value: "highschool" })).toBe(true);
    expect(ev({ type: "neq", path: "careerStage", value: "pro_kbl" })).toBe(true);
    expect(ev({ type: "eq", path: "position", value: "RP" })).toBe(false);
  });

  it("순위표 — 내 팀 행을 찾는다", () => {
    const c = ctx({
      standings: [
        { teamId: "TEAM_A", wins: 12, losses: 3, draws: 0, winPct: 0.8, runsFor: 60, runsAgainst: 30 },
      ] as EventContext["standings"],
    });
    expect(ev({ type: "num_gte", path: "standing.wins", value: 10 }, c)).toBe(true);
    expect(ev({ type: "num_lte", path: "standing.losses", value: 5 }, c)).toBe(true);
  });

  it("관계도 — 같은 종류가 여럿이면 가장 높은 값", () => {
    const c = ctx({
      relations: [
        { personId: "A", kind: "teammate", value: 20 },
        { personId: "B", kind: "teammate", value: 65 },
      ] as EventContext["relations"],
    });
    expect(ev({ type: "relation_gte", kind: "teammate", value: 60 }, c)).toBe(true);
    expect(ev({ type: "relation_gte", kind: "manager", value: 1 }, c)).toBe(false);
  });

  it("관계가 안 실리면 전부 false — 비동기라 못 실을 수 있다", () => {
    expect(ev({ type: "relation_gte", kind: "manager", value: 0 })).toBe(false);
  });

  it("경로 표가 비어 있지 않다", () => {
    expect(NUM_PATHS.size).toBeGreaterThan(80);
    expect(EQ_PATHS.size).toBeGreaterThan(20);
  });
});
