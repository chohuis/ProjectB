/**
 * 이벤트 선택지 적용 (Phase 7-6c).
 *
 * `gameStore.resolveDecision`은 **주인공 스탯만** 바꾼다(동기 패처). 관계도는
 * slot.db에 있고 사치품은 Rust가 계산하므로 비동기다 — 그 둘을 여기서 이어붙인다.
 *
 * ## 왜 만들었나
 *
 * 6C가 걷어낸 감정 문구의 `effectHint`는 "trust +5"라고 적혀 있었는데
 * **실제로는 사기·피로만 움직였다.** 표시와 동작이 달랐다 — 플레이어가 관계를
 * 관리한다고 믿고 고른 선택이 아무것도 안 한 것이다.
 *
 * 그래서 문구를 되살리기 전에 `relationDelta`를 먼저 만든다. 문구와 동작이
 * 같은 것을 가리켜야 한다.
 */

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { slotRepo } from "../repo/slotRepo";
import { autoLog } from "../stores/autoAdvance";
import { calcLuxury } from "./finance";
import type { DecisionEffect } from "../types/main";
import type { RelationKind } from "../types/relationship";
import type { MessageLane } from "../types/event";
import { stateEffectsOf } from "../utils/stateEffects";
import { moveProtagonistBetweenTiers } from "./weekPhases/market";
import { seasonStore } from "../stores/season";

/**
 * 선택지 하나를 적용한다. 화면·자동진행 양쪽이 **이 함수만** 부른다.
 *
 * 스탯은 즉시, 관계·사치품은 이어서 처리한다. 관계 갱신이 실패해도 스탯은
 * 이미 적용된 상태다 — 선택 자체가 되돌려지면 플레이어가 더 혼란스럽다.
 */
export async function applyDecision(messageId: string, optionId: string): Promise<void> {
  const g = get(gameStore);
  const msg = g.mailbox.find((m) => m.id === messageId);
  const fx = msg?.decision?.options.find((o) => o.id === optionId)?.effects;

  // 스탯·자산·XP — 동기
  gameStore.resolveDecision(messageId, optionId);
  if (!fx) return;

  // ⚠ **갈래는 소식에서 읽는다** (2026-09-08 · L3). 규칙 id 로 되짚으면
  //   소식함에 남은 옛 소식이 지금 데이터의 갈래로 보인다 — 소식은 스냅샷이다
  await applySideEffects(fx, { lane: msg?.lane });
}

/**
 * 관계도·사치품 등 store 밖 효과. 이벤트 외 경로(협상 결과 등)도 쓸 수 있게 분리.
 *
 * 🔴 **상태 효과는 갈래를 본다** (2026-09-08 · L2·L3 · `PLAN_MESSAGE_LANES`).
 *
 * > 주사위가 부른 것은 상태를 못 바꾸고, 상태가 부른 것만 상태를 바꾼다.
 *
 * `opts.lane === "notice"` 일 때만 `STATE_EFFECT_KEYS`(`utils/stateEffects.ts`)
 * 를 먹인다. **검사(L6)만 두지 않고 여기서 막는 이유** — 검사는 데이터를 보는
 * 것이지 동작을 막는 것이 아니다. 검사를 안 돌린 사이에 들어온 데이터가
 * 그대로 세계를 바꾼다면 규칙은 규칙이 아니라 약속일 뿐이다.
 *
 * ⚠ **막을 때 조용히 넘어가지 않는다.** 무시했다는 사실을 로그로 남긴다 —
 *   「아무 일도 안 일어남」이 이 저장소가 반복해 겪은 형태다.
 * ⚠ 갈래를 **안 넘긴 호출부**(협상 결과 등)는 통지가 아니다. 그쪽은 애초에
 *   상태 효과를 안 들고 오므로 달라지는 것이 없다.
 */
