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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcCareerEvent {
    pub year: i32,
    pub event_type: String,  // "draft_picked"|"draft_undrafted"|"trade"|"fa_signed"|"military_enlist"|"military_discharge"|"retirement"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_team_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_team_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_league_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_league_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

// ── NPC 저장 상태 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcSaveState {
    pub npc_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_en: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nationality: Option<String>,  // "KOR"|"JPN"|"USA"|"OTHER"; None → "KOR" 폴백
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
    /// 군 계급. **Rust는 안 쓰지만 반드시 들고 있어야 한다** —
    /// 이 필드가 없으면 NPC가 Rust를 한 번 통과할 때마다 계급이 사라지고,
    /// `syncNpcs`가 INSERT OR REPLACE라 다음 저장에서 DB의 계급까지 지워진다.
    /// (military_roster.rs가 복무 개월로 정한 값이 정본 — design/roster.md §7)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military_rank: Option<String>,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub career_events: Vec<NpcCareerEvent>,
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
    pub hs_graduated: Vec<NpcSaveState>,    // HS grade 3 → 드래프트 풀
    pub univ_graduated: Vec<NpcSaveState>,  // 대학 grade 4 → 드래프트 풀
}

// ── 전체 나이 증가 입력 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceAllAgesParams {
    pub npcs: Vec<NpcSaveState>,
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
    /// **채워야 할 자리** — 앞에서부터 순서대로 배정한다. 모자라면 무작위로 넘어간다.
    ///
    /// ⚠ 예전엔 포지션이 `POSITIONS[rand]`, 투수 여부가 `rand < 0.3`이었다.
    /// 평균으로는 균등해도 **팀 단위 편차가 해마다 누적**된다 — 포수는 8분의 1이라
    /// 신입생 8명이면 포수 0명일 확률이 34%다. 3학년이 매년 졸업으로 빠지는데
    /// 포수가 안 들어오는 해가 겹치면 0이 된다(실측 고교 102팀 중 31팀이
    /// 어느 해엔가 포수 0명).
    ///
    /// 투수 보직("SP"/"RP")도 여기 넣는다 — 투수/야수 비율도 같은 이유로 흔들린다
    /// (실측 고교 최소 투수 4명).
    #[serde(default)]
    pub needed_positions: Vec<String>,
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
    /// 지명 대상 풀 = 지명 수 × 이 배수. 정본은
    /// `generation_rules.json`의 `draftRules.boardCandidateMultiplier`다.
    /// 없으면 2 (110지명이면 220명이 경쟁한다)
    #[serde(default = "default_pool_multiplier")]
    pub pool_multiplier: usize,
}

