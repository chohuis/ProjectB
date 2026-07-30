"use strict";
// Phase 6C 관계도 검증
// 실행: npm run test:relationship
//
// 설계 정본: docs/design/people.md §4
//
// 이 테스트가 지키는 것:
//  1. 데이터 계층 — 관계는 slot.db 테이블이 정본이고 왕복이 무손실이다
//  2. 값 범위 — Rust를 우회한 경로로도 −100~100을 벗어나 저장되지 않는다
//  3. 라벨 경계 — TS와 Rust가 **같은 7구간**을 쓴다 (두 곳에 있으므로 대조가 필수)
//  4. 이동 규칙 — 감쇠 후 보존. 재회하면 감쇠된 값에서 재개된다
//
// 왜 라벨을 두 곳에 두고 대조하나: 화면은 IPC 왕복 없이 라벨을 그려야 하고
// 판정(콜업·훈련효율)은 Rust에서 한다. 한쪽만 고치면 "화면엔 신뢰인데 감독은
// 안 쓰는" 상태가 되고, 그건 조용히 굴러간다 — 그래서 테스트로 묶는다.

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const slotdb = require("../apps/desktop/ipc/slotdb.cjs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slotdb-relationship-"));
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const mgr = slotdb.createManager(tmpDir);
const SLOT = "REL1";
const d = (cmd, p) => slotdb.dispatch(mgr, cmd, { slotId: SLOT, ...p });

// ── 0. 슬롯 준비 ──────────────────────────────────────────────
console.log("스키마");
{
  const res = d("createSlot", {
    worldSeed: 4242,
    protagonist: { name: "주인공", teamId: "TEAM_HS_HANSEONG" },
    season: {},
    npcs: [
      { npcId: "PLY_A", name: "동료A", currentTeam: "TEAM_HS_HANSEONG", currentLeague: "LEAGUE_HIGHSCHOOL", age: 17 },
      { npcId: "PLY_B", name: "라이벌B", currentTeam: "TEAM_HS_GYEONGGI", currentLeague: "LEAGUE_HIGHSCHOOL", age: 18 },
    ],
    staff: [
      { staffId: "MGR_1", name: "김감독", role: "manager", age: 55, teamId: "TEAM_HS_HANSEONG", leagueId: "LEAGUE_HIGHSCHOOL", stats: { tacticalIQ: 60 } },
      { staffId: "COA_1", name: "박코치", role: "coach",   age: 48, teamId: "TEAM_HS_HANSEONG", leagueId: "LEAGUE_HIGHSCHOOL", style: "pitching" },
    ],
  });
  check("createSlot 성공", !res.error, JSON.stringify(res));
  check("새 슬롯의 관계는 비어 있다", d("getRelationships").length === 0);
  check("스키마 버전이 v4 이상", slotdb.SCHEMA_VERSION >= 4, `got ${slotdb.SCHEMA_VERSION}`);
}

// ── 1. 왕복 무손실 ────────────────────────────────────────────
console.log("\n왕복");
{
  const rows = [
    { personId: "MGR_1", kind: "manager",  value:  42, contact: "together", metSeason: 2029, metTeam: "TEAM_HS_HANSEONG", lastTeam: "TEAM_HS_HANSEONG", updatedWeek: 12,
      memories: [{ type: "gratitude", season: 2029, week: 8, intensity: 2, detail: "첫 선발 기용" }] },
    { personId: "COA_1", kind: "coach",    value:  -7, contact: "together", metSeason: 2029, metTeam: "TEAM_HS_HANSEONG", lastTeam: "TEAM_HS_HANSEONG", updatedWeek: 12, memories: [] },
    { personId: "PLY_A", kind: "teammate", value:  18, contact: "together", metSeason: 2029, metTeam: "TEAM_HS_HANSEONG", lastTeam: "TEAM_HS_HANSEONG", updatedWeek: 12, memories: [] },
    { personId: "PLY_B", kind: "rival",    value: -35, contact: "apart",    metSeason: 2029, metTeam: "",                 lastTeam: "",                   updatedWeek: 12,
      memories: [{ type: "humiliation", season: 2029, week: 11, intensity: 3, detail: "패왕기 8강 완봉패" }] },
  ];
  const w = d("upsertRelationships", { rows });
  check("일괄 쓰기 4행", w.written === 4, JSON.stringify(w));

  const back = d("getRelationships");
  check("4행 읽힘", back.length === 4, `${back.length}`);

  const mgrRow = back.find((r) => r.personId === "MGR_1");
  check("value 보존", mgrRow.value === 42, `${mgrRow.value}`);
  check("kind 보존", mgrRow.kind === "manager");
  check("contact 보존", mgrRow.contact === "together");
  check("metSeason 보존", mgrRow.metSeason === 2029);
  check("memories 왕복", mgrRow.memories.length === 1 && mgrRow.memories[0].detail === "첫 선발 기용",
    JSON.stringify(mgrRow.memories));
  check("음수 값 보존", back.find((r) => r.personId === "COA_1").value === -7);

  // 갱신도 같은 경로 (INSERT OR REPLACE)
  d("upsertRelationships", { rows: [{ ...rows[0], value: 55, updatedWeek: 20 }] });
  const after = d("getRelationships", { personIds: ["MGR_1"] });
  check("갱신이 같은 경로로 반영", after.length === 1 && after[0].value === 55, JSON.stringify(after));
  check("갱신 후에도 행 수 유지 (중복 삽입 아님)", d("getRelationships").length === 4);
}

