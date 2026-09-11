import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { visibleNavTabs } from "../../shared/utils/navVisibility";

/**
 * 「병역」 탭의 상무 갈래 (§39 · 사용자 결정 2026-09-03).
 *
 * 🔴 **탭은 이미 보이고 있었다** — 노출은 `careerStage === "military"` 하나가
 * 정하고 상무도 그 값이다(`navVisibility`). 없던 건 **탭 안의 화면**이다:
 * 상무는 옛 배너 한 장과 「현역 전용이다」 한 줄로 끝나 있었다.
 *
 * ⚠ 여기는 배선만 본다 — 문안·일정 목록은 `militarySportsCopy.test.ts` 가
 *   데이터 파일을 직접 읽어 맞춘다.
 */
const PAGE = readFileSync(join(__dirname, "../military/MilitaryPage.svelte"), "utf8");
const PANE = readFileSync(
  join(__dirname, "../../features/military/ui/SportsUnitPane.svelte"),
  "utf8",
);

describe("병역 탭 — 상무", () => {
  it("복무 중이면 탭이 보인다 — 상무도 같은 규칙이다", () => {
    expect(visibleNavTabs({ careerStage: "military" })).toContain("military");
    expect(visibleNavTabs({ careerStage: "pro" })).not.toContain("military");
  });

  it("상무 갈래가 SportsUnitPane 을 그린다", () => {
    expect(PAGE).toContain("SportsUnitPane");
    expect(PAGE, "갈래 키는 militaryUnit === sports 하나다").toContain('militaryUnit === "sports"');
    expect(PAGE, "문안이 없으면 옛 배너로 떨어진다").toContain("sportsReady");
  });

  it("현역 2단 넷을 상무에 안 붙인다", () => {
    // 보직을 안 묻고 경기가 없으니 일과·부대원 카드는 주인이 없다.
    // 빈 카드를 그리면 "왜 비었나"의 답이 화면에 없다 — 아예 안 그린다
    expect(PANE).not.toContain("MilitaryDailyPane");
    expect(PANE).not.toContain("MilitaryMembersPane");
  });

  it("§39 넷을 다 그린다 — 전역 카운트 · 성적 없음 · 부대 일정 · 부대 소식", () => {
    expect(PANE, "전역 카운트가 없다").toContain("copy.discharge.title");
    expect(PANE, "성적 없음 안내가 없다").toContain("copy.noGames.body");
    expect(PANE, "부대 일정이 없다").toContain("sportsCalendar(");
    expect(PANE, "부대 소식이 없다").toContain("militaryNews(");
  });

  it("새 pending 을 안 만든다 — 선택은 지금처럼 모달이 받는다", () => {
    expect(PANE).not.toContain("pushPendingAction");
  });

  it("문장을 코드에 안 적는다 — 총 복무 주도 데이터·상수에서 온다", () => {
    expect(PAGE, "serviceWeeks 정본은 rules.json 이다").toContain("rules?.serviceWeeks");
    expect(PAGE, "폴백은 SERVICE_WEEKS 상수 하나다").toContain("SERVICE_WEEKS");
  });
});
