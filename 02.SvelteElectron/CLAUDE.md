# ProjectB — AI 작업 규칙

## 필독 — 작업 연속성 (세션이 바뀌어도 이것부터)

**설계 정본은 `DESIGN.md`다.** 게임 방향(Lite 경량화)·리그 구조·데이터 아키텍처·로드맵은 전부 그 문서 기준이며, 이 문서(CLAUDE.md)는 코드 작업 규칙만 다룬다.

- 작업 시작 전 **DESIGN.md §10 로드맵**에서 현재 단계를 확인하고 그 단계의 작업만 진행한다.
- 단계(또는 하위 작업) 완료 시 DESIGN.md §10의 체크 표시와 아래 "진행 현황"을 갱신한다.
- DESIGN.md §3 "육성 코어 보호 목록"의 시스템은 경량화 작업에서 수정 금지.
- 아래 "데이터 계층 구조" 절은 **현행(R3 이전) 기준**이다 — R3(slot.db 재구축) 완료 시 DESIGN.md §8이 대체한다.

**진행 현황**: R0 ✅ · R1 ✅ · R2 ✅ (2026-07-02) | **다음: R3a (slot.db 데이터 코어) → R3b (합성 주간 성적 생성기)** — §4.2 B안 확정됨 (Named 전 리그 주간)

## 아키텍처 원칙 (필수 숙지)

**Electron은 껍데기, Rust DLL이 프로그램 본체다.**

| 레이어 | 역할 | 금지 |
|---|---|---|
| `apps/ui/` (Svelte) | 화면 렌더링, 입력값 전달만 | 게임 로직, `Math.random()` |
| `apps/desktop/` (Electron) | DLL 로드, IPC 연결, 파일 I/O | 핵심 알고리즘, 암호화 키, 보안 if문 |
| `packages/engine-native/src/` (Rust) | 게임 본체 — 로직·난수·암호화 전부 | — |

## 절대 금지

- TypeScript/Svelte에서 `Math.random()` 게임 로직에 사용 — Rust `rand::thread_rng()` 사용
- Electron에 암호화 키, 라이선스 판정, `bool isLicensed()` 단독 export 패턴
- `window.projectB!.*()` 호출 시 `await` 누락
- `packages/engine-native/index.d.ts`, `index.js` 직접 편집 — `npm run build:native` 자동 생성
- 팀/구단/리그 ID 하드코딩 맵·인라인 변환(`.replace(/^CLUB_/...)` 류) 작성 — ID 파생 규칙은 `apps/ui/src/shared/utils/ids.ts`에만 둔다 (Rust는 `npc_sim.rs`의 `farm_team()` 접미사 규칙). 팀 ID 정본은 `refs.json`

## Rust에 새 게임 로직 추가 시 — 2단계 (R2에서 개정)

1. `packages/engine-native/src/*.rs` — 함수 작성 + `lib.rs`에 `#[napi]` export (`#[serde(rename_all = "camelCase")]` 필수)
2. `npm run build:native` — `index.d.ts` / `index.js` 자동 재생성

**끝.** main.cjs/preload.cjs/projectb.d.ts 등록 불필요 — `engine:call` 단일 채널이 engine-native export를 화이트리스트로 자동 노출한다.

```typescript
// TS 호출 (신규 함수 — 등록 없이 바로)
const result = JSON.parse(
  await window.projectB!.engine("myFuncNative", JSON.stringify({ someValue: 42 }))
) as MyResultType;
// fnName = index.d.ts의 export 함수명 (camelCase). serde가 camelCase 자동 변환.
```

- 기존 개별 메서드(`window.projectB.simGameNative(p)` 등)는 내부적으로 engine:call을 경유하는 호환 브릿지 — 유지되지만 **신규 추가 금지**.
- `ipcMain.handle` 개별 등록은 DB·파일 I/O·스테이트풀(match) 채널에만 허용 (R3에서 Repository로 재편 예정).

## Rust 함수 패턴

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyPayload { pub some_value: f64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyResult { pub output: f64 }

pub fn calc_my_thing(p: MyPayload) -> MyResult {
    let mut rng = rand::thread_rng();
    MyResult { output: p.some_value * rng.gen::<f64>() }
}
```

## 빌드 규칙

- Rust 수정 후: `npm run build:native` (증분 빌드, ~5~30초) → Electron 재시작
- TS/Svelte 수정: Vite HMR 자동 반영 (dev 재시작 불필요)
- `packages/core/` 수정: `npm run build:packages` → Electron 재시작

## 코드 스타일

- Rust 구조체 필드: `snake_case` (serde가 `camelCase`로 JS에 노출)
- IPC 채널명: `"네임스페이스:funcName"` 형식 (예: `"week:calcExam"`, `"match:pitch"`)
- TS에서 Rust 결과 타입: `as MyType` 명시적 캐스팅
- 주석은 WHY가 명확할 때만, 코드로 알 수 있는 내용은 생략

## 데이터 계층 구조 (혼동 금지) — ⚠ 현행(R3 이전) 기준, R3 완료 시 DESIGN.md §8로 대체

### 세 가지 데이터 저장소

| 저장소 | 위치 | 역할 | 수정 시점 |
|--------|------|------|----------|
| **소스 JSON** | `resource/data/staging/people_*.json` | NPC 생성 스크립트 출력물 | `gen:npc` / `gen:hs-roster` 스크립트만 씀 |
| **개별 JSON** | `resource/data/master/entities/players/*.json` | master.db 빌드 소스 (16,155개) | `migrate-entities` 스크립트만 씀 |
| **master.db** | `resource/master.db` | 런타임 NPC 전체 (read-only) | `build:masterdb` 스크립트만 씀 |
| **master_overlay.db** | `userData/saves/master_overlay.db` | 슬롯별 NPC 변경분 (이적·성장·편집) | 런타임 IPC (`master:upsertEntity` 등) |

### 런타임에서 NPC 데이터 흐름

```
loadEntities() 호출
  → window.projectB.masterLoadEntities() IPC
    → master.db (npc_master 베이스) + master_overlay.db (슬롯 변경분) 병합
    → JS 메모리 반환
```

**개별 JSON 파일(16,155개)은 런타임에서 절대 읽지 않는다.**

### 빌드 파이프라인 (데이터 수정이 필요할 때만)

```
1. npm run gen:npc          → staging/people_*.json 재생성
2. npm run migrate:entities → entities/players/*.json 재생성 + _index.json 갱신
3. npm run build:masterdb   → master.db 재생성
```

### 작업 시 규칙

- `entities/players/*.json` 을 직접 편집하거나 런타임에서 읽는 코드를 작성하지 않는다
- `people_*.json` 은 `staging/` 에만 존재한다 (`master/entities/` 에 두지 않는다)
- NPC 데이터를 런타임에서 변경해야 하면 `master:upsertEntity` IPC → `master_overlay.db` 를 사용한다
- `master:fetch` IPC 는 이벤트·훈련·업적 등 콘텐츠 JSON 전용이다 (NPC 엔티티에 쓰지 않는다)
- `window.projectB` 없는 환경(Vite 단독)에서는 엔티티 로딩이 동작하지 않는다 — `npm run dev` (Electron 포함)로 실행해야 한다