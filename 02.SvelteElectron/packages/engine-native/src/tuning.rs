// ── Phase 2 매치 엔진 튜닝 상수 (바이너리 내부 — JS에 비공개) ─────────────────
// matchEngineTuning.ts 의 DEFAULT_MATCH_ENGINE_TUNING 값과 동기

use crate::types::{PitchType, PitchStrategy, PitchPower, WeatherType, ParkType};

// pitchBase
/// 숙련도(1~5) → 공의 품질 **가산**. 3이 기준(0)이다.
///
/// ⚠ **곱셈이 아니라 덧셈이다.** 처음에 `pitch_base × 배수`로 걸었더니
/// 1등급 패스트볼이 매 투구마다 −7.1을 먹었다 — 품질은 여러 항의 **합**이고
/// 다른 보정이 ±5 규모인데 혼자 그 이상을 움직였다. 실측에서 주인공 ERA가
/// 8.78 → 19.86, 피안타 13.7 → 26.3으로 튀었다(2026-08-08).
///
/// ⚠ 숙련도가 **배우는 속도만** 늦추던 시절엔 결과에 아예 안 닿았다.
/// 화면엔 "숙련도 4/5"라고 적혀 있는데 던지면 차이가 없었다는 뜻이다.
pub fn grade_quality_bonus(grade: u8) -> f64 {
    match grade {
        0 | 1 => -3.0,
        2     => -1.5,
        3     =>  0.0,
        4     =>  1.5,
        _     =>  3.0,
    }
}

/// 숙련도 → 선택 가중. 잘 다듬은 구종을 더 자주 던진다 — "주무기"가 생긴다
pub fn grade_pick_weight(grade: u8) -> f64 {
    match grade {
        0 | 1 => 0.5,
        2     => 0.8,
        3     => 1.0,
        4     => 1.5,
        _     => 2.0,
    }
}

/// 새 구종을 몸에 넣는 동안 흔들리는 제구 — `(command, control)` 하락폭.
///
/// **정본은 여기 하나다.** 경기(`build_pitcher`)와 화면(미리보기 조회)이 같이 쓴다.
/// 화면에만 적고 경기에 안 가면 "표시는 있는데 효과가 없는" 결함이 되고,
/// 경기에만 걸고 화면에 안 적으면 **조용한 너프**가 된다 — 둘 다 이 프로젝트가
/// 이미 겪은 모양이다.
///
/// - `difficulty` 0~3 (`pitch_catalog.json`의 `formDifficulty`). 0이면 안 흔들린다
/// - 제구가 좋은 투수는 덜 흔들린다 — 같은 너클볼도 아무나 같지 않다
pub fn form_penalty(difficulty: f64, control: f64) -> (f64, f64) {
    if difficulty <= 0.0 { return (0.0, 0.0); }
    // 제구 50이 기준. 80이면 0.7배, 30이면 1.2배로 흔들린다
    let skill = (1.0 - (control - 50.0) / 100.0).clamp(0.70, 1.20);
    let cmd = difficulty * 1.6 * skill;
    let ctl = difficulty * 1.1 * skill;
    ((cmd * 10.0).round() / 10.0, (ctl * 10.0).round() / 10.0)
}

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

// ── 구속 · 완급 조절 (결정 ⑧ · 2026-09-07) ────────────────────
//
// 🔴 **엔진에 구속 값이 없었다.** 있는 것은 화면의 표시식(`MatchPage.svelte`
//   `statToKmh` — `100 + 스탯×0.65`)뿐인데 그건 **구종을 안 본다.** 직구든
//   커브든 같은 숫자가 나오니 그걸로는 낙차를 못 잰다. 그래서 여기 둔다.
//
// ⚠ **바탕은 표시식과 같게 맞췄다.** 직구일 때 화면 카드의 km/h 와 엔진의
//   값이 어긋나면 「145 라더니 왜」가 된다 — 어긋날 이유가 없다. 구종 오프셋
//   만 엔진이 더 안다.
//
// 오프셋 근거: 실제 야구의 구종별 평균 구속 차(4심 대비)다.
//   싱커 −3 · 커터 −5 · 슬라이더 −11 · 스플리터 −13 · 스크류 −14 ·
//   포크 −15 · 체인지업 −16 · 커브 −20 · 너클 −25
// 조정은 `BALANCE_BACKLOG §투구`.

/// 완급 조절을 켠다 (1.0). **0 이면 결정 ⑧ 이전과 완전히 같다** — 난수도
/// 한 방울 안 다르게 흐른다. 계측용 환경변수 `PB_TEMPO`.
pub const TEMPO_MODE: f64 = 1.0;
pub fn tempo_mode() -> f64 {
    match std::env::var("PB_TEMPO") {
        Ok(v) => v.parse::<f64>().unwrap_or(TEMPO_MODE),
        Err(_) => TEMPO_MODE,
    }
}

/// 코스 반복 페널티를 켠다 (1.0). **0 이면 결정 ⑨ 이전과 완전히 같다** —
/// AI 의 코스 재추첨까지 안 돈다(재추첨은 난수를 한 번 더 먹는다).
/// 계측용 환경변수 `PB_COURSE`.
pub const COURSE_MODE: f64 = 1.0;
pub fn course_mode() -> f64 {
    match std::env::var("PB_COURSE") {
        Ok(v) => v.parse::<f64>().unwrap_or(COURSE_MODE),
        Err(_) => COURSE_MODE,
    }
}

pub const PITCH_SPEED_BASE: f64     = 100.0;
pub const PITCH_SPEED_PER_STAT: f64 = 0.65;
/// 힘조절 — 화면 표시식과 같은 ±5 km/h
pub const PITCH_SPEED_POWER_DELTA: f64 = 5.0;

/// 직구 대비 구속 차 (km/h). 음수만 있다 — 직구가 제일 빠르다
pub fn pitch_speed_offset(t: PitchType) -> f64 {
    match t {
        PitchType::Fastball    =>   0.0,
        PitchType::Sinker      =>  -3.0,
        PitchType::Cutter      =>  -5.0,
        PitchType::Slider      => -11.0,
        PitchType::Splitter    => -13.0,
        PitchType::Screwball   => -14.0,
        PitchType::Forkball    => -15.0,
        PitchType::Changeup    => -16.0,
        PitchType::Curve       => -20.0,
        PitchType::Knuckleball => -25.0,
    }
}

/// 이 공의 구속 (km/h) — **엔진 안의 값이다.** 표시식과 바탕은 같다
pub fn pitch_speed(velocity_stat: f64, t: PitchType, p: PitchPower) -> f64 {
    let power = match p {
        PitchPower::High   =>  PITCH_SPEED_POWER_DELTA,
        PitchPower::Low    => -PITCH_SPEED_POWER_DELTA,
        PitchPower::Normal =>  0.0,
    };
    PITCH_SPEED_BASE + velocity_stat * PITCH_SPEED_PER_STAT + pitch_speed_offset(t) + power
}

/// 낙차 문턱 (km/h)과 그때의 품질 가산.
///
/// ⚠ **구종 반복 페널티와 겹쳐 걸린다.** 같은 구종을 이어 던지면 낙차가 0 이라
///   가산도 0 이고 페널티만 남는다 — 둘이 서로를 지우지 않는다.
/// ⚠ 문턱이 계단이라 **슬라이더(−11)가 직구 뒤에 오면 바로 +1.0** 이다.
///   커브(−20)·너클(−25)만 +2.0 에 닿는다.
pub const SPEED_GAP_SMALL: f64       = 10.0;
pub const SPEED_GAP_SMALL_BONUS: f64 =  1.0;
pub const SPEED_GAP_BIG: f64         = 20.0;
pub const SPEED_GAP_BIG_BONUS: f64   =  2.0;

/// 직전 공과의 낙차가 주는 가산. **직전이 없으면 0** — 첫 공은 견줄 게 없다
pub fn speed_gap_bonus(prev: Option<f64>, cur: f64) -> f64 {
    if tempo_mode() <= 0.0 { return 0.0; }
    let Some(p) = prev else { return 0.0 };
    let gap = (p - cur).abs();
    if gap >= SPEED_GAP_BIG { SPEED_GAP_BIG_BONUS }
    else if gap >= SPEED_GAP_SMALL { SPEED_GAP_SMALL_BONUS }
    else { 0.0 }
}

