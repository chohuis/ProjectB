use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::sim_types::*;

/// FA 자격 연수 **폴백**.
///
/// 정본은 `generation_rules.json`의 `faRules.eligibleYears`다. 규칙을 들고
/// 있지 않은 호출 경로(오프시즌 내부 등)를 위한 값이라, 규칙 파일과 달라지면
/// `npm run test:fa`가 깨진다 — 이 프로젝트에서 "표가 두 곳"으로 시작한
/// 결함이 열 번 나왔다.
pub fn fa_eligibility_years(league_id: &str) -> i32 {
    match league_id {
        "LEAGUE_KBL" => 5,
        "LEAGUE_ABL" => 6,
        "LEAGUE_JBL" => 4,
        _ => 9,
    }
}

// ── calc_win_now_pressure_update ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WinNowUpdateParams {
    pub current_pressure: f64,
    pub owner_patience: f64,
    pub final_standing: i32,
    pub total_teams: i32,
    pub consecutive_missed_playoffs: i32,
    pub won_championship: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WinNowUpdateResult {
    pub new_pressure: f64,
    pub delta: f64,
}

pub fn calc_win_now_pressure_update(p: WinNowUpdateParams) -> WinNowUpdateResult {
    let patience_mult = 1.0 - (p.owner_patience / 100.0) * 0.5;
    let delta = if p.won_championship { -20.0 }
        else if p.final_standing <= 2 { -5.0 }
        else if p.final_standing <= p.total_teams / 2 { 2.0 * patience_mult }
        else { 8.0 * patience_mult + p.consecutive_missed_playoffs as f64 * 5.0 };
    let new_pressure = (p.current_pressure + delta).clamp(0.0, 100.0);
    WinNowUpdateResult { new_pressure, delta }
}

// ── calc_scouting_improvement ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingImprovementParams {
    pub current_quality: f64,
    pub scout_budget_ratio: f64,
    pub hired_scout_quality: Option<f64>,
    pub consecutive_playoff_years: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingImprovementResult {
    pub new_quality: f64,
    pub delta: f64,
}

pub fn calc_scouting_improvement(p: ScoutingImprovementParams) -> ScoutingImprovementResult {
    let budget_bonus  = p.scout_budget_ratio * 4.0;
    let playoff_bonus = (p.consecutive_playoff_years as f64 * 0.5).min(2.5);
    let hired_bonus   = p.hired_scout_quality.map(|q| q / 10.0).unwrap_or(0.0);
    let delta = 1.0 + budget_bonus + playoff_bonus + hired_bonus;
    let new_quality = (p.current_quality + delta).min(100.0);
    ScoutingImprovementResult { new_quality, delta }
}

