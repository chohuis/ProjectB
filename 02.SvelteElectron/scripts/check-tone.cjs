#!/usr/bin/env node
/**
 * **문안이 한 말투로 서 있는가.**
 *
 * 이 저장소의 문안 규칙(사용자 확정 2026-09-03·09-04):
 *
 * ```
 * 본문        합쇼체 (…습니다 · …합니까)
 * 버튼·칩     평서체 짧은 말 (…한다 · …간다) · 마침표 없음
 * 제목        명사구 (문장으로 끝내지 않는다)
 * 자리표시자  체언 종지 — 뒤에 조사를 안 붙인다   → `check:josa` 가 본다
 * 부제·대시   안 쓴다                              → 아래 R9
 * 이름        본문에 안 쓴다 (보낸이 칸이 든다)    → 기계가 못 본다
 * ```
 *
 * 🔴 **상한을 쓰는 이유.** 규칙이 늦게 정해져서 이미 어긋난 자리가 있다.
 * 0 을 요구하면 검사를 켤 수가 없고, 안 세면 조용히 는다. `check:playertype`
 * 이 쓰는 방식 그대로 — **지금 값을 상한으로 박고 넘으면 실패**시킨다.
 * 고칠 때마다 상한을 내린다. **올릴 때는 이유를 적는다.**
 *
 * ⚠ **정규식은 이 파일 안에만 둔다.** 데이터에 두면 문안과 잣대가 같은
 *   파일에서 서로를 정당화한다.
 *
 * ⚠ **`_` 로 시작하는 키는 개발 주석이다** — 플레이어가 안 본다. 안 센다.
 *
 * 🛑 **고교는 평서체가 그 무대의 문체다** (사용자 확정 2026-09-04). 처음 셌을 때
 *   평서체 본문 72 중 **71 이 고교**였다 — 흩어진 실수가 아니라 한 무대의 목소리다.
 *   그래서 R6 은 **고교에만 뜨는 소식을 안 센다.** 안 빼면 그 71 이 영원히 빚으로
 *   남아 상한이 0 이 될 수 없고, 상한이 안 내려가는 규칙은 그 안에서 위반이
 *   갈아치워질 때 못 잡는다.
 */
const fs = require("node:fs");
const path = require("node:path");

const M = "resource/data/master";
const rd = (f) => JSON.parse(fs.readFileSync(path.join(M, f), "utf8"));

