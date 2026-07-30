"use strict";
// 11월 통합 드래프트 회귀 검증 (Phase 7-1)
// 실행: npm run test:draft
//
// 설계 정본은 `docs/design/draft.md`, 수치 정본은
// `resource/data/master/players/generation_rules.json`의 `draftRules`.
//
// **여기서 검사하는 건 전부 실제로 있었던 결함이다.** 실측(D-0)에서 하나씩
// 나왔고, 유닛테스트로는 안 걸리는 것들이라 실데이터·실규모로 돌려서 잡았다:
//
//  1. 지명자 400명이 refs에 없는 팀 소속이었다 (하드코딩 팀 목록 드리프트)
//  2. 미지명자가 군경팀(상무)에 배정됐다
//  3. 대졸 미지명자가 대학 1학년으로 재입학했다
//  4. 프로 소속이 800명까지 부풀었다 (상한 표가 세 곳, FA 재배치가 캡을 통과)
//  5. 신인 계약이 최저연봉 미달 / 규정 위반이었다
//  6. 한 해에 드래프트가 두 번 돌고 거래기록이 두 벌 쌓였다

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/^\s*\*.*$/gm, "");

const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

const REF_TEAM_IDS = new Set(refs.teams.map((t) => t.id));
const SANGMU = gr.militaryRules.teamId;
const KBL_FIRST = refs.teams
  .filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1")).map((t) => t.id);

// ── 1. 규칙이 규칙 파일에 있는가 ──────────────────────────────
console.log("규칙 정본");
{
  const d = gr.draftRules;
  check("draftRules가 있다", !!d);
  check("rounds가 규칙 파일에 있다", typeof d.rounds === "number" && d.rounds > 0, String(d?.rounds));
  check("나이 게이트가 있다", typeof d.ageMin === "number" && typeof d.ageMax === "number");
  check("얼리 신청 하한이 학년별로 있다",
    Array.isArray(d.earlyEntry?.universityByGrade) && d.earlyEntry.universityByGrade.length >= 3);
  check("신인 계약 표가 있다", Array.isArray(d.contract?.byPick) && d.contract.byPick.length > 0);
  check("특급 신인 1군 직행 라운드가 규칙 파일에 있다",
    typeof d.firstTeamRounds === "number" && d.firstTeamRounds < d.rounds,
    String(d.firstTeamRounds));

  // 상한이 규칙 파일에 있어야 한다 — 예전엔 Rust와 TS에 각각 하드코딩돼 있었고
  // 둘 다 이 파일과 달랐다 (KBL 상한 65 vs 생성 인원 30)
  for (const lid of ["LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"]) {
    const r = gr.rosterRules[lid];
    check(`${lid} 유지 상한이 규칙 파일에 있다`,
      typeof r?.rosterMax === "number" && r.rosterMax >= (r.rosterSize ?? 0),
      `rosterMax=${r?.rosterMax} rosterSize=${r?.rosterSize}`);
  }
}

// ── 2. 팀 ID 하드코딩이 되살아나지 않았는가 ───────────────────
console.log("\n팀 ID 정본 (하드코딩 금지 — CLAUDE.md)");
{
  for (const rel of [
    "apps/ui/src/shared/utils/draftSystem.ts",
    "apps/ui/src/shared/utils/draftSalaryTable.ts",
    "apps/ui/src/shared/usecases/runDraftBoardBackground.ts",
    "apps/ui/src/features/career/ui/DraftBoardModal.svelte",
  ]) {
    const literals = [...new Set(
      [...stripComments(read(rel)).matchAll(/"(TEAM_[A-Z0-9_]+)"/g)].map((m) => m[1])
    )];
    check(`${path.basename(rel)}에 팀 ID 리터럴이 없다`, literals.length === 0, literals.join(","));
  }

  // `tier === "1군"` — refs의 국내 팀에는 없는 필드다. 이걸로 거르면 항상 0팀이다
  for (const rel of [
    "apps/ui/src/shared/usecases/runDraftBoardBackground.ts",
    "apps/ui/src/features/career/ui/DraftBoardModal.svelte",
  ]) {
    const src = stripComments(read(rel));
    check(`${path.basename(rel)}가 tier로 프로 팀을 거르지 않는다`,
      !/tier\s*===\s*"1군"/.test(src));
  }

  const domesticTiered = refs.teams.filter((t) => t.tier && !/ABL|JBL/.test(t.leagueId));
  check("국내 팀에는 tier 필드가 없다 (위 검사의 전제)", domesticTiered.length === 0,
    `${domesticTiered.length}팀`);
}

