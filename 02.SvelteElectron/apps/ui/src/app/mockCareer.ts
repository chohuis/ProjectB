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
  universityMajor: "\uccb4\uc721\uad50\uc721",
  plannedUniversityMajors: [
    "\uc2a4\ud3ec\uce20\uacfc\ud559",
    "\uccb4\uc721\uad50\uc721",
    "\uc2a4\ud3ec\uce20\uacbd\uc601",
    "\uc0dd\ud65c\uccb4\uc721",
    "\uc2a4\ud3ec\uce20\uc7ac\ud65c"
  ]
};

export const mockCareerProfile: CareerProfile = {
  name: "\uc815\uc11c\uacb8",
  team: "\uc11c\uc6b8 \uc774\ub178\ubca0\uc774\uc158 \uace0",
  year: "2\ud559\ub144",
  position: "SP",
  role: "\uc5d0\uc774\uc2a4 \uc120\ubc1c",
  throws: "\uc6b0\ud22c",
  bats: "\uc6b0\ud0c0",
  overall: 84,
  potentialHidden: 93,
  condition: 82,
  fatigue: 28,
  tags: ["\uae09\uc131\uc7a5", "\uba58\ud0c8\uad00\ub9ac", "\uc120\ubc1c \ub85c\ud14c\uc774\uc158"]
};

