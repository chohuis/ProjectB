use std::collections::HashMap;

use rand::Rng;

use crate::sim::injury;
use crate::sim::manager;

/// 07_매치_엔진.md §5·§6이 요구하는 입력 스탯만 뽑아온 얇은 뷰 — 실제
/// npc.stats JSON 파싱은 repository.rs가 하고 여기는 순수 계산만. `id`·
/// `fatigue`는 급성형 부상 판정(§13, 08_부상_시스템.md §3)이 "누구에게"
/// "얼마나 위험하게" 일어났는지 알아야 해서 I5 5차분 이후 추가됨.
/// `clutch`(클러치)·`composure`(침착함)는 Phase 1에서 추가 — 위기상황
/// (`is_high_leverage_situation`)에서만 판정식에 개입한다(§5 "상황 보정...
/// 클러치"). `defense`(수비)는 Phase 2에서 추가 — 처음엔 타자 개인이
/// 아니라 팀 전체 평균으로만 썼지만(`average_defense`), 대화 2026-07-25
/// 부터는 `resolve_in_play_result`가 타구가 간 포지션의 그 선수 개인
/// 수비 스탯을 직접 찾아 쓴다(`position` 필드 참고) — 팀 평균은 그
/// 포지션 선수를 못 찾을 때만 폴백. `speed`(스피드)는 Phase 3에서
/// 추가 — 마찬가지로 개인이 아니라 `average_speed(lineup)`로 뽑은 "그
/// 팀 지금 타석 라인업의 평균 주력"으로 쓰인다(추가진루·도루 판정,
/// §9 "스피드 vs 경기운영+수비"). `position`(수비 포지션 원문, 예:
/// "유격수")은 대화 2026-07-25에서 추가 — `resolve_in_play_result`가
/// 타구 유형(땅볼/뜬공/직선타)에서 뽑은 포지션에 해당하는 라인업 선수를
/// 찾아 "그 팀 평균"이 아니라 "그 자리 선수 개인" 수비 스탯을 쓰기 위함
/// (§3 "수비 전력 = 수비 스탯 가중합"을 그제서야 문자 그대로 구현).
#[derive(Debug, Clone)]
pub struct BatterStats {
    pub id: String,
    pub contact: f64,
    pub eye: f64,
    pub power: f64,
    pub fatigue: f64,
    pub clutch: f64,
    pub composure: f64,
    pub defense: f64,
    pub speed: f64,
    pub handedness: Handedness,
    pub position: String,
}

/// `velocity`(구속)·`game_management`(경기운영)·`clutch`·`composure`는
/// Phase 1에서 추가 — 구속은 K% 가중치를 구위와 분리해서 반영, 경기운영은
/// 볼넷 억제(§5·§10 "견제도 경기운영에 흡수"), 클러치·침착함은 위기상황
/// 전용 보정. `체력`·`회복력`·`리더십`은 매치 판정이 아니라 피로 누적·
/// 관계도 쪽 스탯이라 이번 스코프에서도 필드로 안 받는다.
pub struct PitcherStats {
    pub id: String,
    pub control: f64,
    pub stuff: f64,
    pub fatigue: f64,
    pub velocity: f64,
    pub game_management: f64,
    pub clutch: f64,
    pub composure: f64,
    pub handedness: Handedness,
}

/// 좌우 상성(Phase 4, 기획 문서에 없는 신규 설계) — 투수 던지는 손(`좌완`/
/// `우완`)·타자 타석(`좌타`/`우타`/`양타`). `protagonist.handedness`(투수
/// 전용, 이미 저장만 되던 값)와 신규 `npc.handedness`(v16 migration)를
/// 여기서 하나의 타입으로 통일해 판정식에 넣는다. `Switch`는 항상 상대
/// 투수 반대편에 서는 실제 야구 관례상 "동타 없음"으로 취급.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Handedness {
    Left,
    Right,
    Switch,
}

impl Handedness {
    /// `"좌완"`/`"좌타"` → Left, `"양타"` → Switch, 그 외(우완·우타·미기록
    /// NULL 등)는 전부 Right로 폴백 — 기존 npc 컬럼 관례(새 컬럼은 nullable,
    /// 파싱 실패는 안전한 기본값)와 동일.
    pub fn parse(raw: &str) -> Handedness {
        match raw {
            "좌완" | "좌타" => Handedness::Left,
            "양타" => Handedness::Switch,
            _ => Handedness::Right,
        }
    }
}

/// 판정식에 더할 "투수 유리도" — 동타(스위치 타자 제외)면 양수(투수
/// 유리), 반대면 음수(타자 유리). D그룹 placeholder(계수는 I8 밸런스
/// 하네스 재조정 대상) — `simulate_plate_appearance`(배경)와
/// `sim::pitch::throw_pitch`(주인공 1구 단위) 양쪽이 이 함수 하나를
/// 공유해 두 엔진 사이에서 상성 판정이 갈라지지 않게 한다.
const PLATOON_EDGE: f64 = 3.0;

pub(crate) fn platoon_edge_for_pitcher(pitcher: Handedness, batter: Handedness) -> f64 {
    let same_side = match batter {
        Handedness::Switch => false,
        b => b == pitcher,
    };
    if same_side {
        PLATOON_EDGE
    } else {
        -PLATOON_EDGE
    }
}

/// 타격 유형 태그(Phase 4, 05_구종_시스템.md §5) — 전용 스탯 신설 없이
/// 지배적인 스탯 조합으로 자동 분류하는 "서사·해설용" 라벨. 이번 Phase는
/// Phase 5(수비 시프트)의 입력으로 쓸 헬퍼만 만들어두고 실제 판정식엔
/// 아직 연결하지 않는다(플랜 문서 그대로).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BattingTypeTag {
    Power,
    Contact,
    Spray,
    Speed,
    Patient,
    AllRound,
}

/// 4개 지표(파워·컨택·스피드·선구안) 중 하나가 나머지 평균보다
/// `DOMINANCE_GAP` 이상 높으면 그 스탯의 태그로, 파워·컨택이 둘 다 평균
/// 이상이면서 서로 비슷하면 스프레이형, 그 외(전부 고르게 높거나 낮음)는
/// 올라운드형. D그룹 placeholder(임계값은 I8 재조정 대상).
const DOMINANCE_GAP: f64 = 15.0;

pub fn classify_batting_type(batter: &BatterStats) -> BattingTypeTag {
    let (power, contact, speed, eye) = (batter.power, batter.contact, batter.speed, batter.eye);
    // 스프레이형은 "파워+컨택 균형"이지 "전 스탯 균등"이 아니다 — 파워·
    // 컨택이 서로 비슷하면서(쏠림 없음) 스피드·선구안보다는 뚜렷이 높아야
    // 한다. 파워=컨택이면 "파워 압도" 단일 판정보다 이 조합이 먼저
    // 성립해야 스프레이형과 파워/컨택 단일형이 안 갈린다.
    let power_contact_avg = (power + contact) / 2.0;
    let speed_eye_avg = (speed + eye) / 2.0;
    if (power - contact).abs() < DOMINANCE_GAP && power_contact_avg - speed_eye_avg >= 10.0 {
        return BattingTypeTag::Spray;
    }
    let stats = [(BattingTypeTag::Power, power), (BattingTypeTag::Contact, contact), (BattingTypeTag::Speed, speed), (BattingTypeTag::Patient, eye)];
    if let Some(&(tag, value)) = stats.iter().max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal)) {
        let rest_avg = (power + contact + speed + eye - value) / 3.0;
        if value - rest_avg >= DOMINANCE_GAP {
            return tag;
        }
    }
    BattingTypeTag::AllRound
}

/// `DoublePlay`(병살타)·`SacFly`(희생플라이)·`ReachOnError`(실책 출루)는
/// Phase 2(§6 "타석 결과 확장")에서 추가 — `resolve_in_play_result`가
/// 주자 상황·아웃카운트·타구 유형(`BattedBallType`)·팀 수비력을 보고
/// 자동 판정한다(투수·타자의 능동 선택 아님, §6 "시스템 처리").
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum PaOutcome {
    Strikeout,
    Walk,
    HitByPitch,
    Out,
    DoublePlay,
    SacFly,
    ReachOnError,
    Single,
    Double,
    Triple,
    HomeRun,
}

/// 타구 유형(Phase 2) — 병살·희생플라이 자동 판정(§6)과 수비 시프트
/// (Phase 5)의 입력. `pub(crate)` — Phase 5에서 `data::match_session`
/// 쪽 수비 시프트 판정에도 재사용할 여지를 남겨둠.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BattedBallType {
    GroundBall,
    FlyBall,
    LineDrive,
}

/// 땅볼 45%·뜬공 35%·직선타 20%(실제 야구 근사치) — D그룹 placeholder,
/// 타자 스탯에 따른 편차(예: 파워형일수록 뜬공↑)는 이번 스코프 밖.
fn roll_batted_ball_type(rng: &mut impl Rng) -> BattedBallType {
    let roll = rng.gen::<f64>();
    if roll < 0.45 {
        BattedBallType::GroundBall
    } else if roll < 0.80 {
        BattedBallType::FlyBall
    } else {
        BattedBallType::LineDrive
    }
}

/// 내야 4자리 가중치(유격수·2루수가 땅볼을 더 많이 처리하는 실제 분포
/// 근사) — `roll_fielder_position`에서만 씀.
const INFIELD_WEIGHTS: [(&str, f64); 4] = [("유격수", 0.30), ("2루수", 0.27), ("3루수", 0.24), ("1루수", 0.19)];
/// 외야 3자리 가중치(중견수가 커버 범위가 넓어 더 많이 처리).
const OUTFIELD_WEIGHTS: [(&str, f64); 3] = [("중견수", 0.40), ("좌익수", 0.30), ("우익수", 0.30)];

fn weighted_position_pick(rng: &mut impl Rng, table: &[(&'static str, f64)]) -> &'static str {
    let roll = rng.gen::<f64>();
    let mut acc = 0.0;
    for (name, weight) in table {
        acc += weight;
        if roll < acc {
            return name;
        }
    }
    table[table.len() - 1].0
}

/// 타구를 처리한 포지션(대화 2026-07-25) — 투수·포수는 실제로 타구를
/// 처리하는 일이 드물고 넣으면 모델만 복잡해져서 이번 스코프에서 제외
/// (대화 확인) — 내야 4자리·외야 3자리 7종만. 안타든 아웃이든 "이 타구가
/// 어느 방향으로 갔는지"는 항상 의미가 있어(안타여도 그 방향 야수가
/// 처리/추격) 타구 유형과 무관하게 항상 하나를 뽑는다 — 직선타는 내야·
/// 외야를 반반으로 섞음.
fn roll_fielder_position(rng: &mut impl Rng, batted: BattedBallType) -> &'static str {
    match batted {
        BattedBallType::GroundBall => weighted_position_pick(rng, &INFIELD_WEIGHTS),
        BattedBallType::FlyBall => weighted_position_pick(rng, &OUTFIELD_WEIGHTS),
        BattedBallType::LineDrive => {
            if rng.gen_bool(0.5) {
                weighted_position_pick(rng, &INFIELD_WEIGHTS)
            } else {
                weighted_position_pick(rng, &OUTFIELD_WEIGHTS)
            }
        }
    }
}

/// 개인 수비 스탯 조회(대화 2026-07-25) — 그 포지션을 맡은 라인업 선수를
/// 찾아 `defense` 값을 반환, 없으면(포지션 결원·시프트 등) 팀 평균으로
/// 폴백. `resolve_in_play_result`의 실책 확률 계산에 쓰인다.
fn fielder_defense_at(lineup: &[BatterStats], position: &str) -> f64 {
    lineup.iter().find(|b| b.position == position).map(|b| b.defense).unwrap_or_else(|| average_defense(lineup))
}

/// `resolve_in_play_result`의 반환값(대화 2026-07-25) — 결과와 함께 "그
/// 타구를 처리한 포지션"을 같이 실어, 매치 화면이 해당 수비수 배지를
/// 하이라이트할 수 있게 한다. 배경 시뮬(`simulate_plate_appearance`)처럼
/// 포지션 정보가 필요 없는 호출부는 `.outcome`만 꺼내 쓰면 됨.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InPlayResolution {
    pub outcome: PaOutcome,
    pub fielder_position: &'static str,
}

/// `simulate_plate_appearance`의 반환값(Phase B, 대화 2026-07-25) — 삼진·
/// 볼넷·사구는 수비가 개입하지 않으므로 `fielder_position`이 `None`, 인플레이로
/// 이어진 경우만 `resolve_in_play_result`가 뽑은 포지션을 그대로 담는다.
/// 호출부가 개인 수비 기록(`FieldingGameStats`)을 쌓을지 말지는 이 필드
/// 유무로 판단하면 된다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlateAppearanceResult {
    pub outcome: PaOutcome,
    pub fielder_position: Option<&'static str>,
}

/// 포지션별 개인 수비 기록 한 줄(Phase B, 대화 2026-07-25) — `resolve_in_play_result`
/// 가 뽑은 포지션의 실제 담당 선수에게 귀속되는 수비 기회/실책. 타석
/// 기록(`BatterGameStats`)과 별개로 쌓는 이유: 수비는 "그 자리에 있었는가"라
/// 타석에 몇 번 섰는지와 무관하고, 투수가 타석에 서지 않는 지명타자
/// 제도 등으로 타석 기록과 수비 기록의 주체가 어긋날 수 있어서다.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct FieldingGameStats {
    pub chances: u32,
    pub errors: u32,
}

impl FieldingGameStats {
    /// 수비율 — (기회-실책)/기회. 기회가 0이면(그 이닝에 타구가 한 번도
    /// 안 온 자리) 완벽한 1.0으로 취급(타율 등과 달리 "시도 없음=실패
    /// 없음"이 자연스러운 관례).
    pub fn fielding_percentage(&self) -> f64 {
        if self.chances == 0 {
            1.0
        } else {
            (self.chances - self.errors) as f64 / self.chances as f64
        }
    }
}

