import { describe, it, expect } from "vitest";
import { runEventEngine, resetEventFunnelStats, eventFunnelStats, tierOf, gradeOf } from "../eventEngine";
import { parseTierRules, stageGroupOf, gradeBelow, type TierRules } from "../tierRules";
import type { EventRule, MessageTemplate, EventContext } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";
import RAW_TIER_RULES from "../../../../../../resource/data/master/events/tier_rules.json";

/**
 * **등급 줄기** (PLAN_EVENT_TIERS §1·§3 · 2026-09-08).
 *
 * 예전 이 파일은 「중요도 등급」(urgent·important·ambient)을 봤고, 그 등급은
 * `oncePolicy` 로 **추론**됐다. 갈아타기가 끝나 추론이 없어졌으므로 그 절은
 * 사라졌다 — 지금 남은 것은 **등급 밖인 `urgent`** 하나다.
 *
 * 🔴 **규칙 값은 진짜 파일에서 읽는다.** 여기 숫자를 적으면 그게 두 번째
 *   정본이 되고, `tier_rules.json` 을 고쳐도 검사만 옛 값으로 돈다.
 */
const RULES: TierRules = parseTierRules(RAW_TIER_RULES);

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
  militaryStatus: "미필",
  ...over,
} as unknown as ProtagonistSave);

const ctx = (over: Partial<EventContext> = {}): EventContext => ({
  protagonist: proto(), currentWeek: 10, seasonPhase: "season",
  standings: [], stats: {}, triggeredEvents: {},
  ...over,
});

const rule = (over: Partial<EventRule>): EventRule => ({
  id: "EVT_X", title: "검사", type: "conditional", category: "career",
  priority: 100, oncePolicy: "repeatable", conditions: [],
  messageTemplateId: "MSG_T", decisionTemplateId: null,
  ...over,
} as EventRule);

const MSG: MessageTemplate = { id: "MSG_T", category: "system", subject: "제목", body: "본문" } as MessageTemplate;

/** `rands` 를 안 주면 전부 0.5 다 — 뽑기가 가운데로 떨어진다 */
const run = (rules: EventRule[], c: EventContext = ctx(), rands?: number[], stage = "고교",
             tierRules: TierRules = RULES) => {
  resetEventFunnelStats();
  return runEventEngine(
    rules, [], new Map([["MSG_T", MSG]]), new Map(), c, 2026, 0,
    rands ?? new Array(12).fill(0.5), tierRules, stage,
  );
};

/**
 * 🔴 **정본 데이터에는 시즌 상한이 없다** (2026-09-08 · `tier_rules.json`
 *   `_seasonCapDoc` — 고교 1학년이 한 시즌에 레어 6·유니크 2 를 다 채워
 *   시즌 후반이 노말만 남았다). 그래도 **읽는 코드는 남아 있다** — 옛
 *   세이브·다른 규칙 JSON 이 상한을 들고 있어도 안 죽어야 하고, 되살리는
 *   것이 데이터 한 줄이어야 하기 때문이다.
 *
 * 그 갈래를 지키려면 검사가 **상한을 직접 심어야** 한다. 예전엔 파일에서
 *   `RULES.seasonCap.rare!` 를 읽었는데 이제 그 자리가 undefined 다.
 * ⚠ 여기 6 은 「지금 규칙 값」이 아니라 **검사용 자리표**다 — 정본이 아니다.
 */
const CAP_RARE = 6;
const CAPPED_RULES: TierRules = { ...RULES, seasonCap: { rare: CAP_RARE } };
/**
 * 「레어를 뽑히게 하려고 그 위를 막는다」는 **검사 기법**이다 — 유니크·히든에
 * 상한을 걸고 `tierCounts` 를 채우면 가중이 0 이 되어 0.99 가 레어로 떨어진다.
 * ⚠ 정본 데이터에는 상한이 없으므로 여기서 심어야 한다(위 주석).
 */
const CAPPED_ABOVE_RARE: TierRules = { ...RULES, seasonCap: { unique: 1, hidden: 1 } };

