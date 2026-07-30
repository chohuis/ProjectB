// 스태프 절차 생성 (Phase 6A)
//
// people.md §1-1: 손 저작 JSON을 두지 않는다. git에 남는 것은 **생성 규칙**(staff_rules.toml)뿐.
// 구 374개 JSON은 스크립트 생성물이었고(고유값 6~9종의 템플릿 조합) DESIGN §8.3이
// 폐기한 "결과물을 저장하고 사후 수정하는 패턴"의 마지막 잔재였다.
//
// 능력치 스키마는 **Rust가 실제로 쓰는 것**이 정본이다. 구 JSON은 감독 스탯을
// tactics/decision/... 으로 저장했는데 MatchPage는 handlePressure/strategy/... 를 읽어
// 감독 능력치가 매치 엔진에 하나도 전달되지 않았다(전부 기본값 50).
//
// worldSeed 결정적 — 같은 시드 + 같은 규칙 = 같은 스태프. rand::thread_rng()를 쓰지 않는다.

use serde::{Deserialize, Serialize};

/// splitmix64 — group_stage.rs와 같은 난수원. 팀·역할·순번마다 독립 스트림을 판다.
fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

fn hash_str(s: &str) -> u64 {
    let mut h = 0xCBF29CE484222325u64;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001B3);
    }
    h
}

struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Rng(seed)
    }
    /// [lo, hi] 균등 정수
    fn range(&mut self, lo: i64, hi: i64) -> i64 {
        if hi <= lo {
            return lo;
        }
        lo + (splitmix64(&mut self.0) % ((hi - lo + 1) as u64)) as i64
    }
    fn pick<'a, T>(&mut self, items: &'a [T]) -> Option<&'a T> {
        if items.is_empty() {
            return None;
        }
        let i = (splitmix64(&mut self.0) % items.len() as u64) as usize;
        items.get(i)
    }
}

// ── 규칙 (staff_rules.toml → JSON으로 넘어온다) ────────────────

// TOML에서 오는 규칙 — snake_case가 정본 (camelCase 변환을 걸지 않는다)
#[derive(Debug, Deserialize, Clone)]
pub struct MinMax {
    pub min: i64,
    pub max: i64,
}

// TOML에서 오는 규칙 — snake_case가 정본 (camelCase 변환을 걸지 않는다)
#[derive(Debug, Deserialize, Clone)]
pub struct CoachSpecialtyRule {
    pub name: String,
    pub boost: Vec<String>,
    pub buff: String,
}

// TOML에서 오는 규칙 — snake_case가 정본 (camelCase 변환을 걸지 않는다)
#[derive(Debug, Deserialize, Clone)]
pub struct RoleRule {
    pub age: MinMax,
    #[serde(default)]
    pub experience_years: Option<MinMax>,
    #[serde(default)]
    pub tenure_years: Option<MinMax>,
    pub stat_center: i64,
    pub stat_spread: i64,
    pub stats: Vec<String>,
    #[serde(default)]
    pub styles: Vec<String>,
    #[serde(default)]
    pub risk_tolerance: Option<MinMax>,
    #[serde(default)]
    pub specialties: Vec<CoachSpecialtyRule>,
    #[serde(default)]
    pub specialty_boost: Option<SpecialtyBoost>,
    /// 자원 등급 → 능력치 보정 (구단주)
    #[serde(default)]
    pub resource_bonus: std::collections::HashMap<String, std::collections::HashMap<String, i64>>,
}

// TOML에서 오는 규칙 — snake_case가 정본 (camelCase 변환을 걸지 않는다)
#[derive(Debug, Deserialize, Clone)]
pub struct SpecialtyBoost {
    pub amount: i64,
    pub buff_divisor: i64,
}

// TOML에서 오는 규칙 — snake_case가 정본 (camelCase 변환을 걸지 않는다)
#[derive(Debug, Deserialize, Clone)]
pub struct StaffRules {
    pub coach_count: std::collections::HashMap<String, MinMax>,
    pub league_bonus: std::collections::HashMap<String, i64>,
    pub power_bonus: PowerBonus,
    pub manager: RoleRule,
    pub coach: RoleRule,
    pub owner: RoleRule,
}

// TOML에서 오는 규칙 — snake_case가 정본 (camelCase 변환을 걸지 않는다)
#[derive(Debug, Deserialize, Clone)]
pub struct PowerBonus {
    pub per_star: i64,
}

