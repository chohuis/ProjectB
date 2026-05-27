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
    #[serde(rename = "STRIKE_SWING")]   StrikeSwing,
    #[serde(rename = "STRIKE_LOOK")]    StrikeLook,
    #[serde(rename = "BALL")]           Ball,
    #[serde(rename = "FOUL")]           Foul,
    #[serde(rename = "INPLAY_OUT")]     InplayOut,
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
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PartialPitcherStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
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
pub struct MatchStepResult {
    pub next_state: MatchState,
    pub outcome: PitchOutcome,
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
