// 관계도 엔진 (Phase 6C) — 설계 정본 people.md §4
//
// 주인공 기준 1:N. NPC끼리의 관계는 만들지 않는다.
//
// 이것이 구 감정 시스템(NpcEmotion 9축)을 대체한다. 9축은 라이벌 서사에는 풍부했지만
// **판정에 쓸 단일 근거가 없었다** — "감독이 날 쓰는가"를 물으면 trust인지 dependence인지
// admiration인지 매번 정해야 했다. 그리고 스태프는 npcs 배열에 없어서 manager/coach
// 갱신 분기는 한 번도 실행되지 않았다(죽은 코드). 여기서는 단일 값으로 판정하고,
// 서사의 풍부함은 memories(사건 기록)와 disposition(상대 성향)이 맡는다.
//
// 값 −100~100, 7단계 라벨. **플레이어에게 숫자를 보여주지 않는다.**

use serde::{Deserialize, Serialize};

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

/// 사람마다 **독립 스트림**을 쓴다. 한 스트림으로 순차 생성하면 앞쪽 인원이
/// 바뀔 때 뒤가 전부 흔들려 디버깅이 불가능해진다 (_ledger P6-4).
fn person_rng(world_seed: u64, person_id: &str, tag: &str) -> u64 {
    hash_str(person_id)
        ^ world_seed.wrapping_mul(0x9E3779B97F4A7C15)
        ^ hash_str(tag)
}

pub fn clamp_value(v: f64) -> i32 {
    let r = v.round();
    if r > 100.0 { 100 } else if r < -100.0 { -100 } else { r as i32 }
}

// ── 7단계 라벨 — **여기가 정본** ────────────────────────────────
//
// TOML이 아니라 코드에 있는 이유: 경계는 튜닝 수치가 아니라 구조다.
// TS `types/relationship.ts`가 이 표를 미러하고, `npm run test:relationship`이
// 두 정의를 대조한다. 한쪽만 고치면 "화면엔 신뢰인데 감독은 안 쓰는" 상태가 되고
// 그건 조용히 굴러간다.
pub const RELATION_LABELS: [(i32, i32, &str, &str); 7] = [
    (-100, -61, "적대", "hostile"),
    (-60,  -31, "불신", "distrust"),
    (-30,  -11, "서먹", "cold"),
    (-10,   10, "중립", "neutral"),
    (11,    34, "우호", "friendly"),
    (35,    64, "신뢰", "trusted"),
    (65,   100, "각별", "close"),
];

pub fn relation_label(value: i32) -> (&'static str, &'static str) {
    let v = value.clamp(-100, 100);
    for (lo, hi, label, tone) in RELATION_LABELS.iter() {
        if v >= *lo && v <= *hi {
            return (label, tone);
        }
    }
    ("중립", "neutral")
}

/// 중립을 0으로 둔 라벨 거리. −3(적대) ~ +3(각별).
///
/// 효과 배선은 **값이 아니라 이 단계로** 계산한다. 관계값은 플레이어에게 안 보이고
/// 라벨만 보이므로, 판정도 라벨로 해야 "각별인데 왜 안 써주지"가 생기지 않는다.
pub fn label_step(value: i32) -> i32 {
    let v = value.clamp(-100, 100);
    let idx = RELATION_LABELS.iter().position(|(lo, hi, _, _)| v >= *lo && v <= *hi);
    // 중립이 인덱스 3이다
    idx.map(|i| i as i32 - 3).unwrap_or(0)
}

// ── 상대 성향 — personId 결정적 ──────────────────────────────────
// 구 emotionEngine의 disposition을 그대로 가져왔다. 같은 사건에 사람마다
// 다르게 반응하게 만드는 유일한 축이라 관계도에서도 필요하다.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disposition {
    pub competitive: i32,
    pub prideful: i32,
    pub nurturing: i32,
    pub territorial: i32,
    pub volatile: i32,
}

pub fn disposition(world_seed: u64, person_id: &str) -> Disposition {
    let mut s = person_rng(world_seed, person_id, "disposition");
    let mut next = || (splitmix64(&mut s) % 101) as i32;
    Disposition {
        competitive: next(),
        prideful: next(),
        nurturing: next(),
        territorial: next(),
        volatile: next(),
    }
}

