#!/usr/bin/env node
// 코드에 박힌 팀 ID가 전부 실재하는지 전수 대조한다.
//
//   npm run check:teamrefs
//
// ⚠ **이 검사가 없어서 옛 ID가 네 군데 쌓였다** (2026-08-06):
//   · `universityUtils.ts`  대학 7개 중 6개가 없는 팀 → 49개 대학이 무조건 합격
//   · `top10Engine.ts`      옛 고교 16팀 → 나머지 팀은 **문구에 ID가 그대로**
//   · `friendlyMatchEngine.ts` 같은 16팀 (폴백이라 안 닿았지만 거짓)
//   · `master.ts`           옛 24팀 이름·프로필 (죽은 코드)
//
// 팀 ID는 Phase 5에서 한 번 통째로 갈아엎혔다. 그때 코드에 박힌 것들이
// 조용히 남았고, 화면에 ID가 뜨고 나서야 드러났다.
//
// **정본은 `refs.json` 하나다** (DESIGN §8.2 원칙 6).

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const REFS = path.join(ROOT, "resource/data/master/entities/refs.json");
const refs = JSON.parse(fs.readFileSync(REFS, "utf8"));
const known = new Set((refs.teams || []).map((t) => t.id));

/** 파생 ID도 유효로 본다 — 2군은 `_1`/`_2` 접미사를 붙여 만든다 (`ids.ts`) */
function isKnown(id) {
  if (known.has(id)) return true;
  const base = id.replace(/_[12]$/, "");
  return known.has(base) || known.has(id + "_1");
}

/**
 * 팀 ID가 아닌 것들. 이것까지 잡으면 검사가 시끄러워 아무도 안 본다.
 *  - `TEAM_IDS` 류: 상수 이름
 *  - `TEAM_SPORTS_UNIT`: 리그 밖 특수 팀(상무 병역)
 *  - `TEAM_KBL_X_1` 류: 주석 안의 예시
 */
const NOT_A_TEAM = /^TEAM_(IDS?|NAME|NAMES|NAME_MAP|SHORT|PROFILE|PROFILE_MAP|X|KBL_X|ABL_|JBL_)/;
const ALLOW = new Set(["TEAM_SPORTS_UNIT"]);

const SCAN_DIRS = ["apps/ui/src", "apps/desktop", "packages/core/src"];
const SKIP = /node_modules|leagueTeams\.generated\.ts|__tests__/;

/**
 * **주석을 지운다** — 코드만 남긴다 (2026-09-22).
 *
 * 🔴 왜. `dashboardMeta.ts` 의 주석에 "화면에 `TEAM_KBL_1` 이 뜬다"라고
 *   **결함을 설명하는 예시**가 적혀 있는데, 검사가 그걸 실재하지 않는 팀
 *   ID 로 잡아 빨강이었다. 주석은 코드가 아니다 — "이런 ID 가 뜨면 안 된다"를
 *   적는 자리에서 검사가 우는 것은 검사 쪽이 틀린 것이다.
 *
 * ⚠ **`NOT_A_TEAM` 에 예외를 더하는 길로 가지 않는다.** 그러면 진짜 옛 ID 도
 *   같이 통과한다(`TEAM_KBL_` 로 시작하는 것을 통째로 빼게 된다).
 *
 * ⚠ 문자열 안의 `//` 는 주석이 아니다(`"https://…"`). 글자를 하나씩 읽으며
 *   따옴표 셋을 추적한다 — 정규식을 안 쓴다(CLAUDE.md).
 * ⚠ 지우지 않고 **공백으로 바꾼다.** 줄·칸이 안 밀려 진단이 읽힌다.
 */
function stripComments(src) {
  const out = Array.from(src);
  let i = 0;
  const n = src.length;
  let quote = ""; // "", '"', "'", "`"
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (quote) {
      if (c === "\\") { i += 2; continue; }
      if (c === quote) quote = "";
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; i++; continue; }
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let k = i; k < stop; k++) if (src[k] !== "\n") out[k] = " ";
      i = stop;
      continue;
    }
    // Svelte 마크업 주석
    if (c === "<" && src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const stop = end === -1 ? n : end + 3;
      for (let k = i; k < stop; k++) if (src[k] !== "\n") out[k] = " ";
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|cjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.filter((d) => fs.existsSync(path.join(ROOT, d)))
  .flatMap((d) => walk(path.join(ROOT, d)));

const bad = [];
let checked = 0;
for (const f of files) {
  const src = stripComments(fs.readFileSync(f, "utf8"));
  // 접두사 조각(`id.startsWith("TEAM_HS_")`)은 팀 ID가 아니다 —
  // 끝이 `_`이거나 마디가 셋 미만이면 뺀다
  const ids = [...new Set([...src.matchAll(/TEAM_[A-Z0-9_]*[A-Z0-9]/g)].map((m) => m[0]))]
    .filter((id) => id.split("_").length >= 3);
  for (const id of ids) {
    if (NOT_A_TEAM.test(id) || ALLOW.has(id)) continue;
    checked++;
    if (!isKnown(id)) {
      bad.push(`${path.relative(ROOT, f).replace(/\\/g, "/")}  ${id}`);
    }
  }
}

console.log(`팀 ID 참조 검사 — 파일 ${files.length}개 · 팀 ID ${checked}종`);
// ⚠ **아무것도 못 봤으면 통과가 아니다.** `stripComments` 가 과하게 지우면
//   ID 가 0종이 되고 검사는 조용히 초록이 된다 — 이 저장소가 여러 번 밟은
//   "잣대가 먼저 틀린" 형태다. 코드에 박힌 ID 는 최소한 몇 개는 있다.
if (checked === 0) {
  console.log("FAIL  코드에서 팀 ID 를 한 개도 못 찾았다 — 잣대(주석 지우기)를 의심하라");
  process.exit(1);
}
if (bad.length === 0) {
  console.log(`  ok  전부 refs.json(${known.size}팀)에 있다`);
  process.exit(0);
}
console.log(`FAIL  실재하지 않는 팀 ID ${bad.length}건`);
for (const b of bad.slice(0, 25)) console.log("  " + b);
if (bad.length > 25) console.log(`  … 외 ${bad.length - 25}건`);
process.exit(1);