describe("등급 줄기 — 한 주에 하나", () => {
  it("등급 넷만 줄기를 탄다 — `urgent`·미기재는 안 탄다", () => {
    expect(gradeOf(rule({ tier: "normal" }))).toBe("normal");
    expect(gradeOf(rule({ tier: "hidden" }))).toBe("hidden");
    expect(gradeOf(rule({ tier: "urgent" }))).toBeNull();
    expect(gradeOf(rule({}))).toBeNull();
  });

  it("🔴 `oncePolicy` 추론을 지웠다 — 등급을 안 적으면 아무 줄기도 안 탄다", () => {
    // 예전엔 `repeatable` → ambient · 나머지 → important 였다.
    // 남겨 두면 등급을 빠뜨린 새 이벤트가 조용히 등급 밖에서 돈다
    expect(tierOf(rule({ oncePolicy: "repeatable" }))).toBeNull();
    expect(tierOf(rule({ oncePolicy: "once_per_career" }))).toBeNull();
    expect(tierOf(rule({ tier: "urgent" }))).toBe("urgent");

    const r = run([rule({ id: "EVT_NOTIER" })]);
    expect(r.newMessages).toHaveLength(0);
  });

  it("등급 이벤트는 주당 하나다 — 랜덤 풀이 흡수돼도", () => {
    const r = run([
      rule({ id: "EVT_A", tier: "normal" }),
      rule({ id: "EVT_B", tier: "normal", type: "random", poolId: "POOL_MEDIA_DAILY" }),
      rule({ id: "EVT_C", tier: "normal", type: "random", poolId: "POOL_BODY_DAILY" }),
    ]);
    expect(r.newMessages).toHaveLength(1);
    expect(r.gradeFired).toBe("normal");
    expect(eventFunnelStats.grade.crowdedOut).toBe(2);
    // 풀은 더 이상 굴리지 않는다 — 옛 경로가 살아 있으면 여기가 0 이 아니다
    expect(eventFunnelStats.random.poolRolls).toBe(0);
  });

  it("🔴 urgent는 등급 상한 밖이다 — 다쳤는데 다음 주에 알려주면 안 된다", () => {
    const r = run([
      rule({ id: "EVT_HURT1", tier: "urgent" }),
      rule({ id: "EVT_HURT2", tier: "urgent" }),
      rule({ id: "EVT_CHAT",  tier: "normal" }),
    ]);
    expect(r.newMessages).toHaveLength(3);
    expect(eventFunnelStats.conditional.urgentPicked).toBe(2);
    expect(r.gradeFired).toBe("normal");
  });

  it("이번 시즌 안 뜬 것이 먼저다", () => {
    const r = run(
      [rule({ id: "EVT_OLD", tier: "normal", weight: 100 }),
       rule({ id: "EVT_NEW", tier: "normal", weight: 1 })],
      ctx({ triggeredEvents: { EVT_OLD: 3 } }),
    );
    // 가중이 100배인데도 「아직 안 뜬 것」 띠가 이긴다
    expect(r.newMessages[0].id).toContain("EVT_NEW");
  });

  it("밀린 주 가중이 붙는다 — 안 붙으면 낮은 가중이 시즌 내내 뒤에 선다", () => {
    // 둘 다 이번 시즌 안 떴다. 가중 1 대 1 인데 한쪽이 10주 밀렸다
    const r = run(
      [rule({ id: "EVT_LOW", tier: "normal", weight: 1 }),
       rule({ id: "EVT_STARVED", tier: "normal", weight: 1 })],
      ctx({ eventStarve: { EVT_STARVED: 10 } }),
      // 가중 1 : 11 → 0.5 는 뒤쪽(누계 12 중 6)에 떨어진다
      new Array(12).fill(0.5),
    );
    expect(r.newMessages[0].id).toContain("EVT_STARVED");
    // 뽑힌 것은 0 으로 되돌린다 — 안 되돌리면 계속 큰 가중을 들고 다닌다
    expect(r.starveUpdates.EVT_STARVED).toBe(0);
    expect(r.starveUpdates.EVT_LOW).toBe(1);
  });

  it("시즌 상한이 **선언돼 있으면** 닿은 등급은 가중 0 이다", () => {
    // 레어 상한까지 찼으면 레어만 있는 판에서 레어가 안 뽑히고 폴백이 난다
    const r = run(
      [rule({ id: "EVT_R", tier: "rare", oncePolicy: "once_per_season" })],
      ctx({ tierCounts: { rare: CAP_RARE, unique: 99, hidden: 99 } }),
      undefined, "고교", CAPPED_RULES,
    );
    expect(r.newMessages).toHaveLength(0);   // 노말이 뽑혔는데 노말 후보가 없다
    expect(eventFunnelStats.tier.capBlocked.rare).toBe(1);
  });

  it("🔴 비면 한 등급 아래로 내려가고 폴백이 세어진다", () => {
    // 유니크만 뽑히게 가중을 몰 수 없으므로 「노말 말고 다 비었다」로 만든다:
    // 노말 후보만 두고 상한으로 노말 위를 다 막으면 폴백이 안 난다 —
    // 반대로 **레어를 뽑히게 하고 레어 후보를 0** 으로 둔다
    const c = ctx({ tierCounts: { unique: 99, hidden: 99 } });
    // 0.99 → 유니크·히든이 상한으로 0 이 된 뒤 가중 80:14 에서 뒤쪽(레어)이 뽑힌다
    const r = run([rule({ id: "EVT_N", tier: "normal" })], c, new Array(12).fill(0.99),
                  "고교", CAPPED_ABOVE_RARE);
    expect(eventFunnelStats.tier.fallback).toBeGreaterThan(0);
    expect(eventFunnelStats.tier.fallbackBy["고교/rare"]).toBe(1);
    expect(r.fallbackFrom).toBe("rare");
    expect(r.gradeFired).toBe("normal");
    expect(r.newMessages).toHaveLength(1);
  });

  it("🔴 폴백도 시즌 상한을 본다 — 추첨만 보면 상한이 샌다", () => {
    // 유니크가 뽑히고 유니크 후보가 0 이면 레어로 내려가는데,
    // 레어가 이미 상한(6)이면 **내려가면 안 된다.** 처음엔 그 구멍이 있었다:
    // 추첨은 상한을 봤는데 폴백은 안 봤다.
    const c = ctx({ tierCounts: { rare: CAP_RARE, hidden: 99 } });
    const r = run(
      [rule({ id: "EVT_R", tier: "rare", oncePolicy: "once_per_season" }),
       rule({ id: "EVT_N", tier: "normal" })],
      c, new Array(12).fill(0.999), "고교", CAPPED_RULES,
    );
    // 레어는 상한이라 절대 안 뜬다 — 노말까지 내려가거나 아무것도 안 뜬다
    expect(r.newMessages.map((m) => m.id).join()).not.toContain("EVT_R");
    expect(eventFunnelStats.tier.capViolation).toBe(0);
    expect(eventFunnelStats.tier.hiddenCareerViolation).toBe(0);
  });

  it("히든은 종당 커리어 한 번이다 — `oncePolicy` 가 뭐라 적혔든", () => {
    const c = ctx({
      protagonist: proto({ careerTriggeredEvents: { EVT_H: 4 } }),
      // 히든만 뽑히도록 나머지를 상한으로 막는다
      tierCounts: { normal: 0, rare: 0, unique: 0 },
    });
    const r = run([rule({ id: "EVT_H", tier: "hidden", oncePolicy: "once_per_season" })], c);
    expect(r.newMessages).toHaveLength(0);
    expect(r.gradeFired).toBeNull();
  });

  it("히든이 뜨면 커리어 기록을 남긴다 — 다음 커리어 내내 안 뜬다", () => {
    const c = ctx({ tierCounts: { normal: 0 } });
    const r = run(
      [rule({ id: "EVT_H", tier: "hidden", oncePolicy: "once_per_season" })],
      c, new Array(12).fill(0.999),
    );
    if (r.gradeFired === "hidden") {
      expect(r.careerUpdatedTriggers.EVT_H).toBe(10);
    }
  });

  it("숨은 조건은 평가는 받되 등급 밖으로 안 샌다", () => {
    const c = ctx({ tierCounts: { rare: 99, unique: 99, hidden: 99 } });
    const blocked = run([rule({
      id: "EVT_H", tier: "normal",
      hiddenCondition: [{ type: "diligence_gte", value: 90 }],
    })], c);
    expect(blocked.newMessages).toHaveLength(0);

    const open = run([rule({
      id: "EVT_H", tier: "normal",
      hiddenCondition: [{ type: "diligence_gte", value: 10 }],
    })], c);
    expect(open.newMessages).toHaveLength(1);
  });

  it("`cost` 는 발동 즉시 넘어온다 — 어느 갈래를 골라도 낸다", () => {
    const c = ctx({ tierCounts: { rare: 99, unique: 99, hidden: 99 } });
    const r = run([rule({ id: "EVT_U", tier: "normal", cost: { fatigueDelta: 12 } })], c);
    expect(r.costs).toEqual([{ fatigueDelta: 12 }]);
  });

  it("소식에 등급이 실린다 — 화면이 규칙 id 로 되짚지 않게", () => {
    const c = ctx({ tierCounts: { rare: 99, unique: 99, hidden: 99 } });
    const r = run([rule({ id: "EVT_N", tier: "normal" })], c);
    expect(r.newMessages[0].eventGrade).toBe("normal");
  });
});

