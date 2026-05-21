# ProjectB 개발 가이드

## 1. 초기 환경 설정 (최초 1회)

### 필수 설치

**① Visual C++ Build Tools** — Rust MSVC 빌드에 필요
```
https://visualstudio.microsoft.com/visual-cpp-build-tools/
```
설치 시 "C++를 사용한 데스크톱 개발" 워크로드 선택.

**② Rust 툴체인**
```
https://rustup.rs/
```
`rustup-init.exe` 실행 → 기본값(1번) 선택.

설치 후 **CMD에서** 확인:
```cmd
cargo --version
rustup target list --installed   # x86_64-pc-windows-msvc 포함 여부 확인
```

> ⚠️ PowerShell은 PATH 갱신이 느릴 수 있음. cargo가 안 된다면 CMD 사용 또는 터미널 재시작.

**③ npm 패키지 설치**
```powershell
npm install
```

---

## 2. 프로젝트 구조

```
02.SvelteElectron/
├── apps/
│   ├── desktop/
│   │   ├── main.cjs        # Electron 메인 프로세스 (Rust DLL 로드 + IPC 핸들러)
│   │   └── preload.cjs     # window.projectB API 노출 (IPC 브릿지)
│   └── ui/                 # Svelte UI (화면·입력만 담당)
├── packages/
│   ├── engine-native/          # ★ Rust DLL — 게임 본체
│   │   ├── src/
│   │   │   ├── lib.rs              # napi #[napi] export 정의 (진입점)
│   │   │   ├── hmac.rs             # 세이브 HMAC-SHA256 서명
│   │   │   ├── crypto.rs           # 세이브 ChaCha20-Poly1305 암호화
│   │   │   ├── types.rs            # 매치 엔진 공유 타입
│   │   │   ├── tuning.rs           # 매치 엔진 밸런스 상수 (JS 비공개)
│   │   │   ├── match_engine.rs     # 인터랙티브 투구 엔진
│   │   │   ├── sim_types.rs        # NPC 시뮬 공유 타입
│   │   │   ├── npc_sim.rs          # NPC 게임·오프시즌·드래프트 시뮬
│   │   │   ├── growth_engine.rs    # 훈련/경기 성장 계산
│   │   │   ├── player_engine.rs    # 커리어·역할·FA·연봉·드래프트 순위
│   │   │   ├── schedule_engine.rs  # 리그 일정 생성
│   │   │   ├── postseason_engine.rs# 포스트시즌 브래킷/진행
│   │   │   └── week_engine.rs      # 주간 처리 (부상·시설·입시·시험·군복무 등)
│   │   ├── index.js            # Node.js 진입점 (.node 바이너리 로드)
│   │   ├── index.d.ts          # TypeScript 타입 선언 (napi-rs 자동생성)
│   │   └── Cargo.toml          # Rust 의존성
│   ├── core/                   # TypeScript 얇은 래퍼 (IPC 직렬화만)
│   └── contracts/              # 공유 타입
└── resource/
    └── data/master/            # 마스터 데이터 (빌드에 포함)
```

---

## 3. 개발 명령어

### 주요 명령어

| 명령어 | 용도 | 소요 시간 |
|---|---|---|
| `npm run dev` | 전체 개발 서버 시작 (Rust DLL 자동 빌드 포함) | - |
| `npm run build:native` | Rust DLL만 컴파일 | 첫 빌드 ~2분, 증분 ~5~30초 |
| `npm run build:packages` | TypeScript 패키지(core, contracts) 빌드 | ~5초 |
| `npm run build` | 전체 프로덕션 빌드 | - |
| `npm run pack` | 배포용 패키징 (build 포함) | - |

### 자동 빌드 순서

```
npm run dev
  └─ predev: build:native (Rust DLL 자동 컴파일 — 실패해도 dev 진행)
       └─ dev:ui:      gen:manifest → Vite 개발 서버
       └─ dev:desktop: build:packages → Electron 시작
```

---

## 4. 코드 종류별 개발 워크플로우

### Rust 코드 수정 시 (`packages/engine-native/src/*.rs`)

```
Rust 파일 수정
  → npm run dev 재시작  (predev가 자동으로 재컴파일)
  또는
  → npm run build:native  (DLL만 빠르게 재빌드 후 Electron 재시작)
```

cargo는 **증분 빌드**라 변경된 파일만 재컴파일.

### TypeScript/Svelte 수정 시 (`apps/ui/`, `packages/core/`)

```
파일 수정 → Vite HMR 자동 반영 (dev 재시작 불필요)
```

