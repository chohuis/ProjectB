import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateCondition } from "../conditionEvaluator";
import type { EventContext, Condition } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

/**
 * 🔴 **"성적이 나쁘다"를 물을 축이 없었다** (2026-09-01 · 사용자 확정).
 *
 * 시즌 성적 조건이 전부 **잘한 쪽**만 물었다:
 *
 * ```
 *   season_wins_gte · season_era_lte · season_ip_gte · season_k_gte
 * ```
 *
 * 그래서 부진·기회부족·강등을 **`morale_lte` 가 대역**하고 있었다 —
 * 그 조건을 쓰는 이벤트가 **42종**이다(트랙 B 실측):
 *
 * ```
 *   「등판 기회가 좀처럼 오지 않습니다」   morale_lte 50
 *   「대회에서 탈락했습니다」              morale_lte 55
 *      ↑ 진출은 `team_rank_lte 2` 로 판정한다. **같은 대회를 두 축으로 본다**
 * ```
 *
 * ⚠ 사기 축 하나가 42종의 목숨을 쥐고 있어서, 사기를 고치면 42종이 같이
 * 움직이고 문턱을 올리면 42종의 문안이 같이 어긋난다.
 *
 * ## 이 검사가 못박는 것
 *
 * **"기록이 없으면 거짓"** — 이게 새 축의 핵심이다. `0 <= N` 은 수학적으로
 * 참이지만 **안 던진 것과 부진한 것은 다르다.** 데뷔 전·부상 결장이
 * 전부 "부진"으로 걸리면 그 이벤트는 아무 뜻이 없어진다.
 */

const proto = (): ProtagonistSave => ({
  id: "PLY_HERO", name: "검사", careerStage: "pro_kbl",
  leagueId: "LEAGUE_KBL", teamId: "TEAM_KBL_A_1",
  playerType: "pitcher", position: "SP",
} as unknown as ProtagonistSave);

/** 투수 시즌 기록 — 안 준 칸은 0 */
const pitcher = (over: Record<string, number>) => ({
  type: "pitcher" as const,
  g: 0, gs: 0, w: 0, l: 0, sv: 0, hd: 0, ip: 0, er: 0, h: 0, k: 0, bb: 0,
  era: 0, whip: 0, ...over,
});

const ctxOf = (stat: unknown): EventContext => ({
  protagonist: proto(), currentWeek: 30, seasonPhase: "season",
  standings: [], stats: stat ? { PLY_HERO: stat } : {}, triggeredEvents: {},
} as unknown as EventContext);

const c = (type: string, value: number) => ({ type, value } as unknown as Condition);

describe("반대쪽 조건이 실제로 판정한다", () => {
  it("승수가 적으면 season_wins_lte 가 참이다", () => {
    expect(evaluateCondition(c("season_wins_lte", 3), ctxOf(pitcher({ g: 20, w: 2 })))).toBe(true);
    expect(evaluateCondition(c("season_wins_lte", 3), ctxOf(pitcher({ g: 20, w: 9 })))).toBe(false);
  });

  it("얻어맞으면 season_era_gte 가 참이다", () => {
    expect(evaluateCondition(c("season_era_gte", 5), ctxOf(pitcher({ ip: 50, era: 6.2 })))).toBe(true);
    expect(evaluateCondition(c("season_era_gte", 5), ctxOf(pitcher({ ip: 50, era: 3.1 })))).toBe(false);
  });

  it("이닝이 적으면 season_ip_lte 가 참이다", () => {
    expect(evaluateCondition(c("season_ip_lte", 30), ctxOf(pitcher({ g: 8, ip: 21 })))).toBe(true);
    expect(evaluateCondition(c("season_ip_lte", 30), ctxOf(pitcher({ g: 25, ip: 140 })))).toBe(false);
  });

  it("삼진이 적으면 season_k_lte 가 참이다", () => {
    expect(evaluateCondition(c("season_k_lte", 40), ctxOf(pitcher({ ip: 60, k: 22 })))).toBe(true);
    expect(evaluateCondition(c("season_k_lte", 40), ctxOf(pitcher({ ip: 60, k: 71 })))).toBe(false);
  });
});

