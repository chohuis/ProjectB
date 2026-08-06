import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSettings } from "../settings";

/**
 * ⚠ **목록이 두 군데에 있다.** UI(`settings.ts`의 `WindowSize`)와
 * Electron(`ipc/window.cjs`의 `SIZES`)이 같은 집합이어야 하는데, 한쪽만
 * 늘리면 **새 항목이 조용히 무시된다** — 버튼은 눌리고 설정은 저장되는데
 * 창만 안 바뀐다. 그 어긋남을 여기서 잡는다.
 */
const UI_SIZES = ["1280x800", "1440x900", "1600x900", "1920x1080", "fullscreen"];

function mainSizes(): string[] {
  const src = readFileSync(resolve(process.cwd(), "apps/desktop/ipc/window.cjs"), "utf8");
  const block = src.slice(src.indexOf("const SIZES = {"), src.indexOf("};", src.indexOf("const SIZES = {")));
  return [...block.matchAll(/"([^"]+)":\s*\{/g)].map((m) => m[1]);
}

describe("창 크기 목록", () => {
  it("UI가 아는 값은 fullscreen 말고 전부 main도 안다", () => {
    const main = mainSizes();
    for (const s of UI_SIZES) {
      if (s === "fullscreen") continue;   // 크기가 아니라 모드다
      expect(main).toContain(s);
    }
  });

  it("main에만 있는 크기가 없다 — 있으면 고를 방법이 없다", () => {
    for (const s of mainSizes()) expect(UI_SIZES).toContain(s);
  });

  it("설정 저장소도 같은 집합만 받는다", () => {
    for (const s of UI_SIZES) {
      expect(parseSettings({ windowSize: s }).windowSize).toBe(s);
    }
    expect(parseSettings({ windowSize: "800x600" }).windowSize).not.toBe("800x600");
  });

  it("⚠ 최소 창 크기(1200x720) 아래는 없다 — 있으면 창이 안 줄어든다", () => {
    const src = readFileSync(resolve(process.cwd(), "apps/desktop/main.cjs"), "utf8");
    const m = src.match(/minWidth:\s*(\d+),\s*minHeight:\s*(\d+)/);
    expect(m).toBeTruthy();
    const [minW, minH] = [Number(m![1]), Number(m![2])];
    for (const s of mainSizes()) {
      const [w, h] = s.split("x").map(Number);
      expect(w).toBeGreaterThanOrEqual(minW);
      expect(h).toBeGreaterThanOrEqual(minH);
    }
  });
});
