# ProjectB 데이터 관리 구조 개선 제안서

## 컨텍스트

이 문서는 ProjectB(Electron + Svelte + Rust DLL 구조의 야구 시뮬레이션 게임)의  
현재 데이터 파이프라인을 분석하고, JSON 중간 파일을 제거하는 개선안을 도출하기 위한 프롬프트 문서입니다.  
AI에게 구체적인 구현을 요청할 때 이 문서를 컨텍스트로 제공하면 됩니다.

---

## 1. 현재 구조 분석

### 1-1. 데이터 레이어 전체 흐름

```
[생성 단계]
  gen:npc 스크립트
    → resource/data/staging/people_kbl.json  (벌크 JSON, 팀 단위)
    → resource/data/staging/people_abl.json
    → resource/data/staging/people_hs.json
    → ...

[변환 단계]
  migrate:entities 스크립트 (migrate-entities.mjs)
    → staging/*.json을 읽어서
    → resource/data/master/entities/players/PLY_00001.json  ← 16,449개 파일
    → resource/data/master/entities/players/COA_00001.json
    → resource/data/master/entities/players/_index.json

[빌드 단계]  ← npm run dev 시 매번 실행됨
  build:masterdb 스크립트 (generate_master_db.cjs)
    → entities/players/*.json을 모두 읽어서
    → resource/master.db (SQLite, npc_master 테이블)

[런타임]
  master:loadEntities IPC (main.cjs)
    → master.db (베이스) + master_overlay.db (슬롯 변경분) 병합
    → TypeScript EntityRow[] 반환
```

### 1-2. 수치

| 항목 | 값 |
|---|---|
| entity JSON 파일 수 | 16,449개 |
| entity JSON 총 크기 | 25.7 MB |
| master.db 크기 | 10.1 MB |
| 데이터 관련 스크립트 수 | 35개 |
| 일회성 fix/patch 스크립트 | 15개 이상 |

### 1-3. 데이터 관리 스크립트 목록 (문제 유형별 분류)

```
[생성 스크립트] — 최초 NPC 생성
  generate-npc-people.mjs      (29.5KB) : KBL/ABL/HS/Univ NPC 생성
  generate_pro_expansion.cjs   (14.4KB) : 프로 팀 확장
  generate_hs_expansion.cjs    (14.7KB) : 고교 팀 확장
  generate_pro_team_jsons.cjs   (9.8KB) : 프로 팀 JSON 생성
  generate_team_jsons.cjs      (11.5KB) : 팀 JSON 생성
  gen_hs_freshmen.cjs          (12.7KB) : 고교 신입생 생성
  gen_pro_entrants.cjs          (9.7KB) : 프로 입단생 생성

[변환 스크립트] — JSON 간 변환
  migrate-entities.mjs          (4.5KB) : staging → entities
  rebuild_entity_index.cjs      (1.4KB) : _index.json 재생성

[수정 스크립트] — 사후 패치 ← 문제의 핵심
  migrate_team_ids.cjs          (7.9KB) : 팀 ID 일괄 변경 (미실행 상태로 방치됨)
  fix_abl_coach_name_en.cjs     (5.2KB) : ABL 코치 영문명 수정
  fix_abl_jbl_nationality.cjs  (10.3KB) : 국적 데이터 수정
  fix_foreign_player_names.cjs  (6.4KB) : 외국인 선수 이름 수정
  fix_hs_name_en.cjs            (2.3KB) : 고교 선수 영문명 수정
  backfill_batting_fields.cjs   (1.4KB) : 타격 필드 보완
  patch-pro-service-years.cjs   (3.6KB) : 프로 연차 수정
  rebalance_ovr_distribution.mjs(15.6KB): OVR 분포 재조정
  rebalance_late_players.mjs    (8.8KB) : 후기 선수 밸런스
  fix-ages-and-names.mjs        (6.8KB) : 나이/이름 수정
  fix-pitcher-pitches.mjs       (4.9KB) : 투구 종류 수정
  migrate-pitches.mjs           (1.3KB) : 투구 마이그레이션
  migrate-stats.mjs             (6.8KB) : 스탯 마이그레이션

[빌드 스크립트]
  generate_master_db.cjs       (11.1KB) : JSON → master.db
```

