// FA — 등급·보상선수·시장 (Phase 7-4)
//
// **보상선수가 실제로 움직인다** (사용자 확정 2026-07-31: KBO식 A/B/C 등급).
// 등급은 리그 연봉 순위 백분위로 정하고, A/B는 보호선수 밖에서 한 명 + 보상금,
// C는 보상금만 간다.
//
// FA 자격 연수는 **규칙 파일이 정본**이다. 예전엔 TS `FA_THRESHOLD`와
// Rust `fa_eligibility_years`에 각각 있었다 — 값이 같아도 정본이 둘이면
// 언젠가 갈라진다 (이 프로젝트에서 그 부류로만 결함이 열 번 나왔다).

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::npc_sim::LcgRand;

// ── 규칙 (generation_rules.json faRules) ────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaGrade {
    pub grade: String,
    /// 연봉 순위 백분위가 이 값 **이하**면 이 등급 (0 = 최고연봉)
    pub until_percent: f64,
    /// 원소속이 지정하는 보호선수 수. 0이면 보상선수 없음
    pub protected_count: usize,
    /// 보상금 = 직전 연봉 × 이 %
    pub money_pct: f64,
}

/// 방출 2단계 규칙 (faRules.release)
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseRules {
    /// 이 점수 이상이면 방출 후보
    pub score_threshold: f64,
    /// 한 시즌에 한 팀이 방출할 수 있는 최대 인원.
    /// 없으면 성적 나쁜 해에 팀이 통째로 갈린다
    pub max_per_team: usize,
    /// 구단주 관계 1점당 방출 점수 감산폭. **주인공에게만 쓰인다**
    #[serde(default)]
    pub owner_relation_weight: f64,
}

