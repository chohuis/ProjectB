export type CareerStage = "highschool" | "university" | "pro";

export interface CareerSchoolState {
  currentStage: CareerStage;
  attendsUniversity: boolean;
  universityMajor: string;
  plannedUniversityMajors: string[];
}

export interface CareerProfile {
  name: string;
  team: string;
  year: string;
  position: string;
  role: string;
  throws: string;
  bats: string;
  overall: number;
  potentialHidden: number;
  condition: number;
  fatigue: number;
  tags: string[];
}

export const mockCareerSchool: CareerSchoolState = {
  currentStage: "highschool",
  attendsUniversity: false,
  universityMajor: "체육교육",
  plannedUniversityMajors: [
    "스포츠과학",
    "체육교육",
    "스포츠경영",
    "재활운동",
    "스포츠심리"
  ]
};

export const mockCareerProfile: CareerProfile = {
  name: "정서겸",
  team: "서울 이노베이션 고",
  year: "2학년",
  position: "SP",
  role: "에이스 선발",
  throws: "좌투",
  bats: "우타",
  overall: 84,
  potentialHidden: 93,
  condition: 82,
  fatigue: 28,
  tags: ["핵심", "멘탈관리", "선발 로테이션"]
};
