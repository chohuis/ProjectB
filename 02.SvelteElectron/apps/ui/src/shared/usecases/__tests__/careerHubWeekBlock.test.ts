import { describe, it, expect } from "vitest";
import { weekPathFlat } from "./weekPathSrc";

/**
 * **진로 허브·진학 확정 블록의 갈림길을 못박는다** (2026-09-30 · Ⅱ-1 안전망).
 *
 * 🔴 왜 이 블록에 안전망이 필요한가. 여기가 **커리어의 외길**이다 — 이 절이
 *   조용히 안 돌면 주인공은 고교에 영원히 남고, 그 뒤의 프로 콘텐츠 전부가
 *   도달 불가가 된다. 실제로 그렇게 났다: `draftDrafted` 를 true 로 만드는
 *   코드가 어디에도 없어 **주인공은 절대 지명될 수 없었다**(옮긴 파일 주석).
 *   예외도 로그도 안 난다 — 그냥 아무 일이 안 일어난다.
 *
 * ⚠ 주간 진행 경로 전체를 **한 덩이로** 읽는다(`weekPathFlat`) — 쪼개기 전후에
 *   검사 문장이 한 글자도 안 바뀐다. 띄어쓰기를 눌러서 보므로 prettier 가
 *   식을 접어도 안 깨진다(A-6).
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const WEEK_PATH = weekPathFlat();

/** 겹치지 않는 부분 문자열의 등장 횟수 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe("진로 허브 트리거 — 갈림길 셋", () => {
  it("무대마다 주차가 다르다 — 상수에서 오고 숫자를 박지 않는다", () => {
    expect(WEEK_PATH).toContain("weekInYear === HS_CAREER_HUB_WEEK &&");
    expect(WEEK_PATH).toContain("weekInYear === UNIV_CAREER_HUB_WEEK &&");
    expect(WEEK_PATH).toContain("weekInYear === INDIE_CAREER_HUB_WEEK &&");
  });

  it("고교는 2학년 끝에 묻는다 — 학년은 `careerStageYear` 가 정본이다", () => {
    expect(WEEK_PATH).toContain("careerStageYear === 2 &&");
  });

  it("한 번만 묻는다 — 고교는 트리거 표식, 대학·독립은 제출 여부와 pending 이 가드다", () => {
    expect(WEEK_PATH).toContain("!gLatest.schoolState.careerChoiceTriggered;");
    expect(WEEK_PATH).toContain("!gLatest.schoolState.careerApplicationsSubmitted &&");
    expect(WEEK_PATH).toContain("gameStore.markCareerChoiceTriggered();");
  });

  it("🔴 고교 허브에서만 두 리그를 미리 켠다 — 안 켜면 드래프트 라운드가 텅 빈다", () => {
    expect(WEEK_PATH).toContain("if (needsHsHub) {");
    expect(WEEK_PATH).toContain(
      'await ensureLeagueActivatedV3("LEAGUE_UNIVERSITY", s.seasonYear);',
    );
    expect(WEEK_PATH).toContain(
      'await ensureLeagueActivatedV3("LEAGUE_INDEPENDENT", s.seasonYear);',
    );
  });
});

describe("진로 결과 계산 — 갈림길", () => {
  it("고교는 3학년만, 대학·독립은 학년을 안 본다", () => {
    expect(WEEK_PATH).toContain("gDraft.protagonist.grade === 3 &&");
    expect(WEEK_PATH).toContain("weekInYear === CAREER_RESULT_WEEK &&");
  });

  it("🔴 학적 역행을 막는다 — 대학 재학생의 대학 지망을 그대로 처리하면 두 번 입학이다", () => {
    expect(WEEK_PATH).toContain("canApplyToUniversity(p.careerStage)");
    expect(WEEK_PATH).toContain("canApplyToIndependent(p.careerStage)");
  });

  it("진학 판정에 씨앗을 넘긴다 — 안 넘기면 같은 세이브가 매번 다른 진로로 간다", () => {
    expect(WEEK_PATH).toContain('"admissions",');
  });

  it("요건은 팀 전력★에서 온다 — 하드코딩 표를 다시 만들지 않는다", () => {
    expect(WEEK_PATH).toContain("requirementOfPower(teamsNow.find((t) => t.id === teamId)?.power)");
    expect(WEEK_PATH).toContain("indieCutOfPower(teamsNow.find((t) => t.id === teamId)?.power)");
  });

  it("상무는 진학 판정에서 뺀다 — 병역 경로가 따로 있다", () => {
    expect(WEEK_PATH).toContain(".filter(isApplicableIndependent)");
  });

  it("🔴 신청했을 때만 지명 판정을 돌린다", () => {
    expect(WEEK_PATH).toContain("const draftOutcome = draftApplied");
    expect(WEEK_PATH).toContain(": { drafted: false };");
  });

  it("🔴 결과를 세이브에 싣는다 — `draftDrafted` 를 못박으면 프로에 못 간다", () => {
    expect(WEEK_PATH).toContain("draftDrafted: draftOutcome.drafted,");
    expect(WEEK_PATH).not.toContain("draftDrafted: false,");
  });

  it("일어난 일을 적는다 — 미지명 문안이 조건을 따로 세지 않게", () => {
    expect(WEEK_PATH).toContain('kind: draftOutcome.drafted ? "drafted" : "undrafted",');
  });

  it("🔴 해외 2군은 신청이 아니라 제안이다 — 허브에서 고른 곳을 판정에 안 쓴다", () => {
    expect(WEEK_PATH).toContain(
      "overseasOfferTeams(p.pitching.ovr, indivScore, overseasFarmTeams)",
    );
    expect(WEEK_PATH).not.toContain("overseasChoices.filter(");
  });

  it("해외 제안은 개인 기여를 본다 — 우승팀이면 벤치도 100점인 팀 점수가 아니다", () => {
    expect(WEEK_PATH).toContain("const indivScore = calcIndividualScore(");
  });

  it("해외 2군 후보는 범위 안 2군 팀뿐이다 — 리그를 손으로 적지 않는다", () => {
    expect(WEEK_PATH).toContain(".filter((lid) => isLeagueInScope(lid))");
    expect(WEEK_PATH).toContain("ALL_TEAMS_BY_LEAGUE[lid]");
  });
});

describe("배경 고교 졸업생 드래프트 — 갈림길", () => {
  it("주인공 결과 케이스가 아닐 때만 돈다 — 같은 주에 둘 다 돌면 안 된다", () => {
    // 눌러서 본 글자를 그대로 적는다 — 정규식을 안 쓴다(CLAUDE.md)
    expect(WEEK_PATH).toContain(
      "weekInYear === CAREER_RESULT_WEEK && !isHsResultWeek && !isUnivResultWeek &&" +
        " !hasCareerPending",
    );
  });

  it("같은 pending 을 두 번 밀지 않는다", () => {
    expect(WEEK_PATH).toContain('(a) => a.type === "draftObserve"');
    expect(WEEK_PATH).toContain('seasonStore.pushPendingAction({ type: "draftObserve" });');
  });

  it("배경 풀도 두 리그를 Lazy 활성화한다 — 주인공 학년과 무관한 세계 이벤트다", () => {
    expect(WEEK_PATH).toContain(
      'await ensureLeagueActivatedV3("LEAGUE_UNIVERSITY", seasonYearNow);',
    );
  });
});

/**
 * 🔴 **배선 대조군** — 이 블록의 결함은 늘 「계산은 맞는데 부르는 자리가
 *   없다」 꼴이었다. 부르는 자리 수와 넘기는 값을 못박는다.
 */
