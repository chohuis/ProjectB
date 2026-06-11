use serde::{Deserialize, Serialize};
use rand::Rng;
use std::collections::HashMap;

// ── Shared output type ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleEntry {
    pub id: String,
    pub week: u32,
    pub game_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub league_id: Option<String>,
    pub home_team_id: String,
    pub away_team_id: String,
    pub is_protagonist_game: bool,
    pub phase: String,
}

// ── Date helper ───────────────────────────────────────────────

fn is_leap(y: u32) -> bool {
    y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
}

fn feb_days(y: u32) -> u32 {
    if is_leap(y) { 29 } else { 28 }
}

pub fn to_game_date(season_year: u32, week: u32, day_offset: u32) -> String {
    let days_from_march1 = week.saturating_sub(1) * 7 + day_offset;
    let mut year = season_year;
    let mut doy = 31 + feb_days(year) + days_from_march1;

    loop {
        let days_in_year = if is_leap(year) { 366u32 } else { 365u32 };
        if doy < days_in_year { break; }
        doy -= days_in_year;
        year += 1;
    }

    let months = [31u32, feb_days(year), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u32;
    let mut rem = doy;
    for &md in &months {
        if rem < md { break; }
        rem -= md;
        month += 1;
    }
    format!("{:04}-{:02}-{:02}", year, month, rem + 1)
}

// ── Round-robin (circle/rotation method — scheduleGen style) ──

fn round_robin_pairs(teams: &[String]) -> Vec<Vec<(String, String)>> {
    let mut ts: Vec<String> = if teams.len() % 2 == 0 {
        teams.to_vec()
    } else {
        let mut v = teams.to_vec();
        v.push("__BYE__".to_string());
        v
    };
    let half = ts.len() / 2;
    let mut rounds: Vec<Vec<(String, String)>> = Vec::new();

    for r in 0..ts.len() - 1 {
        let mut round: Vec<(String, String)> = Vec::new();
        for i in 0..half {
            let a = ts[i].clone();
            let b = ts[ts.len() - 1 - i].clone();
            if a != "__BYE__" && b != "__BYE__" {
                if r % 2 == 0 { round.push((a, b)); } else { round.push((b, a)); }
            }
        }
        rounds.push(round);
        let last = ts.pop().unwrap();
        ts.insert(1, last);
    }
    rounds
}

fn get_phase(week: u32, season_start: u32, season_end: u32, postseason_end: u32) -> &'static str {
    if week < season_start { "preseason" }
    else if week <= season_end { "season" }
    else if week <= postseason_end { "postseason" }
    else { "offseason" }
}

// ── Berger-table round-robin (leagueScheduler style) ──────────

fn build_round_robin(teams: &[String]) -> Vec<Vec<(String, String)>> {
    let n = if teams.len() % 2 == 0 { teams.len() } else { teams.len() + 1 };
    let mut list: Vec<String> = teams.to_vec();
    if list.len() % 2 != 0 { list.push("BYE".to_string()); }

    let fixed = list[n - 1].clone();
    let rotating: Vec<String> = list[..n - 1].to_vec();
    let mut rounds: Vec<Vec<(String, String)>> = Vec::new();

    for r in 0..n - 1 {
        let mut matches: Vec<(String, String)> = Vec::new();
        let (h0, a0) = if r % 2 == 0 {
            (fixed.clone(), rotating[r % (n - 1)].clone())
        } else {
            (rotating[r % (n - 1)].clone(), fixed.clone())
        };
        if h0 != "BYE" && a0 != "BYE" { matches.push((h0, a0)); }

        for i in 1..n / 2 {
            let h = rotating[(r + i) % (n - 1)].clone();
            let a = rotating[(r + (n - 1) - i) % (n - 1)].clone();
            if h != "BYE" && a != "BYE" { matches.push((h, a)); }
        }
        rounds.push(matches);
    }
    rounds
}

fn build_double_round_robin(teams: &[String]) -> Vec<Vec<(String, String)>> {
    let half = build_round_robin(teams);
    let rev: Vec<Vec<(String, String)>> = half.iter()
        .map(|r| r.iter().map(|(h, a)| (a.clone(), h.clone())).collect())
        .collect();
    [half, rev].concat()
}