fn default_pool_multiplier() -> usize { 2 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyDraftParams {
    pub npcs: Vec<NpcSaveState>,
    pub result: DraftSimResult,
    #[serde(default)]
    pub university_team_ids: Vec<String>,
    #[serde(default)]
    pub independent_team_ids: Vec<String>,
    /// 신인 계약 (generation_rules.json draftRules.contract).
    /// 없으면 계약이 안 붙는다 — 신인이 연봉 0으로 시작한다
    #[serde(default)]
    pub contract: Option<crate::draft::DraftContractRules>,
    /// 이 라운드 이하 지명자는 1군에서 시작한다 (draftRules.firstTeamRounds).
    /// 0이면 전원 2군
    #[serde(default)]
    pub first_team_rounds: i32,
    /// 팀 예산 지수 (팀 예산 / 리그 평균). 계약금에 곱한다
    #[serde(default)]
    pub team_index: std::collections::HashMap<String, f64>,
    /// 미지명자 진로 배정 상한 (rosterRules에서 온다)
    #[serde(default)]
    pub placement: Option<crate::draft::PlacementRules>,
    /// 방출 2단계 (faRules.release). 없으면 1단계(정원 초과)만 돈다
    #[serde(default)]
    pub release_rules: Option<crate::free_agency::ReleaseRules>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickGeneralEnlisteesParams {
    pub ids: Vec<String>,
    pub max_count: usize,
    pub seed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickGeneralEnlisteesResult {
    pub selected_ids: Vec<String>,
}

// ── 조기 입대 자발적 선택 ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EarlyEnlistCandidate {
    pub id: String,
    pub age: u32,
    pub ovr_rank_pct: f64,     // 0=최하위, 1=최상위 (리그 내 상대적 위치)
    pub playing_time_pct: f64, // 0=출장 없음, 1=전경기 출장
    pub contract_years_left: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcEarlyEnlistParams {
    pub candidates: Vec<EarlyEnlistCandidate>,
    pub seed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcEarlyEnlistResult {
    pub early_enlist_ids: Vec<String>,
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
    /// 위기 집중력. **없으면 50(무보정)** — 구 페이로드·감사 스크립트 호환
    #[serde(default = "default_neutral_stat")]
    pub clutch: f64,
    #[serde(default = "default_neutral_stat")]
    pub mentality: f64,
}

pub(crate) fn default_neutral_stat() -> f64 { 50.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimBatter {
    pub id: String,
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
    pub discipline: f64,
    /// 승부처 집중력. 없으면 50(무보정)
    #[serde(default = "default_neutral_stat")]
    pub batting_clutch: f64,
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
    pub is_graduating: bool,
}

// ── 오프시즌 입력 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffseasonParams {
    pub npcs: Vec<NpcSaveState>,
    pub pending_draft: Vec<NpcSaveState>,
    pub season_year: i32,
    // TS에서 FA/은퇴 결정을 완료한 named NPC ID 목록 — Rust FA 로직 스킵 대상
    #[serde(default)]
    pub named_npc_ids: Vec<String>,
    /// 연봉 규칙 (generation_rules.json salaryRules). 안 넘어오면 폴백을 쓴다 —
    /// 규칙 누락이 연봉을 0으로 만들어 세이브를 망가뜨리지 않게
    #[serde(default)]
    pub salary_rules: Option<crate::npc_sim::SalaryRules>,
    /// 팀당 유지 인원 상한 (generation_rules.json rosterRules[리그]).
    /// 안 넘어오면 상한 자체가 없어 로스터가 무한히 부푼다
    #[serde(default)]
    pub roster_limits: std::collections::HashMap<String, crate::npc_sim::RosterLimit>,
    /// 방출·FA 미계약자가 갈 곳. 안 넘어오면 그 사람들은 전부 은퇴 처리된다
    #[serde(default)]
    pub university_team_ids: Vec<String>,
    #[serde(default)]
    pub independent_team_ids: Vec<String>,
    #[serde(default)]
    pub placement: Option<crate::draft::PlacementRules>,
    /// 방출 2단계 (faRules.release). 없으면 1단계(정원 초과)만 돈다
    #[serde(default)]
    pub release_rules: Option<crate::free_agency::ReleaseRules>,
    /// 외국인 보유 한도가 걸리는 리그 (generation_rules.json `foreignRules.leagues`).
    /// 비면 외국인 개념이 없는 세계 — 구 세이브·구 페이로드가 그렇다
    #[serde(default)]
    pub foreign_leagues: Vec<String>,
    /// 리그별 자국 국적 (`rosterRules[리그].nationality`, 없으면 KOR).
    ///
    /// ⚠ **외국인은 국적이 아니라 리그 기준 상대 개념이다.** `!= "KOR"`로 보면
    /// ABL(USA)·JBL(JPN) 로스터 전원이 외국인이 된다
    #[serde(default)]
    pub home_nationality: std::collections::HashMap<String, String>,
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
    /// 무대별 성장 계수. **정본은 `generation_rules.json`의
    /// `growthRules.facilityFactor`**이고 TS가 그 값을 넘긴다.
    /// 없으면 아래 폴백 표를 쓴다 (구 호출부 호환)
    #[serde(default)]
    pub facility_factor: Option<f64>,
    pub manager_development: f64,    // 0~99
    pub coach_teaching: f64,         // 0~99
}

/// 나이 구간별 성장 계수 한 칸 — `maxAge` 이하에 `f`를 적용
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgeGrowthBand {
    pub max_age: i32,
    pub f: f64,
}

/// NPC 성장 속도 규칙.
///
/// ⚠ **정본은 `generation_rules.json`의 `growthRules.xp`다.**
/// 예전엔 이 수치가 전부 Rust에 박혀 있었고, 그 값으로는 17세 유망주가
/// 스탯 하나를 +1 올리는 데 **85주**가 걸렸다 — 고교 3년을 다 뛰어도
/// OVR이 1도 안 올랐다. 반면 30세 감퇴는 정상 작동해서, 세계 평균이
/// 매년 내려앉았다(1군 상위 88 → 81 → 77).
///
/// 투수와 타자에 배율을 따로 두는 이유: XP 배분 가중치가 커버하는 OVR
/// 비중이 다르다. 투수는 12 중 8.5(velocity·command·control·movement),
/// 타자는 11.8 중 6.6(contact·eye·speed·power)이라 같은 XP로도 투수가
/// 더 오른다. 같은 목표 곡선에 맞추려면 배율이 달라야 한다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthXpRules {
    pub multiplier_pitcher: f64,
    pub multiplier_batter: f64,
    /// 오름차순이어야 한다 — 첫 번째로 `age <= max_age`인 칸을 쓴다
    pub age_bands: Vec<AgeGrowthBand>,
    /// 경기 기록이 없는 선수의 성적 계수.
    ///
    /// 배경 NPC는 대부분 경기 라인에 안 올라 여기 걸린다. 예전 값 **0.40**은
    /// "출전 못 하면 훈련도 무의미"에 가까웠고, 오프시즌 가중치 0.20과
    /// 겹치면 0.08까지 떨어졌다 — 리그 전체 성장이 목표의 1/4로 눌린
    /// 주된 이유다.
    #[serde(default)]
    pub no_perf_base: Option<f64>,
    /// 단계별 성적 가중치. `training_factor`는 오프시즌을 1.50으로 밀어주는데
    /// 여기가 0.20이면 서로 상쇄된다 — 오프시즌은 원래 훈련기다.
    #[serde(default)]
    pub phase_weight: Option<PhaseWeights>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseWeights {
    pub offseason: f64,
    pub preseason: f64,
    pub postseason: f64,
    pub season: f64,
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
    /// 스탯별 **미반영 노화 누적분**.
    ///
    /// ⚠ 이게 없던 시절 노화는 **전 연령에서 통째로 사라졌다.** 감퇴를
    /// 스탯에서 직접 빼는데 `clamp_stat`이 매번 `round()`를 하고, 주당
    /// 감퇴량은 연 2.5를 52로 나눈 **0.048**이라 75 − 0.048 = 74.95 →
    /// 75로 되돌아갔다. 35세 투수를 52주 굴려도 스탯이 하나도 안 변했다.
    /// 성장은 XP를 쌓아 임계값에서 +1 하므로 멀쩡했는데 노화만 이랬다.
    ///
    /// 이제 성장과 대칭으로 **1.0을 넘을 때 −1**을 적용한다.
    #[serde(default)]
    pub aging_debt: HashMap<String, f64>,
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
    /// 미반영 노화 누적분 — 다음 주에 그대로 되돌려 받는다
    #[serde(default)]
    pub aging_debt: HashMap<String, f64>,
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
    /// 없으면 Rust 폴백 표를 쓴다 — 정본은 `generation_rules.json`
    #[serde(default)]
    pub xp_rules: Option<GrowthXpRules>,
}

/// 월간 성장 결과
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyNpcGrowthResult {
    pub updated: Vec<NpcLiveOutput>,
}

// ── 팀 프로필 ─────────────────────────────────────────────────────────────────

/// 팀 성향. `Default`는 **전 항목 50(중립)** — 오프시즌 방출 판정처럼
/// 팀별 프로필을 들고 오지 않는 경로에서 쓴다. 0으로 두면 모든 팀이
/// "안정성 0 · 성적압박 0"이 되어 판정이 한쪽으로 쏠린다
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

impl Default for ProTeamProfile {
    fn default() -> Self {
        Self {
            owner_spending_willingness: 50.0, stability: 50.0, development_focus: 50.0,
            discipline: 50.0, owner_patience: 50.0, win_now_pressure: 50.0,
            scouting_quality: 50.0, prestige: 50.0, market_appeal: 50.0,
            clubhouse_culture: 50.0, medical_quality: 50.0, farm_investment: 50.0,
        }
    }
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
    /// 올 시즌 성적. **승강 판정의 주 입력이다** (사용자 확정 2026-07-30:
    /// "최근 성적 위주 + 능력치 보정"). 표본이 없으면 전부 0이고,
    /// 그때는 `form_score`가 능력치만 보게 된다
    #[serde(default)]
    pub perf: Option<RosterPerf>,
    /// 외국인 선수인가. **1군 전용이라 2군 강등 후보에서 빼야 한다.**
    /// 없으면 false — 구 페이로드는 전원 내국인으로 읽힌다
    #[serde(default)]
    pub is_foreign: bool,
}

/// 승강 판정용 시즌 성적. 투수/타자 중 해당 쪽만 채워진다
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterPerf {
    #[serde(default)]
    pub games: i32,
    /// 투수
    #[serde(default)]
    pub innings: f64,
    #[serde(default)]
    pub era: f64,
    #[serde(default)]
    pub whip: f64,
    /// 타자
    #[serde(default)]
    pub plate_appearances: i32,
    #[serde(default)]
    pub ops: f64,
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
