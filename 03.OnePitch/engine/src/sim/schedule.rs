use rand::seq::SliceRandom;
use rand::Rng;

pub struct ScheduleEntry {
    pub game_id: String,
    pub day: i64,
    pub home: String,
    pub away: String,
}

/// Standard circle-method round-robin: fixes the first team, rotates the
/// rest through n-1 rounds. Odd team counts get a bye slot (silently
/// dropped from output) each round.
fn one_round_robin_cycle(teams: &[String]) -> Vec<Vec<(String, String)>> {
    let mut arr: Vec<Option<String>> = teams.iter().cloned().map(Some).collect();
    if arr.len() % 2 == 1 {
        arr.push(None);
    }
    let n = arr.len();
    if n < 2 {
        return Vec::new();
    }

    let mut rounds = Vec::with_capacity(n - 1);
    for _ in 0..(n - 1) {
        let mut round = Vec::with_capacity(n / 2);
        for i in 0..n / 2 {
            if let (Some(a), Some(b)) = (&arr[i], &arr[n - 1 - i]) {
                round.push((a.clone(), b.clone()));
            }
        }
        rounds.push(round);
        let last = arr.remove(n - 1);
        arr.insert(1, last);
    }
    rounds
}

/// `laps` full round-robin cycles back to back — odd laps play the reverse
/// (home/away swapped) fixture of even laps, standard double round-robin
/// practice, so laps=2 gives every pair one home + one away game.
/// Team order is shuffled once via `rng` so the same league doesn't always
/// open against the same opponent across different canonical_seeds.
pub fn generate_round_robin_rounds(team_ids: &[String], laps: u32, rng: &mut impl Rng) -> Vec<Vec<(String, String)>> {
    let mut teams: Vec<String> = team_ids.to_vec();
    teams.shuffle(rng);
    let base_rounds = one_round_robin_cycle(&teams);

    let mut all_rounds = Vec::with_capacity(base_rounds.len() * laps as usize);
    for lap in 0..laps {
        for round in &base_rounds {
            let r: Vec<(String, String)> = round
                .iter()
                .map(|(a, b)| if lap % 2 == 0 { (a.clone(), b.clone()) } else { (b.clone(), a.clone()) })
                .collect();
            all_rounds.push(r);
        }
    }
    all_rounds
}

/// `laps`바퀴로는 정확히 안 나눠떨어지는 목표 경기수(예: 고교 20경기)를
/// 맞추기 위해 필요한 만큼 바퀴를 돌린 뒤 정확히 `target_games`라운드로
/// 자른다. 그룹 크기가 짝수(bye 없음)면 잘라도 모든 팀이 정확히
/// `target_games`경기를 갖는다 — 홀수 그룹이면 라운드마다 누가 bye인지가
/// 순환하므로 마지막에 잘리는 라운드에 따라 팀별로 ±1경기 오차가 생길 수
/// 있음(지금 실제 리그 그룹은 전부 짝수라 해당 없음, 유닛테스트로 확인).
pub fn generate_round_robin_rounds_targeted(team_ids: &[String], target_games: u32, rng: &mut impl Rng) -> Vec<Vec<(String, String)>> {
    let n = team_ids.len();
    if n < 2 || target_games == 0 {
        return Vec::new();
    }
    let games_per_lap = (n - 1) as u32;
    let laps = target_games.div_ceil(games_per_lap).max(1);
    let mut rounds = generate_round_robin_rounds(team_ids, laps, rng);
    rounds.truncate(target_games as usize);
    rounds
}

/// Generates one league's regular season across however many independent
/// groups it has (프로/프로2군 = 1 group, 대학 = 5 stadium-derived 조,
/// 고교 = 8 region-derived 권역 — 07_구장_파크팩터.md의 이미 확정된 구장
/// 배정을 그대로 그룹 경계로 재사용해 조편성 미확정 문제를 피함).
/// 모든 그룹이 같은 start_day부터 나란히 진행(그룹마다 라운드 수가 달라도
/// 각자 도는 것 — 요일 규칙은 문서에 근거가 없어 매일 1라운드씩 촘촘히
/// 배정하는 placeholder). `laps`는 모든 그룹에 그대로 적용 — 대회 예선
/// 라운드로빈(`begin_group_stage`)처럼 그룹 크기가 균일한 호출부용. 그룹
/// 크기가 리그 내에서 들쭉날쭉한 정규시즌(고교 8권역 등)엔 대신
/// `generate_regular_season_targeted`를 쓴다.
pub fn generate_regular_season(league_slug: &str, groups: &[Vec<String>], laps: u32, start_day: i64, rng: &mut impl Rng) -> Vec<ScheduleEntry> {
    let mut entries = Vec::new();
    let mut seq: u64 = 0;
    for group in groups {
        if group.len() < 2 {
            continue;
        }
        let rounds = generate_round_robin_rounds(group, laps, rng);
        push_entries(&mut entries, &mut seq, league_slug, start_day, rounds);
    }
    entries
}

