import type { MessageItem } from "./main";

// ?? ?λ젰移?釉붾줉 ????????????????????????????????????????????????
export interface PitchingAttributes {
  ovr: number;
  stamina: number;
  velocity: number;
  command: number;
  control: number;
  movement: number;
  mentality: number;
  recovery: number;
  clutch: number;       // ?꾧린 吏묒쨷?? ?꾨컲 ?묒쟾/?앹젏沅??뺣컯 ??quality 蹂댁젙
  holdRunners: number;  // 寃ъ젣?? ?꾨（ ?쒕룄???듭젣 怨꾩닔
}

export type PitchingStatKey = Exclude<keyof PitchingAttributes, "ovr">;

export interface BattingAttributes {
  ovr: number;
  contact: number;
  power: number;
  eye: number;
  discipline: number;
  speed: number;
  baseInstinct: number; // 二쇰（ ?먮떒: ?щ텇 踰좎씠??吏꾨（ ?쒕룄 鍮덈룄
  bunting: number;      // 踰덊듃: 踰덊듃 ?援??덉쭏 蹂댁젙
  platoon: number;      // ?뚮옒???댁꽦: 諛섎? ???ъ닔 ????λ젰 (50=?됯퇏)
  fielding: number;
  arm: number;
  battingClutch: number;
}

export type BattingStatKey = Exclude<keyof BattingAttributes, "ovr">;

// ?? ?ъ????숇젴??????????????????????????????????????????????????
export type PositionKey = "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "SP" | "RP";
export type PositionRatings = Partial<Record<PositionKey, number>>;

// ?? 媛먮룆 ?λ젰移?????????????????????????????????????????????????
export interface ManagerAttributes {
  motivation: number;       // ?좎닔 紐⑤엫 二쇨컙 蹂댁젙
  development: number;      // ? ?꾩껜 devFactor 蹂댁젙
  strategy: number;         // 寃쎄린 ?꾩닠 ?섏궗寃곗젙
  handlePressure: number;   // 以묒슂 寃쎄린쨌?꾧린 ???  handlePersonnel: number;  // ?좎닔 湲곗슜쨌濡쒗뀒?댁뀡쨌遺덊렂 ?댁슜
}

// ?? 肄붿튂 ?λ젰移?????????????????????????????????????????????????
export type CoachSpecialty = "pitching" | "batting" | "fielding" | "running";

export interface CoachAttributes {
  teaching: number;   // XP ?띾뱷??蹂댁젙 怨꾩닔
  analytics: number;  // ?곷? 遺꾩꽍 ?λ젰
  experience: number; // ?덈꺼 1~5
  specialty: CoachSpecialty;
}

// ?? 援ъ쥌 ?쒖뒪?????????????????????????????????????????????????
export type PitchGrade = 1 | 2 | 3 | 4 | 5; // 1=?듬뱷以?2=湲곗큹 3=蹂댄넻 4=?μ닕 5=留덉뒪??
export interface PitchEntry {
  id: string;
  grade: PitchGrade;
}

// ?? 二쇱씤怨?????곗씠???????????????????????????????????????????
export type CareerStage  = "highschool" | "university" | "pro" | "independent" | "military" | "pro_kbl" | "pro_abl";
export type PlayerType   = "pitcher" | "batter" | "twoWay";
export type Handedness   = "L" | "R" | "S";
export type PitchingForm = "overhand" | "threeQuarter" | "sidearm" | "underhand";

export interface ProContract {
  teamId: string;
  leagueId: string;
  salary: number;               // ?곌컙 ?곕큺 (留????⑥쐞)
  durationYears: number;        // 珥?怨꾩빟 湲곌컙
  remainingYears: number;       // ?쒖쫵 醫낅즺留덈떎 媛먯궛
  signingBonus: number;
  teamOptionYears: number;      // 0?대㈃ ?놁쓬
  playerOptionYears: number;    // 0?대㈃ ?놁쓬
  noTrade: boolean;
  incentives?: { condition: string; bonus: number }[];
  status: "active" | "expired" | "voided";
}

export interface ProtagonistSave {
  id: string;                        // 怨좎젙 ID (?? "PLY_HERO")
  name: string;
  nameEn?: string;
  careerStage: CareerStage;
  leagueId: string;                  // ?꾩옱 ?뚯냽 由ш렇
  teamId: string;                    // ?꾩옱 ?뚯냽 ?
  schoolId?: string;                 // 怨좉탳쨌????④퀎
  grade?: 1 | 2 | 3;                // 怨좉탳 ?숇뀈
  age: number;
  playerType: PlayerType;
  position: string;                  // "SP" | "RP" | "CP" | "" (誘몄젙)
  handedness: Handedness;
  pitchingForm?: PitchingForm;       // ?ш뎄 ??(?ъ닔 ?꾩슜)
  jerseyNumber: number;

