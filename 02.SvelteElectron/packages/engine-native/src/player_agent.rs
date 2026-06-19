use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::sim_types::*;
use crate::team_engine::fa_eligibility_years;

// ── player_eval_fa_decision ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaDecisionParams {
    pub personality: NpcPersonality,
    pub age: i32,
    pub ovr: f64,
    pub pro_service_years: i32,
    pub current_salary: i64,
    pub market_value: i64,
    pub team_standing: i32,
    pub total_teams: i32,
    pub expected_playing_time: f64,
    pub league_id: String,
    pub fame: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaDecisionResult {
    pub apply_fa: bool,
    pub willingness: f64,
}

pub fn player_eval_fa_decision(p: FaDecisionParams) -> FaDecisionResult {
    let threshold = fa_eligibility_years(&p.league_id);
    if p.pro_service_years < threshold {
        return FaDecisionResult { apply_fa: false, willingness: 0.0 };
    }
    let pers = &p.personality;
    let mut w = 0.0_f64;

    let underpaid = ((p.market_value as f64 / p.current_salary.max(1) as f64) - 1.0).max(0.0);
    w += underpaid * 70.0 * (pers.greed / 100.0);

    let rank_pct = p.team_standing as f64 / p.total_teams as f64;
    w += rank_pct * 30.0 * (pers.ambition / 100.0);

    if p.expected_playing_time < 0.5 {
        w += (0.5 - p.expected_playing_time) * 50.0 * (pers.competitive_drive / 100.0);
    }
    if pers.overseas_ambition > 60.0 && p.fame >= 30.0 {
        w += (pers.overseas_ambition - 60.0) * 0.3;
    }
    w -= pers.loyalty * 0.15;
    w -= pers.stability_preference * 0.08;
    if p.age >= 33 { w -= (p.age - 32) as f64 * 3.0; }

    FaDecisionResult { apply_fa: w >= 20.0, willingness: w.clamp(0.0, 100.0) }
}

// ── player_eval_trade_response ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeResponseParams {
    pub personality: NpcPersonality,
    pub current_team_id: String,
    pub destination_team_profile: ProTeamProfile,
    pub destination_team_id: String,
    pub destination_standing: i32,
    pub total_teams: i32,
    pub expected_playing_time: f64,
    pub has_no_trade_clause: bool,
    pub current_salary: i64,
    pub new_salary: i64,
    pub age: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeResponseResult {
    pub accept: bool,
    pub block_probability: f64,
}

pub fn player_eval_trade_response(p: TradeResponseParams) -> TradeResponseResult {
    if !p.has_no_trade_clause {
        return TradeResponseResult { accept: true, block_probability: 0.0 };
    }
    let pers = &p.personality;
    let mut block = 0.0_f64;
    block += pers.loyalty * 0.6;
    block += pers.stability_preference * 0.3;
    if pers.home_team_id.as_deref() == Some(&p.current_team_id) { block += 30.0; }

    let rank_pct = p.destination_standing as f64 / p.total_teams as f64;
    block -= (1.0 - rank_pct) * 20.0 * (pers.ambition / 100.0);
    if p.expected_playing_time > 0.8 { block -= 15.0 * (pers.competitive_drive / 100.0); }
    if p.new_salary > (p.current_salary as f64 * 1.2) as i64 {
        block -= 20.0 * (pers.greed / 100.0);
    }
    let prob = (block / 100.0).clamp(0.0, 1.0);
    let accept = rand::thread_rng().gen::<f64>() >= prob;
    TradeResponseResult { accept, block_probability: prob }
}

// ── player_eval_contract_offer ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractEvalParams {
    pub personality: NpcPersonality,
    pub offer: ContractOfferResult,
    pub market_value: i64,
    pub age: i32,
    pub expected_playing_time: f64,
    pub team_profile: ProTeamProfile,
    pub is_renewal: bool,
    pub best_competing_offer: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractEvalResult {
    pub accept: bool,
    pub counter_salary: Option<i64>,
    pub counter_years: Option<i32>,
}

