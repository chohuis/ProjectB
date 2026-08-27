import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isFaEligible, getFaThreshold, canReacquireFa, FA_REACQUIRE_YEARS } from "../faEngine";
import type { ProtagonistSave } from "../../types/save";

/**
 * **FA는 연차가 되어야 열린다 — 부르는 쪽이 아니라 나가는 쪽 문이다.**
 *
 * 🔴 계측이 이 문을 안 지나고 있었다(2026-08-27, 사용자 지적).
 *   게임은 막는다 — `contractDecision`이 `isFaEligible`을 통과해야
 *   `faMarket`을 띄우고, 모달 안에서도 자격이 없으면 버튼이 잠긴다.
 *   그런데 `faOfferProbe`는 프로 무대면 **연차를 안 보고 매 시즌** 불렀다.
 *
 *   그래서 "KBL 팀이 22.6개나 손을 든다"는 수치가 나왔는데, 그 표본의
 *   대부분이 **자격이 없어 애초에 시장이 안 열리는 해**였다.
 *   게임에 없는 상태를 재고 있었던 것이다.
 *
 * ⚠ 정규식을 안 쓴다 — 이스케이프가 어긋나면 검사가 조용히 헛돈다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const MODAL  = read("apps/ui/src/features/contract/ui/FaMarketModal.svelte");
const DECIDE = read("apps/ui/src/shared/usecases/contractDecision.ts");
const PROBE  = read("scripts/perf/perfEntry.ts");
const RULES  = JSON.parse(read("resource/data/master/players/generation_rules.json")) as {
  faRules?: { eligibleYears?: Record<string, number> };
};

const hero = (leagueId: string, years: number): ProtagonistSave =>
  ({ leagueId, proServiceYears: years } as unknown as ProtagonistSave);

describe("FA 자격 문", () => {
  it("연차가 모자라면 FA가 아니다", () => {
    expect(isFaEligible(hero("LEAGUE_KBL", 4), false)).toBe(false);
    expect(isFaEligible(hero("LEAGUE_KBL", 5), false)).toBe(true);
  });

  /** ⚠ 리그마다 다르다 — 하나로 굳히면 절반이 틀린다 */
  it("리그별 연차가 규칙 파일과 같다", () => {
    const y = RULES.faRules?.eligibleYears ?? {};
    for (const lid of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      expect(getFaThreshold(lid)).toBe(y[lid]);
    }
  });

  /**
   * 🔴 **연차를 0으로 되돌려 재취득을 막으면 안 된다.** `proServiceYears`는
   *   연봉 산식의 입력이라, 리셋하면 FA를 신청한 순간 몸값이 신인이 된다.
   */
  it("재취득은 경과 연수로 막는다", () => {
    const ev = [{ year: 2030, eventType: "fa_signed" }];
    expect(canReacquireFa(ev, 2030 + FA_REACQUIRE_YEARS - 1)).toBe(false);
    expect(canReacquireFa(ev, 2030 + FA_REACQUIRE_YEARS)).toBe(true);
    expect(canReacquireFa([], 2030)).toBe(true);   // 첫 취득
  });

  /** 🔴 시장 자체가 자격을 지나야 열린다 */
  it("자격을 지나야 FA 시장이 열린다", () => {
    expect(DECIDE.includes("isFaEligible(g.protagonist, g.schoolState.attendsUniversity) ? \"faMarket\"")).toBe(true);
  });

  /** ⚠ 화면도 잠근다 — 시장이 열린 뒤 자격이 사라질 수 있다 */
  it("자격이 없으면 화면에서 계약을 못 한다", () => {
    expect(MODAL.includes("disabled={resolving || !faEligible")).toBe(true);
  });

  /**
   * 🔴 **계측도 같은 문을 지나야 한다.** 안 그러면 게임에 없는 상태를 재고,
   *   그 숫자로 밸런스를 판단하게 된다.
   */
  it("계측이 자격을 먼저 본다", () => {
    expect(PROBE.includes("const eligible = isFaEligible(")).toBe(true);
    expect(PROBE.includes("if (!eligible) {")).toBe(true);
    // ⚠ 자격 없는 해를 표본에서 조용히 빼면 "몇 해나 못 나갔는가"를 못 잰다
    expect(PROBE.includes("자격: false")).toBe(true);
    expect(PROBE.includes("연차: years")).toBe(true);
  });
});
