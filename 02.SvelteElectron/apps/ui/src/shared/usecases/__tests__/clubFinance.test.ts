import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { revenueTypeOf, type ClubFinanceRules } from "../clubFinance";

/**
 * **구단 수입** (4-C · 2026-08-29 · 사용자 확정).
 *
 *   관중     성적 + 구단 성향(marketAppeal·prestige) — **새 수치는 base 하나**
 *   유형     리그마다 5:3:2 (균형·모기업의존·자력)
 *   정산     **시즌 종료 한 번** — 경기마다 재면 주 진행이 느려진다
 *
 * 🔴 예전엔 구단 수입이 **통째로 없었다.** 예산은 `refs.json` 정적값이고
 *   `attendance`는 **학업 출결**, 스폰서는 **주인공 개인** 재정이었다.
 *
 * 실측(씨앗 555 · KBL 10팀):
 *   2026 예산 122~333억(배수 2.73) → 2028 132~308억(배수 2.34)
 *   — 예산이 움직이고 격차가 좁혀진다
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const RULES = JSON.parse(read("resource/data/master/players/generation_rules.json"))
  .clubFinanceRules as ClubFinanceRules;

describe("구단 수입 규칙", () => {
  it("유형 셋과 가중치가 있다", () => {
    expect(RULES.typeWeights).toEqual({ balanced: 5, parent: 3, self: 2 });
    for (const k of ["balanced", "parent", "self"]) {
      expect(RULES.types[k], k).toBeTruthy();
    }
  });

  /** 🔴 몫 합이 1이 아니면 유형마다 총수입 눈금이 달라진다 */
  it("각 유형의 몫 합이 1이다", () => {
    for (const [k, v] of Object.entries(RULES.types)) {
      if (k.startsWith("_")) continue;
      const sum = v.gate + v.parent + v.tv + v.sponsor + v.goods;
      expect(sum, k).toBeCloseTo(1, 9);
    }
  });

  /** ⚠ 자력형은 관중이 절반, 모기업형은 모기업이 절반이어야 성적 민감도가 갈린다 */
  it("유형이 성적 민감도를 가른다", () => {
    expect(RULES.types.self.gate).toBeGreaterThan(RULES.types.parent.gate);
    expect(RULES.types.parent.parent).toBeGreaterThan(RULES.types.self.parent);
  });

  it("리그별 티켓값이 있다", () => {
    for (const lg of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      expect(RULES.ticketPrice[lg], lg).toBeGreaterThan(0);
    }
    // ABL(MLB 대역)이 KBL보다 비싸다
    expect(RULES.ticketPrice.LEAGUE_ABL).toBeGreaterThan(RULES.ticketPrice.LEAGUE_KBL);
  });

  /** 🔴 흥행률이 0이면 수입이 사라지고 1이면 매 경기 만원이다 */
  it("흥행률에 상·하한이 있다", () => {
    expect(RULES.attendance.min).toBeGreaterThan(0);
    expect(RULES.attendance.max).toBeLessThan(1);
  });
});

describe("수입 유형 배분", () => {
  /** ⚠ **팀 id에서 뽑는다** — `Math.random()`이면 세이브마다 체질이 바뀐다 */
  it("같은 팀은 늘 같은 유형이다", () => {
    const a = revenueTypeOf("TEAM_KBL_SEOUL_COBRAS_1", RULES);
    const b = revenueTypeOf("TEAM_KBL_SEOUL_COBRAS_1", RULES);
    expect(a).toBe(b);
  });

  it("대략 5:3:2로 갈린다", () => {
    const ids = Array.from({ length: 600 }, (_, i) => `TEAM_X_${i}`);
    const cnt: Record<string, number> = {};
    for (const id of ids) {
      const t = revenueTypeOf(id, RULES);
      cnt[t] = (cnt[t] ?? 0) + 1;
    }
    // 셋 다 나오고, 균형형이 제일 많고 자력형이 제일 적다
    expect(Object.keys(cnt).sort()).toEqual(["balanced", "parent", "self"]);
    expect(cnt.balanced).toBeGreaterThan(cnt.parent);
    expect(cnt.parent).toBeGreaterThan(cnt.self);
  });
});

