#!/usr/bin/env node
// ── 훈련 프로그램 표는 하나여야 한다 (Phase 1 게이트) ─────────────
//
//   npm run check:trainingtable
//
// 지금 같은 표가 **네 곳**에 있고 넷 다 다르다:
//
//   ① resource/data/master/training/programs_pitcher.json      구버전 id 8종
//   ② packages/engine-native/src/growth_engine.rs get_program()  ← 실제 계산
//   ③ apps/ui/src/pages/training/TrainingPage.svelte           하드코딩 12종
//   ④ apps/ui/src/pages/schedule/SchedulePage.svelte           PROGRAM_TITLE (이름만)
//
// 그래서 화면은 "피로 +7"이라 하고 엔진은 −4.25를 적용한다. **부호가 반대다.**
// 그리고 화면이 저장하는 id 12개 중 10개가 마스터에 없어서 `focus` 조회가
// 조용히 실패하고, 코치 담당영역 관계와 훈련 효율 보너스가 안 붙는다.
//
// ⚠ **이 게이트는 지금 실패한다. 통과시키는 게 Phase 1의 정의다.**
// vitest에 넣지 않은 이유: 회귀 기준선("482 통과")이 무의미해진다.
// 여기 실패는 "아직 안 한 일"이고 vitest 실패는 "내가 깨뜨린 것"이라
// 둘을 섞으면 둘 다 신호가 안 된다.
//
// 설계: docs/design/training.md

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

/** ① 마스터 데이터 */
function masterTable() {
  const j = JSON.parse(read("resource/data/master/training/programs_pitcher.json"));
  return new Map((j.programs ?? []).map((p) => [p.id, p.fatigueCost]));
}

/** ② Rust — 실제로 도는 값 */
function engineTable() {
  const s = read("packages/engine-native/src/growth_engine.rs");
  const out = new Map();
  for (const m of s.matchAll(
    /"(TRN_[A-Z_]+)"\s*=>\s*Some\(ProgramConfig \{[^}]*?fatigue_cost:\s*(-?[\d.]+)/g,
  )) out.set(m[1], Number(m[2]));
  return out;
}

/** ③ 훈련 화면 하드코딩 */
function screenTable() {
  const s = read("apps/ui/src/pages/training/TrainingPage.svelte");
  const out = new Map();
  for (const m of s.matchAll(/id:\s*"(TRN_[A-Z_]+)"[^}]*?fatigue:\s*(-?\d+)/g))
    out.set(m[1], Number(m[2]));
  return out;
}

log("");
log("── 훈련 프로그램 표 대조 ─────────────────────────────────");

const master = masterTable();
const engine = engineTable();
const screen = screenTable();

// ⚠ **읽었는지부터 본다.** 정규식이 어긋나면 0건이 되고, 0건은 "차이 없음"과
// 구분이 안 돼서 게이트가 조용히 통과한다 — 그게 제일 나쁜 실패다.
check("세 표를 실제로 읽었다",
  master.size > 0 && engine.size > 0 && screen.size > 0,
  `마스터 ${master.size} · 엔진 ${engine.size} · 화면 ${screen.size}`);

log(`      마스터 ${master.size}종 · 엔진 ${engine.size}종 · 화면 ${screen.size}종`);

const missingInEngine = [...screen.keys()].filter((id) => !engine.has(id));
check("화면 id가 전부 엔진에 있다", missingInEngine.length === 0,
  `엔진에 없음: ${missingInEngine.join(", ")}`);

const missingInMaster = [...screen.keys()].filter((id) => !master.has(id));
check("화면 id가 전부 마스터에 있다 (focus 조회)", missingInMaster.length === 0,
  `마스터에 없음 ${missingInMaster.length}종: ${missingInMaster.join(", ")}`);

const diffScreen = [];
for (const [id, f] of screen) {
  const e = engine.get(id);
  if (e !== undefined && Math.abs(f - e) > 0.001) diffScreen.push(`${id} 화면 ${f}/엔진 ${e}`);
}
check("화면과 엔진의 피로 수치가 같다", diffScreen.length === 0,
  `${diffScreen.length}종 어긋남`);
for (const d of diffScreen) log(`        ${d}`);

const diffMaster = [];
for (const [id, f] of master) {
  const e = engine.get(id);
  if (e !== undefined && Math.abs(f - e) > 0.001) diffMaster.push(`${id} 마스터 ${f}/엔진 ${e}`);
}
check("마스터와 엔진의 피로 수치가 같다", diffMaster.length === 0,
  `${diffMaster.length}종 어긋남`);
for (const d of diffMaster) log(`        ${d}`);

log("");
if (failed > 0) {
  log(`훈련 표 대조 실패 ${failed}건 — Phase 1이 이걸 0으로 만든다`);
  log("설계: docs/design/training.md §3-1");
} else {
  log("훈련 표 대조 통과 — 정본이 하나다");
}
process.exit(failed > 0 ? 1 : 0);