// ── 코스 반복 페널티 (결정 ⑨ · 2026-09-07) ────────────────────
//
// 구종 반복(`pitch_pattern_modifier`)과 **같은 꼴**이되 크기를 작게 뒀다.
// 코스는 연속값이라 「같은 자리」가 구종만큼 또렷하지 않다 — 3×3 격자로
// 접은 뒤에도 같은 칸 안에서 20cm 씩 움직인 것과 똑같이 꽂은 것이 구별되지
// 않는다. 그래서 구종의 절반이다.
//
// ⚠ **존 밖은 칸 하나다**(`COURSE_CELL_OUT`). 유인구가 카운트별로 0.30~0.66
//   확률이라 연속으로 나기 쉬운데, 이걸 사방으로 쪼개면 「바깥으로 계속
//   뺐다」가 반복으로 안 잡힌다. 쪼갤지는 실측 뒤에 정한다
//   (`BALANCE_BACKLOG §투구`).
pub const COURSE_REPEAT_1: f64 = -0.5;
pub const COURSE_REPEAT_2: f64 = -1.0;
pub const COURSE_REPEAT_3: f64 = -2.0;
/// 최근 3구에 없던 칸 — 구종의 +1 보다 작다
pub const COURSE_FRESH_BONUS: f64 = 0.5;

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

/// 병살 확률 — **땅볼 기준**이다 (주자 1루 · 2아웃 전).
///
/// ⚠ 예전엔 타구 종류를 안 보고 인플레이 아웃 전부에 이 확률을 걸었다.
/// 그래서 **중견수 뜬공에도 22%로 병살이 붙었다.** 결과 코드가
/// `INPLAY_OUT` 하나뿐이라 화면에 "아웃"으로만 나와 안 보였을 뿐이다.
pub const DOUBLE_PLAY_BASE_PROB: f64 = 0.22;

/// 삼중살 — **병살이 난 타구 중에서** 다시 걸러낸다.
///
/// ⚠ 조건은 병살보다 좁다: 무사 · 주자 둘 이상. 실제 KBO 는 시즌
///   0~2건이라 병살(연 100건대) 대비 아주 낮아야 한다.
pub const TRIPLE_PLAY_FROM_DP: f64 = 0.02;

/// 직선타 병살 배수. 잡아서 주자를 묶는 경우라 땅볼보다 훨씬 드물다
pub const DOUBLE_PLAY_LINEDRIVE_MOD: f64 = 0.25;

// 감독 교체 임계값
pub const NPC_STARTER_STAMINA_LIMIT: f64       = 35.0;
pub const NPC_STARTER_PITCH_COUNT_SOFT: f64    = 65.0;
#[allow(dead_code)]
pub const NPC_STARTER_PITCH_COUNT_HARD: f64    = 110.0;
/// 주인공이 교체를 고민하기 시작하는 투구수.
///
/// ⚠ NPC 선발은 65구다(NPC_STARTER_PITCH_COUNT_SOFT). 주인공만 90이라
/// **혼자 지친 채로 9이닝을 갈아 넣는다** — 그게 주인공(오프셋 7)과
/// 리그(오프셋 0)가 다른 값을 요구하던 원인의 하나다.
/// 계측용 PB_PROT_PITCH_SOFT 환경변수가 덮는다.
pub const PROTAGONIST_PITCH_COUNT_SOFT: f64    = 90.0;

pub fn protagonist_pitch_soft() -> f64 {
    match std::env::var("PB_PROT_PITCH_SOFT") {
        Ok(v) => v.parse::<f64>().unwrap_or(PROTAGONIST_PITCH_COUNT_SOFT),
        Err(_) => PROTAGONIST_PITCH_COUNT_SOFT,
    }
}
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
/// 주인공이 마운드를 내려가는 **비상** 스태미나 하한.
///
/// ⚠ **이건 정상 교체 사유가 아니다** (2026-08-13). 예전엔 35였고 주석에
/// "NPC와 같은 기준"이라 적혀 있었는데, **NPC는 스태미나 문턱을 아예 안
/// 쓴다** — `PitcherQueue::should_switch`가 아웃카운트 예산과 투구수만 본다.
/// 35라는 숫자가 NPC의 어떤 값과도 대응하지 않았다.
///
/// 그래서 등판 길이가 갈렸다:
///   NPC 선발  max_outs = 12 + (스태미나/99)*15  → 스태미나 60이면 7이닝
///   주인공    스태미나 <= 35                    → 실측 4.5이닝
///
/// 이제 주인공도 `protagonist_max_outs`로 아웃 예산을 받고, 이 값은 부상·급락
/// 처럼 **예산을 채우기 전에 무너지는 경우**의 하한으로만 남는다.
///
/// ⚠ 계측용 PB_PROT_STAMINA_EXIT 환경변수가 덮는다.
pub const PROTAGONIST_STAMINA_EMERGENCY: f64   = 15.0;

pub fn protagonist_stamina_exit() -> f64 {
    match std::env::var("PB_PROT_STAMINA_EXIT") {
        Ok(v) => v.parse::<f64>().unwrap_or(PROTAGONIST_STAMINA_EMERGENCY),
        Err(_) => PROTAGONIST_STAMINA_EMERGENCY,
    }
}

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
/// 포수 송구(`arm`)가 도루 성공을 누르는 폭.
///
/// 🔴 **포수가 도루에 아무 영향이 없었다.** 투수 견제(`hold_runners`)만 걸리고
///    포수는 자리만 지켰다 — 어깨 좋은 포수를 두는 뜻이 없었다.
///
/// 한 눈금당 성공 확률이 이만큼 깎인다. 0.004면 기준점보다 어깨가 16 높은
/// 포수가 성공률을 **6.4%p** 깎는다 — 실제 KBO 상위 포수의 저지율 차이가
/// 그 대역이다.
///
/// ⚠ **중립은 50 이 아니다.** 아래 `STEAL_CATCHER_ARM_PIVOT` 을 봐라 —
///   2026-09-01 에 리그 실측 중앙(74)으로 옮겼다. 이 줄이 "50이 중립"이라고
///   적고 있어서 **기준점이 틀린 걸 아무도 못 봤다.**
pub const STEAL_CATCHER_ARM_SCALE: f64 = 0.004;

/// 🔴 **기준점을 리그 실측 중앙으로 옮겼다** (2026-09-01 · 50 → 74).
///
/// 예전엔 50 이었다. 그런데 **KBL 1군 포수의 실제 어깨 중앙이 74** 다:
///
/// ```text
///   씨앗 20260802   최소 54 · 중앙 71 · 최대 97   (26명)
///   씨앗 777        최소 57 · 중앙 76 · 최대 90   (28명)
///   씨앗 31337      최소 63 · 중앙 76 · 최대 92   (25명)
/// ```
///
/// 기준점이 24 낮으니 **평균적인 포수가 이미 `24 × 0.004 = 9.6%p` 를
/// 깎고 있었다.** 그래서 산식이 의도한 69.5% 자리에서 실측 56% 가 나왔다:
///
/// ```text
///   시도가중 평균 스피드 85.4  →  0.65 + 5.4×0.007 = 68.8%   ← 산식 의도
///   포수 74 감점                −24×0.004         = −9.6%p
///   3루 도루(성공률 5%p 낮음) 섞임                            = 실측 56%
/// ```
///
/// ⚠ **바로 옆 `STEAL_2B_SUCCESS_PIVOT` 주석이 "실측 중앙에 맞춘다"고
///   적어 뒀다.** 스피드 쪽은 그렇게 했는데 **포수 쪽만 50 으로 남아 있었다** —
///   같은 규칙을 한쪽에만 적용한 형태다.
///
/// ⚠ **`SCALE` 은 안 건드렸다.** 어깨 90 인 포수가 16%p 를 깎는다는 폭은
///   KBO 상위 포수의 저지율 차이 대역이라 그대로 맞다. 기준점만 틀렸다.
///
/// ⚠ 이제 **평균 포수는 감점 0** 이고, 어깨가 74 아래면 오히려 도루가 더
///   쉬워진다(음수 감점). 그게 맞다 — 약한 어깨는 뛰기 좋아야 한다.
pub const STEAL_CATCHER_ARM_PIVOT: f64 = 74.0;