pub fn player_eval_contract_offer(p: ContractEvalParams) -> ContractEvalResult {
    let pers = &p.personality;
    let mut sat = 0.0_f64;
    let ratio = p.offer.offer_salary as f64 / p.market_value.max(1) as f64;
    sat += (ratio - 1.0) * 60.0 * (pers.greed / 100.0);
    sat += (ratio - 0.8) * 30.0 * ((100.0 - pers.greed) / 100.0);

    if p.offer.offer_years >= 3 && pers.stability_preference > 60.0 { sat += 15.0; }
    if p.offer.offer_years == 1 && pers.stability_preference > 70.0 { sat -= 20.0; }
    if p.expected_playing_time < 0.4 { sat -= 25.0 * (pers.competitive_drive / 100.0); }

    sat += p.team_profile.prestige * 0.1;
    sat += p.team_profile.clubhouse_culture * 0.08;
    if pers.home_team_id.is_some() { sat += 20.0; }
    if p.is_renewal { sat += pers.loyalty * 0.3; }

    if let Some(best) = p.best_competing_offer {
        let gap = (best - p.offer.offer_salary) as f64;
        if gap > 0.0 { sat -= (gap / p.market_value as f64) * 50.0 * (pers.greed / 100.0); }
    }

    if sat >= 0.0 {
        ContractEvalResult { accept: true, counter_salary: None, counter_years: None }
    } else if sat >= -20.0 {
        let counter = (p.offer.offer_salary as f64 * 1.1).round() as i64;
        ContractEvalResult {
            accept: false,
            counter_salary: Some(counter),
            counter_years: Some(p.offer.offer_years),
        }
    } else {
        ContractEvalResult { accept: false, counter_salary: None, counter_years: None }
    }
}

// ── player_eval_retirement_response ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementResponseParams {
    pub personality: NpcPersonality,
    pub age: i32,
    pub ovr: f64,
    pub ovr_trend: f64,
    pub pro_service_years: i32,
    pub other_team_interest: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementResponseResult {
    pub accept: bool,
    pub seek_other_team: bool,
}

pub fn player_eval_retirement_response(p: RetirementResponseParams) -> RetirementResponseResult {
    let pers = &p.personality;
    let mut resist = 0.0_f64;
    resist += pers.competitive_drive * 0.5;
    resist += (40 - p.age.min(40)) as f64 * 1.5;
    if p.ovr_trend > -1.0 { resist += 20.0; }
    if p.other_team_interest { resist += 25.0; }
    resist -= pers.loyalty * 0.2;

    let accept = resist < 50.0;
    let seek_other = !accept && p.other_team_interest && pers.competitive_drive > 50.0;
    RetirementResponseResult { accept, seek_other_team: seek_other }
}

// ── player_rank_fa_offers ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaOfferWithTeam {
    pub team_id: String,
    pub team_profile: ProTeamProfile,
    pub salary: i64,
    pub years: i32,
    pub signing_bonus: i64,
    pub expected_playing_time: f64,
    pub team_standing: i32,
    pub total_teams: i32,
    pub is_current_team: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankFaOffersParams {
    pub personality: NpcPersonality,
    pub age: i32,
    pub offers: Vec<FaOfferWithTeam>,
    pub league_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedFaOffersResult {
    pub ranked: Vec<String>,
    pub chosen_team_id: String,
}

pub fn player_rank_fa_offers(p: RankFaOffersParams) -> RankedFaOffersResult {
    let pers = &p.personality;
    let max_salary = p.offers.iter().map(|o| o.salary).max().unwrap_or(1) as f64;

    let mut scored: Vec<(String, f64)> = p.offers.iter().map(|o| {
        let mut s = 0.0_f64;
        s += (o.salary as f64 / max_salary) * pers.greed * 0.30;
        let rank_pct = 1.0 - o.team_standing as f64 / o.total_teams as f64;
        s += rank_pct * pers.ambition * 0.20;
        s += o.expected_playing_time * pers.competitive_drive * 0.18;
        s += (o.years as f64 / 4.0) * pers.stability_preference * 0.10;
        s += (o.team_profile.prestige + o.team_profile.clubhouse_culture) / 200.0 * 10.0;
        s += o.team_profile.market_appeal / 100.0 * pers.market_preference * 8.0;
        if pers.home_team_id.as_deref() == Some(&o.team_id) { s += 15.0; }
        if o.is_current_team { s += pers.loyalty * 0.15; }
        s += pers.overseas_ambition * 0.05;
        (o.team_id.clone(), s)
    }).collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    let chosen = scored.first().map(|(id, _)| id.clone()).unwrap_or_default();
    let ranked = scored.into_iter().map(|(id, _)| id).collect();
    RankedFaOffersResult { ranked, chosen_team_id: chosen }
}

// ── update_player_loyalty ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLoyaltyParams {
    pub current_loyalty: f64,
    pub event_type: String,
    pub event_magnitude: f64,
    pub stability_preference: f64,
}

pub fn update_player_loyalty(p: UpdateLoyaltyParams) -> f64 {
    let base_delta = match p.event_type.as_str() {
        "contract_honor"       =>  8.0,
        "contract_betrayal"    => -20.0,
        "playing_time_kept"    =>  5.0,
        "playing_time_broken"  => -15.0,
        "championship_won"     =>  15.0,
        "team_rebuild_start"   => -7.0,
        "season_end_normal"    => -2.0,
        _ => 0.0,
    };
    let stability_damp = 1.0 - p.stability_preference / 200.0;
    let delta = base_delta * p.event_magnitude * stability_damp;
    (p.current_loyalty + delta).clamp(0.0, 100.0)
}
