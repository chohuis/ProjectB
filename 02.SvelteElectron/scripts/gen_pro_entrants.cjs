// scripts/gen_pro_entrants.cjs
// 빌드 타임: ABL(165명/년) + JBL(110명/년) 25년치 즉전감 생성
// 실행: node scripts/gen_pro_entrants.cjs [--startPly N]
// 출력: gen_hs_freshmen 완료 후 이어지는 PLY 번호부터

const path = require("node:path");
const fs   = require("node:fs");

const ROOT    = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "resource/data/master/entities/players");

const START_YEAR = 2026;
const YEARS      = 25;

// startPly는 gen_hs_freshmen.cjs 출력 마지막 번호 + 1
const args    = process.argv.slice(2);
const spIdx   = args.indexOf("--startPly");
let   START_PLY = spIdx >= 0 ? parseInt(args[spIdx + 1], 10) : 9800;

// ── LCG ───────────────────────────────────────────────────────
function makeLcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function clampInt(v, lo, hi) {
  return Math.round(Math.min(hi, Math.max(lo, v)));
}

// ── 이름 생성 (영문 이름 - 외국 리그 선수) ──────────────────
const FIRST_NAMES = [
  "Marcus","Tyler","Jordan","Carlos","Luis","Miguel","Ryan","Derek",
  "Brandon","Kevin","Jason","Chris","Daniel","Eric","Kyle","Nathan",
  "Alex","Sean","Jake","Trevor","Cody","Zach","Austin","Hunter",
  "Connor","Logan","Dylan","Blake","Caleb","Evan","Cole","Grant",
];
const LAST_NAMES = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Martinez",
  "Anderson","Taylor","Thomas","Hernandez","Moore","Jackson","White",
  "Harris","Martin","Thompson","Young","Davis","Robinson","Clark",
  "Rodriguez","Lewis","Lee","Walker","Hall","Allen","King","Wright",
  "Scott","Green","Baker","Adams","Nelson","Carter","Mitchell",
];

function genProName(rng) {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last  = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  return { name: `${last} ${first}`, nameEn: `${last} ${first}` };
}

// ── 능력치 생성 ───────────────────────────────────────────────
function makePitching(ovr, rng) {
  const c = (base, spread) => clampInt(base + (rng() - 0.5) * spread, 1, 99);
  return {
    ovr:         Math.round(ovr),
    stamina:     c(ovr - 2,  14),
    velocity:    c(ovr + 4,  14),
    command:     c(ovr - 4,  14),
    control:     c(ovr - 2,  14),
    movement:    c(ovr - 3,  14),
    mentality:   c(ovr,      14),
    recovery:    c(ovr - 5,  14),
    clutch:      c(ovr - 6,  14),
    holdRunners: c(ovr - 8,  14),
  };
}

function makeBatting(ovr, rng) {
  const c = (base, spread) => clampInt(base + (rng() - 0.5) * spread, 1, 99);
  return {
    ovr:           Math.round(ovr),
    contact:       c(ovr - 2,  14),
    power:         c(ovr - 4,  14),
    eye:           c(ovr - 2,  14),
    discipline:    c(ovr - 3,  14),
    speed:         c(ovr,      14),
    baseInstinct:  c(ovr - 4,  14),
    bunting:       c(ovr - 12, 14),
    platoon:       50,
    fielding:      c(ovr - 4,  14),
    arm:           c(ovr - 4,  14),
    battingClutch: c(ovr - 6,  14),
  };
}

// ── Personality ───────────────────────────────────────────────
function generatePersonality(id, devRate, potHidden, age) {
  const idNum = parseInt(id.replace(/\D/g, ""), 10) || 1;
  const lcg   = makeLcg(idNum);
  const ci    = (base, sp, lo, hi) => clampInt(base + (lcg() - 0.5) * sp, lo, hi);
  return {
    loyalty:             ci(45,                          40, 10, 90),
    ambition:            ci(50 + (age <= 24 ? 10 : 0),  40, 10, 95),
    greed:               ci(40,                          40,  5, 95),
    competitiveDrive:    ci(50 + devRate * 0.10,         40, 10, 95),
    stabilityPreference: ci(30 + age * 0.70,             35,  5, 95),
    professionalism:     ci(50,                          30, 10, 95),
    overseasAmbition:    ci(60 + potHidden * 0.10,       30,  0, 90),
    marketPreference:    ci(50,                          40, 10, 90),
    homeTeamId:          null,
  };
}

const POSITIONS = ["C","1B","2B","3B","SS","LF","CF","RF"];

const ABL_NATS = ["미국", "도미니카", "베네수엘라", "쿠바", "파나마", "멕시코", "일본"];
function pickAblNat(rng) { return ABL_NATS[Math.floor(rng() * ABL_NATS.length)]; }

