import type { DecisionEffect } from "../types/main";
import type { EventGrade } from "./tierRules";

/**
 * **구종 보상은 유니크·히든에서만 먹는다** (2026-09-09 · R1 ·
 * `docs/PLAN_REWARDS_2026-09-09.md` §2 · 사용자 확정).
 *
 * ── 왜 ─────────────────────────────────────────────────────────
 * 구종은 이 게임의 핵심 축인데 **커리어 전체에 구종을 주는 보상이 여덟 건뿐**
 * 이었다(실측 733종 중 새 구종 1 · 등급업 1 · 진행도 점프 6). 늘리기로 하면서
 * 사용자가 두 줄을 확정했다:
 *
 *   ① **유니크부터.** 노말·레어는 구종을 안 준다.
 *   ② **훈련이 주, 이벤트는 가속.** 안 뜨면 손해가 아니라 **늦어질 뿐**이라야
 *      운에 덜 휘둘린다.
 *
 * ⚠ **검사만 두지 않는다.** `check:rewards`(B 몫)가 데이터를 볼 예정이지만,
 *   검사는 데이터를 보는 것이지 동작을 막는 것이 아니다 — 검사를 안 돌린
 *   사이에 들어온 데이터는 그대로 먹는다. 갈래(`stateEffects.ts`)를 코드로
 *   막은 것과 같은 이유로 여기서도 막는다.
 * ⚠ **막을 때 조용히 넘어가지 않는다.** 무시했다는 사실을 남긴다.
 * ⚠ 등급을 **모르면 안 먹인다**(`undefined`). 필수·안내 소식에는 등급이 없고,
 *   등급 없는 자리에서 구종이 나오면 그게 바로 「어디서 나온지 모를 보상」이다.
 */
export const PITCH_REWARD_KEYS = ["pitchGrant", "pitchGradeUp", "pitchProgressJump"] as const;

export type PitchRewardKey = (typeof PITCH_REWARD_KEYS)[number];

/** 구종 보상이 먹는 등급 — 유니크·히든 */
export const PITCH_REWARD_GRADES: readonly EventGrade[] = ["unique", "hidden"];

/** 이 효과가 들고 있는 구종 보상 열쇠들 */
export function pitchRewardsOf(fx: DecisionEffect | undefined | null): PitchRewardKey[] {
  if (!fx) return [];
  return PITCH_REWARD_KEYS.filter((k) => (fx as Record<string, unknown>)[k] !== undefined);
}

/**
 * 등급이 허락하지 않으면 구종 보상을 **떼어 낸 사본**을 돌려준다.
 *
 * ⚠ 원본을 안 건드린다 — 소식·pending 에 실린 효과는 스냅샷이라 그대로 남아야
 *   화면이 「무엇이 적혀 있었나」를 그대로 보인다. 안 먹이는 것과 지우는 것은 다르다.
 */
export function gatePitchRewards(
  fx: DecisionEffect,
  grade: EventGrade | undefined,
): DecisionEffect {
  const keys = pitchRewardsOf(fx);
  if (keys.length === 0) return fx;
  if (grade !== undefined && PITCH_REWARD_GRADES.includes(grade)) return fx;

  const next = { ...fx } as Record<string, unknown>;
  for (const k of keys) delete next[k];
  console.warn(
    `[보상] 구종 보상을 무시했다 — ${keys.join("·")} (등급 ${grade ?? "없음"}).`
    + ` 구종은 ${PITCH_REWARD_GRADES.join("·")} 에서만 먹는다`,
  );
  return next as DecisionEffect;
}
