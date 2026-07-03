#![deny(clippy::all)]

use napi_derive::napi;

mod hmac;
mod crypto;
mod types;
mod tuning;
mod match_engine;
mod sim_types;
mod npc_sim;
mod growth_engine;
mod player_engine;
mod schedule_engine;
mod postseason_engine;
mod week_engine;
mod team_engine;
mod player_agent;
mod scouting_engine;
mod roster_gen;

use types::*;
use sim_types::*;
use growth_engine::*;
use player_engine::*;
use schedule_engine::*;
use postseason_engine::*;

// ── HMAC (Phase 1) ────────────────────────────────────────────────────────────

/// 세이브 데이터 HMAC-SHA256 서명 (키는 바이너리 내부)
#[napi]
pub fn compute_save_sig(snapshot: String) -> String {
    hmac::compute_save_sig(&snapshot)
}

/// 세이브 데이터 암호화 → base64(nonce || ciphertext)
#[napi]
pub fn encrypt_save_native(plaintext: String) -> String {
    crypto::encrypt_save(&plaintext)
}

/// 세이브 데이터 복호화 (구 평문 포맷 자동 감지)
#[napi]
pub fn decrypt_save_native(ciphertext: String) -> String {
    crypto::decrypt_save(&ciphertext).unwrap_or_default()
}

/// 서명 검증 — 일치하면 true
#[napi]
pub fn verify_save_sig(snapshot: String, sig: String) -> bool {
    hmac::verify_save_sig(&snapshot, &sig)
}

// ── 매치 엔진 (Phase 2) ───────────────────────────────────────────────────────

fn parse_err(fn_name: &str, e: serde_json::Error) -> String {
    serde_json::json!({ "error": format!("[engine-native] {}: {}", fn_name, e) }).to_string()
}

/// 초기 경기 상태 생성
#[napi]
pub fn start_match_native(options_json: String) -> String {
    let opts: MatchStartOptions = match serde_json::from_str(&options_json) {
        Ok(v) => v,
        Err(e) => return parse_err("startMatchNative", e),
    };
    let mut rng = rand::thread_rng();
    let state = match_engine::create_initial_match_state(&opts, &mut rng);
    serde_json::to_string(&state).unwrap_or_else(|e| parse_err("startMatchNative/serialize", e))
}

/// 주인공 인터랙티브 투구 (1구)
#[napi]
pub fn step_pitch_native(state_json: String, decision_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("stepPitchNative/state", e),
    };
    let decision: PitchDecision = match serde_json::from_str(&decision_json) {
        Ok(v) => v,
        Err(e) => return parse_err("stepPitchNative/decision", e),
    };
    if !match_engine::is_protagonist_pitching(&state) {
        return serde_json::json!({ "error": "현재 주인공 투구 차례가 아닙니다." }).to_string();
    }
    let mut rng = rand::thread_rng();
    let result = match_engine::step_pitch_core(&state, &decision, true, &mut rng);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("stepPitchNative/serialize", e))
}

/// 경기 종료 처리
#[napi]
pub fn finish_match_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("finishMatchNative", e),
    };
    let result = match_engine::finish_match(&state);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("finishMatchNative/serialize", e))
}

/// 현재 주인공 투구 차례 여부
#[napi]
pub fn is_protagonist_pitching_native(state_json: String) -> bool {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(_) => return false,
    };
    match_engine::is_protagonist_pitching(&state)
}

/// 다음 게임 페이즈 결정 (orchestrator)
#[napi]
pub fn advance_game_phase_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("advanceGamePhaseNative", e),
    };
    let mut rng = rand::thread_rng();
    let result = match_engine::advance_game_phase(&state, &mut rng);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceGamePhaseNative/serialize", e))
}

/// 등판 트리거 충족 시점까지 자동 시뮬
#[napi]
pub fn sim_until_entry(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("simUntilEntry", e),
    };
    let mut rng = rand::thread_rng();
    let result = match_engine::auto_simulate_until_entry(&state, &mut rng);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simUntilEntry/serialize", e))
}

/// 게임 종료까지 자동 시뮬
#[napi]
pub fn sim_to_game_end(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("simToGameEnd", e),
    };
    let mut rng = rand::thread_rng();
    let result = match_engine::auto_simulate_to_game_end(&state, &mut rng);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simToGameEnd/serialize", e))
}

