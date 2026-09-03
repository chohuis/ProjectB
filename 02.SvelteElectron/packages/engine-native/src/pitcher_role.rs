//! 투수 보직 추천 — 세부 능력치 적합도 + 팀내 자리 경쟁 (PLAN_ROLE_RECOMMEND §2·§3 · 1.1 A①)
//!
//! 지금까지 보직은 팀내 OVR 순위 하나로 정했다(`player_engine::assign_highschool_position` ·
//! `assign_protagonist_role`). 이 모듈은 선발·중계·마무리 **적합도 셋**을 같은 0~100 척도로 내고,
//! 같은 팀 투수 전원을 같은 식으로 재서 **들어갈 수 있는 자리** 중 내 적합도가 가장 높은 곳을 추천한다.
//!
//! ⚠ **가중치·계수는 전부 규칙 파일(`generation_rules.json` `pitcherRoleRules`)에서 온다** — Rust 는 읽기만
//!   한다. 여기 숫자를 박지 않는다(코드에 표를 두 번 적지 말 것 · CLAUDE.md).
//! ⚠ 구종 정보가 없는 투수는 `arsenal` 항목을 빼고 **남은 가중치를 재정규화**한다 — 0 으로 넣으면 정보
//!   없는 동료가 통째로 밀려 경쟁이 거짓이 된다(§2).
//! ⚠ 자리 배정은 순서 의존을 없애려고 두 단계만 쓴다: ① `fit_cp` 최고 한 명이 마무리 → ② 나머지로
//!   `fit_sp` 순위(로테이션 수) → ③ 남으면 중계(불펜 수). 추천 = 들어갈 수 있는 자리 중 내 적합도 최고,
//!   하나도 없으면 세 적합도 중 최고(§8 ⑫ — "추천 없음" 화면은 안 만든다).
//! ⚠ 감독 관계 보정(`role_ovr_bias`)은 세 적합도에 **똑같이** 더한다 — 자리가 바뀌는 게 아니라 순위만 오른다.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 구종 하나 — TS 가 카탈로그의 `group`(fastball/breaking/offspeed/special)을 붙여 넘긴다
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchRef {
    pub grade: f64,
    #[serde(default)]
    pub group: String,
}

/// 투수 하나 — 없는 능력치는 None(재정규화 대상). `pitches` 가 None 이면 구종 항목을 뺀다
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RolePitcher {
    pub id: String,
    #[serde(default)]
    pub stamina: Option<f64>,
    #[serde(default)]
    pub velocity: Option<f64>,
    #[serde(default)]
    pub command: Option<f64>,
    #[serde(default)]
    pub control: Option<f64>,
    #[serde(default)]
    pub movement: Option<f64>,
    #[serde(default)]
    pub mentality: Option<f64>,
    #[serde(default)]
    pub recovery: Option<f64>,
    #[serde(default)]
    pub clutch: Option<f64>,
    #[serde(default)]
    pub hold_runners: Option<f64>,
    #[serde(default)]
    pub pitches: Option<Vec<PitchRef>>,
}

/// 역할 하나의 구종 점수 계수 (규칙 파일 `pitcherRoleRules.arsenal.<ROLE>`)
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ArsenalWeights {
    pub count: f64,
    pub count_cap: f64,
    pub grade_avg: f64,
    pub grade_best2: f64,
    pub grade_best: f64,
    pub groups: f64,
    /// 습득중(1등급) 구종을 몇 개로 세나 — 없으면 1.0(= 예전과 같다).
    ///
    /// 1등급은 아직 경기에서 못 쓰는 구종인데 `count` 가 1개로 세고 있었다. 값을 낮추면
    /// **구종 수** 항목만 줄고 등급 평균·계열 수는 그대로다 — 한 번에 한 축만 움직인다.
    pub developing_weight: Option<f64>,
}

