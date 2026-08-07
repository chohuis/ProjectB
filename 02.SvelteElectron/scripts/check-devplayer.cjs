#!/usr/bin/env node
// 육성선수 — **미지명자가 프로 2군으로 흘러가는가**를 실제 엔진으로 본다.
//
//   npm run check:devplayer
//
// ⚠ **이 검사가 없어서 경로가 통째로 죽어 있었다** (2026-08-07):
//   · Rust `Placer`에 2군 갈래가 있었고 (`draft.rs`, 대학 다음 · 독립 앞)
//   · `placementRulesFrom`이 `farmMax: 34`를 계산해서 넘겼는데
//   · **TS가 팀 목록(`farmTeamIds`)을 안 넘겼다.** 빈 배열을 훑으니 상한 34가
//     한 번도 쓰인 적이 없다 — 갈 곳 없는 사람이 시즌당 1,135명씩 그만뒀다
//
// 규칙 파일과 Rust만 봤으면 셋 다 맞아 보인다. **셋을 잇는 배선**만 없었고,
// 그건 실제로 한 번 돌려봐야 보인다. 그래서 이 검사는 엔진을 호출한다.
//
// 못 박는 것:
//   ① 미지명자가 실제로 2군에 배정된다 (0명이면 실패 — "나올 게 없어서 통과"를 막는다)
//   ② 배정된 사람에게 육성선수 신분(`developmentSince`)이 붙는다
//   ③ 계약이 최저연봉보다 낮고 단년이다
//   ④ 대학·독립으로 간 사람에겐 신분이 안 붙는다 (소속 ≠ 신분)
//   ⑤ 2군 정원을 넘겨 받지 않는다
//   ⑥ 배선이 살아 있다 — `farmTeamIds`를 빼면 이 검사가 **실패해야 한다**

const path = require("node:path");
const fs = require("node:fs");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { log(`  ok  ${name}`); return; }
  failed++;
  log(`FAIL  ${name}`);
  if (detail) log(`        ${detail}`);
}

const RULES = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), "resource/data/master/players/generation_rules.json"), "utf8"));

const DEV_SALARY = RULES.developmentPlayerRules.salary;
const FARM_MAX   = RULES.rosterRules["LEAGUE_KBL_FARM"].rosterMax;
const ROOKIE_MIN = Math.min(...RULES.draftRules.contract.byPick.map((b) => b.salary));

// 2군 3팀 · 대학 1팀 · 독립 1팀
const FARMS = ["TEAM_KBL_A_2", "TEAM_KBL_B_2", "TEAM_KBL_C_2"];
const UNIV  = ["TEAM_UNIV_A"];
const INDIE = ["TEAM_IND_A"];

let seq = 0;
function npc(over = {}) {
  const id = `N${String(seq++).padStart(4, "0")}`;
  const isPit = over.playerType === "pitcher";
  return {
    npcId: id, name: `선수${seq}`,
    playerType: isPit ? "pitcher" : "batter",
    position: isPit ? "SP" : "SS",
    age: 22, schoolId: "", graduationYear: 2026, careerStatus: "active",
    // ⚠ **배정은 `LEAGUE_DRAFT_POOL`인 사람만 돈다.** 처음엔 소속을
    // `LEAGUE_UNIVERSITY`로 뒀다가 60명이 통째로 손도 안 닿고 지나갔다 —
    // 그런데 화면상으론 "대학 60명"이라 배정이 된 것처럼 보였다
    currentLeague: "LEAGUE_DRAFT_POOL", currentTeam: "",
    militaryStatus: "none", developmentRate: 50,
    // ⚠ **대졸 판정은 `careerHistory`의 마지막 항목이다.** 비워 두면
    // 고졸로 읽혀(`map_or(true, ...)`) 대학이 먼저 받아가고, 2군 경로가
    // 한 번도 안 돌아 검사가 무의미해진다
    careerHistory: [{
      year: 2025, leagueId: "LEAGUE_UNIVERSITY", teamId: "TEAM_UNIV_OLD",
      statLine: "", highlights: [],
    }],
    careerEvents: [], achievements: [],
    batting: {
      ovr: 55, contact: 55, power: 55, eye: 55, discipline: 55, speed: 55,
      baseInstinct: 55, bunting: 55, platoon: 55, fielding: 55, arm: 55,
      battingClutch: 55,
    },
    currentSalary: 0, contractYears: 0,
    ...over,
  };
}

