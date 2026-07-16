//! I7 1차분 — [03_구조](../../../03_설계/03_구조.md) §5 "엔진 API 표면 =
//! 범용 쿼리 + 커맨드"의 최소 슬라이스. 목표는 [10_구현_Phase_계획](../../../03_설계/10_구현_Phase_계획.md)
//! I7 행의 완료 기준 "뉴게임→진행→경기→시즌종료가 실제 화면에서 끝까지
//! 동작"을 만족하는 딱 그만큼의 커맨드·쿼리만 — 4허브·전용화면(협상·
//! 트레이드·진로·드래프트·치료·은퇴)·매치의 다이아몬드/존그리드 비주얼은
//! 전부 후속 서브분(00_개요.md §5가 이미 "아트 단계"로 이월 명시한 항목들
//! 다수 포함).
//!
//! **세션 모델 — 전역 싱글톤, 이번 스코프의 의도적 단순화**: 여러 세이브
//! 슬롯을 동시에 열고 전환하는 것([02_데이터](../../../03_설계/02_데이터.md)
//! §4 "슬롯 수명주기" 커맨드군)은 이번 스코프 밖 — 지금은 앱 프로세스
//! 안에 세션이 하나뿐이라고 가정하고 `Mutex<Option<GameState>>` 전역
//! 상태 하나로 충분하다. 여러 슬롯 관리가 실제로 필요해지면(로드 화면 등)
//! 이 자리를 frb opaque 핸들로 승격하면 된다.
//!
//! **세이브 파일 영속성도 이번 스코프 밖** — `new_game`이 파일이 아니라
//! **인메모리** slot 연결을 만든다. "뉴게임→진행→경기→시즌종료"라는 완료
//! 기준 자체가 한 세션 안에서 끝까지 도달 가능한지만 증명하면 되고,
//! 앱 재시작 후 이어하기(`loadSlot`)는 별도 관심사라 후속으로 미룬다.
//!
//! **JSON 원시 통과**: `stats`·`contract`·`injury`·`live_state`·`pitches`
//! 같은 유연한 블롭은 아직 전용 frb 구조체로 안 쪼갰다 — 필드가 상태에
//! 따라 달라지고(예: `contract`는 아마추어/프로/FA마다 키가 다름) 전부
//! 타입화하려면 이번 한 서브분 안에서 감당하기엔 구조체 수가 너무 많다.
//! 대신 JSON 문자열 그대로 넘기고 Dart가 `dart:convert`로 **표시용으로만**
//! 읽는다 — 계산·판정은 여전히 전부 엔진 쪽에서 끝난 값이라 [03_구조](../../../03_설계/03_구조.md)
//! §3 "UI에 로직 0" 불변식은 깨지지 않는다(단순 필드 추출은 "계산·판정"이
//! 아님). 안정적인 필드(`pending_actions`의 id·kind 등)는 그대로 구조체로
//! 타입화했다.

use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension};

use crate::data::{content, match_session, repository, slot};

struct GameState {
    slot_conn: Connection,
    content_conn: Connection,
}

// `Connection`은 `Send`(스레드 간 이동 가능)이지만 `Sync`는 아니다 — `Mutex`가
// "한 번에 한 스레드만 접근"을 보장해주므로 전역 상태로 두기에 정확히 맞는 조합.
static STATE: Mutex<Option<GameState>> = Mutex::new(None);

fn with_state<T>(f: impl FnOnce(&GameState) -> anyhow::Result<T>) -> anyhow::Result<T> {
    let guard = STATE.lock().map_err(|_| anyhow::anyhow!("game state lock poisoned"))?;
    let state = guard.as_ref().ok_or_else(|| anyhow::anyhow!("no active game — call newGame first"))?;
    f(state)
}

fn with_state_mut<T>(f: impl FnOnce(&mut GameState) -> anyhow::Result<T>) -> anyhow::Result<T> {
    let mut guard = STATE.lock().map_err(|_| anyhow::anyhow!("game state lock poisoned"))?;
    let state = guard.as_mut().ok_or_else(|| anyhow::anyhow!("no active game — call newGame first"))?;
    f(state)
}

