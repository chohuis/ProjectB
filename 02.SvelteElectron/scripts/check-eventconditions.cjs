"use strict";
/**
 * 이벤트 조건이 **엔진이 아는 것인가** — `npm run check:eventconditions`
 *
 * 🔴 조건이 어긋나면 **조용히 이벤트를 영원히 막는다.**
 * `conditionEvaluator.evaluateCondition`의 switch에는 `default`가 없어서
 * 모르는 타입이 오면 `undefined`를 반환하고, `evaluateConditions`의
 * `every`가 그걸 false로 읽는다. 로그도 예외도 없다.
 * 파서도 안 막는다 — `parseEventRule`은 `raw.conditions`를 그대로 넘긴다.
 *
 * ⚠ **타입만 보면 절반만 잡는다.** 타입이 맞아도 **필드 이름이 틀리면** 같은 일이
 * 벌어진다. 실제로 `EVT_HS_COMMON_*` 21건이
 * `{"type":"career_stage","value":"highschool"}`이었다 — 평가기는 `cond.stage`를
 * 읽으므로 `undefined`와 비교해 **영원히 false**였고, 6시즌 실측에서 뜬 적도
 * 밀린 적도 없다. 그래서 타입별로 **어느 필드를 읽는지**까지 소스에서 뽑아 본다.
 *
 * ⚠ **정본은 `conditionEvaluator.ts`다.** 아는 타입·필드를 여기 또 적으면 두 벌이
 * 되고, 엔진이 늘어나도 검사만 옛 목록으로 돈다. 소스에서 읽는다.
 *
 * ⚠ **못 읽으면 던진다.** 정규식이 어긋나 0건을 읽고도 "이상 없음"을 찍은 적이
 * 있다 — 조용히 통과하는 검사가 제일 나쁘다.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const MASTER = path.join(ROOT, "resource/data/master");
const EVALUATOR = path.join(ROOT, "apps/ui/src/shared/utils/conditionEvaluator.ts");

/** evaluateCondition의 switch 본문만 잘라 온다 */
function evaluatorScope() {
  const src = fs.readFileSync(EVALUATOR, "utf8");
  const from = src.indexOf("switch (cond.type)");
  if (from === -1) throw new Error("[check-eventconditions] evaluateCondition의 switch를 못 찾았다");
  const body = src.slice(from);
  const end = body.indexOf("export function evaluateConditions");
  return end === -1 ? body : body.slice(0, end);
}

const CASE_RE = /case\s+"([a-z0-9_]+)"\s*:/g;
const FIELD_RE = /\bcond\.([a-zA-Z0-9_]+)/g;

/** 타입 → 그 case가 읽는 `cond.X` 필드 이름 집합 */
function knownFields() {
  const scope = evaluatorScope();
  const marks = [...scope.matchAll(CASE_RE)];
  if (marks.length === 0) throw new Error("[check-eventconditions] case를 하나도 못 읽었다 — 검사가 눈이 멀었다");

  const out = new Map();
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i][0].length;
    const stop = i + 1 < marks.length ? marks[i + 1].index : scope.length;
    const chunk = scope.slice(start, stop);
    const fields = new Set([...chunk.matchAll(FIELD_RE)].map((m) => m[1]));
    fields.delete("type");
    out.set(marks[i][1], fields);
  }
  // 연속 case(`team_rank_lte:` `team_rank_gte:`)는 본문이 비어 있다 — 뒤 블록을 물려받는다
  const keys = [...out.keys()];
  for (let i = keys.length - 2; i >= 0; i--) {
    if (out.get(keys[i]).size === 0) out.set(keys[i], out.get(keys[i + 1]));
  }
  return out;
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

function loadRules() {
  const rules = [];
  for (const lane of ["mandatory", "conditional", "random"]) {
    for (const f of walk(path.join(MASTER, "events", lane)).filter((f) => f.endsWith(".json"))) {
      rules.push({ file: path.relative(ROOT, f), ...JSON.parse(fs.readFileSync(f, "utf8")) });
    }
  }
  // 레거시 스텁도 본다 — `_manifest.json`이 없으면 저쪽이 돈다
  for (const lane of ["mandatory", "conditional", "random"]) {
    const p = path.join(MASTER, "events/rules", `${lane}.json`);
    if (!fs.existsSync(p)) continue;
    for (const r of JSON.parse(fs.readFileSync(p, "utf8")).events ?? []) {
      rules.push({ file: path.relative(ROOT, p), ...r });
    }
  }
  if (rules.length === 0) throw new Error("[check-eventconditions] 규칙을 하나도 못 읽었다");
  return rules;
}

function report(title, list, extra) {
  console.log(`  FAIL  ${title} ${list.length}개 — **영원히 안 뜬다**`);
  const byType = {};
  for (const b of list) (byType[b.type] ??= []).push(b);
  for (const [t, xs] of Object.entries(byType)) {
    console.log(`    "${t}" — ${xs.length}건${extra ? extra(xs[0]) : ""}`);
    for (const b of xs.slice(0, 6)) console.log(`        ${String(b.id).padEnd(32)} ${b.cond}`);
    if (xs.length > 6) console.log(`        … 외 ${xs.length - 6}건`);
  }
}

function main() {
  const fields = knownFields();
  const rules = loadRules();

  const unknown = [];   // 엔진이 모르는 타입
  const shape = [];     // 타입은 맞는데 평가기가 읽는 필드가 없다
  const used = new Map();

  for (const r of rules) {
    // 🔴 **히든의 숨은 조건도 본다** (2026-09-08 · §4). 평가는 `conditions` 와
    //   똑같고 화면에만 안 보인다 — 여기서 안 재면 히든 조건의 오타가
    //   **뜨지 않는 이벤트**가 되고, 히든은 원래 잘 안 떠서 아무도 못 알아챈다.
    for (const c of [...(r.conditions ?? []), ...(r.hiddenCondition ?? [])]) {
      const t = c && c.type;
      used.set(t, (used.get(t) ?? 0) + 1);
      const row = { id: r.id, file: r.file, type: t, cond: JSON.stringify(c) };
      if (!fields.has(t)) { unknown.push(row); continue; }
      const want = fields.get(t);
      // 평가기가 읽는 필드 중 **하나도** 안 들어 있으면 그 조건은 늘 false다
      if (want.size > 0 && ![...want].some((k) => c[k] !== undefined)) {
        shape.push({ ...row, want: [...want].join("|") });
      }
    }
  }

  const total = [...used.values()].reduce((a, b) => a + b, 0);
  console.log(`[이벤트 조건] 규칙 ${rules.length}건 · 조건 ${total}개`);
  console.log(`  엔진이 아는 타입 ${fields.size}종 · 데이터가 쓰는 타입 ${used.size}종`);
  const unusedTypes = [...fields.keys()].filter((t) => !used.has(t)).sort();
  if (unusedTypes.length) {
    console.log(`  ⓘ 엔진엔 있는데 아무 이벤트도 안 쓰는 타입 ${unusedTypes.length}종: ${unusedTypes.join(" ")}`);
  }

  if (unknown.length === 0 && shape.length === 0) {
    console.log("  ok  모르는 조건 타입도, 필드가 어긋난 조건도 없다");
    process.exit(0);
  }
  if (unknown.length) report("엔진이 모르는 조건", unknown);
  if (shape.length) report("평가기가 읽는 필드가 없는 조건", shape, (b) => ` · 평가기는 cond.${b.want} 를 읽는다`);
  process.exit(1);
}

main();
