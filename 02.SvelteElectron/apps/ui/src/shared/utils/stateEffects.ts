import type { DecisionEffect } from "../types/main";

/**
 * **상태 효과** — 세계를 바꾸는 보상 열쇠. 갈래를 가르는 자다.
 *
 * 🔴 규칙 한 줄 (`PLAN_MESSAGE_LANES_2026-09-08.md` · 사용자 확정):
 *
 * > **주사위가 부른 것은 상태를 못 바꾸고, 상태가 부른 것만 상태를 바꾼다.**
 *
 * 그러니 이 목록에 있는 열쇠는 **통지에서만** 먹는다. 이벤트(주사위)가 들고
 * 있으면 `applySideEffects` 가 **적용하지 않고 로그를 남긴다.**
 *
 * ── 왜 코드로 막나 ─────────────────────────────────────────────
 * 「이벤트에 상태 효과가 있으면 빨강」인 검사(L6)를 두기로 했는데, **검사는
 * 데이터를 보는 것이지 동작을 막는 것이 아니다.** 검사만 두면 검사를 안 돌린
 * 사이에 들어온 데이터가 그대로 세계를 바꾼다 — 이 저장소가 「적어 놓기만 하고
 * 안 재는」 형태로 여러 번 걸렸다. 여기서 막으면 규칙이 **기계**가 된다.
 *
 * ⚠ **막는 것이지 지우는 것이 아니다.** 데이터에 남아 있어도 아무 일이 안
 *   일어날 뿐이고, 그 사실이 로그로 나온다 — 조용히 사라지는 것이 제일 나쁘다.
 *
 * ── 목록 ───────────────────────────────────────────────────────
 * `rosterMove`     1군 ↔ 2군. 소속·리그·일정이 바뀐다
 * `startGuarantee` 선발 보장 경기 수. 로테이션 깊이를 0 으로 만든다
 *                  (`pitcherRoleRules.roleDepthOf`)
 *
 * ⚠ `roleChoice` 는 여기 없다 — 그건 `applyRoleChoice` 라는 **제 갈래**로 가고
 *   (`usecases/pitcherRole.ts`), 애초에 주사위가 아니라 물음이 부른다.
 */
export const STATE_EFFECT_KEYS = ["rosterMove", "startGuarantee"] as const;

export type StateEffectKey = (typeof STATE_EFFECT_KEYS)[number];

/** 이 효과가 세계를 바꾸려 하는가 — 하나라도 들었으면 참 */
export function stateEffectsOf(fx: DecisionEffect | undefined | null): StateEffectKey[] {
  if (!fx) return [];
  return STATE_EFFECT_KEYS.filter((k) => (fx as Record<string, unknown>)[k] !== undefined);
}

export function hasStateEffect(fx: DecisionEffect | undefined | null): boolean {
  return stateEffectsOf(fx).length > 0;
}
