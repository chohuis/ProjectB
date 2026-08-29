#![deny(clippy::all)]

use napi_derive::napi;
// 씨앗 기반 난수 — 리그 경기 재현성. `StdRng::seed_from_u64`가 이 트레이트에 있다
use rand::{Rng, SeedableRng};

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
mod tournament;
mod group_stage;
mod survival;
mod rest_rules;
mod staff_gen;
mod staff_lifecycle;
mod postseason_engine;
mod week_engine;
mod team_engine;
mod player_agent;
mod scouting_engine;
mod roster_gen;
mod synthetic_trajectory;
mod relationship;
mod career_history;
mod military_roster;
mod draft;
mod national_team;
mod free_agency;
mod finance;
mod campus_events;

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
/// 계측 전용 — contact_q 밴드 분포를 읽는다 (릴리스 동작에 영향 없음)
#[napi]
pub fn contact_band_stats_native() -> String {
    let (bands, avg) = match_engine::read_contact_bands();
    serde_json::json!({
        "bands": bands, "avgContactQ": (avg * 100.0).round() / 100.0,
        "labels": ["72+", "60~72", "52~60", "45~52", "38~45", "<38"],
    }).to_string()
}

/// 계측 전용 — 카운터 초기화
#[napi]
pub fn reset_contact_bands_native() -> String {
    match_engine::reset_contact_bands();
    "{\"ok\":true}".to_string()
}

/// C-3 어댑터(완성) — 끝난 경기를 리그 계약(SimGameResult) 전체로 바꾼다.
/// rot_idx·pitcher_conditions까지 채운다 — 안 넘기면 투수가 무한정 던진다.
#[napi]
pub fn match_to_sim_result_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P {
        state: types::MatchState,
        home_team_id: String,
        away_team_id: String,
        week: i32,
        #[serde(default)] conditions: std::collections::HashMap<String, sim_types::SimPlayerCondition>,
        #[serde(default)] home_rot_idx: usize,
        #[serde(default)] away_rot_idx: usize,
    }
    let p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("matchToSimResultNative", e),
    };
    let r = match_engine::to_sim_game_result(&p.state, &p.home_team_id, &p.away_team_id,
        p.week, &p.conditions, p.home_rot_idx, p.away_rot_idx);
    serde_json::to_string(&r).unwrap_or_else(|e| parse_err("matchToSimResultNative/serialize", e))
}

/// C-3 어댑터 — 끝난 경기를 리그 계약(MatchResult)으로 바꾼다.
/// **변환만 한다.** 누락이 있으면 여기가 아니라 누적(C-1·C-2)이 안 된 것이다.
#[napi]
pub fn match_to_result_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P { state: types::MatchState, home_team_id: String, away_team_id: String }
    let p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("matchToResultNative", e),
    };
    let r = match_engine::to_match_result(&p.state, &p.home_team_id, &p.away_team_id);
    serde_json::to_string(&r).unwrap_or_else(|e| parse_err("matchToResultNative/serialize", e))
}

/// 경기 상태를 만든다.
///
/// **씨앗을 주면 재현된다** — 같은 씨앗·같은 입력이면 언제 몇 번을 돌려도
/// 같은 경기가 된다. 리그 경기(`gameSimulator.ts`)가 그렇게 부른다.
/// 안 주면 예전 그대로 `thread_rng`다 — 주인공 경기가 그쪽이다.
#[napi]
pub fn start_match_native(options_json: String) -> String {
    let opts: MatchStartOptions = match serde_json::from_str(&options_json) {
        Ok(v) => v,
        Err(e) => return parse_err("startMatchNative", e),
    };
    // ⚠ **0은 "씨앗 없음"이다.** `MatchState.rng_seed`가 0을 그 뜻으로 쓰므로
    // 여기서도 같게 본다 — 안 그러면 씨앗 0을 준 경기가 상태에선 씨앗 없음이
    // 되어 두 번째 호출부터 조용히 `thread_rng`로 새 버린다
    let state = match opts.seed.filter(|s| *s != 0) {
        Some(seed) => {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            let mut st = match_engine::create_initial_match_state(&opts, &mut rng);
            // **다음 호출이 이어받을 씨앗**을 남긴다. 준 씨앗을 그대로 두면
            // `simToGameEnd`가 라인업을 만들 때 쓴 난수를 처음부터 다시 쓴다
            st.rng_seed = rng.gen::<u64>() | 1;
            st
        }
        None => {
            let mut rng = rand::thread_rng();
            match_engine::create_initial_match_state(&opts, &mut rng)
        }
    };
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
    // 상태가 씨앗을 들고 있으면 이어받는다 — `startMatchNative`가 심어 둔다.
    // 0이면 예전 그대로 `thread_rng`다
    let result = if state.rng_seed != 0 {
        let mut rng = rand::rngs::StdRng::seed_from_u64(state.rng_seed);
        let mut r = match_engine::auto_simulate_to_game_end(&state, &mut rng);
        r.rng_seed = rng.gen::<u64>() | 1;
        r
    } else {
        let mut rng = rand::thread_rng();
        match_engine::auto_simulate_to_game_end(&state, &mut rng)
    };
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

/// FA 시장 정산 — 등급·계약·보상선수를 한 번에
#[napi]
pub fn resolve_fa_market_native(params_json: String) -> String {
    let params: free_agency::FaMarketParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("resolveFaMarketNative", e),
    };
    let result = free_agency::resolve_market(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("resolveFaMarketNative/serialize", e))
}