// ── eval_callup_candidates ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalCallupParams {
    pub team_profile: ProTeamProfile,
    pub farm_players: Vec<RosterPlayerRef>,
    pub active_players: Vec<RosterPlayerRef>,
    pub injured_player_ids: Vec<String>,
    pub current_month: i32,
    /// 성적 반영 규칙. 안 넘어오면 기본값(성적을 보긴 하되 보수적)
    #[serde(default)]
    pub promotion_rules: Option<PromotionRules>,
    /// 감독 `clutchDecision` 계수 (1.0 = 중립). **성적을 얼마나 정확히 읽는가**다.
    /// 낮으면 최근 성적이 판단에 거의 안 들어가 이름값(OVR)만 보고 올린다.
    /// 스태프 15종 배선(§7-5 F-1)
    #[serde(default)]
    pub callup_mod: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallupCandidate {
    pub player_id: String,
    pub replaces_player_id: String,
    pub priority_score: f64,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalCallupResult {
    pub candidates: Vec<CallupCandidate>,
}

// ── 성적 기반 판정 (Phase 7-2) ───────────────────────────────────────────────

/// 승강 판정 규칙. 정본은 `generation_rules.json`의 `promotionRules`
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromotionRules {
    /// 성적이 능력치 대비 몇 점어치인가. 이게 0이면 예전처럼 능력치만 본다
    pub form_weight: f64,
    /// 이 평균자책점이 ±0점. 낮을수록 좋다
    pub pitcher_era_baseline: f64,
    /// 이만큼 던져야 성적을 100% 반영한다 (그 아래는 비례해서 깎는다)
    pub pitcher_full_innings: f64,
    pub batter_ops_baseline: f64,
    pub batter_full_pa: f64,
    /// OPS 하한 — 여기서 성적 점수가 −1.0이 된다.
    ///
    /// ⚠ **0이면 예전 동작이다**(기준값을 분모로 써서 −1.0에 안 닿는다).
    /// 실측 OPS 최저가 .457이라 .450으로 둔다 — 투수가 ERA 9.00에서 −1.0에
    /// 닿는 것과 대칭이다.
    #[serde(default)]
    pub batter_ops_floor: f64,
    /// 성적 점수 폭 (±). 넓힐수록 성적이 능력치를 크게 뒤집는다
    pub form_span: f64,
    /// 이 점수 아래면 "장기 부진" — 상시 콜업의 트리거다
    pub slump_score: f64,
    /// 2군 구성 하한. **정본은 `generation_rules.json`이다** —
    /// `rosterMin × 보직비율 − 여유2`로 파생한 값을 호출측이 넣는다.
    /// 예전엔 `tuning.rs`에만 8/9로 박혀 있었고 회귀 테스트는 규칙 파일에서
    /// 9/12를 파생했다 — **정본이 둘이라 3팀이 계속 미달로 잡혔다.**
    #[serde(default)]
    pub farm_min_pitchers: Option<usize>,
    #[serde(default)]
    pub farm_min_batters: Option<usize>,
}

impl Default for PromotionRules {
    fn default() -> Self {
        Self {
            form_weight: 8.0, pitcher_era_baseline: 4.50, pitcher_full_innings: 40.0,
            batter_ops_floor: 0.0,
            batter_ops_baseline: 0.700, batter_full_pa: 120.0,
            form_span: 1.0, slump_score: -0.5,
            farm_min_pitchers: None, farm_min_batters: None,
        }
    }
}

/// 성적 점수 −1.0 ~ +1.0. 표본이 적으면 그만큼 0쪽으로 당긴다 —
/// **몇 경기 안 뛴 선수가 요행으로 1군에 올라오지 않게** 하는 장치다.
/// 기록이 아예 없으면 0이라 판정이 능력치만 보게 된다.
pub fn form_score(perf: Option<&RosterPerf>, is_pitcher: bool, r: &PromotionRules) -> f64 {
    let Some(perf) = perf else { return 0.0 };

    let (raw, sample) = if is_pitcher {
        if perf.innings <= 0.0 { return 0.0; }
        // 자책점이 기준보다 낮으면 +. 기준의 절반이면 +1.0에 닿는다
        let rel = (r.pitcher_era_baseline - perf.era) / r.pitcher_era_baseline.max(0.01);
        (rel, (perf.innings / r.pitcher_full_innings.max(1.0)).min(1.0))
    } else {
        if perf.plate_appearances <= 0 { return 0.0; }
        // OPS는 기준 대비 비율. 0.700 기준에 0.910이면 +0.3
        //
        // 🔴 **마이너스 쪽 분모가 달라야 대칭이 된다.** 기준값(.700)을 그대로
        // 분모로 쓰면 −1.0이 되는 OPS가 **.000**이라 절대 안 닿는다. 실측
        // 최저가 .457이라 현실적 하한이 −0.35였다. 투수는 기준의 2배(ERA 9.00)에서
        // −1.0이고 실측 p90이 7.04·최대 12.8이라 **실제로 닿는다** —
        // 그래서 성적 감점이 투수에게만 크게 걸렸다.
        //
        // 플러스 쪽은 안 건드린다. 좋은 성적의 눈금까지 바꾸면 승강·재계약이
        // 한꺼번에 달라져 원인을 못 가린다(사용자 확정: 바닥만 고친다).
        let d = perf.ops - r.batter_ops_baseline;
        let rel = if d >= 0.0 {
            d / r.batter_ops_baseline.max(0.01)
        } else {
            // 하한까지의 거리로 나눈다 — 하한에서 −1.0이 된다
            let floor = r.batter_ops_floor;
            let span = (r.batter_ops_baseline - floor).max(0.01);
            d / span
        };
        (rel, (perf.plate_appearances as f64 / r.batter_full_pa.max(1.0)).min(1.0))
    };

    (raw * sample).clamp(-r.form_span, r.form_span)
}

/// 능력치 + 성적. 승강 판정이 비교하는 단일 값이다
fn rated(pl: &RosterPlayerRef, r: &PromotionRules) -> f64 {
    let is_pitcher = matches!(pl.position.as_str(), "SP" | "RP" | "CP" | "P");
    pl.ovr + form_score(pl.perf.as_ref(), is_pitcher, r) * r.form_weight
}

pub fn eval_callup_candidates(p: EvalCallupParams) -> EvalCallupResult {
    let profile = &p.team_profile;
    let mut rules = p.promotion_rules.clone().unwrap_or_default();
    rules.form_weight *= p.callup_mod.unwrap_or(1.0).clamp(0.70, 1.30);
    let mut candidates = Vec::new();
    let threshold = 10.0 - (profile.win_now_pressure * 0.05);

    let is_pit = |pos: &str| matches!(pos, "SP" | "RP" | "CP" | "P");
    let count_at = |pos: &str| p.active_players.iter().filter(|a| a.position == pos).count();

    // ⚠ **하한이 브레이크로만 쓰이고 액셀이 없었다.**
    //
    // `FIRST_TEAM_MIN_PITCHERS`(12)가 세 군데에 있는데 전부 "이 아래로는 내리지
    // 마라"다(콜다운·오프시즌 강등·트레이드). **하한 아래로 떨어진 팀을 다시
    // 올려주는 경로가 없다** — 은퇴·FA 이탈·부상 은퇴로 한 번 빠지면 그대로다.
    //
    // 실측(2시즌): 리그 투수율은 0.42~0.53으로 정상인데 **1군 팀별 최소가
    // KBL 8명 · ABL 6명**이었다. 생성이 적게 만드는 게 아니라 개별 팀이
    // 무너진 뒤 아무도 안 세운다.
    //
    // ⚠ 아래 `gap_fill`은 **포지션 단위**다(포수 0명). 투수는 SP·RP에 하나씩만
    // 있어도 자리가 안 비므로 그 경로로는 절대 안 걸린다.
    let pitchers_now = p.active_players.iter().filter(|a| is_pit(&a.position)).count();
    let pitcher_short = pitchers_now < crate::tuning::FIRST_TEAM_MIN_PITCHERS;
    // 🔴 **야수엔 이 짝이 없었다.** 투수는 총원 하한을 보는데 야수는 안 봐서,
    // 각 자리에 한 명씩만 있으면 야수 총원이 10명이어도 콜업이 안 돌았다
    // (`gap_fill`은 그 포지션이 **0명**일 때만 걸린다). 야수 총원을 보는 건
    // 오프시즌 `fill_first_teams`뿐이라 시즌 중엔 그대로 갔다.
    let batters_total = p.active_players.iter().filter(|a| !is_pit(&a.position)).count();
    let batter_short = batters_total < crate::tuning::FIRST_TEAM_MIN_BATTERS;

    for farm in &p.farm_players {
        // ⚠ **육성선수는 입단 연도엔 1군에 못 올라간다** (KBO: 5월 1일 이후).
        //
        // 여기서 빼는 건 **후보 자격뿐이다.** 위 `pitchers_now`나 아래
        // `farm_cls` 같은 정원 계산에는 그대로 센다 — 아예 빼면 2군이 얇아
        // 보여서 육성선수를 또 만들고, 그게 다음 해에 다시 못 올라간다.
        if !farm.registrable { continue; }

        // 외국인은 교체 대상에서 뺀다 — `replaces_player_id`는 호출측이 2군으로
        // 내리는 선수다. 외국인이 거기 걸리면 콜업 한 번에 1군 전용 원칙이 깨진다
        let active_at_pos: Vec<&RosterPlayerRef> = p.active_players.iter()
            .filter(|a| a.position == farm.position && !a.is_foreign)
            .collect();

        // ⚠ **자리가 비면 콜업으로는 영영 못 메웠다.**
        //
        // 콜업은 같은 포지션 1:1 교체다. 그래서 포수가 0명이 되면
        // `active_at_pos`가 비어 **2군 포수를 올릴 방법이 사라진다.** 메워주는
        // `fix_position_gaps`는 오프시즌에만 도니 다음 해까지 그대로였다 —
        // 실측에서 리그마다 1~2팀이 포수 0명이었다.
        //
        // 자리가 비었으면 **같은 부류에서 남는 자리의 최약체**를 내린다.
        // 부류를 안 맞추면 야수 공백을 메우려고 투수를 내려 반대쪽이 깨진다.
        // 그 자리의 마지막 한 명은 안 내린다 — 메우려다 새 공백을 만든다.
        let gap_fill = active_at_pos.is_empty();

        // ⚠ **투수 하한은 최후 수단이다.** 처음엔 `gap_fill`에 묶었다가
        // **기존 판정을 통째로 덮어썼다** — 투수가 12명 미만인 모든 팀에서
        // 부진·부상 교체가 사라지고 회귀 4건이 깨졌다.
        //
        // 정상 경로가 아무도 못 찾을 때만(같은 자리에 내릴 사람이 없을 때만)
        // 야수를 내려 투수를 채운다.

        // ⚠ **2군도 경기를 한다.** 1군 쪽은 `count_at >= 2`로 그 자리의 마지막
        // 한 명을 지키는데 2군 쪽엔 같은 보호가 없어서, 팀이 2군의 **마지막
        // 포수를 올려버렸다.** 메워주는 `fix_position_gaps`는 오프시즌에만
        // 도니 그대로 한 해가 간다 — 실측 KBL 2군 2팀이 포수 0명이었다.
        //
        // 다만 1군 그 자리가 비었으면(gap_fill) 올린다. **1군 포수 0명이
        // 2군 포수 0명보다 나쁘다** — 주인공이 뛰는 경기라서다.
        if !gap_fill && crate::tuning::is_specialist_position(&farm.position) {
            let farm_at_pos = p.farm_players.iter()
                .filter(|f| f.position == farm.position).count();
            if farm_at_pos <= 1 { continue; }
        }
        let pool: Vec<&RosterPlayerRef> = if gap_fill {
            // ⚠ **공백 충원은 2군 구성을 바꾼다.** 일반 콜업은 같은 포지션
            // 1:1이라 올라간 자리에 내려온 선수가 들어가지만, 여기선 부류가
            // 다를 수 있다 — 2군 투수를 올리고 야수를 내려보낸다.
            // 이걸 안 막았더니 실측 2군 투수가 7명 → **0명**이 됐다.
            let cls = is_pit(&farm.position);
            let farm_cls = p.farm_players.iter()
                .filter(|f| is_pit(&f.position) == cls).count();
            let floor = if cls {
                rules.farm_min_pitchers.unwrap_or(crate::tuning::FARM_MIN_PITCHERS)
            } else {
                rules.farm_min_batters.unwrap_or(crate::tuning::FARM_MIN_BATTERS)
            };
            if farm_cls <= floor { continue; }

            p.active_players.iter()
                .filter(|a| !a.is_foreign
                         && is_pit(&a.position) == is_pit(&farm.position)
                         && count_at(&a.position) >= 2)
                .collect()
        } else {
            active_at_pos
        };
        if pool.is_empty() { continue; }
        // **성적을 반영한 값으로 최약체를 고른다.** 예전엔 OVR만 봐서
        // 시즌 내내 부진한 베테랑이 자리를 지켰다
        let weakest = pool.iter().min_by(|a, b|
            rated(a, &rules).partial_cmp(&rated(b, &rules)).unwrap_or(std::cmp::Ordering::Equal)
        ).unwrap();

        let is_injury = p.injured_player_ids.contains(&weakest.id);
        let ovr_gap = rated(farm, &rules) - rated(weakest, &rules);
        let mut score = ovr_gap * 2.0;

        if is_injury { score += 50.0; }
        // 빈 자리를 메우는 콜업은 부상 대체와 같은 급이다 — 능력치 차가 마이너스여도
        // 올려야 한다. 포수 0명인 팀은 그 자체로 경기가 성립하지 않는다
        if gap_fill { score += 60.0; }
        if profile.stability < 40.0 { score += 8.0; }
        if profile.stability > 70.0 { score -= 5.0; }
        if profile.development_focus > 60.0 && farm.age <= 23 { score += 6.0; }
        if profile.win_now_pressure > 70.0 {
            score *= 1.5;
            if farm.age > 28 { score += 3.0; }
        }

        // 자리를 지키던 선수가 장기 부진이면 교체 압력이 올라간다
        let slumping = form_score(
            weakest.perf.as_ref(),
            matches!(weakest.position.as_str(), "SP" | "RP" | "CP" | "P"),
            &rules,
        ) <= rules.slump_score;
        if slumping { score += 20.0; }

        if score >= threshold {
            candidates.push(CallupCandidate {
                player_id: farm.id.clone(),
                replaces_player_id: weakest.id.clone(),
                priority_score: score,
                // 사유를 갈라 둔다 — 화면·로그에서 "자리가 비었다"와
                // "투수가 모자라다"는 다른 일이다
                reason: if gap_fill { "position_gap".into() }
                        else if is_injury { "injury_replacement".into() }
                        else if slumping { "slump_replacement".into() }
                        else if profile.development_focus > 60.0 { "development_exposure".into() }
                        else { "performance_upgrade".into() },
            });
        }
    }

    // ── 투수 하한 보충 — **별도 패스다** ──────────────────────────
    //
    // ⚠ `FIRST_TEAM_MIN_PITCHERS`(12)가 세 군데에 있는데 전부 "이 아래로는
    // 내리지 마라"였다(콜다운·오프시즌 강등·트레이드). **하한 아래로 떨어진
    // 팀을 다시 올려주는 경로가 없어** 은퇴·FA 이탈로 한 번 빠지면 그대로
    // 시즌을 났다 — 실측 1군 투수 최소 KBL 8명 · ABL 6명.
    //
    // ⚠ 위 루프로는 못 고친다. 같은 자리 1:1 교체라 **투수를 올리고 투수를
    // 내려 순증이 0**이고, `position_gap`은 포지션 단위라 SP·RP에 하나씩만
    // 있어도 안 걸린다.
    //
    // ⚠ **위 판정에 끼워 넣으면 안 된다.** 처음엔 `gap_fill`에 묶었다가
    // 투수 12명 미만인 모든 팀에서 부진·부상 교체가 사라졌다(회귀 4건).
    // 하한은 **최후 수단**이지 우선순위가 아니다 — 그래서 뒤에 따로 붙인다.
    if pitcher_short {
        let has_pit_candidate = candidates.iter().any(|c|
            p.farm_players.iter().any(|f| f.id == c.player_id && is_pit(&f.position)));
        // 이미 투수가 올라가고 있으면 그걸로 족하다
        if !has_pit_candidate {
            let batters_now = p.active_players.iter().filter(|a| !is_pit(&a.position)).count();
            let farm_pit = p.farm_players.iter().filter(|f| is_pit(&f.position)).count();
            let farm_floor = rules.farm_min_pitchers.unwrap_or(crate::tuning::FARM_MIN_PITCHERS);
            // ⚠ 야수 하한 아래로는 안 내린다 — 이번엔 타순이 무너진다.
            // 2군 투수 하한도 본다 — 2군도 경기를 한다.
            if batters_now > crate::tuning::FIRST_TEAM_MIN_BATTERS && farm_pit > farm_floor {
                // 육성선수는 여기서도 뺀다 — 하한이 급해도 등록 자체가 안 된다.
                // `farm_pit` 정원 계산에는 위에서 그대로 셌다
                let up = p.farm_players.iter()
                    .filter(|f| f.registrable && is_pit(&f.position))
                    .max_by(|a, b| rated(a, &rules).partial_cmp(&rated(b, &rules)).unwrap());
                let down = p.active_players.iter()
                    .filter(|a| !a.is_foreign && !is_pit(&a.position) && count_at(&a.position) >= 2)
                    .min_by(|a, b| rated(a, &rules).partial_cmp(&rated(b, &rules)).unwrap());
                if let (Some(up), Some(down)) = (up, down) {
                    candidates.push(CallupCandidate {
                        player_id: up.id.clone(),
                        replaces_player_id: down.id.clone(),
                        // 자리 공백(+60)보다 낮다 — 로테이션이 얇아도 경기는 성립한다
                        priority_score: 40.0,
                        reason: "pitcher_short".into(),
                    });
                }
            }
        }
    }

    // ── 야수 총원 하한 — `pitcher_short`의 짝 ──────────────────────────
    //
    // ⚠ **위 판정에 끼워 넣지 않는다.** 투수 쪽에서 그렇게 했다가 하한 미달인
    // 모든 팀에서 부진·부상 교체가 사라졌다(회귀 4건). 하한은 최후 수단이다.
    //
    // ⚠ **투수 하한 아래로는 안 내린다** — 야수를 채우겠다고 내리면 이번엔
    // 등판이 무너진다. 2군 야수 하한도 본다(2군도 경기를 한다).
    if batter_short {
        let has_bat_candidate = candidates.iter().any(|c|
            p.farm_players.iter().any(|f| f.id == c.player_id && !is_pit(&f.position)));
        if !has_bat_candidate {
            let farm_bat = p.farm_players.iter().filter(|f| !is_pit(&f.position)).count();
            let farm_floor = rules.farm_min_batters.unwrap_or(crate::tuning::FARM_MIN_BATTERS);
            if pitchers_now > crate::tuning::FIRST_TEAM_MIN_PITCHERS && farm_bat > farm_floor {
                // 육성선수는 뺀다 — 하한이 급해도 등록 자체가 안 된다
                let up = p.farm_players.iter()
                    .filter(|f| f.registrable && !is_pit(&f.position))
                    .max_by(|a, b| rated(a, &rules).partial_cmp(&rated(b, &rules)).unwrap());
                let down = p.active_players.iter()
                    .filter(|a| !a.is_foreign && is_pit(&a.position) && count_at(&a.position) >= 2)
                    .min_by(|a, b| rated(a, &rules).partial_cmp(&rated(b, &rules)).unwrap());
                if let (Some(up), Some(down)) = (up, down) {
                    candidates.push(CallupCandidate {
                        player_id: up.id.clone(),
                        replaces_player_id: down.id.clone(),
                        // 투수 하한과 같은 급이다 — 둘 다 "경기는 되지만 여유가 없다"
                        priority_score: 40.0,
                        reason: "batter_short".into(),
                    });
                }
            }
        }
    }

    candidates.sort_by(|a, b| b.priority_score.partial_cmp(&a.priority_score).unwrap());
    EvalCallupResult { candidates }
}

// ── eval_calldown_candidates ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalCalldownParams {
    pub team_profile: ProTeamProfile,
    pub active_players: Vec<RosterPlayerRef>,
    pub current_roster_size: i32,
    pub max_roster_size: i32,
    #[serde(default)]
    pub promotion_rules: Option<PromotionRules>,
    /// 감독 `clutchDecision` 계수 — 콜업과 같은 축이다 (§7-5 F-1)
    #[serde(default)]
    pub callup_mod: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalldownCandidate {
    pub player_id: String,
    pub priority_score: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalCalldownResult {
    pub candidates: Vec<CalldownCandidate>,
}

pub fn eval_calldown_candidates(p: EvalCalldownParams) -> EvalCalldownResult {
    let mut rules = p.promotion_rules.clone().unwrap_or_default();
    rules.form_weight *= p.callup_mod.unwrap_or(1.0).clamp(0.70, 1.30);
    let over = (p.current_roster_size - p.max_roster_size).max(0) as usize;
    // ⚠ **외국인은 2군에 안 내린다.** 보유 한도(1군 3명)가 2군 강등으로 새면
    // 그 팀은 한 자리를 놀리고, 2군에 외국인이 쌓여 한도 계산이 흐려진다.
    // 정원 초과는 내국인 안에서 푼다 — 외국인을 빼려면 방출(F-5)이다.
    // ⚠ **야수 하한을 안 보면 야수만 골라 내려간다.**
    //
    // 강등 점수는 능력치가 낮을수록 높다. 2군에서 갓 올라온 신인 야수가 대개
    // 능력치가 낮으니 우선 대상이 되고, 투수 콜업이 정원을 밀어올릴 때마다
    // 야수가 빠진다. 실측: 오프시즌 직후 야수 13명 → **시즌 종료 6명**
    // (투수는 30명). `fill_first_teams`는 오프시즌에만 도니 다음 해까지 그대로다.
    //
    // 야수가 하한 아래면 **투수 안에서만** 강등 대상을 고른다.
    //
    // ⚠ **하한을 한쪽만 걸면 반대쪽이 눌린다.** 야수 하한만 걸었더니 압력이
    // 전부 투수로 흘러 1군 투수가 9~11명 → **5명**이 됐다. 양쪽 다 건다.
    //
    // 둘 다 하한 이하면 **강등을 아예 멈추고 정원 초과를 감수한다.**
    // 그 상태의 로스터는 강등으로 풀 문제가 아니다 — 어느 쪽을 내려도
    // 라인업이나 등판이 무너진다. 오프시즌 `fill_first_teams`가 채워야 한다.
    let is_pitcher = |pos: &str| matches!(pos, "SP" | "RP" | "CP" | "P");
    let (pitchers_now, batters_now) = p.active_players.iter()
        .fold((0usize, 0usize), |(pit, bat), pl| {
            if is_pitcher(pl.position.as_str()) { (pit + 1, bat) } else { (pit, bat + 1) }
        });
    // ⚠ **부류만 보면 불펜만 빠진다.** 강등 점수는 능력치가 낮을수록 높은데
    // 불펜이 대체로 약해서 RP부터 내려가고 **선발만 쌓인다** —
    // 실측 팀당 선발 9~12명(로테이션은 5). 로테이션 밖 선발은 등판이 드물어
    // 표본이 얇아지고 ERA가 능력치를 반영하지 못한다.
    let starters_now = p.active_players.iter()
        .filter(|pl| pl.position == "SP").count();
    let starters_locked = starters_now <= crate::tuning::FIRST_TEAM_MIN_STARTERS;
    let batters_locked  = batters_now  <= crate::tuning::FIRST_TEAM_MIN_BATTERS;
    let pitchers_locked = pitchers_now <= crate::tuning::FIRST_TEAM_MIN_PITCHERS;
    if batters_locked && pitchers_locked {
        return EvalCalldownResult { candidates: Vec::new() };
    }

    let mut scored: Vec<(String, f64)> = p.active_players.iter()
        .filter(|pl| !pl.is_foreign)
        .filter(|pl| {
            let pit = is_pitcher(pl.position.as_str());
            (!batters_locked || pit) && (!pitchers_locked || !pit)
                // 선발이 하한이면 선발은 안 내린다 — 불펜·야수에서 고른다
                && !(starters_locked && pl.position == "SP")
        })
        .map(|pl| {
        // 성적을 반영한 값으로 본다 — 능력치만 보면 부진한 고연봉 베테랑이
        // 시즌 내내 1군을 지킨다
        let r = rated(pl, &rules);
        let mut score = 0.0;
        score += (60.0 - r).max(0.0);
        score += pl.salary as f64 / 100_000.0;
        if p.team_profile.win_now_pressure > 60.0 && r < 65.0 { score += 10.0; }
        if p.team_profile.development_focus > 60.0 && pl.age > 32 { score += 8.0; }
        (pl.id.clone(), score)
    }).collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    // **정원 초과분만 내린다.** 예전엔 `over.max(3)`이라 정원에 여유가 있어도
    // 매번 3명을 후보로 내놨고, 호출측이 그중 2명을 실제로 내렸다.
    // 콜업은 1:1 교체라 정원을 안 늘리는데 콜다운만 매달 2명씩 나가서
    // 한 시즌에 1군이 30명 → 16명으로 말랐다.
    let candidates = scored.into_iter().take(over)
        .map(|(id, s)| CalldownCandidate { player_id: id, priority_score: s })
        .collect();
    EvalCalldownResult { candidates }
}

// ── eval_release_priority ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalReleaseParams {
    pub team_profile: ProTeamProfile,
    pub player: RosterPlayerRef,
    pub recent_performance_rating: f64,
    pub roster_depth_at_position: i32,
    pub current_salary: i64,
    pub market_value: i64,
    /// 구단주와의 관계 (−100 ~ +100). 좋으면 한 번 더 기회를 준다.
    ///
    /// **주인공에게만 값이 있다** — 관계도는 주인공 기준 1:N이라
    /// NPC끼리의 구단주 관계는 존재하지 않는다 (Phase 6C 설계)
    #[serde(default)]
    pub owner_relation: f64,
    /// 관계 1점당 방출 점수 감산폭 (faRules.release.ownerRelationWeight)
    #[serde(default)]
    pub owner_relation_weight: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseEvalResult {
    pub release_score: f64,
    pub reason_flags: u32,
}

pub fn eval_release_priority(p: EvalReleaseParams) -> ReleaseEvalResult {
    let mut score = 0.0_f64;
    let mut flags = 0u32;
    let profile = &p.team_profile;

    let perf_deficit = 50.0 - p.recent_performance_rating;
    if perf_deficit > 0.0 { score += perf_deficit * 0.8; flags |= 1; }

    let overpay = p.current_salary as f64 / p.market_value.max(1) as f64;
    if overpay > 1.5 { score += 20.0; flags |= 2; }
    if overpay > 2.0 { score += 30.0; }

    if p.roster_depth_at_position >= 4 { score += 15.0; flags |= 4; }

    if p.player.age >= 35 { score += (p.player.age - 35) as f64 * 3.0; flags |= 8; }

    if profile.discipline > 70.0 {
        if let Some(pers) = &p.player.personality {
            if pers.professionalism < 35.0 { score += 25.0; flags |= 16; }
        }
    }
    if profile.stability > 70.0 && p.player.age >= 30 { score -= 10.0; }
    if profile.win_now_pressure > 80.0 { score *= 1.3; }

    // 구단주 인내심 — 관계가 좋으면 한 번 더 기회를 준다 (Phase 7-4, 6C 이월).
    // 나쁘면 반대로 밀어낸다. **주인공에게만 값이 들어온다**
    if p.owner_relation_weight != 0.0 {
        score -= p.owner_relation * p.owner_relation_weight;
        if p.owner_relation != 0.0 { flags |= 32; }
    }

    ReleaseEvalResult { release_score: score.max(0.0), reason_flags: flags }
}

// ── eval_fa_bid ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalFaBidParams {
    /// 씨앗. **0이면 예전 그대로 `thread_rng`다.**
    ///
    /// 🔴 이 넷(FA 입찰·FA 결정·트레이드 응답·오퍼 생성)이 `thread_rng`이라
    /// 같은 세이브·같은 씨앗도 실행마다 결과가 달랐다. 오프시즌을 결정적으로
    /// 바꾼 뒤에도 test:foreign 교체율이 5.0·6.0·4.7로 갈렸다 — 남은 건
    /// 여기였다. 계측을 한 번 돌려선 전후를 비교할 수 없다.
    #[serde(default)]
    pub seed: u32,
    pub team_profile: ProTeamProfile,
    pub fa_player: FaPlayerRef,
    pub roster_needs: Vec<String>,
    pub salary_cap: i64,
    pub current_payroll: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaBidResult {
    pub interest_level: f64,
    pub bid_salary: i64,
    pub bid_years: i32,
    pub signing_bonus: i64,
    pub team_option_years: i32,
    pub no_trade_clause: bool,
}

pub fn eval_fa_bid(p: EvalFaBidParams) -> FaBidResult {
    let profile = &p.team_profile;
    let player = &p.fa_player;
    let mut interest = 50.0_f64;
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };

    if p.roster_needs.contains(&player.position) { interest += 30.0; }
    if player.ovr >= 75.0 { interest += 15.0; }

    if profile.stability > 60.0 && player.age >= 28 { interest += 10.0; }
    if profile.stability < 40.0 && player.age <= 24 { interest += 10.0; }
    if profile.stability > 60.0 && player.age < 24 { interest -= 15.0; }
    if profile.stability < 40.0 && player.age > 32 { interest -= 20.0; }

    let flex = (p.salary_cap - p.current_payroll) as f64 / p.salary_cap as f64;
    if player.demand_salary as f64 > flex * p.salary_cap as f64 * 0.35 { interest -= 25.0; }

    if let Some(pers) = &player.personality {
        let is_foreign = player.current_league != "LEAGUE_KBL";
        if is_foreign && pers.overseas_ambition < 30.0 { interest -= 30.0; }
    }

    let scouting_noise = (100.0 - profile.scouting_quality) / 100.0 * 0.25;
    let noise = (rng.gen::<f64>() * 2.0 - 1.0) * scouting_noise;
    let win_mult = 1.0 + (profile.win_now_pressure - 50.0) / 100.0 * 0.3;
    let raw_bid = (player.market_value as f64 * (1.0 + noise) * win_mult) as i64;
    let bid_salary = raw_bid.min((flex * p.salary_cap as f64 * 0.35) as i64).max(1500);

    let bid_years = if profile.stability > 65.0 { player.demand_years.min(4) }
                    else if profile.stability < 35.0 { 1_i32.max(player.demand_years - 1) }
                    else { player.demand_years };
    let signing_bonus = (bid_salary as f64 * (0.08 + profile.market_appeal / 100.0 * 0.12)) as i64;
    let no_trade = profile.prestige > 60.0 && profile.stability > 60.0
                   && player.age >= 30 && player.ovr >= 70.0;
    let team_option = if profile.win_now_pressure < 40.0 && rng.gen::<f64>() < 0.35 { 1 } else { 0 };

    FaBidResult {
        interest_level: interest.clamp(0.0, 100.0),
        bid_salary,
        bid_years,
        signing_bonus,
        team_option_years: team_option,
        no_trade_clause: no_trade,
    }
}

// ── eval_renewal_offer / eval_new_contract ───────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalContractParams {
    pub team_profile: ProTeamProfile,
    pub player: RosterPlayerRef,
    pub league_id: String,
    pub market_value: i64,
    pub is_renewal: bool,
}

