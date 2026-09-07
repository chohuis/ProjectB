use serde::{Deserialize, Serialize};
use rand::Rng;

// ── Facility Efficiency ───────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacilityEffPayload {
    pub career_stage: String,
    pub team_tier: Option<String>,
    #[serde(default)]
    pub facility_investment: Option<f64>,
}

/// 주인공 시설 효율. `team_tier`는 TS `facilityTierOf(leagueId)`가 넘긴다 —
/// 예전엔 `TeamRef.tier`를 넘겼는데 국내 팀엔 그 필드가 없어 프로 1군도
/// 항상 0.95를 받고 있었다 (`facility_investment`도 없었다).
///
/// `facility_investment`는 구단주 능력치 계수(1.0 기준)다. 학생·군·독립은
/// 구단주가 없으므로 1.0이 들어온다.
pub fn calc_facility_eff(p: FacilityEffPayload) -> f64 {
    let base = match p.career_stage.as_str() {
        "highschool"  => 0.92,
        "university"  => 0.95,
        "military"    => 0.88,
        "independent" => 0.85,
        "pro" | "pro_kbl" | "pro_abl" | "pro_jbl" => {
            match p.team_tier.as_deref() {
                Some("1군") => 1.05,
                Some("2군") => 0.95,
                _           => 0.95,
            }
        }
        _ => 0.92,
    };
    base * p.facility_investment.unwrap_or(1.0).clamp(0.80, 1.25)
}

// ── Weekly Net Income (제거됨 — Phase 7-5 F-3) ────────────────
//
// `calc_weekly_net`이 여기 있었다. 무대별 수입·지출이 **Rust 상수 표**라
// 조정하려면 재컴파일이 필요했고, 규칙 파일과 정본이 둘로 갈렸다.
//
// 정본은 이제 `generation_rules.json financeRules.stages`이고
// 계산은 `finance::calc_weekly_finance`가 한다 — 세금·스폰서·구독까지 함께 본다.

// ── Injury Calculation ────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryPayload {
    /// 판정 씨앗. **0이면 예전 그대로 `thread_rng`다**(구 페이로드 호환).
    ///
    /// ⚠ 주인공 부상은 주마다 한 번이다 — 씨앗이 없으면 같은 세이브도
    ///   실행마다 다른 주에 다치고, 그 차이가 성적·진로로 번진다.
    #[serde(default)]
    pub seed: u32,
    pub fatigue: f64,
    pub consecutive_high_fatigue_weeks: u32,
    pub has_injury: bool,
    pub current_injury_type: Option<String>,
    pub current_severity: Option<String>,
    pub recovery_weeks_left: Option<u32>,
    pub player_type: Option<String>,
    pub age: u32,
    pub condition: f64,
    pub training_intensity: f64,
    pub consecutive_low_morale_weeks: u32,
    pub has_prior_injury_same_area: bool,
    pub prior_steroid_used: Option<bool>,
    /// 코치 `discipline` 계수 (1.0 = 중립). **1보다 크면 덜 다친다** —
    /// 발생 확률을 나눈다. 스태프 15종 배선(§7-5 F-1)
    #[serde(default)]
    pub injury_prevention: Option<f64>,
    /// 구단주 `facilityInvestment` 계수 (1.0 = 중립). 회복 주차를 줄인다.
    /// **발생 시점에만** 적용한다 — 틱다운에도 걸면 두 번 깎인다
    #[serde(default)]
    pub recovery_boost: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryUpdateOut {
    #[serde(rename = "type")]
    pub injury_type: String,   // 구체적 InjuryType ID
    pub severity: String,      // "light"|"moderate"|"severe"|"surgery"
    pub recovery_weeks_left: u32,
}

/// 부상 전조 (§7-5 F-2 / DESIGN §7.3).
///
/// 피로 임계를 넘은 **첫 주는 경고만** 내고 부상 판정을 건너뛴다. 그대로
/// 두 주째 넘기면 그때 판정한다. 플레이어가 손쓸 기회를 한 번 주는 장치다 —
/// 아무 예고 없이 시즌이 끝나면 "관리 실패"가 아니라 "재수 없음"이 된다.
///
/// **NPC는 경고가 없다** (DESIGN §7.3). 몇천 명에게 경고를 내면 로그가 그것만
/// 남고, NPC는 어차피 손쓸 주체가 없다.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryWarningOut {
    /// "fatigue" — 지금은 피로 하나뿐이다.
    /// 세분화하면 7-2 상시 콜업 트리거도 같이 넓혀야 한다
    pub kind: String,
    pub fatigue: f64,
    /// 다음 주도 이대로면 이 확률로 다친다
    pub risk: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryResult {
    pub injury_update: Option<InjuryUpdateOut>,
    pub just_occurred: bool,
    pub just_healed: bool,
    pub eff_mod: f64,
    pub new_consecutive_high_fatigue_weeks: u32,
    pub source: Option<String>,
    /// 이번 주 전조. 부상이 실제로 났으면 None (경고할 게 아니라 벌어진 일이다)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<InjuryWarningOut>,
}

fn pick_light_type(is_pitcher: bool, rng: &mut impl rand::Rng) -> &'static str {
    if is_pitcher {
        let r: f64 = rng.gen();
        if r < 0.40 { "ARM_FATIGUE" } else if r < 0.70 { "BLISTER" } else if r < 0.90 { "MUSCLE_TIGHTNESS" } else { "BACK_STIFFNESS" }
    } else {
        let r: f64 = rng.gen();
        if r < 0.30 { "MUSCLE_TIGHTNESS" } else if r < 0.60 { "BACK_STIFFNESS" } else if r < 0.90 { "ANKLE_SPRAIN_L" } else { "BLISTER" }
    }
}

fn pick_moderate_type(is_pitcher: bool, rng: &mut impl rand::Rng) -> &'static str {
    if is_pitcher {
        let r: f64 = rng.gen();
        if r < 0.40 { "ELBOW_INFLAM" } else if r < 0.80 { "SHOULDER_INFLAM" } else { "OBLIQUE_STRAIN" }
    } else {
        let r: f64 = rng.gen();
        if r < 0.40 { "HAMSTRING" } else if r < 0.70 { "ANKLE_SPRAIN_M" } else { "OBLIQUE_STRAIN" }
    }
}

fn pick_severe_type(is_pitcher: bool, rng: &mut impl rand::Rng) -> &'static str {
    if is_pitcher {
        let r: f64 = rng.gen();
        if r < 0.50 { "UCL_PARTIAL" } else if r < 0.90 { "ROTATOR_STRAIN" } else { "BACK_HERNIATION" }
    } else {
        let r: f64 = rng.gen();
        if r < 0.50 { "BACK_HERNIATION" } else if r < 0.80 { "UCL_PARTIAL" } else { "ROTATOR_STRAIN" }
    }
}

fn pick_surgery_type(rng: &mut impl rand::Rng) -> &'static str {
    let r: f64 = rng.gen();
    if r < 0.50 { "UCL_FULL" } else if r < 0.80 { "ROTATOR_FULL" } else { "SHOULDER_SURGERY" }
}

fn recovery_weeks_for(injury_type: &str, rng: &mut impl rand::Rng) -> u32 {
    match injury_type {
        "BLISTER"          => rng.gen_range(2..=3),
        "ARM_FATIGUE"      => rng.gen_range(2..=3),
        "MUSCLE_TIGHTNESS" => rng.gen_range(2..=3),
        "BACK_STIFFNESS"   => rng.gen_range(2..=3),
        "ANKLE_SPRAIN_L"   => rng.gen_range(2..=3),
        "ELBOW_INFLAM"     => rng.gen_range(4..=8),
        "SHOULDER_INFLAM"  => rng.gen_range(4..=8),
        "OBLIQUE_STRAIN"   => rng.gen_range(4..=8),
        "HAMSTRING"        => rng.gen_range(4..=8),
        "CONCUSSION"       => rng.gen_range(4..=6),
        "ANKLE_SPRAIN_M"   => rng.gen_range(4..=8),
        "UCL_PARTIAL"      => rng.gen_range(12..=20),
        "ROTATOR_STRAIN"   => rng.gen_range(12..=20),
        "BACK_HERNIATION"  => rng.gen_range(12..=20),
        "YIPS"             => rng.gen_range(10..=20),
        "UCL_FULL"         => rng.gen_range(60..=78),
        "ROTATOR_FULL"     => rng.gen_range(52..=65),
        "SHOULDER_SURGERY" => rng.gen_range(30..=40),
        _                  => 2,
    }
}

