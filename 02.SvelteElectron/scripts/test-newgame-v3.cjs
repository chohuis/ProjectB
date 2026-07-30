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
// 로스터 규모는 **규칙 파일에서 읽는다.** 하드코딩하면 밸런스 조정마다
// 테스트가 깨지고, "왜 깨졌지"에 시간을 쓰게 된다 (실제로 그렇게 깨졌다).
const HS_SIZE  = rulesFile.rosterRules.LEAGUE_HIGHSCHOOL.rosterSize;
const KBL_SIZE = rulesFile.rosterRules.LEAGUE_KBL.rosterSize;
check(`새 게임: ${HS_TEAMS.length}팀 × ${HS_SIZE} 생성·저장`, r1.ok === true && r1.npcCount === HS_TEAMS.length * HS_SIZE, JSON.stringify(r1));
check("새 게임: 주인공 왕복", call("getProtagonist", { slotId: "NG1" }).name === "주인공");
check("새 게임: 미리보기 메타", call("getMeta", { slotId: "NG1" }).career_stage === "highschool");

const roster = call("getByTeam", { slotId: "NG1", teamId: HS_TEAMS[0] });
check(`새 게임: 팀 로스터 ${HS_SIZE}명 + 능력치 동거`, roster.length === HS_SIZE && roster.every((n) => n.abilities.pitching || n.abilities.batting));
check("새 게임: 리그 조회 전원", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length === HS_TEAMS.length * HS_SIZE);
// ⚠ 이 스크립트는 `createNewGameV3`를 **부르지 않고 파이프라인을 재구현한다.**
// (window.projectB가 없어서 그렇다) 그래서 여기 KBL 0명은 "이 스크립트가 고교만
// 넣었다"는 뜻이지 실제 새 게임 동작이 아니다 — 실제 동작은 아래 §정합 검사가 본다.
check("이 스크립트가 만든 슬롯엔 고교만 (재구현 범위)", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length === 0);

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
check(`Lazy 활성화: KBL ${KBL_TEAMS.length}×${KBL_SIZE} 삽입`, call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length === KBL_TEAMS.length * KBL_SIZE);
check("Lazy 활성화: 고교 인원 불변", call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length === HS_TEAMS.length * HS_SIZE);
check("KBL: 계약 생성", kblGen.npcs.every((n) => n.salary > 0));

// 총 세계 규모 확인 (Lite 목표: 사전 생성 16,155 → 활성 리그만)
const total = call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_HIGHSCHOOL" }).length
  + call("getByLeague", { slotId: "NG1", leagueId: "LEAGUE_KBL" }).length;
const wantTotal = HS_TEAMS.length * HS_SIZE + KBL_TEAMS.length * KBL_SIZE;
check(`세계 규모: 고교 ${HS_TEAMS.length}×${HS_SIZE} + 프로 1군 ${KBL_TEAMS.length}×${KBL_SIZE} = ${wantTotal}`,
  total === wantTotal, `got ${total}`);

// ── 리그 3자 정합 — 이 검사가 없어서 "0-0 홈팀승" 버그가 살아남았다 ─────
//
// 세 목록이 어긋나면 조용히 망가진다:
//   ① 일정이 생기는 리그   (leagueScheduler)
//   ② 풀 시뮬 대상 리그    (radiusGate DOMESTIC_LEAGUES)
//   ③ 로스터가 생기는 리그 (newGameV3 DOMESTIC_ROSTER_LEAGUES + rosterRules)
//
// ①∩② 인데 ③에 없으면 → 선수 없는 팀끼리 경기 → Rust가 **항상 0-0, 홈팀 승**을
// 낸다. 시즌1에 대학 225 + 프로 720 + 2군 495경기가 그렇게 처리되고 있었다.
// 순위표는 "홈경기 수 = 승수"가 된다.
console.log("\n리그 3자 정합");
{
  const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

  // ② 풀 시뮬(반경 1) 대상
  const gate = read("../apps/ui/src/shared/utils/radiusGate.ts");
  const domesticBlock = gate.match(/const DOMESTIC_LEAGUES = new Set\(\[([\s\S]*?)\]\)/);
  const fullSim = [...(domesticBlock?.[1] ?? "").matchAll(/"(LEAGUE_[A-Z_]+)"/g)].map((m) => m[1]);

  // ③ 새 게임에서 로스터가 생기는 리그
  const ng = read("../apps/ui/src/shared/repo/newGameV3.ts");
  const rosterBlock = ng.match(/const DOMESTIC_ROSTER_LEAGUES = \[([\s\S]*?)\] as const/);
  const generated = new Set([
    "LEAGUE_HIGHSCHOOL",   // 시작 리그 — 별도 경로로 항상 생성
    ...[...(rosterBlock?.[1] ?? "").matchAll(/"(LEAGUE_[A-Z_]+)"/g)].map((m) => m[1]),
  ]);

  console.log(`    풀 시뮬 ${fullSim.length}개: ${fullSim.join(" ")}`);
  console.log(`    로스터 생성 ${generated.size}개: ${[...generated].join(" ")}`);

  check("radiusGate에서 국내 리그 목록을 읽었다", fullSim.length >= 4, `${fullSim.length}개`);
  check("newGameV3에서 로스터 리그 목록을 읽었다", generated.size >= 4, `${generated.size}개`);

  // 핵심: 풀 시뮬하는데 로스터를 안 만드는 리그가 있으면 0-0 버그다
  const noRoster = fullSim.filter((l) => !generated.has(l));
  check("풀 시뮬하는 리그는 전부 새 게임에서 로스터가 생긴다", noRoster.length === 0,
    `로스터 없이 시뮬됨 → 0-0 홈팀승: ${noRoster.join(", ")}`);

  // 생성 목록에 있는데 규칙이 없으면 런타임에 조용히 건너뛴다
  const noRules = [...generated].filter((l) => !rulesFile.rosterRules[l]);
  check("로스터 생성 대상은 전부 rosterRules를 가진다", noRules.length === 0,
    `규칙 없음: ${noRules.join(", ")}`);

  // 상무는 예외 — 복무자가 채우므로 로스터를 만들지 않는다 (Phase 7-3)
  check("상무는 로스터 생성 대상이 아니다", !generated.has("TEAM_SPORTS_UNIT"));
}

