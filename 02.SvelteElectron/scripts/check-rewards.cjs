#!/usr/bin/env node
/**
 * **등급이 보상으로도 뜻을 지키는가** — `npm run check:rewards`
 *   (정본 `docs/PLAN_REWARDS_2026-09-09.md` §4 · 사용자 확정 2026-09-09)
 *
 * > 등급이 오르면 **크기가 아니라 종류가 바뀐다.**
 *
 * 이벤트가 733종에서 더 늘어도 그 선이 지켜지게 한다. 다섯 줄을 본다:
 *
 *   ① 등급별 보상 종류   노말에 스탯·잠재력·구종 · 레어에 스탯 직접 · 유니크/히든에 대가 없음
 *   ② 구종 보상 등급     노말·레어에 구종 열쇠 셋
 *   ③ 최소 보상         갈래 둘 이상인데 전부 효과 없음 · 갈래들의 효과가 서로 같음
 *   ④ XP 범위          노말 XP 4 이상 · 레어 XP 11 이상
 *   ⑤ (자리 비움) 구종 보상 조건 — 아래 참고
 *
 * 🔴 **효과에 두 꼴이 있다 — 객체형과 배열형(`"xp.command:+2"`).** 배열형을
 *   「효과 없음」으로 세면 **없는 결함 141건이 잡힌다**(2026-09-09 실측: 182 로
 *   보이던 것이 실제로는 41 이었다). 여기서는 둘 다 읽는다.
 *
 * ⚠ **구종 보상 조건 검사는 아직 못 넣는다.** 정본 §4 가 「새 구종을 주는데
 *   `pitch_learning:false` 조건이 없다 · 진행도 점프인데 `pitch_learning:true`
 *   가 없다」를 요구하는데, **조건 타입 `pitch_learning` 이 아직 없다**(A 몫).
 *   조건이 서면 여기 `⑤` 자리에 열 줄이면 붙는다 — 지금 넣으면 모르는 조건을
 *   찾는 검사가 되어 늘 빨강이다.
 *
 * ⚠ 통지(`notice`)와 필수(등급 없음)는 등급 줄기를 안 타므로 ①②④ 를 안 본다.
 *   ③(고를 뜻이 있는가)만 본다 — 그건 갈래의 문제가 아니라 **선택지의 문제**다.
 */
