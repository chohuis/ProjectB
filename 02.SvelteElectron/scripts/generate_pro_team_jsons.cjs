'use strict';
const fs = require('fs');
const path = require('path');

const BASE      = path.resolve(__dirname, '..', 'resource', 'data', 'master');
const KBL_DIR   = path.join(BASE, 'teams', 'pro_korea');
const ABL_DIR   = path.join(BASE, 'teams', 'pro_usa');

// ====== KBL 8팀 정의 ======
const KBL_TEAMS = [
  {
    file: 'PKT_Seoul_TwinWolves',
    teamId: 'TEAM_KBL_TWINWOLVES_1',
    farmTeamId: 'TEAM_KBL_TWINWOLVES_2',
    name: '서울 트윈울브스',
    nameEn: 'Seoul Twin Wolves',
    city: '서울',
    cityEn: 'Seoul',
    budgetTier: 'large',
    salaryCap: 5000000,
    stadium: '서울 베이스볼 파크',
    colors: ['#1a237e', '#c62828']
  },
  {
    file: 'PKT_Seoul_BearGuardians',
    teamId: 'TEAM_KBL_BEARGUARDIANS_1',
    farmTeamId: 'TEAM_KBL_BEARGUARDIANS_2',
    name: '서울 베어가디언스',
    nameEn: 'Seoul Bear Guardians',
    city: '서울',
    cityEn: 'Seoul',
    budgetTier: 'large',
    salaryCap: 5000000,
    stadium: '서울 돔 구장',
    colors: ['#1b5e20', '#fdd835']
  },
  {
    file: 'PKT_Incheon_SkyGulls',
    teamId: 'TEAM_KBL_SKYGULLS_1',
    farmTeamId: 'TEAM_KBL_SKYGULLS_2',
    name: '인천 스카이걸스',
    nameEn: 'Incheon Sky Gulls',
    city: '인천',
    cityEn: 'Incheon',
    budgetTier: 'mid',
    salaryCap: 3500000,
    stadium: '인천 베이 구장',
    colors: ['#0277bd', '#e0e0e0']
  },
  {
    file: 'PKT_Daejeon_SoaringEagles',
    teamId: 'TEAM_KBL_SOARINGEAGLES_1',
    farmTeamId: 'TEAM_KBL_SOARINGEAGLES_2',
    name: '대전 소어링이글스',
    nameEn: 'Daejeon Soaring Eagles',
    city: '대전',
    cityEn: 'Daejeon',
    budgetTier: 'mid',
    salaryCap: 3500000,
    stadium: '대전 이글 구장',
    colors: ['#4a148c', '#ff6f00']
  },
  {
    file: 'PKT_Gwangju_EmberTigers',
    teamId: 'TEAM_KBL_EMBERTIGERS_1',
    farmTeamId: 'TEAM_KBL_EMBERTIGERS_2',
    name: '광주 엠버타이거스',
    nameEn: 'Gwangju Ember Tigers',
    city: '광주',
    cityEn: 'Gwangju',
    budgetTier: 'mid',
    salaryCap: 3500000,
    stadium: '광주 타이거 구장',
    colors: ['#bf360c', '#ffeb3b']
  },
  {
    file: 'PKT_Daegu_RoyalLions',
    teamId: 'TEAM_KBL_ROYALLIONS_1',
    farmTeamId: 'TEAM_KBL_ROYALLIONS_2',
    name: '대구 로얄라이온스',
    nameEn: 'Daegu Royal Lions',
    city: '대구',
    cityEn: 'Daegu',
    budgetTier: 'mid',
    salaryCap: 3500000,
    stadium: '대구 라이온 구장',
    colors: ['#880e4f', '#ffd600']
  },
  {
    file: 'PKT_Changwon_SteelDinos',
    teamId: 'TEAM_KBL_STEELDINOS_1',
    farmTeamId: 'TEAM_KBL_STEELDINOS_2',
    name: '창원 스틸다이노스',
    nameEn: 'Changwon Steel Dinos',
    city: '창원',
    cityEn: 'Changwon',
    budgetTier: 'small',
    salaryCap: 2000000,
    stadium: '창원 다이노 구장',
    colors: ['#37474f', '#e53935']
  },
  {
    file: 'PKT_Busan_GiantWhales',
    teamId: 'TEAM_KBL_GIANTWHALES_1',
    farmTeamId: 'TEAM_KBL_GIANTWHALES_2',
    name: '부산 자이언트웨일스',
    nameEn: 'Busan Giant Whales',
    city: '부산',
    cityEn: 'Busan',
    budgetTier: 'small',
    salaryCap: 2000000,
    stadium: '부산 웨일 구장',
    colors: ['#006064', '#ffffff']
  }
];

