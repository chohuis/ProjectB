import { describe, it, expect } from "vitest";
import { migrateProtagonist, DEFAULT_PROTAGONIST } from "../game";
import type { ProtagonistSave } from "../../types/save";

/**
 * 🔴 **옛 세이브에 없는 필드를 마이그레이션이 되살리는가** — 전수로 본다.
 *
 * 필드를 새로 넣을 때마다 옛 세이브에는 그게 없다. `migrateProtagonist` 가
 * `?? 기본값` 으로 채워야 하는데, **안 채워도 아무 일이 안 일어난다** —
 * `undefined` 가 그대로 흘러 화면이 빈칸을 그리거나 계산이 NaN 이 된다.
 * 오류도 로그도 안 남는다.
 *
 * 그래서 **키를 하나씩 지워 보고** 결과를 셋으로 가른다:
 *
 * ```
 *   복원됨    마이그레이션이 기본값을 넣었다              ✅
 *   빠짐      undefined 로 남았다                        🔴 옛 세이브가 깨진다
 *   죽음      마이그레이션이 예외를 냈다                   ⚠ 필수 필드다
 * ```
 *
 * ⚠ **"죽음"은 결함이 아닐 수 있다.** `pitching` 처럼 없으면 게임이 성립
 * 안 하는 필드는 옛 세이브에도 반드시 있다. 다만 **어느 게 필수인지**가
 * 코드 어디에도 안 적혀 있어서, 이 검사가 그 목록이 된다.
 *
 * ⚠ 이 검사는 **지금 상태를 못박지 않는다.** 빠진 필드가 늘어나면 실패한다 —
 * 새 필드를 넣고 마이그레이션을 안 고치면 여기서 잡힌다.
 */

/**
 * 지금 마이그레이션이 **안 채우는** 필드 41개 (2026-09-01 실측).
 *
 * 🔴 **이게 전부 결함은 아니다.** `id`·`name`·`age`·`careerStage` 처럼
 * **새 게임 때부터 있던 필드**는 옛 세이브에도 반드시 있다 — 채울 일이 없다.
 * 시점 정보 없이는 "언제 생긴 필드인가"를 검사가 알 수 없다.
 *
 * ⚠ **그래서 이 검사의 값은 목록 자체가 아니라 "늘어나는 걸 잡는 것"이다.**
 * 새 필드를 넣고 `migrateProtagonist` 에 `?? 기본값` 을 안 붙이면 여기가
 * 42개가 되어 실패한다. 그때 **채워야 하는 필드인지 판단**하면 된다:
 *
 * ```
 *   옛 세이브에 없을 수 있다   →  migrateProtagonist 에 `?? 기본값` 을 넣어라
 *   새 게임 때부터 있었다      →  이 목록에 더해라 (한 줄 이유를 적어서)
 * ```
 *
 * ⚠ 목록에서 **빼는** 방향으로 깨지면 마이그레이션이 나아진 것이다 — 지워라.
 */
const KNOWN_MISSING: string[] = [
  // 새 게임 때부터 있던 기본 신원·상태 — 옛 세이브에도 있다
  "id", "name", "age", "grade", "handedness", "playerType", "position",
  "careerStage", "leagueId", "teamId", "schoolId", "jerseyNumber",
  "condition", "fatigue", "morale", "money", "fame", "scoutScore",
  "growthPoints", "potentialHidden", "developmentRate", "pitchingXP",
  "tags", "careerTriggeredEvents",
  // 병역 — 한 덩어리로 들어왔다. 미필이면 기본값이 의미가 없다
  "militaryStatus", "militaryUnit", "militaryServiceWeeks", "militaryRecoveryWeeks",
  "militaryDeferPenalty", "militaryEnlistWeek", "militaryEnlistYear",
  "militaryDischargeYear", "militaryHiatusStage", "militaryHiatusUniversityWeek",
  "sportsUnitApplied", "sportsUnitSelected",
  // 프로 계약·FA — 그 단계에 안 가면 값이 없는 게 맞다
  "proServiceYears", "faNegotiationRound", "faUnsignedWeeks",
  "pendingNextContract", "tradeAdaptationWeeks",
];

