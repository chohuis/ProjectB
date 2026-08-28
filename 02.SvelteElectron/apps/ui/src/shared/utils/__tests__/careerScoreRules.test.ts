import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  primeCareerScoreRules, calcHsBaseballScore, calcIndividualScore,
} from "../universityUtils";
import type { CareerSeasonRecord } from "../../types/save";

/**
 * **진로 점수 표는 규칙 파일이 정본이다** (2026-08-28).
 *
 * 🔴 숫자가 코드에 박혀 있었다 — 우승 100 · 준우승 60 · 4강 30 · 수상 ×15가
 *   전부 리터럴이었다. 밸런스 값을 코드에 두면 규칙 파일과 어긋난 걸
 *   아무도 모른다.
 *
 * ⚠ **Rust로 안 내렸다.** 저장된 기록을 더하는 집계고 난수도 확률도 없다.
 *   화면이 반응형(`$:`)으로 부르는 자리가 있어 IPC를 태우면 렌더가 깨진다 —
 *   숫자만 올리고 합산은 TS에 뒀다. 이게 이관의 **두 번째 갈래**다
 *   (`docs/ENGINE_OWNERSHIP.md` 참고).
 *
 * ⚠ 정규식을 안 쓴다 — 값을 그대로 맞댄다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const RULES = JSON.parse(
  readFileSync(resolve(ROOT, "resource/data/master/players/generation_rules.json"), "utf8"),
) as {
  careerScoreRules?: {
    highschool?: Record<string, number>;
    individual?: Record<string, number>;
  };
};

/** 수상 둘 — 개수만 세므로 내용은 아무거나 */
const AW2 = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
];

const rec = (o: Partial<CareerSeasonRecord>): CareerSeasonRecord =>
  ({ year: 2026, leagueId: "LEAGUE_HIGHSCHOOL", teamId: "T", ...o } as CareerSeasonRecord);

describe("진로 점수 표", () => {
  it("규칙 파일에 두 표가 있다", () => {
    expect(RULES.careerScoreRules?.highschool).toBeTruthy();
    expect(RULES.careerScoreRules?.individual).toBeTruthy();
  });

  /**
   * 🔴 **팀 점수와 개인 기여는 다른 것이다.** 우승 배점이 100 대 25인 게 그
   *   차이다 — 팀 점수를 그대로 쓰면 **우승팀 벤치가 해외 2군을 뚫는다**
   *   (2026-08-27 사용자 지적으로 개인 기여를 새로 만든 이유).
   */
  it("팀 점수가 개인 기여보다 훨씬 크다", () => {
    const hs = RULES.careerScoreRules!.highschool!;
    const ind = RULES.careerScoreRules!.individual!;
    expect(hs.champion).toBeGreaterThan(ind.champion * 3);
  });

  /** ⚠ 옮기면서 값을 바꾸지 않았다 — 바꿨으면 전후를 못 잰다 */
  it("옮기면서 값을 바꾸지 않았다", () => {
    const hs = RULES.careerScoreRules!.highschool!;
    expect(hs).toMatchObject({
      champion: 100, runnerUp: 60, semiFinal: 30, notQualified: 10, perAward: 15,
    });
    const ind = RULES.careerScoreRules!.individual!;
    expect(ind).toMatchObject({
      champion: 25, runnerUp: 15, semiFinal: 8, perAward: 20,
      ipPerInning: 0.5, ipCap: 30, eraBase: 3.0, eraPerRun: 8, eraMin: -15, eraMax: 25,
    });
  });

  /** 🔴 표를 채우면 그 값이 실제로 쓰여야 한다 */
  it("규칙 파일 값이 계산에 실제로 걸린다", () => {
    primeCareerScoreRules({ careerScoreRules: { highschool: { champion: 7, perAward: 1 } } });
    // 우승 7 + 수상 2개 × 1 = 9
    expect(calcHsBaseballScore([rec({ psResult: "champion", awards: AW2 })])).toBe(9);
    // 되돌린다 — 다른 검사에 새면 안 된다
    primeCareerScoreRules(RULES);
    expect(calcHsBaseballScore([rec({ psResult: "champion", awards: AW2 })])).toBe(130);
  });

  /**
   * 🔴 **못 채워도 0이 되면 안 된다.** 0이면 "대회 성적이 없는 선수"가 되어
   *   진로가 통째로 막힌다 — 부팅 순서가 어긋나도 게임이 돌아야 한다.
   */
  it("표를 안 채워도 폴백으로 돈다", () => {
    // ⚠ **소스에서 폴백 값을 직접 읽는다.** `primeCareerScoreRules({})`만으로는
    //   앞선 검사가 채워 둔 표가 남아 있어 **폴백을 0으로 만들어도 통과**한다
    //   (변이 검증에서 걸렸다). 상태에 기대지 않고 코드를 본다.
    const src = readFileSync(
      resolve(ROOT, "apps/ui/src/shared/utils/universityUtils.ts"), "utf8",
    );
    const at = src.indexOf("const HS_FALLBACK");
    expect(at, "폴백 표를 못 찾았다").toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("};", at));
    // 폴백이 0이면 "대회 성적이 없는 선수"가 되어 진로가 통째로 막힌다
    for (const v of body.match(/: (\d+)/g) ?? []) {
      expect(Number(v.slice(2)), `폴백에 0이 있다: ${body}`).toBeGreaterThan(0);
    }
    primeCareerScoreRules({});
    expect(calcHsBaseballScore([rec({ psResult: "champion" })])).toBeGreaterThan(0);
    primeCareerScoreRules(RULES);
  });

  /** ⚠ 고교 기록만 센다 — 대학·프로가 섞이면 입시 점수가 아니다 */
  it("고교 기록만 센다", () => {
    primeCareerScoreRules(RULES);
    const mixed = [
      rec({ psResult: "champion" }),
      rec({ psResult: "champion", leagueId: "LEAGUE_UNIVERSITY" }),
    ];
    expect(calcHsBaseballScore(mixed)).toBe(100);
  });

  /** ⚠ 개인 기여는 리그를 안 가린다 — 해외 판정이 대학·독립 기록도 본다 */
  it("개인 기여는 이닝·ERA를 함께 본다", () => {
    primeCareerScoreRules(RULES);
    const r = rec({
      psResult: "semiFinal", awards: [],
      stats: { type: "pitcher", ip: 60, era: 3.0 } as CareerSeasonRecord["stats"],
    });
    // 4강 8 + 이닝 min(30, 60×0.5)=30 + ERA (3.0−3.0)×8=0 → 38
    expect(calcIndividualScore([r])).toBe(38);
  });
});
