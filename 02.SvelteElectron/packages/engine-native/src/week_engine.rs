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
    pub current_injury_type: Option<String>,
    pub current_severity: Option<String>,
    pub recovery_weeks_left: Option<u32>,
    pub player_type: Option<String>,
    pub age: u32,
    pub condition: f64,
    pub training_intensity: f64,
    pub consecutive_low_morale_weeks: u32,
    pub has_prior_injury_same_area: bool,
    pub prior_steroid_used: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryUpdateOut {
    #[serde(rename = "type")]
    pub injury_type: String,   // 구체적 InjuryType ID
    pub severity: String,      // "light"|"moderate"|"severe"|"surgery"
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
    pub source: Option<String>,
}

fn pick_light_type(is_pitcher: bool, rng: &mut impl rand::Rng) -> &'static str {
    if is_pitcher {
        let r: f64 = rng.gen();
        if r < 0.40 { "ARM_FATIGUE" } else if r < 0.70 { "BLISTER" } else if r < 0.90 { "MUSCLE_TIGHTNESS" } else { "BACK_STIFFNESS" }
    } else {
        let r: f64 = rng.gen();
        if r < 0.30 { "MUSCLE_TIGHTNESS" } else if r < 0.60 { "BACK_STIFFNESS" } else if r < 0.90 { "ANKLE_SPRAIN_L" } else { "BLISTER" }
    }
}

fn pick_moderate_type(is_pitcher: bool, rng: &mut impl rand::Rng) -> &'static str {
    if is_pitcher {
        let r: f64 = rng.gen();
        if r < 0.40 { "ELBOW_INFLAM" } else if r < 0.80 { "SHOULDER_INFLAM" } else { "OBLIQUE_STRAIN" }
    } else {
        let r: f64 = rng.gen();
        if r < 0.40 { "HAMSTRING" } else if r < 0.70 { "ANKLE_SPRAIN_M" } else { "OBLIQUE_STRAIN" }
    }
}

fn pick_severe_type(is_pitcher: bool, rng: &mut impl rand::Rng) -> &'static str {
    if is_pitcher {
        let r: f64 = rng.gen();
        if r < 0.50 { "UCL_PARTIAL" } else if r < 0.90 { "ROTATOR_STRAIN" } else { "BACK_HERNIATION" }
    } else {
        let r: f64 = rng.gen();
        if r < 0.50 { "BACK_HERNIATION" } else if r < 0.80 { "UCL_PARTIAL" } else { "ROTATOR_STRAIN" }
    }
}

fn pick_surgery_type(rng: &mut impl rand::Rng) -> &'static str {
    let r: f64 = rng.gen();
    if r < 0.50 { "UCL_FULL" } else if r < 0.80 { "ROTATOR_FULL" } else { "SHOULDER_SURGERY" }
}

fn recovery_weeks_for(injury_type: &str, rng: &mut impl rand::Rng) -> u32 {
    match injury_type {
        "BLISTER"          => rng.gen_range(2..=3),
        "ARM_FATIGUE"      => rng.gen_range(2..=3),
        "MUSCLE_TIGHTNESS" => rng.gen_range(2..=3),
        "BACK_STIFFNESS"   => rng.gen_range(2..=3),
        "ANKLE_SPRAIN_L"   => rng.gen_range(2..=3),
        "ELBOW_INFLAM"     => rng.gen_range(4..=8),
        "SHOULDER_INFLAM"  => rng.gen_range(4..=8),
        "OBLIQUE_STRAIN"   => rng.gen_range(4..=8),
        "HAMSTRING"        => rng.gen_range(4..=8),
        "CONCUSSION"       => rng.gen_range(4..=6),
        "ANKLE_SPRAIN_M"   => rng.gen_range(4..=8),
        "UCL_PARTIAL"      => rng.gen_range(12..=20),
        "ROTATOR_STRAIN"   => rng.gen_range(12..=20),
        "BACK_HERNIATION"  => rng.gen_range(12..=20),
        "YIPS"             => rng.gen_range(10..=20),
        "UCL_FULL"         => rng.gen_range(60..=78),
        "ROTATOR_FULL"     => rng.gen_range(52..=65),
        "SHOULDER_SURGERY" => rng.gen_range(30..=40),
        _                  => 2,
    }
}