/// 반이닝 자동 시뮬
#[napi]
pub fn sim_half_inning(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("simHalfInning", e),
    };
    let mut rng = rand::thread_rng();
    let result = match_engine::auto_simulate_half_inning(&state, &mut rng);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simHalfInning/serialize", e))
}

/// 감독 자동 마운드 방문 체크
#[napi]
pub fn auto_mound_visit_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("autoMoundVisitNative", e),
    };
    let result = match_engine::auto_mound_visit_if_needed(&state);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("autoMoundVisitNative/serialize", e))
}

/// 마운드 방문 적용
#[napi]
pub fn request_mound_visit_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("requestMoundVisitNative", e),
    };
    let result = match_engine::request_mound_visit(&state);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("requestMoundVisitNative/serialize", e))
}

/// 주인공 강판 판단
#[napi]
pub fn should_protagonist_exit_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err("shouldProtagonistExitNative", e),
    };
    let result = match_engine::should_protagonist_exit(&state);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("shouldProtagonistExitNative/serialize", e))
}

/// 헤드리스 게임 시뮬 (튜닝 랩용)
#[napi]
pub fn run_simple_game(params_json: String) -> String {
    let params: RunSimpleGameParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("runSimpleGame", e),
    };
    let mut rng = rand::thread_rng();
    let result = match_engine::run_simple_game(&params, &mut rng);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("runSimpleGame/serialize", e))
}

// ── NPC 시뮬 (Phase 3) ────────────────────────────────────────────────────────

/// NPC 게임 헤드리스 시뮬
#[napi]
pub fn sim_game_native(params_json: String) -> String {
    let params: SimGameParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("simGameNative", e),
    };
    let result = npc_sim::sim_game(&params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simGameNative/serialize", e))
}

/// 오프시즌 전체 처리
#[napi]
pub fn run_offseason_native(params_json: String) -> String {
    let params: OffseasonParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("runOffseasonNative", e),
    };
    let result = npc_sim::run_offseason(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("runOffseasonNative/serialize", e))
}

/// 고교 학년 진급
#[napi]
pub fn advance_grades_native(params_json: String) -> String {
    let params: AdvanceGradesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("advanceGradesNative", e),
    };
    let result = npc_sim::advance_grades(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceGradesNative/serialize", e))
}

/// NPC 주간 성장/하락 처리
#[napi]
pub fn npc_calc_weekly_growth(params_json: String) -> String {
    let params: MonthlyNpcGrowthParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("npcCalcWeeklyGrowth", e),
    };
    let result = npc_sim::calc_weekly_npc_growth(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("npcCalcWeeklyGrowth/serialize", e))
}

/// 신입생 벌크 생성
#[napi]
pub fn generate_freshmen_native(params_json: String) -> String {
    let params: GenerateFreshmenParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("generateFreshmenNative", e),
    };
    let result = npc_sim::generate_freshmen(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("generateFreshmenNative/serialize", e))
}

/// NPC 드래프트 시뮬
#[napi]
pub fn run_draft_native(params_json: String) -> String {
    let params: DraftSimParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("runDraftNative", e),
    };
    let result = npc_sim::run_draft(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("runDraftNative/serialize", e))
}

/// 드래프트 결과 NPC에 적용
#[napi]
pub fn apply_draft_native(params_json: String) -> String {
    let params: ApplyDraftParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("applyDraftNative", e),
    };
    let result = npc_sim::apply_draft(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("applyDraftNative/serialize", e))
}

/// 배경 고교 졸업생 드래프트 시뮬레이션
#[napi]
pub fn bg_hs_graduate_draft_native(params_json: String) -> String {
    let params: npc_sim::BgHsGraduateDraftParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("bgHsGraduateDraftNative", e),
    };
    let result = npc_sim::bg_hs_graduate_draft(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("bgHsGraduateDraftNative/serialize", e))
}

/// 주인공 드래프트 결과 결정
#[napi]
pub fn determine_protagonist_draft_native(params_json: String) -> String {
    let params: ProtagonistDraftParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("determineProtagonistDraftNative", e),
    };
    let result = npc_sim::determine_protagonist_draft(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("determineProtagonistDraftNative/serialize", e))
}

