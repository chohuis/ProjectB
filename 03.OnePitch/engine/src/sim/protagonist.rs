use rand::seq::SliceRandom;
use rand::Rng;
use serde_json::{json, Map, Value};

use crate::sim::growth::PITCHER_EXPOSED;

/// [07_주인공_생성](../../../02_기획/07_주인공_생성.md) §4의 투수 타입 4종.
pub const ARCHETYPES: [&str; 4] = ["강속구형", "제구형", "체력형", "돌부처형"];

const FASTBALL_SECOND_PITCH_CANDIDATES: [&str; 2] = ["투심 패스트볼", "커터"];
const CONTROL_TYPE_SECOND_PITCH_CANDIDATES: [&str; 6] = ["체인지업", "포크볼", "싱커", "슬라이더", "커브", "스위퍼"];

/// 타입별 우세 스탯 — §4 표. `primary`는 상단 밴드, `minor`는 "(+구위
/// 소폭)" 같은 괄호 표기를 반영한 중간 가산 밴드(체력형·돌부처형은 우세
/// 스탯이 2개뿐이라 minor 없음).
pub fn archetype_bands(archetype: &str) -> anyhow::Result<(&'static [&'static str], &'static [&'static str])> {
    match archetype {
        "강속구형" => Ok((&["구속"], &["구위"])),
        "제구형" => Ok((&["제구"], &["경기운영"])),
        "체력형" => Ok((&["체력", "회복력"], &[])),
        "돌부처형" => Ok((&["클러치", "침착함"], &[])),
        other => anyhow::bail!("unknown archetype: {other}"),
    }
}

/// 타입별 2구종 후보 풀(전체) — §6 표. 강속구형·체력형·돌부처형은 패스트볼류
/// (투심·커터)만, 제구형만 오프스피드·브레이킹볼 6종에 접근. 너클볼은
/// §6 "이질적 메커니즘이라 항상 후보 제외"에 따라 어느 풀에도 없음.
pub fn full_second_pitch_pool(archetype: &str) -> anyhow::Result<&'static [&'static str]> {
    match archetype {
        "강속구형" | "체력형" | "돌부처형" => Ok(&FASTBALL_SECOND_PITCH_CANDIDATES),
        "제구형" => Ok(&CONTROL_TYPE_SECOND_PITCH_CANDIDATES),
        other => anyhow::bail!("unknown archetype: {other}"),
    }
}

/// `pitch`가 그 타입의 2구종 후보 풀(전체, 화면 표시용 3~4개 부분집합이
/// 아니라)에 속하는지 — 최종 선택값을 검증하는 시스템 경계 체크.
pub fn is_valid_second_pitch(archetype: &str, pitch: &str) -> anyhow::Result<bool> {
    Ok(full_second_pitch_pool(archetype)?.contains(&pitch))
}

/// 화면에 보여줄 2구종 후보 목록 — §6 "제구형은 3~4개 제시, 나머지는 2개
/// 그대로". 코치 가중("학교 코치 보너스가 후보 노출 확률에 반영")은 스태프
/// 시스템이 아직 없어(I3에서 스코프 아웃) 균등 랜덤으로 단순화 —
/// 10_구현_Phase_계획.md에 기록.
pub fn second_pitch_candidates(rng: &mut impl Rng, archetype: &str) -> anyhow::Result<Vec<String>> {
    let pool = full_second_pitch_pool(archetype)?;
    if pool.len() <= 2 {
        return Ok(pool.iter().map(|s| s.to_string()).collect());
    }
    let mut shuffled: Vec<&str> = pool.to_vec();
    shuffled.shuffle(rng);
    let n = if rng.gen_bool(0.5) { 3 } else { 4 };
    Ok(shuffled.into_iter().take(n).map(|s| s.to_string()).collect())
}

// 세 밴드는 겹치지 않게 잡음(20~35 구간을 3등분) — §4가 "우세 스탯
// 1~2개는 상단, 나머지는 하단"이라고만 정해뒀고 "(+구위 소폭)" 같은
// 중간 가산은 정확한 수치가 없어 정한 placeholder 경계.
const LOWER_BAND: (f64, f64) = (20.0, 26.0);
const MINOR_BAND: (f64, f64) = (26.0, 30.0);
const UPPER_BAND: (f64, f64) = (30.0, 35.0);
const HIDDEN_BAND: (f64, f64) = (20.0, 80.0);

/// 시작 능력치(노출 9종 + 히든 3종) 생성 — §4 "우세 스탯 1~2개는 상단
/// 밴드, 나머지는 하단 밴드"·§5 "히든스탯은 완전 비공개 랜덤"(학교·좌우투·
/// 타입과 무관하므로 전체 스케일 20~80에서 균등 추출). 정확한 밴드 경계는
/// §8 "스탯 스케일 확정 후"라 placeholder.
pub fn generate_starting_stats(rng: &mut impl Rng, archetype: &str) -> anyhow::Result<Map<String, Value>> {
    let (primary, minor) = archetype_bands(archetype)?;
    let mut stats = Map::new();
    for stat in PITCHER_EXPOSED {
        let (lo, hi) = if primary.contains(&stat) {
            UPPER_BAND
        } else if minor.contains(&stat) {
            MINOR_BAND
        } else {
            LOWER_BAND
        };
        stats.insert(stat.to_string(), json!(rng.gen_range(lo..hi)));
    }
    for hidden in ["천재성", "인성", "성실함"] {
        stats.insert(hidden.to_string(), json!(rng.gen_range(HIDDEN_BAND.0..HIDDEN_BAND.1)));
    }
    Ok(stats)
}

