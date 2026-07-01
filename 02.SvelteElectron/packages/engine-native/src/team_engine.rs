use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::sim_types::*;

pub fn fa_eligibility_years(league_id: &str) -> i32 {
    match league_id {
        "LEAGUE_KBL" => 5,
        "LEAGUE_ABL" => 6,
        "LEAGUE_JBL" => 4,
        _ => 9,
    }
}

// ── calc_win_now_pressure_update ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WinNowUpdateParams {
    pub current_pressure: f64,
    pub owner_patience: f64,
    pub final_standing: i32,
    pub total_teams: i32,
    pub consecutive_missed_playoffs: i32,
    pub won_championship: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WinNowUpdateResult {
    pub new_pressure: f64,
    pub delta: f64,
}

pub fn calc_win_now_pressure_update(p: WinNowUpdateParams) -> WinNowUpdateResult {
    let patience_mult = 1.0 - (p.owner_patience / 100.0) * 0.5;
    let delta = if p.won_championship { -20.0 }
        else if p.final_standing <= 2 { -5.0 }
        else if p.final_standing <= p.total_teams / 2 { 2.0 * patience_mult }
        else { 8.0 * patience_mult + p.consecutive_missed_playoffs as f64 * 5.0 };
    let new_pressure = (p.current_pressure + delta).clamp(0.0, 100.0);
    WinNowUpdateResult { new_pressure, delta }
}

// ── calc_scouting_improvement ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingImprovementParams {
    pub current_quality: f64,
    pub scout_budget_ratio: f64,
    pub hired_scout_quality: Option<f64>,
    pub consecutive_playoff_years: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingImprovementResult {
    pub new_quality: f64,
    pub delta: f64,
}

pub fn calc_scouting_improvement(p: ScoutingImprovementParams) -> ScoutingImprovementResult {
    let budget_bonus  = p.scout_budget_ratio * 4.0;
    let playoff_bonus = (p.consecutive_playoff_years as f64 * 0.5).min(2.5);
    let hired_bonus   = p.hired_scout_quality.map(|q| q / 10.0).unwrap_or(0.0);
    let delta = 1.0 + budget_bonus + playoff_bonus + hired_bonus;
    let new_quality = (p.current_quality + delta).min(100.0);
    ScoutingImprovementResult { new_quality, delta }
}