// ── 리그별 파라미터 ───────────────────────────────────────────
const LEAGUES = [
  {
    leagueId:  "LEAGUE_ABL",
    perYear:   165,
    // OVR 범위: 18~22세 40%, 23~28세 40%, 29~35세 20%
    ageGroups: [
      { weight: 0.40, ageMin: 18, ageMax: 22, ovrMin: 50, ovrMax: 68, devMin: 55, devMax: 80, potMin: 60, potMax: 95 },
      { weight: 0.40, ageMin: 23, ageMax: 28, ovrMin: 65, ovrMax: 82, devMin: 45, devMax: 70, potMin: 55, potMax: 88 },
      { weight: 0.20, ageMin: 29, ageMax: 35, ovrMin: 55, ovrMax: 76, devMin: 35, devMax: 55, potMin: 45, potMax: 78 },
    ],
  },
  {
    leagueId:  "LEAGUE_JBL",
    perYear:   110,
    ageGroups: [
      { weight: 0.40, ageMin: 18, ageMax: 22, ovrMin: 45, ovrMax: 63, devMin: 52, devMax: 76, potMin: 55, potMax: 90 },
      { weight: 0.40, ageMin: 23, ageMax: 28, ovrMin: 60, ovrMax: 77, devMin: 42, devMax: 66, potMin: 50, potMax: 84 },
      { weight: 0.20, ageMin: 29, ageMax: 35, ovrMin: 50, ovrMax: 70, devMin: 32, devMax: 52, potMin: 42, potMax: 74 },
    ],
  },
];

// ── 연도별 그룹 선택 ─────────────────────────────────────────
function pickAgeGroup(groups, rng) {
  const r = rng();
  let acc = 0;
  for (const g of groups) {
    acc += g.weight;
    if (r < acc) return g;
  }
  return groups[groups.length - 1];
}

// ── 메인 ─────────────────────────────────────────────────────
function main() {
  let plyNum = START_PLY;
  let total  = 0;
  let errors = 0;

  for (const league of LEAGUES) {
    for (let year = START_YEAR; year < START_YEAR + YEARS; year++) {
      const seedBase = (league.leagueId.length * 1009 + year * 37) >>> 0;
      const rng = makeLcg(seedBase);

      for (let i = 0; i < league.perYear; i++) {
        const plyId = `PLY_${String(plyNum).padStart(5, "0")}`;
        const { name, nameEn } = genProName(rng);
        const grp     = pickAgeGroup(league.ageGroups, rng);
        const age     = clampInt(grp.ageMin + rng() * (grp.ageMax - grp.ageMin + 1), grp.ageMin, grp.ageMax);
        const isSp    = rng() < 0.35;
        const ovr     = grp.ovrMin + rng() * (grp.ovrMax - grp.ovrMin);
        const devRate = clampInt(grp.devMin + rng() * (grp.devMax - grp.devMin), grp.devMin, grp.devMax);
        const potHid  = clampInt(grp.potMin + rng() * (grp.potMax - grp.potMin), grp.potMin, grp.potMax);
        const position = isSp ? "SP" : POSITIONS[Math.floor(rng() * POSITIONS.length)];
        const proServiceYears = Math.max(0, age - 22); // 22세 입단 기준 추정

        const entity = {
          id:             plyId,
          name,
          nameEn,
          role:           "player",
          age,
          status:         "active",
          originLeagueId: league.leagueId,
          leagueId:       league.leagueId,
          clubId:         "",
          teamId:         "",
          schoolId:       "",
          grade:          null,
          notes:          league.leagueId === "LEAGUE_JBL" ? "국적:일본" : `국적:${pickAblNat(rng)}`,
          diligence:      clampInt(45 + rng() * 40, 45, 85),
          popularity:     clampInt(10 + rng() * 40, 10, 50),
          militaryStatus: "군필",
          entryYear:      year,
          entryLeague:    league.leagueId,
          entryTeam:      null,  // FA 입장
          entryAge:       age,
          details: {
            player: {
              playerType:      isSp ? "pitcher" : "batter",
              handedness:      rng() < 0.25 ? "L" : "R",
              position,
              jerseyNumber:    clampInt(1 + Math.floor(rng() * 98), 1, 99),
              primaryPosition: position,
              developmentRate: devRate,
              potentialHidden: potHid,
              proServiceYears,
              pitching:  makePitching(ovr, rng),
              batting:   makeBatting(ovr, rng),
              positionRatings: { [position]: Math.round(ovr) },
            },
            coach:   null,
            manager: null,
            owner:   null,
          },
          contact: { category: "", relation: "", initialAffinity: 0, arcs: [], chat: {} },
        };

        const outPath = path.join(OUT_DIR, `${plyId}.json`);
        try {
          fs.writeFileSync(outPath, JSON.stringify(entity, null, 2), "utf8");
          plyNum++;
          total++;
        } catch (e) {
          console.warn(`  [skip] ${plyId}: ${e.message}`);
          errors++;
        }
      }
    }
    console.log(`  [done] ${league.leagueId}: ${league.perYear * YEARS}명 생성`);
  }

  console.log(`\n[gen_pro_entrants] 완료: ${total}개 생성, ${errors}개 오류`);
  console.log(`[gen_pro_entrants] PLY 번호: PLY_${String(START_PLY).padStart(5,"0")} ~ PLY_${String(plyNum - 1).padStart(5,"0")}`);
  console.log(`[gen_pro_entrants] 다음 단계: node scripts/generate_master_db.cjs`);
}

main();
