#!/usr/bin/env node
/**
 * **칸별 이벤트 재고.** 어느 무대에 이야기가 몇 개나 있나.
 *
 *   node scripts/measure-eventslots.cjs
 *
 * ⚠ **돌려서 세지 않는다. 데이터를 읽는다.** 실행 계측은 커리어 경로가
 * 갈려서 "그 칸에 뭐가 있나"를 못 답한다 — 안 간 무대는 0으로 나온다.
 *
 * ⚠ 한 규칙이 여러 칸에 걸칠 수 있다(연차 밴드가 `이상`뿐이라 겹친다).
 * 그래서 밴드 합이 칸 합계와 다르다.
 */
const fs = require("node:fs");
const path = require("node:path");
const M = "resource/data/master/events";

const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const R = [];
for (const lane of ["mandatory", "conditional", "random"]) {
  for (const f of walk(path.join(M, lane)).filter((x) => x.endsWith(".json"))) {
    R.push({ lane, ...JSON.parse(fs.readFileSync(f, "utf8")) });
  }
}

const C = (r, t) => (r.conditions ?? []).find((c) => c.type === t);
/**
 * 그 규칙이 속한 무대들. `career_stage`는 `stage` 하나 또는 `stages` 배열이다
 * — 프로 세 리그를 한 번에 가리키려고 배열을 열었다(2026-08-25).
 */
const stagesOf = (r) => {
  const c = C(r, "career_stage");
  if (!c) return [];
  return Array.isArray(c.stages) ? c.stages : c.stage ? [c.stage] : [];
};
const stage = (r) => { const a = stagesOf(r); return a.length === 1 ? a[0] : null; };
/** 그 무대에 속하나 — 배열이면 포함 여부 */
const inStage = (r, s) => stagesOf(r).includes(s);
/** 무대를 아예 안 가리는가 (진짜 전체 공용) */
const noStage = (r) => stagesOf(r).length === 0;
/** 군은 `career_stage`가 아니라 `militaryStatus` 경로로 갈린다 */
const isArmy = (r) => (r.conditions ?? []).some((c) => c.path === "militaryStatus");
/**
 * 그 규칙이 걸린 리그들. `league_id`는 `leagueId` 하나 또는 `leagueIds` 배열이다
 * — 세 리그 2군을 한 번에 가리키려고 열었다(2026-08-26).
 */
const leaguesOf = (r) => {
  const c = C(r, "league_id");
  if (!c) return [];
  return Array.isArray(c.leagueIds) ? c.leagueIds : c.leagueId ? [c.leagueId] : [];
};
const league = (r) => { const a = leaguesOf(r); return a.length === 1 ? a[0] : null; };
/** 그 리그에 걸리나 — 배열이면 포함 여부 */
const inLeague = (r, l) => leaguesOf(r).includes(l);
const hasPath = (r, p) => (r.conditions ?? []).some((c) => c.path === p);
const gradeOf = (r) => C(r, "grade")?.value ?? null;

/** 대학 학년 — `grade`는 입학 때 1로 박히고 안 오른다. `school.universityWeek`가 정본 */
function uniYear(r) {
  const cs = (r.conditions ?? []).filter((c) => c.path === "school.universityWeek");
  if (!cs.length) return null;
  const lo = Math.max(...cs.filter((c) => c.type === "num_gte").map((c) => c.value), 0);
  return Math.min(4, Math.floor(lo / 52) + 1);
}

/** 프로 연차 밴드 — 후보 A (사용자 확정 2026-08-24) */
const BANDS = [["초기", 1, 3], ["중기", 4, 8], ["말기", 9, 99]];
function yearRange(r, key) {
  let lo = null, hi = null;
  const g = C(r, "pro_year_gte");
  if (g && key === "proServiceYears") lo = g.value;
  for (const c of r.conditions ?? []) {
    if (c.type === "num_gte" && c.path === key) lo = Math.max(lo ?? 0, c.value);
    if (c.type === "num_lte" && c.path === key) hi = hi === null ? c.value : Math.min(hi, c.value);
  }
  return { lo, hi };
}
function inBand(r, key, from, to) {
  const { lo, hi } = yearRange(r, key);
  if (lo === null && hi === null) return null;
  if (lo !== null && lo > to) return false;
  if (hi !== null && hi < from) return false;
  return true;
}

