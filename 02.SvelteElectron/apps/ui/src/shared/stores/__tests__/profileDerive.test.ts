import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveProfileFromBudgetIndex } from "../game";

/**
 * 구단 성향을 예산 지수에서 유도한다 — **KBL 20팀은 성향 데이터가 없다.**
 *
 * 손으로 만든 값이 `teams/pro_korea/*.json`에 있지만 구 데이터다. seeds로
 * 국내 팀을 통째 교체하면서 팀 자체가 바뀌었다(부산 자이언트웨일스 →
 * 부산 웨이브스). 그래서 복구가 아니라 유도다.
 */
describe("예산 지수 → 구단 성향", () => {
  it("리그 평균(지수 1.0)이면 기본값과 같다 — 기준점", () => {
    const p = deriveProfileFromBudgetIndex(1.0);
    for (const [k, v] of Object.entries(p)) expect(v, k).toBe(50);
  });

  it("부자 구단은 돈을 쓰고 지금 이기려 한다", () => {
    const rich = deriveProfileFromBudgetIndex(1.5);
    expect(rich.ownerSpendingWillingness).toBeGreaterThan(50);
    expect(rich.winNowPressure).toBeGreaterThan(50);
    expect(rich.prestige).toBeGreaterThan(50);
  });

  it("⚠ 부자 구단은 **육성과 인내가 낮다** — 방향이 반대인 항목", () => {
    // 여기가 뒤집히면 가난한 팀이 육성을 안 하게 되어 2군이 마른다
    const rich = deriveProfileFromBudgetIndex(1.5);
    expect(rich.developmentFocus).toBeLessThan(50);
    expect(rich.farmInvestment).toBeLessThan(50);
    expect(rich.ownerPatience).toBeLessThan(50);
  });

  it("가난한 구단은 정확히 반대다", () => {
    const poor = deriveProfileFromBudgetIndex(0.5);
    expect(poor.ownerSpendingWillingness).toBeLessThan(50);
    expect(poor.winNowPressure).toBeLessThan(50);
    expect(poor.developmentFocus).toBeGreaterThan(50);
    expect(poor.ownerPatience).toBeGreaterThan(50);
  });

  it("⚠ 극단값이 5~95를 안 벗어난다 — 0이나 100이면 성향이 사라진다", () => {
    for (const idx of [0, 0.01, 5, 100]) {
      const p = deriveProfileFromBudgetIndex(idx);
      for (const [k, v] of Object.entries(p)) {
        expect(v, `${k} @ 지수 ${idx}`).toBeGreaterThanOrEqual(5);
        expect(v, `${k} @ 지수 ${idx}`).toBeLessThanOrEqual(95);
      }
    }
  });

  /**
   * 🔴 **성향이 없으면 기질 셋은 50이다** — 예전 그대로. 해외 28팀이 아직
   *   여기에 해당한다(B 가 채우는 중).
   */
  it("성향을 안 넘기면 기질 셋이 50이다 — 대조군", () => {
    for (const idx of [0.5, 1.0, 1.5]) {
      const p = deriveProfileFromBudgetIndex(idx);
      expect(p.stability, "stability").toBe(50);
      expect(p.discipline, "discipline").toBe(50);
      expect(p.clubhouseCulture, "clubhouseCulture").toBe(50);
    }
  });
});

/**
 * 기질 세 축 — **예산이 아니라 철학·자원이 정한다** (2026-09-22).
 *
 * 🔴 예전엔 셋 다 50 고정이라 Rust 갈래 여섯이 죽어 있었다
 *   (`team_engine.rs` 의 `stability > 70`·`< 35`·`discipline > 70` 과
 *   `player_engine.rs` 둘). 예산으로는 못 정한다 — 돈이 많다고 규율이 서지 않는다.
 */
