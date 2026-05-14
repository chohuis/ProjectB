'use strict';
const fs = require('fs');
const path = require('path');

const BASE        = path.resolve(__dirname, '..', 'resource', 'data', 'master');
const PLAYERS_DIR = path.join(BASE, 'entities', 'players');
const KBL_DIR     = path.join(BASE, 'teams', 'pro_korea');
const ABL_DIR     = path.join(BASE, 'teams', 'pro_usa');

// ====== NAME POOL (KBL - 한국어) ======
const KR_LAST  = ["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","전","홍","고","문","양","손","배","백","허","유","남","심","노","하","곽","성","차","주","우","구","나","민"];
const KR_GIVEN = ["민준","서준","도윤","시우","주원","하준","지호","지후","준서","준우","예준","도현","지훈","민재","현우","우진","현준","태양","지원","성민","건우","승현","재원","연우","정우","준혁","동현","재민","용준","태민","성준","민혁","동준","현서","준호","재현","기준","찬우","태준","승우","민석","상현","동혁","준영","태현","성현","재훈","기훈","민우","상민","찬영","재윤","승민","현진","지성","원준","태우","진우","동우","성우"];
const KR_LAST_ROM  = {김:"Kim",이:"Lee",박:"Park",최:"Choi",정:"Jeong",강:"Kang",조:"Jo",윤:"Yoon",장:"Jang",임:"Im",한:"Han",오:"Oh",서:"Seo",신:"Shin",권:"Kwon",황:"Hwang",안:"An",송:"Song",전:"Jeon",홍:"Hong",고:"Go",문:"Moon",양:"Yang",손:"Son",배:"Bae",백:"Baek",허:"Heo",유:"Yoo",남:"Nam",심:"Shim",노:"No",하:"Ha",곽:"Kwak",성:"Seong",차:"Cha",주:"Joo",우:"Woo",구:"Gu",나:"Na",민:"Min"};
const KR_GIVEN_ROM = {민준:"Minjun",서준:"Seojun",도윤:"Doyun",시우:"Siwoo",주원:"Juwon",하준:"Hajun",지호:"Jiho",지후:"Jihu",준서:"Junseo",준우:"Junwoo",예준:"Yejun",도현:"Dohyeon",지훈:"Jihun",민재:"Minjae",현우:"Hyeonwoo",우진:"Woojin",현준:"Hyeonjun",태양:"Taeyang",지원:"Jiwon",성민:"Seongmin",건우:"Geonwoo",승현:"Seunghyeon",재원:"Jaewon",연우:"Yeonwoo",정우:"Jeongwoo",준혁:"Junhyeok",동현:"Donghyeon",재민:"Jaemin",용준:"Yongjun",태민:"Taemin",성준:"Seongjun",민혁:"Minhyeok",동준:"Dongjun",현서:"Hyeonseo",준호:"Junho",재현:"Jaehyeon",기준:"Gijun",찬우:"Chanwoo",태준:"Taejun",승우:"Seungwoo",민석:"Minseok",상현:"Sanghyeon",동혁:"Donghyeok",준영:"Junyeong",태현:"Taehyeon",성현:"Seonghyeon",재훈:"Jaehun",기훈:"Gihun",민우:"Minwoo",상민:"Sangmin",찬영:"Chanyeong",재윤:"Jaeyun",승민:"Seungmin",현진:"Hyeonjin",지성:"Jiseong",원준:"Wonjun",태우:"Taewoo",진우:"Jinwoo",동우:"Dongwoo",성우:"Seongwoo"};

// ====== NAME POOL (ABL - 영어) ======
const EN_FIRST = ["James","Michael","David","John","Robert","Daniel","Matthew","Joseph","Christopher","Anthony","Andrew","Ryan","Nicholas","Brandon","Tyler","Justin","Kevin","Austin","Logan","Noah","Liam","Mason","Ethan","Jacob","Lucas","Benjamin","William","Carlos","Jose","Luis","Miguel","Juan","Victor","Adrian","Marco"];
const EN_LAST  = ["Smith","Johnson","Williams","Brown","Jones","Miller","Davis","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Garcia","Martinez","Robinson","Clark","Rodriguez","Lewis","Lee","Walker","Hall","Allen","Young","King","Wright","Scott","Green","Baker","Adams","Nelson","Carter","Mitchell","Perez","Sanchez","Ramirez"];

// ====== PRNG ======
let _seed = 0x99887766;
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
function fmtId(prefix, n) { return prefix + '_' + String(n).padStart(5, '0'); }
function range(lo, hi) { const r=[]; for(let i=lo;i<=hi;i++) r.push(i); return r; }

