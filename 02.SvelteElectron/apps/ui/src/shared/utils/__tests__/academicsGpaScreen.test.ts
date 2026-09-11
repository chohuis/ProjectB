import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 화면이 엔진 값을 그리는가 — **소스로 못 박는다** ──────────────────
//
// 🔴 대학 학점 칸은 되살아났다가 **다시 죽기 쉬운 자리**다. 한 번은 갈래가
//   겹쳐 안 떴고(`{:else}` 안의 `{#if isUniv}`), 그리는 값도 정본이 아니었다
//   (`toGpa45(avgPercentile)`). 렌더 검사로는 갈래가 안 뜨는 걸 못 잡는다 —
//   **어느 값을 부르는지**를 소스에서 본다(`roleDepthWiring` 방식).

const PAGE = resolve(__dirname, "../../../pages/academics/AcademicsPage.svelte");
const SRC = readFileSync(PAGE, "utf8");
const UTILS = readFileSync(resolve(__dirname, "../universityUtils.ts"), "utf8");
const ENGINE = readFileSync(resolve(__dirname, "../academicsEngine.ts"), "utf8");

/** 주석을 뺀 본문 — 주석에 적힌 이름을 코드로 세면 안 된다 */
const CODE = SRC.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/[^\n]*/g, "");

/**
 * `<script>` 안만 — 문턱 숫자를 세는 자리다.
 *
 * ⚠ **전체를 세면 안 된다.** `<style>` 에 `font-size: 13.5px` 가 있어
 *   "3.5" 가 그냥 걸린다(첫 판이 그렇게 틀렸다). 잣대가 먼저 맞아야 한다.
 */
const SCRIPT = (/<script[^>]*>([\s\S]*?)<\/script>/.exec(SRC)?.[1] ?? "").replace(
  /\/\/[^\n]*/g,
  "",
);

/**
 * 수 하나가 **그 수로** 적혀 있는가. `13.5px` 의 "3.5" 를 세지 않는다 —
 * 앞뒤가 숫자나 점이면 다른 수의 일부다.
 */
function hasNumberLiteral(hay: string, needle: string): boolean {
  const partOfNumber = "0123456789.";
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const before = i > 0 ? hay[i - 1] : " ";
    const after = hay[i + needle.length] ?? " ";
    if (!partOfNumber.includes(before) && !partOfNumber.includes(after)) return true;
  }
  return false;
}

describe("대학 학점 칸", () => {
  it("엔진 정본(`universityGpa`)을 그린다", () => {
    expect(CODE).toContain("school.universityGpa");
  });

  it("🔴 `toGpa45` 를 안 부른다 — 그 함수는 지웠다", () => {
    expect(CODE.includes("toGpa45")).toBe(false);
    expect(UTILS.includes("export function toGpa45")).toBe(false);
  });

  it("색 문턱을 화면이 따로 들지 않는다 — 엔진의 띠를 부른다", () => {
    expect(CODE).toContain("gpaBandOf(");
    expect(ENGINE).toContain("export const UNIVERSITY_GPA_BANDS");
    // 문턱 숫자가 화면 스크립트에 다시 적히면 그게 다음 드리프트다.
    // 🔴 수 경계를 본다 — `13.5px` 의 "3.5" 를 세면 잣대가 먼저 틀린 것이다
    expect(SCRIPT.length).toBeGreaterThan(500); // 잣대 자체가 비면 아무것도 안 본다
    // ⚠ 맨정수(`3`·`4`)는 안 센다 — `gradeClass` 의 `g <= 4`, 학기 계산의 `26`
    //   같은 무관한 수가 걸린다. 문턱이 화면에 박히면 소수로 적힌다
    for (const lit of ["2.0", "2.4", "3.0", "3.5", "4.0", "4.5"]) {
      expect(hasNumberLiteral(SCRIPT, lit), `화면 스크립트에 학점 문턱 ${lit} 이 박혔다`).toBe(
        false,
      );
    }
  });

  it("졸업선을 규칙 파일에서 읽는다 — 2.0 을 적지 않는다", () => {
    expect(CODE).toContain("universityGpaScale()");
    expect(CODE).toContain("gpaScale.graduationGpa");
  });

  it("🔴 첫 학기 전엔 0 이 아니라 「없다」 — 이력 길이로 가른다", () => {
    expect(CODE).toContain("school.semesterGpaHistory");
    expect(CODE).toMatch(/hasGpa\s*=\s*semesterHistory\.length\s*>\s*0/);
    expect(CODE).toContain("{#if hasGpa}");
    expect(SRC).toContain("첫 학기 진행 중");
  });

  it("이번 학기 값은 이력의 마지막 항목이다", () => {
    expect(CODE).toMatch(/semesterHistory\[semesterHistory\.length - 1\]/);
    expect(SRC).toContain('lastSemester.term === "midterm" ? "중간" : "기말"');
  });

  it("🔴 학점 칸이 대학 갈래 안에 있다 — 옛 결함은 `{:else}` 안이었다", () => {
    const univStart = SRC.indexOf("{#if isUniv}");
    const elseAt = SRC.indexOf("{:else}", univStart);
    const gpaAt = SRC.indexOf('<p class="lbl">학점</p>');
    expect(univStart).toBeGreaterThan(-1);
    expect(elseAt).toBeGreaterThan(univStart);
    expect(gpaAt).toBeGreaterThan(univStart);
    expect(gpaAt).toBeLessThan(elseAt);
  });

  it("「평균 등급」은 고교 갈래에만 남는다 — 대학은 등급이 아니라 학점이다", () => {
    const elseAt = SRC.indexOf("{:else}", SRC.indexOf("{#if isUniv}"));
    const avgAt = SRC.indexOf('<p class="lbl">평균 등급</p>');
    expect(avgAt).toBeGreaterThan(elseAt);
  });

  it("「경고 누적」 칸은 그대로다", () => {
    expect(SRC).toContain('<p class="lbl">경고 누적</p>');
    expect(CODE).toContain("school.warningCount");
  });
});
