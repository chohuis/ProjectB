import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **고교 포수를 팀당 3명으로** (사용자 확정 2026-08-31 · A-2).
 *
 * 🔴 왜 — 포수 공급의 여유가 **정확히 0** 이었다:
 * ```
 *   고교 졸업 1,020명/년 중 포수 ≈ 68명
 *   대학 유입 400명/년 → 포수 27명 → 팀당 0.53명/년
 *   대학이 4년간 필요한 포수 = 2.1명 = 들어오는 양과 **같다**
 * ```
 * 평균이 필요량과 같으니 **분산만으로 절반 가까운 팀이 0명**이 된다.
 *
 * ## 넣은 것
 *
 * ```
 *   고교 정원 30 → 31 · 야수 16 → 17 · 투수 14 그대로
 *     (pitcherRatio 0.45 × 31 = 13.95 → 14 라 비율은 안 건드렸다)
 *   17번째 야수(bi == 16)를 **포수로 못박았다** — 예전엔 랜덤이라 1/8 이었다
 * ```
 *
 * ## 실측 — 고교는 들었고 대학은 안 들었다
 *
 * ```
 *                  전(3회)        후(3회)
 *   고교 포수0     2 · 1 · 1      0 · 0 · 1     ← 좋아졌다
 *   대학 포수0     3 · 4 · 6      2 · 4 · 3     ← 겹친다
 *   대학 타순미달  4 · 3 · 4      5 · 4 · 5     ← 안 좋아졌다
 * ```
 *
 * 🔴 **대학 문제는 포수 공급이 아니었다.** 같은 실행에서 대학 최소 야수가
 * **7명**이다(필요 9). 포수를 더 보내도 **받을 자리 자체가 모자란다** —
 * 원인은 따로 판다. "산수는 맞습니다"라고 한 앞선 판단이 틀렸다.
 *
 * ⚠ 그래도 A-2 는 남긴다: 고교에서 값을 했고 **부작용이 없다**
 *   (나머지 7 포지션 팀당 2 유지 · 포지션 공백 0팀 · 투수 14 유지).
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("고교 포수 공급", () => {
  const rules = JSON.parse(read("resource/data/master/players/generation_rules.json")) as {
    rosterRules: Record<string, { rosterSize: number; pitcherRatio: number; gradeMax?: number }>;
  };
  const RG = read("packages/engine-native/src/roster_gen.rs");
  const hs = rules.rosterRules.LEAGUE_HIGHSCHOOL;

  it("정원이 31이고 투수는 14 그대로다", () => {
    expect(hs.rosterSize).toBe(31);
    // 🔴 투수 수가 안 바뀌어야 한다 — 바뀌면 포수를 늘린 대가로 투수를 깎은 것이다
    expect(Math.round(hs.rosterSize * hs.pitcherRatio)).toBe(14);
    // 야수 17 = 포수 3 + 7포지션 × 2
    expect(hs.rosterSize - Math.round(hs.rosterSize * hs.pitcherRatio)).toBe(17);
  });

  /** 🔴 이게 없으면 17번째가 랜덤이라 포수가 될 확률이 1/8 이다 */
  it("17번째 야수가 포수로 못박혀 있다", () => {
    expect(RG).toContain("} else if bi == np * 2 {");
    // POSITIONS[0] 이 포수여야 이 갈래가 뜻을 갖는다.
    // ⚠ 정본은 `npc_sim.rs` 다 — 거기서 본다(표를 두 번 안 적는다).
    const NS = read("packages/engine-native/src/npc_sim.rs");
    expect(NS).toContain('pub(crate) const POSITIONS:   &[&str] = &["C",');
    expect(RG).toContain("POSITIONS[0].to_string()");
  });

  /**
   * ⚠ **두 바퀴 보장을 깨면 안 된다.** 그게 있어야 나머지 7 포지션이
   *   팀당 2명씩 서고, 한 명이 다쳐도 자리가 안 빈다.
   */
  it("두 바퀴 보장이 그대로다", () => {
    expect(RG).toContain("if bi < np * 2 {");
    expect(RG).toContain("POSITIONS[bi % np].to_string()");
  });
});
