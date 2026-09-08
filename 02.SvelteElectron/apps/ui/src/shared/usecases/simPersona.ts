import type { DecisionEffect } from "../types/main";
import type { CareerStage } from "../types/save";

/**
 * **계측 플레이어의 성향 셋** (2026-09-09 · 계측 2-3 · 사용자 확정).
 *
 * 🔴 왜 필요했나. 사용자 지적이다 — 계측이 재는 「플레이어」가 **하나뿐이고
 *   대부분의 주에 첫 갈래를 고른다.** 첫 갈래는 사람의 취향이 아니라
 *   **데이터 작성 순서**다. 그걸로 잰 밸런스는 「JSON 에 먼저 적힌 쪽」의 밸런스다.
 *
 * | 성향 | 무엇을 보나 | 쓰는 자리 |
 * |---|---|---|
 * | `growth` | **즉시 스탯 상승이 있으면 그것 먼저**, 없으면 그 시기 주력 스탯 | 🔴 **밸런스의 기준** |
 * | `safe` | 몸을 지킨다 — 피로·부상 위험·컨디션 | 하한 확인 |
 * | `lazy` | **씨앗 고정 무작위** | 바닥 확인 |
 *
 * ⚠ `lazy` 는 「첫 갈래」가 아니다. 그건 사람이 아니라 데이터 순서를 재는 꼴이라
 *   **씨앗으로 고정한 무작위**로 바꿨다 — 재현되면서 순서에 안 매인다.
 * ⚠ **구종 관리는 셋 다 같다**(사용자 확정) — `ensurePitchTraining` 규칙 그대로.
 *   구종은 취향이 아니라 이 게임의 축이라 성향으로 가르면 축이 흔들린다.
 * ⚠ 성향은 **계측 전용**이다. 실제 플레이는 사람이 고른다.
 */
export type SimPersona = "growth" | "safe" | "lazy";

export const SIM_PERSONAS: readonly SimPersona[] = ["growth", "safe", "lazy"];

/**
 * 무대별 주력 스탯 — `BALANCE_BACKLOG §16-2`(B 실측)가 정본이다.
 *
 * ⚠ 여기 표를 늘릴 때 그 문서도 같이 고쳐라. 두 벌이 되면 한쪽만 고쳐진 채 남는다.
 * ⚠ 위기집중력·견제는 뺐다 — OVR 가중 0.3·0.2 에 에이징에도 안 걸려
 *   **값이 거의 안 남는 스탯**이다(§16-2 꼬리).
 */
export function primaryStatsFor(stage: CareerStage, farm: boolean): readonly string[] {
  if (farm) return ["velocity", "movement", "stamina", "control"];
  switch (stage) {
    case "highschool":
    case "university":
    case "independent":
      return ["velocity", "command", "control"];
    case "pro_kbl":
    case "pro_abl":
    case "pro_jbl":
      return ["stamina", "control", "command"];
    default:
      return ["velocity", "command", "control"];
  }
}

/** 이 효과가 **몸에 나쁜** 정도 — 클수록 나쁘다. `safe` 가 작은 쪽을 고른다 */
export function bodyCost(fx: DecisionEffect | undefined): number {
  if (!fx) return 0;
  return (fx.fatigueDelta ?? 0)
    // 컨디션은 **낮아지는 것이 나쁘다** — 부호를 뒤집어 더한다
    - (fx.conditionDelta ?? 0)
    // 부상 위험은 음수가 「덜 다친다」다(`types/main`) — 그대로 더하면 부호가 맞는다
    + (fx.injuryRiskMod ? fx.injuryRiskMod.pct : 0);
}

/**
 * 이 효과가 **성장에 좋은** 정도 — 클수록 좋다.
 *
 * 사용자 확정 순서: **즉시 스탯 상승이 있으면 그것 먼저**, 없으면 그 시기 주력 스탯.
 * 그래서 즉시 스탯(`statDelta`)에 큰 자리값을 준다 — XP 몇 점으로는 못 뒤집는다.
 */
export function growthValue(
  fx: DecisionEffect | undefined,
  primary: readonly string[],
): number {
  if (!fx) return 0;
  const key = (k: string) => (k.includes(".") ? k.split(".")[1] : k);
  let v = 0;
  // ① 즉시 스탯 — 자리값을 크게 준다(「있으면 그것 먼저」)
  for (const [k, amt] of Object.entries(fx.statDelta ?? {})) {
    if (key(k) === "ovr") continue;               // 파생값이라 안 오른다
    v += amt * (primary.includes(key(k)) ? 120 : 80);
  }
  // ② 잠재력·성장률 — 스탯은 아니지만 성장의 상한을 민다
  v += (fx.potentialDelta ?? 0) * 60 + (fx.devRateDelta ?? 0) * 12;
  // ③ 구종 — 이 게임의 축이다. 다만 성향으로 가르지 않기로 했으므로(구종 관리는
  //    셋 다 같다) **고르는 자리에서만** 값을 준다
  if (fx.pitchGrant) v += 90;
  if (fx.pitchGradeUp) v += 70;
  if (fx.pitchProgressJump) v += fx.pitchProgressJump.pct * 0.8;
  // ④ 훈련 효율 — 주 수만큼 곱한다(레어의 주력 보상)
  if (fx.trainEffBoost) v += fx.trainEffBoost.pct * fx.trainEffBoost.weeks * 0.15;
  // ⑤ XP — 주력이면 더 친다
  for (const [k, amt] of Object.entries(fx.xp ?? {})) {
    v += amt * (primary.includes(key(k)) ? 1.5 : 1.0);
  }
  return v;
}

/**
 * 씨앗 고정 무작위 — `lazy` 가 쓴다.
 *
 * ⚠ `Math.random()` 금지(CLAUDE.md)라 **씨앗에서 뽑는다.** 같은 판을 다시 돌리면
 *   같은 선택이 나와야 계측이 재현된다.
 */
export function seededIndex(seed: number, n: number): number {
  if (n <= 1) return 0;
  // xorshift 한 바퀴 — 값이 아니라 흩어짐만 필요하다
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;  x >>>= 0;
  return x % n;
}
