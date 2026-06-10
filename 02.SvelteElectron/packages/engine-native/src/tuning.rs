// ── Phase 2 매치 엔진 튜닝 상수 (바이너리 내부 — JS에 비공개) ─────────────────
// matchEngineTuning.ts 의 DEFAULT_MATCH_ENGINE_TUNING 값과 동기

use crate::types::{PitchType, PitchStrategy, PitchPower, WeatherType, ParkType};

// pitchBase
pub fn pitch_base(t: PitchType) -> f64 {
    match t {
        PitchType::Fastball   => 59.0,
        PitchType::Sinker     => 57.0,
        PitchType::Cutter     => 56.0,
        PitchType::Slider     => 56.0,
        PitchType::Curve      => 54.0,
        PitchType::Changeup   => 53.0,
        PitchType::Splitter   => 54.0,
        PitchType::Forkball   => 53.0,
        PitchType::Screwball  => 52.0,
        PitchType::Knuckleball=> 50.0,
    }
}

pub fn strategy_bonus(s: PitchStrategy) -> f64 {
    match s {
        PitchStrategy::Aggressive => 2.0,
        PitchStrategy::Balanced   => 0.0,
        PitchStrategy::Safe       => -2.0,
    }
}

pub fn power_bonus(p: PitchPower) -> f64 {
    match p {
        PitchPower::Low    => -1.5,
        PitchPower::Normal => 0.0,
        PitchPower::High   => 2.8,
    }
}

pub const STAMINA_BASE: f64              = 0.45;
pub const STAMINA_AGGRESSIVE_BONUS: f64  = 0.12;
pub const STAMINA_FASTBALL_BONUS: f64    = 0.10;

pub fn stamina_power_cost(p: PitchPower) -> f64 {
    match p {
        PitchPower::Low    => 0.05,
        PitchPower::Normal => 0.15,
        PitchPower::High   => 0.30,
    }
}

pub const MENTAL_RECOVERY_INNING_END: f64 = 1.5;

pub const HIT_UPGRADE_SINGLE_TO_DOUBLE_BASE: f64 = 0.18;
pub const HIT_UPGRADE_DOUBLE_TO_HR_BASE: f64     = 0.22;

pub fn weather_power_modifier(w: WeatherType) -> f64 {
    match w {
        WeatherType::WindyIn  => -0.1,
        WeatherType::WindyOut =>  0.1,
        _                     =>  0.0,
    }
}

pub fn weather_quality_modifier(w: WeatherType, t: PitchType) -> f64 {
    match w {
        WeatherType::Rainy => {
            if t == PitchType::Fastball { -1.0 } else { -3.0 }
        }
        WeatherType::WindyOut => -2.0,
        WeatherType::WindyIn  =>  2.0,
        WeatherType::Cloudy   => -0.5,
        _                     =>  0.0,
    }
}

pub fn park_quality_modifier(p: ParkType) -> f64 {
    match p {
        ParkType::PitcherPark =>  3.0,
        ParkType::HitterPark  => -3.0,
        _                     =>  0.0,
    }
}

pub const DOUBLE_PLAY_BASE_PROB: f64 = 0.22;

// 감독 교체 임계값
pub const NPC_STARTER_STAMINA_LIMIT: f64       = 35.0;
pub const NPC_STARTER_PITCH_COUNT_SOFT: f64    = 65.0;
#[allow(dead_code)]
pub const NPC_STARTER_PITCH_COUNT_HARD: f64    = 110.0;
pub const PROTAGONIST_PITCH_COUNT_SOFT: f64    = 90.0;
pub const PROTAGONIST_PITCH_COUNT_HARD: f64    = 120.0;
pub const PROTAGONIST_STAMINA_EMERGENCY: f64   = 5.0;

// 마운드 방문
pub const MOUND_VISIT_MENTAL_RECOVERY: f64  = 8.0;
pub const MOUND_VISIT_STAMINA_RECOVERY: f64 = 3.0;
pub const MOUND_VISIT_MIN_PITCH_GAP: i32    = 6;

// 공격 전술
pub const OFFENSE_STEAL_MODIFIER: f64 = 0.006;

// Phase A: 착탄 분산
pub const DISPERSION_BASE: f64           = 0.15;
pub const DISPERSION_CONTROL_SCALE: f64  = 0.003;
pub const DISPERSION_STAMINA_SCALE: f64  = 0.002;
pub const DISPERSION_MENTAL_SCALE: f64   = 0.001;
pub const SHADOW_ZONE_HALF: f64          = 0.20;
pub const LOCATION_CENTER_PENALTY: f64   = -4.0;
pub const LOCATION_DISTANCE_SCALE: f64   = 5.0;

// Phase B: 스윙 결정
pub const SWING_MARGIN_BASE: f64          = 0.18;
pub const SWING_DISCIPLINE_SCALE: f64     = 0.003;
pub const SWING_EYE_SCALE: f64            = 0.002;
pub const SWING_FASTBALL_BONUS: f64       = 0.08;
pub const SHADOW_UMPIRE_STRIKE_PROB: f64  = 0.45;