// ── 3. 후보 자격 ──────────────────────────────────────────────
console.log("\n후보 자격");
function fakeNpc(id, league, grade, ovr, age, extra = {}) {
  return {
    npcId: id, name: id, playerType: "pitcher", position: "SP", age,
    schoolId: "SCHOOL_X", graduationYear: 2026, careerStatus: "active",
    currentLeague: league, currentTeam: "TEAM_X", militaryStatus: "미필",
    developmentRate: 60, potentialHidden: 75, careerHistory: [], achievements: [],
    ...(grade != null ? { grade } : {}),
    pitching: { ovr, stamina: 50, velocity: 50, command: 50, control: 50,
      movement: 50, mentality: 50, recovery: 50, clutch: 50, holdRunners: 50 },
    ...extra,
  };
}
const selectOf = (npcs) => call("selectDraftCandidatesNative", {
  npcs, rules: gr.draftRules,
  universityGradeMax: gr.rosterRules.LEAGUE_UNIVERSITY.gradeMax,
  highschoolGradeMax: gr.rosterRules.LEAGUE_HIGHSCHOOL.gradeMax,
});
{
  const hsMax = gr.rosterRules.LEAGUE_HIGHSCHOOL.gradeMax;
  const r = selectOf([
    fakeNpc("HS3", "LEAGUE_HIGHSCHOOL", hsMax, 70, 19),
    fakeNpc("HS2", "LEAGUE_HIGHSCHOOL", hsMax - 1, 95, 19),
  ]);
  check("고교는 졸업반만 후보다", r.candidates.length === 1 && r.candidates[0].npcId === "HS3",
    r.candidates.map((c) => c.npcId).join(","));

  const lows = gr.draftRules.earlyEntry.universityByGrade;
  const r2 = selectOf([
    fakeNpc("OK", "LEAGUE_UNIVERSITY", 1, lows[0], 20),
    fakeNpc("LOW", "LEAGUE_UNIVERSITY", 1, lows[0] - 1, 20),
  ]);
  check("대학 저학년은 능력치 하한을 넘어야 신청한다",
    r2.candidates.length === 1 && r2.candidates[0].npcId === "OK");

  const r3 = selectOf([
    fakeNpc("MIL", "LEAGUE_INDEPENDENT", null, 95, 22, { careerStatus: "military" }),
  ]);
  check("복무자는 후보가 아니다 (상무가 독립리그 소속이다)", r3.candidates.length === 0);

  const r4 = selectOf([fakeNpc("OLD", "LEAGUE_INDEPENDENT", null, 95, gr.draftRules.ageMax + 1)]);
  check("나이 상한을 넘으면 후보가 아니다", r4.candidates.length === 0);
}

// ── 4. 신인 계약 ──────────────────────────────────────────────
console.log("\n신인 계약");
{
  const c = gr.draftRules.contract;
  const rowFor = (pick) => c.byPick.find((r) => pick <= r.untilPick) ?? c.byPick[c.byPick.length - 1];
  const minSalary = gr.salaryRules.minSalary.LEAGUE_KBL;
  const picks = [1, 5, 30, 80, gr.draftRules.rounds * KBL_FIRST.length];

  check("모든 순번이 최저연봉 이상이다",
    picks.every((p) => rowFor(p).salary >= minSalary),
    picks.map((p) => `${p}:${rowFor(p).salary}`).join(" "));
  check("신인 연봉은 순번과 무관하게 균일하다",
    rowFor(1).salary === rowFor(picks[picks.length - 1]).salary,
    `${rowFor(1).salary} vs ${rowFor(picks[picks.length - 1]).salary}`);

  let prev = Infinity, monotone = true;
  for (let p = 1; p <= 130; p++) { const b = rowFor(p).bonus; if (b > prev) monotone = false; prev = b; }
  check("계약금은 순번을 따라 단조감소한다", monotone);
  check("상위 지명 계약금이 하위보다 크게 높다", rowFor(1).bonus > rowFor(110).bonus * 5,
    `${rowFor(1).bonus} vs ${rowFor(110).bonus}`);
}