/// 포수 송구 → 성공 확률 보정. 포수를 모르면 기준점을 넘겨 0이 되게 한다.
///
/// ⚠ `make_default_fielder` 는 `arm: 50.0` 을 준다 — 기준점이 74 가 된 지금
///   그 폴백은 **감점이 아니라 +9.6%p 가산**이다. 라인업을 못 짠 경기에서만
///   쓰이므로 리그 지표에는 안 잡히지만, 그 갈래가 늘면 도루가 쉬워진다.
pub fn steal_catcher_penalty(catcher_arm: f64) -> f64 {
    (catcher_arm - STEAL_CATCHER_ARM_PIVOT) * STEAL_CATCHER_ARM_SCALE
}

/// 대타 — 후반 접전에 약한 타자를 바꾼다.
///
/// ⚠ **감독 `tacticalIQ` 가 판단한다** — 이번 세션에 살린 값이다.
/// ⚠ 7회 이후 · **3점 차 이내** · 벤치에 더 나은 타자가 있을 때만.
///
/// 🔴 **세 값을 따로 재서 정했다** (`probe-pinchhit.cjs` · 300경기):
///
/// ```
///   GAP 6.0 · PROB 0.35 · 2점차   팀당 경기당 0.20   서로 다른 대타 3명
///   GAP 3.0 · PROB 0.35 · 2점차                0.28                4명
///   GAP 1.0 · PROB 0.35 · 2점차                0.39                8명
///   GAP 1.0 · PROB 0.6  · 2점차                0.67                8명
///   GAP 1.0 · PROB 0.9  · 2점차                1.05                8명
///   GAP 1.0 · PROB 0.6  · 3점차                0.85                8명   ← 채택
/// ```
///
/// ⚠ **처음 값(GAP 6.0)이 벤치를 죽였다** — 8명 중 3명만 한 번이라도
///   나왔다. 벤치는 정의상 라인업보다 약해서 그만한 차가 잘 안 난다.
/// ⚠ PROB 0.9 는 안 쓴다 — 아래 clamp 천장에 닿아 **`tacticalIQ` 가
///   위로는 아무것도 안 하게** 된다(죽은 갈래).
/// ⚠ 실제 KBO 는 팀당 경기당 1~2회다. 0.85 는 그 아래끝이고, 벤치를
///   넷만 두는 지금 구조에선 이 이상 올리면 매 경기 다 소진한다.
pub const PINCH_HIT_MIN_INNING: u8 = 7;
/// 벤치 타자가 이만큼 나아야 바꾼다 — **컨택+파워 합으로는 이 값의 2배**다
pub const PINCH_HIT_OVR_GAP: f64 = 1.0;
/// 조건을 다 채웠을 때의 교체 확률 — `tacticalIQ` 로 흔들린다
pub const PINCH_HIT_PROB: f64 = 0.6;

/// 대주자 — 늦은 접전에 느린 주자를 바꾼다.
///
/// ⚠ **대타와 같은 벤치를 쓴다.** 넷을 둘이 나눠 쓴다 — 그래서 대타가
///   `used + 1 < bench.len()` 로 **한 자리를 남긴다.** 안 남기면 8회에
///   쓸 사람이 없다.
/// ⚠ 대타보다 **한 회 늦다** — 주자를 바꾸면 그 사람이 수비까지 들어간다.
///
/// 🔴 **가설 둘을 세웠고 실측이 하나만 맞혔다** (`probe-pinchhit.cjs`):
///
/// ```
///   기준(GAP 8 · PROB 0.5 · 자리 안 남김)   팀당 경기당 0.10 / 0.16 / 0.08
///   ① 대타가 한 자리 남긴다                            0.10 / 0.19 / 0.12
///   ② SPEED_GAP 8 → 4                                  0.14 / 0.22
///   ②' SPEED_GAP 0 (문턱 없음)                         0.23 / 0.25
///   채택: GAP 4 · PROB 0.6 · 자리 남김        0.16 / 0.25 / 0.19
/// ```
///
/// ⚠ **문턱을 0으로 내려도 0.25 를 못 넘는다** — 막고 있는 건 문턱이
///   아니라 **조건이 겹칠 확률**이다(8회 이후 × 2점차 × 1·2루 주자 ×
///   벤치 잔량). 문턱만 만지면 헛수고다.
/// ⚠ PROB 0.8 은 안 쓴다 — 0.8 × 최고 IQ(1.5) = 1.2 라 clamp 0.95 에
///   닿아 **좋은 감독이 위로 죽는다.** 대타에서 겪은 것과 같은 형태다.
/// ⚠ 실제 KBO 는 팀당 경기당 0.3~0.5회다. 벤치를 넷만 두고 그중 대타가
///   먼저 쓰는 지금 구조에선 이 이상은 안 나온다.
pub const PINCH_RUN_MIN_INNING: u8 = 8;
/// 벤치 주자가 이만큼 빨라야 바꾼다(speed 차)
pub const PINCH_RUN_SPEED_GAP: f64 = 4.0;
/// 조건을 다 채웠을 때의 교체 확률 — `tacticalIQ` 로 흔들린다
pub const PINCH_RUN_PROB: f64 = 0.6;

/// 수비 방해 — 포수가 타자 스윙을 방해했다.
///
/// ⚠ 실제 KBO 는 팀당 시즌 1~3건이다. **타석 모수가 크니** 아주 낮다.
/// ⚠ 포수 수비가 나쁠수록 잦다.
pub const INTERFERENCE_PROB: f64 = 0.0004;

/// 주루 방해 — 야수가 주자를 막았다. 한 베이스 준다.
///
/// ⚠ **수비 방해와 다른 사건**이다 — 이건 주자 쪽이고 타석과 무관하다.
/// ⚠ 인플레이 타구가 있어야 성립한다.
pub const OBSTRUCTION_PROB: f64 = 0.0025;

/// 낫아웃 — 삼진인데 포수가 놓쳐 타자가 1루로 뛴다.
///
/// ⚠ **1루가 비었거나 2아웃일 때만** 성립한다(실제 야구 규칙).
/// 🔴 **삼진은 모수가 크다**(타석의 20% 안팎). 확률을 높이면 출루가
///   통째로 부푼다 — 시프트에서 겪은 것과 같은 형태다.
/// ⚠ 실제 KBO 는 팀당 시즌 5~15건이다.
pub const DROPPED_THIRD_PROB: f64 = 0.012;
/// 포수 수비가 좋으면 덜 놓친다 — 폭투·포일과 같은 축이다
pub const DROPPED_THIRD_CATCHER_SPAN: f64 = 0.8;

/// 태그업 — 뜬공 아웃에 **2루 주자가 3루로** 간다.
///
/// ⚠ 희생플라이(3루→홈)는 이미 있다. 없는 게 이 갈래다.
/// ⚠ 주루센스가 좋을수록 잘 판단한다.
/// 🔴 **조건 자체가 드물다** — 뜼공 아웃 + 2아웃 전 + 2루 주자 +
///   3루 빔. 희생플라이가 0.55 로 올라간 것과 같은 이유다
///   (그쪽 주석: "0.10이면 타석의 0.11%로 목표의 6분의 1").
/// ⚠ 3루로 가는 게 홈보다 쉬우니 희생플라이보다 높아야 한다.
pub const TAG_UP_SECOND_PROB: f64 = 0.62;

/// 당겨치기 성향 — **파워로 대신한다.**
///
/// 🔴 타자에게 성향 값이 따로 없다(`BatterStats` 에 `pull`·`spray` 0건).
///   새로 만드는 대신 파워를 쓴다 — 파워 타자가 당겨치는 건 실제
///   야구의 경향이고 그 값은 이미 있다.
/// ⚠ 50이 기준이다. 그 위면 당겨치는 쪽으로 기운다.
pub const PULL_PIVOT: f64 = 50.0;
/// 파워가 피벗에서 벗어난 만큼 방향이 기우는 폭(확률)
pub const PULL_SPAN: f64 = 0.22;

/// 수비 시프트 — 당겨치는 타자에게 수비를 기울인다.
///
/// ⚠ **양방향이다.** 시프트 방향 아웃이 늘고 반대 방향은 준다.
///   한쪽만 걸면 리그 타율이 통째로 움직인다.
/// ⚠ 파워가 이만큼 넘어야 시프트를 건다 — 아무에게나 걸지 않는다.
pub const SHIFT_POWER_MIN: f64 = 62.0;
/// 시프트 방향으로 간 땅볼의 아웃 가산
///
/// 🔴 **모수가 다르다.** 인플레이 아웃이 단타보다 약 2.4배 많아
///   같은 확률을 주면 **안타가 순증한다** — 첫 값(0.10/0.12)에서
///   타율이 .322 → .327 로 올랐다. 안타 쪽을 훨씬 크게 준다.
pub const SHIFT_OUT_BONUS: f64 = 0.24;
/// 반대 방향으로 간 땅볼의 아웃 감산 — 빈 자리로 굴러간다
pub const SHIFT_HOLE_PENALTY: f64 = 0.05;