// ── 2. 값 범위 — DB 앞에서 막는다 ─────────────────────────────
console.log("\n값 범위");
{
  // contact를 ended로 둔다 — 관계는 **삭제 커맨드가 없다**(감쇠 후 보존이 설계다).
  // together로 두면 아래 팀 이동 테스트의 대상 수에 섞인다.
  d("upsertRelationships", { rows: [
    { personId: "OVER_HI", kind: "teammate", value:  9999, contact: "ended" },
    { personId: "OVER_LO", kind: "teammate", value: -9999, contact: "ended" },
    { personId: "FRAC",    kind: "teammate", value:  12.7, contact: "ended" },
  ] });
  const rows = d("getRelationships", { personIds: ["OVER_HI", "OVER_LO", "FRAC"] });
  const get = (id) => rows.find((r) => r.personId === id).value;
  check("상한 clamp", get("OVER_HI") === 100, `${get("OVER_HI")}`);
  check("하한 clamp", get("OVER_LO") === -100, `${get("OVER_LO")}`);
  check("소수는 정수로", get("FRAC") === 13, `${get("FRAC")}`);
}

// ── 3. person VIEW 조인 ───────────────────────────────────────
console.log("\nperson 조인");
{
  const joined = d("getRelationships", { withPerson: true });
  const mgrRow = joined.find((r) => r.personId === "MGR_1");
  const plyRow = joined.find((r) => r.personId === "PLY_A");
  check("스태프 이름이 붙는다", mgrRow?.name === "김감독", JSON.stringify(mgrRow?.name));
  check("선수 이름이 붙는다", plyRow?.name === "동료A", JSON.stringify(plyRow?.name));
  check("소속팀도 온다", plyRow?.teamId === "TEAM_HS_HANSEONG", JSON.stringify(plyRow?.teamId));

  // 상대가 사라져도 관계 행은 남는다 (LEFT JOIN — 은퇴 기록 보존)
  d("upsertRelationships", { rows: [{ personId: "GHOST_1", kind: "manager", value: 30, contact: "ended" }] });
  const withGhost = d("getRelationships", { withPerson: true, personIds: ["GHOST_1"] });
  check("npc/staff에 없는 상대도 조회된다", withGhost.length === 1, `${withGhost.length}`);
  check("이름 없는 행이 값은 보존", withGhost[0]?.value === 30);
  check("이름은 비어 있다", withGhost[0]?.name === null || withGhost[0]?.name === undefined,
    JSON.stringify(withGhost[0]?.name));
  d("setRelationshipContact", { contact: "ended", personIds: ["GHOST_1"] });
}

// ── 4. 필터 ───────────────────────────────────────────────────
console.log("\n필터");
{
  check("kind로 좁힌다", d("getRelationships", { kind: "manager" }).every((r) => r.kind === "manager"));
  check("contact로 좁힌다", d("getRelationships", { contact: "together" }).every((r) => r.contact === "together"));
  check("personIds로 좁힌다", d("getRelationships", { personIds: ["COA_1", "PLY_A"] }).length === 2);
  check("빈 personIds는 전체 (필터 무시)", d("getRelationships", { personIds: [] }).length >= 4);
}

