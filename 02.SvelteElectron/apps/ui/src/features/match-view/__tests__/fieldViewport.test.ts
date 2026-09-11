import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **경기 화면에서 타자·포수가 잘리던 것.**
 *
 * 🔴 실제 플레이(2026-08-28): "타자는 반만 나오고 포수는 안 보인다 ·
 *   **경기장마다 잘림이 다 다르다**."
 *
 * ⚠ **가설 셋이 실측으로 틀렸다. 다시 세우지 마라:**
 *   · ~~그림 비율이 제각각~~ → 27장 전부 **1306x1204 한 크기**다(`npm run check:park`)
 *   · ~~구장마다 좌표가 달라야 한다~~ → 04에서 27장을 전부 재 봤고
 *     **티어마다 픽셀 단위로 같은 값**이 나왔다(`anchors.json` 머리말)
 *   · ~~스프라이트가 viewBox 밖으로 나간다~~ → 최하단이 851이고 viewBox는 920이다
 *
 * **실제 원인은 바깥 레이아웃이었다.** `.viewport`가 `height: 100%`인데
 * 부모(`.field-stage-wrap`)가 `align-items: start`라 높이가 내용 기준이고,
 * 그 위도 auto라 `100%`가 풀려 `min-height: 280px`만 남았다. SVG는 제 비율대로
 * 폭×0.92만큼 커져서 **`overflow: hidden`이 아래를 잘랐다** — 타자·포수는
 * 아래쪽에 있어 정확히 그 부분이 날아갔고, 티어마다 홈플레이트 y가 달라
 * (pro 800 · university 825 · highschool 799) 잘림이 구장마다 달랐다.
 *
 * ⚠ **이 검사는 잘림 자체를 못 본다** — 렌더링이 필요하다. 좌표가 상자 안에
 *   있다는 것과, 높이가 다시 부모에 기대지 않는다는 것만 지킨다.
 *   눈확인은 `docs/EYECHECK.md`에 있다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const FIELD = read("apps/ui/src/features/match-view/ui/BaseballField.svelte");
const ANCHORS = JSON.parse(read("resource/park/_spec/anchors.json")) as {
  coordSpace: { width: number; height: number };
  tiers: Record<
    string,
    { field: Record<string, [number, number]>; defense: Record<string, [number, number]> }
  >;
};

/** `BaseballField`의 알 반지름 — 스프라이트가 차지하는 반경이다 */
const STONE_R = 17;
/** 타자는 홈플레이트에서 위로 22 */
const BATTER_DY = -22;

describe("경기 화면 뷰포트", () => {
  /** 🔴 높이가 부모에 기대면 그 값이 풀려 `min-height`만 남는다 */
  it("뷰포트 높이를 폭에서 뽑는다", () => {
    expect(FIELD.includes("aspect-ratio: 1000 / 920;")).toBe(true);
    expect(FIELD.includes("max-height: 100%;")).toBe(true);
  });

  /** ⚠ 비율이 viewBox와 달라지면 그만큼 여백이 생긴다 */
  it("비율이 viewBox와 같다", () => {
    const { width, height } = ANCHORS.coordSpace;
    expect(FIELD.includes(`viewBox="0 0 ${width} ${height}"`)).toBe(true);
    expect(FIELD.includes(`aspect-ratio: ${width} / ${height};`)).toBe(true);
  });

  /**
   * 🔴 **모든 티어의 타자·포수가 상자 안에 있어야 한다.** 앵커를 다시 재면
   *   여기가 먼저 걸린다 — 잘림이 좌표 탓인지 레이아웃 탓인지 가른다.
   */
  it("타자·포수가 viewBox 안에 있다", () => {
    const H = ANCHORS.coordSpace.height;
    for (const [tier, v] of Object.entries(ANCHORS.tiers)) {
      const home = v.field.HOME;
      const catcher = v.defense.C;
      expect(home, `${tier} HOME 없음`).toBeTruthy();
      expect(catcher, `${tier} C 없음`).toBeTruthy();
      const batterBottom = home[1] + BATTER_DY + STONE_R;
      expect(batterBottom, `${tier} 타자가 상자 아래로 나간다`).toBeLessThan(H);
      expect(catcher[1] + STONE_R, `${tier} 포수가 상자 아래로 나간다`).toBeLessThan(H);
    }
  });

  /**
   * ⚠ **폴백 그림 둘은 쓰이는 경로가 없다.** 27장이 전부 `PARK_IMAGES`에
   *   있어서 대학·고교 GIF는 절대 안 뜬다 — 크기가 달라(1317x1194 · 1308x1203)
   *   좌표와 어긋나므로, 되살릴 때는 앵커를 다시 재야 한다.
   */
  it("폴백 그림이 쓰이는지 표시가 남아 있다", () => {
    const VIEW = read("apps/ui/src/shared/utils/parkView.ts");
    expect(VIEW.includes("TIER_FALLBACK_IMAGE")).toBe(true);
    expect(VIEW.includes("hasOwnImage")).toBe(true);
  });
});
