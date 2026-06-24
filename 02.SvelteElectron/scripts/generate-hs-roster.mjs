/**
 * generate-hs-roster.mjs
 * 怨좉탳 8? ?좎닔쨌?ㅽ깭???먮룞 ?앹꽦 ??people_hs.json
 *
 * ?ъ슜: node scripts/generate-hs-roster.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MASTER = resolve(ROOT, "resource/data/master");

// ?? ?대쫫 ? 濡쒕뱶 ??????????????????????????????????????????????????????????????
const nameKr = JSON.parse(readFileSync(resolve(MASTER, "players/name_pool_kr.json"), "utf8"));
const nameEn = JSON.parse(readFileSync(resolve(MASTER, "players/name_pool_en.json"), "utf8"));

const KR_LAST   = nameKr.lastNames;
const KR_GIVEN  = nameKr.givenNames;
const EN_LAST   = nameEn.lastNames;
const EN_FIRST  = nameEn.givenNames;

// ?? ? ?뺤쓽 (bias: ? ?꾩껜 ?꾨젰 蹂댁젙移? ??????????????????????????????????????
const TEAMS = [
  { id: "TEAM_HS_SEOUL_INNOVATION", nameEn: "Seoul Innovation", schoolId: "SCHOOL_HS_SEOUL_INNOVATION", bias:  8 },
  { id: "TEAM_HS_BUSAN_WAVE",       nameEn: "Busan Wave",       schoolId: "SCHOOL_HS_BUSAN_WAVE",       bias:  5 },
  { id: "TEAM_HS_DAEGU_HEAT",       nameEn: "Daegu Heat",       schoolId: "SCHOOL_HS_DAEGU_HEAT",       bias:  3 },
  { id: "TEAM_HS_GWANGJU_VISION",   nameEn: "Gwangju Vision",   schoolId: "SCHOOL_HS_GWANGJU_VISION",   bias:  2 },
  { id: "TEAM_HS_DAEJEON_RISE",     nameEn: "Daejeon Rise",     schoolId: "SCHOOL_HS_DAEJEON_RISE",     bias:  0 },
  { id: "TEAM_HS_INCHEON_HARBOR",   nameEn: "Incheon Harbor",   schoolId: "SCHOOL_HS_INCHEON_HARBOR",   bias:  1 },
  { id: "TEAM_HS_ULSAN_CHARGE",     nameEn: "Ulsan Charge",     schoolId: "SCHOOL_HS_ULSAN_CHARGE",     bias: -2 },
  { id: "TEAM_HS_SUWON_EDGE",       nameEn: "Suwon Edge",       schoolId: "SCHOOL_HS_SUWON_EDGE",       bias: -4 },
];

// ?? ?좎닔 ?щ’ (?ъ??샕룻??끒룻븰?? ??????????????????????????????????????????????
//   3?숇뀈: 二쇱쟾 / 2?숇뀈: 以二쇱쟾 / 1?숇뀈: ?좊쭩二?const PLAYER_SLOTS = [
  // ?ъ닔 (7)
  { position: "SP", type: "pitcher", grade: 3 },
  { position: "SP", type: "pitcher", grade: 3 },
  { position: "SP", type: "pitcher", grade: 2 },
  { position: "SP", type: "pitcher", grade: 2 },
  { position: "RP", type: "pitcher", grade: 2 },
  { position: "RP", type: "pitcher", grade: 1 },
  { position: "CP", type: "pitcher", grade: 3 },
  // ?ъ닔 (2)
  { position: "C",  type: "batter",  grade: 3 },
  { position: "C",  type: "batter",  grade: 2 },
  // ?댁빞??(6)
  { position: "1B", type: "batter",  grade: 3 },
  { position: "2B", type: "batter",  grade: 3 },
  { position: "SS", type: "batter",  grade: 3 },
  { position: "3B", type: "batter",  grade: 2 },
  { position: "2B", type: "batter",  grade: 2 },
  { position: "SS", type: "batter",  grade: 1 },
  // ?몄빞??(4)
  { position: "LF", type: "batter",  grade: 3 },
  { position: "CF", type: "batter",  grade: 2 },
  { position: "RF", type: "batter",  grade: 2 },
  { position: "RF", type: "batter",  grade: 1 },
  // 吏紐낇???(1)
  { position: "DH", type: "batter",  grade: 3 },
];

// ?? LCG ?쒕뱶 RNG (?蹂?怨좎젙 ?쒕뱶 ???ъ떎?됲빐???숈씪 寃곌낵) ?????????????????????
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function genStat(rng, base, spread = 10) {
  return clamp(base + (rng() - 0.5) * 2 * spread);
}

// ?? 湲곕낯 details 媛앹껜 ?????????????????????????????????????????????????????????
function blankPlayer() {
  return {
    playerType: "pitcher", handedness: "R", position: "SP", jerseyNumber: 0,
    pitching: { ovr:50, stamina:50, velocity:50, command:50, control:50, movement:50, mentality:50, recovery:50 },
    batting:  { ovr:50, contact:50, power:50, eye:50, discipline:50, speed:50, fielding:50, arm:50, battingClutch:50, baseInstinct:45, bunting:35, platoon:50 },
    developmentRate: 50, potentialHidden: 65,
  };
}
function blankCoach()   { return { specialty:"-", experienceYears:0, stats:{ teaching:50, analysis:50, communication:50, discipline:50, leadership:50 }, trainingBuffs:"" }; }
function blankManager() { return { style:"洹좏삎", experienceYears:0, stats:{ tactics:50, decision:50, rotationMgmt:50, bullpenMgmt:50, moraleMgmt:50 }, gamePlanBias:"", riskTolerance:50 }; }
function blankOwner()   { return { ownershipStyle:"?덉젙 ?댁쁺", tenureYears:0, stats:{ budgetSupport:50, patience:50, prInfluence:50, facilityInvestment:50, staffTrust:50 }, budgetPolicy:"", hiringPolicy:"" }; }

// ?? ?대쫫 ?앹꽦 (以묐났 諛⑹?) ??????????????????????????????????????????????????????
function makeNameGen(rng) {
  const used = new Set();
  return function () {
    let name, nameEn, tries = 0;
    do {
      const last  = pick(rng, KR_LAST);
      const given = pick(rng, KR_GIVEN);
      name = `${last}${given}`;
      nameEn = `${pick(rng, EN_LAST)} ${pick(rng, EN_FIRST)}`;
      tries++;
    } while (used.has(name) && tries < 100);
    used.add(name);
    return { name, nameEn };
  };
}

// ?? ? 1媛??앹꽦 ???????????????????????????????????????????????????????????????
function generateTeam(team, teamIdx) {
  const rng     = makeRng(0xBEEF + teamIdx * 0x3E7);
  const makeName = makeNameGen(rng);
  const { id, schoolId, bias } = team;
  const tfmt    = (n) => String(n).padStart(2, "0");
  const pfmt    = (n) => String(n).padStart(3, "0");
  const entities = [];

  // ?? 媛먮룆 ??
  const mgr = makeName();
  entities.push({
    id: `MNG_HS_${tfmt(teamIdx + 1)}_001`,
    name: mgr.name, nameEn: mgr.nameEn,
    role: "manager",
    age: randInt(rng, 42, 58),
    status: "active",
    originLeagueId: "LEAGUE_HIGHSCHOOL",
    leagueId: "LEAGUE_HIGHSCHOOL",
    clubId: id, teamId: id,
    schoolId,
    notes: "",
    details: {
      player: blankPlayer(),
      coach: blankCoach(),
      manager: {
        style: pick(rng, ["洹좏삎", "怨듦꺽??, "?섎퉬??, "?곗씠??以묒떖", "踰좏뀒??以묒떖"]),
        experienceYears: randInt(rng, 5, 20),
        stats: {
          tactics:      genStat(rng, 60 + bias, 12),
          decision:     genStat(rng, 60 + bias, 12),
          rotationMgmt: genStat(rng, 58 + bias, 12),
          bullpenMgmt:  genStat(rng, 58 + bias, 12),
          moraleMgmt:   genStat(rng, 60 + bias, 12),
        },
        gamePlanBias: "",
        riskTolerance: randInt(rng, 30, 70),
      },
      owner: blankOwner(),
    },
  });

  // ?? 肄붿튂 (?ъ닔肄붿튂, ?寃⑹퐫移? ??
  const COACH_SPECS = [
    { specialty: "?ш뎄", trainingBuffs: "援ъ냽 ?덈젴 +2%" },
    { specialty: "?寃?, trainingBuffs: "而⑦깮 ?덈젴 +2%" },
  ];
  COACH_SPECS.forEach((spec, ci) => {
    const c = makeName();
    entities.push({
      id: `COA_HS_${tfmt(teamIdx + 1)}_${pfmt(ci + 1)}`,
      name: c.name, nameEn: c.nameEn,
      role: "coach",
      age: randInt(rng, 35, 52),
      status: "active",
      originLeagueId: "LEAGUE_HIGHSCHOOL",
      leagueId: "LEAGUE_HIGHSCHOOL",
      clubId: id, teamId: id,
      schoolId,
      notes: "",
      details: {
        player: blankPlayer(),
        coach: {
          specialty: spec.specialty,
          experienceYears: randInt(rng, 3, 15),
          stats: {
            teaching:      genStat(rng, 60 + bias, 10),
            analysis:      genStat(rng, 58 + bias, 10),
            communication: genStat(rng, 60 + bias, 10),
            discipline:    genStat(rng, 55 + bias, 10),
            leadership:    genStat(rng, 60 + bias, 10),
          },
          trainingBuffs: spec.trainingBuffs,
        },
        manager: blankManager(),
        owner: blankOwner(),
      },
    });
  });

  // ?? ?댁궗????
  const own = makeName();
  entities.push({
    id: `OWN_HS_${tfmt(teamIdx + 1)}_001`,
    name: own.name, nameEn: own.nameEn,
    role: "owner",
    age: randInt(rng, 50, 68),
    status: "active",
    originLeagueId: "LEAGUE_HIGHSCHOOL",
    leagueId: "LEAGUE_HIGHSCHOOL",
    clubId: id, teamId: id,
    schoolId,
    notes: "?숆탳踰뺤씤 ?댁궗??,
    details: {
      player: blankPlayer(),
      coach: blankCoach(),
      manager: blankManager(),
      owner: {
        ownershipStyle: pick(rng, ["?덉젙 ?댁쁺", "?ъ옄 ?뺣?", "?≪꽦 ?곗꽑", "?깆쟻 ?곗꽑"]),
        tenureYears: randInt(rng, 3, 15),
        stats: {
          budgetSupport:      genStat(rng, 55 + bias, 10),
          patience:           genStat(rng, 60,        10),
          prInfluence:        genStat(rng, 50,        10),
          facilityInvestment: genStat(rng, 55 + bias, 10),
          staffTrust:         genStat(rng, 60,        10),
        },
        budgetPolicy: "",
        hiringPolicy: "",
      },
    },
  });

  // ?? ?좎닔 20紐???
  PLAYER_SLOTS.forEach((slot, pi) => {
    const p           = makeName();
    const isPitcher   = slot.type === "pitcher";
    const gradeBonus  = slot.grade === 3 ? 5 : slot.grade === 2 ? 0 : -5;
    const baseOvr     = 55 + bias + gradeBonus;
    const highPot     = rng() > 0.8; // 20% 怨좎옞?щ젰

    const pitching = {
      ovr:       genStat(rng, isPitcher ? baseOvr     : baseOvr - 15, 8),
      stamina:   genStat(rng, 58 + bias + gradeBonus, 10),
      velocity:  genStat(rng, 55 + bias + gradeBonus, 10),
      command:   genStat(rng, 52 + bias + gradeBonus, 10),
      control:   genStat(rng, 52 + bias + gradeBonus, 10),
      movement:  genStat(rng, 50 + bias + gradeBonus, 10),
      mentality: genStat(rng, 55 + bias + gradeBonus, 10),
      recovery:  genStat(rng, 55 + bias + gradeBonus, 10),
    };

    const batting = {
      ovr:          genStat(rng, isPitcher ? baseOvr - 18 : baseOvr, 8),
      contact:      genStat(rng, 52 + bias + gradeBonus, 10),
      power:        genStat(rng, 48 + bias + gradeBonus, 10),
      eye:          genStat(rng, 50 + bias + gradeBonus, 10),
      discipline:   genStat(rng, 50 + bias + gradeBonus, 10),
      speed:        genStat(rng, 55 + bias + gradeBonus, 10),
      fielding:     genStat(rng, 55 + bias + gradeBonus, 10),
      arm:          genStat(rng, 55 + bias + gradeBonus, 10),
      battingClutch: genStat(rng, 52 + bias + gradeBonus, 10),
      baseInstinct:  genStat(rng, 50 + bias + gradeBonus, 10),
      bunting:       genStat(rng, 38 + bias + gradeBonus, 10),
      platoon:       50,
    };

    entities.push({
      id: `PLY_HS_${tfmt(teamIdx + 1)}_${pfmt(pi + 1)}`,
      name: p.name, nameEn: p.nameEn,
      role: "player",
      age: (15 + (3 - slot.grade)) + randInt(rng, 0, 1),
      status: "active",
      originLeagueId: "LEAGUE_HIGHSCHOOL",
      leagueId: "LEAGUE_HIGHSCHOOL",
      clubId: id, teamId: id,
      grade: slot.grade,
      schoolId,
      notes: "",
      details: {
        player: {
          playerType: slot.type,
          handedness: rng() > 0.2 ? "R" : "L",
          position: slot.position,
          jerseyNumber: pi + 1,
          pitching,
          batting,
          developmentRate: randInt(rng, 45, 75),
          potentialHidden: clamp(highPot ? randInt(rng, 82, 95) : randInt(rng, 60, 82)),
        },
        coach: blankCoach(),
        manager: blankManager(),
        owner: blankOwner(),
      },
    });
  });

  return entities;
}

// ?? ?ㅽ뻾 ??????????????????????????????????????????????????????????????????????
const all = [];
for (let i = 0; i < TEAMS.length; i++) {
  const entities = generateTeam(TEAMS[i], i);
  all.push(...entities);
  console.log(`??${TEAMS[i].nameEn.padEnd(22)} ${entities.length}紐? (?좎닔 ${PLAYER_SLOTS.length}, ?ㅽ깭??4)`);
}

const output = {
  version: 1,
  sourceLeague: "LEAGUE_HIGHSCHOOL",
  entities: all,
};

const outPath = resolve(ROOT, "resource/data/staging/people_hs.json");
writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

console.log(`\n??珥?${all.length}紐??앹꽦 ?꾨즺`);
console.log(`   ??${outPath}`);
