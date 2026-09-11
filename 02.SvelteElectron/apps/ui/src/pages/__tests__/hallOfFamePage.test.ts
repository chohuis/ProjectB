import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 명예의 전당 화면 (C단계).
 *
 * 재료는 이미 다 있었다 — `hallOfFame` · `retiredNumbers` · `careerHistory`.
 * **보여주는 자리만 없었다.**
 *
 * ⚠ 이 탭은 **헌액자가 생겨야 보인다.** 늘 열어 두면 커리어 내내 빈 탭이다 —
 *   은퇴자가 나와야 채워지므로 초반 몇 시즌은 반드시 비어 있다.
 */
const ROOT = resolve(__dirname, "../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("명예의 전당 화면", () => {
  const page = strip(read("apps/ui/src/pages/hall-of-fame/HallOfFamePage.svelte"));
  const me = strip(read("apps/ui/src/pages/me/MePage.svelte"));
  const nav = strip(read("apps/ui/src/shared/utils/navVisibility.ts"));
  const types = read("apps/ui/src/shared/types/main.ts");
  const i18n = read("apps/ui/src/shared/i18n/index.ts");

  it("다섯 층이 이어져 있다", () => {
    expect(types.includes('"hallOfFame"'), "탭 id").toBe(true);
    expect(nav.includes("hallOfFame:"), "표시 규칙").toBe(true);
    expect(nav.includes('"hallOfFame"'), "탭 순서").toBe(true);
    expect(me.includes("<HallOfFamePage />"), "렌더").toBe(true);
    expect(i18n.includes("nav.hallOfFame"), "라벨").toBe(true);
  });

  it("🔴 헌액자가 생겨야 탭이 보인다", () => {
    // 늘 열면 커리어 내내 빈 탭이다
    expect(nav.includes("hallOfFame:   ALWAYS"), "ALWAYS 면 안 된다").toBe(false);
    expect(nav.includes("hallOfFameCount")).toBe(true);
  });

  it("⚠ 결번만 있어도 연다", () => {
    // 구단 역사는 헌액자 없이도 기록이다
    expect(nav.includes("retiredNumberCount")).toBe(true);
  });

  it("🔴 세계 상태를 따로 넘긴다", () => {
    // `hallOfFame` 은 `gameStore` 에 있고 `ProtagonistSave` 에는 없다.
    // 안 넘기면 **옵셔널이라 조용히** 탭이 영영 안 보인다.
    expect(me.includes("hallOfFameCount: Object.keys($gameStore.hallOfFame")).toBe(true);
    expect(me.includes("visibleMeTabs(hofCtx)")).toBe(true);
    expect(me.includes("fallbackMeTab(hofCtx"), "폴백도 같은 컨텍스트").toBe(true);
  });

  it("헌액자 0명에서 안 깨진다", () => {
    expect(page.includes("rows.length === 0")).toBe(true);
    expect(page.includes("아직 헌액된 선수가 없습니다")).toBe(true);
  });

  it("점수 순으로 보인다", () => {
    // 명예의 전당은 연표가 아니라 서열이다. 같은 점수면 먼저 헌액된 쪽이 위
    expect(page.includes("b.score - a.score || a.year - b.year")).toBe(true);
  });

  it("수상 이력을 근거로 편다", () => {
    // 점수만 보이면 왜 들어갔는지 알 수 없다
    expect(page.includes("careerHistory")).toBe(true);
    expect(page.includes("highlights")).toBe(true);
  });
});
