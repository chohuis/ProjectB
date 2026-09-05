"use strict";
/**
 * **저장 왕복 검사** — `npm run check:roundtrip`
 *
 * 값을 심고 → 불러오고 → 그대로 다시 저장했을 때 **처음과 같은가.**
 *
 * 🔴 왜 이 검사가 있는가 (2026-09-05 실사용자 세이브):
 *
 *   `getAllNpcs` 가 은퇴자를 **좁은 칼럼 목록으로** 읽었는데 `syncNpcs` 는
 *   스토어 전체를 **넓게 되썼다.** 안 읽은 칼럼이 삽입 폴백으로 덮여,
 *   왕복 한 번마다 은퇴자 869명의 값이 지워졌다:
 *
 *       military_status  전원 '미필' (36세 KBL 은퇴자까지)
 *       development_rate 전원 50 · potential_hidden 전원 75 · salary 전원 0
 *       abilities_json   전원 {"pitches":[]} (현역은 460바이트대)
 *
 *   그리고 Rust `NpcSaveState.military_status` 는 `String`(옵션 아님)이라
 *   드래프트 수락에서 `missing field` 로 **게임이 죽었다.**
 *
 *   **이 검사 하나면 처음부터 걸렸다.** 그래서 은퇴자 하나가 아니라
 *   **저장 대상 전체**를 본다.
 *
 * ── 어떻게 재는가 ────────────────────────────────────────────────
 *
 *   ① 자식 프로세스: 새 게임 → N시즌 진행 → 저장
 *   ② 부모: 슬롯 db 를 통째로 뜬다(dump0)
 *   ③ 부모: **값을 심는다** — 아래 「심기」 참고
 *   ④ 자식 프로세스(**새 프로세스**): 불러오기 → 그대로 저장
 *   ⑤ 부모: 다시 뜬다(dump1) → ③ 과 한 칸씩 맞춰 본다
 *
 * 🔴 **④ 는 반드시 새 프로세스다.** 같은 프로세스면 스토어가 메모리에 그대로
 *   남아 있어서, 디스크에서 안 읽히는 값도 다시 저장된다 — **유실이 안 보인다.**
 *
 * ── 심기 ─────────────────────────────────────────────────────────
 *
 * 칼럼 목록을 손으로 적지 않는다. `PRAGMA table_info` 로 **DB 에게 묻는다** —
 * 그래야 칼럼이 새로 생겨도 검사가 저절로 따라온다(손 목록은 반드시 뒤처진다.
 * `RETIRED_NPC_COLUMNS` 가 `military_status` 를 빠뜨린 것이 그 형태였다).
 *
 * 값은 **타입에 맞게** 만든다:
 *   숫자   그 칸에 없는 값(현재값을 피해 고른 상수)
 *   글자   **그 칼럼에 이미 있는 다른 값**을 고른다 — 지어내면 열거형이
 *          깨져 불러오기가 거부할 수 있다. 있는 값끼리 바꾸면 모양이 안전하고
 *          그러면서도 「되쓰기가 덮는가」는 그대로 드러난다
 *   JSON   건드리지 않는다(모양이 코드에 매여 있다). 대신 ②↔⑤ 원본 비교가
 *          그 칸을 본다 — 은퇴자 `abilities_json` 이 그렇게 잡혔다
 *
 * 심을 수 없던 칸은 **「못 심은 칸」으로 이름을 찍는다.** 검사가 무엇을 못
 * 봤는지 말하지 않으면 통과가 거짓말이 된다.
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const ROOT = process.cwd();
const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 2);
const SEED = arg("seed", 20260731);
const SLOT = "RT";

/**
 * **왕복해도 달라지는 것이 정상인 칸.**
 *
 * ⚠ 목록을 늘릴 때는 **왜 정상인지**를 여기 적는다. 「시끄러워서」는 이유가
 *   아니다 — 이 목록이 검사의 눈가리개다.
 */
