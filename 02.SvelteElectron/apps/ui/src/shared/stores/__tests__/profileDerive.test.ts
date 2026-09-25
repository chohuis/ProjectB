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

/**
 * 연혁 → `prestige` 한 칸 (2026-09-25 · 제안값 · `BALANCE_BACKLOG`
 * 「연혁이 `prestige` 에 안 들어간다」).
 *
 * 🔴 파생은 **지금 예산**만 봤다. 그래서 「몰락한 명문」이 무명 팀 아래로
 *   내려갔다 — HARBORHAWKS 는 우승 9회인데 45 로, 우승 2회인
 *   LAKESPIRITS(48) 아래였다.
 */
describe("연혁 → prestige", () => {
  const ROOT = resolve(__dirname, "../../../../../..");
  const refs = JSON.parse(
    readFileSync(resolve(ROOT, "resource/data/master/entities/refs.json"), "utf8"),
  ) as {
    teams: {
      leagueId: string;
      id: string;
      history?: {
        budget?: number;
        foundedYear?: number;
        /** 해외 28팀만 들고 있는 둘째 창단 칸 — 연혁이 맞물리는 쪽이다(§8-4) */
        founded?: number;
        titleYears?: number[];
        nationalTitles?: number;
        peakEra?: string;
        titles?: { season: string; competition: string; result: string }[];
      };
      traits?: { philosophy?: string; resource?: string };
    }[];
  };

  /** 그 리그 1군의 파생 성향 — 연혁을 넘기거나(`on`) 안 넘기거나(`off`) */
  function leagueProfiles(leagueId: string, on: boolean) {
    const list = refs.teams.filter((t) => t.leagueId === leagueId && t.id.endsWith("_1"));
    const avg = list.reduce((a, t) => a + (t.history?.budget ?? 0), 0) / list.length;
    return new Map(
      list.map((t) => [
        t.id,
        deriveProfileFromBudgetIndex(
          (t.history?.budget ?? 0) / avg,
          t.traits,
          on ? t.history : undefined,
        ),
      ]),
    );
  }

  it("연혁을 안 넘기면 예전 그대로다 — 대조군", () => {
    for (const idx of [0.5, 1.0, 1.5]) {
      expect(deriveProfileFromBudgetIndex(idx).prestige).toBe(
        Math.round(Math.max(5, Math.min(95, 50 + (idx - 1) * 40))),
      );
    }
  });

  it("🔴 열한 항목은 연혁에 한 칸도 안 움직인다 — 대조군", () => {
    const hist = { titleYears: [1927, 1936, 1939], nationalTitles: 27, peakEra: "왕조" };
    const plain = deriveProfileFromBudgetIndex(0.8, { philosophy: "전통/정통" });
    const withHist = deriveProfileFromBudgetIndex(0.8, { philosophy: "전통/정통" }, hist);
    for (const [k, v] of Object.entries(plain)) {
      if (k === "prestige") continue;
      expect(withHist[k as keyof typeof withHist], k).toBe(v);
    }
    expect(withHist.prestige).toBeGreaterThan(plain.prestige);
  });

  it("우승이 0 이면 가산도 정확히 0 이다 — 전성기 문구만으로는 안 오른다", () => {
    const only = deriveProfileFromBudgetIndex(1.2, undefined, {
      titleYears: [],
      nationalTitles: 0,
      peakEra: "첫 포스트시즌 진출",
    });
    expect(only.prestige).toBe(deriveProfileFromBudgetIndex(1.2).prestige);
  });

  it("우승이 많을수록 더 오른다 — 뒤집히면 이름값이 뜻을 잃는다", () => {
    const at = (n: number) =>
      deriveProfileFromBudgetIndex(0.8, undefined, { titleYears: [], nationalTitles: n }).prestige;
    expect(at(9)).toBeGreaterThan(at(2));
    expect(at(2)).toBeGreaterThan(at(0));
  });

  /**
   * 🔴 **이게 이 변경의 목적이다.** 「몰락한 명문」 넷이 우승 0 인 팀
   *   아래에 있지 않아야 한다. 잣대는 "같은 예산의 무명 팀" — 같은 지수로
   *   연혁만 뺀 값이다.
   */
  it("몰락한 명문 넷이 같은 예산의 무명 팀 위로 온다", () => {
    const abl = leagueProfiles("LEAGUE_ABL", true);
    const ablOff = leagueProfiles("LEAGUE_ABL", false);
    const jbl = leagueProfiles("LEAGUE_JBL", true);
    const jblOff = leagueProfiles("LEAGUE_JBL", false);
    for (const [id, on, off] of [
      ["TEAM_ABL_WINDBEARS_1", abl, ablOff],
      ["TEAM_ABL_SUNDRAGONS_1", abl, ablOff],
      ["TEAM_ABL_HARBORHAWKS_1", abl, ablOff],
      ["TEAM_JBL_PL_THUNDERFALCONS_1", jbl, jblOff],
    ] as const) {
      expect(on.get(id)!.prestige, `${id} 가 같은 예산의 무명 팀 위`).toBeGreaterThan(
        off.get(id)!.prestige,
      );
    }
    // 실제로 앞질러야 할 상대 — 전에는 밑에 있었다
    expect(abl.get("TEAM_ABL_HARBORHAWKS_1")!.prestige).toBeGreaterThan(
      abl.get("TEAM_ABL_LAKESPIRITS_1")!.prestige,
    );
    expect(ablOff.get("TEAM_ABL_HARBORHAWKS_1")!.prestige).toBeLessThan(
      ablOff.get("TEAM_ABL_LAKESPIRITS_1")!.prestige,
    );
    // JBL — 예산이 75% 더 많은 무관 팀을 넘는다
    expect(jbl.get("TEAM_JBL_PL_THUNDERFALCONS_1")!.prestige).toBeGreaterThan(
      jbl.get("TEAM_JBL_PL_SEAGULLS_1")!.prestige,
    );
  });

  it("부자 명문을 아무도 안 넘는다 — 리그 최고는 그대로다", () => {
    for (const [lg, top] of [
      ["LEAGUE_ABL", "TEAM_ABL_EMPIRE_1"],
      ["LEAGUE_JBL", "TEAM_JBL_CL_NEONCRANES_1"],
    ] as const) {
      const m = leagueProfiles(lg, true);
      const best = Math.max(...[...m.values()].map((p) => p.prestige));
      expect(m.get(top)!.prestige, `${lg} 최고는 ${top}`).toBe(best);
    }
  });

  /**
   * ⚠ **지금 파생 분포 밖으로 나가지 않는다.** 나가면 관중·스폰서 산식이
   *   보는 잣대가 이 변경 전후로 달라진다. 천장 70 은 SEOUL_ROYALS 의
   *   파생값이고, 바닥은 가산이 음수가 안 되므로 그대로다.
   */
  it("프로 38팀이 전부 예전 분포(26~70) 안이다", () => {
    for (const lg of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      const on = [...leagueProfiles(lg, true).values()].map((p) => p.prestige);
      const off = [...leagueProfiles(lg, false).values()].map((p) => p.prestige);
      for (const v of on) {
        expect(v, `${lg} prestige`).toBeLessThanOrEqual(70);
        expect(v, `${lg} prestige`).toBeGreaterThanOrEqual(26);
      }
      // 가산은 0 이상이다 — 연혁이 이름값을 깎지 않는다
      on.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(off[i]));
    }
  });

  /**
   * 🔴 **배선 대조군.** 위 검사들은 전부 순수 함수를 직접 부른다 — 실제
   *   게임이 `history` 를 안 넘기면 전부 초록인 채로 아무 일도 안 일어난다.
   *   이 저장소가 제일 자주 밟은 형태다("층마다 맞는데 잇는 선이 없다").
   *   `profilesFromMaster` 는 export 가 아니라 소스로 본다 —
   *   `proTeamProfilePersist.test.ts` 가 쓰는 방식과 같다.
   */
  it("`profilesFromMaster` 가 연혁을 실제로 넘긴다 — 배선", () => {
    const src = readFileSync(resolve(__dirname, "../game.ts"), "utf8");
    expect(src, "파생 호출부가 세 번째 인자를 안 넘긴다").toContain(
      "(t.history?.budget ?? 0) / avg, t.traits, t.history)",
    );
  });

  /**
   * 🔴 **국내 10팀도 연혁을 들고 있다** (2026-09-25 · 사용자 확정 ·
   *   `PLAN_OVERSEAS_CLUBS_2026-09-22.md` §8). 전에는 이 자리가
   *   "KBL 은 칸이 없어 그대로다"를 못 박고 있었다 — 그때는 데이터 사실이었다.
   *
   * ⚠ 값(우승 횟수)이 아니라 **순서의 뒤집힘**을 못 박는다. 예산이 같아
   *   동률이던 자리가 연혁으로 갈렸다는 것이 이 변경의 요점이고, 우승 횟수를
   *   적으면 데이터를 손볼 때마다 여기도 같이 고쳐야 한다.
   */
  it("KBL 10팀도 연혁을 탄다 — 명문이 동률에서 올라선다", () => {
    const on = leagueProfiles("LEAGUE_KBL", true);
    const off = leagueProfiles("LEAGUE_KBL", false);
    expect(on.size).toBe(10);
    const p = (id: string) => on.get(`TEAM_KBL_${id}_1`)!.prestige;
    const q = (id: string) => off.get(`TEAM_KBL_${id}_1`)!.prestige;

    // 연혁은 이름값을 깎지 않는다
    for (const [id, v] of on) expect(v.prestige, id).toBeGreaterThanOrEqual(off.get(id)!.prestige);

    // ① 명문이 예산 동률이던 중견 셋 위로 올라선다
    expect(q("BUSAN_WAVES")).toBe(q("DAEGU_SABERS"));
    expect(q("BUSAN_WAVES")).toBe(q("SEOUL_COBRAS"));
    expect(p("BUSAN_WAVES")).toBeGreaterThan(p("DAEGU_SABERS"));
    expect(p("BUSAN_WAVES")).toBeGreaterThan(p("SEOUL_COBRAS"));

    // ② 명문·엘리트가 예산 동률이던 신흥 위로 올라선다
    expect(q("GWANGJU_PANTHERS")).toBe(q("SUWON_KNIGHTS"));
    expect(q("SEOUL_GUARDIANS")).toBe(q("SUWON_KNIGHTS"));
    expect(p("GWANGJU_PANTHERS")).toBeGreaterThan(p("SUWON_KNIGHTS"));
    expect(p("SEOUL_GUARDIANS")).toBeGreaterThan(p("SUWON_KNIGHTS"));

    // ③ 천장에 닿아 있던 팀은 안 움직이고, 아무도 그 위로 못 간다
    expect(p("SEOUL_ROYALS")).toBe(q("SEOUL_ROYALS"));
    for (const [id, v] of on)
      expect(v.prestige, `${id} 가 ROYALS 를 넘었다`).toBeLessThanOrEqual(p("SEOUL_ROYALS"));

    // ④ 우승 0 인 팀은 가산이 정확히 0 — "같은 예산의 무관 팀"이 기준선으로 남는다
    expect(p("DAEJEON_PHANTOMS")).toBe(q("DAEJEON_PHANTOMS"));
  });

  /**
   * 🔴 국내 연혁의 **데이터 제약** — `prestige` 식은 길이만 보므로 여기서만 잡힌다.
   *   한 해에 우승 팀은 하나고, 창단 전에는 못 이기고, `titles`(최근 5시즌)에
   *   적힌 우승은 `titleYears` 에도 있어야 한다.
   *
   * ⚠ 국내만 보는 항은 **빈 해 없음**과 **`titles` 조인** 둘이다. 겹침·창단은
   *   해외 두 리그도 아래에서 같이 본다(2026-09-26 · §8-4).
   */
  it("KBL 우승 연도는 겹치지 않고 창단 뒤이며 최근 5시즌과 맞는다", () => {
    const list = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
    expect(list.length).toBe(10);

    const owner = new Map<number, string>();
    for (const t of list) {
      const h = t.history!;
      expect(h.titleYears, `${t.id} titleYears 없음`).toBeDefined();
      expect(h.nationalTitles, `${t.id} nationalTitles 가 길이와 다르다`).toBe(
        h.titleYears!.length,
      );
      for (const y of h.titleYears!) {
        expect(owner.get(y), `${y}년 우승이 둘이다 (${owner.get(y)} · ${t.id})`).toBeUndefined();
        owner.set(y, t.id);
        expect(y, `${t.id} 창단(${h.foundedYear}) 전 우승`).toBeGreaterThanOrEqual(h.foundedYear!);
      }
    }

    // 빈 해가 없다 — 리그 최초 창단부터 직전 시즌까지 매해 하나씩
    const ys = [...owner.keys()].sort((a, b) => a - b);
    for (let y = ys[0]; y <= ys[ys.length - 1]; y++)
      expect(owner.has(y), `${y}년 우승 팀이 없다`).toBe(true);

    // `titles`(S-1 = BASE_SEASON_YEAR - 1 = 2025) 의 우승이 titleYears 에 있다
    const SEASON_YEAR: Record<string, number> = {
      "S-1": 2025,
      "S-2": 2024,
      "S-3": 2023,
      "S-4": 2022,
      "S-5": 2021,
    };
    let checked = 0;
    for (const t of list) {
      for (const x of t.history!.titles ?? []) {
        if (x.result !== "우승") continue;
        expect(owner.get(SEASON_YEAR[x.season]), `${t.id} ${x.season} 우승이 통산에 없다`).toBe(
          t.id,
        );
        checked++;
      }
    }
    expect(checked, "최근 5시즌 우승이 하나도 안 잡혔다 — 잣대가 틀렸다").toBeGreaterThan(0);
  });

  /**
   * 🔴 **같은 제약을 해외 두 리그에도 건다** (2026-09-26 · 사용자 확정 ·
   *   §8-4). 전에는 이 자리에 "해외 28팀은 이 제약을 안 지켜 KBL 만 본다"고
   *   적혀 있었다 — 안 지키는 것이 데이터 결함이었고, 겹침 15건을 정리했다.
   *   **횟수는 한 팀도 안 바꿨다**(아래 파생 불변 검사가 그걸 못 박는다).
   *
   * ⚠ 창단의 기준은 `founded ?? foundedYear` 다. 해외 28팀은 창단 칸을 둘
   *   들고 있고, `titleYears`·`peakEra` 가 맞물리는 쪽은 **`founded`** 다
   *   (실측 2026-09-26: `founded` 기준 창단 전 우승 0건 · `foundedYear` 기준
   *   23팀 위반). 한 칸으로 합치는 것은 화면에 뜨는 값이 바뀌어 사용자 결정
   *   대기다 — 합쳐지면 `founded` 가 없어지고 이 식은 그대로 돈다.
   * ⚠ 해외는 **빈 해가 남는다**(ABL 70회 · JBL 50회로 해 수보다 적다).
   *   국내처럼 "매해 하나"를 걸지 않는다.
   * ⚠ `nationalTitles` 는 길이와 **같거나 크다** — EMPIRE 만 11 vs 27 이다
   *   (옛 우승에 해가 안 적혔다).
   */
  it("해외 두 리그도 한 해 한 팀이고 창단 뒤다", () => {
    for (const [lg, n] of [
      ["LEAGUE_ABL", 16],
      ["LEAGUE_JBL", 12],
    ] as const) {
      const list = refs.teams.filter((t) => t.leagueId === lg && t.id.endsWith("_1"));
      expect(list.length, lg).toBe(n);
      const owner = new Map<number, string>();
      let count = 0;
      for (const t of list) {
        const h = t.history!;
        expect(h.titleYears, `${t.id} titleYears 없음`).toBeDefined();
        expect(h.nationalTitles, `${t.id} nationalTitles 가 길이보다 작다`).toBeGreaterThanOrEqual(
          h.titleYears!.length,
        );
        const born = h.founded ?? h.foundedYear!;
        for (const y of h.titleYears!) {
          expect(
            owner.get(y),
            `${lg} ${y}년 우승이 둘이다 (${owner.get(y)} · ${t.id})`,
          ).toBeUndefined();
          owner.set(y, t.id);
          count++;
          expect(y, `${t.id} 창단(${born}) 전 우승`).toBeGreaterThanOrEqual(born);
          expect(y, `${t.id} 아직 안 온 해 우승`).toBeLessThanOrEqual(2025);
        }
      }
      expect(owner.size, `${lg} 우승 해가 횟수보다 적다 — 겹친다`).toBe(count);
    }
  });

  /**
   * 🔴 **우승 해를 옮겨도 파생값이 한 칸도 안 움직인다.** `prestige` 는
   *   `titleYears` 의 **길이**만 본다 — 09-26 에 해외 15팀의 우승 해를
   *   옮기면서 횟수를 그대로 둔 근거가 이것이고, 여기서 못 박는다.
   *   값(우승 횟수·위신 숫자)을 검사에 베끼지 않는다 — 베끼면 정본이 둘이 된다.
   */
  it("우승 해를 다 바꿔도 프로 38팀 파생값이 그대로다", () => {
    for (const lg of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      const list = refs.teams.filter((t) => t.leagueId === lg && t.id.endsWith("_1"));
      const avg = list.reduce((a, t) => a + (t.history?.budget ?? 0), 0) / list.length;
      for (const t of list) {
        const idx = (t.history?.budget ?? 0) / avg;
        const real = deriveProfileFromBudgetIndex(idx, t.traits, t.history);
        const moved = deriveProfileFromBudgetIndex(idx, t.traits, {
          budget: t.history?.budget,
          foundedYear: t.history?.foundedYear,
          nationalTitles: t.history?.nationalTitles,
          peakEra: t.history?.peakEra,
          titles: t.history?.titles,
          titleYears: (t.history?.titleYears ?? []).map((_, i) => 1900 + i),
        });
        expect(moved, `${t.id}`).toEqual(real);
      }
    }
  });
});
