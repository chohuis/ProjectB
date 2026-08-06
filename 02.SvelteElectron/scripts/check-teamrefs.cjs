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
  const src = fs.readFileSync(f, "utf8");
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
if (bad.length === 0) {
  console.log(`  ok  전부 refs.json(${known.size}팀)에 있다`);
  process.exit(0);
}
console.log(`FAIL  실재하지 않는 팀 ID ${bad.length}건`);
for (const b of bad.slice(0, 25)) console.log("  " + b);
if (bad.length > 25) console.log(`  … 외 ${bad.length - 25}건`);
process.exit(1);