  // ?꾩옱 ?곹깭 (二??⑥쐞濡?蹂??
  condition: number;                 // 0??00: 而⑤뵒??  fatigue: number;                   // 0??00: ?쇰줈??  morale: number;                    // 0??00: ?ш린

  // ?λ젰移?(?깆옣 諛섏쁺???꾩옱媛?
  pitching: PitchingAttributes;
  batting: BattingAttributes;

  // ?ъ????숇젴??  primaryPosition: PositionKey;
  positionRatings: PositionRatings;

  // 罹먮┃???띿꽦
  diligence: number;   // ?깆떎??1??9: growthEngine devFactor 蹂댁젙
  popularity: number;  // ?멸린??0??00: ?ㅼ뭅?고듃 愿?щ룄쨌??諛섏쓳

  // ?좎옱?Β룹꽦??  developmentRate: number;           // 45??5
  potentialHidden: number;           // 60??9 (?④꺼吏??좎옱??
  growthPoints: number;              // 誘몄궗???깆옣 ?ъ씤??
  tags: string[];                    // ["湲됱꽦??, "硫섑깉愿由?, ??

  // XP ?꾩쟻 (二쇨컙 ?깆옣 ?붿쭊??
  pitchingXP: Partial<Record<PitchingStatKey, number>>;
  battingXP: Partial<Record<BattingStatKey, number>>;

  // 援ъ쥌 ?쒖뒪??  pitches: PitchEntry[];                               // 蹂댁쑀 援ъ쥌 紐⑸줉 (id + ?숇젴??
  trainingPitchState?: { id: string; progress: number }; // ?꾩옱 ?덈젴 以묒씤 援ъ쥌
  money: number;
  fame: number;
  scoutScore: number;
  proServiceYears: number;
  militaryUnit: "sports" | "general" | null;
  militaryServiceWeeks: number;
  militaryRecoveryWeeks: number;
  tradeAdaptationWeeks: number;
  faNegotiationRound: number;
  faUnsignedWeeks: number;
  contract?: ProContract;
  consecutiveLowMoraleWeeks: number;
  consecutiveHighFatigueWeeks: number;
  injury?: {
    type: "light" | "moderate" | "severe";
    recoveryWeeksLeft: number;
  };
}

// ?? ?쒖쫵 ?ㅽ꺈 (?좎닔 1紐낅텇) ?????????????????????????????????????
export interface PitcherSeasonStats {
  type: "pitcher";
  g: number;      // ?깊뙋 寃쎄린 ??  gs: number;     // ?좊컻 ?깊뙋 ??  w: number;      // ??  l: number;      // ??  sv: number;     // ?몄씠釉?  hd: number;     // ???  ip: number;     // ?대떇 (?뚯닔?? 31.2 ??31?대떇 2/3)
  er: number;     // ?먯콉??  h: number;      // ?쇱븞?
  k: number;      // ?덉궪吏?  bb: number;     // 蹂쇰꽬
  era: number;    // ?됯퇏?먯콉??(怨꾩궛媛? er*9/ip)
  whip: number;   // 怨꾩궛媛? (bb+h)/ip
}

export interface BatterSeasonStats {
  type: "batter";
  g: number;      // 異쒖쟾 寃쎄린 ??  pa: number;     // ???  ab: number;     // ???  h: number;      // ?덊?
  hr: number;     // ?덈윴
  rbi: number;    // ???  sb: number;     // ?꾨（
  bb: number;     // 蹂쇰꽬
  k: number;      // ?쇱쭊
  avg: number;    // ???(怨꾩궛媛? h/ab)
  obp: number;    // 異쒕（??(怨꾩궛媛?
  slg: number;    // ?ν???(怨꾩궛媛?
  ops: number;    // OPS (怨꾩궛媛? obp+slg)
}

export type PlayerSeasonStats = PitcherSeasonStats | BatterSeasonStats;

// ?? ?덈젴 怨꾪쉷 ??????????????????????????????????????????????????
export interface TrainingPlanState {
  primaryProgramId: string | null;
  secondaryProgramId: string | null;
  recoveryProgramId: string | null;
}

