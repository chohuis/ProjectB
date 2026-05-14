'use strict';
const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.resolve(__dirname, '..', 'resource', 'data', 'master', 'entities', 'players');

function fmtId(prefix, n) {
  return prefix + '_' + String(n).padStart(5, '0');
}
function range(lo, hi) {
  const r = [];
  for (let i = lo; i <= hi; i++) r.push(i);
  return r;
}

// ====== KBL 8팀 × 2군 블록 매핑 ======
// _index.json 기준 그룹 순서대로 정의
// 블록 구조: 1군(25 PLY + 3 COA + 1 MNG + 1 OWN), 2군(20 PLY + 2 COA + 1 MNG)
const KBL_MAPPING = [
  {
    clubIdNew: 'CLUB_KBL_TWINWOLVES',
    active: { teamId: 'TEAM_KBL_TWINWOLVES_1',    ply: [461,485], coa: [47,49], mng: [24,24], own: [9,9]   },
    farm:   { teamId: 'TEAM_KBL_TWINWOLVES_2',    ply: [486,505], coa: [50,51], mng: [25,25]               }
  },
  {
    clubIdNew: 'CLUB_KBL_BEARGUARDIANS',
    active: { teamId: 'TEAM_KBL_BEARGUARDIANS_1', ply: [506,530], coa: [52,54], mng: [26,26], own: [10,10] },
    farm:   { teamId: 'TEAM_KBL_BEARGUARDIANS_2', ply: [531,550], coa: [55,56], mng: [27,27]               }
  },
  {
    clubIdNew: 'CLUB_KBL_SKYGULLS',
    active: { teamId: 'TEAM_KBL_SKYGULLS_1',      ply: [551,575], coa: [57,59], mng: [28,28], own: [11,11] },
    farm:   { teamId: 'TEAM_KBL_SKYGULLS_2',      ply: [576,595], coa: [60,61], mng: [29,29]               }
  },
  {
    clubIdNew: 'CLUB_KBL_SOARINGEAGLES',
    active: { teamId: 'TEAM_KBL_SOARINGEAGLES_1', ply: [596,620], coa: [62,64], mng: [30,30], own: [12,12] },
    farm:   { teamId: 'TEAM_KBL_SOARINGEAGLES_2', ply: [621,640], coa: [65,66], mng: [31,31]               }
  },
  {
    clubIdNew: 'CLUB_KBL_EMBERTIGERS',
    active: { teamId: 'TEAM_KBL_EMBERTIGERS_1',   ply: [641,665], coa: [67,69], mng: [32,32], own: [13,13] },
    farm:   { teamId: 'TEAM_KBL_EMBERTIGERS_2',   ply: [666,685], coa: [70,71], mng: [33,33]               }
  },
  {
    clubIdNew: 'CLUB_KBL_ROYALLIONS',
    active: { teamId: 'TEAM_KBL_ROYALLIONS_1',    ply: [686,710], coa: [72,74], mng: [34,34], own: [14,14] },
    farm:   { teamId: 'TEAM_KBL_ROYALLIONS_2',    ply: [711,730], coa: [75,76], mng: [35,35]               }
  },
  {
    clubIdNew: 'CLUB_KBL_STEELDINOS',
    active: { teamId: 'TEAM_KBL_STEELDINOS_1',    ply: [731,755], coa: [77,79], mng: [36,36], own: [15,15] },
    farm:   { teamId: 'TEAM_KBL_STEELDINOS_2',    ply: [756,775], coa: [80,81], mng: [37,37]               }
  },
  {
    clubIdNew: 'CLUB_KBL_GIANTWHALES',
    active: { teamId: 'TEAM_KBL_GIANTWHALES_1',   ply: [776,800], coa: [82,84], mng: [38,38], own: [16,16] },
    farm:   { teamId: 'TEAM_KBL_GIANTWHALES_2',   ply: [801,820], coa: [85,86], mng: [39,39]               }
  }
];

// ====== ABL 16팀 × 2군 블록 매핑 ======
// 블록 구조: 1군(25 PLY + 3 COA + 1 MNG), 2군(20 PLY + 2 COA + 1 MNG)
// ABL에는 OWN 없음
const ABL_TEAMS_ORDER = [
  'EMPIRE','HARBORHAWKS','SUNDRAGONS','WINDBEARS',
  'SPACECOMETS','PEACHTREEFALCONS','LONESTARS','RAINARROWS',
  'BAYSEALS','WAVERIDERS','MOTORWOLVES','MOUNTAINPEAKS',
  'LAKESPIRITS','COASTALRAYS','DESERTSERPENTS','RIVERCARDINALS'
];

