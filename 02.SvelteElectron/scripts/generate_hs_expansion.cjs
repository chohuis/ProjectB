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

// bias 반영 OVR: 학년 기본값 + 팀 bias, 범위 clamping
const GRADE_CONF = {
  1: { age: 16, ovrLo: 45, ovrHi: 57, potLo: 60, potHi: 90 },
  2: { age: 17, ovrLo: 50, ovrHi: 63, potLo: 60, potHi: 92 },
  3: { age: 18, ovrLo: 55, ovrHi: 70, potLo: 63, potHi: 95 }
};

function buildPlayer(id, teamId, grade, position, jerseyNumber, bias) {
  const gc = GRADE_CONF[grade];
  const b  = bias || 0;
  const isPitcher = PITCHER_POS.has(position);
  const pitchOvr = clamp(randInt(gc.ovrLo, gc.ovrHi) + b, 30, 99);
  const batOvr   = isPitcher
    ? clamp(randInt(30, 50) + b, 30, 99)
    : clamp(randInt(gc.ovrLo, gc.ovrHi) + b, 30, 99);
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
        potentialHidden: clamp(randInt(gc.potLo, gc.potHi), 30, 99),
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

// ====== NPC TEAM DEFINITIONS ======
// bias: 팀 강도 차등 (+3 강호 ~ -3 약팀)
const NPC_TEAMS = [
  { id: 'TEAM_HS_GOYANG_ARROW',       nameKr: '고양 애로우',    bias:  3 },
  { id: 'TEAM_HS_YEOSU_SHORE',        nameKr: '여수 쇼어스',    bias:  2 },
  { id: 'TEAM_HS_CHUNCHEON_HIGHLAND', nameKr: '춘천 하이랜드',  bias:  1 },
  { id: 'TEAM_HS_JEJU_WIND',          nameKr: '제주 윈드',      bias:  0 },
  { id: 'TEAM_HS_GANGWON_PEAK',       nameKr: '강원 피크',      bias: -1 },
  { id: 'TEAM_HS_MASAN_HARBOR',       nameKr: '마산 하버',      bias: -1 },
  { id: 'TEAM_HS_JECHEON_RIDGE',      nameKr: '제천 릿지',      bias: -2 },
  { id: 'TEAM_HS_SUNCHEON_BAY',       nameKr: '순천 베이',      bias: -3 },
];

// 포지션 순서: j 0-9 → 1학년(투수), j 10-19 → 2학년(야수), j 20-29 → 3학년(야수)
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

// ====== ID 카운터 (현재 최대값 이후 시작) ======
let plyN = 16755;  // PLY_16754가 현재 최대
let coaN = 227;    // COA_00226이 현재 최대
let mngN = 96;     // MNG_00095가 현재 최대

const plyStart = plyN;
const coaStart = coaN;
const mngStart = mngN;

const newNpcEntries = [];
let createdCount = 0;

// NPC 8팀: MNG + 2 COA + 30 PLY each
for (const npc of NPC_TEAMS) {
  const mngId  = fmtId('MNG', mngN++);
  const coaId1 = fmtId('COA', coaN++);
  const coaId2 = fmtId('COA', coaN++);

  writeEntity(buildManager(mngId, npc.id));
  writeEntity(buildCoach(coaId1, npc.id, 'pitching'));
  writeEntity(buildCoach(coaId2, npc.id, 'batting'));
  createdCount += 3;

  newNpcEntries.push(mngId);
  newNpcEntries.push(coaId1);
  newNpcEntries.push(coaId2);

  for (let j = 0; j < 30; j++) {
    const id     = fmtId('PLY', plyN++);
    const pos    = ROSTER_30[j];
    const grade  = Math.floor(j / 10) + 1;
    const jersey = j + 1;
    writeEntity(buildPlayer(id, npc.id, grade, pos, jersey, npc.bias));
    newNpcEntries.push(id);
    createdCount++;
  }

  const gcConf = GRADE_CONF;
  console.log(`  ${npc.nameKr.padEnd(10)} (bias${npc.bias >= 0 ? '+' : ''}${npc.bias})  1학년 OVR ${gcConf[1].ovrLo+npc.bias}~${gcConf[1].ovrHi+npc.bias}  3학년 OVR ${gcConf[3].ovrLo+npc.bias}~${gcConf[3].ovrHi+npc.bias}`);
}

// ====== _index.json: 기존 HS 항목 유지 + 신규 NPC 항목 append ======
const indexPath = path.join(PLAYERS_DIR, '_index.json');
const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const existingHs = indexData.byLeague['LEAGUE_HIGHSCHOOL'] || [];
indexData.generated = new Date().toISOString();
indexData.byLeague['LEAGUE_HIGHSCHOOL'] = [...existingHs, ...newNpcEntries];
fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');

console.log('\nPhase 1: HS NpcOnly 선수 생성 완료');
console.log(`  PLY 생성: ${plyN - plyStart}개  (${fmtId('PLY', plyStart)} ~ ${fmtId('PLY', plyN - 1)})`);
console.log(`  COA 생성: ${coaN - coaStart}개  (${fmtId('COA', coaStart)} ~ ${fmtId('COA', coaN - 1)})`);
console.log(`  MNG 생성: ${mngN - mngStart}개  (${fmtId('MNG', mngStart)} ~ ${fmtId('MNG', mngN - 1)})`);
console.log(`  총 생성:  ${createdCount}개`);
console.log(`  _index.json LEAGUE_HIGHSCHOOL: ${existingHs.length} → ${indexData.byLeague['LEAGUE_HIGHSCHOOL'].length}개`);
