"use strict";
/**
 * 최소 시뮬 하네스 (정리 Phase 4-6)
 *
 * 실행: npm run harness -- [--seasons N] [--trials M] [--seed S]
 *
 * ── 무엇을 검증하는가 ────────────────────────────────────────────
 * 새 게임을 만들고 N시즌을 무인 진행하면서 **불변식**이 깨지는지 본다.
 * 단위 테스트가 "한 동작이 맞는가"를 보는 반면, 하네스는
 * "여러 시즌을 이어 돌렸을 때 무너지는 게 없는가"를 본다 —
 * 실제로 이 종류의 버그는 다시즌을 돌려보기 전엔 드러나지 않는다.
 *
 * ── 커버 범위 ────────────────────────────────────────────────────
 *   새 게임 생성(Rust roster_gen) → 시즌 경계 N회 반복 → slot.db 왕복
 *   ①학년 진급 ②나이 +1 ③오프시즌(은퇴·FA·병역) ④영속화 ⑤신입생 충원
 *
 * ── 경계 (정직하게) ──────────────────────────────────────────────
 * 이건 **엔진·데이터 계층** 하네스다. 아래는 **커버하지 않는다**:
 *
 *  1. 주간 진행(advanceWeek.ts) — Svelte store에 깊이 묶여 헤드리스로 못 돈다.
 *     따라서 경기·성장·부상·훈련·이벤트는 여기서 안 돌아간다.
 *     전체 경로 하네스는 Phase 9에서 스토어를 모킹해 만든다.
 *  2. 드래프트 — 졸업자가 LEAGUE_DRAFT_POOL에 계속 쌓인다(20시즌에 ~1,500명).
 *     실제 게임에선 드래프트가 프로/대학/독립으로 빼내지만 그건 TS 경로다.
 *     DRAFT_POOL 인원이 늘어나는 건 하네스의 한계지 버그가 아니다.
 *  3. 폴백 시뮬 감지 — `weekPhases/games.ts`가 masterStore.entities가 비면
 *     저품질 폴백으로 조용히 넘어가는 경로(AUDIT B12 후보). 렌더러 상태라
 *     여기서 못 본다 — Phase 9 불변식으로 이월.
 *
 * ── 알려진 정상 동작 (오해 방지) ─────────────────────────────────
 *  · 고교 인원 250 → 240에서 안정: 초기 로스터는 25명/팀인데 신입생 파이프라인의
 *    정상상태는 perYear(8) × 3학년 = 24명/팀이다. 한 번 내려앉고 유지된다.
 */

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const engine = require("../packages/engine-native");
const slotdb = require("../apps/desktop/ipc/slotdb.cjs");

// ── 인자 ──────────────────────────────────────────────────────────
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || dflt) : dflt;
};
const SEASONS = arg("seasons", 5);
const TRIALS = arg("trials", 3);
const BASE_SEED = arg("seed", 20260729);

// ── 데이터 로드 ───────────────────────────────────────────────────
const R = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", p), "utf8"));
const rules = R("resource/data/master/players/generation_rules.json");
const refs = R("resource/data/master/entities/refs.json");
const refTeamIds = new Set(refs.teams.map((t) => t.id));

const HS_TEAMS = [
  "TEAM_HS_SEOUL_INNOVATION", "TEAM_HS_BUSAN_WAVE", "TEAM_HS_DAEGU_HEAT",
  "TEAM_HS_GWANGJU_VISION", "TEAM_HS_DAEJEON_RISE", "TEAM_HS_INCHEON_HARBOR",
  "TEAM_HS_ULSAN_CHARGE", "TEAM_HS_SUWON_EDGE",
  "TEAM_HS_YEOSU_SHORE", "TEAM_HS_CHUNCHEON_HIGHLAND",
];

// ── 위반 수집 ─────────────────────────────────────────────────────
const violations = [];
function inv(id, cond, detail) {
  if (!cond) violations.push({ id, detail });
}

