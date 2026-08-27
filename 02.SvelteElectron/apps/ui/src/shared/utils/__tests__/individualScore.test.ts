import { describe, it, expect } from "vitest";
import { calcIndividualScore, calcHsBaseballScore, passesOverseasFarm }
  from "../universityUtils";
import type { CareerSeasonRecord } from "../../types/save";

/**
 * 개인 기여 점수 — **해외 스카우트가 보는 축.**
 *
 * 🔴 `calcHsBaseballScore`는 **팀 성적**이라 우승팀이면 벤치에 앉아 있어도
 *   100점이다. 대학 입시엔 맞는 식이지만(어느 학교 출신인가가 실제로
 *   입시에 영향을 준다) **해외 스카우트는 그 선수 개인을 본다.**
 */

function rec(over: Partial<CareerSeasonRecord> = {}): CareerSeasonRecord {
  return {
    year: 2026, leagueId: "LEAGUE_HIGHSCHOOL", teamId: "T", statLine: "",
    ovr: 70, awards: [], ...over,
  } as CareerSeasonRecord;
}

/** 그 시즌 투수 성적 */
const pit = (ip: number, era: number) => ({
  type: "pitcher" as const, g: 10, gs: 8, w: 5, l: 3, sv: 0, hd: 0,
  ip, er: Math.round(era * ip / 9), h: 50, k: 60, bb: 20, era, whip: 1.2,
});

describe("개인 기여 점수", () => {
  // 🔴 이게 이번에 고친 것이다
  it("우승팀 벤치가 던진 사람을 못 이긴다", () => {
    const bench = calcIndividualScore([rec({ psResult: "champion" })]);
    const ace = calcIndividualScore([
      rec({ psResult: "notQualified", stats: pit(70, 2.20) }),
    ]);
    expect(ace).toBeGreaterThan(bench);
  });

  // ⚠ 옛 식은 반대였다 — 그 차이가 이 검사의 값이다
  it("팀 점수 식은 벤치를 더 높게 본다 — 그래서 안 쓴다", () => {
    const bench = calcHsBaseballScore([rec({ psResult: "champion" })]);
    const ace = calcHsBaseballScore([
      rec({ psResult: "notQualified", stats: pit(70, 2.20) }),
    ]);
    expect(bench).toBeGreaterThan(ace);
  });

  it("많이 던질수록 높다", () => {
    const few = calcIndividualScore([rec({ stats: pit(10, 3.00) })]);
    const many = calcIndividualScore([rec({ stats: pit(70, 3.00) })]);
    expect(many).toBeGreaterThan(few);
  });

  it("잘 던질수록 높다", () => {
    const good = calcIndividualScore([rec({ stats: pit(60, 1.80) })]);
    const bad = calcIndividualScore([rec({ stats: pit(60, 5.50) })]);
    expect(good).toBeGreaterThan(bad);
  });

  it("수상이 개인 축이다 — 팀 성적보다 무겁다", () => {
    const award = calcIndividualScore([
      rec({ awards: [{ year: 2026, awardId: "M", label: "MVP" }] as never }),
    ]);
    const champ = calcIndividualScore([rec({ psResult: "champion" })]);
    expect(award).toBeLessThan(champ + 20);   // 우승 25 vs 수상 20 — 비슷한 급
    expect(award).toBeGreaterThan(0);
  });

  // ⚠ 큰 무대를 밟은 경험은 값이 있다 — 0으로 만들지 않는다
  it("팀 성적을 없애지는 않는다", () => {
    expect(calcIndividualScore([rec({ psResult: "champion" })]))
      .toBeGreaterThan(calcIndividualScore([rec({ psResult: "semiFinal" })]));
  });

  it("성적이 없으면 0에서 시작한다 — 벌하지 않는다", () => {
    expect(calcIndividualScore([rec()])).toBe(0);
    expect(calcIndividualScore([])).toBe(0);
  });

  /**
   * 🔴 **해외 문턱이 개인 점수를 쓰는가** — 배선이 실제로 걸렸는지 본다.
   *
   * ⚠ 눈금 실측(2026-08-27) — **한 시즌** 기준:
   *     에이스(70이닝 ERA2.20 4강)  44
   *     주축(60이닝 ERA3.00 미진출)  30
   *     벤치(우승만)                 25
   *   고교는 3년이라 누적은 그 세 배다(에이스 133 · 벤치 75).
   *   문턱 `SCORE_MIN`은 **한 시즌 에이스가 한 번이면 닿는** 선이다.
   */
  it("직행 판정이 개인 점수로 갈린다", () => {
    // 고교 3년 — 에이스로 뛴 선수
    const ace = calcIndividualScore([
      rec({ year: 2024, stats: pit(60, 2.60) }),
      rec({ year: 2025, stats: pit(70, 2.20), psResult: "semiFinal" }),
      rec({ year: 2026, stats: pit(75, 2.00), psResult: "runnerUp" }),
    ]);
    // 3년 내내 우승팀이었지만 던진 적이 없는 선수
    const bench = calcIndividualScore([
      rec({ year: 2024, psResult: "champion" }),
      rec({ year: 2025, psResult: "champion" }),
      rec({ year: 2026, psResult: "champion" }),
    ]);
    expect(ace, `에이스 ${ace.toFixed(0)}`).toBeGreaterThan(bench);
    expect(passesOverseasFarm(78, ace, 3), "에이스는 간다").toBe(true);
  });

  /**
   * ⚠ **벤치도 3년 누적이면 문턱을 넘는다**(75 > 40). 그게 틀린 건 아니다 —
   *   3년 내내 우승팀에 있었다는 건 그 자체로 이력이다.
   *   **막아야 할 것은 OVR이다** — 개인 점수만으로는 못 간다.
   */
  it("점수가 높아도 OVR이 모자라면 못 간다", () => {
    const bench = calcIndividualScore([
      rec({ year: 2024, psResult: "champion" }),
      rec({ year: 2025, psResult: "champion" }),
      rec({ year: 2026, psResult: "champion" }),
    ]);
    expect(passesOverseasFarm(72, bench, 3), "OVR 72로는 못 간다").toBe(false);
  });
});
