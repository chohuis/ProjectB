//! 임시 진단 도구(커밋 대상 아님) — 실제 게임 진행(`advance()` 1회 호출,
//! 즉 플레이어가 "다음으로" 누를 때마다 발생하는 단위)의 실측 소요 시간을
//! 잰다. `balance_harness`는 여러 시즌을 통째로 압축해 돌리는 벤치용이라
//! "한 번의 진행 조작이 실제로 얼마나 걸리는지"는 별도로 재야 알 수 있다.

use std::time::{Duration, Instant};

use engine::data::{content, repository, slot};
use serde_json::Value;

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
        "event" => {
            let payload: Value = serde_json::from_str(payload_raw)?;
            payload["choices"][0]["id"].as_str().unwrap_or("").to_string()
        }
        _ => "확인".to_string(),
    })
}

fn main() -> anyhow::Result<()> {
    let target_seasons: i64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(2);

    let content_conn = content::open("content.db")?;
    let mut slot_conn = slot::open_in_memory()?;
    let seed = 424242i64;
    slot_conn.execute("UPDATE meta SET world_seed = ?1", [seed])?;

    let t0 = Instant::now();
    repository::generate_initial_world(&mut slot_conn, &content_conn, seed)?;
    println!("generate_initial_world (172팀 로스터+일정 생성, 새 게임 시작 1회 비용): {:?}", t0.elapsed());

    let hs_team: String = content_conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' ORDER BY id LIMIT 1", [], |r| r.get(0))?;
    repository::create_protagonist(&slot_conn, &content_conn, seed, "벤치", "우완", &hs_team, "강속구형", None)?;
    repository::set_protagonist_training(&slot_conn, "strength", "bullpen", "보통", None, None)?;

    let mut call_count = 0u32;
    let mut total = Duration::ZERO;
    let mut max_call = Duration::ZERO;
    let mut max_call_day = 0i64;
    let mut buckets: Vec<(Duration, i64, i64)> = Vec::new(); // (elapsed, before_day, after_day)
    let mut consecutive_empty = 0;

    loop {
        let before_day: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
        let t = Instant::now();
        let pending = repository::advance(&mut slot_conn, &content_conn)?;
        let elapsed = t.elapsed();
        let after_day: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;

        call_count += 1;
        total += elapsed;
        if elapsed > max_call {
            max_call = elapsed;
            max_call_day = before_day;
        }
        buckets.push((elapsed, before_day, after_day));

        if pending.is_empty() {
            let retired: i64 = slot_conn.query_row("SELECT retired FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap_or(0);
            if retired == 1 {
                break;
            }
            consecutive_empty += 1;
        } else {
            consecutive_empty = 0;
            let mut retired_now = false;
            for action in pending {
                let choice = default_choice(&action.kind, &action.payload)?;
                let is_retirement = action.kind == "retirement";
                repository::resolve_choice(&slot_conn, &content_conn, seed, &action.id, &choice)?;
                if is_retirement {
                    retired_now = true;
                }
            }
            if retired_now {
                break;
            }
        }

        let season: i64 = slot_conn
            .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |r| r.get::<_, String>(0))
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        if season >= target_seasons || consecutive_empty >= 5 {
            break;
        }
    }

    println!("\n=== advance() 호출 {call_count}회 (시즌 상한 {target_seasons}) ===");
    println!("총 소요: {total:?}");
    println!("호출당 평균: {:?}", total / call_count.max(1));
    println!("최대 단일 호출: {max_call:?} (day {max_call_day} 시점에서 시작)");

    buckets.sort_by_key(|(d, ..)| std::cmp::Reverse(*d));
    println!("\n느린 순 상위 10개 호출:");
    for (d, before, after) in buckets.iter().take(10) {
        println!("  {d:?}  day {before} -> {after} ({}일 진행)", after - before);
    }

    let total_days_advanced = buckets.iter().map(|(_, b, a)| a - b).sum::<i64>();
    println!("\n총 진행 일수: {total_days_advanced}일 (advance() {call_count}회)");
    println!("실제 진행 일수 기준 일당 평균: {:?}", total / total_days_advanced.max(1) as u32);

    Ok(())
}