/// 드래프트 보드 — 전체 픽 시퀀스 사전 계산
#[napi]
pub fn run_draft_board_native(params_json: String) -> String {
    let params: DraftBoardParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("runDraftBoardNative", e),
    };
    let result = npc_sim::run_draft_board(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("runDraftBoardNative/serialize", e))
}

/// 주인공 학년 진급
#[napi]
pub fn advance_protagonist_grade_native(params_json: String) -> String {
    let params: ProtagonistGradeParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("advanceProtagonistGradeNative", e),
    };
    let result = npc_sim::advance_protagonist_grade(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceProtagonistGradeNative/serialize", e))
}

/// HS + 대학 전체 학년 진급 (단일 호출)
#[napi]
pub fn advance_all_grades_native(params_json: String) -> String {
    let params: AdvanceGradesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("advanceAllGradesNative", e),
    };
    let result = npc_sim::advance_all_grades(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceAllGradesNative/serialize", e))
}

/// 전체 NPC 나이 +1 (학년 진급 이후 단일 호출)
#[napi]
pub fn advance_all_ages_native(params_json: String) -> String {
    let params: AdvanceAllAgesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("advanceAllAgesNative", e),
    };
    let result = npc_sim::advance_all_ages(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceAllAgesNative/serialize", e))
}

// ── 성장 엔진 (Phase 4) ───────────────────────────────────────────────────────

/// 주간 훈련 성장 계산
#[napi]
pub fn calc_training_growth_native(params_json: String) -> String {
    let params: TrainingGrowthParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcTrainingGrowthNative", e),
    };
    let result = growth_engine::calc_training_growth(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcTrainingGrowthNative/serialize", e))
}

/// 경기 성장 계산
#[napi]
pub fn calc_game_growth_native(params_json: String) -> String {
    let params: GameGrowthParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcGameGrowthNative", e),
    };
    let result = growth_engine::calc_game_growth(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcGameGrowthNative/serialize", e))
}

/// 주인공 에이징 (시즌 종료 1회 호출)
#[napi]
pub fn calc_protagonist_aging_native(params_json: String) -> String {
    let params: growth_engine::ProtagonistAgingParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcProtagonistAgingNative", e),
    };
    let result = growth_engine::calc_protagonist_aging(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcProtagonistAgingNative/serialize", e))
}

// ── 플레이어 엔진 (Phase 4) ───────────────────────────────────────────────────

/// 진로 선택 → 다음 스텝
#[napi]
pub fn resolve_career_choice_native(params_json: String) -> String {
    let params: ResolveChoiceParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("resolveCareerChoiceNative", e),
    };
    let result = player_engine::resolve_career_choice(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("resolveCareerChoiceNative/serialize", e))
}

/// 고교 투수 포지션 배정 (SP / RP)
#[napi]
pub fn assign_highschool_position_native(params_json: String) -> String {
    let params: AssignHighschoolPositionParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("assignHighschoolPositionNative", e),
    };
    let result = player_engine::assign_highschool_position(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("assignHighschoolPositionNative/serialize", e))
}

/// 주인공 투수 역할 배정
#[napi]
pub fn assign_protagonist_role_native(params_json: String) -> String {
    let params: AssignRoleParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("assignProtagonistRoleNative", e),
    };
    let result = player_engine::assign_protagonist_role(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("assignProtagonistRoleNative/serialize", e))
}

/// 불펜 등판 판정
#[napi]
pub fn reliever_would_pitch_native(params_json: String) -> String {
    let params: RelieverPitchParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("relieverWouldPitchNative", e),
    };
    let result = player_engine::reliever_would_pitch(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("relieverWouldPitchNative/serialize", e))
}

/// 시즌 레이팅 계산
#[napi]
pub fn calc_season_rating_native(params_json: String) -> String {
    let params: CalcSeasonRatingParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcSeasonRatingNative", e),
    };
    let result = player_engine::calc_season_rating(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcSeasonRatingNative/serialize", e))
}

/// 시장 연봉 계산
#[napi]
pub fn calc_market_salary_native(params_json: String) -> String {
    let params: CalcMarketSalaryParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcMarketSalaryNative", e),
    };
    let result = player_engine::calc_market_salary(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcMarketSalaryNative/serialize", e))
}

