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
        // 「오프너」는 지웠다 — 만드는 코드가 0건이었다 (사용자 확정 09-03 · §8 ⑦)
        _ => 0.0,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelieverPitchParams {
    /// 씨앗. **0이면 예전 그대로 `thread_rng`다.**
    ///
    /// 이게 없으면 같은 세이브도 실행마다 다른 결과가 난다 — 계측을 한 번
    /// 돌려 전후를 비교할 수 없고 간헐 실패를 회귀와 구분할 수 없다.
    /// 씨앗 만드는 곳은 TS `utils/seedOf.ts` 하나다.
    #[serde(default)]
    pub seed: u32,
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
    /// 추천 밖 깊이 — `over = max(0, rank − seats)` (1.1 A④ §5). 안 오면 0 = 불이익 없음
    #[serde(default)]
    pub role_depth: Option<u32>,
    /// 깊이 계수 규칙 (`pitcherRoleRules.offRecommendation`). 안 오면 계수 1.0
    #[serde(default)]
    pub off_recommendation: Option<crate::pitcher_role::OffRecommendation>,
}

/// 선발이 그 주에 실제로 등판하나 (1.1 A④ §5-a).
///
/// 지금까지 `is_protagonist_game` 이 true 면 **무조건** 던졌다. 로테이션 자리보다 밖에 있으면
/// 그만큼 건너뛴다 — 확률이 곧 `depth_factor` 다.
///
/// ⚠ 규칙(`off_recommendation`)이 안 오면 계수가 1.0 이라 **예전과 똑같이 항상 등판한다.**
///   `serde(default)` 라 배선을 빼도 오류가 안 난다 — 검사에 대조군을 넣는다.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StarterStartParams {
    #[serde(default)]
    pub seed: u32,
    #[serde(default)]
    pub role_depth: Option<u32>,
    #[serde(default)]
    pub off_recommendation: Option<crate::pitcher_role::OffRecommendation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StarterStartResult {
    pub would_start: bool,
    pub depth_factor: f64,
}

pub fn starter_would_start(params: StarterStartParams) -> StarterStartResult {
    let factor = crate::pitcher_role::depth_factor(
        params.role_depth.unwrap_or(0), params.off_recommendation.as_ref());
    if factor >= 1.0 { return StarterStartResult { would_start: true, depth_factor: factor }; }
    let roll = if params.seed != 0 {
        crate::npc_sim::LcgRand::new(params.seed | 1).next()
    } else {
        rand::thread_rng().gen::<f64>()
    };
    StarterStartResult { would_start: roll < factor, depth_factor: factor }
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

    // 1.1 A④ §5-b — 추천 밖 깊이만큼 등판 확률을 곱한다. 규칙이 안 오면 1.0(예전 그대로)
    let depth = crate::pitcher_role::depth_factor(
        params.role_depth.unwrap_or(0), params.off_recommendation.as_ref());
    let chance = base * rest_penalty * rest_block * depth;
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let roll = if params.seed != 0 {
        crate::npc_sim::LcgRand::new(params.seed | 1).next()
    } else {
        rand::thread_rng().gen::<f64>()
    };
    let would_pitch = roll < chance;
    RelieverPitchResult { would_pitch }
}

// ── Salary Engine ─────────────────────────────────────────────

/// 시즌 성적 — **투수와 타자를 같이 받는다** (2026-09-01 · 트랙 C 가 잡았다).
///
/// 🔴 예전엔 네 칸(`ip` · `era` · `whip` · `k`)이 **전부 필수**였다. 그래서
/// 타자 주인공의 `BatterSeasonStats` 를 넘기면 **역직렬화 자체가 실패**하고
/// `parse_err` 가 `{"error": …}` 를 돌려줬다. 호출부는 그걸
/// `JSON.parse(raw) as number` 로 받는다 — **숫자가 아니라 객체가 된다.**
///
/// ```
///   투수 → 85
///   타자 → {"error":"missing field `ip`"}      ← 실측
/// ```
///
/// ⚠ `s.ip <= 0.0 → 50` 가드는 **역직렬화가 성공했을 때만** 걸린다.
///   타자는 거기까지 못 갔다.
///
/// ⚠ 표시만의 문제가 아니었다. 같은 구조체를
///   `calc_offered_salary_for_protagonist` 도 쓰므로 **타자 주인공은 계약
///   제시액 자체가 객체**였다.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SeasonStats {
    // ── 투수 ──
    #[serde(default)] pub ip: f64,
    #[serde(default)] pub era: f64,
    #[serde(default)] pub whip: f64,
    #[serde(default)] pub k: f64,
    // ── 타자 ──
    #[serde(default)] pub ab: f64,
    #[serde(default)] pub ops: f64,
    #[serde(default)] pub g: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcSeasonRatingParams {
    pub stats: Option<SeasonStats>,
}

fn calc_season_rating_inner(s: &SeasonStats) -> f64 {
    // 🔴 **타자 갈래** (2026-09-01). 예전엔 투수식뿐이라 타자 주인공이
    //   여기까지 오지도 못했다(역직렬화에서 죽었다).
    //
    // ⚠ **산식을 새로 만들지 않았다.** NPC 전체를 평가하는
    //   `calcNpcPerfScore`(`market.ts`)의 타자식을 그대로 옮겼다 —
    //   OPS 기준선 .700 · 폭 180 · 출전 15점 · 가중 0.85/0.15.
    //   주인공만 다른 잣대로 재면 "재계약은 잘했다는데 방출 후보"가 나온다.
    //
    // ⚠ 투수식은 **안 건드렸다.** 그쪽은 Rust 가 ERA·WHIP·K 를 보고 TS 는
    //   ERA·경기를 본다 — 원래 다른 함수고, 여기서 맞추면 기존 값이 통째로
    //   움직인다(밸런스). 타자만 없던 것을 채운다.
    if s.ip <= 0.0 {
        if s.ab < 30.0 { return 50.0; }        // 표본이 얇으면 중립
        let ops_pts   = (50.0 + (s.ops - 0.700) * 180.0).max(10.0).min(95.0);
        let games_pts = ((s.g / 130.0) * 15.0).min(15.0);
        return ops_pts * 0.85 + games_pts * 0.15;
    }
    let era_score  = (100.0 - (s.era  - 2.0) * 18.0).max(20.0).min(100.0);
    let whip_score = (100.0 - (s.whip - 1.0) * 55.0).max(20.0).min(100.0);
    let k9         = if s.ip > 0.0 { (s.k / s.ip) * 9.0 } else { 0.0 };
    let k_score    = (40.0 + k9 * 6.0).max(20.0).min(100.0);
    era_score * 0.45 + whip_score * 0.3 + k_score * 0.25
}