fn world_seed(conn: &Connection) -> anyhow::Result<i64> {
    Ok(conn.query_row("SELECT world_seed FROM meta", [], |r| r.get(0))?)
}

/// PendingAction 하나 — `04_게임루프.md` §3의 7종 중 지금 대기 중인 것.
/// `payload_json`은 타입별로 형태가 다른 JSON — Dart가 `kind`를 보고
/// 어떤 화면으로 갈지 고르고(전용화면은 후속 서브분), 그 화면이 필요한
/// 필드만 꺼내 쓴다.
#[derive(Debug, Clone)]
pub struct PendingActionInfo {
    pub id: String,
    pub kind: String,
    pub urgency: String,
    pub created_day: i64,
    pub payload_json: String,
}

impl From<repository::PendingActionRow> for PendingActionInfo {
    fn from(r: repository::PendingActionRow) -> Self {
        PendingActionInfo { id: r.id, kind: r.kind, urgency: r.urgency, created_day: r.created_day, payload_json: r.payload }
    }
}

/// `game`/`pitch` PendingAction을 `resolveChoice`로 응답한 결과 —
/// 매치 세션이 진행 중이면 둘 중 하나가 온다(매치 세션이 아니면 `None`).
#[derive(Debug, Clone)]
pub enum MatchStepInfo {
    AwaitingPitch { batter_id: String, balls: u32, strikes: u32, high_leverage: bool },
    GameOver { home_runs: u32, away_runs: u32 },
}

impl From<match_session::MatchStepResult> for MatchStepInfo {
    fn from(step: match_session::MatchStepResult) -> Self {
        match step {
            match_session::MatchStepResult::AwaitingPitch { batter_id, balls, strikes, high_leverage } => {
                MatchStepInfo::AwaitingPitch { batter_id, balls, strikes, high_leverage }
            }
            match_session::MatchStepResult::GameOver { home_runs, away_runs } => MatchStepInfo::GameOver { home_runs, away_runs },
        }
    }
}

/// 뉴게임 — [07_주인공_생성](../../../02_기획/07_주인공_생성.md) §1의 7단계
/// 흐름 중 실제 데이터를 만드는 마지막 단계(스텝 1~6은 Dart 쪽 폼 상태일
/// 뿐 엔진 호출이 아님). 결정적 seed로 배경 세계(172팀 로스터+일정)를
/// 먼저 만든 뒤 주인공을 생성해 전역 세션에 올린다.
pub fn new_game(
    content_db_path: String,
    canonical_seed: i64,
    name: String,
    handedness: String,
    school_team_id: String,
    archetype: String,
    second_pitch: Option<String>,
) -> anyhow::Result<()> {
    let content_conn = content::open(&content_db_path)?;
    let mut slot_conn = slot::open_in_memory()?;
    slot_conn.execute("UPDATE meta SET world_seed = ?1", [canonical_seed])?;
    repository::generate_initial_world(&mut slot_conn, &content_conn, canonical_seed)?;
    repository::create_protagonist(
        &slot_conn,
        &content_conn,
        canonical_seed,
        &name,
        &handedness,
        &school_team_id,
        &archetype,
        second_pitch.as_deref(),
    )?;

    let mut guard = STATE.lock().map_err(|_| anyhow::anyhow!("game state lock poisoned"))?;
    *guard = Some(GameState { slot_conn, content_conn });
    Ok(())
}

/// 진행(Continue) — [04_게임루프](../../../03_설계/04_게임루프.md) §2
/// `advance()`를 그대로 노출. 정지점(새 PendingAction 또는 주인공 경기)
/// 까지 하루씩 전진한 뒤 대기 목록을 반환한다.
pub fn advance() -> anyhow::Result<Vec<PendingActionInfo>> {
    with_state_mut(|state| {
        let rows = repository::advance(&mut state.slot_conn, &state.content_conn)?;
        Ok(rows.into_iter().map(PendingActionInfo::from).collect())
    })
}

