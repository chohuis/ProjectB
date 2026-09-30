import { describe, it, expect } from "vitest";
import { weekPathFlat } from "./weekPathSrc";

/**
 * **이벤트 뽑기·통지 블록의 갈림길을 못박는다** (2026-09-30 · Ⅱ-1 안전망).
 *
 * 🔴 왜 이 블록에 안전망이 필요한가. 여기는 **조건만 만들고 배선을 안 하면
 *   조용히 false** 인 자리가 넷 있다. 실제로 그렇게 났다:
 *   ① 관계도 조건(`relation_gte`)이 `ctx.relations` 를 못 받아 늘 false
 *   ② `compare` 조건이 가리키는 NPC 스탯을 안 실어 늘 false
 *   ③ 이름표(`role`)를 안 풀어 그 사람 스탯이 안 실림
 *   ④ 연속 주 수를 이벤트 **뒤에** 갱신해 한 주씩 밀림
 *   넷 다 이벤트가 안 떠도 로그 한 줄 안 남는다.
 *
 * 🔴 **난수 꼬리의 순서에 뜻이 있다.** 문안 은행은 **뒤에서** 떼어 가야
 *   이벤트 뽑기가 안 밀린다 — 앞에서 떼면 같은 씨앗의 이벤트가 통째로 달라진다.
 *
 * ⚠ 주간 진행 경로 전체를 **한 덩이로** 읽는다(`weekPathFlat`).
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const WEEK_PATH = weekPathFlat();

/** 겹치지 않는 부분 문자열의 등장 횟수 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe("이벤트 조건의 입력 — 안 실으면 조용히 false 다", () => {
  it("🔴 시간을 세는 조건은 데이터가 쓰는 키만 준비한다", () => {
    expect(WEEK_PATH).toContain("const streakKeys = collectStreakKeys(m.eventRules);");
  });

  it("🔴 이름표(`role`)를 여기서 푼다 — 안 풀면 그 사람 스탯이 안 실린다", () => {
    expect(WEEK_PATH).toContain("const storyNpcRoles = afterP.storyNpcs;");
    expect(WEEK_PATH).toContain("const id = storyNpcIdOf(storyNpcRoles, c);");
    expect(WEEK_PATH).toContain("storyNpcRoles,");
  });

  it("🔴 `compare` 가 가리키는 id 만 싣는다 — 엔티티 전부를 접으면 매주 수천 명이다", () => {
    expect(WEEK_PATH).toContain("if (wanted.size > 0) {");
    expect(WEEK_PATH).toContain("if (!wanted.has(e.id)) continue;");
    expect(WEEK_PATH).toContain("storyNpcs: compareNpcStats,");
  });

  it("비교 키는 주인공 경로와 같은 이름이다 — 다르면 잣대가 둘이다", () => {
    expect(WEEK_PATH).toContain('"pitching.ovr": d.pitching?.ovr ?? 0,');
    expect(WEEK_PATH).toContain('"batting.ovr": d.batting?.ovr ?? 0,');
  });

  it("🔴 관계도 행을 실어 준다 — 안 실으면 relation 조건이 늘 false 다", () => {
    expect(WEEK_PATH).toContain("relations: relRows,");
  });

  it("🔴 순위표는 주인공 리그를 명시해 읽는다 — `s.standings` 는 옛 리그일 수 있다", () => {
    expect(WEEK_PATH).toContain(
      "standings: s.leagueState?.[afterP.leagueId]?.standings ?? s.standings,",
    );
  });

  it("학사 상태는 최신을 읽는다 — 이번 주 학점 누적이 반영돼야 한다", () => {
    expect(WEEK_PATH).toContain("schoolState: get(gameStore).schoolState,");
  });

  it("개막했나는 일정으로 본다 — 경기 결과 유무로 보면 개막 주가 통째로 빈다", () => {
    expect(WEEK_PATH).toContain("seasonOpened: s.schedule.some((e) => e.week <= weekNum),");
  });

  it("등급 줄기의 시즌 상태 셋이 다 실린다 — 안 실으면 상한이 안 걸린다", () => {
    expect(WEEK_PATH).toContain("tierCounts: s.tierCounts,");
    expect(WEEK_PATH).toContain("tierLastWeek: s.tierLastWeek,");
    expect(WEEK_PATH).toContain("eventStarve: s.eventStarve,");
  });
});

describe("🔴 연속 주 수는 이벤트 앞에서 갱신한다", () => {
  it("`tickStreaks` 가 유일한 갱신 자리다", () => {
    expect(
      countOf(WEEK_PATH, "const nextStreaks = tickStreaks(afterP.streaks, streakKeys, eventCtx);"),
    ).toBe(1);
  });

  it("갱신한 값으로 컨텍스트를 덮은 뒤 엔진을 돈다 — 뒤에 하면 한 주씩 밀린다", () => {
    const iTick = WEEK_PATH.indexOf("const nextStreaks = tickStreaks(");
    const iRun = WEEK_PATH.indexOf("const evResult = runEventEngine(");
    expect(iTick).toBeGreaterThan(0);
    expect(iRun).toBeGreaterThan(iTick);
    expect(WEEK_PATH).toContain("eventCtx.protagonist = { ...afterP, streaks: nextStreaks };");
  });

  it("갱신한 값을 패치로 저장한다 — 안 저장하면 다음 주에 0 부터 센다", () => {
    expect(WEEK_PATH).toContain("growth.protagonistPatch.streaks = nextStreaks;");
  });
});

describe("이벤트 결과를 받는 자리 — 넷이 다 있다", () => {
  it("발동 이력 · 문장 뽑기 · 커리어 이력 · 등급 상태", () => {
    expect(WEEK_PATH).toContain("seasonStore.recordTriggeredEvents(evResult.updatedTriggers);");
    expect(WEEK_PATH).toContain("seasonStore.recordSentencePicks(evResult.sentencePicks);");
    expect(WEEK_PATH).toContain(
      "gameStore.recordCareerTriggeredEvents(evResult.careerUpdatedTriggers);",
    );
    expect(WEEK_PATH).toContain("seasonStore.recordTierState({");
  });

  it("업적의 레어 카운트는 **커리어 통**이다 — 소식함을 세면 지워진 옛 소식이 빠진다", () => {
    expect(WEEK_PATH).toContain("gameStore.recordEventGrade({");
    expect(WEEK_PATH).toContain(
      'rareThisSeason: (s.tierCounts?.rare ?? 0) + (evResult.gradeFired === "rare" ? 1 : 0),',
    );
  });
});

describe("🔴 지속 보정의 남은 주를 줄인다", () => {
  it("훈련 효율·부상 위험 둘 다 줄인다 — 안 줄이면 커리어 내내 남는다", () => {
    expect(WEEK_PATH).toContain("if (teb && teb.weeksLeft > 0) {");
    expect(WEEK_PATH).toContain("if (irm && irm.weeksLeft > 0) {");
  });

  it("0 이 되면 지운다 — `weeksLeft: 0` 을 남기면 계측이 「걸려 있다」로 읽는다", () => {
    expect(WEEK_PATH).toContain(
      "growth.protagonistPatch.trainEffBoost = left > 0 ? { ...teb, weeksLeft: left } : undefined;",
    );
    expect(WEEK_PATH).toContain(
      "growth.protagonistPatch.injuryRiskMod = left > 0 ? { ...irm, weeksLeft: left } : undefined;",
    );
  });
});

describe("고교 월간 TOP 10 — 4주마다", () => {
  it("고교만 · 4주마다 · 4주차부터", () => {
    expect(WEEK_PATH).toContain('g.protagonist.careerStage === "highschool" &&');
    expect(WEEK_PATH).toContain("weekInYear % 4 === 0 &&");
    expect(WEEK_PATH).toContain("weekInYear >= 4");
  });

  it("팀 이름은 `refs.json` 이 정본이다 — 엔진 안에 옛 16팀 표를 두지 않는다", () => {
    expect(WEEK_PATH).toContain(
      "const teamNameOf = (id: string) => m.teams.find((t) => t.id === id)?.name ?? id;",
    );
  });

  it("순위 효과 셋은 주인공이 표에 있을 때만 붙는다", () => {
    expect(WEEK_PATH).toContain(
      'const heroEntry = top10Snap.entries.find((e) => e.id === "PLY_HERO");',
    );
    expect(WEEK_PATH).toContain("const ef = rankEffect(heroEntry.rank);");
  });
});

/**
 * 🔴 **배선 대조군** — 이 블록이 내는 값 여섯이 아래 배치 적용으로 이어진다.
 *   하나만 흘려도 「계산은 맞는데 아무 일이 안 일어난다」가 된다.
 */
describe("🔴 배선 대조군 — 부르는 자리와 받는 값", () => {
  it("주 경계 처리에서 딱 한 번 불린다", () => {
    expect(countOf(WEEK_PATH, "const evtLane = await runEventLaneWeek({")).toBe(1);
    expect(countOf(WEEK_PATH, "const evResult = runEventEngine(")).toBe(1);
  });

  it("내는 값 여섯을 그 자리에서 받아 쓴다", () => {
    expect(WEEK_PATH).toContain("evResult,");
    expect(WEEK_PATH).toContain("top10Snap,");
    expect(WEEK_PATH).toContain("top10Msg,");
    expect(WEEK_PATH).toContain("rankPopularityDelta,");
    expect(WEEK_PATH).toContain("rankScoutScoreDelta,");
    expect(WEEK_PATH).toContain("rankMoraleDelta,");
  });

  it("무대 그룹과 등급 규칙이 같이 넘어간다 — 빠지면 폴백 표가 무대를 안 가린다", () => {
    expect(WEEK_PATH).toContain("stageGroupOf(m.tierRules!, afterP),");
  });
});
