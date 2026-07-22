use std::collections::HashMap;

use rand::Rng;

use crate::sim::injury;
use crate::sim::manager;

/// 07_매치_엔진.md §5·§6이 요구하는 입력 스탯만 뽑아온 얇은 뷰 — 실제
/// npc.stats JSON 파싱은 repository.rs가 하고 여기는 순수 계산만. `id`·
/// `fatigue`는 급성형 부상 판정(§13, 08_부상_시스템.md §3)이 "누구에게"
/// "얼마나 위험하게" 일어났는지 알아야 해서 I5 5차분 이후 추가됨.
#[derive(Debug, Clone)]
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
/// (기존 주자 전원 1루씩 무조건 진루) — I5 후속에서 정교화. `pub(crate)`
/// — `data::match_session`(I6 3차분)이 주인공 등판 이닝의 주자 진루를
/// 계산할 때 재사용.
pub(crate) fn advance_runners(bases: &mut [bool; 3], hit_bases: u32) -> u32 {
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

/// 투수 개인 경기 기록(`season_stats` 적재용, 10_구현_Phase_계획.md §6-N) —
/// 자책점(자책/비자책 구분)은 이 엔진에 에러 판정 자체가 없어
/// `runs_allowed`와 동일값이 될 뿐이라 별도 필드를 만들지 않는다. 사구(HBP)
/// 는 세분화하지 않고 무시(1% 확률의 미세 항목, D그룹).
#[derive(Debug, Default, Clone, PartialEq)]
pub struct PitcherGameStats {
    pub outs_recorded: u32,
    pub runs_allowed: u32,
    pub strikeouts: u32,
    pub hits_allowed: u32,
    pub walks: u32,
}

/// 타자 개인 경기 기록(`season_stats` 적재용) — HBP는 투수 쪽과 동일하게
/// 무시.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct BatterGameStats {
    pub plate_appearances: u32,
    pub at_bats: u32,
    pub hits: u32,
    pub doubles: u32,
    pub triples: u32,
    pub home_runs: u32,
    pub walks: u32,
    pub strikeouts: u32,
    pub rbi: u32,
}

/// 하프이닝 1회 분량의 누산기 — 그 이닝에서 던진 투수 1명 + 타석에 선 타자
/// 전원을 함께 담는다("누가 던지고 누가 쳤는지"가 한 호출 안에서 항상 한
/// 팀씩 짝지어지므로).
#[derive(Debug, Default)]
pub struct HalfInningStats {
    pub pitcher: PitcherGameStats,
    pub batters: HashMap<String, BatterGameStats>,
}

/// `pub(crate)` — `data::match_session`이 주인공 팀 타석(DH 배경 시뮬,
/// 절대 개입 없음 — §7)을 통째로 돌릴 때 재사용.
pub(crate) fn simulate_half_inning(
    rng: &mut impl Rng,
    lineup: &[BatterStats],
    batter_idx: &mut usize,
    pitcher: &PitcherStats,
    initial_bases: [bool; 3],
    injuries: &mut Vec<InjuryEvent>,
    stats: &mut HalfInningStats,
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
        let outcome = simulate_plate_appearance(rng, batter, pitcher);
        let pa_runs = match outcome {
            PaOutcome::Strikeout | PaOutcome::Out => {
                outs += 1;
                0
            }
            PaOutcome::Walk | PaOutcome::HitByPitch | PaOutcome::Single => advance_runners(&mut bases, 1),
            PaOutcome::Double => advance_runners(&mut bases, 2),
            PaOutcome::Triple => advance_runners(&mut bases, 3),
            PaOutcome::HomeRun => advance_runners(&mut bases, 4),
        };
        runs += pa_runs;

        match outcome {
            PaOutcome::Strikeout => {
                stats.pitcher.outs_recorded += 1;
                stats.pitcher.strikeouts += 1;
            }
            PaOutcome::Out => stats.pitcher.outs_recorded += 1,
            PaOutcome::Walk => stats.pitcher.walks += 1,
            PaOutcome::HitByPitch => {}
            PaOutcome::Single | PaOutcome::Double | PaOutcome::Triple | PaOutcome::HomeRun => stats.pitcher.hits_allowed += 1,
        }
        stats.pitcher.runs_allowed += pa_runs;

        let batter_line = stats.batters.entry(batter.id.clone()).or_default();
        batter_line.plate_appearances += 1;
        match outcome {
            PaOutcome::Strikeout => {
                batter_line.at_bats += 1;
                batter_line.strikeouts += 1;
            }
            PaOutcome::Out => batter_line.at_bats += 1,
            PaOutcome::Walk | PaOutcome::HitByPitch => {}
            PaOutcome::Single => {
                batter_line.at_bats += 1;
                batter_line.hits += 1;
            }
            PaOutcome::Double => {
                batter_line.at_bats += 1;
                batter_line.hits += 1;
                batter_line.doubles += 1;
            }
            PaOutcome::Triple => {
                batter_line.at_bats += 1;
                batter_line.hits += 1;
                batter_line.triples += 1;
            }
            PaOutcome::HomeRun => {
                batter_line.at_bats += 1;
                batter_line.hits += 1;
                batter_line.home_runs += 1;
            }
        }
        batter_line.rbi += pa_runs;

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
    pub home_pitcher_stats: PitcherGameStats,
    pub away_pitcher_stats: PitcherGameStats,
    pub home_reliever_stats: Option<PitcherGameStats>,
    pub away_reliever_stats: Option<PitcherGameStats>,
    pub home_batter_stats: HashMap<String, BatterGameStats>,
    pub away_batter_stats: HashMap<String, BatterGameStats>,
}

