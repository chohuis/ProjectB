#!/usr/bin/env node
/**
 * check:militarydata — 현역 군 생활 데이터 넷(unit · members · calendar · rules) + 이벤트 풀을
 * **실제 파일로 읽어** 대조한다 (PLAN_MILITARY_LIFE.md §33 · §20 ⑤⑥).
 *
 * 왜 따로 두나: 이벤트·데이터가 코드와 어긋나도 게임은 죽지 않고 콘텐츠만 조용히
 * 사라진다(CLAUDE.md "데이터가 코드와 어긋나도 아무도 안 죽고 로그도 안 남는다").
 * 그래서 어긋남을 여기서 소리 나게 만든다.
 *
 *   npm run check:militarydata
 *   MILITARY_DATA_DIR=<dir> node scripts/check-militarydata.cjs     ← 변이 검증용 (깨진 사본을 가리킨다)
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const DATA_DIR = process.env.MILITARY_DATA_DIR
  ? path.resolve(process.env.MILITARY_DATA_DIR)
  : path.join(ROOT, "resource", "data", "master", "military");
const POOL_DIR = process.env.MILITARY_POOL_DIR
  ? path.resolve(process.env.MILITARY_POOL_DIR)
  : path.join(ROOT, "resource", "data", "master", "events", "pools");

const fails = [];
const warns = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);

function readJson(p) {
  if (!fs.existsSync(p)) { fail(`파일이 없다: ${path.relative(ROOT, p)}`); return null; }
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { fail(`JSON 이 깨졌다: ${path.relative(ROOT, p)} — ${e.message}`); return null; }
}

const unit     = readJson(path.join(DATA_DIR, "unit.json"));
const members  = readJson(path.join(DATA_DIR, "members.json"));
const calendar = readJson(path.join(DATA_DIR, "calendar.json"));
const rules    = readJson(path.join(DATA_DIR, "rules.json"));
const lifePool = readJson(path.join(POOL_DIR, "military_life.json"));

// §28 조건 어휘 — types/militaryLife.ts 의 MILITARY_CONDITION_TYPES 와 같아야 한다 (검사가 둘을 묶는다)
const CONDITION_TYPES = [
  "week_between", "rank", "role",
  "relation_gte", "relation_lte",
  "ballSense_gte", "ballSense_lte",
  "fatigue_gte", "fatigue_lte",
  "morale_gte", "morale_lte",
  "member_present", "season_month", "leave_recent",
];
const MEMBER_ROLES = ["officer", "senior", "peer", "junior"];
const ROLE_IDS = ["signal", "mortar"];
// §11 필수 14 — 캘린더에 반드시 있어야 한다
const REQUIRED_CALENDAR = [
  "MIL_CAL_ENTRY", "MIL_CAL_SHOOTING", "MIL_CAL_MARCH", "MIL_CAL_GRADUATION", "MIL_CAL_FIRST_DAY",
  "MIL_CAL_FIRST_LEAVE", "MIL_CAL_PROMOTE_2", "MIL_CAL_WINTER", "MIL_CAL_SECOND_LEAVE", "MIL_CAL_PROMOTE_3",
  "MIL_CAL_RANGER", "MIL_CAL_INSPECTION_2", "MIL_CAL_D30", "MIL_CAL_DISCHARGE",
];
const CHOICE_EFFECT_KEYS = ["relationDelta", "fatigueDelta", "moraleDelta", "ballDelta", "award", "penalty", "leaveDays", "perfTierDelta"];

// ── 타입 파일과 어휘가 같은가 (문자열 포함 검사 · 정규식 없음) ──
{
  const typesPath = path.join(ROOT, "apps", "ui", "src", "shared", "types", "militaryLife.ts");
  if (fs.existsSync(typesPath)) {
    const src = fs.readFileSync(typesPath, "utf8");
    for (const t of CONDITION_TYPES) {
      if (!src.includes(`"${t}"`)) fail(`조건 어휘 "${t}" 가 types/militaryLife.ts 에 없다 — 검사와 타입이 갈렸다`);
    }
  }
}

// ── unit ──
let roleSubunits = {};
if (unit) {
  for (const k of ["id", "name", "location", "roles", "roleAssign"]) if (!(k in unit)) fail(`unit.${k} 가 없다`);
  const roles = Array.isArray(unit.roles) ? unit.roles : [];
  const ids = roles.map((r) => r.id);
  for (const rid of ROLE_IDS) if (!ids.includes(rid)) fail(`unit.roles 에 "${rid}" 가 없다`);
  for (const r of roles) {
    if (!ROLE_IDS.includes(r.id)) fail(`unit.roles id "${r.id}" 는 signal|mortar 가 아니다`);
    if (!(r.dutyIntensity >= 1 && r.dutyIntensity <= 5)) fail(`role ${r.id} dutyIntensity 는 1~5 (지금 ${r.dutyIntensity})`);
    if (!(r.ballAccess >= 0 && r.ballAccess <= 3)) fail(`role ${r.id} ballAccess 는 0~3 (지금 ${r.ballAccess})`);
    if (typeof r.subunit !== "string" || !r.subunit) fail(`role ${r.id} subunit 이 없다`);
    roleSubunits[r.id] = r.subunit;
  }
  if (!(unit.roleAssign === "random" || ROLE_IDS.includes(unit.roleAssign))) fail(`unit.roleAssign "${unit.roleAssign}" — random|signal|mortar`);
}

// ── members ──
const memberIds = new Set();
const subunits = new Set();
let blankNames = 0;
if (Array.isArray(members)) {
  for (const m of members) {
    if (!m.id) { fail("members: id 없는 항목"); continue; }
    if (memberIds.has(m.id)) fail(`members: id 중복 ${m.id}`);
    memberIds.add(m.id);
    if (!MEMBER_ROLES.includes(m.role)) fail(`members ${m.id}: role "${m.role}" — officer|senior|peer|junior`);
    if (typeof m.subunit !== "string" || !m.subunit) fail(`members ${m.id}: subunit 이 없다`); else subunits.add(m.subunit);
    if (!(Number.isInteger(m.joinWeek) && Number.isInteger(m.leaveWeek))) fail(`members ${m.id}: joinWeek/leaveWeek 정수`);
    else if (!(m.joinWeek >= 0 && m.joinWeek < m.leaveWeek && m.leaveWeek <= 100)) fail(`members ${m.id}: 0 ≤ joinWeek(${m.joinWeek}) < leaveWeek(${m.leaveWeek}) ≤ 100`);
    if (!(typeof m.relationStart === "number" && m.relationStart >= -100 && m.relationStart <= 100)) fail(`members ${m.id}: relationStart −100~100`);
    if (!Array.isArray(m.tags)) fail(`members ${m.id}: tags 배열`);
    else for (const t of m.tags) {
      const head = t.includes(":") ? t.slice(0, t.indexOf(":")) : t;
      const tail = t.includes(":") ? t.slice(t.indexOf(":") + 1) : null;
      if (!["decides_leave", "grades_perf", "ball_partner", "mentor"].includes(head)) fail(`members ${m.id}: tag "${t}" 를 모른다`);
      if (tail !== null && !ROLE_IDS.includes(tail)) fail(`members ${m.id}: tag "${t}" 의 보직이 signal|mortar 가 아니다`);
    }
    if (!m.name || !m.trait) blankNames++;
  }
  if (members.length === 0) fail("members 가 비어 있다");
  // 주인공 소단위에 사람이 있어야 사람 카드가 뜬다
  for (const [rid, su] of Object.entries(roleSubunits)) {
    if (!subunits.has(su)) fail(`role ${rid} 의 subunit "${su}" 에 부대원이 한 명도 없다`);
  }
  // 성과 판정 간부 — 보직마다 grades_perf 가 하나는 있어야 tier 식의 관계 대상이 있다
  for (const rid of ROLE_IDS) {
    const graders = members.filter((m) => Array.isArray(m.tags) && m.tags.includes(`grades_perf:${rid}`));
    if (graders.length !== 1) fail(`grades_perf:${rid} 부대원이 정확히 하나여야 한다 (지금 ${graders.length})`);
  }
  if (blankNames > 0) warn(`이름·성격이 빈 부대원 ${blankNames}명 — 사용자가 채운다 (틀은 돈다)`);
} else if (members !== null) fail("members.json 은 배열이어야 한다");

// ── 이벤트 풀 (military_life) ──
const eventIds = new Set();
if (lifePool) {
  const events = Array.isArray(lifePool.events) ? lifePool.events : null;
  if (!events) fail("military_life.json 에 events 배열이 없다");
  else {
    for (const e of events) {
      if (!e.id) { fail("military_life: id 없는 이벤트"); continue; }
      if (eventIds.has(e.id)) fail(`military_life: id 중복 ${e.id}`);
      eventIds.add(e.id);
      if (!e.title || !e.description) warn(`${e.id}: title/description 이 비었다`);
      if (!Array.isArray(e.choices) || e.choices.length === 0) fail(`${e.id}: choices 가 비었다`);
      else for (const c of e.choices) {
        if (!c.id || !c.label) fail(`${e.id}: 선택지에 id/label 이 없다`);
        for (const k of Object.keys(c)) {
          if (["id", "label", "effectHint"].includes(k)) continue;
          if (!CHOICE_EFFECT_KEYS.includes(k)) fail(`${e.id}/${c.id}: 선택지 필드 "${k}" 를 모른다 (statDelta 는 현역에 없다)`);
        }
      }
      if (e.cooldownWeeks !== undefined && !(Number.isInteger(e.cooldownWeeks) && e.cooldownWeeks >= 1)) fail(`${e.id}: cooldownWeeks ≥ 1`);
      if (e.weight !== undefined && !(e.weight > 0)) fail(`${e.id}: weight > 0`);
      if (e.roleTag !== undefined && !ROLE_IDS.includes(e.roleTag)) fail(`${e.id}: roleTag "${e.roleTag}"`);
      if (e.perf !== undefined && !["fire", "signal_eval", "inspection"].includes(e.perf)) fail(`${e.id}: perf "${e.perf}"`);
      if (e.member !== undefined && !memberIds.has(e.member)) fail(`${e.id}: member "${e.member}" 가 members.json 에 없다`);
      if (e.minRank !== undefined && e.maxRank !== undefined && e.minRank > e.maxRank) fail(`${e.id}: minRank > maxRank`);
      for (const cond of e.conditions ?? []) {
        if (!CONDITION_TYPES.includes(cond.type)) fail(`${e.id}: 조건 type "${cond.type}" 는 §28 어휘 밖이다`);
        if ((cond.type === "relation_gte" || cond.type === "relation_lte" || cond.type === "member_present") && !memberIds.has(cond.member)) fail(`${e.id}: 조건 member "${cond.member}" 가 members.json 에 없다`);
        if (cond.type === "week_between" && !(cond.from >= 1 && cond.to <= 100 && cond.from <= cond.to)) fail(`${e.id}: week_between 1~100`);
        if (cond.type === "role" && !ROLE_IDS.includes(cond.value)) fail(`${e.id}: role 조건 값 "${cond.value}"`);
      }
    }
  }
}

// ── 기존 현역 풀 — statDelta 가 남아 있으면 경고 (복무 중 능력치 안 건드림 · 사용자 확정) ──
for (const name of ["military_general.json", "military_common.json"]) {
  const p = path.join(POOL_DIR, name);
  if (!fs.existsSync(p)) continue;
  const pool = readJson(p);
  const events = Array.isArray(pool?.events) ? pool.events : [];
  let withStat = 0;
  for (const e of events) for (const c of e.choices ?? []) if (c.statDelta) withStat++;
  if (withStat > 0) warn(`${name}: statDelta 가 있는 선택지 ${withStat}건 — 현역에선 무시된다 (B-11 에서 뺀다)`);
}

// ── calendar ──
if (Array.isArray(calendar)) {
  const weeks = new Set();
  const calIds = new Set();
  for (const c of calendar) {
    if (!(Number.isInteger(c.week) && c.week >= 1 && c.week <= 100)) fail(`calendar: week ${c.week} 는 1~100`);
    if (weeks.has(c.week)) fail(`calendar: 같은 주 둘 (W${c.week}) — 한 주 한 사건`);
    weeks.add(c.week);
    if (!c.event) fail(`calendar W${c.week}: event id 없음`);
    else { calIds.add(c.event); if (lifePool && !eventIds.has(c.event)) fail(`calendar W${c.week}: 이벤트 "${c.event}" 가 military_life.json 에 없다`); }
    if (!c.label) warn(`calendar W${c.week}: label 없음`);
    if (c.role !== undefined && c.role !== null && !ROLE_IDS.includes(c.role)) fail(`calendar W${c.week}: role "${c.role}"`);
    if (c.leaveDays !== undefined && !(c.leaveDays >= 1)) fail(`calendar W${c.week}: leaveDays ≥ 1`);
  }
  for (const id of REQUIRED_CALENDAR) if (!calIds.has(id)) fail(`필수 캘린더 이벤트 "${id}" 가 calendar.json 에 없다 (§11 14종)`);
  // 캘린더 이벤트는 풀에서 calendar:true 여야 랜덤 뽑기에서 빠진다
  if (lifePool && Array.isArray(lifePool.events)) {
    for (const e of lifePool.events) {
      if (calIds.has(e.id) && e.calendar !== true) fail(`${e.id}: 캘린더에 있는데 calendar:true 가 아니다 — 랜덤으로도 뜬다`);
      if (e.calendar === true && !calIds.has(e.id)) fail(`${e.id}: calendar:true 인데 calendar.json 에 주가 없다 — 영영 안 뜬다`);
    }
  }
} else if (calendar !== null) fail("calendar.json 은 배열이어야 한다");

// ── rules ──
if (rules) {
  const need = (obj, keyPath) => {
    let cur = obj;
    for (const k of keyPath.split(".")) { if (cur === null || typeof cur !== "object" || !(k in cur)) { fail(`rules.${keyPath} 가 없다`); return; } cur = cur[k]; }
  };
  for (const k of ["serviceWeeks", "bootCampWeeks", "rankBandWeeks", "ballSense.start", "ballSense.weeklyDecay", "ballSense.gainByAccess",
    "ballSense.capPerAccessGap", "fatigue.baseByIntensity", "fatigue.choice.ball", "fatigue.choice.people", "fatigue.choice.rest",
    "fatigue.natural", "fatigue.leave", "morale.choice", "relation.weeklyDecay", "relation.peopleByBand", "relation.sameSubunitWeight",
    "event.weeklyChance", "event.defaultCooldown", "perf.bandCoef", "discharge"]) need(rules, k);
  if (rules.serviceWeeks !== 100) fail(`rules.serviceWeeks 는 100 (militaryDecision.SERVICE_WEEKS 와 같아야 한다)`);
  if (Array.isArray(rules.rankBandWeeks) && rules.rankBandWeeks.join(",") !== "8,34,60") fail("rules.rankBandWeeks 는 코드 띠 8/34/60 그대로");
  if (Array.isArray(rules.ballSense?.gainByAccess) && rules.ballSense.gainByAccess.length !== 4) fail("ballSense.gainByAccess 는 ballAccess 0~3 네 칸");
  if (Array.isArray(rules.fatigue?.baseByIntensity) && rules.fatigue.baseByIntensity.length !== 6) fail("fatigue.baseByIntensity 는 0~5 여섯 칸");
  if (Array.isArray(rules.discharge)) {
    let prev = Infinity;
    for (const d of rules.discharge) { if (!(d.minSense < prev)) fail("rules.discharge 는 minSense 내림차순"); prev = d.minSense; }
    if (rules.discharge.length && rules.discharge[rules.discharge.length - 1].minSense !== 0) fail("rules.discharge 마지막 minSense 는 0");
  }
}

// ── 결과 ──
console.log(`\n── check:militarydata (${path.relative(ROOT, DATA_DIR) || "."} · 풀 ${path.relative(ROOT, POOL_DIR)}) ──`);
console.log(`  부대원 ${memberIds.size} · 이벤트 ${eventIds.size} · 캘린더 ${Array.isArray(calendar) ? calendar.length : 0}주`);
for (const w of warns) console.log(`  ⚠ ${w}`);
if (fails.length) { console.log(`\n🔴 ${fails.length}건`); for (const f of fails) console.log(`  · ${f}`); process.exit(1); }
console.log("\nOK");
