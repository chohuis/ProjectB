import { describe, it, expect } from "vitest";
import { countsAsProSeason } from "../game";

/**
 * 프로 연차를 세는 기준 — **단계만 보면 틀린다.**
 *
 * 드래프트 결정이 먼저 `careerStage`를 pro로 바꾸므로, 고교 시즌을 끝내는
 * 순간 이미 프로로 읽혀 "프로에서 한 경기도 안 뛰었는데 연차 1"이 됐다(A7).
 * 그래서 **끝나는 그 시즌을 어디서 보냈는지**를 같이 본다.
 *
 * ⚠ 연차는 FA 자격(5년)·연봉·은퇴 판정에 물려 있다. 한쪽으로 틀리면
 *   자격이 영영 안 차고, 반대로 틀리면 신인이 베테랑 대우를 받는다.
 */
describe("프로 연차로 세어지는 시즌", () => {
  it("🔴 드래프트 직후 고교 시즌을 끝내는 해는 안 센다 — A7 그 자체", () => {
    // 단계는 이미 pro_kbl인데 그 시즌은 고교에서 보냈다
    expect(countsAsProSeason("pro_kbl", "LEAGUE_HIGHSCHOOL")).toBe(false);
    expect(countsAsProSeason("pro_kbl", "LEAGUE_UNIVERSITY")).toBe(false);
  });

  it("프로 시즌은 센다 — 세 리그", () => {
    for (const lg of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
      expect(countsAsProSeason("pro_kbl", lg), lg).toBe(true);
    }
  });

  it("⚠ **2군 시즌도 센다** — 빼면 2군 체류가 긴 선수의 FA 자격이 영영 안 찬다", () => {
    for (const lg of ["LEAGUE_KBL_FARM", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]) {
      expect(countsAsProSeason("pro_kbl", lg), lg).toBe(true);
    }
  });

  it("프로가 아닌 단계는 리그와 무관하게 안 센다", () => {
    for (const stage of ["highschool", "university", "independent", "military"]) {
      expect(countsAsProSeason(stage, "LEAGUE_KBL"), stage).toBe(false);
    }
  });

  it("독립리그 시즌은 안 센다 — 프로 단계여도", () => {
    expect(countsAsProSeason("pro_kbl", "LEAGUE_INDEPENDENT")).toBe(false);
  });

  it("리그를 안 넘기면 예전대로 단계만 본다 — 구 호출부 호환", () => {
    expect(countsAsProSeason("pro_kbl", undefined)).toBe(true);
    expect(countsAsProSeason("highschool", undefined)).toBe(false);
  });

  it("단계 이름 넷을 다 받는다 — pro / pro_kbl / pro_abl / pro_jbl", () => {
    for (const stage of ["pro", "pro_kbl", "pro_abl", "pro_jbl"]) {
      expect(countsAsProSeason(stage, "LEAGUE_KBL"), stage).toBe(true);
    }
  });
});