// ── 개인 재정 (Phase 7-5 F-3) ─────────────────────────────────
//
// 화면은 결과를 **표시만** 한다. 예전 FinancePage는 Svelte 안에서 OVR·사기로
// 수입을 즉석 계산해 `money`와 무관한 숫자를 보여주고 있었다.

/// 주간 수입·지출·세금. `money`에 더할 순현금을 낸다
#[napi]
pub fn calc_club_expense_native(params_json: String) -> String {
    let params: finance::ClubExpenseParams = match serde_json::from_str(&params_json) {
        Ok(v) => v, Err(e) => return parse_err("calcClubExpenseNative", e),
    };
    serde_json::to_string(&finance::calc_club_expense(params))
        .unwrap_or_else(|e| parse_err("calcClubExpenseNative/serialize", e))
}

#[napi]
pub fn calc_club_revenue_native(params_json: String) -> String {
    let params: finance::ClubRevenueParams = match serde_json::from_str(&params_json) {
        Ok(v) => v, Err(e) => return parse_err("calcClubRevenueNative", e),
    };
    serde_json::to_string(&finance::calc_club_revenue(params))
        .unwrap_or_else(|e| parse_err("calcClubRevenueNative/serialize", e))
}

#[napi]
pub fn calc_weekly_finance_native(params_json: String) -> String {
    let params: finance::WeeklyFinanceParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcWeeklyFinanceNative", e),
    };
    serde_json::to_string(&finance::calc_weekly_finance(params))
        .unwrap_or_else(|e| parse_err("calcWeeklyFinanceNative/serialize", e))
}

/// 명성 연동 스폰서 오퍼. 학생·독립은 빈 결과 (아마추어 규정)
#[napi]
pub fn calc_sponsor_offers_native(params_json: String) -> String {
    let params: finance::SponsorOfferParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcSponsorOffersNative", e),
    };
    serde_json::to_string(&finance::calc_sponsor_offers(params))
        .unwrap_or_else(|e| parse_err("calcSponsorOffersNative/serialize", e))
}

/// 개인 트레이닝 구독 보너스 — **팀 자원에 반비례**한다
#[napi]
pub fn calc_training_bonus_native(params_json: String) -> String {
    let params: finance::TrainingBonusParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcTrainingBonusNative", e),
    };
    serde_json::to_string(&finance::calc_training_bonus(params))
        .unwrap_or_else(|e| parse_err("calcTrainingBonusNative/serialize", e))
}

/// 시즌말 투자 정산. 원금 손실 가능, 전액 소실은 없음
#[napi]
pub fn resolve_investment_native(params_json: String) -> String {
    let params: finance::InvestmentParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("resolveInvestmentNative", e),
    };
    serde_json::to_string(&finance::resolve_investment(params))
        .unwrap_or_else(|e| parse_err("resolveInvestmentNative/serialize", e))
}

/// 사치품 소비 — 동료면 관계도, 자기 소비면 성격에 따라 명성 ±
#[napi]
pub fn calc_luxury_native(params_json: String) -> String {
    let params: finance::LuxuryParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcLuxuryNative", e),
    };
    serde_json::to_string(&finance::calc_luxury(params))
        .unwrap_or_else(|e| parse_err("calcLuxuryNative/serialize", e))
}