/// `generate_regular_season`과 동일하지만 그룹마다 크기가 달라도(고교
/// 6~20팀, 대학 10팀) **팀당 정확히 `target_games`경기**로 통일한다 —
/// `generate_round_robin_rounds_targeted` 참고. 정규시즌 스케줄 생성
/// (`repository.rs::generate_schedule`) 전용, 대회 예선 라운드로빈은 그룹
/// 크기가 균일해 원래 `laps` 방식(`generate_regular_season`)을 그대로 쓴다.
pub fn generate_regular_season_targeted(
    league_slug: &str,
    groups: &[Vec<String>],
    target_games: u32,
    start_day: i64,
    rng: &mut impl Rng,
) -> Vec<ScheduleEntry> {
    let mut entries = Vec::new();
    let mut seq: u64 = 0;
    for group in groups {
        if group.len() < 2 {
            continue;
        }
        let rounds = generate_round_robin_rounds_targeted(group, target_games, rng);
        push_entries(&mut entries, &mut seq, league_slug, start_day, rounds);
    }
    entries
}

fn push_entries(entries: &mut Vec<ScheduleEntry>, seq: &mut u64, league_slug: &str, start_day: i64, rounds: Vec<Vec<(String, String)>>) {
    for (i, round) in rounds.into_iter().enumerate() {
        let day = start_day + i as i64;
        for (home, away) in round {
            entries.push(ScheduleEntry { game_id: format!("game:{league_slug}_{seq}"), day, home, away });
            *seq += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn teams(n: usize) -> Vec<String> {
        (0..n).map(|i| format!("team:{i}")).collect()
    }

    #[test]
    fn single_lap_round_robin_gives_every_pair_exactly_one_game() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let rounds = generate_round_robin_rounds(&teams(6), 1, &mut rng);

        let mut games_per_team = std::collections::HashMap::new();
        let mut total = 0;
        for round in &rounds {
            for (h, a) in round {
                *games_per_team.entry(h.clone()).or_insert(0) += 1;
                *games_per_team.entry(a.clone()).or_insert(0) += 1;
                total += 1;
            }
        }
        assert_eq!(total, 6 * 5 / 2); // 15 unique pairs
        for count in games_per_team.values() {
            assert_eq!(*count, 5); // each team plays the other 5 exactly once
        }
    }

    #[test]
    fn odd_team_count_gives_one_bye_per_round() {
        let mut rng = ChaCha8Rng::seed_from_u64(2);
        let rounds = generate_round_robin_rounds(&teams(5), 1, &mut rng);
        assert_eq!(rounds.len(), 5); // n=5 -> padded to 6 -> 5 rounds
        for round in &rounds {
            assert_eq!(round.len(), 2); // 5 teams -> 2 games + 1 bye per round
        }
    }

    #[test]
    fn double_lap_swaps_home_away() {
        let mut rng = ChaCha8Rng::seed_from_u64(3);
        let rounds = generate_round_robin_rounds(&teams(4), 2, &mut rng);
        // lap 1 = rounds[0..3], lap 2 (reversed) = rounds[3..6]
        assert_eq!(rounds.len(), 6);
        let lap1: std::collections::HashSet<(String, String)> = rounds[0..3].iter().flatten().cloned().collect();
        let lap2: std::collections::HashSet<(String, String)> = rounds[3..6].iter().flatten().cloned().collect();
        let lap2_reversed: std::collections::HashSet<(String, String)> =
            lap2.iter().map(|(h, a)| (a.clone(), h.clone())).collect();
        assert_eq!(lap1, lap2_reversed);
    }

    #[test]
    fn targeted_rounds_give_every_team_exactly_the_target_game_count_for_even_groups() {
        // 짝수 그룹(bye 없음)이면 목표 경기수가 (n-1)의 배수든 아니든 팀마다
        // 정확히 target_games경기가 나와야 함(고교 8권역·대학 5조가 전부
        // 짝수라 실제로 이 경로만 탄다).
        for (n, target) in [(6usize, 20u32), (12, 20), (20, 20), (10, 144)] {
            let mut rng = ChaCha8Rng::seed_from_u64(42);
            let rounds = generate_round_robin_rounds_targeted(&teams(n), target, &mut rng);
            let mut games_per_team: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
            for round in &rounds {
                for (h, a) in round {
                    *games_per_team.entry(h.clone()).or_insert(0) += 1;
                    *games_per_team.entry(a.clone()).or_insert(0) += 1;
                }
            }
            assert_eq!(games_per_team.len(), n, "n={n} target={target}");
            for count in games_per_team.values() {
                assert_eq!(*count, target, "n={n} target={target}");
            }
        }
    }

    #[test]
    fn targeted_rounds_returns_nothing_for_a_single_team_or_zero_target() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        assert!(generate_round_robin_rounds_targeted(&teams(1), 20, &mut rng).is_empty());
        assert!(generate_round_robin_rounds_targeted(&teams(6), 0, &mut rng).is_empty());
    }

    #[test]
    fn generate_regular_season_is_deterministic_and_ids_are_unique_across_groups() {
        let groups = vec![teams(4), teams(4).iter().map(|t| format!("g2_{t}")).collect()];

        let mut rng1 = ChaCha8Rng::seed_from_u64(9);
        let a = generate_regular_season("test", &groups, 1, 100, &mut rng1);
        let mut rng2 = ChaCha8Rng::seed_from_u64(9);
        let b = generate_regular_season("test", &groups, 1, 100, &mut rng2);

        assert_eq!(a.len(), b.len());
        let ids: std::collections::HashSet<&String> = a.iter().map(|e| &e.game_id).collect();
        assert_eq!(ids.len(), a.len(), "game_ids must be unique across groups");
        for (x, y) in a.iter().zip(b.iter()) {
            assert_eq!(x.game_id, y.game_id);
            assert_eq!(x.home, y.home);
            assert_eq!(x.away, y.away);
            assert_eq!(x.day, y.day);
        }
    }
}
