import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { militaryEnlistPick, SIM_PERSONAS } from "../simPersona";

/**
 * **안전형이 대학을 다니게 한다** (2026-09-19 · A ·
 * `docs/SIM_102_UNIV_MIL_2026-09-19.md` ①).
 *
 * 🔴 24판 재계측에서 안전형 세 판(#8 #14 #20)이 `대학 17주` 뒤 곧장 입대했다.
 *   `careerRoutePriority` 는 안전형이 대학을 1순위로 두는 이유를 "4년이
 *   보장되고 재지명 기회가 네 번 더 생긴다"고 적어 뒀는데, 입대 결정이 그
 *   4년을 첫해에 지웠다 — **대학 성향을 잰다면서 대학을 안 다니는 표본**이다.
 *
 * ⚠ **고치는 자리는 계기뿐이다.** 게임은 화면에서 갈래 둘(입대·연기)을 그대로
 *   보여 주고 사람이 고른다. 실제 플레이의 기본 성향은 `growth`(미룬다)라
 *   이 표가 바뀌어도 사람 플레이는 한 줄도 안 바뀐다.
 */
describe("입대 결정 — 성향", () => {
  const 대학저학년 = { stage: "university" as const, universityFinalYear: false, seed: 1 };
  const 대학4학년 = { stage: "university" as const, universityFinalYear: true, seed: 1 };
  const 프로 = { stage: "pro_kbl" as const, universityFinalYear: false, seed: 1 };

  it("성장형은 언제나 미룬다 — 프로에서 뛸 해를 안 버린다", () => {
    for (const ctx of [대학저학년, 대학4학년, 프로]) {
      expect(militaryEnlistPick("growth", ctx)).toBe(false);
    }
  });

  it("🔴 안전형은 대학 저학년이면 안 간다 — 고친 자리", () => {
    expect(militaryEnlistPick("safe", 대학저학년)).toBe(false);
  });

  it("안전형은 대학 4학년이면 간다 — 5학년은 없다", () => {
    expect(militaryEnlistPick("safe", 대학4학년)).toBe(true);
  });

  it("대조군 — 안전형이 프로·독립에서는 그대로 간다(기준선이 안 흔들린다)", () => {
    expect(militaryEnlistPick("safe", 프로)).toBe(true);
    expect(
      militaryEnlistPick("safe", {
        stage: "independent",
        universityFinalYear: false,
        seed: 1,
      }),
    ).toBe(true);
    expect(
      militaryEnlistPick("safe", {
        stage: "highschool",
        universityFinalYear: false,
        seed: 1,
      }),
    ).toBe(true);
  });

  it("대충형은 무대를 안 본다 — 씨앗만 본다(바닥 확인용 무작위)", () => {
    // 같은 씨앗이면 무대가 달라도 같은 답이다 — 학적 규칙이 대충형에 새면 여기가 죽는다
    for (const seed of [1, 2, 3, 7, 11, 101]) {
      const a = militaryEnlistPick("lazy", { ...대학저학년, seed });
      expect(militaryEnlistPick("lazy", { ...프로, seed })).toBe(a);
      expect(militaryEnlistPick("lazy", { ...대학4학년, seed })).toBe(a);
    }
  });

  it("대충형은 씨앗이 같으면 늘 같은 답이다 — 계측이 재현된다", () => {
    for (const seed of [0, 5, 20260802, 777]) {
      const a = militaryEnlistPick("lazy", { ...프로, seed });
      expect(militaryEnlistPick("lazy", { ...프로, seed })).toBe(a);
    }
  });

  it("대충형은 한쪽으로 안 쏠린다 — 둘 다 난다", () => {
    const 답 = [];
    for (let seed = 0; seed < 200; seed++) 답.push(militaryEnlistPick("lazy", { ...프로, seed }));
    expect(답.filter(Boolean).length).toBeGreaterThan(20);
    expect(답.filter((x) => !x).length).toBeGreaterThan(20);
  });

  it("성향 셋이 다 답을 낸다 — 새 성향이 늘면 여기서 걸린다", () => {
    for (const p of SIM_PERSONAS) {
      expect(typeof militaryEnlistPick(p, 프로)).toBe("boolean");
    }
  });
});

/**
 * 배선 — **정본이 둘이 되지 않는다.** 성향 규칙은 `simPersona` 하나가 갖고,
 * `runAutoAdvance` 는 상태를 읽어 넘기기만 한다. 예전엔 규칙이 거기 박혀 있었다.
 */
describe("입대 결정 — 배선", () => {
  const ROOT = resolve(__dirname, "../../../../../..");
  const AUTO_SRC = readFileSync(resolve(__dirname, "../runAutoAdvance.ts"), "utf8");
  const WORKER_SRC = readFileSync(resolve(ROOT, "scripts/probe-a-simrun-worker.cjs"), "utf8");

  it("runAutoAdvance 는 simPersona 의 함수를 쓴다 — 사본을 안 만든다", () => {
    expect(AUTO_SRC).toContain("militaryEnlistPick, type SimPersona,");
    expect(AUTO_SRC).toContain("return militaryEnlistPick(persona(), {");
    expect(AUTO_SRC).toContain("const 간다 = militaryEnlistPickHere();");
  });

  it("대학 4학년 판정은 careerTransition 하나가 갖는다", () => {
    expect(AUTO_SRC).toContain(
      'import { isUniversityFinalYear } from "../utils/careerTransition";',
    );
  });

  it("누가 정했는지 자취가 남는다 — 계측 게이트 뒤에서만", () => {
    expect(AUTO_SRC).toContain("정한곳=runAutoAdvance.militaryEnlistPick");
    // ⚠ 게이트가 빠지면 실제 플레이 콘솔에도 찍힌다
    expect(AUTO_SRC).toContain("if ((globalThis as Record<string, unknown>).__PB_CAREER_LOG) {");
    // 워커가 그 줄을 실제로 판 JSON 에 싣는다 — 안 실으면 찍어도 안 남는다
    expect(WORKER_SRC).toContain('const 로그머리 = ["[진로점수]", "[군결정]"];');
  });
});