fn severity_of(injury_type: &str) -> &'static str {
    match injury_type {
        "BLISTER" | "ARM_FATIGUE" | "MUSCLE_TIGHTNESS" | "BACK_STIFFNESS" | "ANKLE_SPRAIN_L"
            => "light",
        "ELBOW_INFLAM" | "SHOULDER_INFLAM" | "OBLIQUE_STRAIN" | "HAMSTRING" | "CONCUSSION" | "ANKLE_SPRAIN_M"
            => "moderate",
        "UCL_PARTIAL" | "ROTATOR_STRAIN" | "BACK_HERNIATION" | "YIPS"
            => "severe",
        "UCL_FULL" | "ROTATOR_FULL" | "SHOULDER_SURGERY"
            => "surgery",
        _ => "light",
    }
}

fn eff_mod_for(severity: &str) -> f64 {
    match severity {
        "light"    => 0.70,
        "moderate" => 0.25,
        "severe"   => 0.10,
        "surgery"  => 0.00,
        _          => 1.0,
    }
}

/// 훈련 무리 조건 — 고강도인데 컨디션이 낮다. 부상 출처를 가르는 데도 쓴다
pub fn is_training_overload(p: &InjuryPayload) -> bool {
    p.training_intensity >= 0.8 && p.condition < 65.0
}

/// 이번 주 부상 발생 확률 — **주사위를 굴리기 전까지는 결정적이다.**
///
/// `calc_injury`가 이 값으로 굴리고, **훈련 화면 미리보기가 같은 함수를 부른다.**
/// 화면이 자기 식을 따로 두면 표시와 실제가 갈린다 — 이 프로젝트가 이미
/// 그걸로 당했다(피로 예상치가 엔진과 부호까지 반대였다).
///
/// 예전엔 같은 식이 **세 곳**에 있었다 — 여기, 전조 경고의 `next`, 그리고
/// 훈련 화면의 `(예상피로 − 60) × 0.8`.
pub fn injury_trigger_chance(p: &InjuryPayload, grace_week: bool) -> f64 {
    // 볼록 곡선: 80미만=0%, 80~85=5%, 85~90=15%, 90~95=35%, 95+=60%
    let fatigue_chance: f64 = if p.fatigue >= 95.0 { 0.60 }
        else if p.fatigue >= 90.0 { 0.35 }
        else if p.fatigue >= 85.0 { 0.15 }
        else if p.fatigue >= 80.0 { 0.05 }
        else { 0.0 };

    let mut training_chance = 0.0f64;
    if is_training_overload(p) {
        training_chance += 0.10;
        if p.condition < 60.0 && p.fatigue > 70.0 { training_chance += 0.10; }
    }

    // 유예 주에는 **피로 몫만** 뺀다. 훈련 무리는 다른 축이라 그대로 둔다 —
    // "쉬라고 경고했는데 고강도 훈련을 밀어붙였다"가 면죄부가 되면 안 된다
    let mut trigger_chance = if grace_week { training_chance }
                             else { fatigue_chance + training_chance };

    if p.has_prior_injury_same_area { trigger_chance *= 1.5; }
    if p.prior_steroid_used.unwrap_or(false) { trigger_chance *= 1.25; }

    let age_mult: f64 = if p.age >= 35 { 1.5 } else if p.age >= 32 { 1.3 } else { 1.0 };
    trigger_chance *= age_mult;
    // 관리 잘하는 코치진이면 덜 다친다
    trigger_chance /= p.injury_prevention.unwrap_or(1.0).clamp(0.80, 1.30);
    trigger_chance.min(0.80)
}

pub fn calc_injury(p: InjuryPayload) -> InjuryResult {
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    let is_pitcher = p.player_type.as_deref().unwrap_or("pitcher") != "batter";
    let is_high_fatigue = p.fatigue >= 80.0;
    let new_high_fatigue_weeks = if is_high_fatigue { p.consecutive_high_fatigue_weeks + 1 } else { 0 };

    let mut injury_update: Option<InjuryUpdateOut> = None;
    let mut just_occurred = false;
    let mut just_healed   = false;
    let mut source: Option<String> = None;
    let mut warning: Option<InjuryWarningOut> = None;

    // 임계를 넘은 **첫 주**. 이 주는 피로발 부상 판정을 건너뛰고 경고만 낸다
    let grace_week = is_high_fatigue && new_high_fatigue_weeks == 1;

    if !p.has_injury {
        // ── 심리 트리거 (YIPS) — 피로 트리거와 독립 ──────────────
        let yips_chance: f64 = if p.consecutive_low_morale_weeks >= 8 { 0.12 }
            else if p.consecutive_low_morale_weeks >= 5 { 0.03 }
            else { 0.0 };

        if yips_chance > 0.0 && is_pitcher && rng.gen::<f64>() < yips_chance {
            let weeks = recovery_weeks_for("YIPS", &mut rng);
            injury_update = Some(InjuryUpdateOut {
                injury_type: "YIPS".to_string(),
                severity:    "severe".to_string(),
                recovery_weeks_left: weeks,
            });
            just_occurred = true;
            source = Some("psychological".to_string());
        }

        // ── 피로 + 훈련 복합 트리거 ──────────────────────────────
        if !just_occurred {
            // ⚠ 확률식은 `injury_trigger_chance`에 있다 — **훈련 화면 미리보기가
            // 같은 함수를 쓴다.** 여기 인라인으로 두면 화면이 자기 식을 또 만든다.
            let trigger_chance = injury_trigger_chance(&p, grace_week);

            if trigger_chance > 0.0 && rng.gen::<f64>() < trigger_chance {
                let tier_roll: f64 = rng.gen();
                let high_age = p.age >= 35;

                let tier = if p.fatigue >= 90.0 {
                    if high_age {
                        if tier_roll < 0.10 { "surgery" } else if tier_roll < 0.35 { "severe" } else if tier_roll < 0.65 { "moderate" } else { "light" }
                    } else {
                        if tier_roll < 0.05 { "surgery" } else if tier_roll < 0.25 { "severe" } else if tier_roll < 0.60 { "moderate" } else { "light" }
                    }
                } else if p.fatigue >= 85.0 {
                    if high_age {
                        if tier_roll < 0.06 { "severe" } else if tier_roll < 0.40 { "moderate" } else { "light" }
                    } else {
                        if tier_roll < 0.03 { "severe" } else if tier_roll < 0.28 { "moderate" } else { "light" }
                    }
                } else {
                    // 80~85 또는 훈련 트리거만 발동
                    if tier_roll < 0.05 { "moderate" } else { "light" }
                };

                let injury_type = match tier {
                    "surgery" => pick_surgery_type(&mut rng),
                    "severe"  => pick_severe_type(is_pitcher, &mut rng),
                    "moderate" => {
                        if is_pitcher && p.age >= 32 {
                            let r: f64 = rng.gen();
                            if r < 0.50 { "SHOULDER_INFLAM" } else if r < 0.80 { "ELBOW_INFLAM" } else { "OBLIQUE_STRAIN" }
                        } else {
                            pick_moderate_type(is_pitcher, &mut rng)
                        }
                    }
                    _ => pick_light_type(is_pitcher, &mut rng),
                };

                let injury_src = if grace_week || (is_training_overload(&p) && p.fatigue < 80.0) { "training" } else { "fatigue" };
                let severity   = severity_of(injury_type);
                let raw_weeks  = recovery_weeks_for(injury_type, &mut rng);
                // 시설 좋은 구단이면 복귀가 빠르다. 최소 1주는 남긴다
                let boost      = p.recovery_boost.unwrap_or(1.0).clamp(0.80, 1.30);
                let weeks      = ((raw_weeks as f64) / boost).round().max(1.0) as u32;
                injury_update = Some(InjuryUpdateOut {
                    injury_type: injury_type.to_string(),
                    severity:    severity.to_string(),
                    recovery_weeks_left: weeks,
                });
                just_occurred = true;
                source = Some(injury_src.to_string());
            }

            // 유예 주인데 부상이 안 났으면 경고를 낸다.
            // risk = 다음 주도 이대로 갈 때의 실제 확률 — 예방·나이까지 반영해
            // 화면이 "위험합니다" 대신 숫자를 보여줄 수 있게 한다
            if grace_week && !just_occurred {
                // ⚠ 여기 같은 식이 **세 번째로** 복제돼 있었다. 유예 주가 아닐 때의
                // 확률이므로 `grace_week = false`로 같은 함수를 부르면 된다.
                let next = injury_trigger_chance(&p, false);
                warning = Some(InjuryWarningOut {
                    kind: "fatigue".to_string(),
                    fatigue: p.fatigue,
                    risk: (next * 1000.0).round() / 1000.0,
                });
            }
        }
    } else {
        // ── 회복 틱다운 ──────────────────────────────────────────
        let weeks_left = p.recovery_weeks_left.unwrap_or(1).saturating_sub(1);
        if weeks_left == 0 {
            just_healed = true;
        } else {
            let cur_type = p.current_injury_type.as_deref().unwrap_or("ARM_FATIGUE");
            let cur_sev  = p.current_severity.as_deref().unwrap_or_else(|| severity_of(cur_type));
            injury_update = Some(InjuryUpdateOut {
                injury_type: cur_type.to_string(),
                severity:    cur_sev.to_string(),
                recovery_weeks_left: weeks_left,
            });
        }
    }

    let eff_mod = if p.has_injury && !just_healed {
        let sev = injury_update.as_ref().map(|u| u.severity.as_str()).unwrap_or("light");
        eff_mod_for(sev)
    } else {
        1.0
    };
    let final_high_fatigue_weeks = if just_occurred { 0 } else { new_high_fatigue_weeks };

    InjuryResult {
        injury_update,
        just_occurred,
        just_healed,
        eff_mod,
        new_consecutive_high_fatigue_weeks: final_high_fatigue_weeks,
        source,
        warning,
    }
}

