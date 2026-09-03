import { describe, it, expect, vi, beforeEach } from "vitest";

// 스토어 둘만 세운다 — 이 유틸은 그 둘에서 값을 읽는 것 말고는 순수하다
const state = {
  militaryUnit: "sports" as string | null,
  seasonYear: 2031,
  currentWeek: 17,
};

vi.mock("../../stores/game", () => ({
  gameStore: { subscribe: (fn: (v: unknown) => void) => { fn({ protagonist: { militaryUnit: state.militaryUnit } }); return () => {}; } },
}));
vi.mock("../../stores/season", () => ({
  seasonStore: { subscribe: (fn: (v: unknown) => void) => { fn({ seasonYear: state.seasonYear, currentWeek: state.currentWeek }); return () => {}; } },
}));

const { buildMilitaryResultMessage } = await import("../militaryResultMessage");

const choice = { id: "a", label: "끝까지 듣는다", effectHint: "관계 +8, 피로 +2" };

beforeEach(() => {
  state.militaryUnit = "sports";
  state.seasonYear = 2031;
  state.currentWeek = 17;
});

describe("군 이벤트 결과 소식", () => {
  it("군 이벤트면 한 통을 만든다", () => {
    const m = buildMilitaryResultMessage("MIL_DAY_NIGHT_DUTY", "야간 근무", choice);
    expect(m).not.toBeNull();
    expect(m!.subject).toBe("야간 근무 결과");
    expect(m!.body).toContain("끝까지 듣는다");
    expect(m!.body).toContain("관계 +8, 피로 +2");
  });

  // 🔴 id 가 겹치면 Svelte 목록이 죽고 **세이브가 아예 안 열린다**(CLAUDE.md).
  //    뜬 소식은 `msg-mil-{id}-…` 이라 결과는 반드시 갈려야 한다
  it("뜬 소식 id 와 안 겹친다 · 연도·주차가 들어간다", () => {
    const m = buildMilitaryResultMessage("MIL_DAY_PX", "PX", choice)!;
    expect(m.id).toBe("msg-mil-res-MIL_DAY_PX-2031-w17");
    expect(m.id).not.toBe("msg-mil-MIL_DAY_PX-2031-w17");
  });

  it("같은 종이 다른 주에 또 떠도 id 가 갈린다", () => {
    const a = buildMilitaryResultMessage("MIL_DAY_PX", "PX", choice)!;
    state.currentWeek = 21;
    const b = buildMilitaryResultMessage("MIL_DAY_PX", "PX", choice)!;
    expect(a.id).not.toBe(b.id);
  });

  it("군 이벤트가 아니면 안 만든다", () => {
    expect(buildMilitaryResultMessage("EVT_UNIV_ACE_UNIV", "대학 에이스", choice)).toBeNull();
  });

  it("고른 게 없으면 안 만든다", () => {
    expect(buildMilitaryResultMessage("MIL_DAY_PX", "PX", undefined)).toBeNull();
  });

  it("보낸이가 부대에 따라 갈린다", () => {
    expect(buildMilitaryResultMessage("MIL_DAY_PX", "PX", choice)!.sender).toBe("체육부대");
    state.militaryUnit = "general";
    expect(buildMilitaryResultMessage("MIL_DAY_PX", "PX", choice)!.sender).toBe("군 복무");
  });

  it("힌트가 없으면 고른 것만 남긴다", () => {
    const m = buildMilitaryResultMessage("MIL_DAY_PX", "PX", { id: "a", label: "간다" })!;
    expect(m.body).toBe("선택: 간다");
  });

  /**
   * 🔴 **자리표시자 뒤에 조사를 두지 않는다** (B-28 실측 — 선택지 라벨 176개
   *    중 172개가 무받침이라 「을 골랐다」가 172자리에서 틀렸다).
   *
   * ⚠ 받침을 코드가 보게 만들면 데이터가 늘 때마다 틀린다. 체언 종지다.
   */
  it("이름 뒤에 조사를 안 붙인다", () => {
    for (const label of ["간다", "새 폼에 도전", "멘탈 코치에게 상담"]) {
      const m = buildMilitaryResultMessage("MIL_DAY_PX", "PX", { id: "a", label })!;
      expect(m.body, `${label} 뒤에 조사가 붙었다`).toBe(`선택: ${label}`);
    }
  });

  /** ⚠ 부제·대시 금지 — 제목에 대시를 안 쓴다 */
  it("제목에 대시가 없다", () => {
    const m = buildMilitaryResultMessage("MIL_DAY_PX", "PX", choice)!;
    expect(m.subject).toBe("PX 결과");
  });
});
