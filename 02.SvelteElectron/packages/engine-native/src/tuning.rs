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
/// 리그를 모를 때 쓰는 기본 상한. 리그별 상한은 `league_pitch_limit()` (Phase 5-8)
pub const PROTAGONIST_PITCH_COUNT_HARD: f64    = 120.0;

/// 경기당 투구수 상한 — 리그별 (DESIGN §7.2 · 02_고교.md §4-3).
///
/// 고교만 105구다. 성장기 보호 성격이고, 단판 넉아웃 전국대회에서
/// "에이스를 아껴 쓸까 밀어붙일까" 딜레마를 만드는 장치이기도 하다.
/// 대학·독립·프로는 120구 — 성인 체력 반영이라 "보호"보다 "관리 전략"에 가깝다.
pub fn league_pitch_limit(league_id: &str) -> f64 {
    match league_id {
        "LEAGUE_HIGHSCHOOL" => 105.0,
        _ => 120.0,
    }
}

/// 소프트 캡(감독이 교체를 고민하기 시작하는 지점)도 상한에 비례해 당긴다.
/// 105구 리그에서 90구 소프트캡은 여유가 15구뿐이라 사실상 하드캡과 같아진다.
pub fn league_pitch_soft(league_id: &str) -> f64 {
    league_pitch_limit(league_id) * 0.75
}
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


// ── NPC 리그 시뮬 타격 밸런스 (Phase 1-b) ────────────────────────────────────
//
// **주인공 경기(`match_engine`)와 리그 경기(`npc_sim`)는 타격 모델이 다르다.**
// 리그 720경기는 전부 `npc_sim_one_pitch`를 타고, 여기 계수가 리그 수준을 정한다.
//
// ⚠ 실측(2026 KBL, 수정 전): 타율 중앙 **.431** · 리그 ERA **11.67** ·
// 9이닝당 피안타 **20.4**. 삼진(7.5)·볼넷(2.0)은 정상 범위였고 **어긋난 건
// 인플레이 타구 하나**였다 — 현실 야구는 인플레이 타구의 약 70%가 아웃인데
// (BABIP .300) 여기선 contact 70 기준 54%였다.
//
// 그 값이 규칙 파일들을 조용히 무력화하고 있었다. `promotionRules`의
// `batterOpsBaseline`(0.700)·`pitcherEraBaseline`(4.50)은 **현실 수치로 쓰여
// 있는데** 리그 OPS가 1.0이라 전 타자가 기준을 넘어 승강 판정에서 성적이
// 사실상 무의미했고, 방어율왕 자격선(4.5)은 리그 최저 ERA 8.27이 못 넘었다.
//
// 목표는 KBO 수준(타율 .270대, 사용자 확정 2026-08-02)이고 **레버는 하나다** —
// 삼진·볼넷 계수는 건드리지 않는다. 한 번에 하나만 움직여야 무엇이 듣는지 안다.
//
// ⚠ **`contact` 기울기는 아주 완만해야 한다.** 처음엔 0.0045로 뒀는데
// 1차 조정 실측에서 1군 .332 · 2군 .287로 **리그 간 격차가 그대로 남았다** —
// 능력치가 높은 1군일수록 인플레이 아웃이 크게 줄어 타격이 과하게 유리했다.
// 두 리그 수치로 역산하니 필요한 기울기는 0.001 수준이었다.
//
// 이게 현실과도 맞다: **BABIP은 타자별 편차가 작다**(대체로 .290~.310).
// 타자의 실력은 인플레이 안타 확률이 아니라 삼진율·볼넷·장타로 나타나고,
// 그 세 축은 `contact_prob`·`foul_prob`·`hr_rate`가 이미 따로 반영한다.
// 여기에 기울기를 크게 주면 **같은 능력치가 두 번 세어진다.**
//
// ⚠ **감사(OVR 70 대 70)와 실제 리그가 다르다.** 감사에선 ERA 4.39 · K/9 7.8이
// 나왔는데 같은 계수로 실제 KBL 1군은 ERA 5.56 · K/9 6.2였다. 생성된 로스터의
// 능력치 분포가 감사의 균일 입력과 달라서다 — **감사는 내부 정합성을 보증할 뿐
// 리그 밸런스는 실제 로스터로 재야 한다.** 0.690 → 0.725는 그 실측에 맞춘 값이다.
pub const NPC_INPLAY_OUT_BASE: f64          = 0.725;
pub const NPC_INPLAY_OUT_CONTACT_SCALE: f64 = 0.001;
pub const NPC_INPLAY_OUT_MIN: f64           = 0.60;
pub const NPC_INPLAY_OUT_MAX: f64           = 0.75;


// ── 투수 AI 코스 선택 (Phase 1-c) ────────────────────────────────────────────
//
// ⚠ **존 밖을 겨냥하는 분기가 아예 없었다.** `auto_pick_decision`의 목표는
// 카운트와 무관하게 전부 |x|,|y| <= 1.0(스트라이크 존) 안이었고,
// 착탄 분산도 control 70 기준 sigma 0.09라 볼 판정선(존 1.0 + 섀도 0.2 = 1.2)까지
// 4.4시그마였다. 사실상 볼이 나올 수 없었다.
//
// 실측(엔진 직접 호출 200경기): **볼넷 3개** · 피안타/(피안타+삼진) 0.78.
// 같은 조건에서 `npc_sim`은 볼넷 비중 0.07 · 피안타 비중 0.54였다.
// 타자가 늘 존 안 공만 보고 불리한 카운트에 몰릴 일이 없으니 인플레이 타구가
// 폭증했다 — **볼넷 0과 피안타 폭증은 한 원인이다.**
//
// 현실 야구의 존 통과율은 약 48~50%다. 카운트가 유리할수록 유인구가 늘어난다.
pub const AUTO_CHASE_PROB_BEHIND: f64  = 0.12;  // 볼 3개 — 스트라이크를 던져야 한다
pub const AUTO_CHASE_PROB_NEUTRAL: f64 = 0.42;
pub const AUTO_CHASE_PROB_AHEAD: f64   = 0.62;  // 스트라이크 2개 — 유인구
/// 존 밖 목표의 중심축 거리 (존 경계 1.0, 볼 판정선 1.2)
pub const AUTO_CHASE_MIN: f64          = 1.05;
pub const AUTO_CHASE_SPAN: f64         = 0.45;


// ── NPC 리그 시뮬 볼/스트라이크 (Phase 1-c) ──────────────────────────────────
//
// ⚠ 실측 볼넷 **9이닝당 1.2**(KBO 약 3.5) · 타석당 볼넷율 0.03(현실 0.08).
// 타율·ERA·피안타는 1-b에서 맞췄는데 볼넷만 남았다.
//
// `strike_prob`는 "이 공이 스트라이크 존에 들어가는가"다. 0.58 기준에
// 제구·커맨드 보정이 붙어 control 70이면 0.68 — 현실(존 통과율 약 48%,
// 볼 비율 약 36%)보다 한참 높다. 게다가 존 밖 공의 22%를 타자가 쫓아가
// 실제 볼 비율은 25%까지 떨어졌다.
//
// **볼넷은 볼 비율에 비선형으로 반응한다**(4개를 3스트라이크 전에 모아야 한다).
// 조금만 낮춰도 크게 움직이므로 한 번에 하나씩 재면서 맞춘다.
pub const NPC_STRIKE_PROB_BASE: f64 = 0.500;
pub const NPC_CHASE_BASE: f64       = 0.240;
