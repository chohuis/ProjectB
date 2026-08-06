#!/usr/bin/env node
// 영어로 바꿨을 때 **한글이 남는 자리**를 찾는다.
//
//   npm run check:namelocale
//
// ⚠ 이름을 찍는 화면이 80곳 넘는다. **한 곳이 새면 그 화면만 한국어**가 되는데
// 눈으로는 못 찾는다 — 다른 화면이 멀쩡해 보이기 때문이다.
//
// 언어 반영본을 읽어야 하는 스토어:
//   `$teamMap`      팀 (언어 반영됨)
//   `$entitiesL10n` 인물 (언어 반영됨)
//   `$entityMap`    인물 조회 (언어 반영됨)
//
// 원본을 읽으면 언어가 안 따라온다:
//   `$masterStore.entities` · `$masterStore.teams`

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { log(`  ok  ${name}`); return; }
  failed++;
  log(`FAIL  ${name}`);
  if (detail) log(`        ${detail}`);
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (/node_modules|__tests__|\.generated\./.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.svelte$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk("apps/ui/src");

// ── ① 원본 스토어를 화면이 직접 읽는가 ────────────────────────
{
  const leaks = [];
  for (const f of files) {
    const src = read(f);
    for (const pat of ["$masterStore.entities", "$masterStore.teams"]) {
      if (src.includes(pat)) leaks.push(`${f}  ${pat}`);
    }
  }
  check("화면이 원본 대신 언어 반영본을 읽는다",
        leaks.length === 0,
        leaks.slice(0, 8).join("\n        ")
          + (leaks.length > 8 ? `\n        … 외 ${leaks.length - 8}건` : ""));
}

// ── ② 짝 표기가 데이터에 있는가 ───────────────────────────────
//
// 화면을 다 배선해도 데이터에 영문명이 없으면 그대로 한글이 나온다.
{
  const refs = JSON.parse(read("resource/data/master/entities/refs.json"));
  const noEn = (refs.teams ?? []).filter((t) => !t.nameEn);
  check(`팀 ${(refs.teams ?? []).length}개가 전부 영문명을 갖는다`,
        noEn.length === 0,
        noEn.slice(0, 6).map((t) => `${t.id} ${t.name}`).join(" · "));

  const hangul = (refs.teams ?? []).filter((t) => /[가-힣]/.test(t.nameEn ?? ""));
  check("팀 영문명에 한글이 안 섞인다",
        hangul.length === 0,
        hangul.slice(0, 6).map((t) => `${t.id} ${t.nameEn}`).join(" · "));
}

// ── ③ 표시 헬퍼가 원본을 안 덮는가 ────────────────────────────
//
// ⚠ 스토어의 `name`을 표시 언어로 갈아끼우면 **다음 저장에서 slot.db의
// `name` 열이 영문으로 덮인다.** 한글 원본이 사라진다.
{
  const src = read("apps/ui/src/shared/stores/master.ts");
  check("언어 반영본이 원본을 복사해 만든다 (파괴적 대입이 없다)",
        /\{ \.\.\.e, name: e\.nameEn \}/.test(src) && /\{ \.\.\.t, name: t\.nameEn \}/.test(src),
        "스프레드 복사가 아니면 원본이 바뀐다");
}

log(failed === 0 ? "\n  ok  전부 통과" : `\nFAIL  ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