// ?? ?숆탳 ?앺솢 ?곹깭 ?????????????????????????????????????????????
export type StudyMode = "focus" | "normal" | "rest" | "sleep";
export type GradeRisk  = "ok" | "warn" | "danger";

export interface SubjectScore {
  percentile: number;   // ?앹감諛깅텇??(1~100, ??쓣?섎줉 醫뗭쓬)
  attendance: number;   // 異쒖꽍瑜?(0~100)
  assignment: number;   // 怨쇱젣 ?댄뻾瑜?(0~100)
}

export interface SchoolState {
  attendsUniversity: boolean;
  universityMajor: string;
  plannedUniversityMajors: string[];
  weeklyStudyMode: StudyMode;
  examAccumScore: number;
  lastGrade: number | null;
  lastGradeRisk: GradeRisk;
  eligibilityBlocked: boolean;
  subjectScores: Record<string, SubjectScore>;
  warningCount: number;
  careerChoiceTriggered: boolean;
  draftTriggered: boolean;
  draftIntent: boolean;
  careerApplicationsSubmitted: boolean;
  fallbackSelectionPending: boolean;
  fallbackUniversityChoices: string[];
  fallbackIndependentChoices: string[];
  fallbackUniversityPassed: string[];
  fallbackIndependentPassed: string[];
  fallbackSportsMilitaryPassed: boolean;
  fallbackDraftPassed: boolean;
  fallbackDraftTeamId: string | null;
  fallbackDraftRound: number | null;
  fallbackDraftPick: number | null;
  fallbackDraftSigningBonus: number;
  universityWeek: number;
  majorSelected: boolean;
}

export type AchievementCategory = "baseball" | "growth" | "social" | "hidden";

export interface AchievementRuntime {
  id: string;
  progress: number;
  unlockedAt: string | null;
  claimedAt: string | null;
  tracked?: boolean;
}

export interface AchievementMetrics {
  strikeoutTotal: number;
  saveTotal: number;
  kakaoFirstContact: boolean;
  trainingWeeksTotal: number;
  gamesWonTotal: number;
}

// ?? 硫붿떊? ?쒖뒪????????????????????????????????????????????????
export type ContactCategory = "team" | "school" | "personal" | "rival";

export interface ChatMessage {
  from: "me" | "contact";
  text: string;
  week: number;
  affinityDelta?: number;
}

export interface ChatContact {
  id: string;
  name: string;
  category: ContactCategory;
  relation: string;
  unlocked: boolean;
  affinity: number;           // 0??00
  lastActionWeek: number;     // 荑⑤떎??怨꾩궛??(0 = 誘몄궗??
  chatHistory: ChatMessage[]; // max 60媛?  flags: string[];            // ?꾨즺???꾪겕쨌?밸퀎 ???ID 紐⑸줉
}

// ?? ?숆탳 留덉뒪???????????????????????????????????????????????
export type SchoolTier = "S" | "A" | "B" | "C";
export type ProPotentialTier = "S" | "A" | "B" | "C";

export interface HighSchoolMaster {
  id: string;
  name: string;
  shortName: string;
  region: string;
  tier: SchoolTier;
  teamId: string;
  gradeLevels: number;
  annualRosterSize: number;
  namedNpcPerYear: number;
  template: {
    pitching: { ovrMin: number; ovrMax: number };
    batting: { ovrMin: number; ovrMax: number };
    developmentRate: { min: number; max: number };
    potentialHidden: { min: number; max: number };
  };
  color: string;
  notes: string;
}

export interface NamedNpcMeta {
  npcId: string;
  schoolId: string;
  trait: string;
  proPotentialTier: ProPotentialTier;
  storyHooks: string[];
  notes: string;
}

export interface SchoolScenario {
  schoolId: string;
  narrativeAngle: string;
  protagonistRoles: {
    seniorMentors: string[];    // 3?숇뀈 ?좊같 硫섑넗 NPC ID 紐⑸줉
    seniorCaptain: string;      // 3?숇뀈 二쇱옣 NPC ID
    classmateRivals: string[];  // 2?숇뀈 ?숆린 ?쇱씠踰?NPC ID 紐⑸줉
    batteryPartner: string;     // 2?숇뀈 諛고꽣由??뚰듃??C NPC ID
    promisingJunior: string;    // 1?숇뀈 湲곕?二?NPC ID
  };
  mainRivalSchool: string;      // 二??쇱씠踰??숆탳 ID
  rivalAces: string[];          // ? ?숆탳 ?먯씠??NPC ID (理쒕? 2紐?
  initialZone0Npcs: string[];   // ?좉퇋 寃뚯엫 ?쒖옉 ??Zone 0?쇰줈 ?먮룞 諛곗젙??NPC ID 紐⑸줉
}