fn base_contract_offer(p: &EvalContractParams) -> ContractOfferResult {
    let profile = &p.team_profile;
    let budget_mult = match profile.owner_spending_willingness as i32 / 25 {
        3.. => 1.10_f64,
        2   => 1.0,
        1   => 0.92,
        _   => 0.85,
    };
    let win_mult = 1.0 + (profile.win_now_pressure - 50.0) / 200.0;
    let offer_salary = ((p.market_value as f64) * budget_mult * win_mult) as i64;

    let base_years = if p.player.ovr >= 75.0 { 3 } else if p.player.ovr >= 65.0 { 2 } else { 1 };
    let offer_years = {
        let mut y = base_years;
        if profile.stability > 65.0 { y += 1; }
        if profile.development_focus > 65.0 && p.player.age <= 24 { y += 1; }
        if profile.win_now_pressure > 70.0 { y = y.max(3); }
        y.min(5)
    };
    let signing_bonus = (offer_salary as f64 * (0.08 + profile.market_appeal / 100.0 * 0.12)) as i64;
    let no_trade = profile.prestige > 60.0 && profile.stability > 60.0
                   && p.player.age >= 30 && p.player.ovr >= 70.0;
    ContractOfferResult {
        offer_salary,
        offer_years,
        signing_bonus,
        team_option_years: 0,
        player_option_years: 0,
        no_trade_clause: no_trade,
    }
}

