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

// ── 도루 ─────────────────────────────────────────────────────────────────────
//
// ⚠ **모델 두 벌 중 한쪽에만 있었다.** `match_engine`(주인공 경기)은 도루를
// 돌리는데 `npc_sim`(리그 720경기)은 `sb: 0`을 하드코딩했다. 그래서 리그
// **전체 도루가 0**이었고 도루왕이 구조적으로 안 나왔다 — 규정타석 97~102명
// 전원의 sb가 0인 걸 수상 자격선 점검에서야 봤다.
//
// 능력치는 처음부터 있었다(타자 `speed`·`baseInstinct`, 투수 `holdRunners`).
// 쓰는 곳이 한쪽뿐이었을 뿐이다.
//
// 값은 `match_engine::attempt_steals`에 박혀 있던 것을 그대로 올렸다 —
// **두 모델이 같은 상수를 봐야** 주인공 기록과 리그 기록이 같은 척도가 된다.
pub const STEAL_HOLD_SCALE: f64 = 0.008;   // 견제력이 시도 확률을 누르는 폭
/// 주루 판단의 기준점. **50으로 두면 전원이 1.5배**가 된다 — 실측 중앙이 75다
pub const STEAL_INSTINCT_PIVOT: f64 = 75.0;
pub const STEAL_HOLD_MIN: f64   = 0.4;
pub const STEAL_HOLD_MAX: f64   = 1.6;

// ⚠⚠ **계수가 "speed 50이 평균"을 전제하는데 실제 분포는 80 중심이다.**
//
// 실측 리그 타자: speed p25 72 / **중앙 81** / p75 87 / p95 94, instinct 중앙 75.
// 원래 값(pivot 40)으로는 `(81−40)×0.008×(75/50) = 0.49`라 **중앙 주자도 최고
// 주자도 전부 시도 상한(0.30)에 붙는다.** 그래서 능력 차가 도루에 전혀
// 반영되지 않았고, pivot을 40 → 50으로 올려도 실측 도루가 22 → 23으로 그대로였다.
// 3루도 같다 — GATE 68이면 거의 전원이 통과하고 역시 상한(0.16)에 붙는다.
//
// 성공률은 반대로 **너무 낮았다.** 중앙 주자 49.7%(KBO 68~72%)라 실패가 많고,
// 그 아웃이 투수 이닝에 들어가 **리그 ERA를 4.71 → 3.98로 끌어내렸다** —
// 사용자 확정 "KBO 수준(ERA 4점대)"에서 벗어나고, OVR–ERA 상관도
// −0.53 → −0.24로 무너졌다(투수 능력과 무관한 실점이 늘어서다).
//
// 아래 값은 **실측 분포 기준**이다. 중앙 주자는 가끔, 상위 주자는 자주 뛴다.
// 이 계수는 `match_engine`(주인공 경기)도 같이 쓴다 — 그쪽도 같은 전제였고
// 리그 도루가 0이라 대조군이 없어 드러나지 않았다.

// 1루 → 2루
pub const STEAL_2B_SPEED_PIVOT: f64   = 75.0;   // 실측 p25 72 ~ 중앙 81 사이
pub const STEAL_2B_ATTEMPT_SCALE: f64 = 0.008;
pub const STEAL_2B_ATTEMPT_MAX: f64   = 0.30;
pub const STEAL_2B_SUCCESS_BASE: f64  = 0.65;   // KBO 도루 성공률 68~72%
pub const STEAL_2B_SUCCESS_PIVOT: f64 = 80.0;   // 성공률 기준점도 실측 중앙에 맞춘다
pub const STEAL_2B_SUCCESS_SCALE: f64 = 0.007;
pub const STEAL_2B_SUCCESS_MIN: f64   = 0.40;
pub const STEAL_2B_SUCCESS_MAX: f64   = 0.90;

// 2루 → 3루 — 발이 아주 빠른 주자만 시도한다
pub const STEAL_3B_SPEED_GATE: f64    = 88.0;   // 실측 p75 87 위 — 상위권만
pub const STEAL_3B_SPEED_PIVOT: f64   = 85.0;
pub const STEAL_3B_ATTEMPT_SCALE: f64 = 0.006;
pub const STEAL_3B_ATTEMPT_MAX: f64   = 0.16;
pub const STEAL_3B_SUCCESS_BASE: f64  = 0.60;   // 3루 도루는 2루보다 어렵다
pub const STEAL_3B_SUCCESS_PIVOT: f64 = 88.0;
pub const STEAL_3B_SUCCESS_SCALE: f64 = 0.008;
pub const STEAL_3B_SUCCESS_MIN: f64   = 0.35;
pub const STEAL_3B_SUCCESS_MAX: f64   = 0.85;

