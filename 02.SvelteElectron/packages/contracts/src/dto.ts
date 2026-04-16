export type StageId =
  | "highschool"
  | "university"
  | "independent"
  | "pro_korea"
  | "pro_usa";

export interface GameSnapshotDto {
  day: number;
  seasonYear: number;
  stage: StageId;
  playerName: string;
  teamName: string;
  morale: number;
}

export interface AdvanceDayResultDto {
  snapshot: GameSnapshotDto;
  logs: string[];
}