// ── 5. 진로 배정 ──────────────────────────────────────────────
console.log("\n진로 배정");
const PLACEMENT = {
  universityMax: gr.rosterRules.LEAGUE_UNIVERSITY.rosterMax,
  independentMax: gr.rosterRules.LEAGUE_INDEPENDENT.rosterMax,
  independentAgeMax: gr.rosterRules.LEAGUE_INDEPENDENT.ageMax,
};
const DEST_UNIV = refs.teams
  .filter((t) => t.leagueId === "LEAGUE_UNIVERSITY" && t.id !== SANGMU).map((t) => t.id);
const DEST_IND = refs.teams
  .filter((t) => t.leagueId === "LEAGUE_INDEPENDENT" && t.id !== SANGMU).map((t) => t.id);
{
  check("진로 목적지에 상무가 없다", !DEST_IND.includes(SANGMU) && !DEST_UNIV.includes(SANGMU));

  const withHistory = (n, lid) => ({
    ...n, careerHistory: [{ year: 2026, leagueId: lid, teamId: "TEAM_X", statLine: "-", highlights: [] }],
  });
  const hs = withHistory(fakeNpc("HS", "LEAGUE_DRAFT_POOL", null, 60, 20), "LEAGUE_HIGHSCHOOL");
  const uv = withHistory(fakeNpc("UV", "LEAGUE_DRAFT_POOL", null, 60, 24), "LEAGUE_UNIVERSITY");

  const out = call("applyDraftNative", {
    npcs: [hs, uv],
    result: { year: 2026, picks: [], undraftedIds: ["HS", "UV"] },
    universityTeamIds: DEST_UNIV, independentTeamIds: DEST_IND, placement: PLACEMENT,
  });
  const byId = Object.fromEntries(out.map((n) => [n.npcId, n]));
  check("고졸 미지명자는 대학에 간다", byId.HS.currentLeague === "LEAGUE_UNIVERSITY",
    byId.HS.currentLeague);
  check("대졸 미지명자는 대학에 재입학하지 않는다",
    byId.UV.currentLeague !== "LEAGUE_UNIVERSITY", byId.UV.currentLeague);
}

// ── 5-1. Rust 왕복에서 필드가 살아남는가 ──────────────────────
//
// Rust `NpcSaveState`에 없는 필드는 **한 번 통과할 때마다 사라진다.**
// `syncNpcs`가 INSERT OR REPLACE라 다음 저장에서 DB 값까지 지워진다.
// 실제로 `militaryRank`가 그랬다 — R-5에서 "계급은 저장값이 정본"으로 고쳤는데
// 첫 시즌 종료(advanceAllAges)에서 무너지고 있었다.
console.log("\nRust 왕복 보존");
{
  const probe = {
    ...fakeNpc("M1", "LEAGUE_INDEPENDENT", null, 70, 22),
    careerStatus: "military", militaryStatus: "현역",
    militaryUnit: "sports", militaryRank: "상병",
    militaryEnlistYear: 2026, militaryDischargeYear: 2028,
    originalLeagueId: "LEAGUE_KBL", originalTeamId: KBL_FIRST[0],
    proServiceYears: 2, currentSalary: 300, contractYears: 2,
  };
  const keep = ["militaryStatus", "militaryUnit", "militaryRank", "militaryEnlistYear",
    "militaryDischargeYear", "originalLeagueId", "originalTeamId",
    "proServiceYears", "currentSalary", "contractYears", "position", "schoolId"];

  for (const [label, out] of [
    ["advanceAllAges", JSON.parse(native.advanceAllAgesNative(JSON.stringify({ npcs: [probe] })))[0]],
    ["advanceAllGrades", call("advanceAllGradesNative", { npcs: [probe], seasonYear: 2026 }).updated[0]],
    ["applyDraft", call("applyDraftNative", {
      npcs: [probe], result: { year: 2026, picks: [], undraftedIds: [] },
    })[0]],
  ]) {
    const lost = keep.filter((k) => probe[k] !== undefined && out[k] === undefined);
    check(`${label}가 필드를 안 버린다`, lost.length === 0, `사라짐: ${lost.join(",")}`);
  }
}