fn assign_rounds_to_weeks(
    rounds: &[Vec<(String, String)>],
    start_week: u32,
    end_week: u32,
    league_id: &str,
    id_prefix: &str,
    protagonist_team_id: &str,
    season_year: u32,
) -> Vec<ScheduleEntry> {
    let mut entries = Vec::new();
    if rounds.is_empty() { return entries; }
    let available = (end_week - start_week + 1) as f64;
    let step = available / rounds.len() as f64;

    for (ri, round) in rounds.iter().enumerate() {
        let week = (start_week + (ri as f64 * step).round() as u32).min(end_week);
        let game_date = to_game_date(season_year, week, 5);
        for (gi, (home, away)) in round.iter().enumerate() {
            entries.push(ScheduleEntry {
                id: format!("{}_R{:02}_G{}", id_prefix, ri + 1, gi + 1),
                week,
                game_date: game_date.clone(),
                league_id: Some(league_id.to_string()),
                home_team_id: home.clone(),
                away_team_id: away.clone(),
                is_protagonist_game: home == protagonist_team_id || away == protagonist_team_id,
                phase: "season".to_string(),
            });
        }
    }
    entries
}

// ── Pro-league schedule (scheduleGen style) ───────────────────

fn generate_pro_league_schedule(
    team_ids: &[String],
    protagonist_team_id: &str,
    start_week: u32,
    end_week: u32,
    prefix: &str,
    season_year: u32,
) -> Vec<ScheduleEntry> {
    if team_ids.len() < 2 { return vec![]; }
    let rounds = round_robin_pairs(team_ids);
    let total_slots = ((end_week - start_week + 1) * 2) as usize;

    let mut series_slots: Vec<Vec<(String, String)>> = Vec::new();
    for i in 0..total_slots {
        let ridx = i % rounds.len();
        let flipped = (i / rounds.len()) % 2 == 1;
        series_slots.push(
            rounds[ridx].iter().map(|(a, b)| {
                if flipped { (b.clone(), a.clone()) } else { (a.clone(), b.clone()) }
            }).collect()
        );
    }

    let mut entries = Vec::new();
    let mut game_seq = 0u32;

    for week in start_week..=end_week {
        let mut protagonist_started = false;
        for si in 0..2usize {
            let slot_idx = (week - start_week) as usize * 2 + si;
            if slot_idx >= series_slots.len() { break; }
            let pairs = &series_slots[slot_idx];
            let series_label = if si == 0 { "A" } else { "B" };
            let day_base: u32 = if si == 0 { 1 } else { 4 };

            for (home, away) in pairs {
                let is_pair = home == protagonist_team_id || away == protagonist_team_id;
                for g in 1u32..=3 {
                    game_seq += 1;
                    let is_protagonist_game = is_pair && !protagonist_started && g == 1;
                    if is_protagonist_game { protagonist_started = true; }
                    entries.push(ScheduleEntry {
                        id: format!("{}_W{:02}_S{}_G{}_{:04}", prefix, week, series_label, g, game_seq),
                        week,
                        game_date: to_game_date(season_year, week, day_base + g - 1),
                        league_id: None,
                        home_team_id: home.clone(),
                        away_team_id: away.clone(),
                        is_protagonist_game,
                        phase: "season".to_string(),
                    });
                }
            }
        }
    }
    entries
}

// ── Public params + functions ─────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateScheduleParams {
    pub team_ids: Vec<String>,
    pub protagonist_team_id: String,
    pub total_weeks: u32,
    pub season_start: Option<u32>,
    pub season_end: Option<u32>,
    pub postseason_end: Option<u32>,
    pub season_year: Option<u32>,
}