// ── 대학 비경기성 이벤트 (Phase 7-7) ─────────────────────────

/// 전국대학선수쇼케이스 — 팀 추천 + 주목도 상위 + 구단 지명 세 경로
#[napi]
pub fn run_showcase_native(params_json: String) -> String {
    let params: campus_events::ShowcaseParams = match serde_json::from_str(&params_json) {
        Ok(v) => v, Err(e) => return parse_err("runShowcaseNative", e),
    };
    serde_json::to_string(&campus_events::run_showcase(params))
        .unwrap_or_else(|e| parse_err("runShowcaseNative/serialize", e))
}

/// 대학 올스타전(북 vs 남) — 포지션 쿼터 + 대학당 캡
#[napi]
pub fn run_allstar_native(params_json: String) -> String {
    let params: campus_events::AllStarParams = match serde_json::from_str(&params_json) {
        Ok(v) => v, Err(e) => return parse_err("runAllstarNative", e),
    };
    serde_json::to_string(&campus_events::run_allstar(params))
        .unwrap_or_else(|e| parse_err("runAllstarNative/serialize", e))
}

/// 국가대표 발탁 — 그 해 대회가 없으면 빈 결과
#[napi]
pub fn select_national_squad_native(params_json: String) -> String {
    let params: national_team::SelectSquadParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("selectNationalSquadNative", e),
    };
    let result = national_team::select_squad(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("selectNationalSquadNative/serialize", e))
}

/// 국제대회 결과 — 경기는 시뮬하지 않고 대표팀 전력으로 순위를 뽑는다
#[napi]
pub fn simulate_tournament_native(params_json: String) -> String {
    let params: national_team::TournamentParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("simulateTournamentNative", e),
    };
    let result = national_team::simulate_tournament(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simulateTournamentNative/serialize", e))
}

/// 드래프트 후보 선정 — 졸업생 + 대학 재학 얼리 신청 + 독립리그 신청
#[napi]
pub fn select_draft_candidates_native(params_json: String) -> String {
    let params: draft::SelectCandidatesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("selectDraftCandidatesNative", e),
    };
    let result = draft::select_candidates(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("selectDraftCandidatesNative/serialize", e))
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

/// 훈련 계획 미리보기 — **실제 계산과 같은 `plan_load`를 쓴다.**
///
/// 훈련 화면이 자기 식으로 예상치를 만들던 시절엔 슬롯 배수(0.5)도 피로 구간
/// 승수(1.5/2.5/4.0)도 몰라서, 화면은 "피로 +7"이라 하고 엔진은 −4.25를
/// 적용했다 — 부호가 반대였다. 화면은 이제 계산하지 않고 묻는다.
#[napi]
pub fn preview_training_native(params_json: String) -> String {
    let params: growth_engine::TrainingPreviewParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("previewTrainingNative", e),
    };
    let result = growth_engine::preview_training(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("previewTrainingNative/serialize", e))
}

/// 이번 주 부상 확률 — **`calc_injury`가 굴리는 것과 같은 식이다.**
/// 훈련 화면이 예상 피로로 이걸 물어 "부상위험 N%"를 낸다.
#[napi]
pub fn injury_chance_native(params_json: String) -> String {
    let p: week_engine::InjuryPayload = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("injuryChanceNative", e),
    };
    // 유예 주는 "임계를 넘은 첫 주"라 화면 미리보기에서는 알 수 없다 — 안전하게 false
    let chance = week_engine::injury_trigger_chance(&p, false);
    serde_json::to_string(&serde_json::json!({ "chance": chance }))
        .unwrap_or_else(|e| parse_err("injuryChanceNative/serialize", e))
}

/// 폼 무너짐 조회 — **경기에 걸리는 것과 같은 식이다.**
/// 훈련·내 정보 화면이 "제구 −3 · 커맨드 −2"를 이걸로 띄운다.
#[napi]
pub fn form_penalty_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P { difficulty: f64, control: f64 }
    let p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("formPenaltyNative", e),
    };
    let (cmd, ctl) = tuning::form_penalty(p.difficulty, p.control);
    serde_json::to_string(&serde_json::json!({ "command": cmd, "control": ctl }))
        .unwrap_or_else(|e| parse_err("formPenaltyNative/serialize", e))
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