export async function applySideEffects(
  fx: DecisionEffect,
  opts: { lane?: MessageLane } = {},
): Promise<void> {
  const g = get(gameStore);
  const slotId = g.currentSlotId;

  // ── 상태 효과 — 통지만 ────────────────────────────────────────
  {
    const stateKeys = stateEffectsOf(fx);
    if (stateKeys.length > 0) {
      if (opts.lane !== "notice") {
        // 이벤트(주사위)가 세계를 바꾸려 했다. 안 먹이고 남긴다
        console.warn(
          `[decisions] 통지가 아닌 갈래의 상태 효과를 무시했다 — ${stateKeys.join("·")}` +
            ` (갈래 ${opts.lane ?? "없음"}). 규칙: 주사위가 부른 것은 상태를 못 바꾼다`,
        );
        autoLog(`[갈래] 상태 효과 무시 ${stateKeys.join("·")} — 갈래 ${opts.lane ?? "없음"}`);
      } else {
        const week = get(seasonStore).currentWeek;
        if (fx.rosterMove) {
          // ⚠ **승강 기계를 그대로 부른다** — 여기서 store 를 직접 건드리면
          //   두 벌이 되고, 그러면 순위표만 맞고 일정은 옛 리그가 된다
          const moved = moveProtagonistBetweenTiers(fx.rosterMove, week);
          autoLog(
            `[통지] rosterMove ${fx.rosterMove} → ${moved ? "옮겼다" : "갈 곳이 없어 그대로"}`,
          );
        }
        if (fx.startGuarantee) {
          // 부여는 store 패처가 한다(`applyEffectToProtagonist`) — 여기서 또
          // 더하면 두 번 준다. 로그만 남긴다
          autoLog(`[통지] startGuarantee ${fx.startGuarantee.games}경기`);
        }
      }
    }
  }

  // ── 사치품 (§7-5 F-3의 이월) ─────────────────────────────────
  //
  // 규칙은 Rust `calc_luxury`가 갖는다. 여기서 계수를 다시 쓰면 정본이 둘이다.
  if (fx.luxurySpend && fx.luxurySpend.cost > 0) {
    try {
      const res = await calcLuxury({
        cost: fx.luxurySpend.cost,
        onTeammate: fx.luxurySpend.onTeammate,
        diligence: g.protagonist.diligence,
      });
      // 금액은 여기서 뺀다 — 이벤트 JSON에 moneyDelta를 또 적으면 두 번 빠진다
      gameStore.applyMoneyChange(-res.cost);
      if (res.fameDelta !== 0) gameStore.applyFameChange(res.fameDelta);
      if (res.relationDelta !== 0 && fx.luxurySpend.onTeammate && slotId) {
        await bumpRelation(slotId, "teammate", fx.luxurySpend.personId, res.relationDelta);
      }
      autoLog(
        `[사치품] ${res.cost}만원 지출 — ` +
          (fx.luxurySpend.onTeammate
            ? `동료 관계 +${res.relationDelta.toFixed(1)}`
            : `명성 ${res.fameDelta >= 0 ? "+" : ""}${res.fameDelta.toFixed(1)}` +
              ` (성실도 ${g.protagonist.diligence})`),
      );
    } catch (e) {
      console.warn("[decisions] 사치품 계산 실패 — 지출만 반영", e);
      gameStore.applyMoneyChange(-fx.luxurySpend.cost);
    }
  }

  // ── 주간 학습 강도 (B-24 · 사용자 확정 2026-09-03) ───────────
  //
  // 🔴 예전엔 `studyQualityDelta` 로 대신했다. 그건 이번 학기 누적에 **한 번**
  //   더하는 값이라 그 주만 움직인다 — 학점은 `qualityAccum / weeks` 평균이고
  //   매주 품질을 정하는 건 모드다. 그래서 그 방식으로는 **GPA 3.5 를 못 넘었다.**
  //   「이번 학기는 공부한다」는 선택은 모드를 바꿔야 뜻이 산다.
  //
  // ⚠ 여기 둔 이유 — `applyDecision`(소식 선택)과 `resolveEventPending`(자동 진행·
  //   이벤트 모달)이 **둘 다 `applySideEffects` 를 지난다.** store 패처 쪽에 두면
  //   두 갈래 중 한쪽만 고쳐진 채 남는다(이 저장소가 그 형태로 여러 번 걸렸다).
  if (fx.studyModeSet && g.schoolState.weeklyStudyMode !== fx.studyModeSet) {
    gameStore.setStudyMode(fx.studyModeSet);
    autoLog(`[학업] 학습 강도 ${g.schoolState.weeklyStudyMode} → ${fx.studyModeSet}`);
  }

  // ── 관계도 ───────────────────────────────────────────────────
  if (fx.relationDelta && slotId) {
    const { kind, personId, delta } = fx.relationDelta;
    if (delta !== 0) {
      await bumpRelation(slotId, kind, personId, delta);
    }
  }
}

/**
 * 관계값을 더한다. `personId`가 없으면 그 종류의 **현재 접촉 중인 첫 상대**다
 * (감독·구단주는 팀당 1명이라 대개 이걸로 충분하다).
 *
 * 값 범위는 Rust `clamp_value`와 같은 −100~100이다. 여기서 clamp하는 게
 * 이상적이진 않지만, 델타 하나 때문에 엔진을 왕복하는 건 과하다 —
 * **범위가 갈라지지 않게 회귀가 대조한다**(`test:sentencebank`의 관계 절).
 */
async function bumpRelation(
  slotId: string,
  kind: RelationKind,
  personId: string | undefined,
  delta: number,
): Promise<void> {
  try {
    const rows = await slotRepo.getRelationships(slotId, { contact: "together" });
    const target = personId
      ? rows.find((r) => r.personId === personId)
      : rows.find((r) => r.kind === kind);
    if (!target) return;

    const next = Math.max(-100, Math.min(100, target.value + delta));
    if (next === target.value) return;

    await slotRepo.upsertRelationships(slotId, [
      {
        ...target,
        value: next,
        updatedWeek: get(seasonStore).currentWeek,
      },
    ]);
    autoLog(`[관계] ${kind} ${target.personId} ${delta >= 0 ? "+" : ""}${delta} → ${next}`);
  } catch (e) {
    // 관계를 못 써도 선택 자체는 이미 반영됐다 — 여기서 throw하면 화면이 멈춘다
    console.warn("[decisions] 관계 갱신 실패", e);
  }
}