fn severity_of(injury_type: &str) -> &'static str {
    match injury_type {
        "BLISTER" | "ARM_FATIGUE" | "MUSCLE_TIGHTNESS" | "BACK_STIFFNESS" | "ANKLE_SPRAIN_L"
            => "light",
        "ELBOW_INFLAM" | "SHOULDER_INFLAM" | "OBLIQUE_STRAIN" | "HAMSTRING" | "CONCUSSION" | "ANKLE_SPRAIN_M"
            => "moderate",
        "UCL_PARTIAL" | "ROTATOR_STRAIN" | "BACK_HERNIATION" | "YIPS"
            => "severe",
        "UCL_FULL" | "ROTATOR_FULL" | "SHOULDER_SURGERY"
            => "surgery",
        _ => "light",
    }
}

fn eff_mod_for(severity: &str) -> f64 {
    match severity {
        "light"    => 0.70,
        "moderate" => 0.25,
        "severe"   => 0.10,
        "surgery"  => 0.00,
        _          => 1.0,
    }
}

pub fn calc_injury(p: InjuryPayload) -> InjuryResult {
    let mut rng = rand::thread_rng();
    let is_pitcher = p.player_type.as_deref().unwrap_or("pitcher") != "batter";
    let is_high_fatigue = p.fatigue >= 80.0;
    let new_high_fatigue_weeks = if is_high_fatigue { p.consecutive_high_fatigue_weeks + 1 } else { 0 };

    let mut injury_update: Option<InjuryUpdateOut> = None;
    let mut just_occurred = false;
    let mut just_healed   = false;
    let mut source: Option<String> = None;

    if !p.has_injury {
        // ── 심리 트리거 (YIPS) — 피로 트리거와 독립 ──────────────
        let yips_chance: f64 = if p.consecutive_low_morale_weeks >= 8 { 0.12 }
            else if p.consecutive_low_morale_weeks >= 5 { 0.03 }
            else { 0.0 };

        if yips_chance > 0.0 && is_pitcher && rng.gen::<f64>() < yips_chance {
            let weeks = recovery_weeks_for("YIPS", &mut rng);
            injury_update = Some(InjuryUpdateOut {
                injury_type: "YIPS".to_string(),
                severity:    "severe".to_string(),
                recovery_weeks_left: weeks,
            });
            just_occurred = true;
            source = Some("psychological".to_string());
        }

        // ── 피로 + 훈련 복합 트리거 ──────────────────────────────
        if !just_occurred {
            // 볼록 곡선: 80미만=0%, 80~85=5%, 85~90=15%, 90~95=35%, 95+=60%
            let mut trigger_chance: f64 = if p.fatigue >= 95.0 { 0.60 }
                else if p.fatigue >= 90.0 { 0.35 }
                else if p.fatigue >= 85.0 { 0.15 }
                else if p.fatigue >= 80.0 { 0.05 }
                else { 0.0 };

            let training_trigger = p.training_intensity >= 0.8 && p.condition < 65.0;
            if training_trigger {
                trigger_chance += 0.10;
                if p.condition < 60.0 && p.fatigue > 70.0 { trigger_chance += 0.10; }
            }

            if p.has_prior_injury_same_area { trigger_chance *= 1.5; }
            if p.prior_steroid_used.unwrap_or(false) { trigger_chance *= 1.25; }

            let age_mult: f64 = if p.age >= 35 { 1.5 } else if p.age >= 32 { 1.3 } else { 1.0 };
            trigger_chance = (trigger_chance * age_mult).min(0.80);

            if trigger_chance > 0.0 && rng.gen::<f64>() < trigger_chance {
                let tier_roll: f64 = rng.gen();
                let high_age = p.age >= 35;

                let tier = if p.fatigue >= 90.0 {
                    if high_age {
                        if tier_roll < 0.10 { "surgery" } else if tier_roll < 0.35 { "severe" } else if tier_roll < 0.65 { "moderate" } else { "light" }
                    } else {
                        if tier_roll < 0.05 { "surgery" } else if tier_roll < 0.25 { "severe" } else if tier_roll < 0.60 { "moderate" } else { "light" }
                    }
                } else if p.fatigue >= 85.0 {
                    if high_age {
                        if tier_roll < 0.06 { "severe" } else if tier_roll < 0.40 { "moderate" } else { "light" }
                    } else {
                        if tier_roll < 0.03 { "severe" } else if tier_roll < 0.28 { "moderate" } else { "light" }
                    }
                } else {
                    // 80~85 또는 훈련 트리거만 발동
                    if tier_roll < 0.05 { "moderate" } else { "light" }
                };

                let injury_type = match tier {
                    "surgery" => pick_surgery_type(&mut rng),
                    "severe"  => pick_severe_type(is_pitcher, &mut rng),
                    "moderate" => {
                        if is_pitcher && p.age >= 32 {
                            let r: f64 = rng.gen();
                            if r < 0.50 { "SHOULDER_INFLAM" } else if r < 0.80 { "ELBOW_INFLAM" } else { "OBLIQUE_STRAIN" }
                        } else {
                            pick_moderate_type(is_pitcher, &mut rng)
                        }
                    }
                    _ => pick_light_type(is_pitcher, &mut rng),
                };

                let injury_src = if training_trigger && p.fatigue < 80.0 { "training" } else { "fatigue" };
                let severity   = severity_of(injury_type);
                let weeks      = recovery_weeks_for(injury_type, &mut rng);
                injury_update = Some(InjuryUpdateOut {
                    injury_type: injury_type.to_string(),
                    severity:    severity.to_string(),
                    recovery_weeks_left: weeks,
                });
                just_occurred = true;
                source = Some(injury_src.to_string());
            }
        }
    } else {
        // ── 회복 틱다운 ──────────────────────────────────────────
        let weeks_left = p.recovery_weeks_left.unwrap_or(1).saturating_sub(1);
        if weeks_left == 0 {
            just_healed = true;
        } else {
            let cur_type = p.current_injury_type.as_deref().unwrap_or("ARM_FATIGUE");
            let cur_sev  = p.current_severity.as_deref().unwrap_or_else(|| severity_of(cur_type));
            injury_update = Some(InjuryUpdateOut {
                injury_type: cur_type.to_string(),
                severity:    cur_sev.to_string(),
                recovery_weeks_left: weeks_left,
            });
        }
    }

    let eff_mod = if p.has_injury && !just_healed {
        let sev = injury_update.as_ref().map(|u| u.severity.as_str()).unwrap_or("light");
        eff_mod_for(sev)
    } else {
        1.0
    };
    let final_high_fatigue_weeks = if just_occurred { 0 } else { new_high_fatigue_weeks };

    InjuryResult {
        injury_update,
        just_occurred,
        just_healed,
        eff_mod,
        new_consecutive_high_fatigue_weeks: final_high_fatigue_weeks,
        source,
    }
}

