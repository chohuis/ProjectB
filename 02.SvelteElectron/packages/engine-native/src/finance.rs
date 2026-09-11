//! 개인 재정 (Phase 7-5 F-3)
//!
//! **단위는 전부 만원이다.** `money`·연봉·계약금·치료비가 같은 단위여야 한다 —
//! 예전엔 치료비만 원 단위라 보존 치료 한 주에 자산이 0이 됐다(F-0).
//!
//! 수치 정본은 `generation_rules.json`의 `financeRules`다. 여기에 표를 두 번째로
//! 적지 않는다.
//!
//! 화면(`FinancePage`)은 이 결과를 **표시만** 한다. 예전엔 Svelte 컴포넌트 안에서
//! OVR·사기로 수입을 즉석 계산해 `money`와 무관한 숫자를 보여주고 있었다.

use serde::{Deserialize, Serialize};

// ── 규칙 ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageAllowance {
    #[serde(default)]
    pub income: i64,
    #[serde(default)]
    pub expense: i64,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxBracket {
    /// 이 과세표준까지 `rate`. 0이면 상한 없음(최고구간)
    pub until: i64,
    pub rate: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxRules {
    pub brackets: Vec<TaxBracket>,
    pub other_income_rate: f64,
    #[serde(default)]
    pub student_exempt: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SponsorCategory {
    pub id: String,
    pub name: String,
    pub fame_min: f64,
    pub pct_min: f64,
    pub pct_max: f64,
    pub term_years: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SponsorRules {
    #[serde(default)]
    pub pro_only: bool,
    pub max_total_pct: f64,
    pub categories: Vec<SponsorCategory>,
    pub fame_span: f64,
    pub min_salary_base: i64,
}

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingTier {
    pub tier: i32,
    pub weekly_cost: i64,
    pub bonus: f64,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingSubRules {
    pub tiers: Vec<TrainingTier>,
    #[serde(default = "one")]
    pub team_resource_inverse: f64,
    /// 분야를 다 켜도 넘지 못하는 합계 상한. 0이면 상한 없음
    #[serde(default)]
    pub max_total_bonus: f64,
}

fn one() -> f64 { 1.0 }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentOption {
    pub id: String,
    pub name: String,
    pub mean: f64,
    pub sd: f64,
    pub floor: f64,
}

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentRules {
    #[serde(default)]
    pub pro_only: bool,
    pub min_cash: i64,
    pub options: Vec<InvestmentOption>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LuxuryRules {
    pub teammate_relation_per_cost: f64,
    pub self_fame_per_cost: f64,
    pub self_fame_split_diligence: f64,
}

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceRules {
    pub stages: std::collections::HashMap<String, StageAllowance>,
    pub tax: TaxRules,
    pub sponsor: SponsorRules,
    pub training: TrainingSubRules,
    pub investment: InvestmentRules,
    pub luxury: LuxuryRules,
}

// ── 세금 ──────────────────────────────────────────────────────

/// 누진세 — **구간을 넘어도 전액에 높은 세율이 붙지 않는다.**
///
/// 단일세율로 만들면 연봉이 1만원 오를 때 실수령이 줄어드는 구간이 생긴다.
/// 그건 버그로 읽히지 규칙으로 읽히지 않는다.
pub fn annual_tax(gross: i64, r: &TaxRules) -> i64 {
    if gross <= 0 { return 0; }
    let mut remaining = gross as f64;
    let mut prev = 0.0f64;
    let mut tax = 0.0f64;
    for b in &r.brackets {
        let cap = if b.until <= 0 { f64::INFINITY } else { b.until as f64 };
        let span = (cap - prev).max(0.0);
        let taxed = remaining.min(span);
        if taxed <= 0.0 { break; }
        tax += taxed * b.rate;
        remaining -= taxed;
        prev = cap;
        if remaining <= 0.0 { break; }
    }
    tax.round() as i64
}

/// 계약금·스폰서는 기타소득 분리과세. 연봉과 **합산하지 않는다** —
/// 합산하면 5억 계약금을 받은 신인이 그해 최고세율을 맞고 파산한다.
pub fn other_income_tax(gross: i64, r: &TaxRules) -> i64 {
    if gross <= 0 { return 0; }
    ((gross as f64) * r.other_income_rate).round() as i64
}

// ── 주간 재정 ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceLine {
    pub label: String,
    pub amount: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyFinanceParams {
    pub rules: FinanceRules,
    pub career_stage: String,
    /// 프로 연봉(연). 학생·군은 None
    #[serde(default)]
    pub salary: Option<i64>,
    /// 계약된 스폰서의 **연** 수입 합
    #[serde(default)]
    pub sponsor_annual: i64,
    /// 구독 중인 개인 트레이닝 (분야ID, 단계)
    #[serde(default)]
    pub subscriptions: Vec<Subscription>,
    /// 부상 치료비(주). advanceWeek이 이미 빼고 있으므로 표시용으로만 받는다
    #[serde(default)]
    pub treatment_weekly: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub area_id: String,
    pub tier: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyFinance {
    pub income: Vec<FinanceLine>,
    pub expense: Vec<FinanceLine>,
    pub gross_weekly: i64,
    pub tax_weekly: i64,
    pub expense_weekly: i64,
    /// 화면이 보여주는 "월 순현금흐름"의 주간 값. `money`에 그대로 더한다
    pub net_weekly: i64,
    /// 연 환산 (화면 표시용)
    pub gross_annual: i64,
    pub tax_annual: i64,
    pub effective_tax_rate: f64,
}

const WEEKS_PER_MONTH: f64 = 4.333_333;
const WEEKS_PER_YEAR: f64 = 52.0;

pub fn calc_weekly_finance(p: WeeklyFinanceParams) -> WeeklyFinance {
    let r = &p.rules;
    let is_pro = matches!(p.career_stage.as_str(), "pro" | "pro_kbl" | "pro_abl" | "pro_jbl");
    let stage_key = if is_pro { "pro" } else { p.career_stage.as_str() };
    let stage = r.stages.get(stage_key);

    let mut income: Vec<FinanceLine> = Vec::new();
    let mut expense: Vec<FinanceLine> = Vec::new();

    // ── 수입 ──
    let salary_annual = if is_pro { p.salary.unwrap_or(0).max(0) } else { 0 };
    let mut gross_weekly = 0i64;

    if salary_annual > 0 {
        let w = ((salary_annual as f64) / WEEKS_PER_YEAR).round() as i64;
        income.push(FinanceLine { label: "연봉(주할)".into(), amount: w });
        gross_weekly += w;
    }
    if p.sponsor_annual > 0 {
        let w = ((p.sponsor_annual as f64) / WEEKS_PER_YEAR).round() as i64;
        income.push(FinanceLine { label: "스폰서·광고".into(), amount: w });
        gross_weekly += w;
    }
    if let Some(st) = stage {
        if st.income > 0 {
            let w = ((st.income as f64) / WEEKS_PER_MONTH).round() as i64;
            let label = if st.label.is_empty() { "지원금".to_string() } else { st.label.clone() };
            income.push(FinanceLine { label, amount: w });
            gross_weekly += w;
        }
    }

    // ── 세금 — 학생·군은 면제 ──
    let student = matches!(p.career_stage.as_str(), "highschool" | "university" | "military");
    let (tax_annual, tax_weekly) = if r.tax.student_exempt && student {
        (0, 0)
    } else {
        // 연봉은 누진, 스폰서는 분리과세. 둘을 합산하지 않는 게 핵심이다
        let t = annual_tax(salary_annual, &r.tax) + other_income_tax(p.sponsor_annual, &r.tax);
        (t, ((t as f64) / WEEKS_PER_YEAR).round() as i64)
    };
    if tax_weekly > 0 {
        expense.push(FinanceLine { label: "세금(원천징수)".into(), amount: tax_weekly });
    }

    // ── 지출 ──
    let mut expense_weekly = tax_weekly;
    if let Some(st) = stage {
        if st.expense > 0 {
            let w = ((st.expense as f64) / WEEKS_PER_MONTH).round() as i64;
            expense.push(FinanceLine { label: "생활비".into(), amount: w });
            expense_weekly += w;
        }
    }
    let sub_cost = subscription_cost(&p.subscriptions, &r.training);
    if sub_cost > 0 {
        expense.push(FinanceLine { label: "개인 트레이닝 구독".into(), amount: sub_cost });
        expense_weekly += sub_cost;
    }
    if p.treatment_weekly > 0 {
        expense.push(FinanceLine { label: "부상 치료비".into(), amount: p.treatment_weekly });
        expense_weekly += p.treatment_weekly;
    }

    let gross_annual = salary_annual
        + p.sponsor_annual
        + stage.map(|s| ((s.income as f64) * 12.0).round() as i64).unwrap_or(0);

    WeeklyFinance {
        income,
        expense,
        gross_weekly,
        tax_weekly,
        expense_weekly,
        net_weekly: gross_weekly - expense_weekly,
        gross_annual,
        tax_annual,
        effective_tax_rate: if gross_annual > 0 {
            ((tax_annual as f64 / gross_annual as f64) * 1000.0).round() / 1000.0
        } else { 0.0 },
    }
}

pub fn subscription_cost(subs: &[Subscription], r: &TrainingSubRules) -> i64 {
    subs.iter()
        .filter_map(|s| r.tiers.iter().find(|t| t.tier == s.tier))
        .map(|t| t.weekly_cost)
        .sum()
}

// ── 개인 트레이닝 보너스 (팀 자원 반비례) ──────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingBonusParams {
    pub rules: TrainingSubRules,
    pub subscriptions: Vec<Subscription>,
    /// 팀 시설 계수 (구단주 facilityInvestment × 리그 시설). 1.0 = 중립
    #[serde(default = "one")]
    pub team_facility: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingBonusResult {
    /// 분야별 실효 보너스
    pub by_area: Vec<AreaBonus>,
    pub weekly_cost: i64,
    /// 팀 시설이 만든 배수 (1보다 작으면 좋은 팀이라 구독 효과가 준다)
    pub inverse_factor: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AreaBonus {
    pub area_id: String,
    pub tier: i32,
    /// 규칙 파일의 기본값
    pub base: f64,
    /// 팀 자원 반비례를 먹인 값 — 화면·성장이 쓰는 건 이쪽이다
    pub effective: f64,
}

/// **보너스가 팀 자원에 반비례한다** (DESIGN §7.3).
///
/// 시설 좋은 구단에선 개인 트레이닝의 한계효용이 낮다. 반대로 열악한 팀에선
/// 사비를 들이는 게 실제로 갈린다 — 약팀에 지명된 게 순수한 페널티로만
/// 남지 않게 하는 장치이기도 하다.
///
/// 하한 0.60을 둔 이유: 반비례가 너무 세면 좋은 팀에 간 순간 구독이 무의미해지고
/// 토글 자체가 죽은 UI가 된다.
pub fn calc_training_bonus(p: TrainingBonusParams) -> TrainingBonusResult {
    let strength = p.rules.team_resource_inverse.clamp(0.0, 2.0);
    let inverse = if strength <= 0.0 {
        1.0
    } else {
        (1.0 + (1.0 - p.team_facility) * strength).clamp(0.60, 1.40)
    };

    let mut by_area: Vec<AreaBonus> = p.subscriptions.iter().filter_map(|s| {
        let t = p.rules.tiers.iter().find(|t| t.tier == s.tier)?;
        Some(AreaBonus {
            area_id: s.area_id.clone(),
            tier: s.tier,
            base: t.bonus,
            effective: t.bonus * inverse,
        })
    }).collect();

    // 합계 상한 — 분야를 다 켜도 스태프 15종의 폭을 넘지 못한다.
    //
    // 20시즌 실측에서 3분야 상시가 훈련 +27%가 나왔다. 스태프 전체 폭이 15%인데
    // 구독 하나가 그걸 압도하면 "돈으로 성장을 산다"가 지배 루프가 되고,
    // 야구를 대체하지 않는다는 전제(DESIGN §7.3)가 깨진다.
    let cap = p.rules.max_total_bonus;
    if cap > 0.0 {
        let total: f64 = by_area.iter().map(|a| a.effective).sum();
        if total > cap {
            let scale = cap / total;
            for a in by_area.iter_mut() { a.effective *= scale; }
        }
    }
    for a in by_area.iter_mut() {
        a.effective = (a.effective * 10_000.0).round() / 10_000.0;
    }

    TrainingBonusResult {
        by_area,
        weekly_cost: subscription_cost(&p.subscriptions, &p.rules),
        inverse_factor: (inverse * 10_000.0).round() / 10_000.0,
    }
}

// ── 스폰서 오퍼 ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SponsorOfferParams {
    pub rules: SponsorRules,
    pub fame: f64,
    #[serde(default)]
    pub salary: Option<i64>,
    pub career_stage: String,
    /// 구단주 `prInfluence` 계수 (§7-5 F-1). 홍보력 있는 구단이면 오퍼가 후하다
    #[serde(default = "one")]
    pub pr_mod: f64,
    /// 이미 계약한 카테고리 — 중복 오퍼를 막는다
    #[serde(default)]
    pub signed_category_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SponsorOffer {
    pub category_id: String,
    pub name: String,
    /// **연** 금액 (만원)
    pub annual: i64,
    pub term_years: i32,
    /// 연봉 대비 비율 — 화면이 "연봉의 12%"라고 말할 수 있게
    pub pct_of_salary: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SponsorOfferResult {
    pub offers: Vec<SponsorOffer>,
    pub total_annual: i64,
    /// 상한(maxTotalPct)에 걸려 깎였나
    pub capped: bool,
}

/// 명성 연동 스폰서. **학생·독립은 제외**한다 — 아마추어 규정 위반이다.
///
/// 문턱을 겨우 넘은 선수와 한참 위인 선수가 같은 돈을 받으면 명성이 계단이 된다.
/// `fameSpan`으로 카테고리 안에서도 선형 보간한다.
pub fn calc_sponsor_offers(p: SponsorOfferParams) -> SponsorOfferResult {
    let r = &p.rules;
    let is_pro = matches!(p.career_stage.as_str(), "pro" | "pro_kbl" | "pro_abl" | "pro_jbl");
    if r.pro_only && !is_pro {
        return SponsorOfferResult { offers: vec![], total_annual: 0, capped: false };
    }

    let base = p.salary.unwrap_or(0).max(r.min_salary_base) as f64;
    let pr = p.pr_mod.clamp(0.75, 1.35);
    let mut offers: Vec<SponsorOffer> = Vec::new();

    for c in &r.categories {
        if p.fame < c.fame_min { continue; }
        if p.signed_category_ids.iter().any(|id| id == &c.id) { continue; }
        // 문턱 위로 얼마나 올라와 있나 (0~1)
        let t = if r.fame_span > 0.0 {
            ((p.fame - c.fame_min) / r.fame_span).clamp(0.0, 1.0)
        } else { 1.0 };
        let pct = c.pct_min + (c.pct_max - c.pct_min) * t;
        let annual = (base * pct * pr).round() as i64;
        if annual <= 0 { continue; }
        offers.push(SponsorOffer {
            category_id: c.id.clone(),
            name: c.name.clone(),
            annual,
            term_years: c.term_years,
            pct_of_salary: ((annual as f64 / base) * 1000.0).round() / 1000.0,
        });
    }

    // 상한 — 광고 수입이 연봉을 넘어가면 야구가 부업이 된다
    let cap = (base * r.max_total_pct).round() as i64;
    let mut total: i64 = offers.iter().map(|o| o.annual).sum();
    let capped = total > cap && cap > 0;
    if capped {
        let scale = cap as f64 / total as f64;
        for o in offers.iter_mut() {
            o.annual = ((o.annual as f64) * scale).round() as i64;
            o.pct_of_salary = ((o.annual as f64 / base) * 1000.0).round() / 1000.0;
        }
        total = offers.iter().map(|o| o.annual).sum();
    }

    SponsorOfferResult { offers, total_annual: total, capped }
}

// ── 투자 (시즌말) ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentParams {
    pub rules: InvestmentRules,
    pub option_id: String,
    /// 투자 원금 (만원)
    pub amount: i64,
    /// 판정 씨앗. **0이면(안 넘기면) 예전 그대로 `thread_rng`다** — 실제
    /// 플레이가 그쪽이다. 계측 모드에서만 호출부가 씨앗을 넘긴다
    /// (`measureMode.ts` · `finance.ts resolveInvestment`).
    #[serde(default)]
    pub seed: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentResult {
    pub option_id: String,
    pub name: String,
    pub principal: i64,
    /// 실현 수익률
    pub rate: f64,
    /// 손익 (음수 가능)
    pub profit: i64,
    /// 원금 + 손익
    pub payout: i64,
}

/// 시즌말 투자 정산. **원금 손실을 허용한다** (2026-07-31 사용자 확정).
///
/// 정규분포 근사(Box–Muller)에 `floor`로 하한을 둔다. 전액 소실을 안 만드는
/// 이유: 그건 세이브 리셋 유도라 재미가 아니라 벌이다.
pub fn resolve_investment(p: InvestmentParams) -> InvestmentResult {
    use rand::Rng;
    let opt = p.rules.options.iter().find(|o| o.id == p.option_id);
    let Some(opt) = opt else {
        return InvestmentResult {
            option_id: p.option_id, name: "-".into(),
            principal: p.amount, rate: 0.0, profit: 0, payout: p.amount,
        };
    };

    let rate = if opt.sd <= 0.0 {
        opt.mean
    } else {
        // 씨앗이 있으면 재현된다 — 없으면 예전 그대로 `thread_rng`
        let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
            use rand::SeedableRng;
            Box::new(rand::rngs::StdRng::seed_from_u64(p.seed))
        } else {
            Box::new(rand::thread_rng())
        };
        let u1: f64 = rng.gen::<f64>().max(1e-12);
        let u2: f64 = rng.gen();
        let z = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
        (opt.mean + opt.sd * z).max(opt.floor)
    };

    let profit = ((p.amount as f64) * rate).round() as i64;
    InvestmentResult {
        option_id: opt.id.clone(),
        name: opt.name.clone(),
        principal: p.amount,
        rate: (rate * 10_000.0).round() / 10_000.0,
        profit,
        payout: p.amount + profit,
    }
}

// ── 사치품 ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LuxuryParams {
    pub rules: LuxuryRules,
    pub cost: i64,
    /// true면 동료에게 쓴 것
    pub on_teammate: bool,
    /// 자기 소비의 명성 부호를 가르는 성격값
    #[serde(default)]
    pub diligence: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LuxuryResult {
    pub cost: i64,
    pub relation_delta: f64,
    pub fame_delta: f64,
}

/// 사치품 소비. 동료에게 쓰면 관계도가 오르고, 자기 소비는 **성격에 따라
/// 명성의 부호가 갈린다** (DESIGN §7.3).
///
/// 성실한 선수의 씀씀이는 구설이 되고, 과시형에겐 화제가 된다. 같은 지출이
/// 사람에 따라 다르게 읽히는 게 이 시스템의 요점이다.
pub fn calc_luxury(p: LuxuryParams) -> LuxuryResult {
    let r = &p.rules;
    let units = (p.cost as f64) / 100.0;
    if p.on_teammate {
        LuxuryResult {
            cost: p.cost,
            relation_delta: ((units * r.teammate_relation_per_cost * 100.0) * 100.0).round() / 100.0,
            fame_delta: 0.0,
        }
    } else {
        let sign = if p.diligence >= r.self_fame_split_diligence { -1.0 } else { 1.0 };
        LuxuryResult {
            cost: p.cost,
            relation_delta: 0.0,
            fame_delta: ((units * r.self_fame_per_cost * 100.0 * sign) * 100.0).round() / 100.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> FinanceRules {
        let raw = std::fs::read_to_string(
            concat!(env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json")
        ).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&raw).expect("파싱 실패");
        serde_json::from_value(v["financeRules"].clone()).expect("financeRules 파싱 실패")
    }

    #[test]
    fn 누진세는_구간을_넘어도_전액에_높은_세율을_안_붙인다() {
        let r = rules();
        // 구간 경계 바로 아래/위에서 실수령이 역전되면 안 된다
        for b in &r.tax.brackets {
            if b.until <= 0 { continue; }
            let lo = b.until - 1;
            let hi = b.until + 1;
            let net_lo = lo - annual_tax(lo, &r.tax);
            let net_hi = hi - annual_tax(hi, &r.tax);
            assert!(net_hi >= net_lo,
                "과세표준 {}→{}에서 실수령이 줄었다 ({} → {})", lo, hi, net_lo, net_hi);
        }
    }

    #[test]
    fn 세율은_소득이_오를수록_높아진다() {
        let r = rules();
        let mut prev = 0.0f64;
        for gross in [1000, 3000, 6000, 12000, 30000, 100000] {
            let eff = annual_tax(gross, &r.tax) as f64 / gross as f64;
            assert!(eff >= prev - 1e-9, "소득 {}에서 실효세율이 내려갔다", gross);
            prev = eff;
        }
        // 최고 구간에서도 명목 최고세율을 넘지 않는다 (누진공제가 작동한다는 뜻)
        let top = r.tax.brackets.last().unwrap().rate;
        let eff = annual_tax(1_000_000, &r.tax) as f64 / 1_000_000.0;
        assert!(eff < top, "실효세율 {:.3}이 명목 최고세율 {:.3} 이상이다", eff, top);
    }

    #[test]
    fn 계약금은_연봉과_합산하지_않는다() {
        let r = rules();
        // 1순위 계약금 5억을 연봉에 합산하면 그해 최고세율을 맞는다
        let bonus = 50_000i64;
        let separate = other_income_tax(bonus, &r.tax);
        let combined = annual_tax(3000 + bonus, &r.tax) - annual_tax(3000, &r.tax);
        assert!(separate < combined,
            "분리과세({})가 합산({})보다 무겁다 — 신인이 계약금 받고 파산한다", separate, combined);
    }

    #[test]
    fn 학생은_과세하지_않는다() {
        let r = rules();
        for stage in ["highschool", "university", "military"] {
            let out = calc_weekly_finance(WeeklyFinanceParams {
                rules: rules(), career_stage: stage.to_string(),
                salary: None, sponsor_annual: 0, subscriptions: vec![], treatment_weekly: 0,
            });
            assert_eq!(out.tax_weekly, 0, "{} 무대에 세금이 붙었다", stage);
            assert!(out.net_weekly > 0, "{} 무대 순현금이 음수다", stage);
        }
        assert!(r.tax.student_exempt);
    }

    #[test]
    fn 스폰서는_명성_문턱을_넘어야_붙는다() {
        let r = rules();
        let at = |fame: f64| calc_sponsor_offers(SponsorOfferParams {
            rules: r.sponsor.clone(), fame, salary: Some(20_000),
            career_stage: "pro".into(), pr_mod: 1.0, signed_category_ids: vec![],
        });
        assert_eq!(at(0.0).offers.len(), 0, "무명에게 스폰서가 붙었다");
        assert!(at(15.0).offers.len() >= 1);
        assert!(at(90.0).offers.len() > at(15.0).offers.len(), "명성이 카테고리를 안 연다");
        // 같은 카테고리 안에서도 명성이 높으면 더 받는다 — 계단이 아니라 경사여야 한다
        let low  = at(11.0).offers[0].annual;
        let high = at(34.0).offers[0].annual;
        assert!(high > low, "문턱을 겨우 넘은 선수와 한참 위가 같은 돈을 받는다");
    }

    #[test]
    fn 스폰서_합계는_연봉의_상한을_안_넘는다() {
        let r = rules();
        let out = calc_sponsor_offers(SponsorOfferParams {
            rules: r.sponsor.clone(), fame: 99.0, salary: Some(20_000),
            career_stage: "pro".into(), pr_mod: 1.35, signed_category_ids: vec![],
        });
        let pct = out.total_annual as f64 / 20_000.0;
        assert!(pct <= r.sponsor.max_total_pct + 1e-6,
            "광고 수입이 연봉의 {:.1}% — 야구가 부업이 됐다", pct * 100.0);
    }

    #[test]
    fn 학생에게는_스폰서가_안_붙는다() {
        let r = rules();
        for stage in ["highschool", "university", "independent"] {
            let out = calc_sponsor_offers(SponsorOfferParams {
                rules: r.sponsor.clone(), fame: 99.0, salary: Some(20_000),
                career_stage: stage.into(), pr_mod: 1.0, signed_category_ids: vec![],
            });
            assert_eq!(out.offers.len(), 0, "{}에 스폰서가 붙었다 — 아마추어 규정 위반", stage);
        }
    }

    #[test]
    fn 개인_트레이닝은_팀_자원에_반비례한다() {
        let r = rules();
        let subs = vec![Subscription { area_id: "PITCH".into(), tier: 2 }];
        let at = |fac: f64| calc_training_bonus(TrainingBonusParams {
            rules: r.training.clone(), subscriptions: subs.clone(), team_facility: fac,
        });
        let poor = at(0.85);
        let rich = at(1.15);
        assert!(poor.by_area[0].effective > rich.by_area[0].effective,
            "열악한 팀에서 개인 트레이닝이 더 먹혀야 한다 ({} vs {})",
            poor.by_area[0].effective, rich.by_area[0].effective);
        // 좋은 팀에서도 0이 되지는 않는다 — 그러면 토글이 죽은 UI다
        assert!(rich.by_area[0].effective > 0.0);
        assert!(rich.inverse_factor >= 0.60);
    }

    #[test]
    fn 투자는_원금_손실을_허용하되_전액_소실은_없다() {
        let r = rules();
        let venture = r.investment.options.iter().find(|o| o.id == "VENTURE").unwrap().clone();
        let mut any_loss = false;
        for _ in 0..2000 {
            let out = resolve_investment(InvestmentParams {
                rules: r.investment.clone(), option_id: "VENTURE".into(), amount: 10_000,
                seed: 0,   // 분포를 보는 검사라 매번 다른 게 맞다
            });
            if out.profit < 0 { any_loss = true; }
            assert!(out.payout > 0, "원금이 통째로 사라졌다 (payout {})", out.payout);
            assert!(out.rate >= venture.floor - 1e-9, "하한 {} 아래로 갔다: {}", venture.floor, out.rate);
        }
        assert!(any_loss, "고위험 선택지인데 2000번 중 손실이 한 번도 없다");

        // 예금은 확정
        let dep = resolve_investment(InvestmentParams {
            rules: r.investment.clone(), option_id: "DEPOSIT".into(), amount: 10_000, seed: 0,
        });
        assert!(dep.profit > 0 && dep.rate > 0.0);
    }

    #[test]
    fn 사치품은_성격에_따라_명성_부호가_갈린다() {
        let r = rules();
        let lazy = calc_luxury(LuxuryParams {
            rules: r.luxury.clone(), cost: 500, on_teammate: false, diligence: 20.0,
        });
        let diligent = calc_luxury(LuxuryParams {
            rules: r.luxury.clone(), cost: 500, on_teammate: false, diligence: 90.0,
        });
        assert!(lazy.fame_delta > 0.0, "과시형인데 명성이 안 올랐다");
        assert!(diligent.fame_delta < 0.0, "성실한 선수의 씀씀이가 구설이 안 된다");

        let team = calc_luxury(LuxuryParams {
            rules: r.luxury.clone(), cost: 500, on_teammate: true, diligence: 90.0,
        });
        assert!(team.relation_delta > 0.0 && team.fame_delta == 0.0,
            "동료에게 쓴 건 관계도만 움직여야 한다");
    }

    #[test]
    fn 프로_순현금은_구독을_켜도_양수다() {
        // 최저연봉 선수가 구독 2개를 켜면 파산하는지 — 밸런스 하한 확인
        let out = calc_weekly_finance(WeeklyFinanceParams {
            rules: rules(), career_stage: "pro".into(),
            salary: Some(3000), sponsor_annual: 0,
            subscriptions: vec![
                Subscription { area_id: "PITCH".into(), tier: 1 },
                Subscription { area_id: "MENTAL".into(), tier: 1 },
            ],
            treatment_weekly: 0,
        });
        assert!(out.net_weekly > 0,
            "최저연봉 + 1단계 구독 2개에서 순현금이 {} — 신인이 구독을 못 쓴다", out.net_weekly);

        // 상시 구독 2개는 최저연봉으로 감당이 안 돼야 한다 (선택에 무게가 있어야 한다)
        let heavy = calc_weekly_finance(WeeklyFinanceParams {
            rules: rules(), career_stage: "pro".into(),
            salary: Some(3000), sponsor_annual: 0,
            subscriptions: vec![
                Subscription { area_id: "PITCH".into(), tier: 2 },
                Subscription { area_id: "PHYSICAL".into(), tier: 2 },
                Subscription { area_id: "MENTAL".into(), tier: 2 },
            ],
            treatment_weekly: 0,
        });
        assert!(heavy.net_weekly < 0,
            "최저연봉으로 상시 구독 3개가 감당된다 — 구독이 공짜 버프가 된다");
    }
}

// ── 구단 재정 (4-C · 2026-08-29) ──────────────────────────────
//
// 🔴 **구단 수입이 통째로 없었다.** 팀 예산은 `refs.json`의 정적값이고
//   관중·중계권·스폰서 개념이 없었다(`attendance`는 학업 출결이고 스폰서는
//   주인공 개인 재정이다).
//
// ⚠ **시즌 종료에 한 번** 돈다(사용자 확정). 경기마다 재면 주 진행이
//   그만큼 느려진다 — 실측으로 주당 약 20,000경기가 돈다.
//
// ⚠ 수치 정본은 `generation_rules.json`의 `clubFinanceRules`다.

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceRules {
    pub base: f64,
    pub win_pct_span: f64,
    pub market_appeal_span: f64,
    pub prestige_span: f64,
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RevenueShare {
    pub gate: f64,
    pub parent: f64,
    pub tv: f64,
    pub sponsor: f64,
    pub goods: f64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PostseasonBonus {
    pub qualified: f64,
    pub runner_up: f64,
    pub champion: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubRevenueParams {
    pub attendance: AttendanceRules,
    /// 그 팀의 수입 구조 — 호출부가 유형표에서 골라 넘긴다
    pub share: RevenueShare,
    pub postseason: PostseasonBonus,
    /// 스폰서가 명성을 타는 폭
    pub sponsor_prestige_span: f64,

    /// **정적 기준 규모** (만원) — `refs.json`의 원래 예산이다.
    ///
    /// 🔴 처음엔 여기에 **누적 예산**을 넣었다. 그러면
    ///   `새 예산 = 예산 + 수입 − 지출`이 `예산 × 1.33`이 되어
    ///   **매년 33%씩 발산한다**(실측: 164 → 206 → 256억).
    ///   모기업·중계·스폰서가 이 값에 비례하기 때문이다.
    /// ⚠ 이건 고정값이다 — 되먹임이 없다.
    pub base_scale: f64,
    /// 리그 평균 기준 규모 — **중계권은 균등 배분**이라 이걸 쓴다
    pub league_avg_scale: f64,
    pub ticket_price: f64,
    pub capacity: f64,
    pub home_games: f64,

    pub win_pct: f64,
    pub market_appeal: f64,
    pub prestige: f64,
    /// 0=미진출 · 1=진출 · 2=준우승 · 3=우승
    #[serde(default)]
    pub postseason_result: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubRevenue {
    /// 흥행률 (0~1) — 화면이 "관중 x명 (수용 y%)"을 쓴다
    pub attendance_rate: f64,
    pub attendance_total: f64,
    pub gate: f64,
    pub parent: f64,
    pub tv: f64,
    pub sponsor: f64,
    pub goods: f64,
    pub postseason: f64,
    pub total: f64,
}

/// 성향은 0~100이고 **50이 중립**이다 — 거기서 얼마나 벗어났는지를 본다
fn span_of(v: f64, span: f64) -> f64 {
    ((v - 50.0) / 50.0) * span
}

pub fn calc_club_revenue(p: ClubRevenueParams) -> ClubRevenue {
    let a = &p.attendance;

    // ── 흥행률 ────────────────────────────────────────────────
    //
    // ⚠ **이미 있는 값만 쓴다**(사용자 확정) — 승률과 구단 성향이다.
    //   새 수치는 `base` 하나뿐이다.
    let rate = (a.base
        + ((p.win_pct - 0.5) / 0.5) * a.win_pct_span
        + span_of(p.market_appeal, a.market_appeal_span)
        + span_of(p.prestige, a.prestige_span))
        .clamp(a.min, a.max);

    let attendance_total = (p.capacity * rate * p.home_games).max(0.0);
    let gate = attendance_total * p.ticket_price;

    // ── 나머지 항목 ───────────────────────────────────────────
    //
    // ⚠ **모기업과 중계권은 성적을 안 탄다.** 모기업은 그 해 성적과 무관하게
    //   대주고, 중계권은 리그가 균등 배분한다 — 그게 현실이다.
    // ⚠ 그래서 **유형이 성적 민감도를 정한다**: 자력형은 관중이 절반이라
    //   성적이 크게 물리고, 모기업형은 성적이 나빠도 버틴다.
    let parent = p.base_scale * p.share.parent;
    let tv = p.league_avg_scale * p.share.tv;
    // 스폰서는 명성을 **약하게** 탄다
    let sponsor = p.base_scale * p.share.sponsor
        * (1.0 + span_of(p.prestige, p.sponsor_prestige_span));
    // 굿즈는 관중을 따라간다 — 사람이 와야 산다
    let goods = if p.share.gate > 0.0 {
        gate * (p.share.goods / p.share.gate)
    } else { 0.0 };

    let postseason = p.base_scale * match p.postseason_result {
        3 => p.postseason.champion,
        2 => p.postseason.runner_up,
        1 => p.postseason.qualified,
        _ => 0.0,
    };

    let total = gate + parent + tv + sponsor + goods + postseason;
    ClubRevenue {
        attendance_rate: rate,
        attendance_total,
        gate, parent, tv, sponsor, goods, postseason, total,
    }
}

#[cfg(test)]
mod club_revenue_tests {
    use super::*;

    fn rules() -> AttendanceRules {
        AttendanceRules { base: 0.45, win_pct_span: 0.20, market_appeal_span: 0.15,
                          prestige_span: 0.10, min: 0.10, max: 0.95 }
    }
    fn params(win: f64, appeal: f64, prestige: f64, share: RevenueShare) -> ClubRevenueParams {
        ClubRevenueParams {
            attendance: rules(), share,
            postseason: PostseasonBonus { qualified: 0.03, runner_up: 0.05, champion: 0.08 },
            sponsor_prestige_span: 0.30,
            base_scale: 2_300_000.0,      // 230억(만원)
            league_avg_scale: 2_300_000.0,
            ticket_price: 1.3, capacity: 20_000.0, home_games: 72.0,
            win_pct: win, market_appeal: appeal, prestige,
            postseason_result: 0,
        }
    }
    fn balanced() -> RevenueShare {
        RevenueShare { gate: 0.45, parent: 0.25, tv: 0.15, sponsor: 0.10, goods: 0.05 }
    }
    fn self_made() -> RevenueShare {
        RevenueShare { gate: 0.50, parent: 0.05, tv: 0.15, sponsor: 0.20, goods: 0.10 }
    }
    fn parent_fed() -> RevenueShare {
        RevenueShare { gate: 0.25, parent: 0.50, tv: 0.15, sponsor: 0.10, goods: 0.00 }
    }

    #[test]
    fn 성적이_좋으면_관중이_는다() {
        let lo = calc_club_revenue(params(0.350, 50.0, 50.0, balanced()));
        let hi = calc_club_revenue(params(0.650, 50.0, 50.0, balanced()));
        assert!(hi.attendance_rate > lo.attendance_rate, "{} vs {}", hi.attendance_rate, lo.attendance_rate);
        assert!(hi.gate > lo.gate);
    }

    /// 🔴 **흥행률이 0이나 1이 되면 안 된다** — 수입이 사라지거나 매 경기 만원이다
    #[test]
    fn 흥행률이_범위를_안_넘는다() {
        let worst = calc_club_revenue(params(0.0, 0.0, 0.0, balanced()));
        let best  = calc_club_revenue(params(1.0, 100.0, 100.0, balanced()));
        assert!(worst.attendance_rate >= 0.10, "{}", worst.attendance_rate);
        assert!(best.attendance_rate <= 0.95, "{}", best.attendance_rate);
    }

    /// 🔴 **유형이 성적 민감도를 정한다** — 자력형이 성적을 크게 탄다
    #[test]
    fn 자력형이_성적을_더_탄다() {
        let d = |s: RevenueShare| {
            let lo = calc_club_revenue(params(0.350, 50.0, 50.0, s.clone())).total;
            let hi = calc_club_revenue(params(0.650, 50.0, 50.0, s)).total;
            (hi - lo) / lo
        };
        assert!(d(self_made()) > d(parent_fed()),
            "자력 {:.4} · 모기업 {:.4}", d(self_made()), d(parent_fed()));
    }

    /// ⚠ **모기업과 중계권은 성적을 안 탄다** — 그게 현실이다
    #[test]
    fn 모기업과_중계권은_성적을_안_탄다() {
        let lo = calc_club_revenue(params(0.350, 50.0, 50.0, balanced()));
        let hi = calc_club_revenue(params(0.650, 50.0, 50.0, balanced()));
        assert_eq!(lo.parent, hi.parent);
        assert_eq!(lo.tv, hi.tv);
    }

    /// ⚠ 중계권은 **리그 평균**을 쓴다 — 균등 배분이다
    #[test]
    fn 중계권은_균등_배분이다() {
        let mut poor = params(0.5, 50.0, 50.0, balanced());
        poor.base_scale = 1_200_000.0;      // 가난한 구단
        let rich = params(0.5, 50.0, 50.0, balanced());
        assert_eq!(calc_club_revenue(poor).tv, calc_club_revenue(rich).tv);
    }

    #[test]
    fn 포스트시즌_배당이_붙는다() {
        let none = calc_club_revenue(params(0.5, 50.0, 50.0, balanced()));
        let mut ch = params(0.5, 50.0, 50.0, balanced());
        ch.postseason_result = 3;
        let won = calc_club_revenue(ch);
        assert!(won.total > none.total);
        assert_eq!(none.postseason, 0.0);
    }

    /// ⚠ 모기업형은 굿즈가 0이다 — 나눗셈이 터지면 안 된다
    #[test]
    fn 굿즈가_0인_유형도_돈다() {
        let r = calc_club_revenue(params(0.5, 50.0, 50.0, parent_fed()));
        assert_eq!(r.goods, 0.0);
        assert!(r.total > 0.0);
    }
}

// ── 구단 지출 (4-B · 2026-08-29) ──────────────────────────────
//
// ⚠ 수입과 **같은 자리**에서 시즌에 한 번 정산한다.
// ⚠ 스태프 급여는 **선수 연봉과 같은 축**을 쓴다 — 능력 평균을 OVR처럼 본다.
//   두 벌로 두면 갈라진다.

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StaffPayRules {
    pub manager_base: f64,
    pub coach_base: f64,
    pub ability_exp: f64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OperationRules {
    pub stadium: f64,
    pub farm: f64,
    pub camp: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubExpenseParams {
    pub staff_rules: StaffPayRules,
    pub operations: OperationRules,
    /// 기준 규모 (만원)
    pub base_scale: f64,
    /// 리그 배수 — **선수와 같은 표**(`salaryRules.leagueMult`)
    pub league_mult: f64,
    /// 선수 총연봉 (만원). 호출부가 로스터에서 센다
    pub payroll: f64,
    /// 감독 능력 평균 (0~100). 없으면 0
    #[serde(default)]
    pub manager_ability: f64,
    /// 코치들의 능력 평균 (0~100)
    #[serde(default)]
    pub coach_abilities: Vec<f64>,
    /// 구장 수용인원 / 리그 평균 수용인원 — 큰 구장은 유지비가 많이 든다
    #[serde(default = "ratio_one")]
    pub capacity_ratio: f64,
    /// 2군이 있는가
    #[serde(default)]
    pub has_farm: bool,
}
fn ratio_one() -> f64 { 1.0 }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubExpense {
    pub payroll: f64,
    pub staff: f64,
    pub stadium: f64,
    pub farm: f64,
    pub camp: f64,
    pub total: f64,
}

/// 능력 평균 → 연봉 배수. **50이 기준**이다(선수 `ovrPivot`과 같은 사고).
fn pay_mult(ability: f64, exp: f64) -> f64 {
    if ability <= 0.0 { return 0.0; }
    (ability / 50.0).powf(exp)
}

pub fn calc_club_expense(p: ClubExpenseParams) -> ClubExpense {
    let s = &p.staff_rules;

    // 스태프 — 감독 하나 + 코치 여럿
    let manager = if p.manager_ability > 0.0 {
        s.manager_base * pay_mult(p.manager_ability, s.ability_exp) * p.league_mult
    } else { 0.0 };
    let coaches: f64 = p.coach_abilities.iter()
        .map(|a| s.coach_base * pay_mult(*a, s.ability_exp) * p.league_mult)
        .sum();
    let staff = manager + coaches;

    // 운영비 — 기준 규모 대비. ⚠ 구장은 **수용인원에 비례**한다
    let stadium = p.base_scale * p.operations.stadium * p.capacity_ratio.max(0.0);
    let farm = if p.has_farm { p.base_scale * p.operations.farm } else { 0.0 };
    let camp = p.base_scale * p.operations.camp;

    let total = p.payroll + staff + stadium + farm + camp;
    ClubExpense { payroll: p.payroll, staff, stadium, farm, camp, total }
}

#[cfg(test)]
mod club_expense_tests {
    use super::*;

    fn base(payroll: f64, mgr: f64, coaches: Vec<f64>) -> ClubExpenseParams {
        ClubExpenseParams {
            staff_rules: StaffPayRules { manager_base: 15000.0, coach_base: 6000.0, ability_exp: 1.5 },
            operations: OperationRules { stadium: 0.06, farm: 0.08, camp: 0.03 },
            base_scale: 2_300_000.0, league_mult: 1.0, payroll,
            manager_ability: mgr, coach_abilities: coaches,
            capacity_ratio: 1.0, has_farm: true,
        }
    }

    #[test]
    fn 총지출은_항목의_합이다() {
        let r = calc_club_expense(base(1_500_000.0, 60.0, vec![55.0, 50.0]));
        assert!((r.total - (r.payroll + r.staff + r.stadium + r.farm + r.camp)).abs() < 1e-6);
    }

    /// ⚠ **능력이 좋은 감독은 비싸다** — 그게 이 시스템의 요점이다
    #[test]
    fn 좋은_감독이_더_비싸다() {
        let lo = calc_club_expense(base(0.0, 40.0, vec![])).staff;
        let hi = calc_club_expense(base(0.0, 80.0, vec![])).staff;
        assert!(hi > lo * 2.0, "{} vs {}", hi, lo);
    }

    /// ⚠ 코치가 많으면 많이 든다 — 2~8명으로 갈린다
    #[test]
    fn 코치가_많으면_많이_든다() {
        let few = calc_club_expense(base(0.0, 0.0, vec![50.0, 50.0])).staff;
        let many = calc_club_expense(base(0.0, 0.0, vec![50.0; 8])).staff;
        assert!((many - few * 4.0).abs() < 1.0, "{} vs {}", many, few);
    }

    /// 🔴 **스태프가 없으면 0이다** — 고교·대학은 스태프가 얇다
    #[test]
    fn 스태프가_없으면_0이다() {
        assert_eq!(calc_club_expense(base(0.0, 0.0, vec![])).staff, 0.0);
    }

    /// ⚠ 2군이 없는 리그는 2군 운영비가 없다
    #[test]
    fn 이군이_없으면_운영비도_없다() {
        let mut p = base(0.0, 0.0, vec![]);
        p.has_farm = false;
        assert_eq!(calc_club_expense(p).farm, 0.0);
    }

    /// ⚠ 큰 구장은 유지비가 많이 든다
    #[test]
    fn 큰_구장이_더_든다() {
        let small = { let mut p = base(0.0, 0.0, vec![]); p.capacity_ratio = 0.5; calc_club_expense(p).stadium };
        let big   = { let mut p = base(0.0, 0.0, vec![]); p.capacity_ratio = 1.5; calc_club_expense(p).stadium };
        assert!(big > small * 2.5, "{} vs {}", big, small);
    }

    /// ⚠ 리그 배수는 **선수와 같은 표**다 — ABL은 3.5배다
    #[test]
    fn 리그_배수가_스태프에_걸린다() {
        let kbl = calc_club_expense(base(0.0, 60.0, vec![50.0])).staff;
        let abl = { let mut p = base(0.0, 60.0, vec![50.0]); p.league_mult = 3.5; calc_club_expense(p).staff };
        assert!((abl - kbl * 3.5).abs() < 1.0, "{} vs {}", abl, kbl);
    }
}
