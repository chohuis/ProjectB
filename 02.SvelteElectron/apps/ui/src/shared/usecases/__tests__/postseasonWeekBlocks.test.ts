import { describe, it, expect } from "vitest";
import { weekPathSrc, weekPathFlat } from "./weekPathSrc";

/**
 * **포스트시즌·대회 갈래의 갈림길을 못박는다** (2026-09-27 · Ⅱ-1 쪼개기의 안전망).
 *
 * 🔴 왜 쪼개기 **전에** 쓰나. `militaryWeekBlocks.test` 와 같은 이유다 —
 *   블록을 옮길 때 제일 잘 나는 사고는 「조건 하나를 흘리는 것」이고, 게임은
 *   그대로 돌면서 그 갈래만 조용히 사라진다. 이 블록은 특히 그렇다:
 *   대회 라운드가 안 닫히면 **그 대회가 그 해에 죽는데** 화면에는 아무 말도
 *   안 난다(장미기 2028 실측 · `replayDrawnKnockout` 머리말).
 *
 * ⚠ **파일 하나를 안 본다.** 주간 진행 경로 전체(`advanceWeek.ts` +
 *   `weekPhases/**`)를 한 덩이로 읽는다(`weekPathSrc`). 그래야 쪼개기 전과
 *   후에 검사 문장이 한 글자도 안 바뀐다 — 그게 「옮기기 전후가 같다」를
 *   증명하는 힘이다.
 *
 * ⚠ **호출부 수를 같이 센다**(아래 「배선 대조군」). 정의만 옮겨 놓고 부르는
 *   자리를 흘리면 위 검사들은 전부 초록인데 대회가 한 번도 안 돈다 —
 *   이 저장소가 반복해 밟은 형태(「층마다 맞는데 잇는 선이 없다」)다.
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const WEEK_PATH = weekPathFlat();
/** 문안·식별자를 글자 그대로 봐야 할 때 */
const WEEK_RAW = weekPathSrc();