pub fn calc_season_rating(params: CalcSeasonRatingParams) -> i64 {
    // ⚠ **`ip <= 0` 가드가 여기에도 있었다** — 두 자리였다.
    //   `calc_offered_salary_for_protagonist` 쪽만 고치고 이쪽을 못 봐서,
    //   제시액은 타자를 반영하는데 **화면 평점만 50 으로 굳어 있었다**(실측).
    //   같은 판정이 두 곳에 있으면 반드시 한쪽만 고쳐진다.
    //   이제 `calc_season_rating_inner` 가 투수·타자를 스스로 가른다.
    match &params.stats {
        None => 50,
        Some(s) => calc_season_rating_inner(s).round() as i64,
    }
}

/// 리그 연봉 배수. **정본은 `generation_rules.json`의 `salaryRules.leagueMult`다.**
///
/// 🔴 예전엔 여기 표가 따로 박혀 있었고 규칙 파일과 **어긋났다**:
///
///     리그        규칙 파일   여기(옛값)
///     독립        0.14        0.35        2.5배
///     KBL 2군     0.3         (없음→1.0)  3.3배
///
/// 2군 선수의 시장가·FA 오퍼가 **1군과 같은 배수**로 계산됐다.
/// `CLAUDE.md`: "코드에 표를 두 번 적지 말 것 — Phase 7에서 이 결함만 15건".
///
/// ⚠ 지도가 비면 옛 표로 떨어진다 — 구 페이로드가 조용히 0이 되지 않게.
fn league_salary_mult(
    league_id: &str,
    mult: &std::collections::HashMap<String, f64>,
) -> f64 {
    if let Some(v) = mult.get(league_id) { return *v; }
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
    /// 리그 연봉 배수 (`salaryRules.leagueMult`). 비면 옛 표로 떨어진다
    #[serde(default)]
    pub league_mult: std::collections::HashMap<String, f64>,
    pub ovr: f64,
    pub fame: f64,
    pub league_id: String,
}