/// 규칙 — `weights.<ROLE>` 은 능력치 이름 → 가중치 (`arsenal` 키 포함)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitcherRoleRules {
    pub weights: HashMap<String, HashMap<String, f64>>,
    pub arsenal: HashMap<String, ArsenalWeights>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendRoleParams {
    pub me: RolePitcher,
    /// 같은 팀 투수 (나 제외 · 활동 중 · 시즌아웃 제외는 TS 가 거른다)
    pub teammates: Vec<RolePitcher>,
    pub rules: PitcherRoleRules,
    /// 로테이션 자리 수 (`rosterOpsRules.rotationSize`)
    pub rotation_size: usize,
    /// 불펜 자리 수 (`rosterOpsRules.bullpenSize`)
    pub bullpen_size: usize,
    /// 마무리 자리 수 — 보통 1 · 고교 마무리 결정(§8 ⑤ 확정 · 둔다)도 1
    #[serde(default = "one")]
    pub closer_size: usize,
    /// 감독 관계 보정 (−6~+6) — 내 세 적합도에 똑같이 더한다
    #[serde(default)]
    pub role_ovr_bias: f64,
}
fn one() -> usize { 1 }

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoleFits {
    pub sp: f64,
    pub rp: f64,
    pub cp: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoleSeats {
    pub sp: usize,
    pub rp: usize,
    pub cp: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendRoleResult {
    /// "sp" | "rp" | "cp"
    pub recommended: String,
    /// 내 적합도 (관계 보정 포함 · 0~100 넘을 수 있음)
    pub fits: RoleFits,
    /// 그 자리 후보 안에서의 내 순위 (1 = 최고)
    pub ranks: RoleSeats,
    /// 자리 수
    pub seats: RoleSeats,
    /// 그 자리를 이미 차지한 사람 수 = min(rank−1, seats) — 문안의 `ahead`
    pub ahead: RoleSeats,
    /// 들어갈 자리가 하나도 없어 세 적합도 최고로 떨어뜨렸는가
    pub no_seat: bool,
}

// ── 구종 점수 ───────────────────────────────────────────────

fn arsenal_score(pitches: &[PitchRef], w: &ArsenalWeights) -> f64 {
    let n = pitches.len() as f64;
    if n == 0.0 { return 0.0; }
    let cap = w.count_cap.max(1.0);
    // 습득중(1등급)은 `developingWeight` 만큼만 센다 — 규칙 파일이 안 주면 1.0(예전 그대로)
    let dev = w.developing_weight.unwrap_or(1.0);
    let n_eff: f64 = pitches.iter().map(|p| if p.grade <= 1.0 { dev } else { 1.0 }).sum();
    let count = (n_eff.min(cap)) / cap;
    // ⚠ 등급 평균·최고는 **실제 구종 수**로 나눈다 — 세는 무게는 개수 항목에만 건다
    let g_avg = pitches.iter().map(|p| p.grade).sum::<f64>() / n / 5.0;
    let mut non_fb: Vec<f64> = pitches.iter().filter(|p| p.group != "fastball").map(|p| p.grade).collect();
    non_fb.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    let g_best = non_fb.first().copied().unwrap_or(0.0) / 5.0;
    let g_best2 = if non_fb.is_empty() { 0.0 } else {
        let k = non_fb.len().min(2);
        non_fb[..k].iter().sum::<f64>() / k as f64 / 5.0
    };
    let mut groups: Vec<&str> = pitches.iter().map(|p| p.group.as_str()).filter(|g| !g.is_empty()).collect();
    groups.sort_unstable();
    groups.dedup();
    let grp = (groups.len() as f64 / 3.0).min(1.0);
    let raw = w.count * count + w.grade_avg * g_avg + w.grade_best2 * g_best2 + w.grade_best * g_best + w.groups * grp;
    (raw.clamp(0.0, 1.0)) * 100.0
}

// ── 적합도 ─────────────────────────────────────────────────

fn stat_of(p: &RolePitcher, key: &str) -> Option<f64> {
    match key {
        "stamina" => p.stamina,
        "velocity" => p.velocity,
        "command" => p.command,
        "control" => p.control,
        "movement" => p.movement,
        "mentality" => p.mentality,
        "recovery" => p.recovery,
        "clutch" => p.clutch,
        "holdRunners" => p.hold_runners,
        _ => None,
    }
}

/// 한 역할의 적합도 — 없는 항목은 빼고 남은 가중치로 재정규화한다
pub fn fit_for(p: &RolePitcher, role: &str, rules: &PitcherRoleRules) -> f64 {
    let Some(w) = rules.weights.get(role) else { return 0.0 };
    let mut sum = 0.0;
    let mut wsum = 0.0;
    for (key, weight) in w {
        let v = if key == "arsenal" {
            match (&p.pitches, rules.arsenal.get(role)) {
                (Some(ps), Some(aw)) if !ps.is_empty() => Some(arsenal_score(ps, aw)),
                _ => None,
            }
        } else {
            stat_of(p, key)
        };
        if let Some(v) = v {
            sum += weight * v;
            wsum += weight;
        }
    }
    if wsum <= 0.0 { 0.0 } else { sum / wsum }
}

fn count_above(cands: &[(usize, f64)], mine: f64) -> usize {
    cands.iter().filter(|(_, f)| *f > mine).count()
}

pub fn recommend_pitcher_role(p: RecommendRoleParams) -> RecommendRoleResult {
    let rules = &p.rules;
    let my = RoleFits {
        sp: fit_for(&p.me, "SP", rules) + p.role_ovr_bias,
        rp: fit_for(&p.me, "RP", rules) + p.role_ovr_bias,
        cp: fit_for(&p.me, "CP", rules) + p.role_ovr_bias,
    };
    // 동료 적합도 (관계 보정 없음 — 관계는 주인공만 있다)
    let mates: Vec<(usize, RoleFits)> = p.teammates.iter().enumerate().map(|(i, t)| (i, RoleFits {
        sp: fit_for(t, "SP", rules), rp: fit_for(t, "RP", rules), cp: fit_for(t, "CP", rules),
    })).collect();

    // ① 마무리 — fit_cp 최고 closer_size 명 (나 포함 후보)
    let cp_cands: Vec<(usize, f64)> = mates.iter().map(|(i, f)| (*i, f.cp)).collect();
    let rank_cp = 1 + count_above(&cp_cands, my.cp);
    let mut closers: Vec<(usize, f64)> = cp_cands.clone();
    closers.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    // 내가 마무리 자리에 들면 동료 중 마무리로 빠지는 사람은 (closer_size−1)명
    let me_closer = rank_cp <= p.closer_size;
    let taken_cp: Vec<usize> = closers.iter().take(if me_closer { p.closer_size.saturating_sub(1) } else { p.closer_size })
        .map(|(i, _)| *i).collect();

    // ② 선발 — 마무리로 빠진 사람을 뺀 후보에서 fit_sp 순위
    let sp_cands: Vec<(usize, f64)> = mates.iter().filter(|(i, _)| !taken_cp.contains(i)).map(|(i, f)| (*i, f.sp)).collect();
    let rank_sp = 1 + count_above(&sp_cands, my.sp);
    let me_starter = !me_closer && rank_sp <= p.rotation_size;
    let mut starters: Vec<(usize, f64)> = sp_cands.clone();
    starters.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let taken_sp: Vec<usize> = starters.iter().take(if me_starter { p.rotation_size.saturating_sub(1) } else { p.rotation_size })
        .map(|(i, _)| *i).collect();

    // ③ 중계 — 남은 사람이 불펜 자리를 겨룬다
    let rp_cands: Vec<(usize, f64)> = mates.iter()
        .filter(|(i, _)| !taken_cp.contains(i) && !taken_sp.contains(i))
        .map(|(i, f)| (*i, f.rp)).collect();
    let rank_rp = 1 + count_above(&rp_cands, my.rp);

    let seats = RoleSeats { sp: p.rotation_size, rp: p.bullpen_size, cp: p.closer_size };
    let ranks = RoleSeats { sp: rank_sp, rp: rank_rp, cp: rank_cp };
    let ahead = RoleSeats {
        sp: (rank_sp - 1).min(seats.sp),
        rp: (rank_rp - 1).min(seats.rp),
        cp: (rank_cp - 1).min(seats.cp),
    };

    // 들어갈 수 있는 자리 중 내 적합도 최고
    let mut open: Vec<(&str, f64)> = Vec::new();
    if rank_cp <= seats.cp { open.push(("cp", my.cp)); }
    if rank_sp <= seats.sp { open.push(("sp", my.sp)); }
    if rank_rp <= seats.rp { open.push(("rp", my.rp)); }
    let no_seat = open.is_empty();
    if no_seat {
        open = vec![("sp", my.sp), ("rp", my.rp), ("cp", my.cp)];
    }
    // 동점이면 sp > rp > cp 순으로 앞의 것 (안정 정렬 · 결정성)
    let order = |r: &str| match r { "sp" => 0, "rp" => 1, _ => 2 };
    open.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(order(a.0).cmp(&order(b.0))));
    let recommended = open[0].0.to_string();

    RecommendRoleResult { recommended, fits: my, ranks, seats, ahead, no_seat }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> PitcherRoleRules {
        // PLAN_ROLE_RECOMMEND §2 제안값과 같은 모양 — 검사용
        let mut weights = HashMap::new();
        weights.insert("SP".into(), HashMap::from([
            ("stamina".to_string(), 0.28), ("control".into(), 0.18), ("command".into(), 0.14), ("arsenal".into(), 0.20),
            ("velocity".into(), 0.10), ("recovery".into(), 0.06), ("movement".into(), 0.04)]));
        weights.insert("RP".into(), HashMap::from([
            ("velocity".to_string(), 0.30), ("movement".into(), 0.24), ("command".into(), 0.14), ("control".into(), 0.10),
            ("clutch".into(), 0.10), ("arsenal".into(), 0.07), ("stamina".into(), 0.05)]));
        weights.insert("CP".into(), HashMap::from([
            ("velocity".to_string(), 0.26), ("mentality".into(), 0.22), ("clutch".into(), 0.20), ("control".into(), 0.15),
            ("movement".into(), 0.09), ("arsenal".into(), 0.05), ("holdRunners".into(), 0.03)]));
        let mut arsenal = HashMap::new();
        arsenal.insert("SP".into(), ArsenalWeights { count: 0.40, count_cap: 5.0, grade_avg: 0.35, groups: 0.25, ..Default::default() });
        arsenal.insert("RP".into(), ArsenalWeights { count: 0.20, count_cap: 4.0, grade_best2: 0.60, groups: 0.20, ..Default::default() });
        arsenal.insert("CP".into(), ArsenalWeights { count: 0.15, count_cap: 3.0, grade_best: 0.70, groups: 0.15, ..Default::default() });
        PitcherRoleRules { weights, arsenal }
    }

    fn pitcher(id: &str, all: f64) -> RolePitcher {
        RolePitcher {
            id: id.into(), stamina: Some(all), velocity: Some(all), command: Some(all), control: Some(all),
            movement: Some(all), mentality: Some(all), recovery: Some(all), clutch: Some(all), hold_runners: Some(all),
            pitches: Some(vec![
                PitchRef { grade: 3.0, group: "fastball".into() },
                PitchRef { grade: 3.0, group: "breaking".into() },
            ]),
        }
    }

    fn params(me: RolePitcher, mates: Vec<RolePitcher>) -> RecommendRoleParams {
        RecommendRoleParams { me, teammates: mates, rules: rules(), rotation_size: 3, bullpen_size: 4, closer_size: 1, role_ovr_bias: 0.0 }
    }

    #[test]
    fn 균일한_능력치면_세_적합도가_같고_구종만_가른다() {
        let p = pitcher("me", 60.0);
        let r = rules();
        // 능력치 전부 60 · 구종 2개(3등급) — 적합도는 60 근처, 역할 간 차이는 구종 항목뿐
        let sp = fit_for(&p, "SP", &r);
        let rp = fit_for(&p, "RP", &r);
        let cp = fit_for(&p, "CP", &r);
        assert!((sp - 60.0).abs() < 8.0 && (rp - 60.0).abs() < 8.0 && (cp - 60.0).abs() < 8.0, "{sp} {rp} {cp}");
    }

    #[test]
    fn 구종이_없으면_재정규화해서_0으로_안_떨어진다() {
        let mut p = pitcher("me", 60.0);
        p.pitches = None;
        let r = rules();
        let sp = fit_for(&p, "SP", &r);
        assert!((sp - 60.0).abs() < 0.01, "arsenal 을 빼고 재정규화하면 정확히 60 이어야 한다: {sp}");
    }

    #[test]
    fn 스태미나가_높으면_선발_추천() {
        let mut me = pitcher("me", 55.0);
        me.stamina = Some(85.0);
        me.control = Some(70.0);
        let mates = (0..8).map(|i| pitcher(&format!("m{i}"), 50.0)).collect();
        let res = recommend_pitcher_role(params(me, mates));
        assert_eq!(res.recommended, "sp");
        assert_eq!(res.ranks.sp, 1);
        assert_eq!(res.ahead.sp, 0);
        assert!(!res.no_seat);
    }

    #[test]
    fn 구위와_멘탈이_높으면_마무리가_열린다() {
        let mut me = pitcher("me", 55.0);
        me.velocity = Some(90.0);
        me.mentality = Some(90.0);
        me.clutch = Some(85.0);
        me.stamina = Some(30.0);
        let mates = (0..8).map(|i| pitcher(&format!("m{i}"), 55.0)).collect();
        let res = recommend_pitcher_role(params(me, mates));
        assert_eq!(res.ranks.cp, 1);
        assert_eq!(res.recommended, "cp", "{:?}", res.fits);
    }

    #[test]
    fn 전부_밀리면_자리_없음_표시와_적합도_최고_추천() {
        let me = pitcher("me", 40.0);
        // 동료 9명이 전부 더 낫다 — 자리 합 = 3 + 4 + 1 = 8 < 9
        let mates = (0..9).map(|i| pitcher(&format!("m{i}"), 70.0)).collect();
        let res = recommend_pitcher_role(params(me, mates));
        assert!(res.no_seat);
        assert_eq!(res.ahead.sp, 3);
        assert_eq!(res.ahead.rp, 4);
        assert_eq!(res.ahead.cp, 1);
        assert!(["sp", "rp", "cp"].contains(&res.recommended.as_str()));
    }

    #[test]
    fn 관계_보정은_세_적합도에_똑같이_더해_자리를_안_바꾼다() {
        let me = pitcher("me", 60.0);
        let mates: Vec<RolePitcher> = (0..8).map(|i| pitcher(&format!("m{i}"), 60.0)).collect();
        let base = recommend_pitcher_role(params(me.clone(), mates.clone()));
        let mut biased = params(me, mates);
        biased.role_ovr_bias = 6.0;
        let b = recommend_pitcher_role(biased);
        assert_eq!(base.recommended, b.recommended);
        assert!((b.fits.sp - base.fits.sp - 6.0).abs() < 1e-9);
        assert!((b.fits.cp - base.fits.cp - 6.0).abs() < 1e-9);
        // 동점 동료보다 앞선다 — 순위가 오른다
        assert!(b.ranks.sp <= base.ranks.sp);
    }

    #[test]
    fn 습득중_구종_무게는_개수_항목만_민다() {
        // 1등급 하나 + 3등급 하나. developingWeight 0.5 면 개수만 2 → 1.5 로 줄고 등급 평균은 그대로다.
        let pitches = vec![
            PitchRef { grade: 1.0, group: "fastball".into() },
            PitchRef { grade: 3.0, group: "breaking".into() },
        ];
        let w1 = ArsenalWeights { count: 0.40, count_cap: 5.0, grade_avg: 0.35, groups: 0.25, ..Default::default() };
        let mut w05 = w1.clone();
        w05.developing_weight = Some(0.5);
        let a1 = arsenal_score(&pitches, &w1);
        let a05 = arsenal_score(&pitches, &w05);
        // 개수 항목만 0.40 × (2−1.5)/5 = 0.04 → 4점 준다
        assert!((a1 - a05 - 4.0).abs() < 1e-6, "{a1} {a05}");
        // 값이 없으면 예전과 같다 — 기본은 안 바뀐다
        assert!((arsenal_score(&pitches, &ArsenalWeights { developing_weight: None, ..w1.clone() }) - a1).abs() < 1e-9);
        // 1등급이 하나도 없으면 무게가 아무 일도 안 한다
        let grown = vec![
            PitchRef { grade: 2.0, group: "fastball".into() },
            PitchRef { grade: 3.0, group: "breaking".into() },
        ];
        assert!((arsenal_score(&grown, &w1) - arsenal_score(&grown, &w05)).abs() < 1e-9);
    }

    #[test]
    fn 마무리로_빠진_동료는_선발_경쟁에서_빠진다() {
        // 동료 하나가 마무리 적합도·선발 적합도 둘 다 최고 — 마무리로 빠지면 내 선발 순위가 하나 오른다
        let mut ace = pitcher("ace", 80.0);
        ace.mentality = Some(99.0);
        ace.clutch = Some(99.0);
        let me = pitcher("me", 60.0);
        let mut mates = vec![ace];
        mates.extend((0..6).map(|i| pitcher(&format!("m{i}"), 50.0)));
        let res = recommend_pitcher_role(params(me, mates));
        assert_eq!(res.ranks.cp, 2);
        assert_eq!(res.ranks.sp, 1, "{:?}", res);
    }
}
