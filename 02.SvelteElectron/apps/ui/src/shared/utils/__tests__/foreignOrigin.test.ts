import { describe, it, expect } from "vitest";
import {
  originRulesOf,
  pickForeigners,
  originLabel,
  NO_ORIGIN,
  type Candidate,
} from "../foreignOrigin";

const RULES = {
  weights: { LEAGUE_ABL_FARM: 85, LEAGUE_ABL: 10, LEAGUE_JBL: 5 },
  returnLeague: "LEAGUE_ABL_FARM",
};

const cand = (npcId: string, league: string, o: Partial<Candidate> = {}): Candidate => ({
  npcId,
  league,
  ovr: 75,
  age: 28,
  playerType: "batter",
  ...o,
});

/** 재현 가능한 난수 — 분포를 재려면 시드가 있어야 한다 */
function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

describe("규칙 읽기", () => {
  it("규칙이 없으면 비어 있다 — 이적을 안 하고 생성으로 떨어진다", () => {
    expect(originRulesOf(null)).toEqual(NO_ORIGIN);
    expect(originRulesOf({})).toEqual(NO_ORIGIN);
    expect(originRulesOf({ origin: { weights: {} } })).toEqual(NO_ORIGIN);
  });

  it("규칙 파일 모양을 그대로 읽는다", () => {
    const r = originRulesOf({ origin: RULES });
    expect(r.weights.LEAGUE_ABL_FARM).toBe(85);
    expect(r.returnLeague).toBe("LEAGUE_ABL_FARM");
  });
});

describe("뽑기", () => {
  const many = [
    ...Array.from({ length: 200 }, (_, i) =>
      cand(`F${i}`, "LEAGUE_ABL_FARM", { playerType: i % 2 ? "pitcher" : "batter" }),
    ),
    ...Array.from({ length: 200 }, (_, i) =>
      cand(`M${i}`, "LEAGUE_ABL", { playerType: i % 2 ? "pitcher" : "batter" }),
    ),
    ...Array.from({ length: 200 }, (_, i) =>
      cand(`J${i}`, "LEAGUE_JBL", { playerType: i % 2 ? "pitcher" : "batter" }),
    ),
  ];

  it("⚠ 마이너 출신이 대부분이다 — 메이저는 잘 안 온다", () => {
    const rand = seeded(42);
    const by: Record<string, number> = {};
    for (let t = 0; t < 300; t++) {
      for (const c of pickForeigners({
        candidates: many,
        rules: RULES,
        pitchers: 1,
        batters: 0,
        rand,
      })) {
        by[c.league] = (by[c.league] ?? 0) + 1;
      }
    }
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    expect(total).toBe(300);
    // 85/10/5를 정확히 강제하지 않는다 — 방향만 본다
    expect(by.LEAGUE_ABL_FARM / total).toBeGreaterThan(0.7);
    expect(by.LEAGUE_ABL / total).toBeLessThan(0.25);
    expect((by.LEAGUE_JBL ?? 0) / total).toBeLessThan(0.2);
  });

  it("보직 수를 지킨다", () => {
    const got = pickForeigners({
      candidates: many,
      rules: RULES,
      pitchers: 2,
      batters: 1,
      rand: seeded(7),
    });
    expect(got).toHaveLength(3);
    expect(got.filter((c) => c.playerType === "pitcher")).toHaveLength(2);
  });

  it("같은 사람을 두 번 안 뽑는다", () => {
    const got = pickForeigners({
      candidates: many,
      rules: RULES,
      pitchers: 5,
      batters: 5,
      rand: seeded(3),
    });
    expect(new Set(got.map((c) => c.npcId)).size).toBe(got.length);
  });

  it("⚠ 후보가 마르면 멈춘다 — 없는 사람을 지어내지 않는다", () => {
    const got = pickForeigners({
      candidates: [cand("A", "LEAGUE_ABL_FARM")],
      rules: RULES,
      pitchers: 0,
      batters: 3,
      rand: seeded(1),
    });
    expect(got).toHaveLength(1);
  });

  it("⚠ 가중치 리그가 마르면 다음 리그로 넘어간다 — 슬롯을 비우지 않는다", () => {
    // ABL_FARM에 한 명뿐인데 셋이 필요하다
    const got = pickForeigners({
      candidates: [cand("A", "LEAGUE_ABL_FARM"), cand("B", "LEAGUE_ABL"), cand("C", "LEAGUE_ABL")],
      rules: RULES,
      pitchers: 0,
      batters: 3,
      rand: seeded(9),
    });
    expect(got).toHaveLength(3);
  });

  it("가중치에 없는 리그는 후보가 아니다 — 국내 선수를 용병으로 만들지 않는다", () => {
    const got = pickForeigners({
      candidates: [cand("K", "LEAGUE_KBL"), cand("U", "LEAGUE_UNIVERSITY")],
      rules: RULES,
      pitchers: 0,
      batters: 2,
      rand: seeded(5),
    });
    expect(got).toEqual([]);
  });

  it("같은 리그 안에서는 능력치 높은 순", () => {
    const got = pickForeigners({
      candidates: [
        cand("lo", "LEAGUE_ABL_FARM", { ovr: 68 }),
        cand("hi", "LEAGUE_ABL_FARM", { ovr: 90 }),
      ],
      rules: RULES,
      pitchers: 0,
      batters: 1,
      rand: seeded(2),
    });
    expect(got[0].npcId).toBe("hi");
  });
});

describe("출신 라벨", () => {
  it("마이너·메이저를 구분한다 — 이게 이 작업의 요점이다", () => {
    expect(originLabel("LEAGUE_ABL_FARM")).toBe("마이너");
    expect(originLabel("LEAGUE_ABL")).toBe("메이저");
    expect(originLabel("LEAGUE_JBL")).toBe("일본");
    expect(originLabel("LEAGUE_UNKNOWN")).toBe("해외");
  });
});