/// 급성형(우발) 부상 이벤트 — 08_부상_시스템.md §3 "경기 중 특정 순간의
/// 낮은 확률 랜덤 이벤트". `sim::injury::check_acute_injury`가 판정한
/// 부위·심각도를 어떤 선수(`player_id`)에게 귀속시킬지까지 포함해
/// 호출부(repository.rs)가 그대로 `injury` 컬럼에 기록할 수 있게 한다.
/// "발생 시 즉시 강판"의 로스터 결원 효과(불펜 교체 등)는 감독 AI가 아직
/// 없어 스코프 밖 — 이번엔 판정·기록만(10_구현_Phase_계획.md §6-10 참고).
#[derive(Debug, PartialEq, Eq, Clone)]
pub struct InjuryEvent {
    pub player_id: String,
    pub part: &'static str,
    pub severity: &'static str,
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

/// 피로도가 능력치 실효치를 깎는다(Phase 1, §5 "상황 보정... 피로도") —
/// `sim::injury::FATIGUE_INJURY_THRESHOLD`(70) 근처부터 체감되게 2차
/// 곡선으로 감쇠, 최대 -15(피로도 100 기준). D그룹 placeholder(계수는
/// I8 밸런스 하네스 재조정 대상). 피로도 0이면 원래 능력치 그대로.
pub(crate) fn fatigue_effective(base: f64, fatigue: f64) -> f64 {
    let decay = (fatigue / 100.0).clamp(0.0, 1.0).powi(2) * 15.0;
    (base - decay).max(0.0)
}

/// 위기상황 판정 — 07_매치_엔진.md §4 "만루·동점·역전 기회 등 레버리지
/// 높은 타석"만 구현. "개인기록 근접"·"라이벌 매치업"은 각각 기록 추적·
/// 관계도 시스템이 있어야 판단 가능해 스코프 밖(10_구현_Phase_계획.md
/// 참고) — 다음 서브분 후보. 원래 `sim::pitch`(반자동 모드 격상 트리거,
/// 대화 2026-07-25에서 반자동 모드 자체가 폐지됨)에서만 쓰였지만 Phase 1부터
/// 배경 시뮬(`simulate_half_inning`)의 클러치·침착함
/// 보정에도 재사용해 이 파일로 옮겼다 — `sim::pitch`는 재노출(`pub use`)로
/// 기존 호출부를 그대로 유지.
pub fn is_high_leverage_situation(bases_loaded: bool, score_diff: i32, inning: u32) -> bool {
    let late_and_close = inning >= 7 && score_diff.abs() <= 1;
    bases_loaded || late_and_close
}

/// 환경 요소(Phase 5, §10-1 "환경 요소 — 날씨 · 파크팩터") — 구장
/// 파크팩터·날씨. 경기 하나 내내 고정(양 팀 다 같은 구장·같은 날씨에서
/// 뛰므로) — `simulate_game` 호출부(`data::repository::process_day`,
/// `data::match_session`)가 게임당 한 번만 `roll_game_conditions`로
/// 계산해서 넘긴다. `Default`는 파크팩터 정보가 없거나(구세이브·합성
/// 테스트) 날씨를 아직 안 굴렸을 때의 안전한 "중립/모디파이어 없음" 폴백.
#[derive(Debug, Clone, Copy)]
pub struct GameConditions {
    pub park_factor: f64,
    pub weather_control_mod: f64,
    pub weather_power_mod: f64,
    pub weather_fatigue_mult: f64,
}

impl Default for GameConditions {
    fn default() -> Self {
        GameConditions { park_factor: 1.0, weather_control_mod: 0.0, weather_power_mod: 0.0, weather_fatigue_mult: 1.0 }
    }
}

/// 구장 파크팩터 원문("중립"/"타자친화"/"투수친화", `content::load_team_park_factor`)을
/// 배율로 변환 — §10-1 "인플레이 결과(§6) 확률에 구장 성격이 가중". D그룹
/// placeholder(계수는 I8 재조정 대상). 알 수 없는 값(구세이브·NULL 등)은
/// 중립(1.0)으로 폴백.
pub fn park_factor_multiplier(raw: Option<&str>) -> f64 {
    match raw {
        Some("타자친화") => 1.15,
        Some("투수친화") => 0.85,
        _ => 1.0,
    }
}

/// 날씨(Phase 5, §10-1 "맑음·흐림·비·강풍 등") — 경기마다 결정론적으로 한
/// 번만 굴린다. 맑음·흐림은 순수 플레이버(모디파이어 없음).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Weather {
    Clear,
    Cloudy,
    Rain,
    Wind,
    Hot,
}

/// D그룹 placeholder 분포(맑음 40%·흐림 25%·비 15%·강풍 10%·더위 10%).
/// `rng`는 호출부가 `world_seed`+`game_id`로 결정론적으로 시드해서 넘긴다
/// (다른 "게임당 1회" 판정과 같은 패턴, 예: `repository::league_sub_seed`).
pub fn roll_weather(rng: &mut impl Rng) -> Weather {
    let roll = rng.gen::<f64>();
    if roll < 0.40 {
        Weather::Clear
    } else if roll < 0.65 {
        Weather::Cloudy
    } else if roll < 0.80 {
        Weather::Rain
    } else if roll < 0.90 {
        Weather::Wind
    } else {
        Weather::Hot
    }
}

/// `Weather` → (제구 모디파이어, 파워 모디파이어, 피로 배율) — 비=제구
/// 하락(§10-1 "비=제구 하락 확률↑"), 강풍=장타 변동(§10-1 "강풍=장타 확률
/// 변동", 여기선 상승 쪽으로 단순화), 더위=피로 소모 가속(§10-1 "더위=체력
/// 소모↑"). D그룹 placeholder.
fn weather_modifiers(weather: Weather) -> (f64, f64, f64) {
    match weather {
        Weather::Rain => (-6.0, 0.0, 1.0),
        Weather::Wind => (0.0, 5.0, 1.0),
        Weather::Hot => (0.0, 0.0, 1.2),
        Weather::Clear | Weather::Cloudy => (0.0, 0.0, 1.0),
    }
}

/// 파크팩터+날씨를 한 번에 굴려 `GameConditions`를 만든다 — `simulate_game`
/// 호출부가 게임 시작 전에 한 번만 호출.
pub fn roll_game_conditions(rng: &mut impl Rng, park_factor_raw: Option<&str>) -> GameConditions {
    let weather = roll_weather(rng);
    let (weather_control_mod, weather_power_mod, weather_fatigue_mult) = weather_modifiers(weather);
    GameConditions { park_factor: park_factor_multiplier(park_factor_raw), weather_control_mod, weather_power_mod, weather_fatigue_mult }
}

/// 타석 1회 = 1회 확률판정(§11 "최소 타석 단위"를 만족하는 단순화 — 1구
/// 단위 볼카운트는 I5 후속 스코프). 20~80 스탯 스케일 기준 placeholder
/// 판정식 — 정확한 계수는 D그룹(05_밸런스.md), Phase I8 하네스에서 확정.
/// `high_leverage`(Phase 1) — `is_high_leverage_situation`이 true일 때만
/// 클러치·침착함이 개입한다(§5 "상황 보정... 클러치"), 평상시엔 순수
/// 능력치 싸움 그대로. `bases`·`outs`·`fielding_lineup`(Phase 2, 대화
/// 2026-07-25부터 팀 평균 스칼라 대신 라인업 자체를 받음)은 인플레이로
/// 이어질 때 `resolve_in_play_result`에 그대로 전달 — 병살·희생플라이·
/// 포지션별 실책 판정에 필요. `tactics`(Phase 5, 수비 시프트)는 지금
/// 수비 중인 팀 감독의 전술력, `conditions`(Phase 5)는 파크팩터·날씨.
/// 반환값(`PlateAppearanceResult`, Phase B부터)은 `.outcome`과 함께 인플레이로
/// 이어졌을 때만 `Some`인 `.fielder_position`을 싣는다 — 호출부(`simulate_half_inning`)가
/// 이걸로 개인 수비 기록을 쌓는다. 삼진·볼넷·사구는 `resolve_in_play_result`
/// 자체를 안 타므로 `None`.
#[allow(clippy::too_many_arguments)]
pub fn simulate_plate_appearance(
    rng: &mut impl Rng,
    batter: &BatterStats,
    pitcher: &PitcherStats,
    bases: [bool; 3],
    outs: u32,
    fielding_lineup: &[BatterStats],
    tactics: f64,
    high_leverage: bool,
    conditions: &GameConditions,
) -> PlateAppearanceResult {
    let effective_control = fatigue_effective(pitcher.control, pitcher.fatigue) + conditions.weather_control_mod;
    let effective_stuff = fatigue_effective(pitcher.stuff, pitcher.fatigue);
    let mut pitch_edge = (effective_control + effective_stuff) / 2.0 - (batter.contact + batter.eye) / 2.0;
    pitch_edge += platoon_edge_for_pitcher(pitcher.handedness, batter.handedness);
    if high_leverage {
        pitch_edge += (pitcher.clutch - batter.clutch) * 0.15;
    }

    let mut k_prob = clamp01(0.20 + pitch_edge * 0.004 + (pitcher.velocity - 50.0) * 0.001);
    let mut bb_prob = clamp01(0.08 - pitch_edge * 0.003 - (pitcher.game_management - 50.0) * 0.0004);
    if high_leverage {
        bb_prob = clamp01(bb_prob - (pitcher.composure - 50.0) * 0.0006);
        k_prob = clamp01(k_prob - (batter.composure - 50.0) * 0.0003);
    }
    let hbp_prob = 0.01;
    let in_play_prob = clamp01(1.0 - k_prob - bb_prob - hbp_prob);
    let total = k_prob + bb_prob + hbp_prob + in_play_prob;

    let roll = rng.gen::<f64>() * total;
    if roll < k_prob {
        return PlateAppearanceResult { outcome: PaOutcome::Strikeout, fielder_position: None };
    }
    if roll < k_prob + bb_prob {
        return PlateAppearanceResult { outcome: PaOutcome::Walk, fielder_position: None };
    }
    if roll < k_prob + bb_prob + hbp_prob {
        return PlateAppearanceResult { outcome: PaOutcome::HitByPitch, fielder_position: None };
    }

    let resolution = resolve_in_play_result(rng, batter, pitcher, bases, outs, fielding_lineup, tactics, high_leverage, conditions);
    PlateAppearanceResult { outcome: resolution.outcome, fielder_position: Some(resolution.fielder_position) }
}

/// 수비 시프트 보너스(Phase 5, §6-1) — 타자의 타격 유형 태그에 따라
/// 시프트 강도가 다르고(파워형=강하게, 스프레이형=약함/무력화), 감독
/// 전술력이 그 적중도에 소폭 영향(§6-1 "감독 전술력이 시프트 적중도에
/// 소폭 영향"). 반환값은 `hit_prob`에서 빼는 값 — 클수록 시프트가 안타를
/// 아웃으로 더 많이 바꾼다. D그룹 placeholder.
fn shift_bonus(batter: &BatterStats, tactics: f64) -> f64 {
    let tactics_scale = (tactics - 50.0) * 0.0005;
    match classify_batting_type(batter) {
        BattingTypeTag::Power => (0.03 + tactics_scale).max(0.0),
        BattingTypeTag::Spray => 0.0,
        _ => (0.01 + tactics_scale * 0.5).max(0.0),
    }
}

/// 인플레이(공을 맞힘) 발생 이후의 결과 세분화(§6) — 아웃 여부 → 안타
/// 종류. `simulate_plate_appearance`(PA레벨 배경 시뮬)와
/// `sim::pitch::simulate_at_bat_automatically`(주인공 1구 단위 매치
/// 세션, I6 2차분)가 이 판정을 공유해 "인플레이 이후"의 확률식이 두
/// 엔진 사이에서 갈라지지 않게 한다. `bases`·`outs`(Phase 2)는 병살·
/// 희생플라이 자동 판정(§6)에 쓰인다. `fielding_lineup`(대화 2026-07-25
/// 부터 팀 평균 스칼라 `team_defense: f64` 대신 라인업 자체) — 타구
/// 유형(땅볼/뜬공/직선타)에서 실제 처리 포지션을 하나 뽑아 그 포지션
/// 선수 개인 수비 스탯으로 실책 확률을 계산한다("수비 전력 = 수비
/// 스탯 가중합"을 팀 평균이 아니라 문자 그대로 그 자리 선수로 구현) —
/// 타석에 선 팀(공격팀)이 아니라 지금 수비 중인 팀의 라인업이어야 한다
/// (호출부 책임). `tactics`(Phase 5)는 수비 중인 팀 감독의 전술력(수비
/// 시프트 적중도), `conditions`(Phase 5)는 파크팩터(홈런·장타 배율)·
/// 날씨(강풍=장타 변동). 반환값(`InPlayResolution`)엔 "그 타구를 처리한
/// 포지션"도 같이 실린다 — 안타여도 그 방향 야수가 처리/추격하므로
/// 타구 유형과 무관하게 항상 하나를 뽑는다(매치 화면 수비 배지 하이라이트용).
#[allow(clippy::too_many_arguments)]
pub fn resolve_in_play_result(
    rng: &mut impl Rng,
    batter: &BatterStats,
    pitcher: &PitcherStats,
    bases: [bool; 3],
    outs: u32,
    fielding_lineup: &[BatterStats],
    tactics: f64,
    high_leverage: bool,
    conditions: &GameConditions,
) -> InPlayResolution {
    let mut power_edge = batter.power - fatigue_effective(pitcher.stuff, pitcher.fatigue);
    if high_leverage {
        power_edge += (batter.clutch - pitcher.clutch) * 0.15;
    }
    let hit_prob = clamp01(0.30 + power_edge * 0.002 - shift_bonus(batter, tactics));
    let batted = roll_batted_ball_type(rng);
    let fielder_position = roll_fielder_position(rng, batted);

    if rng.gen::<f64>() >= hit_prob {
        // 아웃이 될 타구 — 실책이 먼저 개입해 아웃을 출루로 뒤집을 수
        // 있다("실책이 없었으면 아웃이었을 타구"라는 실제 채점 관례와
        // 일치). 그 타구를 처리하는 포지션 선수 개인 수비력이 낮을수록
        // (50 미만) 확률↑, D그룹 placeholder.
        let fielder_defense = fielder_defense_at(fielding_lineup, fielder_position);
        let error_prob = clamp01(0.03 + (50.0 - fielder_defense) * 0.001);
        if rng.gen::<f64>() < error_prob {
            return InPlayResolution { outcome: PaOutcome::ReachOnError, fielder_position };
        }
        if batted == BattedBallType::GroundBall && bases[0] && outs < 2 {
            return InPlayResolution { outcome: PaOutcome::DoublePlay, fielder_position };
        }
        if batted == BattedBallType::FlyBall && bases[2] && outs < 2 {
            return InPlayResolution { outcome: PaOutcome::SacFly, fielder_position };
        }
        return InPlayResolution { outcome: PaOutcome::Out, fielder_position };
    }

    // 안타 종류 세분화 — 파크팩터가 홈런·2루타 확률에, 날씨(강풍)가
    // "실효 파워"에 가중된다(§10-1).
    let effective_power_for_extra_base = batter.power + conditions.weather_power_mod;
    let hr_prob = clamp01((0.03 + (effective_power_for_extra_base - 50.0) * 0.0015) * conditions.park_factor);
    let triple_prob = 0.02;
    let double_prob = clamp01((0.18 + (effective_power_for_extra_base - 50.0) * 0.0008) * conditions.park_factor);
    let roll2 = rng.gen::<f64>();
    let outcome = if roll2 < hr_prob {
        PaOutcome::HomeRun
    } else if roll2 < hr_prob + triple_prob {
        PaOutcome::Triple
    } else if roll2 < hr_prob + triple_prob + double_prob {
        PaOutcome::Double
    } else {
        PaOutcome::Single
    };
    InPlayResolution { outcome, fielder_position }
}

