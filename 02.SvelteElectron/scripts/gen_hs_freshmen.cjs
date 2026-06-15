// scripts/gen_hs_freshmen.cjs
// 빌드 타임: 16개 고교 25년치 신입생 PLY JSON 생성
// 실행: node scripts/gen_hs_freshmen.cjs
// 출력: resource/data/master/entities/players/PLY_03000 ~ PLY_09799

const path = require("node:path");
const fs   = require("node:fs");

const ROOT        = path.resolve(__dirname, "..");
const OUT_DIR     = path.join(ROOT, "resource/data/master/entities/players");
const START_PLY   = 3000;
const START_YEAR  = 2027;
const YEARS       = 25;

// ── LCG (Rust npc_sim.rs와 동일 알고리즘) ──────────────────────
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

// ── 이름 생성 ─────────────────────────────────────────────────
const SURNAMES    = ["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","류","전"];
const SYLLABLES_A = ["민","준","현","재","우","지","도","성","진","동","태","수","영","혁","훈","기","상","정","세","찬"];
const SYLLABLES_B = ["준","혁","원","환","빈","욱","식","윤","완","호","진","우","기","수","민","찬","훈","성","재","현"];
const POSITIONS   = ["C","1B","2B","3B","SS","LF","CF","RF"];

// 한글 → 로마자 매핑 (성 + 이름 음절)
const KO_TO_EN = {
  // 성
  '김':'Kim','이':'Lee','박':'Park','최':'Choi','정':'Jung',
  '강':'Kang','조':'Jo','윤':'Yoon','장':'Jang','임':'Lim',
  '한':'Han','오':'Oh','서':'Seo','신':'Shin','권':'Kwon',
  '황':'Hwang','안':'An','송':'Song','류':'Ryu','전':'Jeon',
  // SYLLABLES_A
  '민':'Min','준':'Jun','현':'Hyeon','재':'Jae','우':'Woo',
  '지':'Ji','도':'Do','성':'Seong','진':'Jin','동':'Dong',
  '태':'Tae','수':'Su','영':'Young','혁':'Hyeok','훈':'Hun',
  '기':'Ki','상':'Sang','세':'Se','찬':'Chan',
  // SYLLABLES_B
  '원':'Won','환':'Hwan','빈':'Bin','욱':'Wook','식':'Sik',
  '완':'Wan','호':'Ho',
};

function romanize(syl) { return KO_TO_EN[syl] || syl; }

function genName(rng) {
  const sur = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  const a   = SYLLABLES_A[Math.floor(rng() * SYLLABLES_A.length)];
  const b   = SYLLABLES_B[Math.floor(rng() * SYLLABLES_B.length)];
  const nameKo = `${sur}${a}${b}`;
  const nameEn = `${romanize(sur)} ${romanize(a)}${romanize(b)}`;
  return { name: nameKo, nameEn };
}

// ── 능력치 생성 ───────────────────────────────────────────────
function makePitching(ovr, rng) {
  const c = (base, spread) => clampInt(base + (rng() - 0.5) * spread, 1, 99);
  return {
    ovr:         Math.round(ovr),
    stamina:     c(ovr - 2,  12),
    velocity:    c(ovr + 4,  12),
    command:     c(ovr - 5,  12),
    control:     c(ovr - 3,  12),
    movement:    c(ovr - 4,  12),
    mentality:   c(ovr,      12),
    recovery:    c(ovr - 6,  12),
    clutch:      c(ovr - 8,  12),
    holdRunners: c(ovr - 10, 12),
  };
}

function makeBatting(ovr, rng) {
  const c = (base, spread) => clampInt(base + (rng() - 0.5) * spread, 1, 99);
  return {
    ovr:           Math.round(ovr),
    contact:       c(ovr - 2,  12),
    power:         c(ovr - 5,  12),
    eye:           c(ovr - 3,  12),
    discipline:    c(ovr - 4,  12),
    speed:         c(ovr,      12),
    baseInstinct:  c(ovr - 5,  12),
    bunting:       c(ovr - 15, 12),
    platoon:       50,
    fielding:      c(ovr - 5,  12),
    arm:           c(ovr - 5,  12),
    battingClutch: c(ovr - 8,  12),
  };
}

// ── Personality 결정론적 생성 ─────────────────────────────────
function generatePersonality(id, devRate, potentialHidden, age) {
  const idNum = parseInt(id.replace(/\D/g, ""), 10) || 1;
  const lcg   = makeLcg(idNum);
  const ci    = (base, spread, lo, hi) => clampInt(base + (lcg() - 0.5) * spread, lo, hi);

  return {
    loyalty:             ci(50,                                           40, 10, 90),
    ambition:            ci(40 + (age <= 20 ? 10 : 0),                   40, 10, 95),
    greed:               ci(30,                                           40,  5, 95),
    competitiveDrive:    ci(45 + devRate * 0.15,                          40, 10, 95),
    stabilityPreference: ci(30 + age * 0.80,                              35,  5, 95),
    professionalism:     ci(35 + devRate * 0.40 * 0.6,                    30, 10, 95),
    overseasAmbition:    ci(20 + potentialHidden * 0.15,                  30,  0, 90),
    marketPreference:    ci(40,                                           40, 10, 90),
    homeTeamId:          null,
  };
}

