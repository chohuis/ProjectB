"use strict";
// R3a-3 새 게임 v3 파이프라인 검증 — 실데이터(generation_rules.json) → Rust → slot.db
// TS 파이프라인(newGameV3.ts)과 동일 단계를 node에서 재현해 데이터·Rust·slotdb 체인 검증
// 실행: ELECTRON_RUN_AS_NODE=1 npx electron scripts/test-newgame-v3.cjs
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const engine = require("../packages/engine-native");
const slotdb = require("../apps/desktop/ipc/slotdb.cjs");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

// ── 실데이터 로드 (masterFetch 대응) ─────────────────────────
const rulesFile = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/players/generation_rules.json"), "utf8"));
check("rules v2 + rosterRules 존재", rulesFile.version === 2 && !!rulesFile.rosterRules?.LEAGUE_HIGHSCHOOL);

// HS_ACTIVE_TEAMS_V3와 동일 목록 (leagueScheduler.ts)
const HS_TEAMS = [
  "TEAM_HS_SEOUL_INNOVATION", "TEAM_HS_BUSAN_WAVE", "TEAM_HS_DAEGU_HEAT",
  "TEAM_HS_GWANGJU_VISION", "TEAM_HS_DAEJEON_RISE", "TEAM_HS_INCHEON_HARBOR",
  "TEAM_HS_ULSAN_CHARGE", "TEAM_HS_SUWON_EDGE",
  "TEAM_HS_YEOSU_SHORE", "TEAM_HS_CHUNCHEON_HIGHLAND",
];
// refs.json에 전부 존재하는지 (R1 부팅 assert와 동일 검증)
const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
const hsIndex = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/teams/highschool/index.json"), "utf8"));
const refIds = new Set([
  ...refs.teams.map((t) => t.id),
  ...(hsIndex.teams ?? hsIndex.items ?? []).map((t) => (typeof t === "string" ? t : t.id)),
]);
check("v3 고교 10팀 전부 refs/인덱스에 존재", HS_TEAMS.every((t) => refIds.has(t)),
  JSON.stringify(HS_TEAMS.filter((t) => !refIds.has(t))));

// ── 파이프라인 실행 (newGameV3.ts 동일 단계) ──────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "newgame-v3-"));
const mgr = slotdb.createManager(tmp);
const call = (cmd, p) => slotdb.dispatch(mgr, cmd, p);

function runNewGame(slotId, worldSeed) {
  const params = {
    leagueId: "LEAGUE_HIGHSCHOOL", seasonYear: 2026, worldSeed,
    teams: HS_TEAMS.map((teamId) => ({ teamId, schoolId: "" })),
    rules: rulesFile.rosterRules.LEAGUE_HIGHSCHOOL,
  };
  const gen = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify(params)));
  if (!Array.isArray(gen.npcs)) throw new Error("생성 실패: " + gen.error);
  const r = call("createSlot", {
    slotId, worldSeed,
    protagonist: { id: "PLY_HERO", name: "주인공", careerStage: "highschool", teamId: HS_TEAMS[0] },
    season: { seasonYear: 2026, currentWeek: 0 },
    npcs: gen.npcs,
  });
  call("setMeta", { slotId, entries: { career_stage: "highschool", season_year: 2026, current_week: 0 } });
  return r;
}

const r1 = runNewGame("NG1", 777);
check("새 게임: 10팀 × 25 = 250명 생성·저장", r1.ok === true && r1.npcCount === 250, JSON.stringify(r1));
check("새 게임: 주인공 왕복", call("getProtagonist", { slotId: "NG1" }).name === "주인공");
check("새 게임: 미리보기 메타", call("getMeta", { slotId: "NG1" }).career_stage === "highschool");

const roster = call("getByTeam", { slotId: "NG1", teamId: "TEAM_HS_SEOUL_INNOVATION" });
check("새 게임: 팀 로스터 25명 + 능력치 동거", roster.length === 25 && roster.every((n) => n.abilities.pitching || n.abilities.batting));
check("새 게임: 리그 조회 250명", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length === 250);
check("새 게임: 타 리그 비활성 (KBL 0명)", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length === 0);

// ── worldSeed 재현성: 같은 시드 새 슬롯 = 동일 로스터 ─────────
runNewGame("NG2", 777);
const a = call("getByTeam", { slotId: "NG1", teamId: "TEAM_HS_BUSAN_WAVE" });
const b = call("getByTeam", { slotId: "NG2", teamId: "TEAM_HS_BUSAN_WAVE" });
check("worldSeed 재현성: 슬롯 간 동일 로스터", JSON.stringify(a) === JSON.stringify(b));

// ── Lazy 리그 활성화 (KBL 진입 시나리오) ─────────────────────
const kblParams = {
  leagueId: "LEAGUE_KBL", seasonYear: 2029, worldSeed: 777,
  teams: refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1")).slice(0, 8)
    .map((t) => ({ teamId: t.id, schoolId: "" })),
  rules: rulesFile.rosterRules.LEAGUE_KBL,
};
check("KBL 1군 8팀 refs 확보", kblParams.teams.length === 8);
const kblGen = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify(kblParams)));
call("insertNpcs", { slotId: "NG1", npcs: kblGen.npcs });
check("Lazy 활성화: KBL 8×28=224명 삽입", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length === 224);
check("Lazy 활성화: 고교 250명 불변", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length === 250);
check("KBL: 계약 생성", kblGen.npcs.every((n) => n.salary > 0));

// 총 세계 규모 확인 (Lite 목표: 사전 생성 16,155 → 활성 리그만)
const total = call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length
  + call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length;
check("세계 규모: 고교+KBL = 474명 (16,155 대체)", total === 474, `got ${total}`);

mgr.closeAll();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