impl Default for ReleaseRules {
    fn default() -> Self {
        Self { score_threshold: 55.0, max_per_team: 3, owner_relation_weight: 0.4 }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaRules {
    pub eligible_years: HashMap<String, i32>,
    pub grades: Vec<FaGrade>,
    #[serde(default)]
    pub release: Option<ReleaseRules>,
}

impl FaRules {
    pub fn eligible_years_of(&self, league_id: &str) -> i32 {
        self.eligible_years.get(league_id)
            .or_else(|| self.eligible_years.get("default"))
            .copied()
            .unwrap_or(9)
    }

    /// 연봉 백분위(0 = 최고연봉) → 등급
    pub fn grade_of(&self, salary_percentile: f64) -> Option<&FaGrade> {
        self.grades.iter().find(|g| salary_percentile <= g.until_percent)
            .or_else(|| self.grades.last())
    }
}

// ── 시장 ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaPlayer {
    pub npc_id: String,
    pub name: String,
    /// 직전 소속. 보상선수는 여기로 간다
    pub from_team_id: String,
    pub position: String,
    pub ovr: f64,
    pub age: i32,
    pub salary: i64,
    #[serde(default)]
    pub form: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaTeam {
    pub team_id: String,
    /// 팀 예산 지수 (팀 예산 / 리그 평균) — 로스터 연봉과 같은 입력
    #[serde(default = "one")]
    pub budget_index: f64,
    #[serde(default)]
    pub win_now_pressure: f64,
    /// 1군에 받을 수 있는 인원. 0이면 영입 못 한다
    #[serde(default)]
    pub open_slots: i32,
    /// 보상선수 후보 (OVR 내림차순일 필요는 없다).
    ///
    /// ⚠ **팀 전체 로스터가 아니다.** 정원은 `open_slots`가 따로 받는다.
    /// 호출측이 보상 대상이 아닌 사람(외국인)을 빼고 넘긴다 — 여기 다 넣으면
    /// 보호선수 다음 순위가 거의 항상 용병이라 매 FA마다 한 명씩 팀을 옮긴다
    #[serde(default)]
    pub roster: Vec<FaRosterEntry>,
}

fn one() -> f64 { 1.0 }

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaRosterEntry {
    pub npc_id: String,
    pub ovr: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaMarketParams {
    pub players: Vec<FaPlayer>,
    pub teams: Vec<FaTeam>,
    pub rules: FaRules,
    /// 리그 전체 연봉 — 등급 백분위의 분모다
    #[serde(default)]
    pub league_salaries: Vec<i64>,
    pub season_year: i32,
    pub world_seed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaSigning {
    pub npc_id: String,
    pub name: String,
    pub from_team_id: String,
    pub to_team_id: String,
    pub grade: String,
    pub salary: i64,
    pub years: i32,
    /// 원소속으로 가는 보상선수. 없으면 None (C등급 또는 보호선수뿐)
    pub compensation_npc_id: Option<String>,
    pub compensation_money: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaMarketResult {
    pub signings: Vec<FaSigning>,
    /// 계약 못 한 선수 — 진로 배정(독립·은퇴)으로 넘어간다
    pub unsigned: Vec<String>,
}

fn rating(p: &FaPlayer) -> f64 { p.ovr + p.form * 8.0 }

/// 연봉 백분위 0(최고) ~ 100(최저)
fn salary_percentile(salary: i64, sorted_desc: &[i64]) -> f64 {
    if sorted_desc.is_empty() { return 50.0; }
    let better = sorted_desc.iter().filter(|s| **s > salary).count();
    (better as f64 / sorted_desc.len() as f64) * 100.0
}

/// FA 시장을 한 번에 정산한다.
///
/// 좋은 선수부터 팀을 고르고, 계약이 성사되면 그 팀의 자리가 하나 줄어든다 —
/// **순차 처리라 상위 FA가 먼저 자리를 가져간다.** 실제 FA 시장과 같다.
pub fn resolve_market(params: FaMarketParams) -> FaMarketResult {
    let mut sorted_salaries = params.league_salaries.clone();
    sorted_salaries.sort_unstable_by(|a, b| b.cmp(a));

    let mut teams: HashMap<String, FaTeam> = params.teams.into_iter()
        .map(|t| (t.team_id.clone(), t)).collect();

    let mut players = params.players;
    players.sort_by(|a, b| rating(b).partial_cmp(&rating(a)).unwrap_or(std::cmp::Ordering::Equal));

    let mut rng = LcgRand::new(params.world_seed ^ (params.season_year as u32).wrapping_mul(31));
    let mut signings = Vec::new();
    let mut unsigned = Vec::new();
    // 보상선수로 이미 빠져나간 사람은 다시 뽑히면 안 된다
    let mut taken_as_compensation: HashSet<String> = HashSet::new();

    for p in &players {
        // 입찰: 자리가 있는 팀만. 예산·성적 압박이 높을수록 세게 부른다
        let mut best: Option<(String, f64)> = None;
        for t in teams.values() {
            if t.open_slots <= 0 { continue; }
            // 원소속도 경쟁에 낀다 (재계약) — 다만 보상 부담이 없어 유리하다
            let home_bonus = if t.team_id == p.from_team_id { 0.15 } else { 0.0 };
            let bid = t.budget_index * (1.0 + t.win_now_pressure / 200.0)
                * (0.85 + rng.next() * 0.3) + home_bonus;
            if best.as_ref().map_or(true, |(_, b)| bid > *b) {
                best = Some((t.team_id.clone(), bid));
            }
        }

        let Some((to_team, bid)) = best else {
            unsigned.push(p.npc_id.clone());
            continue;
        };

        let pct = salary_percentile(p.salary, &sorted_salaries);
        let grade = params.rules.grade_of(pct).cloned()
            .unwrap_or(FaGrade { grade: "C".into(), until_percent: 100.0, protected_count: 0, money_pct: 0.0 });

        // 계약: 입찰 세기와 등급이 연봉을 정한다. 나이가 많으면 연수가 짧다
        let salary = ((p.salary as f64) * (0.9 + bid * 0.35)).round() as i64;
        let years = if p.age >= 34 { 1 } else if p.age >= 31 { 2 } else { 3 };

        // 보상 — **원소속을 떠날 때만.** 재계약이면 보상이 없다
        let (comp_id, comp_money) = if to_team == p.from_team_id {
            (None, 0)
        } else {
            let money = ((p.salary as f64) * grade.money_pct / 100.0).round() as i64;
            let picked = if grade.protected_count == 0 { None } else {
                teams.get(&to_team).and_then(|t| {
                    let mut roster: Vec<&FaRosterEntry> = t.roster.iter()
                        .filter(|r| !taken_as_compensation.contains(&r.npc_id))
                        .collect();
                    roster.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap_or(std::cmp::Ordering::Equal));
                    // 보호선수 밖에서 제일 나은 선수를 데려간다
                    roster.get(grade.protected_count).map(|r| r.npc_id.clone())
                })
            };
            if let Some(id) = &picked { taken_as_compensation.insert(id.clone()); }
            (picked, money)
        };

        if let Some(t) = teams.get_mut(&to_team) { t.open_slots -= 1; }
        // 보상선수가 빠진 팀은 자리가 하나 생긴다
        if comp_id.is_some() {
            if let Some(t) = teams.get_mut(&p.from_team_id) { t.open_slots += 1; }
        }

        signings.push(FaSigning {
            npc_id: p.npc_id.clone(), name: p.name.clone(),
            from_team_id: p.from_team_id.clone(), to_team_id: to_team,
            grade: grade.grade.clone(), salary, years,
            compensation_npc_id: comp_id, compensation_money: comp_money,
        });
    }

    FaMarketResult { signings, unsigned }
}

// ── 테스트 ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> FaRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        serde_json::from_value(v["faRules"].clone()).expect("faRules 파싱 실패")
    }

    fn player(id: &str, from: &str, ovr: f64, salary: i64, age: i32) -> FaPlayer {
        FaPlayer {
            npc_id: id.into(), name: id.into(), from_team_id: from.into(),
            position: "SP".into(), ovr, age, salary, form: 0.0,
        }
    }
    fn team(id: &str, slots: i32, roster_n: usize) -> FaTeam {
        FaTeam {
            team_id: id.into(), budget_index: 1.0, win_now_pressure: 50.0, open_slots: slots,
            roster: (0..roster_n).map(|i| FaRosterEntry {
                npc_id: format!("{id}_R{i}"), ovr: 80.0 - i as f64,
            }).collect(),
        }
    }

    #[test]
    fn 자격_연수가_규칙_파일에서_온다() {
        let r = rules();
        assert!(r.eligible_years_of("LEAGUE_KBL") > 0);
        // 모르는 리그는 default로 떨어져야 한다 — 0이면 전원 FA가 된다
        assert!(r.eligible_years_of("LEAGUE_UNKNOWN") > 0);
    }

    #[test]
    fn 등급이_연봉_순위로_갈린다() {
        let r = rules();
        let top = r.grade_of(0.0).unwrap().grade.clone();
        let bottom = r.grade_of(100.0).unwrap().grade.clone();
        assert_ne!(top, bottom, "최고연봉과 최저연봉이 같은 등급이다");
    }

    #[test]
    fn 등급_구간에_구멍이_없다() {
        let r = rules();
        for pct in 0..=100 {
            assert!(r.grade_of(pct as f64).is_some(), "{pct}% 에 해당하는 등급이 없다");
        }
        // untilPercent가 오름차순이어야 앞 등급이 뒤를 가리지 않는다
        for w in r.grades.windows(2) {
            assert!(w[0].until_percent < w[1].until_percent,
                "등급 구간이 뒤집혔다: {:?}", r.grades.iter().map(|g| g.until_percent).collect::<Vec<_>>());
        }
    }

    #[test]
    fn 재계약이면_보상이_없다() {
        let r = rules();
        // 자리가 원소속에만 있으면 반드시 재계약된다
        let res = resolve_market(FaMarketParams {
            players: vec![player("FA1", "TEAM_A", 80.0, 30000, 28)],
            teams: vec![team("TEAM_A", 1, 30)],
            rules: r, league_salaries: vec![50000, 30000, 10000],
            season_year: 2030, world_seed: 1,
        });
        assert_eq!(res.signings.len(), 1);
        let s = &res.signings[0];
        assert_eq!(s.to_team_id, "TEAM_A");
        assert!(s.compensation_npc_id.is_none() && s.compensation_money == 0,
            "재계약인데 보상이 나갔다");
    }

    #[test]
    fn 상위_등급은_보상선수가_실제로_간다() {
        let r = rules();
        // 최고연봉 = A등급. 원소속에 자리가 없으면 다른 팀으로 간다
        let res = resolve_market(FaMarketParams {
            players: vec![player("FA1", "TEAM_A", 90.0, 100000, 27)],
            teams: vec![team("TEAM_A", 0, 30), team("TEAM_B", 1, 30)],
            rules: r, league_salaries: vec![100000, 50000, 30000, 10000],
            season_year: 2030, world_seed: 7,
        });
        let s = &res.signings[0];
        assert_eq!(s.to_team_id, "TEAM_B");
        assert!(s.compensation_npc_id.is_some(), "{}등급인데 보상선수가 없다", s.grade);
        assert!(s.compensation_money > 0);
    }

    #[test]
    fn 보상선수는_보호명단_밖에서_나온다() {
        let r = rules();
        let grade_a = r.grades.iter().find(|g| g.protected_count > 0).unwrap().clone();
        let res = resolve_market(FaMarketParams {
            players: vec![player("FA1", "TEAM_A", 90.0, 100000, 27)],
            teams: vec![team("TEAM_A", 0, 30), team("TEAM_B", 1, 30)],
            rules: r, league_salaries: vec![100000, 10000],
            season_year: 2030, world_seed: 7,
        });
        let comp = res.signings[0].compensation_npc_id.clone().unwrap();
        // 로스터가 OVR 내림차순이라 보호 인원만큼 건너뛴 자리가 와야 한다
        assert_eq!(comp, format!("TEAM_B_R{}", grade_a.protected_count));
    }

    #[test]
    fn 자리가_없으면_미계약이다() {
        let r = rules();
        let res = resolve_market(FaMarketParams {
            players: vec![player("FA1", "TEAM_A", 90.0, 50000, 27)],
            teams: vec![team("TEAM_A", 0, 30)],
            rules: r, league_salaries: vec![50000],
            season_year: 2030, world_seed: 1,
        });
        assert!(res.signings.is_empty());
        assert_eq!(res.unsigned, vec!["FA1".to_string()]);
    }

    #[test]
    fn 같은_선수가_두_번_보상으로_가지_않는다() {
        let r = rules();
        let res = resolve_market(FaMarketParams {
            players: vec![
                player("FA1", "TEAM_A", 92.0, 100000, 27),
                player("FA2", "TEAM_C", 91.0, 99000, 27),
            ],
            teams: vec![team("TEAM_A", 0, 30), team("TEAM_B", 2, 30), team("TEAM_C", 0, 30)],
            rules: r, league_salaries: vec![100000, 99000, 10000],
            season_year: 2030, world_seed: 3,
        });
        let comps: Vec<String> = res.signings.iter()
            .filter_map(|s| s.compensation_npc_id.clone()).collect();
        let uniq: HashSet<&String> = comps.iter().collect();
        assert_eq!(uniq.len(), comps.len(), "같은 선수가 두 번 보상으로 갔다: {comps:?}");
    }

    #[test]
    fn 나이가_많으면_계약이_짧다() {
        let r = rules();
        let mk = |age: i32| {
            resolve_market(FaMarketParams {
                players: vec![player("FA1", "TEAM_A", 80.0, 30000, age)],
                teams: vec![team("TEAM_A", 1, 30)],
                rules: r.clone(), league_salaries: vec![30000],
                season_year: 2030, world_seed: 1,
            }).signings[0].years
        };
        assert!(mk(36) < mk(27), "36세 {} vs 27세 {}", mk(36), mk(27));
    }
}