function krName() {
  const last  = pick(KR_LAST);
  const given = pick(KR_GIVEN);
  return { name: last+given, nameEn: (KR_LAST_ROM[last]||last)+' '+(KR_GIVEN_ROM[given]||given) };
}
function enName() {
  const first = pick(EN_FIRST);
  const last  = pick(EN_LAST);
  return { name: first+' '+last, nameEn: first+' '+last };
}

// ====== STATS ======
const PITCHES_ALL  = ['PITCH_FASTBALL','PITCH_SLIDER','PITCH_CURVE','PITCH_CHANGEUP','PITCH_SPLITTER','PITCH_CUTTER','PITCH_SINKER','PITCH_SCREWBALL'];
const PITCHER_POS  = new Set(['SP','RP','CP']);

function genPitching(ovr) {
  const s = 12;
  return { ovr, stamina:clamp(ovr+randInt(-s,s),30,99), velocity:clamp(ovr+randInt(-s,s),30,99), command:clamp(ovr+randInt(-s,s),30,99), control:clamp(ovr+randInt(-s,s),30,99), movement:clamp(ovr+randInt(-s,s),30,99), mentality:clamp(ovr+randInt(-s,s),30,99), recovery:clamp(ovr+randInt(-s,s),30,99), clutch:50, holdRunners:50 };
}
function genBatting(ovr) {
  const s = 12;
  return { ovr, contact:clamp(ovr+randInt(-s,s),30,99), power:clamp(ovr+randInt(-s,s),30,99), eye:clamp(ovr+randInt(-s,s),30,99), discipline:clamp(ovr+randInt(-s,s),30,99), speed:clamp(ovr+randInt(-s,s),30,99), fielding:clamp(ovr+randInt(-s,s),30,99), arm:clamp(ovr+randInt(-s,s),30,99), battingClutch:50, baseInstinct:50, bunting:45, platoon:50 };
}
function genPitches(count) {
  const pool = [...PITCHES_ALL].filter(p=>p!=='PITCH_FASTBALL').sort(()=>rand()-0.5);
  const r = [{ id:'PITCH_FASTBALL', grade:randInt(3,5) }];
  for(let i=0;i<count-1&&i<pool.length;i++) r.push({ id:pool[i], grade:randInt(2,4) });
  return r;
}

function buildProPlayer(id, leagueId, clubId, teamId, isActive, nameGen) {
  const ovrRange = leagueId === 'LEAGUE_KBL'
    ? (isActive ? [58,88] : [50,75])
    : (isActive ? [62,92] : [54,78]);
  const positions = isActive
    ? ['SP','SP','SP','SP','SP','RP','RP','RP','CP','CP','C','C','1B','1B','2B','2B','3B','3B','SS','SS','LF','LF','CF','CF','RF','RF','UT','UT','UT','UT']
    : ['SP','SP','RP','RP','CP','C','1B','2B','3B','SS','LF','CF','RF','UT','UT','UT','UT','UT','UT','UT'];

  const addPositions = ['SP','RP','CP','C','1B','2B','SS','LF','RF','UT'];
  const pos = pick(addPositions);
  const isPitcher = PITCHER_POS.has(pos);
  const ovr = randInt(...ovrRange);
  const batOvr = isPitcher ? randInt(ovrRange[0]-20, ovrRange[0]-5) : ovr;
  const nm = nameGen();
  const age = randInt(isActive ? 22 : 19, isActive ? 35 : 28);

  return {
    id,
    name: nm.name,
    nameEn: nm.nameEn,
    role: "player",
    age,
    status: "active",
    originLeagueId: leagueId,
    leagueId,
    clubId,
    teamId,
    grade: null,
    schoolId: "SCHOOL_NONE",
    notes: "",
    details: {
      player: {
        playerType: isPitcher ? "pitcher" : "batter",
        handedness: rand() < 0.75 ? "R" : "L",
        position: pos,
        jerseyNumber: randInt(1, 99),
        pitching: genPitching(ovr),
        batting:  genBatting(batOvr),
        developmentRate: randInt(30, 70),
        potentialHidden:  randInt(ovr - 5, Math.min(99, ovr + 15)),
        primaryPosition: pos,
        positionRatings: { [pos]: ovr },
        pitches: isPitcher ? genPitches(randInt(2, 5)) : [{ id: 'PITCH_FASTBALL', grade: 1 }]
      },
      coach:   { specialty:"-",experienceYears:0,stats:{teaching:50,analysis:50,communication:50,discipline:50,leadership:50},trainingBuffs:"" },
      manager: { style:"균형",experienceYears:0,stats:{tactics:50,decision:50,rotationMgmt:50,bullpenMgmt:50,moraleMgmt:50},gamePlanBias:"",riskTolerance:50 },
      owner:   { ownershipStyle:"안정 운영",tenureYears:0,stats:{budgetSupport:50,patience:50,prInfluence:50,facilityInvestment:50,staffTrust:50},budgetPolicy:"",hiringPolicy:"" }
    },
    contact: { category:"",relation:"",initialAffinity:0,arcs:[],chat:{} },
    diligence: randInt(40, 80),
    popularity: randInt(10, 60)
  };
}