const VOLATILE = new Set([
  // `meta` 는 key/value 표라 열쇠까지 적는다
  "meta.value@updated_at",        // 저장 시각 — 저장할 때마다 바뀌는 것이 그 값의 뜻이다
  "protagonist.json:savedAt",     // 같은 이유 (JSON 안의 키)
  "season_meta.json:savedAt",
  // 주인공 blob 의 HMAC(`compute_save_sig`)이다. 그 blob 안에 `savedAt` 이
  // 들어 있으니 **저장할 때마다 달라지는 것이 맞다.** 서명이 안 바뀌면
  // 오히려 저장을 안 한 것이다.
  "meta.value@protagonist_sig",
]);

/** JSON 문자열이 든 칼럼 — 통째 비교 대신 키별로 갈라 본다 */
const JSON_COLUMNS = new Set([
  "protagonist.json", "season_meta.json",
]);

/**
 * **다시 계산되는 것이 맞는 칸** — 심어도 뜻이 없고, 되돌아오는 것이 정상이다.
 *
 * ⚠ 여기 넣을 때는 **무엇이 그 값을 낳는지**를 적는다. 그게 없으면 이 목록이
 *   조용히 검사의 구멍이 된다.
 */
const DERIVED = new Map([
  // 일정 표의 세 칸은 `json` 을 풀어 놓은 사본이다 — 정본은 `json` 이고,
  // `writeSeason` 이 매번 다시 만든다(`putSchedule`). `ord` 는 **자리**라
  // 심으면 그 항목이 리그 목록 맨 뒤로 가서 뒤 항목이 전부 밀린다.
  ["schedule.ord", "일정 안의 자리 — writeSeason 이 매긴다"],
  ["schedule.week", "json.week 의 사본 — 색인용"],
  ["schedule.has_result", "json.result 유무의 사본 — 색인용"],
  ["standings.ord", "순위표 안의 자리 — writeSeason 이 매긴다"],
  ["season_stats.bucket", "어느 리그 몫인지 — 쓰는 쪽이 정한다"],
  ["standings.bucket", "위와 같다"],
  ["schedule.bucket", "위와 같다"],
]);

/** 심기에서 뺀다 — 열쇠이거나, 모양이 코드에 매여 있거나, 다시 계산된다 */
const NO_PLANT_COLUMN = (table, col, isPk) =>
  isPk || col.endsWith("_json") || col === "json" || col === "value" || col === "key"
  || DERIVED.has(`${table}.${col}`);

// ── db 뜨기 ──────────────────────────────────────────────────────

function tablesOf(db) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((r) => r.name);
}

function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

/** 그 표의 행을 고유하게 가리키는 열쇠. 기본키가 없으면 rowid */
function keyColsOf(db, table) {
  const pk = columnsOf(db, table).filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
  return pk.length > 0 ? pk.map((c) => c.name) : null;
}

/** 표 하나를 `{열쇠: {칼럼: 값}}` 으로 */
function dumpTable(db, table) {
  const keys = keyColsOf(db, table);
  const sel = keys ? "*" : "rowid AS __rowid, *";
  const rows = db.prepare(`SELECT ${sel} FROM ${table}`).all();
  const out = new Map();
  for (const r of rows) {
    const k = keys ? keys.map((c) => String(r[c])).join("|") : String(r.__rowid);
    out.set(k, r);
  }
  return out;
}

function dumpAll(file) {
  const db = new Database(file, { readonly: true });
  try {
    const out = {};
    for (const t of tablesOf(db)) out[t] = dumpTable(db, t);
    return out;
  } finally { db.close(); }
}

// ── 비교 ─────────────────────────────────────────────────────────

/** JSON 두 개를 키 경로로 갈라 다른 곳만 돌려준다 */
function jsonDiff(a, b, prefix, out, depth = 0) {
  if (depth > 6) return;
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      jsonDiff(a[k], b[k], prefix ? `${prefix}.${k}` : k, out, depth + 1);
    }
    return;
  }
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) out.push({ path: prefix, before: sa, after: sb });
}

/**
 * 두 덤프를 한 칸씩 맞춰 본다.
 *
 * @returns Map<"표.칼럼", {table, col, n, sample, cells:Set<"표|열쇠|칼럼">}>
 */
