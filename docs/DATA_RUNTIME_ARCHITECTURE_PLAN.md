# Data/Runtime Architecture Plan

## 1) 목적
- 불변 데이터(마스터)와 가변 데이터(런타임/세이브)를 분리한다.
- Release 배포 시 사용자는 DB 설치 없이 실행 가능해야 한다.
- 데이터량 증가와 잦은 수정(밸런스, 이벤트 추가)에 대응 가능한 구조를 만든다.

## 2) 저장소 내 경로 (배포 포함)

```
02.SvelteElectron/
  resource/
    data/
      master/
        leagues/          리그 설정 (kbl.json, abl.json, highschool.json 등)
        teams/
          pro_korea/      KBL 8팀 JSON
          pro_usa/        ABL 16팀 JSON
          highschool/     고교팀 JSON
          university/     대학팀 JSON
          independent/    독립리그팀 JSON
        schools/
          highschool/     고교 정보 JSON
          university/     대학 정보 JSON
        events/
          mandatory/      필수 이벤트
          conditional/    조건부 이벤트
          random/         랜덤 이벤트 (media/social/team_life)
          pools/          이벤트 풀 정의
          templates/      메시지 템플릿
          catalog.json    이벤트 카탈로그
        messages/         메시지 템플릿 (categories.json 등)
        messenger/        메신저 연락처/스크립트
        achievements/     업적 정의
        balance/
          match_engine_tuning.json       매치 엔진 밸런스
          match_engine_tuning.schema.json
          probabilities.json
          progression.json
        players/
          archetypes/     선수 아키타입
        training/         훈련 프로그램/투구 카탈로그
      seeds/
        v1/               새 세이브 생성 시 1회 주입 초기 데이터
```

원칙:
- `master/`: 절대값(팀명/학교명/이벤트명/규칙) 중심 — 게임 중 변경 없음
- `seeds/`: 새 세이브 생성 시 1회 주입하는 초기 데이터

## 3) 사용자 로컬 경로 (배포 비포함)

```
%APPDATA%/<AppName>/
  saves/
    projectb_v2.db       세이브 SQLite DB (메인)
    projectb.db          구버전 DB (마이그레이션 후 보존)
  master_checksum.json   마스터 DB 무결성 체크섬 (프로덕션)
```

원칙:
- 실행 중 바뀌는 데이터는 전부 `projectb_v2.db`에 저장
- 세이브 데이터는 ChaCha20-Poly1305 암호화 + HMAC-SHA256 서명 (Rust DLL 처리)

## 4) SQLite 실제 테이블 구조 (`projectb_v2.db`)

### 4.1 세이브 슬롯
- `save_slots` — 슬롯 목록 (slot_id, name, updated_at, career_stage, season_year, current_week, team_id)
- `save_integrity` — 암호화 스냅샷 + HMAC 서명 (slot_id, snapshot, sig, updated_at)

### 4.2 주인공 (protagonist)
- `protagonist` — 주인공 전체 스탯/상태 (능력치, 컨디션, 피로, 사기, 군복무 등)
- `protagonist_contract` — 계약 정보
- `protagonist_pitches` — 보유 구종/등급
- `protagonist_tags` — 특성 태그
- `protagonist_xp` — 스탯별 XP 누적값
- `protagonist_school` — 학교/진로/입시/시험 상태

### 4.3 학업
- `subject_scores` — 과목별 성적 (percentile, attendance, assignment)

### 4.4 업적
- `achievements` — 업적 진행도/해제 시각
- `achievement_metrics` — 업적 집계 카운터

### 4.5 소통
- `mailbox` — 게임 내 메시지함
- `contacts` — 메신저 연락처/호감도/대화 이력

### 4.6 로그
- `recent_logs` — 최근 활동 로그
- `recent_upcoming` — 다음 예정 이벤트

### 4.7 NPC
- `npc_runtime` — NPC 전체 스탯/커리어 상태
- `npc_career_history` — NPC 연도별 스탯/기록
- `npc_achievements` — NPC 특기 사항

### 4.8 시즌
- `season_meta` — 시즌 기본 정보 (league_id, season_year, current_week)
- `season_schedule` — 주인공 시즌 경기 일정
- `season_standings` — 주인공 리그 순위표
- `season_stats` — 주인공 리그 스탯
- `season_league_schedule` — 전체 리그 일정
- `season_league_standings` — 전체 리그 순위표
- `season_league_stats` — 전체 리그 스탯
- `triggered_events` — 이벤트 발생 이력 (중복 방지)
- `pending_actions` — 처리 대기 중인 사용자 액션 큐

> **미구현 계획**: `schema_migrations`, `content_version`, `app_meta` 테이블은 초기 설계에 있었으나 현재 미구현. 버전 관리가 필요해질 시점에 추가 예정.

## 5) ID/참조 규칙
- 마스터 데이터는 고정 ID 사용: 예) `LEAGUE_KBL`, `PKT_Seoul_BearGuardians`, `SCHOOL_HS_SEOUL_INNOVATION`
- 런타임 DB는 해당 ID를 외래키처럼 참조
- 이름 변경은 가능하지만 ID는 절대 변경하지 않는다.

## 6) 실행 흐름

### 6.1 첫 실행
1. `projectb_v2.db` 존재 여부 확인
2. 없으면 스키마 생성 (20개 이상 테이블 일괄 `CREATE TABLE IF NOT EXISTS`)
3. 구 DB(`projectb.db`) 존재 시 자동 마이그레이션 후 보존
4. 기본 세이브 슬롯 준비

### 6.2 일반 실행
1. DB 열기 (WAL 모드, foreign_keys ON)
2. 프로덕션 환경에서 master.db SHA-256 체크섬 검증
3. UI는 IPC로 필요한 데이터만 조회

### 6.3 저장/로드 보안
- 저장: 평문 JSON → Rust ChaCha20-Poly1305 암호화 → HMAC-SHA256 서명 → DB
- 로드: HMAC 검증 → Rust 복호화 → 평문 JSON 반환

## 7) 배포(Release) 규칙
- 배포물 포함:
  - `resource/data/master/**`
  - `resource/data/seeds/**`
  - 앱 바이너리 / Rust DLL(`.node`) / SQLite 런타임
- 배포물 제외:
  - 사용자 `saves/`, `master_checksum.json`

## 8) 잦은 수정 대응 전략
- 밸런스/이벤트는 `master/`만 수정하고 커밋
- 게임 로직 변경은 `packages/engine-native/src/*.rs` 수정 → `npm run build:native`
- `index.d.ts` / `index.js`는 빌드 시 자동 재생성 — 직접 편집 금지

## 9) 인코딩/안전 규칙
- 텍스트/JSON/SQL 모두 UTF-8 고정
- 콘솔 출력 깨짐을 원본 손상으로 오판해 재저장하지 않는다.
- `Get-Content -Encoding utf8`로 원문 확인 후 판단.
