// 개인 재정 20시즌 실측 (Phase 7-5 F-5)
//
// **예측하지 않는다.** 세율 구간·스폰서 폭·구독 비용·투자 수익률을 각각 정해도
// 20년을 굴렸을 때 자산이 얼마가 되는지는 곱해봐야 안다. 이 프로젝트는
// "감독 생존 45~55%"라고 예측했다가 실측 13%로 틀린 적이 있다(_ledger P6-6).
//
// 실행: npm run measure:finance

const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

const R = gr.financeRules;
const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};
const won = (v) => {
  const abs = Math.abs(v);
  if (abs >= 10000) return `${(v / 10000).toFixed(2)}억`;
  return `${Math.round(v).toLocaleString()}만`;
};

// ── 커리어 궤적 (연봉·명성) ──────────────────────────────────
//
// 실제 게임의 성장을 흉내내지 않는다 — 재정만 보려는 것이므로 세 유형의
// 대표 궤적을 손으로 깐다. 어차피 "이 연봉대에서 자산이 어떻게 되나"가 질문이다.
const CAREERS = {
  "저연차 방출형 (5년)": {
    years: 5,
    salary: (y) => [3000, 3200, 3600, 4200, 4500][y] ?? 4500,
    fame:   (y) => 5 + y * 4,
  },
  "중견 롱런형 (15년)": {
    years: 15,
    salary: (y) => Math.round(3000 * Math.pow(1.22, y)),
    fame:   (y) => Math.min(70, 8 + y * 4.5),
  },
  "특급 스타형 (20년)": {
    years: 20,
    salary: (y) => Math.round(3000 * Math.pow(1.30, Math.min(y, 12)) * (y > 12 ? Math.pow(0.94, y - 12) : 1)),
    fame:   (y) => Math.min(95, 15 + y * 5.5),
  },
};

const STRATEGIES = {
  "구독 안 함 · 예금": { subs: [], invest: "DEPOSIT" },
  "1단계 2개 · 펀드":  { subs: [{ areaId: "PITCH", tier: 1 }, { areaId: "PHYSICAL", tier: 1 }], invest: "FUND" },
  "상시 3개 · 사업":   { subs: R.training.areas.map((a) => ({ areaId: a.id, tier: 2 })), invest: "VENTURE" },
};

console.log("═".repeat(78));
console.log("개인 재정 20시즌 실측 — 단위 만원");
console.log("═".repeat(78));

for (const [careerName, career] of Object.entries(CAREERS)) {
  console.log(`\n■ ${careerName}`);
  console.log("  " + "─".repeat(74));

  for (const [stratName, strat] of Object.entries(STRATEGIES)) {
    // 신인 계약금(1순위 5억은 특급만) + 초기 자산
    const signBonus = careerName.startsWith("특급") ? 50000
      : careerName.startsWith("중견") ? 12000 : 2000;
    const bonusTax = Math.round(signBonus * R.tax.otherIncomeRate);
    let cash = 1200 + signBonus - bonusTax;

    let peakSalary = 0, totalTax = bonusTax, totalSponsor = 0;
    let investProfit = 0, worstYear = Infinity;
    let subCostTotal = 0;

    for (let y = 0; y < career.years; y++) {
      const salary = career.salary(y);
      const fame = career.fame(y);
      peakSalary = Math.max(peakSalary, salary);

      // 스폰서 — 명성이 정한다
      const sp = call("calcSponsorOffersNative", {
        rules: R.sponsor, fame, salary, careerStage: "pro",
        prMod: 1.0, signedCategoryIds: [],
      });
      totalSponsor += sp.totalAnnual;

      // 52주 순현금
      const w = call("calcWeeklyFinanceNative", {
        rules: R, careerStage: "pro", salary,
        sponsorAnnual: sp.totalAnnual, subscriptions: strat.subs, treatmentWeekly: 0,
      });
      cash += w.netWeekly * 52;
      totalTax += w.taxAnnual;
      subCostTotal += w.expense.find((e) => e.label.includes("구독"))?.amount * 52 || 0;
      worstYear = Math.min(worstYear, w.netWeekly);

      // 시즌말 투자 — 현금의 1/4
      if (cash >= R.investment.minCash) {
        const amount = Math.floor(cash / 4 / 100) * 100;
        const inv = call("resolveInvestmentNative", {
          rules: R.investment, optionId: strat.invest, amount,
        });
        cash += inv.profit;
        investProfit += inv.profit;
      }
      if (cash < 0) cash = 0;
    }

    const bonus = call("calcTrainingBonusNative", {
      rules: R.training, subscriptions: strat.subs, teamFacility: 1.0,
    });

    console.log(
      `  ${stratName.padEnd(20)} 최종 ${won(cash).padStart(8)}` +
      ` | 세금 ${won(totalTax).padStart(8)}` +
      ` | 스폰서 ${won(totalSponsor).padStart(8)}` +
      ` | 투자손익 ${(investProfit >= 0 ? "+" : "") + won(investProfit)}` +
      ` | 훈련 +${(bonus.byArea.reduce((a, b) => a + b.effective, 0) * 100).toFixed(1)}%`
    );
    if (worstYear < 0) {
      console.log(`  ${" ".repeat(20)} ⚠ 최악 주간 순현금 ${worstYear}만원 — 적자 구간이 있었다`);
    }
  }
}