function compare(before, after) {
  const tally = new Map();
  const note = (table, col, key, sample) => {
    const vk = table === "meta" ? `${table}.${col}@${key}` : `${table}.${col}`;
    if (VOLATILE.has(vk)) return;
    const k = `${table}.${col}`;
    const cur = tally.get(k) ?? { table, col, n: 0, sample: null, cells: new Set() };
    cur.n++;
    cur.cells.add(`${table}|${key}|${col}`);
    if (!cur.sample) cur.sample = sample;
    tally.set(k, cur);
  };

  for (const t of Object.keys(before)) {
    const A = before[t], B = after[t] ?? new Map();
    if (A.size !== B.size) note(t, "(행 수)", "-", `${A.size} → ${B.size}`);
    for (const [key, ra] of A) {
      const rb = B.get(key);
      if (!rb) { note(t, "(행)", key, `없어졌다: ${key}`); continue; }
      for (const col of Object.keys(ra)) {
        if (col === "__rowid") continue;
        const va = ra[col], vb = rb[col];
        if (JSON_COLUMNS.has(`${t}.${col}`)) {
          let pa, pb;
          try { pa = JSON.parse(va); pb = JSON.parse(vb); }
          catch { if (va !== vb) note(t, col, key, "(JSON 파싱 실패 · 통째로 다르다)"); continue; }
          const d = [];
          jsonDiff(pa, pb, "", d);
          for (const x of d) {
            if (VOLATILE.has(`${t}.${col}:${x.path}`)) continue;
            note(t, `${col}:${x.path}`, key,
              `${String(x.before).slice(0, 60)} → ${String(x.after).slice(0, 60)}`);
          }
          continue;
        }
        if (va === vb) continue;
        // Buffer(BLOB) 는 문자열 비교가 안 된다
        if (Buffer.isBuffer(va) && Buffer.isBuffer(vb) && va.equals(vb)) continue;
        note(t, col, key, `${String(va).slice(0, 40)} → ${String(vb).slice(0, 40)} (${key})`);
      }
    }
  }
  return tally;
}

// ── 심기 ─────────────────────────────────────────────────────────

function plant(file) {
  const db = new Database(file);
  const planted = [];
  const skipped = [];
  const cells = new Set();
  try {
    db.pragma("journal_mode = WAL");
    for (const t of tablesOf(db)) {
      const cols = columnsOf(db, t);
      const keys = keyColsOf(db, t);
      if (!keys) { skipped.push(`${t}.* (기본키 없음 — 열쇠로 되짚을 수가 없다)`); continue; }
      const n = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
      if (n === 0) { skipped.push(`${t}.* (행 0)`); continue; }
      // 앞 행 몇 개만 건드린다 — 전부 바꾸면 세계가 뒤틀려 불러오기가 거부할 수 있다
      const targets = db.prepare(
        `SELECT ${keys.join(", ")} FROM ${t} ORDER BY ${keys.join(", ")} LIMIT 5`).all();
      for (const c of cols) {
        if (NO_PLANT_COLUMN(t, c.name, c.pk > 0)) { skipped.push(`${t}.${c.name}`); continue; }
        const where = keys.map((k) => `${k} = ?`).join(" AND ");
        let did = 0;
        for (const row of targets) {
          const args = keys.map((k) => row[k]);
          const cur = db.prepare(`SELECT ${c.name} v FROM ${t} WHERE ${where}`).get(...args).v;
          // 🔴 **지어내지 않는다 — 그 칼럼에 이미 있는 다른 값을 고른다.**
          //   숫자든 글자든 같다. 없는 값을 넣으면 열거형(`career_status`)이나
          //   참거짓 칸(`is_named`)에서 **유실이 아니라 정규화**가 나와
          //   가짜 실패가 된다(첫 판에서 `is_named` 에 4242 를 넣었다가
          //   `!!r.is_named` 가 1 로 되돌린 것을 유실로 셌다).
          const alt = db.prepare(
            `SELECT ${c.name} v FROM ${t} WHERE ${c.name} IS NOT NULL `
            + `AND ${c.name} IS NOT ? ORDER BY ${c.name} DESC LIMIT 1`).get(cur);
          if (!alt) continue;
          const val = alt.v;
          if (val === null || val === cur) continue;
          db.prepare(`UPDATE ${t} SET ${c.name} = ? WHERE ${where}`).run(val, ...args);
          cells.add(`${t}|${keys.map((k) => String(row[k])).join("|")}|${c.name}`);
          did++;
        }
        if (did > 0) planted.push(`${t}.${c.name}`);
        else skipped.push(`${t}.${c.name} (바꿔 넣을 다른 값이 없다)`);
      }
    }
  } finally { db.close(); }
  return { planted, skipped, cells };
}

