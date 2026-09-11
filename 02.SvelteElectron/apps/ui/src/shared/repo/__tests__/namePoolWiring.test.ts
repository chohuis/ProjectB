import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRosterParams, type RosterRulesData } from "../newGameV3";

/**
 * 해외 리그 선수 이름이 리그에 맞게 지어지는가.
 *
 * 🔴 **2026-08-21까지 ABL 448명·JBL 336명이 전원 한국 이름이었다.**
 * 국적은 USA/JPN인데 이름은 `강정재/Jung-jae Kang`이었다.
 *
 * 규칙 파일에도 풀이 있었고 Rust도 받을 준비가 돼 있었다. **끊긴 건 배선
 * 한 자리**다 — 새 게임 경로가 `namePool` 인자에 `undefined`를 하드코딩했다.
 * 리그 활성화 경로는 같은 결함을 **자기 자리에서만** 막고 있어서, 한쪽만
 * 보면 "고쳐져 있다"로 읽혔다.
 *
 * ⚠ **이 검사는 값이 아니라 배선을 본다.** 풀의 내용이 아니라 "부르는 쪽이
 * 안 넘겨도 파라미터에 실리는가"를 확인한다 — 그게 실제로 샜던 자리다.
 */

const RULES = JSON.parse(
  readFileSync(
    join(__dirname, "../../../../../../resource/data/master/players/generation_rules.json"),
    "utf8",
  ),
) as { rosterRules: Record<string, RosterRulesData> };

const TEAMS = [{ teamId: "TEAM_X" }, { teamId: "TEAM_Y" }];
const paramsFor = (leagueId: string, override?: Parameters<typeof buildRosterParams>[5]) =>
  buildRosterParams(leagueId, 2026, 1234, TEAMS, RULES.rosterRules[leagueId], override) as {
    namePool?: { western?: boolean; sep?: string; surnames: string[] };
  };

describe("이름 풀 배선", () => {
  it("호출부가 안 넘겨도 규칙 파일의 풀이 실린다 — 이게 샜던 자리다", () => {
    for (const lid of ["LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM"]) {
      expect(paramsFor(lid).namePool, `${lid}에 풀이 안 실렸다`).toBeDefined();
    }
  });

  it("국내 리그는 풀이 없다 — Rust 내장 한국 풀로 떨어져야 한다", () => {
    for (const lid of ["LEAGUE_KBL", "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY"]) {
      expect(paramsFor(lid).namePool, `${lid}에 풀이 붙었다`).toBeUndefined();
    }
  });

  it("ABL은 서양식 · JBL은 일본식(성-이름 띄어쓰기)", () => {
    expect(paramsFor("LEAGUE_ABL").namePool?.western).toBe(true);
    expect(paramsFor("LEAGUE_JBL").namePool?.western).toBe(false);
    expect(paramsFor("LEAGUE_JBL").namePool?.sep).toBe(" ");
  });

  it("인자를 주면 그게 이긴다 (덮어쓰기)", () => {
    const mine = { surnames: ["Zzz"], givenA: ["Aaa"], givenB: [] };
    expect(paramsFor("LEAGUE_ABL", mine).namePool?.surnames).toEqual(["Zzz"]);
  });

  it("대조군 — 배선을 빼면 실패해야 한다", () => {
    // `rules.namePool`을 지운 규칙으로 부르면 풀이 안 실린다.
    // 이게 통과하면 위 검사가 배선이 아니라 다른 걸 보고 있는 것이다
    const stripped = { ...RULES.rosterRules.LEAGUE_ABL, namePool: undefined };
    const p = buildRosterParams("LEAGUE_ABL", 2026, 1234, TEAMS, stripped) as {
      namePool?: unknown;
    };
    expect(p.namePool).toBeUndefined();
  });
});

describe("이름 풀 데이터", () => {
  it("짝 배열의 길이가 같다 — 어긋나면 김씨가 Lee로 나온다", () => {
    const pairs: [string, string, string][] = [
      ["LEAGUE_ABL", "surnames", "surnamesKo"],
      ["LEAGUE_ABL", "givenA", "givenAKo"],
      ["LEAGUE_JBL", "surnames", "surnamesEn"],
      ["LEAGUE_JBL", "givenA", "givenAEn"],
    ];
    for (const [lid, a, b] of pairs) {
      const pool = RULES.rosterRules[lid].namePool as unknown as Record<string, string[]>;
      expect(pool[a].length, `${lid}.${a}`).toBeGreaterThan(0);
      expect(pool[b].length, `${lid}.${b}가 ${a}와 길이가 다르다`).toBe(pool[a].length);
    }
  });

  it("2군은 1군과 같은 풀을 쓴다 — 나고야 2군에 김우찬이 있으면 안 된다", () => {
    for (const [one, farm] of [
      ["LEAGUE_ABL", "LEAGUE_ABL_FARM"],
      ["LEAGUE_JBL", "LEAGUE_JBL_FARM"],
    ]) {
      const a = RULES.rosterRules[one].namePool as unknown as { surnames: string[] };
      const b = RULES.rosterRules[farm].namePool as unknown as { surnames: string[] };
      expect(b.surnames, `${farm}`).toEqual(a.surnames);
    }
  });
});
