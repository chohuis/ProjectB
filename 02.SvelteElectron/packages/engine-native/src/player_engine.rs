use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::npc_sim;
use crate::sim_types::{ProtagonistDraftParams};

// ── Career Chain ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CareerStep {
    Initial,
    DraftResult { success: bool },
    UnivResult { success: bool, source: String },
    UnivFailRoute,
    IndieResult { success: bool },
    Resolved { stage: String },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveChoiceParams {
    pub step: CareerStep,
    pub choice_id: String,
    pub ovr: f64,
    pub avg_grade: f64,
}

fn calc_draft_success(ovr: f64, rng: &mut impl Rng) -> bool {
    let pct = ((ovr - 40.0) * 1.375 + 15.0).max(5.0).min(70.0);
    rng.gen::<f64>() * 100.0 < pct
}

fn calc_univ_success(avg_grade: f64, rng: &mut impl Rng) -> bool {
    let pct = if avg_grade <= 4.0 { 85.0 }
              else if avg_grade <= 6.0 { 55.0 }
              else if avg_grade <= 7.0 { 30.0 }
              else { 10.0 };
    rng.gen::<f64>() * 100.0 < pct
}

fn calc_indie_success(ovr: f64, rng: &mut impl Rng) -> bool {
    let pct = ((ovr - 30.0) * 0.9 + 40.0).max(35.0).min(80.0);
    rng.gen::<f64>() * 100.0 < pct
}

pub fn resolve_career_choice(params: ResolveChoiceParams) -> CareerStep {
    let mut rng = rand::thread_rng();
    let ovr = params.ovr;
    let avg = params.avg_grade;
    let cid = &params.choice_id;

    match &params.step {
        CareerStep::Initial => match cid.as_str() {
            "draft"      => CareerStep::DraftResult { success: calc_draft_success(ovr, &mut rng) },
            "university" => CareerStep::UnivResult { success: calc_univ_success(avg, &mut rng), source: "direct".into() },
            "indie"      => CareerStep::IndieResult { success: calc_indie_success(ovr, &mut rng) },
            _            => CareerStep::Resolved { stage: "military".into() },
        },
        CareerStep::DraftResult { success } => {
            if *success { CareerStep::Resolved { stage: "pro".into() } }
            else { CareerStep::UnivResult { success: calc_univ_success(avg, &mut rng), source: "afterDraft".into() } }
        }
        CareerStep::UnivResult { success, source } => {
            if *success { CareerStep::Resolved { stage: "university".into() } }
            else if source == "afterDraft" { CareerStep::IndieResult { success: calc_indie_success(ovr, &mut rng) } }
            else { CareerStep::UnivFailRoute }
        }
        CareerStep::UnivFailRoute => {
            if cid == "indie" { CareerStep::IndieResult { success: calc_indie_success(ovr, &mut rng) } }
            else { CareerStep::Resolved { stage: "military".into() } }
        }
        CareerStep::IndieResult { success } => {
            CareerStep::Resolved { stage: if *success { "independent".into() } else { "military".into() } }
        }
        CareerStep::Resolved { .. } => params.step.clone(),
    }
}

// ── Pitcher Role Engine ───────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignRoleParams {
    pub position: Option<String>,
    pub ovr: f64,
    pub team_sp_ovrs: Vec<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignRoleResult {
    pub role: String,
}