---

## 2. 현재 구조의 문제점

### 문제 1: 3단계 중간 레이어 (staging JSON → entity JSON → SQLite)

staging JSON이 entity JSON을 거쳐 SQLite로 들어가는 구조에서,  
**entity JSON은 런타임에서 전혀 읽지 않는 중간 아티팩트**임에도 16,449개 파일로 존재한다.

```javascript
// generate_master_db.cjs - entity JSON을 읽어서 SQLite에 INSERT
const files = fs.readdirSync(ENTITIES_DIR).filter(f => f.endsWith(".json"));
for (const file of files) {
  const e = JSON.parse(fs.readFileSync(path.join(ENTITIES_DIR, file), "utf8"));
  const row = entityToRow(e);
  insert.run(row);
}
```

entity JSON 파일은 SQLite에 들어가기 위한 경유지일 뿐이지만,  
"편집 가능한 소스"처럼 취급되어 fix/patch 스크립트들이 계속 쌓이고 있다.

### 문제 2: refs.json과 entity 파일 간 ID 불일치

오늘 발생한 이슈의 정확한 재현 경로:

```
1. refs.json 팀 ID 변경:
   TEAM_KBL_KIA_1 → TEAM_KBL_EMBERTIGERS_1  (refs.json 수동 편집)

2. migrate_team_ids.cjs 작성 (entity 파일 업데이트 스크립트)
   → 그러나 실행하지 않음

3. npm run dev → build:masterdb 실행
   → entity/*.json (구버전 ID) → master.db 생성
   → master.db는 TEAM_KBL_KIA_1을 가짐

4. 런타임:
   masterStore.teams: TEAM_KBL_EMBERTIGERS_1  (refs.json 기준)
   masterStore.entities[].teamId: TEAM_KBL_KIA_1  (master.db 기준)
   → entities.filter(e => e.teamId === team.id) → 결과 0건
```

두 파일 시스템 간 일관성을 강제하는 수단이 없다.

### 문제 3: 검증 없는 일회성 패치 스크립트 누적

```
fix_abl_coach_name_en.cjs
fix_abl_jbl_nationality.cjs
fix_foreign_player_names.cjs
backfill_batting_fields.cjs
patch-pro-service-years.cjs
...
```

이 스크립트들은:
- 언제 실행됐는지 기록이 없다
- 순서가 중요한데 순서를 강제하지 않는다
- 재실행 시 멱등성(idempotency)이 보장되지 않는다
- `npm run dev`가 master.db를 재빌드하면 패치가 반영됐는지 확인할 수 없다

```javascript
// migrate_team_ids.cjs 중 일부 — 실행 여부 확인 수단 없음
function updateFile(id, clubIdNew, teamIdNew) {
  const fp = path.join(PLAYERS_DIR, id + '.json');
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  data.clubId = clubIdNew;
  data.teamId = teamIdNew;
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}
```

### 문제 4: 인코딩 문제 (모지바케)

entity JSON 파일과 스크립트 곳곳에 모지바케 문자열이 존재한다.  
`check-mojibake.mjs` 스크립트가 있을 정도로 구조적 문제다.

```javascript
// migrate-entities.mjs에서 실제 발생한 모지바케
// "// 湲곕낯 ?ㅽ뻾: npm run migrate:entities"
// "// 異붽? ?ㅽ뻾: npm run migrate:entities -- --append people_jbl.json"
```

JSON 파일에 한글이 포함되는 이유: 이름, 팀명, 설명 등.  
파일 수가 16,449개이므로 인코딩 문제 하나가 빌드 전체를 깰 수 있다.

### 문제 5: dev 빌드 시 매번 전체 재빌드

```
"dev:desktop": "npm run build:masterdb && ..."
```

16,449개 JSON 파일을 매번 읽어서 SQLite INSERT — 증분 빌드 없음.  
현재는 빠르지만 데이터 증가 시 병목이 된다.

---

## 3. 개선 방향: SQLite 단일 소스

### 핵심 아이디어

```
현재: staging JSON → entity JSON (×16,449) → master.db
개선: staging JSON → master.db (직접)
```

entity JSON 중간 레이어를 제거하고,  
master.db 자체를 버전 관리 가능한 소스로 만든다.

