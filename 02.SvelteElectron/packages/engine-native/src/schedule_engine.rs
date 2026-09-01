use serde::{Deserialize, Serialize};
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
    /// 전국대회 경기 — 리그 순위에는 반영하지 않는다 (개인 기록은 반영)
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub is_tournament: bool,
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
                is_tournament: false,
            });
        }
    }
    entries
}

// ── Pro-league schedule (scheduleGen style) ───────────────────

/// 프로 정규 일정 — **주당 2 시리즈 × 3연전**.
///
/// 팀당 경기 수 = (주 수) × 2 슬롯 × 3경기. W5~28(24주)이면 **144**로
/// DESIGN.md §7·KBO 와 맞는다. W7~27(21주)이면 126이다.
///
/// ⚠ **상대별로는 균등하지 않다.** 10팀 라운드로빈이 9라운드인데 슬롯이
///   48개라 5.33 바퀴다 — 세 팀은 18경기, 여섯 팀은 15경기가 된다
///   (15×6 + 18×3 = 144). 3연전 단위로는 상대별 16경기가 안 나온다.
///   정본이 요구하는 건 **팀당 총 144경기**이지 상대별 균등이 아니다.
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
                        is_tournament: false,
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
                is_tournament: false,
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
    /// 정규 시즌 기간. **TS `PRO_START_WEEK`/`PRO_END_WEEK` 가 정본이다.**
    ///
    /// 🔴 예전엔 여기 `7, 27` 이 박혀 있었다. 배경 리그는 TS 쪽 `W5~28` 로
    ///   돌아서 **같은 리그가 주인공 유무로 경기 수가 달라졌다** —
    ///   주인공이 있으면 팀당 126, 없으면 144.
    ///   숫자가 두 곳에 적히면 한쪽만 고쳐진 채 남는다.
    ///
    /// ⚠ `Option` 이다. `serde(default)` 로 0 이 조용히 들어오면 주차 계산이
    ///   통째로 어긋난다 — 안 넘기면 옛 값(7, 27)으로 떨어진다.
    pub start_week: Option<u32>,
    pub end_week: Option<u32>,
}

impl GenerateProScheduleParams {
    fn weeks(&self) -> (u32, u32) {
        (self.start_week.unwrap_or(7), self.end_week.unwrap_or(27))
    }
}

pub fn generate_kbl_schedule(p: GenerateProScheduleParams) -> Vec<ScheduleEntry> {
    let (sw, ew) = p.weeks();
    generate_pro_league_schedule(&p.team_ids, &p.protagonist_team_id, sw, ew, "KBL", p.season_year.unwrap_or(2026))
}

pub fn generate_abl_schedule(p: GenerateProScheduleParams) -> Vec<ScheduleEntry> {
    let (sw, ew) = p.weeks();
    generate_pro_league_schedule(&p.team_ids, &p.protagonist_team_id, sw, ew, "ABL", p.season_year.unwrap_or(2026))
}