/// 펜스 직격 — 담장에 **아슬하게** 못 미친 타구.
///
/// 🔴 예전엔 홈런이 못 넘으면 **무조건 2루타**였다. 1m 못 미친 타구와
///   20m 못 미친 타구가 같은 결과였다.
/// ⚠ 담장 대비 비율로 가른다 — 절대 거리로 하면 구장마다 뜻이 달라진다.
pub const FENCE_HIT_RATIO: f64 = 0.94;
/// 펜스를 맞고 튀면 3루타가 되기도 한다 — 좌우 구석일수록
pub const FENCE_TRIPLE_PROB: f64 = 0.22;
/// 이 아래면 평범한 뜬공 아웃이다 — 담장 근처도 못 갔다
pub const DEEP_FLY_RATIO: f64 = 0.82;

/// 🔴 **표의 2·3루타를 홈런으로 올리는 문턱** (2026-09-01 · 사용자 확정).
///
/// 담장 재확인은 양방향인데 **올리는 쪽만 문턱이 없었다.** 내리는 쪽은
/// `FENCE_HIT_RATIO`(0.94) · `DEEP_FLY_RATIO`(0.82)로 3단계인데,
/// 올리는 쪽은 `distance >= fence` 하나였다 — **1cm 넘어도 홈런**이다.
///
/// ## 왜 그게 문제였나 — **순환이다**
///
/// `resolve_hardness` 가 **표의 결과 코드로 강도를 정한다**:
///
/// ```text
///   HomeRun 5.0 · HitTriple 4.2 · HitDouble 3.5 · HitSingle 2.8 · 그 외 2.0
/// ```
///
/// 그래서 표의 2·3루타는 이미 "잘 맞은 타구"가 되고, 그 강도가 만든
/// 비거리가 좌우 담장(98.4m)을 그대로 넘는다:
///
/// ```text
///   파워 50 · 최적각 28도    강도 3 → 84m   강도 4 → 98m   강도 5 → 112m
///   파워 80 · 최적각 28도    강도 3 → 92m   강도 4 → 106m  강도 5 → 120m
/// ```
///
/// **표가 거리를 정하고 그 거리가 다시 결과를 뒤집는다.**
///
/// ## 실측 (1시즌 · 전 리그 · 씨앗 20260802)
///
/// ```text
///   강등 4,631   승격 6,182   순증 +1,551   ← 담장이 홈런을 만들고 있었다
///     HR→2루타 4,102 · HR→3루타 404 · HR→뜬공아웃 179
///     2루타→HR 3,697 · 3루타→HR 2,354 · 그라운드HR 24
///
///   KBL 1군 리그타율 .272 · 출루 .338 은 KBO 와 맞는데 **장타율만 .464**
///   (KBO .390) 였다 — 안타 수가 아니라 **안타 하나의 무게**가 문제였다.
/// ```
///
/// ## 왜 1.02 인가
///
/// 승격 후보가 담장을 **얼마나** 넘겼는지 재서 골랐다:
///
/// ```text
///   1.00~1.02  1,308 (21%)     문턱 1.02 → 순증 +1,551 → +243   ← 거의 상쇄
///   1.02~1.05  1,705 (28%)     문턱 1.05 → 순증 −1,462          ← 과하다
///   1.05~1.10  1,906 (31%)     문턱 1.10 → 순증 −3,368          ← 훨씬 과하다
///   1.10~1.20  1,020 (17%)
///   1.20~1.35    228  (4%)
/// ```
///
/// 1.05 이상이면 **담장이 홈런을 오히려 줄이는** 쪽으로 뒤집힌다.
///
/// ⚠ 강등 문턱(0.94)과 짝이 된다 — **0.94 ~ 1.02 가 "담장 근처"** 다.
///   예전엔 1.00 에서 칼같이 갈려 양쪽이 비대칭이었다.
///
/// ⚠ **KBL 몫은 못 갈랐다.** 위 수치는 전 리그 합계다(고교·대학·독립·
///   2군·해외 포함). KBL 만의 효과는 넣고 재야 안다.
pub const FENCE_PROMOTE_RATIO: f64 = 1.02;

/// 그라운드 홈런 — **담장 안**에 떨어졌는데 주자가 다 돌았다.
///
/// ⚠ 실제 KBO 는 시즌 2~5건이다. 조건이 겹쳐야 난다:
///   깊은 타구(펜스 직격 대역) + 좌우 구석 + 아주 빠른 주자.
pub const INSIDE_PARK_SPEED_MIN: f64 = 78.0;
pub const INSIDE_PARK_PROB: f64 = 0.05;

/// 타구 비거리 — `hardness`(1~5)와 발사각으로 만든다.
///
/// 🔴 예전엔 **거리 개념이 없었다.** 홈런이 확률표에서 바로 나와
///   같은 타구가 잠실이든 사직이든 똑같이 홈런이었다.
///
/// ⚠ **확률표를 갈아엎지 않는다.** 표가 "얼마나 잘 맞았나"를 정하고,
///   물리는 **담장을 넘느냐**만 다시 본다. 표를 버리면 기준선이 무의미해진다.
/// ⚠ 실제 KBO 홈런 비거리는 105~135m 다. hardness 5 + 최적각이 그 위쪽이다.
/// 🔴 **첫 값(62/15.5)은 너무 후했다** — 같은 씨앗에서 OPS .904 → .989.
///   장타가 홈런으로 올라가는 쪽이 내려가는 쪽보다 훨씬 많았다.
pub const FLIGHT_BASE_M: f64 = 56.0;
/// hardness 한 칸당 더해지는 거리
pub const FLIGHT_PER_HARDNESS: f64 = 14.0;
/// 최적 발사각(도) — 여기서 제일 멀리 간다
pub const FLIGHT_BEST_ANGLE: f64 = 28.0;
/// 최적각에서 벗어난 1도당 잃는 거리(m)
pub const FLIGHT_ANGLE_PENALTY: f64 = 0.75;
/// 타자 파워가 피벗에서 벗어난 만큼 더해지는 거리
pub const FLIGHT_POWER_SPAN: f64 = 14.0;
pub const FLIGHT_POWER_PIVOT: f64 = 50.0;

/// 폭투·포일 — **포수를 지나친 공.** 주자가 있을 때만 의미가 있다.
///
/// 🔴 **책임이 갈린다**(실제 야구 규칙):
///   폭투(WP)  공이 너무 벗어나 포수가 잡을 수 없었다 → 투수 기록
///   포일(PB)  잡을 수 있는 공을 놓쳤다               → 포수 기록
///
/// ⚠ 존 밖 거리로 가른다. 존은 ±1 이고 이 값보다 멀면 폭투다.
///
/// 🔴 **1.55 → 1.40** (2026-09-01 · 사용자 확정). 폭투가 KBL 팀당 18 로
/// 목표(30~50)의 절반이었다. 모수를 재니 손잡이가 둘 다 열려 있었다:
///
/// ```
///   전체 투구            1,471,609
///   주자 있고 안 휘두름    403,722   27.4%
///   존밖 1.55 이상         21,291    5.3%   ← 여기를 넓힌다
///   폭투                    2,211   10.4%
///   포일                      927    0.2%
/// ```
///
/// ⚠ **"문턱을 내리면 포일이 그만큼 준다"는 틀렸다.** 포일 후보가
/// 폭투 후보보다 **18배 크다**(382,431 vs 21,291) — 폭투 후보를 두 배로
/// 늘려도 포일 후보는 5.6% 만 준다.
///
/// 🔴 **이 값은 아주 민감하다.** 처음에 1.40 으로 내렸다가 되돌렸다:
///
/// ```
///   1.55   후보율  5.3%   폭투/팀  18
///   1.40   후보율 21.7%   폭투/팀 **143**   ← 목표(30~50)의 **3배**
/// ```
///
/// **0.15 를 내렸는데 후보가 4배**가 됐다. 착지점 분포가 존 경계 근처에
/// 몰려 있어서 조금만 움직여도 크게 바뀐다 — **한 번에 크게 돌리지 마라.**
pub const WILD_PITCH_DISTANCE: f64 = 1.52;
/// 그만큼 벗어났을 때 포수가 못 막을 확률 — 포수 수비로 줄어든다
///
/// 🔴 **0.16 → 0.26** (2026-09-01 · 사용자 확정).
///
/// ⚠ **이 값이 그대로 쓰이지 않는다.** `block` 배수가 곱해지는데 리그 포수
/// 중앙이 74 라 **0.568** 이다 — 실측 전환율이 10.4% 였던 이유다.
/// 상수만 보고 "0.16이면 충분하다"고 읽으면 안 된다.
///
/// ⚠ 검사가 `< 0.30` 을 요구한다. 그 위로 올리려면 **검사부터** 고쳐야
/// 하고, 그건 "폭투가 너무 잦다"는 판단을 다시 하는 것이다.
pub const WILD_PITCH_BASE_PROB: f64 = 0.26;
/// 존 근처인데 포수가 놓칠 확률 — **포일**이다. 훨씬 드물다
pub const PASSED_BALL_BASE_PROB: f64 = 0.004;
/// 포수 수비가 피벗에서 벗어난 만큼 곱해지는 폭 (둘 다에 걸린다)
pub const CATCHER_BLOCK_SPAN: f64 = 0.9;
/// 포수 수비 기준값
pub const CATCHER_BLOCK_PIVOT: f64 = 50.0;

