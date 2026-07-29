// 조별예선 → 본선 토너먼트 (Phase 5-5d — 대학 은하기·여명기)
//
// 넉아웃만 있는 브래킷(tournament.rs)으로는 표현이 안 되는 형식이다:
//   은하기 24팀 → 8조 × 3팀 라운드로빈 → **조 1위만** 8팀 → 8강
//   여명기 20팀 → 4조 × 5팀 라운드로빈 → **조 상위 2** 8팀 → 8강
// (03_대학.md §4-2)
//
// 조 편성은 기획서가 "완전 랜덤 추첨(시드 없음)"이라 했고 그게 '죽음의 조' 드라마의
// 근거다. 다만 이 프로젝트는 worldSeed 결정성이 원칙이라 **seed 기반 결정적 셔플**을
// 쓴다 — 플레이어에겐 여전히 예측 불가한 추첨이고, 세이브를 다시 불러도 같은 조가 나온다.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::schedule_engine::{to_game_date, ScheduleEntry};

/// splitmix64 — 작고 결정적인 난수원. 같은 seed면 어디서 돌려도 같은 수열.
fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

/// 문자열 → u64. 대회 id·시즌을 seed에 섞어 대회마다 다른 추첨이 나오게 한다.
fn hash_str(s: &str) -> u64 {
    let mut h = 0xCBF29CE484222325u64;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001B3);
    }
    h
}