pub fn eval_renewal_offer(p: EvalContractParams) -> ContractOfferResult { base_contract_offer(&p) }
pub fn eval_new_contract(p: EvalContractParams) -> ContractOfferResult  { base_contract_offer(&p) }

// ── eval_retirement_suggestion ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalRetirementParams {
    pub team_profile: ProTeamProfile,
    pub player: RosterPlayerRef,
    pub ovr_trend: f64,
    pub prospect_ovr_at_position: f64,
    pub current_salary: i64,
    pub market_value: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementSuggestionResult {
    pub suggest: bool,
    pub urgency: f64,
}

pub fn eval_retirement_suggestion(p: EvalRetirementParams) -> RetirementSuggestionResult {
    let profile = &p.team_profile;
    let mut score = 0.0_f64;

    if p.player.age >= 38 { score += 40.0; }
    else if p.player.age >= 35 { score += (p.player.age - 35) as f64 * 8.0; }

    if p.ovr_trend < -3.0 { score += 20.0; }
    else if p.ovr_trend < -1.5 { score += 10.0; }

    let overpay = p.current_salary as f64 / p.market_value.max(1) as f64;
    if overpay > 1.5 { score += 15.0; }

    if p.prospect_ovr_at_position >= p.player.ovr { score += 10.0; }

    if profile.discipline > 70.0 { score += 8.0; }
    if profile.stability > 70.0 && p.player.fame > 30.0 { score -= 10.0; }

    RetirementSuggestionResult { suggest: score >= 40.0, urgency: (score / 100.0).min(1.0) }
}