/// 보크 — **주자가 있을 때만.** 투구 전 사건이라 타석은 그대로다.
///
/// ⚠ 제구(`control`)가 나쁠수록 자주 낸다. 실제 KBO 는 팀당 시즌 3~8개라
///   **아주 드물게** 둔다.
///
/// 🔴 **셋을 같이 절반으로** (2026-09-02). 0.0012 / 0.0018 / 0.006 에서
///   KBL 1군 팀당 **10.9**(126경기 · 씨앗 3 · BALANCE_BASELINE §6)였고
///   144경기로 늘리자 12.4 근처다 — 목표(3~8)의 두 배다. 판정은 주자가
///   있을 때 투구마다 한 번이고 확률이 상수에 선형이라, 셋을 같은 비율로
///   줄이면 **모양(제구 축·상한 비율)은 그대로**고 총량만 반으로 간다.
///   기대값 ≈ 6/팀. 실측은 `measure:batting` 씨앗 3 으로 다시 잰다.
pub const BALK_BASE_PROB: f64 = 0.0006;
/// 제구가 50에서 아래로 벗어난 만큼 더해지는 폭
pub const BALK_CONTROL_SPAN: f64 = 0.0009;
/// 상한
pub const BALK_MAX_PROB: f64 = 0.003;

/// 견제사 — 1루에만 주자가 있을 때.
///
/// 🔴 `hold_runners` 가 **도루 성공률만 낮추고 있었다** — 주자를
///   잡는 사건이 없어서 견제 좋은 투수가 묶기만 하고 못 잡았다.
/// ⚠ 실제 KBO 견제사는 팀당 시즌 20~30개다 — **드문 사건으로 둔다.**
/// 히트앱런 — **1루 주자 · 2루 빉 · 2아웃 전 · 스트라이크 2개 전**.
///
/// 🔴 **도루와 별도 갈래다.** 기존 도루 판정에 섮으면 시도율이
///   통째로 늘어난다 — 기준선 중앙주자 3.2~5.6% · 상위주자 18.3~18.8%.
/// ⚠ 실제 KBO 히트앱런은 경기당 0.5회꿀이다 — 드문 작전으로 둔다.
pub const HIT_AND_RUN_PROB: f64 = 0.012;
/// 헛치면 주자가 잡힐 확률 — 포수가 바로 던진다
pub const HIT_AND_RUN_CAUGHT_PROB: f64 = 0.55;

pub const PICKOFF_BASE_PROB: f64 = 0.004;
/// 견제력이 피벗이에서 벗어난 만큼 더해지는 폭
pub const PICKOFF_HOLD_SPAN: f64 = 0.006;
/// 주루센스가 높으면 덜 걸린다 — 도루와 **반대 축**이다
pub const PICKOFF_INSTINCT_SPAN: f64 = 0.004;
/// 상한
pub const PICKOFF_MAX_PROB: f64 = 0.02;

pub fn steal_hold_factor(hold_runners: f64) -> f64 {
    clamp01(1.0 - (hold_runners - 50.0) * STEAL_HOLD_SCALE, STEAL_HOLD_MIN, STEAL_HOLD_MAX)
}

/// 1루 주자의 (시도 확률, 성공 확률)
pub fn steal_second_probs(speed: f64, instinct: f64, hold_factor: f64, manager_boost: f64,
                          catcher_arm: f64) -> (f64, f64) {
    let attempt = clamp01(
        (speed - STEAL_2B_SPEED_PIVOT) * STEAL_2B_ATTEMPT_SCALE * (instinct / STEAL_INSTINCT_PIVOT) * hold_factor
            + manager_boost, 0.0, STEAL_2B_ATTEMPT_MAX);
    let success = clamp01(
        STEAL_2B_SUCCESS_BASE + (speed - STEAL_2B_SUCCESS_PIVOT) * STEAL_2B_SUCCESS_SCALE
            - steal_catcher_penalty(catcher_arm),
        STEAL_2B_SUCCESS_MIN, STEAL_2B_SUCCESS_MAX);
    (attempt, success)
}

/// 2루 주자의 (시도 확률, 성공 확률). `STEAL_3B_SPEED_GATE` 미만은 시도하지 않는다
pub fn steal_third_probs(speed: f64, instinct: f64, hold_factor: f64, manager_boost: f64,
                         catcher_arm: f64) -> (f64, f64) {
    if speed <= STEAL_3B_SPEED_GATE { return (0.0, 0.0); }
    let attempt = clamp01(
        (speed - STEAL_3B_SPEED_PIVOT) * STEAL_3B_ATTEMPT_SCALE * (instinct / STEAL_INSTINCT_PIVOT) * hold_factor
            + manager_boost, 0.0, STEAL_3B_ATTEMPT_MAX);
    let success = clamp01(
        STEAL_3B_SUCCESS_BASE + (speed - STEAL_3B_SUCCESS_PIVOT) * STEAL_3B_SUCCESS_SCALE
            - steal_catcher_penalty(catcher_arm),
        STEAL_3B_SUCCESS_MIN, STEAL_3B_SUCCESS_MAX);
    (attempt, success)
}

// Phase A: 착탄 분산
pub const DISPERSION_BASE: f64           = 0.15;
pub const DISPERSION_CONTROL_SCALE: f64  = 0.003;
pub const DISPERSION_STAMINA_SCALE: f64  = 0.002;
pub const DISPERSION_MENTAL_SCALE: f64   = 0.001;
pub const SHADOW_ZONE_HALF: f64          = 0.20;
/// 투구 품질의 **무작위 폭** (±값). 실측 2026-08-11: 16이면 능력치를 덮는다.
///
/// OVR 55→80(전 스탯 +25)이 pitch_q에 주는 기여는 약 **+6.8**인데
/// 잡음 폭이 16이라 2배 이상이다. 그래서 격리에서 OVR별 ERA 곡선이
/// 평평했다(5.73 · 5.74 · 5.69 · 5.36 · 5.93 · 7.63).
///
/// 리그()는 같은 구간이 4.23 → 3.32로 단조다. **전환하면 리그
/// 전체에서 능력치와 성적이 끊어진다** — 드래프트·수상·순위가 무의미해진다.
///
/// ⚠ 계측용으로  환경변수가 덮는다.
pub const PITCH_QUALITY_NOISE: f64 = 16.0;

pub fn pitch_quality_noise() -> f64 {
    match std::env::var("PB_PITCH_NOISE") {
        Ok(v) => v.parse::<f64>().unwrap_or(PITCH_QUALITY_NOISE),
        Err(_) => PITCH_QUALITY_NOISE,
    }
}

/// 능력치 계수 배수 — 1.0이 예전 값이다. 잡음을 줄인 만큼 키워 균형을 맞춘다.
/// ⚠ 계측용으로  환경변수가 덮는다.
pub const PITCH_SKILL_SCALE: f64 = 1.0;

