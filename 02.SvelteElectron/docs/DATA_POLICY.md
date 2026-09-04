# 데이터 관리 규약

> **이 문서의 존재 이유**: "JSON을 쓰자 → 쓰지 말자 → 다시 쓰자"가 반복되면서
> 폐기된 접근의 잔재가 리포지토리에 쌓였다. 어떤 데이터가 **어디에** 있고
> **누가 언제** 고치는지를 한 곳에 고정한다.
>
> 확정: 2026-07-29 (정리 Phase 4-2) · 상위: [DESIGN.md §8](../DESIGN.md) · 인물: [design/people.md](design/people.md)

## 0. 한 줄 요약

**데이터는 3종류뿐이다. ①정의는 git에, ②상태는 슬롯에, ③파생은 아무 데도 저장하지 않는다.**

---

## 1. 3분류

| | ① 정의 (Definition) | ② 상태 (State) | ③ 파생 (Derived) |
|---|---|---|---|
| **무엇** | 세계가 시작하기 전에 정해진 것 | 플레이하면서 변하는 것 | ①②에서 계산되는 것 |
| **저장소** | `resource/data/master/**` JSON (read-only) | `slot.db` (슬롯당 파일 1개) | **메모리만** |
| **git** | ⭕ 소스(CSV/TOML) + 콘텐츠 JSON | ❌ | ❌ |
| **수정 시점** | 파일을 직접 고친다 (목록만 `gen:manifest`) | 런타임 (repo 커맨드) | 매번 재계산 |
| **예** | 팀·구장·학교·리그 · 팀 특성 3슬롯 · 전력★ · 과거 5시즌 순위 · 라이벌 · 이벤트 · 업적 · 생성 규칙 · 이름 풀 · 밸런스 상수 | 선수 · 스태프 · 주인공 · 일정 · 순위 · 시즌 성적 · 거래 기록 · 관계도 | OVR · 팀 현재 전력 · 순위표 정렬 · 화면 표시용 집계 |

### 1-1. 판별 기준 — 셋 중 어디인가

```
새 게임을 다시 시작해도 똑같은가?
├─ 예 → ① 정의          (resource/data/master/**)
└─ 아니오
    └─ 저장을 안 하면 잃어버리는가?
        ├─ 예   → ② 상태  (slot.db)
        └─ 아니오 → ③ 파생 (메모리, 저장 금지)
```

---

## 2. ① 정의 — `resource/data/master/**`

> ⚠ **2026-09-04에 `master.db` 를 접었다**(사용자 확정). 예전엔 소스를
> `npm run build:masterdb` 로 SQLite 한 파일에 구웠는데, 실제로 그 DB 에
> 남아 있던 표는 `npc_master` 하나였고 Phase 6A 이후 **0행**이었다 —
> 콘텐츠는 진작부터 `resource/data/master/**` JSON 을 `master:fetch` 로
> 직접 읽고 있었다. 빈 DB 가 「없어도 조용히 지나가는」 자리를 만들어
> **「빈 게 정상」과 「빌드가 빠졌다」가 같아 보였다.** 그래서 지웠다.

### 2-1. 소스 포맷

| 성격 | 포맷 | 예 |
|---|---|---|
| **표** (행 많고 열 고정) | **CSV** | `teams.csv` · `schools.csv` · `stadiums.csv` · `team_traits.csv` · `team_season_ranks.csv` · `name_pools.csv` |
| **규칙** (중첩·가변) | **TOML** | `generation_rules.toml` · `personality_rules.toml` · `staff_rules.toml` |
| **콘텐츠** (본문·선택지) | JSON | 이벤트 · 업적 · 메시지 템플릿 |

- 목록: `npm run gen:manifest` → `resource/data/master/_manifest.json`
  (폴더를 훑어 만드는 **목록 파일**이다. 콘텐츠 자체는 굽지 않는다)