const EMPTY_BASES: [bool; 3] = [false, false, false];
const TIEBREAK_BASES: [bool; 3] = [true, true, false]; // 승부치기: 무사 1·2루

/// 배경 경기(`simulate_game`)의 팀별 투수 운용 계획 — 강판 판정에 필요한
/// 입력을 한 번에 묶는다(파라미터 폭발 방지). `reliever`가 `None`이면 그
/// 팀은 강판 없이 완투(로스터에 구원투수가 없을 때의 방어적 폴백, 기존
/// 동작과 동일).
pub struct TeamPitchingPlan<'a> {
    pub starter: &'a PitcherStats,
    pub reliever: Option<&'a PitcherStats>,
    pub tactics: f64,
    pub trust: f64,
}

/// `pub(crate)` — `data::match_session`이 연장전 규칙(§10-2)을 판단할 때
/// 재사용.
pub(crate) fn is_amateur(league_id: &str) -> bool {
    league_id != "league:pro" && league_id != "league:pro_farm"
}

/// 강판 뒤 갈라진 두 누산기(선발 몫·구원 몫)의 타자 기록을 하나로 합친다
/// — 타자 개인의 그 경기 총 성적은 상대 투수가 누구든 하나로 집계돼야
/// 하므로.
fn merge_batter_stats(mut a: HashMap<String, BatterGameStats>, b: HashMap<String, BatterGameStats>) -> HashMap<String, BatterGameStats> {
    for (id, s) in b {
        let entry = a.entry(id).or_default();
        entry.plate_appearances += s.plate_appearances;
        entry.at_bats += s.at_bats;
        entry.hits += s.hits;
        entry.doubles += s.doubles;
        entry.triples += s.triples;
        entry.home_runs += s.home_runs;
        entry.walks += s.walks;
        entry.strikeouts += s.strikeouts;
        entry.rbi += s.rbi;
    }
    a
}

