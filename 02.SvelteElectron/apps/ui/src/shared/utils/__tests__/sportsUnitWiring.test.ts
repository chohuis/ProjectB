import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sportsVacatingPositions, sportsVacatingFromNpcs } from "../militaryRules";

/**
 * **체육부대 선발 배선 — 호출부가 둘이다.**
 *
 * 🔴 `militaryCalcSelection`을 부르는 자리가 둘인데 **한쪽만 고쳐져 있었다**:
 *       stores/game.ts        NPC 통합 선발    vacatingPositions 넘김 ✅
 *       usecases/advanceWeek  주인공 선발      안 넘김            ❌
 *   `serde(default)`라 조용히 빈 배열로 통과했고, **주인공만 Phase 1 없이
 *   순수 OVR로** 판정받았다.
 *
 * ⚠ 바로 그 위 주석에 같은 형태의 결함이 적혀 있다 — "예전엔 `maxTotal: 10`이
 *   여기 박혀 있었다. NPC 경로는 13인데 주인공만 10이라…". **같은 함수의
 *   다음 인자에서 같은 일이 또 일어났다.**
 *
 * ⚠ 정규식을 안 쓴다 — 이스케이프가 어긋나면 검사가 조용히 헛돈다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const GAME = read("apps/ui/src/shared/stores/game.ts");
const WEEK = read("apps/ui/src/shared/usecases/advanceWeek.ts");
const RULES = JSON.parse(read("resource/data/master/players/generation_rules.json")) as {
  militaryRules?: {
    rosterSize?: number;
    serviceMonths?: number;
    phase1Ratio?: number;
    maxPerTeam?: number;
  };
};

describe("체육부대 선발 배선", () => {
  /** 🔴 호출부가 늘면 이 수가 바뀐다 — 그때 새 자리도 배선했는지 본다 */
  it("호출부가 둘이다", () => {
    const n =
      GAME.split("militaryCalcSelection").length -
      1 +
      (WEEK.split("militaryCalcSelection").length - 1);
    expect(n).toBe(3); // game.ts 2회(호출 + 오류 로그) · advanceWeek 1회
  });

  it("두 호출부가 모두 전역자 포지션을 넘긴다", () => {
    expect(GAME.includes("vacatingPositions: sportsVacatingPositions(discharging)")).toBe(true);
    expect(WEEK.includes("vacatingPositions: sportsVacatingFromNpcs(g.npcs, s.seasonYear)")).toBe(
      true,
    );
  });

  it("두 호출부가 모두 Phase 1 몫을 넘긴다", () => {
    expect(GAME.includes("phase1Max: milLimits.phase1Max")).toBe(true);
    expect(WEEK.includes("phase1Max: milLimits.phase1Max")).toBe(true);
  });

  /**
   * ⚠ **거르는 규칙을 호출부에 인라인으로 적지 않는다.** 그렇게 뒀더니
   *   두 번째 호출부에 아예 안 갔다.
   *
   * ⚠ **`militaryUnit === "sports"`를 통째로 금지하면 안 된다** — 주인공 본인
   *   부대 판정(`advanceWeek:1968`)과 회복 주(`game.ts:2293`)도 그 꼴이라
   *   **관계없는 자리에서 거짓 실패한다.** 전역자 목록을 거르는 그 형태만 본다.
   */
  it("전역자 거르는 규칙이 한 곳에 있다", () => {
    expect(GAME.includes('e.details?.player?.militaryUnit === "sports"')).toBe(false);
    expect(WEEK.includes('.player?.militaryUnit === "sports"')).toBe(false);
  });

  /** 🔴 값은 규칙 파일이 정본이다 — 코드에 비율을 적지 않는다 */
  it("Phase 1 비율이 규칙 파일에 있다", () => {
    expect(RULES.militaryRules?.phase1Ratio).toBeGreaterThan(0);
    expect(RULES.militaryRules?.phase1Ratio).toBeLessThan(1);
  });
});

describe("전역자 포지션 뽑기", () => {
  /**
   * 🔴 **일반병을 빼야 한다.** `military` 상태엔 체육부대와 일반병이 같이
   *   들어 있다 — 실측 86명 중 상무 정원은 26이다. 안 거르면 일반병 자리까지
   *   상무 공백으로 읽혀 Phase 1이 정원을 다 먹는다.
   */
  it("엔티티 쪽 — 일반병을 뺀다", () => {
    const rows = [
      { details: { player: { militaryUnit: "sports", position: "SP" } } },
      { details: { player: { militaryUnit: "general", position: "RP" } } },
      { details: { player: { militaryUnit: "sports", position: "" } } }, // 포지션 미정
      { details: { player: {} } },
    ];
    expect(sportsVacatingPositions(rows)).toEqual(["SP"]);
  });

  /**
   * 🔴 **`enlistYear + 2`로 다시 계산하지 않는다.** 그렇게 했다가 Rust와
   *   조건이 갈려 같은 사람이 해마다 다시 전역자로 잡혔다(43명 · 정원 26).
   */
  it("NPC 쪽 — 올해 전역하는 상무만", () => {
    const npcs = [
      {
        militaryUnit: "sports",
        militaryStatus: "현역",
        militaryDischargeYear: 2030,
        position: "SP",
      },
      {
        militaryUnit: "sports",
        militaryStatus: "현역",
        militaryDischargeYear: 2031,
        position: "RP",
      }, // 내년
      {
        militaryUnit: "general",
        militaryStatus: "현역",
        militaryDischargeYear: 2030,
        position: "CP",
      }, // 일반병
      {
        militaryUnit: "sports",
        militaryStatus: "군필",
        militaryDischargeYear: 2030,
        position: "SP",
      }, // 이미 전역
    ];
    expect(sportsVacatingFromNpcs(npcs, 2030)).toEqual(["SP"]);
  });
});