// ── NPC Injury Batch Calculation ──────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPlayerEntry {
    pub player_id: String,
    pub role: String,                             // "SP"|"RP"|"CP"|"batter"
    pub age: u32,
    pub consecutive_app: u32,
    pub has_prior_injury: bool,
    pub is_playing_through: bool,
    pub playing_through_severity: Option<String>, // "light"|"moderate"
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcInjuriesPayload {
    /// 씨앗. **0이면 예전 그대로 `thread_rng`다.**
    ///
    /// 이게 없으면 같은 세이브도 실행마다 다른 결과가 난다 — 계측을 한 번
    /// 돌려 전후를 비교할 수 없고 간헐 실패를 회귀와 구분할 수 없다.
    /// 씨앗 만드는 곳은 TS `utils/seedOf.ts` 하나다.
    #[serde(default)]
    pub seed: u32,
    pub players: Vec<NpcPlayerEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcInjuryOccurrence {
    pub player_id: String,
    pub injury_type: String,
    pub severity: String,
    pub recovery_weeks: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcInjuriesResult {
    pub occurred: Vec<NpcInjuryOccurrence>,
}

pub fn calc_npc_injuries(p: NpcInjuriesPayload) -> NpcInjuriesResult {
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    let mut occurred: Vec<NpcInjuryOccurrence> = Vec::new();

    for player in &p.players {
        let is_pitcher = player.role != "batter";

        let base: f64 = match player.role.as_str() {
            "SP"     => 0.03,
            "RP"     => 0.02,
            "CP"     => 0.025,
            _        => 0.015, // batter
        };

        let consec_bonus: f64 = match player.role.as_str() {
            "SP" => {
                if player.consecutive_app >= 5 { 0.04 }
                else if player.consecutive_app >= 3 { 0.02 }
                else { 0.0 }
            }
            "RP" | "CP" => {
                if player.consecutive_app >= 7 { 0.04 }
                else if player.consecutive_app >= 4 { 0.02 }
                else { 0.0 }
            }
            _ => {
                if player.consecutive_app >= 10 { 0.03 }
                else if player.consecutive_app >= 6 { 0.01 }
                else { 0.0 }
            }
        };

        let age_mult: f64 = if player.age >= 35 { 1.5 } else if player.age >= 32 { 1.3 } else { 1.0 };
        let prior_bonus: f64 = if player.has_prior_injury { 0.02 } else { 0.0 };

        let play_through_bonus: f64 = if player.is_playing_through {
            match player.playing_through_severity.as_deref() {
                Some("moderate") => 0.25,
                Some("light")    => 0.12,
                _                => 0.0,
            }
        } else {
            0.0
        };

        let chance = ((base + consec_bonus + prior_bonus + play_through_bonus) * age_mult).min(0.80);

        if rng.gen::<f64>() >= chance {
            continue;
        }

        let tier_roll: f64 = rng.gen();
        // surgery: 2.5% / severe: 9.5% / moderate: 28% / light: 60%
        let tier = if tier_roll < 0.025 { "surgery" }
                   else if tier_roll < 0.12  { "severe" }
                   else if tier_roll < 0.40  { "moderate" }
                   else                      { "light" };

        let injury_type = match tier {
            "surgery"  => pick_surgery_type(&mut rng),
            "severe"   => pick_severe_type(is_pitcher, &mut rng),
            "moderate" => pick_moderate_type(is_pitcher, &mut rng),
            _          => pick_light_type(is_pitcher, &mut rng),
        };

        let recovery_weeks = recovery_weeks_for(injury_type, &mut rng);
        let severity = severity_of(injury_type).to_string();

        occurred.push(NpcInjuryOccurrence {
            player_id: player.player_id.clone(),
            injury_type: injury_type.to_string(),
            severity,
            recovery_weeks,
        });
    }

    NpcInjuriesResult { occurred }
}

// ── HS Admissions ─────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnivChoiceReq {
    pub team_id: String,
    pub min_academic_grade: u8,   // 1~9
    pub min_baseball_score: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HsAdmissionsPayload {
    /// 판정 씨앗. **0이면 예전 그대로 `thread_rng`다**(구 페이로드 호환).
    ///
    /// ⚠ 진학 합격 판정이다 — 주인공 진로가 여기서 갈린다.
    #[serde(default)]
    pub seed: u32,
    pub ovr: f64,
    pub avg_pct: f64,
    pub hs_baseball_score: f64,
    pub univ_choices: Vec<UnivChoiceReq>,
    /// 독립 리그 지망. **팀별 난이도(`min_ovr`)를 받는다** — 예전엔 팀 ID
    /// 문자열만 받아 지망 순서로만 난이도를 정했다. 1지망에 약팀을 써도
    /// 컷이 52여서 **어느 팀을 고르든 같았다.**
    pub indie_choices: Vec<IndieChoiceReq>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndieChoiceReq {
    pub team_id: String,
    /// 그 팀의 컷(OVR). 전력★에서 화면이 낸다
    pub min_ovr: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HsAdmissionsResult {
    pub univ_passed: Vec<String>,
    pub indie_passed: Vec<String>,
}

fn pct_to_grade(pct: f64) -> u8 {
    if pct <= 4.0  { 1 }
    else if pct <= 11.0 { 2 }
    else if pct <= 23.0 { 3 }
    else if pct <= 40.0 { 4 }
    else if pct <= 60.0 { 5 }
    else if pct <= 77.0 { 6 }
    else if pct <= 89.0 { 7 }
    else if pct <= 96.0 { 8 }
    else { 9 }
}

pub fn calc_hs_admissions(p: HsAdmissionsPayload) -> HsAdmissionsResult {
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    let ovr = p.ovr;
    let academic_grade = pct_to_grade(p.avg_pct);

    let univ_passed: Vec<String> = p.univ_choices.iter()
        .filter(|c| {
            let meets_academic = academic_grade <= c.min_academic_grade;
            let meets_baseball = p.hs_baseball_score >= c.min_baseball_score;
            let chance = match (meets_academic, meets_baseball) {
                (true, true) => {
                    let a_bonus = (c.min_academic_grade as f64 - academic_grade as f64).max(0.0) * 3.0;
                    let b_bonus = ((p.hs_baseball_score - c.min_baseball_score) / 20.0).min(10.0);
                    (70.0 + a_bonus + b_bonus).min(92.0)
                },
                (true, false) => 28.0,
                (false, true) => 22.0,
                (false, false) => 8.0,
            };
            rng.gen::<f64>() * 100.0 < chance
        })
        .map(|c| c.team_id.clone())
        .collect();

    // 팀의 컷이 주가 되고 지망 순서는 작게 보탠다 — 위로 지원할수록 조금 어렵다
    let indie_passed: Vec<String> = p.indie_choices.iter().enumerate()
        .filter(|(i, c)| {
            let order_penalty = [0.0f64, -2.0, -4.0].get(*i).copied().unwrap_or(-4.0);
            let cut = c.min_ovr - order_penalty;
            if ovr < cut - 10.0 { return false; }
            let base = 36.0 + (ovr - cut) * 3.2;
            rng.gen::<f64>() * 100.0 < base.clamp(12.0, 96.0)
        })
        .map(|(_, c)| c.team_id.clone())
        .collect();

    HsAdmissionsResult { univ_passed, indie_passed }
}

// ── Exam Result ───────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamPayload {
    /// 판정 씨앗. **0이면 예전 그대로 `thread_rng`다**(구 페이로드 호환).
    ///
    /// ⚠ 시험은 내신 등급을 정하고 등급은 **대학 진학**을 정한다 —
    ///   씨앗이 없으면 같은 세이브가 실행마다 다른 진로를 탄다.
    #[serde(default)]
    pub seed: u32,
    pub accum_score: f64,
    pub warning_count: u32,
    pub exam_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamResult {
    pub grade: u32,
    pub raw: u32,
    pub risk_level: String,
    pub morale_delta: i32,
    pub eligibility_blocked: bool,
    pub message_subject: String,
    pub message_body: String,
}

pub fn calc_exam_result(p: ExamPayload) -> ExamResult {
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    let penalty = p.warning_count * 8;
    let rand_val = rng.gen_range(0u32..25);
    let raw = ((p.accum_score as i64 - penalty as i64 + rand_val as i64).clamp(0, 100)) as u32;

    let grade: u32 =
        if raw >= 90 { 1 } else if raw >= 80 { 2 } else if raw >= 65 { 3 }
        else if raw >= 50 { 4 } else if raw >= 38 { 5 } else if raw >= 28 { 6 }
        else if raw >= 18 { 7 } else if raw >= 10 { 8 } else { 9 };

    let risk_level = if grade <= 6 { "ok" } else if grade <= 7 { "warn" } else { "danger" };

    let morale_delta: i32 = match grade {
        1 => 12, 2 => 8, 3 | 4 => 4, 5 | 6 => 0, 7 => -8, _ => -15,
    };

    let eligibility_blocked = grade >= 9;
    let label = if p.exam_type == "midterm" { "중간고사" } else { "기말고사" };
    let grade_str = format!("{}등급", grade);

    let message_body = if grade <= 2 {
        format!("{} 결과: {}\n\n탁월한 성적입니다! 학업과 훈련을 훌륭하게 병행하고 있습니다. 사기 +{}", label, grade_str, morale_delta)
    } else if grade <= 4 {
        format!("{} 결과: {}\n\n양호한 성적입니다. 꾸준한 학업 관리를 유지하고 있습니다. 사기 +{}", label, grade_str, morale_delta)
    } else if grade <= 6 {
        format!("{} 결과: {}\n\n평균 수준의 성적입니다. 다음 시험에는 학업에 좀 더 집중해보세요.", label, grade_str)
    } else if grade <= 7 {
        format!("{} 결과: {}\n\n성적 부진으로 출전 자격 경고가 발령되었습니다. 다음 시험까지 학업에 집중하세요. 사기 {}", label, grade_str, morale_delta)
    } else {
        format!("{} 결과: {}\n\n성적 불량으로 학사 경고가 발령되었습니다. 이번 주 경기 출전이 제한됩니다. 즉시 학업 개선이 필요합니다. 사기 {}", label, grade_str, morale_delta)
    };

    ExamResult {
        grade, raw, risk_level: risk_level.to_string(), morale_delta, eligibility_blocked,
        message_subject: format!("{} 성적 통보 — {}", label, grade_str),
        message_body,
    }
}

// ── Military Week ─────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryWeekPayload {
    pub is_sports_unit: bool,
    pub service_weeks: u32,
    pub stamina: u32,
    pub recovery: u32,
    pub command: u32,
    pub control: u32,
    pub velocity: u32,
    pub morale: i32,
    pub fatigue: i32,
    pub sports_event_count: usize,
    pub general_event_count: usize,
    pub common_event_count: usize,
    /// 판정 씨앗. **0이면 예전 그대로 `thread_rng`다**(구 페이로드 호환).
    ///
    /// 🔴 이 파일의 다른 주간 계산은 전부 씨앗을 받는데 **군 복무 주간만**
    ///   빠져 있었다. 복무 2년이면 100주가 씨앗 밖이라, 전역 뒤 능력치가
    ///   판마다 달라져 그 뒤를 잴 수 없다 (2026-09-07).
    #[serde(default)]
    pub seed: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryWeekResult {
    pub stamina: u32,
    pub recovery: u32,
    pub command: u32,
    pub control: u32,
    pub velocity: u32,
    pub morale: i32,
    pub fatigue: i32,
    pub event_pool: Option<String>,
    pub event_index: Option<usize>,
    pub rank: String,
}

fn military_rank(service_weeks: u32) -> &'static str {
    match service_weeks {
        0..=8   => "이병",
        9..=34  => "일병",
        35..=60 => "상병",
        _       => "병장",
    }
}

fn rank_index(service_weeks: u32) -> u32 {
    match service_weeks {
        0..=8   => 0,
        9..=34  => 1,
        35..=60 => 2,
        _       => 3,
    }
}

pub fn calc_military_week(p: MilitaryWeekPayload) -> MilitaryWeekResult {
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    let ri = rank_index(p.service_weeks);

    // ── 체육부대 계급별 스탯 변화 ────────────────────────────────
    let (stamina, recovery, command, control, velocity, morale_delta, fatigue_delta) =
        if p.is_sports_unit {
            let (sta_d, rec_prob, cmd_prob, vel_prob, mor, fat) = match ri {
                0 => (0,    0.00, 0.30, 0.00,  -1,  1),  // 이병: 적응기
                1 => (1,    0.25, 0.35, 0.00,   0, -1),  // 일병: 루틴
                2 => (1,    1.00, 0.40, 0.00,   1, -2),  // 상병: 성장
                _ => (1,    1.00, 0.50, 0.20,   2, -2),  // 병장: 완성
            };
            let stamina  = (p.stamina.saturating_add(sta_d as u32)).min(99);
            let recovery = (p.recovery as i32 + if rng.gen::<f64>() < rec_prob { 1 } else { 0 }).clamp(1, 99) as u32;
            let command  = (p.command  as i32 + if rng.gen::<f64>() < cmd_prob { 1 } else { if ri == 0 && rng.gen::<f64>() < 0.30 { -1 } else { 0 } }).clamp(1, 99) as u32;
            let velocity = (p.velocity as i32 + if rng.gen::<f64>() < vel_prob { 1 } else { 0 }).clamp(1, 99) as u32;
            (stamina, recovery, command, p.control, velocity, mor, fat)
        } else {
            // ── 일반부대 계급별 스탯 변화 ────────────────────────
            let (cmd_prob, ctl_prob, rec_prob, mor, fat) = match ri {
                0 => (0.75, 0.65, 0.20, -2,  4),  // 이병: 충격기
                1 => (0.45, 0.40, 0.30, -1,  2),  // 일병: 임무기
                2 => (0.25, 0.20, 0.20, -1,  1),  // 상병: 안정기 (50% 확률로 morale -1)
                _ => (0.15, 0.00, 0.00,  0,  1),  // 병장: 전역 준비
            };
            let command  = p.command.saturating_sub(if rng.gen::<f64>() < cmd_prob { 1 } else { 0 }).max(1);
            let control  = p.control.saturating_sub(if rng.gen::<f64>() < ctl_prob { 1 } else { 0 }).max(1);
            let recovery = p.recovery.saturating_sub(if rng.gen::<f64>() < rec_prob { 1 } else { 0 }).max(1);
            // 상병 morale: 50% 확률로 -1
            let mor_adj = if ri == 2 && rng.gen::<f64>() < 0.50 { -1 }
                         else if ri == 3 && rng.gen::<f64>() < 0.50 { 1 }
                         else { mor };
            (p.stamina, recovery, command, control, p.velocity, mor_adj, fat)
        };

    let morale  = (p.morale  + morale_delta).clamp(0, 100);
    let fatigue = (p.fatigue + fatigue_delta).clamp(0, 100);

    // ── 이벤트 선택 (체육 70% + 공용 30% / 일반 70% + 공용 30%) ──
    let total_sports  = p.sports_event_count;
    let total_general = p.general_event_count;
    let total_common  = p.common_event_count;

    let (event_pool, event_index) = if rng.gen::<f64>() < 0.40 {
        if p.is_sports_unit {
            let use_common = total_common > 0 && rng.gen::<f64>() < 0.30;
            if use_common {
                (Some("common".to_string()), Some(rng.gen_range(0..total_common)))
            } else if total_sports > 0 {
                (Some("sports".to_string()), Some(rng.gen_range(0..total_sports)))
            } else {
                (None, None)
            }
        } else {
            let use_common = total_common > 0 && rng.gen::<f64>() < 0.30;
            if use_common {
                (Some("common".to_string()), Some(rng.gen_range(0..total_common)))
            } else if total_general > 0 {
                (Some("general".to_string()), Some(rng.gen_range(0..total_general)))
            } else {
                (None, None)
            }
        }
    } else {
        (None, None)
    };

    let rank = military_rank(p.service_weeks).to_string();

    MilitaryWeekResult {
        stamina, recovery, command, control, velocity,
        morale, fatigue,
        event_pool, event_index, rank,
    }
}

// ── NPC Fallback Score ────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcFallbackPayload {
    /// 판정 씨앗. **0이면 예전 그대로 `thread_rng`다**(구 페이로드 호환).
    ///
    /// ⚠ 경기 결과다 — 씨앗이 없으면 같은 일정도 실행마다 다른 순위를 낸다.
    #[serde(default)]
    pub seed: u32,
    pub home_team_id: String,
    pub away_team_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcFallbackResult {
    pub home_score: u32,
    pub away_score: u32,
    pub winner_id: String,
    pub loser_id: String,
}

pub fn calc_npc_fallback(p: NpcFallbackPayload) -> NpcFallbackResult {
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    // ⚠ `ThreadRng`를 못 박으면 씨앗을 쓸 수 없다 — 트레임으로 넓힌다
    let score = |rng: &mut dyn rand::RngCore| -> u32 {
        let raw: f64 = rng.gen::<f64>() + rng.gen::<f64>() + rng.gen::<f64>() - 1.5;
        (raw * 4.0).round().max(0.0) as u32
    };
    let mut h = score(&mut rng);
    let mut a = score(&mut rng);
    if h == a { if h > 0 { h -= 1; } else { a += 1; } }
    let (winner_id, loser_id) = if h > a {
        (p.home_team_id.clone(), p.away_team_id.clone())
    } else {
        (p.away_team_id.clone(), p.home_team_id.clone())
    };
    NpcFallbackResult { home_score: h, away_score: a, winner_id, loser_id }
}

// ── Event Random Batch ────────────────────────────────────────

/// 난수 배치. **씨앗이 0이면 예전 그대로 `thread_rng`다.**
///
/// NPC 은퇴 판정이 이걸 쓴다 — 씨앗이 없으면 같은 세이브도 실행마다
/// 다른 사람이 은퇴하고, 그 차이가 로스터·FA·계측으로 번진다.
pub fn roll_random_batch(count: u32, seed: u32) -> Vec<f64> {
    // 🔴 **씨앗을 받고도 버렸다.** 위 주석은 "0이면 thread_rng"라고 적혀
    //    있었는데 그 갈래가 아예 없었다 — 항상 `thread_rng`였다.
    //    호출부 셋 중 `injuries.ts`는 `seedOf(...)`로 제대로 넘기고 있었고,
    //    그 노력이 여기서 통째로 버려졌다. NPC 은퇴 판정이 그래서
    //    여전히 실행마다 다른 사람을 골랐다.
    if seed == 0 {
        let mut rng = rand::thread_rng();
        return (0..count).map(|_| rng.gen::<f64>()).collect();
    }
    let mut rng = crate::npc_sim::LcgRand::new(seed);
    (0..count).map(|_| rng.next()).collect()
}

// ── Academics ─────────────────────────────────────────────────
//
// 학업 산식이 `apps/ui/.../academicsEngine.ts`에 있었다 (2026-08-28에 내렸다).
// 표는 `generation_rules.json`의 `academicsRules`가 정본이고 TS가 그대로
// 넘긴다 — 여기에 같은 숫자를 다시 적지 마라.
//
// ⚠ 표 조회(`percentileToGrade`·`weeksUntilNextExam`·모드 뱃지)는 **TS에
//   남겼다.** 화면이 반응형(`$:`)으로 부르는 자리라 IPC를 태우면 렌더가
//   깨진다. 산식만 여기 있다.

/// JS `Math.round` 의미 — `floor(x + 0.5)`.
/// Rust `f64::round`는 음수 절반에서 갈린다(−0.5 → −1 vs JS 0).
fn js_round(x: f64) -> f64 { (x + 0.5).floor() }

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StudyModeEffect {
    pub exam_gain: f64,
    pub efficiency_mod: f64,
    pub attendance_delta: f64,
    pub assignment_delta: f64,
    /// 양수 = 석차백분율이 오른다 = 나쁜 방향
    pub percentile_delta: f64,
    pub warning_increment: bool,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubjectScore {
    pub percentile: f64,
    pub attendance: f64,
    pub assignment: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyStudyPayload {
    pub mode: String,
    /// `academicsRules.highschool.studyModes` 그대로
    pub modes: std::collections::HashMap<String, StudyModeEffect>,
    pub exam_accum_score: f64,
    pub subject_scores: std::collections::HashMap<String, SubjectScore>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyStudyResult {
    pub exam_accum_delta: f64,
    pub updated_subject_scores: std::collections::HashMap<String, SubjectScore>,
    pub warning_count_delta: u32,
    pub efficiency_mod: f64,
}

pub fn calc_weekly_study(p: WeeklyStudyPayload) -> WeeklyStudyResult {
    // 모르는 모드면 무보정 — 구 세이브의 모드 문자열이 표에 없을 수 있다
    let fx = match p.modes.get(&p.mode) {
        Some(f) => f.clone(),
        None => return WeeklyStudyResult {
            exam_accum_delta: 0.0,
            updated_subject_scores: p.subject_scores,
            warning_count_delta: 0,
            efficiency_mod: 1.0,
        },
    };
    let clamp = |v: f64, lo: f64, hi: f64| (js_round(v * 10.0) / 10.0).max(lo).min(hi);

    let mut updated = std::collections::HashMap::new();
    for (id, s) in &p.subject_scores {
        updated.insert(id.clone(), SubjectScore {
            percentile: clamp(s.percentile + fx.percentile_delta, 1.0, 100.0),
            attendance: clamp(s.attendance + fx.attendance_delta, 0.0, 100.0),
            assignment: clamp(s.assignment + fx.assignment_delta, 0.0, 100.0),
        });
    }

    WeeklyStudyResult {
        // 상한 100까지만 쌓인다
        exam_accum_delta: fx.exam_gain.min(100.0 - p.exam_accum_score),
        updated_subject_scores: updated,
        warning_count_delta: if fx.warning_increment { 1 } else { 0 },
        efficiency_mod: fx.efficiency_mod,
    }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WarningEffectIn {
    pub level: i32,
    pub repeats: bool,
    pub label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemesterPayload {
    pub gpa_max: f64,
    pub warning_gpa: f64,
    pub warning_effects: Vec<WarningEffectIn>,
    /// 전공 배수 — TS `majorEffects(rules, major).gpaGainMult`
    pub gpa_gain_mult: f64,
    /// 이번 학기 주당 품질(0~1)의 합
    pub quality_accum: f64,
    /// 이번 학기 주차 수 — 학기 길이가 다르므로 반드시 나눈다
    pub weeks: f64,
    pub prior_cumulative: f64,
    pub semesters_done: f64,
    pub warning_level: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemesterResultOut {
    pub gpa: f64,
    pub cumulative_gpa: f64,
    pub new_warning_level: i32,
    pub repeats: bool,
    pub label: String,
    pub message_subject: String,
    pub message_body: String,
}

/// 학기 학점을 확정한다 (중간·기말 각 1회).
///
/// 경고는 **단계로 오르내린다** — 기준 미달이면 +1, 넘기면 −1이다.
/// 예전 고교식은 누적이 임계를 넘는 순간 바로 출전 정지라 회복할 틈이 없었다.
pub fn calc_semester_result(p: SemesterPayload) -> SemesterResultOut {
    // ⚠ **평균 품질로 낸다.** 합계를 그대로 쓰면 기말(27주)이 중간(11주)보다
    // 무조건 높아져, 중간고사에서 늘 경고가 걸린다
    let avg_quality = if p.weeks > 0.0 { p.quality_accum / p.weeks } else { 0.0 };
    let gpa = (avg_quality * p.gpa_max * p.gpa_gain_mult).max(0.0).min(p.gpa_max);

    let n = p.semesters_done.max(1.0);
    let cumulative_gpa = js_round(((p.prior_cumulative * (n - 1.0) + gpa) / n) * 100.0) / 100.0;

    let below = gpa < p.warning_gpa;
    let raw = if below { p.warning_level + 1 } else { p.warning_level - 1 };
    let new_level = raw.clamp(0, 3);
    let fx = p.warning_effects.iter().find(|w| w.level == new_level && new_level != 0);

    let body = if below {
        let tail = if new_level == 1 {
            "학사 경고를 받았습니다. 훈련에 쓸 시간이 줄어듭니다."
        } else if new_level == 2 {
            "경고가 누적되어 다음 학기 경기 출전이 정지됩니다."
        } else {
            "경고가 세 번 쌓였습니다. 유급 처리되어 졸업이 한 해 밀립니다."
        };
        format!("이번 학기 학점은 {:.2}입니다. 기준({:.2})에 미치지 못했습니다.\n\n{}",
            gpa, p.warning_gpa, tail)
    } else {
        let tail = if p.warning_level > 0 { "경고 단계가 한 단계 내려갔습니다." } else { "기준을 넘겼습니다." };
        format!("이번 학기 학점은 {:.2}입니다. 누적 {:.2}.\n\n{}", gpa, cumulative_gpa, tail)
    };

    let label = fx.map(|f| f.label.clone()).unwrap_or_else(|| "정상".to_string());
    SemesterResultOut {
        gpa,
        cumulative_gpa,
        new_warning_level: new_level,
        repeats: fx.map(|f| f.repeats).unwrap_or(false),
        message_subject: if below {
            format!("학사 경고 — {}", fx.map(|f| f.label.as_str()).unwrap_or(""))
        } else {
            "학기 성적 발표".to_string()
        },
        label,
        message_body: body,
    }
}

#[cfg(test)]
mod academics_tests {
    use super::*;
    use std::collections::HashMap;

    fn modes() -> HashMap<String, StudyModeEffect> {
        let mut m = HashMap::new();
        m.insert("focus".into(), StudyModeEffect {
            exam_gain: 8.0, efficiency_mod: 0.70, attendance_delta: 1.0,
            assignment_delta: 2.0, percentile_delta: -2.0, warning_increment: false });
        m.insert("sleep".into(), StudyModeEffect {
            exam_gain: 0.0, efficiency_mod: 1.05, attendance_delta: -8.0,
            assignment_delta: -9.0, percentile_delta: 7.0, warning_increment: true });
        m
    }
    fn subj(pct: f64, att: f64, asg: f64) -> HashMap<String, SubjectScore> {
        let mut m = HashMap::new();
        m.insert("s1".into(), SubjectScore { percentile: pct, attendance: att, assignment: asg });
        m
    }

    #[test]
    fn 상한을_넘겨_쌓지_않는다() {
        // 누적 95에서 focus(8) → 5만 들어간다
        let r = calc_weekly_study(WeeklyStudyPayload {
            mode: "focus".into(), modes: modes(), exam_accum_score: 95.0, subject_scores: subj(50.0, 80.0, 80.0),
        });
        assert!((r.exam_accum_delta - 5.0).abs() < 1e-9, "{}", r.exam_accum_delta);
    }

    #[test]
    fn 석차백분율은_1_아래로_안_내려간다() {
        // 🔴 0이 되면 `percentileToGrade`가 1등급을 주는데, 백분율 0은 없는 값이다
        let r = calc_weekly_study(WeeklyStudyPayload {
            mode: "focus".into(), modes: modes(), exam_accum_score: 0.0, subject_scores: subj(1.0, 100.0, 100.0),
        });
        let s = &r.updated_subject_scores["s1"];
        assert_eq!(s.percentile, 1.0);
        // 출석·과제는 100 상한
        assert_eq!(s.attendance, 100.0);
        assert_eq!(s.assignment, 100.0);
    }

    #[test]
    fn 출석은_0_아래로_안_내려간다() {
        let r = calc_weekly_study(WeeklyStudyPayload {
            mode: "sleep".into(), modes: modes(), exam_accum_score: 0.0, subject_scores: subj(100.0, 3.0, 2.0),
        });
        let s = &r.updated_subject_scores["s1"];
        assert_eq!(s.attendance, 0.0);
        assert_eq!(s.assignment, 0.0);
        assert_eq!(s.percentile, 100.0);
        assert_eq!(r.warning_count_delta, 1);
    }

    #[test]
    fn 모르는_모드는_무보정이다() {
        // ⚠ 구 세이브의 모드 문자열이 표에 없을 수 있다 — 죽으면 안 된다
        let r = calc_weekly_study(WeeklyStudyPayload {
            mode: "없는모드".into(), modes: modes(), exam_accum_score: 10.0, subject_scores: subj(50.0, 80.0, 80.0),
        });
        assert_eq!(r.efficiency_mod, 1.0);
        assert_eq!(r.exam_accum_delta, 0.0);
        assert_eq!(r.updated_subject_scores["s1"].percentile, 50.0);
    }

    fn warns() -> Vec<WarningEffectIn> {
        vec![
            WarningEffectIn { level: 1, repeats: false, label: "학사 경고".into() },
            WarningEffectIn { level: 2, repeats: false, label: "출전 정지".into() },
            WarningEffectIn { level: 3, repeats: true,  label: "유급".into() },
        ]
    }
    fn sem(quality: f64, weeks: f64, level: i32) -> SemesterPayload {
        SemesterPayload {
            gpa_max: 4.5, warning_gpa: 1.75, warning_effects: warns(), gpa_gain_mult: 1.0,
            quality_accum: quality, weeks, prior_cumulative: 0.0, semesters_done: 1.0, warning_level: level,
        }
    }

    #[test]
    fn 학기_길이가_달라도_공정하다() {
        // 🔴 합계를 그대로 쓰면 기말(27주)이 중간(11주)보다 무조건 높아진다.
        //   같은 품질이면 학점이 같아야 한다
        let mid = calc_semester_result(sem(0.55 * 11.0, 11.0, 0));
        let fin = calc_semester_result(sem(0.55 * 27.0, 27.0, 0));
        assert!((mid.gpa - fin.gpa).abs() < 1e-9, "{} vs {}", mid.gpa, fin.gpa);
    }

    #[test]
    fn 경고는_단계로_오르내린다() {
        // 미달이면 +1
        assert_eq!(calc_semester_result(sem(0.05 * 11.0, 11.0, 0)).new_warning_level, 1);
        // 넘기면 −1 — **회복할 틈이 있어야 한다**
        assert_eq!(calc_semester_result(sem(0.85 * 11.0, 11.0, 2)).new_warning_level, 1);
        // 0 아래로 안 간다
        assert_eq!(calc_semester_result(sem(0.85 * 11.0, 11.0, 0)).new_warning_level, 0);
        // 3에서 멈춘다
        assert_eq!(calc_semester_result(sem(0.05 * 11.0, 11.0, 3)).new_warning_level, 3);
    }

    #[test]
    fn 유급은_3단계에서만이다() {
        assert!(!calc_semester_result(sem(0.05 * 11.0, 11.0, 0)).repeats);
        assert!(!calc_semester_result(sem(0.05 * 11.0, 11.0, 1)).repeats);
        let r3 = calc_semester_result(sem(0.05 * 11.0, 11.0, 2));
        assert_eq!(r3.new_warning_level, 3);
        assert!(r3.repeats);
        assert_eq!(r3.label, "유급");
    }

    #[test]
    fn 품질이_오르면_학점도_오른다() {
        // 🔴 `studyQualityDelta` 보상이 실제로 학점을 움직이는지 —
        //   양방향이다. 단방향이면 깎는 이벤트가 죽는다
        let plain = calc_semester_result(sem(4.0, 8.0, 0)).gpa;
        let up    = calc_semester_result(sem(5.0, 8.0, 0)).gpa;
        let down  = calc_semester_result(sem(3.0, 8.0, 0)).gpa;
        assert!(up > plain, "{} vs {}", up, plain);
        assert!(down < plain, "{} vs {}", down, plain);
    }

    #[test]
    fn 주차가_0이면_학점도_0이다() {
        // 0으로 나누지 않는다
        let r = calc_semester_result(sem(3.0, 0.0, 0));
        assert_eq!(r.gpa, 0.0);
    }

    #[test]
    fn 누적은_학기_수로_평균낸다() {
        let mut p = sem(0.85 * 11.0, 11.0, 0);
        p.prior_cumulative = 2.0;
        p.semesters_done = 3.0;
        let r = calc_semester_result(p);
        // (2.0×2 + gpa) / 3, 소수 둘째 자리
        let want = (((2.0 * 2.0 + r.gpa) / 3.0) * 100.0).round() / 100.0;
        assert!((r.cumulative_gpa - want).abs() < 1e-9, "{} vs {}", r.cumulative_gpa, want);
    }

    #[test]
    fn 전공_배수가_학점에_걸린다() {
        let mut p = sem(0.5 * 11.0, 11.0, 0);
        p.gpa_gain_mult = 1.5;
        let boosted = calc_semester_result(p).gpa;
        let plain = calc_semester_result(sem(0.5 * 11.0, 11.0, 0)).gpa;
        assert!(boosted > plain, "{} vs {}", boosted, plain);
        // 상한을 넘지 않는다
        let mut q = sem(1.0 * 11.0, 11.0, 0);
        q.gpa_gain_mult = 1.5;
        assert_eq!(calc_semester_result(q).gpa, 4.5);
    }
}

// ── 현역 병영생활 주간 계산 (docs/PLAN_MILITARY_LIFE.md 4부 §26 · 2026-09-02) ─────────
//
// 상무는 위 `calc_military_week` 를 그대로 쓴다 — 갈래 하나를 고쳐 두 무대가 같이
// 흔들리는 걸 막으려고 함수를 따로 뒀다. **능력치 칸이 없다** — 복무 중엔 능력치를
// 안 건드리고 전역 때 야구 감각으로 환산한다(사용자 확정 09-02).
// 수치는 전부 페이로드로 받는다 — 정본은 `resource/data/master/military/rules.json` 이다.
// 난수는 씨앗(`seed`)에서만 나온다 — 계측이 재현돼야 한다(결정성 정책).

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryLifeMember {
    pub id: String,
    pub relation: f64,
    pub same_subunit: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryLifeWeekPayload {
    pub seed: u64,
    pub duty_intensity: u32,
    pub ball_access: u32,
    pub rank_band: u32,
    /// "ball" | "people" | "rest" | "none"(훈련소·휴가·선택 없는 주)
    pub choice: String,
    pub fatigue: f64,
    pub morale: f64,
    pub ball_sense: f64,
    pub calendar_fatigue: f64,
    pub calendar_ball: f64,
    pub on_leave: bool,
    pub boot_camp: bool,
    pub members: Vec<MilitaryLifeMember>,
    /// 후보 이벤트 가중 — 빈 배열이면 이번 주 이벤트 없음
    pub candidate_weights: Vec<f64>,
    // rules.json
    pub fatigue_base_by_intensity: Vec<f64>,
    pub fatigue_choice_ball: f64,
    pub fatigue_choice_people: f64,
    pub fatigue_choice_rest: f64,
    pub fatigue_natural: f64,
    pub fatigue_leave: f64,
    pub morale_choice_people: f64,
    pub morale_choice_rest: f64,
    pub morale_leave: f64,
    pub sense_weekly_decay: f64,
    pub sense_gain_by_access: Vec<f64>,
    pub sense_cap_per_access_gap: f64,
    pub sense_leave_gain: f64,
    pub relation_weekly_decay: f64,
    pub relation_people_by_band: Vec<f64>,
    pub relation_same_subunit_weight: f64,
    pub event_weekly_chance: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryLifeRelationDelta {
    pub id: String,
    pub delta: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryLifeWeekResult {
    pub fatigue: f64,
    pub morale: f64,
    pub ball_sense: f64,
    /// 야구 감각 상한 — 화면이 "상한 — 오르지 않는다" 를 보여 주려고 같이 준다
    pub ball_sense_cap: f64,
    pub relation_deltas: Vec<MilitaryLifeRelationDelta>,
    /// 사람 카드가 고른 대상 (소식에 적는다)
    pub people_targets: Vec<String>,
    /// 40% 굴림에 걸렸고 후보가 있었으면 그 인덱스
    pub event_index: Option<usize>,
}

fn weighted_index<R: rand::Rng>(rng: &mut R, weights: &[f64]) -> Option<usize> {
    let total: f64 = weights.iter().filter(|w| **w > 0.0).sum();
    if total <= 0.0 { return None; }
    let mut r = rng.gen::<f64>() * total;
    for (i, w) in weights.iter().enumerate() {
        if *w <= 0.0 { continue; }
        if r < *w { return Some(i); }
        r -= *w;
    }
    Some(weights.len() - 1)
}

pub fn calc_military_life_week(p: MilitaryLifeWeekPayload) -> MilitaryLifeWeekResult {
    use rand::SeedableRng;
    let mut rng = rand::rngs::StdRng::seed_from_u64(p.seed);
    let at = |v: &Vec<f64>, i: usize| v.get(i).copied().unwrap_or_else(|| v.last().copied().unwrap_or(0.0));

    // 피로 — 훈련소는 최고 강도(5) · 휴가 주는 고정 회복
    let intensity = if p.boot_camp { 5 } else { p.duty_intensity.min(5) } as usize;
    let mut fatigue = p.fatigue + at(&p.fatigue_base_by_intensity, intensity) + p.calendar_fatigue + p.fatigue_natural;
    let mut morale = p.morale + (60.0 - p.morale) * 0.05;   // 회귀 — CLAUDE.md 사기 규칙 그대로
    let cap = (100.0 - p.sense_cap_per_access_gap * (3.0 - p.ball_access.min(3) as f64)).max(0.0);
    let mut sense = p.ball_sense - p.sense_weekly_decay + p.calendar_ball;
    let mut people_targets: Vec<String> = Vec::new();
    let mut deltas: Vec<f64> = vec![-p.relation_weekly_decay; p.members.len()];

    if p.on_leave {
        fatigue += p.fatigue_leave;
        morale += p.morale_leave;
        sense += p.sense_leave_gain;
    } else {
        match p.choice.as_str() {
            "ball" => {
                fatigue += p.fatigue_choice_ball;
                if p.ball_access > 0 { sense += at(&p.sense_gain_by_access, p.ball_access.min(3) as usize); }
            }
            "people" => {
                fatigue += p.fatigue_choice_people;
                morale += p.morale_choice_people;
                if !p.members.is_empty() {
                    let n = if p.members.len() >= 2 && rng.gen::<f64>() < 0.5 { 2 } else { 1 };
                    let gain = at(&p.relation_people_by_band, p.rank_band.min(3) as usize);
                    let mut weights: Vec<f64> = p.members.iter()
                        .map(|m| if m.same_subunit { p.relation_same_subunit_weight } else { 1.0 })
                        .collect();
                    for _ in 0..n {
                        if let Some(i) = weighted_index(&mut rng, &weights) {
                            deltas[i] += gain;
                            people_targets.push(p.members[i].id.clone());
                            weights[i] = 0.0;
                        }
                    }
                }
            }
            "rest" => {
                fatigue += p.fatigue_choice_rest;
                morale += p.morale_choice_rest;
            }
            _ => {}
        }
    }

    // 상한: 이미 상한 위였으면 올리진 않되 깎이는 건 그대로
    let sense_max = cap.max(p.ball_sense.min(100.0)).min(100.0);
    let ball_sense = sense.clamp(0.0, sense_max);

    let event_index = if !p.candidate_weights.is_empty() && rng.gen::<f64>() < p.event_weekly_chance {
        weighted_index(&mut rng, &p.candidate_weights)
    } else { None };

    MilitaryLifeWeekResult {
        fatigue: fatigue.clamp(0.0, 100.0),
        morale: morale.clamp(0.0, 100.0),
        ball_sense,
        ball_sense_cap: cap,
        relation_deltas: p.members.iter().zip(deltas.iter())
            .map(|(m, d)| MilitaryLifeRelationDelta { id: m.id.clone(), delta: *d })
            .collect(),
        people_targets,
        event_index,
    }
}

#[cfg(test)]
mod military_life_tests {
    use super::*;

    fn payload(choice: &str) -> MilitaryLifeWeekPayload {
        MilitaryLifeWeekPayload {
            seed: 7, duty_intensity: 4, ball_access: 1, rank_band: 1, choice: choice.to_string(),
            fatigue: 50.0, morale: 60.0, ball_sense: 60.0, calendar_fatigue: 0.0, calendar_ball: 0.0,
            on_leave: false, boot_camp: false,
            members: vec![
                MilitaryLifeMember { id: "A".into(), relation: 0.0, same_subunit: true },
                MilitaryLifeMember { id: "B".into(), relation: 0.0, same_subunit: false },
            ],
            candidate_weights: vec![],
            fatigue_base_by_intensity: vec![0.0, 2.0, 4.0, 6.0, 8.0, 10.0],
            fatigue_choice_ball: 4.0, fatigue_choice_people: 1.0, fatigue_choice_rest: -6.0,
            fatigue_natural: -3.0, fatigue_leave: -20.0,
            morale_choice_people: 2.0, morale_choice_rest: 1.0, morale_leave: 8.0,
            sense_weekly_decay: 1.5, sense_gain_by_access: vec![0.0, 3.0, 5.0, 8.0],
            sense_cap_per_access_gap: 10.0, sense_leave_gain: 4.0,
            relation_weekly_decay: 0.5, relation_people_by_band: vec![2.0, 2.0, 3.0, 4.0],
            relation_same_subunit_weight: 2.0, event_weekly_chance: 0.4,
        }
    }

    #[test]
    fn ball_choice_raises_sense_and_fatigue() {
        let r = calc_military_life_week(payload("ball"));
        assert!((r.ball_sense - (60.0 - 1.5 + 3.0)).abs() < 1e-9);
        assert!((r.fatigue - (50.0 + 8.0 - 3.0 + 4.0)).abs() < 1e-9);
    }

    #[test]
    fn sense_cap_follows_ball_access() {
        let mut p = payload("ball");
        p.ball_sense = 79.5;
        let r = calc_military_life_week(p);
        assert!((r.ball_sense_cap - 80.0).abs() < 1e-9);
        assert!(r.ball_sense <= 80.0);
    }

    #[test]
    fn people_choice_adds_on_top_of_decay_and_prefers_same_subunit() {
        let mut same = 0;
        for seed in 0..200u64 {
            let mut p = payload("people");
            p.seed = seed;
            let r = calc_military_life_week(p);
            assert!(!r.people_targets.is_empty());
            for d in &r.relation_deltas {
                if r.people_targets.contains(&d.id) { assert!((d.delta - 1.5).abs() < 1e-9); }
                else { assert!((d.delta + 0.5).abs() < 1e-9); }
            }
            if r.people_targets[0] == "A" { same += 1; }
        }
        assert!(same > 110, "same-subunit weight 2x, but A first only {same}/200");
    }

    #[test]
    fn leave_week_has_no_choice_and_fixed_recovery() {
        let mut p = payload("ball");
        p.on_leave = true;
        let r = calc_military_life_week(p);
        assert!((r.fatigue - (50.0 + 8.0 - 3.0 - 20.0)).abs() < 1e-9);
        assert!((r.ball_sense - (60.0 - 1.5 + 4.0)).abs() < 1e-9);
    }

    #[test]
    fn event_pick_is_weighted_and_seeded() {
        let a = calc_military_life_week(payload("rest"));
        assert!(a.event_index.is_none());
        let mut hits = [0usize; 3];
        let mut any = 0;
        for seed in 0..300u64 {
            let mut q = payload("rest");
            q.candidate_weights = vec![1.0, 0.0, 5.0];
            q.seed = seed;
            if let Some(i) = calc_military_life_week(q).event_index { hits[i] += 1; any += 1; }
        }
        assert_eq!(hits[1], 0, "zero weight never picked");
        assert!(hits[2] > hits[0] * 2, "weight 5 should beat 1 by far {hits:?}");
        assert!(any > 60 && any < 180, "about 40% per week {any}/300");
        let mk = || { let mut q = payload("rest"); q.candidate_weights = vec![1.0, 1.0]; q.seed = 42; q };
        assert_eq!(calc_military_life_week(mk()).event_index, calc_military_life_week(mk()).event_index);
    }
}
