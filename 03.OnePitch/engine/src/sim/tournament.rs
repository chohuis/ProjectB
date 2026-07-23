//! 대회 진행 순수 로직 — DB 없이 테스트 가능한 브래킷/게이지 계산만
//! 담는다(대화 2026-07-26, 리그 탭 "진행중인 대회" 재구성). 기존
//! `simulate_knockout_bracket`류(`data::repository`)는 호출 한 번에 대회
//! 전체를 동기로 끝까지 계산했지만, 주인공이 자기 팀 대회 경기를 직접
//! 뛰려면 정규시즌처럼 하루 단위로 진행돼야 한다 — 여기 함수들은 "한
//! 라운드"만 계산하고, DB 스케줄링(`data::repository::advance_tournaments`)
//! 이 그 결과를 `schedule` 테이블에 매일 반영한다.

use std::collections::HashMap;

/// 표준 시드 브래킷 순서 — 재귀적으로 절반씩 접어 상위 시드가 하위
/// 시드와 최대한 늦게 만나도록 배치(1v16·2v15… 관행). 반환값은 1-indexed
/// 시드 번호의 순열(브래킷 포지션 순서) — 길이는 항상 2의 거듭제곱.
pub fn standard_seed_order(n: usize) -> Vec<usize> {
    if n <= 1 {
        return vec![1];
    }
    let half = standard_seed_order(n / 2);
    let mut out = Vec::with_capacity(n);
    for s in half {
        out.push(s);
        out.push(n + 1 - s);
    }
    out
}

/// 넉아웃 대회 시작 시점의 브래킷 상태 — 시드 순서(0=최상위)로 정렬된
/// 팀 목록을 표준 시드 배치로 자리에 채운다. 참가 인원이 2의 거듭제곱보다
/// 적으면 남는 자리는 `None`(부전승) — `standard_seed_order` 성질상
/// 상위 시드부터 부전승을 받는다(bracket_size - n = 부전승 수).
pub fn initial_bracket_state(seeded_teams: &[String]) -> Vec<Option<String>> {
    if seeded_teams.is_empty() {
        return Vec::new();
    }
    let mut bracket_size = 1usize;
    while bracket_size < seeded_teams.len() {
        bracket_size *= 2;
    }
    let order = standard_seed_order(bracket_size);
    order.iter().map(|&seed| seeded_teams.get(seed - 1).cloned()).collect()
}

/// 지금 라운드에서 실제로 경기가 필요한 매치업(양쪽 다 팀이 있는 인접
/// 페어)만 뽑는다 — 부전승(한쪽만 있음)은 경기 없이 다음 라운드로 그대로
/// 넘어가므로 매치업 목록에 안 나온다.
pub fn knockout_round_matchups(bracket_state: &[Option<String>]) -> Vec<(String, String)> {
    bracket_state
        .chunks(2)
        .filter_map(|pair| match pair {
            [Some(a), Some(b)] => Some((a.clone(), b.clone())),
            _ => None,
        })
        .collect()
}

/// 팀 페어를 정렬해 승자 조회 맵의 키로 — 매치업이 어느 쪽이 홈/원정인지와
/// 무관하게 같은 키로 찾을 수 있게 한다.
fn matchup_key(a: &str, b: &str) -> (String, String) {
    if a <= b {
        (a.to_string(), b.to_string())
    } else {
        (b.to_string(), a.to_string())
    }
}

/// 이번 라운드 매치업별 승자(`winners`, 키는 `matchup_key`로 정규화)를
/// 반영해 다음 라운드 브래킷 상태를 만든다 — 부전승 슬롯은 그대로
/// 통과, 실제 경기가 있었던 슬롯은 승자로 교체. 길이가 절반으로 줄어들며
/// 길이 1이 되면 그 팀이 우승.
pub fn next_bracket_state(bracket_state: &[Option<String>], winners: &HashMap<(String, String), String>) -> Vec<Option<String>> {
    bracket_state
        .chunks(2)
        .map(|pair| match pair {
            [Some(a), Some(b)] => winners.get(&matchup_key(a, b)).cloned(),
            [Some(a), None] | [None, Some(a)] => Some(a.clone()),
            _ => None,
        })
        .collect()
}

