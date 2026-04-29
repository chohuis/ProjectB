/**
 * generate-npc-people.mjs
 * NPC 선수/스태프 데이터 생성기
 * - KBL 8팀
 * - ABL 16팀 (MLB + AAA)
 * - 대학 7팀
 * - 독립 8팀
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MASTER = resolve(ROOT, "resource/data/master");
const ENTITIES_DIR = resolve(MASTER, "entities");

const krPool = JSON.parse(readFileSync(resolve(MASTER, "players/name_pool_kr.json"), "utf8"));
const enPool = JSON.parse(readFileSync(resolve(MASTER, "players/name_pool_en.json"), "utf8"));
const ablEnPool = JSON.parse(readFileSync(resolve(MASTER, "players/name_pool_abl_en.json"), "utf8"));

const KR_LAST = krPool.lastNames;
const KR_GIVEN = krPool.givenNames;
const EN_LAST = enPool.lastNames;
const EN_GIVEN = enPool.givenNames;
const ABL_EN_FIRST = ablEnPool.firstNames;
const ABL_EN_LAST = ablEnPool.lastNames;

const KBL_CLUBS = [
  { no: 1, clubId: "CLUB_KBL_KIA", team1: "TEAM_KBL_KIA_1", team2: "TEAM_KBL_KIA_2" },
  { no: 2, clubId: "CLUB_KBL_SAMSUNG", team1: "TEAM_KBL_SAMSUNG_1", team2: "TEAM_KBL_SAMSUNG_2" },
  { no: 3, clubId: "CLUB_KBL_LG", team1: "TEAM_KBL_LG_1", team2: "TEAM_KBL_LG_2" },
  { no: 4, clubId: "CLUB_KBL_DOOSAN", team1: "TEAM_KBL_DOOSAN_1", team2: "TEAM_KBL_DOOSAN_2" },
  { no: 5, clubId: "CLUB_KBL_KT", team1: "TEAM_KBL_KT_1", team2: "TEAM_KBL_KT_2" },
  { no: 6, clubId: "CLUB_KBL_SSG", team1: "TEAM_KBL_SSG_1", team2: "TEAM_KBL_SSG_2" },
  { no: 7, clubId: "CLUB_KBL_LOTTE", team1: "TEAM_KBL_LOTTE_1", team2: "TEAM_KBL_LOTTE_2" },
  { no: 8, clubId: "CLUB_KBL_HANWHA", team1: "TEAM_KBL_HANWHA_1", team2: "TEAM_KBL_HANWHA_2" }
];

const ABL_CLUBS = [
  { no: 1, clubId: "CLUB_ABL_LAD", mlb: "TEAM_ABL_LAD", aaa: "TEAM_ABL_LAD_AAA" },
  { no: 2, clubId: "CLUB_ABL_NYY", mlb: "TEAM_ABL_NYY", aaa: "TEAM_ABL_NYY_AAA" },
  { no: 3, clubId: "CLUB_ABL_BOS", mlb: "TEAM_ABL_BOS", aaa: "TEAM_ABL_BOS_AAA" },
  { no: 4, clubId: "CLUB_ABL_TOR", mlb: "TEAM_ABL_TOR", aaa: "TEAM_ABL_TOR_AAA" },
  { no: 5, clubId: "CLUB_ABL_SEA", mlb: "TEAM_ABL_SEA", aaa: "TEAM_ABL_SEA_AAA" },
  { no: 6, clubId: "CLUB_ABL_HOU", mlb: "TEAM_ABL_HOU", aaa: "TEAM_ABL_HOU_AAA" },
  { no: 7, clubId: "CLUB_ABL_TEX", mlb: "TEAM_ABL_TEX", aaa: "TEAM_ABL_TEX_AAA" },
  { no: 8, clubId: "CLUB_ABL_ATL", mlb: "TEAM_ABL_ATL", aaa: "TEAM_ABL_ATL_AAA" },
  { no: 9, clubId: "CLUB_ABL_PHI", mlb: "TEAM_ABL_PHI", aaa: "TEAM_ABL_PHI_AAA" },
  { no: 10, clubId: "CLUB_ABL_NYM", mlb: "TEAM_ABL_NYM", aaa: "TEAM_ABL_NYM_AAA" },
  { no: 11, clubId: "CLUB_ABL_CHC", mlb: "TEAM_ABL_CHC", aaa: "TEAM_ABL_CHC_AAA" },
  { no: 12, clubId: "CLUB_ABL_STL", mlb: "TEAM_ABL_STL", aaa: "TEAM_ABL_STL_AAA" },
  { no: 13, clubId: "CLUB_ABL_SD", mlb: "TEAM_ABL_SD", aaa: "TEAM_ABL_SD_AAA" },
  { no: 14, clubId: "CLUB_ABL_SF", mlb: "TEAM_ABL_SF", aaa: "TEAM_ABL_SF_AAA" },
  { no: 15, clubId: "CLUB_ABL_ARI", mlb: "TEAM_ABL_ARI", aaa: "TEAM_ABL_ARI_AAA" },
  { no: 16, clubId: "CLUB_ABL_BAL", mlb: "TEAM_ABL_BAL", aaa: "TEAM_ABL_BAL_AAA" }
];

const UNIV_TEAMS = [
  { no: 1, teamId: "TEAM_UNIV_KNSU", schoolId: "SCHOOL_UNIV_KNSU" },
  { no: 2, teamId: "TEAM_UNIV_KNU", schoolId: "SCHOOL_UNIV_KNU" },
  { no: 3, teamId: "TEAM_UNIV_YONSEI", schoolId: "SCHOOL_UNIV_YONSEI" },
  { no: 4, teamId: "TEAM_UNIV_KOREA", schoolId: "SCHOOL_UNIV_KOREA" },
  { no: 5, teamId: "TEAM_UNIV_HANYANG", schoolId: "SCHOOL_UNIV_HANYANG" },
  { no: 6, teamId: "TEAM_UNIV_CHUNGBUK", schoolId: "SCHOOL_UNIV_CHUNGBUK" },
  { no: 7, teamId: "TEAM_UNIV_DONGGUK", schoolId: "SCHOOL_UNIV_DONGGUK" }
];

const IND_TEAMS = [
  { no: 1, teamId: "TEAM_IND_SEOUL_PIONEERS" },
  { no: 2, teamId: "TEAM_IND_BUSAN_TEMPEST" },
  { no: 3, teamId: "TEAM_IND_DAEGU_FALCONS" },
  { no: 4, teamId: "TEAM_IND_GWANGJU_STORM" },
  { no: 5, teamId: "TEAM_IND_DAEJEON_HUNTERS" },
  { no: 6, teamId: "TEAM_IND_INCHEON_ORCAS" },
  { no: 7, teamId: "TEAM_IND_SUWON_BLAZE" },
  { no: 8, teamId: "TEAM_IND_ULSAN_PHOENIX" }
];

const POS_20 = ["SP", "SP", "SP", "SP", "RP", "RP", "RP", "RP", "CP", "CP", "C", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const POS_25 = ["SP", "SP", "SP", "SP", "SP", "RP", "RP", "RP", "RP", "RP", "RP", "CP", "CP", "C", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "DH", "UTIL"];

const LEAGUE_CONF = {
  LEAGUE_UNIVERSITY: { age: [19, 22], ovr: [52, 76], pot: [58, 92], dev: [45, 65], grade: [1, 2, 3, 4] },
  LEAGUE_INDEPENDENT: { age: [19, 30], ovr: [50, 74], pot: [54, 86], dev: [40, 58], grade: null },
  LEAGUE_KBL_1: { age: [21, 38], ovr: [68, 90], pot: [56, 90], dev: [35, 55], grade: null },
  LEAGUE_KBL_2: { age: [19, 32], ovr: [58, 78], pot: [56, 90], dev: [42, 60], grade: null },
  LEAGUE_ABL_MLB: { age: [22, 42], ovr: [72, 94], pot: [58, 92], dev: [30, 52], grade: null },
  LEAGUE_ABL_AAA: { age: [21, 35], ovr: [65, 85], pot: [58, 92], dev: [30, 52], grade: null }
};

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}
function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function pickWeighted(rng, arr) {
  const total = arr.reduce((acc, item) => acc + (typeof item === "string" ? 1 : item.weight), 0);
  let needle = rng() * total;
  for (const item of arr) {
    const weight = typeof item === "string" ? 1 : item.weight;
    needle -= weight;
    if (needle <= 0) return typeof item === "string" ? item : item.value;
  }
  const tail = arr[arr.length - 1];
  return typeof tail === "string" ? tail : tail.value;
}
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(v))); }
function pct(rng, p) { return rng() < p; }
function pad2(n) { return String(n).padStart(2, "0"); }
function pad3(n) { return String(n).padStart(3, "0"); }

function createNameMaker(rng, used) {
  return () => {
    let name = "";
    let nameEn = "";
    let tryCount = 0;
    do {
      name = `${pick(rng, KR_LAST)}${pick(rng, KR_GIVEN)}`;
      nameEn = `${pick(rng, EN_LAST)} ${pick(rng, EN_GIVEN)}`;
      tryCount += 1;
    } while (used.has(name) && tryCount < 200);
    used.add(name);
    return { name, nameEn };
  };
}

function createAblNameMaker(rng, used) {
  return () => {
    let nameEn = "";
    let tryCount = 0;
    do {
      nameEn = `${pickWeighted(rng, ABL_EN_LAST)} ${pickWeighted(rng, ABL_EN_FIRST)}`;
      tryCount += 1;
    } while (used.has(nameEn) && tryCount < 200);
    used.add(nameEn);
    return { name: toHangulName(nameEn), nameEn };
  };
}

function toHangulName(nameEn) {
  return nameEn
    .split(" ")
    .filter(Boolean)
    .map((part) => romanToHangulSimple(part))
    .join(" ");
}

function romanToHangulSimple(input) {
  const word = input.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return input;

  const directMap = {
    james: "제임스", michael: "마이클", david: "데이비드", john: "존", robert: "로버트",
    daniel: "다니엘", matthew: "매튜", joseph: "조셉", christopher: "크리스토퍼", anthony: "앤서니",
    andrew: "앤드류", ryan: "라이언", nicholas: "니콜라스", brandon: "브랜던", jonathan: "조너선",
    tyler: "타일러", justin: "저스틴", kevin: "케빈", austin: "오스틴", logan: "로건",
    noah: "노아", liam: "리엄", mason: "메이슨", ethan: "이선", jacob: "제이컵",
    aiden: "에이든", elijah: "일라이저", lucas: "루카스", benjamin: "벤자민", william: "윌리엄",
    carlos: "카를로스", jose: "호세", luis: "루이스", miguel: "미겔", juan: "후안",
    alejandro: "알레한드로", francisco: "프란시스코", javier: "하비에르", diego: "디에고",
    victor: "빅터", adrian: "애드리언", marco: "마르코",
    smith: "스미스", johnson: "존슨", williams: "윌리엄스", brown: "브라운", jones: "존스",
    miller: "밀러", davis: "데이비스", wilson: "윌슨", moore: "무어", taylor: "테일러",
    anderson: "앤더슨", thomas: "토머스", jackson: "잭슨", white: "화이트", harris: "해리스",
    martin: "마틴", thompson: "톰프슨", garcia: "가르시아", martinez: "마르티네스", robinson: "로빈슨",
    clark: "클라크", rodriguez: "로드리게스", lewis: "루이스", lee: "리", walker: "워커",
    hall: "홀", allen: "앨런", young: "영", king: "킹", wright: "라이트",
    scott: "스콧", green: "그린", baker: "베이커", adams: "애덤스", nelson: "넬슨",
    carter: "카터", mitchell: "미첼", perez: "페레스", sanchez: "산체스", ramirez: "라미레스",
    flores: "플로레스", castillo: "카스티요", gonzalez: "곤살레스", rivera: "리베라", torres: "토레스"
  };
  if (directMap[word]) return directMap[word];

  let out = word;
  out = out
    .replace(/ph/g, "프")
    .replace(/ch/g, "치")
    .replace(/sh/g, "시")
    .replace(/th/g, "스")
    .replace(/ck/g, "크")
    .replace(/qu/g, "쿠")
    .replace(/x/g, "크스");
  out = out
    .replace(/a/g, "아")
    .replace(/e/g, "에")
    .replace(/i/g, "이")
    .replace(/o/g, "오")
    .replace(/u/g, "우")
    .replace(/y/g, "이")
    .replace(/b/g, "브")
    .replace(/c/g, "크")
    .replace(/d/g, "드")
    .replace(/f/g, "프")
    .replace(/g/g, "그")
    .replace(/h/g, "흐")
    .replace(/j/g, "제")
    .replace(/k/g, "크")
    .replace(/l/g, "르")
    .replace(/m/g, "므")
    .replace(/n/g, "느")
    .replace(/p/g, "프")
    .replace(/r/g, "르")
    .replace(/s/g, "스")
    .replace(/t/g, "트")
    .replace(/v/g, "브")
    .replace(/w/g, "우")
    .replace(/z/g, "즈");
  return out;
}

function blankDetails() {
  return {
    player: {
      playerType: "pitcher",
      handedness: "R",
      position: "SP",
      jerseyNumber: 0,
      pitching: { ovr: 50, stamina: 50, velocity: 50, command: 50, control: 50, movement: 50, mentality: 50, recovery: 50 },
      batting: { ovr: 50, contact: 50, power: 50, eye: 50, discipline: 50, speed: 50, fielding: 50, arm: 50, battingClutch: 50 },
      developmentRate: 50,
      potentialHidden: 70
    },
    coach: {
      specialty: "-",
      experienceYears: 0,
      stats: { teaching: 50, analysis: 50, communication: 50, discipline: 50, leadership: 50 },
      trainingBuffs: ""
    },
    manager: {
      style: "균형",
      experienceYears: 0,
      stats: { tactics: 50, decision: 50, rotationMgmt: 50, bullpenMgmt: 50, moraleMgmt: 50 },
      gamePlanBias: "",
      riskTolerance: 50
    },
    owner: {
      ownershipStyle: "안정 운영",
      tenureYears: 0,
      stats: { budgetSupport: 50, patience: 50, prInfluence: 50, facilityInvestment: 50, staffTrust: 50 },
      budgetPolicy: "",
      hiringPolicy: ""
    }
  };
}

function playerTypeFromPos(pos) {
  if (["SP", "RP", "CP"].includes(pos)) return "pitcher";
  return "batter";
}

function buildPitching(rng, pos, ovr) {
  const base = { ovr, stamina: ovr - 2, velocity: ovr + 2, command: ovr, control: ovr - 1, movement: ovr - 2, mentality: ovr - 1, recovery: ovr - 2 };
  if (pos === "SP") base.stamina += 4;
  if (pos === "RP") { base.stamina -= 6; base.velocity += 2; }
  if (pos === "CP") { base.stamina -= 10; base.velocity += 3; base.control += 2; }
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, clamp(v + randInt(rng, -4, 4))]));
}

function buildBatting(rng, pos, ovr) {
  const b = { ovr, contact: ovr, power: ovr, eye: ovr - 1, discipline: ovr - 1, speed: ovr - 1, fielding: ovr - 2, arm: ovr - 1, battingClutch: ovr };
  if (pos === "C") { b.arm += 4; b.fielding += 3; b.speed -= 3; }
  if (pos === "1B") { b.power += 4; b.speed -= 4; b.arm -= 2; }
  if (["2B", "SS"].includes(pos)) { b.speed += 3; b.fielding += 3; b.power -= 3; }
  if (pos === "3B") { b.power += 2; b.arm += 3; b.speed -= 2; }
  if (["LF", "RF"].includes(pos)) { b.power += 2; b.contact += 1; b.fielding -= 2; }
  if (pos === "CF") { b.speed += 4; b.fielding += 3; b.power -= 2; }
  if (pos === "DH") { b.power += 4; b.contact += 2; b.fielding -= 6; b.speed -= 5; b.arm -= 4; }
  if (pos === "UTIL") { b.contact += 1; b.fielding += 1; }
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, clamp(v + randInt(rng, -4, 4))]));
}

function makePlayerEntity({ rng, makeName, id, leagueId, originLeagueId, teamId, clubId, schoolId, grade, conf, position, jerseyNumber, notes = "" }) {
  const { name, nameEn } = makeName();
  const details = blankDetails();
  const type = playerTypeFromPos(position);
  const isPitcher = type === "pitcher";
  const ovr = randInt(rng, conf.ovr[0], conf.ovr[1]);
  const battingOvr = isPitcher ? clamp(ovr - randInt(rng, 20, 34)) : ovr;
  const pitchingOvr = isPitcher ? ovr : clamp(ovr - randInt(rng, 20, 34));
  details.player.playerType = type;
  details.player.handedness = isPitcher ? (pct(rng, 0.2) ? "L" : "R") : (pct(rng, 0.1) ? "L" : "R");
  details.player.position = position === "UTIL" ? pick(rng, ["2B", "SS", "LF", "RF"]) : position;
  details.player.jerseyNumber = jerseyNumber;
  details.player.pitching = buildPitching(rng, position, pitchingOvr);
  details.player.batting = buildBatting(rng, position, battingOvr);
  details.player.developmentRate = randInt(rng, conf.dev[0], conf.dev[1]);
  details.player.potentialHidden = randInt(rng, conf.pot[0], conf.pot[1]);

  return {
    id,
    name,
    nameEn,
    role: "player",
    age: randInt(rng, conf.age[0], conf.age[1]),
    status: "active",
    originLeagueId,
    leagueId,
    clubId,
    teamId,
    schoolId,
    grade,
    notes,
    details
  };
}

function makeStaffEntity({ rng, makeName, id, role, leagueId, originLeagueId, teamId, clubId, schoolId, ageRange, notes = "" }) {
  const { name, nameEn } = makeName();
  const details = blankDetails();
  if (role === "coach") {
    details.coach.specialty = pick(rng, ["투수", "타격", "수비", "멘탈"]);
    details.coach.experienceYears = randInt(rng, 3, 18);
    details.coach.trainingBuffs = pct(rng, 0.6) ? pick(rng, ["구속 훈련 +2%", "제구 훈련 +2%", "컨택 훈련 +2%", "체력 훈련 +2%"]) : "";
    Object.keys(details.coach.stats).forEach((k) => { details.coach.stats[k] = randInt(rng, 52, 84); });
  } else if (role === "manager") {
    details.manager.style = pick(rng, ["균형", "공격적", "수비적", "데이터 중심", "유망주 중심"]);
    details.manager.experienceYears = randInt(rng, 5, 24);
    details.manager.riskTolerance = randInt(rng, 35, 75);
    Object.keys(details.manager.stats).forEach((k) => { details.manager.stats[k] = randInt(rng, 55, 86); });
  } else if (role === "owner") {
    details.owner.ownershipStyle = pick(rng, ["공격 투자", "안정 운영", "성적 우선", "유망주 중심"]);
    details.owner.tenureYears = randInt(rng, 3, 20);
    details.owner.stats.budgetSupport = randInt(rng, 60, 90);
    details.owner.stats.patience = randInt(rng, 50, 80);
    details.owner.stats.prInfluence = randInt(rng, 45, 82);
    details.owner.stats.facilityInvestment = randInt(rng, 50, 88);
    details.owner.stats.staffTrust = randInt(rng, 50, 82);
  }
  return {
    id,
    name,
    nameEn,
    role,
    age: randInt(rng, ageRange[0], ageRange[1]),
    status: "active",
    originLeagueId,
    leagueId,
    clubId,
    teamId,
    schoolId,
    grade: null,
    notes,
    details
  };
}

function generateKbl() {
  const all = [];
  const usedName = new Set();
  const usedId = new Set();
  KBL_CLUBS.forEach((club, idx) => {
    const rng = makeRng(1000 + idx);
    const makeName = createNameMaker(rng, usedName);
    POS_25.forEach((pos, i) => {
      const id = `PLY_KBL_${pad2(club.no)}_${pad3(i + 1)}`;
      usedId.add(id);
      all.push(makePlayerEntity({ rng, makeName, id, leagueId: "LEAGUE_KBL", originLeagueId: "LEAGUE_KBL", teamId: club.team1, clubId: club.clubId, schoolId: "SCHOOL_NONE", grade: null, conf: LEAGUE_CONF.LEAGUE_KBL_1, position: pos, jerseyNumber: i + 1 }));
    });
    for (let i = 0; i < 3; i += 1) {
      const id = `COA_KBL_${pad2(club.no)}_${pad3(i + 1)}`;
      usedId.add(id);
      all.push(makeStaffEntity({ rng, makeName, id, role: "coach", leagueId: "LEAGUE_KBL", originLeagueId: "LEAGUE_KBL", teamId: club.team1, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [34, 58] }));
    }
    all.push(makeStaffEntity({ rng, makeName, id: `MNG_KBL_${pad2(club.no)}_001`, role: "manager", leagueId: "LEAGUE_KBL", originLeagueId: "LEAGUE_KBL", teamId: club.team1, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [42, 66] }));
    all.push(makeStaffEntity({ rng, makeName, id: `OWN_KBL_${pad2(club.no)}_001`, role: "owner", leagueId: "LEAGUE_KBL", originLeagueId: "LEAGUE_KBL", teamId: club.team1, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [48, 74] }));

    POS_20.forEach((pos, i) => {
      const id = `PLY_KBL_${pad2(club.no)}_${pad3(100 + i + 1)}`;
      usedId.add(id);
      all.push(makePlayerEntity({ rng, makeName, id, leagueId: "LEAGUE_KBL", originLeagueId: "LEAGUE_KBL", teamId: club.team2, clubId: club.clubId, schoolId: "SCHOOL_NONE", grade: null, conf: LEAGUE_CONF.LEAGUE_KBL_2, position: pos, jerseyNumber: i + 31 }));
    });
    for (let i = 0; i < 2; i += 1) {
      const id = `COA_KBL_${pad2(club.no)}_${pad3(100 + i + 1)}`;
      usedId.add(id);
      all.push(makeStaffEntity({ rng, makeName, id, role: "coach", leagueId: "LEAGUE_KBL", originLeagueId: "LEAGUE_KBL", teamId: club.team2, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [34, 58] }));
    }
    all.push(makeStaffEntity({ rng, makeName, id: `MNG_KBL_${pad2(club.no)}_101`, role: "manager", leagueId: "LEAGUE_KBL", originLeagueId: "LEAGUE_KBL", teamId: club.team2, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [42, 66] }));
  });
  return { version: 1, sourceLeague: "LEAGUE_KBL", entities: all };
}

function generateAbl() {
  const all = [];
  const usedName = new Set();
  ABL_CLUBS.forEach((club, idx) => {
    const rng = makeRng(2000 + idx);
    const makeName = createAblNameMaker(rng, usedName);
    POS_25.forEach((pos, i) => {
      const id = `PLY_ABL_${pad2(club.no)}_${pad3(i + 1)}`;
      const p = makePlayerEntity({ rng, makeName, id, leagueId: "LEAGUE_ABL", originLeagueId: "LEAGUE_ABL", teamId: club.mlb, clubId: club.clubId, schoolId: "SCHOOL_NONE", grade: null, conf: LEAGUE_CONF.LEAGUE_ABL_MLB, position: pos, jerseyNumber: i + 1, notes: `국적:${pick(rng, ["미국", "도미니카", "일본", "한국", "베네수엘라"])}` });
      all.push(p);
    });
    for (let i = 0; i < 3; i += 1) {
      all.push(makeStaffEntity({ rng, makeName, id: `COA_ABL_${pad2(club.no)}_${pad3(i + 1)}`, role: "coach", leagueId: "LEAGUE_ABL", originLeagueId: "LEAGUE_ABL", teamId: club.mlb, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [35, 64] }));
    }
    all.push(makeStaffEntity({ rng, makeName, id: `MNG_ABL_${pad2(club.no)}_001`, role: "manager", leagueId: "LEAGUE_ABL", originLeagueId: "LEAGUE_ABL", teamId: club.mlb, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [44, 71] }));

    POS_20.forEach((pos, i) => {
      const id = `PLY_ABL_${pad2(club.no)}_${pad3(100 + i + 1)}`;
      const p = makePlayerEntity({ rng, makeName, id, leagueId: "LEAGUE_ABL", originLeagueId: "LEAGUE_ABL", teamId: club.aaa, clubId: club.clubId, schoolId: "SCHOOL_NONE", grade: null, conf: LEAGUE_CONF.LEAGUE_ABL_AAA, position: pos, jerseyNumber: i + 41, notes: `국적:${pick(rng, ["미국", "도미니카", "일본", "한국", "쿠바"])}` });
      all.push(p);
    });
    for (let i = 0; i < 2; i += 1) {
      all.push(makeStaffEntity({ rng, makeName, id: `COA_ABL_${pad2(club.no)}_${pad3(100 + i + 1)}`, role: "coach", leagueId: "LEAGUE_ABL", originLeagueId: "LEAGUE_ABL", teamId: club.aaa, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [35, 64] }));
    }
    all.push(makeStaffEntity({ rng, makeName, id: `MNG_ABL_${pad2(club.no)}_101`, role: "manager", leagueId: "LEAGUE_ABL", originLeagueId: "LEAGUE_ABL", teamId: club.aaa, clubId: club.clubId, schoolId: "SCHOOL_NONE", ageRange: [44, 71] }));
  });
  return { version: 1, sourceLeague: "LEAGUE_ABL", entities: all };
}

function generateUniv() {
  const all = [];
  const usedName = new Set();
  UNIV_TEAMS.forEach((team, idx) => {
    const rng = makeRng(3000 + idx);
    const makeName = createNameMaker(rng, usedName);
    const gradeSlots = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];
    POS_20.forEach((pos, i) => {
      all.push(makePlayerEntity({
        rng, makeName, id: `PLY_UNIV_${pad2(team.no)}_${pad3(i + 1)}`, leagueId: "LEAGUE_UNIVERSITY", originLeagueId: "LEAGUE_UNIVERSITY",
        teamId: team.teamId, clubId: team.teamId, schoolId: team.schoolId, grade: gradeSlots[i], conf: LEAGUE_CONF.LEAGUE_UNIVERSITY, position: pos, jerseyNumber: i + 1
      }));
    });
    for (let i = 0; i < 2; i += 1) {
      all.push(makeStaffEntity({ rng, makeName, id: `COA_UNIV_${pad2(team.no)}_${pad3(i + 1)}`, role: "coach", leagueId: "LEAGUE_UNIVERSITY", originLeagueId: "LEAGUE_UNIVERSITY", teamId: team.teamId, clubId: team.teamId, schoolId: team.schoolId, ageRange: [32, 58] }));
    }
    all.push(makeStaffEntity({ rng, makeName, id: `MNG_UNIV_${pad2(team.no)}_001`, role: "manager", leagueId: "LEAGUE_UNIVERSITY", originLeagueId: "LEAGUE_UNIVERSITY", teamId: team.teamId, clubId: team.teamId, schoolId: team.schoolId, ageRange: [40, 66] }));
  });
  return { version: 1, sourceLeague: "LEAGUE_UNIVERSITY", entities: all };
}

function generateInd() {
  const all = [];
  const usedName = new Set();
  IND_TEAMS.forEach((team, idx) => {
    const rng = makeRng(4000 + idx);
    const makeName = createNameMaker(rng, usedName);
    POS_20.forEach((pos, i) => {
      all.push(makePlayerEntity({
        rng, makeName, id: `PLY_IND_${pad2(team.no)}_${pad3(i + 1)}`, leagueId: "LEAGUE_INDEPENDENT", originLeagueId: "LEAGUE_INDEPENDENT",
        teamId: team.teamId, clubId: team.teamId, schoolId: "SCHOOL_NONE", grade: null, conf: LEAGUE_CONF.LEAGUE_INDEPENDENT, position: pos, jerseyNumber: i + 1
      }));
    });
    for (let i = 0; i < 2; i += 1) {
      all.push(makeStaffEntity({ rng, makeName, id: `COA_IND_${pad2(team.no)}_${pad3(i + 1)}`, role: "coach", leagueId: "LEAGUE_INDEPENDENT", originLeagueId: "LEAGUE_INDEPENDENT", teamId: team.teamId, clubId: team.teamId, schoolId: "SCHOOL_NONE", ageRange: [33, 61] }));
    }
    all.push(makeStaffEntity({ rng, makeName, id: `MNG_IND_${pad2(team.no)}_001`, role: "manager", leagueId: "LEAGUE_INDEPENDENT", originLeagueId: "LEAGUE_INDEPENDENT", teamId: team.teamId, clubId: team.teamId, schoolId: "SCHOOL_NONE", ageRange: [41, 66] }));
  });
  return { version: 1, sourceLeague: "LEAGUE_INDEPENDENT", entities: all };
}

function assertUniqueIds(files) {
  const seen = new Set();
  for (const file of files) {
    for (const e of file.entities) {
      if (seen.has(e.id)) throw new Error(`중복 ID 발견: ${e.id}`);
      seen.add(e.id);
    }
  }
}

function run() {
  const kbl = generateKbl();
  const abl = generateAbl();
  const univ = generateUniv();
  const ind = generateInd();
  assertUniqueIds([kbl, abl, univ, ind]);

  writeFileSync(resolve(ENTITIES_DIR, "people_kbl.json"), JSON.stringify(kbl, null, 2), "utf8");
  writeFileSync(resolve(ENTITIES_DIR, "people_abl.json"), JSON.stringify(abl, null, 2), "utf8");
  writeFileSync(resolve(ENTITIES_DIR, "people_univ.json"), JSON.stringify(univ, null, 2), "utf8");
  writeFileSync(resolve(ENTITIES_DIR, "people_ind.json"), JSON.stringify(ind, null, 2), "utf8");

  console.log(`KBL: ${kbl.entities.length}명 (목표 424)`);
  console.log(`ABL: ${abl.entities.length}명 (목표 832)`);
  console.log(`UNIV: ${univ.entities.length}명 (목표 161)`);
  console.log(`IND: ${ind.entities.length}명 (목표 184)`);
  console.log("완료: people_kbl.json / people_abl.json / people_univ.json / people_ind.json");
}

run();