// ── 5. 팀 이동 — 접촉 상태 일괄 전환 ─────────────────────────
console.log("\n팀 이동");
{
  const before = d("getRelationships", { contact: "together" }).length;
  check("이동 전 together 3명 (감독·코치·동료)", before === 3, `${before}`);

  // 졸업: 한성고에서 함께 있던 전원이 apart로
  d("setRelationshipContact", { contact: "apart", fromTeam: "TEAM_HS_HANSEONG" });
  const after = d("getRelationships", { contact: "together" });
  check("옛 팀 전원이 apart로", after.length === 0, JSON.stringify(after.map((r) => r.personId)));

  const apart = d("getRelationships", { contact: "apart" });
  check("값은 그대로 남는다 (감쇠는 Rust가 따로 적용)",
    apart.find((r) => r.personId === "MGR_1").value === 55);
  check("lastTeam 보존 — 재회 판정 근거",
    apart.find((r) => r.personId === "MGR_1").lastTeam === "TEAM_HS_HANSEONG");

  // ended는 fromTeam 일괄에 걸리지 않는다 (contact='together'만 대상)
  check("ended 행은 건드리지 않는다",
    d("getRelationships", { personIds: ["GHOST_1"] })[0].contact === "ended");
}

// ── 6. createSlot이 관계를 비운다 ─────────────────────────────
console.log("\n슬롯 재생성");
{
  d("createSlot", { worldSeed: 1, protagonist: {}, season: {}, npcs: [] });
  check("createSlot 후 관계 0행", d("getRelationships").length === 0);
}

// ── 7. 라벨 경계 — Rust와 TS가 같은 표를 쓰는가 ───────────────
//
// 이 대조가 이 파일에 있는 이유: 경계가 두 곳에 있다. 화면은 IPC 왕복 없이
// 라벨을 그려야 하고(TS), 콜업·훈련효율 판정은 Rust에서 한다. 한쪽만 고치면
// "화면엔 신뢰로 뜨는데 감독은 안 쓰는" 상태가 되고 그건 조용히 굴러간다.
console.log("\n라벨 경계 (Rust ↔ TS)");
{
  const native = require("../packages/engine-native/index.js");
  const rustTable = JSON.parse(native.relationLabelTableNative());

  // TS 정의를 소스에서 뽑는다 (.ts를 그대로 require할 수 없다)
  const tsSrc = fs.readFileSync(
    path.join(__dirname, "../apps/ui/src/shared/types/relationship.ts"), "utf8");
  const block = tsSrc.match(/RELATION_LABELS = \[([\s\S]*?)\] as const/);
  const tsTable = [...(block?.[1] ?? "").matchAll(
    /min:\s*(-?\d+),\s*max:\s*(-?\d+),\s*label:\s*"([^"]+)",\s*tone:\s*"([^"]+)"/g)]
    .map((m) => ({ min: +m[1], max: +m[2], label: m[3], tone: m[4] }));

  check(`TS 표를 파싱했다 (${tsTable.length}구간)`, tsTable.length === 7, `${tsTable.length}`);
  check(`Rust 표가 7구간`, rustTable.length === 7, `${rustTable.length}`);

  let mismatch = [];
  for (let i = 0; i < Math.max(rustTable.length, tsTable.length); i++) {
    const r = rustTable[i], t = tsTable[i];
    if (!r || !t) { mismatch.push(`구간 ${i} 한쪽에만 있음`); continue; }
    if (r.min !== t.min || r.max !== t.max || r.label !== t.label || r.tone !== t.tone) {
      mismatch.push(`구간 ${i}: Rust(${r.min}~${r.max} ${r.label}/${r.tone}) ≠ TS(${t.min}~${t.max} ${t.label}/${t.tone})`);
    }
  }
  check("Rust와 TS의 라벨 표가 완전히 같다", mismatch.length === 0, "\n      " + mismatch.join("\n      "));

  // 구멍·겹침 없이 −100~100을 덮는가 (양쪽 각각)
  for (const [who, table] of [["Rust", rustTable], ["TS", tsTable]]) {
    const bad = [];
    for (let v = -100; v <= 100; v++) {
      const hits = table.filter((b) => v >= b.min && v <= b.max).length;
      if (hits !== 1) bad.push(`${v}→${hits}개`);
    }
    check(`  ${who}: 전 구간이 정확히 한 라벨`, bad.length === 0, bad.slice(0, 5).join(" "));
  }
}

