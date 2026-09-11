import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectStreakKeys,
  streakKeyOf,
  tickStreaks,
  lastGameOf,
  COUNTERS,
} from "../eventCounters";
import { evaluateCondition } from "../conditionEvaluator";
import type { EventContext, EventRule, Condition } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";
import type { ScheduleEntry } from "../../types/season";

/**
 * **시간을 세는 조건 넷** (PLAN_EVENT_TIERS §12 · 2026-09-08).
 *
 * 🔴 지금 조건 50종은 전부 「그 순간의 상태」다. 한 주만 성실 90 을 찍은
 *   사람과 20주 유지한 사람이 **구분이 안 됐다** — 히든이 말하려는 것은
 *   「그렇게 해 왔다」인데 그걸 물을 축이 하나도 없었다.
 *
 * 넷 다 **세는 칸**이 있어야 뜻이 산다. 칸이 없으면 조건은 false 고, 그건
 * 「아직 안 채웠다」와 같은 뜻이라 맞다 — 다만 **끝내 못 채우는 칸**은
 * 결함이라 아래 배선 검사가 「올려 주는 자리가 있는가」를 본다.
 */
const proto = (over: Partial<ProtagonistSave> = {}): ProtagonistSave =>
  ({
    id: "PLY_HERO",
    careerStage: "highschool",
    leagueId: "LEAGUE_HIGHSCHOOL",
    teamId: "TEAM_A",
    condition: 80,
    fatigue: 10,
    morale: 70,
    diligence: 60,
    money: 0,
    fame: 0,
    popularity: 0,
    tags: [],
    pitches: [],
    pitching: {
      ovr: 60,
      stamina: 60,
      velocity: 60,
      command: 60,
      control: 60,
      movement: 60,
      mentality: 60,
      recovery: 60,
      clutch: 60,
      holdRunners: 60,
    },
    batting: { ovr: 30 },
    ...over,
  }) as unknown as ProtagonistSave;

const ctx = (over: Partial<EventContext> = {}): EventContext => ({
  protagonist: proto(),
  currentWeek: 10,
  seasonPhase: "season",
  standings: [],
  stats: {},
  triggeredEvents: {},
  ...over,
});

const rule = (conds: Condition[], hidden?: Condition[]): EventRule =>
  ({
    id: "EVT_X",
    title: "t",
    type: "conditional",
    category: "c",
    priority: 1,
    oncePolicy: "repeatable",
    conditions: conds,
    hiddenCondition: hidden,
  }) as EventRule;

// ── streak ──────────────────────────────────────────────────────

describe("streak — N주 연속", () => {
  it("데이터가 쓰는 키만 센다 — 「쓸지도 모르니 다 세자」로 두면 세이브가 커진다", () => {
    const keys = collectStreakKeys([
      rule([{ type: "streak", metric: "diligence", op: "gte", value: 90, weeks: 20 }]),
      rule([], [{ type: "streak", metric: "condition", op: "gte", value: 80, weeks: 4 }]),
      rule([{ type: "morale_gte", value: 50 }]),
    ]);
    expect(keys).toEqual(["condition:gte:80", "diligence:gte:90"]);
  });

  it("만족하면 +1, 안 되면 **0 으로 끊는다** — 「연속」이라 줄이는 게 아니다", () => {
    const key = streakKeyOf({ metric: "diligence", op: "gte", value: 90 });
    const hi = ctx({ protagonist: proto({ diligence: 95 }) });
    expect(tickStreaks({ [key]: 7 }, [key], hi)[key]).toBe(8);
    const lo = ctx({ protagonist: proto({ diligence: 40 }) });
    expect(tickStreaks({ [key]: 7 }, [key], lo)[key]).toBe(0);
  });

  it("경로를 못 읽으면 끊는다 — 없는 것을 「만족」으로 읽으면 배선 빠진 축이 다 통과한다", () => {
    // `pitching.ovr` 은 있는 경로다. 없는 경로는 `resolvePath` 가 던지므로
    // 여기서는 값이 undefined 인 경로(부상 없음)를 쓴다
    const key = "injury.recoveryWeeksLeft:gte:1";
    expect(tickStreaks({ [key]: 5 }, [key], ctx())[key]).toBe(0);
  });

  it("조건은 세는 칸이 문턱을 넘어야 참이다", () => {
    const c: Condition = { type: "streak", metric: "diligence", op: "gte", value: 90, weeks: 20 };
    expect(
      evaluateCondition(c, ctx({ protagonist: proto({ streaks: { "diligence:gte:90": 19 } }) })),
    ).toBe(false);
    expect(
      evaluateCondition(c, ctx({ protagonist: proto({ streaks: { "diligence:gte:90": 20 } }) })),
    ).toBe(true);
    // 칸이 없으면 false — 「아직 안 채웠다」와 같은 뜻이다
    expect(evaluateCondition(c, ctx())).toBe(false);
  });
});

