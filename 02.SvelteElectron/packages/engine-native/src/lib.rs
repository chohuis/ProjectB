#![deny(clippy::all)]

use napi_derive::napi;

mod hmac;
mod types;
mod tuning;
mod match_engine;
mod sim_types;
mod npc_sim;

use types::*;
use sim_types::*;

// ── HMAC (Phase 1) ────────────────────────────────────────────────────────────

/// 세이브 데이터 HMAC-SHA256 서명 (키는 바이너리 내부)
#[napi]
pub fn compute_save_sig(snapshot: String) -> String {
    hmac::compute_save_sig(&snapshot)
}

/// 서명 검증 — 일치하면 true
#[napi]
pub fn verify_save_sig(snapshot: String, sig: String) -> bool {
    hmac::verify_save_sig(&snapshot, &sig)
}

// ── 매치 엔진 (Phase 2) ───────────────────────────────────────────────────────

fn parse_err(fn_name: &str, e: serde_json::Error) -> String {
    // Release 빌드에서는 상세 에러 숨김 (분석 힌트 차단)
    if cfg!(debug_assertions) {
        serde_json::json!({ "error": format!("[engine-native] {}: {}", fn_name, e) }).to_string()
    } else {
        let _ = (fn_name, e);
        serde_json::json!({ "error": "internal error" }).to_string()
    }
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
