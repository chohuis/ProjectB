import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neededPositions } from "../rosterEngine";

/**
 * 투수 비율의 정본이 **규칙 파일에 있는지** 지킨다.
 *
 * 예전엔 `generation_rules.json`에 `pitcherRatio`가 아예 없었고 0.45가 코드
 * 여섯 군데(Rust 2 · slotLifecycleV3 3 · test-roster-balance 1)에 각각 적혀
 * 있었다. 그 상태에서 비율을 바꾸려면 여섯을 다 찾아야 하고, 한 곳을 놓치면
 * **그 경로만 옛 비율로 조용히 돈다** — 실제로 `generate_freshmen`의 폴백이
 * 0.3인 채 남아 세대가 교체될수록 리그가 투수 30%로 수렴했고, 파이프라인
 * 최상류인 고교부터 투수가 말랐다(고교 23/102팀 하한 미달).
 *
 * ⚠ **값이 맞는지가 아니라 "규칙 파일에 있는지"를 본다.** 0.45라는 숫자를
 * 여기 또 적으면 이 검사가 일곱 번째 정본이 된다.
 */
function rules() {
  const p = resolve(__dirname, "../../../../../../resource/data/master/players/generation_rules.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

/** `_note`·`_noteNamePool` 같은 주석 키는 리그가 아니다 */
const leagueKeys = (rr: Record<string, unknown>) =>
  Object.keys(rr).filter((k) => !k.startsWith("_"));

describe("pitcherRatio 정본", () => {
  it("모든 리그가 규칙 파일에 pitcherRatio를 갖는다", () => {
    const rr = rules().rosterRules as Record<string, { pitcherRatio?: unknown }>;
    const keys = leagueKeys(rr);
    // 리그가 하나도 안 잡히면 경로가 틀린 것이다 — 빈 배열로 통과하면 안 된다
    expect(keys.length).toBeGreaterThanOrEqual(9);
    const missing = keys.filter((k) => typeof rr[k].pitcherRatio !== "number");
    expect(missing).toEqual([]);
  });

  it("비율이 0과 1 사이다", () => {
    const rr = rules().rosterRules as Record<string, { pitcherRatio?: number }>;
    for (const k of leagueKeys(rr)) {
      const v = rr[k].pitcherRatio as number;
      expect(v, k).toBeGreaterThan(0);
      expect(v, k).toBeLessThan(1);
    }
  });

  /**
   * 규칙 파일 값이 **자리 배정까지 실제로 도달하는지** 본다.
   *
   * `slotLifecycleV3`가 생성 페이로드에는 비율을 넘기면서 `neededPositions`엔
   * 안 넘기고 있었다 — 층마다 값은 맞는데 잇는 선이 없어서, 규칙 파일을 바꿔도
   * 자리는 기본 인자(0.45)로 잡혔다. 서로 다른 비율을 주면 결과도 달라야 한다.
   */
  it("비율을 바꾸면 남는 칸의 투수 수가 따라 바뀐다", () => {
    // 공백·하한이 이미 채워진 로스터 — 그래야 남는 칸이 비율로만 갈린다
    const roster = [
      ...Array.from({ length: 8 }, () => ({ playerType: "pitcher", position: "SP" })),
      ...["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "C"].map((position) => ({
        playerType: "batter", position,
      })),
    ];
    const isPit = (p: string) => p === "SP" || p === "RP";
    const lowPit = neededPositions(roster, 20, 8, 9, 0.1).filter(isPit).length;
    const highPit = neededPositions(roster, 20, 8, 9, 0.9).filter(isPit).length;
    expect(highPit).toBeGreaterThan(lowPit);
  });
});