### 3-1. 마이그레이션 테이블 도입

```sql
-- master.db에 추가할 마이그레이션 추적 테이블
CREATE TABLE schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL,
  description TEXT
);

-- 예시 마이그레이션 레코드
INSERT INTO schema_migrations VALUES
  ('001_initial', '2025-01-01T00:00:00Z', 'KBL/ABL/HS/Univ 초기 데이터'),
  ('002_team_ids', '2025-06-30T00:00:00Z', 'KBL 팀 ID 리네이밍'),
  ('003_abl_nationality', '2025-06-30T00:00:00Z', 'ABL 국적 수정');
```

`migrate_team_ids.cjs`, `fix_abl_jbl_nationality.cjs` 등의 일회성 스크립트들이  
이 테이블에 기록됨으로써 "실행됐는지"를 DB 자체가 알게 된다.

### 3-2. source.db → master.db 파이프라인

```
resource/source.db  ← 편집 가능한 소스 (git 관리)
    ↓ build:masterdb (마이그레이션 적용 후 복사)
resource/master.db  ← 런타임 전용 (빌드 산출물, git 제외 가능)
```

`source.db`가 현재의 entity JSON을 대체한다.

```javascript
// 새 generate_master_db.cjs 구조 (의사 코드)
const sourceDb = new Database("resource/source.db", { readonly: true });
const masterDb = new Database("resource/master.db");

// 스키마 적용
masterDb.exec(MASTER_SCHEMA);

// 마이그레이션 실행 (아직 적용 안 된 것만)
const applied = new Set(
  masterDb.prepare("SELECT version FROM schema_migrations").all().map(r => r.version)
);
for (const migration of MIGRATIONS) {
  if (!applied.has(migration.version)) {
    migration.up(masterDb, sourceDb);
    masterDb.prepare(
      "INSERT INTO schema_migrations VALUES (?, ?, ?)"
    ).run(migration.version, new Date().toISOString(), migration.description);
  }
}
```

### 3-3. 팀 ID 불일치 문제 해결

현재 refs.json과 entity 파일이 분리 관리되어 불일치가 발생했다.  
`source.db`에 team 테이블을 추가하면 외래 키 제약으로 불일치가 즉시 감지된다.

```sql
-- source.db 구조 예시
CREATE TABLE teams (
  id        TEXT PRIMARY KEY,  -- TEAM_KBL_EMBERTIGERS_1
  name      TEXT NOT NULL,
  league_id TEXT NOT NULL,
  club_id   TEXT NOT NULL,
  tier      TEXT
);

CREATE TABLE npc_source (
  id      TEXT PRIMARY KEY,
  team_id TEXT REFERENCES teams(id),  -- 외래 키: 팀 ID 불일치 시 INSERT 실패
  ...
);
```

`build:masterdb` 실행 시 외래 키 위반으로 즉시 오류 → 불일치를 배포 전에 발견 가능.

### 3-4. 스크립트 구조 변화

```
현재 (35개 스크립트, 일회성 패치 누적):
  gen:npc → migrate:entities → [fix_*] × N → build:masterdb

개선 후:
  gen:npc → build:sourcedb (source.db 직접 생성)
                ↓
           [마이그레이션 파일] migrations/001_initial.js
                                migrations/002_team_ids.js
                                migrations/003_abl_nationality.js
                ↓
           build:masterdb (마이그레이션 적용 → master.db)
```

`fix_*.cjs`, `patch_*.cjs`, `migrate_*.cjs` 파일들이  
번호 붙은 마이그레이션 파일로 정리된다.

---

## 4. 구체적인 구현 요청 포인트

AI에게 구현을 요청할 때 아래 항목 단위로 분리해서 요청하세요.

### Phase A: source.db 생성 스크립트

**요청 내용:**
> `scripts/build_source_db.cjs`를 작성해줘.
> 현재 `resource/data/staging/people_*.json`과 `resource/data/master/teams/**/*.json`을 읽어서
> `resource/source.db` (SQLite)를 생성하는 스크립트야.
> 스키마는 아래와 같고, team_id는 teams 테이블에 대한 외래 키야.
> 
> **현재 코드 참고:**
> - `scripts/generate_master_db.cjs` — entity JSON → SQLite INSERT 로직 (entityToRow 함수)
> - `scripts/migrate-entities.mjs` — staging JSON 구조 파악
> - `apps/desktop/ipc/db.cjs:1289` — masterRowToEntityRow (역방향 참고용)

