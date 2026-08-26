#!/usr/bin/env node
/**
 * **힌트가 보상을 빠뜨렸는가.**
 *
 * 🔴 이 트랙의 원점이 되는 결함이 **표시와 동작이 다른 것**이다 — 6C가
 * 걷어낸 감정 문구는 힌트에 "trust +5"라 써놓고 실제로는 사기·피로만
 * 움직였다. `relationDelta`를 만든 이유가 그거였다.
 *
 * ⚠ **문구까지 맞추려 들지 않는다.** "위기집중력 XP +2"와 "클러치 경험치 +2"는
 * 같은 말이고, 손으로 쓴 쪽이 더 나을 때가 많다. 기계가 다시 쓰면 그 결이
 * 뭉개진다 — 그래서 **문자열이 아니라 "어떤 보상을 언급했나"만** 본다.
 *
 * 잡는 것: 보상은 주는데 힌트가 **입을 다문 것**.
 */
const fs = require("node:fs");
const P = "resource/data/master/messages/decision_templates.json";

/** 그 보상이 힌트에 언급됐는지 알아볼 낱말 */
const WORDS = {
  conditionDelta: /컨디션/, fatigueDelta: /피로/, moraleDelta: /사기|멘탈 ?회복/,
  moneyDelta: /돈|원|만원|용돈|장학|알바|아르바이트/,
  fameDelta: /명성/, popularityDelta: /인기/, diligenceDelta: /성실|근면/,
  addTag: /태그|「/,
  relationDelta: /관계|친밀|신뢰|감독|코치|동료|선배|구단주|라이벌/,
  luxurySpend: /돈|원|만원|관계|명성/,
  xp: /경험치|XP/i,
  statDelta: /\+\s*\d|즉시|상승/,
};

const j = JSON.parse(fs.readFileSync(P, "utf8"));
const silent = [];
let checked = 0;
for (const d of j.decisions) {
  for (const o of d.options ?? []) {
    if (Array.isArray(o.effects)) continue;      // 배열형은 힌트가 그 형식에 맞춰져 있다
    const fx = o.effects;
    if (!fx || Object.keys(fx).length === 0) continue;
    checked++;
    const hint = String(o.effectHint ?? "");
    for (const k of Object.keys(fx)) {
      const re = WORDS[k];
      if (!re) continue;
      if (!re.test(hint)) silent.push([`${d.id}#${o.id}`, k, hint || "(없음)"]);
    }
  }
}

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[힌트] 객체형 선택지 ${checked}개 검사`);
if (silent.length) {
  log(`  🔴 보상은 주는데 힌트가 입을 다문 것 ${silent.length}건`);
  for (const [id, k, h] of silent.slice(0, 40)) log(`      ${id.padEnd(42)}${k.padEnd(16)}"${h}"`);
  if (silent.length > 40) log(`      … 그 밖 ${silent.length - 40}건`);
  log("");
  process.exitCode = 1;
} else {
  log("  ok  힌트가 보상을 다 언급한다");
  log("");
}