/// Fisher-Yates. 결정적이고, 입력 순서와 무관하게 seed만으로 결과가 정해진다.
fn shuffle(items: &mut Vec<String>, seed: u64) {
    let mut st = seed;
    for i in (1..items.len()).rev() {
        let j = (splitmix64(&mut st) % (i as u64 + 1)) as usize;
        items.swap(i, j);
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GroupStanding {
    pub team_id: String,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub runs_for: u32,
    pub runs_against: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QualifyingGroup {
    /// "A" … "H"
    pub label: String,
    pub teams: Vec<String>,
    pub standings: Vec<GroupStanding>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GroupStage {
    pub tournament_id: String,
    pub league_id: String,
    pub season_year: u32,
    pub groups: Vec<QualifyingGroup>,
    /// 조당 본선 진출 수 (은하기 1 · 여명기 2)
    pub advance_per_group: u32,
    pub start_week: u32,
    pub end_week: u32,
    /// 예선 전 경기
    pub matches: Vec<ScheduleEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildGroupStageParams {
    pub tournament_id: String,
    pub league_id: String,
    /// 시드 순 참가팀. 조 편성은 **시드를 무시하고** 섞는다 (기획서: 시드 없는 추첨)
    pub seeded_teams: Vec<String>,
    pub group_count: u32,
    pub advance_per_group: u32,
    pub start_week: u32,
    pub end_week: u32,
    pub protagonist_team_id: String,
    pub season_year: Option<u32>,
    /// 세이브의 worldSeed. 같은 세이브를 다시 열어도 같은 조가 나오게 한다.
    pub world_seed: Option<u32>,
    /// 예선 경기 요일 오프셋. 비우면 매일(0~6) 순환.
    #[serde(default)]
    pub day_offsets: Vec<u32>,
}

const GROUP_LABELS: [&str; 8] = ["A", "B", "C", "D", "E", "F", "G", "H"];

pub fn build_group_stage(p: BuildGroupStageParams) -> GroupStage {
    let sy = p.season_year.unwrap_or(2026);
    let n_groups = p.group_count.max(1) as usize;

    // 추첨 — worldSeed × 대회 × 시즌. 대회마다 다르고, 같은 세이브면 늘 같다.
    let seed = hash_str(&p.tournament_id)
        ^ (p.world_seed.unwrap_or(0) as u64).wrapping_mul(0x9E3779B97F4A7C15)
        ^ (sy as u64).wrapping_mul(0xD1B54A32D192ED03);
    let mut pool = p.seeded_teams.clone();
    shuffle(&mut pool, seed);

    // 뱀 배분이 아니라 순차 배분 — 이미 섞였으므로 뱀으로 나눠봐야 의미가 없다
    let mut groups: Vec<QualifyingGroup> = (0..n_groups)
        .map(|i| QualifyingGroup {
            label: GROUP_LABELS.get(i).copied().unwrap_or("?").to_string(),
            teams: Vec::new(),
            standings: Vec::new(),
        })
        .collect();
    for (i, t) in pool.iter().enumerate() {
        groups[i % n_groups].teams.push(t.clone());
    }
    for g in groups.iter_mut() {
        g.teams.sort();
        g.standings = g
            .teams
            .iter()
            .map(|t| GroupStanding {
                team_id: t.clone(), wins: 0, losses: 0, draws: 0, runs_for: 0, runs_against: 0,
            })
            .collect();
    }

    // 조별 단일 라운드로빈
    let days: Vec<u32> = if p.day_offsets.is_empty() { (0..7).collect() } else { p.day_offsets.clone() };
    let span = (p.end_week.saturating_sub(p.start_week) + 1) as f64;
    let mut matches = Vec::new();

    for (gi, g) in groups.iter().enumerate() {
        let rounds = single_round_robin(&g.teams);
        if rounds.is_empty() {
            continue;
        }
        let step = span / rounds.len() as f64;
        for (ri, round) in rounds.iter().enumerate() {
            let week = (p.start_week + (ri as f64 * step).round() as u32).min(p.end_week);
            for (mi, (home, away)) in round.iter().enumerate() {
                let day = days[(gi + mi) % days.len()];
                matches.push(ScheduleEntry {
                    id: format!("{}_Q{}_R{}_M{}", p.tournament_id, g.label, ri + 1, mi + 1),
                    week,
                    game_date: to_game_date(sy, week, day),
                    league_id: Some(p.league_id.clone()),
                    home_team_id: home.clone(),
                    away_team_id: away.clone(),
                    is_protagonist_game: *home == p.protagonist_team_id
                        || *away == p.protagonist_team_id,
                    phase: "season".to_string(),
                    is_tournament: true,
                });
            }
        }
    }

    GroupStage {
        tournament_id: p.tournament_id,
        league_id: p.league_id,
        season_year: sy,
        groups,
        advance_per_group: p.advance_per_group,
        start_week: p.start_week,
        end_week: p.end_week,
        matches,
    }
}

/// 조별 단일 라운드로빈 (3팀이면 3경기, 5팀이면 10경기)
fn single_round_robin(teams: &[String]) -> Vec<Vec<(String, String)>> {
    let n = teams.len();
    if n < 2 {
        return vec![];
    }
    let mut list: Vec<String> = teams.to_vec();
    let odd = n % 2 != 0;
    if odd {
        list.push("__BYE__".to_string());
    }
    let m = list.len();
    let mut rounds = Vec::new();
    for r in 0..m - 1 {
        let mut round = Vec::new();
        for i in 0..m / 2 {
            let a = list[i].clone();
            let b = list[m - 1 - i].clone();
            if a != "__BYE__" && b != "__BYE__" {
                if r % 2 == 0 { round.push((a, b)); } else { round.push((b, a)); }
            }
        }
        if !round.is_empty() {
            rounds.push(round);
        }
        let last = list.pop().unwrap();
        list.insert(1, last);
    }
    rounds
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupResultInput {
    pub match_id: String,
    pub home_score: u32,
    pub away_score: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyGroupResultsParams {
    pub stage: GroupStage,
    pub results: Vec<GroupResultInput>,
}

/// 예선 경기 결과를 조 순위에 반영한다.
pub fn apply_group_results(p: ApplyGroupResultsParams) -> GroupStage {
    let mut stage = p.stage;
    let by_id: BTreeMap<String, &ScheduleEntry> =
        stage.matches.iter().map(|m| (m.id.clone(), m)).collect();

    // 어떤 경기가 어느 팀 대결인지 먼저 뽑아둔다 (borrow 충돌 회피)
    let applied: Vec<(String, String, u32, u32)> = p
        .results
        .iter()
        .filter_map(|r| {
            by_id.get(&r.match_id).map(|m| {
                (m.home_team_id.clone(), m.away_team_id.clone(), r.home_score, r.away_score)
            })
        })
        .collect();

    for (home, away, hs, as_) in applied {
        for g in stage.groups.iter_mut() {
            for st in g.standings.iter_mut() {
                if st.team_id == home {
                    st.runs_for += hs;
                    st.runs_against += as_;
                    if hs > as_ { st.wins += 1 } else if hs < as_ { st.losses += 1 } else { st.draws += 1 }
                } else if st.team_id == away {
                    st.runs_for += as_;
                    st.runs_against += hs;
                    if as_ > hs { st.wins += 1 } else if as_ < hs { st.losses += 1 } else { st.draws += 1 }
                }
            }
        }
    }
    stage
}

/// 조 순위 정렬 — 승률 → 득실차 → 다득점 → 팀ID.
///
/// 마지막 팀ID까지 넣는 이유는 리그 순위와 같다: 동률에서 순서가 흔들리면
/// 본선 대진이 달라져 결정성이 깨진다.
fn rank_group(g: &QualifyingGroup) -> Vec<String> {
    let mut v = g.standings.clone();
    v.sort_by(|a, b| {
        let pa = if a.wins + a.losses + a.draws > 0 {
            a.wins as f64 / (a.wins + a.losses + a.draws) as f64
        } else { 0.0 };
        let pb = if b.wins + b.losses + b.draws > 0 {
            b.wins as f64 / (b.wins + b.losses + b.draws) as f64
        } else { 0.0 };
        let da = a.runs_for as i64 - a.runs_against as i64;
        let db = b.runs_for as i64 - b.runs_against as i64;
        pb.partial_cmp(&pa)
            .unwrap()
            .then(db.cmp(&da))
            .then(b.runs_for.cmp(&a.runs_for))
            .then(a.team_id.cmp(&b.team_id))
    });
    v.into_iter().map(|s| s.team_id).collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualifiersResult {
    /// 본선 진출팀 — **시드 순**. 조 1위들이 먼저, 그 다음 조 2위들.
    pub qualified: Vec<String>,
    /// 조별 최종 순위 (감사·표시용)
    pub group_ranks: BTreeMap<String, Vec<String>>,
}

/// 예선 통과팀을 본선 시드 순으로 뽑는다.
///
/// 조 1위 블록 → 조 2위 블록 순으로 놓는다. 그래야 브래킷 표준 시드에서
/// 조 1위끼리 1라운드에 만나지 않는다.
pub fn group_stage_qualifiers(stage: &GroupStage) -> QualifiersResult {
    let mut group_ranks: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for g in &stage.groups {
        group_ranks.insert(g.label.clone(), rank_group(g));
    }
    let mut qualified = Vec::new();
    for pos in 0..stage.advance_per_group as usize {
        for g in &stage.groups {
            if let Some(t) = group_ranks.get(&g.label).and_then(|v| v.get(pos)) {
                qualified.push(t.clone());
            }
        }
    }
    QualifiersResult { qualified, group_ranks }
}
