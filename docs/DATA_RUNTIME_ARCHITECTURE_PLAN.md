# Data/Runtime Architecture Plan

## 1) 목적
- 불변 데이터(마스터)와 가변 데이터(런타임)를 분리한다.
- Release 배포 시 사용자는 DB 설치 없이 실행 가능해야 한다.
- 데이터량 증가와 잦은 수정(밸런스, 이벤트 추가)에 대응 가능한 구조를 만든다.

## 2) 저장소 내 경로 (배포 포함)

```text
02.SvelteElectron/
  resource/
    data/
      master/
        leagues/
          kbo.json
          mlb.json
        teams/
          pro_korea/*.json
          pro_usa/*.json
        schools/
          highschool/*.json
          university/*.json
        events/
          catalog.json
          templates/*.json
        personnel/
          name_pool_kr.json
          name_pool_en.json
          archetypes/*.json
        balance/
          progression.json
          probabilities.json
      seeds/
        v1/
          bootstrap.json
          opening_rosters.json
          opening_schedule.json
```

원칙:
- `master/`: 절대값(팀명/학교명/이벤트명/규칙) 중심
- `seeds/`: 새 세이브 생성 시 1회 주입하는 초기 데이터

## 3) 사용자 로컬 경로 (배포 비포함)

```text
%APPDATA%/<AppName>/
  runtime/
    career.db
    logs/
      app.log
      crash-*.log
    saves/
      slot1-export.json
      slot2-export.json
```

원칙:
- 실행 중 바뀌는 데이터는 전부 `career.db`에 저장
- 파일 기반 누적 로그는 진단/백업 목적만 사용

## 4) SQLite 최소 테이블 세트

### 4.1 메타/버전
- `app_meta(key TEXT PRIMARY KEY, value TEXT)`
- `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)`
- `content_version(id INTEGER PRIMARY KEY, master_version TEXT, seed_version TEXT, applied_at TEXT)`

### 4.2 세이브/세계 상태
- `save_slots(id INTEGER PRIMARY KEY, name TEXT, stage TEXT, day INTEGER, created_at TEXT, updated_at TEXT)`
- `world_state(save_id INTEGER PRIMARY KEY, league_phase TEXT, season_year INTEGER, weather_seed INTEGER, FOREIGN KEY(save_id) REFERENCES save_slots(id))`

### 4.3 팀/선수
- `teams(id TEXT PRIMARY KEY, league_id TEXT, name TEXT, region TEXT, active INTEGER)`
- `players(id TEXT PRIMARY KEY, save_id INTEGER, team_id TEXT, name TEXT, role TEXT, overall INTEGER, condition INTEGER, fatigue INTEGER, is_active INTEGER, FOREIGN KEY(save_id) REFERENCES save_slots(id))`
- `player_stats(save_id INTEGER, player_id TEXT, stat_key TEXT, stat_value REAL, PRIMARY KEY(save_id, player_id, stat_key))`

### 4.4 일정/이벤트
- `schedule_items(id TEXT PRIMARY KEY, save_id INTEGER, date TEXT, type TEXT, title TEXT, status TEXT, ref_event_id TEXT)`
- `event_state(id TEXT PRIMARY KEY, save_id INTEGER, event_id TEXT, status TEXT, payload_json TEXT, updated_at TEXT)`

### 4.5 메시지/메신저
- `messages(id TEXT PRIMARY KEY, save_id INTEGER, category TEXT, sender TEXT, subject TEXT, body TEXT, created_at TEXT, read_at TEXT)`
- `contacts(id TEXT PRIMARY KEY, save_id INTEGER, code TEXT, name TEXT, category TEXT, unlocked INTEGER, affinity INTEGER)`
- `messenger_threads(id TEXT PRIMARY KEY, save_id INTEGER, contact_id TEXT, last_message_at TEXT)`
- `messenger_messages(id TEXT PRIMARY KEY, thread_id TEXT, sender_type TEXT, body TEXT, created_at TEXT, choice_payload_json TEXT)`

### 4.6 기록/로그
- `history_logs(id TEXT PRIMARY KEY, save_id INTEGER, day INTEGER, category TEXT, title TEXT, detail TEXT, created_at TEXT)`

## 5) ID/참조 규칙
- 마스터 데이터는 고정 ID 사용: 예) `TEAM_KBO_SEOUL_BEAR`
- 런타임 DB는 해당 ID를 외래키처럼 참조
- 이름 변경은 가능하지만 ID는 절대 변경하지 않는다.

## 6) 실행 흐름

### 6.1 첫 실행
1. `career.db` 존재 여부 확인
2. 없으면 스키마 생성
3. `master + seeds` 버전 기록
4. 기본 세이브 슬롯 생성

### 6.2 일반 실행
1. DB 열기
2. `content_version`과 패키지 내 `master/seeds` 버전 비교
3. 차이가 있으면 마이그레이션/보정 적용
4. UI는 IPC로 필요한 데이터만 조회

## 7) 배포(Release) 규칙
- 배포물 포함:
  - `resource/data/master/**`
  - `resource/data/seeds/**`
  - 앱 바이너리/SQLite 런타임
- 배포물 제외:
  - 사용자 `career.db`, `logs`, `saves`

## 8) 잦은 수정 대응 전략
- 밸런스/이벤트는 `master/`만 수정하고 버전 증가
- 스키마 변경은 SQL 마이그레이션 파일로 관리
- 운영 중 수치 핫픽스는 `balance/*.json` 우선, DB 대규모 재작성은 지양

## 9) 인코딩/안전 규칙
- 텍스트/JSON/SQL 모두 UTF-8 고정
- 저장 전후 `UTF-8` 검증 체크
- 콘솔 출력 깨짐을 원본 손상으로 오판해 재저장하지 않는다.
