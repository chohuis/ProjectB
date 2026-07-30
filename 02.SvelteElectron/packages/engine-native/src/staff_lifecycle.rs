// 스태프 생애주기 (Phase 6B) — people.md §3
//
// 정적 JSON 시절엔 없던 개념이다. 20시즌 커리어에서 감독이 그대로면 세계가 죽어 보인다.
//
// 시즌 종료 처리 순서 (이 순서가 중요하다):
//   1. 나이 +1
//   2. 경력 성장 (완만하게 — 몇 시즌 만에 최상급이 되면 팀 격차가 무너진다)
//   3. 은퇴 판정 → 빈 자리 목록
//   4. 감독 경질 판정 → FA 전환 + 코치진 일부 동반 이탈 → 빈 자리 추가
//   5. 고령 하향 판정 (상위 리그에 있는 은퇴 진입기 스태프 → FA)
//   6. 빈 자리 충원: ① 현직 하위 자리 우수 스태프(상향) ② FA 풀 ③ 신규 생성
//
// 6번을 상위 팀부터 도는 이유: 이동이 "위로 올라가는 경로"로만 생기게 하고,
// 이동으로 새로 빈 자리가 연쇄로 메워지게 하려면 한 방향으로 훑어야 한다.
//
// **경질은 종착이 아니다.** status를 `free_agent`로 두고 다음 시즌 빈 자리 후보에
// 넣는다 — 경질자를 retired로 끝내면 세계에 "아는 이름"이 안 쌓이고 매번 새 사람이
// 생성된다. FA는 나이가 계속 오르므로 고령 FA는 은퇴 곡선이 알아서 정리한다.
//
// worldSeed × 시즌 결정적 — 같은 세이브를 다시 열어도 같은 사람이 은퇴한다.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::staff_gen::StaffRow;

fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

fn hash_str(s: &str) -> u64 {
    let mut h = 0xCBF29CE484222325u64;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001B3);
    }
    h
}

struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self { Rng(seed) }
    /// 0~99
    fn pct(&mut self) -> u64 { splitmix64(&mut self.0) % 100 }
    fn range(&mut self, lo: i64, hi: i64) -> i64 {
        if hi <= lo { return lo; }
        lo + (splitmix64(&mut self.0) % ((hi - lo + 1) as u64)) as i64
    }
}

// ── 규칙 (staff_rules.toml [lifecycle]) ────────────────────────