fn clamp01(v: f64, lo: f64, hi: f64) -> f64 { v.max(lo).min(hi) }

/// 견제력이 도루 시도에 거는 배수. 두 모델이 같이 쓴다
pub fn steal_hold_factor(hold_runners: f64) -> f64 {
    clamp01(1.0 - (hold_runners - 50.0) * STEAL_HOLD_SCALE, STEAL_HOLD_MIN, STEAL_HOLD_MAX)
}

/// 1루 주자의 (시도 확률, 성공 확률)
pub fn steal_second_probs(speed: f64, instinct: f64, hold_factor: f64, manager_boost: f64) -> (f64, f64) {
    let attempt = clamp01(
        (speed - STEAL_2B_SPEED_PIVOT) * STEAL_2B_ATTEMPT_SCALE * (instinct / STEAL_INSTINCT_PIVOT) * hold_factor
            + manager_boost, 0.0, STEAL_2B_ATTEMPT_MAX);
    let success = clamp01(
        STEAL_2B_SUCCESS_BASE + (speed - STEAL_2B_SUCCESS_PIVOT) * STEAL_2B_SUCCESS_SCALE,
        STEAL_2B_SUCCESS_MIN, STEAL_2B_SUCCESS_MAX);
    (attempt, success)
}

/// 2루 주자의 (시도 확률, 성공 확률). `STEAL_3B_SPEED_GATE` 미만은 시도하지 않는다
pub fn steal_third_probs(speed: f64, instinct: f64, hold_factor: f64, manager_boost: f64) -> (f64, f64) {
    if speed <= STEAL_3B_SPEED_GATE { return (0.0, 0.0); }
    let attempt = clamp01(
        (speed - STEAL_3B_SPEED_PIVOT) * STEAL_3B_ATTEMPT_SCALE * (instinct / STEAL_INSTINCT_PIVOT) * hold_factor
            + manager_boost, 0.0, STEAL_3B_ATTEMPT_MAX);
    let success = clamp01(
        STEAL_3B_SUCCESS_BASE + (speed - STEAL_3B_SUCCESS_PIVOT) * STEAL_3B_SUCCESS_SCALE,
        STEAL_3B_SUCCESS_MIN, STEAL_3B_SUCCESS_MAX);
    (attempt, success)
}

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
// ⚠ 0.12는 **너무 낮았다.** 볼 3개에서 거의 존 안만 겨냥하니 볼넷이 잘 안 나와
// 주인공 볼넷 비중이 0.11로 리그(0.18)의 절반이었다. 현실 KBO 비율은
// 3.5/(9+7.5+3.5) ≈ 0.175라 **리그 쪽이 맞고 주인공이 낮았다.**
// 몰려도 완벽히 제구되진 않는다.
//
// ⚠ 카운트를 실제로 반영하자 **볼넷이 더 줄었다**(비중 0.11 → 0.08, 리그 0.18).
// 스트라이크 2개에서 유인구가 많으니 타자가 쫓아가 삼진이 늘고, 볼 3개에서는
// 존 안만 겨냥해 볼넷이 억제되는 조합이었다. 현실적인 운영이지만 **결과가
// 리그의 절반**이면 같은 수상 부문에서 다른 기준으로 경쟁하게 된다.
// 세 값을 함께 올려 존 통과율을 현실선(약 48~50%)에 맞춘다.
pub const AUTO_CHASE_PROB_BEHIND: f64  = 0.30;  // 볼 3개 — 스트라이크를 던져야 한다
pub const AUTO_CHASE_PROB_NEUTRAL: f64 = 0.50;
pub const AUTO_CHASE_PROB_AHEAD: f64   = 0.66;  // 스트라이크 2개 — 유인구
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