// ── 규칙 (relationship_rules.toml) ───────────────────────────────
// TOML은 snake_case가 정본이다. 여기에 rename_all = "camelCase"를 걸면
// `missing field`로 죽는다 (6A에서 겪었다).

#[derive(Debug, Deserialize, Clone)]
pub struct DraftBonus {
    pub round1: f64,
    pub round2: f64,
    pub round3plus: f64,
    pub undrafted: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct InitRules {
    pub base: f64,
    pub personality_spread: f64,
    pub draft_bonus: DraftBonus,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DecayRules {
    pub on_move: f64,
    pub apart_per_season: f64,
    pub apart_floor: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ManagerWeekly {
    pub win: f64,
    pub loss: f64,
    pub quality_start: f64,
    pub blowup: f64,
    pub complete_shutout: f64,
    pub training_skip: f64,
    pub growth: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CoachWeekly {
    pub own_area_training: f64,
    pub training_skip: f64,
    pub growth: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TeammateWeekly {
    pub team_win: f64,
    pub isolated_ace: f64,
    pub growth: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RivalWeekly {
    pub faced_and_won: f64,
    pub faced_and_lost: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WeeklyRules {
    pub manager: ManagerWeekly,
    pub coach: CoachWeekly,
    pub teammate: TeammateWeekly,
    pub rival: RivalWeekly,
    pub growth_threshold: f64,
    pub quality_era: f64,
    pub blowup_era: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SeasonCriteria {
    pub good_era: f64,
    pub bad_era: f64,
    pub good_rank_pct: f64,
    pub bad_rank_pct: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SeasonRules {
    pub manager_good: f64,
    pub manager_bad: f64,
    pub coach_good: f64,
    pub coach_bad: f64,
    pub owner_good: f64,
    pub owner_bad: f64,
    pub teammate_together: f64,
    pub criteria: SeasonCriteria,
}

#[derive(Debug, Deserialize, Clone)]
pub struct EffectRules {
    pub manager_role_ovr_per_step: f64,
    pub coach_training_per_step: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RelationRules {
    pub init: InitRules,
    pub decay: DecayRules,
    pub weekly: WeeklyRules,
    pub season: SeasonRules,
    pub effect: EffectRules,
}

// ── 효과 계산 (6C-5) ──────────────────────────────────────────────
// 관계값 → 실제 판정 보정. TS가 계산하지 않는 이유는 CLAUDE.md 규칙(게임 로직은
// Rust)이고, 규칙 파일을 읽는 곳을 한 군데로 묶기 위해서다.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationEffectParams {
    pub rules: RelationRules,
    /// 감독 관계값. 없으면 중립으로 본다
    #[serde(default)]
    pub manager_value: i32,
    /// 이번 주 담당 영역 코치의 관계값
    #[serde(default)]
    pub coach_value: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationEffectResult {
    /// 역할 배정 시 OVR에 더할 값 (감독이 나를 어떻게 보는가)
    pub role_ovr_bias: f64,
    /// 훈련 효율 배율에 더할 값 (0.04 = +4%p)
    pub training_bonus: f64,
    pub manager_step: i32,
    pub coach_step: i32,
    pub manager_label: String,
    pub coach_label: String,
}

pub fn relation_effects(p: RelationEffectParams) -> RelationEffectResult {
    let e = &p.rules.effect;
    let m_step = label_step(p.manager_value);
    let c_step = label_step(p.coach_value);
    RelationEffectResult {
        role_ovr_bias: m_step as f64 * e.manager_role_ovr_per_step,
        training_bonus: c_step as f64 * e.coach_training_per_step,
        manager_step: m_step,
        coach_step: c_step,
        manager_label: relation_label(p.manager_value).0.to_string(),
        coach_label: relation_label(p.coach_value).0.to_string(),
    }
}

// ── 입출력 ────────────────────────────────────────────────────────
// TS와 주고받는 것은 camelCase다 (TOML 규칙과 반대라는 점에 주의).

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RelationRow {
    pub person_id: String,
    /// manager | coach | owner | teammate | rival
    pub kind: String,
    pub value: f64,
    #[serde(default = "default_contact")]
    pub contact: String,
    /// 코치 전문 영역 (staff.style). 담당 영역 훈련 판정에 쓴다
    #[serde(default)]
    pub specialty: String,
}

fn default_contact() -> String { "together".to_string() }

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyContext {
    /// 주인공이 이번 주 등판했는가. false면 등판 기반 항목이 전부 0이다
    #[serde(default)]
    pub pitched: bool,
    #[serde(default)]
    pub won: bool,
    #[serde(default)]
    pub era: f64,
    #[serde(default)]
    pub complete_shutout: bool,
    /// 소속팀이 이번 주 경기에서 이겼는가 (주인공 등판과 별개)
    #[serde(default)]
    pub team_won: bool,
    #[serde(default)]
    pub team_played: bool,
    #[serde(default)]
    pub ovr_delta: f64,
    #[serde(default)]
    pub training_done: bool,
    #[serde(default)]
    pub training_skipped: bool,
    /// 이번 주 훈련의 영역 — 코치 specialty와 일치할 때만 그 코치에게 가산
    #[serde(default)]
    pub training_area: String,
    /// 이번 주 맞대결한 라이벌 personId 목록
    #[serde(default)]
    pub faced_rivals: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyRelationParams {
    pub world_seed: f64,
    pub week: i64,
    pub rules: RelationRules,
    pub rows: Vec<RelationRow>,
    pub ctx: WeeklyContext,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationDelta {
    pub person_id: String,
    pub delta: i32,
    pub value: i32,
    pub prev_value: i32,
    pub label: String,
    pub prev_label: String,
    /// 라벨이 이번 주에 바뀌었는가 — 메시지를 띄울 유일한 근거다
    pub label_changed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyRelationResult {
    pub deltas: Vec<RelationDelta>,
    pub changed: usize,
}

fn make_delta(person_id: &str, prev: f64, next_raw: f64) -> RelationDelta {
    let prev_i = clamp_value(prev);
    let next_i = clamp_value(next_raw);
    let (label, _) = relation_label(next_i);
    let (prev_label, _) = relation_label(prev_i);
    RelationDelta {
        person_id: person_id.to_string(),
        delta: next_i - prev_i,
        value: next_i,
        prev_value: prev_i,
        label: label.to_string(),
        prev_label: prev_label.to_string(),
        label_changed: label != prev_label,
    }
}

/// 주간 관계 갱신. `contact == "together"`인 행만 움직인다 —
/// 헤어진 상대는 시즌 단위로만 감쇠하고, 종료된 관계는 동결이다.
pub fn weekly_relations(p: WeeklyRelationParams) -> WeeklyRelationResult {
    let w = &p.rules.weekly;
    let ctx = &p.ctx;
    let seed = p.world_seed as u64;
    let grew = ctx.ovr_delta >= w.growth_threshold;

    let mut deltas = Vec::new();

    for row in p.rows.iter() {
        if row.contact != "together" {
            continue;
        }
        let mut d = 0.0f64;

        match row.kind.as_str() {
            "manager" => {
                if ctx.pitched {
                    d += if ctx.won { w.manager.win } else { w.manager.loss };
                    if ctx.era < w.quality_era { d += w.manager.quality_start; }
                    if ctx.era > w.blowup_era { d += w.manager.blowup; }
                    if ctx.complete_shutout { d += w.manager.complete_shutout; }
                }
                if ctx.training_skipped { d += w.manager.training_skip; }
                if grew { d += w.manager.growth; }
            }
            "coach" => {
                // 전 코치에게 매주 붙이면 코치 6명이 다 같이 오른다 — 담당 영역일 때만.
                if ctx.training_done
                    && !ctx.training_area.is_empty()
                    && row.specialty == ctx.training_area
                {
                    d += w.coach.own_area_training;
                }
                if ctx.training_skipped { d += w.coach.training_skip; }
                if grew { d += w.coach.growth; }
            }
            "teammate" => {
                if ctx.team_played && ctx.team_won { d += w.teammate.team_win; }
                // 나는 호투했는데 팀이 진 주 — 에이스가 고립되는 감각
                if ctx.pitched && !ctx.won && ctx.era < w.quality_era {
                    d += w.teammate.isolated_ace;
                }
                if grew { d += w.teammate.growth; }
            }
            "rival" => {
                if !ctx.faced_rivals.iter().any(|id| id == &row.person_id) {
                    // 맞대결 없는 주는 라이벌 관계가 움직이지 않는다
                } else {
                    let base = if ctx.won { w.rival.faced_and_won } else { w.rival.faced_and_lost };
                    // 같은 결과라도 성향이 부호를 뒤집는다 —
                    // 승부욕·자존심이 센 상대는 내가 이기면 적개심이고,
                    // 품이 넓은 상대는 같은 사건이 인정이 된다.
                    let disp = disposition(seed, &row.person_id);
                    let hostile = disp.competitive + disp.prideful > disp.nurturing * 2;
                    d += if hostile { -base } else { base };
                }
            }
            // owner는 주간 항목이 없다 — 시즌 성적으로만 움직인다
            _ => {}
        }

        if d == 0.0 { continue; }
        deltas.push(make_delta(&row.person_id, row.value, row.value + d));
    }

    let changed = deltas.len();
    WeeklyRelationResult { deltas, changed }
}

// ── 시즌 종료 ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonRelationParams {
    // world_seed가 없다 — 시즌 판정은 성적으로만 갈리고 난수를 쓰지 않는다
    pub rules: RelationRules,
    pub rows: Vec<RelationRow>,
    /// 주인공의 이번 시즌 ERA
    #[serde(default)]
    pub era: f64,
    /// 소속팀 리그 순위 백분위 (0.0 = 1위, 1.0 = 꼴찌)
    #[serde(default)]
    pub team_rank_pct: f64,
    /// 등판이 없던 시즌이면 개인 성적 판정을 건너뛴다
    #[serde(default)]
    pub pitched_any: bool,
}

/// 시즌 종료 처리 — together는 총평 가산, apart는 감쇠.
/// 주간 갱신과 분리한 이유: "이번 시즌 어땠나"는 주 단위로 쪼개면 판정이 흐려진다.
pub fn season_relations(p: SeasonRelationParams) -> WeeklyRelationResult {
    let s = &p.rules.season;
    let dec = &p.rules.decay;
    let c = &s.criteria;

    // 개인 성적과 팀 성적을 각각 좋음/나쁨/보통으로 접는다
    let personal: i32 = if !p.pitched_any { 0 }
        else if p.era <= c.good_era { 1 }
        else if p.era >= c.bad_era { -1 }
        else { 0 };
    let team: i32 = if p.team_rank_pct <= c.good_rank_pct { 1 }
        else if p.team_rank_pct >= c.bad_rank_pct { -1 }
        else { 0 };

    let mut deltas = Vec::new();

    for row in p.rows.iter() {
        let next = match row.contact.as_str() {
            "together" => {
                // 감독·코치는 개인 성적을, 구단주는 팀 성적을 본다.
                // 구단주가 개인 성적을 보게 하면 약팀 에이스가 항상 사랑받는다.
                let d = match row.kind.as_str() {
                    "manager"  => if personal > 0 { s.manager_good } else if personal < 0 { s.manager_bad } else { 0.0 },
                    "coach"    => if personal > 0 { s.coach_good } else if personal < 0 { s.coach_bad } else { 0.0 },
                    "owner"    => if team > 0 { s.owner_good } else if team < 0 { s.owner_bad } else { 0.0 },
                    "teammate" => s.teammate_together,
                    _ => 0.0,
                };
                if d == 0.0 { continue; }
                row.value + d
            }
            "apart" => {
                let mut faded = row.value * dec.apart_per_season;
                // 기하 감쇠는 정수 반올림에서 멈춘다 — 5 × 0.9 = 4.5 → 다시 5.
                // 값이 안 줄면 1만큼 0쪽으로 민다. apart는 **반드시 0으로 수렴해야**
                // 한다. 안 그러면 20년 전 헤어진 사람의 관계가 영원히 남는다.
                if clamp_value(faded) == clamp_value(row.value) && row.value != 0.0 {
                    faded = row.value - row.value.signum();
                }
                // ±1이 끝까지 남지 않게 바닥에서 떨군다
                if faded.abs() < dec.apart_floor { 0.0 } else { faded }
            }
            // ended는 동결 — 기록이므로 건드리지 않는다
            _ => continue,
        };
        let d = make_delta(&row.person_id, row.value, next);
        if d.delta == 0 { continue; }
        deltas.push(d);
    }

    let changed = deltas.len();
    WeeklyRelationResult { deltas, changed }
}

// ── 초기값 · 이동 감쇠 ────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InitPerson {
    pub person_id: String,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitRelationParams {
    pub world_seed: f64,
    pub rules: RelationRules,
    pub people: Vec<InitPerson>,
    /// 주인공 지명 라운드. 0 = 미지명/해당 없음. 감독에게만 붙는다
    #[serde(default)]
    pub draft_round: i64,
    /// 지명 절차 자체를 거치지 않았으면(고교 입학 등) 미지명 페널티를 주지 않는다
    #[serde(default)]
    pub drafted_context: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitRelationResult {
    pub rows: Vec<InitRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitRow {
    pub person_id: String,
    pub kind: String,
    pub value: i32,
    pub label: String,
}

/// 새로 만난 사람들의 초기 관계값. 사용자 확정: **중립 0 + 소폭 편차**.
pub fn init_relations(p: InitRelationParams) -> InitRelationResult {
    let init = &p.rules.init;
    let seed = p.world_seed as u64;

    let draft_bonus = if !p.drafted_context { 0.0 } else {
        match p.draft_round {
            1 => init.draft_bonus.round1,
            2 => init.draft_bonus.round2,
            r if r >= 3 => init.draft_bonus.round3plus,
            _ => init.draft_bonus.undrafted,
        }
    };

    let rows = p.people.iter().map(|person| {
        let disp = disposition(seed, &person.person_id);
        // nurturing이 높으면 처음부터 호의적, territorial이 높으면 경계한다.
        // −spread ~ +spread 범위로 정규화한다
        let lean = (disp.nurturing - disp.territorial) as f64 / 100.0;
        let mut v = init.base + lean * init.personality_spread;
        if person.kind == "manager" { v += draft_bonus; }
        let value = clamp_value(v);
        let (label, _) = relation_label(value);
        InitRow {
            person_id: person.person_id.clone(),
            kind: person.kind.clone(),
            value,
            label: label.to_string(),
        }
    }).collect();

    InitRelationResult { rows }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveDecayParams {
    pub rules: RelationRules,
    pub rows: Vec<RelationRow>,
}

/// 팀 이동 감쇠. 사용자 확정: **감쇠 후 보존** — 행은 남고 값만 0쪽으로 당긴다.
/// 재회하면 이 값에서 재개되므로 "옛 감독을 프로에서 다시 만나는" 서사가 산다.
pub fn move_decay(p: MoveDecayParams) -> WeeklyRelationResult {
    let f = p.rules.decay.on_move;
    let mut deltas = Vec::new();
    for row in p.rows.iter() {
        // ended는 이미 종료된 기록이라 이동과 무관하다
        if row.contact == "ended" { continue; }
        let d = make_delta(&row.person_id, row.value, row.value * f);
        if d.delta == 0 { continue; }
        deltas.push(d);
    }
    let changed = deltas.len();
    WeeklyRelationResult { deltas, changed }
}

// ── 라벨 표 노출 (TS와 대조용) ────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelBand {
    pub min: i32,
    pub max: i32,
    pub label: String,
    pub tone: String,
}

pub fn label_table() -> Vec<LabelBand> {
    RELATION_LABELS.iter().map(|(lo, hi, label, tone)| LabelBand {
        min: *lo, max: *hi, label: label.to_string(), tone: tone.to_string(),
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// **생성된 JSON을 읽는다** — TOML을 직접 읽지 않는다.
    /// 런타임이 실제로 먹는 것이 이 JSON이고, 그러면 이 테스트가
    /// `TOML → build_refs_from_seeds.py → JSON → Rust` 경로 전체를 검증한다.
    /// (6B에서 스크립트를 안 돌려 옛 규칙으로 도는 걸 두 번 겪었다)
    fn rules() -> RelationRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../resource/data/master/players/relationship_rules.json"
        )).expect("relationship_rules.json 없음 — python scripts/build_refs_from_seeds.py 실행 필요");
        serde_json::from_str(&src).expect("relationship_rules.json 파싱 실패 — TOML과 구조체가 어긋났다")
    }

    fn row(id: &str, kind: &str, value: f64) -> RelationRow {
        RelationRow {
            person_id: id.to_string(), kind: kind.to_string(), value,
            contact: "together".to_string(), specialty: String::new(),
        }
    }

    #[test]
    fn 라벨_경계에_구멍이_없다() {
        // −100~100 전 구간이 정확히 하나의 라벨에 속해야 한다.
        // 구멍이 있으면 특정 값에서 화면이 "중립" 폴백으로 조용히 빠진다.
        for v in -100..=100 {
            let hits = RELATION_LABELS.iter().filter(|(lo, hi, _, _)| v >= *lo && v <= *hi).count();
            assert_eq!(hits, 1, "value {v} 가 {hits}개 구간에 속한다");
        }
        assert_eq!(relation_label(0).0, "중립");
        assert_eq!(relation_label(65).0, "각별");
        assert_eq!(relation_label(-61).0, "적대");
        // clamp 밖도 안전
        assert_eq!(relation_label(9999).0, "각별");
        assert_eq!(relation_label(-9999).0, "적대");
    }

    #[test]
    fn 라벨_단계는_중립을_0으로_센다() {
        assert_eq!(label_step(0), 0, "중립이 0이 아니다");
        assert_eq!(label_step(10), 0);
        assert_eq!(label_step(11), 1, "우호 = +1");
        assert_eq!(label_step(50), 2, "신뢰 = +2");
        assert_eq!(label_step(100), 3, "각별 = +3");
        assert_eq!(label_step(-11), -1, "서먹 = -1");
        assert_eq!(label_step(-40), -2, "불신 = -2");
        assert_eq!(label_step(-100), -3, "적대 = -3");
    }

    #[test]
    fn 효과는_라벨_단계에_비례한다() {
        let r = rules();
        let per = r.effect.manager_role_ovr_per_step;
        let close = relation_effects(RelationEffectParams {
            rules: r.clone(), manager_value: 80, coach_value: 80,
        });
        let hostile = relation_effects(RelationEffectParams {
            rules: r.clone(), manager_value: -80, coach_value: -80,
        });
        let neutral = relation_effects(RelationEffectParams {
            rules: r.clone(), manager_value: 0, coach_value: 0,
        });
        assert_eq!(close.role_ovr_bias, per * 3.0, "각별이 최대 보정이 아니다");
        assert_eq!(hostile.role_ovr_bias, -per * 3.0);
        assert_eq!(neutral.role_ovr_bias, 0.0, "중립이 0이 아니다");
        assert!(close.training_bonus > 0.0 && hostile.training_bonus < 0.0);
        assert_eq!(close.manager_label, "각별");
        assert_eq!(hostile.coach_label, "적대");
    }

    #[test]
    fn 초기값은_중립_근처다() {
        let r = rules();
        let people: Vec<InitPerson> = (0..200).map(|i| InitPerson {
            person_id: format!("PLY_{i:03}"), kind: "teammate".to_string(),
        }).collect();
        let out = init_relations(InitRelationParams {
            world_seed: 4242.0, rules: r.clone(), people, draft_round: 0, drafted_context: false,
        });
        let spread = r.init.personality_spread as i32;
        assert!(out.rows.iter().all(|x| x.value.abs() <= spread),
            "초기값이 ±{spread}를 벗어났다");
        // 전원이 정확히 0이면 편차가 안 걸린 것이다 (성향이 안 먹은 상태)
        let nonzero = out.rows.iter().filter(|x| x.value != 0).count();
        assert!(nonzero > 100, "성향 편차가 거의 안 걸렸다: {nonzero}/200");
        // 한쪽으로 쏠리면 안 된다
        let pos = out.rows.iter().filter(|x| x.value > 0).count();
        assert!((60..=140).contains(&pos), "양수 쪽으로 쏠렸다: {pos}/200");
    }

    #[test]
    fn 초기값은_결정적이다() {
        let r = rules();
        let people = vec![InitPerson { person_id: "MGR_1".into(), kind: "manager".into() }];
        let mk = |seed: f64| init_relations(InitRelationParams {
            world_seed: seed, rules: r.clone(), people: people.clone(),
            draft_round: 1, drafted_context: true,
        }).rows[0].value;
        assert_eq!(mk(4242.0), mk(4242.0), "같은 시드가 다른 값을 냈다");
        assert_ne!(mk(4242.0), mk(9999.0), "시드가 달라도 같은 값이다 — 시드가 안 먹었다");
        // 1라운드 지명은 초기 호감이 붙는다
        let r1 = mk(4242.0);
        let undrafted = init_relations(InitRelationParams {
            world_seed: 4242.0, rules: r.clone(), people: people.clone(),
            draft_round: 0, drafted_context: true,
        }).rows[0].value;
        assert!(r1 > undrafted, "1라운드({r1})가 미지명({undrafted})보다 낮다");
    }

    #[test]
    fn 담당_영역_코치만_오른다() {
        let r = rules();
        let mut pitching = row("COA_P", "coach", 0.0);
        pitching.specialty = "투수".to_string();
        let mut batting = row("COA_B", "coach", 0.0);
        batting.specialty = "타격".to_string();

        let out = weekly_relations(WeeklyRelationParams {
            world_seed: 1.0, week: 5, rules: r,
            rows: vec![pitching, batting],
            ctx: WeeklyContext {
                training_done: true, training_area: "투수".to_string(),
                ..Default::default()
            },
        });
        assert_eq!(out.deltas.len(), 1, "담당 아닌 코치까지 움직였다");
        assert_eq!(out.deltas[0].person_id, "COA_P");
        assert!(out.deltas[0].delta > 0);
    }

    #[test]
    fn 헤어진_상대는_주간_갱신을_안_받는다() {
        let r = rules();
        let mut apart = row("MGR_1", "manager", 40.0);
        apart.contact = "apart".to_string();
        let mut ended = row("MGR_2", "manager", 40.0);
        ended.contact = "ended".to_string();

        let out = weekly_relations(WeeklyRelationParams {
            world_seed: 1.0, week: 5, rules: r,
            rows: vec![apart, ended, row("MGR_3", "manager", 40.0)],
            ctx: WeeklyContext { pitched: true, won: true, era: 1.5, ..Default::default() },
        });
        assert_eq!(out.deltas.len(), 1, "together가 아닌 상대가 움직였다");
        assert_eq!(out.deltas[0].person_id, "MGR_3");
    }

    #[test]
    fn 이동_감쇠는_보존이지_리셋이_아니다() {
        let r = rules();
        let out = move_decay(MoveDecayParams {
            rules: r.clone(),
            rows: vec![row("MGR_1", "manager", 70.0), row("PLY_1", "teammate", -40.0)],
        });
        let mgr = out.deltas.iter().find(|d| d.person_id == "MGR_1").unwrap();
        let ply = out.deltas.iter().find(|d| d.person_id == "PLY_1").unwrap();
        let f = r.decay.on_move;
        assert_eq!(mgr.value, (70.0 * f).round() as i32);
        assert_eq!(ply.value, (-40.0 * f).round() as i32);
        assert!(mgr.value > 0, "감쇠가 리셋이 됐다");
        assert!(ply.value < 0, "음수 관계의 부호가 뒤집혔다");
    }

    #[test]
    fn apart는_시즌마다_감쇠하고_결국_0이_된다() {
        let r = rules();
        let mut v = 70.0 * r.decay.on_move;   // 이적 직후
        for _ in 0..30 {
            let mut rw = row("MGR_1", "manager", v);
            rw.contact = "apart".to_string();
            let out = season_relations(SeasonRelationParams {
                rules: r.clone(), rows: vec![rw],
                era: 0.0, team_rank_pct: 0.5, pitched_any: false,
            });
            if out.deltas.is_empty() { break; }
            v = out.deltas[0].value as f64;
        }
        assert_eq!(v as i32, 0, "30시즌이 지나도 0으로 안 갔다: {v}");
    }

    #[test]
    fn 구단주는_팀성적_감독은_개인성적을_본다() {
        let r = rules();
        // 개인은 좋고 팀은 나쁜 시즌 — 약팀 에이스
        let out = season_relations(SeasonRelationParams {
            rules: r.clone(),
            rows: vec![row("MGR_1", "manager", 0.0), row("OWN_1", "owner", 0.0)],
            era: 2.10, team_rank_pct: 0.90, pitched_any: true,
        });
        let mgr = out.deltas.iter().find(|d| d.person_id == "MGR_1").unwrap();
        let own = out.deltas.iter().find(|d| d.person_id == "OWN_1").unwrap();
        assert!(mgr.delta > 0, "개인 성적이 좋은데 감독이 안 올랐다");
        assert!(own.delta < 0, "팀 성적이 나쁜데 구단주가 안 내렸다");
    }

    /// 사용자 확정 "중간" = 한 시즌 순변화 대략 ±25 = 라벨 1~2단계.
    /// 이 테스트는 그 감각이 실제로 나오는지를 본다 — 튜닝이 어긋나면 여기서 걸린다.
    #[test]
    fn 한_시즌_변화폭이_라벨_1에서_2단계다() {
        let r = rules();
        // 승률 60%, 등판 25주, 절반은 호투인 평범하게 좋은 시즌
        let mut value = 0.0f64;
        for wk in 0..25 {
            let won = wk % 5 < 3;
            let out = weekly_relations(WeeklyRelationParams {
                world_seed: 1.0, week: wk, rules: r.clone(),
                rows: vec![row("MGR_1", "manager", value)],
                ctx: WeeklyContext {
                    pitched: true, won,
                    era: if wk % 2 == 0 { 2.0 } else { 4.0 },
                    team_played: true, team_won: won,
                    training_done: true,
                    ..Default::default()
                },
            });
            if let Some(d) = out.deltas.first() { value = d.value as f64; }
        }
        let season_out = season_relations(SeasonRelationParams {
            rules: r.clone(),
            rows: vec![row("MGR_1", "manager", value)],
            era: 3.10, team_rank_pct: 0.35, pitched_any: true,
        });
        if let Some(d) = season_out.deltas.first() { value = d.value as f64; }

        let final_v = value as i32;
        assert!((15..=40).contains(&final_v),
            "좋은 시즌 하나의 순변화가 {final_v} — 목표 ±25 감각에서 벗어났다");
        let (label, _) = relation_label(final_v);
        assert!(label == "우호" || label == "신뢰",
            "한 시즌 뒤 라벨이 {label} — 1~2단계 이동이 아니다");
    }

    #[test]
    fn 나쁜_시즌은_반대로_내려간다() {
        let r = rules();
        let mut value = 0.0f64;
        for wk in 0..25 {
            let out = weekly_relations(WeeklyRelationParams {
                world_seed: 1.0, week: wk, rules: r.clone(),
                rows: vec![row("MGR_1", "manager", value)],
                ctx: WeeklyContext {
                    pitched: true, won: wk % 5 == 0, era: 6.5,
                    team_played: true, team_won: wk % 5 == 0,
                    training_skipped: true,
                    ..Default::default()
                },
            });
            if let Some(d) = out.deltas.first() { value = d.value as f64; }
        }
        assert!(value < -20.0, "부진 시즌인데 {value}까지밖에 안 내려갔다");
    }

    #[test]
    fn 라이벌은_성향에_따라_부호가_갈린다() {
        let r = rules();
        // 200명을 같은 사건(내가 이김)에 노출시키면 양쪽이 다 나와야 한다
        let rows: Vec<RelationRow> = (0..200).map(|i| {
            let mut rw = row(&format!("RIV_{i:03}"), "rival", 0.0);
            rw.contact = "together".to_string();
            rw
        }).collect();
        let ids: Vec<String> = rows.iter().map(|r| r.person_id.clone()).collect();
        let out = weekly_relations(WeeklyRelationParams {
            world_seed: 77.0, week: 3, rules: r,
            rows,
            ctx: WeeklyContext {
                pitched: true, won: true, era: 1.0,
                faced_rivals: ids, ..Default::default()
            },
        });
        let pos = out.deltas.iter().filter(|d| d.delta > 0).count();
        let neg = out.deltas.iter().filter(|d| d.delta < 0).count();
        assert!(pos > 20 && neg > 20,
            "성향이 부호를 안 가른다 — 인정 {pos} / 적개심 {neg}");
    }

    #[test]
    fn 값은_범위를_벗어나지_않는다() {
        let r = rules();
        let mut value = 95.0f64;
        for wk in 0..60 {
            let out = weekly_relations(WeeklyRelationParams {
                world_seed: 1.0, week: wk, rules: r.clone(),
                rows: vec![row("MGR_1", "manager", value)],
                ctx: WeeklyContext {
                    pitched: true, won: true, era: 0.5, complete_shutout: true,
                    ..Default::default()
                },
            });
            if let Some(d) = out.deltas.first() { value = d.value as f64; }
        }
        assert_eq!(value as i32, 100, "상한을 넘거나 못 도달했다: {value}");
    }
}

impl Default for WeeklyContext {
    fn default() -> Self {
        WeeklyContext {
            pitched: false, won: false, era: 0.0, complete_shutout: false,
            team_won: false, team_played: false, ovr_delta: 0.0,
            training_done: false, training_skipped: false,
            training_area: String::new(), faced_rivals: Vec::new(),
        }
    }
}
