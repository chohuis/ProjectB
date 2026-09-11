//! 대학 비경기성 이벤트 (Phase 7-7) — 쇼케이스 · 올스타전
//!
//! 설계 근거는 `docs/design/_ledger.md` §A-9.
//!
//! 두 이벤트가 하는 일이 다르다:
//!   **쇼케이스**는 주목도 급등 경로 — 참가 자체가 스탯을 공개하고 평가를 바꾼다
//!   **올스타전**은 선발되는 것 자체가 서사 — 뽑히면 그것으로 이미 사건이다
//!
//! 그래서 선발 규칙도 다르다. 쇼케이스는 **넓게**(팀 추천 + 주목도 + 구단 지명),
//! 올스타는 **좁게 그러나 고르게**(포지션별 + 대학당 캡).
//!
//! 수치 정본은 `generation_rules.json`의 `campusEvents`다.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── 규칙 ──────────────────────────────────────────────────────

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowcaseRules {
    pub week: i32,
    /// 팀마다 무조건 이만큼 추천한다 — 약팀도 무대에 선다
    pub per_team_recommend: i32,
    /// 그 위에 주목도 상위 몇 명을 더 부른다
    pub top_scout_extra: i32,
    /// 구단 지명(와일드카드)
    pub club_picks: i32,
    /// 참가만 해도 오르는 주목도
    pub attend_scout_gain: f64,
    /// Day2 전시경기 성과 상위권 추가 보너스
    pub standout_scout_gain: f64,
    pub standout_percent: f64,
    pub attend_fame_gain: f64,
}

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllStarRules {
    pub week: i32,
    /// 팀당 인원 (북/남 각각)
    pub squad_size: i32,
    /// **대학당 최대 인원.** 이게 없으면 명문 한 곳이 라인업을 통째로 채운다
    pub per_school_cap: i32,
    /// 반드시 채우는 포지션 (나머지는 점수순)
    pub required_positions: Vec<String>,
    pub select_fame_gain: f64,
    pub select_popularity_gain: f64,
    /// MVP 추가 보너스
    pub mvp_fame_gain: f64,
}

/// ⚠ **검사가 만든다** — `generation_rules.json` 의 `campusEvents` 를 통째로
///   이 꼴로 읽어 「규칙 파일이 지금도 이 모양인가」를 못박는다(검사 여덟).
///   실행 코드는 `ShowcaseRules`·`AllStarRules` 를 따로 받으므로 `cargo build`
///   는 「안 만든다」고 말한다 — **그 말이 틀렸다.**
#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampusEventRules {
    pub showcase: ShowcaseRules,
    pub allstar: AllStarRules,
}

// ── 후보 ──────────────────────────────────────────────────────

#[allow(dead_code)] // payload 미러 — lib.rs 머리말 「안 읽는 칸」 참고
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampusCandidate {
    pub npc_id: String,
    pub name: String,
    pub team_id: String,
    /// 남/북을 가르는 축. refs의 `city`에서 TS가 판정해 넘긴다
    #[serde(default)]
    pub region: String,
    pub position: String,
    pub ovr: f64,
    pub age: i32,
    #[serde(default)]
    pub grade: i32,
    /// 주목도 (0~100)
    #[serde(default)]
    pub scout_score: f64,
    #[serde(default)]
    pub popularity: f64,
    /// 이번 시즌 폼. 승강·국가대표와 **같은 축**이다
    #[serde(default)]
    pub form: f64,
    #[serde(default)]
    pub is_protagonist: bool,
}

fn rating(c: &CampusCandidate) -> f64 {
    c.ovr + c.form * 8.0
}