// ── 입력 ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeamInput {
    pub team_id: String,
    pub league_id: String,
    #[serde(default)]
    pub school_id: String,
    /// 전력★ 1~5
    #[serde(default = "default_power")]
    pub power: i64,
    /// 자원 등급 (부유/안정/알뜰/궁핍)
    #[serde(default)]
    pub resource: String,
}

fn default_power() -> i64 {
    3
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateStaffParams {
    pub world_seed: u32,
    pub season_year: u32,
    pub teams: Vec<TeamInput>,
    pub rules: StaffRules,
    /// 이름 풀 — 한국어 성/이름
    pub surnames: Vec<String>,
    pub given_names: Vec<String>,
    #[serde(default)]
    pub surnames_en: Vec<String>,
    #[serde(default)]
    pub given_names_en: Vec<String>,
}

// ── 출력 ───────────────────────────────────────────────────────

// Deserialize도 붙인다 — 생애주기(6B)가 시즌마다 이 구조를 되받는다
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StaffRow {
    pub staff_id: String,
    pub name: String,
    pub name_en: String,
    /// "manager" | "coach" | "owner"
    pub role: String,
    pub age: i64,
    pub team_id: String,
    pub league_id: String,
    pub school_id: String,
    pub status: String,
    /// 감독·코치 = 경력 연수 · 구단주 = 재임 연수
    pub years: i64,
    /// 스타일/전문 영역 라벨
    pub style: String,
    /// 능력치 — 역할별 5종
    pub stats: std::collections::BTreeMap<String, i64>,
    /// 감독 전용
    pub risk_tolerance: i64,
    /// 코치 전용 — 훈련 버프 표시 문구
    pub training_buff: String,
    /// 이 스태프가 부임한 시즌 (6B 생멸에서 쓴다)
    pub joined_season: u32,
}

fn clamp(v: i64, lo: i64, hi: i64) -> i64 {
    v.max(lo).min(hi)
}

fn gen_name(rng: &mut Rng, surnames: &[String], givens: &[String]) -> String {
    let s = rng.pick(surnames).cloned().unwrap_or_else(|| "김".into());
    let g = rng.pick(givens).cloned().unwrap_or_else(|| "무명".into());
    format!("{}{}", s, g)
}

fn gen_name_en(rng: &mut Rng, surnames: &[String], givens: &[String]) -> String {
    if surnames.is_empty() || givens.is_empty() {
        return String::new();
    }
    let s = rng.pick(surnames).cloned().unwrap_or_default();
    let g = rng.pick(givens).cloned().unwrap_or_default();
    format!("{} {}", g, s)
}

fn roll_stats(
    rng: &mut Rng,
    rule: &RoleRule,
    bonus: i64,
) -> std::collections::BTreeMap<String, i64> {
    let mut out = std::collections::BTreeMap::new();
    for key in &rule.stats {
        let v = rule.stat_center + bonus + rng.range(-rule.stat_spread, rule.stat_spread);
        out.insert(key.clone(), clamp(v, 20, 95));
    }
    out
}

pub fn generate_staff(p: GenerateStaffParams) -> Vec<StaffRow> {
    let mut out = Vec::new();
    // 팀을 정렬해 결정적으로 만든다 — 입력 순서에 의존하지 않는다
    let mut teams = p.teams.clone();
    teams.sort_by(|a, b| a.team_id.cmp(&b.team_id));

    for team in &teams {
        let league_bonus = *p.rules.league_bonus.get(&team.league_id).unwrap_or(&0);
        let power_bonus = (team.power - 3) * p.rules.power_bonus.per_star;
        let bonus = league_bonus + power_bonus;

        // 팀·역할·순번마다 독립 스트림 — 코치 수가 바뀌어도 감독은 안 흔들린다
        let team_seed = hash_str(&team.team_id) ^ (p.world_seed as u64).wrapping_mul(0x9E3779B97F4A7C15);

        // ── 감독 1명 ──────────────────────────────────────────
        {
            let mut rng = Rng::new(team_seed ^ hash_str("manager"));
            let r = &p.rules.manager;
            out.push(StaffRow {
                staff_id: format!("staff:{}_MGR", team.team_id),
                name: gen_name(&mut rng, &p.surnames, &p.given_names),
                name_en: gen_name_en(&mut rng, &p.surnames_en, &p.given_names_en),
                role: "manager".into(),
                age: rng.range(r.age.min, r.age.max),
                team_id: team.team_id.clone(),
                league_id: team.league_id.clone(),
                school_id: team.school_id.clone(),
                status: "active".into(),
                years: r.experience_years.as_ref().map(|m| rng.range(m.min, m.max)).unwrap_or(0),
                style: rng.pick(&r.styles).cloned().unwrap_or_default(),
                stats: roll_stats(&mut rng, r, bonus),
                risk_tolerance: r.risk_tolerance.as_ref().map(|m| rng.range(m.min, m.max)).unwrap_or(50),
                training_buff: String::new(),
                joined_season: p.season_year,
            });
        }

        // ── 구단주 1명 ────────────────────────────────────────
        {
            let mut rng = Rng::new(team_seed ^ hash_str("owner"));
            let r = &p.rules.owner;
            let mut stats = roll_stats(&mut rng, r, 0); // 구단주는 리그·전력 보정 대신 자원 보정
            if let Some(adj) = r.resource_bonus.get(&team.resource) {
                for (k, v) in adj {
                    if let Some(cur) = stats.get_mut(k) {
                        *cur = clamp(*cur + v, 20, 95);
                    }
                }
            }
            out.push(StaffRow {
                staff_id: format!("staff:{}_OWN", team.team_id),
                name: gen_name(&mut rng, &p.surnames, &p.given_names),
                name_en: gen_name_en(&mut rng, &p.surnames_en, &p.given_names_en),
                role: "owner".into(),
                age: rng.range(r.age.min, r.age.max),
                team_id: team.team_id.clone(),
                league_id: team.league_id.clone(),
                school_id: team.school_id.clone(),
                status: "active".into(),
                years: r.tenure_years.as_ref().map(|m| rng.range(m.min, m.max)).unwrap_or(0),
                style: rng.pick(&r.styles).cloned().unwrap_or_default(),
                stats,
                risk_tolerance: 50,
                training_buff: String::new(),
                joined_season: p.season_year,
            });
        }

        // ── 코치 N명 (자원 등급별) ────────────────────────────
        {
            let r = &p.rules.coach;
            let count_rule = p.rules.coach_count.get(&team.resource);
            let mut count_rng = Rng::new(team_seed ^ hash_str("coach_count"));
            let n = match count_rule {
                Some(m) => count_rng.range(m.min, m.max),
                None => 3,
            };
            for i in 0..n {
                let mut rng = Rng::new(team_seed ^ hash_str(&format!("coach{}", i)));
                // 역할 6종 순환 배정 — 한 팀에 같은 전문이 몰리지 않는다
                let spec = r.specialties.get(i as usize % r.specialties.len().max(1));
                let mut stats = roll_stats(&mut rng, r, bonus);
                let mut buff = String::new();
                if let (Some(sp), Some(sb)) = (spec, &r.specialty_boost) {
                    for key in &sp.boost {
                        if let Some(cur) = stats.get_mut(key) {
                            *cur = clamp(*cur + sb.amount, 20, 95);
                        }
                    }
                    let teaching = *stats.get("teaching").unwrap_or(&50);
                    let v = (teaching + sb.buff_divisor / 2) / sb.buff_divisor;
                    buff = sp.buff.replace("{v}", &v.to_string());
                }
                out.push(StaffRow {
                    staff_id: format!("staff:{}_COA{}", team.team_id, i + 1),
                    name: gen_name(&mut rng, &p.surnames, &p.given_names),
                    name_en: gen_name_en(&mut rng, &p.surnames_en, &p.given_names_en),
                    role: "coach".into(),
                    age: rng.range(r.age.min, r.age.max),
                    team_id: team.team_id.clone(),
                    league_id: team.league_id.clone(),
                    school_id: team.school_id.clone(),
                    status: "active".into(),
                    years: r.experience_years.as_ref().map(|m| rng.range(m.min, m.max)).unwrap_or(0),
                    style: spec.map(|s| s.name.clone()).unwrap_or_default(),
                    stats,
                    risk_tolerance: 50,
                    training_buff: buff,
                    joined_season: p.season_year,
                });
            }
        }
    }
    out
}