// ── count ───────────────────────────────────────────────────────

describe("count — 누적 카운터", () => {
  it("표에 있는 이름만 쓴다", () => {
    expect(Object.keys(COUNTERS).sort()).toEqual([
      "completeGames",
      "menteeCount",
      "sameCatcherGames",
      "sameTeamYears",
      "shutouts",
    ]);
  });

  it("문턱을 넘어야 참이다", () => {
    const c: Condition = { type: "count", counter: "sameCatcherGames", value: 30 };
    expect(
      evaluateCondition(c, ctx({ protagonist: proto({ counters: { sameCatcherGames: 29 } }) })),
    ).toBe(false);
    expect(
      evaluateCondition(c, ctx({ protagonist: proto({ counters: { sameCatcherGames: 30 } }) })),
    ).toBe(true);
    expect(evaluateCondition(c, ctx())).toBe(false);
  });

  it("🔴 다섯 다 올려 주는 자리가 있다 — 없으면 그 조건은 영원히 false 다", () => {
    const game = readFileSync(resolve("apps/ui/src/shared/stores/game.ts"), "utf8");
    // 같은 팀 해 — 시즌 롤오버가 올리고 팀이 바뀌면 1 로 되돌린다
    expect(game).toContain("sameTeamYears: p.lastSeasonTeamId === p.teamId");
    // 완봉·완투·같은 포수 — 공식 등판마다
    expect(game).toContain("c.completeGames = (c.completeGames ?? 0) + 1");
    expect(game).toContain("c.shutouts      = (c.shutouts ?? 0) + 1");
    expect(game).toContain("c.sameCatcherGames = pr.lastCatcherId === p.catcherId");
    // 지도 후배 — 선택지의 `counterDelta`
    expect(game).toContain("fx.counterDelta");
    const outcome = readFileSync(
      resolve("apps/ui/src/shared/usecases/applyGameOutcome.ts"),
      "utf8",
    );
    expect(outcome).toContain("gameStore.recordGameCounters(");
  });
});

// ── compare ─────────────────────────────────────────────────────

describe("compare — 주인공 대 지정 NPC", () => {
  const c: Condition = { type: "compare", npcId: "PLY_RIVAL", stat: "pitching.ovr", op: "gte" };

  it("상대를 못 찾으면 false 다 — 「이겼다」로 읽으면 없는 라이벌을 이긴 게 된다", () => {
    expect(evaluateCondition(c, ctx())).toBe(false);
  });

  it("내가 크면 참이다", () => {
    expect(evaluateCondition(c, ctx({ storyNpcs: { PLY_RIVAL: { "pitching.ovr": 55 } } }))).toBe(
      true,
    );
    expect(evaluateCondition(c, ctx({ storyNpcs: { PLY_RIVAL: { "pitching.ovr": 70 } } }))).toBe(
      false,
    );
  });

  it("`margin` 은 「얼마나 앞서야 하는가」다", () => {
    const m: Condition = { ...c, margin: 10 } as Condition;
    // 나 60 · 상대 55 → 10 앞서지는 못했다
    expect(evaluateCondition(m, ctx({ storyNpcs: { PLY_RIVAL: { "pitching.ovr": 55 } } }))).toBe(
      false,
    );
    expect(evaluateCondition(m, ctx({ storyNpcs: { PLY_RIVAL: { "pitching.ovr": 45 } } }))).toBe(
      true,
    );
  });

  it("`role` 만 적으면 false 다 — `storyNpcs` 등록부가 아직 없다(§12)", () => {
    expect(
      evaluateCondition(
        { type: "compare", role: "rival", stat: "pitching.ovr", op: "gte" },
        ctx({ storyNpcs: { PLY_RIVAL: { "pitching.ovr": 1 } } }),
      ),
    ).toBe(false);
  });
});

// ── last_game ───────────────────────────────────────────────────