// ── NPC Injury Batch Calculation ──────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPlayerEntry {
    pub player_id: String,
    pub role: String,                             // "SP"|"RP"|"CP"|"batter"
    pub age: u32,
    pub consecutive_app: u32,
    pub has_prior_injury: bool,
    pub is_playing_through: bool,
    pub playing_through_severity: Option<String>, // "light"|"moderate"
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcInjuriesPayload {
    pub players: Vec<NpcPlayerEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcInjuryOccurrence {
    pub player_id: String,
    pub severity: String,
    pub recovery_weeks: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcInjuriesResult {
    pub occurred: Vec<NpcInjuryOccurrence>,
}

pub fn calc_npc_injuries(p: NpcInjuriesPayload) -> NpcInjuriesResult {
    let mut rng = rand::thread_rng();
    let mut occurred: Vec<NpcInjuryOccurrence> = Vec::new();

    for player in &p.players {
        let is_pitcher = player.role != "batter";

        let base: f64 = match player.role.as_str() {
            "SP"     => 0.03,
            "RP"     => 0.02,
            "CP"     => 0.025,
            _        => 0.015, // batter
        };

        let consec_bonus: f64 = match player.role.as_str() {
            "SP" => {
                if player.consecutive_app >= 5 { 0.04 }
                else if player.consecutive_app >= 3 { 0.02 }
                else { 0.0 }
            }
            "RP" | "CP" => {
                if player.consecutive_app >= 7 { 0.04 }
                else if player.consecutive_app >= 4 { 0.02 }
                else { 0.0 }
            }
            _ => {
                if player.consecutive_app >= 10 { 0.03 }
                else if player.consecutive_app >= 6 { 0.01 }
                else { 0.0 }
            }
        };

        let age_mult: f64 = if player.age >= 35 { 1.5 } else if player.age >= 32 { 1.3 } else { 1.0 };
        let prior_bonus: f64 = if player.has_prior_injury { 0.02 } else { 0.0 };

        let play_through_bonus: f64 = if player.is_playing_through {
            match player.playing_through_severity.as_deref() {
                Some("moderate") => 0.25,
                Some("light")    => 0.12,
                _                => 0.0,
            }
        } else {
            0.0
        };

        let chance = ((base + consec_bonus + prior_bonus + play_through_bonus) * age_mult).min(0.80);

        if rng.gen::<f64>() >= chance {
            continue;
        }

        let tier_roll: f64 = rng.gen();
        let tier = if tier_roll < 0.10 { "severe" } else if tier_roll < 0.40 { "moderate" } else { "light" };

        let injury_type = match tier {
            "severe"   => pick_severe_type(is_pitcher, &mut rng),
            "moderate" => pick_moderate_type(is_pitcher, &mut rng),
            _          => pick_light_type(is_pitcher, &mut rng),
        };

        let recovery_weeks = recovery_weeks_for(injury_type, &mut rng);
        let severity = severity_of(injury_type).to_string();

        occurred.push(NpcInjuryOccurrence {
            player_id: player.player_id.clone(),
            severity,
            recovery_weeks,
        });
    }

    NpcInjuriesResult { occurred }
}

// ── HS Admissions ─────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnivChoiceReq {
    pub team_id: String,
    pub min_academic_grade: u8,   // 1~9
    pub min_baseball_score: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HsAdmissionsPayload {
    pub ovr: f64,
    pub avg_pct: f64,
    pub hs_baseball_score: f64,
    pub univ_choices: Vec<UnivChoiceReq>,
    pub indie_choices: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HsAdmissionsResult {
    pub univ_passed: Vec<String>,
    pub indie_passed: Vec<String>,
    pub sports_passed: bool,
}

fn pct_to_grade(pct: f64) -> u8 {
    if pct <= 4.0  { 1 }
    else if pct <= 11.0 { 2 }
    else if pct <= 23.0 { 3 }
    else if pct <= 40.0 { 4 }
    else if pct <= 60.0 { 5 }
    else if pct <= 77.0 { 6 }
    else if pct <= 89.0 { 7 }
    else if pct <= 96.0 { 8 }
    else { 9 }
}

pub fn calc_hs_admissions(p: HsAdmissionsPayload) -> HsAdmissionsResult {
    let mut rng = rand::thread_rng();
    let ovr = p.ovr;
    let academic_grade = pct_to_grade(p.avg_pct);

    let univ_passed: Vec<String> = p.univ_choices.iter()
        .filter(|c| {
            let meets_academic = academic_grade <= c.min_academic_grade;
            let meets_baseball = p.hs_baseball_score >= c.min_baseball_score;
            let chance = match (meets_academic, meets_baseball) {
                (true, true) => {
                    let a_bonus = (c.min_academic_grade as f64 - academic_grade as f64).max(0.0) * 3.0;
                    let b_bonus = ((p.hs_baseball_score - c.min_baseball_score) / 20.0).min(10.0);
                    (70.0 + a_bonus + b_bonus).min(92.0)
                },
                (true, false) => 28.0,
                (false, true) => 22.0,
                (false, false) => 8.0,
            };
            rng.gen::<f64>() * 100.0 < chance
        })
        .map(|c| c.team_id.clone())
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

// ── Exam Result ───────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamPayload {
    pub accum_score: f64,
    pub warning_count: u32,
    pub exam_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamResult {
    pub grade: u32,
    pub raw: u32,
    pub risk_level: String,
    pub morale_delta: i32,
    pub eligibility_blocked: bool,
    pub message_subject: String,
    pub message_body: String,
}

pub fn calc_exam_result(p: ExamPayload) -> ExamResult {
    let mut rng = rand::thread_rng();
    let penalty = p.warning_count * 8;
    let rand_val = rng.gen_range(0u32..25);
    let raw = ((p.accum_score as i64 - penalty as i64 + rand_val as i64).clamp(0, 100)) as u32;

    let grade: u32 =
        if raw >= 90 { 1 } else if raw >= 80 { 2 } else if raw >= 65 { 3 }
        else if raw >= 50 { 4 } else if raw >= 38 { 5 } else if raw >= 28 { 6 }
        else if raw >= 18 { 7 } else if raw >= 10 { 8 } else { 9 };

    let risk_level = if grade <= 6 { "ok" } else if grade <= 7 { "warn" } else { "danger" };

    let morale_delta: i32 = match grade {
        1 => 12, 2 => 8, 3 | 4 => 4, 5 | 6 => 0, 7 => -8, _ => -15,
    };

    let eligibility_blocked = grade >= 9;
    let label = if p.exam_type == "midterm" { "중간고사" } else { "기말고사" };
    let grade_str = format!("{}등급", grade);

    let message_body = if grade <= 2 {
        format!("{} 결과: {}\n\n탁월한 성적입니다! 학업과 훈련을 훌륭하게 병행하고 있습니다. 사기 +{}", label, grade_str, morale_delta)
    } else if grade <= 4 {
        format!("{} 결과: {}\n\n양호한 성적입니다. 꾸준한 학업 관리를 유지하고 있습니다. 사기 +{}", label, grade_str, morale_delta)
    } else if grade <= 6 {
        format!("{} 결과: {}\n\n평균 수준의 성적입니다. 다음 시험에는 학업에 좀 더 집중해보세요.", label, grade_str)
    } else if grade <= 7 {
        format!("{} 결과: {}\n\n성적 부진으로 출전 자격 경고가 발령되었습니다. 다음 시험까지 학업에 집중하세요. 사기 {}", label, grade_str, morale_delta)
    } else {
        format!("{} 결과: {}\n\n성적 불량으로 학사 경고가 발령되었습니다. 이번 주 경기 출전이 제한됩니다. 즉시 학업 개선이 필요합니다. 사기 {}", label, grade_str, morale_delta)
    };

    ExamResult {
        grade, raw, risk_level: risk_level.to_string(), morale_delta, eligibility_blocked,
        message_subject: format!("{} 성적 통보 — {}", label, grade_str),
        message_body,
    }
}

// ── Military Week ─────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryWeekPayload {
    pub is_sports_unit: bool,
    pub stamina: u32,
    pub recovery: u32,
    pub command: u32,
    pub control: u32,
    pub morale: i32,
    pub fatigue: i32,
    pub military_event_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryWeekResult {
    pub stamina: u32,
    pub recovery: u32,
    pub command: u32,
    pub control: u32,
    pub morale: i32,
    pub fatigue: i32,
    pub event_index: Option<usize>,
}

pub fn calc_military_week(p: MilitaryWeekPayload) -> MilitaryWeekResult {
    let mut rng = rand::thread_rng();

    let (stamina, recovery, command, control) = if p.is_sports_unit {
        let cmd = (p.command + if rng.gen::<f64>() < 0.4 { 1 } else { 0 }).min(99);
        (p.stamina.saturating_add(1).min(99), p.recovery.saturating_add(1).min(99), cmd, p.control)
    } else {
        let cmd = p.command.saturating_sub(if rng.gen::<f64>() < 0.50 { 1 } else { 0 }).max(1);
        let ctl = p.control.saturating_sub(if rng.gen::<f64>() < 0.45 { 1 } else { 0 }).max(1);
        let rec = p.recovery.saturating_sub(if rng.gen::<f64>() < 0.35 { 1 } else { 0 }).max(1);
        (p.stamina, rec, cmd, ctl)
    };

    let morale_delta: i32 = if p.is_sports_unit { 1 } else { -1 };
    let fatigue_delta: i32 = if p.is_sports_unit { -2 } else { 2 };
    let morale  = (p.morale  + morale_delta).clamp(0, 100);
    let fatigue = (p.fatigue + fatigue_delta).clamp(0, 100);

    let event_index = if p.military_event_count > 0 && rng.gen::<f64>() < 0.35 {
        Some(rng.gen_range(0..p.military_event_count))
    } else {
        None
    };

    MilitaryWeekResult { stamina, recovery, command, control, morale, fatigue, event_index }
}

// ── NPC Fallback Score ────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcFallbackPayload {
    pub home_team_id: String,
    pub away_team_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcFallbackResult {
    pub home_score: u32,
    pub away_score: u32,
    pub winner_id: String,
    pub loser_id: String,
}

pub fn calc_npc_fallback(p: NpcFallbackPayload) -> NpcFallbackResult {
    let mut rng = rand::thread_rng();
    let score = |rng: &mut rand::rngs::ThreadRng| -> u32 {
        let raw: f64 = rng.gen::<f64>() + rng.gen::<f64>() + rng.gen::<f64>() - 1.5;
        (raw * 4.0).round().max(0.0) as u32
    };
    let mut h = score(&mut rng);
    let mut a = score(&mut rng);
    if h == a { if h > 0 { h -= 1; } else { a += 1; } }
    let (winner_id, loser_id) = if h > a {
        (p.home_team_id.clone(), p.away_team_id.clone())
    } else {
        (p.away_team_id.clone(), p.home_team_id.clone())
    };
    NpcFallbackResult { home_score: h, away_score: a, winner_id, loser_id }
}

// ── Event Random Batch ────────────────────────────────────────

pub fn roll_random_batch(count: u32) -> Vec<f64> {
    let mut rng = rand::thread_rng();
    (0..count).map(|_| rng.gen::<f64>()).collect()
}
