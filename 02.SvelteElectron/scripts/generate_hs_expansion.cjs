'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..', 'resource', 'data', 'master');
const PLAYERS_DIR = path.join(BASE, 'entities', 'players');

// ====== NAME POOL ======
const LAST_NAMES = [
  "김","이","박","최","정","강","조","윤","장","임",
  "한","오","서","신","권","황","안","송","전","홍",
  "고","문","양","손","배","백","허","유","남","심",
  "노","하","곽","성","차","주","우","구","나","민"
];
const GIVEN_NAMES = [
  "민준","서준","도윤","시우","주원",
  "하준","지호","지후","준서","준우",
  "예준","도현","지훈","민재","현우",
  "우진","현준","태양","지원","성민",
  "건우","승현","재원","연우","정우",
  "준혁","동현","재민","용준","태민",
  "성준","민혁","동준","현서","준호",
  "재현","기준","찬우","태준","승우",
  "민석","상현","동혁","준영","태현",
  "성현","재훈","기훈","민우","상민",
  "찬영","재윤","승민","현진","지성",
  "원준","태우","진우","동우","성우"
];
const LAST_ROMAN = {
  "김":"Kim","이":"Lee","박":"Park","최":"Choi","정":"Jeong",
  "강":"Kang","조":"Jo","윤":"Yoon","장":"Jang","임":"Im",
  "한":"Han","오":"Oh","서":"Seo","신":"Shin","권":"Kwon",
  "황":"Hwang","안":"An","송":"Song","전":"Jeon","홍":"Hong",
  "고":"Go","문":"Moon","양":"Yang","손":"Son","배":"Bae",
  "백":"Baek","허":"Heo","유":"Yoo","남":"Nam","심":"Shim",
  "노":"No","하":"Ha","곽":"Kwak","성":"Seong","차":"Cha",
  "주":"Joo","우":"Woo","구":"Gu","나":"Na","민":"Min"
};
const GIVEN_ROMAN = {
  "민준":"Minjun","서준":"Seojun","도윤":"Doyun","시우":"Siwoo","주원":"Juwon",
  "하준":"Hajun","지호":"Jiho","지후":"Jihu","준서":"Junseo","준우":"Junwoo",
  "예준":"Yejun","도현":"Dohyeon","지훈":"Jihun","민재":"Minjae","현우":"Hyeonwoo",
  "우진":"Woojin","현준":"Hyeonjun","태양":"Taeyang","지원":"Jiwon","성민":"Seongmin",
  "건우":"Geonwoo","승현":"Seunghyeon","재원":"Jaewon","연우":"Yeonwoo","정우":"Jeongwoo",
  "준혁":"Junhyeok","동현":"Donghyeon","재민":"Jaemin","용준":"Yongjun","태민":"Taemin",
  "성준":"Seongjun","민혁":"Minhyeok","동준":"Dongjun","현서":"Hyeonseo","준호":"Junho",
  "재현":"Jaehyeon","기준":"Gijun","찬우":"Chanwoo","태준":"Taejun","승우":"Seungwoo",
  "민석":"Minseok","상현":"Sanghyeon","동혁":"Donghyeok","준영":"Junyeong","태현":"Taehyeon",
  "성현":"Seonghyeon","재훈":"Jaehun","기훈":"Gihun","민우":"Minwoo","상민":"Sangmin",
  "찬영":"Chanyeong","재윤":"Jaeyun","승민":"Seungmin","현진":"Hyeonjin","지성":"Jiseong",
  "원준":"Wonjun","태우":"Taewoo","진우":"Jinwoo","동우":"Dongwoo","성우":"Seongwoo"
};

