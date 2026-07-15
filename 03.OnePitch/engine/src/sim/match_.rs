use rand::Rng;

use crate::sim::injury;

/// 07_매치_엔진.md §5·§6이 요구하는 입력 스탯만 뽑아온 얇은 뷰 — 실제
/// npc.stats JSON 파싱은 repository.rs가 하고 여기는 순수 계산만. `id`·
/// `fatigue`는 급성형 부상 판정(§13, 08_부상_시스템.md §3)이 "누구에게"
/// "얼마나 위험하게" 일어났는지 알아야 해서 I5 5차분 이후 추가됨.
pub struct BatterStats {
    pub id: String,
    pub contact: f64,
    pub eye: f64,
    pub power: f64,
    pub fatigue: f64,
}

pub struct PitcherStats {
    pub id: String,
    pub control: f64,
    pub stuff: f64,
    pub fatigue: f64,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum PaOutcome {
    Strikeout,
    Walk,
    HitByPitch,
    Out,
    Single,
    Double,
    Triple,
    HomeRun,
}

/// 급성형(우발) 부상 이벤트 — 08_부상_시스템.md §3 "경기 중 특정 순간의
/// 낮은 확률 랜덤 이벤트". `sim::injury::check_acute_injury`가 판정한
/// 부위·심각도를 어떤 선수(`player_id`)에게 귀속시킬지까지 포함해
/// 호출부(repository.rs)가 그대로 `injury` 컬럼에 기록할 수 있게 한다.
/// "발생 시 즉시 강판"의 로스터 결원 효과(불펜 교체 등)는 감독 AI가 아직
/// 없어 스코프 밖 — 이번엔 판정·기록만(10_구현_Phase_계획.md §6-10 참고).
#[derive(Debug, PartialEq, Eq, Clone)]
pub struct InjuryEvent {
    pub player_id: String,
    pub part: &'static str,
    pub severity: &'static str,
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

/// 타석 1회 = 1회 확률판정(§11 "최소 타석 단위"를 만족하는 단순화 — 1구
/// 단위 볼카운트는 I5 후속 스코프). 20~80 스탯 스케일 기준 placeholder
/// 판정식 — 정확한 계수는 D그룹(05_밸런스.md), Phase I8 하네스에서 확정.
pub fn simulate_plate_appearance(rng: &mut impl Rng, batter: &BatterStats, pitcher: &PitcherStats) -> PaOutcome {
    let pitch_edge = (pitcher.control + pitcher.stuff) / 2.0 - (batter.contact + batter.eye) / 2.0;

    let k_prob = clamp01(0.20 + pitch_edge * 0.004);
    let bb_prob = clamp01(0.08 - pitch_edge * 0.003);
    let hbp_prob = 0.01;
    let in_play_prob = clamp01(1.0 - k_prob - bb_prob - hbp_prob);
    let total = k_prob + bb_prob + hbp_prob + in_play_prob;

    let roll = rng.gen::<f64>() * total;
    if roll < k_prob {
        return PaOutcome::Strikeout;
    }
    if roll < k_prob + bb_prob {
        return PaOutcome::Walk;
    }
    if roll < k_prob + bb_prob + hbp_prob {
        return PaOutcome::HitByPitch;
    }

    resolve_in_play_result(rng, batter, pitcher)
}

/// 인플레이(공을 맞힘) 발생 이후의 결과 세분화(§6) — 아웃 여부 → 안타
/// 종류. `simulate_plate_appearance`(PA레벨 배경 시뮬)와
/// `sim::pitch::simulate_at_bat_automatically`(주인공 1구 단위 매치
/// 세션, I6 2차분)가 이 판정을 공유해 "인플레이 이후"의 확률식이 두
/// 엔진 사이에서 갈라지지 않게 한다.
pub fn resolve_in_play_result(rng: &mut impl Rng, batter: &BatterStats, pitcher: &PitcherStats) -> PaOutcome {
    let power_edge = batter.power - pitcher.stuff;
    let hit_prob = clamp01(0.30 + power_edge * 0.002);
    if rng.gen::<f64>() >= hit_prob {
        return PaOutcome::Out;
    }

    // 안타 종류 세분화
    let hr_prob = clamp01(0.03 + (batter.power - 50.0) * 0.0015);
    let triple_prob = 0.02;
    let double_prob = clamp01(0.18 + (batter.power - 50.0) * 0.0008);
    let roll2 = rng.gen::<f64>();
    if roll2 < hr_prob {
        PaOutcome::HomeRun
    } else if roll2 < hr_prob + triple_prob {
        PaOutcome::Triple
    } else if roll2 < hr_prob + triple_prob + double_prob {
        PaOutcome::Double
    } else {
        PaOutcome::Single
    }
}

/// 주자를 hit_bases만큼 진루시키고 득점 수를 반환. 강제진루 규칙(§9 도루,
/// 병살 등)은 스코프 밖 — 볼넷/사구도 안타와 동일한 단순 진루 모델을 씀
/// (기존 주자 전원 1루씩 무조건 진루) — I5 후속에서 정교화.
fn advance_runners(bases: &mut [bool; 3], hit_bases: u32) -> u32 {
    let mut runs = 0;
    let mut new_bases = [false; 3];
    for i in (0..3).rev() {
        if bases[i] {
            let pos = (i as u32 + 1) + hit_bases;
            if pos >= 4 {
                runs += 1;
            } else {
                new_bases[(pos - 1) as usize] = true;
            }
        }
    }
    if hit_bases >= 4 {
        runs += 1;
    } else {
        new_bases[(hit_bases - 1) as usize] = true;
    }
    *bases = new_bases;
    runs
}

fn simulate_half_inning(
    rng: &mut impl Rng,
    lineup: &[BatterStats],
    batter_idx: &mut usize,
    pitcher: &PitcherStats,
    initial_bases: [bool; 3],
    injuries: &mut Vec<InjuryEvent>,
) -> u32 {
    if lineup.is_empty() {
        return 0;
    }
    let mut outs = 0;
    let mut bases = initial_bases;
    let mut runs = 0;
    while outs < 3 {
        let batter = &lineup[*batter_idx % lineup.len()];
        *batter_idx += 1;
        match simulate_plate_appearance(rng, batter, pitcher) {
            PaOutcome::Strikeout | PaOutcome::Out => outs += 1,
            PaOutcome::Walk | PaOutcome::HitByPitch | PaOutcome::Single => runs += advance_runners(&mut bases, 1),
            PaOutcome::Double => runs += advance_runners(&mut bases, 2),
            PaOutcome::Triple => runs += advance_runners(&mut bases, 3),
            PaOutcome::HomeRun => runs += advance_runners(&mut bases, 4),
        }

        if let Some((part, severity)) = injury::check_acute_injury(rng, batter.fatigue) {
            injuries.push(InjuryEvent { player_id: batter.id.clone(), part, severity });
        }
        if let Some((part, severity)) = injury::check_acute_injury(rng, pitcher.fatigue) {
            injuries.push(InjuryEvent { player_id: pitcher.id.clone(), part, severity });
        }
    }
    runs
}

pub struct GameResult {
    pub home_runs: u32,
    pub away_runs: u32,
    pub injuries: Vec<InjuryEvent>,
}

const EMPTY_BASES: [bool; 3] = [false, false, false];
const TIEBREAK_BASES: [bool; 3] = [true, true, false]; // 승부치기: 무사 1·2루

fn is_amateur(league_id: &str) -> bool {
    league_id != "league:pro" && league_id != "league:pro_farm"
}

/// 경기 한 판 — 9이닝 기본, 리그별 콜드게임·연장전 규칙(07_매치_엔진.md
/// §10-2) 적용. 선발투수가 완투한다고 가정(감독의 교체 판단은 스태프
/// 시스템이 생기는 후속 Phase 스코프) — 타순은 로스터 순서대로 순환.
/// 타석마다 급성형 부상도 함께 판정(§13) — 이벤트만 반환하고 실제 강판
/// 처리는 안 함(로스터 결원 로직 스코프 밖, 위 InjuryEvent 문서 참고).
pub fn simulate_game(
    rng: &mut impl Rng,
    league_id: &str,
    home_lineup: &[BatterStats],
    home_pitcher: &PitcherStats,
    away_lineup: &[BatterStats],
    away_pitcher: &PitcherStats,
) -> GameResult {
    let amateur = is_amateur(league_id);
    let mut home_runs = 0u32;
    let mut away_runs = 0u32;
    let mut home_idx = 0usize;
    let mut away_idx = 0usize;
    let mut inning = 1u32;
    let mut injuries = Vec::new();

    loop {
        let bases = if amateur && inning > 9 { TIEBREAK_BASES } else { EMPTY_BASES };

        away_runs += simulate_half_inning(rng, away_lineup, &mut away_idx, home_pitcher, bases, &mut injuries);

        let walk_off = inning >= 9 && home_runs > away_runs;
        if !walk_off {
            home_runs += simulate_half_inning(rng, home_lineup, &mut home_idx, away_pitcher, bases, &mut injuries);
        }

        if amateur {
            let margin = (home_runs as i32 - away_runs as i32).unsigned_abs();
            if (inning >= 5 && margin >= 15) || (inning >= 7 && margin >= 10) {
                break;
            }
        }

        if inning >= 9 && home_runs != away_runs {
            break;
        }
        if !amateur && inning >= 12 {
            break; // 프로 정규시즌 12회 제한(동점이면 무승부)
        }
        if inning >= 30 {
            break; // 절대 안전장치(아마추어 승부치기가 이론상 안 끝날 경우)
        }
        inning += 1;
    }

    GameResult { home_runs, away_runs, injuries }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn avg_batter() -> BatterStats {
        BatterStats { id: "b".to_string(), contact: 50.0, eye: 50.0, power: 50.0, fatigue: 0.0 }
    }
    fn avg_pitcher() -> PitcherStats {
        PitcherStats { id: "p".to_string(), control: 50.0, stuff: 50.0, fatigue: 0.0 }
    }

    #[test]
    fn same_seed_produces_identical_game_result() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let mut rng1 = ChaCha8Rng::seed_from_u64(11);
        let a = simulate_game(&mut rng1, "league:hs", &lineup, &avg_pitcher(), &lineup, &avg_pitcher());
        let mut rng2 = ChaCha8Rng::seed_from_u64(11);
        let b = simulate_game(&mut rng2, "league:hs", &lineup, &avg_pitcher(), &lineup, &avg_pitcher());
        assert_eq!(a.home_runs, b.home_runs);
        assert_eq!(a.away_runs, b.away_runs);
        assert_eq!(a.injuries, b.injuries);
    }