/** 겹치지 않는 부분 문자열의 등장 횟수 — 정규식을 안 쓴다 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe("독립 생존리그 블록 — 갈림길", () => {
  it("탈락 판정은 progressSurvival 하나가 한다 — 순위표를 여기서 만들지 않는다", () => {
    expect(WEEK_PATH).toContain(
      "const r = await progressSurvival(week, s, state, g.protagonist.teamId);",
    );
    // 🔴 `stageStandings` 를 여기서 부르면 멀쩡한 순위표를 0-0 으로 덮는다
    //   (2026-09-01 실측 · 두 경로가 같은 자리를 두고 다퉜다)
    expect(WEEK_PATH).not.toContain("seasonStore.setLeagueState(stageStandings");
  });

  it("탈락한 팀에 내가 있으면 「일어난 일」로 적는다", () => {
    expect(WEEK_PATH).toContain("if (r.eliminated.includes(g.protagonist.teamId)) {");
    expect(WEEK_PATH).toContain('kind: "eliminated", year: s.seasonYear, week,');
  });
});

describe("넉아웃 무승부 블록 — 갈림길", () => {
  it("넉아웃인지는 브래킷 소속으로만 가른다 — phase 로는 못 가른다", () => {
    expect(WEEK_PATH).toContain("return knockoutMatchIds(get(seasonStore)).has(scheduleId);");
  });

  it("재경기는 씨앗을 원래 경기 그대로 둔다 — 꼬리표를 붙이면 재현이 갈린다", () => {
    expect(WEEK_PATH).toContain("knockout: true,");
    expect(WEEK_PATH).toContain("worldSeed: s.worldSeed, scheduleId: m.id,");
  });

  it("못 풀면 승자를 지어내지 않는다 — 라운드를 안 닫는다", () => {
    expect(WEEK_PATH).toContain("const w = sim.result.winnerId; if (!w) return null;");
    expect(WEEK_PATH).toContain("if (results.some((x) => !x.winnerTeamId))");
  });

  it("결과를 통째로 갈아 끼우지 않는다 — 선수 기록이 이중 계상된다", () => {
    expect(WEEK_PATH).toContain("seasonStore.settleDrawnKnockout(");
  });
});

describe("대회 진행 블록 — 갈림길", () => {
  it("주차를 넘긴 대회 경기를 이번 주로 당긴다 — 안 당기면 영영 안 치러진다", () => {
    expect(WEEK_PATH).toContain("seasonStore.pullOverdueTournamentGames(");
  });

  it("단계 셋이 순서대로 있다 — 개막 · 예선→본선 · 라운드 확정", () => {
    expect(WEEK_PATH).toContain("const opened = await openTournamentsForWeek(");
    expect(WEEK_PATH).toContain("const promoted = await promoteFinishedGroupStages(");
    expect(WEEK_PATH).toContain("const { bracket: next, nextEntries } = await applyRoundResults(");
  });

  it("한 대회는 한 번에 한 라운드씩 — 호출부가 경기를 치른 뒤 다시 부른다", () => {
    expect(WEEK_PATH).toContain("if (live.every((m) => m.winnerTeamId)) continue;");
    expect(WEEK_PATH).toContain("if (results.length < live.length) break;");
  });

  it("우승·탈락은 소식이 아니라 브래킷을 보고 적는다", () => {
    expect(WEEK_PATH).toContain(
      'gameStore.recordOutcome({ kind: "eliminated", year: yr, week, detail: def.id });',
    );
    expect(WEEK_PATH).toContain(
      'gameStore.recordOutcome({ kind: "champion", year: yr, week, detail: def.id });',
    );
  });

  it("수상 집계에 리그 게이트가 있다 — 없으면 대학 대회에 고교 선수가 상을 받는다", () => {
    expect(WEEK_PATH).toContain("return lg === def.leagueId ? tid : null;");
  });

  it("시상 소식 id 에 연도와 주차가 둘 다 들어간다 — 겹치면 세이브가 안 열린다", () => {
    expect(WEEK_RAW).toContain("`msg-tour-award-${def.id}-${next.seasonYear}-w${week}`");
  });

  it("「진출 명단」만 그릇으로 간다 — 그릇이 없으면 예전대로 바로 내보낸다", () => {
    expect(WEEK_PATH).toContain(
      "if (roundNewsSink) roundNewsSink.push(progress); else gameStore.addMessage(progress);",
    );
  });
});

describe("리그 포스트시즌 블록 — 갈림길", () => {
  it("고교·대학은 제외다 — 넣으면 결승이 두 번 열린다", () => {
    expect(WEEK_PATH).toContain(
      'const SUPPORTED = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_INDEPENDENT"];',
    );
    expect(WEEK_PATH).toContain("if (!SUPPORTED.includes(leagueId)) return;");
  });

  it("정규시즌 경기가 남아 있으면 아직 아니다", () => {
    expect(WEEK_PATH).toContain(
      'if (s.schedule.some((e) => e.phase === "season" && !e.result)) return;',
    );
  });

  it("시리즈 승자가 나오면 다음 시리즈를 채우고 비주인공 시리즈를 푼다", () => {
    expect(WEEK_PATH).toContain("newBracket = await fillNextSeries(newBracket, updated);");
    expect(WEEK_PATH).toContain(
      "newBracket = await resolveNonProtagonistSeries(newBracket, g.protagonist.teamId,",
    );
  });
});

/**
 * 🔴 **배선 대조군** — 정의를 옮기면서 **부르는 자리**를 흘리면 위 검사가 전부
 *   초록인 채로 대회가 한 번도 안 돈다. 호출부 수를 못박는다.
 *
 * ⚠ 수는 지금 실측이다. 늘어나거나 줄면 **왜 그런지 적고** 고친다 —
 *   말없이 숫자만 맞추면 이 검사가 하는 일이 없어진다.
 */
describe("🔴 배선 대조군 — 부르는 자리", () => {
  it("넉아웃 게이트는 시뮬 호출부 셋 전부에 실린다", () => {
    expect(countOf(WEEK_PATH, "knockout: isKnockoutGame(game.id)")).toBe(3);
  });

  it("포스트시즌 결과 반영은 경기 처리 갈래 일곱 전부에서 불린다", () => {
    expect(countOf(WEEK_PATH, "applyPostseasonResult(game.id,")).toBe(7);
  });

  it("대회 진행은 주 초 한 번 + 경기 뒤 루프 한 번 — 둘 다 그릇을 준다", () => {
    expect(countOf(WEEK_PATH, "progressTournaments(nextWeekNum, accTourRoundNews)")).toBe(2);
    // 루프 상한이 있다 — 없으면 대진이 꼬인 주에 무한히 돈다
    expect(WEEK_PATH).toContain("if (pass >= 20 || !(await progressTournaments(");
  });

  it("독립리그·리그 포스트시즌도 주 진행에서 실제로 불린다", () => {
    expect(countOf(WEEK_PATH, "await progressIndependentLeague(nextWeekNum)")).toBe(1);
    expect(countOf(WEEK_PATH, "await injectLeaguePostseason(nextWeekNum)")).toBe(1);
  });

  it("저장된 무승부를 푸는 자리가 대회 라운드 루프 안에 있다", () => {
    expect(countOf(WEEK_PATH, "await replayDrawnKnockout(m)")).toBe(1);
    expect(WEEK_PATH).toContain("if (settled) resultOf.set(m.id, settled);");
  });
});
