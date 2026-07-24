use rusqlite::{Connection, Transaction};

use super::migration::{apply_migrations, Migration};

const V1_DDL: &str = r#"
CREATE TABLE meta (
  save_version INTEGER, content_version INTEGER, world_seed INTEGER,
  stage TEXT, playtime INTEGER, current_day INTEGER, integrity_sig TEXT
);

CREATE TABLE protagonist (
  id TEXT PRIMARY KEY, name TEXT, handedness TEXT, archetype TEXT,
  stats TEXT, xp TEXT, live_state TEXT, finance TEXT,
  pitches TEXT, contract TEXT, injury TEXT
);

CREATE TABLE npc (
  id TEXT PRIMARY KEY, name TEXT, team_id TEXT, position TEXT, age INTEGER,
  is_named INTEGER, retired INTEGER, form REAL, personality TEXT,
  stats TEXT, xp TEXT, live_state TEXT, pitches TEXT
);

CREATE TABLE relationships (
  npc_id TEXT PRIMARY KEY REFERENCES npc(id),
  value INTEGER, arc_stage INTEGER
);

CREATE TABLE season_meta   (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE schedule      (game_id TEXT PRIMARY KEY, day INTEGER, home TEXT, away TEXT, result TEXT);
CREATE TABLE standings     (team_id TEXT PRIMARY KEY, w INTEGER, l INTEGER, t INTEGER, rank INTEGER);
CREATE TABLE season_stats  (player_id TEXT, week INTEGER, line TEXT, PRIMARY KEY(player_id, week));
CREATE TABLE pending_actions (
  id TEXT PRIMARY KEY, type TEXT, urgency TEXT, created_day INTEGER, payload TEXT
);
CREATE TABLE inbox (id TEXT PRIMARY KEY, kind TEXT, urgency TEXT, read INTEGER, day INTEGER, body TEXT);

CREATE TABLE career_history (season INTEGER PRIMARY KEY, line TEXT);
CREATE TABLE game_log       (game_id TEXT PRIMARY KEY, season INTEGER, detail TEXT);
CREATE TABLE league_transactions (id TEXT PRIMARY KEY, day INTEGER, kind TEXT, detail TEXT);
CREATE TABLE history_standings   (season INTEGER, team_id TEXT, rank INTEGER, PRIMARY KEY(season, team_id));
CREATE TABLE history_leaders     (season INTEGER, category TEXT, player_id TEXT, PRIMARY KEY(season, category));
CREATE TABLE achievement_progress (ach_id TEXT PRIMARY KEY, counter INTEGER, achieved_day INTEGER);
"#;

// each migration must set meta.save_version itself — apply_migrations only tracks
// PRAGMA user_version internally, it does not touch application tables.
fn migration_v1(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V1_DDL)?;
    tx.execute(
        "INSERT INTO meta (save_version, content_version, world_seed, stage, playtime, current_day, integrity_sig)
         VALUES (1, 0, 0, 'new', 0, 0, NULL)",
        [],
    )?;
    Ok(())
}

const V2_DDL: &str = r#"
ALTER TABLE npc ADD COLUMN injury TEXT;
"#;

/// I5 5차분(부상 시스템) — npc.injury는 `{"current": null|{...}, "history": [...]}`
/// 형태(08_부상_시스템.md). 신규 생성되는 NPC는 항상 값을 채워 넣지만
/// (repository::generate_league_roster), 컬럼 자체엔 NOT NULL을 안 걸어
/// 기존 스키마 관례(다른 npc 컬럼도 전부 nullable TEXT)를 따름.
fn migration_v2(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V2_DDL)?;
    tx.execute("UPDATE meta SET save_version = 2", [])?;
    Ok(())
}

const V3_DDL: &str = r#"
ALTER TABLE npc ADD COLUMN military_return_day INTEGER;
ALTER TABLE npc ADD COLUMN military_served INTEGER NOT NULL DEFAULT 0;
"#;

/// I5 8차분(병역) — [03_병역](../../../02_기획/03_병역.md). NPC는 §1 "타이밍
/// = 플레이어 유연 선택"을 할 수 없어 §9의 강제편입 기본 경로(현역)만 재현
/// — 다른 JSON blob 컬럼(injury 등)과 달리 단순 플래그라 plain 컬럼 2개로
/// 충분: `military_return_day`(NULL=복무 중 아님, non-NULL=그 날 전역
/// 예정) · `military_served`(평생 1회만 — 재입대 없음, 0/1).
fn migration_v3(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V3_DDL)?;
    tx.execute("UPDATE meta SET save_version = 3", [])?;
    Ok(())
}

const V4_DDL: &str = r#"
CREATE TABLE match_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  game_id TEXT NOT NULL, home TEXT NOT NULL, away TEXT NOT NULL, league_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  inning INTEGER NOT NULL, top_of_inning INTEGER NOT NULL, outs INTEGER NOT NULL,
  bases TEXT NOT NULL,
  home_runs INTEGER NOT NULL, away_runs INTEGER NOT NULL,
  home_batter_idx INTEGER NOT NULL, away_batter_idx INTEGER NOT NULL,
  balls INTEGER NOT NULL, strikes INTEGER NOT NULL,
  current_batter_id TEXT,
  pitch_seq INTEGER NOT NULL DEFAULT 0
);
"#;

/// I6 3차분(주인공 등판 매치 세션) — [07_매치_엔진](../../../02_기획/육성코어/07_매치_엔진.md)
/// §12 "경기는 시작~종료가 하나의 단위... 경기 중 저장 불가"대로 이 테이블은
/// 진행 중인 경기 하나(단일 행, `id=1` 고정)만 담는 휘발성 상태 — 시즌
/// 경계 그룹(`schedule` 등)과 달리 season_rollover가 안 건드리고, 경기가
/// 끝나거나(정상 종료) 중단되면(재접속 등) 그때그때 지워진다.
fn migration_v4(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V4_DDL)?;
    tx.execute("UPDATE meta SET save_version = 4", [])?;
    Ok(())
}

const V5_DDL: &str = r#"
ALTER TABLE protagonist ADD COLUMN training TEXT;
"#;

