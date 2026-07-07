# ProjectB — AI 작업 규칙

## 필독 — 작업 연속성 (세션이 바뀌어도 이것부터)

**설계 정본은 `DESIGN.md`다.** 게임 방향(Lite 경량화)·리그 구조·데이터 아키텍처·로드맵은 전부 그 문서 기준이며, 이 문서(CLAUDE.md)는 코드 작업 규칙만 다룬다.

- 작업 시작 전 **DESIGN.md §10 로드맵**에서 현재 단계를 확인하고 그 단계의 작업만 진행한다.
- 단계(또는 하위 작업) 완료 시 DESIGN.md §10의 체크 표시와 아래 "진행 현황"을 갱신한다.
- DESIGN.md §3 "육성 코어 보호 목록"의 시스템은 경량화 작업에서 수정 금지.
- 아래 "데이터 계층 구조" 절은 R3a 완료 후 v3 확정 기준으로 갱신됨.

**진행 현황**: R0 ✅ · R1 ✅ · R2 ✅ · R3a 전체 완료(데이터 코어 + 구시스템 철거 + 실행 스모크) ✅ (2026-07-07) | **다음: R4(advanceWeek 분해) → R3b(합성 생성기) → R5**
- 세이브 무결성(HMAC) v3 미구현 상태 — 별도 작업 필요 (DESIGN.md §8.4)

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

## 데이터 계층 구조 (혼동 금지) — v3 확정 (R3a 완료, 2026-07-07). 상세는 DESIGN.md §8

### 세 가지 데이터 저장소

| 저장소 | 위치 | 역할 | 수정 시점 |
|--------|------|------|----------|
| **master.db** | `resource/master.db` | 콘텐츠(이벤트·템플릿·밸런스) + **스태프**(코치/감독/구단주, `entities/players/COA_·MNG_·OWN_*.json` 373개가 소스) 전용. read-only | `npm run build:masterdb`만 씀 |
| **slot.db** | `userData/saves/slot3_<id>.db` (파일=슬롯) | **선수(NPC) 전부의 유일한 정본**. 정체성+팀+계약+능력치+XP가 `npc` 테이블 1행에 동거 | `repo:call`(→`shared/repo/slotRepo.ts`) 커맨드만 씀 — 직접 접근 금지 |
| (폐기됨) | ~~master_overlay.db~~ / ~~entities/players/PLY_*.json~~ / ~~projectb_v2.db~~ | — | R3a-4d에서 완전 제거. 재도입 금지 |

### 런타임에서 NPC 데이터 흐름

```
새 게임/리그 활성화
  → Rust generate_league_roster_native (worldSeed 결정적)
    → slotRepo.createSlot / insertNpcs → slot.db npc 테이블 INSERT

이후 모든 상태 변경 (이적/드래프트/FA/입대/은퇴/주간 성장)
  → shared/repo/slotRepo.ts 의 타입드 커맨드
    (transfer/swapTeams/assignDraft/enlist/discharge/retire/updateWeekly)
    → main 프로세스 repo:call → apps/desktop/ipc/slotdb.cjs → SQLite 트랜잭션 1개
```

**선수 데이터를 JSON 파일로 사전 생성하지 않는다. 전부 런타임에 Rust가 생성한다.**
**overlay나 npc_runtime 같은 별도 "변경분" 저장소를 만들지 않는다 — slot.db가 유일 정본이다.**

### 작업 시 규칙

- NPC(선수) 상태를 바꾸는 코드는 반드시 `shared/repo/slotRepo.ts`의 커맨드를 거친다. `window.projectB.repo(...)` 직접 호출 금지(레이어 우회).
- 새로운 상태 변이가 필요하면 `apps/desktop/ipc/slotdb.cjs`의 `commands`에 커맨드를 추가하고(트랜잭션 1개로), `slotRepo.ts`에 타입드 래퍼를 노출한다.
- `entities/players/`에는 스태프(COA_/MNG_/OWN_) 원본만 남아 있다. 여기에 선수(PLY_) JSON을 다시 추가하지 않는다.
- `master:fetch` IPC는 이벤트·훈련·업적 등 콘텐츠 JSON 전용이다 (NPC에 쓰지 않는다 — 애초에 NPC는 master.db에 없음).
- 레거시 채널(`npc:getByLeague`/`swapTeams`/`updateContracts`, `league:add/getTransactions`)은 내부적으로 slotdb 커맨드를 감싸는 호환 래퍼다 — 신규 코드는 여기 의존하지 말고 `slotRepo`를 직접 쓴다.
- `window.projectB` 없는 환경(Vite 단독)에서는 저장/로드가 동작하지 않는다 — `npm run dev` (Electron 포함)로 실행해야 한다.
- ⚠ **세이브 무결성(HMAC 변조 감지) 미구현** — v2의 signSlot/verifySlot은 R3a-4d에서 제거됐고 v3에 아직 대체 기능 없음. 필요 시 새로 설계할 것 (DESIGN.md §8.4 참고).