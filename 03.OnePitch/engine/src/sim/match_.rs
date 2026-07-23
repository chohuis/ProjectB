use std::collections::HashMap;

use rand::Rng;

use crate::sim::injury;
use crate::sim::manager;

/// 07_매치_엔진.md §5·§6이 요구하는 입력 스탯만 뽑아온 얇은 뷰 — 실제
/// npc.stats JSON 파싱은 repository.rs가 하고 여기는 순수 계산만. `id`·
/// `fatigue`는 급성형 부상 판정(§13, 08_부상_시스템.md §3)이 "누구에게"
/// "얼마나 위험하게" 일어났는지 알아야 해서 I5 5차분 이후 추가됨.
/// `clutch`(클러치)·`composure`(침착함)는 Phase 1에서 추가 — 위기상황
/// (`is_high_leverage_situation`)에서만 판정식에 개입한다(§5 "상황 보정...
/// 클러치"). `defense`(수비)는 Phase 2에서 추가 — 타자 개인이 아니라
/// 타석에 선 팀 전체를 대표하는 "그 팀 지금 수비 라인업의 평균 수비력"
/// 으로 쓰인다(`resolve_in_play_result`의 `team_defense` 인자, §3
/// "수비 전력 = 수비 스탯 가중합" 단순화). `스피드`는 Phase 3(주루)에서
/// 쓸 예정이라 아직 필드로 안 받는다.
#[derive(Debug, Clone)]
pub struct BatterStats {
    pub id: String,
    pub contact: f64,
    pub eye: f64,
    pub power: f64,
    pub fatigue: f64,
    pub clutch: f64,
    pub composure: f64,
    pub defense: f64,
}

/// `velocity`(구속)·`game_management`(경기운영)·`clutch`·`composure`는
/// Phase 1에서 추가 — 구속은 K% 가중치를 구위와 분리해서 반영, 경기운영은
/// 볼넷 억제(§5·§10 "견제도 경기운영에 흡수"), 클러치·침착함은 위기상황
/// 전용 보정. `체력`·`회복력`·`리더십`은 매치 판정이 아니라 피로 누적·
/// 관계도 쪽 스탯이라 이번 스코프에서도 필드로 안 받는다.
pub struct PitcherStats {
    pub id: String,
    pub control: f64,
    pub stuff: f64,
    pub fatigue: f64,
    pub velocity: f64,
    pub game_management: f64,
    pub clutch: f64,
    pub composure: f64,
}

/// `DoublePlay`(병살타)·`SacFly`(희생플라이)·`ReachOnError`(실책 출루)는
/// Phase 2(§6 "타석 결과 확장")에서 추가 — `resolve_in_play_result`가
/// 주자 상황·아웃카운트·타구 유형(`BattedBallType`)·팀 수비력을 보고
/// 자동 판정한다(투수·타자의 능동 선택 아님, §6 "시스템 처리").
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum PaOutcome {
    Strikeout,
    Walk,
    HitByPitch,
    Out,
    DoublePlay,
    SacFly,
    ReachOnError,
    Single,
    Double,
    Triple,
    HomeRun,
}

/// 타구 유형(Phase 2) — 병살·희생플라이 자동 판정(§6)과 수비 시프트
/// (Phase 5)의 입력. `pub(crate)` — Phase 5에서 `data::match_session`
/// 쪽 수비 시프트 판정에도 재사용할 여지를 남겨둠.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BattedBallType {
    GroundBall,
    FlyBall,
    LineDrive,
}

