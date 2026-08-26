use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// ── 기본 열거형 ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HalfInning {
    #[serde(rename = "top")] Top,
    #[serde(rename = "bottom")] Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitcherRole {
    SP, RP, CP,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchType {
    #[serde(rename = "fastball")]   Fastball,
    #[serde(rename = "sinker")]     Sinker,
    #[serde(rename = "cutter")]     Cutter,
    #[serde(rename = "slider")]     Slider,
    #[serde(rename = "curve")]      Curve,
    #[serde(rename = "changeup")]   Changeup,
    #[serde(rename = "splitter")]   Splitter,
    #[serde(rename = "forkball")]   Forkball,
    #[serde(rename = "screwball")]  Screwball,
    #[serde(rename = "knuckleball")]Knuckleball,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchStrategy {
    #[serde(rename = "aggressive")] Aggressive,
    #[serde(rename = "balanced")]   Balanced,
    #[serde(rename = "safe")]       Safe,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchPower {
    #[serde(rename = "low")]    Low,
    #[serde(rename = "normal")] Normal,
    #[serde(rename = "high")]   High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WeatherType {
    #[serde(rename = "sunny")]     Sunny,
    #[serde(rename = "cloudy")]    Cloudy,
    #[serde(rename = "rainy")]     Rainy,
    #[serde(rename = "windy_in")]  WindyIn,
    #[serde(rename = "windy_out")] WindyOut,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ParkType {
    #[serde(rename = "neutral")]      Neutral,
    #[serde(rename = "pitcher_park")] PitcherPark,
    #[serde(rename = "hitter_park")]  HitterPark,
    #[serde(rename = "dome")]         Dome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FieldPosition {
    P, C,
    #[serde(rename = "1B")] B1,
    #[serde(rename = "2B")] B2,
    #[serde(rename = "3B")] B3,
    SS, LF, CF, RF,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BallHitType {
    #[serde(rename = "groundBall")] GroundBall,
    #[serde(rename = "flyBall")]    FlyBall,
    #[serde(rename = "lineDrive")]  LineDrive,
    #[serde(rename = "popup")]      Popup,
    #[serde(rename = "bunt")]       Bunt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchResultCode {
    /// 스트라이크 — **투구 하나의 결과**다. 3스트라이크째면 아래 삼진으로 좁힌다.
    #[serde(rename = "STRIKE_SWING")]   StrikeSwing,
    #[serde(rename = "STRIKE_LOOK")]    StrikeLook,
    /// 삼진 — **타자가 물러났다.**
    ///
    /// 🔴 예전엔 이게 없어서 3스트라이크째에도 `StrikeLook`이 그대로 나갔다.
    ///   화면은 "루킹"이라고만 했고 **타자가 아웃된 걸 말할 방법이 없었다.**
    ///   인플레이 아웃이 넷으로 쪼개진 것과 같은 이유다(`narrow_inplay_out`).
    #[serde(rename = "STRIKEOUT_SWING")] StrikeoutSwing,
    #[serde(rename = "STRIKEOUT_LOOK")]  StrikeoutLook,
    #[serde(rename = "BALL")]           Ball,
    #[serde(rename = "FOUL")]           Foul,
    /// 인플레이 아웃 — **중간값이다.** 타구 종류와 병살 여부가 정해지기 전
    /// 단계에서만 쓰고, 최종 결과로는 아래 넷 중 하나로 좁힌다
    /// (`narrow_inplay_out`). 화면이 "아웃!" 하나로만 받던 시절의 코드다.
    #[serde(rename = "INPLAY_OUT")]     InplayOut,
    #[serde(rename = "GROUND_OUT")]     GroundOut,
    #[serde(rename = "FLY_OUT")]        FlyOut,
    #[serde(rename = "LINE_OUT")]       LineOut,
    #[serde(rename = "DOUBLE_PLAY")]    DoublePlay,
    #[serde(rename = "FIELDING_ERROR")] FieldingError,
    #[serde(rename = "HIT_SINGLE")]     HitSingle,
    #[serde(rename = "HIT_DOUBLE")]     HitDouble,
    #[serde(rename = "HIT_TRIPLE")]     HitTriple,
    #[serde(rename = "HOME_RUN")]       HomeRun,
    #[serde(rename = "WALK")]           Walk,
    #[serde(rename = "GAME_OVER")]      GameOver,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ExitReason {
    #[serde(rename = "pitch_limit")]  PitchLimit,
    #[serde(rename = "stamina")]      Stamina,
    #[serde(rename = "performance")]  Performance,
    #[serde(rename = "tactical")]     Tactical,
}

// ── 좌표 ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct XY {
    pub x: f64,
    pub y: f64,
}