// ── 한 시행 ───────────────────────────────────────────────────────
function runTrial(mgr, slotId, worldSeed) {
  const call = (cmd, p) => slotdb.dispatch(mgr, cmd, { slotId, ...p });

  const gen = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify({
    leagueId: "LEAGUE_HIGHSCHOOL", seasonYear: 2026, worldSeed,
    teams: HS_TEAMS.map((teamId) => ({ teamId, schoolId: "" })),
    rules: rules.rosterRules.LEAGUE_HIGHSCHOOL,
  })));
  if (!Array.isArray(gen.npcs)) throw new Error(`로스터 생성 실패: ${gen.error}`);

  call("createSlot", {
    worldSeed,
    protagonist: { id: "PLY_HERO", name: "주인공", careerStage: "highschool", teamId: HS_TEAMS[0], age: 17 },
    season: { seasonYear: 2026, currentWeek: 0 },
    npcs: gen.npcs,
  });

  const initialCount = gen.npcs.length;
  let retiredEver = new Set();
  const stats = { seasons: 0, retired: 0, freshmen: 0, graduated: 0 };

  for (let s = 1; s <= SEASONS; s++) {
    const seasonYear = 2026 + s - 1;
    const before = call("getAllNpcs", {}).map(fromRepoNpc);
    const beforeAge = new Map(before.map((n) => [n.npcId, n.age]));
    const beforeRetired = new Set(before.filter((n) => n.careerStatus === "retired").map((n) => n.npcId));

    // ① 학년 진급 (졸업자 분리)
    const gr = JSON.parse(engine.advanceAllGradesNative(JSON.stringify({ npcs: before, seasonYear })));
    const all = [...gr.updated, ...gr.hsGraduated, ...gr.univGraduated];
    stats.graduated += gr.hsGraduated.length + gr.univGraduated.length;

    // ② 나이 +1
    const aged = JSON.parse(engine.advanceAllAgesNative(JSON.stringify({ npcs: all })));

    // ── INV1: 나이 — 은퇴자를 뺀 전원이 정확히 +1 ──
    for (const n of aged) {
      const was = beforeAge.get(n.npcId);
      if (was === undefined) continue;
      const wasRetired = beforeRetired.has(n.npcId);
      const want = wasRetired ? was : was + 1;
      inv("INV1_나이증가", n.age === want,
        `S${s} ${n.npcId}: ${was} → ${n.age} (기대 ${want}${wasRetired ? ", 은퇴자" : ""})`);
    }

    // ③ 오프시즌 (은퇴·FA·병역 등)
    const off = JSON.parse(engine.runOffseasonNative(JSON.stringify({
      npcs: aged, pendingDraft: [], seasonYear, namedNpcIds: [],
    })));
    const after = Array.isArray(off.npcs) ? off.npcs : aged;

    // ── INV5: 은퇴 단조 — 한번 은퇴하면 다시 active가 되지 않는다 ──
    for (const n of after) {
      if (retiredEver.has(n.npcId)) {
        inv("INV5_은퇴단조", n.careerStatus === "retired",
          `S${s} ${n.npcId}: 은퇴자가 ${n.careerStatus}로 되살아남`);
      }
    }
    for (const n of after) if (n.careerStatus === "retired") retiredEver.add(n.npcId);

    // ④ 영속화 — 저장이 실제로 되는가 (v1의 "미저장 종료 유실" 클래스)
    call("syncNpcs", { npcs: after.map(toRepoNpc) });
    const reloaded = call("getAllNpcs", {});

    // ── INV4: 세이브 왕복 — 나이·팀·상태가 보존되는가 ──
    const byId = new Map(reloaded.map((n) => [n.npcId, n]));
    for (const n of after) {
      const r = byId.get(n.npcId);
      if (!r) { inv("INV4_왕복", false, `S${s} ${n.npcId}: 저장 후 사라짐`); continue; }
      inv("INV4_왕복", r.age === n.age, `S${s} ${n.npcId}: 나이 ${n.age} → ${r.age}`);
      inv("INV4_왕복", r.currentTeam === n.currentTeam, `S${s} ${n.npcId}: 팀 ${n.currentTeam} → ${r.currentTeam}`);
    }

    // ── INV3: ID 정합 — 모든 소속팀이 refs에 존재하는가 ──
    for (const n of reloaded) {
      if (!n.currentTeam) continue;
      inv("INV3_ID정합", refTeamIds.has(n.currentTeam),
        `S${s} ${n.npcId}: 미지의 팀 ${n.currentTeam}`);
    }

    // ── INV6: 학년 — 고교 재학생은 1~3학년 ──
    for (const n of reloaded) {
      if (n.currentLeague === "LEAGUE_HIGHSCHOOL" && n.careerStatus === "active" && n.grade != null) {
        inv("INV6_학년범위", n.grade >= 1 && n.grade <= 3, `S${s} ${n.npcId}: grade=${n.grade}`);
      }
    }

    // ── INV7: 스키마 버전 ──
    inv("INV7_스키마", slotdb.currentVersion(mgr.get(slotId)) === slotdb.SCHEMA_VERSION,
      `S${s}: user_version 불일치`);

    // ⑤ 신입생 충원 — 졸업으로 빈 1학년 자리를 채운다 (slotLifecycleV3.generateFreshmenV3 대응)
    const hsRules = rules.rosterRules.LEAGUE_HIGHSCHOOL;
    const perYear = Math.max(1, Math.round(hsRules.rosterSize / (hsRules.gradeMax ?? 3)));
    const fresh = [];
    for (const teamId of HS_TEAMS) {
      const hasG1 = reloaded.some((n) =>
        n.currentTeam === teamId && n.grade === 1 && n.careerStatus === "active");
      if (hasG1) continue;
      const raw = JSON.parse(engine.generateFreshmenNative(JSON.stringify({
        schoolId: teamId.replace("TEAM_HS_", "SCHOOL_HS_"), teamId,
        annualRosterSize: perYear,
        pitchingOvrMin: hsRules.pitchingOvrMin, pitchingOvrMax: hsRules.pitchingOvrMax,
        battingOvrMin: hsRules.battingOvrMin, battingOvrMax: hsRules.battingOvrMax,
        devRateMin: hsRules.devRateMin, devRateMax: hsRules.devRateMax,
        namedNpcs: [], seasonYear, idOffset: s * 10000,
      })));
      if (Array.isArray(raw)) fresh.push(...raw);
    }
    if (fresh.length > 0) {
      call("insertNpcs", { npcs: fresh.map(toRepoNpc) });
      stats.freshmen += fresh.length;
    }

    // ── INV8: 고교 로스터 유지 — 졸업으로 리그가 비어버리지 않는가 ──
    // v1의 "드래프트 풀 부족(64 < 80)" 버그가 정확히 이 계열이었다.
    const hsActive = slotdb.dispatch(mgr, "getByLeague", {
      slotId, leagueId: "LEAGUE_HIGHSCHOOL", activeOnly: true,
    });
    inv("INV8_고교로스터", hsActive.length >= HS_TEAMS.length * 10,
      `S${s}: 고교 활성 ${hsActive.length}명 (10팀 × 최소10 = ${HS_TEAMS.length * 10} 미만)`);

    stats.retired = reloaded.filter((n) => n.careerStatus === "retired").length;
    stats.seasons = s;
  }

  const final = slotdb.dispatch(mgr, "getAllNpcs", { slotId });
  const active = final.filter((n) => n.careerStatus === "active");

  // ── INV2: 인원 — 행이 사라지지 않는가 (기록 보존) ──
  inv("INV2_인원붕괴", final.length >= initialCount,
    `초기 ${initialCount} → 최종 ${final.length} (행이 사라짐)`);

  const byLeague = {};
  for (const n of active) byLeague[n.currentLeague || "(없음)"] = (byLeague[n.currentLeague || "(없음)"] ?? 0) + 1;

  return { total: final.length, active: active.length, byLeague, ...stats };
}

