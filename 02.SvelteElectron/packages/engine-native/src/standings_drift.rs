use rand::Rng;
use serde::{Deserialize, Serialize};

// 반경 2(드리프트) 리그용 — 개인 선수 데이터 없이 팀 전력치(prestige 등 proTeamProfile 기반)만으로
// 주 1회 승패를 누적한다. DESIGN.md §2.1 "순위표 드리프트: Rust 호출 1개/주. 팀 전력치 + 노이즈로 승패만 누적"

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDriftInput {
    pub team_id: String,
    pub power: f64, // 0~100, team.proTeamProfile.prestige 등에서 파생
    pub wins: i32,
    pub losses: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandingsDriftParams {
    pub teams: Vec<TeamDriftInput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDriftResult {
    pub team_id: String,
    pub wins: i32,
    pub losses: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StandingsDriftResult {
    pub teams: Vec<TeamDriftResult>,
}

pub fn standings_drift(p: StandingsDriftParams) -> StandingsDriftResult {
    let mut rng = rand::thread_rng();
    let mut order: Vec<usize> = (0..p.teams.len()).collect();
    // Fisher-Yates 셔플 — 매주 다른 대진
    for i in (1..order.len()).rev() {
        let j = rng.gen_range(0..=i);
        order.swap(i, j);
    }

    let mut wins: Vec<i32> = p.teams.iter().map(|t| t.wins).collect();
    let mut losses: Vec<i32> = p.teams.iter().map(|t| t.losses).collect();

    let mut idx = 0;
    while idx + 1 < order.len() {
        let a = order[idx];
        let b = order[idx + 1];
        let power_diff = p.teams[a].power - p.teams[b].power;
        // 시그모이드 + 소량 노이즈 — 전력차 20점당 승률 약 73%
        let win_prob_a = (1.0 / (1.0 + (-power_diff / 8.0).exp())).clamp(0.05, 0.95);
        if rng.gen::<f64>() < win_prob_a {
            wins[a] += 1;
            losses[b] += 1;
        } else {
            wins[b] += 1;
            losses[a] += 1;
        }
        idx += 2;
    }
    // 홀수 팀 수면 마지막 한 팀은 이번 주 bye(휴식) — 승패 변화 없음

    let teams = p
        .teams
        .iter()
        .enumerate()
        .map(|(i, t)| TeamDriftResult {
            team_id: t.team_id.clone(),
            wins: wins[i],
            losses: losses[i],
        })
        .collect();

    StandingsDriftResult { teams }
}
