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
    AwaitingPitch {
        batter_id: String,
        balls: u32,
        strikes: u32,
        high_leverage: bool,
        inning: u32,
        top_of_inning: bool,
        outs: u32,
        bases: Vec<bool>,
        home_runs: u32,
        away_runs: u32,
    },
    GameOver { home_runs: u32, away_runs: u32 },
}

impl From<match_session::MatchStepResult> for MatchStepInfo {
    fn from(step: match_session::MatchStepResult) -> Self {
        match step {
            match_session::MatchStepResult::AwaitingPitch {
                batter_id,
                balls,
                strikes,
                high_leverage,
                inning,
                top_of_inning,
                outs,
                bases,
                home_runs,
                away_runs,
            } => MatchStepInfo::AwaitingPitch { batter_id, balls, strikes, high_leverage, inning, top_of_inning, outs, bases, home_runs, away_runs },
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

/// [07_전환화면](../../../04_UI기획/07_전환화면.md) §5 "3옵션 비교표" —
/// `injuryTreatment` PendingAction의 `choice_id`로 그대로 쓸 수 있는
/// `name`(`resolve_choice`가 기대하는 정확한 문자열, `sim::injury::TREATMENTS`)
/// 과 함께 이탈기간(`sim::injury::treated_recovery_days`, 실제 계산값)·
/// 재발위험·완치도(08_부상_시스템.md §4 표의 정성적 설명 — 수술/재활/
/// 무리한복귀 셋 다 즉시-판정형이라 정확한 확률은 선택 시점(`treat`)에야
/// 나오므로 사전 비교표는 문서가 확정해둔 상대적 설명 문구로 표시).
/// 순수 계산이라 동기.
#[derive(Debug, Clone)]
pub struct TreatmentOption {
    pub name: String,
    pub recovery_days: i64,
    pub risk_label: String,
    pub recovery_quality_label: String,
}

#[flutter_rust_bridge::frb(sync)]
pub fn treatment_options(severity: String) -> Vec<TreatmentOption> {
    crate::sim::injury::TREATMENTS
        .iter()
        .map(|t| {
            let (risk_label, recovery_quality_label) = match *t {
                "수술" => ("낮음", "높음(성공 시 — 실패하면 합병증으로 악화)"),
                "재활" => ("있음(기준)", "중간"),
                _ => ("매우 높음", "낮음"),
            };
            TreatmentOption {
                name: t.to_string(),
                recovery_days: crate::sim::injury::treated_recovery_days(&severity, t),
                risk_label: risk_label.to_string(),
                recovery_quality_label: recovery_quality_label.to_string(),
            }
        })
        .collect()
}

/// 캐릭터 생성 스텝3~4(지역·학교 선택)용 — 고교 리그 팀 전부와 팀특성
/// 3슬롯. 지역별 그룹핑·학교 카드 비주얼은 06_캐릭터생성.md 자체가
/// "열린 세부 — 아트 단계"로 이미 미뤄둔 항목이라, 이번 스코프는 평평한
/// 목록만 준다 — Dart가 `meta_json`에서 이름 등 표시 필드를 꺼내 쓴다.
#[derive(Debug, Clone)]
pub struct TeamOption {
    pub team_id: String,
    pub league_id: String,
    pub meta_json: String,
    pub philosophy: String,
    pub resource: String,
    pub status: String,
}

pub fn list_hs_teams(content_db_path: String) -> anyhow::Result<Vec<TeamOption>> {
    let conn = content::open(&content_db_path)?;
    let mut stmt = conn.prepare(
        "SELECT teams.id, teams.league_id, teams.meta, team_traits.philosophy, team_traits.resource, team_traits.status
         FROM teams JOIN team_traits ON team_traits.team_id = teams.id
         WHERE teams.league_id = 'league:hs'
         ORDER BY teams.id",
    )?;
    let rows: Vec<TeamOption> = stmt
        .query_map([], |r| {
            Ok(TeamOption {
                team_id: r.get(0)?,
                league_id: r.get(1)?,
                meta_json: r.get::<_, Option<String>>(2)?.unwrap_or_else(|| "null".to_string()),
                philosophy: r.get(3)?,
                resource: r.get(4)?,
                status: r.get(5)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

/// 지금 세션(전역 상태가 이미 content_conn을 들고 있음)에서 주인공의
/// 현재 소속팀 정보 — [01_내선수](../../../04_UI기획/01_내선수.md) 상단
/// 요약바의 "소속팀" 표시용. 무소속(FA·아직 프로 미진입)이면 `None`.
pub fn get_current_team_info() -> anyhow::Result<Option<TeamOption>> {
    with_state(|state| {
        let contract_raw: String = state.slot_conn.query_row("SELECT contract FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
        let contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
        let Some(team_id) = contract.get("team_id").and_then(|v| v.as_str()) else {
            return Ok(None);
        };
        let row: Option<(String, String, Option<String>, String, String, String)> = state
            .content_conn
            .query_row(
                "SELECT teams.id, teams.league_id, teams.meta, team_traits.philosophy, team_traits.resource, team_traits.status
                 FROM teams JOIN team_traits ON team_traits.team_id = teams.id WHERE teams.id = ?1",
                [team_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .optional()?;
        Ok(row.map(|(team_id, league_id, meta, philosophy, resource, status)| TeamOption {
            team_id,
            league_id,
            meta_json: meta.unwrap_or_else(|| "null".to_string()),
            philosophy,
            resource,
            status,
        }))
    })
}

/// [06_훈련_시스템](../../../02_기획/육성코어/06_훈련_시스템.md) §2 능력치
/// 노출 스탯 9종 — 훈련 탭의 주/보조 슬롯 드롭다운용. 순수 상수라 동기.
#[flutter_rust_bridge::frb(sync)]
pub fn exposed_stat_names() -> Vec<String> {
    crate::sim::growth::PITCHER_EXPOSED.iter().map(|s| s.to_string()).collect()
}

/// §4 강도 다이얼 3단계 — 순수 상수라 동기.
#[flutter_rust_bridge::frb(sync)]
pub fn training_intensity_names() -> Vec<String> {
    crate::sim::training::INTENSITIES.iter().map(|s| s.to_string()).collect()
}

/// 현재 훈련 설정 — 한 번도 설정 안 했으면 `None`(§1 "훈련 계획을 아직
/// 안 짰다"는 자연스러운 초기 상태, `set_protagonist_training` 문서 참고).
#[derive(Debug, Clone)]
pub struct TrainingConfigInfo {
    pub primary_stat: String,
    pub secondary_stats: Vec<String>,
    pub intensity: String,
    pub new_pitch: Option<String>,
}

pub fn get_training_config() -> anyhow::Result<Option<TrainingConfigInfo>> {
    with_state(|state| {
        let raw: Option<String> = state
            .slot_conn
            .query_row("SELECT training FROM protagonist WHERE id = 'proto:1'", [], |r| r.get::<_, Option<String>>(0))
            .optional()?
            .flatten();
        let Some(raw) = raw else {
            return Ok(None);
        };
        let v: serde_json::Value = serde_json::from_str(&raw)?;
        let secondary_stats = v
            .get("secondary_stats")
            .and_then(|s| s.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        Ok(Some(TrainingConfigInfo {
            primary_stat: v.get("primary_stat").and_then(|s| s.as_str()).unwrap_or("").to_string(),
            secondary_stats,
            intensity: v.get("intensity").and_then(|s| s.as_str()).unwrap_or("보통").to_string(),
            new_pitch: v.get("new_pitch").and_then(|s| s.as_str()).map(str::to_string),
        }))
    })
}

/// 훈련 슬롯 설정 — [01_내선수](../../../04_UI기획/01_내선수.md) §3 훈련
/// 탭이 호출. `repository::set_protagonist_training`을 그대로 감싼다(구종
/// 슬롯·신규 습득은 이번 서브분 스코프 밖 — 전체 구종 카탈로그를 조회할
/// 엔진 쿼리가 아직 없어 `new_pitch`는 항상 `None`으로 고정).
pub fn set_training(primary_stat: String, secondary_stat_1: String, secondary_stat_2: String, intensity: String) -> anyhow::Result<()> {
    with_state(|state| {
        repository::set_protagonist_training(&state.slot_conn, &primary_stat, [&secondary_stat_1, &secondary_stat_2], &intensity, None)
    })
}

/// [02_리그](../../../04_UI기획/02_리그.md) 결정5 "전 팀 풀 스카우팅"용 —
/// `league_id`를 주면 그 리그만, `None`이면 172팀 전부. 세션의
/// `content_conn`을 그대로 쓰므로(뉴게임 이후에만 호출 가능) 경로를 또
/// 안 받는다(`list_hs_teams`는 뉴게임 이전 캐릭터 생성 화면에서 쓰여
/// 경로가 필요했던 것과 다른 지점).
pub fn list_teams(league_id: Option<String>) -> anyhow::Result<Vec<TeamOption>> {
    with_state(|state| {
        let (sql, params): (&str, Vec<&dyn rusqlite::ToSql>) = match &league_id {
            Some(l) => (
                "SELECT teams.id, teams.league_id, teams.meta, team_traits.philosophy, team_traits.resource, team_traits.status
                 FROM teams JOIN team_traits ON team_traits.team_id = teams.id WHERE teams.league_id = ?1 ORDER BY teams.id",
                vec![l],
            ),
            None => (
                "SELECT teams.id, teams.league_id, teams.meta, team_traits.philosophy, team_traits.resource, team_traits.status
                 FROM teams JOIN team_traits ON team_traits.team_id = teams.id ORDER BY teams.id",
                vec![],
            ),
        };
        let mut stmt = state.content_conn.prepare(sql)?;
        let rows: Vec<TeamOption> = stmt
            .query_map(params.as_slice(), |r| {
                Ok(TeamOption {
                    team_id: r.get(0)?,
                    league_id: r.get(1)?,
                    meta_json: r.get::<_, Option<String>>(2)?.unwrap_or_else(|| "null".to_string()),
                    philosophy: r.get(3)?,
                    resource: r.get(4)?,
                    status: r.get(5)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// 로스터 한 명 — [02_리그](../../../04_UI기획/02_리그.md) §1. NPC는
/// S~D 등급이 없다(§1 "등급은 주인공 전용") — 능력치+포지션+보유구종만.
/// 개인 통산 성적은 그 자체가 엔진에 없어(계속 이월 항목) 이번에도 없음.
#[derive(Debug, Clone)]
pub struct RosterPlayerInfo {
    pub id: String,
    pub name: String,
    pub position: String,
    pub age: i64,
    pub stats_json: String,
    pub pitches_json: Option<String>,
}

pub fn list_roster(team_id: String) -> anyhow::Result<Vec<RosterPlayerInfo>> {
    with_state(|state| {
        let mut stmt = state
            .slot_conn
            .prepare("SELECT id, name, position, age, stats, pitches FROM npc WHERE team_id = ?1 AND retired = 0 ORDER BY position, id")?;
        let rows: Vec<RosterPlayerInfo> = stmt
            .query_map([&team_id], |r| {
                Ok(RosterPlayerInfo {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    position: r.get(2)?,
                    age: r.get(3)?,
                    stats_json: r.get(4)?,
                    pitches_json: r.get(5)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// [02_리그](../../../04_UI기획/02_리그.md) §2 일정 탭 — `team_id`의 전체
/// 스케줄(지난 결과 + 다가오는 경기). `result_json`이 `None`이면 아직 안
/// 열린 경기.
#[derive(Debug, Clone)]
pub struct ScheduleGameInfo {
    pub game_id: String,
    pub day: i64,
    pub home: String,
    pub away: String,
    pub result_json: Option<String>,
}

pub fn get_team_schedule(team_id: String) -> anyhow::Result<Vec<ScheduleGameInfo>> {
    with_state(|state| {
        let mut stmt = state
            .slot_conn
            .prepare("SELECT game_id, day, home, away, result FROM schedule WHERE home = ?1 OR away = ?1 ORDER BY day")?;
        let rows: Vec<ScheduleGameInfo> = stmt
            .query_map([&team_id], |r| {
                Ok(ScheduleGameInfo { game_id: r.get(0)?, day: r.get(1)?, home: r.get(2)?, away: r.get(3)?, result_json: r.get(4)? })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// [02_리그](../../../04_UI기획/02_리그.md) §3 순위 탭 — `league_id` 소속
/// 팀들의 승률 내림차순 순위. `standings.rank` 컬럼은 시즌 중엔 갱신 안
/// 되고 `season_rollover` 때만 확정되므로(`repository::update_standings`
/// 참고), 여기 `rank`는 이 조회 시점에 재계산한 값 — 정렬·표시 포맷팅일
/// 뿐 승패 판정 자체가 아니라 "UI가 해도 됨: 정렬"(03_구조.md §3)에 해당.
/// 로스터가 없어(방금 뉴게임 직후 등) `standings` 행이 아직 없는 팀은
/// 0승0패로 취급.
#[derive(Debug, Clone)]
pub struct StandingsRowInfo {
    pub team_id: String,
    pub rank: i64,
    pub wins: i64,
    pub losses: i64,
    pub ties: i64,
}

pub fn get_standings(league_id: String) -> anyhow::Result<Vec<StandingsRowInfo>> {
    with_state(|state| {
        let mut team_stmt = state.content_conn.prepare("SELECT id FROM teams WHERE league_id = ?1")?;
        let team_ids: Vec<String> = team_stmt.query_map([&league_id], |r| r.get(0))?.collect::<Result<_, _>>()?;

        let mut rows: Vec<(String, i64, i64, i64)> = Vec::with_capacity(team_ids.len());
        for team_id in team_ids {
            let record: Option<(i64, i64, i64)> = state
                .slot_conn
                .query_row("SELECT w, l, t FROM standings WHERE team_id = ?1", [&team_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .optional()?;
            let (w, l, t) = record.unwrap_or((0, 0, 0));
            rows.push((team_id, w, l, t));
        }
        rows.sort_by(|a, b| repository::win_pct(b.1, b.2).partial_cmp(&repository::win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
        Ok(rows
            .into_iter()
            .enumerate()
            .map(|(i, (team_id, w, l, t))| StandingsRowInfo { team_id, rank: i as i64 + 1, wins: w, losses: l, ties: t })
            .collect())
    })
}

/// [02_리그](../../../04_UI기획/02_리그.md) §4 라이벌 탭 — `team_history.rivals`
/// (정적 콘텐츠, 지역·서사 페어링)만 반환한다. **개인 라이벌 관계
/// (관계도·아크단계 비교)는 이번 스코프에 없음** — `relationships`
/// 테이블이 스키마만 있고 실제로 채우는 로직이 엔진 어디에도 없어서다
/// (관계 시스템 자체가 아직 미구현, 05_히스토리_엔딩과 함께 후속 스코프).
/// 정확한 JSON 형태가 팀마다 다를 수 있어 원시 통과.
pub fn get_team_rivals(team_id: String) -> anyhow::Result<Option<String>> {
    with_state(|state| Ok(state.content_conn.query_row("SELECT rivals FROM team_history WHERE team_id = ?1", [&team_id], |r| r.get(0)).optional()?))
}

/// [03_기록](../../../04_UI기획/03_기록.md) §1 "경기 로그" 탭 — `game_log`는
/// 압축 없이 경기별 전체 보존(07_매치_엔진.md §12). `detail_json`은
/// `{"grade","runs_allowed","opponent"}`(`apply_protagonist_evaluation`
/// 참고).
#[derive(Debug, Clone)]
pub struct GameLogEntry {
    pub game_id: String,
    pub season: i64,
    pub detail_json: String,
}

pub fn get_game_log() -> anyhow::Result<Vec<GameLogEntry>> {
    with_state(|state| {
        let mut stmt = state.slot_conn.prepare("SELECT game_id, season, detail FROM game_log ORDER BY season, game_id")?;
        let rows: Vec<GameLogEntry> = stmt
            .query_map([], |r| Ok(GameLogEntry { game_id: r.get(0)?, season: r.get(1)?, detail_json: r.get(2)? }))?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// [03_기록](../../../04_UI기획/03_기록.md) §1 "계약·이력" 탭 — `league_transactions`
/// 중 `'contract'`(방출/체결, `process_protagonist_contract`·
/// `resolve_contract_nego`가 기록)·`'trade'`(`resolve_trade_decision`이
/// 기록) 종류만. `'champion'`(리그 전체 우승팀 기록)은 주인공 개인 이력이
/// 아니라 제외. **드래프트 로그는 없음** — 진로 갈림길(고교→프로 진입)
/// 자체가 엔진에 없어(§6-19에서 이미 확인) 드래프트 이벤트가 발생할
/// 수가 없다.
#[derive(Debug, Clone)]
pub struct LeagueTransactionEntry {
    pub id: String,
    pub day: i64,
    pub kind: String,
    pub detail_json: String,
}

pub fn get_contract_history() -> anyhow::Result<Vec<LeagueTransactionEntry>> {
    with_state(|state| {
        let mut stmt = state
            .slot_conn
            .prepare("SELECT id, day, kind, detail FROM league_transactions WHERE kind IN ('contract', 'trade') ORDER BY day")?;
        let rows: Vec<LeagueTransactionEntry> = stmt
            .query_map([], |r| Ok(LeagueTransactionEntry { id: r.get(0)?, day: r.get(1)?, kind: r.get(2)?, detail_json: r.get(3)? }))?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// [03_기록](../../../04_UI기획/03_기록.md) §1 "부상·재활" 탭 —
/// `protagonist.injury.history`(08_부상_시스템.md §5, 부위·심각도·발생일).
/// **치료 선택·복귀 확정 시점은 이 로그에 없음** — `record_injury`가
/// 기록하는 `history` 항목은 발생 시점 스냅샷뿐이고, 치료법 확정
/// (`treat`)·완치(`clear_healed_injury`)는 `current` 필드만 갱신하고
/// `history`에 별도로 남기지 않는다(엔진 쪽에 그 로그를 추가하는 건
/// 이번 스코프 밖).
#[derive(Debug, Clone)]
pub struct InjuryLogEntry {
    pub part: String,
    pub severity: String,
    pub day: i64,
}

pub fn get_injury_history() -> anyhow::Result<Vec<InjuryLogEntry>> {
    with_state(|state| {
        let raw: String = state.slot_conn.query_row("SELECT injury FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
        let v: serde_json::Value = serde_json::from_str(&raw)?;
        let entries = v
            .get("history")
            .and_then(|h| h.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|h| InjuryLogEntry {
                        part: h.get("부위").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                        severity: h.get("심각도").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                        day: h.get("day").and_then(|x| x.as_i64()).unwrap_or(0),
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(entries)
    })
}

/// 자발적 은퇴(§4 진입 3종 중 유일하게 플레이어가 임의 시점에 직접
/// 호출) — [08_은퇴](../../../04_UI기획/08_은퇴.md) §1. 나머지 두 트리거
/// (노쇠·부상)는 `advance()` 내부(시즌 경계·부상 판정)에서 엔진이 알아서
/// 감지해 `retirement` PendingAction을 만든다.
pub fn declare_retirement() -> anyhow::Result<()> {
    with_state(|state| {
        let today: i64 = state.slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
        repository::declare_protagonist_retirement(&state.slot_conn, today)
    })
}

/// [08_은퇴](../../../04_UI기획/08_은퇴.md) §2 "통산 기록 대시보드" —
/// **등급 매김 없이 순수 숫자**(05_히스토리_엔딩.md §4 "인생은 점수로
/// 판정하지 않는다"). "최종 자산"(08_개인_재정)·업적·라이벌전 하이라이트는
/// 해당 시스템 자체가 아직 엔진에 없어 이번 스코프엔 없음(10_구현_Phase_계획.md
/// §6-28 스코프 판단 참고).
#[derive(Debug, Clone)]
pub struct CareerSummary {
    pub games: i64,
    pub wins: i64,
    pub losses: i64,
    pub no_decisions: i64,
    pub strikeouts: i64,
    pub innings_pitched: i64,
    pub era: f64,
    pub retired: bool,
    pub retirement_reason: Option<String>,
}

pub fn career_summary() -> anyhow::Result<CareerSummary> {
    with_state(|state| {
        let line = repository::aggregate_game_log(&state.slot_conn, None)?;
        let (retired, retirement_reason): (i64, Option<String>) = state
            .slot_conn
            .query_row("SELECT retired, retirement_reason FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(CareerSummary {
            games: line.games,
            wins: line.wins,
            losses: line.losses,
            no_decisions: line.no_decisions,
            strikeouts: line.strikeouts,
            innings_pitched: line.innings_pitched,
            era: line.era(),
            retired: retired == 1,
            retirement_reason,
        })
    })
}

/// [08_은퇴](../../../04_UI기획/08_은퇴.md) §2 "커리어 타임라인 그래프" —
/// `career_history`(시즌별 한 줄, `season_rollover`가 채움)를 그대로
/// 노출. `line_json`은 `{"games","wins","losses","no_decisions",
/// "strikeouts","innings_pitched","era"}` 형태.
#[derive(Debug, Clone)]
pub struct SeasonLine {
    pub season: i64,
    pub line_json: String,
}

pub fn career_timeline() -> anyhow::Result<Vec<SeasonLine>> {
    with_state(|state| {
        let mut stmt = state.slot_conn.prepare("SELECT season, line FROM career_history ORDER BY season")?;
        let rows: Vec<SeasonLine> = stmt.query_map([], |r| Ok(SeasonLine { season: r.get(0)?, line_json: r.get(1)? }))?.collect::<Result<_, _>>()?;
        Ok(rows)
    })
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

    #[test]
    fn exposed_stat_names_and_training_intensity_names_match_engine_constants() {
        assert_eq!(exposed_stat_names().len(), 9);
        assert_eq!(training_intensity_names(), vec!["약", "보통", "강"]);
    }

    #[test]
    fn team_and_training_queries_work_end_to_end_after_new_game() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        new_game("content.db".to_string(), 43, "훈련테스트".to_string(), "우완".to_string(), hs_team.clone(), "강속구형".to_string(), None).unwrap();

        let team = get_current_team_info().unwrap();
        assert_eq!(team.unwrap().team_id, hs_team);

        assert!(get_training_config().unwrap().is_none(), "no training configured yet");

        set_training("구속".to_string(), "구위".to_string(), "제구".to_string(), "보통".to_string()).unwrap();
        let config = get_training_config().unwrap().unwrap();
        assert_eq!(config.primary_stat, "구속");
        assert_eq!(config.secondary_stats, vec!["구위", "제구"]);
        assert_eq!(config.intensity, "보통");
        assert!(config.new_pitch.is_none());

        reset_state();
    }

    #[test]
    fn league_hub_queries_work_end_to_end_after_new_game() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        new_game("content.db".to_string(), 44, "리그테스트".to_string(), "우완".to_string(), hs_team.clone(), "강속구형".to_string(), None).unwrap();

        let hs_teams = list_teams(Some("league:hs".to_string())).unwrap();
        assert!(hs_teams.iter().any(|t| t.team_id == hs_team));
        let all_teams = list_teams(None).unwrap();
        assert!(all_teams.len() > hs_teams.len(), "unfiltered list should include every league");

        let roster = list_roster(hs_team.clone()).unwrap();
        assert!(!roster.is_empty());
        assert!(roster.iter().any(|p| p.position == "선발투수"));

        let schedule = get_team_schedule(hs_team.clone()).unwrap();
        assert!(!schedule.is_empty());
        assert!(schedule.iter().all(|g| g.home == hs_team || g.away == hs_team));

        let standings = get_standings("league:hs".to_string()).unwrap();
        assert!(standings.iter().any(|s| s.team_id == hs_team));
        assert_eq!(standings[0].rank, 1);

        // rivals는 콘텐츠가 있으면 Some, 없으면 None — 둘 다 패닉 없이 동작하는지만 확인.
        let _ = get_team_rivals(hs_team).unwrap();

        reset_state();
    }

    #[test]
    fn record_hub_queries_return_seeded_history_after_new_game() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };
        new_game("content.db".to_string(), 45, "기록테스트".to_string(), "우완".to_string(), hs_team, "제구형".to_string(), None).unwrap();

        // 새 게임 직후엔 전부 비어있어야 함(패닉 없이).
        assert!(get_game_log().unwrap().is_empty());
        assert!(get_contract_history().unwrap().is_empty());
        assert!(get_injury_history().unwrap().is_empty());

        with_state(|state| {
            state.slot_conn.execute(
                "INSERT INTO game_log (game_id, season, detail) VALUES ('game:1', 0, ?1)",
                [serde_json::json!({"grade": "A", "runs_allowed": 1, "opponent": "team:x"}).to_string()],
            )?;
            state.slot_conn.execute(
                "INSERT INTO league_transactions (id, day, kind, detail) VALUES ('txn:1', 10, 'contract', ?1)",
                [serde_json::json!({"event": "sign", "team_id": "team:x", "salary": 5000}).to_string()],
            )?;
            state.slot_conn.execute(
                "UPDATE protagonist SET injury = ?1 WHERE id = 'proto:1'",
                [serde_json::json!({"current": null, "history": [{"부위": "어깨", "심각도": "경미", "day": 5}]}).to_string()],
            )?;
            Ok(())
        })
        .unwrap();

        let logs = get_game_log().unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].game_id, "game:1");

        let history = get_contract_history().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].kind, "contract");

        let injuries = get_injury_history().unwrap();
        assert_eq!(injuries.len(), 1);
        assert_eq!(injuries[0].part, "어깨");
        assert_eq!(injuries[0].severity, "경미");
        assert_eq!(injuries[0].day, 5);

        reset_state();
    }

    #[test]
    fn career_summary_and_timeline_reflect_declared_retirement() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };
        new_game("content.db".to_string(), 46, "은퇴테스트".to_string(), "우완".to_string(), hs_team, "제구형".to_string(), None).unwrap();

        let before = career_summary().unwrap();
        assert!(!before.retired);
        assert_eq!(before.games, 0);
        assert!(career_timeline().unwrap().is_empty());

        with_state(|state| {
            state.slot_conn.execute(
                "INSERT INTO game_log (game_id, season, detail) VALUES ('game:1', 0, ?1)",
                [serde_json::json!({"grade": "A", "runs_allowed": 2, "opponent": "team:x", "decision": "승", "strikeouts": 7, "innings_pitched": 9})
                    .to_string()],
            )?;
            state.slot_conn.execute(
                "INSERT INTO career_history (season, line) VALUES (0, ?1)",
                [serde_json::json!({"games": 1, "wins": 1, "losses": 0, "no_decisions": 0, "strikeouts": 7, "innings_pitched": 9, "era": 2.0})
                    .to_string()],
            )?;
            Ok(())
        })
        .unwrap();

        let mid = career_summary().unwrap();
        assert_eq!((mid.games, mid.wins, mid.strikeouts), (1, 1, 7));

        declare_retirement().unwrap();

        let after = career_summary().unwrap();
        assert!(after.retired);
        assert_eq!(after.retirement_reason.as_deref(), Some("voluntary"));

        let timeline = career_timeline().unwrap();
        assert_eq!(timeline.len(), 1);
        assert_eq!(timeline[0].season, 0);

        let pending = get_pending_actions().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "retirement");

        reset_state();
    }

    #[test]
    fn treatment_options_are_named_for_resolve_choice_and_recovery_grows_with_severity() {
        let options = treatment_options("경미".to_string());
        assert_eq!(options.len(), 3);
        assert_eq!(options.iter().map(|o| o.name.clone()).collect::<Vec<_>>(), vec!["수술", "재활", "무리한 복귀"]);

        let surgery_minor = treatment_options("경미".to_string()).into_iter().find(|o| o.name == "수술").unwrap();
        let surgery_severe = treatment_options("중상".to_string()).into_iter().find(|o| o.name == "수술").unwrap();
        assert!(surgery_severe.recovery_days > surgery_minor.recovery_days);

        let rushed = treatment_options("경미".to_string()).into_iter().find(|o| o.name == "무리한 복귀").unwrap();
        let rehab = treatment_options("경미".to_string()).into_iter().find(|o| o.name == "재활").unwrap();
        assert!(rushed.recovery_days < rehab.recovery_days);
    }
}