/// 성적 점수 (−1 ~ +1) — **승강 판정이 쓰는 그 함수를 그대로 연다.**
///
/// 외국인 재계약이 능력치·나이만 봤다. 성적을 넣으려면 눈금이 필요한데,
/// TS에 다시 구현하면 표가 둘이 되어 "승강은 잘했다는데 재계약은 불가"가
/// 나온다(`CLAUDE.md`: 코드에 표를 두 번 적지 말 것 — Phase 7에서 15건).
///
/// 표본 보정이 함수 안에 있다 — 투수 40이닝·타자 120타석 미만이면 그
/// 비율만큼만 반영되고 0이닝이면 0이다. 기존 주석이 걱정하던 "표본이 얇은
/// 선수를 억울하게 자른다"가 여기서 이미 풀린다.
#[napi]
pub fn form_score_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P {
        perf: Option<sim_types::RosterPerf>,
        is_pitcher: bool,
        #[serde(default)]
        rules: Option<team_engine::PromotionRules>,
    }
    let p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("formScoreNative", e),
    };
    let rules = p.rules.unwrap_or_default();
    let v = team_engine::form_score(p.perf.as_ref(), p.is_pitcher, &rules);
    serde_json::to_string(&v).unwrap_or_else(|e| parse_err("formScoreNative/serialize", e))
}

/// 포지션 공백 메우기 — **시즌 중에도 부를 수 있게 연다.**
///
/// 🔴 이 함수는 `normalize_offseason_npcs` 안에만 있어 **오프시즌에 한 번**
/// 돌았다. 그런데 공백은 시즌 중에 생긴다:
///
///   ① 1군 포수가 0명이 된다            부상·방출·은퇴
///   ② 콜업이 2군 마지막 포수를 올린다   (1군 0명이 2군 0명보다 나쁘다)
///   ③ 2군 포수가 0명이 된다
///   ④ 아무도 안 메운다                 이 함수가 오프시즌 전용이라
///
/// ④가 이 export로 닫힌다. 실제 야구도 포수가 없으면 다른 야수가 마스크를 쓴다.
///
/// ⚠ **공백이 있는 팀의 선수만 보낸다.** 전량(7,332명)을 주마다 왕복시키면
/// 이 프로젝트가 줄인 IPC를 도로 까먹는다. 공백은 리그당 1~4팀이다.
/// 팀 안 등번호를 유일하게 만든다 — **문제가 있는 팀의 선수만 보낸다.**
///
/// ⚠ 팀 선수를 **모두** 보내야 한다. 빈 번호를 팀 단위로 세므로 일부만
///   보내면 이미 쓰는 번호를 다시 준다.
#[napi]
pub fn fix_jersey_numbers_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P { npcs: Vec<sim_types::NpcSaveState> }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Change { npc_id: String, team_id: String, from: i32, to: i32 }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct R { changes: Vec<Change> }
    let mut p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("fixJerseyNumbersNative", e),
    };
    let before: Vec<i32> = p.npcs.iter().map(|n| n.jersey_number).collect();
    npc_sim::fix_jersey_numbers(&mut p.npcs);
    // **바뀐 사람만 돌려준다** — 전량을 얹으면 다른 필드까지 덮어쓴다
    let changes: Vec<Change> = p.npcs.iter().zip(before.iter())
        .filter(|(n, b)| n.jersey_number != **b)
        .map(|(n, b)| Change {
            npc_id: n.npc_id.clone(),
            team_id: n.current_team.clone(),
            from: *b,
            to: n.jersey_number,
        })
        .collect();
    serde_json::to_string(&R { changes })
        .unwrap_or_else(|e| parse_err("fixJerseyNumbersNative/serialize", e))
}