/// 제안 연봉 계산
#[napi]
pub fn calc_offered_salary_native(params_json: String) -> String {
    let params: CalcOfferedSalaryParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcOfferedSalaryNative", e),
    };
    let result = player_engine::calc_offered_salary(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcOfferedSalaryNative/serialize", e))
}

/// 주인공 제안 연봉 계산 (시즌 스탯 반영)
#[napi]
pub fn calc_offered_salary_for_protagonist_native(params_json: String) -> String {
    let params: CalcOfferedSalaryForProtagonistParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcOfferedSalaryForProtagonistNative", e),
    };
    let result = player_engine::calc_offered_salary_for_protagonist(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcOfferedSalaryForProtagonistNative/serialize", e))
}

/// NPC 재계약 연봉 계산
#[napi]
pub fn calc_npc_renewal_salary_native(params_json: String) -> String {
    let params: player_engine::CalcNpcRenewalSalaryParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcNpcRenewalSalaryNative", e),
    };
    let result = player_engine::calc_npc_renewal_salary(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcNpcRenewalSalaryNative/serialize", e))
}

/// NPC 재계약 기간 계산
#[napi]
pub fn calc_npc_contract_years_native(params_json: String) -> String {
    let params: player_engine::CalcNpcContractYearsParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcNpcContractYearsNative", e),
    };
    let result = player_engine::calc_npc_contract_years(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcNpcContractYearsNative/serialize", e))
}

/// FA 오퍼 생성
#[napi]
pub fn generate_fa_offers_native(params_json: String) -> String {
    let params: GenerateFaOffersParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("generateFaOffersNative", e),
    };
    let result = player_engine::generate_fa_offers(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("generateFaOffersNative/serialize", e))
}

/// 드래프트 순위/계약금 계산
#[napi]
pub fn calc_draft_rank_native(params_json: String) -> String {
    let params: CalcDraftRankParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcDraftRankNative", e),
    };
    let result = player_engine::calc_draft_rank(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcDraftRankNative/serialize", e))
}

/// 체육부대 후보 30명 공개 (W50 루머)
#[napi]
pub fn calc_sports_unit_candidates_native(params_json: String) -> String {
    let params: SportsUnitCandidatesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcSportsUnitCandidatesNative", e),
    };
    let result = npc_sim::calc_sports_unit_candidates(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcSportsUnitCandidatesNative/serialize", e))
}

/// 체육부대 최종 선발 (W52 입대 신청자 기준)
#[napi]
pub fn calc_sports_unit_selection_native(params_json: String) -> String {
    let params: SportsUnitSelectionParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcSportsUnitSelectionNative", e),
    };
    let result = npc_sim::calc_sports_unit_selection(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcSportsUnitSelectionNative/serialize", e))
}

/// 일반병 입대 대상 랜덤 선택 (시즌당 max_count명 상한)
#[napi]
pub fn pick_general_enlistees_native(params_json: String) -> String {
    let params: PickGeneralEnlisteesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("pickGeneralEnlisteesNative", e),
    };
    let result = npc_sim::pick_general_enlistees(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("pickGeneralEnlisteesNative/serialize", e))
}

/// 조기 입대 자발적 선택 결정 (25~27세 주전 경쟁 탈락 KBL 선수)
#[napi]
pub fn calc_early_enlist_decisions_native(params_json: String) -> String {
    let params: CalcEarlyEnlistParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcEarlyEnlistDecisionsNative", e),
    };
    let result = npc_sim::calc_early_enlist_decisions(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcEarlyEnlistDecisionsNative/serialize", e))
}

/// 독립리그 KBL 스카우트 제의 계산
#[napi]
pub fn calc_indie_scout_offer_native(params_json: String) -> String {
    let params: player_engine::IndieScoutOfferParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcIndieScoutOfferNative", e),
    };
    let result = player_engine::calc_indie_scout_offer(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcIndieScoutOfferNative/serialize", e))
}

// ── 스케줄 엔진 ───────────────────────────────────────────────────────────────

#[napi]
pub fn generate_schedule_native(p: String) -> String {
    let params: GenerateScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateScheduleNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_schedule(params))
        .unwrap_or_else(|e| parse_err("generateScheduleNative/serialize", e))
}

