use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// ── NPC 능력치 ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPitchingAttrs {
    pub ovr: f64,
    pub stamina: f64,
    pub velocity: f64,
    pub command: f64,
    pub control: f64,
    pub movement: f64,
    pub mentality: f64,
    pub recovery: f64,
    pub clutch: f64,
    pub hold_runners: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcBattingAttrs {
    pub ovr: f64,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPitchEntry {
    pub id: String,
    pub grade: u8,   // 1~5
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPitchTraining {
    pub pitch_id: String,
    pub progress: f64,   // 0.0 ~ 100.0
    pub is_new: bool,    // true: 발견(새 구종), false: 등급 업
}

// ── NPC 커리어 기록 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcCareerEntry {
    pub year: i32,
    pub league_id: String,
    pub team_id: String,
    pub stat_line: String,
    pub highlights: Vec<String>,
}

// ── NPC 저장 상태 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcSaveState {
    pub npc_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_en: Option<String>,
    pub player_type: String,
    pub position: String,
    pub age: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grade: Option<u8>,
    pub school_id: String,
    pub graduation_year: i32,
    pub career_status: String,
    pub current_league: String,
    pub current_team: String,
    pub military_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military_enlist_year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military_discharge_year: Option<i32>,
    #[serde(default)]
    pub current_salary: i64,
    #[serde(default = "default_one")]
    pub contract_years: i32,
    #[serde(default)]
    pub sports_unit_selected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military_unit: Option<String>,       // "sports" | "general"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_league_id: Option<String>,  // 입대 전 리그 (전역 시 복귀)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_team_id: Option<String>,    // 입대 전 팀 (전역 시 복귀)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitching: Option<NpcPitchingAttrs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batting: Option<NpcBattingAttrs>,
    pub development_rate: i32,
    #[serde(default = "default_potential")]
    pub potential_hidden: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pro_service_years: Option<i32>,
    pub career_history: Vec<NpcCareerEntry>,
    pub achievements: Vec<String>,
    #[serde(default)]
    pub fame: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub personality: Option<NpcPersonality>,
}

// ── 시즌 종료 요약 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonEndSummary {
    pub retired_count: i32,
    pub military_enlisted_count: i32,
    pub military_discharged_count: i32,
    pub fa_count: i32,
    pub univ_graduated_count: i32,
    #[serde(default)]
    pub military_enlisted_sports: Vec<String>,   // 체육부대 입대자 이름
    #[serde(default)]
    pub military_enlisted_general: Vec<String>,  // 일반부대 입대자 이름
    #[serde(default)]
    pub military_discharged_names: Vec<String>,  // 전역자 이름
}

// ── 오프시즌 처리 결과 (mailboxEntry는 TS에서 생성) ──────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffseasonOutput {
    pub npcs: Vec<NpcSaveState>,
    pub pending_draft: Vec<NpcSaveState>,
    pub summary: SeasonEndSummary,
    pub logs: Vec<String>,
}

// ── 학년 진급 결과 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeAdvanceResult {
    pub updated: Vec<NpcSaveState>,
    pub graduated: Vec<NpcSaveState>,
}

// ── 신입생 생성 파라미터 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateFreshmenParams {
    pub school_id: String,
    pub team_id: String,
    pub annual_roster_size: i32,
    pub pitching_ovr_min: f64,
    pub pitching_ovr_max: f64,
    pub batting_ovr_min: f64,
    pub batting_ovr_max: f64,
    pub dev_rate_min: f64,
    pub dev_rate_max: f64,
    pub named_npcs: Vec<NpcSaveState>,
    pub season_year: i32,
    pub id_offset: i32,
}

