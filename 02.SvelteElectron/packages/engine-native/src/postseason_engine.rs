use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::schedule_engine::{ScheduleEntry, to_game_date};

// ── Types ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Standing {
    pub team_id: String,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub win_pct: f64,
    pub runs_for: u32,
    pub runs_against: u32,
    pub streak: String,
    pub last10: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PostseasonSeries {
    pub id: String,
    pub league_id: String,
    pub round: String,
    pub home_team_id: String,
    pub away_team_id: String,
    pub best_of: u32,
    pub home_wins: u32,
    pub away_wins: u32,
    pub winner: Option<String>,
    pub home_from: Option<String>,
    pub away_from: Option<String>,
    pub next_series_id: Option<String>,
    pub next_series_slot: Option<String>,
}

fn wins_needed(best_of: u32) -> u32 {
    (best_of + 1) / 2
}

fn sort_teams(standings: &[Standing]) -> Vec<String> {
    let mut sorted = standings.to_vec();
    sorted.sort_by(|a, b| {
        b.win_pct.partial_cmp(&a.win_pct)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.wins.cmp(&a.wins))
    });
    sorted.into_iter().map(|s| s.team_id).collect()
}

// ── Bracket builders ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildBracketParams {
    pub standings: Vec<Standing>,
}

pub fn build_kbl_bracket(p: BuildBracketParams) -> Vec<PostseasonSeries> {
    let t = sort_teams(&p.standings);
    if t.len() < 6 { return vec![]; }
    vec![
        PostseasonSeries { id: "KBL_WC".into(),   league_id: "LEAGUE_KBL".into(), round: "와일드카드".into(),   home_team_id: t[4].clone(), away_team_id: t[5].clone(), best_of: 1, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: None,                    next_series_id: Some("KBL_PREP".into()), next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "KBL_PREP".into(), league_id: "LEAGUE_KBL".into(), round: "준플레이오프".into(), home_team_id: t[3].clone(), away_team_id: "".into(),     best_of: 3, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: Some("KBL_WC".into()),   next_series_id: Some("KBL_PO".into()),   next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "KBL_PO".into(),   league_id: "LEAGUE_KBL".into(), round: "플레이오프".into(),   home_team_id: t[1].clone(), away_team_id: "".into(),     best_of: 5, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: Some("KBL_PREP".into()), next_series_id: Some("KBL_KS".into()),   next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "KBL_KS".into(),   league_id: "LEAGUE_KBL".into(), round: "한국시리즈".into(),   home_team_id: t[0].clone(), away_team_id: "".into(),     best_of: 7, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: Some("KBL_PO".into()),   next_series_id: None,                    next_series_slot: None },
    ]
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildAblBracketParams {
    pub east_standings: Vec<Standing>,
    pub west_standings: Vec<Standing>,
}

pub fn build_abl_bracket(p: BuildAblBracketParams) -> Vec<PostseasonSeries> {
    let e = sort_teams(&p.east_standings);
    let w = sort_teams(&p.west_standings);
    if e.len() < 4 || w.len() < 4 { return vec![]; }
    vec![
        PostseasonSeries { id: "ABL_EWC".into(), league_id: "LEAGUE_ABL".into(), round: "이스트 와일드카드".into(),    home_team_id: e[2].clone(), away_team_id: e[3].clone(), best_of: 3, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: None,                    next_series_id: Some("ABL_EDS".into()), next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "ABL_WWC".into(), league_id: "LEAGUE_ABL".into(), round: "웨스트 와일드카드".into(),    home_team_id: w[2].clone(), away_team_id: w[3].clone(), best_of: 3, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: None,                    next_series_id: Some("ABL_WDS".into()), next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "ABL_EDS".into(), league_id: "LEAGUE_ABL".into(), round: "이스트 디비전시리즈".into(), home_team_id: e[0].clone(), away_team_id: "".into(),     best_of: 5, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: Some("ABL_EWC".into()), next_series_id: Some("ABL_CS".into()),  next_series_slot: Some("home".into()) },
        PostseasonSeries { id: "ABL_WDS".into(), league_id: "LEAGUE_ABL".into(), round: "웨스트 디비전시리즈".into(), home_team_id: w[0].clone(), away_team_id: "".into(),     best_of: 5, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: Some("ABL_WWC".into()), next_series_id: Some("ABL_CS".into()),  next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "ABL_CS".into(),  league_id: "LEAGUE_ABL".into(), round: "챔피언십시리즈".into(),      home_team_id: "".into(),    away_team_id: "".into(),     best_of: 7, home_wins: 0, away_wins: 0, winner: None, home_from: Some("ABL_EDS".into()), away_from: Some("ABL_WDS".into()), next_series_id: None, next_series_slot: None },
    ]
}

pub fn build_univ_bracket(p: BuildBracketParams) -> Vec<PostseasonSeries> {
    let t = sort_teams(&p.standings);
    if t.len() < 4 { return vec![]; }
    vec![
        PostseasonSeries { id: "UNIV_SEMI1".into(), league_id: "LEAGUE_UNIVERSITY".into(), round: "준결승".into(), home_team_id: t[0].clone(), away_team_id: t[3].clone(), best_of: 1, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: None, next_series_id: Some("UNIV_FINAL".into()), next_series_slot: Some("home".into()) },
        PostseasonSeries { id: "UNIV_SEMI2".into(), league_id: "LEAGUE_UNIVERSITY".into(), round: "준결승".into(), home_team_id: t[1].clone(), away_team_id: t[2].clone(), best_of: 1, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: None, next_series_id: Some("UNIV_FINAL".into()), next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "UNIV_FINAL".into(), league_id: "LEAGUE_UNIVERSITY".into(), round: "결승".into(),   home_team_id: "".into(),    away_team_id: "".into(),    best_of: 1, home_wins: 0, away_wins: 0, winner: None, home_from: Some("UNIV_SEMI1".into()), away_from: Some("UNIV_SEMI2".into()), next_series_id: None, next_series_slot: None },
    ]
}

pub fn build_jbl_bracket(p: BuildBracketParams) -> Vec<PostseasonSeries> {
    let cl: Vec<Standing> = p.standings.iter().filter(|s| s.team_id.contains("_CL_")).cloned().collect();
    let pl: Vec<Standing> = p.standings.iter().filter(|s| s.team_id.contains("_PL_")).cloned().collect();
    if cl.len() < 3 || pl.len() < 3 { return vec![]; }
    let cl = sort_teams(&cl);
    let pl = sort_teams(&pl);
    vec![
        PostseasonSeries { id: "JBL_CL_CS1".into(), league_id: "LEAGUE_JBL".into(), round: "CL 클라이맥스 1스테이지".into(), home_team_id: cl[1].clone(), away_team_id: cl[2].clone(), best_of: 3, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: None,                       next_series_id: Some("JBL_CL_CF".into()), next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "JBL_PL_CS1".into(), league_id: "LEAGUE_JBL".into(), round: "PL 클라이맥스 1스테이지".into(), home_team_id: pl[1].clone(), away_team_id: pl[2].clone(), best_of: 3, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: None,                       next_series_id: Some("JBL_PL_CF".into()),  next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "JBL_CL_CF".into(),  league_id: "LEAGUE_JBL".into(), round: "CL 클라이맥스 파이널".into(),    home_team_id: cl[0].clone(), away_team_id: "".into(),     best_of: 5, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: Some("JBL_CL_CS1".into()), next_series_id: Some("JBL_JS".into()),    next_series_slot: Some("home".into()) },
        PostseasonSeries { id: "JBL_PL_CF".into(),  league_id: "LEAGUE_JBL".into(), round: "PL 클라이맥스 파이널".into(),    home_team_id: pl[0].clone(), away_team_id: "".into(),     best_of: 5, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: Some("JBL_PL_CS1".into()), next_series_id: Some("JBL_JS".into()),    next_series_slot: Some("away".into()) },
        PostseasonSeries { id: "JBL_JS".into(),     league_id: "LEAGUE_JBL".into(), round: "일본시리즈".into(),              home_team_id: "".into(),     away_team_id: "".into(),     best_of: 7, home_wins: 0, away_wins: 0, winner: None, home_from: Some("JBL_CL_CF".into()), away_from: Some("JBL_PL_CF".into()), next_series_id: None, next_series_slot: None },
    ]
}

pub fn build_ind_bracket(p: BuildBracketParams) -> Vec<PostseasonSeries> {
    let t = sort_teams(&p.standings);
    if t.len() < 2 { return vec![]; }
    vec![
        PostseasonSeries { id: "IND_FINAL".into(), league_id: "LEAGUE_INDEPENDENT".into(), round: "결승".into(), home_team_id: t[0].clone(), away_team_id: t[1].clone(), best_of: 1, home_wins: 0, away_wins: 0, winner: None, home_from: None, away_from: None, next_series_id: None, next_series_slot: None },
    ]
}

// ── Series operations ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyGameToSeriesParams {
    pub series: PostseasonSeries,
    pub winner_id: String,
}

