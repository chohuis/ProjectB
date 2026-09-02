import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **해외 진출 배선이 끝까지 이어지는가.**
 *
 * 🔴 이 트랙에서 배선이 한 곳만 빠져 헛돈 적이 두 번 있다:
 *   · 1단계 — TS를 열었는데 Rust가 도로 걸렀다
 *   · 3단계 — 판정을 만들었는데 화면이 없어 지원 자체를 못 했다
 *   **끝에서 끝까지** 이어지는지 본다.
 *
 * ⚠ **정규식을 안 쓴다.** 이스케이프가 한 번 어긋나면 검사가 조용히 헛돈다 —
 *   찾는 문자열을 그대로 적는다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const HUB    = read("apps/ui/src/features/career/ui/CareerChoiceHubModal.svelte");
const MODAL  = read("apps/ui/src/features/career/ui/OverseasApplyModal.svelte");
const RESULT = read("apps/ui/src/features/career/ui/CareerResultModal.svelte");
const SUBMIT = read("apps/ui/src/shared/usecases/careerDecision.ts");
const WEEK   = read("apps/ui/src/shared/usecases/advanceWeek.ts");

describe("해외 2군 직행 배선", () => {
  /**
   * 🔴 **신청이 아니라 제안이다** (2026-09-02 · 사용자 확정 · HANDOFF_A_TO_C §0.45).
   *   허브는 신청 버튼 대신 안내 한 줄 — 제안 수를 **판정과 같은 함수**로 미리 센다.
   *   허브에 "신청"·선택 저장이 다시 생기면 옛 모양이다.
   */
  it("허브가 제안 수를 판정과 같은 함수로 미리 센다 — 신청 버튼·선택 저장은 없다", () => {
    expect(HUB.includes("overseasOfferTeams(")).toBe(true);
    expect(HUB.includes("firstTeamIdOf(")).toBe(true);
    expect(HUB.includes("해외 2군 신청")).toBe(false);
    expect(HUB.includes("overseasChoices")).toBe(false);
    // 문턱 보기(읽기 전용 전망)는 남는다 — 문턱을 숨기지 않는다
    expect(HUB.includes("overseasModalOpen = true")).toBe(true);
  });

  // 🔴 전망 모달이 2군 전력(전부 ★3)으로 세면 판정(부모 1군 전력)과 어긋난다
  it("전망 모달이 부모 1군 전력으로 문턱을 센다", () => {
    expect(MODAL.includes("firstTeamIdOf(")).toBe(true);
    expect(MODAL.includes("dispatch(\"confirm\"")).toBe(false);
  });

  // 28팀까지 온다 — 리그·★이 같이 보이고 목록이 스크롤된다
  it("결과 화면이 제안 목록에 리그·1군 전력★을 적고 스크롤한다", () => {
    expect(RESULT.includes("firstTeamIdOf(")).toBe(true);
    expect(RESULT.includes("overseas-list")).toBe(true);
    expect(RESULT.includes("overflow-y: auto")).toBe(true);
  });

  it("제출이 해외를 함께 보낸다", () => {
    expect(SUBMIT.includes("overseasChoices: (opts.overseasChoices ?? [])")).toBe(true);
  });

  it("주 진행이 판정해 결과에 싣는다 — 신청이 아니라 제안 (2026-09-02)", () => {
    // 28팀 전부를 부모 1군 전력으로 본다. 허브 신청 목록으로 거르면 옛 모양이다
    expect(WEEK.includes("overseasOfferTeams(")).toBe(true);
    expect(WEEK.includes("firstTeamIdOf(")).toBe(true);
    expect(WEEK.includes("overseasChoices.filter(")).toBe(false);
    expect(WEEK.includes("overseasPassed,")).toBe(true);
  });

  it("결과 화면에 합격 버튼이 있다", () => {
    expect(RESULT.includes("overseasPassed")).toBe(true);
    expect(RESULT.includes('chooseResult("overseas", teamId)')).toBe(true);
  });

  it("선택하면 리그 전환까지 간다", () => {
    expect(SUBMIT.includes('kind === "overseas"')).toBe(true);
    // 무대는 리그에서 유도한다 — ABL/JBL을 하나로 굳히면 절반이 틀린다
    expect(SUBMIT.includes("pro_jbl")).toBe(true);
    expect(SUBMIT.includes("pro_abl")).toBe(true);
  });

  /**
   * 🔴 **2군만 후보다.** 1군이 섞이면 아마추어가 바로 ABL 1군에 지원한다.
   */
  it("모달이 2군만 보여준다", () => {
    expect(MODAL.includes("isOverseasFarmTeam(t.leagueId)")).toBe(true);
  });

  /**
   * ⚠ **문턱을 숨기지 않는다.** 지원해 놓고 왜 떨어졌는지 모르면
   *   그 화면은 제비뽑기로 읽힌다.
   */
  it("모달이 팀별 문턱과 내 자격을 보여준다", () => {
    expect(MODAL.includes("cutOf(team.id)")).toBe(true);
    expect(MODAL.includes("필요")).toBe(true);
    expect(MODAL.includes("모자랍니다")).toBe(true);
  });

  /**
   * 🔴 팀 점수를 쓰면 우승팀 벤치가 뚫는다.
   *
   * ⚠ **호출을 본다 — 주석은 세지 않는다.** `calcHsBaseballScore`는 왜 안
   *   쓰는지 설명하려고 주석에 이름이 남아 있다. 파일 전체에서 찾으면
   *   그 주석이 걸려 **검사가 거짓으로 실패한다.**
   */
  it("모달이 개인 기여로 판정한다", () => {
    expect(MODAL.includes("calcIndividualScore(")).toBe(true);
    expect(MODAL.includes("calcHsBaseballScore(")).toBe(false);
  });
});
