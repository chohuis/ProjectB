#!/usr/bin/env node
/**
 * **보상 키가 파서에 있는가.**
 *
 * 🔴 조건 쪽엔 `assertConditions`가 있어 모르는 타입이면 **로드에서 던진다.**
 * 보상 쪽엔 그게 없다 — `parseEffectsArray`는 모르는 키를 **조용히 버린다.**
 * 그래서 오타 하나가 "그 선택지가 아무것도 안 하는" 결과가 되고, 아무 로그도
 * 안 남는다. 이 트랙이 겪은 결함의 형태 그대로다.
 *
 * ⚠ **파서를 소스에서 읽는다.** 여기 목록을 손으로 적으면 파서와 어긋나고,
 * 그러면 검사가 검사를 안 하게 된다 — `check-eventconditions.cjs`와 같은 방식이다.
 */
const fs = require("node:fs");

const SRC = fs.readFileSync("apps/ui/src/shared/stores/master.ts", "utf8");
const body = SRC.slice(SRC.indexOf("function parseEffectsArray"));
const end = body.indexOf("\n}\n");
const fn = body.slice(0, end);

/** `key === "money"` 꼴 — 정확 일치 키 */
const exact = new Set([...fn.matchAll(/key === "([^"]+)"/g)].map((m) => m[1]));
/** `key.startsWith("xp.")` 꼴 — 접두사 */
const prefixes = [...fn.matchAll(/key\.startsWith\("([^"]+)"\)/g)].map((m) => m[1]);

if (exact.size === 0 || prefixes.length === 0) {
  console.log("  🔴 파서를 못 읽었다 — 정규식이 소스와 어긋났다");
  process.exit(1);
}

const known = (k) => exact.has(k) || prefixes.some((p) => k.startsWith(p));

const DEC = JSON.parse(fs.readFileSync(
  "resource/data/master/messages/decision_templates.json", "utf8")).decisions;

const unknown = new Map();   // 키 → [decId#optId]
let strOpts = 0, objOpts = 0;
const used = new Set();

for (const d of DEC) {
  for (const o of d.options ?? []) {
    if (Array.isArray(o.effects)) {
      strOpts++;
      for (const e of o.effects) {
        const i = e.indexOf(":");
        if (i === -1) { unknown.set(e, [...(unknown.get(e) ?? []), `${d.id}#${o.id}`]); continue; }
        const k = e.slice(0, i).trim();
        used.add(k);
        if (!known(k)) unknown.set(k, [...(unknown.get(k) ?? []), `${d.id}#${o.id}`]);
      }
    } else if (o.effects && typeof o.effects === "object") {
      objOpts++;
    }
  }
}

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[보상 키] 결정 템플릿 ${DEC.length}개 · 선택지 문자열형 ${strOpts} / 객체형 ${objOpts}`);
log(`  파서가 아는 것: ${[...exact].sort().join(" ")}  +  ${prefixes.map((p) => p + "*").join(" ")}`);
log(`  데이터가 쓰는 것 ${used.size}종: ${[...used].sort().join(" ")}`);

const never = [...exact, ...prefixes].filter((k) => ![...used].some((u) => u === k || u.startsWith(k)));
if (never.length) log(`  ⓘ 파서엔 있는데 아무 데이터도 안 쓰는 키: ${never.join(" ")}`);

if (unknown.size) {
  log(`  🔴 파서가 모르는 키 ${unknown.size}종 — **조용히 버려진다**`);
  for (const [k, where] of unknown) log(`      ${String(k).padEnd(24)}${where.slice(0, 3).join(" ")}`);
  log("");
  process.exit(1);
}
log("  ok  모르는 보상 키가 없다");
log("");
