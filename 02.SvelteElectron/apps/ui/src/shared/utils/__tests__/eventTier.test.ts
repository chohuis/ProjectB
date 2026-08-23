import { describe, it, expect } from "vitest";
import { runEventEngine, resetEventFunnelStats, eventFunnelStats, tierOf } from "../eventEngine";
import type { EventRule, MessageTemplate, EventContext } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

/**
 * **중요도 등급** — `type`이 "어떻게 발동하는가"라면 이건 "얼마나 중요한가"다.
 *
 * 예전엔 둘이 섞여 있었다. `mandatory` 105건이 전부 달력 일정인데 상한이 없어
 * 사실상 최우선 등급이었고, **부상처럼 지금 벌어진 일은 `conditional`로 밀려나
 * 주당 1칸을 두고 분위기 소식과 다퉜다.**
 *
 * 🔴 **등급을 안 적으면 동작이 하나도 안 바뀌어야 한다.** 갈아타는 중이라
 * `tierOf`가 `oncePolicy`로 추론하는데, 그 추론이 기존 동작과 어긋나면
 * 데이터를 한 줄도 안 고쳤는데 게임이 달라진다.
 */
const proto = (): ProtagonistSave => ({
  id: "PLY_HERO", name: "검사", careerStage: "highschool",
  leagueId: "LEAGUE_HIGHSCHOOL", teamId: "TEAM_HS_A", grade: 1, age: 17,
  playerType: "pitcher", position: "SP", handedness: "R", pitchingForm: "overhand",
  jerseyNumber: 18, condition: 80, fatigue: 10, morale: 70,
  pitching: { ovr: 50, stamina: 50, velocity: 50, command: 50, control: 50,
    movement: 50, mentality: 50, recovery: 50, clutch: 50, holdRunners: 50 },
  batting: { ovr: 30, contact: 30, power: 25, eye: 28, discipline: 28, speed: 48,
    baseInstinct: 48, bunting: 45, platoon: 50, fielding: 40, arm: 50, battingClutch: 25 },
  primaryPosition: "SP", positionRatings: { SP: 50 },
  diligence: 60, popularity: 10, developmentRate: 1, potentialHidden: 70,
  growthPoints: 0, tags: [], pitchingXP: {}, battingXP: {}, pitches: [],
  money: 1000, fame: 0, scoutScore: 0, proServiceYears: 0,
} as unknown as ProtagonistSave);

const ctx = (): EventContext => ({
  protagonist: proto(), currentWeek: 10, seasonPhase: "season",
  standings: [], stats: {}, triggeredEvents: {},
});

const rule = (over: Partial<EventRule>): EventRule => ({
  id: "EVT_X", title: "검사", type: "conditional", category: "career",
  priority: 100, oncePolicy: "repeatable", conditions: [],
  messageTemplateId: "MSG_T", decisionTemplateId: null,
  ...over,
} as EventRule);

const MSG: MessageTemplate = { id: "MSG_T", category: "system", subject: "제목", body: "본문" } as MessageTemplate;

const run = (rules: EventRule[]) => {
  resetEventFunnelStats();
  return runEventEngine(rules, [], new Map([["MSG_T", MSG]]), new Map(), ctx(), 2026, 0, [0.5, 0.5, 0.5, 0.5]);
};

describe("이벤트 등급", () => {
  it("등급을 안 적으면 oncePolicy로 추론한다 — 동작 무변경", () => {
    expect(tierOf(rule({ oncePolicy: "repeatable" }))).toBe("ambient");
    expect(tierOf(rule({ oncePolicy: "once_per_season" }))).toBe("important");
    expect(tierOf(rule({ oncePolicy: "once_per_career" }))).toBe("important");
    expect(tierOf(rule({ oncePolicy: "once_per_stage_year" }))).toBe("important");
  });

  it("적힌 등급이 추론을 이긴다", () => {
    expect(tierOf(rule({ oncePolicy: "repeatable", tier: "urgent" }))).toBe("urgent");
    expect(tierOf(rule({ oncePolicy: "once_per_career", tier: "ambient" }))).toBe("ambient");
  });

  it("conditional은 여전히 주당 1건이다 — 등급이 없으면", () => {
    const r = run([
      rule({ id: "EVT_A", priority: 300 }),
      rule({ id: "EVT_B", priority: 200 }),
      rule({ id: "EVT_C", priority: 100 }),
    ]);
    expect(r.newMessages).toHaveLength(1);
    expect(eventFunnelStats.conditional.crowdedOut).toBe(2);
  });

  it("🔴 urgent는 상한 밖이다 — 다쳤는데 다음 주에 알려주면 안 된다", () => {
    const r = run([
      rule({ id: "EVT_HURT1", tier: "urgent", priority: 10 }),
      rule({ id: "EVT_HURT2", tier: "urgent", priority: 20 }),
      rule({ id: "EVT_CHAT",  tier: "ambient", priority: 900 }),
    ]);
    const ids = r.newMessages.map((m) => m.id.split("-")[1]);
    // urgent 둘 다 + 나머지 한 칸 = 3통
    expect(r.newMessages).toHaveLength(3);
    expect(ids.filter((i) => i.startsWith("EVT_HURT"))).toHaveLength(2);
    expect(eventFunnelStats.conditional.urgentPicked).toBe(2);
  });

  it("urgent는 대기로 세지 않는다 — 다 나갔으므로", () => {
    run([
      rule({ id: "EVT_U", tier: "urgent" }),
      rule({ id: "EVT_A", tier: "ambient" }),
      rule({ id: "EVT_B", tier: "ambient" }),
    ]);
    // ambient 둘 중 하나만 나가고 하나가 밀린다. urgent는 셈에서 빠진다
    expect(eventFunnelStats.conditional.crowdedOut).toBe(1);
  });

  it("important가 ambient보다 먼저다 — priority가 낮아도", () => {
    const r = run([
      rule({ id: "EVT_CHAT",  tier: "ambient",   priority: 900 }),
      rule({ id: "EVT_STORY", tier: "important", priority: 50 }),
    ]);
    expect(r.newMessages[0].id).toContain("EVT_STORY");
    expect(eventFunnelStats.conditional.scarcePicked).toBe(1);
  });
});
