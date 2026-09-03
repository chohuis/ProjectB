import { describe, it, expect } from "vitest";
import { parseEffectsArray } from "../../stores/master";
import { settleSemester } from "../academicsEngine";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⚠ **`loadAcademicsRules`를 안 쓴다** — 그건 `window.projectB`를 타서
 *   노드 환경에서 못 돈다. 규칙 파일을 직접 읽어 **같은 값**을 쓴다.
 */
const RULES = JSON.parse(readFileSync(resolve(__dirname,
  "../../../../../../resource/data/master/players/generation_rules.json"), "utf8"))
  .academicsRules as Parameters<typeof settleSemester>[0];

/**
 * **학점을 건드릴 보상** — `studyQualityDelta`.
 *
 * 🔴 **2026-08-26까지 없었다.** `universityGpa`는 조건으로 읽기만 했고,
 *   힌트 여덟 자리가 "학점 유리"라 써놓고 실제로는 **성실만 움직였다**
 *   (트랙 B가 결함으로 넘긴 자리).
 *
 * ⚠ **누적 학점을 직접 밀면 안 된다.** 학점은 `qualityAccum / weeks`로 나오고
 *   그 결과가 다시 누적 평균에 들어간다 — 직접 밀면 **두 번 반영된다.**
 *   그래서 "이번 학기 학습 품질"에 더한다.
 */

/** `game.ts`의 `applyStudyQuality`와 같은 규칙 */
function applyStudyQuality<T extends { semesterQualityAccum?: number; semesterWeeks?: number }>(
  school: T, delta?: number,
): T {
  if (!delta || (school.semesterWeeks ?? 0) <= 0) return school;
  return { ...school, semesterQualityAccum: (school.semesterQualityAccum ?? 0) + delta };
}

const readSrc = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");

/**
 * **학습 강도를 이벤트 선택지로** (B-24 · 사용자 확정 2026-09-03).
 *
 * 🔴 `studyQualityDelta` 로는 대신할 수 없다. 그건 이번 학기 누적에 **한 번**
 *   더하고 끝인데, 학점은 `qualityAccum / weeks` 평균이고 매주 품질을 정하는 건
 *   **모드**다. 그래서 델타로 대신 쓰던 동안 **GPA 3.5 를 한 번도 못 넘었다.**
 */
describe("학습 강도 보상 (studyModeSet)", () => {
  it("문자열형 `studyMode:focus` 를 읽는다", () => {
    expect(parseEffectsArray(["studyMode:focus"]).studyModeSet).toBe("focus");
    expect(parseEffectsArray(["studyMode:sleep"]).studyModeSet).toBe("sleep");
  });

  it("🔴 모르는 모드는 버린다 — 조용히 박히면 학기 정산이 통째로 어긋난다", () => {
    expect(parseEffectsArray(["studyMode:hard"]).studyModeSet).toBeUndefined();
    expect(parseEffectsArray(["studyMode:"]).studyModeSet).toBeUndefined();
  });

  it("안 쓰면 안 싣는다 — 안 고른 선택지가 모드를 되돌리면 안 된다", () => {
    expect(parseEffectsArray(["study:+0.5"]).studyModeSet).toBeUndefined();
  });

  it("네 모드가 규칙 파일의 학습 모드 표와 같다", () => {
    // 파서가 아는 넷과 학점 산식이 아는 넷이 갈리면 한쪽이 조용히 무시된다
    const modes = Object.keys(RULES.university.studyModeGpa);
    for (const m of ["focus", "normal", "rest", "sleep"]) {
      expect(modes, `${m} 가 규칙 파일에 없다`).toContain(m);
      expect(parseEffectsArray([`studyMode:${m}`]).studyModeSet).toBe(m);
    }
  });

  it("선택을 적용하는 자리가 모드를 실제로 바꾼다", () => {
    // ⚠ `applySideEffects` 에 둔다 — 소식 선택(`applyDecision`)과 자동 진행
    //   (`resolveEventPending`) **둘 다** 여기를 지난다. store 패처 쪽에 두면
    //   두 갈래 중 한쪽만 고쳐진 채 남는다
    const src = readSrc("usecases/decisions.ts");
    expect(src).toContain("if (fx.studyModeSet");
    expect(src).toContain("gameStore.setStudyMode(fx.studyModeSet)");
  });

  it("🔴 대조군 — 두 축이 서로를 흉내내지 않는다", () => {
    // `study` 는 이번 학기 누적 델타, `studyMode` 는 매주 품질을 정하는 모드다.
    // 한쪽 키가 다른 쪽 필드를 채우면 힌트와 동작이 다시 갈린다
    const 델타 = parseEffectsArray(["study:+0.5"]);
    expect(델타.studyQualityDelta).toBe(0.5);
    expect(델타.studyModeSet).toBeUndefined();
    const 모드 = parseEffectsArray(["studyMode:focus"]);
    expect(모드.studyModeSet).toBe("focus");
    expect(모드.studyQualityDelta).toBeUndefined();
  });
});