/// I6 잔여(훈련 슬롯) — [06_훈련_시스템](../../../02_기획/육성코어/06_훈련_시스템.md).
/// `training`은 `{"primary_stat","secondary_stats","intensity","new_pitch","pitch_weeks"}`
/// 형태 — 다른 protagonist JSON 컬럼(live_state 등)과 같은 관례로 nullable
/// TEXT. NULL = "아직 훈련 설정을 한 번도 안 함"(플레이어가 최소 1회는
/// `set_protagonist_training`을 호출해야 주간 성장이 시작됨).
fn migration_v5(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V5_DDL)?;
    tx.execute("UPDATE meta SET save_version = 5", [])?;
    Ok(())
}

const V6_DDL: &str = r#"
ALTER TABLE protagonist ADD COLUMN age INTEGER;
ALTER TABLE protagonist ADD COLUMN military_return_day INTEGER;
"#;

/// I7 6차분(진로 갈림길, 01_커리어_구조.md §5) — `age`는 `create_protagonist`
/// 가 17세(고교 1학년, 02_아마_고교.md §A-1)로 채우고 매 시즌 경계마다
/// +1. NULL이면(구세이브·합성 테스트) "나이 트래킹 대상 아님"으로 갈림길
/// 판정 자체를 스킵 — 이번 서브분 전까지 존재하던 모든 protagonist 행이
/// 이 값을 몰라도 깨지지 않게 하는 방어적 설계. `military_return_day`는
/// `npc` 테이블의 동명 컬럼과 같은 관례(NULL=복무 안 함) — 갈림길 A에서
/// "입대"를 고르면 채워지고, 복무 만료 시 독립리그 재도전으로 자동 전환.
fn migration_v6(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V6_DDL)?;
    tx.execute("UPDATE meta SET save_version = 6", [])?;
    Ok(())
}

const V7_DDL: &str = r#"
ALTER TABLE protagonist ADD COLUMN retired INTEGER NOT NULL DEFAULT 0;
ALTER TABLE protagonist ADD COLUMN retirement_reason TEXT;
ALTER TABLE match_session ADD COLUMN strikeouts INTEGER NOT NULL DEFAULT 0;
"#;

/// I6 10차분(은퇴, 05_히스토리_엔딩.md §3) — `retired`/`retirement_reason`
/// (`voluntary`|`decline`|`injury`)은 `data::repository::mark_protagonist_retired`
/// 하나가 세 트리거 전부에서 공통으로 채운다. `match_session.strikeouts`는
/// 주인공이 던지는 하프이닝에서만 누적되는 카운터 — 경기 종료 시
/// `game_log`에 통산 기록(ERA·탈삼진) 집계용으로 옮겨 적힌다.
fn migration_v7(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V7_DDL)?;
    tx.execute("UPDATE meta SET save_version = 7", [])?;
    Ok(())
}

const V8_DDL: &str = r#"
ALTER TABLE protagonist ADD COLUMN profile TEXT;
"#;

/// I7 15차분(캐릭터 생성 개인 신체 정보, 대화 2026-07-20) — `profile`은
/// 시뮬레이션에 쓰이는 값이 아니라 순수 표시용 플레이버 데이터(생일·키·
/// 몸무게·혈액형·출신지역·등번호)라 `training` 컬럼과 같은 패턴으로 JSON
/// 하나에 다 묶는다(`data::repository::set_protagonist_profile`). NULL이면
/// (이번 서브분 전 구세이브) "미입력"으로 UI가 처리.
fn migration_v8(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V8_DDL)?;
    tx.execute("UPDATE meta SET save_version = 8", [])?;
    Ok(())
}

const V9_DDL: &str = r#"
CREATE TABLE career_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, day INTEGER NOT NULL, season INTEGER NOT NULL,
  kind TEXT NOT NULL, detail TEXT NOT NULL
);
"#;

/// I7 27차분(내 정보 "커리어" 탭, 대화 2026-07-21) — 입학·진로선택 갈림길
/// (드래프트/대학/독립/입대)·병역 만료·은퇴, 트레이드·계약처럼 이미
/// `league_transactions`에 남던 것 말고 지금까지 어디에도 안 남던 커리어
/// 분기점들을 시간순으로 기록(`data::repository::log_career_event`).
fn migration_v9(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V9_DDL)?;
    tx.execute("UPDATE meta SET save_version = 9", [])?;
    Ok(())
}

const V10_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN protagonist_pulled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_session ADD COLUMN relief_pitcher_id TEXT;
ALTER TABLE match_session ADD COLUMN protagonist_pull_inning INTEGER;
ALTER TABLE match_session ADD COLUMN protagonist_pull_opponent_runs INTEGER;
"#;

/// I7 29차분(감독 개입 — 투수 교체 타이밍, 07_매치_엔진.md §8, 대화
/// 2026-07-21) — 자동·반자동 강판 여부(`protagonist_pulled`)·이후 등판하는
/// 불펜 투수(`relief_pitcher_id`)·강판 시점 이닝(`protagonist_pull_inning`)·
/// 강판 시점 상대 득점(`protagonist_pull_opponent_runs`). `apply_protagonist_evaluation`
/// 의 `innings_pitched`·`runs_allowed` 계산이 완투 가정 대신 이 두 값을
/// 우선 사용해, 강판 이후 불펜이 내준 점수를 주인공 성적에 안 섞는다.
/// 수동 모드 플레이어 개입 UI·감독 신뢰도 형성은 이번 스코프 밖(1차
/// 축소안, 대화 설계).
fn migration_v10(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V10_DDL)?;
    tx.execute("UPDATE meta SET save_version = 10", [])?;
    Ok(())
}

const V11_DDL: &str = r#"
ALTER TABLE schedule ADD COLUMN tournament_id TEXT;
ALTER TABLE schedule ADD COLUMN round INTEGER;

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY, league_id TEXT, kind TEXT, season INTEGER,
  format_json TEXT, stage_index INTEGER, round INTEGER, bracket_state TEXT,
  participants TEXT, status TEXT, champion TEXT
);
"#;

