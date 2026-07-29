// 토너먼트 브래킷 (Phase 5-4 — 고교 전국대회 5종)
//
// 리그와 달리 넉아웃은 다음 라운드 대진이 이전 결과에 달려 있다. 그래서 둘로 나눈다:
//   1) generate_tournament_bracket — 전 라운드 뼈대(대진 슬롯·날짜)를 미리 짠다
//   2) advance_tournament_round     — 결과를 받아 다음 라운드 슬롯을 채운다
//
// 시드 배정은 표준 브래킷 순서(1↔N, 2↔N-1 …)를 쓴다. 팀 수가 2의 거듭제곱이 아니면
// 빈 시드가 부전승이 되는데, 이 방식이 기획서의 부전승 수와 정확히 맞아떨어진다:
//   48팀 → 64대진, 부전승 16 (상위 16) · 102팀 → 128대진, 부전승 26 (상위 26)
//   24팀 → 32대진, 부전승 8 (상위 8)
// (02_고교.md §4-2 표) 별도 부전승 규칙을 만들 필요가 없다.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::schedule_engine::{to_game_date, ScheduleEntry};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BracketMatch {
    pub id: String,
    pub round: u32,
    /// 라운드 내 순번(0-based). 다음 라운드 slot = slot / 2
    pub slot: u32,
    pub week: u32,
    pub game_date: String,
    /// 아직 안 정해진 자리는 None (이전 라운드 승자 대기)
    pub home_team_id: Option<String>,
    pub away_team_id: Option<String>,
    /// 부전승 — 경기를 치르지 않고 그대로 올라간다
    pub is_bye: bool,
    pub winner_team_id: Option<String>,
    pub is_protagonist_game: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TournamentBracket {
    pub tournament_id: String,
    pub league_id: String,
    pub season_year: u32,
    /// 2의 거듭제곱으로 올림된 대진 크기 (48팀 → 64)
    pub bracket_size: u32,
    pub total_rounds: u32,
    pub bye_count: u32,
    pub matches: Vec<BracketMatch>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTournamentParams {
    pub tournament_id: String,
    pub league_id: String,
    /// **시드 순서대로** 넘긴다 (index 0 = 1번 시드). 순위 산출은 호출부 책임.
    pub seeded_teams: Vec<String>,
    pub start_week: u32,
    pub end_week: u32,
    pub protagonist_team_id: String,
    pub season_year: Option<u32>,
}

/// 표준 브래킷 시드 순서. size=4 → [1,4,3,2] (1-based 시드 번호)
///
/// 재귀 규칙: 크기 2n의 순서는 크기 n의 각 시드 s를 [s, 2n+1-s]로 펼친 것.
/// 이러면 1번과 2번 시드가 결승 전까지 만나지 않는다.
fn bracket_seed_order(size: u32) -> Vec<u32> {
    let mut order = vec![1u32];
    while (order.len() as u32) < size {
        let n = order.len() as u32 * 2;
        let mut next = Vec::with_capacity(n as usize);
        for &s in &order {
            next.push(s);
            next.push(n + 1 - s);
        }
        order = next;
    }
    order
}

/// 라운드 r(0-based)을 몇째 날에 둘지. 대회는 평일 포함 매일 치른다.
fn tournament_round_day(round: u32, total_rounds: u32, start_week: u32, end_week: u32) -> (u32, u32) {
    let span_days = (end_week.saturating_sub(start_week) + 1) * 7;
    let last = span_days.saturating_sub(1);
    let day = if total_rounds <= 1 {
        0
    } else {
        ((round as u64 * last as u64) / (total_rounds - 1) as u64) as u32
    };
    (start_week + day / 7, day % 7)
}

pub fn generate_tournament_bracket(p: GenerateTournamentParams) -> TournamentBracket {
    let sy = p.season_year.unwrap_or(2026);
    let n = p.seeded_teams.len() as u32;

    let mut bracket_size = 1u32;
    while bracket_size < n {
        bracket_size *= 2;
    }
    let total_rounds = if bracket_size < 2 { 0 } else { bracket_size.trailing_zeros() };

    let mut bracket = TournamentBracket {
        tournament_id: p.tournament_id.clone(),
        league_id: p.league_id.clone(),
        season_year: sy,
        bracket_size,
        total_rounds,
        bye_count: bracket_size.saturating_sub(n),
        matches: Vec::new(),
    };
    if total_rounds == 0 {
        return bracket;
    }

    // 시드 번호 → 팀. 팀 수를 넘는 시드는 빈자리(= 상대의 부전승)
    let order = bracket_seed_order(bracket_size);
    let team_of = |seed: u32| -> Option<String> { p.seeded_teams.get(seed as usize - 1).cloned() };

    for round in 0..total_rounds {
        let matches_in_round = bracket_size >> (round + 1);
        let (week, day_offset) = tournament_round_day(round, total_rounds, p.start_week, p.end_week);
        let game_date = to_game_date(sy, week, day_offset);

        for slot in 0..matches_in_round {
            let (home, away) = if round == 0 {
                (team_of(order[(slot * 2) as usize]), team_of(order[(slot * 2 + 1) as usize]))
            } else {
                (None, None)
            };
            let is_bye = round == 0 && (home.is_none() || away.is_none());
            let winner = if is_bye { home.clone().or_else(|| away.clone()) } else { None };
            let is_protag = home.as_deref() == Some(p.protagonist_team_id.as_str())
                || away.as_deref() == Some(p.protagonist_team_id.as_str());

            bracket.matches.push(BracketMatch {
                id: format!("{}_R{}_M{:02}", p.tournament_id, round + 1, slot),
                round: round + 1,
                slot,
                week,
                game_date: game_date.clone(),
                home_team_id: home,
                away_team_id: away,
                is_bye,
                winner_team_id: winner,
                is_protagonist_game: is_protag && !is_bye,
            });
        }
    }

    // 1라운드 부전승 승자는 즉시 2라운드에 올린다 — 치를 경기가 없으니
    // 호출부가 결과를 넘겨줄 방법이 없다.
    propagate_round(&mut bracket, 1, p.protagonist_team_id.as_str());
    bracket
}

/// `round`의 승자를 다음 라운드 슬롯에 채운다. 승자 없는 경기는 건너뛴다.
fn propagate_round(bracket: &mut TournamentBracket, round: u32, protagonist_team_id: &str) {
    let winners: Vec<(u32, String)> = bracket
        .matches
        .iter()
        .filter(|m| m.round == round)
        .filter_map(|m| m.winner_team_id.clone().map(|w| (m.slot, w)))
        .collect();

    for (slot, winner) in winners {
        let next_slot = slot / 2;
        let to_home = slot % 2 == 0;
        if let Some(next) = bracket
            .matches
            .iter_mut()
            .find(|m| m.round == round + 1 && m.slot == next_slot)
        {
            if to_home {
                next.home_team_id = Some(winner);
            } else {
                next.away_team_id = Some(winner);
            }
            next.is_protagonist_game = next.home_team_id.as_deref() == Some(protagonist_team_id)
                || next.away_team_id.as_deref() == Some(protagonist_team_id);
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundResultInput {
    pub match_id: String,
    pub winner_team_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceTournamentParams {
    pub bracket: TournamentBracket,
    pub round: u32,
    pub results: Vec<RoundResultInput>,
    pub protagonist_team_id: String,
}

/// 한 라운드 결과를 반영하고 다음 라운드 대진을 채운다.
pub fn advance_tournament_round(p: AdvanceTournamentParams) -> TournamentBracket {
    let mut bracket = p.bracket;
    for r in &p.results {
        if let Some(m) = bracket.matches.iter_mut().find(|m| m.id == r.match_id) {
            // 참가하지 않은 팀이 승자로 올라오면 무시한다 — 조용히 오염되면
            // 나중에 "왜 이 팀이 4강에 있지"로 되돌아온다.
            let valid = m.home_team_id.as_deref() == Some(r.winner_team_id.as_str())
                || m.away_team_id.as_deref() == Some(r.winner_team_id.as_str());
            if valid {
                m.winner_team_id = Some(r.winner_team_id.clone());
            }
        }
    }
    propagate_round(&mut bracket, p.round, p.protagonist_team_id.as_str());
    bracket
}

/// 우승팀. 마지막 라운드 승자가 정해졌을 때만 Some.
pub fn tournament_champion(bracket: &TournamentBracket) -> Option<String> {
    bracket
        .matches
        .iter()
        .find(|m| m.round == bracket.total_rounds)
        .and_then(|m| m.winner_team_id.clone())
}

/// 브래킷에서 실제로 치러야 할 경기만 뽑아 일반 일정 형태로 바꾼다.
/// 부전승·대진 미확정은 제외된다.
pub fn bracket_to_schedule(bracket: &TournamentBracket, round: u32) -> Vec<ScheduleEntry> {
    bracket
        .matches
        .iter()
        .filter(|m| m.round == round && !m.is_bye)
        .filter_map(|m| {
            let (h, a) = (m.home_team_id.clone()?, m.away_team_id.clone()?);
            Some(ScheduleEntry {
                id: m.id.clone(),
                week: m.week,
                game_date: m.game_date.clone(),
                league_id: Some(bracket.league_id.clone()),
                home_team_id: h,
                away_team_id: a,
                is_protagonist_game: m.is_protagonist_game,
                phase: "season".to_string(),
                is_tournament: true,
            })
        })
        .collect()
}

// ── 참가팀 선발 (권역 시드 + 와일드카드) ───────────────────────
//
// 기획서는 12권역 기준으로 "권역당 상위 2 = 24"를 썼지만 v2 세계는 8권역이고
// 권역 크기가 6~20으로 갈린다. 권역마다 같은 수를 뽑으면 6팀 권역은 상위 4팀(67%)이
// 전국대회에 나가고 20팀 권역은 20%만 나가는 왜곡이 생긴다.
// → **권역 크기에 비례 배분**(최대잔여법, 권역당 최소 1)으로 바꾼다. 5-3에서
//   "권역 크기 편차를 보정한다"고 정한 것과 같은 원칙이다.

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegionStandingInput {
    pub region_id: String,
    /// **권역 순위 순서대로** (index 0 = 권역 1위)
    pub ranked_teams: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectEntrantsParams {
    pub regions: Vec<RegionStandingInput>,
    /// 대회 총 참가 팀 수 (개나리기 32 · 무궁화기 48 · 국화기 102 …)
    pub total_slots: u32,
    /// 그중 와일드카드로 채울 수. 나머지가 권역 시드.
    pub wildcard_slots: u32,
    /// 와일드카드 정렬 기준 — 팀ID → 전체 승률(내림차순). 없으면 권역 순위로 대체
    #[serde(default)]
    pub win_pct: HashMap<String, f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectEntrantsResult {
    /// 시드 순서대로 정렬된 참가팀 (index 0 = 1번 시드)
    pub seeded_teams: Vec<String>,
    /// 권역별 자동 시드 배정 수 (감사용)
    pub region_quota: BTreeMap<String, u32>,
    pub wildcards: Vec<String>,
}

pub fn select_tournament_entrants(p: SelectEntrantsParams) -> SelectEntrantsResult {
    let mut regions = p.regions.clone();
    regions.sort_by(|a, b| a.region_id.cmp(&b.region_id));

    let total_teams: u32 = regions.iter().map(|r| r.ranked_teams.len() as u32).sum();
    let auto_slots = p.total_slots.saturating_sub(p.wildcard_slots);

    let mut quota: BTreeMap<String, u32> = BTreeMap::new();

    if total_teams <= auto_slots {
        // 전원 참가 대회(국화기) — 비례 배분이 의미 없다
        for r in &regions {
            quota.insert(r.region_id.clone(), r.ranked_teams.len() as u32);
        }
    } else {
        // 최대잔여법: 먼저 내림 배분하고, 남은 자리를 소수부 큰 권역부터 준다.
        // 단순 반올림은 합이 auto_slots와 어긋나 대진이 깨진다.
        let mut remainders: Vec<(f64, String)> = Vec::new();
        let mut assigned = 0u32;
        for r in &regions {
            let exact = r.ranked_teams.len() as f64 * auto_slots as f64 / total_teams as f64;
            let base = (exact.floor() as u32).max(1).min(r.ranked_teams.len() as u32);
            quota.insert(r.region_id.clone(), base);
            assigned += base;
            remainders.push((exact - exact.floor(), r.region_id.clone()));
        }
        // 소수부 내림차순, 동률은 권역ID로 — 시드마다 뒤바뀌면 안 된다
        remainders.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap().then(a.1.cmp(&b.1)));
        let mut i = 0usize;
        while assigned < auto_slots && !remainders.is_empty() {
            let rid = &remainders[i % remainders.len()].1;
            let cap = regions.iter().find(|r| &r.region_id == rid)
                .map(|r| r.ranked_teams.len() as u32).unwrap_or(0);
            let q = quota.entry(rid.clone()).or_insert(0);
            if *q < cap {
                *q += 1;
                assigned += 1;
            }
            i += 1;
            if i > remainders.len() * 64 { break; } // 전 권역이 꽉 찬 경우
        }
    }

    // 자동 시드 확정
    let mut auto: Vec<String> = Vec::new();
    for r in &regions {
        let q = *quota.get(&r.region_id).unwrap_or(&0) as usize;
        auto.extend(r.ranked_teams.iter().take(q).cloned());
    }

    // 와일드카드 = 차순위 팀들을 전체 승률로 정렬해 상위 N장
    let mut pool: Vec<String> = Vec::new();
    for r in &regions {
        let q = *quota.get(&r.region_id).unwrap_or(&0) as usize;
        pool.extend(r.ranked_teams.iter().skip(q).cloned());
    }
    let rank_in_region: HashMap<String, usize> = regions
        .iter()
        .flat_map(|r| r.ranked_teams.iter().enumerate().map(|(i, t)| (t.clone(), i)))
        .collect();
    pool.sort_by(|a, b| {
        let (pa, pb) = (p.win_pct.get(a).copied().unwrap_or(-1.0), p.win_pct.get(b).copied().unwrap_or(-1.0));
        pb.partial_cmp(&pa)
            .unwrap()
            .then(rank_in_region.get(a).cmp(&rank_in_region.get(b)))
            .then(a.cmp(b))
    });
    let wildcards: Vec<String> = pool.into_iter().take(p.wildcard_slots as usize).collect();

    // 전체 시드 = 자동 + WC를 승률 내림차순으로 재정렬.
    // 자동 시드가 WC보다 항상 위는 아니다 — 강한 권역 3위가 약한 권역 1위보다 셀 수 있다.
    let mut seeded: Vec<String> = auto.iter().chain(wildcards.iter()).cloned().collect();
    seeded.sort_by(|a, b| {
        let (pa, pb) = (p.win_pct.get(a).copied().unwrap_or(-1.0), p.win_pct.get(b).copied().unwrap_or(-1.0));
        pb.partial_cmp(&pa)
            .unwrap()
            .then(rank_in_region.get(a).cmp(&rank_in_region.get(b)))
            .then(a.cmp(b))
    });

    SelectEntrantsResult { seeded_teams: seeded, region_quota: quota, wildcards }
}
