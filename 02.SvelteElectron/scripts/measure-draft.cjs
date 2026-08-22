// D-0: 현행 드래프트 파이프라인 실측.
//
// 예측하지 않는다 — 실제 refs.json·generation_rules.json으로 세계를 만들고
// 시즌 종료 경로(advance_all_grades → advance_all_ages → run_draft → apply_draft)를
// 그대로 5시즌 돌려 숫자를 찍는다. (docs/design/roster.md §10)
//
// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/measure-draft.cjs

const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

const SEASONS = 5;
const START_YEAR = 2026;
const WORLD_SEED = 4242;

// draftSystem.ts의 KBL_TEAM_IDS — 현행 processNpcDraft가 쓰는 기본값
const GHOST_TEAMS = [
  "TEAM_KBL_TWINWOLVES_1", "TEAM_KBL_BEARGUARDIANS_1", "TEAM_KBL_SKYGULLS_1",
  "TEAM_KBL_SOARINGEAGLES_1", "TEAM_KBL_ROYALLIONS_1", "TEAM_KBL_EMBERTIGERS_1",
  "TEAM_KBL_STEELDINOS_1", "TEAM_KBL_GIANTWHALES_1",
];

const call = (fn, payload) => {
  const out = JSON.parse(native[fn](JSON.stringify(payload)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

// ── 세계 만들기 ────────────────────────────────────────────────
const SANGMU_TEAM_ID = "TEAM_IND_SANGMU_PHOENIX";  // utils/ids.ts와 같은 값

// 상무는 리그 로스터 생성 대상이 아니다 — military_roster.rs가 따로 만든다 (newGameV3와 동일)
const teamsOf = (leagueId, farm = false) =>
  refs.teams
    .filter((t) => t.leagueId === leagueId && t.id !== SANGMU_TEAM_ID
      && (leagueId !== "LEAGUE_KBL" || t.id.endsWith(farm ? "_2" : "_1")))
    .map((t) => ({ teamId: t.id, schoolId: t.schoolId ?? "", power: t.power }));

const REAL_KBL = teamsOf("LEAGUE_KBL").map((t) => t.teamId);

/** 지명 보직 분포 — 가점 효과를 보는 유일한 지표. 진로 분포는 가점과 무관하다 */
const draftShape = [];

function buildWorld() {
  const specs = [
    ["LEAGUE_HIGHSCHOOL", teamsOf("LEAGUE_HIGHSCHOOL")],
    ["LEAGUE_UNIVERSITY", teamsOf("LEAGUE_UNIVERSITY")],
    ["LEAGUE_INDEPENDENT", teamsOf("LEAGUE_INDEPENDENT")],
    ["LEAGUE_KBL", teamsOf("LEAGUE_KBL")],
    ["LEAGUE_KBL_FARM", teamsOf("LEAGUE_KBL", true)],
  ];
  const out = [];
  for (const [leagueId, teams] of specs) {
    const rules = gr.rosterRules[leagueId];
    if (!rules) throw new Error(`rosterRules 없음: ${leagueId}`);
    const gen = call("generateLeagueRosterNative", {
      leagueId, seasonYear: START_YEAR, worldSeed: WORLD_SEED >>> 0, teams, rules,
      salaryRules: gr.salaryRules, powerRules: gr.powerRules,
      entryRules: gr.careerHistoryRules && gr.careerHistoryRules.entry,
    });
    out.push(...gen.npcs.map(toSaveState));
  }
  // 상무 로스터 (newGameV3의 seedMilitaryRoster와 같은 경로)
  const mil = call("generateMilitaryRosterNative", {
    worldSeed: WORLD_SEED >>> 0, seasonYear: START_YEAR, rules: gr.militaryRules,
    originTeams: teamsOf("LEAGUE_KBL").map((t) => ({ teamId: t.teamId, leagueId: "LEAGUE_KBL" })),
  });
  out.push(...mil.npcs.map(toSaveState));
  return out;
}

/** GenNpc(roster_gen) → NpcSaveState(npc_sim) — npcAdapter.ts가 하는 변환의 최소판 */
function toSaveState(g) {
  return {
    npcId: g.npcId, name: g.name, nameEn: g.nameEn, nationality: g.nationality,
    playerType: g.playerType, position: g.position, age: g.age,
    ...(g.grade != null ? { grade: g.grade } : {}),
    schoolId: g.schoolId, graduationYear: g.graduationYear,
    careerStatus: g.careerStatus, currentLeague: g.currentLeague, currentTeam: g.currentTeam,
    militaryStatus: g.militaryStatus, currentSalary: g.salary, contractYears: g.contractYears,
    pitching: g.abilities.pitching, batting: g.abilities.batting,
    developmentRate: g.developmentRate, potentialHidden: g.potentialHidden,
    proServiceYears: g.proServiceYears,
    careerHistory: [], careerEvents: [], achievements: [], fame: 0,
  };
}

/** advanceWeek W1의 generateFreshmenV3 — grade 1이 빈 고교 팀을 Rust로 채운다 */
function generateFreshmen(npcs, year) {
  const rules = gr.rosterRules["LEAGUE_HIGHSCHOOL"];
  const perYear = Math.max(1, Math.round(rules.rosterSize / (rules.gradeMax ?? 3)));
  const hasG1 = new Set(
    npcs.filter((n) => n.grade === 1 && n.careerStatus === "active").map((n) => n.currentTeam),
  );
  const out = [];
  for (const t of teamsOf("LEAGUE_HIGHSCHOOL")) {
    if (hasG1.has(t.teamId)) continue;
    const raw = JSON.parse(native.generateFreshmenNative(JSON.stringify({
      schoolId: t.teamId.replace("TEAM_HS_", "SCHOOL_HS_"),
      teamId: t.teamId, annualRosterSize: perYear,
      pitchingOvrMin: rules.pitchingOvrMin, pitchingOvrMax: rules.pitchingOvrMax,
      battingOvrMin: rules.battingOvrMin, battingOvrMax: rules.battingOvrMax,
      devRateMin: rules.devRateMin, devRateMax: rules.devRateMax,
      namedNpcs: [], seasonYear: year, idOffset: 0,
    })));
    if (Array.isArray(raw)) out.push(...raw);
  }
  return out;
}

// ── 한 시즌 ────────────────────────────────────────────────────
/** 팀 예산 지수 — newGameV3.buildSalaryIndex와 같은 규칙 (팀 예산 / 리그 평균) */
const TEAM_INDEX = (() => {
  const out = {};
  const kbl = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
  const budgets = kbl.map((t) => t.history?.budget ?? 0).filter((b) => b > 0);
  const avg = budgets.reduce((a, b) => a + b, 0) / (budgets.length || 1);
  for (const t of kbl) out[t.id] = (t.history?.budget ?? 0) > 0 ? t.history.budget / avg : 1.0;
  return out;
})();

/** 진로 배정 상한 — draftSystem.placementRulesFrom와 같은 규칙 */
// ⚠ **빠뜨리면 그 갈래가 통째로 안 보인다.** 예전엔 셋만 적어
// `→2군`이 다섯 시즌 내내 0이었고, 그걸 게임 결함으로 읽을 뻔했다.
// 정본은 `draftSystem.placementRulesFrom`이다 — 거기 필드가 늘면 여기도 늘린다.
const PLACEMENT = {
  universityMax: gr.rosterRules.LEAGUE_UNIVERSITY.rosterMax,
  independentMax: gr.rosterRules.LEAGUE_INDEPENDENT.rosterMax,
  independentAgeMax: gr.rosterRules.LEAGUE_INDEPENDENT.ageMax,
  // 대학 연간 유입 상한 — 이게 없으면 대학이 무제한으로 받아 진로 분포가 기울어진다
  universityAnnualMax: Math.max(1, Math.round((gr.rosterRules.LEAGUE_UNIVERSITY.rosterSize ?? 32) / (gr.rosterRules.LEAGUE_UNIVERSITY.gradeMax ?? 4))),
  // 프로 2군 — `farmTeamIds`와 **둘 다** 있어야 돌아간다
  farmMax: gr.rosterRules.LEAGUE_KBL_FARM ? gr.rosterRules.LEAGUE_KBL_FARM.rosterMax : 34,
  developmentSalary: (gr.developmentPlayerRules || {}).salary,
  developmentMax: (gr.developmentPlayerRules || {}).intakeMax ?? 0,
};

/** rosterRules → Rust rosterLimits (npcEngine.rosterLimitsFrom와 같은 규칙) */
const ROSTER_LIMITS = Object.fromEntries(
  Object.entries(gr.rosterRules)
    .filter(([, r]) => typeof r.rosterMax === "number")
    .map(([lid, r]) => [lid, { rosterMin: r.rosterMin, rosterMax: r.rosterMax }]),
);

// 상무는 진로 배정 대상이 아니다 — draftSystem.draftDestinationTeams와 같은 규칙
const DEST_UNIV = refs.teams
  .filter((t) => t.leagueId === "LEAGUE_UNIVERSITY" && t.id !== SANGMU_TEAM_ID).map((t) => t.id);
const DEST_FARM = teamsOf("LEAGUE_KBL", true).map((t) => t.teamId);
const DEST_IND = refs.teams
  .filter((t) => t.leagueId === "LEAGUE_INDEPENDENT" && t.id !== SANGMU_TEAM_ID).map((t) => t.id);

/**
 * 한 시즌. **실제 게임 순서를 그대로 따른다** —
 * W47 드래프트(졸업 전) → 시즌 종료 졸업 → 오프시즌(캡·FA·진로배정) → W1 신입생.
 */
function runSeason(npcs, year, kblTeams) {
  // ── W47: 드래프트 ────────────────────────────────────────────
  const sel = call("selectDraftCandidatesNative", {
    npcs, rules: gr.draftRules,
    universityGradeMax: gr.rosterRules.LEAGUE_UNIVERSITY.gradeMax,
    highschoolGradeMax: gr.rosterRules.LEAGUE_HIGHSCHOOL.gradeMax,
  });
  const byId = new Map(npcs.map((n) => [n.npcId, n]));
  const candidates = sel.candidates.map((c) => byId.get(c.npcId)).filter(Boolean);
  const routeOf = new Map(sel.candidates.map((c) => [c.npcId, c.route]));

  // 팀별 부족 보직 — **하한은 규칙 파일에서 유도한다**(draftSystem.teamNeedsOf와 같은 식).
  // 1군·2군을 합쳐 센다: 지명자는 대부분 2군에서 시작하므로 조직 전체로 봐야 한다.
  //
  // ⚠ **여기 안 넘기면 계측이 옛 동작을 잰다.** game.ts는 넘기는데 계측기는
  // 안 넘기면 "고쳤는데 계측은 그대로"가 되고, 그걸 효과 없음으로 읽게 된다.
  const needBonus = gr.draftRules.needBonus ?? 0;
  const teamNeeds = {};
  {
    // 절대 하한이 아니라 **목표 비율**로 본다 — 하한으로 재니 부족팀이 0이었다
    const one = gr.rosterRules.LEAGUE_KBL ?? {};
    const ratio = one.pitcherRatio ?? 0.45;
    for (const tid of kblTeams) {
      const base = tid.replace(/_1$/, "");
      let pit = 0, bat = 0;
      for (const n of npcs) {
        if (n.careerStatus !== "active" || !n.currentTeam) continue;
        if (n.currentTeam !== base + "_1" && n.currentTeam !== base + "_2") continue;
        if (n.playerType === "pitcher") pit++; else bat++;
      }
      const total = pit + bat;
      teamNeeds[tid] = {
        pitchers: Math.max(0, Math.round(total * ratio) - pit),
        batters:  Math.max(0, Math.round(total * (1 - ratio)) - bat),
      };
    }
  }

  const sim = call("runDraftNative", {
    candidates, namedMetas: [], year, rounds: gr.draftRules.rounds, teamIds: kblTeams,
    teamNeeds, needBonus, needSaturation: gr.draftRules.needSaturation ?? 0,
  });

  // 🔴 **지명의 보직 분포 — 가점이 실제로 먹는지 보는 유일한 지표다.**
  // 진로 분포(대학·2군·독립·포기)는 가점과 거의 무관해서 숫자가 안 움직인다.
  // 그걸 "효과 없음"으로 읽으면 틀린다.
  {
    const typeOf = new Map(npcs.map((n) => [n.npcId, n.playerType]));
    let pickPit = 0, pickBat = 0, hit = 0, hadNeed = 0;
    for (const pk of sim.picks) {
      const t = typeOf.get(pk.npcId);
      if (t === "pitcher") pickPit++; else pickBat++;
      const nd = teamNeeds[pk.teamId];
      if (!nd) continue;
      const need = (nd.pitchers > 0) || (nd.batters > 0);
      if (!need) continue;
      hadNeed++;
      const filled = t === "pitcher" ? nd.pitchers > 0 : nd.batters > 0;
      if (filled) hit++;
    }
    // 부족 인원 분포 — 대부분 상한에 붙으면 비례가 무의미하다
    const shorts = Object.values(teamNeeds).map((n) => Math.max(n.pitchers, n.batters)).sort((a, b) => a - b);
    const mid = shorts[Math.floor(shorts.length / 2)] ?? 0;
    draftShape.push({ year, pickPit, pickBat, hadNeed, hit, shortMid: mid, shortMax: shorts[shorts.length - 1] ?? 0 });
  }

  if (year === START_YEAR && sim.picks.length > 0) {
    const c = gr.draftRules.contract;
    const fmt = (p) => {
      const row = c.byPick.find((r) => p.pick <= r.untilPick) ?? c.byPick[c.byPick.length - 1];
      const idx = Math.min(c.teamIndexMax, Math.max(c.teamIndexMin, TEAM_INDEX[p.teamId] ?? 1));
      return `${p.round}R-${p.pick} 연봉 ${row.salary}만 · 계약금 ${Math.round(row.bonus * idx / 100) * 100}만`;
    };
    console.log(`  신인 계약 표본: ${fmt(sim.picks[0])} / ${fmt(sim.picks[sim.picks.length - 1])}`);
  }

  npcs = call("applyDraftNative", {
    npcs, result: sim, universityTeamIds: DEST_UNIV, independentTeamIds: DEST_IND,
    farmTeamIds: DEST_FARM, salaryRules: gr.salaryRules,
    contract: gr.draftRules.contract,
    firstTeamRounds: gr.draftRules.firstTeamRounds,
    teamIndex: TEAM_INDEX,
    placement: PLACEMENT,
  });

  // ── 시즌 종료: 졸업 → 나이 +1 ────────────────────────────────
  const g = call("advanceAllGradesNative", { npcs, seasonYear: year });
  const pending = [...g.hsGraduated, ...g.univGraduated];   // 미지명 졸업생
  const aged = call("advanceAllAgesNative", { npcs: [...g.updated, ...pending] });
  const pendingIds = new Set(pending.map((n) => n.npcId));

  // ── 오프시즌: 은퇴·캡·FA·진로배정 ────────────────────────────
  const off = call("runOffseasonNative", {
    npcs: aged.filter((n) => !pendingIds.has(n.npcId)),
    pendingDraft: aged.filter((n) => pendingIds.has(n.npcId)),
    seasonYear: year, namedNpcIds: [],
    salaryRules: gr.salaryRules, rosterLimits: ROSTER_LIMITS,
    universityTeamIds: DEST_UNIV, independentTeamIds: DEST_IND, farmTeamIds: DEST_FARM,
    placement: PLACEMENT,
    // FA 입찰 — 계측기에도 같은 배선을 넣는다. 안 넣으면 옛 동작을 재고
    // "고쳤는데 숫자가 그대로"가 된다
    faBidInterestMin: gr.faRules.bidInterestMin ?? 0,
    teamPayrollCap: (() => {
      const cap = {};
      const pay = {};
      for (const n of aged) {
        if (n.careerStatus !== "active" || !n.currentTeam) continue;
        pay[n.currentTeam] = (pay[n.currentTeam] ?? 0) + (n.currentSalary ?? 0);
      }
      for (const [tid, cur] of Object.entries(pay)) cap[tid] = Math.round(cur * 1.25);
      return cap;
    })(),
    releaseRules: gr.faRules && gr.faRules.release,
  });
  // 🔴 **`off.logs`는 항상 비어 있다.** `npc_sim.rs:1390`에서 만들어져
  // `1589`에서 그대로 반환되고 사이에 `push`가 한 군데도 없다.
  // 문자열로 세니 방출이 다섯 시즌 내내 0으로 보였다 — 없는 결함을
  // 받침할 뿔했다. **경력 사건은 실제로 남으므로 그걸 센다.**
  const releasedThisYear = (off.npcs || []).reduce((acc, n) =>
    acc + (n.careerEvents || []).filter((e) => e.eventType === "release" && e.year === year).length, 0);
  // FA 물량 — **자격자·계약·미계약을 갈라 센다.**
  // 합쳐 세면 "FA가 준다"가 자격 문제인지 갈 팀이 없는 문제인지 안 갈린다.
  let faSigned = 0, faUnsigned = 0;
  for (const n of off.npcs || []) {
    for (const e of n.careerEvents || []) {
      if (e.year !== year) continue;
      if (e.eventType === "fa_signed") faSigned++;
      else if (e.eventType === "fa_unsigned") faUnsigned++;
    }
  }

  // ── 다음 시즌 W1: 고교 신입생 ────────────────────────────────
  const fresh = generateFreshmen(off.npcs, year + 1);

  return {
    after: [...off.npcs, ...fresh], fresh: fresh.length, counts: sel.counts,
    released: releasedThisYear, faSigned, faUnsigned,
    nCand: candidates.length,
    earlyPicked: sim.picks.filter((p) => {
      const r = routeOf.get(p.npcId);
      return r === "universityEarly" || r === "independent";
    }).length,
    leftoverPending: off.pendingDraft.length,
    sim, poolIds: pendingIds,
  };
}

// ── 측정 ───────────────────────────────────────────────────────
function measure(label, kblTeams) {
  let npcs = buildWorld();
  const t0 = Date.now();
  console.log(`\n══ ${label} (KBL ${kblTeams.length}팀 × ${gr.draftRules.rounds}라운드) ══`);
  console.log(`시작 인원 ${npcs.length}명`);

  const rows = [];
  for (let i = 0; i < SEASONS; i++) {
    const year = START_YEAR + i;
    const before = npcs.length;
    const r = runSeason(npcs, year, kblTeams);
    npcs = r.after;

    // 미지명 졸업생이 어디로 갔나
    const moved = new Map();
    for (const id of r.poolIds) {
      const n = npcs.find((x) => x.npcId === id);
      if (n) moved.set(n.currentLeague, (moved.get(n.currentLeague) ?? 0) + 1);
    }
    rows.push({
      year, before, fresh: r.fresh, counts: r.counts, nCand: r.nCand, early: r.earlyPicked,
      drafted: r.sim.picks.length, leftover: r.leftoverPending, released: r.released,
      faSigned: r.faSigned ?? 0, faUnsigned: r.faUnsigned ?? 0,
      toUniv: moved.get("LEAGUE_UNIVERSITY") ?? 0,
      toInd: moved.get("LEAGUE_INDEPENDENT") ?? 0,
      // ⚠ **2군 칸이 없어 합이 안 맞았다.** 진로가 네 갈래인데 셋만
      // 찍어서 165명이 표 밖으로 사라졌다. Placer::place의 순서는
      // 대학 → **2군** → 독립 → 그만둔다이다.
      toFarm: moved.get("LEAGUE_KBL_FARM") ?? 0,
      retired: moved.get("LEAGUE_RETIRED") ?? 0,
    });
  }

  if (draftShape.length) {
    console.log("");
    console.log(`[지명 보직] needBonus=${gr.draftRules.needBonus ?? 0}`);
    console.log("연도    지명 투수/야수   부족팀 지명   그중 부족보직 충족");
    for (const d of draftShape) {
      const pct = d.hadNeed ? Math.round((d.hit / d.hadNeed) * 100) : 0;
      console.log(`${d.year}  ${String(d.pickPit).padStart(8)}/${String(d.pickBat).padStart(3)}` +
        ` 부족 중앙 ${String(d.shortMid).padStart(2)}/최대 ${String(d.shortMax).padStart(2)}` +
        `${String(d.hadNeed).padStart(13)}${String(d.hit).padStart(14)} (${pct}%)`);
    }
    console.log("");
  }
  {
    console.log("");
    console.log("[FA] 연도별 계약/미계약");
    for (const r of rows) {
      console.log(`${r.year}  계약 ${String(r.faSigned).padStart(4)} · 미계약 ${String(r.faUnsigned).padStart(4)}`);
    }
    console.log("");
  }
  console.log("연도   후보 (고졸/대졸/대학재학/독립)  지명(얼리)  미지명→대학  →2군  →독립  포기  방출  신입생");
  for (const r of rows) {
    const c = r.counts;
    console.log(
      `${r.year}  ${String(r.nCand).padStart(5)} (${String(c[0]).padStart(4)}/${String(c[1]).padStart(3)}` +
      `/${String(c[2]).padStart(4)}/${String(c[3]).padStart(3)})` +
      `  ${String(r.drafted).padStart(6)}(${String(r.early).padStart(2)})` +
      `  ${String(r.toUniv).padStart(9)}  ${String(r.toFarm).padStart(4)}  ${String(r.toInd).padStart(5)}` +
      `  ${String(r.retired).padStart(4)}  ${String(r.released).padStart(4)}  ${String(r.fresh).padStart(6)}`
    );
  }

  // 지명된 팀이 refs에 있는가
  const realIds = new Set(refs.teams.map((t) => t.id));
  const kblRoster = npcs.filter((n) => n.currentLeague === "LEAGUE_KBL");
  const ghosted = kblRoster.filter((n) => !realIds.has(n.currentTeam));
  console.log(`\n최종 ${npcs.length}명 (${npcs.length - rows[0].before >= 0 ? "+" : ""}${npcs.length - rows[0].before})`);
  console.log(`은퇴 누적 ${npcs.filter((n) => n.careerStatus === "retired").length}명 · 드래프트풀 잔류 ${npcs.filter((n) => n.currentLeague === "LEAGUE_DRAFT_POOL").length}명`);
  console.log(`KBL 소속 ${kblRoster.length}명 중 refs에 없는 팀 소속: ${ghosted.length}명`);
  if (ghosted.length) {
    const teams = [...new Set(ghosted.map((n) => n.currentTeam))];
    console.log(`  → ${teams.join(", ")}`);
  }

  // 대학·독립 로스터가 견디는가
  const sizeOf = (lid) => {
    const per = new Map();
    for (const n of npcs.filter((x) => x.currentLeague === lid)) {
      per.set(n.currentTeam, (per.get(n.currentTeam) ?? 0) + 1);
    }
    const v = [...per.values()].sort((a, b) => a - b);
    return v.length ? `${v.length}팀 · 최소 ${v[0]} 최대 ${v[v.length - 1]} 평균 ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}` : "없음";
  };
  // 프로 소속이 왜 부푸는지 — 상태별·팀유형별로 쪼개 본다
  {
    const kbl = npcs.filter((n) => n.currentLeague === "LEAGUE_KBL");
    const st = {};
    for (const n of kbl) st[n.careerStatus] = (st[n.careerStatus] ?? 0) + 1;
    const farmTagged = kbl.filter((n) => n.currentTeam.endsWith("_2")).length;
    const noTeam = kbl.filter((n) => !n.currentTeam).length;
    console.log(`LEAGUE_KBL 상태별: ${Object.entries(st).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    console.log(`  그중 _2팀 소속 ${farmTagged}명 · 팀 없음 ${noTeam}명`);
  }
  console.log(`프로1군 ${sizeOf("LEAGUE_KBL")}`);
  console.log(`프로2군 ${sizeOf("LEAGUE_KBL_FARM")}`);
  // ⚠ **정원만 보면 자리가 없는 것처럼 보인다.** 육성선수는 정원 밖 인원이라
  // 실제 상한은 `farmMax + intakeMax`다. 둘을 같이 찍어야 →2군이 0인 이유가 가린다 —
  // 정원이 Cc3c건지, 육성선수 몫이 Cc3c건지.
  {
    const cap = PLACEMENT.farmMax + PLACEMENT.developmentMax;
    const per = new Map();
    for (const n of npcs) {
      if (n.currentLeague !== "LEAGUE_KBL_FARM" || !n.currentTeam) continue;
      const e = per.get(n.currentTeam) || { tot: 0, dev: 0 };
      e.tot++; if (n.developmentSince != null) e.dev++;
      per.set(n.currentTeam, e);
    }
    const rows = [...per.values()];
    const tot = rows.map((r) => r.tot).sort((a, b) => a - b);
    const dev = rows.map((r) => r.dev).sort((a, b) => a - b);
    const free = rows.map((r) => cap - r.tot).sort((a, b) => a - b);
    const devFree = rows.map((r) => PLACEMENT.developmentMax - r.dev).sort((a, b) => a - b);
    const mid = (v) => v.length ? v[Math.floor(v.length / 2)] : 0;
    console.log(`  2군 자리  상한 ${cap}(정원 ${PLACEMENT.farmMax}+육성 ${PLACEMENT.developmentMax})` +
      ` · 총원 중앙 ${mid(tot)} · 남는 자리 중앙 ${mid(free)}/최소 ${free[0]}` +
      ` · 육성선수 중앙 ${mid(dev)} · 육성 여유 중앙 ${mid(devFree)}/최소 ${devFree[0]}`);
  }
  console.log(`대학  ${sizeOf("LEAGUE_UNIVERSITY")}`);
  console.log(`독립  ${sizeOf("LEAGUE_INDEPENDENT")}`);
  // ⚠ **상무가 섞여 평균을 흐린다.** 상무는 배정 대상이 아닌데(`SANGMU_TEAM_ID`
  // 제외) 같이 세면 "최소 26"이 나와 자리가 남는 것처럼 보인다. 실제로는
  // 나머지가 전부 정원이었다. 배정 대상만 따로 본다.
  {
    const per = new Map();
    const ages = [];
    for (const n of npcs) {
      if (n.currentLeague !== "LEAGUE_INDEPENDENT" || !n.currentTeam) continue;
      if (n.careerStatus !== "active") continue;
      per.set(n.currentTeam, (per.get(n.currentTeam) ?? 0) + 1);
      if (n.currentTeam !== SANGMU_TEAM_ID) ages.push(n.age);
    }
    const target = DEST_IND.map((t) => per.get(t) ?? 0).sort((a, b) => a - b);
    const free = target.map((t) => PLACEMENT.independentMax - t);
    const mid = (v) => (v.length ? v[Math.floor(v.length / 2)] : 0);
    ages.sort((a, b) => a - b);
    const over = ages.filter((a) => a > PLACEMENT.independentAgeMax).length;
    console.log(`  독립 자리  정원 ${PLACEMENT.independentMax} · 배정대상 ${DEST_IND.length}팀` +
      ` · 총원 중앙 ${mid(target)}/최소 ${target[0]} · 남는 자리 합 ${free.reduce((a, b) => a + b, 0)}` +
      ` · 나이 중앙 ${mid(ages)}/최대 ${ages[ages.length - 1] ?? 0}` +
      ` · 입단 상한(${PLACEMENT.independentAgeMax}) 초과 ${over}명`);
    console.log(`  상무 별도 ${per.get(SANGMU_TEAM_ID) ?? 0}명 (배정 대상이 아니다)`);
  }

  console.log(`고교  ${sizeOf("LEAGUE_HIGHSCHOOL")}`);

  // 소속 팀이 없는 현역 — FA 미계약자다. D-4가 진로를 줘야 한다
  const homeless = npcs.filter((n) => n.careerStatus === "active" && !n.currentTeam
    && n.currentLeague !== "LEAGUE_RETIRED" && n.currentLeague !== "LEAGUE_DRAFT_POOL");
  console.log(`팀 없는 현역 ${homeless.length}명 (FA 미계약 — D-4 대상)`);

  // 상무에 미지명자가 배정됐는가
  const sangmu = npcs.filter((n) => n.currentTeam === SANGMU_TEAM_ID);
  const sangmuCivil = sangmu.filter((n) => n.careerStatus !== "military");
  console.log(`상무 ${sangmu.length}명 중 복무자 아닌 인원: ${sangmuCivil.length}명`);

  console.log(`(${Date.now() - t0}ms)`);
  return npcs;
}

// 옛 동작(유령 팀·상한 하드코딩·졸업생만)과의 대조는 각 커밋 메시지에 숫자로 남아 있다.
// Rust가 바뀐 뒤라 여기서 재현할 수 없다 — 실측은 **지금 코드**를 재는 것이다.
measure("현행 파이프라인", REAL_KBL);