describe("배선", () => {
  const CF = read("apps/ui/src/shared/usecases/clubFinance.ts");

  /** ⚠ 산식은 Rust에 있다 — TS는 재료를 모으고 결과를 저장한다 */
  it("산식이 Rust에 있다", () => {
    expect(CF).toContain('"calcClubRevenueNative"');
    expect(read("packages/engine-native/src/finance.rs"))
      .toContain("pub fn calc_club_revenue(");
    // TS 에 흥행률 산식이 없다
    expect(CF.includes("winPctSpan *")).toBe(false);
  });

  /** 🔴 저장 안 하면 앱을 껐다 켤 때 정적값으로 돌아간다 */
  it("예산이 세이브에 실린다", () => {
    const G = read("apps/ui/src/shared/stores/game.ts");
    expect(G).toContain("clubBudgets: s.clubBudgets,");
    expect(G).toContain("clubBudgets:      (saved.clubBudgets ?? {})");
  });

  /** ⚠ 성향 갱신 **뒤**여야 그 해 값으로 관중을 잰다 */
  it("시즌 종료에서 성향 갱신 뒤에 돈다", () => {
    const R = read("apps/ui/src/shared/usecases/seasonRollover.ts");
    expect(R.indexOf("settleClubFinance"))
      .toBeGreaterThan(R.indexOf("await updateProTeamProfiles()"));
  });

  /** ⚠ 리그마다 따로 정산하므로 덮어쓰면 다른 리그가 지워진다 */
  it("예산을 덮어쓰지 않고 합친다", () => {
    expect(read("apps/ui/src/shared/stores/game.ts"))
      .toContain("clubBudgets: { ...s.clubBudgets, ...next }");
  });
});

/**
 * **구단 지출** (4-B · 2026-08-29).
 *
 * 🔴 처음에 **예산이 폭주했다** — 실측 164 → 206 → 256억(매년 33%).
 *   `base_scale`에 **누적 예산**을 넣어 되먹임이 생겼다:
 *
 *       새 예산 = 예산 + 수입 − 지출
 *               = 예산 × (1 + 0.50 − 0.17) = 예산 × 1.33
 *
 * 🔴 둘째, 티켓값을 `balanced`(관중 몫 0.45) 기준으로 역산했는데 모기업형은
 *   몫이 0.25라 **총수입이 기준 규모를 넘었다**(부산 static 210억, 수입 261억).
 *
 * 고친 뒤 실측:
 *   2026 중앙 237억 → 2027 254 → 2028 258 (배수 2.74 → 2.69 → 2.73)
 *   수입 216 ≈ static 210 — 설계대로다
 */
describe("구단 지출", () => {
  const CF = read("apps/ui/src/shared/usecases/clubFinance.ts");
  const E = (RULES as unknown as { expense: {
    operations: { stadium: number; farm: number; camp: number };
    minBudgetRatio: number; maxBudgetRatio: number; budgetAdjustRate: number;
    staff: { managerBase: number; coachBase: number; abilityExp: number };
  } }).expense;

  it("지출 규칙이 있다", () => {
    expect(E.staff.managerBase).toBeGreaterThan(E.staff.coachBase);
    expect(E.operations.stadium + E.operations.farm + E.operations.camp)
      .toBeGreaterThan(0.3);
  });

  /** 🔴 **되먹임을 끊는다** — 수입·지출은 정적 기준을 본다 */
  it("수입·지출이 누적 예산을 안 본다", () => {
    expect(CF).toContain("const staticOf = (teamId: string) =>");
    expect(CF).toContain("baseScale: staticOf(t.id),");
    // 누적 예산(`scaleOf`)을 기준으로 넘기지 않는다
    expect(CF.includes("baseScale: scaleOf(t.id)")).toBe(false);
  });

  /** 🔴 티켓값이 유형과 안 맞으면 총수입이 기준 규모를 넘는다 */
  it("티켓값을 유형에 맞춘다", () => {
    expect(CF).toContain("* (share.gate / (rules.types.balanced?.gate ?? share.gate))");
  });

  /** 🔴 잔고가 그대로 예산이 되면 몇 해만 겹쳐도 발산·붕괴한다 */
  it("순익을 통째로 넣지 않고 상·하한이 있다", () => {
    expect(E.budgetAdjustRate).toBeGreaterThan(0);
    expect(E.budgetAdjustRate).toBeLessThan(1);
    expect(E.minBudgetRatio).toBeGreaterThan(0);
    expect(E.maxBudgetRatio).toBeGreaterThan(1);
    expect(CF).toContain("profit * rules.expense.budgetAdjustRate");
    expect(CF).toContain("st0 * rules.expense.maxBudgetRatio");
    expect(CF).toContain("st0 * rules.expense.minBudgetRatio");
  });

  /** ⚠ 1군만 세면 2군 연봉이 빠진다 — 같은 구단이다 */
  it("총연봉에 2군을 포함한다", () => {
    expect(CF).toContain('payrollOf.get(t.id.slice(0, -2) + "_2")');
  });

  /** ⚠ 스태프 급여는 **선수와 같은 리그 배수**를 쓴다 — 두 벌이면 갈라진다 */
  it("리그 배수를 선수 표에서 읽는다", () => {
    expect(CF).toContain("salaryRules?.leagueMult?.[leagueId]");
  });

  it("산식이 Rust에 있다", () => {
    expect(CF).toContain('"calcClubExpenseNative"');
    expect(read("packages/engine-native/src/finance.rs"))
      .toContain("pub fn calc_club_expense(");
  });
});