/// 수비 중인 팀의 평균 수비력(Phase 2, §3 "수비 전력 = 수비 스탯 가중합"
/// 단순화). 대화 2026-07-25부터 `resolve_in_play_result`의 실책 확률은
/// 포지션별 개인 수비 스탯(`fielder_defense_at`)을 우선 쓰고, 이 함수는
/// (1) 그 포지션 선수를 못 찾았을 때의 폴백, (2) 도루 저지(`attempt_steal`)
/// 처럼 여전히 팀 전체를 대표하는 값이 필요한 곳에만 쓰인다. `pub(crate)`
/// — `data::match_session`이 수비 중인 팀의 라인업을 불러와 넘길 때 재사용.
pub(crate) fn average_defense(lineup: &[BatterStats]) -> f64 {
    if lineup.is_empty() {
        return 50.0;
    }
    lineup.iter().map(|b| b.defense).sum::<f64>() / lineup.len() as f64
}

/// 주자를 hit_bases만큼 진루시키고 득점 수를 반환. 강제진루(볼넷·사구·
/// 실책 출루)와 3루타·홈런(어차피 전원 홈)에 쓴다 — 이 경우들은 "더
/// 뛸지 말지" 판단 자체가 없거나 무의미하므로 고정 진루가 정확한 모델.
/// 단타·2루타의 "무리한 추가진루" 판단은 `advance_runners_realistic`
/// (Phase 3)로 분리. `pub(crate)` — `data::match_session`(I6 3차분)이
/// 주인공 등판 이닝의 주자 진루를 계산할 때 재사용.
pub(crate) fn advance_runners(bases: &mut [bool; 3], hit_bases: u32) -> u32 {
    let mut runs = 0;
    let mut new_bases = [false; 3];
    for i in (0..3).rev() {
        if bases[i] {
            let pos = (i as u32 + 1) + hit_bases;
            if pos >= 4 {
                runs += 1;
            } else {
                new_bases[(pos - 1) as usize] = true;
            }
        }
    }
    if hit_bases >= 4 {
        runs += 1;
    } else {
        new_bases[(hit_bases - 1) as usize] = true;
    }
    *bases = new_bases;
    runs
}

/// 타석에 선 팀의 평균 주력(Phase 3, §9 "스피드") — 라인업 전원 단순
/// 평균(수비력과 동일한 단순화). 지금 누가 어느 베이스에 있는지 개인별로
/// 추적하지 않으므로(§9 "강제진루 규칙... 스코프 밖"이 남긴 단순화를
/// 이번에도 그대로 유지), "타석에 선 팀 전체의 평균 발"로 그 이닝
/// 주자들의 대표 스피드를 근사한다.
pub(crate) fn average_speed(lineup: &[BatterStats]) -> f64 {
    if lineup.is_empty() {
        return 50.0;
    }
    lineup.iter().map(|b| b.speed).sum::<f64>() / lineup.len() as f64
}

/// 단타·2루타에서 주자가 한 베이스 더 무리해서 뛸 확률(Phase 3, §9) —
/// 평균 주력이 높을수록, 아웃카운트가 2일수록(더 잃을 게 없어 과감해진다는
/// 근사) 확률↑. D그룹 placeholder.
fn extra_base_prob(team_speed: f64, outs: u32) -> f64 {
    let base = 0.35 + (team_speed - 50.0) * 0.006;
    let outs_bonus = if outs == 2 { 0.15 } else { 0.0 };
    clamp01(base + outs_bonus)
}

/// `advance_runners`와 달리 단타·2루타에서만 쓴다(3루타·홈런은 이미
/// 전원 홈이라 "더 뛸지" 판단 자체가 없음) — 이미 베이스에 있던 주자
/// 각자가 `extra_base_prob`로 한 베이스씩 더 뛸지 개별 판정한다. 타자
/// 본인은 항상 `hit_bases`까지만(자기 타구로 자기 자신이 무리하게 더
/// 뛰는 건 이번 스코프 밖).
pub(crate) fn advance_runners_realistic(rng: &mut impl Rng, bases: &mut [bool; 3], hit_bases: u32, outs: u32, team_speed: f64) -> u32 {
    let mut runs = 0;
    let mut new_bases = [false; 3];
    for i in (0..3).rev() {
        if bases[i] {
            let mut advance = hit_bases;
            if rng.gen::<f64>() < extra_base_prob(team_speed, outs) {
                advance += 1;
            }
            let pos = (i as u32 + 1) + advance;
            if pos >= 4 {
                runs += 1;
            } else {
                new_bases[(pos - 1) as usize] = true;
            }
        }
    }
    new_bases[(hit_bases - 1) as usize] = true;
    *bases = new_bases;
    runs
}

/// 도루 시도 판정(Phase 3, §9 "도루") — 1루 주자만 대상(2·3루 동시 도루는
/// 스코프 밖). 시도 자체도 스피드에 비례(느린 팀은 거의 안 뜀). 성공률은
/// 스피드 vs 투수 "경기운영"(견제 흡수, §10)·수비 중인 팀의 평균 수비력
/// (포수 대리)로 판정. `None`=시도 안 함, `Some(true)`=성공, `Some(false)`
/// =실패(도루사). D그룹 placeholder.
pub(crate) fn attempt_steal(rng: &mut impl Rng, team_speed: f64, pitcher_game_management: f64, team_defense: f64) -> Option<bool> {
    let attempt_prob = clamp01((team_speed - 50.0) * 0.01 + 0.1);
    if !rng.gen_bool(attempt_prob) {
        return None;
    }
    let success_prob =
        clamp01(0.65 + (team_speed - 50.0) * 0.004 - (pitcher_game_management - 50.0) * 0.002 - (team_defense - 50.0) * 0.002);
    Some(rng.gen_bool(success_prob))
}

/// 투수 개인 경기 기록(`season_stats` 적재용, 10_구현_Phase_계획.md §6-N).
/// `unearned_runs`(비자책점)·`errors`는 Phase 2에서 추가(§12 "자책점/
/// 비자책점 구분... ERA 등 투수 기록의 정확성에 필수") — `ReachOnError`가
/// 발생한 그 타석에서 곧바로 스코어링된 득점만 비자책으로 잡는다(그
/// 주자가 나중에 다른 타자의 안타로 득점하는 경우까지 소급 추적하는
/// 완전한 자책 귀속은 이번 스코프 밖, D그룹). 사구(HBP)는 세분화하지
/// 않고 무시(1% 확률의 미세 항목, D그룹).
#[derive(Debug, Default, Clone, PartialEq)]
pub struct PitcherGameStats {
    pub outs_recorded: u32,
    pub runs_allowed: u32,
    pub strikeouts: u32,
    pub hits_allowed: u32,
    pub walks: u32,
    pub unearned_runs: u32,
    pub errors: u32,
    /// Phase 6(§12 "세이브·홀드") — `simulate_game`이 게임 종료 시점에
    /// 딱 1회만 부여(§8 "게임당 1회 강판" 제약과 동일 선상 — 마무리 등판
    /// 뒤 리드를 지키고 경기를 끝내면 세이브).
    pub saves: u32,
    /// 홀드 — 실제 야구에서는 "세이브 상황에 등판해 리드를 지킨 채 다음
    /// 투수에게 넘김"이지만, 이 엔진은 팀당 게임 1회 교체만 지원해(§8)
    /// 교체된 투수가 항상 경기를 끝까지 던진다 — 즉 "다음 투수에게 넘기는"
    /// 상황 자체가 구조적으로 발생할 수 없다. 필드는 기록 스키마 완결성과
    /// 향후(2회 이상 교체 지원 시) 재사용을 위해 남겨두되, 이번 Phase에선
    /// 항상 0(이월 레지스트리 §5 참고).
    pub holds: u32,
}

/// 타자 개인 경기 기록(`season_stats` 적재용) — HBP는 투수 쪽과 동일하게
/// 무시. `stolen_bases`·`caught_stealing`은 Phase 3에서 추가(§9 "도루").
#[derive(Debug, Default, Clone, PartialEq)]
pub struct BatterGameStats {
    pub plate_appearances: u32,
    pub at_bats: u32,
    pub hits: u32,
    pub doubles: u32,
    pub triples: u32,
    pub home_runs: u32,
    pub walks: u32,
    pub strikeouts: u32,
    pub rbi: u32,
    pub stolen_bases: u32,
    pub caught_stealing: u32,
}

impl BatterGameStats {
    /// 타율 — 안타/타수. Phase 6(§12 "기록 필드", 시즌 통산 파생 스탯).
    pub fn batting_average(&self) -> f64 {
        if self.at_bats == 0 {
            0.0
        } else {
            self.hits as f64 / self.at_bats as f64
        }
    }

    /// 출루율 — (안타+볼넷)/(타수+볼넷). 사구·희생플라이는 세분화하지
    /// 않는 기존 관례(§12 "사구는 1% 확률의 미세 항목이라 무시")를 그대로
    /// 따라 분모에서 뺀다.
    pub fn on_base_percentage(&self) -> f64 {
        let denom = self.at_bats + self.walks;
        if denom == 0 {
            0.0
        } else {
            (self.hits + self.walks) as f64 / denom as f64
        }
    }

    /// 장타율 — 총루타/타수. 총루타 = 단타×1 + 2루타×2 + 3루타×3 + 홈런×4
    /// (단타 수는 안타에서 2·3루타·홈런을 뺀 나머지로 역산).
    pub fn slugging_percentage(&self) -> f64 {
        if self.at_bats == 0 {
            return 0.0;
        }
        let singles = self.hits.saturating_sub(self.doubles + self.triples + self.home_runs);
        let total_bases = singles + self.doubles * 2 + self.triples * 3 + self.home_runs * 4;
        total_bases as f64 / self.at_bats as f64
    }

    /// OPS — 출루율+장타율.
    pub fn ops(&self) -> f64 {
        self.on_base_percentage() + self.slugging_percentage()
    }
}

/// 타석 결과 1건을 타자 기록에 반영(§6·§12) — 배경 하프이닝(`simulate_half_inning`)
/// 과 인터랙티브 1구 루프(`data::match_session`, 주인공이 던지는 동안
/// 상대 타자들)가 이 함수 하나를 공유해, "상대 타자 개인 기록"이 어느
/// 엔진으로 그 타석을 치렀느냐에 따라 갈리지 않게 한다(Phase 7 정합성
/// 점검에서 발견 — 인터랙티브 쪽은 이 집계 자체가 아예 빠져 있었음).
/// 희생플라이는 타수에 안 잡히고(실제 야구 규칙), 실책 출루는 타수엔
/// 잡히지만 타점은 안 준다.
pub(crate) fn record_batter_pa(line: &mut BatterGameStats, outcome: PaOutcome, runs: u32) {
    line.plate_appearances += 1;
    match outcome {
        PaOutcome::Strikeout => {
            line.at_bats += 1;
            line.strikeouts += 1;
        }
        PaOutcome::Out | PaOutcome::DoublePlay | PaOutcome::ReachOnError => line.at_bats += 1,
        PaOutcome::SacFly | PaOutcome::Walk | PaOutcome::HitByPitch => {}
        PaOutcome::Single => {
            line.at_bats += 1;
            line.hits += 1;
        }
        PaOutcome::Double => {
            line.at_bats += 1;
            line.hits += 1;
            line.doubles += 1;
        }
        PaOutcome::Triple => {
            line.at_bats += 1;
            line.hits += 1;
            line.triples += 1;
        }
        PaOutcome::HomeRun => {
            line.at_bats += 1;
            line.hits += 1;
            line.home_runs += 1;
        }
    }
    if outcome != PaOutcome::ReachOnError {
        line.rbi += runs;
    }
}

/// 하프이닝 1회 분량의 누산기 — 그 이닝에서 던진 투수 1명 + 타석에 선 타자
/// 전원을 함께 담는다("누가 던지고 누가 쳤는지"가 한 호출 안에서 항상 한
/// 팀씩 짝지어지므로). `fielders`(Phase B, 대화 2026-07-25)는 반대로 "그
/// 이닝에 수비를 본" 상대팀 선수들 — `batters`와 키(player id)가 같은
/// 스키마일 뿐 소속 팀이 반대라, 호출부가 이 둘을 각각 올바른 팀에
/// 적재해야 한다(호출부 책임, `simulate_half_inning` 문서 참고).
#[derive(Debug, Default)]
pub struct HalfInningStats {
    pub pitcher: PitcherGameStats,
    pub batters: HashMap<String, BatterGameStats>,
    pub fielders: HashMap<String, FieldingGameStats>,
}

