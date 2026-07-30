"use strict";
// 드래프트 스모크 — **진짜 slot.db에 쓰고 읽는다.**
//
// 화면(Svelte)은 못 띄우지만 화면이 읽는 데이터는 여기서 전부 확인할 수 있다.
// 지금까지의 회귀 테스트(test-draft.cjs)는 Rust 엔진 수준이라 DB 경로를 안 탄다 —
// 이 스크립트는 slotdb.cjs 커맨드를 실제로 호출해서 다음을 본다:
//
//   · 리그 기록 탭이 볼 transactions — 같은 지명이 두 줄로 남지 않는가
//   · 팀 화면이 볼 npc 행 — 신인이 2군 팀 소속으로 저장됐는가
//   · 선수 상세가 볼 계약 — 연봉·계약연수가 붙었는가
//   · 상무 로스터 — 복무자만 있는가
//
// 실행: npm run smoke:draft

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const slotdb = require(path.join(ROOT, "apps/desktop/ipc/slotdb.cjs"));
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
};
const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

const SANGMU = gr.militaryRules.teamId;
const KBL_FIRST = refs.teams
  .filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1")).map((t) => t.id);
const teamsOf = (lid, farm = false) => refs.teams
  .filter((t) => t.leagueId === lid && t.id !== SANGMU
    && (lid !== "LEAGUE_KBL" || t.id.endsWith(farm ? "_2" : "_1")))
  .map((t) => ({ teamId: t.id, schoolId: t.schoolId ?? "", power: t.power }));

// GenNpc → RepoNpc (npcAdapter.saveStateToRepoNpc가 하는 변환의 최소판)
const toRepo = (g) => ({
  npcId: g.npcId, name: g.name, nameEn: g.nameEn ?? "", isNamed: false,
  playerType: g.playerType, position: g.position, handedness: g.handedness ?? "R",
  jerseyNumber: g.jerseyNumber ?? 0, age: g.age, grade: g.grade,
  schoolId: g.schoolId ?? "", graduationYear: g.graduationYear ?? 0,
  nationality: g.nationality ?? "KOR", careerStatus: g.careerStatus,
  currentLeague: g.currentLeague, currentTeam: g.currentTeam,
  salary: g.salary ?? g.currentSalary ?? 0, contractYears: g.contractYears ?? 0,
  proServiceYears: g.proServiceYears ?? 0, militaryStatus: g.militaryStatus,
  military: g.military ?? (g.militaryUnit || g.militaryRank || g.originalTeamId ? {
    unit: g.militaryUnit, rank: g.militaryRank,
    enlistYear: g.militaryEnlistYear, dischargeYear: g.militaryDischargeYear,
    originalLeagueId: g.originalLeagueId, originalTeamId: g.originalTeamId,
  } : undefined),
  developmentRate: g.developmentRate,
  potentialHidden: g.potentialHidden ?? 75,
  abilities: g.abilities ?? { pitching: g.pitching, batting: g.batting },
  xp: {}, personality: g.personality,
});
// RepoNpc → NpcSaveState (npcAdapter.hydrateFromRepo와 같은 평탄화).
// ⚠ 병역 필드를 빠뜨리면 syncNpcs가 INSERT OR REPLACE라 **DB의 계급이 지워진다**
const toState = (g) => ({
  npcId: g.npcId, name: g.name, playerType: g.playerType, position: g.position, age: g.age,
  ...(g.grade != null ? { grade: g.grade } : {}),
  schoolId: g.schoolId ?? "", graduationYear: g.graduationYear ?? 0,
  careerStatus: g.careerStatus, currentLeague: g.currentLeague, currentTeam: g.currentTeam,
  militaryStatus: g.militaryStatus, currentSalary: g.salary ?? 0,
  contractYears: g.contractYears ?? 0,
  militaryUnit: g.military?.unit,
  militaryRank: g.military?.rank,
  militaryEnlistYear: g.military?.enlistYear,
  militaryDischargeYear: g.military?.dischargeYear,
  originalLeagueId: g.military?.originalLeagueId,
  originalTeamId: g.military?.originalTeamId,
  pitching: g.abilities?.pitching, batting: g.abilities?.batting,
  developmentRate: g.developmentRate, potentialHidden: g.potentialHidden ?? 75,
  proServiceYears: g.proServiceYears ?? 0,
  careerHistory: [], careerEvents: [], achievements: [], fame: 0,
});