// ====== ABL 16팀 정의 ======
const ABL_TEAMS = [
  {
    file: 'PUT_NewYork_Empire',
    teamId: 'TEAM_ABL_EMPIRE_1',
    farmTeamId: 'TEAM_ABL_EMPIRE_2',
    name: 'New York Empire',
    nameEn: 'New York Empire',
    city: 'New York',
    budgetTier: 'large',
    salaryCap: 15000000,
    stadium: 'Empire Field',
    colors: ['#1a237e', '#c62828']
  },
  {
    file: 'PUT_Boston_HarborHawks',
    teamId: 'TEAM_ABL_HARBORHAWKS_1',
    farmTeamId: 'TEAM_ABL_HARBORHAWKS_2',
    name: 'Boston Harbor Hawks',
    nameEn: 'Boston Harbor Hawks',
    city: 'Boston',
    budgetTier: 'large',
    salaryCap: 13000000,
    stadium: 'Harbor Park',
    colors: ['#b71c1c', '#1b5e20']
  },
  {
    file: 'PUT_LosAngeles_SunDragons',
    teamId: 'TEAM_ABL_SUNDRAGONS_1',
    farmTeamId: 'TEAM_ABL_SUNDRAGONS_2',
    name: 'Los Angeles Sun Dragons',
    nameEn: 'Los Angeles Sun Dragons',
    city: 'Los Angeles',
    budgetTier: 'large',
    salaryCap: 14000000,
    stadium: 'Dragon Stadium',
    colors: ['#f57f17', '#311b92']
  },
  {
    file: 'PUT_Chicago_WindBears',
    teamId: 'TEAM_ABL_WINDBEARS_1',
    farmTeamId: 'TEAM_ABL_WINDBEARS_2',
    name: 'Chicago Wind Bears',
    nameEn: 'Chicago Wind Bears',
    city: 'Chicago',
    budgetTier: 'large',
    salaryCap: 12000000,
    stadium: 'Windy City Field',
    colors: ['#1565c0', '#e53935']
  },
  {
    file: 'PUT_Houston_SpaceComets',
    teamId: 'TEAM_ABL_SPACECOMETS_1',
    farmTeamId: 'TEAM_ABL_SPACECOMETS_2',
    name: 'Houston Space Comets',
    nameEn: 'Houston Space Comets',
    city: 'Houston',
    budgetTier: 'mid',
    salaryCap: 9000000,
    stadium: 'Comet Dome',
    colors: ['#004d40', '#ff6f00']
  },
  {
    file: 'PUT_Atlanta_PeachtreeFalcons',
    teamId: 'TEAM_ABL_PEACHTREEFALCONS_1',
    farmTeamId: 'TEAM_ABL_PEACHTREEFALCONS_2',
    name: 'Atlanta Peachtree Falcons',
    nameEn: 'Atlanta Peachtree Falcons',
    city: 'Atlanta',
    budgetTier: 'mid',
    salaryCap: 9000000,
    stadium: 'Peachtree Park',
    colors: ['#880e4f', '#f9a825']
  },
  {
    file: 'PUT_Dallas_LoneStars',
    teamId: 'TEAM_ABL_LONESTARS_1',
    farmTeamId: 'TEAM_ABL_LONESTARS_2',
    name: 'Dallas Lone Stars',
    nameEn: 'Dallas Lone Stars',
    city: 'Dallas',
    budgetTier: 'mid',
    salaryCap: 9000000,
    stadium: 'Star Field',
    colors: ['#01579b', '#e65100']
  },
  {
    file: 'PUT_Seattle_RainArrows',
    teamId: 'TEAM_ABL_RAINARROWS_1',
    farmTeamId: 'TEAM_ABL_RAINARROWS_2',
    name: 'Seattle Rain Arrows',
    nameEn: 'Seattle Rain Arrows',
    city: 'Seattle',
    budgetTier: 'mid',
    salaryCap: 9000000,
    stadium: 'Rain Arrow Park',
    colors: ['#006064', '#33691e']
  },
  {
    file: 'PUT_SanFrancisco_BaySeals',
    teamId: 'TEAM_ABL_BAYSEALS_1',
    farmTeamId: 'TEAM_ABL_BAYSEALS_2',
    name: 'San Francisco Bay Seals',
    nameEn: 'San Francisco Bay Seals',
    city: 'San Francisco',
    budgetTier: 'mid',
    salaryCap: 10000000,
    stadium: 'Bay Field',
    colors: ['#f57f17', '#1565c0']
  },
  {
    file: 'PUT_Miami_WaveRiders',
    teamId: 'TEAM_ABL_WAVERIDERS_1',
    farmTeamId: 'TEAM_ABL_WAVERIDERS_2',
    name: 'Miami Wave Riders',
    nameEn: 'Miami Wave Riders',
    city: 'Miami',
    budgetTier: 'mid',
    salaryCap: 8000000,
    stadium: 'Wave Stadium',
    colors: ['#006064', '#e53935']
  },
  {
    file: 'PUT_Detroit_MotorWolves',
    teamId: 'TEAM_ABL_MOTORWOLVES_1',
    farmTeamId: 'TEAM_ABL_MOTORWOLVES_2',
    name: 'Detroit Motor Wolves',
    nameEn: 'Detroit Motor Wolves',
    city: 'Detroit',
    budgetTier: 'mid',
    salaryCap: 8000000,
    stadium: 'Motor City Park',
    colors: ['#37474f', '#e53935']
  },
  {
    file: 'PUT_Denver_MountainPeaks',
    teamId: 'TEAM_ABL_MOUNTAINPEAKS_1',
    farmTeamId: 'TEAM_ABL_MOUNTAINPEAKS_2',
    name: 'Denver Mountain Peaks',
    nameEn: 'Denver Mountain Peaks',
    city: 'Denver',
    budgetTier: 'mid',
    salaryCap: 8000000,
    stadium: 'Peak Stadium',
    colors: ['#4a148c', '#ffffff']
  },
  {
    file: 'PUT_Cleveland_LakeSpirits',
    teamId: 'TEAM_ABL_LAKESPIRITS_1',
    farmTeamId: 'TEAM_ABL_LAKESPIRITS_2',
    name: 'Cleveland Lake Spirits',
    nameEn: 'Cleveland Lake Spirits',
    city: 'Cleveland',
    budgetTier: 'small',
    salaryCap: 6000000,
    stadium: 'Lakefront Park',
    colors: ['#1b5e20', '#fdd835']
  },
  {
    file: 'PUT_SanDiego_CoastalRays',
    teamId: 'TEAM_ABL_COASTALRAYS_1',
    farmTeamId: 'TEAM_ABL_COASTALRAYS_2',
    name: 'San Diego Coastal Rays',
    nameEn: 'San Diego Coastal Rays',
    city: 'San Diego',
    budgetTier: 'small',
    salaryCap: 6000000,
    stadium: 'Coastal Field',
    colors: ['#01579b', '#f9a825']
  },
  {
    file: 'PUT_Phoenix_DesertSerpents',
    teamId: 'TEAM_ABL_DESERTSERPENTS_1',
    farmTeamId: 'TEAM_ABL_DESERTSERPENTS_2',
    name: 'Phoenix Desert Serpents',
    nameEn: 'Phoenix Desert Serpents',
    city: 'Phoenix',
    budgetTier: 'small',
    salaryCap: 6000000,
    stadium: 'Desert Diamond Stadium',
    colors: ['#bf360c', '#33691e']
  },
  {
    file: 'PUT_StLouis_RiverCardinals',
    teamId: 'TEAM_ABL_RIVERCARDINALS_1',
    farmTeamId: 'TEAM_ABL_RIVERCARDINALS_2',
    name: 'St. Louis River Cardinals',
    nameEn: 'St. Louis River Cardinals',
    city: 'St. Louis',
    budgetTier: 'small',
    salaryCap: 6000000,
    stadium: 'River Field',
    colors: ['#b71c1c', '#f9a825']
  }
];

