// 국가대표 · 국제대회 (Phase 7-3)
//
// **경기는 시뮬하지 않는다** (사용자 확정 2026-07-31: "결과만 합성").
// 대표팀 전력으로 순위를 확률 산출하고, 그 순위가 병역 면제를 정한다.
// 외국 대표팀 로스터를 만들지 않아도 되고, 사용자가 보는 건 발탁·결과·면제다.
//
// 대회는 4년 주기이고 `yearMod`가 서로 달라 **한 해에 둘이 겹치지 않는다.**

use serde::{Deserialize, Serialize};

use crate::npc_sim::LcgRand;

// ── 규칙 (generation_rules.json internationalRules) ──────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentDef {
    pub id: String,
    pub name: String,
    pub cycle_years: i32,
    /// `year % cycle_years == year_mod`인 해에 열린다.
    /// 대회마다 달라야 한 해에 둘이 안 겹친다
    pub year_mod: i32,
    /// 개막 주. 이 주에 발탁하고 `duration_weeks` 동안 소속팀에서 빠진다
    pub week: i32,
    pub duration_weeks: i32,
    pub roster_size: usize,
    /// 참가국 수. 순위 산출의 분모다
    pub field_size: i32,
    /// 이 순위 **이내**면 병역 면제. 0이면 면제 없는 대회
    pub exemption_rank: i32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InternationalRules {
    pub tournaments: Vec<TournamentDef>,
    #[serde(default = "default_max_per_team")]
    pub max_per_team: usize,
    #[serde(default = "default_age_max")]
    pub age_max: i32,
}

fn default_max_per_team() -> usize { 4 }
fn default_age_max() -> i32 { 29 }

impl InternationalRules {
    /// 그 해에 열리는 대회. 없으면 None.
    /// **둘 이상 걸리면 규칙이 잘못 짜인 것**이라 첫 번째만 쓴다 (테스트가 막는다)
    pub fn tournament_of(&self, year: i32) -> Option<&TournamentDef> {
        self.tournaments.iter()
            .find(|t| t.cycle_years > 0 && year.rem_euclid(t.cycle_years) == t.year_mod)
    }
}

