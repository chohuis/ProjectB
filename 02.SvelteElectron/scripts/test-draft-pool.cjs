"use strict";
// R3a-4c 드래프트 풀 규모 검증 — KBL 8팀×10라운드(80슬롯)를 채울 후보가 확보되는지
// (고교 3학년 80% cutoff + 대학 top30 + 독립 top15가 프리시즌 Lazy 활성화 이후 실제로 존재하는지)
// 실행: ELECTRON_RUN_AS_NODE=1 npx electron scripts/test-draft-pool.cjs
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../packages/engine-native");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const rulesFile = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/players/generation_rules.json"), "utf8"));
const HS_TEAMS = [
  "TEAM_HS_SEOUL_INNOVATION", "TEAM_HS_BUSAN_WAVE", "TEAM_HS_DAEGU_HEAT",
  "TEAM_HS_GWANGJU_VISION", "TEAM_HS_DAEJEON_RISE", "TEAM_HS_INCHEON_HARBOR",
  "TEAM_HS_ULSAN_CHARGE", "TEAM_HS_SUWON_EDGE",
  "TEAM_HS_YEOSU_SHORE", "TEAM_HS_CHUNCHEON_HIGHLAND",
];
const UNIV_TEAMS = [
  "TEAM_UNIV_HANBBIT", "TEAM_UNIV_DONGMYUNG", "TEAM_UNIV_SEOHAE",
  "TEAM_UNIV_NAMGANG", "TEAM_UNIV_CHEONGUN", "TEAM_UNIV_MIRAE", "TEAM_UNIV_GAON",
];
const IND_TEAMS = [
  "TEAM_IND_SEOUL_PIONEERS", "TEAM_IND_BUSAN_TEMPEST",
  "TEAM_IND_DAEGU_FALCONS", "TEAM_IND_GWANGJU_STORM",
  "TEAM_IND_DAEJEON_HUNTERS", "TEAM_IND_INCHEON_ORCAS",
  "TEAM_IND_SUWON_BLAZE", "TEAM_IND_ULSAN_PHOENIX",
];
const KBL_TEAM_COUNT = 8;
const DRAFT_ROUNDS = 10;
const TOTAL_PICK_SLOTS = KBL_TEAM_COUNT * DRAFT_ROUNDS;  // 80

function gen(leagueId, teams, worldSeed) {
  const params = {
    leagueId, seasonYear: 2026, worldSeed,
    teams: teams.map((teamId) => ({ teamId, schoolId: "" })),
    rules: rulesFile.rosterRules[leagueId],
  };
  const r = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify(params)));
  if (!Array.isArray(r.npcs)) throw new Error(`생성 실패(${leagueId}): ${r.error}`);
  return r.npcs;
}

const hs = gen("LEAGUE_HIGHSCHOOL", HS_TEAMS, 111);
const univ = gen("LEAGUE_UNIVERSITY", UNIV_TEAMS, 111);
const ind = gen("LEAGUE_INDEPENDENT", IND_TEAMS, 111);

const hsSeniors = hs.filter((n) => n.grade === 3);
// 학년당 인원은 로스터 규모에서 나온다 — 하드코딩하면 밸런스 조정마다 깨진다
const HS_SIZE = rulesFile.rosterRules.LEAGUE_HIGHSCHOOL.rosterSize;
const perGrade = Math.round(HS_SIZE / 3);
check(`고교 3학년 = ${HS_TEAMS.length}팀 × 약 ${perGrade}명`,
  Math.abs(hsSeniors.length - HS_TEAMS.length * perGrade) <= HS_TEAMS.length,
  `got ${hsSeniors.length} (로스터 ${HS_SIZE})`);

// runDraftBoardBackground.ts / DraftBoardModal.svelte와 동일한 cutoff 로직
const hsCutoff = Math.ceil(hsSeniors.length * 0.8);
const univCutoff = Math.min(30, univ.length);
const indCutoff = Math.min(15, ind.length);
const totalPool = hsCutoff + univCutoff + indCutoff;

check("대학 로스터 존재(top30 확보 가능)", univ.length >= 30, `univ=${univ.length}`);
check("독립 로스터 존재(top15 확보 가능)", ind.length >= 15, `ind=${ind.length}`);
check(
  `드래프트 풀(HS80%+대학30+독립15=${totalPool}) >= 슬롯(${TOTAL_PICK_SLOTS})`,
  totalPool >= TOTAL_PICK_SLOTS,
  `hsCutoff=${hsCutoff} univCutoff=${univCutoff} indCutoff=${indCutoff}`,
);

// ⚠ 이 자리엔 원래 "고교 단독 풀은 슬롯보다 부족함(활성화 필요성 문서화)"가 있었다.
// 로스터를 25 → 30으로 올리면서 고교 3학년만으로도 슬롯이 채워져 그 단정이 깨졌다.
// **버그가 아니라 전제가 바뀐 것**이라 단정을 바꾼다 — 대학·독립을 활성화하는
// 이유는 이제 "슬롯이 모자라서"가 아니라 "드래프트 풀이 고교생만이면 현실성이
// 없어서"다 (Phase 7-1이 대학 1~4학년·독립 매년 신청으로 확장한다).
console.log(`    고교 단독 ${hsCutoff}명 · 대학 ${univCutoff} · 독립 ${indCutoff} · 슬롯 ${TOTAL_PICK_SLOTS}`);
check("대학·독립이 풀에 실질적으로 기여한다", univCutoff + indCutoff >= TOTAL_PICK_SLOTS * 0.3,
  `대학+독립 ${univCutoff + indCutoff} < 슬롯의 30%`);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
