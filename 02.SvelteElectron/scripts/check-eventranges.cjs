#!/usr/bin/env node
/**
 * **조건값이 그 축의 눈금 안인가.**
 *
 * 🔴 이 트랙이 반복해서 밟은 함정이다. 축의 실제 범위를 모르고 값을 쓰면
 * 조건이 **영원히 false**가 되고, 오류도 로그도 안 남는다:
 *
 *   주차     1~52인데 **누적 53~156**으로 썼다            19종 (2026-08-25)
 *   성실     시작 60에서 바닥이 54인데 `lte 30`으로 썼다   1종
 *   성장률   0~100(기본 62)인데 `lte 1.0`으로 썼다        1종 — **내가 만든 사슬**
 *
 * 셋 다 "값이 그럴듯해서" 통과했다. 눈금을 표로 박아 둔다.
 */
const fs = require("node:fs");
const path = require("node:path");
const M = "resource/data/master/events";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const R = [];
for (const lane of ["mandatory", "conditional", "random"]) {
  for (const f of walk(path.join(M, lane)).filter((x) => x.endsWith(".json"))) {
    R.push(JSON.parse(fs.readFileSync(f, "utf8")));
  }
}

/**
 * 축의 실제 범위. **코드에서 확인한 값만 적는다** — 추측하면 이 검사가
 * 검사를 안 하게 된다.
 */
const RANGE = {
  // 경로 → [최소, 최대]
  "developmentRate": [0, 100],   // game.ts:182 기본 62
  "potentialHidden": [0, 100],
  "diligence":       [1, 99],    // game.ts:840 clamp
  "popularity":      [0, 100],
  "condition":       [0, 100],
  "fatigue":         [0, 100],
  "morale":          [0, 100],
  "age":             [15, 45],
  "grade":           [1, 4],
  "week":            [1, 52],    // 🔴 누적이 아니다 — 롤오버가 리셋한다
  "leagueYears":     [1, 30],
  "proServiceYears": [0, 30],
};
/** 전용 조건 → 축 */
const TYPE_AXIS = {
  fatigue_gte: "fatigue", fatigue_lte: "fatigue",
  condition_gte: "condition", condition_lte: "condition",
  morale_gte: "morale", morale_lte: "morale",
  diligence_gte: "diligence", diligence_lte: "diligence",
  popularity_gte: "popularity", popularity_lte: "popularity",
  grade: "grade",
  week_gte: "week", week_lte: "week", week_eq: "week",
};

const bad = [];
for (const r of R) {
  for (const c of r.conditions ?? []) {
    const axis = TYPE_AXIS[c.type] ?? (c.path && RANGE[c.path] ? c.path : null);
    if (!axis) continue;
    const [lo, hi] = RANGE[axis];
    const v = c.value;
    if (typeof v !== "number") continue;
    // `lte`가 최소보다 낮거나 `gte`가 최대보다 높으면 영원히 false다.
    // `week_lte`가 최대를 넘는 건 무해하다 — 상한이 항상 참이 될 뿐
    const isGte = /_gte$/.test(c.type) || c.type === "num_gte";
    const isLte = /_lte$/.test(c.type) || c.type === "num_lte";
    if (isGte && v > hi) bad.push([r.id, c.type, c.path ?? axis, v, `최대 ${hi}`]);
    if (isLte && v < lo) bad.push([r.id, c.type, c.path ?? axis, v, `최소 ${lo}`]);
    if (c.type === "week_eq" && (v < lo || v > hi)) bad.push([r.id, c.type, axis, v, `${lo}~${hi}`]);
    if (c.type === "grade" && (v < lo || v > hi)) bad.push([r.id, c.type, axis, v, `${lo}~${hi}`]);
  }
}

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[조건 눈금] 규칙 ${R.length}건 · 아는 축 ${Object.keys(RANGE).length}개`);
if (R.length === 0) { log("  🔴 규칙을 하나도 못 읽었다"); process.exit(1); }
if (bad.length) {
  log(`  🔴 눈금 밖이라 **영원히 false**인 조건 ${bad.length}건`);
  for (const [id, t, p, v, r] of bad) log(`      ${id.padEnd(34)}${t} ${p} = ${v}   (${r})`);
  log("");
  process.exit(1);
}
log("  ok  눈금 밖인 조건이 없다");
log("");
