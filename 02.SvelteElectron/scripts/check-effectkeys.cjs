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

/**
 * 🔴 **`xp.<스탯>`·`stat.<스탯>`은 접두사만 보고 통과시켰다.** `xp.bogus`도
 * `xp.`로 시작하니 `known()`을 그냥 통과한다 — 접두사 뒤가 실제 스탯인지는
 * 아무도 안 봤다. 정본은 `types/save.ts`의 `PitchingAttributes`·
 * `BattingAttributes`다(둘 다 `game.ts`의 `applyEffectToProtagonist`가 읽는
 * 기본 스탯 객체와 같다). 버킷 표기(`"batting.contact"`)는 그 코드의 규칙과
 * 같게 판정한다 — 점이 있으면 앞이 버킷, 없으면 맨 이름 그대로 스탯이다.
 * ⚠ 여기 키 목록도 손으로 적지 않는다 — 인터페이스에서 읽는다.
 */
const SAVE_TY = fs.readFileSync("apps/ui/src/shared/types/save.ts", "utf8");
const statKeysOf = (ifaceName) => {
  const b = SAVE_TY.slice(SAVE_TY.indexOf(`interface ${ifaceName}`));
  const block = b.slice(0, b.indexOf("\n}"));
  return new Set([...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]).filter((k) => k !== "ovr"));
};
const pitchStatKeys = statKeysOf("PitchingAttributes");
const batStatKeys = statKeysOf("BattingAttributes");
if (pitchStatKeys.size === 0 || batStatKeys.size === 0) {
  console.log("  🔴 스탯 인터페이스를 못 읽었다 — 정규식이 save.ts와 어긋났다");
  process.exit(1);
}
const statKeys = new Set([...pitchStatKeys, ...batStatKeys]);
/** "batting.contact" → "contact" · "command" → "command" (버킷 없으면 그대로) */
const statSuffix = (k) => k.startsWith("batting.") ? k.slice(8) : k.startsWith("pitching.") ? k.slice(9) : k;
const validStat = (k) => statKeys.has(statSuffix(k));

const known = (k) => {
  if (exact.has(k)) return true;
  const pfx = prefixes.find((p) => k.startsWith(p));
  if (!pfx) return false;
  if (pfx === "xp." || pfx === "stat.") return validStat(k.slice(pfx.length));
  return true;
};

/**
 * 🔴 **객체형은 파서를 안 탄다.** `parseEffectsArray`는 문자열형(`["money:-120"]`)
 * 전용이고, 객체형(`{ moneyDelta: -120 }`)은 그대로 통과한다 — 그래서 위 목록으로는
 * 객체형을 검사할 수 없다. **2026-08-26까지 객체형 선택지의 오타는 아무도 안 잡았다**
 * (변이 검증에서 드러났다: `bogusRewardKey`를 넣어도 통과했다).
 *
 * 🔴 **중첩 객체형도 안 봤다.** `{"xp":{"velocity":3,"clutch":3}}`처럼 `xp`·
 * `statDelta` 값이 객체면, 위 검사는 최상위 키 `xp`만 보고 안쪽의 `velocity`·
 * `clutch`는 그냥 지나간다 — `DEC_HS_Y3_LAST_SCRIMMAGE`의 `xp.clutch`가 이래서
 * 한 번도 검사를 안 거쳤다. 안쪽 키도 문자열형과 같은 스탯 검증을 받는다.
 *
 * JSON 데이터는 TypeScript 검사를 안 받으므로 타입이 지켜 주지도 않는다.
 * ⚠ **여기 목록을 손으로 적지 않는다** — 위와 같은 이유로 타입에서 읽는다.
 */
const TY = fs.readFileSync("apps/ui/src/shared/types/main.ts", "utf8");
const tyBody = TY.slice(TY.indexOf("interface DecisionEffect"));
const objKeys = new Set(
  [...tyBody.slice(0, tyBody.indexOf("\n}")).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]));
if (objKeys.size === 0) {
  console.log("  🔴 DecisionEffect를 못 읽었다 — 정규식이 타입과 어긋났다");
  process.exit(1);
}

const DEC = JSON.parse(fs.readFileSync(
  "resource/data/master/messages/decision_templates.json", "utf8")).decisions;

const unknown = new Map();   // 키 → [decId#optId]
let strOpts = 0, objOpts = 0;
const used = new Set();
const mark = (m, k, where) => m.set(k, [...(m.get(k) ?? []), where]);

/** 객체형 최상위 키 하나(및 `xp`·`statDelta`면 그 안쪽까지) 검사한다.
 *  🔴 **배열형도 안쪽이 객체일 수 있다** — `["fatigue:+12", {xp:{...}}]`처럼
 *  문자열과 객체가 섞여도 이 함수로 똑같이 본다(현재 데이터엔 없지만, 파서가
 *  전제하지 않으면 다음에 들어올 때 또 조용히 새 나간다). */
function checkObjEffect(effects, where) {
  for (const [k, v] of Object.entries(effects)) {
    used.add(k);
    if (!objKeys.has(k)) { mark(unknown, k, where); continue; }
    if ((k === "xp" || k === "statDelta") && v && typeof v === "object" && !Array.isArray(v)) {
      for (const sub of Object.keys(v)) {
        const full = `${k}.${sub}`;
        used.add(full);
        if (!validStat(sub)) mark(unknown, full, where);
      }
    }
  }
}

for (const d of DEC) {
  for (const o of d.options ?? []) {
    const where = `${d.id}#${o.id}`;
    if (Array.isArray(o.effects)) {
      strOpts++;
      for (const e of o.effects) {
        if (typeof e === "object" && e !== null) { objOpts++; checkObjEffect(e, where); continue; }
        const i = e.indexOf(":");
        if (i === -1) { mark(unknown, e, where); continue; }
        const k = e.slice(0, i).trim();
        used.add(k);
        if (!known(k)) mark(unknown, k, where);
      }
    } else if (o.effects && typeof o.effects === "object") {
      objOpts++;
      checkObjEffect(o.effects, where);
    }
  }
}

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[보상 키] 결정 템플릿 ${DEC.length}개 · 선택지 문자열형 ${strOpts} / 객체형 ${objOpts}`);
log(`  파서가 아는 것: ${[...exact].sort().join(" ")}  +  ${prefixes.map((p) => p + "*").join(" ")}`);
log(`  DecisionEffect가 아는 것 ${objKeys.size}종: ${[...objKeys].sort().join(" ")}`);
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
