import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **타자 주인공의 계약 평가가 숫자가 아니었다** (2026-09-01 · 트랙 C 가 잡았다).
 *
 * ## 🔴 무엇이 깨져 있었나
 *
 * 엔진 `SeasonStats` 의 네 칸(`ip` · `era` · `whip` · `k`)이 **전부 필수**라
 * 타자의 `BatterSeasonStats` 를 넘기면 **역직렬화 자체가 실패**했다:
 *
 * ```
 *   투수 → 85
 *   타자 → {"error":"missing field `ip`"}      ← 실측
 * ```
 *
 * 호출부는 그걸 `JSON.parse(raw) as number` 로 받는다 — **객체가 된다.**
 *
 * ⚠ `s.ip <= 0.0 → 50` 가드는 **역직렬화가 성공했을 때만** 걸린다.
 *   타자는 거기까지 못 갔다.
 *
 * ## ⚠ 표시만의 문제가 아니었다
 *
 * 같은 구조체를 `calc_offered_salary_for_protagonist` 도 쓴다 —
 * **타자 주인공은 계약 제시액 자체가 객체**였다. 실측:
 *
 * ```
 *   제시액  투수 → 20144      타자 → {"error": …}
 * ```
 *
 * 게다가 호출부가 타자에게도 `pitchingOvr` 를 넘기고 있었다
 * (`protagonist.pitching.ovr`) — 타자에게 그 값은 뜻이 없다.
 *
 * ## ⚠ 가드가 **두 자리**였다
 *
 * `calc_offered_salary_for_protagonist` 만 고치고 `calc_season_rating` 을
 * 못 봐서, 제시액은 타자를 반영하는데 **화면 평점만 50 으로 굳어 있었다**.
 * 같은 판정이 두 곳에 있으면 반드시 한쪽만 고쳐진다 — 실제로 그랬다.
 *
 * ## 산식은 새로 만들지 않았다
 *
 * NPC 전체를 평가하는 `calcNpcPerfScore`(`market.ts`)의 타자식을 그대로
 * 옮겼다 — OPS 기준선 .700 · 폭 180 · 출전 15점 · 가중 0.85/0.15.
 * 주인공만 다른 잣대로 재면 "재계약은 잘했다는데 방출 후보"가 나온다.
 *
 * 실측(고친 뒤):
 *
 * ```
 *   OPS .600 → 29    .700 → 45    .780 → 57    .900 → 75    1.000 → 83
 *   표본 얇음(ab<30) → 50        투수(ERA 3.2) → 85 (안 바뀌었다)
 * ```
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("타자 주인공 계약", () => {
  const P = read("packages/engine-native/src/player_engine.rs");

  /** 🔴 필수 칸이 하나라도 남으면 타자가 또 역직렬화에서 죽는다 */
  it("엔진 성적 구조체가 투수·타자를 같이 받는다", () => {
    expect(P).toContain("#[serde(default)] pub ip: f64,");
    expect(P).toContain("#[serde(default)] pub ab: f64,");
    expect(P).toContain("#[serde(default)] pub ops: f64,");
    expect(P).toContain("#[serde(default)] pub g: f64,");
  });

  /**
   * ⚠ **가드가 두 자리였다.** 둘 다 없어야 타자가 안쪽 산식까지 간다 —
   *   하나만 남으면 그쪽 경로만 조용히 50 으로 굳는다.
   */
  it("ip 가드 두 자리가 모두 사라졌다", () => {
    expect(P).not.toContain("Some(s) if s.ip <= 0.0 => 50,");
    expect(P).not.toContain("Some(s) if s.ip <= 0.0 => 50.0,");
  });

  /** 타자식이 NPC 정본과 같은 계수여야 한다 — 표를 두 번 적되 값은 맞춘다 */
  it("타자식이 calcNpcPerfScore 와 같은 계수다", () => {
    expect(P).toContain("(50.0 + (s.ops - 0.700) * 180.0).max(10.0).min(95.0)");
    expect(P).toContain("((s.g / 130.0) * 15.0).min(15.0)");
    expect(P).toContain("ops_pts * 0.85 + games_pts * 0.15");
    // NPC 쪽 정본이 바뀌면 여기도 바꿔야 한다 — 그걸 알아채게 묶어 둔다
    const M = read("apps/ui/src/shared/usecases/weekPhases/market.ts");
    expect(M).toContain("50 + (finiteOr(stats.ops, 0.7) - 0.700) * 180");
    expect(M).toContain("Math.round(opsPts * 0.85 + gamesPts * 0.15)");
  });

  /** 타자에게 투수 OVR 을 넘기면 제시액이 통째로 어긋난다 */
  it("타자면 타격 OVR 을 넘긴다", () => {
    expect(P).toContain("pub batting_ovr: Option<f64>,");
    expect(P).toContain("let ovr = params.batting_ovr.unwrap_or(params.pitching_ovr);");
    const S = read("apps/ui/src/shared/utils/salaryEngine.ts");
    expect(S).toContain("const isBatter = protagonist.playerType !== \"pitcher\";");
    expect(S).toContain("battingOvr:    isBatter ? (protagonist.batting?.ovr ?? undefined) : undefined,");
  });

  /** TS 시그니처가 좁으면 호출부가 캐스팅으로 우회하고 결함이 되살아난다 */
  it("TS 시그니처가 타자를 받는다", () => {
    const S = read("apps/ui/src/shared/utils/salaryEngine.ts");
    expect(S).toContain("stats: PitcherSeasonStats | BatterSeasonStats | null,");
    expect(S).toContain("seasonStats: PitcherSeasonStats | BatterSeasonStats | null,");
  });
});
