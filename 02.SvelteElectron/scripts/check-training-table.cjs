#!/usr/bin/env node
// ── 훈련 프로그램 표는 하나여야 한다 ──────────────────────────────
//
//   npm run check:trainingtable
//
// 예전엔 같은 표가 **네 곳**에 있었다:
//
//   ① resource/data/master/training/programs_pitcher.json      구버전 id 8종
//   ② packages/engine-native/src/growth_engine.rs get_program()  하드코딩 24종
//   ③ apps/ui/src/pages/training/TrainingPage.svelte           하드코딩 12종
//   ④ apps/ui/src/pages/schedule/SchedulePage.svelte           PROGRAM_TITLE
//
// 넷이 서로 달라서 화면은 "피로 +7"이라 하고 엔진은 −4.25를 적용했다.
// ④의 id는 **전부 구버전이라** 일정 화면에 `TRN_CTRL_CMD` 원문이 떠 있었다.
//
// Phase 1에서 `programs.json` 하나로 모았다. **이 게이트의 목적은 대조가
// 아니라 재발 방지다** — 표가 다시 늘어나거나 배선이 끊기면 실패한다.
//
// 설계: docs/design/training.md §3-1

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const log = (s) => process.stdout.write(s + "\n");

let failed = 0;
const check = (name, ok, detail) => {
  log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : "  — " + detail}`);
  if (!ok) failed++;
};

log("");
log("── 훈련 프로그램 표 ──────────────────────────────────────");

// ── ① 정본이 읽히는가 ────────────────────────────────────────
const master = JSON.parse(read("resource/data/master/training/programs.json"));
const programs = master.programs ?? [];
check("정본 programs.json을 읽었다", programs.length > 0, `${programs.length}종`);
log(`      ${programs.length}종 · ${programs.map((p) => p.id).join(", ")}`);

// 필수 필드가 빠지면 Rust 역직렬화가 **표 전체** 실패다 — 여기서 먼저 잡는다
const REQUIRED = ["id", "name", "playerType", "focus", "focusLabel", "gainsLabel",
  "baseXp", "fatigueCost", "conditionCost"];
const missingField = [];
for (const p of programs) {
  for (const f of REQUIRED) if (p[f] === undefined) missingField.push(`${p.id ?? "?"}.${f}`);
}
check("모든 프로그램에 필수 필드가 있다", missingField.length === 0, missingField.join(", "));

// ── ② 표가 다시 늘어나지 않았는가 ────────────────────────────
const rust = read("packages/engine-native/src/growth_engine.rs");
const rustTable = [...rust.matchAll(/"(TRN_[A-Z_]+)"\s*=>/g)].map((m) => m[1]);
check("Rust에 프로그램 표가 없다", rustTable.length === 0,
  `하드코딩 ${rustTable.length}종이 돌아왔다: ${rustTable.slice(0, 5).join(", ")}`);

const trainPage = read("apps/ui/src/pages/training/TrainingPage.svelte");
const screenTable = [...trainPage.matchAll(/id:\s*"(TRN_[A-Z_]+)"[^}]*?fatigue:/g)].map((m) => m[1]);
check("훈련 화면에 프로그램 표가 없다", screenTable.length === 0,
  `하드코딩 ${screenTable.length}종이 돌아왔다`);

const schedPage = read("apps/ui/src/pages/schedule/SchedulePage.svelte");
// ⚠ **선언만 본다.** 그냥 `includes("PROGRAM_TITLE")`로 했더니 "예전에
// PROGRAM_TITLE이 있었다"고 적은 **주석에 스스로 걸렸다.** 왜 없앴는지를
// 적어두는 건 남겨야 하므로, 잡을 것은 선언이다.
check("일정 화면에 이름표 선언이 없다",
  !/const\s+PROGRAM_TITLE\s*[:=]/.test(schedPage),
  "PROGRAM_TITLE 선언이 돌아왔다");
check("일정 화면이 deprecated 필드를 안 읽는다",
  !schedPage.includes("plan.recoveryProgramId"),
  "recoveryProgramId를 읽고 있다 — 슬롯은 셋인데 죽은 필드를 본다");

// ── ③ 화면이 쓰는 id가 전부 정본에 있는가 ────────────────────
// 기본값·코치 조언이 정본에 없는 id를 쓰면 focus 조회가 조용히 죽는다.
// **이게 이 시스템을 망가뜨린 결함이다** — 12종 중 10종이 마스터에 없었다.
const ids = new Set(programs.map((p) => p.id));
// ⚠ 화면만 보면 안 된다. `runAutoAdvance`의 훈련 추천도 프로그램 id를
// **하드코딩**한다 — id가 바뀌면 추천이 조용히 아무 프로그램도 안 가리킨다.
const autoRun = read("apps/ui/src/shared/usecases/runAutoAdvance.ts");
const usedInUi = new Set([
  ...[...trainPage.matchAll(/"(TRN_[A-Z_]+)"/g)].map((m) => m[1]),
  ...[...autoRun.matchAll(/"(TRN_[A-Z_]+)"/g)].map((m) => m[1]),
]);
const unknown = [...usedInUi].filter((id) => !ids.has(id));
check("화면이 쓰는 id가 전부 정본에 있다", unknown.length === 0,
  `정본에 없는 id: ${unknown.join(", ")}`);

// ── ④ 배선이 이어지는가 ──────────────────────────────────────
const advanceWeek = read("apps/ui/src/shared/usecases/advanceWeek.ts");
check("엔진 호출에 프로그램 표를 넘긴다",
  /calcTrainingGrowth\([\s\S]{0,200}trainingPrograms/.test(advanceWeek),
  "표를 안 넘기면 Rust 역직렬화가 실패한다");

// focus가 코치 담당영역으로 안 이어지면 관계·훈련 효율 보너스가 조용히 죽는다
const relRules = JSON.parse(read("resource/data/master/players/relationship_rules.json"));
const areaMap = relRules.training_area ?? {};
// ⚠ **예외를 목록으로 적는다.** 그냥 통과시키면 다음에 매핑이 하나 더 빠져도
// 안 보인다. 코치 전문영역은 투수·타격·주루·컨디셔닝·멘탈 다섯뿐이고
// **수비 코치라는 것이 없다** — 그래서 `defense`만 매핑이 없는 게 정상이다.
const AREA_EXEMPT = { defense: "코치 전문영역에 '수비'가 없다 (staff_rules 다섯 종)" };
const unmapped = programs
  .filter((p) => !areaMap[p.focus] && !AREA_EXEMPT[p.focus])
  .map((p) => `${p.id}(${p.focus})`);
check("모든 focus가 코치 담당영역에 매핑된다", unmapped.length === 0,
  `매핑 없음: ${unmapped.join(", ")}`);
for (const [f, why] of Object.entries(AREA_EXEMPT)) log(`      (예외 ${f}: ${why})`);

// ── ⑤ 화면이 엔진 식을 다시 구현하지 않는가 (Phase 2) ────────
//
// 훈련 화면이 자체 식으로 예상 피로·컨디션·부상위험을 냈고 셋 다 엔진과
// 달랐다. 화면은 "피로 +7", 엔진은 −4.25 — 부호가 반대였다.
// ⚠ 주석에 남긴 옛 식까지 잡으면 "왜 없앴는지"를 못 적는다. **코드 줄만** 본다
const codeLines = trainPage.split("\n").filter((l) => !l.trim().startsWith("//"));
const trainCode = codeLines.join("\n");

const RECOMPUTE = [
  [/realCondition\s*-\s*Math\.max\(0,\s*finalFatigueDelta\)/, "컨디션을 화면이 다시 계산한다"],
  [/projectedFatigue\s*-\s*60\)\s*\*\s*0\.8/, "부상위험을 화면이 다시 계산한다"],
  [/rawFatigueDelta\s*\*\s*coachMod\.fatigue/, "피로에 화면만의 코치·시설 보정을 건다"],
];
for (const [re, why] of RECOMPUTE) {
  check(`화면이 엔진 식을 복제하지 않는다 — ${why}`, !re.test(trainCode), why);
}
check("훈련 화면이 엔진 미리보기를 쓴다", /previewTraining\(/.test(trainCode),
  "previewTraining을 안 부른다 — 그러면 화면이 자기 식을 갖고 있다는 뜻이다");
check("부상위험도 엔진에서 받는다", /injuryChance\(/.test(trainCode),
  "injuryChance를 안 부른다");
log("");
if (failed > 0) {
  log(`훈련 표 점검 실패 ${failed}건`);
  log("설계: docs/design/training.md §3-1");
} else {
  log("훈련 표 점검 통과 — 정본이 하나다");
}
process.exit(failed > 0 ? 1 : 0);