// ── 드래프트 관련 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPick {
    pub round: i32,
    pub pick: i32,
    pub team_id: String,
    pub npc_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSimResult {
    pub year: i32,
    pub picks: Vec<DraftPick>,
    pub undrafted_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistDraftOutcome {
    pub drafted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pick: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedNpcMeta {
    pub npc_id: String,
    pub pro_potential_tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSimParams {
    pub candidates: Vec<NpcSaveState>,
    pub named_metas: Vec<NamedNpcMeta>,
    pub year: i32,
    pub rounds: i32,
    pub team_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyDraftParams {
    pub npcs: Vec<NpcSaveState>,
    pub result: DraftSimResult,
    #[serde(default)]
    pub university_team_ids: Vec<String>,
    #[serde(default)]
    pub independent_team_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistDraftParams {
    pub scout_score: f64,
    pub pitching_ovr: f64,
    pub year: i32,
    pub team_ids: Vec<String>,
}

// ── 체육부대 선발 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitCandidate {
    pub id: String,
    pub name: String,
    pub ovr: f64,
    pub team_id: String,
    pub position: String,
    pub is_protagonist: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitCandidatesParams {
    pub candidates: Vec<SportsUnitCandidate>,
    pub top_n: usize,   // 30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitCandidatesResult {
    pub top_candidates: Vec<SportsUnitCandidate>,
    pub protagonist_rank: Option<usize>,  // 1-based, None이면 30위 밖
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitSelectionParams {
    pub applicants: Vec<SportsUnitCandidate>,
    pub max_total: usize,      // 10
    pub max_per_team: usize,   // 3
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitSelectionResult {
    pub protagonist_selected: bool,
    pub selected_ids: Vec<String>,
}

// ── 드래프트 보드 (커리어 선택 화면) ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftBoardCandidate {
    pub id: String,
    pub ovr: f64,
    pub age: i32,
    pub potential: f64,
    pub is_user: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftBoardPick {
    pub pick_no: i32,
    pub round: i32,
    pub team_id: String,
    pub candidate_id: String,
    pub is_user: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftBoardParams {
    pub candidates: Vec<DraftBoardCandidate>,
    pub protagonist_scout_score: f64,
    pub protagonist_ovr: f64,
    pub team_ids: Vec<String>,
    pub year: i32,
    pub rounds: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftBoardResult {
    pub picks: Vec<DraftBoardPick>,
    pub user_drafted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_round: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_pick_no: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_team_id: Option<String>,
}

// ── 게임 시뮬 파라미터 ────────────────────────────────────────────────────────

fn default_stamina_cap() -> f64 { 60.0 }
fn default_one() -> i32 { 1 }
fn default_potential() -> f64 { 75.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimPitcher {
    pub id: String,
    pub velocity: f64,
    pub movement: f64,
    pub command: f64,
    pub control: f64,
    pub stamina: f64,
    #[serde(default = "default_stamina_cap")]
    pub stamina_cap: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimBatter {
    pub id: String,
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
    pub discipline: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimPlayerCondition {
    pub fatigue: f64,
    pub last_pitched_week: i32,
    pub pitch_outs_last: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimGameParams {
    pub home_rotation: Vec<SimPitcher>,
    pub away_rotation: Vec<SimPitcher>,
    pub home_bullpen: Vec<SimPitcher>,
    pub away_bullpen: Vec<SimPitcher>,
    pub home_closer: Option<SimPitcher>,
    pub away_closer: Option<SimPitcher>,
    pub home_lineup: Vec<SimBatter>,
    pub away_lineup: Vec<SimBatter>,
    pub home_rot_idx: usize,
    pub away_rot_idx: usize,
    pub conditions: HashMap<String, SimPlayerCondition>,
    pub week: i32,
    pub home_team_id: String,
    pub away_team_id: String,
}

// ── 게임 시뮬 결과 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role")]
pub enum PlayerGameLine {
    #[serde(rename = "pitcher")]
    Pitcher {
        #[serde(rename = "playerId")]
        player_id: String,
        ip: f64,
        er: i32,
        h: i32,
        k: i32,
        bb: i32,
        pc: i32,
        decision: String,
    },
    #[serde(rename = "batter")]
    Batter {
        #[serde(rename = "playerId")]
        player_id: String,
        ab: i32,
        h: i32,
        hr: i32,
        rbi: i32,
        bb: i32,
        k: i32,
        sb: i32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResult {
    pub home_score: i32,
    pub away_score: i32,
    pub winner_id: String,
    pub loser_id: String,
    pub player_lines: Vec<PlayerGameLine>,
    pub events: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimGameResult {
    pub result: MatchResult,
    pub next_home_rot_idx: i32,
    pub next_away_rot_idx: i32,
    pub pitcher_conditions: HashMap<String, SimPlayerCondition>,
}

// ── 주인공 학년 진급 결과 ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistGradeResult {
    pub new_grade: serde_json::Value,
    pub new_age: i32,
    pub is_graduating: bool,
}

// ── 오프시즌 입력 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffseasonParams {
    pub npcs: Vec<NpcSaveState>,
    pub pending_draft: Vec<NpcSaveState>,
    pub season_year: i32,
}

// ── 학년 진급 입력 ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceGradesParams {
    pub npcs: Vec<NpcSaveState>,
    pub season_year: i32,
}

// ── 주인공 학년 입력 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistGradeParams {
    pub current_grade: i32,
    pub current_age: i32,
}

// ── NPC 월간 성장 타입 ────────────────────────────────────────────────────────

/// 팀 환경 정보 (시설·감독·코치)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcTeamContext {
    pub team_id: String,
    pub facility_tier: String,       // "1군"|"2군"|"고교"|"대학"|"독립"
    pub manager_development: f64,    // 0~99
    pub coach_teaching: f64,         // 0~99
}

/// 이전 달 경기 성적
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcMonthlyPerf {
    pub games_played: i32,
    pub era: Option<f64>,
    pub batting_avg: Option<f64>,
}

/// 월간 성장 계산 입력 단위 (모든 선수 NPC 동일 구조)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcLiveInput {
    pub npc_id: String,
    pub team_id: String,
    pub player_type: String,   // "pitcher" | "batter"
    pub age: i32,
    pub development_rate: i32,
    pub potential_hidden: Option<f64>,  // 60~99; None → 75
    pub pitching: Option<NpcPitchingAttrs>,
    pub batting: Option<NpcBattingAttrs>,
    #[serde(default)]
    pub pitching_xp: HashMap<String, f64>,
    #[serde(default)]
    pub batting_xp: HashMap<String, f64>,
    pub peak_ovr: Option<f64>,
    #[serde(default)]
    pub current_fame: f64,
    #[serde(default)]
    pub pitches: Vec<NpcPitchEntry>,
    #[serde(default)]
    pub pitcher_role: String,   // "SP" | "RP" | "CP"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_in_training: Option<NpcPitchTraining>,
}

/// 월간 성장 계산 출력 단위
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcLiveOutput {
    pub npc_id: String,
    pub pitching: Option<NpcPitchingAttrs>,
    pub batting: Option<NpcBattingAttrs>,
    pub pitching_xp: HashMap<String, f64>,
    pub batting_xp: HashMap<String, f64>,
    pub peak_ovr: f64,
    #[serde(default)]
    pub fame_delta: f64,
    #[serde(default)]
    pub pitches: Vec<NpcPitchEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_in_training: Option<NpcPitchTraining>,
}

/// 월간 성장 전체 파라미터
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyNpcGrowthParams {
    pub npcs: Vec<NpcLiveInput>,
    pub team_contexts: Vec<NpcTeamContext>,
    #[serde(default)]
    pub perf_data: HashMap<String, NpcMonthlyPerf>,
    pub current_phase: String,   // "preseason"|"season"|"postseason"|"offseason"
    pub month_index: i32,        // 0~11
    #[serde(default)]
    pub pitch_catalog_ids: Vec<String>,
}

/// 월간 성장 결과
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyNpcGrowthResult {
    pub updated: Vec<NpcLiveOutput>,
}

// ── 팀 프로필 ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProTeamProfile {
    pub owner_spending_willingness: f64,
    pub stability: f64,
    pub development_focus: f64,
    pub discipline: f64,
    pub owner_patience: f64,
    pub win_now_pressure: f64,
    pub scouting_quality: f64,
    pub prestige: f64,
    pub market_appeal: f64,
    pub clubhouse_culture: f64,
    pub medical_quality: f64,
    pub farm_investment: f64,
}

// ── 선수 성향 ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPersonality {
    pub loyalty: f64,
    pub ambition: f64,
    pub greed: f64,
    pub competitive_drive: f64,
    pub stability_preference: f64,
    #[serde(default)]
    pub professionalism: f64,
    pub overseas_ambition: f64,
    pub market_preference: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub home_team_id: Option<String>,
}

// ── 스카우팅 타입 ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingInputPlayer {
    pub player_id: String,
    pub true_ovr: f64,
    pub true_potential: Option<f64>,
    pub true_personality: Option<NpcPersonality>,
    pub fame: f64,
    pub age: i32,
    pub is_own_player: bool,
    pub is_prospect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutedPlayer {
    pub player_id: String,
    pub scouted_ovr: f64,
    pub scouted_potential: Option<f64>,
    pub scouted_personality: Option<NpcPersonality>,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingNoiseParams {
    pub scouting_quality: f64,
    pub players: Vec<ScoutingInputPlayer>,
    pub season_year: u32,
    pub team_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingNoiseResult {
    pub scouted: Vec<ScoutedPlayer>,
}

// ── 팀 엔진 공통 타입 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterPlayerRef {
    pub id: String,
    pub position: String,
    pub age: i32,
    pub ovr: f64,
    pub salary: i64,
    pub remaining_years: i32,
    pub pro_service_years: i32,
    pub is_prospect: bool,
    pub personality: Option<NpcPersonality>,
    pub fame: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeAsset {
    pub player_id: String,
    pub team_id: String,
    pub position: String,
    pub age: i32,
    pub ovr: f64,
    pub true_ovr: f64,
    pub salary: i64,
    pub remaining_years: i32,
    pub is_prospect: bool,
    pub personality: Option<NpcPersonality>,
    // 의료 정보 (메디컬 테스트용)
    #[serde(default)]
    pub injury_severity: Option<String>,  // null/"light"/"moderate"/"severe"/"surgery"
    #[serde(default)]
    pub injury_weeks_left: i32,
    #[serde(default)]
    pub career_injury_count: i32,
    #[serde(default)]
    pub has_steroid_history: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaPlayerRef {
    pub id: String,
    pub position: String,
    pub age: i32,
    pub ovr: f64,
    pub market_value: i64,
    pub demand_salary: i64,
    pub demand_years: i32,
    pub fame: f64,
    pub personality: Option<NpcPersonality>,
    pub pro_service_years: i32,
    pub current_league: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractOfferResult {
    pub offer_salary: i64,
    pub offer_years: i32,
    pub signing_bonus: i64,
    pub team_option_years: i32,
    pub player_option_years: i32,
    pub no_trade_clause: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamWithRoster {
    pub team_id: String,
    pub league_id: String,
    pub profile: ProTeamProfile,
    pub active_roster: Vec<String>,
    pub farm_roster: Vec<String>,
    pub salary_cap: i64,
    pub current_payroll: i64,
    // 트레이드 컨텍스트
    #[serde(default)]
    pub win_pct: f64,                        // 현재 승률 → buyer/seller 모드 판단
    #[serde(default)]
    pub injured_positions: Vec<String>,      // 부상 중인 포지션 → 긴급 보강 필요
    #[serde(default)]
    pub expiring_contract_ids: Vec<String>,  // 잔여 1년 이하 선수 ID → 선점 트레이드
}