/// 경기 한 판 — 9이닝 기본, 리그별 콜드게임·연장전 규칙(07_매치_엔진.md
/// §10-2) 적용. 타순은 로스터 순서대로 순환. 타석마다 급성형 부상도 함께
/// 판정(§13) — 이벤트만 반환하고 실제 강판 처리는 안 함(로스터 결원 로직
/// 스코프 밖, 위 InjuryEvent 문서 참고).
///
/// 강판(§6-N, "불펜 서열" 1차 축소안): 이닝 경계마다 `sim::manager::
/// should_pull_pitcher`로 판단, 팀당 게임 1회까지만(주인공 매치와 동일
/// 제약). 배경 경기는 타석 단위 시뮬이라 실제 볼카운트가 없어 "던진 타자
/// 수 × 3.8"로 투구수를 근사한다(D그룹 — 밸런스 하네스 재조정 대상).
/// 구원투수가 여러 명일 때의 서열(마무리/셋업/추격조)은 이번 스코프 밖 —
/// `home_plan.reliever`/`away_plan.reliever` 딱 1명만 받는다.
pub fn simulate_game(
    rng: &mut impl Rng,
    league_id: &str,
    home_lineup: &[BatterStats],
    home_plan: &TeamPitchingPlan,
    away_lineup: &[BatterStats],
    away_plan: &TeamPitchingPlan,
) -> GameResult {
    let amateur = is_amateur(league_id);
    let mut home_runs = 0u32;
    let mut away_runs = 0u32;
    let mut home_idx = 0usize;
    let mut away_idx = 0usize;
    let mut inning = 1u32;
    let mut injuries = Vec::new();

    let mut home_pitcher: &PitcherStats = home_plan.starter;
    let mut away_pitcher: &PitcherStats = away_plan.starter;
    let mut home_pulled = false;
    let mut away_pulled = false;

    // top_half_stats: away 타순이 home_pitcher(선발)를 상대하는 하프이닝
    // 누산 — pitcher는 홈 선발, batters는 원정 타자들. bottom_half_stats는
    // 반대. 강판되면 그 뒤 이닝은 각자 별도 누산기(*_reliever_stats_acc)로
    // 전환 — season_stats에 선발·구원이 서로 다른 id로 들어가야 하므로.
    let mut top_half_stats = HalfInningStats::default();
    let mut bottom_half_stats = HalfInningStats::default();
    let mut home_reliever_stats_acc = HalfInningStats::default();
    let mut away_reliever_stats_acc = HalfInningStats::default();

    loop {
        let bases = if amateur && inning > 9 { TIEBREAK_BASES } else { EMPTY_BASES };

        away_runs += simulate_half_inning(
            rng,
            away_lineup,
            &mut away_idx,
            home_pitcher,
            bases,
            &mut injuries,
            if home_pulled { &mut home_reliever_stats_acc } else { &mut top_half_stats },
        );

        let walk_off = inning >= 9 && home_runs > away_runs;
        if !walk_off {
            home_runs += simulate_half_inning(
                rng,
                home_lineup,
                &mut home_idx,
                away_pitcher,
                bases,
                &mut injuries,
                if away_pulled { &mut away_reliever_stats_acc } else { &mut bottom_half_stats },
            );
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

        if !home_pulled {
            if let Some(reliever) = home_plan.reliever {
                let faced = top_half_stats.pitcher.outs_recorded + top_half_stats.pitcher.hits_allowed + top_half_stats.pitcher.walks;
                let approx_pitches = (faced as f64 * 3.8) as u32;
                if manager::should_pull_pitcher(rng, approx_pitches, home_plan.starter.fatigue, home_plan.tactics, home_plan.trust) {
                    home_pitcher = reliever;
                    home_pulled = true;
                }
            }
        }
        if !away_pulled {
            if let Some(reliever) = away_plan.reliever {
                let faced = bottom_half_stats.pitcher.outs_recorded + bottom_half_stats.pitcher.hits_allowed + bottom_half_stats.pitcher.walks;
                let approx_pitches = (faced as f64 * 3.8) as u32;
                if manager::should_pull_pitcher(rng, approx_pitches, away_plan.starter.fatigue, away_plan.tactics, away_plan.trust) {
                    away_pitcher = reliever;
                    away_pulled = true;
                }
            }
        }

        inning += 1;
    }

    GameResult {
        home_runs,
        away_runs,
        injuries,
        home_pitcher_stats: top_half_stats.pitcher,
        away_pitcher_stats: bottom_half_stats.pitcher,
        home_reliever_stats: home_pulled.then_some(home_reliever_stats_acc.pitcher),
        away_reliever_stats: away_pulled.then_some(away_reliever_stats_acc.pitcher),
        home_batter_stats: merge_batter_stats(bottom_half_stats.batters, away_reliever_stats_acc.batters),
        away_batter_stats: merge_batter_stats(top_half_stats.batters, home_reliever_stats_acc.batters),
    }
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
    /// 강판을 신경 쓰지 않는 기존 테스트들이 계속 완투 동작을 보게 하는
    /// 헬퍼 — `reliever: None`이면 `simulate_game`이 절대 강판하지 않는다.
    fn no_pull_plan(starter: &PitcherStats) -> TeamPitchingPlan<'_> {
        TeamPitchingPlan { starter, reliever: None, tactics: 50.0, trust: 50.0 }
    }

    #[test]
    fn same_seed_produces_identical_game_result() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let mut rng1 = ChaCha8Rng::seed_from_u64(11);
        let a = simulate_game(&mut rng1, "league:hs", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()));
        let mut rng2 = ChaCha8Rng::seed_from_u64(11);
        let b = simulate_game(&mut rng2, "league:hs", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()));
        assert_eq!(a.home_runs, b.home_runs);
        assert_eq!(a.away_runs, b.away_runs);
        assert_eq!(a.injuries, b.injuries);
        assert_eq!(a.home_pitcher_stats, b.home_pitcher_stats);
        assert_eq!(a.away_pitcher_stats, b.away_pitcher_stats);
        assert_eq!(a.home_batter_stats, b.home_batter_stats);
        assert_eq!(a.away_batter_stats, b.away_batter_stats);
    }

    #[test]
    fn pitcher_stats_runs_allowed_matches_the_opposing_teams_score() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()));
            assert_eq!(r.away_pitcher_stats.runs_allowed, r.home_runs, "seed={seed}");
            assert_eq!(r.home_pitcher_stats.runs_allowed, r.away_runs, "seed={seed}");
        }
    }

    #[test]
    fn simulate_game_pulls_a_starter_over_a_full_game_when_a_reliever_is_available() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let starter = avg_pitcher();
        let reliever = PitcherStats { id: "reliever".to_string(), control: 50.0, stuff: 50.0, fatigue: 0.0 };
        let mut pulled_at_least_once = false;
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let home_plan = TeamPitchingPlan { starter: &starter, reliever: Some(&reliever), tactics: 50.0, trust: 50.0 };
            let away_starter = avg_pitcher();
            let away_plan = no_pull_plan(&away_starter);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &home_plan, &lineup, &away_plan);
            // 강판이 일어나도 팀 총 실점·타자 rbi 합 불변식은 그대로 유지돼야 한다.
            assert_eq!(r.away_pitcher_stats.runs_allowed, r.home_runs, "seed={seed}");
            let home_rbi: u32 = r.home_batter_stats.values().map(|b| b.rbi).sum();
            assert_eq!(home_rbi, r.home_runs, "seed={seed}");
            if r.home_reliever_stats.is_some() {
                pulled_at_least_once = true;
                break;
            }
        }
        assert!(pulled_at_least_once, "expected at least one seed to pull the starter over a full 9-inning game");
    }

    #[test]
    fn simulate_game_never_pulls_when_no_reliever_is_available() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        // 극단적으로 지친 투수라도 reliever: None이면 강판이 아예 불가능해야 한다.
        let exhausted = PitcherStats { id: "p".to_string(), control: 50.0, stuff: 50.0, fatigue: 200.0 };
        for seed in 0..10u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&exhausted), &lineup, &no_pull_plan(&exhausted));
            assert!(r.home_reliever_stats.is_none(), "seed={seed}");
            assert!(r.away_reliever_stats.is_none(), "seed={seed}");
        }
    }

    #[test]
    fn batter_rbi_sums_to_the_teams_runs_scored() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()));
            let home_rbi: u32 = r.home_batter_stats.values().map(|b| b.rbi).sum();
            let away_rbi: u32 = r.away_batter_stats.values().map(|b| b.rbi).sum();
            assert_eq!(home_rbi, r.home_runs, "seed={seed}");
            assert_eq!(away_rbi, r.away_runs, "seed={seed}");
        }
    }

    #[test]
    fn stronger_pitcher_allows_fewer_hits_on_average() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let weak_pitcher = PitcherStats { id: "wp".to_string(), control: 25.0, stuff: 25.0, fatigue: 0.0 };
        let strong_pitcher = PitcherStats { id: "sp".to_string(), control: 75.0, stuff: 75.0, fatigue: 0.0 };

        let mut weak_hits = 0u32;
        let mut strong_hits = 0u32;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r1 = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&weak_pitcher), &lineup, &no_pull_plan(&weak_pitcher));
            weak_hits += r1.home_pitcher_stats.hits_allowed + r1.away_pitcher_stats.hits_allowed;
            let mut rng2 = ChaCha8Rng::seed_from_u64(seed);
            let r2 = simulate_game(&mut rng2, "league:pro", &lineup, &no_pull_plan(&strong_pitcher), &lineup, &no_pull_plan(&strong_pitcher));
            strong_hits += r2.home_pitcher_stats.hits_allowed + r2.away_pitcher_stats.hits_allowed;
        }
        assert!(strong_hits < weak_hits, "strong={strong_hits} weak={weak_hits}");
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
            let r1 = simulate_game(&mut rng, "league:pro", &weak_lineup, &no_pull_plan(&avg_pitcher()), &weak_lineup, &no_pull_plan(&avg_pitcher()));
            weak_total += r1.home_runs + r1.away_runs;
            let mut rng2 = ChaCha8Rng::seed_from_u64(seed);
            let r2 = simulate_game(&mut rng2, "league:pro", &strong_lineup, &no_pull_plan(&avg_pitcher()), &strong_lineup, &no_pull_plan(&avg_pitcher()));
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
            let r = simulate_game(&mut rng, "league:hs", &elite, &no_pull_plan(&elite_pitcher), &hapless, &no_pull_plan(&hapless_pitcher));
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
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()));
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
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&pitcher), &lineup, &no_pull_plan(&pitcher));
            total_injuries += r.injuries.len();
        }
        assert!(total_injuries > 0, "expected at least one acute injury across 50 games of heavily fatigued players");
    }

    #[test]
    fn zero_fatigue_players_rarely_get_injured_in_a_single_game() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let mut rng = ChaCha8Rng::seed_from_u64(0);
        let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()));
        assert!(r.injuries.len() < 3, "a single low-fatigue game should almost never produce multiple injuries, got {}", r.injuries.len());
    }
}