#[napi]
pub fn fix_position_gaps_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P { npcs: Vec<sim_types::NpcSaveState>, season_year: i32 }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Change { npc_id: String, team_id: String, from: String, to: String }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct R { changes: Vec<Change> }
    let mut p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("fixPositionGapsNative", e),
    };
    let before: Vec<String> = p.npcs.iter().map(|n| n.position.clone()).collect();
    npc_sim::fix_position_gaps(&mut p.npcs, p.season_year);
    // **바뀐 사람만 돌려준다.** 전량을 돌려주면 호출부가 그걸 스토어에 얹으면서
    // 다른 필드까지 덮어쓴다 — 그 사이 다른 처리가 바꾼 값이 사라진다
    let changes: Vec<Change> = p.npcs.iter().zip(before.iter())
        .filter(|(n, b)| n.position != **b)
        .map(|(n, b)| Change {
            npc_id: n.npc_id.clone(),
            team_id: n.current_team.clone(),
            from: b.clone(),
            to: n.position.clone(),
        })
        .collect();
    serde_json::to_string(&R { changes })
        .unwrap_or_else(|e| parse_err("fixPositionGapsNative/serialize", e))
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

/// **유망주 순위 (주간 TOP10)** — 점수 계산과 정렬을 함께 한다.
///
/// 🔴 이 계산이 통째로 TS(`top10Engine.ts`)에 있었다. `simNpcScout`는
///   id 뒷자리로 만드는 **유사난수**였다 — `Math.random()`은 아니지만
///   난수를 TS가 만드는 것은 같다.
/// ⚠ **정렬까지 여기서 한다.** 점수만 돌려주면 동점 처리가 두 곳에서 갈린다.
#[napi]
pub fn calc_prospect_rank_native(params_json: String) -> String {
    let params: player_engine::ProspectRankParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcProspectRankNative", e),
    };
    let result = player_engine::calc_prospect_rank(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcProspectRankNative/serialize", e))
}

/// **주인공의 잠재력·성장률** — 새 게임에서 한 번 굴린다.
///
/// 🔴 이 둘을 **화면(`NewGamePage.svelte`)이 `Math.random()`으로 굴리고
///   있었다.** NPC는 `roster_gen`이 만드는데 주인공만 화면에서 만들었다.
/// ⚠ **분포는 안 바꿨다** — 옮기기만 했다. 값은 `protagonistRules`가 정본이다.
#[napi]
pub fn gen_protagonist_hidden_native(params_json: String) -> String {
    let params: roster_gen::ProtagonistHiddenParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("genProtagonistHiddenNative", e),
    };
    let result = roster_gen::gen_protagonist_hidden(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("genProtagonistHiddenNative/serialize", e))
}

/// **투수 승패 판정** — W · L · SV · HD · ND.
///
/// 🔴 **이 규칙이 두 벌이었다.** `npc_sim`의 클로저 안에 갇혀 있어서
///   TS(`applyGameOutcome.ts`)가 손으로 옮겨 적었고, 그 사본이 이미
///   갈라져 있었다 — 세이브 조건과 여유 점수가 달랐다.
///   **주인공만 다른 승패 규칙**을 쓰고 있었다는 뜻이다.
///
/// ⚠ 이걸 내보내는 이유는 하나다 — TS가 규칙을 **다시 적지 않게** 하려고.
#[napi]
pub fn calc_pitcher_decision_native(params_json: String) -> String {
    let params: npc_sim::PitcherDecisionParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("calcPitcherDecisionNative", e),
    };
    let result = npc_sim::calc_pitcher_decision(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcPitcherDecisionNative/serialize", e))
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

/// 권역 주말리그 — 권역 크기가 달라도 팀당 경기 수를 균등하게 (Phase 5-3)
#[napi]
pub fn generate_regional_schedule_native(p: String) -> String {
    let params: GenerateRegionalScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateRegionalScheduleNative", e),
    };
    serde_json::to_string(&schedule_engine::generate_regional_schedule(params))
        .unwrap_or_else(|e| parse_err("generateRegionalScheduleNative/serialize", e))
}

// ── 토너먼트 (Phase 5-4) ──────────────────────────────────────────────────────

/// 권역 순위 → 전국대회 참가팀 선발 (권역 크기 비례 배분 + 와일드카드)
#[napi]
pub fn select_tournament_entrants_native(p: String) -> String {
    let params: tournament::SelectEntrantsParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("selectTournamentEntrantsNative", e),
    };
    serde_json::to_string(&tournament::select_tournament_entrants(params))
        .unwrap_or_else(|e| parse_err("selectTournamentEntrantsNative/serialize", e))
}

