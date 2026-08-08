import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMonthlyNoticeMessage } from "../friendlyMatchEngine";
import type { OpponentBrief } from "../matchLineupBuilder";

/**
 * 월간 경기 편성 소식.
 *
 * 예전엔 날짜와 상대 이름만 있어서 **사실상 달력**이었다 — 누구랑 붙는지
 * 알려면 경기 창까지 가야 했다. 경기 전 브리핑이 이미 계산하는 값(순위·성적·
 * 팀 OVR·선발)을 예고 시점에 재사용한다.
 *
 * ⚠ 여기서 **문구를 검사하지 않는다.** 문장이 바뀔 때마다 깨지는 검사는 못 쓴다.
 * 보는 것은 ①상세가 실제로 붙는가 ②경기별로 붙는가(줄이 흩어지지 않는가)
 * ③없는 값을 지어내지 않는가 셋이다.
 */

const plan = {
  monthLabel: "3월",
  entries: [
    { gameDate: "2026-03-18", awayTeamId: "TEAM_B", homeTeamId: "PLY_HERO", week: 12, isFriendly: true },
    { gameDate: "2026-03-11", awayTeamId: "TEAM_A", homeTeamId: "PLY_HERO", week: 11, isFriendly: true },
  ],
} as unknown as Parameters<typeof buildMonthlyNoticeMessage>[0];

const official = [
  { gameDate: "2026-03-24", awayTeamId: "PLY_HERO", homeTeamId: "TEAM_C", week: 13, isFriendly: false },
] as unknown as Parameters<typeof buildMonthlyNoticeMessage>[1];

const BRIEFS: Record<string, OpponentBrief> = {
  TEAM_A: { teamId: "TEAM_A", rank: 12, total: 16, record: "8승 14패", teamOvr: 54,
            starter: { name: "최성원", position: "RP", ovr: 58 } },
  TEAM_B: { teamId: "TEAM_B", rank: 6, total: 16, record: "11승 11패", teamOvr: 59,
            starter: { name: "장수훈", position: "SP", ovr: 66 } },
  TEAM_C: { teamId: "TEAM_C", rank: 3, total: 16, record: "15승 7패", teamOvr: 63,
            starter: { name: "류도기", position: "SP", ovr: 71 } },
};
const teamMap = new Map([["TEAM_A", "무심고"], ["TEAM_B", "승주고"], ["TEAM_C", "은평고"]]);
const briefOf = (id: string) => BRIEFS[id] ?? null;

describe("월간 경기 편성 소식", () => {
  it("상대 정보를 안 넘기면 예전처럼 날짜·상대만 나온다", () => {
    // 호출부가 아직 배선을 안 해도 소식이 깨지지 않아야 한다
    const m = buildMonthlyNoticeMessage(plan, official, 10, teamMap)!;
    expect(m.body).toContain("무심고");
    expect(m.body).not.toContain("팀 OVR");
    expect(m.body).not.toContain("선발 예상");
  });

  it("상대 정보를 넘기면 순위·성적·팀OVR·선발이 붙는다", () => {
    const m = buildMonthlyNoticeMessage(plan, official, 10, teamMap, briefOf)!;
    for (const s of ["12위 / 16팀", "8승 14패", "팀 OVR 54", "선발 예상", "최성원", "OVR 58"]) {
      expect(m.body, s).toContain(s);
    }
  });

  it("공식경기 상대에도 붙는다", () => {
    // 예전엔 친선만 상세가 있고 공식은 이름뿐인 식으로 갈리기 쉽다
    const m = buildMonthlyNoticeMessage(plan, official, 10, teamMap, briefOf)!;
    expect(m.body).toContain("류도기");
  });

  it("선발은 '예상'으로 적는다", () => {
    // 월초엔 로테이션이 확정이 아니다. 확정처럼 적으면 브리핑과 어긋난다
    const m = buildMonthlyNoticeMessage(plan, official, 10, teamMap, briefOf)!;
    expect(m.body).toContain("선발 예상");
  });

  it("상세가 그 경기 줄 바로 아래에 붙는다", () => {
    // ⚠ 예전엔 한 줄씩 만들어 `.sort()`로 날짜순을 잡았다. 상세가 여러 줄이
    // 되면 그 정렬이 **상세를 경기에서 떼어내 흩어놓는다**
    const m = buildMonthlyNoticeMessage(plan, official, 10, teamMap, briefOf)!;
    const lines = m.body.split("\n");
    const iA = lines.findIndex((l) => l.includes("무심고"));
    expect(iA).toBeGreaterThan(-1);
    expect(lines[iA + 1]).toContain("팀 OVR 54");
    expect(lines[iA + 2]).toContain("최성원");
  });

  it("날짜순으로 나온다", () => {
    const m = buildMonthlyNoticeMessage(plan, official, 10, teamMap, briefOf)!;
    const b = m.body;
    expect(b.indexOf("무심고")).toBeLessThan(b.indexOf("승주고"));   // 03/11 < 03/18
    expect(b.indexOf("승주고")).toBeLessThan(b.indexOf("은평고"));   // 03/18 < 03/24
  });

  it("없는 값은 지어내지 않는다", () => {
    const thin = (id: string): OpponentBrief =>
      ({ teamId: id, rank: null, total: null, record: null, teamOvr: null, starter: null });
    const m = buildMonthlyNoticeMessage(plan, official, 10, teamMap, thin)!;
    expect(m.body).not.toContain("null");
    expect(m.body).not.toContain("위 / ");
    expect(m.body).not.toContain("선발 예상");
  });

  it("미리보기가 이번 달 최대 고비를 짚는다", () => {
    // "친선 2회 편성되었습니다"는 목록에서 열어볼 이유가 안 된다
    const m = buildMonthlyNoticeMessage(plan, official, 10, teamMap, briefOf)!;
    expect(m.preview).toContain("은평고");   // 팀 OVR 63 이 최고
  });
});

describe("호출부 배선", () => {
  it("advanceWeek 가 briefOf 를 넘긴다", () => {
    // ⚠ 안 넘겨도 소식은 나온다 — 에러가 아니라 "상세가 없음"으로 나타난다.
    // 이 프로젝트가 반복해 겪은 형태라 배선 자체를 고정한다
    const src = readFileSync(
      resolve(__dirname, "../../usecases/advanceWeek.ts"), "utf8");
    const i = src.indexOf("buildMonthlyNoticeMessage(");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 200)).toContain("briefOf");
    expect(src).toContain("buildOpponentBrief");
  });
});