// ── 8. 규칙 파일이 생성돼 있는가 ──────────────────────────────
// 6B에서 두 번 겪은 실패: TOML을 고치고 build_refs_from_seeds.py를 안 돌려
// Rust가 옛 규칙으로 돌았다. Rust 유닛테스트가 이 JSON을 읽으므로 존재는 그쪽이
// 보장하지만, TS 배선도 같은 파일을 먹으니 여기서도 확인한다.
console.log("\n규칙 파일");
{
  const rulesPath = path.join(__dirname, "../resource/data/master/players/relationship_rules.json");
  check("relationship_rules.json 생성됨", fs.existsSync(rulesPath),
    "python scripts/build_refs_from_seeds.py 실행 필요");
  if (fs.existsSync(rulesPath)) {
    const r = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
    check("init·decay·weekly·season 4섹션",
      ["init", "decay", "weekly", "season"].every((k) => k in r), Object.keys(r).join(","));
    check("이동 감쇠가 0<f<1 (리셋도 유지도 아니다)",
      r.decay.on_move > 0 && r.decay.on_move < 1, `${r.decay.on_move}`);
    check("비접촉 감쇠가 0<f<1", r.decay.apart_per_season > 0 && r.decay.apart_per_season < 1);
    check("주간 규칙에 4종 kind", ["manager", "coach", "teammate", "rival"].every((k) => k in r.weekly));
  }
}

// ── 9. 효과 배선 — 관계가 실제 판정을 바꾸는가 (6C-5) ─────────
//
// 값이 쌓이기만 하고 아무것도 안 바뀌면 관계도는 장식이다. 이 절이 "쌓인 값이
// 보직·훈련에 실제로 닿는다"를 본다.
console.log("\n효과 배선");
{
  const native = require("../packages/engine-native/index.js");
  const rules = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/players/relationship_rules.json"), "utf8"));

  const eff = (managerValue, coachValue) => JSON.parse(
    native.relationEffectsNative(JSON.stringify({ rules, managerValue, coachValue })));

  const close = eff(80, 80);      // 각별
  const neutral = eff(0, 0);      // 중립
  const hostile = eff(-80, -80);  // 적대

  check("중립은 보정이 0", neutral.roleOvrBias === 0 && neutral.trainingBonus === 0,
    JSON.stringify(neutral));
  check("각별이면 보직 평가가 오른다", close.roleOvrBias > 0, `${close.roleOvrBias}`);
  check("적대면 보직 평가가 내린다", hostile.roleOvrBias < 0, `${hostile.roleOvrBias}`);
  check("부호가 대칭", close.roleOvrBias === -hostile.roleOvrBias);
  check("훈련 효율도 같은 방향", close.trainingBonus > 0 && hostile.trainingBonus < 0);
  check("라벨이 함께 온다", close.managerLabel === "각별" && hostile.coachLabel === "적대",
    `${close.managerLabel}/${hostile.coachLabel}`);

  // 라벨 단계별로 단조 증가 (중간에 꺾이면 튜닝 사고다)
  const steps = [-80, -40, -20, 0, 20, 50, 80].map(v => eff(v, v).roleOvrBias);
  const monotone = steps.every((v, i) => i === 0 || v > steps[i - 1]);
  check("라벨이 오를 때마다 보정도 오른다", monotone, steps.join(" → "));

  // 보정이 실제로 보직을 가르는가 — 관계도만의 힘으로 5선발에 진입할 수 있어야 한다
  const rotation = [90, 85, 80, 70, 64];
  const roleAt = (bias) => JSON.parse(native.assignProtagonistRoleNative(JSON.stringify({
    position: null, ovr: 62, teamSpOvrs: rotation, roleOvrBias: bias,
  }))).role;
  check("중립이면 로테이션 밖", roleAt(0) === "스윙맨", roleAt(0));
  check("각별이면 5선발 진입", roleAt(close.roleOvrBias) === "5선발", roleAt(close.roleOvrBias));
  check("적대면 더 밀린다", roleAt(hostile.roleOvrBias) === "롱릴리프", roleAt(hostile.roleOvrBias));
}

