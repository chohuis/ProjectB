use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── 속성 구조체 ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchingAttributes {
    pub velocity: f64,
    pub command: f64,
    pub control: f64,
    pub movement: f64,
    pub mentality: f64,
    pub stamina: f64,
    pub recovery: f64,
    pub clutch: f64,
    pub hold_runners: f64,
    pub ovr: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattingAttributes {
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
    pub discipline: f64,
    pub speed: f64,
    pub base_instinct: f64,
    pub bunting: f64,
    pub platoon: f64,
    pub fielding: f64,
    pub arm: f64,
    pub batting_clutch: f64,
    pub ovr: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchEntry {
    pub id: String,
    pub grade: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingPitchState {
    pub id: String,
    pub progress: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingPlanState {
    pub primary_program_id: Option<String>,
    pub secondary_program_id: Option<String>,
    pub secondary2_program_id: Option<String>,
    #[allow(dead_code)]
    pub recovery_program_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthInput {
    pub condition: f64,
    pub fatigue: f64,
    pub development_rate: f64,
    pub diligence: Option<f64>,
    pub pitching: PitchingAttributes,
    pub batting: BattingAttributes,
    #[serde(default)]
    pub pitching_xp: HashMap<String, f64>,
    #[serde(default)]
    pub batting_xp: HashMap<String, f64>,
    pub training_pitch_state: Option<TrainingPitchState>,
    #[serde(default)]
    pub pitches: Vec<PitchEntry>,
    pub player_type: Option<String>,
    pub morale: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingGrowthParams {
    pub protagonist: GrowthInput,
    pub plan: TrainingPlanState,
    pub efficiency_mod: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameGrowthParams {
    pub protagonist: GrowthInput,
    pub won: bool,
    pub score_diff: i32,
    pub strikeouts: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthPatch {
    pub pitching: PitchingAttributes,
    pub batting: BattingAttributes,
    pub pitching_xp: HashMap<String, f64>,
    pub batting_xp: HashMap<String, f64>,
    pub fatigue: f64,
    pub condition: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub morale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitches: Option<Vec<PitchEntry>>,
    pub pitch_state_action: String, // "keep" | "update" | "clear"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub training_pitch_state: Option<TrainingPitchState>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthResult {
    pub protagonist_patch: GrowthPatch,
    pub logs: Vec<String>,
    pub fame_delta: i32,
}

// ── 훈련 프로그램 ─────────────────────────────────────────────

struct ProgramConfig {
    gains_pitching: &'static [(&'static str, f64)],
    gains_batting:  &'static [(&'static str, f64)],
    base_xp: f64,
    fatigue_cost: f64,
    condition_cost: f64,
    is_recovery: bool,
    is_pitch_dev: bool,
    progress_per_week: f64,
}

fn get_program(id: &str) -> Option<ProgramConfig> {
    match id {
        // ── 신규 투수 6종 ──────────────────────────────────────────
        "TRN_VEL"       => Some(ProgramConfig { gains_pitching: &[("velocity", 1.0), ("stamina", 0.3)],                              gains_batting: &[], base_xp: 4.0, fatigue_cost: 14.0, condition_cost: 6.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_CTRL_CMD"  => Some(ProgramConfig { gains_pitching: &[("control", 1.0), ("command", 1.0)],                               gains_batting: &[], base_xp: 3.0, fatigue_cost: 8.0,  condition_cost: 3.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_MOVEMENT"  => Some(ProgramConfig { gains_pitching: &[("movement", 1.0), ("control", 0.3)],                              gains_batting: &[], base_xp: 3.2, fatigue_cost: 9.0,  condition_cost: 4.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_MENTAL_P"  => Some(ProgramConfig { gains_pitching: &[("mentality", 1.0), ("clutch", 0.4), ("holdRunners", 0.2)],        gains_batting: &[], base_xp: 2.8, fatigue_cost: 6.0,  condition_cost: 2.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_STAMINA"   => Some(ProgramConfig { gains_pitching: &[("stamina", 1.0), ("recovery", 0.3)],                              gains_batting: &[], base_xp: 3.8, fatigue_cost: 12.0, condition_cost: 5.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        // ── 신규 타자 6종 ──────────────────────────────────────────
        "TRN_BATTING"   => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("contact", 1.0), ("power", 0.8)],                              base_xp: 3.5, fatigue_cost: 10.0, condition_cost: 4.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_PLATE_EYE" => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("eye", 1.0), ("discipline", 0.4), ("bunting", 0.25)],          base_xp: 2.8, fatigue_cost: 6.0,  condition_cost: 2.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_BASERUN"   => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("speed", 1.0), ("baseInstinct", 0.3)],                         base_xp: 3.2, fatigue_cost: 10.0, condition_cost: 4.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_DEFENSE"   => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("fielding", 1.0), ("arm", 0.3)],                               base_xp: 3.0, fatigue_cost: 9.0,  condition_cost: 3.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_MENTAL_B"  => Some(ProgramConfig { gains_pitching: &[("mentality", 1.0)],  gains_batting: &[("battingClutch", 0.6)],                     base_xp: 2.8, fatigue_cost: 6.0,  condition_cost: 2.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        // ── 공용 ───────────────────────────────────────────────────
        "TRN_PITCH_DEV" => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[], base_xp: 0.0, fatigue_cost: 10.0, condition_cost: 2.0,  is_recovery: false, is_pitch_dev: true,  progress_per_week: 17.0 }),
        "TRN_RECOVERY"  => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[], base_xp: 0.0, fatigue_cost: -5.0, condition_cost: -6.0, is_recovery: true,  is_pitch_dev: false, progress_per_week: 0.0  }),
        // ── 구버전 호환 ────────────────────────────────────────────
        "TRN_CMD_BASE"  => Some(ProgramConfig { gains_pitching: &[("command", 1.0), ("control", 0.3)],    gains_batting: &[], base_xp: 3.0, fatigue_cost: 8.0,  condition_cost: 3.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_VEL_POWER" => Some(ProgramConfig { gains_pitching: &[("velocity", 1.0), ("stamina", 0.3)],   gains_batting: &[], base_xp: 4.0, fatigue_cost: 14.0, condition_cost: 6.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_CTRL_MECH" => Some(ProgramConfig { gains_pitching: &[("control", 1.0), ("command", 0.3)],    gains_batting: &[], base_xp: 3.0, fatigue_cost: 8.0,  condition_cost: 3.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_MVT_PITCH" => Some(ProgramConfig { gains_pitching: &[("movement", 1.0), ("control", 0.3)],   gains_batting: &[], base_xp: 3.2, fatigue_cost: 9.0,  condition_cost: 4.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_MNT_FOCUS" => Some(ProgramConfig { gains_pitching: &[("mentality", 1.0)],                    gains_batting: &[], base_xp: 2.5, fatigue_cost: 5.0,  condition_cost: 2.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_STA_COND"  => Some(ProgramConfig { gains_pitching: &[("stamina", 1.0), ("recovery", 0.3)],   gains_batting: &[], base_xp: 3.8, fatigue_cost: 12.0, condition_cost: 5.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_CLUTCH"    => Some(ProgramConfig { gains_pitching: &[("clutch", 1.0), ("mentality", 0.3)],   gains_batting: &[], base_xp: 2.8, fatigue_cost: 6.0,  condition_cost: 2.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_HOLD"      => Some(ProgramConfig { gains_pitching: &[("holdRunners", 1.0), ("control", 0.3)], gains_batting: &[], base_xp: 2.5, fatigue_cost: 7.0,  condition_cost: 3.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_CONTACT"   => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("contact", 1.0), ("eye", 0.3)],             base_xp: 3.0, fatigue_cost: 8.0,  condition_cost: 3.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_POWER"     => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("power", 1.0), ("contact", 0.3)],            base_xp: 3.8, fatigue_cost: 12.0, condition_cost: 5.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_EYE"       => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("eye", 1.0), ("discipline", 0.3)],           base_xp: 2.8, fatigue_cost: 6.0,  condition_cost: 2.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_SPEED"     => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("speed", 1.0), ("baseInstinct", 0.3)],       base_xp: 3.2, fatigue_cost: 10.0, condition_cost: 4.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_FIELDING"  => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("fielding", 1.0), ("arm", 0.3)],             base_xp: 3.0, fatigue_cost: 9.0,  condition_cost: 3.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_BUNTING"   => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("bunting", 1.0), ("contact", 0.3)],          base_xp: 2.0, fatigue_cost: 5.0,  condition_cost: 2.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        "TRN_BCLUTCH"   => Some(ProgramConfig { gains_pitching: &[], gains_batting: &[("battingClutch", 1.0), ("discipline", 0.3)], base_xp: 2.5, fatigue_cost: 5.0,  condition_cost: 2.0,  is_recovery: false, is_pitch_dev: false, progress_per_week: 0.0 }),
        _ => None,
    }
}

// ── 유틸 ──────────────────────────────────────────────────────

fn clamp(v: f64, lo: f64, hi: f64) -> f64 { v.max(lo).min(hi) }

fn xp_threshold(v: f64) -> f64 { 8.0 + v * 0.4 }

fn week_xp(base: f64, condition: f64, fatigue: f64, dev_rate: f64, diligence: f64) -> f64 {
    let cond_factor = condition / 100.0;
    let fat_factor = if fatigue >= 85.0 { 0.35 }
                     else if fatigue >= 70.0 { 0.65 }
                     else { (1.0 - fatigue / 200.0).max(0.80) };
    let dev_factor = dev_rate / 62.0;
    let diligence_factor = 0.6 + (diligence / 99.0) * 0.8;
    base * cond_factor * fat_factor * dev_factor * diligence_factor
}

fn try_level_up(current: f64, acc_xp: f64, gain_xp: f64) -> (f64, f64, i32) {
    let mut xp = acc_xp + gain_xp;
    let mut val = current;
    let mut leveled = 0i32;
    while xp >= xp_threshold(val) {
        xp -= xp_threshold(val);
        val += 1.0;
        leveled += 1;
    }
    (val, xp, leveled)
}

fn get_pitching_stat(p: &PitchingAttributes, stat: &str) -> f64 {
    match stat {
        "velocity"    => p.velocity,
        "command"     => p.command,
        "control"     => p.control,
        "movement"    => p.movement,
        "mentality"   => p.mentality,
        "stamina"     => p.stamina,
        "recovery"    => p.recovery,
        "clutch"      => p.clutch,
        "holdRunners" => p.hold_runners,
        _ => 0.0,
    }
}

fn set_pitching_stat(p: &mut PitchingAttributes, stat: &str, val: f64) {
    match stat {
        "velocity"    => p.velocity = val,
        "command"     => p.command = val,
        "control"     => p.control = val,
        "movement"    => p.movement = val,
        "mentality"   => p.mentality = val,
        "stamina"     => p.stamina = val,
        "recovery"    => p.recovery = val,
        "clutch"      => p.clutch = val,
        "holdRunners" => p.hold_runners = val,
        _ => {}
    }
}

fn get_batting_stat(b: &BattingAttributes, stat: &str) -> f64 {
    match stat {
        "contact"       => b.contact,
        "power"         => b.power,
        "eye"           => b.eye,
        "discipline"    => b.discipline,
        "speed"         => b.speed,
        "baseInstinct"  => b.base_instinct,
        "bunting"       => b.bunting,
        "platoon"       => b.platoon,
        "fielding"      => b.fielding,
        "arm"           => b.arm,
        "battingClutch" => b.batting_clutch,
        _ => 0.0,
    }
}

fn set_batting_stat(b: &mut BattingAttributes, stat: &str, val: f64) {
    match stat {
        "contact"       => b.contact = val,
        "power"         => b.power = val,
        "eye"           => b.eye = val,
        "discipline"    => b.discipline = val,
        "speed"         => b.speed = val,
        "baseInstinct"  => b.base_instinct = val,
        "bunting"       => b.bunting = val,
        "platoon"       => b.platoon = val,
        "fielding"      => b.fielding = val,
        "arm"           => b.arm = val,
        "battingClutch" => b.batting_clutch = val,
        _ => {}
    }
}

fn calc_pitching_ovr(p: &PitchingAttributes) -> f64 {
    let s = [p.velocity, p.command, p.control, p.movement, p.mentality, p.stamina, p.recovery, p.clutch, p.hold_runners];
    (s.iter().sum::<f64>() / s.len() as f64).round()
}

fn calc_batting_ovr(b: &BattingAttributes) -> f64 {
    let s = [b.contact, b.power, b.eye, b.discipline, b.speed, b.fielding, b.arm, b.batting_clutch];
    (s.iter().sum::<f64>() / s.len() as f64).round()
}

const PITCHING_LABELS: &[(&str, &str)] = &[
    ("velocity", "구속"), ("command", "커맨드"), ("control", "제구"),
    ("movement", "무브먼트"), ("mentality", "멘탈"), ("stamina", "스태미나"),
    ("recovery", "회복력"), ("clutch", "위기집중력"), ("holdRunners", "견제력"),
];

const BATTING_LABELS: &[(&str, &str)] = &[
    ("contact", "컨택"), ("power", "장타력"), ("eye", "선구안"),
    ("discipline", "극기"), ("speed", "주력"), ("baseInstinct", "주루판단"),
    ("bunting", "번트"), ("platoon", "플래툰"), ("fielding", "수비"),
    ("arm", "어깨"), ("battingClutch", "클러치"),
];

const PITCH_NAMES: &[(&str, &str)] = &[
    ("PITCH_FASTBALL", "패스트볼"), ("PITCH_SINKER", "싱커"), ("PITCH_CUTTER", "커터"),
    ("PITCH_SLIDER", "슬라이더"), ("PITCH_CURVE", "커브"), ("PITCH_CHANGEUP", "체인지업"),
    ("PITCH_SPLITTER", "스플리터"), ("PITCH_FORKBALL", "포크볼"),
    ("PITCH_SCREWBALL", "스크루볼"), ("PITCH_KNUCKLEBALL", "너클볼"),
];

fn pitch_label(id: &str) -> &str {
    PITCH_NAMES.iter().find(|(k, _)| *k == id).map(|(_, v)| *v).unwrap_or(id)
}

fn pitching_label(stat: &str) -> &str {
    PITCHING_LABELS.iter().find(|(k, _)| *k == stat).map(|(_, v)| *v).unwrap_or(stat)
}

fn batting_label(stat: &str) -> &str {
    BATTING_LABELS.iter().find(|(k, _)| *k == stat).map(|(_, v)| *v).unwrap_or(stat)
}

fn apply_pitching_xp(
    pitching: &mut PitchingAttributes,
    xp_map: &mut HashMap<String, f64>,
    gains: &HashMap<String, f64>,
) -> Vec<String> {
    let mut logs = Vec::new();
    let mut sorted: Vec<_> = gains.iter().collect();
    sorted.sort_by_key(|(k, _)| k.as_str());
    for (stat, &gain) in sorted {
        if gain <= 0.0 { continue; }
        let cur_val = get_pitching_stat(pitching, stat);
        let cur_xp = *xp_map.get(stat.as_str()).unwrap_or(&0.0);
        let (new_val, rem_xp, leveled) = try_level_up(cur_val, cur_xp, gain);
        xp_map.insert(stat.clone(), rem_xp);
        if leveled > 0 {
            set_pitching_stat(pitching, stat, new_val);
            logs.push(format!("{} +{}", pitching_label(stat), leveled));
        }
    }
    logs
}

fn apply_batting_xp(
    batting: &mut BattingAttributes,
    xp_map: &mut HashMap<String, f64>,
    gains: &HashMap<String, f64>,
) -> Vec<String> {
    let mut logs = Vec::new();
    let mut sorted: Vec<_> = gains.iter().collect();
    sorted.sort_by_key(|(k, _)| k.as_str());
    for (stat, &gain) in sorted {
        if gain <= 0.0 { continue; }
        let cur_val = get_batting_stat(batting, stat);
        let cur_xp = *xp_map.get(stat.as_str()).unwrap_or(&0.0);
        let (new_val, rem_xp, leveled) = try_level_up(cur_val, cur_xp, gain);
        xp_map.insert(stat.clone(), rem_xp);
        if leveled > 0 {
            set_batting_stat(batting, stat, new_val);
            logs.push(format!("{} +{}", batting_label(stat), leveled));
        }
    }
    logs
}

// ── 공개 함수 ─────────────────────────────────────────────────

pub fn calc_training_growth(params: TrainingGrowthParams) -> GrowthResult {
    let p = &params.protagonist;
    let eff = params.efficiency_mod.unwrap_or(1.0);
    let diligence = p.diligence.unwrap_or(50.0);

    let mut pitching_gains: HashMap<String, f64> = HashMap::new();
    let mut batting_gains: HashMap<String, f64> = HashMap::new();
    let mut fatigue_delta = 0.0f64;
    let mut condition_delta = 0.0f64;
    let mut pitch_dev_gain = 0.0f64;

    let programs: &[(Option<&str>, f64)] = &[
        (params.plan.primary_program_id.as_deref(),    1.0),
        (params.plan.secondary_program_id.as_deref(),  0.5),
        (params.plan.secondary2_program_id.as_deref(), 0.5),
    ];

    for (prog_id_opt, mult) in programs {
        let prog_id = match prog_id_opt { Some(id) => id, None => continue };
        let cfg = match get_program(prog_id) { Some(c) => c, None => continue };

        fatigue_delta   += cfg.fatigue_cost   * mult;
        condition_delta -= cfg.condition_cost * mult;
        if cfg.is_recovery { continue; }

        if cfg.is_pitch_dev {
            let cond_factor = p.condition / 100.0;
            let fat_factor = (1.0 - p.fatigue / 120.0).max(0.3);
            pitch_dev_gain += cfg.progress_per_week * mult * cond_factor * fat_factor * eff;
            continue;
        }

        let xp = week_xp(cfg.base_xp, p.condition, p.fatigue, p.development_rate, diligence) * mult * eff;

        for &(stat, stat_mult) in cfg.gains_pitching {
            *pitching_gains.entry(stat.to_string()).or_insert(0.0) += xp * stat_mult;
        }
        for &(stat, stat_mult) in cfg.gains_batting {
            *batting_gains.entry(stat.to_string()).or_insert(0.0) += xp * stat_mult;
        }
    }

    let mut pitching = p.pitching.clone();
    let mut batting = p.batting.clone();
    let mut pitching_xp = p.pitching_xp.clone();
    let mut batting_xp = p.batting_xp.clone();

    let p_logs = apply_pitching_xp(&mut pitching, &mut pitching_xp, &pitching_gains);
    let b_logs = apply_batting_xp(&mut batting, &mut batting_xp, &batting_gains);

    if !p_logs.is_empty() { pitching.ovr = calc_pitching_ovr(&pitching); }
    if !b_logs.is_empty() { batting.ovr  = calc_batting_ovr(&batting); }

    // ── 구종 개발 ─────────────────────────────────────────────
    let mut pitches_out: Option<Vec<PitchEntry>> = None;
    let mut pitch_state_action = "keep".to_string();
    let mut new_training_pitch_state: Option<TrainingPitchState> = None;
    let mut pitch_logs: Vec<String> = Vec::new();

    if pitch_dev_gain > 0.0 {
        if let Some(ref ts) = p.training_pitch_state {
            let new_progress = ts.progress + pitch_dev_gain;
            if new_progress >= 100.0 {
                let mut current_pitches = p.pitches.clone();
                let existing_idx = current_pitches.iter().position(|pe| pe.id == ts.id);
                if let Some(idx) = existing_idx {
                    if current_pitches[idx].grade < 5 {
                        let ng = current_pitches[idx].grade + 1;
                        let og = current_pitches[idx].grade;
                        current_pitches[idx].grade = ng;
                        pitch_logs.push(format!("{} 숙련도 {}→{}", pitch_label(&ts.id), og, ng));
                    } else {
                        pitch_logs.push(format!("{} 이미 마스터", pitch_label(&ts.id)));
                    }
                } else {
                    current_pitches.push(PitchEntry { id: ts.id.clone(), grade: 1 });
                    pitch_logs.push(format!("{} 습득!", pitch_label(&ts.id)));
                }
                pitches_out = Some(current_pitches);
                pitch_state_action = "clear".to_string();
            } else {
                new_training_pitch_state = Some(TrainingPitchState { id: ts.id.clone(), progress: new_progress });
                pitch_state_action = "update".to_string();
            }
        }
    }

    let stat_logs: Vec<String> = p_logs.into_iter().chain(b_logs).collect();
    let mut all_logs = Vec::new();
    if !stat_logs.is_empty() {
        all_logs.push(format!("[훈련] {}", stat_logs.join(", ")));
    }
    all_logs.extend(pitch_logs);

    GrowthResult {
        protagonist_patch: GrowthPatch {
            pitching,
            batting,
            pitching_xp,
            batting_xp,
            fatigue:   clamp(p.fatigue   + fatigue_delta,   0.0, 100.0),
            condition: clamp(p.condition + condition_delta, 0.0, 100.0),
            morale: None,
            pitches: pitches_out,
            pitch_state_action,
            training_pitch_state: new_training_pitch_state,
        },
        logs: all_logs,
        fame_delta: 0,
    }
}

pub fn calc_game_growth(params: GameGrowthParams) -> GrowthResult {
    let p = &params.protagonist;
    let diligence = p.diligence.unwrap_or(50.0);
    let player_type = p.player_type.as_deref().unwrap_or("");
    let is_pitcher = player_type == "pitcher" || player_type == "twoWay";
    let is_batter  = player_type == "batter"  || player_type == "twoWay";

    let mut pitching_gains: HashMap<String, f64> = HashMap::new();
    let mut batting_gains: HashMap<String, f64> = HashMap::new();

    let game_xp = week_xp(3.5 * 0.35, p.condition, p.fatigue, p.development_rate, diligence);

    if is_pitcher {
        for stat in &["velocity", "command", "control"] {
            *pitching_gains.entry(stat.to_string()).or_insert(0.0) += game_xp;
        }
        let mental_xp = if params.won { 0.5 } else if params.score_diff >= 5 { 0.0 } else { 0.3 };
        if mental_xp > 0.0 {
            *pitching_gains.entry("mentality".to_string()).or_insert(0.0) += mental_xp;
        }
    }

    if is_batter {
        for stat in &["contact", "eye"] {
            *batting_gains.entry(stat.to_string()).or_insert(0.0) += game_xp * 0.7;
        }
        if params.won {
            *batting_gains.entry("battingClutch".to_string()).or_insert(0.0) += 0.3;
        }
    }

    let mut pitching = p.pitching.clone();
    let mut batting = p.batting.clone();
    let mut pitching_xp = p.pitching_xp.clone();
    let mut batting_xp = p.batting_xp.clone();

    let p_logs = apply_pitching_xp(&mut pitching, &mut pitching_xp, &pitching_gains);
    let b_logs = apply_batting_xp(&mut batting, &mut batting_xp, &batting_gains);

    if !p_logs.is_empty() { pitching.ovr = calc_pitching_ovr(&pitching); }
    if !b_logs.is_empty() { batting.ovr  = calc_batting_ovr(&batting); }

    let morale_delta = if params.won { 6.0 } else if params.score_diff >= 5 { -15.0 } else { -8.0 };
    let result_log = if params.won { "경기 승리 — 사기 +6".to_string() }
                     else if params.score_diff >= 5 { "대패 — 사기 -15".to_string() }
                     else { "경기 패배 — 사기 -8".to_string() };

    let strikeouts = params.strikeouts.unwrap_or(0);
    let fame_base = if params.won { 2.0 } else if params.score_diff >= 5 { -1.0 } else { 0.0 };
    let fame_delta = (fame_base + strikeouts as f64 * 0.3).round() as i32;

    let growth_logs: Vec<String> = p_logs.into_iter().chain(b_logs).collect();
    let mut all_logs = vec![result_log];
    if !growth_logs.is_empty() {
        all_logs.push(format!("[경기 성장] {}", growth_logs.join(", ")));
    }

    let new_morale = p.morale.map(|m| clamp(m + morale_delta, 0.0, 100.0));

    GrowthResult {
        protagonist_patch: GrowthPatch {
            pitching,
            batting,
            pitching_xp,
            batting_xp,
            fatigue:   clamp(p.fatigue   + 12.0, 0.0, 100.0),
            condition: clamp(p.condition -  8.0, 0.0, 100.0),
            morale: new_morale,
            pitches: None,
            pitch_state_action: "keep".to_string(),
            training_pitch_state: None,
        },
        logs: all_logs,
        fame_delta,
    }
}