// ── eval_callup_candidates ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalCallupParams {
    pub team_profile: ProTeamProfile,
    pub farm_players: Vec<RosterPlayerRef>,
    pub active_players: Vec<RosterPlayerRef>,
    pub injured_player_ids: Vec<String>,
    pub current_month: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallupCandidate {
    pub player_id: String,
    pub replaces_player_id: String,
    pub priority_score: f64,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalCallupResult {
    pub candidates: Vec<CallupCandidate>,
}

pub fn eval_callup_candidates(p: EvalCallupParams) -> EvalCallupResult {
    let profile = &p.team_profile;
    let mut candidates = Vec::new();
    let threshold = 10.0 - (profile.win_now_pressure * 0.05);

    for farm in &p.farm_players {
        let active_at_pos: Vec<&RosterPlayerRef> = p.active_players.iter()
            .filter(|a| a.position == farm.position)
            .collect();
        if active_at_pos.is_empty() { continue; }
        let weakest = active_at_pos.iter().min_by(|a, b|
            a.ovr.partial_cmp(&b.ovr).unwrap()).unwrap();

        let is_injury = p.injured_player_ids.contains(&weakest.id);
        let ovr_gap = farm.ovr - weakest.ovr;
        let mut score = ovr_gap * 2.0;

        if is_injury { score += 50.0; }
        if profile.stability < 40.0 { score += 8.0; }
        if profile.stability > 70.0 { score -= 5.0; }
        if profile.development_focus > 60.0 && farm.age <= 23 { score += 6.0; }
        if profile.win_now_pressure > 70.0 {
            score *= 1.5;
            if farm.age > 28 { score += 3.0; }
        }

        if score >= threshold {
            candidates.push(CallupCandidate {
                player_id: farm.id.clone(),
                replaces_player_id: weakest.id.clone(),
                priority_score: score,
                reason: if is_injury { "injury_replacement".into() }
                        else if profile.development_focus > 60.0 { "development_exposure".into() }
                        else { "performance_upgrade".into() },
            });
        }
    }
    candidates.sort_by(|a, b| b.priority_score.partial_cmp(&a.priority_score).unwrap());
    EvalCallupResult { candidates }
}

// ── eval_calldown_candidates ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalCalldownParams {
    pub team_profile: ProTeamProfile,
    pub active_players: Vec<RosterPlayerRef>,
    pub current_roster_size: i32,
    pub max_roster_size: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalldownCandidate {
    pub player_id: String,
    pub priority_score: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalCalldownResult {
    pub candidates: Vec<CalldownCandidate>,
}

pub fn eval_calldown_candidates(p: EvalCalldownParams) -> EvalCalldownResult {
    let over = (p.current_roster_size - p.max_roster_size).max(0) as usize;
    let mut scored: Vec<(String, f64)> = p.active_players.iter().map(|pl| {
        let mut score = 0.0;
        score += (60.0 - pl.ovr).max(0.0);
        score += pl.salary as f64 / 100_000.0;
        if p.team_profile.win_now_pressure > 60.0 && pl.ovr < 65.0 { score += 10.0; }
        if p.team_profile.development_focus > 60.0 && pl.age > 32 { score += 8.0; }
        (pl.id.clone(), score)
    }).collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    let candidates = scored.into_iter().take(over.max(3))
        .map(|(id, s)| CalldownCandidate { player_id: id, priority_score: s })
        .collect();
    EvalCalldownResult { candidates }
}

// ── eval_release_priority ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalReleaseParams {
    pub team_profile: ProTeamProfile,
    pub player: RosterPlayerRef,
    pub recent_performance_rating: f64,
    pub roster_depth_at_position: i32,
    pub current_salary: i64,
    pub market_value: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseEvalResult {
    pub release_score: f64,
    pub reason_flags: u32,
}

pub fn eval_release_priority(p: EvalReleaseParams) -> ReleaseEvalResult {
    let mut score = 0.0_f64;
    let mut flags = 0u32;
    let profile = &p.team_profile;

    let perf_deficit = 50.0 - p.recent_performance_rating;
    if perf_deficit > 0.0 { score += perf_deficit * 0.8; flags |= 1; }

    let overpay = p.current_salary as f64 / p.market_value.max(1) as f64;
    if overpay > 1.5 { score += 20.0; flags |= 2; }
    if overpay > 2.0 { score += 30.0; }

    if p.roster_depth_at_position >= 4 { score += 15.0; flags |= 4; }

    if p.player.age >= 35 { score += (p.player.age - 35) as f64 * 3.0; flags |= 8; }

    if profile.discipline > 70.0 {
        if let Some(pers) = &p.player.personality {
            if pers.professionalism < 35.0 { score += 25.0; flags |= 16; }
        }
    }
    if profile.stability > 70.0 && p.player.age >= 30 { score -= 10.0; }
    if profile.win_now_pressure > 80.0 { score *= 1.3; }

    ReleaseEvalResult { release_score: score.max(0.0), reason_flags: flags }
}

// ── eval_fa_bid ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalFaBidParams {
    pub team_profile: ProTeamProfile,
    pub fa_player: FaPlayerRef,
    pub roster_needs: Vec<String>,
    pub salary_cap: i64,
    pub current_payroll: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaBidResult {
    pub interest_level: f64,
    pub bid_salary: i64,
    pub bid_years: i32,
    pub signing_bonus: i64,
    pub team_option_years: i32,
    pub no_trade_clause: bool,
}

pub fn eval_fa_bid(p: EvalFaBidParams) -> FaBidResult {
    let profile = &p.team_profile;
    let player = &p.fa_player;
    let mut interest = 50.0_f64;
    let mut rng = rand::thread_rng();

    if p.roster_needs.contains(&player.position) { interest += 30.0; }
    if player.ovr >= 75.0 { interest += 15.0; }

    if profile.stability > 60.0 && player.age >= 28 { interest += 10.0; }
    if profile.stability < 40.0 && player.age <= 24 { interest += 10.0; }
    if profile.stability > 60.0 && player.age < 24 { interest -= 15.0; }
    if profile.stability < 40.0 && player.age > 32 { interest -= 20.0; }

    let flex = (p.salary_cap - p.current_payroll) as f64 / p.salary_cap as f64;
    if player.demand_salary as f64 > flex * p.salary_cap as f64 * 0.35 { interest -= 25.0; }

    if let Some(pers) = &player.personality {
        let is_foreign = player.current_league != "LEAGUE_KBL";
        if is_foreign && pers.overseas_ambition < 30.0 { interest -= 30.0; }
    }

    let scouting_noise = (100.0 - profile.scouting_quality) / 100.0 * 0.25;
    let noise = (rng.gen::<f64>() * 2.0 - 1.0) * scouting_noise;
    let win_mult = 1.0 + (profile.win_now_pressure - 50.0) / 100.0 * 0.3;
    let raw_bid = (player.market_value as f64 * (1.0 + noise) * win_mult) as i64;
    let bid_salary = raw_bid.min((flex * p.salary_cap as f64 * 0.35) as i64).max(1500);

    let bid_years = if profile.stability > 65.0 { player.demand_years.min(4) }
                    else if profile.stability < 35.0 { 1_i32.max(player.demand_years - 1) }
                    else { player.demand_years };
    let signing_bonus = (bid_salary as f64 * (0.08 + profile.market_appeal / 100.0 * 0.12)) as i64;
    let no_trade = profile.prestige > 60.0 && profile.stability > 60.0
                   && player.age >= 30 && player.ovr >= 70.0;
    let team_option = if profile.win_now_pressure < 40.0 && rng.gen::<f64>() < 0.35 { 1 } else { 0 };

    FaBidResult {
        interest_level: interest.clamp(0.0, 100.0),
        bid_salary,
        bid_years,
        signing_bonus,
        team_option_years: team_option,
        no_trade_clause: no_trade,
    }
}

// ── eval_renewal_offer / eval_new_contract ───────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalContractParams {
    pub team_profile: ProTeamProfile,
    pub player: RosterPlayerRef,
    pub league_id: String,
    pub market_value: i64,
    pub is_renewal: bool,
}

fn base_contract_offer(p: &EvalContractParams) -> ContractOfferResult {
    let profile = &p.team_profile;
    let budget_mult = match profile.owner_spending_willingness as i32 / 25 {
        3.. => 1.10_f64,
        2   => 1.0,
        1   => 0.92,
        _   => 0.85,
    };
    let win_mult = 1.0 + (profile.win_now_pressure - 50.0) / 200.0;
    let offer_salary = ((p.market_value as f64) * budget_mult * win_mult) as i64;

    let base_years = if p.player.ovr >= 75.0 { 3 } else if p.player.ovr >= 65.0 { 2 } else { 1 };
    let offer_years = {
        let mut y = base_years;
        if profile.stability > 65.0 { y += 1; }
        if profile.development_focus > 65.0 && p.player.age <= 24 { y += 1; }
        if profile.win_now_pressure > 70.0 { y = y.max(3); }
        y.min(5)
    };
    let signing_bonus = (offer_salary as f64 * (0.08 + profile.market_appeal / 100.0 * 0.12)) as i64;
    let no_trade = profile.prestige > 60.0 && profile.stability > 60.0
                   && p.player.age >= 30 && p.player.ovr >= 70.0;
    ContractOfferResult {
        offer_salary,
        offer_years,
        signing_bonus,
        team_option_years: 0,
        player_option_years: 0,
        no_trade_clause: no_trade,
    }
}

pub fn eval_renewal_offer(p: EvalContractParams) -> ContractOfferResult { base_contract_offer(&p) }
pub fn eval_new_contract(p: EvalContractParams) -> ContractOfferResult  { base_contract_offer(&p) }

// ── eval_retirement_suggestion ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalRetirementParams {
    pub team_profile: ProTeamProfile,
    pub player: RosterPlayerRef,
    pub ovr_trend: f64,
    pub prospect_ovr_at_position: f64,
    pub current_salary: i64,
    pub market_value: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementSuggestionResult {
    pub suggest: bool,
    pub urgency: f64,
}

pub fn eval_retirement_suggestion(p: EvalRetirementParams) -> RetirementSuggestionResult {
    let profile = &p.team_profile;
    let mut score = 0.0_f64;

    if p.player.age >= 38 { score += 40.0; }
    else if p.player.age >= 35 { score += (p.player.age - 35) as f64 * 8.0; }

    if p.ovr_trend < -3.0 { score += 20.0; }
    else if p.ovr_trend < -1.5 { score += 10.0; }

    let overpay = p.current_salary as f64 / p.market_value.max(1) as f64;
    if overpay > 1.5 { score += 15.0; }

    if p.prospect_ovr_at_position >= p.player.ovr { score += 10.0; }

    if profile.discipline > 70.0 { score += 8.0; }
    if profile.stability > 70.0 && p.player.fame > 30.0 { score -= 10.0; }

    RetirementSuggestionResult { suggest: score >= 40.0, urgency: (score / 100.0).min(1.0) }
}

// ── generate_trade_proposals ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTradeProposalsParams {
    pub teams: Vec<TeamWithRoster>,
    pub all_players: Vec<TradeAsset>,
    pub season_standing: std::collections::HashMap<String, i32>,
    pub total_teams: i32,
    pub max_proposals: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeProposal {
    pub proposing_team_id: String,
    pub receiving_team_id: String,
    pub offering_ids: Vec<String>,
    pub requesting_ids: Vec<String>,
    pub cash: i64,
    pub mutual_benefit_score: f64,
    pub reason: String,  // "position_surplus"|"injury_cover"|"seller_mode"|"buyer_mode"|"expiring_contract"|"player_ambition"
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTradeProposalsResult {
    pub proposals: Vec<TradeProposal>,
}

pub fn generate_trade_proposals(p: GenerateTradeProposalsParams) -> GenerateTradeProposalsResult {
    let mut proposals = Vec::new();
    let n = p.teams.len();
    let positions = ["SP","RP","CP","C","1B","2B","3B","SS","LF","CF","RF","DH"];

    // 팀 모드 판단: 순위 기반 — 하위 30%=seller, 상위 30%+win_now>60=buyer
    let team_mode = |team: &TeamWithRoster| -> &str {
        let standing = p.season_standing.get(&team.team_id).copied().unwrap_or((n / 2) as i32);
        let rank_pct = standing as f64 / n as f64;
        if rank_pct > 0.70 { "seller" }
        else if rank_pct <= 0.30 && team.profile.win_now_pressure > 60.0 { "buyer" }
        else { "neutral" }
    };

    for i in 0..n {
        for j in (i + 1)..n {
            let ta = &p.teams[i];
            let tb = &p.teams[j];

            let get_players = |team: &TeamWithRoster| -> Vec<&TradeAsset> {
                let all_ids: Vec<&str> = team.active_roster.iter()
                    .chain(team.farm_roster.iter())
                    .map(|s| s.as_str()).collect();
                p.all_players.iter().filter(|pl| all_ids.contains(&pl.player_id.as_str())).collect()
            };

            let a_players = get_players(ta);
            let b_players = get_players(tb);

            let count_pos = |players: &Vec<&TradeAsset>, pos: &str| -> usize {
                players.iter().filter(|pl| pl.position == pos && !pl.is_prospect).count()
            };

            let mode_a = team_mode(ta);
            let mode_b = team_mode(tb);

            // ── 1. 계약 만료 선점 트레이드 (잔여 1년 이하) ─────────────────
            for expiring_id in &ta.expiring_contract_ids {
                if let Some(exp_player) = a_players.iter().find(|pl| &pl.player_id == expiring_id) {
                    // FA로 잃기 전에 유망주 교환
                    let mut return_candidates: Vec<&&TradeAsset> = b_players.iter()
                        .filter(|pl| pl.is_prospect && pl.ovr >= 55.0)
                        .collect();
                    return_candidates.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                    if let Some(prospect) = return_candidates.first() {
                        let score = exp_player.ovr * 0.8 + prospect.ovr * 0.6;
                        if score > 75.0 {
                            proposals.push(TradeProposal {
                                proposing_team_id: ta.team_id.clone(),
                                receiving_team_id: tb.team_id.clone(),
                                offering_ids: vec![exp_player.player_id.clone()],
                                requesting_ids: vec![prospect.player_id.clone()],
                                cash: 0,
                                mutual_benefit_score: score,
                                reason: "expiring_contract".into(),
                            });
                        }
                    }
                }
            }
            for expiring_id in &tb.expiring_contract_ids {
                if let Some(exp_player) = b_players.iter().find(|pl| &pl.player_id == expiring_id) {
                    let mut return_candidates: Vec<&&TradeAsset> = a_players.iter()
                        .filter(|pl| pl.is_prospect && pl.ovr >= 55.0)
                        .collect();
                    return_candidates.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                    if let Some(prospect) = return_candidates.first() {
                        let score = exp_player.ovr * 0.8 + prospect.ovr * 0.6;
                        if score > 75.0 {
                            proposals.push(TradeProposal {
                                proposing_team_id: tb.team_id.clone(),
                                receiving_team_id: ta.team_id.clone(),
                                offering_ids: vec![exp_player.player_id.clone()],
                                requesting_ids: vec![prospect.player_id.clone()],
                                cash: 0,
                                mutual_benefit_score: score,
                                reason: "expiring_contract".into(),
                            });
                        }
                    }
                }
            }

            // ── 2. 부상 긴급 보강 (injured_positions 포지션 요청) ───────────
            for inj_pos in &ta.injured_positions {
                let mut fillers: Vec<&&TradeAsset> = b_players.iter()
                    .filter(|pl| &pl.position == inj_pos && !pl.is_prospect && pl.ovr >= 58.0)
                    .collect();
                fillers.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                if let Some(filler) = fillers.first() {
                    let mut give_cands: Vec<&&TradeAsset> = a_players.iter()
                        .filter(|pl| !pl.is_prospect && pl.ovr >= 55.0 && &pl.position != inj_pos)
                        .collect();
                    give_cands.sort_by(|a, b| a.ovr.partial_cmp(&b.ovr).unwrap()); // 가장 약한 선수 제공
                    if let Some(give) = give_cands.first() {
                        let score = filler.ovr * 1.2 + give.ovr * 0.5 + 15.0; // 긴급도 가중
                        proposals.push(TradeProposal {
                            proposing_team_id: ta.team_id.clone(),
                            receiving_team_id: tb.team_id.clone(),
                            offering_ids: vec![give.player_id.clone()],
                            requesting_ids: vec![filler.player_id.clone()],
                            cash: 0,
                            mutual_benefit_score: score,
                            reason: "injury_cover".into(),
                        });
                    }
                }
            }
            for inj_pos in &tb.injured_positions {
                let mut fillers: Vec<&&TradeAsset> = a_players.iter()
                    .filter(|pl| &pl.position == inj_pos && !pl.is_prospect && pl.ovr >= 58.0)
                    .collect();
                fillers.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                if let Some(filler) = fillers.first() {
                    let mut give_cands: Vec<&&TradeAsset> = b_players.iter()
                        .filter(|pl| !pl.is_prospect && pl.ovr >= 55.0 && &pl.position != inj_pos)
                        .collect();
                    give_cands.sort_by(|a, b| a.ovr.partial_cmp(&b.ovr).unwrap());
                    if let Some(give) = give_cands.first() {
                        let score = filler.ovr * 1.2 + give.ovr * 0.5 + 15.0;
                        proposals.push(TradeProposal {
                            proposing_team_id: tb.team_id.clone(),
                            receiving_team_id: ta.team_id.clone(),
                            offering_ids: vec![give.player_id.clone()],
                            requesting_ids: vec![filler.player_id.clone()],
                            cash: 0,
                            mutual_benefit_score: score,
                            reason: "injury_cover".into(),
                        });
                    }
                }
            }

            // ── 3. 선수 야망 트레이드 (ambition 높음 + 팀 하위권) ───────────
            let standing_a = p.season_standing.get(&ta.team_id).copied().unwrap_or(1);
            let standing_b = p.season_standing.get(&tb.team_id).copied().unwrap_or(1);
            let bottom_pct_a = standing_a as f64 / p.total_teams as f64;
            let bottom_pct_b = standing_b as f64 / p.total_teams as f64;

            for pl in &a_players {
                if bottom_pct_a > 0.75 {
                    if let Some(pers) = &pl.personality {
                        if pers.ambition > 60.0 && pl.ovr >= 62.0 {
                            // 이 선수가 이적 요청 → 상대팀에 제안
                            let mut recv: Vec<&&TradeAsset> = b_players.iter()
                                .filter(|rp| rp.position == pl.position && rp.ovr >= pl.ovr - 8.0)
                                .collect();
                            recv.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                            if let Some(rp) = recv.first() {
                                let score = pl.ovr + rp.ovr * 0.7;
                                proposals.push(TradeProposal {
                                    proposing_team_id: ta.team_id.clone(),
                                    receiving_team_id: tb.team_id.clone(),
                                    offering_ids: vec![pl.player_id.clone()],
                                    requesting_ids: vec![rp.player_id.clone()],
                                    cash: 0,
                                    mutual_benefit_score: score,
                                    reason: "player_ambition".into(),
                                });
                            }
                        }
                    }
                }
            }
            for pl in &b_players {
                if bottom_pct_b > 0.75 {
                    if let Some(pers) = &pl.personality {
                        if pers.ambition > 60.0 && pl.ovr >= 62.0 {
                            let mut recv: Vec<&&TradeAsset> = a_players.iter()
                                .filter(|rp| rp.position == pl.position && rp.ovr >= pl.ovr - 8.0)
                                .collect();
                            recv.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                            if let Some(rp) = recv.first() {
                                let score = pl.ovr + rp.ovr * 0.7;
                                proposals.push(TradeProposal {
                                    proposing_team_id: tb.team_id.clone(),
                                    receiving_team_id: ta.team_id.clone(),
                                    offering_ids: vec![pl.player_id.clone()],
                                    requesting_ids: vec![rp.player_id.clone()],
                                    cash: 0,
                                    mutual_benefit_score: score,
                                    reason: "player_ambition".into(),
                                });
                            }
                        }
                    }
                }
            }

            // ── 4. 포지션 surplus/deficit 교환 (기존 로직 + 모드 적용) ──────
            for pos in &positions {
                let a_cnt = count_pos(&a_players, pos);
                let b_cnt = count_pos(&b_players, pos);

                let (surplus_team, deficit_team, surplus_players, deficit_players, s_mode) =
                    if a_cnt >= 3 && b_cnt <= 1 { (ta, tb, &a_players, &b_players, mode_a) }
                    else if b_cnt >= 3 && a_cnt <= 1 { (tb, ta, &b_players, &a_players, mode_b) }
                    else { continue; };

                let mut candidates: Vec<&&TradeAsset> = surplus_players.iter()
                    .filter(|pl| &pl.position == pos && !pl.is_prospect)
                    .collect();
                candidates.sort_by(|a, b| a.ovr.partial_cmp(&b.ovr).unwrap());

                if let Some(offer_player) = candidates.first() {
                    // seller 모드: 베테랑 → 유망주 교환 우선
                    if s_mode == "seller" {
                        let mut prospects: Vec<&&TradeAsset> = deficit_players.iter()
                            .filter(|pl| pl.is_prospect && pl.ovr >= 52.0)
                            .collect();
                        prospects.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                        let bundle: Vec<String> = prospects.iter().take(2)
                            .map(|pl| pl.player_id.clone()).collect();

                        if !bundle.is_empty() {
                            let bundle_val: f64 = prospects.iter().take(2)
                                .map(|pl| pl.ovr).sum::<f64>() * 0.55;
                            let veteran_val = offer_player.ovr;
                            if (veteran_val - bundle_val).abs() < 18.0 {
                                proposals.push(TradeProposal {
                                    proposing_team_id: surplus_team.team_id.clone(),
                                    receiving_team_id: deficit_team.team_id.clone(),
                                    offering_ids: vec![offer_player.player_id.clone()],
                                    requesting_ids: bundle,
                                    cash: 0,
                                    mutual_benefit_score: (veteran_val + bundle_val) / 2.0,
                                    reason: "seller_mode".into(),
                                });
                            }
                        }
                    }

                    // buyer 모드: 즉시전력 요구 (surplus 팀이 buyer이면 상대 베테랑 요청)
                    if s_mode == "buyer" {
                        let mut recv_cands: Vec<&&TradeAsset> = deficit_players.iter()
                            .filter(|pl| !pl.is_prospect && pl.ovr >= 65.0 && pl.age <= 33)
                            .collect();
                        recv_cands.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                        if let Some(recv) = recv_cands.first() {
                            let score = offer_player.ovr * 0.6 + recv.ovr;
                            if score > 90.0 {
                                proposals.push(TradeProposal {
                                    proposing_team_id: surplus_team.team_id.clone(),
                                    receiving_team_id: deficit_team.team_id.clone(),
                                    offering_ids: vec![offer_player.player_id.clone()],
                                    requesting_ids: vec![recv.player_id.clone()],
                                    cash: 0,
                                    mutual_benefit_score: score,
                                    reason: "buyer_mode".into(),
                                });
                            }
                        }
                    }

                    // neutral: 기존 포지션 surplus/deficit 상호 교환
                    let surplus_deficit_pos = positions.iter().find(|&&p2| {
                        count_pos(surplus_players, p2) <= 1
                            && count_pos(deficit_players, p2) >= 3
                    });

                    if let Some(req_pos) = surplus_deficit_pos {
                        let mut req_candidates: Vec<&&TradeAsset> = deficit_players.iter()
                            .filter(|pl| &pl.position == req_pos && !pl.is_prospect)
                            .collect();
                        req_candidates.sort_by(|a, b| a.ovr.partial_cmp(&b.ovr).unwrap());

                        if let Some(req_player) = req_candidates.first() {
                            let benefit_a = offer_player.ovr * 0.5 + req_player.ovr;
                            let benefit_b = req_player.ovr * 0.5 + offer_player.ovr;
                            let mutual = (benefit_a + benefit_b) / 2.0;

                            if mutual > 60.0 {
                                proposals.push(TradeProposal {
                                    proposing_team_id: surplus_team.team_id.clone(),
                                    receiving_team_id: deficit_team.team_id.clone(),
                                    offering_ids: vec![offer_player.player_id.clone()],
                                    requesting_ids: vec![req_player.player_id.clone()],
                                    cash: 0,
                                    mutual_benefit_score: mutual,
                                    reason: "position_surplus".into(),
                                });
                            }
                        }
                    }

                    // 기존 유망주 번들 교환 (win_now_pressure 낮은 팀)
                    if surplus_team.profile.win_now_pressure < 40.0 && s_mode != "buyer" {
                        let mut prospects: Vec<&&TradeAsset> = deficit_players.iter()
                            .filter(|pl| pl.is_prospect && pl.ovr >= 55.0)
                            .collect();
                        prospects.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                        let bundle: Vec<String> = prospects.iter().take(2)
                            .map(|pl| pl.player_id.clone()).collect();

                        if bundle.len() >= 2 {
                            let bundle_val: f64 = prospects.iter().take(2)
                                .map(|pl| pl.ovr).sum::<f64>() * 0.6;
                            let veteran_val = offer_player.ovr;
                            if (veteran_val - bundle_val).abs() < 15.0 {
                                proposals.push(TradeProposal {
                                    proposing_team_id: surplus_team.team_id.clone(),
                                    receiving_team_id: deficit_team.team_id.clone(),
                                    offering_ids: vec![offer_player.player_id.clone()],
                                    requesting_ids: bundle,
                                    cash: 0,
                                    mutual_benefit_score: (veteran_val + bundle_val) / 2.0,
                                    reason: "position_surplus".into(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    proposals.sort_by(|a, b| b.mutual_benefit_score.partial_cmp(&a.mutual_benefit_score).unwrap());
    proposals.truncate(p.max_proposals);
    GenerateTradeProposalsResult { proposals }
}

// ── eval_trade_value ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalTradeValueParams {
    pub team_profile: ProTeamProfile,
    pub giving: Vec<TradeAsset>,
    pub receiving: Vec<TradeAsset>,
    pub cash_amount: i64,
    pub roster_needs: Vec<String>,
    pub salary_cap: i64,
    pub current_payroll: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeEvalResult {
    pub net_value: f64,
    pub accept_probability: f64,
}

pub fn eval_trade_value(p: EvalTradeValueParams) -> TradeEvalResult {
    let profile = &p.team_profile;
    let flex = (p.salary_cap - p.current_payroll) as f64 / p.salary_cap as f64;

    let value_asset = |asset: &TradeAsset| -> f64 {
        let mut v = asset.ovr * 1.5;
        if profile.stability > 60.0 {
            if asset.age >= 27 && asset.age <= 31 { v *= 1.2; }
            if asset.age < 23 { v *= 0.85; }
        }
        if profile.development_focus > 60.0 {
            if asset.age <= 23 { v *= 1.3; }
            if asset.age > 32 { v *= 0.7; }
        }
        if profile.win_now_pressure > 70.0 {
            if asset.ovr >= 70.0 && asset.age >= 25 { v *= 1.25; }
            if asset.is_prospect { v *= 0.7; }
        }
        if p.roster_needs.contains(&asset.position) { v += 20.0; }
        let salary_burden = asset.salary as f64 / (flex * p.salary_cap as f64).max(1.0) / 0.3;
        v -= salary_burden * 5.0;
        v
    };

    let give_val: f64 = p.giving.iter().map(value_asset).sum::<f64>()
        - p.cash_amount as f64 / 100_000.0;
    let recv_val: f64 = p.receiving.iter().map(value_asset).sum::<f64>()
        + p.cash_amount as f64 / 100_000.0;
    let net_value = recv_val - give_val;
    let accept_probability = (0.5 + net_value / 100.0).clamp(0.05, 0.95);
    TradeEvalResult { net_value, accept_probability }
}

// ── eval_medical_test ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalTestParams {
    pub player_position: String,
    pub player_age: i32,
    pub injury_severity: Option<String>,  // null/"light"/"moderate"/"severe"/"surgery"
    pub injury_weeks_left: i32,
    pub career_injury_count: i32,
    pub has_steroid_history: bool,
    pub receiving_team_medical_quality: f64,  // 0~100
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalTestResult {
    pub pass: bool,
    pub concern_level: f64,           // 0~1
    pub rejection_probability: f64,
    pub rejection_reason: Option<String>,
    // "active_surgery"|"active_severe"|"active_moderate"|"injury_history"|"age_risk"|"steroid_history"
}

pub fn eval_medical_test(p: MedicalTestParams) -> MedicalTestResult {
    let mut concern = 0.0_f64;
    let mut reason: Option<String> = None;

    // 현재 부상 심각도
    match p.injury_severity.as_deref() {
        Some("surgery")  => { concern += 0.85; reason = Some("active_surgery".into()); }
        Some("severe")   => { concern += 0.60; reason = Some("active_severe".into()); }
        Some("moderate") => { concern += 0.30; reason = Some("active_moderate".into()); }
        Some("light")    => { concern += 0.08; }
        _                => {}
    }

    // 회복 기간 가중 (장기 이탈일수록 우려 상승)
    if p.injury_weeks_left > 20 { concern += 0.15; }
    else if p.injury_weeks_left > 8 { concern += 0.08; }

    // 부상 이력
    if p.career_injury_count >= 4 {
        concern += (p.career_injury_count - 3) as f64 * 0.08;
        if reason.is_none() { reason = Some("injury_history".into()); }
    } else if p.career_injury_count >= 2 {
        concern += p.career_injury_count as f64 * 0.04;
    }

    // 나이 + 이력 복합 위험
    if p.player_age >= 30 && p.career_injury_count >= 2 {
        concern += 0.08;
        if reason.is_none() { reason = Some("age_risk".into()); }
    }

    // 스테로이드 이력 (우선 덮어씀)
    if p.has_steroid_history {
        concern += 0.25;
        reason = Some("steroid_history".into());
    }

    // 팀 메디컬 품질 보정
    // medical_quality 100 → 1.3배 (엄격), 50 → 1.0배, 20 → 0.7배
    let quality_factor = 0.7 + p.receiving_team_medical_quality * 0.006;
    let rejection_prob = (concern * quality_factor).clamp(0.0, 1.0);

    let mut rng = rand::thread_rng();
    let pass = rng.gen::<f64>() >= rejection_prob;

    MedicalTestResult {
        pass,
        concern_level: concern.clamp(0.0, 1.0),
        rejection_probability: rejection_prob,
        rejection_reason: if !pass { reason } else { None },
    }
}