/// `pub(crate)` — `data::match_session`이 주인공 팀 타석(DH 배경 시뮬,
/// 절대 개입 없음 — §7)을 통째로 돌릴 때 재사용. `high_leverage_base`는
/// 호출부(이닝·스코어를 아는 쪽)가 미리 계산해서 넘기는 "만루 제외" 위기
/// 판정(Phase 1) — 이 함수 안에서 타석마다 실시간 만루 여부와 OR해
/// 최종 `high_leverage`를 매 타석 다시 판단한다. `fielding_lineup`(Phase 2,
/// 대화 2026-07-25부터 팀 평균 스칼라 대신 라인업 자체) — 호출부가 미리
/// 불러온 "지금 수비 중인 팀"의 라인업, 이 하프이닝 내내 고정. 도루
/// 저지(`attempt_steal`)는 여전히 팀 평균(`average_defense`)을 쓰고,
/// 인플레이 실책 판정(`resolve_in_play_result`)만 포지션별 개인 수비로
/// 세분화된다. `stats.fielders`(Phase B)는 `par.fielder_position`이 가리키는
/// `fielding_lineup` 선수에게 수비 기회 1회(+실책이면 실책 1회)를 적립 —
/// 그 포지션에 아무도 없으면(결원) 조용히 건너뛴다.
#[allow(clippy::too_many_arguments)]
pub(crate) fn simulate_half_inning(
    rng: &mut impl Rng,
    lineup: &[BatterStats],
    batter_idx: &mut usize,
    pitcher: &PitcherStats,
    initial_bases: [bool; 3],
    high_leverage_base: bool,
    fielding_lineup: &[BatterStats],
    tactics: f64,
    conditions: &GameConditions,
    injuries: &mut Vec<InjuryEvent>,
    stats: &mut HalfInningStats,
) -> u32 {
    if lineup.is_empty() {
        return 0;
    }
    let mut outs = 0;
    let mut bases = initial_bases;
    let mut runs = 0;
    let team_speed = average_speed(lineup);
    let team_defense = average_defense(fielding_lineup);
    // 1루 주자의 "지금 이 사람이 누구인지"만 곁다리로 추적(Phase 3, §9
    // 도루) — `bases`는 여전히 점유 여부만 담는 단순 모델이라 2·3루로
    // 넘어간 뒤에는 신원을 놓친다(도루는 1루→2루만 다루므로 이거면 충분).
    let mut runner_on_first_id: Option<String> = None;
    while outs < 3 {
        // 도루 시도(§9) — 다음 타자의 타석이 시작되기 전, 1루에 주자가
        // 있고 2루가 비어 있을 때만. 성공/실패 모두 그 자리에서 아웃카운트·
        // 베이스 상태를 바로 반영하고, 실패해 3아웃이 차면 이 하프이닝은
        // 그 타자를 상대해보지도 못하고 끝난다(실제 야구와 동일).
        if bases[0] && !bases[1] {
            if let Some(runner_id) = runner_on_first_id.clone() {
                if let Some(success) = attempt_steal(rng, team_speed, pitcher.game_management, team_defense) {
                    let line = stats.batters.entry(runner_id).or_default();
                    if success {
                        bases[0] = false;
                        bases[1] = true;
                        line.stolen_bases += 1;
                    } else {
                        bases[0] = false;
                        outs += 1;
                        line.caught_stealing += 1;
                    }
                    runner_on_first_id = None;
                    if outs >= 3 {
                        break;
                    }
                }
            }
        }

        let batter = &lineup[*batter_idx % lineup.len()];
        *batter_idx += 1;
        let bases_loaded = bases.iter().all(|&b| b);
        let par =
            simulate_plate_appearance(rng, batter, pitcher, bases, outs, fielding_lineup, tactics, high_leverage_base || bases_loaded, conditions);
        let outcome = par.outcome;
        if let Some(position) = par.fielder_position {
            if let Some(fielder) = fielding_lineup.iter().find(|b| b.position == position) {
                let fielding_line = stats.fielders.entry(fielder.id.clone()).or_default();
                fielding_line.chances += 1;
                if outcome == PaOutcome::ReachOnError {
                    fielding_line.errors += 1;
                }
            }
        }
        let pa_runs = match outcome {
            PaOutcome::Strikeout | PaOutcome::Out => {
                outs += 1;
                0
            }
            PaOutcome::DoublePlay => {
                outs += 2;
                bases[0] = false;
                0
            }
            PaOutcome::SacFly => {
                outs += 1;
                if bases[2] {
                    bases[2] = false;
                    1
                } else {
                    0
                }
            }
            PaOutcome::ReachOnError | PaOutcome::Walk | PaOutcome::HitByPitch => advance_runners(&mut bases, 1),
            PaOutcome::Single => advance_runners_realistic(rng, &mut bases, 1, outs, team_speed),
            PaOutcome::Double => advance_runners_realistic(rng, &mut bases, 2, outs, team_speed),
            PaOutcome::Triple => advance_runners(&mut bases, 3),
            PaOutcome::HomeRun => advance_runners(&mut bases, 4),
        };
        runs += pa_runs;
        // 1루 주자 신원 갱신 — 병살로 1루가 비거나, 새로 누군가 1루에
        // 도착했으면 그 타자로 교체. 그 외(아웃·희생플라이 등 1루를 안
        // 건드리는 결과)는 기존 주자가 계속 1루에 남아있으므로 그대로 둔다.
        if !bases[0] {
            runner_on_first_id = None;
        } else if matches!(outcome, PaOutcome::Walk | PaOutcome::HitByPitch | PaOutcome::ReachOnError | PaOutcome::Single) {
            runner_on_first_id = Some(batter.id.clone());
        }

        match outcome {
            PaOutcome::Strikeout => {
                stats.pitcher.outs_recorded += 1;
                stats.pitcher.strikeouts += 1;
            }
            PaOutcome::Out => stats.pitcher.outs_recorded += 1,
            PaOutcome::DoublePlay => stats.pitcher.outs_recorded += 2,
            PaOutcome::SacFly => stats.pitcher.outs_recorded += 1,
            PaOutcome::ReachOnError => stats.pitcher.errors += 1,
            PaOutcome::Walk => stats.pitcher.walks += 1,
            PaOutcome::HitByPitch => {}
            PaOutcome::Single | PaOutcome::Double | PaOutcome::Triple | PaOutcome::HomeRun => stats.pitcher.hits_allowed += 1,
        }
        stats.pitcher.runs_allowed += pa_runs;
        if outcome == PaOutcome::ReachOnError {
            stats.pitcher.unearned_runs += pa_runs;
        }

        let batter_line = stats.batters.entry(batter.id.clone()).or_default();
        record_batter_pa(batter_line, outcome, pa_runs);

        if let Some((part, severity)) = injury::check_acute_injury(rng, batter.fatigue) {
            injuries.push(InjuryEvent { player_id: batter.id.clone(), part, severity });
        }
        if let Some((part, severity)) = injury::check_acute_injury(rng, pitcher.fatigue) {
            injuries.push(InjuryEvent { player_id: pitcher.id.clone(), part, severity });
        }
    }
    runs
}

pub struct GameResult {
    pub home_runs: u32,
    pub away_runs: u32,
    pub injuries: Vec<InjuryEvent>,
    pub home_pitcher_stats: PitcherGameStats,
    pub away_pitcher_stats: PitcherGameStats,
    pub home_reliever_stats: Option<PitcherGameStats>,
    pub away_reliever_stats: Option<PitcherGameStats>,
    /// 2단계 교체(선발→중계→마무리, Phase 2) — 중계에서 다시 마무리로
    /// 넘어간 경우만 채워진다. `home_reliever_stats`가 `None`이면 이것도
    /// 항상 `None`(1단계도 안 갔는데 2단계로 갈 수 없음).
    pub home_closer_stats: Option<PitcherGameStats>,
    pub away_closer_stats: Option<PitcherGameStats>,
    pub home_batter_stats: HashMap<String, BatterGameStats>,
    pub away_batter_stats: HashMap<String, BatterGameStats>,
    /// 그 경기에서 홈/원정 라인업 선수가 각자 수비로 기록한 기회/실책
    /// (Phase B, 대화 2026-07-25) — 키는 `home_batter_stats`와 같은 player
    /// id 스키마지만, 타석에 선 게 아니라 "그 자리를 수비했다"는 별개
    /// 사건이라 값은 겹치지 않는 별도 맵.
    pub home_fielding_stats: HashMap<String, FieldingGameStats>,
    pub away_fielding_stats: HashMap<String, FieldingGameStats>,
}

const EMPTY_BASES: [bool; 3] = [false, false, false];
const TIEBREAK_BASES: [bool; 3] = [true, true, false]; // 승부치기: 무사 1·2루

/// 배경 경기(`simulate_game`)의 팀별 투수 운용 계획 — 강판 판정에 필요한
/// 입력을 한 번에 묶는다(파라미터 폭발 방지). `reliever`는 세이브 상황이
/// 아닐 때 쓸 중계, `closer`는 세이브 상황(`manager::is_save_situation`,
/// Part G)일 때 쓸 마무리 — 강판이 일어나는 그 이닝의 실제 스코어를
/// 보고 둘 중 하나를 고른다(`load_relief_pitcher`가 미리 채워온다).
/// 둘 다 `None`이면 그 팀은 강판 없이 완투(로스터에 중계·마무리투수가
/// 없을 때의 방어적 폴백, 기존 동작과 동일). 한쪽만 있으면 상황과
/// 무관하게 있는 쪽을 쓴다(예: 마무리는 있는데 중계가 없는 극단적으로
/// 작은 로스터).
pub struct TeamPitchingPlan<'a> {
    pub starter: &'a PitcherStats,
    pub reliever: Option<&'a PitcherStats>,
    pub closer: Option<&'a PitcherStats>,
    pub tactics: f64,
    pub trust: f64,
}

/// `pub(crate)` — `data::match_session`이 연장전 규칙(§10-2)을 판단할 때
/// 재사용.
pub(crate) fn is_amateur(league_id: &str) -> bool {
    league_id != "league:pro" && league_id != "league:pro_farm"
}

/// 강판 뒤 갈라진 두 누산기(선발 몫·구원 몫)의 타자 기록을 하나로 합친다
/// — 타자 개인의 그 경기 총 성적은 상대 투수가 누구든 하나로 집계돼야
/// 하므로.
fn merge_batter_stats(mut a: HashMap<String, BatterGameStats>, b: HashMap<String, BatterGameStats>) -> HashMap<String, BatterGameStats> {
    for (id, s) in b {
        let entry = a.entry(id).or_default();
        entry.plate_appearances += s.plate_appearances;
        entry.at_bats += s.at_bats;
        entry.hits += s.hits;
        entry.doubles += s.doubles;
        entry.triples += s.triples;
        entry.home_runs += s.home_runs;
        entry.walks += s.walks;
        entry.strikeouts += s.strikeouts;
        entry.rbi += s.rbi;
        entry.stolen_bases += s.stolen_bases;
        entry.caught_stealing += s.caught_stealing;
    }
    a
}

/// `merge_batter_stats`와 같은 이유(Phase B, 대화 2026-07-25) — 강판으로
/// 갈라진 누산기의 수비 기록을 하나로. 어느 투수가 마운드에 있었는지와
/// 무관하게 같은 수비수가 계속 그 자리를 지키므로, 선발/구원/마무리
/// 단계 3개 누산기에 흩어진 같은 선수 기록을 합쳐야 한다.
fn merge_fielding_stats(mut a: HashMap<String, FieldingGameStats>, b: HashMap<String, FieldingGameStats>) -> HashMap<String, FieldingGameStats> {
    for (id, s) in b {
        let entry = a.entry(id).or_default();
        entry.chances += s.chances;
        entry.errors += s.errors;
    }
    a
}