**현재 staging JSON 구조 (people_kbl.json 예시):**
```json
{
  "entities": [
    {
      "id": "PLY_00001",
      "name": "김철수",
      "leagueId": "LEAGUE_KBL",
      "teamId": "TEAM_KBL_TWINWOLVES_1",
      "clubId": "CLUB_KBL_TWINWOLVES",
      "role": "player",
      "details": {
        "player": {
          "playerType": "pitcher",
          "pitching": { "ovr": 75, "stamina": 72, ... },
          "batting": { "ovr": 20, ... }
        }
      }
    }
  ]
}
```

**목표 source.db 스키마:**
```sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  league_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  tier TEXT,
  city TEXT,
  -- refs.json에 있는 나머지 필드들
  profile_json TEXT,
  history_json TEXT
);

CREATE TABLE npc_source (
  -- generate_master_db.cjs의 npc_master 스키마와 동일하되
  -- team_id에 REFERENCES teams(id) 추가
  id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES teams(id),
  ...
);

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT
);
```

---

### Phase B: 마이그레이션 시스템

**요청 내용:**
> `scripts/migrations/` 폴더 구조와 마이그레이션 러너를 작성해줘.
> 현재 `fix_*.cjs`, `migrate_*.cjs` 스크립트들을 마이그레이션 파일로 변환하는 것도 포함해줘.
>
> **변환 대상 스크립트들:**
> - `scripts/migrate_team_ids.cjs` (7.9KB) — KBL/ABL 팀 ID 리네이밍
> - `scripts/fix_abl_jbl_nationality.cjs` (10.3KB) — 국적 데이터 수정
> - `scripts/backfill_batting_fields.cjs` (1.4KB) — 타격 필드 보완
> - `scripts/patch-pro-service-years.cjs` (3.6KB) — 프로 연차 수정
>
> **마이그레이션 파일 구조 (예시):**
> ```javascript
> // scripts/migrations/002_team_ids.cjs
> module.exports = {
>   version: "002_team_ids",
>   description: "KBL 팀 ID를 실제명 → 가상명으로 변경",
>   up(db) {
>     // 현재 migrate_team_ids.cjs의 로직을 DB UPDATE로 변환
>     db.prepare("UPDATE npc_source SET team_id = ? WHERE team_id = ?")
>       .run("TEAM_KBL_TWINWOLVES_1", "TEAM_KBL_LG_1");
>     // ...
>   },
>   down(db) {
>     // 롤백 (선택적)
>   }
> };
> ```

---

### Phase C: build:masterdb 교체

**요청 내용:**
> 현재 `scripts/generate_master_db.cjs`를 교체하는 새 버전을 작성해줘.
> 기존 버전은 entity JSON 파일(16,449개)을 읽어서 master.db를 생성했어.
> 새 버전은 `source.db`에서 직접 읽어서 마이그레이션을 적용 후 master.db를 생성해야 해.
>
> **현재 코드에서 유지해야 할 로직:**
> - `generate_master_db.cjs:113-147` — generatePersonality 함수 (결정론적 LCG)
> - `generate_master_db.cjs:17-97` — npc_master 테이블 스키마
> - `apps/desktop/ipc/db.cjs:326-364` — master:loadEntities IPC (변경 없음)
>
> **dev:desktop 스크립트 변경 전/후:**
> ```
> 현재: "npm run build:masterdb && ..."
>        → 16,449개 JSON 읽기 (매번 전체)
>
> 개선: "npm run build:masterdb && ..."
>        → source.db 읽기 + 미적용 마이그레이션만 실행
>        → 변경 없으면 master.db 재빌드 스킵 (해시 비교)
> ```

---

### Phase D: refs.json 제거 (선택적)