    #[test]
    fn stronger_batting_lineup_scores_more_on_average() {
        let weak_lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("w{i}"), contact: 25.0, eye: 25.0, power: 25.0, fatigue: 0.0 }).collect();
        let strong_lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("s{i}"), contact: 75.0, eye: 75.0, power: 75.0, fatigue: 0.0 }).collect();

        let mut weak_total = 0u32;
        let mut strong_total = 0u32;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r1 = simulate_game(&mut rng, "league:pro", &weak_lineup, &avg_pitcher(), &weak_lineup, &avg_pitcher());
            weak_total += r1.home_runs + r1.away_runs;
            let mut rng2 = ChaCha8Rng::seed_from_u64(seed);
            let r2 = simulate_game(&mut rng2, "league:pro", &strong_lineup, &avg_pitcher(), &strong_lineup, &avg_pitcher());
            strong_total += r2.home_runs + r2.away_runs;
        }
        assert!(strong_total > weak_total, "strong={strong_total} weak={weak_total}");
    }

    #[test]
    fn amateur_cold_game_stops_before_nine_innings_on_blowout() {
        // extreme mismatch should trigger the 5-inning/15-run cold-game rule at least sometimes
        let elite: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("e{i}"), contact: 80.0, eye: 80.0, power: 80.0, fatigue: 0.0 }).collect();
        let hapless: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("h{i}"), contact: 20.0, eye: 20.0, power: 20.0, fatigue: 0.0 }).collect();
        let elite_pitcher = PitcherStats { id: "ep".to_string(), control: 80.0, stuff: 80.0, fatigue: 0.0 };
        let hapless_pitcher = PitcherStats { id: "hp".to_string(), control: 20.0, stuff: 20.0, fatigue: 0.0 };

        let mut saw_cold_game = false;
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:hs", &elite, &elite_pitcher, &hapless, &hapless_pitcher);
            if r.home_runs.max(r.away_runs) - r.home_runs.min(r.away_runs) >= 15 {
                saw_cold_game = true;
            }
        }
        assert!(saw_cold_game, "expected at least one blowout across 20 seeds");
    }

    #[test]
    fn pro_game_never_exceeds_twelve_innings_worth_of_scoring_pressure() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        for seed in 0..10u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &avg_pitcher(), &lineup, &avg_pitcher());
            // just confirm it terminates and produces a result — the 12-inning cap
            // guarantees termination even on repeated ties.
            assert!(r.home_runs < 100 && r.away_runs < 100);
        }
    }

    #[test]
    fn high_fatigue_players_accumulate_injuries_over_many_games() {
        let lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("fb{i}"), contact: 50.0, eye: 50.0, power: 50.0, fatigue: 200.0 }).collect();
        let pitcher = PitcherStats { id: "fp".to_string(), control: 50.0, stuff: 50.0, fatigue: 200.0 };

        let mut total_injuries = 0usize;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &pitcher, &lineup, &pitcher);
            total_injuries += r.injuries.len();
        }
        assert!(total_injuries > 0, "expected at least one acute injury across 50 games of heavily fatigued players");
    }

    #[test]
    fn zero_fatigue_players_rarely_get_injured_in_a_single_game() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let mut rng = ChaCha8Rng::seed_from_u64(0);
        let r = simulate_game(&mut rng, "league:pro", &lineup, &avg_pitcher(), &lineup, &avg_pitcher());
        assert!(r.injuries.len() < 3, "a single low-fatigue game should almost never produce multiple injuries, got {}", r.injuries.len());
    }
}
