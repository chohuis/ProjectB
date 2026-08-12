use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::npc_sim;
use crate::sim_types::{ProtagonistDraftParams, ProTeamProfile};

// ── Career Chain ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CareerStep {
    Initial,
    DraftResult { success: bool },
    UnivResult { success: bool, source: String },
    UnivFailRoute,
    IndieResult { success: bool },
    Resolved { stage: String },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveChoiceParams {
    pub step: CareerStep,
    pub choice_id: String,
    pub ovr: f64,
    pub avg_grade: f64,
}

fn calc_draft_success(ovr: f64, rng: &mut impl Rng) -> bool {
    let pct = ((ovr - 40.0) * 1.375 + 15.0).max(5.0).min(70.0);
    rng.gen::<f64>() * 100.0 < pct
}

fn calc_univ_success(avg_grade: f64, rng: &mut impl Rng) -> bool {
    let pct = if avg_grade <= 4.0 { 85.0 }
              else if avg_grade <= 6.0 { 55.0 }
              else if avg_grade <= 7.0 { 30.0 }
              else { 10.0 };
    rng.gen::<f64>() * 100.0 < pct
}

fn calc_indie_success(ovr: f64, rng: &mut impl Rng) -> bool {
    let pct = ((ovr - 30.0) * 0.9 + 40.0).max(35.0).min(80.0);
    rng.gen::<f64>() * 100.0 < pct
}

pub fn resolve_career_choice(params: ResolveChoiceParams) -> CareerStep {
    let mut rng = rand::thread_rng();
    let ovr = params.ovr;
    let avg = params.avg_grade;
    let cid = &params.choice_id;

    match &params.step {
        CareerStep::Initial => match cid.as_str() {
            "draft"      => CareerStep::DraftResult { success: calc_draft_success(ovr, &mut rng) },
            "university" => CareerStep::UnivResult { success: calc_univ_success(avg, &mut rng), source: "direct".into() },
            "indie"      => CareerStep::IndieResult { success: calc_indie_success(ovr, &mut rng) },
            _            => CareerStep::Resolved { stage: "military".into() },
        },
        CareerStep::DraftResult { success } => {
            if *success { CareerStep::Resolved { stage: "pro".into() } }
            else { CareerStep::UnivResult { success: calc_univ_success(avg, &mut rng), source: "afterDraft".into() } }
        }
        CareerStep::UnivResult { success, source } => {
            if *success { CareerStep::Resolved { stage: "university".into() } }
            else if source == "afterDraft" { CareerStep::IndieResult { success: calc_indie_success(ovr, &mut rng) } }
            else { CareerStep::UnivFailRoute }
        }
        CareerStep::UnivFailRoute => {
            if cid == "indie" { CareerStep::IndieResult { success: calc_indie_success(ovr, &mut rng) } }
            else { CareerStep::Resolved { stage: "military".into() } }
        }
        CareerStep::IndieResult { success } => {
            CareerStep::Resolved { stage: if *success { "independent".into() } else { "military".into() } }
        }
        CareerStep::Resolved { .. } => params.step.clone(),
    }
}

// ── Pitcher Role Engine ───────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignRoleParams {
    pub position: Option<String>,
    pub ovr: f64,
    pub team_sp_ovrs: Vec<f64>,
    /// 감독 관계 보정 (Phase 6C). 실력이 아니라 **감독이 나를 어떻게 보는가**다 —
    /// 신뢰가 두터우면 같은 OVR로도 선발 경쟁에서 앞선다. 없으면 0(중립).
    #[serde(default)]
    pub role_ovr_bias: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignRoleResult {
    pub role: String,
}