// ── NPC 리그 시뮬 위기 상황 (Phase 1-e) ──────────────────────────────────────
//
// ⚠ **`clutch`·`mentality`·`battingClutch`는 이미 생성·저장되고 있었다**
// (`make_pitching`이 `ovr − 8 ± 6`으로 만든다). 저장 타입 주석에도 용도가
// 적혀 있다 — "위기 집중력: 후반 접전/득점권 압박 시 quality 보정".
// 그런데 리그 경기는 그 값을 **읽지 않았다**. `gameSimulator.ts`의
// `SimPitcher`/`SimBatter`가 능력치를 골라 담으면서 빠뜨렸기 때문이다.
//
// 주인공 경기(`match_engine`)에는 `clutch_modifier`·`jam_pressure_modifier`가
// 이미 있다. 같은 개념을 리그로 옮긴다 — 안 그러면 같은 리그에서 주인공만
// 위기에 강해지고 NPC는 성격이 성적에 안 닿는다.
//
// 값은 **투수 능력치 배율**이다(1.0 = 무보정). 폭을 좁게 잡는다 — 위기 보정이
// 크면 능력치보다 상황이 성적을 정하게 되고, 그러면 OVR·성적 상관이 무너진다.
//
// ⚠ **첫 값(0.030/0.012/0.015/0.025)은 너무 작아 측정이 안 됐다.** clutch 20과
// 90의 실효 능력 차가 3%인데 그게 득점권(전체 타석의 약 25%)에만 걸려
// 총합 0.75%였다 — 150경기 ERA 노이즈(±0.15)에 묻혔다.
//
// 그건 측정 문제만이 아니다. **플레이어에게도 안 보인다는 뜻**이고, 그러면
// 성격 능력치를 만들어 저장할 이유가 없다. 아래는 clutch 20↔90이 ERA로
// 0.2~0.4점 갈리도록 올린 값이다(`audit:engine` ④번이 검사한다).
//
// ⚠ **하한이 최고 위기 상황에서 성격을 무력화하고 있었다.** 만루·2아웃·9회·
// 1점차면 압박이 0.200이라 clutch 20도 90도 전부 하한(0.88)에 걸려 **같은
// 값**이 됐다 — 배짱이 가장 중요해야 할 자리에서만 무의미해진 것이다.
// 시즌 ERA 감사로는 평균에 희석돼 절대 못 잡는다(`clutch_tests`가 잡았다).
//
// 압박 총합이 하한에 닿지 않도록 낮추고 하한도 함께 내렸다.
// 최악 조합(만루·2아웃·후반접전) 총합 0.147 → clutch 20에서 0.80,
// 90에서 0.924로 **12%p가 살아 있다**.
pub const NPC_CLUTCH_SCORING_POS: f64   = 0.055;  // 2·3루 주자
pub const NPC_CLUTCH_TWO_OUT: f64       = 0.022;
pub const NPC_CLUTCH_LOADED: f64        = 0.025;  // 만루 추가
pub const NPC_CLUTCH_LATE_CLOSE: f64    = 0.045;  // 후반 + 3점차 이내
/// 압박을 얼마나 덜어내는가 — 투수 clutch/mentality 1점당
pub const NPC_CLUTCH_PITCHER_SCALE: f64 = 0.0080;
pub const NPC_CLUTCH_MENTAL_SCALE: f64  = 0.0040;
/// 타자 battingClutch 1점당 압박 가중
pub const NPC_CLUTCH_BATTER_SCALE: f64  = 0.0006;
pub const NPC_CLUTCH_MIN: f64           = 0.78;
pub const NPC_CLUTCH_MAX: f64           = 1.05;


// ── 1군 로스터 야수 하한 (Phase 1-f) ─────────────────────────────────────────
//
// ⚠ **`fill_first_teams`가 보직을 안 보고 능력치 순으로만 올렸다.**
// 2군 상위권이 투수에 몰려 있으면 투수만 계속 승격돼 로스터를 잠식한다.
//
// 실측(2027): `TEAM_KBL_SEOUL_ROYALS_1` 야수 **7명** · 투수 27명 · 총 34명.
// 정원(34)은 꽉 찼는데 야수가 7명이었다. 콜업은 같은 포지션 1:1 교체라
// 배분을 안 깨는데, 이 순수 충원 경로에만 구분이 없었다.
//
// 야수가 9명 미만이면 라인업이 짧아지고 Rust가 `lineup[lpos % n]`으로 돌리므로
// **남은 타자의 타석이 9/n 배로 부푼다**(실측 경기당 7.1타석, 정상 4.7 = 1.51배).
// 그러면 능력치가 아니라 출전량이 성적을 만들어 OVR·성적 상관이 무너진다
// (실측 상관 −0.5 → −0.25).
//
// **값의 근거는 생성 시점 구성과 현실 구단이다.**
//
//   `rosterSize` 30 × `pitcherRatio` 0.45  →  투수 14 / **야수 16**
//
// KBO 1군은 등록 28명에 야수 15~17명이다:
//   선발 9(지명타자 포함) + 백업 포수 1 + 내야 백업 2~3 + 외야 백업 2 + 대타·대주자 1~2
// 백업 포수가 특히 중요하다 — 다른 자리는 대체가 되지만 포수는 전문 요원이다.
//
// ⚠ 처음엔 10으로 뒀다. "타순 한 바퀴(9) + 여유 1"이라는 좁은 근거였고,
// **생성 시점 값(16)과 현실(15~17)이 이미 일치하는데 그걸 안 봤다.**
// 14는 생성값 16에서 부상·강등 여유 2를 뺀 선이다.
pub const FIRST_TEAM_MIN_BATTERS: usize = 14;