const lanes = (l) => {
  const h = { mandatory: 0, conditional: 0, random: 0 };
  for (const r of l) h[r.lane]++;
  return `${String(h.mandatory).padStart(3)}/${String(h.conditional).padStart(3)}/${String(h.random).padStart(3)}`;
};
/** 그 칸이 쓰는 보상 어휘 — 0회짜리가 어디서 비는지 본다 */
const DEC = new Map(JSON.parse(fs.readFileSync(
  "resource/data/master/messages/decision_templates.json", "utf8")).decisions.map((d) => [d.id, d]));
function vocab(list) {
  let money = 0, rel = 0, tag = 0;
  for (const r of list) {
    for (const o of DEC.get(r.decisionTemplateId)?.options ?? []) {
      const e = o.effects;
      if (Array.isArray(e)) {
        for (const s of e) {
          const k = s.slice(0, s.indexOf(":"));
          if (k === "money" || k.startsWith("luxury")) money++;
          else if (k.startsWith("relation.")) rel++;
          else if (k === "addTag") tag++;
        }
      } else if (e) {
        if (e.moneyDelta || e.luxurySpend) money++;
        if (e.relationDelta) rel++;
        if (e.addTag) tag++;
      }
    }
  }
  return `${String(money).padStart(4)}${String(rel).padStart(5)}${String(tag).padStart(4)}`;
}

const SLOTS = [
  ["전체 공용",        (r) => noStage(r) && leaguesOf(r).length === 0 && !isArmy(r)],
  [null],
  ["고교 전체 공용",   (r) => inStage(r, "highschool") && gradeOf(r) === null],
  ["  고교 1학년",     (r) => inStage(r, "highschool") && gradeOf(r) === 1],
  ["  고교 2학년",     (r) => inStage(r, "highschool") && gradeOf(r) === 2],
  ["  고교 3학년",     (r) => inStage(r, "highschool") && gradeOf(r) === 3],
  [null],
  ["대학 전체 공용",   (r) => inStage(r, "university") && uniYear(r) === null],
  ["  대학 1학년",     (r) => uniYear(r) === 1],
  ["  대학 2학년",     (r) => uniYear(r) === 2],
  ["  대학 3학년",     (r) => uniYear(r) === 3],
  ["  대학 4학년",     (r) => uniYear(r) === 4],
  [null],
  ["독립 전체 공용",   (r) => inStage(r, "independent")],
  [null],
  ["KBL 1군 공용",     (r) => inStage(r, "pro_kbl") && leaguesOf(r).length === 0 && inBand(r, "proServiceYears", 1, 99) === null],
  ["  KBL 초기 1~3",   (r) => inStage(r, "pro_kbl") && leaguesOf(r).length === 0 && inBand(r, "proServiceYears", 1, 3) === true],
  ["  KBL 중기 4~8",   (r) => inStage(r, "pro_kbl") && leaguesOf(r).length === 0 && inBand(r, "proServiceYears", 4, 8) === true],
  ["  KBL 말기 9~",    (r) => inStage(r, "pro_kbl") && leaguesOf(r).length === 0 && inBand(r, "proServiceYears", 9, 99) === true],
  ["KBL 2군",          (r) => inLeague(r, "LEAGUE_KBL_FARM")],
  [null],
  ["ABL 1군",          (r) => inStage(r, "pro_abl")],
  ["ABL 2군",          (r) => inLeague(r, "LEAGUE_ABL_FARM")],
  ["JBL 1군",          (r) => inStage(r, "pro_jbl")],
  ["JBL 2군",          (r) => inLeague(r, "LEAGUE_JBL_FARM")],
  [null],
  ["군 · 상무", (r) => (r.conditions ?? []).some((c) => c.path === "militaryUnit" && c.value === "sports")],
  ["군 · 현역", (r) => (r.conditions ?? []).some((c) => c.path === "militaryUnit" && c.value === "general")],
  ["군 · 공통", (r) => (r.conditions ?? []).some((c) => c.path === "militaryStatus")
    && !(r.conditions ?? []).some((c) => c.path === "militaryUnit")],
];