#[napi]
pub fn generate_kbl_schedule_native(p: String) -> String {
    let params: GenerateProScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateKblScheduleNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_kbl_schedule(params))
        .unwrap_or_else(|e| parse_err("generateKblScheduleNative/serialize", e))
}

#[napi]
pub fn generate_abl_schedule_native(p: String) -> String {
    let params: GenerateProScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateAblScheduleNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_abl_schedule(params))
        .unwrap_or_else(|e| parse_err("generateAblScheduleNative/serialize", e))
}

#[napi]
pub fn generate_jbl_schedule_native(p: String) -> String {
    let params: GenerateProScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateJblScheduleNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_jbl_schedule(params))
        .unwrap_or_else(|e| parse_err("generateJblScheduleNative/serialize", e))
}

#[napi]
pub fn generate_hs_schedule_native(p: String) -> String {
    let params: GenerateHsScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateHsScheduleNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_hs_schedule(params))
        .unwrap_or_else(|e| parse_err("generateHsScheduleNative/serialize", e))
}

#[napi]
pub fn generate_league_schedule_native(p: String) -> String {
    let params: GenerateLeagueScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateLeagueScheduleNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_league_schedule(params))
        .unwrap_or_else(|e| parse_err("generateLeagueScheduleNative/serialize", e))
}

#[napi]
pub fn generate_all_league_schedules_native(p: String) -> String {
    let params: GenerateAllLeagueSchedulesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateAllLeagueSchedulesNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_all_league_schedules(params))
        .unwrap_or_else(|e| parse_err("generateAllLeagueSchedulesNative/serialize", e))
}

#[napi]
pub fn generate_hs_postseason_semis_native(p: String) -> String {
    let params: GenerateHsPostseasonSemisParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateHsPostseasonSemisNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_hs_postseason_semis(params))
        .unwrap_or_else(|e| parse_err("generateHsPostseasonSemisNative/serialize", e))
}

#[napi]
pub fn generate_hs_postseason_final_native(p: String) -> String {
    let params: GenerateHsPostseasonFinalParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateHsPostseasonFinalNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_hs_postseason_final(params))
        .unwrap_or_else(|e| parse_err("generateHsPostseasonFinalNative/serialize", e))
}

#[napi]
pub fn shuffle_hs_groups_native(p: String) -> String {
    let params: ShuffleHsGroupsParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("shuffleHsGroupsNative", e),
    };
    serde_json::to_string(&schedule_engine::shuffle_hs_groups(params))
        .unwrap_or_else(|e| parse_err("shuffleHsGroupsNative/serialize", e))
}

// ── 포스트시즌 엔진 ───────────────────────────────────────────────────────────

#[napi]
pub fn build_kbl_bracket_native(p: String) -> String {
    let params: BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildKblBracketNative", e),
    };
    serde_json::to_string(&postseason_engine::build_kbl_bracket(params))
        .unwrap_or_else(|e| parse_err("buildKblBracketNative/serialize", e))
}

#[napi]
pub fn build_abl_bracket_native(p: String) -> String {
    let params: BuildAblBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildAblBracketNative", e),
    };
    serde_json::to_string(&postseason_engine::build_abl_bracket(params))
        .unwrap_or_else(|e| parse_err("buildAblBracketNative/serialize", e))
}

#[napi]
pub fn build_univ_bracket_native(p: String) -> String {
    let params: BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildUnivBracketNative", e),
    };
    serde_json::to_string(&postseason_engine::build_univ_bracket(params))
        .unwrap_or_else(|e| parse_err("buildUnivBracketNative/serialize", e))
}

#[napi]
pub fn build_jbl_bracket_native(p: String) -> String {
    let params: BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildJblBracketNative", e),
    };
    serde_json::to_string(&postseason_engine::build_jbl_bracket(params))
        .unwrap_or_else(|e| parse_err("buildJblBracketNative/serialize", e))
}

#[napi]
pub fn build_ind_bracket_native(p: String) -> String {
    let params: BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildIndBracketNative", e),
    };
    serde_json::to_string(&postseason_engine::build_ind_bracket(params))
        .unwrap_or_else(|e| parse_err("buildIndBracketNative/serialize", e))
}