/// 1군 투수 하한 — 콜다운이 투수만 골라 내리는 것을 막는다.
///
/// ⚠ **야수 하한만 걸었더니 반대편이 눌렸다.** 야수가 하한 이하일 때
/// 강등 대상을 투수 안에서만 고르게 했더니, 이번엔 투수가 빠졌다.
/// 실측: 야수 하한 도입 전 1군 투수 9~11명 → 도입 후 **시즌 종료 5명**.
/// 한쪽 하한만 있으면 정원 압력이 전부 반대쪽으로 흐른다.
///
/// 값의 근거는 야수 하한과 같은 축이다:
///   `rosterSize` 30 × `pitcherRatio` 0.45  →  **투수 14** / 야수 16
/// KBO 1군은 투수 11~13명(선발 5 + 불펜 6~8)이고, 14에서 여유 2를 뺀 12가
/// 그 범위 안이다. 야수(16→14)와 같은 폭으로 뺀다.
///
/// 하한 둘의 합은 26이라 정원 30 안에 들어간다 — 둘 다 잠겨도 교착이 아니다.
pub const FIRST_TEAM_MIN_PITCHERS: usize = 12;

/// 2군 보직 하한 — **공백 충원 콜업이 2군을 비우는 것을 막는다.**
///
/// ⚠ 일반 콜업은 같은 포지션 1:1 교체라 2군 구성이 안 바뀐다(올라간 자리에
/// 내려온 선수가 들어간다). 그런데 **공백 충원은 부류를 넘나든다** — 1군
/// 포수 자리를 메우려고 2군 포수를 올리고 대신 1루수를 내려보낸다.
/// 투수 쪽에서 이게 반복되자 실측 2군 투수가 7명 → **0명**이 됐고,
/// 야수 32명 / 투수 8명인 팀이 나왔다.
///
/// 값은 "2군도 경기를 치른다"에서 온다 — 선발 5인 로테이션 + 불펜 3.
/// 야수는 타순 한 바퀴(9)다. 1군 하한(14/12)보다 낮게 두는 건 의도다:
/// 2군은 1군에 공급하는 곳이라 여유가 1군만큼 필요하지 않고, 하한을 높이면
/// 공백 충원이 항상 막혀 **1군 포수 0명이 안 고쳐진다.**
pub const FARM_MIN_PITCHERS: usize = 8;
pub const FARM_MIN_BATTERS:  usize = 9;

/// 세이브 요건 점수차 (KBO·MLB 공통 3점 이내).
///
/// ⚠ **등판 조건과 판정 조건이 같아야 한다.** 이 값이 두 군데에 따로 적혀
/// 있으면 "마무리는 나왔는데 세이브는 안 붙는" 경기가 생긴다.
/// 읽는 곳: `npc_sim.rs`의 9회 마무리 투입 · `pitcher_decision`.
pub const SAVE_MAX_MARGIN: i32 = 3;

/// 투수 중 **선발** 비중. `roster_gen`이 초기 로스터를 이 값으로 나눈다
/// (투수 14명 → 선발 6 · 불펜 8).
///
/// ⚠ **충원 경로가 이 값을 안 지켜서 선발이 매년 불어났다.** 신입생 폴백은
/// 55%, `neededPositions`는 `% 3 === 2`로 67%를 선발로 뽑았다 —
/// 6시즌에 리그 선발이 **57명 → 112명**(팀당 11명)이 됐다. 로테이션은
/// 5~6인데 두 배다.
///
/// 그러면 명목상 선발이 각자 짧게 던져 ERA가 운에 흔들리고, **능력치가
/// 성적을 만드는 정도가 무너진다** — 실측 OVR–ERA 상관이 선발 57명일 때
/// −0.61인데 112명일 때 −0.19였다.
pub const SP_SHARE_OF_PITCHERS: f64 = 0.45;

/// 1군 선발 하한 — **콜다운이 불펜만 골라 내리는 것을 막는다.**
///
/// ⚠ 콜다운은 부류(투/야)만 보고 `rated()` 낮은 순으로 내린다. 불펜이 대체로
/// 약해서 **RP부터 빠지고 SP만 쌓인다** — 실측 팀당 선발 9~12명(로테이션은 5).
/// 로테이션 밖 선발은 등판이 드물어 표본이 얇아지고, 그러면 ERA가 능력치를
/// 반영하지 못한다.
///
/// 5인 로테이션 + 부상 여유 1. 이 아래로는 선발을 안 내린다.
pub const FIRST_TEAM_MIN_STARTERS: usize = 6;
