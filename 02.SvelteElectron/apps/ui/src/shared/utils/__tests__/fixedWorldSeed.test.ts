import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **새 게임의 세계가 고정인가.**
 *
 * 🔴 `worldSeed = Date.now()`라 **새 게임마다 선수·감독·코치가 전부 달랐다**
 *   (2026-08-26 실플에서 나왔다). 그러면 같은 상황을 다시 만들 수 없어
 *   결함을 재현하지 못하고, 공략·제보도 서로 안 맞는다.
 *
 * ⚠ 이어하기는 무관하다 — 세이브에 자기 씨앗이 들어 있다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const SRC = readFileSync(resolve(ROOT, "apps/ui/src/pages/new-game/NewGamePage.svelte"), "utf8");

describe("새 게임 세계 씨앗", () => {
  it("상수다 — 시각·난수에서 만들지 않는다", () => {
    const m = SRC.match(/const worldSeed = ([^;]+);/);
    expect(m, "worldSeed 선언을 못 찾았다 — 정규식이 소스와 어긋났다").not.toBeNull();
    const expr = m![1].trim();
    expect(expr, `worldSeed = ${expr}`).toMatch(/^\d+$/);
  });

  // 🔴 다른 자리에서 시각을 섞으면 고정이 깨진다
  it("씨앗을 만드는 자리에 Date.now나 Math.random이 없다", () => {
    const near = SRC.slice(
      Math.max(0, SRC.indexOf("const worldSeed") - 400),
      SRC.indexOf("const worldSeed") + 200,
    );
    expect(near).not.toMatch(/worldSeed[^;]*Date\.now/);
    expect(near).not.toMatch(/worldSeed[^;]*Math\.random/);
  });

  it("미리보기와 실제 생성이 같은 씨앗을 쓴다 — 예고가 사실이어야 한다", () => {
    // `previewTeamRoster(..., worldSeed, ...)`와 부팅이 같은 변수를 넘긴다
    const uses = (SRC.match(/\bworldSeed\b/g) ?? []).length;
    expect(
      uses,
      "worldSeed를 한 번밖에 안 쓴다 — 미리보기나 생성 중 하나가 빠졌다",
    ).toBeGreaterThanOrEqual(3);
  });
});