// ── 세계 만들기 → slot.db ─────────────────────────────────────
console.log("새 게임 (국내 전 리그 + 상무)");
const gen = [];
for (const lid of ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
                   "LEAGUE_KBL", "LEAGUE_KBL_FARM"]) {
  const teams = teamsOf(lid === "LEAGUE_KBL_FARM" ? "LEAGUE_KBL" : lid, lid === "LEAGUE_KBL_FARM");
  gen.push(...call("generateLeagueRosterNative", {
    leagueId: lid, seasonYear: 2026, worldSeed: 4242, teams, rules: gr.rosterRules[lid],
    salaryRules: gr.salaryRules, powerRules: gr.powerRules,
    entryRules: gr.careerHistoryRules.entry,
  }).npcs);
}
gen.push(...call("generateMilitaryRosterNative", {
  worldSeed: 4242, seasonYear: 2026, rules: gr.militaryRules,
  originTeams: KBL_FIRST.map((t) => ({ teamId: t, leagueId: "LEAGUE_KBL" })),
}).npcs);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-draft-"));
const mgr = slotdb.createManager(tmp);
const created = slotdb.dispatch(mgr, "createSlot", {
  slotId: "S1", worldSeed: 4242, protagonist: {}, season: {}, npcs: gen.map(toRepo),
});
check(`slot.db 생성 ${created.npcCount}명`, created.npcCount === gen.length,
  `${created.npcCount} vs ${gen.length}`);

// ── W47 드래프트 ─────────────────────────────────────────────
console.log("\nW47 드래프트");
const YEAR = 2026;
let npcs = slotdb.dispatch(mgr, "getAllNpcs", { slotId: "S1" }).map(toState);

const sel = call("selectDraftCandidatesNative", {
  npcs, rules: gr.draftRules,
  universityGradeMax: gr.rosterRules.LEAGUE_UNIVERSITY.gradeMax,
  highschoolGradeMax: gr.rosterRules.LEAGUE_HIGHSCHOOL.gradeMax,
});
const byId = new Map(npcs.map((n) => [n.npcId, n]));
console.log(`    후보 ${sel.candidates.length}명 ` +
  `(고졸 ${sel.counts[0]} · 대졸 ${sel.counts[1]} · 대학재학 ${sel.counts[2]} · 독립 ${sel.counts[3]})`);

// 지명 순서 = 전 시즌 성적 역순. 첫 시즌은 기록이 없으니 팀 목록 순
const sim = call("runDraftNative", {
  candidates: sel.candidates.map((c) => byId.get(c.npcId)).filter(Boolean),
  namedMetas: [], year: YEAR, rounds: gr.draftRules.rounds, teamIds: KBL_FIRST,
});
console.log(`    지명 ${sim.picks.length}건`);

const TEAM_INDEX = (() => {
  const out = {};
  const kbl = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
  const budgets = kbl.map((t) => t.history?.budget ?? 0).filter((b) => b > 0);
  const avg = budgets.reduce((a, b) => a + b, 0) / (budgets.length || 1);
  for (const t of kbl) out[t.id] = (t.history?.budget ?? 0) > 0 ? t.history.budget / avg : 1.0;
  return out;
})();
const PLACEMENT = {
  universityMax: gr.rosterRules.LEAGUE_UNIVERSITY.rosterMax,
  independentMax: gr.rosterRules.LEAGUE_INDEPENDENT.rosterMax,
  independentAgeMax: gr.rosterRules.LEAGUE_INDEPENDENT.ageMax,
};
const DEST_UNIV = refs.teams.filter((t) => t.leagueId === "LEAGUE_UNIVERSITY" && t.id !== SANGMU).map((t) => t.id);
const DEST_IND = refs.teams.filter((t) => t.leagueId === "LEAGUE_INDEPENDENT" && t.id !== SANGMU).map((t) => t.id);

const before = new Map(npcs.map((n) => [n.npcId, n]));
npcs = call("applyDraftNative", {
  npcs, result: sim, universityTeamIds: DEST_UNIV, independentTeamIds: DEST_IND,
  contract: gr.draftRules.contract, rookieToFarm: gr.draftRules.rookieToFarm,
  teamIndex: TEAM_INDEX, placement: PLACEMENT,
});

// ── DB 반영 (game.ts processNpcDraft가 하는 그대로) ───────────
slotdb.dispatch(mgr, "syncNpcs", { slotId: "S1", npcs: npcs.map(toRepo) });
slotdb.dispatch(mgr, "addTransactions", {
  slotId: "S1",
  rows: sim.picks.map((pick) => {
    const b = before.get(pick.npcId);
    const from = b && b.currentLeague !== "LEAGUE_DRAFT_POOL" ? b : null;
    return {
      seasonYear: YEAR, category: "draft", playerId: pick.npcId,
      playerName: b?.name ?? pick.npcId,
      fromTeamId: from?.currentTeam ?? null, fromLeagueId: from?.currentLeague ?? null,
      toTeamId: pick.teamId, toLeagueId: "LEAGUE_KBL",
      detail: `${pick.round}라운드 ${pick.pick}순위`, groupId: null,
    };
  }),
});

