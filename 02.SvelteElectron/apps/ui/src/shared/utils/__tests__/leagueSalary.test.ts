import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **연봉이 리그를 따라 움직인다** (사용자 확정 2026-08-31).
 *
 * 🔴 `salaryRules.leagueMult`(KBL 1.0 · 2군 0.3 · 독립 0.14 · ABL 3.5 · JBL 2.0)
 * 가 **생성 때만** 걸리고 있었다. 소속을 바꾸는 자리가 연봉을 안 건드려서
 * 옮겨온 사람이 옛 리그 몸값을 그대로 들고 왔다.
 *
 * 실측 (독립리그 연봉 · 출신 접두어별 · 씨앗 20260803 3시즌):
 * ```
 *            전                         후
 *   KB   평균 20,474  최고 99,721   →   평균   377  최고 1,297
 *   UV   평균  3,483                →   평균 1,092
 *   KF   평균  3,979                →   평균 1,269
 *   상무  원 소속 연봉 그대로         →   300만원 (군인 봉급)
 * ```
 * 상무 최고연봉이 **9.97억**이었다 — 연봉 10억짜리 군인이 있었다.
 *
 * ## 네 자리
 *
 * ```
 *   ① 상무 입대   군인 봉급(militaryRules.salary)
 *   ② 독립 재도전 새 계약이라 독립 기준으로 다시 잡는다
 *   ③ 강등·승격   배수 비율로 오르내린다 (2군 0.3 ↔ 1군 1.0)
 *   ④ 독립 입단   **예산 게이트** — 들어올 때 그 팀 예산에 자리가 있나 본다
 * ```
 *
 * ⚠ ③은 **다시 계산하지 않고 비율로 옮긴다.** 새로 계산하면 그 선수가
 *   연차·성적으로 쌓은 상대적 위치가 지워진다 — "올라가고 깎이고"는 비율로
 *   움직이는 것이지 새 사람이 되는 게 아니다.
 *
 * ⚠ ④는 **사후 방출이 아니라 유입 게이트**다. 방출로 풀면 같은 사람이 매년
 *   들어왔다 잘리는 **회전문**이 된다. 연봉 상한은 안 둔다(사용자 확정) —
 *   OVR 91 방출자가 독립 배수를 제대로 받고도 2.09억인데, 그건 산식이
 *   지수(`3000 × 1.1^(OVR−50)`)라 그렇고 **결함이 아니다.**
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("연봉 — 리그를 따라 움직인다", () => {
  const NS = read("packages/engine-native/src/npc_sim.rs");
  const DR = read("packages/engine-native/src/draft.rs");
  const MR = read("apps/ui/src/shared/utils/militaryRules.ts");
  const GM = read("apps/ui/src/shared/stores/game.ts");

  it("① 상무 입대는 군인 봉급이다", () => {
    expect(MR).toContain("salary: mil?.salary ?? 300,");
    expect(GM).toContain("const milSalary = milLimits.salary;");
    expect(GM).toContain("currentSalary:         milSalary,");
  });

  it("② 독립 재도전은 새 계약이다", () => {
    expect(NS).toContain('npc_core_ovr(npc), "LEAGUE_INDEPENDENT",');
    // 규칙을 안 넘기면 예전 동작이어야 한다 — 검사 호출부가 그렇게 쓴다
    expect(NS).toContain("salary_rules: Option<&SalaryRules>,");
  });

  /** ⚠ 비율이어야 한다 — 새로 계산하면 쌓은 위치가 지워진다 */
  it("③ 강등·승격은 배수 비율로 옮긴다", () => {
    expect(NS).toContain("fn rescale_salary_for_league(");
    expect(NS).toContain("let scaled = (npc.current_salary as f64 * (to_m / from_m))");
    // 새 리그 최저로 바닥을 친다
    expect(NS).toContain("npc.current_salary = scaled.max(floor);");
    // 두 자리 다 걸려 있어야 한다 — 한쪽만 걸면 오르기만 하거나 깎이기만 한다
    expect(NS).toContain("rescale_salary_for_league(npc, &npc_league_before, &farm_lid");
    expect(NS).toContain("rescale_salary_for_league(&mut npcs[idx], &before, &league_id");
  });

  /** 🔴 사후 방출이 아니라 유입 게이트다 — 방출로 풀면 회전문이 된다 */
  it("④ 독립 입단에 예산 게이트가 있다", () => {
    expect(DR).toContain("pub fn with_budgets(");
    expect(DR).toContain("if let (Some(need), Some(budget)) =");
    // 배정 뒤 총연봉에 더해야 한 팀이 여럿을 못 받는다
    expect(DR).toContain("*self.team_payroll.entry(npc.current_team.clone()).or_insert(0) += sal;");
    // 운영 경로가 실제로 켜야 한다 — 안 켜면 조용히 예전 동작이다
    expect(NS).toContain(".with_budgets(params.team_budgets.clone()");
  });

  /**
   * ⚠ 게이트가 본 값과 실제 연봉이 갈리면 안 된다 — 다시 계산하면 난수가
   *   한 번 더 돌아 예산을 넘겨도 들어간다.
   */
  it("게이트가 본 연봉을 그대로 쓴다", () => {
    expect(DR).toContain("if let Some(sal) = self.pending_salary {");
  });
});
