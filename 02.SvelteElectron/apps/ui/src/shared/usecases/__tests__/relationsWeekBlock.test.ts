import { describe, it, expect } from "vitest";
import { weekPathFlat } from "./weekPathSrc";

/**
 * **관계도 주간 블록의 갈림길을 못박는다** (2026-09-27 · Ⅱ-1 쪼개기의 안전망).
 *
 * 🔴 왜 쪼개기 **전에** 쓰나. 이 블록은 **조용히 죽는 데 선수**다 — 통째가
 *   `try/catch` 로 싸여 있어(「관계도가 못 돌아도 주간 진행은 막지 않는다」)
 *   안에서 무엇이 빠져도 화면에 아무 말이 안 난다. 실제로 그렇게 두 번
 *   났다: ① 경기 주차를 `weekNum` 으로 봐서 **동료 30명 전원이 초기값**이었고
 *   ② `ovrDelta` 에 0 이 박혀 성장 보너스가 죽어 있었다. 둘 다 실측에서만
 *   갈렸다(`measure:relations`).
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

describe("관계도 주간 블록 — 갈림길", () => {
  it("v3 슬롯일 때만 돈다 — 슬롯 id 가 없으면 아예 안 들어간다", () => {
    expect(WEEK_PATH).toContain("if (isV3SlotActive() && slotId) {");
  });

  it("소속 정합이 먼저다 — 팀이 바뀌었으면 감쇠·apart 를 하고 새 인원을 만든다", () => {
    expect(WEEK_PATH).toContain("await reconcileRelationships({");
    // 팀 변경 훅을 개별 지점에 박지 않는다 — 여기 하나가 정본이다
    expect(WEEK_PATH).toContain("teamId: gRel.protagonist.teamId,");
  });

  it("🔴 경기 주차는 weekNum - 1 이다 — 막 들어선 주의 경기는 아직 안 치렀다", () => {
    expect(WEEK_PATH).toContain("const gameWeek = weekNum - 1;");
    expect(WEEK_PATH).toContain("e.week === gameWeek && e.isProtagonistGame && e.result != null,");
  });

  it("🔴 ovrDelta 에 0 을 박지 않는다 — 박으면 성장 보너스가 영영 안 열린다", () => {
    expect(WEEK_PATH).toContain("ovrDelta: ovrDeltaThisWeek,");
    expect(WEEK_PATH).not.toContain("ovrDelta: 0,");
  });

  it("등판 여부·성적은 경기 라인이 정본이다 — 누적 stats 에서 역산하지 않는다", () => {
    expect(WEEK_PATH).toContain("const lines = myResult?.playerLines ?? [];");
    expect(WEEK_PATH).toContain(
      "const era = myLine && myLine.ip > 0 ? (myLine.er * 9) / myLine.ip : 0;",
    );
  });

  it("라이벌은 상대 선발 하나뿐이다 — 불펜까지 잡으면 관계가 폭증한다", () => {
    expect(WEEK_PATH).toContain(".slice(0, 1)");
  });

  it("이야기 인물 등록부는 여기서만 채운다 — 안 바뀌면 store 를 안 건드린다", () => {
    expect(WEEK_PATH).toContain("const nextRegistry = nextStoryNpcs(gRel.protagonist.storyNpcs, {");
    expect(WEEK_PATH).toContain("if (nextRegistry) gameStore.setStoryNpcs(nextRegistry);");
  });

  it("라벨이 바뀐 것만 알린다 — 값은 플레이어에게 안 보여준다", () => {
    expect(WEEK_PATH).toContain("const msgs = buildRelationMessages(");
    expect(WEEK_PATH).toContain("if (msgs.length) gameStore.addMessages(msgs);");
  });

  it("관계도가 죽어도 주 진행은 안 막는다", () => {
    expect(WEEK_PATH).toContain("관계도 갱신 실패 — 이번 주는 건너뜀");
  });
});

/**
 * 🔴 **배선 대조군** — 이 블록은 통째가 `try/catch` 라, 부르는 자리를 흘려도
 *   예외 하나 안 난다. **부르는 자리와 넘기는 값**을 못박는다.
 */
describe("🔴 배선 대조군 — 부르는 자리와 넘기는 값", () => {
  it("주 경계 처리에서 딱 한 번 불린다", () => {
    expect(countOf(WEEK_PATH, "await applyWeeklyRelations({")).toBe(1);
    expect(countOf(WEEK_PATH, "await reconcileRelationships({")).toBe(1);
  });

  it("이번 주 훈련 보정이 실제로 넘어간다 — 안 넘기면 코치 관계가 안 움직인다", () => {
    expect(WEEK_PATH).toContain("relationMod: myMods.relation,");
    expect(WEEK_PATH).toContain("const trainingArea = await trainingAreaOf(focus);");
    expect(WEEK_PATH).toContain("trainingDone: hasTrainingPlan,");
    expect(WEEK_PATH).toContain("trainingSkipped: !hasTrainingPlan,");
  });

  it("지명 순위는 감독 초기값에만 붙는다 — 두 칸이 같이 넘어간다", () => {
    expect(WEEK_PATH).toContain("draftRound: gRel.schoolState.careerResults?.draftRound ?? 0,");
    expect(WEEK_PATH).toContain("draftedContext: !!gRel.schoolState.careerResults?.draftDrafted,");
  });
});
