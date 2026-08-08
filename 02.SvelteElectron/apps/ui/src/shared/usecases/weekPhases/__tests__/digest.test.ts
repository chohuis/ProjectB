import { describe, it, expect } from "vitest";
import {
  buildLeagueDigest, digestTierOf, DIGEST_SECTIONS, type DigestInput,
} from "../digest";
import type { Standing } from "../../../types/season";

/**
 * 통합 다이제스트 조립기.
 *
 * ⚠ **이 영역엔 단위 검사가 하나도 없었다.** `standingsNews`·`digest` 어느 쪽도
 * 테스트가 없고, `devScenarios`가 "메시지가 왔나"만 본다. 그래서 `pctStr`이 두
 * 벌이고 한쪽이 승률 1.000을 `.1000`으로 찍고 있어도 아무도 몰랐다.
 *
 * 여기서는 **섹션이 실제로 켜지고 꺼지는가**와 **내 자리가 첫 줄인가**를 본다.
 * 문구 자체는 검사하지 않는다 — 문장이 바뀔 때마다 깨지는 검사는 못 쓴다.
 */

const st = (teamId: string, wins: number, losses: number, over: Partial<Standing> = {}): Standing => ({
  teamId, wins, losses, draws: 0,
  winPct: wins + losses > 0 ? wins / (wins + losses) : 0,
  runsFor: wins * 5, runsAgainst: losses * 5, streak: "W1",
  ...over,
} as Standing);

/** 권역 2개 × 3팀. 내 팀은 REG_A의 2위 */
const REGIONS = {
  STADIUM_A: ["TEAM_A1", "TEAM_A2", "TEAM_A3"],
  STADIUM_B: ["TEAM_B1", "TEAM_B2", "TEAM_B3"],
};
const HS_STANDINGS = [
  st("TEAM_A1", 10, 2), st("TEAM_A2", 8, 4), st("TEAM_A3", 3, 9),
  st("TEAM_B1", 9, 3), st("TEAM_B2", 6, 6), st("TEAM_B3", 2, 10),
];

const base: DigestInput = {
  weekNum: 12,
  seasonYear: 2027,
  monthLabel: "6월",
  careerStage: "highschool",
  hsGrade: 3,
  myTeamId: "TEAM_A2",
  myLeagueId: "LEAGUE_HIGHSCHOOL",
  leagueState: {
    LEAGUE_KBL: { standings: [st("TEAM_KBL_1", 40, 20), st("TEAM_KBL_2", 20, 40)] },
    LEAGUE_UNIVERSITY: { standings: [st("TEAM_U1", 15, 5)] },
  } as unknown as DigestInput["leagueState"],
  hsStandings: HS_STANDINGS,
  teamName: (id) => id.replace(/^TEAM_/, ""),
  regionName: (id) => id.replace(/^STADIUM_/, "") + "권역",
  regions: REGIONS,
  scoutScore: 62,
};

describe("digestTierOf", () => {
  it("고교는 학년으로 갈린다", () => {
    expect(digestTierOf("highschool", 1)).toBe("hs1");
    expect(digestTierOf("highschool", 2)).toBe("hs23");
    expect(digestTierOf("highschool", 3)).toBe("hs23");
  });
  it("대학·독립은 amateur, 프로 계열은 전부 pro", () => {
    expect(digestTierOf("university")).toBe("amateur");
    expect(digestTierOf("independent")).toBe("amateur");
    for (const s of ["pro_kbl", "pro_abl", "pro_jbl"]) expect(digestTierOf(s)).toBe("pro");
  });
});

describe("buildLeagueDigest — 섹션 노출", () => {
  it("고교 1학년에겐 프로 순위가 안 나온다", () => {
    // 진로가 아직 안 걸린 학년에게 프로 순위표는 잡음이라는 기존 판단을 잇는다
    const m = buildLeagueDigest({ ...base, hsGrade: 1 })!;
    expect(m.body).not.toContain("[다른 무대]");
    expect(m.body).not.toContain("[나를 보는 눈]");
    expect(m.body).toContain("[내 자리]");
  });

  it("고교 3학년에겐 다른 무대와 스카우트가 나온다", () => {
    const m = buildLeagueDigest(base)!;
    expect(m.body).toContain("[다른 무대]");
    expect(m.body).toContain("[나를 보는 눈]");
  });

  it("프로에겐 스카우트 관심 구단이 안 나온다", () => {
    // 이미 소속이 있다
    const m = buildLeagueDigest({
      ...base, careerStage: "pro_kbl", hsGrade: undefined,
      myTeamId: "TEAM_KBL_2", myLeagueId: "LEAGUE_KBL", hsStandings: [],
    })!;
    expect(m.body).not.toContain("[나를 보는 눈]");
    expect(m.body).toContain("[내 무대]");
  });

  it("노출 표와 실제 본문이 어긋나지 않는다", () => {
    // 표만 고치고 조립 코드를 안 고치는 실수를 잡는다
    const cases: [string, number | undefined][] = [
      ["highschool", 1], ["highschool", 3], ["university", undefined], ["pro_kbl", undefined],
    ];
    for (const [stage, grade] of cases) {
      const tier = digestTierOf(stage, grade);
      const isPro = tier === "pro" || tier === "amateur";
      const m = buildLeagueDigest({
        ...base, careerStage: stage, hsGrade: grade,
        myTeamId: isPro ? "TEAM_KBL_2" : "TEAM_A2",
        myLeagueId: isPro ? "LEAGUE_KBL" : "LEAGUE_HIGHSCHOOL",
        hsStandings: stage === "highschool" ? HS_STANDINGS : [],
      })!;
      expect(m, `${tier} 가 null`).not.toBeNull();
      expect(m.body.includes("[다른 무대]"), `${tier} others`).toBe(DIGEST_SECTIONS[tier].others);
      expect(m.body.includes("[나를 보는 눈]"), `${tier} scout`).toBe(DIGEST_SECTIONS[tier].scout);
    }
  });
});

