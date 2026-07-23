use std::collections::HashMap;

use rand::seq::SliceRandom;
use rand::Rng;
use serde_json::{json, Value};

use crate::data::content::TeamForRoster;

pub struct GeneratedPlayer {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub position: String,
    pub age: i64,
    pub form: f64,
    pub personality: Value,
    pub stats: Value,
    pub xp: Value,
    pub live_state: Value,
    /// Some for pitchers only — batters don't have a pitch repertoire.
    pub pitches: Option<Value>,
}

const RELATION_OPTIONS: [&str; 5] = ["사교적", "내성적", "타산적", "온화함", "무뚝뚝"];
const COMPETITIVE_OPTIONS: [&str; 5] = ["승부사", "완벽주의", "안분", "야심가", "헌신형"];
const EMOTIONAL_OPTIONS: [&str; 5] = ["침착형", "열정형", "예민형", "낙천형", "완고함"];

/// 타자 포지션 배정 순환 — 포수는 체력 소모가 커 백업이 더 필요하다는
/// 현실적 이유로 다른 포지션의 약 2배 비중을 준다(대화 2026-07-23).
/// `batter_n` 크기와 무관하게(전체 생성이든 `generate_freshmen`의 소량
/// 충원이든) 항상 같은 비율을 유지하도록 라운드로빈 사이클 자체에
/// 포수를 두 번 넣는 단순한 방식 — 현재 로스터의 포지션별 부족분을
/// 추적하는 상태 기반 방식보다 훨씬 가볍다(D그룹 placeholder 수준).
const BATTER_POSITION_CYCLE: [&str; 9] = ["포수", "1루수", "2루수", "3루수", "유격수", "좌익수", "중견수", "우익수", "포수"];

const PITCHER_STATS: [&str; 9] = [
    "구속", "체력", "회복력", "제구", "구위", "경기운영", "클러치", "침착함", "리더십",
];
const BATTER_STATS: [&str; 9] = [
    "파워", "스피드", "체력", "컨택", "선구안", "수비", "클러치", "침착함", "리더십",
];
const HIDDEN_STATS: [&str; 3] = ["천재성", "인성", "성실함"];

/// 07_주인공_생성.md §0 고교1년=17세와 일관되게 리그 성격에 맞춰 잡은 나이 구간
/// — generation_rules처럼 확정 소스가 없는 placeholder(I3 계획 문서 참고).
/// `league:hs`는 17/18/19세=1/2/3학년, `sim::career::HS_GRADUATION_AGE=20`(졸업
/// 시점)과 정확히 맞물린다(대화 2026-07-23 — 예전엔 `(15,18)`이라 주인공
/// 학년 체계와 안 맞았음). `season_rollover`의 나이 증가→`sim::npc::check_retirement`
/// (이 함수의 상한을 그대로 씀)→`generate_freshmen` 파이프라인이 이 범위만으로
/// "매년 3학년 은퇴, 신입생 충원"을 자연스럽게 수행한다.
pub fn age_range(league_id: &str) -> (i64, i64) {
    match league_id {
        "league:hs" => (17, 19),
        "league:univ" => (19, 22),
        "league:independent" => (19, 29),
        "league:pro_farm" => (19, 27),
        "league:pro" => (20, 40),
        _ => (18, 35),
    }
}

/// Merges up to 3 personality_rules contexts (philosophy/status/role) into one
/// weight table per slot. Missing contexts or missing options default to
/// weight 1.0 (uniform) rather than erroring — 26개 컨텍스트가 전부 채워져
///있다는 보장이 없어도(테스트 픽스처 등) 생성이 항상 진행되도록.
pub struct PersonalityWeights {
    relation: HashMap<String, f64>,
    competitive: HashMap<String, f64>,
    emotional: HashMap<String, f64>,
}