/// PendingAction 응답 — 타입별 `choice_id` 형식은
/// [04_게임루프](../../../03_설계/04_게임루프.md) §3·엔진 `resolve_choice`
/// 문서 참고(`game`: 모드 문자열, `pitch`: `"구종:코스"`, `injuryTreatment`:
/// 치료법, `contractNego`: `"accept:team_id"`/`"counter:team_id:금액"`/
/// `"reject"`, `tradeDecision`: `"accept"`/`"reject"`). 결과가 `Some`이면
/// 매치가 계속 진행 중이라는 뜻 — Dart는 `AwaitingPitch`면 다음 1구를
/// 위해 다시 이 함수를 호출하고, `GameOver`면 경기 요약으로 넘어간다.
pub fn resolve_choice(action_id: String, choice_id: String) -> anyhow::Result<Option<MatchStepInfo>> {
    with_state(|state| {
        let seed = world_seed(&state.slot_conn)?;
        let step = repository::resolve_choice(&state.slot_conn, &state.content_conn, seed, &action_id, &choice_id)?;
        Ok(step.map(MatchStepInfo::from))
    })
}

/// 주인공 상태 — 이름·능력치·라이브상태·계약·부상·보유구종. 유연한
/// 블롭은 JSON 원시 통과(모듈 문서 참고) — Dart는 표시용으로만 읽는다.
#[derive(Debug, Clone)]
pub struct ProtagonistStatusInfo {
    pub name: String,
    pub stats_json: String,
    pub live_state_json: String,
    pub contract_json: String,
    pub injury_json: String,
    pub pitches_json: String,
}

pub fn get_protagonist_status() -> anyhow::Result<ProtagonistStatusInfo> {
    with_state(|state| {
        let (name, stats_json, live_state_json, contract_json, injury_json, pitches_json): (String, String, String, String, String, String) =
            state.slot_conn.query_row("SELECT name, stats, live_state, contract, injury, pitches FROM protagonist WHERE id = 'proto:1'", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
            })?;
        Ok(ProtagonistStatusInfo { name, stats_json, live_state_json, contract_json, injury_json, pitches_json })
    })
}