**요청 내용:**
> 현재 `resource/data/master/entities/refs.json`에 있는 팀/리그/학교 데이터를
> `source.db`의 teams/leagues/schools 테이블로 이전해줘.
>
> **현재 refs.json 로딩 코드:**
> ```javascript
> // apps/ui/src/shared/stores/master.ts:609
> fetchMaster<{ leagues: LeagueRef[]; schools: SchoolRef[]; clubs: ClubRef[]; teams: TeamRef[] }>(
>   "entities/refs.json"
> ),
> ```
>
> **변경 후 로딩 방식 (두 가지 옵션):**
>
> 옵션 1: master.db에 teams/leagues 테이블 추가 → IPC로 조회
> ```javascript
> // main.cjs에 추가
> ipcMain.handle("master:loadRefs", () => {
>   return {
>     teams: masterDb.prepare("SELECT * FROM teams").all(),
>     leagues: masterDb.prepare("SELECT * FROM leagues").all(),
>   };
> });
> ```
>
> 옵션 2: refs.json을 빌드 시 master.db에서 자동 생성
> ```javascript
> // build:masterdb의 마지막 단계에서 refs.json 자동 갱신
> const teams = masterDb.prepare("SELECT * FROM teams").all();
> fs.writeFileSync("resource/data/master/entities/refs.json",
>   JSON.stringify({ teams, leagues, clubs }, null, 2));
> ```
>
> **관련 파일:**
> - `apps/ui/src/shared/stores/master.ts:498-637` — mergeSupplementTeams, fetchMaster
> - `resource/data/master/entities/refs.json` — 현재 소스

---

## 5. 개선 전후 비교

| 항목 | 현재 | 개선 후 |
|---|---|---|
| 데이터 소스 파일 수 | 16,449개 JSON | 1개 SQLite (source.db) |
| 팀 ID 일관성 | 수동 검증 | 외래 키 자동 보장 |
| 패치 스크립트 관리 | 파일 35개, 실행 여부 불명 | 마이그레이션 테이블로 추적 |
| dev 빌드 속도 | 매번 16,449 파일 읽기 | 증분 마이그레이션 |
| 인코딩 문제 | JSON 파일마다 발생 가능 | SQLite 내부 UTF-8 보장 |
| 스크립트 복잡도 | 35개 (계속 증가) | 마이그레이션 N개 + 러너 1개 |

---

## 6. 리스크 및 주의사항

1. **git 관리**: `source.db` (바이너리)를 git에 커밋하면 diff가 안 된다.  
   → 옵션 A: staging JSON은 유지하되 entity JSON만 제거 (중간 단계)  
   → 옵션 B: source.db의 스키마 + INSERT SQL 파일을 git으로 관리

2. **master_overlay.db와의 관계**: 런타임 변경분은 overlay.db에 계속 저장됨.  
   이 구조는 변경 없음.

3. **기존 세이브 데이터 호환**: master.db 스키마가 바뀌면 overlay.db의  
   `entity_overlay` 테이블의 `payload_json`도 마이그레이션 필요.  
   → `apps/desktop/ipc/db.cjs`의 `applySchemaPatches` 함수 참고

4. **Electron 빌드 환경**: `build:masterdb`가 `electron` 실행을 요구함  
   (`"build:masterdb": "electron scripts/generate_master_db.cjs"`).  
   순수 Node.js로 교체 가능한지 확인 필요.

---

## 부록: 현재 IPC 인터페이스 (변경하지 않을 부분)

```javascript
// apps/desktop/main.cjs:326 — 런타임 entity 로딩 (변경 없음)
ipcMain.handle("master:loadEntities", (_event, leagueId, seasonYear, slotId) => {
  const baseRows = masterDb.prepare(
    `SELECT * FROM npc_master WHERE league_id = ? AND ...`
  ).all(leagueId, sy);

  const overlayRows = masterOverlayDb.prepare(
    `SELECT payload_json FROM entity_overlay WHERE slot_id = ? AND league_id = ?`
  ).all(sid, leagueId);

  // base + overlay 병합
  const byId = new Map();
  for (const row of baseRows.map(masterRowToEntityRow)) byId.set(row.id, row);
  for (const row of overlayRows) byId.set(JSON.parse(row.payload_json).id, JSON.parse(row.payload_json));
  return [...byId.values()];
});
```

이 인터페이스는 개선 후에도 동일하게 유지됨.  
변경되는 것은 **master.db가 어디서 왔는가** (JSON 파일 vs source.db)뿐이다.