// ── 화면이 볼 데이터 검증 ────────────────────────────────────
console.log("\n리그 기록 탭이 볼 것 (transactions)");
{
  const tx = slotdb.dispatch(mgr, "getTransactions", {
    slotId: "S1", seasonYear: YEAR, category: "draft", limit: 1000,
  });
  check(`지명 기록 ${tx.length}건 = 지명 ${sim.picks.length}건`, tx.length === sim.picks.length,
    `${tx.length} vs ${sim.picks.length}`);

  const seen = new Map();
  for (const r of tx) seen.set(r.npc_id, (seen.get(r.npc_id) ?? 0) + 1);
  const dup = [...seen.entries()].filter(([, n]) => n > 1);
  check("같은 선수의 지명이 두 줄로 안 남는다", dup.length === 0,
    dup.slice(0, 3).map(([id, n]) => `${id}×${n}`).join(","));

  const noName = tx.filter((r) => !r.npc_name);
  check("기록에 이름이 다 있다", noName.length === 0, `${noName.length}건 비어 있음`);

  const fromFilled = tx.filter((r) => r.from_team_id);
  console.log(`    떠나온 팀이 적힌 기록 ${fromFilled.length}건 (소속 유지 신청자)`);
  check("떠나온 팀이 refs에 있는 팀이다",
    fromFilled.every((r) => refs.teams.some((t) => t.id === r.from_team_id)));

  const sample = tx.slice(-2).map((r) => `${r.detail} ${r.npc_name} → ${r.to_team_id}`);
  console.log(`    표본: ${sample.join(" / ")}`);
}

console.log("\n팀 화면이 볼 것 (npc 행)");
{
  const drafted = sim.picks.map((p) => p.npcId);
  const rows = drafted.map((id) => slotdb.dispatch(mgr, "getNpc", { slotId: "S1", npcId: id }));
  check("지명자가 전부 DB에 있다", rows.every(Boolean));

  const farm = rows.filter((r) => r.currentLeague === "LEAGUE_KBL_FARM");
  check(`신인이 2군에 저장됐다 (${farm.length}/${rows.length})`, farm.length === rows.length);

  const badTeam = rows.filter((r) => !r.currentTeam.endsWith("_2"));
  check("2군 팀 ID로 저장됐다", badTeam.length === 0,
    badTeam.slice(0, 3).map((r) => r.currentTeam).join(","));

  const refIds = new Set(refs.teams.map((t) => t.id));
  check("전부 refs에 있는 팀이다", rows.every((r) => refIds.has(r.currentTeam)));

  const noContract = rows.filter((r) => !r.salary || !r.contractYears);
  check("계약이 붙었다 (연봉·계약연수)", noContract.length === 0, `${noContract.length}명 누락`);

  const stillStudent = rows.filter((r) => r.grade != null);
  check("지명자의 학적이 정리됐다", stillStudent.length === 0, `${stillStudent.length}명 학년 남음`);

  const s = rows[0];
  console.log(`    표본: ${s.name} ${s.age}세 ${s.position} → ${s.currentTeam} ` +
    `연봉 ${s.salary}만 · ${s.contractYears}년`);
}

console.log("\n상무 로스터");
{
  const rows = slotdb.dispatch(mgr, "getByTeam", { slotId: "S1", teamId: SANGMU });
  const civil = rows.filter((r) => r.careerStatus !== "military");
  check(`상무 ${rows.length}명이 전원 복무자다`, civil.length === 0, `${civil.length}명 민간`);
  const noRank = rows.filter((r) => !r.military?.rank);
  check("계급이 저장돼 있다", noRank.length === 0, `${noRank.length}명 누락`);
  console.log(`    표본: ${rows[0]?.name} ${rows[0]?.military?.rank} · ` +
    `${rows[0]?.military?.dischargeYear} 전역 · 원소속 ${rows[0]?.military?.originalTeamId}`);
}

console.log("\n리그별 로스터 (팀 화면 목록)");
{
  const counts = slotdb.dispatch(mgr, "countByTeam", { slotId: "S1" });
  const byLeague = {};
  for (const n of slotdb.dispatch(mgr, "getAllNpcs", { slotId: "S1" })) {
    if (n.careerStatus !== "active") continue;
    (byLeague[n.currentLeague] ??= []).push(n.currentTeam);
  }
  for (const [lid, teams] of Object.entries(byLeague).sort()) {
    const per = new Map();
    for (const t of teams) per.set(t, (per.get(t) ?? 0) + 1);
    const v = [...per.values()];
    console.log(`    ${lid.padEnd(20)} ${String(per.size).padStart(3)}팀 · ` +
      `${Math.min(...v)}~${Math.max(...v)}명`);
  }
  check("빈 팀이 없다", counts.every((c) => c.n > 0));
}

mgr.closeAll();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
