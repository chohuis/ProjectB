export type StageId =
  | "highschool"
  | "university"
  | "independent"
  | "pro_korea"
  | "pro_usa";

export interface GameState {
  day: number;
  seasonYear: number;
  stage: StageId;
  playerName: string;
  teamName: string;
  morale: number;
}

export function createInitialGameState(): GameState {
  return {
    day: 1,
    seasonYear: 1,
    stage: "highschool",
    playerName: "신인 투수",
    teamName: "서울 이노베이션 고",
    morale: 60
  };
}

