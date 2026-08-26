#!/usr/bin/env node
/**
 * **무대별 건강 진단.** 칸을 돌기 전에 어디가 아픈지 한 장으로 본다.
 *
 * 🔴 고교에서 나온 결함들이 다른 무대에도 있는지 **한 번에** 본다.
 * 칸마다 따로 찾으면 같은 형태를 여섯 번 다시 발견하게 된다.
 */
const fs = require("node:fs");
const path = require("node:path");
const M = "resource/data/master";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const R = [];
for (const lane of ["mandatory", "conditional", "random"]) {
  for (const f of walk(path.join(M, "events", lane)).filter((x) => x.endsWith(".json"))) {
    R.push({ lane, ...JSON.parse(fs.readFileSync(f, "utf8")) });
  }
}
const T = new Map(JSON.parse(fs.readFileSync(`${M}/messages/templates.json`, "utf8")).templates.map((t) => [t.id, t]));
const D = new Map(JSON.parse(fs.readFileSync(`${M}/messages/decision_templates.json`, "utf8")).decisions.map((d) => [d.id, d]));

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
const league = (r) => C(r, "league_id")?.leagueId ?? null;

const STAGES = [
  ["전체 공용", (r) => noStage(r) && !league(r) && !isArmy(r)],
  ["고교",      (r) => inStage(r, "highschool")],
  ["대학",      (r) => inStage(r, "university")],
  ["독립",      (r) => inStage(r, "independent")],
  ["KBL 1군",   (r) => inStage(r, "pro_kbl") && !league(r)],
  ["KBL 2군",   (r) => league(r) === "LEAGUE_KBL_FARM"],
  ["ABL",       (r) => inStage(r, "pro_abl") || league(r) === "LEAGUE_ABL_FARM"],
  ["JBL",       (r) => inStage(r, "pro_jbl") || league(r) === "LEAGUE_JBL_FARM"],
  ["군",        (r) => isArmy(r)],
];

/** 그 규칙의 선택지 보상 키 전부 */
function fxKeys(r) {
  const out = [];
  for (const o of D.get(r.decisionTemplateId)?.options ?? []) {
    const e = o.effects;
    if (Array.isArray(e)) out.push(...e.map((s) => s.slice(0, s.indexOf(":"))));
    else if (e) {
      for (const k of Object.keys(e)) {
        if (k === "xp" || k === "statDelta") out.push(...Object.keys(e[k]).map((x) => `${k}.${x}`));
        else out.push(k);
      }
    }
  }
  return out;
}
const isMoney = (k) => k === "money" || k === "moneyDelta" || k.startsWith("luxury");
const isRel   = (k) => k.startsWith("relation.") || k === "relationDelta";
const isTag   = (k) => k === "addTag";

/** 무대 전용 축을 쓰나 — 고교 grade · 대학 universityWeek · 프로 연차 */
const AXIS = {
  "고교":    (r) => (r.conditions ?? []).some((c) => c.type === "grade"),
  "대학":    (r) => (r.conditions ?? []).some((c) => c.path === "school.universityWeek"),
  "KBL 1군": (r) => (r.conditions ?? []).some((c) => c.type === "pro_year_gte" || c.path === "proServiceYears"),
  "ABL":     (r) => (r.conditions ?? []).some((c) => c.path === "leagueYears"),
  "JBL":     (r) => (r.conditions ?? []).some((c) => c.path === "leagueYears"),
};

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`  이벤트 ${R.length}종 — 무대별 건강 진단`);
log("");
log("  무대         재고  선택지없음  본문없음  겹침잉여  돈  관계  태그  연차축  등급명시");
log("  " + "─".repeat(88));

const detail = {};
for (const [label, pick] of STAGES) {
  const l = R.filter(pick);
  if (!l.length) { log(`  ${label.padEnd(11)}${String(0).padStart(5)}   ${"— 비었다".padEnd(60)}`); continue; }
  const noDec = l.filter((r) => !r.decisionTemplateId).length;
  const noBody = l.filter((r) => {
    const t = T.get(r.messageTemplateId);
    return !t || (!(Array.isArray(t.bodies) && t.bodies.length) && !t.body);
  }).length;
  // 같은 풀 + 같은 템플릿 잉여
  const m = new Map();
  for (const r of l) { if (!r.poolId) continue; const k = `${r.messageTemplateId}|${r.poolId}`; m.set(k, (m.get(k) ?? 0) + 1); }
  const excess = [...m.values()].filter((v) => v > 1).reduce((a, v) => a + v - 1, 0);
  let money = 0, rel = 0, tag = 0;
  for (const r of l) { const ks = fxKeys(r); if (ks.some(isMoney)) money++; if (ks.some(isRel)) rel++; if (ks.some(isTag)) tag++; }
  const axis = AXIS[label] ? l.filter(AXIS[label]).length : null;
  const tier = l.filter((r) => r.tier).length;
  log(`  ${label.padEnd(11)}${String(l.length).padStart(5)}${String(noDec).padStart(11)}${String(noBody).padStart(10)}`
    + `${String(excess).padStart(10)}${String(money).padStart(4)}${String(rel).padStart(6)}${String(tag).padStart(6)}`
    + `${(axis === null ? "—" : String(axis)).padStart(8)}${String(tier).padStart(10)}`);
  detail[label] = { n: l.length, noDec, excess, money, rel, tag, axis, tier };
}
log("");
log("  선택지없음 = 읽고 넘기는 알림  ·  겹침잉여 = 같은 풀에서 같은 템플릿을 쓰는 규칙 수−1");
log("  연차축 = 그 무대의 시간 축(고교 grade · 대학 universityWeek · 프로 연차)을 쓰는 규칙 수");
log("  등급명시 = `tier`를 적은 규칙 수 (안 적으면 oncePolicy로 추론한다)");
log("");