// ?? ?쒕옒?꾪듃 ???????????????????????????????????????????????
export interface DraftPick {
  round: number;
  pick: number;    // ?꾩껜 ???쒕쾲
  teamId: string;
  npcId: string;
}

export interface DraftSimResult {
  year: number;
  picks: DraftPick[];
  undraftedIds: string[];
}

export interface ProtagonistDraftOutcome {
  drafted: boolean;
  round?: number;
  pick?: number;
  teamId?: string;
}

// ?? NPC Zone & ?고????곹깭 ????????????????????????????????????
export type NpcZone = 0 | 1 | 2 | 3;
export type MilitaryStatus = "誘명븘" | "?꾩뿭" | "援고븘" | "硫댁젣";
export type NpcCareerStatus = "active" | "military" | "injured" | "retired";

export interface NpcCareerEntry {
  year: number;
  leagueId: string;
  teamId: string;
  statLine: string;     // "15??3??ERA 2.41" | "???.312 12?덈윴"
  highlights: string[]; // ["?좎씤??, "?ъ뒪?"]
}

export interface NpcSaveState {
  npcId: string;
  name: string;
  nameEn?: string;
  playerType: PlayerType;
  position: string;

  // Zone 遺꾨쪟
  zone: NpcZone;
  zoneDowngradedAt?: number; // Zone 3 ?꾪솚???쒖쫵 ?곕룄

  // 湲곕낯 ?뺣낫
  age: number;
  grade?: 1 | 2 | 3;        // 怨좉탳/????ы븰 以묒씪 ?뚮쭔 議댁옱
  schoolId: string;
  graduationYear: number;

  // ?꾩옱 ?뚯냽
  careerStatus: NpcCareerStatus;
  currentLeague: string;
  currentTeam: string;

  // 援곗쟻
  militaryStatus: MilitaryStatus;
  militaryEnlistYear?: number;
  militaryDischargeYear?: number;

  // ?λ젰移?(Zone 0/1: ?꾩껜, Zone 2/3: 留덉?留??ㅻ깄??
  pitching?: PitchingAttributes;
  batting?: BattingAttributes;
  developmentRate: number; // 寃쎈웾 ?쒕? ?깆옣怨꾩닔

  // 而ㅻ━??湲곕줉
  careerHistory: NpcCareerEntry[];
  achievements: string[]; // ["2025 ?좎씤??, "2027 MVP"]
}

// ?? save_game.json ?꾩껜 援ъ“ ???????????????????????????????????
export interface SaveGame {
  version: number;          // ????щ㎎ 踰꾩쟾 (留덉씠洹몃젅?댁뀡??
  savedAt: string;          // ISO 8601 timestamp
  protagonist: ProtagonistSave;
  mailbox: MessageItem[];
  trainingPlan: TrainingPlanState;
  schoolState: SchoolState;
  achievements: AchievementRuntime[];
  achievementMetrics: AchievementMetrics;
  contacts: ChatContact[];
  recentLogs: string[];     // 理쒓렐 30媛??쒕룞 濡쒓렇
  recentUpcoming: string[]; // ?ㅼ쓬 ?덉젙 ?대깽??紐⑸줉
  npcs: NpcSaveState[];     // NPC ?고????곹깭 (Zone 0~3)
}

export const SAVE_GAME_VERSION = 2;

export function makeSaveGame(
  protagonist: ProtagonistSave,
  mailbox: MessageItem[],
  trainingPlan: TrainingPlanState,
  schoolState: SchoolState,
  achievements: AchievementRuntime[],
  achievementMetrics: AchievementMetrics,
  recentLogs: string[],
  recentUpcoming: string[],
  contacts: ChatContact[],
  npcs: NpcSaveState[] = [],
): SaveGame {
  return {
    version: SAVE_GAME_VERSION,
    savedAt: new Date().toISOString(),
    protagonist,
    mailbox,
    trainingPlan,
    schoolState,
    achievements,
    achievementMetrics,
    contacts,
    recentLogs,
    recentUpcoming,
    npcs,
  };
}

export function migrateSaveGame(raw: Record<string, unknown>): SaveGame {
  const v = (raw.version as number) ?? 0;
  if (v < 2) {
    raw.npcs = [];
    raw.version = 2;
  }
  return raw as unknown as SaveGame;
}