// ── 말투 판정 ────────────────────────────────────────────────
//
// ⚠ **「…니다」로 끝나는지만 본다.** 형태소 분석을 흉내 내면 오탐이 는다 —
//   「흐립니다」·「섭니다」처럼 「습니다」가 아닌 합쇼체가 많아서
//   `습니다` 로만 재면 절반을 놓친다(2026-09-03 에 실제로 그랬다).
const HAP = /(니다|니까)[.?!]?$/;
const PLAIN = /다[.!]?$/;                     // 「…한다」 — 합쇼체를 먼저 걸러야 한다
const sentences = (t) => String(t || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
const isHap = (s) => HAP.test(s);
const isPlain = (s) => PLAIN.test(s) && !HAP.test(s);

// ── 자료 ─────────────────────────────────────────────────────
const templates = rd("messages/templates.json").templates;
const decisions = rd("messages/decision_templates.json").decisions;
const POOLS = ["military_life", "military_common", "military_general", "military_sports"];
const pools = POOLS.map((f) => ({ f, events: rd(`events/pools/${f}.json`).events }));

/** 버튼 라벨 — 소식 선택지와 군 이벤트 선택지를 한 통에 담는다 */
const labels = [];
for (const d of decisions) for (const o of d.options ?? []) labels.push([`${d.id}#${o.id}`, o.label ?? ""]);
for (const { f, events } of pools) for (const e of events) for (const c of e.choices ?? []) {
  labels.push([`${f}:${e.id}#${c.id}`, c.label ?? ""]);
}

/** 효과 힌트 */
const hints = [];
for (const d of decisions) for (const o of d.options ?? []) if (o.effectHint) hints.push([`${d.id}#${o.id}`, o.effectHint]);
for (const { f, events } of pools) for (const e of events) for (const c of e.choices ?? []) {
  if (c.effectHint) hints.push([`${f}:${e.id}#${c.id}`, c.effectHint]);
}

/** 본문 — `bodies[]` 문장 은행이 있으면 그쪽을 센다 */
const bodies = [];
for (const t of templates) {
  const list = Array.isArray(t.bodies) && t.bodies.length ? t.bodies : [t.body];
  list.forEach((b, i) => { if (b) bodies.push([t.id + (list.length > 1 ? `[${i}]` : ""), b]); });
}
for (const { f, events } of pools) for (const e of events) {
  if (e.description) bodies.push([`${f}:${e.id}`, e.description]);
}

/**
 * 템플릿 id → 그 소식을 띄우는 규칙들의 무대.
 *
 * 🔴 **id 접두(`MSG_HS_`)로 짐작하지 않는다.** 이름은 옮겨 다니고 규칙은 안 그렇다 —
 *   이 저장소가 세 번 밟은 함정이라 `career_stage` 를 그대로 읽는다.
 *   `stage` 하나와 `stages` 배열을 **둘 다** 본다(`conditionEvaluator` 와 같은 판정).
 */
const stagesByTemplate = (() => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const map = new Map();
  for (const lane of ["mandatory", "conditional", "random"]) {
    const dir = path.join(M, "events", lane);
    if (!fs.existsSync(dir)) continue;
    for (const f of walk(dir).filter((x) => x.endsWith(".json"))) {
      const r = JSON.parse(fs.readFileSync(f, "utf8"));
      if (!r.messageTemplateId) continue;
      const c = (r.conditions ?? []).find((x) => x.type === "career_stage");
      const st = !c ? ["*"] : Array.isArray(c.stages) ? c.stages : c.stage ? [c.stage] : ["*"];
      const cur = map.get(r.messageTemplateId) ?? new Set();
      st.forEach((x) => cur.add(x));
      map.set(r.messageTemplateId, cur);
    }
  }
  return map;
})();

/** 고교에만 뜨는 소식인가 — 무대를 안 가리는 것(`*`)은 공용이라 아니다 */
const isHighschoolOnly = (templateId) => {
  const st = stagesByTemplate.get(String(templateId).replace(/\[\d+\]$/, ""));
  return !!st && st.size > 0 && [...st].every((x) => x === "highschool");
};

/** 제목 */
const subjects = templates.map((t) => [t.id, t.subject ?? ""]).filter(([, s]) => s);
for (const { f, events } of pools) for (const e of events) if (e.title) subjects.push([`${f}:${e.id}`, e.title]);