- 읽기: `master:fetch` IPC 하나 — `resource/data/master/` 아래 상대경로로만 연다.
- CSV/TOML 시드는 `resource/data/seeds/` 에 두고, 화면·엔진이 쓰는 형태로
  옮긴 결과물(`leagueTeams.generated.ts` 등)은 git 에 커밋한다.

### 2-2. 금지

> ❌ **선수·스태프를 미리 만들어 파일로 저장하지 않는다.**

과거 이 규칙이 없어서:
- 선수 JSON **16,075개**가 git에 있었고 `_index.json`이 **51회**, `_manifest.json`이 **49회** 커밋됐다
- 결과물을 사후 수정하는 스크립트가 **23개** 생겼다
  (`fix-ages-and-names` · `rebalance_ovr_distribution` · `patch-pro-service-years` …)
- 스태프 **373개**는 R3a-4d를 살아남았다가 Phase 4-5에서 정리됐다

**대신 생성 "규칙"을 고친다.** 규칙을 고치면 새 게임에 즉시 반영된다.
결과물이 없으므로 사후 패치할 대상 자체가 존재하지 않는다.

> ❌ **`_index.json` 류의 수동 동기화 파일을 만들지 않는다.** 목록이 필요하면 DB에 질의한다.

---

## 3. ② 상태 — slot.db

### 3-1. 파일 = 슬롯

`userData/saves/slot3_<id>.db` — 백업·삭제 = 파일 복사·삭제. 슬롯 간 오염이 구조적으로 불가능.

### 3-2. 스키마 변경은 반드시 마이그레이션으로

```js
// apps/desktop/ipc/slotdb.cjs
MIGRATIONS.push({
  v: <다음번호>,
  name: "무엇을 왜",
  up(db) { addColumn(db, "npc", "새컬럼", "TEXT"); },
});
```

- 정본 = `PRAGMA user_version`. `meta.schema_version`은 **사람이 읽는 사본**일 뿐 판정에 쓰지 않는다.
- `up()`은 **재실행해도 안전**해야 한다 — `addColumn` 헬퍼가 존재 여부를 검사한다.
- `user_version` 갱신은 **러너가 전담**한다. `up()` 안에서 건드리지 말 것.
- 버전 확인과 적용은 **하나의 IMMEDIATE 트랜잭션**이다. 나누면 두 커넥션이 같은 ALTER를 두 번 실행한다.
- 검증: `npm run test:migration`

> ⚠ `CREATE TABLE IF NOT EXISTS`만으로 컬럼을 추가하려 하지 말 것. 기존 슬롯에 **조용히 반영되지 않는다.**

### 3-3. 상태 변이는 repo 커맨드로만

```
게임 로직  →  shared/repo/slotRepo.ts  →  repo:call  →  slotdb.cjs 커맨드  →  트랜잭션 1개
```

- `window.projectB.repo(...)` **직접 호출 금지** (레이어 우회).
- 새 변이가 필요하면 `slotdb.cjs`의 `commands`에 추가하고 `slotRepo.ts`에 타입드 래퍼를 노출한다.
- 커맨드 1개 = 트랜잭션 1개. 실패하면 전체 롤백, 부분 성공 없음.

### 3-4. 선수와 스태프는 다른 테이블

| 테이블 | 대상 |
|---|---|
| `npc` | **선수만** |
| `staff` | 감독 · 코치 · 구단주 |
| `person` (VIEW) | 공통 조회 — 관계도 · 이름 표시 · 거래 기록 |

**`SELECT * FROM npc`이 스태프를 집으면 안 된다.** 같은 테이블에 두고 `position` 필터로 거르는 방식은
필터를 잊는 순간 감독이 타순에 서고 피로도가 쌓인다 — 실제로 5회 이상 발생한 패턴이다
([design/people.md §1-2](design/people.md)).

---

## 4. ③ 파생 — 저장하지 않는다