/// 경기 한 판 — 9이닝 기본, 리그별 콜드게임·연장전 규칙(07_매치_엔진.md
/// §10-2) 적용. 타순은 로스터 순서대로 순환. 타석마다 급성형 부상도 함께
/// 판정(§13) — 이벤트만 반환하고 실제 강판 처리는 안 함(로스터 결원 로직
/// 스코프 밖, 위 InjuryEvent 문서 참고).
///
/// 강판(§6-N, "불펜 서열" 1차 축소안): 이닝 경계마다 `sim::manager::
/// should_pull_pitcher`로 판단, 팀당 게임 1회까지만(주인공 매치와 동일
/// 제약). 배경 경기는 타석 단위 시뮬이라 실제 볼카운트가 없어 "던진 타자
/// 수 × 3.8"로 투구수를 근사한다(D그룹 — 밸런스 하네스 재조정 대상).
/// 강판이 결정되는 그 이닝의 실제 스코어로 `manager::is_save_situation`을
/// 판단해 `home_plan.closer`(세이브 상황)와 `home_plan.reliever`(그 외)
/// 중 하나를 고른다(Part G) — 다만 팀당 여전히 딱 1회만 교체하므로 중계가
/// 여럿일 때의 세부 서열(셋업·추격조)까지는 이번에도 스코프 밖.
pub fn simulate_game(
    rng: &mut impl Rng,
    league_id: &str,
    home_lineup: &[BatterStats],
    home_plan: &TeamPitchingPlan,
    away_lineup: &[BatterStats],
    away_plan: &TeamPitchingPlan,
    conditions: &GameConditions,
) -> GameResult {
    let amateur = is_amateur(league_id);
    let mut home_runs = 0u32;
    let mut away_runs = 0u32;
    let mut home_idx = 0usize;
    let mut away_idx = 0usize;
    let mut inning = 1u32;
    let mut injuries = Vec::new();

    let mut home_pitcher: &PitcherStats = home_plan.starter;
    let mut away_pitcher: &PitcherStats = away_plan.starter;
    // 강판 단계(Phase 2, §6-N "불펜/홀드") — 0=선발, 1=1차 구원(reliever
    // 또는 세이브 상황이면 곧장 closer), 2=2차 구원(1차가 reliever였을
    // 때만 도달 가능, 항상 closer). "선발→중계→마무리 고정 체인"만 지원
    // (완전히 일반화된 N단계 불펜은 스코프 아웃 — 이 엔진의 포지션 분류
    // 자체가 3종뿐이라 그 이상은 의미가 없다).
    let mut home_stage: u8 = 0;
    let mut away_stage: u8 = 0;
    // 1단계가 `reliever`(마무리가 아님)였는지 — 이때만 2단계(→마무리)
    // 전환이 의미가 있다. 1단계가 이미 closer였으면(세이브 상황에 곧장
    // 등판) 더 넘길 대상이 없다.
    let mut home_first_is_reliever = false;
    let mut away_first_is_reliever = false;
    // 세이브 판정(Phase 6, §12) — 각 단계로 넘어가는 그 순간 세이브
    // 상황이었는지 기억해뒀다가, 경기가 끝난 뒤 그 팀이 리드를 지킨 채
    // 이겼으면 "그 단계로 넘어간" 투수에게 세이브를 준다(최종적으로
    // 게임을 끝낸 투수 = 가장 마지막 단계의 투수).
    let mut home_stage1_pull_was_save = false;
    let mut away_stage1_pull_was_save = false;
    let mut home_stage2_pull_was_save = false;
    let mut away_stage2_pull_was_save = false;

    // top_half_stats: away 타순이 home_pitcher(선발)를 상대하는 하프이닝
    // 누산 — pitcher는 홈 선발, batters는 원정 타자들. bottom_half_stats는
    // 반대. 강판되면 그 뒤 이닝은 단계별 누산기(*_reliever_stats_acc,
    // *_closer_stats_acc)로 전환 — season_stats에 선발·중계·마무리가
    // 서로 다른 id로 들어가야 하므로.
    let mut top_half_stats = HalfInningStats::default();
    let mut bottom_half_stats = HalfInningStats::default();
    let mut home_reliever_stats_acc = HalfInningStats::default();
    let mut away_reliever_stats_acc = HalfInningStats::default();
    let mut home_closer_stats_acc = HalfInningStats::default();
    let mut away_closer_stats_acc = HalfInningStats::default();
    loop {
        let bases = if amateur && inning > 9 { TIEBREAK_BASES } else { EMPTY_BASES };
        // 위기상황 기저값(Phase 1) — 만루 여부는 `simulate_half_inning`이
        // 타석마다 다시 판단하므로 여기선 항상 false로 넘긴다.
        let home_leverage_base = is_high_leverage_situation(false, home_runs as i32 - away_runs as i32, inning);
        let away_leverage_base = is_high_leverage_situation(false, away_runs as i32 - home_runs as i32, inning);

        away_runs += simulate_half_inning(
            rng,
            away_lineup,
            &mut away_idx,
            home_pitcher,
            bases,
            home_leverage_base,
            home_lineup,
            home_plan.tactics,
            conditions,
            &mut injuries,
            match home_stage {
                0 => &mut top_half_stats,
                1 => &mut home_reliever_stats_acc,
                _ => &mut home_closer_stats_acc,
            },
        );

        let walk_off = inning >= 9 && home_runs > away_runs;
        if !walk_off {
            home_runs += simulate_half_inning(
                rng,
                home_lineup,
                &mut home_idx,
                away_pitcher,
                bases,
                away_leverage_base,
                away_lineup,
                away_plan.tactics,
                conditions,
                &mut injuries,
                match away_stage {
                    0 => &mut bottom_half_stats,
                    1 => &mut away_reliever_stats_acc,
                    _ => &mut away_closer_stats_acc,
                },
            );
        }

        if amateur {
            let margin = (home_runs as i32 - away_runs as i32).unsigned_abs();
            if (inning >= 5 && margin >= 15) || (inning >= 7 && margin >= 10) {
                break;
            }
        }

        if inning >= 9 && home_runs != away_runs {
            break;
        }
        if !amateur && inning >= 12 {
            break; // 프로 정규시즌 12회 제한(동점이면 무승부)
        }
        if inning >= 30 {
            break; // 절대 안전장치(아마추어 승부치기가 이론상 안 끝날 경우)
        }

        if home_stage == 0 {
            let save_situation = manager::is_save_situation(inning as i64, home_runs as i64, away_runs as i64);
            let (candidate, is_reliever_pick) = if save_situation {
                match home_plan.closer {
                    Some(c) => (Some(c), false),
                    None => (home_plan.reliever, home_plan.reliever.is_some()),
                }
            } else {
                match home_plan.reliever {
                    Some(r) => (Some(r), true),
                    None => (home_plan.closer, false),
                }
            };
            if let Some(reliever) = candidate {
                let faced = top_half_stats.pitcher.outs_recorded + top_half_stats.pitcher.hits_allowed + top_half_stats.pitcher.walks;
                let approx_pitches = (faced as f64 * 3.8) as u32;
                if manager::should_pull_pitcher(rng, approx_pitches, home_plan.starter.fatigue, home_plan.tactics, home_plan.trust) {
                    home_pitcher = reliever;
                    // is_reliever_pick=false면 곧장 마무리가 등판한 것(진짜
                    // 중계가 없거나 이미 세이브 상황) — season_stats 누산기가
                    // 실제 등판한 NPC(reliever vs closer)와 일치해야 하므로
                    // stage를 1이 아니라 2로 바로 보낸다(§ 아래 "누산기 매핑
                    // 정합성" — repository.rs가 home_reliever_stats/
                    // home_closer_stats를 각각 home_reliever/home_closer
                    // npc id로 credit하므로 stage 번호가 실제 배역과 어긋나면
                    // 기록이 엉뚱한 투수에게 붙는다).
                    if is_reliever_pick {
                        home_stage = 1;
                        home_first_is_reliever = true;
                        home_stage1_pull_was_save = save_situation;
                    } else {
                        home_stage = 2;
                        home_stage2_pull_was_save = save_situation;
                    }
                }
            }
        } else if home_stage == 1 && home_first_is_reliever {
            // 2단계 전환(중계→마무리) — 1단계가 진짜 reliever였을 때만,
            // 새로 세이브 상황이 되면 즉시 발동. 애초에 계획서는 이 판단도
            // `should_pull_pitcher`(투구수 기반 강판 확률)로 하려 했으나,
            // 실측(대화 2026-07-24) 결과 중계는 보통 1~2이닝만 던지고
            // 물러나 투구수가 하드캡(약 28타자)에 거의 도달하지 못해 승격이
            // 사실상 전혀 안 일어나는 문제를 발견 — 실제 야구에서도 "세이브
            // 상황이 오면 마무리를 올린다"는 투구수와 무관한 전술적 판단이라,
            // stage 0→1 전환의 "세이브 상황이면 closer 우선"과 같은 원칙을
            // 그대로 재사용해 세이브 상황 발생 즉시 전환하도록 단순화했다.
            if let Some(closer) = home_plan.closer {
                if manager::is_save_situation(inning as i64, home_runs as i64, away_runs as i64) {
                    home_pitcher = closer;
                    home_stage = 2;
                    home_stage2_pull_was_save = true;
                }
            }
        }
        if away_stage == 0 {
            let save_situation = manager::is_save_situation(inning as i64, away_runs as i64, home_runs as i64);
            let (candidate, is_reliever_pick) = if save_situation {
                match away_plan.closer {
                    Some(c) => (Some(c), false),
                    None => (away_plan.reliever, away_plan.reliever.is_some()),
                }
            } else {
                match away_plan.reliever {
                    Some(r) => (Some(r), true),
                    None => (away_plan.closer, false),
                }
            };
            if let Some(reliever) = candidate {
                let faced = bottom_half_stats.pitcher.outs_recorded + bottom_half_stats.pitcher.hits_allowed + bottom_half_stats.pitcher.walks;
                let approx_pitches = (faced as f64 * 3.8) as u32;
                if manager::should_pull_pitcher(rng, approx_pitches, away_plan.starter.fatigue, away_plan.tactics, away_plan.trust) {
                    away_pitcher = reliever;
                    if is_reliever_pick {
                        away_stage = 1;
                        away_first_is_reliever = true;
                        away_stage1_pull_was_save = save_situation;
                    } else {
                        away_stage = 2;
                        away_stage2_pull_was_save = save_situation;
                    }
                }
            }
        } else if away_stage == 1 && away_first_is_reliever {
            if let Some(closer) = away_plan.closer {
                if manager::is_save_situation(inning as i64, away_runs as i64, home_runs as i64) {
                    away_pitcher = closer;
                    away_stage = 2;
                    away_stage2_pull_was_save = true;
                }
            }
        }

        inning += 1;
    }

    let home_won = home_runs > away_runs;
    let away_won = away_runs > home_runs;
    match home_stage {
        1 if home_stage1_pull_was_save && home_won => home_reliever_stats_acc.pitcher.saves += 1,
        2 if home_stage2_pull_was_save && home_won => home_closer_stats_acc.pitcher.saves += 1,
        _ => {}
    }
    match away_stage {
        1 if away_stage1_pull_was_save && away_won => away_reliever_stats_acc.pitcher.saves += 1,
        2 if away_stage2_pull_was_save && away_won => away_closer_stats_acc.pitcher.saves += 1,
        _ => {}
    }
    // 홀드(Phase 2) — 진짜 중계(1단계, `home_first_is_reliever`)가 2단계
    // (마무리)로 넘어갔고(그 자체가 이미 "새로 세이브 상황이 됐을 때"만
    // 발동하도록 위 전환 블록에서 게이팅됨 — `home_stage1_pull_was_save`,
    // 즉 "1단계로 들어온 순간"이 세이브 상황이었는지는 무관하다: 선발이
    // 지쳐 이른 이닝에 교체된 흔한 경우엔 애초에 세이브 상황일 수 없음),
    // 팀이 리드를 지킨 채 이겼으면 그 중계투수에게 홀드.
    if home_stage == 2 && home_first_is_reliever && home_won {
        home_reliever_stats_acc.pitcher.holds += 1;
    }
    if away_stage == 2 && away_first_is_reliever && away_won {
        away_reliever_stats_acc.pitcher.holds += 1;
    }

    GameResult {
        home_runs,
        away_runs,
        injuries,
        home_pitcher_stats: top_half_stats.pitcher,
        away_pitcher_stats: bottom_half_stats.pitcher,
        // `home_first_is_reliever`(closer가 아니라 진짜 reliever가 실제로
        // 등판했는지)로 게이팅 — `home_stage`만 보면 곧장 closer로 넘어간
        // 경우(stage 2지만 reliever는 한 이닝도 안 던짐)까지 잘못 포함돼
        // repository.rs가 등판 안 한 reliever에게 빈 기록을 얹는 사고가 난다.
        home_reliever_stats: home_first_is_reliever.then_some(home_reliever_stats_acc.pitcher),
        away_reliever_stats: away_first_is_reliever.then_some(away_reliever_stats_acc.pitcher),
        home_closer_stats: (home_stage == 2).then_some(home_closer_stats_acc.pitcher),
        away_closer_stats: (away_stage == 2).then_some(away_closer_stats_acc.pitcher),
        home_batter_stats: merge_batter_stats(
            merge_batter_stats(bottom_half_stats.batters, away_reliever_stats_acc.batters),
            away_closer_stats_acc.batters,
        ),
        away_batter_stats: merge_batter_stats(
            merge_batter_stats(top_half_stats.batters, home_reliever_stats_acc.batters),
            home_closer_stats_acc.batters,
        ),
        // top_half_stats(원정 타자 vs 홈 투수)의 `.fielders`는 그 타석들을
        // 처리한 "홈" 수비수들 — 배터 쪽과 팀이 반대로 뒤집힘에 주의.
        home_fielding_stats: merge_fielding_stats(
            merge_fielding_stats(top_half_stats.fielders, home_reliever_stats_acc.fielders),
            home_closer_stats_acc.fielders,
        ),
        away_fielding_stats: merge_fielding_stats(
            merge_fielding_stats(bottom_half_stats.fielders, away_reliever_stats_acc.fielders),
            away_closer_stats_acc.fielders,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn avg_batter() -> BatterStats {
        BatterStats {
            id: "b".to_string(),
            contact: 50.0,
            eye: 50.0,
            power: 50.0,
            fatigue: 0.0,
            clutch: 50.0,
            composure: 50.0,
            defense: 50.0,
            speed: 50.0,
            handedness: Handedness::Right,
            position: "유격수".to_string(),
        }
    }
    fn avg_pitcher() -> PitcherStats {
        PitcherStats { id: "p".to_string(), control: 50.0, stuff: 50.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right }
    }
    /// 강판을 신경 쓰지 않는 기존 테스트들이 계속 완투 동작을 보게 하는
    /// 헬퍼 — `reliever: None`이면 `simulate_game`이 절대 강판하지 않는다.
    fn no_pull_plan(starter: &PitcherStats) -> TeamPitchingPlan<'_> {
        TeamPitchingPlan { starter, reliever: None, closer: None, tactics: 50.0, trust: 50.0 }
    }

    #[test]
    fn same_seed_produces_identical_game_result() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let mut rng1 = ChaCha8Rng::seed_from_u64(11);
        let a = simulate_game(&mut rng1, "league:hs", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()), &GameConditions::default());
        let mut rng2 = ChaCha8Rng::seed_from_u64(11);
        let b = simulate_game(&mut rng2, "league:hs", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()), &GameConditions::default());
        assert_eq!(a.home_runs, b.home_runs);
        assert_eq!(a.away_runs, b.away_runs);
        assert_eq!(a.injuries, b.injuries);
        assert_eq!(a.home_pitcher_stats, b.home_pitcher_stats);
        assert_eq!(a.away_pitcher_stats, b.away_pitcher_stats);
        assert_eq!(a.home_batter_stats, b.home_batter_stats);
        assert_eq!(a.away_batter_stats, b.away_batter_stats);
    }

    #[test]
    fn pitcher_stats_runs_allowed_matches_the_opposing_teams_score() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()), &GameConditions::default());
            assert_eq!(r.away_pitcher_stats.runs_allowed, r.home_runs, "seed={seed}");
            assert_eq!(r.home_pitcher_stats.runs_allowed, r.away_runs, "seed={seed}");
        }
    }

    #[test]
    fn simulate_game_pulls_a_starter_over_a_full_game_when_a_reliever_is_available() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let starter = avg_pitcher();
        let reliever = PitcherStats { id: "reliever".to_string(), control: 50.0, stuff: 50.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right };
        let mut pulled_at_least_once = false;
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let home_plan = TeamPitchingPlan { starter: &starter, reliever: Some(&reliever), closer: None, tactics: 50.0, trust: 50.0 };
            let away_starter = avg_pitcher();
            let away_plan = no_pull_plan(&away_starter);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &home_plan, &lineup, &away_plan, &GameConditions::default());
            // 강판이 일어나도 팀 총 실점·타자 rbi 합 불변식은 그대로 유지돼야 한다.
            assert_eq!(r.away_pitcher_stats.runs_allowed, r.home_runs, "seed={seed}");
            let home_rbi: u32 = r.home_batter_stats.values().map(|b| b.rbi).sum();
            assert_eq!(home_rbi, r.home_runs, "seed={seed}");
            if r.home_reliever_stats.is_some() {
                pulled_at_least_once = true;
                break;
            }
        }
        assert!(pulled_at_least_once, "expected at least one seed to pull the starter over a full 9-inning game");
    }

    #[test]
    fn simulate_game_pulls_a_starter_into_the_closer_slot_when_only_a_closer_is_available() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let starter = avg_pitcher();
        let closer = PitcherStats { id: "closer".to_string(), control: 50.0, stuff: 50.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right };
        let mut pulled_at_least_once = false;
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let home_plan = TeamPitchingPlan { starter: &starter, reliever: None, closer: Some(&closer), tactics: 50.0, trust: 50.0 };
            let away_starter = avg_pitcher();
            let away_plan = no_pull_plan(&away_starter);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &home_plan, &lineup, &away_plan, &GameConditions::default());
            if r.home_closer_stats.is_some() {
                pulled_at_least_once = true;
                break;
            }
        }
        assert!(pulled_at_least_once, "reliever가 없어도 closer가 비세이브 상황 폴백으로 쓰여 강판이 일어나야 함");
    }

    /// Phase 6(§12 "세이브") — 마무리가 세이브 상황에 등판해 리드를
    /// 지키고 경기를 끝내면 세이브가 기록돼야 한다.
    #[test]
    fn a_closer_entering_a_save_situation_and_finishing_ahead_earns_a_save() {
        let strong_lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("sb{i}"), power: 80.0, contact: 80.0, ..avg_batter() }).collect();
        let weak_lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("wb{i}"), power: 20.0, contact: 20.0, ..avg_batter() }).collect();
        let elite_starter = PitcherStats { id: "starter".to_string(), control: 80.0, stuff: 80.0, ..avg_pitcher() };
        let closer = PitcherStats { id: "closer".to_string(), control: 80.0, stuff: 80.0, ..avg_pitcher() };
        let weak_away_starter = PitcherStats { id: "away".to_string(), control: 20.0, stuff: 20.0, ..avg_pitcher() };

        let mut saved_at_least_once = false;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let home_plan = TeamPitchingPlan { starter: &elite_starter, reliever: None, closer: Some(&closer), tactics: 50.0, trust: 50.0 };
            let away_plan = no_pull_plan(&weak_away_starter);
            let r = simulate_game(&mut rng, "league:pro", &strong_lineup, &home_plan, &weak_lineup, &away_plan, &GameConditions::default());
            if r.home_closer_stats.as_ref().is_some_and(|s| s.saves > 0) {
                saved_at_least_once = true;
                break;
            }
        }
        assert!(saved_at_least_once, "압도적인 우세 상황에서도 50개 시드 내내 세이브가 한 번도 안 나옴");
    }

    /// Phase 2(§12 "홀드") — 2단계 교체(선발→중계→마무리)가 실제로
    /// 일어나면 중간에 빠지는 중계투수에게 홀드가 붙어야 한다. 투수
    /// 능력치는 평균(성적 자체를 왜곡하지 않도록)으로 두고, 대신 감독
    /// 성향(공격적 전술·낮은 신뢰)으로 강판 캡을 낮춰 강판이 여러 번
    /// 일어나기 쉽게 만든다(`fatigue`를 극단으로 올리면 캡은 낮아지지만
    /// 그 투수 자체의 실제 피칭 성능도 같이 망가져 리드를 잡기 어려워짐 —
    /// 별개 경로로 시도했다가 200시드 내내 실패해 이 방식으로 교체).
    #[test]
    fn a_reliever_promoted_to_closer_while_leading_earns_a_hold() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let starter = PitcherStats { id: "starter".to_string(), ..avg_pitcher() };
        let reliever = PitcherStats { id: "reliever".to_string(), ..avg_pitcher() };
        let closer = PitcherStats { id: "closer".to_string(), ..avg_pitcher() };
        let away_starter = avg_pitcher();

        let mut held_at_least_once = false;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let home_plan = TeamPitchingPlan { starter: &starter, reliever: Some(&reliever), closer: Some(&closer), tactics: 100.0, trust: 0.0 };
            let away_plan = no_pull_plan(&away_starter);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &home_plan, &lineup, &away_plan, &GameConditions::default());
            if r.home_reliever_stats.as_ref().is_some_and(|s| s.holds > 0) {
                held_at_least_once = true;
                // 홀드를 받은 중계는 그 자체로는 세이브를 못 받아야 한다
                // (넘겨준 쪽이지 게임을 끝낸 쪽이 아니므로).
                assert_eq!(r.home_reliever_stats.as_ref().unwrap().saves, 0, "seed={seed}");
                assert!(r.home_closer_stats.is_some(), "홀드가 나왔으면 마무리도 등판했어야 함, seed={seed}");
                break;
            }
        }
        assert!(held_at_least_once, "50개 시드 내내 홀드가 한 번도 안 나옴");
    }

    #[test]
    fn simulate_game_never_pulls_when_no_reliever_is_available() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        // 극단적으로 지친 투수라도 reliever: None이면 강판이 아예 불가능해야 한다.
        let exhausted = PitcherStats { id: "p".to_string(), control: 50.0, stuff: 50.0, fatigue: 200.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right };
        for seed in 0..10u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&exhausted), &lineup, &no_pull_plan(&exhausted), &GameConditions::default());
            assert!(r.home_reliever_stats.is_none(), "seed={seed}");
            assert!(r.away_reliever_stats.is_none(), "seed={seed}");
        }
    }

    #[test]
    fn batter_rbi_sums_to_the_teams_runs_scored() {
        // Phase 2부터는 실책으로 들어온 득점(비자책, ReachOnError)엔 타자에게
        // RBI를 안 주므로(실제 야구 규칙), "RBI 합 == 득점"이 아니라
        // "RBI 합 + 상대 투수(+구원)의 비자책점 합 == 득점"이 불변식이 된다.
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()), &GameConditions::default());
            let home_rbi: u32 = r.home_batter_stats.values().map(|b| b.rbi).sum();
            let away_rbi: u32 = r.away_batter_stats.values().map(|b| b.rbi).sum();
            let away_pitching_unearned =
                r.away_pitcher_stats.unearned_runs + r.away_reliever_stats.as_ref().map(|s| s.unearned_runs).unwrap_or(0);
            let home_pitching_unearned =
                r.home_pitcher_stats.unearned_runs + r.home_reliever_stats.as_ref().map(|s| s.unearned_runs).unwrap_or(0);
            assert_eq!(home_rbi + away_pitching_unearned, r.home_runs, "seed={seed}");
            assert_eq!(away_rbi + home_pitching_unearned, r.away_runs, "seed={seed}");
        }
    }

    /// Phase 6(§12) — 타율·출루율·장타율·OPS 파생 스탯 계산이 정석 야구
    /// 공식과 일치하는지 손으로 계산한 값과 대조.
    #[test]
    fn batter_game_stats_derived_percentages_match_hand_calculated_values() {
        // 10타수 4안타(2루타 1·3루타 1·홈런 1·단타 1)·2볼넷.
        let s = BatterGameStats {
            plate_appearances: 12,
            at_bats: 10,
            hits: 4,
            doubles: 1,
            triples: 1,
            home_runs: 1,
            walks: 2,
            strikeouts: 0,
            rbi: 0,
            stolen_bases: 0,
            caught_stealing: 0,
        };
        assert!((s.batting_average() - 0.4).abs() < 1e-9, "avg={}", s.batting_average());
        // OBP = (4+2)/(10+2) = 0.5
        assert!((s.on_base_percentage() - 0.5).abs() < 1e-9, "obp={}", s.on_base_percentage());
        // 총루타 = 단타1×1 + 2루타1×2 + 3루타1×3 + 홈런1×4 = 10, SLG = 10/10 = 1.0
        assert!((s.slugging_percentage() - 1.0).abs() < 1e-9, "slg={}", s.slugging_percentage());
        assert!((s.ops() - 1.5).abs() < 1e-9, "ops={}", s.ops());
    }

    #[test]
    fn batter_game_stats_derived_percentages_are_zero_with_no_at_bats() {
        let s = BatterGameStats::default();
        assert_eq!(s.batting_average(), 0.0);
        assert_eq!(s.on_base_percentage(), 0.0);
        assert_eq!(s.slugging_percentage(), 0.0);
        assert_eq!(s.ops(), 0.0);
    }

    #[test]
    fn stronger_pitcher_allows_fewer_hits_on_average() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let weak_pitcher = PitcherStats { id: "wp".to_string(), control: 25.0, stuff: 25.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right };
        let strong_pitcher = PitcherStats { id: "sp".to_string(), control: 75.0, stuff: 75.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right };

        let mut weak_hits = 0u32;
        let mut strong_hits = 0u32;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r1 = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&weak_pitcher), &lineup, &no_pull_plan(&weak_pitcher), &GameConditions::default());
            weak_hits += r1.home_pitcher_stats.hits_allowed + r1.away_pitcher_stats.hits_allowed;
            let mut rng2 = ChaCha8Rng::seed_from_u64(seed);
            let r2 = simulate_game(&mut rng2, "league:pro", &lineup, &no_pull_plan(&strong_pitcher), &lineup, &no_pull_plan(&strong_pitcher), &GameConditions::default());
            strong_hits += r2.home_pitcher_stats.hits_allowed + r2.away_pitcher_stats.hits_allowed;
        }
        assert!(strong_hits < weak_hits, "strong={strong_hits} weak={weak_hits}");
    }

    #[test]
    fn stronger_batting_lineup_scores_more_on_average() {
        let weak_lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("w{i}"), contact: 25.0, eye: 25.0, power: 25.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0, speed: 50.0, handedness: Handedness::Right, position: "유격수".to_string() }).collect();
        let strong_lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("s{i}"), contact: 75.0, eye: 75.0, power: 75.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0, speed: 50.0, handedness: Handedness::Right, position: "유격수".to_string() }).collect();

        let mut weak_total = 0u32;
        let mut strong_total = 0u32;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r1 = simulate_game(&mut rng, "league:pro", &weak_lineup, &no_pull_plan(&avg_pitcher()), &weak_lineup, &no_pull_plan(&avg_pitcher()), &GameConditions::default());
            weak_total += r1.home_runs + r1.away_runs;
            let mut rng2 = ChaCha8Rng::seed_from_u64(seed);
            let r2 = simulate_game(&mut rng2, "league:pro", &strong_lineup, &no_pull_plan(&avg_pitcher()), &strong_lineup, &no_pull_plan(&avg_pitcher()), &GameConditions::default());
            strong_total += r2.home_runs + r2.away_runs;
        }
        assert!(strong_total > weak_total, "strong={strong_total} weak={weak_total}");
    }

    #[test]
    fn amateur_cold_game_stops_before_nine_innings_on_blowout() {
        // extreme mismatch should trigger the 5-inning/15-run cold-game rule at least sometimes
        let elite: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("e{i}"), contact: 80.0, eye: 80.0, power: 80.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0, speed: 50.0, handedness: Handedness::Right, position: "유격수".to_string() }).collect();
        let hapless: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("h{i}"), contact: 20.0, eye: 20.0, power: 20.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0, speed: 50.0, handedness: Handedness::Right, position: "유격수".to_string() }).collect();
        let elite_pitcher = PitcherStats { id: "ep".to_string(), control: 80.0, stuff: 80.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right };
        let hapless_pitcher = PitcherStats { id: "hp".to_string(), control: 20.0, stuff: 20.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right };

        let mut saw_cold_game = false;
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:hs", &elite, &no_pull_plan(&elite_pitcher), &hapless, &no_pull_plan(&hapless_pitcher), &GameConditions::default());
            if r.home_runs.max(r.away_runs) - r.home_runs.min(r.away_runs) >= 15 {
                saw_cold_game = true;
            }
        }
        assert!(saw_cold_game, "expected at least one blowout across 20 seeds");
    }

    #[test]
    fn pro_game_never_exceeds_twelve_innings_worth_of_scoring_pressure() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        for seed in 0..10u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()), &GameConditions::default());
            // just confirm it terminates and produces a result — the 12-inning cap
            // guarantees termination even on repeated ties.
            assert!(r.home_runs < 100 && r.away_runs < 100);
        }
    }

    #[test]
    fn high_fatigue_players_accumulate_injuries_over_many_games() {
        let lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("fb{i}"), contact: 50.0, eye: 50.0, power: 50.0, fatigue: 200.0, clutch: 50.0, composure: 50.0, defense: 50.0, speed: 50.0, handedness: Handedness::Right, position: "유격수".to_string() }).collect();
        let pitcher = PitcherStats { id: "fp".to_string(), control: 50.0, stuff: 50.0, fatigue: 200.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: Handedness::Right };

        let mut total_injuries = 0usize;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&pitcher), &lineup, &no_pull_plan(&pitcher), &GameConditions::default());
            total_injuries += r.injuries.len();
        }
        assert!(total_injuries > 0, "expected at least one acute injury across 50 games of heavily fatigued players");
    }

    #[test]
    fn zero_fatigue_players_rarely_get_injured_in_a_single_game() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let mut rng = ChaCha8Rng::seed_from_u64(0);
        let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()), &GameConditions::default());
        assert!(r.injuries.len() < 3, "a single low-fatigue game should almost never produce multiple injuries, got {}", r.injuries.len());
    }

    #[test]
    fn fatigue_effective_decays_toward_zero_as_fatigue_rises_but_never_below_zero() {
        assert_eq!(fatigue_effective(70.0, 0.0), 70.0, "0 피로도는 원래 능력치 그대로여야 함");
        let mid = fatigue_effective(70.0, 50.0);
        let high = fatigue_effective(70.0, 100.0);
        assert!(mid < 70.0 && high < mid, "mid={mid} high={high}");
        assert!(fatigue_effective(5.0, 100.0) >= 0.0, "실효치는 0 밑으로 안 내려가야 함");
    }

    #[test]
    fn fatigued_pitcher_allows_more_hits_than_a_fresh_pitcher_with_identical_base_stats() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let fresh = PitcherStats { id: "fresh".to_string(), fatigue: 0.0, ..avg_pitcher() };
        let tired = PitcherStats { id: "tired".to_string(), fatigue: 100.0, ..avg_pitcher() };

        let mut fresh_hits = 0u32;
        let mut tired_hits = 0u32;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r1 = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&fresh), &lineup, &no_pull_plan(&fresh), &GameConditions::default());
            fresh_hits += r1.home_pitcher_stats.hits_allowed + r1.away_pitcher_stats.hits_allowed;
            let mut rng2 = ChaCha8Rng::seed_from_u64(seed);
            let r2 = simulate_game(&mut rng2, "league:pro", &lineup, &no_pull_plan(&tired), &lineup, &no_pull_plan(&tired), &GameConditions::default());
            tired_hits += r2.home_pitcher_stats.hits_allowed + r2.away_pitcher_stats.hits_allowed;
        }
        assert!(tired_hits > fresh_hits, "tired={tired_hits} fresh={fresh_hits}");
    }

    #[test]
    fn higher_velocity_pitcher_strikes_out_more_batters_on_average() {
        let batter = avg_batter();
        let low_velo = PitcherStats { velocity: 20.0, ..avg_pitcher() };
        let high_velo = PitcherStats { velocity: 80.0, ..avg_pitcher() };

        let count_strikeouts = |pitcher: &PitcherStats| -> u32 {
            let mut k = 0;
            for seed in 0..2000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if simulate_plate_appearance(&mut rng, &batter, pitcher, [false; 3], 0, &[], 50.0, false, &GameConditions::default()).outcome == PaOutcome::Strikeout {
                    k += 1;
                }
            }
            k
        };
        let low_k = count_strikeouts(&low_velo);
        let high_k = count_strikeouts(&high_velo);
        assert!(high_k > low_k, "high_velo_k={high_k} low_velo_k={low_k}");
    }

    #[test]
    fn higher_game_management_pitcher_walks_fewer_batters_on_average() {
        let batter = avg_batter();
        let low_gm = PitcherStats { game_management: 20.0, ..avg_pitcher() };
        let high_gm = PitcherStats { game_management: 80.0, ..avg_pitcher() };

        let count_walks = |pitcher: &PitcherStats| -> u32 {
            let mut bb = 0;
            for seed in 0..2000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if simulate_plate_appearance(&mut rng, &batter, pitcher, [false; 3], 0, &[], 50.0, false, &GameConditions::default()).outcome == PaOutcome::Walk {
                    bb += 1;
                }
            }
            bb
        };
        let low_bb = count_walks(&low_gm);
        let high_bb = count_walks(&high_gm);
        assert!(high_bb < low_bb, "high_gm_bb={high_bb} low_gm_bb={low_bb}");
    }

    #[test]
    fn clutch_only_shifts_outcomes_when_the_situation_is_high_leverage() {
        let clutch_pitcher = PitcherStats { clutch: 80.0, ..avg_pitcher() };
        let cold_batter = BatterStats { clutch: 20.0, ..avg_batter() };

        // 평상시(high_leverage=false)엔 클러치가 개입하지 않으므로, 클러치
        // 격차가 아무리 커도 평범한 상대와 결과가 완전히 동일해야 한다.
        for seed in 0..30u64 {
            let mut rng_a = ChaCha8Rng::seed_from_u64(seed);
            let mut rng_b = ChaCha8Rng::seed_from_u64(seed);
            let a = simulate_plate_appearance(&mut rng_a, &cold_batter, &clutch_pitcher, [false; 3], 0, &[], 50.0, false, &GameConditions::default());
            let b = simulate_plate_appearance(&mut rng_b, &cold_batter, &avg_pitcher(), [false; 3], 0, &[], 50.0, false, &GameConditions::default());
            assert_eq!(a, b, "seed={seed}: high_leverage=false면 클러치가 결과에 개입하면 안 됨");
        }
    }

    #[test]
    fn double_play_never_happens_without_a_runner_on_first() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        for seed in 0..5u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let outcome = resolve_in_play_result(&mut rng, &batter, &pitcher, [false, true, true], 0, &[], 50.0, false, &GameConditions::default()).outcome;
            assert_ne!(outcome, PaOutcome::DoublePlay, "seed={seed}");
        }
    }

    #[test]
    fn double_play_never_happens_with_two_outs_already() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        for seed in 0..5u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let outcome = resolve_in_play_result(&mut rng, &batter, &pitcher, [true, false, false], 2, &[], 50.0, false, &GameConditions::default()).outcome;
            assert_ne!(outcome, PaOutcome::DoublePlay, "seed={seed}");
        }
    }

    #[test]
    fn double_play_can_happen_with_a_runner_on_first_and_fewer_than_two_outs() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        let found = (0..2000u64).any(|seed| {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            resolve_in_play_result(&mut rng, &batter, &pitcher, [true, false, false], 0, &[], 50.0, false, &GameConditions::default()).outcome == PaOutcome::DoublePlay
        });
        assert!(found, "expected at least one seed to produce a double play with a runner on first and 0 outs");
    }

    #[test]
    fn sac_fly_never_happens_without_a_runner_on_third() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        for seed in 0..5u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let outcome = resolve_in_play_result(&mut rng, &batter, &pitcher, [true, true, false], 0, &[], 50.0, false, &GameConditions::default()).outcome;
            assert_ne!(outcome, PaOutcome::SacFly, "seed={seed}");
        }
    }

    #[test]
    fn sac_fly_can_happen_with_a_runner_on_third_and_fewer_than_two_outs() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        let found = (0..2000u64).any(|seed| {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            resolve_in_play_result(&mut rng, &batter, &pitcher, [false, false, true], 1, &[], 50.0, false, &GameConditions::default()).outcome == PaOutcome::SacFly
        });
        assert!(found, "expected at least one seed to produce a sac fly with a runner on third and 1 out");
    }

    #[test]
    fn lower_team_defense_produces_more_reach_on_error_outcomes_on_average() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        // 대화 2026-07-25부터 실책 확률은 "그 타구를 처리한 포지션" 개인
        // 수비 스탯을 쓴다(팀 평균이 아니라) — 7자리 전부 같은 수비력으로
        // 채워두면 어느 포지션이 뽑히든 항상 그 값이 적용돼 기존 "팀
        // 평균 수비력" 테스트 취지를 그대로 유지할 수 있다.
        let count_errors = |defense: f64| -> u32 {
            let fielding_lineup: Vec<BatterStats> = ["1루수", "2루수", "3루수", "유격수", "좌익수", "중견수", "우익수"]
                .iter()
                .map(|position| BatterStats { defense, position: position.to_string(), ..avg_batter() })
                .collect();
            let mut errors = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if resolve_in_play_result(&mut rng, &batter, &pitcher, [false; 3], 0, &fielding_lineup, 50.0, false, &GameConditions::default()).outcome == PaOutcome::ReachOnError {
                    errors += 1;
                }
            }
            errors
        };
        let bad_defense_errors = count_errors(20.0);
        let good_defense_errors = count_errors(80.0);
        assert!(bad_defense_errors > good_defense_errors, "bad={bad_defense_errors} good={good_defense_errors}");
    }

    #[test]
    fn average_defense_falls_back_to_neutral_for_an_empty_lineup() {
        assert_eq!(average_defense(&[]), 50.0);
    }

    #[test]
    fn roll_fielder_position_never_picks_pitcher_or_catcher() {
        // 대화 2026-07-25 — 투수·포수는 스코프에서 제외(실제로 타구를
        // 처리하는 일이 드묾). 세 타구 유형 전부에서 500회씩 굴려 확인.
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        for batted in [BattedBallType::GroundBall, BattedBallType::FlyBall, BattedBallType::LineDrive] {
            for _ in 0..500 {
                let pos = roll_fielder_position(&mut rng, batted);
                assert!(!["투수", "포수"].contains(&pos), "batted={batted:?} pos={pos}");
            }
        }
    }

    #[test]
    fn roll_fielder_position_stays_within_the_infield_for_ground_balls_and_outfield_for_fly_balls() {
        let mut rng = ChaCha8Rng::seed_from_u64(2);
        const INFIELD: [&str; 4] = ["1루수", "2루수", "3루수", "유격수"];
        const OUTFIELD: [&str; 3] = ["좌익수", "중견수", "우익수"];
        for _ in 0..300 {
            assert!(INFIELD.contains(&roll_fielder_position(&mut rng, BattedBallType::GroundBall)));
            assert!(OUTFIELD.contains(&roll_fielder_position(&mut rng, BattedBallType::FlyBall)));
        }
    }

    #[test]
    fn fielder_defense_at_uses_the_individual_players_stat_when_present() {
        let lineup = vec![
            BatterStats { defense: 20.0, position: "유격수".to_string(), ..avg_batter() },
            BatterStats { defense: 90.0, position: "1루수".to_string(), ..avg_batter() },
        ];
        assert_eq!(fielder_defense_at(&lineup, "유격수"), 20.0);
        assert_eq!(fielder_defense_at(&lineup, "1루수"), 90.0);
    }

    #[test]
    fn fielder_defense_at_falls_back_to_team_average_when_the_position_is_missing() {
        let lineup = vec![BatterStats { defense: 40.0, position: "1루수".to_string(), ..avg_batter() }, BatterStats { defense: 60.0, position: "2루수".to_string(), ..avg_batter() }];
        // "유격수"가 라인업에 없음(부상 결원 등 가정) — 팀 평균(50.0)으로 폴백.
        assert_eq!(fielder_defense_at(&lineup, "유격수"), 50.0);
    }

    #[test]
    fn a_shortstop_with_worse_defense_than_the_rest_of_the_lineup_produces_more_errors_on_ground_balls() {
        // 팀 평균 수비력 대신 "그 포지션 선수 개인" 수비 스탯이 실제로
        // 쓰이는지 확인 — 유격수만 수비가 나쁜 라인업 vs 유격수만 수비가
        // 좋은 라인업을 비교(나머지 포지션은 고정 평균값이라 땅볼이 우연히
        // 다른 포지션으로 갔을 때는 두 라인업의 실책률에 차이가 없어야
        // 하지만, 표본이 크면 유격수 몫만큼 격차가 드러난다).
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        let lineup_with = |ss_defense: f64| -> Vec<BatterStats> {
            [("1루수", 50.0), ("2루수", 50.0), ("3루수", 50.0), ("유격수", ss_defense), ("좌익수", 50.0), ("중견수", 50.0), ("우익수", 50.0)]
                .iter()
                .map(|(position, defense)| BatterStats { defense: *defense, position: position.to_string(), ..avg_batter() })
                .collect()
        };
        let bad_ss = lineup_with(10.0);
        let good_ss = lineup_with(90.0);
        let count_errors = |fielding_lineup: &[BatterStats]| -> u32 {
            let mut errors = 0;
            for seed in 0..5000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if resolve_in_play_result(&mut rng, &batter, &pitcher, [false; 3], 0, fielding_lineup, 50.0, false, &GameConditions::default()).outcome == PaOutcome::ReachOnError {
                    errors += 1;
                }
            }
            errors
        };
        let bad_errors = count_errors(&bad_ss);
        let good_errors = count_errors(&good_ss);
        assert!(bad_errors > good_errors, "bad_ss_errors={bad_errors} good_ss_errors={good_errors}");
    }

    #[test]
    fn average_speed_falls_back_to_neutral_for_an_empty_lineup() {
        assert_eq!(average_speed(&[]), 50.0);
    }

    #[test]
    fn faster_teams_take_the_extra_base_more_often_on_a_single() {
        let count_extra_base_scores = |team_speed: f64| -> u32 {
            let mut scores = 0;
            for seed in 0..2000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                // 2루 주자 + 단타 — 기본 진루는 3루까지, 추가진루(홈)만 득점으로 잡힌다.
                let mut bases = [false, true, false];
                let runs = advance_runners_realistic(&mut rng, &mut bases, 1, 0, team_speed);
                scores += runs;
            }
            scores
        };
        let slow_scores = count_extra_base_scores(20.0);
        let fast_scores = count_extra_base_scores(80.0);
        assert!(fast_scores > slow_scores, "fast={fast_scores} slow={slow_scores}");
    }

    #[test]
    fn attempt_steal_never_fires_for_a_very_slow_team() {
        let mut none_count = 0;
        for seed in 0..500u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            if attempt_steal(&mut rng, 0.0, 50.0, 50.0).is_none() {
                none_count += 1;
            }
        }
        assert!(none_count > 450, "a team with 0 speed should almost never attempt a steal, got {none_count}/500 no-attempts");
    }

    #[test]
    fn attempt_steal_fires_often_for_a_very_fast_team() {
        let some_count = (0..500u64)
            .filter(|&seed| {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                attempt_steal(&mut rng, 100.0, 50.0, 50.0).is_some()
            })
            .count();
        assert!(some_count > 0, "a team with 100 speed should attempt steals at least sometimes");
    }

    #[test]
    fn higher_pitcher_game_management_lowers_the_steal_success_rate() {
        let count_successes = |game_management: f64| -> u32 {
            let mut successes = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if attempt_steal(&mut rng, 90.0, game_management, 50.0) == Some(true) {
                    successes += 1;
                }
            }
            successes
        };
        let low_gm_successes = count_successes(20.0);
        let high_gm_successes = count_successes(80.0);
        assert!(low_gm_successes > high_gm_successes, "low_gm={low_gm_successes} high_gm={high_gm_successes}");
    }

    #[test]
    fn simulate_half_inning_records_stolen_bases_over_many_games_with_a_fast_lineup() {
        // 빠른 팀(스피드 90) vs 평범한 투수 — 여러 하프이닝을 굴려 도루가
        // 실제로 발생하고 season_stats 라인에 기록되는지 확인.
        let fast_lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), speed: 90.0, ..avg_batter() }).collect();
        let pitcher = avg_pitcher();
        let mut total_sb = 0u32;
        for seed in 0..300u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let mut idx = 0usize;
            let mut injuries = Vec::new();
            let mut stats = HalfInningStats::default();
            simulate_half_inning(&mut rng, &fast_lineup, &mut idx, &pitcher, EMPTY_BASES, false, &[], 50.0, &GameConditions::default(), &mut injuries, &mut stats);
            total_sb += stats.batters.values().map(|b| b.stolen_bases).sum::<u32>();
        }
        assert!(total_sb > 0, "expected at least one stolen base across 300 half-innings with a fast lineup");
    }

    #[test]
    fn simulate_half_inning_credits_fielding_chances_only_to_the_lineup_position_that_fielded_the_ball() {
        // Phase B(대화 2026-07-25) — 실제 7자리(포수 포함 8자리 라인업, 포수는
        // 수비 후보에서 제외됨을 겸사겸사 확인) 수비 라인업을 세워 여러
        // 하프이닝을 돌리면 내야·외야 7자리에만 수비 기회가 쌓이고 포수는
        // 절대 안 쌓여야 한다.
        let batting_lineup: Vec<BatterStats> = (0..9).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let fielding_lineup: Vec<BatterStats> = ["포수", "1루수", "2루수", "3루수", "유격수", "좌익수", "중견수", "우익수"]
            .iter()
            .enumerate()
            .map(|(i, pos)| BatterStats { id: format!("f{i}"), position: pos.to_string(), ..avg_batter() })
            .collect();
        let catcher_id = fielding_lineup[0].id.clone();
        let pitcher = avg_pitcher();

        let mut total_chances = 0u32;
        let mut fielders_seen: HashMap<String, FieldingGameStats> = HashMap::new();
        for seed in 0..200u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let mut idx = 0usize;
            let mut injuries = Vec::new();
            let mut stats = HalfInningStats::default();
            simulate_half_inning(
                &mut rng,
                &batting_lineup,
                &mut idx,
                &pitcher,
                EMPTY_BASES,
                false,
                &fielding_lineup,
                50.0,
                &GameConditions::default(),
                &mut injuries,
                &mut stats,
            );
            for (id, line) in stats.fielders {
                total_chances += line.chances;
                let entry = fielders_seen.entry(id).or_default();
                entry.chances += line.chances;
                entry.errors += line.errors;
            }
        }
        assert!(total_chances > 0, "200 하프이닝이면 인플레이 타구가 최소 한 번은 있어야 함");
        assert!(!fielders_seen.contains_key(&catcher_id), "포수는 수비 후보에서 제외돼 기회를 받으면 안 됨");
        assert_eq!(fielders_seen.len(), 7, "내야 4자리 + 외야 3자리 전부 최소 한 번씩은 기회를 받아야 함(200회면 충분)");
    }

    // Phase 5 — 수비 시프트 + 구장 파크팩터 + 날씨.

    #[test]
    fn park_factor_multiplier_matches_the_documented_three_values() {
        assert_eq!(park_factor_multiplier(Some("타자친화")), 1.15);
        assert_eq!(park_factor_multiplier(Some("투수친화")), 0.85);
        assert_eq!(park_factor_multiplier(Some("중립")), 1.0);
        assert_eq!(park_factor_multiplier(None), 1.0, "구세이브·합성 테스트는 중립 폴백");
        assert_eq!(park_factor_multiplier(Some("알수없음")), 1.0, "알 수 없는 값도 중립 폴백");
    }

    #[test]
    fn hitter_friendly_park_produces_more_home_runs_than_pitcher_friendly() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        let count_hr = |park_factor: f64| -> u32 {
            let conditions = GameConditions { park_factor, ..GameConditions::default() };
            let mut hrs = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if resolve_in_play_result(&mut rng, &batter, &pitcher, EMPTY_BASES, 0, &[], 50.0, false, &conditions).outcome == PaOutcome::HomeRun {
                    hrs += 1;
                }
            }
            hrs
        };
        let pitcher_friendly = count_hr(0.85);
        let hitter_friendly = count_hr(1.15);
        assert!(hitter_friendly > pitcher_friendly, "hitter_friendly={hitter_friendly} pitcher_friendly={pitcher_friendly}");
    }

    #[test]
    fn classify_batting_type_tags_dominant_stats_correctly() {
        let power_batter = BatterStats { power: 90.0, contact: 40.0, speed: 40.0, eye: 40.0, ..avg_batter() };
        assert_eq!(classify_batting_type(&power_batter), BattingTypeTag::Power);

        let contact_batter = BatterStats { power: 40.0, contact: 90.0, speed: 40.0, eye: 40.0, ..avg_batter() };
        assert_eq!(classify_batting_type(&contact_batter), BattingTypeTag::Contact);

        let speed_batter = BatterStats { power: 40.0, contact: 40.0, speed: 90.0, eye: 40.0, ..avg_batter() };
        assert_eq!(classify_batting_type(&speed_batter), BattingTypeTag::Speed);

        let patient_batter = BatterStats { power: 40.0, contact: 40.0, speed: 40.0, eye: 90.0, ..avg_batter() };
        assert_eq!(classify_batting_type(&patient_batter), BattingTypeTag::Patient);

        let all_round_batter = avg_batter();
        assert_eq!(classify_batting_type(&all_round_batter), BattingTypeTag::AllRound);

        let spray_batter = BatterStats { power: 65.0, contact: 65.0, speed: 40.0, eye: 40.0, ..avg_batter() };
        assert_eq!(classify_batting_type(&spray_batter), BattingTypeTag::Spray);
    }

    /// `resolve_in_play_result`를 몬테카를로로 돌리면 파워형·스프레이형의
    /// `power` 스탯 자체가 달라 `power_edge`(시프트와 무관한 안타 확률)까지
    /// 같이 움직여 시프트 효과만 분리해 보기 어렵다 — 순수 함수인
    /// `shift_bonus`를 직접 비교(§6-1 "파워형=시프트 강하게, 스프레이형=약함").
    #[test]
    fn shift_bonus_is_stronger_for_power_hitters_than_spray_hitters() {
        let power_batter = BatterStats { power: 90.0, contact: 40.0, speed: 40.0, eye: 40.0, ..avg_batter() };
        let spray_batter = BatterStats { power: 65.0, contact: 65.0, speed: 40.0, eye: 40.0, ..avg_batter() };
        assert!(shift_bonus(&power_batter, 50.0) > shift_bonus(&spray_batter, 50.0));
        assert_eq!(shift_bonus(&spray_batter, 50.0), 0.0, "스프레이형은 시프트가 완전히 무력화돼야 함");
    }

    #[test]
    fn higher_manager_tactics_strengthens_the_shift_against_power_hitters() {
        let power_batter = BatterStats { power: 90.0, contact: 40.0, speed: 40.0, eye: 40.0, ..avg_batter() };
        assert!(
            shift_bonus(&power_batter, 80.0) > shift_bonus(&power_batter, 20.0),
            "높은 전술력일수록 파워형 상대 시프트가 더 강해야 함"
        );
    }

    #[test]
    fn roll_weather_produces_every_documented_condition_over_many_seeds() {
        let mut seen = std::collections::HashSet::new();
        for seed in 0..500u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            seen.insert(roll_weather(&mut rng));
        }
        for w in [Weather::Clear, Weather::Cloudy, Weather::Rain, Weather::Wind, Weather::Hot] {
            assert!(seen.contains(&w), "{w:?} never rolled across 500 seeds");
        }
    }

    #[test]
    fn rainy_weather_reduces_effective_control_and_thus_raises_walks() {
        let pitcher = PitcherStats { control: 30.0, ..avg_pitcher() };
        let batter = avg_batter();
        let count_walks = |conditions: &GameConditions| -> u32 {
            let mut walks = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if simulate_plate_appearance(&mut rng, &batter, &pitcher, EMPTY_BASES, 0, &[], 50.0, false, conditions).outcome == PaOutcome::Walk {
                    walks += 1;
                }
            }
            walks
        };
        let clear_walks = count_walks(&GameConditions::default());
        let rainy = GameConditions { weather_control_mod: -6.0, ..GameConditions::default() };
        let rainy_walks = count_walks(&rainy);
        assert!(rainy_walks >= clear_walks, "rainy={rainy_walks} clear={clear_walks}");
    }

    /// Phase 7(정합성 점검) — 배경 엔진(`simulate_plate_appearance`, PA레벨
    /// 확률식)과 인터랙티브 엔진(`sim::pitch::simulate_at_bat_automatically`,
    /// 1구 단위 볼카운트 시뮬)이 **완전히 다른 공식**(§11 "시뮬레이션
    /// 해상도와 표시 해상도는 별개")이라는 걸 전제로, 그래도 같은 "평균적인
    /// 투타 대결"을 넣었을 때 결과 분포가 극단적으로 안 갈라지는지 확인하는
    /// 회귀 테스트. 마스터리 3단계(중립)·다양성 없음·평균 스탯·중립
    /// 환경으로 맞춰 "배경 엔진엔 아예 없는 개념"(마스터리·다양성, Phase 4)
    /// 을 배제하고 순수하게 공유 판정식(`resolve_in_play_result`·`fatigue_effective`·
    /// `platoon_edge_for_pitcher` 등)만 비교 대상에 남긴다.
    ///
    /// **볼카운트 판정 공식 수치 스케일 확정(2026-07-26, I8 스코프 항목
    /// 착수)** — 처음 실측(5000시행)했을 땐 배경 K=20.8%·BB=8.2%·Hit=20.5%
    /// 인데 인터랙티브는 K=11.7%·BB=10.9%·Hit=22.7%로 K 배분이 크게
    /// 갈라졌다(9.1%p 차). `throw_pitch`의 존 안 헛스윙 확률 기준치를
    /// `0.15`→`0.19`로 살짝만 올려 K 격차를 7.0%p로 좁혔다(K=13.8%·
    /// BB=11.2%·Hit=21.9%) — 더 크게 올리면(예: 0.30) 격차는 거의 사라지지만
    /// (K=19.8%) `sim::eval::grade_outing`이 실점만으로 등급을 매기는 구조상
    /// **완봉(0실점)은 `expected_runs` 값과 무관하게 항상 ratio=0으로 S를
    /// 받는다** — 즉 완봉 확률이 오르면 등급 경계 수치를 아무리 조정해도
    /// S등급 비율의 하한선 자체가 같이 올라간다(수학적으로 등급 경계
    /// 재설계로는 못 막음, `sim::eval` 모듈 문서 참고). `balance_harness --
    /// 15 3`(100경기)로 실측: 0.15(원본) S=6.5%, 0.19(채택) S=10.0%, 0.30
    /// S=14.0~29.0% — 0.19가 "K 격차 개선 대비 S등급 인플레이션"의
    /// 합리적인 절충점이라 판단해 이 값으로 확정. 계수를 완전히 맞추러
    /// 들지 않은 건 여전함(D그룹 placeholder, 나머지 조정은 I8 스코프) —
    /// 이번엔 "확정"이 아니라 "완봉 인플레이션이 감당 가능한 선까지만
    /// 절충".
    #[test]
    fn background_and_interactive_engines_agree_within_a_reasonable_tolerance() {
        use crate::sim::pitch::{self, PitchMastery};
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        let conditions = GameConditions::default();
        let repertoire = vec![PitchMastery { name: "포심 패스트볼".to_string(), stage: 3 }];
        let trials = 5000u64;

        let (mut bg_k, mut bg_bb, mut bg_hit) = (0u32, 0u32, 0u32);
        let (mut it_k, mut it_bb, mut it_hit) = (0u32, 0u32, 0u32);
        for seed in 0..trials {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            match simulate_plate_appearance(&mut rng, &batter, &pitcher, EMPTY_BASES, 0, &[], 50.0, false, &conditions).outcome {
                PaOutcome::Strikeout => bg_k += 1,
                PaOutcome::Walk | PaOutcome::HitByPitch => bg_bb += 1,
                PaOutcome::Single | PaOutcome::Double | PaOutcome::Triple | PaOutcome::HomeRun => bg_hit += 1,
                _ => {}
            }
            // 배경 쪽과 시드를 겹치지 않게 오프셋을 줘서 같은 난수 스트림을
            // 재사용하는 우연한 상관을 피한다.
            let mut rng2 = ChaCha8Rng::seed_from_u64(seed + 10_000_000);
            let (outcome, _pitch_count) =
                pitch::simulate_at_bat_automatically(&mut rng2, &repertoire, &pitcher, &batter, EMPTY_BASES, 0, &[], 50.0, false, &conditions);
            match outcome {
                PaOutcome::Strikeout => it_k += 1,
                PaOutcome::Walk | PaOutcome::HitByPitch => it_bb += 1,
                PaOutcome::Single | PaOutcome::Double | PaOutcome::Triple | PaOutcome::HomeRun => it_hit += 1,
                _ => {}
            }
        }

        let rate = |c: u32| c as f64 / trials as f64;
        let (bg_k_rate, bg_bb_rate, bg_hit_rate) = (rate(bg_k), rate(bg_bb), rate(bg_hit));
        let (it_k_rate, it_bb_rate, it_hit_rate) = (rate(it_k), rate(it_bb), rate(it_hit));

        const TOLERANCE: f64 = 0.08;
        assert!(
            (bg_k_rate - it_k_rate).abs() < TOLERANCE,
            "삼진율이 두 엔진 사이에서 너무 크게 갈라짐: 배경={bg_k_rate:.3} 인터랙티브={it_k_rate:.3}"
        );
        assert!(
            (bg_bb_rate - it_bb_rate).abs() < TOLERANCE,
            "볼넷율이 두 엔진 사이에서 너무 크게 갈라짐: 배경={bg_bb_rate:.3} 인터랙티브={it_bb_rate:.3}"
        );
        assert!(
            (bg_hit_rate - it_hit_rate).abs() < TOLERANCE,
            "안타율이 두 엔진 사이에서 너무 크게 갈라짐: 배경={bg_hit_rate:.3} 인터랙티브={it_hit_rate:.3}"
        );
    }
}