/// 리그 탭 "진행중인 대회"(대화 2026-07-26) — 대회(포스트시즌·대학 3개
/// 대회·고교 5개 전국대회·독립리그)를 정규시즌과 같은 하루 단위 진행
/// 인프라(`schedule`+`advance()`)에 태워 주인공이 자기 팀 대회 경기도
/// 직접 뛸 수 있게 한다. `schedule`에 대회 소속 표시(`tournament_id`)와
/// 라운드 번호(`round`)만 얹으면 `find_protagonist_game_today`/`process_day`
/// 는 변경 없이 그대로 작동(둘 다 day+home/away로만 조회하는 범용 쿼리).
/// `tournaments`는 대회 하나당 한 행 — `format_json`은 이 대회가 거칠
/// 스테이지 파이프라인(예선 라운드로빈 0개 이상 + 본선 넉아웃/게이지
/// 하나), `stage_index`는 지금 몇 번째 스테이지인지, `round`·`bracket_state`
/// 는 넉아웃/게이지 스테이지 안에서의 진행 상태(예선 라운드로빈 스테이지는
/// 정규시즌처럼 통째로 미리 스케줄되므로 안 씀). "지금 상태"는 이 행 +
/// `schedule WHERE tournament_id = ?`를 라운드별로 묶어 즉석 파생(정규시즌 순위를
/// schedule+standings에서 매번 계산하는 것과 같은 패턴, 별도 브래킷
/// 상태 테이블 불필요). `participants`는 시드 순번 그대로의 team_id
/// JSON 배열, `status`는 `"in_progress"` 또는 우승 team_id.
fn migration_v11(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V11_DDL)?;
    tx.execute("UPDATE meta SET save_version = 11", [])?;
    Ok(())
}

const V12_DDL: &str = r#"
CREATE TABLE academics (
  id TEXT PRIMARY KEY,
  attends_university INTEGER, university_major TEXT, major_selected INTEGER,
  weekly_study_mode TEXT, subject_scores TEXT, exam_accum_score REAL,
  last_grade INTEGER, last_grade_risk TEXT, eligibility_blocked INTEGER,
  warning_count INTEGER, university_week INTEGER
);
"#;

/// 학업 시스템(대화 2026-07-26) — 이 게임의 이전 Svelte+Electron
/// 프로토타입(`02.SvelteElectron/apps/ui/src/pages/academics/`)을 그대로
/// 이식: 과목 5종(국어/영어/수학/사회/과학, `kor/eng/math/soc/sci`) 성적
/// 추적 + 주간 학습모드(집중/일반/휴식/수면) + 중간/기말고사 + 대학 전공
/// 선택(영구 보너스). `protagonist`와 1:1(`id = 'proto:1'`) — 고교(`league:hs`)
/// 입학 시 `create_protagonist`가 같이 생성, 대학 진학 시
/// `attends_university`가 1로 바뀐다. `subject_scores`는
/// `{"kor": {"percentile":50,"attendance":100,"assignment":100}, ...}`
/// 형태(5과목 전부). 프로/독립/병역 등 고교·대학이 아닌 스테이지에서는
/// 이 행이 있어도 UI가 안 보여줄 뿐(§6-9x Flutter 쪽에서 `leagueId`로
/// 판정) — 엔진은 항상 최신 상태만 갖고 있으면 됨.
fn migration_v12(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V12_DDL)?;
    tx.execute("UPDATE meta SET save_version = 12", [])?;
    Ok(())
}

const V13_DDL: &str = r#"
CREATE TABLE practice_stats (player_id TEXT, week INTEGER, line TEXT, PRIMARY KEY(player_id, week));
"#;

/// 청백전(연습경기, 대화 2026-07-26) 성적 — `season_stats`와 완전히 같은
/// shape이지만 별도 테이블로 둔다. 02_고교.md §4-5 "청백전... 비공식
/// 기록(개인 통산 스탯 미반영), 단 뎁스차트·코치 평가에는 반영"이라
/// `season_stats`(공식 기록, 로테이션·타순 랭킹 외에 트레이드·방출
/// 판정에도 쓰임)와 섞이면 안 된다. `season_rollover`가 `season_stats`를
/// 비우는 자리에서 이 테이블도 같이 비운다("이번 시즌 청백전 성적").
fn migration_v13(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V13_DDL)?;
    tx.execute("UPDATE meta SET save_version = 13", [])?;
    Ok(())
}

const V14_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN opponent_pulled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_session ADD COLUMN opponent_relief_pitcher_id TEXT;
ALTER TABLE match_session ADD COLUMN opponent_pitcher_batters_faced INTEGER NOT NULL DEFAULT 0;
"#;

/// 상대팀 투수 강판 지원(10_구현_Phase_계획.md §6-N Part H, 대화
/// 2026-07-26) — `protagonist_pulled`/`relief_pitcher_id`(v10)와 대칭이지만
/// 반대쪽(주인공 팀이 아니라 상대팀)을 강판한 결과를 담는다. 상대팀은
/// 배경 하프이닝 경로로만 던지므로(주인공이 직접 상대할 뿐 감독 개입
/// UI는 없음) `protagonist_pull_inning`/`protagonist_pull_opponent_runs`
/// 같은 표시용 필드는 필요 없음 — "누구로 고정됐는가"만 세션에 남기면
/// 이후 하프이닝마다 다시 강판 판정을 반복하지 않고 그 투수로 계속
/// 진행할 수 있다(기존 주인공 쪽과 동일한 "게임당 1회" 제약).
fn migration_v14(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V14_DDL)?;
    tx.execute("UPDATE meta SET save_version = 14", [])?;
    Ok(())
}

const V15_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN pull_decision_settled_at_pitch_count INTEGER;
"#;

/// 수동 모드 감독 개입 무한 루프 버그 수정(Phase 3, 매치엔진 리얼리즘
/// 강화 실측 진단 중 발견) — `submit_pitcher_change_decision`으로
/// "유지"/"맡기기(불풀)"을 확정해도 그 판단이 세션에 안 남아, 바로 다음
/// `submit_pitch` 호출에서 투구수(`pitch_seq`)가 아직 그대로라 강판
/// 소프트캡 "고려 구간" 판정을 처음부터 다시 타서 또 `PitcherChangeDecision`
/// 을 돌려주고, 그걸 다시 답해도 또 `AwaitingPitch`로 돌아오는 핑퐁이
/// 무한 반복됐다(만루 세이브 상황에서만 아니라, 소프트캡 넘긴 채로
/// 오래 던지는 어떤 경기든 재현 가능). 이번 투구수 값으로 "불풀 확정"을
/// 세션에 남겨 같은 투구수에서는 다시 안 묻게 한다.
fn migration_v15(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V15_DDL)?;
    tx.execute("UPDATE meta SET save_version = 15", [])?;
    Ok(())
}

