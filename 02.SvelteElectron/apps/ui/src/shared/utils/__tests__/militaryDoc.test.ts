import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SPORTS_UNIT_CANDIDATES_WEEK, MILITARY_AGE_WARNING_WEEK, MILITARY_RESULT_WEEK,
} from "../seasonWeeks";

/**
 * `docs/MILITARY.md`가 코드와 맞는가.
 *
 * ⚠ **코드가 정본이다.** 문서를 정본으로 삼으면 또 틀린 문서가 생긴다 —
 *   이 세션에만 문서 숫자가 여섯 번 틀렸다(thread_rng 31→28 · 전역자 43→13 ·
 *   이벤트 553→535 · svelte-check 47→38 · 투수 공급 · FA 309→590).
 *
 * 이 검사는 **문서에 박아 둔 숫자**가 코드와 갈라지면 깨진다.
 */
const DOC = readFileSync(join(__dirname, "../../../../../../docs/MILITARY.md"), "utf8");
const RULES = JSON.parse(readFileSync(
  join(__dirname, "../../../../../../resource/data/master/players/generation_rules.json"),
  "utf8")) as { militaryRules?: Record<string, unknown> };

describe("병역 문서가 코드와 맞는다", () => {
  it("주차 셋이 맞는다", () => {
    expect(SPORTS_UNIT_CANDIDATES_WEEK).toBe(46);
    expect(MILITARY_AGE_WARNING_WEEK).toBe(47);
    expect(MILITARY_RESULT_WEEK).toBe(50);
    expect(DOC).toMatch(new RegExp(`W${SPORTS_UNIT_CANDIDATES_WEEK}`));
    expect(DOC).toMatch(new RegExp(`W${MILITARY_AGE_WARNING_WEEK}`));
    expect(DOC).toMatch(new RegExp(`W${MILITARY_RESULT_WEEK}`));
  });

  it("정원과 복무 기간이 맞는다", () => {
    const m = RULES.militaryRules ?? {};
    expect(m.rosterSize, "상무 정원이 바뀌었다 — 문서도 고쳐라").toBe(26);
    expect(m.serviceMonths, "복무 기간이 바뀌었다 — 문서도 고쳐라").toBe(24);
    expect(m.maxPerTeam).toBe(3);
    expect(DOC).toMatch(/26명/);
    expect(DOC).toMatch(/24개월/);
  });

  it("연간 입대 인원이 정원/복무연수로 나온다", () => {
    const m = RULES.militaryRules ?? {};
    const perYear = (m.rosterSize as number) / ((m.serviceMonths as number) / 12);
    expect(perYear).toBe(13);
    expect(DOC, "연간 13명이 문서에 없다").toMatch(/13명/);
  });

  it("나이 범위가 맞는다", () => {
    const m = RULES.militaryRules ?? {};
    // ⚠ 생성 범위는 **선발 범위와 같다**(2026-08-31 사용자 확정).
    //   둘이 갈리는 것은 `sangmuAge.test.ts` 가 따로 잡는다.
    expect(m.ageMin).toBe(20);
    expect(m.ageMax).toBe(29);
    expect(DOC).toMatch(/20~29세/);
  });

  it("계급 넷이 맞는다", () => {
    const ranks = (RULES.militaryRules?.ranks ?? []) as { name: string }[];
    expect(ranks.map((r) => r.name)).toEqual(["이병", "일병", "상병", "병장"]);
    for (const r of ranks) expect(DOC).toMatch(new RegExp(r.name));
  });

  it("모르는 것을 모른다고 적었다", () => {
    expect(DOC, "확인 못 한 것을 적어 두지 않으면 다음 사람이 다 안다고 읽는다")
      .toMatch(/아직 안 적힌 것/);
  });
});