describe("buildLeagueDigest — 내 자리가 먼저", () => {
  it("미리보기가 내 순위다", () => {
    // 예전 다이제스트는 preview 가 parts[0] 이라 남의 리그가 먼저 떴다
    const m = buildLeagueDigest(base)!;
    expect(m.preview).toContain("A권역");
    expect(m.preview).toContain("2위");
  });

  it("본문 첫 섹션이 [내 자리]다", () => {
    const m = buildLeagueDigest(base)!;
    const first = m.body.indexOf("[내 자리]");
    const others = m.body.indexOf("[다른 무대]");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(others);
  });

  it("내 무대 순위표에 우리 팀이 표시된다", () => {
    const m = buildLeagueDigest(base)!;
    expect(m.body).toContain("← 우리");
  });
});

describe("buildLeagueDigest — 빈 데이터", () => {
  it("경기를 아직 안 치른 리그는 안 싣는다", () => {
    // 시즌 초엔 전부 0-0이다. 그때 "선두 ○○ (.000)"을 내보내면 거짓 정보다
    const zero = HS_STANDINGS.map((s) => st(s.teamId, 0, 0));
    const m = buildLeagueDigest({
      ...base, hsStandings: zero,
      leagueState: { LEAGUE_KBL: { standings: [st("TEAM_KBL_1", 0, 0)] } } as never,
    });
    if (m) {
      expect(m.body).not.toContain("[내 무대]");
      expect(m.body).not.toContain("[다른 무대]");
    }
  });

  it("담을 게 하나도 없으면 null이다", () => {
    // 빈 껍데기를 보내면 "소식이 왔는데 아무것도 없다"가 된다
    const m = buildLeagueDigest({
      ...base, hsStandings: [], leagueState: {} as never,
      myTeamId: "TEAM_NONE", myLeagueId: "LEAGUE_NONE",
    });
    expect(m).toBeNull();
  });

  it("내 팀이 순위표에 없어도 죽지 않는다", () => {
    expect(() => buildLeagueDigest({ ...base, myTeamId: "TEAM_GHOST" })).not.toThrow();
  });
});

describe("id 유일성", () => {
  /**
   * ⚠ **`weekNum`은 시즌마다 1로 리셋된다.** 처음엔 `msg-digest-w13`으로 뒀는데
   * 해마다 같은 id가 다시 생겨 3시즌째에 중복이 됐고, 소식 목록이
   * `(msg.id)`를 키로 잡기 때문에 Svelte가 `each_key_duplicate`로 죽어
   * **세이브가 아예 안 열렸다.** 로드 화면에서 멈춘 채 원인이 안 보인다.
   */
  it("같은 주라도 시즌이 다르면 id가 다르다", () => {
    const a = buildLeagueDigest({ ...base, weekNum: 13, seasonYear: 2026 })!;
    const b = buildLeagueDigest({ ...base, weekNum: 13, seasonYear: 2027 })!;
    expect(a.id).not.toBe(b.id);
  });

  it("한 시즌 안에서 주가 다르면 id가 다르다", () => {
    const a = buildLeagueDigest({ ...base, weekNum: 13, seasonYear: 2026 })!;
    const b = buildLeagueDigest({ ...base, weekNum: 18, seasonYear: 2026 })!;
    expect(a.id).not.toBe(b.id);
  });

  it("id에 표시용 라벨을 넣지 않는다", () => {
    // `msg-digest-3월-w13`으로 뒀더니 종류 키가 달마다 쪼개져 계측이 무너졌다
    const m = buildLeagueDigest({ ...base, monthLabel: "6월" })!;
    expect(m.id).not.toContain("월");
  });
});

describe("승률 표기", () => {
  it("전승은 1.000이다 (.1000이 아니다)", () => {
    // digest.ts 안에 있던 사본은 자릿수가 밀려 `.1000`을 냈다
    const m = buildLeagueDigest({
      ...base,
      hsStandings: [st("TEAM_A1", 12, 0), st("TEAM_A2", 8, 4), st("TEAM_A3", 0, 12)],
    })!;
    expect(m.body).toContain("1.000");
    expect(m.body).not.toContain(".1000");
  });
});
