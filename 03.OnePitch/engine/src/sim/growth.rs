use rand::Rng;
use serde_json::{Map, Value};

/// [01_선수_능력치](../../../02_기획/육성코어/01_선수_능력치.md) §2·§3의 노출
/// 스탯 9종 — `sim::roster`의 PITCHER_STATS/BATTER_STATS와 동일 집합(성장은
/// 생성과 같은 스탯 카탈로그를 공유). 히든 3종(천재성·인성·성실함)은 성장의
/// 대상이 아니라 성장을 좌우하는 변수라 여기 안 들어간다.
pub const PITCHER_EXPOSED: [&str; 9] = ["구속", "체력", "회복력", "제구", "구위", "경기운영", "클러치", "침착함", "리더십"];
pub const BATTER_EXPOSED: [&str; 9] = ["파워", "스피드", "체력", "컨택", "선구안", "수비", "클러치", "침착함", "리더십"];

pub fn exposed_stats_for(position: &str) -> &'static [&'static str; 9] {
    if position == "선발투수" || position == "구원투수" {
        &PITCHER_EXPOSED
    } else {
        &BATTER_EXPOSED
    }
}

/// [01_선수_능력치](../../../02_기획/육성코어/01_선수_능력치.md) §7이 확정한
/// 전 시스템 공통 스케일 — 성장은 이 상한을 절대 넘지 않는다.
const STAT_HARD_CAP: f64 = 80.0;

/// 주간 XP 획득량 상한 — [04_성장_곡선](../../../02_기획/육성코어/04_성장_곡선.md)
/// §5가 "XP 임계값 정확한 계수는 스탯 스케일 확정 후"라 명시한 placeholder.
/// Phase I8 시뮬 하네스에서 재조정 대상.
const WEEKLY_XP_MAX: f64 = 8.0;

/// 다음 +1에 필요한 XP — 스탯이 높을수록 더 많이 필요("점진적 임계값
/// 곡선", §2) 하는 선형 placeholder. `genius`(천재성, 20~80 스케일)를
/// 넘어선 구간은 "재능 캡" 취지를 반영해 임계값을 3배로 올려 성장을 급격히
/// 둔화시키되(§2 "상한에 영향") 완전 차단하지는 않는다 — 절대 상한은
/// STAT_HARD_CAP 하나로 통일.
fn xp_threshold(stat_value: f64, genius: f64) -> f64 {
    let base = 20.0 + (stat_value - 20.0).max(0.0) * 2.0;
    if stat_value >= genius {
        base * 3.0
    } else {
        base
    }
}

/// 한 선수의 노출 스탯 9개에 한 주치 XP를 누적하고, 임계값을 넘긴 만큼
/// 스탯을 올린다(몰아서 큰 XP를 받으면 한 주에 여러 단계 성장 가능 —
/// §2 "변환 시점 = 매주, 임계값 돌파하면 즉시 반영"). `genius`가 높을수록
/// 주간 XP 획득 자체도 더 많다(§2 "천재성이... 기울기(성장 속도) 영향").
/// `stats`/`xp`는 in-place로 갱신된다.
pub fn apply_weekly_growth(rng: &mut impl Rng, exposed: &[&str; 9], stats: &mut Map<String, Value>, xp: &mut Map<String, Value>, genius: f64) {
    let xp_multiplier = 0.5 + genius / 80.0; // 20~80 스케일에서 대략 0.75~1.5배
    for stat in exposed {
        let gained = rng.gen_range(0.0..=WEEKLY_XP_MAX) * xp_multiplier;
        let mut stat_value = stats.get(*stat).and_then(|v| v.as_f64()).unwrap_or(20.0);
        let mut remaining_xp = xp.get(*stat).and_then(|v| v.as_f64()).unwrap_or(0.0) + gained;

        while stat_value < STAT_HARD_CAP && remaining_xp >= xp_threshold(stat_value, genius) {
            remaining_xp -= xp_threshold(stat_value, genius);
            stat_value += 1.0;
        }
        stat_value = stat_value.min(STAT_HARD_CAP);

        stats.insert((*stat).to_string(), Value::from(stat_value));
        xp.insert((*stat).to_string(), Value::from(remaining_xp));
    }
}