단, `packages/core/` 변경 시:
```
npm run build:packages → Electron 재시작
```

### 마스터 데이터 수정 시 (`resource/data/master/`)

```
데이터 수정 → npm run gen:manifest → dev:ui 재시작
```

---

## 5. 아키텍처 — 보안 설계 원칙

> **Electron은 껍데기, Rust DLL이 프로그램 본체**

### 레이어별 역할

| 레이어 | 역할 | 위치 |
|---|---|---|
| **Svelte UI** | 화면 렌더링, 입력값 전달만 | `apps/ui/` |
| **Electron main** | DLL 로드, IPC 연결, 파일 I/O | `apps/desktop/` |
| **Rust DLL** | 핵심 게임 로직 전체, 암호화, 서명 | `packages/engine-native/src/` |

### Rust DLL에 두어야 하는 것

- 핵심 게임 알고리즘 (성장·연봉·부상·드래프트 확률)
- 모든 `Math.random()` 호출 (→ `rand::thread_rng()`)
- 라이선스 검증 로직 (추후 추가)
- 암호화 키, HMAC 키
- 기간 제한·권한 체크 로직

### Electron/TypeScript에 두면 안 되는 것

- 핵심 확률 계산 (JS에서는 콘솔로 조작 가능)
- 암호화 키 하드코딩
- `bool isLicensed()` 단독 export 패턴
- 보안 관련 if문

---

## 6. Rust DLL에 새 기능 추가하기 (체크리스트)

새 게임 로직을 Rust에 추가할 때마다 아래 6단계를 따릅니다.

### Step 1 — `src/*.rs` 에 함수 작성

```rust
// week_engine.rs 예시
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]   // ★ TS와 camelCase로 맞춤
pub struct MyPayload { pub some_value: f64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyResult { pub output: f64 }

pub fn calc_my_thing(p: MyPayload) -> MyResult {
    let mut rng = rand::thread_rng();   // Math.random() 대신
    MyResult { output: p.some_value * rng.gen::<f64>() }
}
```

### Step 2 — `lib.rs` 에 NAPI export 추가

```rust
#[napi] pub fn my_thing_native(p: String) -> String {
    let params: week_engine::MyPayload = match serde_json::from_str(&p) {
        Ok(v) => v,
        Err(e) => return parse_err("myThingNative", e),
    };
    serde_json::to_string(&week_engine::calc_my_thing(params))
        .unwrap_or_else(|e| parse_err("myThingNative/s", e))
}
```

### Step 3 — `npm run build:native` 로 컴파일

napi-rs가 `index.d.ts`와 `index.js`를 **자동 재생성**합니다.  
생성된 파일을 그대로 커밋하면 됩니다.

### Step 4 — `apps/desktop/main.cjs` 에 IPC 핸들러 추가

```js
ipcMain.handle("week:myThing", (_event, p) => {
    try { return engineNative.myThingNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
});
```

### Step 5 — `apps/desktop/preload.cjs` 에 브릿지 추가

```js
weekMyThing: (p) => ipcRenderer.invoke("week:myThing", p),
```

### Step 6 — `apps/ui/src/shared/types/projectb.d.ts` 타입 추가 + TS에서 호출

```ts
// projectb.d.ts (Window.projectB 인터페이스 안)
weekMyThing: (p: string) => Promise<string>;

// 호출 측 (async 함수 안에서)
const result = JSON.parse(await window.projectB!.weekMyThing(
    JSON.stringify({ someValue: 42 })
)) as { output: number };
```

> ⚠️ IPC는 항상 **`await`** 필수 — `Promise`를 그냥 사용하면 `[object Promise]`가 됩니다.

---

## 7. 자주 발생하는 문제

| 문제 | 원인 | 해결 |
|---|---|---|
| `cargo not found` | PowerShell PATH 미갱신 | CMD 사용 또는 터미널 재시작 |
| `napi not found` | npm install 미실행 | `npm install` |
| `.node 바이너리 없음` 에러 | build:native 미실행 | `npm run build:native` |
| Rust 컴파일 에러 | 코드 버그 | 에러 메시지의 `-->` 줄 확인 후 수정 |
| IPC 결과가 `[object Promise]` | `await` 누락 | 호출부에 `await` 추가 |
| 필드명 불일치 | Rust `snake_case` ↔ TS `camelCase` | `#[serde(rename_all = "camelCase")]` 확인 |
| Svelte 변경이 반영 안 됨 | HMR 오류 | 브라우저 새로고침 또는 dev 재시작 |
| `index.d.ts` 내 함수 없음 | `npm run build:native` 미실행 | Step 3 실행 |
