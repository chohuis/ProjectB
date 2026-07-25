//! I7 1차분에서 시작해 계속 확장돼온 엔진 API 표면 — [03_구조](../../../03_설계/03_구조.md)
//! §5 "엔진 API 표면 = 범용 쿼리 + 커맨드". [10_구현_Phase_계획](../../../03_설계/10_구현_Phase_계획.md)
//! §6-21~ 각 서브분 기록 참고(4허브·전용화면 8종·매치 CustomPainter
//! 비주얼·세이브 슬롯 영속성 등 순차 추가).
//!
//! **세션 모델 — 전역 싱글톤, 이번 스코프의 의도적 단순화**: 여러 세이브
//! 슬롯을 동시에 열고 전환하는 것([02_데이터](../../../03_설계/02_데이터.md)
//! §4 "슬롯 수명주기" 커맨드군)은 이번 스코프 밖 — 지금은 앱 프로세스
//! 안에 세션이 하나뿐이라고 가정하고 `Mutex<Option<GameState>>` 전역
//! 상태 하나로 충분하다. 여러 슬롯 관리가 실제로 필요해지면(로드 화면 등)
//! 이 자리를 frb opaque 핸들로 승격하면 된다.
//!
//! **세이브 파일 영속성**(I7 9차분): `new_game`의 `slot_path`가 `Some`
//! 이면 실제 파일에 쓴다(§4 "파일=슬롯"). `list_slots`/`load_slot`/
//! `delete_slot`이 그 파일들을 스캔·재개·삭제한다. 다만 **"여러 슬롯을
//! 동시에 열고 전환"은 여전히 스코프 밖** — 위 전역 싱글톤 세션 모델은
//! 그대로다(한 번에 슬롯 하나만 로드돼 있음, `load_slot`이 기존 세션을
//! 갈아치운다).
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

use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
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
        /// 매치 화면 스태미나 게이지용(§6-N) — `PitcherChangeDecision.fatigue`
        /// 와 같은 값 출처.
        fatigue: f64,
        pitches_thrown: u32,
        /// 방금 전 타석의 인플레이 타구를 처리한 포지션(대화 2026-07-25,
        /// 매치 화면 수비 배지 하이라이트용) — 없으면(K/BB/HBP였거나
        /// 하프이닝이 막 시작됐으면) `None`.
        last_fielder_position: Option<String>,
        /// `last_fielder_position`이 있을 때만 의미 있음 — 그 플레이가 실책이었는지.
        last_play_was_error: bool,
    },
    GameOver { home_runs: u32, away_runs: u32 },
    /// 감독 개입(§8) 수동 모드 판단 요청 — `resolveChoice`에 `"유지"`/
    /// `"교체"`/`"맡기기"`를 응답해야 진행된다.
    PitcherChangeDecision {
        inning: u32,
        top_of_inning: bool,
        home_runs: u32,
        away_runs: u32,
        pitches_thrown: u32,
        fatigue: f64,
        manager_recommends_pull: bool,
    },
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
                fatigue,
                pitches_thrown,
                last_fielder_position,
                last_play_was_error,
            } => MatchStepInfo::AwaitingPitch {
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
                fatigue,
                pitches_thrown,
                last_fielder_position,
                last_play_was_error,
            },
            match_session::MatchStepResult::GameOver { home_runs, away_runs } => MatchStepInfo::GameOver { home_runs, away_runs },
            match_session::MatchStepResult::PitcherChangeDecision {
                inning,
                top_of_inning,
                home_runs,
                away_runs,
                pitches_thrown,
                fatigue,
                manager_recommends_pull,
            } => MatchStepInfo::PitcherChangeDecision { inning, top_of_inning, home_runs, away_runs, pitches_thrown, fatigue, manager_recommends_pull },
        }
    }
}

/// 프리게임 브리핑의 상대 타자 한 명(대화 2026-07-25) — `sim::match_sim::BatterStats`
/// 는 id만 갖고 있어(이름은 `npc` 테이블), 표시용으로 이름을 붙여 재포장.
#[derive(Debug, Clone)]
pub struct ScoutedBatterInfo {
    pub name: String,
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
}

/// 프리게임 브리핑([04_메시지함] 확장, 대화 2026-07-25) — `'game'` PendingAction
/// payload의 `game_id`/`home`/`away`를 그대로 받아 상대 선발·타선 상위·
/// 날씨·파크팩터를 미리 보여준다. 새 시뮬레이션 로직 없이 실제 매치가
/// 이미 쓰는 값들을 그대로 재사용: 선발은 `repository::load_starting_pitcher`
/// (로테이션 순번 그대로), 타선은 `repository::load_batting_lineup`(라인업
/// 순서 그대로) 중 컨택+파워 합산 상위 3명, 날씨는 실제 매치 세션이 쓰는
/// 것과 동일한 결정적 시드(`league_sub_seed(world_seed, "weather:{game_id}")`)
/// 로 미리 굴려서 매치가 실제로 시작될 때와 같은 값이 나오게 한다.
#[derive(Debug, Clone)]
pub struct PregameScoutingInfo {
    pub opponent_team_id: String,
    pub starter_name: String,
    pub starter_velocity: f64,
    pub starter_control: f64,
    pub starter_stuff: f64,
    pub top_batters: Vec<ScoutedBatterInfo>,
    pub weather: String,
    pub park_factor_label: String,
}

pub fn get_pregame_scouting(game_id: String, home_team_id: String, away_team_id: String) -> anyhow::Result<PregameScoutingInfo> {
    with_state(|state| {
        let opponent_team_id = if repository::is_protagonist_team(&state.slot_conn, &home_team_id)? { away_team_id.clone() } else { home_team_id.clone() };

        let starter = repository::load_starting_pitcher(&state.slot_conn, &opponent_team_id)?;
        let starter_name: String =
            state.slot_conn.query_row("SELECT name FROM npc WHERE id = ?1", [&starter.id], |r| r.get(0)).optional()?.unwrap_or_else(|| starter.id.clone());

        let mut lineup = repository::load_batting_lineup(&state.slot_conn, &opponent_team_id)?;
        lineup.sort_by(|a, b| (b.power + b.contact).partial_cmp(&(a.power + a.contact)).unwrap_or(std::cmp::Ordering::Equal));
        let top_batters = lineup
            .into_iter()
            .take(3)
            .map(|b| -> anyhow::Result<ScoutedBatterInfo> {
                let name: String = state.slot_conn.query_row("SELECT name FROM npc WHERE id = ?1", [&b.id], |r| r.get(0)).optional()?.unwrap_or_else(|| b.id.clone());
                Ok(ScoutedBatterInfo { name, contact: b.contact, power: b.power, eye: b.eye })
            })
            .collect::<anyhow::Result<Vec<_>>>()?;

        let park_factor_raw = content::load_team_park_factor(&state.content_conn, &home_team_id)?;
        let mut weather_rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(world_seed(&state.slot_conn)?, &format!("weather:{game_id}")));
        let weather = match crate::sim::match_sim::roll_weather(&mut weather_rng) {
            crate::sim::match_sim::Weather::Clear => "맑음",
            crate::sim::match_sim::Weather::Cloudy => "흐림",
            crate::sim::match_sim::Weather::Rain => "비",
            crate::sim::match_sim::Weather::Wind => "강풍",
            crate::sim::match_sim::Weather::Hot => "더위",
        };

        Ok(PregameScoutingInfo {
            opponent_team_id,
            starter_name,
            starter_velocity: starter.velocity,
            starter_control: starter.control,
            starter_stuff: starter.stuff,
            top_batters,
            weather: weather.to_string(),
            park_factor_label: park_factor_raw.unwrap_or_else(|| "표준".to_string()),
        })
    })
}

/// 매치 화면 "타자 정보" 카드(대화 2026-07-25, 좌/우 레이아웃 재설계)용 —
/// `MatchStepInfo_AwaitingPitch.batter_id`는 raw npc id뿐이라 이름·능력치를
/// 못 보여줬다. `npc.stats`가 이미 컨택/파워/선구안을 갖고 있어(§01_선수_능력치)
/// 원라이너 조회로 충분 — 새 시뮬레이션 로직 없음.
#[derive(Debug, Clone)]
pub struct BatterProfileInfo {
    pub name: String,
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
    /// 타석 손잡이 원문("좌타"/"우타"/"양타", `npc.handedness`, migration v16)
    /// — 매치 화면에서 타자를 홈플레이트 좌/우 타석 중 어디에 그릴지
    /// 정하는 데 쓴다(대화 2026-07-25). 스위치 히터(양타)는 Dart가 임의로
    /// 한쪽(우타석)을 고르면 됨 — 실제 어느 쪽으로 타석에 섰는지는
    /// 엔진이 구분해 시뮬레이션하지 않는다.
    pub handedness: String,
}

