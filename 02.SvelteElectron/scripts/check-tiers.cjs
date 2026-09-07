#!/usr/bin/env node
/**
 * **등급이 다 붙었고 등급 규칙을 지키는가.** (4-2 · B)
 *
 * ⚠ **이건 임시다.** 커버리지 정본 검사는 `check:tiercoverage`(A 4-1)가 된다 —
 *   여기는 4-2 가 스스로를 세는 자리이고, 그 검사가 오면 겹치는 줄을 지운다.
 *
 * ```
 * 등급 밖   주차 고정 필수(mandatory) · tier: "urgent"       — 등급 줄기를 안 탄다(§4)
 * 세 규칙   등급 없음 0 · 레어 이상 repeatable 0 · 유니크 이상 cost 없음 0
 * ```
 *
 * 🔴 **읽기만(선택지 없는 것)에도 등급이 붙는다.** §6 이 읽기만을 등급과 나란히
 *   세지만 §4 의 `tier` 값은 넷뿐이고, 선택지가 없어도 그 소식은 뜬다 —
 *   「늘 오는 것」이라 `normal` 이 맞다. 갈래를 붙이는 일은 그것과 별개다.
 */
const fs = require("node:fs");
const path = require("node:path");
const M = "resource/data/master";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const R = [];
for (const lane of ["mandatory", "conditional", "random"]) {
  for (const f of walk(path.join(M, "events", lane)).filter((x) => x.endsWith(".json"))) {
    R.push(JSON.parse(fs.readFileSync(f, "utf8")));
  }
}
const DEC = new Map(JSON.parse(fs.readFileSync(`${M}/messages/decision_templates.json`, "utf8"))
  .decisions.map((d) => [d.id, d]));

/** 무대 — `career_stage` 가 정본이다. `stage` 하나와 `stages` 배열을 둘 다 본다 */
const stagesOf = (r) => { const c = (r.conditions ?? []).find((x) => x.type === "career_stage"); return !c ? [] : Array.isArray(c.stages) ? c.stages : c.stage ? [c.stage] : []; };
const leaguesOf = (r) => { const c = (r.conditions ?? []).find((x) => x.type === "league_id"); return !c ? [] : Array.isArray(c.leagueIds) ? c.leagueIds : c.leagueId ? [c.leagueId] : []; };
const bucket = (r) => {
  if (r.id.startsWith("EVT_MILREUNION")) return "재회";
  if (leaguesOf(r).some((l) => l.endsWith("_FARM"))) return "2군";
  const st = stagesOf(r);
  if (!st.length) return "공용";
  if (st.includes("highschool")) return "고교";
  if (st.includes("university")) return "대학";
  if (st.every((x) => x === "independent")) return "독립";
  if (st.some((x) => x.startsWith("pro"))) return "프로";
  return "공용";
};
const outOfTier = (r) => r.type === "mandatory" || r.tier === "urgent";
const TIERS = ["normal", "rare", "unique", "hidden"];

const noTier = R.filter((r) => !outOfTier(r) && !TIERS.includes(r.tier));
const noTheme = R.filter((r) => !r.theme);
const rareRepeat = R.filter((r) => ["rare", "unique", "hidden"].includes(r.tier) && r.oncePolicy === "repeatable");
const uniqueNoCost = R.filter((r) => ["unique", "hidden"].includes(r.tier) && !r.cost);
/**
 * 노말 갈래 둘이 종류가 다른가 (§7-4).
 *
 * 🔴 **「성장」처럼 뭉뚱그리면 안 된다.** 처음엔 축(성장·관계·돈·사기·몸·이름·
 *   성실)으로 접어 셌더니 19건이 걸렸는데, 열여덟은 「릴리스를 잡는다(커맨드)」
 *   대 「변화구를 손본다(무브먼트)」처럼 **다른 스탯**이었다 — 고를 이유가 있는
 *   갈래를 결함으로 셌다. §7-4 가 말하는 건 「**같은 종류 크기만** 다르면」이라
 *   **효과 키와 부호**까지 봐야 뜻이 맞는다. 그렇게 재니 1건이었다.
 */
const kindOf = (fx) => {
  if (!fx || Array.isArray(fx)) return "없음";
  const k = [];
  for (const [key, v] of Object.entries(fx)) {
    if (key === "xp" || key === "statDelta") { for (const [s, n] of Object.entries(v)) k.push(`${key}.${s}${n >= 0 ? "+" : "-"}`); }
    else if (key === "relationDelta") k.push(`rel.${v.kind}${(v.delta ?? 0) >= 0 ? "+" : "-"}`);
    else k.push(`${key}${typeof v === "number" ? (v >= 0 ? "+" : "-") : ""}`);
  }
  return k.sort().join(" ") || "없음";
};
const sameKind = R.filter((r) => {
  if (r.tier !== "normal" || !r.decisionTemplateId) return false;
  const d = DEC.get(r.decisionTemplateId); if (!d || (d.options ?? []).length < 2) return false;
  const ks = new Set(d.options.map((o) => kindOf(o.effects)));
  return ks.size === 1 && !ks.has("없음");
});

const log = (s) => process.stdout.write(s + "\n");
log("");
log(`[등급] 규칙 ${R.length} · 등급 밖 ${R.filter(outOfTier).length}(필수 ${R.filter((r) => r.type === "mandatory").length} · urgent ${R.filter((r) => r.tier === "urgent").length})`);
log("");
const B = ["프로", "고교", "대학", "독립", "2군", "공용", "재회"];
log("무대".padEnd(8) + TIERS.map((t) => t.padStart(9)).join("") + "   읽기만      합");
for (const b of B) {
  const rows = R.filter((r) => bucket(r) === b && !outOfTier(r));
  const cnt = TIERS.map((t) => rows.filter((r) => r.tier === t).length);
  const ro = rows.filter((r) => !r.decisionTemplateId || !(DEC.get(r.decisionTemplateId)?.options ?? []).length).length;
  log(b.padEnd(8) + cnt.map((n) => String(n).padStart(9)).join("") + String(ro).padStart(9) + String(rows.length).padStart(9));
}
log("");
let bad = 0;
const rule = (n, what, list) => {
  if (n > 0) { bad++; log(`  🔴 ${what} ${n}건`); list.slice(0, 8).forEach((r) => log(`        ${r.id}`)); if (n > 8) log(`        … 그 밖 ${n - 8}건`); }
  else log(`  ok  ${what} 0건`);
};
rule(noTier.length, "등급 없는 이벤트(등급 밖 제외)", noTier);
rule(noTheme.length, "결(theme) 없는 이벤트", noTheme);
rule(rareRepeat.length, "레어 이상인데 repeatable", rareRepeat);
rule(uniqueNoCost.length, "유니크 이상인데 cost 없음", uniqueNoCost);
rule(sameKind.length, "노말인데 갈래 둘이 효과 키·부호까지 같음(크기만 다름)", sameKind);
log("");
if (bad) { log(`  🔴 어긴 규칙 ${bad}개`); log(""); process.exitCode = 1; }