/** 없으면 마이그레이션이 죽는 필드 — 옛 세이브에도 반드시 있는 것들 */
const REQUIRED: string[] = ["pitching", "batting"];

type Bucket = "복원됨" | "빠짐" | "죽음";

function probe(key: string): Bucket {
  const base = structuredClone(DEFAULT_PROTAGONIST) as unknown as Record<string, unknown>;
  delete base[key];
  let out: ProtagonistSave;
  try {
    out = migrateProtagonist(base as unknown as ProtagonistSave);
  } catch {
    return "죽음";
  }
  return (out as unknown as Record<string, unknown>)[key] === undefined ? "빠짐" : "복원됨";
}

const KEYS = Object.keys(DEFAULT_PROTAGONIST);

describe("주인공 마이그레이션 — 옛 세이브의 빈 칸을 채우는가", () => {
  it("대조군이 비어 있지 않다", () => {
    // 0개면 아래 검사가 전부 공회전한다
    expect(KEYS.length).toBeGreaterThan(20);
  });

  it("필수라고 적어 둔 필드는 실제로 필수다", () => {
    // 여기가 깨지면 **마이그레이션이 나아진 것**이다 — 목록에서 빼라
    const notRequired = REQUIRED.filter((k) => probe(k) !== "죽음");
    expect(notRequired, "이 필드는 이제 없어도 마이그레이션이 돈다").toEqual([]);
  });

  it("빠지는 필드가 알려진 것뿐이다", () => {
    const missing = KEYS.filter((k) => !REQUIRED.includes(k) && probe(k) === "빠짐");
    expect(
      missing.sort(),
      "옛 세이브에서 undefined 로 남는다 — migrateProtagonist 에 `?? 기본값`을 넣어라",
    ).toEqual([...KNOWN_MISSING].sort());
  });

  /**
   * ⚠ 필드 하나가 아니라 **덩어리로 빠지는 경우**도 본다. 세이브가 아주
   * 오래되면 `pitching` 안의 새 항목들이 통째로 없다.
   */
  it("pitching 안의 새 항목을 채운다", () => {
    const base = structuredClone(DEFAULT_PROTAGONIST) as unknown as Record<string, unknown>;
    const pit = base.pitching as Record<string, unknown>;
    delete pit.clutch;
    delete pit.holdRunners;
    const out = migrateProtagonist(base as unknown as ProtagonistSave);
    expect(out.pitching.clutch).toBeTypeOf("number");
    expect(out.pitching.holdRunners).toBeTypeOf("number");
  });

  it("batting 안의 새 항목을 채운다", () => {
    const base = structuredClone(DEFAULT_PROTAGONIST) as unknown as Record<string, unknown>;
    const bat = base.batting as Record<string, unknown>;
    delete bat.baseInstinct;
    delete bat.bunting;
    delete bat.platoon;
    const out = migrateProtagonist(base as unknown as ProtagonistSave);
    expect(out.batting.baseInstinct).toBeTypeOf("number");
    expect(out.batting.bunting).toBeTypeOf("number");
    expect(out.batting.platoon).toBeTypeOf("number");
  });

  /** OVR 은 저장값을 믿지 않고 **다시 센다** — 가중치가 바뀌면 옛 값이 틀리다 */
  it("OVR 을 저장값이 아니라 능력치에서 다시 센다", () => {
    const base = structuredClone(DEFAULT_PROTAGONIST);
    base.pitching.ovr = 1;      // 말도 안 되는 값을 넣는다
    base.batting.ovr = 1;
    const out = migrateProtagonist(base);
    expect(out.pitching.ovr, "저장된 ovr 을 그대로 썼다").toBeGreaterThan(1);
    expect(out.batting.ovr, "저장된 ovr 을 그대로 썼다").toBeGreaterThan(1);
  });
});
