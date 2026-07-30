// ── R3a-2: Lazy 리그 로스터 생성 (DESIGN.md §8.3) ────────────────────────────
// 원칙:
//  - worldSeed 결정적: 같은 시드 = 같은 로스터 (팀별 독립 시드 — 팀 추가가 다른 팀에 영향 없음)
//  - 출력 shape = slotdb.cjs npc INSERT 입력과 동일 (TS 접착 코드 최소화)
//  - 포지션 커버리지 보장: 야수 8포지션 각 1명 이상, SP 최소 3명
//  - personality는 생성 시점 확정 (호출 시점 해시 폴백 금지 — R1 부채 #8)

use serde::{Deserialize, Serialize};
use crate::npc_sim::{
    LcgRand, gen_name, make_pitching, make_batting, estimate_salary_and_contract,
    POSITIONS, SURNAMES, SYLLABLES_A, SYLLABLES_B,
};
use crate::sim_types::{NpcPitchingAttrs, NpcBattingAttrs};

// ── 입력 ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamSpec {
    pub team_id: String,
    #[serde(default)]
    pub school_id: String,
}

fn default_pitcher_ratio() -> f64 { 0.45 }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterRules {
    pub roster_size: i32,
    pub pitching_ovr_min: f64,
    pub pitching_ovr_max: f64,
    pub batting_ovr_min: f64,
    pub batting_ovr_max: f64,
    pub dev_rate_min: f64,
    pub dev_rate_max: f64,
    /// 학년제(고교 1~3, 대학 1~4). 0이면 무학년(프로/독립)
    #[serde(default)]
    pub grade_max: i32,
    /// 학년제: age = age_base + grade / 무학년: age_min..=age_max 균등
    #[serde(default)]
    pub age_base: i32,
    #[serde(default)]
    pub age_min: i32,
    #[serde(default)]
    pub age_max: i32,
    #[serde(default = "default_pitcher_ratio")]
    pub pitcher_ratio: f64,
    /// 프로 리그: 연봉/계약 생성
    #[serde(default)]
    pub with_contract: bool,
    /// 기본 국적 (KBL/고교/대학/독립=KOR, ABL=USA, JBL=JPN)
    #[serde(default)]
    pub nationality: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamePool {
    pub surnames: Vec<String>,
    pub given_a: Vec<String>,
    pub given_b: Vec<String>,
    /// true면 서양식 "Given Sur" 형식
    #[serde(default)]
    pub western: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLeagueRosterParams {
    pub league_id: String,
    pub season_year: i32,
    pub world_seed: u32,
    pub teams: Vec<TeamSpec>,
    pub rules: RosterRules,
    #[serde(default)]
    pub name_pool: Option<NamePool>,
    /// npcId 접두 (기본: 리그 코드 자동)
    #[serde(default)]
    pub id_prefix: Option<String>,
}

// ── 출력 (slotdb npc INSERT shape) ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenAbilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitching: Option<NpcPitchingAttrs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batting: Option<NpcBattingAttrs>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenPersonality {
    pub loyalty: f64,
    pub ambition: f64,
    pub greed: f64,
    pub competitive_drive: f64,
    pub stability_preference: f64,
    pub professionalism: f64,
    pub overseas_ambition: f64,
    pub market_preference: f64,
    pub home_team_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenNpc {
    pub npc_id: String,
    pub name: String,
    pub name_en: String,
    pub is_named: bool,
    pub player_type: String,
    pub position: String,
    pub handedness: String,
    pub jersey_number: i32,
    pub age: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grade: Option<i32>,
    pub school_id: String,
    pub graduation_year: i32,
    pub nationality: String,
    pub career_status: String,
    pub current_league: String,
    pub current_team: String,
    pub salary: i64,
    pub contract_years: i32,
    pub pro_service_years: i32,
    pub military_status: String,
    pub development_rate: i32,
    pub potential_hidden: i32,
    pub abilities: GenAbilities,
    pub personality: GenPersonality,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLeagueRosterResult {
    pub npcs: Vec<GenNpc>,
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

fn hash_str(s: &str) -> u32 {
    s.bytes().fold(0u32, |acc, b| acc.wrapping_mul(131).wrapping_add(b as u32))
}

fn league_code(league_id: &str) -> &'static str {
    match league_id {
        "LEAGUE_HIGHSCHOOL"  => "HS",
        "LEAGUE_UNIVERSITY"  => "UV",
        "LEAGUE_INDEPENDENT" => "IN",
        "LEAGUE_KBL"         => "KB",
        "LEAGUE_KBL_FARM"    => "KF",
        "LEAGUE_ABL"         => "AB",
        "LEAGUE_ABL_FARM"    => "AF",
        "LEAGUE_JBL"         => "JB",
        "LEAGUE_JBL_FARM"    => "JF",
        _                    => "XX",
    }
}

/// npcId에 넣을 팀 식별자.
///
/// 예전엔 `hash_str(team_id) % 10000`이었다. 4자리(1만 버킷)에 182팀을 넣으면
/// 생일 문제로 충돌이 사실상 확실하고, 실제로 `TEAM_UNIV_NAMGANG`과
/// `TEAM_UNIV_SEORAK`이 같은 5898로 접혀 **ID가 통째로 겹쳤다**
/// (`UNIQUE constraint failed: npc.npc_id`).
///
/// 스태프는 처음부터 `staff:{team_id}_MGR`로 팀 ID를 그대로 썼다 — 같은 방식으로
/// 맞춘다. 팀 ID가 유일하므로 **구조적으로** 충돌이 불가능해진다.
fn team_tag(team_id: &str) -> &str {
    team_id.strip_prefix("TEAM_").unwrap_or(team_id)
}

fn pick<'a>(list: &'a [String], rng: &mut LcgRand) -> &'a str {
    &list[(rng.next() * list.len() as f64) as usize % list.len()]
}

fn gen_name_pooled(pool: &NamePool, rng: &mut LcgRand) -> (String, String) {
    let sur = pick(&pool.surnames, rng);
    let a   = pick(&pool.given_a, rng);
    let b   = if pool.given_b.is_empty() { "" } else { pick(&pool.given_b, rng) };
    if pool.western {
        let name = format!("{} {}", a, sur);
        (name.clone(), name)
    } else {
        (format!("{}{}{}", sur, a, b), format!("{} {}{}", sur, a, b))
    }
}

fn gen_name_builtin(rng: &mut LcgRand) -> (String, String) {
    let _ = (SURNAMES.len(), SYLLABLES_A.len(), SYLLABLES_B.len()); // npc_sim 풀 사용 명시
    gen_name(rng)
}

fn gen_personality(rng: &mut LcgRand) -> GenPersonality {
    let r = |rng: &mut LcgRand, min: f64, span: f64| (min + rng.next() * span).round();
    GenPersonality {
        loyalty:              r(rng, 40.0, 40.0),
        ambition:             r(rng, 30.0, 65.0),
        greed:                r(rng, 25.0, 55.0),
        competitive_drive:    r(rng, 40.0, 45.0),
        stability_preference: r(rng, 25.0, 60.0),
        professionalism:      r(rng, 50.0, 30.0),
        overseas_ambition:    r(rng, 5.0,  45.0),
        market_preference:    r(rng, 35.0, 45.0),
        home_team_id:         None,
    }
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

pub fn generate_league_roster(p: GenerateLeagueRosterParams) -> GenerateLeagueRosterResult {
    let mut npcs: Vec<GenNpc> = Vec::new();
    let prefix = p.id_prefix.clone().unwrap_or_else(|| league_code(&p.league_id).to_string());
    let nationality = p.rules.nationality.clone().unwrap_or_else(|| "KOR".into());

    let roster = p.rules.roster_size.max(1);
    let pitcher_n = ((roster as f64) * p.rules.pitcher_ratio).round() as i32;
    let sp_n = (pitcher_n as f64 * 0.45).round().max(3.0) as i32;
    let batter_n = roster - pitcher_n;

    for team in &p.teams {
        // 팀별 독립 시드 — 팀 목록 순서/구성 변경이 다른 팀 로스터에 영향 없음
        let seed = p.world_seed
            ^ hash_str(&team.team_id)
            ^ (p.season_year as u32).wrapping_mul(2654435761);
        let mut rng = LcgRand::new(seed);

        for i in 0..roster {
            let is_pitcher = i < pitcher_n;
            let position = if is_pitcher {
                if i < sp_n { "SP".to_string() } else { "RP".to_string() }
            } else {
                // 8포지션을 **두 바퀴** 돈 뒤에야 랜덤으로 넘어간다.
                //
                // 한 바퀴만 돌던 시절엔 나머지가 전부 랜덤이라 특정 포지션이 1명으로
                // 남았다(프로 28명 로스터에서 2루·좌익·중견이 1명씩). 그 1명이 다치면
                // 그 자리가 통째로 빈다. 백업 1명까지는 구조로 보장한다.
                //
                // 야수가 16명이 안 되는 리그는 두 바퀴가 안 돌지만, 그때도 최소
                // 한 바퀴(8포지션 전원)는 보장된다 — 아래 나머지 연산이 그대로 처리한다.
                let bi = (i - pitcher_n) as usize;
                let np = POSITIONS.len();
                if bi < np * 2 {
                    POSITIONS[bi % np].to_string()
                } else {
                    POSITIONS[(rng.next() * np as f64) as usize % np].to_string()
                }
            };

            // 학년/나이
            let (grade, age, graduation_year) = if p.rules.grade_max > 0 {
                let g = (i % p.rules.grade_max) + 1;
                (Some(g), p.rules.age_base + g, p.season_year + (p.rules.grade_max - g))
            } else {
                let span = (p.rules.age_max - p.rules.age_min).max(0);
                let a = p.rules.age_min + (rng.next() * (span + 1) as f64) as i32;
                (None, a, 0)
            };

            // 능력치 — 투수도 최소 타격치 보유 (교류전/지명타자 부재 대비)
            let ovr_p = p.rules.pitching_ovr_min + rng.next() * (p.rules.pitching_ovr_max - p.rules.pitching_ovr_min);
            let ovr_b = p.rules.batting_ovr_min  + rng.next() * (p.rules.batting_ovr_max  - p.rules.batting_ovr_min);
            let abilities = if is_pitcher {
                GenAbilities {
                    pitching: Some(make_pitching(ovr_p.round(), &mut rng)),
                    batting:  Some(make_batting((ovr_b * 0.55).round(), &mut rng)),
                }
            } else {
                GenAbilities {
                    pitching: None,
                    batting:  Some(make_batting(ovr_b.round(), &mut rng)),
                }
            };

            let core_ovr = if is_pitcher { ovr_p } else { ovr_b };
            let dev_rate = p.rules.dev_rate_min + rng.next() * (p.rules.dev_rate_max - p.rules.dev_rate_min);
            let pot_cap  = p.rules.pitching_ovr_max.max(p.rules.batting_ovr_max);
            let potential = (pot_cap * (1.05 + rng.next() * 0.20)).round().clamp(core_ovr.round(), 99.0);

            let handedness = if rng.next() < (if is_pitcher { 0.30 } else { 0.35 }) { "L" } else { "R" };

            let (salary, contract_years) = if p.rules.with_contract {
                estimate_salary_and_contract(core_ovr, &p.league_id, &mut rng)
            } else {
                (0, 0)
            };
            // 프로 무학년: 경력 연차 = 나이 기반 근사 (18세 입단 가정, 0~age-19)
            let pro_service_years = if p.rules.grade_max == 0 && p.rules.with_contract {
                let max_svc = (age - 19).max(0);
                (rng.next() * (max_svc + 1) as f64) as i32
            } else { 0 };

            let (name, name_en) = match &p.name_pool {
                Some(pool) => gen_name_pooled(pool, &mut rng),
                None => gen_name_builtin(&mut rng),
            };

            npcs.push(GenNpc {
                npc_id: format!("PLY_{}{:02}_{}_{:03}",
                    prefix, p.season_year % 100, team_tag(&team.team_id), i + 1),
                name, name_en,
                is_named: false,
                player_type: if is_pitcher { "pitcher".into() } else { "batter".into() },
                position,
                handedness: handedness.into(),
                jersey_number: i + 1,
                age,
                grade,
                school_id: team.school_id.clone(),
                graduation_year,
                nationality: nationality.clone(),
                career_status: "active".into(),
                current_league: p.league_id.clone(),
                current_team: team.team_id.clone(),
                salary, contract_years, pro_service_years,
                military_status: if nationality == "KOR" { "미필".into() } else { "면제".into() },
                development_rate: dev_rate.round() as i32,
                potential_hidden: potential as i32,
                abilities,
                personality: gen_personality(&mut rng),
            });
        }
    }

    GenerateLeagueRosterResult { npcs }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn rules(size: i32) -> RosterRules {
        RosterRules {
            roster_size: size,
            pitching_ovr_min: 40.0, pitching_ovr_max: 72.0,
            batting_ovr_min: 40.0, batting_ovr_max: 72.0,
            dev_rate_min: 45.0, dev_rate_max: 75.0,
            grade_max: 0, age_base: 18, age_min: 20, age_max: 32,
            pitcher_ratio: 0.45,
            with_contract: false,
            nationality: None,
        }
    }

    fn gen(league: &str, team_ids: &[&str], size: i32) -> Vec<GenNpc> {
        generate_league_roster(GenerateLeagueRosterParams {
            league_id: league.to_string(),
            season_year: 2029,
            world_seed: 4242,
            teams: team_ids.iter().map(|t| TeamSpec {
                team_id: t.to_string(), school_id: String::new(),
            }).collect(),
            rules: rules(size),
            name_pool: None,
            id_prefix: None,
        }).npcs
    }

    /// **이 테스트가 없어서 `UNIQUE constraint failed: npc.npc_id`가 실사용에서 터졌다.**
    ///
    /// npcId가 `hash_str(team_id) % 10000`을 쓰던 시절, 4자리(1만 버킷)에 182팀을
    /// 넣으면 생일 문제로 충돌이 사실상 확실했다. 실제로 TEAM_UNIV_NAMGANG과
    /// TEAM_UNIV_SEORAK이 같은 5898로 접혀 두 팀 로스터 ID가 통째로 겹쳤다.
    ///
    /// **합성 팀명(T00~T49)으로는 안 잡힌다** — 우연히 안 겹칠 수 있다.
    /// refs.json의 실제 팀 목록을 읽어 국내 전 팀을 한 번에 검사한다.
    #[test]
    fn npc_id는_국내_전_팀에서_유일하다() {
        let refs_src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/entities/refs.json"
        )).expect("refs.json 없음");
        let refs: serde_json::Value = serde_json::from_str(&refs_src).expect("refs.json 파싱 실패");
        let teams = refs["teams"].as_array().expect("teams 배열 없음");

        let pick = |pred: &dyn Fn(&str, &str) -> bool| -> Vec<String> {
            teams.iter().filter_map(|t| {
                let id = t["id"].as_str()?;
                let lid = t["leagueId"].as_str()?;
                if pred(id, lid) { Some(id.to_string()) } else { None }
            }).collect()
        };

        let plan: Vec<(&str, Vec<String>, i32)> = vec![
            ("LEAGUE_HIGHSCHOOL",  pick(&|_, l| l == "LEAGUE_HIGHSCHOOL"), 30),
            ("LEAGUE_UNIVERSITY",  pick(&|_, l| l == "LEAGUE_UNIVERSITY"), 32),
            ("LEAGUE_INDEPENDENT", pick(&|_, l| l == "LEAGUE_INDEPENDENT"), 30),
            ("LEAGUE_KBL",         pick(&|i, l| l == "LEAGUE_KBL" && i.ends_with("_1")), 30),
            ("LEAGUE_KBL_FARM",    pick(&|i, l| l == "LEAGUE_KBL" && i.ends_with("_2")), 34),
        ];

        let mut seen: HashSet<String> = HashSet::new();
        let mut dups: Vec<String> = Vec::new();
        let mut total = 0usize;
        let mut team_count = 0usize;
        for (lid, ids, size) in &plan {
            assert!(!ids.is_empty(), "{lid} 팀이 refs에 없다");
            team_count += ids.len();
            let refs_v: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
            let npcs = gen(lid, &refs_v, *size);
            total += npcs.len();
            for n in &npcs {
                if !seen.insert(n.npc_id.clone()) { dups.push(n.npc_id.clone()); }
            }
        }
        assert!(dups.is_empty(),
            "국내 {team_count}팀 {total}명 중 npcId 중복 {}건 (예: {:?})",
            dups.len(), &dups[..dups.len().min(3)]);
        assert_eq!(seen.len(), total);
    }

    /// 이름이 비슷한 팀은 해시가 겹치기 쉬웠다 — 팀 ID를 그대로 쓰면 구조적으로 불가능하다
    #[test]
    fn 같은_리그_다른_팀은_id가_안_겹친다() {
        let npcs = gen("LEAGUE_UNIVERSITY", &["TEAM_UNIV_NAMGANG", "TEAM_UNIV_SEORAK"], 32);
        let a: HashSet<_> = npcs.iter().filter(|n| n.current_team == "TEAM_UNIV_NAMGANG")
            .map(|n| n.npc_id.clone()).collect();
        let b: HashSet<_> = npcs.iter().filter(|n| n.current_team == "TEAM_UNIV_SEORAK")
            .map(|n| n.npc_id.clone()).collect();
        assert!(!a.is_empty() && !b.is_empty());
        assert!(a.is_disjoint(&b), "두 팀의 npcId가 겹친다: {:?}", a.intersection(&b).next());
    }

    /// 1군/2군은 팀 ID 접미사(_1/_2)만 다르다 — 그것만으로 갈려야 한다
    #[test]
    fn 팜팀과_1군은_id가_안_겹친다() {
        let first = gen("LEAGUE_KBL", &["TEAM_KBL_SEOUL_1"], 30);
        let farm  = gen("LEAGUE_KBL_FARM", &["TEAM_KBL_SEOUL_2"], 34);
        let a: HashSet<_> = first.iter().map(|n| n.npc_id.clone()).collect();
        let b: HashSet<_> = farm.iter().map(|n| n.npc_id.clone()).collect();
        assert!(a.is_disjoint(&b));
        // 팜 리그가 league_code에 없으면 "XX"로 떨어진다 — 접두사도 확인한다
        assert!(farm[0].npc_id.starts_with("PLY_KF"), "팜 접두사가 틀렸다: {}", farm[0].npc_id);
    }

    /// **한국 나이 체계 — 고1이 17세다.**
    ///
    /// 이 테스트가 없어서 두 가지가 동시에 어긋나 있었다:
    ///  1. NPC 고1이 16세인데 **주인공은 17세로 시작**했다 (같은 학년, 다른 나이)
    ///  2. 고3이 18세라 졸업하면 19세인데 프로 최소 나이가 20세 —
    ///     **진학·입단 사이에 1년 구멍**이 있었다
    ///
    /// 실데이터(generation_rules.json)로 검사한다 — 인라인 규칙으로는 실제 게임과
    /// 달라질 수 있다.
    #[test]
    fn 나이_체계가_진로를_끊지_않는다() {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).expect("파싱 실패");
        let r = &v["rosterRules"];
        let num = |lid: &str, k: &str| r[lid][k].as_i64().expect(&format!("{lid}.{k} 없음"));

        // 학년제: age = ageBase + grade
        let hs_base = num("LEAGUE_HIGHSCHOOL", "ageBase");
        let hs_max_grade = num("LEAGUE_HIGHSCHOOL", "gradeMax");
        let uv_base = num("LEAGUE_UNIVERSITY", "ageBase");
        let uv_max_grade = num("LEAGUE_UNIVERSITY", "gradeMax");

        assert_eq!(hs_base + 1, 17, "고1이 17세가 아니다 (ageBase {hs_base})");
        assert_eq!(uv_base + 1, 20, "대1이 20세가 아니다 (ageBase {uv_base})");

        let hs_grad = hs_base + hs_max_grade;      // 고3 나이
        let uv_grad = uv_base + uv_max_grade;      // 대4 나이
        assert_eq!(hs_grad, 19, "고3이 19세가 아니다");
        assert_eq!(uv_grad, 23, "대4가 23세가 아니다");

        // 졸업 다음 해 나이로 각 진로에 들어갈 수 있어야 한다 — 여기가 구멍이었다
        let after_hs = hs_grad + 1;                // 20
        for lid in ["LEAGUE_INDEPENDENT", "LEAGUE_KBL", "LEAGUE_KBL_FARM"] {
            let lo = num(lid, "ageMin");
            assert!(after_hs >= lo,
                "{lid} 최소 나이 {lo} > 고졸 다음해 {after_hs} — 진로에 {}년 구멍", lo - after_hs);
        }
        assert_eq!(after_hs, uv_base + 1, "고졸 다음해와 대1 나이가 다르다");

        // 대졸도 프로 나이 범위 안이어야 한다
        let after_uv = uv_grad + 1;                // 24
        let kbl_lo = num("LEAGUE_KBL", "ageMin");
        let kbl_hi = num("LEAGUE_KBL", "ageMax");
        assert!(after_uv >= kbl_lo && after_uv <= kbl_hi,
            "대졸 다음해 {after_uv}가 프로 범위 {kbl_lo}~{kbl_hi} 밖이다");
    }

    /// 야수 8포지션에 백업까지 있어야 한다 (한 명이 다치면 자리가 비지 않게)
    #[test]
    fn 야수_8포지션에_백업이_있다() {
        const FIELD: [&str; 8] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
        for size in [30, 32, 34] {
            let npcs = gen("LEAGUE_KBL", &["TEAM_KBL_A"], size);
            for pos in FIELD {
                let n = npcs.iter().filter(|x| x.position == pos).count();
                assert!(n >= 2, "로스터 {size}명인데 {pos}가 {n}명 — 백업이 없다");
            }
        }
    }
}
