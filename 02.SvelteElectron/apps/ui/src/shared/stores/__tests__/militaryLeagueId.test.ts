import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 🔴 **입대하면 소속 리그도 군으로 간다** (2026-09-02).
 *
 * `enlistMilitary` 가 단계만 `military` 로 바꾸고 `leagueId` 는 입대 전 것을
 * 뒀다. 배경 시뮬은 `lid === 주인공.leagueId` 를 건너뛰므로:
 *
 * ```
 *   학생 입대   복무 2년 내내 고교 리그가 멈춘다   실측 HIGHSCHOOL 1020/0
 *   프로 입대   그 프로 리그가 멈춘다              (같은 원리)
 * ```
 *
 * 전역 때는 복구 단계에서 리그를 되돌린다(단계가 정본, 리그는 파생).
 * 독립 배치(`dischargeProtagonist`)는 리그가 아니라 **팀**으로 판정한다 —
 * 리그가 이미 독립이면 리그로 봐선 그 갈래를 영영 안 탄다.
 */
const read = (p: string) =>
  readFileSync(resolve(__dirname, "../../../", p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const block = (src: string, start: string, end: string) => {
  const a = src.indexOf(start);
  expect(a, `${start} 가 없다`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  return src.slice(a, b > 0 ? b : undefined);
};

describe("군 복무 중 소속 리그", () => {
  const game = read("shared/stores/game.ts");

  it("입대하면 leagueId 가 LEAGUE_MILITARY 다", () => {
    const enlist = block(game, "enlistMilitary(", "markMilitaryAsked(");
    expect(enlist).toContain('leagueId: "LEAGUE_MILITARY"');
  });

  it("전역하면 단계에서 리그를 되돌린다 — 프로 셋 + 독립", () => {
    // ⚠ `completeMilitaryService()` 부터 잡으면 **단계를 고르는 윗줄**
    //   (`p.leagueId === "LEAGUE_KBL" ? "pro_kbl"`)의 문자열이 같이 들어와
    //   복구를 지워도 통과했다(변이 검증에서 실제로 새어 나갔다).
    //   `careerStage: stage,` 뒤 — 되돌리는 대입만 본다.
    const done = block(game, "careerStage: stage,", "militaryServedUnit:");
    expect(done).toContain("leagueId:");
    for (const lid of ["LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_KBL", "LEAGUE_INDEPENDENT"]) {
      expect(done, `${lid} 복구가 없다`).toContain(`"${lid}"`);
    }
  });

  // ── 전역 시점 (B-20 재회 · 2026-09-03) ────────────────────────
  //
  // 🔴 `militaryRecoveryWeeks` 는 전역 때 2(상무)·6(현역)으로 놓이고 0에서 멈춘다 —
  //   그 뒤로 한 주가 지났는지 세 해가 지났는지 구분할 수 없었다. 「전역 후 첫 시즌
  //   W10」 같은 재회 서사를 그래서 못 걸었다.
  // ⚠ **환산(`applyMilitaryDischarge`)이 아니라 `completeMilitaryService` 에 적는다** —
  //   환산은 현역 병영생활만 타므로 거기 두면 상무 출신이 통째로 빠진다.
  it("전역하면 그 시점을 남긴다 — 상무도 지나는 자리에", () => {
    const done = block(game, 'militaryStatus: "군필"', "militaryHiatusStage: null");
    expect(done).toContain("dischargedSeason: at?.season");
    expect(done).toContain("dischargedWeek:   at?.week");
    // 호출부가 실제로 넘기는가 — 옵셔널 인자라 안 넘기면 조용히 안 적힌다
    const md = read("shared/usecases/militaryDecision.ts");
    expect(md).toContain("completeMilitaryService({ season: s.seasonYear, week: s.currentWeek })");
  });

  it("구 세이브는 기본값을 안 받는다 — 0 이면 「이번 주 전역」이 된다", () => {
    expect(game).toContain("dischargedSeason:             p.dischargedSeason,");
    expect(game).not.toContain("dischargedSeason:             p.dischargedSeason ??");
  });

  it("독립 배치는 리그가 아니라 팀으로 판정한다", () => {
    const md = read("shared/usecases/militaryDecision.ts");
    const b = block(md, "const needsIndiePlacement", "gameStore.addCareerEvent");
    expect(b).toContain("indieTeams.includes(after.teamId)");
    // 옛 조건이 되살아나면 리그가 이미 독립이라 배치를 영영 안 한다
    expect(md).not.toContain('after.leagueId !== "LEAGUE_INDEPENDENT"');
  });
});