// ── 유령 팀 — refs에 없는 팀이 화면 목록에 섞이지 않는가 ────────
//
// v1 시절 `teams/*/index.json`의 팀을 refs에 덧붙이는 `mergeSupplementTeams`가
// 있었다. Phase 5가 172팀으로 ID 체계를 갈아엎으면서 그 31개 팀이 refs에서
// 사라졌는데 함수는 계속 목록에 얹었다 — **화면엔 뜨는데 로스터도 일정도
// 순위표도 없는 유령 팀**이 됐고, 새 게임 팀 선택에서 고를 수도 있었다.
console.log("\n유령 팀 (refs 단일 정본)");
{
  const masterSrc = fs.readFileSync(
    path.join(__dirname, "../apps/ui/src/shared/stores/master.ts"), "utf8");
  const code = masterSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  check("mergeSupplementTeams가 살아있지 않다", !/function\s+mergeSupplementTeams/.test(code));
  check("teams/*/index.json을 읽지 않는다",
    !/teams\/(university|independent|highschool)\/index\.json/.test(code));

  // 팀 목록이 refs에서만 온다 — 다른 출처가 섞이면 여기서 잡힌다
  const assign = code.match(/const mergedTeams = ([^;]+);/);
  check("팀 목록이 refs에서만 온다", /refsData\?\.teams/.test(assign?.[1] ?? ""),
    (assign?.[1] ?? "(못 찾음)").trim());

  // 구 index.json이 아직 파일로 남아 있다면 refs와 얼마나 어긋났는지 보고만 한다
  const refsIds = new Set(refs.teams.map((t) => t.id));
  let ghosts = 0;
  for (const [label, rel] of Object.entries({
    대학: "../resource/data/master/teams/university/index.json",
    독립: "../resource/data/master/teams/independent/index.json",
    고교: "../resource/data/master/teams/highschool/index.json",
  })) {
    const f = path.join(__dirname, rel);
    if (!fs.existsSync(f)) continue;
    const list = JSON.parse(fs.readFileSync(f, "utf8")).activeTeamIds ?? [];
    const g = list.filter((id) => !refsIds.has(id));
    ghosts += g.length;
    if (g.length) console.log(`    ${label} index.json: refs에 없는 팀 ${g.length}개 (읽지 않으므로 무해)`);
  }
  console.log(`    구 index.json의 유령 후보 ${ghosts}개 — 코드가 안 읽으면 화면에 안 뜬다`);
}

// ── 빈 로스터가 실제로 어떻게 나오는지 (회귀 근거 고정) ─────────
console.log("\n빈 로스터 시뮬 (버그 재현 근거)");
{
  const empty = JSON.parse(engine.simGameNative(JSON.stringify({
    homeRotation: [], awayRotation: [], homeBullpen: [], awayBullpen: [],
    homeCloser: null, awayCloser: null, homeLineup: [], awayLineup: [],
    homeRotIdx: 0, awayRotIdx: 0, conditions: {}, week: 1,
    homeTeamId: "TEAM_X", awayTeamId: "TEAM_Y",
  })));
  console.log(`    빈 로스터 결과: ${empty.result.homeScore}-${empty.result.awayScore} 승자 ${empty.result.winnerId}`);
  // 이 동작 자체는 고치지 않는다 — Rust가 빈 입력에 뭘 하든, 애초에 빈 입력이
  // 들어가지 않게 하는 게 위 정합 검사의 일이다. 여기선 "왜 조용했나"를 기록만 한다.
  check("빈 로스터는 0-0 무득점 (그래서 조용히 굴러갔다)",
    empty.result.homeScore === 0 && empty.result.awayScore === 0);
  check("빈 로스터는 홈팀이 이긴다 (순위표가 홈경기 수가 된다)",
    empty.result.winnerId === "TEAM_X");
}

mgr.closeAll();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
