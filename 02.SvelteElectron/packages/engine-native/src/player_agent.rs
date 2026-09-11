use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::sim_types::*;
use crate::team_engine::fa_eligibility_years;

// ── player_eval_fa_decision ──────────────────────────────────────────────────

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaDecisionParams {
    /// 씨앗. **0이면 예전 그대로 `thread_rng`다.**
    ///
    /// 🔴 이 넷(FA 입찰·FA 결정·트레이드 응답·오퍼 생성)이 `thread_rng`이라
    /// 같은 세이브·같은 씨앗도 실행마다 결과가 달랐다. 오프시즌을 결정적으로
    /// 바꾼 뒤에도 test:foreign 교체율이 5.0·6.0·4.7로 갈렸다 — 남은 건
    /// 여기였다. 계측을 한 번 돌려선 전후를 비교할 수 없다.
    #[serde(default)]
    pub seed: u32,
    pub personality: NpcPersonality,
    pub age: i32,
    pub ovr: f64,
    pub pro_service_years: i32,
    pub current_salary: i64,
    pub market_value: i64,
    pub team_standing: i32,
    pub total_teams: i32,
    pub expected_playing_time: f64,
    pub league_id: String,
    pub fame: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaDecisionResult {
    pub apply_fa: bool,
    pub willingness: f64,
}

pub fn player_eval_fa_decision(p: FaDecisionParams) -> FaDecisionResult {
    let threshold = fa_eligibility_years(&p.league_id);
    if p.pro_service_years < threshold {
        return FaDecisionResult { apply_fa: false, willingness: 0.0 };
    }
    let pers = &p.personality;
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    let mut w = 0.0_f64;

    let underpaid = ((p.market_value as f64 / p.current_salary.max(1) as f64) - 1.0).max(0.0);
    w += underpaid * 70.0 * (pers.greed / 100.0);

    let rank_pct = p.team_standing as f64 / p.total_teams as f64;
    w += rank_pct * 30.0 * (pers.ambition / 100.0);

    if p.expected_playing_time < 0.5 {
        w += (0.5 - p.expected_playing_time) * 50.0 * (pers.competitive_drive / 100.0);
    }
    if pers.overseas_ambition > 60.0 && p.fame >= 30.0 {
        w += (pers.overseas_ambition - 60.0) * 0.3;
    }
    w -= pers.loyalty * 0.15;
    w -= pers.stability_preference * 0.08;
    if p.age >= 33 { w -= (p.age - 32) as f64 * 3.0; }

    // FA 자격 취득 후 연차가 쌓일수록 시장 탐색 욕구 자연 증가
    // salary 데이터 없이도 일정 비율 FA 발생 (ambition 높을수록 빠름)
    let years_eligible = (p.pro_service_years - threshold) as f64;
    w += years_eligible * 3.0 * (pers.ambition / 50.0);
    w += rng.gen::<f64>() * 20.0;  // 0~20 랜덤 요소

    FaDecisionResult { apply_fa: w >= 10.0, willingness: w.clamp(0.0, 100.0) }
}

// ── player_eval_trade_response ───────────────────────────────────────────────

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeResponseParams {
    /// 씨앗. **0이면 예전 그대로 `thread_rng`다.**
    ///
    /// 🔴 이 넷(FA 입찰·FA 결정·트레이드 응답·오퍼 생성)이 `thread_rng`이라
    /// 같은 세이브·같은 씨앗도 실행마다 결과가 달랐다. 오프시즌을 결정적으로
    /// 바꾼 뒤에도 test:foreign 교체율이 5.0·6.0·4.7로 갈렸다 — 남은 건
    /// 여기였다. 계측을 한 번 돌려선 전후를 비교할 수 없다.
    #[serde(default)]
    pub seed: u32,
    pub personality: NpcPersonality,
    pub current_team_id: String,
    pub destination_team_profile: ProTeamProfile,
    pub destination_team_id: String,
    pub destination_standing: i32,
    pub total_teams: i32,
    pub expected_playing_time: f64,
    pub has_no_trade_clause: bool,
    pub current_salary: i64,
    pub new_salary: i64,
    pub age: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeResponseResult {
    pub accept: bool,
    pub block_probability: f64,
}

pub fn player_eval_trade_response(p: TradeResponseParams) -> TradeResponseResult {
    if !p.has_no_trade_clause {
        return TradeResponseResult { accept: true, block_probability: 0.0 };
    }
    let pers = &p.personality;
    let mut block = 0.0_f64;
    block += pers.loyalty * 0.6;
    block += pers.stability_preference * 0.3;
    if pers.home_team_id.as_deref() == Some(&p.current_team_id) { block += 30.0; }

    let rank_pct = p.destination_standing as f64 / p.total_teams as f64;
    block -= (1.0 - rank_pct) * 20.0 * (pers.ambition / 100.0);
    if p.expected_playing_time > 0.8 { block -= 15.0 * (pers.competitive_drive / 100.0); }
    if p.new_salary > (p.current_salary as f64 * 1.2) as i64 {
        block -= 20.0 * (pers.greed / 100.0);
    }
    let prob = (block / 100.0).clamp(0.0, 1.0);
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let roll = if p.seed != 0 {
        crate::npc_sim::LcgRand::new(p.seed | 1).next()
    } else {
        rand::thread_rng().gen::<f64>()
    };
    let accept = roll >= prob;
    TradeResponseResult { accept, block_probability: prob }
}

// ── player_eval_contract_offer — **지웠다** (2026-09-01 · C-3) ───────────────
//
// 선수가 제시안을 수락/거절하던 함수다. **TS 호출부가 0건**이었고,
// 인자로 받던 `ContractOfferResult` 를 만드는 쪽(`eval_renewal_offer`)도
// 같이 죽어 있었다 — **셋이 한 세트로 죽어 있었다.**
//
// ⚠ 주인공 재계약 협상(`contractDecision.ts`)은 **엔진을 아예 안 쓴다**
//   (Native 호출 0건). 나중에 협상을 제대로 만들 때는 그 화면이 요구하는
//   모양으로 새로 설계하는 게 맞다 — 죽은 채로 두면 "있으니까 된다"고
//   착각하게 된다. 이 저장소에서 반복해 본 형태다.
//
// ⚠ 되살릴 일이 생기면 git 에 있다.
// ── player_eval_retirement_response ─────────────────────────────────────────

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementResponseParams {
    pub personality: NpcPersonality,
    pub age: i32,
    pub ovr: f64,
    pub ovr_trend: f64,
    pub pro_service_years: i32,
    pub other_team_interest: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementResponseResult {
    pub accept: bool,
    pub seek_other_team: bool,
}

pub fn player_eval_retirement_response(p: RetirementResponseParams) -> RetirementResponseResult {
    let pers = &p.personality;
    let mut resist = 0.0_f64;
    resist += pers.competitive_drive * 0.5;
    resist += (40 - p.age.min(40)) as f64 * 1.5;
    if p.ovr_trend > -1.0 { resist += 20.0; }
    if p.other_team_interest { resist += 25.0; }
    resist -= pers.loyalty * 0.2;

    let accept = resist < 50.0;
    let seek_other = !accept && p.other_team_interest && pers.competitive_drive > 50.0;
    RetirementResponseResult { accept, seek_other_team: seek_other }
}

// ── player_rank_fa_offers ────────────────────────────────────────────────────

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaOfferWithTeam {
    pub team_id: String,
    pub team_profile: ProTeamProfile,
    pub salary: i64,
    pub years: i32,
    pub signing_bonus: i64,
    pub expected_playing_time: f64,
    pub team_standing: i32,
    pub total_teams: i32,
    pub is_current_team: bool,
}

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankFaOffersParams {
    pub personality: NpcPersonality,
    pub age: i32,
    pub offers: Vec<FaOfferWithTeam>,
    pub league_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedFaOffersResult {
    pub ranked: Vec<String>,
    pub chosen_team_id: String,
}

pub fn player_rank_fa_offers(p: RankFaOffersParams) -> RankedFaOffersResult {
    let pers = &p.personality;
    let max_salary = p.offers.iter().map(|o| o.salary).max().unwrap_or(1) as f64;

    let mut scored: Vec<(String, f64)> = p.offers.iter().map(|o| {
        let mut s = 0.0_f64;
        s += (o.salary as f64 / max_salary) * pers.greed * 0.30;
        let rank_pct = 1.0 - o.team_standing as f64 / o.total_teams as f64;
        s += rank_pct * pers.ambition * 0.20;
        s += o.expected_playing_time * pers.competitive_drive * 0.18;
        s += (o.years as f64 / 4.0) * pers.stability_preference * 0.10;
        s += (o.team_profile.prestige + o.team_profile.clubhouse_culture) / 200.0 * 10.0;
        s += o.team_profile.market_appeal / 100.0 * pers.market_preference * 8.0;
        if pers.home_team_id.as_deref() == Some(&o.team_id) { s += 15.0; }
        if o.is_current_team { s += pers.loyalty * 0.15; }
        s += pers.overseas_ambition * 0.05;
        (o.team_id.clone(), s)
    }).collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    let chosen = scored.first().map(|(id, _)| id.clone()).unwrap_or_default();
    let ranked = scored.into_iter().map(|(id, _)| id).collect();
    RankedFaOffersResult { ranked, chosen_team_id: chosen }
}

// ── update_player_loyalty ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLoyaltyParams {
    pub current_loyalty: f64,
    pub event_type: String,
    pub event_magnitude: f64,
    pub stability_preference: f64,
}

pub fn update_player_loyalty(p: UpdateLoyaltyParams) -> f64 {
    let base_delta = match p.event_type.as_str() {
        "contract_honor"       =>  8.0,
        "contract_betrayal"    => -20.0,
        "playing_time_kept"    =>  5.0,
        "playing_time_broken"  => -15.0,
        "championship_won"     =>  15.0,
        "team_rebuild_start"   => -7.0,
        "season_end_normal"    => -2.0,
        _ => 0.0,
    };
    let stability_damp = 1.0 - p.stability_preference / 200.0;
    let delta = base_delta * p.event_magnitude * stability_damp;
    (p.current_loyalty + delta).clamp(0.0, 100.0)
}