// ── 16개 학교 정의 ────────────────────────────────────────────
const SCHOOLS = [
  // 선택 가능 8교
  {
    id: "SCHOOL_HS_SEOUL_INNOVATION", teamId: "TEAM_HS_SEOUL_INNOVATION",
    annualRosterSize: 25, namedNpcPerYear: 3,
    tmpl: { pitchMin: 58, pitchMax: 78, batMin: 53, batMax: 73, devMin: 58, devMax: 76, potMin: 70, potMax: 99 },
  },
  {
    id: "SCHOOL_HS_BUSAN_WAVE", teamId: "TEAM_HS_BUSAN_WAVE",
    annualRosterSize: 22, namedNpcPerYear: 3,
    tmpl: { pitchMin: 50, pitchMax: 70, batMin: 45, batMax: 65, devMin: 52, devMax: 72, potMin: 60, potMax: 90 },
  },
  {
    id: "SCHOOL_HS_DAEGU_HEAT", teamId: "TEAM_HS_DAEGU_HEAT",
    annualRosterSize: 22, namedNpcPerYear: 3,
    tmpl: { pitchMin: 50, pitchMax: 70, batMin: 45, batMax: 65, devMin: 52, devMax: 72, potMin: 60, potMax: 90 },
  },
  {
    id: "SCHOOL_HS_GWANGJU_VISION", teamId: "TEAM_HS_GWANGJU_VISION",
    annualRosterSize: 18, namedNpcPerYear: 2,
    tmpl: { pitchMin: 40, pitchMax: 60, batMin: 36, batMax: 56, devMin: 44, devMax: 64, potMin: 50, potMax: 80 },
  },
  {
    id: "SCHOOL_HS_DAEJEON_RISE", teamId: "TEAM_HS_DAEJEON_RISE",
    annualRosterSize: 18, namedNpcPerYear: 2,
    tmpl: { pitchMin: 40, pitchMax: 60, batMin: 36, batMax: 56, devMin: 44, devMax: 64, potMin: 50, potMax: 80 },
  },
  {
    id: "SCHOOL_HS_INCHEON_HARBOR", teamId: "TEAM_HS_INCHEON_HARBOR",
    annualRosterSize: 20, namedNpcPerYear: 3,
    tmpl: { pitchMin: 46, pitchMax: 66, batMin: 42, batMax: 62, devMin: 48, devMax: 68, potMin: 56, potMax: 86 },
  },
  {
    id: "SCHOOL_HS_ULSAN_CHARGE", teamId: "TEAM_HS_ULSAN_CHARGE",
    annualRosterSize: 18, namedNpcPerYear: 2,
    tmpl: { pitchMin: 40, pitchMax: 60, batMin: 36, batMax: 56, devMin: 44, devMax: 64, potMin: 50, potMax: 80 },
  },
  {
    id: "SCHOOL_HS_SUWON_EDGE", teamId: "TEAM_HS_SUWON_EDGE",
    annualRosterSize: 15, namedNpcPerYear: 2,
    tmpl: { pitchMin: 35, pitchMax: 55, batMin: 30, batMax: 50, devMin: 40, devMax: 60, potMin: 40, potMax: 72 },
  },
  // 비선택 8교
  {
    id: "SCHOOL_HS_GOYANG_ARROW", teamId: "TEAM_HS_GOYANG_ARROW",
    annualRosterSize: 22, namedNpcPerYear: 0,
    tmpl: { pitchMin: 50, pitchMax: 70, batMin: 45, batMax: 65, devMin: 50, devMax: 70, potMin: 58, potMax: 88 },
  },
  {
    id: "SCHOOL_HS_YEOSU_SHORE", teamId: "TEAM_HS_YEOSU_SHORE",
    annualRosterSize: 18, namedNpcPerYear: 0,
    tmpl: { pitchMin: 42, pitchMax: 62, batMin: 38, batMax: 58, devMin: 44, devMax: 64, potMin: 50, potMax: 80 },
  },
  {
    id: "SCHOOL_HS_CHUNCHEON_HIGHLAND", teamId: "TEAM_HS_CHUNCHEON_HIGHLAND",
    annualRosterSize: 18, namedNpcPerYear: 0,
    tmpl: { pitchMin: 42, pitchMax: 62, batMin: 38, batMax: 58, devMin: 44, devMax: 64, potMin: 50, potMax: 80 },
  },
  {
    id: "SCHOOL_HS_JEJU_WIND", teamId: "TEAM_HS_JEJU_WIND",
    annualRosterSize: 18, namedNpcPerYear: 0,
    tmpl: { pitchMin: 40, pitchMax: 60, batMin: 38, batMax: 58, devMin: 44, devMax: 64, potMin: 52, potMax: 82 },
  },
  {
    id: "SCHOOL_HS_GANGWON_PEAK", teamId: "TEAM_HS_GANGWON_PEAK",
    annualRosterSize: 15, namedNpcPerYear: 0,
    tmpl: { pitchMin: 33, pitchMax: 53, batMin: 30, batMax: 50, devMin: 40, devMax: 60, potMin: 40, potMax: 72 },
  },
  {
    id: "SCHOOL_HS_MASAN_HARBOR", teamId: "TEAM_HS_MASAN_HARBOR",
    annualRosterSize: 15, namedNpcPerYear: 0,
    tmpl: { pitchMin: 33, pitchMax: 53, batMin: 30, batMax: 50, devMin: 40, devMax: 60, potMin: 40, potMax: 70 },
  },
  {
    id: "SCHOOL_HS_JECHEON_RIDGE", teamId: "TEAM_HS_JECHEON_RIDGE",
    annualRosterSize: 15, namedNpcPerYear: 0,
    tmpl: { pitchMin: 33, pitchMax: 53, batMin: 30, batMax: 50, devMin: 40, devMax: 58, potMin: 38, potMax: 70 },
  },
  {
    id: "SCHOOL_HS_SUNCHEON_BAY", teamId: "TEAM_HS_SUNCHEON_BAY",
    annualRosterSize: 15, namedNpcPerYear: 0,
    tmpl: { pitchMin: 33, pitchMax: 53, batMin: 30, batMax: 50, devMin: 40, devMax: 60, potMin: 40, potMax: 72 },
  },
];