// ── 6. 5시즌 통합 — 불변식 ────────────────────────────────────
console.log("\n5시즌 통합");
{
  const teamsOf = (lid, farm = false) => refs.teams
    .filter((t) => t.leagueId === lid && t.id !== SANGMU
      && (lid !== "LEAGUE_KBL" || t.id.endsWith(farm ? "_2" : "_1")))
    .map((t) => ({ teamId: t.id, schoolId: t.schoolId ?? "", power: t.power }));

  const toState = (g) => ({
    npcId: g.npcId, name: g.name, playerType: g.playerType, position: g.position, age: g.age,
    ...(g.grade != null ? { grade: g.grade } : {}),
    schoolId: g.schoolId, graduationYear: g.graduationYear, careerStatus: g.careerStatus,
    currentLeague: g.currentLeague, currentTeam: g.currentTeam, militaryStatus: g.militaryStatus,
    currentSalary: g.salary, contractYears: g.contractYears,
    pitching: g.abilities.pitching, batting: g.abilities.batting,
    developmentRate: g.developmentRate, potentialHidden: g.potentialHidden,
    proServiceYears: g.proServiceYears,
    careerHistory: [], careerEvents: [], achievements: [], fame: 0,
  });

  let npcs = [];
  for (const lid of ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
                     "LEAGUE_KBL", "LEAGUE_KBL_FARM"]) {
    const teams = teamsOf(lid === "LEAGUE_KBL_FARM" ? "LEAGUE_KBL" : lid, lid === "LEAGUE_KBL_FARM");
    const gen = call("generateLeagueRosterNative", {
      leagueId: lid, seasonYear: 2026, worldSeed: 4242, teams, rules: gr.rosterRules[lid],
      salaryRules: gr.salaryRules, powerRules: gr.powerRules,
      entryRules: gr.careerHistoryRules.entry,
    });
    npcs.push(...gen.npcs.map(toState));
  }
  npcs.push(...call("generateMilitaryRosterNative", {
    worldSeed: 4242, seasonYear: 2026, rules: gr.militaryRules,
    originTeams: KBL_FIRST.map((t) => ({ teamId: t, leagueId: "LEAGUE_KBL" })),
  }).npcs.map(toState));

  const LIMITS = Object.fromEntries(Object.entries(gr.rosterRules)
    .filter(([, r]) => typeof r.rosterMax === "number")
    .map(([lid, r]) => [lid, { rosterMin: r.rosterMin, rosterMax: r.rosterMax }]));
  const hsRule = gr.rosterRules.LEAGUE_HIGHSCHOOL;
  const perYear = Math.max(1, Math.round(hsRule.rosterSize / hsRule.gradeMax));

  let totalPicked = 0;
  for (let year = 2026; year < 2031; year++) {
    const sel = selectOf(npcs);
    const byId = new Map(npcs.map((n) => [n.npcId, n]));
    const sim = call("runDraftNative", {
      candidates: sel.candidates.map((c) => byId.get(c.npcId)).filter(Boolean),
      namedMetas: [], year, rounds: gr.draftRules.rounds, teamIds: KBL_FIRST,
    });
    totalPicked += sim.picks.length;

    npcs = call("applyDraftNative", {
      npcs, result: sim, universityTeamIds: DEST_UNIV, independentTeamIds: DEST_IND,
      contract: gr.draftRules.contract, firstTeamRounds: gr.draftRules.firstTeamRounds,
      placement: PLACEMENT,
    });

    const g = call("advanceAllGradesNative", { npcs, seasonYear: year });
    const pending = [...g.hsGraduated, ...g.univGraduated];
    const pendingIds = new Set(pending.map((n) => n.npcId));
    const aged = call("advanceAllAgesNative", { npcs: [...g.updated, ...pending] });

    const off = call("runOffseasonNative", {
      npcs: aged.filter((n) => !pendingIds.has(n.npcId)),
      pendingDraft: aged.filter((n) => pendingIds.has(n.npcId)),
      seasonYear: year, namedNpcIds: [], salaryRules: gr.salaryRules,
      rosterLimits: LIMITS, universityTeamIds: DEST_UNIV, independentTeamIds: DEST_IND,
      placement: PLACEMENT,
    });
    npcs = off.npcs;

    // 다음 시즌 신입생
    const hasG1 = new Set(npcs.filter((n) => n.grade === 1 && n.careerStatus === "active")
      .map((n) => n.currentTeam));
    for (const t of teamsOf("LEAGUE_HIGHSCHOOL")) {
      if (hasG1.has(t.teamId)) continue;
      const raw = JSON.parse(native.generateFreshmenNative(JSON.stringify({
        schoolId: t.teamId.replace("TEAM_HS_", "SCHOOL_HS_"), teamId: t.teamId,
        annualRosterSize: perYear,
        pitchingOvrMin: hsRule.pitchingOvrMin, pitchingOvrMax: hsRule.pitchingOvrMax,
        battingOvrMin: hsRule.battingOvrMin, battingOvrMax: hsRule.battingOvrMax,
        devRateMin: hsRule.devRateMin, devRateMax: hsRule.devRateMax,
        namedNpcs: [], seasonYear: year + 1, idOffset: 0,
      })));
      if (Array.isArray(raw)) npcs.push(...raw);
    }
  }

  const expected = gr.draftRules.rounds * KBL_FIRST.length * 5;
  check(`5시즌 지명 ${totalPicked}건 (예상 ${expected})`, totalPicked === expected);

  const active = npcs.filter((n) => n.careerStatus === "active");
  const ghost = active.filter((n) => n.currentTeam && !REF_TEAM_IDS.has(n.currentTeam));
  check("refs에 없는 팀 소속이 없다", ghost.length === 0,
    [...new Set(ghost.map((n) => n.currentTeam))].join(","));

  const homeless = active.filter((n) => !n.currentTeam);
  check("소속 없는 현역이 없다", homeless.length === 0, `${homeless.length}명`);

  const stuck = npcs.filter((n) => n.currentLeague === "LEAGUE_DRAFT_POOL");
  check("드래프트 풀에 잔류자가 없다", stuck.length === 0, `${stuck.length}명`);

  const sangmuCivil = active.filter((n) => n.currentTeam === SANGMU && n.careerStatus !== "military");
  check("상무에 비복무자가 없다", sangmuCivil.length === 0, `${sangmuCivil.length}명`);

  // 리그별 팀 정원 — 상한이 실제로 걸리는가
  for (const lid of ["LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_UNIVERSITY"]) {
    const per = new Map();
    for (const n of active.filter((x) => x.currentLeague === lid)) {
      per.set(n.currentTeam, (per.get(n.currentTeam) ?? 0) + 1);
    }
    const sizes = [...per.values()];
    const max = gr.rosterRules[lid].rosterMax;
    const over = sizes.filter((s) => s > max);
    console.log(`    ${lid}: ${per.size}팀 · ${Math.min(...sizes)}~${Math.max(...sizes)}명 (상한 ${max})`);
    check(`${lid} 상한을 넘는 팀이 없다`, over.length === 0, over.join(","));
  }

  // 1군에 사람이 남아 있는가 — 신인이 전부 2군으로 가면 1군이 마른다
  {
    const per = new Map();
    for (const n of active.filter((x) => x.currentLeague === "LEAGUE_KBL")) {
      per.set(n.currentTeam, (per.get(n.currentTeam) ?? 0) + 1);
    }
    const min = Math.min(...per.values());
    check("1군이 최소 인원을 지킨다", min >= gr.rosterRules.LEAGUE_KBL.rosterMin,
      `최소 ${min} < ${gr.rosterRules.LEAGUE_KBL.rosterMin}`);
    check("1군 팀 수가 refs와 같다", per.size === KBL_FIRST.length, `${per.size}팀`);
  }
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