describe("🔴 배선 대조군 — 부르는 자리와 넘기는 값", () => {
  it("주 경계 처리에서 딱 한 번 불린다", () => {
    expect(countOf(WEEK_PATH, "await runCareerHubWeek({")).toBe(1);
    expect(countOf(WEEK_PATH, "gameStore.setCareerResults({")).toBe(1);
    expect(countOf(WEEK_PATH, "await determineProtagonistDraft(")).toBe(1);
  });

  it("상대평가 입력 넷이 같이 넘어간다 — 하나라도 빠지면 Rust 가 조용히 폴백한다", () => {
    expect(WEEK_PATH).toContain("{ peerOvrs, teamAceRank, ...hsInputs, ...injuryCounts },");
  });

  it("그 해 지명 순서를 넘긴다 — 안 넘기면 순번의 주인이 다른 팀이 된다", () => {
    expect(WEEK_PATH).toContain("draftOrderOf(get(seasonStore).prevSeasonKblStandings ?? [])");
  });

  it("또래·부상은 정본 함수를 거친다 — 여기서 다시 세면 그게 사본이다", () => {
    expect(WEEK_PATH).toContain("livePitchingOvrOf(n, liveStats)");
    expect(WEEK_PATH).toContain("hsDraftInputsOf(p.careerRecords ?? [])");
    expect(WEEK_PATH).toContain(
      "draftInjuryCounts(p.injuryHistory ?? [], get(seasonStore).seasonYear)",
    );
  });

  it("허브 pending 셋이 같은 자리에서 나간다", () => {
    expect(countOf(WEEK_PATH, 'seasonStore.pushPendingAction({ type: "careerChoiceHub" });')).toBe(
      1,
    );
    expect(countOf(WEEK_PATH, 'seasonStore.pushPendingAction({ type: "careerResults" });')).toBe(1);
  });
});