// ── generate_trade_proposals ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTradeProposalsParams {
    pub teams: Vec<TeamWithRoster>,
    pub all_players: Vec<TradeAsset>,
    pub season_standing: std::collections::HashMap<String, i32>,
    pub total_teams: i32,
    pub max_proposals: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeProposal {
    pub proposing_team_id: String,
    pub receiving_team_id: String,
    pub offering_ids: Vec<String>,
    pub requesting_ids: Vec<String>,
    pub cash: i64,
    pub mutual_benefit_score: f64,
    pub reason: String,  // "position_surplus"|"injury_cover"|"seller_mode"|"buyer_mode"|"expiring_contract"|"player_ambition"
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTradeProposalsResult {
    pub proposals: Vec<TradeProposal>,
}

pub fn generate_trade_proposals(p: GenerateTradeProposalsParams) -> GenerateTradeProposalsResult {
    let mut proposals = Vec::new();
    let n = p.teams.len();
    let positions = ["SP","RP","CP","C","1B","2B","3B","SS","LF","CF","RF","DH"];

    // 팀 모드 판단: 순위 기반 — 하위 30%=seller, 상위 30%+win_now>60=buyer
    let team_mode = |team: &TeamWithRoster| -> &str {
        let standing = p.season_standing.get(&team.team_id).copied().unwrap_or((n / 2) as i32);
        let rank_pct = standing as f64 / n as f64;
        if rank_pct > 0.70 { "seller" }
        else if rank_pct <= 0.30 && team.profile.win_now_pressure > 60.0 { "buyer" }
        else { "neutral" }
    };

    for i in 0..n {
        for j in (i + 1)..n {
            let ta = &p.teams[i];
            let tb = &p.teams[j];

            let get_players = |team: &TeamWithRoster| -> Vec<&TradeAsset> {
                let all_ids: Vec<&str> = team.active_roster.iter()
                    .chain(team.farm_roster.iter())
                    .map(|s| s.as_str()).collect();
                p.all_players.iter().filter(|pl| all_ids.contains(&pl.player_id.as_str())).collect()
            };

            let a_players = get_players(ta);
            let b_players = get_players(tb);

            let count_pos = |players: &Vec<&TradeAsset>, pos: &str| -> usize {
                players.iter().filter(|pl| pl.position == pos && !pl.is_prospect).count()
            };

            let mode_a = team_mode(ta);
            let mode_b = team_mode(tb);

            // ── 1. 계약 만료 선점 트레이드 (잔여 1년 이하) ─────────────────
            for expiring_id in &ta.expiring_contract_ids {
                if let Some(exp_player) = a_players.iter().find(|pl| &pl.player_id == expiring_id) {
                    // FA로 잃기 전에 유망주 교환
                    let mut return_candidates: Vec<&&TradeAsset> = b_players.iter()
                        .filter(|pl| pl.is_prospect && pl.ovr >= 55.0)
                        .collect();
                    return_candidates.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                    if let Some(prospect) = return_candidates.first() {
                        let score = exp_player.ovr * 0.8 + prospect.ovr * 0.6;
                        if score > 75.0 {
                            proposals.push(TradeProposal {
                                proposing_team_id: ta.team_id.clone(),
                                receiving_team_id: tb.team_id.clone(),
                                offering_ids: vec![exp_player.player_id.clone()],
                                requesting_ids: vec![prospect.player_id.clone()],
                                cash: 0,
                                mutual_benefit_score: score,
                                reason: "expiring_contract".into(),
                            });
                        }
                    }
                }
            }
            for expiring_id in &tb.expiring_contract_ids {
                if let Some(exp_player) = b_players.iter().find(|pl| &pl.player_id == expiring_id) {
                    let mut return_candidates: Vec<&&TradeAsset> = a_players.iter()
                        .filter(|pl| pl.is_prospect && pl.ovr >= 55.0)
                        .collect();
                    return_candidates.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                    if let Some(prospect) = return_candidates.first() {
                        let score = exp_player.ovr * 0.8 + prospect.ovr * 0.6;
                        if score > 75.0 {
                            proposals.push(TradeProposal {
                                proposing_team_id: tb.team_id.clone(),
                                receiving_team_id: ta.team_id.clone(),
                                offering_ids: vec![exp_player.player_id.clone()],
                                requesting_ids: vec![prospect.player_id.clone()],
                                cash: 0,
                                mutual_benefit_score: score,
                                reason: "expiring_contract".into(),
                            });
                        }
                    }
                }
            }

            // ── 2. 부상 긴급 보강 (injured_positions 포지션 요청) ───────────
            for inj_pos in &ta.injured_positions {
                let mut fillers: Vec<&&TradeAsset> = b_players.iter()
                    .filter(|pl| &pl.position == inj_pos && !pl.is_prospect && pl.ovr >= 58.0)
                    .collect();
                fillers.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                if let Some(filler) = fillers.first() {
                    let mut give_cands: Vec<&&TradeAsset> = a_players.iter()
                        .filter(|pl| !pl.is_prospect && pl.ovr >= 55.0 && &pl.position != inj_pos)
                        .collect();
                    give_cands.sort_by(|a, b| a.ovr.partial_cmp(&b.ovr).unwrap()); // 가장 약한 선수 제공
                    if let Some(give) = give_cands.first() {
                        let score = filler.ovr * 1.2 + give.ovr * 0.5 + 15.0; // 긴급도 가중
                        proposals.push(TradeProposal {
                            proposing_team_id: ta.team_id.clone(),
                            receiving_team_id: tb.team_id.clone(),
                            offering_ids: vec![give.player_id.clone()],
                            requesting_ids: vec![filler.player_id.clone()],
                            cash: 0,
                            mutual_benefit_score: score,
                            reason: "injury_cover".into(),
                        });
                    }
                }
            }
            for inj_pos in &tb.injured_positions {
                let mut fillers: Vec<&&TradeAsset> = a_players.iter()
                    .filter(|pl| &pl.position == inj_pos && !pl.is_prospect && pl.ovr >= 58.0)
                    .collect();
                fillers.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                if let Some(filler) = fillers.first() {
                    let mut give_cands: Vec<&&TradeAsset> = b_players.iter()
                        .filter(|pl| !pl.is_prospect && pl.ovr >= 55.0 && &pl.position != inj_pos)
                        .collect();
                    give_cands.sort_by(|a, b| a.ovr.partial_cmp(&b.ovr).unwrap());
                    if let Some(give) = give_cands.first() {
                        let score = filler.ovr * 1.2 + give.ovr * 0.5 + 15.0;
                        proposals.push(TradeProposal {
                            proposing_team_id: tb.team_id.clone(),
                            receiving_team_id: ta.team_id.clone(),
                            offering_ids: vec![give.player_id.clone()],
                            requesting_ids: vec![filler.player_id.clone()],
                            cash: 0,
                            mutual_benefit_score: score,
                            reason: "injury_cover".into(),
                        });
                    }
                }
            }

            // ── 3. 선수 야망 트레이드 (ambition 높음 + 팀 하위권) ───────────
            let standing_a = p.season_standing.get(&ta.team_id).copied().unwrap_or(1);
            let standing_b = p.season_standing.get(&tb.team_id).copied().unwrap_or(1);
            let bottom_pct_a = standing_a as f64 / p.total_teams as f64;
            let bottom_pct_b = standing_b as f64 / p.total_teams as f64;

            for pl in &a_players {
                if bottom_pct_a > 0.75 {
                    if let Some(pers) = &pl.personality {
                        if pers.ambition > 60.0 && pl.ovr >= 62.0 {
                            // 이 선수가 이적 요청 → 상대팀에 제안
                            let mut recv: Vec<&&TradeAsset> = b_players.iter()
                                .filter(|rp| rp.position == pl.position && rp.ovr >= pl.ovr - 8.0)
                                .collect();
                            recv.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                            if let Some(rp) = recv.first() {
                                let score = pl.ovr + rp.ovr * 0.7;
                                proposals.push(TradeProposal {
                                    proposing_team_id: ta.team_id.clone(),
                                    receiving_team_id: tb.team_id.clone(),
                                    offering_ids: vec![pl.player_id.clone()],
                                    requesting_ids: vec![rp.player_id.clone()],
                                    cash: 0,
                                    mutual_benefit_score: score,
                                    reason: "player_ambition".into(),
                                });
                            }
                        }
                    }
                }
            }
            for pl in &b_players {
                if bottom_pct_b > 0.75 {
                    if let Some(pers) = &pl.personality {
                        if pers.ambition > 60.0 && pl.ovr >= 62.0 {
                            let mut recv: Vec<&&TradeAsset> = a_players.iter()
                                .filter(|rp| rp.position == pl.position && rp.ovr >= pl.ovr - 8.0)
                                .collect();
                            recv.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                            if let Some(rp) = recv.first() {
                                let score = pl.ovr + rp.ovr * 0.7;
                                proposals.push(TradeProposal {
                                    proposing_team_id: tb.team_id.clone(),
                                    receiving_team_id: ta.team_id.clone(),
                                    offering_ids: vec![pl.player_id.clone()],
                                    requesting_ids: vec![rp.player_id.clone()],
                                    cash: 0,
                                    mutual_benefit_score: score,
                                    reason: "player_ambition".into(),
                                });
                            }
                        }
                    }
                }
            }

            // ── 4. 포지션 surplus/deficit 교환 (기존 로직 + 모드 적용) ──────
            for pos in &positions {
                let a_cnt = count_pos(&a_players, pos);
                let b_cnt = count_pos(&b_players, pos);

                let (surplus_team, deficit_team, surplus_players, deficit_players, s_mode) =
                    if a_cnt >= 3 && b_cnt <= 1 { (ta, tb, &a_players, &b_players, mode_a) }
                    else if b_cnt >= 3 && a_cnt <= 1 { (tb, ta, &b_players, &a_players, mode_b) }
                    else { continue; };

                let mut candidates: Vec<&&TradeAsset> = surplus_players.iter()
                    .filter(|pl| &pl.position == pos && !pl.is_prospect)
                    .collect();
                candidates.sort_by(|a, b| a.ovr.partial_cmp(&b.ovr).unwrap());

                if let Some(offer_player) = candidates.first() {
                    // seller 모드: 베테랑 → 유망주 교환 우선
                    if s_mode == "seller" {
                        let mut prospects: Vec<&&TradeAsset> = deficit_players.iter()
                            .filter(|pl| pl.is_prospect && pl.ovr >= 52.0)
                            .collect();
                        prospects.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                        let bundle: Vec<String> = prospects.iter().take(2)
                            .map(|pl| pl.player_id.clone()).collect();

                        if !bundle.is_empty() {
                            let bundle_val: f64 = prospects.iter().take(2)
                                .map(|pl| pl.ovr).sum::<f64>() * 0.55;
                            let veteran_val = offer_player.ovr;
                            if (veteran_val - bundle_val).abs() < 18.0 {
                                proposals.push(TradeProposal {
                                    proposing_team_id: surplus_team.team_id.clone(),
                                    receiving_team_id: deficit_team.team_id.clone(),
                                    offering_ids: vec![offer_player.player_id.clone()],
                                    requesting_ids: bundle,
                                    cash: 0,
                                    mutual_benefit_score: (veteran_val + bundle_val) / 2.0,
                                    reason: "seller_mode".into(),
                                });
                            }
                        }
                    }

                    // buyer 모드: 즉시전력 요구 (surplus 팀이 buyer이면 상대 베테랑 요청)
                    if s_mode == "buyer" {
                        let mut recv_cands: Vec<&&TradeAsset> = deficit_players.iter()
                            .filter(|pl| !pl.is_prospect && pl.ovr >= 65.0 && pl.age <= 33)
                            .collect();
                        recv_cands.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                        if let Some(recv) = recv_cands.first() {
                            let score = offer_player.ovr * 0.6 + recv.ovr;
                            if score > 90.0 {
                                proposals.push(TradeProposal {
                                    proposing_team_id: surplus_team.team_id.clone(),
                                    receiving_team_id: deficit_team.team_id.clone(),
                                    offering_ids: vec![offer_player.player_id.clone()],
                                    requesting_ids: vec![recv.player_id.clone()],
                                    cash: 0,
                                    mutual_benefit_score: score,
                                    reason: "buyer_mode".into(),
                                });
                            }
                        }
                    }

                    // neutral: 기존 포지션 surplus/deficit 상호 교환
                    let surplus_deficit_pos = positions.iter().find(|&&p2| {
                        count_pos(surplus_players, p2) <= 1
                            && count_pos(deficit_players, p2) >= 3
                    });

                    if let Some(req_pos) = surplus_deficit_pos {
                        let mut req_candidates: Vec<&&TradeAsset> = deficit_players.iter()
                            .filter(|pl| &pl.position == req_pos && !pl.is_prospect)
                            .collect();
                        req_candidates.sort_by(|a, b| a.ovr.partial_cmp(&b.ovr).unwrap());

                        if let Some(req_player) = req_candidates.first() {
                            let benefit_a = offer_player.ovr * 0.5 + req_player.ovr;
                            let benefit_b = req_player.ovr * 0.5 + offer_player.ovr;
                            let mutual = (benefit_a + benefit_b) / 2.0;

                            if mutual > 60.0 {
                                proposals.push(TradeProposal {
                                    proposing_team_id: surplus_team.team_id.clone(),
                                    receiving_team_id: deficit_team.team_id.clone(),
                                    offering_ids: vec![offer_player.player_id.clone()],
                                    requesting_ids: vec![req_player.player_id.clone()],
                                    cash: 0,
                                    mutual_benefit_score: mutual,
                                    reason: "position_surplus".into(),
                                });
                            }
                        }
                    }

                    // 기존 유망주 번들 교환 (win_now_pressure 낮은 팀)
                    if surplus_team.profile.win_now_pressure < 40.0 && s_mode != "buyer" {
                        let mut prospects: Vec<&&TradeAsset> = deficit_players.iter()
                            .filter(|pl| pl.is_prospect && pl.ovr >= 55.0)
                            .collect();
                        prospects.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap());
                        let bundle: Vec<String> = prospects.iter().take(2)
                            .map(|pl| pl.player_id.clone()).collect();

                        if bundle.len() >= 2 {
                            let bundle_val: f64 = prospects.iter().take(2)
                                .map(|pl| pl.ovr).sum::<f64>() * 0.6;
                            let veteran_val = offer_player.ovr;
                            if (veteran_val - bundle_val).abs() < 15.0 {
                                proposals.push(TradeProposal {
                                    proposing_team_id: surplus_team.team_id.clone(),
                                    receiving_team_id: deficit_team.team_id.clone(),
                                    offering_ids: vec![offer_player.player_id.clone()],
                                    requesting_ids: bundle,
                                    cash: 0,
                                    mutual_benefit_score: (veteran_val + bundle_val) / 2.0,
                                    reason: "position_surplus".into(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // ── 보직 하한 검사 ────────────────────────────────────────────────────
    //
    // ⚠ **트레이드가 투/야 배분을 안 봤다.** 네 유형이 전부 부류를 넘나든다:
    // 계약만료는 포지션 무관 유망주와 바꾸고, 부상보강은 **명시적으로 다른
    // 포지션**(`pl.position != inj_pos`)을 내주며, surplus/deficit도 마찬가지다.
    // 투수 수요가 야수보다 크니(로스터의 45%가 투수고 부상도 잦다) 야수가
    // 한 방향으로 새어 나간다 — 실측 KBL 1군 야수가 오프시즌 13명에서
    // **시즌 종료 8명**(타순 한 바퀴도 안 된다)까지 빠졌다.
    //
    // **개별 생성 지점이 아니라 여기서 한 번에 거른다.** 네 군데에 각각 걸면
    // 다섯 번째 유형이 생길 때 또 빠진다 — 이 프로젝트에서 반복된 형태다.
    let is_pit = |pos: &str| matches!(pos, "SP" | "RP" | "CP" | "P");
    let asset_of = |id: &str| p.all_players.iter().find(|pl| pl.player_id == id);
    let team_of = |tid: &str| p.teams.iter().find(|t| t.team_id == tid);

    // 이 팀이 give를 내주고 recv를 받으면 1군 보직 하한이 깨지는가.
    // **1군만 센다** — 하한은 1군 로스터의 규칙이고, 2군은 강등·승격으로 푼다.
    let breaks_floor = |tid: &str, give: &[String], recv: &[String]| -> bool {
        let Some(team) = team_of(tid) else { return false };
        let active: std::collections::HashSet<&str> =
            team.active_roster.iter().map(|s| s.as_str()).collect();
        let (mut pit, mut bat) = (0i64, 0i64);
        for pl in &p.all_players {
            if !active.contains(pl.player_id.as_str()) { continue; }
            if is_pit(&pl.position) { pit += 1 } else { bat += 1 }
        }
        let mut delta = |ids: &[String], sign: i64| {
            for id in ids {
                // 2군 선수의 이동은 1군 구성을 안 바꾼다
                if !active.contains(id.as_str()) && sign < 0 { continue; }
                let Some(a) = asset_of(id) else { continue };
                if is_pit(&a.position) { pit += sign } else { bat += sign }
            }
        };
        delta(give, -1);
        delta(recv, 1);
        pit < crate::tuning::FIRST_TEAM_MIN_PITCHERS as i64
            || bat < crate::tuning::FIRST_TEAM_MIN_BATTERS as i64
    };

    // ⚠ **유일한 포수는 안 내준다.** 부류 하한(투/야)만 보면 포수 1명인 팀이
    // 그 포수를 내주는 걸 못 막는다 — 야수 총원은 그대로니까. 그런데 포수는
    // 전문 요원이라 0명이면 경기가 성립하지 않고, 메워주는 `fix_position_gaps`는
    // **오프시즌에만 돈다.** 시즌 중에 비면 다음 해까지 그대로다.
    // 실측: 리그마다 1~2팀이 포수 0명이었다.
    //
    // 다른 7포지션엔 안 건다. 수비가 `fielding` 단일 스탯이라 배치가 경기 결과에
    // 안 들어가고, 전 포지션에 걸면 트레이드가 말라 리그가 정지한다.
    let last_catcher_out = |tid: &str, give: &[String], recv: &[String]| -> bool {
        let Some(team) = team_of(tid) else { return false };
        let gives_c = give.iter().any(|id| asset_of(id).is_some_and(|a| a.position == "C"));
        if !gives_c { return false; }
        let gets_c = recv.iter().any(|id| asset_of(id).is_some_and(|a| a.position == "C"));
        if gets_c { return false; }
        let have = team.active_roster.iter()
            .filter(|id| asset_of(id).is_some_and(|a| a.position == "C"))
            .count();
        have <= 1
    };

    proposals.retain(|pr| {
        !breaks_floor(&pr.proposing_team_id, &pr.offering_ids, &pr.requesting_ids)
            && !breaks_floor(&pr.receiving_team_id, &pr.requesting_ids, &pr.offering_ids)
            && !last_catcher_out(&pr.proposing_team_id, &pr.offering_ids, &pr.requesting_ids)
            && !last_catcher_out(&pr.receiving_team_id, &pr.requesting_ids, &pr.offering_ids)
    });

    proposals.sort_by(|a, b| b.mutual_benefit_score.partial_cmp(&a.mutual_benefit_score).unwrap());
    proposals.truncate(p.max_proposals);
    GenerateTradeProposalsResult { proposals }
}

// ── eval_trade_value ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalTradeValueParams {
    pub team_profile: ProTeamProfile,
    pub giving: Vec<TradeAsset>,
    pub receiving: Vec<TradeAsset>,
    pub cash_amount: i64,
    pub roster_needs: Vec<String>,
    pub salary_cap: i64,
    pub current_payroll: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeEvalResult {
    pub net_value: f64,
    pub accept_probability: f64,
}

pub fn eval_trade_value(p: EvalTradeValueParams) -> TradeEvalResult {
    let profile = &p.team_profile;
    let flex = (p.salary_cap - p.current_payroll) as f64 / p.salary_cap as f64;

    let value_asset = |asset: &TradeAsset| -> f64 {
        let mut v = asset.ovr * 1.5;
        if profile.stability > 60.0 {
            if asset.age >= 27 && asset.age <= 31 { v *= 1.2; }
            if asset.age < 23 { v *= 0.85; }
        }
        if profile.development_focus > 60.0 {
            if asset.age <= 23 { v *= 1.3; }
            if asset.age > 32 { v *= 0.7; }
        }
        if profile.win_now_pressure > 70.0 {
            if asset.ovr >= 70.0 && asset.age >= 25 { v *= 1.25; }
            if asset.is_prospect { v *= 0.7; }
        }
        if p.roster_needs.contains(&asset.position) { v += 20.0; }
        let salary_burden = asset.salary as f64 / (flex * p.salary_cap as f64).max(1.0) / 0.3;
        v -= salary_burden * 5.0;
        v
    };

    let give_val: f64 = p.giving.iter().map(value_asset).sum::<f64>()
        - p.cash_amount as f64 / 100_000.0;
    let recv_val: f64 = p.receiving.iter().map(value_asset).sum::<f64>()
        + p.cash_amount as f64 / 100_000.0;
    let net_value = recv_val - give_val;
    let accept_probability = (0.5 + net_value / 100.0).clamp(0.05, 0.95);
    TradeEvalResult { net_value, accept_probability }
}

// ── eval_medical_test ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalTestParams {
    pub player_position: String,
    pub player_age: i32,
    pub injury_severity: Option<String>,  // null/"light"/"moderate"/"severe"/"surgery"
    pub injury_weeks_left: i32,
    pub career_injury_count: i32,
    pub has_steroid_history: bool,
    pub receiving_team_medical_quality: f64,  // 0~100
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalTestResult {
    pub pass: bool,
    pub concern_level: f64,           // 0~1
    pub rejection_probability: f64,
    pub rejection_reason: Option<String>,
    // "active_surgery"|"active_severe"|"active_moderate"|"injury_history"|"age_risk"|"steroid_history"
}

pub fn eval_medical_test(p: MedicalTestParams) -> MedicalTestResult {
    let mut concern = 0.0_f64;
    let mut reason: Option<String> = None;

    // 현재 부상 심각도
    match p.injury_severity.as_deref() {
        Some("surgery")  => { concern += 0.85; reason = Some("active_surgery".into()); }
        Some("severe")   => { concern += 0.60; reason = Some("active_severe".into()); }
        Some("moderate") => { concern += 0.30; reason = Some("active_moderate".into()); }
        Some("light")    => { concern += 0.08; }
        _                => {}
    }

    // 회복 기간 가중 (장기 이탈일수록 우려 상승)
    if p.injury_weeks_left > 20 { concern += 0.15; }
    else if p.injury_weeks_left > 8 { concern += 0.08; }

    // 부상 이력
    if p.career_injury_count >= 4 {
        concern += (p.career_injury_count - 3) as f64 * 0.08;
        if reason.is_none() { reason = Some("injury_history".into()); }
    } else if p.career_injury_count >= 2 {
        concern += p.career_injury_count as f64 * 0.04;
    }

    // 나이 + 이력 복합 위험
    if p.player_age >= 30 && p.career_injury_count >= 2 {
        concern += 0.08;
        if reason.is_none() { reason = Some("age_risk".into()); }
    }

    // 스테로이드 이력 (우선 덮어씀)
    if p.has_steroid_history {
        concern += 0.25;
        reason = Some("steroid_history".into());
    }

    // 팀 메디컬 품질 보정
    // medical_quality 100 → 1.3배 (엄격), 50 → 1.0배, 20 → 0.7배
    let quality_factor = 0.7 + p.receiving_team_medical_quality * 0.006;
    let rejection_prob = (concern * quality_factor).clamp(0.0, 1.0);

    let mut rng = rand::thread_rng();
    let pass = rng.gen::<f64>() >= rejection_prob;

    MedicalTestResult {
        pass,
        concern_level: concern.clamp(0.0, 1.0),
        rejection_probability: rejection_prob,
        rejection_reason: if !pass { reason } else { None },
    }
}

// ── 테스트 ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// **실데이터를 읽는다** — 인라인 규칙으로 두면 게임과 달라져
    /// 테스트가 거짓 안심을 준다 (docs/design/roster.md §10)
    fn rules() -> PromotionRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        serde_json::from_value(v["promotionRules"].clone()).expect("promotionRules 파싱 실패")
    }

    fn pitcher(innings: f64, era: f64) -> RosterPerf {
        RosterPerf { games: 20, innings, era, whip: 1.30, ..Default::default() }
    }
    fn batter(pa: i32, ops: f64) -> RosterPerf {
        RosterPerf { games: 60, plate_appearances: pa, ops, ..Default::default() }
    }

    #[test]
    fn 기록이_없으면_성적_점수가_0이다() {
        // 그래야 판정이 능력치만 본다 — 안 뛴 선수를 성적으로 벌주면 안 된다
        let r = rules();
        assert_eq!(form_score(None, true, &r), 0.0);
        assert_eq!(form_score(Some(&RosterPerf::default()), true, &r), 0.0);
        assert_eq!(form_score(Some(&RosterPerf::default()), false, &r), 0.0);
    }

    #[test]
    fn 잘하면_양수_못하면_음수다() {
        let r = rules();
        let good = form_score(Some(&pitcher(r.pitcher_full_innings, r.pitcher_era_baseline / 2.0)), true, &r);
        let bad  = form_score(Some(&pitcher(r.pitcher_full_innings, r.pitcher_era_baseline * 2.0)), true, &r);
        assert!(good > 0.0, "좋은 성적이 {good}");
        assert!(bad < 0.0, "나쁜 성적이 {bad}");

        let hot  = form_score(Some(&batter(r.batter_full_pa as i32, r.batter_ops_baseline * 1.3)), false, &r);
        let cold = form_score(Some(&batter(r.batter_full_pa as i32, r.batter_ops_baseline * 0.7)), false, &r);
        assert!(hot > 0.0 && cold < 0.0, "{hot} / {cold}");
    }

    #[test]
    fn 표본이_적으면_성적이_덜_반영된다() {
        // 3이닝 던지고 0점대인 선수가 시즌 내내 던진 에이스를 밀어내면 안 된다
        let r = rules();
        let era = r.pitcher_era_baseline / 2.0;
        let full  = form_score(Some(&pitcher(r.pitcher_full_innings, era)), true, &r);
        let small = form_score(Some(&pitcher(r.pitcher_full_innings / 10.0, era)), true, &r);
        assert!(small < full, "표본 1/10인데 {small} vs {full}");
        assert!(small > 0.0);
    }

    #[test]
    fn 성적_점수는_폭을_안_넘는다() {
        let r = rules();
        let absurd = form_score(Some(&pitcher(200.0, 0.0)), true, &r);
        assert!(absurd <= r.form_span, "{absurd} > {}", r.form_span);
        let awful = form_score(Some(&pitcher(200.0, 99.0)), true, &r);
        assert!(awful >= -r.form_span, "{awful} < {}", -r.form_span);
    }

    #[test]
    fn 성적이_능력치를_뒤집되_완전히_지우지는_않는다() {
        // formWeight가 리그 OVR 폭보다 크면 능력치가 무의미해진다
        let r = rules();
        assert!(r.form_weight > 0.0, "성적을 아예 안 본다");
        assert!(r.form_weight * r.form_span < 15.0,
            "성적 최대 기여 {}점이면 능력치가 무의미해진다", r.form_weight * r.form_span);
    }

    #[test]
    fn 부진_기준이_폭_안에_있다() {
        let r = rules();
        assert!(r.slump_score < 0.0 && r.slump_score > -r.form_span,
            "slump_score {} 가 폭 밖이면 아무도(또는 전부) 부진이 된다", r.slump_score);
    }

    // ── 콜다운 보직 하한 ────────────────────────────────────────────────────
    //
    // ⚠ **이건 통계 감사로는 안 잡힌다.** 시즌 종료 시점의 집계만 보면
    // "야수 7명"이 강등 때문인지 콜업 편중 때문인지 구분이 안 된다.
    // 실제로 야수 하한을 넣고도 한 시즌을 더 돌린 뒤에야 투수가 5명까지
    // 밀린 걸 알았다. 판정 자체를 직접 찔러야 한다.

    fn roster(n_pit: usize, n_bat: usize) -> Vec<RosterPlayerRef> {
        let mk = |i: usize, pos: &str| RosterPlayerRef {
            id: format!("{pos}{i}"), position: pos.into(), age: 25,
            // 능력치를 흩어 놓는다 — 전원 동점이면 정렬이 순서에 기대게 된다
            ovr: 50.0 + (i % 10) as f64, salary: 30_000, remaining_years: 2,
            pro_service_years: 3, is_prospect: false, personality: None,
            fame: 0.0, perf: None, is_foreign: false, registrable: true,
        };
        (0..n_pit).map(|i| mk(i, "RP"))
            .chain((0..n_bat).map(|i| mk(i, "1B")))
            .collect()
    }
    fn calldown(n_pit: usize, n_bat: usize, over: i32) -> Vec<String> {
        let players = roster(n_pit, n_bat);
        let size = players.len() as i32;
        eval_calldown_candidates(EvalCalldownParams {
            team_profile: ProTeamProfile::default(),
            active_players: players,
            current_roster_size: size,
            max_roster_size: size - over,
            promotion_rules: Some(rules()),
            callup_mod: None,
        }).candidates.into_iter().map(|c| c.player_id).collect()
    }
    fn is_pit(id: &str) -> bool { id.starts_with("RP") }

    #[test]
    fn 야수가_하한이면_투수만_내린다() {
        let got = calldown(20, crate::tuning::FIRST_TEAM_MIN_BATTERS, 3);
        assert_eq!(got.len(), 3, "정원 초과분만큼은 나와야 한다: {got:?}");
        assert!(got.iter().all(|id| is_pit(id)), "야수가 섞였다: {got:?}");
    }

    #[test]
    fn 투수가_하한이면_야수만_내린다() {
        // 야수 하한만 걸었을 때 압력이 전부 투수로 흘러 1군 투수가 5명까지
        // 밀렸다. 반대 방향도 같은 보호를 받아야 한다.
        let got = calldown(crate::tuning::FIRST_TEAM_MIN_PITCHERS, 20, 3);
        assert_eq!(got.len(), 3, "{got:?}");
        assert!(got.iter().all(|id| !is_pit(id)), "투수가 섞였다: {got:?}");
    }

    #[test]
    fn 선발이_하한이면_선발을_안_내린다() {
        // ⚠ 콜다운은 부류(투/야)만 봤다. 강등 점수는 능력치가 낮을수록 높은데
        // **불펜이 대체로 약해서 RP부터 내려가고 선발만 쌓인다** —
        // 실측 팀당 선발 9~12명(로테이션은 5). 로테이션 밖 선발은 등판이
        // 드물어 표본이 얇아지고 **OVR–ERA 상관이 −0.63 → +0.12**까지 갔다.
        let mut roster: Vec<RosterPlayerRef> = Vec::new();
        for i in 0..crate::tuning::FIRST_TEAM_MIN_STARTERS {
            roster.push(ref_of(&format!("SP{i}"), "SP", 55.0));   // 선발이 제일 약해도
        }
        for i in 0..10 { roster.push(ref_of(&format!("RP{i}"), "RP", 80.0)); }
        for i in 0..20 { roster.push(ref_of(&format!("B{i}"), "1B", 80.0)); }
        let size = roster.len() as i32;
        let res = eval_calldown_candidates(EvalCalldownParams {
            team_profile: ProTeamProfile::default(),
            active_players: roster,
            current_roster_size: size, max_roster_size: size - 3,
            promotion_rules: Some(rules()), callup_mod: None,
        });
        assert!(res.candidates.iter().all(|c| !c.player_id.starts_with("SP")),
            "선발이 하한인데 내려갔다: {:?}",
            res.candidates.iter().map(|c| &c.player_id).collect::<Vec<_>>());
    }

    #[test]
    fn 양쪽_다_하한이면_강등을_멈춘다() {
        // 어느 쪽을 내려도 라인업이나 등판이 무너진다 — 정원 초과를 감수한다
        let got = calldown(
            crate::tuning::FIRST_TEAM_MIN_PITCHERS,
            crate::tuning::FIRST_TEAM_MIN_BATTERS, 5);
        assert!(got.is_empty(), "둘 다 하한인데 {got:?}");
    }

    #[test]
    fn 하한_위에서는_보직을_안_가린다() {
        let got = calldown(20, 20, 6);
        assert_eq!(got.len(), 6, "{got:?}");
    }

    // ── 공백 충원 콜업 ──────────────────────────────────────────────────────

    fn ref_of(id: &str, pos: &str, ovr: f64) -> RosterPlayerRef {
        RosterPlayerRef {
            id: id.into(), position: pos.into(), age: 26, ovr, salary: 30_000,
            remaining_years: 2, pro_service_years: 3, is_prospect: false,
            personality: None, fame: 0.0, perf: None, is_foreign: false,
            registrable: true,
        }
    }
    /// 하한 위에 있는 2군 로스터 — 포수 한 명과 여유 인원
    ///
    /// ⚠ **크기를 `tuning.rs` 상수로 잡으면 안 된다.** 2군 하한의 정본은
    /// `generation_rules.json`이고 tuning 값은 폴백일 뿐이다. 상수로 잡았더니
    /// 규칙 파일이 9/12로 올라간 순간 이 2군이 하한 미달이 되어 아무것도
    /// 안 올라갔고, **판정은 멀쩡한데 테스트 전제가 무너졌다.**
    fn farm(r: &PromotionRules) -> Vec<RosterPlayerRef> {
        let min_bat = r.farm_min_batters.unwrap_or(crate::tuning::FARM_MIN_BATTERS);
        let min_pit = r.farm_min_pitchers.unwrap_or(crate::tuning::FARM_MIN_PITCHERS);
        // 포수 1명 + 하한을 **넘기는** 야수/투수 (하한과 같으면 고갈 취급이다)
        let mut v = vec![ref_of("C_FARM", "C", 55.0)];
        for i in 0..min_bat  { v.push(ref_of(&format!("FB{i}"), "1B", 50.0)); }
        for i in 0..=min_pit { v.push(ref_of(&format!("FP{i}"), "RP", 50.0)); }
        v
    }

    #[test]
    fn 투수가_하한_아래면_야수를_내려_올린다() {
        // ⚠ **하한이 브레이크로만 쓰이고 액셀이 없었다.**
        // `FIRST_TEAM_MIN_PITCHERS`(12)가 세 군데에 있는데 전부 "이 아래로는
        // 내리지 마라"다. 하한 아래로 떨어진 팀을 **다시 올려주는 경로가 없어**
        // 실측에서 1군 투수가 KBL 8명 · ABL 6명까지 갔다.
        //
        // ⚠ 자리 공백(`position_gap`)으로는 절대 안 걸린다 — SP·RP에 하나씩만
        // 있어도 그 자리는 안 비기 때문이다.
        let r = rules();
        let mk = |id: &str, pos: &str, ovr: f64| RosterPlayerRef {
            id: id.into(), position: pos.into(), age: 26, ovr, salary: 30_000,
            remaining_years: 2, pro_service_years: 3, is_prospect: false,
            personality: None, fame: 0.0, perf: None, is_foreign: false,
            registrable: true,
        };
        // 투수 2명(하한 12 미달)인데 **자리는 안 비었다**. 야수는 넉넉하다
        let mut active = vec![mk("SP_A", "SP", 70.0), mk("RP_A", "RP", 66.0)];
        for i in 0..18 { active.push(mk(&format!("B{i}"), "1B", 50.0 + i as f64)); }

        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            farm_players: farm(&r),
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });

        let c = res.candidates.iter().find(|c| c.reason == "pitcher_short")
            .expect("투수가 하한 아래인데 아무도 안 올라온다");
        // ⚠ **투수를 내리면 순증이 0이다.** 반대 부류를 내려야 총원이 는다
        assert!(c.replaces_player_id.starts_with('B'),
                "야수를 내려야 투수가 는다: {}", c.replaces_player_id);
    }

    #[test]
    fn 육성선수는_등록_전엔_안_올라간다() {
        // KBO: 육성선수는 **입단 연도 5월 1일 이후**에만 1군 등록이 된다.
        //
        // ⚠ 하한 미달이라도 예외가 아니다. 급하다고 올려주면 육성선수와
        // 드래프트 지명자의 차이가 "연봉이 좀 낮다"만 남는다 — 그러면
        // 미지명자를 2군에 흘려보낸 순간 드래프트 가치가 사라진다.
        let r = rules();
        let mk = |id: &str, pos: &str, ovr: f64| RosterPlayerRef {
            id: id.into(), position: pos.into(), age: 26, ovr, salary: 30_000,
            remaining_years: 2, pro_service_years: 3, is_prospect: false,
            personality: None, fame: 0.0, perf: None, is_foreign: false,
            registrable: true,
        };
        let mut active = vec![mk("SP_A", "SP", 70.0), mk("RP_A", "RP", 66.0)];
        for i in 0..18 { active.push(mk(&format!("B{i}"), "1B", 50.0 + i as f64)); }

        // 2군 투수를 **전부** 미등록으로 돌린다. 정원 계산엔 그대로 세지만
        // 후보로는 아무도 못 나와야 한다
        let mut fm = farm(&r);
        for f in fm.iter_mut() { if f.position == "RP" { f.registrable = false; } }

        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            farm_players: fm,
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });

        assert!(res.candidates.iter().all(|c| !c.player_id.starts_with("FP")),
                "육성선수가 등록 전에 1군으로 올라갔다: {:?}",
                res.candidates.iter().map(|c| &c.player_id).collect::<Vec<_>>());
    }

    #[test]
    fn 야수_하한_아래로는_안_내린다() {
        // ⚠ 한쪽을 채우려다 반대가 깨지는 게 이 프로젝트에서 반복됐다.
        // 투수가 모자라도 야수가 하한이면 멈춘다 — 그 상태는 콜업으로 풀 문제가
        // 아니다(없는 사람을 만들어야 한다).
        let r = rules();
        let mk = |id: &str, pos: &str| RosterPlayerRef {
            id: id.into(), position: pos.into(), age: 26, ovr: 60.0, salary: 30_000,
            remaining_years: 2, pro_service_years: 3, is_prospect: false,
            personality: None, fame: 0.0, perf: None, is_foreign: false,
            registrable: true,
        };
        let mut active = vec![mk("SP_A", "SP"), mk("RP_A", "RP")];
        for i in 0..crate::tuning::FIRST_TEAM_MIN_BATTERS {
            active.push(mk(&format!("B{i}"), "1B"));
        }
        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            farm_players: farm(&r),
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });
        assert!(res.candidates.iter().all(|c| c.reason != "pitcher_short"),
                "야수 하한인데 야수를 내렸다");
    }

    #[test]
    fn 자리가_비면_같은_부류에서_내려서_메운다() {
        // ⚠ 콜업은 같은 포지션 1:1 교체다. 그래서 포수가 0명이 되면 2군 포수를
        // **올릴 방법이 없었다** — `fix_position_gaps`는 오프시즌에만 돈다.
        // 실측에서 리그마다 1~2팀이 포수 0명으로 시즌을 났다.
        let r = rules();
        let mk = |id: &str, pos: &str, ovr: f64| RosterPlayerRef {
            id: id.into(), position: pos.into(), age: 26, ovr, salary: 30_000,
            remaining_years: 2, pro_service_years: 3, is_prospect: false,
            personality: None, fame: 0.0, perf: None, is_foreign: false,
            registrable: true,
        };
        // 1군에 포수가 없다. 1루수는 셋이라 한 명 내릴 여유가 있다
        let active = vec![
            mk("1B_A", "1B", 70.0), mk("1B_B", "1B", 62.0), mk("1B_C", "1B", 60.0),
            mk("SS_A", "SS", 68.0), mk("SP_A", "SP", 72.0),
        ];
        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            // ⚠ **2군도 현실 크기로 넘긴다.** 공백 충원은 2군 하한을 보므로
            // 선수 한 명짜리 2군은 "고갈 상태"라 아무것도 안 올라간다
            farm_players: farm(&r),
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });
        let c = res.candidates.iter().find(|c| c.player_id == "C_FARM")
            .expect("포수 공백인데 2군 포수가 후보에 없다");
        assert_eq!(c.reason, "position_gap");
        // **능력치가 낮아도 올라와야 한다** — 포수 0명은 경기가 성립하지 않는다
        assert_eq!(c.replaces_player_id, "1B_C", "남는 자리의 최약체를 내려야 한다");
    }

    #[test]
    fn 공백을_메우려고_새_공백을_만들지_않는다() {
        let r = rules();
        let mk = |id: &str, pos: &str, ovr: f64| RosterPlayerRef {
            id: id.into(), position: pos.into(), age: 26, ovr, salary: 30_000,
            remaining_years: 2, pro_service_years: 3, is_prospect: false,
            personality: None, fame: 0.0, perf: None, is_foreign: false,
            registrable: true,
        };
        // 야수가 전부 1명씩 — 누구를 내려도 그 자리가 빈다
        let active = vec![mk("1B_A", "1B", 62.0), mk("SS_A", "SS", 60.0), mk("SP_A", "SP", 72.0)];
        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            farm_players: farm(&r),
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });
        assert!(res.candidates.is_empty(),
            "내릴 여유가 없는데 후보가 나왔다: {:?}",
            res.candidates.iter().map(|c| &c.replaces_player_id).collect::<Vec<_>>());
    }

    #[test]
    fn 공백_충원도_부류를_지킨다() {
        // 야수 공백을 메우겠다고 투수를 내리면 이번엔 등판이 무너진다
        let r = rules();
        let mk = |id: &str, pos: &str, ovr: f64| RosterPlayerRef {
            id: id.into(), position: pos.into(), age: 26, ovr, salary: 30_000,
            remaining_years: 2, pro_service_years: 3, is_prospect: false,
            personality: None, fame: 0.0, perf: None, is_foreign: false,
            registrable: true,
        };
        // 야수는 자리마다 1명뿐이고 투수만 남아돈다
        let active = vec![
            mk("1B_A", "1B", 62.0), mk("SS_A", "SS", 60.0),
            mk("RP_A", "RP", 70.0), mk("RP_B", "RP", 55.0), mk("RP_C", "RP", 54.0),
        ];
        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            farm_players: farm(&r),
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });
        assert!(res.candidates.is_empty(), "야수 공백을 투수로 메웠다: {:?}",
            res.candidates.iter().map(|c| &c.replaces_player_id).collect::<Vec<_>>());
    }

    #[test]
    fn 마지막_2군_포수는_안_올린다() {
        // ⚠ **2군도 경기를 한다.** 1군 쪽은 `count_at >= 2`로 그 자리 마지막
        // 한 명을 지키는데 2군 쪽엔 같은 보호가 없어서, 콜업이 2군의 마지막
        // 포수를 올려버렸다. `fix_position_gaps`는 오프시즌에만 도니 2군이
        // 포수 0명으로 한 해를 났다 — 실측 KBL 2군 2팀.
        let r = rules();
        // 1군에 포수가 **있다** — 공백이 아니니 굳이 2군을 비울 이유가 없다
        let mut active = vec![ref_of("C_A", "C", 58.0), ref_of("C_B", "C", 52.0)];
        for i in 0..12 { active.push(ref_of(&format!("B{i}"), "1B", 60.0)); }
        for i in 0..12 { active.push(ref_of(&format!("P{i}"), "RP", 60.0)); }
        // 2군 포수는 C_FARM 하나뿐이고 능력치가 1군 백업보다 높다 —
        // 보호가 없으면 성적/능력 점수로 반드시 올라온다
        let mut fp = farm(&r);
        fp[0] = ref_of("C_FARM", "C", 78.0);
        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            farm_players: fp,
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });
        assert!(res.candidates.iter().all(|c| c.player_id != "C_FARM"),
            "2군의 마지막 포수를 올렸다");
    }

    #[test]
    fn 포수_공백이면_마지막_2군_포수라도_올린다() {
        // 위 보호의 예외다. **1군 포수 0명이 2군 포수 0명보다 나쁘다** —
        // 주인공이 뛰는 경기라서다. 보호를 무조건 걸면 실측에서 고쳤던
        // "1군 포수 0명이 한 해 안 고쳐진다"가 되돌아온다.
        let r = rules();
        let mut active = vec![];
        for i in 0..13 { active.push(ref_of(&format!("B{i}"), "1B", 60.0)); }
        for i in 0..12 { active.push(ref_of(&format!("P{i}"), "RP", 60.0)); }
        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            farm_players: farm(&r),   // 포수는 C_FARM 하나뿐이다
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });
        let c = res.candidates.iter().find(|c| c.player_id == "C_FARM")
            .expect("1군 포수가 0명인데 2군 포수가 후보에 없다");
        assert_eq!(c.reason, "position_gap");
    }

    #[test]
    fn 공백을_메우겠다고_2군을_비우지_않는다() {
        // ⚠ 이 검사가 없어서 실측 2군 투수가 7명 → **0명**이 됐다.
        // 일반 콜업은 같은 포지션 1:1이라 2군 구성을 안 바꾸는데, 공백 충원만
        // 부류를 넘나든다 — 2군 투수를 올리고 1군 야수를 내려보낸다.
        let r = rules();
        // 1군에 CP가 없다. 2군 투수는 하한에 딱 걸려 있다
        let active = vec![
            ref_of("RP_A", "RP", 70.0), ref_of("RP_B", "RP", 60.0), ref_of("RP_C", "RP", 58.0),
            ref_of("1B_A", "1B", 62.0), ref_of("1B_B", "1B", 60.0),
        ];
        let mut thin = vec![ref_of("CP_FARM", "CP", 66.0)];
        for i in 1..crate::tuning::FARM_MIN_PITCHERS { thin.push(ref_of(&format!("FP{i}"), "RP", 50.0)); }
        assert_eq!(thin.len(), crate::tuning::FARM_MIN_PITCHERS, "전제: 2군 투수가 하한에 걸려 있다");

        let res = eval_callup_candidates(EvalCallupParams {
            team_profile: ProTeamProfile::default(),
            farm_players: thin,
            active_players: active,
            injured_player_ids: vec![],
            current_month: 5,
            promotion_rules: Some(r),
            callup_mod: None,
        });
        assert!(res.candidates.iter().all(|c| c.player_id != "CP_FARM"),
            "2군 투수가 하한인데 공백 충원으로 빼갔다");
    }

    // ── 트레이드 보직 하한 ──────────────────────────────────────────────────

    /// 부상 보강 트레이드를 유도하는 두 팀. A는 SP가 부상이고 야수는 하한이다 —
    /// 야수를 내주고 투수를 받으면 타순이 무너진다
    fn trade_setup(a_batters: usize) -> GenerateTradeProposalsParams {
        let mk = |id: &str, team: &str, pos: &str, ovr: f64| TradeAsset {
            player_id: id.into(), team_id: team.into(), position: pos.into(),
            age: 27, ovr, true_ovr: ovr, salary: 30_000, remaining_years: 3,
            is_prospect: false, personality: None, injury_severity: None,
            injury_weeks_left: 0, career_injury_count: 0, has_steroid_history: false,
        };
        let mut all = Vec::new();
        let mut a_ids = Vec::new();
        for i in 0..a_batters { let id = format!("AB{i}"); all.push(mk(&id, "A", "1B", 62.0)); a_ids.push(id); }
        for i in 0..14        { let id = format!("AP{i}"); all.push(mk(&id, "A", "RP", 62.0)); a_ids.push(id); }
        let mut b_ids = Vec::new();
        for i in 0..16 { let id = format!("BB{i}"); all.push(mk(&id, "B", "1B", 62.0)); b_ids.push(id); }
        for i in 0..14 { let id = format!("BP{i}"); all.push(mk(&id, "B", "SP", 70.0)); b_ids.push(id); }

        let team = |id: &str, roster: Vec<String>, inj: Vec<String>| TeamWithRoster {
            team_id: id.into(), league_id: "LEAGUE_KBL".into(),
            profile: ProTeamProfile::default(),
            active_roster: roster, farm_roster: vec![],
            salary_cap: 300_000, current_payroll: 0, win_pct: 0.5,
            injured_positions: inj, expiring_contract_ids: vec![],
        };
        GenerateTradeProposalsParams {
            teams: vec![team("A", a_ids, vec!["SP".into()]), team("B", b_ids, vec![])],
            all_players: all,
            season_standing: [("A".to_string(), 1), ("B".to_string(), 2)].into_iter().collect(),
            total_teams: 2, max_proposals: 20,
        }
    }

    #[test]
    fn 야수가_하한이면_야수를_내주는_트레이드가_안_나온다() {
        // ⚠ 실측: 트레이드가 보직을 안 봐서 KBL 1군 야수가 오프시즌 13명 →
        // **시즌 종료 8명**까지 빠졌다. 부상 보강은 명시적으로 다른 포지션을 내준다
        let p = trade_setup(crate::tuning::FIRST_TEAM_MIN_BATTERS);
        let pos_of: std::collections::HashMap<String, String> = p.all_players.iter()
            .map(|a| (a.player_id.clone(), a.position.clone())).collect();
        let bat = |ids: &[String]| ids.iter()
            .filter(|id| !matches!(pos_of[*id].as_str(), "SP" | "RP" | "CP" | "P")).count() as i64;
        let r = generate_trade_proposals(p);
        // 투수↔투수는 배분을 안 바꾸므로 막을 이유가 없다 — **순 증감**으로 본다
        for pr in &r.proposals {
            if pr.proposing_team_id != "A" { continue; }
            assert!(bat(&pr.requesting_ids) >= bat(&pr.offering_ids),
                "야수 하한인 A가 야수를 순감시키는 제안이 남았다: {:?} → {:?}",
                pr.offering_ids, pr.requesting_ids);
        }
    }

    #[test]
    fn 여유가_있으면_트레이드가_막히지_않는다() {
        // 하한이 트레이드 자체를 죽이면 리그가 정지한다 — 여유가 있을 땐 돌아야 한다
        let r = generate_trade_proposals(trade_setup(crate::tuning::FIRST_TEAM_MIN_BATTERS + 4));
        assert!(!r.proposals.is_empty(), "여유가 있는데 제안이 0건이다");
    }

    #[test]
    fn 하한_둘의_합이_정원_안에_들어간다() {
        // 합이 상한 이상이면 **정원이 찬 팀은 항상 "둘 다 하한"**이라
        // 강등이 영영 안 돌고 초과분이 안 풀린다.
        // 정원은 `generation_rules.json`이 정본이다 — 코드에 다시 적지 않는다.
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).unwrap();
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        let kbl = &v["rosterRules"]["LEAGUE_KBL"];
        let max = kbl["rosterMax"].as_u64().expect("rosterMax 없음") as usize;
        let size = kbl["rosterSize"].as_u64().expect("rosterSize 없음") as usize;
        let floors = crate::tuning::FIRST_TEAM_MIN_BATTERS + crate::tuning::FIRST_TEAM_MIN_PITCHERS;
        assert!(floors < max, "하한 합 {floors} 가 상한 {max} 이상이면 강등이 멈춘다");
        // 생성 시점 구성(30)도 넘으면 새 시즌이 시작부터 잠긴 상태가 된다
        assert!(floors < size, "하한 합 {floors} 가 생성 정원 {size} 이상이다");
    }
}
