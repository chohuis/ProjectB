import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **수비수 신원 배선** (G-1 · 2026-08-29).
 *
 * 🔴 예전엔 수비수가 누구인지 알 방법이 없었다:
 *
 *     FielderStats              player_id 없음
 *     buildFielders             name = **사람 이름**     (동명이인을 못 가린다)
 *     buildFieldersFromLineup   name = **포지션 문자열** (신원이 아예 없다)
 *                               fielding = 컨택·주력 **대용값**
 *
 * ⚠ **주인공 경기는 이미 실제 수비수를 넘기고 있었다** — 두 경로가 다른
 *   수준으로 돌았다. 이건 그걸 맞추는 일이기도 하다.
 *
 * 실측(씨앗 555 · 2시즌 · 규정투수 ~60):
 *
 *     전  ERA 5.621 · 피안타/9 10.60
 *     후  ERA 5.686 · 피안타/9 10.53      ← **거의 안 움직였다**
 *
 * 산식으로 보면 실제 `fielding`(ovr−5±6)이 옛 대용값(ovr−1±4.2)보다
 * 평균 4점 낮고 편차가 1.4배 넓은데, ERA는 +1.2%뿐이다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("수비수 신원", () => {
  const GS = read("apps/ui/src/shared/utils/gameSimulator.ts");
  const ML = read("apps/ui/src/shared/utils/matchLineupBuilder.ts");

  it("엔진이 수비수 id를 받는다", () => {
    expect(read("packages/engine-native/src/types.rs")).toContain("pub player_id: String,");
  });

  /** 🔴 리그 경기가 **포지션 문자열**을 이름으로 쓰고 있었다 */
  it("리그 경기가 실제 선수를 싣는다", () => {
    expect(GS).toContain("playerId: b?.id ?? \"\",");
    // 옛 동작이 돌아오지 않는다
    expect(GS.includes("return { position: p, name: p,")).toBe(false);
  });

  /** 🔴 수비 능력이 **컨택·주력 대용값**이었다 — 팀마다 사실상 같았다 */
  it("리그 경기가 실제 수비 능력을 쓴다", () => {
    expect(GS).toContain("fielding: b?.fielding ?? 50,");
    expect(GS.includes("Math.round((b.contact + b.speed) / 2)")).toBe(false);
    // SimBatter 가 그 값을 실어 온다 — 안 실으면 전 팀 50 고정이다
    expect(GS).toContain("fielding: b?.fielding ?? 50,\n  };");
  });

  /** ⚠ 이름만으론 동명이인을 못 가린다 */
  it("주인공 경기도 id를 싣는다", () => {
    expect(ML).toContain("playerId: src?.id ?? \"\",");
  });

  /** ⚠ 두 경로가 같은 축을 써야 한다 — 하나만 고치면 또 갈린다 */
  it("두 경로가 모두 id를 싣는다", () => {
    expect(GS.includes("playerId:")).toBe(true);
    expect(ML.includes("playerId:")).toBe(true);
  });
});
