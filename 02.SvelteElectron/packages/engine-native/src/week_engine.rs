use serde::{Deserialize, Serialize};
use rand::Rng;

// ── Facility Efficiency ───────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacilityEffPayload {
    pub career_stage: String,
    pub team_tier: Option<String>,
}

pub fn calc_facility_eff(p: FacilityEffPayload) -> f64 {
    match p.career_stage.as_str() {
        "highschool"  => 0.92,
        "university"  => 0.95,
        "military"    => 0.88,
        "independent" => 0.85,
        "pro" | "pro_kbl" | "pro_abl" => {
            if p.team_tier.as_deref() == Some("1군") { 1.05 } else { 0.95 }
        }
        _ => 0.92,
    }
}

// ── Weekly Net Income ─────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyNetPayload {
    pub career_stage: String,
    pub salary: Option<i32>,
}

pub fn calc_weekly_net(p: WeeklyNetPayload) -> i32 {
    match p.career_stage.as_str() {
        "highschool"  => (42 - 18) / 4,
        "university"  => (62 - 21) / 4,
        "military"    => (196 - 13) / 4,
        "pro" | "pro_kbl" | "pro_abl" => {
            let salary = p.salary.unwrap_or(3000) as f64;
            (salary / 52.0 - 54.0).round() as i32
        }
        "independent" => (80 - 30) / 4,
        _ => 0,
    }
}

// ── Injury Calculation ────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryPayload {
    pub fatigue: f64,
    pub consecutive_high_fatigue_weeks: u32,
    pub has_injury: bool,
    pub injury_type: Option<String>,
    pub recovery_weeks_left: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryUpdateOut {
    #[serde(rename = "type")]
    pub injury_type: String,
    pub recovery_weeks_left: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryResult {
    pub injury_update: Option<InjuryUpdateOut>,
    pub just_occurred: bool,
    pub just_healed: bool,
    pub eff_mod: f64,
    pub new_consecutive_high_fatigue_weeks: u32,
}

pub fn calc_injury(p: InjuryPayload) -> InjuryResult {
    let mut rng = rand::thread_rng();
    let is_high_fatigue = p.fatigue >= 85.0;
    let new_high_fatigue_weeks = if is_high_fatigue { p.consecutive_high_fatigue_weeks + 1 } else { 0 };

    let mut injury_update: Option<InjuryUpdateOut> = None;
    let mut just_occurred = false;
    let mut just_healed = false;

    if !p.has_injury && new_high_fatigue_weeks >= 2 {
        let chance = (0.30 + (new_high_fatigue_weeks as f64 - 2.0) * 0.25).min(0.65);
        if rng.gen::<f64>() < chance {
            let injury_type = if p.fatigue >= 92.0 { "moderate" } else { "light" };
            let recovery_weeks: u32 = if injury_type == "moderate" { 3 } else { 2 };
            injury_update = Some(InjuryUpdateOut {
                injury_type: injury_type.to_string(),
                recovery_weeks_left: recovery_weeks,
            });
            just_occurred = true;
        }
    } else if p.has_injury {
        let weeks_left = p.recovery_weeks_left.unwrap_or(1).saturating_sub(1);
        if weeks_left == 0 {
            just_healed = true;
        } else {
            injury_update = Some(InjuryUpdateOut {
                injury_type: p.injury_type.unwrap_or_default(),
                recovery_weeks_left: weeks_left,
            });
        }
    }

    let eff_mod = if p.has_injury && !just_healed { 0.20 } else { 1.0 };
    let final_high_fatigue_weeks = if just_occurred { 0 } else { new_high_fatigue_weeks };

    InjuryResult {
        injury_update,
        just_occurred,
        just_healed,
        eff_mod,
        new_consecutive_high_fatigue_weeks: final_high_fatigue_weeks,
    }
}

// ── HS Admissions ─────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HsAdmissionsPayload {
    pub ovr: f64,
    pub avg_pct: f64,
    pub univ_choices: Vec<String>,
    pub indie_choices: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HsAdmissionsResult {
    pub univ_passed: Vec<String>,
    pub indie_passed: Vec<String>,
    pub sports_passed: bool,
}

pub fn calc_hs_admissions(p: HsAdmissionsPayload) -> HsAdmissionsResult {
    let mut rng = rand::thread_rng();
    let ovr = p.ovr;
    let avg_pct = p.avg_pct;

    let univ_passed: Vec<String> = p.univ_choices.iter().enumerate()
        .filter(|(i, _)| {
            let cut = [58.0f64, 53.0, 48.0].get(*i).copied().unwrap_or(48.0);
            let score = ovr * 0.62 + avg_pct * 0.38;
            if score < cut - 8.0 { return false; }
            let base = 28.0 + (score - cut) * 3.4;
            rng.gen::<f64>() * 100.0 < base.clamp(8.0, 94.0)
        })
        .map(|(_, id)| id.clone())
        .collect();

    let indie_passed: Vec<String> = p.indie_choices.iter().enumerate()
        .filter(|(i, _)| {
            let cut = [52.0f64, 48.0, 44.0].get(*i).copied().unwrap_or(44.0);
            if ovr < cut - 10.0 { return false; }
            let base = 36.0 + (ovr - cut) * 3.2;
            rng.gen::<f64>() * 100.0 < base.clamp(12.0, 96.0)
        })
        .map(|(_, id)| id.clone())
        .collect();

    let sports_passed = if ovr < 56.0 {
        false
    } else {
        let base = 22.0 + (ovr - 56.0) * 2.1;
        rng.gen::<f64>() * 100.0 < base.clamp(6.0, 84.0)
    };

    HsAdmissionsResult { univ_passed, indie_passed, sports_passed }
}

// ── Trade Rumor ───────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeRumorPayload {
    pub era: f64,
    pub my_rank: usize,
    pub total_teams: usize,
    pub week_in_year: u32,
    pub same_league_teams: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeRumorResult {
    pub should_trigger: bool,
    pub to_team_id: Option<String>,
}

pub fn calc_trade_rumor(p: TradeRumorPayload) -> TradeRumorResult {
    let bottom_team = p.my_rank > 0 && p.my_rank >= p.total_teams.saturating_sub(1);
    let poor_perf   = p.era >= 5.0;
    let elite_perf  = p.era <= 2.5;
    let should_check = p.week_in_year >= 12 && p.week_in_year <= 40 && p.week_in_year % 4 == 0;

    if !should_check || (!poor_perf && !elite_perf && !bottom_team) || p.same_league_teams.is_empty() {
        return TradeRumorResult { should_trigger: false, to_team_id: None };
    }

    let mut rng = rand::thread_rng();
    if rng.gen::<f64>() < 0.24 {
        let idx = rng.gen_range(0..p.same_league_teams.len());
        TradeRumorResult {
            should_trigger: true,
            to_team_id: Some(p.same_league_teams[idx].clone()),
        }
    } else {
        TradeRumorResult { should_trigger: false, to_team_id: None }
    }
}
