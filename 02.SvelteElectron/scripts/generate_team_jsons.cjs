'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'resource', 'data', 'master', 'teams');

function pad(n, len) { return String(n).padStart(len, '0'); }
function plyId(n) { return 'PLY_' + pad(n, 5); }
function range(lo, hi) {
  const arr = [];
  for (let i = lo; i <= hi; i++) arr.push(plyId(i));
  return arr;
}

// ── HS Teams ─────────────────────────────────────────────────────────────────
const HS_TEAMS = [
  {
    teamId: 'TEAM_HS_SEOUL_INNOVATION',
    name: '서울 이노베이션', nameEn: 'Seoul Innovation',
    city: '서울', cityEn: 'Seoul',
    selectable: true,
    colors: ['#1565c0', '#ffffff'],
    stadium: '서울 이노베이션 고교 야구장',
    players: [...range(1, 20), ...range(1542, 1551)]
  },
  {
    teamId: 'TEAM_HS_BUSAN_WAVE',
    name: '부산 웨이브', nameEn: 'Busan Wave',
    city: '부산', cityEn: 'Busan',
    selectable: true,
    colors: ['#00838f', '#ffffff'],
    stadium: '부산 웨이브 고교 야구장',
    players: [...range(21, 40), ...range(1552, 1561)]
  },
  {
    teamId: 'TEAM_HS_DAEGU_HEAT',
    name: '대구 히트', nameEn: 'Daegu Heat',
    city: '대구', cityEn: 'Daegu',
    selectable: true,
    colors: ['#b71c1c', '#ffffff'],
    stadium: '대구 히트 고교 야구장',
    players: [...range(41, 60), ...range(1562, 1571)]
  },
  {
    teamId: 'TEAM_HS_GWANGJU_VISION',
    name: '광주 비전', nameEn: 'Gwangju Vision',
    city: '광주', cityEn: 'Gwangju',
    selectable: true,
    colors: ['#1b5e20', '#ffd600'],
    stadium: '광주 비전 고교 야구장',
    players: [...range(61, 80), ...range(1572, 1581)]
  },
  {
    teamId: 'TEAM_HS_DAEJEON_RISE',
    name: '대전 라이즈', nameEn: 'Daejeon Rise',
    city: '대전', cityEn: 'Daejeon',
    selectable: true,
    colors: ['#4a148c', '#ffffff'],
    stadium: '대전 라이즈 고교 야구장',
    players: [...range(81, 100), ...range(1582, 1591)]
  },
  {
    teamId: 'TEAM_HS_INCHEON_HARBOR',
    name: '인천 하버', nameEn: 'Incheon Harbor',
    city: '인천', cityEn: 'Incheon',
    selectable: true,
    colors: ['#01579b', '#f57f17'],
    stadium: '인천 하버 고교 야구장',
    players: [...range(101, 120), ...range(1592, 1601)]
  },
  {
    teamId: 'TEAM_HS_ULSAN_CHARGE',
    name: '울산 차지', nameEn: 'Ulsan Charge',
    city: '울산', cityEn: 'Ulsan',
    selectable: true,
    colors: ['#e65100', '#ffffff'],
    stadium: '울산 차지 고교 야구장',
    players: [...range(121, 140), ...range(1602, 1611)]
  },
  {
    teamId: 'TEAM_HS_SUWON_EDGE',
    name: '수원 엣지', nameEn: 'Suwon Edge',
    city: '수원', cityEn: 'Suwon',
    selectable: true,
    colors: ['#37474f', '#cfd8dc'],
    stadium: '수원 엣지 고교 야구장',
    players: [...range(141, 160), ...range(1612, 1621)]
  },
  {
    teamId: 'TEAM_HS_YEOSU_SHORE',
    name: '여수 쇼어', nameEn: 'Yeosu Shore',
    city: '여수', cityEn: 'Yeosu',
    selectable: false,
    colors: ['#006064', '#ffffff'],
    stadium: '여수 쇼어 고교 야구장',
    players: range(1622, 1651)
  },
  {
    teamId: 'TEAM_HS_CHUNCHEON_HIGHLAND',
    name: '춘천 하이랜드', nameEn: 'Chuncheon Highland',
    city: '춘천', cityEn: 'Chuncheon',
    selectable: false,
    colors: ['#33691e', '#ffffff'],
    stadium: '춘천 하이랜드 고교 야구장',
    players: range(1652, 1681)
  },
  {
    teamId: 'TEAM_HS_JEJU_WIND',
    name: '제주 윈드', nameEn: 'Jeju Wind',
    city: '제주', cityEn: 'Jeju',
    selectable: false,
    colors: ['#0277bd', '#76ff03'],
    stadium: '제주 윈드 고교 야구장',
    players: range(1682, 1711)
  },
  {
    teamId: 'TEAM_HS_GANGWON_PEAK',
    name: '강원 피크', nameEn: 'Gangwon Peak',
    city: '강원', cityEn: 'Gangwon',
    selectable: false,
    colors: ['#4e342e', '#ffffff'],
    stadium: '강원 피크 고교 야구장',
    players: range(1712, 1741)
  },
  {
    teamId: 'TEAM_HS_MASAN_HARBOR',
    name: '마산 하버', nameEn: 'Masan Harbor',
    city: '마산', cityEn: 'Masan',
    selectable: false,
    colors: ['#1a237e', '#ffab00'],
    stadium: '마산 하버 고교 야구장',
    players: range(1742, 1771)
  },
  {
    teamId: 'TEAM_HS_JECHEON_RIDGE',
    name: '제천 릿지', nameEn: 'Jecheon Ridge',
    city: '제천', cityEn: 'Jecheon',
    selectable: false,
    colors: ['#263238', '#eceff1'],
    stadium: '제천 릿지 고교 야구장',
    players: range(1772, 1801)
  },
  {
    teamId: 'TEAM_HS_GOYANG_ARROW',
    name: '고양 애로우', nameEn: 'Goyang Arrow',
    city: '고양', cityEn: 'Goyang',
    selectable: false,
    colors: ['#880e4f', '#ffffff'],
    stadium: '고양 애로우 고교 야구장',
    players: range(1802, 1831)
  },
  {
    teamId: 'TEAM_HS_SUNCHEON_BAY',
    name: '순천 베이', nameEn: 'Suncheon Bay',
    city: '순천', cityEn: 'Suncheon',
    selectable: false,
    colors: ['#004d40', '#a5d6a7'],
    stadium: '순천 베이 고교 야구장',
    players: range(1832, 1861)
  }
];