pub fn apply_game_to_series(p: ApplyGameToSeriesParams) -> PostseasonSeries {
    let s = p.series;
    let hw = if p.winner_id == s.home_team_id { s.home_wins + 1 } else { s.home_wins };
    let aw = if p.winner_id == s.away_team_id { s.away_wins + 1 } else { s.away_wins };
    let needed = wins_needed(s.best_of);
    let winner = if hw >= needed { Some(s.home_team_id.clone()) }
                 else if aw >= needed { Some(s.away_team_id.clone()) }
                 else { None };
    PostseasonSeries { home_wins: hw, away_wins: aw, winner, ..s }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FillNextSeriesParams {
    pub bracket: Vec<PostseasonSeries>,
    pub completed: PostseasonSeries,
}

pub fn fill_next_series(p: FillNextSeriesParams) -> Vec<PostseasonSeries> {
    let c = &p.completed;
    if c.winner.is_none() || c.next_series_id.is_none() { return p.bracket; }
    let next_id = c.next_series_id.as_deref().unwrap();
    let winner = c.winner.as_deref().unwrap();
    let slot = c.next_series_slot.as_deref();
    p.bracket.into_iter().map(|s| {
        if s.id != next_id { return s; }
        let home = if slot == Some("home") { winner.to_string() } else { s.home_team_id.clone() };
        let away = if slot == Some("away") { winner.to_string() } else { s.away_team_id.clone() };
        PostseasonSeries { home_team_id: home, away_team_id: away, ..s }
    }).collect()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveNpcSeriesParams {
    pub bracket: Vec<PostseasonSeries>,
    pub protagonist_team_id: String,
}

pub fn resolve_non_protagonist_series(p: ResolveNpcSeriesParams) -> Vec<PostseasonSeries> {
    let mut cur = p.bracket;
    let pt = &p.protagonist_team_id;
    let mut rng = rand::thread_rng();

    for _ in 0..20 {
        let mut changed = false;
        for i in 0..cur.len() {
            if cur[i].winner.is_some() { continue; }
            if cur[i].home_team_id.is_empty() || cur[i].away_team_id.is_empty() { continue; }
            if &cur[i].home_team_id == pt || &cur[i].away_team_id == pt { continue; }

            let needed = wins_needed(cur[i].best_of);
            let mut hw = 0u32;
            let mut aw = 0u32;
            while hw < needed && aw < needed {
                if rng.gen::<f64>() < 0.5 { hw += 1; } else { aw += 1; }
            }
            let winner = if hw >= needed { Some(cur[i].home_team_id.clone()) } else { Some(cur[i].away_team_id.clone()) };
            let updated = PostseasonSeries { home_wins: hw, away_wins: aw, winner, ..cur[i].clone() };
            let completed = updated.clone();
            cur[i] = updated;
            cur = fill_next_series(FillNextSeriesParams { bracket: cur, completed });
            changed = true;
        }
        if !changed { break; }
    }
    cur
}

// ── Make series game ──────────────────────────────────────────

const SERIES_DAY_OFFSETS: &[u32] = &[5, 6, 8, 9, 10, 12, 13];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MakeSeriesGameParams {
    pub series: PostseasonSeries,
    pub game_num: u32,
    pub base_week: u32,
    pub protagonist_team_id: String,
    pub season_year: u32,
}

pub fn make_series_game(p: MakeSeriesGameParams) -> ScheduleEntry {
    let off_idx = ((p.game_num - 1) as usize).min(SERIES_DAY_OFFSETS.len() - 1);
    let offset = SERIES_DAY_OFFSETS[off_idx];
    let week = if offset >= 7 { p.base_week + 1 } else { p.base_week };
    let s = &p.series;
    ScheduleEntry {
        id: format!("{}_G{}", s.id, p.game_num),
        week,
        game_date: to_game_date(p.season_year, p.base_week, offset),
        league_id: Some(s.league_id.clone()),
        home_team_id: s.home_team_id.clone(),
        away_team_id: s.away_team_id.clone(),
        is_protagonist_game: s.home_team_id == p.protagonist_team_id || s.away_team_id == p.protagonist_team_id,
        phase: "postseason".to_string(),
    }
}

// ── Shuffle ───────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AblConferences {
    pub east: Vec<String>,
    pub west: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShuffleAblConferencesParams {
    pub all_teams: Vec<String>,
}

pub fn shuffle_abl_conferences(p: ShuffleAblConferencesParams) -> AblConferences {
    let mut arr = p.all_teams;
    let mut rng = rand::thread_rng();
    for i in (1..arr.len()).rev() {
        let j = rng.gen_range(0..=i);
        arr.swap(i, j);
    }
    let half = arr.len() / 2;
    AblConferences { east: arr[..half].to_vec(), west: arr[half..].to_vec() }
}