/**
 * 🔴 **여기가 이 축의 함정이다.** `0 <= N` 은 참이라 그냥 짜면
 * **데뷔 전·부상 결장이 전부 "부진"으로 걸린다.**
 */
describe("기록이 없으면 거짓이다 — 안 던진 것과 부진한 것은 다르다", () => {
  it("기록 자체가 없으면 넷 다 거짓", () => {
    for (const t of ["season_wins_lte", "season_era_gte", "season_ip_lte", "season_k_lte"]) {
      expect(evaluateCondition(c(t, 999), ctxOf(null)), `${t} 가 기록 없이 참이다`).toBe(false);
    }
  });

  it("한 경기도 안 나갔으면 승수·이닝 조건이 거짓", () => {
    const none = pitcher({ g: 0, ip: 0 });
    expect(evaluateCondition(c("season_wins_lte", 5), ctxOf(none))).toBe(false);
    expect(evaluateCondition(c("season_ip_lte", 50), ctxOf(none))).toBe(false);
  });

  it("한 이닝도 안 던졌으면 ERA·삼진 조건이 거짓", () => {
    // ⚠ ERA 0 은 **완벽한 게 아니라 안 던진 것**이다
    const none = pitcher({ g: 1, ip: 0, era: 0, k: 0 });
    expect(evaluateCondition(c("season_era_gte", 0), ctxOf(none))).toBe(false);
    expect(evaluateCondition(c("season_k_lte", 10), ctxOf(none))).toBe(false);
  });

  /**
   * ⚠ **`ip` 과 `g` 를 가른다.** "이닝이 적다"는 등판은 했는데 짧다는
   * 뜻이라 `g` 를 보고, "얻어맞았다"는 던져야 성립하니 `ip` 을 본다.
   */
  it("등판은 했는데 아웃을 못 잡았으면 ip_lte 는 참이다", () => {
    expect(evaluateCondition(c("season_ip_lte", 5), ctxOf(pitcher({ g: 3, ip: 0.3 })))).toBe(true);
  });
});

describe("타자 주인공에게는 안 걸린다", () => {
  it("타자 기록이면 넷 다 거짓", () => {
    const batter = { type: "batter" as const, g: 140, pa: 600, ab: 540, h: 150 };
    for (const t of ["season_wins_lte", "season_era_gte", "season_ip_lte", "season_k_lte"]) {
      expect(evaluateCondition(c(t, 999), ctxOf(batter)), `${t} 가 타자에게 걸린다`).toBe(false);
    }
  });
});

/**
 * 🔴 **층이 셋이다.** 타입만 넣으면 데이터에 써도 로더가 조용히 버린다 —
 * 이 저장소가 반복해서 겪은 "층은 맞는데 잇는 선이 없다"의 그 형태다.
 */
describe("세 층이 다 이어져 있다", () => {
  const NEW = ["season_wins_lte", "season_era_gte", "season_ip_lte", "season_k_lte"];

  it("타입 선언에 있다", () => {
    const src = readFileSync(resolve(__dirname, "../../types/event.ts"), "utf8");
    for (const t of NEW) expect(src, `${t} 가 타입에 없다`).toContain(`"${t}"`);
  });

  it("로더 allowlist 에 있다 — 없으면 데이터를 조용히 버린다", () => {
    const src = readFileSync(resolve(__dirname, "../../stores/master.ts"), "utf8");
    for (const t of NEW) expect(src, `${t} 가 allowlist 에 없다`).toContain(`${t}:`);
  });

  it("눈금 검사가 축을 안다 — 없으면 항상 참인 값을 못 잡는다", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../../../../scripts/check-eventranges.cjs"), "utf8");
    for (const t of NEW) expect(src, `${t} 가 눈금 표에 없다`).toContain(`${t}:`);
  });
});