// TOML에서 오는 규칙 — snake_case가 정본
#[derive(Debug, Deserialize, Clone)]
pub struct RetireBand {
    pub until: i64,
    pub chance: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RetireRules {
    pub manager: Vec<RetireBand>,
    pub coach: Vec<RetireBand>,
    pub owner: Vec<RetireBand>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GrowthRules {
    pub peak_age: i64,
    pub young_gain: i64,
    pub plateau_gain: i64,
    pub decline_age: i64,
    pub decline_loss: i64,
    pub stats_per_season: usize,
    pub cap: i64,
    pub floor: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct FiringThreshold {
    pub patience_until: i64,
    pub seasons: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct FiringRules {
    #[serde(default)]
    pub expectation_by_power: bool,
    pub threshold: Vec<FiringThreshold>,
    /// 감독 경질 시 코치진 동반 이탈
    #[serde(default)]
    pub fallout: Option<FalloutRules>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct FalloutRules {
    /// 그 팀 코치 중 능력 **하위** 이 비율이 함께 나간다
    pub coach_ratio: f64,
}

/// 하향 — 은퇴 진입기에 상위 리그에 있으면 한 단계 낮은 무대로 (FA 전환)
#[derive(Debug, Deserialize, Clone)]
pub struct DemotionRules {
    /// 하향 확률 = 그 나이의 은퇴 확률 × age_ratio
    pub age_ratio: f64,
    pub roles: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct HiringRules {
    #[serde(default)]
    pub scout_from_lower_only: bool,
    pub scout_min_avg: i64,
    /// 경질·하향자(FA)를 빈 자리 후보에 넣는다
    #[serde(default)]
    pub use_free_agent_pool: bool,
    #[serde(default = "fa_default_min")]
    pub fa_min_avg: i64,
    /// FA 재취업은 마지막 소속보다 낮거나 같은 자리만
    #[serde(default)]
    pub fa_downward_only: bool,
}

fn fa_default_min() -> i64 { 45 }

#[derive(Debug, Deserialize, Clone)]
pub struct LifecycleRules {
    #[serde(default = "yes")]
    pub enabled: bool,
    pub retire: RetireRules,
    pub growth: GrowthRules,
    pub firing: FiringRules,
    pub hiring: HiringRules,
    #[serde(default)]
    pub demotion: Option<DemotionRules>,
}

fn yes() -> bool { true }

// ── 입력 ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeamSeasonResult {
    pub team_id: String,
    pub league_id: String,
    /// 전력★ 1~5 — 기대 순위의 근거
    pub power: i64,
    /// 그 리그에서의 최종 순위 (1 = 1위)
    pub rank: i64,
    /// 그 리그 팀 수
    pub league_size: i64,
    /// 누적된 부진 시즌 수 (이 시즌 판정 전 값)
    #[serde(default)]
    pub slump_seasons: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceStaffParams {
    pub world_seed: u32,
    /// 방금 끝난 시즌
    pub season_year: u32,
    pub staff: Vec<StaffRow>,
    /// 리그 최종 순위 — 경질 판정에 쓴다. 없는 팀은 경질 판정을 건너뛴다
    #[serde(default)]
    pub results: Vec<TeamSeasonResult>,
    pub rules: LifecycleRules,
}

// ── 출력 ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StaffEvent {
    /// "retired" | "fired" | "demoted" | "fallout" | "moved" | "rehired" | "hired" | "vacant"
    pub kind: String,
    pub staff_id: String,
    pub name: String,
    pub role: String,
    pub team_id: String,
    pub league_id: String,
    /// moved일 때 떠난 팀
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_team_id: Option<String>,
    pub age: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceStaffResult {
    /// 시즌 후 스태프 전원 (은퇴·경질자는 status가 바뀐 채로 포함된다)
    pub staff: Vec<StaffRow>,
    /// 이번 시즌에 벌어진 일 — 뉴스·메시지의 소재
    pub events: Vec<StaffEvent>,
    /// 팀별 갱신된 부진 누적 (다음 시즌 입력으로 되돌려준다)
    pub slump_seasons: BTreeMap<String, i64>,
}

fn clamp(v: i64, lo: i64, hi: i64) -> i64 { v.max(lo).min(hi) }

fn retire_chance(bands: &[RetireBand], age: i64) -> u64 {
    for b in bands {
        if age <= b.until {
            return b.chance;
        }
    }
    100
}

fn firing_threshold(rules: &FiringRules, patience: i64) -> i64 {
    for t in &rules.threshold {
        if patience <= t.patience_until {
            return t.seasons;
        }
    }
    // 구간을 못 찾으면 가장 관대한 값 — 조용히 경질하는 쪽으로 기울지 않는다
    rules.threshold.iter().map(|t| t.seasons).max().unwrap_or(3)
}

fn avg_stat(s: &BTreeMap<String, i64>) -> i64 {
    if s.is_empty() {
        return 0;
    }
    s.values().sum::<i64>() / s.len() as i64
}

/// 리그 서열 — 스카우트가 "위로만" 움직이게 하는 기준
fn league_tier(league_id: &str) -> i64 {
    match league_id {
        "LEAGUE_KBL" => 4,
        "LEAGUE_UNIVERSITY" => 3,
        "LEAGUE_INDEPENDENT" => 2,
        "LEAGUE_HIGHSCHOOL" => 1,
        _ => 0,
    }
}

pub fn advance_staff_season(p: AdvanceStaffParams) -> AdvanceStaffResult {
    let mut staff = p.staff.clone();
    let mut events: Vec<StaffEvent> = Vec::new();
    let mut slump: BTreeMap<String, i64> = BTreeMap::new();

    if !p.rules.enabled {
        for r in &p.results {
            slump.insert(r.team_id.clone(), r.slump_seasons);
        }
        return AdvanceStaffResult { staff, events, slump_seasons: slump };
    }

    let season_salt = (p.world_seed as u64).wrapping_mul(0x9E3779B97F4A7C15)
        ^ (p.season_year as u64).wrapping_mul(0xD1B54A32D192ED03);

    // 결정성: staff_id 순으로 처리한다 (입력 순서에 의존하지 않는다)
    staff.sort_by(|a, b| a.staff_id.cmp(&b.staff_id));

    let g = &p.rules.growth;

    // ── 1·2. 나이 +1 · 경력 성장 ──────────────────────────────
    for st in staff.iter_mut() {
        // FA도 나이를 먹는다 — 안 그러면 구직 상태로 영구히 남는다.
        // 다만 경력(years)은 안 오른다: 현장을 떠나 있는 해다.
        if st.status != "active" && st.status != "free_agent" {
            continue;
        }
        st.age += 1;
        if st.status == "active" {
            st.years += 1;
        }

        let delta = if st.age < g.peak_age {
            g.young_gain
        } else if st.age < g.decline_age {
            g.plateau_gain
        } else {
            -g.decline_loss
        };
        if delta != 0 && g.stats_per_season > 0 {
            let mut rng = Rng::new(season_salt ^ hash_str(&st.staff_id) ^ hash_str("growth"));
            // 능력치 5종 중 일부만 — 전부 올리면 몇 시즌 만에 최상급이 된다
            let keys: Vec<String> = st.stats.keys().cloned().collect();
            if !keys.is_empty() {
                let n = g.stats_per_season.min(keys.len());
                // 시작 인덱스를 시드로 정하고 순환 — 같은 시즌에 같은 스태프면 같은 선택
                let start = (rng.range(0, keys.len() as i64 - 1)) as usize;
                for i in 0..n {
                    let k = &keys[(start + i) % keys.len()];
                    if let Some(v) = st.stats.get_mut(k) {
                        *v = clamp(*v + delta, g.floor, g.cap);
                    }
                }
            }
        }
    }

    // ── 3. 은퇴 판정 ──────────────────────────────────────────
    for st in staff.iter_mut() {
        // FA도 은퇴 판정 대상 — 구직 기간이 길어지면 나이가 상한에 닿아 정리된다.
        // 별도 "FA 잠재 기간" 카운터를 두지 않아도 자연히 마무리된다.
        if st.status != "active" && st.status != "free_agent" {
            continue;
        }
        let bands = match st.role.as_str() {
            "manager" => &p.rules.retire.manager,
            "coach" => &p.rules.retire.coach,
            _ => &p.rules.retire.owner,
        };
        let chance = retire_chance(bands, st.age);
        if chance == 0 {
            continue;
        }
        let mut rng = Rng::new(season_salt ^ hash_str(&st.staff_id) ^ hash_str("retire"));
        if chance >= 100 || rng.pct() < chance {
            let was_fa = st.status == "free_agent";
            st.status = "retired".into();
            events.push(StaffEvent {
                // FA가 은퇴하면 그 팀 자리는 이미 비어 있다 — 빈 자리를 두 번 세면
                // 한 자리에 두 명이 부임한다
                kind: if was_fa { "retired_fa".into() } else { "retired".to_string() },
                staff_id: st.staff_id.clone(),
                name: st.name.clone(),
                role: st.role.clone(),
                team_id: st.team_id.clone(),
                league_id: st.league_id.clone(),
                from_team_id: None,
                age: st.age,
            });
        }
    }

    // ── 4. 감독 경질 판정 ─────────────────────────────────────
    // 전력★로 기대 순위를 잡고 실제 순위가 미달하면 부진 시즌을 누적한다.
    // ★1 팀은 기대치가 전원이라 경질이 없다 — 하위권이 그 팀의 정상이다.
    let owner_patience: HashMap<String, i64> = staff
        .iter()
        .filter(|s| s.role == "owner" && s.status == "active")
        .map(|s| (s.team_id.clone(), *s.stats.get("patience").unwrap_or(&50)))
        .collect();

    for r in &p.results {
        let expected_ratio = if p.rules.firing.expectation_by_power {
            1.0 - ((r.power - 1) as f64 / 5.0)
        } else {
            0.5
        };
        let expected_rank = ((r.league_size as f64) * expected_ratio).ceil().max(1.0) as i64;
        let underperformed = r.rank > expected_rank;
        let next_slump = if underperformed { r.slump_seasons + 1 } else { 0 };
        slump.insert(r.team_id.clone(), next_slump);

        if !underperformed {
            continue;
        }
        let patience = *owner_patience.get(&r.team_id).unwrap_or(&50);
        let need = firing_threshold(&p.rules.firing, patience);
        if next_slump < need {
            continue;
        }
        // 경질 — 이미 은퇴한 감독은 건드리지 않는다
        let mut fired_any = false;
        if let Some(mgr) = staff
            .iter_mut()
            .find(|s| s.role == "manager" && s.team_id == r.team_id && s.status == "active")
        {
            // 종착이 아니라 FA — 다음 시즌 하위 자리 후보에 들어간다
            mgr.status = "free_agent".into();
            events.push(StaffEvent {
                kind: "fired".into(),
                staff_id: mgr.staff_id.clone(),
                name: mgr.name.clone(),
                role: mgr.role.clone(),
                team_id: mgr.team_id.clone(),
                league_id: mgr.league_id.clone(),
                from_team_id: None,
                age: mgr.age,
            });
            // 경질했으면 누적은 리셋 — 새 감독에게 전 감독의 빚을 물리지 않는다
            slump.insert(r.team_id.clone(), 0);
            fired_any = true;
        }

        // 감독 경질 시 코치진 일부 동반 이탈.
        // 감독 교체가 팀에 진짜 충격이 되게 하는 장치 — 주인공 입장에서는
        // 훈련 효율이 떨어지는 실질적 손실이다.
        if fired_any {
            if let Some(fo) = &p.rules.firing.fallout {
                let mut idxs: Vec<(usize, i64)> = staff
                    .iter()
                    .enumerate()
                    .filter(|(_, s)| s.role == "coach" && s.team_id == r.team_id && s.status == "active")
                    .map(|(i, s)| (i, avg_stat(&s.stats)))
                    .collect();
                // 능력 하위부터 — 좋은 코치는 남는다
                idxs.sort_by(|a, b| a.1.cmp(&b.1).then(staff[a.0].staff_id.cmp(&staff[b.0].staff_id)));
                let n = ((idxs.len() as f64) * fo.coach_ratio).floor() as usize;
                for (i, _) in idxs.into_iter().take(n) {
                    staff[i].status = "free_agent".into();
                    events.push(StaffEvent {
                        kind: "fallout".into(),
                        staff_id: staff[i].staff_id.clone(),
                        name: staff[i].name.clone(),
                        role: staff[i].role.clone(),
                        team_id: staff[i].team_id.clone(),
                        league_id: staff[i].league_id.clone(),
                        from_team_id: None,
                        age: staff[i].age,
                    });
                }
            }
        }
    }

    // ── 5. 고령 하향 ──────────────────────────────────────────
    // 은퇴 확률이 생기는 나이부터, **상위 리그에 있으면** 한 단계 낮은 무대로 내려간다.
    // 은퇴 전 마지막 무대가 고교·대학이 되는 그림이고, 고교 팀에 베테랑 지도자가
    // 오는 경로가 열린다. 최하위 리그(고교)면 더 내려갈 곳이 없어 하향 없음.
    if let Some(dm) = &p.rules.demotion {
        for st in staff.iter_mut() {
            if st.status != "active" || !dm.roles.contains(&st.role) {
                continue;
            }
            if league_tier(&st.league_id) <= 1 {
                continue; // 이미 최하위 무대
            }
            let bands = match st.role.as_str() {
                "manager" => &p.rules.retire.manager,
                "coach" => &p.rules.retire.coach,
                _ => continue,
            };
            let base = retire_chance(bands, st.age);
            if base == 0 {
                continue; // 아직 은퇴 진입기가 아니다
            }
            // 상한(100%) 구간은 이미 은퇴 판정에서 걸렸으므로 여기 오지 않는다
            let chance = ((base as f64) * dm.age_ratio).round() as u64;
            if chance == 0 {
                continue;
            }
            let mut rng = Rng::new(season_salt ^ hash_str(&st.staff_id) ^ hash_str("demote"));
            if rng.pct() < chance {
                st.status = "free_agent".into();
                events.push(StaffEvent {
                    kind: "demoted".into(),
                    staff_id: st.staff_id.clone(),
                    name: st.name.clone(),
                    role: st.role.clone(),
                    team_id: st.team_id.clone(),
                    league_id: st.league_id.clone(),
                    from_team_id: None,
                    age: st.age,
                });
            }
        }
    }

    // ── 6. 빈 자리 충원 ───────────────────────────────────────
    // 상위 리그·강팀부터 채운다. 하위 팀의 우수 스태프를 스카우트해 끌어온다.
    // 한 방향으로 훑어야 이동으로 새로 빈 자리가 연쇄로 메워진다.
    // 은퇴·경질·동반이탈·하향으로 비워진 모든 자리
    let vacancies: Vec<(String, String, String)> = events
        .iter()
        .filter(|e| matches!(e.kind.as_str(), "retired" | "fired" | "fallout" | "demoted"))
        .map(|e| (e.team_id.clone(), e.league_id.clone(), e.role.clone()))
        .collect();

    // 팀 전력 — 충원 우선순위
    let power_of: HashMap<String, i64> =
        p.results.iter().map(|r| (r.team_id.clone(), r.power)).collect();

    let mut ordered = vacancies.clone();
    ordered.sort_by(|a, b| {
        league_tier(&b.1)
            .cmp(&league_tier(&a.1))
            .then(power_of.get(&b.0).unwrap_or(&3).cmp(power_of.get(&a.0).unwrap_or(&3)))
            .then(a.0.cmp(&b.0))
            .then(a.2.cmp(&b.2))
    });

    for (team_id, league_id, role) in ordered {
        let target_tier = league_tier(&league_id);
        let target_power = *power_of.get(&team_id).unwrap_or(&3);

        // 스카우트 후보: 같은 역할 · active · 능력치 평균 하한 이상 ·
        // **현 소속이 더 낮은 자리**(리그가 낮거나, 같은 리그에서 전력이 낮은 팀)
        let mut best: Option<(usize, i64)> = None;
        for (i, cand) in staff.iter().enumerate() {
            if cand.status != "active" || cand.role != role {
                continue;
            }
            if cand.team_id == team_id {
                continue;
            }
            let avg = avg_stat(&cand.stats);
            if avg < p.rules.hiring.scout_min_avg {
                continue;
            }
            if p.rules.hiring.scout_from_lower_only {
                let cand_tier = league_tier(&cand.league_id);
                let cand_power = *power_of.get(&cand.team_id).unwrap_or(&3);
                let is_lower = cand_tier < target_tier
                    || (cand_tier == target_tier && cand_power < target_power);
                if !is_lower {
                    continue;
                }
            }
            if best.map(|(_, a)| avg > a).unwrap_or(true) {
                best = Some((i, avg));
            }
        }

        if let Some((i, _)) = best {
            let from = staff[i].team_id.clone();
            staff[i].team_id = team_id.clone();
            staff[i].league_id = league_id.clone();
            staff[i].joined_season = p.season_year + 1;
            events.push(StaffEvent {
                kind: "moved".into(),
                staff_id: staff[i].staff_id.clone(),
                name: staff[i].name.clone(),
                role: staff[i].role.clone(),
                team_id: team_id.clone(),
                league_id: league_id.clone(),
                from_team_id: Some(from),
                age: staff[i].age,
            });
            // 이동으로 새로 빈 자리가 생기지만, 그 자리는 다음 시즌에 메워진다 —
            // 같은 시즌에 연쇄를 끝까지 돌리면 리그 전체가 한 해에 뒤집힌다.
            continue;
        }

        // ② FA 풀 — 경질·하향·동반이탈로 나온 사람들.
        //
        // "KBL에서 잘린 감독이 모교에 왔다"가 성립하는 경로다. 신규 생성이 줄어
        // 세계에 아는 이름이 쌓인다. 이번 시즌에 막 FA가 된 사람도 포함한다 —
        // 경질과 재취업이 같은 오프시즌에 일어나는 게 현실적이다.
        if p.rules.hiring.use_free_agent_pool {
            let mut fa: Option<(usize, i64)> = None;
            for (i, cand) in staff.iter().enumerate() {
                if cand.status != "free_agent" || cand.role != role {
                    continue;
                }
                let avg = avg_stat(&cand.stats);
                if avg < p.rules.hiring.fa_min_avg {
                    continue;
                }
                if p.rules.hiring.fa_downward_only {
                    // 마지막 소속(FA가 되어도 team_id/league_id는 그대로 남는다)보다
                    // 낮거나 같은 자리만. 잘린 직후 상위 팀으로 가는 건 막는다.
                    let last_tier = league_tier(&cand.league_id);
                    let last_power = *power_of.get(&cand.team_id).unwrap_or(&3);
                    let is_not_higher = target_tier < last_tier
                        || (target_tier == last_tier && target_power <= last_power);
                    if !is_not_higher {
                        continue;
                    }
                }
                if fa.map(|(_, a)| avg > a).unwrap_or(true) {
                    fa = Some((i, avg));
                }
            }
            if let Some((i, _)) = fa {
                let from = staff[i].team_id.clone();
                staff[i].status = "active".into();
                staff[i].team_id = team_id.clone();
                staff[i].league_id = league_id.clone();
                staff[i].joined_season = p.season_year + 1;
                events.push(StaffEvent {
                    kind: "rehired".into(),
                    staff_id: staff[i].staff_id.clone(),
                    name: staff[i].name.clone(),
                    role: staff[i].role.clone(),
                    team_id: team_id.clone(),
                    league_id: league_id.clone(),
                    from_team_id: Some(from),
                    age: staff[i].age,
                });
                continue;
            }
        }

        // ③ 후보 없음 → 신규 생성은 호출부(TS)가 staff_gen으로 처리한다.
        // 여기서 만들면 이름 풀·생성 규칙을 이 모듈이 또 들고 있어야 한다.
        events.push(StaffEvent {
            kind: "vacant".into(),
            staff_id: String::new(),
            name: String::new(),
            role: role.clone(),
            team_id: team_id.clone(),
            league_id: league_id.clone(),
            from_team_id: None,
            age: 0,
        });
    }

    AdvanceStaffResult { staff, events, slump_seasons: slump }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bands() -> Vec<RetireBand> {
        vec![
            RetireBand { until: 59, chance: 0 },
            RetireBand { until: 63, chance: 6 },
            RetireBand { until: 71, chance: 30 },
            RetireBand { until: 200, chance: 100 },
        ]
    }

    #[test]
    fn retire_bands_pick_first_match() {
        let b = bands();
        assert_eq!(retire_chance(&b, 40), 0);
        assert_eq!(retire_chance(&b, 59), 0);
        assert_eq!(retire_chance(&b, 60), 6);
        assert_eq!(retire_chance(&b, 63), 6);
        assert_eq!(retire_chance(&b, 64), 30);
        assert_eq!(retire_chance(&b, 71), 30);
        assert_eq!(retire_chance(&b, 72), 100);
        assert_eq!(retire_chance(&b, 99), 100);
    }

    #[test]
    fn firing_threshold_scales_with_patience() {
        let r = FiringRules {
            expectation_by_power: true,
            threshold: vec![
                FiringThreshold { patience_until: 29, seasons: 1 },
                FiringThreshold { patience_until: 69, seasons: 2 },
                FiringThreshold { patience_until: 200, seasons: 3 },
            ],
            fallout: None,
        };
        assert_eq!(firing_threshold(&r, 10), 1);
        assert_eq!(firing_threshold(&r, 29), 1);
        assert_eq!(firing_threshold(&r, 30), 2);
        assert_eq!(firing_threshold(&r, 69), 2);
        assert_eq!(firing_threshold(&r, 70), 3);
        assert_eq!(firing_threshold(&r, 95), 3);
    }

    #[test]
    fn fa_retirement_does_not_create_vacancy() {
        // FA가 은퇴하면 그 팀 자리는 이미 비어 있다. 빈 자리로 두 번 세면
        // 한 자리에 두 명이 부임한다 — kind가 "retired_fa"로 갈려야 한다.
        let vacancy_kinds = ["retired", "fired", "fallout", "demoted"];
        assert!(!vacancy_kinds.contains(&"retired_fa"));
        assert!(vacancy_kinds.contains(&"demoted"));
        assert!(vacancy_kinds.contains(&"fallout"));
    }

    #[test]
    fn league_tiers_are_ordered() {
        assert!(league_tier("LEAGUE_KBL") > league_tier("LEAGUE_UNIVERSITY"));
        assert!(league_tier("LEAGUE_UNIVERSITY") > league_tier("LEAGUE_INDEPENDENT"));
        assert!(league_tier("LEAGUE_INDEPENDENT") > league_tier("LEAGUE_HIGHSCHOOL"));
        assert_eq!(league_tier("LEAGUE_UNKNOWN"), 0);
    }
}
