import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **상무가 26 → 44명으로 부풀고 투수만 쌓이던 것** (2026-08-31).
 *
 * 두 결함이 겹쳐 있었고 서로 무관했다.
 *
 * ## ① 부상이 군 신분을 지웠다 → 전역이 샌다
 *
 * ```
 *   부상    updateNpcCareerStatus(id, "injured")   ← military 가 지워진다
 *   완치    injured → "active"                     ← military 로 안 돌아온다
 *   전역    if career_status != "military" continue ← 영원히 건너뛴다
 * ```
 *
 * `injuries.ts` 주석이 **그 반대 결함**(부상이 영구히 남던 것)을 고친
 * 기록이다 — 그 고침이 이걸 만들었다.
 *
 * 실측: 2026 {military/현역 26} → 2027 {active/현역 16, military/현역 16},
 * 전역년 2027인 사람이 2029까지 상무에 남았다.
 *
 * ## ② 야수의 live OVR 이 **0** 이었다
 *
 * Rust `GrowthPatch.pitching` 은 **필수 필드**다. 투구 블록이 없는 야수를
 * 보내면 serde 가 0 으로 채워 되돌려주고, `applyNpcLiveGrowth` 가 그대로
 * 썼다. 그 뒤로 `live?.pitching?.ovr ?? live?.batting?.ovr` 이 야수를 전부
 * **0** 으로 봤다 — `??` 는 0 을 안 건너뛴다.
 *
 * ```
 *   부팅 직후  야수 3,992명 · live 투구 블록 있는 야수 0명
 *   2주 뒤     야수 3,990명 · 투구 블록 3,990명 · 그중 OVR 0 이 3,990명
 * ```
 *
 * ⚠ 같은 식이 **45곳**이다. 소비하는 자리를 다 고치는 게 아니라 **만드는
 *   한 곳**을 막았다 — 성장은 있는 능력을 키우는 일이지 없는 능력을 만드는
 *   일이 아니다.
 *
 * ## 전후 (씨앗 20260803)
 *
 * ```
 *   상무 인원   26→25→35→43→44   →   26→26→41→39→30
 *   상무 야수   14 → 7            →   14 → 10
 *   상태쌍      active/현역 16     →   0 (military/현역 26)
 *   선발 포지션 RP9 SP4 (야수 0)   →   야수 8 / 투수 5
 *   후보 풀     투수 70 / 야수 0   →   투수 28 / 야수 42
 *   검사        SANGMU 타순미달·야수9미달 FAIL → 전부 ok
 * ```
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("군 신분 — 부상이 지우지 않는다", () => {
  const INJ = read("apps/ui/src/shared/usecases/weekPhases/injuries.ts");
  const NS = read("packages/engine-native/src/npc_sim.rs");

  /** 🔴 이게 빠지면 상무 선수가 다치는 순간 군 신분을 잃는다 */
  it("복무 중이면 careerStatus 를 안 덮는다", () => {
    expect(INJ).toContain('if (npcStatusById?.get(occ.playerId) !== "military") {');
    // 상태를 볼 수 있어야 한다 — 맵이 없으면 위 조건이 늘 참이 된다
    expect(INJ).toContain("const npcStatusById = result.occurred.length > 0");
  });

  /**
   * ⚠ **전역 판정이 신분에 기대면 안 된다.** `careerStatus` 는 부상·완치가
   *   덮어쓰는 값이고, 전역의 진짜 술어는 **복무 상태**다.
   *   구 세이브에 이미 눌러앉은 사람도 이걸로 나간다.
   */
  it("전역 판정이 복무 상태를 본다", () => {
    expect(NS).toContain('if n.military_status != "현역" { continue; }');
    // 신분으로 거르는 옛 조건이 남아 있으면 안 된다
    const i = NS.indexOf("// 7. 전역 처리");
    const block = NS.slice(i, i + 900);
    expect(block).not.toContain('if n.career_status != "military" { continue; }');
  });
});

describe("야수 OVR — 성장이 없던 블록을 만들지 않는다", () => {
  const SE = read("apps/ui/src/shared/stores/season.ts");

  /**
   * 🔴 이게 빠지면 야수 전원의 live 투구 OVR 이 0 이 되고, 그 값을 먼저
   * 보는 식(45곳)이 야수를 **전부 0** 으로 판정한다.
   */
  it("없던 능력 블록을 만들지 않는다", () => {
    expect(SE).toContain(
      "pitching:        prev && prev.pitching === undefined ? undefined : u.pitching,",
    );
    expect(SE).toContain(
      "batting:         prev && prev.batting  === undefined ? undefined : u.batting,",
    );
  });
});