/// 캐릭터 생성 화면 투수 타입 카드 그래프용(대화 2026-07-23) — 노출 스탯
/// 9종 각각의 밴드 중앙값(실제로 뽑히는 값의 중심). 그래프 길이를
/// "이론상 최대"가 아니라 실제 생성값 근처로 보정하기 위함 — 밴드 자체가
/// 20~35 구간(전체 스케일 20~80의 일부)이라 막대가 끝까지 안 채워지는
/// 게 정상이다.
pub fn archetype_stat_midpoints(archetype: &str) -> anyhow::Result<Vec<f64>> {
    let (primary, minor) = archetype_bands(archetype)?;
    Ok(PITCHER_EXPOSED
        .iter()
        .map(|&stat| {
            let (lo, hi) = if primary.contains(&stat) {
                UPPER_BAND
            } else if minor.contains(&stat) {
                MINOR_BAND
            } else {
                LOWER_BAND
            };
            (lo + hi) / 2.0
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn fastball_archetype_stats_favor_the_documented_primary_stat() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let stats = generate_starting_stats(&mut rng, "강속구형").unwrap();
        let velocity = stats.get("구속").unwrap().as_f64().unwrap();
        let stuff = stats.get("구위").unwrap().as_f64().unwrap();
        let control = stats.get("제구").unwrap().as_f64().unwrap();
        assert!((30.0..35.0).contains(&velocity), "primary stat out of upper band: {velocity}");
        assert!((26.0..30.0).contains(&stuff), "minor stat out of minor band: {stuff}");
        assert!((20.0..26.0).contains(&control), "unrelated stat out of lower band: {control}");
    }

    #[test]
    fn dual_primary_archetype_boosts_both_stats() {
        let mut rng = ChaCha8Rng::seed_from_u64(2);
        let stats = generate_starting_stats(&mut rng, "체력형").unwrap();
        assert!((30.0..35.0).contains(&stats.get("체력").unwrap().as_f64().unwrap()));
        assert!((30.0..35.0).contains(&stats.get("회복력").unwrap().as_f64().unwrap()));
        assert!((20.0..26.0).contains(&stats.get("클러치").unwrap().as_f64().unwrap()));
    }

    #[test]
    fn unknown_archetype_is_rejected() {
        let mut rng = ChaCha8Rng::seed_from_u64(3);
        assert!(generate_starting_stats(&mut rng, "만능형").is_err());
        assert!(second_pitch_candidates(&mut rng, "만능형").is_err());
    }

    #[test]
    fn hidden_stats_are_generated_regardless_of_archetype() {
        let mut rng = ChaCha8Rng::seed_from_u64(4);
        let stats = generate_starting_stats(&mut rng, "제구형").unwrap();
        for hidden in ["천재성", "인성", "성실함"] {
            let v = stats.get(hidden).unwrap().as_f64().unwrap();
            assert!((20.0..80.0).contains(&v), "{hidden} out of hidden band: {v}");
        }
    }

    #[test]
    fn same_seed_produces_identical_stats() {
        let mut rng_a = ChaCha8Rng::seed_from_u64(77);
        let mut rng_b = ChaCha8Rng::seed_from_u64(77);
        assert_eq!(generate_starting_stats(&mut rng_a, "돌부처형").unwrap(), generate_starting_stats(&mut rng_b, "돌부처형").unwrap());
    }

    #[test]
    fn fastball_archetypes_always_offer_exactly_two_candidates() {
        let mut rng = ChaCha8Rng::seed_from_u64(5);
        for archetype in ["강속구형", "체력형", "돌부처형"] {
            let candidates = second_pitch_candidates(&mut rng, archetype).unwrap();
            assert_eq!(candidates.len(), 2);
            assert!(candidates.contains(&"투심 패스트볼".to_string()));
            assert!(candidates.contains(&"커터".to_string()));
        }
    }

    #[test]
    fn control_type_offers_three_or_four_candidates_from_the_six_pool() {
        let mut rng = ChaCha8Rng::seed_from_u64(6);
        for _ in 0..20 {
            let candidates = second_pitch_candidates(&mut rng, "제구형").unwrap();
            assert!(candidates.len() == 3 || candidates.len() == 4, "got {}", candidates.len());
            for c in &candidates {
                assert!(CONTROL_TYPE_SECOND_PITCH_CANDIDATES.contains(&c.as_str()));
            }
        }
    }

    #[test]
    fn knuckleball_never_appears_as_a_candidate() {
        let mut rng = ChaCha8Rng::seed_from_u64(7);
        for archetype in ARCHETYPES {
            for _ in 0..10 {
                let candidates = second_pitch_candidates(&mut rng, archetype).unwrap();
                assert!(!candidates.contains(&"너클볼".to_string()));
            }
        }
    }
}
