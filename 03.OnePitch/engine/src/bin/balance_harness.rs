//! I8 1차분 — [05_밸런스](../../../03_설계/05_밸런스.md) §4 "검증 방법론".
//! `verify_*.rs`류(임시, 검증 후 삭제)와 달리 **이 하네스는 영구 도구**다 —
//! 밸런스 상수를 손볼 때마다 다시 돌려보는 반복 워크플로("상수 초안 →
//! 하네스 N회 → 분포 리포트 → 기준 이탈 시 조정 → 반복")를 지원해야
//! 하므로 삭제하지 않는다.
//!
//! 콘텐츠 저작(이벤트·업적 등)은 아직 하나도 없어(I8 2·3차분 이후) 이번
//! 하네스는 **배경 시뮬+주인공 매치+시장/진로/은퇴 엔진만으로** 커리어를
//! 자동 완주시킨다 — PendingAction 응답은 결정적 기본 정책(모든 경기
//! "자동" 모드, 부상 치료 "재활", 계약/트레이드/드래프트 즉시 수락,
//! 진로 갈림길 옵션 중 첫 번째)으로 고정. 실제 플레이어의 선택 편차는
//! 반영 못 하지만, "엔진만으로 몇 시즌쯤 버티다 은퇴하는지·등급이
//! 남발되지 않는지·노쇠가 실제로 체감되는지" 같은 §4 통과 기준은 이
//! 정도로도 검증 가능.
//!
//! 사용법: `cargo run --release --bin balance_harness -- [시행횟수] [시즌상한]`
//! (기본 5회 × 시즌상한 10). **실측 결과 시즌 1개(배경 172팀 전체 포함)
//! 시뮬레이션에 대략 15~20초가 걸림** — §4가 예시로 든 "1,000회"는
//! 이 실행 환경에선 비현실적(1,000×20시즌×~18초 ≈ 5일)이라, 기본값은
//! "빠른 스모크 테스트"용으로 작게 잡고 실행 시간을 감수할 수 있으면
//! 인자로 늘려 쓰게 함(정확한 시행 횟수 자체가 원래 "미정"인 열린
//! 세부, §5).

use std::collections::HashMap;
use std::env;

use engine::data::{content, repository, slot};
use rusqlite::Connection;
use serde_json::Value;

const ARCHETYPES: [&str; 4] = ["강속구형", "제구형", "체력형", "돌부처형"];

struct TrialResult {
    archetype: String,
    finished: bool, // 시즌상한 안에 은퇴까지 도달했는지
    retirement_reason: Option<String>,
    seasons_reached: i64,
    grade_counts: HashMap<String, i64>,
    total_games: i64,
    injury_count: i64,
    start_speed: f64,
    end_speed: f64,
    start_control: f64,
    end_control: f64,
    events_fired: i64,
    achievements_unlocked: i64,
}

/// PendingAction 하나에 대한 결정적 기본 응답 — 실제 플레이어 판단은
/// 반영 못 하지만, "엔진이 최소한 스스로 끝까지 굴러가는지"를 보는
/// 하네스 목적엔 이 정도 단순화로 충분(§4 "워크플로" 참고).
fn default_choice(kind: &str, payload_raw: &str) -> anyhow::Result<String> {
    Ok(match kind {
        "game" => "자동".to_string(),
        "injuryTreatment" => "재활".to_string(),
        "contractNego" => {
            let payload: Value = serde_json::from_str(payload_raw)?;
            let team = payload["offers"][0]["team_id"].as_str().unwrap_or("");
            format!("accept:{team}")
        }
        "tradeDecision" => "accept".to_string(),
        "careerChoice" => {
            let payload: Value = serde_json::from_str(payload_raw)?;
            payload["options"][0].as_str().unwrap_or("독립").to_string()
        }
        // I8 1차분(콘텐츠 저작 파이프라인) — 항상 첫 번째 선택지(다른 다중
        // 선택 kind와 같은 결의 단순화, 실제 플레이어 편차는 반영 못 함).
        "event" => {
            let payload: Value = serde_json::from_str(payload_raw)?;
            payload["choices"][0]["id"].as_str().unwrap_or("").to_string()
        }
        _ => "확인".to_string(), // draft·retirement — 통보 확인뿐
    })
}