pub fn pitch_skill_scale() -> f64 {
    match std::env::var("PB_SKILL_SCALE") {
        Ok(v) => v.parse::<f64>().unwrap_or(PITCH_SKILL_SCALE),
        Err(_) => PITCH_SKILL_SCALE,
    }
}

/// 로케이션 품질을 **의도 기준**으로 볼 것인가 (1) / 착탄 기준 (0).
///
/// 예전 식은 착탄점의 중심거리만 봤다: location_q = -4 + dist x 5.
/// 그런데 pick_target은 대부분 존 안을 겨냥한다(중립 +-0.8, 볼3 +-0.5).
/// 그래서:
///   제구 좋음 -> 목표에 정확히 꽂힌다 -> dist 작다 -> **품질 낮다**
///   제구 나쁨 -> 흩어진다 -> 일부가 가장자리로 -> dist 크다 -> **품질 높다**
///
/// 흩어짐이 우연히 품질을 올려줘서, 제구가 좋을수록 손해 보는 구조였다.
/// 실측(2026-08-11): OVR 55 -> 80에서 ERA가 오히려 나빠지고, 능력치 배수를
/// 8배로 밀어도 방향이 안 바뀌었다.
///
/// 새 식은 **겨냥한 곳의 난이도 + 얼마나 정확히 꽂혔는가**로 본다.
/// 계측용 환경변수 PB_LOC_INTENT.
pub const LOCATION_INTENT_MODE: f64 = 0.0;

pub fn location_intent_mode() -> f64 {
    match std::env::var("PB_LOC_INTENT") {
        Ok(v) => v.parse::<f64>().unwrap_or(LOCATION_INTENT_MODE),
        Err(_) => LOCATION_INTENT_MODE,
    }
}

/// 목표에서 벗어난 거리 1당 품질 하락 (의도 기준일 때만)
pub const LOCATION_MISS_PENALTY: f64 = 6.0;

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
/// 주인공 엔진의 contact_q 오프셋 — **두 엔진의 저울을 맞추는 손잡이다.**
///
/// `resolve_contact`의 밴드 표는 "동급 대결 = contact_q 56"을 전제로 짜였는데
/// 실측 평균이 **48**이라 하위 밴드(안타 33~40%)에서 돈다. 그 결과:
///
///   주인공 K/9 9.04 · BB/9 2.90 · H/9 **14.52** · BABIP 44.7%
///   리그   K/9 8.11 · BB/9 3.90 · H/9  **7.34** · BABIP 28.0%
///
/// 삼진·볼넷은 오히려 주인공이 낫고 **피안타만 2배**다.
/// 커리어 57시즌 실측 ERA 중앙 6.59 대 리그 3.2~4.0.
///
/// **밴드 경계를 옮기는 대신 입력을 옮긴다** — 밴드 간 상대관계가 유지되고
/// 되돌리기도 쉽다. 0이면 예전과 완전히 같다.
///
/// ⚠ 계측용으로 환경변수 `PB_CONTACT_Q_OFFSET`이 이 값을 덮는다.
/// 한 번 빌드로 여러 값을 재려는 것이고, 안 주면 아래 상수를 쓴다.
/// **0.0으로 되돌렸다** (2026-08-11 재교정). 7.0은 **잘못된 기준**에 맞춘
/// 값이었다 — 격리 측정이 을 썼는데 실제 고교 라인업 컨택은
/// 평균 **56**이다(포지션을 채우느라 45~54가 섞인다). 10점 강한 타선에
/// 맞추다 보니 과보정이 됐고, 리그 전체에 적용하니 ERA가 0.4~2.6까지 떨어졌다.
///
/// 실제 타자 수준(56)에서 재니 **오프셋 0이 이미 리그 기준**이다:
///   오프셋 0 → ERA 3.73 (리그 npc_sim 3.2~4.2)
///   오프셋 2 → 4.07 · 오프셋 4 → 3.25
///
/// 옛 근거는 아래에 남긴다.
/// **7.0으로 정했었다** (실측 2026-08-11, 격리 120경기 · 투수68·타자66·수비66):
///
///   오프셋  0 → ERA 7.15 · H/9 12.93 · 평균cq 49.33
///          4 → ERA 4.95 · H/9 10.18 · 평균cq 53.20
///          6 → ERA 4.09 · H/9  8.75 · 평균cq 55.51
///          **7 → ERA 2.93 · H/9  7.73 · 평균cq 56.44**
///          8 → ERA 3.16 · H/9  8.31 · 평균cq 57.36
///
/// ERA 숫자에 끼워 맞춘 게 아니라 **밴드 표가 전제한 56으로 입력을 되돌린**
/// 값이다. H/9 7.73도 리그 7.34에 가장 가깝다.
pub const CONTACT_Q_OFFSET: f64 = 0.0;

/// 환경변수가 있으면 그걸, 없으면 상수를 쓴다 (계측 전용 경로)
pub fn contact_q_offset() -> f64 {
    match std::env::var("PB_CONTACT_Q_OFFSET") {
        Ok(v) => v.parse::<f64>().unwrap_or(CONTACT_Q_OFFSET),
        Err(_) => CONTACT_Q_OFFSET,
    }
}

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
/// ⚠ 이 둘은 **폴백일 뿐이다.** 정본은 `generation_rules.json`에서 파생해
/// `PromotionRules.farm_min_*`로 들어온다 — `rosterMin × 보직비율 − 여유2`.
/// 예전엔 여기 값만 있었고 회귀 테스트는 규칙 파일에서 9/12를 파생했다.
/// **정본이 둘이라** 2군 투수 미달 3팀이 계속 잡혔다.
pub const FARM_MIN_PITCHERS: usize = 8;
pub const FARM_MIN_BATTERS:  usize = 9;

/// 대체가 안 되는 자리. 이 자리는 **2군에서도 마지막 한 명을 안 뺀다** —
/// 콜업이 2군의 마지막 포수를 올려버려 2군이 포수 0명으로 한 해를 났다.
/// 1루수·좌익수는 다른 야수가 대신 설 수 있지만 포수는 그렇지 않다.
pub fn is_specialist_position(pos: &str) -> bool { pos == "C" }

// ── 재능 분포 ─────────────────────────────────────────────────────────
//
// ⚠ **파이프라인 전체에 재능 편차가 없었다.** `generate_freshmen`이
// `potential_hidden`을 `ovr_max * 1.15` **고정값**으로 줬다 — 난수가 없어
// 고교 신입생 1,020명이 매년 전원 80.5로 같은 천장을 가졌다.
//
// 그 결과가 "리그가 해마다 얇아진다"였다(실측 6시즌):
//   OVR 상위25%  89.3 → 82.1   ·   분산 22.0 → 10.7   ·   리그 ERA 4.0 → 5.6
// 창단 KBL 세대만 88 × 1.05~1.25 = 92~99를 갖고, 그들이 은퇴하면 그 자리를
// **아무도 못 채운다.** 실측 천장 82가 고정값 80.5와 거의 같다.
//
// 고치는 방향은 "재능 상위 꼬리"다(사용자 확정) — 대부분의 성장 속도는
// 그대로 두고 **소수만 에이스로 자란다.** 실제 야구와 OOTP/FM의 잠재력
// 개념과 같고, 성장 곡선 전체를 올리는 것과 달리 주인공 체감을 안 건드린다.
//
// **정본은 `generation_rules.json`의 `talentRules`다.** 아래는 폴백이다.
pub const TALENT_POT_MULT_MIN: f64 = 1.05;
pub const TALENT_POT_MULT_MAX: f64 = 1.25;
/// 꼬리에 드는 비율. 고교 신입생 1,020명이면 한 해 약 30명이고,
/// 그중 프로까지 가는 건 진로 탈락을 거쳐 훨씬 적다.
pub const TALENT_TAIL_RATE: f64 = 0.03;
pub const TALENT_TAIL_POT_MULT_MIN: f64 = 1.28;
pub const TALENT_TAIL_POT_MULT_MAX: f64 = 1.42;
/// 꼬리는 **천장과 속도를 같이** 받아야 한다. 천장만 높고 속도가 평범하면
/// 전성기가 끝날 때까지 못 닿는다(실측 25~27세 +1.45/시즌, 28~30세 +0.36).
pub const TALENT_TAIL_DEV_MIN: f64 = 82.0;
pub const TALENT_TAIL_DEV_MAX: f64 = 95.0;

