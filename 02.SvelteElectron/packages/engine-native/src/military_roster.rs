// 군경팀(상무) 로스터 생성 (Phase 6.5 R-5)
//
// 예전엔 상무에 **병역 "미필"인 민간 선수 30명**이 생성돼 있었다 — 필터가
// `TEAM_SPORTS_UNIT`을 걸렀는데 refs의 실제 ID는 `TEAM_IND_SANGMU_PHOENIX`라
// 안 먹었기 때문이다.
//
// 사용자 확정: **별도 생성 + 원소속 지정.** 원팀 로스터에서 빼내면 8포지션 백업
// 보장이 깨진다. 전역하면 원팀으로 돌아가 엔트리가 +1 되는데, 실제로도 그렇다.
//
// 계급은 복무 경과 개월로 정한다. 새 게임 시점에 입대 시기가 흩어져 있어야
// 매년 전역자가 나온다 — 전원이 같은 달에 입대하면 2년마다 팀이 통째로 갈린다.

use serde::{Deserialize, Serialize};

use crate::npc_sim::{LcgRand, gen_name, make_pitching, make_batting, POSITIONS};
use crate::sim_types::{NpcPitchingAttrs, NpcBattingAttrs};

fn hash_str(s: &str) -> u32 {
    s.bytes().fold(0u32, |acc, b| acc.wrapping_mul(131).wrapping_add(b as u32))
}

// ── 규칙 (generation_rules.json militaryRules) ───────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankBand {
    pub until_months: i32,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryRules {
    pub team_id: String,
    pub league_id: String,
    pub roster_size: i32,
    pub service_months: i32,
    pub ranks: Vec<RankBand>,
    pub age_min: i32,
    pub age_max: i32,
    pub pitching_ovr_min: f64,
    pub pitching_ovr_max: f64,
    pub batting_ovr_min: f64,
    pub batting_ovr_max: f64,
    pub dev_rate_min: f64,
    pub dev_rate_max: f64,
    pub salary: i64,
}

