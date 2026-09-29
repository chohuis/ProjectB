import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { draftInjuryCounts, DRAFT_INJURY_WINDOW_SEASONS } from "../draftSystem";
import { weekPathFlat } from "../../usecases/__tests__/weekPathSrc";

// 드래프트 부상 감점은 최근 세 시즌만 본다 — 평생 누적이면 독립 재지원이
// 해마다 나빠지기만 한다 (씨앗 20260803: 감점 30→42 · 합 34→25).
const h = (severity: string, year: number) => ({ severity, year });

describe("draftInjuryCounts", () => {
  it("창은 세 시즌이다", () => {
    expect(DRAFT_INJURY_WINDOW_SEASONS).toBe(3);
  });

  it("고교 3년치(올해 포함 세 시즌)는 전부 센다 — 고교 지원자는 결과가 그대로다", () => {
    const hist = [h("moderate", 2027), h("severe", 2028), h("surgery", 2029), h("moderate", 2029)];
    expect(draftInjuryCounts(hist, 2029)).toEqual({
      moderateInjuries: 2,
      severeInjuries: 1,
      surgeryInjuries: 1,
    });
  });

  it("창 밖(네 시즌 전)은 세지 않는다 — 심각도와 무관하게", () => {
    const hist = [h("surgery", 2026), h("severe", 2026), h("moderate", 2026), h("moderate", 2029)];
    expect(draftInjuryCounts(hist, 2029)).toEqual({
      moderateInjuries: 1,
      severeInjuries: 0,
      surgeryInjuries: 0,
    });
  });

  it("경계: 정확히 세 시즌 전(2027 in 2029)은 들어가고 2026 은 빠진다", () => {
    expect(draftInjuryCounts([h("severe", 2027)], 2029).severeInjuries).toBe(1);
    expect(draftInjuryCounts([h("severe", 2026)], 2029).severeInjuries).toBe(0);
  });

  it("독립 재지원: 해가 갈수록 옛 부상이 빠진다 — 단조 증가가 아니다", () => {
    const hist = [h("severe", 2030), h("severe", 2031), h("moderate", 2032)];
    const y32 = draftInjuryCounts(hist, 2032);
    const y34 = draftInjuryCounts(hist, 2034);
    expect(y32.severeInjuries).toBe(2);
    expect(y34.severeInjuries).toBe(0);
    expect(y34.moderateInjuries).toBe(1);
  });

  it("경증(light)은 어느 칸에도 안 들어간다", () => {
    expect(draftInjuryCounts([h("light", 2029)], 2029)).toEqual({
      moderateInjuries: 0,
      severeInjuries: 0,
      surgeryInjuries: 0,
    });
  });

  it("advanceWeek 의 드래프트 호출이 이 함수를 거친다 — 전체 이력을 직접 세는 갈래가 없다", () => {
    // ⚠ **눌러서 · 경로 전체를 읽는다** (2026-09-30 · Ⅱ-1). 두 가지가 바뀌었다:
    //   · 이 호출이 `weekPhases/careerHub.ts` 로 갔다 → `weekPathFlat` 이 그
    //     경로를 한 덩이로 읽는다 (`weekPathSrc.ts` 머리말)
    //   · 새 파일은 `.prettierignore` 밖이라 prettier 가 인자를 줄마다 접었다
    //     → 앵커에서 `p.scoutScore` 를 뺀다. 인자 근접(±)은 아래가 그대로 본다
    const src = weekPathFlat();
    const at = src.indexOf("determineProtagonistDraft(");
    expect(at).toBeGreaterThan(0);
    const around = src.slice(at - 600, at + 400);
    expect(around).toContain("draftInjuryCounts(p.injuryHistory");
    expect(around).not.toContain("filter((h) => h.severity === sev)");
  });
});
