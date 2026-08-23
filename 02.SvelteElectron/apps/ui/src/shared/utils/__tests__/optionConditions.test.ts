import { describe, it, expect } from "vitest";
import { runEventEngine, resetEventFunnelStats, eventFunnelStats } from "../eventEngine";
import type { EventRule, DecisionTemplate, MessageTemplate, EventContext } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

/**
 * **선택지 단위 조건** — "그 이야기 안에서 이 길이 열려 있는가".
 *
 * 이벤트 조건은 "이 이야기가 뜨는가"를 정한다. 이건 그다음이다. 예전엔 이게
 * 없어서 **고르면 무조건 그 효과였고, 선택이 전부 트레이드오프 고르기로
 * 수렴했다.**
 *
 * 🔴 **제일 중요한 건 마지막 검사다.** `trimMailbox`는 미결 선택지를
 * 상한(200)을 넘겨서라도 보존한다 — 진행이 막히니까. 그래서 조건 때문에
 * 선택지가 **0개**가 되면 화면에 버튼이 하나도 없는 **영원히 못 지우는
 * 메시지**가 된다. 그때는 선택지를 통째로 떼고 소식만 내보내야 한다.
 */
const proto = (over: Partial<ProtagonistSave> = {}): ProtagonistSave => ({
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
  ...over,
} as unknown as ProtagonistSave);

const ctxOf = (p: ProtagonistSave): EventContext => ({
  protagonist: p, currentWeek: 10, seasonPhase: "season",
  standings: [], stats: {}, triggeredEvents: {},
});

const RULE: EventRule = {
  id: "EVT_T", title: "검사", type: "mandatory", category: "career",
  priority: 100, oncePolicy: "repeatable", conditions: [],
  messageTemplateId: "MSG_T", decisionTemplateId: "DEC_T",
} as EventRule;

const MSG: MessageTemplate = { id: "MSG_T", category: "system", subject: "제목", body: "본문" } as MessageTemplate;

const run = (dec: DecisionTemplate, p: ProtagonistSave) => {
  resetEventFunnelStats();
  return runEventEngine(
    [RULE], [], new Map([["MSG_T", MSG]]), new Map([["DEC_T", dec]]),
    ctxOf(p), 2026, 0, [0.5, 0.5, 0.5, 0.5],
  );
};

const dec = (options: DecisionTemplate["options"]): DecisionTemplate =>
  ({ id: "DEC_T", prompt: "고르시오", options });

describe("선택지 단위 조건", () => {
  it("조건이 없으면 전부 열린다 — 예전 동작 그대로", () => {
    const r = run(dec([{ id: "a", label: "가" }, { id: "b", label: "나" }]), proto());
    expect(r.newMessages[0].decision?.options.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("조건을 통과한 선택지만 보인다", () => {
    const d = dec([
      { id: "buy",  label: "산다",   conditions: [{ type: "money_gte", value: 500 }] },
      { id: "pass", label: "넘긴다" },
    ]);
    expect(run(d, proto({ money: 1000 })).newMessages[0].decision?.options.map((o) => o.id))
      .toEqual(["buy", "pass"]);
    expect(run(d, proto({ money: 100 })).newMessages[0].decision?.options.map((o) => o.id))
      .toEqual(["pass"]);
  });

  it("🔴 전부 닫히면 선택지를 떼고 소식만 남긴다 — 안 그러면 못 지우는 메시지가 된다", () => {
    const d = dec([
      { id: "rich", label: "산다", conditions: [{ type: "money_gte", value: 99999 }] },
    ]);
    const r = run(d, proto({ money: 10 }));
    const msg = r.newMessages[0];
    expect(msg).toBeDefined();              // 소식 자체는 나간다
    expect(msg.decision).toBeUndefined();   // 선택지는 없다
    expect(msg.body).toBe("본문");
    expect(eventFunnelStats.decisionsClosedOut).toBe(1);
  });

  it("본문도 없고 선택지도 다 닫히면 아예 안 나간다", () => {
    const noBody: MessageTemplate = { id: "MSG_T", category: "system", subject: "제목", body: "" } as MessageTemplate;
    resetEventFunnelStats();
    const r = runEventEngine(
      [RULE], [], new Map([["MSG_T", noBody]]),
      new Map([["DEC_T", dec([{ id: "x", label: "가", conditions: [{ type: "money_gte", value: 99999 }] }])]]),
      ctxOf(proto({ money: 10 })), 2026, 0, [0.5],
    );
    expect(r.newMessages).toHaveLength(0);
    expect(eventFunnelStats.mandatory.emptyDropped).toBe(1);
  });

  it("제시·열림 수를 센다", () => {
    run(dec([
      { id: "a", label: "가" },
      { id: "b", label: "나", conditions: [{ type: "money_gte", value: 99999 }] },
    ]), proto({ money: 10 }));
    expect(eventFunnelStats.optionsOffered).toBe(2);
    expect(eventFunnelStats.optionsOpen).toBe(1);
  });
});
