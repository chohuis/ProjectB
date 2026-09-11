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
const proto = (over: Partial<ProtagonistSave> = {}): ProtagonistSave =>
  ({
    id: "PLY_HERO",
    name: "검사",
    careerStage: "highschool",
    leagueId: "LEAGUE_HIGHSCHOOL",
    teamId: "TEAM_A",
    grade: 1,
    age: 17,
    playerType: "pitcher",
    position: "SP",
    handedness: "R",
    pitchingForm: "overhand",
    jerseyNumber: 18,
    condition: 80,
    fatigue: 10,
    morale: 70,
    pitching: {
      ovr: 50,
      stamina: 50,
      velocity: 50,
      command: 50,
      control: 50,
      movement: 50,
      mentality: 50,
      recovery: 50,
      clutch: 50,
      holdRunners: 50,
    },
    batting: {
      ovr: 30,
      contact: 42,
      power: 25,
      eye: 28,
      discipline: 28,
      speed: 48,
      baseInstinct: 48,
      bunting: 45,
      platoon: 50,
      fielding: 40,
      arm: 50,
      battingClutch: 25,
    },
    primaryPosition: "SP",
    positionRatings: { SP: 50 },
    diligence: 60,
    popularity: 10,
    developmentRate: 1,
    potentialHidden: 70,
    growthPoints: 0,
    tags: [],
    pitchingXP: {},
    battingXP: {},
    pitches: [],
    money: 1000,
    fame: 0,
    scoutScore: 0,
    proServiceYears: 0,
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
        {
          teamId: "TEAM_A",
          wins: 12,
          losses: 3,
          draws: 0,
          winPct: 0.8,
          runsFor: 60,
          runsAgainst: 30,
        },
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

/**
 * **지금 리그에서 몇 년째인가** — 해외 진출 서사의 축.
 *
 * 총 프로 연차로는 "낯선 리그 첫해"를 못 쓴다. 5년차에 ABL로 가도 여전히
 * 5년차라, ABL 이벤트가 KBL 이벤트의 복사본이 된다.
 *
 * ⚠ 새 상태를 안 만들고 `careerRecords`에서 유도한다 — 주인공 리그 이동은
 * `careerEvents`에 안 남기 때문이다(NPC만 남는다).
 */
describe("leagueYears", () => {
  const withRecs = (leagueId: string, recs: { year: number; leagueId: string }[]) =>
    ctx({
      protagonist: proto({ leagueId, careerRecords: recs } as unknown as Partial<ProtagonistSave>),
    });

  it("기록이 없으면 1년차 — 진입 첫 시즌", () => {
    expect(ev({ type: "num_lte", path: "leagueYears", value: 1 }, withRecs("LEAGUE_ABL", []))).toBe(
      true,
    );
  });

  it("같은 리그가 이어지면 센다", () => {
    const c = withRecs("LEAGUE_ABL", [
      { year: 2030, leagueId: "LEAGUE_ABL" },
      { year: 2031, leagueId: "LEAGUE_ABL" },
    ]);
    expect(ev({ type: "num_gte", path: "leagueYears", value: 3 }, c)).toBe(true);
    expect(ev({ type: "num_gte", path: "leagueYears", value: 4 }, c)).toBe(false);
  });

  it("🔴 리그를 옮기면 다시 1년차 — 총 연차와 다르다", () => {
    const c = withRecs("LEAGUE_ABL", [
      { year: 2028, leagueId: "LEAGUE_KBL" },
      { year: 2029, leagueId: "LEAGUE_KBL" },
      { year: 2030, leagueId: "LEAGUE_KBL" },
    ]);
    expect(ev({ type: "num_lte", path: "leagueYears", value: 1 }, c)).toBe(true);
  });

  it("떠났다 돌아오면 연속 구간만 센다", () => {
    const c = withRecs("LEAGUE_KBL", [
      { year: 2028, leagueId: "LEAGUE_KBL" },
      { year: 2029, leagueId: "LEAGUE_ABL" },
      { year: 2030, leagueId: "LEAGUE_KBL" },
    ]);
    expect(ev({ type: "num_lte", path: "leagueYears", value: 2 }, c)).toBe(true);
    expect(ev({ type: "num_gte", path: "leagueYears", value: 3 }, c)).toBe(false);
  });
});

// ── 병영 재회 (B-20 축소판 · 2026-09-03) ──────────────────────────
//
// 🔴 **복무 중에는 이벤트 엔진이 안 돈다. 전역 뒤에는 돈다.**
//   군 조건이 통째로 막혀 있던 건 앞의 사실 때문인데, 재회는 뒤의 자리다.
//   여기서 여는 것은 셋뿐이다 — 부대원 관계값 · 군 보직 · 전역 뒤 경과.
//   이름 렌더러(`{memberName}`)와 인물 지정은 **안 만들었다**(B-20 초안의 남은 몫).
const REC = {
  unitId: "U1",
  unitName: "12사단",
  roleId: "signal",
  roleLabel: "통신병",
  arcLabel: "",
  finalBallSense: 60,
  leaveDays: 12,
  awards: [],
  penalties: [],
  perf: [],
  topRelations: [
    { memberId: "M1", name: "김사수", value: 62 },
    { memberId: "M2", name: "이후임", value: 40 },
  ],
  senseCurve: [],
  conversion: { statDelta: 0, velocityDelta: 0, recoveryWeeks: 6 },
} as unknown as NonNullable<ProtagonistSave["militaryRecord"]>;

/** 전역한 주인공 — 2030 W20 에 전역, 지금은 `year`/`week` */
const 전역자 = (over: Partial<ProtagonistSave> = {}, year = 2030, week = 30) =>
  ctx({
    protagonist: proto({
      militaryStatus: "군필",
      militaryServedUnit: "general",
      militaryRecord: REC,
      dischargedSeason: 2030,
      dischargedWeek: 20,
      ...over,
    }),
    seasonYear: year,
    currentWeek: week,
  });

describe("병영 재회 조건", () => {
  it("제일 가까웠던 부대원의 관계값을 읽는다", () => {
    const c = 전역자();
    expect(ev({ type: "num_gte", path: "militaryRecord.topRelations.0.value", value: 60 }, c)).toBe(
      true,
    );
    expect(ev({ type: "num_gte", path: "militaryRecord.topRelations.0.value", value: 70 }, c)).toBe(
      false,
    );
  });

  it("군 경력이 없으면(상무·미필·구 세이브) 조용히 false 다 — 던지지 않는다", () => {
    const c = ctx({ protagonist: proto({ militaryStatus: "군필" }) });
    expect(ev({ type: "num_gte", path: "militaryRecord.topRelations.0.value", value: 1 }, c)).toBe(
      false,
    );
    expect(resolvePath(c, "militaryRecord.roleId")).toBeUndefined();
  });

  it("군 보직으로 갈린다", () => {
    const c = 전역자();
    expect(ev({ type: "eq", path: "militaryRecord.roleId", value: "signal" }, c)).toBe(true);
    expect(ev({ type: "eq", path: "militaryRecord.roleId", value: "mortar" }, c)).toBe(false);
  });

  it("전역 뒤 경과를 시즌을 넘어 센다", () => {
    expect(resolvePath(전역자({}, 2030, 30), "weeksSinceDischarge")).toBe(10);
    // 이듬해 W10 → 52 − 20 + 10 = 42
    expect(resolvePath(전역자({}, 2031, 10), "weeksSinceDischarge")).toBe(42);
    expect(
      ev({ type: "num_gte", path: "weeksSinceDischarge", value: 40 }, 전역자({}, 2031, 10)),
    ).toBe(true);
  });

  it("🔴 전역 기록이 없으면 못 잰 것이다 — 0 이 아니다", () => {
    // 0 을 지어 내면 **군대를 안 다녀온 주인공이 「이번 주 전역」** 이 된다
    const 구세이브 = ctx({
      protagonist: proto({ dischargedSeason: undefined, dischargedWeek: undefined }),
      seasonYear: 2030,
    });
    expect(resolvePath(구세이브, "weeksSinceDischarge")).toBeUndefined();
    expect(ev({ type: "num_gte", path: "weeksSinceDischarge", value: 0 }, 구세이브)).toBe(false);
    // 🔴 대조군 — `seasonYear` 배선을 빼면 못 잰다(연 차이를 못 구한다)
    const 연도없음 = ctx({
      protagonist: proto({ dischargedSeason: 2030, dischargedWeek: 20, militaryRecord: REC }),
      currentWeek: 30,
    });
    expect(resolvePath(연도없음, "weeksSinceDischarge")).toBeUndefined();
  });

  it("표에 없는 군 경로는 그대로 던진다 — 문지기는 표다", () => {
    expect(() => resolvePath(전역자(), "militaryRecord.leaveDays")).toThrow(/모르는 경로/);
    expect(NUM_PATHS.has("militaryRecord.topRelations.0.value")).toBe(true);
    expect(EQ_PATHS.has("militaryRecord.roleId")).toBe(true);
  });
});

describe("관계 조건 — 부대원(unitmate)", () => {
  it("부대원은 관계 테이블이 아니라 군 경력에서 읽는다", () => {
    const c = 전역자();
    expect(ev({ type: "relation_gte", kind: "unitmate", value: 60 }, c)).toBe(true);
    expect(ev({ type: "relation_gte", kind: "unitmate", value: 70 }, c)).toBe(false);
    // lte 는 제일 낮은 쪽을 본다 — "서먹해진 후임" 같은 갈래
    expect(ev({ type: "relation_lte", kind: "unitmate", value: 40 }, c)).toBe(true);
    expect(ev({ type: "relation_lte", kind: "unitmate", value: 39 }, c)).toBe(false);
  });

  it("🔴 `ctx.relations` 에 넣어도 안 읽는다 — 출처가 하나여야 한다", () => {
    // 부대원은 slot.db 관계 테이블에 안 들어간다. 거기서 찾으면 영영 0건이다
    const c = ctx({
      protagonist: proto({ militaryStatus: "군필" }),
      relations: [{ kind: "unitmate", value: 90 }] as unknown as EventContext["relations"],
    });
    expect(ev({ type: "relation_gte", kind: "unitmate", value: 10 }, c)).toBe(false);
  });

  it("다섯 종은 예전 그대로다", () => {
    const c = ctx({
      relations: [{ kind: "teammate", value: 55 }] as unknown as EventContext["relations"],
    });
    expect(ev({ type: "relation_gte", kind: "teammate", value: 50 }, c)).toBe(true);
    expect(ev({ type: "relation_gte", kind: "manager", value: 1 }, c)).toBe(false);
  });
});