// ── 스탯 구조체 ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PitcherStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub command: f64,
    pub velocity: f64,
    #[serde(rename = "staminaCap")]   pub stamina_cap: f64,
    #[serde(rename = "mentalResil")]  pub mental_resil: f64,
    pub control: f64,
    pub movement: f64,
    pub clutch: f64,
    #[serde(rename = "holdRunners")] pub hold_runners: f64,
    /// 보유 구종. **비면 패스트볼 하나로 던진다** (구 세이브·데이터 결손 대비).
    ///
    /// ⚠ 예전엔 이 필드가 아예 없었고 `auto_pick_decision`이 Fastball/Slider/
    /// Changeup을 하드코딩으로 뽑았다 — **너클볼을 마스터해도 안 던졌다.**
    #[serde(default)]
    pub arsenal: Vec<ArsenalPitch>,
}

/// 보유 구종 한 종. `grade`는 1~5 숙련도다.
///
/// 숙련도는 **두 곳에 걸린다** (설계 확정): 선택 빈도와 공의 품질.
/// 그래야 "주무기"가 저절로 생기고 경기 로그가 읽힌다.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ArsenalPitch {
    #[serde(rename = "type")]
    pub pitch_type: PitchType,
    pub grade: u8,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PartialPitcherStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// 보유 구종. 안 넘기면 패스트볼 하나로 던진다
    #[serde(default)]
    pub arsenal: Option<Vec<ArsenalPitch>>,
    /// **지금 익히는 중인 구종의 난이도** (0~3). 있으면 제구가 흔들린다.
    /// `pitch_catalog.json`의 `formDifficulty`가 정본이다.
    #[serde(default)]
    pub developing_difficulty: Option<f64>,
    pub command: Option<f64>,
    pub velocity: Option<f64>,
    #[serde(rename = "staminaCap")]  pub stamina_cap: Option<f64>,
    #[serde(rename = "mentalResil")] pub mental_resil: Option<f64>,
    pub control: Option<f64>,
    pub movement: Option<f64>,
    pub clutch: Option<f64>,
    #[serde(rename = "holdRunners")] pub hold_runners: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatterStats {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
    pub discipline: f64,
    #[serde(rename = "battingClutch")] pub batting_clutch: f64,
    pub platoon: f64,
    pub speed: f64,
    #[serde(rename = "baseInstinct")] pub base_instinct: f64,
    pub fielding: f64,
    pub arm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerStats {
    pub speed: f64,
    pub instinct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchRunners {
    pub first: Option<RunnerStats>,
    pub second: Option<RunnerStats>,
    pub third: Option<RunnerStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchCount {
    pub balls: u8,
    pub strikes: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchScore {
    pub home: i32,
    pub away: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InningScores {
    pub home: Vec<i32>,
    pub away: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagerStats {
    #[serde(rename = "tacticalIQ")]     pub tactical_iq: f64,
    #[serde(rename = "bullpenRead")]    pub bullpen_read: f64,
    #[serde(rename = "offenseMind")]    pub offense_mind: f64,
    pub motivator: f64,
    #[serde(rename = "clutchDecision")] pub clutch_decision: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PartialManagerStats {
    #[serde(rename = "tacticalIQ")]     pub tactical_iq: Option<f64>,
    #[serde(rename = "bullpenRead")]    pub bullpen_read: Option<f64>,
    #[serde(rename = "offenseMind")]    pub offense_mind: Option<f64>,
    pub motivator: Option<f64>,
    #[serde(rename = "clutchDecision")] pub clutch_decision: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcPitcherTracker {
    pub my: f64,
    pub opponent: f64,
}

/// 한 팀의 투수진 — 선발 → 불펜 → 마무리 순.
///
/// ⚠ **비어 있으면 예전 동작이다.** 기존 단일 `my_npc_pitcher` /
/// `opponent_npc_pitcher`를 그대로 쓴다. 통합(C단계)을 한 번에 바꾸지 않고
/// 큐가 채워진 쪽만 새 경로를 타게 해서, 어긋나면 어디서인지 좁힐 수 있게 한다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitcherQueue {
    /// 등판 순서대로. 0번이 선발이다
    #[serde(default)]
    pub pitchers: Vec<PartialPitcherStats>,
    /// 지금 던지는 투수의 인덱스
    #[serde(default)]
    pub current: usize,
    /// 투수별 최대 아웃 수 — `sim_max_outs` 상당. 비면 상한 없음
    #[serde(default)]
    pub max_outs: Vec<i32>,
    /// 현재 투수가 잡은 아웃
    #[serde(default)]
    pub outs_by_current: i32,
    /// 투수별 누적 기록 (C-2). 큐와 같은 순서다 — 비면 아무것도 안 쌓는다
    #[serde(default)]
    pub lines: Vec<PitcherLineAccum>,
    /// 리그 투구수 상한 (고교 105 · 그 외 120). 0이면 상한 없음
    #[serde(default)]
    pub pitch_limit: f64,
}

/// 투수 한 명의 경기 기록 (C-2) — `npc_sim::PitAccum`과 같은 항목이다.
///
/// ⚠ **지금 엔진은 주인공 것만 쌓는다**(`k_since_entry` 등). 교체된 투수들의
/// 성적이 안 남아서, 통합하면 리그 순위표·성적표가 통째로 빈다.
/// `sim_game`은 `PitAccum`/`BatAccum`으로 전원을 쌓아 `player_lines`를 만든다 —
/// 그 계약을 만족해야 순위표가 안 깨진다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitcherLineAccum {
    pub player_id: String,
    pub outs: i32,
    pub er: i32,
    pub h: i32,
    pub k: i32,
    pub bb: i32,
    pub pc: i32,
    pub risp_ab: i32,
    pub risp_h: i32,
}

/// 타자 한 명의 경기 기록 (C-3) — `npc_sim::BatAccum`과 같은 항목이다.
///
/// ⚠ **투수만 쌓으면 순위표의 절반이 빈다.** 타율·홈런·타점왕이 안 나오고
/// 팀 득점도 선수별로 안 갈린다. `sim_game`은 `BatAccum`으로 전원을 쌓는다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatterLineAccum {
    pub player_id: String,
    pub ab: i32,
    pub h: i32,
    pub hr: i32,
    pub rbi: i32,
    pub bb: i32,
    pub k: i32,
    pub sb: i32,
    pub risp_ab: i32,
    pub risp_h: i32,
}

impl PitcherQueue {
    pub fn is_empty(&self) -> bool { self.pitchers.is_empty() }
    /// 지금 투수를 바꿔야 하는가 — 아웃 한계 **또는 투구수 상한**을 넘었을 때.
    ///
    /// ⚠ **투구수도 봐야 한다.** 아웃 한계만 보면 7이닝에 114구를 던진 선발이
    /// 그대로 남는다(실측). 고교 상한이 105구라 그 전에 내려가야 한다 —
    /// `sim_game`은 아웃만 보지만 이쪽 엔진엔 투구수 개념이 이미 있다.
    pub fn should_switch(&self) -> bool {
        let pitch_limit = self.pitch_limit;
        if self.pitchers.is_empty() { return false; }
        if self.current + 1 >= self.pitchers.len() { return false; }
        let over_outs = match self.max_outs.get(self.current) {
            Some(&m) if m > 0 => self.outs_by_current >= m,
            _ => false,
        };
        let over_pitches = self.lines.get(self.current)
            .map(|l| pitch_limit > 0.0 && l.pc as f64 >= pitch_limit)
            .unwrap_or(false);
        over_outs || over_pitches
    }
    pub fn advance(&mut self) {
        if self.current + 1 < self.pitchers.len() {
            self.current += 1;
            self.outs_by_current = 0;
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FielderStats {
    pub position: FieldPosition,
    pub name: String,
    pub fielding: f64,
    pub arm: f64,
    pub speed: f64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefenseStat {
    pub errors: u32,
    pub assists: u32,
    #[serde(rename = "throwOuts")]  pub throw_outs: u32,
    #[serde(rename = "throwSafes")] pub throw_safes: u32,
}

// ── 타자 스탯 누적 (인터랙티브 경기용) ───────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BatterStatAccum {
    pub pa: u32,
    pub ab: u32,
    pub h: u32,
    pub hr: u32,
    pub rbi: u32,
    pub bb: u32,
    pub k: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatterLine {
    pub player_id: String,
    pub pa: u32,
    pub ab: u32,
    pub h: u32,
    pub hr: u32,
    pub rbi: u32,
    pub bb: u32,
    pub k: u32,
}

// ── 등판 조건 ─────────────────────────────────────────────────────────────────
fn default_score_diff_cap() -> i32 { 6 }
fn default_min_lead_diff()   -> i32 { 1 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum EntryTrigger {
    #[serde(rename = "inning_start")]
    InningStart { inning: u8 },
    #[serde(rename = "mid_inning")]
    MidInning {
        inning: u8,
        #[serde(rename = "maxOuts")] max_outs: u8,
        #[serde(rename = "scoreDiffCap", default = "default_score_diff_cap")] score_diff_cap: i32,
    },
    #[serde(rename = "close_game")]
    CloseGame {
        #[serde(rename = "inningThreshold")] inning_threshold: u8,
        #[serde(rename = "maxLeadDiff")]     max_lead_diff: i32,
        #[serde(rename = "minLeadDiff", default = "default_min_lead_diff")] min_lead_diff: i32,
    },
    #[serde(rename = "manual")]
    Manual { inning: u8, half: HalfInning, outs: u8, runners: MatchRunners },
}

// ── 인플레이 ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BallInPlay {
    #[serde(rename = "hitType")]  pub hit_type: BallHitType,
    pub zone: FieldPosition,
    pub hardness: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldingResult {
    pub fielder: FielderStats,
    #[serde(rename = "isError")]           pub is_error: bool,
    #[serde(rename = "threwTo", skip_serializing_if = "Option::is_none")]
    pub threw_to: Option<FieldPosition>,
    #[serde(rename = "throwResult", skip_serializing_if = "Option::is_none")]
    pub throw_result: Option<String>,
    #[serde(rename = "runnerExtraAdvance")] pub runner_extra_advance: i32,
}

// ── 애니메이션 큐 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AnimationCue {
    #[serde(rename = "ball_pitch")]
    BallPitch { from: XY, to: XY, duration: u32 },
    #[serde(rename = "ball_batted")]
    BallBatted { from: XY, to: XY, arc: f64, #[serde(rename = "hitType")] hit_type: BallHitType, duration: u32 },
    #[serde(rename = "fielder_move")]
    FielderMove { position: FieldPosition, to: XY, duration: u32 },
    #[serde(rename = "ball_throw")]
    BallThrow { from: XY, to: XY, duration: u32 },
    #[serde(rename = "runner_advance")]
    RunnerAdvance {
        #[serde(rename = "runnerId")] runner_id: String,
        #[serde(rename = "toBase")]   to_base: String,
        duration: u32,
    },
    #[serde(rename = "show_result")]
    ShowResult { text: String, tone: String, x: f64, y: f64 },
}

// ── 전체 경기 상태 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchState {
    pub match_id: String,
    pub inning: u8,
    pub inning_limit: u8,
    pub half: HalfInning,
    pub outs: u8,
    pub count: MatchCount,
    pub runners: MatchRunners,
    pub score: MatchScore,
    pub inning_scores: InningScores,
    pub pitch_count: u32,
    /// 이 경기의 투구수 상한 (리그별 — 고교 105 / 그 외 120, Phase 5-8).
    /// 세이브 호환을 위해 default: 미지정이면 0이고 그때는 전역 상수로 떨어진다.
    #[serde(default)]
    pub pitch_limit: f64,
    #[serde(default)]
    pub pitch_soft: f64,

    pub protagonist_side: String,

    pub protagonist_pitcher: PitcherStats,
    pub my_npc_pitcher: PitcherStats,
    pub opponent_npc_pitcher: PitcherStats,

    pub home_lineup: Vec<BatterStats>,
    pub away_lineup: Vec<BatterStats>,
    pub home_lineup_index: usize,
    pub away_lineup_index: usize,
    pub batter_mean: f64,

    pub role: PitcherRole,
    pub entry_trigger: EntryTrigger,
    pub protagonist_has_entered: bool,
    pub protagonist_exited: bool,
    pub pitch_count_since_entry: u32,
    pub protagonist_stamina: f64,
    pub protagonist_mental: f64,
    #[serde(default)]
    pub k_since_entry: u32,
    #[serde(default)]
    pub h_since_entry: u32,
    #[serde(default)]
    pub bb_since_entry: u32,
    #[serde(default)]
    pub outs_since_entry: u32,
    /// 등판 중 실점. **자책/비자책을 구분하지 않는다** — 이 모델엔 실책 실점을
    /// 따로 추적할 근거가 얇다. 예전엔 이 필드가 아예 없어서 호출측이
    /// `피안타 × 0.35`로 자책점을 **역산**했고, 피안타가 부풀면 ERA가 그대로
    /// 따라 올라갔다(실측 ERA 14.78)
    #[serde(default)]
    pub er_since_entry: u32,

    /// 타자 기록 (C-3) — 홈/원정. 비면 아무것도 안 쌓는다
    #[serde(default)]
    pub home_bat_lines: Vec<BatterLineAccum>,
    #[serde(default)]
    pub away_bat_lines: Vec<BatterLineAccum>,
    /// 투수진 — **비면 예전 동작**(단일 npc 투수)이다 (C-1)
    #[serde(default)]
    pub my_queue: PitcherQueue,
    #[serde(default)]
    pub opponent_queue: PitcherQueue,
    pub npc_pitcher_stamina: NpcPitcherTracker,
    pub npc_pitcher_mental: NpcPitcherTracker,
    pub npc_pitcher_pitch_count: NpcPitcherTracker,

    pub inherited_runners: MatchRunners,

    pub my_manager: ManagerStats,
    pub opponent_manager: ManagerStats,
    pub mound_visits_left: i32,
    pub last_mound_visit_pitch: i32,

    pub pre_entry_logs: Vec<String>,
    pub last_pitch_types: Vec<PitchType>,

    pub weather: WeatherType,
    pub park: ParkType,

    pub is_finished: bool,
    pub logs: Vec<String>,
    pub fielders: Vec<FielderStats>,
    pub defense_stat: DefenseStat,
    #[serde(default)]
    pub batter_accum: HashMap<String, BatterStatAccum>,

    /// 난수 씨앗 — **0이면 씨앗을 안 쓴다**(`thread_rng`, 매번 다른 결과).
    ///
    /// 리그 경기는 씨앗을 넘겨 **같은 세이브를 다시 열어도 같은 결과**가
    /// 나오게 한다. 주인공 경기는 아직 안 넘긴다 — "세이브를 다시 열어
    /// 운을 다시 굴릴 수 있게 할 것인가"는 게임 설계 판단이라 따로 정한다.
    ///
    /// ⚠ **경기가 진행되면 이 값을 갱신한다.** 안 그러면 `simToGameEnd`를
    /// 두 번 부를 때 같은 난수를 다시 쓴다.
    /// 세이브 호환을 위해 `default` — 옛 세이브엔 이 필드가 없고 그때 0이다.
    #[serde(default)]
    pub rng_seed: u64,
}

// ── 투구 결정 / 결과 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchDecision {
    pub pitch_type: PitchType,
    pub location: u8,
    pub target: Option<XY>,
    pub strategy: PitchStrategy,
    pub power: PitchPower,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchOutcome {
    pub result_code: PitchResultCode,
    pub quality: f64,
    pub comment: String,
    pub ball_in_play: Option<BallInPlay>,
    pub fielding_result: Option<FieldingResult>,
    pub animation_cues: Vec<AnimationCue>,
    pub landing_target: XY,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidGameInjury {
    pub injury_type: String,   // InjuryType ID
    pub severity: String,      // "light" | "moderate" | "severe"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchStepResult {
    pub next_state: MatchState,
    pub outcome: PitchOutcome,
    pub mid_game_injury: Option<MidGameInjury>,
    /// 사람이 읽는 문장만. 도루·주루·실책 같은 **한 투구 안에서 벌어진 부수 사건**이다.
    /// 개발자용 한 줄(`build_pitch_log`)은 여기 안 섞는다 — 화면이 그대로 찍는다.
    pub narrative_logs: Vec<String>,
}

// ── 반이닝 시뮬 결과 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtBatLog {
    pub pitcher_name: String,
    pub batter_name: String,
    pub result_code: PitchResultCode,
    pub pitch_count: u32,
    pub runs_scored: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HalfInningSimResult {
    pub next_state: MatchState,
    pub runs: i32,
    pub hits: i32,
    pub walks: i32,
    pub strikeouts: i32,
    pub logs: Vec<String>,
    pub at_bats: Vec<AtBatLog>,
}

// ── 게임 페이즈 결과 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "phase")]
pub enum GamePhaseResult {
    #[serde(rename = "pre_entry_sim")]   PreEntrySim,
    #[serde(rename = "protagonist_entry")] ProtagonistEntry { state: MatchState },
    #[serde(rename = "protagonist_pitch")] ProtagonistPitch,
    #[serde(rename = "auto_batting")]    AutoBatting { result: HalfInningSimResult },
    #[serde(rename = "protagonist_exit")]
    ProtagonistExit { reason: ExitReason, state: MatchState },
    #[serde(rename = "post_exit_sim")]   PostExitSim,
    #[serde(rename = "game_over")]       GameOver { state: MatchState, summary: String },
}

// ── 강판 판단 ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistExitCheck {
    pub should_exit: bool,
    pub reason: Option<ExitReason>,
}

// ── startMatch 옵션 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MatchStartOptions {
    pub match_id: Option<String>,
    /// 이 경기가 속한 리그 — 투구수 상한이 리그별이다 (Phase 5-8)
    pub league_id: Option<String>,
    pub inning_limit: Option<u8>,
    pub protagonist_side: Option<String>,
    pub role: Option<PitcherRole>,
    pub entry_trigger: Option<EntryTrigger>,
    pub protagonist_pitcher: Option<PartialPitcherStats>,
    pub pitcher: Option<PartialPitcherStats>,           // legacy alias
    pub opponent_pitcher: Option<PartialPitcherStats>,
    pub npc_starter_pitcher: Option<PartialPitcherStats>,
    pub home_lineup: Option<Vec<BatterStats>>,
    pub away_lineup: Option<Vec<BatterStats>>,
    pub opponent_lineup: Option<Vec<BatterStats>>,      // legacy
    pub my_team_lineup: Option<Vec<BatterStats>>,
    pub batter_mean: Option<f64>,
    pub initial_stamina: Option<f64>,
    pub initial_mental: Option<f64>,
    pub my_manager: Option<PartialManagerStats>,
    pub opponent_manager: Option<PartialManagerStats>,
    pub weather: Option<WeatherType>,
    pub park: Option<ParkType>,
    pub fielders: Option<Vec<FielderStats>>,
    /// 투수진 (C-1). 안 주면 예전처럼 단일 투수로 돈다
    #[serde(default)]
    pub my_pitchers: Option<Vec<PartialPitcherStats>>,
    #[serde(default)]
    pub opponent_pitchers: Option<Vec<PartialPitcherStats>>,
    /// 난수 씨앗 — **안 주면 `thread_rng`**(예전 그대로 매번 다른 결과).
    ///
    /// 리그 경기(`gameSimulator.ts`)가 넘긴다. 주인공 경기는 안 넘긴다.
    /// ⚠ **0은 "씨앗 없음"으로 친다** — `MatchState.rng_seed`가 그 규약이다
    #[serde(default)]
    pub seed: Option<u64>,
}

// ── 헤드리스 게임 시뮬 파라미터 ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSimpleGameParams {
    pub pitcher: Option<PartialPitcherStats>,
    pub opponent_ovr: f64,
    pub protagonist_ovr: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSummary {
    pub home_score: i32,
    pub away_score: i32,
    pub strikeouts: i32,
    pub hits: i32,
    pub walks: i32,
    pub at_bat_logs: Vec<AtBatLog>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishMatchResult {
    pub next_state: MatchState,
    pub summary: String,
    pub batter_lines: Vec<BatterLine>,
    pub protagonist_entered: bool,
}
