import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 🔴 **전역해서 독립으로 가면 시즌도 독립으로 열어야 한다** (2026-09-02).
 *
 * `dischargeProtagonist` 가 소속(`setProtagonistTeam`)만 바꾸고 시즌을 안
 * 열었다. `seasonStore` 는 군 시즌(`LEAGUE_MILITARY`) 그대로라 생존리그
 * 일정이 `leagueSchedules` 로 갔고, 배경 시뮬은 주인공 리그라고 건너뛰었다 —
 * **아무도 안 돌렸다.**
 *
 * ```
 *   실측  2031 [independent]  INDEPENDENT 175/0 (순위표 0팀)
 * ```
 *
 * 무대를 여는 자리는 다섯이었고(`seasonOpenRefill.test.ts`), 이건 **여섯째**다 —
 * `initSeason` 을 직접 안 부르고 `openProSeason` 을 거치므로 그 검사엔 안 걸렸다.
 * 고교 → 독립(`careerDecision`)과 같은 방식이어야 한다.
 */
const SRC = resolve(__dirname, "../militaryDecision.ts");

describe("전역 → 독립은 시즌을 연다", () => {
  const body = readFileSync(SRC, "utf8")
    // 주석을 걷는다 — 왜 고쳤는지를 적으면 그 안의 옛 코드가 걸린다
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it('독립 갈래 안에서 openProSeason("LEAGUE_INDEPENDENT") 를 부른다', () => {
    const start = body.indexOf('after.careerStage === "independent"');
    expect(start, "독립 갈래가 없다").toBeGreaterThan(-1);
    // 갈래 블록 — 다음 `gameStore.addCareerEvent` 앞까지
    const end = body.indexOf("gameStore.addCareerEvent", start);
    const block = body.slice(start, end > 0 ? end : undefined);
    expect(block).toContain('openProSeason("LEAGUE_INDEPENDENT"');
    // 소속을 바꾸고 나서 연다 — 순서가 바뀌면 옛 팀으로 시즌이 열린다
    expect(block.indexOf("setProtagonistTeam")).toBeLessThan(block.indexOf("openProSeason"));
  });

  it("대조군: careerDecision 도 같은 함수로 연다 — 정본이 하나다", () => {
    const cd = readFileSync(resolve(__dirname, "../careerDecision.ts"), "utf8");
    expect(cd).toContain("openProSeason(");
  });
});
