import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **FA를 못 구한 프로 선수는 원소속 재계약, 안 되면 은퇴다.**
 *
 * 🔴 예전엔 `current_league = "LEAGUE_INDEPENDENT"`에 소속만 비워 두고
 *   **진로 배정(12단계)에 넘겼다.** 거기서 미지명 고졸·대졸·방출자와 한 통에
 *   들어가 대학·2군·독립 자리를 겨루고, 못 잡으면 `quit_baseball`이 됐다.
 *
 *   실측(2026-08-27, 12시즌 × 4~6회):
 *       문턱 65   미계약 3,401건 : 은퇴 2% · **야구포기 64%** · 계속 34%
 *       문턱 80   미계약 9,314건 : 은퇴 1% · **야구포기 71%** · 계속 28%
 *
 *   프로 5년차가 "야구를 그만뒀다"로 끝났다. 목적지가 KBL 2군 10팀과 독립
 *   10팀뿐인데 그 자리를 매년 미지명 졸업생이 먼저 채운다.
 *
 * ⚠ **가설 둘이 실측으로 틀렸다 — 다시 세우지 마라:**
 *   · ~~정원~~ → KBL 1군 평균 30.3명/상한 34, 꽉 찬 팀 1/10
 *   · ~~독립리그 나이 상한(31세)~~ → 미계약자의 32세 이상은 **1%**다.
 *     31세 이하가 68% 그만두고 32세 이상은 19%다. **어린 쪽이 그만뒀다.**
 *
 * ⚠ 정규식을 안 쓴다 — 이스케이프가 어긋나면 검사가 조용히 헛돈다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const NPC = read("packages/engine-native/src/npc_sim.rs");
const MARKET = read("apps/ui/src/shared/usecases/weekPhases/market.ts");

describe("FA 미계약자 진로", () => {
  /** 🔴 두 갈래 다 고쳐야 한다 — 갈 팀이 없는 경우와 아무도 안 부른 경우 */
  it("미계약 두 갈래가 같은 길을 탄다", () => {
    const n = NPC.split("fa_fallback(npc, season_year,").length - 1;
    expect(n).toBe(2);
  });

  /**
   * 🔴 **진로 배정으로 안 넘긴다.** 소속 없는 독립리그로 떨구던 그 두 줄이
   *   `Placer`의 `quit_baseball`로 이어지던 자리다.
   */
  it("소속 없는 독립리그로 떨구지 않는다", () => {
    expect(NPC.includes('npc.current_league = "LEAGUE_INDEPENDENT".into();')).toBe(false);
  });

  it("먼저 원소속과 재계약한다", () => {
    expect(NPC.includes('detail: Some("FA 미계약 → 원소속 재계약".into()),')).toBe(true);
    expect(NPC.includes('events.push(ev("fa_rehome"')).toBe(true);
  });

  /**
   * ⚠ **정원을 본다.** 원소속도 자리가 없으면 못 받는다 —
   *   안 보면 FA가 캡을 통과한다(`open`이 막던 것과 같은 함정).
   */
  it("재계약도 정원을 본다", () => {
    expect(NPC.includes("roster_max.map_or(true, |m| n < m)")).toBe(true);
  });

  /**
   * ⚠ **집계를 갱신한다.** 안 하면 같은 오프시즌의 뒷사람 판정이 옛 값을 본다 —
   *   이 파일이 그 함정으로 세 번 데였다.
   */
  it("재계약이 팀 집계를 갱신한다", () => {
    expect(NPC.includes("*team_active_count.entry(team.clone()).or_default() += 1;")).toBe(true);
    expect(
      NPC.includes("*team_payroll.entry(team.clone()).or_insert(0) += npc.current_salary;"),
    ).toBe(true);
  });

  /**
   * 🔴 **`quit_baseball`이 아니라 `retirement`다.** 프로 경력자가 자리를 못
   *   구해 그만두는 건 은퇴다 — 인생 기록·경력 화면이 둘을 다르게 보여준다.
   */
  it("자리가 없으면 은퇴로 끝난다", () => {
    expect(NPC.includes('event_type: "retirement".into(),')).toBe(true);
    expect(NPC.includes('events.push(ev("fa_unsigned_retire"')).toBe(true);
    expect(NPC.includes('npc.current_league = "LEAGUE_RETIRED".into();')).toBe(true);
  });

  /** ⚠ 호출부 주석이 옛 동작을 가리키면 다음 사람이 헛짚는다 */
  it("TS 쪽 설명도 같이 고쳐져 있다", () => {
    expect(MARKET.includes("원소속 재계약 또는 은퇴")).toBe(true);
    expect(MARKET.includes("진로 배정으로 넘어간다")).toBe(false);
  });
});