// ====== KBL 팀 블록 정의 (기존 PLY 범위) ======
const KBL_CLUBS = [
  { file:'PKT_Seoul_TwinWolves',      clubId:'CLUB_KBL_TWINWOLVES',      t1:'TEAM_KBL_TWINWOLVES_1',      t2:'TEAM_KBL_TWINWOLVES_2',      ply1:[461,485], ply2:[486,505] },
  { file:'PKT_Seoul_BearGuardians',   clubId:'CLUB_KBL_BEARGUARDIANS',   t1:'TEAM_KBL_BEARGUARDIANS_1',   t2:'TEAM_KBL_BEARGUARDIANS_2',   ply1:[506,530], ply2:[531,550] },
  { file:'PKT_Incheon_SkyGulls',      clubId:'CLUB_KBL_SKYGULLS',        t1:'TEAM_KBL_SKYGULLS_1',        t2:'TEAM_KBL_SKYGULLS_2',        ply1:[551,575], ply2:[576,595] },
  { file:'PKT_Daejeon_SoaringEagles', clubId:'CLUB_KBL_SOARINGEAGLES',   t1:'TEAM_KBL_SOARINGEAGLES_1',   t2:'TEAM_KBL_SOARINGEAGLES_2',   ply1:[596,620], ply2:[621,640] },
  { file:'PKT_Gwangju_EmberTigers',   clubId:'CLUB_KBL_EMBERTIGERS',     t1:'TEAM_KBL_EMBERTIGERS_1',     t2:'TEAM_KBL_EMBERTIGERS_2',     ply1:[641,665], ply2:[666,685] },
  { file:'PKT_Daegu_RoyalLions',      clubId:'CLUB_KBL_ROYALLIONS',      t1:'TEAM_KBL_ROYALLIONS_1',      t2:'TEAM_KBL_ROYALLIONS_2',      ply1:[686,710], ply2:[711,730] },
  { file:'PKT_Changwon_SteelDinos',   clubId:'CLUB_KBL_STEELDINOS',      t1:'TEAM_KBL_STEELDINOS_1',      t2:'TEAM_KBL_STEELDINOS_2',      ply1:[731,755], ply2:[756,775] },
  { file:'PKT_Busan_GiantWhales',     clubId:'CLUB_KBL_GIANTWHALES',     t1:'TEAM_KBL_GIANTWHALES_1',     t2:'TEAM_KBL_GIANTWHALES_2',     ply1:[776,800], ply2:[801,820] }
];

// ====== ABL 팀 블록 정의 ======
const ABL_TEAMS_ORDER = ['EMPIRE','HARBORHAWKS','SUNDRAGONS','WINDBEARS','SPACECOMETS','PEACHTREEFALCONS','LONESTARS','RAINARROWS','BAYSEALS','WAVERIDERS','MOTORWOLVES','MOUNTAINPEAKS','LAKESPIRITS','COASTALRAYS','DESERTSERPENTS','RIVERCARDINALS'];
const ABL_FILES       = ['PUT_NewYork_Empire','PUT_Boston_HarborHawks','PUT_LosAngeles_SunDragons','PUT_Chicago_WindBears','PUT_Houston_SpaceComets','PUT_Atlanta_PeachtreeFalcons','PUT_Dallas_LoneStars','PUT_Seattle_RainArrows','PUT_SanFrancisco_BaySeals','PUT_Miami_WaveRiders','PUT_Detroit_MotorWolves','PUT_Denver_MountainPeaks','PUT_Cleveland_LakeSpirits','PUT_SanDiego_CoastalRays','PUT_Phoenix_DesertSerpents','PUT_StLouis_RiverCardinals'];

// ABL 1군/2군 PLY 범위 (기존)
const ABL_PLY1_STARTS = [821,866,911,956,1001,1046,1091,1136,1181,1226,1271,1316,1361,1406,1451,1496];
const ABL_PLY2_STARTS = [846,891,936,981,1026,1071,1116,1161,1206,1251,1296,1341,1386,1431,1476,1521];

const ABL_CLUBS = ABL_TEAMS_ORDER.map((key, i) => ({
  file:    ABL_FILES[i],
  clubId:  'CLUB_ABL_' + key,
  t1:      'TEAM_ABL_' + key + '_1',
  t2:      'TEAM_ABL_' + key + '_2',
  ply1:    [ABL_PLY1_STARTS[i], ABL_PLY1_STARTS[i] + 24],
  ply2:    [ABL_PLY2_STARTS[i], ABL_PLY2_STARTS[i] + 19]
}));