describe("학습 품질 보상", () => {
  it("문자열형이 소수를 싣는다 — 눈금이 0~1이라 정수로 자르면 안 된다", () => {
    expect(parseEffectsArray(["study:+0.5"]).studyQualityDelta).toBe(0.5);
    expect(parseEffectsArray(["study:-0.3"]).studyQualityDelta).toBe(-0.3);
  });

  it("이번 학기 누적에 더한다", () => {
    const s = applyStudyQuality({ semesterQualityAccum: 4, semesterWeeks: 8 }, 0.5);
    expect(s.semesterQualityAccum).toBe(4.5);
  });

  // 🔴 주차를 같이 늘리면 평균이 희석돼 **반대로 간다**
  it("주차는 안 늘린다", () => {
    const s = applyStudyQuality({ semesterQualityAccum: 4, semesterWeeks: 8 }, 0.5);
    expect(s.semesterWeeks).toBe(8);
  });

  it("학기 밖이면 그대로다 — 고교는 9등급 경로라 학점이 없다", () => {
    const before = { semesterQualityAccum: 0, semesterWeeks: 0 };
    expect(applyStudyQuality(before, 0.5)).toBe(before);
  });

  it("보상이 없으면 원본 그대로다", () => {
    const before = { semesterQualityAccum: 4, semesterWeeks: 8 };
    expect(applyStudyQuality(before)).toBe(before);
  });

  /**
   * 🔴 **실제로 학점이 움직이는가** — 여기까지 봐야 "동작"이다.
   *
   * ⚠ 산식은 2026-08-28에 Rust로 내려갔다(`week_engine::calc_semester_result`).
   *   품질→학점 방향은 거기 검사가 본다(`품질이_오르면_학점도_오른다`).
   *   여기서 보는 건 **TS가 그 값을 손대지 않고 넘기는가**다 — 중간에
   *   깎거나 다시 나누면 보상이 조용히 사라진다.
   */
  it("보상이 붙은 누적을 엔진에 그대로 넘긴다", async () => {
    const seen: Record<string, unknown>[] = [];
    (globalThis as unknown as { window: unknown }).window = {
      projectB: {
        engine: (_fn: string, json: string) => {
          seen.push(JSON.parse(json));
          return Promise.resolve(JSON.stringify({
            gpa: 0, cumulativeGpa: 0, newWarningLevel: 0,
            repeats: false, label: "", messageSubject: "", messageBody: "",
          }));
        },
      },
    };
    const base = { qualityAccum: 4, weeks: 8, priorCumulative: 3.0,
                   semestersDone: 2, warningLevel: 0, major: "" };
    await settleSemester(RULES, base);
    await settleSemester(RULES, { ...base, qualityAccum: applyStudyQuality(
      { semesterQualityAccum: 4, semesterWeeks: 8 }, 1.0).semesterQualityAccum! });

    expect(seen).toHaveLength(2);
    expect(seen[0].qualityAccum).toBe(4);
    // 보상 +1.0이 그대로 도착한다 — 주차는 안 늘어난다
    expect(seen[1].qualityAccum).toBe(5);
    expect(seen[1].weeks).toBe(8);
  });

  /** ⚠ 규칙 파일 값이 실제로 엔진까지 간다 — 표만 채우고 안 넘기면 소용없다 */
  it("규칙 파일의 학점 상한·경고선을 엔진에 넘긴다", async () => {
    const seen: Record<string, unknown>[] = [];
    (globalThis as unknown as { window: unknown }).window = {
      projectB: { engine: (_fn: string, json: string) => {
        seen.push(JSON.parse(json));
        return Promise.resolve(JSON.stringify({
          gpa: 0, cumulativeGpa: 0, newWarningLevel: 0,
          repeats: false, label: "", messageSubject: "", messageBody: "",
        }));
      } },
    };
    await settleSemester(RULES, { qualityAccum: 4, weeks: 8, priorCumulative: 3.0,
                                  semestersDone: 2, warningLevel: 0, major: "일반전공" });
    expect(seen[0].gpaMax).toBe(RULES.university.gpaMax);
    expect(seen[0].warningGpa).toBe(RULES.university.warningGpa);
    // 전공 배수도 함께 — 안 넘기면 전공이 학점에 아무 영향이 없다
    expect(seen[0].gpaGainMult).toBe(RULES.majors["일반전공"].gpaGainMult);
  });
});
