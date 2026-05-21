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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitching: Option<NpcPitchingAttrs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batting: Option<NpcBattingAttrs>,
    pub development_rate: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pro_service_years: Option<i32>,
    pub career_history: Vec<NpcCareerEntry>,
    pub achievements: Vec<String>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistDraftParams {
    pub scout_score: f64,
    pub pitching_ovr: f64,
    pub year: i32,
    pub team_ids: Vec<String>,
}

// ── 게임 시뮬 파라미터 ────────────────────────────────────────────────────────

fn default_stamina_cap() -> f64 { 60.0 }

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