/// 재능 분포 파라미터. 없으면 위 폴백을 쓴다.
#[derive(Clone, Copy, Debug)]
pub struct TalentRules {
    pub pot_mult_min: f64,
    pub pot_mult_max: f64,
    pub tail_rate: f64,
    pub tail_pot_mult_min: f64,
    pub tail_pot_mult_max: f64,
    pub tail_dev_min: f64,
    pub tail_dev_max: f64,
}

impl Default for TalentRules {
    fn default() -> Self {
        Self {
            pot_mult_min: TALENT_POT_MULT_MIN,
            pot_mult_max: TALENT_POT_MULT_MAX,
            tail_rate: TALENT_TAIL_RATE,
            tail_pot_mult_min: TALENT_TAIL_POT_MULT_MIN,
            tail_pot_mult_max: TALENT_TAIL_POT_MULT_MAX,
            tail_dev_min: TALENT_TAIL_DEV_MIN,
            tail_dev_max: TALENT_TAIL_DEV_MAX,
        }
    }
}

/// 천장 배수와 성장 속도를 함께 뽑는다.
///
/// 난수는 호출측이 넘긴다 — 이 프로젝트엔 `LcgRand`(결정적 생성)와
/// `thread_rng`(주간 진행) 두 종류가 있어 여기서 잡으면 한쪽이 못 쓴다.
/// `r_tail`은 꼬리 판정, `r_pot`/`r_dev`는 대역 안의 위치다.
pub fn sample_talent(
    t: &TalentRules,
    dev_min: f64, dev_max: f64,
    r_tail: f64, r_pot: f64, r_dev: f64,
) -> (f64, f64) {
    if t.tail_rate > 0.0 && r_tail < t.tail_rate {
        (t.tail_pot_mult_min + r_pot * (t.tail_pot_mult_max - t.tail_pot_mult_min),
         t.tail_dev_min      + r_dev * (t.tail_dev_max      - t.tail_dev_min))
    } else {
        (t.pot_mult_min + r_pot * (t.pot_mult_max - t.pot_mult_min),
         dev_min        + r_dev * (dev_max        - dev_min))
    }
}

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

#[cfg(test)]
mod talent_tests {
    use super::*;

    /// ⚠ **규칙 파일 키가 어긋나면 조용히 폴백으로 돈다.** `#[serde(default)]`라
    /// 파싱은 성공하고 값만 안 들어온다 — 이 프로젝트에서 "정본이 둘"이 계속
    /// 문제였던 것과 같은 층이다. 실제 파일로 값이 들어오는지 확인한다.
    #[test]
    fn 규칙파일의_재능_분포가_실제로_들어온다() {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        let p: crate::sim_types::TalentRulesPayload =
            serde_json::from_value(v["talentRules"].clone()).expect("talentRules 파싱 실패");
        let t = crate::sim_types::TalentRulesPayload::resolve(Some(&p));

        assert!(p.tail_rate.is_some(), "tailRate가 안 들어왔다 — 키 이름을 확인하라");
        assert!(p.potential_mult_max.is_some(), "potentialMultMax가 안 들어왔다");
        assert!(p.tail_dev_rate_max.is_some(), "tailDevRateMax가 안 들어왔다");
        assert!(t.tail_rate > 0.0 && t.tail_rate < 0.5, "꼬리 비율이 이상하다: {}", t.tail_rate);
        assert!(t.tail_pot_mult_min > t.pot_mult_max,
            "꼬리가 일반 대역과 겹친다 — 꼬리 {} vs 일반 상한 {}",
            t.tail_pot_mult_min, t.pot_mult_max);
    }

    /// 꼬리는 **천장과 속도를 같이** 받아야 한다
    #[test]
    fn 꼬리는_천장과_속도를_같이_받는다() {
        let t = TalentRules::default();
        // r_tail 0.0 → 반드시 꼬리
        let (pot, dev) = sample_talent(&t, 45.0, 75.0, 0.0, 0.5, 0.5);
        assert!(pot >= t.tail_pot_mult_min, "꼬리인데 천장이 일반값이다: {pot}");
        assert!(dev >= t.tail_dev_min, "꼬리인데 성장 속도가 일반값이다: {dev}");
        // r_tail 0.99 → 반드시 일반
        let (pot2, dev2) = sample_talent(&t, 45.0, 75.0, 0.99, 0.5, 0.5);
        assert!(pot2 <= t.pot_mult_max, "일반인데 천장이 꼬리값이다: {pot2}");
        assert!(dev2 <= 75.0, "일반인데 성장 속도가 대역을 넘었다: {dev2}");
    }

    /// 고교 신입생 천장이 **한 값에 몰리지 않는다** — 이게 원래 결함이었다
    #[test]
    fn 신입생_천장이_한_값에_몰리지_않는다() {
        let t = TalentRules::default();
        let hs_cap = 70.0;   // LEAGUE_HIGHSCHOOL의 ovrMax
        let mut vals = vec![];
        for i in 0..1000 {
            // ⚠ `wrapping_mul`이다. `*`로 두면 debug 빌드에서 i=2부터
            // 곱셈 오버플로로 패닉한다 — **테스트 자신의 난수식 버그**라
            // 판정이 멀쩡한데도 계속 빨간불이었다
            let r = |k: u32| ((i as u32).wrapping_mul(2654435761u32)
                              .wrapping_add(k.wrapping_mul(40503))
                              % 10007) as f64 / 10007.0;
            let (pot, _) = sample_talent(&t, 45.0, 75.0, r(1), r(2), r(3));
            vals.push((hs_cap * pot).round());
        }
        let top = vals.iter().cloned().fold(f64::MIN, f64::max);
        let same = vals.iter().filter(|v| (**v - 80.0).abs() < 1.0).count();
        assert!(top >= 90.0, "고교 출신 최고 천장이 {top} — 에이스가 나올 수 없다");
        assert!(same < 300, "천장이 한 값(80 근처)에 {same}/1000명 몰렸다");
    }
}

#[cfg(test)]
mod steal_catcher_tests {
    use super::*;

    /// 포수 송구가 도루 성공률을 실제로 가르는가.
    ///
    /// 🔴 예전엔 포수가 도루에 **아무 영향이 없었다** — 투수 견제만 걸렸다.
    ///    어깨 좋은 포수를 두는 뜻이 없었다.
    #[test]
    fn 포수_어깨가_도루_성공을_가른다() {
        let (_, weak) = steal_second_probs(70.0, 60.0, 1.0, 0.0, 20.0);
        let (_, mid)  = steal_second_probs(70.0, 60.0, 1.0, 0.0, 50.0);
        let (_, good) = steal_second_probs(70.0, 60.0, 1.0, 0.0, 90.0);
        assert!(weak > mid, "어깨 약한 포수인데 성공률이 안 오른다: {weak} vs {mid}");
        assert!(mid > good, "어깨 좋은 포수인데 성공률이 안 내린다: {mid} vs {good}");
    }

    /// 3루 도루도 같은 규칙을 쓴다 — **두 벌로 두면 척도가 갈린다.**
    ///
    /// ⚠ **속도가 게이트를 넘어야 한다.** `STEAL_3B_SPEED_GATE`(88) 이하면
    ///   `(0.0, 0.0)`이 와서 둘이 같아진다 — 처음에 80을 써서 검사가 헛돌았다.
    ///   *재는 자리가 고친 자리와 다를 수 있다*의 또 다른 얼굴이다.
    #[test]
    fn 삼루_도루도_같은_규칙이다() {
        let fast = STEAL_3B_SPEED_GATE + 5.0;
        let (_, mid)  = steal_third_probs(fast, 60.0, 1.0, 0.0, 50.0);
        let (_, good) = steal_third_probs(fast, 60.0, 1.0, 0.0, 90.0);
        assert!(mid > good, "3루 도루에 포수가 안 걸린다: {mid} vs {good}");
    }

    /// 게이트 아래는 시도 자체를 안 한다 — 포수와 무관하다
    #[test]
    fn 느린_주자는_삼루를_안_노린다() {
        let slow = STEAL_3B_SPEED_GATE - 1.0;
        let (a, s) = steal_third_probs(slow, 60.0, 1.0, 0.0, 50.0);
        assert_eq!((a, s), (0.0, 0.0));
    }

