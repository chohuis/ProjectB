"use strict";
/**
 * **성장형 몸값 계수를 고른다** — `npm run probe:a:bodyweight` (2026-09-10 · 사용자 확정 ①).
 *
 * 🔴 왜 재나. 30판 실측에서 성장형이 안전형에 **모든 칸에서 졌다**(통산승 36 대 73 ·
 *   최고 OVR 81 대 83). `growthValue` 가 `bodyCost` 를 한 번도 안 봐서
 *   **몸을 아예 안 보는 탐욕**이었기 때문이다.
 *
 * ⚠ 그런데 **세게 걸면 `safe` 와 같아진다** — 그러면 성향 셋이 둘이 된다.
 *   그래서 「얼마나 걸어야 하나」를 판을 돌리기 전에 **갈래 데이터로** 잰다:
 *   실제 이벤트 갈래(749종의 선택지)를 전부 꺼내, 계수마다
 *   **성장형이 안전형과 같은 답을 내는 비율**과 **성장형이 고른 갈래의 몸값**을 본다.
 *
 * 고르는 자리: **일치율이 100% 가 되기 전**(성향이 안 무너진다) 이면서
 * **몸값 평균이 눈에 띄게 내려간**(자해를 안 한다) 계수.
 *
 * ⚠ 판을 안 돌린다 — 몇 초다. 판은 계수를 고른 뒤에 돌린다.
 */
const fs = require("node:fs");
const path = require("node:path");
const M = path.join(process.cwd(), "resource/data/master");

// ── 갈래를 전부 꺼낸다 (결정 템플릿 + 이벤트에 직접 박힌 것) ──
const dec = JSON.parse(fs.readFileSync(path.join(M, "messages/decision_templates.json"), "utf8"));
const sets = [];
for (const d of dec.decisions ?? []) {
  const opts = (d.options ?? []).filter((o) => o.effects && Object.keys(o.effects).length > 0);
  if (opts.length >= 2) sets.push({ id: d.id, opts });
}
if (sets.length < 50) throw new Error(`[bodyweight] 갈래를 못 읽었다 (${sets.length}) — 검사가 눈이 멀었다`);

// ── 성향 자를 그대로 쓴다 (사본을 만들면 사본을 재게 된다) ──
const src = fs.readFileSync(path.join(process.cwd(), "apps/ui/src/shared/usecases/simPersona.ts"), "utf8");
const W = /GROWTH_BODY_WEIGHT = ([0-9.]+)/.exec(src);
const CURRENT = W ? Number(W[1]) : null;

const bodyCost = (fx) => (fx.fatigueDelta ?? 0) - (fx.conditionDelta ?? 0)
  + (fx.injuryRiskMod ? fx.injuryRiskMod.pct : 0);
const PRIMARY = ["velocity", "command", "control"];
const keyOf = (k) => (k.includes(".") ? k.split(".")[1] : k);
function growthValue(fx, w) {
  let v = 0;
  for (const [k, amt] of Object.entries(fx.statDelta ?? {})) {
    if (keyOf(k) === "ovr") continue;
    v += amt * (PRIMARY.includes(keyOf(k)) ? 120 : 80);
  }
  v += (fx.potentialDelta ?? 0) * 60 + (fx.devRateDelta ?? 0) * 12;
  if (fx.pitchGrant) v += 90;
  if (fx.pitchGradeUp) v += 70;
  if (fx.pitchProgressJump) v += fx.pitchProgressJump.pct * 0.8;
  if (fx.trainEffBoost) v += fx.trainEffBoost.pct * fx.trainEffBoost.weeks * 0.15;
  for (const [k, amt] of Object.entries(fx.xp ?? {})) v += amt * (PRIMARY.includes(keyOf(k)) ? 1.5 : 1.0);
  return v - w * bodyCost(fx);
}
const pickGrowth = (opts, w) => opts.reduce((a, b) => (growthValue(b.effects, w) > growthValue(a.effects, w) ? b : a));
const pickSafe = (opts) => opts.reduce((a, b) => (bodyCost(b.effects) < bodyCost(a.effects) ? b : a));

const LEVELS = String(process.env.PB_WEIGHTS || "0,1,2,3,5,8,12,20").split(",").map(Number);
console.log("");
console.log("── 성장형 몸값 계수 ──────────────────────────────────────");
console.log(`  갈래 ${sets.length}묶음 · 지금 값 ${CURRENT ?? "?"}`);
console.log("");
console.log("  계수   안전형과 같은 답   고른 갈래 몸값 평균   스탯 갈래를 고른 비율");
const base = {};
for (const w of LEVELS) {
  let same = 0, body = 0, stat = 0;
  for (const s of sets) {
    const g = pickGrowth(s.opts, w);
    if (g === pickSafe(s.opts)) same++;
    body += bodyCost(g.effects);
    if (g.effects.statDelta && Object.keys(g.effects.statDelta).length) stat++;
  }
  const row = { w, same: same / sets.length, body: body / sets.length, stat: stat / sets.length };
  if (w === 0) Object.assign(base, row);
  console.log(`  ${String(w).padStart(4)}   ${(row.same * 100).toFixed(1).padStart(8)}%`
    + `   ${row.body.toFixed(2).padStart(14)}`
    + `   ${(row.stat * 100).toFixed(1).padStart(14)}%`
    + (w === CURRENT ? "   ← 지금" : ""));
}
console.log("");
console.log("  읽는 법: 일치율이 **100% 에 닿으면 성향이 둘로 무너진다**.");
console.log("           몸값 평균이 안 내려가면 **고친 게 없다**.");
console.log("           스탯 비율이 크게 떨어지면 **성장형이 성장을 포기한 것**이다.");