const sched = (o: {
  week: number;
  ip: number;
  k?: number;
  oppScore?: number;
  friendly?: boolean;
}): ScheduleEntry =>
  ({
    id: `SCH_W${o.week}`,
    week: o.week,
    gameDate: "2026-04-01",
    homeTeamId: "TEAM_A",
    awayTeamId: "TEAM_B",
    isProtagonistGame: true,
    phase: "season",
    isFriendly: o.friendly ?? false,
    result: {
      homeScore: 3,
      awayScore: o.oppScore ?? 0,
      winnerId: "TEAM_A",
      loserId: "TEAM_B",
      events: [],
      playerLines: [
        {
          role: "pitcher",
          playerId: "PLY_HERO",
          ip: o.ip,
          er: o.oppScore ?? 0,
          h: 2,
          k: o.k ?? 8,
          bb: 1,
          decision: "W",
          pitchCount: 110,
        },
      ],
    },
  }) as unknown as ScheduleEntry;

describe("last_game — 직전 등판", () => {
  it("가장 나중 주의 공식 경기를 고른다", () => {
    const g = lastGameOf(
      [sched({ week: 3, ip: 6 }), sched({ week: 9, ip: 9 }), sched({ week: 5, ip: 7 })],
      "PLY_HERO",
      "TEAM_A",
    );
    expect(g?.week).toBe(9);
    expect(g?.completeGame).toBe(true);
    expect(g?.shutout).toBe(true); // 상대 0점
  });

  it("연습경기는 안 본다 — 연습경기 완봉이 히든을 열면 이야기가 안 산다", () => {
    expect(
      lastGameOf([sched({ week: 9, ip: 9, friendly: true })], "PLY_HERO", "TEAM_A"),
    ).toBeUndefined();
  });

  it("한 경기도 안 던졌으면 그 조건은 전부 false 다", () => {
    expect(
      evaluateCondition({ type: "last_game", field: "shutout", op: "eq", value: true }, ctx()),
    ).toBe(false);
  });

  it("참/거짓 칸은 `eq` 로, 숫자 칸은 대소로 잰다", () => {
    const lastGame = lastGameOf([sched({ week: 9, ip: 9, k: 12 })], "PLY_HERO", "TEAM_A");
    const c1 = ctx({ lastGame });
    expect(
      evaluateCondition({ type: "last_game", field: "shutout", op: "eq", value: true }, c1),
    ).toBe(true);
    expect(evaluateCondition({ type: "last_game", field: "k", op: "gte", value: 10 }, c1)).toBe(
      true,
    );
    expect(evaluateCondition({ type: "last_game", field: "k", op: "gte", value: 13 }, c1)).toBe(
      false,
    );
  });

  it("완투인데 실점이 있으면 완봉이 아니다", () => {
    const g = lastGameOf([sched({ week: 9, ip: 9, oppScore: 2 })], "PLY_HERO", "TEAM_A");
    expect(g?.completeGame).toBe(true);
    expect(g?.shutout).toBe(false);
  });
});

describe("배선 — 넷이 실제로 실린다", () => {
  const src = readFileSync(resolve("apps/ui/src/shared/usecases/advanceWeek.ts"), "utf8");
  it("연속 주 수를 **이벤트보다 먼저** 갱신한다 — 나중이면 한 주씩 밀린다", () => {
    const tick = src.indexOf("tickStreaks(afterP.streaks");
    const run = src.indexOf("const evResult = runEventEngine(");
    expect(tick).toBeGreaterThan(0);
    expect(tick).toBeLessThan(run);
  });
  it("직전 등판과 비교 대상 NPC 를 컨텍스트에 싣는다", () => {
    expect(src).toContain("lastGame: lastGameOf(s.schedule");
    expect(src).toContain("storyNpcs: compareNpcStats");
  });
  it("갱신한 연속 주 수를 세이브에 되돌린다 — 안 되돌리면 매주 0 에서 다시 센다", () => {
    expect(src).toContain("growth.protagonistPatch.streaks = nextStreaks");
  });

  it("🔴 로더도 넷을 안다 — `CONDITION_FIELDS` 가 빠지면 데이터를 써도 조용히 버려진다", () => {
    // 이 저장소가 「층은 맞는데 잇는 선이 없다」로 두 번 걸린 자리다
    // (`master.ts` 의 `CONDITION_FIELDS` 머리말).
    const m = readFileSync(resolve("apps/ui/src/shared/stores/master.ts"), "utf8");
    expect(m).toContain('streak: ["metric", "op", "value", "weeks"]');
    expect(m).toContain('count: ["counter", "value"]');
    expect(m).toContain('compare: ["stat", "op"]');
    expect(m).toContain('last_game: ["field", "op", "value"]');
    // 가리키는 이름이 틀리면 **로드에서** 잡는다 — 몇 시즌 뒤가 아니라
    expect(m).toContain("utils/eventCounters.ts의 COUNTERS에 없다");
    expect(m).toContain("streak 의 모르는 축");
  });
});
