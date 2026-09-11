import { describe, it, expect } from "vitest";
import { pitchSlotsOf, slotCountLabel, gradeFraction } from "../pitchSlots";

const p = (id: string, label: string, grade?: number | null) => ({ id, label, grade });

describe("구종 슬롯", () => {
  it("보유한 것부터 채우고 나머지는 빈칸", () => {
    const s = pitchSlotsOf([p("fastball", "패스트볼", 3)], 5);
    expect(s).toHaveLength(5);
    expect(s[0]).toEqual({ kind: "learned", no: 1, id: "fastball", label: "패스트볼", grade: 3 });
    expect(s.slice(1).every((x) => x.kind === "empty")).toBe(true);
    expect(s.map((x) => x.no)).toEqual([1, 2, 3, 4, 5]);
  });

  it("⚠ 빈칸은 어떤 구종의 자리도 아니다 — 이름이 붙지 않는다", () => {
    const s = pitchSlotsOf([p("fastball", "패스트볼", 3)], 5);
    for (const slot of s.slice(1)) {
      expect(Object.keys(slot).sort()).toEqual(["kind", "no"]);
    }
  });

  it("꽉 차면 빈칸이 없다", () => {
    const five = ["a", "b", "c", "d", "e"].map((x) => p(x, x, 1));
    expect(pitchSlotsOf(five, 5).every((x) => x.kind === "learned")).toBe(true);
  });

  it("⚠ 상한을 넘겨 보유해도 자르지 않는다 — 던질 수 있는 걸 화면에서 지우면 안 된다", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((x) => p(x, x, 1));
    const s = pitchSlotsOf(six, 5);
    expect(s).toHaveLength(6);
    expect(s.every((x) => x.kind === "learned")).toBe(true);
  });

  it("하나도 없으면 전부 빈칸", () => {
    expect(pitchSlotsOf([], 5).every((x) => x.kind === "empty")).toBe(true);
  });

  it("상한이 0이거나 음수면 빈칸을 만들지 않는다", () => {
    expect(pitchSlotsOf([], 0)).toEqual([]);
    expect(pitchSlotsOf([], -3)).toEqual([]);
  });

  it("등급이 없으면 null로 남는다", () => {
    const s = pitchSlotsOf([p("x", "X")], 3);
    expect((s[0] as { grade: number | null }).grade).toBeNull();
  });
});

describe("칸 수 표시", () => {
  it("보유/상한", () => {
    expect(slotCountLabel(1, 5)).toBe("1/5");
    expect(slotCountLabel(5, 5)).toBe("5/5");
  });

  it("상한이 바뀌면 문구도 따라간다 — 5를 글자로 박지 않았다", () => {
    expect(slotCountLabel(2, 7)).toBe("2/7");
  });
});

describe("숙련도", () => {
  it("등급을 0~1로 준다", () => {
    expect(gradeFraction(3)).toBeCloseTo(0.6);
    expect(gradeFraction(5)).toBe(1);
    expect(gradeFraction(1)).toBeCloseTo(0.2);
  });

  it("⚠ 등급을 모르면 null — 0으로 그리면 '숙련도 0'이라는 거짓이 된다", () => {
    expect(gradeFraction(null)).toBeNull();
    expect(gradeFraction(undefined as unknown as null)).toBeNull();
    expect(gradeFraction(0)).toBe(0); // 0은 진짜 0일 때만
  });

  it("범위를 벗어나도 0~1을 넘지 않는다", () => {
    expect(gradeFraction(9)).toBe(1);
    expect(gradeFraction(-2)).toBe(0);
  });

  it("최대치가 0 이하면 그릴 근거가 없다", () => {
    expect(gradeFraction(3, 0)).toBeNull();
  });
});