pub fn calc_market_salary(params: CalcMarketSalaryParams) -> i64 {
    let base = 1800.0 + (params.ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
    (base * league_salary_mult(&params.league_id, &params.league_mult)).round() as i64
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcOfferedSalaryParams {
    /// 리그 연봉 배수 (`salaryRules.leagueMult`). 비면 옛 표로 떨어진다
    #[serde(default)]
    pub league_mult: std::collections::HashMap<String, f64>,
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
    /// 리그 연봉 배수 (`salaryRules.leagueMult`). 비면 옛 표로 떨어진다
    #[serde(default)]
    pub league_mult: std::collections::HashMap<String, f64>,
    pub pitching_ovr: f64,
    /// 🔴 **타자 주인공의 OVR** (2026-09-01). 있으면 이쪽을 쓴다.
    ///
    /// 호출부가 타자에게도 `pitching_ovr` 를 넘기고 있었다
    /// (`protagonist.pitching.ovr`) — 타자에게 그 값은 뜻이 없다.
    /// **안 넘기면 예전 그대로다.**
    #[serde(default)]
    pub batting_ovr: Option<f64>,
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
    // ⚠ **`ip <= 0` 가드를 뺐다** (2026-09-01). 그게 타자를 막고 있었다 —
    //   이제 `calc_season_rating_inner` 가 투수·타자를 스스로 가른다
    //   (표본이 얇으면 거기서 50 을 준다).
    let rating = match &params.stats {
        None => 50.0,
        Some(s) => calc_season_rating_inner(s).round(),
    };
    let market = {
        // 타자면 타격 OVR 을 쓴다 — 안 넘어오면 예전 그대로 투수 OVR
        let ovr = params.batting_ovr.unwrap_or(params.pitching_ovr);
        let base = 1800.0 + (ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
        base * league_salary_mult(&params.league_id, &params.league_mult)
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
    /**
     * 그 팀이 지금 **얇은 자리** — 관심도의 가장 큰 항이다(+30).
     *
     * 🔴 이게 **팀이 필요해서 부른다**는 것 자체다. 비우면 모든 팀이 같은
     *   점수를 받아 문턱이 전부/전무로 갈린다 — 실측(2026-08-27):
     *       문턱 40 → 평균 16.9개(전부 통과) · 문턱 45 → 평균 1.1개(KBL 0)
     *   그 사이에 값이 없다. 관심도가 이산값이라 그렇다.
     */
    #[serde(default)]
    pub roster_needs: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateFaOffersParams {
    /// 리그 연봉 배수 (`salaryRules.leagueMult`). 비면 옛 표로 떨어진다
    #[serde(default)]
    pub league_mult: std::collections::HashMap<String, f64>,
    /// 씨앗. **0이면 예전 그대로 `thread_rng`다.**
    ///
    /// 🔴 이 넷(FA 입찰·FA 결정·트레이드 응답·오퍼 생성)이 `thread_rng`이라
    /// 같은 세이브·같은 씨앗도 실행마다 결과가 달랐다. 오프시즌을 결정적으로
    /// 바꾼 뒤에도 test:foreign 교체율이 5.0·6.0·4.7로 갈렸다 — 남은 건
    /// 여기였다. 계측을 한 번 돌려선 전후를 비교할 수 없다.
    #[serde(default)]
    pub seed: u32,
    pub pitching_ovr: f64,
    pub fame: f64,
    pub league_id: String,
    pub team_id: String,
    pub fa_unsigned_weeks: Option<u32>,
    /// 나이·연차·포지션 — **팀별 관심도 판정에 쓴다**(`eval_fa_bid`와 같은 축).
    /// ⚠ 없으면 판정을 못 하므로 **예전대로 무작위 3~5팀**으로 떨어진다.
    #[serde(default)]
    pub age: Option<i32>,
    #[serde(default)]
    pub pro_service_years: Option<i32>,
    #[serde(default)]
    pub position: Option<String>,
    /// 관심도 임계값. 0이면 판정을 안 한다(예전 동작).
    #[serde(default)]
    pub interest_min: f64,
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
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let mut rng: Box<dyn rand::RngCore> = if params.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(params.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    // 🔴 **호출부가 후보를 이미 골라 넘긴다** (2026-08-27).
    //   예전엔 여기서 `league_id`가 같은 팀만 다시 걸렀는데, 그러면 TS가
    //   해외를 넣어 보내도 **여기서 도로 잘렸다** — 두 곳이 같은 일을 하면
    //   한쪽만 고쳤을 때 아무 일도 안 일어난다.
    //
    // ⚠ **원소속 팀만 뺀다.** 자기 팀은 FA 제안을 안 한다(재계약은 다른 경로).
    // ⚠ 2군을 거르는 책임은 호출부(`faEngine.ts`)에 있다 —
    //   `ALL_TEAMS_BY_LEAGUE`가 1군·2군을 나눠 담는 정본이다.
    let same_league: Vec<&TeamRef> = params.teams.iter()
        .filter(|t| t.id != params.team_id)
        .collect();
    if same_league.is_empty() { return vec![]; }

    let base = 1800.0 + (params.pitching_ovr - 50.0).max(0.0) * 220.0 + params.fame * 28.0;
    let market = base * league_salary_mult(&params.league_id, &params.league_mult);
    let unsigned_weeks = params.fa_unsigned_weeks.unwrap_or(0);
    let market_drop = (1.0 - unsigned_weeks as f64 * 0.04).max(0.72);

    // 🔴 **예전엔 제비뽑기였다** — `rng.gen_range(3..=5)`로 팀을 뽑았다.
    //   OVR 60이든 90이든 제안이 3~5개고, 팀이 **필요해서 부르는 게 아니었다.**
    //
    // 🔴 **NPC는 이미 제대로 돈다.** `team_engine::eval_fa_bid`가 정원
    //   (`roster_needs` +30)·OVR(+15)·성향×나이(±10~20)·예산(−25)을 본다.
    //   **주인공만 이 판정을 안 탔다** — 여기서 붙여 두 경로를 하나로 만든다.
    //
    // ⚠ `interest_min`이 0이면 **예전 동작**이다. 호출부가 값을 안 넘기면
    //   조용히 옛 길로 떨어진다 — 배선이 빠졌을 때 게임이 안 죽는다.
    let indices: Vec<usize> = if params.interest_min > 0.0 {
        let mut picked: Vec<usize> = Vec::new();
        for (i, team) in same_league.iter().enumerate() {
            let profile = team.profile.clone().unwrap_or_default();
            // ⚠ **얇은 자리는 호출부가 넘긴다**(`TeamRef.roster_needs`) —
            //   그게 관심도의 가장 큰 항(+30)이고, **팀이 필요해서 부른다**는 뜻이다.
            let bid = crate::team_engine::eval_fa_bid(crate::team_engine::EvalFaBidParams {
                seed: if params.seed == 0 { 0 } else { params.seed ^ (i as u32 + 1) },
                team_profile: profile,
                fa_player: crate::sim_types::FaPlayerRef {
                    id: "PLY_HERO".into(),
                    position: params.position.clone().unwrap_or_else(|| "SP".into()),
                    age: params.age.unwrap_or(27),
                    ovr: params.pitching_ovr,
                    market_value: market as i64,
                    demand_salary: market as i64,
                    demand_years: 3,
                    fame: params.fame,
                    personality: None,
                    pro_service_years: params.pro_service_years.unwrap_or(5),
                    current_league: params.league_id.clone(),
                },
                roster_needs: team.roster_needs.clone(),
                salary_cap: team.salary_cap.max(1),
                current_payroll: team.current_payroll,
                bid_floor_ratio: 0.03,
            });
            if bid.interest_level >= params.interest_min { picked.push(i); }
        }
        picked
    } else {
        // 예전 경로 — 무작위 3~5팀
        let n_picks = rng.gen_range(3..=5usize).min(same_league.len());
        let mut idx: Vec<usize> = (0..same_league.len()).collect();
        for i in 0..n_picks {
            let j = rng.gen_range(i..same_league.len());
            idx.swap(i, j);
        }
        idx.truncate(n_picks);
        idx
    };
    let n_picks = indices.len();

    // ── 경쟁 배수 ────────────────────────────────────────────────
    //
    // 🔴 **부른 팀 수가 여태 아무 뜻도 없었다.** 관심도 판정을 붙여 놓고도
    //   3팀이 부르든 12팀이 부르든 조건이 같았다 — 그러면 판정을 통과한 팀이
    //   몇인지가 화면에 숫자로만 남고 **협상력이 되지 않는다.**
    //
    // ⚠ **기존 조건 다양성은 안 건드린다.** 팀 성향이 연봉(`win_now_pressure`)과
    //   연수(`stability`)를 흔드는 건 이미 있다. 여기서는 **연봉 하나만** 민다.
    //
    // ⚠ 기준점은 3팀이다 — 예전 제비뽑기가 3~5팀이었으므로 그 아래쪽 끝이
    //   "경쟁 없음"에 가깝다. 폭은 좁게 잡았다(0.96 ~ 1.18):
    //
    //       1팀  0.96      혼자 부르면 깎인다
    //       3팀  1.00      기준
    //       8팀  1.10
    //      12팀+ 1.18      상한
    let competition = 1.0 + ((n_picks as f64) - 3.0).clamp(-2.0, 9.0) * 0.02;

    // 씨앗 유무에 따라 난수원이 달라지므로 구체 타입을 못 박지 않는다
    let make_offer = |team: &TeamRef, league_market: f64, rng: &mut dyn rand::RngCore| -> FaOffer {
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
        let salary  = (league_market * mult * (1.0 + noise) * market_drop * competition).round() as i64;
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

    let offers: Vec<FaOffer> = indices[..n_picks].iter()
        .map(|&idx| make_offer(same_league[idx], market, &mut rng))
        .collect();

    // 🔴 **두 번째 문을 지웠다** (2026-08-27).
    //
    //   여기 `OVERSEAS_ROUTES`가 있었다 — 후보 풀과 **별개로** 해외 팀을 1~2개
    //   무작위로 더 얹는 경로다. 해외가 열리기 전엔 그게 **유일한 방법**이었고
    //   그땐 맞았다.
    //
    //   1단계가 풀을 열면서(`faDestinationLeagues`) ABL·JBL이 이미 풀에 들어왔다.
    //   그러자 같은 일을 하는 길이 둘이 됐고, 이쪽은 **문지기를 전부 우회**했다 —
    //   관심도 판정(`eval_fa_bid`) · 정원 여유 · 외국인 보유 한도 · 포스팅 문턱.
    //   실측(8시즌 × 6씨앗): 문지기를 달았는데도 해외 제안이 89건 남았다.
    //
    // ⚠ **리그별 바닥은 안 버렸다.** 그 두 줄(ABL 70/30 · JBL 62/15)이 이 루트가
    //   가진 유일한 근거였고, 그대로 `postingInterest.ts`의 `OVERSEAS_FLOOR`로
    //   옮겨 풀 문지기에 물렸다. **값은 안 바꿨다** — 바꾸면 이동 전후를 못 잰다.
    //   그 문턱 차이가 위계다 — **ABL이 위**고, 연봉도 ABL 3.5 / JBL 2.0이다.
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
    /// 리그 연봉 배수 (`salaryRules.leagueMult`). 비면 옛 표로 떨어진다
    #[serde(default)]
    pub league_mult: std::collections::HashMap<String, f64>,
    pub ovr: f64,
    pub age: i32,
    pub league_id: String,
    pub current_salary: i64,
    pub performance_score: f64,  // 0~100, 시즌 성적 기반
    pub greed: f64,              // personality.greed 0~100
    /// 🔴 **구단주가 돈을 쓰는 성향** (2026-09-01 · C-3). 0~100.
    ///
    /// ⚠ **안 넘기면 예전 그대로다**(50 → 배수 1.0). 구 페이로드가 그대로 돈다.
    ///
    /// 이 축은 구단 성향 12축 중 **유일하게 아무 데서도 안 읽히던 것**이었다.
    /// 읽는 자리가 Rust 전체에 하나뿐이었고(`team_engine::base_contract_offer`)
    /// 그 함수의 TS 호출부가 0건이었다 — **축 하나가 통째로 죽어 있었다.**
    #[serde(default)]
    pub owner_spending_willingness: Option<f64>,
}

pub fn calc_npc_renewal_salary(p: CalcNpcRenewalSalaryParams) -> i64 {
    let market = (1800.0 + (p.ovr - 50.0).max(0.0) * 220.0) * league_salary_mult(&p.league_id, &p.league_mult);
    let blend  = p.current_salary as f64 * 0.6 + market * 0.4;
    let perf   = 0.9 + (p.performance_score / 100.0) * 0.2;   // ×0.90~×1.10
    let greed  = 1.0 + (p.greed - 50.0) / 500.0;              // ×0.90~×1.10
    let age_damp = if p.age >= 33 { 0.9 } else { 1.0 };
    // 🔴 **구단주 성향** — 같은 선수라도 구단에 따라 제시액이 다르다.
    //
    // ⚠ **계단이 아니라 연속이다** (사용자 확정 2026-09-01). 죽어 있던
    //   `base_contract_offer` 는 `owner / 25` 로 4단 계단이었는데, 실측해
    //   보니 그 표가 축을 **삼킨다**:
    //
    //       KBL 축  26 45 45 45 45 49 49 49 71 75  →  배수 0.92 가 **8팀**
    //
    //   26 과 49 가 같은 값이 된다. 연속으로 두면 KBL 이 3 → 5 가지,
    //   해외가 3 → 12 가지로 갈린다(폭은 20% → 16% 로 비슷하다).
    //
    // ⚠ **KBL 은 이래도 5가지뿐이다.** 축 값 자체가 45 에 4팀·49 에 3팀으로
    //   뭉쳐 있고, 그건 예산에서 유도하기 때문이다
    //   (`deriveProfileFromBudgetIndex`). **근본은 KBL 예산 분포**라
    //   여기서는 못 푼다.
    //
    // ⚠ 상·하한(`market * 0.55 ~ 1.35`)은 그대로다 — 성향이 그 밖으로
    //   끌고 나가면 리그 연봉 체계가 무너진다.
    let owner = 0.85
        + p.owner_spending_willingness.unwrap_or(50.0).clamp(0.0, 100.0) / 100.0 * 0.30;
    let raw = blend * perf * greed * age_damp * owner;
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

    /// 팀 하나 — 관심도가 반드시 문턱을 넘도록 얇은 자리와 넉넉한 예산을 준다
    fn fa_team(i: usize) -> TeamRef {
        TeamRef {
            id: format!("TEAM_{i}"),
            league_id: "LEAGUE_KBL".into(),
            profile: None,
            current_payroll: 10_000,
            salary_cap: 1_000_000,
            roster_needs: vec!["SP".into()],
        }
    }

    fn fa_params(n_teams: usize) -> GenerateFaOffersParams {
        GenerateFaOffersParams {
            league_mult: std::collections::HashMap::new(),
            seed: 12345,
            pitching_ovr: 80.0,
            fame: 50.0,
            league_id: "LEAGUE_KBL".into(),
            team_id: "TEAM_HOME".into(),
            fa_unsigned_weeks: Some(0),
            age: Some(28),
            pro_service_years: Some(6),
            position: Some("SP".into()),
            interest_min: 65.0,
            teams: (0..n_teams).map(fa_team).collect(),
        }
    }

    /// **부른 팀이 많으면 조건이 좋아진다.**
    ///
    /// 🔴 예전엔 부른 팀 수가 **아무 뜻도 없었다** — 3팀이든 12팀이든 연봉이
    ///   같았다. 관심도 판정을 붙여 놓고 그 결과를 협상력으로 안 쓴 셈이다.
    ///
    /// ⚠ 난수가 섞이므로 **평균으로 본다.** 한 건씩 비교하면 0.85~1.20 폭에
    ///   묻혀 조용히 통과한다.
    #[test]
    fn 부른_팀이_많으면_연봉이_오른다() {
        let avg = |n: usize| -> f64 {
            let offers = generate_fa_offers(fa_params(n));
            assert!(!offers.is_empty(), "{n}팀인데 제안이 0건이다");
            offers.iter().map(|o| o.salary as f64).sum::<f64>() / offers.len() as f64
        };
        let few  = avg(2);
        let many = avg(13);
        assert!(many > few * 1.10,
            "경쟁 배수가 안 걸렸다 — 2팀 {few:.0} vs 13팀 {many:.0}");
    }

    /// ⚠ **상한이 있어야 한다.** 없으면 리그가 커질수록 연봉이 끝없이 오른다.
    #[test]
    fn 경쟁_배수에_상한이_있다() {
        let avg = |n: usize| -> f64 {
            let offers = generate_fa_offers(fa_params(n));
            offers.iter().map(|o| o.salary as f64).sum::<f64>() / offers.len() as f64
        };
        let at12 = avg(13);
        let at30 = avg(31);
        assert!((at30 - at12).abs() / at12 < 0.10,
            "12팀 위로도 계속 오른다 — 13팀 {at12:.0} vs 31팀 {at30:.0}");
    }

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
        let p = CalcMarketSalaryParams { ovr: 50.0, fame: 0.0, league_id: "KBL".to_string(), league_mult: Default::default() };
        assert_eq!(calc_market_salary(p), 1800);
    }

    #[test]
    fn calc_market_salary_high_ovr() {
        // 1800 + (80-50)*220 = 8400
        let p = CalcMarketSalaryParams { ovr: 80.0, fame: 0.0, league_id: "KBL".to_string(), league_mult: Default::default() };
        assert_eq!(calc_market_salary(p), 8400);
    }

    #[test]
    fn calc_market_salary_abl_multiplier() {
        // 1800 * 3.5 = 6300
        let p = CalcMarketSalaryParams { ovr: 50.0, fame: 0.0, league_id: "LEAGUE_ABL".to_string(), league_mult: Default::default() };
        assert_eq!(calc_market_salary(p), 6300);
    }

    #[test]
    fn calc_offered_salary_floor() {
        // 낮은 값 → 1500 floor
        let p = CalcOfferedSalaryParams { current_salary: 100.0, rating: 50.0, market_salary: 100.0, league_mult: Default::default() };
        assert_eq!(calc_offered_salary(p), 1500);
    }

    #[test]
    fn calc_season_rating_no_stats() {
        let p = CalcSeasonRatingParams { stats: None };
        assert_eq!(calc_season_rating(p), 50);
    }
}

// ── 유망주 순위 (TOP 10) ─────────────────────────────────────────────────────

/// **유망주 점수 · 순위** — 주간 TOP10이 쓴다.
///
/// 🔴 이 계산이 통째로 TS(`top10Engine.ts`)에 있었다:
///   · 주인공 점수 — OVR·스카우트 가중, 성적 가중(0 / 0.15 / 0.30)
///   · NPC 점수 — 같은 축
///   · `simNpcScout` — **id 뒷자리로 만드는 유사난수**. `Math.random()`은
///     아니지만 **난수를 TS가 만드는 것**은 같다
///
/// ⚠ **정렬까지 여기서 한다.** 점수만 돌려주면 TS가 다시 줄을 세우고,
///   동점 처리가 두 곳에서 갈린다.
///
/// ⚠ 값은 옮기기만 했다 — 가중치·구간을 안 바꿨다.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProspectNpc {
    pub id: String,
    pub name: String,
    pub team_name: String,
    pub ovr: f64,
    #[serde(default)]
    pub grade: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProspectRankParams {
    pub npcs: Vec<ProspectNpc>,
    pub week: i32,
    /// 주인공
    pub hero_name: String,
    pub hero_team_name: String,
    pub hero_ovr: f64,
    pub hero_scout_score: f64,
    pub hero_grade: i32,
    /// 주인공 성적 — 없으면 능력치만 본다
    #[serde(default)]
    pub is_pitcher: bool,
    #[serde(default)]
    pub ip: f64,
    #[serde(default)]
    pub era: f64,
    #[serde(default)]
    pub k: f64,
    #[serde(default)]
    pub pa: f64,
    #[serde(default)]
    pub avg: f64,
    #[serde(default)]
    pub ops: f64,
    #[serde(default)]
    pub has_stats: bool,
    /// 학년 필터. 0이면 전체다
    #[serde(default)]
    pub grade_filter: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProspectEntry {
    pub id: String,
    pub name: String,
    pub team_name: String,
    pub score: f64,
    pub rank: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProspectRankResult {
    pub entries: Vec<ProspectEntry>,
    /// TOP10 밖일 때의 주인공 순위. 0이면 없다(안에 들었거나 학년 필터 밖)
    pub hero_rank: i32,
}

/// NPC 스카우트 평가 (10~70) — **id·주차·학년으로 정해진다.**
/// ⚠ 난수원이 아니라 **결정적 해시**다. 같은 주에 같은 선수는 같은 값이다.
fn sim_npc_scout(npc_id: &str, week: i32, grade: i32) -> f64 {
    // 뒤 세 자리를 숫자로 — 없으면 1
    let tail: i64 = npc_id.chars().rev().take(3).collect::<String>()
        .chars().rev().collect::<String>()
        .parse().unwrap_or(1);
    let seed = (tail * 1000 + week as i64 * 13 + grade as i64 * 7).rem_euclid(600);
    10.0 + (seed as f64 / 600.0) * 60.0
}

/// 주인공 점수 — 성적이 쌓일수록 능력치 비중이 줄고 성적 비중이 는다
fn hero_prospect_score(p: &ProspectRankParams) -> f64 {
    let ovr = p.hero_ovr;
    let sc = p.hero_scout_score;
    if !p.has_stats { return ovr * 0.80 + sc * 0.20; }

    if p.is_pitcher {
        let stat_w = if p.ip < 10.0 { 0.0 } else if p.ip < 30.0 { 0.15 } else { 0.30 };
        let era_score = ((9.0 - p.era) / 9.0 * 100.0).clamp(0.0, 100.0);
        let k9_score = if p.ip > 0.0 { ((p.k / p.ip) * 9.0 * 2.0).min(100.0) } else { 0.0 };
        let stat_score = era_score * 0.6 + k9_score * 0.4;
        ovr * (0.80 - stat_w) + sc * 0.20 + stat_score * stat_w
    } else {
        let stat_w = if p.pa < 20.0 { 0.0 } else if p.pa < 60.0 { 0.15 } else { 0.30 };
        let avg_score = (p.avg * 250.0).min(100.0);
        let ops_score = (p.ops * 83.0).min(100.0);
        let stat_score = avg_score * 0.5 + ops_score * 0.5;
        ovr * (0.80 - stat_w) + sc * 0.20 + stat_score * stat_w
    }
}

pub fn calc_prospect_rank(p: ProspectRankParams) -> ProspectRankResult {
    let hero_included = p.grade_filter == 0 || p.hero_grade == p.grade_filter;
    let hero_score = hero_prospect_score(&p);

    let mut pool: Vec<ProspectEntry> = p.npcs.iter()
        .filter(|n| p.grade_filter == 0 || n.grade == p.grade_filter)
        .map(|n| ProspectEntry {
            id: n.id.clone(),
            name: n.name.clone(),
            team_name: n.team_name.clone(),
            score: n.ovr * 0.80 + sim_npc_scout(&n.id, p.week, n.grade) * 0.20,
            rank: 0,
        })
        .collect();

    if hero_included {
        pool.push(ProspectEntry {
            id: "PLY_HERO".into(),
            name: p.hero_name.clone(),
            team_name: p.hero_team_name.clone(),
            score: hero_score,
            rank: 0,
        });
    }

    // ⚠ **동점 처리를 한 곳에서 한다.** 점수만 돌려주고 TS가 다시 세우면
    //   여기 순서와 갈린다
    pool.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    let mut entries: Vec<ProspectEntry> = pool.iter().take(10).enumerate()
        .map(|(i, e)| ProspectEntry { rank: i as i32 + 1, ..ProspectEntry {
            id: e.id.clone(), name: e.name.clone(), team_name: e.team_name.clone(),
            score: e.score, rank: 0,
        }})
        .collect();
    for (i, e) in entries.iter_mut().enumerate() { e.rank = i as i32 + 1; }

    let hero_rank = if hero_included && !entries.iter().any(|e| e.id == "PLY_HERO") {
        pool.iter().position(|e| e.id == "PLY_HERO").map(|i| i as i32 + 1).unwrap_or(0)
    } else { 0 };

    ProspectRankResult { entries, hero_rank }
}

#[cfg(test)]
mod prospect_tests {
    use super::*;

    /// 🔴 **TS와 같은 값이 나와야 한다.** `simNpcScout`의 뒷자리 파싱이
    ///   다르면 **순위가 통째로 달라진다** — 옮기기만 한 게 아니게 된다.
    ///
    /// TS 원본은 `parseInt(npcId.slice(-3), 10) || 1`이다:
    ///   "0001" → slice(-3) = "001" → 1
    ///   "0123" → "123" → 123
    ///   "1999" → "999" → 999
    ///   "ABC"  → NaN → 1
    ///   "00A"  → parseInt("00A") = 0 → `|| 1` → 1
    #[test]
    fn 뒷자리_파싱이_ts와_같다() {
        // (id, 기대 tail)
        let cases: [(&str, i64); 5] = [
            ("PLY_HS_2026_0001", 1),
            ("PLY_HS_2026_0123", 123),
            ("PLY_HS_2026_1999", 999),
            ("PLY_ABC", 1),
            ("PLY_HS_X_00A", 1),
        ];
        for (id, tail) in cases {
            let expect = 10.0 + (((tail * 1000 + 5 * 13 + 3 * 7).rem_euclid(600)) as f64 / 600.0) * 60.0;
            let got = sim_npc_scout(id, 5, 3);
            assert!((got - expect).abs() < 1e-9, "{id}: {got} != {expect}");
        }
    }

    /// ⚠ 범위가 10~70이어야 한다 — 벗어나면 점수 축이 바뀐다
    #[test]
    fn 스카우트_평가가_범위_안이다() {
        for i in 0..2000 {
            let v = sim_npc_scout(&format!("PLY_{:04}", i), i % 52, i % 3 + 1);
            assert!((10.0..=70.0).contains(&v), "{i}: {v}");
        }
    }

    fn base(hero_ovr: f64) -> ProspectRankParams {
        ProspectRankParams {
            npcs: vec![], week: 5,
            hero_name: "주인공".into(), hero_team_name: "우리팀".into(),
            hero_ovr, hero_scout_score: 50.0, hero_grade: 3,
            is_pitcher: true, ip: 0.0, era: 0.0, k: 0.0,
            pa: 0.0, avg: 0.0, ops: 0.0, has_stats: false, grade_filter: 0,
        }
    }

    /// 성적이 없으면 능력치만 본다 — `ovr*0.8 + scout*0.2`
    #[test]
    fn 성적이_없으면_능력치만_본다() {
        let r = calc_prospect_rank(base(70.0));
        assert_eq!(r.entries.len(), 1);
        assert!((r.entries[0].score - (70.0 * 0.8 + 50.0 * 0.2)).abs() < 1e-9);
    }

    /// 🔴 **이닝이 쌓이면 성적 비중이 는다** — 0 / 0.15 / 0.30
    ///
    /// ⚠ **"이닝이 늘면 점수가 오른다"가 아니다.** 처음엔 그렇게 짰다가 틀렸다 —
    ///   성적 점수가 OVR보다 낮으면 비중이 늘수록 **점수가 내려간다.**
    ///   그게 맞는 동작이다. 비중이 걸리는지는 **같은 이닝에서 성적을 갈라**
    ///   봐야 알 수 있다.
    #[test]
    fn 이닝이_쌓이면_성적_비중이_는다() {
        // 성적이 좋을 때와 나쁠 때의 격차가 이닝이 쌓일수록 벌어져야 한다
        let gap = |ip: f64| -> f64 {
            let good = ProspectRankParams {
                has_stats: true, ip, era: 1.00, k: ip * 1.5, ..base(70.0)
            };
            let bad = ProspectRankParams {
                has_stats: true, ip, era: 8.00, k: 0.0, ..base(70.0)
            };
            calc_prospect_rank(good).entries[0].score - calc_prospect_rank(bad).entries[0].score
        };
        let g5 = gap(5.0);      // 비중 0
        let g20 = gap(20.0);    // 비중 0.15
        let g50 = gap(50.0);    // 비중 0.30
        assert!(g5.abs() < 1e-9, "5이닝인데 성적이 걸렸다 (격차 {g5})");
        assert!(g20 > 0.0, "20이닝인데 성적이 안 걸렸다 (격차 {g20})");
        assert!(g50 > g20, "50이닝({g50})이 20이닝({g20})보다 안 벌어졌다");
    }

    /// 🔴 **TOP10 밖이면 실제 순위를 돌려준다** — 안에 들면 0이다
    #[test]
    fn top10_밖이면_순위를_준다() {
        let npcs: Vec<ProspectNpc> = (0..30).map(|i| ProspectNpc {
            id: format!("PLY_{:04}", i), name: format!("N{i}"),
            team_name: "T".into(), ovr: 99.0, grade: 3,
        }).collect();
        let mut p = base(40.0);   // 주인공이 한참 아래다
        p.npcs = npcs;
        let r = calc_prospect_rank(p);
        assert_eq!(r.entries.len(), 10);
        assert!(!r.entries.iter().any(|e| e.id == "PLY_HERO"));
        assert!(r.hero_rank > 10, "주인공 순위 {}", r.hero_rank);
    }

    /// ⚠ 학년 필터 밖이면 주인공을 안 넣는다 — 순위도 0이다
    #[test]
    fn 학년_필터_밖이면_안_넣는다() {
        let mut p = base(99.0);
        p.grade_filter = 1;   // 주인공은 3학년
        let r = calc_prospect_rank(p);
        assert!(!r.entries.iter().any(|e| e.id == "PLY_HERO"));
        assert_eq!(r.hero_rank, 0);
    }

    // ── 구단주 성향이 재계약 제시액을 탄다 (2026-09-01 · C-3) ──────────────

    fn renewal(owner: Option<f64>, current_salary: i64, ovr: f64) -> i64 {
        let mut mult = std::collections::HashMap::new();
        mult.insert("LEAGUE_KBL".to_string(), 1.0_f64);
        calc_npc_renewal_salary(CalcNpcRenewalSalaryParams {
            league_mult: mult,
            ovr, age: 28,
            league_id: "LEAGUE_KBL".into(),
            current_salary,
            performance_score: 60.0,
            greed: 50.0,
            owner_spending_willingness: owner,
        })
    }

    /// 시장가(`1800 + (ovr-50)*220`) — 상·하한을 피해 고르려고 쓴다
    fn market_of(ovr: f64) -> f64 { 1800.0 + (ovr - 50.0).max(0.0) * 220.0 }

    /// 🔴 **이게 이 수정의 핵심이다.**
    ///
    /// 구단 성향 12축 중 `owner_spending_willingness` 만 아무 데서도 안 읽혔다.
    /// 읽는 자리가 Rust 전체에 하나뿐이었고(`team_engine::base_contract_offer`)
    /// 그 함수의 TS 호출부가 0건이었다.
    #[test]
    fn 구단주_성향이_제시액을_가른다() {
        // ⚠ 상·하한을 피한 자리에서 본다 — 현재 연봉을 시장가 근처로 둔다
        let ovr = 72.0;
        let cur = (market_of(ovr) * 0.9) as i64;
        let 짠구단 = renewal(Some(26.0), cur, ovr);   // KBL 최저 실측
        let 큰손 = renewal(Some(75.0), cur, ovr);     // KBL 최고 실측
        assert!(큰손 > 짠구단, "큰손이 더 줘야 한다: {큰손} vs {짠구단}");
        // 축의 폭은 0.85~1.15 라 약 15% 다. 계단표(4단)였다면 KBL 10팀 중
        // 8팀이 **같은 값**이었다 — 연속으로 둔 이유가 그것이다
        let 비율 = 큰손 as f64 / 짠구단 as f64;
        assert!(비율 > 1.10 && 비율 < 1.25, "폭이 이상하다: {비율}");
    }

    /// 🔴 **계단이면 안 된다 — 이게 이 수정의 요점이다.**
    ///
    /// 죽어 있던 `base_contract_offer` 는 `owner / 25` 로 4단 계단이었다.
    /// 그 표에서는 **26 과 45 가 같은 값**(0.92)이 되고, KBL 실측 축이
    /// `26 45 45 45 45 49 49 49 71 75` 라 **10팀 중 8팀이 한 칸에 몰린다.**
    ///
    /// 이 검사가 없으면 계단으로 되돌려도 아무도 안 잡는다 — 실제로
    /// 처음 짠 검사가 그 변이를 놓쳤다.
    #[test]
    fn 계단이_아니라_연속이다() {
        let ovr = 72.0;
        let cur = (market_of(ovr) * 0.9) as i64;
        // 계단표에서는 둘 다 0.92 다. 연속이면 갈려야 한다
        assert_ne!(renewal(Some(26.0), cur, ovr), renewal(Some(45.0), cur, ovr),
            "26 과 45 가 같은 값이다 — 계단표로 돌아갔다");
        // 같은 칸 안의 다른 두 값도 갈려야 한다 (45·49 는 계단에서 둘 다 0.92)
        assert_ne!(renewal(Some(45.0), cur, ovr), renewal(Some(49.0), cur, ovr),
            "45 와 49 가 같은 값이다 — 계단표로 돌아갔다");
    }

    /// ⚠ **안 넘기면 예전 그대로여야 한다.** 구 페이로드가 그대로 돈다
    #[test]
    fn 성향을_안_넘기면_중립이다() {
        let ovr = 72.0;
        let cur = (market_of(ovr) * 0.9) as i64;
        assert_eq!(renewal(None, cur, ovr), renewal(Some(50.0), cur, ovr));
    }

    /// 🔴 **상·하한이 축을 삼킨다.** 실측에서 재계약 228건 중 **54%** 가
    ///   상한(19%) 또는 하한(36%)에 붙어 있었다 — 그 선수들에겐 성향뿐 아니라
    ///   **성적·greed·나이 축도 안 보인다.**
    ///
    ///   이 검사는 그 사실을 못박는다. 고치는 건 밸런스 몫이다.
    #[test]
    fn 현재_연봉이_시장가보다_훨씬_높으면_상한이_축을_삼킨다() {
        let ovr = 72.0;
        let cur = (market_of(ovr) * 2.0) as i64;   // 시장가의 2배
        assert_eq!(renewal(Some(26.0), cur, ovr), renewal(Some(75.0), cur, ovr),
            "상한에 붙으면 성향이 안 보인다 — 그게 지금 재계약의 19% 다");
    }

    /// 상·하한 자체는 그대로여야 한다 — 성향이 그 밖으로 끌고 나가면
    /// 리그 연봉 체계가 무너진다
    #[test]
    fn 성향이_상하한을_넘지_못한다() {
        let ovr = 72.0;
        let m = market_of(ovr);
        let 큰손_비싼선수 = renewal(Some(100.0), (m * 3.0) as i64, ovr);
        assert!(큰손_비싼선수 as f64 <= m * 1.35 + 1.0, "상한을 넘었다: {큰손_비싼선수}");
        let 짠구단_싼선수 = renewal(Some(0.0), 1, ovr);
        assert!(짠구단_싼선수 as f64 >= m * 0.55 - 1.0, "하한 아래다: {짠구단_싼선수}");
    }
// ── 1.1 A④ §5 — 추천 밖 깊이 불이익 ─────────────────────────────
    fn off() -> crate::pitcher_role::OffRecommendation {
        crate::pitcher_role::OffRecommendation { per_seat_over: 0.30, floor: 0.15 }
    }

    #[test]
    fn 선발_건너뛰기는_깊이만큼만_걸린다() {
        // 자리 안이면 씨앗과 무관하게 늘 등판한다
        for seed in [1u32, 7, 12345, 99991] {
            let r = starter_would_start(StarterStartParams { seed, role_depth: Some(0), off_recommendation: Some(off()) });
            assert!(r.would_start, "자리 안인데 건너뛰었다");
            assert!((r.depth_factor - 1.0).abs() < 1e-9);
        }
        // 🔴 대조군 — 규칙을 안 넘기면 불이익이 없다(배선 누락이 조용히 깎으면 안 된다)
        for seed in [1u32, 7, 12345, 99991] {
            assert!(starter_would_start(StarterStartParams { seed, role_depth: Some(3), off_recommendation: None }).would_start);
        }
        // 세 칸 밖이면 바닥 0.15 — 씨앗 200개 중 등판이 절반 밑이다
        let n = (1..=200u32).filter(|s| starter_would_start(
            StarterStartParams { seed: *s * 7919, role_depth: Some(3), off_recommendation: Some(off()) }).would_start).count();
        assert!(n < 100, "바닥 0.15 인데 {n}/200 이 등판했다");
    }

    #[test]
    fn 불펜_등판_확률에_깊이가_곱해진다() {
        let mk = |seed: u32, depth: Option<u32>, rules: bool| RelieverPitchParams {
            seed, role: "마무리".into(), pitch_outs_last: Some(0),
            last_pitched_week: Some(0), current_week: Some(5),
            last_pitched_date: None, last_pitch_count: None, game_date: None,
            role_depth: depth,
            off_recommendation: if rules { Some(off()) } else { None },
        };
        let cnt = |depth: Option<u32>, rules: bool| (1..=300u32)
            .filter(|s| reliever_would_pitch(mk(*s * 7919, depth, rules)).would_pitch).count();
        let base = cnt(Some(0), true);
        let deep = cnt(Some(3), true);
        assert!(deep < base, "깊이가 등판을 안 줄였다 {base} → {deep}");
        // 🔴 대조군 — 규칙을 빼면 깊이가 있어도 base 와 같아야 한다
        assert_eq!(cnt(Some(3), false), base);
    }
}
