// 경력 이력 생성 (Phase 6.5 R-4)
//
// 새 게임 시점에 프로 선수들의 **과거**를 만든다. 예전엔 전원이 현 소속팀에서만
// 뛴 것처럼 보였다 — 12년차 베테랑도 이적 한 번 없는 세계였다.
//
// 여기서 만든 기록은 slot.db `transactions` 테이블로 들어가고, 리그 화면의
// "리그 기록" 탭이 그대로 보여준다. Phase 7-1의 드래프트와 7-4의 FA가 같은
// 테이블에 쓰므로 **과거와 미래가 한 줄로 이어진다.**
//
// worldSeed + npcId 결정적 — 같은 세계를 다시 열면 같은 이력이 나온다.

use serde::{Deserialize, Serialize};

use crate::npc_sim::LcgRand;

fn hash_str(s: &str) -> u32 {
    s.bytes().fold(0u32, |acc, b| acc.wrapping_mul(131).wrapping_add(b as u32))
}

// ── 규칙 (generation_rules.json careerHistoryRules) ──────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasonWeights {
    pub fa: f64,
    pub trade: f64,
    pub release: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundWeight {
    pub round: i32,
    pub weight: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryRules {
    pub hs_age: i32,
    pub univ_age: i32,
    pub round_weights: Vec<RoundWeight>,
    pub undrafted_pct: f64,
    /// 입단 경로 비율. **로스터 생성이 이걸 보고 연차를 역산한다** —
    /// 연차를 무작위로 뽑으면 입단 나이가 중간값에 몰려 출신 분포가 뒤집힌다
    /// (실제로 대졸 57% / 고졸 28%가 나왔다)
    #[serde(default)]
    pub route_weights: Option<RouteWeights>,
    #[serde(default)]
    pub indie_age_min: Option<i32>,
    #[serde(default)]
    pub indie_age_max: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteWeights {
    pub hs: f64,
    pub univ: f64,
    pub indie: f64,
}

/// 입단 나이를 경로 비율대로 뽑는다. 로스터 생성이 연차를 역산하는 데 쓴다.
///
/// `rng`는 선수별 스트림이어야 한다 — 공유하면 앞사람이 뒤를 흔든다.
pub fn pick_entry_age(entry: &EntryRules, rng: &mut LcgRand) -> i32 {
    let Some(w) = &entry.route_weights else { return entry.hs_age };
    let total = w.hs + w.univ + w.indie;
    if total <= 0.0 { return entry.hs_age; }
    let mut t = rng.next() * total;
    t -= w.hs;
    if t <= 0.0 { return entry.hs_age; }
    t -= w.univ;
    if t <= 0.0 { return entry.univ_age; }
    let lo = entry.indie_age_min.unwrap_or(entry.univ_age + 1);
    let hi = entry.indie_age_max.unwrap_or(lo + 2);
    lo + (rng.next() * ((hi - lo).max(0) + 1) as f64) as i32
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CareerHistoryRules {
    pub move_per_year: f64,
    pub fa_eligible_years: i32,
    /// FA 재취득 주기. 이게 없으면 FA 이적이 연속으로 나온다 (2027→2028 같은)
    #[serde(default = "default_fa_interval")]
    pub fa_interval_years: i32,
    pub reason_weights: ReasonWeights,
    pub entry: EntryRules,
}

fn default_fa_interval() -> i32 { 4 }

// ── 입출력 ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPlayer {
    pub npc_id: String,
    pub name: String,
    pub age: i32,
    pub pro_service_years: i32,
    pub current_team: String,
    pub current_league: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCareerHistoryParams {
    pub world_seed: f64,
    /// 새 게임의 시즌. 과거 연도를 여기서 역산한다
    pub season_year: i32,
    pub rules: CareerHistoryRules,
    pub players: Vec<HistoryPlayer>,
    /// 같은 리그의 팀 목록 — 과거 소속팀은 여기서만 고른다.
    /// 실재하지 않는 팀을 만들면 화면이 이름을 못 찾는다
    pub league_teams: Vec<String>,
}

/// slot.db `transactions` 한 행과 1:1
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEvent {
    pub npc_id: String,
    pub npc_name: String,
    pub season_year: i32,
    /// draft | fa | trade | release
    pub category: String,
    pub from_team_id: Option<String>,
    pub to_team_id: String,
    pub league_id: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCareerHistoryResult {
    pub events: Vec<HistoryEvent>,
    /// 원클럽맨 수 (실측 확인용)
    pub one_club: usize,
}

// ── 생성 ─────────────────────────────────────────────────────────────────────

fn pick_round(rules: &EntryRules, rng: &mut LcgRand) -> Option<i32> {
    if rng.next() * 100.0 < rules.undrafted_pct { return None; }
    let total: f64 = rules.round_weights.iter().map(|r| r.weight).sum();
    if total <= 0.0 { return Some(1); }
    let mut t = rng.next() * total;
    for r in &rules.round_weights {
        t -= r.weight;
        if t <= 0.0 { return Some(r.round); }
    }
    rules.round_weights.last().map(|r| r.round)
}

/// 입단 경로 — 입단 나이로 역산한다.
///
/// 나이 − 연차 = 입단 나이. 20이면 고졸, 24면 대졸, 그 사이/이후는 독립·육성이다.
/// 이 매핑이 R-1의 나이 체계에 의존한다 — 고3 19세 졸업 → 다음해 20세 입단.
fn entry_route(entry_age: i32, rules: &EntryRules) -> &'static str {
    if entry_age <= rules.hs_age { "고졸" }
    else if entry_age <= rules.univ_age { "대졸" }
    else { "독립" }
}

pub fn generate_career_history(p: GenerateCareerHistoryParams) -> GenerateCareerHistoryResult {
    let mut events: Vec<HistoryEvent> = Vec::new();
    let mut one_club = 0usize;
    let seed_base = (p.world_seed as u32) ^ 0x9E37_79B9;

    for pl in &p.players {
        // 선수마다 독립 스트림 — 앞사람 이력 길이가 뒷사람을 흔들지 않게 (_ledger P6-4)
        let mut rng = LcgRand::new(seed_base ^ hash_str(&pl.npc_id));

        let svc = pl.pro_service_years.max(0);
        let entry_year = p.season_year - svc;
        let entry_age = pl.age - svc;

        // ── 이적 시점을 먼저 뽑는다 ─────────────────────────────
        // 연차마다 독립 시행. 같은 해에 두 번 옮기지는 않는다
        let mut move_years: Vec<i32> = Vec::new();
        for y in 1..=svc {
            if rng.next() < p.rules.move_per_year { move_years.push(entry_year + y); }
        }

        // ── 소속팀 사슬을 거꾸로 만든다 ─────────────────────────
        // **현재 팀에서 출발해 과거로 거슬러 올라간다.** 앞에서부터 만들면
        // 마지막 팀이 현재 팀과 안 맞아 "지금 없는 팀에 소속" 상태가 된다.
        let mut chain: Vec<String> = vec![pl.current_team.clone()];
        let others: Vec<&String> = p.league_teams.iter()
            .filter(|t| *t != &pl.current_team).collect();
        for _ in 0..move_years.len() {
            if others.is_empty() { break; }
            let prev = others[(rng.next() * others.len() as f64) as usize % others.len()].clone();
            // 바로 직전 팀과 같은 팀으로 돌아가는 건 어색하다
            if chain.last() == Some(&prev) { continue; }
            chain.push(prev);
        }
        chain.reverse();   // 과거 → 현재 순

        if move_years.is_empty() { one_club += 1; }

        // ── 입단 기록 ───────────────────────────────────────────
        let route = entry_route(entry_age, &p.rules.entry);
        let round = pick_round(&p.rules.entry, &mut rng);
        let detail = match round {
            Some(r) => format!("{r}라운드 지명 ({route})"),
            None    => format!("육성선수 입단 ({route})"),
        };
        events.push(HistoryEvent {
            npc_id: pl.npc_id.clone(),
            npc_name: pl.name.clone(),
            season_year: entry_year,
            category: "draft".into(),
            from_team_id: None,
            to_team_id: chain[0].clone(),
            league_id: pl.current_league.clone(),
            detail,
        });

        // ── 이적 기록 ───────────────────────────────────────────
        // 직전 FA 연도 — 재취득 주기 안에는 다시 FA로 옮기지 못한다
        let mut last_fa: Option<i32> = None;
        for (i, year) in move_years.iter().enumerate() {
            let from = chain.get(i).cloned().unwrap_or_else(|| pl.current_team.clone());
            let to   = chain.get(i + 1).cloned().unwrap_or_else(|| pl.current_team.clone());
            if from == to { continue; }

            let years_in = year - entry_year;
            let w = &p.rules.reason_weights;
            // FA는 자격 연차 전엔 안 나온다 — 그 몫을 트레이드가 가져간다
            let fa_ok = years_in >= p.rules.fa_eligible_years
                && last_fa.map_or(true, |ly| year - ly >= p.rules.fa_interval_years);
            let (fa_w, trade_w, rel_w) = if fa_ok {
                (w.fa, w.trade, w.release)
            } else {
                (0.0, w.trade + w.fa, w.release)
            };
            let total = fa_w + trade_w + rel_w;
            let roll = rng.next() * total;
            let (category, label) = if roll < fa_w { last_fa = Some(*year); ("fa", "FA 이적") }
                else if roll < fa_w + trade_w { ("trade", "트레이드") }
                else { ("release", "방출 후 영입") };

            events.push(HistoryEvent {
                npc_id: pl.npc_id.clone(),
                npc_name: pl.name.clone(),
                season_year: *year,
                category: category.into(),
                from_team_id: Some(from),
                to_team_id: to,
                league_id: pl.current_league.clone(),
                detail: label.into(),
            });
        }
    }

    events.sort_by(|a, b| a.season_year.cmp(&b.season_year).then(a.npc_id.cmp(&b.npc_id)));
    GenerateCareerHistoryResult { events, one_club }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> CareerHistoryRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        serde_json::from_value(v["careerHistoryRules"].clone())
            .expect("careerHistoryRules 파싱 실패")
    }

    fn players(n: usize, svc: i32, age: i32) -> Vec<HistoryPlayer> {
        (0..n).map(|i| HistoryPlayer {
            npc_id: format!("PLY_{i:04}"),
            name: format!("선수{i}"),
            age, pro_service_years: svc,
            current_team: "TEAM_KBL_A".into(),
            current_league: "LEAGUE_KBL".into(),
        }).collect()
    }

    fn teams() -> Vec<String> {
        (0..10).map(|i| format!("TEAM_KBL_{}", (b'A' + i) as char)).collect()
    }

    fn run(pl: Vec<HistoryPlayer>) -> GenerateCareerHistoryResult {
        generate_career_history(GenerateCareerHistoryParams {
            world_seed: 4242.0, season_year: 2029, rules: rules(),
            players: pl, league_teams: teams(),
        })
    }

    /// 모든 선수에게 입단 기록이 하나 있다 — 원클럽맨도 이력이 비지 않는다
    #[test]
    fn 전원이_입단_기록을_갖는다() {
        let out = run(players(100, 5, 25));
        for i in 0..100 {
            let id = format!("PLY_{i:04}");
            let entries: Vec<_> = out.events.iter()
                .filter(|e| e.npc_id == id && e.category == "draft").collect();
            assert_eq!(entries.len(), 1, "{id} 입단 기록이 {}개", entries.len());
        }
    }

    /// **현재 팀이 사슬의 끝이어야 한다.** 앞에서부터 만들면 마지막 팀이
    /// 현재 팀과 안 맞아 "지금 없는 팀에 소속"이 된다
    #[test]
    fn 마지막_이적지가_현재_팀이다() {
        let out = run(players(200, 12, 33));
        for i in 0..200 {
            let id = format!("PLY_{i:04}");
            let mut mine: Vec<_> = out.events.iter().filter(|e| e.npc_id == id).collect();
            mine.sort_by_key(|e| e.season_year);
            let last = mine.last().unwrap();
            assert_eq!(last.to_team_id, "TEAM_KBL_A",
                "{id}의 마지막 소속이 {} — 현재 팀과 다르다", last.to_team_id);
        }
    }

    /// 과거 팀이 실재해야 한다 — 없는 팀이면 화면이 이름을 못 찾는다
    #[test]
    fn 과거_팀이_전부_실재한다() {
        let out = run(players(200, 12, 33));
        let valid = teams();
        for e in &out.events {
            assert!(valid.contains(&e.to_team_id), "실재하지 않는 팀: {}", e.to_team_id);
            if let Some(f) = &e.from_team_id {
                assert!(valid.contains(f), "실재하지 않는 팀: {f}");
            }
        }
    }

    /// FA는 자격 연차 전에 나오지 않는다
    #[test]
    fn fa는_자격_연차_이후에만_나온다() {
        let r = rules();
        let out = run(players(300, 15, 36));
        for e in out.events.iter().filter(|e| e.category == "fa") {
            let entry = out.events.iter()
                .find(|x| x.npc_id == e.npc_id && x.category == "draft").unwrap();
            let years_in = e.season_year - entry.season_year;
            assert!(years_in >= r.fa_eligible_years,
                "{}년차에 FA — 자격은 {}년차부터다", years_in, r.fa_eligible_years);
        }
    }

    /// 사용자 확정 "중간" — 12년차 원클럽맨이 대략 3분의 1
    #[test]
    fn 원클럽맨_비율이_설계대로다() {
        let out = run(players(400, 12, 33));
        let pct = out.one_club as f64 / 400.0 * 100.0;
        assert!((22.0..=45.0).contains(&pct),
            "12년차 원클럽맨 {pct:.0}% — 설계(약 32%)에서 벗어났다");
    }

    /// 신인은 이적 이력이 없다 (연차 0이면 이적할 시간이 없었다)
    #[test]
    fn 신인은_이적_이력이_없다() {
        let out = run(players(50, 0, 21));
        assert_eq!(out.one_club, 50);
        assert!(out.events.iter().all(|e| e.category == "draft"));
    }

    /// FA는 재취득 주기 안에 두 번 나오지 않는다.
    /// 예전엔 2027 → 2028 처럼 연속으로 나왔다.
    #[test]
    fn fa가_연속으로_나오지_않는다() {
        let r = rules();
        let out = run(players(400, 17, 38));
        let mut by: std::collections::HashMap<&str, Vec<i32>> = std::collections::HashMap::new();
        for e in out.events.iter().filter(|e| e.category == "fa") {
            by.entry(&e.npc_id).or_default().push(e.season_year);
        }
        for (id, mut years) in by {
            years.sort_unstable();
            for w in years.windows(2) {
                assert!(w[1] - w[0] >= r.fa_interval_years,
                    "{id}: FA {} → {} (간격 {} < 주기 {})", w[0], w[1], w[1] - w[0], r.fa_interval_years);
            }
        }
    }

    /// 입단 경로 비율이 설계대로다 — **고졸이 가장 많아야 한다**.
    ///
    /// 연차를 균등하게 뽑던 시절엔 입단 나이가 중간값에 몰려
    /// 대졸 57% / 고졸 28%로 **뒤집혀 있었다**(KBO는 반대다).
    /// 지금은 로스터 생성이 이 비율로 경로를 뽑고 연차를 역산한다.
    #[test]
    fn 입단_경로_비율이_설계대로다() {
        let r = rules();
        let Some(w) = r.entry.route_weights.clone() else { return };
        let total = w.hs + w.univ + w.indie;

        // 경로를 직접 뽑아 분포를 본다 (로스터 생성이 쓰는 그 함수다)
        let mut cnt = [0usize; 3];
        for i in 0..3000 {
            let mut rng = LcgRand::new(0x5EED ^ hash_str(&format!("P{i}")));
            let a = pick_entry_age(&r.entry, &mut rng);
            if a <= r.entry.hs_age { cnt[0] += 1; }
            else if a <= r.entry.univ_age { cnt[1] += 1; }
            else { cnt[2] += 1; }
        }
        let pct = |n: usize| n as f64 / 3000.0 * 100.0;
        let want = |x: f64| x / total * 100.0;
        assert!((pct(cnt[0]) - want(w.hs)).abs() < 6.0,
            "고졸 {:.0}% (목표 {:.0}%)", pct(cnt[0]), want(w.hs));
        assert!(cnt[0] > cnt[1], "고졸({})이 대졸({})보다 적다 — 분포가 뒤집혔다", cnt[0], cnt[1]);
        assert!((pct(cnt[2]) - want(w.indie)).abs() < 6.0,
            "독립 {:.0}% (목표 {:.0}%)", pct(cnt[2]), want(w.indie));
    }

    /// 결정적 — 같은 시드면 같은 이력
    #[test]
    fn 같은_시드는_같은_이력을_만든다() {
        let a = run(players(50, 10, 31));
        let b = run(players(50, 10, 31));
        assert_eq!(a.events.len(), b.events.len());
        for (x, y) in a.events.iter().zip(b.events.iter()) {
            assert_eq!(x.season_year, y.season_year);
            assert_eq!(x.category, y.category);
            assert_eq!(x.to_team_id, y.to_team_id);
        }
    }

    /// 입단 경로가 나이로 갈린다 (R-1 나이 체계에 의존)
    #[test]
    fn 입단_경로가_나이로_갈린다() {
        // 25세 5년차 → 20세 입단 = 고졸
        let hs = run(players(20, 5, 25));
        assert!(hs.events.iter().filter(|e| e.category == "draft")
            .all(|e| e.detail.contains("고졸")), "20세 입단이 고졸이 아니다");
        // 29세 5년차 → 24세 입단 = 대졸
        let uv = run(players(20, 5, 29));
        assert!(uv.events.iter().filter(|e| e.category == "draft")
            .all(|e| e.detail.contains("대졸")), "24세 입단이 대졸이 아니다");
    }
}
