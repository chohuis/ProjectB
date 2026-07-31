// 개인 재정 회귀 (Phase 7-5 F-3)
//
// 재정은 **단위 하나 틀리면 조용히 파산**한다. 실제로 치료비만 원 단위로
// 만원 단위 money에서 빼고 있어서 보존 치료 한 주에 자산이 0이 됐다(F-0).
// 그래서 이 테스트의 절반은 단위 대조다.
//
// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/test-finance.cjs

const path = require("node:path");
const fs = require("node:fs");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

const R = gr.financeRules;
let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "ok " : "FAIL"} ${msg}`);
  if (!cond) fail++;
};
const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};
const weekly = (over) => call("calcWeeklyFinanceNative", {
  rules: R, careerStage: "pro", salary: 3000, sponsorAnnual: 0,
  subscriptions: [], treatmentWeekly: 0, ...over,
});

// ══ 1. 단위 — 전부 만원이다 ══════════════════════════════════════
console.log("\n[1] 단위가 만원으로 통일돼 있다");

// 드래프트 계약금이 스케일의 기준이다 (1순위 5억 = 50000)
const topBonus = gr.draftRules.contract.byPick[0].bonus;
ok(topBonus === 50000, `드래프트 1순위 계약금 ${topBonus} = 5억 (만원 단위)`);
ok(gr.salaryRules.minSalary.LEAGUE_KBL === 3000, "프로 최저연봉 3000 = 3천만원");

// 재정 규칙의 모든 금액이 같은 자릿수대인가 — 원 단위가 섞이면 여기서 튄다
const amounts = [
  ...Object.values(R.stages).flatMap((s) => [s.income, s.expense]),
  ...R.training.tiers.map((t) => t.weeklyCost),
  R.investment.minCash, R.sponsor.minSalaryBase,
].filter((v) => v > 0);
ok(amounts.every((v) => v < 100000),
   `재정 규칙의 금액이 전부 10억 미만이다 (최대 ${Math.max(...amounts)}) — 원 단위가 섞이면 여기서 튄다`);

// 치료비도 같은 단위 (F-0에서 고친 것 — 회귀 방지)
const aw = fs.readFileSync(path.join(ROOT, "apps/ui/src/shared/usecases/advanceWeek.ts"), "utf-8");
const block = aw.slice(aw.indexOf("weeklyTreatmentCost"), aw.indexOf("weeklyTreatmentCost") + 400);
const treat = [...block.matchAll(/:\s*(\d[\d_]*)/g)].map((m) => Number(m[1].replace(/_/g, "")));
ok(treat.length > 0 && treat.every((v) => v < 1000),
   `치료비 ${treat.join("/")} — 만원 단위 (원 단위면 한 주에 자산이 0이 된다)`);

// ══ 2. 누진세 ════════════════════════════════════════════════════
console.log("\n[2] 누진세 — 구간을 넘어도 실수령이 줄지 않는다");

for (const b of R.tax.brackets) {
  if (b.until <= 0) continue;
  const lo = weekly({ salary: b.until - 1 });
  const hi = weekly({ salary: b.until + 1 });
  ok(hi.grossAnnual - hi.taxAnnual >= lo.grossAnnual - lo.taxAnnual,
     `과세표준 ${b.until} 경계에서 실수령 역전 없음 (${lo.grossAnnual - lo.taxAnnual} → ${hi.grossAnnual - hi.taxAnnual})`);
}

const topRate = R.tax.brackets[R.tax.brackets.length - 1].rate;
const huge = weekly({ salary: 500000 });
ok(huge.effectiveTaxRate < topRate,
   `초고액에서도 실효세율 ${(huge.effectiveTaxRate * 100).toFixed(1)}% < 명목 최고 ${(topRate * 100).toFixed(0)}% (누진공제 작동)`);

// 학생·군은 비과세
for (const stage of ["highschool", "university", "military"]) {
  const w = weekly({ careerStage: stage, salary: null });
  ok(w.taxWeekly === 0 && w.netWeekly > 0,
     `${stage} — 비과세 · 순현금 +${w.netWeekly}만원/주`);
}

// ══ 3. 계약금은 연봉과 합산하지 않는다 ═══════════════════════════
console.log("\n[3] 스폰서·계약금은 분리과세 (합산하면 신인이 파산한다)");

const noSponsor  = weekly({ salary: 3000, sponsorAnnual: 0 });
const bigSponsor = weekly({ salary: 3000, sponsorAnnual: 50000 });
const sponsorTax = bigSponsor.taxAnnual - noSponsor.taxAnnual;
ok(Math.abs(sponsorTax - 50000 * R.tax.otherIncomeRate) < 2,
   `스폰서 5억에 붙은 세금 ${sponsorTax} = 5억×${(R.tax.otherIncomeRate * 100).toFixed(0)}% 분리과세`);
ok(bigSponsor.netWeekly > noSponsor.netWeekly,
   "스폰서를 받으면 순현금이 는다 (합산과세면 줄어들 수 있다)");

// ══ 4. 스폰서 — 명성이 계단이 아니라 경사다 ══════════════════════
console.log("\n[4] 스폰서는 명성 문턱 + 문턱 위 경사");

const sponsorAt = (fame, over = {}) => call("calcSponsorOffersNative", {
  rules: R.sponsor, fame, salary: 20000, careerStage: "pro",
  prMod: 1.0, signedCategoryIds: [], ...over,
});

ok(sponsorAt(0).offers.length === 0, "무명에게는 제안이 없다");
const firstGate = R.sponsor.categories[0].fameMin;
ok(sponsorAt(firstGate - 1).offers.length === 0, `명성 ${firstGate - 1} — 문턱 미달`);
ok(sponsorAt(firstGate).offers.length >= 1, `명성 ${firstGate} — 첫 카테고리 개방`);

const lowOffer  = sponsorAt(firstGate).offers[0].annual;
const highOffer = sponsorAt(firstGate + R.sponsor.fameSpan).offers[0].annual;
ok(highOffer > lowOffer,
   `같은 카테고리 안에서도 명성이 높으면 더 받는다 (${lowOffer} → ${highOffer}만원)`);

const full = sponsorAt(99);
ok(full.offers.length === R.sponsor.categories.length, `명성 99 — 4카테고리 전부 (${full.offers.length}개)`);
ok(full.totalAnnual / 20000 <= R.sponsor.maxTotalPct + 1e-6,
   `합계가 연봉의 ${(full.totalAnnual / 20000 * 100).toFixed(1)}% ≤ 상한 ${(R.sponsor.maxTotalPct * 100).toFixed(0)}%`);

// 사용자 확정: 연봉의 10~40%
const mid = sponsorAt(60);
const midPct = mid.totalAnnual / 20000;
ok(midPct >= 0.10 && midPct <= 0.40,
   `명성 60 기준 스폰서가 연봉의 ${(midPct * 100).toFixed(1)}% — 확정 범위 10~40% 안`);

// 학생·독립은 제외
for (const stage of ["highschool", "university", "independent"]) {
  ok(sponsorAt(99, { careerStage: stage }).offers.length === 0,
     `${stage} — 스폰서 없음 (아마추어 규정)`);
}

// 구단주 홍보력이 금액을 민다 (§7-5 F-1)
const prLow  = sponsorAt(60, { prMod: 0.85 }).totalAnnual;
const prHigh = sponsorAt(60, { prMod: 1.25 }).totalAnnual;
ok(prHigh > prLow, `구단주 홍보력이 스폰서 금액을 민다 (${prLow} < ${prHigh})`);

// 이미 계약한 카테고리는 다시 안 온다
const signed = sponsorAt(99, { signedCategoryIds: [R.sponsor.categories[0].id] });
ok(!signed.offers.some((o) => o.categoryId === R.sponsor.categories[0].id),
   "계약 중인 카테고리는 중복 제안하지 않는다");

// ══ 5. 개인 트레이닝 — 팀 자원에 반비례 ══════════════════════════
console.log("\n[5] 개인 트레이닝 보너스가 팀 자원에 반비례한다 (DESIGN §7.3)");

const bonusAt = (fac) => call("calcTrainingBonusNative", {
  rules: R.training, teamFacility: fac,
  subscriptions: [{ areaId: R.training.areas[0].id, tier: 2 }],
});
const poor = bonusAt(0.85);
const rich = bonusAt(1.15);
ok(poor.byArea[0].effective > rich.byArea[0].effective,
   `열악한 팀에서 더 먹힌다 (${(poor.byArea[0].effective * 100).toFixed(2)}% > ${(rich.byArea[0].effective * 100).toFixed(2)}%)`);
ok(rich.byArea[0].effective > 0,
   "좋은 팀에서도 0이 되지 않는다 — 0이면 구독 토글이 죽은 UI가 된다");
ok(rich.inverseFactor >= 0.60 && poor.inverseFactor <= 1.40,
   `반비례 배수가 하한 0.60 ~ 상한 1.40 안 (${rich.inverseFactor} ~ ${poor.inverseFactor})`);

// ══ 6. 구독이 공짜 버프가 아니다 ═════════════════════════════════
console.log("\n[6] 구독 비용이 실제로 순현금을 깎는다");

const bare = weekly({ salary: 3000, subscriptions: [] });
const one  = weekly({ salary: 3000, subscriptions: [{ areaId: "PITCH", tier: 1 }] });
const all  = weekly({ salary: 3000, subscriptions: R.training.areas.map((a) => ({ areaId: a.id, tier: 2 })) });

ok(one.netWeekly < bare.netWeekly, `1단계 구독이 순현금을 깎는다 (${bare.netWeekly} → ${one.netWeekly})`);
ok(one.netWeekly > 0, `최저연봉 + 1단계 구독은 감당된다 (+${one.netWeekly}만원/주)`);
ok(all.netWeekly < 0,
   `최저연봉으로 상시 구독 3개는 감당 안 된다 (${all.netWeekly}만원/주) — 감당되면 구독이 공짜 버프다`);

// 고연봉이면 전부 켤 수 있어야 한다 (성장의 보상이 있어야 한다)
const richPlayer = weekly({ salary: 50000, subscriptions: R.training.areas.map((a) => ({ areaId: a.id, tier: 2 })) });
ok(richPlayer.netWeekly > 0, `연봉 5억이면 전부 켜도 흑자 (+${richPlayer.netWeekly}만원/주)`);

// ══ 7. 투자 — 원금 손실 허용, 전액 소실 없음 ═════════════════════
console.log("\n[7] 투자 (원금 손실 허용, 2026-07-31 확정)");

const invest = (id, n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(call("resolveInvestmentNative", { rules: R.investment, optionId: id, amount: 10000 }));
  }
  return out;
};

for (const opt of R.investment.options) {
  const runs = invest(opt.id, 3000);
  const mean = runs.reduce((a, r) => a + r.rate, 0) / runs.length;
  const losses = runs.filter((r) => r.profit < 0).length;
  const minRate = Math.min(...runs.map((r) => r.rate));
  const zeroed = runs.filter((r) => r.payout <= 0).length;

  ok(Math.abs(mean - opt.mean) < 0.03,
     `${opt.name} 평균 수익률 ${(mean * 100).toFixed(2)}% ≈ 규칙 ${(opt.mean * 100).toFixed(0)}%`);
  ok(minRate >= opt.floor - 1e-9,
     `${opt.name} 하한 준수 (최저 ${(minRate * 100).toFixed(1)}% ≥ ${(opt.floor * 100).toFixed(0)}%)`);
  ok(zeroed === 0, `${opt.name} — 원금이 통째로 사라진 적 없다 (리셋 유도 방지)`);
  if (opt.sd === 0) {
    ok(losses === 0, `${opt.name} — 확정 수익 (손실 0건)`);
  } else {
    ok(losses > 0, `${opt.name} — 손실이 실제로 난다 (${losses}/3000건)`);
  }
}

const dep = R.investment.options.find((o) => o.id === "DEPOSIT");
const ven = R.investment.options.find((o) => o.id === "VENTURE");
ok(ven.mean > dep.mean && ven.sd > dep.sd, "고위험이 고수익·고변동이다 (선택에 의미가 있다)");

// ══ 8. 사치품 — 성격이 부호를 가른다 ═════════════════════════════
console.log("\n[8] 사치품 — 자기 소비는 성격에 따라 명성 부호가 갈린다");

const lux = (over) => call("calcLuxuryNative", {
  rules: R.luxury, cost: 500, onTeammate: false, diligence: 50, ...over,
});
const split = R.luxury.selfFameSplitDiligence;
ok(lux({ diligence: split - 20 }).fameDelta > 0, `과시형(diligence ${split - 20}) — 명성 상승`);
ok(lux({ diligence: split + 20 }).fameDelta < 0, `성실형(diligence ${split + 20}) — 씀씀이가 구설이 된다`);

const team = lux({ onTeammate: true, diligence: 90 });
ok(team.relationDelta > 0 && team.fameDelta === 0,
   `동료에게 쓰면 관계도만 움직인다 (+${team.relationDelta})`);
ok(team.relationDelta < 100,
   `밥 한 번(500만원)으로 절친이 되지 않는다 (+${team.relationDelta} / 관계도는 −100~100)`);

// ══ 9. 화면이 계산하지 않는다 ════════════════════════════════════
console.log("\n[9] FinancePage가 스스로 계산하지 않는다");

const page = fs.readFileSync(path.join(ROOT, "apps/ui/src/pages/finance/FinancePage.svelte"), "utf-8");
// 예전 이 파일은 OVR·사기로 수입을 즉석 계산했고 money와 무관한 숫자를 보여줬다
for (const pat of [/ovr\s*\*\s*[\d.]/i, /morale\s*\*\s*[\d.]/i, /condition\s*\*\s*[\d.]/i]) {
  ok(!pat.test(page), `능력치로 금액을 만드는 식이 없다 (${pat})`);
}
ok(/calcWeeklyFinance|calcSponsorOffers|calcTrainingBonus/.test(page),
   "재정 유스케이스를 통해 값을 받는다");
ok(!/buildIncome|buildExpense|buildSupportRows/.test(page),
   "구 즉석 계산 함수가 남아 있지 않다");

// ══ 10. 규칙 파일이 정본이다 ═════════════════════════════════════
console.log("\n[10] 표를 코드에 두 번 적지 않았다");

const financeTs = fs.readFileSync(path.join(ROOT, "apps/ui/src/shared/usecases/finance.ts"), "utf-8");
const codeOnly = financeTs.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
for (const v of [R.tax.otherIncomeRate, R.sponsor.maxTotalPct, ...R.investment.options.map((o) => o.mean)]) {
  ok(!new RegExp(`[^\\d.]${v}[^\\d]`).test(codeOnly),
     `계수 ${v}가 TS에 복제돼 있지 않다`);
}

// 구 Rust 상수 표가 사라졌는가
const weekRs = fs.readFileSync(path.join(ROOT, "packages/engine-native/src/week_engine.rs"), "utf-8");
ok(!/\(42 - 18\) \/ 4|\(62 - 21\) \/ 4/.test(weekRs),
   "week_engine.rs의 무대별 상수 표가 규칙 파일로 옮겨졌다");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