/// 게이지(사다리)형 대회의 라운드 R 매치업 — 프로 포스트시즌(WC→3위→2위→
/// 1위)·독립리그 최종전(4강→준결승→결승) 공통 형태. `seeds[0]`이 최상위
/// 시드. 1라운드는 최하위 두 시드끼리, 이후 라운드는 그때까지의 생존자가
/// 그 라운드에 배정된 다음 상위 시드와 맞붙는다. `seeds.len()`보다 큰
/// 라운드를 요청하면(대회가 이미 끝났으면) `None`.
pub fn gauntlet_matchup(seeds: &[String], round: i64, survivor: Option<&str>) -> Option<(String, String)> {
    let n = seeds.len();
    if round < 1 || round as usize >= n {
        return None;
    }
    if round == 1 {
        return Some((seeds[n - 2].clone(), seeds[n - 1].clone()));
    }
    let opponent_idx = n.checked_sub(1 + round as usize)?;
    let opponent = seeds.get(opponent_idx)?.clone();
    Some((survivor?.to_string(), opponent))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn teams(n: usize) -> Vec<String> {
        (0..n).map(|i| format!("team:{i}")).collect()
    }

    #[test]
    fn standard_seed_order_matches_documented_bracket_convention_for_eight() {
        assert_eq!(standard_seed_order(8), vec![1, 8, 4, 5, 2, 7, 3, 6]);
    }

    #[test]
    fn initial_bracket_state_pads_to_next_power_of_two_with_top_seeds_getting_byes() {
        let state = initial_bracket_state(&teams(5));
        assert_eq!(state.len(), 8, "5명은 8강 크기로 패딩");
        let bye_count = state.iter().filter(|s| s.is_none()).count();
        assert_eq!(bye_count, 3, "8-5=3명 부전승");
        // 표준 시드 순서상 자리 1(0-index)이 8번 시드 자리 — 5명뿐이면 항상 비어야 함(상위 시드부터 부전승).
        assert_eq!(state[0], Some("team:0".to_string()), "최상위 시드는 항상 첫 자리");
    }

    #[test]
    fn knockout_round_matchups_skips_bye_slots() {
        let state = initial_bracket_state(&teams(5));
        let matchups = knockout_round_matchups(&state);
        assert_eq!(matchups.len(), 1, "8자리 중 실제 대결은 한 쌍만(나머지는 부전승)");
    }

    #[test]
    fn next_bracket_state_carries_byes_through_and_applies_winners() {
        let state = initial_bracket_state(&teams(5));
        let matchups = knockout_round_matchups(&state);
        assert_eq!(matchups.len(), 1);
        let (a, b) = &matchups[0];
        let mut winners = HashMap::new();
        winners.insert(matchup_key(a, b), a.clone());

        let next = next_bracket_state(&state, &winners);
        assert_eq!(next.len(), 4, "8강 -> 4강");
        assert!(next.iter().all(|s| s.is_some()), "4강부턴 전원 배정(더 이상 부전승 없음)");
    }

    #[test]
    fn bracket_reduces_to_a_single_champion_after_enough_rounds() {
        let mut state = initial_bracket_state(&teams(5));
        let mut guard = 0;
        while state.len() > 1 {
            let matchups = knockout_round_matchups(&state);
            let mut winners = HashMap::new();
            for (a, _b) in &matchups {
                winners.insert(matchup_key(a, _b), a.clone()); // 항상 사전순 앞쪽이 이긴다고 가정한 결정적 테스트
            }
            state = next_bracket_state(&state, &winners);
            guard += 1;
            assert!(guard < 10, "무한루프 방지");
        }
        assert_eq!(state.len(), 1);
        assert!(state[0].is_some());
    }

    #[test]
    fn gauntlet_round_one_is_the_two_lowest_seeds() {
        let seeds = teams(5);
        let (a, b) = gauntlet_matchup(&seeds, 1, None).unwrap();
        assert_eq!((a, b), ("team:3".to_string(), "team:4".to_string()));
    }

    #[test]
    fn gauntlet_later_rounds_pit_survivor_against_the_next_seed_up() {
        let seeds = teams(5);
        let (a, b) = gauntlet_matchup(&seeds, 2, Some("team:4")).unwrap();
        assert_eq!((a, b), ("team:4".to_string(), "team:2".to_string()));
        let (a, b) = gauntlet_matchup(&seeds, 4, Some("team:2")).unwrap();
        assert_eq!((a, b), ("team:2".to_string(), "team:0".to_string()), "마지막 라운드는 최상위 시드와");
    }

    #[test]
    fn gauntlet_matchup_returns_none_once_the_ladder_is_exhausted() {
        let seeds = teams(5);
        assert!(gauntlet_matchup(&seeds, 5, Some("team:0")).is_none());
    }
}