impl PersonalityWeights {
    pub fn merge(contexts: &[Option<Value>]) -> Self {
        let mut relation = HashMap::new();
        let mut competitive = HashMap::new();
        let mut emotional = HashMap::new();
        for ctx in contexts.iter().flatten() {
            accumulate(&mut relation, ctx.get("relation"));
            accumulate(&mut competitive, ctx.get("competitive"));
            accumulate(&mut emotional, ctx.get("emotional"));
        }
        Self {
            relation,
            competitive,
            emotional,
        }
    }
}

fn accumulate(target: &mut HashMap<String, f64>, slot: Option<&Value>) {
    let Some(map) = slot.and_then(|v| v.as_object()) else {
        return;
    };
    for (k, v) in map {
        let w = v.as_f64().unwrap_or(1.0);
        *target.entry(k.clone()).or_insert(0.0) += w;
    }
}

fn weighted_pick(rng: &mut impl Rng, weights: &HashMap<String, f64>, options: &[&str; 5]) -> String {
    let total: f64 = options.iter().map(|o| weights.get(*o).copied().unwrap_or(1.0)).sum();
    let mut roll = rng.gen_range(0.0..total);
    for o in options {
        let w = weights.get(*o).copied().unwrap_or(1.0);
        if roll < w {
            return o.to_string();
        }
        roll -= w;
    }
    options[options.len() - 1].to_string()
}

/// `sim::manager`가 감독 성격 생성에도 그대로 재사용(팀 특성 3슬롯과
/// 동일한 가중 랜덤 패턴 — `콘텐츠/01_캐릭터.md` §3 "역할·소속 가중 랜덤").
pub(crate) fn pick_personality(rng: &mut impl Rng, weights: &PersonalityWeights) -> Value {
    json!({
        "relation": weighted_pick(rng, &weights.relation, &RELATION_OPTIONS),
        "competitive": weighted_pick(rng, &weights.competitive, &COMPETITIVE_OPTIONS),
        "emotional": weighted_pick(rng, &weights.emotional, &EMOTIONAL_OPTIONS),
    })
}

fn gen_stats(rng: &mut impl Rng, exposed: &[&str; 9], stat_min: f64, stat_max: f64) -> Value {
    let mut map = serde_json::Map::new();
    for s in exposed {
        map.insert((*s).to_string(), json!(rng.gen_range(stat_min..=stat_max)));
    }
    for s in HIDDEN_STATS {
        map.insert(s.to_string(), json!(rng.gen_range(stat_min..=stat_max)));
    }
    Value::Object(map)
}

fn zero_xp(exposed: &[&str; 9]) -> Value {
    let mut map = serde_json::Map::new();
    for s in exposed.iter().chain(HIDDEN_STATS.iter()) {
        map.insert((*s).to_string(), json!(0));
    }
    Value::Object(map)
}

pub(crate) fn gen_name(rng: &mut impl Rng, surnames: &[String], given: &[String]) -> String {
    let surname = surnames.choose(rng).cloned().unwrap_or_default();
    let g = given.choose(rng).cloned().unwrap_or_default();
    format!("{surname}{g}")
}

fn gen_pitches(rng: &mut impl Rng, secondary: &[String]) -> Value {
    let mut pitches = vec!["포심 패스트볼".to_string()];
    if !secondary.is_empty() && rng.gen_bool(0.5) {
        if let Some(extra) = secondary.choose(rng) {
            pitches.push(extra.clone());
        }
    }
    json!(pitches)
}

