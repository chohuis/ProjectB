#!/usr/bin/env node
/**
 * **자리표시자(`{word}`) 뒤에 받침 의존 조사를 데이터가 직접 붙였는가.**
 *
 * `{team}`·`{name}`처럼 채워지는 값이 매번 다른 자리표시자는 받침도 매번
 * 다르다(「웨이브스」·「라이온즈」처럼). 그 뒤에 받침 유무로 형태가 갈리는
 * 조사(이/가·은/는·을/를·과/와·로/으로 등)를 문자 그대로 이어 붙이면 절반은
 * 맞고 절반은 「팀A이」처럼 깨진다.
 *
 * 실측 사례 — `contract_terms.json`의 `{team}와(의)`: 오늘은 안전하다
 * (refs.json 팀 이름 238개 중 받침으로 끝나는 것 0종 · 전부 「스」·「즈」 꼴).
 * 다만 38종이 「(2군)」 으로 끝나 「부산 웨이브스 (2군)와의」 가 되므로 그
 * 자리는 `headSafe`(줄 끝에 이름, 조사 없음)로 이미 피해 놨다 — 그 패턴이
 * 이 스캐너가 찾는 것과 정확히 같다.
 *
 * 잡는 것: `}` 바로 뒤에 공백 없이 붙은, 받침에 따라 형태가 갈리는 조사.
 * 안 잡는 것: 자리표시자와 조사 사이에 고정 명사(단위어 등)가 낀 자리
 * (`{years}년이`) — 그 명사의 받침은 안 변하므로 안전하다.
 *
 * ⚠ 문자 그대로 매치라 오탐이 있다("이닝"이 "이"로 시작하듯) — `SAFE_TAILS`에
 * 실측으로 확인한 낱말만 골라 뺀다. 새 오탐이 나오면 이 목록에 추가한다.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = "resource/data/master";

// 받침 없음/받침 있음 짝 — 받침 있는 쪽이 더 길면 그쪽을 먼저 매치해야 하므로
// 전체를 길이 내림차순으로 정렬해서 쓴다(아래 JOSA_FORMS).
const JOSA_PAIRS = [
  ["로서", "으로서"], ["로써", "으로써"], ["로부터", "으로부터"], ["로의", "으로의"],
  ["라서", "이라서"], ["라도", "이라도"], ["라고", "이라고"], ["라며", "이라며"],
  ["든지", "이든지"],
  ["랑", "이랑"], ["나", "이나"], ["며", "이며"], ["란", "이란"], ["든", "이든"], ["라", "이라"],
  ["로", "으로"], ["과", "와"], ["은", "는"], ["을", "를"], ["이", "가"],
  ["었", "였"], // 서술격 활용 — {name}이었다 / {name}였다
];
const JOSA_FORMS = [...new Set(JOSA_PAIRS.flat())].sort((a, b) => b.length - a.length);

// 자리표시자 뒤에 흔히 오는, 조사가 아닌 낱말(단위어 등) — 실측 확인.
// 앞 글자가 JOSA_FORMS 와 우연히 겹쳐 오탐이 나므로 여기서 뺀다.
const SAFE_TAILS = [
  "이닝", // {pitches}이닝 — 단위어. "이"로 시작해 조사 「이」 매치와 우연히 겹친다
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".json")) out.push(p);
  }
  return out;
}

function scanString(s) {
  const hits = [];
  const re = /\{(\w+)\}([가-힣]+)/g;
  let m;
  while ((m = re.exec(s))) {
    const [, key, tail] = m;
    if (SAFE_TAILS.some((w) => tail.startsWith(w))) continue;
    const form = JOSA_FORMS.find((f) => tail.startsWith(f));
    if (form) hits.push(`{${key}}${tail.slice(0, Math.min(tail.length, form.length + 2))}`);
  }
  return hits;
}

function walkValues(obj, file, hits) {
  if (typeof obj === "string") {
    for (const h of scanString(obj)) hits.push([file, h, obj.slice(0, 70)]);
  } else if (Array.isArray(obj)) {
    for (const v of obj) walkValues(v, file, hits);
  } else if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      if (k.startsWith("_")) continue; // 주석 필드(_note 등)는 안 본다
      walkValues(obj[k], file, hits);
    }
  }
}

const files = walk(ROOT);
const hits = [];
for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  walkValues(j, f, hits);
}

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[조사] JSON ${files.length}개 · 자리표시자 뒤 받침 의존 조사 스캔`);
if (hits.length) {
  log(`  🔴 자리표시자 뒤에 조사가 직접 붙은 자리 ${hits.length}건`);
  for (const [f, h, ctx] of hits.slice(0, 80)) {
    log(`      ${path.relative(ROOT, f).padEnd(38)}${h.padEnd(14)}"${ctx}"`);
  }
  if (hits.length > 80) log(`      … 그 밖 ${hits.length - 80}건`);
  log("");
  process.exitCode = 1;
} else {
  log("  ok  자리표시자 뒤 직접 붙은 조사 없음");
  log("");
}
