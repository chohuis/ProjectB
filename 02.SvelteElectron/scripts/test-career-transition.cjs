"use strict";
// 선수 커리어 전이 규칙 검증 (Phase 6B 보강)
// 실행: npm run test:career
//
// 학적은 되돌릴 수 없다. 고교 재입학·대학 두 번 입학·프로에서 학교 복귀는 전부 불가다.
// 실제로 도달 가능한 결함이 있었다: isUnivResultWeek가 대학 재학생·독립 소속에도
// 발동하면서 universityChoices를 그대로 처리해 대학 두 번 입학이 성립했다.
//
// careerTransition.ts는 순수 TS라 CJS에서 import할 수 없어 **소스에서 표를 파싱**해
// 규칙을 검증한다. 완벽하진 않지만 되돌림은 잡는다.

const path = require("node:path");
const fs = require("node:fs");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const SRC = fs.readFileSync(
  path.join(__dirname, "../apps/ui/src/shared/utils/careerTransition.ts"), "utf8");

// ── 표 파싱 ───────────────────────────────────────────────────
const tableBlock = SRC.match(/const ALLOWED: Record<CareerStage, CareerStage\[\]> = \{([\s\S]*?)\n\};/);
if (!tableBlock) {
  console.error("FAIL  ALLOWED 표를 못 찾음 — careerTransition.ts 구조가 바뀌었다");
  process.exit(1);
}
const ALLOWED = {};
for (const line of tableBlock[1].split(/\r?\n/)) {
  const m = line.match(/^\s*(\w+):\s*\[([^\]]*)\]/);
  if (!m) continue;
  ALLOWED[m[1]] = [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1]);
}

const STAGES = ["highschool", "university", "independent", "pro", "pro_kbl", "pro_abl", "pro_jbl", "military"];
const PRO = ["pro", "pro_kbl", "pro_abl", "pro_jbl"];

console.log("전이 허용표");
for (const st of STAGES) {
  console.log(`    ${st.padEnd(12)} → ${(ALLOWED[st] ?? []).join(", ") || "(없음)"}`);
}
console.log("");

check("8개 단계 전부 표에 있다", STAGES.every((s) => ALLOWED[s] !== undefined),
  STAGES.filter((s) => ALLOWED[s] === undefined).join(","));

const can = (from, to) => from === to || (ALLOWED[from] ?? []).includes(to);

// ── 허용돼야 하는 전이 ────────────────────────────────────────
console.log("허용되어야 하는 전이");
const MUST_ALLOW = [
  ["highschool", "university", "고교 → 대학 (진학)"],
  ["highschool", "independent", "고교 → 독립"],
  ["highschool", "pro_kbl", "고교 → 프로 (드래프트 지명)"],
  ["highschool", "military", "고교 → 현역 입대 (전원 탈락)"],
  ["university", "pro_kbl", "대학 → 프로 (1~4학년 매년 신청)"],
  ["university", "independent", "대학 → 독립 (미지명 대안)"],
  ["university", "military", "대학 → 입대"],
  ["independent", "pro_kbl", "독립 → 프로 (매년 재지원)"],
  ["independent", "military", "독립 → 입대"],
  ["pro_kbl", "pro_abl", "KBL → ABL (해외 진출)"],
  ["pro_kbl", "pro_jbl", "KBL → JBL"],
  ["pro_abl", "pro_kbl", "ABL → KBL (복귀)"],
  ["pro_kbl", "independent", "프로 → 독립 (방출 후 재도전)"],
  ["pro_kbl", "military", "프로 → 입대"],
];
for (const [from, to, label] of MUST_ALLOW) {
  check(`  ${label}`, can(from, to), `${from} → ${to} 막혀 있다`);
}