/// Generates one team's full roster. Pure function (no DB access) so it's
/// unit-testable in isolation — the RNG stream must be consumed in a fixed
/// order (pitchers first, then batters, each name→age→stats→personality) for
/// determinism to hold across re-runs with the same seed.
#[allow(clippy::too_many_arguments)]
pub fn generate_team(
    rng: &mut impl Rng,
    team: &TeamForRoster,
    league_id: &str,
    rule: &Value,
    kr_surnames: &[String],
    kr_given: &[String],
    secondary_pitches: &[String],
    personality_weights: &PersonalityWeights,
    id_prefix: &str,
    seq: &mut u64,
) -> Vec<GeneratedPlayer> {
    let roster_size = rule.get("roster_size").and_then(|v| v.as_u64()).unwrap_or(25);
    let pitcher_ratio = rule.get("pitcher_ratio").and_then(|v| v.as_f64()).unwrap_or(0.45);
    let sp_ratio = rule.get("sp_ratio").and_then(|v| v.as_f64()).unwrap_or(0.45);
    let stat_min = rule.get("stat_min").and_then(|v| v.as_f64()).unwrap_or(20.0);
    let stat_max = rule.get("stat_max").and_then(|v| v.as_f64()).unwrap_or(80.0);

    let pitcher_n = ((roster_size as f64) * pitcher_ratio).round() as u64;
    let sp_n = ((pitcher_n as f64) * sp_ratio).round().max(1.0) as u64;
    let batter_n = roster_size.saturating_sub(pitcher_n);

    let (age_min, age_max) = age_range(league_id);
    let mut players = Vec::with_capacity(roster_size as usize);

    // pitchers first (SP block then RP block), then batters round-robin over
    // field positions — order is part of the deterministic RNG contract.
    for i in 0..pitcher_n {
        let position = if i < sp_n { "선발투수" } else { "구원투수" };
        players.push(GeneratedPlayer {
            id: format!("{id_prefix}{seq}"),
            name: gen_name(rng, kr_surnames, kr_given),
            team_id: team.id.clone(),
            position: position.to_string(),
            age: rng.gen_range(age_min..=age_max),
            form: 50.0,
            personality: pick_personality(rng, personality_weights),
            stats: gen_stats(rng, &PITCHER_STATS, stat_min, stat_max),
            xp: zero_xp(&PITCHER_STATS),
            live_state: json!({"피로도": 0, "사기": 50}),
            pitches: Some(gen_pitches(rng, secondary_pitches)),
        });
        *seq += 1;
    }

    for i in 0..batter_n {
        let position = BATTER_POSITION_CYCLE[(i as usize) % BATTER_POSITION_CYCLE.len()];
        players.push(GeneratedPlayer {
            id: format!("{id_prefix}{seq}"),
            name: gen_name(rng, kr_surnames, kr_given),
            team_id: team.id.clone(),
            position: position.to_string(),
            age: rng.gen_range(age_min..=age_max),
            form: 50.0,
            personality: pick_personality(rng, personality_weights),
            stats: gen_stats(rng, &BATTER_STATS, stat_min, stat_max),
            xp: zero_xp(&BATTER_STATS),
            live_state: json!({"피로도": 0, "사기": 50}),
            pitches: None,
        });
        *seq += 1;
    }

    players
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn team() -> TeamForRoster {
        TeamForRoster {
            id: "team:x".to_string(),
            philosophy: "전통/정통".to_string(),
            resource: "안정".to_string(),
            status: "중견".to_string(),
        }
    }

    fn rule() -> Value {
        json!({"roster_size": 10, "pitcher_ratio": 0.4, "sp_ratio": 0.5, "stat_min": 20.0, "stat_max": 80.0})
    }

    fn names() -> (Vec<String>, Vec<String>) {
        (
            vec!["김".to_string(), "이".to_string()],
            vec!["민준".to_string(), "서준".to_string()],
        )
    }

    fn uniform_weights() -> PersonalityWeights {
        PersonalityWeights::merge(&[])
    }

    #[test]
    fn same_seed_produces_identical_roster() {
        let (surnames, given) = names();
        let w = uniform_weights();
        let mut rng1 = ChaCha8Rng::seed_from_u64(42);
        let mut seq1 = 0u64;
        let a = generate_team(&mut rng1, &team(), "league:hs", &rule(), &surnames, &given, &[], &w, "npc:1_", &mut seq1);

        let mut rng2 = ChaCha8Rng::seed_from_u64(42);
        let mut seq2 = 0u64;
        let b = generate_team(&mut rng2, &team(), "league:hs", &rule(), &surnames, &given, &[], &w, "npc:1_", &mut seq2);

        assert_eq!(a.len(), b.len());
        for (pa, pb) in a.iter().zip(b.iter()) {
            assert_eq!(pa.id, pb.id);
            assert_eq!(pa.name, pb.name);
            assert_eq!(pa.position, pb.position);
            assert_eq!(pa.stats, pb.stats);
        }
    }

    #[test]
    fn roster_size_and_position_split_match_rule() {
        let (surnames, given) = names();
        let w = uniform_weights();
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let mut seq = 0u64;
        let players = generate_team(&mut rng, &team(), "league:hs", &rule(), &surnames, &given, &[], &w, "npc:1_", &mut seq);

        assert_eq!(players.len(), 10);
        let pitchers = players.iter().filter(|p| p.pitches.is_some()).count();
        assert_eq!(pitchers, 4); // roster 10 * pitcher_ratio 0.4 = 4
        assert_eq!(players.iter().filter(|p| p.position == "선발투수").count(), 2);
        assert_eq!(players.iter().filter(|p| p.position == "구원투수").count(), 2);
    }

    #[test]
    fn stats_stay_within_generation_rule_band() {
        let (surnames, given) = names();
        let w = uniform_weights();
        let tight_rule = json!({"roster_size": 6, "pitcher_ratio": 0.5, "sp_ratio": 0.5, "stat_min": 40.0, "stat_max": 45.0});
        let mut rng = ChaCha8Rng::seed_from_u64(7);
        let mut seq = 0u64;
        let players = generate_team(&mut rng, &team(), "league:pro", &tight_rule, &surnames, &given, &[], &w, "npc:1_", &mut seq);

        for p in &players {
            for (_, v) in p.stats.as_object().unwrap() {
                let n = v.as_f64().unwrap();
                assert!((40.0..=45.0).contains(&n), "stat {n} out of band");
            }
        }
    }

    #[test]
    fn ids_are_sequential_and_prefixed() {
        let (surnames, given) = names();
        let w = uniform_weights();
        let mut rng = ChaCha8Rng::seed_from_u64(3);
        let mut seq = 5u64;
        let players = generate_team(&mut rng, &team(), "league:hs", &rule(), &surnames, &given, &[], &w, "npc:99_", &mut seq);

        assert_eq!(players[0].id, "npc:99_5");
        assert_eq!(players[1].id, "npc:99_6");
        assert_eq!(seq, 5 + players.len() as u64);
    }

    #[test]
    fn age_range_hs_matches_the_protagonist_graduation_convention() {
        // 17/18/19세 = 1/2/3학년, `sim::career::HS_GRADUATION_AGE`(20세 졸업)와
        // 정확히 맞물려야 `season_rollover`의 세대교체 파이프라인이 "매년
        // 3학년 은퇴, 신입생 충원"으로 자연스럽게 동작한다(대화 2026-07-23).
        assert_eq!(age_range("league:hs"), (17, 19));
        assert_eq!(crate::sim::career::HS_GRADUATION_AGE, 20);
    }

    #[test]
    fn batter_positions_favor_catcher_roughly_two_to_one() {
        let (surnames, given) = names();
        let w = uniform_weights();
        let rule = json!({"roster_size": 45, "pitcher_ratio": 0.0, "sp_ratio": 0.5, "stat_min": 20.0, "stat_max": 50.0});
        let mut rng = ChaCha8Rng::seed_from_u64(11);
        let mut seq = 0u64;
        let players = generate_team(&mut rng, &team(), "league:hs", &rule, &surnames, &given, &[], &w, "npc:1_", &mut seq);

        assert_eq!(players.len(), 45);
        let catchers = players.iter().filter(|p| p.position == "포수").count();
        let first_basemen = players.iter().filter(|p| p.position == "1루수").count();
        assert_eq!(catchers, 10);
        assert_eq!(first_basemen, 5);
        assert_eq!(catchers, first_basemen * 2);
    }
}