pub fn get_batter_profile(npc_id: String) -> anyhow::Result<BatterProfileInfo> {
    with_state(|state| {
        let (name, stats_raw, handedness): (String, String, Option<String>) = state.slot_conn.query_row(
            "SELECT name, stats, handedness FROM npc WHERE id = ?1",
            [&npc_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let v: serde_json::Value = serde_json::from_str(&stats_raw)?;
        Ok(BatterProfileInfo {
            name,
            contact: v.get("컨택").and_then(|x| x.as_f64()).unwrap_or(50.0),
            power: v.get("파워").and_then(|x| x.as_f64()).unwrap_or(50.0),
            eye: v.get("선구안").and_then(|x| x.as_f64()).unwrap_or(50.0),
            handedness: handedness.unwrap_or_else(|| "우타".to_string()),
        })
    })
}

/// 매치 화면 박스스코어(migration v26, 대화 2026-07-25) — 이닝별
/// `[{"inning","top_of_inning","runs","hits","walks"}, ...]` JSON 배열.
/// 진행 중인 매치 세션이 없으면 `None`(모듈 문서 "JSON 원시 통과" 관례 —
/// Dart가 dart:convert로 표시용으로만 읽는다).
pub fn get_inning_log() -> anyhow::Result<Option<String>> {
    with_state(|state| match_session::get_inning_log(&state.slot_conn))
}

/// 매치 화면 박스스코어 라벨·주자 팀색·구장 그림(대화 2026-07-25) — 홈/
/// 원정 팀 id(Dart `hsSchoolColor`로 학교색 해시)와 홈 구장 id. 구장 id는
/// Dart가 `assets/stadium/{id}.gif`(구장별로 미리 색조 보정해둔 실사
/// 픽셀아트, content.db의 27개 stadium 행 하나당 하나씩) 자산 키로
/// 그대로 쓴다. 진행 중인 매치 세션이 없으면 `None`.
#[derive(Debug, Clone)]
pub struct MatchVenueInfo {
    pub home_team_id: String,
    pub away_team_id: String,
    pub stadium_id: String,
}

pub fn get_match_venue() -> anyhow::Result<Option<MatchVenueInfo>> {
    with_state(|state| {
        let Some((home_team_id, away_team_id)) = match_session::get_match_teams(&state.slot_conn)? else {
            return Ok(None);
        };
        let stadium_id = content::load_team_stadium_id(&state.content_conn, &home_team_id)?.unwrap_or_else(|| "default".to_string());
        Ok(Some(MatchVenueInfo { home_team_id, away_team_id, stadium_id }))
    })
}

/// 매치 화면 타자 카드 "이번 경기" 라인(migration v26, 대화 2026-07-25) —
/// `PlayerBattingStats`와 대칭이지만 시즌 전체가 아니라 지금 진행 중인
/// 경기 하나만. 그 선수가 이번 경기에 아직 타석에 서지 않았거나 매치
/// 세션이 없으면 0으로 채운 라인.
pub fn get_batter_game_stats(npc_id: String) -> anyhow::Result<PlayerBattingStats> {
    with_state(|state| {
        let name: String =
            state.slot_conn.query_row("SELECT name FROM npc WHERE id = ?1", [&npc_id], |r| r.get(0)).optional()?.unwrap_or_default();
        let raw_map = match_session::get_batter_game_stats_json(&state.slot_conn)?.unwrap_or_else(|| "{}".to_string());
        let v: serde_json::Value = serde_json::from_str(&raw_map)?;
        let entry = v.get(&npc_id).cloned().unwrap_or_else(|| serde_json::json!({}));
        let line = repository::NpcBattingLine::from_json(&entry);
        Ok(PlayerBattingStats::from_line(npc_id, name, &line))
    })
}

/// 매치 화면 타자 카드 "시즌 전체" 라인(대화 2026-07-25) — `get_team_season_batting_stats`
/// 와 같은 소스(진행 중인 `season_stats` 합산)를 선수 한 명만 뽑는 얇은
/// 래퍼. `get_player_career_batting_stats`(과거 확정 시즌들 통산)와는
/// 시즌 범위가 다르다.
pub fn get_player_season_batting_stats(npc_id: String) -> anyhow::Result<PlayerBattingStats> {
    with_state(|state| {
        let name: String =
            state.slot_conn.query_row("SELECT name FROM npc WHERE id = ?1", [&npc_id], |r| r.get(0)).optional()?.unwrap_or_default();
        let raw = repository::aggregate_stats_line(&state.slot_conn, "season_stats", &npc_id)?;
        let line = repository::NpcBattingLine::from_json(&raw);
        Ok(PlayerBattingStats::from_line(npc_id, name, &line))
    })
}

/// 뉴게임 — [07_주인공_생성](../../../02_기획/07_주인공_생성.md) §1의 7단계
/// 흐름 중 실제 데이터를 만드는 마지막 단계(스텝 1~6은 Dart 쪽 폼 상태일
/// 뿐 엔진 호출이 아님). 결정적 seed로 배경 세계(172팀 로스터+일정)를
/// 먼저 만든 뒤 주인공을 생성해 전역 세션에 올린다.
///
/// `slot_path`가 `Some`이면 [02_데이터](../../../03_설계/02_데이터.md) §4
/// "파일=슬롯"대로 그 경로에 실제 파일을 만들어 세이브가 영속된다(I7
/// 9차분) — `None`이면 이전처럼 인메모리(테스트·일회성 검증용). 실제
/// 파일 경로 생성(앱 데이터 폴더 하위 `slot_<id>.db`)은 Dart가 담당 —
/// 엔진은 플랫폼 경로 규칙을 모른다(다른 `*_db_path` 인자들과 같은 관례).
#[allow(clippy::too_many_arguments)]
pub fn new_game(
    content_db_path: String,
    canonical_seed: i64,
    name: String,
    handedness: String,
    school_team_id: String,
    archetype: String,
    second_pitch: Option<String>,
    slot_path: Option<String>,
) -> anyhow::Result<()> {
    let content_conn = content::open(&content_db_path)?;
    if let Some(path) = &slot_path {
        // 항상 빈 슬레이트에서 시작 — Dart의 `delete_slot`이 먼저 지웠어야
        // 정상이지만, 그걸 믿지 않고 여기서 한 번 더 확실히 비운다(대화
        // 2026-07-25: 고정 3슬롯 "덮어쓰기" 재시도 시 이전 시도의 npc 행이
        // 남아있으면 `generate_initial_world`가 똑같은 결정적 id를 다시
        // 넣으려다 `UNIQUE constraint failed: npc.id`로 죽는 버그).
        //
        // 지금 다시 고르는 슬롯이 **현재 활성 세션이 이미 열어둔 그 파일**일
        // 수도 있다(예: 슬롯 1을 플레이하다 메인 메뉴로 돌아가서 "새로하기"로
        // 슬롯 1을 다시 고름) — `STATE`가 그 파일 핸들을 계속 쥐고 있으면
        // Windows에서 `remove_file`이 "다른 프로세스가 사용 중"(os error 32)
        // 으로 실패한다. 먼저 전역 세션을 비워 핸들을 놓아준 뒤 지운다.
        *STATE.lock().map_err(|_| anyhow::anyhow!("game state lock poisoned"))? = None;
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    let mut slot_conn = match &slot_path {
        Some(path) => slot::open(path)?,
        None => slot::open_in_memory()?,
    };
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

/// [02_데이터](../../../03_설계/02_데이터.md) §4 슬롯 수명주기 — 메인
/// 메뉴 "이어하기" 목록 한 줄. `slot::open`이 마이그레이션까지 자동
/// 적용하므로 구버전 슬롯도 그대로 읽힌다.
#[derive(Debug, Clone)]
pub struct SlotSummary {
    pub path: String,
    pub name: String,
    pub current_day: i64,
    pub season: i64,
    pub retired: bool,
}

/// `dir` 아래 `.db` 파일을 전부 슬롯으로 훑는다. **손상되거나 아직
/// 캐릭터 생성 전인 파일은 조용히 건너뛴다** — 슬롯 하나가 깨졌다고
/// 목록 전체가 에러로 죽으면 안 되고, `new_game`이 캐릭터 생성까지
/// 원자적으로 끝내므로 "생성 중" 상태의 파일도 사실상 없다.
pub fn list_slots(dir: String) -> anyhow::Result<Vec<SlotSummary>> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(out); // 폴더가 아직 없으면(첫 실행) 빈 목록
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("db") {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();
        let Ok(conn) = slot::open(&path_str) else { continue };
        let Ok(current_day) = conn.query_row("SELECT current_day FROM meta", [], |r| r.get::<_, i64>(0)) else { continue };
        let season: i64 = conn
            .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |r| r.get::<_, String>(0))
            .optional()
            .ok()
            .flatten()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let Ok(Some((name, retired))) =
            conn.query_row("SELECT name, retired FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
                .optional()
        else {
            continue;
        };
        out.push(SlotSummary { path: path_str, name, current_day, season, retired: retired == 1 });
    }
    out.sort_by_key(|s| std::cmp::Reverse(s.current_day));
    Ok(out)
}

/// 메인 메뉴 "이어하기" — 기존 슬롯 파일을 열어 전역 세션에 올린다.
pub fn load_slot(slot_path: String, content_db_path: String) -> anyhow::Result<()> {
    let content_conn = content::open(&content_db_path)?;
    let slot_conn = slot::open(&slot_path)?;
    let mut guard = STATE.lock().map_err(|_| anyhow::anyhow!("game state lock poisoned"))?;
    *guard = Some(GameState { slot_conn, content_conn });
    Ok(())
}

/// [02_데이터](../../../03_설계/02_데이터.md) §4 "삭제 = 파일 삭제". 지울
/// 슬롯이 마침 지금 활성 세션이 열어둔 그 파일이면(예: 슬롯 1을 플레이
/// 중 메인 메뉴로 돌아가 "새로하기"로 슬롯 1을 다시 고름) `STATE`가
/// 핸들을 쥐고 있어 Windows에서 삭제가 "다른 프로세스가 사용 중"으로
/// 실패한다(대화 2026-07-25) — 먼저 전역 세션을 비워 핸들을 놓아준다.
pub fn delete_slot(slot_path: String) -> anyhow::Result<()> {
    *STATE.lock().map_err(|_| anyhow::anyhow!("game state lock poisoned"))? = None;
    std::fs::remove_file(&slot_path)?;
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

/// 주인공 상태 — 이름·능력치·라이브상태·계약·부상·보유구종·재정. 유연한
/// 블롭은 JSON 원시 통과(모듈 문서 참고) — Dart는 표시용으로만 읽는다.
/// `finance_json`은 개인 재정 최소 골격(08_개인_재정.md §5 "잔액"만,
/// 이월 부채 정리 대화 2026-07-22)의 표시용 필드.
#[derive(Debug, Clone)]
pub struct ProtagonistStatusInfo {
    pub name: String,
    pub stats_json: String,
    pub live_state_json: String,
    pub contract_json: String,
    pub injury_json: String,
    pub pitches_json: String,
    pub finance_json: String,
}

pub fn get_protagonist_status() -> anyhow::Result<ProtagonistStatusInfo> {
    with_state(|state| {
        let (name, stats_json, live_state_json, contract_json, injury_json, pitches_json, finance_json): (
            String,
            String,
            String,
            String,
            String,
            String,
            String,
        ) = state.slot_conn.query_row(
            "SELECT name, stats, live_state, contract, injury, pitches, finance FROM protagonist WHERE id = 'proto:1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        )?;
        Ok(ProtagonistStatusInfo { name, stats_json, live_state_json, contract_json, injury_json, pitches_json, finance_json })
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

/// 학업 시스템 상태 — 고교(`league:hs`)·대학(`league:univ`) 스테이지가
/// 아니면 `None`(Dart는 이 값 하나로 학업 탭 노출 여부를 그대로 판정 —
/// 계획서 "고교·대학 스테이지에서만 탭 노출"). `subject_scores_json`은
/// 과목 5개(국/영/수/사/과) 각각의 `percentile`/`attendance`/`assignment`
/// 원시 JSON 통과(모듈 문서의 "JSON 원시 통과" 관례 그대로).
#[derive(Debug, Clone)]
pub struct AcademicsStatusInfo {
    pub attends_university: bool,
    pub weekly_study_mode: String,
    pub subject_scores_json: String,
    pub exam_accum_score: f64,
    pub last_grade: Option<i64>,
    pub last_grade_risk: String,
    pub eligibility_blocked: bool,
    pub university_major: Option<String>,
    pub major_selected: bool,
    pub next_exam_label: String,
    pub weeks_until_next_exam: i64,
}

#[allow(clippy::type_complexity)]
pub fn get_academics_status() -> anyhow::Result<Option<AcademicsStatusInfo>> {
    with_state(|state| {
        let contract: Option<String> =
            state.slot_conn.query_row("SELECT contract FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).optional()?;
        let Some(contract) = contract else { return Ok(None) };
        let contract_json: serde_json::Value = serde_json::from_str(&contract).unwrap_or(serde_json::Value::Null);
        let Some(team_id) = contract_json.get("team_id").and_then(|v| v.as_str()) else { return Ok(None) };
        let league_id: Option<String> =
            state.content_conn.query_row("SELECT league_id FROM teams WHERE id = ?1", [team_id], |r| r.get(0)).optional()?;
        if !matches!(league_id.as_deref(), Some("league:hs") | Some("league:univ")) {
            return Ok(None);
        }

        let row: Option<(i64, String, String, f64, Option<i64>, String, i64, Option<String>, i64)> = state
            .slot_conn
            .query_row(
                "SELECT attends_university, weekly_study_mode, subject_scores, exam_accum_score, last_grade, last_grade_risk,
                        eligibility_blocked, university_major, major_selected
                 FROM academics WHERE id = 'proto:1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)),
            )
            .optional()?;
        let Some((
            attends_university,
            weekly_study_mode,
            subject_scores_json,
            exam_accum_score,
            last_grade,
            last_grade_risk,
            eligibility_blocked,
            university_major,
            major_selected,
        )) = row
        else {
            return Ok(None); // academics 행이 없는 구버전 세이브
        };

        let current_day: i64 = state.slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
        let (next_exam_label, weeks_until_next_exam) = crate::sim::academics::weeks_until_next_exam(crate::calendar::week_for_day(current_day));

        Ok(Some(AcademicsStatusInfo {
            attends_university: attends_university == 1,
            weekly_study_mode,
            subject_scores_json,
            exam_accum_score,
            last_grade,
            last_grade_risk,
            eligibility_blocked: eligibility_blocked == 1,
            university_major,
            major_selected: major_selected == 1,
            next_exam_label: next_exam_label.to_string(),
            weeks_until_next_exam,
        }))
    })
}

/// 주간 학습모드 변경 — `sim::academics::STUDY_MODES`(focus/normal/rest/sleep) 중 하나.
pub fn set_weekly_study_mode(mode: String) -> anyhow::Result<()> {
    with_state(|state| repository::set_weekly_study_mode(&state.slot_conn, &mode))
}

/// 대학 전공 확정 — `sim::academics::UNIVERSITY_MAJORS`(체육교육/스포츠과학/일반전공) 중 하나.
pub fn set_university_major(major: String) -> anyhow::Result<()> {
    with_state(|state| repository::set_university_major(&state.slot_conn, &major))
}

/// 과목 석차백분율(1=상위)을 9등급으로 — 학업 탭 과목별 표에서 순수 계산이라
/// I/O·락 없이 동기 호출로 둔다(`power_names()`와 같은 패턴).
#[flutter_rust_bridge::frb(sync)]
pub fn percentile_to_grade(percentile: f64) -> i64 {
    crate::sim::academics::percentile_to_grade(percentile) as i64
}

/// 1구 조작 집중뷰의 구위 다이얼 3단계 — `sim::pitch::Power`의 라벨
/// 그대로(`resolve_choice`의 `"구종:x:y:구위"` choice_id 마지막 파트에
/// 이 이름을 그대로 넣으면 된다). 투구 위치는 더 이상 고정 목록이 아니라
/// 연속좌표(대화 2026-07-25, 매치 화면 재설계)라 별도 이름 목록이 없다 —
/// Dart 쪽 코스 캔버스가 탭 위치를 직접 x,y로 변환해 보낸다. 순수 계산
/// (I/O·락 없음)이라 동기 호출로 둔다.
#[flutter_rust_bridge::frb(sync)]
pub fn power_names() -> Vec<String> {
    crate::sim::pitch::Power::ALL.iter().map(|p| p.label().to_string()).collect()
}

/// 홈 화면 실제 날짜 표시용(대화 2026-07-21) — `crate::calendar`를 그대로
/// 감싼다. 순수 계산이라 동기 호출.
#[derive(Debug, Clone)]
pub struct CalendarDateInfo {
    pub year: i64,
    pub month: i64,
    pub day: i64,
}

#[flutter_rust_bridge::frb(sync)]
pub fn calendar_date_for_day(day: i64) -> CalendarDateInfo {
    let (year, month, day) = crate::calendar::calendar_date_for_day(day);
    CalendarDateInfo { year, month: month as i64, day: day as i64 }
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

/// 캐릭터 생성 "학교 선택" 상세 카드용 — [02_고교](../../../02_기획/리그팀/02_고교.md)
/// §3의 "전력★"은 실제로는 content.db에 옮겨진 적이 없는 설계문서
/// 전용값이라(확인 완료, 대화 2026-07-21), 대신 이미 시드된
/// `team_history.season_ranks`(최근 5시즌 순위)에서 별점을 계산한다 —
/// 시드마다 달라질 수 있는 "살아있는" 값이라 정적 문서값보다 게임
/// 데이터에 충실하다. `teams.stadium_id`(권역별 거점구장 공유 —
/// `content::load_team_groups_for_schedule`가 스케줄링에 쓰는 것과 동일
/// 그룹)로 묶은 뒤 그 안에서의 상대 순위로 별점을 매겨, 6팀 권역과
/// 20팀 권역을 공정하게 비교한다. `stadium_name`/`park_factor`는 그
/// 권역이 공유하는 거점구장 정보(`stadiums` 테이블) — 학교마다 고유
/// 구장이 아니라 같은 권역이면 값이 같다(대화 2026-07-21).
#[derive(Debug, Clone)]
pub struct HsSchoolDetail {
    pub team_id: String,
    pub name: String,
    pub region: String,
    pub stars: i64,
    pub season_ranks_json: String,
    pub titles_json: String,
    pub rivals_json: String,
    pub budget: f64,
    pub stadium_name: String,
    pub park_factor: String,
}

fn stars_from_group_position(position_zero_based: usize, group_size: usize) -> i64 {
    if group_size == 0 {
        return 3;
    }
    let band = (position_zero_based * 5) / group_size;
    (5 - band as i64).clamp(1, 5)
}

fn avg_rank_from_season_ranks(raw: &str) -> f64 {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) else {
        return f64::MAX;
    };
    let Some(obj) = v.as_object() else {
        return f64::MAX;
    };
    let values: Vec<f64> = obj.values().filter_map(|x| x.as_f64()).collect();
    if values.is_empty() {
        return f64::MAX;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

type HsSchoolHistoryRow =
    (String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<f64>, Option<String>, Option<String>);

pub fn list_hs_school_details(content_db_path: String) -> anyhow::Result<Vec<HsSchoolDetail>> {
    let conn = content::open(&content_db_path)?;
    let mut stmt = conn.prepare(
        "SELECT teams.id, teams.meta, teams.stadium_id, team_history.season_ranks, team_history.titles, team_history.rivals, team_history.budget,
                stadiums.name, stadiums.park_factor
         FROM teams
         JOIN team_history ON team_history.team_id = teams.id
         LEFT JOIN stadiums ON stadiums.id = teams.stadium_id
         WHERE teams.league_id = 'league:hs'
         ORDER BY teams.id",
    )?;
    let rows: Vec<HsSchoolHistoryRow> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)))?
        .collect::<Result<_, _>>()?;
    drop(stmt);

    // stadium_id(권역)별로 묶어 그룹 내 평균순위 오름차순 위치를 구한다.
    let mut by_group: std::collections::BTreeMap<String, Vec<(usize, f64)>> = std::collections::BTreeMap::new();
    let avg_ranks: Vec<f64> = rows.iter().map(|(_, _, _, ranks, ..)| avg_rank_from_season_ranks(ranks.as_deref().unwrap_or("{}"))).collect();
    for (i, (_, _, stadium_id, ..)) in rows.iter().enumerate() {
        let key = stadium_id.clone().unwrap_or_else(|| "ungrouped".to_string());
        by_group.entry(key).or_default().push((i, avg_ranks[i]));
    }
    let mut stars_by_index = vec![3i64; rows.len()];
    for group in by_group.values() {
        let mut sorted = group.clone();
        sorted.sort_by(|a, b| a.1.total_cmp(&b.1));
        for (pos, (idx, _)) in sorted.iter().enumerate() {
            stars_by_index[*idx] = stars_from_group_position(pos, sorted.len());
        }
    }

    let details = rows
        .into_iter()
        .enumerate()
        .map(|(i, (team_id, meta, _, season_ranks, titles, rivals, budget, stadium_name, park_factor))| {
            let meta_v: serde_json::Value = meta.as_deref().and_then(|m| serde_json::from_str(m).ok()).unwrap_or(serde_json::Value::Null);
            HsSchoolDetail {
                name: meta_v.get("name").and_then(|x| x.as_str()).unwrap_or(&team_id).to_string(),
                region: meta_v.get("region").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                team_id,
                stars: stars_by_index[i],
                season_ranks_json: season_ranks.unwrap_or_else(|| "{}".to_string()),
                titles_json: titles.unwrap_or_else(|| "[]".to_string()),
                rivals_json: rivals.unwrap_or_else(|| "[]".to_string()),
                budget: budget.unwrap_or(0.0),
                stadium_name: stadium_name.unwrap_or_default(),
                park_factor: park_factor.unwrap_or_default(),
            }
        })
        .collect();
    Ok(details)
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

/// [06_훈련_시스템](../../../02_기획/육성코어/06_훈련_시스템.md) §2-1
/// 훈련종류 카탈로그(6종) — 훈련 탭이 스탯 드롭다운 대신 이 목록을
/// 주/보조 훈련 선택 카드로 보여준다. 각 항목의 `stats`는 그 훈련종류가
/// 영향을 주는 능력치 2개(순서 무관).
#[derive(Debug, Clone)]
pub struct TrainingTypeInfo {
    pub id: String,
    pub name: String,
    pub stats: Vec<String>,
}

/// 순수 상수라 동기.
#[flutter_rust_bridge::frb(sync)]
pub fn training_type_options() -> Vec<TrainingTypeInfo> {
    crate::sim::training::TRAINING_TYPES
        .iter()
        .map(|t| TrainingTypeInfo { id: t.id.to_string(), name: t.name.to_string(), stats: t.stats.iter().map(|s| s.to_string()).collect() })
        .collect()
}

/// 캐릭터 생성 화면 "투수 타입" 카드용(대화 2026-07-23) — 타입별 우세
/// 스탯(`exposed_stat_names()`의 9종 중 어느 것이 상단/중간 밴드인지)과
/// 습득 가능 2구종 후보 풀. `sim::protagonist::archetype_bands`/
/// `full_second_pitch_pool`을 그대로 노출 — RNG·DB 없는 순수 조회라 동기.
#[derive(Debug, Clone)]
pub struct PitcherArchetypeInfo {
    pub name: String,
    pub primary_stats: Vec<String>,
    pub minor_stats: Vec<String>,
    pub pitch_pool: Vec<String>,
    /// `exposed_stat_names()`와 같은 순서(9종)의 밴드 중앙값 — 카드
    /// 그래프 길이를 실제 생성값 근처로 보정하는 용도(대화 2026-07-23).
    pub stat_midpoints: Vec<f64>,
}

#[flutter_rust_bridge::frb(sync)]
pub fn pitcher_archetype_info() -> anyhow::Result<Vec<PitcherArchetypeInfo>> {
    crate::sim::protagonist::ARCHETYPES
        .iter()
        .map(|&name| {
            let (primary, minor) = crate::sim::protagonist::archetype_bands(name)?;
            let pool = crate::sim::protagonist::full_second_pitch_pool(name)?;
            let stat_midpoints = crate::sim::protagonist::archetype_stat_midpoints(name)?;
            Ok(PitcherArchetypeInfo {
                name: name.to_string(),
                primary_stats: primary.iter().map(|s| s.to_string()).collect(),
                minor_stats: minor.iter().map(|s| s.to_string()).collect(),
                pitch_pool: pool.iter().map(|s| s.to_string()).collect(),
                stat_midpoints,
            })
        })
        .collect()
}

/// 현재 훈련 설정 — 한 번도 설정 안 했으면 `None`(§1 "훈련 계획을 아직
/// 안 짰다"는 자연스러운 초기 상태, `set_protagonist_training` 문서 참고).
#[derive(Debug, Clone)]
pub struct TrainingConfigInfo {
    pub primary_training: String,
    pub secondary_training: String,
    pub intensity: String,
    pub new_pitch: Option<String>,
    /// 기존 구종 마스터리업 대상(05_구종_시스템.md §2, 대화 2026-07-23) —
    /// `new_pitch`와 상호 배타.
    pub mastery_pitch: Option<String>,
    /// `new_pitch`/`mastery_pitch` 진행도(주 단위) — 둘 다 `None`이면 0.
    /// 화면에서 "N/M주 진행 중" 표시용.
    pub pitch_weeks: i64,
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
        Ok(Some(TrainingConfigInfo {
            primary_training: v.get("primary_training").and_then(|s| s.as_str()).unwrap_or("").to_string(),
            secondary_training: v.get("secondary_training").and_then(|s| s.as_str()).unwrap_or("").to_string(),
            intensity: v.get("intensity").and_then(|s| s.as_str()).unwrap_or("보통").to_string(),
            new_pitch: v.get("new_pitch").and_then(|s| s.as_str()).map(str::to_string),
            mastery_pitch: v.get("mastery_pitch").and_then(|s| s.as_str()).map(str::to_string),
            pitch_weeks: v.get("pitch_weeks").and_then(|w| w.as_i64()).unwrap_or(0),
        }))
    })
}

/// 훈련 슬롯 설정 — [01_내선수](../../../04_UI기획/01_내선수.md) §3 훈련
/// 탭이 호출. `repository::set_protagonist_training`을 그대로 감싼다.
/// `new_pitch`는 신규 구종 습득 슬롯(대화 2026-07-21) — `pitch_type_names`
/// 로 받은 카탈로그 중 아직 안 배운 구종 하나를 골라 넘기면 그 주부터
/// `pitch_weeks` 진행도가 쌓인다. `mastery_pitch`는 이미 아는 구종의
/// 마스터리 단계를 올리는 슬롯(05_구종_시스템.md §2, 대화 2026-07-23) —
/// 둘 중 하나만 넘길 수 있다.
pub fn set_training(
    primary_training: String,
    secondary_training: String,
    intensity: String,
    new_pitch: Option<String>,
    mastery_pitch: Option<String>,
) -> anyhow::Result<()> {
    with_state(|state| {
        repository::set_protagonist_training(
            &state.slot_conn,
            &primary_training,
            &secondary_training,
            &intensity,
            new_pitch.as_deref(),
            mastery_pitch.as_deref(),
        )
    })
}

/// 신규 구종 습득 슬롯 드롭다운용 — [05_구종_시스템](../../../02_기획/육성코어/05_구종_시스템.md)
/// §1의 10종 카탈로그(`content.db`의 `pitch_types`). 세션이 이미 열려있는
/// 상태(내 정보 화면)에서만 호출되므로 `list_hs_teams`처럼 경로를 따로 안
/// 받고 세션의 `content_conn`을 그대로 씀.
pub fn pitch_type_names() -> anyhow::Result<Vec<String>> {
    with_state(|state| {
        let mut stmt = state.content_conn.prepare("SELECT name FROM pitch_types ORDER BY id")?;
        let rows: Vec<String> = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// 습득 조건 한 줄(05_구종_시스템.md §3, 대화 2026-07-25) — `LockedPitchInfo`
/// 안에서만 쓰인다.
#[derive(Debug, Clone)]
pub struct PitchRequirementInfo {
    pub stat: String,
    pub min_value: f64,
    pub current_value: f64,
    pub met: bool,
}

/// 아직 습득 조건을 다 못 채운 구종 하나 — 조건 줄 전부(이미 채운 것
/// 포함)를 담아 UI가 "다음 목표" 진행 상황을 여러 줄로 보여줄 수 있게 함.
#[derive(Debug, Clone)]
pub struct LockedPitchInfo {
    pub name: String,
    pub requirements: Vec<PitchRequirementInfo>,
}

/// `learnable_pitches` 조회 결과.
#[derive(Debug, Clone)]
pub struct LearnablePitchesInfo {
    /// 조건을 전부 충족해 바로 "신규 습득" 슬롯에 배정 가능한 구종.
    pub eligible: Vec<String>,
    /// `eligible`이 비었을 때만 채워지는, 조건 격차(충족 못한 조건들의
    /// (임계-현재) 합)가 가장 작은 다음 목표 하나.
    pub next_candidate: Option<LockedPitchInfo>,
}

/// "신규 구종 습득" 슬롯 후보 조회 — [05_구종_시스템](../../../02_기획/육성코어/05_구종_시스템.md)
/// §3 습득 조건(스탯 임계값)을 실제로 반영한다(대화 2026-07-25, 이전엔
/// `pitch_type_names`에서 이미 보유한 것만 뺀 카탈로그 전체를 그대로
/// 드롭다운에 뿌렸음). 보유 구종 상한 도달 시 둘 다 빈 값(카드가 "상한"
/// 안내를 보여줌). `eligible`이 비었으면 `next_candidate`로 가장 가까운
/// 목표 하나만 안내 — 카탈로그 전체를 드러내지 않으면서도 완전히
/// 깜깜이는 아니게.
pub fn learnable_pitches() -> anyhow::Result<LearnablePitchesInfo> {
    with_state(|state| {
        let (pitches_raw, stats_raw): (String, String) = state
            .slot_conn
            .query_row("SELECT pitches, stats FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        let pitches: Vec<serde_json::Value> = serde_json::from_str(&pitches_raw)?;
        let known_names = repository::pitch_names_from_mastery(&pitches);
        if known_names.len() >= repository::MAX_KNOWN_PITCHES {
            return Ok(LearnablePitchesInfo { eligible: Vec::new(), next_candidate: None });
        }
        let stats: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&stats_raw)?;

        let mut stmt = state.content_conn.prepare("SELECT name FROM pitch_types ORDER BY id")?;
        let catalog: Vec<String> = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;

        let mut eligible = Vec::new();
        let mut best_candidate: Option<(f64, LockedPitchInfo)> = None;
        for pitch in catalog {
            if known_names.contains(&pitch) {
                continue;
            }
            let reqs = crate::sim::protagonist::pitch_acquisition_requirements(&pitch);
            if reqs.is_empty() {
                continue; // 시작 구종이거나 조건 미정의 — 습득 대상 아님
            }
            let lines: Vec<PitchRequirementInfo> = reqs
                .iter()
                .map(|(stat, min)| {
                    let current = stats.get(*stat).and_then(|v| v.as_f64()).unwrap_or(0.0);
                    PitchRequirementInfo { stat: stat.to_string(), min_value: *min, current_value: current, met: current >= *min }
                })
                .collect();
            if lines.iter().all(|l| l.met) {
                eligible.push(pitch);
            } else {
                let gap: f64 = lines.iter().map(|l| (l.min_value - l.current_value).max(0.0)).sum();
                if best_candidate.as_ref().is_none_or(|(best_gap, _)| gap < *best_gap) {
                    best_candidate = Some((gap, LockedPitchInfo { name: pitch, requirements: lines }));
                }
            }
        }

        Ok(LearnablePitchesInfo { eligible, next_candidate: best_candidate.map(|(_, info)| info) })
    })
}

/// 보유 구종 상한(05_구종_시스템.md §3, 대화 2026-07-24) — 순수 상수라 동기.
#[flutter_rust_bridge::frb(sync)]
pub fn max_known_pitches() -> u32 {
    repository::MAX_KNOWN_PITCHES as u32
}

/// 캐릭터 생성 "개인 신체" 페이지 혈액형 드롭다운용 — 순수 상수라 동기.
#[flutter_rust_bridge::frb(sync)]
pub fn blood_type_names() -> Vec<String> {
    repository::BLOOD_TYPES.iter().map(|s| s.to_string()).collect()
}

/// 캐릭터 생성 "개인 신체" 페이지 출신지역 드롭다운용(8권역) — 순수 상수라 동기.
#[flutter_rust_bridge::frb(sync)]
pub fn hometown_region_names() -> Vec<String> {
    repository::HOMETOWN_REGIONS.iter().map(|s| s.to_string()).collect()
}

/// [01_내선수](../../../04_UI기획/01_내선수.md) 상태 탭 등에서 표시할 개인
/// 신체 정보 — 한 번도 설정 안 했으면(구세이브 포함) `None`.
#[derive(Debug, Clone)]
pub struct ProtagonistProfileInfo {
    pub birth_year: i64,
    pub birth_month: i64,
    pub birth_day: i64,
    pub height_cm: f64,
    pub weight_kg: f64,
    pub blood_type: String,
    pub hometown: String,
    pub jersey_number: i64,
}

pub fn get_protagonist_profile() -> anyhow::Result<Option<ProtagonistProfileInfo>> {
    with_state(|state| {
        let raw: Option<String> = state
            .slot_conn
            .query_row("SELECT profile FROM protagonist WHERE id = 'proto:1'", [], |r| r.get::<_, Option<String>>(0))
            .optional()?
            .flatten();
        let Some(raw) = raw else {
            return Ok(None);
        };
        let v: serde_json::Value = serde_json::from_str(&raw)?;
        Ok(Some(ProtagonistProfileInfo {
            birth_year: v.get("birth_year").and_then(|x| x.as_i64()).unwrap_or(2010),
            birth_month: v.get("birth_month").and_then(|x| x.as_i64()).unwrap_or(1),
            birth_day: v.get("birth_day").and_then(|x| x.as_i64()).unwrap_or(1),
            height_cm: v.get("height_cm").and_then(|x| x.as_f64()).unwrap_or(0.0),
            weight_kg: v.get("weight_kg").and_then(|x| x.as_f64()).unwrap_or(0.0),
            blood_type: v.get("blood_type").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            hometown: v.get("hometown").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            jersey_number: v.get("jersey_number").and_then(|x| x.as_i64()).unwrap_or(0),
        }))
    })
}

/// 캐릭터 생성 화면이 `newGame` 직후 호출 — `set_training`과 동일하게
/// `repository::set_protagonist_profile`을 그대로 감싼다.
#[allow(clippy::too_many_arguments)]
pub fn set_protagonist_profile(
    birth_month: i64,
    birth_day: i64,
    height_cm: f64,
    weight_kg: f64,
    blood_type: String,
    hometown: String,
    jersey_number: i64,
) -> anyhow::Result<()> {
    with_state(|state| {
        repository::set_protagonist_profile(&state.slot_conn, birth_month, birth_day, height_cm, weight_kg, &blood_type, &hometown, jersey_number)
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
/// 개인 시즌/통산 성적은 `get_team_season_batting_stats`/`get_team_season_pitching_stats`/
/// `get_player_career_batting_stats`/`get_player_career_pitching_stats`(Phase 5,
/// 대화 2026-07-24)로 별도 조회.
#[derive(Debug, Clone)]
pub struct RosterPlayerInfo {
    pub id: String,
    pub name: String,
    pub position: String,
    pub age: i64,
    pub stats_json: String,
    pub pitches_json: Option<String>,
}

/// 리그 화면 "로스터" 탭용 — 선수만(감독/코치/구단주 제외, 대화
/// 2026-07-24에서 발견한 버그 수정: 예전엔 이 가드가 없어 스태프가
/// 전술력·신뢰형성력 같은 낯선 숫자를 달고 선수단 목록에 섞여 나왔다).
/// 스태프는 `list_team_staff`로 따로 조회.
pub fn list_roster(team_id: String) -> anyhow::Result<Vec<RosterPlayerInfo>> {
    with_state(|state| {
        let mut stmt = state.slot_conn.prepare(
            "SELECT id, name, position, age, stats, pitches FROM npc
             WHERE team_id = ?1 AND retired = 0 AND position NOT IN ('감독', '코치', '구단주')
             ORDER BY position, id",
        )?;
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

/// 리그 화면 "로스터" 탭의 스태프 카드용(대화 2026-07-24) — 감독/코치/
/// 구단주만. `list_roster`와 같은 모양(`RosterPlayerInfo`)을 그대로
/// 재사용해 Dart 쪽 파싱 로직을 공유할 수 있게 한다.
pub fn list_team_staff(team_id: String) -> anyhow::Result<Vec<RosterPlayerInfo>> {
    with_state(|state| {
        let mut stmt = state.slot_conn.prepare(
            "SELECT id, name, position, age, stats, pitches FROM npc
             WHERE team_id = ?1 AND retired = 0 AND position IN ('감독', '코치', '구단주')
             ORDER BY position",
        )?;
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

/// 타자 시즌/통산 기록(Phase 5, 대화 2026-07-24) — `RosterPlayerInfo`와
/// 짝지어 로스터 화면에 성적을 보여주는 용도. `repository::NpcBattingLine`
/// 계산식을 그대로 노출.
#[derive(Debug, Clone)]
pub struct PlayerBattingStats {
    pub player_id: String,
    pub name: String,
    pub plate_appearances: i64,
    pub at_bats: i64,
    pub hits: i64,
    pub home_runs: i64,
    pub walks: i64,
    pub rbi: i64,
    pub stolen_bases: i64,
    pub caught_stealing: i64,
    pub strikeouts: i64,
    pub batting_average: f64,
    pub on_base_percentage: f64,
    pub slugging_percentage: f64,
    pub ops: f64,
}

impl PlayerBattingStats {
    fn from_line(player_id: String, name: String, line: &repository::NpcBattingLine) -> Self {
        Self {
            player_id,
            name,
            plate_appearances: line.plate_appearances,
            at_bats: line.at_bats,
            hits: line.hits,
            home_runs: line.home_runs,
            walks: line.walks,
            rbi: line.rbi,
            stolen_bases: line.stolen_bases,
            caught_stealing: line.caught_stealing,
            strikeouts: line.strikeouts,
            batting_average: line.batting_average(),
            on_base_percentage: line.on_base_percentage(),
            slugging_percentage: line.slugging_percentage(),
            ops: line.ops(),
        }
    }
}

/// `PlayerBattingStats`와 대칭인 투수 쪽.
#[derive(Debug, Clone)]
pub struct PlayerPitchingStats {
    pub player_id: String,
    pub name: String,
    pub innings_pitched: f64,
    pub strikeouts: i64,
    pub walks: i64,
    pub hits_allowed: i64,
    pub runs_allowed: i64,
    pub saves: i64,
    pub holds: i64,
    pub errors: i64,
    pub era: f64,
    pub whip: f64,
    pub k_per_9: f64,
}

impl PlayerPitchingStats {
    fn from_line(player_id: String, name: String, line: &repository::NpcPitchingLine) -> Self {
        Self {
            player_id,
            name,
            innings_pitched: line.innings_pitched(),
            strikeouts: line.strikeouts,
            walks: line.walks,
            hits_allowed: line.hits_allowed,
            runs_allowed: line.runs_allowed,
            saves: line.saves,
            holds: line.holds,
            errors: line.errors,
            era: line.era(),
            whip: line.whip(),
            k_per_9: line.k_per_9(),
        }
    }
}

/// 리그 화면 로스터 탭의 "이번 시즌" 타자 성적(Phase 5) — 그 팀 타자
/// 전원(포지션이 투수 3종이 아닌 선수)의 진행 중 `season_stats` 합산.
pub fn get_team_season_batting_stats(team_id: String) -> anyhow::Result<Vec<PlayerBattingStats>> {
    with_state(|state| {
        let mut stmt = state.slot_conn.prepare(
            "SELECT id, name FROM npc
             WHERE team_id = ?1 AND retired = 0 AND position NOT IN ('감독', '코치', '구단주', '선발투수', '중계투수', '마무리투수')
             ORDER BY id",
        )?;
        let batters: Vec<(String, String)> = stmt.query_map([&team_id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
        drop(stmt);

        batters
            .into_iter()
            .map(|(id, name)| {
                let raw = repository::aggregate_stats_line(&state.slot_conn, "season_stats", &id)?;
                let line = repository::NpcBattingLine::from_json(&raw);
                Ok(PlayerBattingStats::from_line(id, name, &line))
            })
            .collect()
    })
}

/// 리그 화면 로스터 탭의 "이번 시즌" 투수 성적(Phase 5) — 그 팀 투수
/// 전원(선발/중계/마무리)의 진행 중 `season_stats` 합산.
pub fn get_team_season_pitching_stats(team_id: String) -> anyhow::Result<Vec<PlayerPitchingStats>> {
    with_state(|state| {
        let mut stmt = state
            .slot_conn
            .prepare("SELECT id, name FROM npc WHERE team_id = ?1 AND retired = 0 AND position IN ('선발투수', '중계투수', '마무리투수') ORDER BY id")?;
        let pitchers: Vec<(String, String)> = stmt.query_map([&team_id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
        drop(stmt);

        pitchers
            .into_iter()
            .map(|(id, name)| {
                let raw = repository::aggregate_stats_line(&state.slot_conn, "season_stats", &id)?;
                let line = repository::NpcPitchingLine::from_json(&raw);
                Ok(PlayerPitchingStats::from_line(id, name, &line))
            })
            .collect()
    })
}

/// 선수 한 명의 통산(시즌 아카이브 전체 합산) 타자 기록(Phase 5) —
/// `npc_season_history`(과거 확정 시즌들) 전체를 합산. 이번 시즌 진행분은
/// 아직 아카이브되지 않았으므로(시즌 종료 시점에만 archive) 포함 안 됨 —
/// `get_team_season_batting_stats`가 그 몫을 담당.
pub fn get_player_career_batting_stats(player_id: String) -> anyhow::Result<PlayerBattingStats> {
    with_state(|state| {
        let name: String =
            state.slot_conn.query_row("SELECT name FROM npc WHERE id = ?1", [&player_id], |r| r.get(0)).optional()?.unwrap_or_default();
        let raw = repository::aggregate_stats_line(&state.slot_conn, "npc_season_history", &player_id)?;
        let line = repository::NpcBattingLine::from_json(&raw);
        Ok(PlayerBattingStats::from_line(player_id, name, &line))
    })
}

/// `get_player_career_batting_stats`와 대칭인 투수 쪽.
pub fn get_player_career_pitching_stats(player_id: String) -> anyhow::Result<PlayerPitchingStats> {
    with_state(|state| {
        let name: String =
            state.slot_conn.query_row("SELECT name FROM npc WHERE id = ?1", [&player_id], |r| r.get(0)).optional()?.unwrap_or_default();
        let raw = repository::aggregate_stats_line(&state.slot_conn, "npc_season_history", &player_id)?;
        let line = repository::NpcPitchingLine::from_json(&raw);
        Ok(PlayerPitchingStats::from_line(player_id, name, &line))
    })
}

/// 캐릭터 생성 화면 "학교 선택" 미리보기(대화 2026-07-23) — 아직 새 게임을
/// 시작하지 않아 슬롯이 없는 상태에서도 `world_seed`(캐릭터 생성 화면
/// 진입 시 한 번 고정된 시드, Dart가 `new_game`에도 그대로 넘김)만 있으면
/// `list_roster`와 같은 모양의 결과를 미리 보여줄 수 있다. `list_roster`와
/// 달리 활성 세션이 필요 없다(`list_hs_school_details`와 같은 패턴 —
/// `content_db_path`로 독립 커넥션만 연다).
pub fn preview_hs_roster(content_db_path: String, world_seed: i64, team_id: String) -> anyhow::Result<Vec<RosterPlayerInfo>> {
    let content_conn = content::open(&content_db_path)?;
    let rows = repository::preview_hs_roster(&content_conn, world_seed, &team_id)?;
    Ok(rows
        .into_iter()
        .map(|(id, name, position, age, stats_json, pitches_json)| RosterPlayerInfo { id, name, position, age, stats_json, pitches_json })
        .collect())
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

/// `get_standings`의 실제 계산 — `&GameState`를 직접 받아 `STATE` 락을
/// 새로 걸지 않는다. `list_active_competitions`처럼 이미 `with_state`
/// 안에 있는 호출부가 이 함수를 재사용할 수 있게 분리(대화 2026-07-26)
/// — `with_state` 안에서 `get_standings`(자체적으로 또 `with_state`를
/// 거는 wire 함수)를 그대로 부르면 `Mutex`가 재진입 불가라 그 자리에서
/// 영원히 멈춘다(실제로 겪은 데드락).
fn standings_rows(state: &GameState, league_id: &str) -> anyhow::Result<Vec<StandingsRowInfo>> {
    let mut team_stmt = state.content_conn.prepare("SELECT id FROM teams WHERE league_id = ?1")?;
    let team_ids: Vec<String> = team_stmt.query_map([league_id], |r| r.get(0))?.collect::<Result<_, _>>()?;

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
    Ok(rows.into_iter().enumerate().map(|(i, (team_id, w, l, t))| StandingsRowInfo { team_id, rank: i as i64 + 1, wins: w, losses: l, ties: t }).collect())
}

pub fn get_standings(league_id: String) -> anyhow::Result<Vec<StandingsRowInfo>> {
    with_state(|state| standings_rows(state, &league_id))
}

/// 대회 종류(kind)의 한국어 표시명 — `data::repository`가 만드는 tournament
/// id/kind 문자열은 엔진 내부 식별자라 UI에 그대로 노출하면 안 됨.
fn tournament_display_name(kind: &str) -> &str {
    match kind {
        "pro_postseason" => "프로 포스트시즌",
        "pro_farm_postseason" => "퓨처스 포스트시즌",
        "independent" => "독립리그 플레이오프",
        "univ_wangjungwang" => "왕중왕전",
        "univ_eunhagi" => "은하기",
        "univ_yeongmyeonggi" => "여명기",
        "hs_gaenari" => "개나리기",
        "hs_jangmi" => "장미기",
        "hs_mugunghwa" => "무궁화기",
        "hs_paewang" => "패왕기",
        "hs_gukhwa" => "국화기",
        other => other,
    }
}

/// `tournaments.participants`가 넉아웃/게이지는 `["team:a", ...]`(평면),
/// 예선 라운드로빈 스테이지는 `[["team:a", ...], [...]]`(조별 중첩) 두
/// 형태 다 가능(대화 2026-07-26) — 어느 쪽이든 팀 하나가 포함돼 있는지만
/// 재귀로 본다. 이 컬럼은 대회 시작 시점의 최초 참가 풀에서 이후 갱신되지
/// 않으므로(스테이지가 진행돼도 그대로) "이 팀이 이 대회에 참가한 적
/// 있는가"를 시즌 내내 안정적으로 답한다 — 리그 탭 카드가 탈락 후에도
/// 유지돼야 한다는 요구와 자연히 맞아떨어짐.
fn tournament_includes_team(participants_json: &str, team_id: &str) -> bool {
    fn contains(v: &serde_json::Value, team_id: &str) -> bool {
        match v {
            serde_json::Value::String(s) => s == team_id,
            serde_json::Value::Array(a) => a.iter().any(|x| contains(x, team_id)),
            _ => false,
        }
    }
    serde_json::from_str::<serde_json::Value>(participants_json).map(|v| contains(&v, team_id)).unwrap_or(false)
}

/// 리그 탭 "진행중인 대회" 카드 하나(대화 2026-07-26) — `kind`가
/// `"league"`면 리그 순위 카드(팀마다 항상 1개), `"tournament"`면 이번
/// 시즌 참가한 대회 카드.
#[derive(Debug, Clone)]
pub struct CompetitionCardInfo {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub status_summary: String,
    pub is_eliminated: bool,
    pub is_champion: bool,
}

/// 리그 탭 "진행중인 대회" 세션 — 팀이 소속된 리그 순위 카드(항상 1개) +
/// 이번 시즌 참가한 대회 카드(있는 만큼, `tournaments.season`이 지금
/// 시즌과 같고 `participants`에 이 팀이 포함된 것만). 대회 카드는
/// 우승/탈락이 확정돼도(그 시즌 동안은) 그대로 유지되고, 시즌이
/// 바뀌면 자연히 사라졌다가 다시 참가하면 새로 나타난다 — **중간에
/// 대진에서 탈락해도(다른 팀들 경기가 아직 안 끝났으면) 대회 전체가
/// `status='done'`이 되기 전까지는 "진행 중"으로 보임**(1차 축소안 —
/// 매치업별 실시간 탈락 판정은 이월).
pub fn list_active_competitions(team_id: String) -> anyhow::Result<Vec<CompetitionCardInfo>> {
    with_state(|state| {
        let league_id: String = state.content_conn.query_row("SELECT league_id FROM teams WHERE id = ?1", [&team_id], |r| r.get(0))?;
        let standings = standings_rows(state, &league_id)?;
        let status_summary = match standings.iter().find(|r| r.team_id == team_id) {
            Some(r) => format!("{}위 ({}승 {}패)", r.rank, r.wins, r.losses),
            None => "순위 정보 없음".to_string(),
        };
        let mut out = vec![CompetitionCardInfo {
            kind: "league".to_string(),
            id: league_id,
            name: "리그".to_string(),
            status_summary,
            is_eliminated: false,
            is_champion: false,
        }];

        let season = repository::current_season_value(&state.slot_conn)?;
        let mut stmt = state.slot_conn.prepare("SELECT id, kind, status, champion, participants FROM tournaments WHERE season = ?1")?;
        let rows: Vec<(String, String, String, Option<String>, String)> =
            stmt.query_map([season], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?.collect::<Result<_, _>>()?;
        for (tid, kind, status, champion, participants_json) in rows {
            if !tournament_includes_team(&participants_json, &team_id) {
                continue;
            }
            let is_champion = champion.as_deref() == Some(team_id.as_str());
            let is_done = status == "done";
            let status_summary =
                if is_done { if is_champion { "우승".to_string() } else { "탈락".to_string() } } else { "진행 중".to_string() };
            out.push(CompetitionCardInfo {
                kind: "tournament".to_string(),
                id: tid,
                name: tournament_display_name(&kind).to_string(),
                status_summary,
                is_eliminated: is_done && !is_champion,
                is_champion,
            });
        }
        Ok(out)
    })
}

/// 대회 브래킷 경기 한 줄 — `get_tournament_bracket`용. 팀 이름은 여기서
/// 안 채운다(UI가 이미 갖고 있는 팀 목록 조회 결과로 team_id→이름을
/// 매핑하는 게 중복 왕복 없이 더 싸다).
#[derive(Debug, Clone)]
pub struct BracketMatchInfo {
    pub round: i64,
    pub home: String,
    pub away: String,
    pub home_runs: Option<i64>,
    pub away_runs: Option<i64>,
    pub day: i64,
}

#[derive(Debug, Clone)]
pub struct TournamentBracketInfo {
    pub kind: String,
    pub display_name: String,
    pub status: String,
    pub champion: Option<String>,
    pub matches: Vec<BracketMatchInfo>,
}

/// 대회 카드를 탭했을 때 — 라운드별 매치업 전부(진행 중인 라운드는 아직
/// `home_runs`/`away_runs`가 `None`인 행으로, 이미 끝난 라운드는 채워진
/// 채로) 반환. `round`·`day` 오름차순이라 UI가 그대로 라운드별로 묶어
/// 그리면 된다.
pub fn get_tournament_bracket(tournament_id: String) -> anyhow::Result<TournamentBracketInfo> {
    with_state(|state| {
        let (kind, status, champion): (String, String, Option<String>) = state.slot_conn.query_row(
            "SELECT kind, status, champion FROM tournaments WHERE id = ?1",
            [&tournament_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let mut stmt = state.slot_conn.prepare("SELECT round, home, away, result, day FROM schedule WHERE tournament_id = ?1 ORDER BY round, day")?;
        let matches: Vec<BracketMatchInfo> = stmt
            .query_map([&tournament_id], |r| {
                let round: i64 = r.get(0)?;
                let home: String = r.get(1)?;
                let away: String = r.get(2)?;
                let result: Option<String> = r.get(3)?;
                let day: i64 = r.get(4)?;
                Ok((round, home, away, result, day))
            })?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(|(round, home, away, result, day)| {
                let (home_runs, away_runs) = result
                    .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                    .map(|v| (v.get("home").and_then(|x| x.as_i64()), v.get("away").and_then(|x| x.as_i64())))
                    .unwrap_or((None, None));
                BracketMatchInfo { round, home, away, home_runs, away_runs, day }
            })
            .collect();
        Ok(TournamentBracketInfo { display_name: tournament_display_name(&kind).to_string(), kind, status, champion, matches })
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
    /// Phase 6(§12 "기록 필드") — WHIP·K/9. 주인공은 항상 투수 아키타입
    /// (§7 DH)이라 타율 등 타격 스탯은 애초에 성립하지 않아, "개인기록"
    /// 탭엔 투수 기록만 노출한다.
    pub whip: f64,
    pub k_per_9: f64,
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
            whip: line.whip(),
            k_per_9: line.k_per_9(),
            retired: retired == 1,
            retirement_reason,
        })
    })
}

/// 매치 화면 투수 카드 "이번 시즌" 성적(대화 2026-07-25) — `career_summary`와
/// 같은 모양이지만 통산 전체가 아니라 진행 중인 시즌만(`aggregate_game_log`의
/// `season` 필터, `get_meta_status().season`과 동일한 값 사용).
pub fn get_protagonist_season_summary() -> anyhow::Result<CareerSummary> {
    with_state(|state| {
        let season = repository::current_season_value(&state.slot_conn)?;
        let line = repository::aggregate_game_log(&state.slot_conn, Some(season))?;
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
            whip: line.whip(),
            k_per_9: line.k_per_9(),
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

/// 내 정보 "커리어" 탭용(대화 2026-07-21) — 입학·진로선택 갈림길(드래프트/
/// 대학/독립/입대)·병역 만료·은퇴를 시간순으로. `repository::log_career_event`
/// 가 남긴 `career_events`를 그대로 조회. 트레이드·계약은 이미
/// `getContractHistory`(`league_transactions`)에 있어 여기 안 겹침.
#[derive(Debug, Clone)]
pub struct CareerEventInfo {
    pub day: i64,
    pub season: i64,
    pub kind: String,
    pub detail_json: String,
}

pub fn get_career_events() -> anyhow::Result<Vec<CareerEventInfo>> {
    with_state(|state| {
        let mut stmt = state.slot_conn.prepare("SELECT day, season, kind, detail FROM career_events ORDER BY id")?;
        let rows: Vec<CareerEventInfo> = stmt
            .query_map([], |r| Ok(CareerEventInfo { day: r.get(0)?, season: r.get(1)?, kind: r.get(2)?, detail_json: r.get(3)? }))?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// 기록 허브 "업적" 탭용(이월 부채 정리, 대화 2026-07-22) — content.db
/// `achievements`(정의, 아직 한 번도 안 달성됐어도 나와야 함)가 기준이고
/// slot.db `achievement_progress`(달성 여부·카운터)는 있으면 덧붙이는
/// 보조 조회. `unlock_achievement`(`data::repository`)가 이미 이 두
/// 테이블을 채우는 로직이라 여긴 순수 조회만.
#[derive(Debug, Clone)]
pub struct AchievementInfo {
    pub id: String,
    pub category: String,
    pub label: String,
    pub achieved: bool,
    pub achieved_day: Option<i64>,
    pub counter: i64,
}

pub fn get_achievements() -> anyhow::Result<Vec<AchievementInfo>> {
    with_state(|state| {
        let mut def_stmt = state.content_conn.prepare("SELECT id, category, meta FROM achievements ORDER BY id")?;
        let defs: Vec<(String, String, String)> = def_stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<Result<_, _>>()?;
        drop(def_stmt);

        let mut out = Vec::with_capacity(defs.len());
        for (id, category, meta_raw) in defs {
            let meta: serde_json::Value = serde_json::from_str(&meta_raw).unwrap_or_default();
            let label = meta.get("label").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
            let progress: Option<(i64, Option<i64>)> = state
                .slot_conn
                .query_row("SELECT counter, achieved_day FROM achievement_progress WHERE ach_id = ?1", [&id], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()?;
            let (counter, achieved_day) = progress.unwrap_or((0, None));
            out.push(AchievementInfo { id, category, label, achieved: achieved_day.is_some(), achieved_day, counter });
        }
        Ok(out)
    })
}

/// 기록 허브 "관계" 탭용(이월 부채 정리, 대화 2026-07-22) — 팀동료 관계
/// 데이터 자체가 엔진에 없어(§6-59 이후 반복 확인) **감독 관계만** 정직하게
/// 보여준다. 무소속(입대·미배정)이면 빈 목록.
#[derive(Debug, Clone)]
pub struct RelationshipInfo {
    pub npc_id: String,
    pub name: String,
    pub role: String,
    pub value: i64,
    pub arc_stage: i64,
}

pub fn get_relationships() -> anyhow::Result<Vec<RelationshipInfo>> {
    with_state(|state| {
        let contract_raw: String = state.slot_conn.query_row("SELECT contract FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
        let contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
        let Some(team_id) = contract.get("team_id").and_then(|v| v.as_str()) else {
            return Ok(vec![]);
        };
        let manager_id = format!("manager:{team_id}");
        let row: Option<(String, i64, i64)> = state
            .slot_conn
            .query_row(
                "SELECT npc.name, relationships.value, relationships.arc_stage
                 FROM relationships JOIN npc ON npc.id = relationships.npc_id
                 WHERE relationships.npc_id = ?1",
                [&manager_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        Ok(row
            .map(|(name, value, arc_stage)| vec![RelationshipInfo { npc_id: manager_id, name, role: "감독".to_string(), value, arc_stage }])
            .unwrap_or_default())
    })
}

/// 메시지함(`inbox`) — I8 이전 첫 실사용(§6-64 부상 전조 경고, `process_protagonist_week`
/// 가 유일한 생산자). AI 콘텐츠 저작이 아니라 시스템이 직접 생성하는
/// 경고 메시지라 I8 의존 없음.
#[derive(Debug, Clone)]
pub struct InboxMessageInfo {
    pub id: String,
    pub kind: String,
    pub urgency: String,
    pub read: bool,
    pub day: i64,
    pub body: String,
}

pub fn get_inbox() -> anyhow::Result<Vec<InboxMessageInfo>> {
    with_state(|state| {
        let mut stmt = state.slot_conn.prepare("SELECT id, kind, urgency, read, day, body FROM inbox ORDER BY day DESC, id DESC")?;
        let rows: Vec<InboxMessageInfo> = stmt
            .query_map([], |r| {
                Ok(InboxMessageInfo {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    urgency: r.get(2)?,
                    read: r.get::<_, i64>(3)? != 0,
                    day: r.get(4)?,
                    body: r.get(5)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    })
}

/// 메시지함 화면(I7)의 읽음 처리 — `repository::mark_inbox_read` 그대로.
pub fn mark_inbox_read(id: String) -> anyhow::Result<()> {
    with_state(|state| repository::mark_inbox_read(&state.slot_conn, &id))
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
    fn pitcher_archetype_info_covers_all_four_archetypes_with_known_bands() {
        let info = pitcher_archetype_info().unwrap();
        assert_eq!(info.len(), 4);

        let fastball = info.iter().find(|a| a.name == "강속구형").unwrap();
        assert_eq!(fastball.primary_stats, vec!["구속".to_string()]);
        assert_eq!(fastball.minor_stats, vec!["구위".to_string()]);
        assert_eq!(fastball.pitch_pool, vec!["투심 패스트볼".to_string(), "커터".to_string()]);
        // exposed_stat_names() 순서: 구속(0)=primary, 구위(4)=minor, 나머지=lower.
        assert_eq!(fastball.stat_midpoints.len(), 9);
        assert_eq!(fastball.stat_midpoints[0], 32.5); // 구속 — UPPER_BAND 중앙값
        assert_eq!(fastball.stat_midpoints[4], 28.0); // 구위 — MINOR_BAND 중앙값
        assert_eq!(fastball.stat_midpoints[1], 23.0); // 체력 — LOWER_BAND 중앙값

        let control = info.iter().find(|a| a.name == "제구형").unwrap();
        assert_eq!(control.pitch_pool.len(), 6);
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

        new_game("content.db".to_string(), 42, "API테스트".to_string(), "우완".to_string(), hs_team, "강속구형".to_string(), None, None).unwrap();

        let status = get_protagonist_status().unwrap();
        assert_eq!(status.name, "API테스트");
        let stats: serde_json::Value = serde_json::from_str(&status.stats_json).unwrap();
        assert!(stats.is_object(), "stats_json should decode to a JSON object");
        let finance: serde_json::Value = serde_json::from_str(&status.finance_json).unwrap();
        assert!(finance.is_object(), "finance_json should decode to a JSON object (empty at creation)");

        reset_state();
    }

    /// 고정 3슬롯 "덮어쓰기" 재시도 버그(대화 2026-07-25) — 같은 `slot_path`로
    /// `new_game`을 두 번 부르면(예: Dart의 `delete_slot`이 실패했거나,
    /// 첫 시도가 부분 커밋된 채 죽은 뒤 재시도) 예전엔 이전 시도가 넣은
    /// npc 행이 그대로 남아 있어 두 번째 `generate_initial_world`가 똑같은
    /// 결정적 id를 다시 넣으려다 `UNIQUE constraint failed: npc.id`로
    /// 죽었다. `new_game`이 이제 파일을 매번 지우고 시작하므로 두 번째
    /// 호출도 첫 번째와 동일하게 성공해야 한다.
    #[test]
    fn new_game_reusing_the_same_slot_path_does_not_collide_on_npc_id() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        let path = std::env::temp_dir().join(format!("onepitch_new_game_reuse_test_{}.db", std::process::id()));
        let path_str = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path);

        new_game(
            "content.db".to_string(),
            42,
            "첫시도".to_string(),
            "우완".to_string(),
            hs_team.clone(),
            "강속구형".to_string(),
            None,
            Some(path_str.clone()),
        )
        .unwrap();

        new_game(
            "content.db".to_string(),
            42,
            "재시도".to_string(),
            "우완".to_string(),
            hs_team,
            "강속구형".to_string(),
            None,
            Some(path_str.clone()),
        )
        .expect("같은 슬롯 경로로 재시도해도 npc.id 충돌 없이 성공해야 함");

        let status = get_protagonist_status().unwrap();
        assert_eq!(status.name, "재시도", "두 번째 new_game이 슬롯을 완전히 새로 덮어써야 함");

        reset_state();
        let _ = std::fs::remove_file(&path);
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
    fn list_hs_school_details_returns_all_102_schools_with_stars_in_range() {
        let details = list_hs_school_details("content.db".to_string()).unwrap();
        assert_eq!(details.len(), 102);
        for d in &details {
            assert!(d.team_id.starts_with("team:"));
            assert!(!d.name.is_empty());
            assert!(!d.region.is_empty());
            assert!((1..=5).contains(&d.stars), "stars must be 1..=5, got {} for {}", d.stars, d.team_id);
        }
    }

    #[test]
    fn stars_from_group_position_gives_best_school_the_most_stars() {
        assert_eq!(stars_from_group_position(0, 6), 5);
        assert_eq!(stars_from_group_position(5, 6), 1);
        assert_eq!(stars_from_group_position(0, 20), 5);
        assert_eq!(stars_from_group_position(19, 20), 1);
    }

    #[test]
    fn power_names_returns_the_three_documented_levels() {
        let names = power_names();
        assert_eq!(names, vec!["약", "보통", "강"]);
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

        new_game("content.db".to_string(), 43, "훈련테스트".to_string(), "우완".to_string(), hs_team.clone(), "강속구형".to_string(), None, None).unwrap();

        let team = get_current_team_info().unwrap();
        assert_eq!(team.unwrap().team_id, hs_team);

        assert!(get_training_config().unwrap().is_none(), "no training configured yet");

        let types = training_type_options();
        assert_eq!(types.len(), 6, "06_훈련_시스템.md §2-1의 6종 훈련 카탈로그");
        assert!(types.iter().any(|t| t.id == "strength" && t.stats == vec!["구속".to_string(), "체력".to_string()]));

        set_training("strength".to_string(), "bullpen".to_string(), "보통".to_string(), None, None).unwrap();
        let config = get_training_config().unwrap().unwrap();
        assert_eq!(config.primary_training, "strength");
        assert_eq!(config.secondary_training, "bullpen");
        assert_eq!(config.intensity, "보통");
        assert!(config.new_pitch.is_none());
        assert!(config.mastery_pitch.is_none());

        let catalog = pitch_type_names().unwrap();
        assert_eq!(catalog.len(), 10, "05_구종_시스템.md §1의 10종 카탈로그");
        assert!(catalog.contains(&"너클볼".to_string()));

        // 투심 패스트볼(구위 25+)은 강속구형 시작 구위 밴드(26~30)에서
        // 항상 손이 닿는 습득 조건(05_구종_시스템.md §3, 대화 2026-07-25) —
        // 슬라이더(제구 30+)는 강속구형에게 닿지 않는 스탯이라 교체.
        set_training("strength".to_string(), "bullpen".to_string(), "보통".to_string(), Some("투심 패스트볼".to_string()), None).unwrap();
        assert_eq!(get_training_config().unwrap().unwrap().new_pitch.as_deref(), Some("투심 패스트볼"));

        reset_state();
    }

    /// 프리게임 브리핑(대화 2026-07-25) — `'game'` PendingAction payload의
    /// `home`/`away`를 그대로 넘겼을 때 상대 선발·타선·날씨가 채워지는지,
    /// 그리고 주인공이 홈이든 원정이든 상대팀을 올바르게 골라내는지.
    #[test]
    fn get_pregame_scouting_resolves_the_opponent_regardless_of_home_or_away() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let (my_team, opponent) = {
            let conn = content::open("content.db").unwrap();
            let mut stmt = conn.prepare("SELECT id FROM teams WHERE league_id = 'league:hs' ORDER BY id LIMIT 2").unwrap();
            let teams: Vec<String> = stmt.query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
            (teams[0].clone(), teams[1].clone())
        };

        new_game("content.db".to_string(), 991, "브리핑테스트".to_string(), "우완".to_string(), my_team.clone(), "강속구형".to_string(), None, None).unwrap();

        // 주인공이 홈일 때 — away가 상대.
        let as_home = get_pregame_scouting("game:test1".to_string(), my_team.clone(), opponent.clone()).unwrap();
        assert_eq!(as_home.opponent_team_id, opponent);
        assert!(!as_home.starter_name.is_empty());
        assert_eq!(as_home.top_batters.len(), 3);
        assert!(["맑음", "흐림", "비", "강풍", "더위"].contains(&as_home.weather.as_str()));

        // 주인공이 원정일 때 — home이 상대.
        let as_away = get_pregame_scouting("game:test2".to_string(), opponent.clone(), my_team.clone()).unwrap();
        assert_eq!(as_away.opponent_team_id, opponent);

        reset_state();
    }

    /// 매치 화면 "타자 정보" 카드(대화 2026-07-25) — 로스터에서 아무 타자
    /// id나 뽑아 조회하면 이름·능력치 3종이 채워지는지.
    #[test]
    fn get_batter_profile_returns_name_and_ability_stats_for_a_roster_player() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };
        new_game("content.db".to_string(), 992, "타자프로필테스트".to_string(), "우완".to_string(), hs_team.clone(), "강속구형".to_string(), None, None).unwrap();

        let roster = list_roster(hs_team).unwrap();
        let batter = roster.iter().find(|p| p.position != "선발투수" && p.position != "중계투수" && p.position != "마무리투수").unwrap();

        let profile = get_batter_profile(batter.id.clone()).unwrap();
        assert_eq!(profile.name, batter.name);
        assert!((0.0..=100.0).contains(&profile.contact));
        assert!((0.0..=100.0).contains(&profile.power));
        assert!((0.0..=100.0).contains(&profile.eye));
        assert!(["좌타", "우타", "양타"].contains(&profile.handedness.as_str()), "handedness={}", profile.handedness);

        reset_state();
    }

    /// Phase 5(NPC 시즌/통산 기록 아카이브, 대화 2026-07-24) — 이번 시즌
    /// 진행 중 성적(`season_stats`)과 통산 아카이브(`npc_season_history`)
    /// 양쪽이 각각 올바른 API 함수로 조회되는지 왕복 확인.
    #[test]
    fn season_and_career_stats_queries_work_end_to_end_after_new_game() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };
        new_game("content.db".to_string(), 46, "기록테스트".to_string(), "우완".to_string(), hs_team.clone(), "강속구형".to_string(), None, None).unwrap();

        let roster = list_roster(hs_team.clone()).unwrap();
        let pitcher = roster.iter().find(|p| p.position == "선발투수").unwrap().id.clone();
        let batter = roster.iter().find(|p| p.position != "선발투수" && p.position != "중계투수" && p.position != "마무리투수").unwrap().id.clone();

        with_state(|state| {
            state
                .slot_conn
                .execute(
                    "INSERT INTO season_stats (player_id, week, line) VALUES (?1, 1, ?2)",
                    rusqlite::params![pitcher, serde_json::json!({"outs_recorded": 27, "runs_allowed": 3, "strikeouts": 9, "hits_allowed": 5, "walks": 2, "unearned_runs": 0, "saves": 1, "holds": 0}).to_string()],
                )
                .unwrap();
            state
                .slot_conn
                .execute(
                    "INSERT INTO season_stats (player_id, week, line) VALUES (?1, 1, ?2)",
                    rusqlite::params![batter, serde_json::json!({"plate_appearances": 10, "at_bats": 8, "hits": 4, "doubles": 1, "home_runs": 1, "walks": 2, "rbi": 3}).to_string()],
                )
                .unwrap();
            state
                .slot_conn
                .execute(
                    "INSERT INTO npc_season_history (player_id, season, line) VALUES (?1, 0, ?2)",
                    rusqlite::params![pitcher, serde_json::json!({"outs_recorded": 54, "runs_allowed": 10, "strikeouts": 18, "hits_allowed": 12, "walks": 4, "unearned_runs": 1, "saves": 2, "holds": 1}).to_string()],
                )
                .unwrap();
            Ok(())
        })
        .unwrap();

        let season_pitching = get_team_season_pitching_stats(hs_team.clone()).unwrap();
        let p = season_pitching.iter().find(|s| s.player_id == pitcher).unwrap();
        assert_eq!(p.strikeouts, 9);
        assert_eq!(p.saves, 1);
        assert!((p.innings_pitched - 9.0).abs() < 1e-9);
        assert!(p.era > 0.0);

        let season_batting = get_team_season_batting_stats(hs_team.clone()).unwrap();
        let b = season_batting.iter().find(|s| s.player_id == batter).unwrap();
        assert_eq!(b.hits, 4);
        assert_eq!(b.rbi, 3);
        assert!((b.batting_average - 0.5).abs() < 1e-9, "avg={}", b.batting_average);

        let career_pitching = get_player_career_pitching_stats(pitcher.clone()).unwrap();
        assert_eq!(career_pitching.strikeouts, 18, "career should reflect npc_season_history, not the in-progress season");
        assert_eq!(career_pitching.saves, 2);

        // 매치 화면 박스스코어/구장/이번경기 라인 조회(대화 2026-07-25) — 진행 중인
        // 매치 세션이 없는 흔한 상태(경기 사이 다른 화면)에서도 죽지 않고
        // 얌전히 빈 값을 돌려줘야 한다. 실제 세션 데이터가 채워지는 경로는
        // `data::match_session`의 `push_inning_log_entry`/`merge_batter_game_stats`
        // 단위 테스트가 이미 촘촘히 검증한다.
        assert_eq!(get_inning_log().unwrap(), None);
        assert!(get_match_venue().unwrap().is_none());

        let game_line = get_batter_game_stats(batter.clone()).unwrap();
        assert_eq!(game_line.plate_appearances, 0, "매치 세션이 없으면 이번 경기 라인은 0이어야 함");

        let season_line = get_player_season_batting_stats(batter.clone()).unwrap();
        assert_eq!(season_line.hits, 4, "get_team_season_batting_stats와 동일 소스를 선수 한 명만 뽑아야 함");

        let season_summary = get_protagonist_season_summary().unwrap();
        assert_eq!(season_summary.games, 0, "아직 game_log에 이번 시즌 경기가 없어야 함");

        reset_state();
    }

    #[test]
    fn academics_status_is_some_for_a_high_school_protagonist_and_settable() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };
        new_game("content.db".to_string(), 46, "학업테스트".to_string(), "우완".to_string(), hs_team, "강속구형".to_string(), None, None).unwrap();

        let status = get_academics_status().unwrap().expect("고교 소속이면 학업 상태가 있어야 함");
        assert!(!status.attends_university);
        assert_eq!(status.weekly_study_mode, "normal");
        assert!(status.last_grade.is_none(), "아직 시험 전");
        assert!(!status.major_selected);

        set_weekly_study_mode("focus".to_string()).unwrap();
        assert_eq!(get_academics_status().unwrap().unwrap().weekly_study_mode, "focus");
        assert!(set_weekly_study_mode("존재안함".to_string()).is_err());

        set_university_major("스포츠과학".to_string()).unwrap();
        let after_major = get_academics_status().unwrap().unwrap();
        assert_eq!(after_major.university_major.as_deref(), Some("스포츠과학"));
        assert!(after_major.major_selected);
        assert!(set_university_major("없는전공".to_string()).is_err());

        reset_state();
    }

    #[test]
    fn academics_status_is_none_for_a_pro_league_protagonist() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let (hs_team, pro_team) = {
            let conn = content::open("content.db").unwrap();
            (
                conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap(),
                conn.query_row("SELECT id FROM teams WHERE league_id = 'league:pro' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap(),
            )
        };
        // create_protagonist는 school_team_id가 항상 league:hs여야 하니
        // (§ 캐릭터 생성 불변식) 프로 소속은 생성 뒤 계약을 직접 바꿔 흉내낸다.
        new_game("content.db".to_string(), 47, "프로테스트".to_string(), "우완".to_string(), hs_team, "강속구형".to_string(), None, None).unwrap();
        with_state(|state| {
            state.slot_conn.execute(
                "UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'",
                rusqlite::params![serde_json::json!({"team_id": pro_team}).to_string()],
            )?;
            Ok(())
        })
        .unwrap();

        assert!(get_academics_status().unwrap().is_none(), "프로 소속이면 학업 탭 자체가 없어야 함");

        reset_state();
    }

    #[test]
    fn learnable_pitches_reflects_the_current_archetypes_stats_after_new_game() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        // 강속구형은 구위가 미들밴드(26~30)에서 시작 — 투심 패스트볼(구위
        // 25+)은 항상 손이 닿지만 커터(구위 30+)는 아직 안 닿는다.
        new_game("content.db".to_string(), 45, "습득테스트".to_string(), "우완".to_string(), hs_team, "강속구형".to_string(), None, None).unwrap();

        let result = learnable_pitches().unwrap();
        assert!(result.eligible.contains(&"투심 패스트볼".to_string()), "eligible={:?}", result.eligible);
        assert!(!result.eligible.contains(&"커터".to_string()), "eligible={:?}", result.eligible);
        assert!(!result.eligible.contains(&"포심 패스트볼".to_string()), "이미 시작 구종이라 후보에 없어야 함");

        reset_state();
    }

    #[test]
    fn learnable_pitches_returns_a_next_candidate_when_nothing_is_eligible_yet() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        // 돌부처형은 구위·제구 둘 다 하단 밴드(20~26)에서 시작 — 어떤
        // 구종도 바로 습득할 수 없어야 하고, 대신 next_candidate가 채워짐.
        new_game("content.db".to_string(), 46, "다음목표테스트".to_string(), "우완".to_string(), hs_team, "돌부처형".to_string(), None, None).unwrap();

        let result = learnable_pitches().unwrap();
        assert!(result.eligible.is_empty(), "eligible={:?}", result.eligible);
        let candidate = result.next_candidate.expect("아무것도 습득 못하면 next_candidate가 채워져야 함");
        assert!(!candidate.requirements.is_empty());

        reset_state();
    }

    #[test]
    fn learnable_pitches_is_empty_once_the_five_pitch_cap_is_reached() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        new_game("content.db".to_string(), 47, "상한테스트".to_string(), "우완".to_string(), hs_team, "제구형".to_string(), None, None).unwrap();
        with_state(|state| {
            let five_pitches = serde_json::json!([
                {"name": "포심 패스트볼", "stage": 1, "weeks": 0},
                {"name": "체인지업", "stage": 1, "weeks": 0},
                {"name": "포크볼", "stage": 1, "weeks": 0},
                {"name": "싱커", "stage": 1, "weeks": 0},
                {"name": "슬라이더", "stage": 1, "weeks": 0},
            ])
            .to_string();
            state.slot_conn.execute("UPDATE protagonist SET pitches = ?1 WHERE id = 'proto:1'", [five_pitches])?;
            Ok(())
        })
        .unwrap();

        let result = learnable_pitches().unwrap();
        assert!(result.eligible.is_empty());
        assert!(result.next_candidate.is_none());

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

        new_game("content.db".to_string(), 44, "리그테스트".to_string(), "우완".to_string(), hs_team.clone(), "강속구형".to_string(), None, None).unwrap();

        let hs_teams = list_teams(Some("league:hs".to_string())).unwrap();
        assert!(hs_teams.iter().any(|t| t.team_id == hs_team));
        let all_teams = list_teams(None).unwrap();
        assert!(all_teams.len() > hs_teams.len(), "unfiltered list should include every league");

        let roster = list_roster(hs_team.clone()).unwrap();
        assert!(!roster.is_empty());
        assert!(roster.iter().any(|p| p.position == "선발투수"));
        assert!(
            roster.iter().all(|p| !["감독", "코치", "구단주"].contains(&p.position.as_str())),
            "list_roster must not mix staff into the player list"
        );

        let staff = list_team_staff(hs_team.clone()).unwrap();
        // 감독+구단주는 항상 1명씩, 코치는 자원 등급별 가변 슬롯(0~8명,
        // 대화 2026-07-24 코치 시스템 확장) — 정확히 3명을 기대할 수 없다.
        assert!(staff.len() >= 2, "최소 감독+구단주 2명은 있어야 함");
        assert_eq!(staff.iter().filter(|p| p.position == "감독").count(), 1);
        assert_eq!(staff.iter().filter(|p| p.position == "구단주").count(), 1);
        assert!(staff.iter().all(|p| ["감독", "코치", "구단주"].contains(&p.position.as_str())));

        let schedule = get_team_schedule(hs_team.clone()).unwrap();
        assert!(!schedule.is_empty());
        assert!(schedule.iter().all(|g| g.home == hs_team || g.away == hs_team));

        let standings = get_standings("league:hs".to_string()).unwrap();
        assert!(standings.iter().any(|s| s.team_id == hs_team));
        assert_eq!(standings[0].rank, 1);

        // rivals는 콘텐츠가 있으면 Some, 없으면 None — 둘 다 패닉 없이 동작하는지만 확인.
        let _ = get_team_rivals(hs_team.clone()).unwrap();

        // "진행중인 대회" — 방금 새 게임을 시작했으면 대회는 아직 없고
        // 리그 카드 하나만 있어야 함(대화 2026-07-26).
        let competitions = list_active_competitions(hs_team).unwrap();
        assert_eq!(competitions.len(), 1, "새 게임 직후엔 리그 카드 하나뿐: {competitions:?}");
        assert_eq!(competitions[0].kind, "league");

        reset_state();
    }

    /// `list_active_competitions`/`get_tournament_bracket`가 실제 대회
    /// 진행(며칠씩 걸리는 `season_rollover`+`advance`)에 의존하지 않고도
    /// 검증되도록, `tournaments`+`schedule`에 직접 합성 대회 하나를
    /// 심어서 조회 API만 검증한다(대화 2026-07-26). 실제 대회 생성·진행
    /// 로직 자체는 `data::repository`의 `run_*`/`advance_tournaments`
    /// 테스트가 이미 충분히 덮음.
    #[test]
    fn competition_queries_surface_a_synthetic_in_progress_tournament() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };
        let opponent = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' AND id != ?1 LIMIT 1", [&hs_team], |r| r.get::<_, String>(0)).unwrap()
        };

        new_game("content.db".to_string(), 45, "대회테스트".to_string(), "우완".to_string(), hs_team.clone(), "강속구형".to_string(), None, None).unwrap();

        with_state(|state| {
            let season = repository::current_season_value(&state.slot_conn)?;
            state.slot_conn.execute(
                "INSERT INTO tournaments (id, league_id, kind, season, format_json, stage_index, round, bracket_state, participants, status, champion)
                 VALUES ('tourn:test_1', 'league:hs', 'hs_gaenari', ?1, '{\"stage\":\"knockout\"}', 0, 1, '[]', ?2, 'in_progress', NULL)",
                rusqlite::params![season, serde_json::json!([hs_team, opponent]).to_string()],
            )?;
            state.slot_conn.execute(
                "INSERT INTO schedule (game_id, day, home, away, result, tournament_id, round) VALUES ('game:test_1', 5, ?1, ?2, NULL, 'tourn:test_1', 1)",
                rusqlite::params![hs_team, opponent],
            )?;
            Ok(())
        })
        .unwrap();

        let competitions = list_active_competitions(hs_team.clone()).unwrap();
        assert_eq!(competitions.len(), 2, "리그 카드 + 대회 카드: {competitions:?}");
        let card = competitions.iter().find(|c| c.kind == "tournament").unwrap();
        assert_eq!(card.id, "tourn:test_1");
        assert_eq!(card.name, "개나리기");
        assert_eq!(card.status_summary, "진행 중");
        assert!(!card.is_eliminated && !card.is_champion);

        let bracket = get_tournament_bracket("tourn:test_1".to_string()).unwrap();
        assert_eq!(bracket.status, "in_progress");
        assert_eq!(bracket.display_name, "개나리기");
        assert_eq!(bracket.matches.len(), 1);
        assert_eq!(bracket.matches[0].round, 1);
        assert!(bracket.matches[0].home_runs.is_none(), "아직 안 뛴 경기");

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
        new_game("content.db".to_string(), 45, "기록테스트".to_string(), "우완".to_string(), hs_team, "제구형".to_string(), None, None).unwrap();

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
    fn get_achievements_reflects_real_definitions_and_progress_after_new_game() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };
        new_game("content.db".to_string(), 47, "업적테스트".to_string(), "우완".to_string(), hs_team, "제구형".to_string(), None, None).unwrap();

        // I8 3차분에서 실제로 seed된 3개 업적(ach:career_100_wins·ach:shutout·
        // ach:pitch_arsenal_3)이 전부 "미달성"으로 먼저 나와야 한다.
        let before = get_achievements().unwrap();
        assert_eq!(before.len(), 3);
        assert!(before.iter().all(|a| !a.achieved && a.achieved_day.is_none()));
        assert!(before.iter().any(|a| a.id == "ach:shutout" && a.label == "완봉승"));

        with_state(|state| {
            state.slot_conn.execute(
                "INSERT INTO achievement_progress (ach_id, counter, achieved_day) VALUES ('ach:shutout', 1, 30)",
                [],
            )?;
            Ok(())
        })
        .unwrap();

        let after = get_achievements().unwrap();
        let shutout = after.iter().find(|a| a.id == "ach:shutout").unwrap();
        assert!(shutout.achieved);
        assert_eq!(shutout.achieved_day, Some(30));
        let untouched = after.iter().find(|a| a.id == "ach:career_100_wins").unwrap();
        assert!(!untouched.achieved);

        reset_state();
    }

    #[test]
    fn get_relationships_returns_empty_before_manager_relationship_exists_and_reflects_it_after() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };
        new_game("content.db".to_string(), 48, "관계테스트".to_string(), "우완".to_string(), hs_team.clone(), "제구형".to_string(), None, None).unwrap();

        // 고교 소속 상태엔 관계도가 아직 안 쌓여있어도(값 0) 감독 npc 자체는
        // 뉴게임 로스터 생성 때 이미 만들어져 있다 — relationships 행이 없으면
        // 빈 목록.
        assert!(get_relationships().unwrap().is_empty());

        with_state(|state| {
            state.slot_conn.execute(
                "INSERT INTO relationships (npc_id, value, arc_stage) VALUES (?1, 15, 1)
                 ON CONFLICT(npc_id) DO UPDATE SET value = excluded.value, arc_stage = excluded.arc_stage",
                [format!("manager:{hs_team}")],
            )?;
            Ok(())
        })
        .unwrap();

        let relationships = get_relationships().unwrap();
        assert_eq!(relationships.len(), 1);
        assert_eq!(relationships[0].role, "감독");
        assert_eq!(relationships[0].value, 15);
        assert_eq!(relationships[0].arc_stage, 1);
        assert!(!relationships[0].name.is_empty());

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
        new_game("content.db".to_string(), 46, "은퇴테스트".to_string(), "우완".to_string(), hs_team, "제구형".to_string(), None, None).unwrap();

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
    fn slot_lifecycle_persists_to_a_real_file_and_can_be_listed_loaded_and_deleted() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let dir = std::env::temp_dir().join(format!("onepitch_slots_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let slot_path = dir.join("slot_test.db").to_string_lossy().to_string();
        let _ = std::fs::remove_file(&slot_path);

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        new_game(
            "content.db".to_string(),
            999,
            "슬롯테스트".to_string(),
            "우완".to_string(),
            hs_team,
            "강속구형".to_string(),
            None,
            Some(slot_path.clone()),
        )
        .unwrap();
        assert!(std::path::Path::new(&slot_path).exists(), "new_game with slot_path should write a real file");

        let slots = list_slots(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(slots.len(), 1);
        assert_eq!(slots[0].name, "슬롯테스트");
        assert!(!slots[0].retired);

        reset_state(); // 파일 핸들을 닫아야 load_slot/delete_slot이 같은 파일을 다시 열 수 있음
        load_slot(slot_path.clone(), "content.db".to_string()).unwrap();
        let status = get_protagonist_status().unwrap();
        assert_eq!(status.name, "슬롯테스트");

        reset_state();
        delete_slot(slot_path.clone()).unwrap();
        assert!(!std::path::Path::new(&slot_path).exists());
        assert!(list_slots(dir.to_string_lossy().to_string()).unwrap().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
        reset_state();
    }

    /// 슬롯 "덮어쓰기" 흐름(`NewGameSlotScreen._pickSlot`)은 지금 활성
    /// 세션이 열어둔 바로 그 슬롯을 `reset_state()` 없이 곧장 `delete_slot`
    /// 한다 — 위 `slot_lifecycle_...` 테스트처럼 미리 세션을 닫아주는
    /// 코드가 실제 앱엔 없다. `delete_slot`이 내부적으로 세션을 먼저
    /// 비우지 않으면 Windows에서 "다른 프로세스가 사용 중"으로 실패한다
    /// (대화 2026-07-25).
    #[test]
    fn delete_slot_succeeds_even_while_that_slot_is_the_active_session() {
        let _guard = TEST_SERIAL.lock().unwrap();
        reset_state();

        let dir = std::env::temp_dir().join(format!("onepitch_delete_active_slot_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let slot_path = dir.join("slot_test.db").to_string_lossy().to_string();
        let _ = std::fs::remove_file(&slot_path);

        let hs_team = {
            let conn = content::open("content.db").unwrap();
            conn.query_row("SELECT id FROM teams WHERE league_id = 'league:hs' LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap()
        };

        new_game(
            "content.db".to_string(),
            123,
            "삭제테스트".to_string(),
            "우완".to_string(),
            hs_team,
            "강속구형".to_string(),
            None,
            Some(slot_path.clone()),
        )
        .unwrap();

        // reset_state() 없이 곧장 삭제 — 실제 `_pickSlot`이 하는 그대로.
        delete_slot(slot_path.clone()).expect("활성 세션이 쥔 슬롯도 delete_slot이 알아서 세션을 놓고 지워야 함");
        assert!(!std::path::Path::new(&slot_path).exists());

        let _ = std::fs::remove_dir_all(&dir);
        reset_state();
    }

    #[test]
    fn list_slots_on_a_missing_directory_returns_an_empty_list_instead_of_erroring() {
        let dir = std::env::temp_dir().join("onepitch_slots_definitely_missing_dir");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(list_slots(dir.to_string_lossy().to_string()).unwrap().is_empty());
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
