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

// v2: 고교 102팀 전부가 상시 존재한다 (Lazy 없음 — DESIGN.md §2.1).
// 목록은 refs에서 읽는다 — 하드코딩하면 refs 교체 때 조용히 어긋난다.
const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
const HS_TEAMS = refs.teams.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL").map((t) => t.id).sort();
const KBL_TEAMS = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1")).map((t) => t.id).sort();
check("v2 고교 102팀", HS_TEAMS.length === 102, `got ${HS_TEAMS.length}`);
check("v2 프로 1군 10팀", KBL_TEAMS.length === 10, `got ${KBL_TEAMS.length}`);
const refIds = new Set(refs.teams.map((t) => t.id));

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
check(`새 게임: ${HS_TEAMS.length}팀 × 25 생성·저장`, r1.ok === true && r1.npcCount === HS_TEAMS.length * 25, JSON.stringify(r1));
check("새 게임: 주인공 왕복", call("getProtagonist", { slotId: "NG1" }).name === "주인공");
check("새 게임: 미리보기 메타", call("getMeta", { slotId: "NG1" }).career_stage === "highschool");

const roster = call("getByTeam", { slotId: "NG1", teamId: HS_TEAMS[0] });
check("새 게임: 팀 로스터 25명 + 능력치 동거", roster.length === 25 && roster.every((n) => n.abilities.pitching || n.abilities.batting));
check("새 게임: 리그 조회 전원", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length === HS_TEAMS.length * 25);
check("새 게임: 타 리그 비활성 (KBL 0명)", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length === 0);

// ── worldSeed 재현성: 같은 시드 새 슬롯 = 동일 로스터 ─────────
runNewGame("NG2", 777);
const a = call("getByTeam", { slotId: "NG1", teamId: HS_TEAMS[1] });
const b = call("getByTeam", { slotId: "NG2", teamId: HS_TEAMS[1] });
check("worldSeed 재현성: 슬롯 간 동일 로스터", JSON.stringify(a) === JSON.stringify(b));

// ── Lazy 리그 활성화 (KBL 진입 시나리오) ─────────────────────
const kblParams = {
  leagueId: "LEAGUE_KBL", seasonYear: 2029, worldSeed: 777,
  teams: KBL_TEAMS.map((teamId) => ({ teamId, schoolId: "" })),
  rules: rulesFile.rosterRules.LEAGUE_KBL,
};
check("KBL 1군 10팀 refs 확보", kblParams.teams.length === 10);
const kblGen = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify(kblParams)));
call("insertNpcs", { slotId: "NG1", npcs: kblGen.npcs });
check(`Lazy 활성화: KBL ${KBL_TEAMS.length}×28 삽입`, call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length === KBL_TEAMS.length * 28);
check("Lazy 활성화: 고교 인원 불변", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length === HS_TEAMS.length * 25);
check("KBL: 계약 생성", kblGen.npcs.every((n) => n.salary > 0));

// 총 세계 규모 확인 (Lite 목표: 사전 생성 16,155 → 활성 리그만)
const total = call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length
  + call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length;
// v2: 고교 102×25 + 프로 1군 10×28 = 2,830명 (v1의 474명 → 172팀 세계)
check("세계 규모: 고교+프로 1군", total === HS_TEAMS.length * 25 + KBL_TEAMS.length * 28, `got ${total}`);

mgr.closeAll();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
