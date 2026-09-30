import { describe, it, expect } from "vitest";
import { weekPathFlat } from "./weekPathSrc";

/**
 * **훈련·컨디션 블록의 갈림길을 못박는다** (2026-09-30 · Ⅱ-1 안전망).
 *
 * 🔴 왜 이 블록에 안전망이 필요한가. 여기가 **씨앗을 안 넘기면 조용히
 *   `thread_rng` 로 떨어지는** 자리 셋을 들고 있다. 실제로 그렇게 났다:
 *   ① 이벤트 난수 배치에 씨앗이 없어 **같은 세이브가 실행마다 달랐고**,
 *      그 차이가 성적 → 진로로 번져 프로에 갔다 독립에 갔다 했다
 *   ② 수술 은퇴 판정도 같은 꼴이었다
 *   그리고 **효율 계수 여덟이 한 줄에 곱해진다** — 하나만 빠지면 그 보상이
 *   데이터에만 있고 아무 일도 안 한다. 예외도 로그도 안 난다.
 *
 * ⚠ 주간 진행 경로 전체를 **한 덩이로** 읽는다(`weekPathFlat`).
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const WEEK_PATH = weekPathFlat();

/** 겹치지 않는 부분 문자열의 등장 횟수 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe("🔴 씨앗 — 안 넘기면 같은 세이브가 실행마다 갈린다", () => {
  it("부상 판정 · 이벤트 난수 · 수술 은퇴 셋 다 씨앗을 받는다", () => {
    expect(WEEK_PATH).toContain('"injury-protagonist"');
    expect(WEEK_PATH).toContain('"event-rands"');
    expect(WEEK_PATH).toContain('"surgery-retire"');
  });

  it("난수는 전부 Rust 에서 온다 — 값을 받는 자리에 `Math.random()` 이 없다", () => {
    // ⚠ **잣대를 좁혔다.** `Math.random()` 만 찾으면 「금지다」라고 적은
    //   **주석 넷**이 걸린다 — 처음에 그렇게 짰고 이 검사가 빨갰다.
    //   실제로 묻는 것은 「그 값을 변수에 받아 쓰는가」다
    expect(WEEK_PATH).not.toContain("= Math.random(");
    expect(WEEK_PATH).not.toContain("(Math.random(");
  });
});

describe("훈련 효율 — 곱해지는 층이 다 있다", () => {
  it("학업·전공·코치·구독·이벤트 보정이 한 산식에 든다", () => {
    expect(WEEK_PATH).toContain("studyResult.efficiencyMod *");
    expect(WEEK_PATH).toContain("univEffMod *");
    expect(WEEK_PATH).toContain("(1 + majorEffBonus + coachEffBonus + subBonus) *");
    expect(WEEK_PATH).toContain("trainEffFactor *");
  });

  it("시설·슬럼프·부상 효율도 같은 산식이다", () => {
    expect(WEEK_PATH).toContain("facilityEffMod *");
    expect(WEEK_PATH).toContain("slumpPenalty *");
    expect(WEEK_PATH).toContain("effectiveInjuryEffMod;");
  });

  it("🔴 프로그램 표를 넘긴다 — 안 넘기면 Rust 가 조용히 굴러가지 않고 터진다", () => {
    expect(WEEK_PATH).toContain("m.trainingPrograms");
  });

  it("개인 트레이닝 보너스는 구독 합이다 — 팀 자원에 반비례한다", () => {
    expect(WEEK_PATH).toContain(
      "const subBonus = trainingSub.byArea.reduce((a, b) => a + b.effective, 0);",
    );
  });
});

describe("부상 — 네 갈래가 배타적이다", () => {
  it("발생 · 회복 중 · 완치 · 전조 넷", () => {
    expect(WEEK_PATH).toContain("if (injuryJustOccurred && injuryState) {");
    expect(WEEK_PATH).toContain("} else if (alreadyInjured && !injuryJustHealed && injuryState) {");
    expect(WEEK_PATH).toContain("} else if (injuryJustHealed) {");
    expect(WEEK_PATH).toContain("} else if (injuryWarning) {");
  });

  it("🔴 전조는 소식을 바로 보내지 않는다 — 월말에 한 통으로 모은다", () => {
    expect(WEEK_PATH).toContain("seasonStore.pushMyBodyEvent({");
    expect(WEEK_PATH).toContain('week: weekNum, kind: "warning",');
  });

  it("중등도 이상만 치료 선택을 묻는다", () => {
    expect(WEEK_PATH).toContain(
      'if (injuryState.severity === "moderate" || injuryState.severity === "severe") {',
    );
  });

  it("🔴 치료비 단위는 만원이다 — 원 단위로 빼면 한 주에 자산이 0 이 된다", () => {
    expect(WEEK_PATH).toContain('conservative: injuryState.severity === "moderate" ? 30 : 50,');
    expect(WEEK_PATH).toContain("counseling: 80,");
  });

  it("수술 은퇴는 NPC 와 같은 표를 쓴다 — 규칙이 없으면 조용히 넘어가지 않고 던진다", () => {
    expect(WEEK_PATH).toContain("const retireRules = await loadRetirementRules();");
    expect(WEEK_PATH).toContain("[은퇴판정] generation_rules.json에 retirementRules가 없다");
    expect(WEEK_PATH).toContain("surgeryRetireChance(g.protagonist.age, hadSurgery, retireRules)");
  });

  it("수술은 재활 단계로 효율을 정한다 — 단계가 넷이다", () => {
    expect(WEEK_PATH).toContain(
      "const SURGERY_REHAB_EFF: Record<number, number> = { 1: 0.0, 2: 0.1, 3: 0.3, 4: 0.6 };",
    );
  });

  it("완치 때 영구 손실과 이력을 같이 남긴다 — 하나만 하면 다음 주에 또 깎는다", () => {
    expect(WEEK_PATH).toContain("const penalty = getPermanentPenalty(prevInj);");
    expect(WEEK_PATH).toContain("growth.protagonistPatch.injuryHistory = [");
    expect(WEEK_PATH).toContain("!g.protagonist.injury.permanentPenaltyApplied");
  });
});

describe("🔴 성실 감쇠 · 사기 회귀 — 소수를 유지한다", () => {
  it("성실은 단방향 감쇠이고 하한이 1 이다", () => {
    expect(WEEK_PATH).toContain("const next = Math.max(1, cur - DILIGENCE_WEEKLY_DECAY);");
    expect(WEEK_PATH).toContain("if (next !== cur) growth.protagonistPatch.diligence = next;");
  });

  it("사기는 순수 함수 하나가 정본이다 — 식을 인라인으로 두면 검사가 사본을 본다", () => {
    expect(WEEK_PATH).toContain("const next = moraleAfterWeek(cur);");
    expect(countOf(WEEK_PATH, "export function moraleAfterWeek(cur: number): number {")).toBe(1);
  });

  it("🔴 1e-9 로 견준다 — 정수로 반올림하면 매주 0 이 되어 아무 일도 안 난다", () => {
    expect(WEEK_PATH).toContain(
      "if (Math.abs(next - cur) > 1e-9) growth.protagonistPatch.morale = next;",
    );
  });
});

describe("문안 은행 — 하나여야 한다", () => {
  it("🔴 난수 **꼬리**에서 떼어 간다 — 앞에서 떼면 이벤트 뽑기가 밀린다", () => {
    expect(WEEK_PATH).toContain("eventRands.slice(-REPORT_RANDS)");
  });

  it("은행은 한 번만 만든다 — 셋이 따로 만들면 같은 인덱스를 뽑는다", () => {
    expect(countOf(WEEK_PATH, "const reportPicker = new BankPicker(")).toBe(1);
  });

  it("난수 개수는 상수 셋의 합이다 — 풀 수로 세지 않는다", () => {
    expect(WEEK_PATH).toContain("const randCount = EVENT_LANE_RANDS + NEWS_RANDS + REPORT_RANDS;");
  });
});

/**
 * 🔴 **배선 대조군** — 이 블록이 내는 값 열이 아래 절 넷으로 흘러간다.
 *   하나만 흘려도 「계산은 맞는데 아무 일이 안 일어난다」가 된다.
 */