// ── 입출력 ───────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMilitaryRosterParams {
    pub world_seed: f64,
    pub season_year: i32,
    pub rules: MilitaryRules,
    /// 원소속으로 지정할 실재 팀 목록 (프로 1군·2군). 여기서만 고른다 —
    /// 없는 팀을 넣으면 전역할 곳이 사라진다
    pub origin_teams: Vec<OriginTeam>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginTeam {
    pub team_id: String,
    pub league_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryNpc {
    pub npc_id: String,
    pub name: String,
    pub name_en: String,
    pub is_named: bool,
    pub player_type: String,
    pub position: String,
    pub handedness: String,
    pub jersey_number: i32,
    pub age: i32,
    pub school_id: String,
    pub graduation_year: i32,
    pub nationality: String,
    /// 복무 중 = career_status "military". active로 두면 드래프트·FA 후보에 섞인다
    pub career_status: String,
    pub current_league: String,
    pub current_team: String,
    pub salary: i64,
    pub contract_years: i32,
    pub pro_service_years: i32,
    pub military_status: String,
    pub development_rate: i32,
    pub potential_hidden: i32,
    pub abilities: MilAbilities,
    /// slot.db military_json으로 그대로 들어간다
    pub military: MilitaryInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilAbilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitching: Option<NpcPitchingAttrs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batting: Option<NpcBattingAttrs>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilitaryInfo {
    pub unit: String,
    pub enlist_year: i32,
    pub discharge_year: i32,
    pub original_league_id: String,
    pub original_team_id: String,
    /// 이병 · 일병 · 상병 · 병장
    pub rank: String,
    /// 복무 경과 개월 (0 ~ service_months)
    pub served_months: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMilitaryRosterResult {
    pub npcs: Vec<MilitaryNpc>,
}

// ── 생성 ─────────────────────────────────────────────────────────────────────

fn rank_of(rules: &MilitaryRules, served_months: i32) -> String {
    for b in &rules.ranks {
        if served_months <= b.until_months { return b.name.clone(); }
    }
    rules.ranks.last().map(|b| b.name.clone()).unwrap_or_else(|| "이병".into())
}

pub fn generate_military_roster(p: GenerateMilitaryRosterParams) -> GenerateMilitaryRosterResult {
    let r = &p.rules;
    let n = r.roster_size.max(1);
    let mut npcs = Vec::with_capacity(n as usize);

    if p.origin_teams.is_empty() {
        return GenerateMilitaryRosterResult { npcs };
    }

    // 투수 비율은 일반 로스터와 같게 둔다 (0.45) — 상무도 경기를 한다
    let pitcher_n = ((n as f64) * 0.45).round() as i32;
    let sp_n = (pitcher_n as f64 * 0.45).round().max(2.0) as i32;

    for i in 0..n {
        // 선수별 독립 스트림 — 인원이 바뀌어도 앞사람이 그대로다 (_ledger P6-4)
        let mut rng = LcgRand::new(
            (p.world_seed as u32) ^ hash_str(&format!("{}#{i}", r.team_id)));

        let is_pitcher = i < pitcher_n;
        let position = if is_pitcher {
            if i < sp_n { "SP".to_string() } else { "RP".to_string() }
        } else {
            let bi = (i - pitcher_n) as usize;
            POSITIONS[bi % POSITIONS.len()].to_string()
        };

        // 복무 경과를 흩뿌린다 — 전원이 같이 입대하면 2년마다 팀이 통째로 갈린다
        let served = (rng.next() * (r.service_months + 1) as f64) as i32;
        let remain_months = (r.service_months - served).max(0);
        // 남은 개월을 시즌으로 올림 — 0개월 남았어도 이번 시즌 말에 전역한다
        let discharge_year = p.season_year + (remain_months + 11) / 12;
        let enlist_year = discharge_year - (r.service_months + 11) / 12;

        let age = r.age_min + (rng.next() * ((r.age_max - r.age_min).max(0) + 1) as f64) as i32;
        let origin = &p.origin_teams[(rng.next() * p.origin_teams.len() as f64) as usize
            % p.origin_teams.len()];

        let ovr_p = r.pitching_ovr_min + rng.next() * (r.pitching_ovr_max - r.pitching_ovr_min);
        let ovr_b = r.batting_ovr_min  + rng.next() * (r.batting_ovr_max  - r.batting_ovr_min);
        let abilities = if is_pitcher {
            MilAbilities {
                pitching: Some(make_pitching(ovr_p.round(), &mut rng)),
                batting:  Some(make_batting((ovr_b * 0.55).round(), &mut rng)),
            }
        } else {
            MilAbilities { pitching: None, batting: Some(make_batting(ovr_b.round(), &mut rng)) }
        };

        let core = if is_pitcher { ovr_p } else { ovr_b };
        let dev = r.dev_rate_min + rng.next() * (r.dev_rate_max - r.dev_rate_min);
        let pot_cap = r.pitching_ovr_max.max(r.batting_ovr_max);
        let potential = (pot_cap * (1.10 + rng.next() * 0.20)).round().clamp(core.round(), 99.0);

        let (name, name_en) = gen_name(&mut rng);

        npcs.push(MilitaryNpc {
            npc_id: format!("PLY_SM{:02}_{:03}", p.season_year % 100, i + 1),
            name, name_en,
            is_named: false,
            player_type: if is_pitcher { "pitcher".into() } else { "batter".into() },
            position,
            handedness: if rng.next() < 0.30 { "L".into() } else { "R".into() },
            jersey_number: i + 1,
            age,
            school_id: String::new(),
            graduation_year: 0,
            nationality: "KOR".into(),
            // **military**이어야 한다. active면 드래프트·FA 후보 풀에 섞인다
            career_status: "military".into(),
            current_league: r.league_id.clone(),
            current_team: r.team_id.clone(),
            salary: r.salary,
            contract_years: 0,
            // 복무 전 프로 경력. 입대 나이 − 고졸 입단(20세)
            pro_service_years: (age - 20).max(0),
            military_status: "현역".into(),
            development_rate: dev.round() as i32,
            potential_hidden: potential as i32,
            abilities,
            military: MilitaryInfo {
                unit: "sports".into(),
                enlist_year,
                discharge_year,
                original_league_id: origin.league_id.clone(),
                original_team_id: origin.team_id.clone(),
                rank: rank_of(r, served),
                served_months: served,
            },
        });
    }

    GenerateMilitaryRosterResult { npcs }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> MilitaryRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        serde_json::from_value(v["militaryRules"].clone()).expect("militaryRules 파싱 실패")
    }

    fn origins() -> Vec<OriginTeam> {
        (0..10).map(|i| OriginTeam {
            team_id: format!("TEAM_KBL_{}_1", (b'A' + i) as char),
            league_id: "LEAGUE_KBL".into(),
        }).collect()
    }

    fn run() -> Vec<MilitaryNpc> {
        generate_military_roster(GenerateMilitaryRosterParams {
            world_seed: 4242.0, season_year: 2029, rules: rules(), origin_teams: origins(),
        }).npcs
    }

    /// 상무 선수는 **전원 현역**이다.
    /// 예전엔 병역 "미필"인 민간 선수가 상무 팀에 있었다 — 그 자체로 모순이다.
    #[test]
    fn 전원이_현역이고_복무중이다() {
        let npcs = run();
        assert!(!npcs.is_empty());
        for n in &npcs {
            assert_eq!(n.military_status, "현역", "{} 병역상태가 {}", n.name, n.military_status);
            // career_status가 active면 드래프트·FA 후보 풀에 섞인다
            assert_eq!(n.career_status, "military", "{} career_status가 {}", n.name, n.career_status);
            assert_eq!(n.military.unit, "sports");
        }
    }

    /// 원소속이 실재 팀이어야 한다 — 없으면 전역할 곳이 사라진다
    #[test]
    fn 원소속이_실재_팀이다() {
        let valid: Vec<String> = origins().into_iter().map(|o| o.team_id).collect();
        for n in run() {
            assert!(valid.contains(&n.military.original_team_id),
                "실재하지 않는 원소속: {}", n.military.original_team_id);
            assert_ne!(n.military.original_team_id, n.current_team,
                "원소속이 상무 자신이다");
        }
    }

    /// 계급이 복무 경과와 맞아야 한다
    #[test]
    fn 계급이_복무_경과와_맞는다() {
        let r = rules();
        for n in run() {
            let want = rank_of(&r, n.military.served_months);
            assert_eq!(n.military.rank, want,
                "{}개월 복무인데 계급이 {}", n.military.served_months, n.military.rank);
            assert!(n.military.served_months <= r.service_months);
        }
    }

    /// **전역 시기가 흩어져야 한다.** 전원이 같이 입대하면 2년마다 팀이 통째로 갈린다
    #[test]
    fn 전역_시기가_흩어진다() {
        let npcs = run();
        let years: std::collections::HashSet<i32> =
            npcs.iter().map(|n| n.military.discharge_year).collect();
        assert!(years.len() >= 2,
            "전역 연도가 {}종뿐 — 전원이 같은 해에 나간다", years.len());
        let ranks: std::collections::HashSet<&str> =
            npcs.iter().map(|n| n.military.rank.as_str()).collect();
        assert!(ranks.len() >= 3, "계급이 {}종뿐 — 입대 시기가 안 흩어졌다", ranks.len());
    }

    /// 전역 연도가 현재 시즌보다 미래여야 한다 (이미 전역한 사람이 팀에 있으면 안 된다)
    #[test]
    fn 전역_연도가_미래다() {
        for n in run() {
            assert!(n.military.discharge_year >= 2029,
                "{} 전역 {} — 이미 전역했는데 상무에 있다", n.name, n.military.discharge_year);
            assert!(n.military.enlist_year <= 2029,
                "{} 입대 {} — 아직 입대 안 했는데 상무에 있다", n.name, n.military.enlist_year);
        }
    }

    /// 야수 8포지션이 다 있어야 한다 (상무도 경기를 한다)
    #[test]
    fn 포지션이_갖춰진다() {
        let npcs = run();
        for pos in POSITIONS {
            assert!(npcs.iter().any(|n| n.position == *pos), "{pos} 없음");
        }
        assert!(npcs.iter().filter(|n| n.position == "SP").count() >= 2, "선발 부족");
    }

    /// 연봉은 군인 봉급이다 — 프로 연봉을 쓰면 안 된다
    #[test]
    fn 연봉이_군인_봉급이다() {
        let r = rules();
        for n in run() {
            assert_eq!(n.salary, r.salary);
            assert_eq!(n.contract_years, 0, "복무 중엔 계약연수가 없다");
        }
    }

    #[test]
    fn 같은_시드는_같은_로스터를_만든다() {
        let a = run();
        let b = run();
        assert_eq!(a.len(), b.len());
        for (x, y) in a.iter().zip(b.iter()) {
            assert_eq!(x.npc_id, y.npc_id);
            assert_eq!(x.name, y.name);
            assert_eq!(x.military.rank, y.military.rank);
        }
    }
}