const log = (s) => process.stdout.write(s + "\n");

/** 무대 하나 = 그 무대의 모든 규칙. 무대를 다 더하면 전체가 나와야 한다 */
const STAGES = [
  ["전체 공용", (r) => noStage(r) && leaguesOf(r).length === 0 && !isArmy(r)],
  ["고교",      (r) => inStage(r, "highschool")],
  ["대학",      (r) => inStage(r, "university")],
  ["독립",      (r) => inStage(r, "independent")],
  ["KBL 1군",   (r) => inStage(r, "pro_kbl") && leaguesOf(r).length === 0],
  ["KBL 2군",   (r) => inLeague(r, "LEAGUE_KBL_FARM")],
  ["ABL",       (r) => inStage(r, "pro_abl") || inLeague(r, "LEAGUE_ABL_FARM")],
  ["JBL",       (r) => inStage(r, "pro_jbl") || inLeague(r, "LEAGUE_JBL_FARM")],
  ["군",        (r) => isArmy(r)],
];

log("");
log(`  이벤트 ${R.length}종`);
log("");
log("  칸                     종수   필수/조건/랜덤    돈  관계  태그");
log("  " + "─".repeat(62));
for (const [label, pick] of SLOTS) {
  if (label === null) { log(""); continue; }
  const list = R.filter(pick);
  log(`  ${label.padEnd(20)}${String(list.length).padStart(5)}   ${lanes(list)}   ${vocab(list)}`);
}
log("  " + "─".repeat(62));

// ── 검산. 무대별로 갈라 다 더하면 전체가 나와야 한다.
//    안 맞으면 **어느 칸에도 안 잡히는 규칙이 있다**는 뜻이고, 그건
//    화면엔 뜨는데 이 표에선 안 보인다는 소리다
log("");
log("  검산 — 무대별");
let total = 0;
const claimed = new Set();
for (const [label, pick] of STAGES) {
  const list = R.filter(pick);
  total += list.length;
  for (const r of list) claimed.add(r.id);
  log(`    ${label.padEnd(12)}${String(list.length).padStart(5)}`);
}
// ⚠ 한 규칙이 여러 무대에 속할 수 있다 — `career_stage`가 `stages` 배열을
//   받으면서부터다(프로 세 리그를 한 번에 가리킨다). **합계가 아니라
//   고유 규칙 수**로 검산한다
log(`    ${"단순 합".padEnd(12)}${String(total).padStart(5)}   (여러 무대에 걸친 규칙을 중복해서 센다)`);
log(`    ${"고유 규칙".padEnd(12)}${String(claimed.size).padStart(5)}   /  전체 ${R.length}`);
if (claimed.size !== R.length) {
  const lost = R.filter((r) => !claimed.has(r.id));
  log(`    🔴 어느 칸에도 안 잡힌 규칙 ${lost.length}종: ${lost.slice(0, 10).map((r) => r.id).join(" ")}`);
  process.exitCode = 1;
} else {
  log("    ok  빠진 규칙 없다");
}
log("");
log("  ⚠ 학년·연차 칸(들여쓴 것)은 그 무대 안의 갈래다 — 무대 합계에 이미 들어 있다");
log("  ⚠ 프로 연차 조건이 전부 `이상`(gte)이라 초기·중기·말기가 겹친다");
log("");