pub fn assign_protagonist_role(params: AssignRoleParams) -> AssignRoleResult {
    let pos = params.position.as_deref().unwrap_or("");
    // 감독이 보는 나 = 실제 OVR + 관계 보정. 순위 비교에 이 값을 쓴다
    let ovr = params.ovr + params.role_ovr_bias;

    let role = match pos {
        "CP" => "마무리".into(),
        "RP" => {
            if ovr >= 78.0 { "셋업맨".into() }
            else if ovr >= 65.0 { "중간계투".into() }
            else if ovr >= 55.0 { "롱릴리프".into() }
            else { "패전처리".into() }
        }
        _ => {
            let rank = 1 + params.team_sp_ovrs.iter().filter(|&&o| o > ovr).count();
            if rank <= 5 { format!("{}선발", rank) }
            else if ovr >= 60.0 { "스윙맨".into() }
            else { "롱릴리프".into() }
        }
    };

    AssignRoleResult { role }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignHighschoolPositionParams {
    pub my_ovr: f64,
    pub team_pitcher_ovrs: Vec<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignHighschoolPositionResult {
    pub position: String,
}

pub fn assign_highschool_position(params: AssignHighschoolPositionParams) -> AssignHighschoolPositionResult {
    let higher = params.team_pitcher_ovrs.iter().filter(|&&o| o > params.my_ovr).count();
    AssignHighschoolPositionResult { position: if higher <= 2 { "SP".into() } else { "RP".into() } }
}

fn reliever_appearance_chance(role: &str) -> f64 {
    match role {
        "마무리"   => 0.55,
        "셋업맨"   => 0.45,
        "중간계투" => 0.35,
        "롱릴리프" => 0.20,
        "패전처리" => 0.25,
        "스윙맨"   => 0.15,
        "오프너"   => 0.30,
        _ => 0.0,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelieverPitchParams {
    pub role: String,
    pub pitch_outs_last: Option<i32>,   // 직전 경기 아웃 수 (None → 0)
    pub last_pitched_week: Option<i32>, // 마지막 등판 주차 (None → 0) — 구 경로
    pub current_week: Option<i32>,      // 현재 주차 — 구 경로
    /// 마지막 등판 날짜 "YYYY-MM-DD" (Phase 5-8). 있으면 일 단위 휴식 판정을 쓴다
    #[serde(default)]
    pub last_pitched_date: Option<String>,
    /// 그날 던진 투구 수
    #[serde(default)]
    pub last_pitch_count: Option<u32>,
    /// 등판하려는 경기 날짜
    #[serde(default)]
    pub game_date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelieverPitchResult {
    pub would_pitch: bool,
}

pub fn reliever_would_pitch(params: RelieverPitchParams) -> RelieverPitchResult {
    let base = reliever_appearance_chance(&params.role);
    if base <= 0.0 { return RelieverPitchResult { would_pitch: false }; }

    // 직전 경기 투구 피로 패널티
    let outs_last = params.pitch_outs_last.unwrap_or(0);
    let rest_penalty = if outs_last >= 18 { 0.30 }  // 6이닝+ → 거의 등판 불가
                       else if outs_last >= 9 { 0.65 } // 3이닝+ → 확률 감소
                       else { 1.00 };

    // 의무 휴식 (Phase 5-8) — 날짜가 오면 일 단위로 막는다.
    // 주 단위(last_pitched_week)는 "이번 주에 던졌으면 무조건 불가"라 너무 거칠었다:
    // 불펜이 한 주에 두 번 못 나오고, 반대로 주말 연투(토→일)는 못 막았다.
    let rest_block = match (&params.last_pitched_date, &params.game_date) {
        (Some(last), Some(game)) if !last.is_empty() => {
            let r = crate::rest_rules::check_rest(crate::rest_rules::RestCheckParams {
                last_pitched_date: last.clone(),
                last_pitch_count: params.last_pitch_count.unwrap_or(0),
                game_date: game.clone(),
            });
            if r.available { 1.0 } else { 0.0 }
        }
        // 날짜가 없으면 구 동작(같은 주 재등판 금지)으로 떨어진다 — 구 세이브 호환
        _ => {
            let last_w = params.last_pitched_week.unwrap_or(0);
            let cur_w  = params.current_week.unwrap_or(0);
            if last_w > 0 && last_w == cur_w { 0.0 } else { 1.0 }
        }
    };

    let chance = base * rest_penalty * rest_block;
    let would_pitch = rand::thread_rng().gen::<f64>() < chance;
    RelieverPitchResult { would_pitch }
}

// ── Salary Engine ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonStats {
    pub ip: f64,
    pub era: f64,
    pub whip: f64,
    pub k: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcSeasonRatingParams {
    pub stats: Option<SeasonStats>,
}

fn calc_season_rating_inner(s: &SeasonStats) -> f64 {
    let era_score  = (100.0 - (s.era  - 2.0) * 18.0).max(20.0).min(100.0);
    let whip_score = (100.0 - (s.whip - 1.0) * 55.0).max(20.0).min(100.0);
    let k9         = if s.ip > 0.0 { (s.k / s.ip) * 9.0 } else { 0.0 };
    let k_score    = (40.0 + k9 * 6.0).max(20.0).min(100.0);
    era_score * 0.45 + whip_score * 0.3 + k_score * 0.25
}

pub fn calc_season_rating(params: CalcSeasonRatingParams) -> i64 {
    match &params.stats {
        None => 50,
        Some(s) if s.ip <= 0.0 => 50,
        Some(s) => calc_season_rating_inner(s).round() as i64,
    }
}

fn league_salary_mult(league_id: &str) -> f64 {
    match league_id {
        "LEAGUE_ABL"         => 3.5,
        "LEAGUE_JBL"         => 2.0,
        "LEAGUE_INDEPENDENT" => 0.35,
        _                    => 1.0,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcMarketSalaryParams {
    pub ovr: f64,
    pub fame: f64,
    pub league_id: String,
}

pub fn calc_market_salary(params: CalcMarketSalaryParams) -> i64 {
    let base = 1800.0 + (params.ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
    (base * league_salary_mult(&params.league_id)).round() as i64
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcOfferedSalaryParams {
    pub current_salary: f64,
    pub rating: f64,
    pub market_salary: f64,
}

pub fn calc_offered_salary(params: CalcOfferedSalaryParams) -> i64 {
    let perf_adj = (params.rating - 50.0) * 0.012;
    let blended  = params.current_salary * (1.0 + perf_adj) * 0.6 + params.market_salary * 0.4;
    blended.max(1500.0).round() as i64
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcOfferedSalaryForProtagonistParams {
    pub pitching_ovr: f64,
    pub fame: f64,
    pub league_id: String,
    pub current_salary: Option<f64>,
    pub stats: Option<SeasonStats>,
    /// 구단주 `budgetSupport` 계수 (1.0 = 중립). 지갑을 여는 구단주면 더 준다.
    /// **시장가에만 곱한다** — 현재 연봉은 이미 계약된 값이라 구단주가 못 바꾼다.
    /// 스태프 15종 배선(§7-5 F-1)
    #[serde(default)]
    pub budget_mod: Option<f64>,
}

pub fn calc_offered_salary_for_protagonist(params: CalcOfferedSalaryForProtagonistParams) -> i64 {
    let rating = match &params.stats {
        None => 50.0,
        Some(s) if s.ip <= 0.0 => 50.0,
        Some(s) => calc_season_rating_inner(s).round(),
    };
    let market = {
        let base = 1800.0 + (params.pitching_ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
        base * league_salary_mult(&params.league_id)
            * params.budget_mod.unwrap_or(1.0).clamp(0.80, 1.25)
    };
    let current = params.current_salary.unwrap_or(market);
    let perf_adj = (rating - 50.0) * 0.012;
    let blended  = current * (1.0 + perf_adj) * 0.6 + market * 0.4;
    blended.max(1500.0).round() as i64
}

// ── FA Engine ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRef {
    pub id: String,
    pub league_id: String,
    // ── 신규 추가 ──
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<ProTeamProfile>,
    #[serde(default)]
    pub current_payroll: i64,
    #[serde(default)]
    pub salary_cap: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateFaOffersParams {
    pub pitching_ovr: f64,
    pub fame: f64,
    pub league_id: String,
    pub team_id: String,
    pub fa_unsigned_weeks: Option<u32>,
    pub teams: Vec<TeamRef>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaOffer {
    pub team_id: String,
    pub league_id: String,
    pub salary: i64,
    pub duration_years: u32,
    pub signing_bonus: i64,
    pub team_option_years: u32,
    pub player_option_years: u32,
    pub no_trade: bool,
}

pub fn generate_fa_offers(params: GenerateFaOffersParams) -> Vec<FaOffer> {
    let mut rng = rand::thread_rng();
    let same_league: Vec<&TeamRef> = params.teams.iter()
        .filter(|t| t.league_id == params.league_id && t.id != params.team_id)
        .collect();
    if same_league.is_empty() { return vec![]; }

    let base = 1800.0 + (params.pitching_ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
    let market = base * league_salary_mult(&params.league_id);
    let unsigned_weeks = params.fa_unsigned_weeks.unwrap_or(0);
    let market_drop = (1.0 - unsigned_weeks as f64 * 0.04).max(0.72);

    let n_picks = rng.gen_range(3..=5usize).min(same_league.len());
    let mut indices: Vec<usize> = (0..same_league.len()).collect();
    for i in 0..n_picks {
        let j = rng.gen_range(i..same_league.len());
        indices.swap(i, j);
    }

    let make_offer = |team: &TeamRef, league_market: f64, rng: &mut rand::rngs::ThreadRng| -> FaOffer {
        let (win_mult, year_bias, bonus_mult) = if let Some(ref profile) = team.profile {
            let wm = 1.0 + (profile.win_now_pressure - 50.0) / 100.0 * 0.30;
            let yb = if profile.stability > 65.0 { 1i32 } else if profile.stability < 35.0 { -1 } else { 0 };
            let bm = 0.08 + profile.market_appeal / 100.0 * 0.12;
            let flex = if team.salary_cap > 0 {
                (team.salary_cap - team.current_payroll) as f64 / team.salary_cap as f64
            } else { 0.5 };
            let effective_wm = if flex < 0.15 { wm * 0.6 } else { wm };
            (effective_wm, yb, bm)
        } else {
            (1.0, 0, 0.12)
        };

        let scouting_noise = if let Some(ref p) = team.profile {
            (100.0 - p.scouting_quality) / 100.0 * 0.25
        } else { 0.15 };

        let noise   = (rng.gen::<f64>() * 2.0 - 1.0) * scouting_noise;
        let mult    = (0.85 + rng.gen::<f64>() * 0.35) * win_mult;
        let salary  = (league_market * mult * (1.0 + noise) * market_drop).round() as i64;
        let dur_raw = rng.gen_range(1..=4i32) + year_bias;
        let duration_years = dur_raw.clamp(1, 5) as u32;

        FaOffer {
            team_id:             team.id.clone(),
            league_id:           team.league_id.clone(),
            salary,
            duration_years,
            signing_bonus:       (salary as f64 * (bonus_mult + rng.gen::<f64>() * 0.08)).round() as i64,
            team_option_years:   if rng.gen::<f64>() < 0.35 { 1 } else { 0 },
            player_option_years: if rng.gen::<f64>() < 0.25 { 1 } else { 0 },
            no_trade:            rng.gen::<f64>() < 0.2,
        }
    };

    let mut offers: Vec<FaOffer> = indices[..n_picks].iter()
        .map(|&idx| make_offer(same_league[idx], market, &mut rng))
        .collect();

    // ── 해외 스카우트 오퍼 ──────────────────────────────────────
    //
    // ⚠ 예전엔 **JBL 경로만** 있었다. ABL은 자체 리그로만 존재해서
    // 국내 선수가 갈 방법이 없었고, 확장팩을 열어도 32팀이 관전 대상일 뿐이었다.
    // 표를 두 벌 적지 않도록 리그별 문턱만 다른 **하나의 경로**로 만든다.
    //
    // 문턱 차이가 위계를 만든다. **ABL이 최상위다** — `league_salary_mult`가
    // ABL 3.5 / JBL 2.0이고 로스터 OVR도 62~92 vs 60~90이다.
    // (한 번 거꾸로 잡았다: JBL 문턱을 더 높게 뒀는데 연봉은 ABL이 1.75배였다)
    //   (목적지, 최소 OVR, 최소 명성, 상위 확률, 하위 확률, 상위 기준 OVR)
    const OVERSEAS_ROUTES: [(&str, f64, f64, f64, f64, f64); 2] = [
        ("LEAGUE_ABL", 70.0, 30.0, 0.55, 0.25, 80.0),
        ("LEAGUE_JBL", 62.0, 15.0, 0.65, 0.35, 72.0),
    ];

    for (dest, min_ovr, min_fame, hi_chance, lo_chance, hi_ovr) in OVERSEAS_ROUTES {
        // 같은 리그로는 스카우트 오퍼를 안 만든다 (그건 위 `same_league` 몫)
        if params.league_id == dest { continue; }
        // 국내·해외 1군에서만 나간다 — 팜·대학·독립은 대상이 아니다
        let from_top = params.league_id == "LEAGUE_KBL"
            || params.league_id == "LEAGUE_ABL"
            || params.league_id == "LEAGUE_JBL";
        if !from_top { continue; }
        if params.pitching_ovr < min_ovr || params.fame < min_fame { continue; }

        let dest_teams: Vec<&TeamRef> = params.teams.iter()
            .filter(|t| t.league_id == dest)
            .collect();
        if dest_teams.is_empty() { continue; }

        let chance = if params.pitching_ovr >= hi_ovr { hi_chance } else { lo_chance };
        if rng.gen::<f64>() >= chance { continue; }

        let market = base * league_salary_mult(dest);
        let n = rng.gen_range(1..=2usize).min(dest_teams.len());
        let mut idx: Vec<usize> = (0..dest_teams.len()).collect();
        for i in 0..n {
            let j = rng.gen_range(i..dest_teams.len());
            idx.swap(i, j);
        }
        for &k in &idx[..n] {
            offers.push(make_offer(dest_teams[k], market, &mut rng));
        }
    }

    offers
}

// ── Draft Engine ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcDraftRankParams {
    pub scout_score: f64,
    pub pitching_ovr: Option<f64>,
    pub year: Option<u32>,
    pub kbl_team_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRankResult {
    pub drafted: bool,
    pub round: Option<i32>,
    pub pick: Option<i32>,
    pub team_id: Option<String>,
    pub signing_bonus: i64,
}

fn calc_signing_bonus(round: i32, scout_score: f64) -> i64 {
    match round {
        1     => (30000.0 + (scout_score - 70.0).max(0.0) * 1500.0).round() as i64,
        2     => (10000.0 + (scout_score - 55.0).max(0.0) *  600.0).round() as i64,
        3 | 4 => ( 4000.0 + (scout_score - 40.0).max(0.0) *  200.0).round() as i64,
        _     => 2000,
    }
}

pub fn calc_draft_rank(params: CalcDraftRankParams) -> DraftRankResult {
    let scout = params.scout_score;
    let pitching_ovr = params.pitching_ovr.unwrap_or(scout);
    let year = params.year.unwrap_or(2000);

    let draft_params = ProtagonistDraftParams {
        scout_score: scout,
        pitching_ovr,
        year: year as i32,
        team_ids: params.kbl_team_ids,
        // 이 경로(합성 궤적)는 또래 분포를 안 만든다 — 폴백이 OVR을 백분위처럼 쓴다
        peer_ovrs: Vec::new(), team_ace_rank: None, tournament_score: None,
        moderate_injuries: None, severe_injuries: None, surgery_injuries: None,
        award_titles: None, award_mvps: None,
    };
    let outcome = npc_sim::determine_protagonist_draft(draft_params);

    if !outcome.drafted {
        return DraftRankResult { drafted: false, round: None, pick: None, team_id: None, signing_bonus: 0 };
    }

    let round = outcome.round.unwrap_or(10);
    DraftRankResult {
        drafted:       true,
        round:         outcome.round,
        pick:          outcome.pick,
        team_id:       outcome.team_id,
        signing_bonus: calc_signing_bonus(round, scout),
    }
}

// ── 독립리그 KBL 스카우트 제의 계산 ──────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndieScoutOfferParams {
    pub ovr: f64,
    pub era: f64,           // 투수 ERA (타자는 9.99 등 무효값)
    pub avg: f64,           // 타자 타율 (투수는 0.0 등 무효값)
    pub player_type: String, // "pitcher" | "batter"
    pub year: i32,
    pub kbl_team_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndieScoutOfferResult {
    pub has_offer: bool,
    pub tier: String,   // "first" | "second" | "none"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    pub offered_salary: i64,
}

pub fn calc_indie_scout_offer(p: IndieScoutOfferParams) -> IndieScoutOfferResult {
    let is_pitcher = p.player_type == "pitcher";
    let tier = if is_pitcher {
        if p.ovr >= 63.0 && p.era <= 3.00 { "first" }
        else if p.ovr >= 58.0 && p.era <= 3.80 { "second" }
        else { "none" }
    } else {
        if p.ovr >= 63.0 && p.avg >= 0.300 { "first" }
        else if p.ovr >= 58.0 && p.avg >= 0.270 { "second" }
        else { "none" }
    };

    if tier == "none" || p.kbl_team_ids.is_empty() {
        return IndieScoutOfferResult { has_offer: false, tier: "none".into(), team_id: None, offered_salary: 0 };
    }

    let mut rng = crate::npc_sim::LcgRand::new(
        (p.year as u32).wrapping_mul(997).wrapping_add((p.ovr.round() as u32).wrapping_mul(31))
    );
    let t_idx = (rng.next() * p.kbl_team_ids.len() as f64) as usize % p.kbl_team_ids.len();
    let team_id = p.kbl_team_ids[t_idx].clone();

    let offered_salary = if tier == "first" {
        (3000_i64).max(((p.ovr - 45.0) * 220.0).round() as i64)
    } else {
        (1500_i64).max(((p.ovr - 45.0) * 120.0).round() as i64)
    };

    IndieScoutOfferResult {
        has_offer: true,
        tier: tier.into(),
        team_id: Some(team_id),
        offered_salary,
    }
}

// ── calc_npc_renewal_salary ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcNpcRenewalSalaryParams {
    pub ovr: f64,
    pub age: i32,
    pub league_id: String,
    pub current_salary: i64,
    pub performance_score: f64,  // 0~100, 시즌 성적 기반
    pub greed: f64,              // personality.greed 0~100
}

pub fn calc_npc_renewal_salary(p: CalcNpcRenewalSalaryParams) -> i64 {
    let market = (1800.0 + (p.ovr - 50.0).max(0.0) * 220.0) * league_salary_mult(&p.league_id);
    let blend  = p.current_salary as f64 * 0.6 + market * 0.4;
    let perf   = 0.9 + (p.performance_score / 100.0) * 0.2;   // ×0.90~×1.10
    let greed  = 1.0 + (p.greed - 50.0) / 500.0;              // ×0.90~×1.10
    let age_damp = if p.age >= 33 { 0.9 } else { 1.0 };
    let raw = blend * perf * greed * age_damp;
    raw.max(market * 0.55).min(market * 1.35).round() as i64
}

// ── calc_npc_contract_years ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcNpcContractYearsParams {
    pub age: i32,
    pub development_focus: f64,   // team_profile.development_focus 0~100
    pub win_now_pressure: f64,    // team_profile.win_now_pressure 0~100
    pub stability_preference: f64, // personality.stability_preference 0~100
}

pub fn calc_npc_contract_years(p: CalcNpcContractYearsParams) -> i32 {
    if p.age >= 34 { return 1; }
    if p.win_now_pressure > 70.0 && p.age >= 30 { return 1; }
    if p.development_focus > 60.0 && p.age <= 25 {
        return if p.stability_preference > 60.0 { 3 } else { 2 };
    }
    if p.stability_preference > 65.0 { 2 } else { 1 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assign_protagonist_role_cp() {
        let r = assign_protagonist_role(AssignRoleParams {
            position: Some("CP".into()),
            ovr: 70.0,
            team_sp_ovrs: vec![],
            role_ovr_bias: 0.0,
        });
        assert_eq!(r.role, "마무리");
    }

    #[test]
    fn assign_protagonist_role_rp_tiers() {
        let cases = [(78.0, "셋업맨"), (65.0, "중간계투"), (55.0, "롱릴리프"), (40.0, "패전처리")];
        for (ovr, expected) in cases {
            let r = assign_protagonist_role(AssignRoleParams {
                position: Some("RP".into()),
                ovr,
                team_sp_ovrs: vec![],
                role_ovr_bias: 0.0,
            });
            assert_eq!(r.role, expected, "ovr={ovr}");
        }
    }

    #[test]
    fn assign_protagonist_role_sp_rank1() {
        // 아무도 나보다 위 없음 → rank=1
        let r = assign_protagonist_role(AssignRoleParams {
            position: None,
            ovr: 80.0,
            team_sp_ovrs: vec![70.0, 65.0, 60.0],
            role_ovr_bias: 0.0,
        });
        assert_eq!(r.role, "1선발");
    }

    #[test]
    fn assign_protagonist_role_swingman() {
        // rank=6, ovr>=60 → 스윙맨
        let r = assign_protagonist_role(AssignRoleParams {
            position: None,
            ovr: 62.0,
            team_sp_ovrs: vec![90.0, 85.0, 80.0, 75.0, 70.0],
            role_ovr_bias: 0.0,
        });
        assert_eq!(r.role, "스윙맨");

    }

    /// 감독 관계가 보직을 실제로 가른다 (Phase 6C-5).
    /// 같은 실력인데 감독이 각별하면 5선발, 적대면 스윙맨으로 밀린다.
    #[test]
    fn 감독_관계가_보직_경쟁을_가른다() {
        let rotation = vec![90.0, 85.0, 80.0, 70.0, 64.0];  // 5선발이 64
        let mk = |bias: f64| assign_protagonist_role(AssignRoleParams {
            position: None, ovr: 62.0, team_sp_ovrs: rotation.clone(), role_ovr_bias: bias,
        }).role;
        assert_eq!(mk(0.0), "스윙맨", "중립이면 5선발(64)에 밀린다");
        assert_eq!(mk(6.0), "5선발", "각별(+6)이면 68로 평가돼 5선발을 밀어낸다");
        // 62 − 6 = 56 이라 스윙맨 하한(60)마저 밑돈다 — 한 단계 더 떨어진다
        assert_eq!(mk(-6.0), "롱릴리프", "적대(-6)면 스윙맨에서도 밀려난다");
    }

    #[test]
    fn assign_highschool_position_sp_when_top3() {
        // 2명만 위 → SP
        let r = assign_highschool_position(AssignHighschoolPositionParams {
            my_ovr: 60.0,
            team_pitcher_ovrs: vec![80.0, 70.0, 50.0],
        });
        assert_eq!(r.position, "SP");
    }

    #[test]
    fn assign_highschool_position_rp_when_crowded() {
        // 3명 위 → RP
        let r = assign_highschool_position(AssignHighschoolPositionParams {
            my_ovr: 60.0,
            team_pitcher_ovrs: vec![80.0, 70.0, 65.0],
        });
        assert_eq!(r.position, "RP");
    }

    #[test]
    fn calc_market_salary_base() {
        // ovr=50, fame=0 → 1800
        let p = CalcMarketSalaryParams { ovr: 50.0, fame: 0.0, league_id: "KBL".to_string() };
        assert_eq!(calc_market_salary(p), 1800);
    }

    #[test]
    fn calc_market_salary_high_ovr() {
        // 1800 + (80-50)*220 = 8400
        let p = CalcMarketSalaryParams { ovr: 80.0, fame: 0.0, league_id: "KBL".to_string() };
        assert_eq!(calc_market_salary(p), 8400);
    }

    #[test]
    fn calc_market_salary_abl_multiplier() {
        // 1800 * 3.5 = 6300
        let p = CalcMarketSalaryParams { ovr: 50.0, fame: 0.0, league_id: "LEAGUE_ABL".to_string() };
        assert_eq!(calc_market_salary(p), 6300);
    }

    #[test]
    fn calc_offered_salary_floor() {
        // 낮은 값 → 1500 floor
        let p = CalcOfferedSalaryParams { current_salary: 100.0, rating: 50.0, market_salary: 100.0 };
        assert_eq!(calc_offered_salary(p), 1500);
    }

    #[test]
    fn calc_season_rating_no_stats() {
        let p = CalcSeasonRatingParams { stats: None };
        assert_eq!(calc_season_rating(p), 50);
    }
}