/// 시드 순 참가팀 → 전 라운드 브래킷 뼈대 (부전승 자동 반영)
#[napi]
pub fn generate_tournament_bracket_native(p: String) -> String {
    let params: tournament::GenerateTournamentParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateTournamentBracketNative", e),
    };
    serde_json::to_string(&tournament::generate_tournament_bracket(params))
        .unwrap_or_else(|e| parse_err("generateTournamentBracketNative/serialize", e))
}

/// 한 라운드 결과 반영 → 다음 라운드 대진 확정
#[napi]
pub fn advance_tournament_round_native(p: String) -> String {
    let params: tournament::AdvanceTournamentParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("advanceTournamentRoundNative", e),
    };
    serde_json::to_string(&tournament::advance_tournament_round(params))
        .unwrap_or_else(|e| parse_err("advanceTournamentRoundNative/serialize", e))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BracketRoundQuery {
    bracket: tournament::TournamentBracket,
    round: u32,
}

/// 해당 라운드에서 **실제로 치를** 경기만 일정 형태로 (부전승·미확정 제외)
#[napi]
pub fn tournament_round_schedule_native(p: String) -> String {
    let q: BracketRoundQuery = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("tournamentRoundScheduleNative", e),
    };
    serde_json::to_string(&tournament::bracket_to_schedule(&q.bracket, q.round))
        .unwrap_or_else(|e| parse_err("tournamentRoundScheduleNative/serialize", e))
}

/// 프로 2군 축약 포스트시즌 — 상위 4팀 단판 사다리 (Phase 5-7)
#[napi]
pub fn build_farm_bracket_native(p: String) -> String {
    let params: postseason_engine::BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildFarmBracketNative", e),
    };
    serde_json::to_string(&postseason_engine::build_farm_bracket(params))
        .unwrap_or_else(|e| parse_err("buildFarmBracketNative/serialize", e))
}

// ── 스태프 생성 (Phase 6A) ────────────────────────────────────────────────────

/// 팀 목록 + 생성 규칙 → 스태프 전원 (worldSeed 결정적)
#[napi]
pub fn generate_staff_native(p: String) -> String {
    let params: staff_gen::GenerateStaffParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateStaffNative", e),
    };
    serde_json::to_string(&staff_gen::generate_staff(params))
        .unwrap_or_else(|e| parse_err("generateStaffNative/serialize", e))
}

/// 시즌 종료 → 스태프 나이·경력성장·은퇴·경질·이동 (Phase 6B)
#[napi]
pub fn advance_staff_season_native(p: String) -> String {
    let params: staff_lifecycle::AdvanceStaffParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("advanceStaffSeasonNative", e),
    };
    serde_json::to_string(&staff_lifecycle::advance_staff_season(params))
        .unwrap_or_else(|e| parse_err("advanceStaffSeasonNative/serialize", e))
}

// ── 군경팀 로스터 (Phase 6.5) ────────────────────────────────────────────────

/// 상무 로스터 — 복무 중인 선수 + 계급 + 전역 연도 (원소속은 실재 팀에서 지정)
#[napi]
pub fn generate_military_roster_native(p: String) -> String {
    let params: military_roster::GenerateMilitaryRosterParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateMilitaryRosterNative", e),
    };
    serde_json::to_string(&military_roster::generate_military_roster(params))
        .unwrap_or_else(|e| parse_err("generateMilitaryRosterNative/serialize", e))
}

// ── 경력 이력 (Phase 6.5) ────────────────────────────────────────────────────

/// 새 게임 시점의 과거 경력 (입단·이적) — slot.db transactions로 들어간다
#[napi]
pub fn generate_career_history_native(p: String) -> String {
    let params: career_history::GenerateCareerHistoryParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateCareerHistoryNative", e),
    };
    serde_json::to_string(&career_history::generate_career_history(params))
        .unwrap_or_else(|e| parse_err("generateCareerHistoryNative/serialize", e))
}

// ── 관계도 (Phase 6C) ────────────────────────────────────────────────────────

/// 새로 만난 사람들의 초기 관계값 (중립 0 + 성향 편차)
#[napi]
pub fn init_relations_native(p: String) -> String {
    let params: relationship::InitRelationParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("initRelationsNative", e),
    };
    serde_json::to_string(&relationship::init_relations(params))
        .unwrap_or_else(|e| parse_err("initRelationsNative/serialize", e))
}