#[napi]
pub fn apply_game_to_series_native(p: String) -> String {
    let params: ApplyGameToSeriesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("applyGameToSeriesNative", e),
    };
    serde_json::to_string(&postseason_engine::apply_game_to_series(params))
        .unwrap_or_else(|e| parse_err("applyGameToSeriesNative/serialize", e))
}

#[napi]
pub fn fill_next_series_native(p: String) -> String {
    let params: FillNextSeriesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("fillNextSeriesNative", e),
    };
    serde_json::to_string(&postseason_engine::fill_next_series(params))
        .unwrap_or_else(|e| parse_err("fillNextSeriesNative/serialize", e))
}

#[napi]
pub fn resolve_non_protagonist_series_native(p: String) -> String {
    let params: ResolveNpcSeriesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("resolveNonProtagonistSeriesNative", e),
    };
    serde_json::to_string(&postseason_engine::resolve_non_protagonist_series(params))
        .unwrap_or_else(|e| parse_err("resolveNonProtagonistSeriesNative/serialize", e))
}

#[napi]
pub fn make_series_game_native(p: String) -> String {
    let params: MakeSeriesGameParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("makeSeriesGameNative", e),
    };
    serde_json::to_string(&postseason_engine::make_series_game(params))
        .unwrap_or_else(|e| parse_err("makeSeriesGameNative/serialize", e))
}

#[napi]
pub fn shuffle_abl_conferences_native(p: String) -> String {
    let params: ShuffleAblConferencesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("shuffleAblConferencesNative", e),
    };
    serde_json::to_string(&postseason_engine::shuffle_abl_conferences(params))
        .unwrap_or_else(|e| parse_err("shuffleAblConferencesNative/serialize", e))
}

// ── 주간 엔진 ─────────────────────────────────────────────────────────────────

#[napi]
pub fn week_calc_facility_eff_native(p: String) -> String {
    let params: week_engine::FacilityEffPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcFacilityEffNative", e),
    };
    serde_json::to_string(&week_engine::calc_facility_eff(params))
        .unwrap_or_else(|e| parse_err("weekCalcFacilityEffNative/serialize", e))
}

#[napi]
pub fn week_calc_weekly_net_native(p: String) -> String {
    let params: week_engine::WeeklyNetPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcWeeklyNetNative", e),
    };
    serde_json::to_string(&week_engine::calc_weekly_net(params))
        .unwrap_or_else(|e| parse_err("weekCalcWeeklyNetNative/serialize", e))
}

#[napi]
pub fn week_calc_injury_native(p: String) -> String {
    let params: week_engine::InjuryPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcInjuryNative", e),
    };
    serde_json::to_string(&week_engine::calc_injury(params))
        .unwrap_or_else(|e| parse_err("weekCalcInjuryNative/serialize", e))
}

#[napi]
pub fn week_calc_hs_admissions_native(p: String) -> String {
    let params: week_engine::HsAdmissionsPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcHsAdmissionsNative", e),
    };
    serde_json::to_string(&week_engine::calc_hs_admissions(params))
        .unwrap_or_else(|e| parse_err("weekCalcHsAdmissionsNative/serialize", e))
}

#[napi]
pub fn week_calc_trade_rumor_native(p: String) -> String {
    let params: week_engine::TradeRumorPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcTradeRumorNative", e),
    };
    serde_json::to_string(&week_engine::calc_trade_rumor(params))
        .unwrap_or_else(|e| parse_err("weekCalcTradeRumorNative/serialize", e))
}

#[napi]
pub fn week_calc_exam_result_native(p: String) -> String {
    let params: week_engine::ExamPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcExamResultNative", e),
    };
    serde_json::to_string(&week_engine::calc_exam_result(params))
        .unwrap_or_else(|e| parse_err("weekCalcExamResultNative/serialize", e))
}

#[napi]
pub fn week_calc_military_native(p: String) -> String {
    let params: week_engine::MilitaryWeekPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcMilitaryNative", e),
    };
    serde_json::to_string(&week_engine::calc_military_week(params))
        .unwrap_or_else(|e| parse_err("weekCalcMilitaryNative/serialize", e))
}