/// [01_선수_능력치](../../../02_기획/육성코어/01_선수_능력치.md) §2·§3의
/// "피지컬" 카테고리 3종 — [04_성장_곡선](../../../02_기획/육성코어/04_성장_곡선.md)
/// §3이 "피지컬은 먼저 꺾이고 기술·멘탈은 유지·성장 가능"이라 확정한 대로,
/// 하락(노쇠)은 이 서브셋에만 적용된다.
pub const PITCHER_PHYSICAL: [&str; 3] = ["구속", "체력", "회복력"];
pub const BATTER_PHYSICAL: [&str; 3] = ["파워", "스피드", "체력"];

fn physical_stats_for(position: &str) -> &'static [&'static str; 3] {
    if position == "선발투수" || position == "구원투수" {
        &PITCHER_PHYSICAL
    } else {
        &BATTER_PHYSICAL
    }
}

const STAT_FLOOR: f64 = 20.0;

/// 하락 시작 나이 기본값 — §5 "정확한 하락률은 스탯 스케일 확정 후"라
/// placeholder. 부상 이력(가중합, `sim::injury::severity_weight` 누적)이
/// 많을수록 앞당겨지고(§4 "부상 이력 누적될수록 조기 하락"), 성실함이
/// 높을수록 늦춰진다(§4 "성실함... 자기관리 잘하는 선수는 하락 지연").
const BASE_DECLINE_START_AGE: f64 = 30.0;
const MIN_DECLINE_START_AGE: f64 = 22.0;

fn decline_start_age(injury_weight: f64, conscientiousness: f64) -> f64 {
    let injury_penalty = injury_weight * 0.3;
    let conscientious_bonus = (conscientiousness - 50.0) / 50.0 * 2.0;
    (BASE_DECLINE_START_AGE - injury_penalty + conscientious_bonus).max(MIN_DECLINE_START_AGE)
}

/// 주간 하락률 — placeholder(§5 "하락기 정확한 하락률(연간 몇% 등)은 스탯
/// 스케일 확정 후"). 하한은 [01_선수_능력치](../../../02_기획/육성코어/01_선수_능력치.md)
/// §7의 스케일 최저치 20.
const WEEKLY_DECLINE_RATE: f64 = 0.05;

/// 나이가 개인별 하락 시작 연령을 넘긴 선수의 피지컬 스탯 3종을 매주
/// 소폭 낮춘다(§3 "하락기 — 나이 → 노쇠"). 기술·멘탈 스탯은 이 함수가
/// 건드리지 않음 — `apply_weekly_growth`가 계속 그쪽을 성장시킨다
/// (같은 주에 두 함수를 순서대로 호출하면 §1 "상승분과 하락분의 순합이
/// 그 해 변화"가 자연히 성립).
pub fn apply_aging_decline(position: &str, age: i64, stats: &mut Map<String, Value>, injury_weight: f64, conscientiousness: f64) {
    if (age as f64) < decline_start_age(injury_weight, conscientiousness) {
        return;
    }
    for stat in physical_stats_for(position) {
        let v = stats.get(*stat).and_then(|x| x.as_f64()).unwrap_or(STAT_FLOOR);
        stats.insert((*stat).to_string(), Value::from((v - WEEKLY_DECLINE_RATE).max(STAT_FLOOR)));
    }
}

/// 현역 공백 중 하락률 — [03_병역](../../../02_기획/03_병역.md) §8 "피지컬만
/// 소폭 하락, 기술·멘탈은 안 늘지도 안 줄지도 않는다"의 수치화. 나이 기반
/// 하락(`WEEKLY_DECLINE_RATE`)보다 다소 빠르게 잡음 — "감이 무뎌졌다"는
/// 체감을 주는 서사적 의도. 정확한 하락률은 §10 "스탯 스케일 확정 후"라
/// placeholder.
const MILITARY_WEEKLY_DECLINE_RATE: f64 = 0.08;

