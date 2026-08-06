#!/usr/bin/env node
// 이름의 **한글 ↔ 영문 짝**이 맞는지 본다.
//
//   npm run check:namepair
//
// ⚠ 짝은 **인덱스로 맞춘다.** 배열 길이가 어긋나면 김씨가 Lee로 나오고,
// 그건 화면을 봐도 모른다 — 둘 다 그럴듯한 이름이기 때문이다.
//
// ⚠ 짝이 비어 있으면 원본을 그대로 쓴다(`gen_name_pooled`). 즉 **영어로
// 바꿔도 한글이 남는다.** 여기서 그걸 잡는다.

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

const HANGUL = /[가-힣]/;
const rules = JSON.parse(fs.readFileSync(
  path.join(ROOT, "resource/data/master/players/generation_rules.json"), "utf8"));

// ── 규칙 파일의 리그별 풀 ─────────────────────────────────────
for (const [lid, r] of Object.entries(rules.rosterRules)) {
  const np = r?.namePool;
  if (!np) continue;

  if (np.western) {
    // 원본이 영문 — 한글 짝이 있어야 한글 화면이 된다
    check(`${lid}: 성 짝 길이가 같다`,
      np.surnames.length === (np.surnamesKo ?? []).length,
      `${np.surnames.length} vs ${(np.surnamesKo ?? []).length}`);
    check(`${lid}: 이름 짝 길이가 같다`,
      np.givenA.length === (np.givenAKo ?? []).length,
      `${np.givenA.length} vs ${(np.givenAKo ?? []).length}`);
    check(`${lid}: 원본이 전부 영문이다`,
      [...np.surnames, ...np.givenA].every((s) => !HANGUL.test(s)));
    check(`${lid}: 한글 짝이 전부 한글이다`,
      [...(np.surnamesKo ?? []), ...(np.givenAKo ?? [])].every((s) => HANGUL.test(s)));
  } else {
    // 원본이 한글 — 영문 짝이 있어야 영어 화면이 된다
    check(`${lid}: 성 짝 길이가 같다`,
      np.surnames.length === (np.surnamesEn ?? []).length,
      `${np.surnames.length} vs ${(np.surnamesEn ?? []).length}`);
    check(`${lid}: 이름 짝 길이가 같다`,
      np.givenA.length === (np.givenAEn ?? []).length,
      `${np.givenA.length} vs ${(np.givenAEn ?? []).length}`);
    check(`${lid}: 원본이 전부 한글이다`,
      [...np.surnames, ...np.givenA].every((s) => HANGUL.test(s)));
    check(`${lid}: 영문 짝에 한글이 안 섞인다`,
      [...(np.surnamesEn ?? []), ...(np.givenAEn ?? [])].every((s) => !HANGUL.test(s)));
  }
}

// ── Rust 내장 한국 풀 ─────────────────────────────────────────
//
// 한국 리그는 규칙 파일에 풀이 없다 — `npc_sim.rs`의 상수를 쓴다.
// 그 짝도 같이 본다: 여기가 어긋나면 국내 선수 전원이 틀린 영문명을 갖는다.
{
  const src = fs.readFileSync(
    path.join(ROOT, "packages/engine-native/src/npc_sim.rs"), "utf8");
  const arr = (name) => {
    const m = new RegExp(`const ${name}:\\s*&\\[&str\\]\\s*=\\s*&\\[([\\s\\S]*?)\\];`).exec(src);
    return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : null;
  };
  const pairs = [
    ["SURNAMES", "SURNAMES_EN"],
    ["SYLLABLES_A", "SYLLABLES_A_EN"],
    ["SYLLABLES_B", "SYLLABLES_B_EN"],
  ];
  for (const [ko, en] of pairs) {
    const a = arr(ko), b = arr(en);
    check(`npc_sim: ${ko} 짝을 읽었다`, !!a && !!b, `${ko}=${a?.length} ${en}=${b?.length}`);
    if (!a || !b) continue;
    check(`npc_sim: ${ko} 길이가 같다 (${a.length})`, a.length === b.length,
      `${a.length} vs ${b.length}`);
    check(`npc_sim: ${en}에 한글이 없다`, b.every((s) => !HANGUL.test(s)),
      b.filter((s) => HANGUL.test(s)).join(","));
  }
}

log(failed === 0 ? "\n  ok  전부 통과" : `\nFAIL  ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
