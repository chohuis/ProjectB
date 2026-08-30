import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  medicalRecoveryMult, medicalRecoveryWeeks, campConditionBonus, qualityGrade,
} from "../clubEffects";

/**
 * 구단 효과 계산 — **식은 한 곳에만 둔다** (B단계).
 *
 * 🔴 화면이 값을 다시 계산하면 실제와 갈린다. 의료 배수를 `injuries.ts` 가
 *   쓰고 팀 상세가 또 적으면, 규칙 파일을 바꿨을 때 **한쪽만 따라간다.**
 *   이 저장소에서 반복된 형태다(스태프 계수 15건 · 로스터 상한 · 투수 비율).
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const rules = JSON.parse(
  read("resource/data/master/players/generation_rules.json"),
) as {
  medicalRules?: { recoverySpan?: number; minWeeks?: number };
  campRules?: { conditionBonus?: number };
};

describe("구단 효과 계산", () => {
  const span = rules.medicalRules!.recoverySpan!;
  const minW = rules.medicalRules!.minWeeks!;

  it("의료 — 50이 기준이고 좋을수록 짧다", () => {
    expect(medicalRecoveryMult(50, span)).toBe(1);
    expect(medicalRecoveryMult(95, span)).toBeLessThan(1);
    expect(medicalRecoveryMult(5, span)).toBeGreaterThan(1);
  });

  it("의료 — 아무리 좋아도 하한을 지킨다", () => {
    // 0주가 되면 부상이 없는 것과 같다.
    //
    // ⚠ **지금 값(span 0.25)에서는 하한이 안 걸린다** — 최대 축소가
    //   0.775배라 1주가 0으로 안 내려간다. 그래서 **큰 span 으로 확인한다**:
    //   규칙 값을 키웠을 때 하한이 실제로 막는지가 이 검사의 요점이다.
    //   (실측: 지금 값으로만 재면 하한을 지워도 통과한다 — 변이로 확인했다)
    expect(medicalRecoveryWeeks(1, 99, 0.9, minW),
      "큰 span 에서 0주가 되면 안 된다").toBeGreaterThanOrEqual(minW);
    expect(medicalRecoveryWeeks(8, 95, span, minW)).toBeLessThan(8);
    expect(medicalRecoveryWeeks(8, 5, span, minW)).toBeGreaterThan(8);
  });

  it("전훈 — 50이 기준이다", () => {
    const b = rules.campRules!.conditionBonus!;
    expect(campConditionBonus(50, b)).toBe(b);
    expect(campConditionBonus(100, b)).toBe(b * 2);
    expect(campConditionBonus(0, b)).toBe(0);
  });

  it("등급이 다섯 칸이다", () => {
    const all = [95, 70, 50, 35, 10].map(qualityGrade);
    expect(new Set(all).size).toBe(5);
  });
});

describe("식이 두 벌이 아니다", () => {
  const strip = (s: string) => s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const inj = strip(read("apps/ui/src/shared/usecases/weekPhases/injuries.ts"));
  const adv = strip(read("apps/ui/src/shared/usecases/advanceWeek.ts"));
  const modal = strip(read("apps/ui/src/features/team/ui/TeamDetailModal.svelte"));

  it("세 곳이 모두 공용 함수를 쓴다", () => {
    expect(inj.includes("medicalRecoveryWeeks("), "부상 처리").toBe(true);
    expect(adv.includes("campConditionBonus("), "주 경계").toBe(true);
    expect(modal.includes("medicalRecoveryMult("), "팀 상세 의료").toBe(true);
    expect(modal.includes("campConditionBonus("), "팀 상세 전훈").toBe(true);
  });

  it("🔴 어디에도 식을 다시 적지 않는다", () => {
    // `1 - ((q - 50) / 50) * span` 같은 게 남아 있으면 두 벌이다
    for (const [name, src] of [["injuries", inj], ["advanceWeek", adv], ["modal", modal]] as const) {
      expect(src.includes("- 50) / 50) *"), `${name} 에 의료 식이 남았다`).toBe(false);
      expect(src.includes("* (inv / 50)"), `${name} 에 전훈 식이 남았다`).toBe(false);
    }
  });
});

describe("팀 상세 표시", () => {
  const modal = readFileSync(
    resolve(ROOT, "apps/ui/src/features/team/ui/TeamDetailModal.svelte"), "utf8");

  it("네 항목을 보인다", () => {
    expect(modal.includes("의료팀")).toBe(true);
    expect(modal.includes("전지훈련")).toBe(true);
    expect(modal.includes("외국인")).toBe(true);
    expect(modal.includes("영구결번")).toBe(true);
  });

  it("외국인 한도를 3으로 보인다", () => {
    // 한도는 `applyForeignTurnover` 가 지키는 값과 같아야 한다
    expect(modal.includes("{foreignHeld.length} / 3")).toBe(true);
  });
});