// ====== PRNG (Mulberry32) ======
let _seed = 0x20260514;
function rand() {
  _seed |= 0;
  _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(lo, hi) { return Math.floor(rand() * (hi - lo + 1)) + lo; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// ====== HELPERS ======
function fmtId(prefix, n) {
  return prefix + '_' + String(n).padStart(5, '0');
}
function randName() {
  const last = pick(LAST_NAMES);
  const given = pick(GIVEN_NAMES);
  return {
    name: last + given,
    nameEn: (LAST_ROMAN[last] || last) + ' ' + (GIVEN_ROMAN[given] || given)
  };
}

// ====== STATS ======
const PITCHES_ALL = [
  'PITCH_FASTBALL','PITCH_SLIDER','PITCH_CURVE','PITCH_CHANGEUP',
  'PITCH_SPLITTER','PITCH_SCREWBALL','PITCH_KNUCKLEBALL','PITCH_CUTTER','PITCH_SINKER'
];
const PITCHER_POS = new Set(['SP','RP','CP']);

function genPitching(ovr) {
  const s = 12;
  return {
    ovr,
    stamina:     clamp(ovr + randInt(-s, s), 30, 99),
    velocity:    clamp(ovr + randInt(-s, s), 30, 99),
    command:     clamp(ovr + randInt(-s, s), 30, 99),
    control:     clamp(ovr + randInt(-s, s), 30, 99),
    movement:    clamp(ovr + randInt(-s, s), 30, 99),
    mentality:   clamp(ovr + randInt(-s, s), 30, 99),
    recovery:    clamp(ovr + randInt(-s, s), 30, 99),
    clutch: 50, holdRunners: 50
  };
}
function genBatting(ovr) {
  const s = 12;
  return {
    ovr,
    contact:      clamp(ovr + randInt(-s, s), 30, 99),
    power:        clamp(ovr + randInt(-s, s), 30, 99),
    eye:          clamp(ovr + randInt(-s, s), 30, 99),
    discipline:   clamp(ovr + randInt(-s, s), 30, 99),
    speed:        clamp(ovr + randInt(-s, s), 30, 99),
    fielding:     clamp(ovr + randInt(-s, s), 30, 99),
    arm:          clamp(ovr + randInt(-s, s), 30, 99),
    battingClutch: 50, baseInstinct: 50, bunting: 45, platoon: 50
  };
}
function genPitches(count) {
  const pool = [...PITCHES_ALL].filter(p => p !== 'PITCH_FASTBALL').sort(() => rand() - 0.5);
  const result = [{ id: 'PITCH_FASTBALL', grade: randInt(2, 5) }];
  for (let i = 0; i < count - 1 && i < pool.length; i++) {
    result.push({ id: pool[i], grade: randInt(1, 4) });
  }
  return result;
}

const GRADE_CONF = {
  1: { age: 16, ovrLo: 45, ovrHi: 57, potLo: 60, potHi: 90 },
  2: { age: 17, ovrLo: 50, ovrHi: 63, potLo: 60, potHi: 92 },
  3: { age: 18, ovrLo: 55, ovrHi: 70, potLo: 63, potHi: 95 }
};

function buildPlayer(id, teamId, grade, position, jerseyNumber) {
  const gc = GRADE_CONF[grade];
  const isPitcher = PITCHER_POS.has(position);
  const pitchOvr = randInt(gc.ovrLo, gc.ovrHi);
  const batOvr   = isPitcher ? randInt(30, 50) : randInt(gc.ovrLo, gc.ovrHi);
  const nm = randName();
  return {
    id,
    name: nm.name,
    nameEn: nm.nameEn,
    role: "player",
    age: gc.age,
    status: "active",
    originLeagueId: "LEAGUE_HIGHSCHOOL",
    leagueId: "LEAGUE_HIGHSCHOOL",
    clubId: teamId,
    teamId,
    grade,
    schoolId: "SCHOOL_" + teamId,
    notes: "",
    details: {
      player: {
        playerType: isPitcher ? "pitcher" : "batter",
        handedness: rand() < 0.8 ? "R" : "L",
        position,
        jerseyNumber,
        pitching: genPitching(pitchOvr),
        batting:  genBatting(batOvr),
        developmentRate: randInt(50, 90),
        potentialHidden: randInt(gc.potLo, gc.potHi),
        primaryPosition: position,
        positionRatings: { [position]: pitchOvr },
        pitches: isPitcher ? genPitches(randInt(2, 4)) : [{ id: 'PITCH_FASTBALL', grade: 1 }]
      },
      coach:   { specialty: "-", experienceYears: 0, stats: { teaching:50, analysis:50, communication:50, discipline:50, leadership:50 }, trainingBuffs: "" },
      manager: { style: "균형", experienceYears: 0, stats: { tactics:50, decision:50, rotationMgmt:50, bullpenMgmt:50, moraleMgmt:50 }, gamePlanBias: "", riskTolerance: 50 },
      owner:   { ownershipStyle: "안정 운영", tenureYears: 0, stats: { budgetSupport:50, patience:50, prInfluence:50, facilityInvestment:50, staffTrust:50 }, budgetPolicy: "", hiringPolicy: "" }
    },
    contact: { category: "", relation: "", initialAffinity: 0, arcs: [], chat: {} },
    diligence: randInt(50, 80),
    popularity: randInt(10, 50)
  };
}

function buildCoach(id, teamId, specialty) {
  const nm = randName();
  const buffMap = {
    "pitching": "구속 훈련 +2%",
    "batting":  "타격 훈련 +2%"
  };
  return {
    id,
    name: nm.name,
    nameEn: nm.nameEn,
    role: "coach",
    age: randInt(35, 55),
    status: "active",
    originLeagueId: "LEAGUE_HIGHSCHOOL",
    leagueId: "LEAGUE_HIGHSCHOOL",
    clubId: teamId,
    teamId,
    schoolId: "SCHOOL_" + teamId,
    notes: "",
    details: {
      player: {
        playerType: "pitcher", handedness: "R", position: "SP", jerseyNumber: 0,
        pitching: { ovr:50,stamina:50,velocity:50,command:50,control:50,movement:50,mentality:50,recovery:50,clutch:50,holdRunners:50 },
        batting:  { ovr:50,contact:50,power:50,eye:50,discipline:50,speed:50,fielding:50,arm:50,battingClutch:50,baseInstinct:50,bunting:45,platoon:50 },
        developmentRate: 50, potentialHidden: 65, primaryPosition: "SP", positionRatings: { SP: 50 },
        pitches: [{ id: "PITCH_FASTBALL", grade: 1 }]
      },
      coach:   { specialty, experienceYears: randInt(5, 20), stats: { teaching: randInt(55, 80), analytics: randInt(50, 75), experience: randInt(1, 5) }, trainingBuffs: buffMap[specialty] || "" },
      manager: { style: "균형", experienceYears: 0, stats: { tactics:50,decision:50,rotationMgmt:50,bullpenMgmt:50,moraleMgmt:50 }, gamePlanBias: "", riskTolerance: 50 },
      owner:   { ownershipStyle: "안정 운영", tenureYears: 0, stats: { budgetSupport:50,patience:50,prInfluence:50,facilityInvestment:50,staffTrust:50 }, budgetPolicy: "", hiringPolicy: "" }
    },
    contact: { category: "", relation: "", initialAffinity: 0, arcs: [], chat: {} },
    diligence: 60,
    popularity: 30
  };
}

function buildManager(id, teamId) {
  const nm = randName();
  const styles = [
    "균형", "공격형", "수비형",
    "투수 중심", "타격 중심",
    "베테랑 중심", "청소년 중심"
  ];
  return {
    id,
    name: nm.name,
    nameEn: nm.nameEn,
    role: "manager",
    age: randInt(45, 62),
    status: "active",
    originLeagueId: "LEAGUE_HIGHSCHOOL",
    leagueId: "LEAGUE_HIGHSCHOOL",
    clubId: teamId,
    teamId,
    schoolId: "SCHOOL_" + teamId,
    notes: "",
    details: {
      player: {
        playerType: "pitcher", handedness: "R", position: "SP", jerseyNumber: 0,
        pitching: { ovr:50,stamina:50,velocity:50,command:50,control:50,movement:50,mentality:50,recovery:50,clutch:50,holdRunners:50 },
        batting:  { ovr:50,contact:50,power:50,eye:50,discipline:50,speed:50,fielding:50,arm:50,battingClutch:50,baseInstinct:50,bunting:45,platoon:50 },
        developmentRate: 50, potentialHidden: 65, primaryPosition: "SP", positionRatings: { SP: 50 },
        pitches: [{ id: "PITCH_FASTBALL", grade: 1 }]
      },
      coach:   { specialty: "-", experienceYears: 0, stats: { teaching:50,analysis:50,communication:50,discipline:50,leadership:50 }, trainingBuffs: "" },
      manager: {
        style: pick(styles),
        experienceYears: randInt(3, 15),
        stats: {
          motivation:      randInt(60, 80),
          development:     randInt(55, 80),
          strategy:        randInt(55, 80),
          handlePressure:  randInt(60, 85),
          handlePersonnel: randInt(60, 80)
        },
        gamePlanBias: "",
        riskTolerance: randInt(40, 70)
      },
      owner: { ownershipStyle: "안정 운영", tenureYears: 0, stats: { budgetSupport:50,patience:50,prInfluence:50,facilityInvestment:50,staffTrust:50 }, budgetPolicy: "", hiringPolicy: "" }
    },
    contact: { category: "", relation: "", initialAffinity: 0, arcs: [], chat: {} },
    diligence: 60,
    popularity: 30
  };
}

function writeEntity(data) {
  const fp = path.join(PLAYERS_DIR, data.id + '.json');
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

// ====== TEAM DEFINITIONS ======
const EXISTING_TEAMS = [
  { id: 'TEAM_HS_SEOUL_INNOVATION',  mng: 'MNG_00001', coas: ['COA_00001','COA_00002'], own: 'OWN_00001', plyStart:  1, plyEnd:  20 },
  { id: 'TEAM_HS_BUSAN_WAVE',        mng: 'MNG_00002', coas: ['COA_00003','COA_00004'], own: 'OWN_00002', plyStart: 21, plyEnd:  40 },
  { id: 'TEAM_HS_DAEGU_HEAT',        mng: 'MNG_00003', coas: ['COA_00005','COA_00006'], own: 'OWN_00003', plyStart: 41, plyEnd:  60 },
  { id: 'TEAM_HS_GWANGJU_VISION',    mng: 'MNG_00004', coas: ['COA_00007','COA_00008'], own: 'OWN_00004', plyStart: 61, plyEnd:  80 },
  { id: 'TEAM_HS_DAEJEON_RISE',      mng: 'MNG_00005', coas: ['COA_00009','COA_00010'], own: 'OWN_00005', plyStart: 81, plyEnd: 100 },
  { id: 'TEAM_HS_INCHEON_HARBOR',    mng: 'MNG_00006', coas: ['COA_00011','COA_00012'], own: 'OWN_00006', plyStart:101, plyEnd: 120 },
  { id: 'TEAM_HS_ULSAN_CHARGE',      mng: 'MNG_00007', coas: ['COA_00013','COA_00014'], own: 'OWN_00007', plyStart:121, plyEnd: 140 },
  { id: 'TEAM_HS_SUWON_EDGE',        mng: 'MNG_00008', coas: ['COA_00015','COA_00016'], own: 'OWN_00008', plyStart:141, plyEnd: 160 },
];

const NPC_TEAMS = [
  { id: 'TEAM_HS_YEOSU_SHORE',        nameKr: '여수 쇼어스'     },
  { id: 'TEAM_HS_CHUNCHEON_HIGHLAND', nameKr: '춴천 하이랜드' },
  { id: 'TEAM_HS_JEJU_WIND',          nameKr: '제주 윈드'            },
  { id: 'TEAM_HS_GANGWON_PEAK',       nameKr: '강원 피크'            },
  { id: 'TEAM_HS_MASAN_HARBOR',       nameKr: '마산 하버'            },
  { id: 'TEAM_HS_JECHEON_RIDGE',      nameKr: '제천 릿지'            },
  { id: 'TEAM_HS_GOYANG_ARROW',       nameKr: '고양 애로우'      },
  { id: 'TEAM_HS_SUNCHEON_BAY',       nameKr: '순천 베이'            },
];

// Positions for 10 players added to existing teams
const ADD_POSITIONS = ['SP','RP','CP','C','1B','2B','SS','LF','RF','UT'];
// Grades for additions: 3x grade1, 3x grade2, 4x grade3
const ADD_GRADES    = [1,1,1,2,2,2,3,3,3,3];

// Positions for 30-player NPC team roster
// 10 pitchers + 3C + 2×(1B,2B,3B,SS) + 2×(LF,CF,RF) + 3UT = 30
const ROSTER_30 = [
  'SP','SP','SP','SP','SP',
  'RP','RP','RP',
  'CP','CP',
  'C','C','C',
  '1B','1B',
  '2B','2B',
  '3B','3B',
  'SS','SS',
  'LF','LF',
  'CF','CF',
  'RF','RF',
  'UT','UT','UT'
];

// ====== COUNTERS ======
let plyN = 1542;
let coaN = 168;
let mngN = 72;

const newHsEntries = [];
let createdCount = 0;

// 1. EXISTING 8 TEAMS: rebuild block + add 10 new players each
for (const team of EXISTING_TEAMS) {
  // Original block
  newHsEntries.push(team.mng);
  for (const c of team.coas) newHsEntries.push(c);
  newHsEntries.push(team.own);
  for (let n = team.plyStart; n <= team.plyEnd; n++) {
    newHsEntries.push(fmtId('PLY', n));
  }
  // 10 new players (jersey 21-30)
  for (let j = 0; j < 10; j++) {
    const id  = fmtId('PLY', plyN++);
    const pos = ADD_POSITIONS[j];
    const gr  = ADD_GRADES[j];
    const jersey = 21 + j;
    writeEntity(buildPlayer(id, team.id, gr, pos, jersey));
    newHsEntries.push(id);
    createdCount++;
  }
}

// Preserve trailing special entries (PLY_01541, COA_00167) from original array
newHsEntries.push('PLY_01541');
newHsEntries.push('COA_00167');

// 2. NEW NPC TEAMS: MNG + 2 COA + 30 PLY each
for (const npc of NPC_TEAMS) {
  const mngId  = fmtId('MNG', mngN++);
  const coaId1 = fmtId('COA', coaN++);
  const coaId2 = fmtId('COA', coaN++);

  writeEntity(buildManager(mngId, npc.id));
  writeEntity(buildCoach(coaId1, npc.id, 'pitching'));
  writeEntity(buildCoach(coaId2, npc.id, 'batting'));
  createdCount += 3;

  newHsEntries.push(mngId);
  newHsEntries.push(coaId1);
  newHsEntries.push(coaId2);

  for (let j = 0; j < 30; j++) {
    const id     = fmtId('PLY', plyN++);
    const pos    = ROSTER_30[j];
    const grade  = Math.floor(j / 10) + 1; // 0-9=1학년, 10-19=2학년, 20-29=3학년
    const jersey = j + 1;
    writeEntity(buildPlayer(id, npc.id, grade, pos, jersey));
    newHsEntries.push(id);
    createdCount++;
  }
}

// 3. UPDATE _index.json
const indexPath = path.join(PLAYERS_DIR, '_index.json');
const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
indexData.generated = new Date().toISOString();
indexData.byLeague['LEAGUE_HIGHSCHOOL'] = newHsEntries;
fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');

// 4. UPDATE highschool/index.json
const hsIndexPath = path.join(BASE, 'teams', 'highschool', 'index.json');
const hsIndex = JSON.parse(fs.readFileSync(hsIndexPath, 'utf8'));
hsIndex.activeTeamIds     = [...EXISTING_TEAMS.map(t => t.id), ...NPC_TEAMS.map(t => t.id)];
hsIndex.selectableTeamIds = EXISTING_TEAMS.map(t => t.id);
hsIndex.npcOnlyTeamIds    = NPC_TEAMS.map(t => t.id);
hsIndex.teamCount         = 16;
hsIndex.npcTeamCount      = 40;
fs.writeFileSync(hsIndexPath, JSON.stringify(hsIndex, null, 2), 'utf8');

console.log('Phase 0-A: HS expansion done');
console.log('  PLY written  : ' + (plyN - 1542) + ' files  (' + fmtId('PLY',1542) + ' ~ ' + fmtId('PLY',plyN-1));
console.log('  COA written  : ' + (coaN - 168)  + ' files  (' + fmtId('COA',168)  + ' ~ ' + fmtId('COA',coaN-1));
console.log('  MNG written  : ' + (mngN - 72)   + ' files  (' + fmtId('MNG',72)   + ' ~ ' + fmtId('MNG',mngN-1));
console.log('  Total created: ' + createdCount);
console.log('  HS index: ' + hsIndex.activeTeamIds.length + ' active teams (' + hsIndex.selectableTeamIds.length + ' selectable, ' + hsIndex.npcOnlyTeamIds.length + ' NPC-only)');
