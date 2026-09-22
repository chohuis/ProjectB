import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QUALITY_BY_PHILOSOPHY, SPEND_BY_RESOURCE, squadPlanOf } from "../../repo/newGameV3";

/**
 * **프로 팀 데이터 게이트 둘** (2026-09-22 · `PLAN_OVERSEAS_CLUBS_2026-09-22.md` 2단계).
 *
 * 🔴 왜 있나. 1단계 전까지 ABL·JBL 28팀은
 *   ① `stadium` 이 구장 id 가 아니라 **한글 이름 문자열**("도쿄돔")이었고
 *      `stadiums` 표에 그런 항목이 없었다 — 그래서 28팀이 전부 중립 평균
 *      담장 한 벌로 뛰었는데 **아무 검사도 안 울었다.**
 *   ② `traits` 가 없어 `squadPlanOf` 가 `power` 폴백으로 떨어졌다.
 *   둘 다 "값이 없다"가 아니라 "**있는 척하는 값이 있다**"라서 조용했다.
 *
 * ⚠ **잣대를 데이터에서 읽는다.** 팀 이름·구장 id·성향 글자를 여기 베껴
 *   적으면 데이터를 고칠 때 검사도 같이 고치게 되어 아무것도 못 잡는다.
 *   철학·자원의 정본은 `QUALITY_BY_PHILOSOPHY`·`SPEND_BY_RESOURCE`(코드 표)
 *   이고 어느 팀이 무엇인지는 `refs.json` 이다 — 이 검사는 둘을 대조만 한다.
 *
 * ⚠ **2군도 프로다.** 성향은 구단 단위라 1군·2군이 같아야 하고, 구장도
 *   1군 것을 물려받는다(확정 F). 1군만 보면 2군이 조용히 빌 수 있다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

interface Refs {
  stadiums: { id: string }[];
  teams: {
    id: string;
    leagueId: string;
    stadium?: string;
    traits?: { philosophy?: string; resource?: string } | null;
  }[];
}

const refs = JSON.parse(read("resource/data/master/entities/refs.json")) as Refs;

/**
 * 프로 리그 — **1군·2군이 같은 `leagueId` 를 쓴다**(`_1`/`_2` 접미사로 갈린다).
 * `game.ts` 의 `PRO_LEAGUES` 는 `LEAGUE_*_FARM` 까지 적지만 그건 로스터 생성이
 * 쓰는 이름이고, `refs.json` 에 실제로 적힌 것은 이 셋뿐이다.
 */
const PRO_LEAGUES = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);

const proTeams = refs.teams.filter((t) => PRO_LEAGUES.has(t.leagueId));

/** 게이트 ① — 순수 함수라 아래 대조군이 깨진 사본으로 그대로 부른다 */
function badStadiums(r: Refs): string[] {
  const known = new Set(r.stadiums.map((s) => s.id));
  const out: string[] = [];
  for (const t of r.teams) {
    if (!PRO_LEAGUES.has(t.leagueId)) continue;
    if (!t.stadium) out.push(`${t.id} 구장없음`);
    else if (!known.has(t.stadium)) out.push(`${t.id} → ${t.stadium}`);
  }
  return out;
}

/** 게이트 ② — 같은 이유로 순수 함수다 */
function badTraits(r: Refs): string[] {
  const out: string[] = [];
  for (const t of r.teams) {
    if (!PRO_LEAGUES.has(t.leagueId)) continue;
    const phi = t.traits?.philosophy;
    const res = t.traits?.resource;
    if (phi === undefined) out.push(`${t.id} 철학없음`);
    else if (!(phi in QUALITY_BY_PHILOSOPHY)) out.push(`${t.id} 철학="${phi}" 표밖`);
    if (res === undefined) out.push(`${t.id} 자원없음`);
    else if (!(res in SPEND_BY_RESOURCE)) out.push(`${t.id} 자원="${res}" 표밖`);
  }
  return out;
}

/** 깨진 사본 — 원본은 안 건드린다 */
function broken(mutate: (r: Refs) => void): Refs {
  const copy = JSON.parse(JSON.stringify(refs)) as Refs;
  mutate(copy);
  return copy;
}

