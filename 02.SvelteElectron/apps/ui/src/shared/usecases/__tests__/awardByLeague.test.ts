import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defForLeague } from "../seasonAwards";

/**
 * 수상 자격선의 리그별 덮어쓰기 (2026-08-30).
 *
 * 🔴 **자격선이 프로에 맞춰져 있어 고교에서 두 부문이 매년 0건이었다.**
 *
 * | | KBL | 고교 |
 * |---|---|---|
 * | 타격왕 `minPa` 200 | 통과 104~108명 | **통과 0명** |
 * | 홀드왕 `minIp` 30  | 최다 21홀드·49이닝 | 최다 7홀드·**10이닝** |
 *
 * ⚠ **둘 다 엔진 결함이 아니었다.** 홀드는 고교에서도 한 해 704~714개가
 *   실제로 쌓이고 홀드 있는 투수가 441~461명이다 — 자격선에 걸려 안 보였다.
 *   고교 구원전담 평균이 2.8~3.2이닝이라 30이닝이 구조적으로 불가능하다.
 *
 * ⚠ **정본을 둘로 쪼개지 않았다** — `awardRules.highschool` 을 따로 두면
 *   한쪽만 고쳐진 채 남는다. 부문 안에 `byLeague` 로 얹었다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const rules = JSON.parse(read("resource/data/master/players/generation_rules.json")).awardRules as {
  batter: Array<Record<string, unknown>>;
  pitcher: Array<Record<string, unknown>>;
};
const byId = (id: string) => [...rules.pitcher, ...rules.batter].find((d) => d.id === id)!;

describe("리그별 자격선", () => {
  it("안 적은 리그는 기본값 그대로다", () => {
    const avg = byId("avg") as never;
    expect(defForLeague(avg, "LEAGUE_KBL").minPa).toBe(200);
    expect(defForLeague(avg, "LEAGUE_ABL").minPa).toBe(200);
    // 리그를 안 넘겨도 예전과 같게 돈다
    expect(defForLeague(avg, "").minPa).toBe(200);
  });

  it("적은 리그만 덮어쓴다", () => {
    const avg = byId("avg") as never;
    expect(defForLeague(avg, "LEAGUE_HIGHSCHOOL").minPa).toBe(130);
  });

  it("🔴 얕은 병합이다 — 안 적은 키는 기본값이 남는다", () => {
    // `minValue` 를 안 적었으니 프로 것(.25)이 그대로 와야 한다.
    // 통째로 갈아 끼우면 하한이 사라져 **0이 1위가 된다**.
    const avg = defForLeague(byId("avg") as never, "LEAGUE_HIGHSCHOOL");
    expect(avg.minValue).toBe(0.25);
  });

  it("고교 홀드왕은 10이닝·3홀드다", () => {
    const hd = defForLeague(byId("holds") as never, "LEAGUE_HIGHSCHOOL");
    expect(hd.minIp).toBe(10);
    expect(hd.minValue).toBe(3);
  });

  it("프로 홀드왕은 그대로 30이닝·5홀드다", () => {
    const hd = defForLeague(byId("holds") as never, "LEAGUE_KBL");
    expect(hd.minIp).toBe(30);
    expect(hd.minValue).toBe(5);
  });
});

describe("배선", () => {
  const src = read("apps/ui/src/shared/usecases/seasonAwards.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("🔴 판정이 리그를 받는다", () => {
    // 안 넘기면 기본값이라 **조용히 예전 동작**이 된다 — 고교가 다시 0건
    expect(src.includes("const def = defForLeague(rawDef, leagueId);")).toBe(true);
    expect(src.includes("winnerOf(def, stats, leagueId)")).toBe(true);
  });

  it("호출부가 리그를 넘긴다", () => {
    expect(src.includes("computeAwards(rules, stats, leagueId)")).toBe(true);
    expect(src.includes("computeAwards(rules, rookieStats, leagueId)")).toBe(true);
  });

  it("결산 화면도 같은 규칙을 쓴다", () => {
    // ⚠ 정본이 둘이면 **모달에 뜬 수상자와 경력기록이 달라진다** — 겪은 결함이다
    const modal = read("apps/ui/src/features/season-end/ui/SeasonEndModal.svelte");
    expect(
      modal.includes(
        "computeAwards(awardRules, leagueStatsOf($seasonStore, $seasonStore.leagueId), $seasonStore.leagueId)",
      ),
    ).toBe(true);
  });

  it("🔴 계측도 같은 규칙을 읽는다", () => {
    // 계측이 기본값을 보면 판정은 130으로 도는데 계측만 200으로 재서
    // **자격자 0명**이 그대로 찍힌다
    const probe = read("scripts/perf/perfEntry.ts");
    expect(probe.includes("const def = ov ? { ...rawDef, ...ov } : rawDef;")).toBe(true);
  });
});