// ── 세율 곡선 ────────────────────────────────────────────────
console.log("\n" + "═".repeat(78));
console.log("실효 세율 곡선 (연봉만, 스폰서 제외)");
console.log("═".repeat(78));
for (const salary of [3000, 5000, 8000, 12000, 20000, 40000, 80000, 200000]) {
  const w = call("calcWeeklyFinanceNative", {
    rules: R, careerStage: "pro", salary, sponsorAnnual: 0,
    subscriptions: [], treatmentWeekly: 0,
  });
  const bar = "█".repeat(Math.round(w.effectiveTaxRate * 60));
  console.log(`  연봉 ${won(salary).padStart(7)} → 세금 ${won(w.taxAnnual).padStart(8)}` +
    ` (${(w.effectiveTaxRate * 100).toFixed(1)}%) ${bar}`);
}

// ── 스폰서 곡선 ──────────────────────────────────────────────
console.log("\n" + "═".repeat(78));
console.log("명성 → 스폰서 (연봉 2억 기준)");
console.log("═".repeat(78));
for (let fame = 0; fame <= 100; fame += 10) {
  const sp = call("calcSponsorOffersNative", {
    rules: R.sponsor, fame, salary: 20000, careerStage: "pro",
    prMod: 1.0, signedCategoryIds: [],
  });
  const pct = (sp.totalAnnual / 20000) * 100;
  const bar = "█".repeat(Math.round(pct / 1.2));
  console.log(`  명성 ${String(fame).padStart(3)} → ${won(sp.totalAnnual).padStart(8)}` +
    ` (연봉의 ${pct.toFixed(1)}%, ${sp.offers.length}건${sp.capped ? " 상한적용" : ""}) ${bar}`);
}

// ── 팀 자원 반비례 ───────────────────────────────────────────
console.log("\n" + "═".repeat(78));
console.log("개인 트레이닝 — 팀 시설에 반비례 (상시 3개 기준)");
console.log("═".repeat(78));
const allSubs = R.training.areas.map((a) => ({ areaId: a.id, tier: 2 }));
for (const [label, fac] of [["독립리그 0.85", 0.85], ["고교 0.90", 0.90], ["대학 0.95", 0.95],
                            ["프로 2군 1.00", 1.00], ["프로 1군 1.15", 1.15], ["명문 1군 1.32", 1.32]]) {
  const b = call("calcTrainingBonusNative", { rules: R.training, subscriptions: allSubs, teamFacility: fac });
  const total = b.byArea.reduce((a, x) => a + x.effective, 0);
  console.log(`  ${label.padEnd(14)} 배수 ×${b.inverseFactor.toFixed(2)} → 훈련 +${(total * 100).toFixed(1)}%` +
    ` (기본 +${(b.byArea.reduce((a, x) => a + x.base, 0) * 100).toFixed(1)}%)`);
}

// ── 투자 분포 ────────────────────────────────────────────────
console.log("\n" + "═".repeat(78));
console.log("투자 1억 × 5000회 분포");
console.log("═".repeat(78));
for (const opt of R.investment.options) {
  const runs = [];
  for (let i = 0; i < 5000; i++) {
    runs.push(call("resolveInvestmentNative", { rules: R.investment, optionId: opt.id, amount: 10000 }).profit);
  }
  runs.sort((a, b) => a - b);
  const pct = (q) => runs[Math.floor(runs.length * q)];
  const lossRate = runs.filter((v) => v < 0).length / runs.length;
  console.log(`  ${opt.name.padEnd(8)} 하위5% ${won(pct(0.05)).padStart(8)}` +
    ` | 중앙 ${won(pct(0.5)).padStart(8)}` +
    ` | 상위5% ${won(pct(0.95)).padStart(8)}` +
    ` | 손실 ${(lossRate * 100).toFixed(1)}%`);
}

console.log("\n" + "═".repeat(78));
console.log("이 숫자가 정본이다 — 문서에 옮겨 적으면 stale해진다. 필요하면 다시 돌릴 것.");
console.log("═".repeat(78));