/**
 * RepoNpc → NpcSaveState (npcAdapter.repoNpcToSaveState 대응)
 * Rust 엔진은 NpcSaveState를 받는다 — slot.db가 돌려주는 RepoNpc와 필드명이 다르다
 * (salary↔currentSalary, abilities.pitching↔pitching 등). TS는 npcAdapter가 이 변환을 맡는다.
 */
function fromRepoNpc(r) {
  const extra = r.extra ?? {};
  const ab = r.abilities ?? {};
  return {
    npcId: r.npcId, name: r.name, nameEn: r.nameEn,
    playerType: r.playerType, position: r.position, handedness: r.handedness,
    jerseyNumber: r.jerseyNumber, positionRatings: ab.positionRatings,
    age: r.age, grade: r.grade, schoolId: r.schoolId ?? "",
    graduationYear: r.graduationYear ?? 0, nationality: r.nationality ?? "KOR",
    careerStatus: r.careerStatus, currentLeague: r.currentLeague, currentTeam: r.currentTeam,
    militaryStatus: r.militaryStatus ?? "미필",
    militaryEnlistYear: r.military?.enlistYear, militaryDischargeYear: r.military?.dischargeYear,
    militaryUnit: r.military?.unit,
    originalLeagueId: r.military?.originalLeagueId, originalTeamId: r.military?.originalTeamId,
    developmentRate: r.developmentRate ?? 50, potentialHidden: r.potentialHidden ?? 75,
    proServiceYears: r.proServiceYears ?? 0,
    currentSalary: r.salary ?? 0, contractYears: r.contractYears ?? 0,
    injuryStatus: r.injury
      ? { severity: r.injury.severity ?? "moderate", recoveryWeeksLeft: r.injury.weeksLeft ?? 0 }
      : undefined,
    emotionRole: extra.emotionRole,
    fame: extra.fame ?? 0,
    achievements: extra.achievements ?? [],
    careerHistory: extra.careerHistory ?? [],
    careerEvents: extra.careerEvents,
    lastActiveStage: extra.lastActiveStage,
    personality: r.personality,
    emotion: r.emotion?.emotion, memories: r.emotion?.memories, emotionStatus: r.emotion?.status,
    pitching: ab.pitching, batting: ab.batting,
  };
}

