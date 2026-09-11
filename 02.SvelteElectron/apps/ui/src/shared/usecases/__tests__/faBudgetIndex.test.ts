import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **FA 입찰의 예산 지수는 리그 안에서 잰다.**
 *
 * 🔴 예전엔 세 리그를 **합친 평균**으로 나눴다. 해외가 닫혀 있을 땐 리그가
 *   하나뿐이라 같은 뜻이었는데, 열자마자 **KBL FA 계약이 0건**이 됐다 —
 *   실측 12시즌 × 6회, 한 건도 없다. 매년 60명이 신청하는데 아무도 안 남았다.
 *
 *   `refs.json` 실측 (1군 팀 예산):
 *       KBL 10팀 평균   233억  (120억 ~ 350억)
 *       JBL 12팀 평균   997억  (4.3배)
 *       ABL 16팀 평균 1,972억  (8.5배)
 *
 *   합친 평균이 1,206억이라 KBL 지수가 0.19다. 입찰식(`free_agency.rs`)이
 *   **예산 지수 하나로만** 갈리므로 KBL 최강팀이 ABL 최약팀과 겨우 붙는다.
 *
 * ⚠ **리그 격차를 여기서 표현하지 않는다.** 그건 연봉 배수가 이미 한다
 *   (`salaryRules.leagueMult` ABL 3.5 · JBL 2.0) — 두 자리에서 같은 말을 하면
 *   격차가 두 번 곱해진다.
 *
 * ⚠ 정규식을 안 쓴다 — 이스케이프가 어긋나면 검사가 조용히 헛돈다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const MARKET = read("apps/ui/src/shared/usecases/weekPhases/market.ts");
const REFS = JSON.parse(read("resource/data/master/entities/refs.json")) as {
  teams?: Array<{ id: string; leagueId?: string; history?: { budget?: number } }>;
};

/** 1군 팀 예산을 리그별로 모은다 — 실측의 근거 자체다 */
function budgetsByLeague(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const t of REFS.teams ?? []) {
    const b = t.history?.budget;
    if (!b || !t.leagueId || !t.id.endsWith("_1")) continue;
    (out[t.leagueId] ??= []).push(b);
  }
  return out;
}
const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

describe("FA 예산 지수", () => {
  it("리그별 평균으로 나눈다", () => {
    expect(MARKET.includes("const avgBudget = avgBudgetOf(t.leagueId);")).toBe(true);
    expect(MARKET.includes("budgetByLeague")).toBe(true);
  });

  /**
   * 🔴 **합친 평균을 다시 쓰면 안 된다.** 이 검사가 그 복귀를 막는다 —
   *   `proFirstTeams` 전체를 한 배열로 평균 내는 옛 모양이다.
   */
  it("세 리그를 합쳐 평균 내지 않는다", () => {
    expect(MARKET.includes("proFirstTeams.map((t) => t.history?.budget ?? 0)")).toBe(false);
  });

  /**
   * 🔴 **이 격차가 결함의 근거다.** 데이터가 이렇게 안 벌어져 있으면 이 수정은
   *   뜻이 없다 — 근거가 사라지면 검사도 같이 죽어야 한다.
   */
  it("리그 예산이 실제로 크게 벌어져 있다", () => {
    const b = budgetsByLeague();
    const kbl = avg(b["LEAGUE_KBL"] ?? []);
    const abl = avg(b["LEAGUE_ABL"] ?? []);
    expect(kbl).toBeGreaterThan(0);
    expect(abl / kbl).toBeGreaterThan(4); // 실측 8.5배
  });

  /**
   * ⚠ **리그 안에서 재면 어느 리그든 지수가 1 언저리다.** 그게 이 수정의 요점 —
   *   KBL 부자 구단이 KBL 안에서 부자가 된다.
   */
  it("리그 안에서 재면 세 리그가 같은 눈금에 선다", () => {
    const b = budgetsByLeague();
    for (const lid of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      const v = b[lid] ?? [];
      expect(v.length).toBeGreaterThan(0);
      const m = avg(v);
      const idx = v.map((x) => x / m);
      // 최강팀 지수가 1.0~2.5 안에 든다 — 리그가 달라도 비슷한 폭이다
      expect(Math.max(...idx)).toBeGreaterThan(1.0);
      expect(Math.max(...idx)).toBeLessThan(2.5);
    }
  });

  /** ⚠ 팀이 하나뿐인 리그도 죽지 않아야 한다 */
  it("예산이 없으면 지수 1로 떨어진다", () => {
    expect(
      MARKET.includes("avgBudget > 0 ? (t.history?.budget ?? avgBudget) / avgBudget : 1"),
    ).toBe(true);
  });
});

/**
 * **Rust가 성사시킨 FA 계약도 경력에 남는다.**
 *
 * 🔴 `npc_sim.rs`는 `fa_contract`를 `OffseasonEvent`로만 남겼다 — 화면용이고
 *   한 해가 지나면 사라진다. 그래서 선수 상세 경력에 "FA로 이 팀에 왔다"가
 *   한 번도 안 떴고, 계측도 이 길로 간 계약을 못 셌다.
 */
describe("FA 계약 경력 기록", () => {
  const NPC = read("packages/engine-native/src/npc_sim.rs");

  it("계약이 careerEvents에 남는다", () => {
    expect(NPC.includes('event_type: "fa_signed".into(),')).toBe(true);
    expect(NPC.includes("to_team_id: Some(team.clone()),")).toBe(true);
  });

  /**
   * 🔴 **간 곳을 반드시 채운다.** TS `market.ts`의 관례가
   *   "간 곳이 있으면 계약, 없으면 신청"이다 — 비우면 신청으로 읽힌다.
   */
  it("목적지 리그도 채운다", () => {
    expect(NPC.includes("to_league_id: Some(origin_league.to_string()),")).toBe(true);
  });

  /** ⚠ 화면용 이벤트를 지우지 않았다 — 오프시즌 보고서가 그걸 읽는다 */
  it("화면용 이벤트는 그대로 둔다", () => {
    expect(NPC.includes('ev_to("fa_contract"')).toBe(true);
  });
});
