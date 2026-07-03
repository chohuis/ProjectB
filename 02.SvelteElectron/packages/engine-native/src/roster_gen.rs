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
        "LEAGUE_ABL"         => "AB",
        "LEAGUE_JBL"         => "JB",
        _                    => "XX",
    }
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
                let bi = i - pitcher_n;
                if (bi as usize) < POSITIONS.len() {
                    POSITIONS[bi as usize].to_string()   // 8포지션 커버리지 보장
                } else {
                    POSITIONS[(rng.next() * POSITIONS.len() as f64) as usize % POSITIONS.len()].to_string()
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
                    prefix, p.season_year % 100, hash_str(&team.team_id) % 10000, i + 1),
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