/// 지금 세션의 미해결 PendingAction 전체 — 화면 재진입(예: 매치 중 다른
/// 탭 갔다가 복귀) 시 재조회용. `advance`/`resolve_choice`가 반환하는
/// 목록과 항상 같은 소스(`pending_actions` 테이블)를 본다.
pub fn get_pending_actions() -> anyhow::Result<Vec<PendingActionInfo>> {
    with_state(|state| {
        let mut stmt = state.slot_conn.prepare("SELECT id, type, urgency, created_day, payload FROM pending_actions ORDER BY id")?;
        let rows: Vec<PendingActionInfo> = stmt
            .query_map([], |r| {
                Ok(PendingActionInfo {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    urgency: r.get(2)?,
                    created_day: r.get(3)?,
                    payload_json: r.get(4)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// 현재 진행일·시즌 — 전용 화면 없이도 "시즌종료"를 넘겼는지 UI가 배지로
/// 보여줄 수 있게 하는 최소 조회. `season`은 `season_meta`에 아직 한 번도
/// 안 쓰였으면(뉴게임 직후) 0.
#[derive(Debug, Clone)]
pub struct MetaStatusInfo {
    pub current_day: i64,
    pub season: i64,
}

pub fn get_meta_status() -> anyhow::Result<MetaStatusInfo> {
    with_state(|state| {
        let current_day: i64 = state.slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
        let season: i64 = state
            .slot_conn
            .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |r| r.get::<_, String>(0))
            .optional()?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        Ok(MetaStatusInfo { current_day, season })
    })
}

/// 1구 조작 집중뷰의 3×3 코스 그리드 버튼 이름 — `sim::pitch::Course`의
/// 9개 값 그대로(`resolve_choice`의 `"구종:코스"` choice_id에 이 이름을
/// 그대로 넣으면 된다). 순수 계산(I/O·락 없음)이라 동기 호출로 둔다 —
/// Dart 쪽에서 `FutureBuilder` 없이 바로 리스트를 쓸 수 있다.
#[flutter_rust_bridge::frb(sync)]
pub fn course_names() -> Vec<String> {
    crate::sim::pitch::Course::ALL.iter().map(|c| format!("{c:?}")).collect()
}

/// 캐릭터 생성 스텝3~4(지역·학교 선택)용 — 고교 리그 팀 전부와 팀특성
/// 3슬롯. 지역별 그룹핑·학교 카드 비주얼은 06_캐릭터생성.md 자체가
/// "열린 세부 — 아트 단계"로 이미 미뤄둔 항목이라, 이번 스코프는 평평한
/// 목록만 준다 — Dart가 `meta_json`에서 이름 등 표시 필드를 꺼내 쓴다.
#[derive(Debug, Clone)]
pub struct TeamOption {
    pub team_id: String,
    pub meta_json: String,
    pub philosophy: String,
    pub resource: String,
    pub status: String,
}

pub fn list_hs_teams(content_db_path: String) -> anyhow::Result<Vec<TeamOption>> {
    let conn = content::open(&content_db_path)?;
    let mut stmt = conn.prepare(
        "SELECT teams.id, teams.meta, team_traits.philosophy, team_traits.resource, team_traits.status
         FROM teams JOIN team_traits ON team_traits.team_id = teams.id
         WHERE teams.league_id = 'league:hs'
         ORDER BY teams.id",
    )?;
    let rows: Vec<TeamOption> = stmt
        .query_map([], |r| {
            Ok(TeamOption {
                team_id: r.get(0)?,
                meta_json: r.get::<_, Option<String>>(1)?.unwrap_or_else(|| "null".to_string()),
                philosophy: r.get(2)?,
                resource: r.get(3)?,
                status: r.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    // `STATE`가 프로세스 전역이라 이 모듈의 테스트들이 서로 겹치면 안 됨
    // — cargo test 기본 병렬 실행을 이 록으로 직렬화한다(다른 모듈 테스트는
    // 이 `STATE`를 안 건드리므로 영향 없음).
    static TEST_SERIAL: StdMutex<()> = StdMutex::new(());

    fn reset_state() {
        *STATE.lock().unwrap() = None;
    }

    #[test]
    fn commands_error_clearly_when_no_game_is_active() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        assert!(advance().is_err());
        assert!(resolve_choice("x".to_string(), "y".to_string()).is_err());
        assert!(get_protagonist_status().is_err());
        assert!(get_pending_actions().is_err());
    }

    #[test]
    fn new_game_creates_a_session_that_get_protagonist_status_can_read_back() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        new_game("content.db".to_string(), 42, "API테스트".to_string(), "우완".to_string(), hs_team, "강속구형".to_string(), None).unwrap();

        let status = get_protagonist_status().unwrap();
        assert_eq!(status.name, "API테스트");
        let stats: serde_json::Value = serde_json::from_str(&status.stats_json).unwrap();
        assert!(stats.is_object(), "stats_json should decode to a JSON object");

        reset_state();
    }

    #[test]
    fn list_hs_teams_returns_real_teams_with_traits_from_content_db() {
        let teams = list_hs_teams("content.db".to_string()).unwrap();
        assert!(!teams.is_empty());
        for t in &teams {
            assert!(t.team_id.starts_with("team:"));
            assert!(!t.philosophy.is_empty());
        }
    }

    #[test]
    fn course_names_returns_all_nine_documented_zones() {
        let names = course_names();
        assert_eq!(names.len(), 9);
        assert!(names.contains(&"MidCenter".to_string()));
    }
}