// ── 국면 실행 ────────────────────────────────────────────────────

function runPhase(args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/roundtrip-phase.cjs"), ...args], {
    cwd: ROOT, stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  if (r.status !== 0) {
    console.error(`  FAIL  국면 실패: ${args[0]}`);
    process.exit(1);
  }
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "roundtrip-"));
  const slotFile = path.join(tmp, "saves", `slot3_${SLOT}.db`);
  try {
    console.log(`[왕복] 씨앗 ${SEED} · ${SEASONS}시즌 · ${tmp}`);
    runPhase(["new", tmp, SLOT, String(SEED), String(SEASONS)]);
    if (!fs.existsSync(slotFile)) { console.error("  FAIL  슬롯 파일이 없다"); process.exit(1); }

    const { planted, skipped, cells } = plant(slotFile);
    const A = dumpAll(slotFile);
    const rows = Object.entries(A).map(([t, m]) => `${t} ${m.size}`).join(" · ");
    console.log(`[왕복] 표 ${Object.keys(A).length}개 — ${rows}`);
    console.log(`[왕복] 심은 칸 ${planted.length}개 · 못 심은 칸 ${skipped.length}개`);

    runPhase(["load", tmp, SLOT]);
    const B = dumpAll(slotFile);
    // 🔴 **한 번 더 돈다.** 첫 왕복에서만 달라지고 두 번째부터 그대로인 것은
    //   **유실이 아니라 정규화**다(null → 0 같은 것). 이름은 찍되 실패로 세지
    //   않는다 — 안 가르면 「시끄러워서」 예외 목록만 길어진다.
    runPhase(["load", tmp, SLOT]);
    const C = dumpAll(slotFile);

    const d1 = compare(A, B);      // 심은 것이 살아남았나 + 첫 왕복 차이
    const d2 = compare(B, C);      // 계속 달라지나 (고정점인가)

    const wiped = [];       // 심었는데 지워졌다 — 이번 결함과 같은 꼴이다
    const unstable = [];    // 안 심었는데 왕복마다 계속 달라진다
    const normalized = [];  // 첫 왕복에서만 달라졌다 — 정규화
    for (const v of d1.values()) {
      const plantedHere = [...v.cells].some((c) => cells.has(c));
      if (plantedHere) wiped.push(v);
      else if (d2.has(`${v.table}.${v.col}`)) unstable.push(v);
      else normalized.push(v);
    }
    const by = (a, b) => b.n - a.n;
    wiped.sort(by); unstable.sort(by); normalized.sort(by);

    const show = (title, list) => {
      if (list.length === 0) return;
      console.log(`\n${title}`);
      for (const l of list.slice(0, 30)) {
        console.log(`  ${String(l.n).padStart(5)}건  ${l.table}.${l.col}`);
        console.log(`           ${l.sample}`);
      }
    };
    show("🔴 심은 값이 지워졌다 — 좁게 읽고 넓게 되썼다", wiped);
    show("🔴 왕복마다 계속 달라진다 — 저장이 고정점이 아니다", unstable);
    show("⚠ 첫 왕복에서만 달라졌다 — 정규화(실패로 세지 않는다)", normalized);

    if (process.argv.includes("--verbose")) {
      console.log("\n[못 심은 칸] — 이 칸들은 심기로는 못 봤다(원본 비교로만 본다)");
      for (const s of skipped) console.log(`    ${s}`);
    }

    const bad = wiped.length + unstable.length;
    console.log("");
    if (bad === 0) {
      console.log(`  ok  심은 칸 ${planted.length}개가 전부 살아남았고 저장이 고정점이다`
        + (normalized.length ? ` (정규화 ${normalized.length}칸은 위에 적었다)` : ""));
    } else {
      console.log(`  FAIL  지워진 칸 ${wiped.length} · 안 멎는 칸 ${unstable.length}`);
    }
    process.exit(bad === 0 ? 0 : 1);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* OS 가 치운다 */ }
  }
}

main();