/// 주간 관계 갱신 — contact가 together인 상대만 움직인다
#[napi]
pub fn weekly_relations_native(p: String) -> String {
    let params: relationship::WeeklyRelationParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weeklyRelationsNative", e),
    };
    serde_json::to_string(&relationship::weekly_relations(params))
        .unwrap_or_else(|e| parse_err("weeklyRelationsNative/serialize", e))
}

/// 시즌 종료 — together는 총평 가산, apart는 감쇠, ended는 동결
#[napi]
pub fn season_relations_native(p: String) -> String {
    let params: relationship::SeasonRelationParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("seasonRelationsNative", e),
    };
    serde_json::to_string(&relationship::season_relations(params))
        .unwrap_or_else(|e| parse_err("seasonRelationsNative/serialize", e))
}

/// 팀 이동 감쇠 (감쇠 후 보존 — 행은 남는다)
#[napi]
pub fn relation_move_decay_native(p: String) -> String {
    let params: relationship::MoveDecayParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("relationMoveDecayNative", e),
    };
    serde_json::to_string(&relationship::move_decay(params))
        .unwrap_or_else(|e| parse_err("relationMoveDecayNative/serialize", e))
}

/// 관계 → 실제 판정 보정 (보직 OVR 평가 · 훈련 효율)
#[napi]
pub fn relation_effects_native(p: String) -> String {
    let params: relationship::RelationEffectParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("relationEffectsNative", e),
    };
    serde_json::to_string(&relationship::relation_effects(params))
        .unwrap_or_else(|e| parse_err("relationEffectsNative/serialize", e))
}

/// 7단계 라벨 표. TS `types/relationship.ts`의 미러가 어긋났는지 대조하는 데 쓴다
#[napi]
pub fn relation_label_table_native() -> String {
    serde_json::to_string(&relationship::label_table())
        .unwrap_or_else(|e| parse_err("relationLabelTableNative/serialize", e))
}

// ── 의무 휴식 (Phase 5-8) ─────────────────────────────────────────────────────

/// 투구수별 의무 휴식을 채웠는지 (일 단위 — 주 단위로는 주말 연투가 안 걸린다)
#[napi]
pub fn check_pitcher_rest_native(p: String) -> String {
    let params: rest_rules::RestCheckParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("checkPitcherRestNative", e),
    };
    serde_json::to_string(&rest_rules::check_rest(params))
        .unwrap_or_else(|e| parse_err("checkPitcherRestNative/serialize", e))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PitchLimitQuery { league_id: String }

/// 리그별 투구수 상한 (고교 105 / 그 외 120)
#[napi]
pub fn league_pitch_limit_native(p: String) -> String {
    let q: PitchLimitQuery = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("leaguePitchLimitNative", e),
    };
    serde_json::to_string(&serde_json::json!({
        "hard": tuning::league_pitch_limit(&q.league_id),
        "soft": tuning::league_pitch_soft(&q.league_id),
    })).unwrap_or_else(|e| parse_err("leaguePitchLimitNative/serialize", e))
}

// ── 독립 생존리그 (Phase 5-6) ─────────────────────────────────────────────────

/// 한 단계 일정 — 생존팀끼리 새 라운드로빈
#[napi]
pub fn generate_survival_stage_native(p: String) -> String {
    let params: survival::SurvivalStageParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("generateSurvivalStageNative", e),
    };
    serde_json::to_string(&survival::generate_survival_stage(params))
        .unwrap_or_else(|e| parse_err("generateSurvivalStageNative/serialize", e))
}

/// 단계 종료 → 생존팀·탈락팀 판정
#[napi]
pub fn survival_cutoff_native(p: String) -> String {
    let params: survival::SurvivalCutoffParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("survivalCutoffNative", e),
    };
    serde_json::to_string(&survival::survival_cutoff(params))
        .unwrap_or_else(|e| parse_err("survivalCutoffNative/serialize", e))
}

/// 4차 Stage 사다리 — 준PO(단판) → PO(단판) → 챔피언결정전(3전2승)
#[napi]
pub fn build_ind_ladder_native(p: String) -> String {
    let params: survival::BuildIndLadderParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildIndLadderNative", e),
    };
    serde_json::to_string(&survival::build_ind_ladder(params))
        .unwrap_or_else(|e| parse_err("buildIndLadderNative/serialize", e))
}