OVR · 팀 현재 전력 · 순위표 정렬 · 화면 집계는 **매번 ①②에서 재계산**한다.

- 스토어는 파생값의 **얇은 반응형 캐시**일 뿐이다.
- 파생값을 slot.db에 쓰면 원본과 어긋나는 순간을 만든다 — 과거 "트레이드 0건", "화면·DB 불일치"의 원인.

---

## 5. 코드 배치 규칙

### 5-1. 게임 로직은 store에 쓰지 않는다

| 위치 | 역할 | 금지 |
|---|---|---|
| `shared/stores/*.ts` | 상태 보관 + **얇은 패처** | 게임 로직 · 오케스트레이션 · 다단계 판정 |
| `shared/usecases/**` | 게임 로직 · 주간/시즌 오케스트레이션 | — |
| `shared/utils/*Engine.ts` | 순수 계산 엔진 | DB 접근 · 스토어 접근 |
| `shared/repo/*.ts` | 상태 읽기/쓰기 유일 접점 | 게임 판정 |
| `packages/engine-native/src/*.rs` | 난수 · 핵심 알고리즘 · 암호화 | — |

**판별**: 메서드가 `update(s => ({...s, 필드: 값}))` 한 줄이면 store에 둬도 된다.
그보다 길거나 **다른 시스템을 호출하면** `usecases/`로 간다.

> 이 규칙이 없어서 `stores/game.ts`가 2,579줄이 됐고 그중 `processAllLeaguesSeasonEnd` 하나가 **566줄**이다.
> 시즌 경계 오케스트레이션이 스토어 안에 들어있는 상태다 — Phase 5에서 `usecases/seasonEnd/`로 옮긴다.

### 5-2. 동작 변경 없는 순수 이동은 하지 않는다

리팩터만을 위한 리팩터는 회귀 위험만 있고 이득이 없다.
**그 도메인을 어차피 손볼 때** 함께 옮긴다.

---

## 6. 체크리스트 — 데이터를 추가할 때

- [ ] ①②③ 중 어디인가? (§1-1 판별 기준)
- [ ] ①이면: `resource/data/master/` 아래 파일로 넣고 `gen:manifest` 목록에 잡히는가? (새 폴더면 로더도 봐야 한다)
- [ ] ②이면: 마이그레이션을 추가했는가? `up()`이 재실행 안전한가? `npm run test:migration` 통과하는가?
- [ ] ②이면: repo 커맨드를 거치는가? 스토어에서 직접 쓰고 있진 않은가?
- [ ] ③이면: 저장하려 하고 있진 않은가?
- [ ] 로직을 store에 쓰고 있진 않은가? (§5-1)

---

## 7. 폐기 목록 (되살리지 말 것)

| 폐기된 것 | 언제 | 왜 |
|---|---|---|
| `master_overlay.db` | R3a-4d | 정적 베이스 + 슬롯 델타 이중 구조 → 3자 병합 지옥 |
| `npc_runtime` 테이블 | R3a | 정체성 중복 + 능력치 컬럼 NULL 방치 → "트레이드 0건" |
| `projectb_v2.db` | R3a | 단일 DB + slot_id 컬럼 → 슬롯 간 오염 |
| 선수 JSON 사전 생성 (`PLY_*` 16,075) | R3a-4d | git 핫스팟 · 사후 패치 스크립트 양산 |
| 스태프 JSON (`COA_`/`MNG_`/`OWN_` 373) | Phase 4-5 | 위와 같은 이유. 손 저작물이 아니라 스크립트 생성물이었음 |
| `_index.json` · `_manifest.json` 수동 동기화 | Phase 4-5 | 100회 커밋된 핫스팟 |
| `resource/data/seeds/v1/` · `runtime/` | Phase 4-5 | v1 시절 잔재, 참조 0건 |
| 사후 패치 스크립트 23개 | Phase 4-5 | "결과물을 스크립트로 땜질"하는 패턴 그 자체 |
