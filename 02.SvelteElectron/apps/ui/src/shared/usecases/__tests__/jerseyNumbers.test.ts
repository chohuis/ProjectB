import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 등번호 유일성 배선 (2단계 선행).
 *
 * 🔴 **유입 경로가 여럿인데 번호를 주는 곳은 하나뿐이었다.**
 *   초기 생성(`roster_gen` · `GenNpc`)만 `i+1` 을 주고, 매년 충원
 *   (`generate_freshmen` · `NpcSaveState`)은 **필드 자체가 없었다.**
 *   TS 타입엔 `jerseyNumber?: number` 가 있어 `?? 0` 으로 조용히 0 이 된다 —
 *   오류도 로그도 없고 화면에만 0번으로 나온다.
 *
 *   실측(씨앗 111 · 2027): 238팀 전부 중복 · 7,338건 · 한 번호 최대 45명.
 *   고친 뒤 0건.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** 주석을 지운다 — **안 쓰는 이유를 적어 둔 주석이 통과시키면 안 된다** */
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("등번호 유일성", () => {
  const week = strip(read("apps/ui/src/shared/usecases/weekPhases/jerseyNumbers.ts"));
  const advance = strip(read("apps/ui/src/shared/usecases/advanceWeek.ts"));
  const rust = read("packages/engine-native/src/npc_sim.rs");
  const types = read("packages/engine-native/src/sim_types.rs");
  const libRs = read("packages/engine-native/src/lib.rs");

  it("Rust 가 필드를 갖고 정리 함수가 있다", () => {
    expect(types.includes("pub jersey_number: i32"), "NpcSaveState 필드").toBe(true);
    expect(rust.includes("pub(crate) fn fix_jersey_numbers"), "정리 함수").toBe(true);
    expect(libRs.includes("fix_jersey_numbers_native"), "napi export").toBe(true);
  });

  it("오프시즌과 주 경계 **둘 다** 돈다", () => {
    // 오프시즌만 돌면 시즌 중 유입이 한 해 내내 0번으로 남는다
    // (실측: 롤오버만 돌렸을 때 1,216건 잔존)
    expect(
      rust.split("fix_jersey_numbers(&mut").length - 1,
      "Rust 호출 두 자리",
    ).toBeGreaterThanOrEqual(2);
    expect(advance.includes("processJerseyNumbers()"), "주 경계 호출").toBe(true);
  });

  it("상무를 빠뜨리지 않는다", () => {
    // 🔴 `careerStatus` 는 5종이고 상무는 `"military"` 다.
    //   active·injured 만 보던 시절 **상무만 13건** 남았다.
    expect(
      week.includes('n.careerStatus === "active" && n.careerStatus === "injured"'),
      "좁은 필터가 남아 있으면 안 된다",
    ).toBe(false);
    expect(week.includes('n.careerStatus === "retired"'), "retired 제외").toBe(true);
    expect(week.includes('n.careerStatus === "free_agent"'), "free_agent 제외").toBe(true);
  });

  it("문제 있는 팀만 IPC 를 탄다", () => {
    // 전량(7,000명)을 주마다 왕복시키면 줄인 IPC(-30%)를 도로 까먹는다
    expect(week.includes("if (badTeams.size === 0) return [];")).toBe(true);
  });

  it("바뀐 사람만 얹는다", () => {
    // 전량을 받아 덮으면 그 사이 다른 처리가 바꾼 값이 사라진다
    expect(week.includes("numOf.has(n.npcId)")).toBe(true);
  });

  it("이미 유일한 번호는 안 건드린다", () => {
    // 선수에게 등번호는 정체성이라 해마다 바뀌면 안 된다
    expect(rust.includes("if num > 0 && taken.insert(num) { continue; }")).toBe(true);
  });
});
