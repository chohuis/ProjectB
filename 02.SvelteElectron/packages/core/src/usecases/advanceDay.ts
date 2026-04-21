import type { GameState } from "../domain/gameState";

export interface AdvanceDayResult {
  nextState: GameState;
  logs: string[];
}

export function advanceDay(state: GameState): AdvanceDayResult {
  const nextDay = state.day + 1;
  const moraleDelta = nextDay % 5 === 0 ? -1 : 1;
  const nextMorale = Math.max(0, Math.min(100, state.morale + moraleDelta));

  const nextState: GameState = {
    ...state,
    day: nextDay,
    morale: nextMorale
  };

  const logs = [
    `[DAY ${nextDay}] 훈련 루틴을 완료했습니다.`,
    `[DAY ${nextDay}] 컨디션 변화: 사기 ${state.morale} -> ${nextMorale}`
  ];

  return { nextState, logs };
}

