import { describe, it, expect } from "vitest";
import {
  buildForeignSeed,
  pickOriginLeague,
  SIGNING_SPREAD,
  type SeedPlayer,
} from "../foreignSeed";

const RULES = {
  weights: { LEAGUE_ABL_FARM: 85, LEAGUE_ABL: 10, LEAGUE_JBL: 5 },
  returnLeague: "LEAGUE_ABL_FARM",
};

function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const pl = (npcId: string, svc = 0): SeedPlayer => ({
  npcId,
  name: `p${npcId}`,
  teamId: "TEAM_KBL_A_1",
  proServiceYears: svc,
});

describe("출신 리그 뽑기", () => {
  it("가중치를 따른다", () => {
    expect(pickOriginLeague(RULES, 0.0)).toBe("LEAGUE_ABL_FARM");
    expect(pickOriginLeague(RULES, 0.99)).toBe("LEAGUE_JBL");
  });

  it("규칙이 비면 null — 아무것도 안 만든다", () => {
    expect(pickOriginLeague({ weights: {}, returnLeague: "" }, 0.5)).toBeNull();
  });
});

describe("영입 시드", () => {
  it("⚠ 팀을 지어내지 않는다 — 리그만 적는다", () => {
    // 새 게임 시점엔 ABL이 아직 없다. 특정 팀을 적으면 그 팀 로스터에 없는
    // 사람이 그 팀 출신이 된다
    const rows = buildForeignSeed({
      players: [pl("N1")],
      rules: RULES,
      seasonYear: 2026,
      rand: seeded(1),
    });
    expect(rows[0].fromTeamId).toBeNull();
    expect(rows[0].fromLeagueId).toMatch(/^LEAGUE_(ABL|JBL)/);
  });

  it("영입 연도가 흩어진다 — 전원 올해가 아니다", () => {
    const rows = buildForeignSeed({
      players: [pl("A", 0), pl("B", 1), pl("C", 2), pl("D", 5)],
      rules: RULES,
      seasonYear: 2026,
      rand: seeded(3),
    });
    expect(rows.map((r) => r.seasonYear)).toEqual([2026, 2025, 2024, 2024]);
  });

  it(`연차가 커도 ${SIGNING_SPREAD}년 넘게 안 거슬러 간다 — 용병은 단년 계약이다`, () => {
    const rows = buildForeignSeed({
      players: [pl("A", 30)],
      rules: RULES,
      seasonYear: 2026,
      rand: seeded(4),
    });
    expect(rows[0].seasonYear).toBe(2026 - (SIGNING_SPREAD - 1));
  });

  it("한 사람당 한 줄", () => {
    const rows = buildForeignSeed({
      players: [pl("A"), pl("B"), pl("C")],
      rules: RULES,
      seasonYear: 2026,
      rand: seeded(5),
    });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.playerId)).size).toBe(3);
  });

  it("규칙이 없으면 한 줄도 안 만든다", () => {
    expect(
      buildForeignSeed({
        players: [pl("A")],
        rules: { weights: {}, returnLeague: "" },
        seasonYear: 2026,
        rand: seeded(6),
      }),
    ).toEqual([]);
  });
});

describe("떠난 용병", () => {
  const departedNames = [
    { name: "Gone One", teamId: "TEAM_KBL_A_1" },
    { name: "Gone Two", teamId: "TEAM_KBL_B_1" },
  ];

  it("⚠ 기록만 만든다 — 작년 일이라 그 사람은 세계에 없는 게 맞다", () => {
    const rows = buildForeignSeed({
      players: [],
      rules: RULES,
      seasonYear: 2026,
      rand: seeded(7),
      departed: 2,
      departedNames,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].seasonYear).toBe(2025);
    expect(rows[0].category).toBe("release");
    expect(rows[0].detail).toContain("본국 복귀");
    // 떠난 사람은 KBL 팀에서 나간다
    expect(rows[0].fromLeagueId).toBe("LEAGUE_KBL");
    expect(rows[0].toTeamId).toBeNull();
  });

  it("이름이 모자라면 있는 만큼만 — 없는 이름을 지어내지 않는다", () => {
    const rows = buildForeignSeed({
      players: [],
      rules: RULES,
      seasonYear: 2026,
      rand: seeded(8),
      departed: 10,
      departedNames,
    });
    expect(rows).toHaveLength(2);
  });

  it("이름이 없으면 안 만든다", () => {
    expect(
      buildForeignSeed({
        players: [],
        rules: RULES,
        seasonYear: 2026,
        rand: seeded(9),
        departed: 5,
      }),
    ).toEqual([]);
  });

  it("떠난 사람 ID가 실제 선수와 안 겹친다", () => {
    const rows = buildForeignSeed({
      players: [],
      rules: RULES,
      seasonYear: 2026,
      rand: seeded(10),
      departed: 2,
      departedNames,
    });
    for (const r of rows) expect(r.playerId).toMatch(/^PLY_FGN_GONE_/);
  });
});

describe("결정성", () => {
  it("같은 시드면 같은 기록 — 같은 세계를 다시 열면 같아야 한다", () => {
    const make = () =>
      buildForeignSeed({
        players: [pl("A"), pl("B"), pl("C")],
        rules: RULES,
        seasonYear: 2026,
        rand: seeded(42),
      });
    expect(make()).toEqual(make());
  });
});