// ====== 메인 ======
let plyN = 1862; // HS NPC 팀 마지막(PLY_01861) 다음부터
const newKblArr = [];
const newAblArr = [];

// 읽어서 기존 _index.json 가져오기
const indexPath = path.join(PLAYERS_DIR, '_index.json');
const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

// ---- KBL 처리 ----
const existingKbl = indexData.byLeague['LEAGUE_KBL'];

// 기존 KBL 배열을 팀별 블록으로 분할 후 PLY 추가
// 기존 배열에서 PLY/COA/MNG/OWN 그룹 식별: clubId 기반으로 재구성
// 단순하게: 기존 배열 전체 유지 + 각 팀별로 10명씩 끝에 추가
// 팀 JSON roster도 함께 업데이트

for (const club of KBL_CLUBS) {
  const newPly1 = [];
  const newPly2 = [];

  // 1군 10명 추가
  for (let j = 0; j < 10; j++) {
    const id = fmtId('PLY', plyN++);
    const data = buildProPlayer(id, 'LEAGUE_KBL', club.clubId, club.t1, true, krName);
    fs.writeFileSync(path.join(PLAYERS_DIR, id+'.json'), JSON.stringify(data,null,2),'utf8');
    newPly1.push(id);
  }
  // 2군 10명 추가
  for (let j = 0; j < 10; j++) {
    const id = fmtId('PLY', plyN++);
    const data = buildProPlayer(id, 'LEAGUE_KBL', club.clubId, club.t2, false, krName);
    fs.writeFileSync(path.join(PLAYERS_DIR, id+'.json'), JSON.stringify(data,null,2),'utf8');
    newPly2.push(id);
  }

  // 팀 JSON roster 업데이트
  const teamFp = path.join(KBL_DIR, club.file + '.json');
  const teamData = JSON.parse(fs.readFileSync(teamFp,'utf8'));
  teamData.roster.active = [...range(...club.ply1).map(n=>fmtId('PLY',n)), ...newPly1];
  teamData.roster.farm   = [...range(...club.ply2).map(n=>fmtId('PLY',n)), ...newPly2];
  fs.writeFileSync(teamFp, JSON.stringify(teamData,null,2),'utf8');

  newKblArr.push(...newPly1, ...newPly2);
}

// _index.json LEAGUE_KBL 뒤에 새 PLY 추가
indexData.byLeague['LEAGUE_KBL'] = [...existingKbl, ...newKblArr];
console.log('KBL 추가: ' + newKblArr.length + '명 (PLY_01862~PLY_' + String(plyN-newKblArr.length-1+newKblArr.length).padStart(5,'0') + ')');

// ---- ABL 처리 ----
const existingAbl = indexData.byLeague['LEAGUE_ABL'];

for (const club of ABL_CLUBS) {
  const newPly1 = [];
  const newPly2 = [];

  for (let j = 0; j < 10; j++) {
    const id = fmtId('PLY', plyN++);
    const data = buildProPlayer(id, 'LEAGUE_ABL', club.clubId, club.t1, true, enName);
    fs.writeFileSync(path.join(PLAYERS_DIR, id+'.json'), JSON.stringify(data,null,2),'utf8');
    newPly1.push(id);
  }
  for (let j = 0; j < 10; j++) {
    const id = fmtId('PLY', plyN++);
    const data = buildProPlayer(id, 'LEAGUE_ABL', club.clubId, club.t2, false, enName);
    fs.writeFileSync(path.join(PLAYERS_DIR, id+'.json'), JSON.stringify(data,null,2),'utf8');
    newPly2.push(id);
  }

  const teamFp = path.join(ABL_DIR, club.file + '.json');
  const teamData = JSON.parse(fs.readFileSync(teamFp,'utf8'));
  teamData.roster.active = [...range(...club.ply1).map(n=>fmtId('PLY',n)), ...newPly1];
  teamData.roster.farm   = [...range(...club.ply2).map(n=>fmtId('PLY',n)), ...newPly2];
  fs.writeFileSync(teamFp, JSON.stringify(teamData,null,2),'utf8');

  newAblArr.push(...newPly1, ...newPly2);
}

indexData.byLeague['LEAGUE_ABL'] = [...existingAbl, ...newAblArr];
console.log('ABL 추가: ' + newAblArr.length + '명');

// _index.json 저장
indexData.generated = new Date().toISOString();
fs.writeFileSync(indexPath, JSON.stringify(indexData,null,2),'utf8');

console.log('총 신규 PLY: ' + (plyN - 1862) + '명  (' + fmtId('PLY',1862) + ' ~ ' + fmtId('PLY',plyN-1) + ')');
console.log('KBL 팀 JSON 로스터 업데이트: ' + KBL_CLUBS.length + '팀');
console.log('ABL 팀 JSON 로스터 업데이트: ' + ABL_CLUBS.length + '팀');
