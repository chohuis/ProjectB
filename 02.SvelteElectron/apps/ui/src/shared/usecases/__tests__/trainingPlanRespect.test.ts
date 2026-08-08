import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 자동 진행은 플레이어가 정한 훈련 계획을 안 건드린다 ──────────
//
// `applyRecommendedTraining`이 **매주 무조건** 계획을 하드코딩 추천으로
// 덮어썼다. 세 갈래(피로 70+/사기 50-/그 외) 어디에도 `TRN_PITCH_DEV`가
// 없어서 **자동 진행을 쓰면 구종을 영영 못 배웠다.**
//
// Phase 0 실측의 "191주 동안 패스트볼 1등급"이 이것 때문이었다. 화면 기본
// 계획에 구종 개발이 없는 게 원인인 줄 알았는데, 계획을 직접 넣어도 매주
// 지워지고 있었다 — 60회 조사가 잡았다.
//
// 육성 시뮬에서 플레이어가 고른 육성 방향이 사라지는 건 기능이 아니다.
// (사용자 확정 2026-08-09: 플레이어가 정한 계획은 안 건드린다)

// ⚠ 경로 기준은 `shared/`다 — 처음에 한 단계 위로 잡아 네 검사가 전부
// ENOENT로 죽었다. 실패 이유를 안 보면 "기능이 없다"로 읽힌다
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8");

describe("자동 진행이 플레이어 계획을 존중한다", () => {
  it("userSet이면 추천을 건너뛴다", () => {
    const s = read("usecases/runAutoAdvance.ts");
    expect(s).toMatch(/if \(get\(gameStore\)\.trainingPlan\.userSet\) return;/);
  });

  it("추천이 쓸 때는 auto 표식을 남긴다 — 안 그러면 첫 추천 뒤로 추천이 멈춘다", () => {
    const s = read("usecases/runAutoAdvance.ts");
    expect(s).toMatch(/\}, \{ auto: true \}\)/);
  });

  it("스토어가 누가 썼는지 구분한다", () => {
    const s = read("stores/game.ts");
    expect(s).toMatch(/setTrainingPlan\(plan: Partial<TrainingPlanState>, opts\?: \{ auto\?: boolean \}\)/);
    // 자동이 아니면 userSet이 켜져야 한다
    expect(s).toMatch(/userSet: opts\?\.auto \? \(s\.trainingPlan\.userSet \?\? false\) : true/);
  });

  it("화면은 auto 없이 부른다 — 플레이어가 고른 것이 표시돼야 한다", () => {
    const s = read("../pages/training/TrainingPage.svelte");
    // 훈련 화면의 setTrainingPlan 호출에 auto가 붙으면 안 된다
    expect(s).not.toMatch(/setTrainingPlan\([^)]*\{ auto: true \}/);
  });
});