// ── 10. 코치 전문 영역 어휘 일치 ──────────────────────────────
//
// 이 절이 있는 이유: `coach.specialty === "pitching"` 비교가 3곳에 있었는데
// 실제 데이터는 한국어 "투수"였다. 전부 조용히 false였고 그래서 **투수코치
// 능력치가 훈련 효율에 하나도 반영되지 않았다**(감독 능력치 P6-2와 같은 부류).
console.log("\n코치 전문 영역 어휘");
{
  const staffRules = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/players/staff_rules.json"), "utf8"));
  const seedNames = staffRules.rules.coach.specialties.map((x) => x.name);
  console.log(`    시드 전문영역: ${seedNames.join(" · ")}`);

  // TS 타입이 시드와 같은 어휘인가
  const saveSrc = fs.readFileSync(
    path.join(__dirname, "../apps/ui/src/shared/types/save.ts"), "utf8");
  const m = saveSrc.match(/export type CoachSpecialty =([^;]+);/);
  const tsNames = [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  check(`CoachSpecialty가 시드와 같은 ${seedNames.length}종`,
    tsNames.length === seedNames.length, `TS ${tsNames.length}종: ${tsNames.join(",")}`);
  const missing = seedNames.filter((n) => !tsNames.includes(n));
  check("시드의 모든 전문영역이 타입에 있다", missing.length === 0, missing.join(","));

  // training_area 매핑의 오른쪽이 실재하는 전문영역인가
  const relRules = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/players/relationship_rules.json"), "utf8"));
  const badTargets = Object.entries(relRules.training_area ?? {})
    .filter(([, area]) => !seedNames.includes(area))
    .map(([k, v]) => `${k}→${v}`);
  check("training_area가 실재 전문영역을 가리킨다", badTargets.length === 0, badTargets.join(" "));

  // 화면·로직에 영문 전문영역 비교가 남아 있지 않은가
  const files = [
    "../apps/ui/src/shared/usecases/advanceWeek.ts",
    "../apps/ui/src/shared/usecases/weekPhases/training.ts",
    "../apps/ui/src/pages/training/TrainingPage.svelte",
  ];
  const leaked = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(__dirname, rel), "utf8")
      .replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    if (/specialty\s*===\s*"(pitching|batting|fielding|running)"/.test(src)) {
      leaked.push(rel.replace("../apps/ui/src/", ""));
    }
  }
  check("영문 전문영역 비교가 남아 있지 않다", leaked.length === 0, leaked.join(" "));
}