describe("등급 규칙 파일", () => {
  it("등급 순서가 낮은 것부터다 — 폴백이 그 순서로 내려간다", () => {
    expect(gradeBelow("hidden")).toBe("unique");
    expect(gradeBelow("unique")).toBe("rare");
    expect(gradeBelow("rare")).toBe("normal");
    expect(gradeBelow("normal")).toBeNull();
  });

  it("무대는 배열 순서대로 처음 맞는 것이다", () => {
    expect(stageGroupOf(RULES, proto())).toBe("고교");
    expect(stageGroupOf(RULES, proto({ careerStage: "university" }))).toBe("대학");
    expect(stageGroupOf(RULES, proto({ careerStage: "independent" }))).toBe("독립");
    expect(stageGroupOf(RULES, proto({
      careerStage: "pro_kbl", leagueId: "LEAGUE_KBL_FARM",
    }))).toBe("2군");
    // 🔴 복무 중에도 `careerStage` 는 소속이 남는다 — 군이 먼저여야 한다
    expect(stageGroupOf(RULES, proto({
      careerStage: "pro_kbl", leagueId: "LEAGUE_KBL", militaryStatus: "현역",
    }))).toBe("군");
  });

  it("🔴 프로 눈금은 `proServiceYears` 다 — 데뷔 시즌이 0(1년차)", () => {
    // B 가 이벤트에 붙인 조건(`num_lte proServiceYears 4` · `pro_year_gte 5`)과 같아야 한다
    const pro = (y: number) => stageGroupOf(RULES, proto({ careerStage: "pro_kbl", leagueId: "LEAGUE_KBL", proServiceYears: y }));
    expect(pro(0)).toBe("프로초반");   // 1년차
    expect(pro(4)).toBe("프로초반");   // 5년차
    expect(pro(5)).toBe("프로중후반"); // 6년차
    expect(pro(12)).toBe("프로중후반");
  });

  it("모르는 값이면 던진다 — 조용히 기본값으로 굴러가지 않는다", () => {
    expect(() => parseTierRules(null)).toThrow();
    expect(() => parseTierRules({ ...RAW_TIER_RULES, weights: { normal: 1 } })).toThrow();
    expect(() => parseTierRules({ ...RAW_TIER_RULES, fallback: "무엇" })).toThrow();
  });
});
