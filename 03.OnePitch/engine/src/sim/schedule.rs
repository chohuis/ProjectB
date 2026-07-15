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

/// Generates one league's regular season across however many independent
/// groups it has (프로/프로2군 = 1 group, 대학 = 5 stadium-derived 조,
/// 고교 = 8 region-derived 권역 — 07_구장_파크팩터.md의 이미 확정된 구장
/// 배정을 그대로 그룹 경계로 재사용해 조편성 미확정 문제를 피함).
/// 모든 그룹이 같은 start_day부터 나란히 진행(그룹마다 라운드 수가 달라도
/// 각자 도는 것 — 요일 규칙은 문서에 근거가 없어 매일 1라운드씩 촘촘히
/// 배정하는 placeholder).
pub fn generate_regular_season(
    league_slug: &str,
    groups: &[Vec<String>],
    laps: u32,
    start_day: i64,
    rng: &mut impl Rng,
) -> Vec<ScheduleEntry> {
    let mut entries = Vec::new();
    let mut seq: u64 = 0;
    for group in groups {
        if group.len() < 2 {
            continue;
        }
        let rounds = generate_round_robin_rounds(group, laps, rng);
        for (i, round) in rounds.into_iter().enumerate() {
            let day = start_day + i as i64;
            for (home, away) in round {
                entries.push(ScheduleEntry {
                    game_id: format!("game:{league_slug}_{seq}"),
                    day,
                    home,
                    away,
                });
                seq += 1;
            }
        }
    }
    entries
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
