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
const DEV_MAX    = RULES.developmentPlayerRules.intakeMax;

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
    developmentMax: DEV_MAX,
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

  // ⑥ **육성선수는 정원 밖 인원이다.**
  //
  // ⚠ 이 검사가 없어서 **게이트는 통과하는데 실전은 0명**이었다. 위 ①~⑤는
  // 빈 2군에 넣어 보므로 자리가 남아돌고, 실제 게임의 2군은 정식 로스터로
  // 꽉 차 있다 — 실측 [32,33,33,33,34,34,34,34,34,34], 여유 5자리에
  // 미지명자 1,373명 중 배정 0명이었다.
  {
    const full = FARMS.flatMap((tid) =>
      Array.from({ length: FARM_MAX }, () => npc({
        currentLeague: "LEAGUE_KBL_FARM", currentTeam: tid, careerHistory: [],
      })));
    const raw = JSON.parse(await api.engine("applyDraftNative", JSON.stringify({
      npcs: [...full, ...npcs], result, universityTeamIds: UNIV,
      independentTeamIds: INDIE, farmTeamIds: FARMS, placement,
      firstTeamRounds: 0, teamIndex: {},
    })));
    if (raw.error) { log(`FAIL  엔진 오류(정원): ${raw.error}`); process.exit(1); }
    // 새로 들어간 사람만 센다 — 미리 채워둔 34명은 이미 2군이다
    const ids = new Set(npcs.map((n) => n.npcId));
    const got = raw.filter((n) => ids.has(n.npcId) && n.currentLeague === "LEAGUE_KBL_FARM");
    const perTeamDev = {};
    for (const n of got) perTeamDev[n.currentTeam] = (perTeamDev[n.currentTeam] ?? 0) + 1;

    check("정식 정원이 꽉 차도 육성선수는 들어간다",
          got.length > 0,
          `정원 ${FARM_MAX} 꽉 찬 ${FARMS.length}팀에 ${got.length}명 — intakeMax(${DEV_MAX})가 안 먹었다`);
    check(`팀당 육성선수 상한(${DEV_MAX})을 안 넘는다`,
          Object.values(perTeamDev).every((c) => c <= DEV_MAX),
          JSON.stringify(perTeamDev));
    // 무제한이면 2군이 육성선수로 채워져 드래프트 지명의 가치가 사라진다
    check("정원 밖 인원이 무제한은 아니다",
          got.length <= FARMS.length * DEV_MAX,
          `${got.length}명 > ${FARMS.length}팀 x ${DEV_MAX}`);
  }

  // ⑦ **배선이 죽으면 검사가 실패해야 한다.**
  // 이게 없으면 이 검사도 "돌긴 도는데 아무것도 안 지키는" 검사가 된다 —
  // 실제로 `farmTeamIds`가 빠진 상태로 상한만 맞아 있던 게 원래 결함이다
  const withoutWiring = await send([]);
  const farmWithout = withoutWiring.filter((n) => n.currentLeague === "LEAGUE_KBL_FARM").length;
  check("farmTeamIds를 빼면 2군 배정이 사라진다 (검사가 배선을 본다)",
        farmWithout === 0 && inFarm.length > 0,
        `배선 없이도 ${farmWithout}명이 2군에 갔다면 이 검사는 배선을 안 보는 것이다`);

  // ⑧ **자리는 실력으로 갈린다 — 순서로 갈리면 안 된다.**
  //
  // ⚠ 오프시즌 배정은 방출자와 미지명 졸업생을 **한 루프**에서 돌린다.
  // 예전엔 인덱스 순이라 기존 NPC(방출자)가 앞이고 졸업생이 뒤였고,
  // 육성 슬롯 100개를 방출자가 연 ~95명 먹어서 **미지명자는 0명**이었다
  // (실측 2시즌). 제도가 한쪽에만 열려 있던 것이다.
  //
  // `apply_draft` 쪽은 원래 능력치 순이다 — 같은 판정이 경로에 따라
  // 기준이 달랐다. 여기서 그 둘이 같은 잣대를 쓰는지 본다.
  {
    const FARM1 = "TEAM_KBL_Z_2";
    const strong = (over) => npc({
      batting: { ovr: 78, contact: 78, power: 78, eye: 78, discipline: 78, speed: 78,
                 baseInstinct: 78, bunting: 78, platoon: 78, fielding: 78, arm: 78,
                 battingClutch: 78 },
      ...over,
    });
    const weak = (over) => npc({
      batting: { ovr: 40, contact: 40, power: 40, eye: 40, discipline: 40, speed: 40,
                 baseInstinct: 40, bunting: 40, platoon: 40, fielding: 40, arm: 40,
                 battingClutch: 40 },
      ...over,
    });
    // 방출자(약함) — 기존 NPC라 배열 앞에 온다. 소속이 비어 있어야 homeless다
    const released = Array.from({ length: 5 }, () => weak({
      currentLeague: "LEAGUE_KBL", currentTeam: "",
      careerHistory: [{ year: 2025, leagueId: "LEAGUE_KBL", teamId: "TEAM_KBL_Z_1",
                        statLine: "", highlights: [] }],
    }));
    // 미지명 졸업생(강함) — pendingDraft로 들어가 배열 뒤에 온다
    const grads = Array.from({ length: 5 }, () => strong({
      currentLeague: "LEAGUE_DRAFT_POOL", currentTeam: "",
    }));

    const raw = JSON.parse(await api.engine("runOffseasonNative", JSON.stringify({
      npcs: released, pendingDraft: grads, seasonYear: 2026, namedNpcIds: [],
      rosterLimits: { LEAGUE_KBL: { rosterMin: 1, rosterMax: 40 },
                      LEAGUE_KBL_FARM: { rosterMin: 1, rosterMax: 40 } },
      universityTeamIds: [],
      // ⚠ **독립리그 팀을 비우면 배정이 통째로 안 돈다.**
      // `can_place = !independent_team_ids.is_empty()`라, 여기를 []로 뒀더니
      // 2군 배정도 같이 죽어서 이 검사가 0명으로 실패했다. 팀은 주되
      // `independentMax: 0`으로 자리를 막는다
      independentTeamIds: ["TEAM_IND_Z"],
      farmTeamIds: [FARM1],
      // 자리를 **2개만** 준다 — 정식 정원 1 + 육성 2. 누가 가져가는지 갈린다
      placement: {
        universityMax: 0, independentMax: 0, independentAgeMax: 0,
        universityAnnualMax: 0, farmMax: 1,
        developmentSalary: DEV_SALARY, developmentMax: 2,
      },
    })));
    if (raw.error) { log(`FAIL  엔진 오류(정렬): ${raw.error}`); process.exit(1); }

    const gradIds = new Set(grads.map((n) => n.npcId));
    const inFarm2 = (raw.npcs ?? []).filter((n) => n.currentLeague === "LEAGUE_KBL_FARM");
    const gotGrad = inFarm2.filter((n) => gradIds.has(n.npcId)).length;

    check("자리가 모자라면 능력치 높은 쪽이 가져간다",
          inFarm2.length > 0 && gotGrad === inFarm2.length,
          `2군 ${inFarm2.length}명 중 졸업생(OVR 78) ${gotGrad}명 — ` +
          `나머지는 방출자(OVR 40)다. 인덱스 순으로 돌고 있다`);
  }


  // ── 육성선수 단년 계약 만료 ─────────────────────────────────
  //
  // 🔴 **이게 없어서 2군 육성 몫이 첫 해에 차고 영영 안 열렸다.**
  // 육성선수는 contract_years = 1로 들어오는데 만료 판정이 `market.ts`에
  // 있고 거긴 `_1`(1군)만 훑는다. 실측 진로 분포:
  //
  //     연도   →2군   포기
  //     2026     74    775     ← 첫 해에 팀당 10명을 채운다
  //     2030      0    971     ← 그 뒤로 한 명도 못 들어간다
  //
  // 규칙(사용자 확정): **성장했으면 재계약, 아니면 방출.** 비교 기준은
  // 입단 시점이 아니라 **직전 판정 시점**이다 — 열여덟·아홉이라 입단
  // 대비로 재면 거의 다 성장해서 아무도 안 나간다.
  {
    const FARM = "TEAM_KBL_Y_2";
    const at = (ovr, over) => npc({
      currentLeague: "LEAGUE_KBL_FARM", currentTeam: FARM,
      currentSalary: DEV_SALARY, contractYears: 1,
      batting: { ovr, contact: ovr, power: ovr, eye: ovr, discipline: ovr, speed: ovr,
                 baseInstinct: ovr, bunting: ovr, platoon: ovr, fielding: ovr,
                 arm: ovr, battingClutch: ovr },
      careerHistory: [{ year: 2025, leagueId: "LEAGUE_KBL_FARM", teamId: FARM,
                        statLine: "", highlights: [] }],
      ...over,
    });

    // 넷을 한 번에 넣고 각자 다르게 갈리는지 본다
    const grew    = at(60, { developmentSince: 2025, developmentOvr: 50 });  // 올랐다
    const stalled = at(50, { developmentSince: 2025, developmentOvr: 50 });  // 그대로
    const rookie  = at(45, { developmentSince: 2026, developmentOvr: 45 });  // 입단 연도
    const noBase  = at(50, { developmentSince: 2025 });                      // 기준이 없다(옛 세이브)
    const regular = at(50, { developmentSince: undefined });                 // 정식 등록 선수

    const raw = JSON.parse(await api.engine("runOffseasonNative", JSON.stringify({
      npcs: [grew, stalled, rookie, noBase, regular], pendingDraft: [],
      seasonYear: 2026, namedNpcIds: [],
      rosterLimits: { LEAGUE_KBL: { rosterMin: 1, rosterMax: 40 },
                      LEAGUE_KBL_FARM: { rosterMin: 1, rosterMax: 40 } },
      universityTeamIds: [],
      // 자리를 다 막는다 — 방출된 사람이 어디로 가든 여기선 "팀을 잃었다"만 본다
      independentTeamIds: ["TEAM_IND_Z"], farmTeamIds: [],
      placement: {
        universityMax: 0, independentMax: 0, independentAgeMax: 0,
        universityAnnualMax: 0, farmMax: 0,
        developmentSalary: DEV_SALARY, developmentMax: 0,
      },
    })));
    if (raw.error) { log(`FAIL  엔진 오류(만료): ${raw.error}`); process.exit(1); }

    const byId = new Map((raw.npcs ?? []).map((n) => [n.npcId, n]));
    const held = (n) => {
      const r = byId.get(n.npcId);
      return !!r && r.currentTeam === FARM;
    };

    check("성장한 육성선수는 재계약한다",
          held(grew), `OVR 50→60인데 팀을 잃었다`);
    check("성장이 멈춘 육성선수는 방출된다",
          !held(stalled),
          `OVR 50→50인데 남아 있다 — 자리가 안 열려 미지명자가 못 들어온다`);
    check("입단 연도에는 안 건다",
          held(rookie), `그 해엔 5월까지 1군 등록도 안 되니 증명할 기회가 없다`);
    check("기준이 없으면 이번에 세우고 안 자른다",
          held(noBase), `옛 세이브에서 넘어온 사람을 배선이 늦었다는 이유로 자르면 안 된다`);
    check("정식 등록 선수는 이 판정을 안 탄다",
          held(regular), `developmentSince가 없으면 육성선수가 아니다`);

    // 🔴 **대조군** — 갱신이 안 되면 다음 해에 또 같은 기준으로 재게 되고,
    // 성장이 멈춘 뒤에도 한 해를 더 버틴다. 갱신을 봐야 검사가 의미가 있다
    const g2 = byId.get(grew.npcId);
    check("재계약하면 비교 기준을 갱신한다",
          g2 && g2.developmentOvr === 60,
          `developmentOvr가 ${g2 && g2.developmentOvr}다 — 60이어야 한다`);
    check("재계약하면 단년 계약이 다시 붙는다",
          g2 && g2.contractYears === 1,
          `contractYears가 ${g2 && g2.contractYears}다`);
  }

  log(failed === 0 ? "\n통과" : `\n실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})();