/** 부제·구분자 대시 — 문안 JSON 전체(개발 주석 제외) */
const DASH = /—|–| - /;
const dashHits = [];
for (const f of fs.readdirSync(path.join(M, "messages")).filter((x) => x.endsWith(".json"))) {
  const j = rd(`messages/${f}`);
  const walk = (o, p) => {
    if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${p}[${i}]`));
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) if (!k.startsWith("_")) walk(v, p ? `${p}.${k}` : k);
      return;
    }
    // 「—」 한 글자는 **빈 칸 기호**다(값이 없다는 뜻) — 구분자가 아니다
    if (typeof o === "string" && o.trim() !== "—" && DASH.test(o)) dashHits.push([`${f}:${p}`, o]);
  };
  walk(j, "");
}

// ── 규칙 ─────────────────────────────────────────────────────
//
// `cap: 0` 은 「지금 0 이고 앞으로도 0」이다. 양수는 **남은 빚**이다.
const RULES = [
  { id: "R1", what: "버튼에 마침표가 들어갔다", cap: 0,
    hits: labels.filter(([, l]) => /[.!?]/.test(l)) },
  { id: "R2", what: "버튼이 합쇼체다 — 버튼은 평서체 짧은 말이다", cap: 0,
    hits: labels.filter(([, l]) => isHap(l)) },
  { id: "R3", what: "효과 힌트가 문장이다 — 힌트는 값만 적는다", cap: 0,
    hits: hints.filter(([, h]) => /[.!?]$/.test(h)) },
  // ✅ 77 → 0 (B-37 · 2026-09-04). 낱말은 그대로 두고 어미만 세웠다 —
  //   「구위」→「구위를 기른다」·「짧게」→「짧게 끝낸다」 꼴이다.
  { id: "R4", what: "버튼이 종결형이 아니다 — 명사·부사로 끊겼다", cap: 0,
    hits: labels.filter(([, l]) => l && !/(다|자|요)$/.test(l)) },
  // ⚠ **14 는 잰 값이 아니라 관측값이다.** 화면에서 버튼이 몇 자에 넘치는지
  //   아무도 안 쟀다 — 지금 걸리는 열아홉은 「코치에게 솔직하게 털어놓는다」처럼
  //   말이 온전한 것들이라 **줄이면 오히려 나빠진다.** 실제 폭을 재기 전에는
  //   이 상한을 내리지 마라(§ B-37 보고).
  { id: "R5", what: "버튼이 길다 (14자 넘음 · 관측값)", cap: 19,
    hits: labels.filter(([, l]) => [...l].length > 14) },
  // ✅ 72 → 1 → 0 (B-37). 고교 갈래 71 을 빼고 남은 하나(`MSG_COND_SLUMP`)를 고쳤다
  { id: "R6", what: "본문이 평서체다 (고교 갈래 제외 — 그 무대의 문체다)", cap: 0,
    hits: bodies.filter(([id, b]) => {
      if (isHighschoolOnly(id)) return false;
      const ss = sentences(b);
      return ss.some(isPlain) && !ss.some(isHap);
    }) },
  // ✅ 32 → 0 (B-37). 제목 544 중 444 가 이미 명사구였다 — 합쇼체로 안내하던
  //   서른둘만 명사구로 옮겼다(「새 시즌이 시작됩니다」 → 「시즌 개막」).
  { id: "R7", what: "제목이 합쇼체 문장이다 — 안내 제목은 명사구다", cap: 0,
    hits: subjects.filter(([, s]) => HAP.test(s)) },
  // ⚠ **여기는 상한을 안 내린다.** 「감각을 찾았다」·「돌아갈까」·「바닥을 쳤다」는
  //   **장면 제목**이고 이 게임의 목소리다 — 명사구로 만들면 결이 죽는다.
  //   세는 이유는 **늘어나는 걸 보려고**다(줄이려고가 아니다).
  { id: "R7b", what: "제목이 평서체 장면 문장이다 (그대로 둔다 · 늘어나는지만 본다)", cap: 68,
    hits: subjects.filter(([, s]) => !HAP.test(s) && /(다|까)[.?!]?$/.test(s)) },
  // ✅ 1 → 0 (B-37). 그 하나가 R7 의 서른둘 안에 있었다
  { id: "R8", what: "제목이 길다 (22자 넘음)", cap: 0,
    hits: subjects.filter(([, s]) => [...s].length > 22) },
  { id: "R9", what: "부제·구분자 대시", cap: 0, hits: dashHits },
];

// ── 보고 ─────────────────────────────────────────────────────
const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[말투] 본문 ${bodies.length} · 제목 ${subjects.length} · 버튼 ${labels.length} · 힌트 ${hints.length}`);
log(`       templates ${templates.length} · decisions ${decisions.length} · 군 풀 ${POOLS.length}개`);
log("");

let failed = 0;
for (const r of RULES) {
  const n = r.hits.length;
  const over = n > r.cap;
  if (over) failed++;
  const mark = over ? "🔴" : n === 0 ? "ok " : "⚠ ";
  log(`  ${mark} ${r.id} ${String(n).padStart(4)} / 상한 ${String(r.cap).padStart(4)}   ${r.what}`);
  if (over) {
    for (const [id, v] of r.hits.slice(0, 12)) log(`         ${String(id).padEnd(46)}「${String(v).split("\n")[0].slice(0, 60)}」`);
    if (n > 12) log(`         … 그 밖 ${n - 12}건`);
  }
}
log("");
if (failed) {
  log(`  🔴 상한을 넘은 규칙 ${failed}개 — 고치거나, 올려야 한다면 **이유를 이 파일에 적고** 올려라`);
  log("");
  process.exitCode = 1;
} else {
  const debt = RULES.filter((r) => r.cap > 0).reduce((a, r) => a + r.hits.length, 0);
  log(`  ok  전부 상한 안이다 (남은 빚 ${debt}자리 — 상한이 0 이 되면 규칙이 닫힌다)`);
  log("");
}