// ABL 블록 경계 (1군 25명, 2군 20명 교대)
// 1군 블록: PLY start, +25명 / COA 3개 / MNG 1개
// 2군 블록: PLY start, +20명 / COA 2개 / MNG 1개
// 인덱스에서 직접 확인한 값:
const ABL_BLOCKS = [
  // [plyLo, plyHi, coaLo, coaHi, mngLo, squad]
  { ply: [821, 845], coa: [87, 89],   mng: [40, 40], squad: 1 },
  { ply: [846, 865], coa: [90, 91],   mng: [41, 41], squad: 2 },
  { ply: [866, 890], coa: [92, 94],   mng: [42, 42], squad: 1 },
  { ply: [891, 910], coa: [95, 96],   mng: [43, 43], squad: 2 },
  { ply: [911, 935], coa: [97, 99],   mng: [44, 44], squad: 1 },
  { ply: [936, 955], coa: [100,101],  mng: [45, 45], squad: 2 },
  { ply: [956, 980], coa: [102,104],  mng: [46, 46], squad: 1 },
  { ply: [981,1000], coa: [105,106],  mng: [47, 47], squad: 2 },
  { ply: [1001,1025],coa: [107,109],  mng: [48, 48], squad: 1 },
  { ply: [1026,1045],coa: [110,111],  mng: [49, 49], squad: 2 },
  { ply: [1046,1070],coa: [112,114],  mng: [50, 50], squad: 1 },
  { ply: [1071,1090],coa: [115,116],  mng: [51, 51], squad: 2 },
  { ply: [1091,1115],coa: [117,119],  mng: [52, 52], squad: 1 },
  { ply: [1116,1135],coa: [120,121],  mng: [53, 53], squad: 2 },
  { ply: [1136,1160],coa: [122,124],  mng: [54, 54], squad: 1 },
  { ply: [1161,1180],coa: [125,126],  mng: [55, 55], squad: 2 },
  { ply: [1181,1205],coa: [127,129],  mng: [56, 56], squad: 1 },
  { ply: [1206,1225],coa: [130,131],  mng: [57, 57], squad: 2 },
  { ply: [1226,1250],coa: [132,134],  mng: [58, 58], squad: 1 },
  { ply: [1251,1270],coa: [135,136],  mng: [59, 59], squad: 2 },
  { ply: [1271,1295],coa: [137,139],  mng: [60, 60], squad: 1 },
  { ply: [1296,1315],coa: [140,141],  mng: [61, 61], squad: 2 },
  { ply: [1316,1340],coa: [142,144],  mng: [62, 62], squad: 1 },
  { ply: [1341,1360],coa: [145,146],  mng: [63, 63], squad: 2 },
  { ply: [1361,1385],coa: [147,149],  mng: [64, 64], squad: 1 },
  { ply: [1386,1405],coa: [150,151],  mng: [65, 65], squad: 2 },
  { ply: [1406,1430],coa: [152,154],  mng: [66, 66], squad: 1 },
  { ply: [1431,1450],coa: [155,156],  mng: [67, 67], squad: 2 },
  { ply: [1451,1475],coa: [157,159],  mng: [68, 68], squad: 1 },
  { ply: [1476,1495],coa: [160,161],  mng: [69, 69], squad: 2 },
  { ply: [1496,1520],coa: [162,164],  mng: [70, 70], squad: 1 },
  { ply: [1521,1540],coa: [165,166],  mng: [71, 71], squad: 2 }
];

// ABL 블록을 팀별로 페어링 (블록 0-1 = team 0, 블록 2-3 = team 1, ...)
const ABL_MAPPING = [];
for (let i = 0; i < ABL_TEAMS_ORDER.length; i++) {
  const teamKey = ABL_TEAMS_ORDER[i];
  const b1 = ABL_BLOCKS[i * 2];     // 1군 블록
  const b2 = ABL_BLOCKS[i * 2 + 1]; // 2군 블록
  ABL_MAPPING.push({
    clubIdNew: 'CLUB_ABL_' + teamKey,
    active: { teamId: 'TEAM_ABL_' + teamKey + '_1', ply: b1.ply, coa: b1.coa, mng: b1.mng },
    farm:   { teamId: 'TEAM_ABL_' + teamKey + '_2', ply: b2.ply, coa: b2.coa, mng: b2.mng }
  });
}

// ====== 업데이트 함수 ======
function updateFile(id, clubIdNew, teamIdNew) {
  const fp = path.join(PLAYERS_DIR, id + '.json');
  if (!fs.existsSync(fp)) {
    console.warn('  MISSING: ' + fp);
    return false;
  }
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  data.clubId = clubIdNew;
  data.teamId = teamIdNew;
  // leagueId 는 이미 LEAGUE_KBL / LEAGUE_ABL 이므로 유지
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  return true;
}

function processMapping(mapping, leagueLabel) {
  let count = 0;
  for (const club of mapping) {
    const { clubIdNew, active, farm } = club;

    // 1군 PLY
    for (const n of range(...active.ply)) {
      if (updateFile(fmtId('PLY', n), clubIdNew, active.teamId)) count++;
    }
    // 1군 COA
    for (const n of range(...active.coa)) {
      if (updateFile(fmtId('COA', n), clubIdNew, active.teamId)) count++;
    }
    // 1군 MNG
    for (const n of range(...active.mng)) {
      if (updateFile(fmtId('MNG', n), clubIdNew, active.teamId)) count++;
    }
    // 1군 OWN (KBL만)
    if (active.own) {
      for (const n of range(...active.own)) {
        if (updateFile(fmtId('OWN', n), clubIdNew, active.teamId)) count++;
      }
    }

    // 2군 PLY
    for (const n of range(...farm.ply)) {
      if (updateFile(fmtId('PLY', n), clubIdNew, farm.teamId)) count++;
    }
    // 2군 COA
    for (const n of range(...farm.coa)) {
      if (updateFile(fmtId('COA', n), clubIdNew, farm.teamId)) count++;
    }
    // 2군 MNG
    for (const n of range(...farm.mng)) {
      if (updateFile(fmtId('MNG', n), clubIdNew, farm.teamId)) count++;
    }
  }
  console.log(leagueLabel + ' 업데이트: ' + count + '개 파일');
  return count;
}

const kblCount = processMapping(KBL_MAPPING, 'KBL');
const ablCount = processMapping(ABL_MAPPING, 'ABL');
console.log('총 업데이트: ' + (kblCount + ablCount) + '개 파일');
