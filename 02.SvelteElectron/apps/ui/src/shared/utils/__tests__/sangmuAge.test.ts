import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **상무 나이 — 생성과 선발이 같은 범위여야 한다** (사용자 확정 2026-08-31).
 *
 * 🔴 값이 두 곳에 따로 있었고 달랐다:
 * ```
 *   생성   militaryRules.ageMin 20 / ageMax 24   (세계 시작 26명)
 *   선발   game.ts  age >= 20 && age <= 29        (매년 들어오는 13명)
 * ```
 * 같은 팀인데 기준이 둘이라 **세계가 자기일관되지 않았다** — 시작 인원만
 * 유독 젊고, 한 시즌 지나면 20~29 가 섞인다.
 *
 * 실측 (`generateMilitaryRosterNative` · 씨앗 셋):
 * ```
 *   전(24)   나이 20~24 · 중앙 22 · 25세 이상 0명
 *   후(29)   나이 20~29 · 중앙 25 · 25세 이상 13명
 *   야수/투수 14/12 — 둘 다 그대로다
 * ```
 *
 * ⚠ 값의 정본은 `generation_rules.json` **하나**다. `military_roster.rs` 는
 *   `age_min`/`age_max` 를 그대로 받아 쓴다 — 표를 두 번 적지 않는다
 *   (`CLAUDE.md`: "표를 두 번 적지 말 것").
 *
 * ⚠ 이 검사는 **두 값이 갈리는 것**을 잡는다. 나이를 바꾸려면 양쪽을
 *   같이 바꿔야 한다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("상무 나이 — 생성과 선발이 갈리지 않는다", () => {
  const rules = JSON.parse(read("resource/data/master/players/generation_rules.json")) as {
    militaryRules: { ageMin: number; ageMax: number };
  };
  const GAME = read("apps/ui/src/shared/stores/game.ts");

  it("선발 후보 필터가 아직 그 자리에 있다", () => {
    // 없어지면 아래 대조가 무의미해진다 — 조용히 통과하지 않게 먼저 본다
    expect(GAME).toContain("e.age >= 20 && e.age <= 29");
  });

  it("생성 범위가 선발 범위와 같다", () => {
    const m = /e\.age >= (\d+) && e\.age <= (\d+)/.exec(GAME);
    expect(m).not.toBeNull();
    expect(rules.militaryRules.ageMin).toBe(Number(m![1]));
    expect(rules.militaryRules.ageMax).toBe(Number(m![2]));
  });

  /** ⚠ Rust 에 값을 다시 적으면 이 검사가 무력해진다 */
  it("Rust 에 나이 표를 두 번 적지 않았다", () => {
    const MR = read("packages/engine-native/src/military_roster.rs");
    // 규칙에서 받아 쓰는 형태여야 한다
    expect(MR).toContain("r.age_min + (rng.next() * ((r.age_max - r.age_min)");
    // 숫자를 박은 자리가 없어야 한다
    expect(MR).not.toContain("age_min: 20");
    expect(MR).not.toContain("age_max: 24");
  });
});