/// 복무 중인 선수의 피지컬 스탯만 매주 소폭 낮춘다(§8) — 나이 기반
/// `apply_aging_decline`과 달리 복무 여부만으로 트리거되는 별도 경로.
/// 복무 중에는 `apply_weekly_growth`를 아예 건너뛰므로(기술·멘탈 불변)
/// 호출부(`process_week`)가 이 함수만 단독으로 호출한다.
pub fn apply_military_decline(position: &str, stats: &mut Map<String, Value>) {
    for stat in physical_stats_for(position) {
        let v = stats.get(*stat).and_then(|x| x.as_f64()).unwrap_or(STAT_FLOOR);
        stats.insert((*stat).to_string(), Value::from((v - MILITARY_WEEKLY_DECLINE_RATE).max(STAT_FLOOR)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn stats_at(value: f64, exposed: &[&str; 9]) -> Map<String, Value> {
        exposed.iter().map(|s| (s.to_string(), Value::from(value))).collect()
    }

    fn zero_xp(exposed: &[&str; 9]) -> Map<String, Value> {
        exposed.iter().map(|s| (s.to_string(), Value::from(0.0))).collect()
    }

    #[test]
    fn exposed_stats_for_distinguishes_pitcher_and_batter() {
        assert_eq!(exposed_stats_for("선발투수"), &PITCHER_EXPOSED);
        assert_eq!(exposed_stats_for("구원투수"), &PITCHER_EXPOSED);
        assert_eq!(exposed_stats_for("타자"), &BATTER_EXPOSED);
        assert_eq!(exposed_stats_for("유격수"), &BATTER_EXPOSED);
    }

    #[test]
    fn same_seed_produces_identical_growth() {
        let mut stats_a = stats_at(50.0, &BATTER_EXPOSED);
        let mut xp_a = zero_xp(&BATTER_EXPOSED);
        let mut rng_a = ChaCha8Rng::seed_from_u64(7);
        apply_weekly_growth(&mut rng_a, &BATTER_EXPOSED, &mut stats_a, &mut xp_a, 60.0);

        let mut stats_b = stats_at(50.0, &BATTER_EXPOSED);
        let mut xp_b = zero_xp(&BATTER_EXPOSED);
        let mut rng_b = ChaCha8Rng::seed_from_u64(7);
        apply_weekly_growth(&mut rng_b, &BATTER_EXPOSED, &mut stats_b, &mut xp_b, 60.0);

        assert_eq!(stats_a, stats_b);
        assert_eq!(xp_a, xp_b);
    }

    #[test]
    fn stat_grows_over_many_weeks_and_never_exceeds_hard_cap() {
        let mut stats = stats_at(20.0, &BATTER_EXPOSED);
        let mut xp = zero_xp(&BATTER_EXPOSED);
        let mut rng = ChaCha8Rng::seed_from_u64(99);

        for _ in 0..500 {
            apply_weekly_growth(&mut rng, &BATTER_EXPOSED, &mut stats, &mut xp, 80.0);
        }

        for stat in BATTER_EXPOSED {
            let v = stats.get(stat).unwrap().as_f64().unwrap();
            assert!(v > 20.0, "{stat} should have grown from baseline, got {v}");
            assert!(v <= 80.0, "{stat} exceeded hard cap: {v}");
        }
    }

    #[test]
    fn higher_genius_grows_faster_on_average() {
        let weeks = 20;
        let run = |genius: f64, seed: u64| -> f64 {
            let mut stats = stats_at(20.0, &BATTER_EXPOSED);
            let mut xp = zero_xp(&BATTER_EXPOSED);
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            for _ in 0..weeks {
                apply_weekly_growth(&mut rng, &BATTER_EXPOSED, &mut stats, &mut xp, genius);
            }
            stats.values().map(|v| v.as_f64().unwrap()).sum()
        };

        let mut low_total = 0.0;
        let mut high_total = 0.0;
        for seed in 0..30u64 {
            low_total += run(25.0, seed);
            high_total += run(80.0, seed);
        }
        assert!(high_total > low_total, "high genius total={high_total} low genius total={low_total}");
    }

    #[test]
    fn zero_xp_gain_leaves_stat_unchanged() {
        // genius far below current stat -> threshold triples, and with a
        // seed/duration combo that never reaches even the tripled
        // threshold, the stat must stay put (no phantom growth).
        let mut stats = stats_at(70.0, &BATTER_EXPOSED);
        let mut xp = zero_xp(&BATTER_EXPOSED);
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        apply_weekly_growth(&mut rng, &BATTER_EXPOSED, &mut stats, &mut xp, 20.0);

        for stat in BATTER_EXPOSED {
            let v = stats.get(stat).unwrap().as_f64().unwrap();
            assert!((69.9..=71.0).contains(&v), "{stat} moved further than one week of XP allows: {v}");
        }
    }

    #[test]
    fn no_decline_before_start_age() {
        let mut stats = stats_at(50.0, &PITCHER_EXPOSED);
        apply_aging_decline("선발투수", 25, &mut stats, 0.0, 50.0);
        assert_eq!(stats.get("구속").unwrap().as_f64().unwrap(), 50.0);
    }

    #[test]
    fn decline_only_touches_physical_stats() {
        let mut stats = stats_at(50.0, &PITCHER_EXPOSED);
        apply_aging_decline("선발투수", 35, &mut stats, 0.0, 50.0);

        for stat in PITCHER_PHYSICAL {
            assert!(stats.get(stat).unwrap().as_f64().unwrap() < 50.0, "{stat} should have declined");
        }
        for stat in ["제구", "구위", "경기운영", "클러치", "침착함", "리더십"] {
            assert_eq!(stats.get(stat).unwrap().as_f64().unwrap(), 50.0, "{stat} (technical/mental) must not decline");
        }
    }

    #[test]
    fn higher_injury_weight_brings_decline_start_earlier() {
        let mut low_injury = stats_at(50.0, &PITCHER_EXPOSED);
        apply_aging_decline("선발투수", 28, &mut low_injury, 0.0, 50.0);
        let mut high_injury = stats_at(50.0, &PITCHER_EXPOSED);
        apply_aging_decline("선발투수", 28, &mut high_injury, 20.0, 50.0);

        assert_eq!(low_injury.get("구속").unwrap().as_f64().unwrap(), 50.0, "no injury history -> too young to decline yet");
        assert!(high_injury.get("구속").unwrap().as_f64().unwrap() < 50.0, "heavy injury history should push decline earlier");
    }

    #[test]
    fn higher_conscientiousness_delays_decline() {
        let mut low_c = stats_at(50.0, &PITCHER_EXPOSED);
        apply_aging_decline("선발투수", 30, &mut low_c, 0.0, 20.0);
        let mut high_c = stats_at(50.0, &PITCHER_EXPOSED);
        apply_aging_decline("선발투수", 30, &mut high_c, 0.0, 80.0);

        assert!(low_c.get("구속").unwrap().as_f64().unwrap() < 50.0, "low conscientiousness -> already declining at 30");
        assert_eq!(high_c.get("구속").unwrap().as_f64().unwrap(), 50.0, "high conscientiousness delays decline past 30");
    }

    #[test]
    fn decline_never_drops_below_stat_floor() {
        let mut stats = stats_at(20.05, &PITCHER_EXPOSED);
        for _ in 0..100 {
            apply_aging_decline("선발투수", 40, &mut stats, 0.0, 50.0);
        }
        for stat in PITCHER_PHYSICAL {
            assert!(stats.get(stat).unwrap().as_f64().unwrap() >= 20.0);
        }
    }

    #[test]
    fn military_decline_only_touches_physical_stats() {
        let mut stats = stats_at(50.0, &BATTER_EXPOSED);
        apply_military_decline("타자", &mut stats);

        for stat in BATTER_PHYSICAL {
            assert!(stats.get(stat).unwrap().as_f64().unwrap() < 50.0, "{stat} should decline during service");
        }
        for stat in ["컨택", "선구안", "수비", "클러치", "침착함", "리더십"] {
            assert_eq!(stats.get(stat).unwrap().as_f64().unwrap(), 50.0, "{stat} (technical/mental) must not change during service");
        }
    }

    #[test]
    fn military_decline_never_drops_below_stat_floor() {
        let mut stats = stats_at(20.05, &BATTER_EXPOSED);
        for _ in 0..100 {
            apply_military_decline("타자", &mut stats);
        }
        for stat in BATTER_PHYSICAL {
            assert!(stats.get(stat).unwrap().as_f64().unwrap() >= 20.0);
        }
    }
}