/// 땅볼 45%·뜬공 35%·직선타 20%(실제 야구 근사치) — D그룹 placeholder,
/// 타자 스탯에 따른 편차(예: 파워형일수록 뜬공↑)는 이번 스코프 밖.
fn roll_batted_ball_type(rng: &mut impl Rng) -> BattedBallType {
    let roll = rng.gen::<f64>();
    if roll < 0.45 {
        BattedBallType::GroundBall
    } else if roll < 0.80 {
        BattedBallType::FlyBall
    } else {
        BattedBallType::LineDrive
    }
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

/// 피로도가 능력치 실효치를 깎는다(Phase 1, §5 "상황 보정... 피로도") —
/// `sim::injury::FATIGUE_INJURY_THRESHOLD`(70) 근처부터 체감되게 2차
/// 곡선으로 감쇠, 최대 -15(피로도 100 기준). D그룹 placeholder(계수는
/// I8 밸런스 하네스 재조정 대상). 피로도 0이면 원래 능력치 그대로.
pub(crate) fn fatigue_effective(base: f64, fatigue: f64) -> f64 {
    let decay = (fatigue / 100.0).clamp(0.0, 1.0).powi(2) * 15.0;
    (base - decay).max(0.0)
}

/// 위기상황 판정 — 07_매치_엔진.md §4 "만루·동점·역전 기회 등 레버리지
/// 높은 타석"만 구현. "개인기록 근접"·"라이벌 매치업"은 각각 기록 추적·
/// 관계도 시스템이 있어야 판단 가능해 스코프 밖(10_구현_Phase_계획.md
/// 참고) — 다음 서브분 후보. 원래 `sim::pitch`(반자동 격상 트리거)에서만
/// 쓰였지만 Phase 1부터 배경 시뮬(`simulate_half_inning`)의 클러치·침착함
/// 보정에도 재사용해 이 파일로 옮겼다 — `sim::pitch`는 재노출(`pub use`)로
/// 기존 호출부를 그대로 유지.
pub fn is_high_leverage_situation(bases_loaded: bool, score_diff: i32, inning: u32) -> bool {
    let late_and_close = inning >= 7 && score_diff.abs() <= 1;
    bases_loaded || late_and_close
}

/// 타석 1회 = 1회 확률판정(§11 "최소 타석 단위"를 만족하는 단순화 — 1구
/// 단위 볼카운트는 I5 후속 스코프). 20~80 스탯 스케일 기준 placeholder
/// 판정식 — 정확한 계수는 D그룹(05_밸런스.md), Phase I8 하네스에서 확정.
/// `high_leverage`(Phase 1) — `is_high_leverage_situation`이 true일 때만
/// 클러치·침착함이 개입한다(§5 "상황 보정... 클러치"), 평상시엔 순수
/// 능력치 싸움 그대로. `bases`·`outs`·`team_defense`(Phase 2)는
/// 인플레이로 이어질 때 `resolve_in_play_result`에 그대로 전달 — 병살·
/// 희생플라이·실책 판정에 필요.
#[allow(clippy::too_many_arguments)]
pub fn simulate_plate_appearance(
    rng: &mut impl Rng,
    batter: &BatterStats,
    pitcher: &PitcherStats,
    bases: [bool; 3],
    outs: u32,
    team_defense: f64,
    high_leverage: bool,
) -> PaOutcome {
    let effective_control = fatigue_effective(pitcher.control, pitcher.fatigue);
    let effective_stuff = fatigue_effective(pitcher.stuff, pitcher.fatigue);
    let mut pitch_edge = (effective_control + effective_stuff) / 2.0 - (batter.contact + batter.eye) / 2.0;
    if high_leverage {
        pitch_edge += (pitcher.clutch - batter.clutch) * 0.15;
    }

    let mut k_prob = clamp01(0.20 + pitch_edge * 0.004 + (pitcher.velocity - 50.0) * 0.001);
    let mut bb_prob = clamp01(0.08 - pitch_edge * 0.003 - (pitcher.game_management - 50.0) * 0.0004);
    if high_leverage {
        bb_prob = clamp01(bb_prob - (pitcher.composure - 50.0) * 0.0006);
        k_prob = clamp01(k_prob - (batter.composure - 50.0) * 0.0003);
    }
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

    resolve_in_play_result(rng, batter, pitcher, bases, outs, team_defense, high_leverage)
}

/// 인플레이(공을 맞힘) 발생 이후의 결과 세분화(§6) — 아웃 여부 → 안타
/// 종류. `simulate_plate_appearance`(PA레벨 배경 시뮬)와
/// `sim::pitch::simulate_at_bat_automatically`(주인공 1구 단위 매치
/// 세션, I6 2차분)가 이 판정을 공유해 "인플레이 이후"의 확률식이 두
/// 엔진 사이에서 갈라지지 않게 한다. `bases`·`outs`(Phase 2)는 병살·
/// 희생플라이 자동 판정(§6)에, `team_defense`는 실책 확률(§6 "수비 전력
/// 확률로 발생")에 쓰인다 — 타석에 선 팀(공격팀)이 아니라 지금 수비 중인
/// 팀의 평균 수비력이어야 한다(호출부 책임).
#[allow(clippy::too_many_arguments)]
pub fn resolve_in_play_result(
    rng: &mut impl Rng,
    batter: &BatterStats,
    pitcher: &PitcherStats,
    bases: [bool; 3],
    outs: u32,
    team_defense: f64,
    high_leverage: bool,
) -> PaOutcome {
    let mut power_edge = batter.power - fatigue_effective(pitcher.stuff, pitcher.fatigue);
    if high_leverage {
        power_edge += (batter.clutch - pitcher.clutch) * 0.15;
    }
    let hit_prob = clamp01(0.30 + power_edge * 0.002);
    if rng.gen::<f64>() >= hit_prob {
        // 아웃이 될 타구 — 실책이 먼저 개입해 아웃을 출루로 뒤집을 수
        // 있다("실책이 없었으면 아웃이었을 타구"라는 실제 채점 관례와
        // 일치). 수비력이 낮을수록(50 미만) 확률↑, D그룹 placeholder.
        let error_prob = clamp01(0.03 + (50.0 - team_defense) * 0.001);
        if rng.gen::<f64>() < error_prob {
            return PaOutcome::ReachOnError;
        }
        let batted = roll_batted_ball_type(rng);
        if batted == BattedBallType::GroundBall && bases[0] && outs < 2 {
            return PaOutcome::DoublePlay;
        }
        if batted == BattedBallType::FlyBall && bases[2] && outs < 2 {
            return PaOutcome::SacFly;
        }
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

/// 수비 중인 팀의 평균 수비력(Phase 2, §3 "수비 전력 = 수비 스탯 가중합"
/// 단순화 — 라인업 전원 단순 평균, 포지션별 가중치는 이번 스코프 밖).
/// `resolve_in_play_result`의 `team_defense` 인자로 쓰인다. `pub(crate)`
/// — `data::match_session`이 수비 중인 팀의 라인업을 불러와 넘길 때 재사용.
pub(crate) fn average_defense(lineup: &[BatterStats]) -> f64 {
    if lineup.is_empty() {
        return 50.0;
    }
    lineup.iter().map(|b| b.defense).sum::<f64>() / lineup.len() as f64
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

/// 투수 개인 경기 기록(`season_stats` 적재용, 10_구현_Phase_계획.md §6-N).
/// `unearned_runs`(비자책점)·`errors`는 Phase 2에서 추가(§12 "자책점/
/// 비자책점 구분... ERA 등 투수 기록의 정확성에 필수") — `ReachOnError`가
/// 발생한 그 타석에서 곧바로 스코어링된 득점만 비자책으로 잡는다(그
/// 주자가 나중에 다른 타자의 안타로 득점하는 경우까지 소급 추적하는
/// 완전한 자책 귀속은 이번 스코프 밖, D그룹). 사구(HBP)는 세분화하지
/// 않고 무시(1% 확률의 미세 항목, D그룹).
#[derive(Debug, Default, Clone, PartialEq)]
pub struct PitcherGameStats {
    pub outs_recorded: u32,
    pub runs_allowed: u32,
    pub strikeouts: u32,
    pub hits_allowed: u32,
    pub walks: u32,
    pub unearned_runs: u32,
    pub errors: u32,
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
/// 절대 개입 없음 — §7)을 통째로 돌릴 때 재사용. `high_leverage_base`는
/// 호출부(이닝·스코어를 아는 쪽)가 미리 계산해서 넘기는 "만루 제외" 위기
/// 판정(Phase 1) — 이 함수 안에서 타석마다 실시간 만루 여부와 OR해
/// 최종 `high_leverage`를 매 타석 다시 판단한다. `team_defense`(Phase 2)
/// 는 호출부가 미리 계산한 "지금 수비 중인 팀"의 평균 수비력
/// (`average_defense`) — 이 하프이닝 내내 고정.
#[allow(clippy::too_many_arguments)]
pub(crate) fn simulate_half_inning(
    rng: &mut impl Rng,
    lineup: &[BatterStats],
    batter_idx: &mut usize,
    pitcher: &PitcherStats,
    initial_bases: [bool; 3],
    high_leverage_base: bool,
    team_defense: f64,
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
        let bases_loaded = bases.iter().all(|&b| b);
        let outcome = simulate_plate_appearance(rng, batter, pitcher, bases, outs, team_defense, high_leverage_base || bases_loaded);
        let pa_runs = match outcome {
            PaOutcome::Strikeout | PaOutcome::Out => {
                outs += 1;
                0
            }
            PaOutcome::DoublePlay => {
                outs += 2;
                bases[0] = false;
                0
            }
            PaOutcome::SacFly => {
                outs += 1;
                if bases[2] {
                    bases[2] = false;
                    1
                } else {
                    0
                }
            }
            PaOutcome::ReachOnError | PaOutcome::Walk | PaOutcome::HitByPitch | PaOutcome::Single => advance_runners(&mut bases, 1),
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
            PaOutcome::DoublePlay => stats.pitcher.outs_recorded += 2,
            PaOutcome::SacFly => stats.pitcher.outs_recorded += 1,
            PaOutcome::ReachOnError => stats.pitcher.errors += 1,
            PaOutcome::Walk => stats.pitcher.walks += 1,
            PaOutcome::HitByPitch => {}
            PaOutcome::Single | PaOutcome::Double | PaOutcome::Triple | PaOutcome::HomeRun => stats.pitcher.hits_allowed += 1,
        }
        stats.pitcher.runs_allowed += pa_runs;
        if outcome == PaOutcome::ReachOnError {
            stats.pitcher.unearned_runs += pa_runs;
        }

        let batter_line = stats.batters.entry(batter.id.clone()).or_default();
        batter_line.plate_appearances += 1;
        match outcome {
            PaOutcome::Strikeout => {
                batter_line.at_bats += 1;
                batter_line.strikeouts += 1;
            }
            PaOutcome::Out | PaOutcome::DoublePlay | PaOutcome::ReachOnError => batter_line.at_bats += 1,
            PaOutcome::SacFly | PaOutcome::Walk | PaOutcome::HitByPitch => {}
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
        if outcome != PaOutcome::ReachOnError {
            batter_line.rbi += pa_runs;
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
/// 입력을 한 번에 묶는다(파라미터 폭발 방지). `reliever`는 세이브 상황이
/// 아닐 때 쓸 중계, `closer`는 세이브 상황(`manager::is_save_situation`,
/// Part G)일 때 쓸 마무리 — 강판이 일어나는 그 이닝의 실제 스코어를
/// 보고 둘 중 하나를 고른다(`load_relief_pitcher`가 미리 채워온다).
/// 둘 다 `None`이면 그 팀은 강판 없이 완투(로스터에 중계·마무리투수가
/// 없을 때의 방어적 폴백, 기존 동작과 동일). 한쪽만 있으면 상황과
/// 무관하게 있는 쪽을 쓴다(예: 마무리는 있는데 중계가 없는 극단적으로
/// 작은 로스터).
pub struct TeamPitchingPlan<'a> {
    pub starter: &'a PitcherStats,
    pub reliever: Option<&'a PitcherStats>,
    pub closer: Option<&'a PitcherStats>,
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
/// 강판이 결정되는 그 이닝의 실제 스코어로 `manager::is_save_situation`을
/// 판단해 `home_plan.closer`(세이브 상황)와 `home_plan.reliever`(그 외)
/// 중 하나를 고른다(Part G) — 다만 팀당 여전히 딱 1회만 교체하므로 중계가
/// 여럿일 때의 세부 서열(셋업·추격조)까지는 이번에도 스코프 밖.
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
    // 수비 중인 팀의 평균 수비력(Phase 2) — 라인업이 게임 내내 안 바뀌므로
    // 루프 밖에서 한 번만 계산.
    let home_defense = average_defense(home_lineup);
    let away_defense = average_defense(away_lineup);

    loop {
        let bases = if amateur && inning > 9 { TIEBREAK_BASES } else { EMPTY_BASES };
        // 위기상황 기저값(Phase 1) — 만루 여부는 `simulate_half_inning`이
        // 타석마다 다시 판단하므로 여기선 항상 false로 넘긴다.
        let home_leverage_base = is_high_leverage_situation(false, home_runs as i32 - away_runs as i32, inning);
        let away_leverage_base = is_high_leverage_situation(false, away_runs as i32 - home_runs as i32, inning);

        away_runs += simulate_half_inning(
            rng,
            away_lineup,
            &mut away_idx,
            home_pitcher,
            bases,
            home_leverage_base,
            home_defense,
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
                away_leverage_base,
                away_defense,
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
            let save_situation = manager::is_save_situation(inning as i64, home_runs as i64, away_runs as i64);
            let candidate = if save_situation { home_plan.closer.or(home_plan.reliever) } else { home_plan.reliever.or(home_plan.closer) };
            if let Some(reliever) = candidate {
                let faced = top_half_stats.pitcher.outs_recorded + top_half_stats.pitcher.hits_allowed + top_half_stats.pitcher.walks;
                let approx_pitches = (faced as f64 * 3.8) as u32;
                if manager::should_pull_pitcher(rng, approx_pitches, home_plan.starter.fatigue, home_plan.tactics, home_plan.trust) {
                    home_pitcher = reliever;
                    home_pulled = true;
                }
            }
        }
        if !away_pulled {
            let save_situation = manager::is_save_situation(inning as i64, away_runs as i64, home_runs as i64);
            let candidate = if save_situation { away_plan.closer.or(away_plan.reliever) } else { away_plan.reliever.or(away_plan.closer) };
            if let Some(reliever) = candidate {
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
        BatterStats { id: "b".to_string(), contact: 50.0, eye: 50.0, power: 50.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0 }
    }
    fn avg_pitcher() -> PitcherStats {
        PitcherStats { id: "p".to_string(), control: 50.0, stuff: 50.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 }
    }
    /// 강판을 신경 쓰지 않는 기존 테스트들이 계속 완투 동작을 보게 하는
    /// 헬퍼 — `reliever: None`이면 `simulate_game`이 절대 강판하지 않는다.
    fn no_pull_plan(starter: &PitcherStats) -> TeamPitchingPlan<'_> {
        TeamPitchingPlan { starter, reliever: None, closer: None, tactics: 50.0, trust: 50.0 }
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
        let reliever = PitcherStats { id: "reliever".to_string(), control: 50.0, stuff: 50.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 };
        let mut pulled_at_least_once = false;
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let home_plan = TeamPitchingPlan { starter: &starter, reliever: Some(&reliever), closer: None, tactics: 50.0, trust: 50.0 };
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
    fn simulate_game_pulls_a_starter_into_the_closer_slot_when_only_a_closer_is_available() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let starter = avg_pitcher();
        let closer = PitcherStats { id: "closer".to_string(), control: 50.0, stuff: 50.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 };
        let mut pulled_at_least_once = false;
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let home_plan = TeamPitchingPlan { starter: &starter, reliever: None, closer: Some(&closer), tactics: 50.0, trust: 50.0 };
            let away_starter = avg_pitcher();
            let away_plan = no_pull_plan(&away_starter);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &home_plan, &lineup, &away_plan);
            if r.home_reliever_stats.is_some() {
                pulled_at_least_once = true;
                break;
            }
        }
        assert!(pulled_at_least_once, "reliever가 없어도 closer가 비세이브 상황 폴백으로 쓰여 강판이 일어나야 함");
    }

    #[test]
    fn simulate_game_never_pulls_when_no_reliever_is_available() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        // 극단적으로 지친 투수라도 reliever: None이면 강판이 아예 불가능해야 한다.
        let exhausted = PitcherStats { id: "p".to_string(), control: 50.0, stuff: 50.0, fatigue: 200.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 };
        for seed in 0..10u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&exhausted), &lineup, &no_pull_plan(&exhausted));
            assert!(r.home_reliever_stats.is_none(), "seed={seed}");
            assert!(r.away_reliever_stats.is_none(), "seed={seed}");
        }
    }

    #[test]
    fn batter_rbi_sums_to_the_teams_runs_scored() {
        // Phase 2부터는 실책으로 들어온 득점(비자책, ReachOnError)엔 타자에게
        // RBI를 안 주므로(실제 야구 규칙), "RBI 합 == 득점"이 아니라
        // "RBI 합 + 상대 투수(+구원)의 비자책점 합 == 득점"이 불변식이 된다.
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        for seed in 0..20u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&avg_pitcher()), &lineup, &no_pull_plan(&avg_pitcher()));
            let home_rbi: u32 = r.home_batter_stats.values().map(|b| b.rbi).sum();
            let away_rbi: u32 = r.away_batter_stats.values().map(|b| b.rbi).sum();
            let away_pitching_unearned =
                r.away_pitcher_stats.unearned_runs + r.away_reliever_stats.as_ref().map(|s| s.unearned_runs).unwrap_or(0);
            let home_pitching_unearned =
                r.home_pitcher_stats.unearned_runs + r.home_reliever_stats.as_ref().map(|s| s.unearned_runs).unwrap_or(0);
            assert_eq!(home_rbi + away_pitching_unearned, r.home_runs, "seed={seed}");
            assert_eq!(away_rbi + home_pitching_unearned, r.away_runs, "seed={seed}");
        }
    }

    #[test]
    fn stronger_pitcher_allows_fewer_hits_on_average() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let weak_pitcher = PitcherStats { id: "wp".to_string(), control: 25.0, stuff: 25.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 };
        let strong_pitcher = PitcherStats { id: "sp".to_string(), control: 75.0, stuff: 75.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 };

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
            (0..8).map(|i| BatterStats { id: format!("w{i}"), contact: 25.0, eye: 25.0, power: 25.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0 }).collect();
        let strong_lineup: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("s{i}"), contact: 75.0, eye: 75.0, power: 75.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0 }).collect();

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
            (0..8).map(|i| BatterStats { id: format!("e{i}"), contact: 80.0, eye: 80.0, power: 80.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0 }).collect();
        let hapless: Vec<BatterStats> =
            (0..8).map(|i| BatterStats { id: format!("h{i}"), contact: 20.0, eye: 20.0, power: 20.0, fatigue: 0.0, clutch: 50.0, composure: 50.0, defense: 50.0 }).collect();
        let elite_pitcher = PitcherStats { id: "ep".to_string(), control: 80.0, stuff: 80.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 };
        let hapless_pitcher = PitcherStats { id: "hp".to_string(), control: 20.0, stuff: 20.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 };

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
            (0..8).map(|i| BatterStats { id: format!("fb{i}"), contact: 50.0, eye: 50.0, power: 50.0, fatigue: 200.0, clutch: 50.0, composure: 50.0, defense: 50.0 }).collect();
        let pitcher = PitcherStats { id: "fp".to_string(), control: 50.0, stuff: 50.0, fatigue: 200.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0 };

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

    #[test]
    fn fatigue_effective_decays_toward_zero_as_fatigue_rises_but_never_below_zero() {
        assert_eq!(fatigue_effective(70.0, 0.0), 70.0, "0 피로도는 원래 능력치 그대로여야 함");
        let mid = fatigue_effective(70.0, 50.0);
        let high = fatigue_effective(70.0, 100.0);
        assert!(mid < 70.0 && high < mid, "mid={mid} high={high}");
        assert!(fatigue_effective(5.0, 100.0) >= 0.0, "실효치는 0 밑으로 안 내려가야 함");
    }

    #[test]
    fn fatigued_pitcher_allows_more_hits_than_a_fresh_pitcher_with_identical_base_stats() {
        let lineup: Vec<BatterStats> = (0..8).map(|i| BatterStats { id: format!("b{i}"), ..avg_batter() }).collect();
        let fresh = PitcherStats { id: "fresh".to_string(), fatigue: 0.0, ..avg_pitcher() };
        let tired = PitcherStats { id: "tired".to_string(), fatigue: 100.0, ..avg_pitcher() };

        let mut fresh_hits = 0u32;
        let mut tired_hits = 0u32;
        for seed in 0..50u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let r1 = simulate_game(&mut rng, "league:pro", &lineup, &no_pull_plan(&fresh), &lineup, &no_pull_plan(&fresh));
            fresh_hits += r1.home_pitcher_stats.hits_allowed + r1.away_pitcher_stats.hits_allowed;
            let mut rng2 = ChaCha8Rng::seed_from_u64(seed);
            let r2 = simulate_game(&mut rng2, "league:pro", &lineup, &no_pull_plan(&tired), &lineup, &no_pull_plan(&tired));
            tired_hits += r2.home_pitcher_stats.hits_allowed + r2.away_pitcher_stats.hits_allowed;
        }
        assert!(tired_hits > fresh_hits, "tired={tired_hits} fresh={fresh_hits}");
    }

    #[test]
    fn higher_velocity_pitcher_strikes_out_more_batters_on_average() {
        let batter = avg_batter();
        let low_velo = PitcherStats { velocity: 20.0, ..avg_pitcher() };
        let high_velo = PitcherStats { velocity: 80.0, ..avg_pitcher() };

        let count_strikeouts = |pitcher: &PitcherStats| -> u32 {
            let mut k = 0;
            for seed in 0..2000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if simulate_plate_appearance(&mut rng, &batter, pitcher, [false; 3], 0, 50.0, false) == PaOutcome::Strikeout {
                    k += 1;
                }
            }
            k
        };
        let low_k = count_strikeouts(&low_velo);
        let high_k = count_strikeouts(&high_velo);
        assert!(high_k > low_k, "high_velo_k={high_k} low_velo_k={low_k}");
    }

    #[test]
    fn higher_game_management_pitcher_walks_fewer_batters_on_average() {
        let batter = avg_batter();
        let low_gm = PitcherStats { game_management: 20.0, ..avg_pitcher() };
        let high_gm = PitcherStats { game_management: 80.0, ..avg_pitcher() };

        let count_walks = |pitcher: &PitcherStats| -> u32 {
            let mut bb = 0;
            for seed in 0..2000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if simulate_plate_appearance(&mut rng, &batter, pitcher, [false; 3], 0, 50.0, false) == PaOutcome::Walk {
                    bb += 1;
                }
            }
            bb
        };
        let low_bb = count_walks(&low_gm);
        let high_bb = count_walks(&high_gm);
        assert!(high_bb < low_bb, "high_gm_bb={high_bb} low_gm_bb={low_bb}");
    }

    #[test]
    fn clutch_only_shifts_outcomes_when_the_situation_is_high_leverage() {
        let clutch_pitcher = PitcherStats { clutch: 80.0, ..avg_pitcher() };
        let cold_batter = BatterStats { clutch: 20.0, ..avg_batter() };

        // 평상시(high_leverage=false)엔 클러치가 개입하지 않으므로, 클러치
        // 격차가 아무리 커도 평범한 상대와 결과가 완전히 동일해야 한다.
        for seed in 0..30u64 {
            let mut rng_a = ChaCha8Rng::seed_from_u64(seed);
            let mut rng_b = ChaCha8Rng::seed_from_u64(seed);
            let a = simulate_plate_appearance(&mut rng_a, &cold_batter, &clutch_pitcher, [false; 3], 0, 50.0, false);
            let b = simulate_plate_appearance(&mut rng_b, &cold_batter, &avg_pitcher(), [false; 3], 0, 50.0, false);
            assert_eq!(a, b, "seed={seed}: high_leverage=false면 클러치가 결과에 개입하면 안 됨");
        }
    }

    #[test]
    fn double_play_never_happens_without_a_runner_on_first() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        for seed in 0..500u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let outcome = resolve_in_play_result(&mut rng, &batter, &pitcher, [false, true, true], 0, 50.0, false);
            assert_ne!(outcome, PaOutcome::DoublePlay, "seed={seed}");
        }
    }

    #[test]
    fn double_play_never_happens_with_two_outs_already() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        for seed in 0..500u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let outcome = resolve_in_play_result(&mut rng, &batter, &pitcher, [true, false, false], 2, 50.0, false);
            assert_ne!(outcome, PaOutcome::DoublePlay, "seed={seed}");
        }
    }

    #[test]
    fn double_play_can_happen_with_a_runner_on_first_and_fewer_than_two_outs() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        let found = (0..2000u64).any(|seed| {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            resolve_in_play_result(&mut rng, &batter, &pitcher, [true, false, false], 0, 50.0, false) == PaOutcome::DoublePlay
        });
        assert!(found, "expected at least one seed to produce a double play with a runner on first and 0 outs");
    }

    #[test]
    fn sac_fly_never_happens_without_a_runner_on_third() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        for seed in 0..500u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let outcome = resolve_in_play_result(&mut rng, &batter, &pitcher, [true, true, false], 0, 50.0, false);
            assert_ne!(outcome, PaOutcome::SacFly, "seed={seed}");
        }
    }

    #[test]
    fn sac_fly_can_happen_with_a_runner_on_third_and_fewer_than_two_outs() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        let found = (0..2000u64).any(|seed| {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            resolve_in_play_result(&mut rng, &batter, &pitcher, [false, false, true], 1, 50.0, false) == PaOutcome::SacFly
        });
        assert!(found, "expected at least one seed to produce a sac fly with a runner on third and 1 out");
    }

    #[test]
    fn lower_team_defense_produces_more_reach_on_error_outcomes_on_average() {
        let batter = avg_batter();
        let pitcher = avg_pitcher();
        let count_errors = |team_defense: f64| -> u32 {
            let mut errors = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if resolve_in_play_result(&mut rng, &batter, &pitcher, [false; 3], 0, team_defense, false) == PaOutcome::ReachOnError {
                    errors += 1;
                }
            }
            errors
        };
        let bad_defense_errors = count_errors(20.0);
        let good_defense_errors = count_errors(80.0);
        assert!(bad_defense_errors > good_defense_errors, "bad={bad_defense_errors} good={good_defense_errors}");
    }

    #[test]
    fn average_defense_falls_back_to_neutral_for_an_empty_lineup() {
        assert_eq!(average_defense(&[]), 50.0);
    }
}
