import { describe, it, expect } from "vitest";
import {
  visibleNavTabs, visibleMeTabs, fallbackMeTab,
  NAV_ORDER, ME_ORDER, NAV_GROUP_BREAK_AFTER,
} from "../navVisibility";
import type { CareerStage, RetirementReason } from "../../types/save";

function ctx(careerStage: CareerStage, retired = false) {
  return {
    careerStage,
    retirement: retired
      ? { year: 2047, week: 40, reason: "decline" as RetirementReason }
      : undefined,
  };
}

describe("내비 6칸", () => {
  it("어느 단계에서도 여섯 칸이 다 보인다", () => {
    for (const s of ["highschool", "university", "pro_kbl", "military", "independent"] as const) {
      expect(visibleNavTabs(ctx(s))).toEqual(NAV_ORDER);
    }
  });

  it("상무 복무 중에도 팀·리그·일정이 남는다", () => {
    // ⚠ `enlistMilitary`는 teamId를 안 바꾼다 — 소속팀은 계속 경기를 한다.
    // 숨기면 있는 정보를 지우는 것이다
    const v = visibleNavTabs(ctx("military"));
    expect(v).toContain("team");
    expect(v).toContain("league");
    expect(v).toContain("schedule");
  });

  it("은퇴해도 내비는 그대로다 — 기록을 계속 봐야 한다", () => {
    expect(visibleNavTabs(ctx("pro_kbl", true))).toEqual(NAV_ORDER);
  });

  it("그룹 구분선은 '나' 다음이고 실제 목록 안에 있다", () => {
    expect(NAV_ORDER).toContain(NAV_GROUP_BREAK_AFTER);
    expect(NAV_ORDER.indexOf(NAV_GROUP_BREAK_AFTER)).toBe(1);
  });
});

describe("\"나\" 탭", () => {
  it("고교생은 학업이 보이고 프로는 안 보인다", () => {
    expect(visibleMeTabs(ctx("highschool"))).toContain("academics");
    expect(visibleMeTabs(ctx("university"))).toContain("academics");
    expect(visibleMeTabs(ctx("pro_kbl"))).not.toContain("academics");
    expect(visibleMeTabs(ctx("military"))).not.toContain("academics");
  });

  it("재정은 아마추어도 열린다 — 화면이 직접 '스폰서 없음'을 말한다", () => {
    for (const s of ["highschool", "university", "independent", "military"] as const) {
      expect(visibleMeTabs(ctx(s))).toContain("finance");
    }
  });

  it("은퇴하면 훈련이 사라진다", () => {
    expect(visibleMeTabs(ctx("pro_kbl"))).toContain("training");
    expect(visibleMeTabs(ctx("pro_kbl", true))).not.toContain("training");
  });

  it("어떤 단계에서도 최소 한 탭은 남는다 — 빈 화면이 나오면 안 된다", () => {
    for (const s of ["highschool", "university", "pro", "pro_kbl", "pro_abl", "pro_jbl",
                     "military", "independent"] as const) {
      expect(visibleMeTabs(ctx(s)).length).toBeGreaterThan(0);
      expect(visibleMeTabs(ctx(s, true)).length).toBeGreaterThan(0);
    }
  });

  it("순서는 ME_ORDER를 따른다", () => {
    const v = visibleMeTabs(ctx("highschool"));
    expect(v).toEqual(ME_ORDER.filter((x) => v.includes(x)));
  });
});

describe("사라진 탭에서의 이동", () => {
  it("졸업하면 학업에서 첫 탭으로 밀린다", () => {
    expect(fallbackMeTab(ctx("pro_kbl"), "academics")).toBe("status");
  });

  it("은퇴하면 훈련에서 밀린다", () => {
    expect(fallbackMeTab(ctx("pro_kbl", true), "training")).toBe("status");
  });

  it("보이는 탭이면 그대로 둔다", () => {
    expect(fallbackMeTab(ctx("highschool"), "academics")).toBe("academics");
    expect(fallbackMeTab(ctx("pro_kbl"), "finance")).toBe("finance");
  });
});