pub fn generate_jbl_schedule(p: GenerateProScheduleParams) -> Vec<ScheduleEntry> {
    let (sw, ew) = p.weeks();
    generate_pro_league_schedule(&p.team_ids, &p.protagonist_team_id, sw, ew, "JBL", p.season_year.unwrap_or(2026))
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
                            is_tournament: false,
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

// ── 권역 주말리그 (Phase 5-3) ─────────────────────────────────
//
// v1은 리그 하나에 `cycles`(바퀴 수)를 줬다. 그러면 권역 크기가 6~20팀으로
// 갈리는 고교에서 팀당 경기 수가 5~19로 들쭉날쭉해진다.
//
// v2는 **목표 경기 수**를 준다. 바퀴 수는 거기서 역산한다:
//   laps = ceil(target / (n-1))  →  라운드를 정확히 target개로 잘라낸다
//   라운드 1개 = 전 팀이 1경기씩 → 결국 팀마다 정확히 target경기
//
// 팀이 적은 권역은 바퀴가 늘어(같은 팀을 여러 번 만나) 경기 수가 맞춰진다 —
// 기획서 02_고교.md §4-1 "팀 적은 권역은 바퀴↑ → 경기 균등"을 그대로 구현.

/// 라운드로빈을 목표 경기 수만큼 생성한다. 홀수 바퀴는 홈/원정을 뒤집는다.
pub fn build_rounds_targeted(teams: &[String], target_games: u32) -> Vec<Vec<(String, String)>> {
    if teams.len() < 2 || target_games == 0 {
        return vec![];
    }
    let base = build_round_robin(teams);
    if base.is_empty() {
        return vec![];
    }
    let mut all: Vec<Vec<(String, String)>> = Vec::new();
    let mut lap = 0usize;
    while all.len() < target_games as usize {
        if lap % 2 == 0 {
            all.extend(base.clone());
        } else {
            all.extend(
                base.iter()
                    .map(|r| r.iter().map(|(h, a)| (a.clone(), h.clone())).collect::<Vec<_>>()),
            );
        }
        lap += 1;
    }
    all.truncate(target_games as usize);
    all
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionInput {
    pub region_id: String,
    pub teams: Vec<String>,
    /// 이 권역/조가 쓰는 요일 (0=월 … 5=토, 6=일). 비우면 상위 기본값.
    ///
    /// 대학은 조마다 요일이 다르다 — A·B조 화수목금, C·D조 목·금,
    /// E조 4월 목금/5월 화수 (03_대학.md §4-1). 5-8의 의무 휴식표가
    /// 일 단위라 요일이 등판 간격에 실제로 영향을 준다.
    #[serde(default)]
    pub day_offsets: Vec<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRegionalScheduleParams {
    pub league_id: String,
    pub regions: Vec<RegionInput>,
    /// 팀당 목표 경기 수 (권역 크기와 무관하게 균등)
    pub target_games: u32,
    pub start_week: u32,
    pub end_week: u32,
    pub protagonist_team_id: String,
    pub season_year: Option<u32>,
    /// 권역이 요일을 지정하지 않았을 때 쓸 기본 요일. 비우면 주말(토·일).
    #[serde(default)]
    pub default_day_offsets: Vec<u32>,
    /// 경기 ID 접두사. 비우면 "HSW" (고교 주말리그).
    #[serde(default)]
    pub id_prefix: Option<String>,
}

/// 권역/조별 리그. 권역마다 독립적으로 라운드로빈을 돌리고 지정 요일에 배치한다.
pub fn generate_regional_schedule(p: GenerateRegionalScheduleParams) -> Vec<ScheduleEntry> {
    let sy = p.season_year.unwrap_or(2026);
    let mut entries = Vec::new();
    if p.end_week < p.start_week {
        return entries;
    }
    let span = (p.end_week - p.start_week + 1) as f64;

    let default_days: Vec<u32> = if p.default_day_offsets.is_empty() {
        vec![6, 7] // 토·일
    } else {
        p.default_day_offsets.clone()
    };
    let prefix = p.id_prefix.clone().unwrap_or_else(|| "HSW".to_string());

    // 권역을 정렬해 결정적으로 만든다 (입력 순서에 의존하지 않음)
    let mut regions: Vec<&RegionInput> = p.regions.iter().collect();
    regions.sort_by(|a, b| a.region_id.cmp(&b.region_id));

    for (ri, region) in regions.iter().enumerate() {
        let rounds = build_rounds_targeted(&region.teams, p.target_games);
        if rounds.is_empty() {
            continue;
        }
        let days: &[u32] = if region.day_offsets.is_empty() { &default_days } else { &region.day_offsets };
        let step = span / rounds.len() as f64;
        // 권역마다 시작 주를 어긋나게 — 전 권역이 같은 주에 몰리면 그 주만 부하가 튄다
        let week_offset = (ri % 3) as u32;
        let tag = region.region_id.replace("STADIUM_", "");

        for (idx, round) in rounds.iter().enumerate() {
            let week = (p.start_week + week_offset + (idx as f64 * step).round() as u32)
                .min(p.end_week);
            for (gi, (home, away)) in round.iter().enumerate() {
                // 한 라운드의 경기를 그 권역의 요일들에 돌아가며 배치
                let day_offset = days[gi % days.len()];
                entries.push(ScheduleEntry {
                    id: format!("{}_{}_R{:02}_G{}", prefix, tag, idx + 1, gi + 1),
                    week,
                    game_date: to_game_date(sy, week, day_offset),
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
    }
    entries
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueConfigInput {
    pub league_id: String,
    pub teams: Vec<String>,
    pub start_week: u32,
    pub end_week: u32,
    pub cycles: u32,
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
        let entries = generate_league_schedule(GenerateLeagueScheduleParams { league_id: cfg.league_id.clone(), teams: cfg.teams, start_week: cfg.start_week, end_week: cfg.end_week, cycles: cfg.cycles, protagonist_team_id: p.protagonist_team_id.clone(), season_year: Some(sy), series_games: cfg.series_games });
        result.insert(cfg.league_id, entries);
    }
    result
}

