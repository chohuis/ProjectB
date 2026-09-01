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
 * 학점 상한은 **규칙 파일이 정본이다.** 리터럴로 적으면 값이 바뀔 때
 * 이 검사만 옛 눈금을 지킨다 — 이 파일이 스스로 경고하는 그 형태다.
 */
const GPA_MAX = (() => {
  const rules = JSON.parse(fs.readFileSync(
    "resource/data/master/players/generation_rules.json", "utf8"));
  const v = rules?.academicsRules?.university?.gpaMax;
  if (typeof v !== "number") throw new Error("[눈금] academicsRules.university.gpaMax 를 못 읽었다");
  return v;
})();

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

  // ── 2026-09-01에 더한 여섯 ───────────────────────────────────
  //
  // 🔴 **이 검사가 여섯 축을 모르고 있었다.** 머리말이 "축의 범위를 모르고
  // 값을 쓰면 조건이 영원히 false가 된다"고 적어 놓고 표는 일곱 개뿐이라,
  // `EVT_UNIV_Y3_GPA_VS_BALL`의 `gpa_lte 25`가 그 사이로 빠졌다
  // (학점은 0~4.5인데 25면 **항상 참**이다 — B 실측).
  "gpa":              [0, GPA_MAX],   // 규칙 파일이 정본
  "academicWarning":  [0, 3],         // warningEffects 단계 셋
  "fame":             [0, 200],
  "pitchingOvr":      [0, 99],
  "teamRank":         [1, 102],       // 고교 102팀이 제일 크다
};

// ⚠ **`fame` clamp가 코드에 둘 있다** — `game.ts:891`·`1572`는 200이고
//   `:1620`은 100이다. 느슨한 쪽(200)을 눈금으로 잡았다. 정본이 둘인 건
//   별개 결함이라 여기서 고치지 않는다.

/** 전용 조건 → 축 */
const TYPE_AXIS = {
  fatigue_gte: "fatigue", fatigue_lte: "fatigue",
  condition_gte: "condition", condition_lte: "condition",
  morale_gte: "morale", morale_lte: "morale",
  diligence_gte: "diligence", diligence_lte: "diligence",
  popularity_gte: "popularity", popularity_lte: "popularity",
  grade: "grade",
  week_gte: "week", week_lte: "week", week_eq: "week",
  gpa_gte: "gpa", gpa_lte: "gpa",
  academic_warning_gte: "academicWarning",
  fame_gte: "fame",
  pitching_ovr_gte: "pitchingOvr", pitching_ovr_lte: "pitchingOvr",
  team_rank_gte: "teamRank", team_rank_lte: "teamRank",
};

const bad = [];
/** 눈금을 넘어서 **항상 참**인 조건 — 있는 척하면서 없다 */
const always = [];
for (const r of R) {
  for (const c of r.conditions ?? []) {
    const axis = TYPE_AXIS[c.type] ?? (c.path && RANGE[c.path] ? c.path : null);
    if (!axis) continue;
    const [lo, hi] = RANGE[axis];
    const v = c.value;
    if (typeof v !== "number") continue;
    // `lte`가 최소보다 낮거나 `gte`가 최대보다 높으면 영원히 false다.
    const isGte = /_gte$/.test(c.type) || c.type === "num_gte";
    const isLte = /_lte$/.test(c.type) || c.type === "num_lte";
    if (isGte && v > hi) bad.push([r.id, c.type, c.path ?? axis, v, `최대 ${hi}`]);
    if (isLte && v < lo) bad.push([r.id, c.type, c.path ?? axis, v, `최소 ${lo}`]);

    // 🔴 **반대쪽도 결함이다** (2026-09-01). 예전 주석이 "상한이 최대를
    //   넘는 건 무해하다 — 항상 참이 될 뿐"이라 적고 넘어갔는데,
    //   **항상 참인 조건은 조건이 있는 척하면서 없는 것**이다.
    //
    //   `EVT_UNIV_Y3_GPA_VS_BALL`이 `gpa_lte 25`였다. 문안은
    //   「졸업 요건이 빠듯합니다」인데 학점 상한이 4.5라 **아무 때나 떴다**.
    //   형제 둘(`GPA_DANGER`·`GRAD_RISK`)은 `gpa_lte 2`다.
    //
    // ⚠ 눈금과 **정확히 같은** 값은 안 잡는다 — `week_lte 52`처럼 "끝까지"를
    //   일부러 적는 경우가 있다. 넘어선 것만 본다.
    if (isLte && v > hi) always.push([r.id, c.type, c.path ?? axis, v, `최대 ${hi} — 항상 참`]);
    if (isGte && v < lo) always.push([r.id, c.type, c.path ?? axis, v, `최소 ${lo} — 항상 참`]);
    if (c.type === "week_eq" && (v < lo || v > hi)) bad.push([r.id, c.type, axis, v, `${lo}~${hi}`]);
    if (c.type === "grade" && (v < lo || v > hi)) bad.push([r.id, c.type, axis, v, `${lo}~${hi}`]);
  }
}

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[조건 눈금] 규칙 ${R.length}건 · 아는 축 ${Object.keys(RANGE).length}개`);
if (R.length === 0) { log("  🔴 규칙을 하나도 못 읽었다"); process.exit(1); }
let failed = false;
if (bad.length) {
  log(`  🔴 눈금 밖이라 **영원히 false**인 조건 ${bad.length}건`);
  for (const [id, t, p, v, r] of bad) log(`      ${id.padEnd(34)}${t} ${p} = ${v}   (${r})`);
  log("");
  failed = true;
}
if (always.length) {
  log(`  🔴 눈금을 넘어서 **항상 참**인 조건 ${always.length}건 — 조건이 있는 척한다`);
  for (const [id, t, p, v, r] of always) log(`      ${id.padEnd(34)}${t} ${p} = ${v}   (${r})`);
  log("");
  failed = true;
}
if (failed) process.exit(1);
log("  ok  눈금 밖인 조건도, 항상 참인 조건도 없다");
log("");