// ── 쇼케이스 ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowcaseParams {
    pub rules: ShowcaseRules,
    pub candidates: Vec<CampusCandidate>,
    pub world_seed: u32,
    pub year: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowcaseEntry {
    pub npc_id: String,
    pub name: String,
    pub team_id: String,
    pub position: String,
    /// "recommend" | "top_scout" | "club_pick"
    pub route: String,
    /// Day2 전시경기 성과 (0~100). 능력치와 운이 섞인다
    pub day2_score: f64,
    pub standout: bool,
    pub scout_gain: f64,
    pub fame_gain: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowcaseResult {
    pub entries: Vec<ShowcaseEntry>,
    pub protagonist_invited: bool,
    pub total: usize,
}

/// 결정적 난수 — 같은 시드·같은 해면 같은 결과다
fn rng_of(seed: u32, year: i32, salt: u64) -> impl rand::Rng {
    use rand::SeedableRng;
    rand::rngs::StdRng::seed_from_u64(
        (seed as u64) ^ ((year as u64) << 20) ^ salt.wrapping_mul(0x9E37_79B9_7F4A_7C15),
    )
}

/// 전국대학선수쇼케이스 (_ledger §A-9).
///
/// **세 경로로 부른다.** 팀 추천은 약팀에도 자리를 주고, 주목도 상위는 이미 뜬
/// 선수를 확인시키고, 구단 지명은 스카우트가 직접 보고 싶은 선수를 넣는다.
/// 하나로 하면 명문 상위권만 모여 "이미 아는 이름"만 나온다.
pub fn run_showcase(p: ShowcaseParams) -> ShowcaseResult {
    use rand::Rng;
    let r = &p.rules;
    let mut picked: Vec<(CampusCandidate, &'static str)> = Vec::new();
    let mut taken: std::collections::HashSet<String> = std::collections::HashSet::new();

    // 1) 팀 추천 — 팀마다 평가 상위 N명
    let mut by_team: HashMap<String, Vec<&CampusCandidate>> = HashMap::new();
    for c in &p.candidates {
        by_team.entry(c.team_id.clone()).or_default().push(c);
    }
    let mut team_ids: Vec<&String> = by_team.keys().collect();
    team_ids.sort(); // 결정성 — HashMap 순회 순서에 기대지 않는다
    for tid in team_ids {
        let mut list = by_team[tid].clone();
        list.sort_by(|a, b| rating(b).partial_cmp(&rating(a)).unwrap_or(std::cmp::Ordering::Equal));
        for c in list.into_iter().take(r.per_team_recommend.max(0) as usize) {
            if taken.insert(c.npc_id.clone()) {
                picked.push((c.clone(), "recommend"));
            }
        }
    }

    // 2) 주목도 상위 — 팀 추천에서 빠진 선수 중
    let mut rest: Vec<&CampusCandidate> = p.candidates.iter()
        .filter(|c| !taken.contains(&c.npc_id)).collect();
    rest.sort_by(|a, b| b.scout_score.partial_cmp(&a.scout_score)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a.npc_id.cmp(&b.npc_id)));
    for c in rest.iter().take(r.top_scout_extra.max(0) as usize) {
        if taken.insert(c.npc_id.clone()) {
            picked.push(((*c).clone(), "top_scout"));
        }
    }

    // 3) 구단 지명 — 남은 후보에서 무작위. 이 경로가 "예상 밖의 이름"을 만든다
    let mut rng = rng_of(p.world_seed, p.year, 0xC0FFEE);
    let mut pool: Vec<&CampusCandidate> = p.candidates.iter()
        .filter(|c| !taken.contains(&c.npc_id)).collect();
    pool.sort_by(|a, b| a.npc_id.cmp(&b.npc_id));
    for _ in 0..r.club_picks.max(0) {
        if pool.is_empty() { break; }
        let i = rng.gen_range(0..pool.len());
        let c = pool.remove(i);
        if taken.insert(c.npc_id.clone()) {
            picked.push((c.clone(), "club_pick"));
        }
    }

    // Day2 전시경기 — 능력치 70% + 운 30%. 운이 없으면 참가가 형식이 된다
    let mut entries: Vec<ShowcaseEntry> = picked.into_iter().map(|(c, route)| {
        let luck: f64 = rng.gen();
        let day2 = (rating(&c) * 0.7 + luck * 100.0 * 0.3).clamp(0.0, 100.0);
        ShowcaseEntry {
            npc_id: c.npc_id, name: c.name, team_id: c.team_id,
            position: c.position, route: route.to_string(),
            day2_score: (day2 * 10.0).round() / 10.0,
            standout: false,
            scout_gain: r.attend_scout_gain,
            fame_gain: r.attend_fame_gain,
            }
    }).collect();

    // 상위 몇 %가 눈에 띄었나
    entries.sort_by(|a, b| b.day2_score.partial_cmp(&a.day2_score).unwrap_or(std::cmp::Ordering::Equal));
    let standout_n = ((entries.len() as f64) * r.standout_percent).round() as usize;
    for e in entries.iter_mut().take(standout_n) {
        e.standout = true;
        e.scout_gain += r.standout_scout_gain;
    }

    let protagonist_invited = p.candidates.iter()
        .any(|c| c.is_protagonist && entries.iter().any(|e| e.npc_id == c.npc_id));
    let total = entries.len();

    ShowcaseResult { entries, protagonist_invited, total }
}

// ── 올스타전 ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllStarParams {
    pub rules: AllStarRules,
    pub candidates: Vec<CampusCandidate>,
    pub world_seed: u32,
    pub year: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllStarPick {
    pub npc_id: String,
    pub name: String,
    pub team_id: String,
    pub position: String,
    /// "north" | "south"
    pub side: String,
    pub score: f64,
    /// 포지션 쿼터로 뽑혔나 (점수만으로는 못 들어왔다는 뜻)
    pub by_quota: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllStarResult {
    pub north: Vec<AllStarPick>,
    pub south: Vec<AllStarPick>,
    pub north_score: i32,
    pub south_score: i32,
    pub winner: String,
    pub mvp_npc_id: String,
    pub mvp_name: String,
    pub protagonist_selected: bool,
    pub protagonist_side: String,
}

/// 선발 점수 — **인기도가 실제로 들어간다.**
///
/// 올스타는 팬 투표 성격이라 순수 실력순이 아니다. 인기도를 안 보면
/// "그냥 OVR 상위 24명"이 되고, 인기도라는 스탯이 여기서도 죽는다.
fn allstar_score(c: &CampusCandidate) -> f64 {
    rating(c) * 0.7 + c.popularity * 0.3
}

/// 올스타전 (_ledger §A-9). 포지션 기반 24명 × 2, **대학당 최대 2명**.
///
/// 캡이 핵심이다. 없으면 명문 한 곳이 라인업을 통째로 채워 "북 vs 남"이 아니라
/// "A대 vs B대"가 된다.
pub fn run_allstar(p: AllStarParams) -> AllStarResult {
    use rand::Rng;
    let r = &p.rules;
    let mut rng = rng_of(p.world_seed, p.year, 0xA11_5742);

    // **점수순으로 먼저 채우고, 빈 포지션만 교체한다.**
    //
    // 쿼터를 먼저 돌리면 대학당 캡을 낮은 점수 선수가 먼저 먹는다 — 실제로
    // 그렇게 짜봤더니 인기도 99짜리 에이스가 자기 학교 쿼터에 밀려 못 들어갔고,
    // 포지션 하나는 아예 비었다(캡에 막힌 뒤 다음 후보를 안 봤다).
    let pick_side = |side: &str| -> Vec<AllStarPick> {
        let mut pool: Vec<&CampusCandidate> = p.candidates.iter()
            .filter(|c| c.region == side).collect();
        pool.sort_by(|a, b| allstar_score(b).partial_cmp(&allstar_score(a))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.npc_id.cmp(&b.npc_id)));

        let mut out: Vec<AllStarPick> = Vec::new();
        let mut per_school: HashMap<String, i32> = HashMap::new();
        let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();

        let make = |c: &CampusCandidate, quota: bool| AllStarPick {
            npc_id: c.npc_id.clone(), name: c.name.clone(),
            team_id: c.team_id.clone(), position: c.position.clone(),
            side: side.to_string(),
            score: (allstar_score(c) * 10.0).round() / 10.0,
            by_quota: quota,
        };

        // 1) 점수순 — 팬 투표가 뽑는 그림 그대로다
        for c in &pool {
            if out.len() >= r.squad_size as usize { break; }
            let n = per_school.entry(c.team_id.clone()).or_insert(0);
            if *n >= r.per_school_cap { continue; }
            *n += 1;
            used.insert(c.npc_id.clone());
            out.push(make(c, false));
        }

        // 2) 빈 포지션을 메운다. 라인업이 안 짜이면 경기 자체가 성립을 안 한다.
        //    **가장 흔한 포지션의 최저 점수 선수와 바꾼다** — 뒤에서부터 자르면
        //    바로 그 포지션이 다시 비는 일이 생긴다
        for pos in &r.required_positions {
            if out.iter().any(|x| &x.position == pos) { continue; }

            // 가장 많이 뽑힌 포지션에서 자리를 하나 뺀다
            let mut count: HashMap<&String, usize> = HashMap::new();
            for x in &out { *count.entry(&x.position).or_insert(0) += 1; }
            let Some(fat) = count.iter()
                .filter(|(_, n)| **n > 1)
                .max_by(|(pa, na), (pb, nb)| na.cmp(nb).then_with(|| pb.cmp(pa)))
                .map(|(p, _)| (*p).clone())
            else { continue };

            let Some(victim_i) = out.iter().enumerate()
                .filter(|(_, x)| x.position == fat && !x.by_quota)
                .min_by(|(_, a), (_, b)| a.score.partial_cmp(&b.score)
                    .unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i)
            else { continue };

            let victim = out.remove(victim_i);
            used.remove(&victim.npc_id);
            if let Some(n) = per_school.get_mut(&victim.team_id) { *n -= 1; }

            // **캡에 막히면 다음 후보를 본다.** 최고 후보 하나만 보고 포기하면
            // 그 학교가 이미 두 명인 순간 포지션이 통째로 비어버린다 —
            // 실제로 그렇게 짜서 1B가 빈 라인업이 나왔다
            let taken_ok = pool.iter()
                .filter(|c| &c.position == pos && !used.contains(&c.npc_id))
                .find(|c| *per_school.get(&c.team_id).unwrap_or(&0) < r.per_school_cap)
                .map(|c| {
                    *per_school.entry(c.team_id.clone()).or_insert(0) += 1;
                    used.insert(c.npc_id.clone());
                    out.push(make(c, true));
                })
                .is_some();

            if !taken_ok {
                // 그 포지션을 채울 수 있는 사람이 아무도 없다 — 원상복구.
                // 캡이 라인업보다 우선이다 (한 학교가 채우는 것보다 빈 게 낫다)
                *per_school.entry(victim.team_id.clone()).or_insert(0) += 1;
                used.insert(victim.npc_id.clone());
                out.insert(victim_i, victim);
            }
        }
        out
    };

    let north = pick_side("north");
    let south = pick_side("south");

    // 9이닝 단판 — 전력 차 + 운. 올스타는 원래 결과가 잘 안 맞는 경기다
    let strength = |v: &[AllStarPick]| -> f64 {
        if v.is_empty() { return 0.0; }
        v.iter().map(|x| x.score).sum::<f64>() / v.len() as f64
    };
    let ns = strength(&north);
    let ss = strength(&south);
    let edge = ((ns - ss) / 12.0).clamp(-1.0, 1.0);
    let base = 4.0 + edge * 1.5;
    let north_score = (base + rng.gen::<f64>() * 5.0).round().max(0.0) as i32;
    let south_score = (4.0 - edge * 1.5 + rng.gen::<f64>() * 5.0).round().max(0.0) as i32;

    let winner = if north_score > south_score { "north" }
        else if south_score > north_score { "south" }
        else { "draw" };

    // MVP — 이긴 쪽 최고 점수. 비기면 전체 최고
    let mvp_pool: Vec<&AllStarPick> = match winner {
        "north" => north.iter().collect(),
        "south" => south.iter().collect(),
        _ => north.iter().chain(south.iter()).collect(),
    };
    let mvp = mvp_pool.iter()
        .max_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal));

    let me = p.candidates.iter().find(|c| c.is_protagonist);
    let (selected, side) = match me {
        Some(c) if north.iter().any(|x| x.npc_id == c.npc_id) => (true, "north"),
        Some(c) if south.iter().any(|x| x.npc_id == c.npc_id) => (true, "south"),
        _ => (false, ""),
    };

    AllStarResult {
        mvp_npc_id: mvp.map(|m| m.npc_id.clone()).unwrap_or_default(),
        mvp_name: mvp.map(|m| m.name.clone()).unwrap_or_default(),
        north, south, north_score, south_score,
        winner: winner.to_string(),
        protagonist_selected: selected,
        protagonist_side: side.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> CampusEventRules {
        let raw = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&raw).expect("파싱 실패");
        serde_json::from_value(v["campusEvents"].clone()).expect("campusEvents 파싱 실패")
    }

    fn cands(n_teams: usize, per_team: usize) -> Vec<CampusCandidate> {
        let pos = ["SP", "RP", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
        let mut out = Vec::new();
        for t in 0..n_teams {
            for i in 0..per_team {
                out.push(CampusCandidate {
                    npc_id: format!("U{t:02}_{i:02}"),
                    name: format!("선수{t:02}{i:02}"),
                    team_id: format!("TEAM_UNIV_{t:02}"),
                    region: if t % 2 == 0 { "north".into() } else { "south".into() },
                    position: pos[i % pos.len()].into(),
                    ovr: 45.0 + ((t * 7 + i * 3) % 45) as f64,
                    age: 21, grade: 3,
                    scout_score: ((t * 11 + i * 5) % 100) as f64,
                    popularity: ((t * 13 + i * 7) % 100) as f64,
                    form: 0.0,
                    is_protagonist: t == 0 && i == 0,
                });
            }
        }
        out
    }

    #[test]
    fn 쇼케이스는_약팀에도_자리를_준다() {
        let r = rules();
        let c = cands(50, 30);
        let out = run_showcase(ShowcaseParams {
            rules: r.showcase.clone(), candidates: c.clone(), world_seed: 42, year: 2030,
        });
        // 팀 추천은 팀마다 고정 인원 — 명문만 모이면 안 된다
        let teams: std::collections::HashSet<&String> = out.entries.iter()
            .filter(|e| e.route == "recommend").map(|e| &e.team_id).collect();
        assert_eq!(teams.len(), 50, "팀 추천이 모든 대학을 안 덮었다 ({}개교)", teams.len());
        assert!(out.total >= 200 && out.total <= 260,
            "참가 규모가 기획(~220명)과 다르다: {}", out.total);
    }

    #[test]
    fn 쇼케이스는_세_경로로_부른다() {
        let r = rules();
        let out = run_showcase(ShowcaseParams {
            rules: r.showcase.clone(), candidates: cands(50, 30), world_seed: 7, year: 2030,
        });
        for route in ["recommend", "top_scout", "club_pick"] {
            assert!(out.entries.iter().any(|e| e.route == route), "{route} 경로가 비었다");
        }
        // 중복 초대 없음
        let ids: std::collections::HashSet<&String> = out.entries.iter().map(|e| &e.npc_id).collect();
        assert_eq!(ids.len(), out.entries.len(), "같은 선수를 두 번 불렀다");
    }

    #[test]
    fn 쇼케이스는_참가만_해도_주목도가_오른다() {
        let r = rules();
        let out = run_showcase(ShowcaseParams {
            rules: r.showcase.clone(), candidates: cands(50, 30), world_seed: 1, year: 2030,
        });
        assert!(out.entries.iter().all(|e| e.scout_gain > 0.0), "참가 보상이 0인 선수가 있다");
        let standouts = out.entries.iter().filter(|e| e.standout).count();
        assert!(standouts > 0 && standouts < out.total / 2,
            "눈에 띈 인원이 {standouts}/{} — 전원이거나 0명이면 의미가 없다", out.total);
        // 눈에 띈 쪽이 더 받는다
        let s = out.entries.iter().find(|e| e.standout).unwrap();
        let n = out.entries.iter().find(|e| !e.standout).unwrap();
        assert!(s.scout_gain > n.scout_gain);
    }

    #[test]
    fn 올스타는_대학당_캡을_지킨다() {
        let r = rules();
        let out = run_allstar(AllStarParams {
            rules: r.allstar.clone(), candidates: cands(50, 30), world_seed: 42, year: 2030,
        });
        for side in [&out.north, &out.south] {
            let mut per: HashMap<&String, i32> = HashMap::new();
            for p in side { *per.entry(&p.team_id).or_insert(0) += 1; }
            for (t, n) in &per {
                assert!(*n <= r.allstar.per_school_cap,
                    "{t}에서 {n}명 — 캡 {} 초과. 명문 한 곳이 라인업을 채운다",
                    r.allstar.per_school_cap);
            }
        }
    }

    #[test]
    fn 올스타는_포지션을_고르게_채운다() {
        let r = rules();
        let out = run_allstar(AllStarParams {
            rules: r.allstar.clone(), candidates: cands(50, 30), world_seed: 42, year: 2030,
        });
        for side in [&out.north, &out.south] {
            for pos in &r.allstar.required_positions {
                assert!(side.iter().any(|p| &p.position == pos),
                    "{pos} 자리가 비었다 — 라인업이 안 짜인다");
            }
        }
        assert_eq!(out.north.len(), r.allstar.squad_size as usize);
        assert_eq!(out.south.len(), r.allstar.squad_size as usize);
    }

    #[test]
    fn 올스타는_인기도를_실제로_본다() {
        let r = rules();
        let mut c = cands(20, 20);
        // 같은 능력치인데 인기도만 다른 두 명 — 인기 쪽이 뽑혀야 한다
        for x in c.iter_mut() { x.ovr = 60.0; x.popularity = 10.0; x.form = 0.0; }
        c[0].popularity = 99.0;
        c[0].is_protagonist = false;
        let out = run_allstar(AllStarParams {
            rules: r.allstar.clone(), candidates: c.clone(), world_seed: 5, year: 2030,
        });
        let star = &c[0];
        let picked = out.north.iter().chain(out.south.iter()).any(|p| p.npc_id == star.npc_id);
        assert!(picked, "능력치가 같을 때 인기도 99가 안 뽑혔다 — 인기도가 죽은 스탯이 된다");
    }

    #[test]
    fn 결과가_결정적이다() {
        let r = rules();
        let c = cands(50, 30);
        let a = run_allstar(AllStarParams {
            rules: r.allstar.clone(), candidates: c.clone(), world_seed: 99, year: 2031 });
        let b = run_allstar(AllStarParams {
            rules: r.allstar.clone(), candidates: c.clone(), world_seed: 99, year: 2031 });
        assert_eq!(a.north_score, b.north_score);
        assert_eq!(a.mvp_npc_id, b.mvp_npc_id);

        let diff = run_allstar(AllStarParams {
            rules: r.allstar.clone(), candidates: c, world_seed: 100, year: 2031 });
        assert!(diff.north_score != a.north_score || diff.mvp_npc_id != a.mvp_npc_id,
            "시드가 달라도 결과가 같다 — 난수가 안 걸렸다");
    }

    #[test]
    fn 올스타_승패와_mvp가_일관된다() {
        let r = rules();
        for seed in [1u32, 2, 3, 7, 11, 42, 99] {
            let out = run_allstar(AllStarParams {
                rules: r.allstar.clone(), candidates: cands(50, 30), world_seed: seed, year: 2030 });
            let side = match out.winner.as_str() {
                "north" => &out.north, "south" => &out.south, _ => continue,
            };
            assert!(side.iter().any(|p| p.npc_id == out.mvp_npc_id),
                "MVP가 이긴 팀 소속이 아니다 (seed {seed})");
        }
    }
}