// ── 조별예선 (Phase 5-5d) ─────────────────────────────────────────────────────

/// 참가팀 → 조 추첨 + 예선 일정 (worldSeed 결정적)
#[napi]
pub fn build_group_stage_native(p: String) -> String {
    let params: group_stage::BuildGroupStageParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildGroupStageNative", e),
    };
    serde_json::to_string(&group_stage::build_group_stage(params))
        .unwrap_or_else(|e| parse_err("buildGroupStageNative/serialize", e))
}

/// 예선 경기 결과 → 조 순위 반영
#[napi]
pub fn apply_group_results_native(p: String) -> String {
    let params: group_stage::ApplyGroupResultsParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("applyGroupResultsNative", e),
    };
    serde_json::to_string(&group_stage::apply_group_results(params))
        .unwrap_or_else(|e| parse_err("applyGroupResultsNative/serialize", e))
}

/// 예선 통과팀 (본선 시드 순)
#[napi]
pub fn group_stage_qualifiers_native(p: String) -> String {
    let stage: group_stage::GroupStage = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("groupStageQualifiersNative", e),
    };
    serde_json::to_string(&group_stage::group_stage_qualifiers(&stage))
        .unwrap_or_else(|e| parse_err("groupStageQualifiersNative/serialize", e))
}

/// 우승팀 (결승 승자 미정이면 null) — 시즌 종료 시상·기록용
#[napi]
pub fn tournament_champion_native(p: String) -> String {
    let b: tournament::TournamentBracket = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("tournamentChampionNative", e),
    };
    serde_json::to_string(&tournament::tournament_champion(&b))
        .unwrap_or_else(|e| parse_err("tournamentChampionNative/serialize", e))
}

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
pub fn build_jbl_bracket_native(p: String) -> String {
    let params: BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("buildJblBracketNative", e),
    };
    serde_json::to_string(&postseason_engine::build_jbl_bracket(params))
        .unwrap_or_else(|e| parse_err("buildJblBracketNative/serialize", e))
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
pub fn week_calc_exam_result_native(p: String) -> String {
    let params: week_engine::ExamPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcExamResultNative", e),
    };
    serde_json::to_string(&week_engine::calc_exam_result(params))
        .unwrap_or_else(|e| parse_err("weekCalcExamResultNative/serialize", e))
}

#[napi]
pub fn week_calc_weekly_study_native(p: String) -> String {
    let params: week_engine::WeeklyStudyPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcWeeklyStudyNative", e),
    };
    serde_json::to_string(&week_engine::calc_weekly_study(params))
        .unwrap_or_else(|e| parse_err("weekCalcWeeklyStudyNative/serialize", e))
}

#[napi]
pub fn week_calc_semester_result_native(p: String) -> String {
    let params: week_engine::SemesterPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err("weekCalcSemesterResultNative", e),
    };
    serde_json::to_string(&week_engine::calc_semester_result(params))
        .unwrap_or_else(|e| parse_err("weekCalcSemesterResultNative/serialize", e))
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
pub fn week_roll_random_batch_native(count: u32, seed: u32) -> String {
    serde_json::to_string(&week_engine::roll_random_batch(count, seed))
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

/// 외국인 교체 영입 — 시즌 종료 후 빈 슬롯만큼 새 용병을 만든다 (F-4).
/// 확장팩(ABL·JBL)이 닫혀 있어도 KBL 외국인 자리가 비지 않게 하는 경로다
#[napi]
pub fn generate_foreign_players_native(params_json: String) -> String {
    let params: roster_gen::GenerateForeignParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("generateForeignPlayersNative", e),
    };
    let result = roster_gen::generate_foreign_players(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("generateForeignPlayersNative/serialize", e))
}

/// 타 리그 Named NPC 주간 합성 성적 — worldSeed 결정적 (DESIGN.md §4.2, R3b)
#[napi]
pub fn synthetic_weekly_perf_native(params_json: String) -> String {
    let params: synthetic_trajectory::SyntheticWeeklyPerfParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err("syntheticWeeklyPerfNative", e),
    };
    let result = synthetic_trajectory::synthetic_weekly_perf(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("syntheticWeeklyPerfNative/serialize", e))
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