fn stat(slot_conn: &Connection, name: &str) -> anyhow::Result<f64> {
    let raw: String = slot_conn.query_row("SELECT stats FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let v: Value = serde_json::from_str(&raw)?;
    Ok(v.get(name).and_then(|x| x.as_f64()).unwrap_or(50.0))
}

fn run_trial(content_conn: &Connection, seed: i64, archetype: &str, max_seasons: i64) -> anyhow::Result<TrialResult> {
    let mut slot_conn = slot::open_in_memory()?;
    slot_conn.execute("UPDATE meta SET world_seed = ?1", [seed])?;
    repository::generate_initial_world(&mut slot_conn, content_conn, seed)?;

    let hs_team: String = content_conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' ORDER BY id LIMIT 1", [], |r| r.get(0))?;
    repository::create_protagonist(&slot_conn, content_conn, seed, "하네스", "우완", &hs_team, archetype, None)?;
    // 훈련 슬롯을 안 정하면 process_protagonist_week가 아무것도 안 키운다
    // (기존 테스트 문서: "no training config set -> stats should never
    // change") — 실제 플레이어라면 반드시 한 번은 정하므로, 하네스도
    // 균형 잡힌 기본 배분 하나로 계속 고정(구속 주력·구위/제구 보조).
    repository::set_protagonist_training(&slot_conn, "구속", ["구위", "제구"], "보통", None)?;

    let start_speed = stat(&slot_conn, "구속")?;
    let start_control = stat(&slot_conn, "제구")?;

    let mut finished = false;
    let mut consecutive_empty = 0;
    loop {
        let pending = repository::advance(&mut slot_conn, content_conn)?;
        if pending.is_empty() {
            // advance()의 MAX_DAYS_PER_CALL(366일, 시즌 최대 길이)은 "이 호출"의 안전장치일
            // 뿐 진짜 끝이 아니다 — 한동안 정지점이 없어도(예: 고교 대회
            // 조기 탈락 후 다음 시즌 일정이 새로 생기기 전까지) 계속
            // 부르면 다시 진행된다. 여러 번 연속으로 비어있으면 그때는
            // 진짜 막힌 것으로 보고 멈춘다.
            let retired: i64 = slot_conn.query_row("SELECT retired FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap_or(0);
            if retired == 1 {
                finished = true;
                break;
            }
            consecutive_empty += 1;
        } else {
            consecutive_empty = 0;
            let mut retired_now = false;
            for action in pending {
                let choice = default_choice(&action.kind, &action.payload)?;
                let is_retirement = action.kind == "retirement";
                repository::resolve_choice(&slot_conn, content_conn, seed, &action.id, &choice)?;
                if is_retirement {
                    retired_now = true;
                }
            }
            if retired_now {
                finished = true;
                break;
            }
        }
        // 시즌 상한·연속 공백 상한은 pending이 비어있었든 아니든 매
        // 반복마다 확인해야 한다 — 비어있던 호출 안에서도 advance()가
        // 내부적으로 최대 366일(시즌 하나 분량)을 조용히 전진시킬 수
        // 있어, 여기서 안 걸러지면 상한을 몇 시즌씩 건너뛸 수 있음.
        let season: i64 = slot_conn
            .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |r| r.get::<_, String>(0))
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        if season >= max_seasons || consecutive_empty >= 5 {
            break;
        }
    }

    let season_reached: i64 = slot_conn
        .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let retirement_reason: Option<String> =
        slot_conn.query_row("SELECT retirement_reason FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap_or(None);

    let mut grade_counts: HashMap<String, i64> = HashMap::new();
    let mut total_games = 0i64;
    {
        let mut stmt = slot_conn.prepare("SELECT detail FROM game_log")?;
        let details: Vec<String> = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        for raw in details {
            total_games += 1;
            if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                let grade = v.get("grade").and_then(|g| g.as_str()).unwrap_or("?").to_string();
                *grade_counts.entry(grade).or_insert(0) += 1;
            }
        }
    }

    let injury_raw: String = slot_conn.query_row("SELECT injury FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let injury_count = serde_json::from_str::<Value>(&injury_raw)
        .ok()
        .and_then(|v| v.get("history").and_then(|h| h.as_array().map(|a| a.len() as i64)))
        .unwrap_or(0);

    let end_speed = stat(&slot_conn, "구속")?;
    let end_control = stat(&slot_conn, "제구")?;

    // I8 1차분(콘텐츠 저작 파이프라인) 실증 — 이벤트가 실제로 발동하는지·
    // 업적이 실제로 달성되는지를 하네스 리포트에서도 확인할 수 있게.
    let events_fired: i64 =
        slot_conn.query_row("SELECT count(*) FROM career_events WHERE kind LIKE 'event:%'", [], |r| r.get(0))?;
    let achievements_unlocked: i64 =
        slot_conn.query_row("SELECT count(*) FROM achievement_progress WHERE achieved_day IS NOT NULL", [], |r| r.get(0))?;

    Ok(TrialResult {
        archetype: archetype.to_string(),
        finished,
        retirement_reason,
        seasons_reached: season_reached,
        grade_counts,
        total_games,
        injury_count,
        start_speed,
        end_speed,
        start_control,
        end_control,
        events_fired,
        achievements_unlocked,
    })
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    let trials: i64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(5);
    let max_seasons: i64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(10);

    let content_conn = content::open("content.db")?;
    let mut results = Vec::with_capacity(trials as usize);

    for i in 0..trials {
        let archetype = ARCHETYPES[(i as usize) % ARCHETYPES.len()];
        let seed = 900_000 + i;
        let r = run_trial(&content_conn, seed, archetype, max_seasons)?;
        println!(
            "trial {i:>4} seed={seed} archetype={archetype} finished={} reason={:?} seasons={} games={} injuries={} speed {:.1}->{:.1} control {:.1}->{:.1} events={} achievements={}",
            r.finished,
            r.retirement_reason,
            r.seasons_reached,
            r.total_games,
            r.injury_count,
            r.start_speed,
            r.end_speed,
            r.start_control,
            r.end_control,
            r.events_fired,
            r.achievements_unlocked
        );
        results.push(r);
    }

    println!("\n=== 요약 ({trials}회 시행, 시즌 상한 {max_seasons}) ===");

    let finished: Vec<&TrialResult> = results.iter().filter(|r| r.finished).collect();
    println!("은퇴까지 도달: {}/{trials} ({:.0}%)", finished.len(), finished.len() as f64 / trials as f64 * 100.0);
    if !finished.is_empty() {
        let seasons: Vec<i64> = finished.iter().map(|r| r.seasons_reached).collect();
        let mean = seasons.iter().sum::<i64>() as f64 / seasons.len() as f64;
        let min = *seasons.iter().min().unwrap();
        let max = *seasons.iter().max().unwrap();
        println!("커리어 길이(시즌) — 평균 {mean:.1} · 최소 {min} · 최대 {max} (§4 목표: 15~20)");

        let mut reason_counts: HashMap<String, i64> = HashMap::new();
        for r in &finished {
            *reason_counts.entry(r.retirement_reason.clone().unwrap_or_else(|| "?".to_string())).or_insert(0) += 1;
        }
        println!("은퇴 사유 분포: {reason_counts:?}");
    }

    let mut grade_totals: HashMap<String, i64> = HashMap::new();
    let mut total_games = 0i64;
    for r in &results {
        total_games += r.total_games;
        for (g, c) in &r.grade_counts {
            *grade_totals.entry(g.clone()).or_insert(0) += c;
        }
    }
    println!("등급 분포(전체 {total_games}경기): {grade_totals:?}");
    if let Some(&s_count) = grade_totals.get("S") {
        println!("S등급 비율: {:.1}% (§4 목표: 남발 안 되되 0은 아님)", s_count as f64 / total_games as f64 * 100.0);
    }

    let total_injuries: i64 = results.iter().map(|r| r.injury_count).sum();
    println!("평균 부상 이력 수: {:.2}건/커리어", total_injuries as f64 / trials as f64);

    let total_events: i64 = results.iter().map(|r| r.events_fired).sum();
    let total_achievements: i64 = results.iter().map(|r| r.achievements_unlocked).sum();
    println!("평균 이벤트 발동 수: {:.2}건/커리어 (I8 1차분 콘텐츠 파이프라인 실증)", total_events as f64 / trials as f64);
    println!("평균 업적 달성 수: {:.2}건/커리어", total_achievements as f64 / trials as f64);

    println!("\n--- 아키타입별 피지컬 하락(구속) ---");
    for archetype in ARCHETYPES {
        let subset: Vec<&TrialResult> = results.iter().filter(|r| r.archetype == archetype).collect();
        if subset.is_empty() {
            continue;
        }
        let avg_delta = subset.iter().map(|r| r.end_speed - r.start_speed).sum::<f64>() / subset.len() as f64;
        println!("{archetype}: 평균 구속 변화 {avg_delta:+.1} ({}건)", subset.len());
    }

    Ok(())
}
