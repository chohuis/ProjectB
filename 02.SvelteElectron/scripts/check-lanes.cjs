#!/usr/bin/env node
/**
 * **소식 갈래가 규칙을 지키는가** — `npm run check:lanes` (L6 · B)
 *
 * > 주사위가 부른 것은 상태를 못 바꾸고, 상태가 부른 것만 상태를 바꾼다.
 *   (`docs/PLAN_MESSAGE_LANES_2026-09-08.md` · 사용자 확정 2026-09-08)
 *
 * 두 줄을 본다:
 *
 *   ① **이벤트에 상태 효과가 있으면 빨강** — 등급 이벤트(`normal`·`rare`·
 *      `unique`·`hidden`)는 주사위가 부른다. 거기에 `rosterMove` 같은 것을
 *      적으면 「운이 좋아 1군에 올라갔다」가 된다.
 *   ② **통지인데 조건에 성적·상태가 없으면 빨강** — 통지(`notice`·`urgent`)는
 *      상태가 부르는 것이다. 무대·주차 게이트만 걸려 있으면 그건 통지가 아니라
 *      달력이다.
 *
 * 🔴 **`applySideEffects`(A)가 이미 동작을 막는다.** 그래도 이 검사가 필요한
 *   이유는, 코드가 막으면 **조용히 무시될 뿐** 데이터는 그대로 남기 때문이다 —
 *   다음 사람이 「효과가 적혀 있으니 먹겠지」로 읽는다. 여기는 **데이터가
 *   그렇게 쓰인 것 자체**를 잡는다.
 *
 * ⚠ 필수(달력 · `tier` 없음)는 둘 다 안 본다. 그건 주차가 부르는 안내다.
 */
const fs = require("node:fs");
const path = require("node:path");
const M = "resource/data/master";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const RULES = ["mandatory", "conditional", "random"].flatMap((lane) =>
  walk(path.join(M, "events", lane)).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8"))));
const DEC = new Map(JSON.parse(fs.readFileSync(`${M}/messages/decision_templates.json`, "utf8"))
  .decisions.map((d) => [d.id, d]));

/** 세계를 바꾸는 열쇠 — 통지에서만 먹는다(A `stateEffects.ts`) */
const STATE_KEYS = ["rosterMove", "startGuarantee"];
const GRADES = ["normal", "rare", "unique", "hidden"];
const isNotice = (r) => r.tier === "notice" || r.tier === "urgent";
const isGraded = (r) => GRADES.includes(r.tier);

/**
 * 이 조건이 **성적·상태**를 보나.
 *
 * ⚠ 무대·주차·학년·연차는 **게이트**다 — 「누구에게 열려 있나」이지 「무슨 일이
 *   일어났나」가 아니다. 그것만 걸린 통지는 달력과 구별되지 않는다.
 */
const GATE_TYPES = new Set(["career_stage", "league_id", "player_type", "grade",
  "week_gte", "week_lte", "week_eq", "season_phase"]);
const GATE_PATHS = new Set(["proServiceYears", "school.universityWeek", "age"]);
const isStateCond = (c) => {
  if (GATE_TYPES.has(c.type)) return false;
  if ((c.type === "num_gte" || c.type === "num_lte") && GATE_PATHS.has(c.path)) return false;
  return true;
};

const badEffect = [];
for (const r of RULES.filter(isGraded)) {
  const d = DEC.get(r.decisionTemplateId);
  for (const o of d?.options ?? []) {
    const fx = o.effects;
    if (!fx || Array.isArray(fx)) continue;
    for (const k of STATE_KEYS) {
      if (fx[k] !== undefined) badEffect.push([`${r.id}#${o.id}`, r.tier, k]);
    }
  }
  for (const k of STATE_KEYS) if (r.cost?.[k] !== undefined) badEffect.push([`${r.id}(cost)`, r.tier, k]);
}

const badNotice = [];
for (const r of RULES.filter(isNotice)) {
  const conds = [...(r.conditions ?? []), ...(r.hiddenCondition ?? [])];
  if (!conds.some(isStateCond)) badNotice.push([r.id, conds.map((c) => c.type).join(",") || "(조건 없음)"]);
}

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[소식 갈래] 규칙 ${RULES.length} · 통지 ${RULES.filter(isNotice).length} · 등급 ${RULES.filter(isGraded).length} · 필수 ${RULES.filter((r) => !r.tier).length}`);
log("");
let bad = 0;
const rule = (n, what, list, fmt) => {
  if (n > 0) { bad++; log(`  🔴 ${what} ${n}건`); list.slice(0, 10).forEach((x) => log("        " + fmt(x))); if (n > 10) log(`        … 그 밖 ${n - 10}건`); }
  else log(`  ok  ${what} 0건`);
};
rule(badEffect.length, "이벤트(주사위)인데 상태 효과가 있다", badEffect, ([w, t, k]) => `${w.padEnd(40)}${t} · ${k}`);
rule(badNotice.length, "통지인데 조건에 성적·상태가 없다", badNotice, ([id, cs]) => `${id.padEnd(40)}${cs}`);
log("");
if (bad) { log(`  🔴 어긴 규칙 ${bad}개`); log(""); process.exitCode = 1; }