#[napi]
pub fn week_calc_npc_fallback_native(p: String) -> String {
    let params: week_engine::NpcFallbackPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcNpcFallbackNative", e),
    };
    serde_json::to_string(&week_engine::calc_npc_fallback(params))
        .unwrap_or_else(|e| parse_err("weekCalcNpcFallbackNative/serialize", e))
}

#[napi]
pub fn week_roll_random_batch_native(count: u32) -> String {
    serde_json::to_string(&week_engine::roll_random_batch(count))
        .unwrap_or_else(|e| parse_err("weekRollRandomBatchNative/serialize", e))
}

#[napi]
pub fn week_calc_npc_injuries_native(p: String) -> String {
    let params: week_engine::NpcInjuriesPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcNpcInjuriesNative", e),
    };
    serde_json::to_string(&week_engine::calc_npc_injuries(params))
        .unwrap_or_else(|e| parse_err("weekCalcNpcInjuriesNative/serialize", e))
}

// ── roster_gen (R3a: Lazy 리그 로스터 생성) ──────────────────────────────────

/// 리그 활성화 시점 로스터 생성 — worldSeed 결정적 (DESIGN.md §8.3)
#[napi]
pub fn generate_league_roster_native(params_json: String) -> String {
    let params: roster_gen::GenerateLeagueRosterParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("generateLeagueRosterNative", e),
    };
    let result = roster_gen::generate_league_roster(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("generateLeagueRosterNative/serialize", e))
}

// ── scouting_engine ───────────────────────────────────────────────────────────

#[napi]
pub fn apply_scouting_noise_native(params_json: String) -> String {
    match serde_json::from_str(&params_json) {
        Ok(p) => serde_json::to_string(&scouting_engine::apply_scouting_noise(p)).unwrap_or_default(),
        Err(e) => format!(r#"{{"error":"{}"}}"#, e),
    }
}

// ── team_engine ───────────────────────────────────────────────────────────────

macro_rules! napi_team {
    ($fn_name:ident, $rust_fn:expr) => {
        #[napi]
        pub fn $fn_name(params_json: String) -> String {
            match serde_json::from_str(&params_json) {
                Ok(p) => serde_json::to_string(&$rust_fn(p)).unwrap_or_default(),
                Err(e) => format!(r#"{{"error":"{}"}}"#, e),
            }
        }
    };
}

napi_team!(eval_callup_candidates_native,        team_engine::eval_callup_candidates);
napi_team!(eval_calldown_candidates_native,      team_engine::eval_calldown_candidates);
napi_team!(eval_release_priority_native,         team_engine::eval_release_priority);
napi_team!(eval_fa_bid_native,                   team_engine::eval_fa_bid);
napi_team!(eval_renewal_offer_native,            team_engine::eval_renewal_offer);
napi_team!(eval_new_contract_native,             team_engine::eval_new_contract);
napi_team!(eval_retirement_suggestion_native,    team_engine::eval_retirement_suggestion);
napi_team!(generate_trade_proposals_native,      team_engine::generate_trade_proposals);
napi_team!(eval_trade_value_native,              team_engine::eval_trade_value);
napi_team!(eval_medical_test_native,             team_engine::eval_medical_test);
napi_team!(calc_win_now_pressure_update_native,  team_engine::calc_win_now_pressure_update);
napi_team!(calc_scouting_improvement_native,     team_engine::calc_scouting_improvement);

// ── player_agent ──────────────────────────────────────────────────────────────

napi_team!(player_eval_fa_decision_native,           player_agent::player_eval_fa_decision);
napi_team!(player_eval_trade_response_native,        player_agent::player_eval_trade_response);
napi_team!(player_eval_contract_offer_native,        player_agent::player_eval_contract_offer);
napi_team!(player_eval_retirement_response_native,   player_agent::player_eval_retirement_response);
napi_team!(player_rank_fa_offers_native,             player_agent::player_rank_fa_offers);

#[napi]
pub fn update_player_loyalty_native(params_json: String) -> String {
    match serde_json::from_str::<player_agent::UpdateLoyaltyParams>(&params_json) {
        Ok(p) => serde_json::to_string(&player_agent::update_player_loyalty(p)).unwrap_or_default(),
        Err(e) => format!(r#"{{"error":"{}"}}"#, e),
    }
}
