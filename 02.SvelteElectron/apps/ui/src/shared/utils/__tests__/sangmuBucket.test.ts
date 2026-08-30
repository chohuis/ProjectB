import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **검사가 상무를 잘못 세고 있었다** (2026-08-31).
 *
 * 🔴 `rosterCompositionProbe` 가 `active`·`injured` 만 셌다. 상무 선수는
 * 전원 `careerStatus: "military"` 다 — 그건 **의도**다
 * (`military_roster.rs`: "**military**이어야 한다. active면 드래프트·FA
 * 후보 풀에 섞인다"). 그래서 실제 26~54명인 팀을 **11명으로 봤고**,
 * 검사는 있지도 않은 타순 미달을 잡고 있었다.
 *
 * ⚠ `CLAUDE.md` 가 같은 함정을 이미 적어 뒀다 — "상무 선수는
 *   `career_status: "military"` 인데 오프시즌 로스터 캡은 `active` 만 센다."
 *   **검사에도 있었다.**
 *
 * ⚠ `military` 를 들여도 새로 들어오는 건 **상무뿐**이다. 일반병은
 *   `currentLeague: "LEAGUE_MILITARY"` · `currentTeam: ""` 라 팀 없음
 *   갈래에서 이미 빠진다(실측).
 *
 * 고친 뒤 (씨앗 20260803 · 4시즌):
 * ```
 *   [시점] SANGMU  시즌중 야수8/투수12  ← 예전엔 이 줄이 아예 없었다
 *   FAIL  SANGMU: 타순 미달(야수<9) 0팀   1팀
 *   FAIL  SANGMU: 야수 9 미달 0팀 이하    1/1팀
 *   INDEPENDENT 실패 0건                  ← 상무가 9팀 최소값을 대신 말하던 게 걷혔다
 * ```
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("상무 — 검사가 실제 인원을 센다", () => {
  const PE = read("scripts/perf/perfEntry.ts");
  const TB = read("scripts/test-roster-balance.cjs");

  /** 🔴 이게 빠지면 상무가 다시 11명으로 보인다 */
  it("구성 프로브가 military 도 센다", () => {
    expect(PE).toContain('&& n.careerStatus !== "military") continue;');
  });

  /**
   * ⚠ 정원이 26(militaryRules)이고 독립은 30이다. 섞으면 **상무 하나가
   *   독립 9팀의 최소값을 대신 말한다** — 실제로 그래서 독립리그가
   *   두 실행 내내 실패로 잡혔고, 9팀은 멀쩡했다.
   */
  it("상무가 독립리그와 분리된 버킷이다", () => {
    expect(PE).toContain('["SANGMU",      (t) => t.id === "TEAM_IND_SANGMU_PHOENIX"]');
    // 독립 버킷은 상무를 빼야 한다 — 안 빼면 양쪽에 두 번 들어간다
    expect(PE).toContain('&& t.id !== "TEAM_IND_SANGMU_PHOENIX"]');
  });

  it("검사에 상무 전용 하한이 있다", () => {
    expect(TB).toContain("SANGMU: { bat: 9, pit: 8 }");
  });

  /**
   * 🔴 **한 팀짜리 버킷은 여유를 주면 절대 안 걸린다.**
   *
   * `lim = max(1, 팀수 × 0.05)` 은 팀이 하나면 항상 1이라, 그 한 팀이
   * 무너져도 "1팀 이하"를 만족해 통과한다. 상무를 갈라내고 나서야
   * 그 검사가 죽은 갈래였다는 게 드러났다.
   */
  it("한 팀짜리 버킷은 하한 여유가 없다", () => {
    expect(TB).toContain("const lim = w.팀수 <= 1 ? 0 :");
  });
});
