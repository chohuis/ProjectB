/**
 * generate-hs-roster.mjs
 * 고교 8팀 선수·스태프 자동 생성 → people_hs.json
 *
 * 사용: node scripts/generate-hs-roster.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MASTER = resolve(ROOT, "resource/data/master");

// ── 이름 풀 로드 ──────────────────────────────────────────────────────────────
const nameKr = JSON.parse(readFileSync(resolve(MASTER, "players/name_pool_kr.json"), "utf8"));
const nameEn = JSON.parse(readFileSync(resolve(MASTER, "players/name_pool_en.json"), "utf8"));

const KR_LAST   = nameKr.lastNames;
const KR_GIVEN  = nameKr.givenNames;
const EN_LAST   = nameEn.lastNames;
const EN_FIRST  = nameEn.givenNames;

// ── 팀 정의 (bias: 팀 전체 전력 보정치) ──────────────────────────────────────
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

// ── 선수 슬롯 (포지션·타입·학년) ──────────────────────────────────────────────
//   3학년: 주전 / 2학년: 준주전 / 1학년: 유망주
const PLAYER_SLOTS = [
  // 투수 (7)
  { position: "SP", type: "pitcher", grade: 3 },
  { position: "SP", type: "pitcher", grade: 3 },
  { position: "SP", type: "pitcher", grade: 2 },
  { position: "SP", type: "pitcher", grade: 2 },
  { position: "RP", type: "pitcher", grade: 2 },
  { position: "RP", type: "pitcher", grade: 1 },
  { position: "CP", type: "pitcher", grade: 3 },
  // 포수 (2)
  { position: "C",  type: "batter",  grade: 3 },
  { position: "C",  type: "batter",  grade: 2 },
  // 내야수 (6)
  { position: "1B", type: "batter",  grade: 3 },
  { position: "2B", type: "batter",  grade: 3 },
  { position: "SS", type: "batter",  grade: 3 },
  { position: "3B", type: "batter",  grade: 2 },
  { position: "2B", type: "batter",  grade: 2 },
  { position: "SS", type: "batter",  grade: 1 },
  // 외야수 (4)
  { position: "LF", type: "batter",  grade: 3 },
  { position: "CF", type: "batter",  grade: 2 },
  { position: "RF", type: "batter",  grade: 2 },
  { position: "RF", type: "batter",  grade: 1 },
  // 지명타자 (1)
  { position: "DH", type: "batter",  grade: 3 },
];

// ── LCG 시드 RNG (팀별 고정 시드 → 재실행해도 동일 결과) ─────────────────────
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

// ── 기본 details 객체 ─────────────────────────────────────────────────────────
function blankPlayer() {
  return {
    playerType: "pitcher", handedness: "R", position: "SP", jerseyNumber: 0,
    pitching: { ovr:50, stamina:50, velocity:50, command:50, control:50, movement:50, mentality:50, recovery:50 },
    batting:  { ovr:50, contact:50, power:50, eye:50, discipline:50, speed:50, fielding:50, arm:50, battingClutch:50 },
    developmentRate: 50, potentialHidden: 65,
  };
}
function blankCoach()   { return { specialty:"-", experienceYears:0, stats:{ teaching:50, analysis:50, communication:50, discipline:50, leadership:50 }, trainingBuffs:"" }; }
function blankManager() { return { style:"균형", experienceYears:0, stats:{ tactics:50, decision:50, rotationMgmt:50, bullpenMgmt:50, moraleMgmt:50 }, gamePlanBias:"", riskTolerance:50 }; }
function blankOwner()   { return { ownershipStyle:"안정 운영", tenureYears:0, stats:{ budgetSupport:50, patience:50, prInfluence:50, facilityInvestment:50, staffTrust:50 }, budgetPolicy:"", hiringPolicy:"" }; }

// ── 이름 생성 (중복 방지) ──────────────────────────────────────────────────────
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

// ── 팀 1개 생성 ───────────────────────────────────────────────────────────────
function generateTeam(team, teamIdx) {
  const rng     = makeRng(0xBEEF + teamIdx * 0x3E7);
  const makeName = makeNameGen(rng);
  const { id, schoolId, bias } = team;
  const tfmt    = (n) => String(n).padStart(2, "0");
  const pfmt    = (n) => String(n).padStart(3, "0");
  const entities = [];

  // ── 감독 ──
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
        style: pick(rng, ["균형", "공격적", "수비적", "데이터 중심", "베테랑 중심"]),
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

  // ── 코치 (투수코치, 타격코치) ──
  const COACH_SPECS = [
    { specialty: "투구", trainingBuffs: "구속 훈련 +2%" },
    { specialty: "타격", trainingBuffs: "컨택 훈련 +2%" },
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

  // ── 이사장 ──
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
    notes: "학교법인 이사장",
    details: {
      player: blankPlayer(),
      coach: blankCoach(),
      manager: blankManager(),
      owner: {
        ownershipStyle: pick(rng, ["안정 운영", "투자 확대", "육성 우선", "성적 우선"]),
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

  // ── 선수 20명 ──
  PLAYER_SLOTS.forEach((slot, pi) => {
    const p           = makeName();
    const isPitcher   = slot.type === "pitcher";
    const gradeBonus  = slot.grade === 3 ? 5 : slot.grade === 2 ? 0 : -5;
    const baseOvr     = 55 + bias + gradeBonus;
    const highPot     = rng() > 0.8; // 20% 고잠재력

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

// ── 실행 ──────────────────────────────────────────────────────────────────────
const all = [];
for (let i = 0; i < TEAMS.length; i++) {
  const entities = generateTeam(TEAMS[i], i);
  all.push(...entities);
  console.log(`✓ ${TEAMS[i].nameEn.padEnd(22)} ${entities.length}명  (선수 ${PLAYER_SLOTS.length}, 스태프 4)`);
}

const output = {
  version: 1,
  sourceLeague: "LEAGUE_HIGHSCHOOL",
  entities: all,
};

const outPath = resolve(MASTER, "entities/people_hs.json");
writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

console.log(`\n✅ 총 ${all.length}명 생성 완료`);
console.log(`   → ${outPath}`);