pub fn assign_protagonist_role(params: AssignRoleParams) -> AssignRoleResult {
    let pos = params.position.as_deref().unwrap_or("");
    let ovr = params.ovr;

    let role = match pos {
        "CP" => "마무리".into(),
        "RP" => {
            if ovr >= 78.0 { "셋업맨".into() }
            else if ovr >= 65.0 { "중간계투".into() }
            else if ovr >= 55.0 { "롱릴리프".into() }
            else { "패전처리".into() }
        }
        _ => {
            let rank = 1 + params.team_sp_ovrs.iter().filter(|&&o| o > ovr).count();
            if rank <= 5 { format!("{}선발", rank) }
            else if ovr >= 60.0 { "스윙맨".into() }
            else { "롱릴리프".into() }
        }
    };

    AssignRoleResult { role }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignHighschoolPositionParams {
    pub my_ovr: f64,
    pub team_pitcher_ovrs: Vec<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignHighschoolPositionResult {
    pub position: String,
}

pub fn assign_highschool_position(params: AssignHighschoolPositionParams) -> AssignHighschoolPositionResult {
    let higher = params.team_pitcher_ovrs.iter().filter(|&&o| o > params.my_ovr).count();
    AssignHighschoolPositionResult { position: if higher <= 2 { "SP".into() } else { "RP".into() } }
}

fn reliever_appearance_chance(role: &str) -> f64 {
    match role {
        "마무리"   => 0.55,
        "셋업맨"   => 0.45,
        "중간계투" => 0.35,
        "롱릴리프" => 0.20,
        "패전처리" => 0.25,
        "스윙맨"   => 0.15,
        "오프너"   => 0.30,
        _ => 0.0,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelieverPitchParams {
    pub role: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelieverPitchResult {
    pub would_pitch: bool,
}

pub fn reliever_would_pitch(params: RelieverPitchParams) -> RelieverPitchResult {
    let chance = reliever_appearance_chance(&params.role);
    let would_pitch = chance > 0.0 && rand::thread_rng().gen::<f64>() < chance;
    RelieverPitchResult { would_pitch }
}

// ── Salary Engine ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonStats {
    pub ip: f64,
    pub era: f64,
    pub whip: f64,
    pub k: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcSeasonRatingParams {
    pub stats: Option<SeasonStats>,
}

fn calc_season_rating_inner(s: &SeasonStats) -> f64 {
    let era_score  = (100.0 - (s.era  - 2.0) * 18.0).max(20.0).min(100.0);
    let whip_score = (100.0 - (s.whip - 1.0) * 55.0).max(20.0).min(100.0);
    let k9         = if s.ip > 0.0 { (s.k / s.ip) * 9.0 } else { 0.0 };
    let k_score    = (40.0 + k9 * 6.0).max(20.0).min(100.0);
    era_score * 0.45 + whip_score * 0.3 + k_score * 0.25
}

pub fn calc_season_rating(params: CalcSeasonRatingParams) -> i64 {
    match &params.stats {
        None => 50,
        Some(s) if s.ip <= 0.0 => 50,
        Some(s) => calc_season_rating_inner(s).round() as i64,
    }
}

fn league_salary_mult(league_id: &str) -> f64 {
    match league_id { "LEAGUE_ABL" => 3.5, _ => 1.0 }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcMarketSalaryParams {
    pub ovr: f64,
    pub fame: f64,
    pub league_id: String,
}

pub fn calc_market_salary(params: CalcMarketSalaryParams) -> i64 {
    let base = 1800.0 + (params.ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
    (base * league_salary_mult(&params.league_id)).round() as i64
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcOfferedSalaryParams {
    pub current_salary: f64,
    pub rating: f64,
    pub market_salary: f64,
}

pub fn calc_offered_salary(params: CalcOfferedSalaryParams) -> i64 {
    let perf_adj = (params.rating - 50.0) * 0.012;
    let blended  = params.current_salary * (1.0 + perf_adj) * 0.6 + params.market_salary * 0.4;
    blended.max(1500.0).round() as i64
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcOfferedSalaryForProtagonistParams {
    pub pitching_ovr: f64,
    pub fame: f64,
    pub league_id: String,
    pub current_salary: Option<f64>,
    pub stats: Option<SeasonStats>,
}

pub fn calc_offered_salary_for_protagonist(params: CalcOfferedSalaryForProtagonistParams) -> i64 {
    let rating = match &params.stats {
        None => 50.0,
        Some(s) if s.ip <= 0.0 => 50.0,
        Some(s) => calc_season_rating_inner(s).round(),
    };
    let market = {
        let base = 1800.0 + (params.pitching_ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
        base * league_salary_mult(&params.league_id)
    };
    let current = params.current_salary.unwrap_or(market);
    let perf_adj = (rating - 50.0) * 0.012;
    let blended  = current * (1.0 + perf_adj) * 0.6 + market * 0.4;
    blended.max(1500.0).round() as i64
}

// ── FA Engine ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRef {
    pub id: String,
    pub league_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateFaOffersParams {
    pub pitching_ovr: f64,
    pub fame: f64,
    pub league_id: String,
    pub team_id: String,
    pub fa_unsigned_weeks: Option<u32>,
    pub teams: Vec<TeamRef>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaOffer {
    pub team_id: String,
    pub league_id: String,
    pub salary: i64,
    pub duration_years: u32,
    pub signing_bonus: i64,
    pub team_option_years: u32,
    pub player_option_years: u32,
    pub no_trade: bool,
}

pub fn generate_fa_offers(params: GenerateFaOffersParams) -> Vec<FaOffer> {
    let mut rng = rand::thread_rng();
    let same_league: Vec<&TeamRef> = params.teams.iter()
        .filter(|t| t.league_id == params.league_id && t.id != params.team_id)
        .collect();
    if same_league.is_empty() { return vec![]; }

    let base = 1800.0 + (params.pitching_ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
    let market = base * league_salary_mult(&params.league_id);
    let unsigned_weeks = params.fa_unsigned_weeks.unwrap_or(0);
    let market_drop = (1.0 - unsigned_weeks as f64 * 0.04).max(0.72);

    let n_picks = rng.gen_range(3..=5usize).min(same_league.len());
    let mut indices: Vec<usize> = (0..same_league.len()).collect();
    for i in 0..n_picks {
        let j = rng.gen_range(i..same_league.len());
        indices.swap(i, j);
    }

    indices[..n_picks].iter().map(|&idx| {
        let team   = same_league[idx];
        let mult   = 0.85 + rng.gen::<f64>() * 0.35;
        let salary = (market * mult * market_drop).round() as i64;
        FaOffer {
            team_id:             team.id.clone(),
            league_id:           team.league_id.clone(),
            salary,
            duration_years:      rng.gen_range(1..=4),
            signing_bonus:       (salary as f64 * (0.12 + rng.gen::<f64>() * 0.16)).round() as i64,
            team_option_years:   if rng.gen::<f64>() < 0.35 { 1 } else { 0 },
            player_option_years: if rng.gen::<f64>() < 0.25 { 1 } else { 0 },
            no_trade:            rng.gen::<f64>() < 0.2,
        }
    }).collect()
}

// ── Draft Engine ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcDraftRankParams {
    pub scout_score: f64,
    pub pitching_ovr: Option<f64>,
    pub year: Option<u32>,
    pub kbl_team_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRankResult {
    pub drafted: bool,
    pub round: Option<i32>,
    pub pick: Option<i32>,
    pub team_id: Option<String>,
    pub signing_bonus: i64,
}

fn calc_signing_bonus(round: i32, scout_score: f64) -> i64 {
    match round {
        1     => (30000.0 + (scout_score - 70.0).max(0.0) * 1500.0).round() as i64,
        2     => (10000.0 + (scout_score - 55.0).max(0.0) *  600.0).round() as i64,
        3 | 4 => ( 4000.0 + (scout_score - 40.0).max(0.0) *  200.0).round() as i64,
        _     => 2000,
    }
}

pub fn calc_draft_rank(params: CalcDraftRankParams) -> DraftRankResult {
    let scout = params.scout_score;
    let pitching_ovr = params.pitching_ovr.unwrap_or(scout);
    let year = params.year.unwrap_or(2000);

    let draft_params = ProtagonistDraftParams {
        scout_score: scout,
        pitching_ovr,
        year: year as i32,
        team_ids: params.kbl_team_ids,
    };
    let outcome = npc_sim::determine_protagonist_draft(draft_params);

    if !outcome.drafted {
        return DraftRankResult { drafted: false, round: None, pick: None, team_id: None, signing_bonus: 0 };
    }

    let round = outcome.round.unwrap_or(10);
    DraftRankResult {
        drafted:       true,
        round:         outcome.round,
        pick:          outcome.pick,
        team_id:       outcome.team_id,
        signing_bonus: calc_signing_bonus(round, scout),
    }
}