const BUDGET_ROSTER = {
  large: { active: 35, farm: 30 },
  mid:   { active: 35, farm: 30 },
  small: { active: 35, farm: 30 }
};

function buildTeamJson(t) {
  const rp = BUDGET_ROSTER[t.budgetTier];
  return {
    teamId:     t.teamId,
    farmTeamId: t.farmTeamId,
    name:       t.name,
    nameEn:     t.nameEn,
    city:       t.city,
    cityEn:     t.cityEn || t.city,
    budgetTier: t.budgetTier,
    rosterPolicy: { active: rp.active, farm: rp.farm },
    salaryCap:  t.salaryCap,
    currentPayroll: 0,
    stadium:    t.stadium,
    colors:     t.colors,
    roster: {
      active:   [],
      farm:     [],
      rotation: [],
      lineup:   [],
      bullpen:  []
    }
  };
}

let count = 0;

for (const t of KBL_TEAMS) {
  const fp = path.join(KBL_DIR, t.file + '.json');
  fs.writeFileSync(fp, JSON.stringify(buildTeamJson(t), null, 2), 'utf8');
  count++;
}
console.log('KBL 팀 JSON: ' + KBL_TEAMS.length + '개 생성');

for (const t of ABL_TEAMS) {
  const fp = path.join(ABL_DIR, t.file + '.json');
  fs.writeFileSync(fp, JSON.stringify(buildTeamJson(t), null, 2), 'utf8');
  count++;
}
console.log('ABL 팀 JSON: ' + ABL_TEAMS.length + '개 생성');
console.log('총 팀 파일: ' + count + '개');
