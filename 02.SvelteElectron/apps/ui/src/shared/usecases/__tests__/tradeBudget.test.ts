import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **트레이드가 실제 구단 예산을 본다** (2026-09-01 · C-2).
 *
 * ## 🔴 무엇이 틀렸었나
 *
 * `salaryCap: 300000`(30억)이 `market.ts` 두 곳에 **박혀** 있었다. 그런데
 * 실제 KBL 총연봉이 60~86억이라 **상한이 총연봉보다 작았고**, 엔진의
 * `flex = (cap − payroll) / cap` 이 음수가 됐다. 그러면 부담항의 분모
 * `(flex × cap).max(1.0)` 이 **1.0 으로 주저앉아** 연봉 항이 OVR 항의
 * 수백~수천 배가 되고 판정이 연봉 하나로 포화된다.
 *
 * 엔진에 직접 물어본 값(고치기 전):
 *
 * ```
 *   OVR 80(연봉 5000) 주고 → OVR 60(연봉 3000) 받기   수락확률 0.950  수락
 *   OVR 60(연봉 3000) 주고 → OVR 80(연봉 5000) 받기   수락확률 0.050  거절
 * ```
 *
 * "부자 구단이 연봉을 떠안는 트레이드가 안 나온다"가 아니라
 * **판정이 통째로 거꾸로 서 있었다.**
 *
 * ## ⚠ 고칠 곳이 둘이었다
 *
 * ```
 *   TS   market.ts   박힌 30억 → 실제 예산 (여기서 보는 것)
 *   Rust team_engine `TRADE_FLEX_FLOOR` — 분모가 주저앉는 걸 막는다
 *        (동작 검사는 `team_engine.rs` 의 rust 테스트 3건)
 * ```
 *
 * TS 쪽은 Rust 검사가 못 본다 — 넘기는 값이 바뀌었는지는 여기서 본다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

type TeamRow = { id: string; leagueId?: string; history?: { budget?: number } };

describe("트레이드 예산 배선", () => {
  const M = read("apps/ui/src/shared/usecases/weekPhases/market.ts");
  const refs = JSON.parse(read("resource/data/master/entities/refs.json")) as
    | TeamRow[]
    | { teams?: TeamRow[]; clubs?: TeamRow[] };
  const teams: TeamRow[] = Array.isArray(refs)
    ? refs
    : (refs.teams ?? refs.clubs ?? []);

  /**
   * 🔴 **이 검사가 근거다.** 박힌 30억이 왜 틀렸는지는 데이터가 말한다 —
   *   프로 1군 예산이 하나도 빠짐없이 30억보다 크다.
   */
  it("프로 1군 예산이 전부 예전 박힌 값보다 크다", () => {
    const OLD = 300000;                       // 만원 단위 = 30억
    const pro = teams.filter((t) =>
      (t.leagueId === "LEAGUE_KBL" || t.leagueId === "LEAGUE_ABL" || t.leagueId === "LEAGUE_JBL")
      && (t.history?.budget ?? 0) > 0);
    expect(pro.length).toBeGreaterThan(0);
    const won = pro.map((t) => Math.round((t.history!.budget as number) / 10000));
    expect(Math.min(...won)).toBeGreaterThan(OLD);
  });

  /** 두 호출부가 **같은 팀의 같은 값**을 봐야 한다 — 한쪽만 고치면 안 잡힌다 */
  it("두 호출부에서 박힌 상한이 사라졌다", () => {
    expect(M).not.toContain("salaryCap: 300000,");
    expect(M).toContain("salaryCap: budgetCapOf(team.id),");
    expect(M).toContain(
      "salaryCap: teamWithRosters.find((t) => t.teamId === proposal.receivingTeamId)?.salaryCap");
  });

  /**
   * ⚠ **값의 출처가 `clubFinance.ts` 와 같아야 한다.** 표를 두 번 적으면
   *   한쪽만 갱신된 채로 남는다 — 이 프로젝트에서 반복해 본 형태다.
   */
  it("예산을 저장본 → refs 순으로 읽고 원을 만원으로 바꾼다", () => {
    expect(M).toContain("const saved = g.clubBudgets?.[teamId];");
    expect(M).toContain("history?.budget ?? 0");
    expect(M).toContain("Math.round(raw / 10000)");
    const F = read("apps/ui/src/shared/usecases/clubFinance.ts");
    // 같은 규칙을 쓰는지 — 저쪽도 저장본 우선 · 원→만원이다
    expect(F).toContain("g.clubBudgets?.[teamId]");
    expect(F).toContain("history?.budget ?? 0) / 10000");
  });

  /**
   * 🔴 **예산이 0인 팀은 예전 값으로 떨어져야 한다.** 상한이 0이면
   *   `flex` 가 다시 음수가 되어 고친 자리로 돌아간다.
   */
  it("예산이 없는 팀에는 폴백이 있다", () => {
    expect(M).toContain("const FALLBACK_SALARY_CAP = 300000;");
    expect(M).toContain("return won > 0 ? won : FALLBACK_SALARY_CAP;");
  });

  /** Rust 하한이 실제로 있는지 — 둘 중 하나만 있으면 반쪽이다 */
  it("Rust 쪽 여유 하한이 걸려 있다", () => {
    const T = read("packages/engine-native/src/team_engine.rs");
    expect(T).toContain("const TRADE_FLEX_FLOOR: f64 = 0.05;");
    expect(T).toContain(".max(TRADE_FLEX_FLOOR);");
  });
});