// ── University Teams ──────────────────────────────────────────────────────────
const UNIV_TEAMS = [
  {
    teamId: 'TEAM_UNIV_HANBBIT',
    name: '한국체육대학교', nameEn: 'Korea National Sport University',
    city: '서울', cityEn: 'Seoul',
    colors: ['#003087', '#ffffff'],
    stadium: '한국체육대 야구장',
    players: range(161, 180)
  },
  {
    teamId: 'TEAM_UNIV_DONGMYUNG',
    name: '경북대학교', nameEn: 'Kyungpook National University',
    city: '대구', cityEn: 'Daegu',
    colors: ['#003087', '#e8b800'],
    stadium: '경북대 야구장',
    players: range(181, 200)
  },
  {
    teamId: 'TEAM_UNIV_SEOHAE',
    name: '연세대학교', nameEn: 'Yonsei University',
    city: '서울', cityEn: 'Seoul',
    colors: ['#003087', '#ffffff'],
    stadium: '연세대 야구장',
    players: range(201, 220)
  },
  {
    teamId: 'TEAM_UNIV_NAMGANG',
    name: '고려대학교', nameEn: 'Korea University',
    city: '서울', cityEn: 'Seoul',
    colors: ['#8b0000', '#ffffff'],
    stadium: '고려대 야구장',
    players: range(221, 240)
  },
  {
    teamId: 'TEAM_UNIV_CHEONGUN',
    name: '한양대학교', nameEn: 'Hanyang University',
    city: '서울', cityEn: 'Seoul',
    colors: ['#c00000', '#000000'],
    stadium: '한양대 야구장',
    players: range(241, 260)
  },
  {
    teamId: 'TEAM_UNIV_MIRAE',
    name: '충북대학교', nameEn: 'Chungbuk National University',
    city: '청주', cityEn: 'Cheongju',
    colors: ['#004080', '#ffffff'],
    stadium: '충북대 야구장',
    players: range(261, 280)
  },
  {
    teamId: 'TEAM_UNIV_GAON',
    name: '동국대학교', nameEn: 'Dongguk University',
    city: '서울', cityEn: 'Seoul',
    colors: ['#8b4513', '#ffffff'],
    stadium: '동국대 야구장',
    players: range(281, 300)
  }
];