const V16_DDL: &str = r#"
ALTER TABLE npc ADD COLUMN handedness TEXT;
"#;

/// 좌우 상성(Phase 4, 매치엔진 리얼리즘 강화 — 기획 문서에 없는 신규 설계)
/// — `protagonist.handedness`(v1부터 있던 투수 전용 컬럼)와 대칭으로 NPC도
/// 던지는 손(투수)·타석(타자)을 갖게 한다. 신규 NPC는 `sim::roster::generate_team`
/// 이 항상 채워 넣지만, 컬럼 자체는 다른 npc 컬럼과 같은 관례로 nullable —
/// 구세이브의 기존 NPC는 NULL로 남고, `match_sim::Handedness::parse`가
/// NULL/미기록을 안전하게 "우완/우타"로 폴백한다.
fn migration_v16(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V16_DDL)?;
    tx.execute("UPDATE meta SET save_version = 16", [])?;
    Ok(())
}

const V17_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN park_factor REAL NOT NULL DEFAULT 1.0;
ALTER TABLE match_session ADD COLUMN weather_control_mod REAL NOT NULL DEFAULT 0.0;
ALTER TABLE match_session ADD COLUMN weather_power_mod REAL NOT NULL DEFAULT 0.0;
ALTER TABLE match_session ADD COLUMN weather_fatigue_mult REAL NOT NULL DEFAULT 1.0;
"#;

/// 환경 요소(Phase 5, 매치엔진 리얼리즘 강화 — 파크팩터·날씨, §10-1) —
/// `start_protagonist_match`가 게임 시작 시점에 `match_sim::roll_game_conditions`로
/// 한 번만 굴려서 세션에 저장한다. `content_conn`은 매 `submit_pitch`
/// 호출마다 넘어오지 않으므로(세션 시작 이후엔 slot_conn만으로 진행하는
/// 기존 관례) 여기에 영속시켜야 이후 하프이닝·1구 판정에서 다시 조회
/// 없이 재사용 가능. 기본값(1.0/0.0/0.0/1.0)은 "중립·모디파이어 없음" —
/// 구세이브(마이그레이션만 거친 기존 세션 행)에도 안전.
fn migration_v17(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V17_DDL)?;
    tx.execute("UPDATE meta SET save_version = 17", [])?;
    Ok(())
}

const V18_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN hits_allowed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_session ADD COLUMN walks_allowed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_session ADD COLUMN protagonist_pull_was_save_situation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_session ADD COLUMN opponent_pull_was_save_situation INTEGER NOT NULL DEFAULT 0;
"#;

/// 세이브 판정 + 기록 필드 확장(Phase 6, §12) — `hits_allowed`/`walks_allowed`는
/// 주인공 본인 등판의 피안타·볼넷 누적(`session.strikeouts`와 같은 패턴,
/// `game_log` detail JSON에 WHIP 계산용으로 실어 보낸다). `*_pull_was_save_situation`
/// 은 강판되는 그 순간 `manager::is_save_situation`이 참이었는지 기억해뒀다가
/// (`data::match_session::finalize_game`), 경기가 끝난 뒤 그 팀이 리드를
/// 지킨 채 이겼으면 강판돼 들어온 구원투수에게 세이브를 준다.
fn migration_v18(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V18_DDL)?;
    tx.execute("UPDATE meta SET save_version = 18", [])?;
    Ok(())
}

const V19_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN unearned_runs_allowed INTEGER NOT NULL DEFAULT 0;
"#;

/// Phase 7(정합성 점검에서 발견) — NPC 투수는 Phase 2부터 `season_stats`의
/// `unearned_runs`로 자책/비자책을 구분해왔는데, 주인공 본인의
/// `game_log`(→`career_history`→"수상·기록" 탭, Phase 6)는 이 구분이
/// 아예 없어 실책으로 내준 점수까지 통째로 자책점처럼 ERA에 잡히고
/// 있었다. `hits_allowed`/`walks_allowed`(migration v18)와 같은 패턴 —
/// 강판되면 인터랙티브 1구 루프 자체가 안 도니 자연히 그 시점에서
/// 멈춘다(별도 스냅샷 불필요).
fn migration_v19(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V19_DDL)?;
    tx.execute("UPDATE meta SET save_version = 19", [])?;
    Ok(())
}

const V20_DDL: &str = r#"
ALTER TABLE npc ADD COLUMN coach_role TEXT;
ALTER TABLE npc ADD COLUMN coach_specialties TEXT;
"#;

/// 코치 가변 슬롯(0~8명)·적성배치·구종 전문화(대화 2026-07-24, `sim::staff`
/// "1차 축소안" 확장) — `coach_role`(적성 6종 중 하나)과 `coach_specialties`
/// (JSON 배열, 가르칠 수 있는 구종 목록)는 코치가 아닌 행은 항상 NULL로
/// 남는다(`handedness`와 같은 관례). 구세이브의 기존 코치 행도 NULL로
/// 남고, `repository::load_coach_stats`가 빈 문자열/빈 배열로 안전 폴백.
fn migration_v20(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V20_DDL)?;
    tx.execute("UPDATE meta SET save_version = 20", [])?;
    Ok(())
}

const V21_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN protagonist_second_pulled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_session ADD COLUMN second_relief_pitcher_id TEXT;
ALTER TABLE match_session ADD COLUMN protagonist_second_pull_was_save_situation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_session ADD COLUMN opponent_second_pulled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_session ADD COLUMN opponent_second_relief_pitcher_id TEXT;
ALTER TABLE match_session ADD COLUMN opponent_second_pull_was_save_situation INTEGER NOT NULL DEFAULT 0;
"#;

