import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 자동 진행도 구종을 배운다 ────────────────────────────────────
//
// `applyRecommendedTraining`의 세 갈래(피로/사기/기본) 어디에도 구종 개발이
// 없었다. 계획을 직접 안 짜면 **자동 진행이 구종을 영영 안 배운다.**
//
// NPC는 `decide_pitch_training`으로 2~4구종까지 키운다
// (실측 2026-08-10: 2구종 47% · 3구종 46% · 4구종 5%).
// 주인공만 2개에 머물면 그 격차가 그대로 성적이 된다 —
// **구종 하나 차이가 ERA 9.07 vs 4.52였다.**
//
// ⚠ `userSet` 가드는 그대로다. 플레이어가 정한 계획은 안 건드린다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("자동 진행 구종 개발", () => {
  const src = read("apps/ui/src/shared/usecases/runAutoAdvance.ts");

  it("기본 갈래에 구종 개발이 들어간다", () => {
    expect(src).toMatch(/ensurePitchTraining\(p\) \? "TRN_PITCH_DEV" : "TRN_RECOVERY"/);
  });

  it("플레이어가 정한 계획은 여전히 안 건드린다", () => {
    // 이 가드가 사라지면 육성 선택이 매주 조용히 덮인다
    expect(src).toMatch(/if \(get\(gameStore\)\.trainingPlan\.userSet\) return;/);
  });

  it("이미 익히는 중이면 대상을 안 바꾼다 — 매주 바꾸면 아무것도 못 끝낸다", () => {
    expect(src).toMatch(/if \(p\.trainingPitchState\) return true;/);
  });

  it("목표 구종 수가 NPC 규칙과 같다", () => {
    // `npc_sim.rs`의 `npc_pitch_target`: SP는 velocity 70 이상이면 4, 아니면 5
    expect(src).toMatch(/p\.pitching\.velocity >= 70 \? 4 : 5/);
    const rust = read("packages/engine-native/src/npc_sim.rs");
    expect(rust).toMatch(/"SP" => if velocity >= 70\.0 \{ 4 \} else \{ 5 \}/);
  });

  it("미달이면 새로 배우고, 채웠으면 등급을 올린다", () => {
    expect(src).toMatch(/owned\.length < target/);
    expect(src).toMatch(
      /\.filter\(\(x\) => x\.grade < 5\)\.sort\(\(a, b\) => a\.grade - b\.grade\)/,
    );
  });

  it("난이도 낮은 구종부터 고른다", () => {
    expect(src).toMatch(/\(a\.formDifficulty \?\? 9\) - \(b\.formDifficulty \?\? 9\)/);
  });

  it("구종 수 상한 5를 넘지 않는다", () => {
    expect(src).toMatch(/owned\.length < 5/);
  });
});
