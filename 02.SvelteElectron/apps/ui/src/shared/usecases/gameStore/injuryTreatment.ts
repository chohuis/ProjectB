/**
 * **부상 치료 선택** (2026-09-30 · Ⅱ-2 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `stores/game.ts` 의
 *   `applyInjuryTreatment` 하나가 그대로 나왔다. 바뀐 것은 머리 두 줄과
 *   들여쓰기 4칸, 그리고 `import("../types/save")` 경로다.
 *
 * ⚠ **왜 store 밖인가.** 선택마다 회복 주수와 비용을 **다시 계산한다** —
 *   스테로이드 −3주 · PRP −5주 · 상담은 10주로 자르고 · 수술은 부상 종류를
 *   갈아치우며 65/58주로 늘린다. `store 는 update(s => …) 만` 이라는 규칙에서
 *   한참 벗어난 로직이다.
 *
 * ⚠ **`update` 를 첫 인자에서 풀어서 받는다** — 그러면 본문의 `update(…)` 가
 *   손댈 필요 없이 그대로 돈다(`gameStore/contracts.ts` 가 09-27 에 쓴 방식).
 *
 * ⚠ **주당 치료비는 여기가 아니다.** 보존·상담은 `weekPhases/weeklyTraining.ts`
 *   가 매주 깎는다(본문 주석 참고) — 단위는 **만원**이고, 그게 둘로 갈리면
 *   한 주에 자산이 0 이 되는 옛 결함으로 돌아간다(`test:staff`·`test:finance`).
 *
 * ⚠ 검사는 `gamePathSrc()` 가 이 파일을 `game.ts` 와 한 덩이로 읽는다.
 */
import type { GameStoreState } from "../../stores/game";

/** 스토어가 건네는 손잡이 — 이 덩이는 store 메서드를 하나도 안 부른다 */
export interface InjuryCtx {
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
}

export function applyInjuryTreatment(
  { update }: InjuryCtx,
  choice: import("../../types/save").InjuryTreatment,
) {
  update((s) => {
    const inj = s.protagonist.injury;
    if (!inj) return s;

    let updatedInj = { ...inj, treatmentChoice: choice };

    let moneyDelta = 0;
    if (choice === "steroid") {
      const reduced = Math.max(1, updatedInj.recoveryWeeksLeft - 3);
      updatedInj = {
        ...updatedInj,
        recoveryWeeksLeft: reduced,
        totalRecoveryWeeks: reduced,
        steroidUsed: true,
      };
      moneyDelta = -2_000_000;
    } else if (choice === "prp") {
      const reduced = Math.max(1, updatedInj.recoveryWeeksLeft - 5);
      updatedInj = { ...updatedInj, recoveryWeeksLeft: reduced, totalRecoveryWeeks: reduced };
      moneyDelta = -5_000_000;
    } else if (choice === "counseling") {
      // YIPS 심리 상담: 8~12주로 단축 (기존이 그보다 길면)
      const reduced = Math.min(updatedInj.recoveryWeeksLeft, 10);
      updatedInj = { ...updatedInj, recoveryWeeksLeft: reduced, totalRecoveryWeeks: reduced };
      // 주당 비용은 advanceWeek에서 매주 차감
    } else if (choice === "surgery") {
      // 중증 → 수술 전환: UCL_PARTIAL→UCL_FULL, ROTATOR_STRAIN→ROTATOR_FULL
      const surgeryType =
        inj.type === "UCL_PARTIAL"
          ? "UCL_FULL"
          : inj.type === "ROTATOR_STRAIN"
            ? "ROTATOR_FULL"
            : "UCL_FULL";
      // 수술 회복 주수: UCL_FULL 기준 65주, ROTATOR_FULL 58주
      const surgeryWeeks = surgeryType === "UCL_FULL" ? 65 : 58;
      updatedInj = {
        ...updatedInj,
        type: surgeryType as import("../../types/save").InjuryType,
        severity: "surgery",
        recoveryWeeksLeft: surgeryWeeks,
        totalRecoveryWeeks: surgeryWeeks,
        rehabPhase: 1,
      };
    }

    const newMoney = Math.max(0, (s.protagonist.money ?? 0) + moneyDelta);
    return {
      ...s,
      protagonist: { ...s.protagonist, injury: updatedInj, money: newMoney },
    };
  });
}