pub fn generate_schedule(p: GenerateScheduleParams) -> Vec<ScheduleEntry> {
    if p.team_ids.len() < 2 { return vec![]; }
    let ss = p.season_start.unwrap_or(5);
    let se = p.season_end.unwrap_or(36);
    let pe = p.postseason_end.unwrap_or(44);
    let sy = p.season_year.unwrap_or(2026);
    let base_rounds = round_robin_pairs(&p.team_ids);
    let mut entries = Vec::new();
    let mut seq = 0u32;

    for week in ss..=p.total_weeks.min(se) {
        let ridx = ((week - ss) as usize) % base_rounds.len();
        let flip = ((week - ss) as usize / base_rounds.len()) % 2 == 1;
        let phase = get_phase(week, ss, se, pe);
        let gdate = to_game_date(sy, week, 5);
        for (a, b) in &base_rounds[ridx] {
            let (home, away) = if flip { (b.clone(), a.clone()) } else { (a.clone(), b.clone()) };
            seq += 1;
            entries.push(ScheduleEntry {
                id: format!("SCH_W{:02}_G{:03}", week, seq),
                week, game_date: gdate.clone(), league_id: None,
                home_team_id: home.clone(), away_team_id: away.clone(),
                is_protagonist_game: home == p.protagonist_team_id || away == p.protagonist_team_id,
                phase: phase.to_string(),
            });
        }
    }
    entries
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateProScheduleParams {
    pub team_ids: Vec<String>,
    pub protagonist_team_id: String,
    pub season_year: Option<u32>,
}

pub fn generate_kbl_schedule(p: GenerateProScheduleParams) -> Vec<ScheduleEntry> {
    generate_pro_league_schedule(&p.team_ids, &p.protagonist_team_id, 7, 27, "KBL", p.season_year.unwrap_or(2026))
}

pub fn generate_abl_schedule(p: GenerateProScheduleParams) -> Vec<ScheduleEntry> {
    generate_pro_league_schedule(&p.team_ids, &p.protagonist_team_id, 7, 27, "ABL", p.season_year.unwrap_or(2026))
}

pub fn generate_jbl_schedule(p: GenerateProScheduleParams) -> Vec<ScheduleEntry> {
    generate_pro_league_schedule(&p.team_ids, &p.protagonist_team_id, 7, 27, "JBL", p.season_year.unwrap_or(2026))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateHsScheduleParams {
    pub group_a: Vec<String>,
    pub group_b: Vec<String>,
    pub protagonist_team_id: String,
    pub season_year: Option<u32>,
}

// ── 고교 조별 주 2경기 일정 생성 (월 offset=1, 금 offset=5) ──

fn generate_hs_group_weekly(
    teams: &[String],
    protagonist_team_id: &str,
    start_week: u32,
    end_week: u32,
    prefix: &str,
    season_year: u32,
) -> Vec<ScheduleEntry> {
    if teams.len() < 2 { return vec![]; }

    let base  = build_round_robin(teams);
    let n_rnd = base.len();   // 7 rounds for 8 teams
    let total_weeks = (end_week - start_week + 1) as usize;
    let mut entries = Vec::new();

    for w in 0..total_weeks {
        let week = start_week + w as u32;

        // 월요일(offset=1), 금요일(offset=5) 두 슬롯
        for (slot, day_off) in [(0usize, 1u32), (1usize, 5u32)] {
            let abs_idx = w * 2 + slot;
            let round_idx = abs_idx % n_rnd;
            let flip      = (abs_idx / n_rnd) % 2 == 1;

            for (gi, (h, a)) in base[round_idx].iter().enumerate() {
                let (home, away) = if flip { (a.clone(), h.clone()) } else { (h.clone(), a.clone()) };
                entries.push(ScheduleEntry {
                    id: format!("{}_W{:02}_S{}_G{}", prefix, week, slot + 1, gi + 1),
                    week,
                    game_date: to_game_date(season_year, week, day_off),
                    league_id: Some("LEAGUE_HIGHSCHOOL".to_string()),
                    home_team_id: home.clone(),
                    away_team_id: away.clone(),
                    is_protagonist_game: home == protagonist_team_id || away == protagonist_team_id,
                    phase: "season".to_string(),
                });
            }
        }
    }
    entries
}

// ── 프리시즌 친선경기 생성 (W4-W9, 월·수 각 1경기) ─────────────
fn generate_hs_preseason_friendlies(
    my_team_id: &str,
    all_teams: &[String],
    season_year: u32,
) -> Vec<ScheduleEntry> {
    let opponents: Vec<&String> = all_teams.iter().filter(|t| t.as_str() != my_team_id).collect();
    if opponents.is_empty() { return vec![]; }

    let mut entries = Vec::new();
    for week in 4u32..=9u32 {
        // 월요일(offset=1)·수요일(offset=3) 2경기
        for (slot, day_off) in [(0usize, 1u32), (1usize, 3u32)] {
            let hash = (my_team_id.len() as u32)
                .wrapping_mul(97)
                .wrapping_add(week.wrapping_mul(31))
                .wrapping_add(slot as u32 * 17) as usize;
            let opp  = opponents[hash % opponents.len()];
            let (home, away) = if hash % 2 == 0 {
                (my_team_id.to_string(), opp.clone())
            } else {
                (opp.clone(), my_team_id.to_string())
            };
            entries.push(ScheduleEntry {
                id: format!("PRESN_W{:02}_S{}", week, slot + 1),
                week,
                game_date: to_game_date(season_year, week, day_off),
                league_id: Some("LEAGUE_HIGHSCHOOL".to_string()),
                home_team_id: home,
                away_team_id: away,
                is_protagonist_game: true,
                phase: "preseason".to_string(),
            });
        }
    }
    entries
}

pub fn generate_hs_schedule(p: GenerateHsScheduleParams) -> Vec<ScheduleEntry> {
    let sy = p.season_year.unwrap_or(2026);
    let all_teams: Vec<String> = p.group_a.iter().chain(p.group_b.iter()).cloned().collect();

    let mut out = generate_hs_group_weekly(&p.group_a, &p.protagonist_team_id, 10, 42, "HS_A", sy);
    out.extend(generate_hs_group_weekly(&p.group_b, &p.protagonist_team_id, 10, 42, "HS_B", sy));
    out.extend(generate_hs_preseason_friendlies(&p.protagonist_team_id, &all_teams, sy));
    out
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLeagueScheduleParams {
    pub league_id: String,
    pub teams: Vec<String>,
    pub start_week: u32,
    pub end_week: u32,
    pub cycles: u32,
    pub protagonist_team_id: String,
    pub season_year: Option<u32>,
    pub series_games: Option<u32>,
}

pub fn generate_league_schedule(p: GenerateLeagueScheduleParams) -> Vec<ScheduleEntry> {
    let sy = p.season_year.unwrap_or(2026);
    let games = p.series_games.unwrap_or(1);

    // 2연전 모드: generate_pro_league_schedule 방식과 동일하되 시리즈당 2경기
    if games >= 2 {
        if p.teams.len() < 2 { return vec![]; }
        let rounds = round_robin_pairs(&p.teams);
        let total_slots = ((p.end_week - p.start_week + 1) * 2) as usize;
        let prefix = p.league_id.replace("LEAGUE_", "");
        let mut entries = Vec::new();
        let mut game_seq = 0u32;

        for week in p.start_week..=p.end_week {
            let mut protagonist_started = false;
            for si in 0..2usize {
                let slot_idx = (week - p.start_week) as usize * 2 + si;
                if slot_idx >= total_slots { break; }
                let ridx   = slot_idx % rounds.len();
                let flipped = (slot_idx / rounds.len()) % 2 == 1;
                let series_label = if si == 0 { "A" } else { "B" };
                let day_base: u32 = if si == 0 { 1 } else { 4 }; // A: 월+화, B: 목+금

                for (h, a) in &rounds[ridx] {
                    let (home, away) = if flipped { (a.clone(), h.clone()) } else { (h.clone(), a.clone()) };
                    let is_pair = home == p.protagonist_team_id || away == p.protagonist_team_id;
                    for g in 1u32..=games {
                        game_seq += 1;
                        let is_protagonist_game = is_pair && !protagonist_started && g == 1;
                        if is_protagonist_game { protagonist_started = true; }
                        entries.push(ScheduleEntry {
                            id: format!("{}_W{:02}_S{}_G{}_{:04}", prefix, week, series_label, g, game_seq),
                            week,
                            game_date: to_game_date(sy, week, day_base + g - 1),
                            league_id: Some(p.league_id.clone()),
                            home_team_id: home.clone(),
                            away_team_id: away.clone(),
                            is_protagonist_game,
                            phase: "season".to_string(),
                        });
                    }
                }
            }
        }
        return entries;
    }

    // 기존 1경기 모드 (하위호환)
    let base = build_round_robin(&p.teams);
    let mut all_rounds: Vec<Vec<(String, String)>> = Vec::new();
    for c in 0..p.cycles as usize {
        if c % 2 == 0 {
            all_rounds.extend(base.clone());
        } else {
            all_rounds.extend(base.iter().map(|r| r.iter().map(|(h, a)| (a.clone(), h.clone())).collect::<Vec<_>>()));
        }
    }
    let prefix = p.league_id.replace("LEAGUE_", "");
    assign_rounds_to_weeks(&all_rounds, p.start_week, p.end_week, &p.league_id, &prefix, &p.protagonist_team_id, sy)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueConfigInput {
    pub league_id: String,
    pub teams: Vec<String>,
    pub start_week: u32,
    pub end_week: u32,
    pub cycles: u32,
    pub group_a: Option<Vec<String>>,
    pub group_b: Option<Vec<String>>,
    pub series_games: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateAllLeagueSchedulesParams {
    pub configs: Vec<LeagueConfigInput>,
    pub protagonist_team_id: String,
    pub season_year: Option<u32>,
}

pub fn generate_all_league_schedules(p: GenerateAllLeagueSchedulesParams) -> HashMap<String, Vec<ScheduleEntry>> {
    let sy = p.season_year.unwrap_or(2026);
    let mut result = HashMap::new();
    for cfg in p.configs {
        let entries = if let (Some(ga), Some(gb)) = (cfg.group_a, cfg.group_b) {
            generate_hs_schedule(GenerateHsScheduleParams { group_a: ga, group_b: gb, protagonist_team_id: p.protagonist_team_id.clone(), season_year: Some(sy) })
        } else {
            generate_league_schedule(GenerateLeagueScheduleParams { league_id: cfg.league_id.clone(), teams: cfg.teams, start_week: cfg.start_week, end_week: cfg.end_week, cycles: cfg.cycles, protagonist_team_id: p.protagonist_team_id.clone(), season_year: Some(sy), series_games: cfg.series_games })
        };
        result.insert(cfg.league_id, entries);
    }
    result
}

// ── HS Postseason ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateHsPostseasonSemisParams {
    pub top4: Vec<String>,
    pub protagonist_team_id: String,
    pub week: u32,
    pub season_year: Option<u32>,
}

pub fn generate_hs_postseason_semis(p: GenerateHsPostseasonSemisParams) -> Vec<ScheduleEntry> {
    if p.top4.len() < 4 { return vec![]; }
    let sy = p.season_year.unwrap_or(2026);
    let gdate = to_game_date(sy, p.week, 5);
    let pt = &p.protagonist_team_id;
    vec![
        ScheduleEntry { id: format!("PS_SEMI1_W{:02}", p.week), week: p.week, game_date: gdate.clone(), league_id: None, home_team_id: p.top4[0].clone(), away_team_id: p.top4[3].clone(), is_protagonist_game: p.top4[0] == *pt || p.top4[3] == *pt, phase: "postseason".to_string() },
        ScheduleEntry { id: format!("PS_SEMI2_W{:02}", p.week), week: p.week, game_date: gdate, league_id: None, home_team_id: p.top4[1].clone(), away_team_id: p.top4[2].clone(), is_protagonist_game: p.top4[1] == *pt || p.top4[2] == *pt, phase: "postseason".to_string() },
    ]
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateHsPostseasonFinalParams {
    pub winner_a: String,
    pub winner_b: String,
    pub protagonist_team_id: String,
    pub week: u32,
    pub season_year: Option<u32>,
}

pub fn generate_hs_postseason_final(p: GenerateHsPostseasonFinalParams) -> ScheduleEntry {
    let sy = p.season_year.unwrap_or(2026);
    ScheduleEntry {
        id: format!("PS_FINAL_W{:02}", p.week),
        week: p.week,
        game_date: to_game_date(sy, p.week, 5),
        league_id: None,
        home_team_id: p.winner_a.clone(),
        away_team_id: p.winner_b.clone(),
        is_protagonist_game: p.winner_a == p.protagonist_team_id || p.winner_b == p.protagonist_team_id,
        phase: "postseason".to_string(),
    }
}

// ── Shuffle ───────────────────────────────────────────────────

const HS_ALL_TEAMS: &[&str] = &[
    "TEAM_HS_SEOUL_INNOVATION", "TEAM_HS_BUSAN_WAVE", "TEAM_HS_DAEGU_HEAT",
    "TEAM_HS_GWANGJU_VISION", "TEAM_HS_DAEJEON_RISE", "TEAM_HS_INCHEON_HARBOR",
    "TEAM_HS_ULSAN_CHARGE", "TEAM_HS_SUWON_EDGE", "TEAM_HS_YEOSU_SHORE",
    "TEAM_HS_CHUNCHEON_HIGHLAND", "TEAM_HS_JEJU_WIND", "TEAM_HS_GANGWON_PEAK",
    "TEAM_HS_MASAN_HARBOR", "TEAM_HS_JECHEON_RIDGE", "TEAM_HS_GOYANG_ARROW",
    "TEAM_HS_SUNCHEON_BAY",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HsGroups {
    pub group_a: Vec<String>,
    pub group_b: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShuffleHsGroupsParams {
    pub all_teams: Option<Vec<String>>,
}

pub fn shuffle_hs_groups(p: ShuffleHsGroupsParams) -> HsGroups {
    let mut arr: Vec<String> = p.all_teams.unwrap_or_else(|| HS_ALL_TEAMS.iter().map(|s| s.to_string()).collect());
    let mut rng = rand::thread_rng();
    for i in (1..arr.len()).rev() {
        let j = rng.gen_range(0..=i);
        arr.swap(i, j);
    }
    let half = arr.len() / 2;
    HsGroups { group_a: arr[..half].to_vec(), group_b: arr[half..].to_vec() }
}