// ── 11. 다시즌 실측 — 15시즌 커리어를 통째로 돌린다 ───────────
//
// 유닛테스트는 "한 시즌이 ±25인가"만 본다. 커리어 전체에서 값이 어디로 수렴하는지는
// 돌려봐야 안다 — 6B에서 "20시즌 후 감독 생존 45~55%"라고 예측했다가 실측 13%로
// 틀렸던 게 정확히 이 종류의 착오였다(_ledger P6-6). 그래서 숫자를 찍는다.
//
// 하네스(npm run harness)에 넣지 않은 이유: 하네스는 slot.db와 Rust만 돌고
// advanceWeek(TS)를 안 거친다. 거기서 관계 불변식을 검사하면 관계 행이 아예
// 없어서 **항상 통과하는 공허한 불변식**이 된다.
console.log("\n다시즌 실측 (15시즌)");
{
  const native = require("../packages/engine-native/index.js");
  const rules = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/players/relationship_rules.json"), "utf8"));

  // 결정적 의사난수 — Date.now()나 Math.random()을 쓰면 실측이 매번 달라진다
  let seed = 20260730;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const CAREER = [
    { team: "TEAM_HS_A",   seasons: 3, label: "고교" },
    { team: "TEAM_UNIV_A", seasons: 4, label: "대학" },
    { team: "TEAM_KBL_A",  seasons: 5, label: "프로" },
    { team: "TEAM_KBL_B",  seasons: 3, label: "이적" },
    // 친정 복귀 — **재회 경로를 실제로 밟는다.** 6C가 "감쇠 후 보존"을 택한 이유가
    // 이 지점이고, 안 밟으면 그 결정이 검증되지 않는다
    { team: "TEAM_KBL_A",  seasons: 2, label: "복귀" },
  ];

  /** 한 팀에서 만나는 사람들 — 감독1·구단주1·코치3·동료15 */
  function rosterOf(team) {
    return [
      { personId: `${team}_MGR`, kind: "manager" },
      { personId: `${team}_OWN`, kind: "owner" },
      ...[0, 1, 2].map((i) => ({ personId: `${team}_COA${i}`, kind: "coach" })),
      ...Array.from({ length: 15 }, (_, i) => ({ personId: `${team}_PLY${i}`, kind: "teammate" })),
    ];
  }
  const SPECIALTIES = ["투수", "타격", "컨디셔닝"];

  let rowsAll = new Map();   // personId → row
  let season = 2029;
  const events = { moved: 0, reunion: 0, seasonsRun: 0 };
  const perSeasonSwing = [];
  const reunionSnapshot = [];

  for (const leg of CAREER) {
    // ── 팀 이동: 감쇠 후 apart ──
    const leaving = [...rowsAll.values()].filter(
      (r) => r.contact === "together" && r.lastTeam !== leg.team);
    if (leaving.length > 0) {
      const dec = JSON.parse(native.relationMoveDecayNative(JSON.stringify({
        rules, rows: leaving.map((r) => ({ ...r, specialty: r.specialty ?? "" })),
      })));
      for (const d of dec.deltas) rowsAll.get(d.personId).value = d.value;
      for (const r of leaving) r.contact = "apart";
      events.moved += leaving.length;
    }

    // ── 새 팀 사람들 (없으면 초기값, apart였으면 재회) ──
    const roster = rosterOf(leg.team);
    const unknown = roster.filter((p) => !rowsAll.has(p.personId));
    if (unknown.length > 0) {
      const init = JSON.parse(native.initRelationsNative(JSON.stringify({
        worldSeed: 4242, rules, people: unknown, draftRound: 1, draftedContext: true,
      })));
      init.rows.forEach((r, i) => rowsAll.set(r.personId, {
        personId: r.personId, kind: r.kind, value: r.value, contact: "together",
        lastTeam: leg.team, metSeason: season,
        specialty: r.kind === "coach" ? SPECIALTIES[i % SPECIALTIES.length] : "",
      }));
    }
    for (const p of roster) {
      const row = rowsAll.get(p.personId);
      if (row.contact === "apart") {
        // **감쇠된 값에서 재개된다** — 0으로 리셋하지 않는다(사용자 확정)
        reunionSnapshot.push({ id: row.personId, at: row.value });
        row.contact = "together";
        events.reunion++;
      }
      row.lastTeam = leg.team;
    }

    // ── 시즌 진행 ──
    for (let sn = 0; sn < leg.seasons; sn++) {
      const before = rowsAll.get(`${leg.team}_MGR`).value;

      for (let wk = 1; wk <= 25; wk++) {
        const won = rnd() < 0.58;
        const era = 1.5 + rnd() * 4.0;
        const together = [...rowsAll.values()].filter((r) => r.contact === "together");
        const out = JSON.parse(native.weeklyRelationsNative(JSON.stringify({
          worldSeed: 4242, week: wk, rules,
          rows: together,
          ctx: {
            pitched: true, won, era,
            completeShutout: era < 0.5 && won,
            teamPlayed: true, teamWon: won,
            ovrDelta: rnd() < 0.15 ? 3 : 0,
            trainingDone: rnd() < 0.9,
            trainingSkipped: rnd() >= 0.9,
            trainingArea: SPECIALTIES[wk % SPECIALTIES.length],
            facedRivals: [],
          },
        })));
        for (const d of out.deltas) rowsAll.get(d.personId).value = d.value;
      }

      // 시즌 종료 — together 총평 + apart 감쇠
      const all = [...rowsAll.values()];
      const sOut = JSON.parse(native.seasonRelationsNative(JSON.stringify({
        rules, rows: all,
        era: 2.8 + rnd() * 2.0, teamRankPct: rnd(), pitchedAny: true,
      })));
      for (const d of sOut.deltas) rowsAll.get(d.personId).value = d.value;

      perSeasonSwing.push(rowsAll.get(`${leg.team}_MGR`).value - before);
      season++;
      events.seasonsRun++;
    }
  }

  // ── 실측 출력 ──
  const all = [...rowsAll.values()];
  const labelOf = (v) => {
    const b = JSON.parse(native.relationLabelTableNative())
      .find((x) => v >= x.min && v <= x.max);
    return b ? b.label : "?";
  };
  const dist = {};
  for (const r of all) dist[labelOf(r.value)] = (dist[labelOf(r.value)] ?? 0) + 1;

  const apart = all.filter((r) => r.contact === "apart");
  const together = all.filter((r) => r.contact === "together");
  const avgSwing = perSeasonSwing.reduce((a, b) => a + b, 0) / perSeasonSwing.length;

  console.log(`    ${events.seasonsRun}시즌 · 인물 ${all.length}명 (함께 ${together.length} · 헤어짐 ${apart.length})`);
  console.log(`    이동으로 감쇠 ${events.moved}건 · 재회 ${events.reunion}건`);
  console.log(`    라벨 분포: ${Object.entries(dist).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`    감독 관계 시즌당 순변화 평균 ${avgSwing.toFixed(1)}`);
  console.log(`    헤어진 관계 값: ${apart.map((r) => r.value).sort((a, b) => b - a).slice(0, 6).join(", ")}${apart.length > 6 ? " …" : ""}`);

  // ── 판정 ──
  check("값이 전부 범위 안", all.every((r) => r.value >= -100 && r.value <= 100),
    all.filter((r) => Math.abs(r.value) > 100).map((r) => r.value).join(","));

  check("이동 때마다 감쇠가 걸렸다", events.moved > 0, `${events.moved}`);

  // 한 팀에만 오래 있으면 전부 각별로 몰린다 — 그러면 라벨이 정보를 못 준다
  const closeRatio = (dist["각별"] ?? 0) / all.length;
  check("전원이 각별로 몰리지 않는다", closeRatio < 0.7,
    `각별 비율 ${(closeRatio * 100).toFixed(0)}%`);
  check("라벨이 2종 이상으로 갈린다", Object.keys(dist).length >= 2,
    Object.keys(dist).join(","));

  // 감쇠가 실제로 값을 낮추는가 — 헤어진 지 오래된 사람이 각별로 남아 있으면 안 된다
  const staleClose = apart.filter((r) => Math.abs(r.value) >= 65);
  check("오래 헤어진 관계가 각별로 굳어 있지 않다", staleClose.length === 0,
    staleClose.map((r) => `${r.personId}:${r.value}`).slice(0, 3).join(" "));

  // 시즌당 순변화가 "중간" 감각인가 (사용자 확정 ±25 언저리)
  check("시즌당 순변화가 폭주하지 않는다", Math.abs(avgSwing) < 45,
    `평균 ${avgSwing.toFixed(1)}`);

  check("헤어진 사람의 행이 보존된다", apart.length > 0, `${apart.length}`);

  // ── 재회 — 6C가 "감쇠 후 보존"을 택한 이유 그 자체 ──
  check("친정 복귀에서 재회가 일어났다", events.reunion > 0, `${events.reunion}건`);
  // **전원이 0이 아닐 것을 요구하지 않는다.** 완전히 식은 관계에서 재회하는 것도
  // 정상이다 — 그게 감쇠의 목적이다. 실제로 구단주는 주간 항목이 없고 시즌
  // 팀성적으로만 움직여서(6C-2 결정) 팀 순위가 중간이면 거의 안 쌓이고,
  // 헤어지면 빨리 0으로 식는다. 요구할 것은 "감쇠가 전부를 0으로 만들지는 않는다"다.
  const carried = reunionSnapshot.filter((x) => x.at !== 0).length;
  check("재회 대부분이 남은 값에서 재개된다 (전부 리셋이 아니다)",
    carried >= reunionSnapshot.length * 0.7,
    `${carried}/${reunionSnapshot.length}명만 값을 이어받음`);
  console.log(`    재회 시 이어받은 값: ${reunionSnapshot.slice(0, 6).map((x) => x.at).join(", ")} (0에서 재개 ${reunionSnapshot.length - carried}명)`);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