describe("🔴 배선 대조군 — 부르는 자리와 받는 값", () => {
  it("주 경계 처리에서 딱 한 번 불린다", () => {
    expect(countOf(WEEK_PATH, "const trainWeek = await runWeeklyTraining({")).toBe(1);
    expect(countOf(WEEK_PATH, "const growth = await calcTrainingGrowth(")).toBe(1);
  });

  it("IPC 다섯을 한 번에 돈다 — 순차로 돌리면 주 진행이 다섯 배 느려진다", () => {
    expect(WEEK_PATH).toContain(
      "const [facilityEffModRaw, injuryCalcRaw, finance, trainingSub, eventRandsRaw] =",
    );
  });

  it("관계도가 쓸 이번 주 OVR 변화를 여기서 잡는다 — 패치가 반영된 뒤엔 못 구한다", () => {
    expect(WEEK_PATH).toContain("const ovrDeltaThisWeek =");
    expect(WEEK_PATH).toContain("await runRelationsWeek(weekNum, ovrDeltaThisWeek, myMods);");
  });

  it("훈련 소식은 null 일 수 있다 — 안 거르면 undefined 키로 세이브가 안 열린다", () => {
    expect(WEEK_PATH).toContain("const weekMessages: MessageItem[] = trainingMsg");
  });

  it("XP 비율은 엔진이 준 값을 그대로 쓴다 — 여기서 다시 곱하면 사본이 되살아난다", () => {
    expect(WEEK_PATH).toContain("xpRatio: growth.xpRatio,");
  });
});