describe("게이트 ① 프로 팀의 `stadium` 은 `stadiums` 표의 id 다", () => {
  it("셀 것이 있다 — 리그가 비면 검사가 헛돈다", () => {
    expect(proTeams.length).toBeGreaterThan(70);
    for (const lg of PRO_LEAGUES) {
      expect(proTeams.filter((t) => t.leagueId === lg).length, `${lg} 팀 0개`).toBeGreaterThan(0);
    }
    // 1군만 세면 2군이 조용히 빈다
    expect(proTeams.filter((t) => t.id.endsWith("_2")).length).toBeGreaterThan(0);
  });

  it("전수 통과", () => {
    const bad = badStadiums(refs);
    expect(
      bad,
      `표에 없는 구장을 가리키는 팀 ${bad.length}팀: ${bad.slice(0, 8).join(" ")}`,
    ).toEqual([]);
  });

  it("대조군: 한글 이름 문자열로 되돌리면 빨강", () => {
    // 1단계 **전**의 모습 그대로다 — 그때 이 검사가 있었으면 울었어야 한다
    const r = broken((c) => {
      const t = c.teams.find((x) => x.leagueId === "LEAGUE_JBL")!;
      t.stadium = "도쿄돔";
    });
    expect(badStadiums(r).length).toBe(1);
  });

  it("대조군: 구장 칸을 지워도 빨강", () => {
    const r = broken((c) => {
      delete c.teams.find((x) => x.leagueId === "LEAGUE_ABL")!.stadium;
    });
    expect(badStadiums(r).length).toBe(1);
  });

  it("대조군: 구장 정의를 지우면 그 구장을 쓰는 팀 전부가 빨강", () => {
    const used = proTeams[0].stadium!;
    const users = proTeams.filter((t) => t.stadium === used).length;
    expect(users).toBeGreaterThan(0);
    const r = broken((c) => {
      c.stadiums = c.stadiums.filter((s) => s.id !== used);
    });
    expect(badStadiums(r).length).toBe(users);
  });
});

describe("게이트 ② 프로 팀은 철학·자원이 있고 코드 표 안이다", () => {
  it("전수 통과", () => {
    const bad = badTraits(refs);
    expect(bad, `${bad.length}건: ${bad.slice(0, 8).join(" ")}`).toEqual([]);
  });

  it("2군은 1군과 같은 성향이다 — 같은 구단이다", () => {
    const byId = new Map(refs.teams.map((t) => [t.id, t]));
    const bad: string[] = [];
    for (const t of proTeams) {
      if (!t.id.endsWith("_2")) continue;
      const first = byId.get(`${t.id.slice(0, -2)}_1`);
      if (!first) continue;
      if (JSON.stringify(t.traits) !== JSON.stringify(first.traits)) bad.push(t.id);
    }
    expect(bad, `1군과 성향이 다른 2군: ${bad.join(" ")}`).toEqual([]);
  });

  /**
   * 🔴 **표에 있는지만 보면 반쪽이다.** 값이 표 안이어도 `squadPlanOf` 가
   *   두 축을 실제로 내는지는 다른 질문이다 — 배선 함정 규칙.
   */
  it("성향이 실제로 편성 두 축을 낸다 — `power` 폴백으로 안 떨어진다", () => {
    for (const t of proTeams) {
      // `power` 를 일부러 안 넘긴다. 폴백이 끼면 `qualityBias` 가 나오니까
      const plan = squadPlanOf({ traits: t.traits ?? undefined });
      expect(plan.spendRatio, `${t.id} spendRatio`).toBeGreaterThan(0);
      expect(plan.qualityBias, `${t.id} qualityBias`).toBeGreaterThan(0);
    }
  });

  it("대조군: 성향을 지우면 빨강이고, `power` 폴백만 남는다", () => {
    const r = broken((c) => {
      delete c.teams.find((x) => x.leagueId === "LEAGUE_ABL")!.traits;
    });
    expect(badTraits(r).length).toBe(2); // 철학없음 · 자원없음
    const plan = squadPlanOf({ power: 5 });
    expect(plan.spendRatio).toBeUndefined();
    expect(plan.qualityBias).toBeCloseTo(0.7, 6);
  });

  it("대조군: 표에 없는 글자는 빨강 — 오타가 조용히 통과하면 안 된다", () => {
    const r = broken((c) => {
      const t = c.teams.find((x) => x.leagueId === "LEAGUE_JBL")!;
      t.traits = { philosophy: "데이터 중심", resource: "풍족" };
    });
    expect(badTraits(r).length).toBe(2);
  });

  /** 표 자체가 비면 위 대조군이 전부 통과해 버린다 */
  it("코드 표가 비어 있지 않다", () => {
    expect(Object.keys(QUALITY_BY_PHILOSOPHY).length).toBe(12);
    expect(Object.keys(SPEND_BY_RESOURCE).length).toBe(4);
  });
});
