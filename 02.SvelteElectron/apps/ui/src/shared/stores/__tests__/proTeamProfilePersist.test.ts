import { describe, it, expect } from "vitest";
import { makeSaveGame, type SaveGame } from "../../types/save";
import { deriveProfileFromBudgetIndex } from "../game";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 구단 성향이 **저장 왕복을 탄다.**
 *
 * 🔴 예전엔 `gameStore.proTeamProfiles`에 "비저장"이라고 적혀 있었다.
 * 시즌 종료마다 `calc_win_now_pressure_update`로 갱신하는데 **앱을 껐다 켜면
 * 전부 50으로 돌아갔다** — 성적 압박 모델 전체가 세션 한정이었다.
 * 승강 임계값(`10.0 - win_now_pressure * 0.05`) · 방출 판정(`× 1.3`) ·
 * FA 입찰이 그 값을 쓴다.
 *
 * `CLAUDE.md`의 "가드는 반드시 저장한다"와 같은 형태다 — 갱신 결과는 영구인데
 * 값 자신이 세션 한정이면 없던 일이 된다.
 *
 * ⚠ **저장과 복원을 둘 다 본다.** 저장만 하고 `fromSaveGame`이 안 읽으면
 * 아무 일도 안 일어나는데, 그건 오류가 아니라 "조용히 예전 동작"으로 나타난다.
 */

const P = {
  protagonist: {},
  mailbox: [],
  trainingPlan: {},
  schoolState: {},
  achievements: [],
  achievementMetrics: {},
  recentLogs: [],
  recentUpcoming: [],
  npcs: [],
} as never;

describe("구단 성향 저장", () => {
  it("makeSaveGame이 성향을 싣는다", () => {
    const profiles = { TEAM_KBL_A_1: { winNowPressure: 82, stability: 40 } };
    const save = makeSaveGame(
      P as never,
      [],
      {} as never,
      {} as never,
      [],
      {} as never,
      [],
      [],
      [],
      undefined,
      { proTeamProfiles: profiles },
    ) as SaveGame;
    expect(save.proTeamProfiles, "저장 blob에 성향이 없다").toBeTruthy();
    expect(
      (save.proTeamProfiles as Record<string, { winNowPressure: number }>).TEAM_KBL_A_1
        .winNowPressure,
    ).toBe(82);
  });

  it("성향을 안 넘기면 필드가 비어 있다 — 대조군", () => {
    // 이 검사가 없으면 위 검사가 "항상 통과"일 수 있다
    const save = makeSaveGame(
      P as never,
      [],
      {} as never,
      {} as never,
      [],
      {} as never,
      [],
      [],
      [],
      undefined,
      {},
    ) as SaveGame;
    expect(save.proTeamProfiles).toBeUndefined();
  });

  /**
   * 🔴 **파생된 기질 셋도 왕복을 타야 한다** (2026-09-22). 철학·자원에서
   *   나온 값이라 "다시 구하면 되지"로 보이지만, 시즌마다
   *   `updateProTeamProfiles` 가 갱신하므로 **파생값은 시작점일 뿐**이다.
   *   안 실리면 껐다 켤 때마다 그 갱신이 사라진다.
   */
  it("성향에서 나온 기질 셋이 왕복을 탄다", () => {
    const derived = deriveProfileFromBudgetIndex(1.0, {
      philosophy: "스파르타(혹독훈련)",
      resource: "알뜰",
    });
    // 대조군 — 셋이 50이면 "왕복했다"를 기본값과 못 가른다
    expect(derived.stability).not.toBe(50);
    expect(derived.discipline).not.toBe(50);
    expect(derived.clubhouseCulture).not.toBe(50);

    const save = makeSaveGame(
      P as never,
      [],
      {} as never,
      {} as never,
      [],
      {} as never,
      [],
      [],
      [],
      undefined,
      { proTeamProfiles: { TEAM_KBL_A_1: derived } },
    ) as SaveGame;
    const back = (save.proTeamProfiles as Record<string, typeof derived>).TEAM_KBL_A_1;
    expect(back).toEqual(derived);
  });

  it("복원 경로가 저장된 값을 읽는다 — 소스 확인", () => {
    // ⚠ 소스를 훑는 검사라 배선까지는 못 본다. 다만 `fromSaveGame`이
    // `saved.proTeamProfiles`를 아예 안 읽으면 여기서 잡힌다
    const src = readFileSync(join(__dirname, "../game.ts"), "utf8");
    expect(src, "fromSaveGame이 저장된 성향을 안 읽는다").toContain("saved.proTeamProfiles");
    expect(src, "toSaveGame이 성향을 안 싣는다").toContain("proTeamProfiles: s.proTeamProfiles");
  });
});