/// 인터랙티브 2단계 교체(선발→중계→마무리, Phase 2, 대화 2026-07-24) —
/// 기존 1단계 강판 필드(`protagonist_pulled`/`relief_pitcher_id`/
/// `opponent_pulled`/`opponent_relief_pitcher_id`, migration v18)와 대칭
/// 패턴으로 2단계 필드를 추가. 1단계가 이미 마무리였으면(세이브 상황에
/// 곧장 등판) 2단계로 넘어갈 대상이 없어 계속 0/NULL로 남는다 —
/// `sim::match_sim::simulate_game`의 배경 로직과 동일한 판단.
fn migration_v21(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V21_DDL)?;
    tx.execute("UPDATE meta SET save_version = 21", [])?;
    Ok(())
}

const V22_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN runner_on_first_id TEXT;
"#;

/// 인터랙티브 하프이닝 도루 지원(Phase 3, 대화 2026-07-24) — 배경
/// `simulate_half_inning`의 로컬 변수 `runner_on_first_id`와 같은 개념이지만,
/// 인터랙티브 세션은 `submit_pitch` 호출마다 DB를 오가므로 세션에 영속시켜야
/// 한다. 2루·3루로 넘어간 뒤에는 신원을 놓치는 것도 배경과 동일(도루는
/// 1루→2루만 다루므로 이걸로 충분).
fn migration_v22(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V22_DDL)?;
    tx.execute("UPDATE meta SET save_version = 22", [])?;
    Ok(())
}

const V23_DDL: &str = r#"
ALTER TABLE match_session ADD COLUMN pull_decision_settled_inning INTEGER;
ALTER TABLE match_session ADD COLUMN pull_decision_settled_top_of_inning INTEGER;
"#;

/// 수동 모드 감독 개입 재질문 UX 개선(Phase 4, 대화 2026-07-24) — 기존
/// `pull_decision_settled_at_pitch_count`(v15, 투구수 단위 게이팅)는 그
/// 투구수에서만 재질문을 막아, 소프트캡을 넘긴 채 몇 구만 더 던져도 다시
/// 물어보는 과함이 있었다(§8 원 설계 "이닝 종료마다 판단 기회"와 어긋남).
/// 이닝+공수 단위 새 컬럼으로 게이팅 기준을 교체 — 옛 컬럼은 더 이상
/// 안 쓰지만 컬럼 자체는 남겨둔다(이 프로젝트의 마이그레이션 관례,
/// DROP COLUMN 쓴 전례 없음).
fn migration_v23(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V23_DDL)?;
    tx.execute("UPDATE meta SET save_version = 23", [])?;
    Ok(())
}

const V24_DDL: &str = r#"
CREATE TABLE npc_season_history (player_id TEXT, season INTEGER, line TEXT, PRIMARY KEY(player_id, season));
"#;

/// NPC 시즌/통산 기록 아카이브(Phase 5, 대화 2026-07-24) — `career_history`
/// (주인공 전용)와 같은 모양이지만 `player_id`가 더해진 복합키. `season_stats`
/// 는 시즌 경계마다 `DELETE`되는(§ "season_rollover") 진행 중 집계라 NPC
/// 개인 기록이 시즌이 넘어가면 통째로 사라졌었다 — `season_rollover`가
/// 삭제 직전에 그 시즌 `season_stats`를 이 테이블에 합산 저장한다.
fn migration_v24(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V24_DDL)?;
    tx.execute("UPDATE meta SET save_version = 24", [])?;
    Ok(())
}

const V25_DDL: &str = r#"
CREATE INDEX idx_schedule_day ON schedule(day);
CREATE INDEX idx_schedule_home ON schedule(home);
CREATE INDEX idx_schedule_away ON schedule(away);
CREATE INDEX idx_npc_team_id ON npc(team_id);
"#;

/// 성능 조사(대화 2026-07-24, `perf_probe.rs` 실측·스케줄 분산 5-Phase
/// §6-115~118)로 확인 — `schedule.day`(매일 `process_day`의 `WHERE day = ?1`),
/// `schedule.home`/`schedule.away`(로테이션 재배정의 `WHERE home=?1 OR
/// away=?1`), `npc.team_id`(로스터 로딩 전반) 전부 인덱스가 아예 없어
/// 172팀 순회마다 풀스캔이었다. `season_stats`/`practice_stats`는 복합
/// PK(`player_id`가 첫 컬럼)라 이미 자동 인덱스로 커버돼 제외. 쿼리
/// 결과에는 영향 없는 순수 실행계획 최적화라 로직 변경 없음.
fn migration_v25(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V25_DDL)?;
    tx.execute("UPDATE meta SET save_version = 25", [])?;
    Ok(())
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        up: migration_v1,
    },
    Migration {
        version: 2,
        up: migration_v2,
    },
    Migration {
        version: 3,
        up: migration_v3,
    },
    Migration {
        version: 4,
        up: migration_v4,
    },
    Migration {
        version: 5,
        up: migration_v5,
    },
    Migration {
        version: 6,
        up: migration_v6,
    },
    Migration {
        version: 7,
        up: migration_v7,
    },
    Migration {
        version: 8,
        up: migration_v8,
    },
    Migration {
        version: 9,
        up: migration_v9,
    },
    Migration {
        version: 10,
        up: migration_v10,
    },
    Migration {
        version: 11,
        up: migration_v11,
    },
    Migration {
        version: 12,
        up: migration_v12,
    },
    Migration {
        version: 13,
        up: migration_v13,
    },
    Migration {
        version: 14,
        up: migration_v14,
    },
    Migration {
        version: 15,
        up: migration_v15,
    },
    Migration {
        version: 16,
        up: migration_v16,
    },
    Migration {
        version: 17,
        up: migration_v17,
    },
    Migration {
        version: 18,
        up: migration_v18,
    },
    Migration {
        version: 19,
        up: migration_v19,
    },
    Migration {
        version: 20,
        up: migration_v20,
    },
    Migration {
        version: 21,
        up: migration_v21,
    },
    Migration {
        version: 22,
        up: migration_v22,
    },
    Migration {
        version: 23,
        up: migration_v23,
    },
    Migration {
        version: 24,
        up: migration_v24,
    },
    Migration {
        version: 25,
        up: migration_v25,
    },
];

