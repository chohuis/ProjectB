import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeGoldenGlove, type GoldenRules } from "../seasonAwards";
import type { BatterSeasonStats, PlayerSeasonStats } from "../../types/save";

/**
 * **골든글러브** (G-4·G-5 · 2026-08-29 · 사용자 확정값).
 *
 *   ① 가중치   포지션별 차등 (포수·2루·유격 5:5 · 코너외야 8:2)
 *   ② 자격선   프로 minPa 400 / minIp 100 / 수비기회 200 · 대학 80/20/40 · 고교 60/15/30
 *   ③ MVP 셈   **따로** — 넣으면 수상자가 minTitles 2를 쉽게 채워 MVP가 흔해진다
 *   ④ 포지션   **고정 판정** — 엔티티 값 하나
 *
 * ⚠ **지명타자는 별도 추적이 없다.** 규정타석을 채웠는데 **수비 기회가
 *   자격선 미만**인 타자가 곧 DH다 — 수비를 안 나갔다는 뜻이다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const G = JSON.parse(read("resource/data/master/players/generation_rules.json")).awardRules
  .golden as GoldenRules;

const bat = (o: Partial<BatterSeasonStats>): PlayerSeasonStats =>
  ({
    type: "batter",
    g: 140,
    pa: 500,
    ab: 450,
    h: 130,
    hr: 15,
    rbi: 70,
    sb: 5,
    bb: 45,
    k: 80,
    avg: 0.289,
    obp: 0.35,
    slg: 0.45,
    ops: 0.8,
    po: 200,
    a: 100,
    e: 5,
    fpct: 0.984,
    ...o,
  }) as PlayerSeasonStats;

describe("골든글러브 규칙", () => {
  it("10부문이다 (야수 8 + 투수 + 지명타자)", () => {
    expect(G.positions).toHaveLength(8);
    expect(G.dh?.label).toBeTruthy();
    expect(G.pitcher?.label).toBeTruthy();
  });

  it("가중치가 확정값이다", () => {
    const w = Object.fromEntries(G.positions.map((d) => [d.pos, [d.ops, d.fpct]]));
    expect(w.C).toEqual([0.5, 0.5]);
    expect(w["1B"]).toEqual([0.7, 0.3]);
    expect(w.SS).toEqual([0.5, 0.5]);
    expect(w.LF).toEqual([0.8, 0.2]);
    // 합이 1이어야 한다 — 아니면 자리마다 눈금이 다르다
    for (const d of G.positions) expect(d.ops + d.fpct, d.pos).toBeCloseTo(1);
  });

  it("자격선이 리그별로 다르다", () => {
    expect(G.qualify.LEAGUE_KBL).toEqual({ minPa: 400, minIp: 100, minChances: 200 });
    expect(G.qualify.LEAGUE_UNIVERSITY.minPa).toBe(80);
    expect(G.qualify.LEAGUE_HIGHSCHOOL.minPa).toBe(60);
    // ⚠ 2군은 없다
    expect(G.leagues.some((l) => l.includes("FARM"))).toBe(false);
  });
});

describe("골든글러브 판정", () => {
  const posOf = (id: string) => id.split("_")[0];

  it("포지션별로 1위를 뽑는다", () => {
    const stats: Record<string, PlayerSeasonStats> = {
      SS_a: bat({ ops: 0.9, fpct: 0.99, po: 200, a: 300, e: 3 }),
      SS_b: bat({ ops: 0.7, fpct: 0.95, po: 200, a: 300, e: 20 }),
      CF_a: bat({ ops: 0.85, fpct: 0.98, po: 250, a: 20, e: 5 }),
    };
    const w = computeGoldenGlove(G, "LEAGUE_KBL", stats, posOf);
    expect(w.find((x) => x.label.includes("유격수"))?.playerId).toBe("SS_a");
    expect(w.find((x) => x.label.includes("중견수"))?.playerId).toBe("CF_a");
  });

  /** 🔴 수비율만 높고 방망이가 죽은 선수가 코너 외야를 먹으면 안 된다 */
  it("가중치가 실제로 걸린다", () => {
    // 좌익(8:2) — OPS 높은 쪽이 이겨야 한다
    const lf: Record<string, PlayerSeasonStats> = {
      LF_bat: bat({ ops: 1.0, fpct: 0.95, po: 200, a: 10, e: 11 }),
      LF_glv: bat({ ops: 0.7, fpct: 1.0, po: 200, a: 10, e: 0 }),
    };
    expect(
      computeGoldenGlove(G, "LEAGUE_KBL", lf, posOf).find((x) => x.label.includes("좌익수"))
        ?.playerId,
    ).toBe("LF_bat");
    // 포수(5:5) — 수비율 격차가 크면 글러브가 이긴다
    //
    // ⚠ **표본이 둘뿐이면 5:5는 항상 동점이다.** 정규화가 각 축을 0/1로
    //   벌리기 때문이다(0.5 대 0.5). 눈금을 만들 제3자를 둔다 —
    //   처음에 둘로 짰다가 걸렸다.
    const c: Record<string, PlayerSeasonStats> = {
      C_bat: bat({ ops: 0.9, fpct: 0.97, po: 400, a: 40, e: 14 }),
      C_glv: bat({ ops: 0.86, fpct: 1.0, po: 400, a: 40, e: 0 }),
      C_mid: bat({ ops: 0.6, fpct: 0.96, po: 400, a: 40, e: 19 }),
    };
    expect(
      computeGoldenGlove(G, "LEAGUE_KBL", c, posOf).find((x) => x.label.includes("포수"))?.playerId,
    ).toBe("C_glv");
  });

  /** 🔴 하한이 없으면 기회 1인 선수가 1.000으로 1위가 된다 */
  it("수비 기회가 모자라면 야수 부문에서 뺀다", () => {
    const stats: Record<string, PlayerSeasonStats> = {
      SS_real: bat({ ops: 0.8, fpct: 0.97, po: 200, a: 300, e: 15 }),
      SS_tiny: bat({ ops: 0.8, fpct: 1.0, po: 1, a: 0, e: 0 }),
    };
    expect(
      computeGoldenGlove(G, "LEAGUE_KBL", stats, posOf).find((x) => x.label.includes("유격수"))
        ?.playerId,
    ).toBe("SS_real");
  });

  /** ⚠ 규정타석은 채웠는데 수비를 안 나간 사람이 곧 DH다 */
  it("지명타자를 별도 추적 없이 뽑는다", () => {
    const stats: Record<string, PlayerSeasonStats> = {
      SS_x: bat({ ops: 0.8, po: 200, a: 300, e: 10 }),
      "1B_dh": bat({ ops: 1.05, po: 3, a: 1, e: 0 }), // 수비 기회 4 → DH
    };
    const w = computeGoldenGlove(G, "LEAGUE_KBL", stats, posOf);
    expect(w.find((x) => x.label.includes("지명타자"))?.playerId).toBe("1B_dh");
    // 수비 부문엔 안 든다
    expect(w.find((x) => x.label.includes("1루수"))).toBeUndefined();
  });

  it("규정타석 미달은 아예 후보가 아니다", () => {
    const stats: Record<string, PlayerSeasonStats> = {
      SS_x: bat({ pa: 100, ops: 2.0, po: 300, a: 300, e: 0 }),
    };
    expect(computeGoldenGlove(G, "LEAGUE_KBL", stats, posOf)).toHaveLength(0);
  });

  it("투수는 규정이닝 ERA 1위다", () => {
    const stats: Record<string, PlayerSeasonStats> = {
      P_a: {
        type: "pitcher",
        g: 30,
        gs: 30,
        w: 15,
        l: 5,
        sv: 0,
        hd: 0,
        ip: 180,
        er: 40,
        h: 150,
        k: 160,
        bb: 40,
        era: 2.0,
        whip: 1.05,
      } as PlayerSeasonStats,
      P_b: {
        type: "pitcher",
        g: 30,
        gs: 30,
        w: 10,
        l: 10,
        sv: 0,
        hd: 0,
        ip: 180,
        er: 70,
        h: 180,
        k: 120,
        bb: 50,
        era: 3.5,
        whip: 1.28,
      } as PlayerSeasonStats,
      P_short: {
        type: "pitcher",
        g: 5,
        gs: 5,
        w: 3,
        l: 0,
        sv: 0,
        hd: 0,
        ip: 30,
        er: 2,
        h: 15,
        k: 40,
        bb: 5,
        era: 0.6,
        whip: 0.67,
      } as PlayerSeasonStats,
    };
    expect(
      computeGoldenGlove(G, "LEAGUE_KBL", stats, posOf).find((x) => x.label.includes("투수"))
        ?.playerId,
    ).toBe("P_a");
  });
});

describe("골든글러브 배선", () => {
  const SA = read("apps/ui/src/shared/usecases/seasonAwards.ts");

  /** 🔴 MVP 셈에 넣으면 MVP가 흔해진다 */
  it("MVP 부문 수에 안 들어간다", () => {
    const at = SA.indexOf("if (rules.golden");
    const body = SA.slice(at, SA.indexOf("// MVP —", at));
    expect(body.includes("inLeague.set")).toBe(false);
  });

  /** ⚠ 포지션은 고정 판정 — 한 번만 만든다 */
  it("포지션 표를 리그마다 다시 안 만든다", () => {
    expect(SA).toContain("const posOf = new Map<string, string>();");
    expect(SA.split("const posOf = new Map").length - 1).toBe(1);
  });

  /** 🔴 실제 포수 자살은 대부분 삼진 포구다 — 안 세면 포수가 자격을 못 채운다 */
  it("삼진을 포수 자살로 센다", () => {
    const ME = read("packages/engine-native/src/match_engine.rs");
    expect(ME).toContain(
      "matches!(result_code, PitchResultCode::StrikeoutSwing | PitchResultCode::StrikeoutLook)",
    );
    expect(ME).toContain("f.position == FieldPosition::C");
  });
});