/** NpcSaveState → RepoNpc (npcAdapter.saveStateToRepoNpc의 최소 대응분) */
function toRepoNpc(n) {
  return {
    npcId: n.npcId, name: n.name, nameEn: n.nameEn,
    isNamed: !!n.emotionRole, playerType: n.playerType, position: n.position,
    handedness: n.handedness ?? "R", jerseyNumber: n.jerseyNumber ?? 0,
    age: n.age, grade: n.grade, schoolId: n.schoolId ?? "",
    graduationYear: n.graduationYear ?? 0, nationality: n.nationality ?? "KOR",
    careerStatus: n.careerStatus, currentLeague: n.currentLeague, currentTeam: n.currentTeam,
    salary: n.currentSalary ?? 0, contractYears: n.contractYears ?? 0,
    proServiceYears: n.proServiceYears ?? 0, militaryStatus: n.militaryStatus ?? "미필",
    developmentRate: n.developmentRate ?? 50, potentialHidden: n.potentialHidden ?? 75,
    abilities: { pitching: n.pitching, batting: n.batting, positionRatings: n.positionRatings },
    xp: { pitchingXp: {}, battingXp: {} },
    personality: n.personality,
    military: (n.militaryUnit || n.militaryEnlistYear || n.originalTeamId) ? {
      unit: n.militaryUnit, enlistYear: n.militaryEnlistYear,
      dischargeYear: n.militaryDischargeYear,
      originalLeagueId: n.originalLeagueId, originalTeamId: n.originalTeamId,
    } : undefined,
    // 확장 필드를 되돌려 담지 않으면 다음 시즌에 careerHistory가 유실된다
    extra: {
      ...(n.emotionRole ? { emotionRole: n.emotionRole } : {}),
      ...(n.fame ? { fame: n.fame } : {}),
      ...(n.achievements?.length ? { achievements: n.achievements } : {}),
      ...(n.careerHistory?.length ? { careerHistory: n.careerHistory } : {}),
      ...(n.careerEvents?.length ? { careerEvents: n.careerEvents } : {}),
      ...(n.lastActiveStage ? { lastActiveStage: n.lastActiveStage } : {}),
    },
  };
}

// ── 실행 ──────────────────────────────────────────────────────────
const t0 = Date.now();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "harness-"));
const mgr = slotdb.createManager(tmp);

console.log(`하네스 — ${TRIALS}시행 × ${SEASONS}시즌 (base seed ${BASE_SEED})\n`);

const results = [];
for (let t = 0; t < TRIALS; t++) {
  const seed = BASE_SEED + t * 1000;
  const before = violations.length;
  let r;
  try {
    r = runTrial(mgr, `H${t}`, seed);
  } catch (e) {
    violations.push({ id: "CRASH", detail: `시행${t} (seed ${seed}): ${e.message}` });
    continue;
  }
  results.push(r);
  const bad = violations.length - before;
  const lg = Object.entries(r.byLeague).map(([k, v]) => `${k.replace("LEAGUE_", "")}:${v}`).join(" ");
  console.log(`  시행${t} seed=${seed}  전체 ${r.total} 활성 ${r.active} | 졸업 ${r.graduated} 신입 ${r.freshmen} 은퇴 ${r.retired}`);
  console.log(`         리그분포  ${lg}  ${bad === 0 ? "OK" : `위반 ${bad}`}`);
}

mgr.closeAll();
fs.rmSync(tmp, { recursive: true, force: true });

// ── 리포트 ────────────────────────────────────────────────────────
const byId = {};
for (const v of violations) (byId[v.id] ??= []).push(v.detail);

console.log(`\n${"─".repeat(60)}`);
if (violations.length === 0) {
  console.log(`불변식 위반 없음 — ${TRIALS}시행 × ${SEASONS}시즌 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
} else {
  console.log(`불변식 위반 ${violations.length}건:\n`);
  for (const [id, ds] of Object.entries(byId)) {
    console.log(`  ${id}  ${ds.length}건`);
    for (const d of ds.slice(0, 3)) console.log(`      ${d}`);
    if (ds.length > 3) console.log(`      ... 외 ${ds.length - 3}건`);
  }
}

const outPath = path.join(__dirname, "..", "docs", "reports", "harness_last.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
  ranAt: new Date().toISOString(),
  config: { seasons: SEASONS, trials: TRIALS, baseSeed: BASE_SEED },
  results, violations: byId,
}, null, 2), "utf8");
console.log(`\n리포트 → docs/reports/harness_last.json`);

process.exit(violations.length === 0 ? 0 : 1);