const fs = require("node:fs");
const path = require("node:path");
const M = "resource/data/master";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const RULES = ["mandatory", "conditional", "random"].flatMap((lane) =>
  walk(path.join(M, "events", lane)).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8"))));
const DEC = new Map(JSON.parse(fs.readFileSync(`${M}/messages/decision_templates.json`, "utf8"))
  .decisions.map((d) => [d.id, d]));

/** 효과를 **두 꼴 다** 읽어 `키+부호` 목록으로 편다 */
function normalize(fx) {
  if (!fx) return [];
  if (Array.isArray(fx)) {
    return fx.map((s) => {
      const t = String(s); const i = t.indexOf(":");
      const key = i < 0 ? t : t.slice(0, i);
      const val = i < 0 ? "" : t.slice(i + 1);
      return key + (val.startsWith("-") ? "-" : "+");
    });
  }
  const out = [];
  for (const [k, v] of Object.entries(fx)) {
    if (k === "xp" || k === "statDelta") { for (const [s, n] of Object.entries(v)) out.push(`${k}.${s}${n >= 0 ? "+" : "-"}`); }
    else if (k === "relationDelta") out.push(`relationDelta.${v.kind}${(v.delta ?? 0) >= 0 ? "+" : "-"}`);
    else out.push(k + (typeof v === "number" ? (v >= 0 ? "+" : "-") : ""));
  }
  return out;
}
const sig = (fx) => normalize(fx).sort().join(" ");
const isEmpty = (fx) => normalize(fx).length === 0;
/** 그 효과가 든 열쇠 이름들 — 배열형의 `xp.command` 도 `xp` 로 접는다 */
const keysOf = (fx) => new Set(normalize(fx).map((s) => s.replace(/[+-]$/, "").split(".")[0]));
const xpSum = (fx) => {
  if (!fx) return 0;
  if (Array.isArray(fx)) {
    return fx.filter((s) => String(s).startsWith("xp.")).reduce((a, s) => a + Math.abs(parseInt(String(s).split(":")[1], 10) || 0), 0);
  }
  return Object.values(fx.xp ?? {}).reduce((a, b) => a + Math.abs(+b || 0), 0);
};

const PITCH_KEYS = ["pitchGrant", "pitchGradeUp", "pitchProgressJump"];
const BIG_KEYS = ["statDelta", "stat", "potentialDelta"];
const GRADES = ["normal", "rare", "unique", "hidden"];

const bigInNormal = [], statInRare = [], pitchLow = [], noCost = [], xpOver = [], allEmpty = [], sameKind = [], pitchPair = [];
/**
 * 구종 보상의 **짝 조건** (정본 §2 · 사용자 확정).
 *
 * > 배우는 중이면 그 구종을 밀어 주고, 안 배우면 새 구종을 준다.
 *
 * 🔴 어긋나면 **조용히 아무 일도 안 난다** — 안 배우는데 진행도 점프를 받으면
 *   밀 것이 없고, 배우는 중에 새 구종을 받으면 배우던 것이 사라진다.
 *   오류도 로그도 없이 보상 한 번이 없어지는 자리라 검사로 잡는다.
 */
const PAIR_WANT = { pitchGrant: false, pitchGradeUp: true, pitchProgressJump: true };
for (const r of RULES) {
  const d = DEC.get(r.decisionTemplateId);
  const opts = (d?.options ?? []).filter((o) => o && typeof o === "object");
  // ③ 고를 뜻이 있는가 — 갈래가 하나뿐이면 안 본다(확인용 「알겠다」가 그렇다)
  if (opts.length >= 2) {
    if (opts.every((o) => isEmpty(o.effects))) allEmpty.push([r.id, r.tier ?? "필수", opts.length]);
    else if (new Set(opts.map((o) => sig(o.effects))).size === 1) sameKind.push([r.id, r.tier ?? "필수", sig(opts[0].effects)]);
  }
  if (!GRADES.includes(r.tier)) continue;
  if (["unique", "hidden"].includes(r.tier) && !r.cost) noCost.push([r.id, r.tier]);
  for (const o of opts) {
    const ks = keysOf(o.effects);
    if (r.tier === "normal") {
      for (const k of BIG_KEYS) if (ks.has(k)) bigInNormal.push([`${r.id}#${o.id}`, k]);
      if (xpSum(o.effects) >= 4) xpOver.push([`${r.id}#${o.id}`, "normal", xpSum(o.effects)]);
    }
    if (r.tier === "rare") {
      for (const k of ["statDelta", "stat"]) if (ks.has(k)) statInRare.push([`${r.id}#${o.id}`, k]);
      if (xpSum(o.effects) >= 11) xpOver.push([`${r.id}#${o.id}`, "rare", xpSum(o.effects)]);
    }
    if (r.tier === "normal" || r.tier === "rare") {
      for (const k of PITCH_KEYS) if (ks.has(k)) pitchLow.push([`${r.id}#${o.id}`, r.tier, k]);
    }
    // 짝 조건 — 숨은 조건에 있어도 된다(히든은 그쪽에 적는다)
    const pl = [...(r.conditions ?? []), ...(r.hiddenCondition ?? [])].find((c) => c.type === "pitch_learning");
    for (const k of PITCH_KEYS) {
      if (!ks.has(k)) continue;
      if (pl && pl.value === PAIR_WANT[k]) continue;
      pitchPair.push([`${r.id}#${o.id}`, k, pl ? `pitch_learning ${pl.value}(원하는 값 ${PAIR_WANT[k]})` : "조건 없음"]);
    }
  }
}

const log = (s) => process.stdout.write(s + "\n");
log("");
const byTier = {};
for (const r of RULES) byTier[r.tier ?? "필수"] = (byTier[r.tier ?? "필수"] ?? 0) + 1;
log(`[보상] 규칙 ${RULES.length} · ${Object.entries(byTier).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
log("");
let bad = 0;
const rule = (list, what, fmt) => {
  if (list.length > 0) { bad++; log(`  🔴 ${what} ${list.length}건`); list.slice(0, 10).forEach((x) => log("        " + fmt(x))); if (list.length > 10) log(`        … 그 밖 ${list.length - 10}건`); }
  else log(`  ok  ${what} 0건`);
};
rule(bigInNormal, "노말인데 스탯·잠재력을 준다", ([w, k]) => `${w.padEnd(44)}${k}`);
rule(statInRare, "레어인데 스탯을 직접 준다", ([w, k]) => `${w.padEnd(44)}${k}`);
rule(pitchLow, "노말·레어인데 구종을 준다", ([w, t, k]) => `${w.padEnd(40)}${t} · ${k}`);
rule(noCost, "유니크·히든인데 대가가 없다", ([id, t]) => `${id.padEnd(44)}${t}`);
rule(xpOver, "XP 가 등급 범위를 넘는다 (노말 4+ · 레어 11+)", ([w, t, n]) => `${w.padEnd(40)}${t} · XP ${n}`);
rule(allEmpty, "갈래 둘 이상인데 전부 효과가 없다", ([id, t, n]) => `${id.padEnd(40)}${t} · 갈래 ${n}`);
rule(sameKind, "갈래들의 효과가 서로 같다 — 고를 뜻이 없다", ([id, t, s]) => `${id.padEnd(40)}${t} · ${s}`);
rule(pitchPair, "구종 보상인데 짝 조건(`pitch_learning`)이 없거나 어긋난다", ([w, k, got]) => `${w.padEnd(40)}${k} · ${got}`);
log("");
if (bad) { log(`  🔴 어긴 규칙 ${bad}개`); log(""); process.exitCode = 1; }