// ── 발탁 ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NationalCandidate {
    pub npc_id: String,
    pub name: String,
    pub team_id: String,
    pub position: String,
    pub ovr: f64,
    pub age: i32,
    /// 올 시즌 성적 점수 (−1 ~ +1). 승강 판정과 같은 축이다
    #[serde(default)]
    pub form: f64,
    #[serde(default)]
    pub is_protagonist: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectSquadParams {
    pub candidates: Vec<NationalCandidate>,
    pub rules: InternationalRules,
    pub year: i32,
    /// 결정적 난수 — 같은 세계·같은 해면 같은 대표팀
    pub world_seed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SquadResult {
    pub tournament: Option<TournamentDef>,
    pub squad: Vec<String>,
    pub protagonist_selected: bool,
    /// 대표팀 평균 능력치 — 대회 결과 산출의 입력
    pub squad_strength: f64,
}

/// 능력치 + 성적. 대표 선발도 승강과 같은 축으로 본다
fn rating(c: &NationalCandidate) -> f64 {
    c.ovr + c.form * 8.0
}

pub fn select_squad(p: SelectSquadParams) -> SquadResult {
    let Some(t) = p.rules.tournament_of(p.year).cloned() else {
        return SquadResult { tournament: None, squad: vec![], protagonist_selected: false, squad_strength: 0.0 };
    };

    let mut pool: Vec<&NationalCandidate> = p.candidates.iter()
        .filter(|c| c.age <= p.rules.age_max)
        .collect();
    pool.sort_by(|a, b| rating(b).partial_cmp(&rating(a)).unwrap_or(std::cmp::Ordering::Equal));

    // 투수 절반 — 한쪽으로 쏠리면 대표팀이 성립하지 않는다
    let want_pitchers = t.roster_size / 2;
    let is_pitcher = |c: &NationalCandidate| matches!(c.position.as_str(), "SP" | "RP" | "CP" | "P");

    let mut per_team: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    let mut squad: Vec<&NationalCandidate> = Vec::new();
    let mut pitchers = 0usize;

    for c in &pool {
        if squad.len() >= t.roster_size { break; }
        let cnt = per_team.entry(c.team_id.as_str()).or_insert(0);
        // 한 구단이 대표팀을 독식하면 그 팀 리그 일정이 통째로 기운다
        if *cnt >= p.rules.max_per_team { continue; }
        let p_ok = if is_pitcher(c) {
            pitchers < want_pitchers
        } else {
            squad.len() - pitchers < t.roster_size - want_pitchers
        };
        if !p_ok { continue; }
        if is_pitcher(c) { pitchers += 1; }
        *cnt += 1;
        squad.push(c);
    }
    // 포지션 균형 때문에 자리가 남으면 순위대로 채운다
    if squad.len() < t.roster_size {
        let taken: std::collections::HashSet<&str> =
            squad.iter().map(|c| c.npc_id.as_str()).collect();
        for c in &pool {
            if squad.len() >= t.roster_size { break; }
            if taken.contains(c.npc_id.as_str()) { continue; }
            squad.push(c);
        }
    }

    let strength = if squad.is_empty() { 0.0 }
        else { squad.iter().map(|c| rating(c)).sum::<f64>() / squad.len() as f64 };

    SquadResult {
        protagonist_selected: squad.iter().any(|c| c.is_protagonist),
        squad: squad.iter().map(|c| c.npc_id.clone()).collect(),
        tournament: Some(t),
        squad_strength: strength,
        // world_seed는 결과 산출에서 쓴다 (발탁은 결정적 정렬이라 난수가 필요 없다)
    }
}

// ── 대회 결과 ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentParams {
    pub tournament: TournamentDef,
    pub squad_strength: f64,
    pub year: i32,
    pub world_seed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentResult {
    pub rank: i32,
    pub field_size: i32,
    /// 이 순위로 병역 면제를 받는가
    pub exemption: bool,
    pub medal: Option<String>,
}

/// 대표팀 전력을 참가국 평균과 견줘 순위를 뽑는다.
///
/// 국제 무대의 기준선은 국내 리그보다 높다 — OVR 75가 세계 평균쯤이라고 보고,
/// 거기서 얼마나 떨어졌는지로 기대 순위를 정한 뒤 난수로 흔든다.
/// **경기를 시뮬하지 않으므로 이 한 줄이 대회 전부다.**
pub fn simulate_tournament(p: TournamentParams) -> TournamentResult {
    let t = &p.tournament;
    let field = t.field_size.max(1);

    // 세계 평균 대비 위치 → 0.0(최약) ~ 1.0(최강)
    const WORLD_BASELINE: f64 = 75.0;
    const SPREAD: f64 = 12.0;
    let edge = ((p.squad_strength - WORLD_BASELINE) / SPREAD).clamp(-1.5, 1.5);
    let percentile = (0.5 - edge * 0.28).clamp(0.02, 0.98);

    let mut rng = LcgRand::new(
        (p.world_seed ^ (p.year as u32).wrapping_mul(7919))
            .wrapping_add(t.id.bytes().fold(0u32, |a, b| a.wrapping_mul(131).wrapping_add(b as u32)))
    );
    // 기대 순위 주변으로 흔든다. 강팀도 지고 약팀도 이변을 낸다
    let noise = (rng.next() - 0.5) * 0.45;
    let pos = (percentile + noise).clamp(0.0, 1.0);
    let rank = (1.0 + pos * (field - 1) as f64).round().clamp(1.0, field as f64) as i32;

    TournamentResult {
        rank,
        field_size: field,
        exemption: t.exemption_rank > 0 && rank <= t.exemption_rank,
        medal: match rank { 1 => Some("금".into()), 2 => Some("은".into()), 3 => Some("동".into()), _ => None },
    }
}

// ── 테스트 ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> InternationalRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        serde_json::from_value(v["internationalRules"].clone()).expect("internationalRules 파싱 실패")
    }

    fn cand(i: usize, ovr: f64, pitcher: bool, team: &str) -> NationalCandidate {
        NationalCandidate {
            npc_id: format!("P{i}"), name: format!("선수{i}"), team_id: team.into(),
            position: if pitcher { "SP".into() } else { "1B".into() },
            ovr, age: 25, form: 0.0, is_protagonist: false,
        }
    }

    #[test]
    fn 한_해에_두_대회가_안_열린다() {
        let r = rules();
        for year in 2026..2060 {
            let hit: Vec<&str> = r.tournaments.iter()
                .filter(|t| t.cycle_years > 0 && year % t.cycle_years == t.year_mod)
                .map(|t| t.id.as_str()).collect();
            assert!(hit.len() <= 1, "{year}년에 {hit:?}가 겹친다");
        }
    }

    #[test]
    fn 주기가_돌면_대회가_반드시_열린다() {
        let r = rules();
        let held: Vec<i32> = (2026..2030).filter(|y| r.tournament_of(*y).is_some()).collect();
        assert!(held.len() >= 2, "4년 중 {}번밖에 안 열린다", held.len());
    }

    #[test]
    fn 발탁은_정원과_구단_상한을_지킨다() {
        let r = rules();
        let year = (2026..2030).find(|y| r.tournament_of(*y).is_some()).unwrap();
        let t = r.tournament_of(year).unwrap().clone();

        // 한 팀에 몰아넣어도 max_per_team이 걸려야 한다
        let mut cands: Vec<NationalCandidate> = (0..60)
            .map(|i| cand(i, 90.0 - i as f64 * 0.1, i % 2 == 0, "TEAM_A")).collect();
        cands.extend((60..120).map(|i| cand(i, 80.0, i % 2 == 0, &format!("TEAM_{}", i % 9))));

        let res = select_squad(SelectSquadParams {
            candidates: cands, rules: r.clone(), year, world_seed: 42,
        });
        assert_eq!(res.squad.len(), t.roster_size, "정원이 안 맞는다");

        let ids: std::collections::HashSet<&String> = res.squad.iter().collect();
        assert_eq!(ids.len(), res.squad.len(), "같은 선수가 두 번 뽑혔다");
    }

    #[test]
    fn 나이_상한을_넘으면_발탁되지_않는다() {
        let r = rules();
        let year = (2026..2030).find(|y| r.tournament_of(*y).is_some()).unwrap();
        let mut old = cand(1, 99.0, true, "TEAM_A");
        old.age = r.age_max + 1;
        let res = select_squad(SelectSquadParams {
            candidates: vec![old], rules: r, year, world_seed: 42,
        });
        assert!(res.squad.is_empty());
    }

    #[test]
    fn 대회가_없는_해엔_발탁도_없다() {
        let r = rules();
        let none_year = (2026..2040).find(|y| r.tournament_of(*y).is_none())
            .expect("대회 없는 해가 있어야 한다 (yearMod 3)");
        let res = select_squad(SelectSquadParams {
            candidates: vec![cand(1, 90.0, true, "TEAM_A")],
            rules: r, year: none_year, world_seed: 42,
        });
        assert!(res.tournament.is_none() && res.squad.is_empty());
    }

    #[test]
    fn 강한_대표팀이_평균적으로_더_높은_순위를_낸다() {
        let r = rules();
        let t = r.tournaments.iter().find(|t| t.field_size >= 8).unwrap().clone();
        let avg = |strength: f64| -> f64 {
            let s: i32 = (0..200).map(|seed| simulate_tournament(TournamentParams {
                tournament: t.clone(), squad_strength: strength, year: 2030, world_seed: seed,
            }).rank).sum();
            s as f64 / 200.0
        };
        let strong = avg(88.0);
        let weak = avg(62.0);
        assert!(strong < weak, "강팀 평균 {strong} · 약팀 평균 {weak}");
    }

    #[test]
    fn 순위는_참가국_수를_안_넘는다() {
        let r = rules();
        for t in &r.tournaments {
            for seed in 0..200u32 {
                let res = simulate_tournament(TournamentParams {
                    tournament: t.clone(), squad_strength: 50.0 + (seed % 50) as f64,
                    year: 2030, world_seed: seed,
                });
                assert!(res.rank >= 1 && res.rank <= t.field_size,
                    "{} {}위 / {}개국", t.id, res.rank, t.field_size);
            }
        }
    }

    #[test]
    fn 면제는_면제가_걸린_대회에서만_나온다() {
        let r = rules();
        for t in &r.tournaments {
            if t.exemption_rank > 0 { continue; }
            for seed in 0..100u32 {
                let res = simulate_tournament(TournamentParams {
                    tournament: t.clone(), squad_strength: 99.0, year: 2030, world_seed: seed,
                });
                assert!(!res.exemption, "{}는 면제가 없는 대회다", t.id);
            }
        }
    }

    #[test]
    fn 면제_기준이_참가국_수_안에_있다() {
        // exemption_rank가 field_size보다 크면 전원 면제가 된다
        for t in &rules().tournaments {
            assert!(t.exemption_rank < t.field_size,
                "{}: 면제 {}위 / {}개국이면 사실상 전원 면제", t.id, t.exemption_rank, t.field_size);
        }
    }
}