(async () => {
  await headless.boot("check-devplayer");
  const api = globalThis.window.projectB;

  // 미지명자 60명 — 2군 정원(3팀 × 34 = 102)보다 적으니 전원 들어갈 수 있다.
  // 투수/야수를 섞는다: `find_slot`이 보직 수요를 보므로 한쪽만 주면
  // 자리 판정이 안 돈다
  const npcs = [
    ...Array.from({ length: 30 }, () => npc()),
    ...Array.from({ length: 30 }, () => npc({ playerType: "pitcher" })),
  ];

  const placement = {
    universityMax: 40, independentMax: 45, independentAgeMax: 31,
    universityAnnualMax: 8,
    farmMax: FARM_MAX,
    developmentSalary: DEV_SALARY,
  };
  // 지명 0명 — 전원이 미지명자 경로를 탄다
  const result = { picks: [], year: 2026, undraftedIds: npcs.map((n) => n.npcId) };

  const send = async (farmTeamIds) => {
    const raw = JSON.parse(await api.engine("applyDraftNative", JSON.stringify({
      npcs, result, universityTeamIds: UNIV, independentTeamIds: INDIE,
      farmTeamIds, placement, firstTeamRounds: 0, teamIndex: {},
    })));
    if (raw.error) { log(`FAIL  엔진 오류: ${raw.error}`); process.exit(1); }
    return raw;
  };

  const out = await send(FARMS);
  const inFarm = out.filter((n) => n.currentLeague === "LEAGUE_KBL_FARM");
  const inUniv = out.filter((n) => n.currentLeague === "LEAGUE_UNIVERSITY");
  const inInd  = out.filter((n) => n.currentLeague === "LEAGUE_INDEPENDENT");
  const quit   = out.filter((n) => n.careerStatus === "retired");

  log(`육성선수 검사 — 미지명 ${npcs.length}명`);
  log(`  2군 ${inFarm.length} · 대학 ${inUniv.length} · 독립 ${inInd.length} · 그만둠 ${quit.length}`);

  // ① 실제로 들어간다. **0명이면 실패다** — 이 검사의 존재 이유가 여기다
  check("미지명자가 2군에 배정된다", inFarm.length > 0,
        `2군 0명. farmTeamIds 배선이나 farmMax를 확인하라 (farmMax=${FARM_MAX})`);

  // ② 신분이 붙는다
  check("2군으로 간 사람에게 육성선수 신분이 붙는다",
        inFarm.length > 0 && inFarm.every((n) => n.developmentSince === 2026),
        `신분 없는 사람 ${inFarm.filter((n) => n.developmentSince !== 2026).length}명`);

  // ③ 계약이 드래프트와 다르다
  check(`육성선수 연봉이 최저연봉(${ROOKIE_MIN})보다 낮다`, DEV_SALARY < ROOKIE_MIN,
        `설정값 ${DEV_SALARY}`);
  check("배정된 사람의 연봉이 규칙 파일 값과 같다",
        inFarm.length > 0 && inFarm.every((n) => n.currentSalary === DEV_SALARY),
        `다른 값: ${[...new Set(inFarm.map((n) => n.currentSalary))].join(", ")}`);
  check("육성선수는 단년 계약이다",
        inFarm.length > 0 && inFarm.every((n) => n.contractYears === 1));

  // ④ 소속 ≠ 신분
  check("대학·독립으로 간 사람에겐 신분이 안 붙는다",
        [...inUniv, ...inInd].every((n) => n.developmentSince == null),
        "2군이 아닌 곳에 육성선수 신분이 붙었다");

  // ⑤ 정원
  const perTeam = {};
  for (const n of inFarm) perTeam[n.currentTeam] = (perTeam[n.currentTeam] ?? 0) + 1;
  check(`2군 팀당 정원(${FARM_MAX})을 안 넘는다`,
        Object.values(perTeam).every((c) => c <= FARM_MAX),
        JSON.stringify(perTeam));
  check("배정이 한 팀에 안 몰린다", Object.keys(perTeam).length > 1,
        `배정된 팀: ${Object.keys(perTeam).join(", ") || "(없음)"}`);

  // ⑥ **배선이 죽으면 검사가 실패해야 한다.**
  // 이게 없으면 이 검사도 "돌긴 도는데 아무것도 안 지키는" 검사가 된다 —
  // 실제로 `farmTeamIds`가 빠진 상태로 상한만 맞아 있던 게 원래 결함이다
  const withoutWiring = await send([]);
  const farmWithout = withoutWiring.filter((n) => n.currentLeague === "LEAGUE_KBL_FARM").length;
  check("farmTeamIds를 빼면 2군 배정이 사라진다 (검사가 배선을 본다)",
        farmWithout === 0 && inFarm.length > 0,
        `배선 없이도 ${farmWithout}명이 2군에 갔다면 이 검사는 배선을 안 보는 것이다`);

  log(failed === 0 ? "\n통과" : `\n실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})();