    /// 포수를 모르면 중립이다 — 옛 페이로드는 `position`이 비어 있다.
    #[test]
    fn 중립이면_예전과_같다() {
        assert!((steal_catcher_penalty(STEAL_CATCHER_ARM_PIVOT)).abs() < 1e-9);
    }

    /// 🔴 **기준점은 리그 실측 중앙이어야 한다** (2026-09-01).
    ///
    /// 예전엔 50 이었는데 **KBL 1군 포수의 실제 어깨 중앙이 74** 였다.
    /// 그래서 평균적인 포수가 이미 9.6%p 를 깎았고, 산식이 의도한 69.5%
    /// 자리에서 실측 56% 가 나왔다.
    ///
    /// ```text
    ///   전(기준점 50)   57.3% · 55.4% · 56.2%      평균 56.3%
    ///   후(기준점 74)   67.6% · 64.8% · 65.8%      평균 66.1%   ← KBO 65~70%
    /// ```
    ///
    /// ⚠ 바로 옆 `STEAL_2B_SUCCESS_PIVOT` 주석이 "실측 중앙에 맞춘다"고
    ///   적어 뒀는데 **포수 쪽만 50 으로 남아 있었다** — 같은 규칙을 한쪽에만
    ///   적용한 형태다. 이 검사가 그걸 못박는다.
    #[test]
    fn 포수_기준점이_리그_실측_중앙이다() {
        // 실측 중앙 71~76(씨앗 3개). 50 이면 평균 포수가 감점을 받는다
        assert!(STEAL_CATCHER_ARM_PIVOT >= 65.0,
            "기준점 {} 이 리그 중앙(71~76)보다 한참 낮다 — 평균 포수가 감점을 받는다",
            STEAL_CATCHER_ARM_PIVOT);
        assert!(STEAL_CATCHER_ARM_PIVOT <= 85.0,
            "기준점이 너무 높으면 평균 포수가 오히려 가산을 받는다");
    }

    /// ⚠ **어깨가 기준점보다 낮으면 도루가 더 쉬워야 한다**(음수 감점).
    ///   약한 어깨는 뛰기 좋아야 한다 — 한쪽 방향만 있으면 축이 반쪽이다.
    #[test]
    fn 약한_어깨는_도루를_돕는다() {
        let weak = steal_catcher_penalty(STEAL_CATCHER_ARM_PIVOT - 20.0);
        let strong = steal_catcher_penalty(STEAL_CATCHER_ARM_PIVOT + 20.0);
        assert!(weak < 0.0, "약한 어깨가 감점을 준다: {weak}");
        assert!(strong > 0.0, "강한 어깨가 가점을 준다: {strong}");
    }

    /// 시도 확률은 안 건드린다 — 포수는 **잡는 쪽**이지 뛸지 말지를 정하지 않는다.
    #[test]
    fn 시도_확률은_안_바뀐다() {
        let (a1, _) = steal_second_probs(70.0, 60.0, 1.0, 0.0, 20.0);
        let (a2, _) = steal_second_probs(70.0, 60.0, 1.0, 0.0, 90.0);
        assert!((a1 - a2).abs() < 1e-9, "포수가 시도 확률까지 바꾼다");
    }
}

// ── 사구 · 희생타 (2026-08-28) ───────────────────────────────────────────────
//
// 🔴 **KBO 기록표의 세 칸이 여태 없었다** — HBP · SAC · SF.
//   기록을 안 세는 게 아니라 **사건 자체가 엔진에 없었다.** 그래서
//   타석(PA)·출루율(OBP) 식도 "희생타·사구를 안 세는 모델"을 전제로
//   `PA = AB + BB`로 적혀 있었다.
//
// ⚠ **여기 값은 실제 야구 비율에서 잡았다. 사용자 확정이 필요하다.**
//   KBO 한 시즌 대략: 타석의 사구 1.1% · 희생번트 1.3% · 희생플라이 0.7%.
//   이 게임의 타격이 실제보다 강하므로(평균 OPS 1.0) 그대로 맞지 않을 수 있다.

/// 사구 — **볼 판정 하나에 얹는다.** 타석당이 아니라 투구당이라 값이 작다.
/// ⚠ **실측으로 두 배 올렸다** (2026-08-28). 0.0045로는 타석의 **0.56%**였다 —
///   볼이 타석당 2.4개라는 어림이 틀렸다(삼진·초구 타격이 많아 더 적다).
pub const HIT_BY_PITCH_PER_BALL: f64 = 0.009;

/// 제구가 나쁘면 더 맞힌다. `command` 50이 1.0배이고 **1점당 이만큼** 움직인다.
/// 0.02면 제구 20이 1.6배, 80이 0.4배다 — 폭을 좁게 잡았다(사구는 드문
/// 사건이라 배수가 크면 특정 투수만 사구 기계가 된다).
pub const HIT_BY_PITCH_COMMAND_SPAN: f64 = 0.02;

/// 희생번트를 **시도하는 상황**: 무사/1사 + 주자 있음 + 접전.
/// 그 상황에서 이 확률로 시도한다. `bunting` 능력치가 성공률을 가른다.
///
/// 🔴 `bunting`은 성장 엔진에 **있는데 경기에서 안 쓰이고 있었다** —
///   올려도 아무 일이 안 일어나는 죽은 능력치였다.
/// ⚠ **실측으로 절반 이하로 낮췄다** (2026-08-28). 0.16이면 타석의 **2.83%**로
///   희생플라이의 27배가 나왔다 — 실제 야구는 둘이 비슷하다.
pub const SAC_BUNT_ATTEMPT_PROB: f64 = 0.074;

/// 고의사구 — **1루가 비고 득점권 주자가 있고 1아웃 이상 · 3점 차 이내**일 때만.
///
/// 🔴 예전엔 **어떤 상황에서도 승부만 했다** — 감독이 피할 방법이 없었다.
/// ⚠ 기준 타자(50)에게는 거의 안 건다 — **셀 타자만** 걸려야
///   볼넷이 부풀지 않는다. 기준선 9이닝당 BB 3.6(KBL 실측).
/// ⚠ **첫 값(0.05/0.55/0.35)은 3배 많았다** — BB 3.6 → 4.2(+0.6).
///   실제 KBO 고의사구는 9이닝당 0.15~0.2다. 1/3로 낮췄다.
pub const IBB_BATTER_PIVOT: f64 = 70.0;
/// 조건을 다 채운 타석에서의 밑값
pub const IBB_BASE_PROB: f64 = 0.017;
/// 타자가 피벗이에서 50 위일 때 더해지는 폭
pub const IBB_POWER_SPAN: f64 = 0.18;
/// 상한 — 어떤 조합에서도 이것보다 자주 안 건다
pub const IBB_MAX_PROB: f64 = 0.12;

/// 스퀸즈 — **3루 주자 · 2아웃 전 · 1점 승부 · 7회 이후**에만.
///
/// ⚠ 희생번트와 **다른 상황**이다 — 저쪽은 다음을 노리고 이쪽은
///   지금 1점을 가져온다. 실패하면 **3루 주자가 죽는다.**
pub const SQUEEZE_MIN_INNING: u8 = 7;
/// 조건을 다 채운 투구에서의 시도 확률
pub const SQUEEZE_ATTEMPT_PROB: f64 = 0.10;
/// 성공률 — 번트(0.72)보다 낮다. 주자가 미리 뛰어 수비가 준비한다
pub const SQUEEZE_SUCCESS_BASE: f64 = 0.62;

/// 번트 성공률 — `bunting` 50 기준. 능력치로 ±0.25 흔든다.
pub const SAC_BUNT_SUCCESS_BASE: f64 = 0.72;

/// 희생플라이 — 3루 주자가 있는 뜬공 아웃에서 홈으로 들어올 확률.
/// ⚠ `npc_sim`엔 이미 이 갈래가 **0.10으로 박혀 있었다**(세지는 않았다).
///   두 엔진이 같은 값을 봐야 하므로 여기로 옮겼다.
/// ⚠ **실측으로 크게 올렸다** (2026-08-28). 0.10이면 타석의 **0.11%**로
///   목표(0.7%)의 6분의 1이었다. 조건 자체가 드물어서다 —
///   3루 주자 + 뜬공 아웃 + 2아웃 전. 실제 야구에선 그 상황이면 대개 들어온다.
pub const SAC_FLY_PROB: f64 = 0.55;