// ── Independent Teams ─────────────────────────────────────────────────────────
const IND_TEAMS = [
  {
    teamId: 'TEAM_IND_SEOUL_PIONEERS',
    name: '서울 파이오니어스', nameEn: 'Seoul Pioneers',
    city: '서울', cityEn: 'Seoul',
    colors: ['#0d47a1', '#ffffff'],
    stadium: '서울 독립야구장',
    players: range(301, 320)
  },
  {
    teamId: 'TEAM_IND_BUSAN_TEMPEST',
    name: '부산 템페스트', nameEn: 'Busan Tempest',
    city: '부산', cityEn: 'Busan',
    colors: ['#006064', '#ff6f00'],
    stadium: '부산 독립야구장',
    players: range(321, 340)
  },
  {
    teamId: 'TEAM_IND_DAEGU_FALCONS',
    name: '대구 팰컨스', nameEn: 'Daegu Falcons',
    city: '대구', cityEn: 'Daegu',
    colors: ['#880e4f', '#ffffff'],
    stadium: '대구 독립야구장',
    players: range(341, 360)
  },
  {
    teamId: 'TEAM_IND_GWANGJU_STORM',
    name: '광주 스톰', nameEn: 'Gwangju Storm',
    city: '광주', cityEn: 'Gwangju',
    colors: ['#1b5e20', '#ffeb3b'],
    stadium: '광주 독립야구장',
    players: range(361, 380)
  },
  {
    teamId: 'TEAM_IND_DAEJEON_HUNTERS',
    name: '대전 헌터스', nameEn: 'Daejeon Hunters',
    city: '대전', cityEn: 'Daejeon',
    colors: ['#4a148c', '#ffcc02'],
    stadium: '대전 독립야구장',
    players: range(381, 400)
  },
  {
    teamId: 'TEAM_IND_INCHEON_ORCAS',
    name: '인천 오르카스', nameEn: 'Incheon Orcas',
    city: '인천', cityEn: 'Incheon',
    colors: ['#006064', '#ffffff'],
    stadium: '인천 독립야구장',
    players: range(401, 420)
  },
  {
    teamId: 'TEAM_IND_SUWON_BLAZE',
    name: '수원 블레이즈', nameEn: 'Suwon Blaze',
    city: '수원', cityEn: 'Suwon',
    colors: ['#bf360c', '#ffffff'],
    stadium: '수원 독립야구장',
    players: range(421, 440)
  },
  {
    teamId: 'TEAM_IND_ULSAN_PHOENIX',
    name: '울산 피닉스', nameEn: 'Ulsan Phoenix',
    city: '울산', cityEn: 'Ulsan',
    colors: ['#e65100', '#ffd600'],
    stadium: '울산 독립야구장',
    players: range(441, 460)
  }
];

function write(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  console.log('wrote', path.basename(filePath));
}

// ── Write HS Team Files ───────────────────────────────────────────────────────
const hsDir = path.join(BASE, 'highschool');
for (const t of HS_TEAMS) {
  const obj = {
    teamId: t.teamId,
    name: t.name,
    nameEn: t.nameEn,
    city: t.city,
    cityEn: t.cityEn,
    leagueId: 'LEAGUE_HIGHSCHOOL',
    selectable: t.selectable,
    colors: t.colors,
    stadium: t.stadium,
    roster: {
      active: t.players,
      rotation: [],
      lineup: [],
      bullpen: []
    }
  };
  write(path.join(hsDir, t.teamId + '.json'), obj);
}

// ── Write University Team Files ───────────────────────────────────────────────
const univDir = path.join(BASE, 'university');
for (const t of UNIV_TEAMS) {
  const obj = {
    teamId: t.teamId,
    name: t.name,
    nameEn: t.nameEn,
    city: t.city,
    cityEn: t.cityEn,
    leagueId: 'LEAGUE_UNIVERSITY',
    colors: t.colors,
    stadium: t.stadium,
    roster: {
      active: t.players,
      rotation: [],
      lineup: [],
      bullpen: []
    }
  };
  write(path.join(univDir, t.teamId + '.json'), obj);
}

// ── Write Independent Team Files ──────────────────────────────────────────────
const indDir = path.join(BASE, 'independent');
for (const t of IND_TEAMS) {
  const obj = {
    teamId: t.teamId,
    name: t.name,
    nameEn: t.nameEn,
    city: t.city,
    cityEn: t.cityEn,
    leagueId: 'LEAGUE_INDEPENDENT',
    colors: t.colors,
    stadium: t.stadium,
    roster: {
      active: t.players,
      rotation: [],
      lineup: [],
      bullpen: []
    }
  };
  write(path.join(indDir, t.teamId + '.json'), obj);
}

console.log('Done: ' + HS_TEAMS.length + ' HS + ' + UNIV_TEAMS.length + ' UNIV + ' + IND_TEAMS.length + ' IND team files created.');
