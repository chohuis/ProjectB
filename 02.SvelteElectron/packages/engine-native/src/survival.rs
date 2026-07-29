// 독립 리그 4단계 생존 리그 (Phase 5-6)
//
// 리그도 대회도 아닌 제3의 형식이다. 정규시즌과 포스트시즌이 분리된 고교·대학과 달리
// **매 단계 하위권이 통째로 탈락하며 좁혀진다** (04_독립.md §3):
//   1차 10팀 더블RR 18경기 → 하위 2 탈락
//   2차  8팀 더블RR 14경기 → 하위 4 탈락
//   3차  4팀 싱글RR  3경기 → 최종 정규 순위
//   4차  4팀 포스트시즌 (준PO 단판 → PO 단판 → 챔피언결정전 3전2승)
//
// 각 단계는 이전 대진을 이어받지 않고 **생존팀끼리 새로 라운드로빈**을 돈다 —
// 매 스테이지가 사실상 새 시즌처럼 리셋된다(§3). 그래서 단계마다 순위표도 리셋한다.

use serde::{Deserialize, Serialize};

use crate::postseason_engine::Standing;
use crate::schedule_engine::{build_rounds_targeted, to_game_date, ScheduleEntry};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurvivalStageParams {
    pub league_id: String,
    /// 이 단계에 살아남은 팀
    pub teams: Vec<String>,
    /// 단계 번호 (1~3). 경기 ID와 표시에 쓴다
    pub stage: u32,
    /// 팀당 목표 경기 수 (1차 18 · 2차 14 · 3차 3)
    pub target_games: u32,
    pub start_week: u32,
    pub end_week: u32,
    pub protagonist_team_id: String,
    pub season_year: Option<u32>,
    /// 경기 요일 오프셋. 비우면 주 3일(화·목·토 자리)
    #[serde(default)]
    pub day_offsets: Vec<u32>,
}

/// 한 단계의 일정. 생존팀끼리 새 라운드로빈을 돈다.
pub fn generate_survival_stage(p: SurvivalStageParams) -> Vec<ScheduleEntry> {
    let sy = p.season_year.unwrap_or(2026);
    if p.end_week < p.start_week || p.teams.len() < 2 {
        return vec![];
    }
    let rounds = build_rounds_targeted(&p.teams, p.target_games);
    if rounds.is_empty() {
        return vec![];
    }
    // 독립은 주중 경기 리그다. 고교(주말 6·7)·대학(평일 1~4)과 겹치지 않게 벌린다.
    let days: Vec<u32> = if p.day_offsets.is_empty() { vec![1, 3, 5] } else { p.day_offsets.clone() };

    let span = (p.end_week - p.start_week + 1) as f64;
    let step = span / rounds.len() as f64;
    let mut entries = Vec::new();

    for (ri, round) in rounds.iter().enumerate() {
        let week = (p.start_week + (ri as f64 * step).round() as u32).min(p.end_week);
        for (gi, (home, away)) in round.iter().enumerate() {
            entries.push(ScheduleEntry {
                id: format!("INDS{}_R{:02}_G{}", p.stage, ri + 1, gi + 1),
                week,
                game_date: to_game_date(sy, week, days[(ri + gi) % days.len()]),
                league_id: Some(p.league_id.clone()),
                home_team_id: home.clone(),
                away_team_id: away.clone(),
                is_protagonist_game: *home == p.protagonist_team_id
                    || *away == p.protagonist_team_id,
                phase: "season".to_string(),
                is_tournament: false,
            });
        }
    }
    entries
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurvivalCutoffParams {
    pub standings: Vec<Standing>,
    /// 다음 단계로 올릴 팀 수 (1차→8 · 2차→4)
    pub advance_count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SurvivalCutoffResult {
    /// 순위 순 생존팀
    pub survivors: Vec<String>,
    /// 순위 순 탈락팀 (그 시즌 종료)
    pub eliminated: Vec<String>,
    /// 이 단계 최종 순위 전체 (표시용)
    pub ranked: Vec<String>,
}

/// 단계 순위 정렬.
///
/// 기획서는 "승률 → 승자승 → 실점 최소 → 추첨"이지만, 승자승은 순위표에
/// 상대별 전적이 없어 구현하지 않았다 — 그 자리에 **다득점**을 둔다.
/// 고교·대학 대회 시드가 이미 이 기준으로 돌고 있어 리그 간 일관성이 유지된다.
/// 마지막 팀ID는 결정성용: 완전 동률에서 순서가 흔들리면 탈락 팀이 바뀐다.
fn rank(standings: &[Standing]) -> Vec<String> {
    let mut v = standings.to_vec();
    v.sort_by(|a, b| {
        b.win_pct
            .partial_cmp(&a.win_pct)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.runs_for.cmp(&a.runs_for))
            .then(a.runs_against.cmp(&b.runs_against))
            .then(a.team_id.cmp(&b.team_id))
    });
    v.into_iter().map(|s| s.team_id).collect()
}

pub fn survival_cutoff(p: SurvivalCutoffParams) -> SurvivalCutoffResult {
    let ranked = rank(&p.standings);
    let n = (p.advance_count as usize).min(ranked.len());
    SurvivalCutoffResult {
        survivors: ranked[..n].to_vec(),
        eliminated: ranked[n..].to_vec(),
        ranked,
    }
}

// ── 4차 Stage 포스트시즌 사다리 ────────────────────────────────
//
// 준PO(3위 vs 4위, 단판) → PO(2위 vs 준PO승자, 단판) → 챔결(1위 vs PO승자, 3전2승).
// 구 build_ind_bracket은 "1위 vs 2위 단판" 하나뿐이었다 — 4팀 사다리를 표현 못 한다.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildIndLadderParams {
    /// 3차 Stage 최종 순위표 (4팀)
    pub standings: Vec<Standing>,
}

pub fn build_ind_ladder(p: BuildIndLadderParams) -> Vec<crate::postseason_engine::PostseasonSeries> {
    use crate::postseason_engine::PostseasonSeries;
    let t = rank(&p.standings);
    if t.len() < 4 {
        return vec![];
    }
    let s = |id: &str, round: &str, home: String, away: String, best_of: u32,
             home_from: Option<&str>, away_from: Option<&str>,
             next: Option<&str>, slot: Option<&str>| PostseasonSeries {
        id: id.into(),
        league_id: "LEAGUE_INDEPENDENT".into(),
        round: round.into(),
        home_team_id: home,
        away_team_id: away,
        best_of,
        home_wins: 0,
        away_wins: 0,
        winner: None,
        home_from: home_from.map(|x| x.to_string()),
        away_from: away_from.map(|x| x.to_string()),
        next_series_id: next.map(|x| x.to_string()),
        next_series_slot: slot.map(|x| x.to_string()),
    };

    vec![
        // 준PO: 3위(홈) vs 4위 — 승자가 PO의 원정 자리로
        s("IND_SEMIPO", "준PO", t[2].clone(), t[3].clone(), 1,
          None, None, Some("IND_PO"), Some("away")),
        // PO: 2위(홈) vs 준PO 승자 — 승자가 챔결의 원정 자리로
        s("IND_PO", "PO", t[1].clone(), String::new(), 1,
          None, Some("IND_SEMIPO"), Some("IND_FINAL"), Some("away")),
        // 챔피언결정전: 1위(홈) vs PO 승자, 3전2승
        s("IND_FINAL", "챔피언결정전", t[0].clone(), String::new(), 3,
          None, Some("IND_PO"), None, None),
    ]
}
