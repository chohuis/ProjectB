use serde::{Deserialize, Serialize};
use crate::npc_sim::LcgRand;

// 타 리그 Named NPC 주간 합성 성적 생성기 (R3b, DESIGN.md §4.2)
// 실제 경기를 시뮬하지 않고, worldSeed 기반으로 매주 결정적인 perfData를 산출해
// 기존 npc_calc_weekly_growth 파이프라인에 그대로 흘려보낸다. 별도 저장소 없음 —
// (worldSeed, npcId, seasonYear, week)만으로 항상 같은 값이 나오는 순수 함수.

fn hash_str(s: &str) -> u32 {
    s.bytes().fold(0u32, |acc, b| acc.wrapping_mul(131).wrapping_add(b as u32))
}

fn npc_seed(world_seed: u32, npc_id: &str, season_year: i32) -> u32 {
    world_seed ^ hash_str(npc_id) ^ (season_year as u32).wrapping_mul(2654435761)
}

// OVR → 시즌 목표 라인 (DESIGN.md §11 "분포 파라미터" 확정, calcNpcPerfScore 역눈금과 감각 정렬)
fn target_era(ovr: f64) -> f64 {
    (6.5 - (ovr - 20.0) * 4.5 / 70.0).clamp(1.8, 7.5)
}
fn target_avg(ovr: f64) -> f64 {
    (0.180 + (ovr - 20.0) * 0.150 / 70.0).clamp(0.180, 0.340)
}

// 시드에서 파생된 2개 사인파 합성 — 주별 평균이 1.0 근처로 수렴하는 폼 곡선
fn form_params(seed: u32) -> (f64, f64, f64, f64, f64, f64) {
    let amp1 = 0.15 + LcgRand::new(seed ^ 0x1111).next() * 0.15;
    let freq1 = 0.15 + LcgRand::new(seed ^ 0x2222).next() * 0.25;
    let phase1 = LcgRand::new(seed ^ 0x3333).next() * std::f64::consts::TAU;
    let amp2 = 0.05 + LcgRand::new(seed ^ 0x4444).next() * 0.10;
    let freq2 = 0.6 + LcgRand::new(seed ^ 0x5555).next() * 0.6;
    let phase2 = LcgRand::new(seed ^ 0x6666).next() * std::f64::consts::TAU;
    (amp1, freq1, phase1, amp2, freq2, phase2)
}

fn weekly_multiplier(seed: u32, week: u32) -> f64 {
    let (a1, f1, p1, a2, f2, p2) = form_params(seed);
    let w = week as f64;
    let raw = 1.0 + a1 * (f1 * w + p1).sin() + a2 * (f2 * w + p2).sin();
    raw.clamp(0.6, 1.5)
}

// 결장 구간(합성 부상) — 시즌당 최대 1구간, 시드 해시로 직접 샘플링(상태 없음)
fn injury_window(seed: u32) -> Option<(u32, u32)> {
    if LcgRand::new(seed ^ 0x9999).next() >= 0.25 {
        return None;
    }
    let start = 5 + (LcgRand::new(seed ^ 0xAAAA).next() * 40.0) as u32; // W5~W45
    let dur = 1 + (LcgRand::new(seed ^ 0xBBBB).next() * 5.0) as u32;    // 1~6주
    Some((start, start + dur))
}

fn is_missed_week(seed: u32, week: u32) -> bool {
    matches!(injury_window(seed), Some((start, end)) if week >= start && week < end)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyntheticNpcInput {
    pub npc_id: String,
    pub ovr: f64,
    pub player_type: String, // "pitcher" | "batter"
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyntheticWeeklyPerfParams {
    pub world_seed: u32,
    pub season_year: i32,
    pub week: u32,
    pub npcs: Vec<SyntheticNpcInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyntheticNpcResult {
    pub npc_id: String,
    pub missed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub era: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batting_avg: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyntheticWeeklyPerfResult {
    pub results: Vec<SyntheticNpcResult>,
}

pub fn synthetic_weekly_perf(p: SyntheticWeeklyPerfParams) -> SyntheticWeeklyPerfResult {
    let results = p
        .npcs
        .iter()
        .map(|npc| {
            let seed = npc_seed(p.world_seed, &npc.npc_id, p.season_year);

            if is_missed_week(seed, p.week) {
                return SyntheticNpcResult { npc_id: npc.npc_id.clone(), missed: true, era: None, batting_avg: None };
            }

            let mult = weekly_multiplier(seed, p.week);
            if npc.player_type == "batter" {
                let avg = (target_avg(npc.ovr) * mult).clamp(0.120, 0.420);
                SyntheticNpcResult { npc_id: npc.npc_id.clone(), missed: false, era: None, batting_avg: Some(avg) }
            } else {
                // mult>1(호조)일수록 ERA는 낮아져야 하므로 나눗셈
                let era = (target_era(npc.ovr) / mult).clamp(0.50, 12.0);
                SyntheticNpcResult { npc_id: npc.npc_id.clone(), missed: false, era: Some(era), batting_avg: None }
            }
        })
        .collect();

    SyntheticWeeklyPerfResult { results }
}