// ── 메인 생성 ─────────────────────────────────────────────────
function main() {
  let plyNum  = START_PLY;
  let total   = 0;
  let errors  = 0;

  for (const school of SCHOOLS) {
    const autoCount = school.annualRosterSize - school.namedNpcPerYear;
    const { tmpl } = school;

    for (let year = START_YEAR; year < START_YEAR + YEARS; year++) {
      const seedBase = (school.id.length * 997 + year * 31) >>> 0;
      const rng = makeLcg(seedBase);

      for (let i = 0; i < autoCount; i++) {
        const plyId = `PLY_${String(plyNum).padStart(5, "0")}`;
        const { name, nameEn } = genName(rng);
        const isSp    = rng() < 0.30;
        const ovrP    = tmpl.pitchMin + rng() * (tmpl.pitchMax - tmpl.pitchMin);
        const ovrB    = tmpl.batMin   + rng() * (tmpl.batMax   - tmpl.batMin);
        const devRate = clampInt(tmpl.devMin + rng() * (tmpl.devMax - tmpl.devMin), tmpl.devMin, tmpl.devMax);
        const potHid  = clampInt(tmpl.potMin + rng() * (tmpl.potMax - tmpl.potMin), tmpl.potMin, tmpl.potMax);
        const position = isSp ? "SP" : POSITIONS[Math.floor(rng() * POSITIONS.length)];
        const gradYear = year + 2; // Grade 1 입학 → 3년 후 졸업

        const entity = {
          id:           plyId,
          name,
          nameEn,
          role:         "player",
          age:          16,
          status:       "active",
          originLeagueId: "LEAGUE_HIGHSCHOOL",
          leagueId:     "LEAGUE_HIGHSCHOOL",
          clubId:       school.teamId,
          teamId:       school.teamId,
          schoolId:     school.id,
          grade:        1,
          graduationYear: gradYear,
          notes:        "",
          diligence:    clampInt(40 + rng() * 40, 40, 80),
          popularity:   clampInt(5  + rng() * 30,  5, 35),
          militaryStatus: "미필",
          entryYear:    year,
          entryLeague:  "LEAGUE_HIGHSCHOOL",
          entryTeam:    school.teamId,
          details: {
            player: {
              playerType:     isSp ? "pitcher" : "batter",
              handedness:     rng() < 0.25 ? "L" : "R",
              position,
              jerseyNumber:   clampInt(1 + Math.floor(rng() * 98), 1, 99),
              primaryPosition: position,
              developmentRate: devRate,
              potentialHidden: potHid,
              pitching:  makePitching(ovrP, rng),
              batting:   makeBatting(ovrB, rng),
              positionRatings: { [position]: Math.round(isSp ? ovrP : ovrB) },
            },
            coach:   null,
            manager: null,
            owner:   null,
          },
          contact: { category: "", relation: "", initialAffinity: 0, arcs: [], chat: {} },
        };

        // personality는 generate_master_db.cjs의 generatePersonality()가 삽입
        // (entryYear 있는 entity도 동일하게 처리됨)

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
    console.log(`  [done] ${school.id}: ${autoCount * YEARS}명 생성`);
  }

  console.log(`\n[gen_hs_freshmen] 완료: ${total}개 생성, ${errors}개 오류`);
  console.log(`[gen_hs_freshmen] PLY 번호: PLY_${String(START_PLY).padStart(5,"0")} ~ PLY_${String(plyNum - 1).padStart(5,"0")}`);
  console.log(`[gen_hs_freshmen] 다음 단계: node scripts/gen_pro_entrants.cjs --startPly ${plyNum}`);
}

main();
