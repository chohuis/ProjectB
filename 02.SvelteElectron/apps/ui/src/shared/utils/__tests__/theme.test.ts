import { describe, it, expect } from "vitest";
import { resolveTone, applyTone } from "../theme";

describe("톤 판정", () => {
  it("명시한 값이 시스템보다 우선한다", () => {
    expect(resolveTone("light", true)).toBe("light");
    expect(resolveTone("dark", false)).toBe("dark");
  });

  it("system은 운영체제를 따른다", () => {
    expect(resolveTone("system", true)).toBe("dark");
    expect(resolveTone("system", false)).toBe("light");
  });

  it("⚠ 결과는 둘뿐이다 — 'system'이 그대로 새어 나가면 안 된다", () => {
    for (const s of ["light", "dark", "system"] as const) {
      for (const sys of [true, false]) {
        expect(["light", "dark"]).toContain(resolveTone(s, sys));
      }
    }
  });
});

describe("문서에 바르기", () => {
  it("어두우면 속성을 붙이고 밝으면 지운다", () => {
    const el = { attrs: {} as Record<string, string>,
      setAttribute(k: string, v: string) { this.attrs[k] = v; },
      removeAttribute(k: string) { delete this.attrs[k]; } };

    applyTone("dark", el as unknown as HTMLElement);
    expect(el.attrs["data-theme"]).toBe("dark");

    applyTone("light", el as unknown as HTMLElement);
    expect(el.attrs["data-theme"]).toBeUndefined();
  });

  it("여러 번 발라도 하나만 남는다", () => {
    const el = { attrs: {} as Record<string, string>,
      setAttribute(k: string, v: string) { this.attrs[k] = v; },
      removeAttribute(k: string) { delete this.attrs[k]; } };
    applyTone("dark", el as unknown as HTMLElement);
    applyTone("dark", el as unknown as HTMLElement);
    expect(Object.keys(el.attrs)).toEqual(["data-theme"]);
  });
});