// ── 막혀야 하는 전이 ──────────────────────────────────────────
console.log("\n막혀야 하는 전이 (학적 역행)");
const MUST_BLOCK = [
  ["highschool", "highschool", "고교 재입학"],   // 같은 단계는 can()이 true를 주지만
  ["university", "university", "대학 두 번 입학 ← 실제로 가능했던 결함"],
  ["independent", "university", "독립 → 대학 ← 실제로 가능했던 결함"],
  ["independent", "highschool", "독립 → 고교"],
  ["pro_kbl", "university", "프로 → 대학"],
  ["pro_kbl", "highschool", "프로 → 고교"],
  ["pro_abl", "university", "ABL → 대학"],
  ["university", "highschool", "대학 → 고교"],
  ["military", "highschool", "군 → 고교 (복학은 militaryHiatusStage로만)"],
  ["military", "university", "군 → 대학"],
  ["military", "pro_kbl", "군 → 프로 (전역은 별도 경로)"],
];
for (const [from, to, label] of MUST_BLOCK) {
  // 같은 단계 유지(재계약)는 전이가 아니라 허용이므로 표에서만 확인한다
  const inTable = (ALLOWED[from] ?? []).includes(to);
  check(`  ${label}`, !inTable, `${from} 표에 ${to}가 들어 있다`);
}

// ── 구조적 성질 ───────────────────────────────────────────────
console.log("\n구조적 성질");
check("어떤 단계도 highschool로 갈 수 없다",
  STAGES.every((s) => !(ALLOWED[s] ?? []).includes("highschool")),
  STAGES.filter((s) => (ALLOWED[s] ?? []).includes("highschool")).join(","));
check("university로 갈 수 있는 건 highschool뿐",
  STAGES.filter((s) => (ALLOWED[s] ?? []).includes("university")).join(",") === "highschool",
  STAGES.filter((s) => (ALLOWED[s] ?? []).includes("university")).join(","));
check("university 자신은 university로 못 간다 (두 번 입학)",
  !(ALLOWED.university ?? []).includes("university"));
check("military에서 나가는 전이는 표에 없다 (militaryHiatusStage 전용)",
  (ALLOWED.military ?? []).length === 0, (ALLOWED.military ?? []).join(","));
check("모든 비-military 단계는 military로 갈 수 있다",
  STAGES.filter((s) => s !== "military").every((s) => (ALLOWED[s] ?? []).includes("military")));
check("프로 4종은 서로 오갈 수 있다",
  PRO.every((a) => PRO.every((b) => a === b || (ALLOWED[a] ?? []).includes(b))));

// ── 호출부에 가드가 실제로 있는가 ─────────────────────────────
console.log("\n호출부 가드");
const files = {
  "game.ts applyDraftDecision": "../apps/ui/src/shared/stores/game.ts",
  "advanceWeek 진로 결과": "../apps/ui/src/shared/usecases/advanceWeek.ts",
  "진로 신청 허브": "../apps/ui/src/features/career/ui/CareerChoiceHubModal.svelte",
  "진로 결과 모달": "../apps/ui/src/features/career/ui/CareerResultModal.svelte",
  "드래프트 알림 모달": "../apps/ui/src/features/contract/ui/DraftNotificationModal.svelte",
};
for (const [label, rel] of Object.entries(files)) {
  const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
  check(`  ${label} 가 careerTransition 을 쓴다`,
    /careerTransition|transitionReason|canApplyTo/.test(src),
    "가드 없음");
}
{
  const g = fs.readFileSync(path.join(__dirname, files["game.ts applyDraftDecision"]), "utf8");
  check("  applyDraftDecision 이 거부 시 상태를 안 건드린다",
    /transitionReason[\s\S]{0,400}return s;/.test(g),
    "거부 경로가 return s 로 끝나지 않는다");
}
{
  const hub = fs.readFileSync(path.join(__dirname, files["진로 신청 허브"]), "utf8");
  check("  허브가 !isIndependent 대신 단계 규칙으로 판정",
    /\{#if canUniv\}/.test(hub) && /\{#if canIndie\}/.test(hub),
    "구 !isIndependent 조건이 남아 있다");
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
