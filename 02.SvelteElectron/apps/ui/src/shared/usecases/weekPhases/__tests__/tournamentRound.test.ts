import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRoundProgressMessage } from "../tournamentNews";

/**
 * 대회 라운드 진행 소식.
 *
 * 예전엔 내 팀 경기와 우승만 왔다. **우리가 안 나간 대회는 개막·우승 두 통뿐**이라
 * 누가 올라갔는지 알 수 없었고, 나간 대회도 탈락한 뒤로는 깜깜했다.
 *
 * ⚠ 문구는 검사하지 않는다. 보는 것은 ①32강부터만 오는가 ②내 팀 라운드와
 * 겹치지 않는가 ③우리 권역 팀을 짚는가 셋이다.
 */

const def = { id: "TOUR_X", name: "국화기", flower: "국화", leagueId: "LEAGUE_HIGHSCHOOL" } as never;
const tName = (id: string) => id.replace("TEAM_", "");

/** round 경기 n개를 만든다. 홈이 이긴다 */
const matches = (round: number, pairs: [string, string][]) =>
  pairs.map(([h, a], i) => ({
    id: `M${round}_${i}`, round, isBye: false,
    homeTeamId: h, awayTeamId: a, winnerTeamId: h,
  }));

const bracketOf = (totalRounds: number, round: number, pairs: [string, string][]) =>
  ({ tournamentId: "TOUR_X", seasonYear: 2027, totalRounds, matches: matches(round, pairs) }) as never;

describe("라운드 진행 소식", () => {
  it("32강보다 앞은 안 보낸다", () => {
    // 102팀 대회면 1회전만 51경기다 — 명단이 소식이 안 된다
    const b = bracketOf(7, 1, [["TEAM_A", "TEAM_B"]]);   // fromEnd 6
    expect(buildRoundProgressMessage(def, b, 1, "TEAM_ME", tName, 31)).toBeNull();
  });

  it("32강부터는 보낸다", () => {
    const b = bracketOf(7, 3, [["TEAM_A", "TEAM_B"]]);   // fromEnd 4 = 32강
    expect(buildRoundProgressMessage(def, b, 3, "TEAM_ME", tName, 31)).not.toBeNull();
  });

  it("결승은 안 보낸다 (우승 소식이 맡는다)", () => {
    const b = bracketOf(5, 5, [["TEAM_A", "TEAM_B"]]);
    expect(buildRoundProgressMessage(def, b, 5, "TEAM_ME", tName, 34)).toBeNull();
  });

  it("내 팀이 그 라운드에 있으면 안 보낸다 (내 경기 소식과 겹친다)", () => {
    // ⚠ 둘 다 보내면 같은 라운드가 두 통이 된다
    const b = bracketOf(5, 3, [["TEAM_ME", "TEAM_B"], ["TEAM_C", "TEAM_D"]]);
    expect(buildRoundProgressMessage(def, b, 3, "TEAM_ME", tName, 20)).toBeNull();
  });

  it("아직 안 끝난 라운드는 안 보낸다", () => {
    const b = bracketOf(5, 3, [["TEAM_A", "TEAM_B"]]) as unknown as
      { matches: { winnerTeamId?: string }[] };
    b.matches[0].winnerTeamId = undefined;
    expect(buildRoundProgressMessage(def, b as never, 3, "TEAM_ME", tName, 20)).toBeNull();
  });

  it("진출 팀 명단이 실린다", () => {
    const b = bracketOf(5, 3, [["TEAM_A", "TEAM_B"], ["TEAM_C", "TEAM_D"]]);
    const m = buildRoundProgressMessage(def, b, 3, "TEAM_ME", tName, 20)!;
    expect(m.body).toContain("A");
    expect(m.body).toContain("C");
    expect(m.subject).toContain("2팀");
  });

  it("우리 권역 팀을 짚어준다", () => {
    // 없으면 남의 대회 명단은 모르는 이름 나열이라 읽을 이유가 없다
    const b = bracketOf(5, 3, [["TEAM_A", "TEAM_B"], ["TEAM_C", "TEAM_D"]]);
    const region = new Set(["TEAM_A", "TEAM_D", "TEAM_ME"]);
    const m = buildRoundProgressMessage(def, b, 3, "TEAM_ME", tName, 20, region)!;
    expect(m.body).toContain("우리 권역");
    expect(m.preview).toContain("A");        // 진출
    expect(m.body).toContain("D");           // 탈락도 짚는다
  });

  it("권역을 안 넘기면 명단만 낸다", () => {
    const b = bracketOf(5, 3, [["TEAM_A", "TEAM_B"]]);
    const m = buildRoundProgressMessage(def, b, 3, "TEAM_ME", tName, 20)!;
    expect(m.body).not.toContain("우리 권역");
  });

  it("id가 대회·라운드·연도로 유일하다", () => {
    const b = bracketOf(5, 3, [["TEAM_A", "TEAM_B"]]);
    const m = buildRoundProgressMessage(def, b, 3, "TEAM_ME", tName, 20)!;
    expect(m.id).toContain("TOUR_X");
    expect(m.id).toContain("r3");
    expect(m.id).toContain("2027");
  });
});

describe("호출부 배선", () => {
  it("advanceWeek 가 라운드 소식과 권역 목록을 넘긴다", () => {
    // ⚠ 안 넘기면 에러가 아니라 "명단만 나옴"으로 조용히 나타난다
    const src = readFileSync(resolve(__dirname, "../../advanceWeek.ts"), "utf8");
    const i = src.indexOf("buildRoundProgressMessage(");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 200)).toContain("myRegionTeamIds");
  });
});