describe("성향 → 구단 기질", () => {
  const ROOT = resolve(__dirname, "../../../../../..");
  const refs = JSON.parse(
    readFileSync(resolve(ROOT, "resource/data/master/entities/refs.json"), "utf8"),
  ) as {
    teams: {
      leagueId: string;
      id: string;
      history?: { budget?: number };
      traits?: { philosophy?: string; resource?: string };
    }[];
  };

  /** 예산은 고정하고 성향만 움직인다 — 두 변수를 같이 움직이면 원인을 못 가린다 */
  const at1 = (traits?: { philosophy?: string; resource?: string }) =>
    deriveProfileFromBudgetIndex(1.0, traits);

  it("예산 아홉 항목은 성향이 붙어도 그대로다 — 대조군", () => {
    const plain = at1();
    const withTraits = at1({ philosophy: "스파르타(혹독훈련)", resource: "궁핍" });
    for (const k of [
      "ownerSpendingWillingness",
      "prestige",
      "marketAppeal",
      "scoutingQuality",
      "medicalQuality",
      "developmentFocus",
      "farmInvestment",
      "winNowPressure",
      "ownerPatience",
    ] as const) {
      expect(withTraits[k], k).toBe(plain[k]);
    }
  });

  it("철학이 방향을 정한다 — 전통은 안정, 젊은피는 불안정", () => {
    expect(at1({ philosophy: "전통/정통" }).stability).toBeGreaterThan(50);
    expect(at1({ philosophy: "젊은피(세대교체)" }).stability).toBeLessThan(50);
    expect(at1({ philosophy: "스파르타(혹독훈련)" }).discipline).toBeGreaterThan(50);
    // 🔴 혹독한 훈련은 규율을 세우고 **분위기를 누른다** — 한 방향이 아니다
    expect(at1({ philosophy: "스파르타(혹독훈련)" }).clubhouseCulture).toBeLessThan(50);
    expect(at1({ philosophy: "공격야구(화력)" }).discipline).toBeLessThan(50);
  });

  it("자원이 폭을 좁게 민다 — 예산 축을 두 번 곱하지 않는다", () => {
    const rich = at1({ philosophy: "전통/정통", resource: "부유" }).stability;
    const poor = at1({ philosophy: "전통/정통", resource: "궁핍" }).stability;
    expect(rich).toBeGreaterThan(poor);
    // 자원만으로 움직이는 폭이 철학보다 작아야 한다
    const byResource = Math.abs(
      at1({ resource: "부유" }).stability - at1({ resource: "궁핍" }).stability,
    );
    const byPhilosophy = Math.abs(
      at1({ philosophy: "전통/정통" }).stability -
        at1({ philosophy: "젊은피(세대교체)" }).stability,
    );
    expect(byResource).toBeLessThan(byPhilosophy);
  });

  /**
   * ⚠ 손수 적힌 ABL 값과 **같은 칸**에 있어야 리그끼리 비교가 된다.
   *   범위를 소스에서 읽지 않고 여기 적는 이유는, 이 숫자 자체가 지켜야 할
   *   약속이기 때문이다(값을 바꾸면 이 검사가 깨지는 것이 맞다).
   */
  it("기질이 30~72 를 안 벗어난다", () => {
    const names = Object.keys(
      Object.fromEntries(
        refs.teams.filter((t) => t.traits?.philosophy).map((t) => [t.traits!.philosophy!, 1]),
      ),
    );
    const resources = Object.keys(
      Object.fromEntries(
        refs.teams.filter((t) => t.traits?.resource).map((t) => [t.traits!.resource!, 1]),
      ),
    );
    for (const philosophy of names) {
      for (const resource of resources) {
        const p = deriveProfileFromBudgetIndex(1.0, { philosophy, resource });
        for (const k of ["stability", "discipline", "clubhouseCulture"] as const) {
          expect(p[k], `${philosophy}/${resource}.${k}`).toBeGreaterThanOrEqual(30);
          expect(p[k], `${philosophy}/${resource}.${k}`).toBeLessThanOrEqual(72);
        }
      }
    }
  });

  /**
   * 🔴 **표에 없는 철학은 조용히 0을 더한다.** 그러면 새 철학이 들어와도
   *   아무 일이 안 일어난다 — 이 저장소의 되풀이 결함이다. 그래서
   *   데이터에 실제로 쓰이는 값이 전부 표에 있는지 여기서 센다.
   */
  it("데이터에 쓰이는 철학·자원이 전부 표에 있다", () => {
    const base = at1();
    const badPhi: string[] = [];
    const badRes: string[] = [];
    for (const t of refs.teams) {
      const ph = t.traits?.philosophy;
      const rs = t.traits?.resource;
      if (ph && JSON.stringify(at1({ philosophy: ph })) === JSON.stringify(base)) badPhi.push(ph);
      if (rs && JSON.stringify(at1({ resource: rs })) === JSON.stringify(base)) badRes.push(rs);
    }
    expect([...new Set(badPhi)], "표에 없는 철학").toEqual([]);
    expect([...new Set(badRes)], "표에 없는 자원").toEqual([]);
  });

  /**
   * 🔴 **갈래가 실제로 살아나는가.** 값을 넣어도 문턱을 아무도 안 넘으면
   *   고치기 전과 같다 — 0단계가 `discipline > 70` 0팀을 그렇게 찾아냈다.
   */
  it("KBL 10팀에서 Rust 문턱이 실제로 갈린다", () => {
    const kbl = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
    expect(kbl.length).toBe(10);
    const avg = kbl.reduce((a, t) => a + (t.history?.budget ?? 0), 0) / kbl.length;
    const profiles = kbl.map((t) =>
      deriveProfileFromBudgetIndex((t.history?.budget ?? 0) / avg, t.traits),
    );

    // 예전엔 전 팀이 50이라 아래 넷이 전부 0팀이었다
    expect(profiles.filter((p) => p.stability > 70).length, "stability > 70").toBeGreaterThan(0);
    expect(profiles.filter((p) => p.stability > 60).length, "stability > 60").toBeGreaterThan(0);
    expect(profiles.filter((p) => p.stability < 40).length, "stability < 40").toBeGreaterThan(0);
    expect(profiles.filter((p) => p.stability < 35).length, "stability < 35").toBeGreaterThan(0);

    // ⚠ **`discipline > 70` 은 KBL 에서 여전히 0팀이다 — 데이터 사실이다.**
    //   문턱을 넘기는 철학은 「스파르타(혹독훈련)」뿐이고 KBL 10팀에 없다.
    //   표를 억지로 올리면 "규율이 센 구단"이 뜻을 잃는다. 해외 28팀에
    //   스파르타가 들어오면 그때 살아난다.
    expect(profiles.filter((p) => p.discipline > 70).length).toBe(0);
    expect(
      deriveProfileFromBudgetIndex(1.0, { philosophy: "스파르타(혹독훈련)", resource: "알뜰" })
        .discipline,
    ).toBeGreaterThan(70);
  });
});