fn init(mut conn: Connection) -> anyhow::Result<Connection> {
    conn.pragma_update(None, "foreign_keys", true)?;
    apply_migrations(&mut conn, MIGRATIONS)?;
    Ok(conn)
}

pub fn open(path: &str) -> anyhow::Result<Connection> {
    init(Connection::open(path)?)
}

pub fn open_in_memory() -> anyhow::Result<Connection> {
    init(Connection::open_in_memory()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn fresh_db_migrates_to_v1_with_seeded_meta_row() {
        let conn = open_in_memory().unwrap();
        let save_version: i64 = conn
            .query_row("SELECT save_version FROM meta", [], |row| row.get(0))
            .unwrap();
        assert_eq!(save_version, 25);
    }

    #[test]
    fn v25_creates_indexes_on_schedule_and_npc() {
        let conn = open_in_memory().unwrap();
        let names: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        for expected in ["idx_schedule_day", "idx_schedule_home", "idx_schedule_away", "idx_npc_team_id"] {
            assert!(names.contains(&expected.to_string()), "missing index {expected}, got {names:?}");
        }
    }

    #[test]
    fn v24_creates_npc_season_history_table() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO npc_season_history (player_id, season, line) VALUES ('npc:x', 3, '{\"hits\":10}')",
            [],
        )
        .unwrap();
        let line: String = conn.query_row("SELECT line FROM npc_season_history WHERE player_id = 'npc:x' AND season = 3", [], |r| r.get(0)).unwrap();
        assert_eq!(line, "{\"hits\":10}");

        conn.execute(
            "INSERT INTO npc_season_history (player_id, season, line) VALUES ('npc:x', 3, '{\"hits\":99}')
             ON CONFLICT(player_id, season) DO UPDATE SET line = excluded.line",
            [],
        )
        .unwrap();
        let line: String = conn.query_row("SELECT line FROM npc_season_history WHERE player_id = 'npc:x' AND season = 3", [], |r| r.get(0)).unwrap();
        assert_eq!(line, "{\"hits\":99}", "upsert should overwrite, not duplicate");
    }

    #[test]
    fn v23_adds_pull_decision_settled_inning_columns_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let (inning, top): (Option<i64>, Option<i64>) = conn
            .query_row("SELECT pull_decision_settled_inning, pull_decision_settled_top_of_inning FROM match_session WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((inning, top), (None, None));

        conn.execute("UPDATE match_session SET pull_decision_settled_inning = 7, pull_decision_settled_top_of_inning = 1 WHERE id = 1", []).unwrap();
        let (inning, top): (i64, i64) = conn
            .query_row("SELECT pull_decision_settled_inning, pull_decision_settled_top_of_inning FROM match_session WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((inning, top), (7, 1));
    }

    #[test]
    fn v22_adds_runner_on_first_id_column_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let missing: Option<String> = conn.query_row("SELECT runner_on_first_id FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(missing, None);

        conn.execute("UPDATE match_session SET runner_on_first_id = 'npc:runner' WHERE id = 1", []).unwrap();
        let runner: String = conn.query_row("SELECT runner_on_first_id FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(runner, "npc:runner");
    }

    #[test]
    fn v21_adds_second_stage_pull_columns_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let (proto_second, second_id, proto_second_save, opp_second, opp_second_id, opp_second_save): (
            i64,
            Option<String>,
            i64,
            i64,
            Option<String>,
            i64,
        ) = conn
            .query_row(
                "SELECT protagonist_second_pulled, second_relief_pitcher_id, protagonist_second_pull_was_save_situation,
                        opponent_second_pulled, opponent_second_relief_pitcher_id, opponent_second_pull_was_save_situation
                 FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .unwrap();
        assert_eq!((proto_second, second_id, proto_second_save, opp_second, opp_second_id, opp_second_save), (0, None, 0, 0, None, 0));

        conn.execute(
            "UPDATE match_session SET protagonist_second_pulled = 1, second_relief_pitcher_id = 'npc:closer',
                                        protagonist_second_pull_was_save_situation = 1,
                                        opponent_second_pulled = 1, opponent_second_relief_pitcher_id = 'npc:opp_closer',
                                        opponent_second_pull_was_save_situation = 1
             WHERE id = 1",
            [],
        )
        .unwrap();
        let (proto_second, second_id): (i64, String) =
            conn.query_row("SELECT protagonist_second_pulled, second_relief_pitcher_id FROM match_session WHERE id = 1", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((proto_second, second_id), (1, "npc:closer".to_string()));
    }

    #[test]
    fn v20_adds_coach_role_and_specialties_columns_to_npc() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury, coach_role, coach_specialties)
             VALUES ('coach:team:x:0', 'X', 'team:x', '코치', 50, 0, 0, 50.0, '{}', '{}', '{}', '{}', NULL, '{}', '투수', '[\"슬라이더\"]')",
            [],
        )
        .unwrap();
        let (role, specialties): (String, String) =
            conn.query_row("SELECT coach_role, coach_specialties FROM npc WHERE id = 'coach:team:x:0'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(role, "투수");
        assert_eq!(specialties, "[\"슬라이더\"]");

        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES ('npc:y', 'Y', 'team:x', '타자', 20, 1, 0, 50.0, '{}', '{}', '{}', '{}', NULL, '{}')",
            [],
        )
        .unwrap();
        let missing: Option<String> = conn.query_row("SELECT coach_role FROM npc WHERE id = 'npc:y'", [], |r| r.get(0)).unwrap();
        assert_eq!(missing, None, "코치가 아닌 행은 NULL로 남아야 함");
    }

    #[test]
    fn v19_adds_unearned_runs_allowed_column_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let unearned: i64 = conn.query_row("SELECT unearned_runs_allowed FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(unearned, 0);

        conn.execute("UPDATE match_session SET unearned_runs_allowed = 2 WHERE id = 1", []).unwrap();
        let unearned: i64 = conn.query_row("SELECT unearned_runs_allowed FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(unearned, 2);
    }

    #[test]
    fn v18_adds_save_and_whip_tracking_columns_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let (hits, walks, proto_save, opp_save): (i64, i64, i64, i64) = conn
            .query_row(
                "SELECT hits_allowed, walks_allowed, protagonist_pull_was_save_situation, opponent_pull_was_save_situation FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!((hits, walks, proto_save, opp_save), (0, 0, 0, 0));

        conn.execute(
            "UPDATE match_session SET hits_allowed = 5, walks_allowed = 2, protagonist_pull_was_save_situation = 1, opponent_pull_was_save_situation = 1 WHERE id = 1",
            [],
        )
        .unwrap();
        let (hits, walks, proto_save, opp_save): (i64, i64, i64, i64) = conn
            .query_row(
                "SELECT hits_allowed, walks_allowed, protagonist_pull_was_save_situation, opponent_pull_was_save_situation FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!((hits, walks, proto_save, opp_save), (5, 2, 1, 1));
    }

    #[test]
    fn v17_adds_game_conditions_columns_to_match_session_with_neutral_defaults() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let (park_factor, control_mod, power_mod, fatigue_mult): (f64, f64, f64, f64) = conn
            .query_row(
                "SELECT park_factor, weather_control_mod, weather_power_mod, weather_fatigue_mult FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!((park_factor, control_mod, power_mod, fatigue_mult), (1.0, 0.0, 0.0, 1.0));

        conn.execute(
            "UPDATE match_session SET park_factor = 1.15, weather_control_mod = -6.0, weather_power_mod = 5.0, weather_fatigue_mult = 1.2 WHERE id = 1",
            [],
        )
        .unwrap();
        let (park_factor, control_mod, power_mod, fatigue_mult): (f64, f64, f64, f64) = conn
            .query_row(
                "SELECT park_factor, weather_control_mod, weather_power_mod, weather_fatigue_mult FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!((park_factor, control_mod, power_mod, fatigue_mult), (1.15, -6.0, 5.0, 1.2));
    }

    #[test]
    fn v16_adds_handedness_column_to_npc() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury, handedness)
             VALUES ('npc:x', 'X', 'team:x', '투수', 20, 1, 0, 50.0, '{}', '{}', '{}', '{}', '[]', '{}', '좌완')",
            [],
        )
        .unwrap();
        let handedness: String = conn.query_row("SELECT handedness FROM npc WHERE id = 'npc:x'", [], |r| r.get(0)).unwrap();
        assert_eq!(handedness, "좌완");

        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES ('npc:y', 'Y', 'team:x', '타자', 20, 1, 0, 50.0, '{}', '{}', '{}', '{}', NULL, '{}')",
            [],
        )
        .unwrap();
        let missing: Option<String> = conn.query_row("SELECT handedness FROM npc WHERE id = 'npc:y'", [], |r| r.get(0)).unwrap();
        assert_eq!(missing, None, "구세이브 NPC는 NULL로 남아야 함(폴백은 애플리케이션 코드 책임)");
    }

    #[test]
    fn v9_adds_career_events_table() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO career_events (day, season, kind, detail) VALUES (?1, ?2, ?3, ?4)",
            params![1, 0, "enrollment", serde_json::json!({"school_team_id": "team:x"}).to_string()],
        )
        .unwrap();
        let (kind, detail): (String, String) =
            conn.query_row("SELECT kind, detail FROM career_events WHERE day = 1", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(kind, "enrollment");
        assert!(detail.contains("team:x"));
    }

    #[test]
    fn v10_adds_manager_intervention_columns_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let (pulled, relief, pull_inning, pull_runs): (i64, Option<String>, Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT protagonist_pulled, relief_pitcher_id, protagonist_pull_inning, protagonist_pull_opponent_runs FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(pulled, 0);
        assert_eq!(relief, None);
        assert_eq!(pull_inning, None);
        assert_eq!(pull_runs, None);

        conn.execute(
            "UPDATE match_session SET protagonist_pulled = 1, relief_pitcher_id = 'npc:relief', protagonist_pull_inning = 6,
                                       protagonist_pull_opponent_runs = 2 WHERE id = 1",
            [],
        )
        .unwrap();
        let (pulled, relief, pull_inning, pull_runs): (i64, Option<String>, Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT protagonist_pulled, relief_pitcher_id, protagonist_pull_inning, protagonist_pull_opponent_runs FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(pulled, 1);
        assert_eq!(relief.as_deref(), Some("npc:relief"));
        assert_eq!(pull_inning, Some(6));
        assert_eq!(pull_runs, Some(2));
    }

    #[test]
    fn v11_adds_tournament_columns_to_schedule_and_creates_tournaments_table() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO schedule (game_id, day, home, away, result, tournament_id, round) VALUES ('g', 10, 'h', 'a', NULL, 'tourn:x', 1)",
            [],
        )
        .unwrap();
        let (tournament_id, round): (Option<String>, Option<i64>) =
            conn.query_row("SELECT tournament_id, round FROM schedule WHERE game_id = 'g'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(tournament_id.as_deref(), Some("tourn:x"));
        assert_eq!(round, Some(1));

        conn.execute(
            "INSERT INTO tournaments (id, league_id, kind, season, format_json, stage_index, round, bracket_state, participants, status, champion)
             VALUES ('tourn:x', 'league:pro', 'pro_postseason', 0, '[]', 0, 1, '[]', '[]', 'in_progress', NULL)",
            [],
        )
        .unwrap();
        let status: String = conn.query_row("SELECT status FROM tournaments WHERE id = 'tourn:x'", [], |r| r.get(0)).unwrap();
        assert_eq!(status, "in_progress");
    }

    #[test]
    fn v12_creates_academics_table() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO academics (id, attends_university, university_major, major_selected, weekly_study_mode, subject_scores,
                                     exam_accum_score, last_grade, last_grade_risk, eligibility_blocked, warning_count, university_week)
             VALUES ('proto:1', 0, NULL, 0, 'normal', '{}', 0.0, NULL, 'ok', 0, 0, 0)",
            [],
        )
        .unwrap();
        let (mode, blocked): (String, i64) =
            conn.query_row("SELECT weekly_study_mode, eligibility_blocked FROM academics WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(mode, "normal");
        assert_eq!(blocked, 0);
    }

    #[test]
    fn v13_creates_practice_stats_table() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO practice_stats (player_id, week, line) VALUES ('npc:1', 1, '{\"outs_recorded\":3}')",
            [],
        )
        .unwrap();
        let line: String = conn.query_row("SELECT line FROM practice_stats WHERE player_id = 'npc:1'", [], |r| r.get(0)).unwrap();
        assert_eq!(line, "{\"outs_recorded\":3}");
    }

    #[test]
    fn v14_adds_opponent_pull_columns_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let (pulled, relief, faced): (i64, Option<String>, i64) = conn
            .query_row(
                "SELECT opponent_pulled, opponent_relief_pitcher_id, opponent_pitcher_batters_faced FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(pulled, 0);
        assert_eq!(relief, None);
        assert_eq!(faced, 0);

        conn.execute(
            "UPDATE match_session SET opponent_pulled = 1, opponent_relief_pitcher_id = 'npc:relief', opponent_pitcher_batters_faced = 5 WHERE id = 1",
            [],
        )
        .unwrap();
        let (pulled, relief, faced): (i64, Option<String>, i64) = conn
            .query_row(
                "SELECT opponent_pulled, opponent_relief_pitcher_id, opponent_pitcher_batters_faced FROM match_session WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(pulled, 1);
        assert_eq!(relief.as_deref(), Some("npc:relief"));
        assert_eq!(faced, 5);
    }

    #[test]
    fn v15_adds_pull_decision_settled_column_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                         home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'g', 'h', 'a', 'league:pro', '수동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let settled: Option<i64> =
            conn.query_row("SELECT pull_decision_settled_at_pitch_count FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(settled, None);

        conn.execute("UPDATE match_session SET pull_decision_settled_at_pitch_count = 91 WHERE id = 1", []).unwrap();
        let settled: Option<i64> =
            conn.query_row("SELECT pull_decision_settled_at_pitch_count FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(settled, Some(91));
    }

    #[test]
    fn v8_adds_profile_column_to_protagonist() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, profile)
             VALUES ('proto:1', 'X', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{}', '{}', ?1)",
            [serde_json::json!({
                "birth_year": 2010, "birth_month": 3, "birth_day": 15,
                "height_cm": 178.0, "weight_kg": 70.0, "blood_type": "O",
                "hometown": "서울", "jersey_number": 18
            })
            .to_string()],
        )
        .unwrap();
        let profile: String = conn.query_row("SELECT profile FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        assert!(profile.contains("\"hometown\":\"서울\""));
    }

    #[test]
    fn v7_adds_retirement_columns_to_protagonist_and_strikeouts_to_match_session() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, retired, retirement_reason)
             VALUES ('proto:1', 'X', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{}', '{}', 1, 'injury')",
            [],
        )
        .unwrap();
        let (retired, reason): (i64, String) = conn
            .query_row("SELECT retired, retirement_reason FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(retired, 1);
        assert_eq!(reason, "injury");

        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases, home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'game:1', 'team:a', 'team:b', 'league:hs', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let strikeouts: i64 = conn.query_row("SELECT strikeouts FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(strikeouts, 0);
    }

    #[test]
    fn v5_adds_training_column_to_protagonist() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, training)
             VALUES ('proto:1', 'X', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{}', '{}', ?1)",
            [serde_json::json!({"primary_stat": "구속", "secondary_stats": ["구위", "제구"], "intensity": "보통", "new_pitch": null, "pitch_weeks": 0}).to_string()],
        )
        .unwrap();
        let training: String = conn.query_row("SELECT training FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let v: serde_json::Value = serde_json::from_str(&training).unwrap();
        assert_eq!(v.get("primary_stat").unwrap().as_str().unwrap(), "구속");
    }

    #[test]
    fn v6_adds_age_and_military_return_day_columns_to_protagonist() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, age, military_return_day)
             VALUES ('proto:1', 'X', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{}', '{}', 17, NULL)",
            [],
        )
        .unwrap();
        let (age, military_return_day): (i64, Option<i64>) = conn
            .query_row("SELECT age, military_return_day FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(age, 17);
        assert!(military_return_day.is_none());
    }

    #[test]
    fn v4_adds_match_session_table() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases, home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'game:1', 'team:a', 'team:b', 'league:hs', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let game_id: String = conn.query_row("SELECT game_id FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(game_id, "game:1");

        // singleton constraint
        let result = conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases, home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (2, 'game:2', 'team:a', 'team:b', 'league:hs', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        );
        assert!(result.is_err(), "match_session must stay a single row (id=1 CHECK constraint)");
    }

    #[test]
    fn v3_adds_military_columns_to_npc() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury, military_return_day, military_served)
             VALUES ('npc:x', 'X', 'team:x', '타자', 28, 1, 0, 50.0, '{}', '{}', '{}', '{}', NULL, '{}', 700, 1)",
            [],
        )
        .unwrap();
        let (return_day, served): (i64, i64) = conn
            .query_row("SELECT military_return_day, military_served FROM npc WHERE id = 'npc:x'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(return_day, 700);
        assert_eq!(served, 1);
    }

    #[test]
    fn v2_adds_injury_column_to_npc() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES ('npc:x', 'X', 'team:x', '타자', 20, 1, 0, 50.0, '{}', '{}', '{}', '{}', NULL, '{\"current\":null,\"history\":[]}')",
            [],
        )
        .unwrap();
        let injury: String = conn.query_row("SELECT injury FROM npc WHERE id = 'npc:x'", [], |r| r.get(0)).unwrap();
        assert_eq!(injury, "{\"current\":null,\"history\":[]}");
    }

    #[test]
    fn foreign_key_violation_is_blocked() {
        let conn = open_in_memory().unwrap();
        let result = conn.execute(
            "INSERT INTO relationships (npc_id, value, arc_stage) VALUES ('npc:missing', 0, 0)",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn reopening_does_not_duplicate_meta_row() {
        let path = std::env::temp_dir().join(format!("onepitch_slot_test_{}.db", std::process::id()));
        let path_str = path.to_str().unwrap();
        let _ = std::fs::remove_file(&path);

        open(path_str).unwrap();
        let conn = open(path_str).unwrap();

        let row_count: i64 = conn
            .query_row("SELECT count(*) FROM meta", [], |row| row.get(0))
            .unwrap();
        assert_eq!(row_count, 1);

        drop(conn);
        std::fs::remove_file(&path).unwrap();
    }
}